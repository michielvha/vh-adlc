import { createGitHubReader, GitHubReadError, type GitHubReader, type PageResult, type ReadObservation } from "../github-read";
import { git } from "../triage/settings";
import { classifyAuthor } from "./settings";
import type { Settings } from "./types";
import { canonicalJSON, digest } from "./journal";
import { createMaintenanceReader } from "./cursor-reader";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { WRITABLE, type Output } from "../security-settings/security-settings";

export type Coverage = { status: "complete" | "complete-unavailable" | "incomplete"; pages: number; count: number | null; reason?: string; http_status?: number | null };
export type AlertContext = { identity: string; advisory_ids: string[]; ecosystem: string | null; installed_version: string | null;
  affected_range: string | null; fixed_versions: string[]; scope: string | null; relationship: string | null;
  raw_digest: string; raw: Record<string, unknown> };
export type Alert = { number: number; state: "open"; package: string | null; manifest: string | null; severity: string; rule?: string; description: string; context?: AlertContext };
export type AlertReference = { hostname: string; repository: string; surface: "dependabot" | "code_scanning"; number: number };
export type TerminalObservation = AlertReference & { state: string; reason: string | null; status: "complete" | "incomplete"; observed_at: string; raw_digest: string | null; raw: Record<string, unknown> | null };

function optionalText(value: unknown): string | null { return value === undefined || value === null ? null : text(value); }
export function alertContext(row: Record<string, unknown>, hostname: string, repository: string, surface: string): AlertContext {
  const dependency = row.dependency === undefined ? {} : object(row.dependency), pkg = dependency.package === undefined ? {} : object(dependency.package);
  const advisory = row.security_advisory === undefined ? {} : object(row.security_advisory);
  const vulnerability = row.security_vulnerability === undefined ? {} : object(row.security_vulnerability);
  const patched = vulnerability.first_patched_version === undefined || vulnerability.first_patched_version === null ? null : optionalText(object(vulnerability.first_patched_version).identifier);
  return { identity: `${hostname}/${repository}/${surface}:${number(row.number)}`, advisory_ids: [...new Set([optionalText(advisory.cve_id), optionalText(advisory.ghsa_id)].filter((v): v is string => v !== null))].sort(),
    ecosystem: optionalText(pkg.ecosystem), installed_version: optionalText(dependency.version_requirement), affected_range: optionalText(vulnerability.vulnerable_version_range),
    fixed_versions: patched ? [patched] : [], scope: optionalText(dependency.scope), relationship: optionalText(dependency.relationship), raw_digest: digest(canonicalJSON(row)), raw: row };
}

