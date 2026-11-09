import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { readBoundArtifact } from "./evidence-input";
import { publishArtifact } from "./journal";
import { advisoryDecisionIDs, parseDecisionPacket, projectAttentionProposals } from "./publication-decisions";
import { collectPublicationOriginals } from "./publication-originals";
import { collectProposals, projectProposalBindings } from "./proposals";
import { recheckResolutionInputs, type ResolutionCollection, type ResolutionInputs } from "./resolve-inputs";
import { roleRuntimeDigest } from "./role-capture";
import { readSourceAssessmentArtifacts } from "./source-assessment";
import { readNativeContext } from "./transport";
import type { AttentionProjection } from "./report";
import { collectPublicationInputs } from "./publication-inputs";
import { workerInputsDigest, type WorkerInputs } from "./manifests";
import { canonicalDigest, canonicalJSON, freezeJSON, sha256 } from "./protocol";
import { resolutionSource } from "./resolve";
import { artifactDirectoryScope, captureRepositoryState, captureSnapshot, matchesRepositoryState, type Snapshot } from "./snapshot";

/** Source assessment and explicit decisions exist before a worker can produce a candidate. */
export function deriveWorkerInputs(options: {
  snapshot: Snapshot; assessment_sha256: string; source_verification: { path: string; sha256: string };
  decisions_sha256: string; proposals_sha256: string;
}): WorkerInputs {
  const { snapshot } = options;
  const implementation = (path: string | null) => {
    if (path === null) return null;
    const blob = snapshot.blobs.find(blob => blob.path === path);
    if (!blob) throw Error("Declared scanner implementation missing");
    return sha256(blob.bytes);
  };
  return freezeJSON({ source_commit: snapshot.source_commit, assessment_sha256: options.assessment_sha256,
    settings_sha256: snapshot.settings_sha256,
    scanner_sha256: canonicalDigest({ policy: snapshot.settings.scanner, script: implementation(snapshot.settings.scanner.script), adapter: implementation(snapshot.settings.scanner.adapter) }),
    options_sha256: canonicalDigest(snapshot.settings.detector_options), scope_sha256: snapshot.protocol.bindings.scope_sha256,
    feedback_sha256: snapshot.protocol.bindings.feedback_sha256, proposals_sha256: options.proposals_sha256, decisions_sha256: options.decisions_sha256,
    dependencies_sha256: canonicalDigest({ source: resolutionSource(snapshot), source_verification: options.source_verification }) });
}

export type WorkerCollectionOptions = Omit<Parameters<typeof collectPublicationInputs>[0], "candidate_repo" | "candidate" | "selection" | "resolution_record" | "object_store"> & {
  source_verification: unknown; decisions: unknown;
};


type WorkerCollection = {
  schema_version: 1; kind: "docs-drift-worker-inputs"; authority: "none"; complete: boolean; diagnostics: string[];
  inputs: WorkerInputs | null; worker_input_sha256: string | null; worker_runtime_sha256: string | null; attention: AttentionProjection[];
  proposal_snapshot: { path: string; sha256: string } | null; proposal_snapshot_path: string | null;
  source_verification: ReturnType<typeof readSourceAssessmentArtifacts> | null;
  facts: Awaited<ReturnType<typeof collectPublicationInputs>> | null; proposals: ReturnType<typeof collectProposals> | null;
  resolution: ResolutionInputs | null;
};

