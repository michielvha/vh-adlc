import { afterAll, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { bindingFixture } from "./binding-fixture";
import { readSourceAssessmentArtifacts } from "../../../plugins/vh-adlc/scripts/docs-drift/source-assessment";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(["verified-correction", "verified-source", "source-only", "edited-source", "different-candidate", "different-reference"])("publication candidate proof %s", async scenario => {
  const { readPublicationCandidateProof } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-proof");
  const f = await bindingFixture(roots, false, { sourceCheckNeedsRepair: !["verified-correction", "verified-source"].includes(scenario) });
  const source = readSourceAssessmentArtifacts({ ...f.options, reference: f.options.source_verification });
  const selected = scenario === "verified-correction" ? f.options : {
    ...f.options, candidate_repo: f.repo, candidate: f.source,
    selection: { schema_version: 1, source_commit: f.source, edits: [] }, candidate_verification: f.options.source_verification,
  };
  if (scenario === "edited-source") selected.selection = f.selection;
  if (scenario === "different-candidate") selected.candidate = f.head;
  if (scenario === "different-reference") selected.candidate_verification = { path: "unavailable-record.json", sha256: "0".repeat(64) };
  if (["edited-source", "different-candidate", "different-reference"].includes(scenario)) {
    expect(() => readPublicationCandidateProof(selected, source)).toThrow();
    return;
  }
  const proof = readPublicationCandidateProof(selected, source);
  expect(proof.source_only).toBe(scenario === "source-only");
  expect(proof.scan.complete).toBe(true);
  expect(proof.inspection.complete).toBe(true);
  expect(proof.verification === null).toBe(scenario === "source-only");
  expect(proof.evidence).toEqual(selected.candidate_verification);
  if (scenario === "source-only") {
    expect(f.baseline.complete).toBe(false);
    expect(proof.inspection.changed_paths).toEqual([]);
    expect(proof.inspection.object_store?.root).toBe(source.object_store?.root);
  }
}, 60000);

test("normal binding collection supports a source-only issue assessment with failing baseline checks", async () => {
  const f = await bindingFixture(roots, false, { sourceCheckNeedsRepair: true });
  const { collectPublicationBindings } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-bindings");
  const decisions = canonicalJSON({ ...f.decisions, decisions: [] });
  writeFileSync(join(f.artifacts, "source-only-decisions.json"), decisions, { mode: 0o600 });
  const result = await collectPublicationBindings({ ...f.options, candidate_repo: f.repo, candidate: f.source,
    selection: { schema_version: 1, source_commit: f.source, edits: [] }, candidate_verification: f.options.source_verification,
    decisions: { path: "source-only-decisions.json", sha256: sha256(decisions) } });
  expect(result.complete, result.diagnostics.join("\n")).toBe(true);
  expect(result.candidate_source_only).toBe(true);
  expect(result.candidate_verification).toBeNull();
  expect(result.corrections).toEqual([]);
  expect(result.bindings?.candidate_commit).toBe(f.source);
  expect(f.baseline.complete).toBe(false);
}, 60000);

test.each(["issue-create", "pr-create"] as const)("the original reviewer target restricts source-only proof to issues %s", async kind => {
  const { sourceOnlyFixture } = await import("./source-only-fixture");
  const { collectReviewTarget } = await import("../../../plugins/vh-adlc/scripts/docs-drift/review-target");
  const f = await sourceOnlyFixture(roots, kind);
  const target = await collectReviewTarget({ ...f.options, worker_capture: f.worker });
  expect(target.complete, target.diagnostics.join("\n")).toBe(kind === "issue-create");
  if (kind === "pr-create") {
    expect(target.diagnostics.join("\n")).toContain("Source-only publication requires an issue proposal");
    return;
  }
  expect(target.bindings?.candidate_source_only).toBe(true);
  expect(target.bindings?.candidate_verification).toBeNull();
  expect(target.manifest?.effects.map(effect => effect.kind)).toEqual(["lease-acquire", "receipt-retain", "issue-create", "lease-release"]);
  expect(target.manifest?.bindings.candidate_commit).toBe(f.source);
  expect(target.manifest?.bindings.source_commit).toBe(f.source);
}, 60000);
