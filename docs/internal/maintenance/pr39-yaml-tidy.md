# Maintenance: Finish the YAML v3 patch update

## Definition

Outcome: Repair PR #39 so its YAML v3.0.6 update passes the existing module and Go checks.

Preserved contract: Keep the YAML v3 API, strict settings parsing, feature parsing, workflow validation and delivery gates unchanged.

Task base: `8a89a574b13304c5242ef974ba6e23489d0a5357`, after merging current main into the selected bot head `3591e4a3cfef48bef9a536b78d9df865a3dba571`.

Affected paths: `go.sum` and this maintenance record.

Verification inputs: `go.mod`, `go.sum`, `.golangci.yml`, root Go source and tests, `.github/workflows/ci.yml`, and engineering conventions at `0e52f51f01b84eda75a976763c42d8ec0a07b544`.

Proposed change: Run the pinned Go toolchain's module normalization to remove obsolete v3.0.5 checksums while retaining v3.0.6.

Required checks: Observe the original `go mod tidy -diff` failure, then pass `go mod tidy -diff`, `go test ./...`, `go vet ./...`, golangci-lint 2.15.0 configuration verification and lint, and `git diff --check`. Obtain independent maintenance review of the committed repair. Hosted CI must pass at the pushed head before merging.

## Evidence

Conventions: vhco-pro/docs@0e52f51f01b84eda75a976763c42d8ec0a07b544 (repository pin, AGENTS.md); prose edited with guides/humanize-prose.md. Knowledge resolution returned answered with no findings.

The owner requested repairs to the three blocked PRs after requesting their merge where possible. This task owns branch `fix/pr39-yaml-tidy` in `/home/m/code/vh-adlc-pr39-fix`; existing worktrees and dirty files remain untouched. The baseline tidy check exited 1 and proposed removing only the two obsolete v3.0.5 entries from go.sum. Initial sandbox attempts could not write Go caches; those failures are environment restrictions, not module-check results. The successful reproduction used Go 1.27.2 with its writable task cache.

All required local checks passed with Go 1.27.2 and golangci-lint 2.15.0. The repair removes exactly the obsolete checksum pair. Log: `/tmp/vh-adlc-pr39-go-checks.log`. Hosted CI remains pending publication.

## Reviews

Pending.

## State

Review pending; module tidiness, all root Go tests, vet, golangci-lint 2.15.0 configuration and lint, and diff whitespace checks passed.
