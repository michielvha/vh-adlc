# Maintenance: Restore the Linux checker on Ubuntu 26.04

## Definition

Outcome: Fix the failing Linux CI setup so the vh-adlc package checks can run.

Preserved contract: The `checker` job installs Bubblewrap and util-linux, loads the distribution's Bubblewrap AppArmor profile, probes an unprivileged sandbox, and runs the full package checker. Every verification job still gates versioning. Keep the job permissions, triggers, test selection and release policy unchanged.

Task base: `26c00e698860c88c3e2382ca9db5dd4b126c4cc1`.

Affected paths: `.github/workflows/ci.yml`.

Verification inputs: The task-base tree, root `go.mod`, `go.sum`, `.golangci.yml`, `cmd/vh-adlc/workflow_test.go`, `tests/vh-adlc/`, and the Ubuntu 26.04 AppArmor package file list. Use the CI-pinned Bun 1.4.4 and golangci-lint 2.15.0. The maintenance record is local evidence, not a feature document.

Proposed change: Install the `apparmor` package that owns `/etc/apparmor.d/bwrap-userns-restrict` and load that profile instead of the obsolete extra-profile path. Retain the mandatory unprivileged Bubblewrap probe and every downstream check.

Required checks: Inspect the failed main-run setup log before the edit; verify the replacement path against Ubuntu's package manifest; run actionlint, Bash syntax validation of the actual setup step, `go test ./...`, `go vet ./...`, golangci-lint configuration validation and lint, `go mod tidy -diff`, `bun test tests/vh-adlc`, and the github-app-registration plugin tests. Obtain an independent maintenance review at the exact committed repair. A fresh hosted Ubuntu run remains necessary before claiming CI is green.

## Evidence

The task owns branch `fix/linux-ci-apparmor` in the new worktree `/tmp/vh-adlc-ci-apparmor-20261105`, created from freshly fetched main. Existing feature worktrees and local edits remain untouched. The three open PRs at intake change dependency manifests or github-app-registration paths; none changes CI.

Main [run 41953109781](https://github.com/michielvha/vh-adlc/actions/runs/41953109781), job `127001465430`, uses Ubuntu 26.04. Its setup printed `File /usr/share/apparmor/extra-profiles/bwrap-userns-restrict not found, skipping...` and exited 2. The checker tests were skipped. The remote-gui and Go jobs passed.

Ubuntu's [AppArmor package file list](https://packages.ubuntu.com/resolute/amd64/apparmor/filelist) includes `/etc/apparmor.d/bwrap-userns-restrict`. Its [apparmor-profiles file list](https://packages.ubuntu.com/resolute/all/apparmor-profiles/filelist) does not include the old path. This is a distribution packaging compatibility repair. The observed failed setup is the baseline; a new test duplicating the package manifest would not establish kernel compatibility.

Actionlint, Bash syntax validation of the extracted setup step, root Go tests, vet, lint configuration, lint and module tidiness passed on the repair. The unchanged Bubblewrap probe passed as the unprivileged host user; this Fedora host does not verify Ubuntu AppArmor loading. A structured comparison of the before/after workflow confirmed that only the package owner and profile path changed. The full Bun checker is running; its logs and exit receipts are retained under `/tmp/vh-adlc-ci-apparmor-evidence-20261105/`.

The first complete `bun test tests/vh-adlc` run failed: 1011 passed and 66 failed across 1077 tests in 1140.67 seconds. It encountered fixture timeouts and cascading failures while observed host load exceeded 100. The failed log is retained as `checker.log`; it is not a pass. With host load lower, the unchanged first failing fixture passed all 25 tests in isolation, and the exact full-suite command then passed all 1094 tests across 93 files in 346.85 seconds. Test selection and time limits were unchanged. The fresh successful log is `checker-retry.log`, with its exit-zero receipt in `checker-retry.json`.

All 34 github-app-registration tests passed. The root Go suite, vet, module tidiness, golangci-lint 2.15.0 configuration and lint, actionlint and actual setup Bash syntax checks passed. The independent reviewer separately ran actionlint, the workflow Go test, setup syntax and the unprivileged host probe, inspected the failed hosted setup and observed the successful final full-suite and registration receipts. Ubuntu AppArmor kernel loading has not run on this Fedora host; only a fresh hosted build can establish that CI is green.

## Reviews

### R-1

Target: `a2445bfa544b12ee415549b3fdd34ed48251e498`.
Model: unknown; the reviewer did not attest its model identity.
Isolation: procedural.

```text
NO FINDINGS
```

## State

Locally complete. Required local checks passed, and the current independent maintenance review has no findings. Source and Definition remain unchanged from the reviewed commit. The hosted Ubuntu result remains unverified. Publication and merge need separate owner authorization; no remote write has been made for this repair.
