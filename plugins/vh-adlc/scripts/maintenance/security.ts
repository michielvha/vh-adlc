import { canonicalJSON, digest, runID } from "./journal";
import * as v from "./security-value";

export type Target = { kind: "source" | "image"; reference: string | null; platform: string };
export type PolicyBinding = { path: string; digest: string };
export type SecurityScope = { repositories: string[]; filters: string[]; exclusions: string[] };
export type FollowUp = { reference: string; owner: string | null; assignment_handoff: string | null; next_action: string };
export type Occurrence = { id: string; hostname: string; repository: string; surface: string; provider_id: string; provider_state: string; target: Target;
  package: string | null; ecosystem: string | null; version: string | null; location: string | null; severity: string; advisory_ids: string[];
  affected_range: string | null; fixed_versions: string[]; relationship: string | null; dependency_scope: string | null; rule: string | null;
  observed_at: string; raw_digest: string; raw_reference: string; complete: boolean; synthetic: boolean; reactivated: boolean };
export type SecurityCoverage = { hostname: string; repository: string; surface: string; status: "complete" | "complete-unavailable" | "incomplete";
  count: number | null; reason: string | null; handoff: FollowUp | null; synthetic: boolean };
export type Evidence = { id: string; kind: "source" | "check" | "scan" | "authority" | "tracking" | "ownership" | "retirement" | "delivery";
  occurrence_id: string; target: Target; binding: string; reference: string; digest: string; observed_at: string; complete: boolean; synthetic: boolean; result: string };
export type Decision = { id: string; change: "compatible-bot" | "compatible-authored" | "major" | "behavior" | "unknown" | "posture" | "audit" | "exception";
  outcome: "open" | "fixed" | "exception" | "retired" | "unknown"; follow_up: FollowUp | null; delivery_required: boolean; delivery_evidence: string[];
  exception: { kind: "risk-accepted" | "mitigated" | "not-affected"; rationale: string; expires_at: string | null } | null; successor: Target | null };
export type RemediationGroup = { id: string; source_repository: string; source_path: string; occurrence_ids: string[]; evidence: string };
export type SecurityInput = { schema_version: 1; run_id: string; hostname: string; repository: string; source_commit: string; evaluated_at: string; collected_at: string;
  collection_revision: number; inventory_digest: string; scope: SecurityScope; policy: PolicyBinding[];
  policy_assessment: { reviewer: string; reference: string; assessed_at: string } | null; coverage: SecurityCoverage[];
  observations: Occurrence[]; evidence: Evidence[]; decisions: Decision[]; groups: RemediationGroup[]; history_gaps?: string[]; history_provenance?: string[] };
export type FindingState = { occurrence: Occurrence; route: string | null; selected: false; group: string | null; canonical_source: { repository: string; path: string } | null;
  remediation: "open" | "fixed-verified" | "unknown"; target_lifecycle: "active" | "superseded-pending" | "retired-verified";
  exception: Decision["exception"]; follow_up: FollowUp | null; accounted: boolean; delivery_pending: boolean; reasons: string[] };
export type SecuritySnapshot = { schema_version: 1; kind: "maintenance-security-v1"; input: SecurityInput; input_digest: string;
  accounting_state: "reconciled" | "pending"; coverage_state: "complete" | "incomplete" | "documented-unavailable";
  open_remediation_count: number; exception_count: number; pending_delivery_count: number; group_count: number; retired_count: number;
  all_clear: boolean; findings: FindingState[]; gaps: string[]; digest: string };

