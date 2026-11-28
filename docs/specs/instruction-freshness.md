---
status: complete
status_description: "All eight criteria met in implementation review R-5; shipped for owner merge."
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

Proof was observed in implementation review R-5 at `8c79b67`, which returned all eight criteria as
met. `tests/vh-adlc/loop/context-freshness.test.ts` builds a bare origin and clones that fall behind,
then checks every state, the settings fallback, the offline paths and that no ref except the tracking
ref moved, and a text test checks the read rule in every skill and reference. Two limits remain: origin
is a local bare repository, not a network remote, and the 30-second timeout path is not exercised on
its own, because it shares the failed-fetch code. The first spec review asked
for five corrections and four smaller fixes, and the second for three corrections and five smaller
fixes, mostly to make the planned tests exact. The third found that an extra pointer in the spec skill
would have broken a pinned skill-body test. That pointer and a similar one in `references/loop.md` are
dropped, because the read rule already decides which version operations hold, and the remaining test
gaps are closed. The fourth found only two wording slips in this Context section, both fixed, and
nothing in the normative sections. The owner accepted the spec at R-4 and asked to ship it; the code
PR waits for the owner's merge.

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
      Evidence: `bun test tests/vh-adlc/loop/context-freshness.test.ts tests/vh-adlc/loop/glossary.test.ts --timeout 60000` on macOS at f842355: 25 pass, 0 fail. The test "stale, current and edited files each report their state and the version to read" shows the instruction file and project procedure as `stale` with `<tip>:<path>`, and `git show` prints origin's content. Limitation: local bare-repository origin, no network remote.
      Evidence: R-9 (Codex gpt-6.2-sol, `6fdd3ed`): not met; a listed file the tip turns into an in-repository symlink reads as the link target (R-8 F-05). The ordinary fixtures still pass.
      Residual: https://github.com/michielvha/vh-adlc/issues/206
- [ ] AC-02: A listed file equal to the tip reports `current` with its path. A listed file the current
      branch changed since it left the tip, committed or uncommitted, reports `edited` with its path,
      even when the tip also differs.
      Evidence: `bun test tests/vh-adlc/loop/context-freshness.test.ts tests/vh-adlc/loop/glossary.test.ts --timeout 60000` on macOS at f842355: 25 pass, 0 fail. The same test shows a file equal to the tip as `current`, and a committed and an uncommitted edit of files the tip also changed as `edited` with their paths.
      Evidence: R-9 (Codex gpt-6.2-sol, `6fdd3ed`): not met; an unchanged in-repository symlink reads as `edited` (R-8 F-05). The ordinary fixtures still pass.
      Residual: https://github.com/michielvha/vh-adlc/issues/206
- [ ] AC-03: When the local settings file is behind the tip, `freshness.settings` is `stale` and the
      reading list and lenses are the tip's, including a file the tip added that the clone lacks, which
      reports `stale`.
      Evidence: `bun test tests/vh-adlc/loop/context-freshness.test.ts tests/vh-adlc/loop/glossary.test.ts --timeout 60000` on macOS at f842355: 25 pass, 0 fail. "stale local settings take the reading list and lenses from the tip" shows settings `stale`, the tip-added `e.md` listed as `stale` and the tip's lens. "tip settings that fail to load" keeps the local list and reports a `schema_version` error.
      Evidence: R-9 (Codex gpt-6.2-sol, `6fdd3ed`): not met; `export-ignore` on the tip's settings drops the tip list without an error (R-8 F-04). The ordinary fixtures still pass.
      Residual: https://github.com/michielvha/vh-adlc/issues/206
- [ ] AC-04: When the local settings are kept and the tip deleted a listed file the clone left
      unchanged, that file reports `removed` with a null `read`.
      Evidence: `bun test tests/vh-adlc/loop/context-freshness.test.ts tests/vh-adlc/loop/glossary.test.ts --timeout 60000` on macOS at f842355: 25 pass, 0 fail. "a listed file the tip deleted reads as removed" shows the clone's edited settings kept and `d.md` reported `removed` with a null `read`.
      Evidence: R-9 (Codex gpt-6.2-sol, `6fdd3ed`): not met; a listed file the tip replaces with a directory reads as `stale` instead of `removed` (R-9 F-06). The ordinary fixtures still pass.
      Residual: https://github.com/michielvha/vh-adlc/issues/206
- [x] AC-05: Without a usable origin or tip (no remote, an unresolvable default branch, a failing
      fetch, a held ref lock, or no merge base with the tip), `context` exits 0, keeps the local reading list, reports every entry `unverified`
      with a reason naming the cause, and its other fields are unchanged.
      Evidence: `bun test tests/vh-adlc/loop/context-freshness.test.ts tests/vh-adlc/loop/glossary.test.ts --timeout 60000` on macOS at f842355: 25 pass, 0 fail. Five cases (no remote, a missing origin without origin/HEAD or the flag, the same with the flag, a held `refs/remotes/origin/main.lock` with origin ahead, an unrelated root commit) each exit 0, report every entry `unverified` with the matching reason, and equal `loopContext` of the clone's working-tree settings. Limitation: the 30-second timeout path is not exercised; it shares the failed-fetch branch of the code.
- [ ] AC-06: After `context` runs in a clone behind the tip, `HEAD`, the current branch, the index, the
      working tree and every ref except `refs/remotes/origin/<branch>` are unchanged.
      Evidence: `bun test tests/vh-adlc/loop/context-freshness.test.ts tests/vh-adlc/loop/glossary.test.ts --timeout 60000` on macOS at f842355: 25 pass, 0 fail. "only origin's tracking ref for the default branch moves" compares HEAD, the branch, `status --porcelain=v2`, `write-tree` and `for-each-ref` before and after against an origin with a new tag: only `refs/remotes/origin/main` moved and no tag arrived.
      Evidence: R-9 (Codex gpt-6.2-sol, `6fdd3ed`): not met; a configured extra fetch mapping moves a second tracking ref (R-8 F-02). The ordinary fixtures still pass.
      Residual: https://github.com/michielvha/vh-adlc/issues/206
