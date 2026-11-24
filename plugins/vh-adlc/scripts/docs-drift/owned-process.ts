import { runOwnedClient, ownedClientCompleted, OUTPUT_LIMIT, type OwnedResult } from "../triage/owned-process";

export { OUTPUT_LIMIT, outputSize, ownedClientCompleted } from "../triage/owned-process";
export type OwnedProcess = {
  pid: number; exit_code: number | null; timed_out: boolean; cancelled: string | null; output_limit: boolean; reaped: boolean;
  captured?: { stdout: Uint8Array; stderr: Uint8Array };
} & Partial<Pick<OwnedResult, "confirmed" | "group_absent" | "survivors" | "boundary" | "signals">>;

/** Read historical process records with their original guarantees. Current execution uses ownedClientCompleted. */
export function recordedProcessCompleted(value: unknown, expectedExit = 0): value is OwnedProcess {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  const cleanupFields = ["confirmed", "group_absent", "survivors", "boundary", "signals"];
  const hasCleanup = cleanupFields.some(key => Object.hasOwn(result, key));
  const fields = ["pid", "exit_code", "timed_out", "cancelled", "output_limit", "reaped", ...(hasCleanup ? cleanupFields : [])];
  if (Object.keys(result).length !== fields.length || fields.some(key => !Object.hasOwn(result, key))
    || typeof result.pid !== "number" || !Number.isSafeInteger(result.pid) || result.pid < 1) return false;
  if (hasCleanup) {
    if (!ownedClientCompleted(result, expectedExit) || !Array.isArray(result.signals)) return false;
    return result.signals.every((entry: unknown) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return false;
      const signal = entry as Record<string, unknown>;
      return Object.keys(signal).every(key => ["signal", "accepted", "error"].includes(key))
        && (signal.signal === "SIGTERM" || signal.signal === "SIGKILL") && typeof signal.accepted === "boolean"
        && (signal.error === undefined || typeof signal.error === "string");
    });
  }
  return result.exit_code === expectedExit && Number.isSafeInteger(result.exit_code)
    && result.reaped === true && result.timed_out === false && result.cancelled === null && result.output_limit === false;
}

/** Adapt docs-drift's existing process contract to the shared owned client runner. */
export async function executeOwnedProcess(options: {
  argv: string[]; cwd: string; env: Record<string, string>; watched_outputs: string[];
  stdout: string; stderr: string; capture?: "memory"; timeout_ms: number; max_output_bytes?: number; started: (pid: number) => void | false;
}): Promise<OwnedProcess> {
  if (!Number.isSafeInteger(options.timeout_ms) || options.timeout_ms < 1) throw Error("invalid owned process bounds");
  const cancellation = new AbortController();
  const interrupt = () => cancellation.abort("SIGINT");
  const terminate = () => cancellation.abort("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  try {
    const result = await runOwnedClient(options.argv, {
      cwd: options.cwd, env: options.env, stdout: options.stdout, stderr: options.stderr,
      capture: options.capture, watchedOutputs: options.watched_outputs,
      maxOutputBytes: options.max_output_bytes ?? OUTPUT_LIMIT, started: options.started, signal: cancellation.signal,
    }, { timeout_ms: options.timeout_ms, grace_ms: 200, reap_ms: 2000 });
    return { ...result, exit_code: result.reaped ? result.exit_code : null };
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}
