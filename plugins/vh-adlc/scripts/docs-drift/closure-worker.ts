import { publisherActor, sameLogin } from "./identity";
import { projectClosureReader } from "./closure-inventory";
import { realpathSync } from "node:fs";
import { selectOperationRuntime } from "./bootstrap";
import { collectClosureTarget, prepareClosure, type ClosureProposal, type ClosureTarget } from "./closure";
import { ArtifactChanged, readBoundArtifact } from "./evidence-input";
import { readGit } from "./git";
import { manifestDigest, parseActionManifest, verifyReviewEvidence, verifyRoleIdentity, workerInputsDigest,
  type ActionManifest, type WorkerInputs } from "./manifests";
import { exactRecord } from "./publication-decisions";
import { PublicationScopeChanged } from "./publish";
import { canonicalDigest, canonicalJSON, freezeJSON, protocolPath, sha256 } from "./protocol";
import { deliveryDigest } from "./report";
import { collectNativeClosureTarget } from "./resolution-entry";
import { matchesSourceQuote, parseSourceQuote, resolutionSource, type Verification } from "./resolve";
import { readAdoptedRolePolicy, readNativeRoleCapture, roleRuntimeDigest } from "./role-capture";
import { captureCallerState, captureSnapshot, matchesCallerState, type Snapshot } from "./snapshot";
import { readNativeContext } from "./transport";

type Options = Parameters<typeof collectNativeClosureTarget>[0] & {
  cache_directory: string; entry: string; launcher_path: string; settings_path: string;
};
type Inputs = {
  schema_version: 1; kind: "docs-drift-closure-worker-inputs"; authority: "none"; complete: boolean; scope_changed: boolean; diagnostics: string[];
  target: Awaited<ReturnType<typeof collectNativeClosureTarget>> | null;
  runtime: Awaited<ReturnType<typeof selectOperationRuntime>> | null;
  inputs: WorkerInputs | null; worker_input_sha256: string | null; worker_runtime_sha256: string | null;
};

/** Capture current closure facts before the fresh worker runs. This records no semantic verdict. */
export async function collectClosureWorkerInputs(input: Options): Promise<Inputs> {
  const options = { ...input, selection: structuredClone(input.selection), path: input.path ?? process.env.PATH };
  const repo = realpathSync(options.repo), before = canonicalDigest(captureCallerState(repo));
  const result: Inputs = { schema_version: 1, kind: "docs-drift-closure-worker-inputs", authority: "none", complete: false,
    scope_changed: false, diagnostics: [], target: null, runtime: null, inputs: null, worker_input_sha256: null, worker_runtime_sha256: null };
  try {
    result.target = await collectNativeClosureTarget(options);
    const target = result.target;
    if (!target.complete || !target.store || !target.identity || !target.target || !target.target_sha256) {
      result.diagnostics.push(...target.diagnostics); throw Error("Complete native closure target required for its worker");
    }
    const snapshot = captureSnapshot(repo, options.source), settings = snapshot.settings;
    if (!sameLogin(target.identity.actor, publisherActor(settings, options.entry)))
      throw new PublicationScopeChanged("Current closure actor differs from committed policy");
    result.runtime = await selectOperationRuntime({ ...options, repo, policy_repo: target.store.root,
      current_default: options.source, identity: target.identity });
    const implementation = (path: string | null) => {
      if (path === null) return null;
      const blob = snapshot.blobs.find(blob => blob.path === path);
      if (!blob) throw Error("Closure scanner implementation unavailable");
      return sha256(blob.bytes);
    };
    result.inputs = {
      source_commit: options.source, assessment_sha256: target.target_sha256, settings_sha256: snapshot.settings_sha256,
      scanner_sha256: canonicalDigest({ policy: settings.scanner, script: implementation(settings.scanner.script), adapter: implementation(settings.scanner.adapter) }),
      options_sha256: canonicalDigest(settings.detector_options), scope_sha256: snapshot.protocol.bindings.scope_sha256,
      feedback_sha256: snapshot.protocol.bindings.feedback_sha256, proposals_sha256: canonicalDigest(target.target.closure),
      decisions_sha256: canonicalDigest(target.target.verification_scopes),
      dependencies_sha256: canonicalDigest({ source: resolutionSource(snapshot), target_sha256: target.target_sha256,
        worker_runtime_sha256: roleRuntimeDigest(result.runtime, "worker"), reviewer_runtime_sha256: roleRuntimeDigest(result.runtime, "reviewer") }),
    };
    result.worker_input_sha256 = workerInputsDigest(result.inputs);
    result.worker_runtime_sha256 = roleRuntimeDigest(result.runtime, "worker");
    recheckRoleTarget(options, result);
    result.complete = true;
  } catch (error) {
    result.scope_changed = error instanceof PublicationScopeChanged || error instanceof ArtifactChanged || Boolean(result.target?.scope_changed);
    result.diagnostics.push(error instanceof Error ? error.message : "Closure worker input collection unavailable");
  }
  if (!matchesCallerState(repo, before)) { result.complete = false; result.diagnostics.push("Caller changed during closure worker input collection"); }
  result.diagnostics = [...new Set(result.diagnostics)];
  return freezeJSON(result);
}

