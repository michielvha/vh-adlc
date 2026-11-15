import { runtimePolicyBinding } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assessmentReviewFixture } from "./assessment-review-fixture";
import { evidence } from "./manifest-fixture";
import { captureSyntheticRole } from "./original-publication-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
let preserveRoots = false;
afterAll(() => {
  if (preserveRoots) console.error("Preserved failed owned assessment review roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test.each(["matching", "nit", "changed-assessment", "wrong-review-target", "same-context", "should-fix"])("native reviewed assessment keeps original source and independent context: %s", async fault => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-review");
    const f = await assessmentReviewFixture(roots), options = { ...f.options, worker_capture: f.worker };
    const before = captureRepositoryState(f.repo);
    const target = await api.collectAssessmentReviewTarget(options);
    expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
    if (!target.target_sha256 || !target.manifest || !target.reviewer_runtime_sha256) throw Error("Missing exact original assessment target");
    expect(target.authority).toBe("none"); expect(target.review).toBe(null);
    expect(target.manifest?.assessment.counts).toMatchObject({ candidates: 0, assessed: 0 });
    expect(Object.hasOwn(target.manifest!, "effects")).toBe(false);
    const same = await api.collectAssessmentReviewTarget(options);
    expect(same.target_sha256).toBe(target.target_sha256);
    const original = evidence("independent-assessment-reviewer", fault === "wrong-review-target" ? "f".repeat(64) : target.target_sha256!, ["should-fix", "nit"].includes(fault)
      ? "FINDING: F-01\nKIND: factual\nSEVERITY: " + fault + "\nWHERE: finding assessment\nEVIDENCE: Wording needs clarification\nPROPOSAL: Reinspect the original source\n" : "NO FINDINGS\n");
    if (fault === "same-context") original.context_id = target.manifest!.worker.context_id;
    const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!, original);
    if (fault === "changed-assessment") writeFileSync(join(f.artifacts, f.assessment.path), "Changed actual original assessment\n");
    const reviewed = await api.collectAssessmentReview({ ...options, reviewer_capture: reviewer });
    expect(reviewed.complete, JSON.stringify(reviewed.diagnostics)).toBe(["matching", "nit"].includes(fault));
    expect(reviewed.authority).toBe("none");
    if (["matching", "nit"].includes(fault)) {
      expect(reviewed.review?.target_sha256).toBe(target.target_sha256);
      expect(reviewed.review?.worker.invocation_id).toBe("original-assessment-worker");
      expect(reviewed.review?.reviewer.invocation_id).toBe("independent-assessment-reviewer");
      const output = api.assessmentReviewOutput("read-assessment-review", reviewed);
      expect(output.markdown).toContain("independently reviewed by claude-opus-5.5");
      expect(output.markdown).not.toContain("provisional pending independent review");
      expect(reviewed.review?.nit_count).toBe(fault === "nit" ? 1 : 0);
      if (fault === "nit") expect(output.markdown).toContain("1 minor review finding(s) remain in the original reviewer records");
      const { requireReviewedManifest } = await import("../../../plugins/vh-adlc/scripts/docs-drift/manifests");
      expect(() => requireReviewedManifest(reviewed as unknown as Parameters<typeof requireReviewedManifest>[0])).toThrow("missing owned review result");
    } else {
      const reasons: Record<string, string> = { "changed-assessment": "artifact changed", "wrong-review-target": "original launch target or context changed",
        "same-context": "independent review context", "should-fix": "blocking review findings" };
      expect(reviewed.diagnostics.join("\n")).toContain(reasons[fault]);
      if (fault === "changed-assessment") expect(reviewed.scope_changed).toBe(true);
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
    expect(readFileSync(join(f.repo, "docs/guide.md"), "utf8")).not.toContain("Changed actual");
  } catch (error) { preserveRoots = true; throw error; }
}, 245000);


test("a bounded assessment target preserves original records and refuses an oversized combined review", async () => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-review"), f = await assessmentReviewFixture(roots, { large: true });
    const before = captureRepositoryState(f.repo), original = readFileSync(join(f.artifacts, f.assessment.path));
    const target = await api.collectAssessmentReviewTarget({ ...f.options, worker_capture: f.worker });
    expect(target.complete).toBe(false); expect(target.details_omitted).toBe(true);
    expect(target.manifest).toBe(null); expect(target.review).toBe(null); expect(target.authority).toBe("none");
    expect(target.diagnostics.join("\n")).toContain("exceed the retained entry bound");
    const output = api.assessmentReviewOutput("collect-assessment-review-target", target);
    expect(Buffer.byteLength(JSON.stringify(output) + "\n")).toBeLessThanOrEqual(524288);
    expect(readFileSync(join(f.artifacts, f.assessment.path))).toEqual(original);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 245000);

test("a finding assessment refuses a serialized inventory capability instead of ignoring it", async () => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-review"), f = await assessmentReviewFixture(roots);
    const before = captureRepositoryState(f.repo);
    const inventory = { original: { schema_version: 1, kind: "docs-drift-proposal-snapshot", inventory: [], resolution_sha256: null }, own: [], observations: [] };
    const result = await api.collectAssessmentReviewTarget({ ...f.options, worker_capture: f.worker,
      inventory_context: inventory as unknown as import("../../../plugins/vh-adlc/scripts/docs-drift/publication-inventory").PublicationInventory });
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(false);
    expect(result.authority).toBe("none");
    expect(result.diagnostics.join("\n")).toContain("Original native publication inventory context required");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 125000);

test("a finding assessment preserves the native inventory capability across option copying", async () => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-review"), f = await assessmentReviewFixture(roots);
    const { collectWorkerInputs } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-worker");
    const { capturePublicationInventory } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-inventory");
    const { fixture, bindings } = await import("./manifest-fixture");
    const { validateReviewedManifest } = await import("../../../plugins/vh-adlc/scripts/docs-drift/manifests");
    const { sealPlan, createJournal, writePublicationObjects } = await import("../../../plugins/vh-adlc/scripts/docs-drift/journal");
    const options = { ...f.options, worker_capture: f.worker }, before = captureRepositoryState(f.repo);
    const target = await api.collectAssessmentReviewTarget(options);
    expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
    const current = await collectWorkerInputs(f.options);
    if (!current.proposal_snapshot || !current.inputs || !current.source_verification?.object_store || !current.facts?.runtime)
      throw Error("Missing original native inventory fixture inputs");
    // An empty, genuinely sealed synthetic journal needs no remote observation or effect.
    const input = fixture({ ...bindings, source_commit: f.source, candidate_commit: f.source,
      proposals_sha256: current.inputs.proposals_sha256 }, [], "assessment-inventory");
    const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: [], ...runtimePolicyBinding(current.facts.runtime),
      context: "production", transport: "native", publication_kind: "advisory", corrections: [], attention: [] });
    const journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan });
    let observations = 0;
    const context = await capturePublicationInventory({ source_repo: f.repo, artifact_root: f.artifacts, journal_directory: journal.directory,
      original: current.proposal_snapshot, current_proposals: current.proposals!.proposals,
      objects: writePublicationObjects(current.source_verification.object_store, plan, journal.header),
      transport: { kind: "native", observe: async () => { observations++; throw Error("Empty journal must not observe effects"); } } });
    const result = await api.collectAssessmentReviewTarget({ ...options, inventory_context: context });
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.target_sha256).toBe(target.target_sha256); expect(result.authority).toBe("none");
    expect(observations).toBe(0);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 245000);
