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

Task base: `4137984349f4756522c27711764b057b0e5a5a7d`, origin/main after the batch was rebased onto it (first created from `e910dfe888d0f8e3ede251c9e8b82a516b004bab`; main gained only documentation commits in between).

Affected paths:

- `tests/vh-adlc/review-convergence.test.ts`, `tests/vh-adlc/owner-summary.test.ts` and
  `tests/vh-adlc/settings-file.test.ts` (proposal 5)
- `tests/vh-adlc/docs-drift/run-approval.test.ts` (proposal 3)
- `tests/vh-adlc/docs-drift/normal-preparation.test.ts` (proposals 2, 3 and 4)
- `tests/vh-adlc/docs-drift/closure-controller.test.ts` and
  `tests/vh-adlc/docs-drift/original-closure-fixture.ts` (proposal 1)
- this record

Verification inputs: the plugin source under `plugins/vh-adlc/scripts/docs-drift/` at the task base,
`plugins/vh-adlc/scripts/ensure-vh-adlc.sh` and `plugins/vh-adlc/vh-adlc.lock.json`, Bun 1.4.5 as CI
uses it, and the CI timings of run
[45898546605](https://github.com/michielvha/vh-adlc/actions/runs/45898546605).

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
5. Resolve the binary without `--offline` in the three files that call the installer offline, so a
   file no longer depends on another file having downloaded the binary first.

Required checks:

- Each changed file passes alone with `--timeout 60000` and the coreutils PATH on the Mac.
- Mutants A, B and C from the audit, and the full refusal mutant set for proposal 2 (A, B, D, E), are
  killed on the final change by the tests that remain. Mutant C must be killed after proposal 4.
- The per-file time of `closure-controller.test.ts` and `normal-preparation.test.ts` on CI for the PR
  head, against run 45898546605 on main. Local timings count only when taken at comparable load.
- `go test ./...` is not affected; the full plugin checker runs once on the final change as its own
  queued job, and CI on the PR head passes on Linux and macOS.

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

Not yet observed: CI on the PR head for Linux and macOS, which supplies the per-test before and after
timings against run 45898546605 (518 seconds for `closure-controller`, 183 for `normal-preparation`), and
the full plugin checker on the final change.

## Reviews

None yet.

## State

Review pending. Local candidate; CI and the full checker run are pending.
