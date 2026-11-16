import { publisherActor, sameLogin, sameAccount } from "./identity";
import { executeAttempt, hasEffectAttempt } from "./attempts";
import { policyBinding, appendHandoff, appendInvalidation, appendIntent, appendOutcome, appendRecoveryOnly, createJournal, readJournal, readVerifiedPlan, sealPlan, writePublicationObjects, type Journal, type PlanPolicy, type SealedPlan } from "./journal";
import { effectMarker, manifestDigest, parseActionManifest, validateReviewedManifest, type Effect } from "./manifests";
import { canonicalJSON, withinPrefix } from "./protocol";
import { publicationMarker } from "./report-history";
import { loadCommittedSettings, type Settings } from "./settings";
import { readOriginalNativeTrialPolicy } from "./trial-definition";
import { readGit } from "./git";
import type { OwnedObjectStore } from "./snapshot";
import { externalArtifactDirectory } from "./snapshot";
import type { PlanObjects, PublicationTransport } from "./transport";

export type PublicationGate = { review: Parameters<typeof validateReviewedManifest>[0]; policy: PlanPolicy };
export type PublishOptions = {
  source_repo: string; artifact_root: string; object_store: OwnedObjectStore; settings: Settings;
  plan: SealedPlan; transport: PublicationTransport;
  gate: (journal: Journal | null) => Promise<PublicationGate>;
};
export type PublishResult = { state: "complete" | "pending" | "retired" | "acknowledged" | "invalidated"; reason: string | null; journal: Journal; objects: PlanObjects };
function fail(reason: string): never { throw Error(`docs-drift publication ${reason}`); }

export class PublicationScopeChanged extends Error {}

export function validatePublicationShape(plan: Pick<SealedPlan, "manifest" | "context" | "publication_kind">, settings: Settings, draft: boolean): void {
  const { manifest } = plan;
  if (plan.context === "production" ? draft !== (settings.publication.pr_state[plan.publication_kind] === "draft") : draft !== true) fail("declared production or trial draft policy");
  if (settings.schema_version === 1 && !settings.publication.entry_actors && manifest.publisher_entry !== undefined) fail("publisher entry outside mapped policy");
  if (manifest.repository !== settings.repository || !sameLogin(manifest.actor, publisherActor(settings, manifest.publisher_entry))) fail("selected repository or actor");
  if (plan.context === "production" && settings.publication.mode !== "adopted") fail("consumer adoption is not active");
  if (canonicalJSON(plan).length > settings.reports.max_entry_bytes) fail("retained plan size bound");
  const effects = manifest.effects;
  const first = effects[0], second = effects[1], last = effects.at(-1);
  if (effects.length < 4 || first.kind !== "lease-acquire" || first.payload.ref !== settings.publication.lease_ref
    || second.kind !== "receipt-retain" || second.payload.ref !== settings.publication.receipt_ref_prefix + manifest.operation_id
    || last?.kind !== "lease-release" || last.payload.ref !== settings.publication.lease_ref) fail("explicit lease and retained receipt scope");
  const marker = publicationMarker(settings, manifest.operation_id);
  for (const effect of effects.slice(2, -1)) {
    if (!["push", "branch-refresh", "pr-create", "pr-update", "issue-create", "comment-create", "pr-close"].includes(effect.kind)) fail("unsupported publication effect");
    const p = effect.payload;
    if (["push", "branch-refresh"].includes(effect.kind)) {
      const legacyRefresh = effect.kind === "branch-refresh"
        && settings.legacy_proposals.branch_prefixes.some(prefix => typeof p.ref === "string" && p.ref.startsWith("refs/heads/" + prefix));
      if (typeof p.ref !== "string" || !p.ref.startsWith("refs/heads/")
        || !p.ref.startsWith("refs/heads/" + settings.publication.branch_prefix) && !legacyRefresh
        || p.head !== manifest.bindings.candidate_commit) fail("candidate branch scope");
    }
    if (effect.kind === "branch-refresh") {
      const updates = effects.slice(effects.indexOf(effect) + 1).filter(item => item.kind === "pr-update"
        && item.payload.number === p.number && item.payload.expected_head === p.head);
      if (updates.length !== 1) fail("refresh needs its exact reviewed PR update");
    }
    if (effect.kind === "pr-update" && p.expected_head !== manifest.bindings.candidate_commit) fail("PR update candidate binding");
    if (effect.kind === "pr-create") {
      if (p.base !== settings.publication.base || typeof p.branch !== "string" || !p.branch.startsWith(settings.publication.branch_prefix)
        || p.draft !== draft) fail("PR destination policy");
    }
    if (["pr-create", "pr-update", "issue-create", "comment-create"].includes(effect.kind)) {
      if (typeof p.body !== "string" || p.body.split(marker).length !== 2 || p.body.split(effectMarker(effect.id)).length !== 2 || (p.body.match(/<!-- vh-adlc-docs-drift\b/gu)?.length ?? 0) !== 1) fail("pre-review operation marker");
    }
    if (effect.kind === "pr-close") {
      const comments = effects.slice(0, effects.indexOf(effect)).filter(item => item.kind === "comment-create" && item.payload.number === p.number);
      if (comments.length !== 1) fail("explicit current explanation before closure");
    }
  }
}

