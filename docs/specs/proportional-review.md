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
