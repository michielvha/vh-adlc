import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureRepositoryState, captureSnapshot } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { evaluateProtection, observeFeatureFreshness } from "../../../plugins/vh-adlc/scripts/docs-drift/protection";
import { commitAll, git, populateRepository, put } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const featureTemplate = readFileSync(join(import.meta.dir, "../../../internal/testrepo/testdata/docs/conforming.md"), "utf8");

function fixture(local = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-protection-")));
  roots.push(root);
  populateRepository(root);
  git(root, "config", "init.defaultBranch", "main");
  put(root, "AGENTS.md", "Feature documents: plans/\n" + (local ? "Feature document format: local\n" : ""));
  const settings = JSON.parse(readFileSync(join(root, ".vh-adlc/docs-drift.yaml"), "utf8"));
  settings.roots = ["docs", "plans"];
  put(root, ".vh-adlc/docs-drift.yaml", JSON.stringify(settings));
  return root;
}

function feature(root: string, status = "planned", branch?: string) {
  const text = featureTemplate.replace("status: draft", "status: " + status)
    .replace("  - src/\n  - config.yml", "  - docs/guide.md")
    .replace("status_description:", (branch ? "branch: " + branch + "\n" : "") + "status_description:");
  put(root, "plans/feature.md", text);
  return text;
}

function replacement(path: string, bytes: Buffer, old: string, next: string) {
  const start = bytes.indexOf(Buffer.from(old));
  if (start < 0) throw new Error("missing fixture replacement");
  return { path, start, end: start + Buffer.byteLength(old), replacement: Buffer.from(next), before_sha256: sha256(bytes) };
}

test("standard normative content, metadata and historical proof remain byte-preserved", () => {
  const root = fixture();
  const text = feature(root) + "\n### R-1\n\nFINDING: old-path/example.ts:9\n";
  put(root, "plans/feature.md", text);
  const commit = commitAll(root);
  const snapshot = captureSnapshot(root, commit);
  const bytes = Buffer.from(text);
  const edits = [
    replacement("plans/feature.md", bytes, "The design.", "A different design."),
    replacement("plans/feature.md", bytes, "docs/guide.md", "docs/new.md"),
    replacement("plans/feature.md", bytes, "old-path/example.ts", "new-path/example.ts"),
    replacement("plans/feature.md", bytes, "Why the fixture exists.", "Different provenance."),
    replacement("plans/feature.md", bytes, "the failing test", "rewritten historical task"),
  ];
  const before = captureRepositoryState(root);
  const result = evaluateProtection(root, snapshot, edits);
  expect(result.complete).toBe(true);
  expect(result.edits.every(edit => !edit.allowed)).toBe(true);
  expect(captureRepositoryState(root)).toEqual(before);
});

test("a claimed feature is wholly report-only, including its ordinary introduction", () => {
  const root = fixture();
  const text = feature(root, "in-progress", "feat/claimed");
  const snapshot = captureSnapshot(root, commitAll(root));
  const edit = replacement("plans/feature.md", Buffer.from(text), "A fixture feature document.", "An updated introduction.");
  const result = evaluateProtection(root, snapshot, [edit]);
  expect(result.edits[0].allowed).toBe(false);
  expect(result.edits[0].reason).toBe("claimed-feature");
});

test("active coverage needs exact coordinated selection while historical coverage is reported", () => {
  for (const status of ["in-progress", "complete"]) {
    const root = fixture();
    feature(root, status, "feat/feature");
    const snapshot = captureSnapshot(root, commitAll(root));
    const bytes = readFileSync(join(root, "docs/guide.md"));
    const edit = replacement("docs/guide.md", bytes, "Guide", "Updated guide");
    const result = evaluateProtection(root, snapshot, [edit]);
    expect(result.edits[0].allowed).toBe(status === "complete");
    expect(result.edits[0].affected_features[0].historical).toBe(status === "complete");
    const selected = evaluateProtection(root, snapshot, [edit], { coordinated: [{ feature: "plans/feature.md", document: "docs/guide.md", source_commit: snapshot.source_commit, selection_sha256: "a".repeat(64) }] });
    expect(selected.edits[0].allowed).toBe(true);
  }
});

