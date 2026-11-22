---
status: draft
status_description: "Revised after clean spec review R-4 with the owner's answers; waiting for the next independent spec review, then acceptance."
issue: null
goal: "Spec review weighs every finding against the product the project describes, so a document reaches a clean pass in far fewer rounds with fewer owner questions, while every real defect the current review raises is still raised."
covers:
  - plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md
  - plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/references/review-protocol.md
  - plugins/vh-adlc/scripts/loop/cli.ts
  - plugins/vh-adlc/knowledge.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - AGENTS.md
  - docs/user-guides/workflows.md
  - docs/get-started/first-feature.md
  - tests/vh-adlc/replay/
  - tests/vh-adlc/evidence/proportional-review/
  - tests/vh-adlc/scenarios/run.ts
  - tests/vh-adlc/loop/review-scope.test.ts
  - tests/vh-adlc/loop/lenses.test.ts
  - tests/vh-adlc/fixtures/build.ts
  - tests/vh-adlc/proportional-review.test.ts
  - tests/vh-adlc/proportionality.test.ts
  - tests/vh-adlc/review-convergence.test.ts
  - tests/vh-adlc/direct-operation-compatibility.test.ts
---

# Plan: Proportional review

Spec review rates findings by what they would do to the product the project says it is, accepts a
stated limit as an answer, and re-reviews only what changed. A replay of real documents proves that no
real defect the current review raises is lost.

## Context

### Owner summary

Spec reviews take too many rounds and send the owner too many questions. In this repository the stored
reviews hold 2,673 findings, and their proposals ask the author to add something more than six times as
often as to cut. Each revision adds mechanisms that the next full pass attacks, and review depth is the
same for a multi-tenant platform and a small personal application.

This feature changes the rules at their source, in the shared convention, the reviewer and the spec
skill:

- Each project states once, in a `## Product profile` section of its `AGENTS.md`, what it is and what is
  at stake. The reviewer weighs failure paths against it.
- A false fact, an unmeetable criterion or a broken proof keeps its severity. A failure path is blocking
  or should-fix only when a user, tenant or operator of that product would plausibly hit it; below that
  it is a nit. Security, data-loss and tenant-isolation defects stay blocking on every product.
- The author may answer a finding with a stated limit in Scope, without asking, unless the limit excludes
  a case the goal, a criterion or Scope names. Later passes do not raise it again unless it leaves one of
  those three defects, an unmeetable criterion or an unsolved problem.
- After the first pass, one loop command hands the reviewer the document's diff since the previous pass,
  on both reviewer routes; the reviewer covers that and reports only blocking findings outside it. A
  pass is full again when covered code or the repository's docs pin changed.
- An Open Question is raised only where the owner could plausibly choose differently. The author settles
  the rest and records the choice in Design.
- The spec owner summary shows only the unapplied nits the product profile, instruction files and project
  procedure do not settle; the full list follows at the end of the same reply.

