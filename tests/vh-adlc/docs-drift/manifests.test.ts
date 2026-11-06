import { expect, test } from "bun:test";
import {
  authorizeEffects, bindingDigest, workerInputDigest, effectDigest, manifestDigest, modelMatches,
  validateReviewedManifest, verifyRoleIdentity,
  type ActionManifest, type Effect, type IdentitySource, type NativeRoleEvidence, type RolePolicy,
} from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { parseSettings, settingsProjections } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { settingsFixture } from "./settings-fixture";

const hash = (value: string) => sha256(Buffer.from(value));
const source: IdentitySource = { provider: "copilot", event_type: "assistant.message", field_path: ["data", "model"] };
const role: RolePolicy = { requested_model: "opus", adopted_model: "claude-opus-5.5", identity_source: source };
const bindings = {
  source_commit: "a".repeat(40), candidate_commit: "b".repeat(40), candidate_tree: "c".repeat(40),
  assessment_sha256: hash("assessment"), diff_sha256: hash("diff"), settings_sha256: hash("settings"),
  scanner_sha256: hash("scanner"), options_sha256: hash("options"), scope_sha256: hash("scope"),
  feedback_sha256: hash("feedback"), proposals_sha256: hash("heads and full bodies"),
  decisions_sha256: hash("owner decisions"), dependencies_sha256: hash("dependencies"),
};

function evidence(id: string, target: string, returned: string): NativeRoleEvidence {
  const native = Buffer.from(JSON.stringify({ type: "assistant.message", data: { model: "claude-opus-5.5" } }) + "\n");
  const records = Buffer.from(`MODEL: claude-opus-5.5\n${returned}`);
  return {
    invocation_id: id, context_id: id + "-context", provider: "copilot", target_sha256: target, isolation: "procedural",
    native, native_sha256: sha256(native), returned: records, returned_sha256: sha256(records),
    process: { pid: 123, exit_code: 0, reaped: true, timed_out: false, cancelled: null, output_limit: false },
  };
}

function fixture() {
  const effects: Effect[] = [
    { id: "push", kind: "push", payload: { ref: "refs/heads/docs-drift/one", head: bindings.candidate_commit } },
    { id: "pr", kind: "pr-create", payload: { base: "main", branch: "docs-drift/one", title: "Repair docs", body: "Exact reviewed body\n", labels: ["documentation"], draft: true } },
  ];
  const worker = evidence("worker", workerInputDigest(bindings), canonicalJSON({ input_sha256: workerInputDigest(bindings), edits: [], publication: effects[1].payload }).toString());
  const manifest: ActionManifest = {
    schema_version: 1, operation_id: "operation-1", repository: "fixture/docs", repository_id: 10,
    actor: "fixture-bot", actor_id: 20, bindings, effects,
    worker: { invocation_id: worker.invocation_id, context_id: worker.context_id, native_sha256: worker.native_sha256, returned_sha256: worker.returned_sha256 },
  };
  const reviewer = evidence("reviewer", manifestDigest(manifest), "NO FINDINGS\n");
  const grants = effects.map(effect => ({ manifest_sha256: manifestDigest(manifest), effect_id: effect.id, effect_sha256: effectDigest([effect]) }));
  return { manifest, current: structuredClone(manifest), worker, reviewer, grants, policy: { worker: role, reviewer: role } };
}

test("exact current payloads, explicit grants and independent native roles pass", () => {
  const input = fixture();
  const checked = validateReviewedManifest(input);
  expect(checked.manifest_sha256).toBe(manifestDigest(input.manifest));
  expect(checked.worker.model).toBe("claude-opus-5.5");
  expect(checked.reviewer.returned_sha256).toBe(input.reviewer.returned_sha256);
  expect(Object.isFrozen(checked.manifest.effects[0].payload)).toBe(true);
});

