import { bindRunJournal, type RunDirectory } from "./run-directory";
import { runtimePolicyBinding } from "./bootstrap";
import { policyDigest } from "./journal";
import { loadCommittedSettings } from "./settings";
import { publicationEffectsOutput } from "./recovery-output";
import { OUTPUT_LIMIT } from "./owned-process";
import { ArtifactChanged } from "./evidence-input";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { collectCandidateReview } from "./candidate-review";
import { readPublicationAuthority } from "./publication-authority";
import { capturePublicationInventory, type PublicationInventory } from "./publication-inventory";
import { readAdoptedRolePolicy, readNativeRoleCapture, roleRuntimeDigest } from "./role-capture";
import { manifestDigest, validateReviewedManifest, workerInputDigest } from "./manifests";
import { appendIntent, appendInvalidation, publishArtifact, readArtifact, readJournal, sealPlan, writePublicationObjects, type Journal, type PlanPolicy, type SealedPlan } from "./journal";
import { publish, PublicationScopeChanged, type PublicationGate, type PublishOptions } from "./publish";
import { resumeEffects } from "./recovery";
import { collectPublicationInputs } from "./publication-inputs";
import { readSourceAssessmentArtifacts } from "./source-assessment";
import { readPublicationCandidateProof } from "./publication-proof";
import { createNativeTransport, readNativeContext, NativeObservationChanged } from "./transport";
import { collectPublicationProposals as collectProposals, requireOwnedStore } from "./proposals";
import { readGit } from "./git";
import { exactRecord } from "./publication-decisions";
import { canonicalDigest, canonicalJSON, decodeUTF8, freezeJSON, sha256 } from "./protocol";
import { captureSnapshot, type OwnedObjectStore } from "./snapshot";

type Options = Parameters<typeof collectCandidateReview>[0] & { authority: unknown };
type Runtime = NonNullable<Awaited<ReturnType<typeof collectPublicationInputs>>["runtime"]>;
type PublicationFacts = Awaited<ReturnType<typeof collectPublicationInputs>>;

function confirmedFactsChanged(facts: PublicationFacts | null | undefined, plan: SealedPlan | undefined): boolean {
  const identity = facts?.identity, manifest = plan?.manifest;
  return Boolean(facts?.scope_changed || identity && manifest && (identity.repository_id !== manifest.repository_id || identity.actor_id !== manifest.actor_id
    || identity.repository.toLowerCase() !== manifest.repository.toLowerCase() || identity.actor.toLowerCase() !== manifest.actor.toLowerCase())
    || plan && facts?.runtime && policyDigest(runtimePolicyBinding(facts.runtime)) !== policyDigest(plan));
}

function requireExecutingRuntime(runtime: Runtime): void {
  if (Bun.version !== "1.4.4" || realpathSync(import.meta.path) !== join(runtime.component.directory, "scripts/docs-drift/publication-controller.ts"))
    throw Error("Retained executing publication controller required");
}

/** Import only verified immutable objects between the two owned bare stores. Caller refs stay untouched. */
function importCandidate(source: OwnedObjectStore, candidate: OwnedObjectStore, plan: SealedPlan): void {
  requireOwnedStore(source, plan.manifest.repository); requireOwnedStore(candidate, plan.manifest.repository);
  if (source.source_commit !== plan.manifest.bindings.source_commit || candidate.source_commit !== plan.manifest.bindings.candidate_commit)
    throw Error("Publication source/candidate object store binding changed");
  if (readGit(candidate.root, "rev-parse", plan.manifest.bindings.candidate_commit + "^{tree}").toString().trim() !== plan.manifest.bindings.candidate_tree)
    throw Error("Publication candidate tree changed");
  if (source.root !== candidate.root) readGit(source.root, "-c", "protocol.file.allow=always", "-c", "fetch.writeCommitGraph=false", "fetch", "--no-tags",
    "--no-write-fetch-head", "--no-recurse-submodules", "--no-auto-maintenance", "--", candidate.root, plan.manifest.bindings.candidate_commit);
  if (readGit(source.root, "rev-parse", plan.manifest.bindings.candidate_commit + "^{tree}").toString().trim() !== plan.manifest.bindings.candidate_tree)
    throw Error("Publication imported candidate tree changed");
}

