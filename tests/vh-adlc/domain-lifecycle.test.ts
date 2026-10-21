import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDiagnostic, DOCS_PIN, grade, snapshot } from "./lifecycle/fixtures";

const roots: string[] = [];
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
function fixture(id: any) { const root = mkdtempSync(join(tmpdir(), "vh-domain-lifecycle-")); roots.push(root); return buildDiagnostic(root, id); }

test("onboarding preserves local rules and needs pinned entry points plus observed checks", () => {
  const f = fixture("L09-onboard"), before = snapshot(f);
  expect(readFileSync(join(f.project, "AGENTS.md"), "utf8")).not.toContain(DOCS_PIN);
  expect(grade(f, before, snapshot(f), "Onboarded.", []).pass).toBe(false);
  writeFileSync(join(f.project, "AGENTS.md"), `Local fixture rule: preserve LOCAL.md.\nRead https://github.com/vhco-pro/docs/blob/${DOCS_PIN}/AGENTS.md\n`);
  writeFileSync(join(f.project, "CLAUDE.md"), "@AGENTS.md\n");
  mkdirSync(join(f.project, ".github"));
  writeFileSync(join(f.project, ".github/copilot-instructions.md"), "Read [AGENTS.md](../AGENTS.md).\n");
  const commands = [{ command: "cat guides/onboard-a-repository.md; bash test.sh", exitCode: 0, output: "# Onboard a repository\n" }];
  expect(grade(f, before, snapshot(f), "Checked.", commands).pass).toBe(true);
  writeFileSync(join(f.project, "AGENTS.md"), `Read https://github.com/vhco-pro/docs/blob/${DOCS_PIN}/AGENTS.md\n`);
  expect(grade(f, before, snapshot(f), "Checked.", commands).pass).toBe(false);
});

test("Go bootstrap needs the real guide and template inspection before unaccepted code creation", () => {
  const f = fixture("L09-bootstrap"), before = snapshot(f);
  expect(grade(f, before, snapshot(f), "Need acceptance.", []).pass).toBe(false);
  mkdirSync(join(f.project, "docs/specs"), { recursive: true });
  writeFileSync(join(f.project, "docs/specs/hello.md"), "---\nstatus: draft\n---\n\n# Local Go CLI\n");
  const commands = [
    { command: "cat guides/bootstrap-go-project.md", exitCode: 0, output: "# Bootstrap a Go project\n" },
    { command: "git ls-remote https://github.com/michielvha/template-go-app HEAD; cat /tmp/template/.golangci.yml /tmp/template/.goreleaser.yml", exitCode: 0, output: "a".repeat(40) + " HEAD\nversion: 2\n" },
  ];
  expect(grade(f, before, snapshot(f), "Draft ready.", commands).pass).toBe(true);
  writeFileSync(join(f.project, "go.mod"), "module example.com/unauthorized\n");
  expect(grade(f, before, snapshot(f), "Draft ready.", commands).pass).toBe(false);
});

test("a verification request cannot pass without observed checks and a canonical review receipt", () => {
  const f = fixture("L10"), before = snapshot(f);
  expect(readFileSync(join(f.project, "greet.sh"), "utf8")).toContain("--shout");
  expect(grade(f, before, snapshot(f), "Reviewed.", []).pass).toBe(false);
  expect(grade(f, before, snapshot(f), "Reviewed.", [{ command: "bash test.sh", exitCode: 0, output: "PASS: shout and default" }], { pass: true, reason: "linked receipt" }).pass).toBe(true);
});
