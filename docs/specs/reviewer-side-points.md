---
status: draft
status_description: "Being written; not yet reviewed."
issue: https://github.com/michielvha/vh-adlc/issues/172
goal: "A spec reviewer that finds a secondary defect while writing up a wider finding reports it, either inside that finding or as a finding of its own, so the enterprise replay labels L-08 and L-10 pass retention again without more blocking findings per pass."
covers:
  - plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md
  - tests/vh-adlc/evidence/reviewer-side-points/
---

# Plan: Keep a finding's side points in spec review

One sentence in the reviewer brief, telling the reviewer to name every distinct defect a finding covers
instead of dropping the secondary ones, and a replay check that shows it restores the two labels the
proportional review lost.

## Context

### Owner summary

The proportional review feature made spec reviews rate findings by consequence for the product. On the
enterprise replay case, that cost two real should-fix defects: label L-08 on the Claude route and L-10 on
the Codex route. Reading the stored review records showed why. The old reviewer only ever raised these
defects as a clause inside a wider finding. The new reviewer still writes the wider finding, but frames it
around one consequence and drops the clause.

This feature adds one sentence to the reviewer brief: when a finding covers several distinct defects, name
each of them, in the same finding or as separate findings, and drop none. Nothing else in the brief, the
conventions or the binary changes. The plugin's patch version goes up with it.

The check is a replay of first-pass spec reviews on the enterprise case, on the case host. The brief under
test is the replayed new brief plus the sentence and nothing else, so the result measures the sentence
alone. It runs on a copy of the case directory, so the stored results stay untouched. It costs about 6
Claude passes and 6 Codex passes, plus 6 more of either where a label still fails and the harness asks for
confirmation passes. Pass conditions:

- L-08 passes retention on the Claude route and L-10 on the Codex route.
- No label the new brief retained is lost.
- Blocking findings per pass rise by at most one on average on each route, so the change does not undo
  what proportional review gained.

If the replay fails, the sentence does not ship. The owner then keeps both labels as known losses, which is
the alternative this feature has to beat.

Acceptance authorizes the brief edit, the patch-version bump, the replay on the case host and publishing
counts-only results. Merging the PR needs the owner. Nothing has been reviewed or run yet.

### Background

