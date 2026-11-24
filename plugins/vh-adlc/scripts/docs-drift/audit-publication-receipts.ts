import { isPublisherLogin } from "./identity";
import { realpathSync } from "node:fs";
import { GitHubReadError } from "../github-read";
import { readCollectedAuditProposalContext, type collectAuditProposalInputs } from "./audit-proposal-inputs";
import { ArtifactChanged, readBoundArtifact } from "./evidence-input";
import { OUTPUT_LIMIT } from "./owned-process";
import { canonicalDigest, freezeJSON } from "./protocol";
import { collectPublicationProposals } from "./proposals";
import { PublicationScopeChanged } from "./publish";
import { HistoryEligibilityError, PublicationEvidenceChanged, readReviewedProposal } from "./report-history";
import { createAdoptedPublicationVerifier, RetainedPublicationIneligible } from "./reviewed-publication";
import { loadCommittedSettings } from "./settings";
import { artifactDirectoryScope, captureCallerState, matchesCallerState } from "./snapshot";
import { readNativeContext, type NativeObservation } from "./transport";

type NativeReceipt = Awaited<ReturnType<typeof readReviewedProposal>>;
type Entry = { number: number; binding_sha256: string; eligibility: "reviewed" | "unreviewed" | "unavailable";
  reviewed: NativeReceipt["reviewed"] | null; receipt: NativeReceipt["receipt"] | null; diagnostics: string[] };
type Result = { schema_version: 1; kind: "docs-drift-audit-publication-receipts"; authority: "none"; source_commit: string;
  complete: boolean; scope_changed: boolean; details_omitted: boolean; diagnostics: string[];
  inputs_sha256: string | null; required_proposals: number | null; reviewed_proposals: number; proposals: Entry[] };
const originalReceipts = new WeakMap<object, Entry[]>();

