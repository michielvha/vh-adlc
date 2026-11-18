import { loadBundle } from "./bundle";
import { extract } from "./extract";
import { EXTRACTION_VERSION, TOOL_VERSION, type Snapshot } from "./types";
import { identity } from "./url";
import { reconcile } from "./graph";

export async function snapshot(input: string): Promise<Snapshot> {
  const { bundle, bodies, inputDigest } = await loadBundle(input);
  const selector = bundle.extraction?.main_selector ?? "main";
  const observations = bundle.pages.map(page => {
    if (page.outcome !== "captured") return { page, evidence: null, facts: null };
    const manifest = bundle.files.find(f => f.path === page.body_file);
    if (!manifest) throw new Error("Missing body manifest");
    const body = bodies.get(page.body_file);
    const html = page.content_type.split(";")[0]?.trim().toLowerCase() === "text/html";
    return { page, evidence: { path: manifest.path, sha256: manifest.sha256 }, facts: !html || body === undefined ? null : extract(body, page, selector) };
  });
  const partial = bundle.pages.filter(p => p.outcome !== "captured").map(p => `${p.mode}:${p.requested_url}:${p.outcome}`);
  partial.push(...reconcile(observations).filter(n => n.conflicting).map(n => `${n.mode}:${n.url}:final_conflict`));
  return { schema_version: 1, tool_version: TOOL_VERSION, extraction_version: EXTRACTION_VERSION, captured_at: bundle.captured_at,
    origins: [...bundle.origins].sort(), entry_urls: bundle.entry_urls.map(identity).sort(), sitemap_urls: (bundle.sitemap_urls ?? []).map(identity).sort(),
    groups: Object.fromEntries(Object.entries(bundle.groups ?? {}).map(([k, v]) => [k, v.map(identity).sort()])),
    extraction: { main_selector: selector }, input_digest: inputDigest, observations, analysis_status: partial.length ? "partial" : "complete", partial_reasons: partial.sort() };
}
