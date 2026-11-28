# Refusal mutant matrix for proposal 2

Run on the owner's Mac (Bun 1.4.5, coreutils PATH) on 2026-11-28 between 03:22 and 03:41 CET, load 2 to 3,
at the reviewed head `cfe3f7d9` plus the R-1 fix commit `8aa5c191` (test files only). `matrix.sh` applies
each mutant to its source file, runs one test selection, restores the file with `git checkout`, and keeps
the log; each log starts with the mutant's source diff and the exact command.

`before-*` runs use `zz-np-before.test.ts`, a scratch copy of `normal-preparation.test.ts` from commit
`448ce516`: four variants, each with the refusal steps, and the tightened copied-run assertion. `after-matching`
runs the committed file, where only the matching variant has the refusal steps.

| Mutant | Guard disabled | run-approval | run-directory | before: matching | caller-change | mixed-plans | prepare-protocol | after: matching |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | missing `approval.yaml`, `run-approval.ts:26` | killed at `run-approval.test.ts:44` | survived | killed at `zz-np-before.test.ts:77` | killed at `zz-np-before.test.ts:77` | killed at `zz-np-before.test.ts:77` | killed at `zz-np-before.test.ts:77` | killed at `normal-preparation.test.ts:80` |
| B | approval digest, `run-approval.ts:32` | killed at `run-approval.test.ts:29` | survived | killed at `zz-np-before.test.ts:95` | killed at `zz-np-before.test.ts:95` | killed at `zz-np-before.test.ts:95` | killed at `zz-np-before.test.ts:95` | killed at `normal-preparation.test.ts:98` |
| D | copied run, `run-cli.ts:246` | survived | survived | killed at `zz-np-before.test.ts:82` | killed at `zz-np-before.test.ts:82` | killed at `zz-np-before.test.ts:82` | killed at `zz-np-before.test.ts:82` | killed at `normal-preparation.test.ts:85` |
| E | stage artifact check, `run-directory.ts:137` | survived | killed at `run-directory.test.ts:87` | killed at `zz-np-before.test.ts:91` | killed at `zz-np-before.test.ts:91` | killed at `zz-np-before.test.ts:91` | killed at `zz-np-before.test.ts:91` | killed at `normal-preparation.test.ts:94` |

The journey kills fail at the refusal assertion each guard serves: line 77 of the four-variant file
(80 after the change) is the missing-approval outcome, 82 (85) the copied-run diagnostic, 91 (94) the
missing-reviewer outcome and 95 (98) the wrong-approval exit code. No kill comes from setup.

## Mutant C and the original-host check (after review R-2)

`mutC.sh` disables the original-host check of an opened run (`run-directory.ts:180`); `mutC2.sh` makes it trust
the opened run's cached origin instead of rereading the host record. Both ran against `run-directory.test.ts` at the
task base `d0deac94` (as a scratch copy) and at the batch head, on the Mac, 2026-11-28.

| Mutant | Task base `run-directory.test.ts` | Head `run-directory.test.ts` |
| --- | --- | --- |
| C, check disabled | killed: 8 of 24 tests fail (`C-run-directory-task-base.log`) | killed: 9 of 25 fail, including the new test (`C-run-directory-head.log`) |
| C2, cached origin trusted | survived: 24 pass (`C2-run-directory-task-base.log`) | killed: only the new test, "an opened original run stops executing once its host ownership record is gone", fails (`C2-run-directory-head.log`) |

So existing tests already guarded C. The new small test adds revalidation of an already opened run, which C2 shows
no earlier test checked. The D logs above also show that with the CLI's copied-run check disabled, the copy reaches
C's guard and the outcome becomes `incomplete` with "docs-drift run original host ownership required"; the old
`setup-required` assertion would have rejected that too. The tightened assertion makes the refusal reason explicit.
