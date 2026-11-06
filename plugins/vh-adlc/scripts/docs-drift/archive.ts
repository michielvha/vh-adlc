import { decodeUTF8, sha256 } from "./protocol";
import type { ArchiveLimits } from "./zip-reader";

function json(bytes: Buffer): Record<string, unknown> {
  const parsed: unknown = JSON.parse(decodeUTF8(bytes));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid docs-drift archive JSON object");
  return parsed as Record<string, unknown>;
}

export async function readReportArchive(bytes: Uint8Array, expected: { sha256: string; size: number }, limits: ArchiveLimits) {
  if (!Number.isSafeInteger(expected.size) || expected.size !== bytes.byteLength) throw new Error("docs-drift archive API size mismatch");
  if (!/^[a-f0-9]{64}$/u.test(expected.sha256) || sha256(bytes) !== expected.sha256) throw new Error("docs-drift archive API digest mismatch");
  let reader: typeof import("./vendor/zip-reader.cjs");
  try {
    reader = await import("./vendor/zip-reader.cjs");
    if (typeof reader.readEntries !== "function") throw new Error("missing reader");
  } catch { throw new Error("docs-drift archive bundle unavailable or corrupt; run verified setup"); }
  const entries = await reader.readEntries(bytes, limits);
  return { report: json(entries.report), provenance: json(entries.provenance),
    report_bytes: entries.report, provenance_bytes: entries.provenance,
    report_sha256: sha256(entries.report), provenance_sha256: sha256(entries.provenance) };
}
