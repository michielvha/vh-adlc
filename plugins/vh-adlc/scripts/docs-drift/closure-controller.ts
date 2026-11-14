import { selectRecoveryRuntime } from "./bootstrap";
import { collectNativeClosure } from "./resolution-entry";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { captureClosureInventory, type ClosureInventory } from "./closure-inventory";
import { collectClosureReview } from "./closure-worker";
import { ArtifactChanged } from "./evidence-input";
import { readGit } from "./git";
import { appendIntent, appendInvalidation, publishArtifact, readArtifact, readJournal, sealPlan, writePublicationObjects,
  type Journal, type PlanPolicy, type SealedPlan } from "./journal";
import { manifestDigest, validateReviewedManifest, workerInputDigest } from "./manifests";
import { OUTPUT_LIMIT } from "./owned-process";
import { readPublicationAuthority } from "./publication-authority";
import { exactRecord } from "./publication-decisions";
import { publish, PublicationScopeChanged, type PublicationGate, type PublishOptions } from "./publish";
import { canonicalDigest, canonicalJSON, decodeUTF8, freezeJSON, sha256 } from "./protocol";
import { resumeEffects } from "./recovery";
import { publicationEffectsOutput } from "./recovery-output";
import { readAdoptedRolePolicy, readNativeRoleCapture, roleRuntimeDigest } from "./role-capture";
import { loadCommittedSettings } from "./settings";
import { createNativeTransport, readNativeContext, withNativeObservation, NativeObservationChanged } from "./transport";

type Options = Omit<Parameters<typeof collectClosureReview>[0], "closure_inventory" | "observation"> & { authority: unknown };
function requireExecutingRuntime(runtime: { component: { directory: string } }): void {
  if (Bun.version !== "1.4.4" || realpathSync(import.meta.path) !== join(runtime.component.directory, "scripts/docs-drift/closure-controller.ts"))
    throw Error("Retained executing closure controller required");
}

async function currentState(options: Options, inventory?: ClosureInventory, expected?: SealedPlan) {
  if (readGit(options.repo, "rev-parse", "HEAD").toString().trim() !== options.source) throw new PublicationScopeChanged("Closure assessment HEAD changed");
  const { settings } = loadCommittedSettings(options.repo, options.source);
  const scope = { hostname: settings.hostname, repository: settings.repository, credential: options.credential, path: options.path };
  let checked: Awaited<ReturnType<typeof collectClosureReview>>;
  try {
    checked = await withNativeObservation(scope, async observation => {
      const native = readNativeContext({ ...scope, observation });
      if (native.default_commit !== options.source || expected && (native.identity.repository_id !== expected.manifest.repository_id
        || native.identity.actor_id !== expected.manifest.actor_id || native.identity.actor !== expected.manifest.actor))
        throw new PublicationScopeChanged("Original closure source or actor changed");
      const result = await collectClosureReview({ ...options, closure_inventory: inventory, observation });
      const current = result.target?.worker_inputs;
      if (!result.complete) {
        if (result.scope_changed || expected && current?.complete && current.worker_input_sha256 !== workerInputDigest(expected.manifest.bindings))
          throw new PublicationScopeChanged("Original closure worker or native inputs changed");
        throw Error(result.diagnostics.join("\n") || "Current closure review unavailable");
      }
      return result;
    });
  } catch (error) {
    if (error instanceof NativeObservationChanged) throw new PublicationScopeChanged(error.message);
    throw error;
  }
  const target = checked.target, current = target?.worker_inputs, facts = current?.target;
  if (!target?.manifest || !current?.runtime || !facts?.store || !facts.identity) throw Error("Complete original closure runtime and manifest required");
  const runtime = current.runtime, manifest = target.manifest;
  const policyOptions = { repo: facts.store.root, current_default: options.source, identity: facts.identity, runtime };
  const workerPolicy = readAdoptedRolePolicy({ ...policyOptions, role: "worker" }), reviewerPolicy = readAdoptedRolePolicy({ ...policyOptions, role: "reviewer" });
  const common = { source_repo: options.repo, artifact_root: options.artifact_root };
  let worker: ReturnType<typeof readNativeRoleCapture>;
  let reviewer: ReturnType<typeof readNativeRoleCapture>;
  let authority: ReturnType<typeof readPublicationAuthority>;
  try {
    worker = readNativeRoleCapture({ ...common, reference: options.worker_capture, policy: workerPolicy,
      expected: { role: "worker", source_commit: options.source, runtime_sha256: roleRuntimeDigest(runtime, "worker"), target_sha256: workerInputDigest(manifest.bindings) } });
    reviewer = readNativeRoleCapture({ ...common, reference: options.reviewer_capture, policy: reviewerPolicy,
      expected: { role: "reviewer", source_commit: options.source, runtime_sha256: roleRuntimeDigest(runtime, "reviewer"), target_sha256: manifestDigest(manifest) } });
    authority = readPublicationAuthority({ ...common, reference: options.authority, manifest,
      adopted_procedure: { repo: facts.store.root, current_default: options.source, path: settings.project_procedure } });
  } catch (error) {
    if (error instanceof ArtifactChanged) throw new PublicationScopeChanged(error.message);
    throw error;
  }
  const review: PublicationGate["review"] = { manifest, current: manifest, worker: worker.evidence, reviewer: reviewer.evidence,
    policy: { worker: workerPolicy, reviewer: reviewerPolicy }, grants: authority.grants };
  const policy: PlanPolicy = { adoption_sha256: runtime.adoption_sha256, context: "production", transport: "native", publication_kind: "resolve",
    pr_draft: settings.publication.pr_state.resolve === "draft", worker: workerPolicy, reviewer: reviewerPolicy };
  const plan = sealPlan({ reviewed: validateReviewedManifest(review), grants: review.grants, ...policy, corrections: [], attention: [] });
  if (expected && !canonicalJSON(plan).equals(canonicalJSON(expected))) throw new PublicationScopeChanged("Original closure reviewed plan changed");
  return { plan, policy, review, runtime, settings, store: facts.store, original_target: { source_commit: options.source, identity: facts.identity, target: facts.target } };
}

