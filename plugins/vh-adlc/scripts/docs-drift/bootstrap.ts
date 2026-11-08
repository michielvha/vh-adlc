import { randomUUID } from "node:crypto";
import { executeOwnedProcess, type OwnedProcess } from "./owned-process";
import { parseClientBinding } from "./settings";
import { publishArtifact, syncDirectory } from "./journal";
import { chmodSync, closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readGit } from "./git";
import { canonicalJSON, compareUTF8, decodeUTF8, freezeJSON, protocolPath, sha256 } from "./protocol";

type PayloadFile = { path: string; mode: "100644" | "100755"; sha256: string; size: number };
export type ComponentIdentity = {
  schema_version: 1; source_commit: string; plugin_version: string; component_sha256: string; files: PayloadFile[];
};
function fail(reason: string): never { throw Error("docs-drift runtime setup required " + reason); }
function componentDigest(files: PayloadFile[]): string {
  return sha256(canonicalJSON(files.map(file => [file.path, file.mode, file.sha256])));
}
function pluginVersion(bytes: Uint8Array): string {
  const value: unknown = JSON.parse(decodeUTF8(bytes));
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("plugin metadata");
  const metadata = value as Record<string, unknown>;
  if (metadata.name !== "vh-adlc" || typeof metadata.version !== "string"
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(metadata.version)) fail("plugin name/version");
  return metadata.version;
}

/** The source release and repository are verified by setup. This computes their exact raw Git payload. */
export function computeComponentIdentity(repo: string, sourceCommit: string): ComponentIdentity {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(sourceCommit)
    || readGit(repo, "rev-parse", "--verify", "--end-of-options", sourceCommit + "^{commit}").toString().trim() !== sourceCommit) fail("immutable source required");
  const prefix = "plugins/vh-adlc/";
  const inventory = decodeUTF8(readGit(repo, "--literal-pathspecs", "ls-tree", "-r", "--full-tree", "-z", sourceCommit, "--", "plugins/vh-adlc"));
  const entries = inventory.split("\0");
  if (entries.pop() !== "" || entries.length === 0) fail("complete component inventory required");
  let version: string | undefined;
  const files = entries.map(entry => {
    const tab = entry.indexOf("\t");
    const fields = /^(100644|100755) blob ([a-f0-9]{40}(?:[a-f0-9]{24})?)$/u.exec(entry.slice(0, tab));
    const fullPath = entry.slice(tab + 1);
    if (tab < 0 || !fields || !fullPath.startsWith(prefix)) fail("unsupported component entry");
    const path = protocolPath(fullPath.slice(prefix.length));
    const bytes = readGit(repo, "cat-file", "blob", fields[2]);
    if (path === ".claude-plugin/plugin.json") version = pluginVersion(bytes);
    return { path, mode: fields[1] as PayloadFile["mode"], sha256: sha256(bytes), size: bytes.length };
  }).sort((left, right) => compareUTF8(left.path, right.path));
  if (version === undefined) fail("plugin metadata missing");
  return freezeJSON({ schema_version: 1, source_commit: sourceCommit, plugin_version: version,
    component_sha256: componentDigest(files), files });
}

