---
status: draft
status_description: "Being written; waits for its first independent spec review."
issue: https://github.com/michielvha/vh-adlc/issues/139
goal: "SDD operations read the repository's listed instruction files and project procedure as they stand at the default branch tip, even from a checkout that is behind it."
covers:
  - plugins/vh-adlc/scripts/loop/
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/references/loop-settings.md
  - plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-tasks/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-review/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-investigate/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-orchestrate/SKILL.md
  - plugins/vh-adlc/plugin.json
  - tests/vh-adlc/loop/
---

# Plan: Read instruction files at the default branch tip

`bun scripts/loop/cli.ts context` reports, for every file on its reading list, whether the local copy
matches origin's default branch tip and which version an operation reads. The SDD operations then read
that version instead of whatever an outdated checkout holds.

## Context

### Owner summary

A session that runs in a checkout behind the default branch reads old copies of the repository's rules
and has no way to notice. On 2026-11-21 a Stackweaver spec session followed a four-day-old project
procedure from the shared main checkout. It lacked three owner rules added since, so the session kept
asking questions those rules already answered, over several review rounds.

This feature makes `context` fetch origin's default branch and compare each listed file with the tip.
Each file gets one state: `current`, `stale`, `edited`, `removed` or `unverified`. Each also gets the
version to read: the local path, or a `origin/<branch>:<path>` revision that `git show` prints. When
`.vh-adlc/loop.yaml` is itself behind the tip, the reading list and lenses come from the tip's settings,
so a rule file added on the default branch is not missed. A file the current branch changed keeps its
local version, because that branch is editing it on purpose. When origin cannot be reached, `context`
still succeeds: it lists the local copies as `unverified` with the reason, and the operation's report
says so.

The eight SDD skills, `references/loop.md` and `references/loop-settings.md` change their read rule to
follow the reported version. The fetch moves only remote-tracking refs and never touches the branch,
index or working tree. Nothing else changes: routes, verification rungs, the review prompt's policy
(read at the reviewed commit) and the files the host loads by itself at session start.

One owner decision is open: whether to also add a rule that feature work never edits in the shared main
checkout (Q1). The recommendation is to leave it out, because it would contradict the
`implement_worktree: shared` default and this fix removes the harm without it.

Proof is planned, not yet observed: a new test file builds a bare origin and a clone that falls behind,
then checks every state, the settings fallback, the offline path and that the checkout is untouched. A
text test checks the read rule in every skill and reference. Acceptance authorizes implementation on a
feature branch. Pushing, opening a PR and merging each need a separate request.

### Background

Harm statement, as `plugins/vh-adlc/references/loop.md` (Weigh the harm before building machinery)
requires:

