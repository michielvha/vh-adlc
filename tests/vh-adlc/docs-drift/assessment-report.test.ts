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

async function fixture(verdict = "confirmed-drift", options: { badRoots?: boolean; feedback?: boolean; localCoverage?: "declared" | "omitted" | "malformed" } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-assessment-report-"))); roots.push(root);
  const repo = join(root, "source"), artifacts = join(root, "artifacts");
  mkdirSync(repo, { mode: 0o700 }); mkdirSync(artifacts, { mode: 0o700 });
  let scanner = readFileSync(join(import.meta.dir, "fixtures/scanner.js"), "utf8")
    .replace("__FIXTURE_CASE__", JSON.stringify("finding")).replace("__FIXTURE_ENDPOINT__", JSON.stringify("http://127.0.0.1:1"));
  if (options.feedback) {
    const suppressed = [{ finding: { id: "suppressed-1", detector: "fixture-feedback", severity: "note", document: "docs/guide.md", location: null,
      explanation: "Synthetic suppressed candidate" }, reason: "Retained historical exception" }];
    const stale = [{ id: "stale-1", reason: "Synthetic stale suppression.", document: "docs/guide.md" }];
    scanner = scanner.replace("suppressed_findings: [], stale_suppressions: []", `suppressed_findings: ${JSON.stringify(suppressed)}, stale_suppressions: ${JSON.stringify(stale)}`);
  }
  let source = populateRepository(repo, false, scanner).commit;
  if (options.badRoots) { put(repo, "AGENTS.md", "Feature documents: ../escape/\n"); source = commitAll(repo); }
  if (options.localCoverage) {
    put(repo, "AGENTS.md", "Feature documents: plans/\nFeature document format: local\n");
    put(repo, "plans/prior.md", "---\nstatus: shipped\nbranch: feat/prior\ncovers: [docs/**]\n---\n# Prior local plan\n");
    if (options.localCoverage !== "omitted") put(repo, "docs/docs-procedure.md", "---\ndocs_drift_local_coverage:\n  dialect: documentation\n  terminal_statuses: "
      + (options.localCoverage === "malformed" ? "shipped" : "[shipped]") + "\n---\n\nSynthetic project-local coverage convention.\n");
    source = commitAll(repo);
  }
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

test.each(["matching", "missing-reference", "wrong-digest", "authority-flag", "caller-artifacts", "near-limit"])("the normal report-findings entry preserves caller state for %s", async fault => {
  const f = await fixture(fault === "near-limit" ? "confirmed-drift" : "unknown");
  if (fault === "near-limit") {
    const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
    const base = api.readAssessmentReport({ ...f, source_verification: f.original.evidence, assessment: retain(f, f.packet) });
    const priorBytes = canonicalJSON({ report: base, markdown: api.renderAssessmentReport(base) }).length;
    f.packet.findings[0].reason = "x".repeat(Math.floor((524288 - priorBytes) / 2) + f.packet.findings[0].reason.length - 2);
  }
  const assessment = retain(f, f.packet), verification = f.original.evidence;
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
  expect(completion.captured!.stdout.length).toBeLessThanOrEqual(524288);
  if (fault === "matching") {
    expect(report.assessment_report).toMatchObject({ complete: true, authority: "none", counts: { unknown: 1 } });
    expect(report.markdown).toContain("Finding details");
  } else {
    expect(report.outcome).toBe("incomplete"); expect(report.diagnostics.length).toBeGreaterThan(0);
    if (fault === "near-limit") {
      expect(report.assessment_report).toMatchObject({ details_omitted: true, source_verification: verification, assessment_reference: assessment });
      expect(report.diagnostics.map((row: { message: string }) => row.message).join("\n")).toContain("exceeds the retained entry bound");
    }
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
  expect(markdown).not.toContain("suppression..");
});

test("an oversized rendered finding report retains bounded diagnostics and original evidence locators", async () => {
  const { readAssessmentReport, renderAssessmentReport } = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  const f = await fixture(); f.packet.findings[0].reason = "<".repeat(200000);
  const assessment = retain(f, f.packet), report = readAssessmentReport({ ...f, source_verification: f.original.evidence, assessment });
  expect(report.complete).toBe(false);
  expect(report).toMatchObject({ details_omitted: true, assessment_reference: assessment, source_verification: f.original.evidence });
  expect(report.counts).toMatchObject({ candidates: 1, assessed: 1, confirmed_drift: 1 });
  const markdown = renderAssessmentReport(report);
  const { assessmentReportOutput } = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  expect(Buffer.byteLength(JSON.stringify(assessmentReportOutput(report)) + "\n")).toBeLessThanOrEqual(524288);
  expect(markdown).toContain("retained"); expect(markdown).not.toContain("No proposed documentation correction");
  expect(sha256(readFileSync(join(f.artifacts, assessment.path)))).toBe(assessment.sha256);
});

test("the emitted report envelope bounds diagnostics after detail omission", async () => {
  const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  const f = await fixture(), report = api.readAssessmentReport({ ...f, source_verification: f.original.evidence, assessment: retain(f, f.packet) });
  const large = { ...structuredClone(report), complete: false, diagnostics: Array.from({ length: 10000 }, (_, i) => `Unavailable input ${i} ${"<".repeat(120)}`) };
  const bounded = api.boundAssessmentReport(large, 524288), emitted = JSON.stringify(api.assessmentReportOutput(bounded)) + "\n";
  expect(Buffer.byteLength(emitted)).toBeLessThanOrEqual(524288);
  expect(bounded.complete).toBe(false); expect(bounded.details_omitted).toBe(true); expect(bounded.diagnostics_omitted).toBeGreaterThan(0);
  expect(bounded.source_verification).toEqual(report.source_verification); expect(bounded.assessment_reference).toEqual(report.assessment_reference);
});

test("unavailable assessment counts stay nullable in JSON and Markdown", async () => {
  const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  const f = await fixture(), report = api.readAssessmentReport({ ...f, source_verification: { ...f.original.evidence, sha256: "0".repeat(64) }, assessment: retain(f, f.packet) });
  for (const count of Object.values(report.counts)) expect(count).toBeNull();
  expect(api.renderAssessmentReport(report)).toContain("Unassessed candidates unavailable");
});

test("the owner summary distinguishes provisional verdicts and ranks confirmed drift first", async () => {
  const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  const f = await fixture(), report = structuredClone(api.readAssessmentReport({ ...f, source_verification: f.original.evidence, assessment: retain(f, f.packet) }));
  const confirmed = report.findings[0];
  report.findings = [{ ...confirmed, assessed: false, verdict: "unknown", finding: { ...confirmed.finding, id: "unassessed", document: "docs/unassessed.md" } },
    { ...confirmed, verdict: "unknown", finding: { ...confirmed.finding, id: "unknown", document: "docs/unknown.md" } }, confirmed];
  const markdown = api.renderAssessmentReport(report), opening = markdown.split("## Finding details")[0];
  expect(markdown).toContain("Caller-recorded verdicts and recommendations remain provisional");
  expect(opening).toContain("Confirmed drift"); expect(opening).toContain("Unknown"); expect(opening).toContain("Unassessed");
  expect(opening.indexOf("docs/guide.md")).toBeLessThan(opening.indexOf("docs/unassessed.md"));
  expect(markdown).toContain(`Severity ${confirmed.finding.severity}`);
  if (confirmed.finding.location === null) expect(markdown).not.toContain("Location null");
  else expect(markdown).toContain("Location");
});

test("unassessed candidates do not count as recorded unknown verdicts", async () => {
  const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  const f = await fixture(); f.packet.findings = [];
  const report = api.readAssessmentReport({ ...f, source_verification: f.original.evidence, assessment: retain(f, f.packet) });
  expect(report.counts).toMatchObject({ unknown: 0, unassessed: 1, assessed: 0 });
  expect(api.renderAssessmentReport(report)).toContain("0 unknown, 1 unassessed");
});

test("bounded report diagnostics preserve Unicode and the final minimal fallback", async () => {
  const api = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  const f = await fixture(), report = structuredClone(api.readAssessmentReport({ ...f, source_verification: f.original.evidence, assessment: retain(f, f.packet) }));
  report.diagnostics = ["x".repeat(255) + "😀" + "<".repeat(5000)];
  const unicode = api.boundAssessmentReport(report, 10000);
  expect(() => canonicalJSON(unicode)).not.toThrow(); expect(api.renderAssessmentReport(unicode)).not.toContain("….");
  expect(unicode.diagnostics[0]).toBe("x".repeat(255) + "😀…"); expect(unicode.diagnostics_omitted).toBe(0);
  const astral = structuredClone(report);
  astral.findings[0].reason = "<".repeat(5000); astral.diagnostics = ["😀".repeat(200)];
  expect(api.boundAssessmentReport(astral, 10000).diagnostics[0]).toBe(astral.diagnostics[0]);
  report.diagnostics = Array.from({ length: 5 }, () => "<".repeat(5000));
  const minimal = api.boundAssessmentReport(report, 4000);
  expect(minimal.diagnostics).toHaveLength(1); expect(minimal.diagnostics_omitted).toBe(5);
  expect(Buffer.byteLength(JSON.stringify(api.assessmentReportOutput(minimal)) + "\n")).toBeLessThanOrEqual(4000);
  expect(api.renderAssessmentReport(minimal).split("## Incomplete inputs")[1]).toContain("5 additional diagnostic");
  expect(() => api.boundAssessmentReport(report, 1)).toThrow("Configured output bound cannot hold");
});


test.each(["declared", "omitted", "malformed"] as const)("finding reports load only source-declared project-local coverage (%s)", async localCoverage => {
  const { readAssessmentReport } = await import("../../../plugins/vh-adlc/scripts/docs-drift/assessment-report");
  const f = await fixture("unknown", { localCoverage }), assessment = retain(f, f.packet);
  put(f.repo, "docs/docs-procedure.md", "Preserve this different current project procedure.\n");
  const before = captureRepositoryState(f.repo);
  const report = readAssessmentReport({ ...f, assessment, source_verification: f.original.evidence });
  expect(report.complete, report.diagnostics.join("\n")).toBe(localCoverage === "declared");
  expect(report.authority).toBe("none"); expect(captureRepositoryState(f.repo)).toEqual(before);
  if (localCoverage === "declared") {
    const { executeOwnedProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/owned-process");
    const source = f.original.evidence!;
    const completion = await executeOwnedProcess({ argv: [process.execPath,
      join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), "report-findings", "--repo", f.repo, "--source", f.source,
      "--artifact-root", f.artifacts, "--source-verification", source.path, "--source-verification-sha256", source.sha256,
      "--assessment", assessment.path, "--assessment-sha256", assessment.sha256], cwd: f.root,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "", TMPDIR: tmpdir() },
      watched_outputs: [], capture: "memory", timeout_ms: 30000, stdout: join(f.artifacts, "local-coverage.stdout"),
      stderr: join(f.artifacts, "local-coverage.stderr"), started: () => {} });
    expect(completion.reaped).toBe(true); expect(completion.timed_out).toBe(false);
    const emitted = JSON.parse(Buffer.from(completion.captured?.stdout ?? []).toString());
    expect(completion.exit_code, JSON.stringify(emitted.diagnostics)).toBe(0);
    expect(emitted.assessment_report.complete).toBe(true); expect(captureRepositoryState(f.repo)).toEqual(before);
  }
});
