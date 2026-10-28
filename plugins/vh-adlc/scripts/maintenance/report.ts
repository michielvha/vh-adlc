import { closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import { git, resolveInside } from "../triage/settings";
import { appendRun, canonicalJSON, digest, privateDirectory, publishBytes, publishJSON, readRun, runID, syncDirectory, type Run } from "./journal";
import { commitID, parseObservation, validateObservation, type ObservationDocument } from "./history";
import type { Inventory } from "./collect";
import type { Settings } from "./types";

function fail(message: string): never { throw Error(`maintenance report: ${message}`); }
function writable(config: Settings, id: string): Run { const run = readRun(config, id); if (run.settings_changed) fail("settings changed; reconcile run scope first"); return run; }
export function escapeCell(value: unknown): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "&#124;")
    .replace(/[`\[\]\\*_]/g, char => `&#${char.charCodeAt(0)};`).replace(/[\r\n\t]+/g, " ");
}
function header(text: string) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) fail("missing report metadata");
  let metadata: Record<string, unknown>;
  try { metadata = Bun.YAML.parse(match[1]) as Record<string, unknown>; } catch { fail("invalid report metadata"); }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) fail("invalid report metadata");
  const names = [...match[1].matchAll(/^([A-Za-z_][A-Za-z0-9_-]*):/gm)].map(item => item[1]);
  if (new Set(names).size !== names.length) fail("duplicate report metadata");
  return { raw: match[1], metadata, body: text.slice(match[0].length) };
}
function ownedText(text: string, run: Run) {
  const metadata = header(text).metadata;
  if (metadata.run_id !== run.header.run_id || metadata.repository !== run.header.repository || metadata.hostname !== run.header.hostname ||
      canonicalJSON(metadata.scope) !== canonicalJSON(run.header.scope)) fail("report identity/scope mismatch");
  const observation = parseObservation(text);
  if (!observation || observation.run_id !== run.header.run_id) fail("missing owned observations");
  if (observation.observations.some(row => row.hostname !== run.header.hostname || !run.header.scope.repositories.includes(row.repository))) fail("observations outside run scope");
}
function atCommit(config: Settings, commit: string, path: string): string | null {
  const result = Bun.spawnSync(["git", "-C", config.root, "show", `${commit}:${path}`], { stdout: "pipe", stderr: "pipe" });
  return result.exitCode === 0 ? result.stdout.toString() : null;
}
function owns(text: string, run: Run) { try { ownedText(text, run); return true; } catch { return false; } }
function refOccupied(config: Settings, path: string, run: Run): boolean {
  const refs = git(config.root, "for-each-ref", "--format=%(objectname)", "refs/heads/chore/maintenance-report-*").split("\n").filter(Boolean);
  return refs.some(ref => { const text = atCommit(config, ref, path); return text !== null && !owns(text, run); });
}
function claim(path: string, expected: object): boolean {
  try { publishJSON(path, expected); return true; }
  catch (error) {
    if (!existsSync(path)) throw error;
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) fail("unsafe name reservation");
    let value: unknown; try { value = JSON.parse(readFileSync(path, "utf8")); } catch { fail("corrupt name reservation"); }
    return canonicalJSON(value) === canonicalJSON(expected);
  }
}
export function reserveReport(config: Settings, id: string, defaultCommit: string): string {
  let run = writable(config, id); const commit = commitID(config.root, defaultCommit), date = run.header.created_at.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("report date requires ISO creation time");
  const common = run.header.git_common_dir;
  const directory = privateDirectory(common, ["vh-adlc", "maintenance", "report-names", digest(config.report_dir), date], true);
  const first = posix.join(config.report_dir, `${date}-dependency-sweep.md`), suffix = posix.join(config.report_dir, `${date}-dependency-sweep-${run.header.run_id}.md`);
  const reserved = typeof run.state.report?.relative_path === "string" ? run.state.report.relative_path : null;
  if (reserved && ![first, suffix].includes(reserved)) fail("report path outside reserved scope");
  const occupied = (path: string) => {
    const committed = atCommit(config, commit, path);
    if (committed !== null && !owns(committed, run)) return true;
    if (refOccupied(config, path, run)) return true;
    const absolute = resolveInside(config.root, path);
    if (existsSync(absolute) && run.state.report?.path !== absolute) return true;
    const runs = join(common, "vh-adlc/maintenance/runs");
    for (const other of readdirSync(runs)) {
      if (other === id || !/^[a-f0-9-]{36}$/.test(other)) continue;
      const previous = readRun(config, other);
      if (previous.state.report?.relative_path === path) return true;
    }
    return false;
  };
  if (reserved && !occupied(reserved)) return reserved;
  if (reserved && run.state.report?.published === true) fail("published path collision; handoff required");
  const desired = { schema_version: 1, run_id: run.header.run_id, report_path: first, source_commit: run.header.source_commit };
  let path = first;
  if (reserved === suffix || occupied(first) || !claim(join(directory, "first.json"), desired)) path = suffix;
  if (occupied(path)) fail("reserved report path already occupied; handoff required");
  if (path === suffix && !claim(join(directory, `${run.header.run_id}.json`), { ...desired, report_path: path })) fail("conflicting suffixed name reservation");
  const previous = [...(Array.isArray(run.state.report?.previous_paths) ? run.state.report.previous_paths : []), ...(reserved && reserved !== path ? [reserved] : [])];
  run = appendRun(config, id, run, { ...run.state, report: { ...run.state.report, kind: "reserved", relative_path: path, previous_paths: previous } });
  return path;
}

