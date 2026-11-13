---
status: draft
status_description: "R-4 had one blocking finding; all six R-4 findings are applied. The owner accepts in advance if R-5 has no blocking finding."
issue: null
goal: "A spec review loop that finds blocking defects early and stops asking for passes after three consecutive passes without one."
covers:
  - plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md
  - plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/references/review-protocol.md
  - plugins/vh-adlc/references/security-settings.md
  - plugins/vh-adlc/knowledge.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/get-started/first-feature.md
  - docs/user-guides/workflows.md
  - tests/vh-adlc/review-convergence.test.ts
  - tests/vh-adlc/scenarios/run.ts
  - tests/vh-adlc/evidence/review-convergence/
  - AGENTS.md
---

# Plan: Spec review convergence

Give spec review a stopping rule, shared severity definitions, a failure-mode check and a one-pass
completeness rule, so a spec reaches acceptance in a few passes instead of dozens.

## Context

### Owner summary

Four recent specs needed 36 to 47 spec review passes before their first acceptance, although most of
those passes had no blocking finding. One of them had none at all. The current procedure applies every
factual finding and then asks for a new pass, and a thorough reviewer finds one or two new items on
every pass. Several late blocking findings were caused by fixing earlier non-blocking ones.

This feature changes the spec review procedure in four ways. First, the author stops requesting passes
once three consecutive passes have no blocking finding. Before that point, should-fix findings are
handled as today: factual ones are applied, and judgement ones come to you as Open Questions answered
before the next pass. Nits are saved for the acceptance summary instead of being applied, unless they
only touch Context or Sources. After the third clean pass nothing more is applied to the normative baseline:
its findings and the saved nits are listed, and you pick which to act on. A blocking finding resets the count, and so does a
revision of an accepted document. Three is a ceiling, not a floor: an acceptance you give, either in
advance ("accept if nothing blocking") or after a clean pass while the baseline is unchanged since it,
is honored at that pass, with its findings listed rather than applied. The author never stops to ask
before the ceiling, including in a resumed session.

Second, the shared convention defines blocking, should-fix and nit. Blocking is reserved for defects
that change what gets built, what a proof checks or how the binary reads the document, or that make a
criterion impossible to meet. A harmless citation slip is a nit. Because nits no longer trigger passes,
the definitions directly reduce churn. Third, the reviewer checks designs that change state, run
concurrently, or cross a process or network boundary for concurrent access, partial failure, retry or
replay, and upgrade or rollback, and the author covers the same ground while writing. Fourth, the
reviewer reports every restatement of an inconsistent rule in one finding, and the author fixes all of
them in one commit. A related rule makes widening a reviewed free-text pattern a nit when it only
catches more wrong output.

The trade-off is that a real gap a reviewer would only notice late can now reach acceptance. In
`blog-visual-reading` the loop would have stopped at R-4 and missed the R-8 finding. Implementation
review, which executes every criterion, is the backstop, and a revision reopens the loop.

The definitions, the stopping rule and the free-text rule go into `vhco-pro/docs` as a companion change
with the rules block unchanged, so the binary, gates and existing documents keep working. The plugin
follows whatever convention a repository's pin resolves: a consumer on an older pin keeps the current
procedure, and the report says the rule needs a newer pin. The plugin edits overlap with the draft
`shared-development-loop` feature, so whichever lands second rebases onto the first. Passes already
stored in a draft count toward its streak.

Validation is planned, not observed: scenario cases for the stopping rule, reviewer and author trials on
committed fixtures, a rules block comparison, lint and gate runs on named historical specs under both
pins, an old-pin run, and the plugin test suite.

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
`3963e25acf8e8b224019b5abfaf5cb12664df8be` unless they name another commit.

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

Existing scenarios. `tests/vh-adlc/scenarios/run.ts` S7.7 (line 526) sends a conditional acceptance as
a second turn after its first review, S7.7.accept (line 572) stores a `NO FINDINGS` R-1 and then has the
owner accept the document as reviewed in R-1 with no second review stored, S7.9 (line 1066) pre-accepts
a revision if its one review finds nothing blocking, and S14.spec (line 626) accepts against R-1. Each
is an owner acceptance at a clean pass whose normative baseline has not changed since. The harness sends
turns one after another (`run.ts:137-141`). The scenarios dispatch the real reviewer agent; there is no
scripted reviewer today.

Resume. The resume skill stops and puts the question to the owner whenever `vh-adlc next` says
`owner acceptance` (`plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md:42`), and `references/loop.md:136-138`
presents the acceptance question including through resume. Since `next` names owner acceptance after
any fresh, clean review, a resumed draft would be asked for acceptance at a streak of one.

Pins. `plugins/vh-adlc/knowledge.md:7-9` says `vh-adlc knowledge` decides whether the repository's pin
or the plugin's applies, and in this repository the repository pin wins (`lint` reports
`"source":"repository","pin_files":["AGENTS.md"]`). The docs SHA also appears in
`plugins/vh-adlc/references/security-settings.md:5`.

Overlapping work. The draft `shared-development-loop` feature on `origin/main` at `b777df0` covers
`plugins/vh-adlc/skills/vh-adlc-spec/`, the reviewer agent, `review-protocol.md`, `knowledge.md` and
both manifests (`docs/specs/shared-development-loop.md:7-23` at `b777df0`), and its scope includes a
plugin pin bump (`:154`).

