import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { git } from "../triage/settings";
import type { Settings } from "./types";

export type JSONValue = null | boolean | number | string | JSONValue[] | { [name: string]: JSONValue };
export type JSONObject = { [name: string]: JSONValue };
export type RunScope = { repositories: string[]; pull?: number };
export type JournalState = {
  phase: string;
  authority: JSONObject | null;
  request: JSONObject | null;
  report: JSONObject | null;
  collection: JSONObject | null;
  tasks: JSONObject[];
  owned_locations: JSONObject[];
  operations: JSONObject[];
  pending_outcomes: JSONObject[];
  checks: JSONObject[];
  handoffs: JSONObject[];
};
export type RunHeader = {
  schema_version: 1;
  run_id: string;
  created_at: string;
  repository: string;
  hostname: string;
  git_common_dir: string;
  scope: RunScope;
  source_commit: string;
  settings_digest: string;
};
type JournalEvent = {
  schema_version: 1; run_id: string; revision: number; previous_digest: string;
  at: string; kind: "checkpoint" | "intent" | "receipt" | "handoff"; state: JournalState;
};
export type Run = { run_dir: string; header: RunHeader; revision: number; digest: string; state: JournalState; source_changed: boolean; settings_changed: boolean };

function fail(message: string): never { throw Error(`maintenance journal: ${message}`); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("expected object");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail("unexpected or missing fields");
}
function nonempty(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x1f\x7f]/.test(value)) fail("invalid text field");
  return value;
}
function timestamp(value: unknown): string { const text = nonempty(value); if (!Number.isFinite(Date.parse(text))) fail("invalid timestamp"); return text; }
export function runID(value: unknown): string {
  const text = nonempty(value).toLowerCase();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(text)) fail("invalid run ID");
  return text;
}
export function digest(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }

