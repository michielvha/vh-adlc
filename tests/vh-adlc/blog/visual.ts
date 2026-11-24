// Shared parsers and article checks for the visual reading scenarios in run.ts.
// The fixtures declare two treatment markups, which these checks recognize:
//   image with caption: <figure> ... <img src="..." alt="..."> ... <figcaption>...</figcaption> ... </figure>
//   pull quote:         <blockquote class="pull-quote"> <p>quote</p> <cite>author</cite> </blockquote>
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const LABELS = [
  "no body treatment",
  "unbroken prose",
  "invalid exception",
  "irrelevant image",
  "filler image",
  "illustration as ui",
  "illegible image",
  "missing alt text",
  "missing caption",
  "unsupported visual",
  "inexact quote",
  "unattributed quote",
  "repeated quote",
  "unverified image",
  "unverified render",
  "other",
] as const;

export type Entry = { label: string; text: string };
export type Split = { ok: true; entries: Entry[] } | { ok: false; reason: string };

const fold = (text: string) => text.replace(/\s+/g, " ").trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const labelPattern = LABELS.map(escape).join("|");

/** The text after `Presentation repairs:` on its line in an editor message, or null. */
export function repairsLine(message: string): string | null {
  const line = message.split("\n").find((l) => /^\s*(?:[-*]\s+)?[`*]*Presentation repairs:/i.test(l));
  return line === undefined ? null : line.replace(/^\s*(?:[-*]\s+)?[`*]*Presentation repairs:[`*]*/i, "").trim();
}

/** The Design's splitter: labelled entries, or invalid when an entry starts without a label. */
export function splitRepairs(value: string): Split {
  const text = fold(value.replace(/[`*]/g, ""));
  if (/^none\.?$/i.test(text)) return { ok: true, entries: [] };
  if (!text) return { ok: false, reason: "empty Presentation repairs line" };
  const starts = new RegExp(`^(${labelPattern}):`, "i");
  if (!starts.test(text)) return { ok: false, reason: `entry without a label: ${text.slice(0, 60)}` };
  const parts = text.split(new RegExp(`; (?=(?:${labelPattern}):)`, "i"));
  const entries: Entry[] = [];
  for (const part of parts) {
    const match = part.trim().match(starts);
    if (!match) return { ok: false, reason: `entry without a label: ${part.slice(0, 60)}` };
    entries.push({ label: match[1].toLowerCase(), text: part.trim().replace(/\.$/, "") });
  }
  return { ok: true, entries };
}

export type Fixed = { ok: true; value: string } | { ok: false; reason: string };

/** Finds exactly one `<name>: value` line at a line start, after an optional `- ` or `* ` marker. */
export function fixedLine(handoff: string, name: string): Fixed {
  const pattern = new RegExp(`^(?:[-*] )?${escape(name)}:(.*)$`);
  const found = handoff.split("\n").map((l) => l.replace(/\r$/, "").match(pattern)).filter((m) => m !== null);
  if (found.length !== 1) return { ok: false, reason: `${found.length} ${name} lines` };
  return { ok: true, value: found[0][1].trim() };
}

export function noVisualCategory(value: string): "short-read" | "format" | "owner-request" | null {
  const match = value.match(/^(short-read|format|owner-request): \S/);
  return match ? (match[1] as "short-read" | "format" | "owner-request") : null;
}

export type Rendered =
  | { kind: "unverified"; reason: string }
  | { kind: "entries"; entries: { viewport: string; theme: string; result: string }[] }
  | { kind: "invalid" };

export function parseRenderedChecks(value: string): Rendered {
  const text = value.trim();
  if (/^unverified, \S/.test(text)) return { kind: "unverified", reason: text.slice("unverified, ".length) };
  if (!text) return { kind: "invalid" };
  const entries = [];
  for (const part of text.split(";").map((p) => p.trim())) {
    const match = part.match(/^(desktop|phone) (\S+): (\S.*)$/);
    if (!match) return { kind: "invalid" };
    entries.push({ viewport: match[1], theme: match[2], result: match[3] });
  }
  return { kind: "entries", entries };
}

/** True when every `<viewport> <theme>` pair has an entry whose result does not start with `unverified`. */
export function coversPairs(parsed: Rendered, pairs: string[]): boolean {
  if (parsed.kind !== "entries") return false;
  return pairs.every((pair) => parsed.entries.some((e) => `${e.viewport} ${e.theme}` === pair && !/^unverified/i.test(e.result)));
}

// ---- Article structure ----

