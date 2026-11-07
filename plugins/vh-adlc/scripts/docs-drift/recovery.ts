import { executeAttempt, pendingAttempt, hasEffectAttempt } from "./attempts";
import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { appendHandoff, appendInvalidation, appendIntent, appendOutcome, appendRetirement, appendRecoveryOnly, isObservationOnly, readJournal, writePlanObject, writePublicationObjects, createJournal, publishArtifact, readArtifact, readRetainedPlan, readVerifiedPlan, type Journal, type PlanPolicy, type SealedPlan } from "./journal";
import { readLookup } from "./observations";
import { canonicalJSON, freezeJSON, sha256 } from "./protocol";
import { publicationMarker } from "./report-history";
import { externalArtifactDirectory } from "./snapshot";
import type { Settings } from "./settings";
import type { PublicationTransport, PlanObjects, EffectObservation } from "./transport";
import { PublicationScopeChanged, verifyPublicationGate, type PublishOptions, type PublishResult } from "./publish";

function terminal(journal: Journal, effectId: string): boolean {
  return journal.events.some(event => event.effect_id === effectId && event.kind === "outcome");
}
function intended(journal: Journal, effectId: string): boolean {
  return journal.events.some(event => event.effect_id === effectId && event.kind === "intent");
}

/** Observation can reconcile an old effect. A fresh gate is mandatory before every new remote write. */
export async function resumeEffects(options: PublishOptions & { journal_directory: string }): Promise<PublishResult> {
  let journal = readJournal(options.journal_directory, options.source_repo);
  if (dirname(journal.directory) !== externalArtifactDirectory(options.transport.artifact_root, options.source_repo)
    || options.artifact_root !== options.transport.artifact_root) throw Error("selected recovery artifact root changed");
  if (!canonicalJSON(journal.plan).equals(canonicalJSON(options.plan)) || options.transport.kind !== journal.plan.transport
    || options.transport.object_store !== options.object_store.root) throw Error("recovery payload or transport changed; inspect the original operation");
  const objects = writePublicationObjects(options.object_store, journal.plan, journal.header);
  const retired = new Set(journal.events.filter(event => event.kind === "retired-absence").map(event => event.effect_id));
  const complete = () => journal.plan.manifest.effects.every(effect => terminal(journal, effect.id) || retired.has(effect.id));
  const invalidated = journal.events.some(event => event.kind === "invalidation");
  const blocked = (effectId: string, reason: string, invalidate = false, recoveryOnly = false): PublishResult => {
    // An acknowledgement can be lost after a local event was published too. Never overwrite it.
    journal = readJournal(options.journal_directory, options.source_repo);
    if (!intended(journal, effectId)) journal = appendIntent(journal, effectId);
    if (recoveryOnly) journal = appendRecoveryOnly(journal, effectId, reason);
    if (invalidate) journal = appendInvalidation(journal, effectId, reason);
    journal = appendHandoff(journal, effectId, reason);
    return { state: "pending", reason, journal, objects };
  };
  if (complete()) return { state: retired.size ? "retired" : invalidated ? "invalidated" : "complete", reason: null, journal, objects };
  // This also establishes native contents visibility before any 404 is treated as ref absence.
  const firstPending = journal.plan.manifest.effects.find(effect => !terminal(journal, effect.id) && !retired.has(effect.id));
  if (!firstPending) throw Error("recovery pending-effect invariant");
  try { await options.transport.identity(); }
  catch { return blocked(firstPending.id, "native-recovery-observation-unavailable"); }

  const onlyRelease = journal.plan.manifest.effects.every(effect => effect.kind === "lease-release" || terminal(journal, effect.id) || retired.has(effect.id));
  for (const effect of journal.plan.manifest.effects) {
    if (retired.has(effect.id) || ((retired.size > 0 || onlyRelease) && terminal(journal, effect.id))) continue;
    // Acquired leases are temporary. A recorded acquisition is checked again before replay below.
    if (effect.kind === "lease-acquire" && terminal(journal, effect.id)) continue;
    try {
      if (!terminal(journal, effect.id) && effect.kind === "lease-acquire") {
        if (isObservationOnly(journal)) {
          const inferred = await restoredAcquisition(options, journal, objects);
          if (inferred) {
            if (!intended(journal, effect.id)) journal = appendIntent(journal, effect.id);
            journal = appendOutcome(journal, effect.id, inferred);
            continue;
          }
          const lease = await options.transport.ref(options.settings.publication.lease_ref);
          if (lease.state === "present" && lease.object !== objects.lease_object) return blocked(effect.id, "foreign-publication-lease");
        } else {
          const lease = await options.transport.ref(options.settings.publication.lease_ref);
          if (lease.state === "present" && lease.object !== objects.lease_object) {
            const receipt = await options.transport.ref(options.settings.publication.receipt_ref_prefix + journal.plan.manifest.operation_id);
            if (receipt.state === "present") return blocked(effect.id, "operation-started-elsewhere", false, true);
            return blocked(effect.id, "publication-lease-occupied");
          }
        }
      }
      if (effect.kind === "receipt-retain" && !terminal(journal, effect.id) && !isObservationOnly(journal)) {
        const receipt = await options.transport.ref(String(effect.payload.ref));
        journal = readJournal(journal.directory, options.source_repo);
        if (receipt.state === "present" && !hasEffectAttempt(journal, effect.id))
          return blocked(effect.id, "operation-started-elsewhere", false, true);
      }
      const observation = await options.transport.observe(journal.plan, effect, objects);
      journal = readJournal(journal.directory, options.source_repo);
      const active = pendingAttempt(journal, effect);
      if (observation.state !== "done" && (active === "attempt-in-flight" || active === "attempt-not-reaped")) return blocked(effect.id, active);
      if (observation.state === "conflict" && effect.kind === "lease-acquire" && !terminal(journal, effect.id) && !isObservationOnly(journal)) {
        const lease = await options.transport.ref(options.settings.publication.lease_ref);
        if (lease.state === "absent" || lease.object !== objects.lease_object) {
          const receipt = await options.transport.ref(options.settings.publication.receipt_ref_prefix + journal.plan.manifest.operation_id);
          if (receipt.state === "present") return blocked(effect.id, "operation-started-elsewhere", false, true);
          return blocked(effect.id, "publication-lease-occupied");
        }
        return blocked(effect.id, "lease-acquisition-observation-changed");
      }
      if (observation.state === "conflict" || observation.state === "unknown") return blocked(effect.id, observation.reason, observation.state === "conflict");
      if (terminal(journal, effect.id)) {
        if (observation.state !== "done") return blocked(effect.id, "completed-effect-materially-changed", true);
        continue;
      }
      if (!intended(journal, effect.id)) journal = appendIntent(journal, effect.id);
      if (observation.state === "done") {
        journal = appendOutcome(journal, effect.id, observation.outcome);
        continue;
      }
      const acquisition = journal.plan.manifest.effects[0];
      const ownedRelease = effect.kind === "lease-release" && journal.header.recovery_mode === "original"
        && journal.plan.manifest.effects.every(item => item.id === effect.id || terminal(journal, item.id))
        && journal.events.some(event => event.effect_id === acquisition.id && event.kind === "attempt")
        && journal.events.some(event => event.effect_id === acquisition.id && event.kind === "outcome"
          && "object" in event.payload && event.payload.object === objects.lease_object);
      if (isObservationOnly(journal) && !ownedRelease) return blocked(effect.id, "retained-restore-no-replay");
      const attempt = pendingAttempt(journal, effect);
      if (attempt) return blocked(effect.id, attempt);
      if (retired.size > 0 || invalidated) return blocked(effect.id, "reconciliation-only-no-replay");
      await verifyPublicationGate(options, journal);
      const lease = await options.transport.ref(options.settings.publication.lease_ref);
      if (effect.kind === "lease-acquire") {
        const receipt = await options.transport.ref(options.settings.publication.receipt_ref_prefix + journal.plan.manifest.operation_id);
        if (receipt.state === "present") return blocked(effect.id, "operation-started-elsewhere", false, true);
        if (lease.state !== "absent") return blocked(effect.id, "publication-lease-occupied");
      } else if (lease.state !== "present" || lease.object !== objects.lease_object) {
        return blocked(effect.id, "publication-lease-lost");
      }
      // A complete, unchanged absence plus current original proof/authority permits this one replay.
      journal = await executeAttempt({ journal, effect, objects, transport: options.transport });
      const after = await options.transport.observe(journal.plan, effect, objects);
      if (after.state !== "done") return blocked(effect.id, "replayed-effect-outcome-unconfirmed", after.state === "conflict");
      journal = appendOutcome(journal, effect.id, after.outcome);
    } catch (error) { return blocked(effect.id, "current-proof-or-recovery-effect-unavailable", error instanceof PublicationScopeChanged); }
  }
  return { state: retired.size ? "retired" : invalidated ? "invalidated" : "complete", reason: null, journal, objects };
}


