import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { appendHandoff, appendIntent, appendOutcome, readJournal, writePlanObject, createJournal, publishArtifact, readVerifiedPlan, type Journal, type PlanPolicy, type SealedPlan } from "./journal";
import { canonicalJSON, freezeJSON, sha256 } from "./protocol";
import { publicationMarker } from "./report-history";
import { externalArtifactDirectory } from "./snapshot";
import type { Settings } from "./settings";
import type { PublicationTransport, PlanObjects, EffectObservation } from "./transport";
import { verifyPublicationGate, type PublishOptions, type PublishResult } from "./publish";

function terminal(journal: Journal, effectId: string): boolean {
  return journal.events.some(event => event.effect_id === effectId && event.kind === "outcome");
}
function intended(journal: Journal, effectId: string): boolean {
  return journal.events.some(event => event.effect_id === effectId && event.kind === "intent");
}

/** Observation can reconcile an old effect. A fresh gate is mandatory before every new remote write. */
export async function resumeEffects(options: PublishOptions & { journal_directory: string }): Promise<PublishResult> {
  let journal = readJournal(options.journal_directory, options.source_repo);
  if (!canonicalJSON(journal.plan).equals(canonicalJSON(options.plan)) || options.transport.kind !== journal.plan.transport
    || options.transport.object_store !== options.object_store.root) throw Error("recovery payload or transport changed; inspect the original operation");
  const objects = writePlanObject(options.object_store, journal.plan);
  const complete = () => journal.plan.manifest.effects.every(effect => terminal(journal, effect.id));
  const blocked = (effectId: string, reason: string): PublishResult => {
    // An acknowledgement can be lost after a local event was published too. Never overwrite it.
    journal = readJournal(options.journal_directory, options.source_repo);
    if (!intended(journal, effectId)) journal = appendIntent(journal, effectId);
    journal = appendHandoff(journal, effectId, reason);
    return { state: "pending", reason, journal, objects };
  };
  if (complete()) return { state: "complete", reason: null, journal, objects };
  // This also establishes native contents visibility before any 404 is treated as ref absence.
  const firstPending = journal.plan.manifest.effects.find(effect => !terminal(journal, effect.id));
  if (!firstPending) throw Error("recovery pending-effect invariant");
  try { await options.transport.identity(); }
  catch { return blocked(firstPending.id, "native-recovery-observation-unavailable"); }

  for (const effect of journal.plan.manifest.effects) {
    // Acquired leases are temporary. A recorded acquisition is checked again before replay below.
    if (effect.kind === "lease-acquire" && terminal(journal, effect.id)) continue;
    try {
      const observation = await options.transport.observe(journal.plan, effect, objects);
      if (observation.state === "conflict" || observation.state === "unknown") return blocked(effect.id, observation.reason);
      if (terminal(journal, effect.id)) {
        if (observation.state !== "done") return blocked(effect.id, "completed-effect-materially-changed");
        continue;
      }
      if (!intended(journal, effect.id)) journal = appendIntent(journal, effect.id);
      if (observation.state === "done") {
        journal = appendOutcome(journal, effect.id, observation.outcome);
        continue;
      }
      await verifyPublicationGate(options, journal);
      const lease = await options.transport.ref(options.settings.publication.lease_ref);
      if (effect.kind === "lease-acquire") {
        if (lease.state !== "absent") return blocked(effect.id, "publication-lease-occupied");
      } else if (lease.state !== "present" || lease.object !== objects.object) {
        return blocked(effect.id, "publication-lease-lost");
      }
      // A complete, unchanged absence plus current original proof/authority permits this one replay.
      await options.transport.execute(journal.plan, effect, objects);
      const after = await options.transport.observe(journal.plan, effect, objects);
      if (after.state !== "done") return blocked(effect.id, "replayed-effect-outcome-unconfirmed");
      journal = appendOutcome(journal, effect.id, after.outcome);
    } catch { return blocked(effect.id, "current-proof-or-recovery-effect-unavailable"); }
  }
  return { state: "complete", reason: null, journal, objects };
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
  const journal = createJournal({ source_repo: publication.source_repo, artifact_root: publication.artifact_root, plan: publication.plan });
  publishArtifact(join(journal.directory, "retained-origin.json"), canonicalJSON({ schema_version: 1,
    source: "retained-ref", ref: options.inspection.ref, object: objects.object, plan_sha256: objects.plan_sha256 }));
  return resumeEffects({ ...publication, journal_directory: journal.directory });
}
