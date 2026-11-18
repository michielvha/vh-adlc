import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { collectAuditProposalInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/audit-proposal-inputs";
import { loadCommittedSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { put } from "./repository-fixture";
import { assessmentReviewFixture } from "./assessment-review-fixture";
import { evidence } from "./manifest-fixture";
import { captureSyntheticRole, retainSyntheticArtifact } from "./original-publication-fixture";
import { auditReceiptFixture } from "./audit-publication-receipts-fixture";
import { collectWorkerInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-worker";
import { readCollectedAuditProposals } from "../../../plugins/vh-adlc/scripts/docs-drift/audit-proposal-inputs";
import { roleRuntimeDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { collectAssessmentReviewTarget } from "../../../plugins/vh-adlc/scripts/docs-drift/assessment-review";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
let preserveRoots = false;
afterAll(() => { if (preserveRoots) console.error("Preserved failed original audit report roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("final audit reporting uses the original starting context and independently reviewed proposals without publishing", async () => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-report");
    const f = await assessmentReviewFixture(roots); put(f.repo, "docs/guide.md", "Preserve the owner draft\n");
    const before = captureRepositoryState(f.repo);
    const begun = await api.beginAuditReport(f.options);
    expect(begun.complete, JSON.stringify(begun.diagnostics)).toBe(true);
    const target = await collectAssessmentReviewTarget({ ...f.options, worker_capture: f.worker });
    expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
    const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!,
      evidence("original-final-report-reviewer", target.target_sha256!, "NO FINDINGS\n"));
    const invalid = await api.completeAuditReport(begun, { worker_capture: f.worker, reviewer_capture: f.worker });
    expect(invalid.complete).toBe(false); expect(invalid.report?.outcome).toBe("failed");
    expect(() => api.readOriginalAuditReport(invalid)).toThrow("Original completed audit report required");
    const completions = await Promise.allSettled([
      api.completeAuditReport(begun, { worker_capture: f.worker, reviewer_capture: reviewer }),
      api.completeAuditReport(begun, { worker_capture: f.worker, reviewer_capture: reviewer }),
    ]);
    expect(completions[1].status).toBe("rejected");
    if (completions[1].status === "rejected") expect(String(completions[1].reason)).toContain("Audit report run is already completing");
    if (completions[0].status === "rejected") throw completions[0].reason;
    const report = completions[0].value;
    expect(report.complete, JSON.stringify(report.diagnostics)).toBe(true); expect(report.authority).toBe("none");
    expect(report.report).toMatchObject({ run_id: f.options.run, started_at: begun.started_at, source_commit: f.source,
      collection_complete: true, outcome: "new-attention", success: false, published: [], carried_delivery: [] });
    expect(report.report?.attention.some(item => item.item.identity === "edit:guide-fix")).toBe(true);
    expect(report.markdown).toContain("Proposed documentation correction");
    expect(report.counts).toMatchObject({ proposed_edits: 1, required_proposals: 0, collected_proposals: 0, unassessed_proposals: 0 });
    expect(() => api.readOriginalAuditReport(JSON.parse(JSON.stringify(report)))).toThrow("Original completed audit report required");
    expect(report.report).toEqual(api.readOriginalAuditReport(report));
    await expect(api.completeAuditReport(begun, { worker_capture: f.worker, reviewer_capture: reviewer })).rejects.toThrow("Audit report run already completed");
    const later = await api.beginAuditReport({ ...f.options, run: "later-report-run" });
    expect(later.complete, JSON.stringify(later.diagnostics)).toBe(true);
    expect(captureRepositoryState(f.repo)).toEqual(before);
    expect(readFileSync(join(f.repo, "docs/guide.md"), "utf8")).toBe("Preserve the owner draft\n");
    put(f.repo, "docs/guide.md", "A later owner draft\n"); const changed = captureRepositoryState(f.repo);
    const stale = await api.completeAuditReport(later, { worker_capture: f.worker, reviewer_capture: reviewer });
    expect(stale.complete).toBe(false); expect(stale.report?.outcome).toBe("failed");
    expect(stale.diagnostics.join("\n")).toContain("Caller changed");
    expect(stale.report?.collection_complete).toBe(false);
    expect(stale.report?.failures.some(failure => failure.code === "audit-caller-changed")).toBe(true);
    expect(captureRepositoryState(f.repo)).toEqual(changed);
  } catch (error) { preserveRoots = true; throw error; }
}, 245000);

test("copied or incomplete starting contexts cannot become a final report", async () => {
  const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-report");
  await expect(api.completeAuditReport({ complete: true } as never, { worker_capture: { path: "none.json", sha256: "0".repeat(64) }, reviewer_capture: { path: "none.json", sha256: "0".repeat(64) } }))
    .rejects.toThrow("Original complete audit report run required");
});


test("an existing full native proposal stays unassessed and blocks final-report readiness", async () => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-report");
    const f = await assessmentReviewFixture(roots, { proposals: true }), before = captureRepositoryState(f.repo);
    const begun = await api.beginAuditReport(f.options); expect(begun.complete, JSON.stringify(begun.diagnostics)).toBe(true);
    const target = await collectAssessmentReviewTarget({ ...f.options, worker_capture: f.worker });
    expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
    const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!,
      evidence("unassessed-proposal-report-reviewer", target.target_sha256!, "NO FINDINGS\n"));
    const result = await api.completeAuditReport(begun, { worker_capture: f.worker, reviewer_capture: reviewer });
    expect(result.complete).toBe(false); expect(result.report).toMatchObject({ outcome: "failed", success: false, collection_complete: true });
    expect(result.counts).toMatchObject({ required_proposals: 1, collected_proposals: 1, unassessed_proposals: 1 });
    expect(result.report?.attention.some(item => item.item.identity === "proposal:11")).toBe(true);
    expect(result.report?.attention.find(item => item.item.identity === "proposal:11")?.item.disposition).toBe("unknown");
    expect(result.diagnostics.join("\n")).toContain("Existing audit proposals require complete current semantic assessment");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 245000);


test("oversized final reports retain only bounded incomplete metadata and cannot supply an original report", async () => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-report");
    const f = await assessmentReviewFixture(roots, { largeReport: true }), before = captureRepositoryState(f.repo);
    const begun = await api.beginAuditReport(f.options); expect(begun.complete, JSON.stringify(begun.diagnostics)).toBe(true);
    const target = await collectAssessmentReviewTarget({ ...f.options, worker_capture: f.worker });
    expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
    const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!,
      evidence("oversized-final-report-reviewer", target.target_sha256!, "NO FINDINGS\n"));
    const result = await api.completeAuditReport(begun, { worker_capture: f.worker, reviewer_capture: reviewer });
    expect(result).toMatchObject({ complete: false, details_omitted: true, report: null, markdown: null });
    expect(result.diagnostics).toEqual(["Final report exceeds the retained entry bound; inspect the original source and role records"]);
    expect(Buffer.byteLength(JSON.stringify(result) + "\n")).toBeLessThanOrEqual(loadCommittedSettings(f.repo, f.source).settings.reports.max_entry_bytes);
    expect(() => api.readOriginalAuditReport(result)).toThrow("Original completed audit report required");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 245000);

