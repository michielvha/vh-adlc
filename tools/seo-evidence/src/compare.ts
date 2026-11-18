import { stable } from "./bundle";
import { coverage } from "./coverage";
import { finding, sortFindings } from "./finding";
import { reconcile } from "./graph";
import { parseSnapshot } from "./schema";
import { TOOL_VERSION, type Analysis, type Evidence, type Finding, type Observation } from "./types";
import { identity } from "./url";

const key = (o: Observation) => `${o.page.mode}\n${identity(o.page.requested_url)}`;
export function compare(baseline: unknown, current: unknown): Analysis {
  const checked = (value: unknown) => { try { return parseSnapshot(value); } catch (error: unknown) { throw new Error("Incompatible snapshot input: " + (error instanceof Error ? error.message : "validation failed")); } };
  const a = checked(baseline); const b = checked(current);
  if (a.schema_version !== b.schema_version || a.extraction_version !== b.extraction_version || stable(a.extraction) !== stable(b.extraction) || stable([...a.origins].sort()) !== stable([...b.origins].sort())) throw new Error("Incompatible snapshot extraction or origin scope");
  const old = new Map(a.observations.map(o => [key(o), o])); const next = new Map(b.observations.map(o => [key(o), o])); const findings: Finding[] = [];
  const conflicts = (s: typeof a) => new Set(reconcile(s.observations).filter(n => n.conflicting).map(n => `${n.mode}\n${n.url}`));
  const ca = conflicts(a); const cb = conflicts(b);
  for (const k of [...new Set([...old.keys(), ...next.keys()])].sort()) {
    const before = old.get(k); const after = next.get(k); const o = after ?? before; if (!o) continue;
    const p = o.page; const evidence: Evidence[] = [before?.evidence, after?.evidence].filter((e): e is Evidence => e !== null && e !== undefined);
    const add = (rule: string, detail: string, values: unknown) => findings.push(finding(rule, identity(p.requested_url), p.mode, detail, evidence, values));
    if (!before || !after) { add(before ? "page_missing" : "page_added", "Observation inventory changed; absence is not a captured HTTP error", { old: before?.page ?? null, new: after?.page ?? null }); continue; }
    const op = before.page; const np = after.page;
    if (op.outcome !== "captured" || np.outcome !== "captured") { add("comparison_unavailable", "Missing captured response evidence", { old: op.outcome, new: np.outcome }); continue; }
    if (identity(op.final_url) !== identity(np.final_url)) add("final_url_changed", "Recorded final response URL changed", { old: op.final_url, new: np.final_url });
    if (ca.has(`${op.mode}\n${identity(op.final_url)}`) || cb.has(`${np.mode}\n${identity(np.final_url)}`)) { add("comparison_unavailable", "Final-document observations conflict", { old: op.final_url, new: np.final_url }); continue; }
    if (op.status !== np.status) add("status_changed", "Captured HTTP status changed", { old: op.status, new: np.status });
    if (op.status >= 200 && op.status < 300 && np.status >= 400 && np.status <= 599) add("http_regression", "Captured successful response became an observed HTTP error", { old: op.status, new: np.status });
    const of = before.facts; const nf = after.facts;
    if (!of || !nf || op.status < 200 || op.status >= 300 || np.status < 200 || np.status >= 300) continue;
    for (const [field, x, y, removed] of [["title", of.titles, nf.titles, "title_removed"], ["description", of.descriptions, nf.descriptions, null], ["h1", of.h1, nf.h1, "h1_removed"]] as const) {
      if (stable(x) !== stable(y)) add(`${field}_changed`, `Observed ${field} values changed`, { old: x, new: y });
      if (removed && x.some(Boolean) && !y.some(Boolean)) add(removed, `Previously nonempty ${field} content is absent`, { old: x, new: y });
    }
    const oc = of.controls; const nc = nf.controls;
    if (stable(oc.generic_tokens) !== stable(nc.generic_tokens)) add("robots_changed", "Observed generic control tokens changed; provider indexation is unverified", { old: oc.generic_tokens, new: nc.generic_tokens });
    if (oc.generic_blocked === false && nc.generic_blocked === true) add("noindex_added", "Observed generic index-blocking changed from false to true", { old: false, new: true });
    else if (oc.generic_blocked === null || nc.generic_blocked === null) add("comparison_unavailable", "Generic page-control syntax is unverified", { field: "generic_controls", old: oc.generic_blocked, new: nc.generic_blocked });
    if (stable(oc.canonical_sources) !== stable(nc.canonical_sources)) add("canonical_annotations_changed", "Canonical source annotations changed", { old: oc.canonical_sources, new: nc.canonical_sources });
    if (oc.canonical_state === "unavailable" || nc.canonical_state === "unavailable") add("comparison_unavailable", "Canonical evidence is ambiguous", { field: "canonical", old: oc.canonical_state, new: nc.canonical_state });
    else if (oc.canonical_state === "valid" && nc.canonical_state === "absent") add("canonical_removed", "Previously observed single canonical is now absent", { old: oc.canonical, new: null });
    else if (oc.canonical_state === "valid" && nc.canonical_state === "valid" && oc.canonical !== nc.canonical) add("canonical_changed", "Observed single canonical target changed", { old: oc.canonical, new: nc.canonical });
    if (stable(of.jsonld) !== stable(nf.jsonld)) add("jsonld_changed", "JSON-LD observation changed; rich-result eligibility is unverified", { old: of.jsonld, new: nf.jsonld });
  }
  const sorted = sortFindings(findings); const partial = [...a.partial_reasons.map(r => "baseline:" + r), ...b.partial_reasons.map(r => "current:" + r)].sort();
  return { schema_version: 1, tool_version: TOOL_VERSION, extraction_version: b.extraction_version, operation: "compare", input_digests: [a.input_digest, b.input_digest], captured_at: [a.captured_at, b.captured_at], origins: b.origins, extraction: b.extraction, analysis_status: a.analysis_status === "partial" || b.analysis_status === "partial" ? "partial" : "complete", partial_reasons: partial, findings: sorted, coverage: coverage(b, sorted), details: { baseline_coverage: coverage(a, sorted), matching: "requested URL and capture mode; final changes explicit" } };
}