Every behavior change is gated on the resolved convention; the scope fields are always passed and
ignored on an older pin. Repositories with their own older pin keep today's behavior; repositories
without a pin take the new rules with the plugin upgrade. It builds on
[PR #152](https://github.com/michielvha/vh-adlc/pull/152) ([#148](https://github.com/michielvha/vh-adlc/issues/148))
and [#141](https://github.com/michielvha/vh-adlc/issues/141), which land first;
[#150](https://github.com/michielvha/vh-adlc/issues/150) stays separate. It is the first step of the
improvement loop in [#52](https://github.com/michielvha/vh-adlc/issues/52).

Product quality is a hard constraint, proved by replay on one enterprise and one small application
document at their first spec-review commit, on the Codex command route and the Claude host route. The
old rules run three first passes and the new rules six. A labelled real defect fails if the old rules
raised it in two or more runs and the new rules raise it in none at the severity the owner set for it,
confirmed by six more runs; an unchanged reviewer fails a label with at most 0.9 percent chance. Then
each brief runs one full loop per case and route
under the same scripted owner, and the new rules must need at most half the old total of spec reviews,
with fewer questions. The owner approves the labels, profile and case before any rule is edited. Case
material stays on the owner's host, the second user's with their consent. The owner's consumer
repository name is public; the second user's repository name stays private unless they agree to publish
it, and no document content is published. Only counts are published. Nothing has run yet.

The owner accepted one stated limit: a repository without its own pin gets one scoped pass after a plugin
upgrade moves its docs revision. Reviews R-1 to R-4 raised thirteen questions, twelve answered at their
recommendation; R-3 stopped the loop for a proportionality decision and the owner chose to cut the replay
statistics, and after R-4 the owner removed the average-hits check as too noisy. Acceptance authorizes
the plugin edits, the replay harness and the companion convention PR on a feature branch; shipping and
the pin bump need the usual approvals.

### Background

Measured on `main` at `915441e8` with the conventions at `vhco-pro/docs` `0c983f67`, the pin in
`AGENTS.md:4`.

- Stored findings: `git grep -hE '^SEVERITY: ' -- docs/specs | sort | uniq -c` gives 204 blocking, 1,443
  should-fix and 1,023 nit, of 2,673 `FINDING:` records; `KIND:` gives 1,434 factual and 1,234 judgement.
- Proposal direction: of 2,670 `PROPOSAL:` lines, 1,864 match an adding verb (add, require, prove, test,
  verify, record, specify, define) and 284 a cutting verb (remove, drop, cut, narrow, delete, withdraw,
  weaken, simplify). A line can match both.
- Rounds: spec rows in the Review Log that are not acceptances
  (`grep -E '^\| [0-9-]+ \| R-[0-9]+ \| spec \|' | grep -vc 'accepted by owner'`) number 131 in
  `docs/specs/shared-docs-drift.md`, 47 in `blog-visual-reading.md`, 40 in `paseo-hosts.md` and 20 in
  `spec-review-convergence.md`, the change that added the nit rule, merged in
  [#93](https://github.com/michielvha/vh-adlc/pull/93) on 2026-11-14. Counting only rows dated 2026-11-14
  or later gives 69 in `shared-docs-drift.md` and 15 in `single-writer-ownership.md`.

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
5. Every pass reviews the whole document and returns every finding it can establish
   (`vh-adlc-reviewer.agent.md:37-56`, `:52`), so mechanisms a revision adds become new surface. The
   stopping rule that would end this, `docs/specs/spec-review-stopping-rule.md`, is `parked` (its
   frontmatter, line 2).
6. A finding can be met by adding text or asking the owner; nothing names a stated limit as an answer.

A command-route spec reviewer sees no Git history: it reviews a `git archive` export of the commit
(`plugins/vh-adlc/scripts/loop/review-route.ts:3`, `:208-209`), and `reviewPrompt` tells it so
(`plugins/vh-adlc/scripts/loop/cli.ts:52`, `:172`). Anything it needs from earlier commits has to be in
the dispatch.

Wording tests do not show that a rule changes behavior: `tests/vh-adlc/review-convergence.test.ts:45`
asserts the should-fix sentence is present. The scenario harness can run the real reviewer on a seeded
document and check what it raises (`S16.oldpin-reviewer`, `tests/vh-adlc/scenarios/run.ts:1275-1300`), or
use scripted records (`scriptedPlugin`, `:1114-1121`); the replay below reuses that pattern on real
documents.

The owner set the constraints in this request: fix over-reach in the instructions rather than by filtering
findings, keep product quality, prove it by replaying real documents (one enterprise, one small
application), and cite only public evidence because the investigation behind it summarizes private
sessions.

**Harm and simplest alternative.** The harm: every vh-adlc user pays for each spec in owner attention and
elapsed time, on every feature, and it does not heal; dozens of rounds per document are common in the
counts above. The simplest alternative without machinery is a process rule alone ("prefer removing",
"revisit the previous change"), which `spec-review-convergence` added (`SKILL.md:114-117`); 69 and 15
review rounds after its merge show it did not stop the churn. This feature is mostly rule text too; the
machinery is one loop command for the re-review scope and the replay harness, which exists because a
wording test cannot show the rules keep quality.

## Scope

In scope:

- The shared convention (`vhco-pro/docs`, one PR): severity by consequence with the always-blocking
  classes, the product profile as its context, the stated limit, scoped re-review, the plausible-choice
  rule for Open Questions with complete-design options, and owner-list triage in the nit paragraph.
- The reviewer agent: reading the product profile, weighing failure paths, honouring stated limits, and
  scoped re-review, all gated on the resolved convention.
- The re-review scope: one `review-scope` command in `scripts/loop/cli.ts` whose result both routes pass
  to the reviewer (`references/review-protocol.md`, `reviewPrompt`), and the protocol sentence it
  amends.
- The spec skill: author mode, review dispatch, review mode step 4 and the owner-facing nit list under
  the new rules, gated the same way.
- `references/loop.md`: the product profile, stated once.
- vh-adlc's own `## Product profile` in `AGENTS.md`, the docs pin bump in `AGENTS.md` and
  `plugins/vh-adlc/knowledge.md` to the companion revision, and the plugin version.
- The user guides (`docs/user-guides/workflows.md`, `docs/get-started/first-feature.md`), the scenarios
  and the tests that pin the changed text.
- A replay harness under `tests/vh-adlc/replay/`, the two replay cases run through it, and published
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
- Owner-list triage in operations other than the spec skill (audit, triage, maintenance and the rest).
- Not handled: a repository without its own pin whose plugin upgrade moves the resolved docs revision
  between two passes gets a scoped pass under the new text, because no file in the repository changes;
  the next covered or pin change makes the pass full again (R-3 F-07; accepted by the owner after R-4).
- Changing the complete `docs/specs/spec-review-convergence.md`: it stays complete, and its test keeps
  proving its text at `0c983f67`.
- Calibrating the reviewer's precision over time.

## Design

### Glossary

| Term | Definition |
| --- | --- |
| Product profile | The `## Product profile` section of a repository's root `AGENTS.md`: what the product is, who uses it, its stage, and what is at stake. |
| Severity by consequence | Rating a failure path by whether a user, tenant or operator of the profiled product would plausibly hit it and how much harm it does; false facts, unmeetable criteria and broken proofs keep their current ratings. |
| Always-blocking defect | A security, data-loss or tenant-isolation defect; blocking on every product, whatever its profile. |
| Security defect | A path that lets someone read or act beyond their authorization, or exposes a credential or secret. |
| Data-loss defect | Loss or corruption of data a user or tenant owns and cannot regenerate. |
| Tenant-isolation defect | A path that lets one tenant read or affect another tenant's data, runs or configuration. |
| Stated limit | A Scope line `Not handled: <the case>, <why> (R-<n> F-<nn>).` that answers a finding without adding a mechanism. |
| Scoped re-review | A spec review after the first that covers the document diff since the previous spec review and the sections it touches, and reports only blocking findings outside that. |
| Owner's recorded rules | The product profile plus the instruction files and project procedure that `bun scripts/loop/cli.ts context` lists. |
| Plausible-choice rule | An Open Question is raised only where the owner could plausibly choose differently; the author settles every other choice and records it in Design. |
| Owner-list triage | The spec skill's owner-facing summary shows only the unapplied nits the owner's recorded rules do not settle, with a count of the rest, and the full list follows in an `All unapplied nits` section at the end of the same reply. |

The convention, the reviewer, the spec skill and both user guides use these terms with these meanings.

### Gate on the resolved convention

Every rule below applies when the resolved `conventions/feature-documents.md` states severity by
consequence: its Review log section names the product profile as the context for severity. On an older pin
(such as `0c983f67`) the reviewer and the spec skill keep today's behavior: full passes, today's
severity, every unapplied nit in the owner summary, and judgement findings to Open Questions. This is the
pattern the nit rule uses today (`SKILL.md:120-128`). The scope fields are passed on every pin; on an
older pin the reviewer ignores them.

A repository without its own pin resolves the plugin pin (`internal/knowledge/knowledge.go:178-179`), so
it takes the new rules when it upgrades to the plugin release that moves `knowledge.md`. A repository
that pins the new docs revision while running an older plugin gets the new severity definitions with the
old reviewer and spec skill: findings rated by consequence for production software (the old reviewer
reads no profile), full passes, and every judgement finding still raised as a question. That mix raises
no fewer findings than today's.

### Product profile

A repository states its product in a `## Product profile` section of its root `AGENTS.md`: what the
product is, who uses it, its stage, and what is at stake (tenants, user data, money, credentials). A few
lines are enough. `references/loop.md` describes it once.

The reviewer reads the section from `AGENTS.md` at the reviewed commit, which both routes already have:
the host reviewer reads the repository, and the command-route export of X contains it. Without a
profile, the reviewer judges as for production software with users whose data matters.

vh-adlc's profile: an open-source agent workflow plugin and Go binary, used by a few developers on their
own machines and repositories, alpha on 0.x; at stake are the user's repositories, branches and
credentials, and the correctness of gates other projects rely on.

### Severity by consequence

The convention's definitions change as follows; record formats and names stay.

- blocking: unchanged for false facts that change the build or a proof, an unmeetable criterion, and a
  proof that fails a correct implementation or cannot run. Added: a concrete failure that a user, tenant
  or operator of the profiled product would plausibly hit with serious harm, and every always-blocking
  defect.
- should-fix: a concrete failure the profiled product's users would plausibly hit with limited harm; two
  implementers building things whose difference a user or operator would notice; or a proof that could
  pass on a wrong implementation. The free-text widening exception stays.
- nit: as today, plus an undefined path that nobody using the profiled product would plausibly hit.

The reviewer's failure-mode paragraph (`vh-adlc-reviewer.agent.md:47-50`) keeps asking the same four
questions and rates each gap on this scale, replacing "A path the document leaves undefined is a
finding". The harm-statement findings from PR #152 keep their severity.

### Stated limit

The author may answer a finding by adding a stated limit under Scope. That is a baseline change, so it is
reviewed like any other. Adding one is the author's call, recorded in Scope, unless the limit excludes a
case the goal, a criterion or a behavior Scope promises names; then it is an Open Question. A later pass does not raise the substance of a stated limit again, unless the
limit leaves an always-blocking defect, makes a criterion unmeetable, or leaves the stated problem
unsolved; then it is blocking and its `EVIDENCE` quotes the limit.

### Scoped re-review

`bun scripts/loop/cli.ts review-scope --repo <dir> --document <doc> --commit <X>` computes the scope once
for both routes and prints JSON with `previous`, `diff` and `full` with its reason. The previous review is
the latest `spec` row in the Review Log at X whose outcome is not `accepted by owner` and whose commit is
an ancestor of X. `diff` is `git diff <previous>..<X> -- <document>` without the Review Log section. The
pass is full, with `previous` and `diff` empty, when there is no such row, or when a `covers` path outside
the document or one of the docs pin bridge files (`AGENTS.md`, `CLAUDE.md`,
`.github/copilot-instructions.md`, the files `vh-adlc knowledge` reads a pin from,
`internal/knowledge/knowledge.go:35`) changed between the two commits; drift re-reviews and merged default-branch work are
therefore full passes. The pinless upgrade case is a stated limit in Scope. The spec skill passes the result in
the host dispatch; the `review` command calls the same function and `reviewPrompt` carries it for the
command route, whose export has no Git history.

With a scope, the reviewer covers the diff plus every section that states a rule, ID or term the diff
changes. Outside that scope it reports only blocking findings. The sentence "Return every finding you can
establish in this pass" (`vh-adlc-reviewer.agent.md:52`) becomes "within this pass's scope". The
protocol's "A dispatch never tells the reviewer to skip a check" (`references/review-protocol.md`,
Independence) gains one exception: the scope `review-scope` computes, on a resolved convention that
defines scoped re-review.

### Open Questions and owner lists

The convention's Open questions section replaces the "every trade-off" sentence
(`conventions/feature-documents.md:165-166`) with the plausible-choice rule: a question is raised only
where the options differ in something the goal and the owner's recorded rules do not decide, such as
scope, a public contract, security posture, permissions or cost to users. The author records every other
choice in Design with a one-line reason. Each option offered meets the goal in full; a stopgap, a
cheaper-now partial option or a lock to one dependency version is not offered. The next sentence
(`:167-168`, "A section that weighs options and keeps one ... raises that choice here") applies only
under the same rule. With no recorded rules, every judgement call the goal does not decide is a question.

The spec skill follows. Author mode (`SKILL.md:81-82`) raises a judgement call only under that rule.
Review mode step 4 (`:112-116`) resolves a judgement finding within the recorded rules and raises a
question only under the same rule, including the remove-or-add choice ("where they behave differently,
the choice is an Open Question recommending removal"). #141 lands first and lets the author cut an extra
it added without a question; that exception stays, and this rule covers the rest of step 4.

Owner-list triage applies to the spec skill only: its owner-facing summary shows the unapplied nits the
owner's recorded rules do not settle, with a count of the rest. The full list follows in a section headed
`All unapplied nits` at the end of the same reply, which keeps the report complete. The convention's nit
paragraph changes to allow this.

### Replay harness

`tests/vh-adlc/replay/run.ts` takes a case directory outside the repository:

- `case.yaml`: the local clone path, the commit X of the document's first spec review, the document path,
  the profile text, and `terms`, the case's private terms (the document's title and the product's
  internal feature names and identifiers). The enterprise case's repository name is public, as the owner
  decided; the small application case's `terms` include the second user's repository name unless they
  agree to publish it. No document content is public;
- `labels.md`: the real defects present at X, each as `L-<nn>` with one line, the original finding it
  came from, the minimum severity the owner expects under the new scale (blocking for an always-blocking
  defect), and how a reviewer's finding is matched to it (a must-match description, with one example
  finding that matches and one that does not). The author proposes the list and the owner approves it
  once; the file ends with an approval line naming the owner, the time, the SHA-256 of everything above
  that line and the SHA-256 of `case.yaml`, so the profile, X and the document path are approved too.

The labels are approved before the first commit that edits the reviewer, the spec skill or the companion
convention, in either repository, so the rules cannot be fitted to them. The implementation review checks
that order by hand; the harness only refuses a case whose approval line is missing or whose digests do
not match.

Before any new-brief run, the harness greps the whole vh-adlc tree at the feature head and the companion
branch's diff (from a local `vhco-pro/docs` checkout passed as an option) for every entry in `terms` and
records only pass or fail; a hit stops the run.

Both briefs are fixed before the first run: old is the plugin at the feature branch's merge base at that
moment, with the companion PR's parent docs revision; new is the feature head at that moment, with the
companion head. The harness records both plugin commits, both docs revisions and the model of every run
in the results. Before the pin bump, it checks that every page the reviewer and the spec skill read is
byte-identical at the companion head and at the commit the pin will name; if not, the new-brief runs are
repeated at the pinned commit. For each brief, the harness makes a throwaway
clone at X and commits X' on top, holding the profile in `AGENTS.md`, the brief's docs pin and the
`.vh-adlc/loop.yaml` route settings for the route under test, because the command route reads its policy
and its export from the reviewed commit (`scripts/loop/cli.ts:161-162`). Before counting a run it checks
that the route and model the run reports are the ones under test. It runs:

1. First passes: a spec review on each route, three times with the old brief and six with the new, the Codex command route
   (`references/loop-settings.md`, `route: command`) and the Claude host route, through the scenario
   harness's session runner (`tests/vh-adlc/scenarios/run.ts`) and the `review` command.
2. A full loop on each route, from X' until a clean pass, with a scripted owner that adopts each Open
   Question's recommendation and answers the convergence trigger with "keep going". A clean pass is a
   spec review with no blocking finding whose handling leaves the normative baseline unchanged and no
   Open Question, so `vh-adlc gate planned` at that commit fails only on `accepted`. The loop counts spec
   reviews up to and including that pass and the Open Questions the author raised. A loop stops at 60
   spec reviews and then counts as 60.

Both briefs use the same route settings and models. A run that fails to execute is recorded as failed and
rerun; it never counts as a pass. An independent agent matches findings to labels from `labels.md` and the
stored records, and its verdicts are stored beside each run.

Retention, per label and route: a label fails when at least two of the three old-brief first passes raise
it, at any severity, and none of the six new-brief first passes raises it at or above its minimum
severity. A failing label gets six more new-brief first passes and fails only if none of the twelve raises it at
or above its minimum severity. For a reviewer whose hit rate is unchanged, a label fails with probability at most 0.9 percent (at a
per-run hit rate near 0.14; computed exactly over the binomial outcomes). Labels no old-brief pass raises
cannot fail and are reported.

Rounds: over the four case and route pairs, the new-brief loops' total spec reviews must be at most half
the old-brief loops' total, and their total Open Questions fewer.

Private material (case files, labels, records, matcher verdicts, clean documents, transcripts) stays in
the case directory, a private directory on the owner's host outside every public repository. The second
user's document and repository at X are copied there with their consent, so both cases run and are
verified on one host and stay in the replay set for later changes. The implementation review dispatch
names the case directories so the reviewer can inspect them. The harness writes only counts to
`tests/vh-adlc/evidence/proportional-review/results.md`: per case, route and brief, the plugin commit,
docs revision and model of each run, labels raised per run by ID and severity, rounds to clean, questions
raised, execution failures and the terms check.
Cases are named "enterprise" and "small application", with no repository or product names.

The cases:

- Enterprise: from the owner's private multi-tenant platform repository, the feature document with the
  most blocking findings in its original reviews among those with 19 or more non-acceptance spec reviews.
- Small application: the second user's feature document with the most non-acceptance spec reviews.

### Failure, retry and rollback

The rules change no state at run time. A review interrupted mid-pass stores nothing, as today. Documents
reviewed under the new rules keep valid records under the old ones, because names and formats do not
change. Every behavior change is gated on the resolved convention, so repositories with their own
`0c983f67` pin keep today's behavior throughout, apart from the scope fields their reviewer ignores. The
convention PR merges before the pin bump. Rollback is reverting the plugin release and the pin bump;
pinless repositories then return to today's behavior with the plugin, and a repository that pinned the
new docs revision moves its pin back to restore today's severity text.

### Tests that change

`tests/vh-adlc/review-convergence.test.ts` resolves its pages at the repository pin (`resolvedPage`,
`:21-29`); it changes to resolve `0c983f67` explicitly, so it keeps proving the complete
`spec-review-convergence` text. The new assertions go in `tests/vh-adlc/proportional-review.test.ts`.
The spec baseline in `tests/vh-adlc/direct-operation-compatibility.test.ts`,
`tests/vh-adlc/proportionality.test.ts` from PR #152 (it pins reviewer severity text) and the
`reviewPrompt` calls in `tests/vh-adlc/loop/lenses.test.ts:78`, `:93` move to the new text and input.
`S16.oldpin-reviewer` stays: on the old pin the reviewer keeps today's failure-mode check. The S17 canned
records live in `tests/vh-adlc/evidence/proportional-review/canned/`, so `scriptedPlugin`
(`tests/vh-adlc/scenarios/run.ts:1114-1120`) takes the canned directory as a parameter, and
`tests/vh-adlc/fixtures/build.ts` (`buildDocs`) adds a fixture docs revision holding the `0c983f67` tree
for the old-pin controls.

## Acceptance Criteria

- [ ] AC-01: The convention at the companion `vhco-pro/docs` revision defines blocking, should-fix and nit
      by consequence for the profiled product as Design states, with always-blocking defects blocking on
      every product.
- [ ] AC-02: That convention raises an Open Question only where the owner could plausibly choose
      differently, has the author record every other choice in Design, and offers only options that meet
      the goal in full.
- [ ] AC-03: That convention and the reviewer accept a stated limit as an answer to a finding, and the
      reviewer raises its substance again only for an always-blocking defect, an unmeetable criterion or
      an unsolved problem.
- [ ] AC-04: The reviewer reads the product profile from `AGENTS.md` at the reviewed commit, rates failure
      paths by it, and without one judges as for production software with users.
- [ ] AC-05: On both routes, a spec review after the first receives the scope from `review-scope`, covers
      only the document diff and the sections it touches, and reports only blocking findings outside
      that; the pass is full when there is no previous spec review or a covered path or a docs pin bridge
      file changed.
- [ ] AC-06: The spec skill raises judgement calls and judgement findings as Open Questions only under the
      plausible-choice rule, judged against the product profile and the files loop context lists.
- [ ] AC-07: The spec skill's owner-facing summary shows only the unapplied nits the owner's recorded rules
      do not settle, with a count of the rest and where the full list is.
- [ ] AC-08: On a repository pinned to `0c983f67`, the reviewer, the spec skill and the owner-facing summary
      behave as before this feature.
- [ ] AC-09: vh-adlc's `AGENTS.md` has a product profile and pins the companion revision, and the
      convention and both user guides use the glossary terms with the glossary's meanings.
- [ ] AC-10: The replay harness runs a case end to end, refuses a case whose approval line is missing or
      whose digests do not match, stops on a case term in the public tree or the companion diff, counts a
      run only on the route and model under test, records each run's plugin commit, docs revision and
      model, writes nothing but counts and identities to the results file, records failed executions
      without counting them as passes, and runs on a public fixture case in the test suite.
- [ ] AC-11: On the enterprise case, with labels and case approved before the first rule-editing commit, no
      label fails the retention rule on either route.
- [ ] AC-12: On the small application case, with labels and case approved before the first rule-editing
      commit, no label fails the retention rule on either route.
- [ ] AC-13: Over both cases and both routes, the new-brief loops need at most half the old-brief loops'
      total spec reviews, with fewer Open Questions in total.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-02, AC-03 | Manual procedure: read the convention at the companion revision and confirm each Design rule and glossary definition, including the three always-blocking classes, then run `bun test tests/vh-adlc/proportional-review.test.ts`, which pins the new definitions, the plausible-choice sentence and the stated-limit line at that revision. |
| AC-04 | Scenario `S17.profile`: a seeded document, silent about users and deployment, where a command a person runs appends its result to a shared file without a lock, reviewed by the real reviewer three times: with a profile saying one person runs it by hand on their own machine, one run at a time; with a profile saying a hosted service runs it for many tenants at once; and with no profile. Pass: the lock gap is nit or absent with the first, and should-fix or blocking with the second and with the third. |
| AC-03 | Scenario `S17.limit`, run as a full pass (the R-1 row's commit is not an ancestor of X) under a profile of a shared build host where parallel jobs run the command: the document says `names.log` is a diagnostic log rebuilt on every run, has an R-1 record F-01 about concurrent writers to it, and has a Scope line `Not handled: concurrent writers to names.log, accepted for this version (R-1 F-01).` Pass: no finding names `names.log` concurrency. Control 1: the same document without that line raises the `names.log` gap. Control 2: an R-1 F-02 about the delete endpoint with `Not handled: callers without a session on the delete endpoint, internal tool (R-1 F-02).` still yields a blocking finding quoting that line. |
| AC-05 | `bun test tests/vh-adlc/loop/review-scope.test.ts`: `review-scope` picks the right previous review with an acceptance row after it, skips a non-ancestor row, reports full with no row, with a changed `covers` path and with each changed bridge file, leaves the Review Log out of the diff, and `reviewPrompt` from the `review` command carries the result. Scenario `S17.scoped` on the host route and `S17.scoped-command` through the `review` command with a Codex command route: a reviewed document gets one changed Design paragraph and keeps a seeded should-fix gap in an unchanged section. Pass on each: apart from blocking findings, findings name only the changed paragraph or sections that state its terms; none names the unchanged gap; and an unchanged seeded security defect is still raised as blocking. |
| AC-06 | Scenario `S17.questions`, with scripted reviewer records (`scriptedPlugin`): one judgement finding the seeded product profile settles and one about a public contract. Pass at the companion pin: one Open Question, about the contract, and Design records the other choice. |
| AC-07 | Scenario `S17.nits`, with scripted reviewer records: an earlier clean pass has reviewed a free-text pattern row; the new pass has no blocking or should-fix finding and eight nits, six citation slips in the normative baseline that the seeded project procedure says need no owner attention and two free-text widening nits on that row. Pass: the summary part of the final reply shows the two and a count of six, and its `All unapplied nits` section lists all eight. |
| AC-08 | Old-pin controls of `S17.scoped`, `S17.questions`, `S17.nits` and `S17.profile` (single-user profile) on a fixture pinned to `0c983f67`. Pass: the unchanged gap is raised, both judgement findings become Open Questions, the summary lists all eight nits, and the lock gap is raised at should-fix or blocking despite the profile. `S16.oldpin-reviewer` and `bun test tests/vh-adlc/review-convergence.test.ts` at `0c983f67` still pass. |
| AC-09 | `bun test tests/vh-adlc/proportional-review.test.ts`: `AGENTS.md` has the section and the companion pin, `knowledge.md` names the same SHA, and the convention and both guides use each glossary term; plus a manual read of the convention and guides against the glossary definitions. |
| AC-10 | `bun test tests/vh-adlc/replay/run.test.ts` on a fixture case built from the scenario fixture with one seeded defect and scripted reviewers: the results file holds counts, label IDs and run identities and no line of the fixture document; a forced execution failure is recorded and not counted; a run reporting another route or model is not counted; copies of the case with no approval line, an edited label and an edited `case.yaml` are refused before any run; a planted term in the tree or the companion diff stops the run. |
| AC-11 | Replay of the enterprise case: three old-brief and six new-brief first passes per route, with confirmation runs where the rule calls for them. Pass: the results file shows no failing label on either route. The implementation reviewer opens the case directory, checks that the approval line matches `labels.md` and `case.yaml` and predates the first rule-editing commit in both repositories, and spot-checks the matcher's verdicts against the stored records. |
| AC-12 | Replay of the small application case, same procedure and pass condition. |
| AC-13 | The same replays' full loops, one per brief per case and route. Pass: the results file shows the new total of spec reviews at most half the old total and fewer Open Questions in total. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-22 | R-1 | spec | `a3bccaab` | claude-opus-5-5 | procedural | 2 blocking, 11 should-fix, 3 nit |
| 2026-11-22 | R-2 | spec | `5c09d79f` | claude-opus-5-5 | procedural | 1 blocking, 16 should-fix, 2 nit |
| 2026-11-22 | R-3 | spec | `98e792ad` | claude-opus-5-5 | procedural | 2 blocking, 9 should-fix, 2 nit |
| 2026-11-22 | R-4 | spec | `e94e00e7` | claude-opus-5-5 | procedural | no blocking; 5 should-fix, 1 nit |

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

### R-2

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design (Replay harness, Retention paragraph); Acceptance Criteria AC-11, AC-12; Test Plan AC-11, AC-12 rows; Context Owner summary ("Every labelled real defect that any old-rules run raises must be raised by every new-rules run on that route"); frontmatter goal
EVIDENCE: Retention says "a label gates when any old-brief first pass raises it. Every new-brief first pass on that route must raise each gating label as blocking or should-fix". The two briefs are held to different statistics. A label the old rules raise in one of three runs gates, and the new rules must then raise it in three of three. Take a reviewer whose new rules keep recall exactly unchanged, with a per-run hit rate of 0.5 for some label. That label gates with probability 0.875 and passes all three new runs with probability 0.125. The enterprise case is picked for having the most blocking findings (the candidates at Stackweaver HEAD hold 30 to 68 `SEVERITY: blocking` records), so several intermittent labels are near certain. A correct implementation would then fail AC-11 by chance. Severity is asymmetric too: an old run that raised a label only as nit still makes it gate, and the new run must then raise it at should-fix or higher. The design also gives no way for a label to legitimately become nit under severity by consequence, which is this feature's purpose, because labels.md records only "whether it is an always-blocking defect". This rule was added by the previous revision, which adopted R-1 F-02's proposal.
PROPOSAL: Use the same statistic for both briefs, for example new-brief hits per label at least the old-brief hits at an equal or higher severity class, or gate only labels that all old runs raise. Have labels.md record the minimum severity the owner expects under the new scale, so a label the owner agrees is implausible may correctly come back as nit.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, step 2, the "clean pass" definition); Acceptance Criteria AC-13; Test Plan AC-13 row; Context Owner summary ("reach a clean pass")
EVIDENCE: "A clean pass is a spec review with no blocking finding after which the author's handling leaves no Open Question, so `vh-adlc gate planned` would fail only on acceptance." The "so" does not follow. When the author applies should-fix findings, the baseline changes and `spec_review_fresh` fails as well as `accepted` (conventions/feature-documents.md Conditions; SKILL.md:129 needs "a clean review at X"). Under one reading, a pass with only should-fix findings is clean and the count stops there. Under the other, clean is a pass whose handling changes no baseline. The two readings give different round counts for AC-13. This definition was added by the previous revision in response to R-1 F-03.
PROPOSAL: Define clean as a pass with no blocking finding whose handling leaves the normative baseline unchanged and no Open Question, so that `gate planned` at that commit fails only on `accepted`. Alternatively, say explicitly that a should-fix-only pass ends the count, and why.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, step 2, "A loop stops at 60 spec reviews and records the cap"); Acceptance Criteria AC-13; Test Plan AC-13 row; Context Owner summary
EVIDENCE: Retention uses three first passes per brief per route because single runs are stochastic. AC-13 compares one old loop with one new loop per case and route, which is two samples of a long chain of stochastic reviews and authoring steps. That ratio can pass or fail on noise alone. The document does not say what AC-13 compares when the old loop hits the 60-review cap (60, or "not reached"), or when both loops hit it. It also does not say how to round "at most half" for an odd count. The full-loop comparison and the cap were added by the previous revision in response to R-1 F-03.
PROPOSAL: State how many loops each brief runs and what statistic is compared, for example the median of three. State how a capped loop counts on each side.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, "old (... at docs `0c983f67`) and new (the feature branch, at the companion docs revision)"); Test Plan AC-11, AC-12, AC-13 rows
EVIDENCE: `gh api repos/vhco-pro/docs/compare/0c983f67...main` reports main ahead by 95 commits, changing conventions/delivery.md, conventions/documentation.md, AGENTS.md and other pages. The companion PR will be cut from that main, so the new brief changes far more than this feature's rules. The spec skill reads conventions/documentation.md and conventions/delivery.md before writing (SKILL.md:56-58), and the reviewer reads the routed pages. A difference in rounds or questions can therefore come from unrelated convention changes. "Both briefs use the same route settings and models" holds the models constant but not the docs.
PROPOSAL: Run the old brief at the companion PR's parent revision, so the only docs difference between briefs is this feature's change, or state why 0c983f67 is an equivalent baseline for every page the spec skill and reviewer read.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design (Replay harness, the throwaway clone paragraph: "adds the profile to `AGENTS.md` in one scratch commit X', sets the brief's docs pin"; step 1; "Both briefs use the same route settings and models")
EVIDENCE: The command route reads its policy from the reviewed commit, not the working tree: plugins/vh-adlc/scripts/loop/cli.ts:92-94 ("The review policy is the one committed at the reviewed commit") calls `loadLoopSettingsAt(repo, commit)`. The spec reviewer also reads a `git archive` export of that commit (review-route.ts:3). Only the profile is committed in X'. The docs pin is "set" with no commit, and no route settings are written. A case whose `.vh-adlc/loop.yaml` at X has no command route, such as a repository that predates loop settings, would silently run the "Codex" passes on the host route. An export would also show a pin that differs from the dispatched revision.
PROPOSAL: State that X' commits the profile, the brief's docs pin and the `.vh-adlc/loop.yaml` route settings for the route under test. Have the harness check that the `review` command's JSON names the expected route and model before it counts a run.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, labels approval paragraph: "before the first commit on the feature branch that edits the reviewer, the spec skill or the companion convention"; terms paragraph: "greps the feature branch's diff from its merge base"); Acceptance Criteria AC-10; Test Plan AC-10, AC-11 rows; Context Owner summary ("before the first commit that edits the rules")
EVIDENCE: The companion convention is a PR in vhco-pro/docs (Scope, first bullet), so no commit on the vh-adlc feature branch edits it. The harness compares the approval time with "that commit's committer time" and greps only the vh-adlc branch diff. A convention edit made in vhco-pro/docs before the labels are approved, or a case term written into the public convention text, passes both checks. Most of the rule text this feature changes lives in that convention. The approval timing rule was changed by the previous revision in response to R-1 F-07.
PROPOSAL: Name the companion branch in vhco-pro/docs as a second source. Have the harness take the earliest rule-editing commit across both repositories and grep both diffs for the terms.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Context Owner summary ("Repositories on the current docs pin keep today's behavior until they move their pin"); Design (Gate on the resolved convention); Design (Failure, retry and rollback: "repositories on `0c983f67` keep today's behavior throughout", "Rollback is reverting the plugin release and the pin bump"); Scope (pin bump in `plugins/vh-adlc/knowledge.md`); Acceptance Criteria AC-08, AC-09
EVIDENCE: internal/knowledge/knowledge.go:179 returns `Source: "plugin"` with the plugin pin when a repository has no pin of its own (knowledge_test.go:113 "no pin"). knowledge.md currently names 1ccf8f31 (line 5). Scope moves it to the companion revision, so every adopter without its own pin switches to the new rules on plugin upgrade without moving any pin. The summary says the opposite. The reverse path is also undefined. An adopter whose own pin moves to the companion revision or any later docs revision, while running an older plugin, gets the new convention's severity and Open Question text with the old reviewer and spec skill (SKILL.md:81 "Put every judgement call into Open Questions"). Reverting the plugin release does not revert the convention for such repositories.
PROPOSAL: Correct the summary to say that repositories without their own pin take the new rules with the plugin upgrade. In Failure, retry and rollback, state what an older plugin does on a docs revision that has the new rules, and what rollback means for repositories that pin such a revision.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Design (Open Questions and owner lists, first and third paragraphs); Scope (convention bullet; spec skill bullet); Acceptance Criteria AC-02, AC-06; Test Plan AC-06 row
EVIDENCE: Design replaces only the "every trade-off" sentence. The next sentence at conventions/feature-documents.md:167-168 (0c983f67) still says "A section that weighs options and keeps one, such as a simplification check, raises that choice here instead of deciding it." That applies to any Design that records a settled choice, and to the rejected alternative in the PR #152 harm statement. SKILL.md:114-116 still says "where they behave differently, the choice is an Open Question recommending removal", and issue #141 also edits that sentence. Design says step 4 raises a question "only under the same rule" but does not say whether these sentences go, so one implementer keeps them and another drops them.
PROPOSAL: Name every sentence the plausible-choice rule replaces or amends: convention :167-168, SKILL.md:114-116, and author mode :81-82. State how the result composes with #141's change to step 4.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Stated limit); Design (Glossary, Stated limit); Design (Open Questions and owner lists, first paragraph: "such as scope, a public contract, security posture"); Acceptance Criteria AC-02, AC-03; Context Owner summary (stated limit and Open Question bullets)
EVIDENCE: A stated limit narrows Scope ("Not handled: <the case>"). The plausible-choice rule lists scope first among the things that make a choice the owner's. One implementer will raise every stated limit as an Open Question, which brings back the questions this feature removes. Another lets the author add limits alone and relies on acceptance. The document does not say which, and AC-13's question count depends on it.
PROPOSAL: State whether adding a stated limit is an author choice recorded in Scope or an Open Question, and give the test the author applies, for example: an Open Question when the limit excludes a case the goal or a user-visible behavior names.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Open Questions and owner lists, fourth paragraph); Scope (`references/loop.md` bullet); Context Owner summary (last bullet); Acceptance Criteria AC-07, AC-08; Test Plan AC-07, AC-08 rows
EVIDENCE: `git grep -l 'references/loop.md' -- plugins` lists the audit, triage, maintenance, docs-drift, ship, implement, review, tasks, clean, blog and diagram skills as well as spec. Owner-list triage stated once in loop.md, for "a list meant for the owner (findings, unapplied nits, review items)", therefore reaches audit findings, triage lists and maintenance reports, several of which have their own owner-report formats. The gate is defined by the content of conventions/feature-documents.md, which those operations may not resolve. The proofs cover only spec nits. Two implementers would scope triage differently.
PROPOSAL: Name the operations and lists that owner-list triage applies to, or limit it to the spec and review operations' summaries, and say how the gate is evaluated in an operation that does not resolve feature-documents.md.

