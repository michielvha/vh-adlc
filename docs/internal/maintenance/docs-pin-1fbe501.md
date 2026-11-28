# Maintenance: move the docs pins to vhco-pro/docs 1fbe501

## Definition

Outcome: the repository pin in `AGENTS.md` and the plugin pin in `plugins/vh-adlc/knowledge.md` both move
to vhco-pro/docs `1fbe501bb9cee3e672fbe698c968fe36d8919f4d`, the docs main tip, so that
`conventions/test-strategy.md` can be cited for
[#170](https://github.com/michielvha/vh-adlc/issues/170). The owner approved the plugin pin moving through
a PR; the repository pin moves in the same PR because `tests/vh-adlc/proportional-review.test.ts:267`
requires both pins to match. The decision is recorded on the workstream ledger
[#179](https://github.com/michielvha/vh-adlc/issues/179).

Preserved contract: the plugin's procedures and binary do not change. Repositories without their own pin
read the conventions at the new revision after this release, as with every earlier pin move.

Task base: `d0deac947b0a4c332783eccb37da2cd4adc8d8e6`, origin/main merged into the branch on 2026-11-28 before its review (first created from `4137984349f4756522c27711764b057b0e5a5a7d`). The task's own changes are `git diff d0deac94...HEAD`.

Affected paths: `AGENTS.md`, `plugins/vh-adlc/knowledge.md`, `plugins/vh-adlc/plugin.json`,
`plugins/vh-adlc/.claude-plugin/plugin.json`, the comment on `COMPANION_DOCS_PIN` in
`tests/vh-adlc/fixtures/build.ts`, and this record.

Verification inputs: vhco-pro/docs between `e79eaa6` and `1fbe501` (12 commits: the test strategy
convention, knowledge pages on Remote Control hosts, full URL references, hosting defaults and
infrastructure conventions), and the tests that read the pin.

Proposed change: replace the pin in both files, bump the plugin to 0.37.0 (main is at 0.34.0, and 0.35.0 and 0.36.0 are taken by `feat/blog-visual-reading` and `fix/instruction-freshness`), and route test changes in
`AGENTS.md` to `conventions/test-strategy.md` as well as `conventions/testing.md`.
`COMPANION_DOCS_PIN` stays at `e79eaa6`, because it names the revision that holds the proportional review
convention and the recorded scenario evidence ran against it; only its comment, which said it equals the
pins, changes.

Required checks: `vh-adlc knowledge` resolves every page `AGENTS.md` routes to at the new pin; the
pin-reading tests pass; CI on the PR head passes. The Linux `checker` job runs the full plugin checker; `checker-macos`
runs a portable subset.

## Evidence

`vh-adlc knowledge` (0.43.1) at `1fbe501` resolved `AGENTS.md`, `conventions/coding.md`, `testing.md`,
`test-strategy.md`, `feature-documents.md`, `go.md`, `typescript.md`, `delivery.md`,
`knowledge/shared-delivery.md`, `guides/humanize-prose.md` and `guides/onboard-a-repository.md` with no
findings.

`check.test.ts`, `proportional-review.test.ts`, `fixtures.test.ts`, `review-convergence.test.ts` and
`settings-references.test.ts` pass on macOS with Bun 1.4.5 (136 tests) at load near 3.

After main was merged in on 2026-11-28 (task base `d0deac94`) and the version moved to 0.37.0, the same five files plus
main's new `tests/vh-adlc/loop/pages.test.ts` pass on macOS with Bun 1.4.5 (138 tests). After the merge, no file
outside recorded evidence and specs still names `e79eaa6` except `COMPANION_DOCS_PIN`, which keeps it on purpose.

Baseline at the task base `d0deac94` (macOS, Bun 1.4.5, 2026-11-28): `vh-adlc knowledge` at the old pin `e79eaa6`
returns `missing-page` for `conventions/test-strategy.md`, and the same six test files pass (138 tests).

### After review R-1

F-01. The version bump touches `plugins/vh-adlc/plugin.json`, which `docs/specs/instruction-freshness.md` and
`docs/specs/blog-visual-reading.md` cover. Merging this PR before them makes their stored reviews report covered drift
on that file; the earlier statement that no in-flight review goes stale held only for `AGENTS.md` and `knowledge.md`.
Any PR that bumps the plugin version has the same effect, so the merge order is the owner's call. The PR description is
corrected.

F-02. The required check now names the suite each platform runs. The final-head CI result is recorded below.

F-03. The baseline above is added.

CI on the reviewed head `8dbfb70e`, run [46102731305](https://github.com/michielvha/vh-adlc/actions/runs/46102731305): every job passed, including the full Linux `checker`, `checker-macos`, `remote-gui`, `paseo-hosts`, `verify` and `version`. CI for this record-only follow-up head is reported on the PR.

## Reviews

### R-1

Target: `8dbfb70e3aa3dad103306352862ac56336cf8372`.
Model: gpt-6.2-sol (reported, and attested from Codex session log `rollout-2026-11-28T04-25-10-01a2202f-720f-7061-a171-f185b7dbb0e9.jsonl`).
Isolation: procedural. Separate operator authorised by the workstream orchestrator ([#205](https://github.com/michielvha/vh-adlc/issues/205)): a fresh clone of the pushed head under `$TMPDIR`, `env -i PATH HOME TMPDIR USER LANG TERM=dumb codex exec -m gpt-6.2-sol --json -s workspace-write`, Codex CLI 0.172.0, with `references/maintenance-review.md` plus the dispatch inputs as the prompt. The clone's HEAD and status were unchanged afterwards. The owning worktree changed only by an edit the author made to another branch's record during the run.

```text
FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Maintenance Definition, proposed version bump and PR merge order
EVIDENCE: The [pin PR](https://github.com/michielvha/vh-adlc/pull/190) says no in-flight review goes stale. In a scratch clone, `vh-adlc fresh` reported instruction-freshness R-10 and blog-visual-reading R-55 as fresh with `origin/main` at the task base. With `origin/main` at the reviewed commit, both reported `covered-drift` on `plugins/vh-adlc/plugin.json`. The [instruction-freshness PR](https://github.com/michielvha/vh-adlc/pull/192) was still open.
PROPOSAL: Correct the PR’s freshness claim and have the owner settle the merge order. Recheck the affected reviews against the resulting default branch.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: `docs/internal/maintenance/docs-pin-1fbe501.md:32`, required CI
EVIDENCE: At 03:32 UTC, the exact-head `checker-macos` job had passed and the Linux `checker` and `remote-gui` jobs were still running. `.github/workflows/ci.yml:70` runs the full plugin checker on Linux. The macOS job runs a portable subset at line 98. [Exact-head CI run](https://github.com/michielvha/vh-adlc/actions/runs/46102731305)
PROPOSAL: Record the completed exact-head CI results and correct the Definition and PR description to name the suite each platform runs.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: `docs/internal/maintenance/docs-pin-1fbe501.md:35`, baseline evidence
EVIDENCE: The Evidence section contains candidate results only. In the independent run, `vh-adlc knowledge` returned `missing-page` for `conventions/test-strategy.md` at the old pin and resolved all 40 routed pages at the new pin. The six selected Bun files passed all 138 tests at the reviewed commit. On the task base, the standalone fixture CLI test timed out at 180 seconds on the first run and passed on retry.
PROPOSAL: Append the baseline commands, exact commit, and observed outcomes, including the timeout and retry.
```


## State

Review R-1 is stored. F-02 and F-03 are addressed; F-01 is corrected in the record and PR description, and the merge order relative to the other version-bumping PRs is the owner's call. Ready for the owner.
