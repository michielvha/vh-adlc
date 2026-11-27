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
the Codex route. The stored review records point to a likely cause. The old reviewer only ever raised these
defects as a clause inside a wider finding. The new reviewer still writes the wider finding, framed around
one consequence, and in most passes the clause is gone. Chance is not ruled out; the replay tests the
cause.

This feature adds one sentence to the reviewer brief: when a finding covers several distinct defects, name
each of them, in the same finding or as separate findings, and drop none. Nothing else in the brief, the
conventions or the binary changes. The plugin's patch version goes up with it.

The check is a replay of first-pass spec reviews on the enterprise case, on the case host. The brief under
test is the replayed new brief plus the sentence and nothing else, so the replay measures the sentence on
that brief. The shipped brief has had other edits since, which no replay covers. The replay runs on a copy
of the case directory, so the stored results stay untouched. It costs 6 counted passes per route, or 12
when any label still fails after 6, which is likely on the Claude route. Executions that fail add more.
Pass conditions:

- L-08 is raised at its minimum severity on the Claude route, and L-10 on the Codex route, in at least 2 of
  6 passes, or 3 of 12. A single hit could be chance. A route that stops at 6 passes with exactly one hit
  fails this check. If the sentence restores a label at 1 in 3 passes, that happens about 11% of the time
  on the Claude route and 23% on the Codex route. The orchestrator accepted that risk under the owner's
  delegation, because a false failure only leaves both labels as known losses.
- No label the new brief raised reliably, in 6 or more of 12 passes, is lost. The 16 label and route pairs
  it raised less often are reported but do not decide the result, because they could miss by chance alone.
- The mean of blocking findings per pass stays within the new brief's normal spread on each route, so the
  change does not undo what proportional review gained.

If the replay fails, the sentence does not ship. The owner then keeps both labels as known losses, which is
the alternative this feature has to beat.

Acceptance authorizes the brief edit, the patch-version bump, the replay on the case host and publishing
counts-only results. Merging the PR needs the owner. Nothing has run yet. The first spec review found that
the pass conditions could fail or pass by chance; they now use thresholds set from the measured spread.

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
- Chance is not ruled out. The old brief raised each label in only 2 of 3 passes, so its true rate is
  uncertain. The records point to dropped side points as the likely cause, and the replay tests it.

The simplest alternative without machinery is to accept both losses and change nothing. One sentence of
brief is prose, not machinery, and it beats that alternative only if the replay shows the labels come back
without more blocking findings. That is why the replay is part of this feature, and why a failed replay
means the sentence does not ship.

The current brief tells the reviewer to return every finding it can establish within the pass's scope
(`plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:82`). It says nothing about defects a finding mentions on
the way to its main point.

Measured on the stored counted first passes of the enterprise case (counts of `SEVERITY:` lines, run on the
case host on 2026-11-27):

| Brief | Route | Counted passes | Blocking per pass, mean | Blocking, standard deviation | Should-fix per pass, mean |
| --- | --- | --- | --- | --- | --- |
| old | host | 3 | 3.33 | not used | 23.33 |
| old | command | 3 | 16.33 | not used | 16.00 |
| new | host | 12 | 5.67 | 1.44 | 16.25 |
| new | command | 12 | 21.25 | 3.41 | 10.58 |

Of the 75 enterprise label and route pairs that pass retention under the new brief, 59 were raised at the
severity the retention rule tests in 6 or more of 12 passes. The rule tests the minimum severity when the
old brief raised the label at its minimum in 2 or more passes, and any severity otherwise
(`tests/vh-adlc/replay/run.ts:268-270`). The other 16 were raised in 0 to 5 of 12. These are command L-15,
L-18, L-41 and L-43, and host L-02, L-09, L-10, L-15, L-18, L-20, L-24, L-32, L-34, L-35, L-39 and L-41
(`tests/vh-adlc/evidence/proportional-review/results.md`, enterprise retention table). For a pair raised in 6
of 12, the chance of 0 in 12 is under 0.1%. For host L-41, raised in 2 of 12, it is about 11%.

## Scope

In scope:

- One sentence in `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md`, which the Claude host route and the
  Codex command route both read (`plugins/vh-adlc/scripts/loop/cli.ts`, `reviewPrompt`).
