import { afterAll, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { commitAll, git, populateRepository, put } from "./repository-fixture";
import * as artifacts from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { settingsFixture } from "./settings-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function fixture(scenario: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-candidate-verification-"))); roots.push(root);
  const repo = join(root, "source"), candidate = join(root, "candidate"), artifacts = join(root, "artifacts");
  mkdirSync(repo, { mode: 0o700 }); mkdirSync(artifacts, { mode: 0o700 });
  const scanner = readFileSync(join(import.meta.dir, "fixtures/scanner.js"), "utf8")
    .replace("__FIXTURE_CASE__", JSON.stringify(scenario === "scanner-gap" ? "omit-document" : "none"))
    .replace("__FIXTURE_ENDPOINT__", JSON.stringify("http://127.0.0.1:1"));
  populateRepository(repo, false, scanner);
  const commands = scenario === "no-commands" ? [] : [["node", "scripts/check.js"]];
  const generation = scenario.startsWith("generation-") ? [["node", "scripts/generate.js"]] : [];
  put(repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...settingsFixture(), verification_commands: commands, generation_commands: generation }).toString());
  if (generation.length) put(repo, "scripts/generate.js", scenario === "generation-failed" ? "process.exit(8);\n"
    : scenario === "generation-mutates" ? "require('node:fs').appendFileSync('docs/guide.md', 'Uncommitted generated difference\\n');\n"
    : "if (['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','ANTHROPIC_API_KEY','SSH_AUTH_SOCK'].some(key => process.env[key])) process.exit(13);\n"
      + "require('node:fs').writeFileSync('docs/guide.md', '# Current guide\\n'); console.log('regenerated exact committed output');\n");
  const checks = {
    passed: `if (require('node:fs').readFileSync('docs/guide.md', 'utf8') !== '# Current guide\\n') process.exit(12);\n`
      + `if (['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','ANTHROPIC_API_KEY','SSH_AUTH_SOCK'].some(key => process.env[key])) process.exit(13);\nconsole.log('verified committed guide');\n`,
    failed: "process.exit(7);\n",
    timeout: "setInterval(() => {}, 1000);\n",
    "mutate-file": "require('node:fs').appendFileSync('docs/guide.md', 'Unexpected write\\n');\n",
    "mutate-index": "require('node:child_process').execFileSync('git', ['update-index','--assume-unchanged','docs/guide.md']);\n",
    "mutate-ref": "require('node:child_process').execFileSync('git', ['update-ref','refs/heads/unrequested','HEAD']);\n",
    "mutate-config": "require('node:child_process').execFileSync('git', ['config','fixture.unrequested','true']);\n",
  };
  put(repo, "scripts/check.js", checks[scenario as keyof typeof checks] ?? checks.passed);
  const source = commitAll(repo);
  git(root, "clone", "--no-local", repo, candidate);
  put(candidate, "docs/guide.md", "# Current guide\n"); const head = commitAll(candidate);
  const selection = canonicalJSON({ schema_version: 1, source_commit: source, edits: [{ id: "guide-fix", path: "docs/guide.md", action: "replace",
    start: 0, end: Buffer.byteLength("# Guide\n"), before_sha256: sha256(Buffer.from("# Guide\n")),
    replacement_base64: Buffer.from("# Current guide\n").toString("base64"), after_mode: "100644" }] });
  writeFileSync(join(artifacts, "selection.json"), selection, { mode: 0o600 });
  put(repo, "docs/guide.md", "Preserve original caller overlay\n"); put(candidate, "docs/guide.md", "Preserve candidate caller overlay\n");
  return { root, repo, candidate, artifacts, source, head, selection };
}

