import { join } from "node:path";
import { readBoundArtifact } from "./evidence-input";
import { exactRecord } from "./publication-decisions";
import { canonicalJSON, decodeUTF8, freezeJSON, protocolPath, sha256 } from "./protocol";
import { loadCommittedSettings } from "./settings";
import { artifactDirectoryScope } from "./snapshot";
import { parseEdit } from "./resolve";
import type { ProtectionContext } from "./protection";

type Options = {
  repo: string; source: string; artifact_root: string; candidate_repo?: string;
  selection: unknown; reference?: unknown;
};
type Coordinated = NonNullable<ProtectionContext["coordinated"]>;
const reason = "Coordinated selection";

/** Read an exact current-owner overlap attestation. It grants no feature-document or remote-write exception. */
export function readCoordinatedSelection(options: Options): Coordinated {
  if (options.reference === undefined || options.reference === null) return freezeJSON([]);
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(options.source)) throw Error(reason + " immutable source required");
  const { settings } = loadCommittedSettings(options.repo, options.source);
  const scope = artifactDirectoryScope(options.artifact_root, options.repo);
  const secondary = options.candidate_repo ? artifactDirectoryScope(scope.directory, options.candidate_repo) : null;
  const read = (reference: unknown) => {
    if (secondary) {
      const item = exactRecord(reference, ["path", "sha256"], reason + " artifact reference required");
      if (typeof item.path !== "string") throw Error(reason + " artifact path required");
      secondary.assertExternal(join(scope.directory, protocolPath(item.path)));
    }
    const bytes = readBoundArtifact({ source_repo: options.repo, artifact_root: scope.directory, reference });
    if (bytes.length > settings.reports.max_entry_bytes) throw Error(reason + " artifact exceeds configured bound");
    return bytes;
  };
  const selection = exactRecord(options.selection, ["schema_version", "source_commit", "edits"], reason + " exact actions required");
  if (selection.schema_version !== 1 || selection.source_commit !== options.source || !Array.isArray(selection.edits))
    throw Error(reason + " exact source and actions required");
  const documents = new Set(selection.edits.map(edit => parseEdit(edit).path));
  const selectedHash = sha256(canonicalJSON(selection)), bytes = read(options.reference);
  const packet = exactRecord(JSON.parse(decodeUTF8(bytes)), ["schema_version", "kind", "repository", "source_commit", "selection_sha256", "overlaps", "origin"], reason + " fields changed");
  if (!canonicalJSON(packet).equals(bytes) || packet.schema_version !== 1 || packet.kind !== "docs-drift-coordinated-selection"
    || packet.repository !== settings.repository || packet.source_commit !== options.source || packet.selection_sha256 !== selectedHash
    || !Array.isArray(packet.overlaps) || !packet.overlaps.length || packet.overlaps.length > 1000)
    throw Error(reason + " exact owner-attested scope required");
  const origin = exactRecord(packet.origin, ["kind", "artifact"], reason + " current owner origin required");
  if (origin.kind !== "owner-current-request") throw Error(reason + " current owner request required");
  if (!decodeUTF8(read(origin.artifact)).trim()) throw Error(reason + " current owner request is empty");
  const result: Coordinated = [], seen = new Set<string>();
  for (const value of packet.overlaps) {
    const row = exactRecord(value, ["kind", "owner", "document"], reason + " overlap fields changed");
    if (row.kind !== "feature" && row.kind !== "writer" || typeof row.owner !== "string" || !row.owner.trim() || row.owner.length > 1024
      || typeof row.document !== "string" || !documents.has(protocolPath(row.document))) throw Error(reason + " selected overlap required");
    const key = canonicalJSON(row).toString();
    if (seen.has(key)) throw Error(reason + " duplicate overlap");
    seen.add(key);
    result.push({ ...(row.kind === "feature" ? { feature: protocolPath(row.owner) } : { writer: row.owner }),
      document: row.document, source_commit: options.source, selection_sha256: selectedHash });
  }
  // This is a same-user attestation of the request origin, not authenticated human identity or execution proof.
  return freezeJSON(result);
}
