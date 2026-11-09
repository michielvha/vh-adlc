import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { settingsFile } from "../settings-file";

export type Field = { id: string; name: string; options: string[] };
type FieldSelection = { id?: string; name?: string; options: string[] };
export type Settings = { schema_version: 1; project: string; owner: string; ownerType: "user" | "organization"; number: number; repositories: string[]; fields: FieldSelection[]; page_budget: number };

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected an object");
  return value as Record<string, unknown>;
}
export function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error("unsupported property");
}
export function string(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || /[\r\n\0]/.test(value)) throw new Error("expected a non-empty string");
  return value;
}
export function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("expected an array");
  return value;
}
function strings(value: unknown): string[] {
  const result = list(value).map(string);
  if (!result.length || new Set(result).size !== result.length) throw new Error("expected distinct non-empty values");
  return result;
}
export function parseSettings(value: unknown): Settings {
  const input = object(value);
  keys(input, ["schema_version", "project", "repositories", "fields", "page_budget"]);
  if (input.schema_version !== 1) throw new Error("schema_version must be 1");
  const project = string(input.project);
  const match = /^https:\/\/github\.com\/(orgs|users)\/([A-Za-z0-9-]+)\/projects\/([1-9]\d*)$/.exec(project);
  if (!match || !Number.isSafeInteger(Number(match[3]))) throw new Error("expected a canonical GitHub Projects URL");
  const repositories = strings(input.repositories);
  if (repositories.some(repo => !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo) || [".", ".."].includes(repo.split("/")[1])) || new Set(repositories.map(repo => repo.toLowerCase())).size !== repositories.length) throw new Error("invalid or duplicate repository");
  const fields: FieldSelection[] = list(input.fields ?? []).map(value => {
    const field = object(value);
    keys(field, ["id", "name", "options"]);
    if ((field.id === undefined) === (field.name === undefined)) throw new Error("field needs exactly one id or name");
    return { ...(field.id === undefined ? { name: string(field.name) } : { id: string(field.id) }), options: strings(field.options) };
  });
  if (new Set(fields.map(field => field.id ? `id:${field.id}` : `name:${field.name}`)).size !== fields.length) throw new Error("duplicate field selection");
  const budget = input.page_budget ?? 100;
  if (typeof budget !== "number" || !Number.isSafeInteger(budget) || budget < 1 || budget > 10000) throw new Error("page_budget must be between 1 and 10000");
  return { schema_version: 1, project, ownerType: match[1] === "orgs" ? "organization" : "user", owner: match[2], number: Number(match[3]), repositories, fields, page_budget: budget };
}
export function resolveFields(settings: Settings, available: Field[]): Field[] {
  const result = settings.fields.map(selection => {
    const matches = available.filter(field => selection.id ? field.id === selection.id : field.name === selection.name);
    if (matches.length !== 1) throw new Error("missing or ambiguous project field");
    const field = matches[0];
    if (selection.options.some(option => !field.options.includes(option))) throw new Error("missing project field option");
    return { ...field, options: selection.options };
  });
  if (new Set(result.map(field => field.id)).size !== result.length) throw new Error("conflicting field identities");
  return result;
}
export function loadSettings(root: string): Settings {
  const base = realpathSync(root);
  if (!existsSync(resolve(base, ".vh-adlc/projects.yaml"))) throw new Error("create .vh-adlc/projects.yaml before using Projects");
  const file = settingsFile({ root: base, name: "projects", fail: reason => { throw new Error(reason); }, inside: path => {
    const target = realpathSync(resolve(base, path)), rel = relative(base, target);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`) || rel.split(sep)[0] === ".git") throw new Error("settings path escapes checkout");
    return target;
  } });
  if (!file.configured) throw new Error("create .vh-adlc/projects.yaml before using Projects");
  return parseSettings(file.value);
}
