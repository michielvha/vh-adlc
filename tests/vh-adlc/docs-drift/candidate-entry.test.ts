import { afterAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { closureFixture } from "./closure-fixture";
import { commitAll, git, populateRepository, put } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
import { readBoundArtifact } from "../../../plugins/vh-adlc/scripts/docs-drift/evidence-input";
import { inspectCandidate } from "../../../plugins/vh-adlc/scripts/docs-drift/preparation";
function fixture(fault = "none", format: "sha1" | "sha256" = "sha1") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-candidate-entry-"))); roots.push(root);
  const repo = join(root, "source"), candidate = join(root, "candidate"), artifacts = join(root, "artifacts");
  mkdirSync(repo, { mode: 0o700 }); mkdirSync(artifacts, { mode: 0o700 });
  git(repo, "init", "--template=", "--object-format=" + format, "-b", "main"); populateRepository(repo);
  const path = fault === "literal" ? "docs/literal\\file\nΣ.md" : "docs/guide.md";
  if (fault === "literal") { put(repo, path, "# Guide\n"); commitAll(repo); }
  const source = git(repo, "rev-parse", "HEAD"), original = Buffer.from("# Guide\n"), replacement = Buffer.from("# Current guide\n");
  const selection = { schema_version: 1, source_commit: source, edits: [{ id: "fix", path, action: "replace", start: 0, end: original.length,
    before_sha256: sha256(original), replacement_base64: replacement.toString("base64"), after_mode: "100644" }] };
  git(root, "clone", "--no-local", repo, candidate);
  if (fault !== "unchanged") put(candidate, path, fault === "wrong-bytes" ? "Unselected bytes\n" : replacement.toString());
  if (fault === "extra-file") put(candidate, "outside.txt", "Unselected product change\n");
  if (fault === "wrong-mode") chmodSync(join(candidate, path), 0o755);
  let head = fault === "unchanged" ? source : commitAll(candidate);
  if (fault === "uncommitted") put(candidate, path, "New uncommitted draft\n");
  if (fault === "wrong-head") { put(candidate, "outside.txt", "Later commit\n"); commitAll(candidate); }
  if (fault === "merge") {
    git(candidate, "switch", "-c", "sibling", source); put(candidate, "other.txt", "Sibling input\n"); commitAll(candidate);
    git(candidate, "switch", "main"); git(candidate, "merge", "--no-ff", "-m", "Synthetic merge", "sibling"); head = git(candidate, "rev-parse", "HEAD");
  }
  if (fault === "missing-candidate") head = "0".repeat(format === "sha1" ? 40 : 64);
  const packet = canonicalJSON(selection); writeFileSync(join(artifacts, "selection.json"), packet, { mode: 0o600 });
  return { root, repo, candidate, artifacts, source, head, path, replacement, packet };
}
function inspect(f: ReturnType<typeof fixture>, resolution_record?: { path: string; sha256: string }) {
  return inspectCandidate({ repo: f.repo, source: f.source, candidate_repo: f.candidate, candidate: f.head,
    artifact_root: f.artifacts, selection: JSON.parse(f.packet.toString()), owner: "fixture-owner", run: "candidate-inspection", resolution_record });
}

test.each(["sha1", "sha256"] as const)("candidate inspection binds the complete %s checkpoint and preserves callers", format => {
  const f = fixture("none", format); put(f.repo, "docs/guide.md", "Preserve original draft\n");
  const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate), inspection = inspect(f);
  expect(inspection.complete, inspection.diagnostics.join("\n")).toBe(true);
  expect(inspection).toMatchObject({ authority: "none", complete: true, source_commit: f.source, candidate_commit: f.head,
    candidate_tree: git(f.candidate, "rev-parse", f.head + "^{tree}") });
  expect(inspection.diff_sha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
});

test("checkpoint inspection preserves literal path bytes", () => {
  const f = fixture("literal"), inspection = inspect(f);
  expect(inspection.complete, inspection.diagnostics.join("\n")).toBe(true);
  expect(inspection.changed_paths).toEqual([f.path]);
  expect(readFileSync(join(f.candidate, f.path))).toEqual(f.replacement);
});

test.each(["unchanged", "extra-file", "wrong-bytes", "wrong-mode", "merge", "missing-candidate"])("checkpoint inspection refuses %s", fault => {
  const f = fixture(fault), before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate), inspection = inspect(f);
  expect(inspection.complete).toBe(false);
  expect(inspection.complete).toBe(false);
  expect(inspection.diagnostics.length).toBeGreaterThan(0);
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
});


test.each(["uncommitted", "wrong-head"])("immutable candidate inspection preserves unrelated %s overlays", fault => {
  const f = fixture(fault), before = captureRepositoryState(f.candidate), inspection = inspect(f);
  expect(inspection.complete, inspection.diagnostics.join("\n")).toBe(true);
  expect(inspection.candidate_commit).toBe(f.head);
  expect(captureRepositoryState(f.candidate)).toEqual(before);
});


