import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { git, origin, resolveInside } from "../triage/settings";
import { settingsFile, readYAML } from "../settings-file";
import type { Profile, Settings } from "./types";

export class AuditSettingsError extends Error {
  constructor(readonly code: string, message: string) { super(`${code}: ${message}`); }
}
export function invalid(field: string): never {
  throw new AuditSettingsError("settings-invalid", "invalid audit settings: " + field);
}
export function settingsFailure(error: unknown, fallback: string): string {
  return error instanceof AuditSettingsError ? error.code : fallback;
}
function readerFailure(reason: string): never {
  const code = reason.startsWith("binary unavailable:") ? "settings-reader-unavailable"
    : reason.startsWith("settings file refused:") ? "settings-reader-refused"
    : reason.startsWith(".vh-adlc/audit.") && reason.includes("is not read") ? "settings-suffix-conflict" : "settings-invalid";
  throw new AuditSettingsError(code, "invalid audit settings: " + reason);
}
/** Parse bytes without installing or refreshing anything; callers validate their own source tree. */
export function readAuditYAML(bytes: Uint8Array): unknown {
  return readYAML(bytes, readerFailure, { offline: true });
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
  if (isAbsolute(path) || path.split(/[\\/]/).some(part => part.toLowerCase() === ".git")) invalid(field);
  let absolute: string;
  try { absolute = resolveInside(root, path); } catch { invalid(field); }
  if (!existsSync(absolute) || !statSync(absolute).isFile()) invalid(field + " must reference an existing file");
  const normalized = relative(root, absolute).split(sep).join("/");
  if (normalized.split("/").some(part => part.toLowerCase() === ".git")) invalid(field);
  return normalized;
}

/** Reading settings performs no setup, permission refresh, or filesystem mutation. */
export function loadSettings(directory: string, options: { settingsPath?: string } = {}): Settings {
  const root = realpathSync(directory);
  let identity: { repository: string; hostname: string };
  try { identity = auditOrigin(root); } catch { invalid("origin"); }
  const repository = identity.repository.toLowerCase(), hostname = identity.hostname.toLowerCase();
  const loaded = settingsFile({ root, name: "audit", settingsPath: options.settingsPath, offline: true,
    inside: path => { try { return resolveInside(root, path); } catch { invalid("settings path"); } }, fail: readerFailure });
  if (!loaded.configured) throw Error("audit setup required: create the documented audit YAML settings and ledger");
  return settingsFromValue(loaded.value, { root, repository, hostname }, loaded.path, (value, field) => file(root, value, field));
}

/** The same schema applies to working files and exact committed blobs. */
export function settingsFromValue(value: unknown, identity: { root: string; repository: string; hostname: string },
  requested: string, resolveFile: (value: unknown, field: string) => string): Settings {
  const { root, repository, hostname } = identity, input = object(value, "settings object");
  keys(input, ["schema_version", "repository", "hostname", "ledger_path", "project_procedure", "id_prefix", "profile"], "settings");
  if (input.schema_version !== 1) invalid("schema_version must be 1");
  if (input.repository !== undefined && text(input.repository, "repository").toLowerCase() !== repository) invalid("repository conflicts with origin");
  if (input.hostname !== undefined && text(input.hostname, "hostname").toLowerCase() !== hostname) invalid("hostname conflicts with origin");
  if (hostname !== "github.com" && input.hostname === undefined) invalid("nonstandard hostname must be explicit");
  const id_prefix = text(input.id_prefix, "id_prefix");
  if (!/^[A-Z][A-Z0-9]{0,15}$/.test(id_prefix)) invalid("id_prefix must be uppercase letters/digits");
  const profile = object(input.profile, "profile");
  keys(profile, ["name", "index_heading", "finding_level", "severity_sections", "required_index_columns", "workstream_heading", "section_note_headings"], "profile");
  if (profile.name !== "markdown-audit-v1") invalid("unsupported profile");
  if (!Number.isInteger(profile.finding_level) || Number(profile.finding_level) < 2 || Number(profile.finding_level) > 6) invalid("finding_level");
  const layout:Partial<Profile>={};
  if(profile.severity_sections!==undefined){
    const values=object(profile.severity_sections,"severity_sections");if(!Object.keys(values).length)invalid("severity_sections");
    layout.severity_sections=Object.fromEntries(Object.entries(values).map(([key,value])=>{text(key,"severity name");if(["__proto__","constructor","prototype"].includes(key))invalid("severity name");return [key,text(value,"severity section")];}));
  }
  for(const key of ["required_index_columns","section_note_headings"] as const)if(profile[key]!==undefined){
    const values=profile[key];if(!Array.isArray(values)||!values.length||new Set(values.map(value=>text(value,key).toLowerCase())).size!==values.length)invalid(key);
    if(key==="required_index_columns"&&values.some(value=>/^(ID|Sev|Severity|Status|State|Title|Finding|Description)$/i.test(value)))invalid(key);
    layout[key]=values.map(value=>text(value,key));
  }
  if(profile.workstream_heading!==undefined)layout.workstream_heading=text(profile.workstream_heading,"workstream_heading");
  return {
    schema_version: 1, root, repository, hostname,
    settings_path: resolveFile(requested, "settings path"),
    ledger_path: resolveFile(input.ledger_path, "ledger_path"),
    project_procedure: resolveFile(input.project_procedure, "project_procedure"),
    id_prefix,
    profile: {
      name: "markdown-audit-v1",
      index_heading: text(profile.index_heading, "index_heading"),
      finding_level: Number(profile.finding_level),
      ...layout,
    },
  };
}
