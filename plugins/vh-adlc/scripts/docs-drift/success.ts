import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { realpathSync } from "node:fs";
import { publishArtifact, readArtifact, type SealedPlan } from "./journal";
import { effectDigest, type Effect } from "./manifests";
import { canonicalJSON, decodeUTF8, sha256 } from "./protocol";
import { externalArtifactDirectory } from "./snapshot";
import type { PublicationIdentity } from "./transport";

export type SuccessEvidence = { path: string; sha256: string };
export type ExecutionEvidence = { successes: SuccessEvidence[] };
type Scope = { artifact_root: string; source_repo: string; plan: SealedPlan; effect: Effect; attempt_id: string };
type Facts = {
  id: number | null; number: number | null; title_sha256: string | null; body_sha256: string | null;
  state: "open" | "closed" | null; draft: boolean | null; labels: number[] | null;
};

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("invalid native success object");
  return value as Record<string, unknown>;
}
function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw Error("invalid native success identity");
  return value;
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw Error("invalid native success digest");
  return value;
}
function labelIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length > 1000) throw Error("invalid native success labels");
  const ids = value.map(item => positive(object(item).id)).sort((a, b) => a - b);
  if (new Set(ids).size !== ids.length) throw Error("duplicate native success label");
  return ids;
}

/** Response bytes are transient. Only fixed fields and body/title digests survive. */
export function projectSuccess(bytes: Uint8Array): { status: number; facts: Facts } | null {
  try {
    if (bytes.byteLength > 16 * 1024 * 1024) return null;
    const raw = decodeUTF8(bytes), split = raw.search(/\r?\n\r?\n/u);
    if (split < 0) return null;
    const header = raw.slice(0, split), body = raw.slice(split).replace(/^\r?\n\r?\n/u, "");
    const status = Number(/^HTTP\/[\d.]+ (\d{3})(?:\s|$)/u.exec(header)?.[1]);
    if (!Number.isInteger(status) || status < 200 || status > 299) return null;
    const lengths = [...header.matchAll(/^content-length:\s*(\d+)\s*$/gimu)];
    if (lengths.length > 1 || lengths.length === 1 && Number(lengths[0][1]) !== Buffer.byteLength(body)) return null;
    const value: unknown = JSON.parse(body);
    const facts: Facts = { id: null, number: null, title_sha256: null, body_sha256: null, state: null, draft: null, labels: null };
    if (Array.isArray(value)) facts.labels = labelIds(value);
    else {
      const response = object(value);
      facts.id = positive(response.id);
      if (Object.hasOwn(response, "number")) facts.number = positive(response.number);
      for (const field of ["title", "body"] as const) {
        if (response[field] !== undefined && response[field] !== null) {
          if (typeof response[field] !== "string") throw Error("invalid native success field");
          facts[`${field}_sha256`] = sha256(Buffer.from(response[field]));
        }
      }
      if (Object.hasOwn(response, "state")) {
        if (response.state !== "open" && response.state !== "closed") throw Error("invalid native success state");
        facts.state = response.state;
      }
      if (Object.hasOwn(response, "draft")) {
        if (typeof response.draft !== "boolean") throw Error("invalid native success draft state");
        facts.draft = response.draft;
      }
      if (Object.hasOwn(response, "labels")) facts.labels = labelIds(response.labels);
    }
    return { status, facts };
  } catch { return null; }
}

function commandScope(options: Scope, directory: string) {
  const root = externalArtifactDirectory(options.artifact_root, options.source_repo);
  if (dirname(directory) !== root || realpathSync(directory) !== directory
    || !/^native-command-[a-f0-9-]{36}$/u.test(directory.slice(root.length + 1))) throw Error("foreign success command");
  const ownerBytes = readArtifact(join(root, directory.slice(root.length + 1).replace("native-command-", "") + ".native-command.json"));
  const owner = object(JSON.parse(decodeUTF8(ownerBytes)));
  if (Object.keys(owner).sort().join(",") !== "argv_sha256,attempt_id,capture,effect_id,kind,operation_id,root,schema_version") throw Error("unsupported success command format");
  if (owner.schema_version !== 1 || owner.kind !== "docs-drift-native-command" || owner.capture !== "projected-v2"
    || owner.root !== directory || owner.operation_id !== options.plan.manifest.operation_id
    || owner.effect_id !== options.effect.id || owner.attempt_id !== options.attempt_id) throw Error("success command scope changed");
  const processBytes = readArtifact(join(directory, "process.json"));
  const process = object(JSON.parse(decodeUTF8(processBytes)));
  if (process.exit_code !== 0 || process.reaped !== true || process.timed_out !== false
    || process.cancelled !== null || process.output_limit !== false) throw Error("incomplete successful command");
  const input = readArtifact(join(directory, "payload.json"));
  return { owner_sha256: sha256(ownerBytes), process_sha256: sha256(processBytes),
    request_sha256: sha256(canonicalJSON({ argv_sha256: digest(owner.argv_sha256), input_sha256: sha256(input) })) };
}

