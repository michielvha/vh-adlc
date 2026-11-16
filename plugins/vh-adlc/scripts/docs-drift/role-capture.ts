import { verifyProductionPreflight } from "./preflight";
import { readRecordedRoleModel, verifyRuntimeAdoption } from "./adoption";
import type { selectOperationRuntime, InstalledRuntime, NativeTrialRuntime } from "./bootstrap";
import { samePublicationIdentity } from "./identity";
import type { PublicationIdentity } from "./transport";
import { isAbsolute, join } from "node:path";
import { ArtifactChanged, readBoundArtifact, readNativeRoleArtifacts } from "./evidence-input";
import type { SealedPlan } from "./journal";
import { fullModel, modelMatches, type RolePolicy } from "./manifests";
import { canonicalDigest, canonicalJSON, decodeUTF8, freezeJSON, protocolPath } from "./protocol";
import { artifactDirectoryScope } from "./snapshot";
import { decodeNativeRoleOutput } from "./native-role-output";

type Role = "worker" | "reviewer";
type Expected = { role: Role; source_commit: string; runtime_sha256: string; target_sha256: string };
type Launch = Expected & { schema_version: 1; kind: "docs-drift-role-launch"; invocation_id: string; context_id: string; pid: number };
function fail(reason: string): never { throw Error("docs-drift original role capture " + reason); }
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("object required");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) fail("fields changed");
  return input;
}
function json(bytes: Uint8Array): unknown {
  const value: unknown = JSON.parse(decodeUTF8(bytes));
  if (!canonicalJSON(value).equals(Buffer.from(bytes))) fail("canonical JSON required");
  return value;
}

/** Reload the original launch target and native artifacts. Execution origin remains owner-attested. */
export function readNativeRoleCapture(options: {
  source_repo: string; candidate_repo?: string; artifact_root: string; reference: unknown; expected: Expected; policy: RolePolicy;
  require_invocation?: boolean; expected_cwd?: string;
}) {
  const secondary = artifactDirectoryScope(options.artifact_root, options.candidate_repo ?? options.source_repo);
  function outside(reference: unknown): void {
    if (reference === null || typeof reference !== "object" || Array.isArray(reference)) fail("artifact reference required");
    secondary.assertExternal(join(secondary.directory, protocolPath((reference as Record<string, unknown>).path)));
  }
  function read(reference: unknown): Buffer {
    outside(reference);
    return readBoundArtifact({ source_repo: options.source_repo, artifact_root: secondary.directory, reference });
  }
  const expected = options.expected;
  if (!["worker", "reviewer"].includes(expected.role) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(expected.source_commit)
    || ![expected.target_sha256, expected.runtime_sha256].every(value => /^[a-f0-9]{64}$/u.test(value))) fail("expected bindings required");
  const raw = json(read(options.reference));
  const hasInvocation = raw !== null && typeof raw === "object" && Object.hasOwn(raw, "invocation");
  const capture = record(raw, ["schema_version", "kind", "role", "source_commit", "runtime_sha256", "launch", "binding", "artifacts", ...(hasInvocation ? ["invocation"] : [])]);
  if (capture.schema_version === 2 && !hasInvocation) fail("modern invocation record required");
  if (options.require_invocation && (capture.schema_version !== 2 || !hasInvocation)) fail("modern invocation capture required");
  if (options.expected_cwd !== undefined && !hasInvocation) fail("invocation record required for expected working directory");
  if ((capture.schema_version !== 1 && capture.schema_version !== 2) || capture.kind !== "docs-drift-role-capture" || capture.role !== expected.role
    || capture.source_commit !== expected.source_commit || capture.runtime_sha256 !== expected.runtime_sha256) throw new ArtifactChanged("docs-drift original role capture captured context changed");
  const launch = record(json(read(capture.launch)), ["schema_version", "kind", "role", "source_commit", "runtime_sha256", "target_sha256", "invocation_id", "context_id", "pid"]);
  if (launch.schema_version !== 1 || launch.kind !== "docs-drift-role-launch" || launch.role !== expected.role
    || launch.source_commit !== expected.source_commit || launch.runtime_sha256 !== expected.runtime_sha256 || launch.target_sha256 !== expected.target_sha256)
    throw new ArtifactChanged("docs-drift original role capture original launch target or context changed");
  const artifacts = record(capture.artifacts, ["native", "returned", "process"]);
  for (const reference of Object.values(artifacts)) outside(reference);
  if (capture.binding === null || typeof capture.binding !== "object" || Array.isArray(capture.binding)) fail("sealed role binding required");
  // The shared loader validates this exact sealed binding against the original native records.
  const binding = capture.binding as SealedPlan["roles"]["worker"];
  const evidence = readNativeRoleArtifacts({ source_repo: options.source_repo, artifact_root: secondary.directory,
    references: artifacts, binding, policy: options.policy });
  if (evidence.target_sha256 !== expected.target_sha256 || launch.invocation_id !== evidence.invocation_id
    || launch.context_id !== evidence.context_id || launch.pid !== evidence.process.pid) fail("original launch and native capture differ");
  if (hasInvocation) {
    const invocation = record(json(read(capture.invocation)), ["schema_version", "kind", "role", "source_commit", "runtime_sha256", "target_sha256",
      "invocation_id", "provider", "context_id", "cwd", "argv_sha256"]);
    if (invocation.schema_version !== 1 || invocation.kind !== "docs-drift-role-invocation" || invocation.role !== expected.role
      || invocation.source_commit !== expected.source_commit || invocation.runtime_sha256 !== expected.runtime_sha256
      || invocation.target_sha256 !== expected.target_sha256 || invocation.invocation_id !== evidence.invocation_id
      || invocation.provider !== evidence.provider || invocation.context_id !== evidence.context_id)
      throw new ArtifactChanged("docs-drift original role invocation changed");
    if (typeof invocation.cwd !== "string" || !isAbsolute(invocation.cwd) || invocation.cwd.includes("\0")
      || typeof invocation.argv_sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(invocation.argv_sha256)) fail("original invocation fields required");
    if (options.expected_cwd !== undefined && invocation.cwd !== options.expected_cwd) throw new ArtifactChanged("docs-drift original role working directory changed");
    const decoded = decodeNativeRoleOutput({ provider: evidence.provider, native: evidence.native,
      expected_context: evidence.context_id, expected_cwd: invocation.cwd });
    if (!Buffer.from(decoded.returned).equals(Buffer.from(evidence.returned))) fail("returned reply differs from final native message");
  }
  return { evidence, binding: freezeJSON(binding), launch: freezeJSON(launch as Launch) };
}


