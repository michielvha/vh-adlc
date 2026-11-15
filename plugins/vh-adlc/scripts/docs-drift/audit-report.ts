import { realpathSync } from "node:fs";
import { collectAuditProposalInputs, readCollectedAuditProposals } from "./audit-proposal-inputs";
import { collectAuditPublicationReceipts, readCollectedAuditPublicationReceipts } from "./audit-publication-receipts";
import { auditProposalReportInputs, deliveredAuditEditPaths } from "./audit-proposal-report";
import { invalidateCurrentProposalVerification, recheckCurrentProposalVerification, verifyCurrentProposals, type CurrentProposalVerification } from "./current-proposal-verification";
import { collectAssessmentReview } from "./assessment-review";
import { collectNativeReportHistory, createCollectedActionsEnvelope, readCollectedLocalHistoryContext, readCollectedReportHistory } from "./history-collection";
import { workerInputsDigest } from "./manifests";
import { ArtifactChanged, readBoundArtifact } from "./evidence-input";
import { parseDecisionPacket, projectAttentionProposals } from "./publication-decisions";
import { OUTPUT_LIMIT } from "./owned-process";
import { PublicationScopeChanged } from "./publish";
import { canonicalDigest, canonicalJSON, freezeJSON } from "./protocol";
import { buildReport, renderReport, escapeReportText, joinReportSentences, type AttentionInput, type Report, type CorrectionInput, type Proposal } from "./report";
import { renderProposalAssessment, type ProposalAssessment } from "./proposal-assessment";
import { renderAssessmentReport, type AssessmentReport } from "./assessment-report";
import { resolutionSource } from "./resolve";
import { captureRepositoryState, captureSnapshot, matchesRepositoryState } from "./snapshot";

type Options = Parameters<typeof collectNativeReportHistory>[0];
type Reference = { path: string; sha256: string };
type Start = {
  schema_version: 1; kind: "docs-drift-audit-report-run"; authority: "none"; source_commit: string;
  run_id: string; started_at: string | null; complete: boolean; scope_changed: boolean; diagnostics: string[];
  worker_input_sha256: string | null; proposal_inputs_sha256: string | null;
};
type Counts = {
  proposed_edits: number | null; required_proposals: number | null; collected_proposals: number | null;
  assessed_proposals: number | null; unassessed_proposals: number | null; verified_proposals: number | null; unverified_proposals: number | null;
  eligible_publications: number | null; findings: AssessmentReport["counts"] | null; review_nits: number | null;
};
type Result = {
  schema_version: 1; kind: "docs-drift-audit-report"; authority: "none"; source_commit: string;
  complete: boolean; scope_changed: boolean; details_omitted: boolean; diagnostics: string[];
  counts: Counts; proposal_verification: CurrentProposalVerification | null; publication_receipts: Awaited<ReturnType<typeof collectAuditPublicationReceipts>> | null; report: Report | null; markdown: string | null;
};
type Context = {
  options: Options; before: string; limit: number;
  history: Awaited<ReturnType<typeof collectNativeReportHistory>>;
  proposals: Awaited<ReturnType<typeof collectAuditProposalInputs>>;
};
const runs = new WeakMap<object, Context>(), reports = new WeakMap<object, Report>();
const reportHistories = new WeakMap<object, Context["history"]>();
const completing = new WeakSet<object>(), consumed = new WeakSet<object>();
class AuditReportFailure extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/** A fully assessed mixture needs resolution; missing or wholly unknown support stays unknown. */
export function proposalAttentionDisposition(assessment: ProposalAssessment["proposals"][number]["assessment"]): AttentionInput["disposition"] {
  return assessment === "unverifiable" ? "unknown" : "needs-resolution";
}