- [ ] AC-07: The seven SDD skills, the orchestrate skill, `references/loop.md` and
      `references/loop-settings.md` direct operations to pass the default branch to `context` and read
      each listed file at its reported version; `references/loop-settings.md` states that the
      conventions revision stays the one resolved from the checkout; and the loop glossary defines
      Instruction freshness.
      Evidence: `bun test tests/vh-adlc/loop/context-freshness.test.ts tests/vh-adlc/loop/glossary.test.ts --timeout 60000` on macOS at f842355: 25 pass, 0 fail. The pointer test passes for all eight skills and `references/loop.md`, the rule test passes for `references/loop-settings.md`, the must-pass and must-fail sentence tests pass, and the glossary tests pass with the Instruction freshness row. `check.test.ts`, `direct-operation-compatibility.test.ts` and `proportional-review.test.ts` passed at f5bd1b0 (139 pass, 1 fail on the then-missing version bump, which f842355 fixed: 111 pass, 0 fail).
      Evidence: R-9 (Codex gpt-6.2-sol, `6fdd3ed`): not met; the documented command omits `--repo`, which the CLI requires (R-8 F-03). The ordinary fixtures still pass.
      Residual: https://github.com/michielvha/vh-adlc/issues/206
- [x] AC-08: In a clone with no `origin/HEAD`, `context` reports a verified tip both with
      `--default-branch` and, through `git ls-remote`, without it.
      Evidence: `bun test tests/vh-adlc/loop/context-freshness.test.ts tests/vh-adlc/loop/glossary.test.ts --timeout 60000` on macOS at f842355: 25 pass, 0 fail. "a clone without origin/HEAD still verifies" deletes the symbolic ref with `git symbolic-ref --delete` and reports origin's tip with `--default-branch main` and without it (through `git ls-remote`), with no entry `unverified`.

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
- [x] T2 `plugins/vh-adlc/scripts/loop/freshness.ts`, `plugins/vh-adlc/scripts/loop/cli.ts` - default-branch resolution, the guarded `--no-tags` fetch and the state classification; T1 passes (AC-01, AC-02, AC-04, AC-06, AC-08)
      Evidence: `bun test tests/vh-adlc/loop/context-freshness.test.ts --timeout 60000`: 4 pass. The first run left AC-06 failing on a test defect, not the code: the snapshot compared `refs/remotes/origin/HEAD` by its resolved commit, and that symbolic ref follows `origin/main`. The test now compares symbolic refs by their target. `contextReport` lives in `procedure.ts`, which `cli.ts` calls. `plugin-version.test.ts` and `lenses.test.ts` pass. `cli.test.ts` and `review-route.test.ts` show the same 42 failing tests by name as origin/main `addb2f6` on this Mac (command-route review needs `unshare`).
- [x] T3 `tests/vh-adlc/loop/context-freshness.test.ts` - the failing tests for the stale-settings fallback and every `unverified` cause; they fail because `context` still reads only the local settings and has no fallback reasons (AC-03, AC-05)
      Evidence: `bun test tests/vh-adlc/loop/context-freshness.test.ts --timeout 60000` at e824194 plus this test: 9 pass, 2 fail. Both AC-03 tests fail as planned: `read` stays the local list, and `settings.error` is undefined. The five AC-05 cases already pass, because T2 implemented every `unverified` reason, so they were never seen failing against code that lacked them. Writing them exposed a test defect from T1: `git update-ref -d refs/remotes/origin/HEAD` deletes the symbolic ref's target, `origin/main`, and leaves `origin/HEAD` in place. Both that case and AC-08 now use `git symbolic-ref --delete`, and AC-08 still passes, now through the `ls-remote` fallback.
- [x] T4 `plugins/vh-adlc/scripts/loop/freshness.ts` - the tip-settings fallback, its load error, the null `read` for an absent settings file and the `unverified` reasons; T3 and T1 pass, and `tests/vh-adlc/loop/plugin-version.test.ts` still passes (AC-03, AC-05)
      Evidence: `bun test tests/vh-adlc/loop/context-freshness.test.ts tests/vh-adlc/loop/plugin-version.test.ts tests/vh-adlc/loop/lenses.test.ts tests/vh-adlc/loop/settings.test.ts --timeout 60000`: 47 pass, 1 fail. All 11 freshness tests pass. The one failure is the lens command-route stub test, which fails the same way on origin/main `addb2f6` on this Mac. The fallback sits in `procedure.ts` (`contextReport`). The null `read` and the `unverified` reasons came in with T2 in `freshness.ts`.
- [x] T5 `tests/vh-adlc/loop/context-freshness.test.ts`, `tests/vh-adlc/loop/glossary.test.ts` - the failing text tests for the read rule with the Test Plan's must-pass and must-fail sentences, and the Instruction freshness glossary row; they fail because no skill or reference states the rule yet (AC-07)
      Evidence: `bun test tests/vh-adlc/loop/context-freshness.test.ts tests/vh-adlc/loop/glossary.test.ts --timeout 60000` at 8c446f9 plus this test: 14 pass, 11 fail. The must-pass and must-fail sentence checks pass. All 8 skills and `references/loop.md` fail the pointer check, `references/loop-settings.md` fails the rule check, and the glossary's Terms-table test fails on the missing Instruction freshness row.
- [x] T6 `plugins/vh-adlc/references/loop-settings.md`, `plugins/vh-adlc/references/loop.md`, the seven SDD `SKILL.md` files and `plugins/vh-adlc/skills/vh-adlc-orchestrate/SKILL.md` - the Instruction freshness section and glossary row, and the pointer in each skill and in `references/loop.md:143`; T5 passes, and `tests/vh-adlc/check.test.ts`, `tests/vh-adlc/direct-operation-compatibility.test.ts` and `tests/vh-adlc/proportional-review.test.ts` still pass (AC-07)
      Evidence: `bun test tests/vh-adlc/loop/context-freshness.test.ts tests/vh-adlc/loop/glossary.test.ts tests/vh-adlc/check.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/proportional-review.test.ts --timeout 60000`: 139 pass, 1 fail. All AC-07 text tests, the glossary tests, the pinned skill bodies and the proportional-review phrases pass. The one failure is `check.test.ts`, "a package change comes with a version change", which T7's bump answers.
