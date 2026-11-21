---
status: in-progress
status_description: "Implementing on feat/stage-scoped-rungs."
issue: null
branch: feat/stage-scoped-rungs
goal: "Each task's verification runs only the rungs declared for the task stage, while push, completion and delivery still require every applicable rung."
covers:
  - plugins/vh-adlc/scripts/loop/rungs.ts
  - plugins/vh-adlc/scripts/loop/settings.ts
  - plugins/vh-adlc/scripts/loop/cli.ts
  - plugins/vh-adlc/references/loop-settings.md
  - plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/user-guides/workflows.md
  - tests/vh-adlc/loop/
  - tests/vh-adlc/direct-operation-compatibility.test.ts
---

# Plan: Stage-scoped verification rungs

A verification rung can say whether it runs at every task or only when the feature is pushed, completed
or delivered. Expensive checks then run once per feature instead of once per task.

## Context

### Owner summary

Today every applicable verification rung runs at every task. An adopter whose rungs include a
90-minute integration suite, a Kubernetes end-to-end run or a browser pass pays that cost for each
task, and several sessions on one host multiply it until the machine is overloaded.

This feature adds an optional `stages` list to each rung in `.vh-adlc/loop.yaml`. A rung without it
is selected exactly as today. A rung with `stages: [completion]` is skipped at the task verification step
and still required before push, completion and delivery. The `rungs` command gains a `--stage task |
completion` flag. Without the flag it behaves as the completion stage, so a caller that forgets it never
checks less than today. The rule that a result recorded at another commit does not count is unchanged
for the commits ship pushes and delivers, except for the document-only completion commit ship pushes after
its Verify run.

Implement runs `--stage task` at each task. Ship runs `--stage completion` once, at its Verify step, just
before it commits the `complete` status update; in that same ship run it then pushes the completion commit
without a second run, because the commit changes only the feature document. A retried or resumed push runs
the completion stage again first. After the merge, ship runs the completion stage
at the merge commit, as today. Each stage performs its own written-procedure rungs, such as a browser
pass, and records their results with `--record`: implement those of the task stage at each task, ship every
applicable one at completion and after the merge. No procedure says this today, so a procedure rung
currently blocks every run. When any applicable rung skips the task
stage, implement's Finish step does not set `complete`; it reports those rungs and the next step
`vh-adlc next` returns, and ship completes the feature. A blocked completion run is handled exactly like
any failed check in ship today: ship pushes nothing, sets no status, and follows its existing rules for a
failed verification. All new procedure text goes into each
skill's Loop routes section as overrides, so the owner-approved operation bodies stay unchanged. Rungs
without `stages` keep today's selection and verdict; the implement and ship procedure changes (the
Verify-step run, the completion-commit exemption and recorded procedure rungs) apply to every adopter with
declared rungs.

Out of scope: per-rung stages beyond `task` and `completion` (such as separating push from delivery),
caching rung results between invocations, and any change to how the implementation reviewer works. The
review operation does not call the `rungs` command today and stays unchanged.

Compatibility: an older plugin refuses a settings file that uses `stages`, because rung keys are
checked strictly. Adopters update the plugin before adding the field. Removing the field restores today's
rung selection; rolling back the procedure changes needs the previous plugin version.

Planned checks: unit tests for settings validation, CLI tests for rung selection that prove a
completion-only rung is not executed at the task stage and blocks at the completion stage, and procedure
and reference text checks. None has run yet. The owner chose a `stages` list, a completion default for the
flag, completion left to ship, one completion run before the document-only completion commit, a cheap
`deferred` lookup for Finish that keeps today's exit 3, each stage recording its own procedure rungs, exact
command checks for implement and ship, the next minor plugin version above main at implementation time
(its mention in the reference checked once, not by a permanent test), and the document-only exemption
holding only within the ship run that observed the pass, automated checks limited to exact command strings
with the rest judged by the implementation reviewer, procedure text placed in the Loop routes sections, and
no new route for a blocked completion run beyond ship's existing failed-check rules. Reviews R-1 to R-7 found
should-fix issues, nits and, in R-4, one blocking proof flaw, all applied. R-8 was clean with two nits, and
the owner accepted it; R-9, a re-review after default-branch drift, was clean with one nit. Acceptance
authorizes implementing this document on a feature branch and opening one PR with that version bump;
merging stays with the owner.

### Background

- A rung has only a path condition: the `Rung` type is `{ name, when, command?, procedure?,
  skipped_pattern?, timeout_minutes? }` (`plugins/vh-adlc/scripts/loop/rungs.ts:8`), and
  `applicableRungs` filters by `when` alone (`plugins/vh-adlc/scripts/loop/rungs.ts:35`).
- Settings validation accepts exactly the keys `name, when, command, procedure, skipped_pattern,
  timeout_minutes` and refuses others (`plugins/vh-adlc/scripts/loop/settings.ts:113`).
- The reference defines a rung as a check "which must pass before push, completion and delivery"
  (`plugins/vh-adlc/references/loop-settings.md:15`) and documents only the `when` condition
  (`plugins/vh-adlc/references/loop-settings.md:49`).
- Implement runs `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --run true` at each
  task's verification step, and a task is not ticked unless every applicable rung passed
  (`plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:49-51`). Its Finish step sets `complete` after
  `vh-adlc gate complete` without running rungs (`plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:129-131`).
- Ship runs the same command before pushing, and with `--merge <merge commit>` after the merge
  (`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:51-55`). Its order is Doc impact, Verify, then Gate, which
  commits the completion update, then Push (`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:72-83`,
  `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:95`), so the pushed commit is the completion commit, not
  the verified one.
- Without `--run true` the command reports no results (`plugins/vh-adlc/scripts/loop/cli.ts:145`).
- A written-procedure rung counts only through `--record`, given by the operation that performed it
  (`plugins/vh-adlc/references/loop-settings.md:64-66`), and `grep -rn -- "--record" plugins/vh-adlc/skills`
  prints nothing: no procedure tells an operation to pass one.
- The `rungs` command reads `--base` or `--merge` (`plugins/vh-adlc/scripts/loop/cli.ts:122`), checks
  results against `HEAD` or the merge commit (`plugins/vh-adlc/scripts/loop/cli.ts:140`) and lists a rung
  whose path condition does not hold as not run (`plugins/vh-adlc/scripts/loop/cli.ts:147`).
  `mayAdvance` blocks any result whose commit differs from the head
  (`plugins/vh-adlc/scripts/loop/rungs.ts:76`).
- `grep -rn rungs` over the review and resume skills and `references/review-protocol.md` prints nothing:
  only implement and ship call the command.
- The binary reads the YAML generically; no Go file names `verification_rungs`
  (`grep -rln verification_rungs internal cmd` prints nothing), so validation lives in `settings.ts` only.

## Scope

In scope:

- An optional `verification_rungs[].stages` field, validated by `settings.ts`.
- A `--stage task|completion` flag on `cli.ts rungs`, its selection, report and verdict.
- The implement and ship procedures, as overrides in each skill's Loop routes section, the loop settings
  reference and the workflows user guide.
- Tests for each of the above, and a bump of both plugin manifests to the next minor version above the
  default branch's at implementation time (0.29.0 if nothing else lands first).

Out of scope:

- Stages other than `task` and `completion`, such as a separate push or delivery stage.
- Storing rung results between invocations so a later stage can reuse them.
- Any change to the implementation review, the resume operation or the `vh-adlc` binary.
- Any adopter's settings file; adopters change their own `.vh-adlc/loop.yaml` after release.

