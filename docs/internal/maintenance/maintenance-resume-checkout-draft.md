# Maintenance: Resume a run whose report is a checkout draft

## Definition

Outcome: Repair issue #68. `maintenance resume` must accept a run whose security result was saved in a checkout draft, including after a later `security-reconcile` and typed `append`. Uncommitted history entries must carry a `local:` provenance label, and a failed security verification must print its cause.

Preserved contract: `docs/specs/maintenance-security-resolution.md` (AC-08 and the history rules) and `plugins/vh-adlc/references/maintenance.md`. Resume and report-candidate commits still revalidate packet, source, policy and evidence bindings. Packet, source and policy drift still invalidates a receipt, and a claimed reconciliation that the packet does not produce is still rejected. Local-only history stays labelled local. The stored security result, its `validation` receipt and the report block formats are unchanged.

Task base: `07217be07b85cfbb933000512f63d28c4bf6cb38` (origin/main).

Affected paths: `plugins/vh-adlc/scripts/maintenance/security-io.ts`, `plugins/vh-adlc/scripts/maintenance/cli.ts`, `tests/vh-adlc/maintenance/security-cli.test.ts`, `plugins/vh-adlc/references/maintenance.md`, `plugins/vh-adlc/plugin.json`, `plugins/vh-adlc/.claude-plugin/plugin.json`, and this record.

Verification inputs: The affected paths, the rest of `plugins/vh-adlc/scripts/maintenance/`, `tests/vh-adlc/`, `.github/workflows/ci.yml`, and engineering conventions at `f781ee7b0404e80194aa568af3284888cc222017`.

Proposed change: This takes the narrower option from the issue, so the receipt format stays as it is. When `security-reconcile` reads history, the file at the run's recorded report path counts as the run's own report, provided its observation block names the run. It adds no file provenance and does not suppress a byte-identical supplied copy. During verification it contributes only revisions numbered below the claimed revision, so appends made after the claim are ignored. When none of its revisions remain, its open alerts are still imported as unresolved observations, referenced by path rather than by the digest an append replaces. Any other file that names the run keeps its provenance and all its revisions. Supplied packet copies are digest-pinned and stay unfiltered, so forged successors in them still produce gaps. Identical same-run revisions from the report and a copy count once. Uncommitted history entries are labelled `local:<path>:<digest>`. The CLI wraps the security verification in `resume`, `report --security` and typed `append` and prints `maintenance security verification failed: <cause>`. It shows the cause only for the helpers' own plain errors; system and parser errors print a fixed phrase. Both plugin manifests move to 0.15.1, as the package check requires.

Required checks: Observe the issue's reproduction failing at the task base and passing afterwards, along with the append variant, the local-label check and the stderr check. `bun test tests/vh-adlc --timeout 60000` must pass, apart from failures that also occur at the task base. The CI documentation-impact typecheck, a strict `tsc` of `scripts/maintenance/cli.ts` and `git diff --check` must pass. Obtain an independent maintenance review of the committed repair.

## Evidence

Conventions: vhco-pro/docs@f781ee7b0404e80194aa568af3284888cc222017 (repository pin, AGENTS.md); prose edited with guides/humanize-prose.md. Knowledge resolution returned answered with no findings.

The work is in a fresh clone at `/home/m/code/vh-adlc-issue68` on branch `fix/maintenance-resume-checkout-draft`. The shared checkout at `/home/m/code/vh-adlc` is on an unrelated feature branch with uncommitted files, and it was left untouched.

At the task base the three new tests failed (log `/tmp/vh-adlc-issue68-red.log`). The reproduction stopped in `resume` with `security reconciliation result changed or falsely reconciled`. The other two showed `commit:undefined:<path>:<digest>` provenance labels, one of them for the run's own report.

A first version also filtered later same-run revisions out of supplied packet copies. The existing test `imported digest-valid successors cannot narrow a run or erase its earlier occurrences` then failed, because the forged revision 2 no longer produced a gap. Limiting the filter to the run's own report fixed it.

Final checks: `tests/vh-adlc/maintenance/security-cli.test.ts` passes 14 of 14. `bun test tests/vh-adlc --timeout 60000` passes 1291 of 1292 (log `/tmp/vh-adlc-issue68-full.log`). The one failure is `tests/vh-adlc/fixtures.test.ts`, where the fixture installer rejects the host's `/usr/local/bin/vh-adlc` 0.19.0 because its digest does not match the lock. That test fails the same way in a clean checkout of the task base, so it comes from the host. Before the version bump, `check.test.ts` also required a manifest version change; it passes at the bumped version. The CI documentation-impact typecheck passes. Strict `tsc` (TypeScript 7.0.2, bun types) reports no errors for `scripts/maintenance/cli.ts` and its imports, the same as at the task base. `git diff --check` is clean. Hosted CI has not run because nothing is published.

R-1 response. F-01 is fixed: while the own report has no revision below the claimed one, its open alerts are imported as unresolved observations again. Their `raw_reference` is `local:<path>#<alert>`, without the file digest. F-02 is fixed: the own report is the file at `run.state.report.relative_path` whose observation block names the run, and any other file keeps its provenance and all its revisions. Two tests cover them. One saves a draft without `--security`, reconciles a later collection that omits the alert, appends to the draft, verifies the stored result and resumes. The other adds a second file that names the run with a forked revision 1. Both failed at `dbddbe3` (log `/tmp/vh-adlc-issue68-red2.log`) and pass now. `tests/vh-adlc/maintenance` passes 236 of 236. `bun test tests/vh-adlc --timeout 60000` passes 1293 of 1294 (log `/tmp/vh-adlc-issue68-full2.log`); the one failure is the same host-binary `tests/vh-adlc/fixtures.test.ts` failure seen at the task base. The CI documentation-impact typecheck passes and `git diff --check` is clean.