- [x] T7 `plugins/vh-adlc/plugin.json` - the minor version bump the Scope names; `tests/vh-adlc/check.test.ts` passes (Design)
      Evidence: bumped 0.33.0 to 0.34.0. `bun test tests/vh-adlc/check.test.ts tests/vh-adlc/loop/plugin-version.test.ts tests/vh-adlc/loop/context-freshness.test.ts tests/vh-adlc/loop/glossary.test.ts --timeout 60000`: 111 pass, 0 fail. The package carries its version in a second manifest, `plugins/vh-adlc/.claude-plugin/plugin.json`, which `check.test.ts` compares with origin/main. That file is bumped in the same commit, as `00752fe` did. It is outside `covers`, and nothing in this feature's behavior depends on it.

## Open Questions

None.

## Deferred

- D-01: Harden context freshness: put `--repo` in the documented `context` command (R-8 F-03); confine the fetch with `--refmap=`, no submodule recursion and no `FETCH_HEAD` write (F-02, F-12); check realpath containment for listed paths (F-01); and settle the edge cases F-04 to F-08, F-10, F-11 and F-13. From: drift re-review R-8. Verdict: pending.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-27 | R-1 | spec | `5841585` | claude-opus-5-5 | procedural | 5 should-fix, 4 nits; revision follows |
| 2026-11-27 | R-2 | spec | `5f5b05b` | claude-opus-5-5 | procedural | 3 should-fix, 5 nits; revision follows |
| 2026-11-27 | R-3 | spec | `ed52406` | claude-opus-5-5 | procedural | 1 blocking, 1 should-fix, 1 nit; revision follows |
| 2026-11-27 | R-4 | spec | `45cad2a` | claude-opus-5-5 | procedural | 2 nits, both in Context; applied outside the baseline |
| 2026-11-27 | R-4 | spec | `45cad2a` | n/a | n/a | accepted by owner |
| 2026-11-27 | R-5 | implementation | `8c79b67` | claude-opus-5-5 | procedural | All eight criteria met |
| 2026-11-27 | R-6 | spec | `9c0d567` | claude-opus-5-5 | procedural | Drift re-review after merging main: 1 nit in Context, applied outside the baseline |
| 2026-11-27 | R-7 | implementation | `9c0d567` | claude-opus-5-5 | procedural | All eight criteria met after merging main |
| 2026-11-28 | R-8 | spec | `9381c9a` | gpt-6.2-sol | procedural | Codex drift re-review: 5 blocking, 10 should-fix, 2 nits |
| 2026-11-28 | R-9 | implementation | `6fdd3ed` | gpt-6.2-sol | procedural | Codex: AC-05 and AC-08 met; six criteria not met on the R-8 edge cases, recorded as residuals in #206 |

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

### R-5

TARGET: 8c79b67757712adfb1dab3fd3eeb068b8f2da8b4

CRITERION: AC-01 In a clone whose listed instruction file and project procedure are behind origin's default branch tip and unchanged locally, `context` reports both as `stale`, and `git show` of each `read` value prints the tip's content.
VERDICT: met
EVIDENCE: `PATH=gnubin:$PATH bun test tests/vh-adlc/loop/context-freshness.test.ts tests/vh-adlc/loop/glossary.test.ts tests/vh-adlc/loop/plugin-version.test.ts --timeout 60000` at 8c79b67 on macOS: 33 pass, 0 fail; context-freshness.test.ts alone: 23 pass, 0 fail. The test "stale, current and edited files each report their state and the version to read" asserts AGENTS.md and agents/procedure.md as `stale` with `read` `<tip>:<path>`, and `git show` of each prints "rules v2" and "procedure v2". I read classify() in plugins/vh-adlc/scripts/loop/freshness.ts:68-74 and it matches the States table. Limitation: a local bare repository serves as origin, so no network remote was used.

CRITERION: AC-02 A listed file equal to the tip reports `current` with its path. A listed file the current branch changed since it left the tip, committed or uncommitted, reports `edited` with its path, even when the tip also differs.
VERDICT: met
EVIDENCE: Same run at 8c79b67, 23 pass, 0 fail in context-freshness.test.ts. The same test asserts a.md is `current` with `read` "a.md". b.md (edit committed) and c.md (edit not committed), both of which the tip also advanced, are `edited` with their paths. The order of `files` equals `read`. Limitation: local bare origin.

CRITERION: AC-03 When the local settings file is behind the tip, `freshness.settings` is `stale` and the reading list and lenses are the tip's, including a file the tip added that the clone lacks, which reports `stale`.
VERDICT: met
EVIDENCE: Same run at 8c79b67, all pass. "stale local settings take the reading list and lenses from the tip" asserts settings `stale` with read `<tip>:.vh-adlc/loop.yaml`, `read` ["AGENTS.md","e.md"], e.md `stale` with `<tip>:e.md` although the clone lacks it, and the tip's lens and lensText. "tip settings that fail to load" asserts the local list and a `schema_version` error. I checked the code path in contextReport, plugins/vh-adlc/scripts/loop/procedure.ts:16-29. Limitation: local bare origin.

CRITERION: AC-04 When the local settings are kept and the tip deleted a listed file the clone left unchanged, that file reports `removed` with a null `read`.
VERDICT: met
EVIDENCE: Same run at 8c79b67, all pass. In "a listed file the tip deleted reads as removed while this branch keeps its own settings", the clone commits an edit to its own settings, so they read as `edited` and are kept. Origin deletes d.md and drops it from its settings. The test asserts d.md as {state "removed", read null}. Limitation: local bare origin.

