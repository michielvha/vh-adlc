/** Toy native processes verify selection. These tests perform no actual model or hosted trial. */
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as bootstrap from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { parseClientBinding } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { fullDefinitionUpgradeFixture, trialDefinitionFixture } from "./trial-definition-fixture";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { publicationFixture } from "./publication-fixture";
import { commit, pin, runtimeIdentity, write } from "./adoption-fixture";
import { settingsFixture } from "./settings-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

async function fixture(upgrade = false) {
  const shared = publicationFixture(roots), prefix = "plugins/vh-adlc/";
  write(shared.repo, prefix + ".claude-plugin/plugin.json", '{"name":"vh-adlc","version":"0.13.0"}\n');
  write(shared.repo, prefix + "scripts/runner.ts", "// Synthetic candidate worker\n");
  const source = commit(shared.repo, "synthetic shared candidate"), component = bootstrap.computeComponentIdentity(shared.repo, source);
  const componentPin = { ...pin(), source_commit: source, plugin_version: component.plugin_version, component_sha256: component.component_sha256 };
  const distribution = Buffer.from("#!/bin/sh\nprintf '%s\\n' 'GitHub Copilot CLI fixture-1.0.0.'\n");
  const client = parseClientBinding({ ...settingsFixture().clients["copilot-linux"], platform: process.platform + "-" + process.arch,
    distribution_sha256: sha256(distribution) });
  const candidateDistribution = upgrade ? Buffer.from(distribution.toString().replace("fixture-1.0.0", "fixture-2.0.0")) : distribution;
  const candidateClient = upgrade ? { ...client, version: "fixture-2.0.0", distribution_sha256: sha256(candidateDistribution) } : client;
  const approvedSource = { pin: componentPin, client };
  const f = upgrade ? fullDefinitionUpgradeFixture(roots, { approved: approvedSource, candidate_client: candidateClient })
    : trialDefinitionFixture(roots, { approved: approvedSource });
  const current = "policySource" in f ? f.policySource : f.staged;
  if (typeof current !== "string") throw Error("missing synthetic trial policy source");
  readGit(f.repo, "switch", "--detach", current);
  const cache = join(f.root, "runtime-cache"); mkdirSync(cache, { mode: 0o700 });
  const retained = bootstrap.retainComponentSnapshot({ cache_directory: cache, consumer_repo: f.repo, source_repo: shared.repo, pin: componentPin });
  const scope = { hostname: f.configured.hostname, repository_id: 10, actor_id: 20, entry: "copilot" as const };
  const setup = { consumer_repo: f.repo, cache_directory: cache, client_id: "copilot-linux", client, profile_scope: scope,
    distribution, format: "executable" as const, executable: "copilot" };
  const approved = await bootstrap.retainClientDistribution(setup);
  writeFileSync(join(approved.profile_directory, "session-marker"), "Synthetic approved session\n");
  const native = await bootstrap.retainClientDistribution({ ...setup, client: candidateClient, distribution: candidateDistribution, profile_scope: { ...scope,
    trial: { definition_sha256: f.trial.definition_sha256, fixture_id: f.definition.fixture.id } } });
  const selection = { repo: f.repo, current_default: current, identity: runtimeIdentity, cache_directory: cache,
    entry: "copilot" as const, definition_sha256: f.trial.definition_sha256,
    launcher_path: join(f.repo, f.candidate_settings.runtime_loader.launcher), settings_path: join(f.repo, f.definition.candidate_settings.path) };
  return { ...f, setup, retained, native, approved, selection };
}

test("candidate selection binds dormant policy, retained package and isolated clients without execution authority", async () => {
  const f = await fixture(), before = captureRepositoryState(f.repo);
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
  const f = await fixture(true), approvedInput = { ...f.selection, settings_path: join(f.repo, ".vh-adlc/docs-drift.yaml") };
  const before = await bootstrap.selectApprovedRuntime(approvedInput);
  const candidate = await bootstrap.selectCandidateRuntime(f.selection);
  const after = await bootstrap.selectApprovedRuntime(approvedInput);
  expect(candidate.worker.client.version).toBe("fixture-2.0.0");
  expect(after.worker.client.version).toBe("fixture-1.0.0");
  expect(after).toEqual(before);
  expect(candidate.worker.profile_directory).not.toBe(after.worker.profile_directory);
});

test("candidate preflight retains its original selection while asynchronous inspection runs", async () => {
  const f = await fixture(), current = f.selection.current_default;
  const pending = bootstrap.selectCandidateRuntime(f.selection);
  Object.assign(f.selection, { entry: "claude", current_default: "0".repeat(40), definition_sha256: "0".repeat(64) });
  const result = await pending;
  expect(result.entry).toBe("copilot");
  expect(result.current_default).toBe(current);
  expect(result.definition_sha256).toBe(f.trial.definition_sha256);
});

test.each(["definition", "settings", "launcher", "profile", "component"] as const)("candidate selection refuses stale or unavailable %s", async scenario => {
  const f = await fixture();
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
  const f = await fixture(), selection = { ...f.selection, identity: { ...runtimeIdentity } };
  if (scenario === "missing") Reflect.deleteProperty(selection, "identity");
  if (scenario === "actor") selection.identity.actor_id += 1;
  if (scenario === "repository") selection.identity.repository_id += 1;
  const reason = scenario === "missing" ? "current native trial identity required" : "incomplete docs-drift adoption current native trial identity";
  await expect(bootstrap.selectCandidateRuntime(selection)).rejects.toThrow(reason);
});
