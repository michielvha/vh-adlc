---
status: draft
status_description: "Spec review R-1 found two blocking issues; factual fixes applied, four new questions for the owner."
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
Removal still uses plain `git worktree remove`, never `--force`. A worktree that holds ignored files is
removed only after the owner has seen those files; Q5 decides how that works after a merge and in a
sweep the owner already authorized. A sweep plans worktree removal by default and `after-merge` removes the
merged PR's own worktree. Work that is not on the default branch
or in a merged PR head is never removed.

Out of scope: how Claude Code, Codex or other hosts create their worktrees, the `vh-adlc clean` binary,
and anything outside Git worktrees and local branches.

The owner settled four decisions on 2026-11-12. Worktrees that hold only ignored files may go, and
the plan lists those files first. Branches with no commits of their own may go once their reflog is
seven days old. Detached worktrees and entries with a missing directory are included, but only when their commit is
on the default branch. A worktree whose directory was moved by hand or sits on an unmounted volume
looks missing to Git, so its entry can go while the files stay where they are. Removal runs by
default in sweeps and after merges, so approving a merge or a sweep plan counts as the owner asking for
the worktree to go. The central delivery rule says a worktree goes only when the owner asks; this
feature reads an approved plan or merge as that request, and any wording change in `vhco-pro/docs` is
a separate change there.

The trade-off is that an ignored file the owner cares about, such as a local `.env` or saved evidence,
goes with its worktree when the plan is approved without reading its ignored list. A branch kept on
purpose as a bookmark at an old default-branch commit, or a clean detached scratch checkout older than
seven days, is removed too.

