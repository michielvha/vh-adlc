import { reconcileAbsent, type ReconciliationScope } from "./recovery";
import { readRecoveryAuthority } from "./recovery-authority";
import { recoveryEffectsOutput } from "./recovery-output";
import { OUTPUT_LIMIT } from "./owned-process";
import { acknowledgeDeliveries, type AcknowledgementScope } from "./delivery-ack";
import { realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { readGit } from "./git";
import { readArtifact, readJournal, readVerifiedPlan, sealPlan, type PlanPolicy, type SealedPlan, type Journal } from "./journal";
import { effectDigest, manifestDigest, validateReviewedManifest, type NativeRoleEvidence, type RolePolicy } from "./manifests";
import { readNativeRoleArtifacts } from "./evidence-input";
import { canonicalJSON, decodeUTF8, protocolPath, sha256 } from "./protocol";
import { PublicationScopeChanged, type PublicationGate, type PublishOptions, type PublishResult } from "./publish";
import { loadTrialContext, type TrialContext } from "./trial-context";
import { createTrialTransport } from "./trial-transport";
import { loadCommittedSettings } from "./settings";
import type { OwnedProcess } from "./owned-process";

function exact(value: unknown, fields: string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== [...fields].sort().join(",")) throw Error("synthetic publication fields");
  return value as Record<string, unknown>;
}
function json(bytes: Uint8Array): unknown {
  const value: unknown = JSON.parse(decodeUTF8(bytes));
  if (!canonicalJSON(value).equals(Buffer.from(bytes))) throw Error("synthetic publication canonical JSON required");
  return value;
}
function ownedArtifact(context: TrialContext, path: string): Buffer {
  const name = protocolPath(relative(context.artifacts, resolve(path)));
  const selected = join(context.artifacts, name);
  if (realpathSync(selected) !== selected) throw Error("synthetic publication linked artifact");
  return readArtifact(selected);
}
function retained(context: TrialContext, value: unknown): Buffer {
  const input = exact(value, ["path", "sha256"]);
  if (typeof input.path !== "string" || typeof input.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(input.sha256)) throw Error("synthetic publication artifact reference");
  const bytes = ownedArtifact(context, join(context.artifacts, protocolPath(input.path)));
  if (sha256(bytes) !== input.sha256) throw Error("synthetic publication original artifact changed");
  return bytes;
}
function nativeRole(context: TrialContext, value: unknown, binding: SealedPlan["roles"]["worker"], policy: RolePolicy): NativeRoleEvidence {
  const input = exact(value, ["native", "returned", "process"]);
  if (input.process !== null && typeof input.process === "object" && Object.hasOwn(input.process, "path")) {
    return readNativeRoleArtifacts({ source_repo: context.source, artifact_root: context.artifacts, references: input, binding, policy });
  }
  const completion = exact(input.process, ["pid", "exit_code", "timed_out", "cancelled", "output_limit", "reaped"]);
  if (typeof completion.pid !== "number" || !Number.isSafeInteger(completion.pid) || completion.pid < 1
    || completion.exit_code !== 0 || completion.timed_out !== false || completion.cancelled !== null
    || completion.output_limit !== false || completion.reaped !== true) throw Error("synthetic publication native process incomplete");
  const native = retained(context, input.native), returned = retained(context, input.returned);
  return { invocation_id: binding.invocation_id, context_id: binding.context_id, provider: binding.provider,
    target_sha256: binding.target_sha256, isolation: binding.isolation, native, returned,
    native_sha256: binding.native_sha256, returned_sha256: binding.returned_sha256, process: completion as OwnedProcess };
}

