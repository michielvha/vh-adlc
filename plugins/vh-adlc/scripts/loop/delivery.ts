// Delivery (references/loop-settings.md): CI reporting under a declared policy, the skip marker for a
// feature delivery, and the verdict after merge. Publication is decided by the actual merge commit:
// only a merge commit that carries the skip marker and touches only skip-eligible paths has no
// publication path. Every other merge runs the declared post-merge watch, which does its own waiting.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LoopSettings } from "./settings";
import { diffPaths } from "./git-paths";

const SKIP = /\[(skip ci|ci skip|no ci|skip actions|actions skip)\]|^skip-checks: *true/im;
const ONBOARDING = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"];

export type DeliveryVerdict = { delivered: true; reason: string } | { delivered: false; state: "failed" | "blocked" | "manual"; reason: string; output?: string };

function git(repo: string, args: string[]): string {
  const run = Bun.spawnSync(["git", ...args], { cwd: repo, stdout: "pipe", stderr: "pipe" });
  if (run.exitCode !== 0) throw Error(`git ${args.join(" ")} failed`);
  return run.stdout.toString();
}

export function ciReport(settings: LoopSettings): { state: "not triggered" | "follow runs"; reason: string; dispatch: false } {
  return settings.ci_trigger === "manual"
    ? { state: "not triggered", reason: "manual CI policy", dispatch: false }
    : { state: "follow runs", reason: "automatic CI", dispatch: false };
}

/** Whether the pinned delivery convention lets a repository declare extra skip-eligible paths. */
export function conventionSupportsSkipPaths(docsRevision: string): boolean {
  const cache = process.platform === "darwin" ? join(homedir(), "Library", "Caches") : (process.env.XDG_CACHE_HOME?.trim() || join(homedir(), ".cache"));
  try { return readFileSync(join(cache, "vh-adlc", "docs", docsRevision, "conventions", "delivery.md"), "utf8").includes("skip_ci_paths"); } catch { return false; }
}

function eligible(path: string, settings: LoopSettings, featureRoot: string, supportsSkipPaths: boolean): boolean {
  const root = featureRoot.replace(/\/*$/, "/");
  if (path.startsWith(root) && path.endsWith(".md")) return true;
  if (ONBOARDING.includes(path)) return true;
  return supportsSkipPaths && settings.skip_ci_paths.some(pattern => new Bun.Glob(pattern).match(path));
}

/** The skip marker for a feature delivery: every path of the commit, the push range and the PR diff must be eligible. */
export function skipMarker(settings: LoopSettings, delivery: { commit: string[]; pushRange: string[]; prDiff: string[] }, options: { supportsSkipPaths: boolean; featureRoot: string }): { marker: boolean; ignored?: string } {
  const all = [...delivery.commit, ...delivery.pushRange, ...delivery.prDiff];
  const marker = all.length > 0 && all.every(path => eligible(path, settings, options.featureRoot, options.supportsSkipPaths));
  if (!options.supportsSkipPaths && settings.skip_ci_paths.length)
    return { marker, ignored: "skip_ci_paths is ignored: the resolved delivery convention allows only documentation; update the docs pin to a revision that supports skip_ci_paths" };
  return { marker };
}

export async function deliveryVerdict(settings: LoopSettings, repo: string, merge: string, options: { featureRoot: string; supportsSkipPaths: boolean; timeoutMs?: number }): Promise<DeliveryVerdict> {
  const message = git(repo, ["log", "-1", "--format=%B", merge]);
  const paths = diffPaths(repo, `${merge}^1`, merge);
  if (SKIP.test(message) && paths.length && paths.every(path => eligible(path, settings, options.featureRoot, options.supportsSkipPaths)))
    return { delivered: true, reason: "no publication path" };
  const watch = settings.post_merge_watch;
  if (!watch) return { delivered: false, state: "manual", reason: "no post-merge watch declared; check each release path the feature document names" };
  const argv = watch.argv.map(part => part.replaceAll("{merge_sha}", merge));
  const child = Bun.spawn(argv, { cwd: repo, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 3 * 60 * 60_000);
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  clearTimeout(timer);
  if (exit === 0) return { delivered: true, reason: "the post-merge watch passed" };
  const output = `${stdout}${stderr}`.slice(-4000);
  if (watch.no_publication_pattern && new RegExp(watch.no_publication_pattern, "m").test(output))
    return { delivered: false, state: "blocked", reason: `the watch found no workflow ran for ${merge}; the owner confirms delivery by hand`, output };
  return { delivered: false, state: "failed", reason: `the post-merge watch failed with exit ${exit}`, output };
}
