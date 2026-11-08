import { readGitSuccess } from "./git-success";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { realpathSync } from "node:fs";
import { publishArtifact, readArtifact, type SealedPlan } from "./journal";
import { effectDigest, ref as publicationRef, type Effect } from "./manifests";
import { canonicalJSON, decodeUTF8, sha256 } from "./protocol";
import { externalArtifactDirectory } from "./snapshot";
import type { PublicationIdentity } from "./transport";

export type SuccessEvidence = { path: string; sha256: string };
/** Captured command facts and pre-dispatch context, without a whole-effect completeness claim. */
export type ExecutionEvidence = { successes: SuccessEvidence[]; commands?: number; before?: SuccessEvidence };
export type ExecutionResult = ExecutionEvidence & { capture_unverified?: true };
type Scope = { artifact_root: string; source_repo: string; plan: SealedPlan; effect: Effect; attempt_id: string };
export type Facts = {
  id: number | null; number: number | null; title_sha256: string | null; body_sha256: string | null;
  state: "open" | "closed" | null; draft: boolean | null; labels: number[] | null;
  head_sha: string | null; base_sha: string | null; merged: boolean | null; head_ref: string | null; base_ref: string | null;
  head_repository_id: number | null; base_repository_id: number | null;
  user_id: number | null; user_login_sha256: string | null;
  parent_repository: string | null; parent_number: number | null; parent_url_sha256: string | null; parent_host: string | null; parent_path: string | null;
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
    const facts: Facts = { id: null, number: null, title_sha256: null, body_sha256: null, state: null, draft: null, labels: null,
      head_sha: null, base_sha: null, merged: null, head_ref: null, base_ref: null, head_repository_id: null, base_repository_id: null,
      user_id: null, user_login_sha256: null, parent_repository: null, parent_number: null, parent_url_sha256: null, parent_host: null, parent_path: null };
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
      for (const side of ["head", "base"] as const) {
        if (response[side] !== undefined && response[side] !== null) {
          const target = object(response[side]);
          if (target.ref !== undefined) {
            if (typeof target.ref !== "string") throw Error("invalid native branch");
            publicationRef("refs/heads/" + target.ref);
            facts[`${side}_ref`] = target.ref;
          }
          if (target.repo !== undefined && target.repo !== null) facts[`${side}_repository_id`] = positive(object(target.repo).id);
          if (target.sha !== undefined) {
            if (typeof target.sha !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(target.sha)) throw Error("invalid native head");
            facts[`${side}_sha`] = target.sha;
          }
        }
      }
      if (Object.hasOwn(response, "merged")) {
        if (typeof response.merged !== "boolean") throw Error("invalid native merge state");
        facts.merged = response.merged;
      }
      if (Object.hasOwn(response, "merged_at")) {
        const time = response.merged_at;
        if (time !== null && (typeof time !== "string" || !Number.isFinite(Date.parse(time)))) throw Error("invalid native merge timestamp");
        const merged = time !== null;
        if (facts.merged !== null && facts.merged !== merged) throw Error("contradictory native merge state");
        facts.merged = merged;
      }
      if (response.user !== undefined && response.user !== null) {
        const user = object(response.user);
        if (typeof user.login !== "string" || !user.login || user.login.includes("\0")) throw Error("invalid native creator");
        facts.user_id = positive(user.id);
        facts.user_login_sha256 = sha256(Buffer.from(user.login));
      }
      if (response.issue_url !== undefined) {
        if (typeof response.issue_url !== "string") throw Error("invalid comment parent");
        const url = new URL(response.issue_url);
        const parent = /\/repos\/([^/]+)\/([^/]+)\/issues\/([1-9][0-9]*)$/u.exec(url.pathname);
        if (url.protocol !== "https:" || !parent || url.search || url.hash || url.username || url.password || url.port) throw Error("invalid comment parent");
        facts.parent_host = url.hostname;
        facts.parent_path = url.pathname;
        facts.parent_repository = `${parent[1]}/${parent[2]}`.toLowerCase();
        facts.parent_number = positive(Number(parent[3]));
        facts.parent_url_sha256 = sha256(Buffer.from(response.issue_url));
      }
    }
    return { status, facts };
  } catch { return null; }
}

