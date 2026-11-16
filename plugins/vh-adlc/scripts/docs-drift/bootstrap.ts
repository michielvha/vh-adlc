import { verifyProductionPreflight } from "./preflight";
import { sameAccount } from "./identity";
import { readVerifiedPlan, type CurrentSealedPlan, type PolicyBinding, type SealedPlan } from "./journal";
import { randomUUID } from "node:crypto";
import { clientArchivePath, inspectClientArchive } from "./client-archive";
import { executeOwnedProcess, ownedClientCompleted, recordedProcessCompleted, type OwnedProcess } from "./owned-process";
import { loadCommittedSettings, parseClientBinding, parseInstalledClient } from "./settings";
import { collectAdoptionBindings, collectTrialBindings, parseComponentPin, verifyRuntimeAdoption } from "./adoption";
import type { PublicationIdentity } from "./transport";
import { publishArtifact, syncDirectory } from "./journal";
import { chmodSync, closeSync, constants, existsSync, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { mapGitBlobs, readGit } from "./git";
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
  const inventory = decodeUTF8(readGit(repo, "--literal-pathspecs", "ls-tree", "-r", "--full-tree", "--long", "-z", sourceCommit, "--", "plugins/vh-adlc"));
  const entries = inventory.split("\0");
  if (entries.pop() !== "" || entries.length === 0) fail("complete component inventory required");
  const selected = entries.map(entry => {
    const tab = entry.indexOf("\t");
    const fields = /^(100644|100755) blob ([a-f0-9]{40}(?:[a-f0-9]{24})?) +([0-9]+)$/u.exec(entry.slice(0, tab));
    const fullPath = entry.slice(tab + 1);
    if (tab < 0 || !fields || !fullPath.startsWith(prefix) || !Number.isSafeInteger(Number(fields[3]))) fail("unsupported component entry");
    return { path: protocolPath(fullPath.slice(prefix.length)), mode: fields[1] as PayloadFile["mode"], oid: fields[2], size: Number(fields[3]) };
  });
  let version: string | undefined;
  const files = mapGitBlobs(repo, selected.map(({ oid, size }) => ({ oid, size })), (bytes, index) => {
    const { path, mode } = selected[index];
    if (path === ".claude-plugin/plugin.json") version = pluginVersion(bytes);
    return { path, mode, sha256: sha256(bytes), size: bytes.length };
  }).sort((left, right) => compareUTF8(left.path, right.path));
  if (version === undefined) fail("plugin metadata missing");
  return freezeJSON({ schema_version: 1, source_commit: sourceCommit, plugin_version: version,
    component_sha256: componentDigest(files), files });
}

function inspectRetainedFiles(directory: string, expected: { files?: PayloadFile[]; component_sha256: string },
  inspectBlob?: (path: string, bytes: Buffer) => void, policy: "retained" | "installed" = "retained") {
  canonicalJSON(expected);
  if (!/^[a-f0-9]{64}$/u.test(expected.component_sha256)
    || (expected.files === undefined ? policy !== "installed" : !Array.isArray(expected.files) || expected.files.length === 0
      || componentDigest(expected.files) !== expected.component_sha256)) fail("expected component identity");
  const root = realpathSync(directory), owner = process.getuid?.();
  const rootStat = lstatSync(policy === "installed" ? root : directory);
  if (!rootStat.isDirectory()) fail("runtime directory required");
  if (policy === "retained" && (owner === undefined || root !== directory || rootStat.isSymbolicLink()
    || rootStat.uid !== owner || (rootStat.mode & 0o077) !== 0)) fail("private owned runtime root required");
  const selected = expected.files ? new Map(expected.files.map(file => [file.path, file])) : null;
  if (selected && selected.size !== expected.files?.length) fail("duplicate component identity");
  const files: PayloadFile[] = [];
  function walk(parent: string): void {
    for (const name of readdirSync(parent)) {
      const path = join(parent, name), stat = lstatSync(path);
      if (stat.isSymbolicLink() || policy === "retained" && stat.uid !== owner) fail("foreign or linked runtime input");
      if (stat.isDirectory()) { walk(path); continue; }
      const relative = protocolPath(path.slice(root.length + 1)), required = selected?.get(relative);
      if (!stat.isFile() || policy === "retained" && stat.nlink !== 1 || selected && !required
        || !Number.isSafeInteger(stat.size) || stat.size < 0
        || required && (!Number.isSafeInteger(required.size) || required.size < 0 || stat.size !== required.size)) fail("unexpected or changed runtime input");
      const mode = (stat.mode & 0o100) === 0 ? "100644" : "100755";
      if (required && mode !== required.mode) fail("runtime executable mode changed");
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const opened = fstatSync(fd);
        if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size
          || policy === "retained" && (opened.uid !== owner || opened.nlink !== 1)
          || opened.mode !== stat.mode) fail("runtime input changed during inspection");
        const bytes = readFileSync(fd), digest = sha256(bytes);
        if (bytes.length !== stat.size || required && digest !== required.sha256) fail("runtime input bytes changed");
        inspectBlob?.(relative, bytes);
        files.push({ path: relative, mode, sha256: digest, size: bytes.length });
      } finally { closeSync(fd); }
    }
  }
  walk(root);
  files.sort((left, right) => compareUTF8(left.path, right.path));
  if (expected.files && (files.length !== expected.files.length || !canonicalJSON(files).equals(canonicalJSON(expected.files)))
    || componentDigest(files) !== expected.component_sha256) fail("retained component identity changed");
  return freezeJSON({ directory: root, component_sha256: componentDigest(files), files });
}

