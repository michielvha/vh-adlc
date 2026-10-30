import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { relative, sep } from "node:path";
import { origin, resolveInside } from "../triage/settings";
import type { Dashboard, RelatedRepository, Settings, SurfaceExpectation } from "./types";

function fail(field: string): never { throw Error(`invalid maintenance settings: ${field}`); }
function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(field);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], field: string) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(`${field} contains unsupported fields`);
}
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x1f\x7f]/.test(value)) fail(field);
  return value;
}
function list(value: unknown, field: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(field);
  return value;
}
function unique(values: string[], field: string): string[] {
  if (new Set(values).size !== values.length) fail(`${field} duplicates`);
  return values;
}
function strings(value: unknown, field: string): string[] {
  return unique(list(value, field).map(item => text(item, field)), field);
}
function repository(value: unknown, field: string): string {
  const result = text(value, field).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\/[a-z0-9_.-]+$/.test(result) || result.split("/").some(p => p === "." || p === "..")) fail(field);
  return result;
}
function hostname(value: unknown): string {
  const result = text(value, "hostname").toLowerCase();
  if (result.length > 253 || result.split(".").some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) fail("hostname");
  return result;
}
function path(root: string, value: unknown, field: string, kind: "file" | "directory" | "optional-directory"): string {
  const result = text(value, field);
  let resolved: string;
  try { resolved = resolveInside(root, result); } catch { fail(field); }
  if (kind === "file" && (!existsSync(resolved) || !statSync(resolved).isFile())) fail(`${field} must reference a file`);
  if (kind !== "file" && existsSync(resolved) && !statSync(resolved).isDirectory()) fail(`${field} must be a directory`);
  if (kind === "directory" && !existsSync(resolved)) fail(`${field} must reference a directory`);
  return relative(root, resolved).split(sep).join("/") || ".";
}

