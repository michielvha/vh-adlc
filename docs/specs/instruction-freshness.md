---
status: in-progress
status_description: "Being implemented on fix/instruction-freshness, task by task."
issue: https://github.com/michielvha/vh-adlc/issues/139
branch: fix/instruction-freshness
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
for five corrections and four smaller fixes, and the second for three corrections and five smaller
fixes, mostly to make the planned tests exact. The third found that an extra pointer in the spec skill
would have broken a pinned skill-body test. That pointer and a similar one in `references/loop.md` are
dropped, because the read rule already decides which version operations hold, and the remaining test
gaps are closed. The fourth found only two wording slips in this Context section, both fixed, and
nothing in the normative sections. Acceptance authorizes implementation on a feature branch. Opening the code PR and merging need separate requests.

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
- `claim` already fetches the default branch, without `--no-tags`
  (`plugins/vh-adlc/scripts/loop/claim.ts:40`).
- Existing text tests pin the skills' wording. `tests/vh-adlc/check.test.ts:694` and
  `tests/vh-adlc/direct-operation-compatibility.test.ts:31` expect `scripts/loop/cli.ts context` in the
  skills, and `tests/vh-adlc/proportional-review.test.ts:196` expects ``judged against the product
  profile and the files `bun scripts/loop/cli.ts context` lists`` in the spec skill.
  `direct-operation-compatibility.test.ts:17-27,101-108` also compares each of the seven SDD skills'
  bodies with a pinned baseline, leaving out `## Loop routes` and a few other sections it checks
  separately. Each of the
  seven skills' read-rule line sits under `## Loop routes`; the spec skill's line 164 sits under
  `## Under severity by consequence`, which is pinned. The orchestrate skill's line 24 sits under
  `## Start` and no body test pins it.
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
locally and pushed later often has no `origin/HEAD`. The branch name, passed or resolved, must pass
`git check-ref-format --branch`. `context` then runs `git fetch -q --no-tags origin -- <branch>`. Both
network calls, `ls-remote` and `fetch`, run with `GIT_TERMINAL_PROMPT=0` and a 30-second timeout each.
With `--no-tags`, the fetch moves only `refs/remotes/origin/<branch>`. The fetch runs even when the
reading list is empty, because the tip may have added the settings file or a listed file.

Any of these makes every entry `unverified`, with one `reason` naming the cause: no `origin` remote, an
unresolvable or invalid default branch (the reason names `--default-branch`), a failed or timed-out fetch, a ref
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
per-file rule: a branch that edits its own settings keeps them. When no settings file exists locally,
at the merge base or at the tip, `freshness.settings` is `current` with a null `read`. Operations do not
read the settings file: `freshness.settings` tells them which settings supplied the list, and only the
entries under `freshness.files` are read.

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
- Read each entry of `freshness.files` at its `read` value: a path with the file tools, a revision
  with `git show <read>`. Skip `removed` entries. On `unverified`, read the local copies and open the
  report with a line naming the reason.
- The conventions revision is always the one `vh-adlc knowledge` resolves from the checkout. A pin line
  in a copy read from the tip does not change the revision the operation follows or passes to the
  binary and reviewers, so the operation and the binary's gates judge by the same conventions.

The rule sits in `references/loop-settings.md` under a heading named Instruction freshness, and that
section contains the sentence `The conventions revision is always the one vh-adlc knowledge resolves
from the checkout.` with `vh-adlc knowledge` in a code span.

`references/loop.md:143`, the seven SDD skills and the orchestrate skill point to that rule instead of
restating it. Each pointer names the command with its flag in one code span,
`bun scripts/loop/cli.ts context --default-branch <default branch>`, and in the same sentence says
to read the listed files at the versions `references/loop-settings.md` (Instruction freshness) names.
For example: Before acting, run `bun scripts/loop/cli.ts context --default-branch <default branch>` and
read every file it lists at the version `references/loop-settings.md` (Instruction freshness) names.
Three other places name the files `context` lists and stay unchanged. `references/loop.md:42` and
`skills/vh-adlc-spec/SKILL.md:164` judge open questions and nits against those files, and the read
rule each operation follows before acting already decides which version of them it holds.
`references/orchestrate.md:108` re-runs `context`, and the orchestrate skill's read rule governs what
it then reads.