Model context. This framework names no model. The logs above already show Opus-family and unattested
reviewers, so the problem is the procedure, and it would persist under any thorough reviewer.

## Scope

In scope:

- A stopping rule for spec review: the author stops requesting passes once three consecutive passes have
  no blocking finding, saves nits for the acceptance summary, and honors an acceptance the owner gave in
  advance at the first clean pass that meets it.
- Definitions of blocking, should-fix and nit in the shared convention.
- A failure-mode check in the reviewer's spec section and the author's instructions.
- One-pass completeness for the reviewer and a same-commit restatement sweep for the author.
- A free-text check rule in the convention's Test plan section.
- The resume skill and `references/loop.md`, which apply the stopping rule before acting on
  `owner acceptance` from `vh-adlc next`.
- The pin and version moves that adopt the published convention, the two user guides that describe
  spec review, and scenario coverage for the new branches.

Out of scope, by name:

- Any change to the rules block, the binary, the record formats or gate conditions.
- Implementation reviews, maintenance reviews and audit reviews, which have their own records and stop
  conditions.
- Choosing, naming or recommending a reviewer model.
- A new template section for failure behavior.
- Rewriting or re-rating stored review records in existing specs.
- Moving any consumer repository's pin, or carrying the new rules inside the plugin for consumers on
  older pins.

## Design

### Terminology

| Term | Meaning |
| --- | --- |
| Clean pass | A spec review pass with no blocking finding, including one that returns `NO FINDINGS` (AC-01). |
| Clean streak | The number of consecutive clean passes at the end of the Review Log, counting only `spec` rows that are not acceptance rows and whose commit has no `+dirty` suffix. A pass with a blocking finding resets it to zero. A revision also resets it: only rows whose reviewed commit descends from the latest revision event count. A revision event is any commit that moves the document to `draft` from another status, or any commit after the latest acceptance row that changes the normative baseline; both are found in the document's Git history. Applying the findings of clean passes does not reset it (AC-01). |
| Saved nit | A nit on the normative baseline that the author does not apply and instead lists in the acceptance summary (AC-01). |
| Owner acceptance | An acceptance the owner gives either before a pass returns, conditioned on that pass being clean, or after a clean pass while the normative baseline is unchanged since that pass, as in S7.7, S7.7.accept, S7.9 and S14.spec (AC-01). |
| Restatement | A second or later place in one document that states the same rule, limit or default (AC-03). |

### Stopping rule (convention and procedure)

In the convention's Acceptance section, step 2 gains the rule, and `SKILL.md` review mode steps 4 and 5
and the protocol's Records paragraph follow it:

1. In every pass, nits on the normative baseline become saved nits. Findings confined to sections
   outside the normative baseline may be applied at any time, because they do not make the review
   stale.
2. After a pass with a blocking finding, the author applies its blocking and should-fix findings as
   today: factual ones applied, judgement ones put to the owner as Open Questions.
3. After a clean pass that leaves the clean streak below three, and with no owner acceptance, the
   author applies its factual should-fix findings and puts its judgement should-fix findings to the
   owner as Open Questions. The answers are folded in before the next pass is requested, so no question
   is open when the streak reaches three. The author does not stop to ask whether to accept.
   When `vh-adlc next` reports `owner acceptance` below the ceiling and no owner acceptance exists, the
   spec and resume operations request another pass instead of asking.
4. After the clean pass that brings the streak to three, the author applies nothing to the normative
   baseline and raises no Open Questions. It lists each of that pass's findings and every saved nit,
   with ID and one line, in the owner-facing summary before the acceptance question.
5. The owner may pick any listed findings. The author applies the picked ones, with judgement ones
   decided by the owner's pick, and requests one more pass. When that pass is clean, the author asks for
   acceptance again and lists its findings the same way.
6. With an owner acceptance, the clean pass it names, or the first clean pass that meets its
   condition, ends the loop whatever the streak: the author applies nothing to the normative baseline, lists that pass's findings and the
   saved nits, and writes the acceptance row at that pass, so the accepted commit keeps the reviewed
   baseline.

The resume skill and `references/loop.md` apply this rule before acting on `owner acceptance` from
`vh-adlc next`. A re-review caused only by default-branch drift counts as a pass like any other. Passes stored before
the plugin adopts this rule count toward a document's streak, so a long-running draft can stop at once.
Nothing new is stored: the skill reads the streak from the Review Log rows, their `### R-<n>` records
and the document's Git history for the latest `gate draft` commit. Acceptance still requires a fresh,
clean review at the accepted commit, and the pass that ends the loop is that review.

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

The reviewer agent tells the reviewer to rate with the definitions in the resolved convention. They add
no record field.

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
more wrong output is a nit, so under the stopping rule it is saved rather than applied. A finding that
shows the pattern rejects a correct output stays under the blocking definition, because the proof then
fails a correct implementation.

### Pins and older consumers

The skill and the reviewer follow the convention the repository's pin resolves. With a pin that
predates the companion change, the resolved page has no definitions, no free-text rule and the old
Acceptance step, so the current procedure runs, and the spec report says the stopping rule needs a pin
at or after the companion commit. The plugin does not carry its own copy of the rules.

### Delivery

