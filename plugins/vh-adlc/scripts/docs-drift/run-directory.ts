import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { readBoundArtifact } from "./evidence-input";
import { numberedRecordFiles, publishArtifact, readArtifact, syncDirectory } from "./journal";
import { exactRecord } from "./publication-decisions";
import { canonicalDigest, canonicalJSON, decodeUTF8, freezeJSON, protocolPath, sha256 } from "./protocol";
import { artifactDirectoryScope, captureSnapshot, externalResourceScope } from "./snapshot";

export const RUN_COMMANDS = ["scan", "report", "resolve", "prepare", "verify", "publish", "resume", "close"] as const;
type Command = typeof RUN_COMMANDS[number];
type Reference = { path: string; sha256: string };
type RunOptions = { repo: string; directory: string; origins: string };
type Manifest = {
  schema_version: 1; kind: "docs-drift-run"; id: string; nonce: string; directory: string;
  device: string; inode: string; source_repo: string; source_commit: string;
  settings_sha256: string; read_set_sha256: string; entry: string;
  mode: "audit" | "resolve" | "close"; proposals: number[];
  bun_version: string;
};
type Stage = {
  schema_version: 1; kind: "docs-drift-run-stage"; run_id: string; revision: number; previous_sha256: string;
  command: Command; state: "complete" | "pending" | "setup-required"; artifacts: Record<string, Reference>;
};
export type RunDirectory = {
  authority: "none"; origin: "original" | "observation-only"; directory: string;
  manifest: Manifest; stages: Stage[]; digest: string;
};
const contexts = new WeakMap<RunDirectory, RunOptions>();
function fail(reason: string): never { throw Error("docs-drift run " + reason); }
function text(value: unknown): string {
  if (typeof value !== "string" || !value || value.includes("\0")) fail("invalid string");
  return value;
}
function hash(value: unknown): string {
  const result = text(value);
  if (!/^[a-f0-9]{64}$/u.test(result)) fail("invalid digest");
  return result;
}
function uuid(value: unknown): string {
  const result = text(value);
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(result)) fail("invalid identity");
  return result;
}
function record(bytes: Uint8Array): unknown {
  const value: unknown = JSON.parse(decodeUTF8(bytes));
  if (!canonicalJSON(value).equals(Buffer.from(bytes))) fail("canonical record required");
  return value;
}
function manifestRecord(value: unknown): Manifest {
  canonicalJSON(value);
  const item = exactRecord(value, ["schema_version", "kind", "id", "nonce", "directory", "device", "inode", "source_repo", "source_commit",
    "settings_sha256", "read_set_sha256", "entry", "mode", "proposals", "bun_version"], "docs-drift run unknown manifest format; use its original implementation");
  if (item.schema_version !== 1 || item.kind !== "docs-drift-run" || typeof item.source_commit !== "string"
    || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(item.source_commit)) fail("unknown source or manifest format");
  if (item.mode !== "audit" && item.mode !== "resolve" && item.mode !== "close"
    || !Array.isArray(item.proposals) || item.proposals.length > 1000
    || item.proposals.some(id => !Number.isSafeInteger(id) || typeof id !== "number" || id < 1)
    || new Set(item.proposals).size !== item.proposals.length || (item.mode === "audit" ? item.proposals.length !== 0 : item.proposals.length === 0)) fail("explicit source/proposal selection required");
  return { schema_version: 1, kind: "docs-drift-run", id: uuid(item.id), nonce: uuid(item.nonce), directory: text(item.directory),
    device: text(item.device), inode: text(item.inode), source_repo: text(item.source_repo), source_commit: item.source_commit,
    settings_sha256: hash(item.settings_sha256), read_set_sha256: hash(item.read_set_sha256), entry: text(item.entry),
    mode: item.mode, proposals: item.proposals.map(id => Number(id)), bun_version: text(item.bun_version) };
}
function stageRecord(value: unknown, run: Manifest, revision: number, previous: string): Stage {
  canonicalJSON(value);
  const item = exactRecord(value, ["schema_version", "kind", "run_id", "revision", "previous_sha256", "command", "state", "artifacts"], "docs-drift run invalid stage");
  if (item.schema_version !== 1 || item.kind !== "docs-drift-run-stage" || item.run_id !== run.id
    || item.revision !== revision || item.previous_sha256 !== previous) fail("stage sequence changed");
  const command = RUN_COMMANDS.find(command => command === item.command);
  const state = ["complete", "pending", "setup-required"].find(state => state === item.state);
  if (!command || state !== "complete" && state !== "pending" && state !== "setup-required"
    || item.artifacts === null || typeof item.artifacts !== "object" || Array.isArray(item.artifacts)) fail("stage fields required");
  const artifacts = Object.fromEntries(Object.entries(item.artifacts).map(([name, value]) => {
    if (!/^[a-z][a-z0-9_]*$/u.test(name)) fail("invalid artifact name");
    const reference = exactRecord(value, ["path", "sha256"], "docs-drift run invalid artifact reference");
    return [name, { path: protocolPath(reference.path), sha256: hash(reference.sha256) }];
  }));
  return { schema_version: 1, kind: "docs-drift-run-stage", run_id: run.id, revision, previous_sha256: previous, command, state, artifacts };
}
function directoryIdentity(directory: string) {
  const stat = lstatSync(directory, { bigint: true });
  return { device: stat.dev.toString(), inode: stat.ino.toString() };
}
function creationPath(path: string): string {
  const requested = resolve(path);
  let parent = requested;
  while (!existsSync(parent)) parent = dirname(parent);
  return join(realpathSync(parent), relative(parent, requested));
}

