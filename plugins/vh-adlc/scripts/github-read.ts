import { createHash } from "node:crypto";

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

export type ReadOptions = { inherit_env?: boolean; env?: Record<string, string | undefined>; timeout_ms?: number; projection?: ".id" | ".login" };

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
  return Bun.spawnSync(argv, { env: { ...(options.inherit_env === false ? {} : process.env), ...options.env, GH_PROMPT_DISABLED: "1" },
    stdout: "pipe", stderr: "pipe", timeout: options.timeout_ms ?? 60_000 });
}

export class GitHubReadError extends Error {
  constructor(public status: number | null, public apiMessage: string) { super(`GitHub GET unavailable (${status ?? "unknown"})`); }
}
export type PageResult = { items: unknown[]; pages: number; complete: boolean; bounded?: boolean; error?: { status: number | null; message: string } };
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
    pages(endpoint: string, expected: { repositoryId?: number; key?: string; sha?: string; max_items?: number } = {}): PageResult {
      const items: unknown[] = [], seen = new Set<string>();
      let target: string | null = `${endpoint}${endpoint.includes("?") ? "&" : "?"}page=1`, page = 0, total: number | undefined;
      let bounded: boolean | undefined;
      try {
        if (expected.max_items !== undefined && (!Number.isSafeInteger(expected.max_items) || expected.max_items < 1)) throw Error("invalid-item-bound");
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
          if (total !== undefined && items.length > total) throw Error("list-total-inconsistent");
          target = nextTarget;
          if (expected.max_items !== undefined && items.length >= expected.max_items) {
            bounded = items.length > expected.max_items || target !== null || (total !== undefined && total > expected.max_items);
            items.splice(expected.max_items);
            target = null;
          }
        }
        if (total !== undefined && total !== items.length && bounded !== true) throw Error("list-total-incomplete");
        return { items, pages: page, complete: true, ...(bounded === undefined ? {} : { bounded }) };
      } catch (error) {
        return { items, pages: page, complete: false, error: error instanceof GitHubReadError
          ? { status: error.status, message: error.apiMessage } : { status: null, message: error instanceof Error ? error.message : "Read failed" } };
      }
    },
  };
}


export type RepositoryIdentity = { id: number; full_name: string; default_branch?: string };
export type PullRequestInput = {
  number: number; state: "open" | "closed"; merged_at: string | null; body: string; draft: boolean;
  actor: string; actor_id: number; actor_type: string; head_sha: string; head_ref: string; head_repository: RepositoryIdentity | null;
  base_sha: string; base_ref: string; base_repository: RepositoryIdentity;
};
export type WorkflowRunInput = {
  id: number; run_attempt: number; workflow_id: number; path: string; event: string; status: string;
  conclusion: string | null; head_sha: string; head_branch: string | null; repository: RepositoryIdentity;
  head_repository: RepositoryIdentity | null; created_at: string; updated_at: string;
};
export type ArtifactInput = {
  id: number; name: string; size_in_bytes: number; digest: string; expired: boolean;
  created_at: string; expires_at: string;
  workflow_run: { id: number; repository_id: number; head_repository_id: number; head_branch: string; head_sha: string };
};
export type JobInput = {
  id: number; run_id: number; attempt: number; head_sha: string; name: string; status: string; conclusion: string | null;
  steps: Array<{ number: number; name: string; status: string; conclusion: string | null }>;
};
export type TypedPage<T> = { items: T[]; pages: number; complete: boolean; bounded?: boolean; diagnostics: string[] };
export type RepositoryReader = ReturnType<typeof createRepositoryReader>;

function readObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("invalid-github-read-object");
  return value as Record<string, unknown>;
}
function readText(value: unknown): string {
  if (typeof value !== "string" || !value || /[\x00-\x1f\x7f]/u.test(value)) throw Error("invalid-github-read-text");
  return value;
}
function readID(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw Error("invalid-github-read-id");
  return value;
}
function readBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw Error("invalid-github-read-boolean");
  return value;
}
function readSHA(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value)) throw Error("invalid-github-read-sha");
  return value;
}
function readRepository(value: unknown): RepositoryIdentity {
  const object = readObject(value);
  const name = readText(object.full_name);
  if (!/^[a-z0-9-]+\/[a-z0-9_.-]+$/iu.test(name) || name.split("/").some(part => part === "." || part === "..")) throw Error("invalid-github-read-repository");
  return { id: readID(object.id), full_name: name, ...(object.default_branch === undefined ? {} : { default_branch: readText(object.default_branch) }) };
}
function nullableText(value: unknown): string | null { return value === null ? null : readText(value); }