/** A retained receipt proves earlier acquisition, without inventing the lost acquiring nonce. */
async function restoredAcquisition(options: PublishOptions, journal: Journal, objects: PlanObjects) {
  const receipt = journal.plan.manifest.effects[1];
  if (receipt?.kind !== "receipt-retain" || receipt.payload.ref !== options.settings.publication.receipt_ref_prefix + journal.plan.manifest.operation_id) return null;
  const lease = await options.transport.ref(options.settings.publication.lease_ref);
  if (lease.state === "present" && lease.object !== journal.header.observed_lease_object) {
    const current = await options.transport.readPlanObject(lease.object);
    const bytes = Buffer.from(current.bytes);
    if (current.objects.object !== lease.object || current.objects.plan_sha256 !== sha256(bytes)
      || bytes.equals(canonicalJSON(journal.plan))) return null;
  }
  const retained = await options.transport.observe(journal.plan, receipt, objects);
  if (retained.state !== "done") return null;
  const bytes = canonicalJSON({ schema_version: 1, kind: "receipt-proves-acquisition", operation_id: journal.plan.manifest.operation_id,
    plan_sha256: objects.plan_sha256, receipt: retained.outcome, lease });
  const digest = sha256(bytes), path = join(journal.directory, "derived-acquisition-" + digest + ".json");
  try { publishArtifact(path, bytes); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== "docs-drift journal revision conflict" || !readArtifact(path).equals(bytes)) throw error;
  }
  return { state: "observed" as const, observation_sha256: digest, resource_id: options.settings.publication.lease_ref, object: null };
}


