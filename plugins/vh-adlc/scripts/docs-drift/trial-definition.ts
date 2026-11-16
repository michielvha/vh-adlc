import { parseTrialLaunch, readVerifiedPlan, type CurrentSealedPlan, type NativeTrialLaunch } from "./journal";
import { modelMatches } from "./manifests";
import type { PublicationIdentity } from "./transport";
import type { RepositoryReader } from "../github-read";
import { collectionReaders, readAdoptionInput, readGit } from "./git";
import { canonicalDigest, canonicalJSON, freezeJSON, protocolPath, withinPrefix } from "./protocol";
import { legacySettings, loadCommittedSettings, parseComponentBinding, parseSettings, type Settings } from "./settings";
import { verifyConfiguredWorkerCaller, verifyWorkerCallers } from "./worker-callers";
import { PUBLISHER_ENTRIES, publisherActor, sameAccount, sameLogin } from "./identity";

function fail(reason: string): never { throw Error("incomplete docs-drift trial definition " + reason); }
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("object required");
  canonicalJSON(value);
  const input = value as Record<string, unknown>;
  const actual = Object.keys(input).sort(), expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) fail("fields");
  return input;
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) fail("digest");
  return value;
}
function commit(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value)) fail("immutable object");
  return value;
}
function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) fail("workflow or identity number");
  return value;
}
function overlaps(left: string, right: string): boolean {
  const a = left.replace(/\/$/u, ""), b = right.replace(/\/$/u, "");
  return withinPrefix(a, b) || withinPrefix(b, a);
}

function selectedDefinition(repo: string, source: string, settings: Settings) {
  const selected = settings.trial;
  if (selected === null) fail("selector missing");
  const definition = readAdoptionInput(repo, source, selected.definition_path);
  if (!definition || definition.mode !== "100644" || definition.sha256 !== selected.definition_sha256) fail("committed trial selector");
  return { definition, value: collectionReaders().yaml(definition.bytes) };
}

/** Bind historical receipts to the definition at C, independently of later active trial setup. */
export function readTrialHistoryBindings(options: { repo: string; source: string; settings: Settings }) {
  if (options.settings.trial === null) return null;
  const { value } = selectedDefinition(options.repo, options.source, options.settings);
  if (value !== null && typeof value === "object" && !Array.isArray(value)
    && Reflect.get(value, "schema_version") === 1 && Reflect.get(value, "kind") === "docs-drift-upgrade-trial") return null;
  if (options.settings.schema_version === 2 && value !== null && typeof value === "object" && !Array.isArray(value)
    && Reflect.get(value, "schema_version") === 2 && Reflect.get(value, "kind") === "docs-drift-native-trial") return null;
  const root = trialRoot(value), history = object(root.history, ["reader", "reader_workflow_id", "producer_workflow_id"]);
  const callers = object(root.callers, ["trial", "prospective", "production_pr_draft", "input_differences"]);
  const path = (value: unknown) => {
    const row = object(value, ["path", "sha256"]), path = protocolPath(row.path);
    const input = readAdoptionInput(options.repo, options.source, path);
    if (!input || input.mode !== "100644" || input.sha256 !== digest(row.sha256)) fail("history committed workflow");
    return path;
  };
  const reader = positive(history.reader_workflow_id), producer = positive(history.producer_workflow_id);
  if (reader === producer || [reader, producer].includes(options.settings.reports.workflow_id ?? 0)) fail("history workflow identities");
  return { producer_workflow_id: producer, producer_workflow_path: path(callers.trial),
    reader_workflow_id: reader, reader_workflow_path: path(history.reader) };
}

function trialRoot(value: unknown) {
  const root = object(value, ["schema_version", "kind", "identity", "candidate_settings", "candidate_component", "prospective_protected_sha256",
    "worker", "callers", "history", "fixture", "namespace", "expected", "upgrade"]);
  if (root.schema_version !== 1 || root.kind !== "docs-drift-trial") fail("schema");
  return root;
}

