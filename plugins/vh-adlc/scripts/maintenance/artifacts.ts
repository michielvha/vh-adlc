import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appendRun, canonicalJSON, digest, privateDirectory, publishJSON, readRun, runID, type JSONObject } from "./journal";
import { portableObservations } from "./report";
import type { Inventory } from "./collect";

function fail(message: string): never { throw Error(`maintenance artifact: ${message}`); }
function inspect(path: string, expected: string) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || digest(readFileSync(path)) !== expected) fail("private artifact changed or unsafe");
  try { const text = readFileSync(path, "utf8"), value = JSON.parse(text); if (`${canonicalJSON(value)}\n` !== text) fail("noncanonical artifact"); return value; }
  catch { fail("corrupt artifact"); }
}
import type { Settings } from "./types";
function persist(config: Settings, id: string, step: string, category: "collections" | "pending-outcomes", payload: JSONObject) {
  let run = readRun(config, id); step = runID(step);
  const directory = privateDirectory(run.run_dir, [category], true), path = join(directory, `${step}.json`);
  const value = { schema_version: 1, run_id: run.header.run_id, step_id: step, ...payload }, hash = digest(`${canonicalJSON(value)}\n`);
  let operation = run.state.operations.find(op => op.kind === "artifact" && op.step_id === step);
  if (operation && (operation.path !== path || operation.digest !== hash)) fail("step ID payload conflict");
  if (!operation) {
    operation = { kind: "artifact", category, step_id: step, path, digest: hash, state: "intent", ...(category === "pending-outcomes" ? { pending_payload: payload } : {}) };
    run = appendRun(config, id, run, { ...run.state, operations: [...run.state.operations, operation] }, "intent");
  }
  if (existsSync(path)) inspect(path, hash); else publishJSON(path, value);
  if (operation.state !== "receipt") run = appendRun(config, id, run, { ...run.state,
    operations: run.state.operations.map(op => op.kind === "artifact" && op.step_id === step ? { ...op, state: "receipt" } : op) }, "receipt");
  return { run, path, digest: hash, step_id: step, value };
}
export function storeCollection(config: Settings, id: string, inventory: Inventory, step: string) {
  let run = readRun(config, id);
  if (inventory.schema_version !== 1 || inventory.repository !== run.header.repository || inventory.hostname !== run.header.hostname || canonicalJSON(inventory.scope) !== canonicalJSON(run.header.scope)) fail("collection scope mismatch");
  portableObservations(run, inventory);
  const saved = persist(config, id, step, "collections", { kind: "collection", inventory: inventory as unknown as JSONObject }); run = saved.run;
  const reference = { path: saved.path, digest: saved.digest, inventory_digest: digest(canonicalJSON(inventory)), step_id: saved.step_id, source_commit: inventory.source_commit, collected_at: inventory.collected_at };
  if (canonicalJSON(run.state.collection) !== canonicalJSON(reference)) appendRun(config, id, run, { ...run.state, collection: reference }, "receipt");
  return reference;
}
export type Outcome = { step_id: string; at: string; append: string; status?: string; status_description?: string };
export function capturePendingOutcome(config: Settings, id: string, outcome: Outcome) {
  const initial = readRun(config, id); runID(outcome.step_id);
  if (Object.keys(outcome).some(key => !["step_id", "at", "append", "status", "status_description"].includes(key)) || !Number.isFinite(Date.parse(outcome.at)) || typeof outcome.append !== "string" || !outcome.append.trim()) fail("invalid pending outcome");
  for (const scalar of [outcome.status, outcome.status_description]) if (scalar !== undefined && (typeof scalar !== "string" || /[\r\n\0]/.test(scalar))) fail("invalid status scalar");
  if (typeof initial.state.report?.digest !== "string") fail("prior report binding required");
  const prior = initial.state.pending_outcomes.find(row => row.step_id === outcome.step_id);
  const earlier = initial.state.operations.find(op => op.kind === "artifact" && op.step_id === outcome.step_id);
  let priorDigest = initial.state.report.digest;
  if (earlier && typeof earlier.path === "string" && typeof earlier.digest === "string") {
    if (earlier.category !== "pending-outcomes" || earlier.path !== join(initial.run_dir, "pending-outcomes", `${outcome.step_id}.json`)) fail("pending intent path/category conflict");
    if (existsSync(earlier.path)) priorDigest = inspect(earlier.path, earlier.digest).prior_report_digest;
    else if (earlier.pending_payload && typeof earlier.pending_payload === "object" && !Array.isArray(earlier.pending_payload) && typeof earlier.pending_payload.prior_report_digest === "string") priorDigest = earlier.pending_payload.prior_report_digest;
    else fail("interrupted outcome lacks its original payload; recovery required");
  }
  const payload = { kind: "pending-outcome", at: outcome.at, ordered_append_text: outcome.append, status: outcome.status ?? null, status_description: outcome.status_description ?? null, prior_report_digest: priorDigest };
  const saved = persist(config, id, outcome.step_id, "pending-outcomes", { ...payload, payload_digest: digest(canonicalJSON(payload)) });
  const reference = { step_id: outcome.step_id, path: saved.path, digest: saved.digest, prior_report_digest: priorDigest, state: "pending" };
  if (!prior) {
    const order = saved.run.state.operations.filter(op => op.kind === "artifact" && op.category === "pending-outcomes").map(op => op.step_id);
    const references = [...saved.run.state.pending_outcomes, reference].sort((a, b) => order.indexOf(a.step_id) - order.indexOf(b.step_id));
    appendRun(config, id, saved.run, { ...saved.run.state, pending_outcomes: references }, "receipt");
  }
  return reference;
}
export function pendingOutcomes(config: Settings, id: string) {
  const run = readRun(config, id);
  const rows = run.state.operations.filter(op => op.kind === "artifact" && op.category === "pending-outcomes").map(operation =>
    run.state.pending_outcomes.find(row => row.step_id === operation.step_id) ?? { step_id: operation.step_id, path: operation.path, digest: operation.digest, state: "intent" });
  if (run.state.pending_outcomes.some(reference => !rows.some(row => row.step_id === reference.step_id))) fail("pending reference has no operation intent");
  return rows.map(row => {
    const step = runID(row.step_id), path = join(run.run_dir, "pending-outcomes", `${step}.json`);
    if (row.path !== path || typeof row.digest !== "string") fail("pending reference path mismatch");
    const operation = run.state.operations.find(op => op.kind === "artifact" && op.step_id === step);
    const value = existsSync(path) ? inspect(path, row.digest) : operation?.pending_payload ? { schema_version: 1, run_id: run.header.run_id, step_id: step, ...(operation.pending_payload as JSONObject) } : fail("pending artifact/payload missing");
    if (digest(`${canonicalJSON(value)}\n`) !== row.digest) fail("pending intent payload digest mismatch");
    const { schema_version, run_id, step_id, payload_digest, ...payload } = value;
    if (schema_version !== 1 || run_id !== run.header.run_id || step_id !== step || payload.kind !== "pending-outcome" || payload_digest !== digest(canonicalJSON(payload))) fail("pending outcome identity/digest mismatch");
    return { reference: row, outcome: value };
  });
}