The rewritten lines are the seven SDD skills' lines under `## Loop routes`, the orchestrate skill's line
under `## Start`, `references/loop.md:143` and `references/loop-settings.md`. None of them is in a body
that `direct-operation-compatibility.test.ts` pins, and each keeps `scripts/loop/cli.ts context` inside
the new command span, so the existing text tests need no change.

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
- [ ] AC-05: Without a usable origin or tip (no remote, an unresolvable default branch, a failing
      fetch, a held ref lock, or no merge base with the tip), `context` exits 0, keeps the local reading list, reports every entry `unverified`
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
| AC-01, AC-02 | `tests/vh-adlc/loop/context-freshness.test.ts`: a bare origin and a clone with `.vh-adlc/loop.yaml` listing five files, each with one role. The instruction file and the project procedure: origin advances them, the clone leaves them unchanged (`stale`). A third file: neither side changes it (`current`). A fourth: origin advances it and the clone commits its own edit (`edited`). A fifth: origin advances it and the clone edits it without committing (`edited`). Asserts each state and `read`, and that `git show` of each `stale` `read` equals origin's content. |
| AC-03 | Same file: origin's settings add a new instruction file and a lens; asserts `freshness.settings.state` is `stale`, `read` includes the new path as `stale`, and `lenses` are origin's. A second case gives origin invalid settings and asserts the local list with an `error`. |
| AC-04 | Same file: the clone commits an edit to its own `.vh-adlc/loop.yaml` (a new lens), so its settings read as `edited` and are kept; origin deletes a listed file and drops it from its settings. Asserts that file is `removed` with `read` null. |
| AC-05 | Same file: a clone with no remote; one whose `origin` points to a missing path, with no `origin/HEAD` and no flag, whose `reason` names `--default-branch`; the same missing path with `--default-branch main`, whose `reason` names the failed fetch; a clone holding `refs/remotes/origin/main.lock`, created after origin advanced past the clone's `refs/remotes/origin/main`, whose `reason` names the failed fetch; and a clone whose branch was reset to a root commit unrelated to origin's history that holds `.vh-adlc/loop.yaml` and at least one listed file, so the list of `unverified` entries is not empty, whose `reason` names the missing merge base. Each exits 0 with every entry `unverified`, and its `read`, `lenses` and `lensText` equal `loopContext` of `loadLoopSettings` on the clone's working tree. `tests/vh-adlc/loop/plugin-version.test.ts` keeps passing for `plugin`. |
| AC-06 | Same file: records `git rev-parse HEAD`, `git symbolic-ref HEAD`, `git status --porcelain=v2`, `git write-tree` and `git for-each-ref` before and after `context` against an origin that also holds a new tag, and asserts that only `refs/remotes/origin/main` differs, now at origin's tip. |
| AC-07 | Same file: in each of the seven SDD SKILL.md files, the orchestrate SKILL.md and `references/loop.md`, at least one sentence contains both the literal `` `bun scripts/loop/cli.ts context --default-branch <default branch>` `` and the literal `(Instruction freshness)` after `references/loop-settings.md`. Must pass: ``Before acting, run `bun scripts/loop/cli.ts context --default-branch <default branch>` and read every file it lists at the version `references/loop-settings.md` (Instruction freshness) names.`` Must fail: ``Before acting, read every file `bun scripts/loop/cli.ts context` lists.`` (no flag) and ``Run `bun scripts/loop/cli.ts context --default-branch <default branch>`.`` with no `(Instruction freshness)` in that sentence. In `references/loop-settings.md`, the section under the Instruction freshness heading contains all three of `` `--default-branch <default branch>` ``, `` `git show <read>` `` and ``The conventions revision is always the one `vh-adlc knowledge` resolves from the checkout.`` Must pass: the Design's three rule bullets (run `context` with `--default-branch <default branch>`; read each entry of `freshness.files` at its `read` value, a revision with `git show <read>`; the conventions sentence). Must fail: the section with only the conventions sentence, or with ``The conventions revision is the one the tip's `AGENTS.md` pins.`` in its place. `tests/vh-adlc/loop/glossary.test.ts` gains the Instruction freshness row with its rejected synonyms. |
| AC-08 | Same file: a clone with `refs/remotes/origin/HEAD` deleted runs `context` once with `--default-branch main` and once without it; both report `freshness.tip` equal to origin's tip and no entry `unverified`. |