The convention edits are a companion change to `vhco-pro/docs`, checked by its own checker and an
independent review, with the rules block byte-for-byte unchanged. Docs paths are not listed in `covers`,
because that repository is checked out separately. After it publishes, `AGENTS.md`,
`plugins/vh-adlc/knowledge.md` and the convention link in `plugins/vh-adlc/references/security-settings.md:5`
move to the published commit, both manifests move together from the version current at that time, and
`docs/get-started/first-feature.md:42-43` and `docs/user-guides/workflows.md:251-263` describe the
stopping rule, saved nits and owner acceptance.

`shared-development-loop` edits the same skill steps, protocol, pin and manifests. Whichever feature
lands second rebases its edits onto the first and moves the pin and version from whatever is current
then; AC-06 is checked against the docs commit this feature publishes, or a later one that contains it.

S7.7, S7.7.accept, S7.9 and S14.spec keep passing, because each acceptance names a clean pass
whose baseline is unchanged. The AC-01 variants are new
scenario cases in `tests/vh-adlc/scenarios/run.ts` that run against a copy of the plugin whose reviewer
agent returns canned records keyed by pass number, each starting with `MODEL: scripted-reviewer`. Their
transcripts, and the fixture specs and returned records of every reviewer and author trial, are
committed under `tests/vh-adlc/evidence/review-convergence/`. If the docs change cannot land, adoption
stays incomplete and the plugin never points at an unpublished commit. The return path is an ordinary
reviewed revert of the docs and plugin edits and the pin.

## Acceptance Criteria

- [ ] AC-01: An author following the updated spec procedure counts the clean streak over non-acceptance,
      non-dirty spec rows, including passes stored before the update, and resets it after a blocking
      finding or a revision; saves nits on the normative baseline instead of applying them; after each
      clean pass below three, applies factual should-fix findings and has judgement should-fix findings
      answered as Open Questions before the next pass, without asking whether to accept; after the
      third, applies nothing to the baseline and lists that pass's findings and the saved nits; applies
      owner-picked findings and requests one more pass before asking again; honors an owner
      acceptance, given in advance or after a clean pass with the baseline unchanged, by writing the
      acceptance row at that pass without applying its findings; and, when resumed below the ceiling
      without an owner acceptance, requests another pass instead of asking for acceptance.
- [ ] AC-02: The published convention defines blocking, should-fix and nit as this document's Design
      states, and a reviewer following the updated agent rates a seeded false claim the design depends
      on blocking, a seeded harmless wrong line number nit, a seeded ambiguity that allows two different
      implementations should-fix, and a seeded wording issue nit.
- [ ] AC-03: A reviewer following the updated agent reports, in one finding, every location of a rule a
      document states inconsistently, and an author following the updated skill changes every
      restatement in one commit.
- [ ] AC-04: A reviewer following the updated agent returns a failure-mode finding for each of the four
      questions a design that changes shared state or crosses a network boundary leaves undefined, and
      returns no failure-mode finding for a design that changes no state and crosses no boundary.
- [ ] AC-05: The published convention requires must-pass and must-fail examples in a free-text pattern
      proof; on a row that has passed review, a reviewer rates a missed wrong output as a nit and a
      rejected correct output as blocking.
- [ ] AC-06: The rules block is byte-identical to the previous pin, the named historical specs give the
      same lint, `fresh` and gate results under both pins, the repository pin in `AGENTS.md` and every
      docs pin in the plugin point at the published docs commit or a later one containing it, both
      manifests carry the same version, higher than the version before the change, a
      repository on the previous pin keeps the current procedure and its report names the needed pin,
      and the plugin test suite passes.
- [ ] AC-07: An author following the updated skill, drafting a feature that crosses a network boundary,
      states the behavior for concurrent requests, partial failure, retry or replay, and upgrade or
      rollback in Design, or raises an Open Question for any it cannot settle.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Scenario cases in `tests/vh-adlc/scenarios/run.ts` with the scripted reviewer, transcripts committed under `tests/vh-adlc/evidence/review-convergence/`. Variant A: blocking, then three clean passes whose first two each hold a factual should-fix, a judgement should-fix and a nit on Design; pass when the factual should-fix findings are applied after clean passes 1 and 2, their judgement findings are asked and folded before the next pass, no acceptance question is asked before pass 3, nothing on the baseline changes after pass 3, and the summary lists pass 3's IDs and both saved nits. Variant B: clean, blocking, clean, clean, clean; pass when the findings of the first two clean passes after the blocking pass are applied and only the third is listed. Variant C: the owner picks one listed finding; pass when it is applied and one more pass is requested before acceptance is asked again. Variant D: the owner gives an advance acceptance, and the first clean pass holds a factual should-fix on the baseline; pass when nothing is applied, the acceptance row names that pass, no further pass runs and `vh-adlc gate planned` passes. Variant D2: after a clean pass holding only saved nits, the owner accepts as reviewed in that pass; pass when the acceptance row names it and no further pass runs. Variant E: a `planned` document with a stored streak of three is revised through `vh-adlc gate draft`, and in a second case a document reaches `draft` from `blocked` and is revised; pass when, in both, the next clean pass is treated as streak one and its factual should-fix findings are applied. Variant G: a draft with one fresh clean pass is resumed through the resume skill; pass when another pass is requested instead of an acceptance question. Variant F: a stored log with two clean pre-update passes, then a clean `+dirty` row and an acceptance row; pass when the next clean pass is treated as streak three. S7.7, S7.7.accept, S7.9 and S14.spec still pass. |