## Design

### Settings

`verification_rungs[].stages` is optional. It is a non-empty list whose items are `task` or
`completion`, with no duplicates, and it must contain `completion`, because every declared rung gates push,
completion and delivery. A rung without the field is treated as `[task, completion]`. The parsed `Rung`
always carries the resolved list, so callers never handle a missing value. A violation fails with
`invalid loop settings: verification_rungs[<i>].stages`, the same message shape the other rung fields use
(`plugins/vh-adlc/scripts/loop/settings.ts:110-138`). `stages` is added to the accepted rung keys.

### Selection

`applicableRungs(settings, paths, stage)` keeps today's path filter and, for stage `task`, also drops a
rung whose `stages` does not include `task`. For stage `completion` it keeps every rung that passes the path
filter, whatever its `stages`. The stage parameter is required in the function signature so no internal
caller selects by accident.

### Command

`cli.ts rungs` accepts `--stage task` or `--stage completion`. Without the flag the stage is `completion`.
Any other value, or `--stage task` together with `--merge`, prints `{status: "error", reason}` and
exits 2, like other argument errors (`plugins/vh-adlc/scripts/loop/cli.ts:175-178`); delivery is a
completion-stage check by definition.

The output gains `stage` and `deferred`. `deferred` lists, in declaration order, the rungs whose path
condition holds but whose `stages` lacks `task`, when the stage is `task`; it is empty at stage
`completion`. It is reported whether or not `--run true` is given, so a caller can learn it without running
any check. At stage `task` with `--run true`, each deferred rung is reported `not run` with the reason
`it runs at the completion stage only`, is never executed, and takes no part in the verdict, the same way an
inapplicable path rung is treated today. A `--record` for a deferred rung is ignored at stage `task`.
Without `--run true`, the verdict keeps today's shape for the stage's own rungs: with rungs declared,
`advance` is false, `blocking` lists the applicable rungs of that stage (deferred rungs excluded) and the
command exits 3; with none declared, `advance` is true and it exits 0.
`mayAdvance` and its commit rule do not change.

Settings without any `stages` field produce, at either stage, the same applicable list, results and verdict
as today, apart from the added `stage` and `deferred` keys.

### The completion commit

Every applicable rung must pass at the commit being pushed or delivered, with one exemption: ship's
completion commit. Setting `complete` is gated separately and as today: ship sets it only after its Verify
run may advance, and implement's Finish sets it only when no rung was deferred, every rung having passed at
its task commits; either way a push still goes through ship's completion run. The reference states the rule
for pushed and delivered commits, not for every commit that sets `complete`. Ship runs the completion stage at its Verify step, at commit V. Its Gate step then
commits the `complete` status update as commit C, staging only the feature document, and ship pushes C
without a second run when `git diff --name-only V C` lists only that document and the push happens in the
same ship run that observed the completion stage advance at V. If C changes anything else, another commit
follows V, or the push is retried or resumed in a later run (after an interruption or a rejected push),
ship runs the completion stage again at the head before pushing, because results are never stored between
runs. The reference states this exemption next to the commit rule. A delivery check after the merge has no exemption:
it runs at the merge commit, as today.

### Procedures