export function retainSuccess(options: Scope & {
  command_directory: string; command_index: number; method: string; endpoint: string;
  identity: PublicationIdentity; response: Uint8Array;
}): SuccessEvidence | null {
  const selected = options.plan.manifest.effects.find(effect => effect.id === options.effect.id);
  if (options.plan.transport !== "native" || !selected || effectDigest([selected]) !== effectDigest([options.effect])) return null;
  const projected = projectSuccess(options.response);
  if (projected === null) return null;
  const command = commandScope(options, options.command_directory);
  if (options.identity.repository !== options.plan.manifest.repository
    || !Number.isSafeInteger(options.command_index) || options.command_index < 0 || options.command_index > 15
    || !["POST", "PUT", "PATCH"].includes(options.method)
    || !options.endpoint.startsWith("repos/" + options.identity.repository + "/")) throw Error("invalid success destination");
  const bytes = canonicalJSON({ schema_version: 1, transport: "native", context: options.plan.context,
    operation_id: options.plan.manifest.operation_id, repository: options.plan.manifest.repository,
    plan_sha256: sha256(canonicalJSON(options.plan)), effect_sha256: effectDigest([options.effect]), attempt_id: options.attempt_id,
    command_directory: options.command_directory, command_index: options.command_index, command,
    method: options.method, endpoint: options.endpoint, identity: options.identity,
    response_sha256: sha256(options.response), ...projected });
  if (bytes.byteLength > 65536) return null;
  const path = join(externalArtifactDirectory(options.artifact_root, options.source_repo), "success-" + randomUUID() + ".json");
  publishArtifact(path, bytes);
  return { path, sha256: sha256(bytes) };
}

/** The journal links these private attestations to its original run and attempt. */
export function readSuccess(options: Scope & { evidence: SuccessEvidence }): SuccessEvidence {
  const root = externalArtifactDirectory(options.artifact_root, options.source_repo);
  if (dirname(options.evidence.path) !== root || realpathSync(options.evidence.path) !== options.evidence.path) throw Error("foreign success proof");
  const bytes = readArtifact(options.evidence.path);
  if (bytes.byteLength > 65536 || sha256(bytes) !== options.evidence.sha256) throw Error("changed success proof");
  const value = object(JSON.parse(decodeUTF8(bytes)));
  if (options.plan.transport !== "native" || !canonicalJSON(value).equals(bytes) || value.schema_version !== 1 || value.transport !== "native"
    || value.context !== options.plan.context || value.operation_id !== options.plan.manifest.operation_id
    || value.repository !== options.plan.manifest.repository || value.plan_sha256 !== sha256(canonicalJSON(options.plan))
    || value.effect_sha256 !== effectDigest([options.effect]) || value.attempt_id !== options.attempt_id
    || typeof value.command_directory !== "string") throw Error("success proof scope changed");
  const expectedKeys = ["schema_version", "transport", "context", "operation_id", "repository", "plan_sha256", "effect_sha256", "attempt_id",
    "command_directory", "command_index", "command", "method", "endpoint", "identity", "response_sha256", "status", "facts"].sort().join(",");
  if (Object.keys(value).sort().join(",") !== expectedKeys || !Number.isSafeInteger(value.command_index)
    || Number(value.command_index) < 0 || Number(value.command_index) > 15 || !["POST", "PUT", "PATCH"].includes(String(value.method))
    || typeof value.endpoint !== "string" || !value.endpoint.startsWith("repos/" + options.plan.manifest.repository + "/")
    || !Number.isInteger(value.status) || Number(value.status) < 200 || Number(value.status) > 299) throw Error("invalid success projection");
  digest(value.response_sha256);
  const identity = object(value.identity);
  if (Object.keys(identity).sort().join(",") !== "actor,actor_id,default_branch,repository,repository_id"
    || identity.repository !== options.plan.manifest.repository) throw Error("invalid success actor binding");
  positive(identity.repository_id); positive(identity.actor_id);
  for (const field of ["actor", "default_branch"]) {
    if (typeof identity[field] !== "string" || !identity[field] || identity[field].includes("\0")) throw Error("invalid success identity text");
  }
  const facts = object(value.facts);
  if (Object.keys(facts).sort().join(",") !== "body_sha256,draft,id,labels,number,state,title_sha256") throw Error("invalid success facts");
  for (const field of ["id", "number"]) if (facts[field] !== null) positive(facts[field]);
  for (const field of ["title_sha256", "body_sha256"]) if (facts[field] !== null) digest(facts[field]);
  if (facts.state !== null && facts.state !== "open" && facts.state !== "closed"
    || facts.draft !== null && typeof facts.draft !== "boolean") throw Error("invalid success state");
  if (facts.labels !== null) {
    if (!Array.isArray(facts.labels) || facts.labels.length > 1000) throw Error("invalid success label facts");
    const ids = facts.labels.map(positive);
    if (new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && ids[index - 1] >= id)) throw Error("invalid success label order");
  }
  if (facts.id === null && facts.labels === null) throw Error("empty success facts");
  if (!canonicalJSON(commandScope(options, value.command_directory)).equals(canonicalJSON(value.command))) throw Error("success command evidence changed");
  return options.evidence;
}
