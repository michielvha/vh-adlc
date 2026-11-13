import { collectionReaders } from "./git";
import { compareUTF8, freezeJSON, protocolPath } from "./protocol";

type JobContract = { name: string; steps: string[] };
export type HistoryWorkflowContract = {
  job_name: string; attention_step: string; required_steps: string[]; required_jobs: JobContract[];
};
function fail(reason: string): never { throw Error("incomplete docs-drift history workflow " + reason); }
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("mapping required");
  return value as Record<string, unknown>;
}
function name(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.includes("${{") || /[\u0000-\u001f\u007f]/u.test(value))
    fail("literal native display name required");
  return value;
}

/** Read native display identities only from the already protected workflow blobs. No report supplies them. */
export function readHistoryWorkflowContract(input: { scheduled: Uint8Array; worker: Uint8Array; worker_path: string }): HistoryWorkflowContract {
  try {
    const caller = object(collectionReaders().yaml(input.scheduled)), worker = object(collectionReaders().yaml(input.worker));
    const callers = Object.entries(object(caller.jobs));
    if (callers.length !== 1) fail("one committed caller required");
    const [callerID, rawCaller] = callers[0], selected = object(rawCaller);
    if (selected.uses !== "./" + protocolPath(input.worker_path) || selected.strategy !== undefined) fail("selected reusable worker required");
    if (!Object.hasOwn(object(worker.on), "workflow_call")) fail("reusable worker trigger required");
    const prefix = name(selected.name ?? callerID), required_jobs: JobContract[] = [];
    let producer: { job_name: string; attention_step: string; required_steps: string[] } | null = null;
    for (const [id, value] of Object.entries(object(worker.jobs))) {
      const job = object(value);
      if (job.strategy !== undefined || job.uses !== undefined || !Array.isArray(job.steps) || !job.steps.length)
        fail("literal executable worker job required");
      const jobName = prefix + " / " + name(job.name ?? id), steps: string[] = [], ids = new Set<string>();
      for (const rawStep of job.steps) {
        const step = object(rawStep), stepName = name(step.name);
        if (steps.includes(stepName)) fail("duplicate native step name");
        steps.push(stepName);
        if (step.id !== undefined) {
          const stepID = name(step.id);
          if (ids.has(stepID)) fail("duplicate native step ID");
          ids.add(stepID);
          if (stepID === "docs-drift-attention") {
            if (producer) fail("ambiguous attention producer");
            producer = { job_name: jobName, attention_step: stepName, required_steps: steps };
          }
        }
      }
      if (required_jobs.some(existing => existing.name === jobName)) fail("duplicate native job name");
      required_jobs.push({ name: jobName, steps });
    }
    if (!producer) fail("attention status step required");
    required_jobs.sort((left, right) => compareUTF8(left.name, right.name));
    return freezeJSON({ ...producer, required_jobs });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("incomplete docs-drift history workflow ")) throw error;
    fail("protected workflow unavailable or malformed");
  }
}
