---
status: draft
status_description: "R-9 was clean; its seven findings and the owner's answers are applied. The owner accepts in advance if R-10 has no blocking finding."
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
  - tests/vh-adlc/fixtures/build.ts
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
before the next pass. Nits on the normative baseline are saved for the acceptance summary instead of being
applied; findings outside the baseline may still be applied. After the third clean pass nothing more is
applied to the normative baseline: its findings and the saved nits are listed, and you pick which to act
on. The author writes the count into each spec review row, for example `streak 2 of 3`, so it never has to
be worked out from history. A blocking finding sets it to zero, and a revision starts it again. Three
is a ceiling, not a floor: an acceptance you give after a clean pass while the baseline is unchanged
since it is honored at that pass, and an acceptance you give in advance ("accept if nothing blocking")
covers only the next pass and lapses if that pass is blocking. The author runs the passes itself and
never stops to ask before the ceiling, including in a resumed session. A routine re-review of an
already accepted document keeps that acceptance and only lists what it finds.

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
with the rules block unchanged, so the binary, gates and existing documents keep working. The failure-mode check and
one-pass completeness apply on any pin. The severity definitions, saved nits, stopping rule and
free-text rule follow whatever convention a repository's pin resolves: a consumer on an older pin keeps
the current procedure for those, and the report says they need a newer pin. The plugin edits overlap with the draft
`shared-development-loop` feature, so whichever lands second rebases onto the first. Rows stored before
the update carry no streak marker and do not count, so an in-flight draft needs up to three new passes.

The feature also updates the two user guides that describe spec review
(`docs/get-started/first-feature.md` and `docs/user-guides/workflows.md`). Since the acceptance at R-8,
this revision adds a criterion that the convention's Acceptance text and those guides state the new
rule; has the author name every answered, rejected or picked finding in the decision record so a resumed
run never raises it again; keeps an advance acceptance recorded in the document valid in a later session
for the next pass; treats any new pass on an accepted spec, including one you ask for, as a drift pass;
and tightens the scenario cases (separate sessions, stored passes before owner turns, a 250-turn budget).

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
is an owner acceptance at a clean pass whose normative baseline has not changed since. S7.7's check
treats any `SEVERITY: blocking` line in the document as meaning the owner was left a decision and
then expects no acceptance (`run.ts:544-549`). The harness sends
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
`plugins/vh-adlc/skills/vh-adlc-spec/`, `plugins/vh-adlc/skills/vh-adlc-resume/`, the reviewer agent,
`review-protocol.md`, `references/loop.md`, `knowledge.md` and both manifests
and `tests/vh-adlc/` (`docs/specs/shared-development-loop.md:7-29` as of `b777df0`), and its scope
includes a plugin pin bump (`:150-151`).

Model context. This framework names no model. The logs above already show Opus-family and unattested
reviewers, so the problem is the procedure, and it would persist under any thorough reviewer.

## Scope

In scope:

- A stopping rule for spec review: the author records the clean streak in each spec review row other than a drift row, stops
  requesting passes once three consecutive passes have no blocking finding, saves nits for the acceptance
  summary, and honors an acceptance the owner gives after a clean pass with the baseline unchanged, or
  in advance for the next pass only.
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
| Clean streak | The count the author writes into the `Outcome` cell of every spec review row it records other than a drift row, as `streak <n> of 3` (AC-01). The previous value is the marker of the latest spec review row, skipping `+dirty` rows and drift rows, or 0 when that row has none. It is also 0 when an acceptance row follows that row and the document's status is `draft`, which marks a revision of an accepted document. A clean pass records the previous value plus one, which can exceed three after an owner pick in step 5; a pass with a blocking finding records `streak 0 of 3`. Applying the findings of clean passes does not change it. |
| Saved nit | A nit on the normative baseline, recorded in any pass since the latest acceptance row (or since the first pass when there is none) and not named in the decision record. The author lists it in the acceptance summary instead of applying it, unless its `EVIDENCE` quotes text that no longer exists in the document; a nit that quotes nothing is always listed (AC-01). |
| Drift pass | Any spec review pass on a `planned` or `in-progress` document whose acceptance still holds, whether default-branch drift or the owner asked for it. Its row records `drift` when clean and `drift, blocking` when blocking, in place of a streak; both are drift rows (AC-01). |
| Decision record | The dated paragraph under Open Questions where the author records the owner's decisions, every finding it has folded, rejected or applied at the owner's pick (by ID, for example `R-4 F-02`), and any advance acceptance (AC-01). |
| Owner acceptance | An acceptance the owner gives after a clean pass while the normative baseline is unchanged since that pass, as in S7.7, S7.7.accept, S7.9 and S14.spec, or in advance for the next pass, conditioned on that pass being clean. An advance acceptance is written into the decision record, holds in any later session, covers only the next spec pass and lapses if that pass has a blocking finding (AC-01). |
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
   When `vh-adlc next` reports `owner acceptance` below the ceiling and no owner acceptance exists,
   including one recorded in the decision record, the spec and resume operations dispatch another pass
   instead of asking.
4. After a clean pass that brings the streak to three or more, the author applies nothing to the normative
   baseline and raises no Open Questions. It lists each of that pass's findings and every saved nit,
   with ID and one line, in the owner-facing summary before the acceptance question.
5. The owner may pick any listed findings. The author applies the picked ones, with judgement ones
   decided by the owner's pick, names them in the decision record, and requests one more pass. When that pass is clean, the author asks for
   acceptance again and lists its findings the same way.
6. With an owner acceptance, the clean pass it names, or for an advance acceptance the next pass when
   it is clean, ends the loop whatever the streak: the author applies nothing to the normative
   baseline, lists that pass's findings and the saved nits, and writes the acceptance row at that pass,
   so the accepted commit keeps the reviewed baseline.
7. When the document is `planned` or `in-progress` and its acceptance still holds, a new pass is a
   drift pass, whether default-branch drift or the owner asked for it. The standing acceptance ends the
   loop at a clean drift pass: the
   author applies nothing to the normative baseline, lists its findings, and keeps the acceptance. A
   drift pass records `drift` in place of a streak, so it never changes the count. A blocking drift
   pass records `drift, blocking` and is handled as today, through a revision, which then counts from
   0.

In review mode the author dispatches each next pass itself, in the same session, while no Open
Question is waiting for the owner. Before it dispatches, a continued or resumed run checks the latest
stored pass: if that pass is clean, below the ceiling and still fresh, and holds should-fix findings on
the baseline that are neither applied nor answered, the author first applies or raises them as step 3
says, because an interrupted run can leave them unapplied. Whenever the author folds an owner's answer,
or decides that a factual finding does not hold, it names the finding (for example `R-4 F-02`) in the
decision record under Open Questions, and the check skips every finding named there. A run that stops for Open Questions reports the current streak, and
the next run reads the previous value as Terminology states. The resume skill and `references/loop.md` apply this
rule before acting on `owner acceptance` from `vh-adlc next`, and continue through the spec skill's
review mode. Any pass on an accepted `planned` or `in-progress` document follows step 7. The streak marker is the only new
text. It sits in the existing `Outcome` column, which the binary reads only to match an exact
`accepted by owner` (`conventions/feature-documents.md:176-178`), so a marker in a spec review row
changes no result, and the rules block and record formats are unchanged. Acceptance still requires a fresh, clean
review at the accepted commit, and the pass that ends the loop is that review.

### Severity definitions (convention)

Beside the spec review record format, the convention defines:

- blocking: a stated fact is false and that changes what is built, what a proof checks or how the
  binary reads the document; an implementer following the document would build something that does not
  solve the stated problem; a criterion cannot be met; or a proof fails a correct implementation or
  cannot be executed.
- should-fix: two careful implementers would build different things, or a proof could pass on a wrong
  implementation, except the free-text widening case below, which is a nit.
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
must-pass and must-fail examples in the row. A row has passed review once a clean pass whose reviewed
commit already held the row's current text has no finding whose `WHERE` names that row; a later change
to the row starts over. After that, a finding that only widens the pattern to catch
more wrong output is a nit, so under the stopping rule it is saved rather than applied. A finding that
shows the pattern rejects a correct output stays under the blocking definition, because the proof then
fails a correct implementation.

