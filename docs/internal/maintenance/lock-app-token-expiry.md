# Maintenance: keep binary lock merges authenticated

## Definition

Outcome: let the existing binary lock workflow merge after successful CI even when the wait exceeds the GitHub App token lifetime.

Preserved contract: a successful signed release can propose a monotonic, checksum verified lock update. GitHub App authentication still opens the branch and PR. The existing concurrency and merge gates still apply. Merge the checked head only.

Task base: `5438acbead9342046fe2911ff3d6772cee26d42d`.

Affected path: `.github/workflows/lock.yml`.

Verification inputs: the lock workflow, existing release helper, CI workflow and GitHub App token action pin.

Proposed change: poll checks with a read-only job token. Wait for the push-triggered CI workflow for the exact branch and commit to succeed, then check the PR rollup. Mint a fresh installation token before merging and pass the original PR head to GitHub.

Required checks: actionlint and shell syntax. Exercise passing and failing checks, missing checks and the final expected-head argument with fake credentials. Confirm actual GitHub behavior on a subsequent release before declaring the automation restored.

## Evidence

The [v0.40.1 lock run](https://github.com/michielvha/vh-adlc/actions/runs/44934947091) opened PR #144 successfully, then received HTTP 401 while polling. The job cleanup reported an expired installation token.

The edited workflow passed actionlint. A local mock ran the polling and merge shell blocks. Passing CI and PR checks reached the merge path. A failed run, failed PR checks, or a startup timeout returned nonzero. The merge command used the fresh credential and expected head. The hosted lock workflow still needs a real run after delivery.

## State

Independent review pending. Local candidate.
