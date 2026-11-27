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
| 2026-11-27 | R-1 | spec | `f201f8d2` | claude-opus-5-5 | procedural | 1 blocking, 2 should-fix, 4 nit |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design (The replay: the AC-03 bullet "The analysis puts that chance at under 1% per label. Of the 79 label and route pairs the new brief retained, it raised 46 at their minimum in 9 or more of 12 passes"); Acceptance Criteria AC-03; Test Plan AC-02, AC-03 row; Owner summary (pass condition "No label the new brief retained is lost")
EVIDENCE: The analysis does not put this chance anywhere. Its 0.009 figure (docs/internal/analysis/proportional-review-label-losses.md:100-104) is the chance that a label with no brief effect shows 2 of 3 old and 0 of 12 new. That is a different event. The retention table at tests/vh-adlc/evidence/proportional-review/results.md:63-164 has 75 enterprise pass rows, not 79. 46 of them have new at minimum 9/12 or more. The harness fails a label when old at minimum is 2 or more and no new pass raises it at minimum (tests/vh-adlc/replay/run.ts:268-270). It extends the set to 12 passes when any label fails (run.ts:578). Taking the stored new brief's rates as the per-pass rate of a sentence with no effect, P(0 of 12) is about 11% for host L-41 (old 2/3, new 2/12, results.md:155) and about 3.2% for host L-35 (old 2/3, new 3/12, results.md:149). It is about 0.8% for each of command L-15, host L-18 and host L-24, and about 0.16% for each of command L-18, host L-15 and host L-32. Together that is roughly a 16% chance that AC-03 fails for a harmless sentence. Design says such a failure "is not rerun", and a failed replay means the sentence does not ship. The false figure is the stated reason AC-03 uses the harness rule as it stands, so it changes what the proof checks.
PROPOSAL: Correct the count and remove the misattributed chance. Then either limit AC-03 to pairs the replayed new brief raised at minimum often enough that 0 of 12 is unlikely, for example 6 or more of 12, and list the low-rate pairs as reported only, or state the roughly 16% false-failure risk in the Owner summary for the owner to accept.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-04; Test Plan AC-04 row; Owner summary (third pass condition); Design (The replay, the counting of 6 passes and 6 more)
EVIDENCE: AC-04 compares a mean over 6 counted passes, or 12 if a label fails, with a 12-pass baseline, using a fixed margin of one. Blocking findings per pass cannot be counted from public files. As a proxy I counted ":blocking" labels per counted new-brief pass in results.md:18-59. Host: mean 5.83, SD 1.53 over 12 passes. Command: mean 24.67, SD 2.61. If the sentence has no effect, the standard error of the difference is about 0.76 on host and 1.3 on command. A rise of more than 1 then happens by chance about 10% of the time on host and about 22% on command. That is roughly a 30% chance that AC-04 fails a sentence that changes nothing, before any real increase. A sentence that asks for separate findings is also likely to add a few findings, some of them blocking, without undoing what proportional review gained. Two careful implementers would read a near-miss differently, but Design forbids a rerun.
PROPOSAL: Base AC-04 on the measured spread. Either always count 12 passes per route for the mean, or set the margin from the baseline's standard deviation, for example the baseline mean plus two standard errors, and give the SD in the Background table next to the means.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-02; Test Plan AC-02, AC-03 row; Owner summary (first pass condition); frontmatter goal
EVIDENCE: Under the harness rule, L-08 on host and L-10 on command pass once a single counted pass raises them at minimum (run.ts:268-270). The old brief raised each in 2 of 3 passes, and the replayed new brief in 0 of 12 (results.md:74,122). The analysis says chance "remains possible for both" and the old rate behind them is uncertain (analysis:152-153). The new brief already covers L-10's case in 2 of 13 Codex passes, but the matcher does not count it (analysis:132-136). One matched pass in 6 or 12 is also likely with a small residual rate, for example about 46% in 12 passes at a 5% rate. So AC-02 can pass for a sentence that does not restore the labels. The goal says the labels "pass retention again", but nothing checks the rate the old brief showed.
PROPOSAL: Make AC-02 require a rate that tells the sentence apart from noise, for example at minimum in at least 2 of 6, or 3 of 12 after confirmation passes, on each label's route. Alternatively, record in the Owner summary that a single hit counts as restored.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design (The brief under test: "The shipped change is the same sentence on the default branch, where the paragraph around it has since been reworded (`57b33e73`)"); Owner summary ("the result measures the sentence alone")
EVIDENCE: The paragraph that holds the sentence on line 82 ("Return every finding ...") is identical at ef685da1 and at f201f8d2. `57b33e73` rewords the two paragraphs before it. `git log ef685da1..HEAD -- plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md` also lists `ee8e6c82` and `ea11072b`, which change the Rules section's page-cache instruction (lines 31-34 now). The shipped brief also runs under docs pin e79eaa6a, not 0fa68d68. So the shipped combination differs from the tested one in more than the stated rewording, and no replay covers it.
PROPOSAL: Name all three commits and the docs pin difference. Say that the replay measures the sentence on the ef685da1 brief and that the shipped context is not replayed.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Scope (Out of scope: "The owner set the replay budget at about 6 Claude and 6 to 12 Codex passes"); Owner summary ("about 6 Claude passes and 6 Codex passes, plus 6 more of either"); Design (The replay, the 6 plus 6 bullet)
EVIDENCE: The harness extends a route to 12 counted passes when any label fails after 6 (run.ts:578). On host that happens whenever L-08 is still missing after 6 passes, or when L-41 (2/12, P(0 of 6) about 33%) or L-35 misses. So 12 Claude passes is a likely outcome, and Scope gives the owner's budget as about 6. Failed executions add more (run.ts:227, up to three runs per needed pass).
PROPOSAL: State one budget in all three places: up to 12 counted passes per route, plus failed executions.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design (The replay: "its existing rule (`run.ts:48`, `run.ts:258-275`)" and "It refuses a run whose route or model differs from the settings")
EVIDENCE: run.ts:258-275 is the retention rule. The 6 more passes are triggered at run.ts:578. A run that reports another route or model is not refused. It is stored as "not counted" and the set goes on (run.ts:234-236), and the harness stops only when runs reach the limit (run.ts:227-230). results.md:26 shows such a run.
PROPOSAL: Cite run.ts:578 for the extension, and say that a run reporting another route or model is recorded as not counted and replaced, up to the harness limit.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary: "Reading the stored review records showed why ... The new reviewer still writes the wider finding, but frames it around one consequence and drops the clause"); Context (Background, the bullet "The analysis rules out two other explanations")
EVIDENCE: The analysis presents the side-point pattern as what the records show, says no rule change is confirmed, and keeps chance open: "Chance remains possible for both" (docs/internal/analysis/proportional-review-label-losses.md:144-153). For L-10 on Codex it reports 9 of 13 passes that do not raise the defect and 2 that fold it into a blocking finding (analysis:132-142). So "drops the clause" describes only part of the passes. Background lists the two explanations that are ruled out but leaves out chance, which is not.
PROPOSAL: Say the records point to dropped side points as the likely cause, that chance is not excluded, and that the replay tests the cause.

## Sources

- None outside this repository. The case material is cited by label ID and count only.
