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
  more than seven days old.

Everything else is kept and reported with its reason: the default branch, protected branches, the
head or base of an open PR, unmerged commits, a recent branch with no merged PR, a branch that only
points into the default branch's history, and a merged branch still checked out in a worktree,
including one with a rebase or bisect in progress. GitHub data that cannot be read completely stops the run before
anything is deleted.

Deletions are compare-and-delete. A remote branch is removed with
`git push --force-with-lease=refs/heads/<branch>:<tip> origin :refs/heads/<branch>`, which the server
refuses if the branch moved after observation. A local branch is removed with
`git update-ref -d refs/heads/<branch> <tip>`. A squash merge leaves the local tip outside the
default branch, so `git branch -d` would refuse it even though the merged PR head contains it; the
proof above is what makes this deletion safe. Stale remote-tracking refs, whose branch no longer
exists on origin, are removed the same way.

A worktree is removed only when the owner passes `--worktrees true`, it is not the main or invoking
worktree, it is not locked, and `git status --porcelain --ignored` is empty there. Removal uses plain
`git worktree remove`, never `--force`. Dirty work, untracked files and ignored files keep the
worktree and its branch.

## After a merge

An owner-authorized merge includes cleaning up its own PR branch. Merge without `--delete-branch`,
since that flag would also switch the local checkout, then run:

```bash
bun <plugin>/scripts/branches/cli.ts after-merge --repo <checkout> --pull <number>
```

It touches only that PR's head branch: the remote branch if GitHub did not already delete it, the
stale tracking ref, and local branches named after it or tracking it. The only accepted proof is that
each tip is contained in the head GitHub recorded for that merged PR, so a branch with commits pushed
after the merge is kept. A PR from a fork has no branch in this repository, and nothing is deleted. Report each outcome and kept reason. When the result says GitHub's automatic
head-branch deletion is off, ask the owner whether to turn it on with `auto-delete --enable`.

## Sweep

Plan, show the plan, and apply only the approved digest:

```bash
bun <plugin>/scripts/branches/cli.ts plan --repo <checkout> --output <private file> [--worktrees true]
bun <plugin>/scripts/branches/cli.ts apply --repo <checkout> --plan <private file> --approved-digest <sha256>
```

`plan` fetches from origin but deletes nothing. It writes the plan and prints it with its digest. The
plan proposes turning on GitHub's `delete_branch_on_merge` when it is off, so later merges clean up
after themselves even without vh-adlc; approving the digest enables it too. Write the plan outside the repository, for example in the run's
private journal directory.

`apply` needs the exact approved bytes. It observes again and performs an approved operation only
when the fresh plan still proposes it unchanged. Otherwise it reports `changed`, or `already-absent`
when the branch is already gone. A failed worktree removal keeps that branch. Exit 1 means at least
one approved operation did not complete; read every outcome.

Owner approval of the digest authorizes that plan. An owner's sweep request that already asks for
stale-branch removal is preauthorization for the plan the sweep produces: present it, then apply it
without asking again. `--worktrees true` needs the owner to ask for worktree cleanup.
