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
  for (const permission of Object.values(record(value))) if (!["read", "write", "none"].includes(String(permission))) fail("permissions mapping");
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
  fields(scheduled.triggers, ["workflow_dispatch", "schedule"]);
  const schedule = scheduled.triggers.schedule;
  if (!Array.isArray(schedule) || schedule.length === 0) fail("scheduled trigger required");
  for (const entry of schedule) {
    const trigger = record(entry); fields(trigger, ["cron"]);
    if (typeof trigger.cron !== "string" || trigger.cron.trim().split(/\s+/u).length !== 5) fail("literal scheduled cron required");
  }
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
