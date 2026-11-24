import { afterAll, expect, spyOn, test } from "bun:test";
import { existsSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readOriginalRuntime, selectOriginalOperationRuntime } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { createJournal, readJournal, sealPlan } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { applyRecovery } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery-controller";
import { validateReviewedManifest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { loadCommittedSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { verifyProductionPreflight } from "../../../plugins/vh-adlc/scripts/docs-drift/preflight";
import { bindings, fixture, role } from "./manifest-fixture";
import { activateProtectionSuccessor, commit, ordinaryComponentFixture, preflightFixture } from "./preflight-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function original(recorded?: { actor?: string; actor_id?: number; settings_sha256?: string; hosted?: boolean; projected?: boolean }) {
  const component = ordinaryComponentFixture(roots), f = preflightFixture(roots, "none", { component: component.identity, executable: component.executable },
    recorded?.projected ? repo => writeFileSync(join(repo, "docs/docs-procedure.md"), "---\ndocs_drift_protection: {local_documents: []}\n---\n# Companion\n") : undefined);
  const source = f.head(), loaded = loadCommittedSettings(f.repo, source);
  const entry = recorded?.hosted ? "hosted" : "interactive";
  const identity = { repository: "fixture/docs", repository_id: 10, default_branch: "main",
    actor: recorded?.hosted ? "fixture-bot" : "fixture-owner", actor_id: recorded?.hosted ? 20 : 30 };
  const input = fixture({ ...bindings, source_commit: source, settings_sha256: recorded?.settings_sha256 ?? loaded.settings_sha256 }, [], "original-operation",
    { actor: recorded?.actor ?? identity.actor, actor_id: recorded?.actor_id ?? identity.actor_id, publisher_entry: entry });
  const selectedRole = { ...role, requested_model: loaded.settings.execution.entries[entry].worker.model };
  input.policy = { worker: selectedRole, reviewer: selectedRole };
  const policy = verifyProductionPreflight({ repo: f.repo, current_default: source, component: f.component });
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants,
    schema_version: 2, policy_sha256: policy.policy_sha256, component: f.component,
    ...(recorded?.hosted ? { hosted_executor: { run_id: 501, run_attempt: 2 } } : {}),
    context: "production", transport: "native", publication_kind: "advisory", corrections: [], attention: [] });
  return { ...f, ...component, source, identity, plan };
}

test.each([false, true])("original recovery retains its exact policy after a projected successor, original projected %s", projected => {
  const f = original({ projected }), bytes = canonicalJSON(f.plan);
  activateProtectionSuccessor(f, "---\ndocs_drift_protection: {local_documents: []}\ndocs_drift_local_coverage: {dialect: documentation, terminal_statuses: []}\n---\n# Successor companion\n");
  const selected = readOriginalRuntime({ repo: f.repo, directory: f.directory, plan: f.plan, identity: f.identity });
  expect(selected.source_commit).toBe(f.source);
  expect(selected.policy.policy_sha256).toBe(f.plan.policy_sha256);
  expect(canonicalJSON(f.plan)).toEqual(bytes);
  expect(existsSync(f.calls)).toBe(false);
});

test("original hosted policy retains its executor when selecting the original recovery runtime", async () => {
  const f = original({ hosted: true }), bytes = canonicalJSON(f.plan);
  const runtime = await selectOriginalOperationRuntime({ repo: f.repo, directory: f.directory,
    plan: f.plan, identity: f.identity, entry: "hosted" });
  expect(runtime.policy).toMatchObject({ hosted_executor: { run_id: 501, run_attempt: 2 } });
  expect(runtime.authority).toBe("none");
  expect(existsSync(f.calls)).toBe(false);
  expect(canonicalJSON(f.plan)).toEqual(bytes);
});

test.each(["acknowledgement", "reconciliation"] as const)("hosted %s refuses missing or different executor attribution before recovery input reads", async purpose => {
  const f = original({ hosted: true });
  const journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  for (const executor of [undefined, { run_id: 502, run_attempt: 2 }]) {
    await expect(applyRecovery({ repo: f.repo, source: f.source, artifact_root: f.artifacts,
      journal_directory: journal.directory, cache_directory: f.artifacts, entry: "hosted", owner: "fixture", run: "fixture",
      credential: "synthetic-unused", selection: {}, authority: {}, purpose,
      ...(executor === undefined ? {} : { hosted_executor: executor }) })).rejects.toThrow("Hosted recovery executor identity required");
    expect(readJournal(journal.directory, f.repo).digest).toBe(journal.digest);
    expect(existsSync(f.calls)).toBe(false);
  }
});

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

