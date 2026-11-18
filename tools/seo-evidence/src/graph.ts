import { stable } from "./bundle";
import { finding, sortFindings } from "./finding";
import type { Evidence, Finding, Mode, Observation, Snapshot } from "./types";
import { identity, resolveFragment } from "./url";

export type Edge = { from: string; to: string; mode: Mode; kind: "anchor" | "redirect" | "final_transition"; weight: 0 | 1; hop_count: number | null; evidence: Evidence[]; anchor_index: number | null };
export type GraphNode = { url: string; mode: Mode; observations: Observation[]; observation: Observation | null; conflicting: boolean; incoming: number; depth: number | null; path: Edge[] | null };
export type LinkCheck = { from: string; mode: Mode; href: string; target: string | null; resolved_url: string | null; status: "captured-success" | "captured-HTTP-error" | "redirect-recorded" | "out-of-scope" | "conflicting" | "unobserved"; fragment_status: "valid" | "missing" | "unverified" | "not_applicable"; anchor_index: number };
const key = (url: string, mode: Mode) => `${mode}\n${url}`;
function signature(o: Observation): string {
  const p = o.page;
  if (p.outcome !== "captured") throw new Error("Expected captured observation");
  return stable({ status: p.status, media_type: p.content_type.trim().toLowerCase(), headers: Object.fromEntries(Object.entries(p.headers).map(([k, v]) => [k.toLowerCase(), v])), body_hash: o.evidence?.sha256 });
}
export function reconcile(observations: Observation[]): GraphNode[] {
  const groups = new Map<string, GraphNode>();
  for (const observation of observations) {
    if (observation.page.outcome !== "captured") continue;
    const url = identity(observation.page.final_url); const mode = observation.page.mode; const k = key(url, mode);
    let node = groups.get(k);
    if (!node) { node = { url, mode, observations: [], observation: null, conflicting: false, incoming: 0, depth: null, path: null }; groups.set(k, node); }
    node.observations.push(observation);
  }
  for (const node of groups.values()) {
    node.observations.sort((a, b) => a.page.requested_url.localeCompare(b.page.requested_url));
    node.conflicting = new Set(node.observations.map(signature)).size > 1;
    node.observation = node.conflicting ? null : node.observations[0] ?? null;
  }
  return [...groups.values()].sort((a, b) => a.url.localeCompare(b.url) || a.mode.localeCompare(b.mode));
}
export const nodeEvidence = (node: GraphNode): Evidence[] => node.observations.flatMap(o => o.evidence ? [o.evidence] : []);
export function analyzeGraph(snapshot: Snapshot): { nodes: GraphNode[]; edges: Edge[]; links: LinkCheck[]; findings: Finding[] } {
  const nodes = reconcile(snapshot.observations); const byKey = new Map(nodes.map(n => [key(n.url, n.mode), n]));
  const edges: Edge[] = []; const findings: Finding[] = []; const links: LinkCheck[] = [];
  for (const o of snapshot.observations) {
    const p = o.page; if (p.outcome !== "captured") continue;
    const evidence = o.evidence ? [o.evidence] : [];
    if (p.redirects?.length) for (const hop of p.redirects) edges.push({ from: identity(hop.from), to: identity(hop.to), mode: p.mode, kind: "redirect", weight: 0, hop_count: 1, evidence, anchor_index: null });
    else if (identity(p.requested_url) !== identity(p.final_url)) edges.push({ from: identity(p.requested_url), to: identity(p.final_url), mode: p.mode, kind: "final_transition", weight: 0, hop_count: null, evidence, anchor_index: null });
  }
  for (const node of nodes) {
    if (node.conflicting) { findings.push(finding("final_conflict", node.url, node.mode, "Conflicting captured observations; final-document facts remain unverified", nodeEvidence(node), node.observations.map(o => o.page.requested_url))); continue; }
    const o = node.observation;
    if (!o?.facts || o.page.outcome !== "captured" || o.page.status < 200 || o.page.status >= 300) continue;
    for (const a of o.facts.anchors) if (a.target && snapshot.origins.includes(new URL(a.target).origin)) edges.push({ from: node.url, to: a.target, mode: node.mode, kind: "anchor", weight: 1, hop_count: null, evidence: nodeEvidence(node), anchor_index: a.index });
  }
  const adjacency = new Map<string, Edge[]>();
  for (const e of edges) { const k = key(e.from, e.mode); const group = adjacency.get(k) ?? []; group.push(e); adjacency.set(k, group); }
  for (const mode of ["initial", "rendered"] as const) {
    const distances = new Map<string, number>(); const paths = new Map<string, Edge[]>(); const queue: string[] = [];
    for (const root of snapshot.entry_urls) { distances.set(root, 0); paths.set(root, []); queue.push(root); }
    for (let i = 0; i < queue.length; i++) {
      const url = queue[i]; if (url === undefined) continue;
      const d = distances.get(url); if (d === undefined) continue;
      for (const e of adjacency.get(key(url, mode)) ?? []) {
        const next = d + e.weight;
        if (next < (distances.get(e.to) ?? Infinity)) { distances.set(e.to, next); paths.set(e.to, [...(paths.get(url) ?? []), e]); queue.push(e.to); }
      }
    }
    for (const n of nodes.filter(n => n.mode === mode)) { n.depth = distances.get(n.url) ?? null; n.path = paths.get(n.url) ?? null; }
  }
  const transitions = (url: string, mode: Mode): { node: GraphNode | null; redirected: boolean } => {
    const seen = new Set<string>(); let current = url; let redirected = false;
    while (!seen.has(current)) {
      seen.add(current);
      const node = byKey.get(key(current, mode));
      if (node) return { node, redirected };
      const targets = new Set((adjacency.get(key(current, mode)) ?? []).filter(e => e.weight === 0).map(e => e.to));
      if (targets.size !== 1) return { node: null, redirected: redirected || targets.size > 0 };
      const target = [...targets][0]; if (!target) break;
      current = target; redirected = true;
    }
    return { node: null, redirected };
  };
  const incomingByNode = new Map<string, Set<string>>();
  for (const e of edges) if (e.from !== e.to) { const k = key(e.to, e.mode); const sources = incomingByNode.get(k) ?? new Set<string>(); sources.add(e.from); incomingByNode.set(k, sources); }
  for (const n of nodes) {
    n.incoming = incomingByNode.get(key(n.url, n.mode))?.size ?? 0;
    if (n.conflicting || !n.observation?.facts || n.observation.page.outcome !== "captured" || n.observation.page.status < 200 || n.observation.page.status >= 300) continue;
    if (!snapshot.entry_urls.includes(n.url) && n.incoming === 0) findings.push(finding("zero_incoming", n.url, n.mode, "No incoming discovery observed within this corpus", nodeEvidence(n)));
    if (n.depth === null) findings.push(finding("unreachable", n.url, n.mode, "No path from supplied roots in the observed graph; whole-site orphan status is unknown", nodeEvidence(n)));
    for (const a of n.observation.facts.anchors) {
      let status: LinkCheck["status"] = "unobserved"; let fragment: LinkCheck["fragment_status"] = a.fragment === null ? "not_applicable" : "unverified";
      let resolved: GraphNode | null = null;
      if (!a.target || !snapshot.origins.includes(new URL(a.target).origin)) status = "out-of-scope";
      else {
        const endpoint = transitions(a.target, n.mode); resolved = endpoint.node;
        if (resolved?.conflicting) status = "conflicting";
        else if (resolved?.observation?.page.outcome === "captured") {
          const p = resolved.observation.page;
          status = p.status >= 400 ? "captured-HTTP-error" : p.status >= 200 && p.status < 300 ? endpoint.redirected ? "redirect-recorded" : "captured-success" : "redirect-recorded";
          if (a.fragment !== null && p.status >= 200 && p.status < 300 && resolved.observation.facts) fragment = resolveFragment(resolved.observation.facts, a.fragment);
        } else if (endpoint.redirected) status = "redirect-recorded";
      }
      const link: LinkCheck = { from: n.url, mode: n.mode, href: a.href, target: a.target, resolved_url: resolved?.url ?? null, status, fragment_status: fragment, anchor_index: a.index }; links.push(link);
      const evidence = [...nodeEvidence(n), ...(resolved ? nodeEvidence(resolved) : [])];
      if (status === "captured-HTTP-error") findings.push(finding("broken_link", n.url, n.mode, "Link resolves to an observed HTTP error", evidence, link));
      if (fragment === "missing") findings.push(finding("broken_fragment", n.url, n.mode, "Fragment target absent from captured successful HTML", evidence, link));
    }
  }
  return { nodes, edges: edges.sort((a, b) => a.mode.localeCompare(b.mode) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind)), links, findings: sortFindings(findings) };
}
