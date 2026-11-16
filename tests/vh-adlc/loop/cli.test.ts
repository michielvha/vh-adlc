// The loop entry: route lookup and a command-route review run end to end through the CLI.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { pagesStub } from "./pages-stub";
const STUB = pagesStub();
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
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.name", "t"); git(root, "config", "user.email", "t@example.invalid"); git(root, "add", "-A"); git(root, "commit", "-q", "-m", "f");
  return { root, commit: git(root, "rev-parse", "HEAD") };
}
function cli(...args: string[]) { return cliWith({}, ...args); }
function cliWith(env: Record<string, string>, ...args: string[]) {
  const run = Bun.spawnSync([process.execPath, CLI, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, XDG_CONFIG_HOME: join(tmpdir(), "vh-loop-cli-no-override"), ...env }, timeout: 60_000 });
  return { code: run.exitCode, json: JSON.parse(run.stdout.toString() || "{}") };
}

describe("route", () => {
  test("without settings every operation runs on the host default", () => {
    const { root } = repo({});
    expect(cli("route", "--repo", root, "--operation", "implement").json).toEqual({ role: "implementer", route: "host" });
  });
  test("a per-user override written for another repository's command route leaves an unconfigured repository on the host default", () => {
    const { root } = repo({});
    const config = mkdtempSync(join(tmpdir(), "vh-loop-cli-override-"));
    mkdirSync(join(config, "vh-adlc"), { recursive: true });
    writeFileSync(join(config, "vh-adlc", "loop.local.yaml"), "schema_version: 1\nroles:\n  spec_reviewer:\n    executable: /opt/codex/bin/codex\n");
    const run = Bun.spawnSync([process.execPath, CLI, "route", "--repo", root, "--operation", "spec review"], { stdout: "pipe", stderr: "pipe", env: { ...process.env, XDG_CONFIG_HOME: config }, timeout: 60_000 });
    rmSync(config, { recursive: true, force: true });
    expect([run.exitCode, run.stderr.toString()]).toEqual([0, ""]);
    expect(JSON.parse(run.stdout.toString())).toEqual({ role: "spec_reviewer", route: "host" });
  });
});

describe("review", () => {
  test("a host route prints the route and runs nothing", () => {
    const { root, commit } = repo({});
    const run = cliWith(STUB.env, "review", "--repo", root, "--document", "docs/specs/f.md", "--commit", commit, "--kind", "spec",
      "--docs-revision", "abc", "--binary", STUB.binary, "--plugin-pin", "def");
    expect(run).toEqual({ code: 0, json: { status: "host", role: "spec_reviewer", route: "host" } });
  });

  test("a command route runs the reviewer with the dispatch identity and returns a ready outcome", () => {
    const stubDir = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-cli-stub-")));
    made.push(stubDir);
    const stub = join(stubDir, "reviewer.sh");
    writeFileSync(stub, `#!/bin/bash\nprompt="$2"\ncommit=$(grep -o 'Commit: [0-9a-f]*' <<<"$prompt" | cut -d' ' -f2)\ngrep -q 'TARGET line' <<<"$prompt" || exit 9\nprintf 'MODEL: %s\\nTARGET: %s\\n\\nNO FINDINGS\\n' "$1" "$commit"\n`);
    chmodSync(stub, 0o700);
    const { root, commit } = repo({ ".vh-adlc/loop.yaml": `schema_version: 1\nroles:\n  spec_reviewer:\n    route: command\n    model: gpt-6.1-sol\n    argv: [${stub}, "{model}", "{prompt}"]\n` });
    const run = cliWith(STUB.env, "review", "--repo", root, "--document", "docs/specs/f.md", "--commit", commit, "--kind", "spec",
      "--docs-revision", "abc", "--binary", STUB.binary, "--plugin-pin", "def");
    expect(run.code).toBe(0);
    expect(run.json).toMatchObject({ role: "spec_reviewer", status: "ready", model: "gpt-6.1-sol", target: commit, records: "NO FINDINGS\n" });
  });
});

