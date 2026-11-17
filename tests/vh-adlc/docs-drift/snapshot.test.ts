import { afterAll, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureBareSnapshot, captureRepositoryState, captureCallerState, matchesCallerState, matchesRepositoryState, captureSnapshot, checkFreshness, createOwnedObjectStore, readCommittedTree } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { currentRuntimeValidation, withRuntimeValidation } from "../../../plugins/vh-adlc/scripts/docs-drift/runtime-validation";
import { canonicalDigest, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { commitAll, git, populateRepository, put } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function temporary(): string {
  const root = mkdtempSync(join(tmpdir(), "vh-drift-snapshot-"));
  roots.push(root);
  return root;
}

function fixture(bounded = false) {
  return populateRepository(temporary(), bounded);
}

test("committed tree reads batch raw blobs while preserving order, modes, links and binary bytes", () => {
  const { repo, commit: parent } = fixture(), bin = temporary(), trace = join(bin, "git-calls.jsonl");
  for (let index = 0; index < 48; index++) put(repo, `bulk/${index}.txt`, `raw ${index}\n`);
  const binary = Buffer.from([0, 10, 255, 13, 10]);
  writeFileSync(join(repo, "bulk/binary\t試験.bin"), binary);
  chmodSync(join(repo, "bulk/0.txt"), 0o755);
  symlinkSync("0.txt", join(repo, "bulk/link"));
  git(repo, "add", ".");
  git(repo, "update-index", "--add", "--cacheinfo", "160000," + parent + ",modules/child");
  git(repo, "commit", "-qm", "raw tree controls");
  const source = git(repo, "rev-parse", "HEAD"), before = captureRepositoryState(repo);
  const realGit = Bun.which("git");
  if (!realGit) throw Error("Git required for snapshot regression");
  writeFileSync(join(bin, "git"), `#!${process.execPath}
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(trace)}, JSON.stringify(args) + "\\n");
const result = Bun.spawnSync([${JSON.stringify(realGit)}, ...args], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
process.exitCode = result.exitCode;
`, { mode: 0o700 });
  const originalPath = process.env.PATH;
  let tree: ReturnType<typeof readCommittedTree>;
  try {
    process.env.PATH = bin + ":" + originalPath;
    tree = readCommittedTree(repo, source);
  } finally { process.env.PATH = originalPath; }
  const calls = readFileSync(trace, "utf8").trim().split("\n").map(line => JSON.parse(line) as string[]);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toContain("--batch");
  expect(tree.map(blob => blob.path)).toEqual(git(repo, "ls-tree", "-r", "--name-only", "-z", source).split("\0").filter(Boolean));
  expect(tree.find(blob => blob.path === "bulk/binary\t試験.bin")?.bytes).toEqual(binary);
  expect(tree.find(blob => blob.path === "bulk/0.txt")?.mode).toBe("100755");
  expect(tree.find(blob => blob.path === "bulk/link")).toMatchObject({ mode: "120000", bytes: Buffer.from("0.txt") });
  expect(tree.find(blob => blob.path === "modules/child")).toMatchObject({ mode: "160000", oid: parent, bytes: Buffer.alloc(0) });
  expect(captureRepositoryState(repo)).toEqual(before);
});

test("committed snapshots preserve staged, unstaged, ignored, untracked and Git state", () => {
  const { repo, commit } = fixture();
  put(repo, "src/app.ts", "staged\n");
  git(repo, "add", "src/app.ts");
  put(repo, "src/app.ts", "unstaged\n");
  put(repo, "untracked", "other task\n");
  put(repo, ".gitignore", "ignored\n");
  put(repo, "ignored", "ignored other task\n");
  put(repo, ".git/FETCH_HEAD", "preserve caller fetch\n");
  const before = captureRepositoryState(repo);
  const snapshot = captureSnapshot(repo, commit);
  expect(snapshot.source_commit).toBe(commit);
  expect(snapshot.blobs.find(blob => blob.path === "src/app.ts")?.bytes.toString()).toBe("export const value = 1;\n");
  expect(captureRepositoryState(repo)).toEqual(before);
  expect(() => captureSnapshot(repo, "HEAD")).toThrow();
  expect(captureRepositoryState(repo)).toEqual(before);
});

test.each(["ignored-cache", "remote-ref", "prefetch-ref", "sibling-worktree", "index-refresh", "repack"] as const)("caller preservation ignores benign %s activity", activity => {
  const { repo, commit } = fixture();
  put(repo, ".gitignore", "build/\n"); commitAll(repo);
  const before = captureRepositoryState(repo);
  if (activity === "ignored-cache") put(repo, "build/cache.bin", "Generated ignored cache\n");
  if (activity === "remote-ref") git(repo, "update-ref", "refs/remotes/origin/other", commit);
  if (activity === "prefetch-ref") git(repo, "update-ref", "refs/prefetch/remotes/origin/other", commit);
  if (activity === "sibling-worktree") git(repo, "worktree", "add", "--detach", temporary(), commit);
  if (activity === "index-refresh") { const time = new Date(Date.now() + 60000); utimesSync(join(repo, "src/app.ts"), time, time); git(repo, "update-index", "--refresh"); }
  if (activity === "repack") git(repo, "gc", "--prune=never");
  expect(captureRepositoryState(repo)).toEqual(before);
});

test("local configuration values stay in memory and actual changes invalidate caller preservation", () => {
  const { repo } = fixture(), before = captureRepositoryState(repo);
  git(repo, "config", "--local", "fixture.private", "synthetic-private-config-value");
  const after = captureRepositoryState(repo);
  expect(after).not.toEqual(before);
  expect(JSON.stringify(after)).not.toContain("synthetic-private-config-value");
});

test("non-UTF8 untracked file contents remain protected", () => {
  const { repo } = fixture(), path = Buffer.concat([Buffer.from(repo + "/"), Buffer.from([0xff]), Buffer.from("-untracked")]);
  writeFileSync(path, "one");
  const before = captureRepositoryState(repo);
  writeFileSync(path, "two");
  expect(captureRepositoryState(repo)).not.toEqual(before);
});

test("ignored directories retain tracked and explicitly unignored source files", () => {
  const { repo } = fixture();
  put(repo, "build/tracked.txt", "original tracked source\n"); commitAll(repo);
  put(repo, ".gitignore", "build/*\n!build/kept/\n!build/kept/**\n"); commitAll(repo);
  put(repo, "build/kept/untracked.txt", "original unignored input\n");
  const before = captureRepositoryState(repo);
  put(repo, "build/cache/output.txt", "ignored cache\n");
  expect(captureRepositoryState(repo)).toEqual(before);
  put(repo, "build/tracked.txt", "changed tracked source\n");
  expect(captureRepositoryState(repo)).not.toEqual(before);
  put(repo, "build/tracked.txt", "original tracked source\n");
  expect(captureRepositoryState(repo)).toEqual(before);
  put(repo, "build/kept/untracked.txt", "changed unignored input\n");
  expect(captureRepositoryState(repo)).not.toEqual(before);
});

test("logical preservation detects nested submodule source while ignoring its cache", () => {
  const { repo } = fixture(), nested = temporary();
  populateRepository(nested);
  git(repo, "-c", "protocol.file.allow=always", "submodule", "add", nested, "vendor/child"); commitAll(repo);
  put(repo, "vendor/child/.gitignore", "cache/\n"); commitAll(join(repo, "vendor/child")); commitAll(repo);
  const before = captureRepositoryState(repo);
  put(repo, "vendor/child/cache/generated", "ignored nested cache\n");
  expect(captureRepositoryState(repo)).toEqual(before);
  put(repo, "vendor/child/src/app.ts", "changed nested input\n");
  expect(captureRepositoryState(repo)).not.toEqual(before);
});

test("scope omission and unresolved command dependencies use the whole tracked repository", () => {
  const { repo, commit } = fixture();
  const snapshot = captureSnapshot(repo, commit);
  expect(snapshot.read_set.mode).toBe("whole-repository");
  put(repo, "outside.txt", "material under fallback\n");
  expect(checkFreshness(snapshot, commitAll(repo)).fresh).toBe(false);
  const configured = JSON.parse(readFileSync(join(repo, ".vh-adlc/docs-drift.yaml"), "utf8"));
  configured.read_set = { source_roots: ["src"], reference_roots: ["references"] };
  put(repo, ".vh-adlc/docs-drift.yaml", JSON.stringify(configured));
  const boundedButCommands = captureSnapshot(repo, commitAll(repo));
  expect(boundedButCommands.read_set.mode).toBe("whole-repository");
  expect(boundedButCommands.read_set.reason).toBe("command-inputs-unbounded");
});

test("bounded freshness permits disjoint advances without changing the reviewed source", () => {
  const { repo, commit } = fixture(true);
  const snapshot = captureSnapshot(repo, commit);
  expect(snapshot.read_set.mode).toBe("bounded");
  put(repo, "outside.txt", "disjoint\n");
  const current = commitAll(repo);
  const result = checkFreshness(snapshot, current);
  expect(result.fresh).toBe(true);
  expect(result.changed_paths).toEqual(["outside.txt"]);
  expect(result.assessed_commit).toBe(commit);
  expect(result.current_commit).toBe(current);
  expect(snapshot.source_commit).toBe(commit);
});

test.each(["references/previously-absent.md", "src/new.ts", "docs/new.md", "scripts/scan.js", "docs/suppressions.yaml", ".github/workflows/docs-drift-worker.yml"])("new or changed bound input requires reassessment (%s)", path => {
  const { repo, commit } = fixture(true);
  const snapshot = captureSnapshot(repo, commit);
  put(repo, path, "material change\n");
  const result = checkFreshness(snapshot, commitAll(repo));
  expect(result.fresh).toBe(false);
  expect(result.material_paths).toContain(path);
});

test.each(["plans/new.md", "plans/nested/new.md"])("bounded freshness binds future feature claims outside documentation roots (%s)", path => {
  const { repo, commit } = fixture(true), snapshot = captureSnapshot(repo, commit);
  expect(snapshot.read_set.mode).toBe("bounded");
  put(repo, path, "---\nstatus: in-progress\nbranch: feat/another-writer\ncovers: [docs/guide.md]\n---\n# Active claim\n");
  const changed = commitAll(repo), before = captureRepositoryState(repo), result = checkFreshness(snapshot, changed);
  expect(result.fresh).toBe(false);
  expect(result.material_paths).toContain(path);
  expect(captureRepositoryState(repo)).toEqual(before);
});

test("bounded feature-root reads use original committed policy in source and bare stores", () => {
  const { repo, commit } = fixture(true), storeRoot = temporary();
  git(storeRoot, "clone", "--bare", "--no-local", repo, "objects.git");
  const bare = join(storeRoot, "objects.git"), original = captureSnapshot(repo, commit);
  put(repo, "plans/new.md", "---\nstatus: in-progress\nbranch: feat/another-writer\ncovers: [docs/guide.md]\n---\n# Active claim\n");
  const newClaim = commitAll(repo);
  put(repo, "AGENTS.md", "Feature documents: newly-selected/\n");
  const changedPolicy = commitAll(repo);
  git(bare, "fetch", "--no-write-fetch-head", repo, changedPolicy);
  git(bare, "update-ref", "refs/heads/main", changedPolicy);
  put(repo, "AGENTS.md", "Feature documents: dirty-overlay/\n");
  const before = captureRepositoryState(repo), old = captureSnapshot(repo, commit), current = captureSnapshot(repo, changedPolicy);
  const originalBare = captureBareSnapshot(bare, commit);
  expect(originalBare.read_set).toEqual(original.read_set);
  expect(originalBare.read_set.prefixes).toContain("plans");
  expect(originalBare.read_set.prefixes).not.toContain("newly-selected");
  expect(old.read_set.prefixes).toContain("plans");
  expect(current.read_set.prefixes).toContain("newly-selected");
  expect(current.read_set.prefixes).not.toContain("dirty-overlay");
  for (const assessed of [old, originalBare]) {
    const freshness = checkFreshness(assessed, newClaim);
    expect(freshness.fresh).toBe(false);
    expect(freshness.material_paths).toEqual(["plans/new.md"]);
  }
  expect(captureRepositoryState(repo)).toEqual(before);
});

test("bounded freshness binds default feature roots and refuses malformed committed classification", () => {
  const { repo } = fixture(true);
  put(repo, "AGENTS.md", "# No feature-root override\n");
  const source = commitAll(repo), snapshot = captureSnapshot(repo, source);
  expect(snapshot.read_set.prefixes).toContain("docs/internal/plans");
  put(repo, "AGENTS.md", "Feature documents: ../outside/\n");
  const invalid = commitAll(repo), before = captureRepositoryState(repo);
  expect(() => captureSnapshot(repo, invalid)).toThrow("repository-relative path");
  expect(captureRepositoryState(repo)).toEqual(before);
});

test("reverted relevant paths still change required history and time inputs remain material", () => {
  const { repo, commit } = fixture(true);
  const required = [{ id: "clock-window", kind: "time" as const, sha256: "a".repeat(64) }];
  const snapshot = captureSnapshot(repo, commit, { required_inputs: required });
  expect(checkFreshness(snapshot, commit, { required_inputs: required }).fresh).toBe(true);
  expect(checkFreshness(snapshot, commit).fresh).toBe(false);
  expect(checkFreshness(snapshot, commit, { required_inputs: [{ ...required[0], sha256: "b".repeat(64) }] }).fresh).toBe(false);
  put(repo, "src/app.ts", "temporary change\n");
  commitAll(repo);
  put(repo, "src/app.ts", "export const value = 1;\n");
  const result = checkFreshness(snapshot, commitAll(repo), { required_inputs: required });
  expect(result.changed_paths).toEqual([]);
  expect(result.history_changed).toBe(true);
  expect(result.fresh).toBe(false);
});

test("unavailable history and non-descendant source cannot pass freshness", () => {
  const { repo, commit } = fixture(true);
  const snapshot = captureSnapshot(repo, commit);
  const orphan = git(repo, "commit-tree", git(repo, "rev-parse", "HEAD^{tree}"), "-m", "unrelated root");
  expect(checkFreshness(snapshot, orphan).fresh).toBe(false);
  put(repo, ".git/shallow", commit + "\n");
  const before = captureRepositoryState(repo);
  expect(() => captureSnapshot(repo, commit)).toThrow();
  expect(checkFreshness(snapshot, commit).fresh).toBe(false);
  expect(captureRepositoryState(repo)).toEqual(before);
});

test("working-tree EOL conversion never replaces the committed raw blob", () => {
  const { repo } = fixture();
  put(repo, ".gitattributes", "docs/*.md text eol=crlf\n");
  const commit = commitAll(repo);
  put(repo, "docs/guide.md", "# Guide\r\n");
  const snapshot = captureSnapshot(repo, commit);
  const row = snapshot.protocol.bindings.documents.find(row => row[0] === "docs/guide.md");
  expect(row?.[1]).toBe(sha256(Buffer.from("# Guide\n")));
  expect(row?.[1]).not.toBe(sha256(readFileSync(join(repo, "docs/guide.md"))));
});

test("a missing promisor blob is incomplete and is never repaired by lazy fetch", () => {
  const { repo, commit } = fixture();
  const remote = temporary();
  git(remote, "clone", "--bare", "--no-hardlinks", repo, "origin.git");
  git(repo, "config", "remote.origin.url", join(remote, "origin.git"));
  git(repo, "config", "remote.origin.promisor", "true");
  git(repo, "config", "extensions.partialClone", "origin");
  const oid = git(repo, "rev-parse", "HEAD:docs/guide.md");
  const object = join(repo, ".git/objects", oid.slice(0, 2), oid.slice(2));
  renameSync(object, join(remote, "removed-object"));
  const before = captureRepositoryState(repo);
  expect(() => captureSnapshot(repo, commit)).toThrow();
  expect(captureRepositoryState(repo)).toEqual(before);
});

test("owned object fetches record scope before creation and preserve every caller Git resource", () => {
  const { repo, commit } = fixture();
  const parent = temporary();
  mkdirSync(join(parent, "evidence"));
  const before = captureRepositoryState(repo);
  const store = createOwnedObjectStore({ parent, evidence_directory: join(parent, "evidence"), repository: "fixture/docs", source_repo: repo, source_commit: commit, owner: "fixture-owner", run: "fixture-run" });
  const record = JSON.parse(readFileSync(store.record_path, "utf8"));
  expect(record.kind).toBe("pr-object-store");
  expect(record.root).toBe(store.root);
  expect(record.source_commit).toBe(commit);
  expect(record.repository).toBe("fixture/docs");
  expect(git(store.root, "cat-file", "blob", commit + ":docs/guide.md")).toBe("# Guide");
  expect(existsSync(join(store.root, "FETCH_HEAD"))).toBe(false);
  expect(captureRepositoryState(repo)).toEqual(before);
  const inside = join(repo, "forbidden-store-parent");
  mkdirSync(inside);
  expect(() => createOwnedObjectStore({ parent: inside, evidence_directory: join(parent, "evidence"), repository: "fixture/docs", source_repo: repo, source_commit: commit, owner: "fixture-owner", run: "fixture-run" })).toThrow();
  const alias = join(parent, "caller-alias");
  symlinkSync(repo, alias);
  expect(() => createOwnedObjectStore({ parent: alias, evidence_directory: join(parent, "evidence"), repository: "fixture/docs", source_repo: repo, source_commit: commit, owner: "fixture-owner", run: "fixture-run" })).toThrow();
  const otherWorktree = join(parent, "other-worktree");
  git(repo, "worktree", "add", "-qb", "other-fixture", otherWorktree);
  expect(() => createOwnedObjectStore({ parent: otherWorktree, evidence_directory: join(parent, "evidence"), repository: "fixture/docs", source_repo: repo, source_commit: commit, owner: "fixture-owner", run: "fixture-run" })).toThrow();
});

test("the mutation guard includes empty directories, Git config and shallow metadata", () => {
  const { repo, commit } = fixture();
  const before = captureRepositoryState(repo);
  mkdirSync(join(repo, "empty-directory"));
  expect(captureRepositoryState(repo)).not.toEqual(before);
  rmSync(join(repo, "empty-directory"), { recursive: true });
  expect(captureRepositoryState(repo)).toEqual(before);
  git(repo, "config", "fixture.guard", "changed");
  expect(captureRepositoryState(repo)).not.toEqual(before);
  git(repo, "config", "--unset", "fixture.guard");
  const configured = captureRepositoryState(repo);
  put(repo, ".git/shallow", commit + "\n");
  expect(captureRepositoryState(repo)).not.toEqual(configured);
});


test("nested caller checks reuse only their ordinary invocation while standalone and owned checks stay live", () => {
  const { repo } = fixture(), before = captureRepositoryState(repo), fullBefore = captureRepositoryState(repo, "full");
  const digest = canonicalDigest(before);
  withRuntimeValidation(() => {
    const context = currentRuntimeValidation();
    if (!context) throw Error("Runtime verification scope required");
    context.caller = { repo, state: before };
    put(repo, "src/app.ts", "Changed caller during invocation\n");
    expect(captureCallerState(repo)).toEqual(before);
    expect(matchesCallerState(repo, digest)).toBe(true);
    expect(matchesRepositoryState(repo, digest)).toBe(false);
    expect(captureCallerState(repo, "full")).not.toEqual(fullBefore);
  });
  expect(captureCallerState(repo)).not.toEqual(before);
  expect(matchesCallerState(repo, digest)).toBe(false);
  withRuntimeValidation(() => expect(matchesCallerState(repo, digest)).toBe(false));
});
