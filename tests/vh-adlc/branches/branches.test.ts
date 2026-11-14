import { expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { afterMerge, apply, digest, observe, parseOrigin, spawn, type Operation, type Options, type Plan, type Run } from "../../../plugins/vh-adlc/scripts/branches/branches";

const fakeGh = resolve(import.meta.dir, "fake-gh.ts"), cli = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/branches/cli.ts");
const identity = { GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" };
function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", "-C", cwd, "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...identity } });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.toString().trim();
}
const bare = (origin: string, ...args: string[]) => git(origin, `--git-dir=${origin}`, ...args);
function commit(work: string, name: string): string {
  writeFileSync(join(work, name.replace(/\W/g, "-") + ".txt"), name + "\n");
  git(work, "add", "-A"); git(work, "commit", "-q", "-m", name);
  return git(work, "rev-parse", "HEAD");
}
/** Creates and pushes a branch with one commit, returning its tip; the clone stays on main. */
function branch(work: string, name: string): string {
  git(work, "switch", "-q", "-c", name, "main");
  const tip = commit(work, name);
  git(work, "push", "-q", "-u", "origin", name); git(work, "switch", "-q", "main");
  return tip;
}
const pr = (number: number, ref: string, sha: string, merged = true) => ({ number, state: merged ? "closed" : "open", merged_at: merged ? "2026-11-01T00:00:00Z" : null, head: { ref, sha, repo: { full_name: "acme/demo" } }, base: { ref: "main" } });

function fixture(pulls: (f: { work: string; origin: string }) => unknown[] = () => []) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "vh-branches-"))), origin = join(dir, "origin.git"), work = join(dir, "work"), state = join(dir, "state.json");
  git(dir, "init", "-q", "--bare", origin); git(dir, "clone", "-q", origin, work);
  commit(work, "base"); git(work, "push", "-q", "origin", "HEAD:main");
  const write = (value: Record<string, unknown>) => writeFileSync(state, JSON.stringify({ repository: "acme/demo", repo: { default_branch: "main", delete_branch_on_merge: false }, protected: [], pulls: [], ...value }));
  write({});
  const run: Run = argv => {
    if (argv[0] !== "gh") return spawn(argv);
    const r = Bun.spawnSync(["bun", fakeGh, ...argv.slice(1)], { stdout: "pipe", stderr: "pipe", env: { ...process.env, BRANCHES_FIXTURE: state } });
    return { code: r.exitCode ?? 1, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
  };
  const f = { dir, origin, work, state, run, write, options: { repo: work, repository: "acme/demo", run } };
  return { ...f, setPulls: () => write({ pulls: pulls(f) }) };
}
const heads = (origin: string) => bare(origin, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n").filter(Boolean).sort();
const locals = (work: string) => git(work, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n").filter(Boolean).sort();
const summary = (ops: { kind: string; branch?: string; ref?: string }[]) => ops.map(op => op.branch ?? op.ref ? `${op.kind}:${op.branch ?? op.ref}` : op.kind);
const ignores = ["node_modules/", ".env", "build out/", "caché/", ".claude/"].join("\n") + "\n";
function put(root: string, files: Record<string, string>) {
  for (const [name, text] of Object.entries(files)) { mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), text); }
}
const listing = (root: string) => (readdirSync(root, { recursive: true }) as string[]).sort();
/** A fixture whose main ignores build output; `merged` adds a worktree on a new branch with one merged-PR commit. */
function repo(quiet = false) {
  const f = fixture(), pulls: unknown[] = [];
  if (quiet) git(f.work, "config", "status.showUntrackedFiles", "no");
  put(f.work, { ".gitignore": ignores }); git(f.work, "add", ".gitignore"); git(f.work, "commit", "-q", "-m", "ignore build output"); git(f.work, "push", "-q", "origin", "main");
  const merged = (name: string, opts: { at?: string; add?: string[]; setup?: (path: string) => void } = {}) => {
    const path = opts.at ?? join(f.dir, name), ref = `feat/${name}`;
    git(f.work, ...(opts.add ?? []), "worktree", "add", "-q", "-b", ref, path, "main");
    put(path, { [`${name}.txt`]: `${name}\n` }); opts.setup?.(path);
    git(path, "add", "-A"); git(path, "commit", "-q", "-m", name); git(path, "push", "-q", "-u", "origin", ref);
    pulls.push(pr(pulls.length + 1, ref, git(path, "rev-parse", "HEAD"))); f.write({ pulls });
    return path;
  };
  return { ...f, merged, plan: (run?: Run) => observe(run ? { ...f.options, run } : f.options).plan };
}
const approve = (options: Options, plan: Plan) => { const text = JSON.stringify(plan); return apply(options, text, digest(text)); };
const removal = (plan: Plan, path: string) => plan.operations.find((o): o is Extract<Operation, { kind: "remove-worktree" }> => o.kind === "remove-worktree" && o.path === path);
const keptTrees = (plan: Plan, path: string) => plan.kept.filter(k => k.scope === "worktree" && k.path === path).map(k => k.reason);
const why = (plan: Plan, path: string) => keptTrees(plan, path).join(" | ");
const localWhy = (plan: Plan, branch: string) => plan.kept.find(k => k.scope === "local" && k.branch === branch)?.reason ?? "";
const listed = (f: { work: string }) => git(f.work, "worktree", "list", "--porcelain");
/** Runs cli.ts with the fake gh first on PATH. */
function cliFor(f: { dir: string; state: string }) {
  const shim = join(f.dir, "bin");
  if (!existsSync(shim)) { mkdirSync(shim); writeFileSync(join(shim, "gh"), `#!/bin/sh\nexec bun ${JSON.stringify(fakeGh)} "$@"\n`, { mode: 0o755 }); }
  const env = { ...process.env, PATH: shim + delimiter + process.env.PATH, BRANCHES_FIXTURE: f.state };
  return (...args: string[]) => {
    const r = Bun.spawnSync(["bun", cli, ...args], { stdout: "pipe", stderr: "pipe", env });
    return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  };
}

