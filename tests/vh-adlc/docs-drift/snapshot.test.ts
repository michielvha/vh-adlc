import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { captureRepositoryState, captureSnapshot, checkFreshness, createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { settingsFixture } from "./settings-fixture";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function temporary(): string {
  const root = mkdtempSync(join(tmpdir(), "vh-drift-snapshot-"));
  roots.push(root);
  return root;
}

function put(repo: string, path: string, content: string): void {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
}

function git(repo: string, ...args: string[]): string {
  const run = Bun.spawnSync(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd: repo, stdout: "pipe", stderr: "pipe" });
  if (run.exitCode !== 0) throw new Error(run.stderr.toString());
  return run.stdout.toString().trim();
}

function fixture(bounded = false) {
  const repo = temporary();
  const settings = settingsFixture();
  const selected = bounded ? { ...settings, verification_commands: [], generation_commands: [], read_set: { source_roots: ["src"], reference_roots: ["references"] } } : settings;
  for (const [path, content] of Object.entries({
    "AGENTS.md": "Feature documents: plans/\n",
    ".vh-adlc/docs-drift.yaml": JSON.stringify(selected) + "\n",
    "docs/guide.md": "# Guide\n",
    "docs/suppressions.yaml": "suppressions: []\n",
    "docs/docs-procedure.md": "# Project procedure\n",
    "scripts/scan.js": "// Synthetic fixture scanner\n",
    "scripts/docs-drift-entry.ts": "// Synthetic fixture launcher\n",
    ".claude/commands/docs-drift.md": "Use the fixture entry.\n",
    ".github/workflows/docs-drift-worker.yml": "name: Fixture worker\n",
    ".github/workflows/docs-drift.yml": "name: Fixture schedule\n",
    "src/app.ts": "export const value = 1;\n",
    "outside.txt": "unchanged\n",
  })) put(repo, path, content);
  git(repo, "init", "-q", "-b", "main");
  const commit = commitAll(repo);
  return { repo, commit };
}

function commitAll(repo: string): string {
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "fixture update");
  return git(repo, "rev-parse", "HEAD");
}

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
