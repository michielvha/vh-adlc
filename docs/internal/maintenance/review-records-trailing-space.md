# Maintenance: accept reviewer records with trailing spaces

## Definition

Outcome: a review reply whose record lines end in spaces or tabs passes both `vh-adlc lint` and
`vh-adlc review check` when stored exactly as returned, with a test for that reply shape
([issue #134](https://github.com/michielvha/vh-adlc/issues/134)).

Preserved contract: the [review protocol](../../../plugins/vh-adlc/references/review-protocol.md)
(Records section) requires a review's records to be stored byte for byte as returned and confirmed
with `review check`. Lint must accept a well-formed review stored that way. `review check`
(`internal/review/review.go`) keeps comparing every byte apart from surrounding blank lines. The record
patterns still come from the pinned feature-document standard, and nothing about their syntax is compiled
in. Stored-data format, command interface, report codes and the trust boundary are unchanged.

Task base: `4f17f9a08d5fd30ad0ac44f20a0f67b6e9cf2b91`.

Affected paths: `internal/rules/rules.go`, `internal/rules/rules_test.go`,
`internal/review/review_test.go`, this record.

Verification inputs: `go.mod`, `go.sum`, `.golangci.yml`, the record patterns in
`internal/testrepo/testdata/docs/feature-documents.md` (the fixture copy of the pinned standard).

Proposed change: before matching the record patterns, `SpecRecords` and `ImplRecords` drop trailing
spaces and tabs from each line. Lint and the gate conditions both read records through these two
functions, so they stay consistent. `review check` is not changed.

Why this restores the contract rather than adding semantics: the pinned patterns are end-anchored
(`'^FINDING: F-\d{2,}$'`, `'^VERDICT: (met|not met|untested|not verified)$'`). A reviewer that ends
each line with a Markdown hard break, as the Codex route did in the observed Stackweaver review R-10,
returns records that are complete but fail those patterns. The protocol forbids editing them, so
before this change such a review could not pass both checks. Trailing spaces and tabs carry no meaning
in a record line, and the criterion text was already folded with `Fold`. No record that was rejected
for any other reason becomes accepted. The issue's other option was to normalise the reply in
`scripts/loop/review-route.ts` before storing it. It was rejected because it would not cover
host-dispatched reviews, and it would make the stored bytes differ from the raw reply.

Required checks: the new regression cases fail before the change and pass after it;
`go test -count=1 ./...` passes apart from failures that also occur on `origin/main` on this macOS
host; `go vet ./...`, `gofmt -l`, `golangci-lint config verify`, `golangci-lint run` (v2.15.0) and
`go mod tidy -diff` are clean.

Out of scope, noted only: `parseReply` in `plugins/vh-adlc/scripts/loop/review-route.ts` matches
`^MODEL: (\S+)$` and `^TARGET: ...$`, so a reply whose header lines carry trailing spaces is returned as
`pending` rather than stored. Docs impact: the "Record completeness" paragraph of the complete
[binary feature document](../../specs/vh-adlc-binary.spec.md) does not mention the tolerance. It is
left unedited because that document's Design section is reviewed and closed; record it for the next
revision of that document.

## Evidence

Before the change, at the task base with only the new tests added (`go test -count=1
./internal/rules/ ./internal/review/`):

- `TestSpecRecords/no_findings_with_trailing_spaces`, `.../nits_with_trailing_spaces` and
  `.../blocking_with_trailing_tab` failed with `WellFormed:false Findings:0`.
- `TestImplRecords` failed: `records with trailing spaces = [], ok = false`.
- `TestTrailingSpaceRecords/spec_review` and `.../implementation_review` failed with
  `lint rejects records stored as returned: {Code:review-records-malformed ...}`. This reproduces the
  issue end to end through `doc.Lint` on a document in a real fixture repository.

After the change:

- `go test -count=1 ./internal/rules/ ./internal/review/`: 34 passed.
- `go vet ./...`, `gofmt -l internal/`, `go mod tidy -diff`, `golangci-lint config verify` and
  `golangci-lint run` (2.15.0): clean.
- `go test -count=1 ./...`: every package passes except `cmd/vh-adlc` (clean/env tests) and
  `internal/clean`. The 27 failing tests are a subset of the 28 that fail on a fresh `git archive` of
  `origin/main` (`4f17f9a0`) on this Mac. The extra one on main is `TestCleanRefusals/missing_repository`.
  These are the Linux-only clean/env tests. Linux CI is authoritative for them.
- The plugin checker (`bun test tests/vh-adlc`) was not run. No TypeScript or plugin file changed.

## Reviews

## State

Independent review pending. Local candidate on branch `fix/review-records-trailing-space`, not pushed.