/** The execution controller calls this before its model roles. JSON metadata cannot recreate the run. */
export async function beginAuditReport(input: Options): Promise<Start> {
  const { observation, ...serializable } = input, options = { ...structuredClone(serializable), observation };
  const repo = realpathSync(options.repo), before = canonicalDigest(captureRepositoryState(repo));
  const result: Start = { schema_version: 1, kind: "docs-drift-audit-report-run", authority: "none", source_commit: options.source,
    run_id: options.run, started_at: null, complete: false, scope_changed: false, diagnostics: [], worker_input_sha256: null, proposal_inputs_sha256: null };
  let context: Context | null = null;
  try {
    if (options.inventory_context !== undefined) throw Error("Audit report must start before publication");
    const snapshot = captureSnapshot(repo, options.source), history = await collectNativeReportHistory(options);
    result.started_at = history.context?.started_at ?? null; result.scope_changed ||= history.scope_changed;
    if (!history.complete || !history.context || !history.worker_input_sha256) {
      result.diagnostics.push(...history.diagnostics); throw Error("Complete original starting history required");
    }
    const proposals = await collectAuditProposalInputs(options);
    result.scope_changed ||= proposals.scope_changed;
    if (proposals.complete && proposals.worker_input_sha256 !== history.worker_input_sha256) throw new PublicationScopeChanged("Original audit inputs changed while starting the report");
    if (!proposals.complete || !proposals.inputs_sha256) {
      result.diagnostics.push(...proposals.diagnostics); throw Error("Complete unchanged original audit proposal inputs required");
    }
    readCollectedReportHistory(history); readCollectedAuditProposals(proposals);
    result.worker_input_sha256 = history.worker_input_sha256; result.proposal_inputs_sha256 = proposals.inputs_sha256;
    result.complete = true;
    context = { options, before, limit: Math.min(OUTPUT_LIMIT, snapshot.settings.reports.max_entry_bytes), history, proposals };
  } catch (error) { result.scope_changed ||= error instanceof ArtifactChanged || error instanceof PublicationScopeChanged;
    result.diagnostics.push(error instanceof Error ? error.message : "Original audit report start unavailable"); }
  if (!matchesRepositoryState(repo, before)) { result.complete = false; result.diagnostics.push("Caller changed during audit report start"); }
  const completed = freezeJSON(result);
  if (completed.complete && context) runs.set(completed, context);
  return completed;
}

/** Report-only completion. Candidate/effect delivery and existing-PR semantic support have separate gates. */
export async function completeAuditReport(start: Start, roles: { worker_capture: Reference; reviewer_capture: Reference }): Promise<Result> {
  const original = runs.get(start);
  if (!original || !start.complete || !original.history.context) throw Error("Original complete audit report run required");
  if (consumed.has(start)) throw Error("Audit report run already completed");
  if (completing.has(start)) throw Error("Audit report run is already completing");
  completing.add(start);
  try { return await assembleAuditReport(start, original, roles); }
  finally { completing.delete(start); }
}

