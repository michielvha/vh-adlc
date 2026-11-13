---
status: draft
status_description: "R-1 findings applied and the owner's four answers folded in; waiting for spec review R-2."
issue: null
goal: "A spec review loop that finds blocking defects early and stops asking for passes after three consecutive passes without one."
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
  - tests/vh-adlc/scenarios/run.ts
  - AGENTS.md
---

# Plan: Spec review convergence

Give spec review a stopping rule, shared severity definitions, a failure-mode check and a one-pass
completeness rule, so a spec reaches acceptance in a few passes instead of dozens.

## Context

### Owner summary

Four recent specs needed 36 to 47 spec review passes before their first acceptance, although most of
those passes had no blocking finding. One of them had none at all. The current procedure applies every
factual finding and then asks for a new pass, and a thorough reviewer finds one or two new should-fix
items on every pass. Several late blocking findings were caused by fixing earlier non-blocking ones.

This feature changes the spec review procedure in four ways. First, the author stops requesting passes
once three consecutive passes have no blocking finding. In the first two of those passes, factual
findings are applied and judgement findings become Open Questions that you answer before the next pass.
The third pass's findings are listed for you at acceptance instead of being applied, and you choose
which to act on. A blocking finding resets the count. Three is a ceiling, not a floor: you can still
accept after any clean pass, as today. Second, the shared convention defines blocking, should-fix and
nit. Blocking is reserved for defects that change what gets built, what a proof checks or how the
binary reads the document, so a harmless citation slip is a nit. Third, the reviewer checks designs that
change state, run concurrently, or cross a process or network boundary for concurrent access, partial
failure, retry or replay, and upgrade or rollback, and the author covers the same ground while writing.
Fourth, the reviewer reports every restatement of an inconsistent rule in one finding, and the author
fixes all of them in one commit. A related rule makes widening a reviewed free-text pattern a nit when
it only catches more wrong output.

The trade-off is that a real gap a reviewer would only notice late can now reach acceptance. In
`blog-visual-reading` the loop would have stopped at R-4 and missed the R-8 finding. Implementation
review, which executes every criterion, is what catches such a gap afterwards, and a revision reopens
the loop.

The severity definitions, the stopping rule and the free-text rule go into `vhco-pro/docs` as a
companion change with the rules block unchanged, so the binary, gates and existing documents keep
working. The plugin's reviewer, spec skill, review protocol and two user guides then follow it, the pin
moves to the published commit, and both manifests get a version bump. Passes already stored in a draft
count toward its streak after the update.

Validation is planned, not observed: reviewer trials on seeded fixture specs, author trials of the
stopping rule including early acceptance and owner picks, a rules block comparison, lint and gate runs
on named historical specs under both pins, and the plugin test suite.

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
Scope, Design, Acceptance Criteria, Test Plan and `covers` form the normative baseline (`:70-71`). Its
Acceptance steps say blocking findings are fixed and reviewed again (`:214-215`). A review is clean when
it has no blocking finding (`:308`), and the binary's `next` rules already name owner acceptance as the
next step once a fresh, clean review exists (`:279`). Applying a finding to the normative baseline makes
the review stale (`:277`, `:300-301`), so the next step reverts to spec review. The binary therefore
already supports stopping; the churn comes from the procedure, which always applies factual findings
and asks again.

Measured churn. Counting spec review rows before the first acceptance row, and the blocking findings in
those passes, from each Review Log and its `### R-<n>` records:

```sh
awk '/^\| [0-9-]+ \| R-[0-9]+ \| spec \|/ { if ($0 ~ /accepted by owner/) acc=1; else if (!acc) { spec[$4]=1; n++ } }
     /^### R-[0-9]+$/ { cur=$2 }
     /^SEVERITY: blocking/ { if (cur in spec) b++ }
     END { print n, b }' docs/specs/<slug>.md
```

| Spec | Spec passes before first acceptance | Blocking findings in them | Passes with a blocking finding |
| --- | --- | --- | --- |
| shared-docs-drift | 46 | 2 | R-1 |
| blog-visual-reading | 47 | 5 | R-1, R-8, R-40, R-44, R-45 |
| seo-assessment | 37 | 5 | R-1 to R-5 |
| repository-security-settings | 36 | 0 | none |
| shared-triage | 2 | 1 | R-1 |