/** Validate the recorded bytes. A copy remains available for observation without executing ownership. */
export function readRunDirectory(input: RunOptions): RunDirectory {
  const options = { repo: realpathSync(input.repo), directory: realpathSync(input.directory), origins: input.origins };
  const scope = artifactDirectoryScope(options.directory, options.repo);
  const bytes = readArtifact(join(scope.directory, "run.json")), manifest = manifestRecord(record(bytes));
  if (manifest.source_repo !== options.repo) fail("source repository changed");
  const snapshot = captureSnapshot(options.repo, manifest.source_commit);
  if (snapshot.settings_sha256 !== manifest.settings_sha256 || snapshot.read_set_sha256 !== manifest.read_set_sha256
    || snapshot.settings.schema_version !== 2 || !Object.hasOwn(snapshot.settings.execution.entries, manifest.entry)) fail("source/configuration binding changed");
  let origin: RunDirectory["origin"] = "observation-only";
  const identity = directoryIdentity(scope.directory);
  if (scope.directory === manifest.directory && identity.device === manifest.device && identity.inode === manifest.inode) {
    try {
      artifactDirectoryScope(options.origins, options.repo);
      scope.assertExternal(options.origins);
      if (options.origins === scope.directory || options.origins.startsWith(scope.directory + "/")
        || scope.directory.startsWith(options.origins + "/")) fail("independent host origin directory required");
      const original = readArtifact(join(options.origins, manifest.id + ".json"));
      if (original.equals(bytes)) origin = "original";
    } catch { /* Missing or unavailable host-local ownership permits observation only. */ }
  }
  const stageDirectory = join(scope.directory, "stages"), files = numberedRecordFiles(stageDirectory);
  let digest = sha256(bytes);
  const stages = files.map((file, index) => {
    if (file !== String(index + 1).padStart(10, "0") + ".json") fail("stage sequence changed");
    const bytes = readArtifact(join(stageDirectory, file)), stage = stageRecord(record(bytes), manifest, index + 1, digest);
    for (const reference of Object.values(stage.artifacts)) readBoundArtifact({ source_repo: options.repo, artifact_root: scope.directory, reference });
    digest = sha256(bytes);
    return stage;
  });
  if (canonicalDigest(files) !== canonicalDigest(numberedRecordFiles(stageDirectory))) fail("stage sequence changed during read");
  const run = freezeJSON({ authority: "none" as const, origin, directory: scope.directory, manifest, stages, digest });
  contexts.set(run, options);
  return run;
}

/** Create one external run. Its host-local origin record is committed before its public manifest. */
export function createRunDirectory(input: RunOptions & { source: string; entry: string; mode?: Manifest["mode"]; proposals?: number[] }): RunDirectory {
  const snapshot = captureSnapshot(input.repo, input.source);
  if (snapshot.settings.schema_version !== 2 || !Object.hasOwn(snapshot.settings.execution.entries, input.entry)) fail("ordinary settings and configured profile required");
  const directory = creationPath(input.directory), origins = creationPath(input.origins);
  const external = externalResourceScope(snapshot.repo);
  external.assertExternal(directory);
  external.assertExternal(origins);
  if (origins === directory || origins.startsWith(directory + "/") || directory.startsWith(origins + "/")) fail("independent host origin directory required");
  if (existsSync(directory)) fail("directory already exists; resume it or select a fresh directory");
  mkdirSync(directory, { mode: 0o700, recursive: true });
  const scope = artifactDirectoryScope(directory, snapshot.repo);
  mkdirSync(origins, { mode: 0o700, recursive: true });
  artifactDirectoryScope(origins, snapshot.repo);
  const manifest = manifestRecord({ schema_version: 1, kind: "docs-drift-run", id: randomUUID(), nonce: randomUUID(), directory: scope.directory,
    ...directoryIdentity(scope.directory), source_repo: snapshot.repo, source_commit: snapshot.source_commit,
    settings_sha256: snapshot.settings_sha256, read_set_sha256: snapshot.read_set_sha256, entry: input.entry,
    mode: input.mode ?? "audit", proposals: input.proposals ?? [], bun_version: Bun.version });
  mkdirSync(join(directory, "stages"), { mode: 0o700 });
  publishArtifact(join(origins, manifest.id + ".json"), canonicalJSON(manifest));
  publishArtifact(join(directory, "run.json"), canonicalJSON(manifest));
  syncDirectory(dirname(directory));
  return readRunDirectory({ repo: snapshot.repo, directory, origins });
}

/** Append by revision CAS. Existing role/effect journals retain their own dispatch and approval gates. */
export function appendRunStage(run: RunDirectory, input: Pick<Stage, "command" | "state" | "artifacts">): Stage {
  const options = contexts.get(run);
  if (!options) fail("original opened run required");
  const current = readRunDirectory(options);
  if (current.origin !== "original") fail("original host ownership required");
  if (current.digest !== run.digest) fail("stage changed; reopen the run before continuing");
  const stage = stageRecord({ schema_version: 1, kind: "docs-drift-run-stage", run_id: run.manifest.id,
    revision: run.stages.length + 1, previous_sha256: run.digest, ...input }, run.manifest, run.stages.length + 1, run.digest);
  for (const reference of Object.values(stage.artifacts)) readBoundArtifact({ source_repo: options.repo, artifact_root: run.directory, reference });
  publishArtifact(join(run.directory, "stages", String(stage.revision).padStart(10, "0") + ".json"), canonicalJSON(stage));
  return freezeJSON(stage);
}
