---
status: parked
status_description: "Split out of spec-review-convergence at its R-13; parked until shared-development-loop lands, then reviewed against its review flow."
issue: null
goal: "Spec review stops requesting passes after three consecutive passes without a blocking finding, and every owner acceptance, pick and resume lands on the right pass."
covers:
  - plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md
  - plugins/vh-adlc/references/review-protocol.md
  - plugins/vh-adlc/references/loop.md
  - docs/get-started/first-feature.md
  - docs/user-guides/workflows.md
  - tests/vh-adlc/scenarios/run.ts
  - tests/vh-adlc/evidence/review-convergence/
---

# Plan: Spec review stopping rule

Stop the spec review loop at three consecutive passes without a blocking finding, with owner picks,
acceptances, drift re-reviews and resumed runs each landing on the right pass.

## Context

### Owner summary

This is the stopping rule that `docs/specs/spec-review-convergence.md` carried until its R-13. It was
split out because every blocking finding from R-4 to R-13 of that spec came from this rule's bookkeeping,
while the rest of that spec had settled. It is parked until `shared-development-loop`, which changes how
spec review hands off to acceptance, has landed; it is then reviewed against that flow.

The rule: the author stops requesting passes once three consecutive passes have no blocking finding, and
writes the state into each spec review row when it knows it, as `streak <n> of 3`, with
`, after owner change` on the first clean pass after a change the owner directs. That pass comes straight
back to the owner. An acceptance resets the count, and so does a blocking finding. The owner can accept
after any clean pass while the baseline is unchanged since it, withdrawing that pass's open questions
into the listed findings, or in advance for a named pass `R-<n>`. A clean re-review of an accepted spec
keeps the acceptance. Saved nits are collected across passes for the acceptance summary. A decision
record lets a resumed run skip findings already answered, rejected or picked.

Every owner decision taken while the rule lived in `spec-review-convergence` (R-1 to R-13) is folded into
the design below and listed in that document's decision record. Three judgement findings from its R-13
are open questions here. Nothing is implemented or reviewed in this document yet.

Accepting this would authorize the plugin edits and tests on a feature branch, after
`spec-review-convergence` has delivered the severity definitions and the nit rule this builds on.

### Background

`docs/specs/spec-review-convergence.md` measured the churn this rule targets (its Background) and
records the design's review history in its R-1 to R-13. The binary already names owner acceptance as the
next step after any fresh, clean review (`conventions/feature-documents.md:279` at `d8f07c9`); today's
procedure applies factual findings and asks again (`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:71-75`
at `3963e25`). The resume skill stops and asks whenever `vh-adlc next` says `owner acceptance`
(`plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md:42`). Scenarios S7.7 (`tests/vh-adlc/scenarios/run.ts:526`),
S7.7.accept (`:572`), S7.9 (`:1066`) and S14.spec (`:626`) rely on acceptance after a single clean pass, and
S7.7's check treats any `SEVERITY: blocking` line as meaning no acceptance (`run.ts:544-549`).
`shared-development-loop` is `in-progress` on `feat/shared-development-loop` and covers the same skill,
resume skill, protocol and `loop.md`.

## Scope

In scope: the stopping rule in the spec skill's review mode and the protocol, the resume skill and
`references/loop.md`, the count, suffix and drift markers, saved nits across passes, the decision
record, owner and advance acceptance, the S7.7 and S7.9 changes, the scenario cases, and the user guides'
description of the rule. The convention text for the rule and its markers is a companion change to
`vhco-pro/docs`.

Out of scope, by name: the severity definitions, the nit rule, the failure-mode check, one-pass
completeness, the one-revision rule, the no-rewrite rule and the free-text rule, which
`spec-review-convergence` delivers; any change to the rules block or the binary; choosing a reviewer model.

## Design

### Terminology

