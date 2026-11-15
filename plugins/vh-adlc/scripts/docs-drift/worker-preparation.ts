import { readCoordinatedSelection } from "./coordination";
import { PublicationScopeChanged } from "./publish";
import { parseWorkerHandoff } from "./worker-handoff";
import { readAssessmentReport } from "./assessment-report";
import { join } from "node:path";
import { realpathSync } from "node:fs";
import { collectWorkerInputs, type WorkerCollectionOptions } from "./publication-worker";
import { ArtifactChanged, readBoundArtifact } from "./evidence-input";
import { parseDecisionPacket, validateAdvisorySelection } from "./publication-decisions";
import { inspectPreparation } from "./preparation";
import { canonicalDigest, freezeJSON, protocolPath } from "./protocol";
import type { Edit } from "./resolve";
import { readAdoptedRolePolicy, readNativeRoleCapture, roleRuntimeDigest } from "./role-capture";
import { artifactDirectoryScope, captureRepositoryState, captureSnapshot, matchesRepositoryState } from "./snapshot";
import { verifyRoleIdentity } from "./manifests";

type Preparation = {
  schema_version: 1; kind: "docs-drift-worker-preparation"; authority: "none"; complete: boolean; scope_changed: boolean; diagnostics: string[];
  worker_inputs: Awaited<ReturnType<typeof collectWorkerInputs>> | null;
  worker: Omit<ReturnType<typeof readNativeRoleCapture>, "evidence"> | null;
  selection: { schema_version: 1; source_commit: string; edits: Edit[] } | null;
  assessment: ReturnType<typeof readAssessmentReport> | null;
  proposal_assessment_reference: ReturnType<typeof parseWorkerHandoff>["proposal_assessment_reference"];
  resolution_verifications: ReturnType<typeof parseWorkerHandoff>["resolution_verifications"];
  publication: ReturnType<typeof parseWorkerHandoff>["publication"]; inspection: ReturnType<typeof inspectPreparation> | null;
};

/** Preserve the original worker's bounded output as preparation data under current source/runtime checks. */
export async function collectWorkerPreparation(input: WorkerCollectionOptions & { worker_capture: unknown; candidate_repo?: string }): Promise<Preparation> {
  const options = { ...input, source_verification: structuredClone(input.source_verification), decisions: structuredClone(input.decisions), worker_capture: structuredClone(input.worker_capture) };
  const repo = realpathSync(options.repo), before = canonicalDigest(captureRepositoryState(repo));
  const result: Preparation = { schema_version: 1, kind: "docs-drift-worker-preparation", authority: "none", complete: false, scope_changed: false, diagnostics: [],
    worker_inputs: null, worker: null, selection: null, assessment: null, proposal_assessment_reference: null, resolution_verifications: null, publication: null, inspection: null };
  try {
    result.worker_inputs = await collectWorkerInputs(options);
    if (!result.worker_inputs.complete) { result.diagnostics.push(...result.worker_inputs.diagnostics); throw Error("Current worker inputs incomplete"); }
    const current = result.worker_inputs, facts = current.facts;
    if (!current.worker_input_sha256 || !facts?.runtime || !facts.store || !facts.current_default || !facts.identity) throw Error("Current native worker runtime required");
    const runtime = facts.runtime;
    const policy = readAdoptedRolePolicy({ repo: facts.store.root, current_default: facts.current_default, identity: facts.identity, runtime, role: "worker" });
    const captured = readNativeRoleCapture({ source_repo: repo, candidate_repo: options.candidate_repo, artifact_root: options.artifact_root, reference: options.worker_capture, policy,
      expected: { role: "worker", source_commit: options.source, runtime_sha256: roleRuntimeDigest(runtime, "worker"), target_sha256: current.worker_input_sha256 } });
    result.worker = { binding: captured.binding, launch: captured.launch };
    const verified = verifyRoleIdentity(captured.evidence, policy), snapshot = captureSnapshot(repo, options.source);
    const handoff = parseWorkerHandoff({ records: verified.records, source: options.source, input_sha256: current.worker_input_sha256,
      max_entry_bytes: snapshot.settings.reports.max_entry_bytes });
    result.selection = handoff.selection;
    const decisions = parseDecisionPacket(readBoundArtifact({ source_repo: repo, artifact_root: options.artifact_root, reference: options.decisions }), snapshot);
    if (decisions.mode === "advisory") validateAdvisorySelection(decisions, result.selection);
    result.publication = handoff.publication;
    // This is original worker data; only the separate assessment reviewer validates its full proposal judgments.
    result.proposal_assessment_reference = handoff.proposal_assessment_reference;
    result.resolution_verifications = handoff.resolution_verifications;
    if (handoff.proposal_assessment_reference) {
      const secondary = artifactDirectoryScope(options.artifact_root, options.candidate_repo ?? repo), reference = handoff.proposal_assessment_reference;
      secondary.assertExternal(join(secondary.directory, protocolPath(reference.path)));
      readBoundArtifact({ source_repo: repo, artifact_root: secondary.directory, reference });
    }
    const coordinated = readCoordinatedSelection({ repo, source: options.source, artifact_root: options.artifact_root,
      selection: result.selection, reference: decisions.coordination });
    result.inspection = inspectPreparation({ repo, source: options.source, selection: result.selection, protection_context: { coordinated } });
    if (!result.inspection.complete) { result.diagnostics.push(...result.inspection.diagnostics); throw Error("Original worker preparation incomplete"); }
    if (handoff.assessment_reference) {
      const secondary = artifactDirectoryScope(options.artifact_root, options.candidate_repo ?? repo), reference = handoff.assessment_reference;
      secondary.assertExternal(join(secondary.directory, protocolPath(reference.path)));
      const recheck = () => readBoundArtifact({ source_repo: repo, artifact_root: secondary.directory, reference });
      recheck();
      result.assessment = readAssessmentReport({ ...options, repo, assessment: reference, protection_context: { coordinated } });
      recheck();
      if (!result.assessment.complete) { result.diagnostics.push(...result.assessment.diagnostics); throw Error("Original worker assessment incomplete"); }
    }
    result.complete = true;
  } catch (error) {
    result.scope_changed = error instanceof PublicationScopeChanged || error instanceof ArtifactChanged || Boolean(result.worker_inputs?.scope_changed);
    result.diagnostics.push(error instanceof Error ? error.message : "Original worker preparation unavailable");
  }
  if (!matchesRepositoryState(repo, before)) { result.complete = false; result.diagnostics.push("Caller changed or became unavailable during worker handoff collection"); }
  result.diagnostics = [...new Set(result.diagnostics)];
  return freezeJSON(result);
}
