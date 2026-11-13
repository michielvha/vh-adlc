import { OUTPUT_LIMIT } from "./owned-process";

/** Bound the exact full synthetic stdout envelope, including UTF-8 bytes and its newline. */
export function encodeTrialEntryReport(report: Record<string, unknown>, limit: number): Buffer {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > OUTPUT_LIMIT) throw Error("Synthetic entry output limit required");
  const bytes = Buffer.from(JSON.stringify(report) + "\n");
  if (bytes.length > limit) throw Error("Synthetic entry report exceeds the retained entry bound");
  return bytes;
}
