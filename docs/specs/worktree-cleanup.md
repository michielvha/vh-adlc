---
status: draft
status_description: "Drafted with four open questions for the owner; not yet reviewed."
issue: null
goal: "Branch cleanup removes every linked worktree whose work is already on the default branch or in a merged PR, including ones that hold only ignored build output, so worktrees stop piling up after merges, while a worktree with changed or untracked files or unmerged commits is always kept."
covers:
  - plugins/vh-adlc/scripts/branches/
  - plugins/vh-adlc/references/branches.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/maintenance.md
  - plugins/vh-adlc/skills/vh-adlc-maintenance/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/user-guides/workflows.md
  - tests/vh-adlc/branches/
---

# Plan: Worktree cleanup that keeps up with merges

The branch helper learns to remove the worktrees it skips today: ones that hold only ignored build
output, ones whose branch never got a commit of its own, detached ones whose commit is already on the
default branch, and entries whose directory is gone. Clean-up also runs as part of normal merges and
sweeps, not only when the owner remembers to ask.

## Context

### Owner summary

The Stackweaver checkout has 75 linked worktrees. Most of their work merged long ago, yet the branch
helper would remove none of them. Agent and feature worktrees keep their `node_modules`, so the helper
counts them as dirty. Branches an agent created but never committed to are kept as possibly new work.
The helper never looks at detached worktrees. Worktree removal is also opt-in on every run, so nothing
removes a worktree unless the owner asks.

This feature changes the helper in `plugins/vh-adlc/scripts/branches/` and the guides that call it. A
worktree counts as clean when Git's own `git worktree remove` would accept it: no changed tracked files
and no untracked files, while ignored files go with it. A branch with no commits beyond the default
branch's history is removed with its worktree once it is older than seven days. Detached worktrees whose
commit is on the default branch, and worktree entries whose directory is already gone, are removed too.
Removal still uses plain `git worktree remove`, never `--force`, and every removal still goes through
the plan and its approved digest. Under the recommended answers, a sweep plans worktree removal by
default and `after-merge` removes the merged PR's own worktree. Work that is not on the default branch
or in a merged PR head is never removed.

Out of scope: how Claude Code, Codex or other hosts create their worktrees, the `vh-adlc clean` binary,
and anything outside Git worktrees and local branches.

Four decisions are open: whether ignored files may go, whether branches with no commits of their own
may go, whether detached and missing worktrees are included, and when removal runs. Q4 touches the
central rule that a worktree is removed only when the owner asks, so its recommended answer reads an
approved merge or sweep plan as that request.

Nothing is implemented. The checks below are planned, not run. No review has run yet. Acceptance would
authorize implementation on a feature branch; pushing, a PR, merging and releasing each still need
their own approval.

### Background

On 2026-11-12, `git worktree list --porcelain` in `/home/m/code/stackweaver` listed 75 linked
worktrees, 47 of them under `.claude/worktrees/`. Of those 75, 15 were detached and 8 were marked
`prunable` because their directory was missing.

Running `bun plugins/vh-adlc/scripts/branches/cli.ts plan --repo ~/code/stackweaver --worktrees true`
the same day proposed 0 `remove-worktree` operations. Its kept list held:

- 23 local branches with the reason `merged but checked out in a worktree with changed, untracked or
  ignored files`. In 22 of those 23 worktrees, `git status --porcelain` (without `--ignored`) printed
  nothing, so only ignored files kept them. Together they used 8.3 GB. The most common ignored entries
  were `node_modules`, which 54 of the 67 worktrees still on disk hold, generated `docs-*.json` indexes
  and `dist`.
- 55 local branches with the reason `points at a commit on main's own history and has no merged PR`, 16
  of them checked out in a worktree, and one more at the main tip itself with the reason `no commits
  beyond main and no merged PR`.

These reasons come from the helper:

- `branches.ts:192-193` runs `git status --porcelain --ignored` and keeps any worktree for which it
  prints anything, which includes ignored files.
- `branches.ts:159` and `branches.ts:161-162` keep a branch whose tip equals the default branch or lies
  on its first-parent history, without regard to age.
- `branches.ts:183-198` only walks local branches, so a detached worktree is never considered.
- `branches.ts:193` keeps a worktree whose directory is missing.
- Worktree removal happens only with `--worktrees true` (`branches.ts:193`, `references/branches.md:49`,
  `references/branches.md:88-90`). `references/authority.md:34` and `references/authority.md:84`,
  `references/maintenance.md:156-157` and `skills/vh-adlc-ship/SKILL.md:108-109` all require the owner
  to ask for worktree cleanup.

Git's own rule is looser. In a scratch repository with Git 2.55.0, `git worktree remove ../w1`
succeeded on a worktree that held only an ignored `node_modules/` and deleted it. The same command
refused a worktree with an untracked file: `fatal: '../w2' contains modified or untracked files, use
--force to delete it`. After the directory of a third worktree was deleted, `git worktree remove ../w1`
removed its stale entry, and `git worktree list` went from 2 entries to 1.

