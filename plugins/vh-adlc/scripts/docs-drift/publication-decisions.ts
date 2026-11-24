import { parseEdit } from "./resolve";
import { canonicalJSON, decodeUTF8, protocolPath } from "./protocol";
import { attentionProjection, type AttentionInput, type AttentionProjection } from "./report";
import type { Snapshot } from "./snapshot";

export type DecisionPacket = {
  schema_version: 1; kind: "docs-drift-decisions"; mode: "advisory" | "resolve"; source_commit: string;
  selected_proposals: number[]; decisions: unknown[]; attention: unknown[]; coordination?: { path: string; sha256: string } | null;
};

export function exactRecord(value: unknown, fields: string[], reason: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error(reason);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== fields.length || fields.some(field => !Object.hasOwn(input, field))) throw Error(reason);
  return input;
}

export function parseDecisionPacket(bytes: Uint8Array, snapshot: Snapshot): DecisionPacket {
  if (bytes.length > snapshot.settings.reports.max_entry_bytes) throw Error("Canonical bounded decision packet required");
  const parsed: unknown = JSON.parse(decodeUTF8(bytes));
  if (!canonicalJSON(parsed).equals(bytes)
    || parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("Canonical bounded decision packet required");
  const packet = parsed as Record<string, unknown>, fields = ["schema_version", "kind", "mode", "source_commit", "selected_proposals", "decisions", "attention"];
  if (Object.keys(packet).some(field => ![...fields, "coordination"].includes(field)) || fields.some(field => !Object.hasOwn(packet, field)) || packet.schema_version !== 1
    || packet.kind !== "docs-drift-decisions" || !["advisory", "resolve"].includes(String(packet.mode)) || packet.source_commit !== snapshot.source_commit
    || !Array.isArray(packet.decisions) || !Array.isArray(packet.attention) || !Array.isArray(packet.selected_proposals)
    || packet.selected_proposals.length > 1000 || packet.selected_proposals.some(id => typeof id !== "number" || !Number.isSafeInteger(id) || id < 1)
    || new Set(packet.selected_proposals).size !== packet.selected_proposals.length) throw Error("Decision packet fields or source changed");
  if (packet.coordination !== undefined && packet.coordination !== null) {
    const reference = exactRecord(packet.coordination, ["path", "sha256"], "Coordinated selection reference required");
    protocolPath(reference.path);
    if (typeof reference.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(reference.sha256)) throw Error("Coordinated selection digest required");
  }
  return packet as DecisionPacket;
}

export function advisoryDecisionIDs(packet: DecisionPacket): string[] {
  const reason = "Advisory decisions do not account for selected edits";
  const decisions = packet.decisions.map(value => exactRecord(value, ["id", "reason"], reason));
  if (decisions.some(item => typeof item.id !== "string" || !item.id.trim() || typeof item.reason !== "string" || !item.reason.trim())
    || new Set(decisions.map(item => item.id)).size !== decisions.length) throw Error(reason);
  return decisions.map(item => item.id as string);
}

export function validateAdvisorySelection(packet: DecisionPacket, value: unknown): void {
  const reason = "Advisory decisions do not account for selected edits";
  const selection = exactRecord(value, ["schema_version", "source_commit", "edits"], reason);
  if (selection.schema_version !== 1 || selection.source_commit !== packet.source_commit || !Array.isArray(selection.edits)) throw Error(reason);
  const ids = selection.edits.map(edit => parseEdit(edit).id), expected = new Set(ids), decisions = advisoryDecisionIDs(packet);
  if (expected.size !== ids.length || decisions.length !== expected.size || decisions.some(id => !expected.has(id))) throw Error(reason);
}

export function projectAttentionProposals(values: unknown[], context: { repository: string; scope_sha256: string; inputs_sha256: string }): AttentionProjection[] {
  const attention = values.map(value => {
    const reason = "Invalid or duplicate attention proposal";
    const item = exactRecord(value, ["identity", "disposition", "reason", "owner_action", "rule", "title", "links"], reason);
    if ([item.identity, item.reason, item.owner_action, item.title].some(value => typeof value !== "string" || !value.trim())
      || !Array.isArray(item.links) || item.links.some(link => typeof link !== "string" || !link.trim())) throw Error(reason);
    try {
      return attentionProjection({ ...item as Omit<AttentionInput, "repository" | "scope_sha256" | "inputs" | "required_inputs">,
        repository: context.repository, scope_sha256: context.scope_sha256, inputs: { source: context.inputs_sha256 }, required_inputs: ["source"] });
    } catch { throw Error(reason); }
  });
  if (new Set(attention.map(item => item.sha256)).size !== attention.length) throw Error("Invalid or duplicate attention proposal");
  return attention;
}