export type Block = { kind: "frontmatter" | "heading" | "code" | "figure" | "quote" | "directive" | "prose" | "blank" | "other"; lines: string[] };

const FIGURE_OPEN = /^\s*<figure\b/i;
const FIGURE_CLOSE = /<\/figure>/i;
const QUOTE_OPEN = /^\s*<blockquote\b[^>]*class="[^"]*\bpull-quote\b/i;
const QUOTE_CLOSE = /<\/blockquote>/i;

/** Splits an article into blocks; body prose is paragraph and list text outside every other block. */
export function blocks(article: string): Block[] {
  const lines = article.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      out.push({ kind: "frontmatter", lines: lines.slice(0, end + 1) });
      i = end + 1;
    }
  }
  const take = (kind: Block["kind"], close: (line: string, index: number) => boolean) => {
    const start = i;
    while (i < lines.length && !close(lines[i], i - start)) i++;
    out.push({ kind, lines: lines.slice(start, Math.min(i + 1, lines.length)) });
    i++;
  };
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) take("code", (l, n) => n > 0 && l.trim().startsWith(fence[1]));
    else if (FIGURE_OPEN.test(line)) take("figure", (l) => FIGURE_CLOSE.test(l));
    else if (QUOTE_OPEN.test(line)) take("quote", (l) => QUOTE_CLOSE.test(l));
    else if (/^#{1,6}\s/.test(line)) { out.push({ kind: "heading", lines: [line] }); i++; }
    else if (/^:::/.test(line)) { out.push({ kind: "directive", lines: [line] }); i++; }
    else if (!line.trim()) { out.push({ kind: "blank", lines: [line] }); i++; }
    else if (/^\s*</.test(line) || /^\s*!\[/.test(line) || /^\s*>/.test(line)) { out.push({ kind: "other", lines: [line] }); i++; }
    else { out.push({ kind: "prose", lines: [line] }); i++; }
  }
  return out;
}

export const bodyProse = (article: string) => blocks(article).filter((b) => b.kind === "prose").flatMap((b) => b.lines).join("\n");
export const bodyWords = (article: string) => bodyProse(article).split(/\s+/).filter(Boolean).length;

/** True when some treatment block has a body paragraph before it and one after it. */
export function hasBodyTreatment(article: string): boolean {
  const kinds = blocks(article).map((b) => b.kind);
  return kinds.some((k, n) => (k === "figure" || k === "quote") && kinds.slice(0, n).includes("prose") && kinds.slice(n + 1).includes("prose"));
}

export const treatments = (article: string) => blocks(article).filter((b) => b.kind === "figure" || b.kind === "quote").map((b) => b.lines.join("\n"));

/** The article with declared treatment blocks removed and blank-line runs folded to one. */
export function withoutTreatments(article: string): string {
  return blocks(article).filter((b) => b.kind !== "figure" && b.kind !== "quote").flatMap((b) => b.lines).join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n");
}

/** The skeleton from the AC-04 row: headings by level, `:::` lines verbatim, prose runs as one line. */
export function skeleton(article: string): string {
  const out: string[] = [];
  const all = blocks(article).filter((b) => b.kind !== "frontmatter");
  for (let n = 0; n < all.length; n++) {
    const b = all[n];
    if (b.kind === "heading") out.push(`<heading ${b.lines[0].match(/^#+/)?.[0].length}>`);
    else if (b.kind === "prose") {
      if (out.at(-1) !== "<prose>") {
        // A blank line between two prose lines belongs to the same run.
        while (out.at(-1) === "" && out.at(-2) === "<prose>") out.pop();
        if (out.at(-1) !== "<prose>") out.push("<prose>");
      }
    } else out.push(...b.lines);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
}

// ---- Images ----

const TOKEN = /[^\s"'()<>,]+\.(png|jpe?g|gif|webp|avif|svg)(?=[?#\s"'()<>,]|$)/gi;

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
const attrValue = (tag: string, name: string) => {
  const m = attr(tag, name);
  return m ? (m[2] ?? m[3] ?? "") : null;
};

/** Every source in declared image markup, with srcset split and descriptors dropped. */
export function declaredSources(article: string): string[] {
  const sources: string[] = [];
  for (const figure of blocks(article).filter((b) => b.kind === "figure")) {
    for (const tag of figure.lines.join("\n").match(/<(img|source)\b[^>]*>/gi) ?? []) {
      const src = attrValue(tag, "src");
      if (src !== null) sources.push(src);
      const srcset = attrValue(tag, "srcset");
      if (srcset) for (const candidate of srcset.split(",")) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url) sources.push(url);
      }
    }
  }
  return sources;
}