The pinned delivery convention (`conventions/delivery.md:26-27` at
`vhco-pro/docs@d8f07c9`) says to remove a worktree only when the owner asks, only when it is clean, and
only with `git worktree remove` without `--force`.

## Scope

In scope:

- The worktree and local-branch classification in `plugins/vh-adlc/scripts/branches/branches.ts`, its
  plan and apply operations, and its CLI flags.
- When `after-merge` and the maintenance sweep remove worktrees.
- The guides that describe these rules: `references/branches.md`, `references/authority.md`,
  `references/maintenance.md`, the maintenance and ship skills, and `docs/user-guides/workflows.md`.
- Tests in `tests/vh-adlc/branches/` and the plugin version bump.

Out of scope:

- How Claude Code, Codex or other hosts create or clean up their own worktrees.
- The `vh-adlc clean` binary, `/tmp` and temp-root cleanup, Compose projects and kind clusters.
- A scheduled or background cleanup that runs without a plan the owner approved.
- Remote branch rules. They stay as they are.
- Changing the central delivery convention in `vhco-pro/docs`. If Q4 needs one, it becomes a separate
  change there.

## Design

All changes are in `observe`, `perform` and `execute` in `branches.ts`, plus the plan schema.

1. **Clean means clean to Git.** A worktree blocks removal only when `git status --porcelain` prints
   anything, which covers changed tracked files and untracked files. Ignored files no longer block it.
   The plan records, for each `remove-worktree` operation, the ignored top-level paths it will delete
   (`git status --porcelain --ignored`, the `!!` entries), so the owner sees them before approving.
   Removal stays plain `git worktree remove`, which re-checks cleanliness at apply time.
2. **Branches with no commits of their own.** A local branch whose tip is the default branch tip or lies
   on its first-parent history counts as proven merged once the branch is at least seven days old. Its
   age comes from the oldest entry in `git reflog show --date=unix refs/heads/<branch>`. A missing or
   unreadable reflog keeps the branch, with a reason saying so. Within seven days it stays kept with
   today's reason. Remote branches keep today's rule.
3. **Detached worktrees.** A detached worktree whose HEAD is reachable from the default branch, whose
   admin directory under `$(git rev-parse --git-common-dir)/worktrees/` is at least seven days old, and
   which is clean under item 1, gets a `remove-worktree` operation with no branch. Rebase or bisect in
   progress, main, invoking and locked worktrees stay kept as today.
4. **Missing directories.** A `prunable` worktree, whose directory is gone, gets a `remove-worktree`
   operation. `git worktree remove` then removes only its stale entry. Its branch is still judged by the
   branch rules.
5. **When removal runs.** `plan` includes worktree removal by default and takes `--worktrees false` to
   leave it out. `after-merge` removes the merged PR's own worktree under the same proof and blockers.
   The maintenance skill and the ship skill stop asking for a separate worktree request. Owner approval
   of the plan digest, or of the merge, is the request.
6. **Plan format.** The plan's `schema_version` becomes 2, so `apply` refuses a version 1 plan made
   under the old rules. `remove-worktree` gains an optional `branch` (absent when detached) and an
   `ignored` list. `same()` compares both, so a change after observation reports `changed`.

Items 1 to 5 follow the recommended answers to Q1 to Q4 and change when those answers are folded in.

## Acceptance Criteria

- [ ] AC-01: In a plan, a worktree on a proven-merged branch that has no changed or untracked files but
      does hold ignored files is proposed for removal, with those ignored top-level paths listed. Applying
      the approved plan removes the worktree and its ignored files with plain `git worktree remove`, then
      deletes the branch.
- [ ] AC-02: A worktree with a changed tracked file or an untracked file is never removed, even with
      ignored files beside them, and its branch is kept with a reason naming the worktree. This also
      holds when the file appears between plan and apply.
- [ ] AC-03: A local branch whose tip is on the default branch's first-parent history, created at least
      seven days ago according to its reflog, is deleted together with its clean worktree. Such a branch
      younger than seven days, or with no readable reflog, is kept with a reason.
- [ ] AC-04: A clean detached worktree whose HEAD is reachable from the default branch and whose entry is
      at least seven days old is removed. A detached worktree with unmerged commits, a younger entry, or
      changed or untracked files is kept.
- [ ] AC-05: A worktree entry whose directory no longer exists is removed from `git worktree list`
      by an applied plan.
- [ ] AC-06: `plan` without `--worktrees` proposes worktree removals, and `--worktrees false` proposes
      none. `apply` refuses a plan written in the previous format.
- [ ] AC-07: After `after-merge` for a merged PR, that PR's clean worktree and local branch are gone,
      unless the worktree is the main, invoking or locked one, or has changed or untracked files.
- [ ] AC-08: `references/branches.md`, `references/authority.md`, `references/maintenance.md`, the
      maintenance and ship skills and `docs/user-guides/workflows.md` describe these removal rules and
      no longer require a separate request for worktree cleanup.
