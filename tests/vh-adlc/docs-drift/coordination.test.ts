import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { populateRepository } from "./repository-fixture";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-docs-coordination-"))); roots.push(root);
  const repo = join(root, "source"), artifacts = join(root, "artifacts");
  mkdirSync(repo, { mode: 0o700 }); mkdirSync(artifacts, { mode: 0o700 });
  const { commit: source } = populateRepository(repo);
  const bytes = readFileSync(join(repo, "docs/guide.md"));
  const selection = { schema_version: 1, source_commit: source, edits: [{ id: "guide-fix", path: "docs/guide.md", action: "replace",
    start: 0, end: bytes.length, before_sha256: sha256(bytes), replacement_base64: Buffer.from("# Updated guide\n").toString("base64"), after_mode: "100644" }] };
  const origin = Buffer.from("Synthetic current owner coordinates exactly this source and selected guide edit with the named feature writer.\n");
  writeFileSync(join(artifacts, "owner-request.txt"), origin, { mode: 0o600 });
  const packet = { schema_version: 1, kind: "docs-drift-coordinated-selection", repository: "fixture/docs", source_commit: source,
    selection_sha256: sha256(canonicalJSON(selection)), overlaps: [{ kind: "feature", owner: "plans/active.md", document: "docs/guide.md" }],
    origin: { kind: "owner-current-request", artifact: { path: "owner-request.txt", sha256: sha256(origin) } } };
  function retain() {
    const bytes = canonicalJSON(packet); writeFileSync(join(artifacts, "coordination.json"), bytes, { mode: 0o600 });
    return { path: "coordination.json", sha256: sha256(bytes) };
  }
  return { repo, artifacts, source, selection, packet, retain };
}

test("coordination binds exact owner-attested repository, source, document and selected actions", async () => {
  const { readCoordinatedSelection } = await import("../../../plugins/vh-adlc/scripts/docs-drift/coordination");
  const f = fixture(), before = captureRepositoryState(f.repo);
  const result = readCoordinatedSelection({ repo: f.repo, source: f.source, artifact_root: f.artifacts, selection: f.selection, reference: f.retain() });
  expect(result).toEqual([{ feature: "plans/active.md", document: "docs/guide.md", source_commit: f.source, selection_sha256: f.packet.selection_sha256 }]);
  expect(Object.isFrozen(result)).toBe(true); expect(captureRepositoryState(f.repo)).toEqual(before);
});

test.each(["repository", "source", "payload", "document", "duplicate", "origin", "missing-owner", "extra-grant"])("coordination refuses changed or unapproved scope: %s", async scenario => {
  const { readCoordinatedSelection } = await import("../../../plugins/vh-adlc/scripts/docs-drift/coordination");
  const f = fixture(), before = captureRepositoryState(f.repo);
  if (scenario === "repository") f.packet.repository = "other/docs";
  if (scenario === "source") f.packet.source_commit = "f".repeat(40);
  if (scenario === "payload") f.selection.edits[0].replacement_base64 = Buffer.from("Different action\n").toString("base64");
  if (scenario === "document") f.packet.overlaps[0].document = "docs/unselected.md";
  if (scenario === "duplicate") f.packet.overlaps.push({ ...f.packet.overlaps[0] });
  if (scenario === "origin") f.packet.origin.kind = "adopted-procedure";
  if (scenario === "missing-owner") rmSync(join(f.artifacts, "owner-request.txt"));
  if (scenario === "extra-grant") Object.assign(f.packet, { allow_protected: true });
  expect(() => readCoordinatedSelection({ repo: f.repo, source: f.source, artifact_root: f.artifacts, selection: f.selection, reference: f.retain() }))
    .toThrow(scenario === "missing-owner" ? "owner-request.txt" : "Coordinated selection");
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test("absent coordination supplies no overlap exception", async () => {
  const { readCoordinatedSelection } = await import("../../../plugins/vh-adlc/scripts/docs-drift/coordination");
  const f = fixture();
  expect(readCoordinatedSelection({ repo: f.repo, source: f.source, artifact_root: f.artifacts, selection: f.selection })).toEqual([]);
});
