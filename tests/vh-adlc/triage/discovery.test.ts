import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dir, "../../.."), plugin = resolve(root, "plugins/vh-adlc");
const read = (path: string) => readFileSync(resolve(plugin, path), "utf8");

test("native skill discovery exposes triage with one harness-neutral canonical procedure", () => {
  const skill = read("skills/vh-adlc-triage/SKILL.md"), match = skill.match(/^---\n([\s\S]*?)\n---\n/);
  expect(match).not.toBeNull();
  const metadata = Bun.YAML.parse(match![1]) as Record<string, unknown>;
  expect(metadata.name).toBe("vh-adlc-triage"); expect(metadata).not.toHaveProperty("model"); expect(metadata).not.toHaveProperty("allowed-tools");
  expect(skill).toContain("references/triage.md"); expect(skill).toContain("references/lifecycle.md");
  const names = readdirSync(resolve(plugin, "skills")).filter((path) => path.startsWith("vh-adlc-"));
  expect(names).toHaveLength(8);
  expect(skill.length).toBeLessThan(5000);
  expect(read("references/triage.md")).not.toMatch(/\b(?:AskUserQuestion|TodoWrite|mcp__|model:|fable|opus)\b/);
});

test("lifecycle routes triage without changing investigation, docs, feature or maintenance contracts", () => {
  const lifecycle = read("references/lifecycle.md");
  expect(lifecycle).toMatch(/\| Backlog triage[^\n]*skills\/vh-adlc-triage\/SKILL.md/);
  for (const name of ["Documentation or a convention", "Bounded maintenance", "New capability or wider behavior change", "Diagnosis or findings"]) expect(lifecycle).toContain(`| ${name} |`);
  expect(lifecycle).toContain("triage approval"); expect(lifecycle).toContain("Exact batch");
  expect(read("references/authority.md")).toContain("presented exact triage batch");
  expect(read("references/authority.md")).toContain("local plan commit");
});

test("the procedure describes complete collection, evidence, report history and exact approved execution", () => {
  const procedure = read("references/triage.md");
  for (const phrase of ["triage-settings.md", "scripts/triage/cli.ts", "--report-output", "--index-requests", "source_commit", "adversarial", "not_planned", "{{created_issue_url}}", "owner_statement", "batch_hash", "uncertain", "serial", "plain chat"]) expect(procedure).toContain(phrase);
  for (const mode of ["sweep", "next", "close", "stale", "ids"]) expect(procedure).toContain(`\`${mode}\``);
  expect(procedure).toMatch(/every closure/i); expect(procedure).toMatch(/current.*owner request/i);
  expect(procedure).toMatch(/comment.*before.*clos/i); expect(procedure).toMatch(/uncommitted by default/i);
});

test("public guides agree on eight operations, runtime needs and unverified new surfaces", () => {
  const guide = readFileSync(resolve(root, "docs/user-guides/workflows.md"), "utf8");
  const install = readFileSync(resolve(root, "docs/get-started/installation.md"), "utf8");
  const compatibility = readFileSync(resolve(root, "docs/reference/compatibility.md"), "utf8");
  expect(guide).toContain("eight skills"); expect(guide).toContain("`vh-adlc-triage`"); expect(guide).toMatch(/exact.*batch/i);
  expect(install).toContain("eight skills"); expect(install).toMatch(/(?:Bun[^\n]*triage|triage[^\n]*Bun)/i); expect(install).toContain("GitHub CLI");
  expect(compatibility).toContain("Shared triage"); expect(compatibility).toMatch(/triage[\s\S]*unverified/i);
  expect(readFileSync(resolve(root, "README.md"), "utf8")).toMatch(/triage/i);
});
