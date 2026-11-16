/** Owned fake clients only: observes command/environment dispatch, not an actual model operation. */
import { afterAll, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { publicationFixture } from "./publication-fixture";
import { hash, role } from "./manifest-fixture";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { buildCopilotRoleInvocation } from "../../../plugins/vh-adlc/scripts/docs-drift/role-launch";
import { captureNativeRoleProcess } from "../../../plugins/vh-adlc/scripts/docs-drift/role-process";
import { readNativeRoleCapture } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";
import { verifyIndependentRoleReview } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";

const roots: string[] = []; let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed owned role-launch roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("constructed worker and reviewer run in fresh observed contexts and reload as independent native roles", async () => {
  try {
    const f = publicationFixture(roots), executable = join(f.root, "synthetic-copilot");
    writeFileSync(executable, `#!${process.execPath}
const args = process.argv.slice(2), get = flag => args[args.indexOf(flag) + 1];
if (process.env.GH_TOKEN || process.env.NODE_OPTIONS || process.env.COPILOT_AGENT_SESSION_ID || process.env.COPILOT_AUTO_UPDATE !== "false"
  || process.env.COPILOT_PLUGIN_DIR_ONLY !== "1" || process.env.COPILOT_GITHUB_TOKEN !== "synthetic-selected-credential") process.exit(91);
console.log(JSON.stringify({ type: "session.start", data: { sessionId: get("--session-id"), alreadyInUse: false, context: { cwd: process.cwd() } } }));
console.log(JSON.stringify({ type: "fixture.launch", data: { profile: process.env.COPILOT_HOME, args } }));
console.log(JSON.stringify({ type: "assistant.message", data: { model: "claude-opus-5.5", content: "MODEL: claude-opus-5.5\\n" + get("--prompt") } }));
`, { mode: 0o700 });
    const selected = { executable, client: { provider: "copilot" }, model: "opus", argv: ["--no-auto-update"] };
    const runtime = { authentication: "native" as const, component: { directory: join(f.root, "selected-component") }, loader: { provider: "copilot" as const,
      argv: ["--plugin-dir", join(f.root, "selected-component")], credential_references: ["COPILOT_GITHUB_TOKEN"] },
      worker: selected, reviewer: { ...selected } };
    const source = readGit(f.repo, "rev-parse", "HEAD").toString().trim(), before = captureRepositoryState(f.repo);
    const workerTarget = hash("original worker target"), reviewTarget = hash("original review target");
    const base = { source_repo: f.repo, source_commit: source, artifact_root: f.artifacts, policy: role, timeout_ms: 10000 };
    const launch = { runtime, cwd: f.repo, artifact_root: f.artifacts, environment: { PATH: process.env.PATH, HOME: f.root, COPILOT_HOME: join(f.root, "native-profile"),
      COPILOT_GITHUB_TOKEN: "synthetic-selected-credential", GH_TOKEN: "synthetic-ambient-credential", NODE_OPTIONS: "--require=/ambient/code", COPILOT_AGENT_SESSION_ID: "ambient-context" } };
    const worker = await captureNativeRoleProcess({ ...base, ...buildCopilotRoleInvocation({ ...launch, role: "worker",
      prompt: JSON.stringify({ input_sha256: workerTarget, edits: [], publication: null }) + "\n" }),
      role: "worker", target_sha256: workerTarget, runtime_sha256: hash("worker runtime") });
    const reviewer = await captureNativeRoleProcess({ ...base, ...buildCopilotRoleInvocation({ ...launch, role: "reviewer", prompt: "NO FINDINGS\n" }),
      role: "reviewer", target_sha256: reviewTarget, runtime_sha256: hash("reviewer runtime") });
    expect(worker.complete, JSON.stringify(worker.diagnostics)).toBe(true); expect(reviewer.complete, JSON.stringify(reviewer.diagnostics)).toBe(true);
    const load = (result: typeof worker, name: "worker" | "reviewer", target: string) => readNativeRoleCapture({ source_repo: f.repo,
      require_invocation: true, expected_cwd: f.repo,
      artifact_root: f.artifacts, reference: result.capture, policy: role,
      expected: { role: name, source_commit: source, runtime_sha256: hash(name + " runtime"), target_sha256: target } });
    const first = load(worker, "worker", workerTarget), second = load(reviewer, "reviewer", reviewTarget);
    const verified = verifyIndependentRoleReview({ worker: first.evidence, reviewer: second.evidence,
      policy: { worker: role, reviewer: role }, worker_target_sha256: workerTarget, reviewer_target_sha256: reviewTarget });
    expect(verified.nit_count).toBe(0); expect(first.binding.context_id).not.toBe(second.binding.context_id);
    expect(first.binding.invocation_id).not.toBe(second.binding.invocation_id);
    for (const [capture, expected] of [[first, runtime.worker], [second, runtime.reviewer]] as const) {
      const observed = Buffer.from(capture.evidence.native).toString().trim().split("\n").map(line => JSON.parse(line)).find(event => event.type === "fixture.launch");
      expect(observed.data.profile).toBe(launch.environment.COPILOT_HOME); expect(observed.data.args).toContain(expected.model);
      expect(observed.data.args).toContain(runtime.component.directory);
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
});
