import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { readBoundArtifact } from "./evidence-input";
import { readGit } from "./git";
import { workerInputDigest, type Bindings } from "./manifests";
import { publishArtifact } from "./journal";
import { readCandidatePatch } from "./preparation";
import { deriveWorkerInputs } from "./publication-worker";
import { collectPublicationInputs } from "./publication-inputs";
import { collectProposals, fetchProposalObjects, projectProposalBindings } from "./proposals";
import { canonicalDigest, canonicalJSON, decodeUTF8, freezeJSON, protocolPath, sha256 } from "./protocol";
import { deliveryDigest, attentionProjection, type AttentionInput, type AttentionProjection, type CorrectionInput } from "./report";
import { parseEdit, readResolutionRecord, resolutionSource } from "./resolve";
import { collectResolutionInputs, readResolutionProposal, recheckResolutionInputs, type ResolutionCollection, type ResolutionInputs } from "./resolve-inputs";
import { artifactDirectoryScope, captureRepositoryState, captureSnapshot, matchesRepositoryState } from "./snapshot";
import { readNativeContext } from "./transport";
import { readCandidateVerificationArtifacts } from "./verification-evidence";

type Options = Omit<Parameters<typeof collectPublicationInputs>[0], "object_store"> & {
  source_verification: unknown; candidate_verification: unknown; decisions: unknown;
};
type Result = {
  schema_version: 1; kind: "docs-drift-publication-bindings"; authority: "none"; complete: boolean; diagnostics: string[];
  proposal_snapshot: { path: string; sha256: string } | null; proposal_snapshot_path: string | null; worker_input_sha256: string | null;
  candidate_verification_sha256: string | null;
  mode: "advisory" | "resolve" | null; bindings: Bindings | null; corrections: CorrectionInput[]; attention: AttentionProjection[];
  source_verification: ReturnType<typeof readCandidateVerificationArtifacts> | null;
  candidate_verification: ReturnType<typeof readCandidateVerificationArtifacts> | null;
  facts: Awaited<ReturnType<typeof collectPublicationInputs>> | null; proposals: ReturnType<typeof collectProposals> | null;
  resolution: ResolutionInputs | null;
};

function exactRecord(value: unknown, fields: string[], reason: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error(reason);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== fields.length || fields.some(field => !Object.hasOwn(input, field))) throw Error(reason);
  return input;
}

