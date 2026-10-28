import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { posix } from "node:path";
import { resolveInside } from "../triage/settings";
import { canonicalJSON, digest, runID } from "./journal";
import type { Settings } from "./types";

export type Observation = {
  hostname: string; repository: string; surface: "dependabot" | "code_scanning";
  scope: { state: "open"; filters: string[]; exclusions: string[] };
  observed_at: string; source_reference: string;
  status: "complete" | "complete-unavailable" | "incomplete"; reason: string | null; count: number | null;
  alerts: { number: number; identity: string; package: string | null; manifest: string | null; severity: string }[] | null;
};
export type ObservationDocument = { schema_version: 1; run_id: string; created_at: string; observations: Observation[] };
export type HistoryReport = { path: string; provenance: "published" | "local"; commit?: string; digest: string; text: string };
type Provenance = Omit<HistoryReport, "text">;
function fail(message: string): never { throw Error(`maintenance observations: ${message}`); }
function obj(input: unknown): Record<string, unknown> { if (!input || typeof input !== "object" || Array.isArray(input)) fail("expected object"); return input as Record<string, unknown>; }
function keys(value: Record<string, unknown>, expected: string[]) { if (Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) fail("unexpected fields"); }
function text(value: unknown): string { if (typeof value !== "string" || !value.trim() || /[\x00-\x1f\x7f]/.test(value)) fail("invalid text"); return value; }
function at(value: unknown): string { const result = text(value); if (!Number.isFinite(Date.parse(result))) fail("invalid time"); return result; }
function sorted(value: unknown): string[] {
  if (!Array.isArray(value)) fail("scope list required"); const result = value.map(text);
  if (canonicalJSON(result) !== canonicalJSON([...new Set(result)].sort())) fail("scope lists must be unique and sorted"); return result;
}
function observation(value: unknown): Observation {
  const row = obj(value);
  keys(row, ["hostname", "repository", "surface", "scope", "observed_at", "source_reference", "status", "reason", "count", "alerts"]);
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(text(row.hostname)) || !/^[a-z0-9][a-z0-9-]*\/[a-z0-9_.-]+$/.test(text(row.repository))) fail("normalized identity required");
  if (!["dependabot", "code_scanning"].includes(String(row.surface))) fail("unknown surface");
  const scope = obj(row.scope); keys(scope, ["state", "filters", "exclusions"]);
  if (scope.state !== "open") fail("open scope required"); sorted(scope.filters); sorted(scope.exclusions);
  at(row.observed_at); text(row.source_reference);
  if (!["complete", "complete-unavailable", "incomplete"].includes(String(row.status))) fail("unknown coverage");
  if (row.reason !== null) text(row.reason);
  if (row.status === "complete") {
    if (!Number.isSafeInteger(row.count) || Number(row.count) < 0 || !Array.isArray(row.alerts) || row.count !== row.alerts.length) fail("complete count mismatch");
  } else {
    if (row.count !== null || row.reason === null) fail("unknown coverage needs null count and reason");
    if (row.status === "complete-unavailable" && row.alerts !== null) fail("unavailable alerts must be null");
    if (row.status === "incomplete" && row.alerts !== null && !Array.isArray(row.alerts)) fail("invalid partial alerts");
  }
  const seen = new Set<string>();
  for (const raw of (row.alerts as unknown[] | null) ?? []) {
    const alert = obj(raw); keys(alert, ["number", "identity", "package", "manifest", "severity"]);
    if (!Number.isSafeInteger(alert.number) || Number(alert.number) <= 0 || alert.identity !== `${row.surface}:${alert.number}` || seen.has(String(alert.identity))) fail("duplicate or invalid alert identity");
    seen.add(String(alert.identity));
    for (const field of ["package", "manifest"]) if (alert[field] !== null) text(alert[field]);
    text(alert.severity);
  }
  return row as unknown as Observation;
}
function key(row: Observation) { return canonicalJSON([row.hostname, row.repository, row.surface, row.scope]); }
function surfaceKey(row: Observation) { return canonicalJSON([row.hostname, row.repository, row.surface]); }
export function validateObservation(value: unknown): ObservationDocument {
  const document = obj(JSON.parse(canonicalJSON(value)));
  keys(document, ["schema_version", "run_id", "created_at", "observations"]);
  if (document.schema_version !== 1) fail("unsupported schema");
  if (runID(document.run_id) !== document.run_id) fail("normalized run ID required");
  at(document.created_at);
  if (!Array.isArray(document.observations)) fail("observations required");
  const rows = document.observations.map(observation), seen = new Set<string>();
  for (const row of rows) { if (seen.has(key(row))) fail("duplicate surface/scope"); seen.add(key(row)); }
  return { schema_version: 1, run_id: String(document.run_id), created_at: String(document.created_at), observations: rows };
}
export function parseObservation(markdown: string): ObservationDocument | null {
  const markers = [...markdown.matchAll(/^```maintenance-observation-v1\s*$/gm)];
  if (!markers.length) return null;
  const blocks = [...markdown.matchAll(/^```maintenance-observation-v1\s*\n([\s\S]*?)^```\s*$/gm)];
  if (markers.length !== 1 || blocks.length !== 1) fail("missing or duplicate portable block");
  let value: unknown; try { value = JSON.parse(blocks[0][1]); } catch { fail("malformed portable block"); }
  return validateObservation(value);
}

/** Exact Git object bytes, without the trimming used for ordinary Git identifiers. */
export function gitBytes(root: string, ...args: string[]): Buffer {
  const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) fail(`Git object read failed (${args[0]})`);
  return Buffer.from(result.stdout);
}
export function commitID(root: string, commit: string): string {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(commit)) fail("exact commit required");
  return gitBytes(root, "rev-parse", "--verify", `${commit}^{commit}`).toString().trim();
}
export function readHistory(config: Settings, defaultCommit: string): HistoryReport[] {
  const commit = commitID(config.root, defaultCommit), reports: HistoryReport[] = [];
  const tracked = new Map<string, string>();
  for (const entry of gitBytes(config.root, "ls-tree", "-rz", commit, "--", config.history_dir).toString().split("\0").filter(Boolean)) {
    const match = entry.match(/^(100644|100755) blob [a-f0-9]+\t(.+\.md)$/s);
    if (!match) continue;
    const path = match[2], content = gitBytes(config.root, "show", `${commit}:${path}`).toString(), hash = digest(content);
    tracked.set(path, hash); reports.push({ path, provenance: "published", commit, digest: hash, text: content });
  }
  const walk = (relative: string) => {
    const absolute = resolveInside(config.root, relative);
    if (!existsSync(absolute)) return;
    const info = lstatSync(absolute);
    if (info.isSymbolicLink()) fail("symlink in local history");
    if (info.isDirectory()) { for (const name of readdirSync(absolute).sort()) if (name !== ".git") walk(posix.join(relative, name)); }
    else if (info.isFile() && relative.endsWith(".md")) {
      const content = readFileSync(absolute, "utf8"), hash = digest(content);
      if (tracked.get(relative) !== hash) reports.push({ path: relative, provenance: "local", digest: hash, text: content });
    }
  };
  walk(config.history_dir);
  return reports;
}

function provenance(report: HistoryReport): Provenance { const { text: _text, ...rest } = report; return rest; }
type Legacy = { label: "unverified legacy comparison"; provenance: Provenance; rows: { cells: string[] }[]; entries: string[];
  counts: { repository: string; surface: Observation["surface"]; recorded_count: number; current_count: number | null; recorded_delta: number | null }[] };
function legacy(report: HistoryReport, current: ObservationDocument): Legacy | null {
  const section = report.text.match(/^## Security alerts[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/mi)?.[1];
  if (section === undefined) return null;
  const result: Legacy = { label: "unverified legacy comparison", provenance: provenance(report), rows: [], entries: [], counts: [] };
  let headers: string[] = [];
  for (const line of section.split("\n")) {
    if (line.trim().startsWith("|")) {
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
      if (!headers.length) { headers = cells; continue; }
      if (cells.every(cell => /^:?-+:?$/.test(cell))) continue;
      result.rows.push({ cells });
      const name = cells[0]?.replace(/[*`]/g, "");
      const matches = current.observations.filter(row => row.repository === name || row.repository.split("/")[1] === name);
      if (new Set(matches.map(row => row.repository)).size !== 1) continue;
      for (const row of matches) {
        const position = headers.findIndex(header => row.surface === "dependabot" ? /dependabot/i.test(header) : /code.?scanning/i.test(header));
        const raw = cells[position]?.replace(/\*/g, "").match(/^(\d+)(?:\s|$)/)?.[1];
        if (raw !== undefined) result.counts.push({ repository: row.repository, surface: row.surface, recorded_count: Number(raw), current_count: row.count,
          recorded_delta: row.count === null ? null : row.count - Number(raw) });
      }
    } else if (line.trim()) result.entries.push(line);
  }
  return result;
}
export function compareHistory(input: ObservationDocument, reports: HistoryReport[]) {
  const current = validateObservation(input), warnings: { path: string; reason: string }[] = [], old: { report: HistoryReport; document: ObservationDocument }[] = [], legacyRows: Legacy[] = [];
  for (const report of reports) {
    if (digest(report.text) !== report.digest || report.provenance === "published" && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(report.commit ?? "")) { warnings.push({ path: report.path, reason: "history provenance mismatch" }); continue; }
    try {
      const document = parseObservation(report.text);
      if (document) {
        if (document.run_id !== current.run_id && Date.parse(document.created_at) < Date.parse(current.created_at)) old.push({ report, document });
      } else { const entry = legacy(report, current); if (entry) legacyRows.push(entry); }
    } catch { warnings.push({ path: report.path, reason: "malformed history observation; no absence comparison" }); }
  }
  const surfaces = current.observations.map(row => {
    const candidates = old.flatMap(item => item.document.observations.map(previous => ({ ...item, previous })))
      .filter(item => surfaceKey(item.previous) === surfaceKey(row) && Date.parse(item.previous.observed_at) <= Date.parse(row.observed_at))
      .sort((a, b) => Date.parse(b.previous.observed_at) - Date.parse(a.previous.observed_at) || Date.parse(b.document.created_at) - Date.parse(a.document.created_at) || a.report.path.localeCompare(b.report.path));
    const comparable = candidates.filter(item => item.previous.status === "complete" && key(item.previous) === key(row));
    const baseline = comparable.find(item => item.report.provenance === "published") ?? comparable[0];
    const comparableCurrent = row.status === "complete" && !!baseline;
    const before = new Set(baseline?.previous.alerts?.map(alert => alert.identity) ?? []), now = new Set(row.alerts?.map(alert => alert.identity) ?? []);
    return { hostname: row.hostname, repository: row.repository, surface: row.surface, scope: row.scope, status: row.status,
      baseline: baseline ? provenance(baseline.report) : null, availability_previous: candidates[0]?.previous.status ?? null,
      appeared: comparableCurrent ? [...now].filter(id => !before.has(id)).sort() : null,
      resolved: comparableCurrent ? [...before].filter(id => !now.has(id)).sort() : null };
  });
  return { surfaces, legacy: legacyRows, warnings };
}
