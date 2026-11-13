import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindingFixture } from "./binding-fixture";
import { evidence, role } from "./manifest-fixture";
import { captureSyntheticRole, retainSyntheticArtifact } from "./original-publication-fixture";
import { git, put } from "./repository-fixture";
import { collectWorkerInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-worker";
import { roleRuntimeDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
let preserveRoots = false;
afterAll(() => {
  if (preserveRoots) console.error("Preserved failed owned worker-assessment roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test.each(["matching", "changed-bytes", "wrong-source", "candidate-artifact"])("original worker assessment is source-bound and externally retained: %s", async fault => {
  try {
    let worker: { path: string; sha256: string } | null = null, assessmentBytes: Buffer | null = null;
    const f = await bindingFixture(roots, false, { role: { model: role.requested_model, native_model: role.adopted_model, identity_source: role.identity_source },
      beforeCandidate: async input => {
        const current = await collectWorkerInputs(input.worker_options);
        expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
        assessmentBytes = canonicalJSON({ schema_version: 1, kind: "docs-drift-assessment", source_commit: fault === "wrong-source" ? "f".repeat(40) : input.source,
          source_verification_sha256: input.baseline.evidence!.sha256, findings: [] });
        const assessment = fault === "candidate-artifact"
          ? { path: "secondary-candidate/finding-assessment.json", sha256: sha256(assessmentBytes) }
          : retainSyntheticArtifact(input.artifacts, "finding-assessment.json", assessmentBytes);
        const original = evidence("assessment-author", current.worker_input_sha256!, canonicalJSON({ input_sha256: current.worker_input_sha256,
          edits: (input.selection as { edits: unknown[] }).edits, publication: null, assessment }).toString());
        worker = captureSyntheticRole(input.artifacts, input.source, "worker", roleRuntimeDigest(current.facts!.runtime!, "worker"), original);
      } });
    if (!worker || !assessmentBytes) throw Error("Missing original synthetic assessment capture");
    let candidate = f.candidate;
    if (fault === "changed-bytes") writeFileSync(join(f.artifacts, "finding-assessment.json"), "Changed original assessment\n");
    if (fault === "candidate-artifact") {
      candidate = join(f.artifacts, "secondary-candidate");
      git(f.root, "clone", "--no-local", "--no-checkout", f.repo, candidate); git(candidate, "checkout", "--detach", f.source);
      writeFileSync(join(candidate, "finding-assessment.json"), assessmentBytes, { mode: 0o600 });
    }
    put(f.repo, "docs/guide.md", "Keep the caller's draft\n");
    const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(candidate);
    const { collectWorkerPreparation } = await import("../../../plugins/vh-adlc/scripts/docs-drift/worker-preparation");
    const result = await collectWorkerPreparation({ ...f.options, candidate_repo: candidate, worker_capture: worker });
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(fault === "matching");
    expect(result.authority).toBe("none");
    if (fault === "matching") {
      expect(result.assessment?.complete).toBe(true);
      expect(result.assessment?.assessment_reference?.path).toBe("finding-assessment.json");
      expect(result.assessment?.counts).toMatchObject({ candidates: 0, assessed: 0, unassessed: 0 });
      expect(result.worker?.binding.invocation_id).toBe("assessment-author");
    } else {
      const reason = fault === "changed-bytes" ? "artifact changed" : fault === "wrong-source" ? "Exact original source" : "overlaps a caller checkout";
      expect(result.diagnostics.join("\n")).toContain(reason);
      if (fault === "changed-bytes") expect(result.scope_changed).toBe(true);
    }
    expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(candidate)).toEqual(candidateBefore);
    expect(readFileSync(join(f.repo, "docs/guide.md"), "utf8")).toBe("Keep the caller's draft\n");
  } catch (error) { preserveRoots = true; throw error; }
}, 125000);
