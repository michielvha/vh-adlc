// Shared parsers and article checks for the visual reading scenarios in run.ts.
// The fixtures declare two treatment markups, which these checks recognize:
//   image with caption: <figure> ... <img src="..." alt="..."> ... <figcaption>...</figcaption> ... </figure>
//   pull quote:         <blockquote class="pull-quote"> <p>quote</p> <cite>author</cite> </blockquote>
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
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
  // Lines keep any trailing \r, so a changed line ending changes the compared text.
  const lines = article.split("\n");
  const bare = (l: string) => l.replace(/\r$/, "");
  const out: Block[] = [];
  let i = 0;
  if (bare(lines[0] ?? "") === "---") {
    const end = lines.findIndex((l, n) => n > 0 && bare(l) === "---");
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
/** Words of body prose; list markers such as `-`, `*` and `1.` are formatting, not words. */
export const bodyWords = (article: string) =>
  bodyProse(article).split("\n").map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")).join(" ").split(/\s+/).filter(Boolean).length;

/** True when some treatment block has a body paragraph before it and one after it. */
export function hasBodyTreatment(article: string): boolean {
  const kinds = blocks(article).map((b) => b.kind);
  return kinds.some((k, n) => (k === "figure" || k === "quote") && kinds.slice(0, n).includes("prose") && kinds.slice(n + 1).includes("prose"));
}

export const treatments = (article: string) => blocks(article).filter((b) => b.kind === "figure" || b.kind === "quote").map((b) => b.lines.join("\n"));

/** The article with declared treatment blocks removed and runs of blank lines between blocks folded to one; code blocks stay verbatim. */
export function withoutTreatments(article: string): string {
  const out: string[] = [];
  for (const b of blocks(article)) {
    if (b.kind === "figure" || b.kind === "quote") continue;
    if (b.kind === "blank") { if (out.length && out.at(-1)?.trim() === "") continue; out.push(""); continue; }
    out.push(...b.lines);
  }
  while (out.length && out.at(-1) === "") out.pop();
  return `${out.join("\n")}\n`;
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

/** The regular file inside the public root a token resolves to, or null. */
export const resolvesToFile = (token: string, articlePath: string, publicRoot: string) => {
  const path = resolveToken(token, articlePath, publicRoot);
  if (path === null || !existsSync(path) || !statSync(path).isFile()) return null;
  const root = realpathSync(publicRoot), file = realpathSync(path);
  return file === root || file.startsWith(`${root}/`) ? path : null;
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

/** Pull quotes the run added or changed: those whose text and attribution the original did not hold together. */
export function addedQuotes(before: string, after: string): Quote[] {
  const old = new Set(pullQuotes(before).map((q) => `${q.text}\u0000${q.cite}`));
  return pullQuotes(after).filter((q) => !old.has(`${q.text}\u0000${q.cite}`));
}

/** True when the quote appears word for word, on word boundaries, in one of the sources, whitespace folded. */
export const quoteFrom = (quote: Quote, sources: string[]) =>
  quote.text.length > 0 && sources.some((s) => new RegExp(`(?<![\\w])${escape(quote.text)}(?![\\w])`).test(fold(s)));

/** Quote-like markup outside declared pull-quote markup, counted as the AC-03 row describes. */
export function undeclaredQuotes(article: string): number {
  const outside = blocks(article).filter((b) => b.kind !== "quote").flatMap((b) => b.lines);
  let count = outside.filter((l) => /^\s*>/.test(l)).length;
  const text = outside.join("\n");
  count += (text.match(/<blockquote\b/gi) ?? []).length + (text.match(/<q[\s>]/gi) ?? []).length + (text.match(/<aside\b/gi) ?? []).length;
  return count;
}

// ---- Native rollouts (AC-07 row) ----
// Codex writes one JSONL rollout per thread under the profile's sessions directory. A child
// names its parent in session_meta.source.subagent.thread_spawn.parent_thread_id, as
// tests/vh-adlc/lifecycle/native-review.ts reads it. Tool calls carry their turn in
// internal_chat_message_metadata_passthrough.turn_id.


// Rollout rows are external JSON with many shapes; `any` stays at this one boundary and each use narrows it.
type Row = { type?: string; payload?: any };
export type Rollout = { path: string; rows: Row[]; id: string; parent: string | null; cwd: string; turns: Set<string>; final: string; finishedAt: string };

function jsonl(path: string): Row[] {
  return readFileSync(path, "utf8").split("\n").flatMap((line) => {
    try { return [JSON.parse(line) as Row]; } catch { return []; }
  });
}

function walk(dir: string, depth = 0): string[] {
  if (!existsSync(dir) || depth > 6) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), depth + 1) : e.isFile() && e.name.endsWith(".jsonl") ? [join(dir, e.name)] : []);
}

