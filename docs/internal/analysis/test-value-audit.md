---
issue: https://github.com/michielvha/vh-adlc/issues/170
---

# Analysis: test-value audit of the vh-adlc plugin checker, phase 1

Measured on 2026-11-27 against `58415856` (origin/main). This is phase 1 of
[#170](https://github.com/michielvha/vh-adlc/issues/170) as the owner scoped it in
[the recorded answers](https://github.com/michielvha/vh-adlc/issues/170#issuecomment-7214377240): a manual
audit of this repository's own suite that ranks proposals, with any change going out later as one
owner-approved PR. It also takes over the test-structure items of
[#157](https://github.com/michielvha/vh-adlc/issues/157).

The conclusions come from primary sources read in this run: the CI log of the checker job in run
[45898546605](https://github.com/michielvha/vh-adlc/actions/runs/45898546605) at `4f17f9a0`, the test and
plugin source at `58415856`, and probes and mutants run on the owner's Mac. The rules applied are
`conventions/testing.md` at vhco-pro/docs `e79eaa6` (the repository pin) and `conventions/test-strategy.md`
at vhco-pro/docs `1fbe501` (docs main). The second page is not yet at the repository pin; the owner chose
to read it at docs main until the pin moves.

## Summary

The checker runs 4,424 tests in 281 files. On CI they take 5,900 test-seconds and 1,704 seconds of wall
time with four parallel files. docs-drift is 121 of the files and 91.6% of the time. The cost is
concentrated: the 10 slowest files take 55% of the time and the 40 slowest take 87%, while 134 files run
under a second each and add up to 35 seconds.

Deleting tests would save little time. The tests that only check prose cost 0.9 seconds in total. The
time goes into heavy docs-drift tests that rebuild an expensive fixture in every test and into
parameterized families that repeat a whole journey to vary one input. Those are structure problems, and
the [test strategy](https://github.com/vhco-pro/docs/blob/1fbe501bb9cee3e672fbe698c968fe36d8919f4d/conventions/test-strategy.md)
rules on shared setup and on edge-case tables address them without removing coverage.

Line coverage cannot decide removals in this suite. Bun's coverage does not record code that runs in a
child process, and most docs-drift tests drive the CLI or a retained component copy in child processes.
Mutation is the usable evidence. A first sample of three mutants found two kinds of redundancy and one
guard that no test could fail.

## Cost

### Method

Per-test times come from the CI log, which prints every test with its duration. A script grouped them by
file and area (`budget.py` and `variants.py` in the session's scratch directory; the numbers below are
reproducible from the log). The test strategy asks for CI hardware, so local timings serve only for
ratios. A full local run on 2026-11-27 under load averages of 20 to 30 recorded 25,355 test-seconds for a
comparable suite, about 4.3 times the CI figure, so its absolute times are not used.

### Where the time goes

| Area | CI seconds | Share |
| --- | ---: | ---: |
| docs-drift | 5,406 | 91.6% |
| audit | 107 | 1.8% |
| replay | 96 | 1.6% |
| top-level files | 71 | 1.2% |
| maintenance | 68 | 1.2% |
| everything else | 152 | 2.6% |

The slowest files on CI:

| File | Tests | CI seconds |
| --- | ---: | ---: |
| `docs-drift/closure-controller.test.ts` | 9 | 518 |
| `docs-drift/trial-publication.test.ts` | 42 | 420 |
| `docs-drift/native-controller.test.ts` | 13 | 396 |
| `docs-drift/audit-report.test.ts` | 17 | 370 |
| `docs-drift/closure-worker.test.ts` | 27 | 361 |
| `docs-drift/publication-bindings.test.ts` | 65 | 313 |
| `docs-drift/native-refresh.test.ts` | 15 | 263 |
| `docs-drift/trial-entry.test.ts` | 53 | 232 |
| `docs-drift/normal-preparation.test.ts` | 4 | 183 |
| `docs-drift/delivery-ack.test.ts` | 227 | 179 |

### Against the budgets

The suite's tests spawn processes and use local Git, so under the test strategy they are medium tests:
30 seconds per test and 5 minutes per file. On CI, 38 tests are over 30 seconds and take 1,817 seconds
together; 6 files are over 5 minutes. The longest single test is the normal resolution journey at
114 seconds. The repository records no budgets of its own yet, which the test strategy asks for.

### Repeated fixture setup

`closure-controller.test.ts` builds `originalClosureFixture` at the start of each of its 9 tests. The
fixture runs the full closure pipeline (adopted component, native closure, worker inputs and review
target) before the test's own steps begin. A probe that only built the fixture took 99.5, 101.5 and
99.8 seconds in three runs on the Mac at a load average near 9. The two lightest tests of the file took
451 seconds together under the same load, and 29 and 66 seconds on CI. Scaling by that ratio, the fixture
is about 21 seconds of each CI test: roughly 70% of the lightest one and about 190 of the file's
518 seconds across its tests. The heavy files share a handful of fixtures:
`original-publication-fixture` appears in 8 of the 23 docs-drift files over 60 seconds,
`manifest-fixture` in 9 and `repository-fixture` in 12. Their setup cost per test is not measured yet.

### Parameterized families

Tests that differ only in a variant suffix form 125 families of three or more, with 718 tests and
1,222 seconds on CI, 21% of the total. The largest is `normal-preparation.test.ts`: four variants of
one journey (scan, prepare, verify, four refused publications, publish and resume) at 45 seconds each.
Every variant repeats the whole journey, including the refusals, although only its last steps differ.
The next largest are `audit-session` (8 variants, 98 seconds), three families in `trial-publication`
(232 seconds together) and `assessment-review` (6 variants, 62 seconds).

### Parallel floor

Bun parallelizes files, not tests. With four workers, the ideal wall time is about 1,475 seconds
(5,900 / 4), well above the slowest file's 518 seconds. Splitting `closure-controller.test.ts`, as
#157 proposed, lowers CI wall time only when there are more than about 11 workers. It does help a
local run with many workers, where that file is the last to finish.

## Value

### Coverage cannot see child processes

A probe with one function called in-process and another called through `Bun.spawnSync` showed the
child-process function with zero hits in Bun's lcov output, although its test passed. The docs-drift
journeys run `scripts/docs-drift/cli.ts` in child processes, and several import the controller from a
retained copy of the component, whose path differs from the source. Coverage overlap would report those
tests as covering little, so it cannot show that their behaviour stays covered after a removal.

### Mutation sample

Each mutant disabled one guard in the source, ran one test selection and restored the file. A failing run
counts as a kill.

| Mutant | Guard disabled | `run-approval.test.ts` (1 s on CI) | Each of the 4 `normal-preparation` variants |
| --- | --- | --- | --- |
| A | missing `approval.yaml` refusal, `run-approval.ts:26` | survived | killed |
| B | approval digest must match the manifest, `run-approval.ts:32` | killed | killed |
| C | run must be the original host's, `run-directory.ts:180` | survived | survived |

What this shows, within the three mutants sampled:

- All four variants kill A and B, so for these guards three of the four journeys add nothing. Each
  variant's own value is in its distinguishing steps.
- The one-second unit test already kills B, so the wrong-approval step in the 45-second journey is
  redundant for that guard.
- Only a 45-second journey kills A. The test strategy asks for that check in a small test.
- Nothing kills C. A first reading blamed the journey's copied-run step; the batch that followed
  corrected it. The CLI refuses a copied run at `run-cli.ts:246` before publication starts, so no CLI
  journey can reach C. C guards an already opened run whose host ownership record has since gone, and
  no test covered that case. The journey's copy assertion had a weakness of its own: it checked only
  for `setup-required`, which a missing approval also produces, so it did not show that the ownership
  check was the one that refused. `testing.md` asks a test to assert something only the intended path
  produces.

### Prose-only tests

Fourteen files read Markdown and assert only on its text in every test, for example
`proportionality.test.ts`, `blog.test.ts` and `review-convergence.test.ts`. Together they have 58 tests
and take 0.9 seconds on CI. Another 61 files mix such tests with behavioural ones (308 of their 926 test
blocks). The `seo.test.ts` example from the work item lives on `feat/seo-agent`, not on main; it follows
the same pattern. These tests prove that a sentence exists, not that a reader or an agent acts on it.
Their cost is upkeep: each wording change in the guarded documents fails them. Removing them saves no run
time. The detection is a text heuristic and needs a manual read before any proposal names a file.

### Load-order dependence

`review-convergence.test.ts:11` and `owner-summary.test.ts:8` run `ensure-vh-adlc.sh --offline` when the
file loads and throw if it fails. With an empty binary cache they pass only when another file has already
downloaded the binary, which the
[#157 analysis](https://github.com/michielvha/vh-adlc/blob/58415856/docs/internal/analysis/checker-runtime.md)
observed. `testing.md` asks each test to create what it needs before it loads. This run did not
reproduce it: the host refuses a changed `HOME`, and the installer ignores `XDG_CACHE_HOME` on macOS.

## Proposals, ranked

Ranked by expected CI time saved per unit of risk. None removes a test without the evidence the test
strategy requires; each states what covers the behaviour afterwards.

1. Build heavy fixtures once per file. Build `originalClosureFixture` once in `closure-controller.test.ts`
   and give each test its own copy of the built directories, so each test still owns its state. Repeat
   for the other shared heavy fixtures after measuring their setup share. Coverage is unchanged because
   every test still runs. Expected saving for that file is up to about 190 of its 518 CI seconds; the
   total across the heavy fixtures is not yet measured.
2. Collapse journey families. Run a shared journey once per family, and keep only each variant's
   distinguishing steps in its own test. For `normal-preparation`, mutants A and B show the shared steps
   are killed by every variant. Each removed repetition needs the same mutation check against the
   steps it drops. Upper bound across all families: 1,222 seconds minus one member each.
3. Move the missing-approval check down. Add a small test for guard A beside
   `run-approval.test.ts`, then drop the repeated refusal steps from the journeys. Mutant A is the
   evidence to rerun after the move.
4. Cover the ownership checks. Add a small test for an opened run that loses its host ownership
   record, which mutant C must fail, and make the journey's copied-run step assert the diagnostic only
   the CLI's ownership check produces.
5. Remove the load-order dependence. Resolve the binary in shared setup that can download it, or
   through the same helper other files use, rather than an offline call at load.
6. Split `closure-controller.test.ts`. This is a lower priority on CI with four workers; it pays off
   on runners with many workers and after proposal 1.
7. Record the project's budgets in its testing documentation and treat the 38 tests over 30 seconds
   as review failures to fix or move, as the test strategy requires. This needs an owner decision on the
   values.
8. Decide on prose-only tests. Keep them, replace them with a cheaper documentation check, or remove
   them under the removal rule. Mutation does not apply to prose, so this is an owner decision on what
   they are for.

## Harm and the simpler alternative

The harm: every PR waits about 28 minutes for the checker on CI, and local runs on a loaded machine take
hours and fail on timeouts that are not defects. It affects the few developers of this repository on
every change, and it grows with each feature because tests are only added.

The simpler alternative to building audit machinery is this manual audit plus the changes above, made by
hand. That is the recommendation for this repository now. A reusable audit operation should cover only
the steps that repeated here: parsing per-test CI times into budgets and families, and running sampled
mutants with restore. Coverage overlap is not worth automating for Bun suites that run code in child
processes.

## Open hypotheses

- The setup share of the other heavy fixtures is unmeasured; proposal 1's total saving depends on it.
- Three mutants are a sample of one family. The family proposals need a mutant set per family before any
  test is dropped.
- Flakiness was not measured. CI run history and retries are the next source.

## Verdict

Act now on proposals 1 to 5 as one PR, after the owner approves the batch and with each step's evidence
rerun on the final change. Track proposals 6 to 8: the split waits for proposal 1 and more parallel
workers, and the budgets and prose tests wait on owner decisions.
