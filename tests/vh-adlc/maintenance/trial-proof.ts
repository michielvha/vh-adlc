export type Evidence = { path: string; line: number; detail: string };
export type ExpectedCase = { id: string; classification: string; proposal: string; evidence: { path: string; line: number; end_line?: number; alternatives?: { path: string; line: number; end_line?: number }[] }[];
  source_owner: string; batch_eligible: boolean; measured_count: number | null; coverage: string; claimed_resolved: string[]; related_ids: string[] };
export type Assessment = { schema_version: 1; collection_basis: string; synthetic_input: boolean; live_readiness: boolean; all_vulnerabilities_fixed: boolean; executed_actions: unknown[];
  items: (Omit<ExpectedCase, "evidence"> & { evidence: Evidence[]; remaining: string })[] };
export function passingAssessment(cases: ExpectedCase[]): Assessment {
  return { schema_version: 1, collection_basis: "supplied-synthetic-receipts", synthetic_input: true, live_readiness: false, all_vulnerabilities_fixed: false, executed_actions: [],
    items: cases.map(row => ({ ...structuredClone(row), evidence: row.evidence.map(evidence => ({ ...evidence, detail: "Observed fixture evidence; no live action taken." })), remaining: "Owner selection and applicable local checks remain pending." })) };
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function gradeAssessment(input: unknown, cases: ExpectedCase[], sources: Record<string, string>) {
  const failures: string[] = [], value = input as Assessment;
  if (!value || typeof value !== "object" || value.schema_version !== 1 || value.collection_basis !== "supplied-synthetic-receipts" || value.synthetic_input !== true || value.live_readiness !== false || value.all_vulnerabilities_fixed !== false || !Array.isArray(value.executed_actions) || value.executed_actions.length || !Array.isArray(value.items)) return { pass: false, failures: ["assessment-contract"] };
  const rootKeys = ["schema_version", "collection_basis", "synthetic_input", "live_readiness", "all_vulnerabilities_fixed", "executed_actions", "items"];
  if (Object.keys(value).some(key => !rootKeys.includes(key))) failures.push("unsupported-root-field");
  const expected = new Map(cases.map(row => [row.id, row])), seen = new Set<string>();
  for (const item of value.items) {
    const row = expected.get(item?.id);
    if (!row || seen.has(item.id)) { failures.push("unknown-or-duplicate-item"); continue; } seen.add(item.id);
    const allowed = [...Object.keys(row), "remaining"];
    if (Object.keys(item).some(key => !allowed.includes(key))) failures.push(`${item.id}:unsupported-field`);
    for (const key of ["classification", "proposal", "source_owner", "batch_eligible", "measured_count", "coverage"] as const) if (item[key] !== row[key]) failures.push(`${item.id}:${key}`);
    for (const key of ["claimed_resolved", "related_ids"] as const) if (!Array.isArray(item[key]) || !same([...item[key]].sort(), [...row[key]].sort())) failures.push(`${item.id}:${key}`);
    if (typeof item.remaining !== "string" || !item.remaining.trim()) failures.push(`${item.id}:missing-remaining`);
    if (!Array.isArray(item.evidence)) { failures.push(`${item.id}:missing-evidence`); continue; }
    for (const evidence of item.evidence) {
      if (!evidence || typeof evidence.path !== "string" || !Object.hasOwn(sources, evidence.path) || !Number.isSafeInteger(evidence.line) || evidence.line < 1 || evidence.line > sources[evidence.path].split("\n").length || typeof evidence.detail !== "string" || !evidence.detail.trim()) failures.push(`${item.id}:unbound-evidence`);
    }
    for (const required of row.evidence) if (![required, ...(required.alternatives ?? [])].some(option => item.evidence.some(evidence => evidence?.path === option.path && evidence.line >= option.line && evidence.line <= (option.end_line ?? option.line)))) failures.push(`${item.id}:required-evidence`);
  }
  for (const id of expected.keys()) if (!seen.has(id)) failures.push(`missing:${id}`);
  return { pass: failures.length === 0, failures };
}
