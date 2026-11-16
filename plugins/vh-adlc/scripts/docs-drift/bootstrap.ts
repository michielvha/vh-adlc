import { verifyProductionPreflight } from "./preflight";
import { currentRuntimeValidation } from "./runtime-validation";
export { withRuntimeValidation } from "./runtime-validation";
import { readNativeTrialPolicy, readOriginalNativeTrialPolicy } from "./trial-definition";
import { sameAccount, samePublicationIdentity } from "./identity";
import { policyBinding, readVerifiedPlan, type CurrentSealedPlan, type PolicyBinding, type SealedPlan } from "./journal";
import { executeOwnedProcess, ownedClientCompleted } from "./owned-process";
import { loadCommittedSettings, parseInstalledClient, SetupRequired } from "./settings";
import { readNativeContext, type PublicationIdentity } from "./transport";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
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

export type ComponentInspection = ReturnType<typeof inspectComponentPayload>;
export type ClientProbeResult = Awaited<ReturnType<typeof probeInstalledClient>>;

/** Validate ordinary installed bytes and inventory without changing installer permissions or copying files. */
export function inspectInstalledPayload(options: { directory: string; expected: InstalledComponentBinding & Partial<Pick<ComponentIdentity, "files" | "schema_version">> }) {
  const scope = currentRuntimeValidation()?.payloads;
  if (!scope) return inspectComponentPayload(options, "installed");
  const key = sha256(canonicalJSON({ directory: realpathSync(options.directory), expected: options.expected }));
  const previous = scope.get(key);
  if (previous) return previous;
  const inspected = inspectComponentPayload(options, "installed");
  scope.set(key, inspected);
  return inspected;
}

function nativeClientVersion(stdout: Uint8Array, client: { provider: ReturnType<typeof parseInstalledClient>["provider"] }): string {
  const lines = decodeUTF8(stdout).trim().split(/\r?\n/u);
  const pattern = client.provider === "copilot" ? /^GitHub Copilot CLI (.+?)\.?$/u
    : client.provider === "claude" ? /^(.+) \(Claude Code\)$/u : /^codex-cli (.+)$/u;
  const version = pattern.exec(lines[0])?.[1];
  const extras = client.provider === "copilot" && lines.length === 2 && lines[1] === "Run 'copilot update' to check for updates.";
  if ((lines.length !== 1 && !extras) || !version
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)) fail("native client version differs from approved build");
  return version;
}

/** Observe the ordinary command in place. Its version is diagnostic and carries no effect authority. */
type ClientProbeOptions = {
  client: ReturnType<typeof parseInstalledClient>; cwd: string; path?: string; required_flags?: readonly string[];
};

export async function inspectInstalledClient(input: ClientProbeOptions) {
  const options = { client: parseInstalledClient(input.client), cwd: input.cwd, path: input.path ?? process.env.PATH,
    required_flags: [...new Set(input.required_flags ?? [])].sort() };
  const scope = currentRuntimeValidation()?.clients;
  if (!scope) return probeInstalledClient(options);
  const key = sha256(canonicalJSON({ ...options, path: options.path ?? null }));
  let selected = scope.get(key);
  if (!selected) {
    selected = probeInstalledClient(options).then(result => {
      if (result.complete) return freezeJSON(result);
      scope.delete(key);
      return result;
    }, error => { scope.delete(key); throw error; });
    scope.set(key, selected);
  }
  return selected;
}

async function probeInstalledClient(input: ClientProbeOptions) {
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

/** A committed synthetic launch grant selects ordinary native clients before activation. */
export async function selectNativeTrialRuntime(options: {
  repo: string; current_default: string; directory: string; entry: string; credential: string; path?: string;
  run_id: number; run_attempt: number; definition_sha256: string; publication_kind?: "advisory" | "resolve";
}) {
  const { settings } = loadCommittedSettings(options.repo, options.current_default);
  if (settings.schema_version !== 2) fail("ordinary native trial settings required");
  const native = readNativeContext({ hostname: settings.hostname, repository: settings.repository, credential: options.credential, path: options.path });
  if (native.default_commit !== options.current_default) fail("native trial current default changed");
  const trial = readNativeTrialPolicy({ ...options, identity: native.identity, reader: native.repository });
  if (trial.definition_sha256 !== options.definition_sha256) fail("selected native trial definition changed");
  const selected = await selectInstalledRuntime({ ...options, source_commit: options.current_default });
  if (!selected.complete || !selected.runtime) fail(selected.diagnostics.join(". "));
  return freezeJSON({ kind: "docs-drift-native-trial-runtime" as const, authority: "none" as const, runtime: selected.runtime, trial });
}
export type NativeTrialRuntime = Awaited<ReturnType<typeof selectNativeTrialRuntime>>;

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
  return freezeJSON({ ...selected.runtime, kind: "docs-drift-production-runtime" as const, current_default: options.current_default, policy_sha256: preflight.policy_sha256,
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
  const plan = options.plan, original = plan.context === "trial"
    ? readOriginalNativeTrialPolicy(options) : readOriginalProductionPolicy(options);
  if (!samePublicationIdentity(options.identity, { repository: plan.manifest.repository, repository_id: plan.manifest.repository_id,
    actor: plan.manifest.actor, actor_id: plan.manifest.actor_id, default_branch: original.settings.default_branch }))
    fail("original operation native identity changed");
  const inspected = inspectInstalledPayload({ directory: options.directory, expected: plan.component });
  return freezeJSON({ kind: "docs-drift-original-runtime" as const, authority: "none" as const, purpose: "metadata-recovery" as const,
    source_commit: original.source_commit, component: { ...plan.component, directory: inspected.directory }, settings: original.settings, policy: original.policy });
}

/** Recovery selects the recorded component and original policy, independently of a successor config. */
export async function selectOriginalOperationRuntime(options: {
  repo: string; directory: string; plan: SealedPlan; identity: PublicationIdentity; entry: string;
}) {
  if (options.plan.schema_version !== 2) throw new SetupRequired("Use the original implementation for this operation format.");
  if (options.entry !== options.plan.manifest.publisher_entry) fail("original operation profile changed");
  return readOriginalRuntime({ ...options, plan: options.plan });
}

/** Select the current ordinary contract from the immutable observed source. */
export async function selectOperationRuntime(options: {
  repo: string; policy_repo?: string; current_default: string; identity: PublicationIdentity; entry: string;
  path?: string;
}) {
  return selectProductionRuntime({ repo: options.policy_repo ?? options.repo, current_default: options.current_default,
    entry: options.entry, identity: options.identity, directory: resolve(import.meta.dir, "../.."), path: options.path });
}

export function runtimePolicyBinding(runtime: Awaited<ReturnType<typeof selectOperationRuntime>> | NativeTrialRuntime): PolicyBinding {
  if (runtime.kind === "docs-drift-native-trial-runtime") return policyBinding(runtime.trial.policy);
  const { plugin_version, source_commit, component_sha256 } = runtime.component;
  return { schema_version: 2, policy_sha256: runtime.policy_sha256, component: { plugin_version, source_commit, component_sha256 } };
}