export function nativeMutationArguments(hostname: string, method: string, endpoint: string): string[] {
  return ["gh", "api", "--hostname", hostname, "--method", method, "--include", endpoint];
}
export function collectorMutationArguments(method: string, endpoint: string): string[] {
  return ["collector", method, endpoint];
}
/** The fixture tracker applies the selected fields atomically to its own objects. */
export function collectorRequest(effect: Effect, repository: string) {
  const p = effect.payload, prefix = "repos/" + repository;
  if (effect.kind === "pr-create") return { method: "POST", endpoint: prefix + "/pulls", input: { title: p.title, body: p.body, base: p.base, head: p.branch, draft: p.draft, labels: p.labels } };
  if (effect.kind === "issue-create") return { method: "POST", endpoint: prefix + "/issues", input: { title: p.title, body: p.body, labels: p.labels } };
  if (effect.kind === "comment-create") return { method: "POST", endpoint: `${prefix}/issues/${positive(p.number)}/comments`, input: { body: p.body } };
  if (effect.kind === "pr-update") return { method: "PATCH", endpoint: `${prefix}/pulls/${positive(p.number)}`, input: { title: p.title, body: p.body, labels: p.labels, draft: p.draft } };
  if (effect.kind === "pr-close") return { method: "PATCH", endpoint: `${prefix}/pulls/${positive(p.number)}`, input: { state: "closed" } };
  throw Error("unsupported collector request");
}
export function expectedRequest(effect: Effect, repository: string, index: number, endpoint?: string, transport: "native" | "collector" = "native") {
  if (transport === "collector") {
    if (index !== 0) throw Error("unsupported collector command index");
    return collectorRequest(effect, repository);
  }
  const p = effect.payload, prefix = "repos/" + repository;
  if (effect.kind === "pr-create") {
    if (index === 0) return { method: "POST", endpoint: prefix + "/pulls", input: { title: p.title, body: p.body, base: p.base, head: p.branch, draft: p.draft } };
    if (index === 1) {
      const start = prefix + "/issues/", target = /^([1-9][0-9]*)\/labels$/u.exec(endpoint?.slice(start.length) ?? "");
      if (!endpoint?.startsWith(start) || !target) throw Error("invalid creation label target");
      return { method: "PUT", endpoint: `${start}${positive(Number(target[1]))}/labels`, input: { labels: p.labels } };
    }
  }
  if (index === 0 && effect.kind === "issue-create") return { method: "POST", endpoint: prefix + "/issues", input: { title: p.title, body: p.body, labels: p.labels } };
  if (index === 0 && effect.kind === "comment-create") return { method: "POST", endpoint: `${prefix}/issues/${positive(p.number)}/comments`, input: { body: p.body } };
  if (index === 0 && effect.kind === "pr-close") return { method: "PATCH", endpoint: `${prefix}/pulls/${positive(p.number)}`, input: { state: "closed" } };
  if (effect.kind === "pr-update") {
    if (index === 0) return { method: "PATCH", endpoint: `${prefix}/pulls/${positive(p.number)}`, input: { title: p.title, body: p.body } };
    if (index === 1) return { method: "PUT", endpoint: `${prefix}/issues/${positive(p.number)}/labels`, input: { labels: p.labels } };
  }
  throw Error("unsupported success request");
}
function identityScope(plan: SealedPlan, identity: PublicationIdentity): void {
  if (identity.repository !== plan.manifest.repository || identity.repository_id !== plan.manifest.repository_id
    || identity.actor !== plan.manifest.actor || identity.actor_id !== plan.manifest.actor_id) throw Error("success identity scope changed");
}
function responseScope(effect: Effect, index: number, repository: string, repositoryId: number, actor: string, actorId: number, hostname: string, status: number, facts: Facts, transport: "native" | "collector"): void {
  const method = effect.kind === "pr-create" && index === 1 && transport === "native" ? "PUT" : expectedRequest(effect, repository, index, undefined, transport).method;
  if (status !== (method === "POST" ? 201 : 200)) throw Error("unsupported native success status");
  const parents = [facts.parent_repository, facts.parent_number, facts.parent_url_sha256, facts.parent_host, facts.parent_path];
  if (parents.some(value => value !== null) && parents.some(value => value === null)) throw Error("incomplete success parent binding");
  if (method === "PUT") {
    if (facts.labels === null || Object.entries(facts).some(([key, value]) => key !== "labels" && value !== null)) throw Error("invalid label response shape");
  } else if (facts.id === null) throw Error("missing success resource identity");
  if (["pr-create", "pr-update", "pr-close"].includes(effect.kind) && index === 0) {
    if (facts.base_repository_id !== null && facts.base_repository_id !== repositoryId) throw Error("success base repository changed");
    if (effect.kind !== "pr-close" && facts.head_repository_id !== null && facts.head_repository_id !== repositoryId) throw Error("success head repository changed");
  }
  if ((facts.user_id === null) !== (facts.user_login_sha256 === null)) throw Error("incomplete success creator binding");
  if ((effect.kind === "issue-create" || effect.kind === "pr-create" && index === 0) && facts.number === null || effect.kind === "comment-create" && facts.number !== null) throw Error("invalid creation response shape");
  if (facts.parent_number !== null && facts.number !== null && facts.parent_number !== facts.number) throw Error("inconsistent native parent number");
  if (facts.parent_url_sha256 !== null) {
    const host = hostname === "github.com" ? "api.github.com" : hostname;
    const path = `/repos/${repository}/issues/${facts.parent_number}`;
    const paths = hostname === "github.com" ? [path] : [path, "/api/v3" + path];
    if (facts.parent_host !== host || facts.parent_path === null || !paths.includes(facts.parent_path.toLowerCase())) throw Error("success parent destination changed");
  }
  if ((effect.kind === "pr-update" || effect.kind === "pr-close") && index === 0 && facts.number !== effect.payload.number) throw Error("success target changed");
  if (effect.kind === "issue-create" || effect.kind === "comment-create" || effect.kind === "pr-create" && index === 0) {
    if (facts.user_id !== actorId || facts.user_login_sha256 !== sha256(Buffer.from(actor))) throw Error("success creator changed");
  }
  if (effect.kind === "comment-create" && (facts.parent_number !== effect.payload.number || facts.parent_repository !== repository)) throw Error("success parent changed");
}