describe("review pages", () => {
  function reviewer() {
    const stubDir = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-cli-pages-")));
    made.push(stubDir);
    const stub = join(stubDir, "reviewer.sh"), ran = join(stubDir, "ran");
    writeFileSync(stub, `#!/bin/bash\ntouch ${ran}\nprompt="$2"; commit=$(grep -o 'Commit: [0-9a-f]*' <<<"$prompt" | cut -d' ' -f2)\nprintf 'MODEL: %s\\nTARGET: %s\\n\\nNO FINDINGS\\n' "$1" "$commit"\n`);
    chmodSync(stub, 0o700);
    return { stub, ran };
  }
  const routed = (stub: string) => ({ "AGENTS.md": "For tests, read conventions/frontend-testing.md and guides/humanize-prose.md.\n",
    ".vh-adlc/loop.yaml": `schema_version: 1\nroles:\n  spec_reviewer:\n    route: command\n    model: gpt-6.1-sol\n    argv: [${stub}, "{model}", "{prompt}"]\n` });

  test("every page the repository routes is cached before the reviewer starts", () => {
    const { stub } = reviewer(), pages = pagesStub("abc");
    const { root, commit } = repo(routed(stub));
    const run = cliWith(pages.env, "review", "--repo", root, "--document", "docs/specs/f.md", "--commit", commit, "--kind", "spec",
      "--docs-revision", "abc", "--binary", pages.binary, "--plugin-pin", "def");
    expect(run.json).toMatchObject({ status: "ready" });
    // AGENTS.md at the docs revision too: after a merge moves the pin, it is not cached yet, and it routes further pages.
    for (const page of ["AGENTS.md", "conventions/feature-documents.md", "conventions/frontend-testing.md", "guides/humanize-prose.md"])
      expect([page, existsSync(join(pages.cache, "vh-adlc", "docs", "abc", page))]).toEqual([page, true]);
  });

  test("a routed page that cannot be cached leaves the review pending without starting the reviewer", () => {
    const { stub, ran } = reviewer(), pages = pagesStub("abc", { fail: true });
    const { root, commit } = repo(routed(stub));
    const run = cliWith(pages.env, "review", "--repo", root, "--document", "docs/specs/f.md", "--commit", commit, "--kind", "spec",
      "--docs-revision", "abc", "--binary", pages.binary, "--plugin-pin", "def");
    expect([run.code, run.json.status]).toEqual([3, "pending"]);
    expect(run.json.reason).toContain("conventions/frontend-testing.md");
    expect(existsSync(ran)).toBe(false);
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
    const run = cliWith(STUB.env, "review", "--repo", root, "--document", "docs/specs/f.md", "--commit", commit, "--kind", "implementation", "--docs-revision", "abc", "--binary", STUB.binary, "--plugin-pin", "def");
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
  const two = "schema_version: 1\nverification_rungs:\n  - name: browser\n    when: always\n    procedure: Record the browser pass.\n  - name: live-slot\n    when: always\n    procedure: Record the live slot pass.\n";
  const reasons = (json: { results: { name: string; reason: string }[] }) => Object.fromEntries(json.results.map(r => [r.name, r.reason]));

  test("every --record flag counts, not only the last", () => {
    const { root } = repo({ ".vh-adlc/loop.yaml": two });
    const run = cli("rungs", "--repo", root, "--base", "main", "--run", "true", "--record", "browser=passed:table recorded", "--record", "live-slot=passed:slot 4 clean");
    expect(run.json).toMatchObject({ advance: true, blocking: [] });
  });

  test("records joined with semicolons still split, and a semicolon inside a record's text stays in it", () => {
    const { root } = repo({ ".vh-adlc/loop.yaml": two });
    const run = cli("rungs", "--repo", root, "--base", "main", "--run", "true", "--record", "browser=passed:Chromium; Firefox both clean;live-slot=passed:slot 4");
    expect(run.json).toMatchObject({ advance: true, blocking: [] });
    expect(reasons(run.json)).toEqual({ browser: "recorded: Chromium; Firefox both clean", "live-slot": "recorded: slot 4" });
  });
});
