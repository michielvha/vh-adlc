import { canonicalDigest, canonicalJSON, compareUTF8, decodeUTF8, protocolPath, sha256 } from "./protocol";

export type AttentionInput = {
  repository: string; scope_sha256: string; identity: string;
  disposition: "decision" | "unknown" | "needs-resolution";
  reason: string; owner_action: string; rule: unknown;
  inputs: Record<string, string | null>; required_inputs: string[] | null;
  title: string; links: string[];
};
export type AttentionProjection = { version: 1; sha256: string; binding: unknown };
export type CorrectionInput = {
  repository: string; scope_sha256: string; identity: string; path: string;
  patch_sha256: string; postimage_sha256: string; verification_sha256: string; inputs_sha256: string;
};
export type Failure = { code: string; message: string };
export type Proposal = {
  locator: string; state: "open" | "closed" | "merged";
  assessment: "supported" | "fixed-differently" | "unsupported" | "unverifiable";
  actor: string; head: string; body_sha256: string; paths: string[];
  reviewed: { actor: string; head: string; body_sha256: string; corrections: string[]; attention: AttentionProjection[] } | null;
  evidence: { receipt_sha256: string | null; inputs_sha256: string };
};
/** Internal handoff from the provenance reader. Never populate from a report/CLI approval flag. */
export type HistorySnapshot = {
  captured_at: string;
  records: Array<{ kind: "report"; locator: string; bytes: Uint8Array; sha256: string; expires_at: string }>;
  diagnostics: string[];
};
export type Publication = { correction_sha256: string; locator: string; head: string };
export type ReportInput = {
  repository: string; scope_sha256: string; run_id: string; started_at: string; completed_at: string;
  source_commit: string; collection_complete: boolean; failures: Failure[];
  attention: AttentionInput[]; corrections: CorrectionInput[]; proposals: Proposal[];
  history: HistorySnapshot; published: Publication[];
};
export type Report = {
  schema: "docs-drift-report/v1"; repository: string; scope_sha256: string; run_id: string;
  started_at: string; completed_at: string; source_commit: string; collection_complete: boolean;
  outcome: "failed" | "new-attention" | "published" | "carried-delivery" | "carried-attention" | "no-change";
  success: boolean; delivery: "published" | "carried" | "none"; failures: Failure[];
  attention: Array<{ item: AttentionInput; projection: AttentionProjection; carried_from: string[]; match_reason: string }>;
  published: Publication[]; carried_delivery: Array<{ correction_sha256: string; locator: string }>;
  blocked_corrections: string[]; pending_corrections: string[]; history_diagnostics: string[];
};

function invalid(reason: string): never { throw new Error(`invalid docs-drift report ${reason}`); }
function hash(value: string): string {
  if (!/^[a-f0-9]{64}$/u.test(value)) invalid("digest");
  return value;
}
function nonempty(value: string): string {
  if (typeof value !== "string" || !value.trim()) invalid("text");
  canonicalJSON(value);
  return value;
}
export function reportTime(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value) || !Number.isFinite(Date.parse(value))) invalid("timestamp");
  const normalized = value.replace(/(?:\.(\d{1,3}))?Z$/u, (_, fraction: string | undefined) => `.${(fraction ?? "").padEnd(3, "0")}Z`);
  const parsed = Date.parse(value);
  if (new Date(parsed).toISOString() !== normalized) invalid("timestamp calendar");
  return parsed;
}
function consumer(repository: string, scope: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) invalid("repository");
  hash(scope);
}

