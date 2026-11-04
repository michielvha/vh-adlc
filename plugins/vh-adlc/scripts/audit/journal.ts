import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { canonicalJSON, publishJSON } from "../maintenance/journal";
import { validArtifact } from "./assessment";
import { observeDefault, validConstraints } from "./authority";
import { loadSettings } from "./settings";
import { digest, git, gitBytes, hash, privateDirectory } from "./snapshot";
import type { Settings } from "./types";

export type Intent = { id: string; kind: "report" | "local-commit" | "issue" | "push" | "pull" | "merge" | "key" | "row";
  correlation: string; target: string; actor?: string; organization?: string; cleanup_method?: string; expected_head?: string };
export type Receipt = { state: "observed"; resource_id?: string; commit?: string; pull_number?: number; artifact_path?: string; artifact_digest?: string };
type PolicyTransition = {from_settings_digest:string;from_policy_digest:string;settings_digest:string;policy_digest:string;policy_commit:string;observed_default_branch:string;observed_default_commit:string;owner_handoff:string;cleanup_only:true};
type RetireEvent = {owner_handoff:string;zero_pending:true};
type RetainedAbsence = { state: "absent"; journal_only: true; owner_handoff: string; header_digest: string; intent_digest: string;
  observed_at: string; method: string; lookup: { path: string; sha256: string } };