/** Read and compare committed policy. This performs no trial, publication or authorization. */
export function readTrialDefinition(options: { repo: string; source: string; settings: Settings }) {
  const { repo, source } = options, settings = legacySettings(options.settings), selected = settings.trial;
  if (selected === null) fail("selector missing");
  const blob = (value: unknown, mode: string | null = "100644") => {
    const binding = object(value, ["path", "sha256"]), path = protocolPath(binding.path);
    const input = readAdoptionInput(repo, source, path);
    if (!input || (mode !== null && input.mode !== mode) || input.sha256 !== digest(binding.sha256)) fail("committed blob " + path);
    return input;
  };
  const { definition, value } = selectedDefinition(repo, source, settings), root = trialRoot(value);
  const identity = object(root.identity, ["hostname", "repository", "repository_id", "actor", "actor_id", "default_branch"]);
  if (identity.hostname !== settings.hostname || identity.repository !== settings.repository
    || typeof identity.actor !== "string" || !sameLogin(identity.actor, settings.publication.actor)
    || identity.default_branch !== settings.default_branch) fail("consumer identity");
  const nativeIdentity = { repository: settings.repository, repository_id: positive(identity.repository_id), actor: identity.actor,
    actor_id: positive(identity.actor_id), default_branch: settings.default_branch };
  const candidateSettings = blob(root.candidate_settings), candidateComponent = blob(root.candidate_component);
  const candidate = legacySettings(parseSettings(collectionReaders().yaml(candidateSettings.bytes)));
  if (candidate.repository !== settings.repository || candidate.hostname !== settings.hostname
    || candidate.default_branch !== settings.default_branch || !sameLogin(candidate.publication.actor, settings.publication.actor)
    || candidate.publication.mode !== "adopted" || candidate.component_pin !== candidateComponent.path) fail("candidate consumer selection");
  const previousActors = settings.publication.entry_actors, nextActors = candidate.publication.entry_actors;
  if (previousActors && nextActors && PUBLISHER_ENTRIES.some(entry => !sameLogin(previousActors[entry], nextActors[entry])))
    fail("candidate consumer publisher selection");
  if (candidate.execution.scheduled_workflow !== settings.execution.scheduled_workflow) fail("existing scheduled caller");
  const activeInputs = ["AGENTS.md", ".vh-adlc/docs-drift.yaml", settings.project_procedure, settings.execution.scheduled_workflow,
    settings.execution.worker_workflow, settings.execution.claude_command, settings.runtime_loader.launcher];
  if (settings.scanner.adapter !== null) activeInputs.push(settings.scanner.adapter);
  const worker = blob(root.worker), callers = object(root.callers, ["trial", "prospective", "production_pr_draft", "input_differences"]);
  if (worker.path !== candidate.execution.worker_workflow || worker.path === candidate.execution.scheduled_workflow
    || typeof callers.production_pr_draft !== "boolean") fail("candidate worker");
  const workerDefinition = collectionReaders().yaml(worker.bytes);
  if (workerDefinition === null || typeof workerDefinition !== "object" || Array.isArray(workerDefinition)) fail("reusable worker");
  object(Reflect.get(workerDefinition, "on"), ["workflow_call"]);
  const trial = blob(callers.trial), prospective = blob(callers.prospective);
  if ([trial.path, prospective.path, candidateSettings.path].some(path => activeInputs.includes(path))) fail("active protected input");
  if (settings.publication.mode === "adopted" && worker.path === settings.execution.worker_workflow) fail("distinct candidate worker required");
  if (!/^\.github\/workflows\/[^/]+\.ya?ml$/u.test(trial.path)
    || withinPrefix(prospective.path, ".github/workflows")) fail("dormant prospective caller selection");
  const differences = callers.input_differences;
  if (differences === null || typeof differences !== "object" || Array.isArray(differences)) fail("caller differences");
  const inputDifferences = Object.fromEntries(Object.entries(differences).map(([name, value]) => {
    const row = object(value, ["trial", "scheduled"]);
    if (!["string", "number", "boolean"].includes(typeof row.trial) || !["string", "number", "boolean"].includes(typeof row.scheduled)) fail("literal caller difference");
    // The common caller verifier narrows literal values, including expression and finite-number checks.
    return [name, { trial: row.trial as string | number | boolean, scheduled: row.scheduled as string | number | boolean }] as const;
  }));
  const callerProof = verifyWorkerCallers({ trial: trial.bytes, scheduled: prospective.bytes, worker_path: worker.path,
    component_pin: candidateComponent.path, production_pr_draft: callers.production_pr_draft, input_differences: inputDifferences });
  for (const input of [trial, prospective]) verifyConfiguredWorkerCaller({ bytes: input.bytes, worker_path: worker.path,
    permissions: candidate.execution.permissions, secret_mappings: candidate.execution.secret_mappings });
  if (callers.production_pr_draft !== (candidate.publication.pr_state.advisory === "draft")) fail("production PR state");
  const history = object(root.history, ["reader", "reader_workflow_id", "producer_workflow_id"]), reader = blob(history.reader);
  if (!/^\.github\/workflows\/[^/]+\.ya?ml$/u.test(reader.path)
    || new Set([reader.path, trial.path, worker.path, candidate.execution.scheduled_workflow]).size !== 4) fail("distinct history reader");
  if (activeInputs.includes(reader.path)) fail("active protected input");
  const historyWorkflow = collectionReaders().yaml(reader.bytes);
  if (historyWorkflow === null || typeof historyWorkflow !== "object" || Array.isArray(historyWorkflow)) fail("history workflow");
  object(historyWorkflow, ["on", "permissions", "jobs", ...(Object.hasOwn(historyWorkflow, "name") ? ["name"] : [])]);
  const trigger = Reflect.get(historyWorkflow, "on");
  const triggers = object(trigger, ["workflow_dispatch"]);
  if (triggers.workflow_dispatch !== null) object(triggers.workflow_dispatch, []);
  const permissions = Reflect.get(historyWorkflow, "permissions");
  if (!canonicalJSON(permissions).equals(canonicalJSON({ actions: "read", contents: "read" }))) fail("history read permissions");
  const jobs = Reflect.get(historyWorkflow, "jobs");
  if (jobs === null || typeof jobs !== "object" || Array.isArray(jobs) || !Object.keys(jobs).length) fail("history reader jobs");
  for (const job of Object.values(jobs)) {
    if (job === null || typeof job !== "object" || Array.isArray(job)) fail("history reader job");
    const keys = Object.keys(job);
    if (keys.some(key => !["runs-on", "steps", "permissions", "name"].includes(key))) fail("history read-only invocation");
    const runner = Reflect.get(job, "runs-on"), steps = Reflect.get(job, "steps");
    if (typeof runner !== "string" || !/^[A-Za-z0-9_.-]+$/u.test(runner) || !Array.isArray(steps) || steps.length !== 1
      || !canonicalJSON(steps[0]).equals(canonicalJSON({ run: "bun report-history.ts --trial-read-check" }))) fail("history read-only invocation");
    const override = Reflect.get(job, "permissions");
    if (override !== undefined && !canonicalJSON(override).equals(canonicalJSON(permissions))) fail("history read permissions");
  }
  const historyBindings = readTrialHistoryBindings({ repo, source, settings });
  if (!historyBindings || [historyBindings.reader_workflow_id, historyBindings.producer_workflow_id].includes(candidate.reports.workflow_id ?? 0)) fail("history workflow identities");
  const fixture = object(root.fixture, ["id", "source_commit", "tree", "bundle", "bundle_root", "manifest", "scanner", "dependencies", "settings"]);
  if (typeof fixture.id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(fixture.id)) fail("fixture identity");
  const bundleRoot = protocolPath(fixture.bundle_root), bundle = blob(fixture.bundle), manifest = blob(fixture.manifest), scanner = blob(fixture.scanner, null), fixtureSettings = blob(fixture.settings);
  if (!withinPrefix(bundle.path, bundleRoot) || !withinPrefix(manifest.path, bundleRoot) || !withinPrefix(fixtureSettings.path, bundleRoot)
    || scanner.path !== candidate.scanner.script || !Array.isArray(fixture.dependencies)) fail("fixture bundle selection");
  if (activeInputs.some(path => overlaps(path, bundleRoot))) fail("fixture overlaps active protected input");
  const dependencies = fixture.dependencies.map(value => blob(value, null)), copies = object(collectionReaders().yaml(manifest.bytes), ["schema_version", "files"]);
  if (copies.schema_version !== 1 || !Array.isArray(copies.files) || !copies.files.length) fail("fixture manifest");
  const targets = new Map<string, { source: string; sha256: string; mode: string }>(), allowedSource = new Set([scanner.path, ...dependencies.map(row => row.path)]);
  if (allowedSource.size !== dependencies.length + 1) fail("duplicate scanner dependency");
  for (const value of copies.files) {
    const row = object(value, ["target", "source", "mode", "sha256"]), target = protocolPath(row.target), path = protocolPath(row.source);
    if (targets.has(target) || (!withinPrefix(path, bundleRoot) && !allowedSource.has(path))
      || (row.mode !== "100644" && row.mode !== "100755")) fail("fixture copy scope");
    const copied = blob({ path, sha256: row.sha256 }, row.mode);
    targets.set(target, { source: path, sha256: copied.sha256, mode: copied.mode });
  }
  for (const input of [scanner, ...dependencies, { ...fixtureSettings, path: ".vh-adlc/docs-drift.yaml" }]) {
    const target = targets.get(input.path), expected = input.path === ".vh-adlc/docs-drift.yaml" ? fixtureSettings : input;
    if (target?.source !== expected.path || target.sha256 !== expected.sha256) fail("fixed fixture layout");
  }
  const namespace = object(root.namespace, ["output_root", "branch_prefix", "lease_ref"]), output = protocolPath(namespace.output_root);
  if (candidate.roots.some(root => overlaps(output, root) || overlaps(bundleRoot, root))
    || typeof namespace.branch_prefix !== "string" || !namespace.branch_prefix.endsWith("/")
    || typeof namespace.lease_ref !== "string" || !namespace.lease_ref.startsWith("refs/heads/")) fail("synthetic namespace");
  const boundInputs = [definition.path, candidateSettings.path, candidateComponent.path, worker.path, trial.path, prospective.path,
    reader.path, bundle.path, manifest.path, fixtureSettings.path, scanner.path, candidate.runtime_loader.launcher, candidate.execution.claude_command,
    candidate.project_procedure, ".vh-adlc/docs-drift.yaml", ...dependencies.map(row => row.path), ...[...targets.values()].map(row => row.source)];
  if (candidate.scanner.adapter !== null) boundInputs.push(candidate.scanner.adapter);
  if (boundInputs.some(path => overlaps(output, path))) fail("output overlaps bound inputs");
  readGit(repo, "check-ref-format", "refs/heads/" + namespace.branch_prefix + "example");
  readGit(repo, "check-ref-format", namespace.lease_ref);
  const branch = "refs/heads/" + namespace.branch_prefix.slice(0, -1), lease = namespace.lease_ref;
  const realNamespaces = [settings, candidate].flatMap(policy => [policy.publication.lease_ref, policy.publication.receipt_ref_prefix.slice(0, -1),
    "refs/heads/" + policy.publication.branch_prefix.slice(0, -1),
    ...[...policy.legacy_proposals.branch_prefixes, ...policy.pr_discovery.branch_prefixes].map(prefix => "refs/heads/" + prefix.slice(0, -1))]);
  if (overlaps(branch, lease) || realNamespaces.some(real => overlaps(branch, real) || overlaps(lease, real))) fail("trial namespace overlaps production");
  const expected = object(root.expected, ["attention", "cases"]);
  if ((expected.attention !== "new-attention" && expected.attention !== "published") || !Array.isArray(expected.cases) || !expected.cases.length) fail("expected observations");
  const caseIDs = new Set<string>();
  const cases = expected.cases.map(value => {
    const row = object(value, ["id", "fixture_sha256", "outcome_sha256"]);
    if (typeof row.id !== "string" || !row.id || caseIDs.has(row.id)) fail("expected case identity");
    caseIDs.add(row.id);
    return { id: row.id, fixture_sha256: digest(row.fixture_sha256), outcome_sha256: digest(row.outcome_sha256) };
  });
  const upgrade = root.upgrade === null ? null : object(root.upgrade, ["schema_version", "kind", "predecessor_adoption_sha256",
    "candidate_component", "candidate_protected_sha256", "classification", "affected_entries", "changed_rules",
    ...(typeof root.upgrade === "object" && Object.hasOwn(root.upgrade, "component_entries") ? ["component_entries"] : [])]);
  if (upgrade !== null && (upgrade.schema_version !== 1 || upgrade.kind !== "docs-drift-upgrade-trial")) fail("upgrade schema");
  return freezeJSON({ definition_path: definition.path, definition_sha256: definition.sha256, identity: nativeIdentity,
    candidate_settings: { path: candidateSettings.path, sha256: candidateSettings.sha256, value: candidate },
    scheduled_contract: { path: candidate.execution.scheduled_workflow, mode: prospective.mode, sha256: prospective.sha256 },
    candidate_component: { path: candidateComponent.path, sha256: candidateComponent.sha256 },
    prospective_protected_sha256: digest(root.prospective_protected_sha256), worker: { path: worker.path, sha256: worker.sha256 }, caller_proof: callerProof,
    history: { reader: { path: reader.path, sha256: reader.sha256 }, reader_workflow_id: positive(history.reader_workflow_id), producer_workflow_id: positive(history.producer_workflow_id) },
    fixture: { id: fixture.id, source_commit: commit(fixture.source_commit), tree: commit(fixture.tree), bundle: { path: bundle.path, sha256: bundle.sha256 }, bundle_root: bundleRoot,
      manifest: { path: manifest.path, sha256: manifest.sha256 }, scanner: { path: scanner.path, sha256: scanner.sha256, mode: scanner.mode },
      dependencies: dependencies.map(input => ({ path: input.path, sha256: input.sha256, mode: input.mode })),
      settings: { path: fixtureSettings.path, sha256: fixtureSettings.sha256 }, files: [...targets].map(([target, row]) => ({ target, ...row })) },
    namespace: { output_root: output, branch_prefix: namespace.branch_prefix, lease_ref: namespace.lease_ref },
    expected: { attention: expected.attention, cases }, upgrade });
}