/** Capture native source/decision inputs before authoring a candidate or launching its worker. */
export async function collectWorkerInputs(input: WorkerCollectionOptions): Promise<WorkerCollection> {
  const options: WorkerCollectionOptions = { repo: input.repo, source: input.source, artifact_root: input.artifact_root,
    owner: input.owner, run: input.run, credential: input.credential, path: input.path ?? process.env.PATH,
    cache_directory: input.cache_directory, entry: input.entry, launcher_path: input.launcher_path, settings_path: input.settings_path,
    source_verification: structuredClone(input.source_verification), decisions: structuredClone(input.decisions) };
  const result: WorkerCollection = { schema_version: 1, kind: "docs-drift-worker-inputs", authority: "none", complete: false, diagnostics: [],
    inputs: null, worker_input_sha256: null, worker_runtime_sha256: null, attention: [], proposal_snapshot: null, proposal_snapshot_path: null,
    source_verification: null, facts: null, proposals: null, resolution: null };
  const repo = realpathSync(options.repo), before = canonicalDigest(captureRepositoryState(repo));
  try {
    const scope = artifactDirectoryScope(options.artifact_root, repo), snapshot = captureSnapshot(repo, options.source);
    const bytes = readBoundArtifact({ source_repo: repo, artifact_root: scope.directory, reference: options.decisions }), packet = parseDecisionPacket(bytes, snapshot);
    if (packet.mode === "advisory") {
      if (packet.selected_proposals.length) throw Error("Advisory decision packet contains a resolution selection");
      advisoryDecisionIDs(packet);
    } else if (!packet.selected_proposals.length) throw Error("Resolve decision packet needs selected originals");
    result.attention = projectAttentionProposals(packet.attention, { repository: snapshot.settings.repository,
      scope_sha256: snapshot.protocol.bindings.scope_sha256, inputs_sha256: canonicalDigest(resolutionSource(snapshot)) });
    result.source_verification = readSourceAssessmentArtifacts({ ...options, repo, candidate_repo: repo, reference: options.source_verification });
    const baseline = result.source_verification;
    if (!baseline.evidence || !baseline.scan_artifacts || !baseline.object_store) throw Error("Complete original source assessment required");
    result.facts = await collectPublicationInputs({ ...options, repo, candidate_repo: repo, candidate: options.source, object_store: baseline.object_store,
      selection: { schema_version: 1, source_commit: options.source, edits: [] } });
    if (!result.facts.complete) { result.diagnostics.push(...result.facts.diagnostics); throw Error("Current publication facts incomplete"); }
    const { identity, current_default: currentDefault } = result.facts;
    if (!identity || !currentDefault || !result.facts.runtime) throw Error("Complete native source identity and runtime required");
    result.worker_runtime_sha256 = roleRuntimeDigest(result.facts.runtime, "worker");
    const native = () => readNativeContext({ hostname: snapshot.settings.hostname, repository: snapshot.settings.repository, credential: options.credential, path: options.path });
    const context = native();
    if (context.default_commit !== currentDefault || canonicalDigest(context.identity) !== canonicalDigest(identity)) throw Error("Native source or actor changed before proposal collection");
    result.proposals = collectProposals(context.repository, snapshot.settings);
    if (!result.proposals.complete) { result.diagnostics.push(...result.proposals.diagnostics); throw Error("Complete current proposal inventory required"); }
    let collection: ResolutionCollection | null = null;
    if (packet.mode === "resolve") {
      const originals = await collectPublicationOriginals({ snapshot, store: baseline.object_store, context, selected: packet.selected_proposals,
        current_default: currentDefault, credential: options.credential, path: options.path });
      collection = originals.collection; result.resolution = originals.inputs;
      if (!result.resolution.complete) { result.diagnostics.push(...result.resolution.diagnostics); throw Error("Selected native resolution inputs incomplete"); }
      if (!canonicalJSON(result.resolution.proposals).equals(canonicalJSON(originals.observed))) throw Error("Selected original inputs changed between fetch and collection");
    }
    const proposalBytes = canonicalJSON(projectProposalBindings(result.proposals.proposals, result.resolution?.inputs_sha256 ?? null));
    if (proposalBytes.length > snapshot.settings.reports.max_entry_bytes) throw Error("Proposal snapshot exceeds the configured retained bound");
    result.inputs = deriveWorkerInputs({ snapshot, assessment_sha256: baseline.scan_artifacts.report.sha256, source_verification: baseline.evidence,
      decisions_sha256: sha256(bytes), proposals_sha256: sha256(proposalBytes) });
    if (collection && result.resolution && !recheckResolutionInputs(result.resolution, collection).fresh) throw Error("Selected original inputs changed during final recheck");
    const final = native(), proposals = collectProposals(final.repository, snapshot.settings);
    if (final.default_commit !== currentDefault || canonicalDigest(final.identity) !== canonicalDigest(identity) || !proposals.complete
      || canonicalDigest(proposals.proposals) !== canonicalDigest(result.proposals.proposals)) throw Error("Native source actor or proposals changed during binding collection");
    const settled = native();
    if (settled.default_commit !== currentDefault || canonicalDigest(settled.identity) !== canonicalDigest(identity)) throw Error("Native source or actor changed after final proposal checks");
    result.proposal_snapshot_path = join(scope.directory, "proposal-snapshot-" + randomUUID() + ".json");
    publishArtifact(result.proposal_snapshot_path, proposalBytes);
    result.proposal_snapshot = { path: relative(scope.directory, result.proposal_snapshot_path), sha256: result.inputs.proposals_sha256 };
    result.worker_input_sha256 = workerInputsDigest(result.inputs); result.complete = true;
  } catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Worker input collection unavailable"); }
  if (!matchesRepositoryState(repo, before)) { result.complete = false; result.diagnostics.push("Caller changed or became unavailable during worker input collection"); }
  result.diagnostics = [...new Set(result.diagnostics)];
  return freezeJSON(result);
}
