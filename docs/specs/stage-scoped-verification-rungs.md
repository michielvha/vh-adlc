---
status: draft
status_description: "Owner answers folded; waiting for an independent spec review."
issue: null
goal: "Each task's verification runs only the rungs declared for the task stage, while push, completion and delivery still require every applicable rung at the exact commit."
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
checks less than today. The rule that a result recorded at another commit does not count is unchanged.

Implement runs `--stage task` at each task. Ship runs `--stage completion` before pushing and after the
merge. When a rung was held back for the completion stage, implement no longer sets `complete` itself:
it names ship as the next step, and ship runs the completion stage once, right before push and completion
at the same commit. Rungs without `stages` keep today's flow.

Out of scope: per-rung stages beyond `task` and `completion` (such as separating push from delivery),
caching rung results between invocations, and any change to how the implementation reviewer works. The
review operation does not call the `rungs` command today and stays unchanged.

Compatibility: an older plugin refuses a settings file that uses `stages`, because rung keys are
checked strictly. Adopters update the plugin before adding the field. Removing the field restores today's
behaviour, which is also the rollback.

Planned checks: unit tests for settings validation and rung selection, CLI tests that prove a
completion-only rung is not executed at the task stage and blocks at the completion stage, and procedure
text checks for implement and ship. None has run yet. The owner answered the three open questions (a
`stages` list, a completion default for the flag, completion left to ship); no review has run yet. Acceptance authorizes implementing this document on a feature branch and opening one PR with a
plugin minor version bump; merging stays with the owner.

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
  (`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:51-55`).
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
- Tests for each of the above, and a plugin minor version bump to 0.29.0 in both manifests.

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

`cli.ts rungs` accepts `--stage task` or `--stage completion`. Without the flag the stage is `completion`
Any other value, or `--stage task` together with `--merge`, prints `{status: "error", reason}` and
exits 2, like other argument errors (`plugins/vh-adlc/scripts/loop/cli.ts:175-178`); delivery is a
completion-stage check by definition.

The output gains `stage`. At stage `task`, a rung whose path condition holds but whose `stages` lacks
`task` is reported `not run` with the reason `it runs at the completion stage only`, is never executed, and
takes no part in the verdict, the same way an inapplicable path rung is treated today. A `--record` for such
a rung is ignored at stage `task`. The output also gains `deferred`: the names of those held-back rungs, in
declaration order, and an empty list at stage `completion`. `mayAdvance` and its commit rule do not change; the completion stage
still requires every applicable rung to have passed at the commit being pushed, completed or delivered.

Settings without any `stages` field produce, at either stage, the same applicable list, results and verdict
as today, apart from the added `stage` key.

### Procedures

- Implement, per task: `bun scripts/loop/cli.ts rungs --repo <dir> --base <default branch> --stage task
  --run true`. A task is not ticked unless every task-stage rung passed at its commit.
- Implement, Finish: when the last task-stage run at `HEAD` reported a non-empty `deferred`, implement
  does not run `vh-adlc gate complete` or set `complete`. It reports the held-back rungs and names ship as
  the next step, which `vh-adlc next` already returns for an `in-progress` feature whose tasks are done
  and whose implementation review is clean. With an empty `deferred`, Finish is unchanged.
- Ship, before pushing and before setting `complete`: the same command with `--stage completion`. After the
  merge: `--merge <merge commit> --stage completion`, from a checkout of that merge commit.

### Concurrency, failure and upgrade

The command reads settings and runs checks; it writes no shared state, so concurrent invocations behave as
today. A rung that times out or cannot run at the task stage blocks the task exactly as today. Upgrade: a
plugin older than 0.29.0 refuses settings that use `stages` (strict key check), so the reference states the
minimum plugin version. Rollback is removing the field.

## Acceptance Criteria

