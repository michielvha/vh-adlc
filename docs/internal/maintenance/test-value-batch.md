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

Task base: `e910dfe888d0f8e3ede251c9e8b82a516b004bab`, origin/main when the batch branch was created.

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
4. Give the copied run in `normal-preparation` a valid `approval.yaml` and assert the refusal that
   only the original-host check produces (`run-directory.ts:180`).
5. Resolve the binary without `--offline` in the three files that call the installer offline, so a
   file no longer depends on another file having downloaded the binary first.

Required checks:

- Each changed file passes alone with `--timeout 60000` and the coreutils PATH on the Mac.
- Mutants A, B and C from the audit, and the full refusal mutant set for proposal 2, are killed on
  the final change by the tests the audit names. Mutant C must be killed after proposal 4.
- The per-file time of `closure-controller.test.ts` and `normal-preparation.test.ts` before and after,
  measured on the same host in the same session, and on CI for the PR head.
- `go test ./...` is not affected; the full plugin checker runs once on the final change as its own
  queued job, and CI on the PR head passes on Linux and macOS.

## Evidence

Pending.

## Reviews

None yet.

## State

Active.
