import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { realpathSync } from "node:fs";
import { publishArtifact, readArtifact, type SealedPlan } from "./journal";
import { effectDigest, type Effect } from "./manifests";
import { canonicalJSON, decodeUTF8, sha256 } from "./protocol";
import { externalArtifactDirectory } from "./snapshot";

export type RejectionEvidence = { path: string; sha256: string };
export type RejectedUpdate = { ref: string; head: string | null };
type Protocol = { protocol: "git"; updates: RejectedUpdate[] } | { protocol: "http" };
type Scope = { artifact_root: string; source_repo: string; plan: SealedPlan; effect: Effect; attempt_id: string };

/** A mixed, missing or truncated status report establishes no non-application proof. */
export function gitRejection(bytes: Uint8Array, updates: RejectedUpdate[]) {
  const lines = decodeUTF8(bytes).split("\n");
  if (lines.pop() !== "" || lines.pop() !== "Done" || !lines.shift()?.startsWith("To ")
    || lines.length !== updates.length || updates.length === 0) return null;
  const expected = new Set(updates.map(item => `${item.head ?? ""}:${item.ref}`));
  if (expected.size !== updates.length) return null;
  for (const line of lines) {
    const fields = line.split("\t");
    if (fields.length !== 3 || fields[0] !== "!" || !expected.delete(fields[1])
      || !/^\[(?:rejected|remote rejected)\] \(.+\)$/u.test(fields[2])) return null;
    if (fields[2].startsWith("[rejected]") && !/^\[rejected\] \((?:stale info|fetch first|non-fast-forward|already exists|atomic push failed)\)$/u.test(fields[2])) return null;
  }
  return { protocol: "git" as const, refs: updates.map(item => item.ref) };
}

/** gh --include emits the complete error body even when its success projection suppresses bodies. */
export function httpRejection(bytes: Uint8Array) {
  const raw = decodeUTF8(bytes), split = raw.search(/\r?\n\r?\n/u);
  if (split < 0) return null;
  const header = raw.slice(0, split), body = raw.slice(split).replace(/^\r?\n\r?\n/u, "");
  const status = Number(/^HTTP\/[\d.]+ (\d{3})(?:\s|$)/u.exec(header)?.[1]);
  if (status < 400 || status > 499 || status === 408 || status === 429 || !Number.isInteger(status)) return null;
  const lengths = [...header.matchAll(/^content-length:\s*(\d+)\s*$/gimu)];
  if (lengths.length > 1 || lengths.length === 1 && Number(lengths[0][1]) !== Buffer.byteLength(body)) return null;
  try {
    const value: unknown = JSON.parse(body);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  } catch { return null; }
  return { protocol: "http" as const, status };
}

function observedCommand(options: Scope, directory: string, protocol: Protocol) {
  const root = externalArtifactDirectory(options.artifact_root, options.source_repo);
  if (dirname(directory) !== root || realpathSync(directory) !== directory
    || !/^native-command-[a-f0-9-]{36}$/u.test(directory.slice(root.length + 1))) throw Error("foreign rejection command");
  const ownerBytes = readArtifact(join(root, directory.slice(root.length + 1).replace("native-command-", "") + ".native-command.json"));
  const owner = JSON.parse(decodeUTF8(ownerBytes)) as Record<string, unknown>;
  if (owner.schema_version !== 1 || owner.kind !== "docs-drift-native-command" || owner.root !== directory
    || owner.operation_id !== options.plan.manifest.operation_id || owner.effect_id !== options.effect.id
    || owner.attempt_id !== options.attempt_id) throw Error("rejection command scope changed");
  const processBytes = readArtifact(join(directory, "process.json"));
  const status = JSON.parse(decodeUTF8(processBytes)) as Record<string, unknown>;
  if (typeof status.exit_code !== "number" || status.exit_code <= 0 || status.reaped !== true
    || status.timed_out !== false || status.cancelled !== null || status.output_limit !== false) throw Error("incomplete rejected command");
  const stdout = readArtifact(join(directory, "stdout"));
  const observed = protocol.protocol === "git" ? gitRejection(stdout, protocol.updates) : httpRejection(stdout);
  if (!observed) throw Error("missing positive rejection response");
  return { owner_sha256: sha256(ownerBytes), process_sha256: sha256(processBytes), stdout_sha256: sha256(stdout), observed };
}

/** This proof comes only from the owned native command, with every command file rechecked on recovery. */
export function retainRejection(options: Scope & { command_directory: string; protocol: Protocol }): RejectionEvidence {
  const command = observedCommand(options, options.command_directory, options.protocol);
  const bytes = canonicalJSON({ schema_version: 1, state: "rejected", operation_id: options.plan.manifest.operation_id,
    repository: options.plan.manifest.repository, plan_sha256: sha256(canonicalJSON(options.plan)),
    effect_sha256: effectDigest([options.effect]), attempt_id: options.attempt_id,
    command_directory: options.command_directory, protocol: options.protocol, command });
  const path = join(externalArtifactDirectory(options.artifact_root, options.source_repo), "rejection-" + randomUUID() + ".json");
  publishArtifact(path, bytes);
  return { path, sha256: sha256(bytes) };
}

export function readRejection(options: Scope & { evidence: RejectionEvidence }): RejectionEvidence {
  const root = externalArtifactDirectory(options.artifact_root, options.source_repo), { evidence } = options;
  if (dirname(evidence.path) !== root || realpathSync(evidence.path) !== evidence.path) throw Error("foreign rejection proof");
  const bytes = readArtifact(evidence.path);
  if (sha256(bytes) !== evidence.sha256) throw Error("changed rejection proof");
  const value = JSON.parse(decodeUTF8(bytes)) as Record<string, unknown>;
  if (!canonicalJSON(value).equals(bytes) || value.schema_version !== 1 || value.state !== "rejected"
    || value.operation_id !== options.plan.manifest.operation_id || value.repository !== options.plan.manifest.repository
    || value.plan_sha256 !== sha256(canonicalJSON(options.plan)) || value.effect_sha256 !== effectDigest([options.effect])
    || value.attempt_id !== options.attempt_id || typeof value.command_directory !== "string") throw Error("rejection proof scope changed");
  const protocol = value.protocol as Protocol;
  if (protocol === null || typeof protocol !== "object" || !["git", "http"].includes(protocol.protocol)) throw Error("invalid rejection protocol");
  if (protocol.protocol === "git" && (!Array.isArray(protocol.updates) || protocol.updates.some(item => item === null
    || typeof item !== "object" || typeof item.ref !== "string" || item.head !== null && typeof item.head !== "string"))) throw Error("invalid rejection refs");
  const command = observedCommand(options, value.command_directory, protocol);
  if (!canonicalJSON(command).equals(canonicalJSON(value.command))) throw Error("rejected command evidence changed");
  return evidence;
}
