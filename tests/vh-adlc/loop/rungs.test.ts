// Verification rungs: which apply to a feature, and when their results let it push, complete or deliver.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadLoopSettings } from "../../../plugins/vh-adlc/scripts/loop/settings";
import { applicableRungs, featureDelta, landingAllowed, mayAdvance, runRungs } from "../../../plugins/vh-adlc/scripts/loop/rungs";

const made: string[] = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });
function git(root: string, ...args: string[]) {
  const run = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" } });
  if (run.exitCode !== 0) throw Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
  return run.stdout.toString().trim();
}
function write(root: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); }
}
function commitAll(root: string, message: string) { git(root, "add", "-A"); git(root, "commit", "-q", "-m", message); return git(root, "rev-parse", "HEAD"); }

const loop = `schema_version: 1
verification_rungs:
  - name: verify
    when: always
    command: "echo 'passed 5 failed 0 skipped 0'"
    skipped_pattern: "^skipped: (.+)$"
  - name: integration
    when: { paths: ["backend/**", "core/**"] }
    command: "true"
  - name: kind
    when: { paths: ["e2e/**"] }
    command: "true"
`;

/** main with one commit, then a feature branch whose first commit changes backend/ and whose last changes only docs. */
function feature(settings = loop) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-rungs-")));
  made.push(root);
  git(root, "init", "-q", "-b", "main");
  write(root, { ".vh-adlc/loop.yaml": settings, "README.md": "r\n", "backend/app.go": "package app\n", "docs/a.md": "a\n" });
  commitAll(root, "base");
  git(root, "switch", "-q", "-c", "feat/x");
  write(root, { "backend/app.go": "package app\n// changed\n" });
  commitAll(root, "backend change");
  write(root, { "docs/a.md": "b\n" });
  const head = commitAll(root, "docs only");
  return { root, head };
}

describe("which rungs apply", () => {
  test("path conditions cover the whole feature delta, not only the last commit", () => {
    const { root } = feature();
    const delta = featureDelta(root, { base: "main" });
    expect(delta.paths.sort()).toEqual(["backend/app.go", "docs/a.md"]);
    expect(applicableRungs(loadLoopSettings(root, { overridePath: null }), delta.paths).map(r => r.name)).toEqual(["verify", "integration"]);
  });

  test("uncommitted changes the feature owns count too", () => {
    const { root } = feature();
    write(root, { "e2e/spec.ts": "x\n" });
    const delta = featureDelta(root, { base: "main" });
    expect(applicableRungs(loadLoopSettings(root, { overridePath: null }), delta.paths).map(r => r.name)).toContain("kind");
  });

  test("after a merge, the merge commit against its first parent still requires the backend rung", () => {
    const { root } = feature();
    git(root, "switch", "-q", "main");
    git(root, "merge", "-q", "--no-ff", "-m", "merge feat/x", "feat/x");
    const merge = git(root, "rev-parse", "HEAD");
    expect(featureDelta(root, { base: "main" }).paths).toEqual([]);
    const landed = featureDelta(root, { merge });
    expect(applicableRungs(loadLoopSettings(root, { overridePath: null }), landed.paths).map(r => r.name)).toContain("integration");
  });

  test("without declared rungs the operation keeps its current command lookup", () => {
    const { root } = feature("schema_version: 1\n");
    const settings = loadLoopSettings(root, { overridePath: null });
    expect(settings.verification_rungs).toEqual([]);
    expect(applicableRungs(settings, ["backend/app.go"])).toEqual([]);
    expect(mayAdvance([], { head: "x", declared: false })).toEqual({ advance: true, lookup: "agents-md", blocking: [] });
  });
});

