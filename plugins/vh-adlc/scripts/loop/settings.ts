// Loop settings: which route each loop role runs on, read from a repository's
// `.vh-adlc/loop.yaml` through the verified strict reader. A repository without
// the file keeps the host default for every role. The reference is
// references/loop-settings.md.
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readYAML, settingsFile } from "../settings-file";
import { resolveInside } from "../triage/settings";
import type { Rung } from "./rungs";

export const LOOP_ROLES = ["author", "implementer", "spec_reviewer", "implementation_reviewer"] as const;
export type LoopRole = typeof LOOP_ROLES[number];
const REVIEWER_ROLES: readonly LoopRole[] = ["spec_reviewer", "implementation_reviewer"];

export type HostRoute = { route: "host"; model?: string };
export type CommandRoute = { route: "command"; model: string; argv: string[]; model_attestation?: "codex-session" };
export type Route = HostRoute | CommandRoute;
export type RoleRoute = { route: "host" | "command"; model?: string; argv?: string[]; model_attestation?: "codex-session" };

export type LoopOperation = "spec" | "spec review" | "tasks" | "implement" | "review" | "ship" | "investigate" | "resume";
const OPERATION_ROLE: Record<Exclude<LoopOperation, "resume">, LoopRole> = {
  spec: "author", tasks: "author", investigate: "author", "spec review": "spec_reviewer",
  implement: "implementer", ship: "implementer", review: "implementation_reviewer",
};

export type LoopSettings = {
  schema_version: 1;
  root: string;
  configured: boolean;
  settings_path: string;
  roles: Record<LoopRole, RoleRoute>;
  /** Directories a shell-enabled reviewer may write to without leaving the review pending. */
  review_scratch: string[];
  /** Local rules every SDD operation reads, named by the repository. */
  project_procedure?: string;
  /** Repository instruction files: read by every operation and checked by every spec review. */
  instruction_files: string[];
  lenses: Lens[];
  verification_rungs: Rung[];
  /** The command run after a merge before a publishing feature is reported delivered. */
  post_merge_watch?: { argv: string[]; no_publication_pattern?: string };
  ci_trigger: "automatic" | "manual";
  /** Extra skip-eligible paths for feature deliveries, honoured only when the resolved delivery convention allows them. */
  skip_ci_paths: string[];
  /** `always` makes invoking investigate the request to write its findings document. */
  findings_document: "on_request" | "always";
  analysis_dir: string;
  /** `isolated` keeps implement out of the primary worktree. */
  implement_worktree: "shared" | "isolated";
};
export type Lens = { name: string; check: string; severity: "blocking" | "should-fix" | "nit" };

export const LOOP_SETTINGS_KEYS = ["schema_version", "roles", "review_scratch", "project_procedure", "instruction_files", "lenses", "verification_rungs", "ci_trigger", "post_merge_watch", "skip_ci_paths", "findings_document", "analysis_dir", "implement_worktree"];
const PLACEHOLDERS = ["{model}", "{prompt}", "{prompt_file}", "{export_dir}"];

function fail(field: string): never { throw Error(`invalid loop settings: ${field}`); }
function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(field);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[], field: string) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(`${field} contains unsupported fields`);
}
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x1f\x7f]/.test(value)) fail(field);
  return value;
}

function directories(root: string, value: unknown, field: string): string[] {
  if (!Array.isArray(value)) fail(field);
  const out = value.map((item, index) => {
    const path = text(item, `${field}[${index}]`).replace(/\/+$/, "");
    try { resolveInside(root, path); } catch { fail(`${field}[${index}]`); }
    if (path === "." || path === "") fail(`${field}[${index}] may not be the whole checkout`);
    return path;
  });
  if (new Set(out).size !== out.length) fail(`${field} duplicates`);
  return out;
}

function file(root: string, value: unknown, field: string): string {
  const path = text(value, field);
  let resolved: string;
  try { resolved = resolveInside(root, path); } catch { fail(field); }
  if (!existsSync(resolved) || !statSync(resolved).isFile()) fail(`${field} must reference a file`);
  return path;
}

function lenses(value: unknown): Lens[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail("lenses");
  const out = value.map((item, index) => {
    const field = `lenses[${index}]`, lens = object(item, field);
    keys(lens, ["name", "check", "severity"], field);
    const name = text(lens.name, `${field}.name`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) fail(`${field}.name`);
    if (lens.severity !== "blocking" && lens.severity !== "should-fix" && lens.severity !== "nit") fail(`${field}.severity`);
    return { name, check: text(lens.check, `${field}.check`), severity: lens.severity };
  });
  if (new Set(out.map(lens => lens.name)).size !== out.length) fail("lenses duplicates");
  return out;
}

