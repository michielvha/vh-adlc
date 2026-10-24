import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(resolve(root,path),"utf8");
test("triage forwarding retains the local command model and has no obsolete executable fallback", () => {
  const command = read(".claude/commands/triage.md"), entry = read("agents/issue-triage.md");
  expect(command).toMatch(/^model: fable$/m); expect(command).toContain("$ARGUMENTS");
  expect(entry).toContain("vh-adlc-triage"); expect(entry).toContain(".vh-adlc/triage.json");
  expect(entry).not.toMatch(/--limit (?:100|200|300)|## Step [1-8]/);
  expect(read("AGENTS.md")).toContain("agents/issue-triage.md");
});
test("local settings and handoff preserve protection, project priorities and deferred workflows", () => {
  const settings = JSON.parse(read(".vh-adlc/triage.json"));
  expect(settings.repository).toBe("michielvha/stackweaver"); expect(settings.protected_ids).toEqual([332,334]);
  expect(settings.generated_mirrors).toContain("distribution"); expect(settings.report_dir).toBe("docs/internal/status");
  expect(settings.priority_order).toEqual(["high","medium","low"]); expect(settings.milestone_order).toEqual(["Public Go Live"]);
  expect(settings.workstreams.map((rule:{owner:string})=>rule.owner)).toEqual(["codebase-audit","tfe-compat","rbac"]);
  expect(settings.workstreams.flatMap((rule:{reference_files?:string[]})=>rule.reference_files??[])).toContain("docs/internal/plans/features/RBAC_MASTER_PLAN.md");
  expect(read("tests/agent-triage/README.md")).toContain("129581f6dbe4df71200af8f67d7bc017d35e89ad");
  expect(read("tests/agent-triage/README.md")).toContain("D-01 through D-05");
});

test("triage migration retains a usable managed-controller handoff",()=>{
  const entry=read("agents/issue-triage.md"),handoff=read("tests/agent-triage/README.md");
  expect(entry).toContain("controller.ts");expect(entry).toContain("--command triage");
  expect(handoff).toContain("Managed controller");expect(handoff).toContain("operator");
  expect(read(".claude/commands/triage.md")).toMatch(/^model: fable$/m);
});