/** Recollect historical publication eligibility. This is not a current candidate check or carried-delivery verdict. */
export async function collectAuditPublicationReceipts(input: { repo: string; source: string; artifact_root: string;
  credential: string; path?: string; observation?: NativeObservation; proposals: Awaited<ReturnType<typeof collectAuditProposalInputs>> }): Promise<Result> {
  const options = { ...input }, result: Result = { schema_version: 1, kind: "docs-drift-audit-publication-receipts", authority: "none",
    source_commit: input.source, complete: false, scope_changed: false, details_omitted: false, diagnostics: [],
    inputs_sha256: null, required_proposals: null, reviewed_proposals: 0, proposals: [] };
  let repo: string | null = null, before: string | null = null, limit = OUTPUT_LIMIT;
  try {
    const context = readCollectedAuditProposalContext(options.proposals);
    repo = realpathSync(options.repo); const sourceRepo = repo; before = canonicalDigest(captureCallerState(repo));
    const scope = artifactDirectoryScope(options.artifact_root, repo), settings = loadCommittedSettings(repo, options.source).settings;
    limit = Math.min(limit, settings.reports.max_entry_bytes);
    if (context.repo !== repo || context.source_commit !== options.source || context.artifact_root !== scope.directory)
      throw new ArtifactChanged("Original audit publication scope changed");
    const recheckReferences = () => {
      if (context.references.length !== context.proposals.length) throw Error("Complete original audit publication references required");
      for (const reference of context.references) readBoundArtifact({ source_repo: sourceRepo, artifact_root: scope.directory, reference });
    };
    recheckReferences();
    result.inputs_sha256 = context.inputs_sha256; result.required_proposals = context.proposals.length;
    const native = () => readNativeContext({ hostname: settings.hostname, repository: settings.repository, credential: options.credential, path: options.path, observation: options.observation });
    const requireContext = (current: ReturnType<typeof native>) => {
      if (current.default_commit !== context.current_default || canonicalDigest(current.identity) !== canonicalDigest(context.identity))
        throw new PublicationScopeChanged("Original audit publication source or actor changed");
    };
    const requireInventory = (current: ReturnType<typeof native>) => {
      requireContext(current);
      const inventory = collectPublicationProposals(current.repository, settings);
      if (inventory.scope_changed) throw new PublicationScopeChanged("Original audit publication inventory changed during collection");
      if (!inventory.complete) throw Error("Complete current audit publication inventory required");
      if (canonicalDigest(inventory.proposals) !== canonicalDigest(context.proposals))
        throw new PublicationScopeChanged("Original audit publication inventory changed");
    };
    const initial = native(); requireInventory(initial);
    const bindings = new Map(context.bindings.map(row => [row.number, row.binding_sha256]));
    const receiptPrefix = "repos/" + settings.repository + "/git/ref/" + settings.publication.receipt_ref_prefix.slice(5).split("/").map(encodeURIComponent).join("/");
    let unavailable = false;
    for (const proposal of context.proposals) {
      const binding = bindings.get(proposal.number); if (!binding) throw Error("Complete original audit publication binding required");
      const entry: Entry = { number: proposal.number, binding_sha256: binding, eligibility: "unreviewed", reviewed: null, receipt: null, diagnostics: [] };
      result.proposals.push(entry);
      if (!isPublisherLogin(settings, proposal.actor) || proposal.state !== "open" || proposal.merged_at !== null) {
        entry.diagnostics.push("Legacy or terminal proposal has no current shared reviewed delivery; verify its source and result separately"); continue;
      }
      try {
        const { title: _title, labels: _labels, ...core } = proposal;
        const observed = await readReviewedProposal({ reader: initial.repository, settings, proposal: core,
          verifyPlan: (bytes, observedNative) => createAdoptedPublicationVerifier({ store: context.store, current_default: context.current_default,
            identity: context.identity, entry: context.entry, proposal: core })(bytes, observedNative) });
        entry.reviewed = observed.reviewed; entry.receipt = observed.receipt; entry.eligibility = "reviewed"; result.reviewed_proposals++;
      } catch (error) {
        if (error instanceof PublicationEvidenceChanged) throw new PublicationScopeChanged("Native reviewed publication changed during audit collection");
        const last = initial.repository.trace().at(-1);
        if (error instanceof HistoryEligibilityError || error instanceof RetainedPublicationIneligible || error instanceof SyntaxError) {
          entry.diagnostics.push(error instanceof SyntaxError ? "Malformed prior receipt has no reviewed delivery eligibility" : error.message);
        } else if (error instanceof GitHubReadError && error.status === 404 && last?.endpoint.startsWith(receiptPrefix)) {
          // Current default/ref reads already establish repository contents access; only this optional receipt ref is absent.
          entry.diagnostics.push("Retained reviewed-publication ref unavailable; no reviewed delivery is carried");
        } else {
          unavailable = true; entry.eligibility = "unavailable"; entry.diagnostics.push("Required native publication inputs unavailable");
          result.diagnostics.push("Proposal " + proposal.number + ": required native publication inputs unavailable");
        }
      }
    }
    const final = native(); requireInventory(final);
    for (const entry of result.proposals) if (entry.receipt) {
      try {
        if (final.repository.ref(entry.receipt.ref).sha !== entry.receipt.object)
          throw new PublicationScopeChanged("Native reviewed-publication ref changed after audit collection");
      } catch (error) {
        if (error instanceof GitHubReadError && error.status === 404)
          throw new PublicationScopeChanged("Native reviewed-publication ref disappeared after audit collection");
        throw error;
      }
    }
    requireContext(native()); recheckReferences();
    if (unavailable) throw Error("Required native audit receipt collection incomplete");
    result.complete = true;
  } catch (error) {
    result.scope_changed ||= error instanceof ArtifactChanged || error instanceof PublicationScopeChanged;
    result.diagnostics.push(error instanceof Error ? error.message : "Native audit receipt collection unavailable");
  }
  if (repo !== null && before !== null && !matchesCallerState(repo, before)) {
    result.complete = false; result.scope_changed = true; result.diagnostics.push("Caller changed during audit receipt collection");
  }
  if (!result.complete) {
    result.reviewed_proposals = 0;
    for (const entry of result.proposals) if (entry.eligibility === "reviewed") { entry.eligibility = "unavailable"; entry.reviewed = null; entry.receipt = null; }
  }
  if (Buffer.byteLength(JSON.stringify(result) + "\n") > limit) {
    result.complete = false; result.details_omitted = true; result.reviewed_proposals = 0; result.proposals = [];
    result.diagnostics = ["Audit publication receipt details exceed the retained entry bound; inspect the original native inputs"];
    if (Buffer.byteLength(JSON.stringify(result) + "\n") > limit) throw Error("Configured output bound cannot retain an incomplete audit receipt summary");
  }
  const completed = freezeJSON(result);
  if (completed.complete) originalReceipts.set(completed, freezeJSON(structuredClone(result.proposals)));
  return completed;
}

/** Original collector result only; serialized rows cannot establish native receipt eligibility. */
export function readCollectedAuditPublicationReceipts(result: unknown): Entry[] {
  const rows = result !== null && typeof result === "object" ? originalReceipts.get(result) : undefined;
  if (!rows) throw Error("Original native audit publication receipts required");
  return freezeJSON(structuredClone(rows));
}