export function attentionProjection(item: AttentionInput): AttentionProjection {
  consumer(item.repository, item.scope_sha256);
  if (!["decision", "unknown", "needs-resolution"].includes(item.disposition)) invalid("disposition");
  const keys = item.required_inputs === null ? Object.keys(item.inputs) : item.required_inputs;
  if (keys.length === 0 || new Set(keys).size !== keys.length) invalid("required inputs");
  const inputs = [...keys].sort(compareUTF8).map(key => {
    nonempty(key);
    if (!Object.hasOwn(item.inputs, key)) invalid(`missing required input ${key}`);
    const value = item.inputs[key];
    return [key, value === null ? null : hash(value)];
  });
  const binding = {
    version: 1, repository: item.repository, scope_sha256: item.scope_sha256,
    identity: nonempty(item.identity), disposition: item.disposition,
    reason: nonempty(item.reason), owner_action: nonempty(item.owner_action), rule: item.rule,
    input_mode: item.required_inputs === null ? "complete" : "bounded", inputs,
  };
  return { version: 1, sha256: canonicalDigest(binding), binding };
}

export function correctionProjection(item: CorrectionInput): string {
  consumer(item.repository, item.scope_sha256);
  return canonicalDigest({ version: 1, repository: item.repository, scope_sha256: item.scope_sha256,
    identity: nonempty(item.identity), path: protocolPath(item.path), patch_sha256: hash(item.patch_sha256),
    postimage_sha256: hash(item.postimage_sha256), verification_sha256: hash(item.verification_sha256), inputs_sha256: hash(item.inputs_sha256) });
}

function samePayload(proposal: Proposal): boolean {
  const reviewed = proposal.reviewed;
  return proposal.state === "open" && proposal.assessment === "supported" && reviewed !== null
    && proposal.evidence.receipt_sha256 !== null && proposal.actor === reviewed.actor
    && proposal.head === reviewed.head && proposal.body_sha256 === reviewed.body_sha256;
}

function proposalDecision(input: ReportInput, proposal: Proposal, reason: string): AttentionInput {
  return {
    repository: input.repository, scope_sha256: input.scope_sha256, identity: `proposal:${proposal.locator}`,
    disposition: "needs-resolution", reason, owner_action: "Select a separate resolve assessment for the existing proposal",
    rule: { version: 1, kind: "proposal-support", actor: proposal.actor, head: proposal.head, body_sha256: proposal.body_sha256, paths: [...proposal.paths].sort(compareUTF8) },
    inputs: { receipt: proposal.evidence.receipt_sha256, assessment: proposal.evidence.inputs_sha256 }, required_inputs: ["receipt", "assessment"],
    title: `Existing proposal ${proposal.locator} needs resolution`, links: [proposal.locator],
  };
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid("history object");
  return value as Record<string, unknown>;
}
function priorProjection(value: unknown): string {
  const record = object(value);
  if (record.version !== 1 || typeof record.sha256 !== "string" || hash(record.sha256) !== canonicalDigest(record.binding)) invalid("history projection");
  const binding = object(record.binding);
  if (binding.version !== 1) invalid("history projection version");
  return record.sha256;
}

function priorMatches(input: ReportInput): { matches: Map<string, string[]>; diagnostics: string[] } {
  const matches = new Map<string, string[]>();
  const diagnostics = [...input.history.diagnostics];
  const start = reportTime(input.started_at);
  if (reportTime(input.history.captured_at) > start) invalid("history snapshot must precede run");
  for (const record of input.history.records) {
    try {
      if (record.bytes.byteLength > 16 * 1024 * 1024 || sha256(record.bytes) !== hash(record.sha256) || reportTime(record.expires_at) <= start) invalid("history bytes or expiry");
      const parsed: unknown = JSON.parse(decodeUTF8(record.bytes));
      if (!canonicalJSON(parsed).equals(Buffer.from(record.bytes))) invalid("history canonical bytes");
      const report = object(parsed);
      if (report.schema !== "docs-drift-report/v1" || report.repository !== input.repository || report.scope_sha256 !== input.scope_sha256
        || typeof report.run_id !== "string" || report.run_id === input.run_id || report.collection_complete !== true
        || !Array.isArray(report.failures) || report.failures.length !== 0 || !Array.isArray(report.attention)
        || !["no-change", "carried-attention", "carried-delivery", "published", "new-attention"].includes(String(report.outcome))) invalid("history scope or terminal state");
      if (typeof report.started_at !== "string" || typeof report.completed_at !== "string"
        || reportTime(report.completed_at) < reportTime(report.started_at) || reportTime(report.completed_at) >= reportTime(input.history.captured_at)) invalid("history chronology");
      const projections = report.attention.map(entry => priorProjection(object(entry).projection));
      for (const projection of projections) matches.set(projection, [...(matches.get(projection) ?? []), nonempty(record.locator)]);
    } catch {
      diagnostics.push(`Prior evidence ${record.locator} is ineligible or unverifiable`);
    }
  }
  return { matches, diagnostics };
}