export function renderReport(config: Settings, run: Run, inventory: Inventory, options: { metadata?: Record<string, string | string[]>; analysis?: string } = {}): string {
  if (inventory.repository !== run.header.repository || inventory.hostname !== run.header.hostname || canonicalJSON(inventory.scope) !== canonicalJSON(run.header.scope)) fail("collection scope differs from run");
  const observations: ObservationDocument = validateObservation({ schema_version: 1, run_id: run.header.run_id, created_at: run.header.created_at,
    observations: inventory.repositories.flatMap(repo => (["dependabot", "code_scanning"] as const).map(surface => {
      const input = repo[surface];
      return { hostname: inventory.hostname, repository: repo.repository, surface, scope: { state: "open", filters: [], exclusions: [] }, observed_at: inventory.collected_at,
        source_reference: `commit:${inventory.source_commit}`, status: input.coverage.status, reason: input.coverage.reason ?? (input.coverage.status === "incomplete" ? "Incomplete collection" : null),
        count: input.coverage.count, alerts: input.alerts?.map(alert => ({ number: alert.number, identity: `${surface}:${alert.number}`, package: alert.package, manifest: alert.manifest, severity: alert.severity })) ?? null };
    })) });
  const metadata: Record<string, unknown> = { status: "in-progress", status_description: "Analysis saved; selection and outcomes pending.", run_id: run.header.run_id,
    repository: config.repository, hostname: config.hostname, scope: run.header.scope, source_commit: inventory.source_commit, created_at: run.header.created_at };
  for (const [key, value] of Object.entries(options.metadata ?? {})) {
    if (!/^[a-z][a-z0-9_-]*$/.test(key) || Object.hasOwn(metadata, key) || !(typeof value === "string" || Array.isArray(value) && value.every(item => typeof item === "string"))) fail("invalid consumer metadata");
    metadata[key] = value;
  }
  const lines = ["---", ...Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`), "---", "", `# Dependency sweep ${run.header.created_at.slice(0, 10)}`, "",
    `Run: ${run.header.run_id}`, "", "## Inventory", "", "| Repository / PR | Title | Author scope | Evidence | Proposed action |", "| --- | --- | --- | --- | --- |"];
  for (const repo of inventory.repositories) {
    for (const pull of repo.pulls) lines.push(`| ${escapeCell(repo.repository)}#${pull.number} | ${escapeCell(pull.title)} | ${escapeCell(pull.author_class)} | ${escapeCell(pull.evidence.status)} | needs-analysis |`);
    for (const [surface, coverage] of Object.entries(repo.coverage)) lines.push(`\n${escapeCell(repo.repository)} ${surface}: ${coverage.status}${coverage.reason ? ` (${escapeCell(coverage.reason)})` : ""}.`);
  }
  lines.push("", "## Security alerts", "", "| Repository | Surface | Coverage | Count | Reason |", "| --- | --- | --- | --- | --- |");
  for (const row of observations.observations) lines.push(`| ${escapeCell(row.repository)} | ${row.surface} | ${row.status} | ${row.count === null ? row.status === "complete-unavailable" ? "n/a" : "unknown" : row.count} | ${escapeCell(row.reason ?? "")} |`);
  lines.push("", "```maintenance-observation-v1", JSON.stringify(observations, null, 2), "```", "", "## Analysis", "", options.analysis ?? "Release-note, usage, ownership and readiness evidence is pending. No dependency action is authorized by this report.", "");
  return lines.join("\n");
}