test.each(["in-progress", "complete"])("nested double-star coverage classifies ownership for a %s feature", status => {
  const root = fixture();
  const text = feature(root, status, "feat/nested-guide").replace("  - docs/guide.md", "  - docs/**");
  put(root, "plans/feature.md", text);
  const path = "docs/nested/guide.md";
  put(root, path, "# Nested guide\n");
  const snapshot = captureSnapshot(root, commitAll(root));
  const before = captureRepositoryState(root);
  const edit = replacement(path, readFileSync(join(root, path)), "Nested guide", "Updated nested guide");

  const result = evaluateProtection(root, snapshot, [edit]);
  expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
  expect(result.edits[0].allowed).toBe(status === "complete");
  expect(result.edits[0].affected_features).toEqual([
    { path: "plans/feature.md", historical: status === "complete", claimed: true },
  ]);
  const coordinated = evaluateProtection(root, snapshot, [edit], {
    coordinated: [{ feature: "plans/feature.md", document: path, source_commit: snapshot.source_commit, selection_sha256: "a".repeat(64) }],
  });
  expect(coordinated.complete).toBe(true);
  expect(coordinated.edits[0].allowed).toBe(true);
  expect(captureRepositoryState(root)).toEqual(before);
});

test("local plans allow only explicitly classified ranges from the retained procedure", () => {
  const root = fixture(true);
  const text = "---\nstatus: planned\n---\n# Local plan\n\n## Current behavior\nOld path.\n\n## Recorded proof\nold/proof.ts:7\n";
  const procedure = "# Project procedure\nOnly Current behavior is editable. Recorded proof is historical.\n";
  put(root, "plans/feature.md", text);
  put(root, "docs/docs-procedure.md", procedure);
  const snapshot = captureSnapshot(root, commitAll(root));
  const bytes = Buffer.from(text);
  const edit = replacement("plans/feature.md", bytes, "Old path.", "Current path.");
  expect(evaluateProtection(root, snapshot, [edit]).edits[0].allowed).toBe(false);
  const start = bytes.indexOf(Buffer.from("Old path."));
  const context = { local_ranges: [{
    document: "plans/feature.md", document_sha256: sha256(bytes), procedure_sha256: sha256(Buffer.from(procedure)),
    procedure_quote: { start: 0, end: Buffer.byteLength(procedure), sha256: sha256(Buffer.from(procedure)) },
    ranges: [{ start, end: start + Buffer.byteLength("Old path.") }],
  }] };
  expect(evaluateProtection(root, snapshot, [edit], context).edits[0].allowed).toBe(true);
  const structural = { ...edit, replacement: Buffer.from("Current path.\n\n## Recorded proof\nShadow proof.") };
  expect(evaluateProtection(root, snapshot, [structural], context).edits[0].allowed).toBe(false);
  const historical = replacement("plans/feature.md", bytes, "old/proof.ts", "new/proof.ts");
  expect(evaluateProtection(root, snapshot, [historical], context).edits[0].allowed).toBe(false);
});

test("unclaimed introductions remain eligible while malformed byte ranges block the selected batch", () => {
  const root = fixture();
  const text = feature(root, "draft");
  put(root, "docs/unicode.md", "é is a character.\n");
  const snapshot = captureSnapshot(root, commitAll(root));
  const intro = replacement("plans/feature.md", Buffer.from(text), "A fixture feature document.", "An updated feature introduction.");
  const allowed = evaluateProtection(root, snapshot, [intro]);
  expect(allowed.edits[0].allowed).toBe(true);
  expect(allowed.edits[0].bytes?.toString()).toContain("An updated feature introduction.");
  const unicode = readFileSync(join(root, "docs/unicode.md"));
  const malformed = { path: "docs/unicode.md", start: 1, end: 2, replacement: Buffer.from("x"), before_sha256: sha256(unicode) };
  const blocked = evaluateProtection(root, snapshot, [intro, malformed]);
  expect(blocked.complete).toBe(false);
  expect(blocked.edits.every(edit => !edit.allowed && edit.bytes === null)).toBe(true);
});

test("documented local coverage preserves its own dialect and terminal status", () => {
  const root = fixture(true);
  const procedure = "Coverage uses documentation patterns. shipped is a terminal local status.\n";
  put(root, "docs/docs-procedure.md", procedure);
  put(root, "plans/feature.md", "---\nstatus: shipped\nbranch: feature/old\ncovers: [docs/**]\n---\n# Local feature\n");
  const snapshot = captureSnapshot(root, commitAll(root));
  const bytes = readFileSync(join(root, "docs/guide.md"));
  const edit = replacement("docs/guide.md", bytes, "Guide", "Updated guide");
  expect(evaluateProtection(root, snapshot, [edit]).complete).toBe(false);
  const context = {
    document_kinds: [{ document: "docs/guide.md", document_sha256: sha256(bytes), kind: "ordinary" as const }],
    local_coverage: {
      dialect: "documentation" as const, terminal_statuses: ["shipped"], procedure_sha256: sha256(Buffer.from(procedure)),
      procedure_quote: { start: 0, end: Buffer.byteLength(procedure), sha256: sha256(Buffer.from(procedure)) },
    },
  };
  const result = evaluateProtection(root, snapshot, [edit], context);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(true);
  expect(result.edits[0].affected_features[0].historical).toBe(true);
});

