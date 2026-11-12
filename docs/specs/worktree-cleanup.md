---
status: draft
status_description: "Spec review R-2 found two blocking issues; factual fixes applied, two new questions for the owner."
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
worktree counts as clean when it has no changed tracked files and no untracked files; ignored files go
with it. A branch with no commits beyond the default branch's history is removed, with its worktree if
it has one, once it is at least seven days old. Detached worktrees whose commit is on the default
branch, and worktree entries whose directory is gone, are removed under the same rules. Removal still
uses plain `git worktree remove`, never `--force`. Work that is not on the default branch or in a
merged PR head is never removed.

A sweep plans worktree removal by default, and `after-merge` removes the merged PR's own worktree. A
worktree that holds ignored files is removed only through a plan the owner approved by digest after
seeing its list of ignored paths. `after-merge` keeps such a worktree, and a sweep the owner authorized
in advance stops for an explicit digest approval when its plan would delete ignored files.

Out of scope: how Claude Code, Codex or other hosts create their worktrees, the `vh-adlc clean` binary,
and anything outside Git worktrees and local branches.

The owner settled eight decisions on 2026-11-12, choosing option A each time:

- Worktrees whose only extra files are ignored ones may go, and the plan lists those files first.
- Outside a digest-approved plan, worktrees holding ignored files are kept.
- Branches with no commits of their own may go once they are seven days old. Age comes from the
  oldest reflog entry, or from the tip commit's date when the reflog has expired.
- Detached worktrees and entries with a missing directory are included. A detached one needs its
  commit on the default branch; one on a branch needs that branch proven merged, which includes a
  merged PR head.
- A detached worktree's age comes from its own HEAD reflog, so it measures creation, not last use.
- Removal runs by default in sweeps and after merges.
- The proofs were tightened as review R-1 proposed.

A worktree whose directory was moved by hand looks missing to Git, so its entry can go while the files
stay where they are. An entry whose directory still exists without its `.git` file, such as an empty
mount point, is kept. The central delivery rule says a worktree goes
only when the owner asks. This feature reads an approved plan or merge as that request; any wording
change in `vhco-pro/docs` is a separate change there.

The trade-offs: an ignored file the owner cares about, such as a local `.env` or saved evidence, goes
with its worktree when a plan is approved without reading its ignored list. Most merged worktrees hold
`node_modules`, so after a merge they usually wait for one plan approval. A branch kept on purpose as a
bookmark at an old default-branch commit is removed, and a branch created this week at an old commit
with no reflog looks old by its commit date. A clean detached scratch checkout created more than seven
days ago is removed even if it was used today.

Nothing is implemented. The checks below are planned, not run. Spec review R-1 found two blocking
issues: missing-directory entries could drop unmerged detached commits, and `after-merge` would delete
ignored files the owner never saw. Design items 4 and 5 close both. Spec review R-2 found two more:
with `status.showUntrackedFiles=no` the ignored list came back empty, and a worktree nested inside an
ignored directory of another, as `.claude/worktrees/` is in Stackweaver, would be deleted with its
untracked files. Design item 1 now closes both. Two questions are open: Q9 on whether the age rule
covers missing-directory entries, and Q10 on how kept worktrees appear in the plan. A new independent
review must pass before acceptance. Acceptance would authorize implementation on a feature branch; pushing, a PR,
merging and releasing each still need their own approval.

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
- Changing the central delivery convention in `vhco-pro/docs`. Any wording change there is a separate
  change.

## Design

The changes are in `observe`, `perform`, `execute`, `afterMerge` and `parsePlan` in `branches.ts`, the
`--worktrees` default in `cli.ts`, and the plan schema.

1. **Clean means clean to Git.** A worktree blocks removal only when
   `git status --porcelain --untracked-files=all --ignore-submodules=none` prints anything, which covers
   changed tracked files and untracked files. The explicit flags matter: with
   `status.showUntrackedFiles=no` set, plain `git status --porcelain` and `git worktree remove` both
   miss untracked files (R-1, F-03). Ignored files no longer block removal. The plan records, for each
   `remove-worktree` operation, the `!!` paths of
   `git status --porcelain --ignored=traditional --untracked-files=normal` exactly as Git prints them,
   so the owner sees them before approving. The explicit flags keep the list complete and collapsed to
   directories whatever `status.showUntrackedFiles` says (R-2, F-01). A worktree is also kept, with a
   reason, when another entry of `git worktree list` lies inside its directory, or when a `.git` file or
   directory exists under one of its ignored paths. Git would otherwise delete such a nested checkout,
   untracked files and all, as part of the ignored directory (R-2, F-02). `apply` runs these checks
   again just before `git worktree remove`.
