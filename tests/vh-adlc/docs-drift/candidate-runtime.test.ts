/** Toy native processes verify selection. These tests perform no actual model or hosted trial. */
import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as bootstrap from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { runtimeIdentity } from "./adoption-fixture";
import { runtimeFixture } from "./runtime-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("candidate selection binds dormant policy, retained package and isolated clients without execution authority", async () => {
  const f = await runtimeFixture(roots), before = captureRepositoryState(f.repo);
  const result = await bootstrap.selectCandidateRuntime(f.selection);
  expect(result.authority).toBe("none");
  expect(result.definition_sha256).toBe(f.trial.definition_sha256);
  expect(result.component.directory).toBe(f.retained.directory);
  expect(result.worker.profile_directory).toBe(f.native.profile_directory);
  expect(result.worker.profile_directory).not.toBe(f.approved.profile_directory);
  expect(readFileSync(join(f.approved.profile_directory, "session-marker"), "utf8")).toBe("Synthetic approved session\n");
  expect(captureRepositoryState(f.repo)).toEqual(before);
  await expect(bootstrap.selectApprovedRuntime({ ...f.selection, settings_path: join(f.repo, ".vh-adlc/docs-drift.yaml") })).rejects.toThrow("consumer is not adopted");
});

test("a candidate client upgrade leaves the retained approved runtime usable", async () => {
  const f = await runtimeFixture(roots, true), approvedInput = { ...f.selection, settings_path: join(f.repo, ".vh-adlc/docs-drift.yaml") };
  const before = await bootstrap.selectApprovedRuntime(approvedInput);
  const candidate = await bootstrap.selectCandidateRuntime(f.selection);
  const after = await bootstrap.selectApprovedRuntime(approvedInput);
  expect(candidate.worker.client.version).toBe("fixture-2.0.0");
  expect(after.worker.client.version).toBe("fixture-1.0.0");
  expect(after).toEqual(before);
  expect(candidate.worker.profile_directory).not.toBe(after.worker.profile_directory);
});

test("candidate preflight retains its original selection while asynchronous inspection runs", async () => {
  const f = await runtimeFixture(roots), current = f.selection.current_default;
  const pending = bootstrap.selectCandidateRuntime(f.selection);
  Object.assign(f.selection, { entry: "claude", current_default: "0".repeat(40), definition_sha256: "0".repeat(64) });
  const result = await pending;
  expect(result.entry).toBe("copilot");
  expect(result.current_default).toBe(current);
  expect(result.definition_sha256).toBe(f.trial.definition_sha256);
});

test.each(["definition", "settings", "launcher", "profile", "component"] as const)("candidate selection refuses stale or unavailable %s", async scenario => {
  const f = await runtimeFixture(roots);
  if (scenario === "definition") f.selection.definition_sha256 = "0".repeat(64);
  if (scenario === "settings") writeFileSync(f.selection.settings_path, "Changed candidate settings\n");
  if (scenario === "launcher") writeFileSync(f.selection.launcher_path, "Changed candidate launcher\n");
  if (scenario === "profile") rmSync(f.native.profile_directory, { recursive: true });
  if (scenario === "component") rmSync(f.retained.directory, { recursive: true });
  const reason = { definition: "candidate trial definition changed", settings: "invoked entry bytes differ from committed policy",
    launcher: "invoked entry bytes differ from committed policy", profile: f.native.profile_directory, component: f.retained.directory }[scenario];
  await expect(bootstrap.selectCandidateRuntime(f.selection)).rejects.toThrow(reason);
  expect((await bootstrap.inspectRetainedClient(f.setup)).profile_directory).toBe(f.approved.profile_directory);
});

test.each(["missing", "actor", "repository"] as const)("candidate selection requires the current native %s identity", async scenario => {
  const f = await runtimeFixture(roots), selection = { ...f.selection, identity: { ...runtimeIdentity } };
  if (scenario === "missing") Reflect.deleteProperty(selection, "identity");
  if (scenario === "actor") selection.identity.actor_id += 1;
  if (scenario === "repository") selection.identity.repository_id += 1;
  const reason = scenario === "missing" ? "current native trial identity required" : "incomplete docs-drift adoption current native trial identity";
  await expect(bootstrap.selectCandidateRuntime(selection)).rejects.toThrow(reason);
});
