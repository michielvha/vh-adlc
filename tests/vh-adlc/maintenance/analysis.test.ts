import { randomUUID } from "node:crypto";
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { capturePendingOutcome, pendingOutcomes } from "../../../plugins/vh-adlc/scripts/maintenance/artifacts";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/maintenance/settings";
import { appendRun, canonicalJSON, createRun, digest, readRun } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { fixture, git } from "./fixtures";
import { exportAnalysisInput, verifyAnalysisInput } from "../../../plugins/vh-adlc/scripts/maintenance/analysis-input";
import { syntheticCorpus } from "./fixtures/corpus";
import { gradeAssessment, passingAssessment } from "./trial-proof";

const projects: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
const cli = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/maintenance/cli.ts");
function invoke(root: string, operation: string, values: string[] = [], env = process.env) {
  const result = Bun.spawnSync([process.execPath, cli, operation, "--repo", root, ...values], { env, stdout: "pipe", stderr: "pipe" });
  return { exit: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
}
test("portable CLI rejects mutators, unknown/duplicate flags and invalid scope before writes", () => {
  const f = fixture(); projects.push(f); const head = git(f.root, "rev-parse", "HEAD");
  for (const command of ["execute", "push", "merge", "close"]) expect(invoke(f.root, command).exit).toBe(1);
  expect(invoke(f.root, "settings", ["--repo", f.root]).exit).toBe(1);
  expect(invoke(f.root, "settings", ["--unknown", "value"]).exit).toBe(1);
  expect(invoke(f.root, "start", ["--pull", "-2"]).exit).toBe(1);
  expect(existsSync(join(f.root, ".git/vh-adlc"))).toBe(false);
  expect(git(f.root, "rev-parse", "HEAD")).toBe(head);
});

test("CLI start/resume persists one narrowed run and no-filesystem mode creates no journal", () => {
  const f = fixture(); projects.push(f); f.write("request.json", JSON.stringify({ authorized_sweep: true, no_filesystem: true }));
  const chat = invoke(f.root, "start", ["--request", join(f.root, "request.json")]); expect(chat.exit).toBe(0); expect(JSON.parse(chat.out).persisted).toBe(false);
  expect(existsSync(join(f.root, ".git/vh-adlc"))).toBe(false);
  const start = invoke(f.root, "start", ["--repository", "example/project", "--pull", "7"]); expect(start.exit).toBe(0);
  const run = JSON.parse(start.out); expect(run.header.scope).toEqual({ repositories: ["example/project"], pull: 7 });
  const resume = invoke(f.root, "resume", ["--run-id", run.header.run_id]); expect(resume.exit).toBe(0); expect(JSON.parse(resume.out).digest).toBe(run.digest);
});

test("the synthetic packet uses actual CLI GET collection and preserves source/index while exporting frozen inputs", () => {
  const corpus = syntheticCorpus(); projects.push(corpus.project);
  const collected = invoke(corpus.project.root, "collect", [], corpus.env); expect(collected.exit).toBe(0);
  const inventory = JSON.parse(collected.out), before = git(corpus.project.root, "status", "--porcelain"), index = readFileSync(join(corpus.project.root, ".git/index"));
  const packet = exportAnalysisInput(corpus.config, { ...corpus.packet, inventory, collection_receipt: { argv: [process.execPath, cli, "collect", "--repo", corpus.project.root], exit_code: collected.exit, requests_digest: corpus.requestsDigest() } });
  const verified = verifyAnalysisInput(packet.path); expect(verified.pass).toBe(true);
  expect(verified.manifest.synthetic_input).toBe(true); expect(verified.manifest.source_commit).toBe(inventory.source_commit);
  expect(git(corpus.project.root, "status", "--porcelain")).toBe(before); expect(readFileSync(join(corpus.project.root, ".git/index"))).toEqual(index);
  expect(corpus.requests().every(row => row.argv.includes("GET"))).toBe(true);
  expect(existsSync(join(packet.path, ".tools"))).toBe(false);
  expect(inventory.repositories[0].code_scanning.coverage.status).toBe("complete-unavailable");
  expect(inventory.repositories.find((row: any) => row.repository === "example/partial").dependabot.coverage.status).toBe("incomplete");
});

test("packet integrity rejects changed, missing, extra and symbolic-link inputs", () => {
  const corpus = syntheticCorpus(); projects.push(corpus.project);
  const collected = invoke(corpus.project.root, "collect", [], corpus.env), inventory = JSON.parse(collected.out);
  const packet = exportAnalysisInput(corpus.config, { ...corpus.packet, inventory, collection_receipt: { argv: [process.execPath, cli, "collect"], exit_code: 0, requests_digest: corpus.requestsDigest() } });
  const manifest = JSON.parse(readFileSync(join(packet.path, "manifest.json"), "utf8")), first = join(packet.path, manifest.files[0].path);
  const original = readFileSync(first); writeFileSync(first, "changed input"); expect(verifyAnalysisInput(packet.path).pass).toBe(false);
  writeFileSync(first, original); unlinkSync(first); expect(verifyAnalysisInput(packet.path).pass).toBe(false);
  writeFileSync(first, original, { mode: manifest.files[0].mode }); writeFileSync(join(packet.path, "extra.txt"), "not declared"); expect(verifyAnalysisInput(packet.path).pass).toBe(false);
  unlinkSync(join(packet.path, "extra.txt")); unlinkSync(first); symlinkSync(join(corpus.project.root, "src/app.ts"), first); expect(verifyAnalysisInput(packet.path).pass).toBe(false);
});

test("graders require every exact item/class and cited input, with no invented collection or live actions", () => {
  const corpus = syntheticCorpus(); projects.push(corpus.project); const collected = invoke(corpus.project.root, "collect", [], corpus.env); expect(collected.exit).toBe(0); corpus.bindInventory(JSON.parse(collected.out)); const good = passingAssessment(corpus.cases);
  expect(gradeAssessment(good, corpus.cases, corpus.evidence).pass).toBe(true);
  const variants = [
    { ...good, items: good.items.slice(1) },
    { ...good, items: good.items.map((row, index) => index ? row : { ...row, classification: "migration" }) },
    { ...good, items: good.items.map((row, index) => index ? row : { ...row, evidence: [] }) },
    { ...good, items: good.items.map((row, index) => index ? row : { ...row, proposal: "merge-now" }) },
    { ...good, collection_basis: "fresh-model-collection" }, { ...good, live_readiness: true }, { ...good, executed_actions: [{ action: "close", number: 17 }] },
  ];
  for (const bad of variants) expect(gradeAssessment(bad, corpus.cases, corpus.evidence).pass).toBe(false);
  const unavailable = good.items.findIndex(row => row.id === "coverage:example/project:code_scanning");
  const contradiction = structuredClone(good); contradiction.items[unavailable].measured_count = 0;
  expect(gradeAssessment(contradiction, corpus.cases, corpus.evidence).pass).toBe(false);
});

test("pending outcomes persist ordered immutable private artifacts without touching an unpushed report", () => {
  const f = fixture(); projects.push(f); const c = loadSettings(f.root), run = createRun(c), reportPath = join(f.root, "report.md");
  f.write("report.md", "unpublished report\n"); const current = readRun(c, run.header.run_id);
  appendRun(c, run.header.run_id, current, { ...current.state, report: { path: reportPath, digest: digest("unpublished report\n"), pending_publication: true } });
  const first = { step_id: randomUUID(), at: "2026-10-29T12:00:00Z", append: "First outcome" }, second = { ...first, step_id: randomUUID(), append: "Second outcome" };
  const a = capturePendingOutcome(c, run.header.run_id, first); capturePendingOutcome(c, run.header.run_id, second);
  expect(capturePendingOutcome(c, run.header.run_id, first)).toEqual(a);
  expect(() => capturePendingOutcome(c, run.header.run_id, { ...first, append: "Different bytes" })).toThrow("conflict");
  expect(pendingOutcomes(c, run.header.run_id).map(row => row.outcome.ordered_append_text)).toEqual(["First outcome", "Second outcome"]);
  expect(readFileSync(reportPath, "utf8")).toBe("unpublished report\n");
  const child = invoke(f.root, "pending-outcomes", ["--run-id", run.header.run_id]); expect(child.exit).toBe(0);
  expect(JSON.parse(child.out).length).toBe(2); expect(git(f.root, "log", "--format=%s")).toBe("test: seed project");
});

test("CLI private reports retain collection and request bindings for fresh-process continuation", () => {
  const corpus = syntheticCorpus(); projects.push(corpus.project); const f = corpus.project;
  const collected = invoke(f.root, "collect", [], corpus.env); expect(collected.exit).toBe(0);
  const inventory = JSON.parse(collected.out); f.write("inputs/inventory.json", collected.out); f.write("inputs/request.json", JSON.stringify({ authorized_sweep: true, read_only: true }));
  git(f.root, "update-ref", "refs/remotes/origin/main", inventory.source_commit);
  const index = readFileSync(join(f.root, ".git/index")), status = git(f.root, "status", "--porcelain");
  const result = invoke(f.root, "report", ["--run-id", corpus.packet.run_id, "--inventory", join(f.root, "inputs/inventory.json"), "--default-commit", inventory.source_commit, "--request", join(f.root, "inputs/request.json")]);
  expect({ exit: result.exit, error: result.err }).toEqual({ exit: 0, error: "" });
  const saved = JSON.parse(result.out); expect(saved.kind).toBe("private-draft");
  const resumed = invoke(f.root, "resume", ["--run-id", corpus.packet.run_id]);
  const current = JSON.parse(resumed.out); expect(current.state.request.read_only).toBe(true);
  expect(JSON.parse(readFileSync(current.state.collection.path, "utf8")).inventory).toEqual(inventory);
  expect(git(f.root, "status", "--porcelain")).toBe(status); expect(readFileSync(join(f.root, ".git/index"))).toEqual(index);
});

test("invalid request booleans and null publication cannot create a new run", () => {
  const f = fixture(); projects.push(f);
  for (const request of [{ authorized_sweep: true, no_filesystem: "false" }, { authorized_sweep: true, publication: null }]) {
    f.write("request.json", JSON.stringify(request)); expect(invoke(f.root, "start", ["--request", join(f.root, "request.json")]).exit).toBe(1);
    expect(existsSync(join(f.root, ".git/vh-adlc"))).toBe(false);
  }
});

test("a pending-outcome intent retains its exact data before artifact publication", () => {
  const f = fixture(); projects.push(f); const c = loadSettings(f.root), run = createRun(c), step = randomUUID();
  const outcome = { step_id: step, at: "2026-10-29T12:00:00Z", append: "An observed result that must survive" };
  const payload = { kind: "pending-outcome", at: outcome.at, ordered_append_text: outcome.append, status: null, status_description: null, prior_report_digest: "a".repeat(64) };
  const pending_payload = { ...payload, payload_digest: digest(canonicalJSON(payload)) }, value = { schema_version: 1, run_id: run.header.run_id, step_id: step, ...pending_payload };
  const path = join(run.run_dir, "pending-outcomes", `${step}.json`), hash = digest(canonicalJSON(value) + "\n");
  appendRun(c, run.header.run_id, run, { ...run.state, report: { digest: "b".repeat(64) }, operations: [{ kind: "artifact", category: "pending-outcomes", step_id: step, path, digest: hash, state: "intent", pending_payload }] }, "intent");
  const pending = pendingOutcomes(c, run.header.run_id); expect(pending).toHaveLength(1); expect(pending[0].outcome.ordered_append_text).toBe(outcome.append);
  const result = capturePendingOutcome(c, run.header.run_id, outcome); expect(result.prior_report_digest).toBe("a".repeat(64));
  expect(readFileSync(path, "utf8")).toBe(canonicalJSON(value) + "\n"); expect(pendingOutcomes(c, run.header.run_id)).toHaveLength(1);
});

test("interrupted outcome capture keeps intent order even when a later outcome finishes first", () => {
  const f = fixture(); projects.push(f); const c = loadSettings(f.root), run = createRun(c), step = randomUUID();
  const payload = { kind: "pending-outcome", at: "2026-10-29T12:00:00Z", ordered_append_text: "Earlier intent", status: null, status_description: null, prior_report_digest: "a".repeat(64) };
  const pending_payload = { ...payload, payload_digest: digest(canonicalJSON(payload)) }, value = { schema_version: 1, run_id: run.header.run_id, step_id: step, ...pending_payload };
  appendRun(c, run.header.run_id, run, { ...run.state, report: { digest: "a".repeat(64) }, operations: [{ kind: "artifact", category: "pending-outcomes", step_id: step, path: join(run.run_dir, "pending-outcomes", `${step}.json`), digest: digest(canonicalJSON(value) + "\n"), state: "intent", pending_payload }] });
  capturePendingOutcome(c, run.header.run_id, { step_id: randomUUID(), at: "2026-10-29T12:01:00Z", append: "Later outcome" });
  expect(pendingOutcomes(c, run.header.run_id).map(row => row.outcome.ordered_append_text)).toEqual(["Earlier intent", "Later outcome"]);
  capturePendingOutcome(c, run.header.run_id, { step_id: step, at: payload.at, append: payload.ordered_append_text });
  expect(pendingOutcomes(c, run.header.run_id).map(row => row.outcome.ordered_append_text)).toEqual(["Earlier intent", "Later outcome"]);
});

test("malformed assessment evidence produces a failing grade instead of crashing the runner", () => {
  const corpus = syntheticCorpus(); projects.push(corpus.project); const good = passingAssessment(corpus.cases);
  const malformed = structuredClone(good); malformed.items[0].evidence = [null as never];
  expect(gradeAssessment(malformed, corpus.cases, corpus.evidence).pass).toBe(false);
});

test("packet export rejects omitted scoped repositories and contradictory alert coverage before writing", () => {
  const corpus = syntheticCorpus(); projects.push(corpus.project); const collected = invoke(corpus.project.root, "collect", [], corpus.env); expect(collected.exit).toBe(0);
  const inventory = JSON.parse(collected.out), receipt = { argv: [process.execPath, cli, "collect"], exit_code: 0, requests_digest: corpus.requestsDigest() };
  const missing = structuredClone(inventory); missing.repositories.pop();
  const contradictory = structuredClone(inventory); contradictory.repositories[0].code_scanning.coverage.count = 0;
  const count = structuredClone(inventory); count.repositories[0].dependabot.coverage.count = 4;
  for (const value of [missing, contradictory, count]) {
    expect(() => exportAnalysisInput(corpus.config, { ...corpus.packet, inventory: value, collection_receipt: receipt })).toThrow();
    expect(existsSync(corpus.packet.output)).toBe(false);
  }
});
