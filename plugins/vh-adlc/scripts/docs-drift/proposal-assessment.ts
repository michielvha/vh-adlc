import { join } from "node:path";
import { realpathSync } from "node:fs";
import { readBoundArtifact } from "./evidence-input";
import { readCollectedAuditProposals, type collectAuditProposalInputs } from "./audit-proposal-inputs";
import { exactRecord } from "./publication-decisions";
import { canonicalDigest, canonicalJSON, decodeUTF8, freezeJSON, protocolPath } from "./protocol";
import { matchesSourceQuote, parseSourceQuote } from "./resolve";
import { artifactDirectoryScope, captureCallerState, captureSnapshot, matchesCallerState } from "./snapshot";
import { escapeReportText } from "./report";
import { OUTPUT_LIMIT } from "./owned-process";

type Verdict = "supported" | "fixed-differently" | "unsupported" | "unknown";
type Hunk = { id: string; assessed: boolean; verdict: Verdict; reason: string; recommendation: string; evidence: ReturnType<typeof parseSourceQuote>[] };
type Proposal = { number: number; binding_sha256: string; assessed: boolean;
  assessment: "supported" | "fixed-differently" | "unsupported" | "unverifiable" | "mixed"; hunks: Hunk[] };
export type ProposalAssessment = {
  schema_version: 1; kind: "docs-drift-proposal-assessment-report"; authority: "none"; origin: "caller-assessment";
  source_commit: string; inputs_sha256: string | null; assessment_reference: { path: string; sha256: string } | null;
  complete: boolean; collection_complete: boolean; details_omitted: boolean; diagnostics: string[];
  counts: { required_proposals: number | null; assessed_proposals: number | null; unassessed_proposals: number | null;
    required_hunks: number | null; assessed_hunks: number | null; unknown_hunks: number | null; unassessed_hunks: number | null };
  proposals: Proposal[];
};
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw Error("Proposal assessment reason and recommendation required");
  return value;
}
function assessment(hunks: Hunk[]): Proposal["assessment"] {
  if (!hunks.length || hunks.some(hunk => !hunk.assessed)) return "unverifiable";
  const verdicts = new Set(hunks.map(hunk => hunk.verdict));
  if (verdicts.size > 1) return "mixed";
  const verdict = hunks[0].verdict;
  return verdict === "unknown" ? "unverifiable" : verdict;
}

