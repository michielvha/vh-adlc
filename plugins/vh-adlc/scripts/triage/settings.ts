import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { Settings } from "./types";

function fail(field: string): never { throw new Error(`invalid triage settings: ${field}`); }
function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(field);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], field: string) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail(`${field} has unsupported fields`);
}
function string(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || /[\r\n\0]/.test(value)) fail(field);
  return value;
}
function strings(value: unknown, fallback: string[], field: string): string[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value)) fail(field);
  return [...new Set(value.map((item) => string(item, field)))];
}
function ids(value: unknown, field: string): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((id) => !Number.isSafeInteger(id) || id <= 0)) fail(field);
  return [...new Set(value as number[])];
}
function positive(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) fail(field);
  return value as number;
}

export function git(root: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`triage cannot read repository ${args[0]}`);
  return result.stdout.toString().trim();
}

/** Resolve an existing ancestor as well as the requested suffix, so symlinks cannot escape. */
export function resolveInside(root: string, path: string): string {
  if (!path || isAbsolute(path) || path.includes("\\") || path.split("/").includes("..") || path.includes("\0")) fail("repository path");
  const base = realpathSync(root), result = resolve(base, path);
  if (relative(base, result).split(sep)[0] === ".git") fail("Git metadata is not a triage path");
  let ancestor = result;
  while (true) {
    try { lstatSync(ancestor); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || ancestor === dirname(ancestor)) fail("repository path");
      ancestor = dirname(ancestor);
    }
  }
  let canonical: string;
  try { canonical = realpathSync(ancestor); } catch { fail("repository path"); }
  const rel = relative(base, canonical);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("repository path escapes checkout");
  const completed = resolve(canonical, relative(ancestor, result));
  if (relative(base, completed).split(sep)[0] === ".git") fail("Git metadata is not a triage path");
  return completed;
}