function gitObjectSHA(kind: "blob" | "tree", bytes: Buffer, expected: string): string {
  return createHash(expected.length === 40 ? "sha1" : "sha256").update(Buffer.from(`${kind} ${bytes.length}\0`)).update(bytes).digest("hex");
}
export type GitTreeEntry = { path: string; mode: string; type: "blob" | "tree" | "commit"; sha: string };
function readGitTree(value: unknown, expected: string, maxEntries: number): { sha: string; entries: GitTreeEntry[] } {
  const object = readObject(value);
  if (readSHA(object.sha) !== expected || object.truncated !== false || !Array.isArray(object.tree)
    || !Number.isSafeInteger(maxEntries) || maxEntries < 1 || object.tree.length > maxEntries) throw Error("incomplete-github-git-tree");
  const entries: GitTreeEntry[] = [], names = new Set<string>();
  for (const item of object.tree) {
    const entry = readObject(item);
    const path = entry.path;
    if (typeof path !== "string" || !path || /[\0/]/u.test(path) || [".", "..", ".git"].includes(path.toLowerCase())
      || Buffer.from(path).toString() !== path || names.has(path)) throw Error("invalid-github-git-tree-path");
    names.add(path);
    const mode = readText(entry.mode);
    const kind = mode === "040000" ? "tree" : mode === "160000" ? "commit" : "blob";
    if (!["100644", "100755", "040000", "120000", "160000"].includes(mode) || entry.type !== kind) throw Error("invalid-github-git-tree-mode");
    entries.push({ path, mode, type: kind, sha: readSHA(entry.sha) });
  }
  entries.sort((left, right) => Buffer.compare(Buffer.from(left.path + (left.type === "tree" ? "/" : "\0")), Buffer.from(right.path + (right.type === "tree" ? "/" : "\0"))));
  const raw = Buffer.concat(entries.map(entry => Buffer.concat([Buffer.from(`${entry.mode.replace(/^0/u, "")} ${entry.path}\0`), Buffer.from(entry.sha, "hex")])));
  if (gitObjectSHA("tree", raw, expected) !== expected) throw Error("github-git-tree-digest-mismatch");
  return { sha: expected, entries };
}


