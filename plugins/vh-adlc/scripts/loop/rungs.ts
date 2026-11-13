// Verification rungs (references/loop-settings.md): declared checks with a path condition or `always`.
// Every applicable rung must pass at the commit being pushed, completed or delivered. A failed rung
// always blocks; a rung that could not run blocks unless the owner allowed that exact rung, or that
// exact skipped subcheck, for this run.
import type { LoopSettings } from "./settings";

export type Rung = { name: string; when: "always" | { paths: string[] }; command?: string; procedure?: string; skipped_pattern?: string };
export type RungState = "passed" | "failed" | "not run";
export type RungResult = { name: string; state: RungState; reason: string; commit: string; exit_code?: number; skipped?: string[]; output?: string };

function git(repo: string, args: string[]): string {
  const run = Bun.spawnSync(["git", ...args], { cwd: repo, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  if (run.exitCode !== 0) throw Error(`git ${args.join(" ")} failed: ${run.stderr.toString().trim()}`);
  return run.stdout.toString();
}
const lines = (text: string) => text.split("\n").map(line => line.trim()).filter(Boolean);

/**
 * The paths a feature changes. Before merge: the branch against its merge base with `base`, plus every
 * uncommitted change in the worktree. After merge: the merge commit against its first parent, which is
 * the feature as it landed.
 */
export function featureDelta(repo: string, from: { base?: string; merge?: string }): { paths: string[]; range: string } {
  if (from.merge) {
    const range = `${from.merge}^1..${from.merge}`;
    return { paths: lines(git(repo, ["diff", "--name-only", `${from.merge}^1`, from.merge])), range };
  }
  if (!from.base) throw Error("featureDelta needs a base branch or a merge commit");
  const mergeBase = git(repo, ["merge-base", from.base, "HEAD"]).trim();
  const committed = lines(git(repo, ["diff", "--name-only", mergeBase, "HEAD"]));
  const uncommitted = lines(git(repo, ["status", "--porcelain=v1", "--untracked-files=all"])).map(line => line.slice(3).replace(/^.* -> /, ""));
  return { paths: [...new Set([...committed, ...uncommitted])], range: `${mergeBase}..HEAD+worktree` };
}

export function applicableRungs(settings: LoopSettings, paths: string[]): Rung[] {
  return settings.verification_rungs.filter(rung => rung.when === "always" ||
    rung.when.paths.some(pattern => { const glob = new Bun.Glob(pattern); return paths.some(path => glob.match(path)); }));
}

export async function runRungs(repo: string, rungs: Rung[], options: { timeoutMs?: number } = {}): Promise<RungResult[]> {
  const commit = git(repo, ["rev-parse", "HEAD"]).trim();
  const results: RungResult[] = [];
  for (const rung of rungs) {
    if (rung.procedure !== undefined) { results.push({ name: rung.name, state: "not run", reason: "a written procedure; record its result", commit }); continue; }
    const child = Bun.spawn(["bash", "-c", rung.command!], { cwd: repo, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 60 * 60_000);
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    clearTimeout(timer);
    const output = `${stdout}${stderr}`;
    if (exit === 126 || exit === 127) { results.push({ name: rung.name, state: "not run", reason: "the command could not run", commit, exit_code: exit, output }); continue; }
    if (exit !== 0) { results.push({ name: rung.name, state: "failed", reason: `exit ${exit}`, commit, exit_code: exit, output }); continue; }
    const skipped = rung.skipped_pattern ? output.split("\n").flatMap(line => {
      const match = new RegExp(rung.skipped_pattern!).exec(line.replace(/\x1b\[[0-9;]*m/g, ""));
      return match ? [(match[1] ?? match[0]).trim()] : [];
    }).flatMap(entry => entry.split(/;\s*/)).filter(Boolean) : [];
    if (skipped.length) { results.push({ name: rung.name, state: "not run", reason: "exit 0 with skipped mandatory subchecks", commit, exit_code: 0, skipped, output }); continue; }
    results.push({ name: rung.name, state: "passed", reason: "exit 0", commit, exit_code: 0, output });
  }
  return results;
}

/** Whether the results let the feature push, complete or deliver at `head`. */
export function mayAdvance(results: RungResult[], options: { head: string; declared: boolean; allowances?: string[] }): { advance: boolean; lookup: "rungs" | "agents-md"; blocking: string[] } {
  if (!options.declared) return { advance: true, lookup: "agents-md", blocking: [] };
  const allowed = new Set(options.allowances ?? []);
  const blocking = results.filter(result => {
    if (result.commit !== options.head) return true;
    if (result.state === "passed") return false;
    if (result.state === "failed") return true;
    if (result.skipped?.length) return !result.skipped.every(sub => allowed.has(`${result.name}/${sub}`));
    return !allowed.has(result.name);
  }).map(result => result.name);
  return { advance: blocking.length === 0, lookup: "rungs", blocking };
}

/** With rungs or a post-merge watch declared, a feature lands by merge commit, so its delta stays one first-parent range. */
export function landingAllowed(settings: LoopSettings, method: "merge" | "fast-forward" | "squash"): { allowed: true } | { allowed: false; reason: string } {
  const strict = settings.verification_rungs.length > 0 || settings.post_merge_watch !== undefined;
  if (method === "squash") return { allowed: false, reason: "feature PRs never squash: reviewed commits must stay reachable" };
  if (strict && method !== "merge") return { allowed: false, reason: "with verification rungs or a post-merge watch declared, a feature lands by merge commit only" };
  return { allowed: true };
}