async function assembleAuditReport(start: Start, original: Context, roles: { worker_capture: Reference; reviewer_capture: Reference }): Promise<Result> {
  const options = original.options, repo = realpathSync(options.repo), snapshot = captureSnapshot(repo, options.source), historyContext = original.history.context;
  if (!historyContext) throw Error("Original complete audit report run required");
  const result: Result = { schema_version: 1, kind: "docs-drift-audit-report", authority: "none", source_commit: options.source,
    complete: false, scope_changed: false, details_omitted: false, diagnostics: [], proposal_verification: null, publication_receipts: null, report: null, markdown: null,
    counts: { proposed_edits: null, required_proposals: original.proposals.required_proposals, collected_proposals: original.proposals.collected_proposals,
      assessed_proposals: null, unassessed_proposals: original.proposals.required_proposals, verified_proposals: null, unverified_proposals: null,
      eligible_publications: null, findings: null, review_nits: null } };
  const attention: AttentionInput[] = [], failures: Report["failures"] = [], history = readCollectedReportHistory(original.history);
  const addFailure = (code: string, message: string) => {
    result.diagnostics.push(message);
    if (!failures.some(failure => failure.code === code && failure.message === message)) failures.push({ code, message });
  };
  let delivery: { corrections: CorrectionInput[]; proposals: Proposal[] } = { corrections: [], proposals: [] };
  let proposalInputs: Parameters<typeof auditProposalReportInputs>[0] | null = null;
  let editAttention: AttentionInput[] = [];
  let assessment: AssessmentReport | null = null, proposalAssessment: ProposalAssessment | null = null, collectionComplete = false;
  try {
    if (!matchesRepositoryState(repo, original.before)) throw new AuditReportFailure("audit-caller-changed", "Caller changed since the audit report started");
    const current = await collectAuditProposalInputs(options);
    result.scope_changed ||= current.scope_changed;
    if (current.complete && (current.inputs_sha256 !== start.proposal_inputs_sha256 || current.worker_input_sha256 !== start.worker_input_sha256))
      throw new PublicationScopeChanged("Original audit report proposal inputs changed");
    if (!current.complete) {
      for (const message of current.diagnostics) addFailure("audit-collection-diagnostic", message);
      throw new AuditReportFailure("audit-collection-incomplete", "Original audit report proposal inputs changed or became unavailable");
    }
    collectionComplete = current.complete && original.history.complete;
    result.publication_receipts = await collectAuditPublicationReceipts({ repo, source: options.source, artifact_root: options.artifact_root,
      credential: options.credential, path: options.path, proposals: current, observation: options.observation });
    result.scope_changed ||= result.publication_receipts.scope_changed;
    if (!result.publication_receipts.complete) {
      collectionComplete = false;
      for (const message of result.publication_receipts.diagnostics) addFailure("audit-publication-inputs-diagnostic", message);
      throw new AuditReportFailure("audit-publication-inputs-incomplete", "Complete current native publication receipt collection required");
    }
    const receiptRows = readCollectedAuditPublicationReceipts(result.publication_receipts);
    result.counts.eligible_publications = result.publication_receipts.reviewed_proposals;
    result.counts.required_proposals = current.required_proposals; result.counts.collected_proposals = current.collected_proposals;
    result.counts.assessed_proposals = 0; result.counts.unassessed_proposals = current.required_proposals; result.counts.unverified_proposals = current.required_proposals;
    const review = await collectAssessmentReview({ ...options, ...structuredClone(roles) });
    result.scope_changed ||= review.scope_changed;
    if (!review.complete || !review.manifest || !review.review) {
      for (const message of review.diagnostics) addFailure("audit-review-diagnostic", message);
      throw new AuditReportFailure("audit-review-incomplete", "Complete original independent finding review required");
    }
    if (workerInputsDigest(review.manifest.inputs) !== start.worker_input_sha256) throw new PublicationScopeChanged("Original audit report worker inputs changed");
    collectionComplete &&= review.manifest.assessment.collection_complete;
    const sourceInputs = canonicalDigest(resolutionSource(snapshot));
    const item = (input: Omit<AttentionInput, "repository" | "scope_sha256" | "inputs" | "required_inputs">): AttentionInput => ({ ...input,
      repository: snapshot.settings.repository, scope_sha256: snapshot.protocol.bindings.scope_sha256,
      inputs: { source: sourceInputs }, required_inputs: ["source"] });
    const decisions = parseDecisionPacket(readBoundArtifact({ source_repo: repo, artifact_root: options.artifact_root, reference: options.decisions }), snapshot);
    projectAttentionProposals(decisions.attention, { repository: snapshot.settings.repository, scope_sha256: snapshot.protocol.bindings.scope_sha256, inputs_sha256: sourceInputs });
    for (const value of decisions.attention) attention.push(item(value as Omit<AttentionInput, "repository" | "scope_sha256" | "inputs" | "required_inputs">));
    assessment = review.manifest.assessment; result.counts.findings = assessment.counts; result.counts.review_nits = review.review.nit_count;
    result.counts.proposed_edits = review.manifest.selection.edits.length;
    for (const row of assessment.findings.filter(row => row.verdict !== "still-accurate")) attention.push(item({
      identity: "finding:" + row.finding.id, disposition: row.verdict === "unknown" ? "unknown" : "needs-resolution", reason: row.reason,
      owner_action: row.recommendation, rule: { finding: row.finding, verdict: row.verdict, evidence: row.evidence }, title: row.finding.explanation, links: [] }));
    for (const stale of assessment.stale_suppressions) attention.push(item({ identity: "stale-suppression:" + stale.id, disposition: "needs-resolution",
      reason: stale.reason, owner_action: "Review and refresh or retire this stale suppression", rule: { stale_suppression: stale },
      title: "Stale documentation suppression " + stale.id, links: [] }));
    for (const edit of review.manifest.selection.edits) editAttention.push(item({ identity: "edit:" + edit.id, disposition: "needs-resolution",
      reason: "This independently reviewed proposal has no completed delivery in the report-only operation",
      owner_action: "Select preparation and delivery under their applicable permission", rule: { edit_sha256: canonicalDigest(edit) },
      title: "Proposed documentation correction " + edit.path, links: [] }));
    proposalAssessment = review.manifest.proposal_assessment;
    if (proposalAssessment && proposalAssessment.inputs_sha256 !== current.inputs_sha256)
      throw new PublicationScopeChanged("Reviewed proposal assessment inputs changed");
    if (proposalAssessment && !proposalAssessment.complete)
      throw new AuditReportFailure("audit-proposal-assessment-incomplete", "Reviewed proposal assessment is incomplete");
    result.counts.assessed_proposals = proposalAssessment?.counts.assessed_proposals ?? 0;
    result.counts.unassessed_proposals = proposalAssessment?.counts.unassessed_proposals ?? current.required_proposals;
    const supported = proposalAssessment?.proposals.filter(row => row.assessment === "supported").map(row => row.number) ?? [];
    result.proposal_verification = await verifyCurrentProposals({ repo, source: options.source, artifact_root: options.artifact_root,
      owner: options.owner, run: options.run, proposals: current, supported });
    result.scope_changed ||= result.proposal_verification.scope_changed;
    proposalInputs = { snapshot, current, receipts: result.publication_receipts,
      assessment: proposalAssessment, verification: result.proposal_verification };
    delivery = auditProposalReportInputs(proposalInputs);
    if (!result.proposal_verification.complete) {
      collectionComplete = false;
      for (const message of result.proposal_verification.diagnostics) addFailure("audit-proposal-verification-diagnostic", message);
      throw new AuditReportFailure("audit-proposal-verification-incomplete", "Required current proposal verification failed");
    }
    if (supported.length) {
      const finalInputs = await collectAuditProposalInputs(options);
      result.scope_changed ||= finalInputs.scope_changed;
      if (!finalInputs.complete) {
        collectionComplete = false;
        throw new AuditReportFailure("audit-collection-incomplete", "Final current proposal inputs unavailable after verification");
      }
      if (finalInputs.inputs_sha256 !== current.inputs_sha256 || finalInputs.worker_input_sha256 !== current.worker_input_sha256) {
        collectionComplete = false;
        throw new PublicationScopeChanged("Original audit proposal inputs changed during current verification");
      }
      const finalReceipts = await collectAuditPublicationReceipts({ repo, source: options.source, artifact_root: options.artifact_root,
        credential: options.credential, path: options.path, proposals: finalInputs, observation: options.observation });
      result.scope_changed ||= finalReceipts.scope_changed;
      if (!finalReceipts.complete) {
        collectionComplete = false;
        throw new AuditReportFailure("audit-publication-inputs-incomplete", "Final native publication receipts unavailable after verification");
      }
      if (canonicalDigest(readCollectedAuditPublicationReceipts(finalReceipts)) !== canonicalDigest(receiptRows)) {
        collectionComplete = false;
        throw new PublicationScopeChanged("Native reviewed publication changed during current verification");
      }
      const finalReview = await collectAssessmentReview({ ...options, ...structuredClone(roles) });
      result.scope_changed ||= finalReview.scope_changed;
      if (!finalReview.complete || !finalReview.manifest || !finalReview.review)
        throw new AuditReportFailure("audit-review-incomplete", "Original independent review unavailable after current verification");
      if (finalReview.target_sha256 !== review.target_sha256 || canonicalDigest(finalReview.review) !== canonicalDigest(review.review))
        throw new PublicationScopeChanged("Original independent review changed during current verification");
    }
    recheckCurrentProposalVerification(result.proposal_verification);
    result.counts.verified_proposals = result.proposal_verification.verified_proposals;
    result.counts.unverified_proposals = (current.required_proposals ?? 0) - result.proposal_verification.verified_proposals;
    const basis = buildReport({ ...historyContext, source_commit: options.source, completed_at: new Date().toISOString(),
      collection_complete: collectionComplete, failures, attention, ...delivery, published: [], history });
    const delivered = deliveredAuditEditPaths({ edits: review.manifest.selection.edits, snapshot,
      verification: result.proposal_verification, report: basis });
    if (result.counts.unassessed_proposals !== 0) {
      throw new AuditReportFailure("audit-proposal-unassessed", "Existing audit proposals require complete current semantic assessment");
    }
    const deliveredEdits = new Set(review.manifest.selection.edits.filter(edit => delivered.has(edit.path)).map(edit => "edit:" + edit.id));
    editAttention = editAttention.filter(row => !deliveredEdits.has(row.identity));
    result.complete = true;
  } catch (error) { result.scope_changed ||= error instanceof ArtifactChanged || error instanceof PublicationScopeChanged;
    addFailure(error instanceof AuditReportFailure ? error.code : error instanceof ArtifactChanged || error instanceof PublicationScopeChanged ? "audit-scope-changed" : "audit-report-incomplete",
      error instanceof Error ? error.message : "Final audit report unavailable"); }
  if (!matchesRepositoryState(repo, original.before)) {
    result.complete = false; collectionComplete = false; addFailure("audit-caller-changed", "Caller changed during audit report completion");
  }
  if (!result.complete) {
    if (result.proposal_verification) result.proposal_verification = invalidateCurrentProposalVerification(result.proposal_verification,
      "Final audit proof is incomplete", result.scope_changed);
    if (proposalInputs && result.proposal_verification)
      delivery = auditProposalReportInputs({ ...proposalInputs, verification: result.proposal_verification });
    delivery = { corrections: [], proposals: delivery.proposals.map(proposal => ({ ...proposal, reviewed: null })) };
    result.counts.verified_proposals = 0;
    result.counts.unverified_proposals = result.counts.required_proposals;
  }
  result.diagnostics = [...new Set(result.diagnostics)];
  if (!result.complete && !failures.length) addFailure("audit-report-incomplete", "Final audit assessment is incomplete");
  try {
    result.report = buildReport({ ...historyContext, source_commit: options.source, completed_at: new Date().toISOString(),
      collection_complete: collectionComplete, failures, attention: [...attention, ...editAttention], ...delivery, published: [], history });
    result.markdown = renderReport(result.report) + (assessment ? "\n" + renderAssessmentReport(assessment,
      ["Finding assessments independently reviewed", ...(result.counts.review_nits ? [result.counts.review_nits + " minor review finding(s) remain in the original records"] : [])])
      .replace(/^# Documentation drift report\n/u, "## Finding assessment\n") : "\n## Assessment gaps\n\nFinding counts and judgments are unavailable until the failed assessment checks are resolved.\n")
      + (proposalAssessment ? "\n" + renderProposalAssessment(proposalAssessment, "Proposal assessments independently reviewed") : "");
    if (result.proposal_verification) result.markdown += "\n## Current proposal verification\n\n"
      + result.proposal_verification.proposals.map(row => joinReportSentences(["- " + escapeReportText(row.locator), row.outcome,
        ...row.diagnostics.map(escapeReportText)])).join("\n") + "\n";
  } catch (error) {
    result.complete = false; result.report = null; result.markdown = null;
    if (result.proposal_verification) result.proposal_verification = invalidateCurrentProposalVerification(result.proposal_verification,
      "Final report projection failed", result.scope_changed);
    result.counts.verified_proposals = 0; result.counts.unverified_proposals = result.counts.required_proposals;
    result.diagnostics.push(error instanceof Error ? error.message : "Final report projection unavailable");
  }
  const completed = boundAuditReport(result, original.limit);
  if (completed.complete && completed.report) {
    reports.set(completed, completed.report); reportHistories.set(completed, original.history); consumed.add(start);
  }
  return completed;
}

/** Pure presentation bound. Calling this on serialized data creates no original report provenance. */
export function boundAuditReport(input: Result, limit: number): Result {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > OUTPUT_LIMIT) throw Error("Final report output bound required");
  const result = structuredClone(input);
  if (Buffer.byteLength(JSON.stringify(result) + "\n") > limit) {
    result.complete = false; result.details_omitted = true; result.proposal_verification = null; result.publication_receipts = null; result.report = null; result.markdown = null;
    result.counts.verified_proposals = 0; result.counts.unverified_proposals = result.counts.required_proposals;
    result.diagnostics = ["Final report exceeds the retained entry bound; inspect the original source and role records"];
    if (Buffer.byteLength(JSON.stringify(result) + "\n") > limit) throw Error("Configured output bound cannot hold the incomplete final report");
  }
  return freezeJSON(result);
}

/** Original report-only result, not a claim that any candidate or GitHub write was delivered. */
export function readOriginalAuditReport(result: Result): Report {
  const report = reports.get(result);
  if (!result.complete || !report) throw Error("Original completed audit report required");
  return freezeJSON(structuredClone(report));
}

/** Preserve the actual completed report and its original hosted history collection. */
export function createOriginalAuditReportEnvelope(result: Result): Buffer {
  const report = readOriginalAuditReport(result), history = reportHistories.get(result);
  if (!history) throw Error("Original audit report history required");
  return createCollectedActionsEnvelope(history, canonicalJSON(report));
}

export function readOriginalAuditLocalContext(result: Result) {
  readOriginalAuditReport(result);
  const history = reportHistories.get(result);
  if (!history) throw Error("Original audit report history required");
  return readCollectedLocalHistoryContext(history);
}
