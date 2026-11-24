// The scope a spec review after the first receives (docs/specs/proportional-review.md, AC-05): one
// computation both routes share, `bun scripts/loop/cli.ts review-scope`, and the command route's prompt.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { reviewPrompt } from "../../../plugins/vh-adlc/scripts/loop/cli";
import { pagesStub } from "./pages-stub";

const CLI = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/loop/cli.ts");
const DOC = "docs/specs/f.md";
const made: string[] = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

function git(root: string, ...args: string[]) {
  const run = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" } });
  if (run.exitCode !== 0) throw Error(run.stderr.toString());
  return run.stdout.toString().trim();
}
function write(root: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); }
}
function commit(root: string, files: Record<string, string>, message: string) {
  write(root, files); git(root, "add", "-A"); git(root, "commit", "-q", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

const doc = (design: string, rows: string[], records = "") => `---
status: draft
covers:
  - src/
---

# Plan: F

## Scope

The command greets people.

## Design

${design}

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join("\n")}
${records}`;
const row = (review: string, sha: string, outcome = "no blocking; 1 should-fix") => `| 2026-11-22 | ${review} | spec | \`${sha.slice(0, 8)}\` | m | procedural | ${outcome} |`;
const RECORD = "\n### R-1\n\nFINDING: F-01\nKIND: judgement\nSEVERITY: should-fix\nWHERE: Design\nEVIDENCE: the greeting omits the name\nPROPOSAL: Say the name.\n";

/** A repository whose first commit is reviewed as R-1, then revised; returns both commits. */
function reviewed(extra: Record<string, string> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-scope-"))); made.push(root);
  git(root, "init", "-q", "-b", "main");
  const first = commit(root, { [DOC]: doc("The command prints hello.", []), "src/a.ts": "export const a = 1;\n", "AGENTS.md": "# Instructions\n" }, "first");
  return { root, first, extra };
}
function scope(root: string, at: string) {
  const run = Bun.spawnSync([process.execPath, CLI, "review-scope", "--repo", root, "--document", DOC, "--commit", at], { stdout: "pipe", stderr: "pipe", timeout: 60_000 });
  expect(run.stderr.toString()).toBe("");
  return JSON.parse(run.stdout.toString()) as { previous: string; diff: string; full: boolean; reason: string };
}

describe("review-scope", () => {
  test("picks the previous spec review even with an acceptance row after it, and leaves the Review Log out of the diff", () => {
    const { root, first } = reviewed();
    const x = commit(root, { [DOC]: doc("The command prints hello and the person's name.", [row("R-1", first), row("R-1", first, "accepted by owner").replace("| m | procedural |", "| n/a | n/a |")], RECORD) }, "revise");
    const s = scope(root, x);
    expect(s.full).toBe(false);
    expect(s.previous).toBe(first);
    expect(s.diff).toContain("+The command prints hello and the person's name.");
    expect(s.diff).toContain("-The command prints hello.");
    expect(s.diff).not.toContain("R-1");
    expect(s.diff).not.toContain("FINDING");
  });

  test("skips a row whose commit is not an ancestor of the reviewed commit", () => {
    const { root, first } = reviewed();
    git(root, "switch", "-q", "-c", "elsewhere");
    const other = commit(root, { "notes.md": "x\n" }, "elsewhere");
    git(root, "switch", "-q", "main");
    const x = commit(root, { [DOC]: doc("The command prints hello twice.", [row("R-1", first), row("R-2", other)], RECORD) }, "revise");
    const s = scope(root, x);
    expect([s.full, s.previous]).toEqual([false, first]);
  });

  test("is a full pass with no previous spec review", () => {
    const { root, first } = reviewed();
    const s = scope(root, first);
    expect(s).toEqual({ previous: "", diff: "", full: true, reason: "no previous spec review" });
  });

  test("is a full pass when a covered path changed", () => {
    const { root, first } = reviewed();
    const x = commit(root, { "src/a.ts": "export const a = 2;\n", [DOC]: doc("The command prints hello.", [row("R-1", first)], RECORD) }, "code");
    const s = scope(root, x);
    expect([s.full, s.previous, s.diff]).toEqual([true, "", ""]);
    expect(s.reason).toContain("src/a.ts");
  });

  for (const bridge of ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"]) {
    test(`is a full pass when the docs pin bridge file ${bridge} changed`, () => {
      const { root, first } = reviewed();
      const x = commit(root, { [bridge]: "# Instructions\nRead https://github.com/vhco-pro/docs/blob/0123456789012345678901234567890123456789/AGENTS.md\n", [DOC]: doc("The command prints hello.", [row("R-1", first)], RECORD) }, "pin");
      const s = scope(root, x);
      expect(s.full).toBe(true);
      expect(s.reason).toContain(bridge);
    });
  }

  test("a change to an uncovered path keeps the pass scoped", () => {
    const { root, first } = reviewed();
    const x = commit(root, { "README.md": "readme\n", [DOC]: doc("The command prints hello loudly.", [row("R-1", first)], RECORD) }, "readme");
    expect(scope(root, x).full).toBe(false);
  });
});

describe("the command route's prompt carries the scope", () => {
  test("reviewPrompt states a scoped pass with its previous commit and diff, and a full pass with its reason", () => {
    const input = { repository: "r", document: DOC, commit: "c", kind: "spec", docsRevision: "x", binary: "b", pluginPin: "p" };
    const scoped = reviewPrompt({ ...input, scope: { previous: "abc123", diff: "+a changed line", full: false, reason: "" } });
    expect(scoped).toContain("Scope: scoped re-review since the previous spec review at abc123");
    expect(scoped).toContain("+a changed line");
    const full = reviewPrompt({ ...input, scope: { previous: "", diff: "", full: true, reason: "no previous spec review" } });
    expect(full).toContain("Scope: full pass (no previous spec review)");
  });

  test("the review command computes the scope and hands it to the reviewer", () => {
    const { root, first } = reviewed();
    const stubDir = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-scope-stub-"))); made.push(stubDir);
    const stub = join(stubDir, "reviewer.sh"), seen = join(stubDir, "prompt.txt");
    writeFileSync(stub, `#!/bin/bash\nprintf '%s' "$2" > ${seen}\ncommit=$(grep -o 'Commit: [0-9a-f]*' <<<"$2" | cut -d' ' -f2)\nprintf 'MODEL: %s\\nTARGET: %s\\n\\nNO FINDINGS\\n' "$1" "$commit"\n`);
    chmodSync(stub, 0o700);
    const settings = `schema_version: 1\nroles:\n  spec_reviewer:\n    route: command\n    model: gpt-test\n    argv: [${stub}, "{model}", "{prompt}"]\n`;
    const x = commit(root, { ".vh-adlc/loop.yaml": settings, [DOC]: doc("The command prints hello and waves.", [row("R-1", first)], RECORD) }, "revise");
    const pages = pagesStub("abc");
    const run = Bun.spawnSync([process.execPath, CLI, "review", "--repo", root, "--document", DOC, "--commit", x, "--kind", "spec", "--docs-revision", "abc", "--binary", pages.binary, "--plugin-pin", "def"],
      { stdout: "pipe", stderr: "pipe", env: { ...process.env, XDG_CONFIG_HOME: join(tmpdir(), "vh-loop-scope-no-override"), ...pages.env }, timeout: 60_000 });
    expect(JSON.parse(run.stdout.toString())).toMatchObject({ status: "ready" });
    const prompt = readFileSync(seen, "utf8");
    expect(prompt).toContain(`Scope: scoped re-review since the previous spec review at ${first}`);
    expect(prompt).toContain("+The command prints hello and waves.");
  });
});
