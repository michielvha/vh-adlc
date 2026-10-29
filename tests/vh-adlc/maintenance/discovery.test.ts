import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const plugin = join(import.meta.dir, "../../../plugins/vh-adlc"), read = (path: string) => readFileSync(join(plugin, path), "utf8");
test("maintenance is a discoverable model-neutral operation with one canonical procedure", () => {
  const skill = read("skills/vh-adlc-maintenance/SKILL.md"), match = skill.match(/^---\n([\s\S]*?)\n---\n/); expect(match).not.toBeNull();
  const header = Bun.YAML.parse(match![1]) as Record<string, unknown>;
  expect(header.name).toBe("vh-adlc-maintenance"); expect(header).not.toHaveProperty("model"); expect(header).not.toHaveProperty("allowed-tools");
  expect(skill.length).toBeLessThan(5000);
  for (const path of ["references/maintenance.md", "references/maintenance-settings.md", "references/authority.md", "references/loop.md"]) { expect(skill).toContain(path); expect(read(path).length).toBeGreaterThan(0); }
  expect(readdirSync(join(plugin, "skills"))).toHaveLength(11);
  expect(read("references/maintenance.md")).not.toMatch(/\b(?:AskUserQuestion|TodoWrite|mcp__|model:)\b/);
});

test("intake keeps existing routes and adds sweep/resume without granting publication", () => {
  const lifecycle = read("references/lifecycle.md");
  expect(lifecycle).toMatch(/\| Dependency or security sweep[^\n]*skills\/vh-adlc-maintenance\/SKILL.md/);
  for (const name of ["Backlog triage", "Diagnosis or findings", "Documentation or a convention", "Bounded maintenance", "New capability or wider behavior change"]) expect(lifecycle).toContain(`| ${name} |`);
  expect(lifecycle).toMatch(/sweep.*run report/); expect(lifecycle).toContain("paired");
  const authority = read("references/authority.md");
  for (const term of ["Standing maintenance report publication", "default-branch-checkout-ff-only", "current request", "no-push", "batch source", "evidence", "selected satellite", "fresh clone", "report-only", "non-forced"]) expect(authority).toContain(term);
  expect(authority).toContain("Its direct-invocation publication grant does not transfer through selection");
});

test("the maintenance contract covers actual analysis, private outcomes and bounded report publication", () => {
  const procedure = read("references/maintenance.md").replace(/\s+/g, " ");
  for (const term of ["scripts/maintenance/cli.ts", "report-stage", "source_commit", "release notes", "call-site", "pre-1.0", "superset", "inventory gap", "complete-unavailable", "unverified legacy comparison", "pending-outcome", "Maintenance-Step", "no-commit", "no-push", "ff-only", "before selection", "after transfer", "default-branch checkout", "unpublished", "read-only", "independent", "source_target", "record_target"]) expect(procedure).toContain(term);
  expect(procedure).not.toContain("michielvha/stackweaver"); expect(procedure).not.toContain("satellite-merge.sh");
  const schema = read("references/maintenance-settings.md");
  for (const term of ["schema_version", "bot_inventory_terms", "surface_expectations", "index_paths", "publication_route", "same_run_updates", "AGENTS.md", ".vh-adlc/maintenance.json", "project_procedure"]) expect(schema).toContain(term);
});

test("authored repair review binds both source and Definition while bot-only batching retains its flow", () => {
  const lifecycle = read("references/lifecycle.md"), record = read("references/maintenance-record.md"), review = read("references/maintenance-review.md");
  for (const text of [lifecycle, record, review]) { expect(text).toContain("source_target"); expect(text).toContain("record_target"); }
  for (const term of ["Task base", "post-aggregation", "Verification inputs", "source_target", "record_target"]) expect(record).toContain(term);
  for (const term of ["single-target", "Definition", "verification inputs", "MODEL:", "NO FINDINGS", "handoff"]) expect(review).toContain(term);
  expect(review).toMatch(/paired/i);
  expect(read("references/maintenance.md")).toContain("Pure bot aggregation");
});