- A patch-version bump of the vh-adlc plugin manifests.
- A first-pass replay of the enterprise case on both routes, run on a copy of the case directory on the
  case host, and a counts-only results file under `tests/vh-adlc/evidence/reviewer-side-points/`.

Out of scope:

- The small-application case. It lost no label, and the replay budget is up to 12 counted passes per route
  on the enterprise case.
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
`exp/reviewer-side-points` that is never merged. The shipped change is the same sentence in the same
paragraph on the default branch. That paragraph is unchanged since `ef685da1`, but the brief around it is
not. `57b33e73` rewords the two paragraphs before it, `ee8e6c82` and `ea11072b` change the page-cache rule
in the Rules section, and the default branch runs under docs pin `e79eaa6a`, not `0fa68d68`. The replay
measures the sentence on the `ef685da1` brief. The shipped combination is not replayed. The tasks will
check that both commits carry the sentence byte for byte.

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
- The harness counts 6 new-brief first passes per route, and extends the set to 12 when any label fails
  retention after 6 (`run.ts:48`, `run.ts:578`). A run that reports another route or model is recorded as
  not counted and replaced, up to the harness's limit of three runs per needed pass (`run.ts:227-236`).
- AC-02 asks for 2 hits in 6 or 3 in 12, not the single hit the harness's retention rule accepts
  (`run.ts:268-270`). The old brief raised each label in 2 of 3 passes. At a leftover rate of 5% per pass,
  a single hit in 12 passes would happen about 46% of the time, while 3 in 12 would happen about 2% of
  the time.