FINDING: F-11
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Scoped re-review, both paragraphs); Design (Glossary, Scoped re-review); Acceptance Criteria AC-05; Test Plan AC-05 row; Context Owner summary (re-review bullet)
EVIDENCE: Scope is defined by `git diff <previous>..<X> -- <document>` alone. A drift re-review exists because covered code changed on the default branch while the document did not (SKILL.md:90-98). Its document diff is empty apart from stored records, so the pass checks the document's claims against the changed tree for blocking findings only, and a now-imprecise claim rated should-fix goes unreported. The same happens when a feature branch merges main between passes, or when the resolved docs revision changes between passes. "A drift re-review keeps its existing limit" refers to the revision-edit limit (SKILL.md:136-139), not to review scope. The diff also always includes the previous pass's stored records and Review Log row, which the scope rule then treats as changed text.
PROPOSAL: Widen scope to include document claims about paths in `covers` that changed between the two commits, make the pass full when the resolved docs revision differs, and exclude the Review Log section from the diff.

FINDING: F-12
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-05 ("On both routes ... covers only that diff ..., reports only blocking findings outside that"); Test Plan AC-05 row (command route sentence); Design (Scoped re-review)
EVIDENCE: For the command route the row proves only that `reviewPrompt` carries the fields (`review-scope.test.ts`) and says "AC-13's Codex loops exercise it end to end". AC-13 checks round and question counts, not whether a Codex reviewer withheld out-of-scope should-fix findings or still reported out-of-scope blocking ones. The behavioral half of AC-05 on the command route has no check, so an implementation reviewer can only return `untested` or `not verified` for the composite criterion.
PROPOSAL: Run S17.scoped's seeded gap and its security control through the `review` command with a command route too, or narrow AC-05's behavioral clause to the host route and state the limit.