2. **Branches with no commits of their own.** A local branch whose tip is the default branch tip or lies
   on its first-parent history counts as proven merged once the branch is at least seven days old. Its
   age comes from the oldest entry in `git reflog show --date=unix refs/heads/<branch>`. When that
   prints no entries, because the reflog expired or was never written, the age is the tip commit's
   committer date (`git log -1 --format=%ct <tip>`). This holds whether or not the branch has a
   worktree. Within seven days it stays kept with today's reason. Remote branches keep today's rule.
3. **Detached worktrees.** A detached worktree whose HEAD is reachable from the default branch, which
   is at least seven days old, and which is clean under item 1, gets a `remove-worktree` operation with
   no branch. Its age is the oldest entry in its own HEAD reflog,
   `$(git rev-parse --git-common-dir)/worktrees/<name>/logs/HEAD`, which records its creation. When that
   file has no entries, the age is the HEAD commit's committer date, as in item 2. Rebase or bisect in
   progress, main, invoking and locked worktrees stay kept as today.
4. **Missing directories.** A `prunable` worktree whose path no longer exists gets a `remove-worktree`
   operation only when its branch is proven merged under the branch rules, or, when it is detached,
   when its HEAD is reachable from the default branch. Otherwise it is kept with a reason, because
   removing the entry also drops its HEAD and HEAD reflog, the only reference to a detached commit.
   `git worktree remove` removes only the stale entry and never touches a moved directory. A
   `prunable` entry whose path still exists without a `.git` file is kept with a reason, because
   `git worktree remove` refuses it with `validation failed` and would fail on every apply (R-2, F-04).
5. **When removal runs.** `plan` includes worktree removal by default and takes `--worktrees false` to
   leave it out. `after-merge` also removes worktrees by default, and `after-merge --worktrees false`
   still leaves every worktree alone. It removes the merged PR's own worktree under the same proof and
   blockers,
   and also keeps it when it holds ignored files, with the reason `holds ignored files; remove it
   through an approved plan`. A sweep request that asks for stale-branch removal still preauthorizes
   its plan, except when a `remove-worktree` operation lists ignored paths: then the agent presents the
   plan with those lists and applies it only after the owner approves its digest. The maintenance and
   ship skills stop asking for a separate worktree request. Owner approval of the plan digest, or of the
   merge, is the request.
6. **Plan format.** The plan's `schema_version` becomes 2, so `apply` refuses a version 1 plan made
   under the old rules. `remove-worktree` gains an optional `branch` (absent when detached) and an
   `ignored` list. `same()` compares both, so a change after observation reports `changed`.

Items 1 to 5 follow the owner's answers of 2026-11-12. Rejected alternatives were:

- a per-repository list of removable ignored paths;
- removing branches with no commits of their own only together with their worktree;
- keeping branches whose reflog expired, or treating them as old enough;
- measuring a detached worktree's age by last use;
- missing-directory entries only;
- removal in sweeps only, or only on request;
- removing ignored files after a merge and reporting them afterwards;
- narrowing the criteria to the cases already tested;
- keeping today's rules.

## Acceptance Criteria

- [ ] AC-01: In a plan, a worktree on a proven-merged branch that has no changed or untracked files but
      does hold ignored files is proposed for removal, with its ignored paths listed as Git prints them,
      also when `status.showUntrackedFiles=no` is set. Applying
      the approved plan removes the worktree and its ignored files with plain `git worktree remove`, then
      deletes the branch.
- [ ] AC-02: A worktree with a changed tracked file or an untracked file is never removed, even with
      ignored files beside them or with `status.showUntrackedFiles=no` set, and its branch is kept with
      a reason naming the worktree. The same holds for a worktree that has another worktree, or any
      `.git`, inside one of its ignored directories. This also holds when the file appears between plan
      and apply.
- [ ] AC-03: A local branch whose tip is the default branch tip or an older commit on its first-parent
      history, and which is at least seven days old, is deleted, together with its clean worktree when it
      has one. Age is its oldest reflog entry, or its tip commit's committer date when the reflog has no
      entries. Such a branch younger than seven days is kept with a reason.