type Event = { revision: number; previous: string; kind: "intent" | "resource" | "outcome" | "handoff" | "policy-transition" | "retirement" | "observed-outcome" | "retained-absence"; action_id: string; payload: RetainedAbsence | RetireEvent | PolicyTransition | Intent | Receipt | { reason_code: string } | { resource_id: string } };
function isOutcome(event:Event){return event.kind==="outcome"||event.kind==="observed-outcome";}
type Header = { schema_version: 1; run_id: string; repository: string; hostname: string; common_dir: string; batch_digest: string; settings_digest: string; policy_digest: string };
export type Run = { policy_current: boolean; cleanup_only:boolean; retired:boolean; directory: string; config: Settings; header: Header; events: Event[]; revision: number; digest: string };
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
  if (["policy-transition","run-retirement"].includes(value.id) || !identifier(value.id) || !identifier(value.correlation) || !identifier(value.target) ||
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
function retainedLookup(config: Settings, header: Header, directory: string, action: Intent, payload: RetainedAbsence) {
  exact(payload, ["state", "journal_only", "owner_handoff", "header_digest", "intent_digest", "observed_at", "method", "lookup"]);
  if (payload.state !== "absent" || payload.journal_only !== true || !identifier(payload.owner_handoff) ||
      payload.header_digest !== digest(header) || payload.intent_digest !== digest(action) || ["key", "row"].includes(action.kind) ||
      !identifier(payload.method) || typeof payload.observed_at !== "string" || !Number.isFinite(Date.parse(payload.observed_at)) ||
      new Date(payload.observed_at).toISOString() !== payload.observed_at) fail();
  exact(payload.lookup, ["path", "sha256"]);
  if (!/^[a-f0-9]{64}$/.test(payload.lookup.sha256) || !validArtifact(dirname(directory), payload.lookup)) fail();
  const observed = JSON.parse(readFileSync(join(dirname(directory), payload.lookup.path), "utf8")) as Record<string, unknown>;
  exact(observed, ["schema_version", "repository", "hostname", "run_id", "batch_digest", "action_id", "intent", "intent_digest", "state", "observed_at", "method"]);
  if (observed.schema_version !== 1 || observed.repository !== config.repository || observed.hostname !== config.hostname ||
      observed.run_id !== header.run_id || observed.batch_digest !== header.batch_digest || observed.action_id !== action.id ||
      observed.intent_digest !== payload.intent_digest || canonicalJSON(observed.intent) !== canonicalJSON(action) ||
      observed.state !== "absent" || observed.observed_at !== payload.observed_at || observed.method !== payload.method) fail();
}
export function hasRetainedAbsence(run: Run) { return run.events.some(event => event.kind === "retained-absence"); }
/** Explicit journal-only observation. Candidate settings establish identity, never policy authority. */
export function retainAbsence(config: Settings, directory: string, batch_digest: string, action_id: string, input: unknown,
  options: { absence_confirmed: boolean; restrictions?: string[] }): Run {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail();
  exact(input, ["owner_approved", "journal_only", "owner_handoff", "expected_digest", "intent_digest", "lookup", "restrictions"],
    ["owner_approved", "journal_only", "owner_handoff", "expected_digest", "intent_digest", "lookup"]);
  const request = input as { owner_approved: boolean; journal_only: boolean; owner_handoff: string; expected_digest: string;
    intent_digest: string; lookup: { path: string; sha256: string }; restrictions?: string[] };
  if (request.owner_approved !== true || request.journal_only !== true || options.absence_confirmed !== true || !identifier(request.owner_handoff) ||
      !validConstraints(request.restrictions, undefined) || !validConstraints(options.restrictions, undefined) ||
      [...request.restrictions ?? [], ...options.restrictions ?? []].some(value => ["read-only", "no-write"].includes(value))) fail();
  const run = readRun(config, directory, batch_digest, { inspect: true }); requireRegistered(run);
  const event = run.events.find(event => event.kind === "intent" && event.action_id === action_id), action = event?.payload as Intent | undefined;
  if (!action || !/^[a-f0-9]{64}$/.test(request.expected_digest) || run.digest !== request.expected_digest ||
      request.intent_digest !== digest(action) || run.events.some(event => (isOutcome(event) || event.kind === "retained-absence") && event.action_id === action_id)) fail();
  const lookup = request.lookup;
  if (!lookup || !validArtifact(dirname(directory), lookup)) fail();
  const observed = JSON.parse(readFileSync(join(dirname(directory), lookup.path), "utf8")) as { observed_at: string; method: string };
  const payload: RetainedAbsence = { state: "absent", journal_only: true, owner_handoff: request.owner_handoff, header_digest: digest(run.header),
    intent_digest: request.intent_digest, observed_at: observed.observed_at, method: observed.method, lookup };
  retainedLookup(config, run.header, directory, action, payload);
  const actual = readRun(config, directory, batch_digest, { inspect: true }); requireRegistered(actual);
  if (actual.digest !== request.expected_digest) fail();
  const next: Event = { revision: actual.revision + 1, previous: actual.digest, kind: "retained-absence", action_id, payload };
  publishJSON(join(directory, "events", String(next.revision).padStart(8, "0") + ".json"), next);
  return readRun(config, directory, batch_digest, { inspect: true });
}

export function createRun(config: Settings, options: { artifact_root: string; run_id: string; batch_digest: string }): Run {
  const root = privateDirectory(options.artifact_root, config.root);
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(options.run_id) || !/^[a-f0-9]{64}$/.test(options.batch_digest)) fail();
  const directory = join(root, "audit-run-" + options.run_id);
  mkdirSync(directory, { mode: 0o700 }); mkdirSync(join(directory, "events"), { mode: 0o700 });
  const header: Header = { schema_version: 1, run_id: options.run_id, repository: config.repository, hostname: config.hostname,
    batch_digest: options.batch_digest, ...inputBindings(config) };
  publishJSON(join(directory, "header.json"), header);
  registerRun(config, directory, options.batch_digest);
  return readRun(config, directory, options.batch_digest);
}
export function readRun(config: Settings, directory: string, batch_digest: string, options: { inspect?: boolean } = {}): Run {
  privateDirectory(directory, config.root); privateDirectory(join(directory, "events"), config.root);
  const header = privateJSON(join(directory, "header.json")) as Header;
  exact(header, ["schema_version", "run_id", "repository", "hostname", "common_dir", "batch_digest", "settings_digest", "policy_digest"]);
  const bindings = inputBindings(config);
  let effective={settings_digest:header.settings_digest,policy_digest:header.policy_digest},cleanup_only=false,retired=false;
  if (header.schema_version !== 1 || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(header.run_id) || [header.batch_digest, header.settings_digest, header.policy_digest].some(value => !/^[a-f0-9]{64}$/.test(value)) || header.repository !== config.repository || header.hostname !== config.hostname || header.batch_digest !== batch_digest ||
      typeof header.common_dir!=="string"||!header.common_dir.startsWith("/")||header.common_dir.includes("\0")) fail();
  const events: Event[] = [];
  let previous = digest(header);
  const files = readdirSync(join(directory, "events")).filter(name => !name.startsWith(".tmp-")).sort();
  for (const file of files) {
    const revision = events.length + 1;
    if (file !== String(revision).padStart(8, "0") + ".json") fail();
    const event = privateJSON(join(directory, "events", file)) as Event;
    exact(event, ["revision", "previous", "kind", "action_id", "payload"]);
    if (retired || event.revision !== revision || event.previous !== previous || !identifier(event.action_id)) fail();
    if(event.kind==="retirement"){
      exact(event.payload,["owner_handoff","zero_pending"]);
      const retirement=event.payload as RetireEvent;
      if(event.action_id!=="run-retirement"||!identifier(retirement.owner_handoff)||retirement.zero_pending!==true||events.some(e=>e.kind==="intent"&&!events.some(done=>isOutcome(done)&&done.action_id===e.action_id)))fail();
      retired=true;
    }else if(event.kind==="policy-transition"){
      const transition=event.payload as PolicyTransition;
      exact(transition,["from_settings_digest","from_policy_digest","settings_digest","policy_digest","policy_commit","observed_default_branch","observed_default_commit","owner_handoff","cleanup_only"]);
      if(event.action_id!=="policy-transition"||transition.cleanup_only!==true||!identifier(transition.owner_handoff)||!(/^[a-f0-9]{40,64}$/).test(transition.policy_commit)||
        [transition.from_settings_digest,transition.from_policy_digest,transition.settings_digest,transition.policy_digest].some(value=>!(/^[a-f0-9]{64}$/).test(value))||
        !(/^[a-f0-9]{40,64}$/).test(transition.observed_default_commit)||typeof transition.observed_default_branch!=="string"||!transition.observed_default_branch||/[\x00-\x20\x7f]/.test(transition.observed_default_branch)||
        transition.from_settings_digest!==effective.settings_digest||transition.from_policy_digest!==effective.policy_digest)fail();
      effective={settings_digest:transition.settings_digest,policy_digest:transition.policy_digest};cleanup_only=true;
    }else if (event.kind === "intent") {
      if(cleanup_only || events.some(event => event.kind === "retained-absence"))fail();
      validateIntent(event.payload as Intent);
      if ((event.payload as Intent).id !== event.action_id || events.some(e => e.kind === "intent" && e.action_id === event.action_id)) fail();
    } else {
      if (!events.some(e => e.kind === "intent" && e.action_id === event.action_id)) fail();
      const resource=["key","row"].includes((events.find(e=>e.kind==="intent"&&e.action_id===event.action_id)!.payload as Intent).kind);
      if(cleanup_only&&event.kind!=="handoff"&&event.kind!=="observed-outcome"&&event.kind!=="retained-absence"&&!resource)fail();
      if(event.kind==="observed-outcome"&&(!cleanup_only||resource))fail();
      if (event.kind === "retained-absence") {
        if (events.some(previous => previous.action_id === event.action_id && (isOutcome(previous) || previous.kind === "retained-absence"))) fail();
        retainedLookup(config, header, directory, events.find(previous => previous.kind === "intent" && previous.action_id === event.action_id)!.payload as Intent, event.payload as RetainedAbsence);
      } else if (event.kind === "resource") {
        exact(event.payload, ["resource_id"]);
        if (!identifier((event.payload as { resource_id: string }).resource_id) || events.some(e => e.kind === "resource" && e.action_id === event.action_id) ||
            !["key", "row"].includes((events.find(e => e.kind === "intent" && e.action_id === event.action_id)!.payload as Intent).kind)) fail();
      } else if (event.kind === "outcome" || event.kind==="observed-outcome") {
        validateReceipt(event.payload as Receipt);
        if (events.some(e => (isOutcome(e) || e.kind === "retained-absence") && e.action_id === event.action_id)) fail();
      } else if (event.kind === "handoff") {
        exact(event.payload, ["reason_code"]); if (!identifier((event.payload as { reason_code: string }).reason_code)) fail();
      } else fail();
    }
    events.push(event); previous = digest(event);
  }
  const policy_current=effective.settings_digest===bindings.settings_digest&&effective.policy_digest===bindings.policy_digest;
  if(!policy_current&&!options.inspect)fail();
  return { policy_current, cleanup_only, retired, directory, config, header, events, revision: events.length, digest: previous };
}
type Registration = { run_id: string; directory: string; batch_digest: string; header_digest: string };
function registryDirectory(config: Settings, create = false): string | null {
  const path = join(inputBindings(config).common_dir, "vh-adlc-audit-runs");
  if (create) { try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; } }
  let stat;
  try { stat = lstatSync(path); } catch (error) { if (!create && (error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path || (stat.mode & 0o077) || process.getuid && stat.uid !== process.getuid()) fail();
  return path;
}
/** Bind the durable header before any effects. A run ID cannot move to a new root. */
export function registerRun(config: Settings, directory: string, batch_digest: string) {
  const run = readRun(config, directory, batch_digest);
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(run.header.run_id)) fail();
  const registry = registryDirectory(config, true)!;
  if(run.retired||existsSync(join(registry,run.header.run_id+".retired.json")))fail();
  const registration: Registration = { run_id: run.header.run_id, directory, batch_digest, header_digest: digest(run.header) };
  const path = join(registry, registration.run_id + ".json");
  if (existsSync(path)) { if (canonicalJSON(privateJSON(path)) !== canonicalJSON(registration)) fail(); }
  else publishJSON(path, registration);
  return run;
}
function registrationFor(run:Run){
 const directory=registryDirectory(run.config);
 if(!directory||!(/^[a-z0-9][a-z0-9_-]{0,79}$/).test(run.header.run_id))fail();
 const registration=privateJSON(join(directory,run.header.run_id+".json")) as Registration;
 if(canonicalJSON(registration)!==canonicalJSON({run_id:run.header.run_id,directory:run.directory,batch_digest:run.header.batch_digest,header_digest:digest(run.header)}))fail();
 return {directory,registration};
}
export function requireRegistered(run:Run){
 const {directory}=registrationFor(run);
 if(run.retired||existsSync(join(directory,run.header.run_id+".retired.json")))fail();
}
type Retirement={schema_version:1;repository:string;hostname:string;run_id:string;directory:string;batch_digest:string;header_digest:string;previous_digest:string;final_digest:string;owner_handoff:string;zero_pending:true};
function readRetirement(config:Settings,registry:string,registration:Registration):Retirement|null{
 const path=join(registry,registration.run_id+".retired.json");if(!existsSync(path))return null;
 const value=privateJSON(path) as Retirement;
 exact(value,["schema_version","repository","hostname","run_id","directory","batch_digest","header_digest","previous_digest","final_digest","owner_handoff","zero_pending"]);
 if(value.schema_version!==1||value.repository!==config.repository||value.hostname!==config.hostname||value.zero_pending!==true||!identifier(value.owner_handoff)||
 [value.header_digest,value.previous_digest,value.final_digest].some(hash=>!(/^[a-f0-9]{64}$/).test(hash))||
 ["run_id","directory","batch_digest","header_digest"].some(key=>value[key as keyof Retirement]!==registration[key as keyof Registration]))fail();
 return value;
}
/** Scope changes never retire cleanup from an earlier registered run in this Git repository. */
export function registeredPending(config: Settings) {
  return registeredOutstanding(config).filter(row => ["key", "row"].includes(row.action.kind))
    .map(({ run_id, directory, batch_digest, policy_current, action }) => ({ run_id, directory, batch_digest, policy_current, action }));
}
/** Every unresolved effect matters at cutover, including deliberately retained non-resource absence. */
export function registeredOutstanding(config: Settings) {
  const registry = registryDirectory(config), rows: { run_id: string; directory: string; batch_digest: string; policy_current: boolean; action: Intent; disposition: "pending" | "retained-absence" }[] = [];
  if (!registry) return rows;
  const files = readdirSync(registry).filter(name => !name.startsWith(".tmp-"));
  for (const name of files.filter(name => name.endsWith(".retired.json"))) {
    if (!/^[a-z0-9][a-z0-9_-]{0,79}\.retired\.json$/.test(name) || !files.includes(name.replace(/\.retired\.json$/, ".json"))) fail();
  }
  for (const name of files.filter(name => !name.endsWith(".retired.json")).sort()) {
    if (!/^[a-z0-9][a-z0-9_-]{0,79}\.json$/.test(name)) fail();
    const registration = privateJSON(join(registry, name)) as Registration;
    exact(registration, ["run_id", "directory", "batch_digest", "header_digest"]);
    if (registration.run_id + ".json" !== name) fail();
    if (readRetirement(config, registry, registration)) continue;
    const run = readRun(config, registration.directory, registration.batch_digest, { inspect: true }); registrationFor(run);
    if (run.retired) continue;
    for (const event of run.events.filter(event => event.kind === "intent" && !run.events.some(done => isOutcome(done) && done.action_id === event.action_id))) {
      rows.push({ run_id: run.header.run_id, directory: run.directory, batch_digest: run.header.batch_digest, policy_current: run.policy_current, action: event.payload as Intent,
        disposition: run.events.some(observation => observation.kind === "retained-absence" && observation.action_id === event.action_id) ? "retained-absence" : "pending" });
    }
  }
  return rows;
}
/** Read-only recovery inventory remains available after valid policy edits. Never grants retry/cleanup authority. */
export function inspectPending(config: Settings, directory: string, batch_digest: string) {
  const run = readRun(config, directory, batch_digest, { inspect: true });
  const pending = run.events.filter(event => event.kind === "intent" && !run.events.some(done => isOutcome(done) && done.action_id === event.action_id)).map(event => {
    const action = event.payload as Intent;
    const resource = run.events.find(value => value.kind === "resource" && value.action_id === action.id)?.payload as { resource_id: string } | undefined;
    return { ...action, ...(resource ?? {}) };
  });
  let live_ready=false,readiness_handoff:string|null=hasRetainedAbsence(run)?"retained-absence-no-replay":run.policy_current?run.retired?"run-retired":run.cleanup_only?"reconciliation-only":null:"policy-changed";
  if(!readiness_handoff){
    try{requireRegistered(run);if(registeredPending(config).length)readiness_handoff="registered-cleanup-pending";else live_ready=true;}
    catch{readiness_handoff="registered-state-unknown-or-unregistered";}
  }
  return { policy_current: run.policy_current, cleanup_only:run.cleanup_only, retired:run.retired, journal_digest:run.digest, live_ready, readiness_handoff, pending,
    handoff: run.policy_current ? null : "policy-changed", limit: "Read-only pending-state inspection; this result grants no retry, cleanup or journal mutation. Current owner and transport authority are checked separately. Changed policy requires explicit cleanup reconciliation." };
}
function append(run: Run, kind: Event["kind"], action_id: string, payload: Event["payload"]) {
  const actual = readRun(run.config, run.directory, run.header.batch_digest);
  requireRegistered(actual);
  if (actual.digest !== run.digest) fail();
  if (hasRetainedAbsence(actual) && kind === "intent" || ["outcome", "observed-outcome"].includes(kind) && actual.events.some(event => event.kind === "retained-absence" && event.action_id === action_id)) fail();
  if(actual.cleanup_only&&(kind==="intent"||kind==="outcome"&&!actual.events.some(e=>e.kind==="intent"&&e.action_id===action_id&&["key","row"].includes((e.payload as Intent).kind))))fail();
  const event: Event = { revision: actual.revision + 1, previous: actual.digest, kind, action_id, payload };
  publishJSON(join(run.directory, "events", String(event.revision).padStart(8, "0") + ".json"), event);
  Object.assign(run, readRun(run.config, run.directory, run.header.batch_digest));
  requireRegistered(run);
}
export function pendingResources(run: Run) {
  return run.events.filter(e => e.kind === "intent" && ["key", "row"].includes((e.payload as Intent).kind) &&
    !run.events.some(done => isOutcome(done) && done.action_id === e.action_id));
}
/** Register the whole first-attempt resource plan before creating any resource. */
export function resourceIntents(run: Run, actions: Intent[]) {
  requireRegistered(run);
  if (run.cleanup_only || hasRetainedAbsence(run) || !Array.isArray(actions) || !actions.length || registeredPending(run.config).length) fail();
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
  if (!run.events.some(e => e.kind === "intent" && e.action_id === action_id) || run.events.some(e => isOutcome(e) && e.action_id === action_id)) fail();
  append(run, "outcome", action_id, receipt);
}
export function observedOutcome(run:Run,action_id:string,receipt:Receipt){
 validateReceipt(receipt);
 const action=run.events.find(e=>e.kind==="intent"&&e.action_id===action_id)?.payload as Intent|undefined;
 if(!run.cleanup_only||!action||["key","row"].includes(action.kind)||run.events.some(e=>isOutcome(e)&&e.action_id===action_id))fail();
 append(run,"observed-outcome",action_id,receipt);
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

/** Owner-attested handoff to current committed policy for cleanup only; no execution grant. */
export function reconcilePolicy(config:Settings,directory:string,batch_digest:string,request:{owner_approved:boolean;owner_handoff:string;expected_digest:string;policy_commit:string},options:{observe?:()=>{default_branch:string;default_commit:string}}={}) {
 exact(request,["owner_approved","owner_handoff","expected_digest","policy_commit"]);
 if(request.owner_approved!==true||!identifier(request.owner_handoff)||!(/^[a-f0-9]{64}$/).test(request.expected_digest)||!(/^[a-f0-9]{40,64}$/).test(request.policy_commit))fail();
 const run=readRun(config,directory,batch_digest,{inspect:true});requireRegistered(run);
 const previous=run.events.filter(event=>event.kind==="policy-transition").at(-1);
 if(run.digest!==request.expected_digest&&!(previous&&previous.previous===request.expected_digest))fail();
 if(git(config.root,"status","--porcelain","--",config.settings_path,config.project_procedure))fail();
 const bindings=inputBindings(config),observed=(options.observe??(()=>observeDefault(config)))();
 if(!(/^[a-f0-9]{40,64}$/).test(observed.default_commit))fail();
 git(config.root,"check-ref-format","refs/heads/"+observed.default_branch);
 git(config.root,"merge-base","--is-ancestor",request.policy_commit,observed.default_commit);
 git(config.root,"merge-base","--is-ancestor",request.policy_commit,"HEAD");
 if(git(config.root,"status","--porcelain","--",config.settings_path,config.project_procedure))fail();
 for(const [path,bound]of [[config.settings_path,bindings.settings_digest],[config.project_procedure,bindings.policy_digest]])
  if(hash(gitBytes(config.root,"show",request.policy_commit+":"+path))!==bound||hash(gitBytes(config.root,"show",observed.default_commit+":"+path))!==bound)fail();
 if(previous&&previous.previous===request.expected_digest&&run.policy_current&&(previous.payload as PolicyTransition).owner_handoff===request.owner_handoff&&(previous.payload as PolicyTransition).policy_commit===request.policy_commit)return readRun(config,directory,batch_digest);
 if(run.digest!==request.expected_digest||run.policy_current||!run.events.some(e=>e.kind==="intent"&&!run.events.some(done=>isOutcome(done)&&done.action_id===e.action_id)))fail();
 const old=previous?.payload as PolicyTransition|undefined;
 const payload:PolicyTransition={from_settings_digest:old?.settings_digest??run.header.settings_digest,from_policy_digest:old?.policy_digest??run.header.policy_digest,
  settings_digest:bindings.settings_digest,policy_digest:bindings.policy_digest,policy_commit:request.policy_commit,observed_default_branch:observed.default_branch,observed_default_commit:observed.default_commit,owner_handoff:request.owner_handoff,cleanup_only:true};
 const event:Event={revision:run.revision+1,previous:run.digest,kind:"policy-transition",action_id:"policy-transition",payload};
 publishJSON(join(directory,"events",String(event.revision).padStart(8,"0")+".json"),event);
 return readRun(config,directory,batch_digest);
}

/** Retire only a fully observed run. The final journal event serializes against competing intents. */
export function retireRun(config:Settings,directory:string,batch_digest:string,request:{owner_approved:boolean;owner_handoff:string;expected_digest:string}):Retirement{
 exact(request,["owner_approved","owner_handoff","expected_digest"]);
 if(request.owner_approved!==true||!identifier(request.owner_handoff)||!(/^[a-f0-9]{64}$/).test(request.expected_digest))fail();
 const id=basename(directory).replace(/^audit-run-/,""),registry=registryDirectory(config);
 if(!registry||!(/^[a-z0-9][a-z0-9_-]{0,79}$/).test(id))fail();
 const registration=privateJSON(join(registry,id+".json")) as Registration;
 exact(registration,["run_id","directory","batch_digest","header_digest"]);
 if(registration.run_id!==id||registration.directory!==directory||registration.batch_digest!==batch_digest)fail();
 const existing=readRetirement(config,registry,registration);
 if(existing){if(existing.owner_handoff!==request.owner_handoff||existing.previous_digest!==request.expected_digest)fail();return existing;}
 let run=readRun(config,directory,batch_digest,{inspect:true});registrationFor(run);
 let final=run.events.at(-1);
 if(!run.retired){
  if(run.digest!==request.expected_digest||run.events.some(e=>e.kind==="intent"&&!run.events.some(done=>isOutcome(done)&&done.action_id===e.action_id)))fail();
  const event:Event={revision:run.revision+1,previous:run.digest,kind:"retirement",action_id:"run-retirement",payload:{owner_handoff:request.owner_handoff,zero_pending:true}};
  publishJSON(join(directory,"events",String(event.revision).padStart(8,"0")+".json"),event);
  run=readRun(config,directory,batch_digest,{inspect:true});final=run.events.at(-1);
 }
 if(!final||final.kind!=="retirement"||final.previous!==request.expected_digest||(final.payload as RetireEvent).owner_handoff!==request.owner_handoff)fail();
 const value:Retirement={schema_version:1,repository:config.repository,hostname:config.hostname,...registration,previous_digest:final.previous,final_digest:run.digest,owner_handoff:request.owner_handoff,zero_pending:true};
 publishJSON(join(registry,id+".retired.json"),value);return value;
}
