import { readGit, verifiedHelperEnvironment } from "./git";
import { readYAML } from "../settings-file";
import { protocolPath, sha256 } from "./protocol";

export type SettingClassification = "ordinary" | "protected" | "trial-setup";
export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
export type DetectorSelector = { all_inventory: true } | { roots: string[]; exclusions: string[]; suffixes: string[] };

const fields = [
  "schema_version", "protocol_version", "repository", "hostname", "default_branch", "roots", "exclusions", "suffixes",
  "required_detectors", "detector_inputs", "detector_options", "feedback_files", "scanner", "project_procedure",
  "verification_commands", "generation_commands", "read_set", "component_pin", "pr_discovery", "publication",
  "reports", "runtime_loader", "clients", "execution", "legacy_proposals", "knowledge_pages", "trial",
] as const;

export const DOCS_DRIFT_KNOWLEDGE_PAGES = [
  "conventions/feature-documents.md", "conventions/documentation.md", "conventions/documentation-impact.md",
  "conventions/delivery.md", "guides/humanize-prose.md",
] as const;

function invalid(field: string): never {
  throw new Error(`invalid docs-drift settings field ${field}`);
}

function object(value: unknown, allowed: readonly string[] | null, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(field);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(field);
  const result = value as Record<string, unknown>;
  if (allowed && Object.keys(result).some(key => !allowed.includes(key))) invalid(field);
  return result;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() || /[\u0000\uD800-\uDFFF]/u.test(value)) invalid(field);
  return value;
}

function choice<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) invalid(field);
  return value as T[number];
}

function positive(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) invalid(field);
  return value;
}

function strings(value: unknown, field: string, nonempty = false): string[] {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) invalid(field);
  return value.map(item => text(item, field));
}

function unique(values: string[], field: string): string[] {
  if (new Set(values).size !== values.length) invalid(field);
  return values;
}

function path(value: unknown, field: string, root = false): string {
  if (typeof value !== "string") invalid(field);
  const normalized = root ? value.replace(/\/$/u, "") : value;
  if (root && normalized === ".") return normalized;
  try { return protocolPath(normalized); } catch { invalid(field); }
}

function paths(value: unknown, field: string, nonempty = false, root = true): string[] {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) invalid(field);
  return unique(value.map(value => path(value, field, root)), field);
}

function yamlPath(value: unknown, field: string): string {
  const result = path(value, field);
  if (!result.endsWith(".yaml")) invalid(field);
  return result;
}

function ref(value: unknown, field: string, prefix = false): string {
  const result = text(value, field);
  const full = prefix ? result + "operation" : result;
  if ((prefix && !result.endsWith("/")) || full === "@" || full.includes("..") || full.includes("@{") ||
      /[\u0000-\u0020\u007f~^:?*\[\\]/u.test(full) || full.split("/").some(part => !part || part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock"))) invalid(field);
  return result;
}

function repository(value: unknown, field: string): string {
  const result = text(value, field);
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/u.test(result) || result.split("/").some(part => part === "." || part === "..")) invalid(field);
  return result.toLowerCase();
}

function digest(value: unknown, field: string): string {
  const result = text(value, field);
  if (!/^[a-f0-9]{64}$/u.test(result)) invalid(field);
  return result;
}

function identifiers(value: unknown, field: string, nonempty = false): string[] {
  const result = unique(strings(value, field, nonempty), field);
  if (result.some(item => !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(item))) invalid(field);
  return result;
}

function argv(value: unknown, field: string): string[] {
  return strings(value, field, true);
}

function commands(value: unknown, field: string): string[][] {
  if (!Array.isArray(value)) invalid(field);
  return value.map(item => argv(item, field));
}

function jsonData(value: unknown, field: string): JSONValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && !/[\uD800-\uDFFF]/u.test(value)) return value;
  if (Array.isArray(value)) return value.map(item => jsonData(item, field));
  const input = object(value, null, field);
  return Object.fromEntries(Object.entries(input).map(([key, item]) => {
    if (/[\uD800-\uDFFF]/u.test(key)) invalid(field);
    return [key, jsonData(item, field)] as const;
  }));
}