### Pins and older consumers

The changes split by source. The failure-mode check and one-pass completeness, in the reviewer agent
and the spec skill's author mode, apply on any pin, because they rely on no convention text. The
severity definitions, saved nits, the streak and stopping rule, and the free-text rule need the new
convention. The skill decides by whether the resolved `conventions/feature-documents.md` contains the
severity definitions, and the new review-mode and protocol steps are written as conditional on that
check. Without them, the current procedure runs for those parts, no streak marker is written, and the
spec report says they need the plugin's own pin from `plugins/vh-adlc/knowledge.md`. The plugin does not
carry its own copy of the convention rules.

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

S7.7.accept, S7.9 and S14.spec keep passing: each acceptance names a clean pass whose baseline is
unchanged, S7.9's status check accepts either a draft still waiting or a re-acceptance, and S14.spec
runs without the binary. S7.7 changes. Its first turn now continues in-session until the loop ends or a
question waits, so its check reads only the latest spec review's records instead of any
`SEVERITY: blocking` line in the document, and expects acceptance when the loop ended at a clean pass;
its turn-2 prompt names the latest pass. The AC-01 variants are new
scenario cases in `tests/vh-adlc/scenarios/run.ts` that run against a copy of the plugin whose reviewer
agent returns canned records keyed by pass number, each starting with `MODEL: scripted-reviewer`. The
scripted reviewer definition and its canned records live under
`tests/vh-adlc/evidence/review-convergence/`. A turn that runs several passes needs more room than the
harness default of 80 turns (`run.ts:138`), so these cases and S7.7 run with `maxTurns` set to 250, and
their checks fail when any turn ends with `isError` instead of checking a half-finished loop. Their
transcripts, and the fixture specs and returned records of every reviewer and author trial, are
committed under `tests/vh-adlc/evidence/review-convergence/`. If the docs change cannot land, adoption
stays incomplete and the plugin never points at an unpublished commit. The return path is an ordinary
reviewed revert of the docs and plugin edits and the pin.

## Acceptance Criteria

- [ ] AC-01: An author following the updated spec procedure writes `streak <n> of 3` into the Outcome of
      every spec review row it records other than a drift row, reading the previous value as Terminology states, recording
      `streak 0 of 3` after a blocking finding and counting from 0 after a revision of an accepted
      document; dispatches each next pass itself while no Open Question waits; saves nits on the
      normative baseline recorded since the latest acceptance row; ends the loop at a clean drift pass on
      an accepted document without applying its findings, and handles a blocking drift pass, recorded
      `drift, blocking`, through a revision that counts from 0; after each clean pass below three without an owner acceptance, applies factual should-fix
      findings and has judgement should-fix findings answered before the next pass, without asking
      whether to accept; at three or more, applies nothing to the baseline and lists that pass's findings
      and the saved nits; applies owner-picked findings and runs one more pass before asking again;
      honors an owner acceptance by writing the acceptance row at that pass without applying its
      findings, with an advance acceptance lapsing at a blocking pass; honors an advance acceptance recorded in the decision
      record in a later session; names every folded, rejected or picked finding in the decision record
      and never raises one again; and, when resumed below the ceiling, continues the loop instead of
      asking for acceptance.
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
      proof; on a row that has passed review at its current text, a reviewer rates a missed wrong output
      as a nit and a rejected correct output as blocking, and on a row changed since, rates a missed
      wrong output as should-fix.
- [ ] AC-06: The rules block is byte-identical to the previous pin, the named historical specs give the
      same lint, `fresh` and gate results under both pins, the repository pin in `AGENTS.md` and every
      docs pin in the plugin point at the published docs commit or a later one containing it, both
      manifests carry the same version, higher than the version before the change, a
      repository on the previous pin keeps the current procedure for the convention-dependent parts
      and its report names the needed pin,
      and the plugin test suite passes.
- [ ] AC-07: An author following the updated skill, drafting a feature that crosses a network boundary,
      states the behavior for concurrent requests, partial failure, retry or replay, and upgrade or
      rollback in Design, or raises an Open Question for any it cannot settle.
- [ ] AC-08: The published convention's Acceptance section states the stopping rule and the
      `streak <n> of 3` marker, and `docs/get-started/first-feature.md` and
      `docs/user-guides/workflows.md` describe the stopping rule, saved nits and owner acceptance.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Scenario cases in `tests/vh-adlc/scenarios/run.ts` with the scripted reviewer, transcripts committed under `tests/vh-adlc/evidence/review-convergence/`. Variant A: a blocking pass holding a factual blocking finding and a nit on Design, then three clean passes: the first two each hold a factual should-fix, a judgement should-fix and a nit on Design, and the third holds a factual should-fix and a nit on Design; pass when the rows record `streak 0 of 3` to `streak 3 of 3`, the factual should-fix findings are applied after clean passes 1 and 2, their judgement findings are asked and folded before the next pass, no acceptance question is asked before streak 3, nothing on the baseline changes after it, and the summary lists pass 3's two finding IDs and the four nits. Variant B: clean, blocking, clean, clean, clean, each holding one nit on Design that later fixes leave in place, and the first two clean passes after the blocking pass each also holding a factual should-fix; pass when the rows record streaks 1, 0, 1, 2 and 3, those two factual should-fix findings are applied, no nit is applied, and the summary lists the last pass's findings and all five nits. Variant C: the owner picks one listed finding; pass when it is applied, one more pass runs and records `streak 4 of 3`, and acceptance is asked again after it. Variant D: the owner gives an advance acceptance and the next pass is clean with a factual should-fix on the baseline; pass when nothing is applied, the acceptance row names that pass and `vh-adlc gate planned` passes. Variant D2: the fixture stores a clean pass holding only nits before the owner's turn, and the owner accepts as reviewed in that pass; pass when the acceptance row names it and no further pass runs. Variant D3: the owner gives an advance acceptance and the next pass is blocking, followed by a clean pass holding a judgement should-fix that stops the run; pass when the blocking fixes are applied, no acceptance row is written, and the clean pass records `streak 1 of 3` and is not accepted. Variant D4: the advance acceptance is recorded in the decision record, the session ends, and a separate `session()` call resumes; the next canned pass is clean; pass when the acceptance row names it. Variant E: a `planned` document whose latest non-drift spec review row records `streak 3 of 3`, followed by an acceptance row and then a clean row marked `drift`, is revised through `vh-adlc gate draft`; the first post-revision pass also holds a judgement should-fix, so the run stops on its Open Question, and the owner's answer starts a separate `session()` call with no `resume`, so only the stored document carries the revision and the drift row. Pass when the next three clean passes, each with a baseline fix applied after the first two, record streaks 1, 2 and 3, and the loop ends at 3, and the summary lists only nits recorded after the acceptance row. Variant F: a `draft` document whose stored log has unmarked clean rows, a clean `+dirty` row and an acceptance row; the next canned pass is clean with a judgement should-fix that stops the run; pass when it records `streak 1 of 3`. Variant G: a draft whose last row records `streak 1 of 3`, with a fresh review whose factual should-fix was never applied, is resumed through the resume skill, and the next canned pass is clean with a judgement should-fix; pass when the stored factual should-fix is applied before any dispatch, a new row records `streak 2 of 3`, the run stops on the Open Question, and no acceptance question is asked. Variant H: a `planned` document whose acceptance holds gets a drift re-review with a factual should-fix; pass when its row records `drift`, nothing is applied, the status stays `planned`, the acceptance is kept and the finding is listed. Variant H2: a blocking drift pass on an accepted `planned` document; pass when its row records `drift, blocking`, the document goes through `vh-adlc gate draft`, and the first clean pass after the revision records `streak 1 of 3`. Variant I: as Variant A, but a fix applied after clean pass 1 removes the line a pass-1 nit quotes; pass when that nit is not listed and the other saved nits are. Variant J: the owner answers a judgement should-fix from a clean pass by keeping the current design, and a later run continues; pass when the finding is named in the decision record and the run dispatches the next pass without asking again. In Variant C, the picked finding is also named there and is not listed at the next acceptance question. Every multi-pass case runs with `maxTurns` 250 and fails if a turn ends with `isError`. S7.7.accept, S7.9 and S14.spec still pass, and S7.7 passes with its updated check. |
