import { afterAll, expect, test } from "bun:test";
import { chmodSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { ArtifactChanged } from "../../../plugins/vh-adlc/scripts/docs-drift/evidence-input";
import { verifyRoleIdentity } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { evidence, hash, role } from "./manifest-fixture";
import { publicationFixture } from "./publication-fixture";
import { git } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const f = publicationFixture(roots), source = git(f.repo, "rev-parse", "HEAD"), target = hash("original pre-candidate input");
  const original = evidence("original-worker", target, canonicalJSON({ input_sha256: target, edits: [], publication: null }).toString());
  const { records: _records, ...binding } = verifyRoleIdentity(original, role);
  const reference = (path: string, bytes: Uint8Array) => {
    writeFileSync(join(f.artifacts, path), bytes, { mode: 0o600 });
    return { path: relative(f.root, join(f.artifacts, path)), sha256: sha256(bytes) };
  };
  const launch = { schema_version: 1, kind: "docs-drift-role-launch", role: "worker", invocation_id: original.invocation_id,
    context_id: original.context_id, source_commit: source, runtime_sha256: hash("selected approved runtime"), target_sha256: target, pid: original.process.pid };
  const capture = { schema_version: 1, kind: "docs-drift-role-capture", role: "worker", source_commit: source, runtime_sha256: launch.runtime_sha256,
    launch: reference("launch.json", canonicalJSON(launch)), binding, artifacts: {
      native: reference("native.jsonl", original.native), returned: reference("returned.txt", original.returned), process: reference("process.json", canonicalJSON(original.process)) } };
  const captured = reference("capture.json", canonicalJSON(capture));
  return { ...f, original, launch, capture, reference, options: { source_repo: f.repo, artifact_root: f.root, reference: captured,
    expected: { role: "worker" as "worker" | "reviewer", source_commit: source, runtime_sha256: launch.runtime_sha256, target_sha256: target }, policy: role } };
}

test.each(["matching", "role", "source", "runtime", "target", "launch-pid", "launch-target", "launch-context", "launch-runtime", "native", "process", "candidate-native"])("original role captures preserve their actual launch target %s", async scenario => {
  const { readNativeRoleCapture } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-capture");
  const f = fixture(), options = structuredClone(f.options);
  if (scenario === "role") options.expected.role = "reviewer";
  if (scenario === "source") options.expected.source_commit = "a".repeat(40);
  if (scenario === "runtime") options.expected.runtime_sha256 = hash("different runtime");
  if (scenario === "target") options.expected.target_sha256 = hash("target recomputed after capture");
  if (scenario.startsWith("launch-")) {
    if (scenario === "launch-pid") f.launch.pid++;
    if (scenario === "launch-target") f.launch.target_sha256 = hash("unrelated input");
    if (scenario === "launch-context") f.launch.context_id = "another-context";
    if (scenario === "launch-runtime") f.launch.runtime_sha256 = hash("unrelated runtime");
    f.capture.launch = f.reference("launch.json", canonicalJSON(f.launch));
    options.reference = f.reference("capture.json", canonicalJSON(f.capture));
  }
  if (scenario === "native") writeFileSync(join(f.root, f.capture.artifacts.native.path), "{}");
  if (scenario === "process") {
    f.capture.artifacts.process = f.reference("process.json", canonicalJSON({ ...f.original.process, pid: 456 }));
    options.reference = f.reference("capture.json", canonicalJSON(f.capture));
  }
  if (scenario === "candidate-native") {
    const candidate = join(f.root, "candidate"); git(f.root, "clone", "--no-local", f.repo, candidate); chmodSync(candidate, 0o700);
    const path = join(candidate, "native.jsonl"); writeFileSync(path, f.original.native, { mode: 0o600 });
    f.capture.artifacts.native.path = relative(f.root, path); options.reference = f.reference("capture.json", canonicalJSON(f.capture));
    Object.assign(options, { candidate_repo: candidate });
  }
  const before = captureRepositoryState(f.repo);
  if (scenario === "matching") {
    const loaded = readNativeRoleCapture(options);
    expect(loaded.binding.target_sha256).toBe(f.launch.target_sha256);
    expect(loaded.evidence.native).toEqual(f.original.native);
    expect(loaded.evidence.returned).toEqual(f.original.returned);
    expect(loaded.launch.pid).toBe(f.original.process.pid);
  } else {
    const changed = ["role", "source", "runtime", "target", "launch-target", "launch-runtime"].includes(scenario);
    const messages: Record<string, string> = {
      role: "docs-drift original role capture captured context changed", source: "docs-drift original role capture captured context changed",
      runtime: "docs-drift original role capture captured context changed", target: "docs-drift original role capture original launch target or context changed",
      "launch-target": "docs-drift original role capture original launch target or context changed", "launch-runtime": "docs-drift original role capture original launch target or context changed",
      "launch-pid": "docs-drift original role capture original launch and native capture differ", "launch-context": "docs-drift original role capture original launch and native capture differ",
      native: "docs-drift original evidence artifact changed", process: "docs-drift original role capture original launch and native capture differ",
      "candidate-native": "incomplete docs-drift snapshot owned resource overlaps a caller checkout or Git directory",
    };
    expect(() => readNativeRoleCapture(options)).toThrow(messages[scenario]);
    if (changed || scenario === "native") expect(() => readNativeRoleCapture(options)).toThrow(ArtifactChanged);
    else {
      let failure: unknown;
      try { readNativeRoleCapture(options); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error); expect(failure).not.toBeInstanceOf(ArtifactChanged);
    }
  }
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test("legacy captures remain explicitly limited when a caller requires modern invocation or cwd proof", async () => {
  const { readNativeRoleCapture } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-capture");
  const f = fixture();
  expect(readNativeRoleCapture(f.options).binding.context_id).toBe(f.original.context_id);
  expect(() => readNativeRoleCapture({ ...f.options, require_invocation: true })).toThrow("modern invocation capture required");
  expect(() => readNativeRoleCapture({ ...f.options, expected_cwd: f.repo })).toThrow("invocation record required for expected working directory");
});
