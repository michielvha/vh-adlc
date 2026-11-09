import { realpathSync } from "node:fs";
import { OUTPUT_LIMIT } from "./owned-process";
import { readBoundArtifact } from "./evidence-input";
import { exactRecord } from "./publication-decisions";
import { evaluateProtection, type ProtectionContext } from "./protection";
import { canonicalDigest, canonicalJSON, decodeUTF8, freezeJSON } from "./protocol";
import { escapeReportText } from "./report";
import { matchesSourceQuote, parseSourceQuote } from "./resolve";
import type { Finding, ScanRun } from "./scan";
import { captureBareSnapshot, captureRepositoryState, matchesRepositoryState } from "./snapshot";
import { readSourceAssessmentArtifacts } from "./source-assessment";

type Options = Omit<Parameters<typeof readSourceAssessmentArtifacts>[0], "reference" | "candidate_repo"> & {
  source_verification: unknown; assessment: unknown; protection_context?: ProtectionContext;
};
type Verdict = "confirmed-drift" | "still-accurate" | "unknown";
type Reference = { path: string; sha256: string };
type FindingRow = {
  finding: Finding; assessed: boolean; verdict: Verdict; reason: string; recommendation: string;
  evidence: ReturnType<typeof parseSourceQuote>[];
};
type Counts = {
  documents: number | null; detectors: number | null; candidates: number | null; suppressed: number | null;
  stale_suppressions: number | null; assessed: number | null; confirmed_drift: number | null; still_accurate: number | null; unknown: number | null; unassessed: number | null;
};
export type AssessmentReport = {
  schema_version: 1; kind: "docs-drift-assessment-report"; authority: "none"; origin: "caller-assessment";
  complete: boolean; collection_complete: boolean; source_commit: string; diagnostics: string[];
  source_verification: Reference | null; assessment_reference: Reference | null; details_omitted: boolean; diagnostics_omitted: number; counts: Counts; findings: FindingRow[];
  suppressed_findings: ScanRun["suppressed_findings"]; stale_suppressions: ScanRun["stale_suppressions"];
};
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw Error("Finding reason and recommendation required");
  return value;
}

