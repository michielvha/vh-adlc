---
issue: https://github.com/michielvha/vh-adlc/issues/172
---

# Analysis: why the proportional review brief lost enterprise labels L-08 and L-10

Draft, measured on 2026-11-27 against `cb1b8174` (origin/main). This covers Deferred entries D-17 and D-18
of [the proportional review spec](../../specs/proportional-review.md), tracked in
[#172](https://github.com/michielvha/vh-adlc/issues/172).

The first part of this draft compares the two briefs. The section
[Reading the stored records](#reading-the-stored-records) then checks the hypotheses against the private
enterprise case, read in place on the host that holds it. That section cites the case only by label ID,
count and run number. The conclusions come from primary sources read in this run: the stored first-pass
records, matcher verdicts and approved labels of the enterprise case, the Git history of this repository, the
[docs comparison](https://github.com/vhco-pro/docs/compare/30c38c8dc6840a052f3f653a483ad3c5edac06c1...0fa68d68db3e65585f505e86f4850d883d6ef1d7)
of `vhco-pro/docs`, and the public [results file](../../../tests/vh-adlc/evidence/proportional-review/results.md).

## Measured facts

The old brief is plugin `0c9fee77` with docs `30c38c8d`. The new brief is plugin `ef685da1` with docs
`0fa68d68` (results file, line 9).

The retention table records both losses at should-fix minimum severity (results file, retention table):

| Route | Label | Old at minimum | Old at any severity | New at minimum | New at any severity |
| --- | --- | --- | --- | --- | --- |
| host (Claude) | L-08 | 2/3 | 2/3 | 0/12 | 0/12 |
| command (Codex) | L-10 | 2/3 | 2/3 | 0/12 | 0/12 |
| host (Claude) | L-10 | 1/3 | 1/3 | 3/12 | 3/12 |
| command (Codex) | L-08 | 0/3 | 0/3 | 0/12 | 0/12 |

In both losses the new brief raises the label at no severity at all, rather than raising it below its
minimum. Under the new brief, the Claude reviewer still raises L-10 in 3 of 12 passes. So L-10 is lost on
the Codex route only, and the new brief does not prevent that finding altogether. L-08 has no comparison on
the Codex route, because the old brief never raised it there.

Retention is counted on first passes. A first pass has no earlier spec review, so `review-scope` makes it a
full pass and the new scoped re-review rule does not apply to it.

Between the two briefs, four plugin commits change what a reviewer reads (`git log 0c9fee77..ef685da1` on
the reviewer agent, `scripts/loop` and `references/review-protocol.md`):

- `89b03de8` and `6dd1d24c` compute a spec review's scope once and pass it on both routes. On the Codex
  route, `reviewPrompt` adds one line, `- Scope: full pass (<reason>)`, for a first pass
  (`plugins/vh-adlc/scripts/loop/cli.ts`, `scopeLines`).
- `06ab1add` rates spec findings by consequence for the profiled product.
- `ef685da1` is the fix the owner allowed during the replay. It checks every finding against the
  always-blocking classes and rates an uncertain failure path should-fix instead of nit or dropping it.

The docs side is one commit that changes only `conventions/feature-documents.md`, by 70 lines added and 17
removed. It adds:

- the plausible-choice rule for Open Questions, which replaces the rule that every settled trade-off is an
  open question;
- severity by consequence for the profiled product, including a new should-fix condition and a new nit
  condition;
- the always-blocking classes;
- the stated-limit and `## Deferred` rules;
- scoped re-review.

## Changes that could suppress a should-fix finding

Four changes in the new brief can turn an old should-fix finding into no finding at all. A change that only
lowers a finding to nit cannot explain the losses, because the new passes raise neither label even as a nit.

1. **The undefined-path rule is now conditional.** The old agent file said a path the document leaves
   undefined is a finding. In the new file, that sentence applies only on a revision that does not name the
   product profile: "On a revision that does not, a path the document leaves undefined is a finding." The
   new docs revision names the profile, so a literal reader finds no instruction that an undefined
   concurrency, retry, partial-failure or upgrade path is a finding. The reviewer is left with the
   consequence rating, and it may simply not look for such a path. In the replayed file, the referent of
   "does not" sits four sentences earlier, so a careful literal reader, as Codex tends to be, gets the wrong
   instruction. Since the replay, `57b33e73` on main has moved the always-blocking sentences into the next
   paragraph. The referent is now two sentences earlier, but the rule is still conditional, and no replay
   has run on that wording.
2. **The should-fix test for divergent implementations is narrower.** The old test was that two careful
   implementers would build different things. The new test is that they would build things "whose
   difference a user or operator would notice". An ambiguity whose two readings differ only internally, for
   example in a stored format, an error code or the order of steps, now fits no severity class. It meets
   neither the should-fix test nor any nit condition, so the reviewer may drop it rather than rate it.
3. **The plausible-choice rule removes a class of finding by design.** The old rule made every trade-off the
   document settles an open question, so a reviewer could raise a settled trade-off as a finding. Under the
   new rule, the author records such a choice in Design with a one-line reason, unless the owner could
   plausibly choose otherwise given the profile and the recorded rules. If L-08 or L-10 is this kind of
   finding, its loss is the intended effect of the feature, and the label no longer describes a defect.
4. **The stated-limit and Deferred rules close findings that are already answered.** At X' the enterprise
   document has no stated limits or Deferred entries, so this rule can only matter where a reviewer reads an
   existing Scope exclusion as a stated limit. This is the least likely of the four.

The Codex-only loss of L-10 points at the first change, or at the second, read more literally by Codex than
by Claude. The scope line cannot explain a dropped finding, because it says only that the pass is full.

## Other explanations to rule out

- **The matcher misses a reworded finding.** Labels are assigned by an independent matcher. Under the new
  brief, a finding can be phrased in terms of consequence for the product instead of the defect itself, and
  the matcher may not map it to its label. This is checked by rerunning the matcher on the stored new-brief
  records, which needs no reviewer runs.
- **Chance.** Suppose the brief had no effect and a label's true rate per pass is p. Then the chance of at
  least 2 of 3 old passes and 0 of 12 new passes is at most about 0.009, around p = 0.15. Over the roughly 60
  label-and-route pairs the old brief raised at all, that gives an expected count of at most about 0.5 false
  failures, and a chance of two or more of about 0.1 in the worst case. Chance is unlikely but not
  excluded. This is the combined risk that D-01 defers.
- **The profile at X'.** The enterprise profile in `AGENTS.md` at X' may state a stage or audience under
  which a reviewer reasonably judges the failure implausible. That would make the loss correct for this
  product, not a defect in the brief.

## Reading the stored records

Read on 2026-11-27 from the enterprise case directory (labels approved 2026-11-22T20:27:08Z), with no
reviewer or matcher runs and no writes to the case. The checks searched every stored first-pass record of
each route for the defect each label names, by its wording and by its substance.

**Both labels are failure paths.** L-08 is a failure that the design's set of values leaves without a
mapping. L-10 is a write that a cancelled request can lose after the change has committed. Neither is a
settled trade-off, so hypothesis 3 is ruled out. Neither touches a stated limit or a Deferred entry, so
hypothesis 4 is ruled out too.

**The old brief raised both labels as side points.** In each of the four old passes that raised L-08 on the
host route or L-10 on the Codex route, the label's defect appears as one clause inside a wider finding about
the same design section. No old pass gives either defect a finding of its own. The original review findings
(R-1 F-05 and F-06 in the case) were standalone, but the replayed old brief already treated them as minor.

**L-08 on the host route is a true omission.** The design section L-08 belongs to still draws findings in
every new pass, 12 of 12, often at blocking. Not one of the 12 mentions the unmapped failure, in any words.
A matcher rerun cannot recover a finding that does not exist, so the rerun was not needed. On the Codex
route, the new brief still raises L-08 in 1 of 13 stored passes, where the old raised it in 1 of 3.

**L-10 on the Codex route is mostly absent, and partly absorbed.**

- In 2 of the 13 stored new passes, a blocking finding covers L-10's case: a client that disconnects after
  the commit loses the record. It covers that case as one example of a wider defect, recording that
  happens after the commit at all. The fix that finding proposes would remove L-10 too. The matcher, which
  applies each label's Match line strictly, did not count them, because they do not name the mechanism
  L-10 names.
- In 2 other new passes, findings use L-10's words about context, but they concern another defect: API
  compatibility and lock lifetime. The matcher was right to reject them.
- The remaining 9 passes do not raise the defect.

So under the new brief, the Codex reviewer folded L-10's side point into a larger blocking defect in about
one pass in six, and dropped it otherwise.

**What this means for the hypotheses.** No single rule change explains both losses:

- Hypothesis 1, the conditional undefined-path rule, fits a dropped failure path. It is not confirmed, because
  the new passes still examine the same design sections and raise other failure paths there.
- The pattern the records show is that **the new brief keeps a wider finding's main defect and drops the
  side points the old brief listed inside it.** Rating by consequence leads a reviewer to state one
  consequence per finding. A secondary defect that the old brief named as an aside then has no home, because
  the reviewer neither splits it out nor keeps it as a clause.
- Chance remains possible for both. The old brief raised each label in only 2 of 3 passes, each time as an
  aside, so the old rate behind it is uncertain.

## Next steps

1. If the owner wants the labels back: a one-sentence brief change that tells the reviewer to name each
   distinct defect a finding covers. That means splitting a secondary defect into its own finding, or
   listing it in the same finding, instead of dropping it when the finding is framed around one
   consequence. Check it with 6 Claude first passes on the host route for L-08 and 6 to 12 Codex first
   passes on the command route for L-10. The Codex route can run on the case host, which is Linux, without
   waiting for [#187](https://github.com/michielvha/vh-adlc/issues/187).
2. The cheaper alternative is to accept both as known losses: the old brief raised each only as an aside,
   both stay at should-fix minimum severity, and in 2 of 13 Codex passes L-10's case is covered by a
   blocking finding whose fix removes it.


## Harm and the simplest alternative

The harm: on the enterprise case, one of two replay cases, the new brief stops raising one should-fix side
point on each route. The few developers who use vh-adlc could accept a spec carrying such a secondary
defect while the reviewer reports the main defect of the same section. It is not blocking-severity, and it
does not go away on its own.

The simplest alternative is to record both as known losses and change nothing. The fix, if wanted, is one
sentence of reviewer brief, which is prose, not machinery. This analysis recommends no machinery.

Any wording change alters the review behaviour that other repositories' gates rely on. It is therefore new
scope for its own feature document, not an edit under the completed spec, and it is held behind the open
change to the same file in [#182](https://github.com/michielvha/vh-adlc/pull/182).

## Verdict

Track. The smallest owner decision: keep L-08 and L-10 as known losses, or specify the one-sentence brief
change and spend about 6 Claude and 6 to 12 Codex first passes to check it.