test("another current writer retains the proposal until exact coordinated selection", () => {
  const root = fixture();
  const snapshot = captureSnapshot(root, commitAll(root));
  const bytes = readFileSync(join(root, "docs/guide.md"));
  const edit = replacement("docs/guide.md", bytes, "Guide", "Updated guide");
  const other_writers = [{ writer: "docs-agent", document: "docs/guide.md", document_sha256: sha256(bytes) }];
  expect(evaluateProtection(root, snapshot, [edit], { other_writers }).edits[0].allowed).toBe(false);
  const result = evaluateProtection(root, snapshot, [edit], { other_writers, coordinated: [{
    writer: "docs-agent", document: "docs/guide.md", source_commit: snapshot.source_commit, selection_sha256: "b".repeat(64),
  }] });
  expect(result.edits[0].allowed).toBe(true);
});

test("any committed roots gap blocks every edit and dirty policy cannot substitute", () => {
  const root = fixture();
  put(root, "AGENTS.md", "Feature documents: private-plans/\nDocumentation impact roots: [missing]\n");
  const snapshot = captureSnapshot(root, commitAll(root));
  put(root, "AGENTS.md", "Feature documents: plans/\n");
  const bytes = readFileSync(join(root, "docs/guide.md"));
  const result = evaluateProtection(root, snapshot, [replacement("docs/guide.md", bytes, "Guide", "Updated guide")]);
  expect(result.complete).toBe(false);
  expect(result.edits[0].allowed).toBe(false);
  expect(result.diagnostics.length).toBeGreaterThan(0);
});

test("actual binary freshness observes the resulting guide change without altering feature status", () => {
  const root = fixture();
  const text = feature(root, "draft");
  const reviewed = commitAll(root);
  put(root, "plans/feature.md", text + `| 2026-11-06 | R-1 | implementation | \`${reviewed}\` | fixture | procedural | Synthetic review. |\n\n### R-1\n\nCRITERION: AC-01 The first end state, wrapped onto a second line.\nVERDICT: met\nEVIDENCE: synthetic fixture\n\nCRITERION: AC-02 The second end state.\nVERDICT: met\nEVIDENCE: synthetic fixture\n`);
  commitAll(root);
  const before = observeFeatureFreshness(root, "plans/feature.md");
  expect(before.implementation_review.stale, JSON.stringify(before)).toBe(false);
  put(root, "docs/guide.md", "# Updated guide\n");
  const dirty = observeFeatureFreshness(root, "plans/feature.md");
  expect(dirty.feature_tree.clean).toBe(false);
  expect(dirty.feature_tree.paths).toContain("docs/guide.md");
  commitAll(root);
  expect(observeFeatureFreshness(root, "plans/feature.md").implementation_review.stale).toBe(true);
  expect(readFileSync(join(root, "plans/feature.md"), "utf8")).toContain("status: draft");
});

test("freshness refuses excluded dirty root policy before invoking its working-tree resolver", () => {
  const root = fixture();
  feature(root, "draft");
  commitAll(root);
  put(root, "AGENTS.md", "Feature documents: plans/\n# Another writer's uncommitted policy\n");
  expect(() => observeFeatureFreshness(root, "plans/feature.md")).toThrow();
});


test("explicit ordinary file creation deletion and mode changes retain their exact eligibility", () => {
  const root = fixture(), snapshot = captureSnapshot(root, commitAll(root));
  const blob = snapshot.blobs.find(blob => blob.path === "docs/guide.md");
  if (!blob) throw Error("missing guide fixture");
  const edits = [
    { action: "create" as const, path: "docs/new-guide.md", start: 0, end: 0,
      before_sha256: null, replacement: Buffer.from("# New guide\n"), after_mode: "100644" as const },
    { action: "delete" as const, path: blob.path, start: 0, end: blob.bytes.length,
      before_sha256: sha256(blob.bytes), replacement: Buffer.alloc(0), after_mode: null },
  ];
  const result = evaluateProtection(root, snapshot, edits);
  expect(result.complete).toBe(true);
  expect(result.edits.every(edit => edit.allowed)).toBe(true);
  expect(result.edits[0].bytes).toEqual(Buffer.from("# New guide\n"));
  expect(result.edits[1].bytes).toBeNull();
  const mode = evaluateProtection(root, snapshot, [{ action: "chmod", path: blob.path, start: 0, end: 0,
    before_sha256: sha256(blob.bytes), replacement: Buffer.alloc(0), after_mode: "100755" }]);
  expect(mode.edits[0].allowed).toBe(true);
});


