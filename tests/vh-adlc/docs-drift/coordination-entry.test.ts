import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitAll, populateRepository, put } from "./repository-fixture";
import { settingsFixture } from "./settings-fixture";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts");
function fixture(claimedDocument = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-coordination-entry-"))); roots.push(root);
  const repo = join(root, "source"), artifacts = join(root, "artifacts"); mkdirSync(repo, { mode: 0o700 }); mkdirSync(artifacts, { mode: 0o700 });
  const scanner = readFileSync(join(import.meta.dir, "fixtures/scanner.js"), "utf8").replace("__FIXTURE_CASE__", JSON.stringify("none"))
    .replace("__FIXTURE_ENDPOINT__", JSON.stringify("http://127.0.0.1:1"))
    .replace('visit("docs");', 'for (const root of bindings.scope.roots) visit(root);')
    .replace('roots: ["docs"], exclusions:', 'roots: bindings.scope.roots, exclusions:');
  populateRepository(repo, false, scanner);
  const template = readFileSync(join(import.meta.dir, "../../../internal/testrepo/testdata/docs/conforming.md"), "utf8");
  const feature = template.replace("status: draft", "status: in-progress\nbranch: feat/other-writer").replace("  - src/\n  - config.yml", "  - docs/guide.md");
  put(repo, "plans/active.md", feature);
  put(repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...settingsFixture(), roots: ["docs", "plans"], verification_commands: [], generation_commands: [] }).toString());
  const source = commitAll(repo), path = claimedDocument ? "plans/active.md" : "docs/guide.md", bytes = readFileSync(join(repo, path));
  const replacement = claimedDocument ? feature.replace("Why the fixture exists.", "Changed context.") : "# Updated guide\n";
  const selection = { schema_version: 1, source_commit: source, edits: [{ id: "selected-fix", path, action: "replace", start: 0, end: bytes.length,
    before_sha256: sha256(bytes), replacement_base64: Buffer.from(replacement).toString("base64"), after_mode: "100644" }] };
  const origin = Buffer.from("Synthetic owner coordinates this exact ordinary-document action with the active feature writer; claimed feature documents stay protected.\n");
  writeFileSync(join(artifacts, "owner-request.txt"), origin, { mode: 0o600 });
  const coordination = { schema_version: 1, kind: "docs-drift-coordinated-selection", repository: "fixture/docs", source_commit: source,
    selection_sha256: sha256(canonicalJSON(selection)), overlaps: [{ kind: "feature", owner: "plans/active.md", document: path }],
    origin: { kind: "owner-current-request", artifact: { path: "owner-request.txt", sha256: sha256(origin) } } };
  function save() {
    const selected = canonicalJSON(selection), grant = canonicalJSON(coordination);
    writeFileSync(join(artifacts, "selection.json"), selected, { mode: 0o600 }); writeFileSync(join(artifacts, "coordination.json"), grant, { mode: 0o600 });
    return { selected: sha256(selected), coordination: sha256(grant) };
  }
  put(repo, "docs/guide.md", "Keep the caller overlay\n");
  return { root, repo, artifacts, source, selection, coordination, save };
}
function invoke(f: ReturnType<typeof fixture>, command: string, options: { grant?: boolean; artifact_root?: string; candidate?: string; head?: string; verification?: { path: string; sha256: string } } = {}) {
  const refs = f.save(), args = [process.execPath, entry, command, "--repo", f.repo, "--source", f.source,
    "--artifact-root", options.artifact_root ?? f.artifacts, "--selection", "selection.json", "--selection-sha256", refs.selected];
  if (options.grant !== false) args.push("--coordination", "coordination.json", "--coordination-sha256", refs.coordination);
  if (options.candidate && options.head) args.push("--candidate-repo", options.candidate, "--candidate", options.head);
  if (options.verification) args.push("--verification", options.verification.path, "--verification-sha256", options.verification.sha256);
  const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  expect(result.stdout.length, result.stderr.toString()).toBeGreaterThan(0);
  return { result, report: JSON.parse(result.stdout.toString()) };
}

