---
status: draft
status_description: "Written with the owner's four decisions folded in; waiting for its first independent spec review."
issue: null
goal: "A spec review loop that finds blocking defects early and stops after three consecutive passes without one."
covers:
  - plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md
  - plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md
  - plugins/vh-adlc/references/review-protocol.md
  - plugins/vh-adlc/knowledge.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/get-started/first-feature.md
  - docs/user-guides/workflows.md
  - tests/vh-adlc/review-convergence.test.ts
  - AGENTS.md
---

# Plan: Spec review convergence

Give spec review a stopping rule, shared severity definitions, a failure-mode check and a one-pass
completeness rule, so a spec reaches acceptance in a few passes instead of dozens.

## Context

### Owner summary

Recent specs needed 34 to 47 independent review passes before acceptance, although most of those passes
returned no blocking finding. The current procedure applies every finding and then asks for a new pass,
and a thorough reviewer finds one or two new should-fix items on every pass. Many of the later blocking
findings were caused by fixing earlier non-blocking ones. Most real blocking findings appeared in the
first five passes.

This feature changes the spec review procedure in four ways. First, the loop stops after three
consecutive passes without a blocking finding. The author applies the findings of the first two of
those passes. The third pass's findings are listed for you at acceptance instead of being applied, and
you choose which ones to act on. A blocking finding at any point resets the count. Second, the shared
feature-document convention defines blocking, should-fix and nit, so reviewers rate the same defect the
same way. Third, the reviewer checks designs that change state, run concurrently or cross a process
boundary for concurrent access, partial failure, retry or replay, and upgrade or rollback. The author
covers the same ground while writing. Fourth, the reviewer reports every place a document restates an
inconsistent rule in one finding, and the author fixes all of them in the same commit. A small related
rule fixes the examples of a free-text pattern check once, so later tuning of that pattern is a nit.

The severity definitions, the stopping rule and the free-text rule go into `vhco-pro/docs`
(`conventions/feature-documents.md`), delivered as a companion change. The machine-readable rules block
stays unchanged, so the binary, gates and existing documents keep working. The plugin's reviewer, spec
skill, review protocol and two user guides then follow the published convention, the pin moves to its
commit, and both plugin manifests get a version bump.

Validation is planned, not observed: reviewer trials on seeded fixture specs, a disposable author trial
of the stopping rule, a byte comparison of the rules block, lint and gate runs on historical specs, and
the plugin's test suite. Model identity in trials is recorded as the reviewer reports it.

Accepting this authorizes the companion docs change, the plugin edits and their tests on a feature
branch. Pushing, opening PRs, merging and releasing each still need your separate go.

### Background

Spec review today. The reviewer's spec section verifies claims and then attacks the criteria for
contradictions, unobservable criteria and missing Test Plan rows
(`plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:35-44`). It does not ask about runtime failure
behavior. The spec skill applies factual findings, turns judgement findings into Open Questions and
commits, and only a new independent pass clears a blocking one
(`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:71-72`). It asks for acceptance once a clean review at
the current commit exists (`SKILL.md:73-75`). The review protocol repeats the apply-then-review rule
(`plugins/vh-adlc/references/review-protocol.md:77-78`). All citations in this repository are at
`3963e25acf8e8b224019b5abfaf5cb12664df8be`.

The convention at the pinned docs revision `d8f07c9dd69038375a535af8ad586086688f85ab` lists the
severities `blocking | should-fix | nit` without defining them (`conventions/feature-documents.md:185`).
Its Acceptance steps say blocking findings are fixed and reviewed again (`:214-215`). A review is clean
when it has no blocking finding (`:308`), and the binary's `next` rules already name owner acceptance as
the next step once a fresh, clean review exists (`:279`). Applying any finding changes the normative
baseline, which makes the review stale (`:277`, `:300-301`), so the next step reverts to spec review.
The binary therefore already supports stopping; the churn comes from the procedure, which always
applies.

Measured churn. Counting review subsections and severities in five recent specs:

```sh
for f in shared-docs-drift blog-visual-reading seo-assessment shared-triage repository-security-settings; do
  echo "$f rounds=$(grep -cE '^### R-[0-9]+' docs/specs/$f.md) blocking=$(grep -c '^SEVERITY: blocking' docs/specs/$f.md) \
should=$(grep -c '^SEVERITY: should-fix' docs/specs/$f.md) nit=$(grep -c '^SEVERITY: nit' docs/specs/$f.md)"
done
```

