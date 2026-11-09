import { dirname, join } from "node:path";
import { executeAttempt, hasInFlightAttempt, pendingAttempt } from "./attempts";
import { readAppliedDelivery } from "./delivery-proof";
import { lookupAppliedDelivery, type DeliveryLookup } from "./delivery-lookup";
import { readGitSuccess } from "./git-success";
import { appendAcknowledgement, appendIntent, appendOutcome, appendRetirement, publishArtifact, readArtifact, readJournal, writePublicationObjects, type Journal, type ReconciliationGrant } from "./journal";
import { readLookup, lookupFactsDigest } from "./observations";
import { readRejection } from "./rejections";
import { canonicalJSON, sha256 } from "./protocol";
import { captureRepositoryState, externalArtifactDirectory } from "./snapshot";
import type { Settings } from "./settings";
import type { PublicationTransport, PlanObjects, EffectObservation } from "./transport";
import type { PublishOptions, PublishResult } from "./publish";

export type AcknowledgementScope = {
  kind: "docs-drift-delivery-acknowledgement"; repository: string; repository_id: number; actor: string; actor_id: number;
  operation_id: string; run_id: string; plan_sha256: string; context: "trial" | "production"; transport: "native" | "collector";
  source_state_sha256: string; settings_sha256: string; settlement_sha256: string;
  lease_ref: string; lease_object: string; receipt_ref: string; receipt_object: string; release_effect_id: string;
  acknowledgements: { effect_id: string; payload_sha256: string; application_sha256: string; current_sha256: string;
    lookup_sha256: string; resource_id: number; differences: string[]; current: DeliveryLookup["current"]; parent: DeliveryLookup["parent"] }[];
  retirements: { effect_id: string; state: "absent" | "conflict"; lookup_sha256: string }[];
  accounts: { effect_id: string; disposition: string; resource_id?: string | null; object?: string | null }[];
};
type Options = {
  source_repo: string; journal_directory: string; object_store: PublishOptions["object_store"]; settings: Settings;
  transport: PublicationTransport; acknowledge_effect_ids: string[]; retire_effect_ids: string[];
  authorize: (scope: AcknowledgementScope) => Promise<unknown>; inspect_only?: true;
};
function terminal(journal: Journal, id: string) {
  return journal.events.find(event => event.effect_id === id && ["outcome", "acknowledged-delivery", "retired-absence"].includes(event.kind));
}

/** Validate every actual request, independently of process exit and present-day payloads. */
function settled(options: Options, journal: Journal, objects: PlanObjects): string {
  const evidence: string[] = [];
  let acquisitionApplied = false;
  for (const attempt of journal.events.filter(event => event.kind === "attempt" && event.effect_id !== journal.plan.manifest.effects.at(-1)!.id)) {
    if (!("attempt_id" in attempt.payload)) throw Error("acknowledgement-request-unavailable");
    const attemptId = attempt.payload.attempt_id, effect = journal.plan.manifest.effects.find(item => item.id === attempt.effect_id)!;
    const ending = journal.events.findLast(event => event.kind === "attempt-ended" && event.effect_id === effect.id
      && "attempt_id" in event.payload && event.payload.attempt_id === attemptId && event.revision > attempt.revision);
    if (!ending || !("sent" in ending.payload) || !ending.payload.reaped || ending.payload.capture_unverified) throw Error("acknowledgement-request-unsettled");
    const scope = { artifact_root: options.transport.artifact_root, source_repo: options.source_repo, plan: journal.plan, effect, attempt_id: attemptId };
    if (ending.payload.sent) {
      if (ending.payload.rejection) readRejection({ ...scope, header: journal.header, evidence: ending.payload.rejection });
      else if (["lease-acquire", "receipt-retain", "push", "branch-refresh"].includes(effect.kind)) {
        const captured = ending.payload.execution;
        if (!captured || captured.commands !== 1 || captured.successes.length !== 1) throw Error("acknowledgement-ref-request-unproved");
        const proof = readGitSuccess({ ...scope, evidence: captured.successes[0] });
        if (proof.hostname !== options.settings.hostname || effect.kind === "lease-acquire" && proof.updates.some(update => update.head !== objects.lease_object)
          || effect.kind === "receipt-retain" && proof.updates[0].head !== objects.receipt_object) throw Error("acknowledgement-owned-ref-changed");
        if (effect.kind === "lease-acquire") acquisitionApplied = true;
      } else readAppliedDelivery({ source_repo: options.source_repo, journal_directory: journal.directory, effect_id: effect.id,
        settings: options.settings, transport: options.transport.kind });
    }
    evidence.push(sha256(canonicalJSON(ending)));
  }
  if (!acquisitionApplied) throw Error("acknowledgement-original-acquisition-unproved");
  return sha256(canonicalJSON(evidence));
}
/** An earlier release needs a terminal non-application result before another request is allowed. */
function releaseSettlement(options: Options, journal: Journal, objects: PlanObjects): string {
  const release = journal.plan.manifest.effects.at(-1)!;
  const endings: string[] = [];
  for (const attempt of journal.events.filter(event => event.kind === "attempt" && event.effect_id === release.id)) {
    if (!("attempt_id" in attempt.payload)) throw Error("acknowledgement-release-request-unsettled");
    const attemptId = attempt.payload.attempt_id;
    const ending = journal.events.findLast(event => event.kind === "attempt-ended" && event.effect_id === release.id
      && "attempt_id" in event.payload && event.payload.attempt_id === attemptId && event.revision > attempt.revision);
    if (!ending || !("sent" in ending.payload) || !ending.payload.reaped || ending.payload.capture_unverified) throw Error("acknowledgement-release-request-unsettled");
    const scope = { artifact_root: options.transport.artifact_root, source_repo: options.source_repo, plan: journal.plan, effect: release, attempt_id: attemptId };
    if (ending.payload.sent) {
      if (ending.payload.rejection) readRejection({ ...scope, header: journal.header, evidence: ending.payload.rejection });
      else {
        const captured = ending.payload.execution;
        if (!captured || captured.commands !== 1 || captured.successes.length !== 1) throw Error("acknowledgement-release-request-unsettled");
        const proof = readGitSuccess({ ...scope, evidence: captured.successes[0] });
        if (proof.hostname !== options.settings.hostname || proof.updates[0].expected !== objects.lease_object) throw Error("acknowledgement-release-scope-changed");
        // The caller has just observed the old object present again. Its previous ownership ended.
        throw Error("acknowledgement-lease-already-released");
      }
    }
    endings.push(sha256(canonicalJSON(ending)));
  }
  return sha256(canonicalJSON(endings));
}