test("every source and payload binding is reobserved, even after unchanged candidate head", () => {
  for (const key of Object.keys(bindings) as (keyof typeof bindings)[]) {
    const input = fixture();
    input.current.bindings[key] = key.endsWith("sha256") ? hash("changed") : "d".repeat(40);
    expect(() => validateReviewedManifest(input)).toThrow("current");
  }
  for (const mutate of [
    (m: ActionManifest) => { m.effects[1].payload.body = "changed body"; },
    (m: ActionManifest) => { m.actor_id++; },
    (m: ActionManifest) => { m.repository_id++; },
    (m: ActionManifest) => { m.effects.reverse(); },
  ]) {
    const input = fixture(); mutate(input.current);
    expect(() => validateReviewedManifest(input)).toThrow();
  }
});

test("missing, stale and broad authority never authorizes selected effects", () => {
  const input = fixture();
  expect(() => validateReviewedManifest({ ...input, grants: input.grants.slice(0, 1) })).toThrow("grant");
  for (const key of ["manifest_sha256", "effect_id", "effect_sha256"] as const) {
    const grants = structuredClone(input.grants); grants[0][key] = "different";
    expect(() => validateReviewedManifest({ ...input, grants })).toThrow("grant");
  }
  const manifest = structuredClone(input.manifest);
  manifest.effects = [{ id: "close", kind: "pr-close", payload: { number: 12, expected_head: "e".repeat(40) } }];
  const closeGrant = [{ manifest_sha256: manifestDigest(manifest), effect_id: "close", effect_sha256: effectDigest(manifest.effects) }];
  authorizeEffects(manifest, closeGrant);
  manifest.effects.push({ id: "comment", kind: "comment-create", payload: { number: 12, body: "explanation" } });
  expect(() => authorizeEffects(manifest, closeGrant)).toThrow("grant");
});

test("diagnostic upload has its own bounded grant and can retain a failed run", () => {
  const { manifest } = fixture();
  manifest.effects = [{ id: "diagnostic", kind: "diagnostic-upload", payload: { run_id: 12, destination: "artifact", name: "docs-drift-12", report_sha256: hash("failed report"), max_bytes: 1024 } }];
  expect(() => authorizeEffects(manifest, [])).toThrow("grant");
  const grants = [{ manifest_sha256: manifestDigest(manifest), effect_id: "diagnostic", effect_sha256: effectDigest(manifest.effects) }];
  expect(authorizeEffects(manifest, grants)).toHaveLength(1);
});

test("requested aliases match their family, full model IDs stay exact", () => {
  expect(modelMatches("opus", "claude-opus-5.5")).toBe(true);
  expect(modelMatches("sonnet", "claude-sonnet-5-5")).toBe(true);
  expect(modelMatches("claude-opus-5.5", "claude-opus-5-5")).toBe(false);
  expect(modelMatches("opus", "claude-sonnet-5.5")).toBe(false);
  expect(modelMatches("opus", "unknown")).toBe(false);
});

test("same-family successor, alias-only, unknown and absent native identities deny effects", () => {
  for (const model of ["claude-opus-5.6", "opus", "unknown", null]) {
    const input = fixture();
    input.worker.native = Buffer.from(JSON.stringify({ type: "assistant.message", data: { model } }));
    input.worker.native_sha256 = sha256(input.worker.native);
    expect(() => validateReviewedManifest(input)).toThrow();
  }
  const input = fixture();
  expect(() => verifyRoleIdentity(input.worker, { ...role, requested_model: "sonnet" })).toThrow();
  expect(() => verifyRoleIdentity(input.worker, { ...role, identity_source: null })).toThrow();
});