| AC-02 | `tests/vh-adlc/review-convergence.test.ts` checks the published convention page for the three definitions. Independent reviewer trial on a committed fixture spec seeded with a false claim the design depends on, a harmless wrong line number, a criterion that admits two implementations and a wording slip; pass when the returned records rate them blocking, nit, should-fix and nit. Commit the fixture, the returned records and the reported model under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-03 | Reviewer trial on a fixture spec that states one limit in Scope, Design, a criterion and the Owner summary, with one copy different; pass when one finding names all four locations. Author trial applying a finding that asks for a value none of the four copies hold; pass when one commit leaves all four locations stating that value. Fixtures and records go under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-04 | Reviewer trial on five fixture specs: a counter in a shared file updated by parallel runs that defines partial failure, retry and upgrade but not concurrent updates; a remote API call that defines concurrency, partial failure and upgrade but not retry or replay; a design that defines concurrency, partial failure and retry but not upgrade or rollback; a design that defines concurrency, retry and upgrade but not partial failure; and a wording-only guide edit. Pass when each of the first four returns a failure-mode finding on exactly the question it leaves undefined, and the fifth returns no failure-mode finding. Fixtures and records go under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-05 | `tests/vh-adlc/review-convergence.test.ts` checks the published convention page for the example requirement. Reviewer trial on a fixture spec whose Review Log holds a stored clean pass with no finding naming the Test Plan, and whose free-text pattern row lists examples that omit one wrong output stated in Design and reject one correct output stated there. Pass only when the reviewer returns a nit for the missed wrong output and a blocking finding for the rejected correct output; fail if either is missing. Fixtures and records go under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-06 | Compare the rules block at the old and new pins byte for byte. For `shared-docs-drift`, `seo-assessment` and `owner-readable-specifications`, run `vh-adlc lint`, `fresh` and `gate planned` from two scratch clones whose `AGENTS.md` names the old and the new pin, assert `knowledge.revision` equals the clone's pin, and compare only `result`, `failing` and `findings`. In the old-pin clone, run the updated spec skill's review mode on a fixture spec with a clean pass; pass when the current procedure runs and the report names the needed pin. Check `AGENTS.md`, `knowledge.md` and `references/security-settings.md` name the published docs commit or a later one containing it, and both manifests match and are higher than the version before the change. Run `bun test tests/vh-adlc` and the docs repository's `npm run check`. |
| AC-07 | Author trial: the updated skill drafts a fixture feature that adds a webhook call to a remote service. Pass when its Design states behavior for all four questions or the document raises an Open Question for each one it leaves open. Commit the transcript and draft under `tests/vh-adlc/evidence/review-convergence/`. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The owner decided on 2026-11-13: severity definitions go in the shared convention; the
failure-mode check goes in the reviewer and author steps without a template section; the free-text
check rule is included; the author stops requesting passes after three consecutive clean passes. After
R-1, the owner decided that three is a ceiling and acceptance after any clean pass is honored, that the
tighter severity definitions apply, that only non-acceptance, non-dirty spec rows count and stored passes
count after the update, and that the ceiling stays at three. After R-2, the owner had all six R-2
proposals applied before a further pass. After R-3, the owner decided that nits on the normative baseline
are saved rather than applied, that early acceptance is honored only when given in advance, that a
repository follows the convention its pin resolves, and that R-3's findings are applied before R-4 as
the last pass. After R-4, the owner decided that an acceptance given after a clean pass is honored while
the baseline is unchanged since it, had all six R-4 findings applied, and accepted in advance if R-5 has
no blocking finding.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-13 | R-1 | spec | `83ae24c` | claude-opus-5-5 | procedural | Two blocking findings (F-01 streak reset, F-02 blocking definition) and ten others |
| 2026-11-13 | R-2 | spec | `c643cc0` | claude-opus-5-5 | procedural | Clean: no blocking finding; three should-fix and three nits |
| 2026-11-13 | R-3 | spec | `cd193f3` | claude-opus-5-5 | procedural | Clean: no blocking finding; seven should-fix and three nits |
| 2026-11-13 | R-4 | spec | `89afa41` | claude-opus-5-5 | procedural | One blocking finding (F-01 advance acceptance contradicts S7.7.accept), three should-fix and two nits |

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