function inspectRetainedFiles(directory: string, expected: { files: PayloadFile[]; component_sha256: string },
  inspectBlob?: (path: string, bytes: Buffer) => void) {
  canonicalJSON(expected);
  if (!Array.isArray(expected.files) || expected.files.length === 0
    || componentDigest(expected.files) !== expected.component_sha256) fail("expected component identity");
  const root = realpathSync(directory), rootStat = lstatSync(directory), owner = process.getuid?.();
  if (owner === undefined || root !== directory || rootStat.isSymbolicLink() || !rootStat.isDirectory()
    || rootStat.uid !== owner || (rootStat.mode & 0o077) !== 0) fail("private owned runtime root required");
  const selected = new Map(expected.files.map(file => [file.path, file]));
  if (selected.size !== expected.files.length) fail("duplicate component identity");
  const files: PayloadFile[] = [];
  function walk(parent: string): void {
    for (const name of readdirSync(parent)) {
      const path = join(parent, name), stat = lstatSync(path);
      if (stat.uid !== owner || stat.isSymbolicLink()) fail("foreign or linked runtime input");
      if (stat.isDirectory()) { walk(path); continue; }
      const relative = protocolPath(path.slice(root.length + 1)), required = selected.get(relative);
      if (!stat.isFile() || stat.nlink !== 1 || !required || !Number.isSafeInteger(required.size)
        || required.size < 0 || stat.size !== required.size) fail("unexpected or changed runtime input");
      const mode = (stat.mode & 0o100) === 0 ? "100644" : "100755";
      if (mode !== required.mode) fail("runtime executable mode changed");
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const opened = fstatSync(fd);
        if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== required.size
          || opened.uid !== owner || opened.nlink !== 1 || opened.mode !== stat.mode) fail("runtime input changed during inspection");
        const bytes = readFileSync(fd), digest = sha256(bytes);
        if (bytes.length !== required.size || digest !== required.sha256) fail("runtime input bytes changed");
        inspectBlob?.(relative, bytes);
        files.push({ path: relative, mode, sha256: digest, size: bytes.length });
      } finally { closeSync(fd); }
    }
  }
  walk(root);
  files.sort((left, right) => compareUTF8(left.path, right.path));
  if (files.length !== expected.files.length
    || !canonicalJSON(files).equals(canonicalJSON(expected.files)) || componentDigest(files) !== expected.component_sha256) fail("retained component identity changed");
  return freezeJSON({ directory: root, component_sha256: componentDigest(files), files });
}

/** Recheck the exported shipped directory. Setup metadata and native session files belong outside it. */
export function inspectRetainedPayload(options: { directory: string; expected: ComponentIdentity }) {
  if (options.expected.schema_version !== 1) fail("expected component identity");
  let version: string | undefined;
  const inspected = inspectRetainedFiles(options.directory, options.expected, (path, bytes) => {
    if (path === ".claude-plugin/plugin.json") version = pluginVersion(bytes);
  });
  if (version !== options.expected.plugin_version) fail("retained component identity changed");
  return freezeJSON({ ...inspected, plugin_version: version });
}

type ClientBinding = ReturnType<typeof parseClientBinding>;
type ClientFormat = "tar" | "executable";
type ClientRecord = {
  schema_version: 1; kind: "docs-drift-retained-client"; client_id: string; client: ClientBinding;
  build: string; format: ClientFormat; executable: string; files: PayloadFile[];
};
const clientArchiveLimit = 512 * 1024 * 1024;
const clientPayloadLimit = 1024 * 1024 * 1024;

function privateRuntimeDirectory(path: string, create = false): void {
  if (create && !existsSync(path)) {
    privateRuntimeDirectory(dirname(path), true);
    try { mkdirSync(path, { mode: 0o700 }); syncDirectory(dirname(path)); }
    catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error; }
  }
  const item = lstatSync(path), owner = process.getuid?.();
  if (owner === undefined || !item.isDirectory() || item.isSymbolicLink() || realpathSync(path) !== path
    || item.uid !== owner || (item.mode & 0o077) !== 0) fail("private owned runtime directory required");
}
function readRuntimeFile(path: string, limit = 16 * 1024 * 1024): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const item = fstatSync(fd);
    if (!item.isFile() || item.nlink !== 1 || item.uid !== process.getuid?.() || (item.mode & 0o077) !== 0
      || item.size > limit) fail("private retained runtime file required");
    return readFileSync(fd);
  } finally { closeSync(fd); }
}
function clientPaths(cache: string, id: string, client: ClientBinding) {
  privateRuntimeDirectory(cache);
  if (protocolPath(id).includes("/")) fail("single client ID required");
  if (client.platform !== process.platform + "-" + process.arch) fail("client platform differs from host");
  return { index: join(cache, "clients", id, client.distribution_sha256 + ".json"),
    profile: join(cache, "profiles", id, client.distribution_sha256) };
}
function runtimeObject(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== [...fields].sort().join(",")) fail("retained runtime evidence fields");
  return value as Record<string, unknown>;
}
function runtimeJSON(bytes: Uint8Array, fields: string[]): Record<string, unknown> {
  const value: unknown = JSON.parse(decodeUTF8(bytes));
  if (!canonicalJSON(value).equals(Buffer.from(bytes))) fail("canonical retained runtime evidence required");
  return runtimeObject(value, fields);
}
function clientRecord(bytes: Uint8Array, id: string, client: ClientBinding): ClientRecord {
  const value = runtimeJSON(bytes, ["schema_version", "kind", "client_id", "client", "build", "format", "executable", "files"]);
  if (value.schema_version !== 1 || value.kind !== "docs-drift-retained-client" || value.client_id !== id
    || !canonicalJSON(parseClientBinding(value.client)).equals(canonicalJSON(client))
    || typeof value.build !== "string" || !/^builds\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value.build)
    || value.format !== "tar" && value.format !== "executable"
    || !Array.isArray(value.files) || !value.files.length || value.files.length > 50000) fail("retained client record");
  const files = value.files.map((entry: unknown): PayloadFile => {
    const row = runtimeObject(entry, ["path", "mode", "sha256", "size"]);
    if (row.mode !== "100644" && row.mode !== "100755" || typeof row.size !== "number" || !Number.isSafeInteger(row.size)
      || row.size < 0 || row.size > clientArchiveLimit || typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(row.sha256)) fail("retained client file identity");
    return { path: protocolPath(row.path), mode: row.mode, size: row.size, sha256: row.sha256 };
  });
  return { schema_version: 1, kind: "docs-drift-retained-client", client_id: id, client, build: value.build,
    format: value.format, executable: protocolPath(value.executable), files };
}

