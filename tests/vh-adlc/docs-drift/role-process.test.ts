import { afterAll, expect, test } from "bun:test";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { publicationFixture } from "./publication-fixture";
import { hash, role } from "./manifest-fixture";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readNativeRoleCapture } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

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
if (fault === "nonzero") process.exit(9);
`, { mode: 0o600 });
  return { ...f, options: { source_repo: f.repo, source_commit: source, artifact_root: f.artifacts,
    role: "reviewer" as const, runtime_sha256: hash("retained selected runtime"), target_sha256: hash("exact review target"),
    context_id: context, provider: "copilot", policy: role, cwd: f.repo,
    argv: [process.execPath, script, context, fault], env: { PATH: process.env.PATH ?? "/usr/bin:/bin" }, timeout_ms: fault === "timeout" ? 100 : 10000 } };
}

test("owned role process retains actual launch/native/completion bytes and reloads through the ordinary reader", async () => {
  const { captureNativeRoleProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-process");
  const f = fixture("none"), before = captureRepositoryState(f.repo), result = await captureNativeRoleProcess(f.options);
  expect(result.complete, JSON.stringify(result.diagnostics)).toBe(true); expect(result.authority).toBe("none");
  expect(result.capture).not.toBeNull(); expect(result.process?.pid).toBeGreaterThan(0); expect(result.process?.reaped).toBe(true);
  const loaded = readNativeRoleCapture({ source_repo: f.repo, artifact_root: f.artifacts, reference: result.capture,
    expected: { role: f.options.role, source_commit: f.options.source_commit, runtime_sha256: f.options.runtime_sha256,
      target_sha256: f.options.target_sha256 }, policy: role });
  expect(loaded.evidence.process.pid).toBe(result.process!.pid); expect(loaded.evidence.context_id).toBe(f.options.context_id);
  expect(Buffer.from(loaded.evidence.returned).toString()).toBe("MODEL: claude-opus-5.5\nNO FINDINGS\n");
  expect(loaded.launch.invocation_id).toBe(result.invocation_id); expect(captureRepositoryState(f.repo)).toEqual(before);
  const nextContext = randomUUID();
  const second = await captureNativeRoleProcess({ ...f.options, context_id: nextContext, argv: [...f.options.argv.slice(0, 2), nextContext, "none"] });
  expect(second.complete, JSON.stringify(second.diagnostics)).toBe(true); expect(second.capture).not.toBeNull();
  expect(second.invocation_id).not.toBe(result.invocation_id); expect(result.directory).not.toBe(second.directory);
});

test.each(["context", "model", "nonzero", "timeout", "source-change", "unsupported"])("owned role process keeps failure evidence without a usable capture: %s", async fault => {
  const { captureNativeRoleProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-process");
  const f = fixture(fault), before = captureRepositoryState(f.repo);
  if (fault === "unsupported") f.options.provider = "unsupported";
  const result = await captureNativeRoleProcess(f.options);
  expect(result.complete).toBe(false); expect(result.capture).toBeNull(); expect(result.diagnostics.length).toBeGreaterThan(0);
  if (fault === "unsupported") { expect(result.process).toBeNull(); expect(readdirSync(f.artifacts)).toEqual([]); }
  else {
    expect(result.process?.reaped).toBe(true);
    const completion = JSON.parse(readFileSync(join(result.directory!, "process.json"), "utf8"));
    expect(completion.pid).toBe(result.process!.pid); expect(readdirSync(result.directory!)).toContain("launch.json");
    if (fault === "timeout") expect(completion.timed_out).toBe(true);
    if (fault === "nonzero") expect(completion.exit_code).toBe(9);
  }
  if (fault === "source-change") {
    expect(result.scope_changed).toBe(true); expect(readFileSync(join(f.repo, "README.md"), "utf8")).toContain("Preserve this observed");
  } else expect(captureRepositoryState(f.repo)).toEqual(before);
});
