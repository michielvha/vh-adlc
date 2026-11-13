import { afterAll, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { publicationFixture } from "./publication-fixture";
import { hash, role } from "./manifest-fixture";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readNativeRoleCapture } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";
import { ArtifactChanged } from "../../../plugins/vh-adlc/scripts/docs-drift/evidence-input";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

const roots: string[] = []; let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed owned role-process roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});
async function preserveFailure(run: () => Promise<void>) {
  try { await run(); } catch (error) { failed = true; throw error; }
}

function fixture(fault: string) {
  const f = publicationFixture(roots), context = randomUUID(), source = readGit(f.repo, "rev-parse", "HEAD").toString().trim();
  const script = join(f.root, "native-client.ts");
  writeFileSync(script, `
const context = process.argv[2], fault = process.argv[3];
if (fault === "timeout") await Bun.sleep(30000);
if (fault === "source-change") await Bun.write("README.md", "Preserve this observed synthetic mutation\\n");
console.log(JSON.stringify({ type: "session.start", data: { sessionId: fault === "context" ? "another-context" : context,
  alreadyInUse: false, context: { cwd: process.cwd() } } }));
console.log(JSON.stringify({ type: "assistant.message", data: { model: fault === "model" ? "other-model-1" : "claude-opus-5.5",
  content: "MODEL: claude-opus-5.5\\nNO FINDINGS\\n" } }));
if (fault === "session-error") console.log(JSON.stringify({ type: "session.error", data: { errorType: "synthetic-unavailable", message: "synthetic-private-error-canary" } }));
if (fault === "nonzero") process.exit(9);
`, { mode: 0o600 });
  return { ...f, options: { source_repo: f.repo, source_commit: source, artifact_root: f.artifacts,
    role: "reviewer" as const, runtime_sha256: hash("retained selected runtime"), target_sha256: hash("exact review target"),
    context_id: context, provider: "copilot", policy: role, cwd: f.repo,
    argv: [process.execPath, script, context, fault], env: { PATH: process.env.PATH ?? "/usr/bin:/bin" }, timeout_ms: fault === "timeout" ? 100 : 10000 } };
}

test("owned role process retains actual launch/native/completion bytes and reloads through the ordinary reader", () => preserveFailure(async () => {
  const { captureNativeRoleProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-process");
  const f = fixture("none"), before = captureRepositoryState(f.repo), result = await captureNativeRoleProcess(f.options);
  expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true); expect(result.authority).toBe("none");
  expect(result.capture).not.toBeNull(); expect(result.process?.pid).toBeGreaterThan(0); expect(result.process?.reaped).toBe(true);
  const loaded = readNativeRoleCapture({ source_repo: f.repo, artifact_root: f.artifacts, reference: result.capture,
    require_invocation: true, expected_cwd: f.repo,
    expected: { role: f.options.role, source_commit: f.options.source_commit, runtime_sha256: f.options.runtime_sha256,
      target_sha256: f.options.target_sha256 }, policy: role });
  expect(loaded.evidence.process.pid).toBe(result.process!.pid); expect(loaded.evidence.context_id).toBe(f.options.context_id);
  expect(Buffer.from(loaded.evidence.returned).toString()).toBe("MODEL: claude-opus-5.5\nNO FINDINGS\n");
  expect(loaded.launch.invocation_id).toBe(result.invocation_id); expect(captureRepositoryState(f.repo)).toEqual(before);
  const nextContext = randomUUID();
  const second = await captureNativeRoleProcess({ ...f.options, context_id: nextContext, argv: [...f.options.argv.slice(0, 2), nextContext, "none"] });
  expect(second.complete, JSON.stringify(second.diagnostics)).toBe(true); expect(second.capture).not.toBeNull();
  expect(second.invocation_id).not.toBe(result.invocation_id); expect(result.directory).not.toBe(second.directory);
}));