test("a final report refuses a bound that cannot retain even its incomplete summary", async () => {
  const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-report");
  const value = { schema_version: 1, kind: "docs-drift-audit-report", authority: "none", source_commit: "a".repeat(40), complete: false,
    scope_changed: false, details_omitted: false, diagnostics: [], counts: { proposed_edits: null, required_proposals: null, collected_proposals: null,
      assessed_proposals: null, unassessed_proposals: null, unverified_proposals: null, findings: null, review_nits: null }, report: null, markdown: "x".repeat(2000) };
  expect(() => api.boundAuditReport(value as never, 32)).toThrow("Configured output bound cannot hold the incomplete final report");
});


test("independent full proposal assessment triggers fresh result verification before delivery", async () => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-report");
    const f = await assessmentReviewFixture(roots, { proposals: true, proposalAssessments: true }), before = captureRepositoryState(f.repo);
    const begun = await api.beginAuditReport(f.options); expect(begun.complete, JSON.stringify(begun.diagnostics)).toBe(true);
    const target = await collectAssessmentReviewTarget({ ...f.options, worker_capture: f.worker });
    expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
    expect(target.manifest?.proposal_assessment).toMatchObject({ complete: true, counts: { required_proposals: 1, unassessed_proposals: 0 } });
    expect(target.manifest?.proposal_inputs?.[0].inputs_reference).toBeObject();
    const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!,
      evidence("full-proposal-assessment-report-reviewer", target.target_sha256!, "NO FINDINGS\n"));
    const originalInputs = target.manifest?.proposal_inputs?.[0].inputs_reference, originalAssessment = f.proposalAssessment;
    if (!originalInputs || !originalAssessment) throw Error("Missing original proposal review artifact fixture");
    for (const reference of [originalInputs, originalAssessment]) {
      const path = join(f.artifacts, reference.path), bytes = readFileSync(path); writeFileSync(path, "{}", { mode: 0o600 });
      const invalid = await api.completeAuditReport(begun, { worker_capture: f.worker, reviewer_capture: reviewer });
      expect(invalid.complete).toBe(false); expect(invalid.scope_changed).toBe(true);
      expect(invalid.report?.collection_complete).toBe(reference === originalAssessment);
      expect(() => api.readOriginalAuditReport(invalid)).toThrow("Original completed audit report required");
      expect(readFileSync(path, "utf8")).toBe("{}");
      writeFileSync(path, bytes, { mode: 0o600 });
    }
    const result = await api.completeAuditReport(begun, { worker_capture: f.worker, reviewer_capture: reviewer });
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.report).toMatchObject({ collection_complete: true, outcome: "new-attention", published: [], carried_delivery: [] });
    expect(result.counts).toMatchObject({ required_proposals: 1, collected_proposals: 1, assessed_proposals: 1, unassessed_proposals: 0,
      verified_proposals: 1, unverified_proposals: 0 });
    expect(result.proposal_verification).toMatchObject({ complete: true, verified_proposals: 1 });
    expect(result.proposal_verification?.proposals[0]).toMatchObject({ number: 11, outcome: "verified" });
    expect(result.proposal_verification?.proposals[0].verification_reference?.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.report?.attention.find(item => item.item.identity === "proposal:11")?.item.reason).toContain("current result verification passed");
    expect(result.markdown).toContain("Proposal assessments independently reviewed");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 245000);