describe("running rungs", () => {
  test("passing rungs at the head let the feature advance", async () => {
    const { root, head } = feature();
    const settings = loadLoopSettings(root, { overridePath: null });
    const results = await runRungs(root, applicableRungs(settings, featureDelta(root, { base: "main" }).paths));
    expect(results.map(r => [r.name, r.state, r.commit])).toEqual([["verify", "passed", head], ["integration", "passed", head]]);
    expect(mayAdvance(results, { head, declared: true }).advance).toBe(true);
  });

  test("a failed rung blocks push, completion and delivery even with an owner allowance", async () => {
    const { root, head } = feature(loop.replace('command: "true"\n  - name: kind', 'command: "exit 1"\n  - name: kind'));
    const settings = loadLoopSettings(root, { overridePath: null });
    const results = await runRungs(root, applicableRungs(settings, featureDelta(root, { base: "main" }).paths));
    expect(results.find(r => r.name === "integration")?.state).toBe("failed");
    expect(mayAdvance(results, { head, declared: true, allowances: ["integration"] })).toMatchObject({ advance: false, blocking: ["integration"] });
  });

  test("a rung that could not run blocks unless the owner allowed that exact rung", async () => {
    const { root, head } = feature(loop.replace('command: "true"\n  - name: kind', 'command: "no-such-tool-anywhere --check"\n  - name: kind'));
    const settings = loadLoopSettings(root, { overridePath: null });
    const results = await runRungs(root, applicableRungs(settings, featureDelta(root, { base: "main" }).paths));
    expect(results.find(r => r.name === "integration")?.state).toBe("not run");
    expect(mayAdvance(results, { head, declared: true }).advance).toBe(false);
    expect(mayAdvance(results, { head, declared: true, allowances: ["kind"] }).advance).toBe(false);
    expect(mayAdvance(results, { head, declared: true, allowances: ["integration"] }).advance).toBe(true);
  });

  test("a written procedure rung is not run by the script and blocks until its result is recorded", async () => {
    const { root, head } = feature(loop + "  - name: browser\n    when: always\n    procedure: Open every changed page and record the summary table.\n");
    const settings = loadLoopSettings(root, { overridePath: null });
    const results = await runRungs(root, applicableRungs(settings, featureDelta(root, { base: "main" }).paths));
    expect(results.find(r => r.name === "browser")).toMatchObject({ state: "not run", reason: "a written procedure; record its result" });
    expect(mayAdvance(results, { head, declared: true }).blocking).toEqual(["browser"]);
    const recorded = results.map(r => r.name === "browser" ? { ...r, state: "passed" as const, reason: "summary table recorded" } : r);
    expect(mayAdvance(recorded, { head, declared: true }).advance).toBe(true);
  });

  test("an exit-0 run that reports a skipped mandatory subcheck stops advancement unless the allowance names that subcheck", async () => {
    const { root, head } = feature(loop.replace(`command: "echo 'passed 5 failed 0 skipped 0'"`, `command: "printf 'passed 4 failed 0 skipped 1\\\\nskipped: gofumpt (not installed)\\\\n'"`));
    const settings = loadLoopSettings(root, { overridePath: null });
    const results = await runRungs(root, applicableRungs(settings, featureDelta(root, { base: "main" }).paths));
    const verify = results.find(r => r.name === "verify")!;
    expect(verify).toMatchObject({ state: "not run", exit_code: 0, skipped: ["gofumpt (not installed)"] });
    expect(mayAdvance(results, { head, declared: true }).advance).toBe(false);
    expect(mayAdvance(results, { head, declared: true, allowances: ["verify"] }).advance).toBe(false);
    expect(mayAdvance(results, { head, declared: true, allowances: ["verify/gofumpt (not installed)"] }).advance).toBe(true);
  });

  test("a pass recorded on an earlier commit does not count for a later one", async () => {
    const { root } = feature();
    const settings = loadLoopSettings(root, { overridePath: null });
    const results = await runRungs(root, applicableRungs(settings, featureDelta(root, { base: "main" }).paths));
    write(root, { "backend/app.go": "package app\n// again\n" });
    const later = commitAll(root, "later");
    expect(mayAdvance(results, { head: later, declared: true })).toMatchObject({ advance: false, blocking: ["verify", "integration"] });
  });
});

describe("landing", () => {
  test("with rungs or a watch declared, a feature lands by merge commit only", () => {
    const { root } = feature();
    const settings = loadLoopSettings(root, { overridePath: null });
    expect(landingAllowed(settings, "merge")).toEqual({ allowed: true });
    expect(landingAllowed(settings, "fast-forward")).toMatchObject({ allowed: false });
    expect(landingAllowed(loadLoopSettings(feature("schema_version: 1\n").root, { overridePath: null }), "fast-forward")).toEqual({ allowed: true });
  });
});

