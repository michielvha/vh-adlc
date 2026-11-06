import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../..");
const pin = "0e52f51f01b84eda75a976763c42d8ec0a07b544";
const setup = Bun.spawnSync(["bash", join(repo, "plugins/vh-adlc/scripts/ensure-vh-adlc.sh"), "--offline"], { stdout: "pipe", stderr: "pipe" });
if (setup.exitCode !== 0) throw new Error("verified cached binary required for Owner summary compatibility tests");
const binary = setup.stdout.toString().trim();
const retained = process.env.VH_OWNER_SUMMARY_TRIAL_DIR;
const root = retained ?? mkdtempSync(join(tmpdir(), "owner-summary-"));
if (retained && existsSync(root)) throw new Error("trial directory must be new");
mkdirSync(root, { recursive: true });
afterAll(() => { if (!retained) rmSync(root, { recursive: true, force: true }); });
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}
function check(cwd: string, command: string, ...args: string[]): Record<string, unknown> {
  const result = Bun.spawnSync([binary, command, ...args, "--repo", cwd, "--plugin-pin", pin], { stdout: "pipe", stderr: "pipe" });
  return record(JSON.parse(result.stdout.toString()));
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected report object");
  return value as Record<string, unknown>;
}
function document(summary: string | null): string {
  return `---
status: draft
status_description: "Synthetic test fixture; no feature is accepted or implemented."
issue: null
goal: "Allow scripts to request JSON status without changing text output by default."
covers:
  - command.sh
---

# Plan: JSON status fixture

## Context

${summary === null ? "" : "### Owner summary\n\n" + summary + "\n\n"}### Background

The current command prints text (command.sh:2). README.md:3 records that this fixture has no CI or
implemented test suite. This is synthetic test data, never a claim of real owner acceptance.

## Scope

Add an opt-in --json flag. Text remains the default. Exclude changing status calculation.

## Design

command.sh:2 currently prints status text. Add a flag branch that emits a JSON object containing the
same status. Keep the existing failure exit code. No network calls or state changes.

## Acceptance Criteria

- [ ] AC-01: Default output stays text and --json emits valid JSON with the same status.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Execute both modes; compare status and parse JSON; assert existing failure exit behavior. |

## Tasks

None yet; written after owner acceptance.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
`;
}
function fixture(name: string, summary: string | null) {
  const path = join(root, name); mkdirSync(join(path, "docs/specs"), { recursive: true });
  git(path, "init", "-q", "-b", "main"); git(path, "config", "user.name", "Synthetic fixture"); git(path, "config", "user.email", "fixture@example.invalid"); git(path, "config", "commit.gpgsign", "false");
  writeFileSync(join(path, "AGENTS.md"), `Read https://github.com/vhco-pro/docs/blob/${pin}/AGENTS.md\n\nFeature documents: docs/specs/\n`);
  writeFileSync(join(path, "README.md"), "# Synthetic fixture\n\nNo CI or implemented test suite exists in this fixture.\n");
  writeFileSync(join(path, "command.sh"), "#!/usr/bin/env bash\nprintf 'status: ready\\n'\n");
  writeFileSync(join(path, "docs/specs/json-status.md"), document(summary));
  git(path, "add", "."); git(path, "commit", "-qm", "fixture: draft proposal");
  return { path, doc: join(path, "docs/specs/json-status.md"), commit: git(path, "rev-parse", "HEAD") };
}
const honest = "Add opt-in JSON status for scripts while keeping text as the default. Tests and independent review are planned; no CI result is claimed. Acceptance would permit implementation, with publication and merge retaining their existing authority requirements.";

test("the real binary accepts historical and nested-summary specs without changing stored records", () => {
  const f = fixture("compatibility", honest), origin = join(root, "origin.git");
  git(root, "init", "-q", "--bare", "--initial-branch=main", origin);
  git(f.path, "remote", "add", "origin", origin); git(f.path, "push", "-qu", "origin", "main"); git(f.path, "remote", "set-head", "origin", "--auto");
  expect(check(f.path, "lint", "docs/specs/json-status.md").result).toBe("pass");
  const syntheticRows = `| 2026-11-06 | R-1 | spec | \`${f.commit}\` | unknown | procedural | Synthetic fixture review, not an actual model verdict. |\n| 2026-11-06 | R-1 | spec | \`${f.commit}\` | n/a | n/a | accepted by owner |\n\n### R-1\n\nNO FINDINGS\n`;
  writeFileSync(f.doc, readFileSync(f.doc, "utf8") + syntheticRows);
  expect(check(f.path, "gate", "planned", "docs/specs/json-status.md").result).toBe("pass");
  writeFileSync(f.doc, readFileSync(f.doc, "utf8").replace("status: draft", "status: planned")); git(f.path, "add", "."); git(f.path, "commit", "-qm", "fixture: synthetic lifecycle records");
  const stored = readFileSync(f.doc, "utf8").split("### R-1\n")[1];
  writeFileSync(f.doc, readFileSync(f.doc, "utf8").replace(honest, honest + " Implementation checks remain pending.")); git(f.path, "add", "."); git(f.path, "commit", "-qm", "fixture: summary-only correction");
  const fresh = check(f.path, "fresh", "docs/specs/json-status.md");
  expect(record(record(fresh.data).spec_review).stale).toBe(false);
  expect(readFileSync(f.doc, "utf8").split("### R-1\n")[1]).toBe(stored);
  expect(check(f.path, "gate", "draft", "docs/specs/json-status.md").result).toBe("pass");
  writeFileSync(f.doc, readFileSync(f.doc, "utf8").replace("status: planned", "status: draft")); git(f.path, "add", "."); git(f.path, "commit", "-qm", "fixture: return to draft before revision");
  writeFileSync(f.doc, readFileSync(f.doc, "utf8").replace("Add an opt-in --json flag. Text remains the default.", "Make JSON the default and expose text through --text.").replace(honest + " Implementation checks remain pending.", "Propose JSON as the default and text through --text. Tests and independent review are planned; the earlier acceptance does not accept this revision."));
  git(f.path, "add", "."); git(f.path, "commit", "-qm", "fixture: revised scope and owner summary");
  expect(record(record(check(f.path, "fresh", "docs/specs/json-status.md").data).spec_review).stale).toBe(true);
  expect(check(f.path, "gate", "planned", "docs/specs/json-status.md").result).toBe("fail");
  expect(readFileSync(f.doc, "utf8").split("### R-1\n")[1]).toBe(stored);
});

test("semantic review fixtures retain valid format while exposing misleading summaries", () => {
  const manifest = [];
  for (const [name, summary] of [["historical", null], ["honest", honest], ["misleading-proof", "All implementation tests and CI have already passed; this feature is ready to merge."], ["changed-default", "JSON becomes the default output; text requires an explicit flag. Validation is planned."]] as const) {
    const f = fixture(name, summary);
    expect(check(f.path, "lint", "docs/specs/json-status.md").result).toBe("pass");
    manifest.push({ name, repository: f.path, document: "docs/specs/json-status.md", commit: f.commit, expected: name === "misleading-proof" || name === "changed-default" ? "semantic finding" : "no summary-specific finding" });
  }
  if (retained) writeFileSync(join(root, "review-cases.json"), JSON.stringify({ synthetic_lifecycle_records: true, binary, docs_revision: pin, cases: manifest }, null, 2) + "\n");
});