| AC-02 | `tests/vh-adlc/review-convergence.test.ts` checks the published convention page for the three definitions. Independent reviewer trial on a committed fixture spec seeded with a false claim the design depends on, a harmless wrong line number, a criterion that admits two implementations and a wording slip; pass when the returned records rate them blocking, nit, should-fix and nit. Commit the fixture, the returned records and the reported model under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-03 | Reviewer trial on a fixture spec that states one limit in Scope, Design, a criterion and the Owner summary, with one copy different; pass when one finding names all four locations. Author trial applying a finding that asks for a value none of the four copies hold; pass when one commit leaves all four locations stating that value. Fixtures and records go under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-04 | Reviewer trial on five fixture specs: a counter in a shared file updated by parallel runs that defines partial failure, retry and upgrade but not concurrent updates; a remote API call that defines concurrency, partial failure and upgrade but not retry or replay; a design that defines concurrency, partial failure and retry but not upgrade or rollback; a design that defines concurrency, retry and upgrade but not partial failure; and a wording-only guide edit. Pass when each of the first four returns a failure-mode finding on exactly the question it leaves undefined, and the fifth returns no failure-mode finding. Fixtures and records go under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-05 | `tests/vh-adlc/review-convergence.test.ts` checks the published convention page for the example requirement. Reviewer trial on a fixture spec whose Review Log holds a stored clean pass, at a commit already holding the row's current text, with no finding naming the Test Plan, and whose free-text pattern row lists examples that omit one wrong output stated in Design and reject one correct output stated there. Pass only when the reviewer returns a nit for the missed wrong output and a blocking finding for the rejected correct output; fail if either is missing. A second fixture changes the row after the stored clean pass; pass when the missed wrong output is rated should-fix. Fixtures and records go under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-06 | Compare the rules block at the old and new pins byte for byte. For `shared-docs-drift`, `seo-assessment` and `owner-readable-specifications`, run `vh-adlc lint`, `fresh` and `gate planned` from two scratch clones, each checked out at a commit that holds its `AGENTS.md` pin (old or new) with a clean tree, assert `knowledge.revision` equals the clone's pin, and compare only `result`, `failing` and `findings`. As a scenario case in `tests/vh-adlc/scenarios/run.ts`, whose fixture docs repository first gains the previous pin's docs commit (`tests/vh-adlc/fixtures/build.ts`), run the updated spec skill's review mode on a fixture spec pinned to the previous revision with a clean pass; pass when findings are applied as today, no streak marker is written, the reviewer still reports a seeded failure-mode gap, and the report names the plugin's pin from `knowledge.md`. Check `AGENTS.md`, `knowledge.md` and `references/security-settings.md` name the published docs commit or a later one containing it, and both manifests match and are higher than the version before the change. Run `bun test tests/vh-adlc` and the docs repository's `npm run check`. |
| AC-07 | Author trial: the updated skill drafts a fixture feature that adds a webhook call to a remote service. Pass when its Design states behavior for all four questions or the document raises an Open Question for each one it leaves open. Commit the transcript and draft under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-08 | `tests/vh-adlc/review-convergence.test.ts` checks the published `conventions/feature-documents.md` Acceptance section for the stopping rule and the `streak <n> of 3` marker, and checks `docs/get-started/first-feature.md` and `docs/user-guides/workflows.md` for the stopping rule, saved nits and owner acceptance. |

## Tasks

- [ ] T1 `tests/vh-adlc/review-convergence.test.ts` - failing checks that the resolved `conventions/feature-documents.md` holds the three severity definitions and the free-text example requirement; they fail at the current pin because the page has neither (AC-02, AC-05)
- [ ] T12 `tests/vh-adlc/review-convergence.test.ts` - failing checks that the resolved Acceptance section states the stopping rule and the `streak <n> of 3` marker and that the two user guides describe the stopping rule, saved nits and owner acceptance; they fail now because none of that text exists (AC-08)
- [ ] T2 `docs/specs/spec-review-convergence.md` - the companion `vhco-pro/docs` change to `conventions/feature-documents.md` (severity definitions, the Acceptance stopping rule with the `streak <n> of 3` marker, the free-text rule) passes that repository's `npm run check` and an independent review with the rules block byte-for-byte unchanged; record its PR and published commit here (AC-02, AC-05, AC-06, AC-08)
- [ ] T3 `AGENTS.md`, `plugins/vh-adlc/knowledge.md`, `plugins/vh-adlc/references/security-settings.md` - move every docs pin to the published commit; T1 and the T12 convention checks pass, and the rules block comparison and the three-spec lint, `fresh` and gate comparison from two committed-pin scratch clones show no difference (AC-06, AC-02, AC-05)
- [ ] T4 `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md` - rate with the resolved definitions, ask the four failure-mode questions, return every finding in one pass and name every restatement; the AC-02, AC-03 reviewer, AC-04 and AC-05 trials pass with fixtures, returned records and reported model committed under `tests/vh-adlc/evidence/review-convergence/` (AC-02, AC-03, AC-04, AC-05)
- [ ] T5 `plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md` - author mode states the four failure-mode answers in Design or raises Open Questions, and sweeps every restatement in one commit; the AC-07 and AC-03 author trials pass with transcripts committed under `tests/vh-adlc/evidence/review-convergence/` (AC-03, AC-07)
- [ ] T6 `tests/vh-adlc/scenarios/run.ts` - the scripted reviewer (a plugin copy whose canned records, keyed by pass number and starting with `MODEL: scripted-reviewer`, live under `tests/vh-adlc/evidence/review-convergence/`) and AC-01 Variants A to J, including D4 and H2 with `maxTurns` 250 and an `isError` failure, plus S7.7's check reading only the latest spec review's records; the variants fail because no streak marker is written yet (AC-01)
- [ ] T7 `plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md`, `plugins/vh-adlc/references/review-protocol.md` - review-mode steps 1 to 7, conditional on the resolved page holding the severity definitions: streak marker, saved nits, in-session dispatch, the resumed-pass check, owner and drift acceptance, the decision record; T6 Variants A, B, C, D, D2, D3, F, H, H2, I and J pass, and S7.7, S7.7.accept, S7.9 and S14.spec pass (AC-01)
- [ ] T8 `plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md`, `plugins/vh-adlc/references/loop.md` - apply the stopping rule before acting on `owner acceptance` from `vh-adlc next` and continue through review mode; T6 Variants D4, E and G pass (AC-01)
- [ ] T9 `tests/vh-adlc/fixtures/build.ts`, `tests/vh-adlc/scenarios/run.ts` - the fixture docs repository also holds the previous pin's commit, and the old-pin case: in a fixture on the previous pin, review mode applies findings as today, writes no streak marker, the reviewer still reports a seeded failure-mode gap, and the report names the plugin's pin from `knowledge.md` (AC-06)
- [ ] T10 `docs/get-started/first-feature.md`, `docs/user-guides/workflows.md` - describe the stopping rule, saved nits and owner acceptance; the T12 guide checks pass (AC-08)
- [ ] T11 `plugins/vh-adlc/plugin.json`, `plugins/vh-adlc/.claude-plugin/plugin.json` - move both manifests together to one version above the version current at the time, rebased onto `shared-development-loop` if it has landed; the version-change check and the full `bun test tests/vh-adlc` pass (AC-06)

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
no blocking finding. R-5 had a blocking finding, so that acceptance did not apply. After R-5, the
owner cut the streak to a count recorded in each Review Log row, which reverses the R-1 choice: rows
stored before the update no longer count. An advance acceptance now covers only the next pass. The
owner had R-5's other findings applied. R-6 had a blocking finding, so that acceptance did not apply either. The owner
chose to keep the full spec rather than split out the stopping rule, and decided after R-6 that saved
nits are those recorded since the latest acceptance row, that a drift re-review of an accepted document
keeps the acceptance and only lists its findings, and that the failure-mode check and one-pass
completeness apply on any pin while the convention-dependent parts follow the resolved pin. The
owner accepted at R-8 under an advance acceptance, then picked all seven R-8 findings to apply
(R-8 F-01 to F-07), which moved the document back to draft for this revision. After R-9, the owner decided that an advance acceptance
recorded here holds in a later session, that any pass on an accepted spec is a drift pass, and that
R-9 F-01 to F-07 are applied. The owner accepts in advance if R-10 has no blocking finding.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-13 | R-1 | spec | `83ae24c` | claude-opus-5-5 | procedural | Two blocking findings (F-01 streak reset, F-02 blocking definition) and ten others |
| 2026-11-13 | R-2 | spec | `c643cc0` | claude-opus-5-5 | procedural | Clean: no blocking finding; three should-fix and three nits |
| 2026-11-13 | R-3 | spec | `cd193f3` | claude-opus-5-5 | procedural | Clean: no blocking finding; seven should-fix and three nits |
| 2026-11-13 | R-4 | spec | `89afa41` | claude-opus-5-5 | procedural | One blocking finding (F-01 advance acceptance contradicts S7.7.accept), three should-fix and two nits |
| 2026-11-13 | R-5 | spec | `f263bbd` | claude-opus-5-5 | procedural | One blocking finding (F-01 revision event resets on every applied fix), five should-fix and three nits; advance acceptance not met |
| 2026-11-13 | R-6 | spec | `96fc16f` | claude-opus-5-5 | procedural | One blocking finding (F-01 in-session passes break the S7.7 check), three should-fix and three nits; advance acceptance not met |
| 2026-11-13 | R-7 | spec | `b40d2ca` | claude-opus-5-5 | procedural | One blocking finding (F-01 Variants G and E assume stops the design does not make), four should-fix and three nits |
| 2026-11-13 | R-8 | spec | `005f0f5` | claude-opus-5-5 | procedural | Clean: no blocking finding; four should-fix and three nits, listed for the owner and not applied |
| 2026-11-13 | R-8 | spec | `005f0f5` | n/a | n/a | accepted by owner |
| 2026-11-13 | R-9 | spec | `67a08db` | claude-opus-5-5 | procedural | Clean: no blocking finding; five should-fix and two nits |

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

