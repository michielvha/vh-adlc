import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureRepositoryState } from "../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readGit } from "../../plugins/vh-adlc/scripts/git-read";

const repositories: string[] = [];
afterAll(() => {
  for (const repo of repositories) rmSync(repo, { recursive: true, force: true });
});

function git(repo: string, ...args: string[]): Buffer {
  const result = Bun.spawnSync(["git", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], {
    cwd: repo, stdout: "pipe", stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout;
}

function fixture(): string {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "vh-git-read-")));
  repositories.push(repo);
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Fixture");
  git(repo, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(repo, "literal[1].bin"), Buffer.from([0, 255, 10, 13, 0]));
  writeFileSync(join(repo, "literal1.bin"), "other file");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "fixture");
  return repo;
}

function withEnvironment(values: Record<string, string>, run: () => void): void {
  const previous = new Map(Object.keys(values).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, values);
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("reads exact binary blobs and literal pathspecs from the selected repository", () => {
  const repo = fixture();
  expect(readGit(repo, "show", "HEAD:literal[1].bin")).toEqual(Buffer.from([0, 255, 10, 13, 0]));
  expect(readGit(repo, "ls-files", "-z", "--", "literal[1].bin").toString()).toBe("literal[1].bin\0");
});

test("inherited repository, object, index and injected configuration cannot redirect a read", () => {
  const repo = fixture();
  const foreign = fixture();
  const head = git(repo, "rev-parse", "HEAD");
  withEnvironment({
    GIT_DIR: join(foreign, ".git"), GIT_WORK_TREE: foreign,
    GIT_COMMON_DIR: join(foreign, ".git"), GIT_INDEX_FILE: join(foreign, "missing-index"),
    GIT_OBJECT_DIRECTORY: join(foreign, "missing-objects"),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: join(foreign, "missing-alternates"),
    GIT_NAMESPACE: "foreign", GIT_SHALLOW_FILE: join(foreign, "missing-shallow"),
    GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.bare", GIT_CONFIG_VALUE_0: "true",
    GIT_CONFIG_PARAMETERS: "invalid configuration",
  }, () => {
    expect(readGit(repo, "rev-parse", "--show-toplevel").toString().trim()).toBe(repo);
    expect(readGit(repo, "rev-parse", "HEAD")).toEqual(head);
    expect(readGit(repo, "ls-files", "-z").toString()).toBe("literal1.bin\0literal[1].bin\0");
  });
});

test("replacement objects and inherited fsmonitor do not change the collected bytes or execute hooks", () => {
  const repo = fixture();
  const original = git(repo, "rev-parse", "HEAD:literal1.bin").toString().trim();
  writeFileSync(join(repo, "replacement"), "replacement bytes");
  const replacement = git(repo, "hash-object", "-w", "replacement").toString().trim();
  git(repo, "replace", original, replacement);
  const marker = join(repo, "monitor-ran");
  const monitor = join(repo, "monitor.sh");
  writeFileSync(monitor, `#!/bin/sh\nprintf ran > '${marker}'\n`, { mode: 0o700 });
  git(repo, "config", "core.fsmonitor", monitor);
  withEnvironment({ GIT_NO_REPLACE_OBJECTS: "0", GIT_OPTIONAL_LOCKS: "1" }, () => {
    expect(readGit(repo, "cat-file", "blob", original).toString()).toBe("other file");
    readGit(repo, "status", "--porcelain=v1", "-z");
  });
  expect(existsSync(marker)).toBe(false);
});

test("successful and failed reads preserve caller HEAD, refs, index, FETCH_HEAD and dirty files", () => {
  const repo = fixture();
  writeFileSync(join(repo, "literal1.bin"), "staged");
  git(repo, "add", "literal1.bin");
  writeFileSync(join(repo, "literal1.bin"), "unstaged");
  writeFileSync(join(repo, "untracked"), "owned by another task");
  writeFileSync(join(repo, ".git", "FETCH_HEAD"), "preserve fetch state\n");
  const paths = [".git/HEAD", ".git/index", ".git/FETCH_HEAD", "literal1.bin", "untracked"];
  const before = paths.map(path => readFileSync(join(repo, path)));
  const refs = git(repo, "show-ref");
  const status = git(repo, "status", "--porcelain=v1", "-z");
  readGit(repo, "status", "--porcelain=v1", "-z");
  readGit(repo, "ls-tree", "-r", "-z", "HEAD");
  expect(() => readGit(repo, "cat-file", "blob", "does-not-exist")).toThrow("Git collection failed");
  expect(paths.map(path => readFileSync(join(repo, path)))).toEqual(before);
  expect(git(repo, "show-ref")).toEqual(refs);
  expect(git(repo, "status", "--porcelain=v1", "-z")).toEqual(status);
});


test.each(["ordinary", "split"])("worktree diffs preserve an index with stale stat data after same-byte restoration (%s)", mode => {
  const repo = fixture(), path = join(repo, "literal1.bin"), index = join(repo, ".git/index");
  if (mode === "split") git(repo, "update-index", "--split-index");
  const bytes = readFileSync(path);
  writeFileSync(path, bytes);
  const changedTime = new Date(Date.now() - 10000);
  utimesSync(path, changedTime, changedTime);
  const before = readFileSync(index), state = captureRepositoryState(repo);
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "vh-git-read-scratch-")));
  repositories.push(scratch);
  withEnvironment({ TMPDIR: scratch }, () => {
    expect(readGit(repo, "diff", "--no-ext-diff", "--no-textconv", "--name-status", "-z", "--find-renames", "HEAD", "--").length).toBe(0);
    expect(readdirSync(scratch)).toEqual([]);
    expect(() => readGit(repo, "diff", "no-such-commit", "--")).toThrow("Git collection failed");
    expect(readdirSync(scratch)).toEqual([]);
  });
  expect(readFileSync(index)).toEqual(before);
  expect(readFileSync(path)).toEqual(bytes);
  expect(captureRepositoryState(repo)).toEqual(state);
});
