import { afterAll, expect, test } from "bun:test";
import { existsSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readOriginalRuntime } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { sealPlan } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { validateReviewedManifest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { loadCommittedSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { verifyProductionPreflight } from "../../../plugins/vh-adlc/scripts/docs-drift/preflight";
import { bindings, fixture, role } from "./manifest-fixture";
import { commit, ordinaryComponentFixture, preflightFixture } from "./preflight-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function original(recorded?: { actor?: string; actor_id?: number; settings_sha256?: string }) {
  const component = ordinaryComponentFixture(roots), f = preflightFixture(roots, "none", { component: component.identity, executable: component.executable });
  const source = f.head(), loaded = loadCommittedSettings(f.repo, source);
  const identity = { repository: "fixture/docs", repository_id: 10, default_branch: "main", actor: "fixture-owner", actor_id: 30 };
  const input = fixture({ ...bindings, source_commit: source, settings_sha256: recorded?.settings_sha256 ?? loaded.settings_sha256 }, [], "original-operation",
    { actor: recorded?.actor ?? identity.actor, actor_id: recorded?.actor_id ?? identity.actor_id, publisher_entry: "interactive" });
  const selectedRole = { ...role, requested_model: loaded.settings.execution.entries.interactive.worker.model };
  input.policy = { worker: selectedRole, reviewer: selectedRole };
  const policy = verifyProductionPreflight({ repo: f.repo, current_default: source, component: f.component });
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants,
    schema_version: 2, policy_sha256: policy.policy_sha256, component: f.component,
    context: "production", transport: "native", publication_kind: "advisory", corrections: [], attention: [] });
  return { ...f, ...component, source, identity, plan };
}

test.each(["matching", "recased", "successor-schema", "rollback-staged", "missing-client"] as const)("original runtime metadata reopens its recorded policy without a native probe after %s", scenario => {
  const f = original(), bytes = canonicalJSON(f.plan);
  if (scenario === "recased") f.identity.actor = "Fixture-Owner";
  if (scenario === "successor-schema" || scenario === "rollback-staged") {
    const settings = { ...f.afterSettings, publication: { ...f.afterSettings.publication,
      mode: scenario === "rollback-staged" ? "staged" : "adopted" }, successor_only_field: "original release does not know this" };
    f.write(".vh-adlc/docs-drift.yaml", canonicalJSON(settings)); commit(f.repo, "Synthetic successor configuration");
    expect(() => loadCommittedSettings(f.repo, f.head())).toThrow();
  }
  if (scenario === "missing-client") unlinkSync(f.executable);
  const selected = readOriginalRuntime({ repo: f.repo, directory: f.directory, plan: f.plan, identity: f.identity });
  expect(selected.authority).toBe("none");
  expect(selected.source_commit).toBe(f.source);
  expect(selected.policy.policy_sha256).toBe(f.plan.policy_sha256);
  expect(selected.policy.worker.adopted_model).toBe(f.plan.roles.worker.model);
  expect(existsSync(f.calls)).toBe(false);
  expect(canonicalJSON(f.plan).equals(bytes)).toBe(true);
});

test.each(["publisher-id", "publisher-login", "repository-id", "policy", "component", "payload"] as const)("original runtime metadata refuses changed %s", scenario => {
  const f = original();
  f.plan = structuredClone(f.plan);
  if (scenario === "publisher-id") f.identity.actor_id += 1;
  if (scenario === "publisher-login") f.identity.actor = "different-owner";
  if (scenario === "repository-id") f.identity.repository_id += 1;
  if (scenario === "policy") f.plan.policy_sha256 = "f".repeat(64);
  if (scenario === "component") f.plan.component.component_sha256 = "f".repeat(64);
  if (scenario === "payload") writeFileSync(join(f.directory, "extra.txt"), "unreleased input\n");
  expect(() => readOriginalRuntime({ repo: f.repo, directory: f.directory, plan: f.plan, identity: f.identity })).toThrow();
  expect(existsSync(f.calls)).toBe(false);
});


test.each(["account", "settings"] as const)("an internally sealed plan cannot borrow another original %s policy", scenario => {
  const f = original(scenario === "account" ? { actor_id: 31 } : { settings_sha256: "f".repeat(64) });
  expect(() => readOriginalRuntime({ repo: f.repo, directory: f.directory, plan: f.plan, identity: f.identity })).toThrow();
  expect(existsSync(f.calls)).toBe(false);
});