`shared-triage` shows the fast path the current rule allows: it was accepted at R-2 after a
`NO FINDINGS` pass. In `shared-docs-drift`, both blocking findings are in R-1
(`docs/specs/shared-docs-drift.md:505`), and 45 more passes followed. In `seo-assessment`, R-4 is a
concurrency gap: two helper runs read the same unit ledger without a lock and together spend twice the
limit (`docs/specs/seo-assessment.md:565-571`). In `blog-visual-reading`, the blocking findings in R-40,
R-44 and R-45 each trace to the previous pass's fix (the R-39 wording rule, then repeated regex tuning in
the AC-07 row; `docs/specs/blog-visual-reading.md:1411`, `:1524`, `:1547`). R-41 returns three findings
about one rule stated in Terminology, The reading pass, AC-04 and the Owner summary, left out of step by
the R-40 fix (`:1441`). R-8 is a real, pre-existing gap found late: an AC-07 proof Codex cannot observe
(`:598`). Under this feature's rule that spec would have stopped at R-4, after clean passes R-2 to R-4.

Existing scenarios. `tests/vh-adlc/scenarios/run.ts` S7.7 (line 526) has the owner accept after one
review that found nothing blocking, and S7.7.accept (line 572) accepts the document as reviewed in R-1
with no second review stored. Both rely on acceptance after a single clean pass.

Model context. The owner is moving routine spec and review work off the most expensive model tier.
Those moves are project configuration; this framework names no model. The logs above already show
Opus-family and unattested reviewers, so the problem is the procedure, and it would persist under any
thorough reviewer.

## Scope

In scope:

- A stopping rule for spec review: the author stops requesting passes once three consecutive passes have
  no blocking finding, and the owner may accept after any clean pass.
- Definitions of blocking, should-fix and nit in the shared convention.
- A failure-mode check in the reviewer's spec section and the author's instructions.
- One-pass completeness for the reviewer and a same-commit restatement sweep for the author.
- A free-text check rule in the convention's Test plan section.
- The pin and version moves that adopt the published convention, the two user guides that describe
  spec review, and scenario coverage for the new branches.

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
| Clean streak | The number of consecutive clean passes at the end of the Review Log, counting only `spec` rows that are not acceptance rows and whose commit has no `+dirty` suffix. A pass with a blocking finding resets it to zero, and so does moving a `planned` or `in-progress` document to `draft` for a revision. Applying the findings of clean passes does not reset it (AC-01). |
| Restatement | A second or later place in one document that states the same rule, limit or default (AC-03). |

### Stopping rule (convention and procedure)

In the convention's Acceptance section, step 2 gains the rule, and `SKILL.md` review mode steps 4 and 5
and the protocol's Records paragraph follow it:

1. After a clean pass that leaves the clean streak below three, the author applies its factual findings,
   turns its judgement findings into Open Questions, and puts them to the owner. The answers are folded
   in before the next pass is requested, so no question is open when the streak reaches three.
2. After the clean pass that brings the streak to three, the author applies nothing and raises no
   Open Questions. It lists each of that pass's findings, factual and judgement alike, with its ID and
   one line, in the owner-facing summary before the acceptance question.
3. The owner may pick any listed findings. The author applies the picked ones, with judgement ones
   decided by the owner's pick, and requests one more pass. When that pass is clean, the author asks for
   acceptance again and lists its findings the same way.
4. The owner may accept after any clean pass, whatever the streak. The streak caps how many passes the
   author requests; it never blocks an acceptance the owner gives.
5. A pass with a blocking finding resets the streak to zero, and the loop continues as today.

A re-review caused only by default-branch drift counts as a pass like any other. Passes stored before
the plugin adopts this rule count toward a document's streak, so a long-running draft can stop at once.
Nothing new is stored: the skill reads the streak from the Review Log rows and their `### R-<n>`
records. Acceptance still requires a fresh, clean review at the accepted commit, and the pass that
brings the streak to three is that review, because nothing changes after it.

### Severity definitions (convention)

Beside the spec review record format, the convention defines:

- blocking: a stated fact is false and that changes what is built, what a proof checks or how the
  binary reads the document; an implementer following the document would build something that does not
  solve the stated problem; a criterion cannot be met; or a proof fails a correct implementation or
  cannot be executed.
- should-fix: two careful implementers would build different things, or a proof could pass on a wrong
  implementation.
- nit: wording, style, redundancy, or a citation slip that changes nothing an implementer builds or a
  proof checks.

The reviewer agent tells the reviewer to rate with these definitions. They add no record field.

### Failure-mode check (reviewer and author)

