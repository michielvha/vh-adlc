import { createHash } from "node:crypto";
import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createGitHubReader, createRepositoryReader } from "../../../plugins/vh-adlc/scripts/github-read";
import { collectProposals, fetchProposalObjects, readProposalDiff } from "../../../plugins/vh-adlc/scripts/docs-drift/proposals";
import { captureRepositoryState, createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { canonicalDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { settingsFixture } from "./settings-fixture";
import { commitAll, git, populateRepository, put } from "./repository-fixture";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function directory() { const root = mkdtempSync(join(tmpdir(), "docs-drift-github-")); roots.push(root); return root; }
const repository = { id: 11, full_name: "fixture/docs", default_branch: "main" };
function pull(number = 1, options: Record<string, unknown> = {}) {
  return { number, state: "open", merged_at: null, body: "Reviewed body", draft: false, user: { login: "fixture-bot", id: 12, type: "Bot" }, head: { sha: "c".repeat(40), ref: "docs-drift/fix", repo: repository }, base: { sha: "b".repeat(40), ref: "main", repo: repository }, ...options };
}
function reader(responses: Record<string, unknown>) {
  const root = directory();
  const log = join(root, "requests.jsonl");
  const program = `#!${process.execPath}\nconst responses=${JSON.stringify(responses)}; const args=process.argv.slice(2);const endpoint=args.at(-1);require('node:fs').appendFileSync(${JSON.stringify(log)},JSON.stringify({args,ambient:process.env.DOCS_DRIFT_AMBIENT_CANARY,token:process.env.GH_TOKEN})+'\\n');const value=responses[endpoint];if(value===undefined){console.log('HTTP/2.0 404 Not Found\\r\\n\\r\\n'+JSON.stringify({message:'missing'}));process.exit(1);}console.log('HTTP/2.0 200 OK\\r\\n\\r\\n'+JSON.stringify(value));\n`;
  writeFileSync(join(root, "gh"), program); chmodSync(join(root, "gh"), 0o700);
  const transport = createGitHubReader("github.com", { inherit_env: false, env: { PATH: root, GH_TOKEN: "synthetic-read-token" } });
  return { selected: createRepositoryReader(transport, "fixture/docs"), log };
}
function routes(prs: unknown[]) {
  return { "repos/fixture/docs": repository, "repos/fixture/docs/pulls?state=open&base=main&per_page=100&page=1": prs };
}

test("typed repository reads use fixed GET routes and an explicit credential-scoped environment", () => {
  const previous = process.env.DOCS_DRIFT_AMBIENT_CANARY;
  process.env.DOCS_DRIFT_AMBIENT_CANARY = "not-for-the-reader";
  try {
    const api = reader(routes([pull()]));
    expect(api.selected.repository()).toEqual(repository);
    const listed = api.selected.pulls("main");
    expect(listed.complete).toBe(true);
    expect(listed.items[0].head_sha).toBe("c".repeat(40));
    const requests: unknown[] = readFileSync(api.log, "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request).toMatchObject({ token: "synthetic-read-token" });
      expect(request).not.toHaveProperty("ambient");
      expect(request).toHaveProperty("args", expect.arrayContaining(["--method", "GET"]));
    }
  } finally {
    if (previous === undefined) delete process.env.DOCS_DRIFT_AMBIENT_CANARY;
    else process.env.DOCS_DRIFT_AMBIENT_CANARY = previous;
  }
});

test("malformed or foreign PR metadata makes collection incomplete while retaining valid neighbors", () => {
  const foreign = pull(2); foreign.base.repo = { ...repository, full_name: "foreign/repo" };
  const api = reader(routes([pull(1), foreign, pull(3, { number: -4 }), pull(4)]));
  const result = api.selected.pulls("main");
  expect(result.complete).toBe(false);
  expect(result.items.map(item => item.number)).toEqual([1, 4]);
  expect(result.diagnostics).toHaveLength(2);
});

test("discovery collects shared, legacy and explicit proposals and retains required collection gaps", () => {
  const original = settingsFixture();
  const fixture = { ...original, legacy_proposals: { ...original.legacy_proposals, ids: [7] } };
  const settings = parseSettings(fixture);
  const legacy = pull(2, { user: { login: "legacy-bot", id: 13, type: "Bot" }, head: { sha: "d".repeat(40), ref: "docs-audit/old", repo: repository } });
  const unrelated = pull(3, { user: { login: "someone", id: 14, type: "User" } });
  const api = reader({ ...routes([pull(1), legacy, unrelated]), "repos/fixture/docs/pulls/7": pull(7, { state: "closed", merged_at: null }) });
  const collected = collectProposals(api.selected, settings);
  expect(collected.complete).toBe(true);
  expect(collected.proposals.map(item => item.number)).toEqual([1, 2, 7]);
  const missing = reader(routes([pull()]));
  expect(collectProposals(missing.selected, settings).complete).toBe(false);
});

test("run and artifact metadata are typed without trusting archive URLs or incomplete counts", () => {
  const run = { id: 101, run_attempt: 2, workflow_id: 55, path: ".github/workflows/docs-drift.yml", event: "schedule", status: "completed", conclusion: "failure", head_sha: "b".repeat(40), head_branch: "main", repository, head_repository: repository, created_at: "2026-11-05T10:00:00Z", updated_at: "2026-11-05T10:01:00Z" };
  const artifact = { id: 201, name: "docs-drift-101-2", size_in_bytes: 500, digest: "sha256:" + "a".repeat(64), expired: false, created_at: "2026-11-05T10:01:00Z", expires_at: "2026-12-05T10:01:00Z", workflow_run: { id: 101, repository_id: 11, head_repository_id: 11, head_branch: "main", head_sha: "b".repeat(40) }, archive_download_url: "https://foreign.invalid/private" };
  const api = reader({ "repos/fixture/docs/actions/runs/101/attempts/2": run, "repos/fixture/docs/actions/runs/101/artifacts?per_page=100&page=1": { total_count: 2, artifacts: [artifact] } });
  expect(api.selected.run(101, 2)).toMatchObject({ id: 101, run_attempt: 2 });
  const artifacts = api.selected.artifacts(101);
  expect(artifacts.complete).toBe(false);
  expect(artifacts.items[0]).not.toHaveProperty("archive_download_url");
  expect(() => api.selected.run(-1)).toThrow();
  expect(() => createRepositoryReader(createGitHubReader("github.com"), "fixture/docs/../../foreign")).toThrow();
});

function proposalRepository() {
  const source = directory();
  const initial = populateRepository(source);
  git(source, "switch", "-qc", "docs-drift/fix");
  put(source, "docs/guide.md", "# Guide\n" + "A complete correction\n".repeat(80000));
  put(source, "docs/a\nb.md", "Literal newline path\n");
  const head = commitAll(source);
  git(source, "switch", "-q", "main");
  const root = directory();
  const store = createOwnedObjectStore({ parent: root, evidence_directory: root, source_repo: source, source_commit: initial.commit, repository: "fixture/docs", owner: "unit", run: "run-1" });
  git(store.root, "fetch", "--no-write-fetch-head", source, head);
  const api = reader({ "repos/fixture/docs/pulls/1": pull(1, { base: { sha: initial.commit, ref: "main", repo: repository }, head: { sha: head, ref: "docs-drift/fix", repo: repository } }) });
  return { source, store, initial, head, proposal: api.selected.pull(1) };
}

test("full Git diffs retain large proposal blobs and literal paths without REST patches", () => {
  const fixture = proposalRepository();
  const before = canonicalDigest(captureRepositoryState(fixture.source));
  const result = readProposalDiff(fixture.store, fixture.proposal);
  expect(result.complete).toBe(true);
  expect(result.patch_bytes.length).toBeGreaterThan(1000000);
  expect(result.files.map(file => file.path)).toEqual(["docs/a\nb.md", "docs/guide.md"]);
  expect(result.files.find(file => file.path === "docs/guide.md")?.after?.length).toBeGreaterThan(1000000);
  expect(result.head_sha).toBe(fixture.head);
  expect(canonicalDigest(captureRepositoryState(fixture.source))).toBe(before);
});

test("missing proposal objects and changed owned-store records remain incomplete", () => {
  const fixture = proposalRepository();
  expect(readProposalDiff(fixture.store, { ...fixture.proposal, head_sha: "d".repeat(40) }).complete).toBe(false);
  writeFileSync(fixture.store.record_path, "{}\n");
  expect(() => readProposalDiff(fixture.store, fixture.proposal)).toThrow("owned");
});

test("repeated PR identities and substituted workflow filters make typed lists incomplete", () => {
  const repeated = reader(routes([pull(1), pull(1, { body: "Changed during pagination" })]));
  expect(repeated.selected.pulls("main").complete).toBe(false);
  const run = { id: 101, run_attempt: 1, workflow_id: 99, path: ".github/workflows/foreign.yml", event: "pull_request", status: "completed", conclusion: "success", head_sha: "b".repeat(40), head_branch: "main", repository, head_repository: repository, created_at: "2026-11-05T10:00:00Z", updated_at: "2026-11-05T10:01:00Z" };
  const api = reader({ "repos/fixture/docs/actions/workflows/55/runs?event=schedule&branch=main&per_page=100&page=1": { total_count: 1, workflow_runs: [run] } });
  expect(api.selected.runs(55, "main").complete).toBe(false);
});

test("trusted proposal fetch uses only fixed repository/ref vectors and records the actual object result", async () => {
  const fixture = proposalRepository();
  const bin = directory();
  const marker = join(bin, "fetch.json");
  const program = `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),token:process.env.GH_TOKEN,aws:process.env.AWS_SECRET_ACCESS_KEY}));process.exit(1);\n`;
  writeFileSync(join(bin, "git"), program); chmodSync(join(bin, "git"), 0o700);
  const result = await fetchProposalObjects(fixture.store, fixture.proposal, { hostname: "github.com", repository: "fixture/docs", default_branch: "main", environment: { PATH: bin, GH_TOKEN: "synthetic-read-token" } });
  expect(result.complete).toBe(false);
  const observed: unknown = JSON.parse(readFileSync(marker, "utf8"));
  expect(observed).toMatchObject({ cwd: fixture.store.root, token: "synthetic-read-token" });
  expect(observed).not.toHaveProperty("aws");
  expect(observed).toHaveProperty("args", expect.arrayContaining(["--no-lazy-fetch", "--no-replace-objects", "fetch", "--no-write-fetch-head", "https://github.com/fixture/docs.git", "+refs/pull/1/head:refs/docs-drift/inputs/pr-1"]));
  expect(JSON.stringify(observed)).not.toContain("https://synthetic-read-token");
  await expect(fetchProposalObjects(fixture.store, fixture.proposal, { hostname: "https://foreign.invalid", repository: "fixture/docs", default_branch: "main", environment: {} })).rejects.toThrow();
});

test("a timed-out trusted fetch cleans and reaps its owned helper process group", async () => {
  const fixture = proposalRepository();
  const bin = directory();
  const marker = join(bin, "helper-pid");
  const program = `#!${process.execPath}\nconst child=Bun.spawn([process.execPath,'--eval','setInterval(()=>{},1000)'],{stdout:'ignore',stderr:'ignore'});require('node:fs').writeFileSync(${JSON.stringify(marker)},String(child.pid));process.on('SIGTERM',async()=>{await child.exited;process.exit(0)});setInterval(()=>{},1000);\n`;
  writeFileSync(join(bin, "git"), program); chmodSync(join(bin, "git"), 0o700);
  let helper: number | undefined;
  try {
    const result = await fetchProposalObjects(fixture.store, fixture.proposal, { hostname: "github.com", repository: "fixture/docs", default_branch: "main", environment: { PATH: bin }, timeout_ms: 800 });
    expect(result.complete).toBe(false);
    helper = Number(readFileSync(marker, "utf8"));
    expect(Number.isSafeInteger(helper)).toBe(true);
    let alive = true;
    try { process.kill(helper, 0); } catch { alive = false; }
    expect(alive).toBe(false);
  } finally { if (helper) { try { process.kill(helper, "SIGKILL"); } catch {} } }
});

test("fixed-ref fetch reads a complete local GitHub-ref fixture and rejects a changed API head", async () => {
  const fixture = proposalRepository();
  git(fixture.source, "update-ref", "refs/pull/1/head", fixture.head);
  const before = canonicalDigest(captureRepositoryState(fixture.source));
  const bin = directory();
  const realGit = Bun.which("git");
  if (!realGit) throw new Error("Git required by fixture");
  const program = `#!${process.execPath}\nconst args=process.argv.slice(2);const target=args.indexOf('https://github.com/fixture/docs.git');if(target<0)process.exit(91);args[target]=${JSON.stringify(fixture.source)};const fetch=args.indexOf('fetch');args.splice(fetch,0,'-c','protocol.file.allow=always');const result=Bun.spawnSync([${JSON.stringify(realGit)},...args],{stdout:'inherit',stderr:'inherit'});process.exit(result.exitCode);\n`;
  writeFileSync(join(bin, "git"), program); chmodSync(join(bin, "git"), 0o700);
  const options = { hostname: "github.com", repository: "fixture/docs", default_branch: "main", environment: { PATH: bin } };
  const result = await fetchProposalObjects(fixture.store, fixture.proposal, options);
  expect(result.complete).toBe(true);
  expect(result.head_sha).toBe(fixture.head);
  expect(result.files).toHaveLength(2);
  const changed = await fetchProposalObjects(fixture.store, { ...fixture.proposal, head_sha: fixture.initial.commit }, options);
  expect(changed.complete).toBe(false);
  expect(canonicalDigest(captureRepositoryState(fixture.source))).toBe(before);
});

test("typed Git ref/tree/blob reads validate object IDs, complete trees and actual blob bytes", () => {
  const content = Buffer.from("{\"operation\":\"unit\"}\n");
  const oid = createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${content.length}\0`), content])).digest("hex");
  const rawTree = Buffer.concat([Buffer.from("100644 plan.json\0"), Buffer.from(oid, "hex")]);
  const tree = createHash("sha1").update(Buffer.concat([Buffer.from(`tree ${rawTree.length}\0`), rawTree])).digest("hex");
  const commit = "b".repeat(40);
  const responses = {
    ["repos/fixture/docs/git/ref/heads/docs-drift-receipts/unit"]: { ref: "refs/heads/docs-drift-receipts/unit", object: { type: "commit", sha: commit } },
    ["repos/fixture/docs/git/commits/" + commit]: { sha: commit, tree: { sha: tree }, parents: [], message: "Evidence only" },
    ["repos/fixture/docs/git/trees/" + tree]: { sha: tree, truncated: false, tree: [{ path: "plan.json", mode: "100644", type: "blob", sha: oid }] },
    ["repos/fixture/docs/git/blobs/" + oid]: { sha: oid, size: content.length, encoding: "base64", content: content.toString("base64") + "\n" },
  };
  const api = reader(responses);
  expect(api.selected.ref("refs/heads/docs-drift-receipts/unit")).toEqual({ ref: "refs/heads/docs-drift-receipts/unit", sha: commit });
  expect(api.selected.commit(commit).tree_sha).toBe(tree);
  expect(api.selected.tree(tree).entries).toHaveLength(1);
  expect(api.selected.blob(oid)).toEqual(content);
  const corrupt = reader({ ...responses, ["repos/fixture/docs/git/blobs/" + oid]: { ...responses["repos/fixture/docs/git/blobs/" + oid], content: Buffer.from("forged").toString("base64") } });
  expect(() => corrupt.selected.blob(oid)).toThrow();
  const truncated = reader({ ...responses, ["repos/fixture/docs/git/trees/" + tree]: { ...responses["repos/fixture/docs/git/trees/" + tree], truncated: true } });
  expect(() => truncated.selected.tree(tree)).toThrow();
  expect(() => api.selected.ref("https://foreign.invalid/receipt")).toThrow();
});


test("the fresh merge reader distinguishes actual delivery from a hypothetical merge commit", () => {
  const sha = "d".repeat(40);
  const merged = reader({ "repos/fixture/docs/pulls/1": pull(1, { state: "closed", merged_at: "2026-11-07T00:00:00Z", merge_commit_sha: sha }) });
  expect(merged.selected.mergedPull(1).merge_commit_sha).toBe(sha);
  const hypothetical = reader({ "repos/fixture/docs/pulls/1": pull(1, { merge_commit_sha: sha }) });
  expect(hypothetical.selected.mergedPull(1).merge_commit_sha).toBeNull();
  const missing = reader({ "repos/fixture/docs/pulls/1": pull(1, { state: "closed", merged_at: "2026-11-07T00:00:00Z" }) });
  expect(() => missing.selected.mergedPull(1)).toThrow();
});