R-2 response. F-01 is fixed: identical same-run revisions now count once only when the run's own report supplies that revision, as the Definition says. Duplicates elsewhere still produce a fork gap, as at the task base. The new test `two history copies of a run's revision outside its report still count as a fork` failed at `b8f0f89` (log `/tmp/vh-adlc-issue68-red3.log`) and passes now. `tests/vh-adlc/maintenance` passes 237 of 237. `bun test tests/vh-adlc --timeout 60000` passes 1294 of 1295 (log `/tmp/vh-adlc-issue68-full3.log`), and the one failure is again the host-binary fixtures test. The CI documentation-impact typecheck passes and `git diff --check` is clean.

## Reviews

### R-1

Target: `dbddbe3` on `fix/maintenance-resume-checkout-draft`
Model: unknown (identity not attested by the host)
Isolation: procedural

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: plugins/vh-adlc/scripts/maintenance/security-io.ts:120 (own-report branch in reconcileSecurityPacket); record Definition "Proposed change" and "Preserved contract"
EVIDENCE: At line 120, `if(file.report&&legacy?.run_id===id){add(found.filter(earlier));continue;}` skips the legacy-observation import for any history report that names the current run. Before this change, that import kept earlier-observed alerts open, under the rule "Older reports remain evidence of outstanding observations, never proof of their resolution". I ran a throwaway probe from the existing `setup()` fixture. It saved a checkout-draft report without `--security`, so the report holds open dependabot alert 1. It then ran `security-reconcile` with a later inventory that omits the alert and has no terminal evidence. At the base 07217be the result kept `["github.com/example/project/dependabot:1",false,"unknown"]` with open remediation 1 and accounting `pending`. At the target dbddbe3 the result had observations `[]`, open remediation 0 and accounting `reconciled`. An alert that the run's own report recorded as open now disappears, and the run reports a reconciled result with no positive closure evidence. This breaks AC-08 of docs/specs/maintenance-security-resolution.md ("never drops work"), which the record lists as preserved. The record's Proposed change says the own report "adds no ... legacy observations", but neither the record nor plugins/vh-adlc/references/maintenance.md identifies this as a change to that contract.
PROPOSAL: Keep importing the own report's legacy observations when it has no same-run revisions below the claimed revision. Give them a `raw_reference` that does not include the changing file digest, so verification stays deterministic after appends. Add a regression test where a later same-run collection omits an alert from the saved draft.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: plugins/vh-adlc/scripts/maintenance/security-io.ts:110-121
EVIDENCE: A file counts as the run's own report when any history-directory file has an observation block with this run's `run_id`. The check does not use the path the run recorded (`run.state.report.relative_path`), which is the identification the issue proposed. Every matching file loses its path provenance, adds no legacy observations, and has its same-run revisions filtered by `before` during verification. Other-run revisions in such a file are also added without file provenance. Probe at the target: after a checkout draft with revision 1, I wrote a second file `fork.md` to the history directory. It copied the draft with a different digest-valid revision 1. `resume` at the base failed with `security reconciliation result changed or falsely reconciled`, and at the target it passed. The next `security-reconcile` recorded the gap `forked snapshot revision`, but its `history_provenance` held only a snapshot digest. At the base it also held `...:.vh-adlc/reports/maintenance/fork.md:<digest>`, so the target no longer records which file carried the conflicting revision.
PROPOSAL: Treat only the run's recorded report path (its working-tree and published copies) as the own report. Other files that name the run should keep their path provenance and their unfiltered revisions. Add a test with a second file that names the run.

### R-2

Target: `b8f0f89` on `fix/maintenance-resume-checkout-draft`
Model: claude-opus-4.8 (reported by the reviewer; no model was requested)
Isolation: procedural

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: plugins/vh-adlc/scripts/maintenance/security-io.ts:113 (`add`); record Definition "Proposed change"
EVIDENCE: The Definition says "Identical same-run revisions from the report and a copy count once" and "Any other file that names the run keeps its provenance and all its revisions". The `add` helper is wider than that. It skips every same-run revision whose digest is already present, whichever file supplied it, so it also applies to two ordinary history files. I ran a throwaway probe from the test file's `setup()` fixture. It saved a private draft (read_only request) holding revision 1, wrote two copies of it to the history directory (`copy1.md`, and `copy2.md` with one extra newline), then ran `security-reconcile`. At base 07217be the result had `history_gaps` `["forked snapshot revision"]`. At target b8f0f89 it had `history_gaps` `[]`. Both results had snapshot_revision 2 and accounting `pending`. Duplicates of a same-run revision in files other than the run's report therefore no longer produce a gap. The Definition and the R-1 response do not disclose this behavior change, and no test covers it. The identical content is not a real fork, so this is not a safety regression, but the code now departs from the Definition, which is the review baseline.
PROPOSAL: Limit the digest dedupe to revisions that the run's own report supplies, matching the Definition. Alternatively, amend the Definition and maintenance.md to say that identical same-run revisions from any history source count once, and add a test for two non-own files.

## State

Review pending.