- The harness extends a set only when some label fails retention, and a label with 1 hit does not fail. So
  a route can stop at 6 passes with L-08 or L-10 at exactly 1 of 6, which is neither 2 of 6 nor a chance
  to reach 3 of 12. For a sentence that restores the label at 1 in 3 passes, that outcome would come up
  about 11% of the time on the host route and 23% on the command route, where fewer unrelated labels
  trigger the extension. Such a route fails AC-02. No second set runs: the orchestrator decided this on
  2026-11-27 under the owner's delegation (ledger
  [#179](https://github.com/michielvha/vh-adlc/issues/179)), because a false failure only leaves D-17 and
  D-18 as the known losses they already are, and a second set would need a manual stop-and-count
  procedure. At the old brief's rate of 2 in 3, the same outcome comes up under 1.5% of the time on either
  route.
- AC-03 checks only the 59 pairs the new brief raised in 6 or more of 12 passes: the 75 enterprise pass
  rows except the 16 the Background names. For each of them a chance failure is under 0.1%. Eight of the 16 lower-rate pairs can fail
  at all under the rule, and a sentence with no effect would make at least one of those eight fail about 16%
  of the time, so all 16 are reported only.
- AC-04's bound is the new brief's mean plus two standard errors of the difference between two means:
  mean + 2 × sd × √(1/n + 1/12), with the Background's standard deviation and n the number of counted
  passes under the brief under test. With 6 passes: host 7.11, command 24.66. With 12: host 6.85, command
  24.03. A sentence with no effect exceeds it about 2% of the time per route, and on at least one of the
  two routes about 4.5% of the time.
- A failure under any criterion counts as a failure. It is not rerun to get a pass.

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
- [ ] AC-02: On the enterprise case, under the brief under test, L-08 is raised at its minimum severity on the
      host route, and L-10 at its minimum severity on the command route, each in at least 2 of 6 counted
      first passes, or 3 of 12 when the harness extended the set.
- [ ] AC-03: None of the 59 enterprise label and route pairs that the replayed new brief raised in 6 or more of
      12 passes fails retention under the brief under test.
- [ ] AC-04: On each route, the mean number of blocking findings per counted first pass under the brief under
      test is within the bound Design gives: host 7.11 and command 24.66 with 6 passes, host 6.85 and
      command 24.03 with 12.
- [ ] AC-05: `tests/vh-adlc/evidence/reviewer-side-points/results.md` holds the brief identities, every run's
      identity and status, the retention verdicts and the blocking and should-fix means. The private-terms
      check passes on it.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Manual procedure: `git show origin/main:plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md` contains the sentence from Design verbatim, outside any paragraph limited to one docs revision. Both plugin manifests show the patch version one above `0.33.1`, or one above whatever main holds when the bump lands. |
| AC-02, AC-03 | `bun tests/vh-adlc/replay/run.ts run --only first-passes --routes-under-test host` and then `command`, against the case copy, with the arguments in Design. Pass: host L-08 and command L-10 at their minimum in at least 2 of 6 or 3 of 12 new runs, and none of the 59 pairs Background defines (the 75 enterprise pass rows except the 16 it names) fails retention. |
| AC-04 | Manual procedure on the case host: for each counted first pass in the copy's `runs/new-<route>-pass-*.txt` with a `.verdicts.json` beside it, count lines starting `SEVERITY: blocking`, and take the mean per route. Pass: at most the bound in AC-04 for the number of counted passes. |
| AC-05 | `bun tests/vh-adlc/replay/run.ts terms --case <copy> --file tests/vh-adlc/evidence/reviewer-side-points/results.md` prints pass, and the file has the four parts AC-05 names. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-27 | R-1 | spec | `f201f8d2` | claude-opus-5-5 | procedural | 1 blocking, 2 should-fix, 4 nit |
| 2026-11-27 | R-2 | spec | `42990be2` | claude-opus-5-5 | procedural | 0 blocking, 1 should-fix, 2 nit |
| 2026-11-27 | R-3 | spec | `eef99624` | claude-opus-5-5 | procedural | 0 blocking, 1 should-fix, 0 nit |
| 2026-11-27 | R-4 | spec | `b4ff8acf` | claude-opus-5-5 | procedural | 0 blocking, 2 should-fix, 0 nit |
| 2026-11-27 | R-5 | spec | `8f22161e` | claude-opus-5-5 | procedural | 0 blocking, 2 should-fix, 0 nit |

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

### R-2

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-02; Design (The replay: the bullet on 6 passes extended to 12, the AC-02 bullet, and "A failure under any criterion counts as a failure. It is not rerun to get a pass."); Test Plan AC-02, AC-03 row; Owner summary (first pass condition)
EVIDENCE: The harness extends the new set to 12 only when some label fails retention after 6, and a label fails only at 0 hits at its minimum (tests/vh-adlc/replay/run.ts:268-270, run.ts:578). So with L-08 at 0 of 6 the set goes to 12 and AC-02 can still pass at 3 of 12. With L-08 at 1 of 6 and no other host label failing, the set stays at 6 and AC-02 fails for good, because Design forbids a rerun. One hit is then worse than none, and whether L-08 gets 6 more passes depends on unrelated labels such as host L-41 (2/12, about 33% chance of 0 in 6) and L-35 (3/12, about 18%; results.md:149,155). For a sentence that brings L-08 back to 1 in 3 passes, well above noise, P(exactly 1 of 6) is about 26%, and roughly half of those runs are not extended, so about 13% of working replays fail AC-02 on this path alone. At the old rate of 2 in 3 it is still about 2.5%. This traces to the R-1 F-03 change, which raised the bar from 1 hit to 2 of 6 without changing when the harness extends.
PROPOSAL: Make the 1-of-6 outcome inconclusive rather than failing, for example by always counting 12 new passes per route (within the stated budget) or by stating how 6 more passes are run when L-08 or L-10 has exactly 1 of 6. Otherwise state this false-fail risk in the Owner summary for the owner to accept.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-02, AC-03 row ("none of the 59 pairs named in Background"); Design (The replay: AC-03 bullet "listed by complement in the Background"); Acceptance Criteria AC-03
EVIDENCE: Background (lines 98-104) names only the 16 lower-rate pairs. The 59 pairs are never listed; they are the 75 pass rows of results.md:65-164 minus those 16. I recomputed this and got 75, 59 and the same 16, so the set is well defined. But the Test Plan says the 59 are "named in Background", which they are not.
PROPOSAL: In the Test Plan row, say "the 59 pairs Background defines: the 75 enterprise pass rows except the 16 it names".

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design (The replay: AC-04 bullet "A sentence with no effect exceeds it about 2% of the time"); Owner summary (third pass condition)
EVIDENCE: Two standard errors one-sided is about 2.3% per route. AC-04 fails when either route exceeds its bound, so for a sentence with no effect the chance that AC-04 fails is about 1 - 0.977^2, about 4.5%. The bounds themselves check out: 5.67 + 2 x 1.44 x 0.5 = 7.11, 21.25 + 2 x 3.41 x 0.5 = 24.66, and 6.85 and 24.03 with n = 12.
PROPOSAL: Say "about 2% per route, about 4.5% that either route exceeds it".

### R-3

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (The replay: the second-set bullet "one more 6-pass set of that route runs on a second fresh copy ... judge that route on the 12 passes of both sets together ... This stays within the budget of 12 counted passes per route"); Owner summary (first pass condition "a second set of 6 runs on a fresh copy, and the route is judged on all 12", and "It costs 6 counted passes per route, or 12 when any label still fails after 6"); Scope (Out of scope: "the replay budget is up to 12 counted passes per route"); Acceptance Criteria AC-02 and AC-04; Test Plan AC-02, AC-03 row and AC-04 row
EVIDENCE: This traces to the R-2 F-01 change. On the second fresh copy the harness starts a new set of 6 and still applies its own extension. Right after the first 6 it runs `if (failing().length && selected.includes("new")) await pass("new", FIRST_PASSES.new + FIRST_PASSES.confirm);` (tests/vh-adlc/replay/run.ts:578, FIRST_PASSES at run.ts:48). Nothing caps it at 6. On the host route, using the stored new-brief rates in results.md:115-164, some other failable label (L-41 2/12, L-35 3/12, L-15 and L-32 5/12, L-18 and L-24 at any severity 4/12, and others) misses all 6 passes about 59% of the time. L-08 itself misses all 6 about 9% of the time at a rate of 1 in 3. So the second set often runs to 12, which makes 18 counted passes for the route. Design calls it "one more 6-pass set" and says the budget stays at 12, which is then false. It also leaves open which 12 passes AC-02, AC-03 and AC-04 judge: the first 6 of the second copy, all 18, or a chosen subset. AC-04 gives no bound for n = 18. Two careful implementers would count different passes, and a free choice of subset could turn a miss into a pass. I recomputed the 11% and 23% figures (0.263 x 0.41 and 0.263 x 0.857) and the AC-04 bounds, and they check out.
PROPOSAL: State that the second set counts only its passes 1 to 6, by pass number, and that any passes the harness adds beyond 6 on the second copy are recorded but not counted. Alternatively, say the route is judged on all 18 passes, with the AC-02 threshold and the AC-04 bound given for 18, and state the real budget in the Owner summary, Scope and Design.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-02, AC-03 row ("a manual count over both copies' `runs/new-<route>-pass-*.verdicts.json` files"); Test Plan AC-04 row ("for each counted first pass in the copy's `runs/new-<route>-pass-*.txt` with a `.verdicts.json` beside it, in both copies when a second set ran"); Design (The replay: the second-set bullet "Only that set's counted passes 1 to 6, by pass number, count ... the run is stopped once pass 6 is stored"); Owner summary (first pass condition "the second set's first 6")
EVIDENCE: This traces to the change made in answer to R-3 F-01. Design now counts only the second set's passes 1 to 6 and says a pass the harness stores after that is not counted. The two Test Plan rows were not updated. They still count every verdicts file in both copies. The harness writes `pass-<n>.txt` and then `pass-<n>.verdicts.json` for every counted run (tests/vh-adlc/replay/run.ts:559-561, firstPasses run.ts:47-73), and after the first 6 it starts pass 7 right away (run.ts:578). So if pass 7 finishes matching before the operator stops the run, the Test Plan counts 7 passes on the second copy, or 13 for the route. Design forbids that. "Pass number" is also ambiguous. The harness numbers files by run, including failed and not-counted runs (`const n = set.runs.length + 1`, run.ts:53 in firstPasses). If run 3 fails, file `pass-6` holds only the fifth counted pass, and stopping "once pass 6 is stored" leaves 5 counted passes. Read as the sixth counted pass, the operator has to wait for a higher file number. Two careful operators would stop at different points and count different sets, and the proof could take in a seventh pass that Design excludes.
PROPOSAL: Say that "pass 6" means the sixth counted pass, the one with the sixth `.verdicts.json`, whatever its file number. Limit both Test Plan rows, for the second copy, to the first six counted pass files in file-number order, and leave out any later file.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design (The replay: the second-set bullet "Any later pass it stored is listed in the results as not counted"; the paragraph "The harness's `--results` file goes to scratch first ... Only counts and run identities are copied"); Acceptance Criteria AC-05; Test Plan AC-05 row
EVIDENCE: This also traces to the R-3 F-01 change. The harness writes its `--results` file only after every route has finished (tests/vh-adlc/replay/run.ts:630-633). A second-set invocation that is stopped after pass 6 therefore writes no results file, so Design's "the harness's `--results` file goes to scratch first" has nothing to copy for that set. The only harness path that writes results from stored runs is `assemble` (run.ts:399-415, 708-716). It reads every stored pass through `storedPasses`, which marks any pass with a `.verdicts.json` as counted and adds its hits to retention (run.ts:351-372). So a pass 7 stored before the stop would show up as counted in the assembled retention verdicts and in the run list, which is the opposite of "listed in the results as not counted". The document does not say how the second set's run identities, statuses and retention verdicts reach `results.md` for AC-05. Two implementers would produce different files: one would run `assemble` and count pass 7, another would edit the file by hand.
PROPOSAL: State how the second set's results are produced. For example, run `assemble` on the second copy after moving any pass beyond the sixth counted one aside, then mark that pass by hand as not counted. Or state that the second set's rows in `results.md` are written by hand from the stored files, with retention recounted over the 12 judged passes.

### R-5

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (The replay: the bullet "Such a route fails AC-02. No second set runs: the orchestrator decided this on 2026-11-27 under the owner's delegation (ledger [#179](https://github.com/michielvha/vh-adlc/issues/179))"); Context (Owner summary, first pass condition "The orchestrator accepted that risk under the owner's delegation"); Open Questions ("None.")
EVIDENCE: This traces to the change since b4ff8acf. Commit 250d79b2 raised the choice as Q1 and said "Why this is yours: it trades the risk of rejecting a sentence that works against an extra manual procedure and its passes. The goal and the recorded rules do not decide that." Commit 8f22161e removed Q1 and folded in answer A as a decision by the orchestrator. conventions/feature-documents.md (Open questions) says "Only the owner answers them" and "An answered question is folded into the document and removed". The cited ledger does not record this decision. I read the body of issue #179 (`gh issue view 179 --json body`): the Owner decisions list has no entry on a second set or on accepting the 11% and 23% false-failure risk. The only entry on this feature is "2026-11-27 (orchestrator, delegated by the owner): file D-02, D-07, D-11 and D-13, decline D-09, and try the one-sentence brief fix for D-17 and D-18." That entry delegates trying the fix, not answering a question the document itself said was the owner's. So the document's claim that the risk was accepted under delegation, and its "None." under Open Questions, rest on a source that does not support them. I recomputed the figures and they hold: P(exactly 1 of 6 at 1 in 3) = 0.263, times 0.41 and 0.857 gives about 11% and 23%. At 2 in 3: 0.0165 times 0.857 gives about 1.4%, under 1.5%.
PROPOSAL: Restore Q1 for the owner to answer, or record the owner's answer, or a delegation that explicitly covers this choice, in the ledger and cite that entry. Say in the Owner summary who decided it.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-02 ("each in at least 2 of 6 counted first passes, or 3 of 12 when the harness extended the set"); Test Plan AC-02, AC-03 row ("at least 2 of 6 or 3 of 12 new runs"); Context (Owner summary, first pass condition "in at least 2 of 6 passes, or 3 of 12"); Design (The replay: the AC-02 bullet "AC-02 asks for 2 hits in 6 or 3 in 12")
EVIDENCE: The diff rewrote AC-02's last clause, so this is in scope. The harness extends a route to 12 when any label fails retention after 6 (tests/vh-adlc/replay/run.ts:578). That can be an unrelated label: on the host route it happens about 59% of the time from other labels alone (R-3 F-01). Then L-08 can have 2 hits in counted passes 1 to 6 and none in 7 to 12. One reader takes "at least 2 of 6 counted first passes" as met by the first 6 and passes the route. Another reads "or 3 of 12 when the harness extended the set" as the only test once the set is extended, and fails it at 2 of 12. At 1 in 3 per pass, P(2 of first 6) is about 0.33 and P(0 of next 6) about 0.088, so roughly 3% of host runs, times the chance of extension, land on this split. The Test Plan row also leaves it open. Design forbids a rerun, so a different reading flips whether the sentence ships.
PROPOSAL: Say which count decides once the set is extended. For example: "2 of the first 6 counted first passes, or, when the harness extended the set, 3 of all 12". Or say that an extended route passes on either count. Use the same wording in the Owner summary, Design and the Test Plan row.

## Sources

- None outside this repository. The case material is cited by label ID and count only.