| Term | Meaning |
| --- | --- |
| Clean pass | A spec review pass with no blocking finding, including one that returns `NO FINDINGS` (AC-01). |
| Clean streak | The count the author writes into the `Outcome` cell of every spec review row other than a drift row, as `streak <n> of 3` (AC-01). The previous value is the count in the latest spec review row, skipping `+dirty` rows and drift rows; it is 0 when that row has no count or when an acceptance row comes after it. A clean pass records the previous value plus one, which can exceed three after an owner change; a pass with a blocking finding records `streak 0 of 3`. Applying the findings of clean passes does not change it. |
| Owner change | A change to the document the owner directs: picks from a list the author gave, or any other revision the owner asks for. The first pass after it adds `, after owner change` to its count when clean, unless the owner asked for the full loop (AC-01). |
| Saved nit | A nit on the normative baseline from a spec review row carrying a `streak <n> of 3` marker, recorded since the latest acceptance row (or since the first such row when there is none), not named in the decision record. Rows stored before the update carry no marker, so their nits are never saved nits, and a drift row's findings are listed at that drift pass instead. The author lists every saved nit in the acceptance summary and marks any that a later change already addressed (AC-01). |
| Drift pass | Any spec review pass on a `planned` or `in-progress` document whose acceptance still holds, whether default-branch drift or the owner asked for it. Its row records `drift` when clean and `drift, blocking` when blocking, in place of a streak; both are drift rows (AC-01). |
| Decision record | The dated entries under Open Questions, newest last, in which the author records the owner's decisions, every finding it has folded, rejected after checking or applied at the owner's pick (by ID, for example `R-4 F-02`), and every advance acceptance with the pass it covers and whether it lapsed (AC-01). |
| Owner acceptance | An acceptance the owner gives after a clean pass while the normative baseline is unchanged since that pass, as in S7.7, S7.7.accept, S7.9 and S14.spec, or in advance for a named pass `R-<n>`, conditioned on that pass being clean. Open Questions raised from the accepted pass are withdrawn and shown with its listed findings. The author records an advance acceptance in the decision record before dispatching `R-<n>`; it holds in any later session and lapses if `R-<n>` has a blocking finding, which the author records there too (AC-01). |

### Stopping rule

In the convention's Acceptance section, step 2 gains the rule, and `SKILL.md` review mode steps 4 and 5
and the protocol's Records paragraph follow it:

1. In every pass, nits on the normative baseline become saved nits. Findings confined to sections
   outside the normative baseline may be applied at any time, because they do not make the review
   stale.
2. After a pass with a blocking finding, the author handles its blocking and should-fix findings as
   today, factual ones applied and judgement ones put to the owner as Open Questions, in one revision as
   `spec-review-convergence`'s one-revision rule describes.
3. After a clean pass that leaves the clean streak below three, and with no owner acceptance for it, the
   author applies its factual should-fix findings and puts its judgement should-fix findings to the
   owner as Open Questions, folded in before the next pass is dispatched. The author never asks the
   owner to accept below the ceiling, except after an owner change (step 5). When `vh-adlc next` reports `owner acceptance` below the ceiling
   and no owner acceptance covers the latest pass, the spec and resume operations dispatch another pass
   instead of asking.
4. After a clean pass that brings the streak to three or more, the author applies nothing to the
   normative baseline and raises no Open Questions. It lists each of that pass's findings and every
   saved nit, with ID and one line, in the owner-facing summary before the acceptance question.
5. The owner may pick findings from any list the author gave, or ask for another revision. The author
   makes the change, with judgement findings decided by the pick, names picked findings in the decision
   record, and dispatches one pass. For an accepted document it first moves the document to `draft`
   through `vh-adlc gate draft`, as the convention requires. When that pass is clean, its row records
   its count with `, after owner change`, and the author lists its findings and the saved nits and asks
   the owner again, whatever the count; a continued or resumed run that finds such a row as the latest
   one, while that pass is still fresh, does the same; a stale one means a later change was made, so the
   run dispatches one pass for it. When that pass is blocking, it records `streak 0 of 3` and the loop continues as
   usual. When the owner asks for the full loop, the author leaves the suffix off.
6. With an owner acceptance, the clean pass it names ends the loop whatever the streak: the author
   applies nothing to the normative baseline, withdraws any Open Questions raised from that pass into
   its listed findings, lists those findings and the saved nits, and writes the acceptance row at that
   pass, so the accepted commit keeps the reviewed baseline.