/** Read the committed candidate grant before a production checklist or trial outcome exists. */
function installedTrialDefinition(repo: string, source: string) {
  const loaded = loadCommittedSettings(repo, source), settings = loaded.settings;
  if (settings.schema_version !== 2 || !settings.component) fail("ordinary candidate settings required");
  const selected = selectedDefinition(repo, source, settings), definition = object(selected.value,
    ["schema_version", "kind", "entry", "component", "identity", "workflow", "models", "namespace"]);
  if (definition.schema_version !== 2 || definition.kind !== "docs-drift-native-trial" || typeof definition.entry !== "string"
    || !Object.hasOwn(settings.execution.entries, definition.entry)) fail("ordinary native trial definition required");
  const entry = definition.entry, component = parseComponentBinding(definition.component);
  if (!canonicalJSON(component).equals(canonicalJSON(settings.component))) fail("trial candidate component changed");
  const identity = object(definition.identity, ["hostname", "repository", "repository_id", "actor", "actor_id", "default_branch"]);
  if (identity.hostname !== settings.hostname || typeof identity.repository !== "string" || identity.repository.toLowerCase() !== settings.repository
    || identity.default_branch !== settings.default_branch || typeof identity.actor !== "string"
    || !sameLogin(identity.actor, publisherActor(settings, entry))) fail("trial consumer or publisher changed");
  const nativeIdentity = { repository: settings.repository, repository_id: positive(identity.repository_id), actor: identity.actor,
    actor_id: positive(identity.actor_id), default_branch: settings.default_branch };
  const workflow = object(definition.workflow, ["id", "path", "event"]), workflowPath = protocolPath(workflow.path);
  if (!/^\.github\/workflows\/[^/]+\.ya?ml$/u.test(workflowPath) || workflow.event !== "workflow_dispatch") fail("trial workflow dispatch required");
  const caller = readAdoptionInput(repo, source, workflowPath);
  if (!caller || caller.mode !== "100644") fail("committed trial caller required");
  const parsed: unknown = collectionReaders().yaml(caller.bytes);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) fail("trial workflow required");
  const on: unknown = Reflect.get(parsed, "on");
  if (!(on === "workflow_dispatch" || Array.isArray(on) && on.includes("workflow_dispatch")
    || on !== null && typeof on === "object" && Object.hasOwn(on, "workflow_dispatch"))) fail("committed dispatch trigger required");
  const models = object(definition.models, ["worker", "reviewer"]), configured = settings.execution.entries[entry];
  const role = (name: "worker" | "reviewer") => {
    const selectedRole = configured[name], model = models[name];
    if (typeof model !== "string" || !/[0-9]/u.test(model) || !modelMatches(selectedRole.model, model) || !selectedRole.identity_source)
      fail("trial native role binding required");
    return { requested_model: selectedRole.model, adopted_model: model, identity_source: selectedRole.identity_source };
  };
  const namespace = object(definition.namespace, ["branch_prefix", "lease_ref", "receipt_ref_prefix", "paths"]);
  if (typeof namespace.branch_prefix !== "string" || !namespace.branch_prefix.endsWith("/")
    || typeof namespace.lease_ref !== "string" || typeof namespace.receipt_ref_prefix !== "string" || !namespace.receipt_ref_prefix.endsWith("/"))
    fail("trial namespace required");
  const refs = ["refs/heads/" + namespace.branch_prefix, namespace.lease_ref, namespace.receipt_ref_prefix];
  for (const ref of refs) {
    if (!ref.startsWith("refs/heads/")) fail("trial head namespace required");
    readGit(repo, "check-ref-format", ref.endsWith("/") ? ref + "probe" : ref);
  }
  const production = ["refs/heads/" + settings.publication.branch_prefix, settings.publication.lease_ref, settings.publication.receipt_ref_prefix,
    ...settings.pr_discovery.branch_prefixes.map(prefix => "refs/heads/" + prefix),
    ...settings.legacy_proposals.branch_prefixes.map(prefix => "refs/heads/" + prefix)];
  if (refs.some((ref, index) => production.some(other => overlaps(ref, other)) || refs.slice(index + 1).some(other => overlaps(ref, other))))
    fail("trial namespace overlaps active or legacy resources");
  if (!Array.isArray(namespace.paths) || namespace.paths.length === 0 || namespace.paths.length > 100) fail("bounded trial paths required");
  const paths = namespace.paths.map(value => protocolPath(typeof value === "string" && value.endsWith("/") ? value.slice(0, -1) : value));
  if (new Set(paths).size !== paths.length || paths.some(path => !settings.roots.some(root => withinPrefix(path, root)))) fail("trial paths outside documentation scope");
  return { settings, settings_sha256: loaded.settings_sha256, definition_sha256: selected.definition.sha256, component, entry, identity: nativeIdentity,
    workflow: { id: positive(workflow.id), path: workflowPath, event: "workflow_dispatch" as const },
    worker: role("worker"), reviewer: role("reviewer"), namespace: { branch_prefix: namespace.branch_prefix,
      lease_ref: namespace.lease_ref, receipt_ref_prefix: namespace.receipt_ref_prefix, paths } };
}