/** The caller must bind authorize to the owner's actual current request, independently of adopted grants. */
export async function acknowledgeDeliveries(options: Options): Promise<PublishResult & { inspection_scope?: AcknowledgementScope }> {
  let journal = readJournal(options.journal_directory, options.source_repo);
  const { plan } = journal, objects = writePublicationObjects(options.object_store, plan, journal.header);
  const result = (state: PublishResult["state"], reason: string | null): PublishResult => ({ state, reason, journal, objects });
  const acquire = plan.manifest.effects[0], receipt = plan.manifest.effects[1], release = plan.manifest.effects.at(-1)!;
  const ids = options.acknowledge_effect_ids, retireIds = options.retire_effect_ids;
  const selectionConflict = () => journal.events.some(event => ids.includes(event.effect_id) && ["outcome", "retired-absence"].includes(event.kind));
  if (dirname(journal.directory) !== externalArtifactDirectory(options.transport.artifact_root, options.source_repo)
    || options.transport.object_store !== options.object_store.root || plan.transport !== options.transport.kind
    || journal.header.recovery_mode !== "original" || journal.events.some(event => event.kind === "recovery-only")
    || plan.manifest.repository !== options.settings.repository || acquire?.kind !== "lease-acquire" || receipt?.kind !== "receipt-retain"
    || release.kind !== "lease-release" || acquire.payload.ref !== options.settings.publication.lease_ref || release.payload.ref !== acquire.payload.ref
    || receipt.payload.ref !== options.settings.publication.receipt_ref_prefix + plan.manifest.operation_id
    || objects.lease_object === objects.object || objects.receipt_object !== objects.lease_object) return result("pending", "acknowledgement-original-owner-required");
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || !Array.isArray(retireIds) || new Set(retireIds).size !== retireIds.length
    || ids.some(id => retireIds.includes(id) || !plan.manifest.effects.some(effect => effect.id === id && ["pr-create", "issue-create", "comment-create", "pr-update", "pr-close"].includes(effect.kind)))
    || retireIds.some(id => !plan.manifest.effects.some(effect => effect.id === id && !["lease-acquire", "receipt-retain", "lease-release"].includes(effect.kind)))
    || journal.events.some(event => event.kind === "acknowledged-delivery" && !ids.includes(event.effect_id))
    || selectionConflict()) return result("pending", "acknowledgement-selection-invalid");
  const hasAcquisition = journal.events.some(event => event.kind === "attempt" && event.effect_id === acquire.id);
  if (!hasAcquisition) return result("pending", "acknowledgement-original-acquisition-required");
  const refresh = () => {
    journal = readJournal(options.journal_directory, options.source_repo);
    if (selectionConflict()) throw Error("acknowledgement-selection-invalid");
    if (journal.events.some(event => event.kind === "recovery-only" || event.kind === "attempt-ended" && "reaped" in event.payload && !event.payload.reaped)
      || plan.manifest.effects.some(effect => hasInFlightAttempt(journal, effect))) throw Error("acknowledgement-executor-unsettled");
  };
  try {
    refresh(); settled(options, journal, objects);
    const identity = await options.transport.identity();
    if (identity.repository !== plan.manifest.repository || identity.repository_id !== plan.manifest.repository_id
      || identity.actor !== plan.manifest.actor || identity.actor_id !== plan.manifest.actor_id) throw Error("acknowledgement-current-actor-changed");
    if (journal.events.some(event => event.kind === "acknowledged-delivery") && plan.manifest.effects.slice(0, -1).every(effect => terminal(journal, effect.id))) {
      const observed = await options.transport.observe(plan, release, objects);
      refresh();
      if (observed.state === "done") {
        if (!options.inspect_only) {
          if (!journal.events.some(event => event.kind === "intent" && event.effect_id === release.id)) journal = appendIntent(journal, release.id);
          if (!terminal(journal, release.id)) journal = appendOutcome(journal, release.id, observed.outcome);
        }
        return result("acknowledged", null);
      }
    }
    const collect = async () => {
      refresh();
      const currentIdentity = await options.transport.identity();
      if (!canonicalJSON(currentIdentity).equals(canonicalJSON(identity))) throw Error("acknowledgement-current-actor-changed");
      const lease = await options.transport.ref(options.settings.publication.lease_ref);
      if (lease.state !== "present" || lease.object !== objects.lease_object) throw Error("acknowledgement-owned-lease-changed");
      const retained = await options.transport.ref(String(receipt.payload.ref));
      if (retained.state !== "present" || retained.object !== objects.receipt_object) throw Error("acknowledgement-retained-operation-required");
      const acknowledgements = [], retirements = [], accounts: AcknowledgementScope["accounts"] = [];
      const observations = new Map<string, EffectObservation>();
      const lookups = new Map<string, Awaited<ReturnType<typeof lookupAppliedDelivery>>>();
      for (const effect of plan.manifest.effects.slice(0, -1)) {
        if (ids.includes(effect.id)) {
          const lookup = await lookupAppliedDelivery({ ...options, effect_id: effect.id });
          lookups.set(effect.id, lookup);
          acknowledgements.push({ effect_id: effect.id, payload_sha256: sha256(canonicalJSON(effect.payload)), application_sha256: lookup.application_sha256,
            current_sha256: lookup.current_sha256, lookup_sha256: lookup.evidence.sha256, resource_id: lookup.resource_id, differences: lookup.differences, current: lookup.current, parent: lookup.parent });
          continue;
        }
        const completed = terminal(journal, effect.id);
        if (completed?.kind === "retired-absence" && retireIds.includes(effect.id) && "lookup" in completed.payload) {
          const evidence = completed.payload.lookup;
          if (!evidence) throw Error("acknowledgement-retirement-evidence-unavailable");
          const state = JSON.parse(readArtifact(evidence.path).toString()).state;
          if (state !== "absent" && state !== "conflict") throw Error("acknowledgement-retirement-evidence-changed");
          readLookup({ ...options, artifact_root: options.transport.artifact_root, plan, effect, transport: options.transport.kind, state, evidence });
          retirements.push({ effect_id: effect.id, state, lookup_sha256: lookupFactsDigest(evidence.path) });
          continue;
        }
        if (completed) {
          const outcome = completed.payload;
          accounts.push(completed.kind === "outcome" && "resource_id" in outcome
            ? { effect_id: effect.id, disposition: "observed", resource_id: outcome.resource_id, object: outcome.object }
            : { effect_id: effect.id, disposition: completed.kind });
          continue;
        }
        const observed = await options.transport.observe(plan, effect, objects);
        observations.set(effect.id, observed);
        if (observed.state === "done") accounts.push({ effect_id: effect.id, disposition: "observed", resource_id: observed.outcome.resource_id, object: observed.outcome.object });
        else {
          if (!retireIds.includes(effect.id) || observed.state === "unknown" || !observed.evidence || pendingAttempt(journal, effect, true)) throw Error("acknowledgement-remaining-effect-pending");
          readLookup({ ...options, artifact_root: options.transport.artifact_root, plan, effect, transport: options.transport.kind, state: observed.state, evidence: observed.evidence });
          retirements.push({ effect_id: effect.id, state: observed.state, lookup_sha256: lookupFactsDigest(observed.evidence.path) });
        }
      }
      refresh();
      const scope: AcknowledgementScope = { kind: "docs-drift-delivery-acknowledgement", repository: identity.repository, repository_id: identity.repository_id,
        actor: identity.actor, actor_id: identity.actor_id, operation_id: plan.manifest.operation_id, run_id: journal.header.run_id, plan_sha256: journal.header.plan_sha256,
        context: plan.context, transport: plan.transport, source_state_sha256: sha256(canonicalJSON(captureRepositoryState(options.source_repo))),
        settings_sha256: sha256(canonicalJSON(options.settings)),
        settlement_sha256: sha256(canonicalJSON({ business: settled(options, journal, objects), release: releaseSettlement(options, journal, objects) })),
        lease_ref: String(acquire.payload.ref), lease_object: objects.lease_object!, receipt_ref: String(receipt.payload.ref), receipt_object: objects.receipt_object!,
        release_effect_id: release.id, acknowledgements, retirements, accounts };
      return { scope, observations, lookups };
    };
    const initial = await collect(), scopeHash = sha256(canonicalJSON(initial.scope));
    if (options.inspect_only) return { ...result("pending", "inspection-only"), inspection_scope: initial.scope };
    const authorize = async (original?: ReconciliationGrant): Promise<ReconciliationGrant> => {
      const value = await options.authorize(structuredClone(initial.scope));
      if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("acknowledgement-owner-approval-required");
      const grant = value as Record<string, unknown>;
      if (Object.keys(grant).sort().join(",") !== "kind,request_sha256,scope_sha256,source" || grant.kind !== "owner-delivery-acknowledgement"
        || grant.source !== "owner-current-request" || grant.scope_sha256 !== scopeHash || typeof grant.request_sha256 !== "string"
        || !/^[a-f0-9]{64}$/u.test(grant.request_sha256) || original && grant.request_sha256 !== original.request_sha256) throw Error("acknowledgement-owner-approval-required");
      return { kind: "owner-delivery-acknowledgement", scope_sha256: scopeHash, request_sha256: grant.request_sha256 };
    };
    const grant = await authorize();
    const authorityBytes = canonicalJSON({ schema_version: 1, scope: initial.scope, authority: grant });
    const authorityPath = join(dirname(journal.directory), `acknowledgement-${scopeHash}-${grant.request_sha256}.json`);
    try { publishArtifact(authorityPath, authorityBytes); }
    catch (error) { if (!(error instanceof Error) || error.message !== "docs-drift journal revision conflict" || !readArtifact(authorityPath).equals(authorityBytes)) throw error; }
    const revalidate = async () => {
      refresh();
      await authorize(grant);
      const fresh = await collect();
      if (!canonicalJSON(fresh.scope).equals(canonicalJSON(initial.scope))) throw Error("acknowledgement-approved-scope-changed");
      return fresh;
    };
    for (const effect of plan.manifest.effects.slice(0, -1)) {
      if (terminal(journal, effect.id)) continue;
      const fresh = await revalidate();
      if (!journal.events.some(event => event.kind === "intent" && event.effect_id === effect.id)) journal = appendIntent(journal, effect.id);
      const lookup = fresh.lookups.get(effect.id), observed = fresh.observations.get(effect.id);
      if (lookup) journal = appendAcknowledgement(journal, effect.id, { ...grant, kind: "owner-delivery-acknowledgement", lookup: lookup.evidence,
        application_sha256: lookup.application_sha256, settlement_sha256: fresh.scope.settlement_sha256 });
      else if (observed?.state === "done") journal = appendOutcome(journal, effect.id, observed.outcome);
      else if (observed && (observed.state === "absent" || observed.state === "conflict") && observed.evidence) journal = appendRetirement(journal, effect.id,
        { scope_sha256: grant.scope_sha256, request_sha256: grant.request_sha256, lookup: observed.evidence, ...(observed.state === "conflict" ? { unapplied: true as const } : {}) });
      else throw Error("acknowledgement-effect-unaccounted");
    }
    await revalidate();
    if (!journal.events.some(event => event.kind === "intent" && event.effect_id === release.id)) journal = appendIntent(journal, release.id);
    if (pendingAttempt(journal, release)) throw Error("acknowledgement-release-request-pending");
    journal = await executeAttempt({ journal, effect: release, objects, transport: options.transport, reconciliation: grant });
    const released = await options.transport.observe(plan, release, objects);
    refresh();
    if (released.state !== "done") throw Error("acknowledgement-release-unconfirmed");
    journal = appendOutcome(journal, release.id, released.outcome);
    return result("acknowledged", null);
  } catch (error) {
    journal = readJournal(options.journal_directory, options.source_repo);
    return result("pending", error instanceof Error ? error.message : "acknowledgement-evidence-unavailable");
  }
}
