/** Claude-shaped toy processes exercise source capture. No Claude model or hosted trial runs here. */
import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { publicationFixture } from "./publication-fixture";
import { hash, role } from "./manifest-fixture";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { captureNativeRoleProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/role-process";
import { readNativeRoleCapture } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";
import { decodeNativeRoleOutput } from "../../../plugins/vh-adlc/scripts/docs-drift/native-role-output";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

const roots: string[] = [], preserved = new Set<string>();
afterAll(() => {
  for (const root of roots) if (!preserved.has(root)) rmSync(root, { recursive: true, force: true });
  if (preserved.size) console.error("Preserved failed Claude role fixtures", JSON.stringify([...preserved]));
});
const policy = { ...role, identity_source: { provider: "claude" as const, event_type: "assistant", field_path: ["message", "model"] } };
function frames(context: string, cwd: string) {
  return [
    { type: "system", subtype: "init", session_id: context, cwd, model: "claude-opus-5.5" },
    { type: "assistant", session_id: context, message: { model: "claude-opus-5.5", content: [{ type: "text", text: "MODEL: claude-opus-5.5\nNO FINDINGS\n" }] } },
    { type: "result", subtype: "success", session_id: context, is_error: false, result: "MODEL: claude-opus-5.5\nNO FINDINGS\n" },
  ];
}
function fixture(fault = "none") {
  const f = publicationFixture(roots), context = randomUUID(), source = readGit(f.repo, "rev-parse", "HEAD").toString().trim();
  const script = join(f.root, "claude-shaped-client.ts");
  writeFileSync(script, `
const context = process.argv[2], fault = process.argv[3];
if (fault === 'timeout') await Bun.sleep(30000);
if (fault === 'source-change') await Bun.write('README.md', 'Preserve this synthetic observed mutation\\n');
const frames = ${frames.toString()}(fault === 'context' ? 'other-context' : context, fault === 'cwd' ? '/other/source' : process.cwd());
if (fault === 'model') frames[1].message.model = 'other-model-1';
if (fault === 'result-error') { frames[2].is_error = true; frames[2].subtype = 'error_during_execution'; frames[2].errors = ['synthetic-private-error-canary']; }
if (fault === 'missing-result') frames.pop();
if (fault === 'late-error') frames.push({ type: 'result', subtype: 'error_during_execution', session_id: context, is_error: true });
for (const frame of frames) console.log(JSON.stringify(frame));
if (fault === 'nonzero') process.exit(9);
`, { mode: 0o600 });
  return { ...f, options: { source_repo: f.repo, source_commit: source, artifact_root: f.artifacts, role: "reviewer" as const,
    runtime_sha256: hash("selected Claude runtime"), target_sha256: hash("exact source review"), context_id: context, provider: "claude", policy,
    argv: [process.execPath, script, context, fault], cwd: f.repo, env: { PATH: process.env.PATH ?? "/usr/bin:/bin" }, timeout_ms: fault === "timeout" ? 100 : 10000 } };
}

test("a Claude-shaped owned process retains and reopens its final original reply", async () => {
  const f = fixture(), before = captureRepositoryState(f.repo);
  try {
    const result = await captureNativeRoleProcess(f.options);
    expect(result.complete, result.diagnostics.join("\n")).toBe(true); expect(result.authority).toBe("none");
    const reopened = readNativeRoleCapture({ source_repo: f.repo, artifact_root: f.artifacts, reference: result.capture,
      require_invocation: true, expected_cwd: f.repo, policy,
      expected: { role: f.options.role, source_commit: f.options.source_commit, runtime_sha256: f.options.runtime_sha256, target_sha256: f.options.target_sha256 } });
    expect(reopened.evidence.provider).toBe("claude"); expect(reopened.evidence.context_id).toBe(f.options.context_id);
    expect(reopened.binding.model).toBe("claude-opus-5.5"); expect(reopened.evidence.returned.toString()).toBe("MODEL: claude-opus-5.5\nNO FINDINGS\n");
    expect(reopened.launch.invocation_id).toBe(result.invocation_id); expect(result.process?.reaped).toBe(true);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserved.add(f.root); throw error; }
});

test.each(["context", "cwd", "model", "result-error", "missing-result", "late-error", "nonzero", "timeout", "source-change"])("Claude role capture refuses %s and retains its original failure evidence", async fault => {
  const f = fixture(fault), before = captureRepositoryState(f.repo);
  try {
    const result = await captureNativeRoleProcess(f.options);
    expect(result.complete).toBe(false); expect(result.capture).toBeNull(); expect(result.process?.reaped).toBe(true);
    expect(result.artifacts.native).not.toBeNull(); expect(result.artifacts.process).not.toBeNull();
    for (const reference of Object.values(result.artifacts)) if (reference)
      expect(sha256(readFileSync(join(f.artifacts, reference.path)))).toBe(reference.sha256);
    expect(result.diagnostics.join("\n")).not.toContain("synthetic-private-error-canary");
    if (fault === "source-change") { expect(result.scope_changed).toBe(true); expect(readFileSync(join(f.repo, "README.md"), "utf8")).toContain("Preserve this synthetic"); }
    else expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { preserved.add(f.root); throw error; }
});

test.each(["duplicate-init", "missing-init", "wrong-result-context", "uncanonical-final", "result-before-init"])("Claude original decoding refuses %s", fault => {
  const context = randomUUID(), native = frames(context, "/owned/source");
  if (fault === "duplicate-init") native.splice(1, 0, native[0]);
  if (fault === "missing-init") native.shift();
  if (fault === "wrong-result-context") native[2].session_id = randomUUID();
  if (fault === "uncanonical-final") native[2].result = "A later invalid reply";
  if (fault === "result-before-init") native.reverse();
  expect(() => decodeNativeRoleOutput({ provider: "claude", native: Buffer.from(native.map(row => JSON.stringify(row)).join("\n")),
    expected_context: context, expected_cwd: "/owned/source" })).toThrow();
});

test("a reopened Claude capture verifies the original final result again", async () => {
  const f = fixture();
  try {
    const result = await captureNativeRoleProcess(f.options); expect(result.complete).toBe(true);
    if (!result.capture) throw Error("Original toy capture unavailable");
    const reference = result.capture;
    const capture = JSON.parse(readFileSync(join(f.artifacts, reference.path), "utf8"));
    const native = frames(f.options.context_id, f.repo); native[2].result = "MODEL: claude-opus-5.5\nA later changed verdict\n";
    const bytes = Buffer.from(native.map(frame => JSON.stringify(frame)).join("\n") + "\n");
    writeFileSync(join(f.artifacts, capture.artifacts.native.path), bytes);
    capture.artifacts.native.sha256 = sha256(bytes); capture.binding.native_sha256 = sha256(bytes);
    const record = canonicalJSON(capture); writeFileSync(join(f.artifacts, reference.path), record);
    expect(() => readNativeRoleCapture({ source_repo: f.repo, artifact_root: f.artifacts,
      reference: { path: reference.path, sha256: sha256(record) }, require_invocation: true, expected_cwd: f.repo, policy,
      expected: { role: f.options.role, source_commit: f.options.source_commit, runtime_sha256: f.options.runtime_sha256, target_sha256: f.options.target_sha256 } }))
      .toThrow("returned reply differs from final native message");
  } catch (error) { preserved.add(f.root); throw error; }
});