test("a sweep plan removes only proven-merged branches and applies only the exact approved bytes", () => {
  const f = fixture();
  const squashed = branch(f.work, "feat/squashed");
  commit(f.work, "squash of feat/squashed"); git(f.work, "push", "-q", "origin", "main");
  const open = branch(f.work, "feat/open");
  branch(f.work, "feat/unmerged");
  const moved = branch(f.work, "feat/moved");
  git(f.work, "switch", "-q", "feat/moved"); commit(f.work, "after merge"); git(f.work, "push", "-q"); git(f.work, "switch", "-q", "main");
  const tree = branch(f.work, "feat/tree");
  git(f.work, "worktree", "add", "-q", join(f.dir, "tree"), "feat/tree");
  git(f.work, "push", "-q", "origin", "main:release");
  git(f.work, "update-ref", "refs/remotes/origin/gone", git(f.work, "rev-parse", "main"));
  f.write({ protected: ["main", "release"], pulls: [pr(1, "feat/squashed", squashed), pr(2, "feat/open", open, false), pr(3, "feat/moved", moved), pr(4, "feat/tree", tree)] });

  const { plan } = observe(f.options);
  expect(summary(plan.operations)).toEqual(["enable-auto-delete", "delete-remote:feat/squashed", "delete-remote:feat/tree", "prune-tracking:refs/remotes/origin/gone", "remove-worktree:feat/tree", "delete-local:feat/squashed", "delete-local:feat/tree"]);
  expect(plan.kept).toContainEqual({ scope: "remote", branch: "feat/open", reason: "head of open PR #2" });
  expect(plan.kept).toContainEqual({ scope: "remote", branch: "feat/moved", reason: "unmerged commits" });
  expect(plan.kept).toContainEqual({ scope: "remote", branch: "release", reason: "protected" });
  expect(summary(observe({ ...f.options, worktrees: false }).plan.operations)).not.toContain("remove-worktree:feat/tree");

  const shim = join(f.dir, "bin"), planPath = join(f.dir, "plan.json");
  mkdirSync(shim); writeFileSync(join(shim, "gh"), `#!/bin/sh\nexec bun ${JSON.stringify(fakeGh)} "$@"\n`, { mode: 0o755 });
  const env = { ...process.env, PATH: shim + delimiter + process.env.PATH, BRANCHES_FIXTURE: f.state };
  const cmd = (...args: string[]) => Bun.spawnSync(["bun", cli, ...args], { stdout: "pipe", stderr: "pipe", env });
  const planned = cmd("plan", "--repo", f.work, "--repository", "acme/demo", "--worktrees", "true", "--output", planPath);
  expect(planned.exitCode, planned.stderr.toString()).toBe(0);
  const shown = JSON.parse(planned.stdout.toString());
  expect(shown.digest).toBe(digest(readFileSync(planPath, "utf8")));
  expect(summary(shown.operations)).toContain("remove-worktree:feat/tree");

  expect(cmd("apply", "--repo", f.work, "--plan", planPath, "--approved-digest", "0".repeat(64)).exitCode).toBe(2);
  expect(heads(f.origin)).toContain("feat/squashed");
  const applied = cmd("apply", "--repo", f.work, "--plan", planPath, "--approved-digest", shown.digest);
  expect(applied.exitCode, applied.stdout.toString() + applied.stderr.toString()).toBe(0);
  expect(heads(f.origin)).toEqual(["feat/moved", "feat/open", "feat/unmerged", "main", "release"]);
  expect(locals(f.work)).toEqual(["feat/moved", "feat/open", "feat/unmerged", "main"]);
  expect(existsSync(join(f.dir, "tree"))).toBe(false);
  expect(git(f.work, "for-each-ref", "refs/remotes/origin/gone")).toBe("");
  expect(JSON.parse(readFileSync(f.state, "utf8")).repo.delete_branch_on_merge).toBe(true);
}, 60000);