function target(value: unknown): Target {
  const t = v.record(value, ["kind", "reference", "platform"]), kind = v.choice(t.kind, ["source", "image"] as const), reference = v.nullable(t.reference);
  if (reference !== null) { if (kind === "image") { if (!/^sha256:[a-f0-9]{64}$/.test(reference)) throw Error("image target digest invalid"); } else v.commit(reference); }
  return { kind, reference, platform: v.text(t.platform) };
}
function scope(value: unknown): SecurityScope {
  const s = v.record(value, ["repositories", "filters", "exclusions"]), repositories = v.strings(s.repositories).sort();
  if (!repositories.length) throw Error("security scope is empty"); repositories.forEach(repo => v.identity("github.com", repo));
  return { repositories, filters: s.filters === undefined ? [] : v.strings(s.filters).sort(), exclusions: s.exclusions === undefined ? [] : v.strings(s.exclusions).sort() };
}
function policy(value: unknown): PolicyBinding[] {
  const seen = new Set<string>();
  return v.list(value).map(value => {
    const p = v.record(value, ["path", "digest"]), path = v.text(p.path);
    if (path.startsWith("/") || path.includes("\\") || path.split("/").some(part => !part || part === "." || part === "..") || seen.has(path)) throw Error("security policy path invalid or duplicated");
    seen.add(path); return { path, digest: v.hash(p.digest) };
  }).sort((a,b)=>a.path.localeCompare(b.path));
}
export function evidenceBinding(source: string, bindings: PolicyBinding[], selected: { repositories: string[]; filters?: string[]; exclusions?: string[] }, item: Target): string {
  return digest(canonicalJSON({ source_commit: v.commit(source), policy: policy(bindings), scope: scope(selected), target: target(item) }));
}
function followUp(value: unknown): FollowUp | null {
  if (value === null) return null;
  const f = v.record(value, ["reference", "owner", "assignment_handoff", "next_action"]);
  return { reference: v.text(f.reference), owner: v.nullable(f.owner), assignment_handoff: v.nullable(f.assignment_handoff), next_action: v.text(f.next_action) };
}
function unique<T>(values: unknown, parse: (value: unknown) => T, key: (value: T) => string): T[] {
  const seen = new Set<string>(); return v.list(values).map(value => { const row = parse(value), id = key(row); if (seen.has(id)) throw Error("duplicate security identity"); seen.add(id); return row; });
}
export function parseSecurityInput(value: unknown): SecurityInput {
  const row = v.record(value, ["schema_version", "run_id", "hostname", "repository", "source_commit", "evaluated_at", "collected_at", "collection_revision", "inventory_digest", "scope", "policy", "policy_assessment", "coverage", "observations", "evidence", "decisions", "groups", "history_gaps", "history_provenance"]);
  if (row.schema_version !== 1) throw Error("unsupported security input schema");
  const identity = v.identity(row.hostname, row.repository), selected = scope(row.scope);
  const assessment = row.policy_assessment === null ? null : v.record(row.policy_assessment, ["reviewer", "reference", "assessed_at"]);
  const observations = unique(row.observations, value => {
    const o = v.record(value, ["id", "hostname", "repository", "surface", "provider_id", "provider_state", "target", "package", "ecosystem", "version", "location", "severity", "advisory_ids", "affected_range", "fixed_versions", "relationship", "dependency_scope", "rule", "observed_at", "raw_digest", "raw_reference", "complete", "synthetic", "reactivated"]);
    const names = v.identity(o.hostname, o.repository), surface = v.text(o.surface), provider_id = v.text(o.provider_id), id = v.text(o.id);
    if (names.hostname !== identity.hostname || !selected.repositories.includes(names.repository) || id !== `${names.hostname}/${names.repository}/${surface}:${provider_id}`) throw Error("security occurrence identity/scope changed");
    return { id, ...names, surface, provider_id, provider_state: v.choice(o.provider_state, ["open", "fixed", "dismissed", "auto_dismissed", "unknown"]), target: target(o.target),
      package: v.nullable(o.package), ecosystem: v.nullable(o.ecosystem), version: v.nullable(o.version), location: v.nullable(o.location), severity: v.text(o.severity), advisory_ids: v.strings(o.advisory_ids).sort(),
      affected_range: v.nullable(o.affected_range), fixed_versions: v.strings(o.fixed_versions), relationship: v.nullable(o.relationship), dependency_scope: v.nullable(o.dependency_scope), rule: v.nullable(o.rule),
      observed_at: v.timestamp(o.observed_at), raw_digest: v.hash(o.raw_digest), raw_reference: v.text(o.raw_reference), complete: v.flag(o.complete), synthetic: v.flag(o.synthetic), reactivated: v.flag(o.reactivated) };
  }, row=>row.id);
  const evidence = unique(row.evidence, value => {
    const e = v.record(value, ["id", "kind", "result", "occurrence_id", "target", "binding", "reference", "digest", "observed_at", "complete", "synthetic"]);
    return { id: v.text(e.id), kind: v.choice(e.kind, ["source", "check", "scan", "authority", "tracking", "ownership", "retirement", "delivery"] as const), result: v.text(e.result), occurrence_id: v.text(e.occurrence_id),
      target: target(e.target), binding: v.hash(e.binding), reference: v.text(e.reference), digest: v.hash(e.digest), observed_at: v.timestamp(e.observed_at), complete: v.flag(e.complete), synthetic: v.flag(e.synthetic) };
  }, row=>row.id);
  const decisions = unique(row.decisions, value => {
    const d = v.record(value, ["id", "change", "outcome", "follow_up", "delivery_required", "delivery_evidence", "exception", "successor"]);
    const ex = d.exception === undefined || d.exception === null ? null : v.record(d.exception, ["kind", "rationale", "expires_at"]);
    return { id: v.text(d.id), change: v.choice(d.change, ["compatible-bot", "compatible-authored", "major", "behavior", "unknown", "posture", "audit", "exception"] as const),
      outcome: v.choice(d.outcome, ["open", "fixed", "exception", "retired", "unknown"] as const), follow_up: followUp(d.follow_up), delivery_required: v.flag(d.delivery_required), delivery_evidence: v.strings(d.delivery_evidence),
      exception: ex ? { kind: v.choice(ex.kind, ["risk-accepted", "mitigated", "not-affected"] as const), rationale: v.text(ex.rationale), expires_at: ex.expires_at === null ? null : v.timestamp(ex.expires_at) } : null,
      successor: d.successor === undefined || d.successor === null ? null : target(d.successor) };
  }, row=>row.id);
  const coverage = unique(row.coverage, value => {
    const c = v.record(value, ["hostname", "repository", "surface", "status", "count", "reason", "handoff", "synthetic"]), names = v.identity(c.hostname,c.repository);
    if (names.hostname !== identity.hostname || !selected.repositories.includes(names.repository)) throw Error("coverage outside scope");
    const status = v.choice(c.status,["complete", "complete-unavailable", "incomplete"] as const), count = c.count === null ? null : v.integer(c.count);
    if ((status === "complete") !== (count !== null)) throw Error("security coverage count contradicts status");
    return { ...names, surface: v.text(c.surface), status, count, reason: v.nullable(c.reason), handoff: followUp(c.handoff), synthetic: c.synthetic === undefined ? false : v.flag(c.synthetic) };
  }, row=>`${row.hostname}/${row.repository}/${row.surface}`);
  const groups = unique(row.groups, value => {
    const g = v.record(value,["id", "source_repository", "source_path", "occurrence_ids", "evidence"]), source_repository=v.text(g.source_repository), source_path=v.text(g.source_path);
    if (!selected.repositories.includes(source_repository) || source_path.startsWith("/") || source_path.includes("\\") || source_path.split("/").some(p=>!p||p==="."||p==="..")) throw Error("canonical source outside scope");
    return { id:v.text(g.id), source_repository, source_path, occurrence_ids:v.strings(g.occurrence_ids), evidence:v.text(g.evidence) };
  }, row=>row.id);
  const ids = new Set(observations.map(o=>o.id));
  if (decisions.some(d=>!ids.has(d.id)) || evidence.some(e=>!ids.has(e.occurrence_id))) throw Error("decision/evidence has no observed occurrence");
  const evaluated_at=v.timestamp(row.evaluated_at), collected_at=v.timestamp(row.collected_at);
  if (Date.parse(collected_at)>Date.parse(evaluated_at) || observations.some(o=>Date.parse(o.observed_at)>Date.parse(evaluated_at))) throw Error("future security observation");
  return { schema_version:1, run_id:runID(row.run_id), ...identity, source_commit:v.commit(row.source_commit), evaluated_at, collected_at, collection_revision:v.integer(row.collection_revision,1), inventory_digest:v.hash(row.inventory_digest), scope:selected, policy:policy(row.policy),
    policy_assessment:assessment?{reviewer:v.text(assessment.reviewer),reference:v.text(assessment.reference),assessed_at:v.timestamp(assessment.assessed_at)}:null, coverage, observations, evidence, decisions, groups,
    history_gaps:row.history_gaps===undefined?[]:v.strings(row.history_gaps),history_provenance:row.history_provenance===undefined?[]:v.strings(row.history_provenance) };
}

