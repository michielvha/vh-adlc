// Loop settings: which route each loop role runs on, read from a repository's
// `.vh-adlc/loop.yaml` through the verified strict reader. A repository without
// the file keeps the host default for every role. The reference is
// references/loop-settings.md.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readYAML, settingsFile } from "../settings-file";
import { resolveInside } from "../triage/settings";

export const LOOP_ROLES = ["author", "implementer", "spec_reviewer", "implementation_reviewer"] as const;
export type LoopRole = typeof LOOP_ROLES[number];
const REVIEWER_ROLES: readonly LoopRole[] = ["spec_reviewer", "implementation_reviewer"];

export type HostRoute = { route: "host"; model?: string };
export type CommandRoute = { route: "command"; model: string; argv: string[] };
export type Route = HostRoute | CommandRoute;
export type RoleRoute = { route: "host" | "command"; model?: string; argv?: string[] };

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
};

export const LOOP_SETTINGS_KEYS = ["schema_version", "roles", "review_scratch"];
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

function route(role: LoopRole, value: unknown): RoleRoute {
  const field = `roles.${role}`, item = object(value, field);
  if (item.route !== "host" && item.route !== "command") fail(`${field}.route must be host or command`);
  if (item.route === "host") {
    keys(item, ["route", "model"], field);
    return { route: "host", ...(item.model === undefined ? {} : { model: text(item.model, `${field}.model`) }) };
  }
  if (!REVIEWER_ROLES.includes(role)) fail(`${field}: a command route is only for reviewer roles`);
  keys(item, ["route", "model", "argv"], field);
  const model = text(item.model, `${field}.model`);
  if (!Array.isArray(item.argv) || item.argv.length === 0) fail(`${field}.argv`);
  const argv = item.argv.map((part, index) => text(part, `${field}.argv[${index}]`));
  if (PLACEHOLDERS.some(name => argv[0]!.includes(name))) fail(`${field}.argv[0] must be the executable, not a placeholder`);
  if (!argv.some(part => part.includes("{prompt}") || part.includes("{prompt_file}"))) fail(`${field}.argv needs {prompt} or {prompt_file}`);
  for (const part of argv) for (const name of part.match(/\{[a-z_]+\}/g) ?? [])
    if (!PLACEHOLDERS.includes(name)) fail(`${field}.argv has an unknown placeholder ${name}`);
  return { route: "command", model, argv };
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
  const file = settingsFile({ root, name: "loop", settingsPath: options.settingsPath, inside, fail });
  const input = object(file.value, "settings object");
  keys(input, LOOP_SETTINGS_KEYS, "settings");
  if (file.configured && input.schema_version !== 1) fail("schema_version must be 1");
  const declared = input.roles === undefined ? {} : object(input.roles, "roles");
  keys(declared, LOOP_ROLES, "roles");
  const roles = Object.fromEntries(LOOP_ROLES.map(role =>
    [role, declared[role] === undefined ? { route: "host" } : route(role, declared[role])])) as Record<LoopRole, RoleRoute>;
  const overridePath = options.overridePath === undefined ? defaultOverridePath() : options.overridePath;
  if (overridePath !== null) applyOverride(roles, overridePath);
  const review_scratch = input.review_scratch === undefined ? [] : directories(root, input.review_scratch, "review_scratch");
  return { schema_version: 1, root, configured: file.configured, settings_path: file.path, roles, review_scratch };
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