test("a branch that moves after observation is never deleted", () => {
  const f = fixture();
  const tip = branch(f.work, "feat/racing");
  commit(f.work, "squash"); git(f.work, "push", "-q", "origin", "main");
  f.write({ pulls: [pr(1, "feat/racing", tip)] });
  const other = join(f.dir, "other");
  git(f.dir, "clone", "-q", "-b", "feat/racing", f.origin, other);
  const text = JSON.stringify(observe(f.options).plan);
  // The push lands between the helper's fresh observation and its leased deletion.
  const racing: Run = argv => {
    if (argv.includes("push") && argv.includes("--porcelain")) { commit(other, "late work"); git(other, "push", "-q"); }
    return f.run(argv);
  };
  const result = apply({ ...f.options, run: racing }, text, digest(text));
  expect(result.complete).toBe(false);
  expect(result.outcomes.find(o => o.operation.kind === "delete-remote")!.status).toBe("failed");
  expect(bare(f.origin, "rev-parse", "feat/racing")).toBe(git(other, "rev-parse", "HEAD"));

  commit(other, "more work"); git(other, "push", "-q");
  const again = apply(f.options, text, digest(text));
  expect(again.outcomes.find(o => o.operation.kind === "delete-remote")!.status).toBe("changed");
  expect(heads(f.origin)).toContain("feat/racing");
}, 60000);

test("after-merge removes only the merged PR's branch, remotely and locally, including after a squash", () => {
  const f = fixture(({ work }) => [pr(1, "feat/a", git(work, "rev-parse", "feat/a")), pr(2, "feat/b", git(work, "rev-parse", "feat/b")), pr(3, "feat/c", git(work, "rev-parse", "feat/c"), false)]);
  branch(f.work, "feat/a"); branch(f.work, "feat/b"); branch(f.work, "feat/c");
  commit(f.work, "squash of a and b"); git(f.work, "push", "-q", "origin", "main");
  git(f.work, "update-ref", "refs/remotes/origin/gone", git(f.work, "rev-parse", "main"));
  f.setPulls();

  const first = afterMerge(f.options, 1);
  expect(first.complete).toBe(true);
  expect(summary(first.outcomes.map(o => o.operation))).toEqual(["delete-remote:feat/a", "delete-local:feat/a"]);
  expect(first.note).toContain("automatic head-branch deletion is off");
  expect(heads(f.origin)).toEqual(["feat/b", "feat/c", "main"]);
  expect(git(f.work, "for-each-ref", "refs/remotes/origin/gone")).not.toBe("");

  bare(f.origin, "branch", "-D", "feat/b");
  const second = afterMerge(f.options, 2);
  expect(summary(second.outcomes.map(o => o.operation))).toEqual(["prune-tracking:refs/remotes/origin/feat/b", "delete-local:feat/b"]);
  expect(locals(f.work)).toEqual(["feat/c", "main"]);
  expect(() => afterMerge(f.options, 3)).toThrow("PR #3 is not merged");
  expect(readFileSync(f.state + ".calls", "utf8")).not.toContain("PATCH");
}, 60000);

test("incomplete GitHub observation refuses to plan any deletion", () => {
  const f = fixture();
  branch(f.work, "feat/x");
  f.write({ fail: ["repos/acme/demo/branches"] });
  expect(() => observe(f.options)).toThrow("GitHub request repos/acme/demo/branches failed");
});