function suffixes(value: unknown, field: string, nonempty = false): string[] {
  const result = unique(strings(value, field, nonempty), field);
  if (result.some(item => !/^\.[A-Za-z0-9][A-Za-z0-9.-]*$/u.test(item))) invalid(field);
  return result;
}

function detectorSelectors(value: unknown, required: string[]): Record<string, DetectorSelector> {
  const input = object(value, required, "detector_inputs");
  if (Object.keys(input).length !== required.length) invalid("detector_inputs");
  return Object.fromEntries(required.map(id => {
    const selector = object(input[id], ["all_inventory", "roots", "exclusions", "suffixes"], "detector_inputs selector");
    if (Object.hasOwn(selector, "all_inventory")) {
      if (selector.all_inventory !== true || Object.keys(selector).length !== 1) invalid("detector_inputs selector");
      return [id, { all_inventory: true }] as const;
    }
    return [id, {
      roots: paths(selector.roots, "detector_inputs roots"),
      exclusions: paths(selector.exclusions, "detector_inputs exclusions"),
      suffixes: suffixes(selector.suffixes, "detector_inputs suffixes"),
    }] as const;
  }));
}

function readSet(value: unknown): { source_roots: string[] | null; reference_roots: string[] | null } {
  const input = value === undefined ? {} : object(value, ["source_roots", "reference_roots"], "read_set");
  const bound = (value: unknown, field: string) => value === undefined || value === null ? null : paths(value, field);
  return { source_roots: bound(input.source_roots, "read_set source_roots"), reference_roots: bound(input.reference_roots, "read_set reference_roots") };
}

