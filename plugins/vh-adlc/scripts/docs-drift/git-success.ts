import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { realpathSync } from "node:fs";
import { gitReadArguments } from "../git-read";
import { publishArtifact, readArtifact, type SealedPlan } from "./journal";
import { effectDigest, ref, type Effect } from "./manifests";
import { canonicalJSON, decodeUTF8, sha256 } from "./protocol";
import { externalArtifactDirectory } from "./snapshot";
import type { PublicationIdentity } from "./transport";
import type { SuccessEvidence } from "./success";

export type GitUpdate = { ref: string; head: string | null; expected: string };
type Scope = { source_repo: string; artifact_root: string; plan: SealedPlan; effect: Effect; attempt_id: string };
type Projection = { schema_version: 1; updates: GitUpdate[]; statuses: string[]; response_sha256: string };

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== keys.sort().join(",")) throw Error("invalid Git application fields");
  return value as Record<string, unknown>;
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw Error("invalid Git application digest");
  return value;
}
function oid(value: unknown): boolean { return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value); }
function validateUpdates(value: unknown): GitUpdate[] {
  if (!Array.isArray(value) || !value.length || value.length > 2) throw Error("invalid Git application updates");
  const seen = new Set<string>();
  for (const item of value) {
    const update = object(item, ["ref", "head", "expected"]), name = ref(update.ref);
    if (seen.has(name) || update.head !== null && !oid(update.head)
      || update.expected !== "" && !oid(update.expected)) throw Error("invalid Git application update");
    seen.add(name);
  }
  return value as GitUpdate[];
}

export function nativePushArguments(hostname: string, repository: string, updates: GitUpdate[]): string[] {
  validateUpdates(updates);
  return gitReadArguments(["--no-lazy-fetch", "--no-replace-objects", "-c", "core.hooksPath=/dev/null", "-c", "credential.helper=",
    "-c", "credential.helper=!gh auth git-credential", "-c", "http.extraHeader=", "push", "--porcelain",
    ...(updates.length > 1 ? ["--atomic"] : []), ...updates.map(update => `--force-with-lease=${update.ref}:${update.expected}`),
    "--", `https://${hostname}/${repository}.git`, ...updates.map(update => `${update.head ?? ""}:${update.ref}`)]);
}

export function collectorRefArguments(updates: GitUpdate[]): string[] {
  validateUpdates(updates);
  return ["collector", "refs", sha256(canonicalJSON(updates))];
}