test.each(["producer", "publication", "local"])("unreleased version-one %s history hands off to its original implementation", async kind => {
  const { source, runtimeIdentity } = await import("./adoption-fixture");
  const { createAdoptedProducerVerifier } = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-producer");
  const { createOwnedObjectStore } = await import("../../../plugins/vh-adlc/scripts/docs-drift/snapshot");
  const { SetupRequired } = await import("../../../plugins/vh-adlc/scripts/docs-drift/settings");
  const f = source(roots), store = createOwnedObjectStore({ parent: f.artifacts, evidence_directory: f.artifacts,
    source_repo: f.repo, source_commit: f.candidate, repository: f.configured.repository, owner: "legacy-history", run: "inspection" });
  if (kind === "producer") {
    expect(() => createAdoptedProducerVerifier({ store, current_default: f.candidate, identity: runtimeIdentity })).toThrow(SetupRequired);
  } else if (kind === "publication") {
    const { createAdoptedPublicationVerifier } = await import("../../../plugins/vh-adlc/scripts/docs-drift/reviewed-publication");
    const repository = { id: 10, full_name: f.configured.repository, default_branch: "main" };
    expect(() => createAdoptedPublicationVerifier({ store, current_default: f.candidate, identity: runtimeIdentity,
      proposal: { number: 1, state: "open", merged_at: null, body: "", draft: true, actor: runtimeIdentity.actor,
        actor_id: runtimeIdentity.actor_id, actor_type: "Bot", head_sha: f.candidate, head_ref: "docs-drift/legacy", head_repository: repository,
        base_sha: f.candidate, base_ref: "main", base_repository: repository } })).toThrow(SetupRequired);
  } else {
    const { createLocalInvocationReader } = await import("../../../plugins/vh-adlc/scripts/docs-drift/local-history");
    expect(() => createLocalInvocationReader({ repo: f.repo, store, current_default: f.candidate, source: f.candidate,
      settings: loadCommittedSettings(f.repo, f.candidate).settings, identity: runtimeIdentity, cache_directory: f.artifacts,
      component_sha256: "a".repeat(64), run_id: "legacy", scope_sha256: "b".repeat(64), started_at: new Date().toISOString(), recheck() {} })).toThrow(SetupRequired);
  }
});


test.each(["recovery", "publication resume"])("version-one %s hands off before any native observation or journal change", async kind => {
  const { publicationFixture } = await import("./publication-fixture");
  const { createJournal, readJournal, readRetainedPlan } = await import("../../../plugins/vh-adlc/scripts/docs-drift/journal");
  const { applyRecovery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery-controller");
  const native = await import("../../../plugins/vh-adlc/scripts/docs-drift/transport");
  const { SetupRequired } = await import("../../../plugins/vh-adlc/scripts/docs-drift/settings");
  const f = publicationFixture(roots), plan = readRetainedPlan(canonicalJSON({ ...f.plan, context: "production", transport: "native" }));
  const journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan }), before = journal.digest;
  const effect = plan.manifest.effects.find(item => item.kind === "pr-create");
  if (!effect) throw Error("Legacy fixture publication effect required");
  const observation = spyOn(native, "readNativeContext").mockImplementation(() => { throw Error("Unexpected native observation"); });
  try {
    const common = { repo: f.repo, source: plan.manifest.bindings.source_commit, artifact_root: f.artifacts,
      journal_directory: journal.directory, cache_directory: f.artifacts, entry: "copilot", owner: "legacy-fixture", run: "legacy-inspection", credential: "synthetic" };
    if (kind === "recovery") {
      const selection = { schema_version: 1, kind: "docs-drift-recovery-selection", source_commit: common.source,
        operation_id: plan.manifest.operation_id, purpose: "acknowledgement", acknowledge_effect_ids: [effect.id],
        retire_effect_ids: [], retirement_lookups: {} };
      await expect(applyRecovery({ ...common, selection, authority: null, purpose: "acknowledgement" })).rejects.toThrow(SetupRequired);
    } else {
      const { resumePublication } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-controller");
      await expect(resumePublication({ ...common, candidate_repo: f.repo, candidate: plan.manifest.bindings.candidate_commit,
        launcher_path: f.repo, settings_path: join(f.repo, ".vh-adlc/docs-drift.yaml"), selection: null, source_verification: null,
        candidate_verification: null, decisions: null, worker_capture: null, reviewer_capture: null, authority: null })).rejects.toThrow(SetupRequired);
    }
    expect(readJournal(journal.directory, f.repo).digest).toBe(before);
    expect(observation).not.toHaveBeenCalled();
  } finally { observation.mockRestore(); }
});
