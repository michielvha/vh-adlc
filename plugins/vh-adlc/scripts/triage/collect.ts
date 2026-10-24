import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, join, sep } from "node:path";
import { git, resolveInside } from "./settings";
import type { Comment, Coverage, Inventory, Issue, Label, Mode, Plan, Pull, Settings } from "./types";

export type ReadRequest = { kind: "issues" | "pulls" | "comments" | "labels"; issue?: number };
export type Reader = { page(request: ReadRequest, page: number): Promise<{ items: unknown[]; next: number | null }> };
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== "string") throw new Error("invalid-string"); return value; }
function id(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error("invalid-id"); return value as number; }
function date(value: unknown): string { const result = text(value); if (!Number.isFinite(Date.parse(result))) throw new Error("invalid-date"); return result; }
function author(value: unknown): string { return value === null ? "[deleted]" : text(obj(value).login); }
function issue(value: unknown): Issue | null {
  const raw = obj(value);
  if ("pull_request" in raw) return null;
  if (!["open", "closed"].includes(String(raw.state)) || !Array.isArray(raw.labels)) throw new Error("invalid-issue");
  return { number: id(raw.number), title: text(raw.title), body: raw.body === null ? "" : text(raw.body), state: raw.state as Issue["state"],
    author: author(raw.user), labels: raw.labels.map((label) => typeof label === "string" ? label : text(obj(label).name)),
    milestone: raw.milestone === null ? null : text(obj(raw.milestone).title),
    created_at: date(raw.created_at), updated_at: date(raw.updated_at), comments: [] };
}
function pull(value: unknown): Pull | null {
  const raw = obj(value);
  if (!("merged_at" in raw)) throw new Error("missing-merge-state");
  if (raw.merged_at === null) return null;
  return { number: id(raw.number), title: text(raw.title), body: raw.body === null ? "" : text(raw.body), merged_at: date(raw.merged_at) };
}
function comment(value: unknown): Comment {
  const raw = obj(value);
  return { id: id(raw.id), author: author(raw.user), body: text(raw.body), created_at: date(raw.created_at) };
}
export function normalizeLabel(value:unknown):Label {
  const raw=obj(value),color=text(raw.color);
  if(!/^[a-f0-9]{6}$/i.test(color))throw Error("invalid-label-color");
  return{id:id(raw.id),name:text(raw.name),color:color.toLowerCase(),description:raw.description===null?"":text(raw.description)};
}
function scalar(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error("invalid-plan-scalar");
}
function planIssue(value: unknown, config: Settings): { issue: number | null; issue_ref: string | null } {
  const ref = scalar(value);
  if (ref === null || !ref.trim()) return { issue: null, issue_ref: null };
  const numeric = ref.match(/^#?([1-9]\d*)$/);
  if (numeric) return { issue: id(Number(numeric[1])), issue_ref: ref };
  let url: URL;
  try { url = new URL(ref); } catch { throw new Error("invalid-plan-reference"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("invalid-plan-reference");
  const match = url.pathname.match(/^\/([^/]+\/[^/]+)\/issues\/([1-9]\d*)\/?$/);
  const local = url.hostname === config.hostname && match?.[1].toLowerCase() === config.repository.toLowerCase();
  return { issue: local ? id(Number(match![2])) : null, issue_ref: ref };
}

function plans(config: Settings): { plans: Plan[]; coverage: Coverage; status: Inventory["plan_metadata"] } {
  const result: Plan[] = [], errors: string[] = [], visited = new Set<string>();
  const excluded = [config.report_dir, ...config.generated_mirrors];
  function walk(path: string) {
    const relativePath = relative(config.root, path).split(sep).join("/");
    if (excluded.some((root) => relativePath === root || relativePath.startsWith(`${root}/`))) return;
    let resolved: string;
    try { resolved = resolveInside(config.root, relativePath || "."); }
    catch { errors.push(relativePath); return; }
    const canonicalPath = relative(config.root, resolved).split(sep).join("/");
    if (excluded.some((root) => canonicalPath === root || canonicalPath.startsWith(`${root}/`))) return;
    if (visited.has(resolved)) return;
    visited.add(resolved);
    try {
      if (statSync(resolved).isDirectory()) {
        for (const entry of readdirSync(resolved).sort()) if (entry !== ".git") walk(join(resolved, entry));
        return;
      }
      if (!resolved.toLowerCase().endsWith(".md")) return;
      const body = readFileSync(resolved, "utf8").replace(/^\uFEFF/, "");
      if (!body.startsWith("---\n") && !body.startsWith("---\r\n")) return;
      const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (!fm) throw new Error("incomplete-frontmatter");
      const fields = config.plan_fields;
      let data: Record<string, unknown>;
      try { data = obj(Bun.YAML.parse(fm[1])); }
      catch (error) {
        // Broad document roots contain prose frontmatter as well as plans. A malformed
        // header is relevant if it could contain either configured plan key.
        const hasPlanKey = [fields.issue, fields.status].some(key => {
          const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`(?:^|[\\s{,])["']?${escaped}["']?\\s*:`, "m").test(fm[1]);
        });
        if (!hasPlanKey) return;
        throw error;
      }
      if (!(fields.issue in data) && !(fields.status in data)) return;
      result.push({ path: relative(config.root, resolved).split(sep).join("/"), ...planIssue(data[fields.issue], config),
        status: scalar(data[fields.status]), status_description: scalar(data[fields.status_description]), priority: scalar(data[fields.priority]) });
    } catch { errors.push(relativePath); }
  }
  for (const root of config.plan_roots) walk(resolveInside(config.root, root));
  return { plans: result, coverage: { collection: "plans", scope: config.plan_roots.join(",") || "not-configured", pages: 0,
    complete: !errors.length, ...(errors.length ? { error: `plan-metadata-unavailable: ${errors.join(", ")}` } : {}) },
    status: errors.length ? "incomplete" : config.plan_roots.length ? "available" : "not-configured" };
}

export async function collect(config: Settings, reader: Reader, options: { mode?: Mode; ids?: number[]; now?: string } = {}): Promise<Inventory> {
  const mode = options.mode ?? "sweep", requested = [...new Set(options.ids ?? [])];
  if (!["sweep", "next", "close", "stale", "ids"].includes(mode) || requested.some((value) => !Number.isSafeInteger(value) || value <= 0) || mode === "ids" && !requested.length || mode !== "ids" && requested.length) throw new Error("invalid-triage-selection");
  const now = Date.parse(options.now ?? new Date().toISOString());
  if (!Number.isFinite(now)) throw new Error("invalid-run-time");
  const collectedAt = new Date(now).toISOString();
  const source = git(config.root, "rev-parse", "HEAD"), coverage: Coverage[] = [];
  let fetched = 0;
  async function pages<T>(request: ReadRequest, normalize: (value: unknown) => T | null, key: (value: T) => number): Promise<T[]> {
    const name = request.kind === "comments" ? `comments:${request.issue}` : request.kind;
    const entry: Coverage = { collection: name, scope: request.kind === "comments" ? String(request.issue) : request.kind === "issues" ? "all-states" : request.kind==="labels"?"repository-vocabulary":"all-closed-pulls", pages: 0, complete: false };
    coverage.push(entry);
    const items: T[] = [], seen = new Set<number>(), rawSeen=new Set<number>();
    let page = 1;
    while (true) {
      if (config.page_budget !== null && fetched >= config.page_budget) { entry.error = "page-budget-exhausted"; break; }
      let response: Awaited<ReturnType<Reader["page"]>>;
      try { fetched++; response = await reader.page(request, page); }
      catch { entry.error = "read-failed"; break; }
      entry.pages++;
      try {
        if (!response || !Array.isArray(response.items) || response.next !== null && (!Number.isSafeInteger(response.next) || response.next !== page + 1)) throw new Error("invalid-page");
        for (const raw of response.items) {
          const rawId=id(obj(raw)[["comments","labels"].includes(request.kind)?"id":"number"]);
          if(rawSeen.has(rawId))throw new Error("repeated-raw-item");
          rawSeen.add(rawId);
          const item = normalize(raw);
          if (item === null) continue;
          const identity = key(item);
          if (seen.has(identity)) throw new Error("repeated-item");
          seen.add(identity); items.push(item);
        }
      } catch { entry.error = "invalid-or-unstable-page"; break; }
      if (response.next === null) { entry.complete = true; break; }
      page = response.next;
    }
    return items;
  }
  const all = await pages({ kind: "issues" }, issue, (value) => value.number);
  const pulls = await pages({ kind: "pulls" }, pull, (value) => value.number);
  const labels=await pages({kind:"labels"},normalizeLabel,value=>value.id);
  let selected = mode === "ids" ? all.filter((value) => requested.includes(value.number)) : all.filter((value) => value.state === "open");
  if (mode === "stale") {
    selected = selected.filter((value) => now - Date.parse(value.updated_at) > config.stale_days * 86_400_000);
  }
  for (const number of requested) if (!all.some((value) => value.number === number)) coverage.push({ collection: `issue:${number}`, scope: String(number), pages: 0, complete: false, error: "requested-issue-unavailable" });
  for (const value of selected) value.comments = await pages({ kind: "comments", issue: value.number }, comment, (item) => item.id);
  const metadata = plans(config); coverage.push(metadata.coverage);
  if (git(config.root, "rev-parse", "HEAD") !== source) coverage.push({ collection: "source", scope: source, pages: 0, complete: false, error: "source-head-changed" });
  return { schema_version: 1, repository: config.repository, hostname: config.hostname, source_commit: source, mode,
    requested_ids: requested, collected_at: collectedAt, issues: all.filter((value) => value.state === "open"),
    closed_issues: all.filter((value) => value.state === "closed"), pulls, labels, plans: metadata.plans, coverage, plan_metadata: metadata.status };
}

export { issue as normalizeIssue, comment as normalizeComment };
