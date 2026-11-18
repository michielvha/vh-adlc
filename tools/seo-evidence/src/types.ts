import { z } from "zod";

export const TOOL_VERSION = "0.1.0";
export const EXTRACTION_VERSION = "1";
const url = z.string().refine(v => { try { const u = new URL(v); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password && !u.hash; } catch { return false; } }, "Expected an HTTP(S) URL without credentials or fragment");
const timestamp = z.iso.datetime({ offset: true });
const common = { requested_url: url, mode: z.enum(["initial", "rendered"]), observed_at: timestamp };
const hop = z.strictObject({ from: url, to: url, status: z.number().int().min(300).max(399) });
const captured = z.strictObject({ ...common, outcome: z.literal("captured"), final_url: url, status: z.number().int().min(100).max(599), content_type: z.string().min(1), headers: z.record(z.string(), z.array(z.string())), body_file: z.string().min(1), redirects: z.array(hop).optional() });
const absent = (outcome: "failed" | "not_collected") => z.strictObject({ ...common, outcome: z.literal(outcome), reason: z.string().min(1) });
export const PageSchema = z.discriminatedUnion("outcome", [captured, absent("failed"), absent("not_collected")]);
export const BundleSchema = z.strictObject({
  schema_version: z.literal(1), captured_at: timestamp,
  origins: z.array(z.string()).min(1), entry_urls: z.array(url).min(1),
  pages: z.array(PageSchema).min(1).max(10_000),
  files: z.array(z.strictObject({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) })).max(10_000),
  sitemap_urls: z.array(url).optional(), groups: z.record(z.string().min(1), z.array(url)).optional(),
  extraction: z.strictObject({ main_selector: z.string().min(1) }).optional(),
});
export type Bundle = z.infer<typeof BundleSchema>;
export type Page = z.infer<typeof PageSchema>;
export type CapturedPage = Extract<Page, { outcome: "captured" }>;
export type Mode = Page["mode"];
export type AnalysisStatus = "complete" | "partial";
export type Evidence = { path: string; sha256: string };
export type Canonical = { raw: string; source: "html" | "header"; target: string | null };
export type Controls = {
  generic_tokens: string[]; generic_blocked: boolean | null;
  sources: { source: "html" | "header"; scope: string | null; raw: string }[];
  canonical_sources: Canonical[]; canonical_state: "valid" | "absent" | "unavailable"; canonical: string | null;
  issues: { rule: string; detail: string }[];
};
export type Anchor = { href: string; target: string | null; fragment: string | null; main: boolean; index: number };
export type Facts = {
  titles: string[]; descriptions: string[]; h1: string[]; language: string | null; base_url: string;
  ids: string[]; named_anchors: string[]; anchors: Anchor[]; controls: Controls;
  main_hash: string | null; main_reason: string | null;
  jsonld: { count: number; valid: boolean; hashes: string[] };
};
export type Observation = { page: Page; evidence: Evidence | null; facts: Facts | null };
export type Snapshot = {
  schema_version: 1; tool_version: string; extraction_version: string; captured_at: string;
  origins: string[]; entry_urls: string[]; sitemap_urls: string[]; groups: Record<string, string[]>;
  extraction: { main_selector: string }; input_digest: string; observations: Observation[];
  analysis_status: AnalysisStatus; partial_reasons: string[];
};
export type Finding = {
  id: string; rule: string; url: string; mode: Mode; detail: string;
  evidence: Evidence[]; values: unknown;
};
