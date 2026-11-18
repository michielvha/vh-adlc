import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { assessmentReviewFixture } from "./assessment-review-fixture";
import { evidence } from "./manifest-fixture";
import { captureSyntheticRole } from "./original-publication-fixture";
import { put } from "./repository-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
let preserveRoots = false;
afterAll(() => {
  if (preserveRoots) console.error("Preserved failed owned assessment CLI roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("the native assessment collectors bind actual original captures and emit the reviewed report without effects", async () => {
  try {
    const f = await assessmentReviewFixture(roots), options = f.options;
    put(f.repo, "docs/guide.md", "Keep the caller's documentation draft\n");
    const before = captureRepositoryState(f.repo);
    const run = async (command: "collect-assessment-review-target" | "read-assessment-review", reviewer?: { path: string; sha256: string }) => {
      const { collectAssessmentReviewTarget, collectAssessmentReview, assessmentReviewOutput } = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-review");
      const input = { ...options, worker_capture: f.worker };
      const result = command === "collect-assessment-review-target" ? assessmentReviewOutput(command, await collectAssessmentReviewTarget(input))
        : assessmentReviewOutput(command, await collectAssessmentReview({ ...input, reviewer_capture: reviewer }));
      expect(result.outcome, JSON.stringify(result.diagnostics)).toBe("collected");
      expect(Buffer.byteLength(JSON.stringify(result) + "\n")).toBeLessThanOrEqual(524288);
      return result;
    };
    const first = await run("collect-assessment-review-target");
    if (!("assessment_review_target" in first)) throw Error("Original assessment review target required");
    const target = first.assessment_review_target;
    expect(target).toMatchObject({ complete: true, authority: "none", review: null });
    expect(first.markdown).toBeUndefined();
    if (!target.reviewer_runtime_sha256 || !target.target_sha256) throw Error("Bound assessment target required");
    const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256,
      evidence("original-assessment-cli-reviewer", target.target_sha256, "NO FINDINGS\n"));
    const reviewed = await run("read-assessment-review", reviewer);
    if (!("assessment_review" in reviewed)) throw Error("Original assessment review required");
    expect(reviewed.assessment_review).toMatchObject({ complete: true, authority: "none", review: { target_sha256: target.target_sha256 } });
    expect(reviewed.markdown).toContain("Finding assessments independently reviewed by claude-opus-5.5");
    expect(reviewed.markdown).toContain("0 candidate(s)"); expect(reviewed.markdown).not.toContain("provisional pending independent review");
    expect(captureRepositoryState(f.repo)).toEqual(before);
    expect(readFileSync(join(f.repo, "docs/guide.md"), "utf8")).toBe("Keep the caller's documentation draft\n");
  } catch (error) { preserveRoots = true; throw error; }
}, 305000);
