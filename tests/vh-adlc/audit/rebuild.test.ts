import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fixture, git } from "./fixtures";
import { createRun, readRun } from "../../../plugins/vh-adlc/scripts/audit/journal";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
const made: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of made.splice(0)) f.dispose(); });
const regression = 'import {expect,test} from "bun:test"; import {answer} from "./src/app"; test("the documented answer",()=>expect(answer).toBe(43));\n';
for (const route of ["new-owned-branch", "owner-approved-rebase"] as const) test(`default advance rebuild re-observes red and removes only branch-owned records: ${route}`, () => {
  const f = fixture(); made.push(f);
  f.write("docs/history.md", "# Audit repair batch\n\nHistorical adopted record.\n"); const oldBase = f.commit();
  git(f.root, "switch", "-qc", "fix/original");
  f.write("regression.test.ts", regression); const oldRed = f.commit();
  const observe = (commit: string, name: string) => {
    const worktree = join(f.outer, name); git(f.root, "worktree", "add", "--detach", worktree, commit);
    const run = Bun.spawnSync([process.execPath, "test", "regression.test.ts"], { cwd: worktree, stdout: "pipe", stderr: "pipe" });
    f.artifact(name + ".json", JSON.stringify({ commit, argv: [process.execPath, "test", "regression.test.ts"], exit_code: run.exitCode, stdout: run.stdout.toString(), stderr: run.stderr.toString() }));
    return run.exitCode;
  };
  expect(observe(oldRed, "old-red")).toBe(1);
  f.write("src/app.ts", "export const answer = 43;\n"); const oldRepair = f.commit(); expect(observe(oldRepair, "old-green")).toBe(0);
  f.write("docs/old-run.md", "# Audit repair batch\n\nOld branch-owned record.\n"); f.write("docs/README.md", "[old](old-run.md)\n"); const oldHead = f.commit();
  const oldRun = createRun(loadSettings(f.root), { artifact_root: f.artifacts, run_id: "old-run", batch_digest: "a".repeat(64) });
  f.artifact("superseded-record.md", readFileSync(join(f.root, "docs/old-run.md"), "utf8")); f.artifact("superseded-source.json", JSON.stringify({ oldBase, oldRed, oldRepair, oldHead, journal: oldRun.directory }));
  git(f.root, "switch", "main"); f.write("README.md", "New default context.\n"); const currentBase = f.commit();
  if (route === "new-owned-branch") { git(f.root, "switch", "-qc", "fix/rebuilt", currentBase); git(f.root, "cherry-pick", oldRed, oldRepair, oldHead); expect(git(f.root, "rev-parse", "fix/original")).toBe(oldHead); }
  else { git(f.root, "switch", "fix/original"); git(f.root, "rebase", "--onto", currentBase, oldBase); }
  const commits = git(f.root, "rev-list", "--reverse", `${currentBase}..HEAD`).split("\n"), freshRed = commits[0];
  expect(freshRed).not.toBe(oldRed); expect(observe(freshRed, "fresh-red")).toBe(1);
  expect(observe(commits[1], "fresh-green")).toBe(0);
  git(f.root, "rm", "docs/old-run.md"); f.write("docs/README.md", "[new](new-run.md)\n"); f.write("docs/new-run.md", "# Audit repair batch\n\nNew run scaffold.\n"); f.commit();
  expect(existsSync(join(f.root, "docs/old-run.md"))).toBe(false); expect(readFileSync(join(f.root, "docs/README.md"), "utf8")).not.toContain("old-run");
  expect(readFileSync(join(f.root, "docs/history.md"), "utf8")).toBe(git(f.root, "show", `${currentBase}:docs/history.md`) + "\n");
  const freshRun = createRun(loadSettings(f.root), { artifact_root: f.artifacts, run_id: "fresh-run", batch_digest: "b".repeat(64) });
  expect(() => readRun(loadSettings(f.root), oldRun.directory, freshRun.header.batch_digest)).toThrow();
  expect(readRun(loadSettings(f.root), oldRun.directory, oldRun.header.batch_digest).header.run_id).toBe("old-run");
});
