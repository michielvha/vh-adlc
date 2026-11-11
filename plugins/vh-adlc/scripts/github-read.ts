export function parsePage(raw: string, expected: { hostname: string; endpoint: string; page: number; repositoryId?: number; onNext?: (url: string) => void }): { items: unknown[]; next: number | null } {
  const split = raw.search(/\r?\n\r?\n/);
  if (split < 0) throw new Error("missing-response-headers");
  const headers = raw.slice(0, split), body = raw.slice(split).replace(/^\r?\n\r?\n/, "");
  if (!/^HTTP\/[\d.]+ 200(?:\s|$)/.test(headers)) throw new Error("failed-http-status");
  let items: unknown;
  try { items = JSON.parse(body); } catch { throw new Error("invalid-response-json"); }
  if (!Array.isArray(items)) throw new Error("expected-response-list");
  const links = [...headers.matchAll(/^link:\s*(.+)$/gim)].map((match) => match[1]).join(", ");
  const nextLinks: string[] = [];
  for (const part of links ? links.split(/,\s*(?=<)/) : []) {
    const parsed = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/i);
    if (!parsed) throw new Error("invalid-pagination-link");
    if (parsed[2].toLowerCase().split(/\s+/).includes("next")) nextLinks.push(parsed[1]);
  }
  if (nextLinks.length > 1) throw new Error("ambiguous-next-page");
  if (!nextLinks.length) return { items, next: null };
  const apiHost = expected.hostname === "github.com" ? "api.github.com" : expected.hostname;
  const base = new URL(`https://${apiHost}/${expected.endpoint}`), next = new URL(nextLinks[0]);
  const acceptedPaths = [base.pathname.toLowerCase()];
  const suffix = base.pathname.match(/^\/repos\/[^/]+\/[^/]+(\/.*)$/)?.[1];
  if (suffix && Number.isSafeInteger(expected.repositoryId) && expected.repositoryId! > 0) acceptedPaths.push(`/repositories/${expected.repositoryId}${suffix}`.toLowerCase());
  if (expected.hostname !== "github.com") acceptedPaths.push(...acceptedPaths.map(path => `/api/v3${path}`));
  if (next.protocol !== "https:" || next.hostname !== apiHost || next.username || next.password || next.port || next.hash ||
      !acceptedPaths.includes(next.pathname.toLowerCase())) throw new Error("next-page-target-changed");
  const keys = new Set([...base.searchParams.keys(), ...next.searchParams.keys()]);
  keys.delete("page");
  for (const cursor of ["after", "before"]) {
    keys.delete(cursor);
    const values = next.searchParams.getAll(cursor);
    if (values.length > 1 || values.some(value => !value || value.length > 4096 || /[\x00-\x20\x7f]/.test(value))) throw new Error("invalid-next-cursor");
  }
  if (next.searchParams.has("after") && next.searchParams.has("before")) throw new Error("ambiguous-next-cursor");
  for (const key of keys) if (JSON.stringify(base.searchParams.getAll(key)) !== JSON.stringify(next.searchParams.getAll(key))) throw new Error("next-page-scope-changed");
  const value = next.searchParams.get("page");
  const cursorBased=next.searchParams.has("after")||next.searchParams.has("before");
  if (next.searchParams.getAll("page").length>1 || value!==null && (!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value))) ||
    !cursorBased && (value===null || Number(value)!==expected.page+1)) throw new Error("invalid-next-page");
  expected.onNext?.(next.href);
  return { items, next: expected.page + 1 };
}

export type ReadOptions = { env?: Record<string, string | undefined>; timeout_ms?: number; projection?: ".id" | ".login" };

/** Fixed GET-only argv, shared without importing a mutation adapter or controller. */
export function ghRead(hostname: string, endpoint: string, options: ReadOptions = {}) {
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(hostname)) throw Error("invalid-github-read-host");
  const apiHost = hostname === "github.com" ? "api.github.com" : hostname;
  const url = new URL(endpoint.startsWith("https://") ? endpoint : `https://${apiHost}/${endpoint}`);
  const path = url.pathname.replace(/^\/api\/v3\//, "/");
  if (url.protocol !== "https:" || url.hostname !== apiHost || url.port || url.username || url.password || url.hash ||
      !/^\/(?:user$|repos\/[a-z0-9-]+\/[a-z0-9_.-]+(?:\/|$)|repositories\/[1-9]\d*(?:\/|$)|orgs\/[a-z0-9-]+\/repos$)/i.test(path) ||
      /[\x00-\x20\x7f]/.test(endpoint)) throw Error("invalid-github-read-target");
  const argv = ["gh", "api", "--hostname", hostname, "--method", "GET"];
  if (options.projection) argv.push(endpoint, "--jq", options.projection);
  else argv.push("--include", endpoint);
  return Bun.spawnSync(argv, { env: { ...process.env, ...options.env, GH_PROMPT_DISABLED: "1" },
    stdout: "pipe", stderr: "pipe", timeout: options.timeout_ms ?? 60_000 });
}

