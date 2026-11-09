import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { populateRepository, commitAll, git, put } from "./repository-fixture";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { assessSource } from "../../../plugins/vh-adlc/scripts/docs-drift/source-assessment";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

async function fixture(verdict = "confirmed-drift", options: { badRoots?: boolean; feedback?: boolean } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-assessment-report-"))); roots.push(root);
  const repo = join(root, "source"), artifacts = join(root, "artifacts");
  mkdirSync(repo, { mode: 0o700 }); mkdirSync(artifacts, { mode: 0o700 });
  let scanner = readFileSync(join(import.meta.dir, "fixtures/scanner.js"), "utf8")
    .replace("__FIXTURE_CASE__", JSON.stringify("finding")).replace("__FIXTURE_ENDPOINT__", JSON.stringify("http://127.0.0.1:1"));
  if (options.feedback) {
    const suppressed = [{ finding: { id: "suppressed-1", detector: "fixture-feedback", severity: "note", document: "docs/guide.md", location: null,
      explanation: "Synthetic suppressed candidate" }, reason: "Retained historical exception" }];
    const stale = [{ id: "stale-1", reason: "Synthetic stale suppression", document: "docs/guide.md" }];
    scanner = scanner.replace("suppressed_findings: [], stale_suppressions: []", `suppressed_findings: ${JSON.stringify(suppressed)}, stale_suppressions: ${JSON.stringify(stale)}`);
  }
  let source = populateRepository(repo, false, scanner).commit;
  if (options.badRoots) { put(repo, "AGENTS.md", "Feature documents: ../escape/\n"); source = commitAll(repo); }
  const common = { repo, source, artifact_root: artifacts, owner: "fixture-owner", run: "fixture-report" };
  const original = await assessSource(common);
  if (!original.complete || !original.evidence || !original.scan || original.scan.findings.length !== 1) throw Error("Missing complete original scanner fixture");
  const finding = original.scan.findings[0], document = readFileSync(join(repo, finding.document));
  const quote = { path: finding.document, sha256: sha256(document), start: 0, end: document.length, quote_sha256: sha256(document) };
  const packet = { schema_version: 1, kind: "docs-drift-assessment", source_commit: source, source_verification_sha256: original.evidence.sha256,
    findings: [{ id: finding.id, verdict, reason: "Synthetic source-grounded finding decision", recommendation: "Review the bounded documentation correction", evidence: verdict === "unknown" ? [] : [quote] }] };
  return { ...common, root, artifacts, original, finding, packet };
}
function retain(f: Awaited<ReturnType<typeof fixture>>, packet: unknown) {
  const bytes = canonicalJSON(packet), path = "finding-assessment.json";
  writeFileSync(join(f.artifacts, path), bytes, { mode: 0o600 }); return { path, sha256: sha256(bytes) };
}

test.each(["confirmed-drift", "still-accurate", "unknown"])("original-source report records the actual finding verdict %s", async verdict => {
  const { readAssessmentReport, renderAssessmentReport } = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  const f = await fixture(verdict), assessment = retain(f, f.packet);
  put(f.repo, "docs/guide.md", "Preserve this unrelated caller draft\n");
  const before = captureRepositoryState(f.repo), head = git(f.repo, "rev-parse", "HEAD");
  const report = readAssessmentReport({ ...f, source_verification: f.original.evidence, assessment });
  expect(report.complete, report.diagnostics.join("\n")).toBe(true);
  expect(report.authority).toBe("none"); expect(report.findings).toHaveLength(1);
  expect(report.findings[0]).toMatchObject({ finding: { id: f.finding.id, document: f.finding.document }, verdict });
  expect(report.counts).toMatchObject({ candidates: 1, assessed: 1, unknown: verdict === "unknown" ? 1 : 0, unassessed: 0 });
  const markdown = renderAssessmentReport(report);
  expect(markdown).toContain("Documentation drift report"); expect(markdown).toContain(f.finding.explanation);
  expect(markdown).toContain("Review the bounded documentation correction"); expect(markdown).toContain("Finding details");
  expect(captureRepositoryState(f.repo)).toEqual(before); expect(git(f.repo, "rev-parse", "HEAD")).toBe(head);
});