/** Inspection checks exact actual authority but sends no effect and grants no permission to its caller. */
export async function checkClosurePublication(input: Options) {
  const options = structuredClone(input);
  const result = { schema_version: 1 as const, kind: "docs-drift-closure-publication-check" as const, authority: "none" as const,
    complete: false, diagnostics: [] as string[], plan: null as SealedPlan | null };
  try { result.plan = (await currentState(options)).plan; result.complete = true; }
  catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Current closure publication unavailable"); }
  return freezeJSON(result);
}

function invocationDigest(options: Options): string {
  return canonicalDigest({ repo: realpathSync(options.repo), source: options.source, artifact_root: realpathSync(options.artifact_root),
    cache: realpathSync(options.cache_directory), entry: options.entry, launcher: realpathSync(options.launcher_path), settings: realpathSync(options.settings_path),
    selection: options.selection, worker_capture: options.worker_capture, reviewer_capture: options.reviewer_capture, authority: options.authority });
}
function readInvocation(options: Options, plan: SealedPlan) {
  const bytes = readArtifact(join(options.artifact_root, plan.manifest.operation_id + ".closure-controller.json"));
  const value = exactRecord(JSON.parse(decodeUTF8(bytes)), ["schema_version", "kind", "plan_sha256", "inputs_sha256", "original_target"], "Original closure controller fields changed");
  if (!canonicalJSON(value).equals(bytes) || value.schema_version !== 1 || value.kind !== "docs-drift-closure-controller"
    || value.plan_sha256 !== sha256(canonicalJSON(plan)) || value.inputs_sha256 !== invocationDigest(options))
    throw Error("Original closure controller inputs changed");
  return value;
}

function publicationOptions(options: Options, initial: Awaited<ReturnType<typeof currentState>>, original: unknown): PublishOptions {
  requireExecutingRuntime(initial.runtime);
  const transport = createNativeTransport({ source_repo: options.repo, artifact_root: options.artifact_root, object_store: initial.store,
    settings: initial.settings, credential: options.credential, path: options.path });
  return { source_repo: options.repo, artifact_root: options.artifact_root, object_store: initial.store, settings: initial.settings, plan: initial.plan, transport,
    gate: async (journal: Journal | null) => {
      let inventory: ClosureInventory | undefined;
      if (journal) {
        publicationEffectsOutput({ command: "publish-closure", source: options.source, outcome: "incomplete", capacity_check: true,
          result: { state: "pending", reason: null, journal }, limit: Math.min(OUTPUT_LIMIT, initial.settings.reports.max_entry_bytes) });
        const native = readNativeContext({ hostname: initial.settings.hostname, repository: initial.settings.repository, credential: options.credential, path: options.path });
        inventory = await captureClosureInventory({ source_repo: options.repo, artifact_root: options.artifact_root, journal_directory: journal.directory,
          original, transport, objects: writePublicationObjects(initial.store, initial.plan, journal.header), reader: native.repository });
      }
      const current = await currentState(options, inventory, initial.plan);
      requireExecutingRuntime(current.runtime);
      for (const proof of inventory?.observations ?? []) {
        const effect = initial.plan.manifest.effects.find(effect => effect.id === proof.effect_id)!;
        const observed = await transport.observe(initial.plan, effect, writePublicationObjects(initial.store, initial.plan, journal!.header));
        if (observed.state === "conflict") throw new PublicationScopeChanged("Current own closure effect changed after review");
        if (observed.state !== "done" || observed.outcome.resource_id !== proof.resource_id) throw Error("Fresh own closure effect proof unavailable");
      }
      return { policy: current.policy, review: current.review };
    } };
}

