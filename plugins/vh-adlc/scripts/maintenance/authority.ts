import { posix } from "node:path";
import { git, origin } from "../triage/settings";
import { canonicalJSON, digest, runID } from "./journal";
import { commitID, gitBytes } from "./history";
import type { Settings } from "./types";

export type Grant = { repository: string; hostname: string; branch: string; publication_route: "default-branch-checkout-ff-only";
  report_dir: string; index_paths: string[]; initial_publication: "commit-and-push-before-selection"; same_run_updates: "commit-and-push" | "explicit-request" };
export type Standing = { status: "adopted" | "unadopted" | "invalid"; reason: string; default_branch: string; default_commit: string;
  sources: { path: string; blob: string }[]; grant: Grant | null };
export type PublicationRequest = { repository: string; hostname: string; branch: string; publication_route: string; report_path: string; index_paths: string[] };
export type ReportRequest = { authorized_sweep: boolean; read_only?: boolean; draft_only?: boolean; no_commit?: boolean; no_push?: boolean; no_filesystem?: boolean; commit_report?: boolean; publication?: PublicationRequest };
export type ReportPermission = { save: "chat" | "draft" | "checkout"; commit: boolean; push: boolean; basis: "standing" | "current-request" | "none";
  reason: string; repository: string; hostname: string; branch: string; default_commit: string; report_path: string; index_paths: string[];
  run_id: string; standing: Standing; request: ReportRequest; later_update: boolean; binding: string };
