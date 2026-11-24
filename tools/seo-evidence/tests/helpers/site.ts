import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, capturedAt, origin, sha } from "./bundle";
import { snapshot } from "../../src/snapshot";
import type { Mode } from "../../src/types";

export type SitePage = { path: string; html?: string; status?: number; mode?: Mode; final?: string; redirects?: { from: string; to: string; status: number }[]; headers?: Record<string, string[]>; outcome?: "failed" | "not_collected" };
export async function site(pages: SitePage[], options: { roots?: string[]; groups?: Record<string, string[]>; sitemap?: string[]; selector?: string } = {}) {
  const f = await fixture();
  const files: { path: string; sha256: string }[] = [];
  const observations = [];
  for (const [i, p] of pages.entries()) {
    const common = { requested_url: origin + p.path, mode: p.mode ?? "initial", observed_at: capturedAt };
    if (p.outcome) { observations.push({ ...common, outcome: p.outcome, reason: "test coverage gap" }); continue; }
    const file = `page-${i}.html`; const html = p.html ?? `<html lang="en"><head><title>${p.path}</title></head><body><main><h1>${p.path}</h1></main></body></html>`;
    await writeFile(join(f.dir, file), html); files.push({ path: file, sha256: sha(html) });
    observations.push({ ...common, outcome: "captured", final_url: origin + (p.final ?? p.path), status: p.status ?? 200, content_type: "text/html", headers: p.headers ?? {}, body_file: file, ...(p.redirects ? { redirects: p.redirects } : {}) });
  }
  Object.assign(f.data, { pages: observations, files, entry_urls: (options.roots ?? [pages[0]?.path ?? "/"]).map(p => origin + p) });
  if (options.groups) f.data.groups = Object.fromEntries(Object.entries(options.groups).map(([k, v]) => [k, v.map(p => origin + p)]));
  if (options.sitemap) f.data.sitemap_urls = options.sitemap.map(p => origin + p);
  if (options.selector) f.data.extraction = { main_selector: options.selector };
  await f.save(); return { ...f, snapshot: await snapshot(f.input) };
}