/** Exact known identities only. These reads classify absence; they never dismiss or resolve alerts. */
export function collectTerminal(config: Settings, prior: AlertReference[], options: { reader?: GitHubReader } = {}): TerminalObservation[] {
  const allowed = new Set([config.repository, ...config.repositories.map(row => row.repository)]), seen = new Set<string>();
  for (const ref of prior) {
    if (ref.hostname !== config.hostname || !allowed.has(ref.repository) || !["dependabot", "code_scanning"].includes(ref.surface)) throw Error("terminal identity outside maintenance scope");
    number(ref.number); const key = `${ref.repository}/${ref.surface}:${ref.number}`;
    if (seen.has(key)) throw Error("duplicate terminal identity"); seen.add(key);
  }
  const reader = options.reader ?? createMaintenanceReader(config.hostname);
  return prior.map(ref => {
    const observed_at = new Date().toISOString();
    try {
      const endpoint = ref.surface === "dependabot" ? "dependabot" : "code-scanning";
      const raw = object(reader.get(`repos/${ref.repository}/${endpoint}/alerts/${ref.number}`));
      if (number(raw.number) !== ref.number || !["open", "fixed", "dismissed", "auto_dismissed"].includes(String(raw.state))) throw Error("unsupported or changed terminal identity/state");
      return { ...ref, state: text(raw.state), reason: optionalText(raw.dismissed_reason), status: "complete" as const, observed_at, raw_digest: digest(canonicalJSON(raw)), raw };
    } catch (error) {
      return { ...ref, state: "unknown", reason: error instanceof GitHubReadError ? error.apiMessage : error instanceof Error ? error.message : "terminal unavailable", status: "incomplete" as const, observed_at, raw_digest: null, raw: null };
    }
  });
}
export type Pull = {
  repository: string; number: number; title: string; body: string; state: string; draft: boolean;
  author: { login: string; type: string }; author_class: "configured" | "gap" | "other";
  head: string; base: string; base_ref: string;
  files: { filename: string; status: string; previous_filename?: string; patch?: string }[];
  checks: Record<string, unknown>[]; statuses: Record<string, unknown>[]; evidence: Coverage;
  security?: boolean;
};
export function isSecurityPull(value:{title:string;security?:boolean}):boolean{return value.security===true||/\[security\]/i.test(value.title);}
export type Access = { visibility: string | null; admin: boolean | null; security_and_analysis: Record<string, unknown> | null };
export type RepositoryInventory = {
  repository: string; identity?: { id: number; default_branch: string }; access?: Access;
  pulls: Pull[]; dashboards: { number: number; title: string; body: string; state: string }[];
  dependabot: { alerts: Alert[] | null; coverage: Coverage }; code_scanning: { alerts: Alert[] | null; coverage: Coverage };
  coverage: { identity: Coverage; pulls: Coverage; dashboards: Coverage };
};
export type Inventory = {
  schema_version: 1; hostname: string; repository: string; source_commit: string; collected_at: string;
  requests: ReadObservation[];
  scope: { repositories: string[]; pull?: number }; repositories: RepositoryInventory[];
  discovery: { organization: string; coverage: Coverage; repositories: { repository: string; archived: boolean; excluded: boolean; inventory_gap: boolean }[] }[];
  terminal?: TerminalObservation[];
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("expected object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== "string") throw Error("expected text"); return value; }
function number(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) <= 0) throw Error("invalid identity"); return Number(value); }
function sha(value: unknown): string { const result = text(value); if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(result)) throw Error("invalid commit identity"); return result; }
function filename(value: unknown): string {
  const result = text(value);
  if (!result || result.startsWith("/") || result.includes("\0") || result.split("/").includes("..")) throw Error("invalid changed-file path");
  return result;
}
function failure(error: unknown, pages = 0): Coverage {
  return { status: "incomplete", pages, count: null,
    reason: error instanceof GitHubReadError ? error.apiMessage : error instanceof Error ? error.message : "Read failed",
    ...(error instanceof GitHubReadError ? { http_status: error.status } : {}) };
}
function coverage(result: PageResult, count: number): Coverage {
  return result.complete ? { status: "complete", pages: result.pages, count }
    : { status: "incomplete", pages: result.pages, count: null, reason: result.error?.message ?? "Incomplete collection", http_status: result.error?.status };
}
function author(value: unknown): { login: string; type: string } {
  if (value === null) return { login: "[deleted]", type: "Unknown" };
  const row = object(value); return { login: text(row.login), type: text(row.type) };
}
function uniqueRows<T>(items: unknown[], normalize: (item: unknown) => T, key: (item: T) => string): { rows: T[]; error?: unknown } {
  const rows: T[] = [], seen = new Set<string>(); let error: unknown;
  for (const item of items) {
    try {
      const row = normalize(item), id = key(row);
      if (seen.has(id)) throw Error("duplicate observation across pages");
      seen.add(id); rows.push(row);
    } catch (caught) { error ??= caught; }
  }
  return { rows, ...(error === undefined ? {} : { error }) };
}

function paidScanning(access: Access) {
  return ["advanced_security", "code_security"].some(name => {
    const feature = access.security_and_analysis?.[name];
    return !!feature && typeof feature === "object" && (feature as Record<string, unknown>).status === "enabled";
  });
}
/** A 403 or 404 code scanning read on a private or internal github.com repository that cannot have the paid feature. */
function freeUnavailable(config: Settings, access: Access | undefined, result: PageResult) {
  const status = result.error?.status;
  return !!access && config.hostname === "github.com" && (status === 403 || status === 404) && ["private", "internal"].includes(access.visibility ?? "") &&
    access.admin === true && !paidScanning(access) ? status : null;
}