/** Fresh native reads remain necessary after reopening either role's local artifacts. */
function recheckRoleTarget(options: Options, current: Inputs): void {
  const observed = current.target;
  if (!observed?.target || !observed.store || !observed.identity) throw Error("Original closure target unavailable");
  const snapshot = captureSnapshot(options.repo, options.source), settings = snapshot.settings;
  const native = () => readNativeContext({ hostname: settings.hostname, repository: settings.repository, credential: options.credential, path: options.path, observation: options.observation });
  const context = native();
  if (context.default_commit !== options.source || canonicalDigest(context.identity) !== canonicalDigest(observed.identity))
    throw new PublicationScopeChanged("Closure source or actor changed after original role collection");
  const closure = observed.target.closure;
  if (!closure.consolidation) throw Error("Original closure consolidation unavailable");
  const fresh = collectClosureTarget({ inputs: closure, operation_id: (options.selection as { operation_id: string }).operation_id,
    collection: { source_repo: options.repo, store: observed.store, settings, reader: projectClosureReader(context.repository, options.closure_inventory),
      consolidation_id: closure.consolidation.number, required_inputs: [] } });
  if (fresh.scope_changed) throw new PublicationScopeChanged("Current closure inputs changed after original role collection");
  if (!fresh.complete) throw Error("Current closure inputs unavailable after original role collection");
  if (canonicalDigest(fresh) !== canonicalDigest(observed.target)) throw new PublicationScopeChanged("Closure payload changed after original role collection");
  const final = native();
  if (final.default_commit !== options.source || canonicalDigest(final.identity) !== canonicalDigest(observed.identity))
    throw new PublicationScopeChanged("Closure source or actor changed during final role recheck");
}

/** Current source quotes and original asset artifacts support the native worker's semantic assessment. */
function readVerifications(options: Options, snapshot: Snapshot, target: ClosureTarget, records: string, inputDigest: string, returnedDigest: string) {
  if (Buffer.byteLength(records, "utf8") > snapshot.settings.reports.max_entry_bytes) throw Error("Bounded closure worker records required");
  const packet = exactRecord(JSON.parse(records), ["input_sha256", "verifications"], "Closure worker fields changed");
  if (packet.input_sha256 !== inputDigest || !Array.isArray(packet.verifications)
    || packet.verifications.length !== target.verification_scopes.length) throw Error("Exact complete closure worker scopes required");
  const selected = new Map(target.verification_scopes.map(scope => [scope.inputs_sha256, scope]));
  const observed = new Map<string, Verification>();
  for (const value of packet.verifications) {
    const row = exactRecord(value, ["inputs_sha256", "state", "method", "evidence", "asset_checks"], "Closure verification fields changed");
    if (typeof row.inputs_sha256 !== "string" || !selected.has(row.inputs_sha256) || observed.has(row.inputs_sha256)
      || (row.state !== "passed" && row.state !== "failed" && row.state !== "unknown") || typeof row.method !== "string" || !row.method.trim()
      || !Array.isArray(row.evidence) || !Array.isArray(row.asset_checks)) throw Error("Exact unique closure verification required");
    const evidence = row.evidence.map(parseSourceQuote);
    if ((row.state === "passed" && evidence.length === 0) || evidence.some(quote => !matchesSourceQuote(quote, { snapshot })))
      throw Error("Current quoted closure source evidence required");
    const scope = selected.get(row.inputs_sha256)!;
    const original = target.closure.record?.value.originals.find(item => item.number === scope.decision.proposal);
    const hunk = original?.hunks.find(item => item.id === scope.decision.hunk_id);
    const checks: string[] = [];
    for (const value of row.asset_checks) {
      const check = exactRecord(value, ["path", "sha256", "artifact"], "Closure asset check fields changed");
      const path = protocolPath(check.path), blob = snapshot.blobs.find(blob => blob.path === path);
      if (!hunk || hunk.path !== path || check.sha256 !== (blob ? sha256(blob.bytes) : null)) throw Error("Current selected closure asset binding required");
      const bytes = readBoundArtifact({ source_repo: options.repo, artifact_root: options.artifact_root, reference: check.artifact });
      if (bytes.length === 0 || bytes.length > snapshot.settings.reports.max_entry_bytes) throw Error("Bounded original asset inspection artifact required");
      checks.push(sha256(bytes));
    }
    if (new Set(checks).size !== checks.length) throw Error("Duplicate closure asset inspection evidence");
    observed.set(row.inputs_sha256, { state: row.state, method: row.method,
      inputs_sha256: row.inputs_sha256, artifact_sha256: returnedDigest, asset_checks: checks });
  }
  return observed;
}

