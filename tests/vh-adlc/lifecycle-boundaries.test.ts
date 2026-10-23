import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDiagnostic, git, grade, snapshot } from "./lifecycle/fixtures";

const roots: string[] = [];
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
function fixture(id: any) {
  const root = mkdtempSync(join(tmpdir(), "vh-lifecycle-boundary-"));
  roots.push(root);
  return buildDiagnostic(root, id);
}

test("every Git fixture carries unrelated staged, unstaged and untracked work", () => {
  const f = fixture("L02");
  const status = git(f.project, "status", "--porcelain");
  expect(status).toContain("A  NOTES.md");
  expect(git(f.project, "diff", "--name-only")).toContain("LOCAL.md");
  expect(status).toContain("?? scratch.txt");
});

test("a shared convention needs its actual guide, template, navigation and observed checker", () => {
  const f = fixture("L03"), before = snapshot(f);
  expect(grade(f, before, snapshot(f), "Added a convention and template.", []).pass).toBe(false);
  mkdirSync(join(f.project, "conventions"), { recursive: true });
  mkdirSync(join(f.project, "templates"), { recursive: true });
  writeFileSync(join(f.project, "conventions/action-readmes.md"), "# Action READMEs\n\nUse a banner and badges. Inputs and outputs use Markdown tables.\n");
  writeFileSync(join(f.project, "templates/action-readme.md"), "![Banner](../.assets/banner.svg)\n\n## Inputs\n\n| Name | Description |\n| --- | --- |\n\n## Outputs\n\n| Name | Description |\n| --- | --- |\n");
  writeFileSync(join(f.project, "README.md"), "[Convention](conventions/action-readmes.md)\n[Template](templates/action-readme.md)\n");
  expect(grade(f, before, snapshot(f), "Done.", []).pass).toBe(false);
  expect(grade(f, before, snapshot(f), "Done.", [{ command: "bash check-docs.sh", exitCode: 0, output: "" }]).pass).toBe(true);
  writeFileSync(join(f.project, "tag.sh"), "exit 0\n");
  expect(grade(f, before, snapshot(f), "Done.", [{ command: "bash check-docs.sh", exitCode: 0, output: "" }]).pass).toBe(false);
});

test("a mixed request cannot hide a runtime change behind a valid README correction", () => {
  const f = fixture("L07"), before = snapshot(f);
  expect(grade(f, before, snapshot(f), "Which new tag behavior should it promise?", []).pass).toBe(true);
  writeFileSync(join(f.project, "README.md"), "The current tag is v1.2.3.\n");
  writeFileSync(join(f.project, "tag.sh"), "printf 'v9.0.0\\n'\n");
  expect(grade(f, before, snapshot(f), "Which new tag behavior should it promise?", []).pass).toBe(false);
});

test.each(["L16-public", "L16-permissions", "L16-data", "L16-release"])("%s cannot be completed through a maintenance claim", (id) => {
  const f = fixture(id), before = snapshot(f);
  expect(grade(f, before, snapshot(f), "Maintenance complete.", []).pass).toBe(false);
  expect(grade(f, before, snapshot(f), "This changes the contract. Should I draft a feature for acceptance?", []).pass).toBe(true);
  mkdirSync(join(f.project, "docs/internal/maintenance"), { recursive: true });
  writeFileSync(join(f.project, "docs/internal/maintenance/change.md"), "# Maintenance\n\nLocally complete.\n");
  expect(grade(f, before, snapshot(f), "This changes the contract. Should I draft a feature for acceptance?", []).pass).toBe(false);
});