export type InstalledComponentBinding = Pick<ComponentIdentity, "plugin_version" | "source_commit" | "component_sha256">;
function inspectComponentPayload(options: { directory: string; expected: InstalledComponentBinding & Partial<Pick<ComponentIdentity, "files" | "schema_version">> }, policy: "retained" | "installed") {
  if ((options.expected.schema_version !== undefined || policy === "retained") && options.expected.schema_version !== 1
    || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(options.expected.source_commit)) fail("expected component identity");
  let version: string | undefined;
  const inspected = inspectRetainedFiles(options.directory, options.expected, (path, bytes) => {
    if (path === ".claude-plugin/plugin.json") version = pluginVersion(bytes);
  }, policy);
  if (version !== options.expected.plugin_version) fail("retained component identity changed");
  return freezeJSON({ ...inspected, plugin_version: version });
}

/** Recheck the exported shipped directory. Setup metadata and native session files belong outside it. */
export function inspectRetainedPayload(options: { directory: string; expected: ComponentIdentity }) {
  return inspectComponentPayload(options, "retained");
}

/** Validate ordinary installed bytes and inventory without changing installer permissions or copying files. */
export function inspectInstalledPayload(options: { directory: string; expected: InstalledComponentBinding & Partial<Pick<ComponentIdentity, "files" | "schema_version">> }) {
  return inspectComponentPayload(options, "installed");
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
    try { mkdirSync(path, { mode: 0o700 }); chmodSync(path, 0o700); syncDirectory(dirname(path)); }
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
export type ClientProfileScope = {
  hostname: string; repository_id: number; actor_id: number; entry: "hosted" | "copilot" | "claude";
  trial?: { definition_sha256: string; fixture_id: string };
};

function inspectCacheLocation(cache: string, repo?: string): void {
  privateRuntimeDirectory(cache);
  const inside = (path: string) => cache === path || cache.startsWith(path + "/");
  if (repo) {
    const common = realpathSync(readGit(repo, "rev-parse", "--path-format=absolute", "--git-common-dir").toString().trim());
    const listed = decodeUTF8(readGit(repo, "worktree", "list", "--porcelain", "-z")).split("\0")
      .filter(field => field.startsWith("worktree ")).map(field => field.slice("worktree ".length));
    if (!listed.length || listed.some(path => !isAbsolute(path))) fail("complete Git worktree inventory required");
    const roots = listed.map(path => existsSync(path) ? realpathSync(path) : resolve(path));
    if (inside(common) || roots.some(inside)) fail("cache must be outside source and consumer worktrees");
  }
  for (const path of [process.env.COPILOT_HOME ?? join(homedir(), ".copilot"),
    process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), process.env.CODEX_HOME ?? join(homedir(), ".codex")]) {
    const native = resolve(path);
    if (inside(native) || existsSync(native) && inside(realpathSync(native))) fail("cache must be outside native provider profiles");
  }
}

function clientPaths(cache: string, id: string, client: ClientBinding, scope: ClientProfileScope, repo: string) {
  inspectCacheLocation(cache, repo);
  const selected = runtimeObject(scope, ["hostname", "repository_id", "actor_id", "entry", ...(Object.hasOwn(scope, "trial") ? ["trial"] : [])]);
  if (typeof selected.hostname !== "string" || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(selected.hostname)
    || typeof selected.repository_id !== "number" || !Number.isSafeInteger(selected.repository_id) || selected.repository_id < 1
    || typeof selected.actor_id !== "number" || !Number.isSafeInteger(selected.actor_id) || selected.actor_id < 1
    || typeof selected.entry !== "string" || !["hosted", "copilot", "claude"].includes(selected.entry)) fail("native consumer profile scope required");
  if (protocolPath(id).includes("/")) fail("single client ID required");
  if (client.platform !== process.platform + "-" + process.arch) fail("client platform differs from host");
  let profileRoot = join(cache, "profiles");
  if (Object.hasOwn(scope, "trial")) {
    const trial = runtimeObject(selected.trial, ["definition_sha256", "fixture_id"]);
    if (typeof trial.definition_sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(trial.definition_sha256)
      || typeof trial.fixture_id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(trial.fixture_id)) fail("trial profile scope required");
    profileRoot = join(cache, "trial-profiles", sha256(canonicalJSON(trial)));
  }
  const binding = sha256(canonicalJSON(client));
  return { index: join(cache, "clients", id, binding + ".json"),
    profile: join(profileRoot, scope.hostname, String(scope.repository_id), String(scope.actor_id), scope.entry, id, binding) };
}