- [ ] AC-04: A clean detached worktree whose HEAD is reachable from the default branch and whose own HEAD
      reflog starts at least seven days ago is removed. A detached worktree with unmerged commits, a
      younger HEAD reflog, or changed or untracked files is kept.
- [ ] AC-05: A worktree entry whose directory no longer exists, on a proven-merged branch or detached
      at a commit reachable from the default branch, is removed from `git worktree list` by an applied
      plan. A detached missing-directory entry at an unmerged commit is kept with a reason, and so is an
      entry whose directory exists without a `.git` file.
- [ ] AC-06: `plan` without `--worktrees` proposes worktree removals, and `--worktrees false` proposes
      none. `apply` refuses a plan written in the previous format.
- [ ] AC-07: After `after-merge` for a merged PR, that PR's clean worktree and local branch are gone,
      unless the worktree is the main, invoking or locked one, has changed or untracked files, or holds
      ignored files, including when `status.showUntrackedFiles=no` is set. A kept worktree keeps its
      branch, with a reason.
- [ ] AC-08: `references/branches.md`, `references/authority.md`, `references/maintenance.md`, the
      maintenance and ship skills and `docs/user-guides/workflows.md` describe these removal rules, no
      longer require a separate request for worktree cleanup, and say that a preauthorized sweep whose
      plan lists ignored paths waits for the owner's digest approval.