7. A drift pass that is clean ends the loop at once: the author applies nothing to the normative
   baseline, lists its findings, keeps the acceptance and records `drift`. A blocking drift pass
   records `drift, blocking` and is handled as today, through a revision that counts from 0.

In review mode the author dispatches each next pass itself, in the same session, while no Open Question
is waiting for the owner. Before it dispatches, a continued or resumed run checks the latest stored
pass: if its row carries `, after owner change` and that pass is still fresh, the author asks as step 5 says; otherwise, if that pass
is clean, below the ceiling and still fresh, and holds should-fix findings on the baseline that the
decision record does not name, the author first handles them as step 3 says, because
an interrupted run can leave them unapplied. Whenever the author folds an answer, rejects a factual
finding after checking it, or applies a pick, it names the finding in the decision record, and the check
skips every finding named there. A run that stops for Open Questions reports the current streak, and the
next run reads the previous value as Terminology states. The resume skill and `references/loop.md` apply
this rule before acting on `owner acceptance` from `vh-adlc next`, and continue through the spec skill's
review mode. The count, the `, after owner change` suffix and the drift markers are the only new text. They sit in the existing `Outcome`
column, which the binary reads only to match an exact `accepted by owner`
(`conventions/feature-documents.md:176-178`), so a marker in a spec review row changes no result, and the
rules block and record formats are unchanged. Acceptance still requires a fresh, clean review at the
accepted commit, and the pass that ends the loop is that review.

### Delivery

S7.7.accept and S14.spec keep passing unchanged: each acceptance names a clean pass whose baseline is
unchanged, and S14.spec runs without the binary. S7.7 and S7.9 change. Their turns can now hold several
passes, so they run with `maxTurns` 250 and fail when a turn ends with `isError`. S7.7's check reads only
the latest spec review's records instead of any `SEVERITY: blocking` line in the document. Turn 1 ends
at the ceiling, at an Open Question from a clean pass, or at an Open Question from a blocking pass. In
the first two cases the turn-2 conditional acceptance names that clean pass, so the check expects an
acceptance row there, with any raised questions withdrawn into the listed findings. In the third the
condition fails, so the check expects no acceptance row and the document still `draft`. Its turn-2 prompt is computed from the document after turn 1. S7.9's
status check keeps accepting either a draft still waiting or a re-acceptance.

The scenario cases run against the scripted reviewer that `spec-review-convergence` adds, with
`session()` gaining a `maxTurns` option and computed prompts, every multi-pass case at `maxTurns` 250
failing on `isError`, separate `session()` calls for later sessions, and a canned clean pass with a
judgement should-fix wherever a run must stop at a defined point.

## Acceptance Criteria

- [ ] AC-01: An author following the updated spec procedure writes `streak <n> of 3` into the Outcome of
      every spec review row other than a drift row, reading the previous value as Terminology states,
      recording `streak 0 of 3` after a blocking finding and counting from 0 after an acceptance;
      dispatches each next pass itself while no Open Question waits, and never asks for acceptance below
      the ceiling except after an owner change; saves nits as Terminology defines and lists them, marking
      addressed ones; after each clean pass below three without an owner acceptance, applies factual
      should-fix findings and the answers to its judgement findings before the next pass; at three or
      more, applies nothing to the baseline and lists that pass's findings and the saved nits; after an
      owner change, runs one pass, records a clean one with `, after owner change` and asks again
      whatever the count, in a live, continued or resumed run, unless the owner asked for the full loop;
      honors an owner acceptance by writing the acceptance row at the pass it names without applying
      that pass's findings, withdrawing its Open Questions into the listed findings; records an advance
      acceptance with its pass, honors it in a later session, and records its lapse at a blocking pass;
      ends the loop at a clean drift pass, and handles a blocking drift pass through a revision that
      counts from 0; names every folded, rejected or picked finding in the decision record and never
      raises one again; after a second owner change, dispatches its pass even though the latest row carries the suffix; and, when resumed below the ceiling after a pass without the suffix, handles that
      pass's unhandled findings and continues instead of asking for acceptance.