FINDING: F-13
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Scoped re-review, first paragraph: "The spec skill adds them to the host dispatch; `reviewPrompt` adds them for the command route, computed by the `review` command"); Scope (dispatch bullet); Test Plan AC-05 row
EVIDENCE: The selection rule (latest non-acceptance `spec` row at X whose commit is an ancestor of X, then a document diff) is implemented twice: in TypeScript for the command route, and as instructions the host session follows for the host route. S17.scoped checks one simple history. One implementer adds a shared CLI helper both routes call; another writes prose for the host session. The two can pick different previous reviews, for example after an acceptance row or a merge.
PROPOSAL: Have both routes take the fields from one `bun scripts/loop/cli.ts` computation, and test that computation for acceptance rows, non-ancestor rows and the no-row case.

FINDING: F-14
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-04 row (S17.profile); Acceptance Criteria AC-04
EVIDENCE: The seeded document now has "a service appends each request to a shared file without a lock", and the first run's profile says "one user on one machine". One user can easily send overlapping requests to a service (parallel client calls, retries, two tabs). Under the Design's should-fix definition ("a concrete failure the profiled product's users would plausibly hit with limited harm"), a correct reviewer may rate the gap should-fix, and the pass condition "nit or absent with the first" would then fail it. The seed was changed by the previous revision in response to R-1 F-09.
PROPOSAL: Seed a writer that one user cannot run concurrently under the first profile, for example a command one person runs by hand, or state in the first profile that requests are handled one at a time.

