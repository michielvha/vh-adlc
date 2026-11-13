import { realpathSync } from "node:fs";
import { collectAuditProposalInputs, readCollectedAuditProposals } from "./audit-proposal-inputs";
import { collectAuditPublicationReceipts, readCollectedAuditPublicationReceipts } from "./audit-publication-receipts";
import { collectAssessmentReview } from "./assessment-review";
import { collectNativeReportHistory, readCollectedReportHistory } from "./history-collection";
import { workerInputsDigest } from "./manifests";
import { ArtifactChanged, readBoundArtifact } from "./evidence-input";
import { parseDecisionPacket, projectAttentionProposals } from "./publication-decisions";
import { OUTPUT_LIMIT } from "./owned-process";
import { PublicationScopeChanged } from "./publish";
import { canonicalDigest, freezeJSON } from "./protocol";
import { buildReport, renderReport, type AttentionInput, type Report } from "./report";
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
  assessed_proposals: number | null; unassessed_proposals: number | null; unverified_proposals: number | null;
  eligible_publications: number | null; findings: AssessmentReport["counts"] | null; review_nits: number | null;
};
type Result = {
  schema_version: 1; kind: "docs-drift-audit-report"; authority: "none"; source_commit: string;
  complete: boolean; scope_changed: boolean; details_omitted: boolean; diagnostics: string[];
  counts: Counts; publication_receipts: Awaited<ReturnType<typeof collectAuditPublicationReceipts>> | null; report: Report | null; markdown: string | null;
};
type Context = {
  options: Options; before: string; limit: number;
  history: Awaited<ReturnType<typeof collectNativeReportHistory>>;
  proposals: Awaited<ReturnType<typeof collectAuditProposalInputs>>;
};
const runs = new WeakMap<object, Context>(), reports = new WeakMap<object, Report>();
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
  const options = structuredClone(input), repo = realpathSync(options.repo), before = canonicalDigest(captureRepositoryState(repo));
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
    complete: false, scope_changed: false, details_omitted: false, diagnostics: [], publication_receipts: null, report: null, markdown: null,
    counts: { proposed_edits: null, required_proposals: original.proposals.required_proposals, collected_proposals: original.proposals.collected_proposals,
      assessed_proposals: null, unassessed_proposals: original.proposals.required_proposals, unverified_proposals: null,
      eligible_publications: null, findings: null, review_nits: null } };
  const attention: AttentionInput[] = [], failures: Report["failures"] = [], history = readCollectedReportHistory(original.history);
  const addFailure = (code: string, message: string) => {
    result.diagnostics.push(message);
    if (!failures.some(failure => failure.code === code && failure.message === message)) failures.push({ code, message });
  };
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
      credential: options.credential, path: options.path, proposals: current });
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
    for (const edit of review.manifest.selection.edits) attention.push(item({ identity: "edit:" + edit.id, disposition: "needs-resolution",
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
    result.counts.unverified_proposals = current.required_proposals;
    for (const proposal of readCollectedAuditProposals(current)) {
      const judgment = proposalAssessment?.proposals.find(row => row.number === proposal.number && row.binding_sha256 === proposal.binding_sha256);
      const publication = receiptRows.find(row => row.number === proposal.number && row.binding_sha256 === proposal.binding_sha256);
      if (!publication) throw new AuditReportFailure("audit-publication-inputs-incomplete", "Original current proposal receipt binding required");
      attention.push(item({ identity: "proposal:" + proposal.number, disposition: judgment ? proposalAttentionDisposition(judgment.assessment) : "unknown",
        reason: judgment ? "Current source assessment: " + judgment.assessment + "; historical shared receipt "
          + (publication.eligibility === "reviewed" ? "is eligible" : "is not eligible") + "; current result verification and carried delivery are not established"
          : "Full native proposal inputs are collected; current semantic support has not been assessed for this report",
        owner_action: judgment ? "Review every hunk recommendation under Existing proposal assessments before selecting verification, delivery or resolution"
          : "Complete the current support assessment before carrying or resolving this proposal",
        rule: { number: proposal.number, head_sha: proposal.head_sha, base_sha: proposal.base_sha, binding_sha256: proposal.binding_sha256,
          assessment_sha256: judgment ? canonicalDigest(judgment) : null, verification: "unverified", delivery: "unverified",
          publication: { eligibility: publication.eligibility, receipt_sha256: publication.receipt ? canonicalDigest(publication.receipt) : null } },
        title: "Existing audit proposal " + proposal.number + (judgment ? " awaits verification and delivery review" : " remains unassessed"),
        links: ["https://" + snapshot.settings.hostname + "/" + snapshot.settings.repository + "/pull/" + proposal.number] }));
    }
    if (result.counts.unassessed_proposals !== 0) {
      throw new AuditReportFailure("audit-proposal-unassessed", "Existing audit proposals require complete current semantic assessment");
    }
    result.complete = true;
  } catch (error) { result.scope_changed ||= error instanceof ArtifactChanged || error instanceof PublicationScopeChanged;
    addFailure(error instanceof AuditReportFailure ? error.code : error instanceof ArtifactChanged || error instanceof PublicationScopeChanged ? "audit-scope-changed" : "audit-report-incomplete",
      error instanceof Error ? error.message : "Final audit report unavailable"); }
  if (!matchesRepositoryState(repo, original.before)) {
    result.complete = false; collectionComplete = false; addFailure("audit-caller-changed", "Caller changed during audit report completion");
  }
  result.diagnostics = [...new Set(result.diagnostics)];
  if (!result.complete && !failures.length) addFailure("audit-report-incomplete", "Final audit assessment is incomplete");
  try {
    result.report = buildReport({ ...historyContext, source_commit: options.source, completed_at: new Date().toISOString(),
      collection_complete: collectionComplete, failures, attention, corrections: [], proposals: [], published: [], history });
    result.markdown = renderReport(result.report) + (assessment ? "\n" + renderAssessmentReport(assessment,
      ["Finding assessments independently reviewed", ...(result.counts.review_nits ? [result.counts.review_nits + " minor review finding(s) remain in the original records"] : [])])
      .replace(/^# Documentation drift report\n/u, "## Finding assessment\n") : "\n## Assessment gaps\n\nFinding counts and judgments are unavailable until the failed assessment checks are resolved.\n")
      + (proposalAssessment ? "\n" + renderProposalAssessment(proposalAssessment, "Proposal assessments independently reviewed") : "");
  } catch (error) {
    result.complete = false; result.report = null; result.markdown = null;
    result.diagnostics.push(error instanceof Error ? error.message : "Final report projection unavailable");
  }
  const completed = boundAuditReport(result, original.limit);
  if (completed.complete && completed.report) { reports.set(completed, completed.report); consumed.add(start); }
  return completed;
}

/** Pure presentation bound. Calling this on serialized data creates no original report provenance. */
export function boundAuditReport(input: Result, limit: number): Result {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > OUTPUT_LIMIT) throw Error("Final report output bound required");
  const result = structuredClone(input);
  if (Buffer.byteLength(JSON.stringify(result) + "\n") > limit) {
    result.complete = false; result.details_omitted = true; result.publication_receipts = null; result.report = null; result.markdown = null;
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