- [ ] AC-02: The published convention's Acceptance section states the stopping rule, the
      `streak <n> of 3` count, the `, after owner change` suffix and the `drift` and `drift, blocking`
      markers, and `docs/get-started/first-feature.md` and `docs/user-guides/workflows.md` describe the
      stopping rule, saved nits and owner acceptance.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Scenario cases in `tests/vh-adlc/scenarios/run.ts` with the scripted reviewer, set up as Delivery describes. Variant A (first draft): a blocking pass holding a factual blocking finding and a nit on Design, then three clean passes, the first two each holding a factual should-fix, a judgement should-fix and a nit on Design, the third a factual should-fix and a nit on Design; pass when the rows record `streak 0 of 3` to `streak 3 of 3`, the factual should-fix findings are applied after clean passes 1 and 2, their judgement findings are asked and folded before the next pass, no acceptance question comes before streak 3, nothing on the baseline changes after it, and the summary lists pass 3's two finding IDs and the four nits. Variant B (blocking reset): clean, blocking with a factual blocking finding, clean, clean, clean, each holding one nit on Design that later fixes leave in place, and the two clean passes after the blocking pass each also holding a factual should-fix; pass when the rows record streaks 1, 0, 1, 2 and 3, those two findings are applied, no nit is applied, and the summary lists the last pass's findings and all five nits. Variant C (picks at the ceiling): the owner picks one listed finding; pass when it is applied and named in the decision record, the next clean pass records `streak 4 of 3, after owner change`, acceptance is asked again, and the picked finding is not listed again. Variant C2 (picks after acceptance): the owner accepts at a clean pass recording `streak 3 of 3` and picks one listed finding; pass when the document goes through `vh-adlc gate draft`, the pick is applied, the next clean pass records `streak 1 of 3, after owner change`, and acceptance is asked right after it. Variant C3 (another revision after an early acceptance): the owner accepts at a clean pass recording `streak 1 of 3`, then asks for a scope change; pass when the next clean pass records `streak 1 of 3, after owner change` and acceptance is asked right after it. Variant C4 (full loop on request): as C3, but the owner asks for the full loop; pass when the next clean passes record streaks 1, 2 and 3 without the suffix and acceptance is asked only at 3. Variant C5 (resume after an owner change): the fixture stores a clean pass recording `streak 2 of 3, after owner change` and ends the session, and a separate `session()` call resumes through the resume skill; pass when the run asks for acceptance and dispatches no pass. Variant C6 (two owner changes): after a clean pass recording `streak 4 of 3, after owner change`, the owner asks for another revision; pass when the author applies it and dispatches a pass instead of asking, including in a separate `session()` call that resumes after the change was committed but before its pass ran. Variant D (advance acceptance, same session): the decision record names `R-<n>`, and `R-<n>` is clean with a factual should-fix; pass when nothing is applied, the acceptance row names `R-<n>` and `vh-adlc gate planned` passes. Variant D2 (acceptance after a pass): the fixture stores a clean pass holding only nits before the owner's turn, and the owner accepts as reviewed in that pass; pass when the acceptance row names it and no further pass runs. Variant D6 (acceptance withdraws questions): the run stops on an Open Question from a clean pass, and the owner accepts as reviewed in that pass; pass when the question is withdrawn into the listed findings, the acceptance row names the pass and `vh-adlc gate planned` passes. Variant D3 (lapse, same session): the advance acceptance names `R-<n>`, `R-<n>` holds a factual blocking finding, and the following clean pass stops on a judgement should-fix; pass when the lapse is recorded, the blocking fixes are applied, no acceptance row is written and the clean pass records `streak 1 of 3`. Variant D4 (later session): the decision record names `R-<n>`, a separate `session()` call resumes, and `R-<n>` is clean; pass when the acceptance row names it. Variant D5 (lapsed, later session): the decision record names an advance acceptance for `R-<n>` and records its lapse, a separate `session()` call resumes, and the next clean pass stops on a judgement should-fix; pass when no acceptance row is written. Variant E (author revision after a drift pass): a `planned` document whose latest non-drift spec review row records `streak 3 of 3`, followed by an acceptance row and a clean `drift` row holding a nit, gets a blocking drift pass, so the author revises it through `vh-adlc gate draft`; the first post-revision clean pass also holds a judgement should-fix, so the run stops, and the owner's answer starts a separate `session()` call; pass when the post-revision clean passes record streaks 1, 2 and 3 without the suffix, the loop ends at 3, and the summary lists only nits from the post-revision passes, not the drift row's nit. Variant F (stored rows): a `draft` document whose log has unmarked clean rows holding nits, a clean `+dirty` row and an acceptance row; the next canned pass is clean and stops on a judgement should-fix; pass when it records `streak 1 of 3` and no nit from an unmarked row is listed later. Variant G (resume): a draft whose last row records `streak 1 of 3`, with a fresh review whose factual should-fix was never applied, is resumed through the resume skill, and the next canned pass is clean and stops on a judgement should-fix; pass when the stored finding is applied before any dispatch, a new row records `streak 2 of 3`, and no acceptance question is asked. Variant H (clean drift): an accepted `planned` document gets a drift pass with a factual should-fix; pass when its row records `drift`, nothing is applied, the status stays `planned`, the acceptance is kept and the finding is listed. Variant H2 (blocking drift): an accepted `planned` document whose log holds an earlier `, after owner change` row before its latest acceptance row gets a drift pass with a factual blocking finding; the first clean pass after the revision stops on a judgement should-fix; pass when the drift row records `drift, blocking`, the document goes through `vh-adlc gate draft`, and that clean pass records `streak 1 of 3`. Variant I (addressed nit): as Variant A, but a fix applied after clean pass 1 addresses a pass-1 nit; pass when that nit is listed and marked addressed and the other saved nits are listed plainly. Variant J (answered and rejected findings): a clean pass holds a judgement should-fix, which the owner answers by keeping the current design, and a factual should-fix whose claim the fixture makes false, which the author rejects after checking; a separate `session()` call continues, and its next canned pass is clean and stops on a different judgement should-fix; pass when both findings are named in the decision record and neither is raised or applied again. S7.7.accept and S14.spec still pass, and S7.7 and S7.9 pass with their changes. |
