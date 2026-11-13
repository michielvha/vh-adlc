import { expect, test } from "bun:test";
import { evidence, hash, role } from "./manifest-fixture";

function fixture() {
  const workerTarget = hash("Complete original assessment inputs"), reviewerTarget = hash("Exact assessment and its original worker binding");
  return { worker: evidence("report-author", workerTarget, "Original assessment records\n"), reviewer: evidence("report-reviewer", reviewerTarget, "NO FINDINGS\n"),
    worker_target_sha256: workerTarget, reviewer_target_sha256: reviewerTarget, policy: { worker: role, reviewer: role } };
}

test("a native assessment review proves its exact independent targets without effect authority", async () => {
  const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/manifests"), input = fixture();
  const result = api.verifyIndependentRoleReview(input);
  expect(result.worker.target_sha256).toBe(input.worker_target_sha256);
  expect(result.reviewer.target_sha256).toBe(input.reviewer_target_sha256);
  expect(result.worker.context_id).not.toBe(result.reviewer.context_id);
  // A read-only review result is deliberately not the sealed effect-authorized plan type.
  expect(() => api.requireReviewedManifest(result as unknown as Parameters<typeof api.requireReviewedManifest>[0])).toThrow("missing owned review result");
});

test.each(["same-context", "same-invocation", "changed-worker-target", "changed-review-target", "should-fix"])("assessment review refuses reused or changed original proof: %s", async fault => {
  const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/manifests"), input = fixture();
  if (fault === "same-context") input.reviewer.context_id = input.worker.context_id;
  if (fault === "same-invocation") input.reviewer.invocation_id = input.worker.invocation_id;
  if (fault === "changed-worker-target") input.worker_target_sha256 = hash("Other source");
  if (fault === "changed-review-target") input.reviewer_target_sha256 = hash("Other assessment");
  if (fault === "should-fix") input.reviewer = evidence("report-reviewer", input.reviewer_target_sha256,
    "FINDING: F-01\nKIND: factual\nSEVERITY: should-fix\nWHERE: assessment\nEVIDENCE: A finding lacks source support\nPROPOSAL: Reinspect its original source\n");
  expect(() => api.verifyIndependentRoleReview(input)).toThrow(fault.startsWith("same-") ? "independent review context"
    : fault === "should-fix" ? "blocking review findings" : "review target");
});
