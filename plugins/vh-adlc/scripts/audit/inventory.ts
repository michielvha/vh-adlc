import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Settings, Verdict } from "./types";

export type RecordedStatus = Verdict | "OPEN";
export type Diagnostic = { code: string; id?: string; line?: number };
export type Finding = {
  id: string; index_lines: number[]; entry_lines: number[];
  recorded_status: RecordedStatus; recorded_status_text: string; severity: string; identity_valid: boolean; aggregate: boolean;
};
export type Inventory = {
  schema_version: 1; repository: string; hostname: string; ledger_path: string; ledger_digest: string;
  findings: Finding[]; diagnostics: Diagnostic[]; complete: boolean;
  highest_id: number; next_id: string | null; recorded_counts: Record<RecordedStatus, number>;
  range_summaries: { start: string; end: string; line: number; count: number }[];
  verification: "not-performed";
};

/** Split a supported Markdown table row without treating escaped pipes as column boundaries. */
export function tableCells(line: string): string[] {
  const value = line.trim(), cells: string[] = [];
  let cell = "", escaped = false;
  for (const char of value) {
    if (escaped) { cell += char; escaped = false; }
    else if (char === "\\") escaped = true;
    else if (char === "|") { cells.push(cell.trim()); cell = ""; }
    else cell += char;
  }
  if (escaped) cell += "\\";
  cells.push(cell.trim());
  if (value.startsWith("|")) cells.shift();
  if (value.endsWith("|") && cells.at(-1) === "") cells.pop();
  return cells;
}

function codeSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  for (let at = 0; at < text.length;) {
    if (text[at] === "\\") { at += 2; continue; }
    if (text[at] !== "`") { at++; continue; }
    const start = at; while (text[at] === "`") at++; const size = at - start;
    let search = at, end = -1;
    while (search < text.length) { if (text[search] !== "`") { search++; continue; } const first = search; while (text[search] === "`") search++; if (search - first === size) { end = search; break; } }
    if (end >= 0) { spans.push({ start, end }); at = end; }
  }
  return spans;
}
export function maskInlineCode(text: string) {
  const spans = codeSpans(text); let result = "", at = 0;
  for (const span of spans) { result += text.slice(at, span.start) + " ".repeat(span.end - span.start); at = span.end; }
  return result + text.slice(at);
}
export function escapeInlineHtml(text: string) {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  let result = "", at = 0;
  for (const span of codeSpans(text)) { result += escape(text.slice(at, span.start)) + text.slice(span.start, span.end); at = span.end; }
  return result + escape(text.slice(at));
}
function commentStart(text: string) {
  const masked = maskInlineCode(text); let at = masked.indexOf("<!--");
  while (at >= 0) { let escapes = 0; for (let i = at - 1; i >= 0 && masked[i] === "\\"; i--) escapes++; if (!(escapes % 2)) return at; at = masked.indexOf("<!--", at + 4); }
  return -1;
}
export function markdownVisibility(text: string) {
  let fence: { char: string; size: number } | undefined, comment = false, comments = false;
  const lines = text.split(/\r?\n/).map(raw => {
    const marker = raw.match(/^ {0,3}([~\x60])\1{2,}/);
    if (fence) {
      if (marker && marker[1] === fence.char && marker[0].trim().length >= fence.size && !raw.slice(marker[0].length).trim()) fence = undefined;
      return "";
    }
    if (comment) { if (raw.includes("-->")) comment = false; return ""; }
    if (/^(?: {4}|\t)/.test(raw)) return "";
    if (marker) { fence = { char: marker[1], size: marker[0].trim().length }; return ""; }
    const first = commentStart(raw);
    if (first >= 0) comments = true;
    // Only a line-start HTML comment opens a block across later headings.
    if (first >= 0 && /^ {0,3}<!--/.test(raw)) { comment = !raw.includes("-->", first + 4); return ""; }
    let rest = raw, value = "";
    while (rest) {
      const start = commentStart(rest), end = start < 0 ? -1 : rest.indexOf("-->", start + 4);
      if (end < 0) { value += rest; break; }
      value += rest.slice(0, start); rest = rest.slice(end + 3);
    }
    return value;
  });
  return { lines, balanced: !fence && !comment, comments };
}
export function visibleLines(text: string): string[] { return markdownVisibility(text).lines; }