Nothing is implemented. The checks below are planned, not run. Spec review R-1 found two blocking
issues: missing-directory entries could drop unmerged detached commits, and `after-merge` would delete
ignored files the owner never saw. The first is fixed below; the second is Q5. A new independent
review must pass before acceptance. Four questions are open: Q5 on ignored files outside an approved
plan, Q6 on branches without a reflog, Q7 on how a detached worktree's age is measured and Q8 on
tighter proofs. Acceptance would
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
--force to delete it`. After the directory of a third worktree, `../w3`, was deleted, `git worktree remove
../w3` removed its stale entry, and `git worktree list` went from 2 entries to 1.

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

1. **Clean means clean to Git.** A worktree blocks removal only when
   `git status --porcelain --untracked-files=all --ignore-submodules=none` prints anything, which covers
   changed tracked files and untracked files. The explicit flags matter: with
   `status.showUntrackedFiles=no` set, plain `git status --porcelain` and `git worktree remove` both
   miss untracked files (R-1, F-03). Ignored files no longer block removal. The plan records, for each
   `remove-worktree` operation, the `!!` paths of `git status --porcelain --ignored` exactly as Git
   prints them, so the owner sees them before approving. `apply` runs the same check again just before
   `git worktree remove`.
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
   operation only when its branch is proven merged under the branch rules, or, when it is detached,
   when its HEAD is reachable from the default branch. Otherwise it is kept with a reason, because
   removing the entry also drops its HEAD and HEAD reflog, the only reference to a detached commit.
   `git worktree remove` removes only the stale entry and never touches a moved or unmounted
   directory.
5. **When removal runs.** `plan` includes worktree removal by default and takes `--worktrees false` to
   leave it out. `after-merge` removes the merged PR's own worktree under the same proof and blockers.
   The maintenance skill and the ship skill stop asking for a separate worktree request. Owner approval
   of the plan digest, or of the merge, is the request.
6. **Plan format.** The plan's `schema_version` becomes 2, so `apply` refuses a version 1 plan made
   under the old rules. `remove-worktree` gains an optional `branch` (absent when detached) and an
   `ignored` list. `same()` compares both, so a change after observation reports `changed`.

Items 1 to 5 follow the owner's answers of 2026-11-12; Q5 to Q8 may still change items 2, 3 and 5. Item 1: ignored files may go, listed in the
plan first. Item 2: seven days by reflog, whether or not the branch has a worktree. Items 3 and 4: both
detached and missing-directory worktrees. Item 5: default in sweeps and after merges. Rejected
alternatives were a per-repository list of removable ignored paths, removing such branches only
together with their worktree, missing-directory entries only, sweeps only, and keeping today's rules.

## Acceptance Criteria

- [ ] AC-01: In a plan, a worktree on a proven-merged branch that has no changed or untracked files but
      does hold ignored files is proposed for removal, with its ignored paths listed as Git prints them. Applying
      the approved plan removes the worktree and its ignored files with plain `git worktree remove`, then
      deletes the branch.
- [ ] AC-02: A worktree with a changed tracked file or an untracked file is never removed, even with
      ignored files beside them or with `status.showUntrackedFiles=no` set, and its branch is kept with
      a reason naming the worktree. This also holds when the file appears between plan and apply.
- [ ] AC-03: A local branch whose tip is on the default branch's first-parent history, created at least
      seven days ago according to its reflog, is deleted together with its clean worktree. Such a branch
      younger than seven days, or with no readable reflog, is kept with a reason.
- [ ] AC-04: A clean detached worktree whose HEAD is reachable from the default branch and whose entry is
      at least seven days old is removed. A detached worktree with unmerged commits, a younger entry, or
      changed or untracked files is kept.
- [ ] AC-05: A worktree entry whose directory no longer exists, on a proven-merged branch or detached
      at a commit reachable from the default branch, is removed from `git worktree list` by an applied
      plan. A detached missing-directory entry at an unmerged commit is kept with a reason.
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
| AC-02 | `bun test tests/vh-adlc/branches`: fixtures with a modified tracked file, with an untracked file, and with an untracked file under `status.showUntrackedFiles=no` are kept. A fourth gains an untracked file after `plan`; `apply` reports both its approved operations as `changed`, and the worktree, the file and the branch remain. |
| AC-03 | `bun test tests/vh-adlc/branches`: branches at the default tip with reflog ages of 8 days, 1 day and no reflog (set with `GIT_COMMITTER_DATE` and by deleting the reflog), checked for removed or kept with reason. |
| AC-04 | `bun test tests/vh-adlc/branches`: detached worktrees at a default-branch commit (old and new entry), at an unmerged commit, and with an untracked file. |
| AC-05 | `bun test tests/vh-adlc/branches`: a merged-branch worktree and a detached worktree at a default-branch commit, whose directories the test deletes, are planned and gone from `git worktree list --porcelain` after `apply`; a detached one at an unmerged commit, with its directory deleted, is kept with a reason. |
| AC-06 | `bun test tests/vh-adlc/branches`: plans from the CLI with no flag and with `--worktrees false`; `apply` on a `schema_version: 1` plan exits non-zero with `unsupported branch plan`. |
| AC-07 | `bun test tests/vh-adlc/branches`: `afterMerge` on a fixture whose merged branch has a clean worktree, a dirty worktree and a locked worktree. |
| AC-08 | `bun test tests/vh-adlc` passes, and a reading of each named file shows the new rules with no remaining requirement for a separate worktree request. |
| AC-09 | Manual: run `bun plugins/vh-adlc/scripts/branches/cli.ts plan --repo ~/code/stackweaver --output <private file>`, then compare each `remove-worktree` and kept worktree against `git status --porcelain`, `git merge-base --is-ancestor` and the reflog. Pass when no proposed worktree has changed or untracked files or unmerged commits. Applying that plan needs separate owner approval. |

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q5: How does the owner see ignored files before `after-merge` or an authorized sweep deletes them?

**Recommendation:** A. Plan them instead. Your Q1 answer let ignored files go because the plan lists
them first, and `after-merge` (`branches.ts:287-298`) applies at once without a plan file or digest.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Plan them instead** | `after-merge` and a sweep you authorized in advance remove only worktrees with no ignored files; worktrees that hold ignored files go into a plan with their list, which you approve by digest | Most merged worktrees hold `node_modules`, so after a merge they usually wait for one plan approval |
| **B. Remove and report** | Merged worktrees go at once; the report lists the ignored paths that were deleted | You see a lost `.env` or evidence file only after it is gone |
| **C. Never outside a plan** | `after-merge` removes no worktrees at all | Worktrees wait for the next sweep |

**Why this is yours:** It decides what your merge approval covers.

### Q6: How old is a branch whose reflog has expired?

**Recommendation:** A. The tip commit's date. Git drops reflog entries after 90 days by default;
88 of 267 Stackweaver branches have none, and 4 of the 56 branches with no commits of their own are
among them.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Tip commit date** | Old branches without a reflog are removed too | A branch created this week at an old commit looks old; removal is still limited to branches with no commits of their own |
| **B. Keep it** | No guessing about age | Such branches and their worktrees stay forever, and more join them every 90 days |
| **C. Treat as old enough** | Simplest rule | A branch whose reflog was turned off is removed on its first sweep |

**Why this is yours:** It is a trade-off between keeping work-in-progress bookmarks and stopping
the build-up.

### Q7: How is a detached worktree's age measured?

**Recommendation:** A. When it was created. The admin directory's modification time resets on any
checkout or index write, so it measures last use rather than age (R-1, F-08).

| Option | You get | It costs |
| --- | --- | --- |
| **A. Creation, by its `logs/HEAD`** | The same meaning as branches: the oldest entry in the worktree's own HEAD reflog, falling back to Q6's answer when it is missing | A scratch checkout created two weeks ago and used today goes if it is clean and its commit is merged |
| **B. Last use, by modification time** | A detached worktree in use is never removed | Any checkout or `git status` that writes the index resets the clock, so the age is unreliable |

**Why this is yours:** It decides whether recent use protects a detached worktree.

### Q8: Should the proofs be tightened as the review proposed?

**Recommendation:** A. Tighten them. Today AC-09 passes with zero removals, AC-03 tests only the
default-tip case, and AC-07 tests three of its five exceptions.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Tighten them** | AC-09 passes only if every eligible worktree is planned for removal and every other is kept with a reason; AC-03 adds a branch at an older first-parent commit and one without a worktree; AC-07 gets one fixture per case, including the main and invoking worktrees | More tests to write |
| **B. Narrow the criteria** | AC-03 and AC-07 cover only what is tested, and AC-09 stays a safety check | Gaps remain untested, and AC-09 cannot show that the build-up stopped |

**Why this is yours:** It decides what counts as proof that this feature works.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-12 | R-1 | spec | `365242f8508007bb91a58a65055e660a0f4a6730` | unknown | procedural | Two blocking, seven should-fix and two nit findings; model identity not attested. |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design item 4, AC-04, AC-05, Owner summary
EVIDENCE: Design item 4 says "A `prunable` worktree, whose directory is gone, gets a `remove-worktree` operation" and sets no condition on HEAD. AC-05 says the same for every missing-directory entry. AC-04 says "A detached worktree with unmerged commits ... is kept". The goal and the Owner summary say work that is not on the default branch or in a merged PR head "is never removed". A detached worktree's only reference to its commits is its HEAD in `$GIT_COMMON_DIR/worktrees/<name>/`. In a scratch repository with Git 2.55.0, `git worktree remove ../w4` on a detached entry whose directory had been deleted exited 0 and dropped that admin directory. Its HEAD and HEAD reflog went with it. Stackweaver currently has one detached prunable entry (`/tmp/stackweaver-ci-baseline-clean-base-20261105`, HEAD df11805). That commit happens to be an ancestor of origin/main, but nothing in the design limits removal to that case. An entry whose directory was moved by hand or sits on an unmounted volume also shows as prunable, and removing its entry orphans that checkout.
PROPOSAL: Remove a missing-directory entry only when it has a branch, or when its detached HEAD is reachable from the default branch, and keep it otherwise with a reason. Add an AC-04/AC-05 case for a detached, missing-directory entry with unmerged commits, and say in the Owner summary that moved or unmounted worktrees are treated as missing.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Owner summary, Design items 1 and 5
EVIDENCE: The Owner summary says "every removal still goes through the plan and its approved digest" and that the owner allowed ignored-only worktrees to go because "the plan lists those files first". Design item 1 says the ignored list is recorded "so the owner sees them before approving". `afterMerge` (branches.ts:287-298) observes and calls `execute` right away, with no plan file, digest or display. Design item 5 makes worktree removal the default there. references/branches.md:88-90 also says a sweep request that already asks for stale-branch removal lets the agent "apply it without asking again". In both paths a worktree and its ignored files, such as a `.env`, are deleted before the owner sees the ignored list. That breaks the condition attached to the owner's Q1 answer.
PROPOSAL: Say how the ignored list reaches the owner before deletion in `after-merge` and in a preauthorized sweep. For example, keep worktrees that hold ignored files out of those paths unless a digest-approved plan lists them. Correct the Owner summary's "every removal ... approved digest" claim to match.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design item 1, AC-02
EVIDENCE: Design item 1 treats a worktree as clean when `git status --porcelain` prints nothing and relies on `git worktree remove` to re-check. I tested this in a scratch repository with Git 2.55.0 and `status.showUntrackedFiles=no` set in the repository config. `git -C ../w3 status --porcelain` printed nothing for a worktree that held an untracked `u.txt`. `git worktree remove ../w3` then exited 0 and deleted the directory, including `u.txt`. Running `git -c status.showUntrackedFiles=no worktree remove ../w2` removed an untracked file in the same way. The goal says a worktree with untracked files "is always kept".
PROPOSAL: Run the cleanliness check with explicit flags that ignore that config, such as `--untracked-files=all --ignore-submodules=none`. Add an AC-02 test case with `status.showUntrackedFiles=no` set.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design item 2, AC-03, Open Questions
EVIDENCE: Design item 2 keeps a branch whose reflog is missing or unreadable. `gc.reflogExpire` defaults to 90 days, so old branches lose their reflog entries. In /home/m/code/stackweaver on 2026-11-12, `git reflog show --date=unix refs/heads/<b>` printed no entries for 88 of 267 local branches. Of the 56 branches whose tip is on origin/main's first-parent history, which matches the document's 55 plus 1, 4 have no reflog, and 1 of those 4 is checked out in a worktree. Under this rule those branches and that worktree stay forever, and every such branch that a sweep misses for about 90 days joins them. This contradicts the goal that worktrees "stop piling up". The keep-on-missing-reflog choice is an author-settled trade-off that does not appear as an open question.
PROPOSAL: Choose a fallback age source for a branch with no reflog entries, such as the tip commit date, or raise the choice as an owner question. Add an AC-03 case for a branch with an expired reflog.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-02 row
EVIDENCE: The row expects that when "a third gains an untracked file after `plan`, ... `apply` reports it failed". `execute` (branches.ts:241-251) first observes again. A worktree that is dirty at that point gets no `remove-worktree` or `delete-local` operation in the fresh plan (branches.ts:193-194). Both approved operations therefore get `changed` (branches.ts:245), not `failed`. `failed` only happens if the file appears between the fresh observation and `git worktree remove`.
PROPOSAL: Expect `changed` for both operations when the file appears before `apply`, with the worktree, the file and the branch still present. Test the `failed` path separately only if the design means the race window.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: AC-09, Test Plan AC-09 row
EVIDENCE: The AC-09 row's pass condition is "Pass when no proposed worktree has changed or untracked files or unmerged commits." A plan that proposes 0 `remove-worktree` operations, which is today's result in the Background section, meets that condition. So the original problem can survive with AC-09 passing. The criterion's other half, "proposes removing the worktrees these rules cover", has no observable target.
PROPOSAL: Add an enumerated, checkable expectation to the pass condition. For example, every on-disk worktree that is clean under item 1 and whose branch or HEAD meets items 2 to 4 must appear as a `remove-worktree`, and every other worktree must appear as kept with a reason.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: AC-03, Test Plan AC-03 row
EVIDENCE: AC-03 covers a tip "on the default branch's first-parent history". The proof only tests "branches at the default tip". Today the tip case (branches.ts:159) and the older first-parent case (branches.ts:161-162) are separate code paths, and 55 of the 56 Stackweaver cases are the older one. Design item 2 also applies "whether or not the branch has a worktree". AC-03 says "deleted together with its clean worktree", and the proof names no case without a worktree.
PROPOSAL: Add fixtures for a branch at an older first-parent commit and for a branch with no worktree. Change AC-03 so it covers the case without a worktree.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design item 3, AC-04
EVIDENCE: Item 3 requires the admin directory under `$(git rev-parse --git-common-dir)/worktrees/` to be "at least seven days old" but does not say which timestamp counts. In a scratch repository, I set the admin directory's mtime to 2026-10-01. `git -C ../w checkout -q --detach HEAD` then reset it to the current time, so mtime tracks the last HEAD or index write, not the entry's creation. Item 2 uses the oldest reflog entry for branches. The worktree's own `logs/HEAD` would give the same meaning for detached worktrees.
PROPOSAL: Name the age source exactly, for example the oldest entry in the worktree's `logs/HEAD`, or mtime if last activity is what is meant. State the fallback when it is missing, and have the AC-04 fixture set that same source.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: AC-07, Test Plan AC-07 row
EVIDENCE: The row tests "a fixture whose merged branch has a clean worktree, a dirty worktree and a locked worktree". Git refuses to check out one branch in more than one worktree without `--force`, so this needs separate fixtures, which the row does not say. AC-07 also excepts the main and invoking worktrees, and the row tests neither. Under the standard, "A passing subset never upgrades a composite criterion".
PROPOSAL: Describe one fixture per case and add the main-worktree and invoking-worktree cases. Alternatively, narrow AC-07 to the cases that are tested.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Design item 1, AC-01
EVIDENCE: The document says the plan lists "ignored top-level paths". `git status --porcelain --ignored` reports the shallowest ignored path, which is often nested. In a Stackweaver worktree it printed `!! frontend/node_modules`, `!! frontend/dist/` and `!! frontend/public/docs-index.json`, and `frontend` itself is tracked. Taken literally, "top-level" would list a tracked directory or nothing at all.
PROPOSAL: Say that the list holds the `!!` paths exactly as Git prints them.

FINDING: F-11
KIND: factual
SEVERITY: nit
WHERE: Context, Background
EVIDENCE: "After the directory of a third worktree was deleted, `git worktree remove ../w1` removed its stale entry". `../w1` is the worktree already deleted in the first experiment, so the command does not match the "third worktree" it describes.
PROPOSAL: Name the third worktree's actual path in the command.
