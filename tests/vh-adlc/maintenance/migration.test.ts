import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adoptionPreflight } from "../../../plugins/vh-adlc/scripts/maintenance/migration";
import { applyRuntimeRevision } from "./migration";
import { digest } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { fixture, git } from "./fixtures";

const projects: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
function project() { const f = fixture(); projects.push(f); return f; }
function receiptFixture(f: ReturnType<typeof fixture>) {
  const artifact = (name: string, text: string) => { f.write(`evidence/${name}`, text); return { path: name, sha256: digest(text) }; };
  const expected = { shared_repository: "example/shared", reviewed_shared_commit: "a".repeat(40), published_source_commit: "d".repeat(40), consumer_repository: "example/consumer", consumer_commit: "b".repeat(40), version: "0.5.0", payload_digest: "c".repeat(64), review_model: "claude-opus-5.5" };
  const command = (name: string, argv: string[]) => ({ argv, exit_code: 0, transcript: artifact(`${name}.jsonl`, JSON.stringify({ fixture: true, argv, exit_code: 0 })) });
  const common = { source: "published-marketplace", catalog_repository: expected.shared_repository, published_source_commit: "d".repeat(40), version: expected.version, payload_digest: expected.payload_digest, isolated_profile: true };
  const hosts = ["codex-cli", "claude-cli"].map(host => ({ host, ...common, install: command(`${host}-install`, [host, "plugin", "install", "vh-adlc"]),
    discovery: { operation: "vh-adlc-maintenance", command: command(`${host}-discovery`, [host, "plugin", "list"]) },
    helpers: ["settings", "collection", "report"].map(stage => ({ stage, command: command(`${host}-${stage}`, ["bun", "installed/scripts/maintenance/cli.ts", stage === "collection" ? "collect" : stage]),
      input_before_digest: "e".repeat(64), input_after_digest: "e".repeat(64), index_before_digest: "f".repeat(64), index_after_digest: "f".repeat(64) })) }));
  const receipt = { schema_version: 1, operation: "vh-adlc-maintenance", kind: "published-marketplace", recorded_at: "2026-10-29T12:00:00Z", ...expected,
    published_source_commit: "d".repeat(40), hosts, paired_review: { shared_commit: expected.reviewed_shared_commit, consumer_commit: expected.consumer_commit, model: expected.review_model, result: "no-blocking-findings", artifact: artifact("paired-review.txt", "Fixture parser record; this is not an observed native review.\n") } };
  return { expected, receipt, artifact_root: join(f.root, "evidence") };
}

test("adoption preflight denies absent and local-catalog proof before any consumer cutover", () => {
  const f = project(), inputs = receiptFixture(f);
  expect(adoptionPreflight({ ...inputs, receipt: undefined }).pass).toBe(false);
  expect(adoptionPreflight({ ...inputs, receipt: { ...inputs.receipt, kind: "local-catalog" } }).pass).toBe(false);
  expect(adoptionPreflight({ ...inputs, receipt: { ...inputs.receipt, hosts: inputs.receipt.hosts.map(row => ({ ...row, source: "local-catalog" })) } }).pass).toBe(false);
});

test("the valid receipt fixture exercises parsing without establishing actual publication", () => {
  const f = project(), inputs = receiptFixture(f), before = git(f.root, "status", "--porcelain");
  const result = adoptionPreflight(inputs); expect(result.pass).toBe(true); expect(result.limit).toContain("attestations");
  expect(git(f.root, "status", "--porcelain")).toBe(before);
});

test("wrong or stale source, consumer, version, model and payload receipts deny adoption", () => {
  const f = project(), inputs = receiptFixture(f);
  for (const change of [{ reviewed_shared_commit: "1".repeat(40) }, { consumer_commit: "2".repeat(40) }, { version: "0.4.1" }, { payload_digest: "3".repeat(64) }, { shared_repository: "wrong/shared" }]) {
    expect(adoptionPreflight({ ...inputs, receipt: { ...inputs.receipt, ...change } }).pass).toBe(false);
  }
  const wrongModel = structuredClone(inputs.receipt); wrongModel.paired_review.model = "other-model";
  expect(adoptionPreflight({ ...inputs, receipt: wrongModel }).pass).toBe(false);
  const staleInstall = structuredClone(inputs.receipt); staleInstall.hosts[0].published_source_commit = "4".repeat(40);
  expect(adoptionPreflight({ ...inputs, receipt: staleInstall }).pass).toBe(false);
});