describe("status parsing", () => {
  test("an unstaged change to a tracked file keeps its path, so its rung still applies", () => {
    const { root } = feature("schema_version: 1\nverification_rungs:\n  - name: integration\n    when: { paths: [\"backend/**\"] }\n    command: \"true\"\n");
    git(root, "switch", "-q", "main"); git(root, "switch", "-q", "-c", "feat/y");
    write(root, { "backend/app.go": "package app\n// unstaged\n" });
    const delta = featureDelta(root, { base: "main" });
    expect(delta.paths).toContain("backend/app.go");
    expect(applicableRungs(loadLoopSettings(root, { overridePath: null }), delta.paths).map(r => r.name)).toEqual(["integration"]);
  });

  test("a path Git quotes is matched by its real name", () => {
    const { root } = feature("schema_version: 1\nverification_rungs:\n  - name: spaced\n    when: { paths: [\"docs/my notes/**\"] }\n    command: \"true\"\n");
    write(root, { "docs/my notes/a b.md": "x\n" });
    expect(featureDelta(root, { base: "main" }).paths).toContain("docs/my notes/a b.md");
  });
});

describe("checks after a merge", () => {
  test("a later passing HEAD does not stand in for a requested merge that fails its checks", () => {
    const { root } = feature("schema_version: 1\nverification_rungs:\n  - name: behavior\n    when: always\n    command: \"grep -q good behavior.txt\"\n");
    write(root, { "behavior.txt": "bad\n" }); commitAll(root, "bad behavior");
    git(root, "switch", "-q", "main"); git(root, "merge", "-q", "--no-ff", "-m", "merge feat/x", "feat/x");
    const merge = git(root, "rev-parse", "HEAD");
    write(root, { "behavior.txt": "good\n" }); commitAll(root, "repair");
    const cli = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/loop/cli.ts");
    const run = Bun.spawnSync([process.execPath, cli, "rungs", "--repo", root, "--merge", merge, "--run", "true"], { stdout: "pipe", stderr: "pipe",
      env: { ...process.env, XDG_CONFIG_HOME: join(root, ".no-override") } });
    const out = JSON.parse(run.stdout.toString());
    expect([run.exitCode, out.advance]).toEqual([3, false]);
    expect(out.blocking).toContain("behavior");
  });
});

describe("renames", () => {
  test("a committed move from code into documentation still selects the code rung", () => {
    const { root, head } = feature("schema_version: 1\nverification_rungs:\n  - name: integration\n    when: { paths: [\"backend/**\"] }\n    command: \"exit 1\"\n");
    git(root, "mv", "backend/app.go", "docs/app.md"); const moved = commitAll(root, "move");
    expect(moved).not.toBe(head);
    const cli = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/loop/cli.ts");
    const run = Bun.spawnSync([process.execPath, cli, "rungs", "--repo", root, "--base", "main", "--run", "true"], { stdout: "pipe", stderr: "pipe",
      env: { ...process.env, XDG_CONFIG_HOME: join(root, ".no-override") } });
    const out = JSON.parse(run.stdout.toString());
    expect(out.paths).toContain("backend/app.go");
    expect([run.exitCode, out.applicable, out.advance]).toEqual([3, ["integration"], false]);
  });
});

describe("the rung report", () => {
  test("a declared rung whose path condition does not hold is reported as not run with that reason, and does not block", () => {
    const { root, head } = feature();
    const cli = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/loop/cli.ts");
    const run = Bun.spawnSync([process.execPath, cli, "rungs", "--repo", root, "--base", "main", "--run", "true"], { stdout: "pipe", stderr: "pipe",
      env: { ...process.env, XDG_CONFIG_HOME: join(root, ".no-override") } });
    const out = JSON.parse(run.stdout.toString());
    expect(out.applicable).toEqual(["verify", "integration"]);
    expect(out.results.map((r: { name: string; state: string }) => [r.name, r.state])).toEqual([["verify", "passed"], ["integration", "passed"], ["kind", "not run"]]);
    expect(out.results.find((r: { name: string }) => r.name === "kind")).toMatchObject({ reason: "its path condition does not hold for this feature (e2e/**)", commit: head });
    expect([run.exitCode, out.advance, out.blocking]).toEqual([0, true, []]);
  });
});