export function normalizeLogin(login: string): string {
  return login.toLowerCase().replace(/^app\//, "").replace(/\[bot\]$/, "");
}
export function classifyAuthor(config: Settings, login: string, type: string): "configured" | "gap" | "other" {
  if (config.bot_authors.includes(normalizeLogin(login))) return "configured";
  if (["bot", "app"].includes(type.toLowerCase()) || /^app\//i.test(login) || /\[bot\]$/i.test(login) ||
      config.bot_inventory_terms.some(term => login.toLowerCase().includes(term))) return "gap";
  return "other";
}

export function loadSettings(root: string, options: { settingsPath?: string } = {}): Settings {
  root = realpathSync(root);
  let identity: { repository: string; hostname: string };
  try { identity = origin(root); } catch { fail("origin identity"); }
  identity = { repository: repository(identity.repository, "origin repository"), hostname: hostname(identity.hostname) };
  let settingsFile: string;
  try { settingsFile = resolveInside(root, options.settingsPath ?? ".vh-adlc/maintenance.json"); } catch { fail("settings path"); }
  const configured = existsSync(settingsFile);
  let input: Record<string, unknown> = {};
  if (configured) {
    try { input = object(JSON.parse(readFileSync(settingsFile, "utf8")), "settings object"); }
    catch { fail("readable JSON object required"); }
  } else if (options.settingsPath !== undefined) fail("requested settings file missing");
  keys(input, ["schema_version", "repository", "hostname", "repositories", "discovery_organizations", "excluded_repositories",
    "bot_authors", "bot_inventory_terms", "dashboards", "generated_mirrors", "source_references", "backlog_references",
    "report_dir", "history_dir", "project_procedure", "surface_expectations"], "settings");
  if (configured && input.schema_version !== 1) fail("schema_version must be 1");
  if (input.repository !== undefined && repository(input.repository, "repository") !== identity.repository) fail("repository conflicts with origin");
  if (input.hostname !== undefined && hostname(input.hostname) !== identity.hostname) fail("hostname conflicts with origin");
  if (identity.hostname !== "github.com" && input.hostname === undefined) fail("nonstandard GitHub hostname requires explicit identity");

  const repositories: RelatedRepository[] = list(input.repositories, "repositories").map(value => {
    const item = object(value, "repositories"); keys(item, ["repository", "role", "sync_workflow"], "repositories");
    const repo = repository(item.repository, "related repository");
    if (item.role !== "synced" && item.role !== "independent") fail("repository role");
    if (item.role === "synced" && item.sync_workflow === undefined) fail("synced repository requires sync_workflow");
    return { repository: repo, role: item.role,
      ...(item.sync_workflow === undefined ? {} : { sync_workflow: path(root, item.sync_workflow, "sync_workflow", "file") }) };
  });
  const allowed = unique([identity.repository, ...repositories.map(item => item.repository)], "repository identities");
  const scopedRepository = (value: unknown, field: string) => {
    const repo = repository(value, field); if (!allowed.includes(repo)) fail(`${field} outside configured scope`); return repo;
  };
  const excluded = unique(list(input.excluded_repositories, "excluded_repositories").map(value => repository(value, "excluded repository")), "excluded_repositories");
  if (excluded.some(repo => allowed.includes(repo))) fail("excluded repository conflicts with active role");
  const dashboards: Dashboard[] = list(input.dashboards, "dashboards").map(value => {
    const item = object(value, "dashboard"); keys(item, ["repository", "issue", "title"], "dashboard");
    if ((item.issue === undefined) === (item.title === undefined)) fail("dashboard requires exactly one issue or title");
    if (item.issue !== undefined && (!Number.isSafeInteger(item.issue) || (item.issue as number) <= 0)) fail("dashboard issue");
    return { repository: scopedRepository(item.repository, "dashboard repository"),
      ...(item.issue === undefined ? { title: text(item.title, "dashboard title") } : { issue: item.issue as number }) };
  });
  unique(dashboards.map(item => `${item.repository}:${item.issue ?? item.title}`), "dashboards");
  const surface_expectations: SurfaceExpectation[] = list(input.surface_expectations, "surface_expectations").map(value => {
    const item = object(value, "surface expectation");
    keys(item, ["repository", "surface", "status", "message_contains", "reason", "evidence"], "surface expectation");
    if (item.surface !== "code_scanning") fail("surface expectation surface");
    if (!Number.isSafeInteger(item.status) || (item.status as number) < 400 || (item.status as number) > 599) fail("surface expectation status");
    return { repository: scopedRepository(item.repository, "surface expectation repository"), surface: "code_scanning", status: item.status as number,
      message_contains: text(item.message_contains, "surface expectation message"), reason: text(item.reason, "surface expectation reason"),
      evidence: path(root, item.evidence, "surface expectation evidence", "file") };
  });
  unique(surface_expectations.map(item => `${item.repository}:${item.status}:${item.message_contains}`), "surface_expectations");
  const authors = unique((input.bot_authors === undefined ? ["renovate", "dependabot"] : strings(input.bot_authors, "bot_authors"))
    .map(value => normalizeLogin(value)), "normalized bot_authors");
  if (authors.some(value => !/^[a-z0-9][a-z0-9-]*$/.test(value))) fail("bot_authors login");
  const organizations = strings(input.discovery_organizations, "discovery_organizations").map(value => value.toLowerCase());
  if (organizations.some(value => !/^[a-z0-9][a-z0-9-]*$/.test(value))) fail("discovery organization");
  unique(organizations, "discovery_organizations");
  const report_dir = path(root, input.report_dir ?? ".vh-adlc/reports/maintenance", "report_dir", "optional-directory");
  const history_dir = path(root, input.history_dir ?? report_dir, "history_dir", "optional-directory");
  return { schema_version: 1, root, configured, settings_path: relative(root, settingsFile).split(sep).join("/"), ...identity,
    repositories, discovery_organizations: organizations, excluded_repositories: excluded, bot_authors: authors,
    bot_inventory_terms: strings(input.bot_inventory_terms, "bot_inventory_terms").map(value => value.toLowerCase()), dashboards,
    generated_mirrors: strings(input.generated_mirrors, "generated_mirrors").map(value => path(root, value, "generated mirror", "optional-directory")),
    source_references: strings(input.source_references, "source_references").map(value => path(root, value, "source reference", "file")),
    backlog_references: strings(input.backlog_references, "backlog_references").map(value => path(root, value, "backlog reference", "file")),
    report_dir, history_dir,
    ...(input.project_procedure === undefined ? {} : { project_procedure: path(root, input.project_procedure, "project_procedure", "file") }),
    surface_expectations };
}
