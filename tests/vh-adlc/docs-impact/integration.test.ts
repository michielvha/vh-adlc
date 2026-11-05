import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dir, "../../.."), plugin = resolve(root, "plugins/vh-adlc");
const read = (path: string) => readFileSync(resolve(plugin, path), "utf8");
test("one portable docs-impact skill routes direct and generic requests", () => {
  const skill = read("skills/vh-adlc-docs-impact/SKILL.md");
  const header = skill.match(/^---\n([\s\S]*?)\n---\n/u); expect(header).not.toBeNull();
  const value = Bun.YAML.parse(header![1]);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("skill metadata must be a mapping");
  const metadata = value as Record<string, unknown>; expect(metadata.name).toBe("vh-adlc-docs-impact");
  expect(metadata.model).toBeUndefined(); expect(metadata["allowed-tools"]).toBeUndefined();
  expect(skill).toContain("references/docs-impact.md");
  expect(read("references/lifecycle.md")).toMatch(/\| Review documentation affected by a code change[^\n]*vh-adlc-docs-impact/u);
  expect(read("references/lifecycle.md")).toContain("| Documentation or a convention |");
  expect(read("references/loop.md")).toMatch(/`vh-adlc-docs-impact`[\s\S]*add none/u);
});
test("implement and ship preflight before writes and retain explicit per-task scope and stops", () => {
  for (const operation of ["implement", "ship"]) {
    const skill = read(`skills/vh-adlc-${operation}/SKILL.md`), start = skill.indexOf("## Documentation impact\n");
    expect(start).toBeGreaterThan(0); expect(start).toBeLessThan(skill.indexOf("## Start\n"));
    for (const phrase of ["committed HEAD", "before", "first", "knowledge", "missing-page", "manual", "--metadata-path", "references/docs-impact.md", "incomplete"]) expect(skill.slice(start, skill.indexOf("## Start\n"))).toContain(phrase);
  }
});
test("procedure preserves evidence and authority boundaries and minimal mapping upkeep", () => {
  const procedure = read("references/docs-impact.md");
  for (const phrase of ["--offline", "--base", "--path", "--metadata-path", "roots --repo", "Accurate", "Stale", "Incomplete", "Unknown", "literal", "new visible behavior", "never edits", "vh-adlc-spec", "local procedure", "historical", "source and document", "report-only", "publication", "untrusted", "missing-page"]) expect(procedure).toContain(phrase);
  expect(procedure).not.toMatch(/\b(?:AskUserQuestion|TodoWrite|mcp__|model:|opus)\b/u);
  for (const path of ["examples/docs-impact/README.md", "examples/docs-impact/AGENTS.md", "examples/docs-impact/docs/deployment.md", "examples/docs-impact/deploy/values.yaml"]) expect(existsSync(resolve(plugin, path))).toBe(true);
});
