import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { canonicalJSON, publishJSON } from "../maintenance/journal";
import { loadSettings } from "./settings";
import { digest, git, hash, privateDirectory } from "./snapshot";
import type { Settings } from "./types";

export type Intent = { id: string; kind: "report" | "local-commit" | "issue" | "push" | "pull" | "merge" | "key" | "row";
  correlation: string; target: string; actor?: string; organization?: string; cleanup_method?: string; expected_head?: string };
export type Receipt = { state: "observed"; resource_id?: string; commit?: string; pull_number?: number; artifact_path?: string; artifact_digest?: string };
type Event = { revision: number; previous: string; kind: "intent" | "resource" | "outcome" | "handoff"; action_id: string; payload: Intent | Receipt | { reason_code: string } | { resource_id: string } };
type Header = { schema_version: 1; run_id: string; repository: string; hostname: string; common_dir: string; batch_digest: string; settings_digest: string; policy_digest: string };
export type Run = { policy_current: boolean; directory: string; config: Settings; header: Header; events: Event[]; revision: number; digest: string };
function fail(): never { throw Error("audit journal conflict, unsafe input or changed scope; reconcile owned state"); }
function identifier(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:#/@-]{0,159}$/.test(value); }
function exact(value: object, allowed: string[], required = allowed) {
  if (!value || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(value, k))) fail();
}
function inputBindings(config: Settings) {
  if (digest(loadSettings(config.root, { settingsPath: config.settings_path })) !== digest(config)) fail();
  return { settings_digest: hash(readFileSync(join(config.root, config.settings_path))), policy_digest: hash(readFileSync(join(config.root, config.project_procedure))),
    common_dir: realpathSync(git(config.root, "rev-parse", "--path-format=absolute", "--git-common-dir")) };
}
function privateJSON(path: string): unknown {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || process.getuid && stat.uid !== process.getuid()) fail();
  const bytes = readFileSync(path, "utf8"), value = JSON.parse(bytes);
  if (canonicalJSON(value) + "\n" !== bytes) fail();
  return value;
}
function validateIntent(value: Intent) {
  exact(value, ["id", "kind", "correlation", "target", "actor", "organization", "cleanup_method", "expected_head"], ["id", "kind", "correlation", "target"]);
  if (!identifier(value.id) || !identifier(value.correlation) || !identifier(value.target) ||
      !["report", "local-commit", "issue", "push", "pull", "merge", "key", "row"].includes(value.kind)) fail();
  for (const item of [value.actor, value.organization]) if (item !== undefined && !identifier(item)) fail();
  if (value.cleanup_method !== undefined && !/^#[a-z0-9][a-z0-9-]*$/.test(value.cleanup_method)) fail();
  if (value.expected_head !== undefined && !/^[a-f0-9]{40,64}$/.test(value.expected_head)) fail();
  if (["key", "row"].includes(value.kind) && (!value.actor || !value.organization || !value.cleanup_method)) fail();
}
function validateReceipt(value: Receipt) {
  exact(value, ["state", "resource_id", "commit", "pull_number", "artifact_path", "artifact_digest"], ["state"]);
  if (value.state !== "observed") fail();
  if (value.resource_id !== undefined && !identifier(value.resource_id)) fail();
  if (value.commit !== undefined && !/^[a-f0-9]{40,64}$/.test(value.commit)) fail();
  if (value.pull_number !== undefined && (!Number.isSafeInteger(value.pull_number) || value.pull_number < 1)) fail();
  if (value.artifact_path !== undefined && (!identifier(value.artifact_path) || value.artifact_path.split("/").includes(".."))) fail();
  if (value.artifact_digest !== undefined && !/^[a-f0-9]{64}$/.test(value.artifact_digest)) fail();
}
export function createRun(config: Settings, options: { artifact_root: string; run_id: string; batch_digest: string }): Run {
  const root = privateDirectory(options.artifact_root, config.root);
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(options.run_id) || !/^[a-f0-9]{64}$/.test(options.batch_digest)) fail();
  const directory = join(root, "audit-run-" + options.run_id);
  mkdirSync(directory, { mode: 0o700 }); mkdirSync(join(directory, "events"), { mode: 0o700 });
  const header: Header = { schema_version: 1, run_id: options.run_id, repository: config.repository, hostname: config.hostname,
    batch_digest: options.batch_digest, ...inputBindings(config) };
  publishJSON(join(directory, "header.json"), header);
  return readRun(config, directory, options.batch_digest);
}
export function readRun(config: Settings, directory: string, batch_digest: string, options: { inspect?: boolean } = {}): Run {
  privateDirectory(directory, config.root); privateDirectory(join(directory, "events"), config.root);
  const header = privateJSON(join(directory, "header.json")) as Header;
  exact(header, ["schema_version", "run_id", "repository", "hostname", "common_dir", "batch_digest", "settings_digest", "policy_digest"]);
  const bindings = inputBindings(config), policy_current = header.settings_digest === bindings.settings_digest && header.policy_digest === bindings.policy_digest;
  if (header.schema_version !== 1 || header.repository !== config.repository || header.hostname !== config.hostname || header.batch_digest !== batch_digest ||
      header.common_dir !== bindings.common_dir || !policy_current && !options.inspect) fail();
  const events: Event[] = [];
  let previous = digest(header);
  const files = readdirSync(join(directory, "events")).filter(name => !name.startsWith(".tmp-")).sort();
  for (const file of files) {
    const revision = events.length + 1;
    if (file !== String(revision).padStart(8, "0") + ".json") fail();
    const event = privateJSON(join(directory, "events", file)) as Event;
    exact(event, ["revision", "previous", "kind", "action_id", "payload"]);
    if (event.revision !== revision || event.previous !== previous || !identifier(event.action_id)) fail();
    if (event.kind === "intent") {
      validateIntent(event.payload as Intent);
      if ((event.payload as Intent).id !== event.action_id || events.some(e => e.kind === "intent" && e.action_id === event.action_id)) fail();
    } else {
      if (!events.some(e => e.kind === "intent" && e.action_id === event.action_id)) fail();
      if (event.kind === "resource") {
        exact(event.payload, ["resource_id"]);
        if (!identifier((event.payload as { resource_id: string }).resource_id) || events.some(e => e.kind === "resource" && e.action_id === event.action_id) ||
            !["key", "row"].includes((events.find(e => e.kind === "intent" && e.action_id === event.action_id)!.payload as Intent).kind)) fail();
      } else if (event.kind === "outcome") {
        validateReceipt(event.payload as Receipt);
        if (events.some(e => e.kind === "outcome" && e.action_id === event.action_id)) fail();
      } else if (event.kind === "handoff") {
        exact(event.payload, ["reason_code"]); if (!identifier((event.payload as { reason_code: string }).reason_code)) fail();
      } else fail();
    }
    events.push(event); previous = digest(event);
  }
  return { policy_current, directory, config, header, events, revision: events.length, digest: previous };
}
/** Read-only recovery inventory remains available after valid policy edits. Never grants retry/cleanup authority. */
export function inspectPending(config: Settings, directory: string, batch_digest: string) {
  const run = readRun(config, directory, batch_digest, { inspect: true });
  const pending = run.events.filter(event => event.kind === "intent" && !run.events.some(done => done.kind === "outcome" && done.action_id === event.action_id)).map(event => {
    const action = event.payload as Intent;
    const resource = run.events.find(value => value.kind === "resource" && value.action_id === action.id)?.payload as { resource_id: string } | undefined;
    return { ...action, ...(resource ?? {}) };
  });
  return { policy_current: run.policy_current, live_ready: run.policy_current && !pending.some(action => ["key", "row"].includes(action.kind)), pending,
    handoff: run.policy_current ? null : "policy-changed", limit: "Read-only pending-state inspection. Changed policy requires explicit reconciliation; no retry, cleanup or journal mutation is authorized." };
}
function append(run: Run, kind: Event["kind"], action_id: string, payload: Event["payload"]) {
  const actual = readRun(run.config, run.directory, run.header.batch_digest);
  if (actual.digest !== run.digest) fail();
  const event: Event = { revision: actual.revision + 1, previous: actual.digest, kind, action_id, payload };
  publishJSON(join(run.directory, "events", String(event.revision).padStart(8, "0") + ".json"), event);
  Object.assign(run, readRun(run.config, run.directory, run.header.batch_digest));
}
export function pendingResources(run: Run) {
  return run.events.filter(e => e.kind === "intent" && ["key", "row"].includes((e.payload as Intent).kind) &&
    !run.events.some(done => done.kind === "outcome" && done.action_id === e.action_id));
}
/** Register the whole first-attempt resource plan before creating any resource. */
export function resourceIntents(run: Run, actions: Intent[]) {
  if (!Array.isArray(actions) || !actions.length || pendingResources(run).length) fail();
  const ids = new Set(run.events.filter(e => e.kind === "intent").map(e => e.action_id));
  const scopes = new Set(run.events.filter(e => e.kind === "intent").map(e => resourceScope(e.payload as Intent)));
  for (const action of actions) {
    validateIntent(action);
    const scope = resourceScope(action);
    if (!["key", "row"].includes(action.kind) || ids.has(action.id) || scopes.has(scope)) fail();
    ids.add(action.id); scopes.add(scope);
  }
  for (const action of actions) append(run, "intent", action.id, action);
}
function resourceScope(action: Intent) {
  return digest([action.kind, action.target, action.actor ?? null, action.organization ?? null, action.correlation]);
}
export function intent(run: Run, action: Intent) {
  validateIntent(action);
  if (["key", "row"].includes(action.kind)) { resourceIntents(run, [action]); return; }
  if (run.events.some(e => e.kind === "intent" && e.action_id === action.id)) fail();
  append(run, "intent", action.id, action);
}
export function outcome(run: Run, action_id: string, receipt: Receipt) {
  validateReceipt(receipt);
  if (!run.events.some(e => e.kind === "intent" && e.action_id === action_id) || run.events.some(e => e.kind === "outcome" && e.action_id === action_id)) fail();
  append(run, "outcome", action_id, receipt);
}
export function handoff(run: Run, action_id: string, reason_code: string) {
  if (!identifier(reason_code)) fail();
  if (!run.events.some(e => e.kind === "intent" && e.action_id === action_id)) fail();
  append(run, "handoff", action_id, { reason_code });
}
export function noteResource(run: Run, action_id: string, resource_id: string) {
  if (!identifier(resource_id) || !run.events.some(e => e.kind === "intent" && e.action_id === action_id && ["key", "row"].includes((e.payload as Intent).kind)) ||
      run.events.some(e => ["resource", "outcome"].includes(e.kind) && e.action_id === action_id)) fail();
  append(run, "resource", action_id, { resource_id });
}