function commandScope(options: Scope, directory: string, hostname: string, method: string, endpoint: string, index: number,
  projection: { response_sha256: string; status: number; facts: Facts }) {
  const root = externalArtifactDirectory(options.artifact_root, options.source_repo);
  const collector = options.plan.transport === "collector", prefix = collector ? "collector-command-" : "native-command-";
  if (dirname(directory) !== root || realpathSync(directory) !== directory
    || !directory.slice(root.length + 1).startsWith(prefix)
    || !/^[a-f0-9-]{36}$/u.test(directory.slice(root.length + 1 + prefix.length))) throw Error("foreign success command");
  const id = directory.slice(root.length + 1 + prefix.length);
  const ownerBytes = readArtifact(join(root, id + (collector ? ".collector-command.json" : ".native-command.json")));
  const owner = object(JSON.parse(decodeUTF8(ownerBytes)));
  if (Object.keys(owner).sort().join(",") !== "argv_sha256,attempt_id,capture,effect_id,kind,operation_id,root,schema_version") throw Error("unsupported success command format");
  if (owner.schema_version !== 1 || owner.kind !== (collector ? "docs-drift-collector-command" : "docs-drift-native-command")
    || owner.capture !== (collector ? "fixture-v1" : "projected-v2")
    || owner.root !== directory || owner.operation_id !== options.plan.manifest.operation_id
    || owner.effect_id !== options.effect.id || owner.attempt_id !== options.attempt_id) throw Error("success command scope changed");
  const processBytes = readArtifact(join(directory, collector ? "fixture-result.json" : "process.json"));
  const process = object(JSON.parse(decodeUTF8(processBytes)));
  if (!collector && (process.exit_code !== 0 || process.reaped !== true || process.timed_out !== false
    || process.cancelled !== null || process.output_limit !== false)) throw Error("incomplete successful command");
  const input = readArtifact(join(directory, "payload.json"));
  const expected = expectedRequest(options.effect, options.plan.manifest.repository, index, endpoint, options.plan.transport);
  if (typeof hostname !== "string" || !hostname || /[\r\n\0]/u.test(hostname) || method !== expected.method || endpoint !== expected.endpoint
    || owner.argv_sha256 !== sha256(canonicalJSON(collector ? collectorMutationArguments(method, endpoint) : nativeMutationArguments(hostname, method, endpoint)))
    || !input.equals(canonicalJSON(expected.input))) throw Error("success request scope changed");
  const command = { owner_sha256: sha256(ownerBytes), process_sha256: sha256(processBytes),
    request_sha256: sha256(canonicalJSON({ argv_sha256: digest(owner.argv_sha256), input_sha256: sha256(input) })) };
  if (collector) {
    const keys = ["schema_version", "kind", "transport", "context", "operation_id", "effect_id", "attempt_id", "completed",
      "request_sha256", "response_sha256", "projection_sha256", "before"].sort().join(",");
    if (processBytes.byteLength > 65536 || !canonicalJSON(process).equals(processBytes) || Object.keys(process).sort().join(",") !== keys
      || process.schema_version !== 1 || process.kind !== "docs-drift-collector-result" || process.transport !== "collector" || process.context !== "trial"
      || process.operation_id !== options.plan.manifest.operation_id || process.effect_id !== options.effect.id
      || process.attempt_id !== options.attempt_id || process.completed !== true || process.request_sha256 !== command.request_sha256
      || process.response_sha256 !== projection.response_sha256
      || process.projection_sha256 !== sha256(canonicalJSON({ status: projection.status, facts: projection.facts }))) throw Error("unproved collector completion");
    const before = object(process.before);
    if (Object.keys(before).sort().join(",") !== "path,sha256" || typeof before.path !== "string" || dirname(before.path) !== root
      || realpathSync(before.path) !== before.path) throw Error("foreign collector baseline");
    return { ...command, baseline_sha256: digest(before.sha256) };
  }
  return command;
}