All of this text goes into the Loop routes section of `vh-adlc-implement` and `vh-adlc-ship`, written as
overrides of the steps it changes, the pattern those sections already use ("these instructions replace
Enter steps 1 and 6", `plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:57`). The operation bodies stay
byte-identical, so `tests/vh-adlc/direct-operation-compatibility.test.ts`, which compares each body with its
owner-approved baseline and strips only Loop routes and a few named sections, keeps passing without moving a
baseline.

- Implement, per task: perform each applicable task-stage written-procedure rung, then run
  `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage task --run true`, passing
  each performed procedure rung's result with `--record`. A task is not ticked unless every task-stage rung
  passed at its commit. No stage-less `rungs ... --run true` command remains in the implement procedure.
- Implement, Finish: run `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage task`
  without `--run`. Finish reads only `deferred` from it and does not treat its exit 3 or its verdict as a
  check failure. When `deferred` is non-empty, implement does not run `vh-adlc gate complete` or set
  `complete`; it reports the deferred rungs, says the completion stage runs in ship, and reports the step
  `vh-adlc next` returns. With an empty `deferred`, Finish is unchanged.
- Ship, Verify: perform every applicable written-procedure rung, then run
  `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage completion --run true`,
  passing each performed procedure rung's result with `--record`. Ship sets `complete` and pushes only when
  that run may advance, under the completion-commit exemption above. This replaces the skill's opening rule
  that ship runs the rungs "before pushing" and pushes only when they "may advance at HEAD"; no stage-less
  `rungs --repo <dir> --base <default branch> --run true` command and no `may advance at HEAD` remain in the
  ship procedure.
- Ship, after the merge: from a checkout of the merge commit, perform every applicable written-procedure
  rung again and run `--merge <merge commit> --stage completion --run true` with their `--record` results.

### Concurrency, failure and upgrade

The command reads settings and runs checks; it writes no shared state, so concurrent invocations behave as
today. A rung that times out or cannot run blocks its stage exactly as today. If the completion run blocks,
ship pushes nothing and sets no status, and the failure is handled by ship's existing rules for a failed
verification in its operation body (`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:72-83`), which this
feature does not change: a covered fix in the same run with a fresh implementation review, or a report that
names the blocking rungs and stops. This feature adds no route of its own for that case. Upgrade: a plugin older than
the release that ships this feature refuses settings that use `stages` (strict key check), so the reference
names that release as the minimum plugin version. The comments in `plugins/vh-adlc/scripts/loop/rungs.ts`
that restate the commit rule and the `rungs` usage comment in `plugins/vh-adlc/scripts/loop/cli.ts` are
updated to match the reference and the `--stage` flag. Removing the field restores today's rung selection;
rolling back the procedure changes needs the previous plugin version.

## Acceptance Criteria

- [ ] AC-01: A rung may declare `stages`; settings with an unknown stage value, an empty list, a duplicate
      value or a list without `completion` are refused with a message naming
      `verification_rungs[<i>].stages`, and a rung without the field resolves to both stages.
- [ ] AC-02: `cli.ts rungs --stage task --run true` executes only the applicable rungs whose stages include
      `task`; a completion-only rung is not executed, is reported `not run` with a reason naming the
      completion stage, is listed in `deferred`, and does not block the verdict. Without `--run`, the same
      command reports the same `deferred`, executes nothing, exits 3 with `advance` false, and lists in
      `blocking` only the task-stage rungs.
- [ ] AC-03: `cli.ts rungs --stage completion --run true`, and the same command without `--stage`,
      execute every applicable rung whatever its stages, and a failing completion-only rung blocks with exit
      3 and is named in `blocking`.
- [ ] AC-04: `--stage` with a value other than `task` or `completion`, or `--stage task` together with
      `--merge`, exits 2 with an error reason and runs no rung.
- [ ] AC-05: For settings without any `stages` field, the `rungs` output at stage `task` and at stage
      `completion` has the same `applicable`, `results`, `advance` and `blocking` as the plugin produced
      before this feature.
- [ ] AC-06: The Loop routes section of the implement skill contains the per-task command
      `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage task --run true` and the
      Finish lookup `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage task` with no
      `--run`; the ship skill's Loop routes section contains
      `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage completion --run true` and
      `--merge <merge commit> --stage completion --run true`; neither skill contains the stage-less
      `rungs --repo <dir> --base <default branch> --run true`; and both operation bodies still match their
      owner-approved baselines.
- [ ] AC-07: The loop settings reference documents `verification_rungs[].stages`, its default, the
      `completion` requirement, the `--stage` flag with its default, `deferred`, the commit rule for pushed
      and delivered commits with its completion-commit exemption, and, as the minimum plugin version, the version both manifests carry; the workflows guide
      says rungs can be limited to the completion stage.
- [ ] AC-08: Both vh-adlc plugin manifests carry the same version, a minor version above the default
      branch's at implementation time.
- [ ] AC-09: The Loop routes sections say, in the implement skill, that each task performs its task-stage
      procedure rungs and passes them with `--record`, and that Finish reads only `deferred`, does not treat
      the lookup's exit 3 as a failure, and with a non-empty `deferred` does not set `complete` but reports
      the deferred rungs and the step `vh-adlc next` returns; and, in the ship skill, that ship performs every
      applicable procedure rung with `--record`, replaces the "before pushing ... may advance at HEAD" rule
      with the Verify-step run, pushes the document-only completion commit without a second run only within
      the same ship run, reruns the completion stage before a retried or resumed push, and pushes nothing
      and sets no status after a blocked completion run; and that implement's Finish runs its lookup without
      `--run`.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc/loop/rungs.test.ts`: new cases load settings with `stages: [bogus]`, `[]`, `[completion, completion]` and `[task]`, each expecting the error to name `verification_rungs[0].stages`, and a rung without the field whose parsed `stages` equals `["task", "completion"]`. |
| AC-02 | `bun test tests/vh-adlc/loop/cli.test.ts`: a new fixture with a task rung (`true`) and a completion-only rung whose command writes a marker file and exits 1; `--stage task --run true` exits 0, the marker file does not exist, the completion-only rung's result is `not run` with a reason containing `completion stage`, and `deferred` equals its name; `--stage task` without `--run` exits 3, reports the same `deferred`, `advance` false, `blocking` equal to the task rung's name alone, and the marker file still does not exist. |
| AC-03 | `bun test tests/vh-adlc/loop/cli.test.ts`: the same fixture with `--stage completion --run true` and with no `--stage` each exits 3, the marker file exists, and `blocking` contains the completion-only rung. |
| AC-04 | `bun test tests/vh-adlc/loop/cli.test.ts`: `--stage push --run true` and `--stage task --merge <sha> --run true` each exit 2 with `status: "error"`, and a rung command that writes a marker file has not run. |
| AC-05 | `bun test tests/vh-adlc/loop/cli.test.ts`: a new fixture with the three rungs of `tests/vh-adlc/loop/rungs.test.ts` (`verify` always, `integration` on `backend/**`, `kind` on `e2e/**`) and a feature that changes `backend/`; at `--stage task` and at `--stage completion` the output has `applicable` equal to the literal `["verify", "integration"]`, `results` equal to literal name, state and reason triples (`verify` passed `exit 0`, `integration` passed `exit 0`, `kind` not run with the path-condition reason), `advance` true and `blocking` `[]`, values written down from the plugin before this feature. |
| AC-06 | `bun test tests/vh-adlc/direct-operation-compatibility.test.ts`: the existing "direct %s keeps its approved operation body" cases pass with unchanged baselines; new checks match literal strings in the Loop routes sections. Implement must contain `` `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage task --run true` `` and `` `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage task` `` (closing backtick included). Must pass: "run `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage task` without `--run`". Must fail as the lookup: "run `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage task --run true`". Ship must contain `` `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage completion --run true` `` and `--merge <merge commit> --stage completion --run true`. Neither skill may contain `rungs --repo <dir> --base <default branch> --run true`. Must pass (absent): "`... --base <default branch> --stage task --run true`". Must fail: today's "`bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --run true`". |
| AC-07 | `bun test tests/vh-adlc/direct-operation-compatibility.test.ts`: `references/loop-settings.md` contains a line starting with `` | `verification_rungs[].stages` | `` (must pass: that table row; must fail: a prose mention of `stages` without the row) and contains `--stage`. Then the written procedure: the implementation reviewer reads the reference and `docs/user-guides/workflows.md` and confirms each item AC-07 lists is stated, including the minimum version checked in the AC-08 row. |
| AC-08 | `bun test tests/vh-adlc/check.test.ts`: the existing "portable and Claude metadata describe one shared package" check proves the two manifests are equal and the existing "a package change comes with a version change" check proves the version differs from `origin/main`; then the written procedure: compare `version` in `git show origin/main:plugins/vh-adlc/.claude-plugin/plugin.json` with the branch's, and pass only when the branch's has the minor component one above and the patch at 0, and when `references/loop-settings.md` names exactly that version as the minimum for `stages`. No test pins a literal version, so later lock bumps do not break it. |
| AC-09 | Written procedure: the implementation reviewer reads both Loop routes sections at the reviewed commit and confirms each behaviour AC-09 lists is stated there, quoting the sentence for each. |

## Tasks

- [x] T1 `tests/vh-adlc/loop/rungs.test.ts` - settings cases for `stages` (unknown value, empty list, duplicate, no `completion`, default resolves to both); `bun test tests/vh-adlc/loop/rungs.test.ts` fails on the new cases because `stages` is refused as an unknown key (AC-01)
      Evidence: `bun test tests/vh-adlc/loop/rungs.test.ts` at the T1 commit: 21 pass, 7 fail; the 7 new stage cases fail with "verification_rungs[0] contains unsupported fields"; existing calls now pass a stage.
- [ ] T2 `plugins/vh-adlc/scripts/loop/settings.ts`, `plugins/vh-adlc/scripts/loop/rungs.ts` - accept and validate `stages`, resolve the default on the parsed `Rung`; T1 passes (AC-01)
- [ ] T3 `tests/vh-adlc/loop/cli.test.ts` - CLI cases for `--stage task` with and without `--run`, `--stage completion` and no `--stage`, invalid `--stage` values with `--run true`, and the stage-less three-rung fixture with literal expected output; the stage cases fail because `--stage` and `deferred` do not exist, and the stage-less case stands as a regression guard (AC-02, AC-03, AC-04, AC-05)
- [ ] T4 `plugins/vh-adlc/scripts/loop/rungs.ts`, `plugins/vh-adlc/scripts/loop/cli.ts` - stage parameter on `applicableRungs`, `--stage` parsing and errors, `stage` and `deferred` output, the stage-scoped verdict without `--run`, and the updated rule and usage comments; T1 and T3 pass (AC-02, AC-03, AC-04, AC-05)
- [ ] T5 `tests/vh-adlc/direct-operation-compatibility.test.ts` - literal command checks for the implement and ship Loop routes and the reference's `verification_rungs[].stages` row and `--stage`; fails because the texts do not exist yet, while the body baseline cases still pass (AC-06, AC-07)
- [ ] T6 `plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md`, `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md` - Loop routes overrides for the per-task run, the Finish lookup, the Verify-step completion run, procedure-rung records, the completion-commit exemption and the post-merge run; T5's skill checks pass with unchanged baselines (AC-06, AC-09)
- [ ] T7 `plugins/vh-adlc/references/loop-settings.md`, `docs/user-guides/workflows.md` - document `stages`, `--stage`, `deferred`, the commit rule with its exemption and the minimum plugin version; T5 passes in full (AC-07)
- [ ] T8 `plugins/vh-adlc/plugin.json`, `plugins/vh-adlc/.claude-plugin/plugin.json` - bump both to the next minor version above `origin/main`; `bun test tests/vh-adlc/check.test.ts` passes and the AC-08 written procedure holds (AC-08)

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-21 | R-1 | spec | `21057d50` | claude-opus-5-5 | procedural | Five should-fix findings and one nit; no blocking finding |
| 2026-11-21 | R-2 | spec | `51881bc3` | claude-opus-5-5 | procedural | Four should-fix findings and one nit; no blocking finding |
| 2026-11-21 | R-3 | spec | `b8681c9a` | claude-opus-5-5 | procedural | Three should-fix findings; no blocking finding |
| 2026-11-21 | R-4 | spec | `807a31ba` | claude-opus-5-5 | procedural | One blocking and four should-fix findings |
| 2026-11-21 | R-5 | spec | `e59f9154` | claude-opus-5-5 | procedural | Two should-fix findings and one nit; no blocking finding |
| 2026-11-21 | R-6 | spec | `e2b27b37` | claude-opus-5-5 | procedural | One should-fix finding and one nit; no blocking finding |
| 2026-11-21 | R-7 | spec | `40983b5b` | claude-opus-5-5 | procedural | Two should-fix findings and two nits; no blocking finding |
| 2026-11-21 | R-8 | spec | `66a2976f` | claude-opus-5-5 | procedural | Two nits; clean |
| 2026-11-21 | R-8 | spec | `66a2976f` | n/a | n/a | accepted by owner |
| 2026-11-21 | R-9 | spec | `6caddb3b` | claude-opus-5-5 | procedural | One nit; clean (re-review after default-branch drift) |

### R-1

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Context (Owner summary: "ship runs the completion stage once, right before push and completion at the same commit"); Design, Procedures (third bullet, "Ship, before pushing and before setting `complete`"); frontmatter `goal` ("at the exact commit"); Acceptance Criteria AC-06
EVIDENCE: plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:72-83 orders Doc impact (may add commits), Verify, then Gate, which commits the completion update, and only then Push (SKILL.md:95). That completion commit moves HEAD after any rung run made "before setting complete". plugins/vh-adlc/scripts/loop/rungs.ts:76 blocks every result whose commit differs from the head, and cli.ts:140 takes the head from `git rev-parse HEAD`. So one run cannot cover both completion and push at the same commit. The Design does not say whether ship runs the completion stage before the completion commit, after it, or both. Running it twice doubles the 90-minute suite this feature exists to run once, and running it once leaves either completion or push at a commit with no result.
PROPOSAL: State the exact point in ship's order where `--stage completion` runs, and say how the push relates to the completion commit. For example: one run after the completion commit, at the commit that is pushed, with the gate's `complete` withdrawn if that run blocks. Or: one run before it, with a document-only completion commit explicitly accepted. Then make the Owner summary and AC-06 say the same thing.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Procedures (second bullet, "when the last task-stage run at `HEAD` reported a non-empty `deferred`"); Design, Command (`deferred`); Acceptance Criteria AC-06; Test Plan row AC-06
EVIDENCE: Implement runs rungs at the verification step and commits afterwards (plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:115-123, steps 3 and 4). The last task-stage run's results therefore carry the commit before the last task commit, so no task-stage run "at `HEAD`" exists when Finish starts. A resumed session at Finish also has no record of any earlier run's output. The Command section does not say whether `deferred` is computed when `--run` is not `true`. Today the report is `[]` without `--run` (cli.ts:145), so Finish has no defined cheap way to learn the deferred set.
PROPOSAL: Have Finish run `cli.ts rungs --repo <dir> --base <default branch> --stage task` without `--run`, and state that `deferred` is reported whether or not `--run` is given. Add that case to AC-02 and its Test Plan row.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Procedures (second bullet, "It reports the held-back rungs and names ship as the next step"); Acceptance Criteria AC-06 ("naming ship as the next step instead"); Test Plan row AC-06
EVIDENCE: The rules block in conventions/feature-documents.md at 0c983f6 returns `review` for an in-progress feature whose implementation review is not fresh, and `tasks` when that review is not clean. It returns `ship` only after both hold and `all_met` holds. Implement's Finish today reaches the gate before any implementation review exists, and its usual next step is `/vh-adlc-review` (vh-adlc-implement/SKILL.md:129-132). AC-06 requires Finish to name ship unconditionally, which then contradicts `vh-adlc next`. The Design's own clause limits ship to features "whose implementation review is clean".
PROPOSAL: Have Finish report the step `vh-adlc next` returns, plus the held-back rungs that ship will run. Reword AC-06 and its proof to match, for example by checking that Finish names `deferred` and says the completion stage runs in ship.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Context (Owner summary, "a browser pass"); Design, Procedures (ship bullet); Acceptance Criteria AC-06
EVIDENCE: The Owner summary names a browser pass as a motivating rung. In adopters' settings that is a `procedure` rung (tests/vh-adlc/loop/cli.test.ts:141 uses `browser` with `procedure: Record the browser pass.`). A procedure rung counts only through `--record`, "given by the operation that performed it" (references/loop-settings.md:64-66), and runRungs reports it `not run` until then (rungs.ts:44). `grep -rn -- "--record" plugins/vh-adlc/skills` prints nothing, so the ship procedure has no instruction to perform a procedure rung or pass `--record`. With `stages: [completion]`, ship becomes the only operation that meets that rung, so it would block every push. Implementers would differ on whether ship performs it.
PROPOSAL: Add to the ship procedure bullet and AC-06 that ship performs each applicable completion-only procedure rung and passes its result with `--record` on the completion-stage run, including after the merge. Add the phrase to the AC-06 text check.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan row AC-05; Acceptance Criteria AC-05 ("matches today's output")
EVIDENCE: The row names "the existing three-rung fixture without `stages`" in tests/vh-adlc/loop/cli.test.ts. That file has no such fixture. Its rung fixtures have two rungs (cli.test.ts:141, :149), and the three-rung `verify`/`integration`/`kind` fixture is in tests/vh-adlc/loop/rungs.test.ts:22-33. The proof compares the new code at `--stage task` and `--stage completion` with the new code run without `--stage`, which defaults to completion. An implementation that changes today's `applicable`, `results`, `advance` or `blocking` for stage-less settings at every stage alike still passes, so the row does not establish "today's output".
PROPOSAL: Name the fixture's real location or say the row creates it. Compare against fixed expected values taken from today's behaviour, such as the applicable names, each result's state and reason, `advance` and `blocking` written as literals, rather than against the no-flag run of the new code.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design, Command (first paragraph)
EVIDENCE: "Without the flag the stage is `completion`" has no closing period, so it runs straight into "Any other value, or `--stage task` together with `--merge`, prints ...".
PROPOSAL: End the sentence with a period.

### R-2

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Procedures (third bullet "Ship, Verify: perform each applicable written-procedure rung that `deferred` would hold back at the task stage", fourth bullet "Ship, after the merge: ... perform those procedure rungs again", first bullet "A task is not ticked unless every task-stage rung passed"); Context, Owner summary ("Ship also performs each applicable completion-only written-procedure rung"); Acceptance Criteria AC-06 ("performs each completion-only procedure rung"); Test Plan row AC-06
EVIDENCE: Design, Selection says stage `completion` keeps every rung that passes the path filter, whatever its `stages`. So ship's completion run at V also includes procedure rungs that have no `stages` field, which resolve to `[task, completion]`. runRungs reports every procedure rung `not run` unless a `--record` is given (plugins/vh-adlc/scripts/loop/rungs.ts:44, cli.ts:133-137). mayAdvance blocks it (rungs.ts:80), and a record made at an earlier commit does not count (rungs.ts:76). Ship only records the procedure rungs `deferred` would hold back, so a default-stage procedure rung, such as the `browser` rung in tests/vh-adlc/loop/cli.test.ts:141, is never recorded at V. The completion run then can never advance, and ship can never push or set `complete`. The same applies at the task stage: `grep -rn -- "--record" plugins/vh-adlc/skills` prints nothing, so a default-stage procedure rung blocks every task tick. This scope came from how the previous revision applied R-1 F-04.
PROPOSAL: Have ship perform and `--record` every applicable procedure rung on its completion-stage run and on the post-merge run, not only the completion-only ones. Then say how implement records a task-stage procedure rung, or state that a procedure rung must declare `stages: [completion]`. Update the Owner summary, AC-06 and its proof to match.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-06; Acceptance Criteria AC-06; Design, Procedures (first and second bullets)
EVIDENCE: The AC-06 proof only checks that the implement skill contains `--stage task` somewhere and, in Finish, `deferred`, `vh-adlc next` and `ship`. The Finish section already contains `vh-adlc next` today (plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:129). Suppose an implementation keeps the per-task command as `rungs --repo <dir> --base <default branch> --run true` (SKILL.md:49-51) and adds `--stage task` only in Finish. That still passes. Without the flag the stage is `completion` (Design, Command), so that skill would keep running every expensive rung at every task, which is the problem the feature exists to remove.
PROPOSAL: Have the proof require the exact per-task command `rungs --repo <dir> --base <default branch> --stage task --run true` in the per-task verification text. It should also require that no stage-less `rungs ... --run true` command remains in the implement skill, and that the Finish command carries `--stage task` without `--run`.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Scope (fourth in-scope bullet, "a plugin minor version bump to 0.29.0"); Design, Concurrency, failure and upgrade ("a plugin older than 0.29.0"); Acceptance Criteria AC-07 ("the minimum plugin version") and AC-08; Test Plan rows AC-07 (`0.29.0`) and AC-08; Context, Owner summary ("a plugin minor version bump")
EVIDENCE: Both manifests are at 0.28.0 (plugins/vh-adlc/plugin.json:4, plugins/vh-adlc/.claude-plugin/plugin.json:3). docs/specs/website-release-check.md is `in-progress` on `feat/website-release-check` and lists both manifests in its covers (lines 2-12), so it will also bump the version. Whichever lands second has to change its number. If the other feature takes 0.29.0 first, this document's reference text would name a minimum version that still refuses `stages`. AC-08 would also need a revision before it can be met. docs/specs/seo-search-ai-discovery.md:102 shows this repository's existing pattern: "select the next version from the then-current main branch". The proposed AC-08 test pins the literal `0.29.0` in `tests/vh-adlc`, so the next release bump of the package also breaks that test. tests/vh-adlc/check.test.ts:224-232 already checks that the version differs from main.
PROPOSAL: State the version as the next minor version above main at implementation time. The reference names that release as the minimum, and AC-08 rests on the existing differs-from-main check rather than a hard-coded literal. Alternatively, make sequencing against website-release-check an explicit decision.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Procedures (second bullet, Implement, Finish); Design, Command (`deferred` reported without `--run`); Acceptance Criteria AC-02; Test Plan row AC-02
EVIDENCE: Without `--run true`, the command sets `advance: !declared` and `blocking` to every applicable rung, and exits 3 whenever rungs are declared (plugins/vh-adlc/scripts/loop/cli.ts:141-149). Finish's new lookup therefore always exits 3 in a repository that uses this feature. The Design does not say Finish expects exit 3 and reads only `deferred`. It also does not say what `advance` and `blocking` hold at stage `task` without `--run`. The AC-02 proof does not check the exit code or `blocking` for that case. One implementer may stop Finish on exit 3 as a blocked check, and another may read `deferred` and continue.
PROPOSAL: State the exit code and the `advance` and `blocking` values for a run without `--run` at stage `task`, or make that lookup exit 0. Say in the Finish bullet that the step reads `deferred` and does not treat the verdict as a check failure. Add the exit code to the AC-02 proof.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (first paragraph, "The rule that a result recorded at another commit does not count is unchanged"); Design, The completion commit ("with one exemption: ship's completion commit")
EVIDENCE: The Design adds an exemption to exactly that rule: ship pushes commit C with no result recorded at C, and "The reference states this exemption next to the commit rule". The Owner summary's second paragraph describes the push without a second run, but the first paragraph still calls the rule unchanged. The contradiction came in when the previous revision applied R-1 F-01.
PROPOSAL: Say the commit rule is unchanged except for the document-only completion commit ship pushes after its Verify run.

### R-3

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, The completion commit; Design, Procedures (third bullet, "Ship, Verify"); Acceptance Criteria AC-06 (ship sentence); Test Plan row AC-06 (ship skill checks); Context, Owner summary (second paragraph, "it then pushes that completion commit without a second run")
EVIDENCE: The ship skill's preamble today says ship runs `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --run true` "before pushing and never pushes or reports the feature complete unless it may advance at HEAD" (plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:51-54). After the Gate step commits C, HEAD is C, and the results from V carry commit V, which mayAdvance blocks (plugins/vh-adlc/scripts/loop/rungs.ts:76). That sentence therefore directs a second completion run at C, which is exactly the doubled expensive run the exemption exists to avoid. Neither the Procedures nor AC-06 say that this preamble sentence is replaced or reworded. The AC-06 proof checks only that the ship skill contains `--stage completion`, `--merge <merge commit> --stage completion`, `--record` and `only the feature document`. A ship skill that keeps the "before pushing ... may advance at HEAD" sentence and adds a Verify-step run passes that proof while still telling the agent to run the completion stage twice. For implement, the previous revision added a negative check for this kind of leftover text (no stage-less `rungs ... --run true`). Ship has no equivalent.
PROPOSAL: State in the ship Procedures bullet and in AC-06 that the preamble's "before pushing ... may advance at HEAD" rule is replaced by the Verify-step run plus the completion-commit exemption. Add a negative check to the AC-06 proof, for example that the ship skill no longer contains `may advance at HEAD` or a stage-less `rungs --repo <dir> --base <default branch> --run true`.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-07 ("the `version` read from `plugins/vh-adlc/.claude-plugin/plugin.json`"); Acceptance Criteria AC-07 ("as the minimum plugin version, the version both manifests carry"); Test Plan row AC-08 ("No test pins a literal version, so later lock bumps do not break it"); Design, Concurrency, failure and upgrade ("the reference names that release as the minimum plugin version")
EVIDENCE: The AC-07 proof is a permanent test in tests/vh-adlc/direct-operation-compatibility.test.ts that requires references/loop-settings.md to contain whatever version the manifest carries now. The minimum version that accepts `stages` is fixed at the release that ships this feature. tests/vh-adlc/check.test.ts:224-232 requires a version change with every later change under plugins/vh-adlc, so the very next package change moves the manifest to a version the reference does not contain, and this test fails. The only way to make it pass again is to raise the stated minimum to a later release, which makes the reference wrong. That contradicts the AC-08 row's own claim that no test pins a version. The previous revision introduced this when it applied R-2 F-03 by replacing the literal `0.29.0` with the manifest read.
PROPOSAL: Prove the minimum version in the reference once, at implementation time, through the written procedure in the AC-08 row: compare it with the branch's manifest version. Alternatively, have the test check that the reference names a version no later than the manifest's and above origin/main's at the time of the feature, rather than equal to the current manifest.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, The completion commit; Design, Concurrency, failure and upgrade; Design, Procedures (third bullet, "Ship, Verify")
EVIDENCE: The exemption says ship pushes C without a second run "when `git diff --name-only V C` lists only that document", where V is the commit of ship's Verify run. Rung results are never stored between invocations (Scope, Out of scope, second bullet; cli.ts:133-149 only prints them). If ship stops after committing C and before the push succeeds (an interrupted session, or a rejected push that ship reports as partial and stops on, plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:95-97), a later ship or resume run sees a local completion commit whose parent differs only by the document. Nothing records whether a completion run advanced at that parent. One implementer would take V as C's parent and push C with no observed result. Another would run the completion stage again. The Concurrency, failure and upgrade section covers a blocking run and a timeout but not this retry path, which crosses the push boundary.
PROPOSAL: State that the exemption applies only within the same ship run that observed the completion stage advance at V, and that any retried or resumed push runs the completion stage again at the head before pushing. Add that case to AC-06.

### R-4

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Test Plan row AC-06 ("its Finish section contains `--stage task`, `deferred`, `vh-adlc next` and `ship` and no `--run`"); Acceptance Criteria AC-06 ("its Finish step runs the command with `--stage task` and no `--run`"); Design, Procedures (second bullet, "run `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage task` without `--run`")
EVIDENCE: The Design's own Finish instruction says to run the command "without `--run`". A Finish section written to that instruction will naturally contain the literal `--run`, for example "run `... --stage task` without `--run`". The AC-06 proof fails any Finish section that contains `--run` anywhere, so it fails an implementation that copies the Design's wording, which meets AC-06. The row changed since R-3 reviewed b8681c9a (`git diff b8681c9a 807a31ba` shows the AC-06 row rewritten), so it has not passed review. A pattern that rejects a correct output is blocking under the Test plan rule.
PROPOSAL: Check what matters instead: the Finish section contains the exact command `rungs --repo <dir> --base <default branch> --stage task` and contains no `--run true`. Alternatively, have the Design and AC-06 forbid naming `--run` in Finish and say so in the row.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan rows AC-06 and AC-07
EVIDENCE: conventions/feature-documents.md at 0c983f6, Test plan: "A proof that judges free text with a pattern lists its must-pass and must-fail examples in the row." The AC-06 row judges the implement and ship skills by literal phrases (`only the feature document`, `same ship run`, `retried or resumed`, `--record`, the negative `may advance at HEAD` and stage-less command checks), and the AC-07 row judges the reference and the workflows guide by phrases (`completion commit`, `completion stage`). Neither row lists a must-pass or must-fail example, so a reader cannot tell which wordings the test should accept or reject, and F-01 shows a correct wording the AC-06 pattern rejects.
PROPOSAL: Add to each row at least one must-pass example sentence and one must-fail example sentence for each phrase group, including for AC-06 a Finish sentence that names `--run` only to forbid it.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Procedures (Implement Finish bullet and Ship Verify bullet); Acceptance Criteria AC-06; Test Plan row AC-06; Scope (third in-scope bullet, "The implement and ship procedures")
EVIDENCE: tests/vh-adlc/direct-operation-compatibility.test.ts:14 runs "direct %s keeps its approved operation body" for implement and ship. It strips only Loop routes, Documentation impact, ship's Article and promotion handoff and After an authorized merge, then asserts `expect(body(current)).toBe(body(previous))` against owner-approved baselines (`implementBaseline` 8d5a639b at line 13, `baseline` b313327b at line 6; comments at lines 7-12 say the baselines record owner approvals). It passes at HEAD (`bun test tests/vh-adlc/direct-operation-compatibility.test.ts`: 7 pass, 0 fail). The AC-06 proof requires new text in implement's `## Finish` section, and the Design rewrites ship's Verify step in "Make the feature shippable" (SKILL.md:79). Both sit in the compared body, so the existing test fails unless the baselines are moved. The skills' existing pattern instead puts loop overrides in Loop routes ("these instructions replace Enter steps 1 and 6", implement SKILL.md:57). The document never names this test or says whether the change goes into Loop routes, which would then fail the AC-06 Finish-section check, or into the body with re-approved baselines. Two implementers would build different things, and moving an owner-approved baseline is an owner decision the document does not record.
PROPOSAL: State where the new procedure text goes. Either put it in each skill's Loop routes section as an override of Finish and Verify, and point the AC-06 proof at that section, or state that the implement and ship baselines move to the feature's commit as an owner-approved change and add that to Scope and AC-06.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Concurrency, failure and upgrade ("If the completion run blocks, ship sets no status and pushes nothing, and the fix goes back to implement"); Design, Procedures (Ship, Verify bullet); Acceptance Criteria AC-06; Context, Owner summary
EVIDENCE: With completion-only rungs, ship's Verify run becomes the first place an expensive rung executes, so a failure there is an expected path, not a rare one. At that point every task is ticked. Implement takes "the first unchecked task" (plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:109) and has none to take. The rules block at 0c983f6 returns `ship` for an in-progress document with no open tasks, a clean tree, a fresh clean implementation review and `all_met` (next rules for `tasks_open`, `feature_tree_clean`, `impl_review_fresh`, `impl_review_clean`, `all_met`, then `ship`), so `vh-adlc next` sends the feature straight back to ship, which blocks again. The document does not say how the fix gets a task (for example a new task appended by `/vh-adlc-tasks`), whether implement may fix without a task, or what ship reports as the next step. AC-06 and the Owner summary are silent on it.
PROPOSAL: Name the route for a blocked completion run: for example, ship reports the blocking rungs and names `/vh-adlc-tasks` to append a new task for the fix, then implement and a fresh review. Add the reported next step to the ship bullet and to AC-06.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-04; Acceptance Criteria AC-04 ("runs no rung")
EVIDENCE: The AC-04 row runs `--stage push` and `--stage task --merge <sha>` and checks that a marker-writing rung has not run, but it does not pass `--run true`. Without `--run true` the command never executes a rung (plugins/vh-adlc/scripts/loop/cli.ts:133, `options.run === "true" ? ... : []`), so the marker check holds even for an implementation that validates `--stage` only after running every rung. The proof could pass on a wrong implementation.
PROPOSAL: Run both invalid cases with `--run true` and keep the marker-file and exit 2 checks.

### R-5

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, The completion commit ("If C changes anything else, another commit follows V, or the push is retried or resumed in a later run ... ship runs the completion stage again at the head before pushing"); Design, Concurrency, failure and upgrade ("If the completion run blocks, ship sets no status and pushes nothing. Every task is ticked at that point, so ship reports the blocking rungs and names `/vh-adlc-tasks`"); Context, Owner summary ("A retried or resumed push runs the completion stage again first" and "If ship's completion run blocks, ship reports the blocking rungs and names `/vh-adlc-tasks` to append a fix task"); Acceptance Criteria AC-09 ("reruns the completion stage before a retried or resumed push, and after a blocked completion run reports the blocking rungs and names `/vh-adlc-tasks`")
EVIDENCE: On a retried or resumed push, the local completion commit C already exists, so the document is `complete` when the rerun happens. That covers a session interrupted after Gate, or a rejected push (plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:95-97) followed by integrating the remote branch, which adds commits after C. If that rerun blocks, the Design's blocked-run route assumes an `in-progress` document: "ship sets no status" when the status is already set, and `/vh-adlc-tasks` starts with `vh-adlc gate in-progress <doc>` and accepts only a `planned` or `in-progress` document (plugins/vh-adlc/skills/vh-adlc-tasks/SKILL.md:42-46). The rules block at 0c983f6 allows `complete` to move only to `archived` or `superseded`, and the convention calls `complete` terminal for its scope. Nothing says whether ship reverts or drops the unpushed completion commit, sets the status back to `in-progress`, or stops for the owner. The rerun rule came in when the previous revisions applied R-3 F-03 and the `/vh-adlc-tasks` route when they applied R-4 F-04. Neither revision defined the case where both apply.
PROPOSAL: Define the blocked rerun when an unpushed completion commit exists. For example, ship adds a new commit that sets the document back to `in-progress` (never rewriting anything), reports the blocking rungs and names `/vh-adlc-tasks`. Or ship stops and names the owner decision. State it in the Design, the Owner summary and AC-09.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, The completion commit ("Every applicable rung must pass at the commit being completed, pushed or delivered, with one exemption: ship's completion commit"); Design, Procedures (Implement, Finish: "With an empty `deferred`, Finish is unchanged"); Context, Owner summary (first paragraph, "except for the document-only completion commit ship pushes after its Verify run"); Acceptance Criteria AC-07 ("the completion-commit exemption"); Context, Background (fourth bullet, Finish "sets `complete` after `vh-adlc gate complete` without running rungs")
EVIDENCE: The Background notes that implement's Finish sets `complete` without running rungs (plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:129-131), and the Design leaves that path unchanged when `deferred` is empty. Implement runs its rungs at the verification step, before the task commit (SKILL.md:113-122), and the results carry `git rev-parse HEAD` from that moment (plugins/vh-adlc/scripts/loop/rungs.ts:41, :76). So implement's completion commit is completed with no result at that commit. The rule the reference will state, "with one exemption: ship's completion commit", is therefore false. One implementer would write it as stated, leaving a reference that contradicts implement. Another would add a completion-stage run to implement's Finish to honour it, which repeats every rung at the end of implement.
PROPOSAL: Say which commits the rule actually covers. Either have the reference state that implement's Finish may also set `complete` without a run, because ship's completion stage runs before any push, or restrict the rule to the commits that are pushed and delivered. Make the Owner summary and AC-07 say the same.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary ("Planned checks: unit tests for settings validation and rung selection")
EVIDENCE: The AC-01 row unit tests settings validation. No Test Plan row unit tests `applicableRungs` with a stage. Selection is proved only through the CLI rows AC-02, AC-03 and AC-05 in tests/vh-adlc/loop/cli.test.ts.
PROPOSAL: Say the selection is proved by CLI tests, or add a unit case for `applicableRungs(settings, paths, "task")` to a Test Plan row.

### R-6

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Concurrency, failure and upgrade ("If the document is still `in-progress`, ship sets no status ... If the run was a rerun after ship's own unpushed completion commit, the document is already `complete` ... ship then stops"); Design, The completion commit ("implement's Finish sets it only when no rung was deferred ... either way a push still goes through ship's completion run"); Design, Procedures (Implement, Finish: "With an empty `deferred`, Finish is unchanged"; Ship, Verify bullet); Context, Owner summary ("in the rare case where that run is a rerun after its own unpushed completion commit, ship stops" and, later, "with an owner stop when the document is already `complete` locally"); Acceptance Criteria AC-09 ("or, when its own unpushed completion commit already exists, stops and names the owner decision")
EVIDENCE: The Design defines the blocked completion run for two states only: an `in-progress` document, and a rerun after ship's own unpushed completion commit. A third state is the normal path whenever `deferred` is empty, which includes every adopter whose rungs have no `stages`: implement's Finish sets `complete` and commits it (plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:129-131), and implement never pushes (SKILL.md:120-122). Ship's first Verify run then sees a document that is already `complete`, with no completion commit of ship's own. That run can block: a flaky or environment-dependent rung, a procedure rung such as a browser pass that ship must perform again, or a covered doc-impact fix ship committed after the task runs. In that state `/vh-adlc-tasks` refuses, because it runs `vh-adlc gate in-progress <doc>` and accepts only a `planned` or `in-progress` document (plugins/vh-adlc/skills/vh-adlc-tasks/SKILL.md:41-49). The rules block at 0c983f6 lets `complete` move only to `archived` or `superseded`. The Design's text routes this case to `/vh-adlc-tasks`, which cannot run, while the Owner summary's last paragraph ("an owner stop when the document is already `complete` locally") routes it to the owner. Two implementers would write different ship text. The previous revision introduced this when it applied R-5 F-01 (owner stop limited to ship's own commit) and R-5 F-02 (implement's Finish still sets `complete` with an empty `deferred`).
PROPOSAL: Define the blocked completion run by the document's status rather than by who made the commit: whenever the document is already `complete` locally and unpushed, whether implement or ship set it, ship stops, reports the blocking rungs and the unpushed commit, and names the owner decision. State it the same way in the Design, the Owner summary and AC-09.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary ("Rungs without `stages` keep today's flow" and "Removing the field restores today's behaviour, which is also the rollback"); Design, Concurrency, failure and upgrade ("Rollback is removing the field")
EVIDENCE: The new Loop routes text applies whenever rungs are declared, not only when a rung has `stages`. For stage-less settings, ship still changes: it runs the completion stage at its Verify step instead of under the current "before pushing ... may advance at HEAD" rule (plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:51-54), pushes the document-only completion commit under the new exemption, and performs and records procedure rungs. Implement now performs and records procedure rungs at every task. The CLI output is unchanged for stage-less settings (AC-05), but the flow is not, and removing `stages` does not restore the old procedures.
PROPOSAL: Say that stage-less rungs keep today's selection and verdict, while the implement and ship procedure changes (Verify-step run, completion-commit exemption, recorded procedure rungs) apply to every adopter with declared rungs, and that rollback of those needs the previous plugin version.

### R-7

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Concurrency, failure and upgrade ("If the completion run blocks, ship pushes nothing. If the document is still `in-progress`, ship sets no status; ... ship reports the blocking rungs and names `/vh-adlc-tasks` as the next step"); Design, Procedures (Ship, Verify bullet); Context, Owner summary ("If ship's completion run blocks, ship reports the blocking rungs and names `/vh-adlc-tasks` to append a fix task"); Acceptance Criteria AC-09 ("after a blocked completion run reports the blocking rungs and names `/vh-adlc-tasks`")
EVIDENCE: The ship operation body, which the Design keeps byte-identical, already lets ship fix a failing check itself: Make the feature shippable step 1 says a covered fix needs a fresh implementation review "in this run" and ends "The same applies to any covered change verification requires" (plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:72-77). With completion-only rungs, ship's Verify run is the first place an expensive rung executes, so a covered fix that verification requires becomes a common path. The Design routes every blocked completion run out of ship to `/vh-adlc-tasks`, but never says whether its Loop routes override replaces that body clause. One implementer writes an override that forbids ship from committing a covered fix after a blocked completion run; another leaves the body's in-run fix plus fresh review in place and uses `/vh-adlc-tasks` only when ship does not fix it. AC-09's written check passes either text.
PROPOSAL: State in the ship Procedures bullet, the failure section and AC-09 whether the Loop routes override replaces the body's "any covered change verification requires" path after a blocked completion run, or keeps it and names `/vh-adlc-tasks` only when ship does not make the fix in the same run.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Concurrency, failure and upgrade ("If the document is still `in-progress` ... If the document is already `complete` locally and unpushed ... ship then stops"); Context, Owner summary ("when the document is already `complete` locally and unpushed, whether implement or ship set it, ship stops and names the owner decision instead"); Acceptance Criteria AC-09 ("or, when the document is already `complete` locally and unpushed, stops and names the owner decision")
EVIDENCE: The blocked completion run is defined for two states: `in-progress`, and `complete` locally and unpushed. A third state is reachable: the completion commit is already pushed and the open PR takes further commits, for example after the owner asks ship to integrate the default branch into the feature branch. Ship's Deliver step updates an existing PR (plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:98), and its Gate step runs only "whenever you mean to set the document `complete`" (SKILL.md:79), so ship runs on an already `complete` document. Before that push the completion stage runs again at the head (Design, The completion commit). If it blocks, the `in-progress` route does not apply, and `/vh-adlc-tasks` refuses because it requires `vh-adlc gate in-progress` to fail on nothing but `tasks_populated` (plugins/vh-adlc/skills/vh-adlc-tasks/SKILL.md:42-49), while the rules block at 0c983f6 lets `complete` move only to `archived` or `superseded`. The "and unpushed" qualifier that leaves this state out came in when the previous revision applied R-6 F-01.
PROPOSAL: Define the blocked run by status alone: whenever the document is `complete`, pushed or not, ship pushes nothing, reports the blocking rungs and any unpushed commits, and names the owner decision. State it the same way in the Design, the Owner summary and AC-09.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Test Plan row AC-06 (Finish lookup check); Acceptance Criteria AC-06 ("the Finish lookup `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage task` with no `--run`")
EVIDENCE: The row checks only that the implement Loop routes contain the lookup string with its closing backtick. A Finish sentence such as "run `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage task` with `--run true`" passes it, although AC-06 requires no `--run`, and AC-09's reviewer check does not list the absence of `--run`. This only widens a free-text pattern row that has passed review: the row's text is unchanged since e59f9154, and neither R-5 (at e59f9154) nor R-6 (at e2b27b37) has a finding whose WHERE names it or the Test Plan.
PROPOSAL: Leave the row as it is, or add "Finish runs the lookup without `--run`" to the items the AC-09 reviewer confirms.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, The completion commit ("The reference states the rule for pushed and delivered commits, not for every commit that sets `complete`"); covers (`plugins/vh-adlc/scripts/loop/rungs.ts`)
EVIDENCE: The covered source restates the old rule in comments: plugins/vh-adlc/scripts/loop/rungs.ts:2 "Every applicable rung must pass at the commit being pushed, completed or delivered" and rungs.ts:71 "Whether the results let the feature push, complete or deliver at `head`". The cli.ts usage comment (plugins/vh-adlc/scripts/loop/cli.ts:5-6) lists the `rungs` flags without `--stage`. The Design updates only the reference, so these comments would contradict it after implementation.
PROPOSAL: Add a line saying the rungs.ts comments and the cli.ts usage comment are updated to match the reference.

### R-8

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Design, Concurrency, failure and upgrade ("the failure is handled by ship's existing rules for a failed verification in its operation body (`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:72-83`), which this feature does not change: a covered fix in the same run with a fresh implementation review, or a report that names the blocking rungs and stops"); Context, Owner summary ("follows its existing rules for a failed verification"); Acceptance Criteria AC-09 ("pushes nothing and sets no status after a blocked completion run")
EVIDENCE: The ship operation body at 66a2976f has no rule for a failed verification that reports blocking rungs and stops. Step 2 Verify says only "Run the repository's own verification commands and note what they printed" (SKILL.md:78). Step 1's "report the review and stop" applies to a fresh implementation review that does not return every criterion `met`, and its last sentence, "The same applies to any covered change verification requires" (SKILL.md:72-77), covers only the covered-fix path. Today the stop after blocked rungs comes from the Loop routes sentence "never pushes or reports the feature complete unless it may advance at HEAD" (SKILL.md:51-54). The Design replaces that sentence, so after this feature the stop comes from the new override's "pushes only when that run may advance", not from the body. Whether ship names the blocking rungs is left to the Report section's "anything partial". This changes little, because AC-09 checks only that ship pushes nothing and sets no status.
PROPOSAL: Say that ship's body allows a covered fix in the same run with a fresh review, and that otherwise ship stops under the override's "pushes only when that run may advance" rule. Drop the claim that the body names blocking rungs, or add naming them to the ship override and to AC-09.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-09 ("with a non-empty `deferred` does not set `complete` but reports the deferred rungs and the step `vh-adlc next` returns"); Design, Procedures (Implement, Finish: "it reports the deferred rungs, says the completion stage runs in ship, and reports the step `vh-adlc next` returns")
EVIDENCE: The Design's Finish bullet says Finish states that the completion stage runs in ship, and the Owner summary says "ship completes the feature". AC-09 lists everything else in that bullet but not this statement, so the reviewer's written check in Test Plan row AC-09 never confirms it. An implementer who reports only the deferred rungs and the `next` step still meets AC-09.
PROPOSAL: Add "says the completion stage runs in ship" to AC-09's list of implement Finish behaviours, or drop it from the Design bullet.

### R-9

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (fourth paragraph, "Reviews R-1 to R-3 and R-5 to R-7 found should-fix issues and nits and R-4 one blocking proof flaw, all applied here; a new review is pending")
EVIDENCE: At 6caddb3b the Review Log has R-8 at `66a2976f` with outcome "Two nits; clean" and an R-8 "accepted by owner" row, and `status_description` reads "Review R-8 is clean; waiting for the owner's acceptance." The summary still says a new review is pending and does not mention R-8 or its two unapplied nits. conventions/feature-documents.md (Owner summary in Context) asks for the summary's validation state to be refreshed when proof or decisions change. The section is outside the normative baseline, so this changes nothing an implementer builds. Other checks at this commit found nothing new: `git diff 66a2976f 6caddb3b` changes only the Review Log and `status_description` in the document. PR #140 moved both manifests to 0.28.1, so the Scope's "0.29.0 if nothing else lands first" and AC-08's next-minor rule still hold. The direct-operation test still strips Loop routes before comparing the implement and ship bodies with their unchanged baselines (`bun test tests/vh-adlc/direct-operation-compatibility.test.ts`: 7 pass, 0 fail). The Background greps (`--record` in skills, `rungs` in the review and resume skills and review-protocol.md, `verification_rungs` in internal and cmd) still print nothing. `vh-adlc lint` passes. `vh-adlc fresh` reports R-8 stale only for covered-drift on the two manifests and the compatibility test.
PROPOSAL: Update the Owner summary's review sentence to say R-8 was clean with two nits and the owner accepted it, or drop the review history from the summary.