async function clientFiles(distribution: Uint8Array, client: ClientBinding, format: ClientFormat, executable: string) {
  if (distribution.byteLength > clientArchiveLimit || sha256(distribution) !== client.distribution_sha256) fail("client distribution checksum");
  if (format !== "tar" && format !== "executable") fail("client distribution format");
  const archiveFiles = format === "tar" ? await new Bun.Archive(distribution).files()
    : new Map([[executable, new File([Buffer.from(distribution)], executable)]]);
  if (!archiveFiles.size || archiveFiles.size > 50000) fail("client distribution executable or inventory");
  const files = new Map<string, File>();
  let total = 0;
  for (const [path, file] of archiveFiles) {
    const selected = protocolPath(path.replace(/^(?:\.\/)+/u, ""));
    if (files.has(selected)) fail("client distribution path collision");
    if (file.size > clientArchiveLimit || (total += file.size) > clientPayloadLimit) fail("client distribution size bound");
    files.set(selected, file);
  }
  if (!files.has(executable)) fail("client distribution executable or inventory");
  return files;
}
function nativeClientVersion(stdout: Uint8Array, client: ClientBinding): string {
  const lines = decodeUTF8(stdout).trim().split(/\r?\n/u);
  const pattern = client.provider === "copilot" ? /^GitHub Copilot CLI (.+?)\.?$/u
    : client.provider === "claude" ? /^(.+) \(Claude Code\)$/u : /^codex-cli (.+)$/u;
  const version = pattern.exec(lines[0])?.[1];
  const extras = client.provider === "copilot" && lines.length === 2 && lines[1] === "Run 'copilot update' to check for updates.";
  if ((lines.length !== 1 && !extras) || version !== client.version) fail("native client version differs from approved build");
  return version;
}