type RetainedOptions = {
  source_repo: string; artifact_root: string; settings: Settings; transport: PublicationTransport; operation_id: string;
  verify_policy: (plan: SealedPlan) => PlanPolicy | null;
};
export type RetainedInspection = {
  state: "inspection"; policy_state: "current" | "unavailable-or-changed"; directory: string; plan: SealedPlan; ref: string; objects: PlanObjects; lease_object: string | null; receipt_object: string | null;
  observations: Array<{ effect_id: string; observation: EffectObservation }>;
};
const inspected = new WeakMap<object, { transport: PublicationTransport; source_repo: string }>();

/** Inspect the fixed retained payload. Replay requires the original native proof and current authority. */
export async function inspectRetainedOperation(options: RetainedOptions): Promise<RetainedInspection> {
  publicationMarker(options.settings, options.operation_id);
  if (options.artifact_root !== options.transport.artifact_root) throw Error("selected inspection artifact root changed");
  const source = realpathSync(options.source_repo);
  const root = externalArtifactDirectory(options.artifact_root, source);
  const identity = await options.transport.identity();
  if (identity.repository !== options.settings.repository || identity.default_branch !== options.settings.default_branch) throw Error("retained inspection repository scope");
  const receiptRef = options.settings.publication.receipt_ref_prefix + options.operation_id;
  const inspectedReceipt = await options.transport.ref(receiptRef);
  let ref = receiptRef, target = inspectedReceipt;
  const receipt_object = target.state === "present" ? target.object : null;
  if (target.state === "absent") { ref = options.settings.publication.lease_ref; target = await options.transport.ref(ref); }
  if (target.state === "absent") throw Error("retained operation unavailable; original proof cannot be reconstructed");
  const native = await options.transport.readPlanObject(target.object);
  const bytes = Buffer.from(native.bytes);
  const objects = JSON.parse(canonicalJSON(native.objects).toString()) as PlanObjects;
  if (Object.keys(objects).sort().join(",") !== "blob,object,plan_sha256,tree" || objects.object !== target.object
    || [objects.object, objects.tree, objects.blob].some(value => !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value))
    || objects.plan_sha256 !== sha256(bytes)) throw Error("retained metadata object binding");
  const plan = readRetainedPlan(bytes);
  let policy_state: RetainedInspection["policy_state"] = "current";
  try { readVerifiedPlan(bytes, options.verify_policy); }
  catch { policy_state = "unavailable-or-changed"; }
  if (plan.manifest.repository !== options.settings.repository || plan.manifest.repository_id !== identity.repository_id
    || plan.manifest.actor !== options.settings.publication.actor || plan.manifest.operation_id !== options.operation_id
    || plan.transport !== options.transport.kind) throw Error("retained operation scope changed");
  let lease_object: string | null = null;
  const lease = await options.transport.ref(options.settings.publication.lease_ref);
  if (lease.state === "present") {
    try {
      const retainedLease = await options.transport.readPlanObject(lease.object);
      if (Buffer.from(retainedLease.bytes).equals(bytes) && retainedLease.objects.tree === objects.tree
        && retainedLease.objects.blob === objects.blob && retainedLease.objects.plan_sha256 === objects.plan_sha256) lease_object = lease.object;
    } catch { /* An unavailable or foreign lease establishes no cleanup ownership. */ }
  }
  const observationObjects = { ...objects, receipt_object: receipt_object ?? objects.object, ...(lease_object === null ? {} : { lease_object }) };
  const observations: RetainedInspection["observations"] = [];
  for (const effect of plan.manifest.effects) {
    let observation: EffectObservation;
    try {
      observation = receipt_object === null && effect.kind === "receipt-retain"
        ? { state: "unknown", reason: "receipt-not-retained-at-inspection-start" }
        : await options.transport.observe(plan, effect, observationObjects);
    } catch { observation = { state: "unknown", reason: "native-inspection-unavailable" }; }
    observations.push({ effect_id: effect.id, observation });
  }
  const current = await options.transport.ref(ref);
  if (current.state !== "present" || current.object !== target.object) throw Error("retained ref changed during inspection");
  if (!canonicalJSON(await options.transport.ref(receiptRef)).equals(canonicalJSON(inspectedReceipt))) throw Error("retained receipt changed during inspection");
  const run = randomUUID(), directory = join(root, "retained-inspection-" + run);
  publishArtifact(join(root, run + ".retained-inspection-owner.json"), canonicalJSON({ schema_version: 1, kind: "docs-drift-retained-inspection",
    root: directory, owner: process.getuid?.() ?? null, run, repository: plan.manifest.repository, source_commit: plan.manifest.bindings.source_commit, ref, object: objects.object }));
  mkdirSync(directory, { mode: 0o700 });
  publishArtifact(join(directory, "plan.json"), bytes);
  publishArtifact(join(directory, "observations.json"), canonicalJSON({ state: "inspection", policy_state, reader_identity: identity, ref, objects, lease_object, receipt_object, observations }));
  const result: RetainedInspection = freezeJSON({ state: "inspection", policy_state, directory, plan, ref, objects, lease_object, receipt_object, observations });
  inspected.set(result, { transport: options.transport, source_repo: source });
  return result;
}