- The harm: every SDD session in a consumer that declares instruction files and works from a checkout
  behind the default branch follows outdated owner rules without knowing it. Issue
  [michielvha/vh-adlc#139](https://github.com/michielvha/vh-adlc/issues/139) records one case that cost
  several review rounds of needless escalation. It recurs whenever other sessions' uncommitted work
  blocks a fast-forward of the shared checkout. It heals only when someone advances that checkout, and
  nothing tells the session in the meantime.
- The simplest alternative without machinery: a rule in `references/loop.md` that operations fetch and
  read each listed file with `git show origin/<default>:<path>`.
- Why the machinery wins: the failure is silent, and a rule only works if the agent remembers a step it
  has no reason to think it needs. That forgotten step is the very failure this issue describes. The
  machinery is one fetch and a blob comparison inside a command every operation already runs.
  `vh-adlc clean` already reads its manifest from origin's default branch for the same reason
  (`plugins/vh-adlc/references/clean.md:6`).

Current state:

- `context` prints `loopContext(settings)` plus the plugin status
  (`plugins/vh-adlc/scripts/loop/cli.ts:106`). The reading list is the settings' `instruction_files`
  followed by `project_procedure`, as plain paths (`plugins/vh-adlc/scripts/loop/procedure.ts:7-10`).
- The settings come from the working tree (`loadLoopSettings`, `plugins/vh-adlc/scripts/loop/settings.ts:211`),
  and each listed file must exist there (`settings.ts:85-90`). `loadLoopSettingsAt` already loads
  settings from a commit through `git archive` (`settings.ts:246-259`).
- Eight skills tell the operation to read every file `context` lists before acting: spec, tasks,
  implement, review, ship, investigate, resume and orchestrate (`grep -rn "cli.ts context"
  plugins/vh-adlc/skills`, for example `skills/vh-adlc-spec/SKILL.md:39` and
  `skills/vh-adlc-orchestrate/SKILL.md:24`). `references/loop.md:143` and
  `references/loop-settings.md:124` state the same rule.
- `claim` already fetches the default branch and touches only remote-tracking refs
  (`plugins/vh-adlc/scripts/loop/claim.ts:40`).
- The review route builds its reviewer prompt from settings at the reviewed commit
  (`plugins/vh-adlc/scripts/loop/cli.ts:194`), so it is not affected by a stale working tree.
- `implement_worktree` defaults to `shared`, which allows implement to work in the primary worktree
  (`plugins/vh-adlc/references/loop-settings.md:113`).
- In this repository `context` prints `{"read":[],"lenses":[],"lensText":"","plugin":{...}}`: it
  declares no loop settings, so the change matters to consumers such as Stackweaver that do.

## Scope

In scope:

- A `freshness` object in the `context` output, with a state and a version to read for the settings
  file and for each file on the reading list.
- Taking the reading list and lenses from the tip's settings when the local settings file is `stale`.
- An optional `--default-branch <branch>` flag on `context`.
- The read rule in the eight SDD skills, `references/loop.md` and `references/loop-settings.md`, and a
  glossary row for the new term.
- A minor plugin version bump.

Out of scope:

- Files the host loads by itself when a session starts, such as `CLAUDE.md` and `AGENTS.md` in the
  working directory. The plugin does not control that load. When a repository lists them in
  `instruction_files`, operations re-read them at the reported version.
- Routes, verification rungs, CI settings and the other `context`-independent commands, which keep
  reading the working tree.
- The review prompt, which already reads policy at the reviewed commit.
- Advancing or repairing the shared checkout itself.
- A rule that feature work never edits in the shared main checkout, unless the owner chooses it in Q1.
- Not handled: a file that both the current branch and the tip changed since they diverged. It reads as
  `edited`, and the branch picks up the tip's change when it merges the default branch, as the drift
  re-review rules already require.

## Design

### Default branch and fetch

`context` takes `--default-branch <branch>`. Without it, it reads `git symbolic-ref --short
refs/remotes/origin/HEAD` and drops the `origin/` prefix. It then runs `git fetch -q origin <branch>`
with `GIT_TERMINAL_PROMPT=0` and a 30-second timeout, which moves only `refs/remotes/origin/<branch>`,
as `claim` does. The fetch runs even when the reading list is empty, because the tip may have added the
settings file or a listed file.

Any of these makes every entry `unverified`, with one `reason` naming the cause: no `origin` remote, an
unresolvable default branch (the reason names `--default-branch`), a failed or timed-out fetch, or a ref
lock held by a concurrent fetch. `context` does not retry; the next run fetches again. It always exits 0
when the settings load, so an offline session keeps working and says so.

### States

For each path `p`, with `T` the fetched tip and `B` the merge base of `HEAD` and `T`:

| State | When | `read` |
| --- | --- | --- |
| `current` | The working-tree content equals `T:p` | `p` |
| `stale` | It differs from `T:p`, and the working tree equals `B:p` (or `p` is missing both locally and at `B`) | `origin/<branch>:p` |
| `edited` | It differs from `T:p`, and the working tree differs from `B:p` (changed on this branch, committed or not) | `p` |
| `removed` | `T` has no `p`, and the working tree equals `B:p` | `null` |
| `unverified` | No tip could be fetched | `p` |

Content is compared by blob hash: `git hash-object` on the working-tree file against `git rev-parse
<rev>:p`. Comparing against the merge base is what keeps a feature branch that edits `AGENTS.md` from
being sent back to the tip's copy.

### Settings file

`.vh-adlc/loop.yaml` (or the configured settings path) gets the same classification as
`freshness.settings`. When it is `stale`, `context` loads the tip's settings with `loadLoopSettingsAt`
and takes the reading list and lenses from them; paths it adds that do not exist locally are `stale`.
If the tip's settings fail to load, `freshness.settings` carries `state: "stale"` with an `error`, and
`context` keeps the local list. Every other state keeps the local settings. The reasoning matches the
per-file rule: a branch that edits its own settings keeps them.

### Output

The existing fields keep their meaning and shape: `read` stays a list of paths (from whichever settings
applied), and `lenses`, `lensText` and `plugin` are unchanged. The new field is:

```json
"freshness": {
  "default_branch": "main", "tip": "<sha>|null", "reason": "<present only when unverified>",
  "settings": { "path": ".vh-adlc/loop.yaml", "state": "current", "read": ".vh-adlc/loop.yaml" },
  "files": [ { "path": "agents/loop-project.md", "state": "stale", "read": "origin/main:agents/loop-project.md" } ]
}
```

`files` follows the order of `read`. The logic lives in a new `scripts/loop/freshness.ts` and is called
from the `context` branch of `cli.ts`; `loopContext` keeps its signature, so the review prompt is
unchanged.

### Read rule

`references/loop-settings.md` defines the rule next to its `context` paragraph, and the glossary gains
the term Instruction freshness: the state `context` reports for a listed file against origin's default
branch tip. Operations read each entry at its `read` value: a path with the file tools, a revision with
`git show <read>`. They skip `removed` entries. On `unverified` they read the local copies and open their
report with a line naming the reason. `references/loop.md:143` and the eight skills point to that rule
in one clause instead of restating it.

### Concurrency, failure, upgrade

Several sessions may run `context` at once. Git serializes ref updates, and a session that loses the
lock reports `unverified` for that run. A fetch that dies partway leaves the old remote-tracking ref,
which is a consistent older tip, and then reports `unverified`. The command writes nothing in the
checkout, so retrying is safe. The output change is additive: an operation following the old rule
ignores `freshness` and behaves as before. Rolling back the plugin removes the field and the rule
together, because they ship in one version.

## Acceptance Criteria

- [ ] AC-01: In a clone whose listed instruction file and project procedure are behind origin's default
      branch tip and unchanged locally, `context` reports both as `stale`, and `git show` of each `read`
      value prints the tip's content.
- [ ] AC-02: A listed file equal to the tip reports `current` with its path. A listed file the current
      branch changed since it left the tip, committed or uncommitted, reports `edited` with its path,
      even when the tip also differs.
- [ ] AC-03: When the local settings file is behind the tip, `freshness.settings` is `stale` and the
      reading list and lenses are the tip's, including a file the tip added that the clone lacks, which
      reports `stale`.
- [ ] AC-04: A listed file the tip deleted, unchanged locally, reports `removed` with a null `read`.
- [ ] AC-05: Without a usable origin (no remote, an unresolvable default branch, or a failing fetch),
      `context` exits 0, keeps the local reading list, reports every entry `unverified` with a reason,
      and its other fields are unchanged.
- [ ] AC-06: After `context` runs in a clone behind the tip, `HEAD`, the current branch, the index and
      the working tree are unchanged; only `refs/remotes/origin/<branch>` moved.
- [ ] AC-07: The eight SDD skills, `references/loop.md` and `references/loop-settings.md` direct
      operations to read each listed file at its reported version, and the loop glossary defines
      Instruction freshness.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-02, AC-04 | `tests/vh-adlc/loop/context-freshness.test.ts`: a bare origin and a clone with `.vh-adlc/loop.yaml` listing several files; origin advances, deletes one file and the clone edits another (one committed, one uncommitted). Asserts each state and `read`, and that `git show` of each stale `read` equals origin's content. |
| AC-03 | Same file: origin's settings add a new instruction file and a lens; asserts `freshness.settings.state` is `stale`, `read` includes the new path as `stale`, and `lenses` are origin's. A second case gives origin invalid settings and asserts the local list with an `error`. |
| AC-05 | Same file: a clone with no remote, one whose `origin` points to a missing path, and one with no `origin/HEAD` and no flag. Each exits 0 with every entry `unverified`, a non-empty `reason`, and `read`, `lenses` and `plugin` equal to a run on the same settings before the change (`tests/vh-adlc/loop/plugin-version.test.ts` keeps passing). |
| AC-06 | Same file: records `git rev-parse HEAD`, `git symbolic-ref HEAD`, `git status --porcelain=v2` and `git write-tree` before and after `context`, and asserts them equal while `refs/remotes/origin/main` moved to origin's tip. |
| AC-07 | Same file: reads the eight SKILL.md files and both references and asserts each states the reported-version read rule with a reference to `references/loop-settings.md`. `tests/vh-adlc/loop/glossary.test.ts` gains the Instruction freshness row with its rejected synonyms. |

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q1: Should the loop also forbid feature work from editing files in the shared main checkout?

**Recommendation:** A. This feature removes the stale-rules harm on its own, and the rule would
contradict the `implement_worktree: shared` default.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Leave it out** | No change to worktree policy; repositories that want the protection already set `implement_worktree: isolated`. | Shared checkouts can still fall behind, which this feature then reports and works around. |
| **B. Add the rule to `references/loop.md`** | Fewer blocked fast-forwards of the shared checkout. | Changes the meaning of the `shared` default and touches the implement, claim and isolation procedure, which widens this feature. |

**Why this is yours:** the issue suggests it, and it changes a published worktree default that
consumers rely on.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