/** Validate finding accounting and quoted source. Semantic judgments remain the caller's recorded assessment. */
export function readAssessmentReport(input: Options): AssessmentReport {
  const options = { ...input, source_verification: structuredClone(input.source_verification), assessment: structuredClone(input.assessment),
    protection_context: structuredClone(input.protection_context) };
  const repo = realpathSync(options.repo), before = canonicalDigest(captureRepositoryState(repo));
  const result: AssessmentReport = { schema_version: 1, kind: "docs-drift-assessment-report", authority: "none", origin: "caller-assessment",
    complete: false, collection_complete: false, source_commit: options.source, diagnostics: [], source_verification: null,
    assessment_reference: null, details_omitted: false, diagnostics_omitted: 0, findings: [], suppressed_findings: [], stale_suppressions: [],
    counts: { documents: null, detectors: null, candidates: null, suppressed: null, stale_suppressions: null,
      assessed: null, confirmed_drift: null, still_accurate: null, unknown: null, unassessed: null } };
  let scan: ScanRun | null = null;
  let entryLimit = OUTPUT_LIMIT;
  try {
    const source = readSourceAssessmentArtifacts({ ...options, candidate_repo: repo, reference: options.source_verification });
    if (!source.complete || !source.scan?.complete || !source.evidence || !source.object_store) throw Error("Complete original source assessment required");
    scan = source.scan;
    result.source_verification = source.evidence;
    result.collection_complete = true;
    result.suppressed_findings = scan.suppressed_findings;
    result.stale_suppressions = scan.stale_suppressions;
    result.findings = scan.findings.map<FindingRow>(finding => ({ finding, assessed: false, verdict: "unknown",
      reason: "This candidate has no recorded assessment", recommendation: "Inspect the document and supporting source", evidence: [] }));
    const snapshot = captureBareSnapshot(source.object_store.root, options.source);
    entryLimit = Math.min(OUTPUT_LIMIT, snapshot.settings.reports.max_entry_bytes);
    const protection = evaluateProtection(scan.checkout, snapshot, [], options.protection_context);
    if (!protection.complete) {
      result.collection_complete = false;
      result.diagnostics.push(...protection.diagnostics.map(diagnostic => diagnostic.message));
      throw Error("Finding report requires complete root and feature classification");
    }
    const bytes = readBoundArtifact({ source_repo: repo, artifact_root: options.artifact_root, reference: options.assessment });
    // The shared artifact reader has validated this exact reference and its bytes.
    result.assessment_reference = options.assessment as Reference;
    if (bytes.length > snapshot.settings.reports.max_entry_bytes) throw Error("Finding assessment exceeds the retained entry bound");
    const packet = exactRecord(JSON.parse(decodeUTF8(bytes)), ["schema_version", "kind", "source_commit", "source_verification_sha256", "findings"], "Finding assessment fields changed");
    if (!canonicalJSON(packet).equals(bytes) || packet.schema_version !== 1 || packet.kind !== "docs-drift-assessment"
      || packet.source_commit !== options.source || packet.source_verification_sha256 !== source.evidence.sha256 || !Array.isArray(packet.findings))
      throw Error("Exact original source and finding assessment bindings required");
    const decisions = new Map<string, Omit<FindingRow, "finding">>();
    const findingsByID = new Map(scan.findings.map(finding => [finding.id, finding]));
    for (const value of packet.findings) {
      const row = exactRecord(value, ["id", "verdict", "reason", "recommendation", "evidence"], "Finding decision fields changed");
      if (typeof row.id !== "string") throw Error("Finding decision identity required");
      const finding = findingsByID.get(row.id);
      if (!finding || decisions.has(finding.id)) throw Error("Unknown or duplicate finding decision");
      if (row.verdict !== "confirmed-drift" && row.verdict !== "still-accurate" && row.verdict !== "unknown") throw Error("Unknown finding verdict");
      if (!Array.isArray(row.evidence)) throw Error("Finding source evidence required");
      const evidence = row.evidence.map(parseSourceQuote);
      if (evidence.some(quote => !matchesSourceQuote(quote, { snapshot }))) throw Error("Finding evidence differs from its original source");
      if (row.verdict !== "unknown" && !evidence.some(quote => quote.path === finding.document)) throw Error("An affirmative finding decision requires document evidence");
      decisions.set(finding.id, { assessed: true, verdict: row.verdict, reason: text(row.reason), recommendation: text(row.recommendation), evidence });
    }
    result.findings = result.findings.map(row => ({ ...row, ...decisions.get(row.finding.id) }));
    if (decisions.size !== scan.findings.length) throw Error("Some collected findings have no recorded assessment");
    result.complete = true;
  } catch (error) { result.diagnostics.push(error instanceof Error ? error.message : "Finding assessment unavailable"); }
  if (!matchesRepositoryState(repo, before)) { result.complete = false; result.diagnostics.push("Caller changed or became unavailable during report collection"); }
  result.counts = {
    documents: scan?.documents.length ?? null, detectors: scan?.detectors.length ?? null, candidates: scan?.findings.length ?? null,
    suppressed: scan?.suppressed_findings.length ?? null, stale_suppressions: scan?.stale_suppressions.length ?? null,
    assessed: scan ? result.findings.filter(row => row.assessed).length : null,
    confirmed_drift: scan ? result.findings.filter(row => row.verdict === "confirmed-drift").length : null,
    still_accurate: scan ? result.findings.filter(row => row.verdict === "still-accurate").length : null,
    unknown: scan ? result.findings.filter(row => row.verdict === "unknown").length : null,
    unassessed: scan ? result.findings.filter(row => !row.assessed).length : null,
  };
  return boundAssessmentReport(result, entryLimit);
}

/** The CLI and size gate use this identical envelope, including repeated diagnostics and final newline. */
export function assessmentReportOutput(report: AssessmentReport) {
  return { schema_version: 1 as const, command: "report-findings", outcome: report.complete ? "collected" as const : "incomplete" as const,
    source_commit: report.source_commit, assessment_report: report, markdown: renderAssessmentReport(report),
    diagnostics: report.diagnostics.map(message => ({ code: "finding-assessment", message })) };
}

export function boundAssessmentReport(input: AssessmentReport, limit: number): AssessmentReport {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > OUTPUT_LIMIT) throw Error("Finding report output bound required");
  const report = structuredClone(input), size = () => Buffer.byteLength(JSON.stringify(assessmentReportOutput(report)) + "\n");
  if (size() > limit) {
    report.complete = false;
    report.details_omitted = true;
    report.findings = [];
    report.suppressed_findings = [];
    report.stale_suppressions = [];
    const count = report.diagnostics.length;
    report.diagnostics = report.diagnostics.slice(0, 5).map(message => message.length <= 256 ? message : message.slice(0, 256) + "…");
    report.diagnostics_omitted += count - report.diagnostics.length;
    report.diagnostics.push("Detailed report exceeds the retained entry bound. Full source and assessment records remain available");
    if (size() > limit) {
      report.diagnostics_omitted += report.diagnostics.length - 1;
      report.diagnostics = ["Detailed report and diagnostics exceed the output bound. Inspect the original source and assessment records"];
    }
    if (size() > limit) throw Error("Configured output bound cannot hold the incomplete finding report");
  }
  return freezeJSON(report);
}