/** Actual source/authority/native artifacts come from the entry's controller, never from report flags. */
export async function verifyPublicationGate(options: PublishOptions, journal: Journal | null): Promise<void> {
  if (externalArtifactDirectory(options.artifact_root, options.source_repo)
    !== externalArtifactDirectory(options.transport.artifact_root, options.source_repo)) fail("artifact root binding");
  if (options.transport.kind !== options.plan.transport || options.transport.object_store !== options.object_store.root) fail("transport or object store binding");
  const gate = await options.gate(journal === null ? null : structuredClone(journal));
  const plan = readVerifiedPlan(canonicalJSON(options.plan), () => gate.policy);
  if (manifestDigest(parseActionManifest(gate.review.current)) !== plan.manifest_sha256) throw new PublicationScopeChanged("current-manifest-changed");
  const checked = validateReviewedManifest(gate.review);
  const current = sealPlan({ reviewed: checked, grants: gate.review.grants, ...policyBinding(gate.policy),
    context: gate.policy.context, transport: gate.policy.transport, publication_kind: gate.policy.publication_kind, corrections: plan.corrections, attention: plan.attention, candidate_verification_sha256: plan.candidate_verification_sha256 });
  if (!canonicalJSON(current).equals(canonicalJSON(plan))) fail("changed current review or authority");
  const committed = loadCommittedSettings(options.source_repo, plan.manifest.bindings.source_commit);
  let settings = committed.settings;
  if (plan.schema_version === 2 && plan.context === "trial" && plan.transport === "native") {
    const original = readOriginalNativeTrialPolicy({ repo: options.source_repo, plan, identity: { repository: plan.manifest.repository,
      repository_id: plan.manifest.repository_id, actor: plan.manifest.actor, actor_id: plan.manifest.actor_id, default_branch: committed.settings.default_branch } });
    const paths = readGit(options.object_store.root, "diff", "--no-ext-diff", "--no-renames", "--name-only", "-z",
      plan.manifest.bindings.source_commit, plan.manifest.bindings.candidate_commit).toString().split("\0").filter(Boolean);
    if (paths.some(path => !original.namespace.paths.some(root => withinPrefix(path, root)))) fail("native trial candidate outside declared paths");
    settings = original.settings;
  }
  if (committed.settings_sha256 !== plan.manifest.bindings.settings_sha256 || !canonicalJSON(settings).equals(canonicalJSON(options.settings))) fail("source settings binding");
  validatePublicationShape(plan, settings, gate.policy.pr_draft);
  const identity = await options.transport.identity();
  if (identity.repository !== plan.manifest.repository || identity.repository_id !== plan.manifest.repository_id
    || !sameAccount(identity, plan.manifest)
    || identity.default_branch !== options.settings.default_branch) throw new PublicationScopeChanged("current-native-repository-or-actor-changed");
}

function pending(journal: Journal, effect: Effect, reason: string, objects: PlanObjects, invalidate = false, recoveryOnly = false): PublishResult {
  if (!journal.events.some(event => event.effect_id === effect.id && event.kind === "intent")) journal = appendIntent(journal, effect.id);
  if (recoveryOnly) journal = appendRecoveryOnly(journal, effect.id, reason);
  if (invalidate) journal = appendInvalidation(journal, effect.id, reason);
  journal = appendHandoff(journal, effect.id, reason);
  return { state: "pending", reason, journal, objects };
}

export async function publish(options: PublishOptions): Promise<PublishResult> {
  await verifyPublicationGate(options, null);
  let journal = createJournal({ source_repo: options.source_repo, artifact_root: options.artifact_root, plan: options.plan });
  const objects = writePublicationObjects(options.object_store, options.plan, journal.header);
  for (const [index, effect] of journal.plan.manifest.effects.entries()) {
    try {
      await verifyPublicationGate(options, journal);
      if (index <= 1) {
        const receipt = await options.transport.ref(options.settings.publication.receipt_ref_prefix + journal.plan.manifest.operation_id);
        journal = readJournal(journal.directory, options.source_repo);
        const attempted = hasEffectAttempt(journal, journal.plan.manifest.effects[1].id);
        if (receipt.state === "present" && !attempted) return pending(journal, effect, "operation-started-elsewhere", objects, false, true);
      }
      const lease = await options.transport.ref(options.settings.publication.lease_ref);
      if (index === 0) {
        if (lease.state !== "absent") return pending(journal, effect, "publication-lease-occupied", objects);
      } else if (effect.kind !== "lease-release" && (lease.state !== "present" || lease.object !== objects.lease_object)) {
        return pending(journal, effect, "publication-lease-lost", objects, true);
      }
      if (!journal.events.some(event => event.kind === "intent" && event.effect_id === effect.id)) journal = appendIntent(journal, effect.id);
      const before = index === 0 ? { state: "absent" as const } : await options.transport.observe(journal.plan, effect, objects);
      if (before.state === "conflict" || before.state === "unknown") return pending(journal, effect, before.reason, objects, before.state === "conflict");
      if (before.state === "done") {
        journal = appendOutcome(journal, effect.id, before.outcome);
        continue;
      }
      journal = await executeAttempt({ journal, effect, objects, transport: options.transport });
      const after = await options.transport.observe(journal.plan, effect, objects);
      if (after.state !== "done") return pending(journal, effect, "effect-outcome-unconfirmed", objects, after.state === "conflict");
      journal = appendOutcome(journal, effect.id, after.outcome);
    } catch (error) {
      journal = readJournal(journal.directory, options.source_repo);
      return pending(journal, effect, "current-proof-or-effect-unavailable", objects, error instanceof PublicationScopeChanged);
    }
  }
  return { state: "complete", reason: null, journal, objects };
}
