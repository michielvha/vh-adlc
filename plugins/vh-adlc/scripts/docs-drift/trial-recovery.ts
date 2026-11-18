import { inspectRetainedOperation, restoreRetainedOperation } from "./recovery";
import { type PlanPolicy, type SealedPlan } from "./journal";
import { collectorPolicyBinding, matchesCollectorPolicy, loadTrialContext, type TrialContext } from "./trial-context";
import { createTrialTransport } from "./trial-transport";

/** Inspect retained synthetic evidence or restore an observation-only local mirror. No publication effects or replay. */
export async function collectTrialRetained(selected: TrialContext, input: { operation_id: string; entry: "copilot" | "claude"; restore?: true }) {
  const context = loadTrialContext({ root: selected.root, context_commit: selected.context_commit, runtime_directory: selected.root + "/runtime" });
  if (input.entry !== "copilot" && input.entry !== "claude") throw Error("synthetic retained entry required");
  const transport = createTrialTransport(context);
  transport.execute = async () => { throw Error("Retained synthetic inspection grants no effects"); };
  const verifyPolicy = (plan: SealedPlan): PlanPolicy | null => {
    const entry = context.settings.execution.entries[input.entry], worker = entry.worker, reviewer = entry.reviewer;
    if (worker.identity_source === null || reviewer.identity_source === null) return null;
    return { ...collectorPolicyBinding(context, plan.schema_version), context: "trial", transport: "collector", publication_kind: plan.publication_kind,
      pr_draft: true,
      ...(context.settings.publication.entry_actors ? { publisher_entry: input.entry } : {}),
      worker: { requested_model: worker.model, adopted_model: worker.model, identity_source: worker.identity_source },
      reviewer: { requested_model: reviewer.model, adopted_model: reviewer.model, identity_source: reviewer.identity_source } };
  };
  const inspection = await inspectRetainedOperation({ source_repo: context.source, artifact_root: context.artifacts,
    settings: context.settings, transport, operation_id: input.operation_id, verify_policy: verifyPolicy,
    verify_original: plan => {
      if (!matchesCollectorPolicy(context, plan) || plan.manifest.operation_id !== input.operation_id) throw Error("synthetic retained original context changed");
    } });
  const summary = { authority: "none" as const, replay_authority: false as const, operation_id: input.operation_id,
    inspection_directory: inspection.directory, plan_sha256: inspection.objects.plan_sha256, policy_state: inspection.policy_state,
    inspection_observations: inspection.observations.map(({ effect_id, observation }) => ({ effect_id, state: observation.state,
      ...("reason" in observation ? { reason: observation.reason } : {}) })) };
  if (!input.restore) return { ...summary, complete: inspection.observations.every(row => row.observation.state !== "unknown"),
    state: "inspection", reason: null, journal_directory: null };
  const result = await restoreRetainedOperation({ inspection, publication: { source_repo: context.source, artifact_root: context.artifacts,
    object_store: context.store, settings: context.settings, transport, plan: inspection.plan,
    gate: async () => { throw Error("Retained synthetic inspection grants no replay"); } } });
  return { ...summary, complete: result.state === "complete", state: result.state, reason: result.reason,
    journal_directory: result.journal.directory, revision: result.journal.revision };
}
