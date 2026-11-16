import { afterAll, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { publicationFixture } from "./publication-fixture";
import { git, populateRepository, put } from "./repository-fixture";
import { installOwnedNativeService } from "./original-publication-fixture";
import { commit, ordinaryComponentFixture } from "./preflight-fixture";
import { bindings, fixture as manifestFixture } from "./manifest-fixture";
import { installedSettingsFixture } from "./settings-fixture";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { readNativeTrialPolicy, readNativeTrialSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/trial-definition";
import { loadCommittedSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { verifyProductionPreflight } from "../../../plugins/vh-adlc/scripts/docs-drift/preflight";
import type { WorkflowRunInput } from "../../../plugins/vh-adlc/scripts/github-read";
import { sealPlan, type PolicyBinding } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { runtimePolicyBinding, selectNativeTrialRuntime, selectOriginalOperationRuntime } from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { readAdoptedRolePolicy, roleRuntimeDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/role-capture";
import type { ComponentBinding } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";

const roots: string[] = [];
let preserveFailedRoots = false;
afterAll(() => {
  if (preserveFailedRoots) console.error("Preserved failed native trial roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function nativeFixture(component?: ComponentBinding) {
  const f = publicationFixture(roots);
  populateRepository(f.repo, false);
  const settings = installedSettingsFixture(), workflow = ".github/workflows/docs-drift-trial.yml";
  if (component) {
    const { plugin_version, source_commit, component_sha256 } = component;
    settings.component = { plugin_version, source_commit, component_sha256 };
  }
  for (const entry of Object.values(settings.execution.entries)) for (const role of [entry.worker, entry.reviewer]) {
    Object.assign(role, { model: "claude-opus-5.5", identity_source: { provider: "copilot", event_type: "assistant.message", field_path: ["data", "model"] } });
  }
  const definition = { schema_version: 2, kind: "docs-drift-native-trial", entry: "hosted", component: settings.component,
    identity: { hostname: settings.hostname, repository: settings.repository, repository_id: 10, default_branch: "main", actor: "fixture-bot", actor_id: 20 },
    workflow: { id: 101, path: workflow, event: "workflow_dispatch" }, models: { worker: "claude-opus-5.5", reviewer: "claude-opus-5.5" },
    namespace: { branch_prefix: "docs-drift-trial/", lease_ref: "refs/heads/docs-drift-trial-lease", receipt_ref_prefix: "refs/heads/docs-drift-trial-receipts/",
      paths: ["docs/trial/"] } };
  const definitionPath = ".vh-adlc/docs-drift-trial.yaml";
  function save() {
    put(f.repo, definitionPath, canonicalJSON(definition).toString());
    put(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...settings,
      publication: { ...settings.publication, mode: "staged", checklist_path: null },
      trial: { definition_path: definitionPath, definition_sha256: sha256(canonicalJSON(definition)) } }).toString());
    return commit(f.repo, "Declare the bounded synthetic trial before activation");
  }
  put(f.repo, workflow, canonicalJSON({ on: { workflow_dispatch: null }, jobs: {} }).toString());
  const source = save(), repository = { id: 10, full_name: "fixture/docs", default_branch: "main" };
  const run: WorkflowRunInput = { id: 501, run_attempt: 2, workflow_id: 101, path: workflow, event: "workflow_dispatch", status: "in_progress", conclusion: null,
    head_sha: source, head_branch: "main", repository, head_repository: repository, created_at: "2000-01-01T00:00:00Z", updated_at: "2000-01-01T00:00:00Z" };
  const identity = { repository: "fixture/docs", repository_id: 10, actor: "fixture-bot", actor_id: 20, default_branch: "main" };
  const calls: [number, number][] = [];
  const reader = { run(id: number, attempt: number) { calls.push([id, attempt]); return run; } };
  const input = { repo: f.repo, current_default: source, identity, entry: "hosted", reader, run_id: 501, run_attempt: 2 };
  return { ...f, input, run, identity, calls, source, definition, save, workflow, settings };
}

test("native trial policy binds observed launch metadata before a production checklist exists", () => {
  const f = nativeFixture(), result = readNativeTrialPolicy(f.input);
  expect(result.authority).toBe("none");
  expect(result.policy.schema_version).toBe(2);
  expect(result.policy.context).toBe("trial"); expect(result.policy.transport).toBe("native");
  expect(f.calls).toEqual([[501, 2]]);
  expect(result.policy.trial_launch).toMatchObject({ repository_id: 10, actor: "fixture-bot", actor_id: 20,
    workflow_id: 101, workflow_path: f.workflow, event: "workflow_dispatch", head_commit: f.source, run_id: 501, run_attempt: 2 });
  const settings = loadCommittedSettings(f.repo, f.source).settings;
  expect(() => verifyProductionPreflight({ repo: f.repo, current_default: f.source, component: f.definition.component })).toThrow();
  expect(settings.publication.mode).toBe("staged");
});

test("native trial repository and publisher names retain case-insensitive account identity", () => {
  const f = nativeFixture();
  f.identity.repository = "Fixture/Docs"; f.identity.actor = "Fixture-Bot";
  f.run.repository.full_name = "Fixture/Docs";
  expect(readNativeTrialPolicy(f.input).policy.trial_launch).toMatchObject({ repository: "Fixture/Docs", actor: "Fixture-Bot", actor_id: 20 });
});

test("trial observation refuses an unselected definition digest before native reads", () => {
  const f = nativeFixture();
  expect(() => readNativeTrialSettings({ repo: f.repo, source: f.source, definition_sha256: "f".repeat(64) })).toThrow("selected original trial definition changed");
  expect(f.calls).toEqual([]);
});

test.each(["event", "head", "workflow-id", "workflow-path", "repository", "fork", "run-id", "attempt", "publisher-id", "publisher-login"] as const)("native trial policy refuses mismatched %s", field => {
  const f = nativeFixture();
  if (field === "event") f.run.event = "push";
  if (field === "head") f.run.head_sha = "f".repeat(40);
  if (field === "workflow-id") f.run.workflow_id = 102;
  if (field === "workflow-path") f.run.path = ".github/workflows/foreign.yml";
  if (field === "repository") f.run.repository = { id: 11, full_name: "other/docs" };
  if (field === "fork") f.run.head_repository = { id: 11, full_name: "other/docs" };
  if (field === "run-id") f.run.id++;
  if (field === "attempt") f.run.run_attempt++;
  if (field === "publisher-id") f.identity.actor_id++;
  if (field === "publisher-login") f.identity.actor = "another-publisher";
  expect(() => readNativeTrialPolicy(f.input)).toThrow();
});

test("the dispatching actor supplies no publisher identity", () => {
  const f = nativeFixture();
  Object.assign(f.run, { actor: { login: "fixture-owner", id: 30 }, triggering_actor: { login: "fixture-owner", id: 30 } });
  expect(readNativeTrialPolicy(f.input).policy.trial_launch.actor_id).toBe(20);
});

test.each(["component", "trigger", "namespace", "discovery", "paths", "model"] as const)("native trial policy refuses invalid committed %s", field => {
  const f = nativeFixture();
  if (field === "component") f.definition.component = { ...f.definition.component, component_sha256: "f".repeat(64) };
  if (field === "trigger") put(f.repo, f.workflow, canonicalJSON({ on: { push: null }, jobs: {} }).toString());
  if (field === "namespace") f.definition.namespace.branch_prefix = "docs-drift/";
  if (field === "discovery") f.settings.pr_discovery.branch_prefixes.push(f.definition.namespace.branch_prefix);
  if (field === "paths") f.definition.namespace.paths = ["src"];
  if (field === "model") f.definition.models.worker = "foreign-model-99";
  f.input.current_default = f.save(); f.run.head_sha = f.input.current_default;
  expect(() => readNativeTrialPolicy(f.input)).toThrow();
});

test("original native trial runtime reopens its retained launch after a successor schema without probing a client", async () => {
  const component = ordinaryComponentFixture(roots), f = nativeFixture(component.identity);
  const selected = readNativeTrialPolicy(f.input), input = manifestFixture({ ...bindings, source_commit: f.source,
    settings_sha256: loadCommittedSettings(f.repo, f.source).settings_sha256 }, [], "native-trial-original",
    { actor: "fixture-bot", actor_id: 20, publisher_entry: "hosted" });
  input.policy = { worker: selected.policy.worker, reviewer: selected.policy.reviewer };
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, ...selected.policy, corrections: [], attention: [] });
  const originalBytes = canonicalJSON(plan);
  put(f.repo, ".vh-adlc/docs-drift.yaml", "schema_version: 999\n"); commit(f.repo, "Synthetic successor schema");
  rmSync(component.executable); f.identity.actor = "Fixture-Bot";
  const runtime = await selectOriginalOperationRuntime({ repo: f.repo, directory: component.directory, plan, identity: f.identity,
    entry: "hosted" });
  expect(runtime.kind).toBe("docs-drift-original-runtime");
  await expect(selectOriginalOperationRuntime({ repo: f.repo, directory: component.directory, plan,
    identity: { ...f.identity, actor_id: f.identity.actor_id + 1 }, entry: "hosted" }))
    .rejects.toThrow("original operation native identity changed");
  expect(canonicalJSON(plan)).toEqual(originalBytes);
  expect(f.calls).toEqual([[501, 2]]);
  expect(existsSync(component.calls)).toBe(false);
}, 60000);

test.each(["valid", "event", "publisher", "payload"] as const)("ordinary native trial selection checks native observations and installed bytes (%s)", async scenario => {
  const component = ordinaryComponentFixture(roots), f = nativeFixture(component.identity);
  f.settings.clients.copilot.executable = component.executable;
  const source = f.save(); f.run.head_sha = source;
  const origin = join(f.root, "trial-origin.git");
  git(f.root, "clone", "--bare", "--no-local", f.repo, origin);
  const service = installOwnedNativeService({ root: f.root, origin, source, head: source, publisher_identity: f.identity });
  const state = JSON.parse(readFileSync(service.statePath, "utf8"));
  state.workflow_runs = [f.run];
  if (scenario === "event") state.workflow_runs[0].event = "push";
  if (scenario === "publisher") state.viewer_id = 30;
  if (scenario === "payload") writeFileSync(join(component.directory, "unreleased.txt"), "Unexpected installed input\n");
  writeFileSync(service.statePath, JSON.stringify(state));
  const operation = selectNativeTrialRuntime({ repo: f.repo, current_default: source, directory: component.directory,
    entry: "hosted", credential: "synthetic-native-token", path: join(f.root, "native-bin") + ":" + process.env.PATH,
    run_id: 501, run_attempt: 2, definition_sha256: sha256(canonicalJSON(f.definition)) });
  if (scenario !== "valid") {
    await expect(operation).rejects.toThrow();
    expect(existsSync(component.calls)).toBe(false);
    return;
  }
  const selected = await operation;
  expect(selected.kind).toBe("docs-drift-native-trial-runtime");
  expect(selected.runtime.authentication).toBe("native");
  expect(selected.trial.policy).toMatchObject({ context: "trial", transport: "native", publisher_entry: "hosted" });
  expect(selected.trial.policy.trial_launch).toMatchObject({ actor_id: 20, run_id: 501, run_attempt: 2, head_commit: source });
  expect(runtimePolicyBinding(selected)).toMatchObject({ trial_launch: selected.trial.policy.trial_launch });
  expect(readAdoptedRolePolicy({ repo: f.repo, current_default: source, identity: f.identity, runtime: selected, role: "worker" })).toEqual(selected.trial.policy.worker);
  expect(roleRuntimeDigest(selected, "worker")).not.toBe(roleRuntimeDigest(selected.runtime, "worker"));
  expect(readFileSync(component.calls, "utf8").trim().split("\n")).toHaveLength(2);
  const { auditClient } = await import("./native-audit-client-fixture");
  const { captureConfiguredRole } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-process");
  const { readNativeRoleCapture } = await import("../../../plugins/vh-adlc/scripts/docs-drift/role-capture");
  writeFileSync(component.executable, auditClient("native-trial-role", true), { mode: 0o755 });
  const request = canonicalJSON({ kind: "docs-drift-trial-review-request", artifact_root: f.artifacts,
    canonicalizer: join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/protocol.ts") });
  const requestPath = join(f.artifacts, "trial-review-request.json"); writeFileSync(requestPath, request, { mode: 0o600 });
  const policy = readAdoptedRolePolicy({ repo: f.repo, current_default: source, identity: f.identity, runtime: selected, role: "reviewer" });
  const reference = await captureConfiguredRole({ source_repo: f.repo, source_commit: source, artifact_root: f.artifacts, role: "reviewer", policy,
    target_sha256: "d".repeat(64), cwd: f.repo, runtime: selected, environment: { PATH: process.env.PATH, HOME: process.env.HOME, COPILOT_GITHUB_TOKEN: "synthetic-selected-provider" },
    prompt: "DOCS_DRIFT_REQUEST: " + JSON.stringify({ path: requestPath, sha256: sha256(request) }) });
  expect(readNativeRoleCapture({ source_repo: f.repo, artifact_root: f.artifacts, reference, policy,
    expected: { role: "reviewer", source_commit: source, runtime_sha256: roleRuntimeDigest(selected, "reviewer"), target_sha256: "d".repeat(64) } }).binding.model).toBe("claude-opus-5.5");
}, 60000);

async function nativeTrialPublication(changedPath = "docs/trial/guide.md", procedure = false) {
  const component = ordinaryComponentFixture(roots, true), f = nativeFixture(component.identity);
  f.settings.clients.copilot.executable = component.executable;
  put(f.repo, "docs/trial/guide.md", "# Synthetic trial guide\n");
  if (procedure) put(f.repo, f.settings.project_procedure, "---\ndocs_drift_reconciliation:\n  repository: fixture/docs\n  operation_prefix: native-trial-\n"
    + "  lease_ref: " + f.definition.namespace.lease_ref + "\n  receipt_ref_prefix: " + f.definition.namespace.receipt_ref_prefix
    + "\n  effects: [absence-retirement, receipt-retention, owned-lease-release]\n---\n\nSynthetic explicitly scoped metadata permission.\n");
  const source = f.save(); f.run.head_sha = source;
  const origin = join(f.root, "trial-origin.git"); git(f.root, "clone", "--bare", "--no-local", f.repo, origin);
  const branch = f.definition.namespace.branch_prefix + "one";
  git(f.repo, "switch", "-c", branch); put(f.repo, changedPath, "# Corrected synthetic trial guide\n");
  const head = commit(f.repo, "Synthetic trial correction"); git(f.repo, "switch", "main");
  git(origin, "fetch", "--no-write-fetch-head", f.repo, head);
  const service = installOwnedNativeService({ root: f.root, origin, source, head, publisher_identity: f.identity });
  const state = JSON.parse(readFileSync(service.statePath, "utf8")); state.workflow_runs = [f.run];
  writeFileSync(service.statePath, JSON.stringify(state));
  const path = join(f.root, "native-bin") + ":" + process.env.PATH;
  const selected = await selectNativeTrialRuntime({ repo: f.repo, current_default: source, directory: component.directory, entry: "hosted",
    credential: "synthetic-native-token", path, run_id: 501, run_attempt: 2, definition_sha256: sha256(canonicalJSON(f.definition)) });
  const { createRunDirectory } = await import("../../../plugins/vh-adlc/scripts/docs-drift/run-directory");
  const { createOwnedObjectStore } = await import("../../../plugins/vh-adlc/scripts/docs-drift/snapshot");
  const { createNativeTransport } = await import("../../../plugins/vh-adlc/scripts/docs-drift/transport");
  const controller = createRunDirectory({ repo: f.repo, directory: join(f.root, "trial-run"), origins: join(f.root, "trial-origins"), source, entry: "hosted" });
  const store = createOwnedObjectStore({ source_repo: f.repo, source_commit: source, parent: controller.directory, evidence_directory: controller.directory,
    repository: "fixture/docs", owner: controller.manifest.id, run: "native-trial" });
  git(store.root, "fetch", "--no-tags", "--no-write-fetch-head", f.repo, head);
  const { publicationMarker } = await import("../../../plugins/vh-adlc/scripts/docs-drift/report-history");
  const { effectMarker: marker } = await import("../../../plugins/vh-adlc/scripts/docs-drift/manifests");
  const operation = "native-trial-interrupted", settings = selected.trial.settings;
  const effects: Effect[] = [
    { id: "lease", kind: "lease-acquire", payload: { ref: settings.publication.lease_ref } },
    { id: "receipt", kind: "receipt-retain", payload: { ref: settings.publication.receipt_ref_prefix + operation } },
    { id: "push", kind: "push", payload: { ref: "refs/heads/" + branch, head } },
    { id: "pr", kind: "pr-create", payload: { base: "main", branch, title: "Synthetic trial correction",
      body: "Synthetic trial only\n" + publicationMarker(settings, operation) + "\n" + marker("pr"), labels: ["documentation"], draft: true } },
    { id: "release", kind: "lease-release", payload: { ref: settings.publication.lease_ref } },
  ];
  const input = manifestFixture({ ...bindings, source_commit: source, candidate_commit: head, candidate_tree: git(f.repo, "rev-parse", head + "^{tree}"),
    settings_sha256: loadCommittedSettings(f.repo, source).settings_sha256 }, effects, operation, { actor: "fixture-bot", actor_id: 20, publisher_entry: "hosted" });
  input.policy = {
    worker: readAdoptedRolePolicy({ repo: f.repo, current_default: source, identity: f.identity, runtime: selected, role: "worker" }),
    reviewer: readAdoptedRolePolicy({ repo: f.repo, current_default: source, identity: f.identity, runtime: selected, role: "reviewer" }),
  };
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, ...runtimePolicyBinding(selected),
    context: "trial", transport: "native", publication_kind: "advisory", corrections: [], attention: [] });
  const transport = createNativeTransport({ source_repo: f.repo, artifact_root: controller.directory, object_store: store,
    settings, credential: "synthetic-native-token", path, run: controller });
  const publication = { source_repo: f.repo, artifact_root: controller.directory, object_store: store, settings, plan, transport,
    gate: async () => ({ review: input, policy: selected.trial.policy }) };
  return { ...f, component, selected, source, origin, head, service, path, controller, store, publication };
}

async function interruptedNativeTrial(changedPath = "docs/trial/guide.md", delivery: "applied" | "unsent" = "applied", procedure = false) {
  const f = await nativeTrialPublication(changedPath, procedure), transport = f.publication.transport, execute = transport.execute;
  const { PublicationExecutionError } = await import("../../../plugins/vh-adlc/scripts/docs-drift/attempts");
  transport.execute = async (...args) => {
    if (args[1].id === "pr" && delivery === "unsent") throw new PublicationExecutionError(false, true);
    const result = await execute(...args);
    if (args[1].id === "pr") throw new PublicationExecutionError(true, true, undefined, result ?? undefined);
    return result;
  };
  const { publish } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publish");
  const interrupted = await publish(f.publication);
  expect(interrupted.state).toBe("pending");
  expect(interrupted.objects.receipt_object).toBeString(); expect(interrupted.objects.lease_object).toBeString();
  return { ...f, interrupted };
}

test("native trial publication refuses a candidate outside its declared fixture paths before acquiring a lease", async () => {
  await expect(interruptedNativeTrial("docs/guide.md")).rejects.toThrow("native trial candidate outside declared paths");
  const root = roots.at(-1);
  if (!root) throw Error("Owned rejected trial fixture required");
  expect(JSON.parse(readFileSync(join(root, "native-state.json"), "utf8")).prs).toEqual([]);
  expect(git(join(root, "trial-origin.git"), "for-each-ref", "--format=%(refname)")).toBe("refs/heads/main");
}, 60000);

test("original native trial acknowledgement retains its original policy and component after rollback", async () => {
  try {
  const f = await interruptedNativeTrial();
  const { inspectRecovery, applyRecovery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery-controller");
  const { readRunDirectory } = await import("../../../plugins/vh-adlc/scripts/docs-drift/run-directory");
  const { retainSyntheticArtifact } = await import("./original-publication-fixture");
  const { readJournal } = await import("../../../plugins/vh-adlc/scripts/docs-drift/journal");
  const original = canonicalJSON(f.interrupted.journal.plan), clientCalls = readFileSync(f.component.calls);
  const successor = { ...JSON.parse(readFileSync(join(f.repo, ".vh-adlc/docs-drift.yaml"), "utf8")), successor_only_field: "Original release cannot parse this" };
  put(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(successor).toString());
  const current = commit(f.repo, "Synthetic trial successor and staged rollback");
  git(f.origin, "fetch", "--no-write-fetch-head", f.repo, current); git(f.origin, "update-ref", "refs/heads/main", current);
  const native = JSON.parse(readFileSync(f.service.statePath, "utf8"));
  native.commit = current; native.tree = git(f.repo, "rev-parse", current + "^{tree}"); native.prs[0].title = "Later owner title"; native.viewer_login = "Fixture-Bot";
  writeFileSync(f.service.statePath, JSON.stringify(native)); rmSync(f.component.executable);
  const selection = { schema_version: 1, kind: "docs-drift-recovery-selection", source_commit: f.source,
    operation_id: f.publication.plan.manifest.operation_id, purpose: "acknowledgement", acknowledge_effect_ids: ["pr"], retire_effect_ids: [], retirement_lookups: {} };
  const options = { repo: f.repo, source: f.source, artifact_root: f.controller.directory, journal_directory: f.interrupted.journal.directory,
    cache_directory: f.controller.directory, entry: "hosted", owner: f.controller.manifest.id, run: "native-trial-recovery", credential: "synthetic-native-token", path: f.path, selection };
  const inspected = await inspectRecovery(options);
  expect(inspected.complete, inspected.diagnostics.join("\n")).toBe(true); expect(inspected.scopes).toHaveLength(1);
  const owner = retainSyntheticArtifact(f.controller.directory, "owner.txt", Buffer.from("Synthetic owner approves this exact current acknowledgement and owned cleanup.\n"));
  const authority = retainSyntheticArtifact(f.controller.directory, "authority.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-recovery-authority",
    purpose: "acknowledgement", scope_sha256s: inspected.scope_sha256s, origin: { kind: "owner-current-request", artifact: owner } }));
  const location = { repo: f.repo, directory: f.controller.directory, origins: join(f.root, "trial-origins") };
  const applied = await applyRecovery({ ...options, purpose: "acknowledgement", authority }, readRunDirectory(location));
  expect(applied.state).toBe("acknowledged");
  const repeated = await applyRecovery({ ...options, purpose: "acknowledgement", authority }, readRunDirectory(location));
  expect(repeated.state).toBe("acknowledged");
  expect(canonicalJSON(readJournal(f.interrupted.journal.directory, f.repo).plan)).toEqual(original);
  const delivered = JSON.parse(readFileSync(f.service.statePath, "utf8"));
  expect(delivered.prs).toHaveLength(1); expect(delivered.prs[0].title).toBe("Later owner title");
  expect(readFileSync(f.component.calls)).toEqual(clientCalls);
  expect(await f.publication.transport.ref(f.selected.trial.settings.publication.lease_ref)).toEqual({ state: "absent" });
  } catch (error) { preserveFailedRoots = true; throw error; }
}, 180000);

test("a lost native trial stays observation-only until separately approved administrative CAS cleanup", async () => {
  try {
  const f = await interruptedNativeTrial();
  const { mkdirSync, renameSync } = await import("node:fs");
  const { readRunDirectory } = await import("../../../plugins/vh-adlc/scripts/docs-drift/run-directory");
  const { collectNativeRetained } = await import("../../../plugins/vh-adlc/scripts/docs-drift/retained-controller");
  const { applyRecovery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery-controller");
  const { collectProposals } = await import("../../../plugins/vh-adlc/scripts/docs-drift/proposals");
  const { readNativeContext } = await import("../../../plugins/vh-adlc/scripts/docs-drift/transport");
  const originalPlan = canonicalJSON(f.publication.plan), originalRefs = git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)");
  const laterState = join(f.root, "later-state");
  const location = { repo: f.repo, directory: join(f.root, "later-job"), origins: join(laterState, "vh-adlc/docs-drift/origins") };
  const read = { repo: f.repo, source: f.source, artifact_root: location.directory, operation_id: f.publication.plan.manifest.operation_id,
    owner: "later-job", run: "later-job", credential: "synthetic-native-token", path: f.path,
    trial_definition_sha256: sha256(canonicalJSON(f.definition)) };
  const { executeOwnedProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/owned-process");
  async function restore(directory: string, definition: string) {
    return executeOwnedProcess({ argv: [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"),
      "resume", "--repo", f.repo, "--run-dir", directory, "--source", f.source, "--entry", "hosted", "--action", "restore",
      "--operation-id", read.operation_id, "--trial-definition-sha256", definition], cwd: f.repo,
      env: { PATH: f.path, HOME: process.env.HOME!, GH_TOKEN: "synthetic-native-token", XDG_STATE_HOME: laterState, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
      capture: "memory", watched_outputs: [], timeout_ms: 90000, stdout: directory + ".stdout", stderr: directory + ".stderr", started: () => {} });
  }
  const beforeWrongDefinition = readFileSync(f.service.calls);
  const wrong = await restore(join(f.root, "wrong-definition"), "f".repeat(64));
  expect(wrong.reaped).toBe(true); expect(wrong.exit_code).toBe(2);
  expect(JSON.parse(Buffer.from(wrong.captured?.stdout ?? []).toString()).diagnostics).toEqual([expect.stringContaining("selected original trial definition changed")]);
  expect(readFileSync(f.service.calls)).toEqual(beforeWrongDefinition);
  const restoration = await restore(location.directory, read.trial_definition_sha256);
  expect(restoration.reaped).toBe(true); expect(restoration.timed_out).toBe(false);
  const restored = JSON.parse(Buffer.from(restoration.captured?.stdout ?? []).toString());
  expect(restored, Buffer.from(restoration.captured?.stderr ?? []).toString()).toMatchObject({ command: "resume", outcome: "pending" });
  expect(restored.retained_operation.replay_authority).toBe(false);
  expect(restored.retained_operation.state).toBe("pending");
  expect(readRunDirectory(location).origin).toBe("observation-only");
  expect(git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(originalRefs);
  const selectedJournal = restored.retained_operation.journal_directory;
  if (!selectedJournal) throw Error("Original observation-only journal required");
  const selection = { schema_version: 1, kind: "docs-drift-recovery-selection", source_commit: f.source,
    operation_id: f.publication.plan.manifest.operation_id, purpose: "acknowledgement", acknowledge_effect_ids: ["pr"], retire_effect_ids: [], retirement_lookups: {} };
  await expect(applyRecovery({ repo: f.repo, source: f.source, artifact_root: location.directory, journal_directory: selectedJournal,
    cache_directory: location.directory, entry: "hosted", owner: "later-job", run: "later-job", credential: "synthetic-native-token", path: f.path,
    selection, authority: null, purpose: "acknowledgement" }, readRunDirectory(location))).rejects.toThrow("original host ownership required");
  expect(git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(originalRefs);
  const successor = { ...JSON.parse(readFileSync(join(f.repo, ".vh-adlc/docs-drift.yaml"), "utf8")), successor_only_field: "Synthetic incompatible rollback" };
  put(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON(successor).toString());
  const upgraded = commit(f.repo, "Synthetic lost-origin upgrade and staged rollback");
  git(f.origin, "fetch", "--no-write-fetch-head", f.repo, upgraded); git(f.origin, "update-ref", "refs/heads/main", upgraded);
  const upgradedState = JSON.parse(readFileSync(f.service.statePath, "utf8"));
  upgradedState.commit = upgraded; upgradedState.tree = git(f.repo, "rev-parse", upgraded + "^{tree}");
  writeFileSync(f.service.statePath, JSON.stringify(upgradedState));
  const refs = restored.retained_operation.observed_refs;
  const { lease_object, receipt_object } = f.interrupted.objects;
  if (!lease_object || !receipt_object || !refs.lease.object || !refs.receipt.object) throw Error("Exact observed owned refs required before administrative approval");
  expect(refs.lease.object).toBe(lease_object);
  expect(refs.receipt.object).toBe(receipt_object);
  const caseDirectory = join(f.root, "private-abandonment"); mkdirSync(caseDirectory, { mode: 0o700 });
  writeFileSync(join(caseDirectory, "abandonment-inspection.json"), canonicalJSON(restored), { mode: 0o600 });
  writeFileSync(join(caseDirectory, "approval.txt"), "Synthetic owner approves abandonment of fixture/docs " + f.publication.plan.manifest.operation_id
    + " and only " + refs.lease.ref + " at " + refs.lease.object + " and " + refs.receipt.ref + " at " + refs.receipt.object + ".\n", { mode: 0o600 });
  expect(() => git(f.origin, "update-ref", "-d", refs.lease.ref, "f".repeat(40))).toThrow();
  git(f.origin, "update-ref", "-d", refs.lease.ref, refs.lease.object);
  const receiptOnly = await collectNativeRetained(read);
  expect(receiptOnly.retained_operation.observed_refs.lease.object).toBeNull();
  expect(receiptOnly.retained_operation.observed_refs.receipt.object).toBe(refs.receipt.object);
  expect(receiptOnly.retained_operation.replay_authority).toBe(false);
  expect(receiptOnly.retained_operation.historical_review_verified).toBe(false);
  git(f.origin, "update-ref", "-d", refs.receipt.ref, refs.receipt.object);
  renameSync(caseDirectory, caseDirectory + "-retained");
  const currentSource = f.save();
  git(f.origin, "fetch", "--no-write-fetch-head", f.repo, currentSource); git(f.origin, "update-ref", "refs/heads/main", currentSource);
  const scheduledState = JSON.parse(readFileSync(f.service.statePath, "utf8"));
  scheduledState.commit = currentSource; scheduledState.tree = git(f.repo, "rev-parse", currentSource + "^{tree}");
  scheduledState.workflow_runs.push({ ...f.run, id: 502, run_attempt: 1, head_sha: currentSource });
  writeFileSync(f.service.statePath, JSON.stringify(scheduledState));
  const scheduled = await selectNativeTrialRuntime({ repo: f.repo, current_default: currentSource, directory: f.component.directory,
    entry: "hosted", credential: "synthetic-native-token", path: f.path, run_id: 502, run_attempt: 1,
    definition_sha256: sha256(canonicalJSON(f.definition)) });
  expect(scheduled.trial.source_commit).toBe(currentSource);
  expect(scheduled.trial.policy.policy_sha256).not.toBe(f.selected.trial.policy.policy_sha256);
  const native = readNativeContext({ hostname: f.selected.trial.settings.hostname, repository: "fixture/docs", credential: "synthetic-native-token", path: f.path });
  const proposals = collectProposals(native.repository, scheduled.trial.settings);
  expect(proposals.complete, proposals.diagnostics?.join("\n")).toBe(true);
  expect(proposals.proposals).toHaveLength(1);
  expect(await f.publication.transport.ref(refs.lease.ref)).toEqual({ state: "absent" });
  expect(await f.publication.transport.ref(refs.receipt.ref)).toEqual({ state: "absent" });
  expect(canonicalJSON(f.publication.plan)).toEqual(originalPlan);
  const current = JSON.parse(readFileSync(f.service.statePath, "utf8"));
  expect(current.prs).toHaveLength(1);
  } catch (error) { preserveFailedRoots = true; throw error; }
}, 180000);

test.each(["scan", "publish", "resume"] as const)("a trial restoration selector cannot authorize normal %s execution", async command => {
  const f = nativeFixture(), directory = join(f.root, "forbidden-run");
  const { executeOwnedProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/owned-process");
  const result = await executeOwnedProcess({ argv: [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"), command,
    "--repo", f.repo, "--run-dir", directory, "--trial-definition-sha256", sha256(canonicalJSON(f.definition))], cwd: f.repo,
    env: { PATH: "/nonexistent", HOME: process.env.HOME!, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" }, capture: "memory", watched_outputs: [], timeout_ms: 10000,
    stdout: join(f.root, "forbidden.stdout"), stderr: join(f.root, "forbidden.stderr"), started: () => {} });
  expect(result.reaped).toBe(true); expect(result.exit_code).toBe(2);
  expect(JSON.parse(Buffer.from(result.captured?.stdout ?? []).toString()).diagnostics).toEqual([expect.stringContaining("only for observation-only restoration")]);
  expect(existsSync(directory)).toBe(false);
});

test("native trial reconciliation preserves an explicitly scoped current procedure grant", async () => {
  try {
  const f = await interruptedNativeTrial(undefined, "unsent", true);
  const { inspectRecovery, applyRecovery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/recovery-controller");
  const { readRunDirectory } = await import("../../../plugins/vh-adlc/scripts/docs-drift/run-directory");
  const { retainSyntheticArtifact } = await import("./original-publication-fixture");
  const effect = f.publication.plan.manifest.effects.find(effect => effect.id === "pr");
  if (!effect) throw Error("Original selected trial creation required");
  const lookup = await f.publication.transport.observe(f.publication.plan, effect, f.interrupted.objects);
  if (lookup.state !== "absent" || !lookup.evidence) throw Error("Current native absence lookup required");
  const selection = { schema_version: 1, kind: "docs-drift-recovery-selection", source_commit: f.source,
    operation_id: f.publication.plan.manifest.operation_id, purpose: "reconciliation", acknowledge_effect_ids: [], retire_effect_ids: ["pr"], retirement_lookups: { pr: lookup.evidence } };
  const options = { repo: f.repo, source: f.source, artifact_root: f.controller.directory, journal_directory: f.interrupted.journal.directory,
    cache_directory: f.controller.directory, entry: "hosted", owner: f.controller.manifest.id, run: "trial-reconciliation", credential: "synthetic-native-token", path: f.path, selection };
  const inspected = await inspectRecovery(options);
  expect(inspected.complete, inspected.diagnostics.join("\n")).toBe(true); expect(inspected.scopes).toHaveLength(1);
  const procedure = f.settings.project_procedure, bytes = readFileSync(join(f.repo, procedure));
  const authority = retainSyntheticArtifact(f.controller.directory, "procedure-authority.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-recovery-authority",
    purpose: "reconciliation", scope_sha256s: inspected.scope_sha256s, origin: { kind: "adopted-procedure", commit: f.source, path: procedure, sha256: sha256(bytes) } }));
  const location = { repo: f.repo, directory: f.controller.directory, origins: join(f.root, "trial-origins") };
  const clientCalls = readFileSync(f.component.calls);
  const applied = await applyRecovery({ ...options, purpose: "reconciliation", authority }, readRunDirectory(location));
  expect(applied.state).toBe("retired");
  expect(JSON.parse(readFileSync(f.service.statePath, "utf8")).prs).toEqual([]);
  expect(await f.publication.transport.ref(f.selected.trial.settings.publication.lease_ref)).toEqual({ state: "absent" });
  const receiptObject = f.interrupted.objects.receipt_object;
  if (!receiptObject) throw Error("Original retained trial receipt required");
  expect(await f.publication.transport.ref(f.selected.trial.settings.publication.receipt_ref_prefix + f.publication.plan.manifest.operation_id))
    .toEqual({ state: "present", object: receiptObject });
  expect(readFileSync(f.component.calls)).toEqual(clientCalls);
  } catch (error) { preserveFailedRoots = true; throw error; }
}, 180000);

test("normal resume keeps a prototype native-trial record without launch evidence read-only", async () => {
  const component = ordinaryComponentFixture(roots), f = nativeFixture(component.identity);
  const { createRunDirectory, bindRunJournal, readRunDirectory, appendRunStage } = await import("../../../plugins/vh-adlc/scripts/docs-drift/run-directory");
  const { createJournal, readRetainedPlan } = await import("../../../plugins/vh-adlc/scripts/docs-drift/journal");
  const { retainSyntheticArtifact } = await import("./original-publication-fixture");
  const { executeOwnedProcess } = await import("../../../plugins/vh-adlc/scripts/docs-drift/owned-process");
  const selected = readNativeTrialPolicy(f.input), input = manifestFixture({ ...bindings, source_commit: f.source,
    settings_sha256: loadCommittedSettings(f.repo, f.source).settings_sha256 }, [], "native-prototype", { actor: "fixture-bot", actor_id: 20, publisher_entry: "hosted" });
  input.policy = { worker: selected.policy.worker, reviewer: selected.policy.reviewer };
  const current = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, ...selected.policy, corrections: [], attention: [] });
  const { trial_launch: _launch, ...prototype } = current, bytes = canonicalJSON(prototype);
  const state = join(f.root, "prototype-state"), location = { repo: f.repo, directory: join(f.root, "prototype-run"), origins: join(state, "vh-adlc/docs-drift/origins") };
  let run = createRunDirectory({ ...location, source: f.source, entry: "hosted" });
  const journal = createJournal({ source_repo: f.repo, artifact_root: run.directory, plan: readRetainedPlan(bytes) });
  run = bindRunJournal(run, journal);
  const placeholder = retainSyntheticArtifact(run.directory, "prototype-placeholder.json", canonicalJSON({ historical: true }));
  appendRunStage(run, { command: "publish", state: "pending", artifacts: { candidate: placeholder, approval: placeholder } });
  const result = await executeOwnedProcess({ argv: [process.execPath, join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts"),
    "resume", "--repo", f.repo, "--run-dir", run.directory], cwd: f.repo,
    env: { PATH: process.env.PATH!, HOME: process.env.HOME!, GH_TOKEN: "synthetic-native-token", XDG_STATE_HOME: state, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
    capture: "memory", watched_outputs: [], timeout_ms: 10000, stdout: join(f.root, "prototype.stdout"), stderr: join(f.root, "prototype.stderr"), started: () => {} });
  const report = JSON.parse(Buffer.from(result.captured?.stdout ?? []).toString());
  expect(result.reaped).toBe(true); expect(result.exit_code).toBe(1);
  expect(report).toMatchObject({ outcome: "pending", operation: { execution_origin: "original", handoff: "Original native trial launch evidence is required for execution." } });
  expect(readFileSync(join(journal.directory, "plan.json")).equals(bytes)).toBe(true);
  expect(existsSync(component.calls)).toBe(false);
  expect(readRunDirectory(location).stages).toHaveLength(2);
}, 60000);

test.each(["production", "version-one"] as const)("trial retained observation refuses a %s record", async format => {
  try {
  const f = await interruptedNativeTrial();
  const { writePlanObject } = await import("../../../plugins/vh-adlc/scripts/docs-drift/journal");
  const { collectNativeRetained } = await import("../../../plugins/vh-adlc/scripts/docs-drift/retained-controller");
  const { mkdirSync } = await import("node:fs");
  const operation = "foreign-trial-record", input = manifestFixture(f.publication.plan.manifest.bindings, [], operation,
    { actor: "fixture-bot", actor_id: 20, publisher_entry: "hosted" });
  input.policy = { worker: f.selected.trial.policy.worker, reviewer: f.selected.trial.policy.reviewer };
  const binding: PolicyBinding = format === "production"
    ? { schema_version: 2, policy_sha256: f.selected.trial.policy.policy_sha256, component: f.selected.trial.policy.component }
    : { adoption_sha256: "f".repeat(64) };
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants,
    ...binding, context: format === "production" ? "production" : "trial",
    transport: "native", publication_kind: "advisory", corrections: [], attention: [] });
  const objects = writePlanObject(f.store, plan), ref = f.selected.trial.settings.publication.receipt_ref_prefix + operation;
  git(f.origin, "fetch", "--no-write-fetch-head", f.store.root, objects.object);
  git(f.origin, "update-ref", ref, objects.object, "0".repeat(40));
  const before = git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)"), directory = join(f.root, "foreign-observation");
  mkdirSync(directory, { mode: 0o700 });
  await expect(collectNativeRetained({ repo: f.repo, source: f.source, artifact_root: directory, operation_id: operation, owner: "foreign-observation",
    run: "foreign-observation", credential: "synthetic-native-token", path: f.path, trial_definition_sha256: sha256(canonicalJSON(f.definition)), restore: true }))
    .rejects.toThrow("Retained native original source or operation changed");
  expect(git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(before);
  expect(JSON.parse(readFileSync(f.service.statePath, "utf8")).prs).toHaveLength(1);
  } catch (error) { preserveFailedRoots = true; throw error; }
}, 180000);

test("native trial publication refuses an unscoped source-settings substitution before acquiring a lease", async () => {
  const f = await nativeTrialPublication();
  const { publish } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publish");
  const before = git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)");
  await expect(publish({ ...f.publication, settings: loadCommittedSettings(f.repo, f.source).settings })).rejects.toThrow("source settings binding");
  expect(git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(before);
  expect(JSON.parse(readFileSync(f.service.statePath, "utf8")).prs).toEqual([]);
}, 60000);