function origin(root: string): { repository: string; hostname: string } {
  let remote = git(root, "remote", "get-url", "origin");
  const scp = remote.match(/^git@([A-Za-z0-9.-]+):([^?#]+)$/);
  if (scp) remote = `ssh://git@${scp[1]}/${scp[2]}`;
  let url: URL;
  try { url = new URL(remote); } catch { fail("origin must identify a GitHub repository"); }
  if (!["https:", "ssh:"].includes(url.protocol) || url.password || url.search || url.hash || url.port ||
      (url.protocol === "https:" && url.username) || (url.protocol === "ssh:" && url.username !== "git")) fail("origin URL");
  const repository = url.pathname.replace(/^\//, "").replace(/\.git$/, "");
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.split("/").some((part) => [".", ".."].includes(part))) fail("origin repository");
  return { repository, hostname: url.hostname.toLowerCase() };
}

export function loadSettings(root: string, options: { settingsPath?: string } = {}): Settings {
  root = realpathSync(root);
  const identity = origin(root), path = resolveInside(root, options.settingsPath ?? ".vh-adlc/triage.json");
  let input: Record<string, unknown> = {}, configured = false;
  if (existsSync(path)) {
    let data: unknown;
    try { data = JSON.parse(readFileSync(path, "utf8")); } catch { fail("settings must be readable JSON"); }
    input = object(data, "settings must be an object"); configured = true;
  } else if (options.settingsPath !== undefined) fail("requested settings file is missing");
  keys(input, ["schema_version", "repository", "hostname", "source_roots", "generated_mirrors", "plan_roots", "plan_fields",
    "report_dir", "protected_ids", "index_ids", "index_rules", "bot_authors", "owned_labels", "label_map",
    "priority_order", "milestone_order", "stale_days", "page_budget"], "settings");
  if (configured && input.schema_version !== 1) fail("schema_version must be 1");
  if (input.repository !== undefined && string(input.repository, "repository").toLowerCase() !== identity.repository.toLowerCase()) fail("repository conflicts with origin");
  if (input.hostname !== undefined && string(input.hostname, "hostname").toLowerCase() !== identity.hostname) fail("hostname conflicts with origin");
  const fields = input.plan_fields === undefined ? {} : object(input.plan_fields, "plan_fields");
  const fieldNames = ["issue", "status", "status_description", "priority"] as const;
  keys(fields, [...fieldNames], "plan_fields");
  const plan_fields = Object.fromEntries(fieldNames.map((name) => [name, fields[name] === undefined ? name : string(fields[name], `plan_fields.${name}`)])) as Settings["plan_fields"];
  if (new Set(Object.values(plan_fields)).size !== fieldNames.length || Object.values(plan_fields).some((name) => !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name))) fail("plan_fields must be distinct metadata keys");
  const rules = input.index_rules === undefined ? {} : object(input.index_rules, "index_rules");
  keys(rules, ["labels", "title_prefixes"], "index_rules");
  const labels = input.label_map === undefined ? {} : object(input.label_map, "label_map");
  const label_map: Record<string, string> = {};
  for (const [name, value] of Object.entries(labels)) label_map[name] = string(value, "label_map");
  const config: Settings = {
    schema_version: 1, root, configured, ...identity,
    source_roots: strings(input.source_roots, ["."], "source_roots"), generated_mirrors: strings(input.generated_mirrors, [], "generated_mirrors"),
    plan_roots: strings(input.plan_roots, [], "plan_roots"), plan_fields,
    report_dir: input.report_dir === undefined ? ".vh-adlc/reports/triage" : string(input.report_dir, "report_dir"),
    protected_ids: ids(input.protected_ids, "protected_ids"), index_ids: ids(input.index_ids, "index_ids"),
    index_rules: { labels: strings(rules.labels, [], "index_rules.labels"), title_prefixes: strings(rules.title_prefixes, [], "index_rules.title_prefixes") },
    bot_authors: strings(input.bot_authors, [], "bot_authors"), owned_labels: strings(input.owned_labels, [], "owned_labels"), label_map,
    priority_order: strings(input.priority_order, [], "priority_order"), milestone_order: strings(input.milestone_order, [], "milestone_order"),
    stale_days: input.stale_days === undefined ? 90 : positive(input.stale_days, "stale_days"),
    page_budget: input.page_budget === undefined ? null : positive(input.page_budget, "page_budget"),
  };
  if (!config.source_roots.length) fail("source_roots must not be empty");
  for (const path of [...config.source_roots, ...config.generated_mirrors, ...config.plan_roots, config.report_dir]) resolveInside(root, path);
  for (const path of [...config.source_roots, ...config.plan_roots]) if (!existsSync(resolveInside(root, path))) fail("declared source/plan root is missing");
  const canonical = (path: string) => relative(root, resolveInside(root, path)).split(sep).join("/") || ".";
  config.source_roots = config.source_roots.map(canonical);
  config.generated_mirrors = config.generated_mirrors.map(canonical);
  config.plan_roots = config.plan_roots.map(canonical);
  config.report_dir = canonical(config.report_dir);
  return config;
}

function under(path: string, directory: string): boolean {
  return directory === "." || path === directory || path.startsWith(`${directory.replace(/\/$/, "")}/`);
}

export function sourcePath(config: Settings, path: string): boolean {
  let normalized: string;
  try { normalized = relative(config.root, resolveInside(config.root, path)).split(sep).join("/"); } catch { return false; }
  return !under(normalized, ".git") && !under(normalized, ".vh-adlc") &&
    !config.generated_mirrors.some((mirror) => under(normalized, mirror)) && config.source_roots.some((root) => under(normalized, root));
}

export function ownership(issue: { number: number; author: string; labels: string[]; title: string }, config: Settings, evidencedIndex = false): "protected" | "index" | "eligible" {
  if (config.protected_ids.includes(issue.number) || config.bot_authors.some((author) => author.toLowerCase() === issue.author.toLowerCase()) ||
      issue.labels.some((label) => config.owned_labels.includes(label))) return "protected";
  if (evidencedIndex || config.index_ids.includes(issue.number) || issue.labels.some((label) => config.index_rules.labels.includes(label)) ||
      config.index_rules.title_prefixes.some((prefix) => issue.title.startsWith(prefix))) return "index";
  return "eligible";
}
