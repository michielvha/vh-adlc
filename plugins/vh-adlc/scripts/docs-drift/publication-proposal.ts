import { parseEffect } from "./manifests";
import { exactRecord } from "./publication-decisions";
import { canonicalJSON, freezeJSON } from "./protocol";

type PublicationProposal = { operation_id: string; proposal: { kind: "pr-create" | "pr-update" | "issue-create"; payload: Record<string, unknown> } };

/** Validate the original proposed payload before a candidate exists. Permission and destination policy follow separately. */
export function parseWorkerPublication(value: unknown): PublicationProposal | null {
  if (value === null) return null;
  const packet = exactRecord(JSON.parse(canonicalJSON(value).toString()), ["operation_id", "proposal"], "Original publication proposal fields changed");
  if (typeof packet.operation_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u.test(packet.operation_id)) throw Error("Original publication operation required");
  const proposal = exactRecord(packet.proposal, ["kind", "payload"], "Original publication action fields changed");
  if (proposal.kind !== "pr-create" && proposal.kind !== "pr-update" && proposal.kind !== "issue-create") throw Error("Publication proposal requires a PR creation, refresh or issue");
  const parsed = parseEffect({ id: "publication", kind: proposal.kind, payload: proposal.payload });
  return freezeJSON({ operation_id: packet.operation_id, proposal: { kind: proposal.kind, payload: parsed.payload } });
}
