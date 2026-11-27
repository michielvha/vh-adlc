---
status: draft
status_description: "Revised for spec review R-1 and the owner's Q1 answer; waits for a new independent spec review."
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
matches origin's default branch tip and which version an operation reads. The SDD operations and the
orchestrate operation then read that version instead of whatever an outdated checkout holds.

## Context

### Owner summary

A session that runs in a checkout behind the default branch reads old copies of the repository's rules
and has no way to notice. On 2026-11-21 a Stackweaver spec session followed a four-day-old project
procedure from the shared main checkout. It lacked three owner rules added since, so the session kept
asking questions those rules already answered, over several review rounds.

This feature makes `context` fetch origin's default branch and compare each listed file with the tip.
Each file gets one state: `current`, `stale`, `edited`, `removed` or `unverified`. Each also gets the
version to read: the local path, a `<tip sha>:<path>` revision that `git show` prints, or nothing for
a file the tip deleted. When `.vh-adlc/loop.yaml` is itself behind the tip, the reading list and lenses
come from the tip's settings, so a rule file added on the default branch is not missed. A file the
current branch changed keeps its local version, because that branch is editing it on purpose. When
origin cannot be reached, `context` still succeeds: it lists the local copies as `unverified` with the
reason, and the operation's report says so.

Operations pass the default branch they already know to `context`. The conventions revision stays the
one the binary resolves from the checkout, even when an instruction file read from the tip pins a newer
one, so the operation and the binary's gates always judge by the same conventions. The fetch skips tags
and moves only origin's tracking ref for that branch; the branch, index and working tree stay as they
were. Nothing else changes: routes, verification rungs, the review prompt's policy (read at the
reviewed commit) and the files the host loads by itself at session start.

The owner decided on 2026-11-27 to leave out a rule against feature work editing in the shared main
checkout. This fix removes the harm without it, and repositories that want that protection set
`implement_worktree: isolated`.

Proof is planned, not yet observed: a new test file builds a bare origin and clones that fall behind,
then checks every state, the settings fallback, the offline paths and that no ref except the tracking
ref moved. A text test checks the read rule in every skill and reference. The first spec review asked
for five corrections and four smaller fixes, all applied here; a new review is pending. Acceptance
authorizes implementation on a feature branch. Opening the code PR and merging need separate requests.

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
- The seven SDD skills (spec, tasks, implement, review, ship, investigate and resume, the list in
  `references/loop.md:141`) and the orchestrate skill tell the operation to read every file `context`
  lists before acting (`grep -rn "cli.ts context" plugins/vh-adlc/skills`, for example
  `skills/vh-adlc-spec/SKILL.md:39` and `skills/vh-adlc-orchestrate/SKILL.md:24`).
  `references/loop.md:143` and `references/loop-settings.md:124` state the same rule.
  `references/loop.md:42` and `skills/vh-adlc-spec/SKILL.md:164` judge open questions and nits against
  the files `context` lists, and `references/orchestrate.md:108` re-runs `context` on each status pass.
- The binary resolves the conventions pin from the checkout's `AGENTS.md`: `vh-adlc knowledge` in this
  worktree returned `"source":"repository","pin_files":["AGENTS.md"]`.
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
- A `--default-branch <branch>` flag on `context`, which the operations pass.
- The read rule in the seven SDD skills, the orchestrate skill, `references/loop.md` and
  `references/loop-settings.md`, and a glossary row for the new term.
- A minor plugin version bump.

Out of scope:

- Files the host loads by itself when a session starts, such as `CLAUDE.md` and `AGENTS.md` in the
  working directory. The plugin does not control that load. When a repository lists them in
  `instruction_files`, operations re-read them at the reported version.
