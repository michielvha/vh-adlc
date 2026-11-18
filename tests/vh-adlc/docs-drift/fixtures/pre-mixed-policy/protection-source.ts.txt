import { readDocumentMetadata } from "../docs-impact/collection";
import type { ProtectionContext } from "./protection";
import { canonicalDigest, protocolPath, sha256 } from "./protocol";
import type { Snapshot } from "./snapshot";

/** Load data-only protection declarations from the immutable consumer procedure. No coordination grants. */
export function sourceProtection(snapshot: Snapshot, yaml: (bytes: Uint8Array) => unknown): ProtectionContext {
  const procedure = snapshot.blobs.find(blob => blob.path === snapshot.settings.project_procedure);
  if (!procedure) throw Error("Project protection procedure unavailable");
  const declared = readDocumentMetadata(procedure.bytes, yaml)?.docs_drift_protection;
  if (declared === undefined) return {};
  function record(value: unknown, keys: string[], optional = false): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some(key => !keys.includes(key))
      || !optional && Object.keys(value).length !== keys.length) throw Error("Project protection fields changed");
    return value as Record<string, unknown>;
  }
  function rows(value: unknown): unknown[] {
    if (!Array.isArray(value) || value.length > 1000) throw Error("Project protection inventory required");
    return value;
  }
  function document(row: Record<string, unknown>) {
    const path = protocolPath(row.document), blob = snapshot.blobs.find(blob => blob.path === path);
    if (!blob || !["100644", "100755"].includes(blob.mode) || row.document_sha256 !== sha256(blob.bytes))
      throw Error("Project protection document differs from its committed bytes");
    return { path, blob };
  }
  const policy = record(declared, ["local_ranges", "other_writers", "document_kinds"], true), context: ProtectionContext = {};
  const digest = sha256(procedure.bytes), procedureEvidence = { procedure_sha256: digest,
    procedure_quote: { start: 0, end: procedure.bytes.length, sha256: digest } };
  if (Object.hasOwn(policy, "local_ranges")) context.local_ranges = rows(policy.local_ranges).map(value => {
    const row = record(value, ["document", "document_sha256", "ranges"]), { path, blob } = document(row);
    const ranges = rows(row.ranges).map(value => {
      const range = record(value, ["start", "end"]), start = range.start, end = range.end;
      if (typeof start !== "number" || typeof end !== "number" || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
        || start < 0 || end < start || end > blob.bytes.length) throw Error("Project protection byte range invalid");
      return { start, end };
    });
    if (new Set(ranges.map(canonicalDigest)).size !== ranges.length) throw Error("Duplicate project protection byte range");
    return { document: path, document_sha256: sha256(blob.bytes), ranges, ...procedureEvidence };
  });
  if (Object.hasOwn(policy, "other_writers")) context.other_writers = rows(policy.other_writers).map(value => {
    const row = record(value, ["writer", "document", "document_sha256"]), { path, blob } = document(row);
    if (typeof row.writer !== "string" || !row.writer.trim()) throw Error("Project protection writer required");
    return { writer: row.writer, document: path, document_sha256: sha256(blob.bytes) };
  });
  if (Object.hasOwn(policy, "document_kinds")) context.document_kinds = rows(policy.document_kinds).map(value => {
    const row = record(value, ["document", "document_sha256", "kind"]), { path, blob } = document(row), kind = row.kind;
    if (kind !== "ordinary" && kind !== "plan" && kind !== "review" && kind !== "evidence" && kind !== "unknown")
      throw Error("Project protection document kind invalid");
    return { document: path, document_sha256: sha256(blob.bytes), kind };
  });
  for (const items of [context.local_ranges, context.other_writers, context.document_kinds]) {
    const keys = items?.map(item => canonicalDigest([item.document, "writer" in item ? item.writer : null])) ?? [];
    if (new Set(keys).size !== keys.length) throw Error("Duplicate project protection declaration");
  }
  return context;
}