/** Validate complete full-diff accounting and current quotes. Judgments remain provisional until independent review. */
export function readProposalAssessment(options: {
  repo: string; source: string; artifact_root: string; inputs: Awaited<ReturnType<typeof collectAuditProposalInputs>>;
  reference: unknown; candidate_repo?: string;
}): ProposalAssessment {
  const repo = realpathSync(options.repo), before = canonicalDigest(captureCallerState(repo)), candidate = options.candidate_repo ? realpathSync(options.candidate_repo) : repo;
  const candidateBefore = candidate === repo ? before : canonicalDigest(captureCallerState(candidate));
  const result: ProposalAssessment = { schema_version: 1, kind: "docs-drift-proposal-assessment-report", authority: "none", origin: "caller-assessment",
    source_commit: options.source, inputs_sha256: null, assessment_reference: null, complete: false, collection_complete: false, details_omitted: false, diagnostics: [],
    counts: { required_proposals: null, assessed_proposals: null, unassessed_proposals: null, required_hunks: null, assessed_hunks: null, unknown_hunks: null, unassessed_hunks: null }, proposals: [] };
  let limit = OUTPUT_LIMIT;
  try {
    const snapshot = captureSnapshot(repo, options.source); limit = Math.min(limit, snapshot.settings.reports.max_entry_bytes);
    const originals = readCollectedAuditProposals(options.inputs);
    if (options.inputs.source_commit !== options.source || !options.inputs.inputs_sha256) throw Error("Original proposal assessment source changed");
    result.inputs_sha256 = options.inputs.inputs_sha256; result.collection_complete = true;
    result.proposals = originals.map(proposal => ({ number: proposal.number, binding_sha256: proposal.binding_sha256, assessed: false, assessment: "unverifiable",
      hunks: proposal.hunks.map(hunk => ({ id: hunk.id, assessed: false, verdict: "unknown", reason: "This complete original hunk has no recorded assessment",
        recommendation: "Inspect the full proposal and current source", evidence: [] })) }));
    const scope = artifactDirectoryScope(options.artifact_root, candidate);
    scope.assertExternal(join(scope.directory, protocolPath((options.reference as { path?: unknown })?.path)));
    const raw = readBoundArtifact({ source_repo: repo, artifact_root: scope.directory, reference: options.reference });
    if (raw.length > limit) throw Error("Proposal assessment exceeds the retained entry bound");
    const packet = exactRecord(JSON.parse(decodeUTF8(raw)), ["schema_version", "kind", "source_commit", "inputs_sha256", "proposals"], "Proposal assessment fields changed");
    if (!canonicalJSON(packet).equals(raw) || packet.schema_version !== 1 || packet.kind !== "docs-drift-proposal-assessment"
      || packet.source_commit !== options.source || packet.inputs_sha256 !== result.inputs_sha256 || !Array.isArray(packet.proposals))
      throw Error("Exact original proposal input and assessment bindings required");
    result.assessment_reference = structuredClone(options.reference) as { path: string; sha256: string };
    const proposed = new Map<number, Proposal>();
    for (const value of packet.proposals) {
      const row = exactRecord(value, ["number", "binding_sha256", "hunks"], "Proposal assessment row fields changed");
      const original = originals.find(proposal => proposal.number === row.number);
      if (!original || proposed.has(original.number) || row.binding_sha256 !== original.binding_sha256 || !Array.isArray(row.hunks))
        throw Error("Unknown, repeated or changed complete proposal assessment");
      const hunks = new Map<string, Hunk>();
      for (const value of row.hunks) {
        const hunk = exactRecord(value, ["id", "verdict", "reason", "recommendation", "evidence"], "Proposal hunk assessment fields changed");
        if (typeof hunk.id !== "string" || hunks.has(hunk.id) || !original.hunks.some(unit => unit.id === hunk.id)
          || !["supported", "fixed-differently", "unsupported", "unknown"].includes(String(hunk.verdict)) || !Array.isArray(hunk.evidence))
          throw Error("Unknown, repeated or incomplete original hunk assessment");
        const evidence = hunk.evidence.map(parseSourceQuote);
        if (evidence.some(quote => !matchesSourceQuote(quote, { snapshot }))) throw Error("Proposal assessment evidence differs from current source");
        if (hunk.verdict !== "unknown" && evidence.length === 0) throw Error("An affirmative proposal assessment requires current source evidence");
        hunks.set(hunk.id, { id: hunk.id, assessed: true, verdict: hunk.verdict as Verdict, reason: text(hunk.reason),
          recommendation: text(hunk.recommendation), evidence });
      }
      if (hunks.size !== original.hunks.length) throw Error("Some complete original hunks have no recorded assessment");
      const ordered = original.hunks.map(hunk => hunks.get(hunk.id)!);
      proposed.set(original.number, { number: original.number, binding_sha256: original.binding_sha256, assessed: true, assessment: assessment(ordered), hunks: ordered });
    }
    result.proposals = result.proposals.map(proposal => proposed.get(proposal.number) ?? proposal);
    if (proposed.size !== originals.length) throw Error("Some complete original proposals have no recorded assessment");
    result.complete = true;
  } catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Current proposal assessment unavailable"); }
  if (!matchesCallerState(repo, before)) { result.complete = false; result.diagnostics.push("Caller changed during proposal assessment"); }
  if (candidate !== repo && !matchesCallerState(candidate, candidateBefore)) { result.complete = false; result.diagnostics.push("Candidate changed during proposal assessment"); }
  if (result.collection_complete) {
    const hunks = result.proposals.flatMap(proposal => proposal.hunks);
    result.counts = { required_proposals: result.proposals.length, assessed_proposals: result.proposals.filter(proposal => proposal.assessed).length,
      unassessed_proposals: result.proposals.filter(proposal => !proposal.assessed).length, required_hunks: hunks.length,
      assessed_hunks: hunks.filter(hunk => hunk.assessed).length, unknown_hunks: hunks.filter(hunk => hunk.assessed && hunk.verdict === "unknown").length,
      unassessed_hunks: hunks.filter(hunk => !hunk.assessed).length };
  }
  if (Buffer.byteLength(JSON.stringify(result) + "\n") > limit) {
    result.complete = false; result.details_omitted = true; result.proposals = [];
    result.diagnostics = ["Detailed proposal assessment exceeds the retained entry bound; inspect the original native inputs and assessment"];
    if (Buffer.byteLength(JSON.stringify(result) + "\n") > limit) throw Error("Configured output bound cannot hold the incomplete proposal assessment");
  }
  return freezeJSON(result);
}


/** Presentation never upgrades caller judgments to independent proof. The verified parent chooses its introduction. */
export function renderProposalAssessment(report: ProposalAssessment, introduction = "Proposal judgments remain provisional pending independent review"): string {
  const lines = ["## Existing proposal assessments", "", escapeReportText(introduction) + ".", "",
    `${report.counts.assessed_proposals ?? "unavailable"} assessed proposal(s); ${report.counts.unassessed_proposals ?? "unavailable"} unassessed.`,
    "Current proposal verification and reviewed delivery remain separate gates.", ""];
  for (const proposal of report.proposals) {
    lines.push(`### Proposal ${proposal.number}`, "", `${proposal.assessed ? escapeReportText(proposal.assessment) : "Unassessed"}. Full input binding ${proposal.binding_sha256}.`, "");
    for (const hunk of proposal.hunks) {
      lines.push(`- ${escapeReportText(hunk.id)}. ${hunk.assessed ? escapeReportText(hunk.verdict) : "Unassessed"}. ${escapeReportText(hunk.reason)}.`,
        `  Next action: ${escapeReportText(hunk.recommendation)}.`);
      for (const quote of hunk.evidence) lines.push(`  Evidence ${escapeReportText(quote.path)} at bytes ${quote.start} to ${quote.end}, blob ${quote.sha256}, quote ${quote.quote_sha256}.`);
    }
    if (!proposal.hunks.length) lines.push("No changed hunk is available; resolve this original explicitly.");
    lines.push("");
  }
  if (report.details_omitted) lines.push("Detailed proposal judgments remain in the original assessment record.", "");
  for (const diagnostic of report.diagnostics) lines.push(`- ${escapeReportText(diagnostic)}.`);
  return lines.join("\n") + "\n";
}