test("origin parsing accepts GitHub URL forms and maps SSH host aliases to github.com", () => {
  expect(parseOrigin("git@github.com:acme/demo.git")).toEqual({ hostname: "github.com", repository: "acme/demo" });
  expect(parseOrigin("https://github.com/acme/demo")).toEqual({ hostname: "github.com", repository: "acme/demo" });
  expect(parseOrigin("git@github-personal:acme/demo.git")).toEqual({ hostname: "github.com", repository: "acme/demo" });
  expect(parseOrigin("ssh://git@ghe.example.com:2222/acme/demo.git")).toEqual({ hostname: "ghe.example.com", repository: "acme/demo" });
  expect(parseOrigin("/srv/git/demo.git")).toBeNull();
});

test("a branch in a worktree mid-rebase is kept even though the worktree shows a detached HEAD", () => {
  const f = fixture();
  writeFileSync(join(f.work, "shared.txt"), "base\n"); git(f.work, "add", "-A"); git(f.work, "commit", "-q", "-m", "shared"); git(f.work, "push", "-q", "origin", "main");
  git(f.work, "switch", "-q", "-c", "feat/rebasing");
  writeFileSync(join(f.work, "shared.txt"), "branch\n"); git(f.work, "commit", "-q", "-am", "branch change");
  const tip = git(f.work, "rev-parse", "HEAD"); git(f.work, "push", "-q", "-u", "origin", "feat/rebasing"); git(f.work, "switch", "-q", "main");
  writeFileSync(join(f.work, "shared.txt"), "main\n"); git(f.work, "commit", "-q", "-am", "squash and conflict"); git(f.work, "push", "-q", "origin", "main");
  const tree = join(f.dir, "rebasing");
  git(f.work, "worktree", "add", "-q", tree, "feat/rebasing");
  expect(Bun.spawnSync(["git", "-C", tree, "-c", "commit.gpgsign=false", "rebase", "main"], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...identity } }).exitCode).not.toBe(0);
  f.write({ pulls: [pr(1, "feat/rebasing", tip)] });
  const { plan } = observe({ ...f.options, worktrees: true });
  expect(summary(plan.operations)).not.toContain("delete-local:feat/rebasing");
  expect(plan.kept.find(k => k.scope === "local" && k.branch === "feat/rebasing")!.reason).toContain("rebase or bisect in progress");
});

test("default-branch reachability proves a merge only for a branch with its own merged commits", () => {
  const f = fixture();
  const old = git(f.work, "rev-parse", "main");
  git(f.work, "switch", "-q", "-c", "feat/merged"); commit(f.work, "own work"); git(f.work, "push", "-q", "-u", "origin", "feat/merged"); git(f.work, "switch", "-q", "main");
  git(f.work, "merge", "-q", "--no-ff", "-m", "merge feat/merged", "feat/merged"); git(f.work, "push", "-q", "origin", "main");
  git(f.work, "push", "-q", "origin", `${old}:refs/heads/release/cut`);
  const { plan } = observe({ ...f.options, now: Date.now() / 1000 + 30 * 24 * 3600 });
  expect(summary(plan.operations)).toContain("delete-remote:feat/merged");
  expect(plan.kept).toContainEqual({ scope: "remote", branch: "release/cut", reason: "points at a commit on main's own history and has no merged PR" });
});

test("after-merge of a fork PR leaves a same-named branch of this repository alone", () => {
  const f = fixture();
  const tip = branch(f.work, "patch-1");
  git(f.work, "merge", "-q", "--no-ff", "-m", "merge", "patch-1"); git(f.work, "push", "-q", "origin", "main");
  f.write({ pulls: [pr(1, "patch-1", tip), { ...pr(2, "patch-1", "f".repeat(40)), head: { ref: "patch-1", sha: "f".repeat(40), repo: { full_name: "contrib/demo" } } }] });
  const result = afterMerge(f.options, 2);
  expect(result.outcomes).toEqual([]);
  expect(result.note).toContain("contrib/demo");
  expect(heads(f.origin)).toContain("patch-1");
  expect(locals(f.work)).toContain("patch-1");
});