test("final report distinguishes eligible historical receipts from unverified current results", async () => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-report"), f = await auditReceiptFixture(roots);
    const current = await collectWorkerInputs(f.options), inputs = await collectAuditProposalInputs(f.options);
    if (!current.complete || !current.worker_input_sha256 || !current.facts?.runtime || !current.source_verification?.evidence || !inputs.complete)
      throw Error("Complete original source and receipt fixture required");
    const assessment = retainSyntheticArtifact(f.artifacts, "receipt-report-finding-assessment.json", canonicalJSON({ schema_version: 1,
      kind: "docs-drift-assessment", source_commit: f.source, source_verification_sha256: current.source_verification.evidence.sha256,
      findings: (current.source_verification.scan?.findings ?? []).map(finding => ({ id: finding.id, verdict: "unknown",
        reason: "Synthetic current-source uncertainty", recommendation: "Inspect this source", evidence: [] })) }));
    const proposalAssessment = retainSyntheticArtifact(f.artifacts, "receipt-report-proposal-assessment.json", canonicalJSON({ schema_version: 1,
      kind: "docs-drift-proposal-assessment", source_commit: f.source, inputs_sha256: inputs.inputs_sha256,
      proposals: readCollectedAuditProposals(inputs).map(proposal => ({ number: proposal.number, binding_sha256: proposal.binding_sha256,
        hunks: proposal.hunks.map(hunk => ({ id: hunk.id, verdict: "unknown", reason: "Current result still needs verification",
          recommendation: "Verify this full proposal before carrying delivery", evidence: [] })) })) }));
    const worker = captureSyntheticRole(f.artifacts, f.source, "worker", roleRuntimeDigest(current.facts.runtime, "worker"),
      evidence("receipt-report-worker", current.worker_input_sha256, canonicalJSON({ input_sha256: current.worker_input_sha256,
        edits: structuredClone(f.selection.edits), publication: null, assessment, proposal_assessment: proposalAssessment }).toString()));
    const begun = await api.beginAuditReport(f.options); expect(begun.complete, JSON.stringify(begun.diagnostics)).toBe(true);
    const target = await collectAssessmentReviewTarget({ ...f.options, worker_capture: worker });
    if (!target.complete || !target.reviewer_runtime_sha256 || !target.target_sha256) throw Error("Complete original receipt-report target required");
    const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256,
      evidence("receipt-report-reviewer", target.target_sha256, "NO FINDINGS\n"));
    const before = captureRepositoryState(f.repo), result = await api.completeAuditReport(begun, { worker_capture: worker, reviewer_capture: reviewer });
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.counts).toMatchObject({ required_proposals: 2, assessed_proposals: 2, unassessed_proposals: 0, unverified_proposals: 2, eligible_publications: 1 });
    expect(result.publication_receipts?.reviewed_proposals).toBe(1);
    expect(result.report).toMatchObject({ collection_complete: true, success: false, published: [], carried_delivery: [] });
    expect(result.report?.attention.find(row => row.item.identity === "proposal:11")?.item.rule).toMatchObject({ verification: "unverified",
      delivery: "unverified", publication: { eligibility: "reviewed" } });
    expect(result.report?.attention.find(row => row.item.identity === "proposal:11")?.item.reason).toContain("historical shared receipt is eligible");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 245000);