- [ ] AC-09: On the Stackweaver checkout, a fresh `plan` proposes a `remove-worktree` for every linked
      worktree that meets items 1 to 4, and lists every other linked worktree as kept with a reason.
      No proposed worktree has changed or untracked files or unmerged commits.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc/branches`: a fixture worktree with an ignored `node_modules/` and `.env` on a merged-PR branch is planned with both ignored paths, then removed by `apply` along with its branch. A second fixture under `status.showUntrackedFiles=no` lists the same paths. |
| AC-02 | `bun test tests/vh-adlc/branches`: fixtures with a modified tracked file, with an untracked file, and with an untracked file under `status.showUntrackedFiles=no` are kept. A fourth has a second worktree with an untracked file inside its ignored `.claude/` directory, and a fifth has a plain nested Git repository there; both are kept. A sixth gains an untracked file after `plan`; `apply` reports both its approved operations as `changed`, and the worktree, the file and the branch remain. |
| AC-03 | `bun test tests/vh-adlc/branches`: separate fixtures, ages set with `GIT_COMMITTER_DATE` or by rewriting the reflog file: a branch at the default tip with an 8-day reflog and a worktree (removed with it); one at an older first-parent commit with an 8-day reflog and no worktree (removed); one with a 1-day reflog (kept with reason); one with its reflog deleted and a tip committed 8 days ago (removed); one with its reflog deleted and a tip committed 1 day ago (kept). |
| AC-04 | `bun test tests/vh-adlc/branches`: detached worktrees at a default-branch commit with an 8-day and a 1-day `logs/HEAD`, at an unmerged commit, and with an untracked file; only the first is removed. |
| AC-05 | `bun test tests/vh-adlc/branches`: a merged-branch worktree and a detached worktree at a default-branch commit, whose directories the test deletes, are planned and gone from `git worktree list --porcelain` after `apply`; a detached one at an unmerged commit, with its directory deleted, is kept with a reason, and so is one whose directory the test empties but keeps. |
| AC-06 | `bun test tests/vh-adlc/branches`: plans from the CLI with no flag and with `--worktrees false`; `apply` on a `schema_version: 1` plan exits non-zero with `unsupported branch plan`. |
| AC-07 | `bun test tests/vh-adlc/branches`: one fixture per case, each with the merged PR's branch checked out in a single worktree: clean with no ignored files (worktree and branch gone); holding an ignored `node_modules/`; holding an ignored `.env` under `status.showUntrackedFiles=no`; with an untracked file; locked; the main worktree; and the worktree `after-merge` runs from. Every case but the first keeps the worktree and branch with a reason. |
| AC-08 | `bun test tests/vh-adlc` passes, and a reading of each named file shows the new rules, no remaining requirement for a separate worktree request, and the digest stop for plans that list ignored paths. |
| AC-09 | Manual: run `bun plugins/vh-adlc/scripts/branches/cli.ts plan --repo ~/code/stackweaver --output <private file>`. For each linked worktree in `git worktree list --porcelain`, check items 1 to 4 independently with `git status --porcelain --untracked-files=all --ignore-submodules=none`, `git merge-base --is-ancestor`, the merged PR head, the reflog and the commit date. Pass when every worktree that meets them has a `remove-worktree`, every other one is kept with a reason, and no proposed worktree has changed or untracked files or unmerged commits. Applying that plan needs separate owner approval. |

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q9: Does the seven-day age rule also apply to detached entries whose directory is gone?

**Recommendation:** A. No age rule there. The directory is already gone, so nothing is in use, and the
entry holds only a HEAD that the default branch already contains.

| Option | You get | It costs |
| --- | --- | --- |
| **A. No age rule** | Missing detached entries go on the next sweep once their commit is on the default branch | A checkout whose directory was moved by hand an hour ago loses its entry; its files stay where they are |
| **B. Same seven days as item 3** | One rule for all detached worktrees | A stale entry with nothing on disk waits up to a week |

Either way, AC-04 gains a case for a detached worktree with an empty `logs/HEAD`, aged by its HEAD
commit date (R-2, F-05).

**Why this is yours:** It decides how much protection a missing worktree gets.

### Q10: How should a kept worktree appear in the plan?

**Recommendation:** A. A worktree record. The plan's kept list names only branches today
(`branches.ts:20`), so a detached worktree has nowhere to go and AC-09 cannot match kept worktrees.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Worktree record** | `kept` gains entries with scope `worktree`, the worktree's `path`, its `branch` when it has one, and the reason; AC-09 matches worktrees to them by path | The plan is longer: every linked worktree appears either as a removal or as a kept record |
| **B. Reason text only** | Kept branch reasons name the path, and detached worktrees go in a separate `kept_detached` list | Two places to read, and AC-09 has to parse reason text |

**Why this is yours:** It changes the plan format you read before approving.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-12 | R-1 | spec | `365242f8508007bb91a58a65055e660a0f4a6730` | unknown | procedural | Two blocking, seven should-fix and two nit findings; model identity not attested. |
| 2026-11-12 | R-2 | spec | `7806b5c77e6f55addd4b0f3d1d6487309104b4ee` | unknown | procedural | Two blocking, four should-fix and one nit finding; model identity not attested. |

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

### R-2

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design items 1 and 5, AC-01, AC-07, AC-08, Owner summary
EVIDENCE: Design item 1 builds the ignored list from "the `!!` paths of `git status --porcelain --ignored`". Item 5 and the Owner summary make that list the safeguard: `after-merge` keeps a worktree that "holds ignored files", and a preauthorized sweep stops for digest approval only "when a `remove-worktree` operation lists ignored paths". I tested this in a scratch repository with Git 2.55.0, using a linked worktree that held an ignored `.env` and `node_modules/x`. With default config, the command printed `!! .env` and `!! node_modules/`. After `git config status.showUntrackedFiles no`, the same command printed nothing. With `--untracked-files=normal` added, it printed both again. With `status.showUntrackedFiles all`, it printed `!! node_modules/x`, so every file under `node_modules` would be listed. Under the `no` setting, which the document already handles for untracked files (R-1 F-03), the ignored list is empty. `after-merge` and a preauthorized sweep would then delete `.env` before the owner ever saw it. That breaks the owner's Q1 and Q5 answers, "Outside a digest-approved plan, worktrees holding ignored files are kept." No AC or Test Plan row covers this config for the ignored list.
PROPOSAL: Collect the ignored list with explicit flags that override config, for example `git status --porcelain --ignored=traditional --untracked-files=normal`. Add a case under `status.showUntrackedFiles=no` to the AC-01 and AC-07 proofs in which the ignored files are still listed and the worktree is still kept by `after-merge`.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Design item 1, goal, AC-02, Owner summary
EVIDENCE: Design item 1 treats a worktree as clean when the status check prints nothing and lets ignored files "go with it". In a scratch repository with Git 2.55.0, linked worktree `a` ignored `.claude/`. A second worktree, `b`, was added at `a/.claude/worktrees/b` and given an untracked `u.txt`. `git -C a status --porcelain --untracked-files=all --ignore-submodules=none` printed nothing, and the ignored list showed only `!! .claude/`. `git worktree remove a` exited 0 and deleted `a/.claude/worktrees/b`, including `u.txt`. `git worktree list --porcelain` then showed `b` as `prunable`, so Design item 4 would remove its entry next. In Stackweaver, `git check-ignore -v` reports `.gitignore:72:.claude/*` and `.gitignore:9:.tmp/`, which are the two places where its linked worktrees live. Today `branches.ts:192` keeps any worktree with ignored output, so this loss is new with this feature. It contradicts the goal's "a worktree with changed or untracked files ... is always kept", and the owner sees only `.claude/` in the list.
PROPOSAL: Keep a worktree whose directory contains another entry from `git worktree list` (or any nested `.git`), with a reason, and add that case to AC-02 and its Test Plan row.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary, Design item 4, AC-05
EVIDENCE: The Owner summary's decision list says "Detached worktrees and entries with a missing directory are included, but only when their commit is on the default branch." Design item 4 and AC-05 also remove a missing-directory entry "when its branch is proven merged under the branch rules" ("on a proven-merged branch"). Those rules include containment in a merged PR head (`branches.ts:158`), which covers squash-merged branches whose commits are not on the default branch.
PROPOSAL: Correct the summary bullet so that branch entries need a proven-merged branch and only detached entries need a commit on the default branch. Alternatively, narrow item 4 and AC-05 if the bullet is what the owner meant.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design item 4, Owner summary
EVIDENCE: Item 4 says a `prunable` worktree is one "whose directory is gone", and that `git worktree remove` "removes only the stale entry". The summary says an entry on an unmounted volume "can go while the files stay". Git marks an entry prunable when its `.git` file is missing, even if the directory still exists. For example, an empty mount point stays behind when its volume is unmounted. In a scratch repository I emptied a worktree directory but kept the directory. `git worktree list --porcelain` showed `prunable gitdir file points to non-existent location`, and `git worktree remove ../m` exited 128 with `fatal: validation failed, cannot remove working tree: '.../m/.git' does not exist`. The entry stayed. Under item 4 such an entry is proposed in every plan and fails every apply. Its `delete-local` then fails with "its worktree was not removed" (`branches.ts:244`), and the run reports `complete: false`.
PROPOSAL: Plan removal only for a prunable entry whose path does not exist. Keep one whose directory exists without a `.git` file, with a reason. Correct the summary's wording on unmounted volumes.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design items 3 and 4, AC-04, AC-05, Test Plan
EVIDENCE: Item 3 requires a detached worktree to be "at least seven days old" and falls back to the HEAD commit's committer date when `logs/HEAD` has no entries. Item 4 removes a detached missing-directory entry "when its HEAD is reachable from the default branch" and says nothing about age. So it is unclear whether the seven-day rule applies there. The AC-05 row's fixture is created during the test, so it passes or fails depending on that reading. The item 3 fallback appears in neither AC-04 nor the AC-04 row. All 14 on-disk detached Stackweaver worktrees have a non-empty `logs/HEAD` (checked read-only), so AC-09 does not exercise the fallback either.
PROPOSAL: State whether the age rule applies to detached missing-directory entries, and set the AC-05 fixture age to match. Add an AC-04 case for a detached worktree with an empty `logs/HEAD` and an old and a recent HEAD commit date.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design item 6, AC-04, AC-05, AC-09
EVIDENCE: AC-04, AC-05 and AC-09 require detached and other linked worktrees to be "kept with a reason". The plan's kept record is `{ scope: "remote" | "local"; branch: string; reason: string }` (`branches.ts:20`), and every kept entry today names a branch. Branches whose proof fails are kept before their worktree is looked up (`branches.ts:189-190`), so the record never names the worktree path. Design item 6 changes only `remove-worktree` and does not say how a detached worktree, which has no branch, or a worktree path appears in `kept`. Without that, the AC-09 check "every other linked worktree is kept with a reason" has nothing in the plan to match.
PROPOSAL: Specify in item 6 a kept record that can name a worktree by path, with no branch when detached. Make AC-09 match worktrees to kept records by path.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Design
EVIDENCE: "All changes are in `observe`, `perform` and `execute` in `branches.ts`, plus the plan schema." The `--worktrees` default is set in `cli.ts:7-8` (`undefined` becomes `false`). The `after-merge` keep rule in item 5 touches `afterMerge` (`branches.ts:287-298`), and the version 1 refusal is in `parsePlan` (`branches.ts:256`). `after-merge` also accepts `--worktrees` today (`cli.ts:6`, `cli.ts:20`), and the design does not say what that flag does after the change.
PROPOSAL: List `cli.ts`, `afterMerge` and `parsePlan` among the changed places, and say whether `after-merge --worktrees false` still leaves worktrees alone.
