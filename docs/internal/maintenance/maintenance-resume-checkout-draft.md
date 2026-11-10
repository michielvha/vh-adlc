# Maintenance: Resume a run whose report is a checkout draft

## Definition

Outcome: Repair issue #68. `maintenance resume` must accept a run whose security result was saved in a checkout draft, including after a later `security-reconcile` and typed `append`. Uncommitted history entries must carry a `local:` provenance label, and a failed security verification must print its cause.

Preserved contract: `docs/specs/maintenance-security-resolution.md` (AC-08 and the history rules) and `plugins/vh-adlc/references/maintenance.md`. Resume and report-candidate commits still revalidate packet, source, policy and evidence bindings. Packet, source and policy drift still invalidates a receipt, and a claimed reconciliation that the packet does not produce is still rejected. Local-only history stays labelled local. The stored security result, its `validation` receipt and the report block formats are unchanged.

Task base: `07217be07b85cfbb933000512f63d28c4bf6cb38` (origin/main).

Affected paths: `plugins/vh-adlc/scripts/maintenance/security-io.ts`, `plugins/vh-adlc/scripts/maintenance/cli.ts`, `tests/vh-adlc/maintenance/security-cli.test.ts`, `plugins/vh-adlc/references/maintenance.md`, `plugins/vh-adlc/plugin.json`, `plugins/vh-adlc/.claude-plugin/plugin.json`, and this record.

Verification inputs: The affected paths, the rest of `plugins/vh-adlc/scripts/maintenance/`, `tests/vh-adlc/`, `.github/workflows/ci.yml`, and engineering conventions at `f781ee7b0404e80194aa568af3284888cc222017`.

Proposed change: This takes the narrower option from the issue, so the receipt format stays as it is. When `security-reconcile` reads history, a history-directory report whose observation block belongs to the current run counts as that run's own report. It contributes only its security revisions. It adds no file provenance and no legacy observations, and it does not suppress a byte-identical supplied copy. During verification it contributes only revisions numbered below the claimed revision, so appends made after the claim are ignored. Supplied packet copies are digest-pinned and stay unfiltered, so forged successors in them still produce gaps. Identical same-run revisions from the report and a copy count once. Uncommitted history entries are labelled `local:<path>:<digest>`. The CLI wraps the security verification in `resume`, `report --security` and typed `append` and prints `maintenance security verification failed: <cause>`. It shows the cause only for the helpers' own plain errors; system and parser errors print a fixed phrase. Both plugin manifests move to 0.15.1, as the package check requires.

Required checks: Observe the issue's reproduction failing at the task base and passing afterwards, along with the append variant, the local-label check and the stderr check. `bun test tests/vh-adlc --timeout 60000` must pass, apart from failures that also occur at the task base. The CI documentation-impact typecheck, a strict `tsc` of `scripts/maintenance/cli.ts` and `git diff --check` must pass. Obtain an independent maintenance review of the committed repair.

## Evidence

Conventions: vhco-pro/docs@f781ee7b0404e80194aa568af3284888cc222017 (repository pin, AGENTS.md); prose edited with guides/humanize-prose.md. Knowledge resolution returned answered with no findings.

The work is in a fresh clone at `/home/m/code/vh-adlc-issue68` on branch `fix/maintenance-resume-checkout-draft`. The shared checkout at `/home/m/code/vh-adlc` is on an unrelated feature branch with uncommitted files, and it was left untouched.

At the task base the three new tests failed (log `/tmp/vh-adlc-issue68-red.log`). The reproduction stopped in `resume` with `security reconciliation result changed or falsely reconciled`. The other two showed `commit:undefined:<path>:<digest>` provenance labels, one of them for the run's own report.

A first version also filtered later same-run revisions out of supplied packet copies. The existing test `imported digest-valid successors cannot narrow a run or erase its earlier occurrences` then failed, because the forged revision 2 no longer produced a gap. Limiting the filter to the run's own report fixed it.

Final checks: `tests/vh-adlc/maintenance/security-cli.test.ts` passes 14 of 14. `bun test tests/vh-adlc --timeout 60000` passes 1291 of 1292 (log `/tmp/vh-adlc-issue68-full.log`). The one failure is `tests/vh-adlc/fixtures.test.ts`, where the fixture installer rejects the host's `/usr/local/bin/vh-adlc` 0.19.0 because its digest does not match the lock. That test fails the same way in a clean checkout of the task base, so it comes from the host. Before the version bump, `check.test.ts` also required a manifest version change; it passes at the bumped version. The CI documentation-impact typecheck passes. Strict `tsc` (TypeScript 7.0.2, bun types) reports no errors for `scripts/maintenance/cli.ts` and its imports, the same as at the task base. `git diff --check` is clean. Hosted CI has not run because nothing is published.

## Reviews

## State

Review pending.
