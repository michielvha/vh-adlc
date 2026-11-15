import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { commitAll, git, populateRepository, put } from "./repository-fixture";
import { settingsFixture } from "./settings-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts");

function fixture(hostname = "github.com", fault = "none") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-entry-collection-"))); roots.push(root);
  const repo = join(root, "source"), artifacts = join(root, "artifacts"), bin = join(root, "bin"), trace = join(root, "native.jsonl");
  for (const path of [repo, artifacts, bin]) mkdirSync(path, { mode: 0o700 });
  populateRepository(repo);
  put(repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...settingsFixture(), hostname }).toString());
  const base = commitAll(repo);
  let source = base;
  git(repo, "checkout", "-b", "docs-drift/proposal"); put(repo, "docs/guide.md", "# Updated guide\n");
  const head = commitAll(repo); git(repo, "update-ref", "refs/pull/1/head", head); git(repo, "checkout", "main");
  if (fault === "later-default") { put(repo, "later-default.txt", "Later default input\n"); source = commitAll(repo); }
  const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const proposal = { number: 1, state: "open", merged_at: null, body: "Synthetic correction", draft: false,
    user: { login: "fixture-bot", id: 20, type: "Bot" }, head: { sha: head, ref: "docs-drift/proposal", repo: repository },
    base: { sha: fault === "nonancestor-base" ? head : base, ref: "main", repo: repository } };
  const realGit = Bun.which("git"); if (!realGit) throw Error("fixture requires Git");
  writeFileSync(join(bin, "git"), `#!${process.execPath}
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2), selected = args.indexOf(${JSON.stringify("https://" + hostname + "/fixture/docs.git")});
if (args.includes("fetch")) appendFileSync(${JSON.stringify(trace)}, JSON.stringify({ kind: "git-fetch", cwd: process.cwd(), args,
  credential: process.env.GH_TOKEN === "synthetic-read-token", enterprise: process.env.GH_ENTERPRISE_TOKEN === "synthetic-read-token",
  provider: process.env.COPILOT_GITHUB_TOKEN ?? null }) + "\\n");
if (selected >= 0) {
  if (${JSON.stringify(fault)} === "fetch-failed") process.exit(89);
  args[selected] = ${JSON.stringify(repo)}; args.splice(args.indexOf("fetch"), 0, "-c", "protocol.file.allow=always");
}
const child = Bun.spawnSync([${JSON.stringify(realGit)}, ...args], { stdout: "inherit", stderr: "inherit" }); process.exit(child.exitCode);
`, { mode: 0o700 });
  writeFileSync(join(bin, "gh"), `#!${process.execPath}
import { appendFileSync, existsSync, readFileSync } from "node:fs";
const args = process.argv.slice(2), endpoint = args.at(-1), log = ${JSON.stringify(trace)};
const reads = existsSync(log) ? readFileSync(log, "utf8").split("\\n").filter(Boolean).map(line => JSON.parse(line)) : [];
appendFileSync(log, JSON.stringify({ kind: "gh", args, provider: process.env.COPILOT_GITHUB_TOKEN ?? null }) + "\\n");
if (args.includes("graphql")) { console.log(JSON.stringify({ data: { viewer: { login: "fixture-bot", databaseId: 20 } } })); process.exit(0); }
if (args[args.indexOf("--method") + 1] !== "GET") process.exit(90);
const source = ${JSON.stringify(source)}, repository = ${JSON.stringify(repository)}, proposal = ${JSON.stringify(proposal)};
if (${JSON.stringify(fault)} === "changed-body" && reads.some(read => read.kind === "gh" && read.args.at(-1) === "repos/fixture/docs/pulls/1")) proposal.body += " Changed";
const value = endpoint === "user/20" ? { login: "fixture-bot", id: 20 }
  : endpoint === "repos/fixture/docs" ? repository
  : endpoint === "repos/fixture/docs/git/ref/heads/main" ? { ref: "refs/heads/main", object: { type: "commit", sha: source } }
  : endpoint === "repos/fixture/docs/git/commits/" + source ? { sha: source, tree: { sha: "a".repeat(40) }, parents: [], message: "Fixture" }
  : endpoint === "repos/fixture/docs/pulls/1" && ${JSON.stringify(fault)} !== "missing-pr" ? proposal : null;
if (!value) { console.log("HTTP/2.0 404 Not Found\\r\\n\\r\\n{} "); process.exit(1); }
console.log("HTTP/2.0 200 OK\\r\\n\\r\\n" + JSON.stringify(value));
`, { mode: 0o700 });
  const selection = canonicalJSON({ schema_version: 1, source_commit: source, proposals: [1] });
  writeFileSync(join(artifacts, "selection.json"), selection, { mode: 0o600 });
  return { repo, root, artifacts, source, base, head, trace, selection,
    environment: { ...process.env, PATH: bin + ":" + process.env.PATH,
      GH_TOKEN: hostname === "github.com" ? "synthetic-read-token" : "",
      GH_ENTERPRISE_TOKEN: hostname === "github.com" ? "" : "synthetic-read-token", COPILOT_GITHUB_TOKEN: "synthetic-provider-canary" } };
}