FINDING: F-15
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-03 row (S17.limit); Acceptance Criteria AC-03
EVIDENCE: The row does not say whether the seeded document has a previous spec review. If it has one and the `Not handled:` line is outside the diff, scoped re-review already suppresses a should-fix concurrency finding, so "no finding names `names.log` concurrency" passes whether or not the reviewer honours stated limits. If it has none, the line's "(R-1 F-01)" points at a review that does not exist, and a correct reviewer may raise a factual finding that names it, which fails the pass condition.
PROPOSAL: Seed an R-1 record F-01 that the line answers, and run the case as a full pass (no previous review row, or the limit inside the diff) so only stated-limit honouring can suppress the finding.

FINDING: F-16
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Tests that change); Test Plan AC-01, AC-02, AC-03 row ("`bun test tests/vh-adlc/review-convergence.test.ts`, updated to pin the new definitions"); frontmatter covers
EVIDENCE: docs/specs/spec-review-convergence.md is `complete` and covers tests/vh-adlc/review-convergence.test.ts, the reviewer and the spec skill. Its criteria assert the should-fix sentence (review-convergence.test.ts:45), the failure-mode check and one-pass completeness, which this feature replaces once the repository pin moves. The test resolves the repository pin (`resolvedPage`), so rewriting it makes the complete feature's recorded evidence unreproducible and leaves its goal contradicted by current behavior. The document does not say whether that feature becomes superseded, keeps an old-pin proof, or gets a note.
PROPOSAL: Leave review-convergence.test.ts proving the old text at 0c983f67, put the new assertions in tests/vh-adlc/proportional-review.test.ts, and add an Open Question on whether the owner marks spec-review-convergence superseded.