/** Assemble the actual immutable review inputs. Native role verification and effect authority follow separately. */
export async function collectPublicationBindings(input: Options): Promise<Result> {
  const options = { ...input, selection: structuredClone(input.selection), resolution_record: structuredClone(input.resolution_record),
    source_verification: structuredClone(input.source_verification), candidate_verification: structuredClone(input.candidate_verification),
    decisions: structuredClone(input.decisions), path: input.path ?? process.env.PATH };
  const result: Result = { schema_version: 1, kind: "docs-drift-publication-bindings", authority: "none", complete: false, diagnostics: [], mode: null, candidate_verification_sha256: null,
    proposal_snapshot: null, proposal_snapshot_path: null, worker_input_sha256: null, bindings: null, corrections: [], attention: [], source_verification: null, candidate_verification: null, facts: null, proposals: null, resolution: null };
  const repo = realpathSync(options.repo), candidateRepo = realpathSync(options.candidate_repo);
  const before = canonicalDigest(captureRepositoryState(repo)), candidateBefore = canonicalDigest(captureRepositoryState(candidateRepo));
  try {
    const secondary = artifactDirectoryScope(options.artifact_root, candidateRepo), snapshot = captureSnapshot(repo, options.source);
    const reference = options.decisions as { path?: unknown } | null;
    secondary.assertExternal(join(secondary.directory, protocolPath(reference?.path)));
    const bytes = readBoundArtifact({ source_repo: repo, artifact_root: secondary.directory, reference: options.decisions });
    if (bytes.length > snapshot.settings.reports.max_entry_bytes) throw Error("Canonical bounded decision packet required");
    const parsed: unknown = JSON.parse(decodeUTF8(bytes));
    if (!canonicalJSON(parsed).equals(bytes)
      || parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("Canonical bounded decision packet required");
    const packet = parsed as Record<string, unknown>, fields = ["schema_version", "kind", "mode", "source_commit", "selected_proposals", "decisions", "attention"];
    if (Object.keys(packet).length !== fields.length || fields.some(field => !Object.hasOwn(packet, field)) || packet.schema_version !== 1
      || packet.kind !== "docs-drift-decisions" || !["advisory", "resolve"].includes(String(packet.mode)) || packet.source_commit !== options.source
      || !Array.isArray(packet.decisions) || !Array.isArray(packet.attention) || !Array.isArray(packet.selected_proposals)
      || packet.selected_proposals.length > 1000 || packet.selected_proposals.some(id => typeof id !== "number" || !Number.isSafeInteger(id) || id < 1)
      || new Set(packet.selected_proposals).size !== packet.selected_proposals.length) throw Error("Decision packet fields or source changed");
    const selected = packet.selected_proposals as number[];
    result.mode = packet.mode as "advisory" | "resolve";
    if (result.mode === "advisory" && (selected.length > 0 || options.resolution_record)) throw Error("Advisory decision packet contains a resolution selection");
    if (result.mode === "resolve" && (selected.length === 0 || !options.resolution_record)) throw Error("Resolve decision packet needs selected originals and its exact record");
    if (result.mode === "advisory") {
      const reason = "Advisory decisions do not account for selected edits";
      const selection = exactRecord(options.selection, ["schema_version", "source_commit", "edits"], reason);
      if (selection.schema_version !== 1 || selection.source_commit !== options.source || !Array.isArray(selection.edits)) throw Error(reason);
      const ids = selection.edits.map(edit => parseEdit(edit).id), expected = new Set(ids);
      const decisions = packet.decisions.map(value => exactRecord(value, ["id", "reason"], reason));
      if (expected.size !== ids.length || decisions.length !== expected.size || new Set(decisions.map(item => item.id)).size !== decisions.length
        || decisions.some(item => typeof item.id !== "string" || !expected.has(item.id) || typeof item.reason !== "string" || !item.reason.trim())) throw Error(reason);
    }
    const common = { repo, source: options.source, artifact_root: secondary.directory, owner: options.owner, run: options.run };
    result.source_verification = readCandidateVerificationArtifacts({ ...common, candidate_repo: candidateRepo, candidate: options.source,
      selection: { schema_version: 1, source_commit: options.source, edits: [] }, reference: options.source_verification });
    result.candidate_verification = readCandidateVerificationArtifacts({ ...common, candidate_repo: candidateRepo, candidate: options.candidate,
      selection: options.selection, resolution_record: options.resolution_record, reference: options.candidate_verification });
    const verified = result.candidate_verification, baseline = result.source_verification;
    result.facts = await collectPublicationInputs({ ...common, candidate_repo: candidateRepo, candidate: options.candidate, selection: options.selection,
      resolution_record: options.resolution_record, object_store: verified.inspection?.object_store ?? undefined, credential: options.credential, path: options.path,
      cache_directory: options.cache_directory, entry: options.entry, launcher_path: options.launcher_path, settings_path: options.settings_path });
    if (!result.facts.complete) { result.diagnostics.push(...result.facts.diagnostics); throw Error("Current publication facts incomplete"); }
    const { identity, current_default: currentDefault, store, candidate } = result.facts;
    if (!identity || !currentDefault || !store || !candidate?.candidate_tree || !candidate.diff_sha256 || !baseline.scan_artifacts || !verified.scan)
      throw Error("Complete native candidate and original verification required");
    const native = () => readNativeContext({ hostname: snapshot.settings.hostname, repository: snapshot.settings.repository, credential: options.credential, path: options.path });
    const context = native();
    if (context.default_commit !== currentDefault || canonicalDigest(context.identity) !== canonicalDigest(identity)) throw Error("Native source or actor changed before proposal collection");
    result.proposals = collectProposals(context.repository, snapshot.settings);
    if (!result.proposals.complete) { result.diagnostics.push(...result.proposals.diagnostics); throw Error("Complete current proposal inventory required"); }
    let resolutionCollection: ResolutionCollection | null = null;
    if (result.mode === "resolve") {
      const sourceStore = baseline.inspection?.object_store;
      if (!sourceStore || !options.resolution_record) throw Error("Original assessed objects and resolve record required");
      const environment = { PATH: options.path, ...(snapshot.settings.hostname === "github.com" || snapshot.settings.hostname.endsWith(".ghe.com")
        ? { GH_TOKEN: options.credential } : { GH_ENTERPRISE_TOKEN: options.credential }) };
      const observed: ReturnType<typeof readResolutionProposal>[] = [];
      for (const id of selected) {
        const proposal = context.repository.pull(id);
        const fetched = await fetchProposalObjects(sourceStore, proposal, { hostname: snapshot.settings.hostname, repository: snapshot.settings.repository,
          default_branch: snapshot.settings.default_branch, expected_default_commit: currentDefault, environment });
        if (!fetched.complete) throw Error("Selected complete original diff unavailable");
        observed.push(readResolutionProposal(sourceStore, proposal));
      }
      resolutionCollection = { snapshot, store: sourceStore, reader: context.repository, selected };
      result.resolution = collectResolutionInputs(resolutionCollection);
      if (!result.resolution.complete) { result.diagnostics.push(...result.resolution.diagnostics); throw Error("Selected native resolution inputs incomplete"); }
      if (!canonicalJSON(result.resolution.proposals).equals(canonicalJSON(observed))) throw Error("Selected original inputs changed during binding collection");
      const record = readResolutionRecord(readGit(candidateRepo, "show", options.candidate + ":" + protocolPath(options.resolution_record.path)), snapshot.settings);
      const originalBindings = result.resolution.proposals.map(proposal => ({ ...proposal,
        hunks: proposal.hunks.map(({ before_base64: _before, after_base64: _after, ...hunk }) => hunk) }));
      if (!canonicalJSON(record.originals).equals(canonicalJSON(originalBindings)) || !canonicalJSON(record.dispositions).equals(canonicalJSON(packet.decisions)))
        throw Error("Resolve record decisions or complete original bindings changed");
    }
    const sourceBinding = resolutionSource(snapshot), sourceInputs = canonicalDigest(sourceBinding), candidateSnapshot = captureSnapshot(candidateRepo, options.candidate);
    const verificationBinding = canonicalDigest({ commands: snapshot.settings.verification_commands, documents: candidateSnapshot.protocol.bindings.documents,
      detectors: verified.scan.detectors.map(({ input_sha256: _input, ...detector }) => detector), findings: verified.scan.findings,
      suppressed_findings: verified.scan.suppressed_findings, stale_suppressions: verified.scan.stale_suppressions });
    const postimages = new Map(candidateSnapshot.blobs.map(blob => [blob.path, blob]));
    result.corrections = candidate.changed_paths.filter(path => path !== options.resolution_record?.path).map(path => ({
      repository: snapshot.settings.repository, scope_sha256: snapshot.protocol.bindings.scope_sha256, identity: "correction-" + canonicalDigest({ path }), path,
      patch_sha256: sha256(readCandidatePatch(store, snapshot.settings.repository, options.source, options.candidate, [path])),
      postimage_sha256: postimages.has(path) ? sha256(postimages.get(path)!.bytes) : canonicalDigest({ path, absent: true }),
      verification_sha256: verificationBinding, inputs_sha256: sourceInputs,
    }));
    result.attention = packet.attention.map(value => {
      const reason = "Invalid or duplicate attention proposal";
      const item = exactRecord(value, ["identity", "disposition", "reason", "owner_action", "rule", "title", "links"], reason);
      if ([item.identity, item.reason, item.owner_action, item.title].some(value => typeof value !== "string" || !value.trim())
        || !Array.isArray(item.links) || item.links.some(link => typeof link !== "string" || !link.trim())) throw Error(reason);
      try {
        return attentionProjection({ ...item as Omit<AttentionInput, "repository" | "scope_sha256" | "inputs" | "required_inputs">,
          repository: snapshot.settings.repository, scope_sha256: snapshot.protocol.bindings.scope_sha256, inputs: { source: sourceInputs }, required_inputs: ["source"] });
      } catch { throw Error(reason); }
    });
    if (new Set(result.attention.map(item => item.sha256)).size !== result.attention.length) throw Error("Invalid or duplicate attention proposal");
    const proposalBytes = canonicalJSON(projectProposalBindings(result.proposals.proposals, result.resolution?.inputs_sha256 ?? null));
    if (proposalBytes.length > snapshot.settings.reports.max_entry_bytes) throw Error("Proposal snapshot exceeds the configured retained bound");
    if (!baseline.evidence || !verified.evidence) throw Error("Original source and candidate evidence references required");
    result.candidate_verification_sha256 = verified.evidence.sha256;
    result.bindings = { ...deriveWorkerInputs({ snapshot, assessment_sha256: baseline.scan_artifacts.report.sha256,
      source_verification: baseline.evidence, decisions_sha256: sha256(bytes), proposals_sha256: sha256(proposalBytes) }),
      candidate_commit: options.candidate, candidate_tree: candidate.candidate_tree, diff_sha256: candidate.diff_sha256,
      delivery_sha256: deliveryDigest(result.corrections, result.attention, result.candidate_verification_sha256) };
    if (resolutionCollection && result.resolution && !recheckResolutionInputs(result.resolution, resolutionCollection).fresh)
      throw Error("Selected original inputs changed during binding collection");
    const final = native(), proposals = collectProposals(final.repository, snapshot.settings);
    if (final.default_commit !== currentDefault || canonicalDigest(final.identity) !== canonicalDigest(identity) || !proposals.complete
      || canonicalDigest(proposals.proposals) !== canonicalDigest(result.proposals.proposals)) throw Error("Native source actor or proposals changed during binding collection");
    const settled = native();
    if (settled.default_commit !== currentDefault || canonicalDigest(settled.identity) !== canonicalDigest(identity))
      throw Error("Native source or actor changed after final proposal checks");
    result.proposal_snapshot_path = join(secondary.directory, "proposal-snapshot-" + randomUUID() + ".json");
    publishArtifact(result.proposal_snapshot_path, proposalBytes);
    result.proposal_snapshot = { path: relative(secondary.directory, result.proposal_snapshot_path), sha256: result.bindings.proposals_sha256 };
    result.worker_input_sha256 = workerInputDigest(result.bindings);
    result.complete = true;
  } catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Publication binding collection unavailable"); }
  if (!matchesRepositoryState(repo, before) || !matchesRepositoryState(candidateRepo, candidateBefore)) {
    result.complete = false; result.diagnostics.push("Caller changed or became unavailable during publication binding collection");
  }
  result.diagnostics = [...new Set(result.diagnostics)];
  return freezeJSON(result);
}
