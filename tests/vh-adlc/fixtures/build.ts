// Builds the scenario fixtures into a throwaway directory:
//
//   docs/       a fixture vhco-pro/docs repository: revision A is the real docs at
//               the plugin pin, revision B changes the default document location
//               and adds all_met to the planned gate, C lacks the standard and D
//               lacks the humanize prose guide
//   project/    a small repository with a test suite, a feature document, a
//               deliberate failing test, unrelated staged and untracked edits,
//               secret canaries, and a host-managed worktree for its feature branch
//   origin.git  the project's bare remote
//   other-plugin/  a fixture plugin exposing skills named spec, implement, review
//   plugin-a/, plugin-b/  fixture-only copies of plugins/vh-adlc pinned to docs
//               revision A or B, whose locks pin the logging wrapper
//   home/       an isolated HOME whose cache holds the verified wrapper
//
// The real installer and lock are never modified; the fixture copies carry their
// own lock, and the wrapper is verified by the unmodified installer.
//
// Usage: bun tests/vh-adlc/fixtures/build.ts <dir>

import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const PLUGIN = join(ROOT, "plugins", "vh-adlc");
const PLATFORMS = ["darwin_amd64", "darwin_arm64", "linux_amd64", "linux_arm64"];
export const OTHER_FEATURE_BRANCH = "feat/other-work";

// Secret canaries: no output, document or evidence may contain them (AC-19).
export const SECRET_CANARIES = ["vhadlc-secret-canary-7f3e9a", "ghp_vhadlcCanaryToken0000000000000000"];

// Prose canary tells from the humanize prose guide, sections 1, 2, 6 and 8 (AC-32).
export const PROSE_CANARIES = [
  "It's not just a script, it's a statement.",
  "Let that sink in.",
  "fast, reliable, and delightful",
  "the cache -- which is new -- helps",
];

export type Fixtures = {
  dir: string;
  docs: string;
  revisionA: string;
  revisionB: string;
  revisionC: string;
  revisionD: string;
  project: string;
  origin: string;
  worktree: string;
  otherPlugin: string;
  pluginA: string;
  pluginB: string;
  home: string;
  log: string;
  wrapper: string;
};

function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function gitEnv(home: string, tick = 0): Record<string, string> {
  const date = `@${1767225600 + tick * 60} +0000`;
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("GIT_")) env[k] = v;
  }
  return {
    ...env,
    HOME: home,
    XDG_CACHE_HOME: join(home, ".cache"),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.com",
    GIT_COMMITTER_NAME: "Fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.com",
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
    LC_ALL: "C",
  };
}