/** Read the checksum-bound cache entry selected by the protected client binding. */
export async function inspectRetainedClient(options: { cache_directory: string; client_id: string; client: ClientBinding }) {
  const client = parseClientBinding(options.client), paths = clientPaths(options.cache_directory, options.client_id, client);
  privateRuntimeDirectory(dirname(paths.index)); privateRuntimeDirectory(paths.profile);
  const record = clientRecord(readRuntimeFile(paths.index), options.client_id, client), root = join(options.cache_directory, record.build);
  privateRuntimeDirectory(root);
  const distribution = readRuntimeFile(join(root, "distribution"), clientArchiveLimit);
  const files = await clientFiles(distribution, client, record.format, record.executable);
  const archiveRows = await Promise.all([...files].map(async ([path, file]) => ({ path, size: file.size, sha256: sha256(new Uint8Array(await file.arrayBuffer())) })));
  const retainedRows = record.files.map(({ path, size, sha256 }) => ({ path, size, sha256 }));
  const byPath = (left: { path: string }, right: { path: string }) => compareUTF8(left.path, right.path);
  if (!canonicalJSON(archiveRows.sort(byPath)).equals(canonicalJSON(retainedRows.sort(byPath)))) fail("client payload differs from verified distribution");
  const directory = join(root, "package"), executable = join(directory, record.executable);
  const inspected = inspectRetainedFiles(directory, { files: record.files, component_sha256: componentDigest(record.files) });
  if (!(lstatSync(executable).mode & 0o100)) fail("client executable mode");
  const nativeBytes = readRuntimeFile(join(root, "version-process.json"));
  const native = runtimeJSON(nativeBytes, ["schema_version", "kind", "client_id", "distribution_sha256", "executable_sha256",
    "capture_verified", "stdout_sha256", "stderr_sha256", "process"]);
  const completion = runtimeObject(native.process, ["pid", "exit_code", "timed_out", "cancelled", "output_limit", "reaped"]);
  const stdout = readRuntimeFile(join(root, "version-stdout"), 65536), stderr = readRuntimeFile(join(root, "version-stderr"), 65536);
  const owner = runtimeJSON(readRuntimeFile(join(root, "version-owner.json")), ["pid", "argv_sha256"]);
  const argv = [executable, ...(client.provider === "copilot" ? ["--no-auto-update"] : []), "--version"];
  if (native.schema_version !== 1 || native.kind !== "docs-drift-native-client-version" || native.capture_verified !== true
    || native.client_id !== options.client_id || native.distribution_sha256 !== client.distribution_sha256
    || native.executable_sha256 !== record.files.find(row => row.path === record.executable)?.sha256
    || native.stdout_sha256 !== sha256(stdout) || native.stderr_sha256 !== sha256(stderr)
    || typeof completion.pid !== "number" || !Number.isSafeInteger(completion.pid) || completion.pid < 1
    || owner.pid !== completion.pid || owner.argv_sha256 !== sha256(canonicalJSON(argv))
    || completion.exit_code !== 0 || completion.reaped !== true || completion.timed_out !== false
    || completion.cancelled !== null || completion.output_limit !== false) fail("native client version evidence");
  const version = nativeClientVersion(stdout, client);
  return freezeJSON({ client_id: options.client_id, client, directory, executable, profile_directory: paths.profile,
    version, format: record.format, executable_relative: record.executable, payload_sha256: inspected.component_sha256,
    version_evidence_sha256: sha256(nativeBytes) });
}