### R-5

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Terminology (Clean streak, line 188); Design, Stopping rule (lines 223-224, "the document's Git history for the latest `gate draft` commit"); Context, Owner summary (lines 43-44, "and so does a revision of an accepted document"); Acceptance Criteria AC-01 (lines 302-303); Test Plan AC-01 row (Variants E and F)
EVIDENCE: Line 188 counts only rows "whose reviewed commit descends from the latest revision event", and a revision event includes "any commit after the latest acceptance row that changes the normative baseline". The same line then says "Applying the findings of clean passes does not reset it". Take a planned document that is revised, as in S7.9 (tests/vh-adlc/scenarios/run.ts:1066, where plan() stores an acceptance row first, tests/vh-adlc/fixtures/build.ts:387-391). Its acceptance row stays the latest one during the revision. Clean pass A holds a factual should-fix, and step 3 (line 204) applies it in commit Y. Y comes after the latest acceptance row and changes the baseline, so Y becomes the latest revision event, pass A no longer descends from it, and the next clean pass is streak one again. Every clean pass that carries a baseline fix moves the event forward, so for a revised accepted document the streak cannot reach three and the churn the feature removes comes back. The definition also over-resets elsewhere: a never-accepted draft that goes draft to blocked to draft with no baseline change resets the streak, because "any commit that moves the document to draft from another status" counts, while the Owner summary limits the reset to "a revision of an accepted document". Line 223-224 says the skill finds the reset from "the latest `gate draft` commit", which does not detect the baseline-commit clause at all. Variant E checks only the first clean pass after the revision, so a skill that resets on every applied fix passes it. Variant F stores an acceptance row and expects streak three, which is only true if the fixture reaches a new pass without any baseline change after that row; the row does not say how.
PROPOSAL: Define the revision event once as the earliest commit after the latest acceptance row that changes the baseline or moves the document to draft from planned or in-progress, so later fixes from clean passes never move it, and use the same wording on line 188, lines 223-224, the Owner summary and AC-01. Extend Variant E to run to the third clean pass after the revision with a baseline fix applied after each of the first two, and say in Variant F that the new pass is a drift-only re-review with the baseline unchanged since the acceptance row.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (step 3, lines 206-208); Context, Owner summary (lines 46-47, "The author never stops to ask before the ceiling, including in a resumed session"); Context, Background, Existing scenarios (lines 128-132); Design, Delivery (lines 290-291); Test Plan AC-01 row (Variant G and the S7.7 sentence)
EVIDENCE: Step 3 says the spec and resume operations "request another pass instead of asking", but never says whether that means dispatching the reviewer again in the same session or ending the turn with a report that another pass is needed. Today review mode dispatches once per invocation (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:62-75 at 3963e25). The two readings behave differently in S7.7, whose first turn is `/vh-adlc-spec review` and whose second turn is the conditional acceptance (run.ts:529-532). With in-session dispatch, turn 1 runs real reviewer passes until the ceiling and the turn-2 acceptance names the third pass. With a report-and-stop reading, turn 2 is an owner acceptance at R-1, or an advance acceptance for R-2 if R-1's fixes changed the baseline. Background and Delivery say S7.7 keeps passing because its acceptance "names a clean pass whose baseline is unchanged", which holds only for one reading. Variant G passes "when another pass is requested", which a test cannot observe until the meaning is fixed: a reviewer dispatch in the trace, a new Review Log row, or a line in the report.
PROPOSAL: State whether the spec operation dispatches the next pass itself in the same session, and whether resume does. Make Variant G check that observable, for example a new stored spec row and no acceptance question in the report, and say which path S7.7 takes under the new rule.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Owner acceptance, line 190); Design, Stopping rule (step 6, lines 215-218); Scope (lines 159-160); Test Plan AC-01 row (Variant D)
EVIDENCE: Terminology defines an advance acceptance as one given "before a pass returns, conditioned on that pass being clean", which binds it to one pass. Step 6 and Scope honor it at "the first clean pass that meets its condition", which can be a later pass. If the pass after the owner's advance acceptance is blocking, step 2 applies its fixes to the baseline, and under step 6 the next clean pass is accepted on the owner's behalf with content the owner never saw. Under the Terminology reading the acceptance lapses at the blocking pass and the loop continues. Two careful implementers would build different skills, and the difference decides what the owner's acceptance authorizes. Variant D starts with a clean pass, so both skills pass it. This document's own status line relies on the same rule ("The owner accepts in advance if R-5 has no blocking finding", line 3).
PROPOSAL: State whether an advance acceptance survives an intervening blocking pass and its fixes, use the same wording in Terminology, step 6 and Scope, and add a Variant D case with a blocking pass before the first clean pass that checks the chosen behavior.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Free-text checks (lines 262-267); Design, Severity definitions (should-fix, lines 235-236); Acceptance Criteria AC-05; Test Plan AC-05 row
EVIDENCE: A row "has passed review once a clean pass's records hold no finding whose `WHERE` names that row". A clean pass whose reviewed commit predates the row, or predates the row's current pattern, also holds no finding naming it, so a newly added or rewritten pattern is treated as already reviewed and any request to widen it becomes a nit at once. Any `NO FINDINGS` pass makes every row in the document count as passed. The should-fix definition says "a proof could pass on a wrong implementation", which is exactly what a missed wrong output is, and the definitions as written carry no exception for it, so the convention would state two ratings for the same case in two places. The AC-05 fixture has one stored clean pass and an unchanged row, so it does not exercise either case.
PROPOSAL: Count a row as passed only when the clean pass's reviewed commit already holds the row's current text, and name the free-text exception inside the should-fix definition. Add an AC-05 case where the row changes after the stored clean pass and a widening finding must then stay should-fix.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Pins and older consumers (lines 271-274); Design, Stopping rule (lines 195-196); Acceptance Criteria AC-06; Test Plan AC-06 row (old-pin clone)
EVIDENCE: Line 195-196 puts the stopping rule into `SKILL.md` review mode steps 4 and 5 and the protocol's Records paragraph, so the plugin text carries the rule. Line 274 says "The plugin does not carry its own copy of the rules", and line 272-273 says that with an older pin "the current procedure runs, and the spec report says the stopping rule needs a pin at or after the companion commit". The design never says how the skill decides that the resolved page predates the companion change (for example, whether the page has the severity definitions or the new Acceptance step 2 text), nor where it gets the commit it names in the report. The binary cache holds pages at one SHA with no docs history (`ls ~/.cache/vh-adlc/docs/d8f07c9.../` shows only page files), so an ancestry check is not available. One implementer tests for text, another hard-codes a SHA, a third always runs the new steps from SKILL.md; the AC-06 old-pin run only checks the report wording.
PROPOSAL: Name the check the skill uses to choose the procedure (for example, the presence of the severity definitions in the resolved feature-documents page) and say that the needed pin it reports is the plugin's own pin from knowledge.md. Write the new SKILL.md and protocol steps as conditional on that check.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Saved nit, line 189); Design, Stopping rule (steps 1, 4 and 6, lines 198-200, 209-211, 215-217, and line 223, "Nothing new is stored"); Acceptance Criteria AC-01; Test Plan AC-01 row (Variants A, B and F)
EVIDENCE: Step 4 lists "every saved nit" and line 223 says the skill reads everything from the Review Log rows and records. The design does not say which stored nits count as saved. Passes stored before the update count toward the streak (line 221-222), but under the old procedure their nits were usually applied already; blog-visual-reading has 47 such passes. Nits from passes before a blocking reset or a revision may refer to text that later fixes rewrote. The records do not show whether a nit was applied, so one implementer lists every baseline nit in the log, another only those in the current streak, another only post-update ones. Variant A has no reset, and Variants B and F do not say whether their passes hold nits or which must be listed.
PROPOSAL: Define the saved nits as the baseline nits in passes recorded after the plugin adopts the rule and after the latest reset, or state another rule, and add an expected nit list to Variants B and F.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (lines 41-42, "unless they only touch Context or Sources"); Design, Stopping rule (step 1, lines 198-200)
EVIDENCE: Step 1 allows applying findings "confined to sections outside the normative baseline" at any time, which also covers Tasks, Open Questions and the title paragraph. The Owner summary still names only Context and Sources.
PROPOSAL: Have the Owner summary say that nits outside the normative baseline may still be applied.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Scope (In scope, first bullet, lines 158-160)
EVIDENCE: Scope says the author "honors an acceptance the owner gave in advance at the first clean pass that meets it". After R-4 the owner also decided that an acceptance given after a clean pass, with the baseline unchanged since, is honored (Open Questions, lines 361-362), and Terminology line 190, step 6 and AC-01 include it. Scope omits that case.
PROPOSAL: Add the after-pass acceptance with an unchanged baseline to the first Scope bullet.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Context, Background, Overlapping work (lines 146-149)
EVIDENCE: The plugin pin bump in shared-development-loop's Scope is at lines 150-151 at b777df0, not `:154` (`git show b777df0:docs/specs/shared-development-loop.md | grep -n "pin bump"` gives 151). That feature's covers also list `plugins/vh-adlc/skills/vh-adlc-resume/` and `plugins/vh-adlc/references/loop.md` (lines 13 and 16 at b777df0), which this feature now edits too, but Background does not name them in the overlap.
PROPOSAL: Cite `:150-151` and add the resume skill and loop.md to the overlap list.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Delivery (lines 300-302, "S7.7, S7.7.accept, S7.9 and S14.spec keep passing"); Test Plan AC-01 row (last sentence); Context, Background, Existing scenarios (lines 130-136)
EVIDENCE: S7.7's check sets `const blocking = /SEVERITY: blocking/.test(doc);` over the whole document (tests/vh-adlc/scenarios/run.ts:544). Then `const path = blocking || questions ? "the owner was left a decision" : "accepted"` (run.ts:549), and on that path it requires no acceptance row, status draft and no passing planned gate (run.ts:559). Under the current procedure a blocking R-1 ended turn 1, so the turn-2 conditional acceptance (run.ts:534) correctly did nothing. Under this Design, turn 1 (`/vh-adlc-spec review`, with no acceptance yet) keeps dispatching passes in-session until the streak reaches three or a question waits (lines 224-226). If R-1 has a factual blocking finding, the author fixes it and goes on to three clean passes. Turn 2 then accepts at the latest clean pass and the document reaches planned, which is correct under steps 4 and 6. But the stored R-1 record still matches `SEVERITY: blocking`, so the check expects no acceptance and the scenario fails. Turn 2's wording "if the review found nothing blocking" also stops naming a single review once turn 1 stores several. The AC-01 row requires S7.7 to keep passing, so the proof fails a correct implementation whenever any pass in turn 1 is blocking. This document's own blocking definition covers that case ("a proof fails a correct implementation").
PROPOSAL: Say in Delivery how S7.7 changes: its check should read only the latest spec review's records and expect acceptance when the loop ended at a clean pass, and its turn-2 prompt should name the latest pass. Drop the claim that it keeps passing unchanged.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Clean streak, line 192); Design, Stopping rule (steps 4 and 5, lines 213-218, and line 226, "the next run continues from the last marked row"); Context, Owner summary (lines 44-46, "so it never has to be worked out from history. A blocking finding sets it to zero, and a revision starts it again"); Acceptance Criteria AC-01 ("reading the previous value from the latest marked spec row ... counting from 0 after a revision"); Test Plan AC-01 row (Variants C and E)
EVIDENCE: Terminology reads the previous value from "the latest spec review row, skipping acceptance rows and `+dirty` rows; a row without a marker reads as 0". AC-01 and line 226 read it from the latest marked row instead. The two disagree when an unmarked spec row follows a marked one, for example a pass recorded under an older pin, which the Pins section says writes no marker. The stored rows also carry no record of a revision. SKILL.md:96-99 commits the move to draft on its own, and after it the latest marked spec row of a re-accepted document still says `streak 3 of 3`, followed only by an acceptance row that the count skips. A later session (resume, or a run that stopped for Open Questions during the revision) that follows the row rule records the first clean pass after the revision as 4, or ends the loop there. That contradicts "a revision starts it again". Values past three are also undefined. Step 5's extra pass after the owner picks findings follows a `streak 3 of 3` row, so the row rule gives 4. Steps 3 and 4 cover only "below three" and "the clean pass that brings the streak to three". Variant C does not state the expected marker. Variant E does not say whether the post-revision passes run in a new session, so a skill that keeps the revision only in session memory passes it.
PROPOSAL: Make the stored rows carry every input. For example, count from 0 when an acceptance row follows the latest marked spec row, use one rule for unmarked rows in Terminology, AC-01 and line 226, and state the marker and the step that applies at or above three. Have Variant E run its post-revision passes in a fresh session, and state Variant C's expected markers.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (steps 3 and 6, lines 207-212 and 219-222, and line 228, "A re-review caused only by default-branch drift counts as a pass like any other"); Design, Terminology (Owner acceptance, line 194); Test Plan AC-01 row
EVIDENCE: A re-review caused only by default-branch drift keeps the acceptance when the baseline is unchanged (conventions/feature-documents.md:220-222). `accepted` still holds (:309), and for a planned document `next` moves on to tasks or implement (:281-282). The Design counts such a pass "like any other" but does not say whether the standing acceptance row is an "owner acceptance" for steps 3 and 6. If it is, step 6 ends the loop at "the clean pass it names", which is the old pass, not the drift pass. If it is not, step 3 applies the drift pass's factual should-fix findings to the baseline of a planned document, which first needs `vh-adlc gate draft` and a revision (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:96-99), and then dispatches more passes. Two careful implementers build different loops, and the second turns a routine drift re-review into a revision. No variant covers a drift re-review of an accepted document.
PROPOSAL: State what the loop does after a drift-only re-review of a document whose acceptance still holds. For example, the standing acceptance ends the loop at the drift pass and its findings are listed rather than applied. Add a variant for it.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Saved nit, line 193); Design, Stopping rule (steps 1 and 4, lines 202-204 and 213-215); Acceptance Criteria AC-01 ("saves nits on the normative baseline from the current streak"); Test Plan AC-01 row (Variants B and E)
EVIDENCE: Terminology defines a saved nit as one "from a pass recorded since the latest `streak 0` row, inclusive". AC-01 says "from the current streak". The two differ in three cases. First, a document with no `streak 0` row (every marked pass clean, or a pre-update draft whose unmarked rows only read as 0) has no defined window under Terminology. Second, after a revision the latest `streak 0` row predates the revision and the earlier acceptance, so Terminology's window takes in nits that were already listed at that acceptance, while AC-01's current streak starts at the revision. Third, nits from clean passes before a blocking pass fall outside both windows: in Variant B, the first clean pass's nits are neither applied nor listed. That trade-off is settled without an Open Question. Variant E gives no expected nit list.
PROPOSAL: Define the window once, for example as the passes since the start of the current streak, and say whether nits dropped by a reset are lost or carried. Add expected nit lists to Variants B and E.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, Terminology (Clean streak and Saved nit, lines 192-193); Acceptance Criteria AC-01; Test Plan AC-01 row (Variant A); Context, Owner summary (line 44)
EVIDENCE: AC-01 says the author writes `streak <n> of 3` into every spec row and records 0 after a blocking finding, which gives `streak 0 of 3`. Terminology says a blocking pass "records `streak 0`", the saved-nit window starts at "the latest `streak 0` row", and Variant A expects rows from "`streak 0` to `streak 3 of 3`". Later runs read the value back from this text, so the exact form matters to whatever matches it.
PROPOSAL: Pick one form for zero, for example `streak 0 of 3`, and use it in Terminology, AC-01 and Variant A.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design, Stopping rule (lines 228-230, "the existing `Outcome` column, which the binary does not parse")
EVIDENCE: The binary reads the Outcome cell to recognize acceptance rows: "A row with `Outcome` exactly `accepted by owner` is an acceptance" (conventions/feature-documents.md:176-178; rules block `acceptance_row: { ..., outcome: accepted by owner, ... }`). The marker is harmless. In a scratch clone at 96fc16f, appending `; streak 0` to the R-5 Outcome left `vh-adlc lint` at `"result":"pass"`.
PROPOSAL: Say that the binary reads Outcome only to match an exact `accepted by owner`, so a streak marker in a spec review row does not change any result.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary (lines 66-68, "a consumer on an older pin keeps the current procedure"); Design, Pins and older consumers (lines 278-284)
EVIDENCE: Only the stopping rule is made conditional on the resolved page having the severity definitions. Line 282 says "the new `SKILL.md` and protocol steps are written as conditional on that check". The failure-mode check and one-pass completeness go into the reviewer agent unconditionally ("The reviewer's spec section gains", line 251; line 261). The Design does not say whether the author-side failure-mode step and restatement sweep in SKILL.md fall under the conditional. On an older pin, the reviewer therefore changes behavior while the summary says the current procedure is kept. AC-06's old-pin check looks only for the streak marker.
PROPOSAL: Say which changes apply on any pin and which only with the new convention, and make the Owner summary match.

