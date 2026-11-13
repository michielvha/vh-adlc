import { exactRecord } from "./publication-decisions";
import { parseWorkerPublication } from "./publication-proposal";
import { canonicalJSON, freezeJSON, protocolPath } from "./protocol";
import { parseEdit } from "./resolve";

type Options = { source: string; input_sha256: string; max_entry_bytes: number; records: string };

/** Parse original native worker records. Artifact contents and current source are verified by the controller. */
export function parseWorkerHandoff(options: Options) {
  if (!Number.isSafeInteger(options.max_entry_bytes) || options.max_entry_bytes < 1
    || Buffer.byteLength(options.records, "utf8") > options.max_entry_bytes) throw Error("Bounded original worker handoff required");
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(options.source) || !/^[a-f0-9]{64}$/u.test(options.input_sha256))
    throw Error("Original worker source and input target required");
  const parsed: unknown = JSON.parse(options.records);
  const hasAssessment = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) && Object.hasOwn(parsed, "assessment");
  const packet = exactRecord(parsed, ["input_sha256", "edits", "publication", ...(hasAssessment ? ["assessment"] : [])], "Original worker handoff fields changed");
  if (packet.input_sha256 !== options.input_sha256 || !Array.isArray(packet.edits)) throw Error("Original worker input target changed");
  const edits = packet.edits.map(parseEdit), publication = parseWorkerPublication(packet.publication);
  if (!canonicalJSON(packet.edits).equals(canonicalJSON(edits))) throw Error("Original worker edit representation changed");
  let assessment: { path: string; sha256: string } | null = null;
  if (hasAssessment) {
    const reference = exactRecord(packet.assessment, ["path", "sha256"], "Original worker assessment reference required");
    const path = protocolPath(reference.path);
    if (typeof reference.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(reference.sha256)) throw Error("Original worker assessment digest required");
    assessment = { path, sha256: reference.sha256 };
  }
  return freezeJSON({ selection: { schema_version: 1 as const, source_commit: options.source, edits }, publication, assessment_reference: assessment });
}