function status(value: string): RecordedStatus {
  // A historical cell is never current proof; ambiguous prose is not a positive status.
  if (/\b(?:not|never|unverified|pending|was|previously)\b/i.test(value)) return "UNKNOWN";
  const matches = [...value.matchAll(/\b(OPEN|STILL_PRESENT|FIXED|PARTIAL|REGRESSED|MOOT|UNKNOWN)\b/gi)];
  return matches.length ? matches.at(-1)![1].toUpperCase() as RecordedStatus : "UNKNOWN";
}

function titleStatus(value: string): { raw: string; state: RecordedStatus } {
  const annotation = /(?:^|\s[-\u2013\u2014]\s|;\s*)((?:(?:✅|⚠\uFE0F?|🗑\uFE0F?)\s*(?:\*\*)?|\*\*)(OPEN|STILL_PRESENT|FIXED|PARTIAL|REGRESSED|MOOT|UNKNOWN)\b)/gi;
  const last = [...value.matchAll(annotation)].at(-1);
  if (!last) return { raw: "", state: /[✅⚠🗑]/u.test(value) ? "UNKNOWN" : "OPEN" };
  const raw = value.slice(last.index! + last[0].length - last[1].length);
  return { raw, state: status(raw) };
}

export function inventory(config: Settings): Inventory { return inventoryMarkdown(config, readFileSync(join(config.root, config.ledger_path))); }
export function inventoryMarkdown(config: Settings, input: string | Uint8Array): Inventory {
  const bytes = Buffer.from(input), text = bytes.toString("utf8"), visibility = markdownVisibility(text);
  const lines = visibility.lines, diagnostics: Diagnostic[] = [], entries = new Map<string, number[]>();
  if (!visibility.balanced) diagnostics.push({ code: "unterminated-markdown-block" });
  const indices = new Map<string, { line: number; state: RecordedStatus; raw: string; severity: string; aggregate: boolean }[]>();
  const range_summaries: Inventory["range_summaries"] = [];
  const idText = config.id_prefix + "-[0-9]+", primary = new RegExp("^(" + idText + ")(?=\\s|$|:)");
  const cellID = new RegExp("^(" + idText + ")$"), linkedID = new RegExp("^\\[(" + idText + ")\\]\\([^)]+\\)$");
  const rangeID = new RegExp("^(" + config.id_prefix + "-([0-9]+))\\.\\.(" + config.id_prefix + "-([0-9]+))$");
  let indexLevel = 0, indexSections = 0, statusColumn = -1, severityColumn = -1, titleColumn = -1;
  for (const [offset, line] of lines.entries()) {
    const number = offset + 1, heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
    if (heading) {
      const level = heading[1].length, title = heading[2].trim();
      if (indexLevel && level <= indexLevel) indexLevel = 0;
      if (title === config.profile.index_heading) {
        indexLevel = level; indexSections++; statusColumn = -1; severityColumn = -1; titleColumn = -1;
      }
      if (level === config.profile.finding_level) {
        const match = title.match(primary);
        if (match) entries.set(match[1], [...entries.get(match[1]) ?? [], number]);
      }
    }
    if (!indexLevel || !line.trim().startsWith("|")) continue;
    const cells = tableCells(line);
    if (cells.every(cell => /^:?-+:?$/.test(cell))) continue;
    if (cells[0]?.toLowerCase() === "id") {
      statusColumn = cells.findIndex(cell => /^(?:status|state)$/i.test(cell));
      severityColumn = cells.findIndex(cell => /^(?:sev|severity)$/i.test(cell));
      titleColumn = cells.findIndex(cell => /^(?:title|finding|description)$/i.test(cell));
      if (statusColumn < 0 && titleColumn < 0) diagnostics.push({ code: "missing-status-header", line: number });
      continue;
    }
    const first = (cells[0] ?? "").replace(/[*_\x60]/g, "");
    const match = first.match(cellID) ?? first.match(linkedID);
    const range = first.match(rangeID);
    let rowIDs: string[];
    if (match) rowIDs = [match[1]];
    else if (range) {
      const start = Number(range[2]), end = Number(range[4]), count = end - start + 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || count < 1 ||
          count > 1000 || Math.max(range[2].length, range[4].length) > 16) {
        diagnostics.push({ code: "unsupported-index-range", line: number }); continue;
      }
      const width = Math.max(range[2].length, range[4].length);
      rowIDs = Array.from({ length: count }, (_, index) => config.id_prefix + "-" + String(start + index).padStart(width, "0"));
      range_summaries.push({ start: range[1], end: range[3], count, line: number });
      diagnostics.push({ code: "aggregate-index-range", line: number });
    } else { diagnostics.push({ code: "invalid-index-row", line: number }); continue; }
    const parsed = statusColumn < 0 ? titleColumn < 0 ? { raw: "", state: "UNKNOWN" as RecordedStatus } :
      titleStatus(cells[titleColumn] ?? "") : { raw: cells[statusColumn] ?? "", state: status(cells[statusColumn] ?? "") };
    for (const id of rowIDs) {
      indices.set(id, [...indices.get(id) ?? [], {
        line: number, ...parsed, severity: severityColumn < 0 ? "unknown" : cells[severityColumn] ?? "unknown",
        aggregate: Boolean(range),
      }]);
      if (parsed.state === "UNKNOWN") diagnostics.push({ code: "unknown-recorded-status", id, line: number });
    }
  }
  if (indexSections !== 1) diagnostics.push({ code: indexSections ? "duplicate-index-section" : "missing-index" });
  let highest = 0, width = 3, unsafe = false;
  const reference = new RegExp("\\b" + config.id_prefix + "-([0-9]+)\\b", "g");
  for (const [offset, raw] of text.split(/\r?\n/).entries()) for (const match of raw.matchAll(reference)) {
    const value = Number(match[1]);
    if (match[1].length > 16 || !Number.isSafeInteger(value) || value <= 0) {
      unsafe = true; diagnostics.push({ code: "unsafe-id-reference", line: offset + 1 }); continue;
    }
    highest = Math.max(highest, value); width = Math.max(width, match[1].length);
  }
  const ids = [...new Set([...indices.keys(), ...entries.keys()])], spellings = new Map<number, string[]>();
  for (const id of ids) {
    const value = Number(id.slice(config.id_prefix.length + 1));
    spellings.set(value, [...spellings.get(value) ?? [], id]);
  }
  const findings: Finding[] = ids.map(id => {
    const rows = indices.get(id) ?? [], heads = entries.get(id) ?? [], numeric = Number(id.slice(config.id_prefix.length + 1));
    const alias = (spellings.get(numeric)?.length ?? 0) !== 1;
    if (rows.length !== 1) diagnostics.push({ code: rows.length ? "duplicate-index" : "entry-only", id });
    if (heads.length !== 1) diagnostics.push({ code: heads.length ? "duplicate-entry" : "index-only", id });
    if (alias) diagnostics.push({ code: "duplicate-id-spelling", id });
    return {
      id, index_lines: rows.map(row => row.line), entry_lines: heads,
      recorded_status: rows.length === 1 ? rows[0].state : "UNKNOWN",
      recorded_status_text: rows.length === 1 ? rows[0].raw : "",
      severity: rows.length === 1 ? rows[0].severity : "unknown",
      aggregate: rows.some(row => row.aggregate),
      identity_valid: indexSections === 1 && rows.length === 1 && heads.length === 1 && !alias && !rows[0].aggregate &&
        id.slice(config.id_prefix.length + 1).length <= 16 &&
        Number.isSafeInteger(numeric) && numeric > 0,
    };
  });
  const recorded_counts: Record<RecordedStatus, number> = {
    OPEN: 0, STILL_PRESENT: 0, FIXED: 0, PARTIAL: 0, REGRESSED: 0, MOOT: 0, UNKNOWN: 0,
  };
  for (const row of findings) recorded_counts[row.recorded_status]++;
  return {
    schema_version: 1, repository: config.repository, hostname: config.hostname,
    ledger_path: config.ledger_path, ledger_digest: createHash("sha256").update(bytes).digest("hex"),
    findings, diagnostics, complete: !diagnostics.length && findings.length > 0,
    highest_id: highest,
    next_id: unsafe || highest === Number.MAX_SAFE_INTEGER ? null : config.id_prefix + "-" + String(highest + 1).padStart(width, "0"),
    recorded_counts, range_summaries, verification: "not-performed",
  };
}