export function parseClientBinding(value: unknown) {
  const client = object(value, ["provider", "version", "platform", "distribution_url", "distribution_sha256"], "clients entry");
  const version = text(client.version, "clients version");
  if (["latest", "main", "master", "nightly", "canary"].includes(version.toLowerCase())) invalid("clients version");
  const distribution = text(client.distribution_url, "clients distribution_url");
  let url: URL;
  try { url = new URL(distribution); } catch { invalid("clients distribution_url"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) invalid("clients distribution_url");
  return {
    provider: choice(client.provider, ["copilot", "claude", "codex"], "clients provider"), version,
    platform: choice(client.platform, ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"], "clients platform"),
    distribution_url: distribution,
    distribution_sha256: digest(client.distribution_sha256, "clients distribution_sha256"),
  };
}

function clientSettings(value: unknown) {
  const input = object(value, null, "clients");
  identifiers(Object.keys(input), "clients", true);
  return Object.fromEntries(Object.entries(input).map(([id, value]) => [id, parseClientBinding(value)] as const));
}

export type IdentitySource = { provider: "copilot" | "claude" | "codex"; event_type: string; field_path: string[] };

export function parseIdentitySource(value: unknown, provider: string): IdentitySource | null {
  if (value === undefined || value === null) return null;
  const input = object(value, ["provider", "event_type", "field_path"], "identity_source");
  const selected = choice(input.provider, ["copilot", "claude", "codex"], "identity_source provider");
  if (selected !== provider) invalid("identity_source provider");
  const fieldPath = strings(input.field_path, "identity_source field_path", true);
  if (fieldPath.some(key => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) || ["__proto__", "prototype", "constructor"].includes(key))) invalid("identity_source field_path");
  return { provider: selected, event_type: text(input.event_type, "identity_source event_type"), field_path: fieldPath };
}

function executionSettings(value: unknown, clients: ReturnType<typeof clientSettings>) {
  const input = object(value, ["worker_workflow", "scheduled_workflow", "claude_command", "runner", "permissions", "secret_mappings", "entries"], "execution");
  const permissions = object(input.permissions, [
    "actions", "contents", "pull-requests", "issues", "checks", "statuses", "security-events",
    "id-token", "packages", "deployments", "attestations", "discussions", "models", "pages",
  ], "execution permissions");
  const parsedPermissions = Object.fromEntries(Object.entries(permissions).map(([key, value]) =>
    [key, choice(value, ["read", "write", "none"], "execution permissions")] as const));
  if (parsedPermissions.actions !== "read") invalid("execution permissions actions");
  const mappings = object(input.secret_mappings, null, "execution secret_mappings");
  const secretMappings = Object.fromEntries(Object.entries(mappings).map(([key, value]) => {
    if (!/^[A-Z_][A-Z0-9_]*$/u.test(key) || typeof value !== "string" || !/^[A-Z_][A-Z0-9_]*$/u.test(value)) invalid("execution secret_mappings");
    return [key, value] as const;
  }));
  const entries = object(input.entries, ["hosted", "copilot", "claude"], "execution entries");
  const role = (value: unknown) => {
    const input = object(value, ["client", "model", "argv", "identity_source"], "execution role");
    const client = text(input.client, "execution role client");
    if (!Object.hasOwn(clients, client)) invalid("execution role client");
    return {
      client, model: text(input.model, "execution role model"), argv: argv(input.argv, "execution role argv"),
      identity_source: parseIdentitySource(input.identity_source, clients[client].provider),
    };
  };
  const parsedEntries = Object.fromEntries(["hosted", "copilot", "claude"].map(name => {
    const entry = object(entries[name], ["worker", "reviewer", "publisher"], "execution entry");
    const publisher = object(entry.publisher, ["argv"], "execution publisher");
    return [name, {
      worker: role(entry.worker),
      reviewer: role(entry.reviewer),
      publisher: { argv: argv(publisher.argv, "execution publisher argv") },
    }] as const;
  }));
  return {
    worker_workflow: path(input.worker_workflow, "execution worker_workflow"), scheduled_workflow: path(input.scheduled_workflow, "execution scheduled_workflow"),
    claude_command: path(input.claude_command, "execution claude_command"), runner: text(input.runner, "execution runner"),
    permissions: parsedPermissions, secret_mappings: secretMappings, entries: parsedEntries,
  };
}

function publicationSettings(value: unknown, selectedRepository: string, base: string) {
  const input = object(value, [
    "repository", "base", "actor", "branch_prefix", "mode", "adoption_record", "pr_state", "lease_ref", "receipt_ref_prefix",
    "resolution_root", "closure", "merge_methods",
  ], "publication");
  if (repository(input.repository, "publication repository") !== selectedRepository || ref(input.base, "publication base") !== base) invalid("publication destination");
  const states = object(input.pr_state, ["advisory", "resolve"], "publication pr_state");
  const lease = ref(input.lease_ref, "publication lease_ref");
  const receipts = ref(input.receipt_ref_prefix, "publication receipt_ref_prefix", true);
  const branchPrefix = ref(input.branch_prefix, "publication branch_prefix", true);
  if (!lease.startsWith("refs/heads/") || !receipts.startsWith("refs/heads/") || receipts === "refs/heads/") invalid("publication namespaces");
  const namespaces = [lease, receipts.slice(0, -1), "refs/heads/" + branchPrefix.slice(0, -1)];
  for (let index = 0; index < namespaces.length; index++) {
    const left = namespaces[index];
    for (const right of namespaces.slice(index + 1)) {
      if (left === right || left.startsWith(right + "/") || right.startsWith(left + "/")) invalid("publication namespaces");
    }
  }
  const methods = unique(strings(input.merge_methods, "publication merge_methods", true), "publication merge_methods");
  for (const method of methods) choice(method, ["merge", "squash", "rebase"], "publication merge_methods");
  return {
    repository: selectedRepository, base, actor: text(input.actor, "publication actor"), branch_prefix: branchPrefix,
    mode: choice(input.mode, ["staged", "adopted"], "publication mode"),
    adoption_record: yamlPath(input.adoption_record, "publication adoption_record"),
    pr_state: { advisory: choice(states.advisory, ["draft", "ready"], "publication pr_state advisory"),
      resolve: choice(states.resolve, ["draft", "ready"], "publication pr_state resolve") },
    lease_ref: lease, receipt_ref_prefix: receipts,
    resolution_root: path(input.resolution_root, "publication resolution_root"),
    closure: choice(input.closure, ["after-merge"], "publication closure"),
    merge_methods: methods,
  };
}

function reportSettings(value: unknown) {
  const input = object(value, [
    "hosted", "interactive", "workflow_path", "workflow_id", "artifact_name_template", "max_age_seconds",
    "max_runs", "max_archive_bytes", "max_entry_bytes", "local_history_roots", "schema_version",
    "attention_version", "history_reader_argv",
  ], "reports");
  const localRoots = paths(input.local_history_roots, "reports local_history_roots");
  const interactive = choice(input.interactive, ["actions", "local-attestation", "none"], "reports interactive");
  if ((interactive === "local-attestation") !== (localRoots.length > 0)) invalid("reports local_history_roots");
  if (input.schema_version !== 1 || input.attention_version !== 1) invalid("reports versions");
  const template = text(input.artifact_name_template, "reports artifact_name_template");
  const literal = template.replaceAll("{run_id}", "").replaceAll("{run_attempt}", "");
  if (!/^[A-Za-z0-9_.{}-]+$/u.test(template) || /[{}]/u.test(literal) ||
      !template.includes("{run_id}") || !template.includes("{run_attempt}")) invalid("reports artifact_name_template");
  const archiveBytes = positive(input.max_archive_bytes, "reports max_archive_bytes");
  const entryBytes = positive(input.max_entry_bytes, "reports max_entry_bytes");
  if (entryBytes > archiveBytes) invalid("reports max_entry_bytes");
  return {
    hosted: choice(input.hosted, ["actions"], "reports hosted"), interactive,
    workflow_path: path(input.workflow_path, "reports workflow_path"), workflow_id: input.workflow_id === null ? null : positive(input.workflow_id, "reports workflow_id"),
    artifact_name_template: template, max_age_seconds: positive(input.max_age_seconds, "reports max_age_seconds"), max_runs: positive(input.max_runs, "reports max_runs"),
    max_archive_bytes: archiveBytes, max_entry_bytes: entryBytes, local_history_roots: localRoots,
    schema_version: 1 as const, attention_version: 1 as const, history_reader_argv: argv(input.history_reader_argv, "reports history_reader_argv"),
  };
}

function loaderSettings(value: unknown) {
  const input = object(value, [
    "launcher", "provider", "argv", "plugin_directory_template", "profile_root_template",
    "automatic_updates", "ambient_discovery", "credential_references",
  ], "runtime_loader");
  if (input.automatic_updates !== false || input.ambient_discovery !== false) invalid("runtime_loader controls");
  if (input.plugin_directory_template !== "{plugin_dir}" || input.profile_root_template !== "{profile_root}") invalid("runtime_loader path templates");
  const args = argv(input.argv, "runtime_loader argv");
  for (const arg of args) {
    const remaining = arg.replaceAll("{plugin_dir}", "").replaceAll("{profile_root}", "");
    if (/[{}]/u.test(remaining)) invalid("runtime_loader argv templates");
  }
  const credentials = identifiers(input.credential_references, "runtime_loader credential_references");
  if (credentials.some(name => !/^[A-Z_][A-Z0-9_]*$/u.test(name))) invalid("runtime_loader credential_references");
  return {
    launcher: path(input.launcher, "runtime_loader launcher"), provider: choice(input.provider, ["copilot", "claude", "codex"], "runtime_loader provider"), argv: args,
    plugin_directory_template: "{plugin_dir}" as const, profile_root_template: "{profile_root}" as const,
    automatic_updates: false as const, ambient_discovery: false as const, credential_references: credentials,
  };
}

/** Validate the same closed schema for selected source blobs and current-default policy. */
export function parseSettings(value: unknown) {
  const input = object(value, fields, "settings");
  if (input.schema_version !== 1 || input.protocol_version !== 1) invalid("versions");
  const selectedRepository = repository(input.repository, "repository");
  const hostname = text(input.hostname, "hostname").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(hostname)) invalid("hostname");
  const base = ref(input.default_branch, "default_branch");
  const required = identifiers(input.required_detectors, "required_detectors", true);
  const options = object(input.detector_options, required, "detector_options");
  const clients = clientSettings(input.clients);
  const execution = executionSettings(input.execution, clients);
  const publication = publicationSettings(input.publication, selectedRepository, base);
  const componentPin = input.component_pin === null ? null : yamlPath(input.component_pin, "component_pin");
  if (publication.mode === "adopted" && componentPin === null) invalid("adopted component_pin");
  const discovery = object(input.pr_discovery, ["repository", "base", "authors", "branch_prefixes"], "pr_discovery");
  if (repository(discovery.repository, "pr_discovery repository") !== selectedRepository || ref(discovery.base, "pr_discovery base") !== base) invalid("pr_discovery destination");
  const legacy = object(input.legacy_proposals, ["authors", "branch_prefixes", "ids"], "legacy_proposals");
  if (!Array.isArray(legacy.ids)) invalid("legacy_proposals ids");
  const legacyIDs = legacy.ids.map(id => positive(id, "legacy_proposals ids"));
  if (new Set(legacyIDs).size !== legacyIDs.length) invalid("legacy_proposals ids");
  const reports = reportSettings(input.reports);
  if (reports.workflow_path !== execution.scheduled_workflow) invalid("reports scheduled workflow");
  if (publication.mode === "adopted" && reports.workflow_id === null) invalid("adopted reports workflow_id");
  let trial: { definition_path: string; definition_sha256: string } | null = null;
  if (input.trial !== undefined) {
    const block = object(input.trial, ["definition_path", "definition_sha256"], "trial");
    trial = { definition_path: yamlPath(block.definition_path, "trial definition_path"), definition_sha256: digest(block.definition_sha256, "trial definition_sha256") };
  }
  const pages = unique([...DOCS_DRIFT_KNOWLEDGE_PAGES, ...strings(input.knowledge_pages, "knowledge_pages")], "knowledge_pages");
  for (const page of pages) if (!path(page, "knowledge_pages").endsWith(".md")) invalid("knowledge_pages");
  return {
    schema_version: 1 as const, protocol_version: 1 as const, repository: selectedRepository, hostname, default_branch: base,
    roots: paths(input.roots, "roots", true), exclusions: paths(input.exclusions, "exclusions"), suffixes: suffixes(input.suffixes, "suffixes", true),
    required_detectors: required, detector_inputs: detectorSelectors(input.detector_inputs, required),
    detector_options: Object.fromEntries(required.map(id =>
      [id, jsonData(Object.hasOwn(options, id) ? options[id] : {}, "detector_options")] as const)),
    feedback_files: paths(input.feedback_files, "feedback_files", false, false),
    scanner: scannerSettings(input.scanner), project_procedure: path(input.project_procedure, "project_procedure"),
    verification_commands: commands(input.verification_commands, "verification_commands"),
    generation_commands: commands(input.generation_commands, "generation_commands"),
    read_set: readSet(input.read_set), component_pin: componentPin,
    pr_discovery: {
      repository: selectedRepository,
      base,
      authors: unique(strings(discovery.authors, "pr_discovery authors", true), "pr_discovery authors"),
      branch_prefixes: unique(strings(discovery.branch_prefixes, "pr_discovery branch_prefixes", true)
        .map(value => ref(value, "pr_discovery branch_prefixes", true)), "pr_discovery branch_prefixes"),
    },
    publication, reports, runtime_loader: loaderSettings(input.runtime_loader), clients, execution,
    legacy_proposals: {
      authors: unique(strings(legacy.authors, "legacy_proposals authors"), "legacy_proposals authors"),
      branch_prefixes: unique(strings(legacy.branch_prefixes, "legacy_proposals branch_prefixes")
        .map(value => ref(value, "legacy_proposals branch_prefixes", true)), "legacy_proposals branch_prefixes"),
      ids: legacyIDs,
    },
    knowledge_pages: pages, trial,
  };
}