test("missing hosts/helpers, dirty source, failed native commands and changed evidence cannot pass", () => {
  const f = project(), inputs = receiptFixture(f);
  const variants = [structuredClone(inputs.receipt), structuredClone(inputs.receipt), structuredClone(inputs.receipt), structuredClone(inputs.receipt), structuredClone(inputs.receipt)];
  variants[0].hosts.pop(); variants[1].hosts[0].helpers.pop(); variants[2].hosts[0].helpers[0].input_after_digest = "0".repeat(64);
  variants[3].hosts[0].install.exit_code = 1; variants[4].hosts[0].discovery.operation = "vh-adlc-triage";
  for (const receipt of variants) expect(adoptionPreflight({ ...inputs, receipt }).pass).toBe(false);
  writeFileSync(join(inputs.artifact_root, "codex-cli-install.jsonl"), "changed transcript");
  expect(adoptionPreflight(inputs).pass).toBe(false);
});

test("runtime rollback and reapplication preserve unrelated source and raw index bytes", () => {
  const f = project(), base = join(import.meta.dir, "fixtures/migration");
  const runtime = ["AGENTS.md", "agents/maintenance.md", ".claude/commands/maintenance.md", ".vh-adlc/maintenance.json", "maintenance-project.md"];
  for (const path of runtime.slice(0, 3)) f.write(path, readFileSync(join(base, "legacy", path), "utf8"));
  f.write("agents/audit.md", "consumer-only audit\n"); f.write("docs/specific.md", "consumer docs workflow\n");
  git(f.root, "add", "AGENTS.md", "agents", ".claude", "docs"); git(f.root, "commit", "-qm", "test: legacy maintenance");
  const baseline = git(f.root, "rev-parse", "HEAD");
  for (const path of runtime) f.write(path, readFileSync(join(base, "shared", path), "utf8"));
  git(f.root, "add", ...runtime); git(f.root, "commit", "-qm", "test: shared maintenance adapter"); const adapter = git(f.root, "rev-parse", "HEAD");
  f.write("staged.txt", "unrelated staged bytes\n"); git(f.root, "add", "staged.txt"); f.write("src/app.ts", "unrelated working bytes\n"); f.write("scratch.txt", "untracked bytes\n");
  const index = readFileSync(join(f.root, ".git/index")), files = ["staged.txt", "src/app.ts", "scratch.txt", "agents/audit.md", "docs/specific.md"].map(path => [path, readFileSync(join(f.root, path))] as const);
  applyRuntimeRevision(f.root, { from: adapter, to: baseline, paths: runtime });
  expect(readFileSync(join(f.root, "agents/maintenance.md"), "utf8")).toContain("local legacy");
  expect(readFileSync(join(f.root, ".git/index"))).toEqual(index);
  applyRuntimeRevision(f.root, { from: baseline, to: adapter, paths: runtime });
  expect(readFileSync(join(f.root, "agents/maintenance.md"), "utf8")).toContain("vh-adlc-maintenance");
  expect(readFileSync(join(f.root, ".git/index"))).toEqual(index);
  for (const [path, bytes] of files) expect(readFileSync(join(f.root, path))).toEqual(bytes);
});

test("an overlapping runtime edit or staged change blocks rollback before modifying any path", () => {
  const f = project(); f.write("AGENTS.md", "legacy\n"); f.write("agents/maintenance.md", "legacy\n"); git(f.root, "add", "AGENTS.md", "agents"); git(f.root, "commit", "-qm", "test: legacy"); const baseline = git(f.root, "rev-parse", "HEAD");
  f.write("AGENTS.md", "shared\n"); f.write("agents/maintenance.md", "shared\n"); git(f.root, "add", "AGENTS.md", "agents"); git(f.root, "commit", "-qm", "test: adapter"); const adapter = git(f.root, "rev-parse", "HEAD");
  f.write("agents/maintenance.md", "concurrent edit\n"); const index = readFileSync(join(f.root, ".git/index"));
  expect(() => applyRuntimeRevision(f.root, { from: adapter, to: baseline, paths: ["AGENTS.md", "agents/maintenance.md"] })).toThrow();
  expect(readFileSync(join(f.root, "AGENTS.md"), "utf8")).toBe("shared\n"); expect(readFileSync(join(f.root, "agents/maintenance.md"), "utf8")).toBe("concurrent edit\n"); expect(readFileSync(join(f.root, ".git/index"))).toEqual(index);
});

test("adoption denial does not echo unreadable host paths and wrong helper commands cannot count", () => {
  const f = project(), inputs = receiptFixture(f), sentinel = "private-path-sentinel";
  const missing = adoptionPreflight({ ...inputs, artifact_root: join(f.root, sentinel) }); expect(missing.pass).toBe(false); expect(JSON.stringify(missing)).not.toContain(sentinel);
});

test("an unrelated command cannot stand in for installed helper execution", () => {
  const f = project(), inputs = receiptFixture(f);
  const wrong = structuredClone(inputs.receipt); wrong.hosts[0].helpers[0].command.argv = ["true"];
  expect(adoptionPreflight({ ...inputs, receipt: wrong }).pass).toBe(false);
});