export function retainSuccess(options: Scope & {
  command_directory: string; command_index: number; hostname: string; method: string; endpoint: string;
  identity: PublicationIdentity; response: Uint8Array;
}): SuccessEvidence | null {
  const selected = options.plan.manifest.effects.find(effect => effect.id === options.effect.id);
  if (!["native", "collector"].includes(options.plan.transport) || !["production", "trial"].includes(options.plan.context)
    || options.plan.transport === "collector" && options.plan.context !== "trial"
    || !selected || effectDigest([selected]) !== effectDigest([options.effect])) return null;
  const projected = projectSuccess(options.response);
  if (projected === null) return null;
  identityScope(options.plan, options.identity);
  responseScope(options.effect, options.command_index, options.plan.manifest.repository, options.plan.manifest.repository_id, options.identity.actor, options.identity.actor_id, options.hostname, projected.status, projected.facts, options.plan.transport);
  const response_sha256 = sha256(options.response);
  const command = commandScope(options, options.command_directory, options.hostname, options.method, options.endpoint, options.command_index, { ...projected, response_sha256 });
  if (options.identity.repository !== options.plan.manifest.repository
    || !Number.isSafeInteger(options.command_index) || options.command_index < 0 || options.command_index > 15
    || !["POST", "PUT", "PATCH"].includes(options.method)
    || !options.endpoint.startsWith("repos/" + options.identity.repository + "/")) throw Error("invalid success destination");
  const bytes = canonicalJSON({ schema_version: 2, transport: options.plan.transport, context: options.plan.context,
    operation_id: options.plan.manifest.operation_id, repository: options.plan.manifest.repository,
    plan_sha256: sha256(canonicalJSON(options.plan)), effect_sha256: effectDigest([options.effect]), attempt_id: options.attempt_id,
    command_directory: options.command_directory, command_index: options.command_index, command,
    hostname: options.hostname, method: options.method, endpoint: options.endpoint, identity: options.identity,
    response_sha256, ...projected });
  if (bytes.byteLength > 65536) return null;
  const path = join(externalArtifactDirectory(options.artifact_root, options.source_repo), "success-" + randomUUID() + ".json");
  publishArtifact(path, bytes);
  return { path, sha256: sha256(bytes) };
}

