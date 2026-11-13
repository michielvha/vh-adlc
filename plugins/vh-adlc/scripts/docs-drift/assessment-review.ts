import { realpathSync } from "node:fs";
import { ArtifactChanged, readBoundArtifact } from "./evidence-input";
import { PublicationScopeChanged } from "./publish";
import { verifyIndependentRoleReview, workerInputsDigest, type WorkerInputs } from "./manifests";
import { readAdoptedRolePolicy, readNativeRoleCapture, roleRuntimeDigest } from "./role-capture";
import { canonicalDigest, canonicalJSON, freezeJSON } from "./protocol";
import { captureRepositoryState, matchesRepositoryState } from "./snapshot";
import { loadCommittedSettings } from "./settings";
import { OUTPUT_LIMIT } from "./owned-process";
import { collectWorkerPreparation } from "./worker-preparation";
import type { WorkerCollectionOptions } from "./publication-worker";
import { renderAssessmentReport, type AssessmentReport } from "./assessment-report";

type Options = WorkerCollectionOptions & { worker_capture: unknown };
type Preparation = Awaited<ReturnType<typeof collectWorkerPreparation>>;
type Facts = NonNullable<NonNullable<Preparation["worker_inputs"]>["facts"]>;
type RoleBinding = ReturnType<typeof readNativeRoleCapture>["binding"];
type Reference = { path: string; sha256: string };
type Manifest = {
  schema_version: 1; kind: "docs-drift-finding-assessment"; source_commit: string;
  identity: NonNullable<Facts["identity"]>; inputs: WorkerInputs;
  source_verification: Reference; assessment_reference: Reference; worker_capture: Reference; worker: RoleBinding;
  worker_runtime_sha256: string; reviewer_runtime_sha256: string;
  selection: NonNullable<Preparation["selection"]>; publication_proposal: Preparation["publication"]; assessment: AssessmentReport;
};
type Result = {
  schema_version: 1; kind: "docs-drift-assessment-review-target" | "docs-drift-assessment-review"; authority: "none";
  source_commit: string; complete: boolean; scope_changed: boolean; diagnostics: string[]; diagnostics_omitted: number; details_omitted: boolean;
  manifest: Manifest | null; target_sha256: string | null; reviewer_runtime_sha256: string | null;
  review: { target_sha256: string; worker: RoleBinding; reviewer: RoleBinding; nit_count: number } | null;
};
type Context = {
  runtime: NonNullable<Facts["runtime"]>; identity: NonNullable<Facts["identity"]>;
  store: NonNullable<Facts["store"]>; current_default: string;
};
type Command = "collect-assessment-review-target" | "read-assessment-review";

export function assessmentReviewOutput(command: Command, result: Result) {
  const markdown = command === "read-assessment-review" && result.kind === "docs-drift-assessment-review"
    && result.complete && result.review && result.manifest
    ? renderAssessmentReport(result.manifest.assessment, ["Finding assessments independently reviewed by " + result.review.reviewer.model,
      ...(result.review.nit_count ? [result.review.nit_count + " minor review finding(s) remain in the original reviewer records"] : [])]) : undefined;
  return { schema_version: 1 as const, command, source_commit: result.source_commit,
    outcome: result.complete ? "collected" as const : "incomplete" as const,
    ...(command === "collect-assessment-review-target" ? { assessment_review_target: result } : { assessment_review: result }),
    diagnostics: result.diagnostics.map(message => ({ code: "assessment-review", message })), ...(markdown === undefined ? {} : { markdown }) };
}

function bounded(result: Result, command: Command, limit: number): Result {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > OUTPUT_LIMIT) throw Error("Assessment review output bound required");
  const copy = structuredClone(result), size = () => Buffer.byteLength(JSON.stringify(assessmentReviewOutput(command, copy)) + "\n");
  if (size() > limit) {
    copy.complete = false; copy.details_omitted = true; copy.manifest = null; copy.review = null;
    copy.diagnostics_omitted += copy.diagnostics.length;
    copy.diagnostics = ["Assessment review details exceed the retained entry bound. Inspect the original worker and assessment records"];
    if (size() > limit) throw Error("Configured output bound cannot hold an incomplete assessment review");
  }
  return freezeJSON(copy);
}

function copiedOptions(input: Options): Options {
  return { repo: input.repo, source: input.source, artifact_root: input.artifact_root, owner: input.owner, run: input.run,
    credential: input.credential, path: input.path ?? process.env.PATH, inventory_context: input.inventory_context, cache_directory: input.cache_directory,
    entry: input.entry, launcher_path: input.launcher_path, settings_path: input.settings_path,
    source_verification: structuredClone(input.source_verification), decisions: structuredClone(input.decisions), worker_capture: structuredClone(input.worker_capture) };
}