function invoke(f: ReturnType<typeof fixture>) {
  const run = Bun.spawnSync([process.execPath, entry, "collect-resolution", "--repo", f.repo, "--source", f.source,
    "--artifact-root", f.artifacts, "--selection", "selection.json", "--selection-sha256", sha256(f.selection)],
  { env: f.environment, stdout: "pipe", stderr: "pipe", timeout: 30000 });
  const report = JSON.parse(run.stdout.toString());
  return { run, report };
}

test.each(["github.com", "git.fixture.invalid"])("normal full-diff collection uses owned stores on %s", hostname => {
  const f = fixture(hostname); put(f.repo, "unrelated-dirty.txt", "Preserve caller\n");
  const before = captureRepositoryState(f.repo), { run, report } = invoke(f);
  expect(run.exitCode).toBe(0);
  expect(report.resolution).toMatchObject({ complete: true, inputs: { complete: true, selected: [1], proposals: [{ head_sha: f.head }] } });
  expect(report.resolution.inputs.proposals[0].hunks).toHaveLength(1);
  expect(captureRepositoryState(f.repo)).toEqual(before);
  const events = readFileSync(f.trace, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const fetched = events.filter(event => event.kind === "git-fetch" && event.args.some((value: string) => value.startsWith("https://")));
  expect(fetched).toHaveLength(1);
  expect(fetched[0].cwd).not.toBe(f.repo);
  expect(fetched[0]).toMatchObject(hostname === "github.com" ? { credential: true } : { enterprise: true });
  expect(events.every(event => event.provider === null)).toBe(true);
}, 30000);

test.each(["fetch-failed", "missing-pr", "changed-body", "nonancestor-base"])("normal full-diff collection retains incomplete %s", fault => {
  const f = fixture("github.com", fault), before = captureRepositoryState(f.repo), { run, report } = invoke(f);
  expect(run.exitCode).toBe(2);
  expect(report.resolution.complete).toBe(false);
  expect(report.resolution.diagnostics.length).toBeGreaterThan(0);
  expect(new Set(report.resolution.diagnostics).size).toBe(report.resolution.diagnostics.length);
  expect(report.diagnostics.map((item: { message: string }) => item.message)).toEqual(report.resolution.diagnostics);
  expect(report.diagnostics.every((item: { code: string }) => item.code === "resolution-collection")).toBe(true);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 30000);

test.each(["empty", "duplicate", "extra-field", "different-source"])("normal resolution refuses invalid selection before native reads %s", fault => {
  const f = fixture(), packet = { schema_version: 1, source_commit: fault === "different-source" ? f.head : f.source,
    proposals: fault === "empty" ? [] : fault === "duplicate" ? [1, 1] : [1], ...(fault === "extra-field" ? { approved: true } : {}) };
  f.selection = canonicalJSON(packet); writeFileSync(join(f.artifacts, "selection.json"), f.selection);
  const before = captureRepositoryState(f.repo), { run, report } = invoke(f);
  expect(run.exitCode).toBe(2);
  expect(report.resolution).toBeUndefined();
  expect(report.diagnostics[0].message).toContain("resolution selection");
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(() => readFileSync(f.trace)).toThrow();
});

test("normal resolution refuses a nondefault source without creating a store", () => {
  const f = fixture(); f.source = f.head;
  f.selection = canonicalJSON({ schema_version: 1, source_commit: f.source, proposals: [1] });
  writeFileSync(join(f.artifacts, "selection.json"), f.selection);
  const before = captureRepositoryState(f.repo), { run, report } = invoke(f);
  expect(run.exitCode).toBe(2);
  expect(report.resolution).toMatchObject({ complete: false, store: null, inputs: null });
  expect(report.resolution.diagnostics).toContain("resolution collection requires the observed current default source");
  expect(captureRepositoryState(f.repo)).toEqual(before);
});


test("normal resolution retains a historical PR base after the default advances", () => {
  const f = fixture("github.com", "later-default"), before = captureRepositoryState(f.repo), { run, report } = invoke(f);
  expect(run.exitCode).toBe(0);
  expect(report.resolution.inputs.proposals[0]).toMatchObject({ base_sha: f.base, head_sha: f.head, merge_base: f.base });
  expect(report.resolution.inputs.source_commit).toBe(f.source);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});