type Runtime = Awaited<ReturnType<typeof selectOperationRuntime>> | NativeTrialRuntime;

/** Ordinary disjoint default advances preserve this retained execution contract. */
export function roleRuntimeDigest(runtime: Runtime | InstalledRuntime, role: Role): string {
  if (runtime.kind === "docs-drift-native-trial-runtime")
    return canonicalDigest({ kind: runtime.kind, runtime_sha256: roleRuntimeDigest(runtime.runtime, role), policy_sha256: runtime.trial.policy.policy_sha256 });
  if (runtime.kind === "docs-drift-installed-runtime") {
    const selected = runtime[role], { directory: _directory, ...component } = runtime.component;
    return canonicalDigest({ kind: runtime.kind, settings_sha256: runtime.settings_sha256, component, entry: runtime.entry,
      role, selected: { client: selected.client, client_id: selected.client_id, model: selected.model, argv: selected.argv,
        identity_source: selected.identity_source }, credential_references: runtime.loader.credential_references,
      ...("policy_sha256" in runtime ? { policy_sha256: runtime.policy_sha256, observed_models: runtime.observed_models } : {}) });
  }
  return canonicalDigest({ adoption_sha256: runtime.adoption_sha256, component: runtime.component, entry: runtime.entry,
    role, selected: runtime[role], loader: runtime.loader });
}

/** Read the adopted full model from its validated historical receipt, independently of the requested selector. */
export function readAdoptedRolePolicy(options: { repo: string; current_default: string; identity: PublicationIdentity; runtime: Runtime; role: Role }): RolePolicy {
  const runtime = options.runtime;
  if (runtime.kind === "docs-drift-native-trial-runtime") {
    const { policy, source_commit, settings } = runtime.trial, launch = policy.trial_launch;
    if (options.current_default !== source_commit || runtime.runtime.source_commit !== source_commit || runtime.runtime.entry !== policy.publisher_entry
      || !samePublicationIdentity(options.identity, { repository: launch.repository, repository_id: launch.repository_id, actor: launch.actor,
        actor_id: launch.actor_id, default_branch: settings.default_branch })) fail("original native trial role scope changed");
    return policy[options.role];
  }
  if (runtime.kind === "docs-drift-installed-runtime") {
    const { plugin_version, source_commit, component_sha256 } = runtime.component;
    const preflight = verifyProductionPreflight({ ...options, component: { plugin_version, source_commit, component_sha256 },
      publisher: { entry: runtime.entry, identity: options.identity } });
    if (preflight.policy_sha256 !== runtime.policy_sha256) fail("current flat policy changed");
    const selected = runtime[options.role], observed = preflight.checklist.native_entries[runtime.entry];
    const model = options.role === "worker" ? observed.worker_model : observed.reviewer_model;
    if (!selected.identity_source || !modelMatches(selected.model, model) || runtime.observed_models[options.role] !== model)
      fail("observed native role policy changed");
    return { requested_model: selected.model, adopted_model: model, identity_source: selected.identity_source };
  }
  const adopted = verifyRuntimeAdoption({ ...options, entry: runtime.entry });
  if (adopted.adoption_sha256 !== runtime.adoption_sha256) fail("current adoption changed");
  const name = runtime.entry === "hosted" ? "hosted_advisory" : runtime.entry === "copilot" ? "copilot_entry" : "claude_entry";
  const native = fullModel(readRecordedRoleModel(adopted.receipts, name, options.role)), selected = runtime[options.role];
  if (!selected.identity_source || !modelMatches(selected.model, native)) fail("adopted native role capability unavailable");
  return { requested_model: selected.model, adopted_model: native, identity_source: selected.identity_source };
}