test.each(["approved", "missing", "changed-actions", "wrong-source", "claimed-feature"])("normal coordination inspection preserves its exact permission boundary: %s", scenario => {
  const f = fixture(scenario === "claimed-feature"), before = captureRepositoryState(f.repo);
  if (scenario === "changed-actions") f.selection.edits[0].replacement_base64 = Buffer.from("Other action\n").toString("base64");
  if (scenario === "wrong-source") f.coordination.source_commit = "f".repeat(40);
  const { result, report } = invoke(f, "check-edits", { grant: scenario !== "missing" });
  expect(result.exitCode, JSON.stringify(report.diagnostics)).toBe(scenario === "approved" ? 0 : 2);
  if (scenario === "approved") expect(report.edit_inspection.complete).toBe(true);
  else if (scenario === "missing" || scenario === "claimed-feature") expect(report.edit_inspection.protection.edits[0].reason)
    .toBe(scenario === "missing" ? "active-feature-overlap" : "claimed-feature");
  else expect(report.diagnostics.map((row: { message: string }) => row.message).join("\n")).toContain("Coordinated selection");
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 90000);

test("normal coordinated preparation and candidate proof reopen only the approved action", () => {
  const f = fixture(), before = captureRepositoryState(f.repo), prepared = invoke(f, "prepare");
  expect(prepared.result.exitCode, JSON.stringify(prepared.report.diagnostics)).toBe(0);
  const candidate = prepared.report.prepared.checkout;
  expect(readFileSync(join(candidate, "docs/guide.md"), "utf8")).toBe("# Updated guide\n");
  const head = commitAll(candidate), verificationRoot = join(f.root, "verification"); mkdirSync(verificationRoot, { mode: 0o700 });
  for (const name of ["selection.json", "coordination.json", "owner-request.txt"]) cpSync(join(f.artifacts, name), join(verificationRoot, name));
  const verified = invoke(f, "verify-candidate", { artifact_root: verificationRoot, candidate, head });
  expect(verified.result.exitCode, JSON.stringify(verified.report.diagnostics)).toBe(0);
  const proof = verified.report.verification.evidence;
  const checked = invoke(f, "check-verification", { artifact_root: verificationRoot, candidate, head, verification: proof });
  expect(checked.result.exitCode, JSON.stringify(checked.report.diagnostics)).toBe(0);
  writeFileSync(join(verificationRoot, "owner-request.txt"), "Changed actual request\n");
  const changed = invoke(f, "check-verification", { artifact_root: verificationRoot, candidate, head, verification: proof });
  expect(changed.result.exitCode).toBe(2); expect(changed.report.diagnostics.map((row: { message: string }) => row.message).join("\n")).toContain("artifact");
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 180000);


test.each(["missing-digest", "missing-path", "loose-publication"])("coordination flags stay paired and outside final publication authority: %s", scenario => {
  const f = fixture(), refs = f.save(), before = captureRepositoryState(f.repo);
  const args = [process.execPath, entry, scenario === "loose-publication" ? "bind-publication" : "check-edits", "--repo", f.repo, "--source", f.source,
    "--artifact-root", f.artifacts, "--selection", "selection.json", "--selection-sha256", refs.selected];
  if (scenario !== "missing-path") args.push("--coordination", "coordination.json");
  if (scenario !== "missing-digest") args.push("--coordination-sha256", refs.coordination);
  const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe", timeout: 45000 });
  expect(result.exitCode).toBe(2);
  const report = JSON.parse(result.stdout.toString());
  expect(report.diagnostics[0].message).toContain(scenario === "loose-publication" ? "unknown bind-publication option" : "path and digest are required together");
  expect(captureRepositoryState(f.repo)).toEqual(before);
});
