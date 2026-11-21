---
status: draft
status_description: "Reviews R-1 and R-2 and the owner's answers applied; waiting for a new spec review."
issue: null
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
behaves exactly as today. A rung with `stages: [completion]` is skipped at the task verification step
and still required before push, completion and delivery. The `rungs` command gains a `--stage task |
completion` flag. Without the flag it behaves as the completion stage, so a caller that forgets it never
checks less than today. The rule that a result recorded at another commit does not count is unchanged,
except for the document-only completion commit ship pushes after its Verify run.

Implement runs `--stage task` at each task. Ship runs `--stage completion` once, at its Verify step, just
before it commits the `complete` status update; it then pushes that completion commit without a second
run, because the commit changes only the feature document. After the merge, ship runs the completion stage
at the merge commit, as today. Each stage performs its own written-procedure rungs, such as a browser
pass, and records their results with `--record`: implement those of the task stage at each task, ship every
applicable one at completion and after the merge. No procedure says this today, so a procedure rung
currently blocks every run. When any applicable rung skips the task
stage, implement's Finish step does not set `complete`; it reports those rungs and the next step
`vh-adlc next` returns, and ship completes the feature. Rungs without `stages` keep today's flow.

Out of scope: per-rung stages beyond `task` and `completion` (such as separating push from delivery),
caching rung results between invocations, and any change to how the implementation reviewer works. The
review operation does not call the `rungs` command today and stays unchanged.

Compatibility: an older plugin refuses a settings file that uses `stages`, because rung keys are
checked strictly. Adopters update the plugin before adding the field. Removing the field restores today's
behaviour, which is also the rollback.

Planned checks: unit tests for settings validation and rung selection, CLI tests that prove a
completion-only rung is not executed at the task stage and blocks at the completion stage, and procedure
and reference text checks. None has run yet. The owner chose a `stages` list, a completion default for the
flag, completion left to ship, one completion run before the document-only completion commit, a cheap
`deferred` lookup for Finish that keeps today's exit 3, each stage recording its own procedure rungs, exact
command checks for implement, and the next minor plugin version above main at implementation time. Reviews
R-1 and R-2 found only should-fix issues and nits, all applied here; a new review is pending. Acceptance
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
- The implement and ship procedures, the loop settings reference and the workflows user guide.
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

Every applicable rung must pass at the commit being completed, pushed or delivered, with one exemption:
ship's completion commit. Ship runs the completion stage at its Verify step, at commit V. Its Gate step then
commits the `complete` status update as commit C, staging only the feature document, and ship pushes C
without a second run when `git diff --name-only V C` lists only that document. If C changes anything else,
or another commit follows V, ship runs the completion stage again at the new head before pushing. The
reference states this exemption next to the commit rule. A delivery check after the merge has no exemption:
it runs at the merge commit, as today.

### Procedures

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
  that run may advance, under the completion-commit exemption above.
- Ship, after the merge: from a checkout of the merge commit, perform every applicable written-procedure
  rung again and run `--merge <merge commit> --stage completion --run true` with their `--record` results.

### Concurrency, failure and upgrade

The command reads settings and runs checks; it writes no shared state, so concurrent invocations behave as
today. A rung that times out or cannot run blocks its stage exactly as today. If the completion run blocks,
ship sets no status and pushes nothing, and the fix goes back to implement. Upgrade: a plugin older than
the release that ships this feature refuses settings that use `stages` (strict key check), so the reference
names that release as the minimum plugin version. Rollback is removing the field.

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
- [ ] AC-06: The implement procedure, at each task, performs every applicable task-stage procedure rung
      and runs `rungs --repo <dir> --base <default branch> --stage task --run true` with their `--record`
      results, and runs no stage-less `rungs ... --run true` command; its Finish step runs the command with
      `--stage task` and no `--run`, reads only `deferred`, and when `deferred` is non-empty does not set
      `complete`, says the completion stage runs in ship and reports the step `vh-adlc next` returns. The
      ship procedure performs every applicable procedure rung and passes its result with `--record`, runs
      the command with `--stage completion` at its Verify step and with
      `--merge <merge commit> --stage completion` after the merge, and pushes its completion commit without
      a second run only when that commit changes nothing but the feature document.
