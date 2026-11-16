import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { commitAll, git, populateRepository, put } from "./repository-fixture";
import { settingsFixture } from "./settings-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
import { collectNativeResolution } from "../../../plugins/vh-adlc/scripts/docs-drift/resolution-entry";

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
const child = Bun.spawnSync([${JSON.stringify(realGit)}, ...args], { stdin: "inherit", stdout: "inherit", stderr: "inherit" }); process.exit(child.exitCode);
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

async function collect(f: ReturnType<typeof fixture>) {
  return collectNativeResolution({ repo: f.repo, source: f.source, selection: JSON.parse(f.selection.toString()), artifact_root: f.artifacts,
    owner: "fixture-owner", run: "native-resolution", path: f.environment.PATH,
    credential: f.environment.GH_TOKEN || f.environment.GH_ENTERPRISE_TOKEN });
}

test.each(["github.com", "git.fixture.invalid"])("native full-diff collection uses owned stores on %s", async hostname => {
  const f = fixture(hostname); put(f.repo, "unrelated-dirty.txt", "Preserve caller\n");
  const before = captureRepositoryState(f.repo), resolution = await collect(f);
  expect(resolution.complete, resolution.diagnostics.join("\n")).toBe(true);
  expect(resolution).toMatchObject({ complete: true, inputs: { complete: true, selected: [1], proposals: [{ head_sha: f.head }] } });
  expect(resolution.inputs!.proposals[0].hunks).toHaveLength(1);
  expect(captureRepositoryState(f.repo)).toEqual(before);
  const events = readFileSync(f.trace, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const fetched = events.filter(event => event.kind === "git-fetch" && event.args.some((value: string) => value.startsWith("https://")));
  expect(fetched).toHaveLength(1);
  expect(fetched[0].cwd).not.toBe(f.repo);
  expect(fetched[0]).toMatchObject(hostname === "github.com" ? { credential: true } : { enterprise: true });
  expect(events.every(event => event.provider === null)).toBe(true);
}, 30000);

test.each(["fetch-failed", "missing-pr", "changed-body", "nonancestor-base"])("native full-diff collection retains incomplete %s", async fault => {
  const f = fixture("github.com", fault), before = captureRepositoryState(f.repo), resolution = await collect(f);
  expect(resolution.complete).toBe(false);
  expect(resolution.complete).toBe(false);
  expect(resolution.diagnostics.length).toBeGreaterThan(0);
  expect(new Set(resolution.diagnostics).size).toBe(resolution.diagnostics.length);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 30000);

test.each(["empty", "duplicate", "extra-field", "different-source"])("native resolution refuses invalid selection before native reads %s", async fault => {
  const f = fixture(), packet = { schema_version: 1, source_commit: fault === "different-source" ? f.head : f.source,
    proposals: fault === "empty" ? [] : fault === "duplicate" ? [1, 1] : [1], ...(fault === "extra-field" ? { approved: true } : {}) };
  f.selection = canonicalJSON(packet); writeFileSync(join(f.artifacts, "selection.json"), f.selection);
  const before = captureRepositoryState(f.repo);
  await expect(collect(f)).rejects.toThrow("resolution selection");
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(() => readFileSync(f.trace)).toThrow();
});

test("native resolution refuses a nondefault source without creating a store", async () => {
  const f = fixture(); f.source = f.head;
  f.selection = canonicalJSON({ schema_version: 1, source_commit: f.source, proposals: [1] });
  writeFileSync(join(f.artifacts, "selection.json"), f.selection);
  const before = captureRepositoryState(f.repo), resolution = await collect(f);
  expect(resolution.complete).toBe(false);
  expect(resolution).toMatchObject({ complete: false, store: null, inputs: null });
  expect(resolution.diagnostics).toContain("resolution collection requires the observed current default source");
  expect(captureRepositoryState(f.repo)).toEqual(before);
});


test("native resolution retains a historical PR base after the default advances", async () => {
  const f = fixture("github.com", "later-default"), before = captureRepositoryState(f.repo), resolution = await collect(f);
  expect(resolution.complete, resolution.diagnostics.join("\n")).toBe(true);
  expect(resolution.inputs!.proposals[0]).toMatchObject({ base_sha: f.base, head_sha: f.head, merge_base: f.base });
  expect(resolution.inputs!.source_commit).toBe(f.source);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});
