import { parseTrialLaunch, readVerifiedPlan, type CurrentSealedPlan, type NativeTrialLaunch } from "./journal";
import { modelMatches } from "./manifests";
import type { PublicationIdentity } from "./transport";
import type { RepositoryReader } from "../github-read";
import { collectionReaders, readAdoptionInput, readGit } from "./git";
import { canonicalDigest, canonicalJSON, freezeJSON, protocolPath, withinPrefix } from "./protocol";
import { loadCommittedSettings, parseComponentBinding, type Settings } from "./settings";
import { publisherActor, sameAccount, sameLogin } from "./identity";

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

function nativeTrialPolicy(definition: ReturnType<typeof installedTrialDefinition>, source: string,
  launchInput: unknown, publicationKind: "advisory" | "resolve") {
  const launch = parseTrialLaunch(launchInput), expected = definition.identity;
  if (launch.hostname !== definition.settings.hostname || launch.repository.toLowerCase() !== expected.repository
    || launch.repository_id !== expected.repository_id || launch.head_commit !== source || !sameAccount(launch, expected)
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
  if (options.identity.repository.toLowerCase() !== definition.identity.repository
    || options.identity.repository_id !== definition.identity.repository_id
    || options.identity.default_branch !== definition.identity.default_branch || !sameAccount(options.identity, definition.identity))
    fail("native trial publisher changed");
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
  return nativeTrialPolicy(definition, options.current_default, launch, options.publication_kind ?? "advisory");
}

/** Reopen the immutable definition and recorded launch independently of a current native observation. */
export function readOriginalNativeTrialPolicy(options: { repo: string; plan: CurrentSealedPlan }) {
  const { plan } = options, source = plan.manifest.bindings.source_commit;
  const definition = installedTrialDefinition(options.repo, source);
  if (plan.context !== "trial" || plan.transport !== "native" || plan.manifest.publisher_entry !== definition.entry
    || plan.manifest.bindings.settings_sha256 !== definition.settings_sha256) fail("original trial policy required");
  const result = nativeTrialPolicy(definition, source, plan.trial_launch, plan.publication_kind);
  if (result.policy.policy_sha256 !== plan.policy_sha256 || !canonicalJSON(result.policy.component).equals(canonicalJSON(plan.component)))
    fail("original trial policy binding changed");
  readVerifiedPlan(canonicalJSON(plan), () => result.policy);
  return result;
}