CRITERION: AC-05 Without a usable origin or tip (no remote, an unresolvable default branch, a failing fetch, a held ref lock, or no merge base with the tip), `context` exits 0, keeps the local reading list, reports every entry `unverified` with a reason naming the cause, and its other fields are unchanged.
VERDICT: met
EVIDENCE: Same run at 8c79b67, all pass. Five tests cover the five causes: no remote, a missing origin path with no origin/HEAD and no flag (reason names --default-branch), the same path with the flag (reason names a failed fetch), a held refs/remotes/origin/main.lock with origin ahead (failed fetch), and an orphan root commit that carries the settings and listed files (missing merge base). Each exits 0 and has a non-empty list in which every entry is `unverified` with read equal to its path. Each test also checks that settings are `unverified` and that read, lenses and lensText equal loopContext(loadLoopSettings(clone)). `plugin` still comes from the same pluginStatus call (procedure.ts:28), and plugin-version.test.ts passed in the same run. Limitation: the 30-second timeout path was not exercised. Inspection shows it falls into the same failed-fetch branch (freshness.ts:46-47).

CRITERION: AC-06 After `context` runs in a clone behind the tip, `HEAD`, the current branch, the index, the working tree and every ref except `refs/remotes/origin/<branch>` are unchanged.
VERDICT: met
EVIDENCE: Same run at 8c79b67, all pass. "only origin's tracking ref for the default branch moves" snapshots rev-parse HEAD, symbolic-ref HEAD, status --porcelain=v2 (with an untracked file present), write-tree and for-each-ref (symbolic refs compared by target) before and after, against an origin that holds a new tag. Only refs/remotes/origin/main differs, it now sits at origin's tip, and `git tag --list` is empty. The code fetches with `--no-tags` and the single explicit refspec `+refs/heads/<branch>:refs/remotes/origin/<branch>` (freshness.ts:46). Limitation: local bare origin.

CRITERION: AC-07 The seven SDD skills, the orchestrate skill, `references/loop.md` and `references/loop-settings.md` direct operations to pass the default branch to `context` and read each listed file at its reported version; `references/loop-settings.md` states that the conventions revision stays the one resolved from the checkout; and the loop glossary defines Instruction freshness.
VERDICT: met
EVIDENCE: Same run at 8c79b67, all pass. The pointer test passes for all eight SKILL.md files and references/loop.md. The rule test passes for the Instruction freshness section of references/loop-settings.md (the --default-branch, git show <read> and conventions sentences), and the must-pass and must-fail pattern tests pass. glossary.test.ts passes with the "Instruction freshness" row. I read the diff from merge base 2f12dfa: each of the nine pointers is the planned sentence, and loop-settings.md:146-175 holds the table and the three rule bullets. `bun test tests/vh-adlc/check.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/proportional-review.test.ts --timeout 60000` at 8c79b67 gave 115 pass, 0 fail, so the pinned skill bodies and phrases still hold.

CRITERION: AC-08 In a clone with no `origin/HEAD`, `context` reports a verified tip both with `--default-branch` and, through `git ls-remote`, without it.
VERDICT: met
EVIDENCE: Same run at 8c79b67, all pass. "a clone without origin/HEAD still verifies" deletes the ref with `git symbolic-ref --delete refs/remotes/origin/HEAD`, then runs `context` with `--default-branch main` and again with no flag. Both runs report `freshness.tip` equal to origin's tip, with no file entry and no settings entry `unverified`. The ls-remote fallback is at freshness.ts:38-43. Limitation: local bare origin. My extra scratch-repository probes (no settings anywhere, a tip that adds the settings file, an invalid branch name) were refused by the host's worktree sandbox and were not observed.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary, fifth paragraph)
EVIDENCE: The summary still says "Proof is planned, not yet observed: a new test file builds a bare origin and clones that fall behind ..." and ends with "Acceptance authorizes implementation on a feature branch." The document is now `status: complete`, all eight criteria are ticked with Evidence lines, and the Review Log has R-5 (implementation, `8c79b67`, "All eight criteria met"). conventions/feature-documents.md (Owner summary in Context) says the summary "must agree with them and distinguish planned checks from observed proof. Refresh it when scope, proof or decisions change". I ran `bun test tests/vh-adlc/loop/context-freshness.test.ts tests/vh-adlc/loop/glossary.test.ts tests/vh-adlc/loop/plugin-version.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/proportional-review.test.ts --timeout 60000` at 9c0d567 and got 70 pass, 0 fail, so the proof has been observed. The paragraph was true at R-4. It went stale when the implementation commits ticked the criteria and R-5 was stored. Nothing in the normative baseline is affected. The origin/main merge brought in pages.ts, review-route.ts and their tests, which do not touch freshness.ts, procedure.ts's contextReport or the read-rule lines. Plugin version 0.34.0 is still a minor bump over origin/main's 0.33.1. `vh-adlc lint` passes.
PROPOSAL: Rewrite the paragraph to say that the proof was observed in implementation review R-5 at `8c79b67`, with all eight criteria met, and keep the stated limitations: a local bare origin, and the 30-second timeout path not exercised.

### R-7

TARGET: 9c0d56732f3d2a050ece4e43af81d25b61796d5b

CRITERION: AC-01 In a clone whose listed instruction file and project procedure are behind origin's default branch tip and unchanged locally, `context` reports both as `stale`, and `git show` of each `read` value prints the tip's content.
VERDICT: met
EVIDENCE: `PATH=gnubin:$PATH bun test tests/vh-adlc/loop/context-freshness.test.ts --timeout 60000` at 9c0d567 on macOS: 23 pass, 0 fail. The test "stale, current and edited files each report their state and the version to read" asserts AGENTS.md and agents/procedure.md as `stale` with `read` `<tip>:<path>`, and `git show` of each prints "rules v2" and "procedure v2". I read classify() in plugins/vh-adlc/scripts/loop/freshness.ts and it matches the States table. The merge of origin/main since R-5 did not touch freshness.ts, procedure.ts, cli.ts or the test file (`git diff --stat 8c79b67 9c0d567`). Limitation: a local bare repository serves as origin, no network remote.

CRITERION: AC-02 A listed file equal to the tip reports `current` with its path. A listed file the current branch changed since it left the tip, committed or uncommitted, reports `edited` with its path, even when the tip also differs.
VERDICT: met
EVIDENCE: Same run at 9c0d567, 23 pass, 0 fail. The same test asserts a.md `current` with `read` "a.md", and b.md (edit committed) and c.md (edit not committed), both of which the tip also advanced, `edited` with their paths; the order of `files` equals `read`. Limitation: local bare origin.