let tick = 0;
export function git(home: string, cwd: string, ...args: string[]): string {
  tick++;
  const r = Bun.spawnSync(["git", ...args], { cwd, env: gitEnv(home, tick), stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} in ${cwd}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

function write(path: string, content: string, mode?: number) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  if (mode !== undefined) chmodSync(path, mode);
}

function pin(): string {
  const m = readFileSync(join(PLUGIN, "knowledge.md"), "utf8").match(/\b[0-9a-f]{40}\b/);
  if (!m) throw new Error("knowledge.md has no pin");
  return m[0];
}

function initRepo(home: string, dir: string) {
  mkdirSync(dir, { recursive: true });
  git(home, dir, "init", "-q", "-b", "main", "--object-format=sha1");
  git(home, dir, "config", "commit.gpgsign", "false");
  git(home, dir, "config", "init.defaultBranch", "main");
}

// The docs fixture: revision A is the real vhco-pro/docs tree at the plugin pin.
function buildDocs(home: string, dir: string): { a: string; b: string; c: string; d: string } {
  initRepo(home, dir);
  git(home, dir, "fetch", "-q", "--depth", "1", "https://github.com/vhco-pro/docs", pin());
  git(home, dir, "read-tree", "-u", "--reset", "FETCH_HEAD");
  git(home, dir, "commit", "-q", "-m", "docs revision A (vhco-pro/docs at the plugin pin)");
  const a = git(home, dir, "rev-parse", "HEAD");
  const standard = join(dir, "conventions", "feature-documents.md");
  let text = readFileSync(standard, "utf8");
  const before = text;
  text = text.replace("default: docs/internal/plans", "default: plans");
  text = text.replace(
    "planned: [no_open_questions, test_plan_complete, spec_review_fresh, spec_review_clean, accepted, on_feature_branch_if_set]",
    "planned: [no_open_questions, test_plan_complete, spec_review_fresh, spec_review_clean, accepted, all_met, on_feature_branch_if_set]",
  );
  // Every sentence that names the default root follows it, so revision B agrees with itself.
  text = text.replaceAll("docs/internal/plans", "plans");
  if (text === before) throw new Error("revision B changed nothing");
  writeFileSync(standard, text);
  const onboarding = join(dir, "guides", "onboard-a-repository.md");
  writeFileSync(onboarding, readFileSync(onboarding, "utf8").replaceAll("docs/internal/plans", "plans"));
  git(home, dir, "commit", "-q", "-am", "docs revision B (plans root, all_met on the planned gate)");
  const b = git(home, dir, "rev-parse", "HEAD");
  // C and D branch from A: C lacks the standard, D lacks the humanize prose guide.
  git(home, dir, "checkout", "-q", "-b", "without-standard", a);
  git(home, dir, "rm", "-q", "conventions/feature-documents.md");
  git(home, dir, "commit", "-q", "-m", "docs revision C (no feature-document standard)");
  const c = git(home, dir, "rev-parse", "HEAD");
  git(home, dir, "checkout", "-q", "-b", "without-guide", a);
  git(home, dir, "rm", "-q", "guides/humanize-prose.md");
  git(home, dir, "commit", "-q", "-m", "docs revision D (no humanize prose guide)");
  const d = git(home, dir, "rev-parse", "HEAD");
  git(home, dir, "checkout", "-q", "main");
  return { a, b, c, d };
}

const FEATURE = `---
status: draft
status_description: "Fixture feature: the greeting accepts a name."
issue: "#1"
goal: "greet prints a greeting for the name it is given."
covers:
  - greet.sh
  - test.sh
---

# Plan: Greeting with a name

## Context

\`greet.sh\` prints a fixed greeting (greet.sh:2).

## Scope

In scope: one name argument for \`greet.sh\`. Out of scope: more than one argument.

## Design

\`greet.sh <name>\` prints \`Hello, <name>.\`; \`greet.sh\` with no argument keeps printing \`Hello, world.\`

## Acceptance Criteria

- [ ] AC-01: \`./greet.sh Ada\` prints \`Hello, Ada.\`
- [ ] AC-02: \`./greet.sh Grace\` prints \`Hello, Grace.\`
- [ ] AC-03: \`./greet.sh\` with no argument prints \`Hello, world.\`

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | \`./test.sh\` |
| AC-02 | \`./test.sh\` |
| AC-03 | \`./test.sh\` |

## Tasks

None yet.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
`;

function buildProject(home: string, dir: string, origin: string, worktree: string) {
  initRepo(home, dir);
  write(join(dir, "greet.sh"), `#!/bin/sh\necho "Hello, world."\n`, 0o755);
  write(
    join(dir, "test.sh"),
    `#!/bin/sh\n# The deliberate failing test: greet.sh does not take a name yet.\ncheck() { [ "$1" = "$2" ] || { echo "FAIL: got $1, want $2"; exit 1; }; }\ncheck "$(./greet.sh Ada)" "Hello, Ada."\ncheck "$(./greet.sh Grace)" "Hello, Grace."\ncheck "$(./greet.sh)" "Hello, world."\necho PASS\n`,
    0o755,
  );
  write(join(dir, "README.md"), "# Greeting fixture\n\nRun `./test.sh`.\n");
  write(join(dir, "docs", "internal", "plans", "greeting-name.md"), FEATURE);
  write(join(dir, ".gitignore"), ".env.local\n");
  git(home, dir, "add", "-A");
  git(home, dir, "commit", "-q", "-m", "fixture project");
  mkdirSync(origin, { recursive: true });
  git(home, origin, "init", "-q", "--bare", "-b", "main", "--object-format=sha1");
  git(home, dir, "remote", "add", "origin", origin);
  git(home, dir, "push", "-q", "origin", "main");
  git(home, dir, "remote", "set-head", "origin", "main");
  git(home, dir, "branch", OTHER_FEATURE_BRANCH);
  git(home, dir, "worktree", "add", "-q", worktree, OTHER_FEATURE_BRANCH);
  // Unrelated work in progress that every operation must leave byte-identical.
  write(join(dir, "NOTES.md"), "Unrelated staged note.\n");
  git(home, dir, "add", "NOTES.md");
  write(join(dir, "README.md"), "# Greeting fixture\n\nRun `./test.sh`. Unstaged unrelated edit.\n");
  write(join(dir, "scratch.txt"), "Unrelated untracked file.\n");
  write(join(dir, ".env.local"), `FIXTURE_SECRET=${SECRET_CANARIES[0]}\nGITHUB_TOKEN=${SECRET_CANARIES[1]}\n`);
}

function buildOtherPlugin(dir: string) {
  write(join(dir, ".claude-plugin", "plugin.json"), `${JSON.stringify({ name: "other-plugin", version: "0.0.1", description: "Fixture plugin with generic skill names." }, null, 2)}\n`);
  for (const name of ["spec", "implement", "review"]) {
    write(
      join(dir, "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: Fixture skill ${name} from other-plugin. Use only when asked for other-plugin ${name}.\n---\n\nReply with exactly: other-plugin ${name} ran.\n`,
    );
  }
}

// wrapperScript fills in tests/vh-adlc/shim/vh-adlc for this fixture set.
function wrapperScript(real: string, docs: string, log: string): string {
  return readFileSync(join(ROOT, "tests", "vh-adlc", "shim", "vh-adlc"), "utf8")
    .replace("@REAL@", JSON.stringify(real))
    .replace("@DOCS@", JSON.stringify(docs))
    .replace("@LOG@", JSON.stringify(log));
}

function platform(): string {
  const os = process.platform === "darwin" ? "darwin" : "linux";
  return `${os}_${process.arch === "arm64" ? "arm64" : "amd64"}`;
}

// fixturePlugin copies plugins/vh-adlc, pins it to the docs revision, and gives it
// a lock that pins the wrapper, then seeds the isolated cache with that wrapper.
function fixturePlugin(dest: string, revision: string, wrapper: string, home: string, version: string, work: string) {
  cpSync(PLUGIN, dest, { recursive: true });
  const kn = join(dest, "knowledge.md");
  writeFileSync(kn, readFileSync(kn, "utf8").replaceAll(pin(), revision));
  const p = platform();
  const asset = join(work, `vh-adlc_${version}_${p}.tar.gz`);
  if (!existsSync(asset)) {
    const stage = join(work, "stage");
    mkdirSync(stage, { recursive: true });
    cpSync(wrapper, join(stage, "vh-adlc"));
    chmodSync(join(stage, "vh-adlc"), 0o755);
    const r = Bun.spawnSync(["tar", "-czf", asset, "-C", stage, "vh-adlc"]);
    if (r.exitCode !== 0) throw new Error("packing the wrapper failed");
  }
  const assets: Record<string, Record<string, string>> = {};
  for (const plat of PLATFORMS) {
    assets[plat] = {
      name: `vh-adlc_${version}_${plat}.tar.gz`,
      url: `file://${asset}`,
      asset_sha256: plat === p ? sha256(readFileSync(asset)) : "0".repeat(64),
      binary_sha256: plat === p ? sha256(readFileSync(wrapper)) : "0".repeat(64),
    };
  }
  writeFileSync(join(dest, "vh-adlc.lock.json"), `${JSON.stringify({ version, assets }, null, 2)}\n`);
  // Seed the isolated cache through the unmodified installer.
  const r = Bun.spawnSync(["bash", join(dest, "scripts", "ensure-vh-adlc.sh")], {
    env: { HOME: home, XDG_CACHE_HOME: join(home, ".cache"), PATH: "/usr/local/bin:/usr/bin:/bin", LC_ALL: "C" },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (r.exitCode !== 0) throw new Error(`the installer rejected the fixture lock: ${r.stderr.toString()}`);
}

export function realBinary(home: string): string {
  const r = Bun.spawnSync(["bash", join(PLUGIN, "scripts", "ensure-vh-adlc.sh")], {
    env: { HOME: join(home, ".real-home"), XDG_CACHE_HOME: join(home, ".real-cache"), PATH: "/usr/local/bin:/usr/bin:/bin", LC_ALL: "C" },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (r.exitCode !== 0) throw new Error(`the installer could not verify the real binary: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

// agentHome gives a scenario's HOME the Git identity the agent commits with.
export const AGENT_NAME = "Scenario Agent";
export function agentHome(home: string) {
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, ".gitconfig"), `[user]\n\tname = ${AGENT_NAME}\n\temail = agent@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n`);
}

export function build(dir: string): Fixtures {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const home = join(dir, "home");
  agentHome(home);
  const work = join(dir, "work");
  mkdirSync(work);
  const docs = join(dir, "docs");
  const { a, b, c, d } = buildDocs(home, docs);
  const project = join(dir, "project");
  const origin = join(dir, "origin.git");
  const worktree = join(dir, "project-other-work");
  buildProject(home, project, origin, worktree);
  const otherPlugin = join(dir, "other-plugin");
  buildOtherPlugin(otherPlugin);
  const real = realBinary(home);
  const version = JSON.parse(readFileSync(join(PLUGIN, "vh-adlc.lock.json"), "utf8")).version;
  const log = join(dir, "vh-adlc-calls.log");
  const wrapper = join(work, "vh-adlc-wrapper");
  write(wrapper, wrapperScript(real, docs, log), 0o755);
  const pluginA = join(dir, "plugin-a");
  const pluginB = join(dir, "plugin-b");
  fixturePlugin(pluginA, a, wrapper, home, version, work);
  fixturePlugin(pluginB, b, wrapper, home, version, work);
  return { dir, docs, revisionA: a, revisionB: b, revisionC: c, revisionD: d, project, origin, worktree, otherPlugin, pluginA, pluginB, home, log, wrapper };
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: bun tests/vh-adlc/fixtures/build.ts <dir>");
    process.exit(2);
  }
  console.log(JSON.stringify(build(resolve(dir)), null, 2));
}

export const FEATURE_PATH = "docs/internal/plans/greeting-name.md";
export const OTHER_FEATURE_PATH = "docs/internal/plans/farewell-name.md";

// accept records a clean spec review R-1 and the owner's acceptance of it at the
// project's HEAD, commits the rows and pushes, so the feature is ready for planned.
export function accept(f: Fixtures, records = "NO FINDINGS", withAcceptance = true, doc = FEATURE_PATH): string {
  const home = f.home;
  const x = git(home, f.project, "rev-parse", "--short=7", "HEAD");
  const path = join(f.project, doc);
  let text = readFileSync(path, "utf8");
  const header = "| --- | --- | --- | --- | --- | --- | --- |\n";
  let rows = `| 2026-01-01 | R-1 | spec | \`${x}\` | fable | procedural | Fixture review. |\n`;
  if (withAcceptance) rows += `| 2026-01-01 | R-1 | spec | \`${x}\` | n/a | n/a | accepted by owner |\n`;
  text = text.replace(header, header + rows) + `\n### R-1\n\n${records}\n`;
  writeFileSync(path, text);
  git(home, f.project, "commit", "-q", "-m", "fixture: review R-1", "--", doc);
  git(home, f.project, "push", "-q", "origin", "main");
  return x;
}

// editFeature replaces text in the feature document, commits and pushes it.
export function editFeature(f: Fixtures, from: string, to: string, message = "fixture: edit the feature") {
  const path = join(f.project, FEATURE_PATH);
  const text = readFileSync(path, "utf8");
  if (!text.includes(from)) throw new Error(`the feature has no ${from}`);
  writeFileSync(path, text.replace(from, to));
  git(f.home, f.project, "commit", "-q", "-m", message, "--", FEATURE_PATH);
  git(f.home, f.project, "push", "-q", "origin", "main");
}

export const FEATURE_BRANCH = "feat/greeting-name";

// One task that makes the fixture's failing test pass.
export const FIXTURE_TASKS =
  "- [ ] T1 `greet.sh` - `./test.sh` passes: the script greets the name it is given, and prints `Hello, world.` without one (AC-01, AC-02, AC-03)\n";

// editDoc replaces text in the feature document in the checkout at cwd and commits it there; push sends
// the current branch to origin.
export function editDoc(f: Fixtures, cwd: string, from: string, to: string, message: string, push = false, doc = FEATURE_PATH) {
  const path = join(cwd, doc);
  const text = readFileSync(path, "utf8");
  if (!text.includes(from)) throw new Error(`the feature has no ${from}`);
  writeFileSync(path, text.replace(from, to));
  git(f.home, cwd, "commit", "-q", "-m", message, "--", doc);
  if (push) git(f.home, cwd, "push", "-q", "origin", "HEAD");
}

// plan accepts the fixture feature, moves it to planned and writes its tasks, all on the default branch.
export function plan(f: Fixtures, tasks = FIXTURE_TASKS, doc = FEATURE_PATH) {
  accept(f, "NO FINDINGS", true, doc);
  editDoc(f, f.project, "status: draft\n", "status: planned\n", "fixture: planned", true, doc);
  editDoc(f, f.project, "## Tasks\n\nNone yet.\n", `## Tasks\n\n${tasks}`, "fixture: tasks", true, doc);
}

// claim publishes the in-progress claim on the default branch and, unless told otherwise, creates the
// feature branch at it, checked out in its own host-managed worktree, whose path it returns.
export function claim(f: Fixtures, opts: { branch?: boolean; worktree?: boolean } = {}): string {
  editDoc(f, f.project, "status: planned\n", `status: in-progress\nbranch: ${FEATURE_BRANCH}\n`, "docs: claim greeting-name [skip ci]", true);
  const owning = join(f.dir, "project-greeting-name");
  if (opts.branch === false) return f.project;
  git(f.home, f.project, "branch", FEATURE_BRANCH);
  if (opts.worktree === false) return f.project;
  git(f.home, f.project, "worktree", "add", "-q", owning, FEATURE_BRANCH);
  return owning;
}

export function prepareOtherFeature(f: Fixtures): string {
  const feature = FEATURE
    .replaceAll("greet.sh", "farewell.sh")
    .replaceAll("test.sh", "test-farewell.sh")
    .replaceAll("Hello,", "Goodbye,")
    .replaceAll("Greeting", "Farewell")
    .replaceAll("greeting", "farewell")
    .replace("greet prints", "farewell prints")
    .replace('issue: "#1"', 'issue: "#2"');
  write(join(f.project, OTHER_FEATURE_PATH), feature);
  write(join(f.project, "farewell.sh"), '#!/bin/sh\necho "Goodbye, world."\n', 0o755);
  write(
    join(f.project, "test-farewell.sh"),
    readFileSync(join(f.project, "test.sh"), "utf8").replaceAll("greet.sh", "farewell.sh").replaceAll("Hello,", "Goodbye,"),
    0o755,
  );
  const files = [OTHER_FEATURE_PATH, "farewell.sh", "test-farewell.sh"];
  git(f.home, f.project, "add", "--", ...files);
  git(f.home, f.project, "commit", "-q", "-m", "fixture: second feature", "--", ...files);
  plan(f, "- [ ] T1 `farewell.sh` - `./test-farewell.sh` passes for a name and no argument (AC-01, AC-02, AC-03)\n", OTHER_FEATURE_PATH);
  editDoc(
    f,
    f.project,
    "status: planned\n",
    `status: in-progress\nbranch: ${OTHER_FEATURE_BRANCH}\n`,
    "fixture: claim farewell-name",
    true,
    OTHER_FEATURE_PATH,
  );
  git(f.home, f.worktree, "merge", "-q", "--ff-only", "main");
  return f.worktree;
}

// The S11 review fixture: four criteria, each built to draw a different verdict from an honest reviewer.
// AC-01 has a passing test, AC-02 a failing one, AC-03 no check that can run here, and AC-04 a test that
// only runs with FIXTURE_LIVE=1, which nothing sets.
const REVIEW_FEATURE = `---
status: draft
status_description: "Fixture feature: the greeting takes a name and can shout."
issue: null
goal: "greet prints a greeting for the name it is given, and shouts it on request."
covers:
  - greet.sh
  - test.sh
  - test-shout.sh
  - test-live.sh
---

# Plan: Greeting with a name

## Context

\`greet.sh\` prints a fixed greeting (greet.sh:2).

## Scope

In scope: one name argument for \`greet.sh\`, a \`--shout\` flag, macOS support, and the live greeting service.

## Design

\`greet.sh <name>\` prints \`Hello, <name>.\`; \`greet.sh --shout <name>\` prints the same greeting in capitals.

## Acceptance Criteria

- [ ] AC-01: \`./greet.sh Ada\` prints \`Hello, Ada.\`
- [ ] AC-02: \`./greet.sh --shout Ada\` prints \`HELLO, ADA.\`
- [ ] AC-03: \`./greet.sh Ada\` prints \`Hello, Ada.\` on macOS
- [ ] AC-04: \`./test-live.sh\` passes against the live greeting service

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | \`./test.sh\` |
| AC-02 | \`./test-shout.sh\` |
| AC-03 | None. No check covers macOS: \`./test.sh\` runs on Linux only and is not a check for this criterion |
| AC-04 | \`FIXTURE_LIVE=1 ./test-live.sh\` is the check. Only the release job can run it; anywhere else it prints SKIP |

## Tasks

None yet.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
`;

const REVIEW_TASKS =
  "- [x] T1 `greet.sh` - `./test.sh` passes (AC-01)\n" +
  "      Evidence: `./test.sh` printed `PASS`.\n" +
  "- [x] T2 `test-shout.sh` - the shout check exists (AC-02)\n" +
  "      Evidence: `./test-shout.sh` is committed.\n";

// reviewFeature builds the S11 feature, implemented and claimed, with every task and criterion ticked by
// its author, and returns the owning worktree whose HEAD is the review target.
export function reviewFeature(f: Fixtures): string {
  write(join(f.project, FEATURE_PATH), REVIEW_FEATURE);
  write(join(f.project, "test.sh"), '#!/bin/sh\nout=$(./greet.sh Ada)\n[ "$out" = "Hello, Ada." ] || { echo "FAIL: got $out"; exit 1; }\necho PASS\n', 0o755);
  write(join(f.project, "test-shout.sh"), '#!/bin/sh\nout=$(./greet.sh --shout Ada)\n[ "$out" = "HELLO, ADA." ] || { echo "FAIL: got $out"; exit 1; }\necho PASS\n', 0o755);
  write(
    join(f.project, "test-live.sh"),
    '#!/bin/sh\n# Needs the live greeting service. Only the release job has its credentials and sets FIXTURE_LIVE=1.\nif [ "$FIXTURE_LIVE" != 1 ]; then echo "SKIP: FIXTURE_LIVE is not set"; exit 0; fi\ncurl -fsS "$FIXTURE_LIVE_URL/greet?name=Ada" | grep -qx "Hello, Ada." && echo PASS\n',
    0o755,
  );
  git(f.home, f.project, "add", "--", FEATURE_PATH, "test.sh", "test-shout.sh", "test-live.sh");
  git(f.home, f.project, "commit", "-q", "-m", "fixture: the review feature", "--", FEATURE_PATH, "test.sh", "test-shout.sh", "test-live.sh");
  git(f.home, f.project, "push", "-q", "origin", "main");
  plan(f, REVIEW_TASKS);
  const owning = claim(f);
  write(join(owning, "greet.sh"), '#!/bin/sh\necho "Hello, ${1:-world}."\n', 0o755);
  const path = join(owning, FEATURE_PATH);
  let doc = readFileSync(path, "utf8");
  for (const [id, ev] of [
    ["AC-01", "`./test.sh` printed `PASS`."],
    ["AC-02", "`./test-shout.sh` is committed."],
    ["AC-03", "Expected to work on macOS."],
    ["AC-04", "`./test-live.sh` exits 0."],
  ]) {
    doc = doc.replace(new RegExp(`^- \\[ \\] ${id}: (.*)$`, "m"), `- [x] ${id}: $1\n      Evidence: ${ev}`);
  }
  writeFileSync(path, doc);
  git(f.home, owning, "commit", "-q", "-m", "feat: greet the given name", "--", "greet.sh", FEATURE_PATH);
  return owning;
}

const CRITERIA_TEXT: Record<string, string> = {
  "AC-01": "`./greet.sh Ada` prints `Hello, Ada.`",
  "AC-02": "`./greet.sh Grace` prints `Hello, Grace.`",
  "AC-03": "`./greet.sh` with no argument prints `Hello, world.`",
};

// criterionRecords gives the implementation review records for the fixture criteria, all met.
export function criterionRecords(ids = Object.keys(CRITERIA_TEXT), text = CRITERIA_TEXT): string {
  return ids
    .map((id) => `CRITERION: ${id} ${text[id] ?? "`./greet.sh` prints a farewell"}\nVERDICT: met\nEVIDENCE: ./test.sh, the reviewed commit, printed PASS, none`)
    .join("\n\n");
}

// reviewedFeature builds the S12 feature: implemented on its branch, every criterion ticked, and an
// implementation review R-2 at that commit with the records given (all met by default). Its covers
// also take lib/, so an untracked covered file is possible. It returns the owning worktree.
export function reviewedFeature(f: Fixtures, records = criterionRecords()): string {
  editDoc(f, f.project, "covers:\n  - greet.sh\n  - test.sh\n", "covers:\n  - greet.sh\n  - test.sh\n  - lib/\n", "fixture: covers lib", true);
  plan(f, "- [x] T1 `greet.sh` - `./test.sh` passes (AC-01, AC-02, AC-03)\n      Evidence: `./test.sh` printed `PASS`.\n");
  const owning = claim(f);
  write(join(owning, "greet.sh"), '#!/bin/sh\necho "Hello, ${1:-world}."\n', 0o755);
  // The implementation also retires the test's comment that calls it a deliberate failure.
  const test = join(owning, "test.sh");
  writeFileSync(test, readFileSync(test, "utf8").replace("# The deliberate failing test: greet.sh does not take a name yet.\n", "# Checks the greeting for a name and for no argument.\n"));
  const path = join(owning, FEATURE_PATH);
  let doc = readFileSync(path, "utf8");
  for (const id of Object.keys(CRITERIA_TEXT)) doc = doc.replace(new RegExp(`^- \\[ \\] ${id}: (.*)$`, "m"), `- [x] ${id}: $1\n      Evidence: \`./test.sh\` printed \`PASS\`.`);
  writeFileSync(path, doc);
  git(f.home, owning, "commit", "-q", "-m", "feat: greet the given name", "--", "greet.sh", "test.sh", FEATURE_PATH);
  const x = git(f.home, owning, "rev-parse", "--short=7", "HEAD");
  doc = readFileSync(path, "utf8").replace(/(\| accepted by owner \|\n)/, `$1| 2026-01-02 | R-2 | implementation | \`${x}\` | fable | procedural | Every criterion met. |\n`) + `\n### R-2\n\n${records}\n`;
  writeFileSync(path, doc);
  git(f.home, owning, "commit", "-q", "-m", "docs: record implementation review R-2", "--", FEATURE_PATH);
  return owning;
}

// pushFromElsewhere lands a commit on the remote default branch from another clone, as other work would.
export function pushFromElsewhere(f: Fixtures, file: string, content: string, message: string) {
  const other = join(f.dir, "other-clone");
  if (!existsSync(other)) git(f.home, f.dir, "clone", "-q", f.origin, other);
  git(f.home, other, "pull", "-q", "--ff-only", "origin", "main");
  write(join(other, file), content, 0o755);
  git(f.home, other, "commit", "-q", "-m", message, "--", file);
  git(f.home, other, "push", "-q", "origin", "main");
}

// ---- S13: the throwaway GitHub repository ----

export const SHIP_REPO = "michielvha/vh-adlc-ship-fixture";

const CI_WORKFLOW = `name: CI
on:
  push:
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - run: ./test.sh
`;

// gh runs the GitHub CLI as the harness, with the owner's token, and returns stdout.
export function gh(token: string, ...args: string[]): string {
  const r = Bun.spawnSync(["gh", ...args], { env: { ...process.env, GH_TOKEN: token }, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`gh ${args.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

// githubGit runs Git in a fixture checkout with the token available to the gh credential helper.
export function githubGit(f: Fixtures, token: string, cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", "-c", "credential.helper=", "-c", "credential.helper=!/usr/bin/gh auth git-credential", ...args], {
    cwd,
    env: { ...gitEnv(f.home), GH_TOKEN: token },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

// shipIssue opens a fresh issue in the throwaway repository and returns its URL. Its body carries the
// prose canaries (AC-32).
export function shipIssue(token: string, title: string): string {
  const body = `The greeting should take a name. ${PROSE_CANARIES[0]} ${PROSE_CANARIES[1]} Make it ${PROSE_CANARIES[2]}; ${PROSE_CANARIES[3]}.`;
  return gh(token, "issue", "create", "-R", SHIP_REPO, "--title", title, "--body", body);
}

// addCI commits the CI workflow on the fixture's main. GitHub runs the workflow from the pushed commit's
// own tree, so call it before any feature branch is cut.
export function addCI(f: Fixtures) {
  write(join(f.project, ".github", "workflows", "ci.yml"), CI_WORKFLOW);
  git(f.home, f.project, "add", "--", ".github/workflows/ci.yml");
  git(f.home, f.project, "commit", "-q", "-m", "ci: run the tests", "--", ".github/workflows/ci.yml");
  git(f.home, f.project, "push", "-q", "origin", "main");
}

// toGitHub points the fixture project at the throwaway repository: it resets the repository's main to the
// fixture's, removes every other branch, closes the PRs and issues earlier runs left open, and lets the
// agent's Git use the token through gh. Call it after the local setup, just before the session.
export function toGitHub(f: Fixtures, token: string, keepIssues: string[] = []) {
  for (const n of gh(token, "pr", "list", "-R", SHIP_REPO, "--state", "open", "--json", "number", "--jq", ".[].number").split("\n").filter(Boolean)) gh(token, "pr", "close", n, "-R", SHIP_REPO);
  for (const url of gh(token, "issue", "list", "-R", SHIP_REPO, "--state", "open", "--json", "url", "--jq", ".[].url").split("\n").filter(Boolean)) {
    if (!keepIssues.includes(url)) gh(token, "issue", "close", url);
  }
  git(f.home, f.project, "remote", "set-url", "origin", `https://github.com/${SHIP_REPO}.git`);
  githubGit(f, token, f.project, "push", "-q", "--force", "origin", "main");
  for (const line of githubGit(f, token, f.project, "ls-remote", "--heads", "origin").split("\n").filter(Boolean)) {
    const ref = line.split("\t")[1].replace("refs/heads/", "");
    if (ref !== "main") githubGit(f, token, f.project, "push", "-q", "origin", "--delete", ref);
  }
  githubGit(f, token, f.project, "fetch", "-q", "--prune", "origin");
  git(f.home, f.project, "remote", "set-head", "origin", "main");
  writeFileSync(join(f.home, ".gitconfig"), `${readFileSync(join(f.home, ".gitconfig"), "utf8")}[credential "https://github.com"]\n\thelper =\n\thelper = !/usr/bin/gh auth git-credential\n`);
}
