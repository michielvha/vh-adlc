---
status: draft
status_description: "Review R-6 fixes applied on 2026-11-12; awaiting a new independent spec review."
issue: null
goal: "Branch cleanup removes every linked worktree whose work is already on the default branch or in a merged PR, including ones that hold only ignored build output, so worktrees stop piling up after merges, while a worktree with changed or untracked files or unmerged commits is always kept; only commits that a branch worktree's HEAD reflog alone still names, such as copies from before a rebase, go with it."
covers:
  - plugins/vh-adlc/scripts/branches/
  - plugins/vh-adlc/references/branches.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/maintenance.md
  - plugins/vh-adlc/references/audit.md
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
uses plain `git worktree remove`, never `--force`. Commits that are not on the default branch or in
a merged PR head are never removed, with one exception: commits that only a branch worktree's HEAD
reflog still names, such as copies from before a rebase, go with that worktree.

A sweep plans worktree removal by default, and `after-merge` removes the merged PR's own worktree
unless it runs from that worktree. A feature shipped from its owning worktree, as the ship skill does,
is therefore removed by the next sweep. A
worktree that holds ignored files is removed only through a plan the owner approved by digest after
seeing its list of ignored paths. `after-merge` keeps such a worktree, and a sweep the owner authorized
in advance stops for an explicit digest approval when its plan would delete ignored files.

Worktrees that a pending vh-adlc audit or maintenance run created are locked by that run, so the
helper keeps them until the run closes and unlocks them.

Out of scope: how Claude Code, Codex or other hosts create their worktrees, the `vh-adlc clean` binary,
and anything outside Git worktrees and local branches.

The owner settled eighteen decisions on 2026-11-12, choosing option A each time, the last three under
a standing instruction to take the recommended option:

- Worktrees whose only extra files are ignored ones may go, and the plan lists those files first.
- Each listed ignored path shows how many files and bytes go with it.
- Outside a digest-approved plan, worktrees holding ignored files are kept.
- Branches with no commits of their own may go once they are seven days old. Age comes from the
  oldest reflog entry, or from the tip commit's date when the reflog has expired.
- Detached worktrees and entries with a missing directory are included. A detached one needs its
  commit on the default branch; one on a branch needs that branch proven merged, which includes a
  merged PR head.
- A detached worktree's age comes from its own HEAD reflog, so it measures creation, not last use.
- A detached entry whose directory is gone needs no minimum age.
- Removal runs by default in sweeps and after merges.
- The plan lists every kept worktree as its own record, by path.
- A detached worktree is kept when its HEAD reflog names a commit that no local branch, and no
  remote-tracking ref of a branch the remote still has, contains.
- Audit and maintenance runs lock the worktrees they create and unlock them when the run closes.
- The proofs were tightened as reviews R-1, R-3 and R-4 proposed.
- A kept record names every rule that keeps it, so each rule can be tested on its own.
- A branch worktree's HEAD reflog is not checked, so commits only it names go with the worktree.
- `after-merge` keeps the worktree it runs from, and the ship skill says the next sweep removes it.

A worktree whose directory was moved by hand looks missing to Git, so its entry can go while the files
stay where they are. An entry whose directory still exists without its `.git` file, such as an empty
mount point, is kept. The central delivery rule says a worktree goes
only when the owner asks. This feature reads an approved plan or merge as that request; any wording
change in `vhco-pro/docs` is a separate change there.

The trade-offs: the plan shows ignored directories by name, file count and size, not file by file. An
ignored file the owner cares about, such as a local `.env` or saved evidence inside `.tmp/`, goes with
its worktree when the plan is approved, so the owner judges a directory by its name and size. Most merged worktrees hold
`node_modules`, so after a merge they usually wait for one plan approval. A branch kept on purpose as a
bookmark at an old default-branch commit is removed, and a branch created this week at an old commit
with no reflog looks old by its commit date. A clean detached scratch checkout created more than seven
days ago is removed even if it was used today. A detached worktree that was rebased or used for
experiments keeps its old commits in its HEAD reflog, so it stays until the owner removes it by hand. A
run that dies before closing leaves its worktrees locked, and the owner unlocks them by hand. Worktrees
of runs already pending when this ships are not locked, so the owner locks any that must survive the
first sweep. Branch worktrees are not checked for commits that only their HEAD reflog names. On
2026-11-12 at least 15 Stackweaver branch worktrees held such commits, 72 in one, most likely copies
from before a rebase, and they go with their worktree.

Nothing is implemented. The checks below are planned, not run. Spec review R-1 found two blocking
issues: missing-directory entries could drop unmerged detached commits, and `after-merge` would delete
ignored files the owner never saw. Design items 4 and 5 close both. Spec review R-2 found two more:
with `status.showUntrackedFiles=no` the ignored list came back empty, and a worktree nested inside an
ignored directory of another, as `.claude/worktrees/` is in Stackweaver, would be deleted with its
untracked files. Design item 1 now closes both. Spec review R-3 found one more: a detached worktree
paused in a rebase can sit on a default-branch commit while its own commits exist only in the rebase
state, and removing it lost them. Design item 3 now keeps any worktree with rebase or bisect state.
Spec review R-4 found one more: when a worktree's removal ended `changed` because its ignored files
changed after the plan, `apply` still deleted its branch while it was checked out, which leaves that
worktree on a missing branch. Design item 6 now deletes a branch only after its worktree is gone.
The owner then chose to keep detached worktrees whose HEAD reflog holds commits found nowhere else,
to have runs lock the worktrees they own, and to add tests for the remaining keep rules. Spec review
R-5 found that a branch could still be deleted while checked out, when a worktree was added on it or
moved after the plan, and that a stale remote-tracking ref could make a reflog-only commit look safe.
It also found that changes hidden with `skip-worktree` or `assume-unchanged` were lost on removal.
Design items 1, 3, 5 and 6 now close these. Spec review R-6 found that a missing-directory entry
with submodule state would lose commits that exist only in its admin `modules/` directory; design item
4 now keeps it. A new independent review must pass before acceptance. Acceptance would authorize implementation on a feature branch; pushing, a PR,
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
- The lock that audit and maintenance runs put on the worktrees they create.
- The guides that describe these rules: `references/branches.md`, `references/authority.md`,
  `references/maintenance.md`, the maintenance and ship skills, and `docs/user-guides/workflows.md`.