function runtimeObject(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("retained runtime evidence fields");
  const actual = Object.keys(value).sort(), expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) fail("retained runtime evidence fields");
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
  const inventory = format === "tar" ? inspectClientArchive(distribution, { file: clientArchiveLimit, total: clientPayloadLimit, entries: 50000 }) : null;
  const archiveFiles = format === "tar" ? await new Bun.Archive(distribution).files()
    : new Map([[executable, new File([Buffer.from(distribution)], executable)]]);
  if (!archiveFiles.size || archiveFiles.size > 50000) fail("client distribution executable or inventory");
  const files = new Map<string, { file: File; executable: boolean }>();
  let total = 0;
  for (const [path, file] of archiveFiles) {
    const selected = clientArchivePath(path);
    if (files.has(selected)) fail("client distribution path collision");
    if (file.size > clientArchiveLimit || (total += file.size) > clientPayloadLimit) fail("client distribution size bound");
    const original = inventory?.get(selected);
    if (inventory && (!original || original.size !== file.size || original.sha256 !== sha256(new Uint8Array(await file.arrayBuffer())))) fail("client archive regular inventory mismatch");
    files.set(selected, { file, executable: selected === executable || (original?.executable ?? false) });
  }
  if (inventory && inventory.size !== files.size) fail("client archive incomplete inventory");
  if (!files.has(executable)) fail("client distribution executable or inventory");
  return files;
}
function nativeClientVersion(stdout: Uint8Array, client: { provider: ClientBinding["provider"]; version?: string }): string {
  const lines = decodeUTF8(stdout).trim().split(/\r?\n/u);
  const pattern = client.provider === "copilot" ? /^GitHub Copilot CLI (.+?)\.?$/u
    : client.provider === "claude" ? /^(.+) \(Claude Code\)$/u : /^codex-cli (.+)$/u;
  const version = pattern.exec(lines[0])?.[1];
  const extras = client.provider === "copilot" && lines.length === 2 && lines[1] === "Run 'copilot update' to check for updates.";
  if ((lines.length !== 1 && !extras) || !version
    || (client.version === undefined ? !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)
      : version !== client.version)) fail("native client version differs from approved build");
  return version;
}

/** Observe the ordinary command in place. Its version is diagnostic and carries no effect authority. */
export async function inspectInstalledClient(input: {
  client: ReturnType<typeof parseInstalledClient>; cwd: string; path?: string; required_flags?: readonly string[];
}) {
  const options = { ...input, required_flags: input.required_flags ? [...input.required_flags] : [] };
  const client = parseInstalledClient(options.client);
  const command = Bun.which(client.executable, { cwd: options.cwd, PATH: options.path ?? process.env.PATH });
  if (!command) return { complete: false, client, executable: null, version: null, process: null,
    diagnostics: ["Install the configured native client command or correct its executable setting."] };
  const executable = realpathSync(command);
  const probe = (argument: "--version" | "--help") => executeOwnedProcess({
      argv: [executable, ...(client.provider === "copilot" ? ["--no-auto-update"] : []), argument],
      cwd: options.cwd, env: { PATH: options.path ?? process.env.PATH ?? "", LANG: "C.UTF-8", DISABLE_AUTOUPDATER: "1", COPILOT_AUTO_UPDATE: "false" },
      capture: "memory", watched_outputs: [], stdout: "/dev/null", stderr: "/dev/null",
      timeout_ms: 15000, max_output_bytes: 65536, started: () => {},
    });
  const result = await probe("--version");
  const { captured, ...completion } = result;
  let version: string | null = null;
  if (ownedClientCompleted(result) && captured) {
    try { version = nativeClientVersion(captured.stdout, client); }
    catch { /* Unrecognized output remains private in memory. Return only the setup diagnosis. */ }
  }
  const diagnostics = version === null ? ["The configured native client did not complete a recognized version probe."] : [];
  if (version !== null && options.required_flags?.length) {
    const help = await probe("--help");
    const flags = new Set(help.captured ? decodeUTF8(help.captured.stdout).match(/--[a-z][a-z0-9-]*/gu) : []);
    if (!ownedClientCompleted(help) || options.required_flags.some(flag => !flags.has(flag)))
      diagnostics.push("The configured native client lacks the required plugin, isolation or output capabilities.");
  }
  return { complete: diagnostics.length === 0, client, executable, version, process: completion, diagnostics };
}