/** Only the immutable setup test grant supplies collector authority. Request/report flags supply none. */
export function readTrialPublication(selected: TrialContext, requestPath: string, preflight?: (journal: Journal) => void): PublishOptions & { request_sha256: string } {
  const context = loadTrialContext({ root: selected.root, context_commit: selected.context_commit, runtime_directory: selected.root + "/runtime" });
  const requestBytes = ownedArtifact(context, requestPath), requestHash = sha256(requestBytes);
  const request = exact(json(requestBytes), ["schema_version", "kind", "context_sha256", "entry", "publication_kind", "plan", "worker", "reviewer"]);
  if (request.schema_version !== 1 || request.kind !== "docs-drift-synthetic-publication" || request.context_sha256 !== context.context_sha256
    || !["copilot", "claude"].includes(String(request.entry))) throw Error("synthetic publication context or entry changed");
  const publicationKind = request.publication_kind;
  if (publicationKind !== "advisory" && publicationKind !== "resolve") throw Error("synthetic publication kind unavailable");
  const entry = context.settings.execution.entries[String(request.entry)];
  const rolePolicy = (name: "worker" | "reviewer") => {
    const selected = entry[name];
    if (selected.identity_source === null) throw Error("synthetic publication native role capability unavailable");
    return { requested_model: selected.model, adopted_model: selected.model, identity_source: selected.identity_source };
  };
  const workerPolicy = rolePolicy("worker"), reviewerPolicy = rolePolicy("reviewer");
  const plan = readVerifiedPlan(retained(context, request.plan), () => ({ adoption_sha256: context.context_sha256,
    context: "trial", transport: "collector", publication_kind: publicationKind, pr_draft: true,
    ...(context.settings.publication.entry_actors ? { publisher_entry: request.entry as "copilot" | "claude" } : {}),
    worker: workerPolicy, reviewer: reviewerPolicy }));
  const policy: PlanPolicy = { adoption_sha256: context.context_sha256, context: "trial", transport: "collector",
    publication_kind: publicationKind, pr_draft: true,
    ...(context.settings.publication.entry_actors ? { publisher_entry: request.entry as "copilot" | "claude" } : {}), worker: workerPolicy, reviewer: reviewerPolicy };
  const manifest = plan.manifest, candidate = manifest.bindings.candidate_commit;
  if (manifest.bindings.source_commit !== context.source_commit || manifest.bindings.settings_sha256 !== loadCommittedSettings(context.source, context.source_commit).settings_sha256
    || readGit(context.store.root, "rev-parse", "--verify", "--end-of-options", candidate + "^{commit}").toString().trim() !== candidate
    || readGit(context.store.root, "rev-parse", "--verify", "--end-of-options", candidate + "^{tree}").toString().trim() !== manifest.bindings.candidate_tree) throw Error("synthetic publication source or candidate changed");
  const review: PublicationGate["review"] = { manifest, current: manifest,
    grants: manifest.effects.map(effect => ({ manifest_sha256: manifestDigest(manifest), effect_id: effect.id, effect_sha256: effectDigest([effect]) })),
    worker: nativeRole(context, request.worker, plan.roles.worker, workerPolicy), reviewer: nativeRole(context, request.reviewer, plan.roles.reviewer, reviewerPolicy),
    policy: { worker: workerPolicy, reviewer: reviewerPolicy } };
  const checked = sealPlan({ reviewed: validateReviewedManifest(review), grants: review.grants, ...policy,
    corrections: plan.corrections, attention: plan.attention, candidate_verification_sha256: plan.candidate_verification_sha256 });
  if (!canonicalJSON(checked).equals(canonicalJSON(plan))) throw Error("synthetic publication original review changed");
  return { source_repo: context.source, artifact_root: context.artifacts, object_store: context.store, settings: context.settings,
    plan, request_sha256: requestHash, transport: createTrialTransport(context), gate: async (journal: Journal | null) => {
      if (journal) preflight?.(journal);
      const current = readTrialPublication(context, requestPath);
      if (current.request_sha256 !== requestHash || !canonicalJSON(current.plan).equals(canonicalJSON(plan))) throw new PublicationScopeChanged("synthetic publication request changed");
      return { review, policy };
    } };
}

/** The optional owner request is distinct from the setup's standing synthetic publication grant. */
export async function runTrialAcknowledgement(selected: TrialContext, selectionPath: string, ownerRequestPath?: string, preflight?: (journal: Journal) => void): Promise<{
  result: PublishResult; scope: AcknowledgementScope | null; scope_sha256: string | null;
}> {
  const context = loadTrialContext({ root: selected.root, context_commit: selected.context_commit, runtime_directory: selected.root + "/runtime" });
  const selection = exact(json(ownedArtifact(context, selectionPath)), ["schema_version", "kind", "context_sha256", "journal_directory", "acknowledge_effect_ids", "retire_effect_ids"]);
  if (selection.schema_version !== 1 || selection.kind !== "docs-drift-synthetic-acknowledgement-selection" || selection.context_sha256 !== context.context_sha256
    || typeof selection.journal_directory !== "string" || dirname(resolve(selection.journal_directory)) !== context.artifacts
    || realpathSync(selection.journal_directory) !== resolve(selection.journal_directory)) throw Error("synthetic acknowledgement context or journal changed");
  function ids(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 1000 || value.some(id => typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(id))
      || new Set(value).size !== value.length) throw Error("synthetic acknowledgement effect IDs");
    return value;
  }
  const journal = readJournal(selection.journal_directory, context.source), plan = journal.plan;
  if (plan.context !== "trial" || plan.transport !== "collector" || plan.adoption_sha256 !== context.context_sha256
    || plan.manifest.bindings.source_commit !== context.source_commit
    || plan.manifest.bindings.settings_sha256 !== loadCommittedSettings(context.source, context.source_commit).settings_sha256) throw Error("synthetic acknowledgement original context changed");
  if (ownerRequestPath) preflight?.(journal);
  let scope: AcknowledgementScope | null = null;
  const result = await acknowledgeDeliveries({ source_repo: context.source, journal_directory: journal.directory,
    object_store: context.store, settings: context.settings, transport: createTrialTransport(context),
    acknowledge_effect_ids: ids(selection.acknowledge_effect_ids), retire_effect_ids: ids(selection.retire_effect_ids),
    authorize: async current => {
      scope = current;
      if (!ownerRequestPath) return null;
      const bytes = ownedArtifact(context, ownerRequestPath);
      const owner = exact(json(bytes), ["schema_version", "kind", "context_sha256", "source", "scope_sha256"]);
      if (owner.schema_version !== 1 || owner.kind !== "docs-drift-synthetic-owner-request" || owner.context_sha256 !== context.context_sha256
        || owner.source !== "owner-current-request" || owner.scope_sha256 !== sha256(canonicalJSON(current))) throw Error("synthetic acknowledgement exact current owner request required");
      return { kind: "owner-delivery-acknowledgement", source: "owner-current-request", scope_sha256: owner.scope_sha256, request_sha256: sha256(bytes) };
    } });
  return { result, scope, scope_sha256: scope === null ? null : sha256(canonicalJSON(scope)) };
}