function fail(message: string): never { throw Error(`maintenance authority: ${message}`); }
function object(input: unknown): Record<string, unknown> { if (!input || typeof input !== "object" || Array.isArray(input)) fail("expected object"); return input as Record<string, unknown>; }
function keys(input: Record<string, unknown>, expected: string[]) { if (Object.keys(input).length !== expected.length || expected.some(key => !Object.hasOwn(input, key))) fail("missing or unknown declaration fields"); }
export function repositoryPath(value: unknown, directory = false): string {
  if (typeof value !== "string" || !value || /[\x00-\x1f\x7f\\:*?\[\]{}|]/.test(value) || value.startsWith("/") || value.split("/").some(part => part === ".." || part === ".git" || !part)) fail("invalid contained path");
  const normalized = posix.normalize(value);
  if ((!directory && normalized === ".") || normalized !== value) fail("canonical contained path required");
  return normalized;
}
function branch(root: string, value: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)) fail("invalid default branch");
  git(root, "check-ref-format", `refs/heads/${value}`);
}
function visibleMarkdown(input: string): string {
  let fence: string | null = null;
  return input.replace(/<!--[\s\S]*?-->/g, "").split("\n").map(line => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence = marker[1]; else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null; return ""; }
    return fence || /^(?: {4}|\t)/.test(line) ? "" : line.replace(/`+[^`]*`+/g, "");
  }).join("\n");
}
function links(markdown: string): string[] {
  const visible = visibleMarkdown(markdown), found: string[] = [];
  for (const match of visible.matchAll(/\[[^\]\n]+\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g)) {
    let path = match[1]; if (path.startsWith("./")) path = path.slice(2);
    try { found.push(repositoryPath(path)); } catch { /* External and non-file links grant nothing. */ }
  }
  return [...new Set(found)];
}
function blob(root: string, commit: string, path: string): { text: string; blob: string } | null {
  repositoryPath(path);
  const entries = gitBytes(root, "ls-tree", "-z", commit, "--", path).toString().split("\0").filter(Boolean);
  const match = entries.length === 1 ? entries[0].match(/^(100644|100755) blob ([a-f0-9]+)\t(.+)$/s) : null;
  if (!match || match[3] !== path) return null;
  return { text: gitBytes(root, "show", `${commit}:${path}`).toString(), blob: match[2] };
}
function outputPath(root: string, commit: string, path: string, directory = false) {
  if (path === "." && directory) return;
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index++) {
    const prefix = parts.slice(0, index + 1).join("/"), entry = gitBytes(root, "ls-tree", "-z", commit, "--", prefix).toString();
    if (!entry) return;
    const last = index === parts.length - 1;
    if (last && !directory ? !/^100(?:644|755) blob /.test(entry) : !/^040000 tree /.test(entry)) fail("output has a non-directory or symlink ancestor");
  }
}
function declaration(markdown: string): Grant | null {
  const headings = [...markdown.matchAll(/^## Standing maintenance report publication\s*$/gm)];
  if (!headings.length) return null;
  if (headings.length !== 1) fail("ambiguous publication declaration");
  const section = markdown.slice(headings[0].index! + headings[0][0].length).split(/^## /m)[0];
  const tables = [...section.matchAll(/^\|\s*Field\s*\|\s*Value\s*\|\s*$/gm)];
  if (tables.length !== 1) fail("one declaration table required");
  const lines = section.slice(tables[0].index! + tables[0][0].length).trimStart().split("\n"), input: Record<string, string> = {};
  if (!/^\|\s*:?-+:?\s*\|\s*:?-+:?\s*\|\s*$/.test(lines.shift() ?? "")) fail("declaration table separator required");
  for (const line of lines) {
    if (!line.trim().startsWith("|")) break;
    const row = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
    if (!row) fail("invalid declaration row");
    const key = row[1].replace(/^`|`$/g, ""), value = row[2].replace(/^`|`$/g, "");
    if (Object.hasOwn(input, key)) fail("duplicate declaration field"); input[key] = value;
  }
  keys(input, ["repository", "hostname", "branch", "publication_route", "report_dir", "index_paths", "initial_publication", "same_run_updates"]);
  if (input.publication_route !== "default-branch-checkout-ff-only" || input.initial_publication !== "commit-and-push-before-selection" || !["commit-and-push", "explicit-request"].includes(input.same_run_updates)) fail("unsupported publication route or timing");
  const report_dir = repositoryPath(input.report_dir, true);
  let indexes: unknown; try { indexes = JSON.parse(input.index_paths); } catch { fail("index paths must be JSON"); }
  if (!Array.isArray(indexes)) fail("index paths must be an explicit array");
  const index_paths = indexes.map(item => repositoryPath(item));
  if (new Set(index_paths).size !== index_paths.length) fail("duplicate index paths");
  return { ...input, report_dir, index_paths } as unknown as Grant;
}
export function resolveStanding(config: Settings, observed: { default_branch: string; default_commit: string }): Standing {
  branch(config.root, observed.default_branch);
  const commit = commitID(config.root, observed.default_commit), identity = origin(config.root);
  if (identity.repository.toLowerCase() !== config.repository || identity.hostname !== config.hostname) fail("origin identity changed");
  if (git(config.root, "rev-parse", `refs/remotes/origin/${observed.default_branch}`) !== commit) fail("default commit differs from recorded tracking tip; fetch and reconcile");
  const result: Standing = { status: "unadopted", reason: "committed adoption chain absent", default_branch: observed.default_branch, default_commit: commit, sources: [], grant: null };
  const source = (path: string) => { const data = blob(config.root, commit, path); if (data) result.sources.push({ path, blob: data.blob }); return data?.text ?? null; };
  const agents = source("AGENTS.md");
  if (agents === null || !links(agents).includes(".vh-adlc/maintenance.json")) return result;
  try {
    const raw = source(".vh-adlc/maintenance.json"); if (raw === null) return result;
    const settings = object(JSON.parse(raw));
    const known = ["schema_version", "repository", "hostname", "repositories", "discovery_organizations", "excluded_repositories", "bot_authors", "bot_inventory_terms", "dashboards", "generated_mirrors", "source_references", "backlog_references", "report_dir", "history_dir", "project_procedure", "surface_expectations"];
    if (settings.schema_version !== 1 || Object.keys(settings).some(key => !known.includes(key))) fail("invalid committed settings");
    if (settings.repository !== undefined && settings.repository !== config.repository || settings.hostname !== undefined && settings.hostname !== config.hostname) fail("committed settings identity mismatch");
    if (settings.project_procedure === undefined) return result;
    const procedure = repositoryPath(settings.project_procedure), text = source(procedure); if (text === null) return result;
    const grant = declaration(text); if (!grant) return result;
    if (grant.repository !== config.repository || grant.hostname !== config.hostname || grant.branch !== observed.default_branch || grant.report_dir !== (settings.report_dir ?? ".vh-adlc/reports/maintenance") || grant.report_dir !== config.report_dir) fail("declaration identity, branch or report scope mismatch");
    outputPath(config.root, commit, grant.report_dir, true);
    for (const path of grant.index_paths) outputPath(config.root, commit, path);
    for (const path of links(agents)) if (path !== procedure && path.endsWith(".md")) source(path);
    return { ...result, status: "adopted", reason: "linked committed default-branch declaration", grant };
  } catch { return { ...result, status: "invalid", reason: "invalid or ambiguous committed publication declaration", grant: null }; }
}

export function parseReportRequest(rawRequest: unknown): ReportRequest {
  const request = object(JSON.parse(canonicalJSON(rawRequest))) as unknown as ReportRequest;
  if (Object.keys(request).some(key => !["authorized_sweep", "read_only", "draft_only", "no_commit", "no_push", "no_filesystem", "commit_report", "publication"].includes(key)) || typeof request.authorized_sweep !== "boolean") fail("invalid current request");
  for (const [key, value] of Object.entries(request)) if (key !== "publication" && typeof value !== "boolean") fail("request flags must be boolean");
  if (Object.hasOwn(request, "publication")) object(request.publication);
  return request;
}
export function reportPermission(config: Settings, standing: Standing, rawRequest: ReportRequest | Record<string, unknown>, scope: { run_id: string; report_path: string; later_update?: boolean }): ReportPermission {
  runID(scope.run_id); repositoryPath(scope.report_path);
  const request = parseReportRequest(rawRequest);
  const filename = posix.basename(scope.report_path), directory = posix.dirname(scope.report_path);
  if (directory !== config.report_dir || !new RegExp(`^\\d{4}-\\d{2}-\\d{2}-dependency-sweep(?:-${scope.run_id})?\\.md$`).test(filename)) fail("artifact outside run report scope");
  let adopted = request.authorized_sweep && standing.status === "adopted" && !!standing.grant && (!scope.later_update || standing.grant.same_run_updates === "commit-and-push");
  let explicit = false, indexes: string[] = adopted ? standing.grant!.index_paths : [];
  if (request.publication) {
    const p = object(request.publication);
    try {
      keys(p, ["repository", "hostname", "branch", "publication_route", "report_path", "index_paths"]);
      if (!Array.isArray(p.index_paths)) fail("explicit index paths required");
      const paths = p.index_paths.map(value => repositoryPath(value));
      explicit = p.repository === config.repository && p.hostname === config.hostname && p.branch === standing.default_branch && p.report_path === scope.report_path && p.publication_route === "default-branch-checkout-ff-only" && new Set(paths).size === paths.length;
      if (explicit) indexes = paths;
    } catch { explicit = false; }
    if (!explicit) { adopted = false; indexes = []; }
  }
  const restricted = request.read_only || request.draft_only || request.no_commit || request.no_filesystem;
  const basis = explicit ? "current-request" : adopted ? "standing" : "none";
  const data: Omit<ReportPermission, "binding"> = { save: request.no_filesystem ? "chat" : restricted ? "draft" : "checkout",
    commit: !restricted && (!!request.commit_report || adopted || explicit), push: !restricted && !request.no_push && (adopted || explicit), basis,
    reason: restricted ? "current request restricts report writes" : request.no_push ? "current request forbids push; authorized local commit remains isolated" : basis === "none" ? "no report-publication authority" : "scoped report authority",
    repository: config.repository, hostname: config.hostname, branch: standing.default_branch, default_commit: standing.default_commit, report_path: scope.report_path,
    index_paths: indexes, run_id: scope.run_id, standing, request, later_update: scope.later_update ?? false };
  return { ...data, binding: digest(canonicalJSON(data)) };
}