test("whole binary asset corrections can be assessed without decoding them as prose", () => {
  const root = fixture();
  writeFileSync(join(root, "docs/asset.bin"), Buffer.from([0, 255, 1]));
  const snapshot = captureSnapshot(root, commitAll(root));
  const asset = snapshot.blobs.find(blob => blob.path === "docs/asset.bin");
  if (!asset) throw Error("missing asset fixture");
  const result = evaluateProtection(root, snapshot, [{ path: asset.path, start: 0, end: asset.bytes.length,
    before_sha256: sha256(asset.bytes), replacement: Buffer.from([0, 255, 2]), after_mode: "100644" }]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(true);
  expect(result.edits[0].bytes).toEqual(Buffer.from([0, 255, 2]));
});


test("combined edits cannot introduce a governed heading that no individual edit contains", () => {
  const root = fixture(), text = feature(root).replace("A fixture feature document.", "xx Heading\n");
  put(root, "plans/feature.md", text);
  const snapshot = captureSnapshot(root, commitAll(root)), bytes = Buffer.from(text), start = bytes.indexOf("xx Heading");
  const edits = [
    { path: "plans/feature.md", start, end: start + 1, before_sha256: sha256(bytes), replacement: Buffer.from("#") },
    { path: "plans/feature.md", start: start + 1, end: start + 2, before_sha256: sha256(bytes), replacement: Buffer.from("#") },
  ];
  const result = evaluateProtection(root, snapshot, edits);
  expect(result.edits.every(edit => !edit.allowed)).toBe(true);
});


test("new binary assets need full-file scope and creation cannot bypass feature coverage", () => {
  const root = fixture();
  feature(root, "in-progress", "feat/claimed");
  const snapshot = captureSnapshot(root, commitAll(root));
  const create = { action: "create" as const, path: "docs/new-asset.bin", start: 0, end: 0,
    before_sha256: null, replacement: Buffer.from([0, 255, 1]), after_mode: "100644" as const };
  const result = evaluateProtection(root, snapshot, [create]);
  expect(result.complete).toBe(true);
  expect(result.edits[0].allowed).toBe(true);
  const blocked = evaluateProtection(root, snapshot, [{ ...create, path: "plans/new-feature.md", replacement: Buffer.from("# Fake feature\n") }]);
  expect(blocked.edits[0].allowed).toBe(false);
  expect(blocked.edits[0].reason).toBe("feature-creation-requires-lifecycle");
  const source = snapshot.blobs.find(blob => blob.path === "plans/feature.md");
  if (!source) throw Error("missing feature fixture");
  const deleted = evaluateProtection(root, snapshot, [{ action: "delete", path: source.path, start: 0, end: source.bytes.length,
    before_sha256: sha256(source.bytes), replacement: Buffer.alloc(0), after_mode: null }]);
  expect(deleted.edits[0].allowed).toBe(false);
  expect(deleted.edits[0].reason).toBe("claimed-feature");
});


test("new files still respect active feature coverage and binary partial ranges stay denied", () => {
  const root = fixture();
  put(root, "plans/feature.md", feature(root, "in-progress", "feat/claimed").replace("docs/guide.md", "docs/new-asset.bin"));
  writeFileSync(join(root, "docs/old-asset.bin"), Buffer.from([0, 255, 1]));
  const snapshot = captureSnapshot(root, commitAll(root));
  const edit = { action: "create" as const, path: "docs/new-asset.bin", start: 0, end: 0,
    before_sha256: null, replacement: Buffer.from([0, 255]), after_mode: "100644" as const };
  const blocked = evaluateProtection(root, snapshot, [edit]);
  expect(blocked.edits[0].allowed).toBe(false);
  expect(blocked.edits[0].reason).toBe("active-feature-overlap");
  const coordinated = evaluateProtection(root, snapshot, [edit], { coordinated: [{ feature: "plans/feature.md", document: edit.path,
    source_commit: snapshot.source_commit, selection_sha256: "a".repeat(64) }] });
  expect(coordinated.edits[0].allowed).toBe(true);
  const blob = snapshot.blobs.find(blob => blob.path === "docs/old-asset.bin");
  if (!blob) throw Error("missing asset fixture");
  const partial = evaluateProtection(root, snapshot, [{ path: blob.path, start: 1, end: 2,
    before_sha256: sha256(blob.bytes), replacement: Buffer.from([1]) }]);
  expect(partial.complete).toBe(false);
  expect(partial.edits[0].allowed).toBe(false);
});
