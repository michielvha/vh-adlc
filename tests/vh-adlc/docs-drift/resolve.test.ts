import { afterEach, expect, test } from "bun:test";
import { rmSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import type { ScanAssessment } from "../../../plugins/vh-adlc/scripts/docs-drift/scan";
import { buildResolution, readResolutionRecord, type ResolutionRecord } from "../../../plugins/vh-adlc/scripts/docs-drift/resolve";
import { collectResolutionInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/resolve-inputs";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { canonicalDigest, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { resolutionFixture } from "./resolution-fixture";
import { commitAll, git } from "./repository-fixture";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function setup() { return resolutionFixture(roots); }

test("a verified selected correction creates a pre-review record without source or tracker writes", async () => {
  const f = setup(), before = canonicalDigest(captureRepositoryState(f.repo));
  const result = await buildResolution(f.options);
  expect(result.state).toBe("proposal");
  expect(result.complete).toBe(true);
  expect(result.changes).toHaveLength(1);
  expect(result.record_path).toBe(".vh-adlc/docs-drift/resolutions/resolution-one.yaml");
  expect(result.record?.assessed_base).toBe(f.snapshot.source_commit);
  expect(result.record?.changed_paths).toEqual(["docs/guide.md"]);
  expect(result.record_bytes).not.toBeNull();
  if (!result.record_bytes || !result.record || !result.record_sha256) throw Error("missing generated record");
  expect(readResolutionRecord(result.record_bytes, f.snapshot.settings)).toEqual(result.record);
  expect(sha256(result.record_bytes)).toBe(result.record_sha256);
  expect(canonicalDigest(captureRepositoryState(f.repo))).toBe(before);
  expect(result.record_bytes.toString()).not.toContain("candidate_commit");
});

test("every selected hunk needs exactly one disposition and extra edits never become an implicit selection", async () => {
  const f = setup();
  expect((await buildResolution({ ...f.options, decisions: [] })).complete).toBe(false);
  expect((await buildResolution({ ...f.options, decisions: [f.decision, f.decision] })).complete).toBe(false);
  expect((await buildResolution({ ...f.options, edits: [f.edit, { ...f.edit, id: "extra", path: "src/app.ts" }] })).complete).toBe(false);
});

test("identical selected proposals share one correction while retaining both dispositions", async () => {
  const f = setup();
  const first = f.proposals.get(1);
  if (!first) throw Error("missing original fixture");
  f.proposals.set(2, { ...first, number: 2 });
  const collection = { ...f.collection, selected: [1, 2] }, inputs = collectResolutionInputs(collection);
  const result = await buildResolution({ ...f.options, collection, inputs,
    decisions: [f.decision, { ...f.decision, proposal: 2 }] });
  expect(result.complete).toBe(true);
  expect(result.changes).toHaveLength(1);
  expect(result.record?.dispositions).toHaveLength(2);
});

test("overlapping contradictory corrections require an explicit decision instead of newest-wins", async () => {
  const f = setup();
  const other = { ...f.edit, id: "conflict", replacement_base64: Buffer.from("Contradictory claim\n").toString("base64") };
  const decision = { ...f.decision, edit_ids: [f.edit.id, other.id] };
  expect((await buildResolution({ ...f.options, decisions: [decision], edits: [f.edit, other] })).complete).toBe(false);
});

test("wrong interpretation cannot be converted into detector suppression", async () => {
  const f = setup();
  const feedback = { cause: "interpretation", channel: "suppression", action: "append", path: "docs/suppressions.yaml",
    edit_id: "feedback", finding_id: null, detector_id: null, document: "docs/guide.md", policy_quote: f.quote("docs/docs-procedure.md"), delivery_quote: null };
  const decision = { ...f.decision, disposition: "wrong", edit_ids: [], feedback };
  const source = f.snapshot.blobs.find(blob => blob.path === feedback.path);
  if (!source) throw Error("missing feedback fixture");
  const edit = { ...f.edit, id: "feedback", path: feedback.path, start: 0, end: source.bytes.length,
    before_sha256: sha256(source.bytes), replacement_base64: Buffer.from("suppressions: []\n").toString("base64") };
  expect((await buildResolution({ ...f.options, decisions: [decision], edits: [edit] })).complete).toBe(false);
});

test("already-fixed selections still produce a record-only consolidation proposal", async () => {
  const f = setup();
  const result = await buildResolution({ ...f.options, decisions: [{ ...f.decision, disposition: "already-fixed", edit_ids: [] }], edits: [] });
  expect(result.complete).toBe(true);
  expect(result.changes).toEqual([]);
  expect(result.record?.changed_paths).toEqual([]);
  expect(result.record_bytes).not.toBeNull();
});

test("unknown uncarried hunks and stale original inputs cannot create a resolution record", async () => {
  const f = setup();
  const deferred = { ...f.decision, disposition: "defer", edit_ids: [], carry: "Investigate on the deployment host" };
  expect((await buildResolution({ ...f.options, decisions: [deferred], edits: [] })).complete).toBe(false);
  const original = f.proposals.get(1);
  if (!original) throw Error("missing original fixture");
  original.body += " changed after assessment";
  expect((await buildResolution(f.options)).complete).toBe(false);
});

test("a verification result must bind the actual current decision and proposed edits", async () => {
  const f = setup();
  const observe_verification = async () => ({ state: "passed", inputs_sha256: "0".repeat(64),
    artifact_sha256: "a".repeat(64), method: "synthetic", asset_checks: [] });
  expect((await buildResolution({ ...f.options, observe_verification })).complete).toBe(false);
});

test("literal apply cannot replace the selected hunk with unrelated bytes", async () => {
  const f = setup();
  const changed = { ...f.edit, replacement_base64: Buffer.from("Unrelated alteration\n").toString("base64") };
  expect((await buildResolution({ ...f.options, edits: [changed] })).complete).toBe(false);
});

test("record decoding rejects omitted dispositions, traversals, inconsistent paths and extra source identities", async () => {
  const f = setup(), result = await buildResolution(f.options);
  if (!result.record) throw Error("missing record fixture");
  for (const mutate of [
    (record: ResolutionRecord) => { record.dispositions = []; },
    (record: ResolutionRecord) => { record.postimages[0].path = "../escape.md"; },
    (record: ResolutionRecord) => { record.changed_paths = []; },
    (record: ResolutionRecord) => { Object.assign(record.source, { candidate_commit: "e".repeat(40) }); },
  ]) {
    const changed = structuredClone(result.record);
    mutate(changed);
    expect(() => readResolutionRecord(Buffer.from(JSON.stringify(changed)), f.snapshot.settings)).toThrow();
  }
});

test("unselected carry data cannot enter a published resolution record", async () => {
  const f = setup();
  const carry_decisions = [{ proposal: 999, hunk_id: "outside", text: "Unselected decision", request_sha256: "a".repeat(64) }];
  expect((await buildResolution({ ...f.options, carry_decisions })).complete).toBe(false);
});

test("mutating assessed source bindings during verification cannot create a mixed record", async () => {
  const f = setup();
  const observe_verification = async (scope: { inputs_sha256: string }) => {
    f.snapshot.read_set_sha256 = "e".repeat(64);
    return { inputs_sha256: scope.inputs_sha256, state: "passed", artifact_sha256: "a".repeat(64), method: "synthetic", asset_checks: [] };
  };
  expect((await buildResolution({ ...f.options, observe_verification })).complete).toBe(false);
});

test("an empty proposal diff still requires an evidence-backed disposition", async () => {
  const f = setup();
  const original = f.proposals.get(1);
  if (!original) throw Error("missing original fixture");
  original.head_sha = f.snapshot.source_commit;
  const inputs = collectResolutionInputs(f.collection);
  expect(inputs.proposals[0].hunks).toEqual([]);
  expect((await buildResolution({ ...f.options, inputs, decisions: [], edits: [] })).complete).toBe(false);
});


test("carried decisions bind the actual selected input set and still produce a record-only proposal", async () => {
  const f = setup(), text = "Keep this uncertain correction open for a deployment check";
  const decision = { ...f.decision, disposition: "defer", edit_ids: [], carry: text };
  const carried = { proposal: 1, hunk_id: f.decision.hunk_id, text, request_sha256: "a".repeat(64), inputs_sha256: f.inputs.inputs_sha256 };
  const unknown = async (scope: { inputs_sha256: string }) => ({ inputs_sha256: scope.inputs_sha256, state: "unknown",
    artifact_sha256: "a".repeat(64), method: "required check unavailable", asset_checks: [] });
  const options = { ...f.options, decisions: [decision], edits: [], carry_decisions: [carried], observe_verification: unknown };
  const result = await buildResolution(options);
  expect(result.complete).toBe(true);
  expect(result.changes).toEqual([]);
  expect(result.record?.carried_decisions).toEqual([carried]);
  expect((await buildResolution({ ...options, carry_decisions: [{ ...carried, inputs_sha256: "e".repeat(64) }] })).complete).toBe(false);
});

test("a genuinely empty proposal can be adjudicated explicitly without inventing a Git hunk", async () => {
  const f = setup(), original = f.proposals.get(1);
  if (!original) throw Error("missing original fixture");
  original.head_sha = f.snapshot.source_commit;
  const inputs = collectResolutionInputs(f.collection), empty = inputs.proposals[0];
  const result = await buildResolution({ ...f.options, inputs, decisions: [{ ...f.decision,
    hunk_id: "empty-" + empty.binding_sha256, disposition: "already-fixed", edit_ids: [] }], edits: [] });
  expect(result.complete).toBe(true);
  expect(result.record?.originals[0].hunks).toEqual([]);
  expect(result.record?.dispositions[0].hunk_id).toBe("empty-" + empty.binding_sha256);
});


test("apply-modified records the actual selected correction paths for fresh-session closure", async () => {
  const f = setup();
  const changed = { ...f.edit, replacement_base64: Buffer.from("Reverified modified claim\n").toString("base64") };
  const result = await buildResolution({ ...f.options, decisions: [{ ...f.decision, disposition: "apply-modified" }], edits: [changed] });
  expect(result.complete).toBe(true);
  expect(result.record?.dispositions[0].changed_paths).toEqual([changed.path]);
  expect(result.record?.postimages[0].after_sha256).toBe(sha256(Buffer.from("# Guide\nReverified modified claim\n")));
});


test("an interpretation correction already delivered permits a record-only wrong disposition", async () => {
  const f = setup();
  const feedback = { cause: "interpretation", channel: "correction-history", action: "existing", path: "docs/corrections.yaml",
    edit_id: null, finding_id: null, detector_id: null, document: "docs/guide.md", policy_quote: f.quote("docs/docs-procedure.md"),
    delivery_quote: f.quote("docs/corrections.yaml") };
  const result = await buildResolution({ ...f.options, decisions: [{ ...f.decision, disposition: "wrong", edit_ids: [], feedback }], edits: [] });
  expect(result.complete).toBe(true);
  expect(result.changes).toEqual([]);
  expect(result.record?.dispositions[0].changed_paths).toEqual([]);
});


test("durable records reject mismatched verification coverage and feedback channel claims", async () => {
  const f = setup(), result = await buildResolution(f.options);
  if (!result.record) throw Error("missing record fixture");
  const omitted = structuredClone(result.record);
  omitted.verification = [];
  expect(() => readResolutionRecord(Buffer.from(JSON.stringify(omitted)), f.snapshot.settings)).toThrow();
  const badHunk = structuredClone(result.record);
  badHunk.originals[0].hunks[0].after_sha256 = "e".repeat(64);
  expect(() => readResolutionRecord(Buffer.from(JSON.stringify(badHunk)), f.snapshot.settings)).toThrow();
  const badReadSet = structuredClone(result.record);
  badReadSet.source.entries = [];
  expect(() => readResolutionRecord(Buffer.from(JSON.stringify(badReadSet)), f.snapshot.settings)).toThrow();
});


test("a selected binary proposal requires actual asset-check evidence before its record is ready", async () => {
  const f = setup(), bytes = Buffer.from([0, 255, 1]);
  git(f.repo, "switch", "-qc", "docs-drift/asset");
  writeFileSync(join(f.repo, "docs/asset.bin"), bytes);
  const head = commitAll(f.repo);
  git(f.repo, "switch", "-q", "main");
  git(f.collection.store.root, "fetch", "--no-write-fetch-head", f.repo, head);
  const original = f.proposals.get(1);
  if (!original) throw Error("missing original fixture");
  original.head_sha = head;
  const inputs = collectResolutionInputs(f.collection), hunk = inputs.proposals[0].hunks[0];
  expect(hunk.kind).toBe("binary");
  const edit = { id: "asset", path: "docs/asset.bin", action: "create", start: 0, end: 0, before_sha256: null,
    replacement_base64: bytes.toString("base64"), after_mode: "100644" };
  const options = { ...f.options, inputs, decisions: [{ ...f.decision, hunk_id: hunk.id, edit_ids: [edit.id] }], edits: [edit] };
  expect((await buildResolution(options)).complete).toBe(false);
  const observe_verification = async (scope: { inputs_sha256: string }) => ({ inputs_sha256: scope.inputs_sha256,
    state: "passed", artifact_sha256: "a".repeat(64), method: "synthetic-asset-check", asset_checks: [sha256(bytes)] });
  const result = await buildResolution({ ...options, observe_verification });
  expect(result.complete).toBe(true);
  expect(result.changes[0].after_base64).toBe(bytes.toString("base64"));
});

test("selected deletions and mode-only proposals preserve every disposition and exact postimage", async () => {
  for (const action of ["delete", "chmod"] as const) {
    const f = setup(), source = f.snapshot.blobs.find(blob => blob.path === "docs/guide.md");
    if (!source) throw Error("missing guide fixture");
    git(f.repo, "switch", "-qc", "docs-drift/transition");
    if (action === "delete") git(f.repo, "rm", "--", source.path);
    else chmodSync(join(f.repo, source.path), 0o755);
    const head = commitAll(f.repo);
    git(f.repo, "switch", "-q", "main");
    git(f.collection.store.root, "fetch", "--no-write-fetch-head", f.repo, head);
    const original = f.proposals.get(1);
    if (!original) throw Error("missing original fixture");
    original.head_sha = head;
    const inputs = collectResolutionInputs(f.collection);
    const edit = { id: "transition", path: source.path, action, start: 0, end: action === "delete" ? source.bytes.length : 0,
      before_sha256: sha256(source.bytes), replacement_base64: "", after_mode: action === "delete" ? null : "100755" };
    const decisions = inputs.proposals[0].hunks.map(hunk => ({ ...f.decision, hunk_id: hunk.id, edit_ids: [edit.id] }));
    const result = await buildResolution({ ...f.options, inputs, decisions, edits: [edit] });
    expect(result.diagnostics).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.record?.dispositions).toHaveLength(inputs.proposals[0].hunks.length);
    expect(result.record?.postimages[0].after_mode).toBe(action === "delete" ? null : "100755");
    expect(result.record?.postimages[0].after_sha256).toBe(action === "delete" ? null : sha256(source.bytes));
  }
});


test("suppression retirement needs the complete corresponding detector and document collection", async () => {
  const f = setup(), path = "docs/suppressions.yaml", source = f.snapshot.blobs.find(blob => blob.path === path);
  if (!source) throw Error("missing feedback fixture");
  const edit = { ...f.edit, id: "feedback", path, start: 0, end: source.bytes.length, before_sha256: sha256(source.bytes),
    replacement_base64: Buffer.from("suppressions: []\n# retired stale-1 after collection\n").toString("base64") };
  const feedback = { cause: "detector", channel: "suppression", action: "retire", path, edit_id: edit.id,
    finding_id: "stale-1", detector_id: "links", document: "docs/guide.md", policy_quote: f.quote("docs/docs-procedure.md"), delivery_quote: null };
  const decision = { ...f.decision, disposition: "already-fixed", edit_ids: [], feedback };
  const scan: ScanAssessment = { ...f.options.scan, stale_suppressions: [{ id: "stale-1", reason: "No longer applies", document: "docs/guide.md" }],
    detectors: [{ id: "links", options: null, documents: [["docs/guide.md", f.quote("docs/guide.md").sha256]], input_count: 1,
      input_sha256: "a".repeat(64), outcome: "complete", error: null }] };
  const options = { ...f.options, scan, decisions: [decision], edits: [edit] };
  expect((await buildResolution(options)).complete).toBe(true);
  expect((await buildResolution({ ...options, scan: { ...scan, complete: false } })).complete).toBe(false);
  expect((await buildResolution({ ...options, scan: { ...scan, detectors: [] } })).complete).toBe(false);
  expect((await buildResolution({ ...options, scan: { ...scan, detectors: [{ ...scan.detectors[0], documents: [] }] } })).complete).toBe(false);
});
