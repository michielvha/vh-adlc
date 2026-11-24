import { collectionReaders } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { canonicalJSON, protocolPath } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

function fail(reason: string): never { throw Error("incomplete docs-drift worker caller " + reason); }
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("object required");
  canonicalJSON(value);
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail("unknown field");
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
  record(root.on);
  return { root, job };
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