## Tasks

- [x] T1 `tests/vh-adlc/loop/context-freshness.test.ts` - the failing tests for the per-file states, the tip-pinned `read`, the untouched checkout and a clone without `origin/HEAD`; they fail because `context` prints no `freshness` (AC-01, AC-02, AC-04, AC-06, AC-08)
      Evidence: `bun test tests/vh-adlc/loop/context-freshness.test.ts --timeout 60000` on 2f12dfa plus this test: 0 pass, 4 fail. AC-01/02, AC-04 and AC-08 fail on `json.freshness` being undefined; AC-06 fails because `refs/remotes/origin/main` stayed at the clone's old commit (no fetch).
- [ ] T2 `plugins/vh-adlc/scripts/loop/freshness.ts`, `plugins/vh-adlc/scripts/loop/cli.ts` - default-branch resolution, the guarded `--no-tags` fetch and the state classification; T1 passes (AC-01, AC-02, AC-04, AC-06, AC-08)
- [ ] T3 `tests/vh-adlc/loop/context-freshness.test.ts` - the failing tests for the stale-settings fallback and every `unverified` cause; they fail because `context` still reads only the local settings and has no fallback reasons (AC-03, AC-05)
- [ ] T4 `plugins/vh-adlc/scripts/loop/freshness.ts` - the tip-settings fallback, its load error, the null `read` for an absent settings file and the `unverified` reasons; T3 and T1 pass, and `tests/vh-adlc/loop/plugin-version.test.ts` still passes (AC-03, AC-05)
- [ ] T5 `tests/vh-adlc/loop/context-freshness.test.ts`, `tests/vh-adlc/loop/glossary.test.ts` - the failing text tests for the read rule with the Test Plan's must-pass and must-fail sentences, and the Instruction freshness glossary row; they fail because no skill or reference states the rule yet (AC-07)
- [ ] T6 `plugins/vh-adlc/references/loop-settings.md`, `plugins/vh-adlc/references/loop.md`, the seven SDD `SKILL.md` files and `plugins/vh-adlc/skills/vh-adlc-orchestrate/SKILL.md` - the Instruction freshness section and glossary row, and the pointer in each skill and in `references/loop.md:143`; T5 passes, and `tests/vh-adlc/check.test.ts`, `tests/vh-adlc/direct-operation-compatibility.test.ts` and `tests/vh-adlc/proportional-review.test.ts` still pass (AC-07)
- [ ] T7 `plugins/vh-adlc/plugin.json` - the minor version bump the Scope names; `tests/vh-adlc/check.test.ts` passes (Design)

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-27 | R-1 | spec | `5841585` | claude-opus-5-5 | procedural | 5 should-fix, 4 nits; revision follows |
| 2026-11-27 | R-2 | spec | `5f5b05b` | claude-opus-5-5 | procedural | 3 should-fix, 5 nits; revision follows |
| 2026-11-27 | R-3 | spec | `ed52406` | claude-opus-5-5 | procedural | 1 blocking, 1 should-fix, 1 nit; revision follows |
| 2026-11-27 | R-4 | spec | `45cad2a` | claude-opus-5-5 | procedural | 2 nits, both in Context; applied outside the baseline |
| 2026-11-27 | R-4 | spec | `45cad2a` | n/a | n/a | accepted by owner |

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