/** Synthetic reconciliation uses the ordinary engine and exact current-owner authority reader. */
export async function runTrialReconciliation(selected: TrialContext, selectionPath: string, ownerRequestPath?: string, preflight?: (journal: Journal) => void): Promise<{
  result: PublishResult; scopes: ReconciliationScope[]; scope_sha256s: string[];
}> {
  const context = loadTrialContext({ root: selected.root, context_commit: selected.context_commit, runtime_directory: selected.root + "/runtime" });
  const selection = exact(json(ownedArtifact(context, selectionPath)), ["schema_version", "kind", "context_sha256", "journal_directory", "retire_effect_ids", "retirement_lookups"]);
  if (selection.schema_version !== 1 || selection.kind !== "docs-drift-synthetic-reconciliation-selection" || selection.context_sha256 !== context.context_sha256
    || typeof selection.journal_directory !== "string" || dirname(resolve(selection.journal_directory)) !== context.artifacts
    || realpathSync(selection.journal_directory) !== resolve(selection.journal_directory)) throw Error("synthetic reconciliation context or journal changed");
  const ids = selection.retire_effect_ids;
  if (!Array.isArray(ids) || ids.length > 1000 || ids.some(id => typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(id))
    || new Set(ids).size !== ids.length) throw Error("synthetic reconciliation effect IDs");
  const lookups = selection.retirement_lookups;
  if (lookups === null || typeof lookups !== "object" || Array.isArray(lookups) || Object.keys(lookups).some(id => !ids.includes(id)))
    throw Error("synthetic reconciliation selected lookups required");
  const journal = readJournal(selection.journal_directory, context.source), plan = journal.plan;
  if (plan.context !== "trial" || plan.transport !== "collector" || plan.adoption_sha256 !== context.context_sha256
    || plan.manifest.bindings.source_commit !== context.source_commit
    || plan.manifest.bindings.settings_sha256 !== loadCommittedSettings(context.source, context.source_commit).settings_sha256)
    throw Error("synthetic reconciliation original context changed");
  if (ownerRequestPath) preflight?.(journal);
  const limit = Math.min(OUTPUT_LIMIT, context.settings.reports.max_entry_bytes);
  if (ownerRequestPath) recoveryEffectsOutput({ command: "reconcile-publication", source: context.source_commit, outcome: "incomplete", capacity_check: true,
    result: { state: "pending", reason: null, journal }, limit });
  const result = await reconcileAbsent({ source_repo: context.source, journal_directory: journal.directory,
    object_store: context.store, settings: context.settings, transport: createTrialTransport(context), retire_effect_ids: ids,
    retirement_lookups: lookups as Parameters<typeof reconcileAbsent>[0]["retirement_lookups"],
    ...(!ownerRequestPath ? { inspect_only: true as const } : {}),
    authorize: async scope => {
      if (!ownerRequestPath) return null;
      const bytes = ownedArtifact(context, ownerRequestPath);
      return readRecoveryAuthority({ source_repo: context.source, artifact_root: context.artifacts,
        reference: { path: relative(context.artifacts, resolve(ownerRequestPath)), sha256: sha256(bytes) }, purpose: "reconciliation", scope });
    } });
  const scopes = result.inspection_scopes ?? [], scope_sha256s = scopes.map(scope => sha256(canonicalJSON(scope)));
  if (Buffer.byteLength(JSON.stringify({ scopes, scope_sha256s })) > limit) throw Error("synthetic reconciliation inspection exceeds the retained entry bound");
  return { result, scopes, scope_sha256s };
}