test.each(["missing-row", "unknown-id", "duplicate", "changed-source", "changed-proof", "bad-quote", "missing-evidence", "extra-authority"])("original-source report refuses incomplete or unbound assessment %s", async fault => {
  const { readAssessmentReport } = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  const f = await fixture(), packet = structuredClone(f.packet);
  if (fault === "missing-row") packet.findings = [];
  if (fault === "unknown-id") packet.findings[0].id = "uncollected-finding";
  if (fault === "duplicate") packet.findings.push(packet.findings[0]);
  if (fault === "changed-source") packet.source_commit = "0".repeat(40);
  if (fault === "changed-proof") packet.source_verification_sha256 = "0".repeat(64);
  if (fault === "bad-quote") packet.findings[0].evidence[0].quote_sha256 = "0".repeat(64);
  if (fault === "missing-evidence") packet.findings[0].evidence = [];
  const selected: unknown = fault === "extra-authority" ? { ...packet, approved: true } : packet;
  const report = readAssessmentReport({ ...f, source_verification: f.original.evidence, assessment: retain(f, selected) });
  expect(report.complete).toBe(false); expect(report.authority).toBe("none"); expect(report.diagnostics.length).toBeGreaterThan(0);
  expect(report.counts.candidates).toBe(1);
  expect(report.findings.some(item => item.finding.id === f.finding.id)).toBe(true);
});

test("the report keeps its opening short while retaining every detailed finding", async () => {
  const { readAssessmentReport, renderAssessmentReport } = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  const f = await fixture(), original = readAssessmentReport({ ...f, source_verification: f.original.evidence, assessment: retain(f, f.packet) });
  const report = { ...original, findings: Array.from({ length: 8 }, (_, index) => ({ ...original.findings[0], finding: { ...original.findings[0].finding, id: `finding-${index}` } })),
    counts: { ...original.counts, candidates: 8, assessed: 8, confirmed_drift: 8 } };
  const markdown = renderAssessmentReport(report), opening = markdown.split("## Finding details")[0];
  expect(opening.split("\n").filter(line => line.startsWith("- "))).toHaveLength(5);
  expect(opening).toContain("3 additional items");
  for (let index = 0; index < 8; index++) expect(markdown).toContain(`### finding-${index}`);
});

test.each(["matching", "missing-reference", "wrong-digest", "authority-flag", "caller-artifacts"])("the normal report-findings entry preserves caller state for %s", async fault => {
  const f = await fixture("unknown"), assessment = retain(f, f.packet), verification = f.original.evidence;
  if (!verification) throw Error("Missing source evidence fixture");
  const before = captureRepositoryState(f.repo);
  const { executeOwnedProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/owned-process");
  const environment: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "", TMPDIR: tmpdir() };
  if (process.env.XDG_CACHE_HOME) environment.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME;
  const argv = [process.execPath,
    join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), "report-findings", "--repo", f.repo, "--source", f.source,
    "--artifact-root", f.artifacts, "--source-verification", verification.path, "--source-verification-sha256", verification.sha256,
    "--assessment", assessment.path, "--assessment-sha256", assessment.sha256];
  if (fault === "missing-reference") argv.splice(argv.indexOf("--source-verification"), 2);
  if (fault === "wrong-digest") argv[argv.indexOf("--assessment-sha256") + 1] = "0".repeat(64);
  if (fault === "authority-flag") argv.push("--approved", "true");
  if (fault === "caller-artifacts") argv[argv.indexOf("--artifact-root") + 1] = f.repo;
  const completion = await executeOwnedProcess({ argv, cwd: f.root, env: environment,
    watched_outputs: [], capture: "memory", timeout_ms: 30000, stdout: join(f.artifacts, "report-stdout"), stderr: join(f.artifacts, "report-stderr"), started: () => {} });
  const report = JSON.parse(Buffer.from(completion.captured?.stdout ?? []).toString());
  expect(completion.reaped).toBe(true); expect(completion.timed_out).toBe(false);
  expect(completion.exit_code, JSON.stringify(report.diagnostics)).toBe(fault === "matching" ? 0 : 2);
  expect(report.command).toBe("report-findings");
  if (fault === "matching") {
    expect(report.assessment_report).toMatchObject({ complete: true, authority: "none", counts: { unknown: 1 } });
    expect(report.markdown).toContain("Finding details");
  } else {
    expect(report.outcome).toBe("incomplete"); expect(report.diagnostics.length).toBeGreaterThan(0);
  }
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 60000);