test.each(["passed", "failed", "mutate-file", "mutate-index", "mutate-ref", "mutate-config", "no-commands", "scanner-gap"])("committed-candidate verification %s", async scenario => {
  const f = fixture(scenario), before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
  const { verifyCandidate } = await import("../../../plugins/vh-adlc/scripts/docs-drift/candidate-verification");
  const verification = await verifyCandidate({ repo: f.repo, source: f.source, candidate_repo: f.candidate, candidate: f.head,
    artifact_root: f.artifacts, selection: JSON.parse(f.selection.toString()), owner: "fixture-owner", run: "fixture-verification" });
  const report = { verification }, success = ["passed", "no-commands"].includes(scenario);
  expect(verification.complete).toBe(success);
  expect(verification.authority).toBe("none");
  expect(verification.candidate_commit).toBe(f.head);
  if (scenario === "failed") expect(report.verification.diagnostics).toContain("Configured candidate verification failed");
  if (scenario.startsWith("mutate-")) expect(report.verification.diagnostics).toContain("Configured candidate verification changed its source or Git state");
  if (scenario === "scanner-gap") expect(report.verification.diagnostics).toContain("Candidate scan incomplete");
  if (success) {
    const retained = report.verification.evidence;
    if (!retained) throw Error("Successful verification evidence required");
    expect(sha256(readFileSync(join(f.artifacts, retained.path)))).toBe(retained.sha256);
    expect(report.verification.commands).toHaveLength(scenario === "no-commands" ? 0 : 1);
    if (scenario === "passed") {
      const command = report.verification.commands[0];
      expect(command.process?.exit_code).toBe(0);
      expect(readFileSync(join(f.artifacts, command.stdout.path), "utf8")).toContain("verified committed guide");
    }
  }
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
});


test("candidate verification retains timed-out original completion and reaps its owned group", async () => {
  const { verifyCandidate } = await import("../../../plugins/vh-adlc/scripts/docs-drift/candidate-verification");
  const f = fixture("timeout"), result = await verifyCandidate({ repo: f.repo, source: f.source, candidate_repo: f.candidate, candidate: f.head,
    selection: JSON.parse(f.selection.toString()), artifact_root: f.artifacts, owner: "fixture-owner", run: "fixture-run", timeout_ms: 500 });
  expect(result.complete).toBe(false);
  expect(result.commands).toHaveLength(1);
  expect(result.commands[0].process?.timed_out).toBe(true);
  expect(result.commands[0].process?.reaped).toBe(true);
  const completion = result.commands[0].completion!;
  const bytes = readFileSync(join(f.artifacts, completion.path));
  expect(sha256(bytes)).toBe(completion.sha256);
  expect(JSON.parse(bytes.toString()).timed_out).toBe(true);
});

test("candidate verification keeps its selected input immutable during asynchronous collection", async () => {
  const { verifyCandidate } = await import("../../../plugins/vh-adlc/scripts/docs-drift/candidate-verification");
  const f = fixture("passed"), options = { repo: f.repo, source: f.source, candidate_repo: f.candidate, candidate: f.head,
    selection: JSON.parse(f.selection.toString()), artifact_root: f.artifacts, owner: "fixture-owner", run: "fixture-run" };
  const pending = verifyCandidate(options);
  options.candidate = "0".repeat(40); options.candidate_repo = "/unavailable"; options.selection.edits.length = 0;
  const result = await pending;
  expect(result.complete).toBe(true);
  expect(result.candidate_commit).toBe(f.head);
  expect(result.commands).toHaveLength(1);
});

