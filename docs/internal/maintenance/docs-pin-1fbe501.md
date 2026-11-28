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
pin-reading tests pass; CI on the PR head passes on Linux and macOS, which runs the full plugin checker.

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

CI on the PR head: pending.

## Reviews

None yet.

## State

Review pending, held for the Codex route on macOS like the first test-value batch. Local candidate.
