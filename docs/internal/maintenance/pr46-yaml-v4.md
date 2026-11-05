# Maintenance: Complete the YAML v4 dependency migration

## Definition

Outcome: Repair PR #46 so the root Go module uses YAML v4.0.0 and passes its existing parsing, module and Go checks.

Preserved contract: Retain the classic YAML entry points and existing strict settings refusals, safe error reporting, feature-document parsing, rules unmarshaling and workflow validation. Preserve delivery policy and plugin source.

Task base: `9955ac8c1e92e2e5051aeee269e4ed8217e8d2af`, after merging current main into the selected bot head `b6c82ee0ff768a6c273d6ef9d8f4d7608ebdd304`.

Affected paths: `go.mod`, `go.sum`, `cmd/vh-adlc/workflow_test.go`, `internal/doc/baseline.go`, `internal/doc/doc.go`, `internal/doc/find.go`, `internal/rules/rules.go`, `internal/settings/settings.go`, `internal/settings/settings_test.go`, `cmd/vh-adlc/testdata/golden/settings-read-unknown-anchor.json`, and this maintenance record.

Verification inputs: The affected paths, all root Go tests, `.golangci.yml`, `.github/workflows/ci.yml`, and engineering conventions at `0e52f51f01b84eda75a976763c42d8ec0a07b544`.

Proposed change: Move every root Go YAML import, including the custom Node-based unmarshaler, to v4. Keep classic Unmarshal, NewDecoder and Node.Decode calls to preserve compatibility. Normalize modules to retain only the used v4 dependency. Preserve negative zero and bare-tag values with a settings compatibility adapter. Keep the existing diagnostic rule: library line numbers are reported when available; update the expectations for v4's newly reported positions rather than retaining v3's missing or inaccurate positions.

Required checks: Observe baseline `go mod tidy -diff` failure; pass `go test ./...`, `go vet ./...`, golangci-lint 2.15.0 configuration verification and lint, `go mod tidy -diff`, `git diff --check`, and a scoped search proving no root Go v3 imports remain. Existing settings acceptance/refusal/line tests and rules tests must pass. Obtain independent maintenance review of the committed repair. Hosted CI must pass at the pushed head before merging.

## Evidence

Conventions: vhco-pro/docs@0e52f51f01b84eda75a976763c42d8ec0a07b544 (repository pin, AGENTS.md); prose edited with guides/humanize-prose.md. Knowledge resolution returned answered with no findings.

The owner requested repairs to the blocked PRs. This task owns branch `fix/pr46-yaml-v4` in `/home/m/code/vh-adlc-pr46-fix`; existing worktrees and dirty files remain untouched. The baseline tidy check exited 1 and removed the unused v4 requirement and obsolete checksums, confirming that the bot update had left callers on v3. The upstream v4.0.0 migration guide supports retaining classic APIs and requires moving custom Node hooks to the new package type. The existing tests exercise scalar and sequence StringList hooks and the strict settings contract.

Source: https://github.com/yaml/go-yaml/blob/v4.0.0/docs/v3-to-v4-migration.md

The import-only migration failed the existing negative-zero and bare-tag cases, the CLI settings golden, and three diagnostic line expectations. Additional bare-tag cases also failed before the adapter. These red results are retained in `/tmp/vh-adlc-pr46-go-checks.log` and `/tmp/vh-adlc-pr46-compat-before.log`. The adapter restores the accepted scalar and key behavior; the focused settings and CLI suites then passed. Only the number from the library error changes for the three syntax cases, consistent with the published settings-reader line rule in `docs/specs/settings-reader.md`. No file or library error text reaches a report.

All final required local checks passed: `go test ./...`, `go vet ./...`, `go mod tidy -diff`, golangci-lint 2.15.0 configuration verification and lint, and `git diff --check`. Added refusal cases prove bare tags do not bypass numeric limits, string-only keys or duplicate-key checks. Root Go imports contain no v3 reference. Current user guides, CLI references, installation docs and README contain no v3 API claim requiring an edit; completed feature documents remain historical evidence. Final check log: `/tmp/vh-adlc-pr46-go-final.log`. Hosted CI remains pending publication.

## Reviews

### R-1

Target: `2d51d4cceace1c748d11d4561768d315567bd8ae`

Model: unknown (identity not attested by the host)

Isolation: procedural

```text
FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: internal/settings/settings.go:242
EVIDENCE: At 2d51d4cceace1c748d11d4561768d315567bd8ae, the default branch comment says !!float is the only remaining tag, but the preceding case now handles !!float explicitly at lines 236-241.
PROPOSAL: Remove the outdated comment or describe the default branch as refusing unsupported scalar tags.
```

R-1 independently ran all required checks and 26 additional bare-tag probes. The returned comment nit is corrected in the following source commit; a fresh focused review is required before publication.

### R-2

Target: `6083906ec86ea8e4f72af0a4392e125480366341`

Model: unknown (identity not attested by the host)

Isolation: procedural

```text
NO FINDINGS
```

### R-3

Target: `22ee488fbbb0e576bbf35b0bce7a0ae56bae7474`

Model: unknown (identity not attested by the host)

Isolation: procedural

```text
NO FINDINGS
```

After #39 passed its hosted checks and merged as `1d05b7d541d3a1abd67cba08b10c15c6db2dffe7`, this branch integrated that main. The module conflicts retained the exact reviewed v4-only blobs. A comparison against `6083906` found no changes to Go source, module files, lint configuration or CI. The inherited #39 record was already reviewed separately. The #46 Definition is unchanged. All required Go checks passed again; log: `/tmp/vh-adlc-pr46-after-main.log`. R-3 independently checked the integration and returned no findings. Fresh exact-head hosted CI remains required after this push.

## State

Locally complete. Required local checks and independent review passed. R-2 verified the comment correction and the unchanged executable Go tokens and Definition. Publication and exact-head hosted CI are next; merge remains conditional on passing CI.
