/** Original source/role artifacts only; no actual model or provider operation. */
import { expect } from "bun:test";
import { bindingFixture } from "./binding-fixture";
import { evidence, role } from "./manifest-fixture";
import { captureSyntheticRole, retainSyntheticArtifact } from "./original-publication-fixture";
import { collectWorkerInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-worker";
import { roleRuntimeDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

export async function assessmentReviewFixture(roots: string[], options: { large?: boolean } = {}) {
  let worker: { path: string; sha256: string } | null = null, assessment: { path: string; sha256: string } | null = null;
  const f = await bindingFixture(roots, false, { scannerCase: options.large ? "finding" : "none", role: { model: role.requested_model, native_model: role.adopted_model, identity_source: role.identity_source },
    beforeCandidate: async input => {
      const current = await collectWorkerInputs(input.worker_options); expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
      assessment = retainSyntheticArtifact(input.artifacts, "original-finding-assessment.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-assessment",
        source_commit: input.source, source_verification_sha256: input.baseline.evidence!.sha256,
          findings: (input.baseline.scan?.findings ?? []).map(finding => ({ id: finding.id, verdict: "unknown", reason: "x".repeat(120000),
            recommendation: "Inspect the original source", evidence: [] })) }));
      const edits = structuredClone((input.selection as { edits: Array<{ replacement_base64: string }> }).edits);
      if (options.large) edits[0].replacement_base64 = Buffer.alloc(307500, "x").toString("base64");
      const original = evidence("original-assessment-worker", current.worker_input_sha256!, canonicalJSON({ input_sha256: current.worker_input_sha256,
        edits, publication: null, assessment }).toString());
      worker = captureSyntheticRole(input.artifacts, input.source, "worker", roleRuntimeDigest(current.facts!.runtime!, "worker"), original);
    } });
  if (!worker || !assessment) throw Error("Missing original assessment fixture captures");
  return { ...f, worker: worker as { path: string; sha256: string }, assessment: assessment as { path: string; sha256: string } };
}
