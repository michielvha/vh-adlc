// Claiming a feature from a host worktree, and keeping implement out of the primary checkout.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { claim, isolation } from "../../../plugins/vh-adlc/scripts/loop/claim";
import { loadLoopSettings } from "../../../plugins/vh-adlc/scripts/loop/settings";

const made: string[] = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });
const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" };
function git(root: string, ...args: string[]) {
  const run = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe", env: ENV });
  if (run.exitCode !== 0) throw Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
  return run.stdout.toString().trim();
}
function scratch(prefix: string) { const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix))); made.push(dir); return dir; }
const DOC = "docs/specs/f.md";

/** A bare remote, a primary checkout on main, and a host worktree at the tip in the given state. */
function setup(state: "detached" | "owned" | "unrelated", settings = "schema_version: 1\n") {
  const remote = join(scratch("vh-claim-remote-"), "r.git");
  git(dirname(remote), "init", "-q", "--bare", "-b", "main", remote);
  const primary = scratch("vh-claim-primary-");
  git(primary, "init", "-q", "-b", "main"); git(primary, "config", "user.name", "t"); git(primary, "config", "user.email", "t@example.invalid");
  for (const [path, text] of Object.entries({ [DOC]: "---\nstatus: planned\n---\n# F\n", ".vh-adlc/loop.yaml": settings, "README.md": "r\n" })) {
    mkdirSync(dirname(join(primary, path)), { recursive: true }); writeFileSync(join(primary, path), text);
  }
  git(primary, "add", "-A"); git(primary, "commit", "-q", "-m", "base");
  git(primary, "remote", "add", "origin", remote); git(primary, "push", "-q", "origin", "main");
  const host = join(scratch("vh-claim-host-"), "wt");
  if (state === "detached") git(primary, "worktree", "add", "-q", "--detach", host, "origin/main");
  else git(primary, "worktree", "add", "-q", "-b", state === "owned" ? "session-wt" : "someone-else", host, "origin/main");
  return { remote, primary, host };
}
const edit = (root: string) => writeFileSync(join(root, DOC), "---\nstatus: in-progress\nbranch: feat/f\n---\n# F\n");
const request = (owned: string[] = []) => ({ document: DOC, featureBranch: "feat/f", defaultBranch: "main", ownedBranches: owned, message: "docs(specs): claim f [skip ci]", edit });
function state(root: string) {
  return { head: git(root, "rev-parse", "HEAD"), branch: git(root, "branch", "--show-current"), branches: git(root, "for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"),
    status: git(root, "status", "--porcelain"), doc: readFileSync(join(root, DOC), "utf8") };
}

describe("claiming", () => {
  test("a detached worktree at the tip claims, pushes and continues on the feature branch", async () => {
    const { remote, host } = setup("detached");
    const result = await claim(host, request());
    expect(result).toMatchObject({ status: "claimed", branch: "feat/f" });
    expect(git(host, "branch", "--show-current")).toBe("feat/f");
    expect(git(remote, "log", "-1", "--format=%s", "main")).toBe("docs(specs): claim f [skip ci]");
    expect(git(host, "rev-parse", "feat/f")).toBe(git(remote, "rev-parse", "main"));
  });

  test("the session's own branch at the tip claims too", async () => {
    const { host } = setup("owned");
    expect((await claim(host, request(["session-wt"]))).status).toBe("claimed");
  });

  test("an unrelated branch at the tip is refused and never moved", async () => {
    const { host } = setup("unrelated");
    const before = state(host);
    const result = await claim(host, request(["session-wt"]));
    expect(result).toMatchObject({ status: "refused" });
    if (result.status === "refused") expect(result.reason).toContain("someone-else");
    expect(state(host)).toEqual(before);
  });

  test("a worktree behind an advanced remote stops before writing; only remote-tracking refs may move", async () => {
    const { primary, host } = setup("detached");
    writeFileSync(join(primary, "README.md"), "advanced\n"); git(primary, "commit", "-q", "-am", "advance"); git(primary, "push", "-q", "origin", "main");
    const before = state(host);
    const result = await claim(host, request());
    expect(result).toMatchObject({ status: "refused" });
    if (result.status === "refused") expect(result.reason).toContain("not at the tip");
    expect(state(host)).toEqual(before);
  });

  test("a stray tracked change stops before writing", async () => {
    const { host } = setup("detached");
    writeFileSync(join(host, "README.md"), "stray\n");
    const before = state(host);
    expect((await claim(host, request())).status).toBe("refused");
    expect(state(host)).toEqual(before);
  });

  test("a rejected push keeps the local claim commit, creates no feature branch and reports the claim pending", async () => {
    const { primary, host } = setup("detached");
    const result = await claim(host, { ...request(), beforePush: () => {
      writeFileSync(join(primary, "README.md"), "raced\n"); git(primary, "commit", "-q", "-am", "race"); git(primary, "push", "-q", "origin", "main");
    } });
    expect(result).toMatchObject({ status: "pending" });
    expect(git(host, "log", "-1", "--format=%s")).toBe("docs(specs): claim f [skip ci]");
    expect(git(host, "branch", "--list", "feat/f")).toBe("");
  });
});

describe("isolation", () => {
  const isolated = "schema_version: 1\nimplement_worktree: isolated\n";
  test("from the primary worktree with isolation on, implement asks the host for a worktree", () => {
    const { primary } = setup("detached", isolated);
    expect(isolation(loadLoopSettings(primary, { overridePath: null }), primary, { hostWorktreeTool: true })).toEqual({ action: "enter-host-worktree" });
  });
  test("a host without a worktree tool stops before writing", () => {
    const { primary } = setup("detached", isolated);
    const before = state(primary);
    const result = isolation(loadLoopSettings(primary, { overridePath: null }), primary, { hostWorktreeTool: false });
    expect(result).toMatchObject({ action: "stop" });
    expect(state(primary)).toEqual(before);
  });
  test("from a host worktree, or without the setting, implement continues where it is", () => {
    const { primary, host } = setup("detached", isolated);
    expect(isolation(loadLoopSettings(host, { overridePath: null }), host, { hostWorktreeTool: true })).toEqual({ action: "continue" });
    const plain = setup("detached");
    expect(isolation(loadLoopSettings(plain.primary, { overridePath: null }), plain.primary, { hostWorktreeTool: false })).toEqual({ action: "continue" });
    expect(primary).not.toBe(host);
  });
});