async function currentState(options: Options, inventory?: PublicationInventory, expected?: SealedPlan) {
  if (readGit(options.repo, "rev-parse", "HEAD").toString().trim() !== options.source
    || readGit(options.candidate_repo, "rev-parse", "HEAD").toString().trim() !== options.candidate) throw new PublicationScopeChanged("Publication assessment or candidate HEAD changed");
  const { settings: selectedSettings } = loadCommittedSettings(options.repo, options.source);
  const comparison = expected ? { repository: expected.manifest.repository, repository_id: expected.manifest.repository_id,
    actor: expected.manifest.actor, actor_id: expected.manifest.actor_id, default_branch: selectedSettings.default_branch } : undefined;
  let checked: Awaited<ReturnType<typeof collectCandidateReview>>;
  try {
    checked = await collectCandidateReview({ ...options, inventory_context: inventory, comparison_identity: comparison });
  } catch (error) {
    if (error instanceof NativeObservationChanged) throw new PublicationScopeChanged(error.message);
    throw error;
  }
  if (!checked.complete) {
    const before = checked.target?.preparation?.worker_inputs;
    const facts = before?.facts ?? checked.target?.bindings?.facts;
    if (confirmedFactsChanged(facts, expected) || checked.scope_changed || before?.scope_changed || checked.target?.bindings?.scope_changed
      || expected && before?.complete && before.worker_input_sha256 !== workerInputDigest(expected.manifest.bindings))
      throw new PublicationScopeChanged("Publication worker or candidate inputs changed");
    throw Error(checked.diagnostics.join("\n") || "Current publication review unavailable");
  }
  const target = checked.target!, bound = target.bindings!, facts = bound.facts!, runtime = facts.runtime!;
  if (!target.manifest || !facts.store || !facts.current_default || !facts.identity || !bound.source_verification?.object_store || !bound.proposal_snapshot)
    throw Error("Complete original publication sources required");
  const settings = captureSnapshot(options.repo, options.source).settings;
  const workerPolicy = readAdoptedRolePolicy({ repo: facts.store.root, current_default: facts.current_default, identity: facts.identity, runtime, role: "worker" });
  const reviewerPolicy = readAdoptedRolePolicy({ repo: facts.store.root, current_default: facts.current_default, identity: facts.identity, runtime, role: "reviewer" });
  const common = { source_repo: options.repo, candidate_repo: options.candidate_repo, artifact_root: options.artifact_root };
  let worker: ReturnType<typeof readNativeRoleCapture>;
  let reviewer: ReturnType<typeof readNativeRoleCapture>;
  let authority: ReturnType<typeof readPublicationAuthority>;
  try {
    worker = readNativeRoleCapture({ ...common, reference: options.worker_capture, policy: workerPolicy,
      expected: { role: "worker", source_commit: options.source, runtime_sha256: roleRuntimeDigest(runtime, "worker"), target_sha256: workerInputDigest(target.manifest.bindings) } });
    reviewer = readNativeRoleCapture({ ...common, reference: options.reviewer_capture, policy: reviewerPolicy,
      expected: { role: "reviewer", source_commit: options.source, runtime_sha256: roleRuntimeDigest(runtime, "reviewer"), target_sha256: manifestDigest(target.manifest) } });
    authority = readPublicationAuthority({ source_repo: options.repo, artifact_root: options.artifact_root, reference: options.authority, manifest: target.manifest,
      adopted_procedure: { repo: facts.store.root, current_default: facts.current_default, path: settings.project_procedure } });
  } catch (error) {
    if (error instanceof ArtifactChanged) throw new PublicationScopeChanged(error.message);
    throw error;
  }
  const review: PublicationGate["review"] = { manifest: target.manifest, current: target.manifest, worker: worker.evidence, reviewer: reviewer.evidence,
    policy: { worker: workerPolicy, reviewer: reviewerPolicy }, grants: authority.grants };
  const policy: PlanPolicy = { ...runtimePolicyBinding(runtime), context: "production", transport: "native", publication_kind: bound.mode!,
    pr_draft: settings.publication.pr_state[bound.mode!] === "draft",
    ...(settings.schema_version === 2 || settings.publication.entry_actors ? { publisher_entry: options.entry } : {}), worker: workerPolicy, reviewer: reviewerPolicy };
  const plan = sealPlan({ reviewed: validateReviewedManifest(review), grants: review.grants, ...policy, corrections: bound.corrections, attention: bound.attention,
    candidate_verification_sha256: bound.candidate_verification_sha256! });
  const store = bound.source_verification.object_store;
  importCandidate(store, facts.store, plan);
  return { plan, policy, review, runtime, settings, store, proposal_snapshot: bound.proposal_snapshot };
}

