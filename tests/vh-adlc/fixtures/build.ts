// Builds the scenario fixtures into a throwaway directory:
//
//   docs/       a fixture vhco-pro/docs repository: revision A is the real docs at
//               the plugin pin, revision B changes the default document location
//               and adds all_met to the planned gate
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
function buildDocs(home: string, dir: string): { a: string; b: string } {
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
  if (text === before) throw new Error("revision B changed nothing");
  writeFileSync(standard, text);
  git(home, dir, "commit", "-q", "-am", "docs revision B (plans root, all_met on the planned gate)");
  return { a, b: git(home, dir, "rev-parse", "HEAD") };
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

In scope: a name argument for \`greet.sh\`.

## Design

\`greet.sh <name>\` prints \`Hello, <name>.\`

## Acceptance Criteria

- [ ] AC-01: \`./greet.sh Ada\` prints \`Hello, Ada.\`

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | \`./test.sh\` |

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
    `#!/bin/sh\n# The deliberate failing test: greet.sh does not take a name yet.\nout=$(./greet.sh Ada)\n[ "$out" = "Hello, Ada." ] || { echo "FAIL: got $out"; exit 1; }\necho PASS\n`,
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
  git(home, dir, "branch", "feat/other-work");
  git(home, dir, "worktree", "add", "-q", worktree, "feat/other-work");
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
    env: { HOME: home, XDG_CACHE_HOME: join(home, ".real-cache"), PATH: "/usr/local/bin:/usr/bin:/bin", LC_ALL: "C" },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (r.exitCode !== 0) throw new Error(`the installer could not verify the real binary: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

export function build(dir: string): Fixtures {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const home = join(dir, "home");
  mkdirSync(home);
  const work = join(dir, "work");
  mkdirSync(work);
  const docs = join(dir, "docs");
  const { a, b } = buildDocs(home, docs);
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
  return { dir, docs, revisionA: a, revisionB: b, project, origin, worktree, otherPlugin, pluginA, pluginB, home, log, wrapper };
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: bun tests/vh-adlc/fixtures/build.ts <dir>");
    process.exit(2);
  }
  console.log(JSON.stringify(build(resolve(dir)), null, 2));
}
