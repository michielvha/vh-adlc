import type { Reader, ReadRequest } from "./collect";
import type { Settings } from "./types";

export function parsePage(raw: string, expected: { hostname: string; endpoint: string; page: number }): { items: unknown[]; next: number | null } {
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
  if (expected.hostname !== "github.com") acceptedPaths.push(`/api/v3${base.pathname}`.toLowerCase());
  if (next.protocol !== "https:" || next.hostname !== apiHost || next.username || next.password || next.port || next.hash ||
      !acceptedPaths.includes(next.pathname.toLowerCase())) throw new Error("next-page-target-changed");
  const keys = new Set([...base.searchParams.keys(), ...next.searchParams.keys()]);
  keys.delete("page");
  for (const key of keys) if (JSON.stringify(base.searchParams.getAll(key)) !== JSON.stringify(next.searchParams.getAll(key))) throw new Error("next-page-scope-changed");
  const value = next.searchParams.get("page");
  if (next.searchParams.getAll("page").length !== 1 || !value || !/^\d+$/.test(value) || Number(value) !== expected.page + 1) throw new Error("invalid-next-page");
  return { items, next: Number(value) };
}

export function githubReader(config: Settings): Reader {
  return { async page(request: ReadRequest, page: number) {
    if (!Number.isSafeInteger(page) || page < 1) throw new Error("invalid-page");
    const base = `repos/${config.repository}`;
    let endpoint: string;
    if (request.kind === "issues") endpoint = `${base}/issues?state=all&sort=created&direction=asc&per_page=100`;
    else if (request.kind === "pulls") endpoint = `${base}/pulls?state=closed&sort=created&direction=asc&per_page=100`;
    else if (request.kind === "comments" && Number.isSafeInteger(request.issue) && request.issue! > 0) endpoint = `${base}/issues/${request.issue}/comments?per_page=100`;
    else throw new Error("unsupported-read-request");
    const result = Bun.spawnSync(["gh", "api", "--hostname", config.hostname, "--method", "GET", "--include", `${endpoint}&page=${page}`], {
      env: { ...process.env, GH_PROMPT_DISABLED: "1" }, stdout: "pipe", stderr: "pipe", timeout: 60_000,
    });
    if (result.exitCode !== 0) throw new Error("github-read-failed");
    return parsePage(result.stdout.toString(), { hostname: config.hostname, endpoint, page });
  } };
}