### R-2

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (steps 1 and 4, lines 164-166 and 173-174, and lines 180-181); Acceptance Criteria AC-01 (lines 237-242); Test Plan AC-01 row (Variant D); Context, Owner summary (line 38-39, "you can still accept after any clean pass, as today"); Context, Background, Existing scenarios
EVIDENCE: Step 1 has the author apply a clean pass's factual findings and put its judgement findings to the owner as soon as the pass returns, whenever the streak is below three. Step 4 says "The owner may accept after any clean pass". Lines 180-181 say "Acceptance still requires a fresh, clean review at the accepted commit". If clean pass 1 holds a factual finding that edits Scope, Design, a criterion or the Test Plan, step 1 has already changed the normative baseline by the time the owner accepts. An acceptance row naming that pass then fails `accepted`, which needs "a clean spec review whose commit has the current normative baseline" (conventions/feature-documents.md:309). The design does not say whether an owner acceptance after a pass that holds findings skips step 1 (apply nothing and list the findings, as at pass 3), or applies them and requests another pass. Variant D says "pass when the acceptance row is written without further passes" but does not say whether its first clean pass holds findings, so a skill that applies a baseline finding and writes a stale acceptance row, or one that drops step 1, passes when the fixture pass is NO FINDINGS. Two careful implementers would build different skills here. Background names only S7.7 and S7.7.accept as single-pass acceptances, but tests/vh-adlc/scenarios/run.ts S7.9 (around line 1072) also has the owner pre-accept a revision "If it finds nothing blocking and leaves no open questions", after one review.
PROPOSAL: State what happens when the owner accepts after a clean pass below three that holds findings (for example: apply nothing, list its findings as in step 2, and write the acceptance row at that pass), and use the same wording in AC-01 and the Owner summary. Make Variant D's first clean pass hold a factual finding on the normative baseline and require that `gate planned` passes, and list S7.9 with the scenarios that must keep passing.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Terminology (Clean streak, line 156); Design, Stopping rule (lines 179-180, "Nothing new is stored: the skill reads the streak from the Review Log rows and their ### R-<n> records"); Acceptance Criteria AC-01; Test Plan AC-01 row
EVIDENCE: Line 156 says moving a planned or in-progress document to draft for a revision resets the streak. The Review Log never records that move. SKILL.md:98-99 commits it on its own as a `vh-adlc gate draft` commit, so it shows only in Git history. An acceptance row followed by later spec rows does not show it either, because a re-review caused only by default-branch drift also follows an acceptance and keeps it (conventions/feature-documents.md:220-222; Design line 177 counts such a re-review as a pass). The streak as defined therefore cannot be read from the Review Log rows and records alone. AC-01 does not mention the revision reset, and Variants A to D contain no revision. A skill that carries a pre-acceptance streak of three or more through a revision would apply nothing after the first post-revision pass and still pass every listed check.
PROPOSAL: Name the source the skill uses to find the reset, for example the latest `gate draft` commit on the document in Git history, or rows after the latest acceptance row when the document's status history shows a revision, and correct line 179-180 to match. Add the revision reset to AC-01 and a Test Plan variant where a planned document with a stored streak of three is revised and the next clean pass is treated as streak one.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-03 (lines 247-249); Test Plan AC-03 row (line 267); Design, One-pass completeness and restatements (lines 212-213)
EVIDENCE: The AC-03 fixture "states one limit in Scope, Design, a criterion and the Owner summary, with one copy different", and the author trial passes "when the resulting commit changes all four". If the finding proposes the value the other three copies already hold, a correct author edits only the one different copy and leaves the document consistent, and the proof fails that author. If the trial instead accepts one edited copy, it cannot tell a skill that sweeps restatements from one that only edits the location the finding names first. The row does not say which value the finding asks for.
PROPOSAL: Specify that the fixture finding asks for a value none of the four copies hold, so every copy must change, or pass the author trial when all four locations state the finding's value after one commit and the commit touches every copy that differed.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-01, AC-02, AC-03, AC-04 and AC-05 rows; Design, Delivery (lines 230-231)
EVIDENCE: Delivery says "new scenario cases cover the streak", and covers lists tests/vh-adlc/scenarios/run.ts. The AC-01 row instead uses "Disposable author trials in temporary repositories with a fixture spec and a scripted reviewer, transcripts preserved". The AC-02 row says "Store the returned records and the reported model". Neither says where the transcripts, fixtures or records are kept, although the repository already keeps such evidence under tests/vh-adlc/evidence/. An implementation reviewer has to inspect or rerun these trials, and the document does not say whether they are committed scenario cases or scratch runs.
PROPOSAL: Say whether the AC-01 variants are scenario cases in run.ts or scratch trials, and name the committed path for the fixture specs, transcripts and returned reviewer records, for example tests/vh-adlc/evidence/review-convergence/.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-04 (lines 252-253); Test Plan AC-04 row (line 268)
EVIDENCE: AC-04 requires that the wording-only design gets "none of those findings", meaning no failure-mode finding. The Test Plan row passes only "when the first two each return a failure-mode finding and the third returns none". Read literally, a reviewer that returns an unrelated wording nit on the third fixture fails the trial, although it meets AC-04.
PROPOSAL: Change the row to "and the third returns no failure-mode finding".

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design, Delivery (lines 227-228); Acceptance Criteria AC-06 ("the plugin points at the published docs commit")
EVIDENCE: The docs SHA appears in three places, not two: AGENTS.md:4, plugins/vh-adlc/knowledge.md:5 and :7, and plugins/vh-adlc/references/security-settings.md:5, which links conventions/repository-security.md at d8f07c9dd69038375a535af8ad586086688f85ab (`git grep -n d8f07c9 c643cc0`). The last pin move (ff8d7fe, "Both docs pins move to d8f07c9") left security-settings.md alone. Delivery names only AGENTS.md and knowledge.md, so after this feature security-settings.md would still point at the old revision, and it is unclear whether that meets "the plugin points at the published docs commit".
PROPOSAL: Say whether references/security-settings.md moves with the pin. If it stays, narrow AC-06 to the knowledge.md and AGENTS.md pins.

