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
