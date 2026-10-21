import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDiagnostic, git, grade, installLocalDependencies, snapshot } from "./lifecycle/fixtures";

const roots: string[] = [];
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
function fixture(id: any) {
  const root = mkdtempSync(join(tmpdir(), "vh-maintenance-variant-"));
  roots.push(root);
  return buildDiagnostic(root, id);
}
function record(project: string) {
  mkdirSync(join(project, "docs/internal/maintenance"), { recursive: true });
  writeFileSync(join(project, "docs/internal/maintenance/upkeep.md"), "# Maintenance\n\nObserved baseline and required checks.\n");
}
const receipt = { pass: true, reason: "test receipt supplied by the host-adapter unit fixture" };

test("compatible dependency upkeep needs the actual dependency, lockfile, baseline and checks", () => {
  const f = fixture("L06-dependency"), before = snapshot(f);
  expect(grade(f, before, snapshot(f), "Dependency update complete.", []).pass).toBe(false);
  const manifest = JSON.parse(readFileSync(join(f.project, "package.json"), "utf8"));
  manifest.dependencies["greet-helper"] = "file:./vendor/greet-helper-1.0.1";
  writeFileSync(join(f.project, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
  const install = installLocalDependencies(f.project);
  expect(install.exitCode).toBe(0);
  record(f.project);
  const commands = [{ command: "bash test.sh", exitCode: 0, output: "PASS: dependency contract" }, { command: "bash test.sh", exitCode: 0, output: "PASS: dependency contract" }];
  expect(grade(f, before, snapshot(f), "Updated and verified.", commands, receipt).pass).toBe(true);
  writeFileSync(join(f.project, "vendor/greet-helper-1.0.1/index.js"), "export const greet = () => 'Wrong';\n");
  expect(grade(f, before, snapshot(f), "Updated and verified.", commands, receipt).pass).toBe(false);
});

test("CI repair must preserve permissions and restore the intended check command", () => {
  const f = fixture("L06-ci"), before = snapshot(f);
  expect(grade(f, before, snapshot(f), "CI fixed.", []).pass).toBe(false);
  git(f.project, "switch", "-c", "ci/repair-script");
  const path = join(f.project, ".github/workflows/ci.yml");
  expect(readFileSync(path, "utf8")).toContain("uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803");
  writeFileSync(path, readFileSync(path, "utf8").replace("bash tests.sh", "bash test.sh"));
  record(f.project);
  const commands = [{ command: "bash check-workflow.sh", exitCode: 1, output: "FAIL: workflow check command" }, { command: "bash check-workflow.sh", exitCode: 0, output: "PASS: workflow contract" }, { command: "bash test.sh", exitCode: 0, output: "" }];
  expect(grade(f, before, snapshot(f), "Repaired and verified.", commands, receipt).pass).toBe(true);
  const valid = readFileSync(path, "utf8");
  writeFileSync(path, valid.replace(/      - uses: actions\/checkout@[^\n]+\n        with:\n          persist-credentials: false\n/, ""));
  expect(grade(f, before, snapshot(f), "Repaired and verified.", commands, receipt).pass).toBe(false);
  writeFileSync(path, valid);
  writeFileSync(path, readFileSync(path, "utf8").replace("contents: read", "contents: write"));
  expect(grade(f, before, snapshot(f), "Repaired and verified.", commands, receipt).pass).toBe(false);
});