async function currentTarget(options: Options): Promise<{ result: Result; context: Context | null; limit: number }> {
  const repo = realpathSync(options.repo), before = canonicalDigest(captureRepositoryState(repo));
  const result: Result = { schema_version: 1, kind: "docs-drift-assessment-review-target", authority: "none", source_commit: options.source,
    complete: false, scope_changed: false, diagnostics: [], diagnostics_omitted: 0, details_omitted: false,
    manifest: null, target_sha256: null, reviewer_runtime_sha256: null, review: null };
  let limit = OUTPUT_LIMIT, context: Context | null = null, preparation: Preparation | null = null;
  try {
    limit = Math.min(OUTPUT_LIMIT, loadCommittedSettings(repo, options.source).settings.reports.max_entry_bytes);
    preparation = await collectWorkerPreparation(options);
    if (!preparation.complete) { result.diagnostics.push(...preparation.diagnostics); throw Error("Original worker preparation required for assessment review"); }
    const current = preparation.worker_inputs, facts = current?.facts, assessment = preparation.assessment;
    if (!current?.inputs || !current.worker_input_sha256 || !current.source_verification?.evidence || !preparation.worker || !preparation.selection
      || !assessment?.complete || !assessment.collection_complete || assessment.details_omitted || !assessment.assessment_reference)
      throw Error("Complete original worker finding assessment required");
    if (!facts?.runtime || !facts.store || !facts.identity || !facts.current_default) throw Error("Complete native assessment runtime required");
    if (workerInputsDigest(current.inputs) !== current.worker_input_sha256
      || !canonicalJSON(current.source_verification.evidence).equals(canonicalJSON(assessment.source_verification)))
      throw Error("Original assessment inputs changed");
    const runtime = facts.runtime;
    const manifest: Manifest = { schema_version: 1, kind: "docs-drift-finding-assessment", source_commit: options.source,
      identity: facts.identity, inputs: current.inputs, source_verification: current.source_verification.evidence,
      assessment_reference: assessment.assessment_reference, worker_capture: options.worker_capture as Reference, worker: preparation.worker.binding,
      worker_runtime_sha256: roleRuntimeDigest(runtime, "worker"), reviewer_runtime_sha256: roleRuntimeDigest(runtime, "reviewer"),
      selection: preparation.selection, publication_proposal: preparation.publication, assessment };
    result.manifest = manifest; result.target_sha256 = canonicalDigest(manifest); result.reviewer_runtime_sha256 = manifest.reviewer_runtime_sha256;
    // Fresh proposal snapshot paths are presentation locators; inputs bind their stable original bytes.
    context = { runtime, identity: facts.identity, store: facts.store, current_default: facts.current_default };
    result.complete = true;
  } catch (error) {
    result.scope_changed = error instanceof ArtifactChanged || error instanceof PublicationScopeChanged || Boolean(preparation?.scope_changed);
    result.diagnostics.push(error instanceof Error ? error.message : "Original assessment review target unavailable");
  }
  if (!matchesRepositoryState(repo, before)) { result.complete = false; result.diagnostics.push("Caller changed or became unavailable during assessment target collection"); }
  result.diagnostics = [...new Set(result.diagnostics)];
  const projection = bounded(result, "collect-assessment-review-target", limit);
  return { result: projection, context: projection.complete ? context : null, limit };
}

/** Bind original worker judgments before an independent review; this result grants no effects. */
export async function collectAssessmentReviewTarget(input: Options): Promise<Result> {
  return (await currentTarget(copiedOptions(input))).result;
}

/** Reopen the exact original native roles at a fresh assessment target. No effect plan is produced. */
export async function collectAssessmentReview(input: Options & { reviewer_capture: unknown }): Promise<Result> {
  const options = copiedOptions(input), reference = structuredClone(input.reviewer_capture), repo = realpathSync(options.repo);
  const before = canonicalDigest(captureRepositoryState(repo)), current = await currentTarget(options);
  const result: Result = { ...current.result, kind: "docs-drift-assessment-review", complete: false,
    diagnostics: [...current.result.diagnostics], review: null };
  try {
    if (!current.result.complete || !current.context || !result.manifest || !result.target_sha256) throw Error("Current assessment review target required");
    const { runtime, identity, store, current_default } = current.context, manifest = result.manifest;
    const policy = { repo: store.root, current_default, identity, runtime };
    const workerPolicy = readAdoptedRolePolicy({ ...policy, role: "worker" }), reviewerPolicy = readAdoptedRolePolicy({ ...policy, role: "reviewer" });
    const common = { source_repo: repo, artifact_root: options.artifact_root };
    const worker = readNativeRoleCapture({ ...common, reference: options.worker_capture, policy: workerPolicy,
      expected: { role: "worker", source_commit: options.source, runtime_sha256: manifest.worker_runtime_sha256, target_sha256: workerInputsDigest(manifest.inputs) } });
    const reviewer = readNativeRoleCapture({ ...common, reference, policy: reviewerPolicy,
      expected: { role: "reviewer", source_commit: options.source, runtime_sha256: manifest.reviewer_runtime_sha256, target_sha256: result.target_sha256 } });
    if (!canonicalJSON(worker.binding).equals(canonicalJSON(manifest.worker))) throw Error("Original assessment worker binding changed");
    const verified = verifyIndependentRoleReview({ worker: worker.evidence, reviewer: reviewer.evidence, policy: { worker: workerPolicy, reviewer: reviewerPolicy },
      worker_target_sha256: workerInputsDigest(manifest.inputs), reviewer_target_sha256: result.target_sha256 });
    readBoundArtifact({ ...common, reference: manifest.assessment_reference });
    result.review = { target_sha256: result.target_sha256, worker: worker.binding, reviewer: reviewer.binding, nit_count: verified.nit_count };
    result.complete = true;
  } catch (error) {
    result.scope_changed ||= error instanceof ArtifactChanged || error instanceof PublicationScopeChanged;
    result.diagnostics.push(error instanceof Error ? error.message : "Original independent assessment review unavailable");
  }
  if (!matchesRepositoryState(repo, before)) { result.complete = false; result.diagnostics.push("Caller changed or became unavailable during assessment review collection"); }
  result.diagnostics = [...new Set(result.diagnostics)];
  return bounded(result, "read-assessment-review", current.limit);
}