test("auto-delete reports the setting, enables it only on request and confirms it from GitHub's answer", () => {
  const f = fixture(), calls = () => readFileSync(f.state + ".calls", "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as string[]);
  const shim = join(f.dir, "bin");
  mkdirSync(shim); writeFileSync(join(shim, "gh"), `#!/bin/sh\nexec bun ${JSON.stringify(fakeGh)} "$@"\n`, { mode: 0o755 });
  const cmd = (...args: string[]) => {
    const r = Bun.spawnSync(["bun", cli, "auto-delete", ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, PATH: shim + delimiter + process.env.PATH, BRANCHES_FIXTURE: f.state } });
    return { code: r.exitCode, out: r.exitCode === 2 ? {} : JSON.parse(r.stdout.toString() || "{}"), err: r.stderr.toString() };
  };
  const patched = () => calls().filter(c => c.includes("PATCH")).length;

  const off = cmd("--repo", f.work, "--repository", "acme/demo");
  expect([off.code, off.out.delete_branch_on_merge, off.out.changed, patched()]).toEqual([1, false, false, 0]);

  f.write({ ignore_patch: true });
  const ignored = cmd("--repository", "acme/demo", "--enable");
  expect([ignored.code, ignored.out.delete_branch_on_merge, ignored.out.detail]).toEqual([1, false, "setting did not change"]);

  f.write({});
  const enabled = cmd("--repository", "acme/demo", "--enable");
  expect([enabled.code, enabled.out.delete_branch_on_merge, enabled.out.changed]).toEqual([0, true, true]);
  expect(JSON.parse(readFileSync(f.state, "utf8")).repo.delete_branch_on_merge).toBe(true);

  const before = patched(), again = cmd("--repo", f.work, "--repository", "acme/demo", "--enable");
  expect([again.code, again.out.changed, patched()]).toEqual([0, false, before]);
  expect(cmd().code).toBe(2);
});

test("plan proposes worktree removal unless --worktrees false, and after-merge --worktrees false leaves the worktree and branch", () => {
  const f = fixture();
  const tip = branch(f.work, "feat/done"), tree = join(f.dir, "done");
  git(f.work, "worktree", "add", "-q", tree, "feat/done");
  f.write({ pulls: [pr(1, "feat/done", tip)] });
  const cmd = cliFor(f), planPath = join(f.dir, "plan.json");

  const byDefault = cmd("plan", "--repo", f.work, "--repository", "acme/demo", "--output", planPath);
  expect(byDefault.code, byDefault.err).toBe(0);
  const shown = JSON.parse(byDefault.out);
  expect(shown.schema_version).toBe(2);
  expect(summary(shown.operations)).toEqual(["enable-auto-delete", "delete-remote:feat/done", "remove-worktree:feat/done", "delete-local:feat/done"]);

  const off = cmd("plan", "--repo", f.work, "--repository", "acme/demo", "--worktrees", "false", "--output", planPath);
  expect(off.code, off.err).toBe(0);
  const without = JSON.parse(off.out);
  expect(summary(without.operations)).toEqual(["enable-auto-delete", "delete-remote:feat/done"]);
  expect(without.kept).toContainEqual(expect.objectContaining({ scope: "local", branch: "feat/done" }));
  expect(without.kept).toContainEqual(expect.objectContaining({ scope: "worktree", path: realpathSync(tree), branch: "feat/done" }));

  const merged = cmd("after-merge", "--repo", f.work, "--repository", "acme/demo", "--pull", "1", "--worktrees", "false");
  expect(merged.code, merged.out + merged.err).toBe(0);
  expect(summary(JSON.parse(merged.out).outcomes.map((o: { operation: { kind: string; branch?: string } }) => o.operation))).toEqual(["delete-remote:feat/done"]);
  expect(existsSync(join(tree, ".git"))).toBe(true);
  expect(git(f.work, "worktree", "list", "--porcelain")).toContain(`worktree ${realpathSync(tree)}`);
  expect(locals(f.work)).toContain("feat/done");
}, 60000);

test("apply refuses a plan written in the previous format", () => {
  const f = fixture();
  const tip = branch(f.work, "feat/old");
  f.write({ pulls: [pr(1, "feat/old", tip)] });
  const planPath = join(f.dir, "plan.json"), cmd = cliFor(f);
  const old = { schema_version: 1, repository: "acme/demo", default_branch: "main", default_oid: git(f.work, "rev-parse", "main"), delete_branch_on_merge: false, worktrees: true,
    operations: [{ kind: "delete-local", branch: "feat/old", oid: tip, proof: `contained in merged PR #1 head ${tip.slice(0, 12)}` }], kept: [] };
  const text = JSON.stringify(old, null, 2) + "\n";
  writeFileSync(planPath, text);
  const applied = cmd("apply", "--repo", f.work, "--plan", planPath, "--approved-digest", digest(text));
  expect(applied.code).not.toBe(0);
  expect(applied.err).toContain("unsupported branch plan");
  expect(locals(f.work)).toContain("feat/old");
}, 60000);