test.each(["matching", "scan-report", "scan-process", "scan-start", "scan-bindings", "check-stdout", "check-process", "dirty-owned-copy", "changed-candidate", "incomplete-proof", "wrong-diff"])("original candidate verification evidence %s", async scenario => {
  const { verifyCandidate } = await import("../../../plugins/vh-adlc/scripts/docs-drift/candidate-verification");
  const f = fixture("passed"), options = { repo: f.repo, source: f.source, candidate_repo: f.candidate, candidate: f.head,
    selection: JSON.parse(f.selection.toString()), artifact_root: f.artifacts, owner: "fixture-owner", run: "fixture-run" };
  const result = await verifyCandidate(options);
  expect(result.complete).toBe(true);
  const proof = result.evidence!, bytes = readFileSync(join(f.artifacts, proof.path)), body = JSON.parse(bytes.toString());
  const scanRoot = join(body.scan.checkout, "..");
  const targets: Record<string, string> = { "scan-report": body.scan.output_path, "scan-process": join(scanRoot, "process-result.json"),
    "scan-start": join(scanRoot, "process-start.json"), "scan-bindings": join(scanRoot, "bindings.json"), "check-stdout": join(f.artifacts, body.commands[0].stdout.path),
    "check-process": join(f.artifacts, body.commands[0].completion.path) };
  if (targets[scenario]) writeFileSync(targets[scenario], "Changed original evidence\n", { mode: 0o600 });
  if (scenario === "dirty-owned-copy") put(body.scan.checkout, "docs/guide.md", "Later edited proof checkout\n");
  if (scenario === "changed-candidate") options.candidate = f.source;
  if (["incomplete-proof", "wrong-diff"].includes(scenario)) {
    if (scenario === "incomplete-proof") body.complete = false;
    else body.inspection.diff_sha256 = "0".repeat(64);
    const changed = canonicalJSON(body); writeFileSync(join(f.artifacts, proof.path), changed, { mode: 0o600 }); proof.sha256 = sha256(changed);
  }
  const { readCandidateVerificationArtifacts } = await import("../../../plugins/vh-adlc/scripts/docs-drift/verification-evidence");
  if (scenario === "matching") {
    const checked = readCandidateVerificationArtifacts({ ...options, reference: proof });
    expect(checked.complete).toBe(true);
    expect(checked.candidate_commit).toBe(f.head);
    expect(checked.authority).toBe("none");
  } else expect(() => readCandidateVerificationArtifacts({ ...options, reference: proof })).toThrow();
});

test("logical verification survives index refresh and garbage collection, with old proof handed off intact", async () => {
  const { verifyCandidate } = await import("../../../plugins/vh-adlc/scripts/docs-drift/candidate-verification");
  const { readCandidateVerificationArtifacts } = await import("../../../plugins/vh-adlc/scripts/docs-drift/verification-evidence");
  const f = fixture("passed"), options = { repo: f.repo, source: f.source, candidate_repo: f.candidate, candidate: f.head,
    selection: JSON.parse(f.selection.toString()), artifact_root: f.artifacts, owner: "fixture-owner", run: "fixture-run" };
  const result = await verifyCandidate(options);
  expect(result.complete).toBe(true);
  expect(result.schema_version).toBe(2);
  const proof = result.evidence!, bytes = readFileSync(join(f.artifacts, proof.path));
  git(result.scan!.checkout, "update-index", "--refresh");
  git(result.scan!.checkout, "gc", "--prune=never");
  expect(readCandidateVerificationArtifacts({ ...options, reference: proof }).complete).toBe(true);
  const old = canonicalJSON({ ...JSON.parse(bytes.toString()), schema_version: 1 });
  const path = "original-version-one-verification.json";
  writeFileSync(join(f.artifacts, path), old, { mode: 0o600 });
  expect(() => readCandidateVerificationArtifacts({ ...options, reference: { path, sha256: sha256(old) } }))
    .toThrow("version-one physical snapshot proof requires its original implementation");
  expect(readFileSync(join(f.artifacts, path)).equals(old)).toBe(true);
  expect(readFileSync(join(f.artifacts, proof.path)).equals(bytes)).toBe(true);
});

test("failed verification evidence retention preserves owned resource locators and incomplete status", async () => {
  const { verifyCandidate } = await import("../../../plugins/vh-adlc/scripts/docs-drift/candidate-verification");
  const f = fixture("passed"), publish = artifacts.publishArtifact;
  const failure = spyOn(artifacts, "publishArtifact").mockImplementation((path, bytes) => {
    if (path.includes("/candidate-verification-")) throw Error("fixture retained-evidence failure");
    return publish(path, bytes);
  });
  try {
    const result = await verifyCandidate({ repo: f.repo, source: f.source, candidate_repo: f.candidate, candidate: f.head,
      selection: JSON.parse(f.selection.toString()), artifact_root: f.artifacts, owner: "fixture-owner", run: "fixture-run" });
    expect(result.complete).toBe(false);
    expect(result.diagnostics).toContain("fixture retained-evidence failure");
    expect(result.scan?.checkout.startsWith(f.artifacts + "/")).toBe(true);
    expect(result.inspection?.object_store?.root.startsWith(f.artifacts + "/")).toBe(true);
    expect(result.evidence).toBe(null);
    expect(result.record_path?.startsWith(f.artifacts + "/candidate-verification-")).toBe(true);
  } finally { failure.mockRestore(); }
});


