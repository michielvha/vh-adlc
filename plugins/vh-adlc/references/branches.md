# Branch hygiene

GitHub's `delete_branch_on_merge` repository setting is the only guarantee: with it on, GitHub deletes
the head branch of every merged PR, whoever merges it. vh-adlc checks the setting when it onboards a
repository and in every maintenance sweep, and offers to turn it on. Two cleanups cover what the
setting does not: each merge removes its own PR branch and local copies right away, and a maintenance
sweep removes what earlier merges left behind. All of this uses `scripts/branches/cli.ts`. The plugin
root is two directories above a skill's own directory.

## Repository setting

```bash
bun <plugin>/scripts/branches/cli.ts auto-delete --repo <checkout> [--enable]
bun <plugin>/scripts/branches/cli.ts auto-delete --repository <owner/name> [--enable]
```

Without `--enable` it only reads the setting. It exits 0 when the setting is on and 1 when it is off,
so the answer never depends on reading prose. With `--enable` it turns the setting on and confirms
the new value from GitHub's response, which needs admin rights on the repository. `--repository`
alone checks a github.com repository that has no local checkout. Report the setting in one line.
When it is off, ask the owner whether to enable it, and pass `--enable` only after they say yes.
GitHub copies no settings from a template repository, so a repository created from a template starts
with the setting off.

## What counts as merged

A branch is removed only when its current tip is proven merged:

- the tip is contained in the head of a merged PR from the same repository and branch name, which
  covers squash and rebase merges, or
- the tip is reachable from the freshly observed default branch but is not a commit on the default
  branch's own first-parent history, so its commits arrived through a merge, and its newest commit is
  more than seven days old, or
- the tip is the default branch tip or a commit on its first-parent history, so the branch has no
  commits of its own, and the branch is at least seven days old. Its age comes from its oldest reflog
  entry, or from its tip's committer date when the reflog has no entries.

Everything else is kept and reported with its reason: the default branch, protected branches, the
head or base of an open PR, unmerged commits, a recent branch with no merged PR, a branch younger
than seven days that only points into the default branch's history, and a merged branch whose
worktree is kept under the rules below. GitHub data that cannot be read completely stops the run before
anything is deleted.

Deletions are compare-and-delete. A remote branch is removed with
`git push --force-with-lease=refs/heads/<branch>:<tip> origin :refs/heads/<branch>`, which the server
refuses if the branch moved after observation. A local branch is removed with
`git update-ref -d refs/heads/<branch> <tip>`. A squash merge leaves the local tip outside the
default branch, so `git branch -d` would refuse it even though the merged PR head contains it; the
proof above is what makes this deletion safe. Stale remote-tracking refs, whose branch no longer
exists on origin, are removed the same way.

A merged branch's worktree is removed together with the branch when it is a clean worktree: it has
no changed tracked files and no untracked files, as
`git status --porcelain --untracked-files=all --ignore-submodules=none` reports them. Ignored files
do not make a worktree unclean; they go with it. Each `remove-worktree` operation lists its ignored
paths: the ignored files and directories exactly as Git prints them, each with its file count and
total bytes, so the owner sees them before approving. A clean detached worktree is removed when its
HEAD is reachable from the default branch and its HEAD reflog starts at least seven days ago, or its
HEAD commit is that old when the reflog is empty. A worktree entry whose directory is gone is removed
when its branch is proven merged, or, when detached, when its HEAD is reachable from the default
branch.

A worktree is kept, and its branch with it, when it is the main worktree, the `--repo` worktree, the
one that holds the process's working directory, or locked. A locked worktree's reason includes its
lock reason. It is also kept when it has changed or untracked files, submodule state, a rebase or
bisect in progress, a per-worktree ref under `refs/worktree/`, an assume-unchanged or skip-worktree
entry, another checkout or a `.git` under an ignored path, or a directory the current user cannot
read, enter or write, or when one of these checks fails or times out. A detached worktree is kept when
its HEAD reflog names a commit that no local or remote branch contains, and under reftable storage
whenever its HEAD reflog has an entry. An entry whose directory is gone is kept when its admin
directory holds `modules/` or staged changes, and one whose directory exists without a `.git` file is
kept too. Every linked worktree the plan does not remove gets a `worktree` kept record: a
`kept` record with scope `worktree`, the worktree's path, its branch when it has one, and a reason
naming every rule that keeps it. Removal uses plain `git worktree remove`, never `--force`, and
`apply` repeats the checks just before it.

## After a merge

An owner-authorized merge includes cleaning up its own PR branch and that branch's worktree. Merge without `--delete-branch`,
since that flag would also switch the local checkout, then run:

```bash
bun <plugin>/scripts/branches/cli.ts after-merge --repo <checkout> --pull <number>
```

It touches only that PR's head branch: the remote branch if GitHub did not already delete it, the
stale tracking ref, and local branches named after it or tracking it. The only accepted proof is that
each tip is contained in the head GitHub recorded for that merged PR, so a branch with commits pushed
after the merge is kept. A PR from a fork has no branch in this repository, and nothing is deleted.
It also removes the worktree that has the PR's branch checked out, under the same rules as a plan, so
it keeps the worktree it runs from. It keeps that worktree when it holds ignored files, with the
reason `holds ignored files; remove it through an approved plan`, and leaves every other worktree,
detached or not, alone. `--worktrees false` leaves the PR's worktree, and with it the local branch,
in place. Report each outcome and kept reason. When the result says GitHub's automatic
head-branch deletion is off, ask the owner whether to turn it on with `auto-delete --enable`.

## Sweep

Plan, show the plan, and apply only the approved digest:

```bash
bun <plugin>/scripts/branches/cli.ts plan --repo <checkout> --output <private file> [--worktrees false]
bun <plugin>/scripts/branches/cli.ts apply --repo <checkout> --plan <private file> --approved-digest <sha256>
```

`plan` fetches from origin but deletes nothing. It writes the plan and prints it with its digest.
It proposes worktree removals unless `--worktrees false` is given. The
plan proposes turning on GitHub's `delete_branch_on_merge` when it is off, so later merges clean up
after themselves even without vh-adlc; approving the digest enables it too. Write the plan outside the repository, for example in the run's
private journal directory.

`apply` needs the exact approved bytes. It observes again and performs an approved operation only
when the fresh plan still proposes it unchanged. Otherwise it reports `changed`, or `already-absent`
when the branch is already gone. A failed worktree removal keeps that branch. `apply` refuses a plan
written in the earlier format. Exit 1 means at least
one approved operation did not complete; read every outcome.

Owner approval of the digest authorizes that plan. An owner's sweep request that already asks for
stale-branch removal is preauthorization for the plan the sweep produces: present it, then apply it
without asking again. Either approval covers the plan's worktree removals; no separate request is
needed. When a `remove-worktree` operation lists ignored paths, a preauthorized sweep still waits:
present the plan with those lists and apply it only after the owner approves its digest.