- [ ] AC-07: The loop settings reference documents `verification_rungs[].stages`, its default, the
      `completion` requirement, the `--stage` flag with its default, `deferred`, the completion-commit
      exemption and, as the minimum plugin version, the version both manifests carry; the workflows guide
      says rungs can be limited to the completion stage.
- [ ] AC-08: Both vh-adlc plugin manifests carry the same version, a minor version above the default
      branch's at implementation time.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc/loop/rungs.test.ts`: new cases load settings with `stages: [bogus]`, `[]`, `[completion, completion]` and `[task]`, each expecting the error to name `verification_rungs[0].stages`, and a rung without the field whose parsed `stages` equals `["task", "completion"]`. |
| AC-02 | `bun test tests/vh-adlc/loop/cli.test.ts`: a new fixture with a task rung (`true`) and a completion-only rung whose command writes a marker file and exits 1; `--stage task --run true` exits 0, the marker file does not exist, the completion-only rung's result is `not run` with a reason containing `completion stage`, and `deferred` equals its name; `--stage task` without `--run` exits 3, reports the same `deferred`, `advance` false, `blocking` equal to the task rung's name alone, and the marker file still does not exist. |
| AC-03 | `bun test tests/vh-adlc/loop/cli.test.ts`: the same fixture with `--stage completion --run true` and with no `--stage` each exits 3, the marker file exists, and `blocking` contains the completion-only rung. |
| AC-04 | `bun test tests/vh-adlc/loop/cli.test.ts`: `--stage push` and `--stage task --merge <sha>` each exit 2 with `status: "error"`, and a rung command that writes a marker file has not run. |
| AC-05 | `bun test tests/vh-adlc/loop/cli.test.ts`: a new fixture with the three rungs of `tests/vh-adlc/loop/rungs.test.ts` (`verify` always, `integration` on `backend/**`, `kind` on `e2e/**`) and a feature that changes `backend/`; at `--stage task` and at `--stage completion` the output has `applicable` equal to the literal `["verify", "integration"]`, `results` equal to literal name, state and reason triples (`verify` passed `exit 0`, `integration` passed `exit 0`, `kind` not run with the path-condition reason), `advance` true and `blocking` `[]`, values written down from the plugin before this feature. |
| AC-06 | `bun test tests/vh-adlc/direct-operation-compatibility.test.ts`: the implement skill contains `rungs --repo <dir> --base <default branch> --stage task --run true` and `--record`, contains no match for `rungs --repo <dir> --base <default branch> --run true`, and its Finish section contains `--stage task`, `deferred`, `vh-adlc next` and `ship` and no `--run`; the ship skill contains `--stage completion`, `--merge <merge commit> --stage completion`, `--record` and `only the feature document`. |
| AC-07 | `bun test tests/vh-adlc/direct-operation-compatibility.test.ts`: `references/loop-settings.md` contains a `verification_rungs[].stages` table row, `--stage`, `deferred`, `completion commit` and the `version` read from `plugins/vh-adlc/.claude-plugin/plugin.json`; `docs/user-guides/workflows.md` contains `completion stage`. |
| AC-08 | `bun test tests/vh-adlc/check.test.ts`: the existing "portable and Claude metadata describe one shared package" check proves the two manifests are equal and the existing "a package change comes with a version change" check proves the version differs from `origin/main`; then the written procedure: compare `version` in `git show origin/main:plugins/vh-adlc/.claude-plugin/plugin.json` with the branch's, and pass only when the branch's has the minor component one above and the patch at 0. No test pins a literal version, so later lock bumps do not break it. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-21 | R-1 | spec | `21057d50` | claude-opus-5-5 | procedural | Five should-fix findings and one nit; no blocking finding |
| 2026-11-21 | R-2 | spec | `51881bc3` | claude-opus-5-5 | procedural | Four should-fix findings and one nit; no blocking finding |

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
