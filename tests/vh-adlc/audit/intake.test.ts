import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { intakeCases } from "./intake-cases";
const plugin = resolve(import.meta.dir, "../../../plugins/vh-adlc");
test("lifecycle explicitly routes persistent audit intent while keeping unrelated security, diagnosis and backlog routes", () => {
  const text = readFileSync(resolve(plugin, "references/lifecycle.md"), "utf8");
  for (const phrase of ["skills/vh-adlc-audit/SKILL.md", "persistent source-audit intent", "configuration alone", "audit security", "onboarding", "restoration", "audit-record.md"]) expect(text).toContain(phrase);
  for (const route of ["vh-adlc-maintenance", "vh-adlc-investigate", "vh-adlc-triage"]) expect(text).toContain(route);
  expect(intakeCases.some(c => c.operation === "audit" && !c.configured)).toBe(true);
  expect(intakeCases.filter(c => c.operation === "clarify")).toHaveLength(2);
});
test("audit authority records the two owned roles and never imports triage proof or maintenance publication grants", () => {
  const text = readFileSync(resolve(plugin, "references/authority.md"), "utf8");
  for (const phrase of ["audit-ledger", "audit-repair", "Standing audit workflow authorization", "reverify/full", "audit.md"]) expect(text).toContain(phrase);
});
