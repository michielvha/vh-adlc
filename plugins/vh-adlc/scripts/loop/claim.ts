// Claiming a planned feature from a host worktree (references/loop-settings.md, the implement skill).
// The worktree must sit at the freshly fetched default-branch tip with no tracked change; HEAD may be
// detached, on the default branch, or on a branch this session owns. Every refusal happens before any
// write; the fetch may only move remote-tracking refs. A rejected push keeps the local claim commit and
// creates no feature branch. The plugin never creates, moves or removes a worktree: with
// `implement_worktree: isolated`, it asks the host's own worktree tool for one.
import { realpathSync } from "node:fs";
import type { LoopSettings } from "./settings";

export type ClaimRequest = {
  document: string; featureBranch: string; defaultBranch: string; message: string;
  /** Branches this session created or was handed over; any other non-default branch is refused. */
  ownedBranches: string[];
  /** Writes the claim into the document (status, status_description, branch). */
  edit: (root: string) => void;
  /** Test seam, run between the claim commit and its push. */
  beforePush?: () => void;
};
export type ClaimResult =
  | { status: "claimed"; branch: string; commit: string }
  | { status: "refused"; reason: string }
  | { status: "pending"; reason: string; commit: string };

function run(repo: string, args: string[]) {
  const child = Bun.spawnSync(["git", ...args], { cwd: repo, stdout: "pipe", stderr: "pipe" });
  return { ok: child.exitCode === 0, out: child.stdout.toString().trim(), err: child.stderr.toString().trim() };
}
function git(repo: string, args: string[]): string {
  const result = run(repo, args);
  if (!result.ok) throw Error(`git ${args[0]} failed: ${result.err}`);
  return result.out;
}

export async function claim(repo: string, request: ClaimRequest): Promise<ClaimResult> {
  const { defaultBranch } = request;
  if (!run(repo, ["fetch", "-q", "origin", defaultBranch]).ok) return { status: "refused", reason: `fetching origin/${defaultBranch} failed` };
  const head = git(repo, ["rev-parse", "HEAD"]), tip = git(repo, ["rev-parse", `origin/${defaultBranch}`]);
  if (head !== tip) return { status: "refused", reason: `this worktree is not at the tip of origin/${defaultBranch}; start from a worktree at ${tip.slice(0, 7)}` };
  const tracked = git(repo, ["status", "--porcelain", "--untracked-files=no"]);
  if (tracked) return { status: "refused", reason: `staged or unstaged changes that do not belong to the claim: ${tracked.split("\n").map(line => line.slice(3)).join(", ")}` };
  const branch = run(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"]).out;
  if (branch && branch !== defaultBranch && !request.ownedBranches.includes(branch))
    return { status: "refused", reason: `HEAD is on ${branch}, which this session neither created nor was handed; never advance an unrelated branch` };
  if (run(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${request.featureBranch}`]).ok)
    return { status: "refused", reason: `${request.featureBranch} already exists; re-enter it instead of claiming again` };
  request.edit(repo);
  git(repo, ["add", "--", request.document]);
  git(repo, ["commit", "-q", "-m", request.message, "--", request.document]);
  const commit = git(repo, ["rev-parse", "HEAD"]);
  request.beforePush?.();
  const push = run(repo, ["push", "-q", "origin", `HEAD:refs/heads/${defaultBranch}`]);
  if (!push.ok) return { status: "pending", reason: `the claim push was rejected; the local claim commit ${commit.slice(0, 7)} stays and no feature branch exists. Retry from a worktree at the new tip, or hand the feature over`, commit };
  git(repo, ["switch", "-q", "-c", request.featureBranch]);
  return { status: "claimed", branch: request.featureBranch, commit };
}

/** The primary worktree is the first entry of `git worktree list`. */
export function primaryWorktree(repo: string): string {
  const first = git(repo, ["worktree", "list", "--porcelain"]).split("\n").find(line => line.startsWith("worktree "));
  if (!first) throw Error("git worktree list returned no worktree");
  return realpathSync(first.slice("worktree ".length));
}

export function isolation(settings: LoopSettings, repo: string, host: { hostWorktreeTool: boolean }):
  { action: "continue" } | { action: "enter-host-worktree" } | { action: "stop"; reason: string } {
  if (settings.implement_worktree !== "isolated") return { action: "continue" };
  const top = realpathSync(git(repo, ["rev-parse", "--show-toplevel"]));
  if (top !== primaryWorktree(repo)) return { action: "continue" };
  if (host.hostWorktreeTool) return { action: "enter-host-worktree" };
  return { action: "stop", reason: "implement_worktree is isolated and this is the primary checkout; start this operation in a worktree (for example with your host's worktree command) and run it again" };
}
