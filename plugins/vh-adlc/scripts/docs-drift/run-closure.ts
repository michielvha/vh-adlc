import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { readBoundArtifact } from "./evidence-input";
import { parseActionManifest } from "./manifests";
import { canonicalJSON, decodeUTF8 } from "./protocol";
import { createRunArtifactWriter, originalRunContext, latestRunArtifact, type RunDirectory } from "./run-directory";
import { recordRunApproval } from "./run-approval";
import { loadCommittedSettings } from "./settings";
import { assessSource, readSourceAssessmentArtifacts } from "./source-assessment";
import { readNativeCredential, withNativeObservation } from "./transport";
import { collectClosureWorkerInputs, collectClosureReviewTarget, collectClosureReview } from "./closure-worker";
import { publishClosure, resumeClosure } from "./closure-controller";
import { readResolutionProposal } from "./resolve-inputs";
import { captureConfiguredRole } from "./role-process";
import { readAdoptedRolePolicy } from "./role-capture";

type ClosureResult = { kind: "publication"; result: Awaited<ReturnType<typeof publishClosure>> }
  | { kind: "complete" | "review"; artifacts: Record<string, { path: string; sha256: string }> };

/** Prepare a fresh post-merge review or execute its previously retained exact approved batch. */
export async function runClosure(options: { repo: string; run: RunDirectory }): Promise<ClosureResult> {
  const { repo } = options, source = options.run.manifest.source_commit, nonce = randomUUID();
  originalRunContext(options.run);
  let run = options.run;
  if (run.manifest.mode !== "close" || run.manifest.proposals.length !== 1) throw Error("Close requires exactly one merged replacement in a fresh run");
  const settings = loadCommittedSettings(repo, source).settings;
  const credential = await readNativeCredential({ hostname: settings.hostname, cwd: repo });
  const retain = createRunArtifactWriter(run, settings.reports.max_entry_bytes, nonce);
  const read = (name: string) => {
    const reference = latestRunArtifact(run, name);
    if (!reference) throw Error("Missing original closure input " + name);
    return { reference, bytes: readBoundArtifact({ source_repo: repo, artifact_root: run.directory, reference }) };
  };
  const common = { repo, source, artifact_root: run.directory, owner: run.manifest.id, run: run.manifest.id,
    credential, cache_directory: run.directory, entry: run.manifest.entry,
    launcher_path: join(import.meta.dir, "cli.ts"), settings_path: join(repo, ".vh-adlc/docs-drift.yaml") };
  if (latestRunArtifact(run, "closure_review")) {
    const manifest = parseActionManifest(JSON.parse(decodeUTF8(read("reviewed_plan").bytes)));
    run = recordRunApproval({ repo, run, manifest, command: "close" });
    const inputs = { ...common, selection: JSON.parse(decodeUTF8(read("closure_selection").bytes)) as unknown,
      worker_capture: read("worker_capture").reference, reviewer_capture: read("reviewer_capture").reference, authority: read("approval").reference };
    const journal = latestRunArtifact(run, "journal");
    const result = journal ? await resumeClosure({ ...inputs, journal_directory: dirname(join(run.directory, journal.path)) }, run)
      : await publishClosure(inputs, run);
    return { kind: "publication" as const, result };
  }
  const sourceReference = latestRunArtifact(run, "source_verification");
  const baseline = sourceReference ? readSourceAssessmentArtifacts({ ...common, candidate_repo: repo, reference: sourceReference }) : await assessSource(common);
  if (!baseline.complete || !baseline.evidence || !baseline.scan?.checkout) throw Error(baseline.diagnostics.join("\n") || "Complete current closure source required");
  const cwd = baseline.scan.checkout, sourceVerification = baseline.evidence;
  const selection = { schema_version: 1, source_commit: source, consolidation: run.manifest.proposals[0], operation_id: "close-" + nonce };
  return withNativeObservation({ hostname: settings.hostname, repository: settings.repository, credential }, async (observation): Promise<ClosureResult> => {
    const inputs = await collectClosureWorkerInputs({ ...common, selection, observation }), collected = inputs.target, target = collected?.target;
    if (!inputs.complete || !inputs.runtime || !inputs.worker_input_sha256 || !collected?.store || !collected.identity || !target)
      throw Error(inputs.diagnostics.join("\n") || "Complete fresh native closure target required");
    if (!target.effects.length) return { kind: "complete" as const, artifacts: { closure_target: retain("closure-target", canonicalJSON(target)) } };
    const store = collected.store, runtime = inputs.runtime, native = { repo: store.root, current_default: source, identity: collected.identity, runtime };
    const original = target.closure.record?.value.originals;
    if (!original) throw Error("Original merged consolidation record required");
    const originals = target.closure.originals.map(proposal => {
      const recorded = original.find(row => row.number === proposal.number);
      if (!recorded) throw Error("Original closure proposal binding missing");
      return readResolutionProposal(store, { ...proposal, base_sha: recorded.base_sha });
    });
    const originalReference = retain("closure-originals", canonicalJSON(originals));
    const request = retain("closure-worker-request", canonicalJSON({ schema_version: 1, kind: "docs-drift-closure-worker-request",
      artifact_root: run.directory, source_commit: source, source_checkout: cwd, source_verification: sourceVerification,
      worker_input_sha256: inputs.worker_input_sha256, target, originals: originalReference,
      project_procedure: settings.project_procedure, feedback_files: settings.feedback_files,
      canonicalizer: join(runtime.component.directory, "scripts/docs-drift/protocol.ts") }));
    const workerPrompt = [
      "Verify the selected post-merge cleanup against current source, every complete original hunk and the merged consolidation record. Read all input files, original diffs, dispositions, current source quotes, feedback and the consumer procedure.",
      "Verify each declared target verification_scope independently. A merged replacement alone proves no original disposition. Respect wrong/deferred decisions, protected documents and binary inspection requirements. Missing evidence remains unknown.",
      "Return MODEL: <actual full model ID> on its own line, then {input_sha256:worker_input_sha256,verifications:[{inputs_sha256,state,method,evidence,asset_checks}]}. Account for every verification scope exactly once. State is passed, failed or unknown. Passed scopes need current raw-byte source quotes {path,sha256,start,end,quote_sha256}. Asset checks are {path,sha256,artifact:{path,sha256}} with bounded private inspection evidence.",
      "Keep source unchanged. Write only needed private asset inspection records. Do not commit, publish, close, run network commands, delegate or resume another context. Effect authority and independent review follow separately.",
      "DOCS_DRIFT_REQUEST: " + JSON.stringify({ path: join(run.directory, request.path), sha256: request.sha256 }),
    ].join("\n");
    const worker = await captureConfiguredRole({ source_repo: repo, candidate_repo: cwd, source_commit: source, artifact_root: run.directory,
      runtime, role: "worker", cwd, prompt: workerPrompt, environment: process.env, target_sha256: inputs.worker_input_sha256,
      policy: readAdoptedRolePolicy({ ...native, role: "worker" }) });
    const reviewed = await collectClosureReviewTarget({ ...common, selection, observation, worker_capture: worker });
    if (!reviewed.complete || !reviewed.manifest || !reviewed.manifest_sha256) throw Error(reviewed.diagnostics.join("\n") || "Exact closure review target required");
    const reviewRequest = retain("closure-review-request", canonicalJSON({ schema_version: 1, kind: "docs-drift-closure-review-request",
      artifact_root: run.directory, source_commit: source, source_verification: sourceVerification, target,
      originals: originalReference, worker_capture: worker, target_sha256: reviewed.manifest_sha256, manifest: reviewed.manifest,
      project_procedure: settings.project_procedure, feedback_files: settings.feedback_files,
      canonicalizer: join(runtime.component.directory, "scripts/docs-drift/protocol.ts") }));
    const reviewerPrompt = [
      "Independently review the exact post-merge cleanup manifest. Read every full original hunk, original worker records, current source, merged replacement, disposition, feedback and project procedure. Verify all comments and closures and the fresh source evidence for every scope. Unknown evidence or unmerged replacement prevents a clean review.",
      "Use read-only tools. Do not write, run shell/network commands, publish, delegate or reuse a session. This review grants no owner permission.",
      "Return exactly MODEL: <actual full model ID>, then canonical FINDING/KIND/SEVERITY/WHERE/EVIDENCE/PROPOSAL records or exactly NO FINDINGS. Blocking and should-fix findings stop this batch.",
      "DOCS_DRIFT_REQUEST: " + JSON.stringify({ path: join(run.directory, reviewRequest.path), sha256: reviewRequest.sha256 }),
    ].join("\n");
    const reviewer = await captureConfiguredRole({ source_repo: repo, candidate_repo: cwd, source_commit: source, artifact_root: run.directory,
      runtime, role: "reviewer", cwd, prompt: reviewerPrompt, environment: process.env, target_sha256: reviewed.manifest_sha256,
      policy: readAdoptedRolePolicy({ ...native, role: "reviewer" }) });
    for (const reference of [request, reviewRequest, originalReference]) readBoundArtifact({ source_repo: repo, artifact_root: run.directory, reference });
    const final = await collectClosureReview({ ...common, selection, observation, worker_capture: worker, reviewer_capture: reviewer });
    if (!final.complete) throw Error(final.diagnostics.join("\n") || "Independent closure review incomplete");
    return { kind: "review" as const, artifacts: { source_verification: sourceVerification,
      closure_selection: retain("closure-selection", canonicalJSON(selection)), worker_capture: worker, reviewer_capture: reviewer,
      reviewed_plan: retain("reviewed-plan", canonicalJSON(reviewed.manifest)), closure_review: retain("closure-review", canonicalJSON(final)) } };
  });
}