### R-7

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Test Plan AC-01 row (Variant G, "the report asks no acceptance question"; Variant E, "every post-revision pass runs in a fresh session"); Design, Stopping rule (step 3, lines 211-216, and lines 233-236); Acceptance Criteria AC-01 ("when resumed below the ceiling, continues the loop instead of asking for acceptance")
EVIDENCE: Lines 233-234 say "In review mode the author dispatches each next pass itself, in the same session, while no Open Question is waiting for the owner", and step 3 says that when `next` reports `owner acceptance` below the ceiling the spec and resume operations "dispatch another pass instead of asking". Per step 2 a blocking pass does not stop the run either; only an Open Question does. Variant G resumes a draft at `streak 1 of 3` and passes "when a new spec row recording `streak 2 of 3` is stored and the report asks no acceptance question". A correct implementation does not stop at streak 2. It dispatches the next pass in the same session, and when the canned pass is clean it reaches `streak 3 of 3` and asks for acceptance under step 4, so the check fails it. Variant E requires every post-revision pass to run in a fresh session, but its passes hold only a factual baseline fix, which step 3 applies before continuing in the same session. The harness sends turns one after another and cannot end a session mid-run (tests/vh-adlc/scenarios/run.ts:137-141 at 3963e25), so the condition cannot be arranged without a stop that the row does not specify. This is the same class as R-6 F-01, and the document's own blocking definition covers it ("a proof fails a correct implementation or cannot be executed").
PROPOSAL: Give Variant G and Variant E canned passes that hold a judgement should-fix, so each run stops on an Open Question that the next session's owner turn answers, and state that in the row. Alternatively, change Variant G's pass condition to "no acceptance question is asked before a row records `streak 3 of 3`", and drop the fresh-session requirement from Variant E in favor of a stop the design defines.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Clean streak, line 196); Design, Stopping rule (step 7, lines 227-231); Acceptance Criteria AC-01 ("counting from 0 after a revision of an accepted document", lines 328-329); Context, Owner summary (line 45, "a revision starts it again"); Test Plan AC-01 row (Variants E and H)
EVIDENCE: Terminology resets the previous value to 0 only "when an acceptance row follows that row and the document's status is `draft`". Step 7 has a clean drift re-review of a `planned` or `in-progress` document record "the previous value plus one" in a new spec row and keep the acceptance, so no new acceptance row is written after it. Suppose the document is later revised: the latest spec review row is now the drift row, no acceptance row follows it, and its marker (for example `streak 4 of 3`) becomes the previous value. The first clean pass after the revision then records 5, and step 4 ends the loop after one post-revision pass. That contradicts AC-01 and the Owner summary. Drift re-reviews of accepted documents are routine here (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:55-61 at 3963e25). Variant E starts from a log whose last spec row precedes the acceptance row, and Variant H never revises afterward, so a skill that follows Terminology literally passes every listed check.
PROPOSAL: Define the reset so that it survives a drift row, for example count from 0 when the document is `draft` and any acceptance row comes after the latest spec review row recorded while the document was `draft`, or reset at the latest acceptance row when the status is `draft`. Add a Variant E case where a clean drift row sits between the acceptance row and the revision.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-01 row (Variant B); Design, Stopping rule (step 1, lines 206-208); Design, Terminology (Saved nit, line 197)
EVIDENCE: Variant B's passes are "clean, blocking, clean, clean, clean, each holding one nit on Design that later fixes leave in place", and it passes when "the findings of the first two clean passes after the blocking pass are applied, and the summary lists the last pass's findings and all five nits". If those passes hold only the stated nit, step 1 says nits on the normative baseline "become saved nits" and are not applied, so a correct skill applies nothing and the "applied" clause fails it. If the clause is read as vacuous, it checks nothing. Two test writers would build different canned records and checks.
PROPOSAL: Either give the first two clean passes after the blocking pass a factual should-fix that must be applied, or replace the clause with "no nit is applied and the baseline nit text is unchanged".

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (step 3 and lines 233-237); Acceptance Criteria AC-01 (resume clause); Test Plan AC-01 row (Variant G)
EVIDENCE: The spec skill stores and commits the records before changing anything (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:68-70 at 3963e25), then applies findings and commits again (:71). This repository's own log shows the two commits as separate ("record spec review R-6", then "apply spec review R-6", e588be7 and b40d2ca). A run interrupted between them leaves a clean pass whose factual should-fix findings were never applied, and the review stays fresh. Variant G resumes exactly that state ("a draft whose last row records `streak 1 of 3` with a fresh review"), and the design then dispatches another pass, so the unapplied findings are dropped unless the reviewer happens to find them again. The document's own failure-mode check asks about partial failure (lines 261-264), and Design leaves this path undefined.
PROPOSAL: State that a resumed or continued run first checks the latest stored pass: if it is clean, below the ceiling, holds factual should-fix or judgement should-fix findings on the baseline, and the review is still fresh, the author applies or raises them as step 3 says before it dispatches the next pass. Give Variant G's stored pass a factual should-fix and expect it to be applied.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-06 row ("two scratch clones whose `AGENTS.md` names the old and the new pin")
EVIDENCE: `owner-readable-specifications` lists `AGENTS.md` in its covers (`git show b40d2cab:docs/specs/owner-readable-specifications.md`, frontmatter line 15). In a scratch clone at b40d2cab, `vh-adlc fresh docs/specs/owner-readable-specifications.md` returned 12 findings with `feature_tree.clean: true`. After an uncommitted edit to `AGENTS.md`, it returned the same findings plus `feature-tree-dirty` and `"paths":["AGENTS.md"]`. After committing the edit, the findings matched the original exactly. A test writer who sets the pin by editing `AGENTS.md` in place in one clone gets a `findings` difference that the convention change did not cause, so the comparison fails a correct companion change. The row does not say whether the pin edit is committed.
PROPOSAL: Say that each clone commits its `AGENTS.md` pin before running the commands, or that the clones are checked out at commits that already hold each pin.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design, Terminology (Saved nit, line 197); Acceptance Criteria AC-01; Test Plan AC-01 row (Variants A, B and E)
EVIDENCE: A saved nit counts only while "its text still exists in the document". A finding record has no field for target text. A nit's EVIDENCE may quote a line, cite a line number, or ask for something to be added, so what "its text" means differs between implementers. Variant B avoids the question with nits that "later fixes leave in place", so no variant shows a nit being dropped.
PROPOSAL: Say what the author compares, for example the quoted text in the nit's EVIDENCE, and that a nit with no quote is always listed. Add a variant where a later fix removes a nit's quoted text and that nit is not listed.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context, Background, Overlapping work (lines 152-156)
EVIDENCE: The overlap cites `docs/specs/shared-development-loop.md:7-23` at `b777df0`, but that document's covers continue to line 29 and include `tests/vh-adlc/` (`git show b777df0:docs/specs/shared-development-loop.md`, line 29). That path holds `tests/vh-adlc/scenarios/run.ts` and the new test files this feature edits. The paragraph also describes the feature as on `origin/main` at `b777df0`, but `origin/main` is now `9378490`, with that document at R-8.
PROPOSAL: Cite `:7-29` and add `tests/vh-adlc/` to the overlap list, or say that the citation is as of `b777df0`.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-01 row (Variant E)
EVIDENCE: "record streaks 1, 2 and 3 the loop ends at 3" is missing a conjunction between the two clauses.
PROPOSAL: Write "record streaks 1, 2 and 3, and the loop ends at 3".