export function loadRollouts(sessions: string): Rollout[] {
  return walk(sessions).map((path) => {
    const rows = jsonl(path);
    const meta = rows.find((r) => r.type === "session_meta")?.payload ?? {};
    const parent = meta.source?.subagent?.thread_spawn?.parent_thread_id;
    const turns = new Set<string>(rows.filter((r) => r.type === "event_msg" && ["task_started", "task_complete"].includes(r.payload?.type)).map((r) => String(r.payload.turn_id)));
    const done = (rows as (Row & { timestamp?: string })[]).filter((r) => r.type === "event_msg" && r.payload?.type === "task_complete").at(-1);
    const final = done?.payload?.last_agent_message ?? "";
    return { path, rows, id: String(meta.id ?? ""), parent: typeof parent === "string" ? parent : null, cwd: String(meta.cwd ?? ""), turns, final: String(final), finishedAt: String(done?.timestamp ?? "") };
  });
}

/** The parent rollout and every rollout linked to it as a child, each child keeping only its own turns. */
export function linkedRollouts(all: Rollout[], parentThread: string): { parent: Rollout | null; children: Rollout[] } {
  const parent = all.find((r) => r.id === parentThread && r.parent === null) ?? null;
  const children = all.filter((r) => r.parent === parentThread && r.id !== parentThread).map((child) => {
    const own = new Set([...child.turns].filter((t) => !parent?.turns.has(t)));
    return { ...child, turns: own };
  });
  return { parent, children };
}

const turnOf = (row: Row): string => String(row.payload?.internal_chat_message_metadata_passthrough?.turn_id ?? row.payload?.turn_id ?? "");

export type Call = { thread: string; turn: string; callId: string; name: string; kind: "function" | "exec" | "web"; text: string; args: Record<string, unknown>; output: unknown; cwd: string };

/** Every tool call in a rollout's own turns, with its output and the turn's working directory. */
export function calls(rollout: Rollout): Call[] {
  const cwdByTurn = new Map<string, string>();
  for (const r of rollout.rows) if (r.type === "turn_context" && r.payload?.turn_id) cwdByTurn.set(String(r.payload.turn_id), String(r.payload.cwd ?? rollout.cwd));
  const outputs = new Map<string, unknown>();
  for (const r of rollout.rows) {
    if (r.type === "response_item" && ["function_call_output", "custom_tool_call_output"].includes(r.payload?.type)) outputs.set(String(r.payload.call_id), r.payload.output);
  }
  const found: Call[] = [];
  for (const r of rollout.rows) {
    if (r.type !== "response_item") continue;
    const p = r.payload ?? {};
    const turn = turnOf(r);
    if (!rollout.turns.has(turn)) continue;
    const cwd = cwdByTurn.get(turn) ?? rollout.cwd;
    if (p.type === "function_call") {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(String(p.arguments ?? "{}")); } catch { /* unparsed arguments stay empty and the text is still scanned */ }
      found.push({ thread: rollout.id, turn, callId: String(p.call_id), name: String(p.name), kind: "function", text: String(p.arguments ?? ""), args, output: outputs.get(String(p.call_id)), cwd });
    } else if (p.type === "custom_tool_call") {
      found.push({ thread: rollout.id, turn, callId: String(p.call_id), name: String(p.name), kind: "exec", text: String(p.input ?? ""), args: {}, output: outputs.get(String(p.call_id)), cwd });
    } else if (p.type === "web_search_call") {
      found.push({ thread: rollout.id, turn, callId: String(p.id ?? ""), name: "web_search", kind: "web", text: JSON.stringify(p.action ?? {}), args: (p.action ?? {}) as Record<string, unknown>, output: undefined, cwd });
    }
  }
  return found;
}