| Spec | Passes | Blocking | Should-fix | Nit |
| --- | --- | --- | --- | --- |
| shared-docs-drift | 46 | 2 | 97 | 32 |
| blog-visual-reading | 47 | 5 | 57 | 107 |
| seo-assessment | 37 | 5 | 75 | 91 |
| shared-triage | 34 | 20 | 74 | 71 |
| repository-security-settings | 37 | 0 | 67 | 58 |

In `shared-docs-drift`, both blocking findings are in R-1 (`docs/specs/shared-docs-drift.md:505`); R-2
through R-46 have none, yet the loop ran 45 more passes. In `seo-assessment`, all five blocking findings
are in R-1 to R-5, and R-4 is a concurrency gap: two helper runs read the same unit ledger without a
lock and together spend twice the limit (`docs/specs/seo-assessment.md:565-571`). In
`blog-visual-reading`, the blocking findings in R-40, R-44 and R-45 each trace to the previous pass's fix
(the R-39 wording rule, then repeated regex tuning in the AC-07 row; `docs/specs/blog-visual-reading.md:1411`,
`:1524`, `:1547`). R-41 returns three findings about one rule stated in Terminology, The reading pass,
AC-04 and the Owner summary, left out of step by the R-40 fix (`:1441`). R-8 is the one late blocking
finding that was a real, pre-existing gap: an AC-07 proof Codex cannot observe (`:598`).

Model context. The owner is moving routine spec and review work off the most expensive model tier.
Those moves are project configuration; this framework names no model. The logs above already show
Opus-family and unattested reviewers, so the problem is the procedure, and it would persist under any
thorough reviewer.

## Scope

In scope:

- A stopping rule for spec review: three consecutive passes without a blocking finding end the loop.
- Definitions of blocking, should-fix and nit in the shared convention.
- A failure-mode check in the reviewer's spec section and the author's instructions.
- One-pass completeness for the reviewer and a same-commit restatement sweep for the author.
- A free-text check rule in the convention's Test plan section.
- The pin and version moves that adopt the published convention, and the two user guides that describe
  spec review.

Out of scope, by name:

- Any change to the rules block, the binary, the record formats or gate conditions.
- Implementation reviews, maintenance reviews and audit reviews, which have their own records and stop
  conditions.
- Choosing, naming or recommending a reviewer model.
- A new template section for failure behavior.
- Rewriting or re-rating stored review records in existing specs.
- Moving any consumer repository's pin.

## Design

### Terminology

| Term | Meaning |
| --- | --- |
| Clean pass | A spec review pass with no blocking finding, including one that returns `NO FINDINGS` (AC-01). |
| Clean streak | The number of consecutive clean passes since the last pass with a blocking finding, or since the document's last normative revision began (AC-01). |
| Restatement | A second or later place in one document that states the same rule, limit or default (AC-03). |

### Stopping rule (convention and procedure)

In the convention's Acceptance section, step 2 gains the rule: after a clean pass, the author applies
its findings and requests another pass until the clean streak reaches three. The third clean pass's
findings are not applied. The author lists each of them, with its ID and one line, in the owner-facing
summary before the acceptance question, and the owner picks any to apply. If the owner picks some, the
author applies them and requests one more pass. When that pass is clean, the author asks for acceptance
again and lists its findings the same way. Judgement findings in the third clean pass are
listed the same way instead of becoming Open Questions, so they do not block acceptance unless the owner
raises one. A blocking finding resets the streak to zero. A normative revision of an accepted document
starts a new streak.

In the plugin, `SKILL.md` review mode steps 4 and 5 and the protocol's Records paragraph refer to that
rule and say which findings are applied and which are listed. The skill computes the streak from the
Review Log and the stored records it already keeps; nothing new is stored. Acceptance still requires a
fresh, clean review at the accepted commit, which the third clean pass is, because nothing was applied
after it.

### Severity definitions (convention)

Beside the spec review record format, the convention defines:

- blocking: a stated fact is false, the binary would read the document differently from its author, or
  an implementer following the document would build something that does not solve the stated problem.
- should-fix: two careful implementers would build different things, or a Test Plan proof could pass on
  a wrong implementation.
- nit: wording, style or redundancy that changes nothing an implementer builds or a proof checks.

The reviewer agent tells the reviewer to rate with these definitions. The definitions add no record
field.

### Failure-mode check (reviewer and author)

The reviewer's spec section gains: where the design changes state, runs concurrently, or crosses a
process or network boundary, ask what happens under concurrent requests, partial failure, retry or
replay, and upgrade or rollback from the previous version. A path the document leaves undefined is a
finding. A design that changes no state gets no such finding.