export class GitHubReadError extends Error {
  constructor(public status: number | null, public apiMessage: string) { super(`GitHub GET unavailable (${status ?? "unknown"})`); }
}
export type PageResult = { items: unknown[]; pages: number; complete: boolean; error?: { status: number | null; message: string } };
export type ReadObservation = { method: "GET"; hostname: string; endpoint: string; started_at: string; observed_at: string; status: number | null };
export type GitHubReader = ReturnType<typeof createGitHubReader>;

export function createGitHubReader(hostname: string, options: Omit<ReadOptions, "projection"> & { max_pages?: number } = {}) {
  const observations: ReadObservation[] = [];
  function response(endpoint: string): { value: unknown; headers: string; raw: string } {
    const started_at = new Date().toISOString();
    const result = ghRead(hostname, endpoint, options), raw = result.stdout.toString();
    const status = Number(raw.match(/^HTTP\/[\d.]+ (\d{3})(?:\s|$)/)?.[1]) || null;
    observations.push({ method: "GET", hostname, endpoint, started_at, observed_at: new Date().toISOString(), status });
    const split = raw.search(/\r?\n\r?\n/);
    let value: unknown;
    try { value = JSON.parse(raw.slice(split).replace(/^\r?\n\r?\n/, "")); }
    catch { throw new GitHubReadError(status, "Invalid or missing JSON response"); }
    if (split < 0 || result.exitCode !== 0 || status !== 200) {
      const message = value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>).message === "string"
        ? String((value as Record<string, unknown>).message).slice(0, 4096) : "Request unavailable";
      throw new GitHubReadError(status, message);
    }
    return { value, headers: raw.slice(0, split), raw };
  }
  return {
    trace() { return observations.map(row => ({ ...row })); },
    get(endpoint: string) { return response(endpoint).value; },
    pages(endpoint: string, expected: { repositoryId?: number; key?: string; sha?: string } = {}): PageResult {
      const items: unknown[] = [], seen = new Set<string>();
      let target: string | null = `${endpoint}${endpoint.includes("?") ? "&" : "?"}page=1`, page = 0, total: number | undefined;
      try {
        while (target) {
          if (seen.has(target)) throw Error("repeated-next-url");
          if (page >= (options.max_pages ?? 10_000)) throw Error("pagination-bound-reached");
          seen.add(target); page++;
          const current = response(target);
          let array = current.value;
          if (expected.key) {
            if (!array || typeof array !== "object" || Array.isArray(array)) throw Error("expected-response-object");
            const object = array as Record<string, unknown>;
            if (expected.sha && object.sha !== expected.sha) throw Error("response-commit-identity-changed");
            if (!Number.isSafeInteger(object.total_count) || Number(object.total_count) < 0) throw Error("missing-list-total");
            if (total !== undefined && total !== object.total_count) throw Error("list-total-changed");
            total = Number(object.total_count); array = object[expected.key];
          }
          if (!Array.isArray(array)) throw Error("expected-response-list");
          items.push(...array);
          let nextTarget: string | null = null;
          parsePage(`${current.headers}\r\n\r\n${JSON.stringify(array)}`, { hostname, endpoint, page,
            repositoryId: expected.repositoryId, onNext(url) { nextTarget = url; } });
          target = nextTarget;
        }
        if (total !== undefined && total !== items.length) throw Error("list-total-incomplete");
        return { items, pages: page, complete: true };
      } catch (error) {
        return { items, pages: page, complete: false, error: error instanceof GitHubReadError
          ? { status: error.status, message: error.apiMessage } : { status: null, message: error instanceof Error ? error.message : "Read failed" } };
      }
    },
  };
}