type Saved = { path: string; digest: string; inode: string; kind: string };
function fileIdentity(path: string, expected?: string) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) fail("unsafe report file");
  const bytes = readFileSync(path), hash = digest(bytes);
  if (expected !== undefined && hash !== expected) fail("report bytes changed; preserve and reconcile");
  return { digest: hash, inode: `${info.dev}:${info.ino}` };
}
export function saveReport(config: Settings, id: string, text: string, options: { default_commit: string; draft?: boolean; output?: string }): Saved {
  let run = writable(config, id); ownedText(text, run);
  const hash = digest(text), existing = run.state.report;
  if (existing?.path && typeof existing.path === "string") {
    if (existing.digest !== hash) fail("existing report differs; use append or reconcile");
    if (!existsSync(existing.path) && existing.saved !== true) publishBytes(existing.path, text);
    const identity = fileIdentity(existing.path, hash);
    if (existing.inode !== undefined && existing.inode !== identity.inode) fail("report file identity changed");
    if (existing.saved !== true) run = appendRun(config, id, run, { ...run.state, report: { ...existing, ...identity, saved: true } }, "receipt");
    return { path: existing.path, ...identity, kind: String(existing.kind) };
  }
  let path: string, kind: string;
  if (options.output) {
    if (!isAbsolute(options.output)) fail("external report-output must be absolute");
    path = resolve(options.output); kind = "external-draft";
    if (!existsSync(dirname(path)) || lstatSync(dirname(path)).isSymbolicLink()) fail("external output parent must exist without symlink");
  } else if (options.draft) { path = join(privateDirectory(run.run_dir, ["drafts"], true), "report.md"); kind = "private-draft"; }
  else { const relative = reserveReport(config, id, options.default_commit); run = writable(config, id); path = resolveInside(config.root, relative); kind = "checkout-draft"; mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); }
  const report = { ...run.state.report, kind, path, digest: hash, saved: false };
  run = appendRun(config, id, run, { ...run.state, report }, "intent");
  publishBytes(path, text);
  const identity = fileIdentity(path, hash);
  appendRun(config, id, run, { ...run.state, report: { ...report, ...identity, saved: true } }, "receipt");
  return { path, ...identity, kind };
}

