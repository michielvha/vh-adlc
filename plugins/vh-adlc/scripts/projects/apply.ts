import { createHash } from "node:crypto";
import { GitHub } from "./github";
import { allowed, collect, issueRef, type Inventory, type Operation } from "./inventory";
import { keys, list, object, string, type Settings } from "./settings";

type Plan = { schema_version: 1; complete: true; project: { id: string; url: string }; repositories: string[]; operations: Operation[] };
type Status = "succeeded" | "already_satisfied" | "reconciled" | "conflict" | "refused" | "failed" | "unknown" | "not_attempted";
type Outcome = { issue: string; kind: Operation["kind"]; status: Status; limitation?: string };
export const raceLimit = "GitHub has no atomic field-update condition; a concurrent edit may have been overwritten.";
/** This digest binds the operator's approval attestation to exact batch bytes, not to a chat identity. */
export function digest(text: string): string { return createHash("sha256").update(text).digest("hex"); }
export function parsePlan(settings: Settings, text: string): Plan {
  const input = object(JSON.parse(text));
  keys(input, ["schema_version", "complete", "project", "repositories", "operations"]);
  if (input.schema_version !== 1 || input.complete !== true) throw new Error("batch requires a complete inventory with schema_version 1");
  const project = object(input.project); keys(project, ["id", "url"]);
  if (project.url !== settings.project) throw new Error("batch project differs from settings");
  const repositories = list(input.repositories).map(string);
  if (JSON.stringify(repositories.map(repo => repo.toLowerCase()).sort()) !== JSON.stringify(settings.repositories.map(repo => repo.toLowerCase()).sort())) throw new Error("batch repository scope differs from settings");
  const operations = list(input.operations).map((value): Operation => {
    const row = object(value), issue = issueRef(row.issue);
    if (!allowed(settings, issue)) throw new Error("batch issue is outside configured scope");
    if (row.kind === "add") { keys(row, ["kind", "issue"]); return { kind: "add", issue }; }
    if (row.kind !== "set") throw new Error("unsupported batch operation");
    keys(row, ["kind", "issue", "item", "field", "before", "value"]);
    const valueId = string(row.value);
    if (!settings.fields.some(field => field.options.includes(valueId))) throw new Error("option is outside configured scope");
    return { kind: "set", issue, item: string(row.item), field: string(row.field), before: row.before === null ? null : string(row.before), value: valueId };
  });
  const identities = operations.map(op => op.kind === "add" ? `add:${op.issue.id}` : `set:${op.issue.id}:${op.field}`);
  if (operations.length > 100 || new Set(identities).size !== operations.length) throw new Error("batch must contain at most 100 distinct operations");
  return { schema_version: 1, complete: true, project: { id: string(project.id), url: settings.project }, repositories, operations };
}
function observed(settings: Settings, gh: GitHub, plan: Plan): Inventory {
  const current = collect(settings, gh);
  if (!current.complete || current.project?.id !== plan.project.id) throw new Error("fresh inventory is incomplete or project identity changed");
  return current;
}
function check(operation: Operation, current: Inventory): "write" | "already_satisfied" | "conflict" | "refused" {
  const actual = current.issues.find(issue => issue.id === operation.issue.id);
  if (!actual || actual.repository.toLowerCase() !== operation.issue.repository.toLowerCase() || actual.url !== operation.issue.url || actual.number !== operation.issue.number) return "refused";
  const item = current.items.find(item => item.issue.id === actual.id);
  if (operation.kind === "add") return item ? "already_satisfied" : actual.state === "OPEN" ? "write" : "refused";
  if (!item || item.id !== operation.item) return "conflict";
  const field = current.fields.find(field => field.id === operation.field);
  if (!field || !field.options.includes(operation.value)) return "refused";
  const before = item.values[operation.field] ?? null;
  return before === operation.value ? "already_satisfied" : before === operation.before ? "write" : "conflict";
}
export function apply(settings: Settings, gh: GitHub, text: string, approvedDigest: string): { schema_version: 1; complete: boolean; batch_digest: string; outcomes: Outcome[] } {
  if (!/^[a-f0-9]{64}$/.test(approvedDigest) || digest(text) !== approvedDigest) throw new Error("exact batch approval digest is missing or changed");
  const plan = parsePlan(settings, text), outcomes: Outcome[] = [];
  let stopped = false;
  for (const operation of plan.operations) {
    const outcome: Outcome = { issue: operation.issue.url, kind: operation.kind, status: "not_attempted", ...(operation.kind === "set" ? { limitation: raceLimit } : {}) };
    outcomes.push(outcome);
    if (stopped) continue;
    let before: Inventory;
    try { before = observed(settings, gh, plan); } catch { outcome.status = "refused"; stopped = true; continue; }
    const action = check(operation, before);
    if (action !== "write") { outcome.status = action; stopped = !["already_satisfied"].includes(action); continue; }
    let failed = false;
    try {
      if (operation.kind === "add") gh.query("mutation AddIssue($project:ID!,$content:ID!) { addProjectV2ItemById(input:{projectId:$project,contentId:$content}) { item { id } } }", { project: plan.project.id, content: operation.issue.id });
      else gh.query("mutation SetField($project:ID!,$item:ID!,$field:ID!,$value:String!) { updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{singleSelectOptionId:$value}}) { projectV2Item { id } } }", { project: plan.project.id, item: operation.item, field: operation.field, value: operation.value });
    } catch { failed = true; }
    try {
      const after = observed(settings, gh, plan);
      outcome.status = check(operation, after) === "already_satisfied" ? failed ? "reconciled" : "succeeded" : "failed";
    } catch { outcome.status = "unknown"; }
    if (!["succeeded", "reconciled"].includes(outcome.status)) stopped = true;
  }
  return { schema_version: 1, complete: !stopped, batch_digest: approvedDigest, outcomes };
}
