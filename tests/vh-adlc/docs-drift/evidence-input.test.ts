/** Synthetic original-artifact controls. These fixtures establish no native model execution. */
import { afterAll, expect, test } from "bun:test";
import { chmodSync, linkSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readBoundArtifact, readNativeRoleArtifacts } from "../../../plugins/vh-adlc/scripts/docs-drift/evidence-input";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { sealPlan } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { validateReviewedManifest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { publicationFixture } from "./publication-fixture";
import { fixture, role } from "./manifest-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function inputs() {
  const f = publicationFixture(roots), reviewed = fixture();
  const plan = sealPlan({ reviewed: validateReviewedManifest(reviewed), grants: reviewed.grants,
    adoption_sha256: sha256(Buffer.from("Synthetic adoption")), context: "production", transport: "native",
    publication_kind: "advisory", corrections: [], attention: [] });
  function retain(path: string, bytes: Uint8Array) {
    writeFileSync(join(f.artifacts, path), bytes, { mode: 0o600 });
    return { path, sha256: sha256(bytes) };
  }
  const references = { native: retain("worker-native.jsonl", reviewed.worker.native), returned: retain("worker-returned.txt", reviewed.worker.returned),
    process: retain("worker-process.json", canonicalJSON(reviewed.worker.process)) };
  return { ...f, reviewed, references, retain, options: { source_repo: f.repo, artifact_root: f.artifacts, binding: structuredClone(plan.roles.worker), policy: role } };
}

test("normal evidence loading reads original bound role artifacts", () => {
  const f = inputs(), evidence = readNativeRoleArtifacts({ ...f.options, references: f.references });
  expect(evidence).toEqual(f.reviewed.worker);
  expect(readBoundArtifact({ ...f.options, reference: f.references.native })).toEqual(Buffer.from(f.reviewed.worker.native));
});

test("bound evidence preserves literal nested artifact paths and bytes", () => {
  const f = inputs(), bytes = Buffer.from([0, 255, 13, 10, 1]);
  mkdirSync(join(f.artifacts, "private"), { mode: 0o700 });
  const reference = f.retain("private/literal\\name\nΣ", bytes);
  expect(readBoundArtifact({ ...f.options, reference })).toEqual(bytes);
});

test.each(["changed-native", "changed-returned", "incomplete-process", "wrong-model", "extra-field", "inline-process"] as const)("normal role evidence refuses %s", scenario => {
  const f = inputs();
  if (scenario === "changed-native") writeFileSync(join(f.artifacts, f.references.native.path), "Changed original\n");
  if (scenario === "changed-returned") writeFileSync(join(f.artifacts, f.references.returned.path), "Changed return\n");
  if (scenario === "incomplete-process") f.references.process = f.retain("incomplete.json", canonicalJSON({ ...f.reviewed.worker.process, reaped: false }));
  if (scenario === "wrong-model") {
    f.references.native = f.retain("other-native.jsonl", Buffer.from(JSON.stringify({ type: "assistant.message", data: { model: "claude-opus-5.6" } }) + "\n"));
    f.options.binding = { ...f.options.binding, native_sha256: f.references.native.sha256 };
  }
  const references: unknown = scenario === "extra-field" ? { ...f.references, approved: true }
    : scenario === "inline-process" ? { ...f.references, process: f.reviewed.worker.process } : f.references;
  const reason = { "changed-native": "artifact changed", "changed-returned": "artifact changed", "incomplete-process": "native process incomplete",
    "wrong-model": "adopted native identity", "extra-field": "fields", "inline-process": "fields" }[scenario];
  expect(() => readNativeRoleArtifacts({ ...f.options, references })).toThrow(reason);
});

test.each(["pid", "exit_code", "timed_out", "cancelled", "output_limit"])("role evidence refuses an invalid original process %s", field => {
  const f = inputs(), completion = { ...f.reviewed.worker.process, [field]: field === "pid" ? 0 : field === "cancelled" ? "SIGINT" : true };
  f.references.process = f.retain("invalid-process.json", canonicalJSON(completion));
  expect(() => readNativeRoleArtifacts({ ...f.options, references: f.references })).toThrow("native process incomplete");
});

test.each(["duplicate-key", "pretty", "malformed"])("role evidence refuses process JSON %s", scenario => {
  const f = inputs(), canonical = canonicalJSON(f.reviewed.worker.process).toString();
  const bytes = scenario === "malformed" ? "{" : scenario === "pretty" ? JSON.stringify(f.reviewed.worker.process, null, 2)
    : canonical.replace('"exit_code":0', '"exit_code":1,"exit_code":0');
  f.references.process = f.retain("process-format.json", Buffer.from(bytes));
  expect(() => readNativeRoleArtifacts({ ...f.options, references: f.references })).toThrow("original evidence process JSON");
});

test.each(["model", "requested_model", "identity_source"])("role evidence refuses a stale sealed %s", field => {
  const f = inputs();
  if (field === "model") f.options.binding.model = "claude-opus-5.6";
  if (field === "requested_model") f.options.binding.requested_model = "other-selector";
  if (field === "identity_source") f.options.binding.identity_source = { ...f.options.binding.identity_source, event_type: "other.event" };
  expect(() => readNativeRoleArtifacts({ ...f.options, references: f.references })).toThrow("sealed role binding changed");
});

test.each(["escape", "absolute", "symlink", "hardlink", "shared-file", "linked-parent", "shared-parent", "caller-root"] as const)("bound artifact loading refuses %s", scenario => {
  const f = inputs(), reference = { ...f.references.native }, options = { ...f.options };
  if (scenario === "escape") reference.path = "../" + reference.path;
  if (scenario === "absolute") reference.path = join(f.artifacts, reference.path);
  if (scenario === "symlink") { symlinkSync(reference.path, join(f.artifacts, "linked")); reference.path = "linked"; }
  if (scenario === "hardlink") { linkSync(join(f.artifacts, reference.path), join(f.artifacts, "linked")); reference.path = "linked"; }
  if (scenario === "shared-file") chmodSync(join(f.artifacts, reference.path), 0o644);
  if (scenario === "linked-parent") { symlinkSync(f.artifacts, join(f.artifacts, "alias")); reference.path = "alias/" + reference.path; }
  if (scenario === "shared-parent") {
    mkdirSync(join(f.artifacts, "shared"), { mode: 0o755 });
    chmodSync(join(f.artifacts, "shared"), 0o755);
    f.retain("shared/child", f.reviewed.worker.native); reference.path = "shared/child";
  }
  if (scenario === "caller-root") options.artifact_root = f.repo;
  const reason = { escape: "path", absolute: "path", symlink: "linked artifact", hardlink: "single-link regular artifact required",
    "shared-file": "unsafe private file", "linked-parent": "linked artifact", "shared-parent": "private artifact parent required",
    "caller-root": "owned resource overlaps" }[scenario];
  expect(() => readBoundArtifact({ ...options, reference })).toThrow(reason);
});