type Update = { expected_digest: string; step_id: string; at: string; append: string; status?: string; status_description?: string };
export function appendReport(config: Settings, id: string, update: Update): Saved {
  let run = writable(config, id); runID(update.step_id);
  if (Object.keys(update).some(key => !["expected_digest", "step_id", "at", "append", "status", "status_description"].includes(key)) ||
      !Number.isFinite(Date.parse(update.at)) || typeof update.append !== "string" || !update.append.trim() || !/^[a-f0-9]{64}$/.test(update.expected_digest)) fail("invalid append update");
  for (const value of [update.status, update.status_description]) if (value !== undefined && (typeof value !== "string" || /[\r\n\0]/.test(value))) fail("invalid mutable scalar");
  const report = run.state.report;
  if (!report || typeof report.path !== "string" || report.published === true || report.kind === "candidate" || report.pending_publication === true) fail("report update requires an owned draft; prepare a fresh candidate or capture pending outcomes");
  const path = report.path, intent = run.state.operations.find(op => op.step_id === update.step_id);
  const payload = digest(canonicalJSON(update));
  if (intent && (intent.kind !== "report-append" || intent.payload !== payload)) fail("step ID payload conflict");
  const current = fileIdentity(path), original = readFileSync(path, "utf8"); ownedText(original, run);
  if (intent?.after_digest === current.digest && intent.state === "receipt") return { path, ...current, kind: String(report.kind) };
  if (current.digest !== update.expected_digest && intent?.after_digest !== current.digest) fail("report digest changed; reconcile instead of appending");
  if (run.state.operations.some(op => op.kind === "report-append" && op.state === "intent" && op.step_id !== update.step_id)) fail("another append intent requires reconciliation");
  {
    if (fileIdentity(path).digest !== current.digest || fileIdentity(path).inode !== current.inode) fail("concurrent report edit");
    const parsed = header(original);
    let raw = parsed.raw;
    for (const key of ["status", "status_description"] as const) if (update[key] !== undefined) {
      const expression = new RegExp(`^${key}:.*$`, "m");
      if (!expression.test(raw)) fail("missing mutable header scalar"); raw = raw.replace(expression, () => `${key}: ${JSON.stringify(update[key])}`);
    }
    const next = `---\n${raw}\n---\n${parsed.body}\n## Update ${update.at}\n\n${update.append.trimEnd()}\n\n<!-- Maintenance-Step: ${update.step_id} -->\n`, after = digest(next);
    ownedText(next, run);
    if (intent && current.digest === intent.after_digest) {
      const operations = run.state.operations.map(op => op.step_id === update.step_id ? { ...op, state: "receipt" } : op);
      appendRun(config, id, run, { ...run.state, operations, report: { ...report, ...current } }, "receipt");
      return { path, ...current, kind: String(report.kind) };
    }
    if (report.digest !== current.digest || report.inode !== current.inode) fail("report identity changed");
    const operation = { step_id: update.step_id, kind: "report-append", state: "intent", payload, before_digest: current.digest, after_digest: after };
    if (!intent) run = appendRun(config, id, run, { ...run.state, operations: [...run.state.operations, operation] }, "intent");
    const temporary = join(dirname(path), `.tmp-${randomUUID()}`);
    const out = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { writeFileSync(out, next); fsyncSync(out); } finally { closeSync(out); }
    try {
      const rechecked = fileIdentity(path, current.digest); if (rechecked.inode !== current.inode) fail("concurrent report replacement");
      renameSync(temporary, path); syncDirectory(dirname(path));
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
    const identity = fileIdentity(path, after);
    appendRun(config, id, run, { ...run.state, report: { ...report, ...identity }, operations: run.state.operations.map(op => op.step_id === update.step_id ? { ...op, state: "receipt" } : op) }, "receipt");
    return { path, ...identity, kind: String(report.kind) };
  }
}

export function evidenceReference(input: { run_id: string; ref: string; path: string; record_target: string; source_target?: string }): string {
  runID(input.run_id);
  if (!/^[a-f0-9]{40,64}$/.test(input.record_target) || input.source_target !== undefined && !/^[a-f0-9]{40,64}$/.test(input.source_target) ||
      !/^chore\/maintenance-evidence-[a-z0-9-]+$/.test(input.ref) || isAbsolute(input.path) || input.path.split(/[\\/]/).some(part => ["..", ".", ""].includes(part)) || /[\x00-\x1f\x7f]/.test(input.path)) fail("invalid unpublished evidence reference");
  return `unpublished: run ${escapeCell(input.run_id)}, ref ${escapeCell(input.ref)}, record ${escapeCell(input.path)} at ${input.record_target}${input.source_target ? `, source ${input.source_target}` : ""}`;
}