for (const quiet of [false, true]) test(`a merged worktree holding only ignored files is planned with each ignored path's files and bytes, then removed with its branch${quiet ? " under status.showUntrackedFiles=no" : ""}`, () => {
  const f = repo(quiet);
  const deps = f.merged("deps"), names = f.merged("names");
  put(deps, { "node_modules/a/index.js": "module.exports = 1;\n", "node_modules/b/package.json": "{}\n", ".env": "TOKEN=x\n" });
  symlinkSync("../a", join(deps, "node_modules/b/a"));
  put(names, { "build out/x.o": "12345", "caché/y": "ab" });
  const plan = f.plan();
  expect(removal(plan, deps)).toMatchObject({ branch: "feat/deps", ignored: [{ path: ".env", files: 1, bytes: 8 }, { path: "node_modules/", files: 3, bytes: 27 }] });
  expect(removal(plan, names)?.ignored).toEqual([{ path: '"build out/"', files: 1, bytes: 5 }, { path: '"cach\\303\\251/"', files: 1, bytes: 2 }]);
  const result = approve(f.options, plan);
  expect(result.complete, JSON.stringify(result.outcomes)).toBe(true);
  for (const path of [deps, names]) { expect(existsSync(path)).toBe(false); expect(listed(f)).not.toContain(path); }
  expect(locals(f.work)).toEqual(["main"]);
}, 120000);

for (const quiet of [false, true]) test(`a worktree with a changed or untracked file beside ignored node_modules is kept and survives apply${quiet ? " under status.showUntrackedFiles=no" : ""}`, () => {
  const f = repo(quiet);
  const changed = f.merged("changed"), untracked = f.merged("untracked");
  for (const path of [changed, untracked]) put(path, { "node_modules/a/index.js": "x\n" });
  const twin = f.plan();
  expect([removal(twin, changed)?.branch, removal(twin, untracked)?.branch]).toEqual(["feat/changed", "feat/untracked"]);
  put(changed, { "changed.txt": "edited\n" }); put(untracked, { "notes.md": "draft\n" });
  const plan = f.plan();
  for (const [path, name] of [[changed, "changed"], [untracked, "untracked"]] as const) {
    expect(removal(plan, path)).toBeUndefined();
    expect(why(plan, path)).toContain("changed or untracked files");
    expect(localWhy(plan, `feat/${name}`)).toContain(path);
  }
  const before = [listing(changed), listing(untracked)];
  approve(f.options, twin);
  expect([listing(changed), listing(untracked)]).toEqual(before);
  expect(readFileSync(join(changed, "changed.txt"), "utf8")).toBe("edited\n");
  for (const path of [changed, untracked]) expect(listed(f)).toContain(`worktree ${path}`);
  expect(locals(f.work)).toEqual(["feat/changed", "feat/untracked", "main"]);
}, 120000);

test("a worktree with another worktree or any .git inside its ignored .claude/ is kept", () => {
  const f = repo();
  const outer = f.merged("outer"), holder = f.merged("holder");
  const inner = join(outer, ".claude", "worktrees", "inner"), nested = join(holder, ".claude", "repo");
  git(f.work, "worktree", "add", "-q", "-b", "feat/inner", inner, "main"); put(inner, { "wip.txt": "wip\n" });
  git(f.dir, "init", "-q", nested); put(nested, { "notes.txt": "notes\n" });
  const plan = f.plan();
  expect(removal(plan, outer)).toBeUndefined();
  expect(why(plan, outer)).toContain(`another worktree inside it: ${inner}`);
  expect(removal(plan, holder)).toBeUndefined();
  expect(why(plan, holder)).toContain(".git inside ignored path .claude/");
  expect(localWhy(plan, "feat/holder")).toContain(holder);
}, 120000);