test.each(["root", "descendant"])("candidate evidence refuses a secondary caller %s", scenario => {
  const f = fixture(); chmodSync(f.candidate, 0o700);
  writeFileSync(join(f.candidate, "private-selection.json"), f.packet, { mode: 0o600 });
  f.artifacts = scenario === "root" ? f.candidate : f.root;
  const relative = scenario === "root" ? "private-selection.json" : "candidate/private-selection.json";
  const before = captureRepositoryState(f.candidate);
  expect(() => readBoundArtifact({ source_repo: f.candidate, artifact_root: f.artifacts,
    reference: { path: relative, sha256: sha256(f.packet) } })).toThrow("overlaps a caller checkout");
  expect(captureRepositoryState(f.candidate)).toEqual(before);
});


async function resolutionCandidate(fault: string) {
  const f = await closureFixture(roots, "merge", false, fault === "required-input" ? selected => ({ ...selected.options,
    collection: { ...selected.collection, snapshot: { ...selected.snapshot,
      required_inputs: [{ id: "current-date", kind: "time", sha256: sha256(Buffer.from("synthetic recorded date")) }] } } }) : undefined), root = dirname(f.repo), assessment = join(root, "assessment");
  git(f.repo, "worktree", "add", "--detach", assessment, f.snapshot.source_commit);
  const edits = structuredClone(f.options.edits);
  if (fault === "wrong-postimages") edits[0].replacement_base64 = Buffer.from("Unselected interpretation\n").toString("base64");
  const packet = canonicalJSON({ schema_version: 1, source_commit: f.snapshot.source_commit, edits });
  const artifacts = dirname(f.collection.store.record_path); writeFileSync(join(artifacts, "selection.json"), packet, { mode: 0o600 });
  const selected = fault === "unselected" ? undefined : { path: fault === "wrong-path" ? "docs/other.yaml" : f.draft.record_path,
    sha256: fault === "wrong-hash" ? "0".repeat(64) : sha256(f.recordBytes) };
  return { root, repo: assessment, candidate: f.repo, artifacts, source: f.snapshot.source_commit, head: f.head,
    path: f.edit.path, replacement: Buffer.from(f.edit.replacement_base64, "base64"), packet, selected,
    resolution: { path: f.draft.record_path, sha256: sha256(f.recordBytes) } };
}

test.each(["matching", "wrong-hash", "wrong-path", "wrong-postimages", "unselected", "required-input"])("candidate inspection binds the durable resolve record %s", async fault => {
  const f = await resolutionCandidate(fault), before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(f.candidate);
  const inspection = inspect(f, f.selected);
  expect(inspection.complete).toBe(fault === "matching");
  if (fault === "matching") expect(inspection.resolution_record).toEqual(f.resolution);
  else {
    expect(inspection.complete).toBe(false);
    expect(inspection.diagnostics.length).toBeGreaterThan(0);
    if (fault !== "unselected") expect(inspection.diagnostics.some((message: string) => message.includes("resolution"))).toBe(true);
  }
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(captureRepositoryState(f.candidate)).toEqual(candidateBefore);
});

test("candidate inspection reuses a committed tree for an empty edit selection", () => {
  const f = fixture("unchanged"); f.packet = canonicalJSON({ schema_version: 1, source_commit: f.source, edits: [] });
  writeFileSync(join(f.artifacts, "selection.json"), f.packet);
  const before = captureRepositoryState(f.candidate), inspection = inspect(f);
  expect(inspection.complete, inspection.diagnostics.join("\n")).toBe(true);
  expect(inspection).toMatchObject({ complete: true, candidate_commit: f.source, changed_paths: [], diff_sha256: sha256(Buffer.alloc(0)) });
  expect(captureRepositoryState(f.candidate)).toEqual(before);
});

test("committed candidate diff binding ignores caller-local diff configuration and attributes", () => {
  const f = fixture(), baseline = inspect(f); expect(baseline.complete).toBe(true);
  git(f.candidate, "config", "diff.noprefix", "true"); git(f.candidate, "config", "diff.algorithm", "patience");
  git(f.candidate, "config", "core.quotePath", "false");
  put(f.candidate, ".gitattributes", "* -diff\n");
  writeFileSync(join(f.candidate, ".git", "info", "attributes"), "* -diff\n");
  const before = captureRepositoryState(f.candidate), inspection = inspect(f);
  expect(inspection.complete, inspection.diagnostics.join("\n")).toBe(true);
  expect(inspection.diff_sha256).toBe(baseline.diff_sha256);
  expect(captureRepositoryState(f.candidate)).toEqual(before);
});