function scannerSettings(value: unknown) {
  const input = object(value, ["argv", "script", "adapter", "timeout_seconds"], "scanner");
  return {
    argv: argv(input.argv, "scanner argv"), script: path(input.script, "scanner script"),
    adapter: input.adapter === null ? null : path(input.adapter, "scanner adapter"), timeout_seconds: positive(input.timeout_seconds, "scanner timeout_seconds"),
  };
}

export type Settings = ReturnType<typeof parseSettings>;

const classifications = {
  schema_version: "protected",
  protocol_version: "protected",
  repository: "protected",
  hostname: "protected",
  default_branch: "protected",
  roots: "ordinary",
  exclusions: "ordinary",
  suffixes: "ordinary",
  required_detectors: "ordinary",
  detector_inputs: "ordinary",
  detector_options: "ordinary",
  feedback_files: "ordinary",
  scanner: "protected",
  project_procedure: "protected",
  verification_commands: "protected",
  generation_commands: "protected",
  read_set: "protected",
  component_pin: "protected",
  pr_discovery: "protected",
  publication: "protected",
  reports: "protected",
  runtime_loader: "protected",
  clients: "protected",
  execution: "protected",
  legacy_proposals: "protected",
  knowledge_pages: "protected",
  trial: "trial-setup",
} satisfies Record<keyof Settings, SettingClassification>;