FINDING: F-17
KIND: factual
SEVERITY: should-fix
WHERE: Design (Glossary); Design (Open Questions and owner lists); Scope ("plausible-choice rule", "owner-list triage"); Acceptance Criteria AC-06, AC-07, AC-09
EVIDENCE: conventions/feature-documents.md:168-169 at 0c983f67: "User-facing terms the feature introduces or changes appear in a glossary row and are held to it by a criterion." The feature introduces "owner's recorded rules" (defined only in Design prose), "plausible-choice rule" (AC-06, Scope) and "owner-list triage" (Scope, loop.md). The convention and the user guides will describe all three to users, but the glossary has no row for any of them and AC-09 holds the guides only to the five listed terms.
PROPOSAL: Add glossary rows for owner's recorded rules, plausible-choice rule and owner-list triage, and cover them in AC-09 and its test.

FINDING: F-18
KIND: factual
SEVERITY: nit
WHERE: frontmatter covers
EVIDENCE: S17.questions and S17.nits use `scriptedPlugin`, which reads canned records from tests/vh-adlc/evidence/review-convergence/canned/<name> (tests/vh-adlc/scenarios/run.ts:1112-1120), a path covers does not list. tests/vh-adlc/loop/lenses.test.ts:78 and :93 call `reviewPrompt`, whose input this feature extends.
PROPOSAL: Add the canned records directory, or name where the S17 canned records live, and tests/vh-adlc/loop/lenses.test.ts to covers.

FINDING: F-19
KIND: factual
SEVERITY: nit
WHERE: Context Owner summary (last bullet); Design (Open Questions and owner lists, second paragraph)
EVIDENCE: The summary sorts owner lists "under the product profile and the repository's instruction files"; Design adds the project procedure. Design's "With none of those ... every judgement call is a question" contradicts its own first paragraph, where the goal alone can also decide a choice.
PROPOSAL: Name the project procedure in the summary, and say "every judgement call the goal does not decide is a question".

### R-3

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design (Replay harness, Retention paragraph); Acceptance Criteria AC-11, AC-12; Test Plan AC-11, AC-12 rows; Context Owner summary ("the new rules must raise it in at least as many of three runs as the old rules, at or above the severity the owner set for it"); frontmatter goal
EVIDENCE: Retention requires, per label and route, new-brief hits at or above the minimum severity to be at least old-brief hits at any severity over three runs, with three more runs of each brief and a judgement on all six when a label falls short. Two binomial samples compared with "at least" fail an unchanged reviewer often. I computed the exact probability for a label whose per-run hit rate is the same under both briefs, including the rerun: 0.755 at p=0.33, 0.747 at p=0.5, 0.755 at p=0.67, 0.834 at p=0.9 (python, sum over Binomial(3,p) outcomes for the first three runs and the six-run rerun). Ten such label and route pairs all pass with probability about 0.05 to 0.16. The enterprise candidates at the owner's repository HEAD hold 30, 61 and 68 `SEVERITY: blocking` records, so many intermittent labels are likely. The severity asymmetry (old hits at any severity, new hits only at or above the owner's minimum) makes the new side strictly harder still. A reviewer that keeps recall exactly unchanged would most likely fail AC-11 or AC-12 by chance. This rule was written by the previous revision in response to R-2 F-01, which fixed the different-statistics problem but not the noise.
PROPOSAL: Replace the per-label count comparison with a rule an unchanged reviewer passes with high probability, for example: a label fails only when the new brief raises it at its minimum severity in none of six runs while the old brief raised it in at least two, plus an aggregate check per route that total new hits across labels are at least the old total minus a stated margin. State the rule's chance of failing an unchanged reviewer next to it.