/** Typed GET routes bind every request to one literal repository. Transport and pagination remain shared. */
export function createRepositoryReader(reader: GitHubReader, repository: string) {
  if (!/^[a-z0-9-]+\/[a-z0-9_.-]+$/iu.test(repository) || repository.split("/").some(part => part === "." || part === "..")) throw Error("invalid-github-read-repository");
  const prefix = `repos/${repository}`;
  let identity: RepositoryIdentity | undefined;
  function selectedRepository(value: unknown): RepositoryIdentity {
    const selected = readRepository(value);
    if (selected.full_name.toLowerCase() !== repository.toLowerCase() || (identity && selected.id !== identity.id)) throw Error("github-read-repository-changed");
    return selected;
  }
  function pull(value: unknown): PullRequestInput {
    const object = readObject(value), head = readObject(object.head), base = readObject(object.base), user = readObject(object.user);
    if (object.state !== "open" && object.state !== "closed") throw Error("invalid-github-read-pr-state");
    if (object.body !== null && typeof object.body !== "string") throw Error("invalid-github-read-pr-body");
    return { number: readID(object.number), state: object.state, merged_at: nullableText(object.merged_at), body: object.body ?? "", draft: readBoolean(object.draft),
      actor: readText(user.login), actor_id: readID(user.id), actor_type: readText(user.type), head_sha: readSHA(head.sha), head_ref: readText(head.ref),
      head_repository: head.repo === null ? null : readRepository(head.repo), base_sha: readSHA(base.sha), base_ref: readText(base.ref), base_repository: selectedRepository(base.repo) };
  }
  function run(value: unknown): WorkflowRunInput {
    const object = readObject(value);
    return { id: readID(object.id), run_attempt: readID(object.run_attempt), workflow_id: readID(object.workflow_id),
      path: readText(object.path), event: readText(object.event), status: readText(object.status), conclusion: nullableText(object.conclusion),
      head_sha: readSHA(object.head_sha), head_branch: nullableText(object.head_branch), repository: selectedRepository(object.repository),
      head_repository: object.head_repository === null ? null : readRepository(object.head_repository), created_at: readText(object.created_at), updated_at: readText(object.updated_at) };
  }
  function artifact(value: unknown): ArtifactInput {
    const object = readObject(value), source = readObject(object.workflow_run);
    if (typeof object.size_in_bytes !== "number" || !Number.isSafeInteger(object.size_in_bytes) || object.size_in_bytes < 0
      || typeof object.digest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(object.digest)) throw Error("invalid-github-read-artifact-binding");
    return { id: readID(object.id), name: readText(object.name), size_in_bytes: object.size_in_bytes, digest: object.digest, expired: readBoolean(object.expired),
      created_at: readText(object.created_at), expires_at: readText(object.expires_at), workflow_run: { id: readID(source.id), repository_id: readID(source.repository_id),
        head_repository_id: readID(source.head_repository_id), head_branch: readText(source.head_branch), head_sha: readSHA(source.head_sha) } };
  }
  function list<T extends { id: number } | { number: number }>(endpoint: string, parse: (value: unknown) => T, key?: string, maxItems?: number): TypedPage<T> {
    const page = reader.pages(endpoint, { repositoryId: identity?.id, key, max_items: maxItems });
    const items: T[] = [], diagnostics: string[] = [];
    const seen = new Set<number>();
    if (!page.complete) diagnostics.push(page.error?.message ?? "Incomplete GitHub collection");
    for (const value of page.items) {
      try {
        const item = parse(value);
        const id = "number" in item ? item.number : item.id;
        if (seen.has(id)) throw Error("repeated identity");
        seen.add(id);
        items.push(item);
      } catch { diagnostics.push("Malformed, repeated or foreign GitHub collection entry"); }
    }
    return { items, pages: page.pages, complete: page.complete && diagnostics.length === 0, diagnostics, ...(page.bounded === undefined ? {} : { bounded: page.bounded }) };
  }
  return {
    repository(): RepositoryIdentity & { default_branch: string } {
      const selected = selectedRepository(reader.get(prefix));
      if (!selected.default_branch) throw Error("missing-github-default-branch");
      identity = selected;
      return { ...selected, default_branch: selected.default_branch };
    },
    pull(number: number): PullRequestInput {
      const result = pull(reader.get(`${prefix}/pulls/${readID(number)}`));
      if (result.number !== number) throw Error("github-read-pr-number-changed");
      return result;
    },
    pulls(base: string): TypedPage<PullRequestInput> {
      readText(base);
      return list(`${prefix}/pulls?state=open&base=${encodeURIComponent(base)}&per_page=100`, value => {
        const result = pull(value);
        if (result.state !== "open" || result.base_ref !== base) throw Error("github-read-pr-filter-changed");
        return result;
      });
    },
    workflow(id: number) {
      const object = readObject(reader.get(`${prefix}/actions/workflows/${readID(id)}`));
      if (readID(object.id) !== id) throw Error("github-read-workflow-changed");
      return { id, path: readText(object.path), state: readText(object.state) };
    },
    run(id: number, attempt?: number): WorkflowRunInput {
      const suffix = attempt === undefined ? "" : `/attempts/${readID(attempt)}`;
      const result = run(reader.get(`${prefix}/actions/runs/${readID(id)}${suffix}`));
      if (result.id !== id || (attempt !== undefined && result.run_attempt !== attempt)) throw Error("github-read-run-changed");
      return result;
    },
    runs(workflow: number, branch: string): TypedPage<WorkflowRunInput> {
      readText(branch);
      return list(`${prefix}/actions/workflows/${readID(workflow)}/runs?event=schedule&branch=${encodeURIComponent(branch)}&per_page=100`, value => {
        const result = run(value);
        if (result.workflow_id !== workflow || result.event !== "schedule" || result.head_branch !== branch) throw Error("github-read-run-filter-changed");
        return result;
      }, "workflow_runs");
    },
    recentRuns(workflow: number, branch: string, maxRuns: number): TypedPage<WorkflowRunInput> {
      readID(workflow); readText(branch); readID(maxRuns);
      return list(`${prefix}/actions/workflows/${workflow}/runs?event=schedule&branch=${encodeURIComponent(branch)}&status=completed&per_page=${Math.min(maxRuns, 100)}`, value => {
        const result = run(value);
        if (result.workflow_id !== workflow || result.event !== "schedule" || result.head_branch !== branch || result.status !== "completed") throw Error("github-read-run-filter-changed");
        return result;
      }, "workflow_runs", maxRuns);
    },
    jobs(runID: number, attempt: number): TypedPage<JobInput> {
      readID(runID); readID(attempt);
      return list(`${prefix}/actions/runs/${runID}/attempts/${attempt}/jobs?per_page=100`, value => {
        const object = readObject(value);
        if (readID(object.run_id) !== runID || !Array.isArray(object.steps) || (object.run_attempt !== undefined && object.run_attempt !== attempt)) throw Error("github-read-job-run-changed");
        const steps = object.steps.map(value => {
          const step = readObject(value);
          return { number: readID(step.number), name: readText(step.name), status: readText(step.status), conclusion: nullableText(step.conclusion) };
        });
        if (new Set(steps.map(step => step.number)).size !== steps.length) throw Error("repeated-github-job-step");
        return { id: readID(object.id), run_id: runID, attempt, head_sha: readSHA(object.head_sha), name: readText(object.name),
          status: readText(object.status), conclusion: nullableText(object.conclusion), steps };
      }, "jobs");
    },
    artifacts(runID: number): TypedPage<ArtifactInput> {
      return list(`${prefix}/actions/runs/${readID(runID)}/artifacts?per_page=100`, value => {
        const result = artifact(value);
        if (result.workflow_run.id !== runID) throw Error("github-read-artifact-run-changed");
        return result;
      }, "artifacts");
    },
    artifact(id: number): ArtifactInput {
      const result = artifact(reader.get(`${prefix}/actions/artifacts/${readID(id)}`));
      if (result.id !== id) throw Error("github-read-artifact-changed");
      return result;
    },
    ref(ref: string) {
      if (!/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9_./-]*$/u.test(ref) || ref.includes("..") || ref.includes("//")
        || ref.split("/").some(part => !part || part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock"))) throw Error("invalid-github-git-ref");
      const object = readObject(reader.get(`${prefix}/git/ref/${ref.slice(5).split("/").map(encodeURIComponent).join("/")}`));
      const target = readObject(object.object);
      if (object.ref !== ref || target.type !== "commit") throw Error("github-git-ref-changed");
      return { ref, sha: readSHA(target.sha) };
    },
    commit(sha: string) {
      readSHA(sha);
      const object = readObject(reader.get(`${prefix}/git/commits/${sha}`));
      if (readSHA(object.sha) !== sha || !Array.isArray(object.parents) || typeof object.message !== "string") throw Error("invalid-github-git-commit");
      return { sha, tree_sha: readSHA(readObject(object.tree).sha), parents: object.parents.map(parent => readSHA(readObject(parent).sha)), message: object.message };
    },
    tree(sha: string, maxEntries = 10000) {
      readSHA(sha);
      return readGitTree(reader.get(`${prefix}/git/trees/${sha}`), sha, maxEntries);
    },
    blob(sha: string, maxBytes = 16 * 1024 * 1024): Buffer {
      readSHA(sha);
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw Error("invalid-github-git-blob-bound");
      const object = readObject(reader.get(`${prefix}/git/blobs/${sha}`));
      if (readSHA(object.sha) !== sha || object.encoding !== "base64" || typeof object.content !== "string"
        || typeof object.size !== "number" || !Number.isSafeInteger(object.size) || object.size < 0 || object.size > maxBytes
        || object.content.length > Math.ceil(maxBytes / 3) * 4 * 2 + 2) throw Error("invalid-github-git-blob");
      const encoded = object.content.replaceAll(/\r?\n/gu, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded) || encoded.length % 4 !== 0) throw Error("invalid-github-git-blob-base64");
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.toString("base64") !== encoded || bytes.length !== object.size || gitObjectSHA("blob", bytes, sha) !== sha) throw Error("github-git-blob-digest-mismatch");
      return bytes;
    },
    trace: reader.trace,
  };
}