test("original bytes, returned header, target and native invocation are bound", () => {
  for (const mutate of [
    (e: NativeRoleEvidence) => { e.native = Buffer.from("changed"); },
    (e: NativeRoleEvidence) => { e.returned = Buffer.from("MODEL: unknown\nNO FINDINGS"); },
    (e: NativeRoleEvidence) => { e.target_sha256 = hash("different target"); },
    (e: NativeRoleEvidence) => { e.process.exit_code = 1; },
    (e: NativeRoleEvidence) => { e.process.reaped = false; },
    (e: NativeRoleEvidence) => { e.process.timed_out = true; },
    (e: NativeRoleEvidence) => { e.process.cancelled = "SIGTERM"; },
    (e: NativeRoleEvidence) => { e.process.output_limit = true; },
  ]) {
    const input = fixture(); mutate(input.reviewer);
    expect(() => validateReviewedManifest(input)).toThrow();
  }
  const input = fixture(); input.reviewer.context_id = input.worker.context_id;
  expect(() => validateReviewedManifest(input)).toThrow("independent");
});

test("conflicting native events cannot hide behind a matching result or body claim", () => {
  const input = fixture();
  input.worker.native = Buffer.concat([input.worker.native, Buffer.from(JSON.stringify({ type: "assistant.message", data: { model: "claude-sonnet-5.5" } }))]);
  input.worker.native_sha256 = sha256(input.worker.native);
  expect(() => verifyRoleIdentity(input.worker, role)).toThrow("identity");
  input.worker.native = Buffer.from(JSON.stringify({ type: "other", data: { model: "claude-opus-5.5" } }));
  input.worker.native_sha256 = sha256(input.worker.native);
  expect(() => verifyRoleIdentity(input.worker, role)).toThrow("identity");
});

test("only complete clean canonical findings allow publication and nits remain honest", () => {
  for (const records of ["NO FINDINGS\nSEVERITY: nit", "FINDING: F-1\nSEVERITY: blocking", "FINDING: F-1\nSEVERITY: should-fix", "Looks fine", "", "NO FINDINGS\nMODEL: claude-opus-5.5"]) {
    const input = fixture(); input.reviewer = evidence("reviewer", manifestDigest(input.manifest), records);
    expect(() => validateReviewedManifest(input)).toThrow();
  }
  const input = fixture();
  input.reviewer = evidence("reviewer", manifestDigest(input.manifest), "FINDING: F-1\nKIND: factual\nSEVERITY: nit\nWHERE: title\nEVIDENCE: detail\nPROPOSAL: detail\n");
  expect(validateReviewedManifest(input).reviewer.model).toBe("claude-opus-5.5");
});

test("malformed manifests cannot smuggle effects, unknown fields or duplicate IDs", () => {
  for (const mutate of [
    (m: ActionManifest) => { m.effects.push(structuredClone(m.effects[0])); },
    (m: ActionManifest) => { m.effects[0].payload.force = true; },
    (m: ActionManifest) => { m.effects[0].payload.ref = "refs/heads/main.lock"; },
    (m: ActionManifest) => { m.effects[0].payload.head = "main"; },
    (m: ActionManifest) => { m.effects[1].payload.labels = ["documentation", "documentation"]; },
  ]) {
    const input = fixture(); mutate(input.manifest);
    expect(() => validateReviewedManifest(input)).toThrow();
  }
});

test("identity selectors are strict committed policy and change protected settings", () => {
  const input = settingsFixture();
  const original = settingsProjections(parseSettings(input));
  const configured = { ...input.execution.entries.hosted.worker, identity_source: source };
  const value = { ...input, execution: { ...input.execution, entries: { ...input.execution.entries, hosted: { ...input.execution.entries.hosted, worker: configured } } } };
  const parsed = parseSettings(value);
  expect(parsed.execution.entries.hosted.worker.identity_source).toEqual(source);
  expect(settingsProjections(parsed).protected).not.toEqual(original.protected);
  for (const identity_source of [
    { ...source, command: ["extract-model"] }, { ...source, provider: "other" },
    { ...source, field_path: [] }, { ...source, field_path: ["__proto__", "model"] },
  ]) {
    expect(() => parseSettings({ ...value, execution: { ...value.execution, entries: { ...value.execution.entries, hosted: { ...value.execution.entries.hosted, worker: { ...configured, identity_source } } } } })).toThrow();
  }
});