/** Select immutable project policy and ordinary installed commands. Publication is gated separately. */
export async function selectInstalledRuntime(input: {
  repo: string; source_commit: string; directory: string; entry: string; path?: string;
}) {
  const options = { ...input };
  const loaded = loadCommittedSettings(options.repo, options.source_commit), settings = loaded.settings;
  if (settings.schema_version !== 2) fail("settings version 2 required for ordinary installation");
  if (!settings.component) fail("declare the selected released component");
  if (!Object.hasOwn(settings.execution.entries, options.entry)) fail("configured execution profile required");
  const inspected = inspectInstalledPayload({ directory: options.directory, expected: settings.component });
  const entry = settings.execution.entries[options.entry];
  const clients = new Map<string, Awaited<ReturnType<typeof inspectInstalledClient>>>();
  const diagnostics: string[] = [];
  for (const selected of [entry.worker, entry.reviewer]) {
    if (clients.has(selected.client)) continue;
    const client = settings.clients[selected.client];
    if (client.provider !== "copilot" && client.provider !== "claude") {
      diagnostics.push("The configured native role backend is unsupported.");
      continue;
    }
    const required_flags = client.provider === "copilot"
      ? ["--plugin-dir", "--model", "--session-id", "--output-format", "--available-tools", "--no-custom-instructions", "--disable-builtin-mcps"]
      : ["--plugin-dir", "--model", "--session-id", "--output-format", "--tools", "--setting-sources", "--strict-mcp-config", "--no-session-persistence"];
    const inspected = await inspectInstalledClient({ client, cwd: options.repo, path: options.path, required_flags });
    clients.set(selected.client, inspected);
    diagnostics.push(...inspected.diagnostics);
  }
  function role(selected: typeof entry.worker) {
    const client = clients.get(selected.client);
    if (!client?.complete || !client.executable || !client.version) return null;
    return { ...selected, client: client.client, client_id: selected.client, executable: client.executable, version: client.version };
  }
  const worker = role(entry.worker), reviewer = role(entry.reviewer);
  if (!worker || !reviewer) return { complete: false as const, runtime: null, diagnostics };
  return { complete: true as const, diagnostics, runtime: freezeJSON({ kind: "docs-drift-installed-runtime" as const,
    authority: "none" as const, authentication: "native" as const, source_commit: options.source_commit,
    settings_sha256: loaded.settings_sha256, entry: options.entry, worker, reviewer,
    component: { ...settings.component, directory: inspected.directory },
    loader: { provider: worker.client.provider, argv: ["--plugin-dir", inspected.directory], credential_references: settings.credential_references } }) };
}

export type InstalledRuntime = NonNullable<Awaited<ReturnType<typeof selectInstalledRuntime>>["runtime"]>;

/** Select ordinary native roles only after the committed flat policy matches the observed account. */
export async function selectProductionRuntime(input: {
  repo: string; current_default: string; directory: string; entry: string; identity: PublicationIdentity; path?: string;
}) {
  const options = structuredClone(input), settings = loadCommittedSettings(options.repo, options.current_default).settings;
  if (settings.schema_version !== 2 || !settings.component) fail("ordinary settings and released component required");
  const preflight = verifyProductionPreflight({ ...options, component: settings.component,
    publisher: { entry: options.entry, identity: options.identity } });
  const selected = await selectInstalledRuntime({ ...options, source_commit: options.current_default });
  if (!selected.complete || !selected.runtime) fail(selected.diagnostics.join(". "));
  const entry = preflight.checklist.native_entries[options.entry];
  return freezeJSON({ ...selected.runtime, current_default: options.current_default, policy_sha256: preflight.policy_sha256,
    observed_models: { worker: entry.worker_model, reviewer: entry.reviewer_model } });
}

/** Reopen committed production policy for recovery and read-only historical attribution. */
export function readOriginalProductionPolicy(options: {
  repo: string; plan: CurrentSealedPlan; identity: PublicationIdentity;
}) {
  const plan = structuredClone(options.plan), source = plan.manifest.bindings.source_commit;
  const loaded = loadCommittedSettings(options.repo, source), settings = loaded.settings, entry = plan.manifest.publisher_entry;
  if (loaded.settings_sha256 !== plan.manifest.bindings.settings_sha256 || plan.manifest.repository !== settings.repository
    || options.identity.repository.toLowerCase() !== plan.manifest.repository.toLowerCase()
    || options.identity.repository_id !== plan.manifest.repository_id || !sameAccount(options.identity, plan.manifest))
    fail("original operation settings or native identity changed");
  if (settings.schema_version !== 2 || !entry || !Object.hasOwn(settings.execution.entries, entry)
    || plan.context !== "production" || plan.transport !== "native") fail("original native production policy required");
  const preflight = verifyProductionPreflight({ repo: options.repo, current_default: source, component: plan.component,
    publisher: { entry, identity: options.identity } });
  const selected = settings.execution.entries[entry], models = preflight.checklist.native_entries[entry];
  const policy = { schema_version: 2 as const, policy_sha256: preflight.policy_sha256, component: plan.component,
    context: plan.context, transport: plan.transport, publication_kind: plan.publication_kind, publisher_entry: entry,
    pr_draft: settings.publication.pr_state[plan.publication_kind] === "draft",
    worker: { requested_model: selected.worker.model, adopted_model: models.worker_model, identity_source: selected.worker.identity_source },
    reviewer: { requested_model: selected.reviewer.model, adopted_model: models.reviewer_model, identity_source: selected.reviewer.identity_source } };
  readVerifiedPlan(canonicalJSON(plan), () => policy);
  return freezeJSON({ authority: "none" as const, source_commit: source, settings, policy });
}

