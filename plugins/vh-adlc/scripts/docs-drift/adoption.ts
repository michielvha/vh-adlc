import { readGit, collectionReaders } from "./git";
import { canonicalDigest, canonicalJSON, compareUTF8, decodeUTF8, freezeJSON, protocolPath, sha256 } from "./protocol";
import { loadCommittedSettings, settingsProjections } from "./settings";

type ComponentPin = {
  schema_version: 1; source_repository: string; source_commit: string; source_release: string;
  plugin_version: string; component_sha256: string;
};
type CommittedInput = { path: string; mode: string; blob: string; bytes: Buffer; sha256: string };
function fail(reason: string): never { throw Error("incomplete docs-drift adoption " + reason); }
function immutable(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value)) fail("immutable commit required");
  return value;
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("invalid pin object");
  canonicalJSON(value);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== [...keys].sort().join(",")) fail("pin fields");
  return input;
}
export function parseComponentPin(value: unknown): ComponentPin {
  const input = object(value, ["schema_version", "source_repository", "source_commit", "source_release", "plugin_version", "component_sha256"]);
  if (input.schema_version !== 1 || typeof input.source_repository !== "string"
    || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/u.test(input.source_repository)
    || input.source_repository.split("/").some(part => part === "." || part === "..")) fail("pin repository or schema");
  const source_commit = immutable(input.source_commit);
  for (const field of ["source_release", "plugin_version"] as const) {
    if (typeof input[field] !== "string" || !/^(?:v)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(input[field])) fail("pin release/version");
  }
  if (typeof input.component_sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(input.component_sha256)) fail("pin component digest");
  return freezeJSON({ schema_version: 1, source_repository: input.source_repository.toLowerCase(), source_commit,
    source_release: input.source_release as string, plugin_version: input.plugin_version as string, component_sha256: input.component_sha256 });
}

/** Read only the literal path's Git blob. Links, submodules and checkout overlays cannot supply policy. */
function committedInput(repo: string, commit: string, path: string): CommittedInput | null {
  protocolPath(path);
  const raw = readGit(repo, "--literal-pathspecs", "ls-tree", "-z", immutable(commit), "--", path);
  if (raw.length === 0) return null;
  const tab = raw.indexOf(9);
  const metadata = /^(100644|100755) blob ([a-f0-9]{40}(?:[a-f0-9]{24})?)$/u.exec(raw.subarray(0, tab).toString("ascii"));
  if (tab < 0 || !metadata || raw.at(-1) !== 0 || decodeUTF8(raw.subarray(tab + 1, -1)) !== path) fail("regular committed input " + path);
  const bytes = readGit(repo, "cat-file", "blob", metadata[2]);
  return { path, mode: metadata[1], blob: metadata[2], bytes, sha256: sha256(bytes) };
}

/** Collect bindings only. Trial evidence, operator acceptance and effect authority are separate gates. */
export function collectAdoptionBindings(repo: string, sourceCommit: string) {
  const committed = loadCommittedSettings(repo, sourceCommit), { settings } = committed;
  if (settings.component_pin === null) fail("selected component pin missing");
  const pin = committedInput(repo, sourceCommit, settings.component_pin);
  if (!pin || pin.mode !== "100644") fail("selected component pin missing or nonregular");
  const value = parseComponentPin(collectionReaders().yaml(pin.bytes));
  const paths = [...new Set(["AGENTS.md", settings.project_procedure, settings.execution.worker_workflow,
    settings.execution.scheduled_workflow, settings.execution.claude_command, settings.runtime_loader.launcher,
    ...(settings.scanner.adapter === null ? [] : [settings.scanner.adapter])])].sort(compareUTF8);
  const blobs = paths.map(path => {
    const input = committedInput(repo, sourceCommit, path);
    if (input === null && path !== "AGENTS.md") fail("protected input missing " + path);
    return [path, input?.mode ?? null, input?.sha256 ?? null] as const;
  });
  const component = { path: pin.path, mode: pin.mode, sha256: pin.sha256, value };
  const protectedManifest = { settings: settingsProjections(settings).protected, component, blobs };
  return freezeJSON({ source_commit: sourceCommit, settings_sha256: committed.settings_sha256, settings,
    component_pin: component, protected_manifest: protectedManifest, protected_sha256: canonicalDigest(protectedManifest) });
}

/** Check structural C/D assembly. The evidence verifier separately validates the record contents. */
export function verifyCutoverAssembly(options: { repo: string; source_candidate: string; delivery_commit: string; record_path: string }) {
  const { repo, source_candidate: candidate, delivery_commit: delivery, record_path: path } = options;
  immutable(candidate); immutable(delivery); protocolPath(path);
  const bindings = collectAdoptionBindings(repo, candidate);
  if (bindings.settings.adoption.mode !== "adopted" || bindings.settings.adoption.record_path !== path) fail("cutover candidate selection");
  const parents = readGit(repo, "rev-list", "--parents", "-n", "1", delivery).toString().trim().split(" ");
  if (parents.length !== 2 || parents[0] !== delivery || parents[1] !== candidate) fail("cutover must be the direct single-parent child");
  if (committedInput(repo, candidate, path) !== null) fail("candidate already contains adoption record");
  const changed = readGit(repo, "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--name-status", "-z", candidate, delivery, "--");
  if (!changed.equals(Buffer.from("A\0" + path + "\0"))) fail("cutover child must add only the selected record");
  const record = committedInput(repo, delivery, path);
  if (!record || record.mode !== "100644") fail("regular cutover record required");
  return { source_candidate: candidate, delivery_commit: delivery, bindings, record };
}