- `references/audit.md`, which describes what `after-merge` removes.
- Tests in `tests/vh-adlc/branches/` and the plugin version bump.

Out of scope:

- How Claude Code, Codex or other hosts create or clean up their own worktrees.
- The `vh-adlc clean` binary, `/tmp` and temp-root cleanup, Compose projects and kind clusters.
- A scheduled or background cleanup that runs without a plan the owner approved.
- Remote branch rules. They stay as they are.
- Changing the central delivery convention in `vhco-pro/docs`. Any wording change there is a separate
  change.

## Design

The changes are in `worktrees()`, the `Worktree` type, `observe`, `perform`, `absent()`, `execute`,
`afterMerge` and `parsePlan` in `branches.ts`, the `--worktrees` default in `cli.ts`, and the plan
schema. `worktrees()` also reads each entry's HEAD and admin directory name, which items 3 and 4 need.

1. **Clean means clean to Git.** A worktree blocks removal only when
   `git status --porcelain --untracked-files=all --ignore-submodules=none` prints anything, which covers
   changed tracked files and untracked files. The explicit flags matter: with
   `status.showUntrackedFiles=no` set, plain `git status --porcelain` and `git worktree remove` both
   miss untracked files (R-1, F-03). Ignored files no longer block removal. The plan records, for each
   `remove-worktree` operation, the `!!` paths of
   `git status --porcelain --ignored=traditional --untracked-files=normal` exactly as Git prints them,
   each with the number of files and the total bytes under it, so the owner sees them before approving.
   The count walks the path without following symbolic links, counts every non-directory entry, and
   adds up their `lstat` sizes. A path the walk cannot read keeps the worktree with a reason. The explicit flags keep the list complete and collapsed to
   directories whatever `status.showUntrackedFiles` says (R-2, F-01). A worktree is also kept, with a
   reason, when another entry of `git worktree list` lies inside its directory, or when a `.git` file or
   directory exists under one of its ignored paths. Git would otherwise delete such a nested checkout,
   untracked files and all, as part of the ignored directory (R-2, F-02). A worktree with submodule
   state is kept with a reason too, because `git worktree remove` refuses it (R-3, F-02). That covers
   an initialized submodule and a `modules/` directory left in the worktree's admin directory after
   `git submodule deinit` (R-4, F-05). A worktree whose `git ls-files -v` shows an assume-unchanged
   entry (a lowercase tag) or a skip-worktree entry (`S`) whose file exists on disk is kept with a
   reason, because `git status` and `git worktree remove` both overlook changes to such files (R-5,
   F-06). When either status command exits non-zero or times out, the
   worktree is kept with a reason
   rather than read as clean (R-3, F-03). `apply` runs these checks again just before
   `git worktree remove`.
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
   file has no entries, the age is the HEAD commit's committer date, as in item 2. Main, invoking and
   locked worktrees stay kept as today. A detached worktree, present or `prunable`, is also kept with
   a reason when its `logs/HEAD` names a commit that no local branch, and no remote-tracking ref of a
   branch the remote still has, contains: `git rev-list <every non-zero oid in logs/HEAD> --not
   --branches <each refs/remotes/origin/<b> whose b the observed remote branch set lists>` prints
   anything, or fails, for example because a named commit no longer exists. Stale tracking refs do not
   count, because the same plan prunes them before it removes worktrees (R-5, F-02). A worktree that committed X and then
   checked out the default branch would otherwise look merged, and removing it would lose X (R-4,
   F-02). Branch worktrees skip this check, because their pre-rebase commits would keep every rebased
   and merged feature worktree forever; the owner accepted that trade-off (R-6, F-02). Any worktree, detached or on a branch, present or `prunable`, is
   kept when its admin directory holds `rebase-merge`, `rebase-apply` or `BISECT_LOG`. Today's check
   only notices these when they name a branch, so a detached rebase whose HEAD already sits on the
   default branch would otherwise be removed and its own commits lost (R-3, F-01).
4. **Missing directories.** A `prunable` worktree whose path no longer exists gets a `remove-worktree`
   operation only when its branch is proven merged under the branch rules, or, when it is detached,
   when its HEAD is reachable from the default branch and item 3's reflog check passes. A detached one
   needs no minimum age, since
   nothing is left on disk to be in use. Otherwise it is kept with a reason, because
   removing the entry also drops its HEAD and HEAD reflog, the only reference to a detached commit.
   `git worktree remove` removes only the stale entry and never touches a moved directory. A
   `prunable` entry whose path still exists without a `.git` file is kept with a reason, because
   `git worktree remove` refuses it with `validation failed` and would fail on every apply (R-2, F-04).
   A `prunable` entry whose admin directory holds `modules/` is kept with a reason too. Git checks for
   submodules only when the directory exists, so removing the entry would delete that `modules/`
   directory and any submodule commits that exist only there (R-6, F-01).