The reviewer's spec section gains: where the design changes state, runs concurrently, or crosses a
process or network boundary, ask what happens under concurrent requests, partial failure, retry or
replay, and upgrade or rollback from the previous version. A path the document leaves undefined is a
finding. A design that changes no state and crosses no boundary gets no such finding.

The spec skill's author mode gains the matching step: where those conditions apply, state the behavior
for each of the four questions in Design, and put any choice that cannot be settled into Open Questions.

### One-pass completeness and restatements (reviewer and author)

The reviewer returns every finding it can establish in the pass. For each finding about a rule, it
searches the document for restatements of that rule and names every location in the finding's `WHERE`.
The author, when applying a finding, searches the document for every restatement and changes them all in
the same commit.

### Free-text checks (convention)

The convention's Test plan section gains: a proof that judges free text with a pattern lists its
must-pass and must-fail examples in the row. A row has passed review once a clean pass's records hold
no finding whose `WHERE` names that row. After that, a finding that only widens the pattern to catch
more wrong output is a nit. A finding that shows the pattern rejects a correct output stays under the
blocking definition, because the proof then fails a correct implementation.

### Delivery

The convention edits are a companion change to `vhco-pro/docs`, checked by its own checker and an
independent review, with the rules block byte-for-byte unchanged. Docs paths are not listed in `covers`,
because that repository is checked out separately. After it publishes, `AGENTS.md` and
`plugins/vh-adlc/knowledge.md` move to the published commit, both manifests move from 0.16.1 together,
and `docs/get-started/first-feature.md:42-43` and `docs/user-guides/workflows.md:251-263` describe the
stopping rule and early acceptance. S7.7 and S7.7.accept keep their single-pass acceptance unchanged,
and new scenario cases cover the streak. If the docs change cannot land, adoption stays incomplete and
the plugin never points at an unpublished commit. The return path is an ordinary reviewed revert of the
docs and plugin edits and the pin.

## Acceptance Criteria

- [ ] AC-01: An author following the updated spec procedure, after each of the first two consecutive
      clean passes, applies the factual findings and has the judgement findings answered as Open
      Questions before the next pass; after the third, applies nothing, raises no questions and lists
      every finding with its ID in the owner-facing summary; applies owner-picked findings and requests
      one more pass before asking again; restarts the streak after a blocking finding; and honors an
      owner acceptance given after any clean pass.
- [ ] AC-02: The published convention defines blocking, should-fix and nit as this document's Design
      states, and a reviewer following the updated agent rates a seeded false claim the design depends
      on blocking, a seeded harmless wrong line number nit, a seeded ambiguity that allows two different
      implementations should-fix, and a seeded wording issue nit.
- [ ] AC-03: A reviewer following the updated agent reports, in one finding, every location of a rule a
      document states inconsistently, and an author following the updated skill changes every
      restatement in one commit.
- [ ] AC-04: A reviewer following the updated agent returns a finding when a design that changes shared
      state, or one that crosses a network boundary, leaves concurrent requests, partial failure, retry
      or replay, or upgrade and rollback undefined, and returns none of those findings for a design that
      changes no state and crosses no boundary.
- [ ] AC-05: The published convention requires must-pass and must-fail examples in a free-text pattern
      proof; a reviewer rates a request that only widens an already reviewed pattern to catch more wrong
      output as a nit, and rates a demonstrated rejection of a correct output as blocking.
- [ ] AC-06: The rules block is byte-identical to the previous pin, the named historical specs give the
      same lint, `fresh` and gate results under both pins, the plugin points at the published docs
      commit, both manifests carry the same new version, and the plugin test suite passes.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Disposable author trials in temporary repositories with a fixture spec and a scripted reviewer, transcripts preserved. Variant A: one blocking pass, then three clean passes whose first two each hold a factual and a judgement finding; pass when factual findings are applied after clean passes 1 and 2, their judgement findings are asked and folded before the next pass, nothing changes after pass 3, and the summary lists pass 3's IDs including a judgement finding that did not become a question. Variant B: blocking finding in the second clean position; pass when the count restarts. Variant C: the owner picks one listed finding; pass when it is applied and one more pass is requested before acceptance is asked again. Variant D: the owner accepts after the first clean pass; pass when the acceptance row is written without further passes. S7.7 and S7.7.accept in `tests/vh-adlc/scenarios/run.ts` still pass. |