The spec skill's author mode gains the matching step: where those conditions apply, state the behavior
in Design, and put any choice that cannot be settled into Open Questions.

### One-pass completeness and restatements (reviewer and author)

The reviewer returns every finding it can establish in the pass. For each finding about a rule, it
searches the document for restatements of that rule and names every location in the finding's `WHERE`.
The author, when applying a finding, searches the document for every restatement and changes them all in
the same commit.

### Free-text checks (convention)

The convention's Test plan section gains: a proof that judges free text with a pattern lists its
must-pass and must-fail examples in the row. Once a review has passed the row, a finding that only asks
to widen the pattern to more wordings is a nit.

### Delivery

The convention edits are a companion change to `vhco-pro/docs`, checked by its own checker and an
independent review, with the rules block byte-for-byte unchanged. Docs paths are not listed in `covers`,
because that repository is checked out separately. After it publishes, `AGENTS.md` and
`plugins/vh-adlc/knowledge.md` move to the published commit, both manifests move from 0.16.1 together,
and `docs/get-started/first-feature.md:42-43` and `docs/user-guides/workflows.md:251-263` describe the
stopping rule. If the docs change cannot land, adoption stays incomplete and the plugin never points at
an unpublished commit. The return path is an ordinary reviewed revert of the docs and plugin edits and
the pin.

## Acceptance Criteria

- [ ] AC-01: An author following the updated spec procedure applies the findings of the first and second
      consecutive clean passes, stops after the third, lists that pass's findings with IDs in the
      owner-facing summary instead of applying them, and restarts the streak after any blocking finding.
- [ ] AC-02: The published convention defines blocking, should-fix and nit, and a reviewer following the
      updated agent rates a seeded false claim blocking, a seeded ambiguity that allows two different
      implementations should-fix, and a seeded wording issue nit.
- [ ] AC-03: A reviewer following the updated agent reports, in one finding, every location of a rule a
      document states inconsistently, and an author following the updated skill changes every
      restatement in one commit.
- [ ] AC-04: A reviewer following the updated agent returns a finding for a design that changes shared
      state without defining concurrent access, partial failure, retry or rollback, and returns none of
      those findings for a design that changes no state.
- [ ] AC-05: The published convention requires must-pass and must-fail examples in a free-text pattern
      proof, and a reviewer rates a request to widen an already reviewed pattern as a nit.
- [ ] AC-06: The rules block is byte-identical to the previous pin, historical specs give the same lint,
      `fresh` and gate results under the new pin, the plugin points at the published docs commit, both
      manifests carry the same new version, and the plugin test suite passes.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Disposable author trial in a temporary repository with a fixture spec and a scripted reviewer that returns, in order, one blocking pass and then three passes with only should-fix and nit findings. Pass: the author applies findings after the first and second clean passes, makes no normative change after the third, the owner-facing summary lists the third pass's finding IDs, and a variant with a blocking finding in the second clean position restarts the count. Preserve the transcript. |
| AC-02 | `tests/vh-adlc/review-convergence.test.ts` checks the published convention page for the three definitions. Independent reviewer trial on a committed fixture spec seeded with one false `file:line` claim, one criterion that admits two implementations and one wording slip; pass when the returned records rate them blocking, should-fix and nit. Store the returned records and the reported model. |
| AC-03 | Reviewer trial on a fixture spec that states one limit in Scope, Design, a criterion and the Owner summary, with one copy different; pass when one finding names all four locations. Author trial applying that finding; pass when the resulting commit changes all four. |
| AC-04 | Reviewer trial on two fixture specs: one adds a counter in a shared file updated by parallel runs with no lock or retry behavior stated, one only edits a guide's wording; pass when the first returns a failure-mode finding and the second returns none. |
| AC-05 | `tests/vh-adlc/review-convergence.test.ts` checks the published convention page for the example requirement. Reviewer trial on a fixture spec whose reviewed pattern row lists examples and passes them; pass when a seeded request to widen it is rated nit. |
| AC-06 | Compare the rules block at the old and new pins byte for byte. Run `vh-adlc lint`, `fresh` and `gate planned` on three historical specs under both pins and compare the JSON results. Check `AGENTS.md` and `knowledge.md` name the published docs commit and both manifests match. Run `bun test tests/vh-adlc` and the docs repository's `npm run check`. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The owner decided on 2026-11-13: severity definitions go in the shared convention; the
failure-mode check goes in the reviewer and author steps without a template section; the free-text
check rule is included; and the loop stops after three consecutive clean passes.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