test("a caller changed during completion has a distinct failure and clears collection readiness", async () => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-report");
    const f = await assessmentReviewFixture(roots, { proposals: true });
    const begun = await api.beginAuditReport(f.options); expect(begun.complete, JSON.stringify(begun.diagnostics)).toBe(true);
    const target = await collectAssessmentReviewTarget({ ...f.options, worker_capture: f.worker });
    expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
    const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!,
      evidence("late-caller-report-reviewer", target.target_sha256!, "NO FINDINGS\n"));
    const rows = () => readFileSync(f.native.trace, "utf8").trim().split("\n").length;
    const previous = rows(), current = await collectAuditProposalInputs(f.options); expect(current.complete).toBe(true);
    const reads = rows() - previous; expect(reads).toBeGreaterThan(0);
    const executable = join(f.root, "native-bin/gh"), original = join(f.root, "native-bin/gh-original"), counter = join(f.root, "late-caller-reads");
    copyFileSync(executable, original);
    writeFileSync(executable, `#!${process.execPath}
const fs = require("node:fs"), path = ${JSON.stringify(counter)};
const count = fs.existsSync(path) ? Number(fs.readFileSync(path, "utf8")) + 1 : 1; fs.writeFileSync(path, String(count));
const result = Bun.spawnSync([${JSON.stringify(process.execPath)}, ${JSON.stringify(original)}, ...process.argv.slice(2)], { env: process.env, stdout: "inherit", stderr: "inherit" });
if (count === ${reads + 1}) fs.writeFileSync(${JSON.stringify(join(f.repo, "docs/guide.md"))}, "Changed during completion\\n");
process.exit(result.exitCode);
`, { mode: 0o700 });
    const result = await api.completeAuditReport(begun, { worker_capture: f.worker, reviewer_capture: reviewer });
    expect(result.complete).toBe(false); expect(result.report?.collection_complete).toBe(false);
    expect(result.report?.failures.some(failure => failure.code === "audit-caller-changed" && failure.message.includes("Caller changed"))).toBe(true);
    expect(result.report?.failures.filter(failure => failure.message.includes("Caller changed")).some(failure => failure.code === "audit-proposal-unassessed")).toBe(false);
    expect(readFileSync(join(f.repo, "docs/guide.md"), "utf8")).toBe("Changed during completion\n");
  } catch (error) { preserveRoots = true; throw error; }
}, 245000);