FINDING: F-02
KIND: judgement
SEVERITY: blocking
WHERE: Acceptance Criteria AC-13 ("each new-brief clean document resolves every label the old brief raised"); Test Plan AC-13 row; Design (Replay harness, labels.md minimum severity; step 2; Scoped re-review); Context Owner summary (rounds paragraph)
EVIDENCE: AC-13 needs every label "the old brief raised" to be resolved in each new-brief clean document. It does not say whether that means labels raised in the old first passes (three or six per route) or in the old loop. Either way, a correct implementation can fail it. First, the new brief runs one loop per case and route, so its single first pass misses an intermittent should-fix label with probability 1-p (0.33 at p=0.67). After that, every pass is scoped and reports only blocking findings outside the diff (Design, Scoped re-review), so that label is never raised again and never resolved. Second, Design lets the owner set a label's minimum severity to nit, so it "may correctly come back as nit". A nit raised in a pass whose blocking and should-fix findings leave the baseline unchanged is listed and not applied under the nit rule (conventions/feature-documents.md:219-227 at 0c983f67), and owner-list triage may only count it, so the clean document does not resolve it. With many labels, AC-13 fails a correct implementation almost surely. This clause was added by the previous revision.
PROPOSAL: Define the set as labels the old loop on the same case and route raised at should-fix or above, exclude labels whose owner minimum is nit, and judge resolution as a total across the four loop pairs with a stated margin, rather than requiring every label in every new clean document.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-03 row (S17.limit); Acceptance Criteria AC-03; Design (Stated limit; Scoped re-review)
EVIDENCE: S17.limit's pass condition is the absence of any finding naming `names.log` concurrency, on a scoped pass where only the `Not handled:` line is in the diff. Three other things also produce that absence. The section that describes the unlocked writes is unchanged, so it is outside scope, where the reviewer reports only blocking findings. The limit's reason, "single-user tool", may lead a profile-weighing reviewer to rate the gap nit or drop it. And no fixture profile is named for the case. The row has no control showing the same reviewer raises the gap when the limit line is absent, so a reviewer that ignores stated limits passes. The previous revision moved the limit "inside the scoped diff" in response to R-2 F-15, which asked for a set-up where only limit honouring could suppress the finding.
PROPOSAL: Run S17.limit as a full pass (for example, with the R-1 row's commit not an ancestor of X), name a profile under which the gap is should-fix, and add a control run without the `Not handled:` line that must raise the `names.log` gap.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-04 row (S17.profile, third run); Acceptance Criteria AC-04 ("without one judges as for production software with users"); Design (Product profile, "Without a profile, the reviewer judges as for production software with users whose data matters")
EVIDENCE: The no-profile run passes when the lock gap is "no lower than with the first", and the first run passes with "nit or absent". A reviewer that treats a missing profile as a single-user tool rates both runs nit or absent and passes, although AC-04 and Design require the production default. The second clause of AC-04 therefore has no check that a wrong implementation fails.
PROPOSAL: Make the no-profile pass condition match the production default, for example should-fix or blocking, as for the hosted profile, or at least strictly above the first run's rating.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-05 row (S17.scoped and S17.scoped-command pass condition)
EVIDENCE: The pass condition says "findings name only the changed paragraph or sections that state its terms" and also "an unchanged seeded security defect is still raised as blocking". The security finding names an unchanged section, so a check written to the first clause fails the correct behavior the second clause requires. Two people writing the scenario checks would code this differently.
PROPOSAL: Say "apart from blocking findings, findings name only the changed paragraph or sections that state its terms".

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Open Questions and owner lists, third paragraph: "with a count of the rest and where the full list is. The report keeps the full list"); Design (Glossary, Owner-list triage); Acceptance Criteria AC-07; Test Plan AC-07, AC-08 rows; Context Owner summary (last bullet)
EVIDENCE: The spec skill's report (SKILL.md:189-193) and its owner-facing summary (SKILL.md:152-172) are both the final conversation reply, and the convention keeps unapplied nits out of the document (conventions/feature-documents.md:222-225). Nothing says where "the full list" lives so the summary can point at it. S17.nits passes when "the final reply shows the two ... and the report lists all eight", which cannot both hold if the report is in the final reply. One implementer writes the list to a file, another puts it lower in the same reply. The row also does not say where the six citation slips sit or whether the pass has baseline-changing findings. A Context slip may be applied at any time, and the nit rule applies every nit when blocking or should-fix findings change the baseline, so the six may not end up unapplied. The two widening nits need a Test Plan pattern row that has already passed review, which needs a seeded earlier clean pass.
PROPOSAL: Name the location of the full list, for example a labelled section at the end of the same reply or a named file outside the document, and make S17.nits check that location. Seed the six slips in the normative baseline of a pass with no blocking or should-fix finding, and seed the earlier clean pass the widening nits need.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Scoped re-review, first paragraph: "a docs pin file (`AGENTS.md`, `knowledge.md`) changed between the two commits"); Acceptance Criteria AC-05 ("or the docs pin changed"); Test Plan AC-05 row ("with a changed pin file"); Context Owner summary ("A pass is full again when covered code or the docs pin changed")
EVIDENCE: `knowledge.md` exists only in this repository, as plugins/vh-adlc/knowledge.md, and the command gives no path for it. A repository without its own pin resolves the plugin pin (internal/knowledge/knowledge.go:178-179), so its resolved docs revision changes with a plugin upgrade, while no file in the repository changes between the two reviewed commits. The Review Log row records no docs revision, so `review-scope` cannot detect the change. A pinless adopter that upgrades the plugin between passes then gets a scoped pass under new convention text, which AC-05 says should be full.
PROPOSAL: Either record or pass the previous pass's docs revision and plugin version so `review-scope` can compare them, or state the pinless upgrade case as a limit in Scope and narrow AC-05's "docs pin changed" to a repository pin file, naming its paths.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, case.yaml fields; labels.md approval line; "so the rules cannot be fitted to them"); Acceptance Criteria AC-10, AC-11, AC-12, AC-13; Test Plan AC-10, AC-11 rows
EVIDENCE: The approval digest covers only labels.md. case.yaml holds the profile text, which X' commits into `AGENTS.md` and which decides new-brief severity under severity by consequence. It also holds X and the document path. None of these is approved or digested, so the profile can be rewritten after the first runs until retention and rounds pass. That is the same fitting the label approval exists to prevent.
PROPOSAL: Put the profile text, X and the document path inside the approved, digested material, either in labels.md above the approval line or in a digest of case.yaml, and have the harness refuse a case whose digest does not match.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, terms paragraph; "Cases are named "enterprise" and "small application", with no repository or product names"); Acceptance Criteria AC-10; Test Plan AC-10 row; Review Log R-2 F-01 EVIDENCE
EVIDENCE: `gh api repos/michielvha/vh-adlc` reports `"visibility": "public"`. `git grep -i` for the enterprise case's repository name in docs/specs/proportional-review.md at 98e792ad matches line 567, the stored R-2 F-01 EVIDENCE, which names that repository as the enterprise case's source. The terms check greps only the vh-adlc feature branch diff and the companion branch diff. This document is committed on the default branch before the feature branch exists, so the check passes while the public repository already names the case. Records are stored verbatim, so the author cannot edit that line away.
PROPOSAL: Have the terms check grep the whole public tree at the feature head as well as both diffs, and decide in the document how to treat the existing exposure, either an owner decision that the repository name is not private or a different enterprise case.

FINDING: F-10
KIND: factual
SEVERITY: should-fix
WHERE: Design (Scoped re-review); Scope (re-review scope bullet naming `references/review-protocol.md`)
EVIDENCE: plugins/vh-adlc/references/review-protocol.md (Independence) says "A dispatch never tells the reviewer to skip a check or to judge from stored results instead of running it." A scoped dispatch tells the reviewer to report only blocking findings outside the diff. The document lists review-protocol.md as changing but does not say this sentence is amended, so a host following the protocol as written may refuse to pass the scope, and two implementers would treat the sentence differently.
PROPOSAL: State that the sentence gains an exception for the scope `review-scope` computes on a resolved convention that defines scoped re-review, and pin the new wording in tests/vh-adlc/proportional-review.test.ts.

FINDING: F-11
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, brief definitions "the plugin on main at the feature's merge base, at the companion PR's parent docs revision" and "the feature branch, at the companion docs revision"; results.md contents); Scope (pin bump to the companion revision); Acceptance Criteria AC-01, AC-09, AC-11, AC-12, AC-13; Test Plan AC-11, AC-12, AC-13 rows
EVIDENCE: The feature's merge base moves whenever the feature branch merges the default branch, which SKILL.md:90-96 requires on drift, so the old brief can change between the first passes and the loops. vhco-pro/docs allows merge, squash and rebase merges (`gh api repos/vhco-pro/docs`), and merged PR #56 has head c3a6ac83 but merge commit 68fd1c9e. So "the companion revision" may be the PR head the replays ran on or a different main commit the pin names. results.md records only counts, with no plugin commits, docs revisions or models, so the implementation reviewer cannot tell which briefs produced them.
PROPOSAL: Fix both briefs' plugin commits and docs revisions before the first run and record them, with the models, in results.md for every run. Define the companion revision as the commit the pin will name, and have the harness check that the new brief ran at that convention text.