/** Approval covers the exact decision, including exception validity or successor scope. */
export function decisionAuthorityBinding(value:SecurityInput,id:string):string {
  const input=parseSecurityInput(value),decision=input.decisions.find(d=>d.id===id),o=input.observations.find(o=>o.id===id);
  if(!decision||!o)throw Error("authority decision has no occurrence");
  return digest(canonicalJSON({context:evidenceBinding(input.source_commit,input.policy,input.scope,o.target),decision,policy_assessment:input.policy_assessment}));
}

const routes: Record<Decision["change"],string> = { "compatible-bot":"bot-batch", "compatible-authored":"bounded-maintenance", major:"feature", behavior:"feature", unknown:"investigation", posture:"consumer-policy", audit:"audit-reference", exception:"consumer-policy" };
function tracked(f: FollowUp | null): boolean { return !!f && !!(f.owner || f.assignment_handoff); }
function matching(input: SecurityInput, occurrence: Occurrence, kind: Evidence["kind"], result: string, at = occurrence.target): Evidence[] {
  const binding=kind==="authority"&&result==="approved"?decisionAuthorityBinding(input,occurrence.id):evidenceBinding(input.source_commit,input.policy,input.scope,at);
  const accountingProof=kind==="tracking"||kind==="ownership";
  return input.evidence.filter(e=>e.occurrence_id===occurrence.id && e.kind===kind && e.result===result && e.complete && !e.synthetic && !occurrence.synthetic && (occurrence.complete||accountingProof) &&
    (at.reference !== null||accountingProof) && canonicalJSON(e.target)===canonicalJSON(at) && e.binding===binding && Date.parse(e.observed_at)>=Date.parse(occurrence.observed_at) && Date.parse(e.observed_at)<=Date.parse(input.evaluated_at));
}
function corrected(input:SecurityInput, o:Occurrence, at=o.target):boolean {
  return [matching(input,o,"source","corrected",at),matching(input,o,"check","pass",at),matching(input,o,"scan","absent",at)].every(rows=>rows.length>0);
}
export function reconcileSecurity(value: unknown): SecuritySnapshot {
  const input=parseSecurityInput(value), gaps:string[]=[...(input.history_gaps??[])], grouped=new Map<string,RemediationGroup>();
  const policyValid=!!input.policy.length && !!input.policy_assessment && Date.parse(input.policy_assessment.assessed_at)<=Date.parse(input.evaluated_at);
  if (!policyValid) gaps.push("consumer policy assessment pending");
  for (const group of input.groups) {
    const members=group.occurrence_ids.map(id=>input.observations.find(o=>o.id===id));
    const first=members[0];
    if (!first || members.some(o=>!o) || !matching(input,first,"ownership","equivalent").some(e=>e.id===group.evidence)) throw Error("group ownership evidence missing");
    if (members.some(o=>!o || !o.package || o.package!==first.package || !o.ecosystem || o.ecosystem!==first.ecosystem || !o.advisory_ids.some(id=>first.advisory_ids.includes(id)))) throw Error("group equivalence not established");
    for (const id of group.occurrence_ids) { if (grouped.has(id)) throw Error("occurrence belongs to conflicting groups"); grouped.set(id,group); }
  }
  for (const repo of input.scope.repositories) for (const surface of ["dependabot","code_scanning"]) {
    // A caller may deliberately supply a scanner-only or narrowed surface scope. Filters are explicit.
    if (input.scope.filters.length && !input.scope.filters.includes(surface)) continue;
    if (!input.coverage.some(c=>c.repository===repo && c.surface===surface)) gaps.push(`missing coverage: ${repo}/${surface}`);
  }
  for (const c of input.coverage) if (c.status==="incomplete" && !tracked(c.handoff)) gaps.push(`coverage handoff pending: ${c.repository}/${c.surface}`);
  for (const c of input.coverage) if (c.status==="complete" && c.count!==input.observations.filter(o=>o.repository===c.repository && o.surface===c.surface && o.provider_state==="open" && (o.observed_at===input.collected_at||o.surface.startsWith("scanner/")&&o.complete)).length) gaps.push(`coverage observation mismatch: ${c.repository}/${c.surface}`);
  const findings:FindingState[]=input.observations.map(o=>{
    const d=input.decisions.find(d=>d.id===o.id), group=grouped.get(o.id), reasons:string[]=[];
    let remediation:FindingState["remediation"]=o.provider_state==="open"?"open":"unknown";
    if(d?.outcome==="unknown") remediation="unknown";
    let lifecycle:FindingState["target_lifecycle"]="active", exception:Decision["exception"]=null;
    if (d?.outcome==="fixed") { remediation=policyValid && corrected(input,o)?"fixed-verified":"unknown"; if(remediation==="unknown") reasons.push("target fix verification pending"); }
    if (d?.outcome==="exception") {
      const ex=d.exception, validExpiry=ex && (ex.expires_at===null || Date.parse(ex.expires_at)>Date.parse(input.evaluated_at));
      if (policyValid && ex && validExpiry && matching(input,o,"authority","approved").length) exception=ex;
      else reasons.push("consumer exception authority, validity or evidence pending");
    }
    if (d?.outcome==="retired") {
      lifecycle="superseded-pending";
      if (o.target.kind!=="image" || !d.successor || d.successor.kind!=="image" || d.successor.reference===o.target.reference) reasons.push("immutable successor binding pending");
      else if (policyValid && corrected(input,o,d.successor) && matching(input,o,"authority","approved").length && matching(input,o,"retirement","inactive").length) lifecycle="retired-verified";
      if (o.reactivated) {lifecycle="active"; reasons.push("target reactivated; retirement invalidated");}
    }
    const follow=d?.follow_up??null, hasTracking=tracked(follow) && matching(input,o,"tracking","accessible").length>0;
    const resolved=remediation==="fixed-verified" || exception!==null || lifecycle==="retired-verified";
    const accounted=!!d && policyValid && (resolved || hasTracking);
    if (!accounted) reasons.push("verified outcome or concrete tracked next action required");
    const delivery_pending=!!d?.delivery_required && !d.delivery_evidence.some(id=>matching(input,o,"delivery","observed").some(e=>e.id===id));
    return { occurrence:o, route:d?routes[d.change]:null, selected:false, group:group?.id??null, canonical_source:group?{repository:group.source_repository,path:group.source_path}:null,
      remediation, target_lifecycle:lifecycle, exception, follow_up:follow, accounted, delivery_pending, reasons };
  });
  const coverage_state=input.coverage.some(c=>c.status==="incomplete"||c.synthetic)||gaps.some(g=>g.startsWith("missing coverage")||g.startsWith("coverage observation mismatch"))?"incomplete":input.coverage.some(c=>c.status==="complete-unavailable")?"documented-unavailable":"complete";
  const open_remediation_count=findings.filter(f=>f.target_lifecycle!=="retired-verified" && f.remediation!=="fixed-verified" && !f.exception).length;
  const exception_count=findings.filter(f=>f.exception).length, pending_delivery_count=findings.filter(f=>f.delivery_pending).length;
  const accounting_state=gaps.length===0 && findings.every(f=>f.accounted)?"reconciled":"pending";
  const result:Omit<SecuritySnapshot,"digest">={ schema_version:1, kind:"maintenance-security-v1", input, input_digest:digest(canonicalJSON(input)), accounting_state, coverage_state,
    open_remediation_count, exception_count, pending_delivery_count, group_count:new Set(findings.map(f=>f.group??f.occurrence.id)).size,
    retired_count:findings.filter(f=>f.target_lifecycle==="retired-verified").length,
    all_clear:accounting_state==="reconciled" && coverage_state==="complete" && open_remediation_count===0 && exception_count===0 && pending_delivery_count===0 && !findings.some(f=>f.occurrence.synthetic), findings, gaps };
  return {...result,digest:digest(canonicalJSON(result))};
}

/** Recompute outcomes instead of trusting a caller's reconciled/fixed/status booleans. */
export function validateSecuritySnapshot(value:unknown):SecuritySnapshot {
  const row=v.record(value), expected=reconcileSecurity(row.input);
  if (canonicalJSON(value)!==canonicalJSON(expected)) throw Error("security snapshot changed or falsely reconciled");
  return expected;
}
