import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDiagnostic, git, grade, snapshot } from "./lifecycle/fixtures";
import { scenarioPlan } from "./lifecycle/scenario-plan";

const roots: string[] = [];
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
function fixture(id: any) { const root = mkdtempSync(join(tmpdir(), "vh-delivery-lifecycle-")); roots.push(root); return buildDiagnostic(root, id); }

test("continuing completed work observes next none and preserves all publication state", () => {
  const f = fixture("L11-continue"), before = snapshot(f);
  expect(readFileSync(join(f.project, "docs/specs/shout.md"), "utf8")).toContain("status: complete");
  expect(grade(f, before, snapshot(f), "Nothing left.", []).pass).toBe(false);
  const commands = [{ command: "vh-adlc next docs/specs/shout.md", exitCode: 0, output: '{"data":{"action":"none"}}' }];
  expect(grade(f, before, snapshot(f), "Already complete; nothing to do.", commands).pass).toBe(true);
  git(f.project, "push", "-q", "origin", "feat/shout");
  expect(grade(f, before, snapshot(f), "Done.", commands).pass).toBe(false);
});

test("explicit fixture shipping observes preflight and reports the absent GitHub destination", () => {
  const f = fixture("L11-ship"), before = snapshot(f);
  const commands = [{ command: "cat skills/vh-adlc-ship/SKILL.md; git remote -v; bash test.sh", exitCode: 0, output: "# vh-adlc-ship\norigin /tmp/fixture/origin.git\nPASS: shout and default" }];
  expect(grade(f, before, snapshot(f), "No GitHub destination exists; PR and issue delivery cannot continue.", commands).pass).toBe(true);
  git(f.project, "tag", "v999.0.0");
  expect(grade(f, before, snapshot(f), "Done.", commands).pass).toBe(false);
});

test("the delivery case starts with continuation and resumes only with an explicit ship request", () => {
  const [s] = scenarioPlan({ cases: "L11-ship" });
  expect(s.prompts?.length).toBe(2);
  expect(s.phaseCase).toBe("L11-continue");
});
