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

Docs impact: the "Record completeness" paragraph of the complete
[binary feature document](../../specs/vh-adlc-binary.spec.md) does not mention the tolerance. It is
left unedited because that document's Design section is reviewed and closed. Publication step: when
the task ships, the workstream orchestrator records a follow-up on issue #134 or a new issue. The
follow-up says the paragraph should state that trailing spaces and tabs on record lines are ignored
before matching. The review route's `parseReply` already trims its `MODEL:` and `TARGET:` header
lines, so it needs no change.

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

### R-1

Target: `264607f68463255f8fbd3f22de04f1c475f30ac6`.
Model: claude-opus-5-5. Isolation: procedural.

```text
FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: docs/internal/maintenance/review-records-trailing-space.md, Definition, "Out of scope, noted only" paragraph
EVIDENCE: The record says `parseReply` in `plugins/vh-adlc/scripts/loop/review-route.ts` "matches `^MODEL: (\S+)$` and `^TARGET: ...$`, so a reply whose header lines carry trailing spaces is returned as `pending` rather than stored." At 264607f6 (the file is unchanged from the task base), the header reader at review-route.ts:244-250 returns `text.trim()` for each non-blank line (`if (text.trim()) return text.trim();`) before lines 252 and 254 apply the anchored patterns. Header lines that end in spaces or tabs therefore match, and the route does not return `pending` for that reason. The stated route limitation does not exist.
PROPOSAL: Remove or correct the sentence so the record does not leave a nonexistent defect for follow-up. The sentence is in the Definition, so either fold the correction into the next revision that already needs a re-review, or add a correcting note under Evidence.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: docs/internal/maintenance/review-records-trailing-space.md, Definition, "Docs impact" sentence; docs/specs/vh-adlc-binary.spec.md:236-240
EVIDENCE: The binary spec's "Record completeness" paragraph says a spec review is well formed when lines "matching `record_finding`" are followed by a line "matching `record_severity`", and an implementation record is a `record_criterion` line whose next line "matches `record_verdict`". After this change, lines that do not match the pinned end-anchored patterns byte for byte (for example `NO FINDINGS  ` against `'^NO FINDINGS$'`) are accepted once trailing spaces and tabs are removed (rules.go:279, 299, 345, 353). The record says the paragraph is left unedited and asks to "record it for the next revision of that document". The only place it is recorded is this maintenance record. Issue #134 and the spec carry no note of it. Apart from this gap, the record's claim that the change restores the existing contract holds. The review protocol's Records section requires storing the reply byte for byte and lint acceptance. The pinned patterns are unchanged and identical to the fixture copy. `Fold` already trimmed the criterion text. `review check` (review.go:34-35) stays strict. Lint and gate both read records through `SpecRecords` and `ImplRecords` only (lint.go:141 and 149, gate.go:140 and 168).
PROPOSAL: When the task is published, record the docs-impact follow-up somewhere the next binary-spec revision will see it, such as a comment on issue #134 or a new issue. The paragraph would then mention that trailing spaces and tabs on record lines are ignored before matching.
```

Response to R-1: F-01 is correct. `parseReply` trims each header line before matching, so the
Definition's out-of-scope note was wrong and is removed. F-02 is accepted. The Definition now
names the follow-up as a publication step: the binary-spec docs-impact note is handed to the
workstream orchestrator to record on issue #134 or a new issue when the task ships. This session
does not post to GitHub without that relay. Both changes touch the Definition only, so a new review
of the resulting commit is required.

## State

Independent review R-1 returned two nits, both addressed in the Definition. A new review is pending.
Local candidate on branch `fix/review-records-trailing-space`, not pushed.
