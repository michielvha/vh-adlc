import { coverage } from "./coverage";
import { duplicates } from "./duplicates";
import { sortFindings } from "./finding";
import { analyzeGraph } from "./graph";
import { TOOL_VERSION, type Analysis, type Snapshot } from "./types";

export function inspect(snapshot: Snapshot): Analysis {
  const graph = analyzeGraph(snapshot);
  const findings = sortFindings([...graph.findings, ...duplicates(snapshot, graph.nodes)]);
  return { schema_version: 1, tool_version: TOOL_VERSION, extraction_version: snapshot.extraction_version, operation: "inspect", input_digests: [snapshot.input_digest], captured_at: [snapshot.captured_at], origins: snapshot.origins, extraction: snapshot.extraction, analysis_status: snapshot.analysis_status, partial_reasons: snapshot.partial_reasons, findings, coverage: coverage(snapshot, findings), details: { scope: "observed corpus only", entry_urls: snapshot.entry_urls, sitemap_urls: snapshot.sitemap_urls, nodes: graph.nodes.map(n => ({ url: n.url, mode: n.mode, incoming: n.incoming, depth: n.depth, path: n.path, conflicting: n.conflicting, evidence: n.observations.map(o => o.evidence) })), edges: graph.edges, links: graph.links } };
}