5. **When removal runs.** `plan` includes worktree removal by default and takes `--worktrees false` to
   leave it out. `after-merge` also removes worktrees by default, and `after-merge --worktrees false`
   still leaves every worktree alone. It considers only the merged PR's branch and the worktree that
   has it checked out, never detached or other worktrees (R-5, F-04). It removes the merged PR's own
   worktree under the same proof and blockers, so it keeps the worktree it runs from. A feature
   shipped from its owning worktree is removed by the next sweep, and the ship skill says so (R-6,
   F-03). `after-merge` also keeps the PR's worktree when it holds ignored files, with the reason `holds ignored files; remove it
   through an approved plan`. A sweep request that asks for stale-branch removal still preauthorizes
   its plan, except when a `remove-worktree` operation lists ignored paths: then the agent presents the
   plan with those lists and applies it only after the owner approves its digest. The maintenance and
   ship skills stop asking for a separate worktree request. Owner approval of the plan digest, or of the
   merge, is the request. Audit and maintenance runs lock each worktree they create with
   `git worktree lock --reason "vh-adlc <run-id>"` and unlock it when the run closes, before their own
   normal removal of it. The helper keeps locked worktrees with a reason that includes the lock
   reason, so a sweep or `after-merge` that runs while the run is pending leaves them alone (R-4, F-03).
   `references/audit.md`, `references/maintenance.md` and `references/authority.md` gain this step.
6. **Plan format.** The plan's `schema_version` becomes 2, so `apply` refuses a version 1 plan made
   under the old rules. `remove-worktree` gains an optional `branch` (absent when detached) and an
   `ignored` list of `{ path, files, bytes }` records. `same()` compares both, so a change after
   observation, including a changed file count or size, reports `changed`. An approved `delete-local`
   that the fresh plan no longer proposes unchanged reports `changed` or `already-absent` as today.
   Otherwise `apply` deletes the branch only when the fresh observation showed no worktree on it, or
   when the worktree that had it checked out was removed with result `done` earlier in the same run.
   Every other case reports `failed` with `its worktree was not removed`: a removal that ended
   `changed` or `failed`, a worktree added on the branch after the plan, and a worktree moved after the
   plan, whose removal reports `already-absent` because `absent()` matches by path. The reason is that
   `git update-ref -d` deletes a branch even while a worktree has it checked out (R-4, F-01; R-5, F-01
   and F-03). A kept record's reason names every rule that keeps it, joined with `; ` (R-5, F-05). `kept`
   gains records with scope `worktree`, the worktree's `path`, its `branch` when it has one, and the
   reason. Every linked worktree in scope then appears either as a `remove-worktree` or as one such
   record, and a branch kept because of its worktree still has its `local` record as today.

Items 1 to 5 follow the owner's answers of 2026-11-12. Rejected alternatives were:

- a per-repository list of removable ignored paths;
- removing branches with no commits of their own only together with their worktree;
- keeping branches whose reflog expired, or treating them as old enough;
- measuring a detached worktree's age by last use;
- a seven-day wait for detached entries whose directory is gone;
- naming kept worktrees only in reason text, with a separate list for detached ones;
- missing-directory entries only;
- removal in sweeps only, or only on request;
- removing ignored files after a merge and reporting them afterwards;
- showing ignored directories by name only, or listing every ignored file;
- narrowing the criteria to the cases already tested;
- judging a detached worktree by its current HEAD only;
- finding run-owned worktrees through the run journal, or accepting their removal;
- checking a branch worktree's HEAD reflog too;
- having the ship skill run `after-merge` from another worktree;
- keeping today's rules.

## Acceptance Criteria

- [ ] AC-01: In a plan, a worktree on a proven-merged branch that has no changed or untracked files but
      does hold ignored files is proposed for removal, with its ignored paths listed as Git prints them,
      each with its file count and total bytes, also when `status.showUntrackedFiles=no` is set. Applying
      the approved plan removes the worktree and its ignored files with plain `git worktree remove`, then
      deletes the branch.
- [ ] AC-02: A worktree with a changed tracked file or an untracked file is never removed, even with
      ignored files beside them or with `status.showUntrackedFiles=no` set, and its branch is kept with
      a reason naming the worktree. The same holds for a worktree that has another worktree, or any
      `.git`, inside one of its ignored directories. This also holds when the file appears between plan
      and apply. A worktree with submodule state, including a deinitialized submodule whose `modules/`
      directory remains, is kept with a reason. So is a worktree whose status check fails or times
      out, or whose ignored paths cannot all be read, and a worktree with an assume-unchanged entry or
      a skip-worktree entry whose file exists. `apply` never deletes a branch that is still checked out
      in a worktree, including when that worktree's removal ended `changed`, when the worktree was
      added after the plan, or when it was moved after the plan.
- [ ] AC-03: A local branch whose tip is the default branch tip or an older commit on its first-parent
      history, and which is at least seven days old, is deleted, together with its clean worktree when it
      has one. Age is its oldest reflog entry, or its tip commit's committer date when the reflog has no
      entries. Such a branch younger than seven days is kept with a reason.
- [ ] AC-04: A clean detached worktree whose HEAD is reachable from the default branch and whose own HEAD
      reflog starts at least seven days ago is removed. A detached worktree with unmerged commits, a
      younger HEAD reflog, or changed or untracked files is kept, and so is one paused in a rebase or
      bisect even when its HEAD is on the default branch. When its `logs/HEAD` has no entries,
      the HEAD commit's committer date decides its age. A detached worktree, present or with its
      directory missing, whose `logs/HEAD` names a commit that no local branch, and no remote-tracking
      ref of a branch the remote still has, contains is kept with a reason.
- [ ] AC-05: A worktree entry whose directory no longer exists, on a proven-merged branch or detached
      at a commit reachable from the default branch, is removed from `git worktree list` by an applied
      plan, with no minimum age for a detached one. A detached missing-directory entry at an unmerged
      commit is kept with a reason, and so are an entry whose directory exists without a `.git` file
      a detached missing-directory entry with rebase state, and a missing-directory entry whose admin
      directory holds `modules/`.
- [ ] AC-06: `plan` without `--worktrees` proposes worktree removals, and `--worktrees false` proposes
      none. `after-merge --worktrees false` leaves the merged PR's clean worktree, and with it its local
      branch, in place. `apply` refuses a plan written in the previous format.
- [ ] AC-07: After `after-merge` for a merged PR, that PR's clean worktree and local branch are gone,
      unless the worktree is the main, invoking or locked one, has changed or untracked files, or holds
      ignored files, including when `status.showUntrackedFiles=no` is set. A kept worktree keeps its
      branch, with a reason. `after-merge` leaves every other worktree alone, including a clean detached
      worktree at a default-branch commit older than seven days.
- [ ] AC-08: `references/branches.md`, `references/authority.md`, `references/maintenance.md`,
      `references/audit.md`, the
      maintenance and ship skills and `docs/user-guides/workflows.md` describe these removal rules, no
      longer require a separate request for worktree cleanup, and say that a preauthorized sweep whose
      plan lists ignored paths waits for the owner's digest approval. The ship skill says a feature
      shipped from its owning worktree is removed by the next sweep. `references/audit.md`,
      `references/maintenance.md` and `references/authority.md` tell each run to lock every worktree it
      creates with the reason `vh-adlc <run-id>` and to unlock it when the run closes.
- [ ] AC-10: A locked worktree, including a clean detached one at a default-branch commit older than
      seven days, is never proposed for removal, and its `worktree` kept record's reason includes the
      lock reason.
- [ ] AC-09: On the Stackweaver checkout, a fresh `plan` proposes a `remove-worktree` for every linked
      worktree that meets items 1 to 4, and every other linked worktree has a `kept` record with scope
      `worktree`, its path and a reason.
      No proposed worktree has changed or untracked files or unmerged commits.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc/branches`: a fixture worktree with an ignored `node_modules/` and `.env` on a merged-PR branch is planned with both ignored paths, each with the file count and byte total the test wrote, then removed by `apply` along with its branch. A second fixture under `status.showUntrackedFiles=no` lists the same paths. |