### R-3

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (steps 1 and 4, lines 168-170 and 177-180); Context, Owner summary (lines 40-42, "you can still accept after any clean pass, as today"); Acceptance Criteria AC-01; Test Plan AC-01 row (Variant D)
EVIDENCE: Step 1 says that after a clean pass below three the author "applies its factual findings, turns its judgement findings into Open Questions, and puts them to the owner". Step 4 says the owner may accept after any clean pass, and the author then applies none of that pass's findings and writes the acceptance row at it. The design never says whether the author offers that choice before carrying out step 1. If step 1 runs first and commits a normative fix, an acceptance the owner gives afterwards cannot be written at that pass, because `accepted` needs "a clean spec review whose commit has the current normative baseline" (conventions/feature-documents.md:309). So one implementer pauses after every clean pass to ask "accept now or continue", adding an owner round trip to each pass. Another applies at once and honors only an acceptance the owner gave in advance, as S7.7 and S7.9 do (tests/vh-adlc/scenarios/run.ts:534, :1078). Variant D scripts the acceptance, so both skills pass it. Under the second reading, the summary's "you can still accept after any clean pass" holds only for an acceptance given in advance.
PROPOSAL: Say when the author offers acceptance relative to step 1. For example: only an acceptance the owner has already given, or gives before the author starts applying, triggers step 4; otherwise step 1 runs. Use the same wording in the Owner summary and AC-01, and add a Variant D check that matches the chosen timing.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Background; Design, Delivery (lines 229-242); Acceptance Criteria AC-06; frontmatter covers
EVIDENCE: At cd193f3, docs/specs/shared-development-loop.md (status draft) covers plugins/vh-adlc/skills/vh-adlc-spec/, plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md, plugins/vh-adlc/references/review-protocol.md and tests/vh-adlc/ (`git show HEAD:docs/specs/shared-development-loop.md`, lines 7-15 and 23). On origin/main (b777df0) it also covers knowledge.md and both plugin.json manifests, and its Scope includes "the plugin pin bump that adopts it" (line 151). It also changes `/spec review` acceptance behavior (line 359). This spec edits the same review-mode steps, moves the same pin, and says "both manifests move from 0.16.1" (line 235). It never mentions the other feature. Whichever lands second will find the version and pin already moved and the SKILL.md review steps rewritten, and AC-06's "every docs pin in the plugin points at the published docs commit" then depends on which docs commit the other feature published.
PROPOSAL: Name shared-development-loop in Background and say how the two sequence. For example: whichever lands second rebases its SKILL.md and protocol edits onto the first, and bumps the version and pin from whatever is current then. Rephrase "move from 0.16.1" as "move from the current version".

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Severity definitions (line 202); Design, Delivery (lines 229-242); Scope, Out of scope ("Moving any consumer repository's pin")
EVIDENCE: The definitions and the free-text rule go only into the convention at the new docs revision, and the reviewer agent "tells the reviewer to rate with these definitions". plugins/vh-adlc/knowledge.md:8-9 says "`vh-adlc knowledge` decides whether the repository's own pin or this one applies", and a repository pin wins (`lint` here reports `"source":"repository","pin_files":["AGENTS.md"]`). A consumer that keeps an older pin, which this feature deliberately leaves alone, would run the updated reviewer and skill against a convention page that has no severity definitions, no free-text rule and the old Acceptance step 2. The page exists, so the `missing-page` stop in references/loop.md:86-87 does not fire. This is the upgrade question the document's own failure-mode check asks (lines 206-209), and Design does not answer it.
PROPOSAL: State the behavior for a repository whose pin predates the companion change. For example: the reviewer agent and skill carry the definitions and the stopping rule themselves, or the skill reports that the pin is too old and falls back to the current procedure. Add a check for that case to AC-06.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-01; Test Plan AC-01 row (Variants A and B); Design, Terminology (Clean streak, line 160); Design, Stopping rule (lines 183-186)
EVIDENCE: Variant B is "blocking finding in the second clean position; pass when the count restarts". Nothing stores the count, so "restarts" is observable only through what the author does on later passes, and the row does not say how many passes follow the blocking one. A skill that counts all clean passes in total, without resetting, passes a run that ends one or two passes after the blocking pass. The owner's R-1 decisions are that acceptance rows and `+dirty` rows do not count and that passes stored before the update do count (lines 291-293, Design lines 160 and 184-185). AC-01 does not state them and no variant contains any of those rows, so a skill that counts a `+dirty` row as a clean pass, or ignores stored passes, passes every listed check.
PROPOSAL: Give Variant B a full sequence, for example clean, blocking, clean, clean, clean, and pass it only when the findings of the first two clean passes after the blocking pass are applied and only the third is listed. Add a variant whose stored log has a `+dirty` clean row, an acceptance row and pre-update clean passes, with an expected streak, and add those counting rules to AC-01.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Failure-mode check (lines 206-212); Scope ("A failure-mode check in the reviewer's spec section and the author's instructions"); Acceptance Criteria AC-04 (lines 260-263); Test Plan AC-04 row (line 278)
EVIDENCE: Design and Scope add the check to the author's mode too: "state the behavior for each of the four questions in Design". No criterion or Test Plan row covers the author side, so a skill without that step meets every criterion. AC-04 lists four questions, but the two positive fixtures only exercise concurrent updates (shared counter) and retry or replay (remote API). No fixture leaves partial failure or upgrade and rollback undefined while defining the rest, so a reviewer that never asks about upgrade or rollback passes. Design names "runs concurrently" and "process boundary" as triggers; AC-04 names only shared state and network boundary. By this document's own definition (line 197), a proof that can pass on a wrong implementation is should-fix.
PROPOSAL: Add a criterion and an author trial for the authoring step, for example an author drafting a fixture feature that crosses a boundary and stating behavior for all four questions in Design. Add a reviewer fixture that defines concurrency and retry but leaves upgrade and rollback undefined, and pass it only when the reviewer returns a failure-mode finding on upgrade or rollback.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Free-text checks (lines 221-227); Design, Stopping rule (step 1, lines 168-170); Context, Background (blog-visual-reading cascade, lines 114-117)
EVIDENCE: The stopping rule never looks at should-fix versus nit. Step 1 applies every factual finding and asks every judgement finding as an Open Question, whatever its severity, and only blocking affects the streak. So demoting a widening request from should-fix to nit changes nothing the author does. A widening request in clean pass 1 or 2 is still applied or asked. If the widened pattern then rejects a correct output, that is blocking and resets the streak. That is the R-39 to R-40 to R-44 to R-45 sequence that Background cites (docs/specs/blog-visual-reading.md:1411, :1524, :1547). The Owner summary presents the rule as part of the churn fix (lines 48-49), but as written it only changes a label.
PROPOSAL: Either give nits a different handling in steps 1 and 3 (for example, nits on an already reviewed row are listed rather than applied), or say plainly that the rule only standardizes ratings and does not change the loop.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-05 (lines 264-266); Test Plan AC-05 row (line 279); Design, Free-text checks (lines 224-225)
EVIDENCE: The row says "pass when a seeded request to widen it for more wrong outputs is rated nit". A reviewer reviews a spec and raises its own findings; a fixture spec cannot contain a request for it to rate. The row does not say what makes the pattern "reviewed" in the fixture. Design defines that as "a clean pass's records hold no finding whose `WHERE` names that row", so the fixture needs a stored clean pass. The row also does not say what happens when the reviewer does not raise the widening at all. A reviewer that never mentions the gap either passes or fails, depending on how the trial runner reads the row.
PROPOSAL: Specify the fixture: a Review Log with a stored clean pass that names no Test Plan row, a pattern row whose listed examples omit one stated wrong output, and a correct output the pattern rejects. Pass only when the reviewer returns a nit for the missed wrong output and a blocking finding for the rejected correct output, and fail the trial if either finding is missing.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-01 row ("a scripted reviewer"); Design, Delivery (lines 238-239)
EVIDENCE: tests/vh-adlc/scenarios/run.ts dispatches the real reviewer subagent (for example S7.7 at :532-535, and the trace checks at :201-207 and :1193-1196). The harness has no mechanism for a scripted reviewer. A scripted reviewer has to return set records with a `MODEL:` line on each of up to five passes in one session, and the skill must accept it under references/review-protocol.md, which prefers the registered `vh-adlc-reviewer` agent. The document does not say how that substitution works, for example a plugin copy whose reviewer agent returns canned records keyed by pass number, as S14 copies the plugin (:600-603).
PROPOSAL: Name the scripted-reviewer mechanism in Delivery and say what its returned `MODEL:` line is, so the scenario evidence can be reproduced.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Design, Stopping rule (steps 2 and 4, lines 171-173 and 177-180)
EVIDENCE: Steps 2 and 4 have the author apply nothing, so the acceptance stays valid. The convention puts only Scope, Design, Acceptance Criteria, Test Plan and covers in the normative baseline (conventions/feature-documents.md:70-71), and `fresh` only reports `baseline-changed` for those. A finding confined to Context, the Owner summary or Sources could be applied without making the accepted review stale, yet the design leaves even a known false citation in Context unfixed unless the owner picks it.
PROPOSAL: Either allow findings confined to non-normative sections to be applied at steps 2 and 4, or say that leaving them unapplied is intended.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Context, Background, Model context (lines 125-126)
EVIDENCE: "The owner is moving routine spec and review work off the most expensive model tier" has no citation, and the Context section is required to cite its claims (conventions/feature-documents.md:75-76). Nothing in this repository at cd193f3 records that move.
PROPOSAL: Cite the source, for example the commit or settings that record the model move, or drop the sentence, since the paragraph's conclusion rests on the Review Log models.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Context, Background, Existing scenarios (lines 125-129); Design, Delivery (line 274); Test Plan AC-01 row (last sentence, "S7.7, S7.7.accept and S7.9 still pass"); Design, Terminology (Advance acceptance, line 178); Open Questions (line 340, "early acceptance is honored only when given in advance")
EVIDENCE: Background says S7.7, S7.7.accept and S7.9 are "All three ... acceptances given in advance of a single clean pass", and Delivery says they "keep their advance acceptance after one clean pass". The scenario harness sends turns one after another and resumes the session only after the previous turn ends (tests/vh-adlc/scenarios/run.ts:137-141). S7.7.accept stores a NO FINDINGS R-1 first (`accept(f, "NO FINDINGS", false)`, run.ts:577), then the owner says "I accept the document as reviewed in R-1" (run.ts:579) and the checks require "no second review was stored" (run.ts:591). That acceptance arrives after the pass returned, at a streak of one. S7.7 sends its conditional acceptance as a second turn (run.ts:532-535), after the first turn's review and whatever the author did after it. Terminology defines an advance acceptance as one given "before a pass returns", and the owner decided it is honored only then. A skill that follows the Design must keep going after R-1 in S7.7.accept, which fails that scenario's check, while the AC-01 row requires the scenario to keep passing. So either the proof fails a correct implementation, or the implementer honors a post-pass acceptance below three, which the Design and the owner's decision exclude. S14.spec (run.ts:626, "The owner accepts ... against R-1") is another post-pass acceptance the document does not mention.
PROPOSAL: Decide whether an acceptance the owner gives after a clean pass, at a baseline unchanged since that pass, is honored below a streak of three, and state it in Terminology, the stopping rule, AC-01 and the Owner summary. Then correct the Background description of S7.7 and S7.7.accept, and either keep those scenarios as passing proof or say how they change.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (step 3, lines 190-193, "The author does not stop to ask whether to accept"); Scope (lines 146-156); frontmatter covers (lines 6-19)
EVIDENCE: The rules block stays unchanged, so `vh-adlc next` returns `owner acceptance` once a fresh, clean spec review exists (conventions/feature-documents.md:279). After a clean pass below three that returns NO FINDINGS, or only saved nits and Context or Sources fixes, the baseline is unchanged and the review stays fresh, so `next` answers `owner acceptance`. The resume skill stops and asks the owner to accept on that answer (plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md:36-42), and plugins/vh-adlc/references/loop.md:136-138 presents the acceptance question "including through resume". Neither file is in covers or Scope. A resumed session would therefore ask for acceptance at a streak of one or two, which step 3 forbids, and nothing in the Test Plan exercises resume.
PROPOSAL: Add the resume skill and loop.md to Scope and covers, and say that resume applies the stopping rule before acting on `owner acceptance` from `next`. Add a Test Plan variant that resumes a draft at a streak of one with a fresh clean review and passes only when another pass is requested instead of an acceptance question.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Clean streak, line 176); Context, Owner summary (lines 41-42, "and so does a revision of an accepted document"); Acceptance Criteria AC-01; Test Plan AC-01 row (Variant E)
EVIDENCE: Terminology resets the streak only at "the latest commit that moved the document from `planned` or `in-progress` to `draft`". The rules block also allows `blocked: [draft, ...]` and `parked: [draft, ...]` (conventions/feature-documents.md:236-237). A planned document that moves to blocked and is then revised reaches draft from blocked, so no planned-to-draft commit exists and the pre-revision streak still counts. A document that has an acceptance row but is still draft (for example when the planned gate failed after the row was written) can have its baseline edited without any `gate draft` commit at all. In both cases the Owner summary's "a revision of an accepted document" resets the count, but the Terminology rule does not, so the first clean pass after the revision could end the loop. Variant E only covers planned to draft.
PROPOSAL: Define the reset event so it covers every revision of an accepted document, for example any move to draft from another status, plus baseline changes after the latest acceptance row. Make the Owner summary and AC-01 use the same definition.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-04 (lines 300-302); Test Plan AC-04 row (line 322); Design, Failure-mode check (lines 229-232)
EVIDENCE: AC-04 requires "a failure-mode finding for each of the four questions" the design leaves undefined. The first two fixtures state nothing about concurrency, or nothing about retry or replay, and each passes when it returns "a failure-mode finding on the undefined question", singular. The third fixture isolates upgrade and rollback. No fixture isolates partial failure, and the first two do not check that every undefined question is reported. A reviewer that never asks about partial failure, or that reports one question per design, passes the row while missing what AC-04 requires.
PROPOSAL: Say in the row that each fixture passes only when the reviewer reports every question that fixture leaves undefined, and list those questions per fixture. Add a fixture that defines concurrency, retry and upgrade but leaves partial failure undefined.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (lines 39-41); Design, Stopping rule (step 1, lines 186-187, and step 4, lines 194-196)
EVIDENCE: The Owner summary says "After the third clean pass nothing more is applied". Step 1 lets findings confined to Context or Sources be applied "at any time", and step 4 limits only the normative baseline. Step 1 also covers only Context and Sources, so a nit on Tasks, Open Questions or other non-normative text is neither saved nor allowed.
PROPOSAL: Have the Owner summary say that nothing on the normative baseline is applied after the third clean pass. In step 1, allow findings confined to any non-normative section.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria AC-06 (lines 306-310); Test Plan AC-06 row (line 324)
EVIDENCE: AC-06 says "every docs pin in the plugin points at the published docs commit" and "both manifests carry the same new version". The row also checks AGENTS.md, which is the repository pin and not part of the plugin (`git grep -n d8f07c9` lists AGENTS.md:4, plugins/vh-adlc/knowledge.md:5 and :7, plugins/vh-adlc/references/security-settings.md:5). It checks only that "both manifests match", not that the version changed from 0.16.1 (plugin.json:4, .claude-plugin/plugin.json:14).
PROPOSAL: Name AGENTS.md in AC-06 as the repository pin, and have the row check that the two manifest versions match and are higher than the version current before the change.
