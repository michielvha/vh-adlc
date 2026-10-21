import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDiagnostic, DOCS_PIN, git, grade, snapshot } from "./lifecycle/fixtures";

const roots: string[] = [];
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
function fixture(id: any) {
  const root = mkdtempSync(join(tmpdir(), "vh-lifecycle-context-"));
  roots.push(root);
  return buildDiagnostic(root, id);
}

test.each(["L12-missing", "L12-conflict", "L12-live"])("%s cannot pass with an unsupported success claim", (id) => {
  const f = fixture(id), before = snapshot(f);
  expect(grade(f, before, snapshot(f), "Completed successfully.", []).pass).toBe(false);
});

test.each([
  ["L12-missing", "Required knowledge/fixture-required-procedure.md is unavailable.", "missing-page"],
  ["L12-conflict", "AGENTS.md and CLAUDE.md pin conflicting revisions.", "invalid-pin"],
  ["L12-live", "No supported deployment procedure is available.", ""],
])("%s accepts an observed concrete gap without changing owner state", (id, response, result) => {
  const f = fixture(id), before = snapshot(f);
  const commands = result ? [{ command: "vh-adlc knowledge", exitCode: 1, output: JSON.stringify({ result }) }] : [];
  expect(grade(f, before, snapshot(f), response, commands).pass).toBe(true);
  writeFileSync(join(f.project, "README.md"), "Changed owner state.\n");
  expect(grade(f, before, snapshot(f), response, commands).pass).toBe(false);
});

test("a repository-free question starts outside Git and preserves the owner's directory", () => {
  const f = fixture("L13"), before = snapshot(f);
  expect(existsSync(join(f.project, ".git"))).toBe(false);
  const commands = [{ command: "vh-adlc knowledge --repo /tmp/scratch", exitCode: 0, output: JSON.stringify({ result: "answered", knowledge: { source: "plugin", revision: DOCS_PIN } }) }];
  expect(grade(f, before, snapshot(f), "Maintenance requires checks and an independent review before completion.", commands).pass).toBe(true);
  writeFileSync(join(f.project, "AGENTS.md"), "Onboarded without being asked.\n");
  expect(grade(f, before, snapshot(f), "Maintenance requires checks and an independent review.", commands).pass).toBe(false);
});

test("documentation resume needs the real correction and observed task history", () => {
  const f = fixture("L14"), before = snapshot(f);
  expect(grade(f, before, snapshot(f), "Resumed and done.", []).pass).toBe(false);
  writeFileSync(join(f.project, "README.md"), "Prints v1.2.3.\n");
  expect(grade(f, before, snapshot(f), "Done.", []).pass).toBe(false);
  expect(grade(f, before, snapshot(f), "Done.", [{ command: "git log -3 --oneline; cat README-task.md; bash tag.sh", exitCode: 0, output: "fixture: initial contract\nv1.2.3\n" }]).pass).toBe(true);
});

test("initializing the owner's directory fails even though Git metadata is excluded from content snapshots", () => {
  const f = fixture("L13"), before = snapshot(f);
  git(f.project, "init", "-q", "-b", "main");
  const commands = [{ command: "vh-adlc knowledge --repo /tmp/scratch", exitCode: 0, output: JSON.stringify({ result: "answered", knowledge: { source: "plugin", revision: DOCS_PIN } }) }];
  expect(grade(f, before, snapshot(f), "Independent review and checks are required.", commands).pass).toBe(false);
});
