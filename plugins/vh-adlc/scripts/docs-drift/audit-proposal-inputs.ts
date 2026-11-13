import { join } from "node:path";
import { realpathSync } from "node:fs";
import type { PublicationPullInput } from "../github-read";
import { publishArtifact } from "./journal";
import { ArtifactChanged, readBoundArtifact } from "./evidence-input";
import { OUTPUT_LIMIT } from "./owned-process";
import { canonicalDigest, canonicalJSON, sha256, freezeJSON } from "./protocol";
import { collectPublicationOriginals } from "./publication-originals";
import { collectWorkerInputs, type WorkerCollectionOptions } from "./publication-worker";
import { collectPublicationProposals } from "./proposals";
import { PublicationScopeChanged } from "./publish";
import type { ResolutionProposal } from "./resolve-inputs";
import { loadCommittedSettings } from "./settings";
import { artifactDirectoryScope, captureRepositoryState, captureSnapshot, matchesRepositoryState, type OwnedObjectStore } from "./snapshot";
import { readNativeContext, type PublicationIdentity } from "./transport";

type Result = {
  schema_version: 1; kind: "docs-drift-audit-proposal-inputs"; authority: "none"; source_commit: string;
  complete: boolean; scope_changed: boolean; details_omitted: boolean; diagnostics: string[];
  worker_input_sha256: string | null; inputs_sha256: string | null; object_store: string | null;
  required_proposals: number | null; collected_proposals: number;
  proposals: Array<{ number: number; head_sha: string; base_sha: string; binding_sha256: string | null; files: number | null; hunks: number | null; inputs_reference: { path: string; sha256: string } | null }>;
};
const originalInputs = new WeakMap<object, ResolutionProposal[]>();
type OriginalContext = { repo: string; source_commit: string; artifact_root: string; store: OwnedObjectStore;
  identity: PublicationIdentity; current_default: string; proposals: PublicationPullInput[];
  bindings: Array<{ number: number; binding_sha256: string }>; references: Array<{ path: string; sha256: string }>;
  inputs_sha256: string; worker_input_sha256: string };
const originalContexts = new WeakMap<object, OriginalContext>();
export function auditProposalInputsOutput(result: Result) {
  return { schema_version: 1 as const, command: "collect-audit-proposal-inputs", source_commit: result.source_commit,
    outcome: result.complete ? "collected" as const : "incomplete" as const, audit_proposal_inputs: result,
    diagnostics: result.diagnostics.map(message => ({ code: "audit-proposal-inputs", message })) };
}