/** Only a complete positive porcelain response can settle these ref requests. */
export function projectGitSuccess(bytes: Uint8Array, updates: GitUpdate[]): Projection | null {
  validateUpdates(updates);
  if (bytes.byteLength > 16 * 1024 * 1024) return null;
  const raw = decodeUTF8(bytes);
  if (/[\0\r]/u.test(raw)) return null;
  const lines = raw.split("\n");
  if (lines.pop() !== "" || lines.pop() !== "Done") return null;
  const destination = lines.shift();
  if (!destination?.startsWith("To ") || destination.length <= 3 || lines.length !== updates.length) return null;
  const selected = new Map(updates.map(update => [`${update.head ?? ""}:${update.ref}`, update]));
  const statuses = new Map<string, string>();
  for (const line of lines) {
    const fields = line.split("\t"), update = selected.get(fields[1]);
    if (fields.length !== 3 || !update || !fields[2] || ![" ", "+", "*", "=", "-"].includes(fields[0])
      || (update.head === null ? fields[0] !== "-" : fields[0] === "-")) return null;
    selected.delete(fields[1]); statuses.set(fields[1], fields[0]);
  }
  if (selected.size) return null;
  return { schema_version: 1, updates, statuses: updates.map(update => statuses.get(`${update.head ?? ""}:${update.ref}`)!), response_sha256: sha256(bytes) };
}
function projection(value: unknown): Projection {
  const data = object(value, ["schema_version", "updates", "statuses", "response_sha256"]), updates = validateUpdates(data.updates);
  if (data.schema_version !== 1 || !Array.isArray(data.statuses) || data.statuses.length !== updates.length
    || data.statuses.some((status, index) => ![" ", "+", "*", "=", "-"].includes(status)
      || (updates[index].head === null ? status !== "-" : status === "-"))) throw Error("incomplete Git application projection");
  digest(data.response_sha256);
  return data as Projection;
}
function requestScope(options: Scope, updates: GitUpdate[]): void {
  const { plan, effect } = options, p = effect.payload;
  const selected = plan.manifest.effects.find(item => item.id === effect.id);
  if (!selected || effectDigest([selected]) !== effectDigest([effect]) || !["native", "collector"].includes(plan.transport)
    || !["trial", "production"].includes(plan.context) || plan.transport === "collector" && plan.context !== "trial" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(options.attempt_id)
    || !["lease-acquire", "receipt-retain", "lease-release", "push", "branch-refresh"].includes(effect.kind)) throw Error("Git application scope changed");
  const first = updates[0];
  if (first.ref !== p.ref || updates.length !== (effect.kind === "lease-acquire" ? 2 : 1)) throw Error("Git application refs changed");
  if (effect.kind === "lease-acquire") {
    const receipt = plan.manifest.effects[1];
    if (plan.manifest.effects[0].id !== effect.id || receipt?.kind !== "receipt-retain" || updates[1].ref !== receipt.payload.ref
      || first.head === null || updates[1].head !== first.head || updates.some(update => update.expected !== "")) throw Error("Git acquisition request changed");
  } else if (effect.kind === "lease-release") {
    if (first.head !== null || !oid(first.expected)) throw Error("Git release request changed");
  } else if (effect.kind === "receipt-retain") {
    if (first.head === null || first.expected !== "") throw Error("Git receipt request changed");
  } else if (first.head !== p.head || first.expected !== (effect.kind === "branch-refresh" ? p.expected_head : "")) throw Error("Git candidate request changed");
}
function commandScope(options: Scope, directory: string, hostname: string, projected: Projection) {
  const root = externalArtifactDirectory(options.artifact_root, options.source_repo), updates = projected.updates;
  const collector = options.plan.transport === "collector", prefix = collector ? "collector-command-" : "native-command-";
  if (dirname(directory) !== root || realpathSync(directory) !== directory
    || !new RegExp("^" + prefix + "[a-f0-9-]{36}$", "u").test(directory.slice(root.length + 1))) throw Error("foreign Git application command");
  const id = directory.slice(root.length + 1 + prefix.length);
  const ownerBytes = readArtifact(join(root, id + (collector ? ".collector-command.json" : ".native-command.json")));
  const owner = object(JSON.parse(decodeUTF8(ownerBytes)), ["schema_version", "kind", "capture", "root", "operation_id", "effect_id", "attempt_id", "argv_sha256"]);
  const argv = collector ? collectorRefArguments(updates) : nativePushArguments(hostname, options.plan.manifest.repository, updates);
  if (owner.schema_version !== 1 || owner.kind !== (collector ? "docs-drift-collector-command" : "docs-drift-native-command")
    || owner.capture !== (collector ? "fixture-v1" : "projected-v2") || owner.root !== directory
    || owner.operation_id !== options.plan.manifest.operation_id || owner.effect_id !== options.effect.id
    || owner.attempt_id !== options.attempt_id || owner.argv_sha256 !== sha256(canonicalJSON(argv))) throw Error("Git application command changed");
  const processBytes = readArtifact(join(directory, collector ? "fixture-result.json" : "process.json"));
  const status = JSON.parse(decodeUTF8(processBytes));
  if (collector) {
    const completed = object(status, ["schema_version", "kind", "transport", "context", "operation_id", "effect_id", "attempt_id", "completed", "request_sha256", "projection_sha256"]);
    if (processBytes.byteLength > 65536 || !canonicalJSON(completed).equals(processBytes) || completed.schema_version !== 1
      || completed.kind !== "docs-drift-collector-ref-result" || completed.transport !== "collector" || completed.context !== "trial"
      || completed.operation_id !== options.plan.manifest.operation_id || completed.effect_id !== options.effect.id
      || completed.attempt_id !== options.attempt_id || completed.completed !== true || completed.request_sha256 !== owner.argv_sha256
      || completed.projection_sha256 !== sha256(canonicalJSON(projected))) throw Error("fixture ref application unsettled");
  } else if (status.exit_code !== 0 || status.reaped !== true || status.timed_out !== false || status.cancelled !== null || status.output_limit !== false) throw Error("Git application command unsettled");
  return { owner_sha256: sha256(ownerBytes), process_sha256: sha256(processBytes), request_sha256: digest(owner.argv_sha256) };
}