test("an independently reviewed mixed proposal routes to resolution and retains every hunk recommendation", async () => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-report");
    const f = await assessmentReviewFixture(roots, { proposals: true, proposalAssessments: true, extraProposalHunk: true,
      proposalVerdicts: ["supported", "fixed-differently"] }), before = captureRepositoryState(f.repo);
    const begun = await api.beginAuditReport(f.options); expect(begun.complete, JSON.stringify(begun.diagnostics)).toBe(true);
    const target = await collectAssessmentReviewTarget({ ...f.options, worker_capture: f.worker });
    expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
    const judgment = target.manifest?.proposal_assessment?.proposals[0]; expect(judgment?.assessment).toBe("mixed");
    if (!judgment) throw Error("Missing original mixed proposal assessment fixture");
    expect(judgment.hunks.length).toBeGreaterThanOrEqual(2);
    const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!,
      evidence("mixed-proposal-report-reviewer", target.target_sha256!, "NO FINDINGS\n"));
    const result = await api.completeAuditReport(begun, { worker_capture: f.worker, reviewer_capture: reviewer });
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
    const item = result.report?.attention.find(entry => entry.item.identity === "proposal:11")?.item;
    expect(item?.disposition).toBe("needs-resolution"); expect(item?.reason).toContain("assessment is mixed");
    expect(item?.owner_action).toContain("every hunk recommendation");
    for (const hunk of judgment.hunks) expect(result.markdown).toContain(hunk.recommendation);
    expect(result.counts).toMatchObject({ assessed_proposals: 1, unassessed_proposals: 0, unverified_proposals: 1 });
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 245000);


