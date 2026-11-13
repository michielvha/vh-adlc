import { readCoordinatedSelection } from "./coordination";
import { PublicationScopeChanged } from "./publish";
import { parseWorkerPublication } from "./publication-proposal";
import { realpathSync } from "node:fs";
import { collectWorkerInputs, type WorkerCollectionOptions } from "./publication-worker";
import { ArtifactChanged, readBoundArtifact } from "./evidence-input";
import { exactRecord, parseDecisionPacket, validateAdvisorySelection } from "./publication-decisions";
import { inspectPreparation } from "./preparation";
import { canonicalDigest, canonicalJSON, freezeJSON } from "./protocol";
import { parseEdit, type Edit } from "./resolve";
import { readAdoptedRolePolicy, readNativeRoleCapture, roleRuntimeDigest } from "./role-capture";
import { captureRepositoryState, captureSnapshot, matchesRepositoryState } from "./snapshot";
import { verifyRoleIdentity } from "./manifests";

type Preparation = {
  schema_version: 1; kind: "docs-drift-worker-preparation"; authority: "none"; complete: boolean; scope_changed: boolean; diagnostics: string[];
  worker_inputs: Awaited<ReturnType<typeof collectWorkerInputs>> | null;
  worker: Omit<ReturnType<typeof readNativeRoleCapture>, "evidence"> | null;
  selection: { schema_version: 1; source_commit: string; edits: Edit[] } | null;
  publication: ReturnType<typeof parseWorkerPublication>; inspection: ReturnType<typeof inspectPreparation> | null;
};

/** Preserve the original worker's bounded output as preparation data under current source/runtime checks. */
export async function collectWorkerPreparation(input: WorkerCollectionOptions & { worker_capture: unknown }): Promise<Preparation> {
  const options = { ...input, source_verification: structuredClone(input.source_verification), decisions: structuredClone(input.decisions), worker_capture: structuredClone(input.worker_capture) };
  const repo = realpathSync(options.repo), before = canonicalDigest(captureRepositoryState(repo));
  const result: Preparation = { schema_version: 1, kind: "docs-drift-worker-preparation", authority: "none", complete: false, scope_changed: false, diagnostics: [],
    worker_inputs: null, worker: null, selection: null, publication: null, inspection: null };
  try {
    result.worker_inputs = await collectWorkerInputs(options);
    if (!result.worker_inputs.complete) { result.diagnostics.push(...result.worker_inputs.diagnostics); throw Error("Current worker inputs incomplete"); }
    const current = result.worker_inputs, facts = current.facts;
    if (!current.worker_input_sha256 || !facts?.runtime || !facts.store || !facts.current_default || !facts.identity) throw Error("Current native worker runtime required");
    const runtime = facts.runtime;
    const policy = readAdoptedRolePolicy({ repo: facts.store.root, current_default: facts.current_default, identity: facts.identity, runtime, role: "worker" });
    const captured = readNativeRoleCapture({ source_repo: repo, artifact_root: options.artifact_root, reference: options.worker_capture, policy,
      expected: { role: "worker", source_commit: options.source, runtime_sha256: roleRuntimeDigest(runtime, "worker"), target_sha256: current.worker_input_sha256 } });
    result.worker = { binding: captured.binding, launch: captured.launch };
    const verified = verifyRoleIdentity(captured.evidence, policy), snapshot = captureSnapshot(repo, options.source);
    if (Buffer.byteLength(verified.records, "utf8") > snapshot.settings.reports.max_entry_bytes) throw Error("Bounded original worker handoff required");
    const packet = exactRecord(JSON.parse(verified.records), ["input_sha256", "edits", "publication"], "Original worker handoff fields changed");
    if (packet.input_sha256 !== current.worker_input_sha256 || !Array.isArray(packet.edits)) throw Error("Original worker input target changed");
    const publication = parseWorkerPublication(packet.publication);
    const edits = packet.edits.map(parseEdit);
    result.selection = { schema_version: 1, source_commit: options.source, edits };
    const decisions = parseDecisionPacket(readBoundArtifact({ source_repo: repo, artifact_root: options.artifact_root, reference: options.decisions }), snapshot);
    if (decisions.mode === "advisory") validateAdvisorySelection(decisions, result.selection);
    result.publication = publication;
    const coordinated = readCoordinatedSelection({ repo, source: options.source, artifact_root: options.artifact_root,
      selection: result.selection, reference: decisions.coordination });
    result.inspection = inspectPreparation({ repo, source: options.source, selection: result.selection, protection_context: { coordinated } });
    if (!result.inspection.complete) { result.diagnostics.push(...result.inspection.diagnostics); throw Error("Original worker preparation incomplete"); }
    // Keep the exact parsed worker postimages; preparation and publication have separate grants.
    if (!canonicalJSON(packet.edits).equals(canonicalJSON(edits))) throw Error("Original worker edit representation changed");
    result.complete = true;
  } catch (error) {
    result.scope_changed = error instanceof PublicationScopeChanged || error instanceof ArtifactChanged || Boolean(result.worker_inputs?.scope_changed);
    result.diagnostics.push(error instanceof Error ? error.message : "Original worker preparation unavailable");
  }
  if (!matchesRepositoryState(repo, before)) { result.complete = false; result.diagnostics.push("Caller changed or became unavailable during worker handoff collection"); }
  result.diagnostics = [...new Set(result.diagnostics)];
  return freezeJSON(result);
}