function alertSurface(config: Settings, reader: GitHubReader, repository: string, id: number, kind: "dependabot" | "code_scanning", access?: Access) {
  const endpoint = kind === "dependabot" ? "dependabot/alerts" : "code-scanning/alerts";
  const result = reader.pages(`repos/${repository}/${endpoint}?state=open&per_page=100`, { repositoryId: id });
  const expectation = kind === "code_scanning" && result.pages === 1 && !result.items.length && !result.complete
    ? config.surface_expectations.find(item => item.repository === repository && item.status === result.error?.status && result.error.message.includes(item.message_contains)) : undefined;
  if (expectation) return { alerts: null, coverage: { status: "complete-unavailable", pages: result.pages, count: null,
    reason: expectation.reason, http_status: expectation.status } as Coverage };
  const unavailable = kind === "code_scanning" && result.pages === 1 && !result.items.length && !result.complete ? freeUnavailable(config, access, result) : null;
  if (unavailable) return { alerts: null, coverage: { status: "complete-unavailable", pages: result.pages, count: null, reason: "not-free-on-private", http_status: unavailable } as Coverage };
  const parsed = uniqueRows<Alert>(result.items, value => {
    const row = object(value); if (row.state !== "open") throw Error("alert scope changed");
    if (kind === "dependabot") {
      const dependency = object(row.dependency), pkg = object(dependency.package), advisory = object(row.security_advisory);
      return { number: number(row.number), state: "open", package: text(pkg.name), manifest: filename(dependency.manifest_path),
        context: alertContext(row, config.hostname, repository, kind),
        severity: text(advisory.severity), description: advisory.summary === undefined ? "" : text(advisory.summary) };
    }
    const rule = object(row.rule);
    const instance = row.most_recent_instance ? object(row.most_recent_instance) : {};
    const location = instance.location ? object(instance.location) : {};
    return { number: number(row.number), state: "open", package: null, manifest: location.path === undefined ? null : filename(location.path),
      context: alertContext(row, config.hostname, repository, kind),
      severity: typeof rule.security_severity_level === "string" ? rule.security_severity_level : typeof rule.severity === "string" ? rule.severity : "unknown",
      rule: text(rule.id), description: rule.description === undefined ? "" : text(rule.description) };
  }, row => String(row.number));
  return { alerts: parsed.rows, coverage: parsed.error ? failure(parsed.error, result.pages) : coverage(result, parsed.rows.length) };
}

