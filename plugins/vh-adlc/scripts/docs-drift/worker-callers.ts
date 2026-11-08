import { collectionReaders } from "./git";
import { canonicalDigest, canonicalJSON, freezeJSON, protocolPath, sha256 } from "./protocol";

type Literal = string | number | boolean;
type Difference = { trial: Literal; scheduled: Literal };
function fail(reason: string): never { throw Error("incomplete docs-drift worker caller " + reason); }
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("object required");
  canonicalJSON(value);
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail("unknown field");
}
function literal(value: unknown): Literal {
  if ((typeof value === "string" && !value.includes("${{")) || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))) return value;
  fail("bound input must be literal");
}
function permissions(value: unknown): void {
  if (value === undefined) return;
  for (const permission of Object.values(record(value))) if (typeof permission !== "string" || !["read", "write", "none"].includes(permission)) fail("permissions mapping");
}
function caller(bytes: Uint8Array, worker: string) {
  const root = record(collectionReaders().yaml(bytes));
  fields(root, ["name", "run-name", "on", "permissions", "concurrency", "env", "jobs"]);
  const jobs = record(root.jobs), ids = Object.keys(jobs);
  if (ids.length !== 1 || !/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(ids[0])) fail("one worker job required");
  const job = record(jobs[ids[0]]);
  fields(job, ["name", "uses", "with", "secrets", "permissions", "if", "needs", "strategy", "concurrency"]);
  if (job.uses !== "./" + worker) fail("selected committed worker");
  permissions(root.permissions); permissions(job.permissions);
  if (job.secrets !== undefined) {
    for (const [name, value] of Object.entries(record(job.secrets))) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name) || typeof value !== "string"
        || !/^\$\{\{\s*secrets\.[A-Za-z_][A-Za-z0-9_]*\s*\}\}$/u.test(value)) fail("explicit secret-name mappings required");
    }
  }
  const inputs = record(job.with);
  for (const value of Object.values(inputs)) {
    if (!["string", "number", "boolean"].includes(typeof value)) fail("scalar workflow input required");
  }
  return { root, job, inputs, triggers: record(root.on) };
}

function scheduledTriggers(triggers: Record<string, unknown>): void {
  fields(triggers, ["workflow_dispatch", "schedule"]);
  const schedule = triggers.schedule;
  if (!Array.isArray(schedule) || schedule.length === 0) fail("scheduled trigger required");
  for (const entry of schedule) {
    const trigger = record(entry); fields(trigger, ["cron"]);
    if (typeof trigger.cron !== "string" || trigger.cron.trim().split(/\s+/u).length !== 5) fail("literal scheduled cron required");
  }
}

/** Matching callers must also agree with the configured effective permissions and secret names. */
export function verifyConfiguredWorkerCaller(options: {
  bytes: Uint8Array; worker_path: string; permissions: Record<string, string>; secret_mappings: Record<string, string>;
}): void {
  const selected = caller(options.bytes, protocolPath(options.worker_path));
  const effective = selected.job.permissions ?? selected.root.permissions;
  if (effective === undefined || !canonicalJSON(effective).equals(canonicalJSON(options.permissions))) fail("configured caller permissions differ");
  const mappings = Object.fromEntries(Object.entries(record(selected.job.secrets ?? {})).map(([name, value]) => {
    const match = typeof value === "string" && /^\$\{\{\s*secrets\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/u.exec(value);
    if (!match) fail("configured caller secret mapping");
    return [name, match[1]];
  }));
  if (!canonicalJSON(mappings).equals(canonicalJSON(options.secret_mappings))) fail("configured caller secret names differ");
}

/** Compare complete committed callers. This proof grants no effect or adoption readiness. */
export function verifyWorkerCallers(options: {
  trial: Uint8Array; scheduled: Uint8Array; worker_path: string; component_pin: string; production_pr_draft: boolean;
  input_differences: Record<string, Difference>;
}) {
  const worker = protocolPath(options.worker_path), pin = protocolPath(options.component_pin);
  if (!pin.endsWith(".yaml")) fail("component pin path");
  if (!/^\.github\/workflows\/[^/]+\.ya?ml$/u.test(worker) || typeof options.production_pr_draft !== "boolean") fail("worker path or draft policy");
  const trial = caller(options.trial, worker), scheduled = caller(options.scheduled, worker);
  if (Object.keys(trial.triggers).length !== 1 || !Object.hasOwn(trial.triggers, "workflow_dispatch")) fail("trial must be dispatch-only");
  scheduledTriggers(scheduled.triggers);
  for (const selected of [trial, scheduled]) {
    if (Object.hasOwn(selected.triggers, "workflow_dispatch") && selected.triggers.workflow_dispatch !== null) record(selected.triggers.workflow_dispatch);
  }
  if (trial.inputs.component_pin !== pin || scheduled.inputs.component_pin !== pin) fail("selected component pin differs");
  if (trial.inputs.pr_draft !== true || scheduled.inputs.pr_draft !== options.production_pr_draft) fail("typed trial/production draft policy");
  const differences = record(options.input_differences);
  for (const [name, value] of Object.entries(differences)) {
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(name) || ["pr_draft", "component_pin"].includes(name)) fail("declared fixture input name");
    const difference = record(value); fields(difference, ["trial", "scheduled"]);
    if (trial.inputs[name] !== literal(difference.trial) || scheduled.inputs[name] !== literal(difference.scheduled)) fail("declared fixture input value");
    delete trial.inputs[name]; delete scheduled.inputs[name];
  }
  delete trial.root.on; delete scheduled.root.on;
  delete trial.inputs.pr_draft; delete scheduled.inputs.pr_draft;
  if (!canonicalJSON(trial.root).equals(canonicalJSON(scheduled.root))) fail("protected caller contract differs");
  return freezeJSON({ worker_path: worker, trial_sha256: sha256(options.trial), scheduled_sha256: sha256(options.scheduled),
    contract_sha256: canonicalDigest({ caller: scheduled.root, input_differences: differences, production_pr_draft: options.production_pr_draft }) });
}


/** The compatible route permits the exact pin selector change in an otherwise identical caller. */
export function verifyCompatibleWorkerCaller(options: {
  previous: Uint8Array; next: Uint8Array; worker_path: string; previous_component_pin: string; next_component_pin: string;
}) {
  const worker = protocolPath(options.worker_path), previousPin = protocolPath(options.previous_component_pin), nextPin = protocolPath(options.next_component_pin);
  if (!/^\.github\/workflows\/[^/]+\.ya?ml$/u.test(worker) || !previousPin.endsWith(".yaml") || !nextPin.endsWith(".yaml")
    || previousPin === nextPin) fail("distinct immutable component pins required");
  const previous = caller(options.previous, worker), next = caller(options.next, worker);
  scheduledTriggers(previous.triggers); scheduledTriggers(next.triggers);
  if (typeof previous.inputs.pr_draft !== "boolean" || typeof next.inputs.pr_draft !== "boolean") fail("typed compatible PR state required");
  if (previous.inputs.component_pin !== previousPin || next.inputs.component_pin !== nextPin) fail("compatible selected pin differs");
  delete previous.inputs.component_pin; delete next.inputs.component_pin;
  if (!canonicalJSON(previous.root).equals(canonicalJSON(next.root))) fail("compatible caller fields changed");
  return freezeJSON({ previous_sha256: sha256(options.previous), next_sha256: sha256(options.next), contract_sha256: canonicalDigest(previous.root) });
}