function sentence(value: string): string {
  const escaped = escapeReportText(value.trim());
  return /[.!?]$/u.test(value.trim()) ? escaped : escaped + ".";
}

export function renderAssessmentReport(report: AssessmentReport): string {
  const verdictNames = { "confirmed-drift": "Confirmed drift", "still-accurate": "Still accurate", unknown: "Unknown" };
  const summary = report.counts.candidates === null ? "Candidate counts unavailable."
    : `${report.counts.candidates} candidate(s). ${report.counts.confirmed_drift} confirmed drift, ${report.counts.still_accurate} still accurate, ${report.counts.unknown} unknown.`;
  const sourceLabel = report.source_verification === null ? "Selected source" : "Assessed source";
  const lines = ["# Documentation drift report", "", summary,
    "", "Caller-recorded verdicts and recommendations remain provisional pending independent review.",
    `Recorded assessments ${report.counts.assessed ?? "unavailable"}. Unassessed candidates ${report.counts.unassessed ?? "unavailable"}.`,
    `Suppressed candidates ${report.counts.suppressed ?? "unavailable"}. Stale suppressions ${report.counts.stale_suppressions ?? "unavailable"}.`,
    `${sourceLabel} ${escapeReportText(report.source_commit)}.`, "", "## Proposed fixes and decisions", ""];
  const proposed = report.findings.filter(row => row.verdict !== "still-accurate")
    .sort((left, right) => Number(right.verdict === "confirmed-drift") - Number(left.verdict === "confirmed-drift"));
  for (const row of proposed.slice(0, 5))
    lines.push(`- ${row.assessed ? verdictNames[row.verdict] : "Unassessed"}. ${escapeReportText(row.finding.document)}. ${sentence(row.recommendation)}`);
  if (proposed.length > 5) lines.push(`${proposed.length - 5} additional items appear in Finding details.`);
  if (!proposed.length) {
    if (report.details_omitted) lines.push("Proposed corrections are retained with the original assessment.");
    else if (report.collection_complete) lines.push("No proposed documentation correction.");
    else lines.push("Proposed corrections unavailable.");
  }
  lines.push("", "## Finding details", "");
  if (report.details_omitted) lines.push("Full finding details are retained in the original source and assessment records.", "");
  for (const row of report.findings) {
    lines.push(`### ${escapeReportText(row.finding.id)}`, "", `Document ${escapeReportText(row.finding.document)}. Detector ${escapeReportText(row.finding.detector)}.`,
      `Severity ${escapeReportText(row.finding.severity)}. Location ${escapeReportText(JSON.stringify(row.finding.location))}.`,
      `Candidate ${sentence(row.finding.explanation)}`, `Verdict ${row.assessed ? verdictNames[row.verdict] : "Unassessed"}. ${sentence(row.reason)}`,
      `Recommendation ${sentence(row.recommendation)}`, "");
    for (const quote of row.evidence) lines.push(`- Evidence ${escapeReportText(quote.path)} at bytes ${quote.start} to ${quote.end}, blob ${quote.sha256}, quote ${quote.quote_sha256}.`);
    if (!row.evidence.length) lines.push("Source evidence unavailable for this finding.");
    lines.push("");
  }
  if (report.suppressed_findings.length) {
    lines.push("## Suppressed candidates", "");
    for (const row of report.suppressed_findings)
      lines.push(`- ${escapeReportText(row.finding.id)}. ${escapeReportText(row.finding.document)}. Detector ${escapeReportText(row.finding.detector)}. Severity ${escapeReportText(row.finding.severity)}. ${sentence(row.finding.explanation)} ${sentence(row.reason)}`);
    lines.push("");
  }
  if (report.stale_suppressions.length) {
    lines.push("## Stale suppressions", "", "Review these rules against current source and the retained exception policy.", "");
    for (const row of report.stale_suppressions)
      lines.push(`- ${escapeReportText(row.id)}. ${escapeReportText(row.document ?? "Repository-wide rule")}. ${escapeReportText(row.reason)}.`);
    lines.push("");
  }
  lines.push("## Source records", "");
  if (report.source_verification) lines.push(`- Original source ${escapeReportText(report.source_verification.path)} at ${report.source_verification.sha256}.`);
  if (report.assessment_reference) lines.push(`- Recorded assessment ${escapeReportText(report.assessment_reference.path)} at ${report.assessment_reference.sha256}.`);
  lines.push("");
  if (report.diagnostics_omitted) lines.push(`${report.diagnostics_omitted} additional diagnostic(s) omitted to fit the output bound.`, "");
  if (report.diagnostics.length) {
    lines.push("## Incomplete inputs", "");
    for (const diagnostic of report.diagnostics) lines.push(`- ${sentence(diagnostic)}`);
    lines.push("");
  }
  return lines.join("\n") + "\n";
}
