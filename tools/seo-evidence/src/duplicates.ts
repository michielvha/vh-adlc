import { stable } from "./bundle";
import { finding, sortFindings } from "./finding";
import { nodeEvidence, type GraphNode } from "./graph";
import type { Finding, Snapshot } from "./types";

export function duplicates(snapshot: Snapshot, nodes: GraphNode[]): Finding[] {
  const groups = new Map<string, { rule: string; value: string; language: string | null; nodes: GraphNode[] }>();
  const findings: Finding[] = [];
  for (const node of nodes) {
    const o = node.observation;
    if (!o?.facts || o.page.outcome !== "captured" || o.page.status < 200 || o.page.status >= 300 || node.conflicting) continue;
    const f = o.facts;
    for (const [rule, values] of [["duplicate_title", f.titles], ["duplicate_description", f.descriptions], ["duplicate_main", f.main_hash ? [f.main_hash] : []]] as const) {
      for (const value of new Set(values.filter(Boolean))) {
        const k = stable({ rule, value, mode: node.mode, language: f.language, selector: snapshot.extraction.main_selector, version: snapshot.extraction_version });
        const group = groups.get(k) ?? { rule, value, language: f.language, nodes: [] }; group.nodes.push(node); groups.set(k, group);
      }
    }
    if (f.main_reason) findings.push(finding("main_unavailable", node.url, node.mode, "Main-content comparison unavailable", nodeEvidence(node), { reason: f.main_reason, selector: snapshot.extraction.main_selector }));
    if (f.titles.length > 1) findings.push(finding("multiple_titles", node.url, node.mode, "Multiple title observations; no title silently selected", nodeEvidence(node), f.titles));
    for (const issue of f.controls.issues) findings.push(finding(issue.rule, node.url, node.mode, issue.detail, nodeEvidence(node), f.controls));
    if (!f.jsonld.valid) findings.push(finding("jsonld_syntax", node.url, node.mode, "Captured JSON-LD contains invalid JSON; rich-result eligibility is unverified", nodeEvidence(node), f.jsonld));
  }
  for (const group of groups.values()) {
    if (group.nodes.length < 2) continue;
    const sorted = group.nodes.sort((a, b) => a.url.localeCompare(b.url)); const first = sorted[0]; if (!first) continue;
    findings.push(finding(group.rule, first.url, first.mode, "Exact duplicate observed values; intended variants and consolidation require review", sorted.flatMap(nodeEvidence), { value: group.value, language: group.language, urls: sorted.map(n => n.url), members: sorted.map(n => ({ url: n.url, canonical: n.observation?.facts?.controls.canonical ?? null, canonical_state: n.observation?.facts?.controls.canonical_state ?? "unavailable" })) }));
  }
  return sortFindings(findings);
}