/** Index of the parenthesis closing the one at `open`, skipping quoted text. */
function matching(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "'") { const end = text.indexOf("'", i + 1); i = end < 0 ? text.length : end; continue; }
    if (c === "(") depth++;
    if (c === ")" && --depth === 0) return i;
  }
  return text.length;
}

// Shell splitting: simple commands on &&, ||, ;, |, newlines and $( ... ); quotes respected.
export function simpleCommands(command: string): string[][] {
  const commands: string[][] = [];
  let words: string[] = [];
  let word = "";
  let quoted = false;
  const endWord = () => { if (word || quoted) words.push(word); word = ""; quoted = false; };
  const endCommand = () => { endWord(); if (words.length) commands.push(words); words = []; };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (c === "'") { const end = command.indexOf("'", i + 1); word += command.slice(i + 1, end < 0 ? undefined : end); quoted = true; i = end < 0 ? command.length : end; continue; }
    if (c === '"') {
      let j = i + 1;
      for (; j < command.length && command[j] !== '"'; j++) {
        if (command[j] === "\\" && j + 1 < command.length) { word += command[++j]; continue; }
        if (command[j] === "$" && command[j + 1] === "(") { const close = matching(command, j + 1); commands.push(...simpleCommands(command.slice(j + 2, close))); j = close; continue; }
        word += command[j];
      }
      quoted = true; i = j; continue;
    }
    if (c === "\\" && i + 1 < command.length) { word += command[++i]; continue; }
    if (c === "$" && command[i + 1] === "(") { const close = matching(command, i + 1); endCommand(); commands.push(...simpleCommands(command.slice(i + 2, close))); i = close; continue; }
    if (c === "`" || c === ")" || c === "(" || c === "\n" || c === ";") { endCommand(); continue; }
    if (c === "&" && command[i + 1] === "&") { endCommand(); i++; continue; }
    if (c === "|") { endCommand(); if (command[i + 1] === "|") i++; continue; }
    if (c === " " || c === "\t") { endWord(); continue; }
    word += c;
  }
  endCommand();
  return commands;
}

const REDIRECT = /^\d*(?:>>?|<<?<?|&>>?|>&|<&)(.*)$/;

/** The command name and the later words that are not redirections or their targets. */
export function commandWords(words: string[]): { name: string; args: string[] } {
  let n = 0;
  while (n < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[n])) n++;
  const name = words[n] ?? "";
  const args: string[] = [];
  for (let i = n + 1; i < words.length; i++) {
    const redirect = words[i].match(REDIRECT);
    if (redirect) { if (!redirect[1]) i++; continue; }
    args.push(words[i]);
  }
  return { name, args };
}

const real = (path: string) => { try { return realpathSync(path); } catch { return resolve(path); } };
const expand = (word: string) => word === "~" ? homedir() : word.startsWith("~/") ? join(homedir(), word.slice(2)) : word;

/** Shell brace expansion of one word, innermost first: `a/{b,c}` gives `a/b` and `a/c`. */
export function braces(word: string): string[] {
  const m = word.match(/^(.*?)\{([^{}]*,[^{}]*)\}(.*)$/);
  if (!m) return [word];
  return m[2].split(",").flatMap((part) => braces(`${m[1]}${part}${m[3]}`));
}