type ReviewTarget = {
  schema_version: 1; kind: "docs-drift-closure-review-target"; authority: "none"; complete: boolean; scope_changed: boolean; diagnostics: string[];
  worker_inputs: Inputs | null; worker: Omit<ReturnType<typeof readNativeRoleCapture>, "evidence"> | null;
  proposal: ClosureProposal | null; manifest: ActionManifest | null; manifest_sha256: string | null; reviewer_runtime_sha256: string | null;
};

/** Reload the original fresh worker, then bind its assessment and every proposed comment and closure. */
export async function collectClosureReviewTarget(input: Options & { worker_capture: unknown }): Promise<ReviewTarget> {
  const options = { ...input, selection: structuredClone(input.selection), worker_capture: structuredClone(input.worker_capture), path: input.path ?? process.env.PATH };
  const repo = realpathSync(options.repo), before = canonicalDigest(captureCallerState(repo));
  const result: ReviewTarget = { schema_version: 1, kind: "docs-drift-closure-review-target", authority: "none", complete: false,
    scope_changed: false, diagnostics: [], worker_inputs: null, worker: null, proposal: null, manifest: null, manifest_sha256: null, reviewer_runtime_sha256: null };
  try {
    const current = await collectClosureWorkerInputs(options); result.worker_inputs = current;
    const target = current.target;
    if (!current.complete || !current.runtime || !current.inputs || !current.worker_input_sha256 || !current.worker_runtime_sha256
      || !target?.store || !target.identity || !target.target) {
      result.diagnostics.push(...current.diagnostics); throw Error("Current closure worker runtime and target required");
    }
    const runtime = current.runtime, snapshot = captureSnapshot(repo, options.source), settings = snapshot.settings;
    const policy = readAdoptedRolePolicy({ repo: target.store.root, current_default: options.source, identity: target.identity, runtime, role: "worker" });
    const worker = readNativeRoleCapture({ source_repo: repo, artifact_root: options.artifact_root, reference: options.worker_capture, policy,
      expected: { role: "worker", source_commit: options.source, runtime_sha256: current.worker_runtime_sha256, target_sha256: current.worker_input_sha256 } });
    result.worker = { binding: worker.binding, launch: worker.launch };
    const original = verifyRoleIdentity(worker.evidence, policy);
    const verified = readVerifications(options, snapshot, target.target, original.records, current.worker_input_sha256, original.returned_sha256);
    const native = () => readNativeContext({ hostname: settings.hostname, repository: settings.repository, credential: options.credential, path: options.path, observation: options.observation });
    const context = native();
    if (context.default_commit !== options.source || canonicalDigest(context.identity) !== canonicalDigest(target.identity))
      throw new PublicationScopeChanged("Closure source or actor changed before semantic verification");
    const closure = target.target.closure;
    if (!closure.consolidation) throw Error("Actual merged closure proposal required");
    result.proposal = await prepareClosure({ inputs: closure, operation_id: (options.selection as { operation_id: string }).operation_id,
      collection: { source_repo: repo, store: target.store, settings, reader: projectClosureReader(context.repository, options.closure_inventory),
        consolidation_id: closure.consolidation.number, required_inputs: [] },
      observe_verification: async scope => {
        const observed = verified.get(scope.inputs_sha256);
        if (!observed) throw Error("Original worker lacks this exact closure verification");
        return observed;
      } });
    if (result.proposal.scope_changed) throw new PublicationScopeChanged("Current semantic closure inputs changed");
    if (!result.proposal.complete) { result.diagnostics.push(...result.proposal.diagnostics); throw Error("Fresh complete semantic closure verification required"); }
    if (result.proposal.inputs_sha256 !== target.target.inputs_sha256
      || canonicalDigest(result.proposal.effects) !== canonicalDigest(target.target.effects)) throw new PublicationScopeChanged("Closure review payload changed after original worker launch");
    if (result.proposal.effects.length === 0) throw Error("No pending originals need a closure action manifest");
    const { repository, repository_id, actor, actor_id } = target.identity;
    result.manifest = parseActionManifest({ schema_version: 1, operation_id: (options.selection as { operation_id: string }).operation_id,
      repository, repository_id, actor, actor_id,
      ...(settings.schema_version === 2 || settings.publication.entry_actors ? { publisher_entry: options.entry } : {}),
      bindings: { ...current.inputs, candidate_commit: options.source,
        candidate_tree: readGit(target.store.root, "rev-parse", options.source + "^{tree}").toString().trim(),
        diff_sha256: canonicalDigest({ record: closure.record?.sha256, interval: closure.interval, originals: closure.originals }),
        delivery_sha256: deliveryDigest([], []) }, effects: result.proposal.effects,
      worker: { invocation_id: worker.binding.invocation_id, context_id: worker.binding.context_id,
        native_sha256: worker.binding.native_sha256, returned_sha256: worker.binding.returned_sha256 } });
    result.manifest_sha256 = manifestDigest(result.manifest);
    result.reviewer_runtime_sha256 = roleRuntimeDigest(runtime, "reviewer");
    const fresh = native();
    if (fresh.default_commit !== options.source || canonicalDigest(fresh.identity) !== canonicalDigest(target.identity))
      throw new PublicationScopeChanged("Closure source or actor changed after semantic verification");
    result.complete = true;
  } catch (error) {
    result.scope_changed = error instanceof PublicationScopeChanged || error instanceof ArtifactChanged || Boolean(result.worker_inputs?.scope_changed);
    result.diagnostics.push(error instanceof Error ? error.message : "Closure review target unavailable");
  }
  if (!matchesCallerState(repo, before)) { result.complete = false; result.diagnostics.push("Caller changed during closure review target collection"); }
  result.diagnostics = [...new Set(result.diagnostics)];
  return freezeJSON(result);
}