/** JSON-only canonical bytes: do not drop undefined, nonfinite values or accessors. */
export function canonicalJSON(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value)) fail("nonfinite JSON number"); return JSON.stringify(value); }
  if (!value || typeof value !== "object" || ancestors.has(value)) fail("invalid or cyclic JSON value");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length || value.some((_, index) => !Object.hasOwn(value, index))) fail("sparse or decorated JSON array");
      return `[${Array.from(value, item => canonicalJSON(item, ancestors)).join(",")}]`;
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length) fail("non-JSON object");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.values(descriptors).some(item => !item.enumerable || item.get || item.set)) fail("non-JSON property");
    return `{${Object.keys(descriptors).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON(descriptors[key].value, ancestors)}`).join(",")}}`;
  } finally { ancestors.delete(value); }
}

export function syncDirectory(path: string) {
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

/** Publish complete private bytes exactly once; the final filename is never replaced. */
export function publishJSON(path: string, value: unknown): string {
  return publishBytes(path, `${canonicalJSON(value)}\n`);
}
export function publishBytes(path: string, bytes: string | Uint8Array): string {
  const temporary = join(dirname(path), `.tmp-${randomUUID()}`);
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); }
  finally { closeSync(fd); }
  try {
    linkSync(temporary, path);
    syncDirectory(dirname(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") fail("revision conflict: target already exists");
    throw error;
  } finally { unlinkSync(temporary); }
  return digest(bytes);
}

function commonDir(config: Settings): string {
  return realpathSync(git(config.root, "rev-parse", "--path-format=absolute", "--git-common-dir"));
}
export function privateDirectory(base: string, parts: string[], create: boolean): string {
  let current = base;
  for (const part of parts) {
    current = join(current, part);
    if (!existsSync(current)) {
      if (!create) fail("run state missing");
      try { mkdirSync(current, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    const info = lstatSync(current);
    if (info.isSymbolicLink() || !info.isDirectory()) fail("unsafe state directory");
    if ((info.mode & 0o077) !== 0) fail("state directory is not private");
  }
  return current;
}
function privateJSON(path: string): { data: unknown; digest: string } {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) fail("unsafe state file");
  const bytes = readFileSync(path, "utf8");
  let data: unknown;
  try { data = JSON.parse(bytes); } catch { fail("corrupt state JSON"); }
  if (`${canonicalJSON(data)}\n` !== bytes) fail("noncanonical state JSON");
  return { data, digest: digest(bytes) };
}
function settingsDigest(config: Settings): string { const { root: _root, ...data } = config; return digest(canonicalJSON(data)); }
function scope(value: unknown): RunScope {
  const input = object(value), keys = input.pull === undefined ? ["repositories"] : ["repositories", "pull"];
  exactKeys(input, keys);
  if (!Array.isArray(input.repositories) || !input.repositories.length || input.repositories.some(repo => typeof repo !== "string" || !/^[a-z0-9][a-z0-9-]*\/[a-z0-9_.-]+$/.test(repo))) fail("invalid scope");
  if (new Set(input.repositories).size !== input.repositories.length) fail("duplicate scope");
  if (input.pull !== undefined && (input.repositories.length !== 1 || !Number.isSafeInteger(input.pull) || Number(input.pull) <= 0)) fail("ambiguous PR scope");
  return { repositories: [...input.repositories], ...(input.pull === undefined ? {} : { pull: Number(input.pull) }) };
}
function initialState(): JournalState {
  return { phase: "analysis", authority: null, request: null, report: null, collection: null, tasks: [],
    owned_locations: [], operations: [], pending_outcomes: [], checks: [], handoffs: [] };
}
function state(value: unknown): JournalState {
  const input = object(JSON.parse(canonicalJSON(value)));
  exactKeys(input, Object.keys(initialState()));
  nonempty(input.phase);
  for (const key of ["authority", "request", "report", "collection"]) if (input[key] !== null) object(input[key]);
  for (const key of ["tasks", "owned_locations", "operations", "pending_outcomes", "checks", "handoffs"]) {
    if (!Array.isArray(input[key])) fail("invalid state collection");
    for (const row of input[key]) object(row);
  }
  return input as unknown as JournalState;
}

export function createRun(config: Settings, input: { scope?: RunScope; run_id?: string; source_commit?: string; at?: string } = {}): Run {
  const id = runID(input.run_id ?? randomUUID()), selected = scope(input.scope ?? { repositories: [config.repository, ...config.repositories.map(row => row.repository)] });
  const allowed = new Set([config.repository, ...config.repositories.map(row => row.repository)]);
  if (selected.repositories.some(repo => !allowed.has(repo))) fail("scope outside configured repositories");
  if (input.source_commit !== undefined && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(input.source_commit)) fail("invalid source commit");
  const source_commit = git(config.root, "rev-parse", "--verify", `${input.source_commit ?? "HEAD"}^{commit}`);
  const common = commonDir(config);
  const header: RunHeader = { schema_version: 1, run_id: id, created_at: timestamp(input.at ?? new Date().toISOString()),
    repository: config.repository, hostname: config.hostname, git_common_dir: common, scope: selected,
    source_commit, settings_digest: settingsDigest(config) };
  const path = privateDirectory(common, ["vh-adlc", "maintenance", "runs", id], true);
  if (existsSync(join(path, "run.json"))) fail("run already exists; resume it");
  privateDirectory(path, ["events"], true);
  publishJSON(join(path, "run.json"), header);
  return readRun(config, id);
}

export function readRun(config: Settings, id: string): Run {
  id = runID(id);
  const common = commonDir(config), path = privateDirectory(common, ["vh-adlc", "maintenance", "runs", id], false);
  const rawHeader = privateJSON(join(path, "run.json")), input = object(rawHeader.data);
  exactKeys(input, ["schema_version", "run_id", "created_at", "repository", "hostname", "git_common_dir", "scope", "source_commit", "settings_digest"]);
  if (input.schema_version !== 1 || input.run_id !== id || input.git_common_dir !== common || input.repository !== config.repository || input.hostname !== config.hostname) fail("run identity mismatch; explicit recovery required");
  timestamp(input.created_at); scope(input.scope);
  if (typeof input.source_commit !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(input.source_commit) ||
      typeof input.settings_digest !== "string" || !/^[a-f0-9]{64}$/.test(input.settings_digest)) fail("invalid source binding");
  const header = input as unknown as RunHeader;
  const directory = privateDirectory(path, ["events"], false);
  const files = readdirSync(directory).filter(name => !/^\.tmp-[a-f0-9-]+$/.test(name)).sort();
  let revision = 0, previous = rawHeader.digest, current = initialState();
  for (const filename of files) {
    if (filename !== `${String(revision + 1).padStart(10, "0")}.json`) fail("noncontiguous event chain");
    const rawEvent = privateJSON(join(directory, filename)), event = object(rawEvent.data);
    exactKeys(event, ["schema_version", "run_id", "revision", "previous_digest", "at", "kind", "state"]);
    if (event.schema_version !== 1 || event.run_id !== id || event.revision !== revision + 1 || event.previous_digest !== previous ||
        !["checkpoint", "intent", "receipt", "handoff"].includes(String(event.kind))) fail("invalid event chain");
    timestamp(event.at); current = state(event.state); revision++; previous = rawEvent.digest;
  }
  return { run_dir: path, header, revision, digest: previous, state: current,
    source_changed: git(config.root, "rev-parse", "HEAD") !== header.source_commit,
    settings_changed: settingsDigest(config) !== header.settings_digest };
}

export function appendRun(config: Settings, id: string, expected: { revision: number; digest: string }, next: JournalState,
  kind: JournalEvent["kind"] = "checkpoint"): Run {
  const current = readRun(config, id);
  if (current.revision !== expected.revision || current.digest !== expected.digest) fail("revision conflict: re-read current state");
  if (!["checkpoint", "intent", "receipt", "handoff"].includes(kind)) fail("invalid event kind");
  const snapshot = state(next), revision = current.revision + 1;
  const event: JournalEvent = { schema_version: 1, run_id: current.header.run_id, revision,
    previous_digest: current.digest, at: new Date().toISOString(), kind, state: snapshot };
  const hash = publishJSON(join(current.run_dir, "events", `${String(revision).padStart(10, "0")}.json`), event);
  return { ...current, revision, digest: hash, state: snapshot };
}