test("a complete scan with incomplete roots remains an incomplete finding report", async () => {
  const { readAssessmentReport } = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  const f = await fixture("confirmed-drift", { badRoots: true });
  const report = readAssessmentReport({ ...f, source_verification: f.original.evidence, assessment: retain(f, f.packet) });
  expect(f.original.complete).toBe(true);
  expect(report.complete).toBe(false); expect(report.collection_complete).toBe(false);
  expect(report.counts.candidates).toBe(1); expect(report.diagnostics.join("\n")).toContain("root");
});

test("unavailable original source retains unknown counts and incomplete status", async () => {
  const { readAssessmentReport, renderAssessmentReport } = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  const f = await fixture(), verification = f.original.evidence;
  if (!verification) throw Error("Missing original source fixture");
  const report = readAssessmentReport({ ...f, source_verification: { ...verification, sha256: "0".repeat(64) }, assessment: retain(f, f.packet) });
  expect(report.complete).toBe(false); expect(report.collection_complete).toBe(false);
  expect(report.counts.candidates).toBeNull(); expect(report.source_verification).toBeNull();
  const markdown = renderAssessmentReport(report);
  expect(markdown).toContain("unavailable"); expect(markdown).not.toContain("No proposed documentation correction");
  expect(markdown).toContain("Selected source");
});


test("the finding report retains suppressed candidates and stale feedback", async () => {
  const { readAssessmentReport, renderAssessmentReport } = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  const f = await fixture("still-accurate", { feedback: true });
  const report = readAssessmentReport({ ...f, source_verification: f.original.evidence, assessment: retain(f, f.packet) });
  expect(report.complete, report.diagnostics.join("\n")).toBe(true);
  expect(report.counts).toMatchObject({ candidates: 1, suppressed: 1, stale_suppressions: 1 });
  expect(report).toMatchObject({ suppressed_findings: [{ reason: "Retained historical exception" }], stale_suppressions: [{ id: "stale-1" }] });
  const markdown = renderAssessmentReport(report);
  expect(markdown).toContain("Retained historical exception"); expect(markdown).toContain("Synthetic stale suppression");
});

test("an oversized rendered finding report retains bounded diagnostics and original evidence locators", async () => {
  const { readAssessmentReport, renderAssessmentReport } = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  const f = await fixture(); f.packet.findings[0].reason = "<".repeat(200000);
  const assessment = retain(f, f.packet), report = readAssessmentReport({ ...f, source_verification: f.original.evidence, assessment });
  expect(report.complete).toBe(false);
  expect(report).toMatchObject({ details_omitted: true, assessment_reference: assessment, source_verification: f.original.evidence });
  expect(report.counts).toMatchObject({ candidates: 1, assessed: 1, confirmed_drift: 1 });
  const markdown = renderAssessmentReport(report);
  expect(canonicalJSON({ report, markdown }).length).toBeLessThan(524288);
  expect(markdown).toContain("retained"); expect(markdown).not.toContain("No proposed documentation correction");
  expect(sha256(readFileSync(join(f.artifacts, assessment.path)))).toBe(assessment.sha256);
});
