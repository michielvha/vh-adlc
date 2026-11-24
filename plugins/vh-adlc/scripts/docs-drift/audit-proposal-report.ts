import { readCollectedAuditProposalContext, readCollectedAuditProposals, type collectAuditProposalInputs } from "./audit-proposal-inputs";
import { readCollectedAuditPublicationReceipts, type collectAuditPublicationReceipts } from "./audit-publication-receipts";
import type { CurrentProposalVerification } from "./current-proposal-verification";
import type { ProposalAssessment } from "./proposal-assessment";
import { canonicalDigest } from "./protocol";
import { correctionProjection, type AttentionInput, type CorrectionInput, type Proposal, type Report } from "./report";
import { collectEditChanges, resolutionSource, type Edit } from "./resolve";
import type { Snapshot } from "./snapshot";

/** Only the report controller supplies reopened original inputs, review and current proof. */
export function auditProposalReportInputs(input: {
  snapshot: Snapshot;
  current: Awaited<ReturnType<typeof collectAuditProposalInputs>>;
  receipts: Awaited<ReturnType<typeof collectAuditPublicationReceipts>>;
  assessment: ProposalAssessment | null;
  verification: CurrentProposalVerification;
}): { corrections: CorrectionInput[]; proposals: Proposal[] } {
  const { snapshot, assessment, verification } = input;
  const context = readCollectedAuditProposalContext(input.current), receipts = readCollectedAuditPublicationReceipts(input.receipts);
  const corrections = new Map<string, CorrectionInput>();
  const proposals = readCollectedAuditProposals(input.current).map(original => {
    const native = context.proposals.find(row => row.number === original.number);
    const publication = receipts.find(row => row.number === original.number && row.binding_sha256 === original.binding_sha256);
    const proof = verification.proposals.find(row => row.number === original.number && row.binding_sha256 === original.binding_sha256);
    const judgment = assessment?.proposals.find(row => row.number === original.number && row.binding_sha256 === original.binding_sha256);
    if (!native || !publication) throw Error("Complete original audit proposal report bindings required");
    const verified = verification.complete && proof?.outcome === "verified";
    if (verified && proof) for (const correction of proof.corrections) corrections.set(correctionProjection(correction), correction);
    const locator = "https://" + snapshot.settings.hostname + "/" + snapshot.settings.repository + "/pull/" + original.number;
    const eligible = publication.eligibility === "reviewed";
    const detail: AttentionInput = {
      repository: snapshot.settings.repository, scope_sha256: snapshot.protocol.bindings.scope_sha256,
      identity: "proposal:" + original.number, disposition: judgment?.assessment === "unverifiable" || !judgment ? "unknown" : "needs-resolution",
      reason: judgment ? "Current source assessment is " + judgment.assessment + ". The historical shared receipt "
        + (eligible ? "is eligible" : "is not eligible") + ". The current result verification " + (verified ? "passed" : "is unverified")
        : "Full native proposal inputs are collected. Current semantic support has not been assessed for this report",
      owner_action: "Review every hunk recommendation under Existing proposal assessments before selecting delivery or resolution",
      rule: { number: original.number, head_sha: original.head_sha, base_sha: original.base_sha, binding_sha256: original.binding_sha256,
        assessment_sha256: judgment ? canonicalDigest(judgment) : null, verification: verified ? "verified" : "unverified", delivery: "unverified",
        publication: { eligibility: publication.eligibility, receipt_sha256: publication.receipt ? canonicalDigest(publication.receipt) : null } },
      inputs: { source: canonicalDigest(resolutionSource(snapshot)) }, required_inputs: ["source"],
      title: "Existing audit proposal " + original.number + (judgment ? " needs delivery or resolution review" : " remains unassessed"), links: [locator],
    };
    return { locator, state: native.merged_at !== null ? "merged" as const : native.state,
      assessment: verified && judgment?.assessment === "supported" ? "supported" as const
        : judgment?.assessment === "unsupported" || judgment?.assessment === "fixed-differently" ? judgment.assessment : "unverifiable" as const,
      actor: native.actor, head: original.head_sha, body_sha256: original.body_sha256, paths: original.files.map(file => file.path),
      reviewed: verified && eligible ? publication.reviewed : null,
      evidence: { receipt_sha256: publication.receipt ? canonicalDigest(publication.receipt) : null,
        inputs_sha256: canonicalDigest({ source: resolutionSource(snapshot), original: original.binding_sha256, assessment: judgment ?? null }) },
      resolution_attention: detail };
  });
  return { corrections: [...corrections.values()], proposals };
}

/** A matching receipt can suppress an edit only after global overlap checks permit its delivery. */
export function deliveredAuditEditPaths(input: {
  edits: Edit[]; snapshot: Snapshot; verification: CurrentProposalVerification; report: Report;
}): Set<string> {
  const carried = new Set(input.report.carried_delivery.map(row => row.correction_sha256));
  const changes = collectEditChanges(input.edits, input.snapshot).map(({ after_base64: _bytes, ...change }) => change);
  return new Set(changes.filter(change => input.verification.proposals.some(proposal =>
    proposal.outcome === "verified" && proposal.postimages.some(image => canonicalDigest(image) === canonicalDigest(change))
      && proposal.corrections.some(correction => correction.path === change.path && carried.has(correctionProjection(correction)))))
    .map(change => change.path));
}
