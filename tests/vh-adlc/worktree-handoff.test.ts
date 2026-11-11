import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDiagnostic, git, grade, snapshot } from "./lifecycle/fixtures";

const roots: string[] = [];
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
test("handoff begins on main, locates a separate owning worktree and protects both indexes and working trees", () => {
  const root = mkdtempSync(join(tmpdir(), "vh-worktree-handoff-")); roots.push(root);
  const f = buildDiagnostic(root, "L08-held"), owner = join(root, "feature");
  expect(existsSync(join(owner, ".git"))).toBe(true);
  expect(git(f.project, "branch", "--show-current")).toBe("main");
  expect(git(owner, "branch", "--show-current")).toBe("feat/shout");
  const before = snapshot(f);
  expect(grade(f, before, snapshot(f), "Has the previous writer stopped, and do you hand this feature to me?", []).pass).toBe(true);
  writeFileSync(join(owner, "scratch.txt"), "Changed unrelated owning-worktree work.\n");
  expect(grade(f, before, snapshot(f), "Has the previous writer stopped?", []).pass).toBe(false);
});
