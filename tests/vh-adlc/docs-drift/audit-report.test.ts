import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { put } from "./repository-fixture";
import { assessmentReviewFixture } from "./assessment-review-fixture";
import { evidence } from "./manifest-fixture";
import { captureSyntheticRole } from "./original-publication-fixture";
import { collectAssessmentReviewTarget } from "../../../plugins/vh-adlc/scripts/docs-drift/assessment-review";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
let preserveRoots = false;
afterAll(() => { if (preserveRoots) console.error("Preserved failed original audit report roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("final audit reporting uses the original starting context and independently reviewed proposals without publishing", async () => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-report");
    const f = await assessmentReviewFixture(roots); put(f.repo, "docs/guide.md", "Preserve the owner draft\n");
    const before = captureRepositoryState(f.repo);
    const begun = await api.beginAuditReport(f.options);
    expect(begun.complete, JSON.stringify(begun.diagnostics)).toBe(true);
    const target = await collectAssessmentReviewTarget({ ...f.options, worker_capture: f.worker });
    expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
    const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!,
      evidence("original-final-report-reviewer", target.target_sha256!, "NO FINDINGS\n"));
    const report = await api.completeAuditReport(begun, { worker_capture: f.worker, reviewer_capture: reviewer });
    expect(report.complete, JSON.stringify(report.diagnostics)).toBe(true); expect(report.authority).toBe("none");
    expect(report.report).toMatchObject({ run_id: f.options.run, started_at: begun.started_at, source_commit: f.source,
      collection_complete: true, outcome: "new-attention", success: false, published: [], carried_delivery: [] });
    expect(report.report?.attention.some(item => item.item.identity === "edit:guide-fix")).toBe(true);
    expect(report.markdown).toContain("Proposed documentation correction");
    expect(report.counts).toMatchObject({ proposed_edits: 1, required_proposals: 0, collected_proposals: 0, unassessed_proposals: 0 });
    expect(() => api.readOriginalAuditReport(JSON.parse(JSON.stringify(report)))).toThrow("Original completed audit report required");
    expect(report.report).toEqual(api.readOriginalAuditReport(report));
    const invalid = await api.completeAuditReport(begun, { worker_capture: f.worker, reviewer_capture: f.worker });
    expect(invalid.complete).toBe(false); expect(invalid.report?.outcome).toBe("failed");
    expect(() => api.readOriginalAuditReport(invalid)).toThrow("Original completed audit report required");
    expect(captureRepositoryState(f.repo)).toEqual(before);
    expect(readFileSync(join(f.repo, "docs/guide.md"), "utf8")).toBe("Preserve the owner draft\n");
    put(f.repo, "docs/guide.md", "A later owner draft\n"); const changed = captureRepositoryState(f.repo);
    const stale = await api.completeAuditReport(begun, { worker_capture: f.worker, reviewer_capture: reviewer });
    expect(stale.complete).toBe(false); expect(stale.report?.outcome).toBe("failed");
    expect(stale.diagnostics.join("\n")).toContain("Caller changed");
    expect(captureRepositoryState(f.repo)).toEqual(changed);
  } catch (error) { preserveRoots = true; throw error; }
}, 245000);

test("copied or incomplete starting contexts cannot become a final report", async () => {
  const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-report");
  await expect(api.completeAuditReport({ complete: true } as never, { worker_capture: { path: "none.json", sha256: "0".repeat(64) }, reviewer_capture: { path: "none.json", sha256: "0".repeat(64) } }))
    .rejects.toThrow("Original complete audit report run required");
});


test("an existing full native proposal stays unassessed and blocks final-report readiness", async () => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-report");
    const f = await assessmentReviewFixture(roots, { proposals: true }), before = captureRepositoryState(f.repo);
    const begun = await api.beginAuditReport(f.options); expect(begun.complete, JSON.stringify(begun.diagnostics)).toBe(true);
    const target = await collectAssessmentReviewTarget({ ...f.options, worker_capture: f.worker });
    expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
    const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!,
      evidence("unassessed-proposal-report-reviewer", target.target_sha256!, "NO FINDINGS\n"));
    const result = await api.completeAuditReport(begun, { worker_capture: f.worker, reviewer_capture: reviewer });
    expect(result.complete).toBe(false); expect(result.report).toMatchObject({ outcome: "failed", success: false, collection_complete: false });
    expect(result.counts).toMatchObject({ required_proposals: 1, collected_proposals: 1, unassessed_proposals: 1 });
    expect(result.report?.attention.some(item => item.item.identity === "proposal:11")).toBe(true);
    expect(result.diagnostics.join("\n")).toContain("Existing audit proposals require complete current semantic assessment");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 245000);