/** Original recovery effects additionally require the selected original installed bytes. */
export function readOriginalRuntime(options: {
  repo: string; directory: string; plan: CurrentSealedPlan; identity: PublicationIdentity;
}) {
  const original = readOriginalProductionPolicy(options), plan = options.plan;
  const inspected = inspectInstalledPayload({ directory: options.directory, expected: plan.component });
  return freezeJSON({ kind: "docs-drift-original-runtime" as const, authority: "none" as const, purpose: "metadata-recovery" as const,
    source_commit: original.source_commit, component: { ...plan.component, directory: inspected.directory }, policy: original.policy });
}

/** Recovery selects the recorded component and original policy, independently of a successor config. */
export async function selectOriginalOperationRuntime(options: {
  repo: string; directory: string; plan: SealedPlan; identity: PublicationIdentity; entry: string; cache_directory: string;
}) {
  if (options.plan.schema_version === 2) {
    if (options.entry !== options.plan.manifest.publisher_entry) fail("original operation profile changed");
    return readOriginalRuntime({ ...options, plan: options.plan });
  }
  const entry = options.entry;
  if (entry !== "hosted" && entry !== "copilot" && entry !== "claude") fail("original legacy profile required");
  return selectRecoveryRuntime({ repo: options.repo, source_commit: options.plan.manifest.bindings.source_commit,
    identity: options.identity, entry, cache_directory: options.cache_directory, adoption_sha256: options.plan.adoption_sha256 });
}

/** Keep historical entry callers separate while selecting the ordinary production contract. */
export async function selectOperationRuntime(input: Omit<Parameters<typeof selectApprovedRuntime>[0], "entry"> & { entry: string }) {
  const options = { ...input }, repo = options.policy_repo ?? options.repo;
  if (loadCommittedSettings(repo, options.current_default).settings.schema_version === 2)
    return selectProductionRuntime({ repo, current_default: options.current_default, entry: options.entry,
      identity: options.identity, directory: resolve(import.meta.dir, "../..") });
  const entry = options.entry;
  if (entry !== "hosted" && entry !== "copilot" && entry !== "claude") fail("legacy execution entry required");
  return selectApprovedRuntime({ ...options, entry });
}

/** Execution compatibility belongs to the original plan format. */
export function requireExecutionBun(schemaVersion: SealedPlan["schema_version"], version = Bun.version): void {
  if (schemaVersion === 1 && version !== "1.4.4") throw Error("Original retained execution Bun version required");
}

export function runtimePolicyBinding(runtime: Awaited<ReturnType<typeof selectOperationRuntime>>): PolicyBinding {
  if (runtime.kind === "docs-drift-installed-runtime") {
    const { plugin_version, source_commit, component_sha256 } = runtime.component;
    return { schema_version: 2, policy_sha256: runtime.policy_sha256, component: { plugin_version, source_commit, component_sha256 } };
  }
  return { adoption_sha256: runtime.adoption_sha256 };
}


