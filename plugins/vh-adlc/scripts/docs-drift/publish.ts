import { appendHandoff, appendIntent, appendOutcome, createJournal, readVerifiedPlan, sealPlan, writePlanObject, type Journal, type PlanPolicy, type SealedPlan } from "./journal";
import { effectMarker, validateReviewedManifest, type Effect } from "./manifests";
import { canonicalJSON } from "./protocol";
import { publicationMarker } from "./report-history";
import { loadCommittedSettings, type Settings } from "./settings";
import type { OwnedObjectStore } from "./snapshot";
import type { PlanObjects, PublicationTransport } from "./transport";

export type PublicationGate = { review: Parameters<typeof validateReviewedManifest>[0]; policy: PlanPolicy };
export type PublishOptions = {
  source_repo: string; artifact_root: string; object_store: OwnedObjectStore; settings: Settings;
  plan: SealedPlan; transport: PublicationTransport;
  gate: (journal: Journal | null) => Promise<PublicationGate>;
};
export type PublishResult = { state: "complete" | "pending"; reason: string | null; journal: Journal; objects: PlanObjects };
function fail(reason: string): never { throw Error(`docs-drift publication ${reason}`); }

export function validatePublicationShape(plan: SealedPlan, settings: Settings, draft: boolean): void {
  const { manifest } = plan;
  if (plan.context === "production" ? draft !== settings.publication.pr_draft : draft !== true) fail("declared production or trial draft policy");
  if (manifest.repository !== settings.repository || manifest.actor !== settings.publication.actor) fail("selected repository or actor");
  if (plan.context === "production" && settings.adoption.mode !== "adopted") fail("consumer adoption is not active");
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
      if (typeof p.ref !== "string" || !p.ref.startsWith("refs/heads/" + settings.publication.branch_prefix)
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
  if (options.transport.kind !== options.plan.transport || options.transport.object_store !== options.object_store.root) fail("transport or object store binding");
  const gate = await options.gate(journal === null ? null : structuredClone(journal));
  const plan = readVerifiedPlan(canonicalJSON(options.plan), () => gate.policy);
  const checked = validateReviewedManifest(gate.review);
  const current = sealPlan({ reviewed: checked, grants: gate.review.grants, adoption_sha256: gate.policy.adoption_sha256,
    context: gate.policy.context, transport: gate.policy.transport, corrections: plan.corrections, attention: plan.attention });
  if (!canonicalJSON(current).equals(canonicalJSON(plan))) fail("changed current review or authority");
  const committed = loadCommittedSettings(options.source_repo, plan.manifest.bindings.source_commit);
  if (committed.settings_sha256 !== plan.manifest.bindings.settings_sha256 || !canonicalJSON(committed.settings).equals(canonicalJSON(options.settings))) fail("source settings binding");
  validatePublicationShape(plan, committed.settings, gate.policy.pr_draft);
  const identity = await options.transport.identity();
  if (identity.repository !== plan.manifest.repository || identity.repository_id !== plan.manifest.repository_id
    || identity.actor !== plan.manifest.actor || identity.actor_id !== plan.manifest.actor_id
    || identity.default_branch !== options.settings.default_branch) fail("current native repository or actor");
}

function pending(journal: Journal, effect: Effect, reason: string, objects: PlanObjects): PublishResult {
  if (!journal.events.some(event => event.effect_id === effect.id && event.kind === "intent")) journal = appendIntent(journal, effect.id);
  journal = appendHandoff(journal, effect.id, reason);
  return { state: "pending", reason, journal, objects };
}

export async function publish(options: PublishOptions): Promise<PublishResult> {
  await verifyPublicationGate(options, null);
  const objects = writePlanObject(options.object_store, options.plan);
  let journal = createJournal({ source_repo: options.source_repo, artifact_root: options.artifact_root, plan: options.plan });
  for (const [index, effect] of journal.plan.manifest.effects.entries()) {
    try {
      await verifyPublicationGate(options, journal);
      const lease = await options.transport.ref(options.settings.publication.lease_ref);
      if (index === 0) {
        if (lease.state !== "absent") return pending(journal, effect, "publication-lease-occupied", objects);
      } else if (lease.state === "present" ? lease.object !== objects.object : effect.kind !== "lease-release") {
        return pending(journal, effect, "publication-lease-lost", objects);
      }
      journal = appendIntent(journal, effect.id);
      const before = index === 0 ? { state: "absent" as const } : await options.transport.observe(journal.plan, effect, objects);
      if (before.state === "conflict" || before.state === "unknown") return pending(journal, effect, before.reason, objects);
      if (before.state === "done") {
        journal = appendOutcome(journal, effect.id, before.outcome);
        continue;
      }
      await options.transport.execute(journal.plan, effect, objects);
      const after = await options.transport.observe(journal.plan, effect, objects);
      if (after.state !== "done") return pending(journal, effect, "effect-outcome-unconfirmed", objects);
      journal = appendOutcome(journal, effect.id, after.outcome);
    } catch {
      return pending(journal, effect, "current-proof-or-effect-unavailable", objects);
    }
  }
  return { state: "complete", reason: null, journal, objects };
}
