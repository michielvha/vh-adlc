import { realpathSync } from "node:fs";
import { ArtifactChanged } from "./evidence-input";
import { OUTPUT_LIMIT } from "./owned-process";
import { canonicalDigest, freezeJSON } from "./protocol";
import { collectPublicationOriginals } from "./publication-originals";
import { collectWorkerInputs, type WorkerCollectionOptions } from "./publication-worker";
import { collectPublicationProposals } from "./proposals";
import { PublicationScopeChanged } from "./publish";
import type { ResolutionProposal } from "./resolve-inputs";
import { loadCommittedSettings } from "./settings";
import { captureRepositoryState, captureSnapshot, matchesRepositoryState } from "./snapshot";
import { readNativeContext } from "./transport";

type Result = {
  schema_version: 1; kind: "docs-drift-audit-proposal-inputs"; authority: "none"; source_commit: string;
  complete: boolean; scope_changed: boolean; details_omitted: boolean; diagnostics: string[];
  worker_input_sha256: string | null; inputs_sha256: string | null; object_store: string | null;
  required_proposals: number | null; collected_proposals: number;
  proposals: Array<{ number: number; head_sha: string; base_sha: string; binding_sha256: string | null; files: number | null; hunks: number | null }>;
};
const originalInputs = new WeakMap<object, ResolutionProposal[]>();
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
  let originals: ResolutionProposal[] = [], limit = OUTPUT_LIMIT;
  try {
    limit = Math.min(limit, loadCommittedSettings(repo, options.source).settings.reports.max_entry_bytes);
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
      base_sha: proposal.base_sha, binding_sha256: null, files: null, hunks: null }));
    originals = [];
    for (const [index, number] of selected.entries()) {
      const collected = await collectPublicationOriginals({ snapshot, store, context: initial, selected: [number],
        current_default: currentDefault, credential: options.credential, path: options.path });
      if (!collected.inputs.complete) { result.diagnostics.push(...collected.inputs.diagnostics); throw Error("Required complete audit proposal inputs unavailable"); }
      if (canonicalDigest(collected.observed) !== canonicalDigest(collected.inputs.proposals))
        throw new PublicationScopeChanged("Original audit proposals changed during complete Git collection");
      const next: ResolutionProposal[] = [...originals, ...collected.inputs.proposals];
      if (Buffer.byteLength(JSON.stringify(next)) > limit) throw Error("Complete audit proposal inputs exceed the retained entry bound");
      originals = next; result.collected_proposals = originals.length;
      const proposal = collected.inputs.proposals[0];
      if (!proposal) throw Error("Required complete audit proposal missing");
      result.proposals[index] = { number: proposal.number, head_sha: proposal.head_sha, base_sha: proposal.base_sha,
        binding_sha256: proposal.binding_sha256, files: proposal.files.length, hunks: proposal.hunks.length };
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
    result.inputs_sha256 = canonicalDigest({ source_commit: options.source, worker_input_sha256: current.worker_input_sha256, originals });
    result.complete = true;
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
  if (completed.complete) originalInputs.set(completed, freezeJSON(structuredClone(originals)));
  return completed;
}

/** The original controller can inspect full bytes; serialized metadata supplies no native provenance. */
export function readCollectedAuditProposals(result: Result): ResolutionProposal[] {
  const originals = originalInputs.get(result);
  if (!result.complete || !originals) throw Error("Original native audit proposal inputs required");
  return freezeJSON(structuredClone(originals));
}
