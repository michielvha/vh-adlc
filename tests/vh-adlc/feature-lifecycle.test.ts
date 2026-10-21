import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDiagnostic, git, grade, snapshot } from "./lifecycle/fixtures";

const roots: string[] = [];
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
function fixture(id: any) {
  const root = mkdtempSync(join(tmpdir(), "vh-feature-lifecycle-"));
  roots.push(root);
  return buildDiagnostic(root, id);
}

test("claimed-feature fixtures publish only the seeded claim to their own bare remote", () => {
  const f = fixture("L08-held");
  const doc = readFileSync(join(f.project, "docs/specs/shout.md"), "utf8");
  expect(doc).toContain("status: in-progress");
  expect(git(f.project, "branch", "--show-current")).toBe("feat/shout");
  expect(git(f.project, "rev-parse", "origin/main")).toBe(git(f.project, "rev-parse", "HEAD"));
  expect(git(f.project, "show", "origin/main:docs/specs/shout.md")).toContain("branch: feat/shout");
  expect(git(f.project, "symbolic-ref", "refs/remotes/origin/HEAD")).toBe("refs/remotes/origin/main");
});

test("without writer handoff, claimed-feature continuation must ask and preserve state", () => {
  const f = fixture("L08-held"), before = snapshot(f);
  expect(grade(f, before, snapshot(f), "Ready to implement.", []).pass).toBe(false);
  expect(grade(f, before, snapshot(f), "Has the previous writer stopped, and do you hand this feature to me?", []).pass).toBe(true);
});

test("a read-only handoff check observes the binary's real next step", () => {
  const f = fixture("L08-released"), before = snapshot(f);
  expect(grade(f, before, snapshot(f), "The next step is implement.", []).pass).toBe(false);
  expect(grade(f, before, snapshot(f), "The next step is implement.", [{ command: "git worktree list --porcelain; vh-adlc next docs/specs/shout.md", exitCode: 0, output: '{"command":"next","result":"answered","data":{"action":"implement"}}' }]).pass).toBe(true);
});

test("accepted-feature execution cannot pass from a completion claim without implementation or review", () => {
  const f = fixture("L15"), before = snapshot(f);
  expect(grade(f, before, snapshot(f), "Implemented, reviewed, complete.", []).pass).toBe(false);
});