### R-3

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design (Read rule, "`references/loop.md:42` and `skills/vh-adlc-spec/SKILL.md:164` ... gain a pointer to `references/loop-settings.md` (Instruction freshness)" and the last paragraph, "with the pointer added after it ... Those tests therefore need no change"); Context (Background, Current state, the "Existing text tests pin phrases" bullet); frontmatter `covers`
EVIDENCE: tests/vh-adlc/direct-operation-compatibility.test.ts does more than check for phrases. For the spec skill it strips only the `## Loop routes` and `## Issue labels` sections, then asserts `expect(body(current)).toBe(body(previous))` against `specBaseline = "c2eff1d0300af93f8aed228dcff68e6c55714ecf"` (lines 11, 19-27 and 101-108). skills/vh-adlc-spec/SKILL.md:164 sits under `## Under severity by consequence` (line 155), outside both stripped sections. `git show c2eff1d...:plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md` has the same line 164, "the product profile and the files `bun scripts/loop/cli.ts context` lists." `bun test tests/vh-adlc/direct-operation-compatibility.test.ts` passes now (8 pass). Adding the pointer the Design requires after that phrase changes the body, so "direct spec keeps its approved operation body" fails. The implementer then has to change the test's baseline, and that file is outside `covers` (only tests/vh-adlc/loop/). The R-2 revision added the "need no change" claim in answer to R-2 F-08.
PROPOSAL: Either drop the SKILL.md:164 pointer (it already defers to the files `context` lists, and the Loop routes pointer governs how they are read), or list tests/vh-adlc/direct-operation-compatibility.test.ts in `covers` and say in the Design that its spec baseline moves to the implementing commit. Correct the Background bullet to match.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan row AC-07; Acceptance Criteria AC-07; Design (Read rule, "The rule sits in `references/loop-settings.md` under a heading named Instruction freshness")
EVIDENCE: AC-07 requires that `references/loop-settings.md`, along with the skills and loop.md, "direct operations to pass the default branch to `context` and read each listed file at its reported version". The revised row checks the `--default-branch` command span and `(Instruction freshness)` only in the eight SKILL.md files and `references/loop.md`. For loop-settings.md it checks only the conventions-revision sentence. An Instruction freshness section that holds just that sentence, with no `--default-branch` step, no "read each entry of `freshness.files` at its `read` value" and no `git show <read>`, passes the row while every pointer leads to a rule that does not exist. The R-2 revision rewrote this row.
PROPOSAL: In the AC-07 row, also assert that the Instruction freshness section of loop-settings.md contains `--default-branch <default branch>` and `git show <read>`. Give one must-pass example (the Design's rule bullets) and one must-fail example (the section with only the conventions sentence).

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Test Plan row AC-05 (the unrelated-history case)
EVIDENCE: The case is "a clone whose branch was reset to a root commit unrelated to origin's history". It does not say that this root commit carries `.vh-adlc/loop.yaml` and its listed files. A root commit made with `git checkout --orphan` and `git commit --allow-empty` has no settings, so `read` is `[]`. The assertion "every entry `unverified`" then holds vacuously, and the case proves only the reason and the exit code. The R-2 revision added this case.
PROPOSAL: Say that the unrelated root commit contains the settings file and at least one listed file, so the case asserts a non-empty list of `unverified` entries.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Context (Background, Current state, the "Existing text tests pin the skills' wording" bullet)
EVIDENCE: The bullet says `direct-operation-compatibility.test.ts:17-27,101-108` "compares each of the seven SDD skills' bodies with a pinned baseline, leaving out only `## Loop routes` and `## Issue labels`". The test also removes `## Documentation impact` for implement and ship (lines 60-68), `## Follow-up review after merge` for ship and resume (lines 70-78), and `## Article and promotion handoff` and `## After an authorized merge` for ship (lines 79-100). It also compares only the text from "The plugin directory is two levels" onward (line 22). The conclusion still holds: all seven read-rule lines are under `## Loop routes` (spec 29/39, tasks 18/25, implement 39/48, review 18/26, ship 42/50, investigate 40/44, resume 31/40), and spec line 164 is under the pinned `## Under severity by consequence` (line 155). The c2eff1d baseline has the same line 164. The R-3 revision added this bullet.
PROPOSAL: Replace "leaving out only `## Loop routes` and `## Issue labels`" with "leaving out `## Loop routes` and a few other sections it checks separately".

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary, fifth paragraph, "The third found that two extra pointers would have broken a pinned skill-body test")
EVIDENCE: R-3 F-01 named only the `skills/vh-adlc-spec/SKILL.md:164` pointer as breaking the pinned body test. The other dropped pointer, at `references/loop.md:42`, is in a file no body test pins. The tests that read loop.md (check.test.ts:312,382,388, proportional-review.test.ts:226, proportionality.test.ts:13, loop/glossary.test.ts:19) check for phrases, not a whole body. The R-3 revision added this sentence.
PROPOSAL: Say that R-3 found the spec skill pointer would have broken a pinned skill-body test, and that both extra pointers are now dropped because the read rule already decides which version operations hold.
