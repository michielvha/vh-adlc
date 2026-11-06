import { executeAttempt, pendingAttempt } from "./attempts";
import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { appendHandoff, appendInvalidation, appendIntent, appendOutcome, appendRetirement, readJournal, writePlanObject, createJournal, publishArtifact, readArtifact, readVerifiedPlan, type Journal, type PlanPolicy, type SealedPlan } from "./journal";
import { readAbsence } from "./observations";
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
  const objects = writePlanObject(options.object_store, journal.plan);
  const retired = new Set(journal.events.filter(event => event.kind === "retired-absence").map(event => event.effect_id));
  const complete = () => journal.plan.manifest.effects.every(effect => terminal(journal, effect.id) || retired.has(effect.id));
  const invalidated = journal.events.some(event => event.kind === "invalidation");
  const blocked = (effectId: string, reason: string, invalidate = false): PublishResult => {
    // An acknowledgement can be lost after a local event was published too. Never overwrite it.
    journal = readJournal(options.journal_directory, options.source_repo);
    if (!intended(journal, effectId)) journal = appendIntent(journal, effectId);
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
      const observation = await options.transport.observe(journal.plan, effect, objects);
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
      if (journal.header.recovery_mode === "observation-only") return blocked(effect.id, "retained-restore-no-replay");
      const attempt = pendingAttempt(journal, effect);
      if (attempt) return blocked(effect.id, attempt);
      if (retired.size > 0 || invalidated) return blocked(effect.id, "reconciliation-only-no-replay");
      await verifyPublicationGate(options, journal);
      const lease = await options.transport.ref(options.settings.publication.lease_ref);
      if (effect.kind === "lease-acquire") {
        if (lease.state !== "absent") return blocked(effect.id, "publication-lease-occupied");
      } else if (lease.state !== "present" || lease.object !== objects.object) {
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


type RetainedOptions = {
  source_repo: string; artifact_root: string; settings: Settings; transport: PublicationTransport; operation_id: string;
  verify_policy: (plan: SealedPlan) => PlanPolicy | null;
};
export type RetainedInspection = {
  state: "inspection"; directory: string; plan: SealedPlan; ref: string; objects: PlanObjects;
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
  let ref = options.settings.publication.receipt_ref_prefix + options.operation_id;
  let target = await options.transport.ref(ref);
  if (target.state === "absent") { ref = options.settings.publication.lease_ref; target = await options.transport.ref(ref); }
  if (target.state === "absent") throw Error("retained operation unavailable; original proof cannot be reconstructed");
  const native = await options.transport.readPlanObject(target.object);
  const bytes = Buffer.from(native.bytes);
  const objects = JSON.parse(canonicalJSON(native.objects).toString()) as PlanObjects;
  if (Object.keys(objects).sort().join(",") !== "blob,object,plan_sha256,tree" || objects.object !== target.object
    || [objects.object, objects.tree, objects.blob].some(value => !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value))
    || objects.plan_sha256 !== sha256(bytes)) throw Error("retained metadata object binding");
  const plan = readVerifiedPlan(bytes, options.verify_policy);
  if (plan.manifest.repository !== options.settings.repository || plan.manifest.repository_id !== identity.repository_id
    || plan.manifest.actor !== options.settings.publication.actor || plan.manifest.operation_id !== options.operation_id
    || plan.transport !== options.transport.kind) throw Error("retained operation scope changed");
  const observations: RetainedInspection["observations"] = [];
  for (const effect of plan.manifest.effects) {
    let observation: EffectObservation;
    try { observation = await options.transport.observe(plan, effect, objects); }
    catch { observation = { state: "unknown", reason: "native-inspection-unavailable" }; }
    observations.push({ effect_id: effect.id, observation });
  }
  const current = await options.transport.ref(ref);
  if (current.state !== "present" || current.object !== target.object) throw Error("retained ref changed during inspection");
  const run = randomUUID(), directory = join(root, "retained-inspection-" + run);
  publishArtifact(join(root, run + ".retained-inspection-owner.json"), canonicalJSON({ schema_version: 1, kind: "docs-drift-retained-inspection",
    root: directory, owner: process.getuid?.() ?? null, run, repository: plan.manifest.repository, source_commit: plan.manifest.bindings.source_commit, ref, object: objects.object }));
  mkdirSync(directory, { mode: 0o700 });
  publishArtifact(join(directory, "plan.json"), bytes);
  publishArtifact(join(directory, "observations.json"), canonicalJSON({ state: "inspection", reader_identity: identity, ref, objects, observations }));
  const result: RetainedInspection = freezeJSON({ state: "inspection", directory, plan, ref, objects, observations });
  inspected.set(result, { transport: options.transport, source_repo: source });
  return result;
}

export async function restoreRetainedOperation(options: { inspection: RetainedInspection; publication: PublishOptions }): Promise<PublishResult> {
  const origin = inspected.get(options.inspection), publication = options.publication;
  if (!origin || origin.transport !== publication.transport || origin.source_repo !== realpathSync(publication.source_repo)
    || !canonicalJSON(options.inspection.plan).equals(canonicalJSON(publication.plan))) throw Error("missing actual retained inspection");
  await verifyPublicationGate(publication, null);
  const objects = writePlanObject(publication.object_store, publication.plan);
  if (!canonicalJSON(objects).equals(canonicalJSON(options.inspection.objects))) throw Error("restored operation object changed");
  const journal = createJournal({ source_repo: publication.source_repo, artifact_root: publication.artifact_root, plan: publication.plan, recovery_mode: "observation-only" });
  publishArtifact(join(journal.directory, "retained-origin.json"), canonicalJSON({ schema_version: 1,
    source: "retained-ref", ref: options.inspection.ref, object: objects.object, plan_sha256: objects.plan_sha256 }));
  return resumeEffects({ ...publication, journal_directory: journal.directory });
}


export type ReconciliationScope = {
  repository: string; repository_id: number; operation_id: string; plan_sha256: string;
  lease_ref: string; lease_object: string; release_effect_id: string; retire_effect_ids: string[];
  actor: string; actor_id: number;
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
  const objects = writePlanObject(options.object_store, plan);
  const release = plan.manifest.effects.at(-1), acquire = plan.manifest.effects[0];
  if (!release || release.kind !== "lease-release" || acquire?.kind !== "lease-acquire" || release.payload.ref !== acquire.payload.ref
    || release.payload.ref !== options.settings.publication.lease_ref || plan.manifest.repository !== options.settings.repository
    || plan.transport !== options.transport.kind || options.transport.object_store !== options.object_store.root) throw Error("reconciliation scope changed");
  if (!Array.isArray(options.retire_effect_ids)) throw Error("invalid selected retirement IDs");
  const ids = [...options.retire_effect_ids];
  if (new Set(ids).size !== ids.length || ids.some(id => id === release.id || !plan.manifest.effects.some(effect => effect.id === id))) throw Error("invalid selected retirement IDs");
  const isRetired = (id: string) => journal.events.some(event => event.kind === "retired-absence" && event.effect_id === id);
  const finished = () => plan.manifest.effects.every(effect => terminal(journal, effect.id) || isRetired(effect.id));
  const result = (state: PublishResult["state"], reason: string | null): PublishResult => ({ state, reason, journal, objects });
  const blocked = (reason: string) => result("pending", reason);
  if (finished()) return result(journal.events.some(event => event.kind === "retired-absence") ? "retired" : "complete", null);
  try {
    const identity = await options.transport.identity();
    if (identity.repository !== plan.manifest.repository || identity.repository_id !== plan.manifest.repository_id) return blocked("reconciliation-repository-changed");
    const lease = await options.transport.ref(String(release.payload.ref));
    if (lease.state === "present" && lease.object !== objects.object) return blocked("foreign-publication-lease");
    const scope: ReconciliationScope = { repository: identity.repository, repository_id: identity.repository_id, operation_id: plan.manifest.operation_id,
      plan_sha256: sha256(canonicalJSON(plan)), lease_ref: String(release.payload.ref), lease_object: objects.object,
      release_effect_id: release.id, retire_effect_ids: [...ids], actor: identity.actor, actor_id: identity.actor_id };
    const scopeHash = sha256(canonicalJSON(scope));
    const authorize = async (original?: ReconciliationAuthority): Promise<ReconciliationAuthority> => {
      const value = await options.authorize(structuredClone(scope));
      if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("missing current reconciliation authority");
      canonicalJSON(value);
      const grant = value as Record<string, unknown>;
      if (Object.keys(grant).sort().join(",") !== "request_sha256,scope_sha256" || grant.scope_sha256 !== scopeHash
        || typeof grant.request_sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(grant.request_sha256)
        || (original && original.request_sha256 !== grant.request_sha256)) throw Error("changed reconciliation authority");
      return { scope_sha256: scopeHash, request_sha256: grant.request_sha256 };
    };
    const grant = await authorize();
    const bytes = canonicalJSON({ schema_version: 1, scope, authority: grant });
    const path = join(dirname(journal.directory), `reconciliation-${scopeHash}-${grant.request_sha256}.json`);
    try { publishArtifact(path, bytes); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== "docs-drift journal revision conflict" || !readArtifact(path).equals(bytes)) throw error;
    }
    for (const effect of plan.manifest.effects.slice(0, -1)) {
      if (terminal(journal, effect.id) || isRetired(effect.id)) continue;
      const observation = await options.transport.observe(plan, effect, objects);
      if (observation.state === "unknown" || observation.state === "conflict") return blocked(observation.reason);
      if (!intended(journal, effect.id)) journal = appendIntent(journal, effect.id);
      if (observation.state === "done") { journal = appendOutcome(journal, effect.id, observation.outcome); continue; }
      if (observation.state !== "absent" || !ids.includes(effect.id) || !observation.evidence) return blocked("known-absence-retirement-not-authorized");
      if (journal.header.recovery_mode === "observation-only") return blocked("retained-absence-not-definitive");
      const pending = pendingAttempt(journal, effect, true);
      if (pending) return blocked(pending);
      const lookup = readAbsence({ evidence: observation.evidence, artifact_root: options.transport.artifact_root, source_repo: options.source_repo,
        plan, effect, transport: options.transport.kind });
      await authorize(grant);
      journal = appendRetirement(journal, effect.id, { ...grant, lookup });
    }
    if (!intended(journal, release.id)) journal = appendIntent(journal, release.id);
    const before = await options.transport.observe(plan, release, objects);
    if (before.state === "conflict" || before.state === "unknown") return blocked(before.reason);
    if (before.state === "done") journal = appendOutcome(journal, release.id, before.outcome);
    else {
      await authorize(grant);
      const currentIdentity = await options.transport.identity();
      if (currentIdentity.actor_id !== identity.actor_id || currentIdentity.actor !== identity.actor
        || currentIdentity.repository_id !== identity.repository_id || currentIdentity.repository !== identity.repository) return blocked("cleanup-actor-changed");
      const currentLease = await options.transport.ref(scope.lease_ref);
      if (currentLease.state !== "present" || currentLease.object !== objects.object) return blocked("owned-cleanup-lease-changed");
      const attempt = pendingAttempt(journal, release);
      if (attempt) return blocked(attempt);
      journal = await executeAttempt({ journal, effect: release, objects, transport: options.transport });
      const after = await options.transport.observe(plan, release, objects);
      if (after.state !== "done") return blocked("lease-release-outcome-unconfirmed");
      journal = appendOutcome(journal, release.id, after.outcome);
    }
    return result(journal.events.some(event => event.kind === "retired-absence") ? "retired" : "complete", null);
  } catch { journal = readJournal(options.journal_directory, options.source_repo); return blocked("reconciliation-authority-or-evidence-unavailable"); }
}
