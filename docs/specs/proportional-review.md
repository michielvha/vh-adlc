---
status: draft
status_description: "Drafted with the owner's answers folded in; waiting for the first independent spec review."
issue: null
goal: "Spec review weighs every finding against the product the project describes, so a document reaches a clean pass in far fewer rounds with fewer owner questions, while every real defect the current review raises is still raised."
covers:
  - plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md
  - plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/knowledge.md
  - AGENTS.md
  - docs/user-guides/workflows.md
  - docs/get-started/first-feature.md
  - tests/vh-adlc/replay/
  - tests/vh-adlc/evidence/proportional-review/
  - tests/vh-adlc/review-convergence.test.ts
  - tests/vh-adlc/direct-operation-compatibility.test.ts
---

# Plan: Proportional review

Spec review rates findings by what they would do to the product the project says it is, accepts a
stated limit as an answer, and re-reviews only what changed. A replay of real documents proves that no
real defect is lost.

## Context

### Owner summary

Spec reviews take too many rounds and send the owner too many questions. In this repository alone the
stored reviews hold 2,673 findings, and their proposals ask the author to add something more than six
times as often as to cut. Each revision adds mechanisms that the next full pass then attacks. Review
depth is the same for a multi-tenant platform and a small personal application.

This feature changes the rules at their source, in the shared convention and in the reviewer and spec
instructions:

- Each project states once, in a `## Product profile` section of its `AGENTS.md`, what it is and what is
  at stake. The reviewer weighs failure paths against it.
- Blocking and should-fix need a concrete failure a user, tenant or operator of that product would
  plausibly hit, or a criterion that cannot be met. Security, data-loss and tenant-isolation defects stay
  blocking on every product. An undefined path below that bar is a nit.
- The author may answer a finding with a stated limit in Scope, and later passes do not raise it again,
  except for those three always-blocking classes.
- After the first full pass, a re-review covers what changed since the previous pass and what it touches;
  outside that it reports only blocking findings.
- An Open Question is raised only where the owner could plausibly choose differently. The author settles
  the rest and records the choice in Design. Options offered are complete designs only.
- A long list meant for the owner, such as unapplied nits, is triaged first; the owner sees only what the
  author could not settle.