/** Authorized setup supplies a pinned distribution. Only its files enter the retained package. */
export async function retainClientDistribution(options: {
  cache_directory: string; client_id: string; client: ClientBinding; distribution: Uint8Array; format: ClientFormat; executable: string;
}) {
  const client = parseClientBinding(options.client), paths = clientPaths(options.cache_directory, options.client_id, client);
  const executable = protocolPath(options.executable), files = await clientFiles(options.distribution, client, options.format, executable);
  privateRuntimeDirectory(dirname(paths.index), true); privateRuntimeDirectory(paths.profile, true);
  async function selectedClient() {
    const selected = await inspectRetainedClient(options);
    if (selected.executable_relative !== executable || selected.format !== options.format) fail("retained setup request differs");
    return selected;
  }
  if (existsSync(paths.index)) return selectedClient();
  const build = "builds/" + randomUUID(), root = join(options.cache_directory, build), directory = join(root, "package");
  privateRuntimeDirectory(join(options.cache_directory, "builds"), true); privateRuntimeDirectory(root, true); privateRuntimeDirectory(directory, true);
  publishArtifact(join(root, "distribution"), Buffer.from(options.distribution));
  const retained: PayloadFile[] = [];
  for (const [path, file] of files) {
    const target = join(directory, path), bytes = new Uint8Array(await file.arrayBuffer());
    privateRuntimeDirectory(dirname(target), true);
    // Private package files retain owner execution so bundled native helpers can run.
    const fd = openSync(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o700);
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    syncDirectory(dirname(target));
    const item = lstatSync(target);
    if (!item.isFile() || item.isSymbolicLink() || item.nlink !== 1 || item.uid !== process.getuid?.()) fail("regular retained client file required");
    chmodSync(target, (item.mode & 0o777 & ~0o022) | (path === executable ? 0o500 : 0o400));
    retained.push({ path, mode: (lstatSync(target).mode & 0o100) ? "100755" : "100644", size: file.size,
      sha256: sha256(bytes) });
  }
  retained.sort((left, right) => compareUTF8(left.path, right.path));
  const expected = { files: retained, component_sha256: componentDigest(retained) };
  inspectRetainedFiles(directory, expected);
  const probeProfile = join(root, "probe-profile"); privateRuntimeDirectory(probeProfile, true);
  for (const name of ["cache", "config", "state", "temporary"]) privateRuntimeDirectory(join(probeProfile, name), true);
  const args = [join(directory, executable), ...(client.provider === "copilot" ? ["--no-auto-update"] : []), "--version"];
  const environment = { PATH: "/usr/bin:/bin", HOME: probeProfile, LANG: "C", LC_ALL: "C",
    XDG_CACHE_HOME: join(probeProfile, "cache"), XDG_CONFIG_HOME: join(probeProfile, "config"), XDG_STATE_HOME: join(probeProfile, "state"),
    TMPDIR: join(probeProfile, "temporary"), COPILOT_HOME: probeProfile, COPILOT_CACHE_HOME: join(probeProfile, "cache"),
    COPILOT_AUTO_UPDATE: "false", CLAUDE_CONFIG_DIR: probeProfile,
    DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", CODEX_HOME: probeProfile };
  let startedPID: number | null = null, versionProcess: OwnedProcess;
  try {
    versionProcess = await executeOwnedProcess({ argv: args, cwd: probeProfile, env: environment, watched_outputs: [],
      stdout: join(root, "version-stdout"), stderr: join(root, "version-stderr"), capture: "memory", timeout_ms: 10000, max_output_bytes: 65536,
      started: pid => {
        startedPID = pid;
        publishArtifact(join(root, "version-owner.json"), canonicalJSON({ pid, argv_sha256: sha256(canonicalJSON(args)) }));
      } });
  } catch (error) {
    const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "native-client-start-failed";
    try {
      publishArtifact(join(root, "version-failure.json"), canonicalJSON({ schema_version: 1, kind: "docs-drift-native-client-start-failure",
        client_id: options.client_id, distribution_sha256: client.distribution_sha256, argv_sha256: sha256(canonicalJSON(args)),
        capture_verified: false, pid: startedPID, error_code: code }));
    } catch (captureError) { throw new AggregateError([error, captureError], "Client startup failed and its failure evidence could not be retained"); }
    throw error;
  }
  const { captured, ...completion } = versionProcess;
  const stdout = captured?.stdout ?? new Uint8Array(), stderr = captured?.stderr ?? new Uint8Array();
  publishArtifact(join(root, "version-stdout"), stdout); publishArtifact(join(root, "version-stderr"), stderr);
  publishArtifact(join(root, "version-process.json"), canonicalJSON({ schema_version: 1, kind: "docs-drift-native-client-version",
    client_id: options.client_id, distribution_sha256: client.distribution_sha256,
    executable_sha256: retained.find(row => row.path === executable)?.sha256, capture_verified: captured !== undefined,
    stdout_sha256: sha256(stdout), stderr_sha256: sha256(stderr), process: completion }));
  if (versionProcess.exit_code !== 0 || !versionProcess.reaped || versionProcess.timed_out || versionProcess.cancelled !== null || versionProcess.output_limit || !captured) fail("owned client version process incomplete");
  nativeClientVersion(stdout, client);
  inspectRetainedFiles(directory, expected);
  const record: ClientRecord = { schema_version: 1, kind: "docs-drift-retained-client", client_id: options.client_id, client,
    build, format: options.format, executable, files: retained };
  const recordBytes = canonicalJSON(record);
  if (recordBytes.length > 16 * 1024 * 1024) fail("client record size bound");
  try { publishArtifact(paths.index, recordBytes); }
  catch (error) { if (!(error instanceof Error) || error.message !== "docs-drift journal revision conflict") throw error; }
  return selectedClient();
}
