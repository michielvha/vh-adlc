# Maintenance: first test-value batch from the phase 1 audit

## Definition

Outcome: apply proposals 1 to 5 of the
[phase 1 test-value audit](../analysis/test-value-audit.md), which the owner approved on
[#170](https://github.com/michielvha/vh-adlc/issues/170#issuecomment-7215733347), as one PR. The
batch covers the two families the audit measured, `closure-controller` and `normal-preparation`.
The other heavy fixtures and families stay follow-ups, each with its own measurement.

Preserved contract: the plugin's runtime code and public behaviour do not change. Only tests change.
Every behaviour a changed test guarded stays guarded, shown by the same mutants killed before and
after the change.

Task base: `d0deac947b0a4c332783eccb37da2cd4adc8d8e6`, origin/main merged into the batch branch on 2026-11-28 before its review (first created from `e910dfe888d0f8e3ede251c9e8b82a516b004bab`). The batch's own changes are `git diff d0deac94...HEAD`.

Affected paths:

- Proposal 5: `tests/vh-adlc/review-convergence.test.ts`, `tests/vh-adlc/owner-summary.test.ts`,
  `tests/vh-adlc/settings-file.test.ts`, `tests/vh-adlc/proportional-review.test.ts` and
  `tests/vh-adlc/docs-impact/collection.test.ts`. (`tests/vh-adlc/audit/entry.test.ts` was changed and
  then restored to the task base after review R-2: it already prepared the binary itself.)
- Proposal 3: `tests/vh-adlc/docs-drift/run-approval.test.ts`
- Proposal 4: `tests/vh-adlc/docs-drift/run-directory.test.ts`
- Proposals 2 and 4: `tests/vh-adlc/docs-drift/normal-preparation.test.ts`
- Proposal 1: `tests/vh-adlc/docs-drift/closure-controller.test.ts` and
  `tests/vh-adlc/docs-drift/original-closure-fixture.ts`
- `docs/internal/analysis/test-value-audit.md` (the correction of the audit's reading of mutant C)
- `tests/vh-adlc/evidence/test-value-batch/` (retained mutant and empty-cache evidence)
- this record

Verification inputs: the whole `plugins/vh-adlc` tree at the task base, because the docs-drift journeys
copy and hash it as their fixture component; in particular `plugins/vh-adlc/scripts/docs-drift/`,
`plugins/vh-adlc/scripts/settings-file.ts`, `plugins/vh-adlc/scripts/ensure-vh-adlc.sh` and
`plugins/vh-adlc/vh-adlc.lock.json`. Bun 1.4.5 as CI uses it, and the CI timings of run
[45898546605](https://github.com/michielvha/vh-adlc/actions/runs/45898546605). A change to the plugin tree
after the review needs the journey checks again.

Proposed change:

1. Build `originalClosureFixture` once per fixture shape in `closure-controller.test.ts`, keep a
   pristine copy, and restore it into the same absolute path before each test, so each test still
   starts from its own unchanged state.
2. In `normal-preparation`, run the variant-independent publication refusals in one variant only,
   after a full mutant set over those refusal guards shows the remaining variant and the unit tests
   kill every mutant the dropped repetitions killed.
3. Add a small test for the missing `approval.yaml` refusal (`run-approval.ts:26`) beside
   `run-approval.test.ts`.
4. Add a small test for an opened run that loses its host ownership record (`run-directory.ts:180`),
   and make the journey's copied-run step assert the diagnostic only the CLI's ownership check
   (`run-cli.ts:246`) produces.
5. In the test files that called the installer with `--offline` themselves, and in the two files
   review R-1 found reading the offline YAML reader before any installer call, resolve the binary
   without `--offline` before the first offline use, so each of those files passes alone with an empty
   binary cache. Other test files that reach the offline settings reader without preparing the binary
   are outside this batch (see the residuals after review R-3).

Required checks:

- Each changed file passes alone with `--timeout 60000` and the coreutils PATH on the Mac.
- Each proposal 5 file passes alone with its own empty binary cache, and fails that way at the task base
  where it depended on another file.
- Mutants A, B and C from the audit, and the full refusal mutant set for proposal 2 (A, B, D, E), are
  killed on the final change by the tests that remain. Mutant C must be killed after proposal 4.
- The per-file time of `closure-controller.test.ts` and `normal-preparation.test.ts` on CI for the PR
  head, against run 45898546605 on main. Local timings count only when taken at comparable load.
- `go test ./...` is not affected. CI on the final PR head passes on Linux and macOS; its Linux
  checker job is the full plugin checker on the final change. (The separate Mac full run was dropped by
  the workstream orchestrator on 2026-11-27, because it would only reconfirm the known macOS failures.)
- Mutant runs keep their full logs, with the failing test and assertion, so a setup error cannot count
  as a kill.

## Evidence

All runs on the owner's Mac with Bun 1.4.5, `--timeout 60000` or longer and the coreutils PATH, at the
load averages noted. Other sessions ran on the same machine throughout.

Proposal 5 (`6b0c6986`). Every test caller of the installer with `--offline` that did not download
first was changed: six files, three more than the audit named, after a search for the flag. The six
files pass (98 pass, 1 skip, the existing macOS-only skip in `docs-impact/collection.test.ts`). The
empty-cache failure was not reproduced: the session's host refuses a changed `HOME`, and the installer
ignores `XDG_CACHE_HOME` on macOS. The installer writes the binary to a temporary file and renames it,
so parallel files can download at once. CI already prepares the binary before the checker step, which
is why CI never failed this way.

Proposal 3 (`448ce516`). The new small test in `run-approval.test.ts` kills mutant A in 2 seconds.
Before it, only the 45 second journeys killed A.

Proposal 4 (`448ce516`, `e956a550`). The audit's reading was wrong: the CLI refuses a copied run at
`run-cli.ts:246` before publication, so mutant C (`run-directory.ts:180`) is unreachable from the
journey. C guards an opened run that loses its host ownership record. The new small test in
`run-directory.test.ts` covers that case and kills C in 2 seconds. The journey's copied-run step now
asserts the diagnostic only `run-cli.ts:246` produces; mutant D, which disables that check, is killed
by it (below). The analysis document is corrected in `e956a550`.

Proposal 2 (`a397bfb2`). Mutants over the guards the refusal steps reach, before the change, with the
tightened assertion in place:

| Mutant | Guard disabled | `run-approval` | `run-directory` | matching | caller-change | mixed-plans | prepare-protocol |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | missing `approval.yaml`, `run-approval.ts:26` | killed | survived | killed | killed | killed | killed |
| B | approval digest, `run-approval.ts:32` | killed | survived | killed | killed | killed | killed |
| D | copied run, `run-cli.ts:246` | survived | survived | killed | killed | killed | killed |
| E | stage artifact check, `run-directory.ts:137` | survived | killed | killed | killed | killed | killed |

After the change the refusals run in the matching variant only, and that variant alone kills A, B, D
and E. The four variants pass. The journey file took 784 seconds before (load 11 to 13) and 1,475 seconds
after (load 16 to 21); the load difference makes these two numbers useless as a comparison.

Proposal 1 (`4839c6af`). `closure-controller.test.ts` passes, 9 of 9, in 1,598 seconds at load near 4.
The unchanged file, run from a scratch copy at load 10 to 21, failed two tests on their own 365 and
180 second limits, an environment failure under load and not a product result. Local before and after
timing for this file is therefore not evidence. No mutant is needed for this proposal because every
test still runs, each from restored pristine state.

The docs-drift typecheck, which includes the docs-drift tests, passes on `4839c6af`.

CI on the PR head `e2a8e87b`, run [46001117339](https://github.com/michielvha/vh-adlc/actions/runs/46001117339),
passed on Linux and macOS: 4,426 tests in 281 files, 0 failures, 1,565 seconds for the checker step. Against
main's run 45898546605 (one run each, so the differences carry run-to-run noise):

| File | Main | PR head |
| --- | ---: | ---: |
| `closure-controller.test.ts` | 518 s | 442 s |
| `normal-preparation.test.ts` | 183 s | 177 s |
| `run-approval.test.ts` | 0.9 s (1 test) | 1.2 s (2 tests) |
| `run-directory.test.ts` | 6.1 s (24 tests) | 6.8 s (25 tests) |

In `closure-controller`, the seven tests that use the shared fixture after the first each lost 10 to
18 seconds, except the mistaken-resume test (55 to 57 s), and the hosted variant, which keeps its own
build, stayed at 85 s. The saving is 77 seconds, less than the audit's estimate of about 190: restoring the
fixture costs part of what rebuilding did. Running the refusals once saved about 6 seconds, so proposal 2's
value in this family is the removed repetition, not time.

The separate Mac full run was dropped by the workstream orchestrator; the CI checker job covers the full
suite on CI's hardware.

### After review R-1

Proposal 5, R-1 F-01 (`8aa5c191`). The reviewer found that `settings-file.test.ts` and
`docs-impact/collection.test.ts` still failed alone with an empty cache, because they use the offline YAML
reader before any installer call. Both now download the binary in file setup when it is missing. Each of
the six proposal 5 files then ran alone with its own empty `XDG_CACHE_HOME` on fedora-43 (Linux, Bun 1.4.3),
at the task base and with the fix; the table and failure lines are in
[`tests/vh-adlc/evidence/test-value-batch/empty-cache.md`](../../../tests/vh-adlc/evidence/test-value-batch/empty-cache.md).
Five files failed at the base and all six pass with the fix, except one `settings-file` test that also fails
on that host with a warm cache (a host difference; it passes on macOS and CI). On the Mac, both changed
files pass (52 pass, 1 existing skip).

Proposal 2, R-1 F-02. The matrix above was rerun at load 2 to 3 with every log kept: the four-variant
file from `448ce516` as a scratch copy for the before runs, and the committed file for the after run.
The results match the table above, and each kill fails at the refusal assertion its guard serves, never in
setup. Logs, the runner and the summary are in
[`tests/vh-adlc/evidence/test-value-batch/mutants/`](../../../tests/vh-adlc/evidence/test-value-batch/mutants/README.md).

R-1 F-03. The Definition now names the whole `plugins/vh-adlc` tree as a verification input, because the
journeys copy and hash it, and states that the CI checker job on the final head is the full run. The final
head's CI is recorded below once it finishes.

R-1 F-04. The Definition now lists every affected path with its proposal.

### After review R-2

R-2 F-01. Both journey files pass standalone on the Mac at the batch's final plugin tree (the R-2 fix
changes only `tests/vh-adlc/audit/entry.test.ts`): `normal-preparation.test.ts` 4 of 4 in 444 seconds and
`closure-controller.test.ts` 9 of 9 in 1,337 seconds, at load 2 to 3 on 2026-11-28; the logs are
`tests/vh-adlc/evidence/test-value-batch/standalone-*.log`. Exact-head CI run
[46099403238](https://github.com/michielvha/vh-adlc/actions/runs/46099403238) for `654b02fe`: the Linux checker passed
(4,443 pass, 0 fail, 1,546 seconds; `closure-controller` 380 s, `normal-preparation` 157 s), and so did
`checker-macos`, `verify` and `paseo-hosts`. `remote-gui` failed one browser test, "two inline taps edit a URL and a
field through stock Chromium and noVNC", on its focus assertion. The batch changes no `remote-gui` file, the job
passed at `cfe3f7d9` with the same remote-gui sources, and the same assertion failed on
`fix/instruction-freshness` in run [46027026365](https://github.com/michielvha/vh-adlc/actions/runs/46027026365). It is
an intermittent failure outside this batch, reported to the workstream orchestrator for an issue; a pass on rerun
is not treated as a fix.

R-2 F-02. The audit had concluded too much from a narrow sample. Mutant C, run with logs against
`run-directory.test.ts`, is killed by 8 existing tests at the task base and 9 at the head, so it was already
guarded. A narrower mutant C2 that trusts the opened run's cached origin survives every task-base test and is
killed only by the new small test. With the CLI's copied-run check disabled (D), the copy reaches C's guard and ends
`incomplete`, which the old assertion also rejected; the tightened assertion makes the refusal reason explicit.
Logs and tables: `tests/vh-adlc/evidence/test-value-batch/mutants/README.md`. The analysis document is corrected to
say this.

R-2 F-03. `tests/vh-adlc/audit/entry.test.ts` is restored to the task base: it already prepared the binary
online and passed with an empty cache, so its change was outside the approved repair.

R-2 F-04 (residual, for the owner). On the exact head, `closure-controller.test.ts` is still over the medium file
budget (380 s against 300 s) and six of its tests, and all four `normal-preparation` variants, are over 30 seconds.
The batch lowered both files, but meeting the budgets needs further work beyond the approved proposals. The owner kept
the medium defaults; the breaches go to the owner as a decision, not into this batch.

### After review R-3

R-2 F-04 decision. The workstream orchestrator, under the owner's delegation, accepted the remaining medium-budget
breaches as tracked residuals for this PR on 2026-11-28 (ledger [#179](https://github.com/michielvha/vh-adlc/issues/179)):
`closure-controller.test.ts` at 380 seconds against the 300 second file budget, six of its tests over 30 seconds, and all
four `normal-preparation` variants over 30 seconds. They stay open against [#170](https://github.com/michielvha/vh-adlc/issues/170)
for phase 2.

R-3 F-01 (residual). `run-approval.test.ts` and `run-directory.test.ts` also fail alone with an empty cache, because
they reach the offline YAML reader (`settings.ts:521`) before any installer call; this was true at the task base too.
The same likely holds for other docs-drift files that read settings, which this batch did not measure. Fixing two more
files would leave the rest, so the Definition now limits proposal 5 to the files it fixed, and the suite-wide
dependence goes to #170 phase 2, where one shared preparation step can remove it. CI prepares the binary before the
checker step, so CI is not affected.

R-3 F-03. The final-head `remote-gui` job failed again, this time in the Go test
`TestDaemonReplacementRevokesTheSession` (`identity_test.go:262`, connection reset by peer), before the browser checks.
The batch changes no remote-gui source, test or workflow. The occurrence is added to
[#188](https://github.com/michielvha/vh-adlc/issues/188), which tracks this job's intermittent failures.

R-3 F-02. Final-head CI run [46102592683](https://github.com/michielvha/vh-adlc/actions/runs/46102592683) for
`a93ed40e`: the Linux checker passed (4,443 pass, 0 fail) and so did `checker-macos`, `verify` and `paseo-hosts`;
`remote-gui` failed as described under R-3 F-03. This runner was slow across the whole suite (2,011 seconds against
1,546 for `654b02fe`, and 56 tests over 30 seconds against 32), so the journeys measured 502 seconds for
`closure-controller` and 218 for `normal-preparation`, with the same journey files and plugin tree that measured 380 and
157 seconds one head earlier. Single CI runs vary this much; the before-and-after comparison stands on the paired runs
above, and the budget residual uses the faster figures only as one observation.

## Reviews

### R-1

Target: `cfe3f7d9a44ca7df570bdebb251554e0a1b9a713`.
Model: gpt-6.2-sol, attested from Codex session log `rollout-2026-11-28T03-12-46-01a21fed-29a2-7931-b124-a29bf4c7cfa1.jsonl` (the reply's own header said `MODEL: unknown`).
Isolation: procedural. Separate operator authorised by the workstream orchestrator, because the command route has no maintenance-review kind ([#205](https://github.com/michielvha/vh-adlc/issues/205)): a fresh clone of the pushed head under `$TMPDIR`, run as `env -i PATH HOME TMPDIR USER LANG TERM=dumb codex exec -m gpt-6.2-sol --json -s workspace-write` with the clone as working directory and `references/maintenance-review.md` plus the dispatch inputs as the prompt. Codex CLI 0.172.0. The clone's HEAD and status were unchanged afterwards, and the owning worktree's HEAD, status and branch were unchanged.

```text
FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: `docs/internal/maintenance/test-value-batch.md:45`, proposal 5
EVIDENCE: With a separate empty `HOME` for each file, Bun 1.4.5 reported one failure in `settings-file.test.ts` and two in `docs-impact/collection.test.ts`. Both files use the offline YAML reader before reaching the installer calls changed by this batch. Both passed after explicitly seeding their scratch caches, with one existing macOS skip in collection. The same empty-cache check failed on the task base and passed at the reviewed commit for `owner-summary.test.ts`.
PROPOSAL: Prepare the verified binary before the first offline reader use in each affected file. Run each file alone with its own empty cache.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: `docs/internal/maintenance/test-value-batch.md:81–93`, proposal 2 mutation evidence
EVIDENCE: Independent scratch runs confirmed A and B fail `run-approval.test.ts` and C and E fail `run-directory.test.ts` at the reviewed commit. The record reports the before-and-after journey matrix without execution output. The matrix and the copied-run failure under D remain unverified.
PROPOSAL: Retain the commands and assertion failures for A, B, D and E against the four-variant version before removal and the retained matching variant on the final inputs. Show where each failure occurs so setup errors cannot count as kills.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: `docs/internal/maintenance/test-value-batch.md:48–56, 95–121`, required checks and CI evidence
EVIDENCE: The earlier Linux CI logs confirm the reported journey timings, about 518 to 442 seconds for `closure-controller` and 183 to 177 seconds for `normal-preparation`, at `e2a8e87b`. Both journeys copy and hash the entire `plugins/vh-adlc` tree, which changed before `cfe3f7d9`. At review close, the exact-head macOS CI job had passed and the Linux checker was still running. I ran the smaller files and typecheck independently and used the earlier CI logs for the journeys. The standalone journey checks and the separately queued full local checker remain unverified. [Earlier CI](https://github.com/michielvha/vh-adlc/actions/runs/46001117339), [exact-head CI](https://github.com/michielvha/vh-adlc/actions/runs/46096871591)
PROPOSAL: Record the full fixture payload as a verification input. Retain the standalone journey results, the queued full checker result, and the Linux CI verdict and timings from the final candidate.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: `docs/internal/maintenance/test-value-batch.md:11–25, 45–46`, preserved contract and affected paths
EVIDENCE: The task-base diff changes only tests and documentation, which fits bounded maintenance and preserves the public contract. The Definition omits `tests/vh-adlc/audit/entry.test.ts`, `tests/vh-adlc/docs-drift/run-directory.test.ts`, `tests/vh-adlc/docs-impact/collection.test.ts`, `tests/vh-adlc/proportional-review.test.ts`, and `docs/internal/analysis/test-value-audit.md`. It still names three installer files while the diff changes six. The review clone’s worktree, refs and index matched their starting state.
PROPOSAL: Update the Definition to identify every affected path and its role in the approved proposals, then review the revised Definition at the resulting commit.
```

### R-2

Target: `654b02fe95d0f0231b086add914bc5adb42f63fe`.
Model: gpt-6.2-sol, attested from Codex session log `rollout-2026-11-28T03-42-57-01a22008-ce3f-7ce0-9e85-0c0ef3794a07.jsonl` (the reply's own header said `MODEL: unknown`).
Isolation: procedural, the same separate-operator settings as R-1 (fresh clone of the pushed head under `$TMPDIR`, `env -i`, `codex exec -m gpt-6.2-sol --json -s workspace-write`, Codex CLI 0.172.0). The clone's HEAD and status and the owning worktree's HEAD, status and branch were unchanged afterwards.

```text
FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: `docs/internal/maintenance/test-value-batch.md:55-66`, required standalone checks and final-head CI
EVIDENCE: The Definition now names the full plugin tree, addressing that part of R-1 F-03. On the exact head, the eight smaller files and docs-drift typecheck passed. The standalone journeys stopped in setup. `normal-preparation` hit `EPERM` spawning `ps`, and `closure-controller` hit the same fixed-ref fetch error on the task base and target. Both journeys passed in Linux CI at `cfe3f7d9` with identical journey files and plugin tree. At review close, exact-head macOS CI had passed, the Linux checker was still running, and `remote-gui` had failed its first-tap focus assertion. Exact-head journey timings remain unavailable. [Prior Linux checker](https://github.com/michielvha/vh-adlc/actions/runs/46096871591/job/140830133550), [exact-head CI](https://github.com/michielvha/vh-adlc/actions/runs/46099403238)
PROPOSAL: Retain passing standalone results from a Mac that can run both fixtures and the completed exact-head CI verdict and timings. Record the disposition of the `remote-gui` failure before completion.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: `docs/internal/maintenance/test-value-batch.md:60-68,86-91` and `docs/internal/analysis/test-value-audit.md:138-143`
EVIDENCE: The retained A, B, D and E logs address R-1 F-02. The required full log for mutant C is absent from the evidence directory. In independent scratch runs, removing C's guard failed eight existing tests at the task base and failed the new test at the target. A narrower mutant that trusted the opened run's cached ownership passed all 24 base tests and failed the new test at `run-directory.test.ts:109`. The retained D log also shows that disabling the CLI guard changes the outcome to `incomplete`, which the old `setup-required` assertion already rejected.
PROPOSAL: Retain the full mutant C logs and correct the audit to identify the new coverage as revalidation of an already opened run. Describe the copied-run diagnostic assertion as making the refusal reason explicit.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: `tests/vh-adlc/audit/entry.test.ts:15-17,53`, proposal 5
EVIDENCE: All six installer files passed independently with separate empty caches on macOS, with one existing skip. This resolves R-1 F-01. The Definition lists every changed path, resolving the inventory gap in R-1 F-04. The task-base diff preserves the plugin tree and public contract, and the review clone's HEAD, refs, index and worktree matched their starting state. One test edit falls outside the approved load-order repair. `audit/entry.test.ts` already installed the binary online in `beforeAll` and passed all five tests with an empty cache at the task base. The edit makes its second installer call online-capable as well. [Owner approval](https://github.com/michielvha/vh-adlc/issues/170#issuecomment-7215733347)
PROPOSAL: Restore the second installer call's `--offline` flag and update the affected-path list.

FINDING: F-04
KIND: factual
SEVERITY: blocking
WHERE: `docs/internal/maintenance/test-value-batch.md:62-63,119-130`, journey timing budgets
EVIDENCE: The directed test strategy sets medium-test budgets at 30 seconds per test and five minutes per file, and the owner retained those defaults. Linux CI at `cfe3f7d9`, with the same journey files and plugin tree as the target, measured 349 seconds for `closure-controller`, with six tests above 30 seconds. All four `normal-preparation` variants also exceeded 30 seconds. [Test strategy](https://github.com/vhco-pro/docs/blob/1fbe501bb9cee3e672fbe698c968fe36d8919f4d/conventions/test-strategy.md#time-budgets), [Linux checker](https://github.com/michielvha/vh-adlc/actions/runs/46096871591/job/140830133550)
PROPOSAL: Record the exact-head measurements and take any remaining budget breaches to the owner for a decision. Further optimization needs its own authorization if it exceeds the approved batch.
```

### R-3

Target: `a93ed40e15dfb276db5ca9ed440a472bdc68b1e2`.
Model: gpt-6.2-sol, attested from Codex session log `rollout-2026-11-28T04-23-49-01a2202e-368f-72a3-ae1d-22884c53218f.jsonl` (the reply's own header said `MODEL: unknown`).
Isolation: procedural, the same separate-operator settings as R-1. The clone's HEAD and status and the owning worktree's HEAD, status and branch were unchanged afterwards.

```text
FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: `docs/internal/maintenance/test-value-batch.md:52-60`, proposal 5 and standalone checks
EVIDENCE: All five listed installer callers passed independently on macOS with Bun 1.4.5 and separate empty binary caches after failing at the task base. The restored `audit/entry.test.ts` passed all five tests at both commits. Two other changed files still depend on a populated cache. With separate empty caches, `run-approval.test.ts` failed 2 of 2 tests and `run-directory.test.ts` failed 25 of 25. Both reached the offline YAML reader at `settings.ts:521` before the verified binary was available. Both passed with a seeded cache.
PROPOSAL: Prepare the verified binary in test setup before either file reaches the offline reader. Rerun both files alone with separate empty caches.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: `docs/internal/maintenance/test-value-batch.md:63-67`, final-head CI and journey timings
EVIDENCE: The macOS checker passed at the review target. The required full Linux checker was still running when checked. The sandbox denied `ps`, so I used the retained Mac standalone logs and the completed Linux checker at `654b02fe`, which has identical journey and plugin inputs. Those Linux logs show all 13 journey tests passing, with totals of 380 s and 157 s against the main baseline of 519 s and 183 s. The delegated budget disposition covers the remaining overages. The final-head Linux verdict and timings are still missing. [Final-head run](https://github.com/michielvha/vh-adlc/actions/runs/46102592683), [prior Linux checker](https://github.com/michielvha/vh-adlc/actions/runs/46099403238/job/140838171517), [main baseline](https://github.com/michielvha/vh-adlc/actions/runs/45898546605/job/140191139348), [delegation ledger](https://github.com/michielvha/vh-adlc/issues/179)
PROPOSAL: Retain the completed Linux checker result and both journey timings for the final candidate before closing maintenance.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: `docs/internal/maintenance/test-value-batch.md:162-173`, remote-gui failure disposition
EVIDENCE: The final-head `remote-gui` job failed in `TestDaemonReplacementRevokesTheSession` at `identity_test.go:262` with `connection reset by peer`. The job stopped before the browser checks. The delegated disposition in #188 covers the earlier focus failure. The remote-gui source, tests, and CI workflow match the task base. The task diff contains only declared test and documentation paths, and the review clone’s HEAD, refs, index and worktree status matched their starting state. [Final-head remote-gui job](https://github.com/michielvha/vh-adlc/actions/runs/46102592683/job/140848160424), [tracked focus failure](https://github.com/michielvha/vh-adlc/issues/188#issuecomment-7233038573)
PROPOSAL: Record the Go test failure and obtain a separate disposition from the workstream orchestrator before completion.
```

## State

Reviews R-1 to R-3 are stored. Every finding is fixed or recorded as a residual with its disposition: the journey budget breaches (accepted as tracked against #170 under the owner's delegation), the suite-wide offline-reader dependence (#170 phase 2) and the intermittent remote-gui failures (#188). Ready for the owner; CI for this record-only head is reported on the PR.
