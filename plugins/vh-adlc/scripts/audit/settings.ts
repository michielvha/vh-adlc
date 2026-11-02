import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { relative, sep } from "node:path";
import { git, origin, resolveInside } from "../triage/settings";
import type { Settings } from "./types";

export function invalid(field: string): never {
  throw Error("invalid audit settings: " + field);
}
export function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}
export function keys(value: Record<string, unknown>, allowed: readonly string[], field: string) {
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid(field + " has unsupported fields");
}
export function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) invalid(field);
  return value;
}
/** A public repository-owner login is transport metadata, never an auth/effect grant. */
export function auditOrigin(root: string): { repository: string; hostname: string } {
  try { return origin(root); } catch { /* Keep the neutral parser unchanged; handle only this bounded form. */ }
  let url: URL;
  try { url = new URL(git(root, "remote", "get-url", "origin")); } catch { invalid("origin"); }
  const repository = url.pathname.replace(/^\//, "").replace(/\.git$/, "");
  if (url.protocol !== "https:" || url.password || url.port || url.search || url.hash ||
      !/^[A-Za-z0-9-]{1,39}$/.test(url.username) || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
      repository.split("/").some(part => [".", ".."].includes(part)) || url.username.toLowerCase() !== repository.split("/")[0].toLowerCase()) invalid("origin");
  return { repository, hostname: url.hostname.toLowerCase() };
}
function file(root: string, value: unknown, field: string): string {
  const path = text(value, field);
  if (path.split("/").includes(".git")) invalid(field);
  let absolute: string;
  try { absolute = resolveInside(root, path); } catch { invalid(field); }
  if (!existsSync(absolute) || !statSync(absolute).isFile()) invalid(field + " must reference an existing file");
  return relative(root, absolute).split(sep).join("/");
}

/** Reading settings performs no setup, permission refresh, or filesystem mutation. */
export function loadSettings(directory: string, options: { settingsPath?: string } = {}): Settings {
  const root = realpathSync(directory);
  let identity: { repository: string; hostname: string };
  try { identity = auditOrigin(root); } catch { invalid("origin"); }
  const repository = identity.repository.toLowerCase(), hostname = identity.hostname.toLowerCase();
  const requested = options.settingsPath ?? ".vh-adlc/audit.json";
  let settingsFile: string;
  try { settingsFile = resolveInside(root, requested); } catch { invalid("settings path"); }
  if (!existsSync(settingsFile)) throw Error("audit setup required: create the documented audit settings and ledger");
  let input: Record<string, unknown>;
  try { input = object(JSON.parse(readFileSync(settingsFile, "utf8")), "settings object"); }
  catch { invalid("readable JSON object required"); }
  keys(input, ["schema_version", "repository", "hostname", "ledger_path", "project_procedure", "id_prefix", "profile"], "settings");
  if (input.schema_version !== 1) invalid("schema_version must be 1");
  if (input.repository !== undefined && text(input.repository, "repository").toLowerCase() !== repository) invalid("repository conflicts with origin");
  if (input.hostname !== undefined && text(input.hostname, "hostname").toLowerCase() !== hostname) invalid("hostname conflicts with origin");
  if (hostname !== "github.com" && input.hostname === undefined) invalid("nonstandard hostname must be explicit");
  const id_prefix = text(input.id_prefix, "id_prefix");
  if (!/^[A-Z][A-Z0-9]{0,15}$/.test(id_prefix)) invalid("id_prefix must be uppercase letters/digits");
  const profile = object(input.profile, "profile");
  keys(profile, ["name", "index_heading", "finding_level"], "profile");
  if (profile.name !== "markdown-audit-v1") invalid("unsupported profile");
  if (!Number.isInteger(profile.finding_level) || Number(profile.finding_level) < 2 || Number(profile.finding_level) > 6) invalid("finding_level");
  return {
    schema_version: 1, root, repository, hostname,
    settings_path: file(root, requested, "settings path"),
    ledger_path: file(root, input.ledger_path, "ledger_path"),
    project_procedure: file(root, input.project_procedure, "project_procedure"),
    id_prefix,
    profile: {
      name: "markdown-audit-v1",
      index_heading: text(profile.index_heading, "index_heading"),
      finding_level: Number(profile.finding_level),
    },
  };
}