/** Pure status projection. Effect authorization and native provenance are checked before this internal handoff. */
export function buildReport(input: ReportInput): Report {
  consumer(input.repository, input.scope_sha256);
  nonempty(input.run_id);
  if (reportTime(input.completed_at) < reportTime(input.started_at)) invalid("run chronology");
  if (!/^[a-f0-9]{40,64}$/u.test(input.source_commit)) invalid("source commit");
  const { matches, diagnostics } = priorMatches(input);
  const failures = [...input.failures];
  if (!input.collection_complete) failures.push({ code: "collection-incomplete", message: "Required collection is incomplete" });
  const corrections = new Map<string, CorrectionInput>();
  for (const correction of input.corrections) {
    if (correction.repository !== input.repository || correction.scope_sha256 !== input.scope_sha256) invalid("foreign correction");
    const id = correctionProjection(correction);
    if (corrections.has(id)) invalid("duplicate correction");
    corrections.set(id, correction);
  }
  const items = [...input.attention];
  const carried: Report["carried_delivery"] = [];
  const blocked = new Set<string>();
  const proposalLocators = new Set<string>();
  for (const proposal of input.proposals) {
    nonempty(proposal.locator);
    if (proposalLocators.has(proposal.locator)) invalid("duplicate proposal");
    proposalLocators.add(proposal.locator);
    for (const path of proposal.paths) protocolPath(path);
    hash(proposal.body_sha256);
    hash(proposal.evidence.inputs_sha256);
    if (proposal.evidence.receipt_sha256 !== null) hash(proposal.evidence.receipt_sha256);
    if (proposal.state !== "open") continue;
    const overlapping = [...corrections].filter(([, correction]) => proposal.paths.includes(correction.path));
    const supported = samePayload(proposal);
    const matched = overlapping.filter(([id]) => proposal.reviewed?.corrections.includes(id));
    const conflict = !supported || matched.length !== overlapping.length;
    if (conflict) {
      for (const [id] of overlapping) blocked.add(id);
      items.push(proposalDecision(input, proposal, supported ? "New and existing corrections overlap" : `Proposal support is ${proposal.assessment}; reviewed payload cannot be carried`));
    } else {
      for (const [id] of matched) carried.push({ correction_sha256: id, locator: proposal.locator });
      for (const projection of proposal.reviewed?.attention ?? []) {
        const id = priorProjection(projection);
        matches.set(id, [...(matches.get(id) ?? []), proposal.locator]);
      }
    }
  }
  const attention: Report["attention"] = [];
  const identities = new Set<string>();
  for (const item of items) {
    if (item.repository !== input.repository || item.scope_sha256 !== input.scope_sha256) invalid("foreign attention");
    if (identities.has(item.identity)) invalid("duplicate attention identity");
    identities.add(item.identity);
    const projection = attentionProjection(item);
    const carriedFrom = [...new Set(matches.get(projection.sha256) ?? [])].sort(compareUTF8);
    const matchReason = carriedFrom.length ? "Unchanged entry in eligible prior evidence"
      : matches.size ? "No unchanged entry matches the complete current binding" : "No eligible prior evidence contains this item";
    attention.push({ item, projection, carried_from: carriedFrom, match_reason: matchReason });
  }
  const carriedDelivery = carried.filter(item => !blocked.has(item.correction_sha256));
  const published = [...input.published];
  const publishedIDs = new Set<string>();
  for (const publication of published) {
    nonempty(publication.locator);
    if (!/^[a-f0-9]{40,64}$/u.test(publication.head) || !corrections.has(publication.correction_sha256)
      || blocked.has(publication.correction_sha256) || carriedDelivery.some(item => item.correction_sha256 === publication.correction_sha256)
      || publishedIDs.has(publication.correction_sha256)) invalid("publication binding");
    publishedIDs.add(publication.correction_sha256);
  }
  const pending = [...corrections.keys()].filter(id => !publishedIDs.has(id) && !blocked.has(id) && !carriedDelivery.some(item => item.correction_sha256 === id));
  if (pending.length) failures.push({ code: "delivery-incomplete", message: "Selected corrections have no completed reviewed delivery" });
  const newAttention = attention.some(item => item.carried_from.length === 0);
  const delivery = published.length ? "published" : carriedDelivery.length ? "carried" : "none";
  const outcome = failures.length ? "failed" : newAttention ? "new-attention" : published.length ? "published"
    : carriedDelivery.length ? "carried-delivery" : attention.length ? "carried-attention" : "no-change";
  return { schema: "docs-drift-report/v1", repository: input.repository, scope_sha256: input.scope_sha256,
    run_id: input.run_id, started_at: input.started_at, completed_at: input.completed_at, source_commit: input.source_commit,
    collection_complete: input.collection_complete, outcome, success: outcome !== "failed" && outcome !== "new-attention",
    delivery, failures, attention, published, carried_delivery: carriedDelivery,
    blocked_corrections: [...blocked].sort(compareUTF8), pending_corrections: pending.sort(compareUTF8), history_diagnostics: diagnostics };
}