export async function restoreRetainedOperation(options: { inspection: RetainedInspection; publication: PublishOptions }): Promise<PublishResult> {
  const origin = inspected.get(options.inspection), publication = options.publication;
  if (!origin || origin.transport !== publication.transport || origin.source_repo !== realpathSync(publication.source_repo)
    || !canonicalJSON(options.inspection.plan).equals(canonicalJSON(publication.plan))) throw Error("missing actual retained inspection");
  readRetainedPlan(canonicalJSON(publication.plan));
  if (publication.transport.kind !== publication.plan.transport || publication.transport.object_store !== publication.object_store.root
    || publication.artifact_root !== publication.transport.artifact_root) throw Error("restored transport or artifact scope changed");
  const identity = await publication.transport.identity();
  if (identity.repository !== publication.plan.manifest.repository || identity.repository_id !== publication.plan.manifest.repository_id) throw Error("restored repository changed");
  const objects = writePlanObject(publication.object_store, publication.plan);
  if (objects.tree !== options.inspection.objects.tree || objects.blob !== options.inspection.objects.blob
    || objects.plan_sha256 !== options.inspection.objects.plan_sha256) throw Error("restored operation object changed");
  const journal = createJournal({ source_repo: publication.source_repo, artifact_root: publication.artifact_root, plan: publication.plan, recovery_mode: "observation-only", observed_lease_object: options.inspection.lease_object, observed_receipt_object: options.inspection.receipt_object });
  publishArtifact(join(journal.directory, "retained-origin.json"), canonicalJSON({ schema_version: 1,
    source: "retained-ref", ref: options.inspection.ref, object: options.inspection.objects.object, plan_sha256: objects.plan_sha256 }));
  return resumeEffects({ ...publication, journal_directory: journal.directory });
}


