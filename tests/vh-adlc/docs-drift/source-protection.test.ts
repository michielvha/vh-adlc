import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectPreparation } from "../../../plugins/vh-adlc/scripts/docs-drift/preparation";
import { evaluateProtection } from "../../../plugins/vh-adlc/scripts/docs-drift/protection";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState, captureSnapshot } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { commitAll, populateRepository, put } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function fixture(local = false) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-source-policy-"))); roots.push(repo);
  populateRepository(repo);
  put(repo, "AGENTS.md", "Feature documents: plans/\n" + (local ? "Feature document format: local\n" : ""));
  return repo;
}
function procedure(repo: string, policy: unknown) {
  put(repo, "docs/docs-procedure.md", "---\ndocs_drift_protection: " + canonicalJSON(policy).toString() + "\n---\n# Project procedure\n");
}
function selected(repo: string, source: string, path = "docs/guide.md", prior = "Guide", next = "Current guide") {
  const bytes = readFileSync(join(repo, path)), start = bytes.indexOf(prior);
  if (start < 0) throw Error("Missing selected fixture text");
  return { repo, source, selection: { schema_version: 1, source_commit: source, edits: [{ id: "selected-edit", path, action: "replace",
    start, end: start + Buffer.byteLength(prior), before_sha256: sha256(bytes), replacement_base64: Buffer.from(next).toString("base64"), after_mode: "100644" }] } };
}

test("ordinary edit inspection loads source-bound current writers without an injected API context", () => {
  const repo = fixture(), hash = sha256(readFileSync(join(repo, "docs/guide.md")));
  procedure(repo, { other_writers: [{ writer: "docs-session", document: "docs/guide.md", document_sha256: hash }] });
  const source = commitAll(repo), before = captureRepositoryState(repo), input = selected(repo, source);
  for (const protection_context of [undefined, { other_writers: [] }]) {
    const result = inspectPreparation({ ...input, protection_context });
    expect(result.complete).toBe(false);
    expect(result.protection?.edits[0].reason).toBe("other-current-writer");
  }
  put(repo, "docs/docs-procedure.md", "# Dirty procedure with the writer removed\n");
  expect(inspectPreparation(input).protection?.edits[0].reason).toBe("other-current-writer");
  put(repo, "docs/docs-procedure.md", "---\ndocs_drift_protection: " + canonicalJSON({ other_writers: [{ writer: "docs-session", document: "docs/guide.md", document_sha256: hash }] }).toString() + "\n---\n# Project procedure\n");
  expect(captureRepositoryState(repo)).toEqual(before);
});

test("ordinary edit inspection loads exact project-local editable ranges and preserves historical text", () => {
  const repo = fixture(true), path = "plans/local.md", text = "---\nstatus: planned\n---\n# Local plan\n\n## Current\nOld path.\n\n## Evidence\nold/proof.ts\n";
  put(repo, path, text);
  const settings = JSON.parse(readFileSync(join(repo, ".vh-adlc/docs-drift.yaml"), "utf8"));
  put(repo, ".vh-adlc/docs-drift.yaml", JSON.stringify({ ...settings, roots: ["docs", "plans"] }));
  const start = Buffer.byteLength(text.slice(0, text.indexOf("Old path.")));
  procedure(repo, { local_ranges: [{ document: path, document_sha256: sha256(Buffer.from(text)), ranges: [{ start, end: start + 9 }] }] });
  const source = commitAll(repo), before = captureRepositoryState(repo);
  const current = inspectPreparation(selected(repo, source, path, "Old path.", "New path."));
  expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
  const historical = inspectPreparation(selected(repo, source, path, "old/proof.ts", "new/proof.ts"));
  expect(historical.complete).toBe(false);
  expect(historical.protection?.edits[0].reason).toBe("unclassified-local-range");
  expect(captureRepositoryState(repo)).toEqual(before);
});

test.each(["unknown", "duplicate-writer", "stale-document", "missing-document", "range", "coordinated"])("malformed committed project protection blocks inspection: %s", scenario => {
  const repo = fixture(), hash = sha256(readFileSync(join(repo, "docs/guide.md")));
  const writer = { writer: "docs-session", document: "docs/guide.md", document_sha256: hash };
  const policies: Record<string, unknown> = {
    unknown: { approved: true }, "duplicate-writer": { other_writers: [writer, writer] },
    "stale-document": { other_writers: [{ ...writer, document_sha256: "a".repeat(64) }] },
    "missing-document": { other_writers: [{ ...writer, document: "docs/missing.md" }] },
    range: { local_ranges: [{ document: writer.document, document_sha256: hash, ranges: [{ start: 0, end: 1000 }] }] },
    coordinated: { coordinated: [{ writer: "docs-session", document: writer.document, source_commit: "a".repeat(40), selection_sha256: "b".repeat(64) }] },
  };
  procedure(repo, policies[scenario]); const source = commitAll(repo), before = captureRepositoryState(repo);
  const result = inspectPreparation(selected(repo, source));
  expect(result.complete).toBe(false);
  expect(result.protection?.diagnostics[0].code).toBe("project-protection");
  expect(captureRepositoryState(repo)).toEqual(before);
});

test("source-declared document kinds classify an ordinary local guide without granting effect authority", () => {
  const repo = fixture(true), path = "docs/guide.md", hash = sha256(readFileSync(join(repo, path)));
  procedure(repo, { document_kinds: [{ document: path, document_sha256: hash, kind: "ordinary" }] });
  const source = commitAll(repo), result = inspectPreparation(selected(repo, source));
  expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true);
  expect(result.authority).toBe("none");
  const snapshot = captureSnapshot(repo, source);
  expect(evaluateProtection(repo, snapshot, []).complete).toBe(true);
});

test("the normal check-edits command honors committed writers and preserves a dirty consumer procedure", () => {
  const repo = fixture(), path = "docs/guide.md", hash = sha256(readFileSync(join(repo, path)));
  procedure(repo, { other_writers: [{ writer: "active-docs", document: path, document_sha256: hash }] });
  const source = commitAll(repo), input = selected(repo, source);
  put(repo, "docs/docs-procedure.md", "# Keep this unrelated draft\n");
  const before = captureRepositoryState(repo), artifacts = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-source-policy-output-"))); roots.push(artifacts);
  const selection = canonicalJSON(input.selection); writeFileSync(join(artifacts, "selection.json"), selection, { mode: 0o600 });
  const result = Bun.spawnSync([process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), "check-edits",
    "--repo", repo, "--source", source, "--artifact-root", artifacts, "--selection", "selection.json", "--selection-sha256", sha256(selection)],
    { stdout: "pipe", stderr: "pipe", timeout: 30000 });
  const report = JSON.parse(result.stdout.toString());
  expect(result.exitCode, JSON.stringify(report)).toBe(2);
  expect(report.edit_inspection, JSON.stringify(report)).toBeDefined();
  expect(report.edit_inspection.authority).toBe("none");
  expect(report.edit_inspection.protection.edits[0].reason).toBe("other-current-writer");
  expect(captureRepositoryState(repo)).toEqual(before);
}, 45000);