function prose(value: string): string {
  return value.replaceAll(/\r?\n/gu, " ").replaceAll(/[<>`\[\]\\*_]/gu, character => `\\${character}`);
}
export function renderReport(report: Report): string {
  const count = report.attention.length;
  const lines = ["# Documentation drift report", "", `${report.outcome}. ${report.published.length} published correction(s), ${report.carried_delivery.length} pending delivery item(s), ${count} unresolved item${count === 1 ? "" : "s"}.`, "", "## Fixes", ""];
  for (const item of report.published) lines.push(`- Published ${prose(item.locator)} at ${item.head}.`);
  for (const item of report.carried_delivery) lines.push(`- Pending in ${prose(item.locator)}.`);
  if (!report.published.length && !report.carried_delivery.length) lines.push("No completed correction delivery.");
  lines.push("", "## Decisions", "");
  for (const entry of report.attention) {
    lines.push(`- ${prose(entry.item.title)}. ${prose(entry.item.reason)}. ${prose(entry.item.owner_action)}.`);
    lines.push(`  ${prose(entry.match_reason)}.`);
    if (entry.carried_from.length) lines.push(`  Previously surfaced in ${entry.carried_from.map(prose).join(", ")}.`);
    if (entry.item.links.length) lines.push(`  Evidence ${entry.item.links.map(prose).join(", ")}.`);
  }
  if (!count) lines.push("No unresolved content decisions.");
  lines.push("", "## Recommendations", "");
  if (report.failures.length) for (const failure of report.failures) lines.push(`- Resolve ${prose(failure.code)}. ${prose(failure.message)}.`);
  else if (count) lines.push("Use the listed owner actions to select the next assessment.");
  else lines.push("Review the listed deliveries through the normal project workflow.");
  lines.push("", "## Verification", "", `Required collection ${report.collection_complete ? "complete" : "incomplete"}. ${count} unresolved item${count === 1 ? " remains" : "s remain"}.`, "");
  for (const diagnostic of report.history_diagnostics) lines.push(`- ${prose(diagnostic)}.`);
  return lines.join("\n") + "\n";
}