/** Collect every discovered original from complete native Git objects before asking for semantic support. */
export async function collectAuditProposalInputs(input: WorkerCollectionOptions): Promise<Result> {
  const options = { ...input, path: input.path ?? process.env.PATH, source_verification: structuredClone(input.source_verification), decisions: structuredClone(input.decisions) };
  const repo = realpathSync(options.repo), before = canonicalDigest(captureRepositoryState(repo));
  const result: Result = { schema_version: 1, kind: "docs-drift-audit-proposal-inputs", authority: "none", source_commit: options.source,
    complete: false, scope_changed: false, details_omitted: false, diagnostics: [], worker_input_sha256: null, inputs_sha256: null, object_store: null,
    required_proposals: null, collected_proposals: 0, proposals: [] };
  let originals: ResolutionProposal[] = [], limit = OUTPUT_LIMIT, context: OriginalContext | null = null;
  try {
    limit = Math.min(limit, loadCommittedSettings(repo, options.source).settings.reports.max_entry_bytes);
    const scope = artifactDirectoryScope(options.artifact_root, repo);
    if (options.inventory_context !== undefined) throw Error("Audit proposal inputs must be collected before publication");
    const current = await collectWorkerInputs(options);
    result.scope_changed = current.scope_changed;
    if (!current.complete || !current.inputs || !current.worker_input_sha256 || !current.facts?.store || !current.facts.identity
      || !current.facts.current_default || !current.proposals?.complete) {
      result.diagnostics.push(...current.diagnostics); throw Error("Complete original native audit inputs required");
    }
    const { store, identity, current_default: currentDefault } = current.facts;
    if (!store || !identity || !currentDefault) throw Error("Current native audit source required");
    const snapshot = captureSnapshot(repo, options.source), settings = snapshot.settings;
    const native = () => readNativeContext({ hostname: settings.hostname, repository: settings.repository, credential: options.credential, path: options.path });
    const initial = native();
    if (initial.default_commit !== currentDefault || canonicalDigest(initial.identity) !== canonicalDigest(identity))
      throw new PublicationScopeChanged("Native audit proposal source or actor changed before collection");
    const selected = current.proposals.proposals.map(proposal => proposal.number);
    result.required_proposals = selected.length; result.worker_input_sha256 = current.worker_input_sha256; result.object_store = store.root;
    result.proposals = current.proposals.proposals.map(proposal => ({ number: proposal.number, head_sha: proposal.head_sha,
      base_sha: proposal.base_sha, binding_sha256: null, files: null, hunks: null, inputs_reference: null }));
    originals = [];
    let retainedBytes = 2;
    for (const [index, number] of selected.entries()) {
      try {
        const collected = await collectPublicationOriginals({ snapshot, store, context: initial, selected: [number],
          current_default: currentDefault, credential: options.credential, path: options.path });
        if (!collected.inputs.complete) {
          result.diagnostics.push(...collected.inputs.diagnostics); throw Error("Required complete audit proposal inputs unavailable");
        }
        if (canonicalDigest(collected.observed) !== canonicalDigest(collected.inputs.proposals))
          throw new PublicationScopeChanged("Original audit proposals changed during complete Git collection");
        const proposal = collected.inputs.proposals[0];
        if (!proposal || collected.inputs.proposals.length !== 1 || proposal.number !== number) throw Error("Required complete audit proposal missing");
        const bytes = canonicalJSON(proposal), size = bytes.length;
        if (size > limit) throw Error("Complete audit proposal inputs exceed the retained entry bound");
        // Keep processing memory bounded while still inspecting later, smaller proposals after a failed entry.
        if (retainedBytes + size + 1 > 64 * 1024 * 1024) throw Error("Complete audit proposal inputs exceed the aggregate processing bound");
        const digest = sha256(bytes), reference = { path: "audit-proposal-input-" + digest + ".json", sha256: digest };
        const read = () => readBoundArtifact({ source_repo: repo, artifact_root: scope.directory, reference });
        try { publishArtifact(join(scope.directory, reference.path), bytes); }
        catch (error) { if (!read().equals(bytes)) throw error; }
        read();
        retainedBytes += size + 1; originals.push(proposal); result.collected_proposals = originals.length;
        result.proposals[index] = { number: proposal.number, head_sha: proposal.head_sha, base_sha: proposal.base_sha,
          binding_sha256: proposal.binding_sha256, files: proposal.files.length, hunks: proposal.hunks.length, inputs_reference: reference };
      } catch (error) {
        if (error instanceof ArtifactChanged || error instanceof PublicationScopeChanged) throw error;
        result.diagnostics.push("Proposal " + number + ": " + (error instanceof Error ? error.message : "Full native inputs unavailable"));
      }
    }
    const final = native(), inventory = collectPublicationProposals(final.repository, settings);
    if (inventory.scope_changed) throw new PublicationScopeChanged("Native audit proposal changed during final collection");
    if (!inventory.complete) { result.diagnostics.push(...inventory.diagnostics); throw Error("Final native audit inventory incomplete"); }
    if (final.default_commit !== currentDefault || canonicalDigest(final.identity) !== canonicalDigest(identity)
      || canonicalDigest(inventory.proposals) !== canonicalDigest(current.proposals.proposals))
      throw new PublicationScopeChanged("Native audit source, actor or original proposal inventory changed during collection");
    const settled = native();
    if (settled.default_commit !== currentDefault || canonicalDigest(settled.identity) !== canonicalDigest(identity))
      throw new PublicationScopeChanged("Native audit source or actor changed after proposal collection");
    result.complete = result.diagnostics.length === 0 && originals.length === selected.length;
    if (result.complete) {
      result.inputs_sha256 = canonicalDigest({ source_commit: options.source, worker_input_sha256: current.worker_input_sha256, originals });
      context = { repo, source_commit: options.source, artifact_root: scope.directory, store: { ...store },
        identity: { repository: identity.repository, repository_id: identity.repository_id, actor: identity.actor, actor_id: identity.actor_id, default_branch: identity.default_branch },
        current_default: currentDefault, proposals: structuredClone(current.proposals.proposals),
        bindings: originals.map(proposal => ({ number: proposal.number, binding_sha256: proposal.binding_sha256 })),
        references: result.proposals.flatMap(proposal => proposal.inputs_reference ? [{ ...proposal.inputs_reference }] : []),
        inputs_sha256: result.inputs_sha256, worker_input_sha256: current.worker_input_sha256 };
    }
  } catch (error) {
    result.scope_changed ||= error instanceof ArtifactChanged || error instanceof PublicationScopeChanged;
    result.diagnostics.push(error instanceof Error ? error.message : "Native audit proposal inputs unavailable");
  }
  if (!matchesRepositoryState(repo, before)) { result.complete = false; result.diagnostics.push("Caller changed or became unavailable during audit proposal collection"); }
  result.diagnostics = [...new Set(result.diagnostics)];
  if (Buffer.byteLength(JSON.stringify(auditProposalInputsOutput(result)) + "\n") > limit) {
    result.complete = false; result.details_omitted = true; result.proposals = [];
    result.diagnostics = ["Audit proposal inputs exceed the retained entry bound; inspect the original owned Git objects"];
    if (Buffer.byteLength(JSON.stringify(auditProposalInputsOutput(result)) + "\n") > limit) throw Error("Configured output bound cannot retain an incomplete audit proposal summary");
  }
  const completed = freezeJSON(result);
  if (completed.complete) {
    originalInputs.set(completed, freezeJSON(structuredClone(originals)));
    if (context) originalContexts.set(completed, freezeJSON(context));
  }
  return completed;
}

/** The original controller can inspect full bytes; serialized metadata supplies no native provenance. */
export function readCollectedAuditProposals(result: Result): ResolutionProposal[] {
  const originals = originalInputs.get(result);
  if (!result.complete || !originals) throw Error("Original native audit proposal inputs required");
  return freezeJSON(structuredClone(originals));
}

/** Original native collection context only; serialized completeness flags create no eligibility. */
export function readCollectedAuditProposalContext(result: unknown): OriginalContext {
  const context = result !== null && typeof result === "object" ? originalContexts.get(result) : undefined;
  if (!context) throw Error("Original native audit proposal context required");
  return freezeJSON(structuredClone(context));
}