| AC-02 | `bun test tests/vh-adlc/branches`: fixtures with a modified tracked file, with an untracked file, and with an untracked file under `status.showUntrackedFiles=no` are kept. A fourth has a second worktree with an untracked file inside its ignored `.claude/` directory, and a fifth has a plain nested Git repository there; both are kept. A sixth has an initialized submodule, and another had its submodule removed with `git submodule deinit -f`; both are kept. A seventh gains an untracked file after `plan`; `apply` reports both its approved operations as `changed`, and the worktree, the file and the branch remain. An eighth gains an ignored file after `plan`; `apply` reports its `remove-worktree` as `changed` and its `delete-local` as `failed`, and the worktree and its branch remain. Another plan has only a `delete-local` for a branch with no worktree; the test then adds a clean worktree on that branch, and `apply` reports the `delete-local` as `failed` and the branch remains. Another moves the approved worktree with `git worktree move` before `apply`; its removal reports `already-absent`, its `delete-local` `failed`, and the branch remains. Two more have a modified tracked file marked `--skip-worktree` and `--assume-unchanged`; both are kept. Another runs with a `run` stub that makes `git status` exit non-zero, and another has an ignored directory the test makes unreadable with `chmod 000`; both are kept with a reason. |
| AC-03 | `bun test tests/vh-adlc/branches`: separate fixtures, ages set with `GIT_COMMITTER_DATE` or by rewriting the reflog file: a branch at the default tip with an 8-day reflog and a worktree (removed with it); one at an older first-parent commit with an 8-day reflog and no worktree (removed); one with a 1-day reflog (kept with reason); one with its reflog deleted and a tip committed 8 days ago (removed); one with its reflog deleted and a tip committed 1 day ago (kept). |
| AC-04 | `bun test tests/vh-adlc/branches`: detached worktrees at a default-branch commit with an 8-day and a 1-day `logs/HEAD`, at an unmerged commit, with an untracked file, and with a modified tracked file; only the first is removed. Two more with an emptied `logs/HEAD` and HEAD commits dated 8 days and 1 day ago: only the older is removed. One more, holding an unmerged commit, is paused by `git rebase -i` with a `break` so its HEAD is the default tip, and is kept with a reason naming the rebase. Another runs `git bisect start <unmerged> <older default commit>` so its HEAD is on the default branch, and is kept with a reason naming the bisect. Another commits X, runs `git checkout --detach main` and is kept with a reason naming the reflog-only commit; the same worktree with its directory deleted is kept too. Another does the same after pushing X to a remote branch that is then deleted on the remote, leaving a stale `refs/remotes/origin/<b>`; it is kept. Each kept reason names every rule that applies, so the rebase and bisect fixtures, which also hold reflog-only commits, show both reasons. Every kept one has a `worktree` kept record with its path. |
| AC-05 | `bun test tests/vh-adlc/branches`: a merged-branch worktree and a detached worktree at a default-branch commit created moments before, whose directories the test deletes, are planned and gone from `git worktree list --porcelain` after `apply`; a detached one at an unmerged commit, with its directory deleted, is kept with a reason, and so is one whose directory the test empties but keeps, and a detached one paused mid-rebase whose directory the test deletes. So is a merged-branch worktree with an initialized submodule holding a commit of its own, whose directory the test deletes; its admin `modules/` directory remains. |
| AC-06 | `bun test tests/vh-adlc/branches`: plans from the CLI with no flag and with `--worktrees false`; `after-merge --worktrees false` on a merged PR whose branch has a clean worktree with no ignored files leaves both; `apply` on a `schema_version: 1` plan exits non-zero with `unsupported branch plan`. |
| AC-07 | `bun test tests/vh-adlc/branches`: one fixture per case, each with the merged PR's branch checked out in a single worktree: clean with no ignored files (worktree and branch gone); holding an ignored `node_modules/`; holding an ignored `.env` under `status.showUntrackedFiles=no`; with a modified tracked file; with an untracked file; locked; the main worktree; and the worktree `after-merge` runs from. Every case but the first keeps the worktree and branch with a reason. In the first case, an unrelated clean detached worktree at a default-branch commit with an 8-day `logs/HEAD` is still present afterwards. |
| AC-08 | `bun test tests/vh-adlc` passes, and a reading of each named file shows the new rules, no remaining requirement for a separate worktree request, the digest stop for plans that list ignored paths, and the lock and unlock step for run-owned worktrees. |
| AC-09 | Manual: run `bun plugins/vh-adlc/scripts/branches/cli.ts plan --repo ~/code/stackweaver --output <private file>`. For each linked worktree in `git worktree list --porcelain`, check items 1 to 4 independently with `git status --porcelain --untracked-files=all --ignore-submodules=none`, `git merge-base --is-ancestor`, the merged PR head, the reflog and the commit date. Also check: whether another `git worktree list` path lies inside it; `find <each ignored path> -name .git`; `rebase-merge`, `rebase-apply`, `BISECT_LOG` and `modules` in its admin directory; its `locked` flag and whether it is the main or invoking worktree; `git ls-files -v` for lowercase or `S` tags; and, when detached, `git rev-list` over its `logs/HEAD` oids `--not --branches` plus each origin tracking ref whose branch `git ls-remote --heads origin` lists. Pass when every worktree that meets them has a `remove-worktree`, every other one matches a `worktree` kept record by path, and no proposed worktree has changed or untracked files or unmerged commits. Applying that plan needs separate owner approval. |
| AC-10 | `bun test tests/vh-adlc/branches`: a clean detached worktree at a default-branch commit with an 8-day `logs/HEAD`, locked with `git worktree lock --reason "vh-adlc test-run"`, is kept by `plan` with a `worktree` kept record whose reason contains `vh-adlc test-run`; after `git worktree unlock` the next plan proposes it. A locked worktree on a merged branch older than seven days is kept by `plan` with a `worktree` kept record whose reason contains its lock reason. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-12 | R-1 | spec | `365242f8508007bb91a58a65055e660a0f4a6730` | unknown | procedural | Two blocking, seven should-fix and two nit findings; model identity not attested. |
| 2026-11-12 | R-2 | spec | `7806b5c77e6f55addd4b0f3d1d6487309104b4ee` | unknown | procedural | Two blocking, four should-fix and one nit finding; model identity not attested. |
| 2026-11-12 | R-3 | spec | `e359f41bcaee7249b2fe27cba2aada158e3781b0` | claude-opus-4.8 | procedural | One blocking, four should-fix and two nit findings; model self-reported, no model was requested. |
| 2026-11-12 | R-4 | spec | `b04d5e5fc2125e31fb329d08f9a57f049625fa29` | claude-opus-4.8 | procedural | One blocking, three should-fix and two nit findings; model self-reported, no model was requested. |
| 2026-11-12 | R-5 | spec | `e73cecfe2c1b2061dda8e47929e218a6f2785d48` | unknown | procedural | Four should-fix and two nit findings; the reviewer did not report its model. |
| 2026-11-12 | R-6 | spec | `5bf5701d6e90be301c1fd34a14b3bf600e71f4f2` | unknown | procedural | Two should-fix and two nit findings; the reviewer did not report its model. |

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

