---
issue: https://github.com/michielvha/vh-adlc/issues/172
---

# Analysis: why the proportional review brief lost enterprise labels L-08 and L-10

Draft, measured on 2026-11-27 against `cb1b8174` (origin/main). This covers Deferred entries D-17 and D-18
of [the proportional review spec](../../specs/proportional-review.md), tracked in
[#172](https://github.com/michielvha/vh-adlc/issues/172).

This draft compares the two briefs only. The private case material is out of reach: the approved label
text, the stored first-pass records and the matcher verdicts are all in the enterprise case directory on the
homelab host, which did not answer on 2026-11-27. The hypotheses below therefore name which kind of finding
each change would suppress. They cannot yet say which kind L-08 and L-10 are. The conclusions come from
primary sources read in this run: the Git history of this repository, the
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

## Next measurements, once the case material is back

None of these need Codex.

1. Read the approved text of L-08 and L-10 and sort each into failure path, internal ambiguity, settled
   trade-off or other.
2. Read the old passes that raised each label and the new passes of the same route. Check whether a new pass
   names the same defect under other words, which would point to a matcher miss.
3. Rerun the matcher on the stored new-brief records for both labels.
4. Only after the first three, check one candidate wording change on the host route for L-08, with about 6
   Claude first passes. For L-10, check on the Codex route with 6 to 12 Codex first passes, once Codex
   command-route reviews run on macOS ([#187](https://github.com/michielvha/vh-adlc/issues/187)) or the
   homelab is back.

## Harm and the simplest alternative

The harm: on the enterprise case, one of two replay cases, the new brief misses one real should-fix defect
on each route. The few developers who use vh-adlc could accept a spec carrying that kind of defect. It is
not blocking-severity, and it does not go away on its own.

The simplest alternative is a wording change in the reviewer brief. If the first hypothesis holds, the brief
would state the undefined-path rule unconditionally and let the consequence rating decide only its severity.
If the second holds, the brief would give an internal-only divergence a home, at should-fix or as an
explicit nit. A wording change is prose, not machinery, and this analysis recommends no machinery. If the
third hypothesis holds, the alternative is no change: the owner retires the label as describing a finding
the feature removes on purpose.

Any wording change alters the review behaviour that other repositories' gates rely on, so it is new scope
for its own feature document, not an edit under the completed spec.

## Verdict

Track. Owner decisions: none yet. This waits on the enterprise case material, to tell the hypotheses
apart. A wording fix becomes "act now" once one hypothesis is confirmed on the stored records.