export type ClassifiedLeaf = { path: Array<string | number>; classification: SettingClassification; value: unknown };

/** Dynamic detector-option keys are typed data. They inherit their declared ordinary position. */
export function classifySettingsLeaves(settings: Settings): ClassifiedLeaf[] {
  const leaves: ClassifiedLeaf[] = [];
  function visit(value: unknown, path: Array<string | number>, classification: SettingClassification): void {
    const entries = value !== null && typeof value === "object" ? Object.entries(value) : [];
    if (entries.length === 0) {
      leaves.push({ path, classification, value });
      return;
    }
    for (const [key, item] of entries) visit(item, [...path, Array.isArray(value) ? Number(key) : key], classification);
  }
  for (const key of fields) visit(settings[key], [key], classifications[key]);
  return leaves;
}

export function settingsProjections(settings: Settings): { ordinary: Record<string, unknown>; protected: Record<string, unknown>; trial_setup: Record<string, unknown> } {
  const select = (classification: SettingClassification) => Object.fromEntries(fields
    .filter(key => classifications[key] === classification)
    .map(key => [key, settings[key]] as const));
  return { ordinary: select("ordinary"), protected: select("protected"), trial_setup: select("trial-setup") };
}

/** Read immutable Git blob bytes. Dirty checkout files and aliases cannot replace policy. */
export function loadCommittedSettings(repo: string, sourceCommit: string): { settings: Settings; settings_sha256: string; source_commit: string } {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(sourceCommit)) invalid("source_commit");
  const resolved = readGit(repo, "rev-parse", "--verify", "--end-of-options", sourceCommit + "^{commit}").toString().trim();
  if (resolved !== sourceCommit) invalid("source_commit");
  const selected = ".vh-adlc/docs-drift.yaml";
  for (const suffix of ["json", "yml"]) {
    if (readGit(repo, "ls-tree", "-z", sourceCommit, "--", `.vh-adlc/docs-drift.${suffix}`).length !== 0) invalid("settings suffix conflict");
  }
  const entry = readGit(repo, "ls-tree", "-z", sourceCommit, "--", selected).toString("utf8");
  const match = /^(100644|100755) blob ([a-f0-9]{40}(?:[a-f0-9]{24})?)\t\.vh-adlc\/docs-drift\.yaml\0$/u.exec(entry);
  if (!match) invalid("committed settings file");
  const bytes = readGit(repo, "cat-file", "blob", match[2]);
  const value = readYAML(bytes, reason => { throw new Error(reason); }, { offline: true, environment: verifiedHelperEnvironment() });
  return { settings: parseSettings(value), settings_sha256: sha256(bytes), source_commit: sourceCommit };
}