function trialSettings(definition: ReturnType<typeof installedTrialDefinition>) {
  return { ...definition.settings, publication: { ...definition.settings.publication,
    branch_prefix: definition.namespace.branch_prefix, lease_ref: definition.namespace.lease_ref, receipt_ref_prefix: definition.namespace.receipt_ref_prefix },
    pr_discovery: { ...definition.settings.pr_discovery, branch_prefixes: [definition.namespace.branch_prefix] },
    legacy_proposals: { ...definition.settings.legacy_proposals, branch_prefixes: [definition.namespace.branch_prefix], ids: [] } };
}

/** Observation selects only the exact namespace from the original committed trial definition. */
export function readNativeTrialSettings(options: { repo: string; source: string; definition_sha256: string }) {
  const definition = installedTrialDefinition(options.repo, options.source);
  if (definition.definition_sha256 !== options.definition_sha256) fail("selected original trial definition changed");
  return freezeJSON({ authority: "none" as const, settings: trialSettings(definition) });
}

function nativeTrialPolicy(definition: ReturnType<typeof installedTrialDefinition>, source: string, identity: PublicationIdentity,
  launchInput: unknown, publicationKind: "advisory" | "resolve") {
  const launch = parseTrialLaunch(launchInput), expected = definition.identity;
  if (launch.hostname !== definition.settings.hostname || launch.repository.toLowerCase() !== expected.repository
    || launch.repository_id !== expected.repository_id || launch.head_commit !== source || !sameAccount(launch, expected)
    || identity.repository.toLowerCase() !== expected.repository || identity.repository_id !== expected.repository_id
    || identity.default_branch !== expected.default_branch || !sameAccount(identity, expected)
    || launch.workflow_id !== definition.workflow.id || launch.workflow_path !== definition.workflow.path || launch.event !== definition.workflow.event)
    fail("native trial launch or publisher changed");
  const policy = { schema_version: 2 as const, policy_sha256: canonicalDigest({ definition_sha256: definition.definition_sha256,
    component: definition.component, native_launch: launch }), component: definition.component, trial_launch: launch,
    context: "trial" as const, transport: "native" as const, publication_kind: publicationKind, pr_draft: true,
    publisher_entry: definition.entry, worker: definition.worker, reviewer: definition.reviewer };
  return freezeJSON({ authority: "none" as const, source_commit: source, definition_sha256: definition.definition_sha256,
    settings: trialSettings(definition), policy, namespace: definition.namespace });
}

