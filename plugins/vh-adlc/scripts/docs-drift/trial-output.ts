import { OUTPUT_LIMIT } from "./owned-process";

export class TrialEntryOutputBound extends Error {}

/** Bound the exact full synthetic stdout envelope, including UTF-8 bytes and its newline. */
export function encodeTrialEntryReport(report: Record<string, unknown>, limit: number): Buffer {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > OUTPUT_LIMIT) throw Error("Synthetic entry output limit required");
  const bytes = Buffer.from(JSON.stringify(report) + "\n");
  if (bytes.length > limit) throw new TrialEntryOutputBound("Synthetic entry report exceeds the retained entry bound");
  return bytes;
}


/** Preserve observed effect state and the original recovery locator when report delivery fails. */
export function trialEffectFailure(original: Record<string, unknown>, code: "synthetic-output-bound-after-effects" | "synthetic-report-after-effects", limit: number) {
  const data = original.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw Error("Original synthetic effect metadata required");
  const row = data as Record<string, unknown>;
  if (typeof row.state !== "string" || typeof row.operation_id !== "string" || typeof row.journal_directory !== "string")
    throw Error("Original synthetic recovery locator required");
  const kept = { state: row.state, reason: typeof row.reason === "string" && row.reason.length <= 128 ? row.reason : null,
    operation_id: row.operation_id, journal_directory: row.journal_directory,
    revision: typeof row.revision === "number" && Number.isSafeInteger(row.revision) ? row.revision : null, details_omitted: true,
    ...(row.authority === "none" ? { authority: "none" as const } : {}),
    ...(row.replay_authority === false ? { replay_authority: false as const } : {}) };
  const diagnostics = [{ code, message: "Report delivery failed after effect processing. Inspect the original retained journal" }];
  const { receipt_path: _unconfirmedReceipt, ...context } = original;
  let report: Record<string, unknown> = { ...context, outcome: "incomplete", data: kept, diagnostics };
  try { return { report, encoded: encodeTrialEntryReport(report, limit) }; }
  catch (error) { if (!(error instanceof TrialEntryOutputBound)) throw error; }
  report = { schema_version: 1, kind: "docs-drift-synthetic-entry", evidence_kind: "synthetic", transport: "collector",
    command: original.command, outcome: "incomplete", data: { ...kept, reason: null }, diagnostics };
  try { return { report, encoded: encodeTrialEntryReport(report, limit) }; }
  catch (error) { if (!(error instanceof TrialEntryOutputBound)) throw error; }
  // A configured bound too small for recovery metadata uses the global failure bound and keeps the locator.
  report.configured_report_bound_exceeded = true;
  return { report, encoded: encodeTrialEntryReport(report, OUTPUT_LIMIT) };
}


/** Check the minimum recoverable effect handoff before an entry may mutate its fixture. */
export function assertTrialEffectCapacity(input: { command: string; operation_id: string; journal_directory: string; limit: number }): void {
  const checked = trialEffectFailure({ schema_version: 1, kind: "docs-drift-synthetic-entry", evidence_kind: "synthetic", transport: "collector", command: input.command, data: { state: "acknowledged", reason: null,
    operation_id: input.operation_id, journal_directory: input.journal_directory, revision: Number.MAX_SAFE_INTEGER,
    authority: "none", replay_authority: false } }, "synthetic-output-bound-after-effects", input.limit);
  if (checked.report.configured_report_bound_exceeded === true) throw Error("Configured output bound cannot retain trial recovery metadata");
}