CRITERION: AC-03 When the local settings file is behind the tip, `freshness.settings` is `stale` and the reading list and lenses are the tip's, including a file the tip added that the clone lacks, which reports `stale`.
VERDICT: met
EVIDENCE: Same run at 9c0d567, all pass. "stale local settings take the reading list and lenses from the tip" asserts settings {state "stale", read `<tip>:.vh-adlc/loop.yaml`}, `read` ["AGENTS.md","e.md"], e.md `stale` with `<tip>:e.md` although the clone lacks it, and the tip's lenses and lensText. "tip settings that fail to load" asserts the local list and a `schema_version` error. The fallback is contextReport in plugins/vh-adlc/scripts/loop/procedure.ts. Limitation: local bare origin.

CRITERION: AC-04 When the local settings are kept and the tip deleted a listed file the clone left unchanged, that file reports `removed` with a null `read`.
VERDICT: met
EVIDENCE: Same run at 9c0d567, all pass. "a listed file the tip deleted reads as removed while this branch keeps its own settings" commits a local settings edit (settings `edited`, kept), has origin delete d.md and drop it from its settings, and asserts d.md as {state "removed", read null}. Limitation: local bare origin.

CRITERION: AC-05 Without a usable origin or tip (no remote, an unresolvable default branch, a failing fetch, a held ref lock, or no merge base with the tip), `context` exits 0, keeps the local reading list, reports every entry `unverified` with a reason naming the cause, and its other fields are unchanged.
VERDICT: met
EVIDENCE: Same run at 9c0d567, all pass. Five tests, one per cause: no remote ("no origin remote"), a missing origin path with origin/HEAD deleted and no flag (reason names --default-branch), the same with `--default-branch main` (failed fetch), a held refs/remotes/origin/main.lock with origin advanced (failed fetch), and an orphan root commit carrying the settings and listed files (missing merge base). Each exits 0, has a non-empty `files` list with every entry {state "unverified", read = path}, settings `unverified`, and read, lenses and lensText equal loopContext(loadLoopSettings(clone)). `plugin` comes from the same pluginStatus call as before; tests/vh-adlc/loop/plugin-version.test.ts passed in a run of context-freshness, glossary, plugin-version, settings and lenses tests (61 pass, 1 fail; the one failure is the lens command-route stub test, which fails identically on an origin/main d3110dd export on this Mac). Limitation: the 30-second timeout is not exercised; by inspection it takes the same failed-fetch branch (freshness.ts, the `!fetch.ok` return).

CRITERION: AC-06 After `context` runs in a clone behind the tip, `HEAD`, the current branch, the index, the working tree and every ref except `refs/remotes/origin/<branch>` are unchanged.
VERDICT: met
EVIDENCE: Same run at 9c0d567, all pass. "only origin's tracking ref for the default branch moves" snapshots rev-parse HEAD, symbolic-ref HEAD, status --porcelain=v2 with an untracked file, write-tree and for-each-ref (symbolic refs by target) before and after against an origin holding a new tag; only refs/remotes/origin/main differs, now at origin's tip, and `git tag --list` is empty. The code fetches with `--no-tags` and the single refspec `+refs/heads/<branch>:refs/remotes/origin/<branch>` after `--`. Limitation: local bare origin.

CRITERION: AC-07 The seven SDD skills, the orchestrate skill, `references/loop.md` and `references/loop-settings.md` direct operations to pass the default branch to `context` and read each listed file at its reported version; `references/loop-settings.md` states that the conventions revision stays the one resolved from the checkout; and the loop glossary defines Instruction freshness.
VERDICT: met
EVIDENCE: Same run at 9c0d567, all pass: the pointer test for all eight SKILL.md files and references/loop.md, the rule test for the Instruction freshness section of references/loop-settings.md, the must-pass and must-fail pattern tests, and glossary.test.ts with the "Instruction freshness" row. I read `git diff origin/main HEAD` for the references and skills: each of the nine pointers is the planned sentence, and loop-settings.md holds the glossary row, the States table and the three rule bullets including the conventions sentence. `bun test tests/vh-adlc/check.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/proportional-review.test.ts --timeout 60000` at 9c0d567: 115 pass, 0 fail (plugin version 0.34.0 against origin/main 0.33.1).

CRITERION: AC-08 In a clone with no `origin/HEAD`, `context` reports a verified tip both with `--default-branch` and, through `git ls-remote`, without it.
VERDICT: met
EVIDENCE: Same run at 9c0d567, all pass. "a clone without origin/HEAD still verifies" runs `git symbolic-ref --delete refs/remotes/origin/HEAD`, then `context` with `--default-branch main` and with no flag; both report `freshness.tip` equal to origin's tip, with no file entry and no settings entry `unverified`. The ls-remote fallback is in fetchTip in freshness.ts. Limitation: local bare origin.