function rungs(value: unknown): Rung[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail("verification_rungs");
  const out = value.map((item, index): Rung => {
    const field = `verification_rungs[${index}]`, rung = object(item, field);
    keys(rung, ["name", "when", "command", "procedure", "skipped_pattern"], field);
    const name = text(rung.name, `${field}.name`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) fail(`${field}.name`);
    let when: Rung["when"];
    if (rung.when === "always") when = "always";
    else {
      const condition = object(rung.when, `${field}.when must be always or {paths}`);
      keys(condition, ["paths"], `${field}.when`);
      if (!Array.isArray(condition.paths) || !condition.paths.length) fail(`${field}.when.paths`);
      when = { paths: condition.paths.map((path, i) => text(path, `${field}.when.paths[${i}]`)) };
    }
    if ((rung.command === undefined) === (rung.procedure === undefined)) fail(`${field} needs exactly one of command or procedure`);
    if (rung.skipped_pattern !== undefined) {
      if (rung.command === undefined) fail(`${field}.skipped_pattern needs a command`);
      try { new RegExp(text(rung.skipped_pattern, `${field}.skipped_pattern`)); } catch { fail(`${field}.skipped_pattern`); }
    }
    return { name, when,
      ...(rung.command === undefined ? { procedure: text(rung.procedure, `${field}.procedure`) } : { command: text(rung.command, `${field}.command`) }),
      ...(rung.skipped_pattern === undefined ? {} : { skipped_pattern: rung.skipped_pattern as string }) };
  });
  if (new Set(out.map(rung => rung.name)).size !== out.length) fail("verification_rungs duplicates");
  return out;
}

function watch(value: unknown): LoopSettings["post_merge_watch"] {
  if (value === undefined) return undefined;
  const item = object(value, "post_merge_watch");
  keys(item, ["argv", "no_publication_pattern"], "post_merge_watch");
  if (!Array.isArray(item.argv) || !item.argv.length) fail("post_merge_watch.argv");
  const argv = item.argv.map((part, index) => text(part, `post_merge_watch.argv[${index}]`));
  if (!argv.some(part => part.includes("{merge_sha}"))) fail("post_merge_watch.argv needs {merge_sha}");
  if (item.no_publication_pattern !== undefined) {
    try { new RegExp(text(item.no_publication_pattern, "post_merge_watch.no_publication_pattern")); } catch { fail("post_merge_watch.no_publication_pattern"); }
  }
  return { argv, ...(item.no_publication_pattern === undefined ? {} : { no_publication_pattern: item.no_publication_pattern as string }) };
}

function route(role: LoopRole, value: unknown): RoleRoute {
  const field = `roles.${role}`, item = object(value, field);
  if (item.route !== "host" && item.route !== "command") fail(`${field}.route must be host or command`);
  if (item.route === "host") {
    keys(item, ["route", "model"], field);
    return { route: "host", ...(item.model === undefined ? {} : { model: text(item.model, `${field}.model`) }) };
  }
  if (!REVIEWER_ROLES.includes(role)) fail(`${field}: a command route is only for reviewer roles`);
  keys(item, ["route", "model", "argv", "model_attestation"], field);
  if (item.model_attestation !== undefined && item.model_attestation !== "codex-session") fail(`${field}.model_attestation must be codex-session`);
  const model = text(item.model, `${field}.model`);
  if (!Array.isArray(item.argv) || item.argv.length === 0) fail(`${field}.argv`);
  const argv = item.argv.map((part, index) => text(part, `${field}.argv[${index}]`));
  if (PLACEHOLDERS.some(name => argv[0]!.includes(name))) fail(`${field}.argv[0] must be the executable, not a placeholder`);
  if (!argv.some(part => part.includes("{prompt}") || part.includes("{prompt_file}"))) fail(`${field}.argv needs {prompt} or {prompt_file}`);
  for (const part of argv) for (const name of part.match(/\{[a-z_]+\}/g) ?? [])
    if (!PLACEHOLDERS.includes(name)) fail(`${field}.argv has an unknown placeholder ${name}`);
  if (item.model_attestation === "codex-session" && !argv.includes("--json")) fail(`${field}.argv needs --json for codex-session attestation`);
  return { route: "command", model, argv, ...(item.model_attestation === undefined ? {} : { model_attestation: "codex-session" as const }) };
}

/** The per-user override file: outside every repository, it may only replace a command route's executable. */
export function defaultOverridePath(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  return join(base, "vh-adlc", "loop.local.yaml");
}