The harm, from the proportional review replay: on the enterprise case, one of two cases, the new brief
raises L-08 in 0 of 12 Claude first passes where the old raised it in 2 of 3, and L-10 in 0 of 12 Codex
first passes where the old raised it in 2 of 3. Both labels have should-fix as their minimum severity
(`tests/vh-adlc/evidence/proportional-review/results.md:74,122`). The owner deferred both as known losses
(`docs/specs/proportional-review.md`, Deferred D-17 and D-18; follow-up recorded in
[#172](https://github.com/michielvha/vh-adlc/issues/172)). A few developers' specs can therefore be accepted
with a secondary defect of this kind while the reviewer reports the main defect of the same section. It
does not go away on its own.

The cause was found by reading the stored first-pass records of the enterprise case in place on the case
host, citing the case only by label ID and count
(`docs/internal/analysis/proportional-review-label-losses.md`, section Reading the stored records):

- In each of the 4 old passes that raised L-08 or L-10, the defect is one clause inside a wider finding on
  the same design section. No old pass gives it a finding of its own.
- The design section behind L-08 draws findings in 12 of 12 new Claude passes, and none of them mentions
  the L-08 defect. The matcher did not miss it; the finding is not there.
- In 2 of 13 stored new Codex passes, a blocking finding covers L-10's case as one example of a wider
  defect. The other passes do not raise it.
- The analysis rules out two other explanations. The plausible-choice rule does not apply, because neither
  label is a settled trade-off. The stated-limit rule does not apply, because the document at X' has none.

The simplest alternative without machinery is to accept both losses and change nothing. One sentence of
brief is prose, not machinery, and it beats that alternative only if the replay shows the labels come back
without more blocking findings. That is why the replay is part of this feature, and why a failed replay
means the sentence does not ship.

The current brief tells the reviewer to return every finding it can establish within the pass's scope
(`plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:82`). It says nothing about defects a finding mentions on
the way to its main point.

Measured on the stored counted first passes of the enterprise case (counts of `SEVERITY:` lines, run on the
case host on 2026-11-27):

| Brief | Route | Counted passes | Blocking per pass, mean | Should-fix per pass, mean |
| --- | --- | --- | --- | --- |
| old | host | 3 | 3.33 | 23.33 |
| old | command | 3 | 16.33 | 16.00 |
| new | host | 12 | 5.67 | 16.25 |
| new | command | 12 | 21.25 | 10.58 |

## Scope

In scope:

- One sentence in `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md`, which the Claude host route and the
  Codex command route both read (`plugins/vh-adlc/scripts/loop/cli.ts`, `reviewPrompt`).
- A patch-version bump of the vh-adlc plugin manifests.
- A first-pass replay of the enterprise case on both routes, run on a copy of the case directory on the
  case host, and a counts-only results file under `tests/vh-adlc/evidence/reviewer-side-points/`.

Out of scope:

- The small-application case. The owner set the replay budget at about 6 Claude and 6 to 12 Codex passes,
  and the small-application case lost no label.
- Full replay loops, and the rounds bar of the proportional review. First passes are where both losses
  were measured. Finishing the enterprise Codex loop stays under D-19.
- Any change to `conventions/feature-documents.md` in `vhco-pro/docs`, to severity rules or to the binary.
- The test files [#170](https://github.com/michielvha/vh-adlc/issues/170) is restructuring, and `review-route.ts` and `scripts/triage/owned-process.ts`, which
  [#187](https://github.com/michielvha/vh-adlc/issues/187) owns. This feature edits none of them.

## Design

**The sentence.** It goes right after the sentence on line 82 of the reviewer brief, which tells the reviewer
to return every finding within the pass's scope:

> When a finding covers more than one distinct defect, name each of them, in that finding or as findings of
> their own, and do not drop a secondary defect because the finding states one main consequence.

It applies under every docs revision, because it changes what the reviewer reports, not how it rates
severity. It does not ask the reviewer to look for more defects than before. It only keeps those it has
already found.

**The brief under test.** The replay compares briefs that differ in this sentence alone. The brief under test
is plugin commit `ef685da1` with the sentence added in the same place, and docs `0fa68d68`. That is the
replayed new brief, at the commit its 12 counted first passes per route used
(`tests/vh-adlc/evidence/proportional-review/results.md:9`). The commit is an experiment, kept on a branch
`exp/reviewer-side-points` that is never merged. The shipped change is the same sentence on the default
branch, where the paragraph around it has since been reworded (`57b33e73`). The tasks will check that both
commits carry the sentence byte for byte.

**The replay.** It uses `tests/vh-adlc/replay/run.ts` unchanged:

- It runs on the case host, in a scratch directory, against a copy of the enterprise case directory. The
  harness moves a set whose identity differs to `runs-superseded` (`tests/vh-adlc/replay/run.ts:289-302`),
  so running on the original would move the stored new-brief sets. The copy keeps `labels.md` and
  `case.yaml` byte for byte, so the approval line still verifies (`run.ts:61-76`).
- It runs with `--only first-passes`, the old brief `0c9fee77` with docs `30c38c8d`, and the experiment
  commit as the new brief with docs `0fa68d68`. It reuses the copied old-brief sets, whose identity
  matches.
- It runs one route at a time, Claude first and then Codex, never both at once.
- The route settings are the case's `routes.json` unchanged. The Codex route runs
  `@openai/codex@0.170.0` through `npm exec` inside `unshare`, with `gpt-6.2-sol` and medium reasoning
  effort, as every earlier Codex replay run did. The Claude route runs `claude-opus-5-5`.
- The harness counts 6 new-brief first passes per route, and 6 more where a label fails, its existing rule
  (`run.ts:48`, `run.ts:258-275`). It refuses a run whose route or model differs from the settings.
- AC-03 uses the harness's retention rule as it stands, so a label can fail by chance. The analysis puts
  that chance at under 1% per label. Of the 79 label and route pairs the new brief retained, it raised 46
  at their minimum in 9 or more of 12 passes (`tests/vh-adlc/evidence/proportional-review/results.md`,
  retention table). A failure under AC-03
  counts as a failure. It is not rerun to get a pass.

The harness's `--results` file goes to scratch first. Before anything is committed, the private-terms check
runs on it (`run.ts terms --case <copy> --file <results>`). Only counts and run identities are copied to
`tests/vh-adlc/evidence/reviewer-side-points/results.md`, with the blocking and should-fix means per route.
The means are counted from the copy's stored records as in the Background table.

**Failure, retry and rollback.** A pass that fails to execute is recorded as failed, and the harness retries
within its limit (`run.ts:226-231`). A run stopped by a usage limit resumes from the copy, because finished
passes are stored as they complete. The original case directory is never written. If the replay misses
AC-02, AC-03 or AC-04, the sentence does not ship: the experiment branch and the copy are deleted, the
feature is reported as not met, and D-17 and D-18 stay known losses. Rolling back after shipping means
reverting one sentence and the version bump.

**Concurrency.** This is a prose change to a file the reviewer reads at dispatch. A review that started
before the upgrade keeps the brief it loaded. No state, schema or boundary changes.

## Acceptance Criteria

- [ ] AC-01: The reviewer brief on the default branch tells the reviewer, under every docs revision, to name
      each distinct defect a finding covers, in that finding or as its own finding, and not to drop a
      secondary one. The plugin's patch version is one higher than before the change.
- [ ] AC-02: On the enterprise case, under the brief under test, L-08 passes retention on the host route and
      L-10 passes retention on the command route.
- [ ] AC-03: No enterprise label that passes retention under the replayed new brief fails retention under the
      brief under test, on either route.
- [ ] AC-04: On each route, the mean number of blocking findings per counted first pass under the brief under
      test is at most one more than the replayed new brief's: 6.67 on the host route and 22.25 on the command
      route.
- [ ] AC-05: `tests/vh-adlc/evidence/reviewer-side-points/results.md` holds the brief identities, every run's
      identity and status, the retention verdicts and the blocking and should-fix means. The private-terms
      check passes on it.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Manual procedure: `git show origin/main:plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md` contains the sentence from Design verbatim, outside any paragraph limited to one docs revision. Both plugin manifests show the patch version one above `0.33.1`, or one above whatever main holds when T2 lands. |
| AC-02, AC-03 | `bun tests/vh-adlc/replay/run.ts run --only first-passes --routes-under-test host` and then `command`, against the case copy, with the arguments in Design. Pass: the results file's retention table shows `pass` for host L-08 and command L-10, and no label `fail` that `tests/vh-adlc/evidence/proportional-review/results.md` shows as `pass` on the same route. |
| AC-04 | Manual procedure on the case host: for each counted first pass in the copy's `runs/new-<route>-pass-*.txt` with a `.verdicts.json` beside it, count lines starting `SEVERITY: blocking`, and take the mean per route. Pass: host at most 6.67, command at most 22.25. |
| AC-05 | `bun tests/vh-adlc/replay/run.ts terms --case <copy> --file tests/vh-adlc/evidence/reviewer-side-points/results.md` prints pass, and the file has the four parts AC-05 names. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- None outside this repository. The case material is cited by label ID and count only.