test("a worktree with an initialized or a deinitialized submodule is kept", () => {
  const f = repo(), lib = join(f.dir, "lib");
  git(f.dir, "init", "-q", lib); commit(lib, "lib");
  const sub = (path: string) => { git(path, "-c", "protocol.file.allow=always", "submodule", "add", "-q", lib, "lib"); };
  const live = f.merged("live", { setup: sub }), gone = f.merged("gone", { setup: sub });
  git(gone, "submodule", "deinit", "-q", "-f", "lib");
  expect(existsSync(join(f.work, ".git", "worktrees", "gone", "modules"))).toBe(true);
  const plan = f.plan();
  for (const path of [live, gone]) { expect(removal(plan, path)).toBeUndefined(); expect(why(plan, path)).toContain("submodule"); }
}, 120000);

test("a worktree hiding a change behind skip-worktree or assume-unchanged is kept", () => {
  const f = repo();
  const skip = f.merged("skip"), assume = f.merged("assume");
  put(skip, { "skip.txt": "hidden\n" }); git(skip, "update-index", "--skip-worktree", "skip.txt");
  put(assume, { "assume.txt": "hidden\n" }); git(assume, "update-index", "--assume-unchanged", "assume.txt");
  expect(git(skip, "status", "--porcelain") + git(assume, "status", "--porcelain")).toBe("");
  const plan = f.plan();
  expect(removal(plan, skip)).toBeUndefined();
  expect(why(plan, skip)).toContain("skip-worktree entry skip.txt");
  expect(removal(plan, assume)).toBeUndefined();
  expect(why(plan, assume)).toContain("assume-unchanged entry assume.txt");
}, 120000);

test("a worktree with a directory the user cannot read, enter or write is kept, and apply leaves every file", () => {
  const f = repo();
  const sealed = f.merged("sealed"), readonly = f.merged("readonly"), noenter = f.merged("noenter"), noread = f.merged("noread"), hidden = f.merged("hidden");
  for (const path of [readonly, noenter, noread, hidden]) put(path, { "node_modules/pkg/index.js": "x\n" });
  const twin = f.plan();
  put(sealed, { "scratch/data.txt": "data\n" });
  const trees = [sealed, readonly, noenter, noread, hidden], before = trees.map(listing);
  const modes: [string, number][] = [[join(sealed, "scratch"), 0o000], [join(readonly, "node_modules/pkg"), 0o555], [join(noenter, "node_modules/pkg"), 0o600], [join(noread, "node_modules/pkg"), 0o300], [join(hidden, "node_modules"), 0o000]];
  try {
    for (const [dir, mode] of modes) chmodSync(dir, mode);
    const plan = f.plan();
    for (const path of trees) expect(removal(plan, path)).toBeUndefined();
    expect(why(plan, sealed)).toContain("cannot read, enter or write scratch");
    for (const path of [readonly, noenter, noread]) expect(why(plan, path)).toContain("cannot read, enter or write node_modules/pkg");
    expect(why(plan, noenter)).toContain("cannot read ignored path node_modules/");
    // Git cannot open a mode 000 ignored directory, so it is named by the walk rather than listed as ignored.
    expect(why(plan, hidden)).toContain("cannot read, enter or write node_modules");
    approve(f.options, twin);
  } finally {
    for (const [dir] of modes) chmodSync(dir, 0o755);
  }
  expect(trees.map(listing)).toEqual(before);
  for (const path of trees) expect(listed(f)).toContain(`worktree ${path}`);
  expect(locals(f.work)).toEqual(["feat/hidden", "feat/noenter", "feat/noread", "feat/readonly", "feat/sealed", "main"]);
}, 120000);

test("a worktree whose status check fails, times out or writes to stderr is kept", () => {
  const f = repo();
  const failing = f.merged("failing"), slow = f.merged("slow"), noisy = f.merged("noisy");
  const run: Run = argv => {
    if (!argv.includes("status")) return f.run(argv);
    if (argv.includes(failing)) return { code: 128, stdout: "", stderr: "fatal: index file corrupt\n" };
    if (argv.includes(slow)) return { code: 1, stdout: "", stderr: "", timedOut: true };
    const real = f.run(argv);
    return argv.includes(noisy) ? { ...real, stderr: "warning: could not open directory 'x/': Permission denied\n" } : real;
  };
  const plan = f.plan(run);
  for (const path of [failing, slow, noisy]) expect(removal(plan, path)).toBeUndefined();
  expect(why(plan, failing)).toContain("status check failed (exit 128)");
  expect(why(plan, slow)).toContain("status check timed out");
  expect(why(plan, noisy)).toContain("status check wrote to stderr");
}, 120000);