/** Later words of a shell command that resolve to an existing file or directory. */
export function shellReads(command: string, cwd: string): { paths: string[]; names: string[] } {
  const paths: string[] = [];
  const names: string[] = [];
  const vars = new Map<string, string>();
  const substitute = (word: string) => word.replace(/\$\{(\w+)\}|\$(\w+)/g, (all, a, b) => vars.get(a ?? b) ?? all);
  for (const words of simpleCommands(command)) {
    const { name, args } = commandWords(words);
    // A command made only of assignments sets shell variables that later words in this command text may use.
    if (!name) for (const w of words) { const m = w.match(/^([A-Za-z_]\w*)=(.*)$/); if (m) vars.set(m[1], substitute(m[2])); }
    if (name) names.push(name);
    for (const word of args.flatMap((w) => braces(substitute(w)))) {
      if (!word) continue;
      const path = resolve(cwd, expand(word));
      if (existsSync(path)) paths.push(real(path));
    }
  }
  return { paths, names };
}

const SHELL_CALLS = ["tools.exec_command", "tools.shell", "tools.shell_command", "tools.local_shell"];
const READ_CALLS = ["readFileSync", "readFile", "readdirSync", "readdir", "open", "tools.view_image", "tools.read_file"];

/** String literals passed to each named call in code-mode `exec` input. */
export function literalArguments(input: string, names: string[]): { name: string; literal: string }[] {
  const found: { name: string; literal: string }[] = [];
  // String constants the script declares, so template literals that use them can be read.
  const consts = new Map<string, string>();
  for (const m of input.matchAll(/\b(?:const|let|var)\s+(\w+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\$]|\\.)*)`)/g)) consts.set(m[1], m[2] ?? m[3] ?? m[4] ?? "");
  const pattern = new RegExp(`(?<![\\w.])(${names.map(escape).join("|")})\\s*\\(`, "g");
  for (const match of input.matchAll(pattern)) {
    let depth = 0;
    let i = match.index + match[0].length - 1;
    const start = i;
    for (; i < input.length; i++) {
      const c = input[i];
      if (c === '"' || c === "'" || c === "`") { const close = input.indexOf(c, i + 1); i = close < 0 ? input.length : close; continue; }
      if (c === "(") depth++;
      if (c === ")" && --depth === 0) break;
    }
    const body = input.slice(start, i + 1);
    for (const lit of body.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
      const rawText = lit[3] !== undefined ? lit[3].replace(/\$\{(\w+)\}/g, (all, n) => consts.get(n) ?? all) : lit[1] ?? lit[2] ?? "";
      let value = rawText;
      try { value = JSON.parse(`"${rawText.replace(/"/g, '\\"').replace(/\\'/g, "'")}"`); } catch { /* keep the raw literal */ }
      found.push({ name: match[1], literal: value });
    }
  }
  return found;
}

export type Analysis = {
  reads: { thread: string; turn: string; path: string }[];
  views: { thread: string; turn: string; path: string; carriesImage: boolean }[];
  mentions: { thread: string; turn: string; text: string; listingOnly: boolean }[];
  fetches: { thread: string; turn: string; what: string }[];
};

