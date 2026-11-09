import { dirname, join } from "node:path";
import { lstatSync, realpathSync } from "node:fs";
import { readArtifact, type SealedPlan } from "./journal";
import { verifyRoleIdentity, type NativeRoleEvidence, type RolePolicy } from "./manifests";
import { canonicalJSON, decodeUTF8, protocolPath, sha256 } from "./protocol";
import { artifactDirectoryScope } from "./snapshot";

function fail(reason: string): never { throw Error("docs-drift original evidence " + reason); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("object required");
  canonicalJSON(value);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) fail("fields");
  return input;
}

function readFromScope(scope: ReturnType<typeof artifactDirectoryScope>, value: unknown): Buffer {
  const root = scope.directory;
  const reference = object(value, ["path", "sha256"]);
  if (typeof reference.path !== "string" || typeof reference.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(reference.sha256)) fail("artifact reference");
  const relative = protocolPath(reference.path), path = join(root, relative), owner = process.getuid?.();
  scope.assertExternal(path);
  if (owner === undefined || realpathSync(path) !== path) fail("linked artifact");
  let parent = dirname(path);
  while (parent !== root) {
    const stat = lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== owner || (stat.mode & 0o077) !== 0) fail("private artifact parent required");
    parent = dirname(parent);
  }
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) fail("single-link regular artifact required");
  const bytes = readArtifact(path), after = lstatSync(path);
  if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode || before.uid !== after.uid
    || after.nlink !== 1 || after.size !== bytes.length || sha256(bytes) !== reference.sha256) fail("artifact changed");
  return bytes;
}

/** Load the referenced private bytes. The operator checks execution origin separately. */
export function readBoundArtifact(options: { source_repo: string; artifact_root: string; reference: unknown }): Buffer {
  return readFromScope(artifactDirectoryScope(options.artifact_root, options.source_repo), options.reference);
}

/** Read original role records and apply the existing identity protocol. Effect authority is separate. */
export function readNativeRoleArtifacts(options: {
  source_repo: string; artifact_root: string; references: unknown; binding: SealedPlan["roles"]["worker"]; policy: RolePolicy;
}): NativeRoleEvidence {
  const references = object(options.references, ["native", "returned", "process"]);
  const scope = artifactDirectoryScope(options.artifact_root, options.source_repo);
  const native = readFromScope(scope, references.native), returned = readFromScope(scope, references.returned);
  const processBytes = readFromScope(scope, references.process);
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUTF8(processBytes));
    if (!canonicalJSON(parsed).equals(processBytes)) fail("process JSON");
  } catch { fail("process JSON"); }
  const completion = object(parsed, ["pid", "exit_code", "timed_out", "cancelled", "output_limit", "reaped"]);
  if (typeof completion.pid !== "number" || !Number.isSafeInteger(completion.pid) || completion.pid < 1
    || completion.exit_code !== 0 || completion.timed_out !== false || completion.cancelled !== null
    || completion.output_limit !== false || completion.reaped !== true) fail("native process incomplete");
  const binding = options.binding;
  const evidence: NativeRoleEvidence = { invocation_id: binding.invocation_id, context_id: binding.context_id,
    provider: binding.provider, target_sha256: binding.target_sha256, isolation: binding.isolation,
    native, native_sha256: binding.native_sha256, returned, returned_sha256: binding.returned_sha256,
    process: { pid: completion.pid, exit_code: completion.exit_code, timed_out: completion.timed_out,
      cancelled: completion.cancelled, output_limit: completion.output_limit, reaped: completion.reaped } };
  const { records: _records, ...verified } = verifyRoleIdentity(evidence, options.policy);
  if (!canonicalJSON(verified).equals(canonicalJSON(binding))) fail("sealed role binding changed");
  return evidence;
}