export function retainGitSuccess(options: Scope & { command_directory: string; hostname: string; identity: PublicationIdentity; response: Uint8Array; updates: GitUpdate[] }): SuccessEvidence | null {
  const projected = projectGitSuccess(options.response, options.updates);
  if (!projected) return null;
  const command = commandScope(options, options.command_directory, options.hostname, projected);
  const value = { schema_version: 1, kind: "docs-drift-git-success", transport: options.plan.transport, context: options.plan.context,
    operation_id: options.plan.manifest.operation_id, plan_sha256: sha256(canonicalJSON(options.plan)), effect_sha256: effectDigest([options.effect]),
    attempt_id: options.attempt_id, hostname: options.hostname, identity: options.identity, command_directory: options.command_directory, command, projection: projected };
  validate(value, options);
  const bytes = canonicalJSON(value), path = join(externalArtifactDirectory(options.artifact_root, options.source_repo), "git-success-" + randomUUID() + ".json");
  if (bytes.byteLength > 65536) return null;
  publishArtifact(path, bytes);
  return { path, sha256: sha256(bytes) };
}
function validate(value: unknown, options: Scope) {
  const data = object(value, ["schema_version", "kind", "transport", "context", "operation_id", "plan_sha256", "effect_sha256", "attempt_id", "hostname", "identity", "command_directory", "command", "projection"]);
  const projected = projection(data.projection);
  requestScope(options, projected.updates);
  if (data.schema_version !== 1 || data.kind !== "docs-drift-git-success" || data.transport !== options.plan.transport || data.context !== options.plan.context
    || data.operation_id !== options.plan.manifest.operation_id || data.plan_sha256 !== sha256(canonicalJSON(options.plan))
    || data.effect_sha256 !== effectDigest([options.effect]) || data.attempt_id !== options.attempt_id
    || typeof data.hostname !== "string" || !/^[a-z0-9.-]+$/u.test(data.hostname) || typeof data.command_directory !== "string") throw Error("Git application proof changed");
  const identity = object(data.identity, ["repository", "repository_id", "actor", "actor_id", "default_branch"]);
  if (identity.repository !== options.plan.manifest.repository || identity.repository_id !== options.plan.manifest.repository_id
    || identity.actor !== options.plan.manifest.actor || identity.actor_id !== options.plan.manifest.actor_id
    || typeof identity.default_branch !== "string" || !identity.default_branch || /[\r\n\0]/u.test(identity.default_branch)) throw Error("Git application actor changed");
  if (!canonicalJSON(commandScope(options, data.command_directory, data.hostname, projected)).equals(canonicalJSON(data.command))) throw Error("Git application command proof changed");
  return { updates: projected.updates, hostname: data.hostname, identity: identity as PublicationIdentity, command_directory: data.command_directory };
}
export function readGitSuccess(options: Scope & { evidence: SuccessEvidence }) {
  const root = externalArtifactDirectory(options.artifact_root, options.source_repo), { evidence } = options;
  if (dirname(evidence.path) !== root || realpathSync(evidence.path) !== evidence.path) throw Error("foreign Git application proof");
  const bytes = readArtifact(evidence.path);
  if (bytes.byteLength > 65536 || sha256(bytes) !== evidence.sha256) throw Error("changed Git application proof");
  const value: unknown = JSON.parse(decodeUTF8(bytes));
  if (!canonicalJSON(value).equals(bytes)) throw Error("noncanonical Git application proof");
  return validate(value, options);
}
