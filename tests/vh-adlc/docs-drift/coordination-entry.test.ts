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
import { readCoordinatedSelection } from "../../../plugins/vh-adlc/scripts/docs-drift/coordination";
import { inspectPreparation, prepareEdits } from "../../../plugins/vh-adlc/scripts/docs-drift/preparation";
import { verifyCandidate } from "../../../plugins/vh-adlc/scripts/docs-drift/candidate-verification";
import { readCandidateVerificationArtifacts } from "../../../plugins/vh-adlc/scripts/docs-drift/verification-evidence";
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
function coordinated(f: ReturnType<typeof fixture>, artifact_root = f.artifacts) {
  const refs = f.save();
  return { coordinated: readCoordinatedSelection({ repo: f.repo, source: f.source, artifact_root, selection: f.selection,
    reference: { path: "coordination.json", sha256: refs.coordination } }) };
}

test.each(["approved", "missing", "changed-actions", "wrong-source", "claimed-feature"])("coordination inspection preserves its exact permission boundary: %s", scenario => {
  const f = fixture(scenario === "claimed-feature"), before = captureRepositoryState(f.repo);
  if (scenario === "changed-actions") f.selection.edits[0].replacement_base64 = Buffer.from("Other action\n").toString("base64");
  if (scenario === "wrong-source") f.coordination.source_commit = "f".repeat(40);
  if (["changed-actions", "wrong-source"].includes(scenario)) expect(() => coordinated(f)).toThrow("Coordinated selection");
  else {
    const inspection = inspectPreparation({ repo: f.repo, source: f.source, selection: f.selection,
      protection_context: scenario === "missing" ? undefined : coordinated(f) });
    expect(inspection.complete, inspection.diagnostics.join("\n")).toBe(scenario === "approved");
    if (scenario !== "approved") expect(inspection.protection?.edits[0].reason)
      .toBe(scenario === "missing" ? "active-feature-overlap" : "claimed-feature");
  }
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 90000);

test("coordinated preparation and candidate proof reopen only the approved action", async () => {
  const f = fixture(), before = captureRepositoryState(f.repo);
  const prepared = await prepareEdits({ repo: f.repo, source: f.source, selection: f.selection,
    protection_context: coordinated(f), artifact_root: f.artifacts, owner: "fixture-owner", run: "coordinated-preparation" });
  expect(prepared.state, prepared.diagnostics.join("\n")).toBe("prepared-uncommitted");
  if (!prepared.checkout) throw Error("Prepared candidate checkout required");
  const candidate = prepared.checkout;
  expect(readFileSync(join(candidate, "docs/guide.md"), "utf8")).toBe("# Updated guide\n");
  const head = commitAll(candidate), artifact_root = join(f.root, "verification"); mkdirSync(artifact_root, { mode: 0o700 });
  for (const name of ["selection.json", "coordination.json", "owner-request.txt"]) cpSync(join(f.artifacts, name), join(artifact_root, name));
  const refs = f.save(), selected = { repo: f.repo, source: f.source, selection: f.selection, artifact_root,
    candidate_repo: candidate, candidate: head, owner: "fixture-owner", run: "coordinated-verification",
    coordination: { path: "coordination.json", sha256: refs.coordination }, protection_context: coordinated(f, artifact_root) };
  const verified = await verifyCandidate(selected);
  expect(verified.complete, verified.diagnostics.join("\n")).toBe(true);
  const reopen = () => readCandidateVerificationArtifacts({ ...selected, reference: verified.evidence,
    protection_context: coordinated(f, artifact_root) });
  expect(reopen().complete).toBe(true);
  writeFileSync(join(artifact_root, "owner-request.txt"), "Changed actual request\n");
  expect(reopen).toThrow("artifact");
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 180000);