function collectPull(config: Settings, reader: GitHubReader, repository: string, id: number, input: unknown): Pull {
  const initial = object(input), pullNumber = number(initial.number), listedAuthor = author(initial.user);
  const empty: Pull = { repository, number: pullNumber, title: text(initial.title), body: initial.body === null ? "" : text(initial.body),
    state: text(initial.state), draft: initial.draft === true, author: listedAuthor,
    author_class: listedAuthor.type === "Unknown" ? "gap" : classifyAuthor(config, listedAuthor.login, listedAuthor.type),
    head: sha(object(initial.head).sha), base: sha(object(initial.base).sha), base_ref: text(object(initial.base).ref),
    files: [], checks: [], statuses: [], evidence: { status: "incomplete", count: null, pages: 0, reason: "PR evidence not collected" } };
  let evidencePages = 0;
  try {
    const endpoint = `repos/${repository}/pulls/${pullNumber}`, detail = object(reader.get(endpoint));
    const head = sha(object(detail.head).sha), base = sha(object(detail.base).sha), currentAuthor = author(detail.user);
    if (number(detail.number) !== pullNumber || head !== empty.head || base !== empty.base ||
        currentAuthor.login !== listedAuthor.login || currentAuthor.type !== listedAuthor.type) throw Error("PR identity changed during collection");
    const baseRepo = object(detail.base).repo;
    if (baseRepo && text(object(baseRepo).full_name).toLowerCase() !== repository) throw Error("PR base repository changed");
    const files = reader.pages(`${endpoint}/files?per_page=100`, { repositoryId: id });
    evidencePages += files.pages;
    const parsedFiles = uniqueRows(files.items, value => {
      const row = object(value);
      return { filename: filename(row.filename), status: text(row.status),
        ...(row.previous_filename === undefined ? {} : { previous_filename: filename(row.previous_filename) }),
        ...(row.patch === undefined ? {} : { patch: text(row.patch) }) };
    }, row => row.filename);
    empty.files = parsedFiles.rows;
    if (!files.complete || parsedFiles.error) throw Error(files.error?.message ?? "Incomplete changed files");
    if (!Number.isSafeInteger(detail.changed_files) || Number(detail.changed_files) < 0 || empty.files.length !== detail.changed_files) throw Error("Changed-file total incomplete");
    const checks = reader.pages(`repos/${repository}/commits/${head}/check-runs?per_page=100`, { repositoryId: id, key: "check_runs" });
    evidencePages += checks.pages;
    const parsedChecks = uniqueRows(checks.items, value => {
      const row = object(value); number(row.id); text(row.name); text(row.status);
      if (row.head_sha !== head) throw Error("Check head does not match PR");
      return row;
    }, row => String(row.id));
    empty.checks = parsedChecks.rows;
    if (!checks.complete || parsedChecks.error) throw Error(checks.error?.message ?? "Incomplete or duplicate check runs");
    // GitHub caps the aggregate at 1000 suites, irrespective of run pagination.
    const suites = reader.pages(`repos/${repository}/commits/${head}/check-suites?per_page=100`, { repositoryId: id, key: "check_suites" });
    evidencePages += suites.pages;
    const parsedSuites = uniqueRows(suites.items, value => {
      const row = object(value); number(row.id);
      if (row.head_sha !== head) throw Error("Check-suite head does not match PR");
      return row;
    }, row => String(row.id));
    if (!suites.complete || parsedSuites.error) throw Error(suites.error?.message ?? "Incomplete or duplicate check suites");
    if (parsedSuites.rows.length > 1000) {
      const allRuns: unknown[] = [];
      for (const suite of parsedSuites.rows) {
        const runs = reader.pages(`repos/${repository}/check-suites/${suite.id}/check-runs?filter=latest&per_page=100`, { repositoryId: id, key: "check_runs" });
        evidencePages += runs.pages;
        allRuns.push(...runs.items);
        if (!runs.complete) throw Error(runs.error?.message ?? "Incomplete suite check runs");
      }
      const complete = uniqueRows(allRuns, value => {
        const row = object(value); number(row.id); text(row.name); text(row.status);
        if (row.head_sha !== head) throw Error("Suite check head does not match PR");
        return row;
      }, row => String(row.id));
      if (complete.error || empty.checks.some(row => !complete.rows.some(current => current.id === row.id))) throw Error("Check runs changed during suite collection");
      empty.checks = complete.rows;
    }
    const statuses = reader.pages(`repos/${repository}/commits/${head}/status?per_page=100`, { repositoryId: id, key: "statuses", sha: head });
    evidencePages += statuses.pages;
    const parsedStatuses = uniqueRows(statuses.items, value => { const row = object(value); number(row.id); text(row.context); text(row.state); return row; }, row => String(row.id));
    empty.statuses = parsedStatuses.rows;
    if (!statuses.complete || parsedStatuses.error) throw Error(statuses.error?.message ?? "Incomplete or duplicate statuses");
    const final = object(reader.get(endpoint));
    if (number(final.number) !== pullNumber || sha(object(final.head).sha) !== head || sha(object(final.base).sha) !== base || final.state !== detail.state ||
        JSON.stringify(author(final.user)) !== JSON.stringify(currentAuthor) || final.changed_files !== detail.changed_files) throw Error("PR evidence changed during collection");
    empty.state = text(final.state);
    if(isSecurityPull(empty)||[detail,final].some(row=>Array.isArray(row.labels)&&row.labels.some(label=>label&&typeof label==="object"&&"name" in label&&label.name==="security")))empty.security=true;
    empty.evidence = { status: "complete", count: empty.files.length, pages: evidencePages };
  } catch (error) { empty.evidence = failure(error, evidencePages); }
  return empty;
}