| AC-02 | `tests/vh-adlc/review-convergence.test.ts` checks the published convention page for the three definitions. Independent reviewer trial on a committed fixture spec seeded with a false claim the design depends on, a harmless wrong line number, a criterion that admits two implementations and a wording slip; pass when the returned records rate them blocking, nit, should-fix and nit. Store the returned records and the reported model. |
| AC-03 | Reviewer trial on a fixture spec that states one limit in Scope, Design, a criterion and the Owner summary, with one copy different; pass when one finding names all four locations. Author trial applying that finding; pass when the resulting commit changes all four. |
| AC-04 | Reviewer trial on three fixture specs: one adds a counter in a shared file updated by parallel runs, one adds a call to a remote API with no retry or replay behavior stated, and one only edits a guide's wording; pass when the first two each return a failure-mode finding and the third returns none. |
| AC-05 | `tests/vh-adlc/review-convergence.test.ts` checks the published convention page for the example requirement. Reviewer trial on a fixture spec whose reviewed pattern row lists examples; pass when a seeded request to widen it for more wrong outputs is rated nit and a seeded correct output the pattern rejects is rated blocking. |
| AC-06 | Compare the rules block at the old and new pins byte for byte. For `shared-docs-drift`, `seo-assessment` and `owner-readable-specifications`, run `vh-adlc lint`, `fresh` and `gate planned` from two scratch clones whose `AGENTS.md` names the old and the new pin, assert `knowledge.revision` equals the clone's pin, and compare only `result`, `failing` and `findings`. Check `AGENTS.md` and `knowledge.md` name the published docs commit and both manifests match. Run `bun test tests/vh-adlc` and the docs repository's `npm run check`. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The owner decided on 2026-11-13: severity definitions go in the shared convention; the
failure-mode check goes in the reviewer and author steps without a template section; the free-text
check rule is included; the author stops requesting passes after three consecutive clean passes. After
R-1, the owner decided that three is a ceiling and acceptance after any clean pass is honored, that the
tighter severity definitions apply, that only non-acceptance, non-dirty spec rows count and stored passes
count after the update, and that the ceiling stays at three.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-13 | R-1 | spec | `83ae24c` | claude-opus-5-5 | procedural | Two blocking findings (F-01 streak reset, F-02 blocking definition) and ten others |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Terminology (Clean streak, line 140); Design, Stopping rule (lines 145-153); Context, Owner summary (lines 34-37)
EVIDENCE: Line 140 defines the clean streak as consecutive clean passes "since the last pass with a blocking finding, or since the document's last normative revision began". The pinned convention says Scope, Design, Acceptance Criteria, Test Plan and covers "form the normative baseline. A change to any of them is a revision" (conventions/feature-documents.md:70-71). Applying the findings of clean pass 1 or 2 almost always edits one of those sections, so under the Terminology definition every applied finding is a normative revision that resets the streak, and the streak never reaches three. Line 153 restricts the reset to "A normative revision of an accepted document", but line 140 has no such limit, so the two statements contradict each other on the rule AC-01 depends on.
PROPOSAL: Define the reset in one place as starting with a draft-moving revision of a planned or in-progress document (or name the exact event), say explicitly that applying findings from clean passes 1 and 2 does not reset the streak, and make line 140, line 153 and the Owner summary say the same thing.