test.each(["matching", "mismatch", "legacy-overlap", "proposal-changed", "receipt-disappeared", "review-changed", "proof-changed"])("current checks carry only the exact eligible result and preserve conflicts for %s", async fault => {
  try {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/audit-report"), f = await auditReceiptFixture(roots, { single: fault !== "legacy-overlap", currentResult: fault !== "mismatch" });
    const current = await collectWorkerInputs(f.options), inputs = await collectAuditProposalInputs(f.options);
    if (!current.complete || !current.worker_input_sha256 || !current.facts?.runtime || !current.source_verification?.evidence || !inputs.complete)
      throw Error("Complete original source and receipt fixture required");
    const assessment = retainSyntheticArtifact(f.artifacts, "receipt-report-finding-assessment.json", canonicalJSON({ schema_version: 1,
      kind: "docs-drift-assessment", source_commit: f.source, source_verification_sha256: current.source_verification.evidence.sha256,
      findings: (current.source_verification.scan?.findings ?? []).map(finding => ({ id: finding.id, verdict: "unknown",
        reason: "Synthetic current-source uncertainty", recommendation: "Inspect this source", evidence: [] })) }));
    const quoteBytes = readFileSync(join(f.repo, "docs/guide.md")), quote = { path: "docs/guide.md", sha256: sha256(quoteBytes),
      start: 0, end: quoteBytes.length, quote_sha256: sha256(quoteBytes) };
    const proposalAssessment = retainSyntheticArtifact(f.artifacts, "receipt-report-proposal-assessment.json", canonicalJSON({ schema_version: 1,
      kind: "docs-drift-proposal-assessment", source_commit: f.source, inputs_sha256: inputs.inputs_sha256,
      proposals: readCollectedAuditProposals(inputs).map(proposal => ({ number: proposal.number, binding_sha256: proposal.binding_sha256,
        hunks: proposal.hunks.map(hunk => ({ id: hunk.id, verdict: "supported", reason: "Full original proposal is supported by the current source",
          recommendation: "Verify this full proposal before carrying delivery", evidence: [quote] })) })) }));
    const worker = captureSyntheticRole(f.artifacts, f.source, "worker", roleRuntimeDigest(current.facts.runtime, "worker"),
      evidence("receipt-report-worker", current.worker_input_sha256, canonicalJSON({ input_sha256: current.worker_input_sha256,
        edits: structuredClone(f.selection.edits), publication: null, assessment, proposal_assessment: proposalAssessment }).toString()));
    const begun = await api.beginAuditReport(f.options); expect(begun.complete, JSON.stringify(begun.diagnostics)).toBe(true);
    const target = await collectAssessmentReviewTarget({ ...f.options, worker_capture: worker });
    if (!target.complete || !target.reviewer_runtime_sha256 || !target.target_sha256) throw Error("Complete original receipt-report target required");
    const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256,
      evidence("receipt-report-reviewer", target.target_sha256, "NO FINDINGS\n"));
    const lateChange = ["proposal-changed", "receipt-disappeared", "review-changed", "proof-changed"].includes(fault);
    if (lateChange) {
      const executable = join(f.root, "native-bin/gh"), original = join(f.root, "native-bin/gh-original");
      copyFileSync(executable, original);
      writeFileSync(executable, `#!${process.execPath}
const fs = require("node:fs"), path = require("node:path"), root = ${JSON.stringify(f.artifacts)}, fault = ${JSON.stringify(fault)};
const proof = fs.readdirSync(root).find(name => name.startsWith("current-proposal-verification-")), marker = path.join(root, "late-proof-change");
if (proof && !fs.existsSync(marker)) {
  fs.writeFileSync(marker, fault);
  if (fault === "proposal-changed") {
    const file = ${JSON.stringify(f.inventoryFile)}, inventory = JSON.parse(fs.readFileSync(file));
    inventory[0].body = "Preserve the changed native proposal after current checks"; fs.writeFileSync(file, JSON.stringify(inventory));
  } else if (fault === "receipt-disappeared") fs.writeFileSync(${JSON.stringify(f.receipt.faultsPath)}, JSON.stringify({ missing_ref: true }));
  else if (fault === "review-changed") fs.writeFileSync(path.join(root, ${JSON.stringify(reviewer.path)}), "Preserve changed independent review after current checks\\n");
  else {
    const record = JSON.parse(fs.readFileSync(path.join(root, proof))), reference = record.proposals[0].verification_reference;
    fs.writeFileSync(path.join(root, reference.path), "Preserve changed current verification proof\\n");
  }
}
const result = Bun.spawnSync([${JSON.stringify(process.execPath)}, ${JSON.stringify(original)}, ...process.argv.slice(2)], { env: process.env, stdout: "inherit", stderr: "inherit" });
process.exit(result.exitCode);
`, { mode: 0o700 });
    }
    const before = captureRepositoryState(f.repo), result = await api.completeAuditReport(begun, { worker_capture: worker, reviewer_capture: reviewer });
    if (lateChange) {
      expect(result.complete).toBe(false); expect(result.scope_changed).toBe(true);
      expect(result.report).toMatchObject({ outcome: "failed", success: false, carried_delivery: [] });
      expect(result.counts).toMatchObject({ verified_proposals: 0, unverified_proposals: 1 });
      expect(result.proposal_verification).toMatchObject({ complete: false, verified_proposals: 0, evidence: null });
      expect(result.proposal_verification?.proposals[0]).toMatchObject({ outcome: "incomplete", verification_reference: null, corrections: [] });
      expect(result.report?.attention.find(row => row.item.identity === "proposal:11")?.item.rule).toMatchObject({ verification: "unverified" });
      expect(result.report?.attention.some(row => row.item.identity === "edit:guide-fix")).toBe(true);
      expect(captureRepositoryState(f.repo)).toEqual(before);
      return;
    }
    expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
    const expected = fault === "legacy-overlap" ? 2 : 1;
    expect(result.counts).toMatchObject({ required_proposals: expected, assessed_proposals: expected, unassessed_proposals: 0,
      verified_proposals: expected, unverified_proposals: 0, eligible_publications: 1 });
    expect(result.proposal_verification?.proposals.every(row => row.outcome === "verified")).toBe(true);
    expect(result.report?.published).toEqual([]);
    if (fault === "matching") {
      expect(result.report).toMatchObject({ outcome: "carried-delivery", success: true, attention: [], pending_corrections: [], blocked_corrections: [] });
      expect(result.report?.carried_delivery).toHaveLength(1);
      expect(result.report?.carried_delivery[0].locator).toBe("https://github.com/fixture/docs/pull/11");
      expect(result.markdown).toContain("https://github.com/fixture/docs/pull/11");
      const verificationLine = result.markdown?.split("## Current proposal verification\n\n")[1]?.split("\n")[0];
      expect(verificationLine).toBeString();
      expect(verificationLine).toBe(verificationLine?.trimEnd());
    } else {
      expect(result.report).toMatchObject({ outcome: "new-attention", success: false, carried_delivery: [], pending_corrections: [] });
      expect(result.report?.attention.find(row => row.item.identity === "proposal:" + (fault === "legacy-overlap" ? 12 : 11))).toBeObject();
      expect(result.report?.blocked_corrections.length).toBeGreaterThan(0);
      if (fault === "legacy-overlap") expect(result.report?.attention.find(row => row.item.identity === "proposal:11")?.item.reason)
        .toContain("https://github.com/fixture/docs/pull/12");
      expect(result.report?.attention.some(row => row.item.identity === "edit:guide-fix")).toBe(true);
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserveRoots = true; throw error; }
}, 245000);