### R-3

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design items 3 and 4, AC-04, AC-05, goal
EVIDENCE: Design item 3 says "Rebase or bisect in progress, main, invoking and locked worktrees stay kept as today". Today's detection (branches.ts:117-121) marks a worktree busy only when `rebase-merge/head-name`, `rebase-apply/head-name` or `BISECT_START` names a `refs/heads/` branch, and it skips the check entirely for `prunable` entries. When a rebase starts on a detached HEAD, `head-name` holds `detached HEAD`, so busy stays false. A bisect started detached writes a commit id to `BISECT_START`, which the code turns into a fake branch name. I tested this in a scratch repository with Git 2.55.0. A detached linked worktree had an unmerged commit X, and I ran `git rebase -i main` with a leading `break`. HEAD then equaled the main tip, `git status --porcelain --untracked-files=all --ignore-submodules=none` printed nothing, `rebase-merge/head-name` read `detached HEAD`, `git worktree list --porcelain` showed `detached`, and `git merge-base --is-ancestor HEAD main` succeeded. `git worktree remove` exited 0, and `git fsck --unreachable` then reported `unreachable commit` X. Under items 3 and 4 such a worktree meets every removal condition. A missing-directory one needs no age. This contradicts the goal's promise that a worktree with "unmerged commits is always kept". No AC or Test Plan row covers a detached rebase or bisect.
PROPOSAL: State that any rebase or bisect state in the worktree's admin directory (`rebase-merge`, `rebase-apply`, `BISECT_LOG`) keeps it, detached or prunable included, rather than relying on "as today". Add AC-04 and AC-05 cases for a detached worktree stopped mid-rebase with HEAD on the default branch.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design items 1 and 5, AC-07
EVIDENCE: In a scratch repository with Git 2.55.0, a linked worktree on branch `f` had an initialized submodule. Both `git status --porcelain --untracked-files=all --ignore-submodules=none` and `git status --porcelain --ignored=traditional --untracked-files=normal` printed nothing, so item 1 calls it clean with no ignored files. `git worktree remove ../w` then exited 128 with `fatal: working trees containing submodules cannot be moved or removed`. The design has no blocker for submodules. Every plan would propose this worktree, and every apply would fail it. Its `delete-local` would fail with "its worktree was not removed" (branches.ts:244), and the run would report `complete: false`. Because item 5 makes removal the default, `after-merge` would also exit 1 on every merge in such a repository, where today it keeps the branch and completes. This is the same failure pattern as R-2 F-04.
PROPOSAL: Keep a worktree that has initialized submodules, with a reason, in plan and in `after-merge`, and add a fixture for it to AC-02 or AC-07.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design item 1
EVIDENCE: Item 1 says a worktree "blocks removal only when `git status ...` prints anything". Today's call passes `allowFailure` (branches.ts:192), and `Checkout.git` returns `""` for any non-zero exit (branches.ts:73-76). That includes a kill at spawn's 120 s timeout (branches.ts:10), where `exitCode` is null and the code becomes 1. So a status that fails or times out reads as clean, with an empty ignored list. That also skips the `after-merge` ignored-files keep and the sweep's digest stop. Under `status.showUntrackedFiles=no`, `git worktree remove` does not protect untracked files. I confirmed again with Git 2.55.0 that it exited 0 and deleted a worktree holding an untracked `u.txt`. The helper's check is then the only safeguard.
PROPOSAL: State that a status or ignored-list command that exits non-zero or times out keeps the worktree with a reason, at plan time and on the re-check in `apply`.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Owner summary, Design item 1, Open Questions
EVIDENCE: The Owner summary says a worktree with ignored files is removed only "after seeing its list of ignored paths", and the first decision bullet says "the plan lists those files first". Item 1 instead lists paths "collapsed to directories" via `--ignored=traditional --untracked-files=normal`, an author choice made in response to R-2 F-01 that never appeared as an owner question. On 2026-11-12, that command across Stackweaver's 67 on-disk linked worktrees printed `!! .tmp/` for 18 of them. Inside, `find` counted from 1 to 24506 files, including `seo-browser-proof.json`, `blog-nav-preview-verification.json` and `maintenance-evidence-f6de2451/`. The owner would see only `.tmp/`. So saved evidence goes even when the list is read, not only "when a plan is approved without reading its ignored list", as the trade-offs paragraph says.
PROPOSAL: Raise the listing granularity as an owner question (for example, collapsed directories plus a file count and size per directory, or a per-repository list of directories to expand). Otherwise, say in the Owner summary and trade-offs that only collapsed directory names are shown.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: AC-02, AC-07, Design item 5, Test Plan AC-06 and AC-07 rows
EVIDENCE: AC-07 excepts a worktree that "has changed or untracked files". The AC-07 row tests "with an untracked file" but has no case with a modified tracked file. The AC-02 row tests the modified-file case only through plan and apply, so `after-merge` with a changed tracked file is untested. Design item 5 promises "`after-merge --worktrees false` still leaves every worktree alone". AC-06 and its row cover only `plan` with and without the flag, so no criterion or proof covers the after-merge flag. Under the standard, "A passing subset never upgrades a composite criterion".
PROPOSAL: Add an AC-07 fixture with a modified tracked file. Extend AC-06 and its row to `after-merge --worktrees false` keeping a clean, ignored-free worktree of the merged PR.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design
EVIDENCE: The Design says "The changes are in `observe`, `perform`, `execute`, `afterMerge` and `parsePlan` in `branches.ts`, the `--worktrees` default in `cli.ts`, and the plan schema." Items 3 and 4 need each detached entry's HEAD oid and admin directory name. `worktrees()` (branches.ts:109-126) reads neither, because it ignores the porcelain `HEAD` line, and the `Worktree` type (branches.ts:35) has no field for them. `absent()` (branches.ts:203-211) also handles `remove-worktree`.
PROPOSAL: Add `worktrees()`, the `Worktree` type and `absent()` to the list of changed places.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Scope, covers, AC-08
EVIDENCE: `plugins/vh-adlc/references/audit.md:214-216` says `after-merge` "removes the just-merged head remotely and locally". After item 5, it also removes that PR's worktree by default. `audit.md` is not in Scope's guide list, `covers` or AC-08.
PROPOSAL: Add `references/audit.md` to the guides that AC-08 updates, or say why its description stays accurate.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design items 1 and 6, AC-01, AC-02, Test Plan AC-02 row
EVIDENCE: Item 6 says "`same()` compares both, so a change after observation, including a changed file count or size, reports `changed`." `execute` (branches.ts:241-249) adds a branch to `blocked` only when its `remove-worktree` returns `failed` (branches.ts:247). It then performs any approved `delete-local` that the fresh plan still proposes unchanged (branches.ts:245-246). A `delete-local` record holds only `kind`, `branch`, `oid` and `proof` (branches.ts:19), and none of these depend on the ignored list. Suppose an ignored file is added or grows between `plan` and `apply`, for example a build cache under `node_modules/` or a new file under `.tmp/`. The fresh plan then proposes a `remove-worktree` with different `ignored` counts, so the approved one gets `changed` and the worktree stays. The fresh plan still proposes the same `delete-local`, so `git update-ref -d` runs. In a scratch repository with Git 2.55.0, `git update-ref -d refs/heads/g <tip>` exited 0 while `g` was checked out in a linked worktree. Afterwards `git worktree list --porcelain` showed that worktree with `HEAD 0000000000000000000000000000000000000000` and `branch refs/heads/g`, and its `git status --porcelain` printed `A  a.txt` for every tracked file. This breaks `conventions/delivery.md:22-23` at d8f07c9: "delete only merged local branches that are not checked out in any worktree". Today this cannot happen because `remove-worktree` and `delete-local` change together. The AC-02 row's seventh case adds an untracked file, which removes both operations from the fresh plan, so it does not catch this.
PROPOSAL: State that a `delete-local` is performed only when its branch's `remove-worktree` in the same apply ended `done` or `already-absent`; any other outcome, including `changed`, keeps the branch. Add a Test Plan case in which an ignored file is added between `plan` and `apply`, and check that both the worktree and the branch remain.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design item 3, goal, Owner summary
EVIDENCE: The goal says a worktree with "unmerged commits is always kept", and the Owner summary says "Work that is not on the default branch or in a merged PR head is never removed." Item 3 checks only whether the current HEAD is reachable from the default branch. In a scratch repository with Git 2.55.0, I committed X on a detached linked worktree and then ran `git checkout --detach main` there. HEAD was then an ancestor of main, and `git status --porcelain --untracked-files=all --ignore-submodules=none` printed nothing. `git worktree remove` exited 0, and `git fsck --unreachable --no-reflogs` then listed X. Its only reference had been that worktree's `logs/HEAD`, which item 3 reads for age but not for commits. Today detached worktrees are never removed, so this loss is new. In Stackweaver, read-only checks found 499 and 26 reflog-only commits in the `logs/HEAD` of two detached worktrees, `runner-architecture` and `runner-kind-snapshot`. Both are kept today only because their current HEAD is unmerged.
PROPOSAL: Keep a detached worktree whose `logs/HEAD` names a commit that no branch, remote-tracking ref or the default branch contains, with a reason, and add an AC-04 case for it. Otherwise raise it as an owner question and correct the goal and summary.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design items 2, 3 and 5, Scope, AC-08
EVIDENCE: The plugin itself creates the kind of worktree items 2 and 3 now remove. `references/audit.md:103-105` and `references/authority.md:153-156` describe "a separately recorded clean detached assessment worktree at the freshly fetched default commit", and the run keeps "its owner, path and base in private run evidence". `references/audit.md:100-101` puts every ledger application in a new `chore/audit-ledger-<run-id>` worktree at the default commit. Such a branch has no commits of its own until something is committed. `references/authority.md:105-107` requires "Preserve evidence through source cleanup and pending reconciliation", and `references/audit.md:219` says "Cleanup cannot discard a pending resource intent". Under items 2, 3 and 5, a sweep plan removes these worktrees once they are seven days old, with no check of a pending run that owns them. This happens even under a preauthorized sweep when they hold no ignored files. The design, Scope and AC-08 never mention these owned worktrees. Stackweaver has a detached `stackweaver-audit-adoption-check` worktree, 8 days old, with HEAD on main.
PROPOSAL: Say how worktrees owned by a pending audit or maintenance run are protected, for example by locking them or by reading the run journal, and add a criterion for it. Otherwise raise their removal as an owner question and name it in the trade-offs.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: AC-04, Design item 1, Test Plan AC-02 and AC-04 rows
EVIDENCE: AC-04 says a detached worktree "paused in a rebase or bisect" is kept. The AC-04 row tests only "`git rebase -i` with a `break`" and has no bisect case. A bisect started from an unmerged detached commit moves HEAD onto default-branch commits, and the original commit then lives only in `BISECT_START` and the reflog. Under the standard, "A passing subset never upgrades a composite criterion". Design item 1 adds two fail-closed rules: "When either status command exits non-zero or times out, the worktree is kept" and "A path the walk cannot read keeps the worktree with a reason". No criterion or Test Plan row covers either rule. Today `Checkout.git` with `allowFailure` returns `""` for a failure (branches.ts:73-76), which reads as clean, so an implementation could keep that behaviour and still meet every criterion.
PROPOSAL: Add a detached bisect fixture to the AC-04 row. Add the status-failure and unreadable-path keeps to AC-02 with fixtures, for example a `run` stub that fails `git status` and an ignored directory without read permission.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design item 1, AC-02
EVIDENCE: Item 1 and AC-02 keep "a worktree with an initialized submodule". In a scratch repository with Git 2.55.0, I added a submodule in a linked worktree, initialized it and then ran `git submodule deinit -f`. `git submodule status` printed `-<oid> s`, which means not initialized, and the status check printed nothing. `git worktree remove` still exited 128 with `fatal: working trees containing submodules cannot be moved or removed`, because the worktree's admin directory still held `modules/`. Such a worktree would be proposed in every plan and fail on every apply, the same pattern as R-3 F-02.
PROPOSAL: Also keep a worktree when its admin directory contains `modules/`, and describe the blocker as submodule state rather than an initialized submodule.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-09 row
EVIDENCE: The row says "check items 1 to 4 independently with `git status --porcelain --untracked-files=all --ignore-submodules=none`, `git merge-base --is-ancestor`, the merged PR head, the reflog and the commit date". Items 1 to 4 also keep worktrees for other reasons: a nested worktree or `.git` under an ignored path, submodule state, rebase or bisect state in the admin directory, and the main, invoking or locked worktree. The procedure names no check for any of them. Stackweaver's linked worktrees sit under ignored `.claude/` and `.tmp/` directories, so the nested case is the most likely one there.
PROPOSAL: List the remaining independent checks in the AC-09 procedure: worktree containment from `git worktree list`, a search for `.git` under ignored paths, admin-directory state files, and the locked, main and invoking flags.

