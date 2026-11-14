import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export type Result = { code: number; stdout: string; stderr: string; timedOut?: boolean };
export type Run = (argv: string[]) => Result;

/** Fixed argv only: branch names, PR text and settings never reach a shell. */
export const spawn: Run = argv => {
  const result = Bun.spawnSync(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1" } });
  return { code: result.exitCode ?? 1, stdout: result.stdout.toString(), stderr: result.stderr.toString(), timedOut: result.exitedDueToTimeout === true };
};

export type Operation =
  | { kind: "enable-auto-delete" }
  | { kind: "delete-remote"; branch: string; oid: string; proof: string }
  | { kind: "prune-tracking"; ref: string; oid: string }
  | { kind: "remove-worktree"; path: string; branch?: string; oid: string; proof: string; ignored: Ignored[] }
  | { kind: "delete-local"; branch: string; oid: string; proof: string };
/** An ignored path as Git prints it, with the number of non-directory entries under it and their lstat bytes. */
export type Ignored = { path: string; files: number; bytes: number };
export type Kept = { scope: "remote" | "local"; branch: string; reason: string } | { scope: "worktree"; path: string; branch?: string; reason: string };
export interface Plan {
  schema_version: 2; repository: string; default_branch: string; default_oid: string;
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
/** `admin` is set only when exactly one admin directory names `<path>/.git`; `pointed` is where a present entry's `.git` leads. */
type Worktree = { path: string; branch?: string; locked: boolean; prunable: boolean; busy: boolean; pointed?: string; admin?: string; problems: string[] };

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
  call(args: string[]): Result { return this.exec(["git", "-C", this.root, ...args]); }
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

interface Context { checkout: Checkout; main?: string; invoking: string; worktrees: boolean }
interface Observation {
  checkout: Checkout; plan: Plan; remote: Map<string, string>; tracking: Map<string, string>;
  local: Map<string, string>; worktrees: Worktree[]; context: Context;
}

const few = (items: string[]) => items.slice(0, 3).join(", ") + (items.length > 3 ? ` and ${items.length - 3} more` : "");
const present = (path: string) => { try { lstatSync(path); return true; } catch { return false; } };

function worktrees(checkout: Checkout): Worktree[] {
  const entries: Worktree[] = [];
  const common = resolve(checkout.root, checkout.git(["rev-parse", "--git-common-dir"]).trim());
  // A relative gitdir, as worktree.useRelativePaths writes, is relative to the admin directory.
  const names = (admin: string) => { try { return resolve(admin, readFileSync(join(admin, "gitdir"), "utf8").trim()); } catch { return undefined; } };
  let admins: string[] | undefined;
  for (const block of checkout.git(["worktree", "list", "--porcelain"]).split("\n\n")) {
    const lines = block.split("\n").filter(Boolean), path = lines.find(l => l.startsWith("worktree "))?.slice(9);
    if (!path) continue;
    const flag = (name: string) => lines.some(l => l === name || l.startsWith(`${name} `));
    let branch = lines.find(l => l.startsWith("branch refs/heads/"))?.slice(18), busy = false, pointed: string | undefined, admin: string | undefined;
    const prunable = flag("prunable"), problems: string[] = [], want = resolve(path, ".git");
    if (!prunable) {
      const found = checkout.call(["-C", path, "rev-parse", "--absolute-git-dir"]);
      pointed = found.code === 0 && found.stdout.trim() ? found.stdout.trim() : undefined;
    }
    if (entries.length > 0) {
      if (!prunable) {
        if (!pointed) problems.push("admin directory not found: rev-parse --absolute-git-dir failed");
        else if (names(pointed) !== want) problems.push(`admin directory ${pointed} does not name this path`);
        else admin = pointed;
      } else {
        admins ??= (() => { try { return readdirSync(join(common, "worktrees")).map(name => join(common, "worktrees", name)); } catch { return []; } })();
        const matches = admins.filter(dir => names(dir) === want);
        if (matches.length === 1) admin = matches[0];
        else problems.push(matches.length ? `admin directory ambiguous: ${matches.length} admin directories name this path` : "admin directory not found");
      }
    }
    // A rebase or bisect detaches HEAD but still owns its branch; git branch -d refuses it too.
    if (!branch && pointed) {
      const dir = pointed, read = (name: string) => { const file = join(dir, name); return existsSync(file) ? readFileSync(file, "utf8").trim() : ""; };
      const owner = read("rebase-merge/head-name") || read("rebase-apply/head-name") || (read("BISECT_START") && `refs/heads/${read("BISECT_START")}`);
      if (owner.startsWith("refs/heads/")) { branch = owner.slice(11); busy = true; }
    }
    entries.push({ path, branch, locked: flag("locked"), prunable, busy, pointed, admin, problems });
  }
  // Removing an entry deletes its admin directory, so one that another checkout uses keeps both.
  for (const tree of entries.slice(1)) {
    const other = tree.admin && entries.slice(1).find(o => o !== tree && (o.admin === tree.admin || o.pointed === tree.admin));
    if (other) tree.problems.push(`admin directory ${tree.admin} is also used by ${other.path}`);
  }
  return entries;
}

type Walk = { files: number; bytes: number; blocked: string[]; unreadable: string[]; git: string[] };
/** Walk without following symbolic links, counting non-directories and their lstat bytes; `skip` paths are walked elsewhere. */
function walk(base: string, start: string, skip = new Set<string>(), w: Walk = { files: 0, bytes: 0, blocked: [], unreadable: [], git: [] }): Walk {
  const rel = relative(base, start) || ".";
  let stat;
  try { stat = lstatSync(start); } catch { w.unreadable.push(rel); return w; }
  if (!stat.isDirectory()) { w.files++; w.bytes += stat.size; return w; }
  try { accessSync(start, constants.R_OK | constants.W_OK | constants.X_OK); } catch { w.blocked.push(rel); }
  let entries: string[];
  try { entries = readdirSync(start); } catch { w.unreadable.push(rel); return w; }
  for (const name of entries) {
    const child = join(start, name);
    if (skip.has(child)) continue;
    if (name === ".git") w.git.push(relative(base, child));
    walk(base, child, skip, w);
  }
  return w;
}

/** Design item 1: every rule that keeps a worktree, and the ignored paths its removal would delete. */
function inspect(checkout: Checkout, tree: Worktree, trees: Worktree[]): { reasons: string[]; ignored: Ignored[] } {
  const reasons = [...tree.problems], ignored: Ignored[] = [];
  if (tree.admin) {
    const refs = checkout.call([`--git-dir=${tree.admin}`, "for-each-ref", "refs/worktree/"]);
    if (refs.code !== 0 || refs.timedOut) reasons.push("per-worktree ref check failed");
    else if (refs.stdout.trim()) reasons.push("has per-worktree refs under refs/worktree/");
  }
  if (tree.prunable) return { reasons, ignored };
  for (const other of trees) if (other !== tree && other.path.startsWith(tree.path + sep)) reasons.push(`another worktree inside it: ${other.path}`);
  const git = (...args: string[]) => checkout.call(["-C", tree.path, ...args]);
  const failed = (r: Result, what: string) => r.timedOut ? `${what} timed out` : r.code !== 0 ? `${what} failed (exit ${r.code})` : r.stderr.trim() ? `${what} wrote to stderr: ${redact(r.stderr)}` : "";
  const clean = git("status", "--porcelain", "--untracked-files=all", "--ignore-submodules=none");
  const shown = git("status", "--porcelain", "--ignored=traditional", "--untracked-files=normal");
  const raw = git("status", "--porcelain", "--ignored=traditional", "--untracked-files=normal", "-z");
  for (const r of [clean, shown, raw]) { const why = failed(r, "status check"); if (why && !reasons.includes(why)) reasons.push(why); }
  if (clean.code === 0 && !clean.timedOut && clean.stdout.trim()) reasons.push("changed or untracked files");
  const skip = new Set([join(tree.path, ".git")]);
  const blocked: string[] = [];
  if (shown.code === 0 && raw.code === 0 && !shown.timedOut && !raw.timedOut) {
    // Display text comes from the quoted form; paths to walk from the -z form, entry for entry.
    const display = shown.stdout.split("\n").filter(line => line.startsWith("!! ")).map(line => line.slice(3)), paths: string[] = [];
    const fields = raw.stdout.split("\0");
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i]!;
      if (/^[RC]|^.[RC]/.test(field)) i++;
      if (field.startsWith("!! ")) paths.push(field.slice(3));
    }
    if (display.length !== paths.length) reasons.push("ignored path listings disagree");
    else paths.forEach((path, i) => {
      const at = resolve(tree.path, path), w = walk(tree.path, at);
      skip.add(at); blocked.push(...w.blocked);
      ignored.push({ path: display[i]!, files: w.files, bytes: w.bytes });
      if (w.unreadable.length) reasons.push(`cannot read ignored path ${display[i]}`);
      if (w.git.length) reasons.push(`a .git inside ignored path ${display[i]}: ${few(w.git)}`);
    });
  }
  const whole = walk(tree.path, tree.path, skip);
  blocked.unshift(...whole.blocked);
  if (blocked.length) reasons.push(`cannot read, enter or write ${few(blocked)}`);
  if (whole.unreadable.length) reasons.push(`cannot walk ${few(whole.unreadable)}`);
  const stage = git("ls-files", "-z", "-s"), tags = git("ls-files", "-z", "-v");
  for (const r of [stage, tags]) { const why = failed(r, "index listing"); if (why && !reasons.includes(why)) reasons.push(why); }
  if (tree.admin && existsSync(join(tree.admin, "modules"))) reasons.push("submodule state: modules/ in its admin directory");
  if (stage.code === 0) {
    const populated = stage.stdout.split("\0").filter(e => e.startsWith("160000 ")).map(e => e.slice(e.indexOf("\t") + 1)).filter(name => present(join(tree.path, name, ".git")));
    if (populated.length) reasons.push(`submodule state: ${few(populated)} initialized`);
  }
  if (tags.code === 0) {
    const entries = tags.stdout.split("\0").filter(Boolean).map(e => ({ tag: e[0]!, name: e.slice(2) }));
    const assumed = entries.filter(e => e.tag !== e.tag.toUpperCase()).map(e => e.name);
    const skipped = entries.filter(e => e.tag === "S" && present(join(tree.path, e.name))).map(e => e.name);
    if (assumed.length) reasons.push(`assume-unchanged entry ${few(assumed)}`);
    if (skipped.length) reasons.push(`skip-worktree entry ${few(skipped)} with its file on disk`);
  }
  return { reasons, ignored };
}