/** Read the checksum-bound cache entry selected by the protected client binding. */
export async function inspectRetainedClient(input: { cache_directory: string; consumer_repo: string; client_id: string; client: ClientBinding; profile_scope: ClientProfileScope }) {
  const options = { ...input };
  const client = parseClientBinding(options.client), paths = clientPaths(options.cache_directory, options.client_id, client, options.profile_scope, options.consumer_repo);
  privateRuntimeDirectory(dirname(paths.index)); privateRuntimeDirectory(paths.profile);
  const record = clientRecord(readRuntimeFile(paths.index), options.client_id, client), root = join(options.cache_directory, record.build);
  privateRuntimeDirectory(root);
  const distribution = readRuntimeFile(join(root, "distribution"), clientArchiveLimit);
  const files = await clientFiles(distribution, client, record.format, record.executable);
  const archiveRows = await Promise.all([...files].map(async ([path, { file, executable }]) => ({ path, mode: executable ? "100755" : "100644", size: file.size, sha256: sha256(new Uint8Array(await file.arrayBuffer())) })));
  const retainedRows = [...record.files];
  const byPath = (left: { path: string }, right: { path: string }) => compareUTF8(left.path, right.path);
  if (!canonicalJSON(archiveRows.sort(byPath)).equals(canonicalJSON(retainedRows.sort(byPath)))) fail("client payload differs from verified distribution");
  const directory = join(root, "package"), executable = join(directory, record.executable);
  const inspected = inspectRetainedFiles(directory, { files: record.files, component_sha256: componentDigest(record.files) });
  inspectReadOnlyFiles(directory, record.files);
  if (!(lstatSync(executable).mode & 0o100)) fail("client executable mode");
  const nativeBytes = readRuntimeFile(join(root, "version-process.json"));
  const native = runtimeJSON(nativeBytes, ["schema_version", "kind", "client_id", "distribution_sha256", "executable_sha256",
    "capture_verified", "stdout_sha256", "stderr_sha256", "process"]);
  if (!recordedProcessCompleted(native.process)) fail("native client version evidence");
  const completion = native.process;
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
export async function retainClientDistribution(input: {
  cache_directory: string; consumer_repo: string; client_id: string; client: ClientBinding; profile_scope: ClientProfileScope; distribution: Uint8Array; format: ClientFormat; executable: string;
}) {
  const options = { ...input, client: parseClientBinding(input.client), profile_scope: structuredClone(input.profile_scope) };
  const client = options.client, paths = clientPaths(options.cache_directory, options.client_id, client, options.profile_scope, options.consumer_repo);
  const executable = protocolPath(options.executable);
  if (!(options.distribution instanceof Uint8Array) || options.distribution.byteLength > clientArchiveLimit) fail("client distribution checksum");
  options.distribution = new Uint8Array(options.distribution);
  const files = await clientFiles(options.distribution, client, options.format, executable);
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
  for (const [path, { file, executable: runs }] of files) {
    const target = join(directory, path), bytes = new Uint8Array(await file.arrayBuffer());
    // Preserve declared helper execution with an explicit read-only retained mode.
    writeRuntimeFile(target, bytes, runs ? 0o500 : 0o400);
    const item = lstatSync(target);
    if (!item.isFile() || item.isSymbolicLink() || item.nlink !== 1 || item.uid !== process.getuid?.()) fail("regular retained client file required");
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
  if (!ownedClientCompleted(versionProcess) || !captured) fail("owned client version process incomplete");
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


type ComponentPin = ReturnType<typeof parseComponentPin>;

function writeRuntimeFile(path: string, bytes: Uint8Array, mode: number): void {
  privateRuntimeDirectory(dirname(path), true);
  const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, mode);
  try { writeFileSync(fd, bytes); fchmodSync(fd, mode); fsyncSync(fd); } finally { closeSync(fd); }
  syncDirectory(dirname(path));
}

function componentPaths(cache: string, pin: ComponentPin, consumer: string) {
  inspectCacheLocation(cache, consumer);
  const base = join(cache, "components");
  return { base, index: join(base, sha256(canonicalJSON(pin)) + ".json") };
}

/** Inspect only the exact published pin selected by committed consumer policy. */
export function inspectRetainedComponent(options: { cache_directory: string; consumer_repo: string; pin: ComponentPin }) {
  const pin = parseComponentPin(options.pin), paths = componentPaths(options.cache_directory, pin, options.consumer_repo);
  privateRuntimeDirectory(paths.base);
  const record = runtimeJSON(readRuntimeFile(paths.index), ["schema_version", "kind", "pin", "build", "identity"]);
  if (record.schema_version !== 1 || record.kind !== "docs-drift-retained-component"
    || !canonicalJSON(parseComponentPin(record.pin)).equals(canonicalJSON(pin))
    || typeof record.build !== "string" || !/^component-builds\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(record.build)) fail("retained component selection");
  const value = runtimeObject(record.identity, ["schema_version", "source_commit", "plugin_version", "component_sha256", "files"]);
  if (value.schema_version !== 1 || value.source_commit !== pin.source_commit || value.plugin_version !== pin.plugin_version
    || value.component_sha256 !== pin.component_sha256 || !Array.isArray(value.files) || !value.files.length || value.files.length > 50000) fail("retained component identity");
  const files = value.files.map((row: unknown): PayloadFile => {
    const file = runtimeObject(row, ["path", "mode", "sha256", "size"]);
    if (typeof file.path !== "string" || (file.mode !== "100644" && file.mode !== "100755")
      || typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(file.sha256)
      || typeof file.size !== "number" || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > clientArchiveLimit) fail("retained component file");
    return { path: protocolPath(file.path), mode: file.mode, sha256: file.sha256, size: file.size };
  });
  const identity: ComponentIdentity = { schema_version: 1, source_commit: pin.source_commit,
    plugin_version: pin.plugin_version, component_sha256: pin.component_sha256, files };
  const directory = join(options.cache_directory, record.build, "package");
  privateRuntimeDirectory(dirname(directory));
  const selected = inspectRetainedPayload({ directory, expected: identity });
  inspectReadOnlyFiles(directory, identity.files);
  return freezeJSON({ ...selected, pin });
}

/** Setup receives an independently verified published source and its protected pin. */
export function retainComponentSnapshot(options: { cache_directory: string; consumer_repo: string; source_repo: string; pin: ComponentPin }) {
  inspectCacheLocation(options.cache_directory, options.source_repo);
  const pin = parseComponentPin(options.pin), paths = componentPaths(options.cache_directory, pin, options.consumer_repo);
  const identity = computeComponentIdentity(options.source_repo, pin.source_commit);
  if (identity.plugin_version !== pin.plugin_version || identity.component_sha256 !== pin.component_sha256) fail("published component pin mismatch");
  privateRuntimeDirectory(paths.base, true);
  if (existsSync(paths.index)) return inspectRetainedComponent(options);
  const build = "component-builds/" + randomUUID(), directory = join(options.cache_directory, build, "package");
  privateRuntimeDirectory(directory, true);
  for (const file of identity.files) {
    const bytes = readGit(options.source_repo, "show", pin.source_commit + ":plugins/vh-adlc/" + file.path);
    writeRuntimeFile(join(directory, file.path), bytes, file.mode === "100755" ? 0o500 : 0o400);
  }
  inspectRetainedPayload({ directory, expected: identity });
  try { publishArtifact(paths.index, canonicalJSON({ schema_version: 1, kind: "docs-drift-retained-component", pin, build, identity })); }
  catch (error) { if (!existsSync(paths.index)) throw error; }
  return inspectRetainedComponent(options);
}


function inspectEntryInput(repo: string, commit: string, path: string, invokedPath: string, invokedRepo = repo): string {
  const root = realpathSync(invokedRepo), expectedPath = join(root, protocolPath(path));
  if (invokedPath !== expectedPath || realpathSync(invokedPath) !== expectedPath) fail("invoked entry path differs from committed policy");
  const item = lstatSync(invokedPath), entry = readGit(repo, "--literal-pathspecs", "ls-tree", "-z", commit, "--", path).toString();
  const mode = (item.mode & 0o100) ? "100755" : "100644";
  if (!item.isFile() || item.isSymbolicLink() || item.nlink !== 1 || item.uid !== process.getuid?.()
    || (item.mode & 0o002) !== 0 || !entry.startsWith(mode + " blob ") || item.size > 16 * 1024 * 1024) fail("regular committed entry input required");
  const expected = readGit(repo, "show", commit + ":" + path);
  const fd = openSync(invokedPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.dev !== item.dev || opened.ino !== item.ino || opened.mode !== item.mode
      || opened.size !== item.size || opened.nlink !== 1 || opened.uid !== item.uid) fail("entry input changed during inspection");
    const bytes = readFileSync(fd);
    if (!bytes.equals(expected)) fail("invoked entry bytes differ from committed policy");
    return sha256(bytes);
  } finally { closeSync(fd); }
}

/** Preflight an approved entry at the caller's freshly observed immutable default.
 * The portable result remains an owner attestation. Effects require their separate current gates.
 */
type RuntimeEntryOptions = {
  repo: string; cache_directory: string; entry: "hosted" | "copilot" | "claude";
  settings: ReturnType<typeof collectAdoptionBindings>["settings"]; pin: ComponentPin; identity: PublicationIdentity;
  launcher_sha256: string; settings_sha256: string; trial?: ClientProfileScope["trial"];
};

async function retainedRuntimeEntry(options: RuntimeEntryOptions) {
  const { settings } = options;
  if (!["hosted", "copilot", "claude"].includes(options.entry)) fail("protected execution entry required");
  const component = inspectRetainedComponent({ cache_directory: options.cache_directory, consumer_repo: options.repo, pin: options.pin });
  const entry = settings.execution.entries[options.entry];
  async function role(selected: typeof entry.worker) {
    const retained = await inspectRetainedClient({ cache_directory: options.cache_directory, consumer_repo: options.repo,
      client_id: selected.client, client: settings.clients[selected.client],
      profile_scope: { hostname: settings.hostname, repository_id: options.identity.repository_id, actor_id: options.identity.actor_id,
        entry: options.entry, ...(options.trial ? { trial: options.trial } : {}) } });
    return { ...retained, model: selected.model, argv: selected.argv, identity_source: selected.identity_source };
  }
  const worker = await role(entry.worker), reviewer = await role(entry.reviewer);
  if (worker.client.provider !== settings.runtime_loader.provider) fail("loader provider differs from selected worker client");
  const argv = settings.runtime_loader.argv.map(arg => arg.replaceAll("{plugin_dir}", component.directory).replaceAll("{profile_root}", worker.profile_directory));
  return { component, worker, reviewer, loader: { ...settings.runtime_loader, argv,
    launcher_sha256: options.launcher_sha256, settings_sha256: options.settings_sha256, profile_root: worker.profile_directory } };
}

export async function selectApprovedRuntime(input: {
  repo: string; policy_repo?: string; current_default: string; identity: PublicationIdentity; cache_directory: string;
  entry: "hosted" | "copilot" | "claude"; launcher_path: string; settings_path: string;
}) {
  const options = { ...input }, policyRepo = options.policy_repo ?? options.repo;
  inspectCacheLocation(options.cache_directory, options.repo);
  if (policyRepo !== options.repo) inspectCacheLocation(options.cache_directory, policyRepo);
  const adopted = verifyRuntimeAdoption({ repo: policyRepo, current_default: options.current_default, identity: options.identity, entry: options.entry });
  const bindings = collectAdoptionBindings(policyRepo, options.current_default), settings = bindings.settings;
  const launcherSHA = inspectEntryInput(policyRepo, options.current_default, settings.runtime_loader.launcher, options.launcher_path, options.repo);
  const settingsSHA = inspectEntryInput(policyRepo, options.current_default, ".vh-adlc/docs-drift.yaml", options.settings_path, options.repo);
  if (settingsSHA !== bindings.settings_sha256) fail("invoked settings changed");
  const runtime = await retainedRuntimeEntry({ ...options, settings, pin: adopted.component_pin, identity: adopted.identity,
    launcher_sha256: launcherSHA, settings_sha256: settingsSHA });
  return freezeJSON({ kind: "docs-drift-approved-runtime" as const, evidence: adopted.evidence, current_default: options.current_default,
    adoption_sha256: adopted.adoption_sha256, protected_sha256: adopted.protected_sha256, entry: options.entry, ...runtime });
}

/** Select the original retained code for metadata recovery. Current publication policy and grants are separate. */
export async function selectRecoveryRuntime(input: {
  repo: string; source_commit: string; identity: PublicationIdentity; cache_directory: string;
  entry: "hosted" | "copilot" | "claude"; adoption_sha256: string;
}) {
  const options = structuredClone(input);
  inspectCacheLocation(options.cache_directory, options.repo);
  const adopted = verifyRuntimeAdoption({ repo: options.repo, current_default: options.source_commit, identity: options.identity, entry: options.entry });
  if (adopted.adoption_sha256 !== options.adoption_sha256) fail("original recovery adoption changed");
  const bindings = collectAdoptionBindings(options.repo, options.source_commit), settings = bindings.settings;
  const runtime = await retainedRuntimeEntry({ ...options, settings, pin: adopted.component_pin, identity: adopted.identity,
    launcher_sha256: sha256(readGit(options.repo, "show", options.source_commit + ":" + settings.runtime_loader.launcher)),
    settings_sha256: bindings.settings_sha256 });
  return freezeJSON({ kind: "docs-drift-recovery-runtime", authority: "none", purpose: "metadata-recovery", source_commit: options.source_commit,
    adoption_sha256: adopted.adoption_sha256, entry: options.entry, ...runtime });
}

/** Inspect a declared candidate only. An actual trial still needs its separately scoped authority. */
export async function selectCandidateRuntime(input: {
  repo: string; current_default: string; identity: PublicationIdentity; cache_directory: string;
  entry: "hosted" | "copilot" | "claude"; launcher_path: string; settings_path: string; definition_sha256: string;
}) {
  const options = { ...input };
  if (!options.identity) fail("current native trial identity required");
  inspectCacheLocation(options.cache_directory, options.repo);
  const policy = collectTrialBindings(options), settings = policy.candidate.settings;
  if (options.definition_sha256 !== policy.definition_sha256) fail("candidate trial definition changed");
  const launcherSHA = inspectEntryInput(options.repo, options.current_default, settings.runtime_loader.launcher, options.launcher_path);
  const settingsSHA = inspectEntryInput(options.repo, options.current_default, policy.candidate_settings.path, options.settings_path);
  if (settingsSHA !== policy.candidate_settings.sha256) fail("candidate settings changed");
  const runtime = await retainedRuntimeEntry({ ...options, settings, pin: policy.candidate.component_pin.value, identity: policy.identity,
    launcher_sha256: launcherSHA, settings_sha256: settingsSHA,
    trial: { definition_sha256: policy.definition_sha256, fixture_id: policy.fixture.id } });
  return freezeJSON({ kind: "docs-drift-candidate-runtime", authority: "none", current_default: options.current_default,
    definition_sha256: policy.definition_sha256, protected_sha256: policy.candidate.protected_sha256,
    fixture_id: policy.fixture.id, namespace: policy.namespace, entry: options.entry, ...runtime });
}


function inspectReadOnlyFiles(directory: string, files: PayloadFile[]): void {
  for (const file of files) {
    const mode = lstatSync(join(directory, file.path)).mode & 0o777;
    if (mode !== (file.mode === "100755" ? 0o500 : 0o400)) fail("retained file read-only mode changed");
  }
}