export async function publishClosure(input: Options) {
  const options = structuredClone(input), current = await currentState(options);
  requireExecutingRuntime(current.runtime);
  const prefix = join(options.artifact_root, current.plan.manifest.operation_id), targetPath = prefix + ".closure-target.json";
  const targetBytes = canonicalJSON(current.original_target), targetReference = { path: current.plan.manifest.operation_id + ".closure-target.json", sha256: sha256(targetBytes) };
  if (targetReference.sha256 !== current.plan.manifest.bindings.assessment_sha256) throw Error("Original closure target bytes changed");
  if (!existsSync(targetPath)) publishArtifact(targetPath, targetBytes);
  if (!existsSync(prefix + ".closure-controller.json")) publishArtifact(prefix + ".closure-controller.json", canonicalJSON({ schema_version: 1,
    kind: "docs-drift-closure-controller", plan_sha256: sha256(canonicalJSON(current.plan)), inputs_sha256: invocationDigest(options), original_target: targetReference }));
  const invocation = readInvocation(options, current.plan);
  return publish(publicationOptions(options, current, invocation.original_target));
}

export async function resumeClosure(input: Options & { journal_directory: string }) {
  const options = structuredClone(input);
  if (dirname(realpathSync(options.journal_directory)) !== realpathSync(options.artifact_root)) throw Error("Original closure journal artifact root required");
  const journal = readJournal(options.journal_directory, options.repo), invocation = readInvocation(options, journal.plan);
  const { settings } = loadCommittedSettings(options.repo, journal.plan.manifest.bindings.source_commit);
  const manifest = journal.plan.manifest;
  const runtime = await selectRecoveryRuntime({ repo: options.repo, source_commit: manifest.bindings.source_commit,
    identity: { repository: manifest.repository, repository_id: manifest.repository_id, actor: manifest.actor, actor_id: manifest.actor_id, default_branch: settings.default_branch },
    cache_directory: options.cache_directory, entry: options.entry, adoption_sha256: journal.plan.adoption_sha256 });
  requireExecutingRuntime(runtime);
  try {
    const native = readNativeContext({ hostname: settings.hostname, repository: settings.repository, credential: options.credential, path: options.path });
    if (native.default_commit !== options.source || native.identity.repository_id !== journal.plan.manifest.repository_id
      || native.identity.actor_id !== journal.plan.manifest.actor_id || native.identity.actor !== journal.plan.manifest.actor)
      throw new PublicationScopeChanged("Original closure recovery source or actor changed");
    // Fresh native collection creates an owned source store. The original journal supplies its stable acquisition objects.
    const collected = await collectNativeClosure({ ...options, selection: { schema_version: 1, source_commit: options.source,
      consolidation: (options.selection as { consolidation: number }).consolidation } });
    if (!collected.store) throw Error("Original closure recovery source objects unavailable");
    const transport = createNativeTransport({ source_repo: options.repo, artifact_root: options.artifact_root, object_store: collected.store,
      settings, credential: options.credential, path: options.path });
    const inventory = await captureClosureInventory({ source_repo: options.repo, artifact_root: options.artifact_root, journal_directory: journal.directory,
      original: invocation.original_target, transport, objects: writePublicationObjects(collected.store, journal.plan, journal.header), reader: native.repository });
    const current = await currentState(options, inventory, journal.plan);
    requireExecutingRuntime(current.runtime);
    publicationEffectsOutput({ command: "resume-closure", source: options.source, outcome: "incomplete", capacity_check: true,
      result: { state: "pending", reason: null, journal }, limit: Math.min(OUTPUT_LIMIT, settings.reports.max_entry_bytes) });
    return resumeEffects({ ...publicationOptions(options, current, invocation.original_target), journal_directory: options.journal_directory });
  } catch (error) {
    if (error instanceof PublicationScopeChanged || error instanceof ArtifactChanged) {
      let latest = readJournal(options.journal_directory, options.repo);
      const pending = latest.plan.manifest.effects.find(effect => !latest.events.some(event => event.effect_id === effect.id
        && ["outcome", "retired-absence", "acknowledged-delivery"].includes(event.kind)));
      if (pending && !latest.events.some(event => event.kind === "invalidation")) {
        if (!latest.events.some(event => event.kind === "intent" && event.effect_id === pending.id)) latest = appendIntent(latest, pending.id);
        appendInvalidation(latest, pending.id, "original-closure-recovery-inputs-changed");
      }
    }
    throw error;
  }
}