/** The rules that keep a worktree, from its entry and, when worktree removal is on, from inspect(). */
function assess(c: Context, tree: Worktree, trees: Worktree[], extra: string[] = []): { reasons: string[]; ignored: Ignored[] } {
  const reasons = [...extra];
  if (tree.busy) reasons.push("rebase or bisect in progress");
  if (tree.path === c.main) reasons.push("the main worktree");
  if (real(tree.path) === c.invoking) reasons.push("the invoking worktree");
  if (tree.locked) reasons.push("locked");
  if (tree.prunable) reasons.push("directory is missing");
  if (!c.worktrees) return { reasons: [...reasons, "worktree removal is off (--worktrees false)"], ignored: [] };
  if (tree.path === c.main) return { reasons, ignored: [] };
  const found = inspect(c.checkout, tree, trees);
  return { reasons: [...reasons, ...found.reasons], ignored: found.ignored };
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
  const plan: Plan = { schema_version: 2, repository: checkout.repository, default_branch: defaultBranch, default_oid: defaultOid, delete_branch_on_merge: autoDelete, worktrees: options.worktrees !== false, operations: [], kept: [] };
  if (!autoDelete && !only) plan.operations.push({ kind: "enable-auto-delete" });
  const keep = (scope: "remote" | "local", branch: string, reason: string) => { plan.kept.push({ scope, branch, reason }); };
  const keepTree = (tree: Worktree, reasons: string[]) => { plan.kept.push({ scope: "worktree", path: tree.path, ...(tree.branch ? { branch: tree.branch } : {}), reason: reasons.join("; ") }); };
  const seen = new Set<Worktree>();

  // A merged PR head or the default branch must contain the tip; nothing else proves the work is kept.
  let mainline: Set<string> | undefined;
  /** Design item 2: a local branch's age is its oldest reflog entry, else its tip's committer date. */
  const ageOf = (branch: string, oid: string): { days?: number; reason?: string } => {
    const log = checkout.call(["reflog", "show", "--date=unix", `refs/heads/${branch}`]);
    if (log.code !== 0 || log.timedOut) return { reason: "branch reflog unreadable" };
    const stamps = log.stdout.split("\n").filter(Boolean).map(line => Number(/@\{(\d+)\}/.exec(line)?.[1]));
    if (stamps.some(n => !Number.isFinite(n))) return { reason: "branch reflog unreadable" };
    const dated = stamps.length ? stamps : [Number(checkout.git(["log", "-1", "--format=%ct", oid], true).trim() || NaN)];
    const since = now - Math.min(...dated);
    if (!Number.isFinite(since)) return { reason: "branch age unknown" };
    return since < recentSeconds ? {} : { days: Math.floor(since / (24 * 3600)) };
  };
  const proof = (oid: string, name: string, local?: string): { proof?: string; reason?: string } => {
    if (!checkout.hasCommit(oid)) return { reason: "tip commit unavailable locally" };
    if (merged) return checkout.hasCommit(merged.sha, merged.number) && checkout.ancestor(oid, merged.sha) ? { proof: `contained in merged PR #${merged.number} head ${merged.sha.slice(0, 12)}` } : { reason: `commits outside merged PR #${merged.number}` };
    for (const p of checkout.merged(name)) if (checkout.hasCommit(p.sha, p.number) && checkout.ancestor(oid, p.sha)) return { proof: `contained in merged PR #${p.number} head ${p.sha.slice(0, 12)}` };
    const own = (where: string, reason: string) => {
      const a = local === undefined ? {} : ageOf(local, oid);
      return a.days !== undefined ? { proof: `${where}, ${a.days} days old` } : { reason: a.reason ? `${reason}; ${a.reason}` : reason };
    };
    if (oid === defaultOid) return own(`no commits beyond ${defaultBranch}`, `no commits beyond ${defaultBranch} and no merged PR`);
    if (!checkout.ancestor(oid, defaultOid)) return { reason: "unmerged commits" };
    mainline ??= new Set(checkout.git(["rev-list", "--first-parent", defaultOid]).split("\n"));
    if (mainline.has(oid)) return own(`points at a commit on ${defaultBranch}'s own history`, `points at a commit on ${defaultBranch}'s own history and has no merged PR`);
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

  const local = refs(checkout, "refs/heads/"), trees = worktrees(checkout);
  const context: Context = { checkout, main: trees[0]?.path, invoking: real(checkout.root), worktrees: plan.worktrees };
  for (const [branch, oid] of [...local].sort()) {
    const upstream = checkout.git(["for-each-ref", "--format=%(upstream)", `refs/heads/${branch}`]).trim();
    const name = upstream.startsWith("refs/remotes/origin/") ? upstream.slice("refs/remotes/origin/".length) : branch;
    if (branch === defaultBranch || (only && !only(branch) && !only(name))) continue;
    // `git worktree add --force` can check one branch out in several worktrees.
    const r = proof(oid, name, branch), on = trees.filter(t => t.branch === branch);
    for (const tree of on) seen.add(tree);
    if (!r.proof) {
      keep("local", branch, r.reason!);
      for (const tree of on) keepTree(tree, assess(context, tree, trees, [`its branch is kept: ${r.reason}`]).reasons);
      continue;
    }
    const held: string[] = [];
    for (const tree of on) {
      const { reasons, ignored } = assess(context, tree, trees);
      if (reasons.length) { keepTree(tree, reasons); held.push(`merged but checked out in a kept worktree (${tree.path}): ${reasons.join("; ")}`); }
      else plan.operations.push({ kind: "remove-worktree", path: tree.path, branch, oid, proof: r.proof, ignored });
    }
    if (held.length) { keep("local", branch, held.join("; ")); continue; }
    plan.operations.push({ kind: "delete-local", branch, oid, proof: r.proof });
  }
  // Linked worktrees that no branch above covers: detached, on the default branch or on an unborn branch.
  for (const tree of trees.slice(1)) {
    if (seen.has(tree) || (only && !(tree.branch && only(tree.branch)))) continue;
    const rule = !tree.branch ? "detached HEAD" : tree.branch === defaultBranch ? `the default branch ${defaultBranch} is checked out` : local.has(tree.branch) ? "its branch is out of scope" : "unborn branch";
    keepTree(tree, assess(context, tree, trees, [rule]).reasons);
  }
  plan.operations.sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
  return { checkout, plan, remote, tracking, local, worktrees: trees, context };
}

/** Run the item 1 checks again just before removal; a different result means the worktree changed after the plan. */
function unchanged(o: Observation, op: Extract<Operation, { kind: "remove-worktree" }>): boolean {
  const trees = worktrees(o.checkout), tree = trees.find(t => t.path === op.path && t.branch === op.branch);
  if (!tree) return false;
  const { reasons, ignored } = assess(o.context, tree, trees);
  return reasons.length === 0 && same({ ...op, ignored }, op);
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
  const fresh = observe(options, only, merged), run = options.run ?? spawn, outcomes: Outcome[] = [], removed = new Set<string>();
  for (const op of approved) {
    if (!fresh.plan.operations.some(candidate => same(candidate, op))) { outcomes.push({ operation: op, status: absent(fresh, op) ? "already-absent" : "changed" }); continue; }
    // `git update-ref -d` deletes a branch even while a worktree has it checked out.
    if (op.kind === "delete-local" && !fresh.worktrees.filter(t => t.branch === op.branch).every(t => removed.has(t.path))) { outcomes.push({ operation: op, status: "failed", detail: "its worktree was not removed" }); continue; }
    if (op.kind === "remove-worktree" && !unchanged(fresh, op)) { outcomes.push({ operation: op, status: "changed" }); continue; }
    const outcome = perform(fresh.checkout, op, run);
    if (outcome.status === "done" && op.kind === "remove-worktree") removed.add(op.path);
    outcomes.push(outcome);
  }
  return outcomes;
}
const complete = (outcomes: Outcome[]) => outcomes.every(o => o.status === "done" || o.status === "already-absent");

export function parsePlan(text: string): Plan {
  const plan = object(JSON.parse(text), "plan");
  if (plan.schema_version !== 2 || typeof plan.repository !== "string" || typeof plan.worktrees !== "boolean" || !Array.isArray(plan.operations)) throw new Error("unsupported branch plan");
  for (const value of plan.operations) {
    const op = object(value, "operation");
    if (!kinds.includes(op.kind as Operation["kind"]) || (op.kind === "remove-worktree" && !Array.isArray(op.ignored))) throw new Error("unsupported branch operation");
  }
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
    ...(observed.plan.delete_branch_on_merge ? {} : { note: "GitHub automatic head-branch deletion is off; ask the owner whether to enable it with auto-delete --enable" }),
  };
}
