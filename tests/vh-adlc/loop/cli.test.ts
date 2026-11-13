// The loop entry: route lookup and a command-route review run end to end through the CLI.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/loop/cli.ts");
const made: string[] = [];
afterAll(() => { for (const dir of made) { Bun.spawnSync(["chmod", "-R", "u+w", dir]); rmSync(dir, { recursive: true, force: true }); } });

function git(root: string, ...args: string[]) {
  const run = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" } });
  if (run.exitCode !== 0) throw Error(run.stderr.toString());
  return run.stdout.toString().trim();
}
function repo(files: Record<string, string>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-cli-")));
  made.push(root);
  for (const [path, text] of Object.entries({ "docs/specs/f.md": "# F\n", ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text);
  }
  git(root, "init", "-q", "-b", "main"); git(root, "add", "-A"); git(root, "commit", "-q", "-m", "f");
  return { root, commit: git(root, "rev-parse", "HEAD") };
}
function cli(...args: string[]) {
  const run = Bun.spawnSync([process.execPath, CLI, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, XDG_CONFIG_HOME: join(tmpdir(), "vh-loop-cli-no-override") }, timeout: 60_000 });
  return { code: run.exitCode, json: JSON.parse(run.stdout.toString() || "{}") };
}

describe("route", () => {
  test("without settings every operation runs on the host default", () => {
    const { root } = repo({});
    expect(cli("route", "--repo", root, "--operation", "implement").json).toEqual({ role: "implementer", route: "host" });
  });
});

describe("review", () => {
  test("a host route prints the route and runs nothing", () => {
    const { root, commit } = repo({});
    const run = cli("review", "--repo", root, "--document", "docs/specs/f.md", "--commit", commit, "--kind", "spec",
      "--docs-revision", "abc", "--binary", "/bin/false", "--plugin-pin", "def");
    expect(run).toEqual({ code: 0, json: { status: "host", role: "spec_reviewer", route: "host" } });
  });

  test("a command route runs the reviewer with the dispatch identity and returns a ready outcome", () => {
    const stubDir = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-cli-stub-")));
    made.push(stubDir);
    const stub = join(stubDir, "reviewer.sh");
    writeFileSync(stub, `#!/bin/bash\nprompt="$2"\ncommit=$(grep -o 'Commit: [0-9a-f]*' <<<"$prompt" | cut -d' ' -f2)\ngrep -q 'TARGET line' <<<"$prompt" || exit 9\nprintf 'MODEL: %s\\nTARGET: %s\\n\\nNO FINDINGS\\n' "$1" "$commit"\n`);
    chmodSync(stub, 0o700);
    const { root, commit } = repo({ ".vh-adlc/loop.yaml": `schema_version: 1\nroles:\n  spec_reviewer:\n    route: command\n    model: gpt-6.1-sol\n    argv: [${stub}, "{model}", "{prompt}"]\n` });
    const run = cli("review", "--repo", root, "--document", "docs/specs/f.md", "--commit", commit, "--kind", "spec",
      "--docs-revision", "abc", "--binary", "/bin/false", "--plugin-pin", "def");
    expect(run.code).toBe(0);
    expect(run.json).toMatchObject({ role: "spec_reviewer", status: "ready", model: "gpt-6.1-sol", target: commit, records: "NO FINDINGS\n" });
  });
});

describe("claim", () => {
  test("claims a planned document from a detached worktree at the tip and writes the claim into its frontmatter", () => {
    const remoteDir = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-cli-remote-")));
    made.push(remoteDir);
    const remote = join(remoteDir, "r.git");
    git(remoteDir, "init", "-q", "--bare", "-b", "main", remote);
    const { root } = repo({ "docs/specs/f.md": "---\nstatus: planned\nstatus_description: \"Accepted.\"\nissue: null\ngoal: \"g\"\n---\n# F\n" });
    git(root, "remote", "add", "origin", remote); git(root, "push", "-q", "origin", "main");
    const host = join(realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-cli-host-"))), "wt");
    made.push(dirname(host));
    git(root, "worktree", "add", "-q", "--detach", host, "origin/main");
    const run = cli("claim", "--repo", host, "--document", "docs/specs/f.md", "--feature-branch", "feat/f", "--default-branch", "main",
      "--status-description", "Claimed on feat/f.", "--message", "docs(specs): claim f [skip ci]");
    expect(run.json).toMatchObject({ status: "claimed", branch: "feat/f" });
    expect(git(host, "show", "HEAD:docs/specs/f.md")).toContain("status: in-progress\nstatus_description: \"Claimed on feat/f.\"\nissue: null\nbranch: feat/f\n");
    expect(git(remote, "log", "-1", "--format=%s", "main")).toBe("docs(specs): claim f [skip ci]");
  });
});

describe("implementation dispatch", () => {
  test("the implementation reviewer's prompt names the private clone it runs in", () => {
    const stubDir = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-cli-impl-")));
    made.push(stubDir);
    const stub = join(stubDir, "reviewer.sh");
    writeFileSync(stub, `#!/bin/bash\nprompt="$2"; commit=$(grep -o 'Commit: [0-9a-f]*' <<<"$prompt" | cut -d' ' -f2)\ngrep -q 'Repository directory: the current directory, a private clone of the reviewed commit' <<<"$prompt" || exit 9\nprintf 'MODEL: %s\\nTARGET: %s\\n\\nNO FINDINGS\\n' "$1" "$commit"\n`);
    chmodSync(stub, 0o700);
    const { root, commit } = repo({ ".vh-adlc/loop.yaml": `schema_version: 1\nroles:\n  implementation_reviewer:\n    route: command\n    model: gpt-6.1-sol\n    argv: [${stub}, "{model}", "{prompt}"]\n` });
    const run = cli("review", "--repo", root, "--document", "docs/specs/f.md", "--commit", commit, "--kind", "implementation", "--docs-revision", "abc", "--binary", "/bin/false", "--plugin-pin", "def");
    expect(run.json).toMatchObject({ status: "ready" });
  });
});

describe("recorded procedure rungs", () => {
  test("a procedure rung's recorded result at the head counts through the CLI", () => {
    const { root } = repo({ ".vh-adlc/loop.yaml": "schema_version: 1\nverification_rungs:\n  - name: unit\n    when: always\n    command: \"true\"\n  - name: browser\n    when: always\n    procedure: Record the browser pass.\n" });
    const without = cli("rungs", "--repo", root, "--base", "main", "--run", "true");
    expect(without.json).toMatchObject({ advance: false, blocking: ["browser"] });
    const withRecord = cli("rungs", "--repo", root, "--base", "main", "--run", "true", "--record", "browser=passed:summary table recorded");
    expect(withRecord.json).toMatchObject({ advance: true, blocking: [] });
    const failed = cli("rungs", "--repo", root, "--base", "main", "--run", "true", "--record", "browser=failed:page broke");
    expect(failed.json).toMatchObject({ advance: false, blocking: ["browser"] });
  });
});
