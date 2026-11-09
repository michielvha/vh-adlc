import { freezeJSON } from "./protocol";
import { OUTPUT_LIMIT } from "./owned-process";
import type { PublishResult } from "./publish";

type Options = {
  command: string; source: string; outcome: "collected" | "attention" | "incomplete";
  result: Pick<PublishResult, "state" | "reason" | "journal">; limit: number; capacity_check?: true;
};

/** Keep full payloads and event history in the original private journal. */
export function recoveryEffectsOutput(options: Options) {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > OUTPUT_LIMIT) throw Error("Recovery output bound required");
  const { journal } = options.result;
  const ids = (kind: "acknowledged-delivery" | "retired-absence") => [...new Set(journal.events.filter(event => event.kind === kind).map(event => event.effect_id))];
  const acknowledged = ids("acknowledged-delivery"), retired = ids("retired-absence");
  const summary = { state: options.result.state, reason: options.result.reason, operation_id: journal.plan.manifest.operation_id,
    journal: { directory: journal.directory, sha256: journal.digest }, acknowledged_effect_ids: acknowledged, retired_effect_ids: retired,
    acknowledged_effect_count: acknowledged.length, retired_effect_count: retired.length, details_omitted: false };
  const output = { schema_version: 1 as const, command: options.command, source_commit: options.source, outcome: options.outcome,
    recovery_effects: summary, diagnostics: summary.reason ? [{ code: "recovery-effects", message: summary.reason }] : [] };
  const omitDetails = () => {
    summary.reason = null; summary.acknowledged_effect_ids = []; summary.retired_effect_ids = [];
    summary.details_omitted = true; output.diagnostics = [];
  };
  if (options.capacity_check) {
    // Acknowledged is the longest state, incomplete the longest outcome. Counts cannot exceed the plan.
    summary.state = "acknowledged"; output.outcome = "incomplete";
    summary.acknowledged_effect_count = journal.plan.manifest.effects.length;
    summary.retired_effect_count = journal.plan.manifest.effects.length;
    omitDetails();
  }
  const size = () => Buffer.byteLength(JSON.stringify(output) + "\n");
  if (size() > options.limit) omitDetails();
  if (size() > options.limit) throw Error("Configured output bound cannot retain the recovery summary and original journal reference");
  return freezeJSON(output);
}
