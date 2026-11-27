// Instruction freshness (references/loop-settings.md): for the settings file and every file the loop
// context lists, whether the local copy matches origin's default branch tip and which version an
// operation reads. A checkout behind the default branch otherwise hands every operation outdated rules
// without any sign of it (docs/specs/instruction-freshness.md).
//
// The only write is the fetch, which moves `refs/remotes/origin/<branch>` and nothing else: no tags,
// no branch, index or working tree. Every failure to reach a tip reports `unverified` with a reason and
// never fails the command.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

export type FreshnessState = "current" | "stale" | "edited" | "removed" | "unverified";
export type FreshnessEntry = { path: string; state: FreshnessState; read: string | null };
export type Freshness = {
  default_branch: string | null; tip: string | null; reason?: string;
  settings: FreshnessEntry & { error?: string }; files: FreshnessEntry[];
};

const NETWORK_TIMEOUT_MS = 30_000;
const GIT_ENV = { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };

function git(repo: string, args: string[], timeout?: number): { ok: boolean; out: string; err: string } {
  const run = Bun.spawnSync(["git", ...args], { cwd: repo, stdout: "pipe", stderr: "pipe",
    env: { ...process.env, ...GIT_ENV }, ...(timeout ? { timeout } : {}) });
  return { ok: run.exitCode === 0, out: run.stdout.toString().trim(), err: run.stderr.toString().trim() };
}

/** The tip a checkout compares against: origin's default branch after a fresh fetch, or why there is none. */
export type Tip = { branch: string; tip: string; base: string } | { branch: string | null; reason: string };

export function fetchTip(repo: string, requested?: string): Tip {
  if (!git(repo, ["remote", "get-url", "origin"]).ok) return { branch: requested ?? null, reason: "no origin remote" };
  let branch = requested;
  if (branch === undefined) {
    const symbolic = git(repo, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
    if (symbolic.ok && symbolic.out.startsWith("origin/")) branch = symbolic.out.slice("origin/".length);
  }
  if (branch === undefined) {
    // A repository created locally and pushed later often has no origin/HEAD; ask origin itself.
    const remote = git(repo, ["ls-remote", "--symref", "origin", "HEAD"], NETWORK_TIMEOUT_MS);
    const match = remote.ok ? /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(remote.out) : null;
    if (match) branch = match[1];
  }
  if (branch === undefined) return { branch: null, reason: "origin's default branch could not be resolved; pass --default-branch <default branch>" };
  if (!git(repo, ["check-ref-format", "--branch", branch]).ok) return { branch: null, reason: `${JSON.stringify(branch)} is not a valid branch name; pass --default-branch <default branch>` };
  const fetch = git(repo, ["fetch", "-q", "--no-tags", "origin", "--", `+refs/heads/${branch}:refs/remotes/origin/${branch}`], NETWORK_TIMEOUT_MS);
  if (!fetch.ok) return { branch, reason: `fetching origin/${branch} failed${fetch.err ? `: ${fetch.err.split("\n")[0]}` : " (timed out or interrupted)"}` };
  const tip = git(repo, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}^{commit}`]);
  if (!tip.ok) return { branch, reason: `origin/${branch} is missing after the fetch` };
  const base = git(repo, ["merge-base", "HEAD", tip.out]);
  if (!base.ok) return { branch, reason: `HEAD has no merge base with origin/${branch} (a shallow clone or unrelated history)` };
  return { branch, tip: tip.out, base: base.out };
}

function blob(repo: string, revision: string, path: string): string | null {
  const found = git(repo, ["rev-parse", "--verify", "--quiet", `${revision}:${path}`]);
  return found.ok ? found.out : null;
}

function local(repo: string, path: string): string | null {
  const file = join(repo, path);
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  const hashed = git(repo, ["hash-object", "--", path]);
  return hashed.ok ? hashed.out : null;
}

/** One path's state; an absent file counts as a value, so two absent sides are equal. */
export function classify(repo: string, tip: { tip: string; base: string }, path: string): FreshnessEntry {
  const here = local(repo, path), atTip = blob(repo, tip.tip, path), atBase = blob(repo, tip.base, path);
  if (here === atTip) return { path, state: "current", read: path };
  if (here !== atBase) return { path, state: "edited", read: path };
  if (atTip !== null) return { path, state: "stale", read: `${tip.tip}:${path}` };
  return { path, state: "removed", read: null };
}

export function unverified(path: string): FreshnessEntry {
  return { path, state: "unverified", read: path };
}

/** The settings file's entry. A settings file absent everywhere has nothing to read. */
export function settingsEntry(repo: string, tip: Tip, path: string): FreshnessEntry {
  if (!("tip" in tip)) return { path, state: "unverified", read: local(repo, path) === null ? null : path };
  const entry = classify(repo, tip, path);
  if (entry.state === "current" && local(repo, path) === null) return { ...entry, read: null };
  return entry;
}
