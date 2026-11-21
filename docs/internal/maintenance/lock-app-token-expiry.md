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

## Independent review

### R-1

Target: `530d05b13ac798608eef6e5f5bafb96e4b727392`.
Model: gpt-6.2-sol. Isolation: procedural.

```text
FINDING: F-01  
KIND: factual  
SEVERITY: blocking  
WHERE: `.github/workflows/lock.yml:65`  
EVIDENCE: The polling step starts after any check registers. `gh pr checks --watch` exits successfully when its current rollup has no pending or failed contexts. The live #144 rollup initially omitted the downstream `version` job, and `main` has no ruleset to enforce its completion. The mock accepts a partial rollup and cannot show that the full CI run passed. [GitHub CLI source](https://github.com/cli/cli/blob/trunk/pkg/cmd/pr/checks/checks.go#L191-L239)  
PROPOSAL: Wait for the `ci.yml` push run that matches the recorded head SHA and branch to complete successfully. Use `actions: read` for that lookup and preserve the fresh installation token and expected head check at merge.
```

### R-2

Target: `adba610f9ef0c3cf6e8d35b2c53ccd8a8c6af767`.
Model: gpt-6.2-sol. Isolation: procedural.

```text
NO FINDINGS
```

Local verification and independent review are complete. Publication and a hosted release workflow run are pending.