FINDING: F-02
KIND: judgement
SEVERITY: blocking
WHERE: Design, Severity definitions (lines 165-169); Acceptance Criteria AC-02 (lines 213-215); Test Plan AC-02 row
EVIDENCE: The proposed blocking definition starts "a stated fact is false", with no materiality limit. In the measured logs, most factual findings are false-fact findings rated below blocking: counting KIND and SEVERITY pairs in the four spec-only logs at 83ae24c gives 286 factual should-fix or nit findings (shared-docs-drift 91 should-fix and 32 nit, seo-assessment 28 and 33, repository-security-settings 32 and 34, blog-visual-reading 7 and 29). An example is seo-assessment R-3, a nit that corrects a line range ("Change line 57 to `lifecycle.md:75-81`", docs/specs/seo-assessment.md:560-563). Under the new definition each of these would become blocking and reset the streak, which brings back the churn the feature exists to remove. The AC-02 trial builds this in by seeding "one false `file:line` claim" and requiring that it be rated blocking.
PROPOSAL: Limit blocking to a false fact that changes what is built, what a proof checks or how the binary reads the document, and rate a citation slip that changes none of those as a nit. Change the AC-02 seed to a false claim that the design depends on, and add a second seed with a harmless wrong line number that must be rated nit.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Severity definitions (lines 165-169); Design, Free-text checks (lines 193-195); Acceptance Criteria AC-05; Test Plan AC-05 row
EVIDENCE: should-fix covers only "a Test Plan proof could pass on a wrong implementation". None of the three definitions covers a proof that rejects a correct implementation or cannot be executed. The Context cites both kinds as real defects. blog-visual-reading R-8 is a proof Codex cannot observe (docs/specs/blog-visual-reading.md:598-604). R-44 F-01 and R-45 F-01 were rated blocking because the AC-07 patterns rejected correct editor wording, so "AC-07 could not be met reliably". The free-text rule then makes "a finding that only asks to widen the pattern to more wordings" a nit "once a review has passed the row". R-45 F-01 is exactly such a request, so a proof that fails correct implementations would be stored as a nit. "Passed the row" is also undefined: it could mean a review with no finding on that row, or one that ran its examples.
PROPOSAL: Add the case "a criterion cannot be met, or its proof fails a correct implementation" to the severity definitions. Limit the free-text demotion to widening that only catches more wrong outputs, not widening that stops correct outputs being rejected. Define "passed the row" in terms the Review Log records. Consider requiring a machine-readable verdict instead of free-text patterns, as R-45 F-01 proposed.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary (line 28); Context, Background, Measured churn (lines 79-94)
EVIDENCE: The command counts every `### R-` subsection and every `SEVERITY: blocking` line, including implementation reviews. The shared-triage Review Log has 22 spec rows, of which 4 are acceptances, and 16 implementation rows (R-13 to R-16 and R-23 to R-34). Its blocking findings sit in R-1 (one) and in implementation reviews R-13, R-14, R-15, R-23 to R-27, R-30, R-31 and R-33 (nineteen). It was first accepted at R-2 after a NO FINDINGS pass (`| 2026-10-23 | R-2 | spec | ... | accepted by owner |`). repository-security-settings is 36 spec passes plus implementation review R-37. The table's 34 passes and 20 blocking findings for shared-triage, and the Owner summary's "Recent specs needed 34 to 47 independent review passes before acceptance", are therefore not true for that spec.
PROPOSAL: Count only spec rows up to the first acceptance (for example by filtering Review Log rows on `| spec |` and excluding `accepted by owner`), recount blocking findings by spec pass, and correct the Owner summary range. Alternatively, drop shared-triage from the table.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary (lines 28-43); Context, Background (line 104)
EVIDENCE: The summary does not state the two costs the measured logs show. First, blog-visual-reading had blocking findings only in R-1 and R-8 before R-40 (awk over the SEVERITY lines per R- subsection), so the new rule would have stopped after R-4 and accepted the spec without the R-8 defect, which Background calls "a real, pre-existing gap" (line 104). Second, the current skill asks for acceptance once one clean review exists (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:73-75), and shared-triage was accepted at R-2 after a NO FINDINGS pass. The new rule needs at least three passes for every spec, including one whose first pass returns NO FINDINGS. The conventions ask the summary to cover trade-offs (conventions/feature-documents.md:80-82).
PROPOSAL: Say in the Owner summary and Design that a late real gap like R-8 can now reach acceptance, and name what is expected to catch it (implementation review or a later revision). Also say that the minimum rises from one clean pass to three, and whether passes that return NO FINDINGS at an unchanged commit count toward the streak.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (lines 145-152); Context, Owner summary (lines 35-36); Acceptance Criteria AC-01
EVIDENCE: Line 146 says "after a clean pass, the author applies its findings", and AC-01 says the author "applies the findings of the first and second consecutive clean passes". The current procedure applies only factual findings and turns judgement findings into Open Questions (SKILL.md:71-72; references/review-protocol.md:77-78), and only the owner answers Open Questions (conventions/feature-documents.md:139). Line 151 says only third-pass judgement findings are listed "instead of becoming Open Questions", which implies that in passes 1 and 2 they still become questions. The design does not say whether the author waits for the owner's answers before requesting the next pass. If the questions are still open at the third pass, acceptance is blocked by no_open_questions, and folding the answers afterwards changes the baseline and makes the third pass stale.
PROPOSAL: State that in clean passes 1 and 2 factual findings are applied and judgement findings become Open Questions, which must be answered and folded before the next pass is requested. Use the same wording in AC-01 and the Owner summary.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (lines 155-159); Design, Delivery (lines 199-206)
EVIDENCE: "The skill computes the streak from the Review Log and the stored records it already keeps" does not say which rows count. Review Logs mix spec rows, implementation rows, acceptance rows (shared-triage), `+dirty` diagnostic rows, which "never count as current" (review-protocol.md:20-21), and re-reviews caused only by drift from the default branch (conventions/feature-documents.md:220-222). The design also gives no upgrade behavior for drafts that are mid-loop when the plugin moves, although blog-visual-reading has 47 passes rated before any severity definition existed. That is the "upgrade or rollback from the previous version" question the document's own failure-mode check asks (line 178).
PROPOSAL: List which rows count (spec kind only, no `+dirty`, no acceptance rows) and how a drift-only re-review counts. State whether passes stored before the new pin count toward a document's streak.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule; frontmatter covers; Scope
EVIDENCE: tests/vh-adlc/scenarios/run.ts S7.7.accept stores one NO FINDINGS review, then has the owner say "I accept the document as reviewed in R-1", and checks "no second review was stored" and that the document reaches planned. S7.7 has the owner accept "if the review found nothing blocking" after one review. Under the stopping rule a single clean pass leaves the streak at 1, so either these scenarios now fail, or the owner can accept before the streak reaches three. The design does not say which. tests/vh-adlc/scenarios/run.ts is not in covers, and no part of the plan updates it.
PROPOSAL: Decide whether an explicit owner acceptance below a streak of three is honored, and state it in Design and AC-01. Add tests/vh-adlc/scenarios/run.ts to covers and say how S7.7 and S7.7.accept change.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-06 row
EVIDENCE: The row says to run `vh-adlc lint`, `fresh` and `gate planned` "on three historical specs under both pins and compare the JSON results". In this repository the binary takes the pin from AGENTS.md and ignores `--plugin-pin`: `vh-adlc lint docs/specs/shared-triage.md --repo <repo> --plugin-pin 0e52f51f01b84eda75a976763c42d8ec0a07b544` returned `"knowledge":{"revision":"d8f07c9dd69038375a535af8ad586086688f85ab","source":"repository","pin_files":["AGENTS.md"],"override":false,...}`. A run with the new pin passed as a flag would therefore evaluate the old pin again, and the comparison would pass without testing anything. The JSON also contains pin-dependent fields by design, `knowledge.revision` and the gate `line` ("docs d8f07c9"), and `fresh` contains remote and local SHAs, so a literal comparison fails. The three specs are not named.
PROPOSAL: Name the three specs. Run each pin from a scratch clone whose AGENTS.md names that pin, assert `knowledge.revision` equals it, and compare only `result`, `failing` and `findings`.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-01; Test Plan AC-01 row
EVIDENCE: The Design defines three behaviors that AC-01 and its trial never exercise. When the owner picks third-pass findings, they are applied and one more pass is requested, with acceptance asked again after it (lines 148-150). Judgement findings in the third pass are listed instead of becoming Open Questions (lines 150-152). Applied findings are swept for restatements in the same commit, which belongs to AC-03. The AC-01 trial covers only a straight run with no owner picks and should-fix or nit findings, so a skill that turns third-pass judgement findings into Open Questions, or that asks for acceptance right after applying owner-picked findings, would still pass.
PROPOSAL: Extend AC-01 to the owner-pick branch and to third-pass judgement findings. Add trial variants where the owner picks one finding, and where the third pass holds a judgement finding that must be listed rather than turned into a question.

FINDING: F-11
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary (lines 38-41); Design, Failure-mode check (lines 176-179); Acceptance Criteria AC-04 (lines 219-221); Test Plan AC-04 row
EVIDENCE: The summary lists "concurrent access, partial failure, retry or replay, and upgrade or rollback" for designs that "cross a process boundary". The Design says "process or network boundary" and the same four questions. AC-04 lists only "concurrent access, partial failure, retry or rollback" and covers only shared state, and the fixture only tests a shared counter. Replay, upgrade and the boundary-crossing trigger have no criterion.
PROPOSAL: State the same list of triggers and questions in the summary, Design and AC-04, or note in AC-04 that it tests only the shared-state case.

FINDING: F-12
KIND: factual
SEVERITY: nit
WHERE: Context, Background (lines 74-75)
EVIDENCE: "Applying any finding changes the normative baseline, which makes the review stale" is too broad. Only Scope, Design, Acceptance Criteria, Test Plan and covers form the baseline (conventions/feature-documents.md:70-71, rules block normative_sections and normative_frontmatter), so a finding applied to Context, the Owner summary or Sources leaves the review fresh.
PROPOSAL: Say "Applying a finding to the normative baseline makes the review stale".