- [ ] AC-09: On the Stackweaver checkout, a fresh `plan` proposes removing the worktrees these rules
      cover and keeps every worktree with unmerged commits or changed or untracked files.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc/branches`: a fixture worktree with an ignored `node_modules/` on a merged-PR branch is planned with its ignored paths, then removed by `apply` along with its branch. |
| AC-02 | `bun test tests/vh-adlc/branches`: fixtures with a modified tracked file and with an untracked file are kept; a third gains an untracked file after `plan`, and `apply` reports it failed and keeps its branch. |
| AC-03 | `bun test tests/vh-adlc/branches`: branches at the default tip with reflog ages of 8 days, 1 day and no reflog (set with `GIT_COMMITTER_DATE` and by deleting the reflog), checked for removed or kept with reason. |
| AC-04 | `bun test tests/vh-adlc/branches`: detached worktrees at a default-branch commit (old and new entry), at an unmerged commit, and with an untracked file. |
| AC-05 | `bun test tests/vh-adlc/branches`: a worktree whose directory the test deletes is planned and gone from `git worktree list --porcelain` after `apply`. |
| AC-06 | `bun test tests/vh-adlc/branches`: plans from the CLI with no flag and with `--worktrees false`; `apply` on a `schema_version: 1` plan exits non-zero with `unsupported branch plan`. |
| AC-07 | `bun test tests/vh-adlc/branches`: `afterMerge` on a fixture whose merged branch has a clean worktree, a dirty worktree and a locked worktree. |
| AC-08 | `bun test tests/vh-adlc` passes, and a reading of each named file shows the new rules with no remaining requirement for a separate worktree request. |
| AC-09 | Manual: run `bun plugins/vh-adlc/scripts/branches/cli.ts plan --repo ~/code/stackweaver --output <private file>`, then compare each `remove-worktree` and kept worktree against `git status --porcelain`, `git merge-base --is-ancestor` and the reflog. Pass when no proposed worktree has changed or untracked files or unmerged commits. Applying that plan needs separate owner approval. |

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q1: May a worktree go when its only extra files are ignored ones?

**Recommendation:** A. Clean to Git. Ignored files such as `node_modules` and `dist` held 22 of the 23
blocked Stackweaver worktrees, and the plan lists them before you approve.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Clean to Git** | Matches `git worktree remove` without `--force`; frees most stale worktrees | An ignored file you care about, such as a local `.env` or saved evidence, goes with the worktree if you approve the plan without reading the list |
| **B. Named ignored paths only** | Only paths a repository setting lists, such as `node_modules`, may go | A new per-repository setting to maintain; unlisted build output still blocks removal |
| **C. Keep today's rule** | No change in risk | Worktrees keep piling up |

**Why this is yours:** It decides whether files Git treats as disposable are disposable to you.

### Q2: May a branch with no commits of its own go once it is a week old?

**Recommendation:** A. Seven days by reflog. Its tip is already on the default branch, so no commit is
lost, and the age keeps a branch that was just created for new work.

| Option | You get | It costs |
| --- | --- | --- |
| **A. After seven days, by reflog** | Removes the 16 Stackweaver worktrees on such branches | A branch kept on purpose as a bookmark at an old commit is removed; a branch without a reflog is never removed |
| **B. Only together with its worktree** | Same as A, but a branch with no worktree stays | Leftover branches without worktrees remain |
| **C. Keep today's rule** | No change | Agent worktrees that never committed stay forever |

**Why this is yours:** The current rule deliberately protects such branches, and the right age is a
judgement.

### Q3: Should detached worktrees and worktrees with a missing directory be included?

**Recommendation:** A. Both. Stackweaver has 15 detached and 8 missing ones, and neither holds work
that is not already on the default branch.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Both** | Covers every kind of stale worktree | A detached worktree used as a scratch checkout of an old commit is removed after seven days if it is clean |
| **B. Missing directories only** | Removes only entries with nothing left on disk | Detached worktrees keep piling up |
| **C. Neither** | No change | Both kinds stay |

**Why this is yours:** It widens what the helper touches beyond branches.

### Q4: Should worktree removal run by default in sweeps and after merges?

**Recommendation:** A. Default on in both. That is what stops the build-up, and each removal still sits
in a plan you approve or follows a merge you approved.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Default in sweeps and after merges** | Worktrees go as soon as their work is merged | Your approval of a merge or plan now also covers worktree removal; the central rule that a worktree goes only on request is read that way, and may need a matching wording change in `vhco-pro/docs` |
| **B. Default in sweeps only** | Every sweep cleans up; merges leave the worktree until the next sweep | Worktrees linger between sweeps |
| **C. Keep opt-in** | No change to approvals | Nothing removes worktrees unless you ask, which is how they piled up |

**Why this is yours:** It changes what an approval you give covers, and it touches a central convention.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
