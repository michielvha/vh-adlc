import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import type { Environment, OwnershipGit } from "./git";

export type Writer = { fingerprint: string; host: string; locator: string; checkout: string };
export type Item = { issue?: string; spec?: string; branch?: string };
export type Association = { aliases: string[]; locator: string; claimed: boolean };

export function repositoryURL(raw: string): string {
  const scp = /^git@([a-z0-9.-]+):([^/][^?#]*)$/i.exec(raw);
  let url: URL;
  try { url = new URL(scp ? `ssh://git@${scp[1]}/${scp[2]}` : raw); }
  catch { throw Error("origin does not identify a supported Git repository"); }
  const host = url.hostname === "ssh.github.com" ? "github.com" : url.hostname;
  const repository = url.pathname.replace(/^\//, "").replace(/\/$/, "").replace(/\.git$/i, "");
  if (!/^[a-z0-9.-]+$/i.test(host) || !/^[a-z0-9-]+\/[a-z0-9_.-]+$/i.test(repository) ||
      repository.split("/").some(part => part === "." || part === "..") || url.password || url.search || url.hash ||
      (url.protocol !== "ssh:" && url.protocol !== "https:") ||
      (url.protocol === "ssh:" && url.username !== "git") ||
      (url.protocol === "https:" && url.username && !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(url.username)) ||
      (url.port && !(url.protocol === "ssh:" && url.hostname === "ssh.github.com" && url.port === "443"))) {
    throw Error("origin does not identify a supported Git repository");
  }
  return `${host}/${repository}`.toLowerCase();
}

export function verifyDestination(git: OwnershipGit): string {
  const fetch = git.urls(false);
  const push = git.urls(true);
  if (fetch.length !== 1 || push.length !== 1 || repositoryURL(fetch[0]!) !== repositoryURL(push[0]!)) {
    throw Error("origin fetch and push destinations must identify one canonical repository");
  }
  return repositoryURL(fetch[0]!);
}

export function writer(env: Environment, locator: string, client?: string, host = hostname()): Omit<Writer, "checkout"> {
  const codex = Boolean(env.CODEX_THREAD_ID || env.CODEX_SESSION_ID);
  const claude = Boolean(env.CLAUDECODE || env.CLAUDE_CODE_SESSION_ID);
  const kind = codex && !claude ? "codex" : claude && !codex ? "claude" : undefined;
  const id = kind === "codex" ? env.CODEX_THREAD_ID : kind === "claude" ? env.CLAUDE_CODE_SESSION_ID : undefined;
  if (!kind || !id || (client !== undefined && client !== kind) || !/^[a-z0-9_-]{1,200}$/i.test(id)) {
    throw Error("use an ordinary Codex or Claude Code session with an unambiguous session identity");
  }
  if (!validHost(host) || !validLocator(locator)) throw Error("work location is invalid");
  return { fingerprint: createHash("sha256").update(`${kind}:\0${id}`).digest("hex"), host, locator };
}

export function validHost(host: string): boolean { return /^[a-z0-9][a-z0-9.-]{0,252}$/i.test(host); }

function safePath(path: string): boolean {
  return path.length > 0 && path.length <= 512 && !/[\x00-\x1f\x7f\\:]/.test(path) &&
    path.split("/").every(part => !!part && ![".", "..", ".git"].includes(part.toLowerCase()));
}

function issueNumber(issue: unknown, repository: string): string | undefined {
  if (issue === null || issue === undefined) return undefined;
  if (typeof issue !== "string") throw Error("invalid feature issue");
  const numeric = /^#?([1-9][0-9]{0,14})$/.exec(issue);
  if (numeric) return numeric[1];
  const url = /^https:\/\/([a-z0-9.-]+\/[a-z0-9-]+\/[a-z0-9_.-]+)\/issues\/([1-9][0-9]{0,14})$/i.exec(issue);
  if (!url || url[1]?.toLowerCase() !== repository) throw Error("feature issue does not identify the canonical repository");
  return url[2];
}

function fields(raw: string): Record<string, unknown> | undefined {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw)?.[1];
  if (block === undefined) return undefined;
  let value: unknown;
  try { value = Bun.YAML.parse(block); } catch { throw Error("invalid feature frontmatter"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function validLocator(locator: string): boolean {
  const spec = locator.startsWith("spec:");
  const path = locator.slice(spec ? 5 : 7);
  return safePath(path) && (spec ? path.endsWith(".md") : locator.startsWith("branch:"));
}

export function validAlias(alias: string): boolean {
  return /^issue:[1-9][0-9]{0,14}$/.test(alias) || (alias.startsWith("spec:") && validLocator(alias));
}

function featureRoot(raw: string | undefined): string {
  const root = (raw?.match(/^Feature documents: `?([^\s`]+)`?$/m)?.[1] ?? "docs/internal/plans").replace(/\/$/, "");
  if (!safePath(root)) throw Error("invalid feature document root");
  return root;
}

function validateSpec(spec: string, root: string) {
  if (!safePath(spec) || !spec.startsWith(`${root}/`) || !spec.endsWith(".md")) throw Error("spec path is outside the canonical feature root");
}

export function privateDraft(git: OwnershipGit, path: string): void {
  const head = git.lookup("HEAD");
  const instructions = join(git.root, "AGENTS.md");
  const raw = head ? git.file(head, "AGENTS.md") : existsSync(instructions) && lstatSync(instructions).isFile() ? readFileSync(instructions, "utf8") : undefined;
  validateSpec(path, featureRoot(raw));
  let located = git.root;
  for (const [index, component] of path.split("/").entries()) {
    located = join(located, component);
    try {
      const state = lstatSync(located);
      if (!state.isDirectory() || index === path.split("/").length - 1) throw Error("private draft must be a new file in this checkout");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (head && git.file(head, path) !== undefined) throw Error("private draft must be a new file in this checkout");
}

export function associate(git: OwnershipGit, main: string, repository: string, item: Item, branch: string): Association {
  if ([item.issue, item.spec, item.branch].filter(value => value !== undefined).length !== 1) {
    throw Error("select exactly one issue, spec or feature branch");
  }
  const root = featureRoot(git.file(main, "AGENTS.md"));
  if (item.spec) validateSpec(item.spec, root);
  const selected = item.spec ? git.file(main, item.spec) : undefined;
  const number = issueNumber(selected ? fields(selected)?.issue : item.issue, repository);
  const search = number ?? item.branch;
  const candidates = new Set([...(search ? git.matchingFiles(main, root, search) : []), ...(item.spec ? [item.spec] : [])]);
  const matches: { path: string; issue?: string; branch?: string }[] = [];
  for (const path of candidates) {
    if (!path.endsWith(".md")) continue;
    const raw = git.file(main, path);
    if (!raw) continue;
    let data: Record<string, unknown> | undefined;
    try { data = fields(raw); }
    catch (error) { if (path === item.spec) throw error; continue; }
    if (!data) continue;
    let issue: string | undefined;
    try { issue = issueNumber(data.issue, repository); }
    catch (error) { if (path === item.spec || (item.branch && item.branch === data.branch)) throw error; continue; }
    const claimedBranch = typeof data.branch === "string" && data.branch ? data.branch : undefined;
    if (path === item.spec || (number && issue === number) || (item.branch && item.branch === claimedBranch)) {
      matches.push({ path, issue, branch: claimedBranch });
    }
  }
  if (matches.length > 1 || (item.branch && matches.length !== 1)) throw Error("feature identity is unresolved or ambiguous");
  const match = matches[0];
  const spec = match?.path ?? item.spec;
  const issue = match?.issue ?? number;
  const aliases = [...(issue ? [`issue:${issue}`] : []), ...(spec ? [`spec:${spec}`] : [])];
  if (!aliases.length || aliases.some(alias => !validAlias(alias))) throw Error("feature has no canonical identity");
  const locator = match?.branch ? `branch:${match.branch}` : spec ? `spec:${spec}` : `branch:${branch}`;
  return { aliases, locator, claimed: Boolean(match?.branch) };
}
