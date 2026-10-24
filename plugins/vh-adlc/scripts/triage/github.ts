import type { Reader, ReadRequest } from "./collect";
import { normalizeIssue, normalizeComment, normalizeLabel } from "./collect";
import { MutationFailure } from "./execute";
import type { Settings } from "./types";

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

export function githubReader(config: Settings): Reader {
  let repositoryId: number | null = null;
  const chains = new Map<string, Map<number, string>>();
  return { async identity(){
    const result=Bun.spawnSync(["gh","api","--hostname",config.hostname,"--method","GET","user","--jq",".login"],{env:{...process.env,GH_PROMPT_DISABLED:"1"},stdout:"pipe",stderr:"pipe",timeout:60_000});
    const login=result.stdout.toString().trim();if(result.exitCode!==0||!/^[a-z0-9][a-z0-9-]*(?:\[bot\])?$/i.test(login))throw Error("github-actor-unavailable");return login;
  },async page(request: ReadRequest, page: number) {
    if (!Number.isSafeInteger(page) || page < 1) throw new Error("invalid-page");
    const base = `repos/${config.repository}`;
    let endpoint: string;
    if (request.kind === "issues") endpoint = `${base}/issues?state=all&sort=created&direction=asc&per_page=100`;
    else if (request.kind === "pulls") endpoint = `${base}/pulls?state=closed&sort=created&direction=asc&per_page=100`;
    else if (request.kind === "labels") endpoint=`${base}/labels?per_page=100`;
    else if (request.kind === "comments" && Number.isSafeInteger(request.issue) && request.issue! > 0) endpoint = `${base}/issues/${request.issue}/comments?per_page=100`;
    else if (request.kind === "events" && Number.isSafeInteger(request.issue) && request.issue! > 0) endpoint=`${base}/issues/${request.issue}/events?per_page=100`;
    else throw new Error("unsupported-read-request");
    if (repositoryId === null) {
      const identity = Bun.spawnSync(["gh", "api", "--hostname", config.hostname, "--method", "GET", base, "--jq", ".id"], {
        env: { ...process.env, GH_PROMPT_DISABLED: "1" }, stdout: "pipe", stderr: "pipe", timeout: 60_000,
      });
      const value = identity.stdout.toString().trim();
      if (identity.exitCode !== 0 || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("github-repository-identity-unavailable");
      repositoryId = Number(value);
    }
    if (page === 1) chains.set(endpoint, new Map([[1, `${endpoint}&page=1`]]));
    const chain = chains.get(endpoint), target = chain?.get(page);
    if (!chain || !target) throw new Error("unvalidated-next-page");
    const result = Bun.spawnSync(["gh", "api", "--hostname", config.hostname, "--method", "GET", "--include", target], {
      env: { ...process.env, GH_PROMPT_DISABLED: "1" }, stdout: "pipe", stderr: "pipe", timeout: 60_000,
    });
    if (result.exitCode !== 0) throw new Error("github-read-failed");
    return parsePage(result.stdout.toString(), { hostname: config.hostname, endpoint, page, repositoryId, onNext(url) {
      if ([...chain.values()].includes(url)) throw new Error("repeated-next-url");
      chain.set(page + 1, url);
    } });
  } };
}

/** Explicit write adapter; collection never imports or instantiates this path. */
export function githubExecutor(config: Settings): import("./execute").Adapter {
  const base = `repos/${config.repository}`, reader = githubReader(config);
  function request(method: string, endpoint: string, payload?: unknown): unknown {
    const args = ["gh", "api", "--hostname", config.hostname, "--method", method, "--include", endpoint];
    if (payload !== undefined) args.push("--input", "-");
    const result = Bun.spawnSync(args, { env: { ...process.env, GH_PROMPT_DISABLED: "1" },
      ...(payload !== undefined ? { stdin: Buffer.from(JSON.stringify(payload)) } : {}), stdout: "pipe", stderr: "pipe", timeout: 60_000 });
    const raw = result.stdout.toString(), status = Number(raw.match(/^HTTP\/[\d.]+ (\d{3})(?:\s|$)/)?.[1]);
    if (result.exitCode !== 0 || status < 200 || status >= 300 || !status) {
      if (method !== "GET") throw new MutationFailure(!status || status >= 500 || status === 408);
      throw new Error("github-action-read-failed");
    }
    const split = raw.search(/\r?\n\r?\n/);
    if (split < 0) throw new Error("invalid-github-action-response");
    try { return JSON.parse(raw.slice(split).trim()); } catch { throw new Error("invalid-github-action-response"); }
  }
  let actor: string | null = null;
  function identity() {
    const user = request("GET", "user") as { login?: string };
    if (typeof user.login !== "string" || !user.login) throw new Error("github-actor-unavailable");
    if (actor !== null && actor.toLowerCase() !== user.login.toLowerCase()) throw new Error("github-actor-changed");
    actor = user.login;
    return actor;
  }
  async function all(kind: "issues" | "comments" | "labels" | "events", number?: number) {
    const result: unknown[] = []; let page = 1;
    while (true) {
      const response = await reader.page({ kind, ...(number ? { issue: number } : {}) }, page);
      result.push(...response.items);
      if (response.next === null) return result;
      if (response.next !== page + 1) throw new Error("invalid-execution-pagination");
      page = response.next;
    }
  }
  async function issue(number: number) {
    identity();
    const value = normalizeIssue(request("GET", `${base}/issues/${number}`));
    if (!value || value.number !== number) throw new Error("invalid-execution-issue");
    value.comments = (await all("comments", number)).map(normalizeComment);
    return value;
  }
  async function labels(){return(await all("labels")).map(normalizeLabel);}
  return { issue, labels,async identity(){return identity();},
    async receipt(key, action,context) {
      const login = identity(), marker = `<!-- vh-adlc-triage:${key} -->`;
      if(context && context.actor.toLowerCase()!==login.toLowerCase())throw Error("github-approved-actor-changed");
      const attributed=(event:{id:number;actor?:{login:string};created_at:string}|undefined)=>!!event&&!!context&&Number.isSafeInteger(event.id)&&event.id>0&&
        event.actor?.login.toLowerCase()===login.toLowerCase()&&Number.isFinite(Date.parse(event.created_at))&&Date.parse(event.created_at)>=Math.floor(Date.parse(context.attempted_at)/1000)*1000;
      if (action.kind === "comment") {
        const comments = (await all("comments", action.issue)).map(normalizeComment);
        const matches = comments.filter((comment) => comment.body.includes(marker) && comment.author.toLowerCase() === login.toLowerCase());
        if (matches.length > 1 || matches.some((comment) => comment.body !== action.body)) throw new Error("conflicting-comment-receipt");
        return matches.length ? {} : null;
      }
      if (action.kind === "create") {
        const matches = (await all("issues")).map(normalizeIssue).filter((value) => value && value.body.includes(marker) && value.author.toLowerCase() === login.toLowerCase());
        if (matches.length > 1 || matches.some((value) => value!.body !== action.body || value!.title !== action.title || JSON.stringify([...value!.labels].sort()) !== JSON.stringify([...action.labels].sort()))) throw new Error("conflicting-creation-receipt");
        return matches.length ? { number: matches[0]!.number, url: `https://${config.hostname}/${config.repository}/issues/${matches[0]!.number}` } : null;
      }
      if (action.kind === "labels") {
        const current = await issue(action.issue);
        if(!action.labels.every(label=>current.labels.includes(label))||!context)return null;
        const events=await all("events",action.issue) as {id:number;event:string;label?:{name:string};actor?:{login:string};created_at:string}[];
        return action.labels.every(name=>{
          const latest=events.filter(event=>["labeled","unlabeled"].includes(event.event)&&event.label?.name.toLowerCase()===name.toLowerCase()).sort((a,b)=>b.id-a.id)[0];
          return latest?.event==="labeled"&&attributed(latest);
        })?{}:null;
      }
      if (action.kind === "close") {
        const current = request("GET", `${base}/issues/${action.issue}`) as { state: string; state_reason: string };
        if(current.state!=="closed"||current.state_reason!==action.reason||!context)return null;
        const events=await all("events",action.issue) as {id:number;event:string;actor?:{login:string};created_at:string}[];
        const latest=events.filter(event=>["closed","reopened"].includes(event.event)).sort((a,b)=>b.id-a.id)[0];
        return latest?.event==="closed"&&attributed(latest)?{}:null;
      }
      // Exact body/label vocabulary equality alone cannot attribute a lost write.
      // Leave uncertain effects without a batch-attributable event blocked.
      if (action.kind === "checklist") return null;
      if (action.kind === "create-label") {
        return null;
      }
      return null;
    },
    async mutate(action) {
      try {
        identity();
        if(action.kind==="labels"||action.kind==="create"){
          const existing=await labels();
          if(action.labels.some(name=>!existing.some(label=>label.name.toLowerCase()===name.toLowerCase())))throw Error("implicit-label-creation-denied");
        }
      } catch { throw new MutationFailure(false); }
      if (action.kind === "comment") request("POST", `${base}/issues/${action.issue}/comments`, { body: action.body });
      else if (action.kind === "labels") request("POST", `${base}/issues/${action.issue}/labels`, { labels: action.labels });
      else if (action.kind === "close") request("PATCH", `${base}/issues/${action.issue}`, { state: "closed", state_reason: action.reason });
      else if (action.kind === "checklist") request("PATCH", `${base}/issues/${action.issue}`, { body: action.after });
      else if (action.kind === "create-label") request("POST", `${base}/labels`, { name: action.name, color: action.color, description: action.description });
      else if (action.kind === "create") {
        const result = request("POST", `${base}/issues`, { title: action.title, body: action.body, labels: action.labels }) as { number: number; html_url: string };
        if (!Number.isSafeInteger(result.number) || result.number <= 0 || result.html_url !== `https://${config.hostname}/${config.repository}/issues/${result.number}`) throw new Error("invalid-created-issue-identity");
        return { number: result.number, url: result.html_url };
      } else throw new Error("unsupported-github-mutation");
      return "issue" in action ? { issue: await issue(action.issue) } : {};
    },
  };
}