/** Both independent native roles are reopened at the freshly reassembled exact closure manifest. */
export async function collectClosureReview(input: Options & { worker_capture: unknown; reviewer_capture: unknown }) {
  const options = { ...input, selection: structuredClone(input.selection), worker_capture: structuredClone(input.worker_capture), reviewer_capture: structuredClone(input.reviewer_capture), path: input.path ?? process.env.PATH };
  const result = { schema_version: 1 as const, kind: "docs-drift-closure-review" as const, authority: "none" as const,
    complete: false, scope_changed: false, diagnostics: [] as string[], target: null as ReviewTarget | null,
    review: null as { manifest_sha256: string; worker: ReturnType<typeof readNativeRoleCapture>["binding"]; reviewer: ReturnType<typeof readNativeRoleCapture>["binding"] } | null };
  const repo = realpathSync(options.repo), before = canonicalDigest(captureCallerState(repo));
  try {
    const target = await collectClosureReviewTarget(options); result.target = target;
    const current = target.worker_inputs, facts = current?.target;
    if (!target.complete || !target.manifest || !target.manifest_sha256 || !current?.runtime || !facts?.store || !facts.identity) {
      result.diagnostics.push(...target.diagnostics); throw Error("Fresh complete closure review target required");
    }
    const runtime = current.runtime, policyOptions = { repo: facts.store.root, current_default: options.source, identity: facts.identity, runtime };
    const workerPolicy = readAdoptedRolePolicy({ ...policyOptions, role: "worker" });
    const reviewerPolicy = readAdoptedRolePolicy({ ...policyOptions, role: "reviewer" });
    const common = { source_repo: repo, artifact_root: options.artifact_root };
    const worker = readNativeRoleCapture({ ...common, reference: options.worker_capture, policy: workerPolicy,
      expected: { role: "worker", source_commit: options.source, runtime_sha256: roleRuntimeDigest(runtime, "worker"), target_sha256: current.worker_input_sha256! } });
    const reviewer = readNativeRoleCapture({ ...common, reference: options.reviewer_capture, policy: reviewerPolicy,
      expected: { role: "reviewer", source_commit: options.source, runtime_sha256: roleRuntimeDigest(runtime, "reviewer"), target_sha256: target.manifest_sha256 } });
    const verified = verifyReviewEvidence({ manifest: target.manifest, current: target.manifest, worker: worker.evidence, reviewer: reviewer.evidence,
      policy: { worker: workerPolicy, reviewer: reviewerPolicy } });
    recheckRoleTarget(options, current);
    result.review = { manifest_sha256: verified.manifest_sha256, worker: worker.binding, reviewer: reviewer.binding };
    result.complete = true;
  } catch (error) {
    result.scope_changed = error instanceof PublicationScopeChanged || error instanceof ArtifactChanged || Boolean(result.target?.scope_changed);
    result.diagnostics.push(error instanceof Error ? error.message : "Original independent closure review unavailable");
  }
  if (!matchesCallerState(repo, before)) { result.complete = false; result.diagnostics.push("Caller changed during closure role collection"); }
  result.diagnostics = [...new Set(result.diagnostics)];
  return freezeJSON(result);
}