| AC-02 | A check in `tests/vh-adlc/` reads the published Acceptance section for the rule, the count, the suffix and both drift markers, and the two guides for the stopping rule, saved nits and owner acceptance. |

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q1: Is folding the owner's answers to Open Questions an owner change?

**Recommendation:** A. No: answers to questions the author raised keep the count running; only picks and
revisions the owner initiates are owner changes.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Answers are not owner changes** | The full loop runs through answered questions, as Variants A and E expect | An answer that rewrites the design gets no immediate re-ask |
| **B. Answers that change the design are owner changes** | Every design-changing answer comes back to you after one pass | The author must judge which answers change the design |

**Why this is yours:** It decides how often you are asked during a loop (R-13 F-02 of `spec-review-convergence`).

### Q2: Does a request for the full loop restart the count at zero?

**Recommendation:** A. Yes, recorded in the decision record so a resumed run reads it.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Restart at zero** | "Full loop" always means three clean passes | One more decision record entry the author must write and read |
| **B. Keep the count** | Nothing new to record | Outside the post-acceptance case the request only drops the suffix |

**Why this is yours:** It settles what "ask for the full loop" promises (R-13 F-03).

### Q3: Does an advance acceptance win over the re-ask after an owner change, and does an unnamed conditional acceptance count?

**Recommendation:** A. The advance acceptance wins, and an unnamed conditional acceptance such as S7.9's
is recorded as an advance acceptance for the next pass `R-<n>`.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Acceptance wins, unnamed counts** | S7.9 and similar instructions work as written | The author names the pass on your behalf |
| **B. Re-ask wins, only named counts** | You always see the post-change pass | S7.9's instruction no longer accepts anything |

**Why this is yours:** It decides what your conditional acceptances authorize (R-13 F-04).

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