- The conventions revision, which keeps coming from the checkout through the binary.
- Routes, verification rungs, CI settings and the other commands, which keep reading the working tree.
- The review prompt, which already reads policy at the reviewed commit.
- Advancing or repairing the shared checkout itself.
- A rule that feature work never edits in the shared main checkout: the owner left it out on
  2026-11-27 ([michielvha/vh-adlc#139 comment](https://github.com/michielvha/vh-adlc/issues/139#issuecomment-7213963511)).

## Design

### Default branch and fetch

`context` takes `--default-branch <branch>`, and every operation passes the default branch it already
uses for `git fetch origin <default branch>` (`references/loop.md`, Decide with the binary). Without the
flag, `context` reads `git symbolic-ref --short refs/remotes/origin/HEAD` and drops the `origin/`
prefix, then falls back to `git ls-remote --symref origin HEAD`, because a repository that was created
locally and pushed later often has no `origin/HEAD`. It then runs `git fetch -q --no-tags origin
<branch>` with `GIT_TERMINAL_PROMPT=0` and a 30-second timeout. With `--no-tags`, the fetch moves only
`refs/remotes/origin/<branch>`, as `claim` does. The fetch runs even when the reading list is empty,
because the tip may have added the settings file or a listed file.

Any of these makes every entry `unverified`, with one `reason` naming the cause: no `origin` remote, an
unresolvable default branch (the reason names `--default-branch`), a failed or timed-out fetch, a ref
lock held by a concurrent fetch, or no merge base between `HEAD` and the tip (a shallow clone or
unrelated histories). A timeout and a held lock both surface as a failed fetch through the same branch
of the code. `context` does not retry; the next run fetches again. It always exits 0 when the local
settings load, so an offline session keeps working and says so.

### States

For each path `p`, with `T` the fetched tip, `B` the merge base of `HEAD` and `T`, and "the local copy"
the working-tree file (absent counts as a value, so two absent sides are equal):

| State | When | `read` |
| --- | --- | --- |
| `current` | The local copy equals `T:p` | `p` |
| `edited` | The local copy differs from `T:p` and from `B:p`: this branch changed, added or kept a file the tip deleted, committed or not | `p` |
| `stale` | The local copy equals `B:p`, and `T:p` exists and differs | `<T sha>:p` |
| `removed` | The local copy equals `B:p`, and `T` has no `p` | `null` |
| `unverified` | No tip or no merge base could be found | `p` |

Content is compared by blob hash: `git hash-object` on the working-tree file against `git rev-parse
<rev>:p`. Comparing against the merge base is what keeps a feature branch that edits `AGENTS.md` from
being sent back to the tip's copy. `read` names the tip by its SHA rather than `origin/<branch>`, so a
concurrent fetch between `context` and `git show` cannot change what the operation reads, and a local
branch named `origin/<branch>` cannot shadow it.

A file both this branch and the tip changed reads as `edited`. The branch picks up the tip's change
when it merges the default branch, which the drift re-review rules already require before a spec
review; reading the local copy until then matches what the branch will build on.

### Settings file

`.vh-adlc/loop.yaml` (or the configured settings path) gets the same classification as
`freshness.settings`. When it is `stale`, `context` loads the tip's settings with `loadLoopSettingsAt`
and takes the reading list and lenses from them; paths it adds that do not exist locally are `stale`.
If the tip's settings fail to load, `freshness.settings` carries `state: "stale"` with an `error`, and
`context` keeps the local list. Every other state keeps the local settings, for the same reason as the
per-file rule: a branch that edits its own settings keeps them.

Because valid settings name only files that exist (`settings.ts:85-90`), a tip that deletes a listed
file also drops it from its settings. `removed` therefore appears when the local settings are kept:
this branch edited its settings, or the tip's settings fail to load. When the local settings are
`stale`, the deleted file leaves the reading list instead.

### Output

The existing fields keep their meaning and shape: `read` stays a list of paths (from whichever settings
applied), and `lenses`, `lensText` and `plugin` are unchanged. The new field is:

```json
"freshness": {
  "default_branch": "main", "tip": "<sha>|null", "reason": "<present only when unverified>",
  "settings": { "path": ".vh-adlc/loop.yaml", "state": "current", "read": ".vh-adlc/loop.yaml" },
  "files": [ { "path": "agents/loop-project.md", "state": "stale", "read": "<sha>:agents/loop-project.md" } ]
}
```

`files` follows the order of `read`. The logic lives in a new `scripts/loop/freshness.ts` and is called
from the `context` branch of `cli.ts`; `loopContext` keeps its signature, so the review prompt is
unchanged.

### Read rule

`references/loop-settings.md` defines the rule next to its `context` paragraph, and the glossary gains
the term Instruction freshness: the state `context` reports for a listed file against origin's default
branch tip. The rule says:

- Run `context` with `--default-branch <default branch>`.
- Read each entry at its `read` value: a path with the file tools, a revision with `git show <read>`.
  Skip `removed` entries. On `unverified`, read the local copies and open the report with a line naming
  the reason.
- The conventions revision is always the one `vh-adlc knowledge` resolves from the checkout. A pin line
  in a copy read from the tip does not change the revision the operation follows or passes to the
  binary and reviewers, so the operation and the binary's gates judge by the same conventions.

`references/loop.md:143`, the seven SDD skills and the orchestrate skill point to that rule in one
clause instead of restating it. `references/loop.md:42` and `skills/vh-adlc-spec/SKILL.md:164` judge
against the files as read under that rule and gain the same pointer. `references/orchestrate.md:108`
needs no change: it re-runs `context`, and the orchestrate skill's read rule governs what it then reads.

### Concurrency, failure, upgrade

Several sessions may run `context` at once. Git serializes ref updates, and a session that loses the
lock reports `unverified` for that run. A fetch that dies partway leaves the old remote-tracking ref,
which is a consistent older tip, and then reports `unverified`. The command writes nothing in the
checkout, so retrying is safe, and `read` pins the tip SHA it classified. The output change is
additive: an operation following the old rule ignores `freshness` and behaves as before. Rolling back
the plugin removes the field and the rule together, because they ship in one version.

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
- [ ] AC-04: When the local settings are kept and the tip deleted a listed file the clone left
      unchanged, that file reports `removed` with a null `read`.
- [ ] AC-05: Without a usable origin (no remote, an unresolvable default branch, a failing fetch, or a
      held ref lock), `context` exits 0, keeps the local reading list, reports every entry `unverified`
      with a reason naming the cause, and its other fields are unchanged.
- [ ] AC-06: After `context` runs in a clone behind the tip, `HEAD`, the current branch, the index, the
      working tree and every ref except `refs/remotes/origin/<branch>` are unchanged.
- [ ] AC-07: The seven SDD skills, the orchestrate skill, `references/loop.md` and
      `references/loop-settings.md` direct operations to pass the default branch to `context` and read
      each listed file at its reported version; `references/loop-settings.md` states that the
      conventions revision stays the one resolved from the checkout; and the loop glossary defines
      Instruction freshness.
- [ ] AC-08: In a clone with no `origin/HEAD`, `context` reports a verified tip both with
      `--default-branch` and, through `git ls-remote`, without it.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-02 | `tests/vh-adlc/loop/context-freshness.test.ts`: a bare origin and a clone with `.vh-adlc/loop.yaml` listing an instruction file, a project procedure and three more files. Origin advances the first two and two of the others; the clone leaves one of them unchanged, edits another with a commit and a third without one, and leaves one file equal to origin. Asserts each state and `read`, and that `git show` of each `stale` `read` equals origin's content. |
| AC-03 | Same file: origin's settings add a new instruction file and a lens; asserts `freshness.settings.state` is `stale`, `read` includes the new path as `stale`, and `lenses` are origin's. A second case gives origin invalid settings and asserts the local list with an `error`. |
| AC-04 | Same file: the clone commits an edit to its own `.vh-adlc/loop.yaml` (a new lens), so its settings read as `edited` and are kept; origin deletes a listed file and drops it from its settings. Asserts that file is `removed` with `read` null. |
| AC-05 | Same file: a clone with no remote; one whose `origin` points to a missing path, with no `origin/HEAD` and no flag, whose `reason` names `--default-branch`; the same missing path with `--default-branch main`, whose `reason` names the failed fetch; and a clone holding `refs/remotes/origin/main.lock`, whose `reason` names the failed fetch. Each exits 0 with every entry `unverified`, and its `read`, `lenses` and `lensText` equal `loopContext` of `loadLoopSettings` on the clone's working tree. `tests/vh-adlc/loop/plugin-version.test.ts` keeps passing for `plugin`. |
| AC-06 | Same file: records `git rev-parse HEAD`, `git symbolic-ref HEAD`, `git status --porcelain=v2`, `git write-tree` and `git for-each-ref` before and after `context` against an origin that also holds a new tag, and asserts that only `refs/remotes/origin/main` differs, now at origin's tip. |
| AC-07 | Same file: reads the seven SDD SKILL.md files, the orchestrate SKILL.md and both references, and asserts each tells operations to pass `--default-branch` and read at the reported version, with a reference to `references/loop-settings.md`; and asserts `references/loop-settings.md` states that the conventions revision comes from `vh-adlc knowledge` on the checkout. `tests/vh-adlc/loop/glossary.test.ts` gains the Instruction freshness row with its rejected synonyms. |
| AC-08 | Same file: a clone with `refs/remotes/origin/HEAD` deleted runs `context` once with `--default-branch main` and once without it; both report `freshness.tip` equal to origin's tip and no entry `unverified`. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-27 | R-1 | spec | `5841585` | claude-opus-5-5 | procedural | 5 should-fix, 4 nits; revision follows |
| 2026-11-27 | R-2 | spec | `5f5b05b` | claude-opus-5-5 | procedural | 3 should-fix, 5 nits; revision follows |

### R-1

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Read rule, States); Scope (Out of scope, first bullet); Context (Owner summary, second paragraph)
EVIDENCE: The design sends operations to `origin/<branch>:AGENTS.md` whenever the local copy is `stale`. In consumers like this one, AGENTS.md also holds the conventions pin (AGENTS.md:3-4 links vhco-pro/docs at e79eaa6). The binary takes the pin from the working tree: `vh-adlc lint docs/specs/instruction-freshness.md --repo . --plugin-pin e79eaa6...` printed `"source":"repository","pin_files":["AGENTS.md"]`. So when a branch is behind a pin bump, the operation reads the tip's AGENTS.md and follows conventions at the new revision, while `gate`, `fresh` and the review dispatch keep deciding at the checkout's older pin. The document never says which revision governs conventions once instruction files come from the tip.
PROPOSAL: In the Read rule, say that the conventions revision the operation follows and passes to the binary and reviewers is always the one the binary resolves from the checkout (`knowledge.revision`), never a pin line in a tip copy. Add that case to the AC-07 text test or to a criterion.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design (States, Settings file); Acceptance Criteria AC-04; Test Plan row AC-01, AC-02, AC-04
EVIDENCE: Every path in valid settings must exist (settings.ts:85-90, `file()` fails with "must reference a file"). If origin deletes a listed file, it must also drop the file from its settings, or its settings stop loading. When it drops the file, the local settings become `stale`, and the design then "takes the reading list and lenses from" the tip's settings, so the deleted file is no longer listed and is never reported `removed`. `removed` can only appear when the local settings are `edited`/`current` against an inconsistent tip, or when the tip's settings fail to load. The Test Plan fixture only says "origin advances, deletes one file", so it leaves this undecided, and two implementers will build different fixtures, one of which cannot produce AC-04. The States table also leaves the case where `T` has no `p` and the working tree differs from `B:p` undefined: `edited` requires "differs from `T:p`", which is unclear when `T:p` does not exist.
PROPOSAL: State the conditions under which `removed` occurs (the local settings are kept because they are edited, or because the tip's settings fail to load), and build the AC-04 fixture on one of them explicitly. Add a States row or clause for a path the tip deleted that this branch changed.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design (Default branch and fetch, Concurrency, failure, upgrade); Acceptance Criteria AC-06; Test Plan row AC-06; Context (Owner summary, "The fetch moves only remote-tracking refs")
EVIDENCE: The design says `git fetch -q origin <branch>` "moves only `refs/remotes/origin/<branch>`", and AC-06 says "only `refs/remotes/origin/<branch>` moved". `git help -m fetch` says: "By default, any tag that points into the histories being fetched is also fetched ... changed by using the --tags or --no-tags options". So a fetch without `--no-tags` can create local `refs/tags/*`, which are not remote-tracking refs. The AC-06 proof compares only HEAD, symbolic-ref, status and write-tree, so it would pass while the criterion's "only" is false.
PROPOSAL: Fetch with `git fetch -q --no-tags origin <branch>`, and have the AC-06 test compare `git for-each-ref` before and after, expecting only `refs/remotes/origin/<branch>` to differ.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Default branch and fetch, Read rule); Scope (the `--default-branch` bullet); Acceptance Criteria AC-05
EVIDENCE: Without the flag, `context` resolves the branch only from `refs/remotes/origin/HEAD`, and otherwise reports every entry `unverified`. The Read rule does not say whether operations pass `--default-branch`, and the eight skills call `context` with no flag (for example skills/vh-adlc-spec/SKILL.md:39). A repository created with `git init` and later pushed usually has no `origin/HEAD`. There, every run comes back `unverified` and the stale-rules harm stays, even though operations already know the default branch (skills/vh-adlc-implement/SKILL.md:51,80 use `<default branch>`).
PROPOSAL: Have the Read rule make operations pass `--default-branch <default branch>`, or fall back to `git ls-remote --symref origin HEAD` before giving up. Add a Test Plan case for a clone without `origin/HEAD` that still gets a verified result.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan row AC-05; Acceptance Criteria AC-05
EVIDENCE: The row asserts `read`, `lenses` and `plugin` are "equal to a run on the same settings before the change". A test in the new suite cannot run the code from before the change, so this baseline cannot be observed as written. The design promises that the reason for an unresolvable default branch "names `--default-branch`", but the row asserts only a non-empty `reason`, so a wrong reason passes. The design also lists a timed-out fetch and a held ref lock as causes, and neither has a case.
PROPOSAL: Compare against the `loopContext` output for the clone's working-tree settings. For the no-`origin/HEAD` case, assert that the reason names `--default-branch`.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary); Scope; Design (Read rule); Acceptance Criteria AC-07; Test Plan row AC-07
EVIDENCE: The Owner summary says each file gets "the local path, or a `origin/<branch>:<path>` revision". It leaves out the null `read` of `removed`, and "a `origin" should read "an". The document calls orchestrate one of "the eight SDD skills", but references/loop.md:141 lists the SDD operations as seven (spec, tasks, implement, review, ship, investigate and resume), and references/orchestrate.md:11-22 classes orchestrate as a coordination operation.
PROPOSAL: Mention the null `read` for `removed` in the summary, fix the article, and say "the seven SDD skills and the orchestrate skill" or equivalent wherever "eight SDD skills" appears.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Design (Read rule); Context (Background, Current state)
EVIDENCE: The design updates references/loop.md:143 and the eight skills' context lines. Other places also refer to "the files `bun scripts/loop/cli.ts context` lists" or re-run context: references/loop.md:42 (nit triage), skills/vh-adlc-spec/SKILL.md:164 and references/orchestrate.md:108. The last is outside `covers`.
PROPOSAL: List these locations in the Read rule as also following the reported version, or say why they need no change.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Design (States, Output, Concurrency, failure, upgrade)
EVIDENCE: `read` is `origin/<branch>:p`, a moving ref. A concurrent session's fetch between `context` and the `git show` makes the operation read a later tip than the one classified. The name can also be ambiguous with a local branch named `origin/<branch>`. The output already carries `tip: "<sha>"`.
PROPOSAL: Emit `read` as `<tip sha>:p`, or state why the moving ref is preferred.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Design (States); Scope (Not handled line)
EVIDENCE: The States table depends on `B`, the merge base of `HEAD` and `T`, and no outcome is defined for when none exists (a shallow clone, or unrelated histories). The Scope line "Not handled: a file that both the current branch and the tip changed ..." does not follow the convention's `Not handled: <the case>, <why> (R-<n> F-<nn>).` form (feature-documents.md:255-256).
PROPOSAL: Report `unverified` with a reason when no merge base exists. Either restate the limit as a Design decision with its reason, or keep it in Scope until a finding gives it an ID.

### R-2

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan row AC-01, AC-02; Acceptance Criteria AC-02
EVIDENCE: The row now reads "listing an instruction file, a project procedure and three more files. Origin advances the first two and two of the others; the clone leaves one of them unchanged, edits another with a commit and a third without one, and leaves one file equal to origin." Among the three other files it gives four roles: unchanged, edited with a commit, edited without one, and equal to origin. The counts do not add up. Under the plainest reading (origin advances A and B, the clone leaves A unchanged, commits an edit to B and edits C without committing), no file is left to be `current`, and the uncommitted edit lands on a file the tip did not change. AC-02 needs a `current` file and edited files "even when the tip also differs", committed or uncommitted. Two implementers will build different fixtures, and one of them will not prove AC-02. The R-1 revision rewrote this row.
PROPOSAL: Give each file one role: instruction file and procedure advanced and unchanged locally (`stale`); one file equal to origin (`current`); one file the tip advanced that the clone edits in a commit; and one file the tip advanced that the clone edits without committing (both `edited`).

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan row AC-07; Acceptance Criteria AC-07; Design (Read rule, "point to that rule in one clause instead of restating it")
EVIDENCE: The AC-07 proof uses a text pattern to judge free prose. It asserts that each skill and reference "tells operations to pass `--default-branch` and read at the reported version, with a reference to `references/loop-settings.md`", and that loop-settings.md "states that the conventions revision comes from `vh-adlc knowledge` on the checkout". It gives no must-pass or must-fail examples, and feature-documents.md:128-129 requires them: "A proof that judges free text with a pattern lists its must-pass and must-fail examples in the row." The Design also says loop.md:143 and the skills only "point to that rule in one clause instead of restating it". A one-clause pointer that never names `--default-branch` follows the Design but fails this row. A sentence that names the flag without directing anyone to pass it would pass the row.
PROPOSAL: Give the exact phrases or patterns the test checks, with one must-pass example (for example the skill line `bun scripts/loop/cli.ts context --default-branch <default branch>` followed by a pointer to references/loop-settings.md) and one must-fail example for each assertion. Make the pointer clause the Design asks for satisfy them.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design (Default branch and fetch; States, `unverified` row); Acceptance Criteria AC-05; Test Plan row AC-05
EVIDENCE: The R-1 revision added "or no merge base between `HEAD` and the tip (a shallow clone or unrelated histories)" as a cause that makes every entry `unverified`, and the States table now says "No tip or no merge base could be found". AC-05 lists only "no remote, an unresolvable default branch, a failing fetch, or a held ref lock", and the AC-05 row has no shallow or unrelated-history case. An implementation where `git merge-base` throws, so that `context` exits non-zero and every operation in a shallow clone stops before acting, passes every planned check.
PROPOSAL: Add the missing merge base to AC-05's list. Add an AC-05 case, such as a clone whose branch has history unrelated to origin's, that asserts exit 0, every entry `unverified` and a reason naming the missing merge base.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Test Plan row AC-05 (the held-lock case); Design (Default branch and fetch, "A timeout and a held lock both surface as a failed fetch")
EVIDENCE: The row says "a clone holding `refs/remotes/origin/main.lock`, whose `reason` names the failed fetch" but does not say origin has moved past the clone's tracking ref. Git's fetch leaves an up-to-date remote-tracking ref alone and takes no lock for it, so with an unadvanced origin the fetch succeeds and the case reports a verified tip. I could not observe this: the sandbox refused the scratch git run. It rests on git's documented fetch behaviour.
PROPOSAL: In this case, say origin is advanced past the clone's `refs/remotes/origin/main` before the lock file is created.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design (Default branch and fetch, "With `--no-tags`, the fetch moves only `refs/remotes/origin/<branch>`, as `claim` does"); Context (Background, Current state, "`claim` already fetches the default branch and touches only remote-tracking refs")
EVIDENCE: plugins/vh-adlc/scripts/loop/claim.ts:40 runs `["fetch", "-q", "origin", defaultBranch]` without `--no-tags`, so claim can auto-follow tags into `refs/tags/*`, the very thing R-1 F-03 pointed out. The R-1 revision added the Design sentence. The Context bullet predates it.
PROPOSAL: Drop "as `claim` does" from the Design sentence, and in Context say claim fetches the default branch without `--no-tags`.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design (Default branch and fetch)
EVIDENCE: The R-1 revision added the `git ls-remote --symref origin HEAD` fallback. The 30-second timeout and `GIT_TERMINAL_PROMPT=0` are stated only for the fetch, so the network call before it has no stated bound. The branch name it returns is then used as an argument to `git fetch`, and nothing says the name is validated or separated with `--` (a name beginning with `-` would be read as an option).
PROPOSAL: Apply the same timeout and prompt guard to `ls-remote`. Check the resolved or passed branch with `git check-ref-format --branch`, or pass it after `--`, and report `unverified` naming `--default-branch` when it fails.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Design (States, "absent counts as a value, so two absent sides are equal"; Settings file; Read rule, "Read each entry at its `read` value"); Output
EVIDENCE: In a repository with no settings file locally, at the merge base or at the tip (such as this one, Context line 105), `freshness.settings` classifies as `current` with `read: ".vh-adlc/loop.yaml"`, a path that does not exist. The Read rule says to read "each entry" without saying whether `freshness.settings` is one, and operations do not read the settings file today. One implementer will have operations try to read a missing file, while another will skip it.
PROPOSAL: Say whether operations read `freshness.settings`, and give an absent settings file a null `read` or leave it out of the entries operations read.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Design (Read rule, "`skills/vh-adlc-spec/SKILL.md:164` ... gain the same pointer", and the skills' one-clause pointer); frontmatter `covers`
EVIDENCE: Existing text tests outside `covers` pin the lines this Design rewrites. tests/vh-adlc/proportional-review.test.ts:196 expects "judged against the product profile and the files `bun scripts/loop/cli.ts context` lists". tests/vh-adlc/check.test.ts:694 and tests/vh-adlc/direct-operation-compatibility.test.ts:31 expect "scripts/loop/cli.ts context" in the skills and loop.md. `covers` lists only tests/vh-adlc/loop/, and the Design does not say whether these phrases must survive.
PROPOSAL: State that the rewritten lines keep these phrases. Otherwise, list the three test files in `covers` and in the Design as updated.