FINDING: F-12
KIND: factual
SEVERITY: nit
WHERE: frontmatter covers; Design (Tests that change); Test Plan AC-08 row ("on a fixture pinned to `0c983f67`")
EVIDENCE: tests/vh-adlc/fixtures/build.ts `buildDocs` builds revision A from the plugin pin in knowledge.md and the previous revision from PREVIOUS_DOCS_PIN d8f07c9d (lines 115-156). No fixture revision holds the 0c983f67 tree, so the AC-08 controls need a build.ts change, and covers does not list that file. `scriptedPlugin` reads canned records only from evidence/review-convergence/canned (tests/vh-adlc/scenarios/run.ts:1114-1120), so it also needs a change for the new canned directory. covers lists tests/vh-adlc/evidence/proportional-review/canned/ in addition to its parent tests/vh-adlc/evidence/proportional-review/.
PROPOSAL: Add tests/vh-adlc/fixtures/build.ts to covers, name the build.ts and scriptedPlugin changes in Tests that change, and drop the duplicate canned entry.

FINDING: F-13
KIND: factual
SEVERITY: nit
WHERE: Context Owner summary (stated limit bullet; replay paragraph; "Every change is gated on the resolved convention")
EVIDENCE: The summary does not mention that a stated limit excluding a case the goal, a criterion or Scope names is an Open Question (Design, Stated limit), or that AC-13 also requires each new clean document to resolve the old brief's labels. "Every change is gated" sits beside Design's "The scope fields are passed on every pin", and the review-scope command and vh-adlc's own profile are not gated.
PROPOSAL: Add the limit exception and AC-13's resolution condition to the summary, and say that only behavior changes are gated while the scope fields are always passed.

### R-4

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-05 ("or the docs pin changed"); Scope (Out of scope, "Not handled: a repository without its own pin whose plugin upgrade moves the resolved docs revision ... (R-3 F-07)"); Design (Scoped re-review, "The pinless upgrade case is a stated limit in Scope"); Context Owner summary (re-review bullet, "the repository's docs pin"); Test Plan AC-05 row ("with a changed pin file")
EVIDENCE: AC-05 still says "the pass is full when there is no previous spec review or covered code or the docs pin changed". For a repository without its own pin, the resolved docs pin is the plugin pin (internal/knowledge/knowledge.go:179 returns `Source: "plugin"` with `pluginPin`). The new Scope line says that repository gets a scoped pass after the pin moves, so the limit excludes a case AC-05 names. In response to R-3 F-07 the previous revision added the limit and changed the summary to "the repository's docs pin", but it left AC-05's wording, which R-3 F-07 asked to narrow. Design's own Stated limit rule says a limit that excludes a case a criterion names is an Open Question. The resolved convention at 0c983f67 (conventions/feature-documents.md:165-166) also makes every trade-off the document settles an Open Question. The document records no owner decision for this limit: Open Questions is "None." and the summary does not mention it. An implementation reviewer reading AC-05 literally would rule it not met for the pinless upgrade case.
PROPOSAL: Narrow AC-05 to "a repository pin file (the `pin_files` that `vh-adlc knowledge` reports) changed". Then either record the owner's decision on the pinless limit in the summary or raise it as an Open Question.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, Retention and Aggregate paragraphs); Acceptance Criteria AC-11, AC-12; Test Plan AC-11, AC-12 rows; Context Owner summary (replay paragraph, "Per route, the new rules' average hits per run must also stay within 15 percent")
EVIDENCE: I computed both rules for a reviewer whose hit rates do not change (python3, exact binomial sums). The per-label figure is right: the maximum is 0.87 percent, at p=0.137. The aggregate is right at 10 labels (7.85 percent) but not at 20: it gives 2.55 percent, not "about 2". At 5 labels it gives 17.2 percent per route, which matters because the small application case may have few labels. The document states each figure per check only. AC-11 and AC-12 together need four aggregate checks to pass, one per case and route. At 10 labels per case all four pass with probability 0.72, so a correct implementation fails about 28 percent of the time, before any per-label failures are added. The per-label rule has a confirmation step; the aggregate has none. It is also undefined whether the six confirmation runs count toward the aggregate: with them, 10 labels fail at 6.6 percent instead of 7.85. It is also unstated whether the confirmation runs must raise the label "at or above its minimum severity". Two implementers would compute AC-11 differently. The previous revision introduced both rules after R-3 F-01.
PROPOSAL: Give the aggregate the same confirmation as labels: six more new-brief runs, judged on all twelve. State that confirmation hits count at or above minimum severity. Beside the rules, state the combined chance that an unchanged reviewer fails AC-11 and AC-12, and correct the 20-label figure.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Glossary, Always-blocking defect; Severity by consequence; Stated limit); Context Owner summary (second bullet, "Security, data-loss and tenant-isolation defects stay blocking on every product"); Acceptance Criteria AC-01, AC-03; Test Plan AC-03 row (S17.limit)
EVIDENCE: The glossary defines an always-blocking defect as "A security, data-loss or tenant-isolation defect" and gives no boundary for any of the three classes. S17.limit seeds unlocked concurrent appends to names.log, "under a profile of a shared build host where parallel jobs run the command". It passes only when "no finding names `names.log` concurrency". Unlocked concurrent appends can lose or interleave lines, and a careful reviewer may call that data loss. Under Design's Stated limit, the reviewer then must raise it again as blocking with `EVIDENCE` quoting the limit, which fails S17.limit for a correct implementation. The same boundary decides how much the replay's new brief removes: a reviewer that treats every lost write as data loss keeps the old severity. The previous revision changed the S17.limit profile and limit text in response to R-3 F-03.
PROPOSAL: Define the three classes in the glossary. For example, data loss is loss or corruption of data a user or tenant owns and cannot regenerate. Then either state in the S17.limit seed that names.log is a regenerable diagnostic record, or pick a seed whose consequence is clearly outside the three classes.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, case.yaml `terms` bullet, "The consumer repository's name is public, as the owner decided"; private material paragraph, "Cases are named ... with no repository or product names"); Context Owner summary ("the consumer repository's name is public, its document content is not"); Acceptance Criteria AC-10
EVIDENCE: The owner's public-name decision answers R-3 F-09, which was about the owner's own repository, already named in the stored R-2 F-01 record. The case.yaml rule is written for every case, though. So for the small application case, the second user's repository name is left out of `terms`, and the whole-tree terms grep never stops it from appearing in the public repository. The document mentions the second user's consent only for copying their document and repository to the owner's host ("copied there with their consent"). It mentions no consent to publishing the repository name.
PROPOSAL: Limit the public-name decision to the enterprise case's repository. List the second user's repository name in that case's `terms` unless they consent to publishing it.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-08; Test Plan AC-08 row; Design (Gate on the resolved convention)
EVIDENCE: Design gates every rule on the resolved convention, including reading the product profile and honouring stated limits. AC-08 requires that "the reviewer ... behave as before this feature" on a 0c983f67 pin. Its proof runs old-pin controls of S17.scoped, S17.questions and S17.nits, plus S16.oldpin-reviewer. S16.oldpin-reviewer seeds no profile (tests/vh-adlc/scenarios/run.ts, the `S16.oldpin-reviewer` scenario writes only the names.log seed and the previous pin), so the production default raises the gap either way. A reviewer that reads the profile and weighs severity by it on every pin passes every AC-08 control.
PROPOSAL: Add an old-pin control of S17.profile with the single-user profile. It passes only when the lock gap is still raised, as S16.oldpin-reviewer requires today.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design (Scoped re-review, "one of the repository's pin files (the `pin_files` that `vh-adlc knowledge` reports, such as `AGENTS.md`)" and the command line `review-scope --repo <dir> --document <doc> --commit <X>`)
EVIDENCE: `vh-adlc knowledge` needs `--plugin-pin`, and `pin()` in internal/knowledge/knowledge.go reads the bridge files from the working tree. The bridge files are `.github/copilot-instructions.md`, `AGENTS.md` and `CLAUDE.md` (:35). The stated command takes no binary or plugin pin, and pin files read from the working tree cannot show a pin removed between the two reviewed commits. Running `knowledge` at e94e00e7 reports `"pin_files":["AGENTS.md"]`.
PROPOSAL: Have `review-scope` compare the three bridge files between the two commits, or add the binary and plugin pin options to its command line.
