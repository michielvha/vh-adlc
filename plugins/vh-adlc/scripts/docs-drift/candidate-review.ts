import { realpathSync } from "node:fs";
import { collectReviewTarget } from "./review-target";
import { readAdoptedRolePolicy, readNativeRoleCapture, roleRuntimeDigest } from "./role-capture";
import { verifyReviewEvidence } from "./manifests";
import { canonicalDigest, freezeJSON } from "./protocol";
import { captureRepositoryState, matchesRepositoryState } from "./snapshot";

type Options = Parameters<typeof collectReviewTarget>[0] & { reviewer_capture: unknown };
type CandidateReview = {
  schema_version: 1; kind: "docs-drift-candidate-review"; authority: "none"; complete: boolean; diagnostics: string[];
  target: Awaited<ReturnType<typeof collectReviewTarget>> | null;
  review: { manifest_sha256: string; worker: ReturnType<typeof readNativeRoleCapture>["binding"]; reviewer: ReturnType<typeof readNativeRoleCapture>["binding"] } | null;
};

/** Reload both original independent role captures against the freshly assembled candidate and exact payload. */
export async function collectCandidateReview(input: Options): Promise<CandidateReview> {
  const options = { ...input, worker_capture: structuredClone(input.worker_capture), reviewer_capture: structuredClone(input.reviewer_capture) };
  const repo = realpathSync(options.repo), candidate = realpathSync(options.candidate_repo);
  const before = canonicalDigest(captureRepositoryState(repo)), candidateBefore = canonicalDigest(captureRepositoryState(candidate));
  const result: CandidateReview = { schema_version: 1, kind: "docs-drift-candidate-review", authority: "none", complete: false, diagnostics: [], target: null, review: null };
  try {
    result.target = await collectReviewTarget(options);
    if (!result.target.complete) { result.diagnostics.push(...result.target.diagnostics); throw Error("Current candidate review target required"); }
    const target = result.target, facts = target.bindings?.facts;
    if (!target.manifest || !target.manifest_sha256 || !facts?.runtime || !facts.store || !facts.current_default || !facts.identity) throw Error("Complete native candidate runtime required");
    const runtime = facts.runtime, common = { source_repo: repo, candidate_repo: candidate, artifact_root: options.artifact_root };
    const policyOptions = { repo: facts.store.root, current_default: facts.current_default, identity: facts.identity, runtime };
    const workerPolicy = readAdoptedRolePolicy({ ...policyOptions, role: "worker" }), reviewerPolicy = readAdoptedRolePolicy({ ...policyOptions, role: "reviewer" });
    const worker = readNativeRoleCapture({ ...common, reference: options.worker_capture, policy: workerPolicy,
      expected: { role: "worker", source_commit: options.source, runtime_sha256: roleRuntimeDigest(runtime, "worker"), target_sha256: target.bindings!.worker_input_sha256! } });
    const reviewer = readNativeRoleCapture({ ...common, reference: options.reviewer_capture, policy: reviewerPolicy,
      expected: { role: "reviewer", source_commit: options.source, runtime_sha256: roleRuntimeDigest(runtime, "reviewer"), target_sha256: target.manifest_sha256 } });
    const verified = verifyReviewEvidence({ manifest: target.manifest, current: target.manifest, worker: worker.evidence, reviewer: reviewer.evidence,
      policy: { worker: workerPolicy, reviewer: reviewerPolicy } });
    result.review = { manifest_sha256: verified.manifest_sha256, worker: worker.binding, reviewer: reviewer.binding };
    result.complete = true;
  } catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Original candidate review unavailable"); }
  if (!matchesRepositoryState(repo, before) || !matchesRepositoryState(candidate, candidateBefore)) {
    result.complete = false; result.diagnostics.push("Caller changed or became unavailable during original review collection");
  }
  result.diagnostics = [...new Set(result.diagnostics)];
  return freezeJSON(result);
}