### R-8

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (paragraph after step 7, lines 234-239); Acceptance Criteria AC-01 (resume clause); Test Plan AC-01 row (Variant G)
EVIDENCE: Lines 235-238 say "Before it dispatches, a continued or resumed run checks the latest stored pass: if that pass is clean, below the ceiling and still fresh, and holds should-fix findings on the baseline, the author first applies or raises them as step 3 says". Being fresh is the only sign that the findings were not handled. Suppose the owner answers a judgement should-fix by keeping the current design. The question is folded and removed ("An answered question is folded into the document and removed", conventions/feature-documents.md:159), and Scope, Design, Acceptance Criteria and Test Plan stay unchanged. The review then stays fresh (feature-documents.md:300-301), so the next continued run finds a clean, fresh pass that holds a should-fix on the baseline and raises the same question again. The same happens when the author checks a factual should-fix and finds the reviewer was wrong, so applying it changes nothing. A literal implementation loops, and Variant G only covers a finding that was never applied.
PROPOSAL: Limit the check to findings that have not been applied or answered, for example by recording the answered finding IDs where the folded answer is written and skipping them. Add a variant where the owner keeps the status quo on a judgement should-fix and the next run dispatches a pass without asking again.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-01 row (Variant E, "a second session continues after the owner's answer")
EVIDENCE: The harness runs every prompt of one `session()` call as a resumed conversation: `resume: turns.at(-1)?.sessionId || undefined` (tests/vh-adlc/scenarios/run.ts:138). A second, independent conversation is a separate `session()` call, as S14.spec does with `turns.push(...session(g, [broken], [...]))` (run.ts:631). The row does not say which one it means. If the owner's answer is written as a second prompt in the same `session()` call, the conversation still remembers the revision. A skill that resets the count from session memory instead of from the stored rows, as Terminology requires (line 196), then passes Variant E. R-6 F-02 asked for this variant to prove that the count comes from the stored rows.
PROPOSAL: State that the continuation runs in a separate `session()` call with no `resume`, so only the stored document carries the revision and the drift row.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Delivery (lines 317-322, S7.7 "Its first turn now continues in-session until the loop ends or a question waits"); Test Plan AC-01 row (Variant B and the S7.7 clause)
EVIDENCE: Every scenario turn runs with `maxTurns: 80` (run.ts:138), which host.ts passes as `--max-turns` (tests/vh-adlc/scenarios/host.ts:82). A turn that ends with an error stops the session (`if (t.isError) break;`, run.ts:141). Under this Design one turn can now hold several full passes. Each pass means a dispatch, storing records, `review check`, a commit, applying findings, lint and a second commit. Variant B runs five passes in one turn because none of them raises an Open Question. S7.7 turn 1 uses the real reviewer and continues to streak 3 after any blocking pass. Neither the Delivery section nor the row states a turn budget, so a correct skill can be cut off partway, and the later checks then run against a half-finished loop.
PROPOSAL: Say what turn budget these cases need and raise `maxTurns` for them, or arrange the canned passes so that the run stops between owner turns. Have the check fail, not pass vacuously, when a turn ends with `isError`.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Scope (lines 165-168 and 175-176); Design, Stopping rule (line 203); Design, Delivery (lines 306-309); Context, Owner summary (line 66); Acceptance Criteria; Test Plan
EVIDENCE: Line 203 says "In the convention's Acceptance section, step 2 gains the rule", and the Owner summary says "The definitions, the stopping rule and the free-text rule go into `vhco-pro/docs`". AC-02 and AC-05 check the published page only for the severity definitions and the free-text example requirement, and AC-06 checks only pins, versions and lint, fresh and gate parity. No criterion or Test Plan row checks that the published Acceptance section states the stopping rule or the `streak <n> of 3` marker. None checks that `docs/get-started/first-feature.md` and `docs/user-guides/workflows.md` describe the stopping rule, saved nits and owner acceptance, as Scope and Delivery require. A companion change that adds only the definitions passes every criterion. The plugin then runs the new procedure, because it keys on the definitions alone (line 295-297), while the convention's Acceptance steps still describe the old one.
PROPOSAL: Extend the AC-02 or AC-06 check in `tests/vh-adlc/review-convergence.test.ts` so it also asserts that the published Acceptance section states the stopping rule and the marker format. Add a criterion with a Test Plan row for the two user guides.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (lines 43-44, "The author writes the count into each Review Log row"); Design, Terminology (Clean streak, line 196, "every spec review row it records"); Acceptance Criteria AC-01 (lines 330-331); Design, Stopping rule (step 7, lines 229-231)
EVIDENCE: AC-01 says the author "writes `streak <n> of 3` into the Outcome of every spec review row it records", and Terminology says the same. Step 7 says "A drift pass records `drift` in place of a streak", and Variant H expects the drift row to record `drift`. The Owner summary says "each Review Log row", which also covers acceptance rows, and those carry no marker.
PROPOSAL: Say "every spec review row other than a drift row" in Terminology and AC-01, and "each spec review row" in the Owner summary.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-01 row (Variants A and E)
EVIDENCE: Variant A expects the summary to list "pass 3's IDs and the nits from all four passes". The row states content only for the first two clean passes, so the blocking pass and clean pass 3 have no stated nit or findings. Variant E begins "a `planned` document whose last row records `streak 3 of 3`, followed by an acceptance row and then a clean row marked `drift`". A row that two other rows follow is not the last row.
PROPOSAL: State the canned records of the blocking pass and clean pass 3 in Variant A. In Variant E write "whose latest non-drift spec review row records `streak 3 of 3`".

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Frontmatter `covers` (lines 18-20); Design, Delivery (lines 320-323)
EVIDENCE: The AC-01 variants "run against a copy of the plugin whose reviewer agent returns canned records keyed by pass number". The Design does not say where the scripted reviewer definition and its canned records are stored. Under `tests/`, covers lists only `tests/vh-adlc/review-convergence.test.ts`, `tests/vh-adlc/scenarios/run.ts` and `tests/vh-adlc/evidence/review-convergence/`. If they live in a new file elsewhere, `feature_tree_clean` (conventions/feature-documents.md:316) does not see changes to it.
PROPOSAL: Name the path of the scripted reviewer and its canned records, and add it to covers if none of the listed paths holds it.