test("a worktree with a per-worktree ref is kept with its directory present or missing", () => {
  const f = repo();
  const here = f.merged("here"), gone = f.merged("gone");
  for (const path of [here, gone]) git(path, "update-ref", "refs/worktree/keep", "HEAD");
  rmSync(gone, { recursive: true, force: true });
  const plan = f.plan();
  for (const path of [here, gone]) { expect(removal(plan, path)).toBeUndefined(); expect(why(plan, path)).toContain("per-worktree ref"); }
}, 120000);

for (const onBranch of [false, true]) test(`two admin directories naming one missing path keep every entry with that path (${onBranch ? "one on a merged branch" : "both detached"})`, () => {
  const f = repo(), p1 = join(f.dir, "p1", "w"), p2 = join(f.dir, "p2", "w"), admin = join(f.work, ".git", "worktrees");
  git(f.work, "worktree", "add", "-q", "--detach", p1, "main");
  if (onBranch) f.merged("w", { at: p2 }); else git(f.work, "worktree", "add", "-q", "--detach", p2, "main");
  rmSync(p2, { recursive: true, force: true });
  copyFileSync(join(admin, "w1", "gitdir"), join(admin, "w", "gitdir"));
  const plan = f.plan();
  expect(keptTrees(plan, p2)).toHaveLength(2);
  for (const reason of keptTrees(plan, p2)) expect(reason).toContain("admin directory");
  expect(plan.operations.filter(o => o.kind === "remove-worktree")).toEqual([]);
  if (onBranch) expect(localWhy(plan, "feat/w")).toContain(p2);
}, 120000);

test("a checkout moved over another's path keeps both entries and the admin directory it uses", () => {
  const f = repo(), p1 = join(f.dir, "p1", "w"), p2 = join(f.dir, "p2", "w");
  f.merged("a", { at: p1 }); f.merged("b", { at: p2 });
  rmSync(p1, { recursive: true, force: true }); renameSync(p2, p1);
  const plan = f.plan();
  for (const path of [p1, p2]) expect(why(plan, path)).toContain("admin directory");
  expect(plan.operations.filter(o => o.kind === "remove-worktree")).toEqual([]);
  approve(f.options, plan);
  expect(existsSync(join(f.work, ".git", "worktrees", "w1"))).toBe(true);
  expect(locals(f.work)).toEqual(["feat/a", "feat/b", "main"]);
}, 120000);

test("a worktree added with relative paths is matched to its admin directory and removed like any other", () => {
  const f = repo();
  const rel = f.merged("rel", { add: ["-c", "worktree.useRelativePaths=true"] });
  put(rel, { ".env": "A=1\n" });
  expect(readFileSync(join(f.work, ".git", "worktrees", "rel", "gitdir"), "utf8")).not.toStartWith("/");
  const plan = f.plan();
  expect(removal(plan, rel)?.ignored).toEqual([{ path: ".env", files: 1, bytes: 4 }]);
  expect(approve(f.options, plan).complete).toBe(true);
  expect(existsSync(rel)).toBe(false);
  expect(locals(f.work)).toEqual(["main"]);
}, 120000);

test("a linked worktree on the default branch or an unborn branch has a worktree kept record", () => {
  const f = repo(), onMain = join(f.dir, "on-main"), orphan = join(f.dir, "orphan");
  git(f.work, "worktree", "add", "-q", "--force", onMain, "main");
  git(f.work, "worktree", "add", "-q", "--orphan", "-b", "feat/orphan", orphan);
  const plan = f.plan();
  expect(why(plan, onMain)).toContain("the default branch main is checked out");
  expect(why(plan, orphan)).toContain("unborn branch");
  expect(plan.operations.filter(o => o.kind === "remove-worktree")).toEqual([]);
}, 120000);

test("apply runs the item 1 checks again just before it removes a worktree", () => {
  const f = repo();
  const late = f.merged("late");
  const plan = f.plan();
  expect(removal(plan, late)?.branch).toBe("feat/late");
  // The file lands after apply's fresh observation, while the remote branch is deleted.
  const racing: Run = argv => { if (argv.includes("push") && argv.includes("--porcelain")) put(late, { "late.md": "late\n" }); return f.run(argv); };
  const result = approve({ ...f.options, run: racing }, plan);
  expect(result.outcomes.find(o => o.operation.kind === "remove-worktree")?.status).toBe("changed");
  expect(readFileSync(join(late, "late.md"), "utf8")).toBe("late\n");
  expect(locals(f.work)).toContain("feat/late");
}, 120000);
