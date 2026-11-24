import { constants } from "node:fs";
import { lstat, open, realpath, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import { BundleSchema, type Bundle } from "./types";

export const digest = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
export const stable = (value: unknown): string => {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
  return JSON.stringify(canonical(value), null, 2) + "\n";
};
export function parseYaml(text: string): unknown {
  const doc = parseDocument(text, { uniqueKeys: true, schema: "core" });
  if (doc.errors.length) throw new Error(doc.errors.map(e => e.message).join("; "));
  return doc.toJS({ maxAliasCount: 0 });
}
export function validateBudget(sizes: number[], pageCount: number): void {
  if (pageCount > 10_000 || sizes.some(n => n > 5 * 1024 ** 2) || sizes.reduce((a, b) => a + b, 0) > 250 * 1024 ** 2) throw new Error("Input limit exceeded");
}
export async function safeFile(root: string, path: string): Promise<string> {
  if (isAbsolute(path) || path.includes("\\") || path.split("/").some(p => !p || p === "." || p === "..")) throw new Error("Invalid relative evidence path");
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error("Symlink evidence is not allowed");
  }
  const result = await realpath(current);
  if (!result.startsWith(root + sep) || !(await lstat(result)).isFile()) throw new Error("Evidence is not a contained ordinary file");
  return result;
}
function validateMetadata(bundle: Bundle): void {
  const origins = new Set(bundle.origins);
  if (origins.size !== bundle.origins.length || bundle.origins.some(v => { try { return new URL(v).origin !== v || !["http:", "https:"].includes(new URL(v).protocol); } catch { return true; } })) throw new Error("Invalid origin scope");
  const scoped = (v: string) => { if (!origins.has(new URL(v).origin)) throw new Error("URL outside declared origins"); };
  const seen = new Set<string>();
  for (const page of bundle.pages) {
    scoped(page.requested_url);
    const key = `${new URL(page.requested_url).href}\n${page.mode}`;
    if (seen.has(key)) throw new Error("Duplicate requested URL/mode observation"); seen.add(key);
    if (page.outcome !== "captured") continue;
    scoped(page.final_url);
    const headers = Object.entries(page.headers);
    const lower = headers.map(([k]) => k.toLowerCase());
    if (new Set(lower).size !== lower.length || lower.some(k => !["content-type", "x-robots-tag", "link", "location"].includes(k))) throw new Error("Unsupported or duplicate response header");
    const contentType = headers.find(([k]) => k.toLowerCase() === "content-type")?.[1];
    if (contentType?.some(v => v.toLowerCase().trim() !== page.content_type.toLowerCase().trim())) throw new Error("Content-Type metadata disagrees");
    if (/charset\s*=\s*["']?(?!utf-8\b|utf8\b)[\w-]+/i.test(page.content_type) && /html/i.test(page.content_type)) throw new Error("Unsupported HTML charset");
    if (page.redirects?.length) {
      let from = new URL(page.requested_url).href;
      for (const hop of page.redirects) { scoped(hop.from); scoped(hop.to); if (new URL(hop.from).href !== from) throw new Error("Inconsistent redirect chain"); from = new URL(hop.to).href; }
      if (from !== new URL(page.final_url).href) throw new Error("Redirect chain final URL disagrees");
    }
  }
  for (const u of [...bundle.entry_urls, ...(bundle.sitemap_urls ?? []), ...Object.values(bundle.groups ?? {}).flat()]) scoped(u);
}
export async function loadBundle(input: string): Promise<{ bundle: Bundle; bodies: Map<string, string>; inputDigest: string }> {
  if ((await lstat(input)).isSymbolicLink()) throw new Error("Bundle must not be a symlink");
  const root = await realpath(dirname(resolve(input)));
  const text = await readFile(input, "utf8");
  const bundle = BundleSchema.parse(parseYaml(text));
  validateMetadata(bundle);
  const paths = new Set(bundle.files.map(f => f.path));
  if (paths.size !== bundle.files.length) throw new Error("Duplicate manifest path");
  for (const p of bundle.pages) if (p.outcome === "captured" && !paths.has(p.body_file)) throw new Error("Body file not listed in manifest");
  const files = await Promise.all(bundle.files.map(async f => ({ ...f, full: await safeFile(root, f.path) })));
  validateBudget(await Promise.all(files.map(async f => (await lstat(f.full)).size)), bundle.pages.length);
  const bodies = new Map<string, string>();
  for (const f of files) {
    const handle = await open(f.full, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!(await handle.stat()).isFile()) throw new Error("Evidence is not an ordinary file");
      const bytes = await handle.readFile();
      if (digest(bytes) !== f.sha256) throw new Error(`Manifest hash mismatch: ${f.path}`);
      const html = bundle.pages.some(p => p.outcome === "captured" && p.body_file === f.path && p.content_type.split(";")[0]?.trim().toLowerCase() === "text/html");
      if (html) bodies.set(f.path, new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } finally { await handle.close(); }
  }
  return { bundle, bodies, inputDigest: digest(text) };
}