### R-9

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-06 row (line 385, "In the old-pin clone, run the updated spec skill's review mode"); Tasks T9 (line 400); frontmatter covers
EVIDENCE: T9 puts the old-pin case in `tests/vh-adlc/scenarios/run.ts`. The AC-06 row puts it in one of the two scratch clones of this repository, which use the real binary and cache. Those are two different harnesses. Scenarios call the binary through `tests/vh-adlc/shim/vh-adlc`, which always adds `--docs-source "$docs"` (shim line 16). Here `$docs` is the fixture docs repository that `tests/vh-adlc/fixtures/build.ts:112-117` builds with a depth-1 fetch of the plugin pin read from `knowledge.md`. Revisions B, C and D all derive from that commit. After T3, then, the fixture holds only the new pin. Running `vh-adlc knowledge --repo <clone> --plugin-pin d8f07c9dd69038375a535af8ad586086688f85ab --docs-source <repo without that commit>` returned `"result":"unreachable"` with "the docs source has no commit d8f07c9dd69038375a535af8ad586086688f85ab"; `lint` returned the same. A run.ts scenario "in a clone on the previous pin" therefore gets `unreachable`, not the current procedure, unless the previous docs commit is first added to the fixture. Neither the row nor T9 says so, and `tests/vh-adlc/fixtures/build.ts` is in neither covers nor any task.
PROPOSAL: Say which harness runs the old-pin case. If it is run.ts, state that the scenario adds the previous pin's docs commit to the fixture docs repository, and if that change goes in `tests/vh-adlc/fixtures/build.ts`, add the file to covers and to T9.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-01 row (Variants D2, D3 and F); Design, Stopping rule (paragraph after step 7, line 234)
EVIDENCE: Line 234 says "the author dispatches each next pass itself, in the same session, while no Open Question is waiting for the owner". Variant D2 has the owner accept "after a clean pass holding only nits" and passes when "no further pass runs". A nits-only clean pass below the ceiling raises no question, so a correct author keeps dispatching passes in the same turn. If the scripted reviewer runs that pass in turn 1, the owner's turn arrives only after more passes, and the check fails a correct skill. The check holds only if the fixture stores the pass before the owner's turn, as S7.7.accept does with `accept(f, "NO FINDINGS", false)` (run.ts:577), and the row does not say so. Variants D3 and F check one row ("the next clean pass records `streak 1 of 3`"), but a correct run keeps dispatching after it. The row gives no canned records for later passes and no point where the run stops. Variant F also gives no document status: if the document is `planned` after its acceptance row, step 7 records `drift`, not `streak 1 of 3`.
PROPOSAL: State that D2's clean pass is stored by the fixture before the owner's turn. For D3 and F, give the canned records of every later pass up to the stop, or a judgement should-fix that stops the run, and give F's status as `draft`.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-01 (lines 340-341, "ends the loop at a drift re-review of an accepted document without applying its findings"); Design, Stopping rule (step 7, lines 230-232); Design, Terminology (Clean streak, line 196, "rows marked `drift`"); Test Plan AC-01 row (Variant H)
EVIDENCE: Step 7 says "A blocking drift pass records `drift, blocking` and is handled as today, through a revision, which then counts from 0". AC-01 has no clean qualifier on its drift clause. Read literally, it requires the loop to end without applying findings even after a blocking drift pass, which contradicts step 7. Variant H covers only a drift pass with a factual should-fix, and no variant has a blocking drift pass. A skill that writes `drift` on a blocking drift pass, keeps the acceptance and only lists the findings passes every listed check. Terminology skips "rows marked `drift`" without saying whether `drift, blocking` counts as marked.
PROPOSAL: Limit AC-01's drift clause to a clean drift re-review, add the `drift, blocking` branch to AC-01, and add a variant. In it a blocking drift pass records `drift, blocking`, the document goes through `vh-adlc gate draft`, and the first clean pass after the revision records `streak 1 of 3`. Say in Terminology that `drift, blocking` rows are skipped too.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Owner acceptance, line 198); Design, Stopping rule (step 3, lines 215-216, and paragraph after step 7, lines 234-243); Acceptance Criteria AC-01 (resume clause); Test Plan AC-01 row (Variant G)
EVIDENCE: Owner acceptance includes one given "in advance for the next pass", but the design does not say whether an advance acceptance given in one session still holds in a later session that runs that pass. Recorded advance acceptances are common practice: this document's Open Questions say the owner "accepted in advance if R-5 has no blocking finding" (lines 416-417), and `docs/specs/shared-development-loop.md` at `d367673` has status_description "the owner accepts once a confirming review has no blocking findings". Under the design, an interrupted run continues through the resume skill (Variant G path). One implementer honors the recorded acceptance and writes the acceptance row at the next clean pass. Another ignores it, because the convention has the owner accept in session (conventions/feature-documents.md:216), and continues to the ceiling. Step 3's "no owner acceptance exists" test means different things under each reading, and no variant covers it.
PROPOSAL: State whether an advance acceptance recorded in the document carries into a later session, and use the same wording in Terminology, step 3 and AC-01. Add a variant where a resumed run meets a recorded advance acceptance and the chosen behavior is checked.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary (lines 31-79)
EVIDENCE: The document was accepted at R-8 (Review Log line 440), then moved back to draft when the owner picked R-8 F-01 to F-07 (Open Questions lines 424-426). The convention asks the summary to "Explain material changes since the last accepted scope" (conventions/feature-documents.md:87-88). The summary does not mention the new AC-08 (the convention's Acceptance text and the two user guides). It also leaves out the rule that the author names answered or rejected findings in the decision record and that the resumed-pass check skips them (lines 239-240), Variant J, the separate-session Variant E, and the 250-turn budget. It does not mention the two user guides at all, although Scope and AC-08 now require them.
PROPOSAL: Add a short paragraph to the Owner summary that lists what changed since the R-8 acceptance, and name the user guides among what the feature changes.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design, Terminology (Saved nit, line 197); Design, Stopping rule (step 5, lines 220-222, and lines 239-240); Test Plan AC-01 row (Variant C)
EVIDENCE: A saved nit is listed "unless its `EVIDENCE` quotes text that no longer exists in the document; a nit that quotes nothing is always listed". Only folded answers and rejected factual findings are named in the decision record (lines 239-240), not findings the owner picks in step 5. A nit with no quote that the owner picks and the author applies is therefore listed again at the next acceptance question. Variant C does not check that.
PROPOSAL: Have the author name step 5 picks in the decision record too, and leave named findings out of the saved-nit list.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Design, Terminology (lines 191-199); Design, Stopping rule (step 7, lines 227-232)
EVIDENCE: The convention requires that "User-facing terms the feature introduces or changes appear in a glossary row" (conventions/feature-documents.md:156-158). The `drift` and `drift, blocking` Outcome markers and the "drift row" that Terminology, Scope and AC-01 refer to are defined only in step 7. Step 7 also treats every new pass on a `planned` or `in-progress` document with a standing acceptance as a drift pass, even when the owner asks for it without any default-branch change.
PROPOSAL: Add a Terminology row for a drift pass and its two markers, and say whether an owner-requested re-review of an accepted document with no drift is also recorded as `drift`.