test("a later conflicting native metadata event denies the entire invocation", () => {
  const input = fixture();
  input.worker.native = Buffer.concat([input.worker.native, Buffer.from(JSON.stringify({ type: "model.call_final_result", data: { model: "claude-opus-5.6" } }))]);
  input.worker.native_sha256 = sha256(input.worker.native);
  expect(() => verifyRoleIdentity(input.worker, role)).toThrow("identity");
});

test("worker input is fixed before the wrapper creates the candidate checkpoint", () => {
  const changed = { ...bindings, candidate_commit: "d".repeat(40), candidate_tree: "e".repeat(40), diff_sha256: hash("produced diff") };
  expect(workerInputDigest(changed)).toBe(workerInputDigest(bindings));
  expect(bindingDigest(changed)).not.toBe(bindingDigest(bindings));
  expect(workerInputDigest({ ...bindings, source_commit: "f".repeat(40) })).not.toBe(workerInputDigest(bindings));
});

test("receipt retirement, lease release and branch cleanup never share a grant", () => {
  const { manifest } = fixture();
  const payload = { ref: "refs/heads/docs-drift-receipts/old", expected_object: "a".repeat(40) };
  manifest.effects = [{ id: "cleanup", kind: "receipt-retire", payload }];
  const grants = [{ manifest_sha256: manifestDigest(manifest), effect_id: "cleanup", effect_sha256: effectDigest(manifest.effects) }];
  expect(authorizeEffects(manifest, grants)).toHaveLength(1);
  for (const kind of ["lease-release", "merged-branch-delete", "trial-branch-delete"] as const) {
    manifest.effects = [{ id: "cleanup", kind, payload }];
    expect(() => authorizeEffects(manifest, grants)).toThrow("grant");
  }
  manifest.effects = [{ id: "cleanup", kind: "receipt-retire", payload: { ...payload, expected_object: "b".repeat(40) } }];
  expect(() => authorizeEffects(manifest, grants)).toThrow("grant");
});

test("worker output and independent findings retain their exact original bytes", () => {
  for (const mutate of [
    (input: ReturnType<typeof fixture>) => { input.worker.returned = Buffer.from("MODEL: claude-opus-5.5\n{}"); input.worker.returned_sha256 = sha256(input.worker.returned); },
    (input: ReturnType<typeof fixture>) => { input.reviewer = evidence("reviewer", manifestDigest(input.manifest), "FINDING: F-1\nSEVERITY: nit\n"); },
    (input: ReturnType<typeof fixture>) => { input.reviewer = evidence("reviewer", manifestDigest(input.manifest), "FINDING: F-1\nKIND: factual\nSEVERITY: nit\nSEVERITY: nit\nWHERE: x\nEVIDENCE: x\nPROPOSAL: x"); },
  ]) {
    const input = fixture(); mutate(input);
    expect(() => validateReviewedManifest(input)).toThrow();
  }
});

test("bounded edits represent new and deleted paths without inventing absent-file bytes", () => {
  const { manifest } = fixture();
  for (const payload of [
    { path: "docs/new.md", before_sha256: null, after_sha256: hash("new") },
    { path: "docs/old.md", before_sha256: hash("old"), after_sha256: null },
  ]) {
    manifest.effects = [{ id: "edit", kind: "edit", payload }];
    expect(effectDigest(manifest.effects)).toMatch(/^[a-f0-9]{64}$/u);
  }
  manifest.effects = [{ id: "edit", kind: "edit", payload: { path: "docs/absent.md", before_sha256: null, after_sha256: null } }];
  expect(() => effectDigest(manifest.effects)).toThrow();
});

test("native single-result JSON and JSONL retain the same strict identity checks", () => {
  const input = fixture();
  input.worker.native = Buffer.from(JSON.stringify({ type: "assistant.message", data: { model: "claude-opus-5.5" } }, null, 2));
  input.worker.native_sha256 = sha256(input.worker.native);
  expect(verifyRoleIdentity(input.worker, role).model).toBe("claude-opus-5.5");
});
