import { z } from "zod";
import { PageSchema, type Facts, type Snapshot } from "./types";
import { reconcile } from "./graph";
import { identity } from "./url";

const evidence = z.strictObject({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const facts: z.ZodType<Facts> = z.strictObject({
  titles: z.array(z.string()), descriptions: z.array(z.string()), h1: z.array(z.string()), language: z.string().nullable(), base_url: z.string(),
  ids: z.array(z.string()), named_anchors: z.array(z.string()), anchors: z.array(z.strictObject({ href: z.string(), target: z.url().nullable(), fragment: z.string().nullable(), main: z.boolean(), index: z.number().int().nonnegative() })),
  main_hash: z.string().regex(/^[a-f0-9]{64}$/).nullable(), main_reason: z.string().nullable(),
  jsonld: z.strictObject({ count: z.number().int().nonnegative(), valid: z.boolean(), hashes: z.array(z.string()) }),
  controls: z.strictObject({ generic_tokens: z.array(z.string()), generic_blocked: z.boolean().nullable(), sources: z.array(z.strictObject({ source: z.enum(["html", "header"]), scope: z.string().nullable(), raw: z.string() })), canonical_sources: z.array(z.strictObject({ source: z.enum(["html", "header"]), raw: z.string(), target: z.url().nullable() })), canonical_state: z.enum(["valid", "absent", "unavailable"]), canonical: z.url().nullable(), issues: z.array(z.strictObject({ rule: z.string(), detail: z.string() })) }),
});
export const SnapshotSchema: z.ZodType<Snapshot> = z.strictObject({
  schema_version: z.literal(1), tool_version: z.string(), extraction_version: z.literal("1"), captured_at: z.iso.datetime({ offset: true }),
  origins: z.array(z.string()).min(1), entry_urls: z.array(z.url()), sitemap_urls: z.array(z.url()), groups: z.record(z.string(), z.array(z.url())),
  extraction: z.strictObject({ main_selector: z.string().min(1) }), input_digest: z.string().regex(/^[a-f0-9]{64}$/),
  observations: z.array(z.strictObject({ page: PageSchema, evidence: evidence.nullable(), facts: facts.nullable() })).min(1).max(10_000),
  analysis_status: z.enum(["complete", "partial"]), partial_reasons: z.array(z.string()),
});
export function parseSnapshot(input: unknown): Snapshot {
  const parsed = SnapshotSchema.safeParse(input);
  if (!parsed.success) throw new Error("Incompatible or invalid snapshot: " + parsed.error.message);
  const s = parsed.data; const keys = new Set<string>();
  for (const origin of s.origins) if (new URL(origin).origin !== origin || !["http:", "https:"].includes(new URL(origin).protocol)) throw new Error("Invalid snapshot origin");
  for (const o of s.observations) {
    const p = o.page; const k = `${p.mode}\n${identity(p.requested_url)}`;
    if (keys.has(k)) throw new Error("Duplicate snapshot observation"); keys.add(k);
    if (!s.origins.includes(new URL(p.requested_url).origin) || (p.outcome === "captured" && !s.origins.includes(new URL(p.final_url).origin))) throw new Error("Snapshot page outside declared scope");
    if (p.outcome === "captured" && (!o.evidence || o.evidence.path !== p.body_file)) throw new Error("Missing snapshot evidence");
    if (p.outcome !== "captured" && (o.evidence !== null || o.facts !== null)) throw new Error("Absent capture cannot supply facts");
    if (p.outcome === "captured" && p.content_type.split(";")[0]?.trim().toLowerCase() === "text/html" && o.facts === null) throw new Error("Captured HTML facts are missing");
    if (p.outcome === "captured" && p.content_type.split(";")[0]?.trim().toLowerCase() !== "text/html" && o.facts !== null) throw new Error("Non-HTML response cannot supply HTML facts");
  }
  const reasons = s.observations.filter(o => o.page.outcome !== "captured").map(o => `${o.page.mode}:${o.page.requested_url}:${o.page.outcome}`);
  reasons.push(...reconcile(s.observations).filter(n => n.conflicting).map(n => `${n.mode}:${n.url}:final_conflict`));
  reasons.sort();
  if ((s.analysis_status === "partial") !== (reasons.length > 0) || JSON.stringify([...s.partial_reasons].sort()) !== JSON.stringify(reasons)) throw new Error("Snapshot capture status or partial reasons are inconsistent");
  return s;
}
