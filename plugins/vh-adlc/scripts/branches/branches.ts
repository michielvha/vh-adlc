import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

export type Result = { code: number; stdout: string; stderr: string };
export type Run = (argv: string[]) => Result;

/** Fixed argv only: branch names, PR text and settings never reach a shell. */
export const spawn: Run = argv => {
  const result = Bun.spawnSync(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1" } });
  return { code: result.exitCode ?? 1, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
};

export type Operation =
  | { kind: "enable-auto-delete" }
  | { kind: "delete-remote"; branch: string; oid: string; proof: string }
  | { kind: "prune-tracking"; ref: string; oid: string }
  | { kind: "remove-worktree"; path: string; branch: string; oid: string; proof: string }
  | { kind: "delete-local"; branch: string; oid: string; proof: string };
export type Kept = { scope: "remote" | "local"; branch: string; reason: string };
export interface Plan {
  schema_version: 1; repository: string; default_branch: string; default_oid: string;
  delete_branch_on_merge: boolean; worktrees: boolean; operations: Operation[]; kept: Kept[];
}
export type Outcome = { operation: Operation; status: "done" | "already-absent" | "changed" | "failed"; detail?: string };
export interface Options { repo: string; repository?: string; worktrees?: boolean; now?: number; run?: Run }

const kinds: Operation["kind"][] = ["enable-auto-delete", "delete-remote", "prune-tracking", "remove-worktree", "delete-local"];
const recentSeconds = 7 * 24 * 3600;
const redact = (text: string) => text.replace(/:\/\/[^/@\s]+@/g, "://***@").trim().split("\n")[0]?.slice(0, 300) ?? "";
export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const same = (a: Operation, b: Operation) => JSON.stringify(a) === JSON.stringify(b);

type Pull = { number: number; head: string; sha: string; repository: string; base: string; merged: boolean };
type Worktree = { path: string; branch?: string; locked: boolean; prunable: boolean; busy: boolean };

function object(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`unexpected ${what} shape`);
  return value as Record<string, unknown>;
}
function pull(value: unknown): Pull {
  const v = object(value, "pull request"), head = object(v.head, "pull request head"), base = object(v.base, "pull request base");
  const repo = head.repo === null || head.repo === undefined ? null : object(head.repo, "head repository");
  if (typeof v.number !== "number" || typeof head.ref !== "string" || typeof head.sha !== "string" || typeof base.ref !== "string") throw new Error("unexpected pull request fields");
  return { number: v.number, head: head.ref, sha: head.sha, repository: typeof repo?.full_name === "string" ? repo.full_name : "", base: base.ref, merged: typeof v.merged_at === "string" };
}

/** Parse a GitHub origin URL into hostname and owner/name; an SSH host alias maps to github.com. */
export function parseOrigin(url: string): { hostname: string; repository: string } | null {
  const match = /^(?:[a-z][a-z+]*:\/\/)?(?:[^@/]+@)?([^/:]+)(?::\d+)?[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(url.trim());
  if (!match) return null;
  const host = match[1]!.toLowerCase();
  return { hostname: host.includes(".") && host !== "ssh.github.com" ? host : "github.com", repository: `${match[2]}/${match[3]}` };
}

export class Checkout {
  readonly root: string; readonly repository: string; readonly hostname: string;
  private readonly exec: Run;
  private readonly pulls = new Map<string, Pull[]>();
  constructor(options: Options) {
    this.exec = options.run ?? spawn;
    const top = this.exec(["git", "-C", options.repo, "rev-parse", "--show-toplevel"]);
    if (top.code !== 0) throw new Error("repository checkout unavailable");
    this.root = top.stdout.trim();
    const parsed = parseOrigin(this.git(["remote", "get-url", "origin"]));
    if (options.repository !== undefined && !/^[^/\s]+\/[^/\s]+$/.test(options.repository)) throw new Error("--repository must be OWNER/NAME");
    if (parsed && options.repository && parsed.repository.toLowerCase() !== options.repository.toLowerCase()) throw new Error(`origin is ${parsed.repository}, not ${options.repository}`);
    const repository = options.repository ?? parsed?.repository;
    if (!repository) throw new Error("origin is not a GitHub repository; pass --repository OWNER/NAME");
    this.repository = repository;
    this.hostname = parsed?.hostname ?? "github.com";
  }
  git(args: string[], allowFailure = false): string {
    const result = this.exec(["git", "-C", this.root, ...args]);
    if (result.code !== 0 && !allowFailure) throw new Error(`git ${args[0]} failed: ${redact(result.stderr)}`);
    return result.code === 0 ? result.stdout : "";
  }
  ok(args: string[]): boolean { return this.exec(["git", "-C", this.root, ...args]).code === 0; }
  api(path: string): unknown {
    const result = this.exec(["gh", "api", "--hostname", this.hostname, path]);
    if (result.code !== 0) throw new Error(`GitHub request ${path.split("?")[0]} failed; verify access, network and rate limits`);
    return JSON.parse(result.stdout);
  }
  list(path: string): unknown[] {
    const result = this.exec(["gh", "api", "--hostname", this.hostname, "--paginate", "--jq", ".[]", path]);
    if (result.code !== 0) throw new Error(`GitHub request ${path.split("?")[0]} failed; verify access, network and rate limits`);
    return result.stdout.split("\n").filter(line => line.trim()).map(line => JSON.parse(line));
  }
  merged(branch: string): Pull[] {
    const owner = this.repository.split("/")[0]!, key = this.repository.toLowerCase();
    if (!this.pulls.has(branch)) this.pulls.set(branch, this.list(`repos/${this.repository}/pulls?state=closed&head=${encodeURIComponent(`${owner}:${branch}`)}&per_page=100`).map(pull).filter(p => p.merged && p.head === branch && p.repository.toLowerCase() === key));
    return this.pulls.get(branch)!;
  }
  pull(number: number): Pull { return pull(this.api(`repos/${this.repository}/pulls/${number}`)); }
  hasCommit(oid: string, pullNumber?: number): boolean {
    if (this.ok(["cat-file", "-e", `${oid}^{commit}`])) return true;
    if (pullNumber === undefined) return false;
    this.git(["fetch", "--quiet", "--no-tags", "origin", `refs/pull/${pullNumber}/head`], true);
    return this.ok(["cat-file", "-e", `${oid}^{commit}`]);
  }
  ancestor(oid: string, of: string): boolean { return oid === of || this.ok(["merge-base", "--is-ancestor", oid, of]); }
}

interface Observation {
  checkout: Checkout; plan: Plan; remote: Map<string, string>; tracking: Map<string, string>;
  local: Map<string, string>; worktrees: Worktree[];
}

function worktrees(checkout: Checkout): Worktree[] {
  const entries: Worktree[] = [];
  for (const block of checkout.git(["worktree", "list", "--porcelain"]).split("\n\n")) {
    const lines = block.split("\n").filter(Boolean), path = lines.find(l => l.startsWith("worktree "))?.slice(9);
    if (!path) continue;
    const flag = (name: string) => lines.some(l => l === name || l.startsWith(`${name} `));
    let branch = lines.find(l => l.startsWith("branch refs/heads/"))?.slice(18), busy = false;
    // A rebase or bisect detaches HEAD but still owns its branch; git branch -d refuses it too.
    if (!branch && !flag("prunable")) {
      const dir = checkout.git(["-C", path, "rev-parse", "--absolute-git-dir"], true).trim();
      const read = (name: string) => { const file = join(dir, name); return dir && existsSync(file) ? readFileSync(file, "utf8").trim() : ""; };
      const owner = read("rebase-merge/head-name") || read("rebase-apply/head-name") || (read("BISECT_START") && `refs/heads/${read("BISECT_START")}`);
      if (owner.startsWith("refs/heads/")) { branch = owner.slice(11); busy = true; }
    }
    entries.push({ path, branch, locked: flag("locked"), prunable: flag("prunable"), busy });
  }
  return entries;
}
function refs(checkout: Checkout, prefix: string): Map<string, string> {
  const rows = checkout.git(["for-each-ref", "--format=%(refname)%00%(objectname)%00%(symref)", prefix]).split("\n").filter(Boolean).map(line => line.split("\0"));
  return new Map(rows.filter(([, , symref]) => !symref).map(([name, oid]) => [name!.slice(prefix.length), oid!]));
}
const real = (path: string) => { try { return realpathSync(path); } catch { return path; } };

/** Observe remote and local state and classify every branch. It fetches but never deletes. */
/** With `merged`, only containment in that PR's merged head proves a branch; otherwise any proof below applies. */
export function observe(options: Options, only?: (branch: string) => boolean, merged?: Pull): Observation {
  const checkout = new Checkout(options), now = options.now ?? Date.now() / 1000;
  const info = object(checkout.api(`repos/${checkout.repository}`), "repository");
  if (typeof info.default_branch !== "string") throw new Error("repository default branch unknown");
  const defaultBranch = info.default_branch, autoDelete = info.delete_branch_on_merge === true;
  checkout.git(["fetch", "--quiet", "--no-tags", "origin"]);
  const remote = new Map(checkout.git(["ls-remote", "--heads", "origin"]).split("\n").filter(Boolean).map(line => {
    const [oid, ref] = line.split("\t");
    return [ref!.replace(/^refs\/heads\//, ""), oid!] as [string, string];
  }));
  const defaultOid = remote.get(defaultBranch);
  if (!defaultOid || !checkout.hasCommit(defaultOid)) throw new Error(`default branch ${defaultBranch} not observed on origin`);
  const protectedNames = new Set(checkout.list(`repos/${checkout.repository}/branches?protected=true&per_page=100`).map(b => String(object(b, "branch").name)));
  const open = checkout.list(`repos/${checkout.repository}/pulls?state=open&per_page=100`).map(pull);
  const plan: Plan = { schema_version: 1, repository: checkout.repository, default_branch: defaultBranch, default_oid: defaultOid, delete_branch_on_merge: autoDelete, worktrees: options.worktrees === true, operations: [], kept: [] };
  if (!autoDelete && !only) plan.operations.push({ kind: "enable-auto-delete" });
  const keep = (scope: Kept["scope"], branch: string, reason: string) => { plan.kept.push({ scope, branch, reason }); };

  // A merged PR head or the default branch must contain the tip; nothing else proves the work is kept.
  let mainline: Set<string> | undefined;
  const proof = (oid: string, name: string): { proof?: string; reason?: string } => {
    if (!checkout.hasCommit(oid)) return { reason: "tip commit unavailable locally" };
    if (merged) return checkout.hasCommit(merged.sha, merged.number) && checkout.ancestor(oid, merged.sha) ? { proof: `contained in merged PR #${merged.number} head ${merged.sha.slice(0, 12)}` } : { reason: `commits outside merged PR #${merged.number}` };
    for (const p of checkout.merged(name)) if (checkout.hasCommit(p.sha, p.number) && checkout.ancestor(oid, p.sha)) return { proof: `contained in merged PR #${p.number} head ${p.sha.slice(0, 12)}` };
    if (oid === defaultOid) return { reason: `no commits beyond ${defaultBranch} and no merged PR` };
    if (!checkout.ancestor(oid, defaultOid)) return { reason: "unmerged commits" };
    mainline ??= new Set(checkout.git(["rev-list", "--first-parent", defaultOid]).split("\n"));
    if (mainline.has(oid)) return { reason: `points at a commit on ${defaultBranch}'s own history and has no merged PR` };
    const age = now - Number(checkout.git(["log", "-1", "--format=%ct", oid]).trim());
    return age < recentSeconds ? { reason: "reachable from the default branch but committed within 7 days and no merged PR" } : { proof: `reachable from ${defaultBranch} ${defaultOid.slice(0, 12)}` };
  };

  for (const [branch, oid] of [...remote].sort()) {
    if (branch === defaultBranch || (only && !only(branch))) continue;
    const head = open.find(p => p.head === branch && p.repository.toLowerCase() === checkout.repository.toLowerCase()), base = open.find(p => p.base === branch);
    if (protectedNames.has(branch)) keep("remote", branch, "protected");
    else if (head) keep("remote", branch, `head of open PR #${head.number}`);
    else if (base) keep("remote", branch, `base of open PR #${base.number}`);
    else {
      const r = proof(oid, branch);
      if (r.proof) plan.operations.push({ kind: "delete-remote", branch, oid, proof: r.proof });
      else keep("remote", branch, r.reason!);
    }
  }

  const tracking = refs(checkout, "refs/remotes/origin/");
  for (const [branch, oid] of [...tracking].sort()) if (!remote.has(branch) && (!only || only(branch))) plan.operations.push({ kind: "prune-tracking", ref: `refs/remotes/origin/${branch}`, oid });

  const local = refs(checkout, "refs/heads/"), trees = worktrees(checkout), main = trees[0]?.path, invoking = real(checkout.root);
  for (const [branch, oid] of [...local].sort()) {
    const upstream = checkout.git(["for-each-ref", "--format=%(upstream)", `refs/heads/${branch}`]).trim();
    const name = upstream.startsWith("refs/remotes/origin/") ? upstream.slice("refs/remotes/origin/".length) : branch;
    if (branch === defaultBranch || (only && !only(branch) && !only(name))) continue;
    const r = proof(oid, name);
    if (!r.proof) { keep("local", branch, r.reason!); continue; }
    const tree = trees.find(t => t.branch === branch);
    if (tree) {
      const dirty = !tree.prunable && checkout.git(["-C", tree.path, "status", "--porcelain", "--ignored"], true).trim() !== "";
      const blocker = tree.busy ? "a worktree with a rebase or bisect in progress" : tree.path === main ? "the main worktree" : real(tree.path) === invoking ? "the invoking worktree" : tree.locked ? "a locked worktree" : tree.prunable ? "a worktree whose directory is missing" : dirty ? "a worktree with changed, untracked or ignored files" : !plan.worktrees ? "a clean worktree; pass --worktrees true to remove it" : "";
      if (blocker) { keep("local", branch, `merged but checked out in ${blocker} (${tree.path})`); continue; }
      plan.operations.push({ kind: "remove-worktree", path: tree.path, branch, oid, proof: r.proof });
    }
    plan.operations.push({ kind: "delete-local", branch, oid, proof: r.proof });
  }
  plan.operations.sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
  return { checkout, plan, remote, tracking, local, worktrees: trees };
}

function absent(o: Observation, op: Operation): boolean {
  switch (op.kind) {
    case "enable-auto-delete": return o.plan.delete_branch_on_merge;
    case "delete-remote": return !o.remote.has(op.branch);
    case "prune-tracking": return !o.tracking.has(op.ref.slice("refs/remotes/origin/".length));
    case "remove-worktree": return !o.worktrees.some(t => t.path === op.path);
    case "delete-local": return !o.local.has(op.branch);
  }
}

type Target = { hostname: string; repository: string };
/** Turn on GitHub's delete_branch_on_merge and confirm it from GitHub's answer, not from the request. */
function enableAutoDelete(target: Target, run: Run): Outcome {
  const op: Operation = { kind: "enable-auto-delete" };
  const result = run(["gh", "api", "--hostname", target.hostname, "-X", "PATCH", `repos/${target.repository}`, "-F", "delete_branch_on_merge=true"]);
  if (result.code !== 0) return { operation: op, status: "failed", detail: redact(result.stderr) || `exit ${result.code}` };
  return object(JSON.parse(result.stdout), "repository").delete_branch_on_merge === true ? { operation: op, status: "done" } : { operation: op, status: "failed", detail: "setting did not change" };
}

function perform(checkout: Checkout, op: Operation, run: Run): Outcome {
  const git = (args: string[]) => run(["git", "-C", checkout.root, ...args]);
  let result: Result;
  switch (op.kind) {
    case "enable-auto-delete": return enableAutoDelete(checkout, run);
    // The server applies the lease atomically, so a tip that moved after observation is refused.
    case "delete-remote": result = git(["push", "--porcelain", `--force-with-lease=refs/heads/${op.branch}:${op.oid}`, "origin", `:refs/heads/${op.branch}`]); break;
    case "prune-tracking": result = git(["update-ref", "-d", op.ref, op.oid]); break;
    case "remove-worktree": result = git(["worktree", "remove", op.path]); break;
    // Compare-and-delete: refuses when the branch moved; the proof already shows its commits are merged.
    case "delete-local":
      result = git(["update-ref", "-d", `refs/heads/${op.branch}`, op.oid]);
      if (result.code === 0) git(["config", "--remove-section", `branch.${op.branch}`]);
      break;
  }
  return result.code === 0 ? { operation: op, status: "done" } : { operation: op, status: "failed", detail: redact(result.stderr) || `exit ${result.code}` };
}

/** Re-observe, then perform each approved operation only if a fresh plan still proposes it unchanged. */
function execute(options: Options, approved: Operation[], only?: (branch: string) => boolean, merged?: Pull): Outcome[] {
  const fresh = observe(options, only, merged), run = options.run ?? spawn, outcomes: Outcome[] = [], blocked = new Set<string>();
  for (const op of approved) {
    if (op.kind === "delete-local" && blocked.has(op.branch)) { outcomes.push({ operation: op, status: "failed", detail: "its worktree was not removed" }); continue; }
    if (!fresh.plan.operations.some(candidate => same(candidate, op))) { outcomes.push({ operation: op, status: absent(fresh, op) ? "already-absent" : "changed" }); continue; }
    const outcome = perform(fresh.checkout, op, run);
    if (outcome.status === "failed" && op.kind === "remove-worktree") blocked.add(op.branch);
    outcomes.push(outcome);
  }
  return outcomes;
}
const complete = (outcomes: Outcome[]) => outcomes.every(o => o.status === "done" || o.status === "already-absent");

export function parsePlan(text: string): Plan {
  const plan = object(JSON.parse(text), "plan");
  if (plan.schema_version !== 1 || typeof plan.repository !== "string" || typeof plan.worktrees !== "boolean" || !Array.isArray(plan.operations)) throw new Error("unsupported branch plan");
  for (const op of plan.operations) if (!kinds.includes(object(op, "operation").kind as Operation["kind"])) throw new Error("unsupported branch operation");
  return plan as unknown as Plan;
}

/** Apply an owner-approved plan. Approval binds the exact plan bytes. */
export function apply(options: Options, text: string, approvedDigest: string) {
  if (digest(text) !== approvedDigest) throw new Error("approved digest does not match this plan");
  const plan = parsePlan(text);
  const outcomes = execute({ ...options, repository: plan.repository, worktrees: plan.worktrees }, plan.operations);
  return { repository: plan.repository, complete: complete(outcomes), outcomes };
}

/**
 * Report GitHub's delete_branch_on_merge; `enable` turns it on. Without `repo`, `repository` names the
 * github.com repository directly, so an uncloned repository can be checked. Complete means the setting is on.
 */
export function autoDelete(options: { repo?: string; repository?: string; enable?: boolean; run?: Run }) {
  const run = options.run ?? spawn;
  if (options.repo === undefined && !/^[^/\s]+\/[^/\s]+$/.test(options.repository ?? "")) throw new Error("pass --repo PATH or --repository OWNER/NAME");
  const target: Target = options.repo === undefined ? { hostname: "github.com", repository: options.repository! } : new Checkout({ repo: options.repo, repository: options.repository, run });
  const read = run(["gh", "api", "--hostname", target.hostname, `repos/${target.repository}`]);
  if (read.code !== 0) throw new Error("GitHub request repos failed; verify access, network and rate limits");
  const on = object(JSON.parse(read.stdout), "repository").delete_branch_on_merge === true;
  const base = { repository: target.repository, hostname: target.hostname };
  if (on || !options.enable) return { ...base, delete_branch_on_merge: on, changed: false, complete: on, ...(on ? {} : { note: "Merged PR branches stay on GitHub until this is on; ask the owner to enable it" }) };
  const outcome = enableAutoDelete(target, run);
  return { ...base, delete_branch_on_merge: outcome.status === "done", changed: outcome.status === "done", complete: outcome.status === "done", ...(outcome.detail ? { detail: outcome.detail } : {}) };
}

/** Finish one owner-authorized merge: remove that PR's head branch remotely and locally once proven merged. */
export function afterMerge(options: Options, number: number) {
  const checkout = new Checkout(options), pr = checkout.pull(number);
  if (!pr.merged) throw new Error(`PR #${number} is not merged`);
  if (pr.repository.toLowerCase() !== checkout.repository.toLowerCase()) return { repository: checkout.repository, pull: number, branch: pr.head, complete: true, outcomes: [], kept: [], note: `PR #${number} came from ${pr.repository || "a deleted fork"}; no branch in this repository belongs to it` };
  const only = (branch: string) => branch === pr.head;
  const observed = observe(options, only, pr);
  const outcomes = execute(options, observed.plan.operations, only, pr);
  return {
    repository: observed.plan.repository, pull: number, branch: pr.head, complete: complete(outcomes), outcomes, kept: observed.plan.kept,
    delete_branch_on_merge: observed.plan.delete_branch_on_merge,
    ...(observed.plan.delete_branch_on_merge ? {} : { note: "GitHub automatic head-branch deletion is off; a branch-hygiene plan proposes enabling it" }),
  };
}