### R-5

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design item 6, AC-02
EVIDENCE: Item 6 limits the new guard to "a branch whose `remove-worktree` it also approved". `execute` (branches.ts:241-249) observes again and then performs any approved `delete-local` that the fresh plan still proposes unchanged. A `delete-local` record holds only `kind`, `branch`, `oid` and `proof` (branches.ts:19), so it does not change when a worktree appears. Case 1: the approved plan has only `delete-local` for branch B, and a clean or ignored-only worktree is then added on B before `apply`. The fresh plan proposes `remove-worktree` plus an identical `delete-local` (branches.ts:190-197). Only the `delete-local` was approved, so `git update-ref -d` deletes B while it is checked out. Case 2: an approved `remove-worktree` at path P ends `already-absent` because `absent()` matches only by path (branches.ts:208), for example after `git worktree move P P2`. Item 6 then allows the `delete-local`, and B is deleted while P2 still has it checked out. Both cases break `conventions/delivery.md:22-23`: "delete only merged local branches that are not checked out in any worktree". R-4 F-01 showed the result, a worktree left on a missing branch. Today the default `--worktrees false` path keeps such a branch with a blocker (branches.ts:193). Item 5 makes worktree removal the default, and ignored files no longer block it, so this path is now the normal one.
PROPOSAL: Perform a `delete-local` only when the fresh observation shows no worktree on that branch, or when the worktree on it was removed with result `done` earlier in the same run. Report every other case as `failed`. Add an AC-02 Test Plan case in which a worktree is added on the branch between `plan` and `apply`.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design item 3, AC-04, goal
EVIDENCE: Item 3 keeps a detached worktree when `git rev-list <logs/HEAD oids> --not --branches --remotes` prints anything. `--remotes` also counts stale remote-tracking refs. The same plan prunes those refs with `prune-tracking`, which needs no merge proof (branches.ts:181). The operation order runs `prune-tracking` before `remove-worktree` (branches.ts:28), and `execute` observes only once, before it performs anything. I tested this in a scratch repository with Git 2.55.0. A detached linked worktree committed X, ran `git push origin HEAD:refs/heads/foo`, then ran `git checkout --detach main`. `foo` was then deleted on the remote side, and `git fetch origin` without `--prune` left `refs/remotes/origin/foo`. The reflog check printed nothing, so the worktree counts as removable. After `git update-ref -d refs/remotes/origin/foo` and `git worktree remove ../d`, `git fsck --unreachable --no-reflogs` listed `unreachable commit` X. That contradicts the goal's "unmerged commits is always kept". Stackweaver has 10 such stale tracking refs today: 106 tracking refs against 96 heads from `git ls-remote --heads origin`. No current detached worktree depends on them.
PROPOSAL: In the reflog check, count only remote-tracking refs whose branch still exists in the observed `ls-remote` set, or exclude refs that the same plan prunes. Add an AC-04 case with a reflog-only commit that only a stale tracking ref contains.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-02 row, Design item 6
EVIDENCE: The AC-02 row's seventh case says "A seventh gains an untracked file after `plan`; `apply` reports both its approved operations as `changed`". Item 6 says that when a branch's approved `remove-worktree` ends with any outcome other than `done` or `already-absent`, "`changed` included, reports the `delete-local` as `failed` with `its worktree was not removed`". The eighth case follows item 6 and expects `changed` then `failed`. Item 6 gives the seventh case's `remove-worktree` the result `changed`, so its `delete-local` must be `failed`, not `changed`. No implementation can pass both item 6 and the row as written.
PROPOSAL: Change the seventh case to expect `remove-worktree` `changed` and `delete-local` `failed`. Otherwise, state in item 6 that a `delete-local` the fresh plan no longer proposes reports `changed` before the worktree guard applies.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design item 5, AC-07, AC-10, Test Plan AC-10 row
EVIDENCE: Item 5 says `after-merge` "removes the merged PR's own worktree", and item 5 treats owner approval "of the merge" as the request. Today `after-merge` limits observation to the PR head with `only` (branches.ts:291-292). A detached worktree has no branch, so it can never be the merged PR's own worktree. Even so, the AC-10 row requires that a locked detached worktree "is kept by `plan` and `after-merge` with a `worktree` kept record". `after-merge` returns `observed.plan.kept` (branches.ts:295). That record can only exist if `after-merge` evaluates detached worktrees that belong to no PR. If it does, it would also remove other clean, unlocked detached worktrees older than seven days on every merge, which the merge approval does not cover. If it does not, the AC-10 row cannot pass. AC-07 and its row never check that `after-merge` leaves unrelated worktrees in place.
PROPOSAL: State that `after-merge` considers only the merged PR's branch and its worktree. Drop `after-merge` from the AC-10 row, or test the lock with a locked worktree on the PR's branch. Add an AC-07 case in which an unrelated, clean detached worktree older than seven days survives `after-merge`.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Design items 3 and 4, Test Plan AC-04 and AC-05 rows
EVIDENCE: The AC-04 row expects the detached rebase fixture "kept with a reason naming the rebase" and the bisect fixture "with a reason naming the bisect". Both fixtures hold an unmerged commit that appears in their `logs/HEAD`. The reflog rule in item 3 keeps them on its own, and the AC-05 mid-rebase fixture likewise. The design does not say which reason wins or whether a kept record names every rule that applies. An implementation that checks the reflog first and omits the rebase or bisect check would keep all three fixtures, and only the reason text could tell the difference.
PROPOSAL: State that a kept reason names every rule that keeps the worktree, or give the order of precedence, so that these fixtures test the rebase and bisect rule itself.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: goal, Design item 1, AC-02
EVIDENCE: The goal says a worktree "with changed ... files ... is always kept", and item 1 relies on `git status`. I tested this in a scratch repository with Git 2.55.0. On a linked worktree on branch `f`, I appended to tracked file `a` and ran `git update-index --skip-worktree a`. Both item 1 status commands then printed nothing. `git worktree remove ../w` exited 0 and deleted the local change. `assume-unchanged` hides changes from `git status` in the same way. Today the same gap exists only with `--worktrees true`. Item 5 makes removal the default.
PROPOSAL: Keep a worktree whose `git ls-files -v` shows an assume-unchanged entry, or a skip-worktree entry whose file exists on disk. Otherwise, name this limit in the Owner summary trade-offs.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design items 1 and 4, AC-05, Test Plan AC-05 row, Owner summary
EVIDENCE: Item 1 keeps a worktree with submodule state "because `git worktree remove` refuses it" and counts a `modules/` directory in the admin directory as such state. Item 4 lists the only keep conditions for a `prunable` entry: an unproven branch, a detached HEAD that fails the reachability or reflog check, or a directory that still exists without `.git`. Item 3 adds rebase and bisect state, "present or prunable". Nothing applies the submodule rule to a missing-directory entry, and AC-05 and its row have no such case. Git checks for submodules only when the worktree directory exists. I tested this in a scratch repository with Git 2.55.0. Linked worktree `w` on branch `f` had an initialized submodule `s` with one commit, 77c6cec, that existed only in the worktree's admin `modules/s`. After `rm -rf ../w`, `git worktree list --porcelain` showed `prunable gitdir file points to non-existent location` and `branch refs/heads/f`, and the admin directory still held `modules`. `git worktree remove ../w` exited 0 and deleted the whole admin directory, including `modules/s` and the only copy of that commit. Today `branches.ts:193` keeps every prunable entry, so this loss would be new. It contradicts the summary's "Work that is not on the default branch or in a merged PR head is never removed."
PROPOSAL: State that submodule state, including a `modules/` directory in the admin directory, keeps a worktree whether it is present or `prunable`, with a reason. Add an AC-05 fixture that deletes the directory of a merged-branch worktree that has a submodule and checks that the entry is kept.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design item 3, Owner summary, goal, Open Questions
EVIDENCE: Item 3 says "Branch worktrees skip this check, because their pre-rebase commits would keep every rebased and merged feature worktree forever." The owner's Q13 (commit 2f6bce0) asked only about detached worktrees. The summary's trade-offs name only the detached case, while the summary says "Work that is not on the default branch or in a merged PR head is never removed" and the goal says a worktree with "unmerged commits is always kept". Removing a worktree deletes its own `logs/HEAD`, so commits that only that reflog names are lost. On 2026-11-12 I compared each branch worktree's `logs/HEAD` oids in Stackweaver against `git rev-list <oids> --not --branches --remotes`. At least 15 branch worktrees hold such commits. For example, `.claude/worktrees/feat-design-system-sweep` is on `fix/landing-hero-compat-copy`, which is on origin/main's first-parent history with a tip dated 2026-10-17. Its `git status --porcelain --untracked-files=all --ignore-submodules=none` prints nothing, and 72 commits appear only in its HEAD reflog. Under items 1 and 2 that worktree would be proposed for removal. Most of these commits are probably pre-rebase copies, but the document settles this trade-off without asking the owner.
PROPOSAL: Raise the branch-worktree reflog exemption as an owner question, or at least name it in the Owner summary trade-offs and qualify the goal and the summary's "never removed" sentence.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Owner summary, Design item 5, AC-08
EVIDENCE: The summary says "`after-merge` removes the merged PR's own worktree". `skills/vh-adlc-ship/SKILL.md:47` tells the ship step to "work in the feature's owning worktree", which is the PR's branch worktree, and then run `after-merge` (lines 98-100). AC-07 and item 3 keep "the worktree `after-merge` runs from" as the invoking worktree. Ignored files also keep it after a merge. So after a vh-adlc ship, `after-merge` will normally keep the PR's own worktree and its branch, and only a later sweep removes them. Neither the summary nor AC-08 says this or tells ship where to run `after-merge`.
PROPOSAL: Say in the summary that `after-merge` keeps the worktree it runs from, so a feature shipped from its owning worktree is cleaned up by the next sweep. Alternatively, have AC-08 tell the ship skill to run `after-merge` from another worktree.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-04 and AC-10 rows
EVIDENCE: AC-04 keeps a detached worktree with "changed or untracked files", but its row tests only "with an untracked file". AC-10 covers every locked worktree and requires the kept reason to include the lock reason. Its row tests only a detached worktree in `plan`, and the AC-07 row's "locked" case checks only that the worktree is kept "with a reason". Under the standard, "A passing subset never upgrades a composite criterion."
PROPOSAL: Add a detached fixture with a modified tracked file to the AC-04 row, and a locked branch worktree in `plan` whose kept reason contains the lock reason to the AC-10 row. Alternatively, narrow the criteria to the tested cases.