function applyOverride(roles: Record<LoopRole, RoleRoute>, path: string) {
  if (!existsSync(path)) return;
  const input = object(readYAML(readFileSync(path), reason => fail(`override ${reason}`)), "override object");
  keys(input, ["schema_version", "roles"], "override");
  if (input.schema_version !== 1) fail("override schema_version must be 1");
  const entries = object(input.roles ?? {}, "override roles");
  keys(entries, LOOP_ROLES, "override roles");
  for (const [role, value] of Object.entries(entries) as [LoopRole, unknown][]) {
    const field = `override roles.${role}`, item = object(value, field);
    keys(item, ["executable"], field);
    const current = roles[role];
    if (current.route !== "command" || !current.argv) fail(`${field}: only a command route has an executable`);
    const executable = text(item.executable, `${field}.executable`);
    if (PLACEHOLDERS.some(name => executable.includes(name))) fail(`${field}.executable`);
    roles[role] = { ...current, argv: [executable, ...current.argv.slice(1)] };
  }
}

/** Reads loop settings for `root`. `overridePath: null` ignores any per-user override. */
export function loadLoopSettings(root: string, options: { settingsPath?: string; overridePath?: string | null } = {}): LoopSettings {
  root = realpathSync(root);
  const inside = (path: string) => { try { return resolveInside(root, path); } catch { fail("settings path"); } };
  const settingsRead = settingsFile({ root, name: "loop", settingsPath: options.settingsPath, inside, fail });
  const input = object(settingsRead.value, "settings object");
  keys(input, LOOP_SETTINGS_KEYS, "settings");
  if (settingsRead.configured && input.schema_version !== 1) fail("schema_version must be 1");
  const declared = input.roles === undefined ? {} : object(input.roles, "roles");
  keys(declared, LOOP_ROLES, "roles");
  const roles = Object.fromEntries(LOOP_ROLES.map(role =>
    [role, declared[role] === undefined ? { route: "host" } : route(role, declared[role])])) as Record<LoopRole, RoleRoute>;
  const overridePath = options.overridePath === undefined ? defaultOverridePath() : options.overridePath;
  if (overridePath !== null) applyOverride(roles, overridePath);
  const review_scratch = input.review_scratch === undefined ? [] : directories(root, input.review_scratch, "review_scratch");
  const instruction_files = input.instruction_files === undefined ? [] : (() => {
    if (!Array.isArray(input.instruction_files)) fail("instruction_files");
    const out = input.instruction_files.map((item, index) => file(root, item, `instruction_files[${index}]`));
    if (new Set(out).size !== out.length) fail("instruction_files duplicates");
    return out;
  })();
  return { schema_version: 1, root, configured: settingsRead.configured, settings_path: settingsRead.path, roles, review_scratch,
    ...(input.project_procedure === undefined ? {} : { project_procedure: file(root, input.project_procedure, "project_procedure") }),
    instruction_files, lenses: lenses(input.lenses), verification_rungs: rungs(input.verification_rungs),
    ...(input.post_merge_watch === undefined ? {} : { post_merge_watch: watch(input.post_merge_watch) }),
    ci_trigger: input.ci_trigger === undefined ? "automatic" : input.ci_trigger === "manual" || input.ci_trigger === "automatic" ? input.ci_trigger : fail("ci_trigger must be automatic or manual"),
    implement_worktree: input.implement_worktree === undefined ? "shared" : input.implement_worktree === "isolated" || input.implement_worktree === "shared" ? input.implement_worktree : fail("implement_worktree must be shared or isolated"),
    findings_document: input.findings_document === undefined ? "on_request" : input.findings_document === "always" || input.findings_document === "on_request" ? input.findings_document : fail("findings_document must be on_request or always"),
    analysis_dir: input.analysis_dir === undefined ? "docs/analysis" : (() => { const dir = text(input.analysis_dir, "analysis_dir").replace(/\/+$/, ""); try { resolveInside(root, dir); } catch { fail("analysis_dir"); } return dir; })(),
    skip_ci_paths: input.skip_ci_paths === undefined ? [] : (Array.isArray(input.skip_ci_paths) ? input.skip_ci_paths.map((p, i) => text(p, `skip_ci_paths[${i}]`)) : fail("skip_ci_paths")) };
}

/** The role and route an operation runs on. Resume follows the operation it continues. */
export function routeFor(settings: LoopSettings, operation: LoopOperation, options: { continues?: Exclude<LoopOperation, "resume"> } = {}): RoleRoute & { role: LoopRole } {
  let target: Exclude<LoopOperation, "resume">;
  if (operation === "resume") {
    if (options.continues === undefined) throw Error("invalid loop route: resume needs the operation it continues");
    target = options.continues;
  } else target = operation;
  const role = OPERATION_ROLE[target];
  if (role === undefined) throw Error(`invalid loop route: unknown operation ${String(target)}`);
  return { role, ...settings.roles[role] };
}