function collectRepository(config: Settings, reader: GitHubReader, repository: string, selectedPull?: number): RepositoryInventory {
  const pending = failure(Error("Repository identity not established"));
  const result: RepositoryInventory = { repository, pulls: [], dashboards: [], dependabot: { alerts: [], coverage: pending },
    code_scanning: { alerts: [], coverage: pending }, coverage: { identity: pending, pulls: pending, dashboards: pending } };
  let id: number;
  try {
    const identity = object(reader.get(`repos/${repository}`));
    if (text(identity.full_name).toLowerCase() !== repository) throw Error("Repository identity mismatch");
    id = number(identity.id); result.identity = { id, default_branch: text(identity.default_branch) };
    const permissions = identity.permissions && typeof identity.permissions === "object" ? identity.permissions as Record<string, unknown> : {};
    const analysis = identity.security_and_analysis;
    result.access = { visibility: typeof identity.visibility === "string" ? identity.visibility : null, admin: typeof permissions.admin === "boolean" ? permissions.admin : null,
      security_and_analysis: analysis && typeof analysis === "object" && !Array.isArray(analysis) ? analysis as Record<string, unknown> : null };
    result.coverage.identity = { status: "complete", pages: 1, count: 1 };
  } catch (error) { result.coverage.identity = failure(error, 1); return result; }

  let pullResult: PageResult;
  try {
    pullResult = selectedPull === undefined ? reader.pages(`repos/${repository}/pulls?state=open&per_page=100`, { repositoryId: id })
      : { items: [reader.get(`repos/${repository}/pulls/${selectedPull}`)], pages: 1, complete: true };
  } catch (error) { pullResult = { items: [], pages: 1, complete: false, error: { status: error instanceof GitHubReadError ? error.status : null, message: error instanceof Error ? error.message : "PR unavailable" } }; }
  const candidates = uniqueRows(pullResult.items, value => {
    const row = object(value), observed = number(row.number); author(row.user);
    if (selectedPull !== undefined && observed !== selectedPull) throw Error("Requested PR identity mismatch");
    if (selectedPull === undefined && row.state !== "open") throw Error("Open PR inventory scope changed");
    return row;
  }, row => String(row.number));
  let malformed = candidates.error;
  for (const raw of candidates.rows) {
    try {
      const user = author(raw.user), classification = classifyAuthor(config, user.login, user.type);
      if (classification !== "other" || user.type === "Unknown" || raw.number === selectedPull) result.pulls.push(collectPull(config, reader, repository, id, raw));
    } catch (error) { malformed ??= error; }
  }
  result.coverage.pulls = malformed ? failure(malformed, pullResult.pages) : coverage(pullResult, result.pulls.length);
  result.dependabot = alertSurface(config, reader, repository, id, "dependabot");
  result.code_scanning = alertSurface(config, reader, repository, id, "code_scanning", result.access);

  const configured = config.dashboards.filter(item => item.repository === repository);
  result.coverage.dashboards = { status: "complete", pages: 0, count: 0, ...(configured.length ? {} : { reason: "No dashboard configured" }) };
  for (const dashboard of configured) {
    try {
      let item: unknown;
      if (dashboard.issue) { item = reader.get(`repos/${repository}/issues/${dashboard.issue}`); result.coverage.dashboards.pages++; }
      else {
        const response = reader.pages(`repos/${repository}/issues?state=open&per_page=100`, { repositoryId: id });
        result.coverage.dashboards.pages += response.pages;
        if (!response.complete) throw Error(response.error?.message ?? "Incomplete dashboards");
        const matches = response.items.map(object).filter(row => !row.pull_request && row.title === dashboard.title);
        if (matches.length !== 1) throw Error("Configured dashboard missing or ambiguous");
        item = matches[0];
      }
      const row = object(item);
      if (row.pull_request || row.state !== "open") throw Error("Configured dashboard is not an open issue");
      result.dashboards.push({ number: number(row.number), title: text(row.title), body: row.body === null ? "" : text(row.body), state: text(row.state) });
    } catch (error) { result.coverage.dashboards = failure(error, result.coverage.dashboards.pages); }
  }
  if (result.coverage.dashboards.status === "complete") result.coverage.dashboards.count = result.dashboards.length;
  return result;
}