/** Data-only inspection. Original scoped authority is checked but this command sends no effects. */
export async function checkPublication(input: Options) {
  const options = structuredClone(input);
  const result: { schema_version: 1; kind: "docs-drift-publication-check"; authority: "none"; complete: boolean; diagnostics: string[];
    plan: SealedPlan | null; resources: { object_store: OwnedObjectStore } | null } = {
    schema_version: 1, kind: "docs-drift-publication-check", authority: "none", complete: false, diagnostics: [], plan: null, resources: null };
  try {
    const current = await currentState(options);
    result.plan = current.plan; result.resources = { object_store: current.store }; result.complete = true;
  } catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Publication check unavailable"); }
  return freezeJSON(result);
}

function invocationDigest(options: Options): string {
  return canonicalDigest({ repo: realpathSync(options.repo), candidate_repo: realpathSync(options.candidate_repo), source: options.source, candidate: options.candidate,
    artifact_root: realpathSync(options.artifact_root), cache: realpathSync(options.cache_directory), entry: options.entry,
    launcher: realpathSync(options.launcher_path), settings: realpathSync(options.settings_path), selection: options.selection,
    source_verification: options.source_verification, candidate_verification: options.candidate_verification, decisions: options.decisions,
    worker_capture: options.worker_capture, reviewer_capture: options.reviewer_capture, authority: options.authority, resolution_record: options.resolution_record ?? null });
}
function readInvocation(options: Options, plan: SealedPlan) {
  const bytes = readArtifact(join(options.artifact_root, plan.manifest.operation_id + ".controller.json"));
  const input = exactRecord(JSON.parse(decodeUTF8(bytes)), ["schema_version", "kind", "plan_sha256", "inputs_sha256", "proposal_snapshot"], "Original publication controller fields changed");
  if (!canonicalJSON(input).equals(bytes) || input.schema_version !== 1 || input.kind !== "docs-drift-publication-controller"
    || input.plan_sha256 !== sha256(canonicalJSON(plan)) || input.inputs_sha256 !== invocationDigest(options)) throw Error("Original publication controller inputs changed");
  return input;
}

function publicationOptions(options: Options, initial: Awaited<ReturnType<typeof currentState>>, original: unknown, run?: RunDirectory): PublishOptions {
  requireExecutingRuntime(initial.runtime);
  const transport = createNativeTransport({ source_repo: options.repo, artifact_root: options.artifact_root, object_store: initial.store,
    settings: initial.settings, credential: options.credential, path: options.path, run });
  return { source_repo: options.repo, artifact_root: options.artifact_root, object_store: initial.store, settings: initial.settings, plan: initial.plan, transport,
    gate: async (journal: Journal | null) => {
      if (journal) publicationEffectsOutput({ command: "publish", source: options.source, outcome: "incomplete", capacity_check: true,
        result: { state: "pending", reason: null, journal }, limit: Math.min(OUTPUT_LIMIT, initial.settings.reports.max_entry_bytes) });
      let inventory: PublicationInventory | undefined;
      const objects = journal ? writePublicationObjects(initial.store, initial.plan, journal.header) : null;
      if (journal && objects) {
        const native = readNativeContext({ hostname: initial.settings.hostname, repository: initial.settings.repository, credential: options.credential, path: options.path });
        const proposals = collectProposals(native.repository, initial.settings);
        if (proposals.scope_changed) throw new PublicationScopeChanged("Current native publication metadata changed");
        if (!proposals.complete) throw Error("Current native publication inventory unavailable");
        inventory = await capturePublicationInventory({ source_repo: options.repo, artifact_root: options.artifact_root, journal_directory: journal.directory,
          original, transport, objects, current_proposals: proposals.proposals });
      }
      const current = await currentState(options, inventory, initial.plan);
      requireExecutingRuntime(current.runtime);
      if (current.plan.manifest_sha256 !== initial.plan.manifest_sha256) throw new PublicationScopeChanged("Current publication payload changed");
      for (const observation of inventory?.observations ?? []) {
        const effect = initial.plan.manifest.effects.find(effect => effect.id === observation.effect_id)!;
        const observed = await transport.observe(initial.plan, effect, objects!);
        if (observed.state === "conflict") throw new PublicationScopeChanged("Current own publication changed");
        if (observed.state !== "done" || observed.outcome.resource_id !== observation.resource_id) throw Error("Current own publication recheck unavailable");
      }
      return { policy: current.policy, review: current.review };
    } };
}