/** Only the credential-selected publisher and native run observation supply launch attribution. */
export function readNativeTrialPolicy(options: { repo: string; current_default: string; identity: PublicationIdentity; entry: string;
  reader: Pick<RepositoryReader, "run">; run_id: number; run_attempt: number; publication_kind?: "advisory" | "resolve" }) {
  const definition = installedTrialDefinition(options.repo, options.current_default);
  if (definition.entry !== options.entry) fail("trial execution entry changed");
  const run = options.reader.run(positive(options.run_id), positive(options.run_attempt));
  if (run.id !== options.run_id || run.run_attempt !== options.run_attempt || run.status !== "in_progress"
    || run.event !== "workflow_dispatch" || run.head_branch !== definition.identity.default_branch || run.repository.id !== definition.identity.repository_id
    || run.repository.full_name.toLowerCase() !== definition.identity.repository || run.head_repository?.id !== run.repository.id
    || run.head_repository.full_name.toLowerCase() !== definition.identity.repository
    || ![definition.workflow.path, definition.workflow.path + "@refs/heads/" + definition.identity.default_branch,
      definition.workflow.path + "@" + options.current_default].includes(run.path)) fail("native trial run observation changed");
  const launch: NativeTrialLaunch = { hostname: definition.settings.hostname, repository: run.repository.full_name, repository_id: run.repository.id,
    actor: options.identity.actor, actor_id: options.identity.actor_id, workflow_id: run.workflow_id, workflow_path: definition.workflow.path,
    event: run.event, head_commit: run.head_sha, run_id: run.id, run_attempt: run.run_attempt };
  return nativeTrialPolicy(definition, options.current_default, options.identity, launch, options.publication_kind ?? "advisory");
}

/** Recovery reopens the original definition and launch, with no successor-schema or provider probe. */
export function readOriginalNativeTrialPolicy(options: { repo: string; plan: CurrentSealedPlan; identity: PublicationIdentity }) {
  const { plan } = options, source = plan.manifest.bindings.source_commit;
  const definition = installedTrialDefinition(options.repo, source);
  if (plan.context !== "trial" || plan.transport !== "native" || plan.manifest.publisher_entry !== definition.entry
    || plan.manifest.bindings.settings_sha256 !== definition.settings_sha256) fail("original trial policy required");
  const result = nativeTrialPolicy(definition, source, options.identity, plan.trial_launch, plan.publication_kind);
  if (result.policy.policy_sha256 !== plan.policy_sha256 || !canonicalJSON(result.policy.component).equals(canonicalJSON(plan.component)))
    fail("original trial policy binding changed");
  readVerifiedPlan(canonicalJSON(plan), () => result.policy);
  return result;
}