const STATES = ["already-on", "enabled", "left-off", "unavailable", "not-changed", "unknown"];
function lookup(value: unknown, statuses: string[]) {
  const row = object(value);
  if (Object.keys(row).some(key => !["status", "evidence", "error"].includes(key)) || !statuses.includes(String(row.status)) ||
    ![row.evidence, row.error].every(item => item === undefined || typeof item === "string")) throw Error("invalid helper detection");
}
function helperOutput(value: unknown): Output {
  const row = object(value), allowed = ["schema_version", "repository", "hostname", "run_id", "command", "mode", "mode_reason", "mode_detail", "visibility", "archived", "admin", "detection", "entries"];
  if (Object.keys(row).some(key => !allowed.includes(key)) || row.schema_version !== 1 || typeof row.repository !== "string" || typeof row.hostname !== "string" ||
    !["check", "apply"].includes(String(row.command)) || !["check", "apply"].includes(String(row.mode)) || !(row.mode_reason === null || typeof row.mode_reason === "string") ||
    !(row.run_id === undefined || typeof row.run_id === "string") || !(row.visibility === null || typeof row.visibility === "string") ||
    !(row.mode_detail === undefined || typeof row.mode_detail === "string") ||
    !(row.archived === null || typeof row.archived === "boolean") || !(row.admin === null || typeof row.admin === "boolean")) throw Error("invalid helper output");
  const detection = object(row.detection);
  if (Object.keys(detection).some(key => !["renovate", "dependabot"].includes(key))) throw Error("invalid helper detection");
  lookup(detection.renovate, ["present", "none", "failed", "not-checked"]); lookup(detection.dependabot, ["configured", "not-configured", "failed", "not-checked"]);
  if (!Array.isArray(row.entries)) throw Error("invalid helper entries");
  const seen = new Set<string>();
  for (const value of row.entries) {
    const entry = object(value);
    if (Object.keys(entry).some(key => !["setting", "state", "reason", "detail"].includes(key)) || ![...WRITABLE, "code_scanning"].includes(String(entry.setting)) ||
      !STATES.includes(String(entry.state)) || seen.has(String(entry.setting)) || ![entry.reason, entry.detail].every(item => item === undefined || typeof item === "string")) throw Error("invalid helper entry");
    seen.add(String(entry.setting));
  }
  return row as unknown as Output;
}
export type RejectedSecuritySettings = { file: string; repository: string | null; reason: string };
/**
 * Accepts a helper file only when it is valid helper JSON for this host, carries the run ID, names one repository in scope
 * and is the only such file for that repository. Rejections are returned for the report; they never fail the caller.
 */
