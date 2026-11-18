import { load } from "cheerio";
import { digest, stable } from "./bundle";
import { controls, type MetaControl } from "./controls";
import { documentBase, resolveLink } from "./url";
import type { CapturedPage, Facts } from "./types";

export const whitespace = (value: string): string => value.replace(/\s+/gu, " ").trim();
export function extract(html: string, page: CapturedPage, selector = "main"): Facts {
  const $ = load(html);
  const main = $(selector); const root = main.length === 1 ? main.first() : null;
  const base = documentBase(page.final_url, $("base[href]").first().attr("href"));
  const meta: MetaControl[] = [];
  $("meta[name]").each((_, el) => {
    const name = $(el).attr("name") ?? ""; const content = $(el).attr("content") ?? "";
    if (name.toLowerCase() === "robots" || /bot|slurp/i.test(name) || /\b(noindex|nofollow|none|nosnippet)\b/i.test(content)) meta.push({ name, content });
  });
  const canonical = $("head link[rel]").filter((_, el) => ($(el).attr("rel") ?? "").toLowerCase().split(/\s+/).includes("canonical")).toArray().map(el => $(el).attr("href") ?? null);
  const anchors = $("a[href]").map((index, el) => {
    const href = $(el).attr("href") ?? "";
    return { href, ...resolveLink(href, base), index, main: root !== null && $(el).closest(selector).is(root) };
  }).get();
  let mainHash: string | null = null;
  let mainReason: string | null = root ? null : main.length ? "multiple_roots" : "missing_root";
  if (root) {
    const copy = root.clone(); copy.find("script,style,template").remove();
    const text = whitespace(copy.text());
    if (text) mainHash = digest(text); else mainReason = "empty_content";
  }
  let valid = true; const hashes: string[] = [];
  const jsonld = $("script[type]").filter((_, el) => ($(el).attr("type") ?? "").trim().toLowerCase() === "application/ld+json");
  jsonld.each((_, el) => { const raw = $(el).text(); try { hashes.push(digest(stable(JSON.parse(raw) as unknown))); } catch { valid = false; hashes.push(digest(raw)); } });
  return {
    titles: $("title").map((_, el) => whitespace($(el).text())).get(),
    descriptions: $("meta[name]").filter((_, el) => ($(el).attr("name") ?? "").toLowerCase() === "description").map((_, el) => whitespace($(el).attr("content") ?? "")).get(),
    h1: $("h1").map((_, el) => whitespace($(el).text())).get(),
    language: $("html").attr("lang")?.trim().toLowerCase() || null, base_url: base,
    ids: $("[id]").map((_, el) => $(el).attr("id") ?? "").get(),
    named_anchors: $("a[name]").map((_, el) => $(el).attr("name") ?? "").get(),
    anchors, controls: controls(page, meta, canonical, base), main_hash: mainHash, main_reason: mainReason,
    jsonld: { count: jsonld.length, valid, hashes: hashes.sort() },
  };
}