/** The journal links these private attestations to its original run and attempt. */
export function readSuccess(options: Scope & { evidence: SuccessEvidence }): SuccessEvidence {
  if (["lease-acquire", "receipt-retain", "lease-release", "push", "branch-refresh"].includes(options.effect.kind)) {
    readGitSuccess(options);
    return options.evidence;
  }
  const selected = options.plan.manifest.effects.find(effect => effect.id === options.effect.id);
  if (!selected || effectDigest([selected]) !== effectDigest([options.effect])) throw Error("foreign success effect");
  const root = externalArtifactDirectory(options.artifact_root, options.source_repo);
  if (dirname(options.evidence.path) !== root || realpathSync(options.evidence.path) !== options.evidence.path) throw Error("foreign success proof");
  const bytes = readArtifact(options.evidence.path);
  if (bytes.byteLength > 65536 || sha256(bytes) !== options.evidence.sha256) throw Error("changed success proof");
  const value = object(JSON.parse(decodeUTF8(bytes)));
  if (!["native", "collector"].includes(options.plan.transport) || !["production", "trial"].includes(options.plan.context)
    || options.plan.transport === "collector" && options.plan.context !== "trial"
    || !canonicalJSON(value).equals(bytes) || value.schema_version !== 2 || value.transport !== options.plan.transport
    || value.context !== options.plan.context || value.operation_id !== options.plan.manifest.operation_id
    || value.repository !== options.plan.manifest.repository || value.plan_sha256 !== sha256(canonicalJSON(options.plan))
    || value.effect_sha256 !== effectDigest([options.effect]) || value.attempt_id !== options.attempt_id
    || typeof value.command_directory !== "string") throw Error("success proof scope changed");
  const expectedKeys = ["schema_version", "transport", "context", "operation_id", "repository", "plan_sha256", "effect_sha256", "attempt_id",
    "command_directory", "command_index", "command", "hostname", "method", "endpoint", "identity", "response_sha256", "status", "facts"].sort().join(",");
  if (Object.keys(value).sort().join(",") !== expectedKeys || !Number.isSafeInteger(value.command_index)
    || Number(value.command_index) < 0 || Number(value.command_index) > 15 || !["POST", "PUT", "PATCH"].includes(String(value.method))
    || typeof value.hostname !== "string" || typeof value.endpoint !== "string" || !value.endpoint.startsWith("repos/" + options.plan.manifest.repository + "/")
    || !Number.isInteger(value.status) || Number(value.status) < 200 || Number(value.status) > 299) throw Error("invalid success projection");
  digest(value.response_sha256);
  const identity = object(value.identity);
  if (Object.keys(identity).sort().join(",") !== "actor,actor_id,default_branch,repository,repository_id"
    || identity.repository !== options.plan.manifest.repository) throw Error("invalid success actor binding");
  positive(identity.repository_id); positive(identity.actor_id);
  if (identity.repository_id !== options.plan.manifest.repository_id || identity.actor !== options.plan.manifest.actor
    || identity.actor_id !== options.plan.manifest.actor_id) throw Error("success identity scope changed");
  for (const field of ["actor", "default_branch"]) {
    if (typeof identity[field] !== "string" || !identity[field] || identity[field].includes("\0")) throw Error("invalid success identity text");
  }
  const facts = object(value.facts);
  if (Object.keys(facts).sort().join(",") !== "base_ref,base_repository_id,base_sha,body_sha256,draft,head_ref,head_repository_id,head_sha,id,labels,merged,number,parent_host,parent_number,parent_path,parent_repository,parent_url_sha256,state,title_sha256,user_id,user_login_sha256") throw Error("invalid success facts");
  for (const field of ["id", "number", "head_repository_id", "base_repository_id", "user_id", "parent_number"]) if (facts[field] !== null) positive(facts[field]);
  for (const field of ["title_sha256", "body_sha256", "user_login_sha256", "parent_url_sha256"]) if (facts[field] !== null) digest(facts[field]);
  if (facts.state !== null && facts.state !== "open" && facts.state !== "closed"
    || facts.draft !== null && typeof facts.draft !== "boolean" || facts.merged !== null && typeof facts.merged !== "boolean") throw Error("invalid success state");
  if (facts.labels !== null) {
    if (!Array.isArray(facts.labels) || facts.labels.length > 1000) throw Error("invalid success label facts");
    const ids = facts.labels.map(positive);
    if (new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && ids[index - 1] >= id)) throw Error("invalid success label order");
  }
  for (const field of ["head_ref", "base_ref"]) {
    if (facts[field] !== null) {
      if (typeof facts[field] !== "string") throw Error("invalid success branch");
      publicationRef("refs/heads/" + facts[field]);
    }
  }
  for (const field of ["head_sha", "base_sha"]) {
    if (facts[field] !== null && (typeof facts[field] !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(facts[field]))) throw Error("invalid success commit");
  }
  for (const field of ["parent_host", "parent_path"]) {
    if (facts[field] !== null && (typeof facts[field] !== "string" || !facts[field] || facts[field].includes("\0"))) throw Error("invalid success parent location");
  }
  if (facts.parent_repository !== null && facts.parent_repository !== options.plan.manifest.repository) throw Error("invalid success parent repository");
  responseScope(options.effect, Number(value.command_index), options.plan.manifest.repository, options.plan.manifest.repository_id, String(identity.actor), Number(identity.actor_id), String(value.hostname), Number(value.status), facts as Facts, options.plan.transport);
  if (facts.id === null && facts.labels === null) throw Error("empty success facts");
  if (!canonicalJSON(commandScope(options, value.command_directory, String(value.hostname), String(value.method), String(value.endpoint), Number(value.command_index),
    { response_sha256: digest(value.response_sha256), status: Number(value.status), facts: facts as Facts })).equals(canonicalJSON(value.command))) throw Error("success command evidence changed");
  return options.evidence;
}