export type ReconciliationScope = {
  repository: string; repository_id: number; operation_id: string; plan_sha256: string;
  lease_ref: string; lease_object: string; release_effect_id: string; retire_effect_ids: string[];
  actor: string; actor_id: number;
  retain_receipt: { effect_id: string; ref: string; object: string } | null;
  retirement?: { effect_id: string; observed_state: "conflict"; lookup: { path: string; sha256: string } };
};
type ReconciliationAuthority = { scope_sha256: string; request_sha256: string };

/** The actual request/adopted-procedure controller names this cleanup independently of old publication grants. */
export async function reconcileAbsent(options: {
  source_repo: string; journal_directory: string; object_store: PublishOptions["object_store"]; settings: Settings;
  transport: PublicationTransport; retire_effect_ids: string[];
  authorize: (scope: ReconciliationScope) => Promise<unknown>;
}): Promise<PublishResult> {
  let journal = readJournal(options.journal_directory, options.source_repo);
  if (dirname(journal.directory) !== externalArtifactDirectory(options.transport.artifact_root, options.source_repo)) throw Error("selected reconciliation artifact root changed");
  const { plan } = journal;
  const objects = writePublicationObjects(options.object_store, plan, journal.header);
  const release = plan.manifest.effects.at(-1), acquire = plan.manifest.effects[0], receipt = plan.manifest.effects[1];
  const receiptObject = objects.receipt_object ?? objects.object;
  if (!release || release.kind !== "lease-release" || acquire?.kind !== "lease-acquire" || release.payload.ref !== acquire.payload.ref
    || release.payload.ref !== options.settings.publication.lease_ref || plan.manifest.repository !== options.settings.repository
    || receipt?.kind !== "receipt-retain" || receipt.payload.ref !== options.settings.publication.receipt_ref_prefix + plan.manifest.operation_id
    || plan.transport !== options.transport.kind || options.transport.object_store !== options.object_store.root) throw Error("reconciliation scope changed");
  if (!Array.isArray(options.retire_effect_ids)) throw Error("invalid selected retirement IDs");
  const ids = [...options.retire_effect_ids];
  if (new Set(ids).size !== ids.length || ids.some(id => id === release.id || !plan.manifest.effects.some(effect => effect.id === id))) throw Error("invalid selected retirement IDs");
  const isRetired = (id: string) => journal.events.some(event => event.kind === "retired-absence" && event.effect_id === id);
  const finished = () => plan.manifest.effects.every(effect => terminal(journal, effect.id) || isRetired(effect.id));
  const result = (state: PublishResult["state"], reason: string | null): PublishResult => ({ state, reason, journal, objects });
  const blocked = (reason: string) => result("pending", reason);
  if (ids.includes(receipt.id) || isRetired(receipt.id)) return blocked("receipt-retention-required");
  if (finished()) return result(journal.events.some(event => event.kind === "retired-absence") ? "retired" : "complete", null);
  try {
    const identity = await options.transport.identity();
    if (identity.repository !== plan.manifest.repository || identity.repository_id !== plan.manifest.repository_id) return blocked("reconciliation-repository-changed");
    const lease = await options.transport.ref(String(release.payload.ref));
    if (journal.header.recovery_mode === "observation-only" && lease.state === "present") return blocked("inferred-publication-lease");
    if (plan.manifest.effects.slice(0, -1).every(effect => terminal(journal, effect.id) || isRetired(effect.id))) {
      const released = await options.transport.observe(plan, release, objects);
      if (released.state === "done") {
        if (!intended(journal, release.id)) journal = appendIntent(journal, release.id);
        journal = appendOutcome(journal, release.id, released.outcome);
        return result(journal.events.some(event => event.kind === "retired-absence") ? "retired" : "complete", null);
      }
    }
    if (lease.state === "present" && lease.object !== objects.lease_object) return blocked("foreign-publication-lease");
    const retained = await options.transport.ref(String(receipt.payload.ref));
    if (retained.state === "present" && retained.object !== receiptObject) return blocked("retained-operation-changed");
    if (retained.state === "absent" && terminal(journal, receipt.id)) return blocked("retained-operation-removed");
    const scope: ReconciliationScope = { repository: identity.repository, repository_id: identity.repository_id, operation_id: plan.manifest.operation_id,
      plan_sha256: sha256(canonicalJSON(plan)), lease_ref: String(release.payload.ref), lease_object: objects.lease_object,
      release_effect_id: release.id, retire_effect_ids: [...ids], actor: identity.actor, actor_id: identity.actor_id,
      retain_receipt: retained.state === "absent" ? { effect_id: receipt.id, ref: String(receipt.payload.ref), object: receiptObject } : null };
    const authorize = async (original?: ReconciliationAuthority, selectedScope = scope): Promise<ReconciliationAuthority> => {
      const scopeHash = sha256(canonicalJSON(selectedScope));
      const value = await options.authorize(structuredClone(selectedScope));
      if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("missing current reconciliation authority");
      canonicalJSON(value);
      const grant = value as Record<string, unknown>;
      if (Object.keys(grant).sort().join(",") !== "request_sha256,scope_sha256" || grant.scope_sha256 !== scopeHash
        || typeof grant.request_sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(grant.request_sha256)
        || (original && original.request_sha256 !== grant.request_sha256)) throw Error("changed reconciliation authority");
      return { scope_sha256: scopeHash, request_sha256: grant.request_sha256 };
    };
    const grant = await authorize();
    const requireOwnedLease = async () => {
      if (journal.header.recovery_mode === "observation-only") throw Error("original lease ownership proof unavailable");
      const currentIdentity = await options.transport.identity();
      if (currentIdentity.actor_id !== identity.actor_id || currentIdentity.actor !== identity.actor
        || currentIdentity.repository_id !== identity.repository_id || currentIdentity.repository !== identity.repository) throw Error("cleanup actor changed");
      const currentLease = await options.transport.ref(scope.lease_ref);
      if (currentLease.state !== "present" || currentLease.object !== objects.lease_object) throw Error("owned cleanup lease changed");
    };
    const retainAuthority = (selectedScope: ReconciliationScope, authority: ReconciliationAuthority) => {
      const bytes = canonicalJSON({ schema_version: 1, scope: selectedScope, authority });
      const path = join(dirname(journal.directory), `reconciliation-${authority.scope_sha256}-${authority.request_sha256}.json`);
      try { publishArtifact(path, bytes); }
      catch (error) {
        if (!(error instanceof Error) || error.message !== "docs-drift journal revision conflict" || !readArtifact(path).equals(bytes)) throw error;
      }
    };
    retainAuthority(scope, grant);
    for (const effect of plan.manifest.effects.slice(0, -1)) {
      if (terminal(journal, effect.id) || isRetired(effect.id)) continue;
      const observation = await options.transport.observe(plan, effect, objects);
      journal = readJournal(journal.directory, options.source_repo);
      const active = pendingAttempt(journal, effect);
      if (observation.state !== "done" && (active === "attempt-in-flight" || active === "attempt-not-reaped")) return blocked(active);
      if (observation.state === "unknown" || observation.state === "conflict" && ["lease-acquire", "receipt-retain"].includes(effect.kind)) return blocked(observation.reason);
      if (!intended(journal, effect.id)) journal = appendIntent(journal, effect.id);
      if (observation.state === "done") { journal = appendOutcome(journal, effect.id, observation.outcome); continue; }
      if (effect.id === receipt.id) {
        if (!scope.retain_receipt) return blocked("receipt-retention-scope-changed");
        await authorize(grant);
        await requireOwnedLease();
        if (pendingAttempt(journal, effect)) return blocked("receipt-attempt-pending");
        journal = await executeAttempt({ journal, effect, objects, transport: options.transport, reconciliation: grant });
        const after = await options.transport.observe(plan, effect, objects);
        if (after.state !== "done") return blocked("receipt-retention-outcome-unconfirmed");
        journal = appendOutcome(journal, effect.id, after.outcome);
        continue;
      }
      if (!ids.includes(effect.id) || !observation.evidence) return blocked("known-absence-retirement-not-authorized");
      if (isObservationOnly(journal)) return blocked("retained-absence-not-definitive");
      const conflicting = observation.state === "conflict";
      const pending = pendingAttempt(journal, effect, true);
      if (pending) return blocked(pending);
      const lookup = readLookup({ evidence: observation.evidence, artifact_root: options.transport.artifact_root, source_repo: options.source_repo,
        plan, effect, transport: options.transport.kind, state: conflicting ? "conflict" : "absent" });
      const retirementScope: ReconciliationScope = conflicting ? { ...scope,
        retirement: { effect_id: effect.id, observed_state: "conflict", lookup } } : scope;
      const retirementGrant = await authorize(grant, retirementScope);
      retainAuthority(retirementScope, retirementGrant);
      await requireOwnedLease();
      readLookup({ evidence: lookup, artifact_root: options.transport.artifact_root, source_repo: options.source_repo,
        plan, effect, transport: options.transport.kind, state: conflicting ? "conflict" : "absent" });
      const currentAttempt = pendingAttempt(journal, effect, true);
      if (currentAttempt) return blocked(currentAttempt);
      journal = appendRetirement(journal, effect.id, { ...retirementGrant, lookup, ...(conflicting ? { unapplied: true as const } : {}) });
    }
    const fence = await options.transport.ref(String(receipt.payload.ref));
    if (fence.state !== "present" || fence.object !== receiptObject) return blocked("retained-operation-removed");
    if (!intended(journal, release.id)) journal = appendIntent(journal, release.id);
    const before = await options.transport.observe(plan, release, objects);
    if (before.state === "conflict" || before.state === "unknown") return blocked(before.reason);
    if (before.state === "done") journal = appendOutcome(journal, release.id, before.outcome);
    else {
      await authorize(grant);
      await requireOwnedLease();
      const attempt = pendingAttempt(journal, release);
      if (attempt) return blocked(attempt);
      journal = await executeAttempt({ journal, effect: release, objects, transport: options.transport, reconciliation: grant });
      const after = await options.transport.observe(plan, release, objects);
      if (after.state !== "done") return blocked("lease-release-outcome-unconfirmed");
      journal = appendOutcome(journal, release.id, after.outcome);
    }
    return result(journal.events.some(event => event.kind === "retired-absence") ? "retired" : "complete", null);
  } catch { journal = readJournal(options.journal_directory, options.source_repo); return blocked("reconciliation-authority-or-evidence-unavailable"); }
}