### R-8

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design (Settings file, States, Read rule); Acceptance Criteria AC-03 and AC-07; Test Plan rows AC-03 and AC-07
EVIDENCE: `settings.ts:85-90` checks that a listed path resolves inside the directory supplying the settings. For a tip-supplied list, that directory is a temporary archive. `procedure.ts:21-27` then passes the same paths to `freshness.ts:60-72`, which follows working-tree symlinks without checking containment. The read rule directs the operation to open the resulting local path. This can read files outside the checkout, across the boundary enforced by the existing settings reader.
PROPOSAL: Require checkout containment before hashing or returning any local path, including paths first supplied by tip settings. Keep the same boundary when the operation opens the file.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Context (Owner summary, fetch paragraph); Design (Default branch and fetch, Concurrency, failure, upgrade); Acceptance Criteria AC-06; Test Plan row AC-06
EVIDENCE: `--no-tags` does not confine ref updates to `refs/remotes/origin/<branch>`. In a scratch clone with an extra configured fetch destination for `main`, the reviewed `context` returned successfully and created `refs/heads/copied-main` as well as advancing `refs/remotes/origin/main`. The explicit refspec at `freshness.ts:46` still uses configured mappings. The AC-06 fixture checks a default clone and passes. [Git fetch documentation](https://git-scm.com/docs/git-fetch#Documentation/git-fetch.txt---refmapltrefspecgt)
PROPOSAL: Specify a fetch that ignores configured destination mappings and disables pruning and recursive submodule fetches. Extend AC-06 with a configured extra destination and assert that every other ref is preserved.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: Scope (`--default-branch` and read-rule bullets); Design (Default branch and fetch, Read rule); Acceptance Criteria AC-07; Test Plan row AC-07; Tasks T5 and T6
EVIDENCE: The exact command in the read rule and the AC-07 must-pass example omits `--repo`. After substituting `main`, running it against the reviewed CLI returned `{"status":"error","reason":"missing --repo"}`. `cli.ts:90-105` requires the flag before handling `context`. The AC-07 text check passes on the unusable command and rejects a command that includes `--repo` inside the required code span.
PROPOSAL: Put the complete invocation in the rule, pointers and must-pass example. Run the documented invocation in a behind-tip fixture and verify that the operation can open the reported versions.

FINDING: F-04
KIND: factual
SEVERITY: blocking
WHERE: Context (Owner summary and Background, Current state); Scope (tip settings); Design (Settings file, Output); Acceptance Criteria AC-03; Test Plan row AC-03
EVIDENCE: The design relies on `loadLoopSettingsAt`, which uses `git archive` at `settings.ts:246-255`. In a scratch clone where the tracked `.vh-adlc/loop.yaml` had `export-ignore`, `git show` returned valid tip settings listing the new instruction file. `context` reported the settings as `stale` with no error but returned `read: []`. The operation silently skipped every instruction. [Git archive documentation](https://git-scm.com/docs/git-archive#_attributes)
PROPOSAL: Read and validate settings against the committed tree independently of archive attributes. Add an AC-03 fixture with `export-ignore` on the settings file and verify the reported list and lenses.

FINDING: F-05
KIND: factual
SEVERITY: blocking
WHERE: Frontmatter `goal`; Context (Owner summary); Design (States, Settings file, Read rule); Acceptance Criteria AC-01, AC-03 and AC-07; Test Plan rows AC-01/AC-02, AC-03 and AC-07
EVIDENCE: The existing settings reader accepts symlinks to files inside the repository. In a scratch clone where the tip replaced a listed Markdown file with an in-repository symlink, `context` reported `stale` and `git show` of its `read` value printed the link target's name. The prescribed read therefore cannot return the instruction content for a file the settings reader accepts.
PROPOSAL: Specify how a tip read resolves supported in-repository symlinks to instruction content. Add a fixture that checks the content returned for a listed path whose type changes at the tip.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter `goal`; Context (Owner summary); Scope (default branch flag); Design (Default branch and fetch, Read rule); Acceptance Criteria AC-08; Test Plan row AC-08
EVIDENCE: The no-flag design treats an existing `origin/HEAD` as authoritative. In a scratch clone where origin changed its default from `main` to `next` and kept `main`, `git ls-remote --symref origin HEAD` named `next`, while `context` reported `main` and marked the old instruction `current`. AC-08 removes the cached symbolic ref, so it cannot catch this case.
PROPOSAL: Define how no-flag calls verify the current remote default when a cached symbolic ref exists. Add a case where the old default branch still exists after the switch.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Frontmatter `goal`; Context (Owner summary); Scope (tip settings); Design (Settings file, Output); Acceptance Criteria AC-03 and AC-04; Test Plan rows AC-03 and AC-04
EVIDENCE: The settings design keeps the local list and lenses for `removed` settings. In a scratch clone where origin deleted `.vh-adlc/loop.yaml` and the clone left it untouched, `context` reported `settings.state: "removed"` but still listed the old rule. AC-04 deletes a listed file while retaining edited settings and never checks the effect of deleting the settings file itself.
PROPOSAL: Define the effective list and lenses when the tip deliberately removes unchanged local settings. Test that case separately from a branch retaining its own edited settings.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Context (Owner summary and Background, Current state); Design (Default branch and fetch, States, Settings file); Acceptance Criteria AC-01, AC-03 and AC-05; Test Plan rows AC-01/AC-02, AC-03 and AC-05
EVIDENCE: `cli.ts:99-105` validates the local settings and every listed file before it fetches. In a scratch clone with a missing local instruction file and a valid copy at the tip, `context` stopped with `instruction_files[0] must reference a file`. A sparse checkout can hit the same path even though the tip has valid settings and content.
PROPOSAL: Specify how `context` distinguishes an unavailable local copy from invalid settings. Add a case with a valid tip and a listed file outside the checkout's sparse paths.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Context (Owner summary, settings and fallback paragraphs); Design (Settings file, Output, Read rule); Acceptance Criteria AC-03 and AC-07; Test Plan rows AC-03 and AC-07
EVIDENCE: The settings section says `freshness.settings` tells operations which settings supplied the list. On a tip load failure, `procedure.ts:21-27` keeps the local list but leaves `settings.read` pointing to the tip. The read rule requires a report notice only for `unverified`. A load failure can therefore send an operation back to the stale list without the owner-facing notice promised for an unverified result. The fallback test checks the JSON error only.
PROPOSAL: Make the report identify the settings source actually used. Require the operation to report the fallback reason when tip settings cannot be loaded.

FINDING: F-10
KIND: factual
SEVERITY: should-fix
WHERE: Context (Owner summary, settings paragraph); Design (Settings file, Output, Concurrency, failure, upgrade); Acceptance Criteria AC-03; Test Plan row AC-03
EVIDENCE: The upgrade section says an old operation can ignore `freshness` and behave as before. AC-03 expressly adds a path that is absent locally to the existing `read` array. An old operation following the former local-path rule will try to open that missing file. The new field is additive, but the contents of the old field have changed.
PROPOSAL: Preserve the old field's local-path contract or version the change and document which callers must upgrade together. Exercise an old consumer against output containing a tip-only path.

FINDING: F-11
KIND: judgement
SEVERITY: should-fix
WHERE: Context (Owner summary and Background, review policy); Scope (tip lenses and review prompt); Design (Settings file, Output, Read rule); Acceptance Criteria AC-03 and AC-07; Test Plan rows AC-03 and AC-07; Open Questions
EVIDENCE: The spec skill tells the caller to pass the lenses declared by `context`. The command route instead builds its prompt with `loopContext(policy)` from the reviewed commit at `cli.ts:181-195`. If the tip and reviewed commit disagree, a host dispatch following the skill and a command dispatch can apply different checks or severities to the same commit. AC-03 proves which lenses `context` prints and leaves dispatch precedence open.
PROPOSAL: Set one precedence rule for the instruction list and lenses used by both review routes. If the reviewed commit governs review policy, state which operations use the tip list and test both dispatch paths when the snapshots differ.

FINDING: F-12
KIND: factual
SEVERITY: should-fix
WHERE: Context (Owner summary, fetch paragraph); Design (Default branch and fetch, Concurrency, failure, upgrade); Acceptance Criteria AC-06; Test Plan row AC-06
EVIDENCE: In a scratch clone, `context` overwrote the previous `FETCH_HEAD` with the new tip. Another operation in the same worktree can lose the fetch result it was about to use. The AC-06 snapshot excludes `FETCH_HEAD`, and the design's claim that an interrupted fetch always leaves the old tracking ref goes beyond what a timeout establishes once Git has started committing updates. [Git fetch documentation](https://git-scm.com/docs/git-fetch#Documentation/git-fetch.txt---no-write-fetch-head)
PROPOSAL: Preserve `FETCH_HEAD` and include it in the fixture. Describe the interruption guarantee in terms of the ref state Git actually leaves behind and the command's `unverified` result.

FINDING: F-13
KIND: factual
SEVERITY: should-fix
WHERE: Context (Owner summary, timeout limitation); Design (Default branch and fetch, Concurrency, failure, upgrade); Acceptance Criteria AC-05; Test Plan row AC-05; Tasks T3 and T4
EVIDENCE: Every AC-05 fixture returns promptly without making Git wait. The test plan would pass if both timeout arguments were removed. Sharing the failed-fetch branch establishes how a failure is handled after Git returns and supplies no evidence that either network call returns on time.
PROPOSAL: Add a controlled stall for each network phase. Assert a bounded return, the applicable reason and preservation of the local reading list.

FINDING: F-14
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter `covers`; Scope (minor version bump); Design (Concurrency, failure, upgrade); Tasks T7
EVIDENCE: T7 records that `plugins/vh-adlc/.claude-plugin/plugin.json` was bumped but excludes it from `covers`. `tests/vh-adlc/check.test.ts:170-187,226-232` checks the two manifests and uses the Claude manifest for the package version gate. A change to that manifest can break the documented rollout or rollback contract without making the review stale.
PROPOSAL: Cover both plugin manifests and include their agreement in the version bump's done condition.

FINDING: F-15
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan row AC-05; Tasks T2, T3 and T4
EVIDENCE: T3 says the five AC-05 tests are failing tests, but its recorded run says all five passed because T2 already implemented the behavior. The task sequence therefore omits the demonstration required by `conventions/testing.md` that each regression check fails against its defect.
PROPOSAL: Run the AC-05 checks against versions that lack the corresponding behavior and record the observed failures. Update the task evidence to reflect the order in which the work actually happened.

FINDING: F-16
KIND: factual
SEVERITY: nit
WHERE: Test Plan row AC-07
EVIDENCE: The pointer check at `tests/vh-adlc/loop/context-freshness.test.ts:138-142` looks only for the command and reference in the same sentence. A sentence containing both can still tell the operation to ignore the reported versions. I compared the row with the clean R-4 target and confirmed its text is unchanged. This finding only widens the set of wrong outputs the reviewed pattern rejects.
PROPOSAL: Add a must-fail example where the command and reference appear together but the sentence tells the operation to read the checkout copies.

FINDING: F-17
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary and Background, final Current state bullet)
EVIDENCE: Since R-6, the repository has added `.vh-adlc/loop.yaml` with two reviewer command routes. The empty reading list is still accurate, but the explanation that the repository declares no loop settings is stale. The summary also stops at R-5 even though R-7 records the later implementation review after merging main. The focused tests against a writable scratch copy of the reviewed export reported 33 passed and zero failed.
PROPOSAL: Say that this repository configures review routes and declares no instruction files, project procedure or lenses. Bring the summary's review history through R-7 and keep the local-origin and timeout limitations.

### R-9

CRITERION: AC-01 In a clone whose listed instruction file and project procedure are behind origin's default branch tip and unchanged locally, `context` reports both as `stale`, and `git show` of each `read` value prints the tip's content.
VERDICT: not met
EVIDENCE: Ran `context` at `6fdd3edf` against a local bare origin that updated the project procedure and replaced the listed instruction file with an in-repository symlink. Both entries reported `stale`. `git show` printed the updated procedure and the symlink target's name, `actual-rules.md`. The updated instruction content was `rules v2`.

CRITERION: AC-02 A listed file equal to the tip reports `current` with its path. A listed file the current branch changed since it left the tip, committed or uncommitted, reports `edited` with its path, even when the tip also differs.
VERDICT: not met
EVIDENCE: The regular-file test passed at `6fdd3edf`, including committed and uncommitted edits. In a separate fixture, `git ls-tree` showed the same symlink entry at `HEAD` and the tip, and the target contents matched. `context` reported that unchanged listed file as `edited`.

CRITERION: AC-03 When the local settings file is behind the tip, `freshness.settings` is `stale` and the reading list and lenses are the tip's, including a file the tip added that the clone lacks, which reports `stale`.
VERDICT: not met
EVIDENCE: Ran `context` at `6fdd3edf` with `export-ignore` on the tip's `.vh-adlc/loop.yaml`. `git show` confirmed that the committed settings listed a new rule file and a lens. `context` reported `settings.state: "stale"` with no error and returned empty `read` and `lenses` arrays. The ordinary tip-settings fixture passed.

CRITERION: AC-04 When the local settings are kept and the tip deleted a listed file the clone left unchanged, that file reports `removed` with a null `read`.
VERDICT: not met
EVIDENCE: Ran `context` at `6fdd3edf` in a clone that kept its own settings. The tip deleted `rules.md` and added `rules.md/notes.txt`. Git reported the deletion, and `git cat-file -t` identified the tip path as a tree. `context` returned `stale` with `<tip>:rules.md`. The deletion fixture without a replacement directory passed.

CRITERION: AC-05 Without a usable origin or tip (no remote, an unresolvable default branch, a failing fetch, a held ref lock, or no merge base with the tip), `context` exits 0, keeps the local reading list, reports every entry `unverified` with a reason naming the cause, and its other fields are unchanged.
VERDICT: met
EVIDENCE: At `6fdd3edf`, all five cases passed in `context-freshness.test.ts`, including the comparisons against the local list, lenses and lens text. `plugin-version.test.ts` passed, and a separate failed-fetch run returned the same `plugin` object as a verified run. Controlled stalls in branch discovery and fetch each returned in about 30 seconds with exit 0, local reads and an applicable reason. The origins were local and the stalls used a local SSH shim.

CRITERION: AC-06 After `context` runs in a clone behind the tip, `HEAD`, the current branch, the index, the working tree and every ref except `refs/remotes/origin/<branch>` are unchanged.
VERDICT: not met
EVIDENCE: The ordinary clone and new-tag fixture passed at `6fdd3edf`. In a separate behind-tip clone with a second configured tracking destination for `main`, `context` exited 0 and advanced `refs/remotes/origin/main`, but also created `refs/remotes/origin/mirrored-main`.

CRITERION: AC-07 The seven SDD skills, the orchestrate skill, `references/loop.md` and `references/loop-settings.md` direct operations to pass the default branch to `context` and read each listed file at its reported version; `references/loop-settings.md` states that the conventions revision stays the one resolved from the checkout; and the loop glossary defines Instruction freshness.
VERDICT: not met
EVIDENCE: Inspected all eight skills and both references at `6fdd3edf`. The text and glossary checks passed. Running the command shown in the skills and `references/loop.md` with `main` substituted exited 2 with `missing --repo`. Adding `--repo` and the fixture checkout made the same command return the verified tip and a stale file's revision.

CRITERION: AC-08 In a clone with no `origin/HEAD`, `context` reports a verified tip both with `--default-branch` and, through `git ls-remote`, without it.
VERDICT: met
EVIDENCE: The no-`origin/HEAD` test passed at `6fdd3edf`. In a separate local bare-origin fixture, I advanced origin before each invocation and verified that neither tip was already in the clone's tracking ref. Both the explicit-branch invocation and the `git ls-remote` fallback returned the new tip and classified the unchanged local instruction as `stale`.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Scope (D-01), Design (Read rule), AC-07, Test Plan row AC-07
EVIDENCE: D-01 says to “put `--repo` in the documented `context` command”. `cli.ts:90-105` requires that argument before producing a reading list. The prescribed command fails, and the test pattern accepts the incomplete invocation.
PROPOSAL: Give the complete command in the skills and references. Run that exact command in the proof and open a reported tip version.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Scope (D-01), Design (Default branch and fetch), AC-06, Test Plan row AC-06
EVIDENCE: D-01 says to “confine the fetch with `--refmap=`”. The fetch at `freshness.ts:46` supplies a destination refspec and still applies configured mappings. The second tracking ref created in the AC-06 probe contradicts the accepted ref-preservation criterion.
PROPOSAL: Isolate the fetch from configured destination mappings and verify preservation with an extra mapping in the fixture.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: Scope (D-01), Design (Settings file, Read rule), `procedure.ts:21-27`, `freshness.ts:60-72`
EVIDENCE: D-01 defers “check realpath containment for listed paths”. Code inspection shows that `settings.ts:85-90` checks containment in the archived tip, while `contextReport` then classifies those paths against the working tree. The local classifier follows symlinks and can return a path that the read rule opens outside the checkout.
PROPOSAL: Enforce checkout containment before hashing a local candidate and at the point where the operation opens it.

FINDING: F-04
KIND: factual
SEVERITY: blocking
WHERE: Scope (D-01), Design (Settings file), AC-03, Test Plan row AC-03
EVIDENCE: D-01 says to “settle the edge cases F-04 to F-08”. `settings.ts:246-255` loads from `git archive`. The AC-03 probe showed that archive attributes can omit valid tracked settings and cause the operation to drop the tip's reading list and lenses without an error.
PROPOSAL: Load and validate settings against the committed tree independently of archive export attributes.

FINDING: F-05
KIND: factual
SEVERITY: blocking
WHERE: Scope (D-01), Design (States, Read rule), AC-01, AC-02, Test Plan row AC-01 and AC-02
EVIDENCE: D-01 says to “settle the edge cases F-04 to F-08”. The settings reader accepts in-repository symlinks. `freshness.ts:55-72` compares the working-tree target's content hash with the committed link blob and uses the link blob as a stale read. The two probes showed both a wrong state and a read that supplies no instruction content.
PROPOSAL: Resolve supported in-repository links consistently for the working tree and committed snapshots. Verify the returned state and the content an operation opens.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design (States), AC-04, Test Plan row AC-04
EVIDENCE: `freshness.ts:55-57` accepts any object ID at the listed path. After Git deletes the file and puts a directory at that path, the tree object is treated as a replacement instruction file.
PROPOSAL: Check the committed entry's type before classifying it as readable. Add a removal case where the old path becomes a directory.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Design (Settings file), `references/loop-settings.md` (Instruction freshness), Test Plan row AC-03
EVIDENCE: In the invalid-tip-settings probe, `context` returned the local list and `old-lens` while `freshness.settings.read` pointed to the invalid tip settings. The reference says that field identifies the settings that supplied the list. The report rule requires a notice only for `unverified`, so this fallback has no required notice.
PROPOSAL: Identify the settings source actually used and require the operation to report the fallback reason.