export function acceptSecuritySettings(paths: string[], expected: { run_id: string; repositories: string[]; hostname: string }) {
  const rejected: RejectedSecuritySettings[] = [], candidates: { file: string; output: Output }[] = [];
  for (const path of paths) {
    const file = basename(path);
    let output: Output;
    try { output = helperOutput(JSON.parse(readFileSync(path, "utf8"))); } catch { rejected.push({ file, repository: null, reason: "not valid helper JSON" }); continue; }
    if (output.hostname !== expected.hostname) rejected.push({ file, repository: null, reason: `names host ${output.hostname}, not ${expected.hostname}` });
    else if (!expected.repositories.includes(output.repository)) rejected.push({ file, repository: null, reason: `names ${output.repository}, a repository outside the sweep's scope` });
    else candidates.push({ file, output });
  }
  const accepted: Output[] = [];
  for (const { file, output } of candidates) {
    if (candidates.filter(other => other.output.repository === output.repository).length > 1) rejected.push({ file, repository: output.repository, reason: "more than one helper file for this repository" });
    else if (output.run_id !== expected.run_id) rejected.push({ file, repository: output.repository, reason: `carries another run ID (${output.run_id ?? "none"})` });
    else accepted.push(output);
  }
  return { accepted, rejected };
}
function alertsWriteAttempted(output: Output) {
  return output.entries.some(entry => entry.setting === "dependabot_alerts" &&
    (entry.state === "enabled" || entry.state === "not-changed" && entry.reason === "api-error" && output.mode === "apply"));
}
function markIncomplete(surface: RepositoryInventory["dependabot"], reason: string) {
  if (surface.coverage.status === "complete") surface.coverage = { status: "incomplete", pages: surface.coverage.pages, count: null, reason };
}

export function collect(config: Settings, options: { reader?: GitHubReader; scope?: { repository?: string; pull?: number }; terminal?:AlertReference[];
  run_id?: string; security_settings?: string[]; applied_repositories?: string[] } = {}): Inventory {
  const scope = options.scope ?? {}, allowed = [config.repository, ...config.repositories.map(item => item.repository)];
  const selected = scope.repository?.toLowerCase() ?? (scope.pull === undefined ? undefined : config.repository);
  if (selected && !allowed.includes(selected)) throw Error("Repository outside configured maintenance scope");
  if (scope.pull !== undefined) number(scope.pull);
  const repositories = selected ? [selected] : allowed;
  if(options.terminal?.some(ref=>!repositories.includes(ref.repository)))throw Error("terminal identity outside requested collection scope");
  const reader = options.reader ?? createMaintenanceReader(config.hostname);
  const traceStart = reader.trace().length;
  const result: Inventory = { schema_version: 1, hostname: config.hostname, repository: config.repository,
    source_commit: git(config.root, "rev-parse", "HEAD"), collected_at: new Date().toISOString(),
    requests: [],
    scope: { repositories, ...(scope.pull === undefined ? {} : { pull: scope.pull }) },
    repositories: repositories.map(repo => collectRepository(config, reader, repo, scope.pull)), discovery: [] };
  const files = options.security_settings ?? [], applied = options.applied_repositories ?? [];
  if (files.length && !options.run_id) throw Error("security settings files need the run ID");
  if (applied.some(repo => !repositories.includes(repo))) throw Error("applied repository outside collection scope");
  const { accepted } = options.run_id ? acceptSecuritySettings(files, { run_id: options.run_id, repositories, hostname: config.hostname }) : { accepted: [] };
  for (const row of result.repositories) {
    const output = accepted.find(item => item.repository === row.repository);
    if (output && alertsWriteAttempted(output)) markIncomplete(row.dependabot, "alerts-enabled-this-run");
    else if (!output && applied.includes(row.repository)) markIncomplete(row.dependabot, "helper-receipt-missing");
  }
  if(options.terminal)result.terminal=collectTerminal(config,options.terminal,{reader});
  if (!selected) for (const organization of config.discovery_organizations) {
    const pages = reader.pages(`orgs/${organization}/repos?type=all&per_page=100`);
    const parsed = uniqueRows(pages.items, value => {
      const row = object(value), repo = text(row.full_name).toLowerCase();
      if (!/^[a-z0-9-]+\/[a-z0-9_.-]+$/.test(repo) || repo.split("/")[0] !== organization || typeof row.archived !== "boolean") throw Error("Invalid discovered repository");
      const excluded = config.excluded_repositories.includes(repo);
      return { repository: repo, archived: row.archived, excluded, inventory_gap: !row.archived && !excluded && !allowed.includes(repo) };
    }, row => row.repository);
    result.discovery.push({ organization, repositories: parsed.rows, coverage: parsed.error ? failure(parsed.error, pages.pages) : coverage(pages, parsed.rows.length) });
  }
  result.requests = reader.trace().slice(traceStart);
  return result;
}