test.each(["context", "model", "nonzero", "timeout", "source-change", "unsupported", "session-error"])("owned role process keeps failure evidence without a usable capture: %s", fault => preserveFailure(async () => {
  const { captureNativeRoleProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-process");
  const f = fixture(fault), before = captureRepositoryState(f.repo);
  if (fault === "unsupported") f.options.provider = "unsupported";
  const result = await captureNativeRoleProcess(f.options);
  expect(result.complete).toBe(false); expect(result.capture).toBeNull(); expect(result.diagnostics.length).toBeGreaterThan(0);
  if (fault === "unsupported") { expect(result.process).toBeNull(); expect(readdirSync(f.artifacts)).toEqual([]); }
  else {
    expect(result.artifacts.native).not.toBeNull(); expect(result.artifacts.stderr).not.toBeNull(); expect(result.artifacts.process).not.toBeNull();
    for (const ref of Object.values(result.artifacts)) if (ref) expect(sha256(readFileSync(join(f.artifacts, ref.path)))).toBe(ref.sha256);
    expect(result.process?.reaped).toBe(true);
    const completion = JSON.parse(readFileSync(join(result.directory!, "process.json"), "utf8"));
    expect(completion.pid).toBe(result.process!.pid); expect(readdirSync(result.directory!)).toContain("launch.json");
    if (fault === "timeout") expect(completion.timed_out).toBe(true);
    if (fault === "nonzero") expect(completion.exit_code).toBe(9);
    if (fault === "session-error") {
      expect(result.diagnostics.join("\n")).toContain("synthetic-unavailable");
      expect(result.diagnostics.join("\n")).not.toContain("synthetic-private-error-canary");
    }
  }
  if (fault === "source-change") {
    expect(result.scope_changed).toBe(true); expect(readFileSync(join(f.repo, "README.md"), "utf8")).toContain("Preserve this observed");
  } else expect(captureRepositoryState(f.repo)).toEqual(before);
}));

test("launch-record failure still retains real completion and refuses a usable capture", () => preserveFailure(async () => {
  const { captureNativeRoleProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-process");
  const f = fixture("none"), original = fs.linkSync;
  const fault = spyOn(fs, "linkSync").mockImplementation((from, to) => {
    if (String(to).endsWith("/launch.json")) throw Error("Synthetic launch publication failure");
    return original(from, to);
  });
  try {
    const result = await captureNativeRoleProcess(f.options);
    expect(result.complete).toBe(false); expect(result.capture).toBeNull(); expect(result.process?.pid).toBeGreaterThan(0);
    expect(result.process?.reaped).toBe(true); expect(result.artifacts.process).not.toBeNull();
    expect(result.diagnostics.join("\n")).toContain("Synthetic launch publication failure");
  } finally { fault.mockRestore(); }
}));

test.each(["native-context", "native-cwd", "later-finding", "invocation-target", "removed-invocation", "legacy-downgrade", "invocation-cwd"])("reopened new capture rechecks native launch and actual final reply: %s", fault => preserveFailure(async () => {
  const { captureNativeRoleProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-process");
  const f = fixture("none"), result = await captureNativeRoleProcess(f.options); expect(result.complete).toBe(true);
  const capture = JSON.parse(readFileSync(join(f.artifacts, result.capture!.path), "utf8"));
  const write = (ref: { path: string; sha256: string }, bytes: Uint8Array) => { writeFileSync(join(f.artifacts, ref.path), bytes, { mode: 0o600 }); return { path: ref.path, sha256: sha256(bytes) }; };
  if (["removed-invocation", "legacy-downgrade"].includes(fault)) {
    delete capture.invocation;
    if (fault === "legacy-downgrade") capture.schema_version = 1;
  } else if (fault === "invocation-target") {
    const invocation = JSON.parse(readFileSync(join(f.artifacts, capture.invocation.path), "utf8")); invocation.target_sha256 = hash("changed target");
    capture.invocation = write(capture.invocation, canonicalJSON(invocation));
  } else {
    const frames = readFileSync(join(f.artifacts, capture.artifacts.native.path), "utf8").trim().split("\n").map(line => JSON.parse(line));
    if (fault === "native-context") frames[0].data.sessionId = randomUUID();
    if (["native-cwd", "invocation-cwd"].includes(fault)) frames[0].data.context.cwd = "/different/source";
    if (fault === "invocation-cwd") {
      const invocation = JSON.parse(readFileSync(join(f.artifacts, capture.invocation.path), "utf8")); invocation.cwd = "/different/source";
      capture.invocation = write(capture.invocation, canonicalJSON(invocation));
    }
    if (fault === "later-finding") frames.push({ type: "assistant.message", data: { model: "claude-opus-5.5", content: "MODEL: claude-opus-5.5\nA later finding\n" } });
    capture.artifacts.native = write(capture.artifacts.native, Buffer.from(frames.map(frame => JSON.stringify(frame)).join("\n") + "\n"));
    capture.binding.native_sha256 = capture.artifacts.native.sha256;
  }
  const reference = write(result.capture!, canonicalJSON(capture));
  const reasons: Record<string, string> = {
    "native-context": "Native role fresh context changed", "native-cwd": "Native role fresh context changed",
    "later-finding": "docs-drift original role capture returned reply differs from final native message",
    "invocation-target": "docs-drift original role invocation changed",
    "removed-invocation": "docs-drift original role capture modern invocation record required",
    "legacy-downgrade": "docs-drift original role capture modern invocation capture required",
    "invocation-cwd": "docs-drift original role working directory changed",
  };
  const reopen = () => readNativeRoleCapture({ source_repo: f.repo, artifact_root: f.artifacts, reference, policy: role,
    require_invocation: true, expected_cwd: f.repo,
    expected: { role: f.options.role, source_commit: f.options.source_commit, runtime_sha256: f.options.runtime_sha256, target_sha256: f.options.target_sha256 } });
  expect(reopen).toThrow(reasons[fault]);
  if (["invocation-cwd", "invocation-target"].includes(fault)) expect(reopen).toThrow(ArtifactChanged);
}));
