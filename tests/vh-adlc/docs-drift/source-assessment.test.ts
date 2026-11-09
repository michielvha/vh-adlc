import { afterAll, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import * as artifacts from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { verifyCandidate } from "../../../plugins/vh-adlc/scripts/docs-drift/candidate-verification";
import { commitAll, git, populateRepository, put } from "./repository-fixture";
import { settingsFixture } from "./settings-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function fixture(scannerCase = "none") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-source-assessment-"))); roots.push(root);
  const repo = join(root, "source"), artifacts = join(root, "artifacts"), candidate = join(root, "candidate");
  mkdirSync(repo, { mode: 0o700 }); mkdirSync(artifacts, { mode: 0o700 });
  const scanner = readFileSync(join(import.meta.dir, "fixtures/scanner.js"), "utf8")
    .replace("__FIXTURE_CASE__", JSON.stringify(scannerCase)).replace("__FIXTURE_ENDPOINT__", JSON.stringify("http://127.0.0.1:1"));
  populateRepository(repo, false, scanner);
  put(repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...settingsFixture(), verification_commands: [["node", "scripts/check.js"]] }).toString());
  put(repo, "scripts/check.js", "if (require('node:fs').readFileSync('docs/guide.md','utf8') !== '# Repaired guide\\n') process.exit(12);\n");
  const source = commitAll(repo);
  return { root, repo, artifacts, candidate, source, artifact_root: artifacts, owner: "fixture-owner", run: "fixture-run" };
}

test("source assessment succeeds before a repair whose baseline check fails", async () => {
  const { assessSource, readSourceAssessmentArtifacts } = await import("../../../plugins/vh-adlc/scripts/docs-drift/source-assessment");
  const f = fixture(), before = captureRepositoryState(f.repo), result = await assessSource(f);
  expect(result.diagnostics).toEqual([]); expect(result.complete).toBe(true); expect(result.authority).toBe("none");
  const baseline = await verifyCandidate({ ...f, candidate_repo: f.repo, candidate: f.source, selection: { schema_version: 1, source_commit: f.source, edits: [] } });
  expect(baseline.complete).toBe(false); expect(baseline.diagnostics).toContain("Configured candidate verification failed");
  const original = readSourceAssessmentArtifacts({ ...f, candidate_repo: f.repo, reference: result.evidence! });
  expect(original.scan?.complete).toBe(true); expect(original.evidence).toEqual(result.evidence);
  expect(sha256(readFileSync(join(f.artifacts, result.evidence!.path)))).toBe(result.evidence!.sha256);
  put(result.scan!.checkout, "docs/guide.md", "# Authorized later preparation\n");
  expect(readSourceAssessmentArtifacts({ ...f, candidate_repo: f.repo, reference: result.evidence! }).complete).toBe(true);
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 60000);

test("source assessment reopens original scan bytes and refuses changed outputs", async () => {
  const { assessSource, readSourceAssessmentArtifacts } = await import("../../../plugins/vh-adlc/scripts/docs-drift/source-assessment");
  const f = fixture(), result = await assessSource(f);
  writeFileSync(join(f.artifacts, result.scan_artifacts!.report.path), "{}");
  expect(() => readSourceAssessmentArtifacts({ ...f, candidate_repo: f.repo, reference: result.evidence! })).toThrow("artifact changed");
});

test("normal source assessment entry retains original evidence without running failing baseline checks", () => {
  const f = fixture(), before = captureRepositoryState(f.repo);
  const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts");
  const outcome = Bun.spawnSync([process.execPath, entry, "assess-source", "--repo", f.repo, "--source", f.source,
    "--artifact-root", f.artifacts], { stdout: "pipe", stderr: "pipe", timeout: 60000 });
  const report = JSON.parse(outcome.stdout.toString());
  expect(outcome.exitCode, JSON.stringify(report.diagnostics)).toBe(0);
  expect(report.source_assessment).toMatchObject({ complete: true, authority: "none", source_commit: f.source });
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 60000);


test("source assessment retention failure preserves its source/store and intended receipt locators", async () => {
  const { assessSource } = await import("../../../plugins/vh-adlc/scripts/docs-drift/source-assessment");
  const f = fixture(), publish = artifacts.publishArtifact;
  const failure = spyOn(artifacts, "publishArtifact").mockImplementation((path, bytes) => {
    if (path.includes("/source-assessment-")) throw Error("fixture source assessment retention failure");
    return publish(path, bytes);
  });
  try {
    const result = await assessSource(f);
    expect(result.complete).toBe(false); expect(result.evidence).toBe(null);
    expect(result.record_path?.startsWith(f.artifacts + "/source-assessment-")).toBe(true);
    expect(result.object_store?.root.startsWith(f.artifacts + "/")).toBe(true);
    expect(result.scan?.record_path.startsWith(f.artifacts + "/")).toBe(true);
    expect(result.diagnostics).toContain("fixture source assessment retention failure");
  } finally { failure.mockRestore(); }
}, 60000);


test("source assessment preserves an incomplete scan and refuses it as publication evidence", async () => {
  const { assessSource, readSourceAssessmentArtifacts } = await import("../../../plugins/vh-adlc/scripts/docs-drift/source-assessment");
  const f = fixture("omit-document"), result = await assessSource(f);
  expect(result.complete).toBe(false); expect(result.scan?.complete).toBe(false);
  expect(result.diagnostics).toContain("Source scan incomplete");
  expect(result.scan?.record_path.startsWith(f.artifacts + "/")).toBe(true);
  expect(() => readSourceAssessmentArtifacts({ ...f, candidate_repo: f.repo, reference: result.evidence! })).toThrow("Complete exact-source assessment required");
}, 60000);