test("checking original verification reuses the retained store without allocating another resource", async () => {
  const { verifyCandidate } = await import("../../../plugins/vh-adlc/scripts/docs-drift/candidate-verification");
  const { readCandidateVerificationArtifacts } = await import("../../../plugins/vh-adlc/scripts/docs-drift/verification-evidence");
  const f = fixture("passed"), options = { repo: f.repo, source: f.source, candidate_repo: f.candidate, candidate: f.head,
    selection: JSON.parse(f.selection.toString()), artifact_root: f.artifacts, owner: "fixture-owner", run: "fixture-run" };
  const result = await verifyCandidate(options), before = readdirSync(f.artifacts).sort();
  expect(readCandidateVerificationArtifacts({ ...options, reference: result.evidence }).complete).toBe(true);
  expect(readdirSync(f.artifacts).sort()).toEqual(before);
});

test.each(["generation-passed", "generation-failed", "generation-mutates"])("declared generation is observed before candidate verification: %s", async scenario => {
  const { verifyCandidate } = await import("../../../plugins/vh-adlc/scripts/docs-drift/candidate-verification");
  const { readCandidateVerificationArtifacts } = await import("../../../plugins/vh-adlc/scripts/docs-drift/verification-evidence");
  const f = fixture(scenario), before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
  const options = { repo: f.repo, source: f.source, candidate_repo: f.candidate, candidate: f.head,
    selection: JSON.parse(f.selection.toString()), artifact_root: f.artifacts, owner: "fixture-owner", run: "fixture-generation", timeout_ms: 15000 };
  const result = await verifyCandidate(options);
  const passed = scenario === "generation-passed";
  expect(result.complete, JSON.stringify(result.diagnostics)).toBe(passed);
  expect(result.commands[0]?.argv).toEqual(["node", "scripts/generate.js"]);
  if (passed) {
    expect(result.commands.map(command => command.argv)).toEqual([["node", "scripts/generate.js"], ["node", "scripts/check.js"]]);
    expect(readFileSync(join(f.artifacts, result.commands[0].stdout!.path), "utf8")).toContain("regenerated exact committed output");
    expect(readCandidateVerificationArtifacts({ ...options, reference: result.evidence }).complete).toBe(true);
    const payload = JSON.parse(readFileSync(result.record_path!, "utf8"));
    payload.commands[0].argv = ["node", "scripts/unapproved-generator.js"];
    const changedVector = canonicalJSON(payload); writeFileSync(result.record_path!, changedVector);
    expect(() => readCandidateVerificationArtifacts({ ...options, reference: { ...result.evidence!, sha256: sha256(changedVector) } }))
      .toThrow("configured generation vector changed");
    payload.commands[0].argv = ["node", "scripts/generate.js"];
    payload.commands[1].argv = ["node", "scripts/unapproved-check.js"];
    const changedVerification = canonicalJSON(payload); writeFileSync(result.record_path!, changedVerification);
    expect(() => readCandidateVerificationArtifacts({ ...options, reference: { ...result.evidence!, sha256: sha256(changedVerification) } }))
      .toThrow("configured verification vector changed");
    payload.commands[1].argv = ["node", "scripts/check.js"];
    const start = payload.commands[0].start; payload.commands[0].start = null;
    const missingGenerationStart = canonicalJSON(payload); writeFileSync(result.record_path!, missingGenerationStart);
    expect(() => readCandidateVerificationArtifacts({ ...options, reference: { ...result.evidence!, sha256: sha256(missingGenerationStart) } }))
      .toThrow("original generation start and completion required");
    payload.commands[0].start = start;
    payload.commands = payload.commands.slice(1);
    const bytes = canonicalJSON(payload); writeFileSync(result.record_path!, bytes);
    expect(() => readCandidateVerificationArtifacts({ ...options, reference: { ...result.evidence!, sha256: sha256(bytes) } }))
      .toThrow("complete configured generation and verification required");
  } else {
    expect(result.commands).toHaveLength(1);
    expect(result.diagnostics).toContain(scenario === "generation-failed" ? "Configured candidate generation failed"
      : "Configured candidate generation changed its source or Git state");
  }
  expect(captureRepositoryState(f.repo)).toEqual(before); expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
}, 90000);