It builds on the harm statement and convergence trigger in
[PR #152](https://github.com/michielvha/vh-adlc/pull/152) (issue
[#148](https://github.com/michielvha/vh-adlc/issues/148)) and on cutting author-added extras
([#141](https://github.com/michielvha/vh-adlc/issues/141)); both land first and are not redone here. The
load-only capacity exemption for read-only reviews stays with
[#150](https://github.com/michielvha/vh-adlc/issues/150). This is the first step of the improvement loop
tracked in [#52](https://github.com/michielvha/vh-adlc/issues/52).

Product quality is a hard constraint. The proof is a replay: one enterprise document and one small
application document, each at its first spec-review commit, reviewed with the old and new rules. The new
rules pass only if every hand-labelled real defect is raised in every run, and only then are rounds and
questions compared: the new rules must reach a clean pass in at most half the original reviews, with
fewer owner questions. Each case runs three times per brief on both the Codex command route and the Claude
host route. The owner approves each case's defect labels once, before any run. The second user's case is
copied to the owner's host with their consent. Case material stays private; only counts are published.
All of this is planned; no check has run.

The owner answered the four open questions on 2026-11-22, each at its recommendation. No review has run.
Acceptance would authorize the
plugin edits, the replay harness and a companion convention change in `vhco-pro/docs`, on a feature
branch; shipping and the pin bump still need the usual approvals.

### Background

Measured on `main` at `915441e8` with the conventions at `vhco-pro/docs` `0c983f67`, the pin in
`AGENTS.md:3`.

- Stored findings: `git grep -hE '^SEVERITY: ' -- docs/specs | sort | uniq -c` gives 204 blocking, 1,443
  should-fix and 1,023 nit, of 2,673 `FINDING:` records; `KIND:` gives 1,434 factual and 1,234 judgement.
- Proposal direction: of 2,670 `PROPOSAL:` lines, 1,864 match an adding verb (add, require, prove, test,
  verify, record, specify, define) and 284 a cutting verb (remove, drop, cut, narrow, delete, withdraw,
  weaken, simplify). A line can match both.
- Rounds: counting spec rows in the Review Log (`grep -cE '^\| [0-9-]+ \| R-[0-9]+ \| spec \|'`) gives
  142 for `docs/specs/shared-docs-drift.md`, 48 for `blog-visual-reading.md`, 44 for `paseo-hosts.md`, and
  24 reviews for `spec-review-convergence.md`, the change that added the nit rule and was merged in
  [#93](https://github.com/michielvha/vh-adlc/pull/93) on 2026-11-14.

The text that produces this:

1. "Every trade-off the document settles is an open question, including one the author would answer the
   same way the owner would" (`conventions/feature-documents.md:165-166` at `0c983f67`).
2. "Turn judgement findings into Open Questions for the owner first"
   (`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:112`), and author mode puts every judgement call into
   Open Questions (`:81`).
3. "should-fix: two careful implementers would build different things"
   (`conventions/feature-documents.md:209`). Any undefined edge case meets it.
4. "A path the document leaves undefined is a finding" (`plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:49`),
   with nothing that weighs likelihood, harm or the project's stage.
5. Every pass reviews the whole document (`vh-adlc-reviewer.agent.md:37-56`), so mechanisms a revision
   adds become new surface. The stopping rule that would end this, `docs/specs/spec-review-stopping-rule.md`,
   is `parked` (its frontmatter, line 2).
6. A finding can be met by adding text or asking the owner; nothing names a stated limit as an answer.

Wording tests do not show that a rule changes behavior: `tests/vh-adlc/review-convergence.test.ts:45`
asserts the should-fix sentence is present. The scenario harness can run the real reviewer on a seeded
document and check what it raises (`S16.oldpin-reviewer`, `tests/vh-adlc/scenarios/run.ts:1275-1300`); the
replay below reuses that pattern on real documents.

The owner set the constraints in this request: fix over-reach in the instructions rather than by filtering
findings, keep product quality, prove it by replaying real documents (one enterprise, one small
application), and cite only public evidence because the investigation behind it summarizes private
sessions.

**Harm and simplest alternative.** The harm: every vh-adlc user pays for each spec in owner attention and
elapsed time, on every feature, and it does not heal; rounds above 20 are common in the counts above. The
simplest alternative without machinery is a process rule alone ("prefer removing", "revisit the previous
change"), which `spec-review-convergence` already added (`SKILL.md:114-117`) without bringing rounds down
in the counts above. This feature is mostly rule text too; the only machinery is the replay harness, which
exists because a wording test cannot show the rules keep quality.

## Scope

In scope:

- The shared convention (`vhco-pro/docs`, one PR): consequence-based severity with the always-blocking
  classes, the stated limit, the plausible-choice rule for Open Questions with complete-design options,
  and owner-facing list triage in the nit paragraph.
- The reviewer agent: reading the product profile, weighing failure paths, honouring stated limits, and
  scoped re-review.
- The spec skill: author mode and review mode step 4 under the new rules, gated on the resolved convention
  stating them.
- `references/loop.md`: the product profile and the owner-facing list triage, stated once.
- vh-adlc's own `## Product profile` in `AGENTS.md`, and the docs pin bump in `AGENTS.md` and
  `plugins/vh-adlc/knowledge.md` to the companion revision.
- The user guides (`docs/user-guides/workflows.md`, `docs/get-started/first-feature.md`) and the tests
  that pin the changed text.
- A replay harness under `tests/vh-adlc/replay/`, and the two replay cases run through it, with published
  counts under `tests/vh-adlc/evidence/proportional-review/`.

Out of scope, by name:

- The harm statement, proportionality findings and convergence trigger
  ([PR #152](https://github.com/michielvha/vh-adlc/pull/152)), and cutting author-added extras without a
  question ([#141](https://github.com/michielvha/vh-adlc/issues/141)). They are prerequisites and land
  first.
- Read-only reviews skipping the load limit ([#150](https://github.com/michielvha/vh-adlc/issues/150)).
- The other promoted owner rules (approval needs an explicit pick, hook failures from others, quiet
  security fixes, ambiguous shared-routing instructions, money cost, standing authorities as loop
  settings) and the worktree removal rule in `conventions/delivery.md:26`: a second, smaller change.
- The general improvement loop and the session retrospective (`docs/specs/session-retrospective.md`),
  tracked in [#52](https://github.com/michielvha/vh-adlc/issues/52).
- The parked stopping rule, the binary and the rules block. Severity names and record formats do not
  change.
- Product profiles for consumer repositories; each adopter adds its own.
- Calibrating the reviewer's precision over time.

## Design

### Product profile

A repository states its product in a `## Product profile` section of its root `AGENTS.md`: what the
product is, who uses it, its stage, and what is at stake (tenants, user data, money, credentials). A few
lines are enough. `references/loop.md` describes it once, and the convention's Review log section names it
as the context severity is judged in.

The reviewer reads the section from `AGENTS.md` at the reviewed commit, which both routes already have:
the host reviewer reads the repository, and the command route reviews a read-only export of X
(`references/review-protocol.md`, Routes). No dispatch field changes. Without a profile, the reviewer
judges as for production software with users whose data matters, which is today's depth with severity by
consequence.

vh-adlc's profile: an open-source agent workflow plugin and Go binary, used by a few developers on their
own machines and repositories, alpha on 0.x; at stake are the user's repositories, branches and
credentials, and the correctness of gates other projects rely on.

### Severity by consequence

The convention's definitions change as follows; record formats and names stay.

- blocking: unchanged for false facts that change the build or a proof, an unmeetable criterion, and a
  proof that fails a correct implementation or cannot run. Added: a concrete failure that a user, tenant
  or operator of the profiled product would plausibly hit with serious harm. A security, data-loss or
  tenant-isolation defect is blocking on every product, whatever the profile says.
- should-fix: a concrete failure the profiled product's users would plausibly hit with limited harm; two
  implementers building things whose difference a user or operator would notice; or a proof that could
  pass on a wrong implementation. The free-text widening exception stays.
- nit: as today, plus an undefined path that nobody using the profiled product would plausibly hit.

The reviewer's failure-mode paragraph (`vh-adlc-reviewer.agent.md:47-50`) keeps asking the same four
questions and rates each gap by this scale rather than treating every gap as a finding. The harm-statement
findings from PR #152 keep their severity.

### Stated limit

The author may answer a finding by adding one line under Scope, `Not handled: <the case>, <why>.`, naming
the finding (`R-<n> F-<nn>`). That is a baseline change, so it is reviewed like any other. A later pass does
not raise the substance of a stated limit again, unless the limit leaves a security, data-loss or
tenant-isolation defect, makes a criterion unmeetable, or leaves the stated problem unsolved; then it is
blocking and its `EVIDENCE` quotes the limit.

### Scoped re-review

The first spec review of a document is full. A later pass reviews the diff of the document between the
previous spec review's commit and X (`git diff <previous>..<X> -- <document>`), plus every section that
states a rule, ID or term the diff changes. Outside that scope the reviewer reports only blocking findings.
The previous commit is the latest spec row in the Review Log at X that is not an acceptance row; the
reviewer reads it itself. When it is missing or unreachable, the pass is full. A drift re-review keeps its
existing limit (`SKILL.md`, Drift re-reviews).

### Open Questions and owner lists

The convention's Open questions section replaces the "every trade-off" sentence: a question is raised only
where the owner could plausibly choose differently, because the options differ in something the goal, the
product profile and the owner's recorded rules do not decide, such as scope, a public contract, security
posture, permissions or cost to users. The author settles every other choice and records it in Design with
a one-line reason. Each option offered meets the goal in full; a stopgap, a cheaper-now partial option or
a lock to one dependency version is not offered.

The spec skill follows: author mode raises a judgement call only under that rule, and review mode step 4
resolves a judgement finding within the profile, raising a question only under the same rule. Both apply
when the resolved convention states the rule, the way the nit rule is gated today (`SKILL.md:120-135`); on
an older pin the current behavior stays.

`references/loop.md` states owner-list triage once: a list meant for the owner (findings, unapplied nits,
review items) is first sorted by the agent under the owner's recorded rules, and the owner-facing summary
shows only the items it could not settle, with a count of the rest and where the full list is. The full
nit list stays in the report, as the nit rule requires.

### Replay harness

`tests/vh-adlc/replay/run.ts` takes a case directory outside the repository:

- `case.yaml`: the local clone path, the commit X of the document's first spec review, the document path,
  the profile text, the route list and the original count of spec reviews and owner questions;
- `labels.md`: the real defects present at X, each as `L-<nn>` with one line, the original finding it
  came from, and how a reviewer's finding is matched to it (a must-match description, with one example
  finding that matches and one that does not). The author proposes the list and the owner approves it
  once per case; the file ends with the owner's approval line and its date, and the harness refuses a
  case without it.

For each brief, old (the plugin on `main` before this branch, at docs `0c983f67`) and new (this branch, at
the companion docs revision), the harness makes a throwaway clone at X, adds the profile to `AGENTS.md` in
one scratch commit X', sets the brief's docs pin, and runs a first-pass spec review there three times on each route, the Codex command route
(`references/loop-settings.md`, `route: command`) and the Claude host route, through the scenario harness's session runner (`tests/vh-adlc/scenarios/run.ts`). It then runs the
new brief's full loop from X' until a clean pass, with a scripted owner that adopts each question's
recommendation, and counts passes and questions. A run that fails to execute is recorded as failed and
rerun; it never counts as a pass. Matching a finding to a label is done by an independent agent reading
`labels.md` and the stored records, and its verdicts are stored beside the run.

Private material (case files, labels, records, transcripts) stays in the case directory, a private
directory on the owner's host outside every public repository. The second user's document and repository
at X are copied there with their consent, so both cases run and are verified on one host and stay in the
replay set for later changes. The harness
writes only counts to `tests/vh-adlc/evidence/proportional-review/results.md`: per case and brief, runs,
labels raised per run by ID, rounds to clean, questions raised and execution failures. Cases are named
"enterprise" and "small application", with no repository or product names.

The cases:

- Enterprise: from the owner's private multi-tenant platform repository, the feature document with the
  most labelled real defects among those whose original review ran 19 or more spec rounds.
- Small application: the second user's feature document with the most spec rounds.

Labels are written and frozen before the new brief is edited, so the brief cannot be fitted to them, and
the plugin diff names nothing from either case (a test greps for the cases' terms).

### Failure, retry and rollback

The rules change no state at run time. A review interrupted mid-pass stores nothing, as today. Documents
reviewed under the new rules keep valid records under the old ones, because names and formats do not
change. Rollback is reverting the plugin release and the pin bump; repositories on `0c983f67` keep today's
behavior throughout because the skill rules are gated on the resolved convention. The convention PR merges
before the pin bump; until a repository moves its pin, nothing changes for it.

### Tests that change

`tests/vh-adlc/review-convergence.test.ts` (it pins the old should-fix sentence) and the spec baseline in
`tests/vh-adlc/direct-operation-compatibility.test.ts` move to the new text. `S16.oldpin-reviewer` stays: a
concurrent write to a shared file by parallel CI runs is a plausible failure, so the reviewer must still
raise it.

## Acceptance Criteria

- [ ] AC-01: The convention at the companion `vhco-pro/docs` revision defines blocking, should-fix and nit
      by consequence for the profiled product as Design states, with security, data-loss and
      tenant-isolation defects blocking on every product.
- [ ] AC-02: That convention raises an Open Question only where the owner could plausibly choose
      differently, has the author record every other choice in Design, and offers only options that meet
      the goal in full.
- [ ] AC-03: That convention and the reviewer accept a `Not handled:` line in Scope as an answer to a
      finding, and the reviewer raises its substance again only for the always-blocking classes, an
      unmeetable criterion or an unsolved problem.
- [ ] AC-04: The reviewer reads `## Product profile` from `AGENTS.md` at the reviewed commit, rates failure
      paths by it, and without one judges as for production software with users.
- [ ] AC-05: After the first spec review, a pass reviews only the document diff since the previous spec
      review and the sections it touches, reports only blocking findings outside that, and is full when no
      previous review commit is reachable.
- [ ] AC-06: The spec skill raises judgement calls and judgement findings as Open Questions only under the
      plausible-choice rule when the resolved convention states it, and keeps today's behavior on an older
      pin.
- [ ] AC-07: An owner-facing summary shows only the list items the agent could not settle under the owner's
      recorded rules, with a count of the rest and where the full list is.
- [ ] AC-08: vh-adlc's `AGENTS.md` has a product profile and pins the companion revision, and the two user
      guides describe the profile, severity by consequence, stated limits and scoped re-review.
- [ ] AC-09: The replay harness runs a case end to end, refuses a case whose labels lack the owner's
      approval line, writes counts only to the results file, records failed executions without counting
      them as passes, and runs on a public fixture case in the test suite.
- [ ] AC-10: On the enterprise case, with labels the owner approved before any new-brief run, every
      labelled real defect is raised in every new-brief first-pass run on both routes.
- [ ] AC-11: On the small application case, with labels the owner approved before any new-brief run,
      every labelled real defect is raised in every new-brief first-pass run on both routes.
- [ ] AC-12: On both cases, the new-brief loop reaches a clean pass in at most half the original number of
      spec reviews, with fewer owner questions than the original, and its clean document resolves every
      label without a stated limit on an always-blocking defect.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-02, AC-03 | Manual procedure: read the convention at the companion revision and confirm each Design rule, then run `bun test tests/vh-adlc/review-convergence.test.ts`, updated to pin the new definitions, the plausible-choice sentence and the stated-limit line. |
| AC-04 | Scenario `S17.profile`: the same seeded document (a single-user CLI that writes a local file without a lock) reviewed twice, with a profile saying single user on one machine and with a multi-tenant service profile. Pass: the lock gap is nit or absent with the first and should-fix or blocking with the second. A third run without a profile rates it should-fix or blocking. |
| AC-03 | Scenario `S17.limit`: a document whose Scope says `Not handled: concurrent writers to names.log, single-user tool.` Pass: no finding names `names.log` concurrency. Control: the same line on an unauthenticated delete path still yields a blocking finding quoting it. |
| AC-05 | Scenario `S17.scoped`: a reviewed document gets one changed Design paragraph and keeps a seeded should-fix gap in an unchanged section. Pass: findings name only the changed paragraph or sections that state its terms, and none names the unchanged gap. Control: an unchanged seeded security defect is still raised as blocking. Second case: the previous review commit is unreachable and the gap is raised. |
| AC-06 | Scenario `S17.questions`: a review returns one judgement finding the profile settles and one about a public contract. Pass at the companion pin: one Open Question, about the contract, and Design records the other choice. On the `0c983f67` pin: two Open Questions. |
| AC-07 | Scenario `S17.nits`: a pass with eight nits, six of which the author settles under the nit rule. Pass: the final reply shows two nits, a count of six and where they are listed, and the report lists all eight. |
| AC-08 | `bun test tests/vh-adlc/proportional-review.test.ts`: `AGENTS.md` has the section and the companion pin, `knowledge.md` names the same SHA, and both guides mention each of the four terms; plus a manual read of the guides against Design. |
| AC-09 | `bun test tests/vh-adlc/replay/run.test.ts` on a fixture case built from the scenario fixture with one seeded defect and a scripted reviewer: the results file holds counts and label IDs and no line of the fixture document, a forced execution failure is recorded and not counted, a copy of the case without the approval line is refused before any run, and the grep for case terms fails on a planted term. |
| AC-10 | Replay of the enterprise case with three runs per brief on each of the two routes. Pass: `labels.md` carries the owner's approval line dated before the first new-brief run, and the independent matcher marks every label raised in each of the six new-brief runs; the results file shows it. |
| AC-11 | Replay of the small application case, same procedure and pass condition. |
| AC-12 | The same replays' full new-brief loops. Pass: rounds to clean at most half of `case.yaml`'s original count, questions fewer than its original count, and a manual check that each label maps to a quoted Design or Scope resolution in the clean document, none an always-blocking defect under `Not handled:`. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-22 | R-1 | spec | `a3bccaab` | claude-opus-5-5 | procedural | 2 blocking, 11 should-fix, 3 nit |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design (Product profile, "No dispatch field changes"; Scoped re-review); Acceptance Criteria AC-05; Test Plan AC-05 row; Context Owner summary (re-review bullet)
EVIDENCE: Scoped re-review has the reviewer run `git diff <previous>..<X> -- <document>` and decide whether the previous commit is reachable "itself". The command route gives a spec reviewer no Git history. plugins/vh-adlc/scripts/loop/review-route.ts:3 says "A read-only spec review reads a read-only `git archive` export of the commit", and :208-209 build it with `git archive --format=tar <commit>` piped to `tar -x`. scripts/loop/cli.ts:172 tells the reviewer the repository is "the current directory, a read-only export of the commit". An export has no .git, so on the Codex command route every previous commit looks unreachable and every pass is full. AC-05 then cannot be met on the route the replay and adopters use, and S17.scoped runs through the scenario session runner, which drives `claude` only (tests/vh-adlc/scenarios/run.ts:133-138), so it would pass while the command route never scopes.
PROPOSAL: Have the dispatcher compute the previous review commit and the document diff and pass them to the reviewer as dispatch fields on both routes (dropping "No dispatch field changes"), or limit AC-05 to the host route and say so in Scope, and add a command-route case to the AC-05 proof.

FINDING: F-02
KIND: judgement
SEVERITY: blocking
WHERE: Acceptance Criteria AC-10, AC-11; Test Plan AC-10, AC-11 rows; Design (Replay harness, labels.md and the old brief runs); Context Owner summary ("every hand-labelled real defect is raised in every run"); frontmatter goal
EVIDENCE: Labels are "the real defects present at X" with "the original finding it came from", and the enterprise case is chosen for "the most labelled real defects among those whose original review ran 19 or more spec rounds". Many labels will therefore come from findings that the original reviewer only raised in later rounds, which means the old rules' own first pass at X missed them. AC-10 and AC-11 still require every label in each of six stochastic new-brief first-pass runs. That bar is stricter than the goal ("every real defect the current review raises is still raised") and plausibly unmeetable by any implementation. The old-brief first-pass runs the Design schedules feed no criterion, so nothing compares against what the current review actually raises.
PROPOSAL: Define retention relative to the old brief: each label that old-brief runs raise on a route must also be raised by every new-brief run on that route, at a severity that still leads to its resolution. Labels no old-brief run raises are reported but do not gate. Alternatively, restrict the labels to defects the original first pass raised.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-12; Test Plan AC-12 row; Design (Replay harness, case.yaml "original count of spec reviews and owner questions", full loop paragraph); Context Background (Rounds); Context Owner summary ("at most half the original reviews")
EVIDENCE: The Background count `grep -cE '^\| [0-9-]+ \| R-[0-9]+ \| spec \|'` includes acceptance rows. At 915441e8 it gives 24 for spec-review-convergence.md, of which 4 are `accepted by owner`, so that document had 20 reviews. shared-docs-drift.md has 142 rows, 11 of them acceptances, spread over several accepted revisions. The document does not say whether case.yaml's original count stops at the first clean pass, the first acceptance, or the end of history. It does not define a "clean pass" for the new loop (no blocking finding, or `gate planned` passing after should-fix findings are applied), how many full-loop runs there are, which route they use, or how the original owner questions are counted, given that answered questions are removed from the document. The new loop runs on today's models with a scripted owner and, per Context, after PR #152's convergence trigger lands, while the original count is history. So AC-12 could pass from those differences alone, with this feature's rules contributing nothing.
PROPOSAL: Define the original count as non-acceptance spec reviews from X to the first acceptance, with questions counted from Git history over the same range. Define clean as the point where `gate planned` would pass after the author handles the pass. State the run count and route. Preferably also run the old brief's full loop under the same scripted owner and compare the two loops rather than history.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design (Failure, retry and rollback: "repositories on `0c983f67` keep today's behavior throughout because the skill rules are gated"); Design (Scoped re-review; Stated limit; Product profile; Open Questions and owner lists, third paragraph); Acceptance Criteria AC-03, AC-04, AC-05, AC-07; Test Plan AC-05, AC-07 rows
EVIDENCE: Only the spec skill's Open Question behavior is gated on the resolved convention (Design, Open Questions: "Both apply when the resolved convention states the rule"). Scoped re-review, honouring `Not handled:` lines and reading the profile are plugin reviewer text with no stated gate. The owner-list triage goes into references/loop.md ungated. At 0c983f67 the convention requires every unapplied nit "in its report and the owner-facing conversation summary" (conventions/feature-documents.md:222-224), so ungated triage contradicts the resolved convention on an old pin. The rollback claim is false as designed, and two implementers would gate these differently.
PROPOSAL: State for each reviewer and loop.md change whether it is gated on the resolved convention, and how. Make the rollback paragraph match. Add an old-pin control to the S17.scoped and S17.nits rows.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Open Questions and owner lists, first and third paragraphs); Acceptance Criteria AC-02, AC-07; Test Plan AC-06, AC-07 rows; Context Owner summary (last two bullets)
EVIDENCE: "the owner's recorded rules" decides both whether an Open Question is raised ("the goal, the product profile and the owner's recorded rules do not decide") and which list items the agent may settle. The document never says where those rules live (AGENTS.md, the loop project procedure, a profile field, host memory) or what to do when there are none. S17.nits says six nits are settled "under the nit rule", which is a different mechanism: the nit rule decides whether nits are applied, not whether the owner sees them. Without a defined source, the scenario cannot be seeded and two implementers would build different triage.
PROPOSAL: Name the source of recorded rules (for example, the Product profile plus the files `cli.ts context` lists) and the behavior when it is empty. Reword S17.nits to seed those rules and say which six items they settle.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness: "the plugin diff names nothing from either case (a test greps for the cases' terms)"; case.yaml field list); Test Plan AC-09 row
EVIDENCE: The case terms are private repository and product material. If the grep test lives in the public repository with its term list, it publishes the very names the Design keeps private ("with no repository or product names"). If the terms come from the private case directory, case.yaml does not list a terms field, and the check cannot run in the public suite. The AC-09 row only proves the grep logic on a planted fixture term.
PROPOSAL: Add a `terms` field to case.yaml, and run the grep inside the harness against the branch diff before any new-brief run, recording only pass or fail in the results. Keep the public test to the planted-term fixture.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness: "Labels are written and frozen before the new brief is edited"; labels.md approval line); Acceptance Criteria AC-10, AC-11 ("approved before any new-brief run"); Test Plan AC-10 row ("dated before the first new-brief run"); Context Owner summary ("before any run")
EVIDENCE: The anti-fitting guarantee depends on labels being frozen before the brief is edited, but no criterion or proof checks that. The proof compares a date line with the first run, and runs could start on the same day after the brief has changed. The timing is stated three different ways: before the brief edit, before any new-brief run, and before any run.
PROPOSAL: Have the approval line name the commit or digest of labels.md, and require the proof to show that it predates the first branch commit editing the reviewer, spec skill or convention. Use one timing statement in all four places.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, The cases, Enterprise bullet)
EVIDENCE: "the feature document with the most labelled real defects among those whose original review ran 19 or more spec rounds" needs labels for every candidate before the case is chosen. Labels are written, and approved by the owner, once per case. The selection is circular, and two implementers would pick different documents or label several.
PROPOSAL: Select by an observable measure the history already holds, for example the most blocking findings in the original reviews among documents with 19 or more non-acceptance spec reviews, and then label only that document.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-04 row (S17.profile); Acceptance Criteria AC-04
EVIDENCE: The seeded document is "a single-user CLI that writes a local file without a lock", so the document itself says nobody runs concurrent writers. With no profile, the Design's default ("production software with users") does not override what the document says, so a correct reviewer may rate the gap nit, and the third run's pass condition (should-fix or blocking) would fail it. Under the multi-tenant profile, the document contradicts its own profile, so the contrast cannot be attributed to the profile.
PROPOSAL: Seed a document that is silent about user count and deployment, so only the profile carries the stakes. Alternatively, drop the third run's severity floor and require only that it is not lower than the single-user run.

FINDING: F-10
KIND: factual
SEVERITY: should-fix
WHERE: frontmatter covers; Scope (tests that pin the changed text); Test Plan AC-04 to AC-08 rows
EVIDENCE: The proofs add scenarios S17.profile, S17.limit, S17.scoped, S17.questions and S17.nits, which live in tests/vh-adlc/scenarios/run.ts (S16 is at :1141-1298), and a new tests/vh-adlc/proportional-review.test.ts. covers lists neither, so `feature_tree_clean` and staleness ignore changes to them. PR #152, which this feature builds on, adds tests/vh-adlc/proportionality.test.ts, which pins reviewer severity text this feature edits ("The harm statement findings above keep the severity given there."). The plugin version files edited with the release are also absent.
PROPOSAL: Add tests/vh-adlc/scenarios/run.ts, tests/vh-adlc/proportional-review.test.ts and, once #152 lands, tests/vh-adlc/proportionality.test.ts to covers, plus the plugin.json files if this feature bumps the version.

FINDING: F-11
KIND: factual
SEVERITY: should-fix
WHERE: Design (Product profile; Stated limit; Scoped re-review; Severity by consequence); Acceptance Criteria AC-08; Test Plan AC-08 row
EVIDENCE: conventions/feature-documents.md:168-170 at 0c983f67: "User-facing terms the feature introduces or changes appear in a glossary row and are held to it by a criterion." The feature introduces "Product profile", "stated limit" with the `Not handled:` line, "scoped re-review" and "severity by consequence", and the user guides describe them (AC-08), but the document has no glossary. AC-08's test only checks that each term appears.
PROPOSAL: Add a glossary with one row per term and its definition, and have AC-08 and its proof hold the guides and the convention to those definitions.

FINDING: F-12
KIND: factual
SEVERITY: should-fix
WHERE: Context Owner summary (second and third bullets); Design (Severity by consequence; Stated limit); Acceptance Criteria AC-01, AC-03
EVIDENCE: The summary says "Blocking and should-fix need a concrete failure a user, tenant or operator of that product would plausibly hit, or a criterion that cannot be met." Design keeps blocking for false facts that change the build or a proof and for a proof that fails a correct implementation or cannot run. It also keeps should-fix for "a proof that could pass on a wrong implementation". The summary says a stated limit is re-raised only "for those three always-blocking classes", while Design and AC-03 also re-raise it for an unmeetable criterion or an unsolved problem. The owner accepts against this summary.
PROPOSAL: Restate both rules in the summary as Design gives them: proof and false-fact defects keep their severity, and a stated limit is re-raised for the three classes, an unmeetable criterion or an unsolved problem.

FINDING: F-13
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-10, AC-11, AC-12 rows; Design (Replay harness, private material paragraph); Context Owner summary
EVIDENCE: Only counts are committed to tests/vh-adlc/evidence/proportional-review/results.md. The records, matcher verdicts and the clean documents AC-12's manual check reads stay in a private directory that no dispatch field or Test Plan row names. An implementation reviewer, who must observe evidence itself, has no stated way to reach them. The likely verdicts for AC-10 to AC-12 are then "not verified", even though the owner chose a local copy precisely so the review can inspect the records (the folded Q1).
PROPOSAL: State in the AC-10 to AC-12 rows where the implementation reviewer reads the stored records, verdicts and clean documents (a path passed with the implementation review dispatch), and what it checks there.

FINDING: F-14
KIND: factual
SEVERITY: nit
WHERE: Design (Scoped re-review)
EVIDENCE: plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:52: "Return every finding you can establish in this pass; do not hold any back for a later pass." Scoped re-review has the reviewer withhold non-blocking findings outside scope, and the Design does not say this sentence changes.
PROPOSAL: Name the reviewer sentence that scoped re-review amends.

FINDING: F-15
KIND: factual
SEVERITY: nit
WHERE: Context Background (pin citation; text item 5; Harm and simplest alternative); Design (Open Questions and owner lists, `SKILL.md:120-135`)
EVIDENCE: The pin is on AGENTS.md:4, not :3. The nit-rule gating is SKILL.md:120-128; lines 129-135 are step 5 and the Drift re-reviews heading. "without bringing rounds down in the counts above" is not supported by the cited counts, which are all-time totals with no split at 2026-11-14. Counting non-acceptance spec rows dated 2026-11-14 or later at a3bccaab does support it: shared-docs-drift.md 69, single-writer-ownership.md 15.
PROPOSAL: Fix the two line citations, and cite the post-merge counts for the convergence claim.

FINDING: F-16
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-03 row (S17.limit), AC-06 row (S17.questions), AC-07 row (S17.nits)
EVIDENCE: S17.limit's control applies "the same line on an unauthenticated delete path", but that line is about names.log concurrency and cannot describe a delete path. S17.questions and S17.nits need an exact review output ("a review returns one judgement finding...", "a pass with eight nits") but do not say they use canned records, as S16.nits does with `scriptedPlugin(f, "nits")` (tests/vh-adlc/scenarios/run.ts:1182).
PROPOSAL: Give the control its own `Not handled:` line text, and state that S17.questions and S17.nits use scripted reviewer records.
