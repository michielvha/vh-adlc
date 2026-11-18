import type { Canonical, CapturedPage, Controls } from "./types";
import { resolveLink } from "./url";

export type MetaControl = { name: string; content: string };
const parameterized = new Set(["max-snippet", "max-image-preview", "max-video-preview", "unavailable_after"]);
const known = new Set(["all", "index", "follow", "none", "noindex", "nofollow", "nosnippet", "noimageindex", "notranslate", "indexifembedded"]);

/** Split only outside HTTP quoted strings and URI brackets, retaining quoted commas. */
function split(value: string, separator: string): string[] {
  const parts: string[] = []; let start = 0; let quote = false; let bracket = false; let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (escaped) { escaped = false; continue; }
    if (quote && c === "\\") { escaped = true; continue; }
    if (c === '"') quote = !quote;
    else if (!quote && c === "<") bracket = true;
    else if (!quote && c === ">") bracket = false;
    else if (!quote && !bracket && c === separator) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  if (quote || bracket) throw new Error("Unterminated HTTP Link value");
  parts.push(value.slice(start)); return parts;
}
const validReference = (value: string): boolean => /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/.test(value) && !/%(?![a-f\d]{2})/i.test(value);
function linkCanonicals(value: string, finalUrl: string): Canonical[] {
  const result: Canonical[] = [];
  for (const item of split(value, ",")) {
    const match = /^\s*<([^<>\r\n]*)>(.*)$/s.exec(item);
    if (!match) throw new Error("Malformed HTTP Link value");
    const target = match[1]; const tail = match[2];
    if (target === undefined || tail === undefined) throw new Error("Malformed HTTP Link value");
    if (!validReference(target)) throw new Error("Malformed HTTP Link URI reference");
    let canonical = false; let relationSeen = false; let context: string | null = null;
    const parts = split(tail, ";");
    if (parts.shift()?.trim()) throw new Error("Missing HTTP Link parameter separator");
    for (const part of parts) {
      const parameter = /^[\t ]*([!#$%&'*+.^_`|~\w-]+)[\t ]*(?:=[\t ]*("(?:[^"\\\r\n]|\\[^\r\n])*"|[!#$%&'*+.^_`|~\w-]+))?[\t ]*$/.exec(part);
      if (!parameter) throw new Error("Malformed HTTP Link parameter");
      if (parameter[1]?.toLowerCase() === "anchor") {
        if (context !== null || parameter[2] === undefined) throw new Error("Invalid HTTP Link anchor context");
        const reference = parameter[2].replace(/^"|"$/g, "").replace(/\\(.)/g, "$1");
        if (!validReference(reference)) throw new Error("Malformed HTTP Link anchor reference");
        context = new URL(reference, finalUrl).href;
      }
      if (parameter[1]?.toLowerCase() === "rel") {
        if (parameter[2] === undefined) throw new Error("HTTP Link relation is missing its value");
        // RFC 8288: subsequent rel parameters in one link-value are ignored.
        if (relationSeen) continue;
        relationSeen = true;
        const rel = parameter[2]?.replace(/^"|"$/g, "").replace(/\\(.)/g, "$1");
        canonical ||= rel?.toLowerCase().split(/\s+/).includes("canonical") ?? false;
      }
    }
    if (canonical && (context === null || context === new URL(finalUrl).href)) result.push({ source: "header", raw: item.trim(), target: resolveLink(target, finalUrl).target });
  }
  return result;
}
export function controls(page: CapturedPage, meta: MetaControl[], htmlCanonicals: (string | null)[], base: string): Controls {
  const result: Controls = { generic_tokens: [], generic_blocked: false, sources: [], canonical_sources: [], canonical_state: "absent", canonical: null, issues: [] };
  let unknown = false;
  const tokens = new Set<string>();
  const add = (raw: string, scope: string | null) => {
    for (const segment of raw.split(",")) {
      const token = segment.trim().toLowerCase(); if (!token) continue;
      const colon = token.indexOf(":"); const key = colon < 0 ? token : token.slice(0, colon).trim();
      if (scope !== null) continue;
      if (parameterized.has(key)) { if (colon < 0 || !token.slice(colon + 1).trim()) unknown = true; continue; }
      if (!known.has(token)) { unknown = true; continue; }
      if (token === "none") { tokens.add("noindex"); tokens.add("nofollow"); } else tokens.add(token);
    }
  };
  for (const item of meta) {
    const scope = item.name.toLowerCase() === "robots" ? null : item.name.toLowerCase();
    result.sources.push({ source: "html", scope, raw: item.content }); add(item.content, scope);
  }
  for (const [name, values] of Object.entries(page.headers)) {
    if (name.toLowerCase() === "x-robots-tag") for (const raw of values) {
      let scope: string | null = null;
      for (const segment of raw.split(",")) {
        const token = segment.trim(); const prefix = /^([\w-]+)\s*:\s*(.*)$/s.exec(token);
        if (prefix?.[1] && !parameterized.has(prefix[1].toLowerCase())) {
          scope = prefix[1].toLowerCase(); const rest = prefix[2] ?? "";
          result.sources.push({ source: "header", scope, raw: token }); add(rest, scope);
        } else { result.sources.push({ source: "header", scope, raw: token }); add(token, scope); }
      }
    }
    if (name.toLowerCase() === "link") for (const raw of values) {
      try { result.canonical_sources.push(...linkCanonicals(raw, page.final_url)); }
      catch { result.canonical_sources.push({ source: "header", raw, target: null }); result.issues.push({ rule: "canonical_syntax", detail: "Malformed HTTP Link canonical evidence" }); }
    }
  }
  for (const raw of htmlCanonicals) {
    result.canonical_sources.push({ source: "html", raw: raw ?? "", target: raw === null ? null : resolveLink(raw, base).target });
    if (raw === null) result.issues.push({ rule: "canonical_syntax", detail: "HTML canonical element has no href attribute" });
  }
  result.generic_tokens = [...tokens].sort();
  result.generic_blocked = tokens.has("noindex") ? true : unknown ? null : false;
  if (unknown) result.issues.push({ rule: "robots_syntax", detail: "Unverified generic page-control syntax" });
  const targets = new Set(result.canonical_sources.map(s => s.target));
  if (targets.size === 1 && !targets.has(null)) { result.canonical_state = "valid"; result.canonical = [...targets][0] ?? null; }
  else if (targets.size) { result.canonical_state = "unavailable"; result.issues.push({ rule: "canonical_conflict", detail: "Canonical annotations disagree or cannot be resolved" }); }
  return result;
}