- [ ] AC-01: A rung may declare `stages`; settings with an unknown stage value, an empty list, a duplicate
      value or a list without `completion` are refused with a message naming
      `verification_rungs[<i>].stages`, and a rung without the field resolves to both stages.
- [ ] AC-02: `cli.ts rungs --stage task --run true` executes only the applicable rungs whose stages include
      `task`; a completion-only rung is not executed, is reported `not run` with a reason naming the
      completion stage, is listed in `deferred`, and does not block the verdict.
- [ ] AC-03: `cli.ts rungs --stage completion --run true`, and the same command without `--stage`,
      execute every applicable rung whatever its stages, and a failing completion-only rung blocks with exit
      3 and is named in `blocking`.
- [ ] AC-04: `--stage` with a value other than `task` or `completion`, or `--stage task` together with
      `--merge`, exits 2 with an error reason and runs no rung.
- [ ] AC-05: For settings without any `stages` field, the `rungs` output at stage `task` and at stage
      `completion` matches today's output in `applicable`, `results`, `advance` and `blocking`.
- [ ] AC-06: The implement procedure runs the rungs command with `--stage task` at each task's
      verification step, and its Finish step does not set `complete` when that run reported a non-empty
      `deferred`, naming ship as the next step instead; the ship procedure runs it with
      `--stage completion` before pushing and with `--merge <merge commit> --stage completion` after the
      merge.
- [ ] AC-07: The loop settings reference documents `verification_rungs[].stages`, its default, the
      `completion` requirement, the `--stage` flag with its default, and the minimum plugin version; the
      workflows guide says rungs can be limited to the completion stage.
- [ ] AC-08: Both vh-adlc plugin manifests carry version 0.29.0.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc/loop/rungs.test.ts`: new cases load settings with `stages: [bogus]`, `[]`, `[completion, completion]` and `[task]`, each expecting the error to name `verification_rungs[0].stages`, and a rung without the field whose parsed `stages` equals `["task", "completion"]`. |
| AC-02 | `bun test tests/vh-adlc/loop/cli.test.ts`: a fixture with a task rung (`true`) and a completion-only rung whose command writes a marker file and exits 1; `--stage task --run true` exits 0, the marker file does not exist, the completion-only rung's result is `not run` with a reason containing `completion stage`, and `deferred` equals its name. |
| AC-03 | `bun test tests/vh-adlc/loop/cli.test.ts`: the same fixture with `--stage completion --run true` and with no `--stage` each exits 3, the marker file exists, and `blocking` contains the completion-only rung. |
| AC-04 | `bun test tests/vh-adlc/loop/cli.test.ts`: `--stage push` and `--stage task --merge <sha>` each exit 2 with `status: "error"`, and a rung command that writes a marker file has not run. |
| AC-05 | `bun test tests/vh-adlc/loop/cli.test.ts`: the existing three-rung fixture without `stages`, run at `--stage task` and `--stage completion`, yields equal `applicable`, `results` (names, states, reasons), `advance` and `blocking` to a run without `--stage`. |
| AC-06 | `bun test tests/vh-adlc/direct-operation-compatibility.test.ts`: the implement skill contains `--stage task` and the ship skill contains `--stage completion` and `--merge <merge commit> --stage completion`; the implement skill's Finish section contains `deferred` and `ship`. |
| AC-07 | `bun test tests/vh-adlc/direct-operation-compatibility.test.ts`: `references/loop-settings.md` contains a `verification_rungs[].stages` table row, `--stage`, and `0.29.0`; `docs/user-guides/workflows.md` contains `completion stage`. |
| AC-08 | `bun test tests/vh-adlc`: the existing manifest checks pass, and a check reads `version` from `plugins/vh-adlc/plugin.json` and `plugins/vh-adlc/.claude-plugin/plugin.json` and expects `0.29.0` in both. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-21 | R-1 | spec | `21057d50` | claude-opus-5-5 | procedural | Five should-fix findings and one nit; no blocking finding |

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