const strip = (token: string) => token.replace(/[?#].*$/, "");

/** The article's image tokens: declared sources plus every image-like path anywhere in it. */
export function imageTokens(article: string): string[] {
  return [...declaredSources(article), ...(article.match(TOKEN) ?? [])].map(strip);
}

/** Resolves a token to a file path, or null when it is remote or protocol-relative. */
export function resolveToken(token: string, articlePath: string, publicRoot: string): string | null {
  if (/^(https?:)?\/\//i.test(token) || /^data:/i.test(token)) return null;
  if (token.startsWith("/")) return join(publicRoot, token);
  return resolve(dirname(articlePath), token);
}

export const resolvesToFile = (token: string, articlePath: string, publicRoot: string) => {
  const path = resolveToken(token, articlePath, publicRoot);
  return path !== null && existsSync(path) ? path : null;
};

/** Markup outside declared image markup that shows an image: Markdown images, image elements or tokens. */
export function strayImages(article: string): string[] {
  const outside = blocks(article).filter((b) => b.kind !== "figure").flatMap((b) => b.lines).join("\n");
  const found: string[] = [];
  for (const line of outside.split("\n")) if (/!\[[^\n]*\]/.test(line)) found.push(line.trim());
  found.push(...(outside.match(/<(img|picture|source|image|object|embed|iframe)\b/gi) ?? []));
  found.push(...(outside.match(TOKEN) ?? []));
  return found;
}

/** Drawing markup from the AC-03 row. */
export function drawingMarkup(article: string): string[] {
  const found: string[] = [];
  found.push(...(article.match(/data:image\//gi) ?? []));
  found.push(...(article.match(/<(svg|canvas)\b/gi) ?? []));
  found.push(...(article.match(/<[a-z][^>]*\bclass\s*=\s*("[^"]*mermaid[^"]*"|'[^']*mermaid[^']*')/gi) ?? []));
  for (const line of article.split("\n")) {
    const info = line.match(/^\s*(?:```+|~~~+)\s*([^\s`{]+)/);
    if (info && ["mermaid", "plantuml", "puml", "dot", "graphviz", "d2"].includes(info[1].toLowerCase())) found.push(line.trim());
  }
  return found;
}

export type Figure = { sources: string[]; alt: string | null; caption: string | null };

export function figures(article: string): Figure[] {
  return blocks(article).filter((b) => b.kind === "figure").map((b) => {
    const text = b.lines.join("\n");
    const img = text.match(/<img\b[^>]*>/i)?.[0] ?? "";
    const caption = text.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1];
    return { sources: declaredSources(text), alt: attrValue(img, "alt"), caption: caption === undefined ? null : fold(caption.replace(/<[^>]+>/g, "")) };
  });
}

// ---- Quotes ----

export type Quote = { text: string; cite: string };

export function pullQuotes(article: string): Quote[] {
  return blocks(article).filter((b) => b.kind === "quote").map((b) => {
    const text = b.lines.join("\n");
    const cite = text.match(/<cite\b[^>]*>([\s\S]*?)<\/cite>/i)?.[1] ?? "";
    const body = text.replace(/<cite\b[\s\S]*?<\/cite>/i, "").replace(/<[^>]+>/g, " ");
    return { text: fold(body).replace(/^["“]|["”]$/g, ""), cite: fold(cite.replace(/<[^>]+>/g, "")) };
  });
}

/** Pull quotes the run added: those whose text the original article did not already hold as a pull quote. */
export function addedQuotes(before: string, after: string): Quote[] {
  const old = new Set(pullQuotes(before).map((q) => q.text));
  return pullQuotes(after).filter((q) => !old.has(q.text));
}

/** True when the quote appears word for word in one of the sources, whitespace folded. */
export const quoteFrom = (quote: Quote, sources: string[]) => sources.some((s) => fold(s).includes(quote.text));

/** Quote-like markup outside declared pull-quote markup, counted as the AC-03 row describes. */
export function undeclaredQuotes(article: string): number {
  const outside = blocks(article).filter((b) => b.kind !== "quote").flatMap((b) => b.lines);
  let count = outside.filter((l) => /^\s*>/.test(l)).length;
  const text = outside.join("\n");
  count += (text.match(/<blockquote\b/gi) ?? []).length + (text.match(/<q[\s>]/gi) ?? []).length + (text.match(/<aside\b/gi) ?? []).length;
  return count;
}