export async function publishPublication(input: Options, run?: RunDirectory) {
  const options = structuredClone(input), current = await currentState(options);
  requireExecutingRuntime(current.runtime);
  const path = join(options.artifact_root, current.plan.manifest.operation_id + ".controller.json");
  if (!existsSync(path)) publishArtifact(path, canonicalJSON({ schema_version: 1, kind: "docs-drift-publication-controller", plan_sha256: sha256(canonicalJSON(current.plan)),
    inputs_sha256: invocationDigest(options), proposal_snapshot: current.proposal_snapshot }));
  const invocation = readInvocation(options, current.plan);
  return publish(publicationOptions(options, current, invocation.proposal_snapshot, run));
}

export async function resumePublication(input: Options & { journal_directory: string }, run?: RunDirectory) {
  const options = structuredClone(input);
  if (dirname(realpathSync(options.journal_directory)) !== realpathSync(options.artifact_root)) throw Error("Original publication journal artifact root required");
  const journal = readJournal(options.journal_directory, options.repo), invocation = readInvocation(options, journal.plan);
  if (journal.plan.schema_version === 2) {
    if (!run) throw Error("Original run required for version-two resume");
    run = bindRunJournal(run, journal);
  }
  try {
    const source = readSourceAssessmentArtifacts({ ...options, candidate_repo: options.candidate_repo, reference: options.source_verification });
    const candidate = readPublicationCandidateProof(options, source);
    if (candidate.source_only && journal.plan.manifest.effects.some(effect => !["lease-acquire", "receipt-retain", "issue-create", "lease-release"].includes(effect.kind)))
      throw new PublicationScopeChanged("Source-only recovery requires its original issue-only plan");
    const facts = await collectPublicationInputs({ ...options, object_store: candidate.inspection?.object_store ?? undefined });
    if (confirmedFactsChanged(facts, journal.plan)) throw new PublicationScopeChanged("Original recovery source actor or runtime changed");
    if (!facts.complete || !facts.runtime || !source.object_store) throw Error("Current publication recovery runtime unavailable");
    requireExecutingRuntime(facts.runtime);
    const settings = captureSnapshot(options.repo, options.source).settings;
    publicationEffectsOutput({ command: "resume", source: options.source, outcome: "incomplete", capacity_check: true,
      result: { state: "pending", reason: null, journal }, limit: Math.min(OUTPUT_LIMIT, settings.reports.max_entry_bytes) });
    importCandidate(source.object_store, facts.store!, journal.plan);
    const transport = createNativeTransport({ source_repo: options.repo, artifact_root: options.artifact_root, object_store: source.object_store,
      settings, credential: options.credential, path: options.path, run });
    const native = readNativeContext({ hostname: settings.hostname, repository: settings.repository, credential: options.credential, path: options.path });
    const proposals = collectProposals(native.repository, settings);
    if (proposals.scope_changed) throw new PublicationScopeChanged("Current recovery proposal metadata changed");
    if (!proposals.complete) throw Error("Current recovery proposal inventory unavailable");
    const inventory = await capturePublicationInventory({ source_repo: options.repo, artifact_root: options.artifact_root, journal_directory: journal.directory,
      original: invocation.proposal_snapshot, transport, objects: writePublicationObjects(source.object_store, journal.plan, journal.header), current_proposals: proposals.proposals });
    const current = await currentState(options, inventory, journal.plan);
    if (!canonicalJSON(current.plan).equals(canonicalJSON(journal.plan))) throw new PublicationScopeChanged("Original recovery plan changed");
    const publication = publicationOptions(options, current, invocation.proposal_snapshot, run);
    return resumeEffects({ ...publication, journal_directory: options.journal_directory });
  } catch (error) {
    if (error instanceof PublicationScopeChanged || error instanceof ArtifactChanged) {
      let latest = readJournal(options.journal_directory, options.repo);
      const pending = latest.plan.manifest.effects.find(effect => !latest.events.some(event => event.effect_id === effect.id
        && ["outcome", "retired-absence", "acknowledged-delivery"].includes(event.kind)));
      if (pending && !latest.events.some(event => event.kind === "invalidation")) {
        if (!latest.events.some(event => event.kind === "intent" && event.effect_id === pending.id)) latest = appendIntent(latest, pending.id);
        appendInvalidation(latest, pending.id, "original-recovery-inputs-changed");
      }
    }
    throw error;
  }
}