const carriesImage = (output: unknown) => JSON.stringify(output ?? "").includes('"input_image"');
const URL_PATTERN = /https?:\/\/[^\s"'`<>)\]]+/g;

/** Reads, image views, PNG mentions and network fetches in a set of rollouts. */
export function analyze(rollouts: Rollout[], opts: { png: string; allowedUrl: (url: string) => boolean }): Analysis {
  const result: Analysis = { reads: [], views: [], mentions: [], fetches: [] };
  const png = real(opts.png);
  const base = png.split("/").at(-1) ?? "";
  for (const rollout of rollouts) {
    for (const call of calls(rollout)) {
      const at = { thread: call.thread, turn: call.turn };
      const shellTexts: string[] = [];
      const readLiterals: string[] = [];
      if (call.kind === "function") {
        if (call.name === "exec_command" && typeof call.args.cmd === "string") shellTexts.push(call.args.cmd);
        if (call.name === "shell" && Array.isArray(call.args.command)) shellTexts.push((call.args.command as string[]).at(-1) ?? "");
        for (const key of ["path", "file_path"]) if (typeof call.args[key] === "string") readLiterals.push(call.args[key] as string);
        if (call.name === "view_image" && typeof call.args.path === "string") {
          result.views.push({ ...at, path: real(resolve(call.cwd, call.args.path as string)), carriesImage: carriesImage(call.output) });
        }
        if (call.name === "web_search" || call.name.startsWith("web")) result.fetches.push({ ...at, what: `web tool: ${call.text.slice(0, 200)}` });
      } else if (call.kind === "web") {
        const action = call.args as { type?: string; query?: string; url?: string };
        if (action.type === "search" || action.query) result.fetches.push({ ...at, what: `search: ${action.query ?? ""}` });
        else if (action.url && !opts.allowedUrl(action.url)) result.fetches.push({ ...at, what: `open: ${action.url}` });
      } else {
        for (const { literal } of literalArguments(call.text, SHELL_CALLS)) shellTexts.push(literal);
        for (const { name, literal } of literalArguments(call.text, READ_CALLS)) {
          readLiterals.push(literal);
          if (name === "tools.view_image" && /\bimage\s*\(/.test(call.text)) {
            result.views.push({ ...at, path: real(resolve(call.cwd, literal)), carriesImage: carriesImage(call.output) });
          }
        }
        if (/tools\.web__run\s*\(/.test(call.text)) {
          for (const { literal } of literalArguments(call.text, ["tools.web__run"])) {
            if (/^https?:\/\//.test(literal)) { if (!opts.allowedUrl(literal)) result.fetches.push({ ...at, what: `open: ${literal}` }); }
          }
          if (/search_query|\bquery\s*:/.test(call.text)) result.fetches.push({ ...at, what: "web__run search" });
        }
      }
      for (const text of shellTexts) {
        const { paths, names } = shellReads(text, call.cwd);
        for (const path of paths) result.reads.push({ ...at, path });
        for (const words of simpleCommands(text)) {
          const { name, args } = commandWords(words);
          if (name === "gh" || name.endsWith("/gh")) result.fetches.push({ ...at, what: `gh: ${text.slice(0, 120)}` });
          if ((name === "git" || name.endsWith("/git")) && args.some((a) => ["clone", "fetch", "pull", "ls-remote"].includes(a))) result.fetches.push({ ...at, what: `git: ${text.slice(0, 120)}` });
        }
        void names;
      }
      for (const literal of readLiterals) {
        const path = resolve(call.cwd, expand(literal));
        if (existsSync(path)) result.reads.push({ ...at, path: real(path) });
      }
      for (const url of call.text.match(URL_PATTERN) ?? []) if (!opts.allowedUrl(url) && call.kind !== "web") result.fetches.push({ ...at, what: `url: ${url}` });
      // A GitHub connector call is a fetch unless it reads the allowed docs repository at the pin.
      if (/mcp__\w*github/i.test(call.kind === "function" ? call.name : call.text)) {
        // Quoted values only: a shorthand property such as `{ref, path}` takes its value from a quoted `const ref = "..."`.
        const repos = [...call.text.matchAll(/repository_full_name"?\s*[:=]\s*["'`]([\w.-]+\/[\w.-]+)["'`]/g)].map((m) => m[1]);
        const refs = [...call.text.matchAll(/\bref"?\s*[:=]\s*["'`]([\w./-]+)["'`]/g)].map((m) => m[1]);
        if (!repos.length || !refs.length || repos.some((r) => refs.some((ref) => !opts.allowedUrl(`https://github.com/${r}/blob/${ref}/x`)))) result.fetches.push({ ...at, what: `github connector: ${call.text.slice(0, 120)}` });
      }
      if (call.text.includes(base)) {
        const listingOnly = shellTexts.length > 0 && shellTexts.every((t) => simpleCommands(t).filter((w) => w.join(" ").includes(base)).every((w) => ["ls", "find", "tree"].includes(commandWords(w).name)));
        result.mentions.push({ ...at, text: call.text.slice(0, 200), listingOnly });
      }
    }
  }
  return result;
}

/** spawn_agent calls in the given parent turns, with whether each inherits no parent history. */
export function spawnCalls(parent: Rollout, turns: Set<string>): { turn: string; noHistory: boolean; text: string }[] {
  const found: { turn: string; noHistory: boolean; text: string }[] = [];
  for (const call of calls(parent)) {
    if (!turns.has(call.turn)) continue;
    if (call.kind === "function" && call.name === "spawn_agent") {
      const forkContext = call.args.fork_context;
      found.push({ turn: call.turn, noHistory: call.args.fork_turns === "none" && (forkContext === undefined || forkContext === false), text: call.text });
    }
    if (call.kind === "exec") {
      for (const match of call.text.matchAll(/tools\.spawn_agent\s*\(\s*\{([\s\S]*?)\}\s*\)/g)) {
        const body = match[1];
        const turnsNone = /\bfork_turns\s*:\s*["']none["']/.test(body);
        const forksContext = /\bfork_context\s*:\s*true\b/.test(body);
        found.push({ turn: call.turn, noHistory: turnsNone && !forksContext, text: body });
      }
    }
  }
  return found;
}

/** The root turn of the parent that started each child, from the child's task events. */
export function rootTurns(child: Rollout): Set<string> {
  return new Set(child.rows.filter((r) => r.type === "event_msg" && ["task_started", "task_complete"].includes(r.payload?.type) && r.payload?.root_turn_id)
    .map((r) => String(r.payload.root_turn_id)).filter((t) => !child.turns.has(t)));
}

/** True when a path lies inside one of the roots, comparing real paths. */
export const inside = (path: string, roots: string[]) => roots.some((root) => { const r = real(root); return path === r || path.startsWith(`${r}/`); });

/** URLs of the allowed docs at the pin: github.com or raw.githubusercontent.com under vhco-pro/docs. */
export const docsUrl = (pin: string) => (url: string) =>
  new RegExp(`^https://(github\\.com/vhco-pro/docs/(blob|raw|tree)/${pin}/|raw\\.githubusercontent\\.com/vhco-pro/docs/${pin}/)`).test(url);

// ---- Handoff checks ----

const plain = (line: string) => fold(line.replace(/[`*]/g, "")).toLowerCase();

/** True when the message has the editor's four return lines. */
export const fourReturnLines = (message: string) =>
  ["Verdict:", "Copy repairs:", "Presentation repairs:", "Exceptions:"].every((head) => message.split("\n").some((l) => l.replace(/^[\s*`-]+/, "").startsWith(head)));

/** Entries of a repairs line the handoff does not list on a line that also says applied or open. */
export function unlistedEntries(entries: Entry[], handoff: string): Entry[] {
  const lines = handoff.split("\n").map(plain).filter((l) => /\b(applied|open)\b/.test(l));
  return entries.filter((e) => !lines.some((l) => l.includes(plain(e.text))));
}

/** True when some handoff line names the treatment and at least four other words. */
export function handoffNamesTreatment(handoff: string, key: string): boolean {
  const needle = plain(key);
  return handoff.split("\n").map(plain).some((l) => l.includes(needle) && l.replace(needle, " ").split(/\s+/).filter((w) => /\w/.test(w)).length >= 4);
}

/** The key the handoff must name for a treatment block: its image basename or its quote's first five words. */
export function treatmentKey(block: string): string {
  const src = declaredSources(block)[0];
  if (src) return strip(src).split("/").at(-1) ?? src;
  const quote = pullQuotes(block)[0];
  return quote ? quote.text.split(/\s+/).slice(0, 5).join(" ") : "";
}

export const GAP = /\b(breaks?|unbroken|uninterrupted|walls?|long(er)?(?!-)|dense|sustained|stretch(es)?|(without|no|lacks?( any)?|needs?( an?)?) (a |an )?(\w+ )?(visuals?|treatments?|images?|pictures?|quotes?))\b/i;

/** True when a handoff line names the gap by its opening words and describes it as a missing break. */
export const namesGap = (handoff: string, opening: string) => handoff.split("\n").some((l) => l.toLowerCase().includes(opening.toLowerCase()) && GAP.test(l));
