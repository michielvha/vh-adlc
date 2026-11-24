---
status: complete
status_description: "Complete on feat/proportional-review: all 17 criteria met at implementation review R-30. Where both rule sets converge (the Claude route) spec reviews fell from 44 to 10 and body growth from 972 to 343 lines; the Codex question (D-19) and two known losses (D-17, D-18) wait for the follow-up review after merge."
branch: feat/proportional-review
issue: null
goal: "Spec review weighs every finding against the product the project describes, so a document reaches a clean pass in far fewer rounds where both rule sets converge, with fewer owner questions and less scope growth, while every real defect the current review raises is still raised, apart from any the owner defers as a known loss, and every deferred item is judged once the feature is merged."
covers:
  - plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md
  - plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md
  - plugins/vh-adlc/scripts/labels/
  - tests/vh-adlc/labels/
  - plugins/vh-adlc/references/issues.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/references/review-protocol.md
  - plugins/vh-adlc/scripts/loop/cli.ts
  - plugins/vh-adlc/scripts/loop/review-scope.ts
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
  - tests/vh-adlc/author-extras.test.ts
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/fixtures.test.ts
  - tests/vh-adlc/scenarios/gh-stub.ts
  - tests/vh-adlc/evidence/claude-code/S17.*
  - tests/vh-adlc/evidence/claude-code/S16.oldpin-reviewer.md
---

# Plan: Proportional review

Spec review rates findings by what they would do to the product the project says it is, accepts a
stated limit as an answer, and re-reviews only what changed. Whatever a spec defers is recorded in one
line and judged after merge, against what was built. A replay of real documents proves that no real
defect the current review raises is lost.

## Context

### Owner summary

Spec reviews take too many rounds, send the owner too many questions and keep growing scope. In this
repository the stored reviews hold 2,673 findings, and their proposals ask to add more than six times as
often as to cut. Review depth is the same for a multi-tenant platform and a small personal application.

The feature changes the rules at their source, in the shared convention, the reviewer and the spec,
ship and resume skills:

- Each project states a `## Product profile` in `AGENTS.md`. A false fact, an unmeetable criterion or a
  broken proof keeps its severity; a failure path is blocking or should-fix only when someone using that product would plausibly hit it,
and one the reviewer is unsure about is rated should-fix rather than dropped. Security, data-loss and tenant-isolation defects stay blocking always.
- The author may answer a finding with a stated limit in Scope, unless it excludes a case the goal, a
  criterion or Scope names. Later passes do not raise it again unless it leaves one of those three
  defects, an unmeetable criterion or an unsolved problem.
- After the first pass, one loop command hands the reviewer the diff since the previous pass, on both
  routes, and outside it only blocking findings are reported. A pass is full again when a covered path
  or a docs pin bridge file changed. Accepted limit: a repository without its own pin gets one scoped pass
  after a plugin upgrade moves its docs revision.
- Open Questions only where the owner could plausibly choose differently. The spec summary shows only
  the nits the owner's recorded rules do not settle; the full list follows at the end of the reply.
- Every deferral (stated limit, owner cut, author cut, finding deferred at acceptance, drift re-review
  deferral) is one line in a `## Deferred` section. Editing it never makes a review stale, and an entry
  answers its finding the way a stated limit does. Every owner-directed deferral gets a cut check: nothing
  important lost, or the important item becomes a question.
- Once the feature's PR is merged, ship's follow-up review judges each deferred item against the built
  feature as drop, follow-up or gap. The owner sees gaps and follow-ups with drafted issues and the drops
  one line each. One approval covers filing the chosen issues and opening a short docs PR with the
  verdicts. The ship report and resume flag a merged feature with pending items. Accepted limit: two
  sessions running the review on one feature at the same time can file an issue twice.

Behavior changes are gated on the resolved convention: repositories with their own older pin keep
today's behavior, pinless ones take the new rules with the plugin upgrade. It builds on
[PR #152](https://github.com/michielvha/vh-adlc/pull/152) and
[#141](https://github.com/michielvha/vh-adlc/issues/141) (PR #155), both merged; it is the first step of
[#52](https://github.com/michielvha/vh-adlc/issues/52).

Product quality is a hard constraint, proved by replay on one enterprise and one small application
document, on the Codex and Claude routes. The owner approves the labels, profile and case before the
first rule-editing commit. A labelled defect fails if the old rules raised it at or above the owner's minimum severity in
two of three runs and the new rules miss it in all twelve at that severity, or if the old rules raised it in
two of three runs but fewer than two at that severity and the new rules miss it in all twelve at any severity. Full loops under a scripted owner must
then need at most half the old total of reviews over the pairs where both loops reached a clean pass, with
every other pair reported as measured, and at most half the old total of body growth over the pairs whose old loop
reached a clean pass with stored documents (expected to be the two Claude-route pairs, since both Codex-route old loops lost their documents; with no
qualifying pair, AC-17 is not met); the question rule is proved by scenario,
not counted in the loops (owner, 2026-11-23). After the first complete enterprise result, the owner allowed
one generic reviewer fix, and every new-rules run repeats on the fixed plugin. Case material
stays private. The owner's repository name is public, and the owner accepts that stored review records
name its candidate documents with counts; the second user's repository name stays private unless they
agree.
Validation so far: every task is done with observed evidence (unit tests, the S17 scenarios, including the rerun on the fixed reviewer, and the pin bump). The replays on the fixed reviewer are complete apart from the enterprise case's Codex loop. On that case two real defects are lost, each on one route: label L-08 on the Claude route, a should-fix gap the old brief raised in two of three passes and the new brief in none of twelve, and that the Codex route raises under neither brief; and label L-10 on the Codex route, a should-fix gap the old brief raised in two of three passes and the new brief in none of twelve, and that the new brief still raises on the Claude route. The owner deferred them as D-17 and D-18 (2026-11-24). On the Claude route both rule sets' loops reached a clean pass on both cases, and the new rules needed 10 spec reviews against 44. On the Codex route the new rules reached a clean pass on the small application case in 15, where the old loop was lost unclean at 19 or more, and the enterprise loop stopped at Codex's usage limit after 25, unclean, with as many blocking findings per round as the old loop had over the same rounds. The owner deferred the Codex question as D-19 (2026-11-24). Every task is done (T1 to T30), and the implementation review is the remaining step before ship.

The R-9 acceptance covered what the owner added after R-5: the Deferred section, the cut check, the
follow-up review (judged after merge, because the spec rests on assumptions the built feature tests) and
scope growth as a pass condition. R-5's deferred findings are this document's first Deferred entries. This
revision, after that acceptance, drops the Open Question count from the replay loops, records the one
owner-allowed reviewer fix and the new-brief reruns it needs, builds the replay results from the stored private runs continuing same-identity sets, keeping loop clones so a crash resumes, a launch record for the sets stored before that (owner decision, 2026-11-23), and lower bounds for the two old loops lost to an expired login (owner decision, 2026-11-24), adds a scenario for an uncertain
failure path, counts both briefs at the same severity bar for retention, records L-08 and L-10 as deferred known losses, applies the halving bar for spec reviews to the pairs where both loops reached a clean pass, and counts a new loop stopped by its route's usage limit from its kept clone (owner decisions, 2026-11-24). The companion convention is merged and the
pin bump is done (T21); shipping still needs the usual approvals.

### Background

**Harm and simplest alternative.** The harm: every vh-adlc user pays for each spec in owner attention and
elapsed time, on every feature, and it does not heal; dozens of rounds per document are common in the counts below. The simplest alternative without machinery is a process rule alone ("prefer removing",
"revisit the previous change"), which `spec-review-convergence` added (`SKILL.md:114-117` at `915441e8`; `SKILL.md:129-137` now); 69 and 15
review rounds after its merge show it did not stop the churn. This feature is mostly rule text too. Its
machinery is the `review-scope` command, a `follow-up` mode of the labels helper, the follow-up review's
issue filing and verdict commit, and the replay harness with its growth measure. The replay exists
because a wording test cannot show the rules keep quality. Filing an issue at each deferral is the simpler
alternative to the follow-up review, and it loses: it judges usefulness on the spec's assumptions and
files issues for items the built feature turns out not to need, which is why the owner chose to judge
after merge.

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
use scripted records (`scriptedPlugin`, `:1114-1122`); the replay below reuses that pattern on real
documents.

The owner set the constraints in this request: fix over-reach in the instructions rather than by filtering
findings, keep product quality, prove it by replaying real documents (one enterprise, one small
application), and cite only public evidence because the investigation behind it summarizes private
sessions.


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
- Deferred items: an optional `## Deferred` section in the convention, outside the normative baseline;
  the spec skill records every deferral there and runs the cut check; the reviewer raises nothing on it
  apart from the always-blocking exception.
- The follow-up review in the ship skill after the feature's PR merges; a `follow-up` mode of the labels
  helper (`scripts/labels/`, `references/issues.md`); the authority for its issues and verdict commit
  (`references/authority.md`); and a line in the ship report and the resume skill for a merged complete
  document with pending Deferred entries.
- vh-adlc's own `## Product profile` in `AGENTS.md`, the docs pin bump in `AGENTS.md` and
  `plugins/vh-adlc/knowledge.md` to the companion revision, and the plugin version.
- The user guides (`docs/user-guides/workflows.md`, `docs/get-started/first-feature.md`), the scenarios
  and the tests that pin the changed text.
- A replay harness under `tests/vh-adlc/replay/`, the two replay cases run through it, and published
  counts under `tests/vh-adlc/evidence/proportional-review/`, including document body size per pass.

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
- Not handled: a full pass for a repository without its own pin when a plugin upgrade moves its docs
  revision between two passes, because no file in the repository changes and the next covered or pin
  change makes the pass full again (R-3 F-07).
- Not handled: two sessions running the follow-up review on one feature at the same time, because both
  would list issues before either files and the owner approves each batch in session (R-8 F-02).
- Changing the complete `docs/specs/spec-review-convergence.md`: it stays complete, and its test keeps
  proving its text at `0c983f67`.
- Calibrating the reviewer's precision over time.
- Not handled: a set stored before T25 that two launches wrote, because none was and a run that continues
  such a set records its identity first (R-15 F-01).
- Counting the Open Questions the author raises in the replay loops: a headless session settles a question
  before it commits, so a commit-based count reads zero, and rerunning every old-brief loop to count them
  another way costs about a day. The plausible-choice rule is proved by `S17.questions` (owner cut on
  2026-11-23).
- A binary step for the follow-up review: the rules block and `vh-adlc next` do not change, so the review
  runs from ship, not from `next`.
- Filing follow-up issues without the owner's approval; a standing authority for that is part of the
  second, smaller change.

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
| Scoped re-review | A spec review after the first that covers the document diff since the previous spec review and every section that states a rule, ID or term the diff changes, and reports only blocking findings outside that. |
| Owner's recorded rules | The product profile plus the instruction files and project procedure that `bun scripts/loop/cli.ts context` lists. |
| Plausible-choice rule | An Open Question is raised only where the owner could plausibly choose differently; the author settles every other choice and records it in Design. |
| Deferred list | The optional `## Deferred` section of a feature document, outside the normative baseline: one `D-<nn>` line per deferred item, its source and its verdict. |
| Cut check | One line in the author's reply after every owner-directed deferral: nothing important lost, or the items that are always-blocking defects or that the goal or a criterion names, which become Open Questions. |
| Follow-up review | The ship step after the feature's PR merges that gives every pending deferred item a verdict of drop, follow-up or gap against the merged feature. |
| Owner-list triage | The spec skill's owner-facing summary shows only the unapplied nits the owner's recorded rules do not settle, with a count of the rest, and the full list follows in an `All unapplied nits` section at the end of the same reply. |

The convention uses every term above except Cut check and Follow-up review, which are plugin procedures.
The reviewer, the skills and both user guides use these terms with these meanings.

### Gate on the resolved convention

Every rule below applies when the resolved `conventions/feature-documents.md` states severity by
consequence: its Review log section names the product profile as the context for severity. On an older pin
(such as `0c983f67`) the reviewer and the spec skill keep today's behavior: full passes, today's
severity, every unapplied nit in the owner summary, judgement findings to Open Questions, no Deferred
section, no cut check, and no follow-up review in ship or resume. This is the pattern the nit rule uses
today (`SKILL.md:140-149`). The scope fields are passed on every pin; on an
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

The reviewer's failure-mode paragraph (`vh-adlc-reviewer.agent.md:55-68`) keeps asking the same four
questions and rates each gap on this scale, replacing "A path the document leaves undefined is a finding".
Two reviewer rules apply the scale. Before settling any finding's severity, the reviewer checks it against
the always-blocking classes, and a finding in one of them is blocking whichever section or path it came
from. The reviewer's restatement names cases inside the glossary classes: forging or bypassing an
authorization is acting beyond it, reaching a credential is exposing it, and silently dropping data is
losing it. When the reviewer is unsure whether people using the product would hit a failure path, it rates
it should-fix rather than nit or dropping it. The harm-statement findings from PR #152 keep their severity.

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
establish in this pass" becomes "within this pass's scope" (`vh-adlc-reviewer.agent.md:79`). The
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

The spec skill follows. Author mode (`SKILL.md:84-87`) raises a judgement call only under that rule.
Review mode step 4 (`:125-133`) resolves a judgement finding within the recorded rules and raises a
question only under the same rule, including the remove-or-add choice ("where they behave differently,
the choice is an Open Question recommending removal"). #141 lands first and lets the author cut an extra
it added without a question; that exception stays, and this rule covers the rest of step 4.

Owner-list triage applies to the spec skill only: its owner-facing summary shows the unapplied nits the
owner's recorded rules do not settle, with a count of the rest. The full list follows in a section headed
`All unapplied nits` at the end of the same reply, which keeps the report complete. The convention's nit
paragraph changes to allow this.

### Deferred items

The convention adds an optional `## Deferred` section after Open Questions and before Review Log. It is
outside the normative baseline, so adding or editing an entry never makes a review stale. Each entry is
one line, `- D-<nn>: <the item>. From: <source>. Verdict: pending.`, where the source is exactly one of:

- `R-<n> F-<nn>, stated limit` for a stated limit the author adds (the Scope line stays the normative
  statement);
- `R-<n> F-<nn>, deferred at acceptance` for a finding the owner defers when accepting;
- `owner cut on <date>` for an item an owner-directed cut removes;
- `author cut` for an extra the author removes under #141, whose Outcome-cell record (`removed author
  extra: ...`) stays in that pass's Review Log row beside the entry;
- `drift re-review R-<n>` for extra work the owner defers in a drift re-review (`SKILL.md:203-206`).

IDs are never reused. An entry answers its finding the way a stated limit does: the reviewer reads the
section and does not raise the entry's substance again, unless it leaves an always-blocking defect, makes
a criterion unmeetable or leaves the stated problem unsolved; then it is blocking against Scope and its
`EVIDENCE` quotes the entry.

### Cut check

Every owner-directed deferral gets the check: a cut in session, a proportionality answer of "narrow", a
finding deferred at acceptance, and extra work deferred in a drift re-review. The author checks every item
before recording it. An item that is an always-blocking defect,
or that the goal or a criterion names, is not dropped: it becomes an Open Question (keep it, or drop it
knowingly as a stated limit). Every other item gets a Deferred entry. The author's reply carries one line,
`Cut check: nothing important lost (D-<a> to D-<b> recorded).`, or names the items it turned into
questions and why. A deferral at acceptance that the check turns into a question holds the acceptance
until the owner answers it. The check judges importance only; usefulness waits for the follow-up review.

### Follow-up review after merge

The follow-up review needs only the merged code, so it runs once the feature's PR is merged, whatever
`cli.ts delivery` reports (delivered, no publication path, manual, blocked or failed;
`scripts/loop/delivery.ts:66-80`). A document is `complete` before its PR merges (ship sets it in its
Gate step), so every trigger keys on the merge: the feature's PR is merged, or the `complete` document is
on the default branch. Ship runs the review right after an authorized merge it performed. For a merge done
elsewhere, the ship report on a merged feature ends with the count of pending Deferred entries, and the
resume skill, finding a merged `complete` document with pending entries, reports them and names the step.
Invoking ship on a merged complete document runs only this step; on a complete document whose PR is not
merged, ship keeps its normal delivery path. The binary is unchanged.

For each pending entry the session inspects the tree at the merge commit and gives one verdict with one
line of reason:

- drop: no user of the merged feature needs it now or later, or the merged feature already covers it;
- follow-up: a user would benefit from it later, and the merged feature works without it;
- gap: a user of the merged feature hits its absence now.

The reply shows gaps first, then follow-ups, each with an issue preview, then the drops one line each.
Drops are recorded without approval. The owner approves, in one answer, which follow-ups and gaps to file.

Filing uses a new labels helper mode, `bun scripts/labels/cli.ts file --operation follow-up --type <type
label>`, with the repository's mapped feature type for a follow-up and its bug type for a gap, no state
label, and no change to any feature's ownership or issue aliases. `references/issues.md` gives ship this
filing role. Each issue body ends with `Deferred: <document path> D-<nn>`. Before filing an entry, the
session lists the repository's issues (`gh issue list --state all`, not the search index) and records an
existing issue whose body ends with that line instead of filing again.

The verdicts land through the normal delivery path. The session makes a temporary worktree on a new
branch `docs/follow-up-<slug>` from the remote default branch, and writes every verdict into the
document's Deferred section there, each issue link right after that issue is created. It then makes one
documentation-only commit, pushes the branch, opens a PR and removes the temporary worktree; it never
merges. If an issue creation fails, it still commits and pushes what it recorded, reports the step as
partial, and stops. A rerun asks the owner again for the entries still pending and adds its commit to the
same branch and PR. The owner's approval covers creating the approved issues, that branch, its push and
the PR; `references/authority.md` adds this to ship's authority.

The feature is merged, so its writing is over: the follow-up review edits only the Deferred section, on
its own branch, and needs no feature writer entry or handoff. Two sessions running it on one feature at
once is a stated limit in Scope.

Each entry's `Verdict:` reads `drop, <reason>`, `follow-up <issue link>`, `gap <issue link>`,
`follow-up, not filed (owner declined)` or `gap, not filed (owner declined)`.

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
not match. The one exception is the owner's decision of 2026-11-23: after the first complete replay result, the
enterprise case on the Claude route, showed three always-blocking defects raised only at should-fix and one
plausible failure path dropped, the owner allowed one generic reviewer fix, commit `ef685da1` (check every
finding against the always-blocking classes, and never drop an uncertain failure path). The new brief then moves to the fixed plugin, plugin commit `ef685da1` with the companion head, and every
new-brief run repeats on it; the old-brief runs stay valid because the old brief does not change.

Before any new-brief run, the harness greps the whole vh-adlc tree at the feature head and the companion
branch's diff (from a local `vhco-pro/docs` checkout passed as an option) for every entry in `terms` and
records only pass or fail; a hit stops the run. The grep skips the stored review records under `### R-<n>`
in feature documents, which stay verbatim: the owner accepts that they name the enterprise candidate
documents with counts, and no document content. The implementation review dispatch tells the reviewer to
cite case material only by label ID, count and digest, and the harness runs the terms check again on this
document and the results file before an implementation review is stored and before ship.

Both briefs are fixed before the first run, apart from that one owner-allowed move of the new brief: old is the plugin at the feature branch's merge base at that
moment, with the companion PR's parent docs revision; new is the feature head at that moment, with the
companion head. The harness records both plugin commits, both docs revisions and the model of every run
in the results. Before the pin bump, it checks that every page the reviewer and the spec skill read is
byte-identical at the companion head and at the commit the pin will name; if not, the new-brief runs are
repeated at the pinned commit. For each brief, the harness makes a throwaway
clone at X and commits X' on top, holding the profile in `AGENTS.md`, the brief's docs pin and the
`.vh-adlc/loop.yaml` route settings for the route under test, because the command route reads its policy
and its export from the reviewed commit (`scripts/loop/cli.ts:181-182`). Before counting a run it checks
that the route and model the run reports are the ones under test. It runs:

1. First passes: a spec review on each route, three times with the old brief and six with the new, the Codex command route
   (`references/loop-settings.md`, `route: command`) and the Claude host route, through the scenario
   harness's session runner (`tests/vh-adlc/scenarios/run.ts`) and the `review` command.
2. A full loop on each route, from X' until a clean pass, with a scripted owner that adopts each Open
   Question's recommendation and answers the convergence trigger with "keep going". A clean pass is a
   spec review with no blocking finding whose handling leaves the normative baseline unchanged and no
   Open Question, so `vh-adlc gate planned` at that commit fails only on `accepted`. The loop counts spec
   reviews up to and including that pass. A loop stops at 60
   spec reviews and then counts as 60.

Both briefs use the same route settings and models. The one change allowed during the replay is how the
command route hands Codex its prompt: from 2026-11-24 it reads the same prompt bytes from the prompt file on
standard input instead of from one argument, because a scoped re-review's diff passed Linux's 128 KiB limit on
one argument; a resumed loop clone takes that change as a commit. A run that fails to execute is recorded as failed and
rerun; it never counts as a pass. An independent agent matches findings to labels from `labels.md` and the
stored records, and its verdicts are stored beside each run. Every counted pass, its verdicts and every
loop's documents are stored in the case directory as they finish, and the results are assembled from those
stored runs, so a run that stops loses no finished pass. A stored set is one part (first passes or loop) of one brief on one route, and it records its plugin
commit, docs revision and model in `runs/<brief>-<route>-<part>.identity.json`. A run continues a stored
set whose identity matches its own, running only the passes the set still lacks, and starts a fresh set
when the identity differs: the earlier files of that part, with its identity, move to `runs-superseded/`,
so a set never mixes two briefs. A loop works in a clone kept in the case directory, which belongs to its set: a loop that fails is resumed
from that clone by the next attempt under the same identity and loses no finished review, the clone is
removed once the loop finishes, and it moves aside with its set when a fresh set starts. A new-brief-only run and `assemble` use a stored set only when its identity matches the
current brief, route and model, and refuse otherwise; `assemble` reads only current sets, never
`runs-superseded/`. Sets stored before T25 have no identity file: `runs/launch-record.json` in the case
directory gives each such set one entry with its brief, route, part, plugin commit, docs revision, model,
the launching process ID and command line, and the files it wrote, and the harness counts only the listed
files and refuses any other run file of that set. A run continues such a set only when it holds no unlisted run
file; otherwise the run starts a fresh set. Once a part's identity file is written, it alone governs that
part. Each listed
set was written by one launch; the owner accepted this record on 2026-11-23. Moving the new brief therefore
reruns only the new brief.

An old-brief loop that stopped before a clean pass counts the spec reviews it recorded as a lower bound on
its total, marked as not clean. When such a loop lost its documents, its reviews are counted from the reviewer's session logs within its
launch's window, for the document and the old docs revision: the reviewed commits in time order, less the
first ones that belong to the launch's old-brief first-pass executions (every execution that reached the
reviewer, not only the counted ones), with each remaining distinct commit counted once and the total capped
at 60. The launch record and the logs show that each such launch ran its loop once, so no restarted attempt
is summed in. The bound is recorded in `runs/old-<route>-loop.bound.json`, part of its set's record like the identity
file and never a run file a launch-record entry lists, with the window, the first-pass
executions it set aside and the commits it counted (owner decision, 2026-11-24, for the two Codex-route old
loops lost when the session's login expired). A loop set that holds such a bound counts as finished: runs and
`assemble` keep it and never run that loop again.

A new-brief loop stopped by its route's usage limit keeps its clone, so its bound is counted from the clone
instead: the spec rows in the document's Review Log, acceptance rows aside, at the clone's head less those at
its X', capped at 60 (owner decision, 2026-11-24). `run.ts bound --from-clone` records the count, the clone's
head and X' and the source in `runs/new-<route>-loop.bound.json`. Such a bound does not finish its set: a
later run under the same identity resumes the kept clone, and once the loop stores its documents, the bound
moves to `runs-superseded/`. Either kind of bound is part of its set's record like the identity file, so it
moves aside with its set when a fresh set starts.

Retention, per label and route: a label fails when at least two of the three old-brief first passes raise
it at or above its minimum severity, and none of the six new-brief first passes raises it at or above its
minimum severity. Both briefs meet the same bar (owner decision, 2026-11-24): a reviewer that rates a
defect below its minimum under both briefs has not lost it to the new rules. A label that at least two of
the three old-brief passes raise at any severity, but fewer than two at or above its minimum, fails instead
when none of the six new-brief first passes raises it at any severity, because then the new rules dropped it. A failing label gets six more new-brief first passes and fails only if none of the twelve meets the bar it
failed: its minimum severity under the first condition, any severity under the second. For a reviewer whose hit rate is unchanged, a label fails with probability at most 0.9 percent (at a
per-run hit rate near 0.14; computed exactly over the binomial outcomes). A label that fewer than two
old-brief passes raise at any severity cannot fail and is reported.
The results show each label's old-brief and new-brief counts at its minimum severity and at any severity.

Rounds: over the case and route pairs where both briefs' loops reached a clean pass, the new-brief loops'
total spec reviews must be at most half the old-brief loops' total (owner decision, 2026-11-24). Every
other pair is reported with its counts, a loop that did not reach a clean pass as a lower bound: an old loop
lost to the expired login by its recorded bound, and a new loop stopped by its route's usage limit by its
kept-clone bound. There must be at least one pair where both loops reached a clean pass. The
totals name each failing label with its case and route.

Growth: at every pass the harness records the body size, the line count above `## Review Log` without the
`## Deferred` section, so deferring an item is not counted as growth. A loop's growth is the body size at
its clean pass minus the size at X'. Over the case and route pairs whose old-brief loop reached a clean pass and stored its documents, of which
there must be at least one, the new-brief loops' total growth
must be at most half the old-brief loops' total; when the old total is zero or negative, the new total must
be no larger than it.

Private material (case files, labels, records, matcher verdicts, clean documents, transcripts) stays in
the case directory, a private directory on the owner's host outside every public repository. The second
user's document and repository at X are copied there with their consent, so both cases run and are
verified on one host and stay in the replay set for later changes. The implementation review dispatch
names the case directories so the reviewer can inspect them. The harness writes only counts to
`tests/vh-adlc/evidence/proportional-review/results.md`: per case, route and brief, the plugin commit,
docs revision and model of each run, labels raised per run by ID and severity, rounds to clean, body size per pass, execution failures and the terms check.
Cases are named "enterprise" and "small application", with no repository or product names.

The cases:

- Enterprise: from the owner's private multi-tenant platform repository, the feature document with the
  most blocking findings in its original reviews among those with 19 or more non-acceptance spec reviews.
- Small application: the second user's feature document with the most non-acceptance spec reviews.

### Failure, retry and rollback

The review rules change no state at run time; a review interrupted mid-pass stores nothing, as today.
The follow-up review creates issues and a docs PR: each issue link is recorded as soon as it exists and the
`Deferred:` line is matched through the issue list, so a rerun files only what is missing, and nothing is
pushed to the default branch. Documents
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
`tests/vh-adlc/author-extras.test.ts` keeps proving #141's exception and its Review Log record,
`tests/vh-adlc/check.test.ts` moves its Bun-convention check to the wording at the bumped pin, and
`tests/vh-adlc/fixtures.test.ts` checks the fixture's convergence and companion docs revisions.
`S16.oldpin-reviewer` stays: on the old pin the reviewer keeps today's failure-mode check. The S17 canned
records live in `tests/vh-adlc/evidence/proportional-review/canned/`, so `scriptedPlugin`
(`tests/vh-adlc/scenarios/run.ts:1114-1122`) takes the canned directory as a parameter, and
`tests/vh-adlc/fixtures/build.ts` (`buildDocs`) adds a fixture docs revision holding the `0c983f67` tree
for the old-pin controls.

## Acceptance Criteria

- [x] AC-01: The convention at the companion `vhco-pro/docs` revision defines blocking, should-fix and nit
      by consequence for the profiled product as Design states, with always-blocking defects blocking on
      every product.
      Evidence: established by the observed verification recorded on T1, T2 in Tasks.
- [x] AC-02: That convention raises an Open Question only where the owner could plausibly choose
      differently, has the author record every other choice in Design, and offers only options that meet
      the goal in full.
      Evidence: established by the observed verification recorded on T1, T2 in Tasks.
- [x] AC-03: That convention and the reviewer accept a stated limit as an answer to a finding, and the
      reviewer raises its substance again only for an always-blocking defect, an unmeetable criterion or
      an unsolved problem.
      Evidence: established by the observed verification recorded on T1, T2, T6, T13, T26 in Tasks.
- [x] AC-04: The reviewer reads the product profile from `AGENTS.md` at the reviewed commit, rates failure
      paths by it, rates a failure path it is unsure about at should-fix or above, and without a profile
      judges as for production software with users.
      Evidence: established by the observed verification recorded on T6, T8, T13, T26 in Tasks.
- [x] AC-05: On both routes, a spec review after the first receives the scope from `review-scope`, covers
      only the document diff and every section that states a rule, ID or term the diff changes, and
      reports only blocking findings outside
      that; the pass is full when there is no previous spec review or a covered path or a docs pin bridge
      file changed.
      Evidence: established by the observed verification recorded on T3, T4, T5, T6, T13, T26 in Tasks.
- [x] AC-06: The spec skill raises judgement calls and judgement findings as Open Questions only under the
      plausible-choice rule, judged against the product profile and the files loop context lists.
      Evidence: established by the observed verification recorded on T7, T14 in Tasks.
- [x] AC-07: The spec skill's owner-facing summary shows only the unapplied nits the owner's recorded rules
      do not settle, with a count of the rest and where the full list is.
      Evidence: established by the observed verification recorded on T7, T14 in Tasks.
- [x] AC-08: On a repository pinned to `0c983f67`, the reviewer, the spec skill, the owner-facing summary,
      ship and resume behave as before this feature: no Deferred section, no cut check and no follow-up
      review.
      Evidence: established by the observed verification recorded on T6, T7, T11, T12, T17, T18 in Tasks.
      Evidence: R-29 returned not verified: the old-pin control transcripts ran on plugin 2639661, before ef685da1 changed the reviewer; T29 and T30 address it.
      Evidence: after R-29, T29 moved the reviewer fix into the profile-only paragraph and T30 reran the old-pin controls on that reviewer: all pass.
- [x] AC-09: vh-adlc's `AGENTS.md` has a product profile and pins the companion revision, the convention
      uses every glossary term except Cut check and Follow-up review, and the convention and both user
      guides use the terms they contain with the glossary's meanings.
      Evidence: established by the observed verification recorded on T1, T8, T21, T22 in Tasks.
- [x] AC-10: The replay harness runs a case end to end, reuses a stored old-brief set only when its
      recorded identity matches the current old brief and refuses otherwise, keeps every finished pass when it assembles results from stored runs, continues a stored set of the same
      identity and starts a fresh one for a different identity, resumes a failed loop from its kept clone,
      counts a lost loop's recorded lower bound, counts a set stored before T25 only through a matching
      launch record entry that lists its files, refuses a case whose approval line is missing or
      whose digests do not match, stops on a case term in the public tree or the companion diff, counts a
      run only on the route and model under test, records each run's plugin commit, docs revision and
      model, writes nothing but counts and identities to the results file, records failed executions
      without counting them as passes, and runs on a public fixture case in the test suite.
      Evidence: established by the observed verification recorded on T19, T20, T25, T27, T28 in Tasks.
- [x] AC-11: On the enterprise case, with labels and case approved before the first rule-editing commit, no
      label fails the retention rule on either route, apart from label L-08 on the Claude host route and
      label L-10 on the Codex command route, known losses the owner deferred as D-17 and D-18.
      Evidence: established by the observed verification recorded on T23, T27 in Tasks.
- [x] AC-12: On the small application case, with labels and case approved before the first rule-editing
      commit, no label fails the retention rule on either route.
      Evidence: established by the observed verification recorded on T24, T27 in Tasks.
- [x] AC-13: Over the case and route pairs where both briefs' loops reach a clean pass, of which there must be
      at least one, the new-brief loops need at most half the old-brief loops' total spec reviews; the other
      pairs are reported as measured.
      Evidence: established by the observed verification recorded on T23, T24, T25, T28 in Tasks.
- [x] AC-14: The convention defines the optional Deferred section outside the normative baseline; the spec
      skill writes an entry with the exact source text for every stated limit, finding deferred at
      acceptance, owner-directed cut, author cut and drift re-review deferral; and the reviewer does not
      raise an entry's substance again unless it leaves an always-blocking defect, makes a criterion
      unmeetable or leaves the stated problem unsolved.
      Evidence: established by the observed verification recorded on T1, T2, T6, T7, T15, T26 in Tasks.
- [x] AC-15: After every owner-directed deferral, the author's reply carries the cut check line, and an item
      that is an always-blocking defect or that the goal or a criterion names becomes an Open Question
      instead of a Deferred entry.
      Evidence: established by the observed verification recorded on T7, T15 in Tasks.
- [x] AC-16: Once a feature's PR is merged, the follow-up review gives every pending Deferred entry a verdict
      of drop, follow-up or gap with one line of reason; shows gaps and follow-ups with issue previews and
      drops one line each; files only what the owner approves, through the labels helper's `follow-up`
      mode, never twice for one entry; records every verdict, including declined filings, in a docs PR
      without touching the default branch; runs only for a merged feature, without a writer handoff; and
      the ship report and resume flag a merged complete document with pending entries.
      Evidence: established by the observed verification recorded on T9, T10, T11, T16 in Tasks.
- [x] AC-17: Over the case and route pairs whose old-brief loop reached a clean pass and stored its
      documents, the new-brief loops'
      total body growth is at most half the old-brief loops' total, or no larger than it when the old total is zero or negative, with body size
      recorded per pass and the Deferred section left out of it.
      Evidence: established by the observed verification recorded on T19, T20, T23, T24, T25 in Tasks.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-02, AC-03 | Manual procedure: read the convention at the companion revision and confirm each Design rule and glossary definition, including the three always-blocking classes, then run `bun test tests/vh-adlc/proportional-review.test.ts`, which pins the new definitions, the plausible-choice sentence and the stated-limit line at that revision. |
| AC-04 | Scenario `S17.profile`: a seeded document, silent about users and deployment, where a command a person runs appends its result to a shared file without a lock, reviewed by the real reviewer three times: with a profile saying one person runs it by hand on their own machine, one run at a time; with a profile saying a hosted service runs it for many tenants at once; and with no profile. Pass: the lock gap is nit or absent with the first, and should-fix or blocking with the second and with the third. A fourth run, `S17.profile.unsure`, uses a profile of a small team's shared tool that says nothing about whether runs overlap. Pass: the lock gap is should-fix or blocking. |
| AC-03 | Scenario `S17.limit`, run as a full pass (the R-1 row's commit is not an ancestor of X) under a profile of a shared build host where parallel jobs run the command: the document says `names.log` is a diagnostic log rebuilt on every run, has an R-1 record F-01 about concurrent writers to it, and has a Scope line `Not handled: concurrent writers to names.log, accepted for this version (R-1 F-01).` Pass: no finding names `names.log` concurrency. Control 1: the same document without that line raises the `names.log` gap. Control 2: an R-1 F-02 about the delete endpoint with `Not handled: callers without a session on the delete endpoint, internal tool (R-1 F-02).` still yields a blocking finding quoting that line. |
| AC-05 | `bun test tests/vh-adlc/loop/review-scope.test.ts`: `review-scope` picks the right previous review with an acceptance row after it, skips a non-ancestor row, reports full with no row, with a changed `covers` path and with each changed bridge file, leaves the Review Log out of the diff, and `reviewPrompt` from the `review` command carries the result. Scenario `S17.scoped` on the host route and `S17.scoped-command` through the `review` command with a Codex command route: a reviewed document gets one changed Design paragraph and keeps a seeded should-fix gap in an unchanged section. Pass on each: apart from blocking findings, findings name only the changed paragraph or sections that state its terms; none names the unchanged gap; and an unchanged seeded security defect is still raised as blocking. |
| AC-06 | Scenario `S17.questions`, with scripted reviewer records (`scriptedPlugin`): one judgement finding the seeded product profile settles and one about a public contract. Pass at the companion pin: one Open Question, about the contract, and Design records the other choice. |
| AC-07 | Scenario `S17.nits`, with scripted reviewer records: an earlier clean pass has reviewed a free-text pattern row; the new pass has no blocking or should-fix finding and eight nits, six citation slips in the normative baseline that the seeded project procedure says need no owner attention and two free-text widening nits on that row. Pass: the summary part of the final reply shows the two and a count of six, and its `All unapplied nits` section lists all eight. |
| AC-08 | Old-pin controls of `S17.scoped`, `S17.questions`, `S17.nits`, `S17.profile` (single-user profile), `S17.deferred`, `S17.cut` and `S17.followup` on a fixture pinned to `0c983f67`. Pass: the unchanged gap is raised, both judgement findings become Open Questions, the summary lists all eight nits, the lock gap is raised at should-fix or blocking despite the profile, no `## Deferred` section or `Cut check:` line is written, and neither ship nor resume runs or names a follow-up review. `S16.oldpin-reviewer` and `bun test tests/vh-adlc/review-convergence.test.ts` at `0c983f67` still pass. |
| AC-09 | `bun test tests/vh-adlc/proportional-review.test.ts`: `AGENTS.md` has the section and the companion pin, `knowledge.md` names the same SHA, and the convention uses each glossary term except Cut check and Follow-up review; plus a manual read of the convention and both guides against the glossary definitions. |
| AC-10 | `bun test tests/vh-adlc/replay/run.test.ts` on a fixture case built from the scenario fixture with one seeded defect and scripted reviewers: the results file holds counts, label IDs and run identities and no line of the fixture document; a forced execution failure is recorded and not counted; a run reporting another route or model is not counted; a new-brief-only run reuses a stored old-brief set whose recorded identity matches and refuses a mismatched one; a run under another identity moves the earlier stored set aside; a run under the same identity runs only the missing passes; a failed loop's next attempt resumes its kept clone; a pre-T25 lost loop set with a launch-record entry and a bound counts its bound, stays finished and stays out of growth; a kept clone moves aside when a fresh set starts; a pre-T25 set holding an unlisted run file starts fresh; an unclean old loop with stored documents stays out of growth; a `--only loops` rerun keeps the stored first passes; a pre-T25 set is counted through a matching launch record entry, refused through a mismatched one, and refused when it holds a file the entry does not list; pre-T25 first passes followed by a post-T25 `--only loops` run keep each part's own identity; results assembled after an interrupted first-pass set keep its finished passes; copies of the case with no approval line, an edited label and an edited `case.yaml` are refused before any run; a planted term in the tree or the companion diff stops the run; a term inside a `### R-<n>` record passes while the same term in Design stops it; for retention, a label the old brief raises at its minimum passes when a new pass raises it at its minimum and fails after twelve new passes that raise it only below, a label the old brief raises only below its minimum passes when a new pass raises it at any severity and fails after twelve new passes that never raise it, a label one old pass raises at its minimum and one below fails after twelve new passes that never raise it, a failing label gets the six confirmation passes, and the results show the four counts per label; for the totals, a pair with an unclean loop is left out of the halving total and listed with its counts, failing labels are named with case and route, a bound read from a kept clone counts the clone's spec rows since X', a later same-identity run resumes that clone and the bound moves aside once its documents are stored, a bound moves aside with a fresh set, and a session-log bound is never run again. |
| AC-11 | Replay of the enterprise case: three old-brief and six new-brief first passes per route, with confirmation runs where the rule calls for them. Pass: the results file shows no failing label on either route apart from L-08 on the host route (D-17) and L-10 on the command route (D-18). The implementation reviewer opens the case directory, checks that the approval line matches `labels.md` and `case.yaml` and predates the first rule-editing commit in both repositories, and spot-checks the matcher's verdicts against the stored records, citing case material only by label ID, count and digest. It also checks each pre-T25 set in `runs/launch-record.json` against the recorded command line (its plugin commits and docs revisions) and the stored files' times, checks each `runs/old-<route>-loop.bound.json` against the session logs it names and each `runs/new-<route>-loop.bound.json` still in effect against the Review Log of the kept clone at the head and X' it records, and that the reviewer, the spec skill, `references/review-protocol.md`, `references/loop.md` and `scripts/loop/` differ between the first new brief `5e94e593` and the new brief in the results file, which must be `ef685da1`, only by `ef685da1`'s reviewer change (`git diff 5e94e593 ef685da1 -- <those paths>`); the harness's terms check on this document and the results file passes before the review is stored. |
| AC-12 | Replay of the small application case, same procedure, brief check and pass condition. |
| AC-13 | The same replays' full loops, one per brief per case and route, with a loop that stopped before a clean pass counted by its recorded lower bound. Pass: the results file shows, over the pairs where both loops reached a clean pass (at least one pair), the new total of spec reviews at most half the old total, and lists every other pair with its counts. |
| AC-14 | Scenario `S17.deferred`, with scripted reviewer records and a scripted owner: the owner says "answer R-1 F-01 with a stated limit"; the author also cuts an extra the scripted R-1 flags as added beyond any criterion; scripted R-2 returns no blocking finding and one should-fix finding; the owner accepts R-2 while "deferring R-2 F-01"; later, default-branch drift brings re-review R-3 whose finding asks for extra work, and the owner answers "defer it". Pass: four entries reading `From: R-1 F-01, stated limit.`, `From: author cut.`, `From: R-2 F-01, deferred at acceptance.` and `From: drift re-review R-3.`; the Scope line beside the first; a `Cut check:` line in the replies after the acceptance deferral and the drift deferral; and `vh-adlc fresh` still fresh after the acceptance and drift entries. Scenario `S17.deferred-review`, with the real reviewer, on a document whose Deferred section holds a deferred retry sampler and a deferred session check on a delete endpoint. Pass: no finding names the sampler, and a blocking finding against Scope quotes the delete entry. `bun test tests/vh-adlc/proportional-review.test.ts` pins the convention's section definition and source list. |
| AC-15 | Scenario `S17.cut`, with scripted reviewer records: the owner says in session "cut the retry sampler and the session check on delete". Pass: a Deferred entry `From: owner cut on <today>.` for the sampler, an Open Question about the session check, Scope still holding the check, and a reply line starting `Cut check:` that names the session check as a security defect. Control: "cut the retry sampler" alone gives the `nothing important lost` line. The acceptance and drift deferrals of `S17.deferred` check the line for those kinds. |
| AC-16 | `bun test tests/vh-adlc/labels` gains `follow-up` mode cases: one type label, no state label, no alias change, and the `Deferred:` line at the end of the body. Scenario `S17.followup`, with a `gh` stub on `PATH` that records calls and serves `gh issue list`: a fixture feature, complete and merged outside the session by another session's claim, with four pending entries: one the merged code already covers, two useful extensions, and one whose absence a seeded usage example hits. Pass: `/vh-adlc-resume` reports the four pending entries and names the follow-up review; `/vh-adlc-ship` on the document asks for no writer handoff, gives drop, follow-up, follow-up and gap in entry order, and shows the gap, then the follow-ups with previews, then the drop line; the owner approves filing the gap and the first follow-up and declines the second; the stub fails the second creation; the run reports partial and the fixture remote's `docs/follow-up-<slug>` branch holds a commit with the first link recorded. A rerun, with the owner approving again, files only the missing issue and adds a commit to the same branch. The entries end as `drop, ...`, `follow-up <stub link>`, `follow-up, not filed (owner declined)` and `gap <stub link>`; one PR exists for the branch; the fixture remote's default branch is unchanged. Control: the same fixture with its PR not merged runs ship's normal delivery path and no follow-up review, and resume names no follow-up review. |
| AC-17 | `bun test tests/vh-adlc/replay/run.test.ts`: on the fixture case the results file records body size per pass and leaves a seeded Deferred section out of it; plus the replays' full loops. Pass: over the pairs whose old-brief loop reached a clean pass with stored documents, the results file shows the new total growth at most half the old total, or no larger than it when the old total is zero or negative. |

## Tasks

- [x] T1 `tests/vh-adlc/proportional-review.test.ts` - failing tests that pin the companion convention's severity definitions, always-blocking classes, stated limit, scoped re-review, plausible-choice rule, owner-list triage, Deferred section and source list, the glossary terms the convention uses, vh-adlc's product profile and the companion pin; fails because none exist yet (AC-01, AC-02, AC-03, AC-09, AC-14)
      Evidence: `bun test tests/vh-adlc/proportional-review.test.ts`: 0 pass, 27 fail, each on missing text, because neither the companion convention nor the plugin wording exists yet. `bun test tests/vh-adlc` on this state in a scratch clone ran out of its 90-minute limit on a loaded host; its other failures were 5-second timeouts in docs-drift, audit and branches tests: audit, branches, claude-role and closure pass when run alone, and closure-inventory and delivery-ack time out the same way on main without this change.
- [x] T2 `vhco-pro/docs: conventions/feature-documents.md` - the companion PR on its own branch with every convention rule Design names; T1's convention assertions pass against the companion head (AC-01, AC-02, AC-03, AC-14)
      Evidence: Companion PR https://github.com/vhco-pro/docs/pull/59 on vhco-pro/docs `docs/proportional-review` at `0fa68d6`, cut from main `30c38c8`; its parent changes no word of `conventions/feature-documents.md` against `0c983f67`. `VH_ADLC_CONVENTION_DOCS=<companion checkout> bun test tests/vh-adlc/proportional-review.test.ts -t "companion convention"`: 9 pass (failed at T1). `npm run check` in the docs repo: 48 files pass and the vh-adlc-rules block parses unchanged. Both replay cases were approved (2026-11-22T20:27Z, 2026-11-23T07:40Z) before this first rule-editing commit (2026-11-23).
- [x] T3 `tests/vh-adlc/loop/review-scope.test.ts` - failing tests for `review-scope`: previous review after an acceptance row, a non-ancestor row, no row, a changed `covers` path, each changed bridge file, the Review Log left out of the diff, and `reviewPrompt` carrying the result; fails because the command does not exist (AC-05)
      Evidence: `bun test tests/vh-adlc/loop/review-scope.test.ts`: 0 pass, 10 fail, because `cli.ts review-scope` answers as an unknown command and `reviewPrompt` carries no scope.
- [x] T4 `plugins/vh-adlc/scripts/loop/cli.ts`, `tests/vh-adlc/loop/lenses.test.ts` - the `review-scope` command and its result in `reviewPrompt` for the command route; T3 and `lenses.test.ts` pass (AC-05)
      Evidence: `bun test tests/vh-adlc/loop`: 180 pass, 0 fail, with all ten review-scope cases; after the two lenses.test.ts prompts gained a full scope, `bun test tests/vh-adlc/loop/lenses.test.ts tests/vh-adlc/loop/review-scope.test.ts`: 16 pass. The protocol text that tells both routes to pass the scope is T5.
- [x] T5 `plugins/vh-adlc/references/review-protocol.md` - both routes pass the scope, and the Independence sentence gains the scope exception; T1's protocol assertions pass (AC-05)
      Evidence: `bun test tests/vh-adlc/proportional-review.test.ts -t "review protocol"`: 1 pass (failed at T1). `bun test tests/vh-adlc/check.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/docs-drift/authority.test.ts tests/vh-adlc/loop/glossary.test.ts`: 83 pass, 1 fail, the check that a package change comes with a version change; it has failed since T4 first changed the package, and T21 bumps the version.
- [x] T6 `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md`, `tests/vh-adlc/proportionality.test.ts` - the reviewer reads the product profile, rates failure paths by consequence, honours stated limits and Deferred entries, and scopes re-reviews, all gated on the resolved convention; T1's reviewer assertions and `proportionality.test.ts` pass (AC-03, AC-04, AC-05, AC-08, AC-14)
      Evidence: `bun test tests/vh-adlc/proportional-review.test.ts -t reviewer`: 4 pass (failed at T1). `bun test tests/vh-adlc/proportionality.test.ts tests/vh-adlc/loop/lenses.test.ts tests/vh-adlc/loop/cli.test.ts tests/vh-adlc/loop/review-scope.test.ts`: 39 pass. `bun test tests/vh-adlc/check.test.ts`: 64 pass, 1 fail, the version-change check T21 settles. The old-revision behavior (S16.oldpin-reviewer and the S17 old-pin controls) is proved by T13 and T17.
- [x] T7 `plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md`, `tests/vh-adlc/direct-operation-compatibility.test.ts` - the plausible-choice rule, the author-side stated limit, Deferred entries with their five sources, the cut check, owner-list triage and the scope in the host dispatch, gated on the resolved convention, keeping #141's author-cut exception and its Review Log record; T1's spec assertions and `tests/vh-adlc/author-extras.test.ts` pass, and the spec baseline moves to this commit (AC-06, AC-07, AC-08, AC-14, AC-15)
      Evidence: `bun test tests/vh-adlc/proportional-review.test.ts -t "spec skill"`: 7 pass (failed at T1). The skill change is c2eff1d0; this commit moves the spec baseline in direct-operation-compatibility.test.ts to it, as earlier features did, and then `bun test tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/author-extras.test.ts`: all pass. proportionality.test.ts and owner-summary.test.ts pass; check.test.ts keeps only the version-change failure T21 settles. Spec skill behavior is proved by the S17 scenarios in T14 to T17.
- [x] T8 `plugins/vh-adlc/references/loop.md` - the product profile, stated once; T1's loop assertion passes (AC-04, AC-09)
      Evidence: `bun test tests/vh-adlc/proportional-review.test.ts -t "loop reference"`: 1 pass (failed at T1; a first draft that also named the heading in prose failed the stated-once check and was reworded). `bun test tests/vh-adlc/check.test.ts tests/vh-adlc/proportionality.test.ts`: 70 pass, 1 fail, the version-change check T21 settles.
- [x] T9 `tests/vh-adlc/labels/` - failing `follow-up` mode cases: one type label, no state label, no alias change, the `Deferred:` line at the end of the body; fails because the mode does not exist (AC-16)
      Evidence: `bun test tests/vh-adlc/labels/follow-up.test.ts` before the mode existed: 2 pass, 6 fail. The six fail because `--operation follow-up` is refused as unknown; the two that pass are refusals (another type, a state label), which already hold for that reason.
- [x] T10 `plugins/vh-adlc/scripts/labels/`, `plugins/vh-adlc/references/issues.md` - the `follow-up` filing mode and ship's filing role; T9 passes (AC-16)
      Evidence: `bun test tests/vh-adlc/labels tests/vh-adlc/issue-authority.test.ts`: 40 pass, 0 fail, including the labels typecheck and all eight follow-up cases; `bun test tests/vh-adlc/direct-operation-compatibility.test.ts`: 8 pass. The full-suite run on this state (scratch clone, 90-minute limit) showed only the pre-existing 5-second timeouts named under T1. No user guide names the labels modes; references/issues.md is the documented home and gains the role.
- [x] T11 `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md`, `plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md`, `plugins/vh-adlc/references/authority.md` - the follow-up review after merge, triggers keyed on the merge, the ship report and resume flags, and its authority, gated on the resolved convention; T1's ship, resume and authority assertions pass (AC-08, AC-16)
      Evidence: `bun test tests/vh-adlc/proportional-review.test.ts -t "follow-up review after merge"`: 3 pass (they failed at T1). `bun test` over the 17 files that read ship, resume or authority, including direct-operation-compatibility (now stripping and checking the new section in ship and resume like its other added sections), proportionality and author-extras: 112 pass, 0 fail. The user guides that describe ship are T22.
- [x] T12 `tests/vh-adlc/fixtures/build.ts`, `tests/vh-adlc/scenarios/run.ts` - a fixture docs revision holding the `0c983f67` tree and `scriptedPlugin` taking the canned directory as a parameter; the existing S16 scenarios still pass (AC-08)
      Evidence: `bun test tests/vh-adlc/fixtures.test.ts tests/vh-adlc/scenario-plan.test.ts`: 17 pass; the new convergence-revision case failed first on an undefined revision. `bun tests/vh-adlc/scenarios/run.ts S16` with this change: S16.drift, S16.nits and S16.oldpin-reviewer pass; S16.oldpin-judgement passes in a clean clone; S16.oldpin fails its "knowledge resolved the previous pin" check in three of three runs, and without this change (89b03de8) in two of three, each time because the session agent first called the binary with wrong arguments, which the check counts as an unresolved pin. Every answered knowledge call resolved the previous pin in all runs. That flake predates this task and is reported separately.
- [x] T13 `tests/vh-adlc/scenarios/run.ts` - scenarios `S17.profile`, `S17.limit`, `S17.scoped` and `S17.scoped-command`; each passes its Test Plan condition (AC-03, AC-04, AC-05)
      Evidence: Each scenario run alone with `bun tests/vh-adlc/scenarios/run.ts <id>` after the host capacity check: S17.profile.single PASS (1 run), S17.profile.hosted PASS (2 runs, the first stopped at the session capacity check), S17.profile.none PASS (2 runs, the first stopped at the capacity check), S17.scoped PASS (2 runs, the first stopped at the capacity check), S17.scoped-command PASS (1 run, a real Codex review attested as gpt-6.2-sol, scoped since the clean pass), S17.limit.stated PASS (4 runs; the three failures were my classifier counting findings that only quote the stated limit, and a fixture claim about resetting names.log that the tree did not back up, both fixed before the passing run), S17.limit.nolimit PASS (4 runs, 3 passing, the last on the final fixture), S17.limit.security PASS (3 of 3 runs, the last on the final fixture). `bun test tests/vh-adlc/fixtures.test.ts`: 15 pass; the companion revision case failed first on an undefined revision. Untested: each condition rests on one passing model sample, so how a profile moves the lock gap rating can vary between runs, and the scoped re-review was observed on one changed paragraph only.
- [x] T14 `tests/vh-adlc/scenarios/run.ts`, `tests/vh-adlc/evidence/proportional-review/canned/` - scenarios `S17.questions` and `S17.nits` with scripted records; each passes (AC-06, AC-07)
      Evidence: Each scenario run alone with `bun tests/vh-adlc/scenarios/run.ts <id>` after the host capacity check: S17.questions PASS (3 runs; the first failed because my fixture profile also settled the contract question, the second because the author holds the settled choice for the commit that applies the owner's answer, as review step 4 says, so the scenario now has the scripted owner answer the one question in a second turn and reads Design after it), S17.nits PASS (2 runs; the first failed only because my check looked for finding IDs in the owner summary, which the skill keeps out of it, so the summary is now read by content). `bun test tests/vh-adlc/fixtures.test.ts`: 15 pass. Untested: one passing model sample each; the reviewer is scripted, so these prove the spec skill alone.
- [x] T15 `tests/vh-adlc/scenarios/run.ts`, `tests/vh-adlc/evidence/proportional-review/canned/` - scenarios `S17.deferred`, `S17.deferred-review` and `S17.cut`; each passes (AC-14, AC-15)
      Evidence: Each scenario run alone with `bun tests/vh-adlc/scenarios/run.ts <id>` after the host capacity check, plugin at 5e94e59 (no spec skill or reviewer change since): S17.deferred PASS (1 run, six scripted owner turns; four Deferred entries with the exact sources, the Scope line, a Cut check line after the acceptance and the drift deferral, and `vh-adlc fresh` reporting R-2 and then R-3 fresh after those entries), S17.deferred-review PASS (1 run, real reviewer: nothing about the sampler, a blocking finding against Scope quoting D-02), S17.cut.both PASS (1 run), S17.cut.control PASS (1 run). `bun test tests/vh-adlc/fixtures.test.ts`: 15 pass. Untested: one model sample each; the deferral at acceptance and the drift deferral were each seen once, and the cut check was not tried on a proportionality answer of narrow.
- [x] T16 `tests/vh-adlc/scenarios/run.ts` - scenario `S17.followup` with the `gh` stub, its partial run, rerun and unmerged control; passes (AC-16)
      Evidence: Each scenario run alone with `bun tests/vh-adlc/scenarios/run.ts <id>` after the host capacity check, with a gh stand-in that records every call and a local SSH command serving the fixture remote under a GitHub URL: S17.followup.merged PASS on the plugin at 3c57fca8 (5 runs; one failed on my check of the order among follow-ups, one passed before 3c57fca8, then on the current plugin one stopped at the session capacity check, one failed only on my exact comparison of a verdict that keeps its trailing full stop, and the last passed: resume named the four entries and the step, ship showed the gap, then the follow-ups, then the drop without a writer handoff, the stub failed the second filing so the run was partial with the gap link on docs/follow-up-greeting-name, the rerun filed only D-02 on the same branch and PR, and main stayed unchanged), S17.followup.unmerged PASS (3 runs; the first two failed because resume named the follow-up review for an unmerged document, which the resume and ship fix in 3c57fca8 removed). `bun test tests/vh-adlc/fixtures.test.ts`: 15 pass. Untested: real GitHub (the stub answers every gh call), two sessions running the review at once (a stated limit), and a failure at any point other than the second issue creation.
- [x] T17 `tests/vh-adlc/scenarios/run.ts` - the old-pin controls of `S17.scoped`, `S17.questions`, `S17.nits`, `S17.profile`, `S17.deferred`, `S17.cut` and `S17.followup`; each passes and `S16.oldpin-reviewer` still passes (AC-08)
      Evidence: Each scenario run alone with `bun tests/vh-adlc/scenarios/run.ts <id>` after the host capacity check, on a fixture pinned to the 0c983f67 docs tree: S17.oldpin.scoped PASS (1 run, the unchanged names.log gap raised), S17.oldpin.questions PASS (1 run, both judgement findings became Open Questions), S17.oldpin.nits PASS (2 runs; the first failed only on an extra check of mine that the row does not ask for, since cut), S17.oldpin.profile PASS (1 run, the lock gap at should-fix or blocking despite the single-person profile), S17.oldpin.deferred PASS (1 run, no Deferred section and no Cut check line), S17.oldpin.cut PASS (1 run), S17.oldpin.followup PASS (2 runs; the first failed because resume and ship named the follow-up review on the old pin, which 3c57fca8 removed), S16.oldpin-reviewer PASS (2 runs, the first stopped at the session capacity check). `bun test tests/vh-adlc/review-convergence.test.ts tests/vh-adlc/fixtures.test.ts`: 25 pass. Untested: one passing model sample per control; the pin bump in T21 moves the fixture plugin pin, so these controls should be rerun after it.
- [x] T18 `tests/vh-adlc/review-convergence.test.ts` - resolve its pages at `0c983f67` explicitly; passes before and after the pin bump (AC-08)
      Evidence: `bun test tests/vh-adlc/review-convergence.test.ts`: 10 pass at the repository pin, and 10 pass in a copy whose AGENTS.md pin moved to `1ccf8f31`; the pages now resolve through a pinless scratch repository at `0c983f67`. A failing run first was not possible: no docs revision with the changed text exists before the companion PR.
- [x] T19 `tests/vh-adlc/replay/run.test.ts` - failing harness tests on a fixture case: counts and identities only, a failed execution not counted, another route or model not counted, refusal without an approval line or with an edited label or `case.yaml`, the terms check in the tree, the companion diff and a Design section but not a stored record, and body size per pass without the Deferred section; fails because the harness does not exist (AC-10, AC-17)
      Evidence: `bun test tests/vh-adlc/replay/run.test.ts` without the harness (scratch clone of main): 1 pass, 12 fail on `Module not found ... replay/run.ts`; the pass is the companion-diff refusal, which holds trivially when nothing can run.
- [x] T20 `tests/vh-adlc/replay/run.ts` - the replay harness; T19 passes (AC-10, AC-17)
      Evidence: `bun test tests/vh-adlc/replay tests/vh-adlc/labels tests/vh-adlc/review-convergence.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/proportionality.test.ts tests/vh-adlc/author-extras.test.ts`: 79 pass, 0 fail, including all 13 harness cases. The full suite was not rerun at this commit (it exceeds 90 minutes on this host). Untested: `tests/vh-adlc/replay/live.ts`, the Codex, Claude and matcher executor, which only real model runs exercise; its first use is T23.
- [x] T21 `AGENTS.md`, `plugins/vh-adlc/knowledge.md`, `plugins/vh-adlc/plugin.json`, `plugins/vh-adlc/.claude-plugin/plugin.json` - vh-adlc's product profile, the pin bump to the merged companion revision and the plugin version; T1 passes in full and `bun test tests/vh-adlc` stays green (AC-09)
      Evidence: `bun test tests/vh-adlc/proportional-review.test.ts`: 27 pass at the repository pin with no override (the two AC-09 checks failed at T1). `vh-adlc knowledge` at `e79eaa6a` answers every page the loop and the spec skill read. `bun test tests/vh-adlc --parallel=4 --timeout 60000` on this state after merging main: 4364 pass, 13 fail in 4517 s: 10 in docs-drift/installed-marker-caller came from the scratch clone holding these changes uncommitted and pass once committed; settings-file "an offline reader session" fails on a fresh clone of main too; docs-drift/evidence-input fails on this host's Bun 1.4.3 (main too, the repository declares 1.4.5); docs-drift/trial-publication passed when rerun alone. check.test.ts's Bun-convention check moved to the convention's current wording, which keeps this repository's Bun runtime. With the fixture base now at the companion revision, `bun tests/vh-adlc/scenarios/run.ts S17.oldpin S16.oldpin-reviewer`: all eight pass.
- [x] T22 `docs/user-guides/workflows.md`, `docs/get-started/first-feature.md` - the guides describe the terms they use with the glossary's meanings; manual read against the glossary (AC-09)
      Evidence: Manual read of `docs/user-guides/workflows.md` (Reviews) and `docs/get-started/first-feature.md` (step 1) against the glossary: each guide uses product profile, severity by consequence, always-blocking defect, stated limit and scoped re-review with the glossary meaning, and workflows.md also the owner's recorded rules, the Deferred list, the cut check and the follow-up review. `grep` found no other docs page stating the old rules. `bun test --timeout 60000` over the seven test files that read these guides (author-extras, docs-drift/public-docs, review-convergence, audit/setup-docs, labels/vocabulary, triage/migration, triage/discovery): 46 pass.
- [x] T27 `tests/vh-adlc/replay/run.ts`, `tests/vh-adlc/replay/run.test.ts` - retention counts old-brief passes at or above the label's minimum severity, fails a label that two old passes raise at any severity but fewer than two at its minimum when no new pass raises it at any severity, and reports the four counts per label; run.test.ts passes the AC-10 retention cases (AC-10, AC-11, AC-12)
      Evidence: the final run.test.ts against the run.ts committed before this task (a scratch copy of HEAD `b72b9c2a` with only run.test.ts replaced): 31 pass, 7 fail, the six retention cases (old at its minimum and new never; old at its minimum and new only below; old only below and new at any severity; old only below and new never; one old pass at the minimum and one below with new never; the four-count table) and the stored-set rerun that reads the renamed counts. With this task's run.ts: `bun test tests/vh-adlc/replay/run.test.ts --timeout 60000`: 38 pass, 0 fail; `bun test tests/vh-adlc/replay tests/vh-adlc/proportional-review.test.ts tests/vh-adlc/labels --timeout 60000`: 104 pass, 0 fail.
- [x] T28 `tests/vh-adlc/replay/run.ts`, `tests/vh-adlc/replay/run.test.ts` - the spec review totals over the pairs where both loops reached a clean pass, every other pair listed with its counts, failing labels named with case and route, a `bound --from-clone` mode that counts a stopped loop's reviews from its kept clone, a later run that resumes that clone and moves the bound aside once its documents are stored, a bound that moves aside with a fresh set, and a session-log bound that is never run again; run.test.ts passes the AC-10 totals cases (AC-10, AC-13)
      Evidence: the final run.test.ts against the run.ts committed before this task (a scratch copy of HEAD `1a9b6794` with only run.test.ts replaced): 35 pass, 7 fail, each a case this task names (the totals over pairs where both loops reached a clean pass, a pair with an unclean loop listed, failing labels named with case and route, a bound read from a kept clone, a resumed clone whose documents move the bound aside, a bound moved aside with a fresh set, a session-log bound never run again). With this task's run.ts: `bun test tests/vh-adlc/replay tests/vh-adlc/proportional-review.test.ts tests/vh-adlc/labels --timeout 60000`: 108 pass, 0 fail. On the real case, `run.ts bound --from-clone` for the enterprise new command loop recorded 25 spec reviews from its kept clone. CI on PR #173 failed the kept-clone bound case because its test commits had no git identity (exit 128); with `HOME` empty and `GIT_CONFIG_NOSYSTEM=1` it failed the same way locally, and after the test passes its own identity to those commits `bun test tests/vh-adlc/replay` under the same conditions: 42 pass, 0 fail.
- [x] T23 `tests/vh-adlc/evidence/proportional-review/results.md` - replay of the enterprise case on both routes; the results show no failing label apart from L-08 on the host route and L-10 on the command route (AC-11, AC-13, AC-17)
      Evidence: `run.ts assemble` for both cases from the stored private runs (briefs: old plugin `0c9fee77` with docs `30c38c8d`, new plugin `ef685da1` with docs `0fa68d68`), then `run.ts terms` on the results file, this document and the tree for each case: pass, pass. Enterprise: 3 old and 12 new first passes per route (one Codex execution not counted for reporting another identity, rerun); retention fails only L-10 on the command route and L-08 on the host route, the two owner-deferred known losses (D-18, D-17). Loops: host old 35 clean, new 8 clean; command old at least 33 (session-log bound), new at least 25 (kept-clone bound, stopped at Codex's usage limit), both unclean and listed, not in the halving total.
- [x] T24 `tests/vh-adlc/evidence/proportional-review/results.md` - replay of the small application case and the round totals over the pairs where both loops reached a clean pass, with the other pairs listed, and the growth totals over the pairs whose old loop reached a clean pass with stored documents; the results show no failing label, at most half the old total of spec reviews and body growth (AC-12, AC-13, AC-17)
      Evidence: `run.ts assemble` for both cases from the stored private runs (briefs: old plugin `0c9fee77` with docs `30c38c8d`, new plugin `ef685da1` with docs `0fa68d68`), then `run.ts terms` on the results file, this document and the tree for each case: pass, pass. Small application: retention passes for both labels on both routes. Loops: host old 9, new 2; command old at least 19 (session-log bound), new 15 clean, listed. Totals: spec reviews over the 2 pairs where both loops reached a clean pass 44 old, 10 new (met); body growth over the 2 pairs with stored old documents 972 old, 343 new (met); failing labels 2, named, both deferred.

- [x] T25 `tests/vh-adlc/replay/run.ts`, `tests/vh-adlc/replay/run.test.ts` - results without an Open Question condition, a recorded identity per brief, route and part, a run of the new brief alone that reuses only a matching stored old-brief set, continuation of a same-identity set and a fresh set otherwise, kept loop clones, lower bounds from session logs, the launch record for pre-T25 sets, and `assemble`, which builds a case's results from its stored runs; run.test.ts passes, including the totals table, a matching and a mismatched stored set, a run under another identity, a same-identity continuation, a resumed loop, a pre-T25 lost loop with its bound, a clone moved aside, a fresh set from a pre-T25 set with an unlisted file, an unclean old loop left out of growth, a `--only loops` rerun, a launch record that matches, mismatches or misses a file, pre-T25 first passes followed by a post-T25 `--only loops` run, and assembly after an interrupted first-pass set (AC-10, AC-13, AC-17)
      Evidence: the new run.test.ts cases run against the run.ts committed before this task (a scratch copy of HEAD `b54c1040` with only run.test.ts replaced): 17 pass, 15 fail, each failing case being one this task names (the totals table without a question condition, `assemble`, the stored-set reuse, mismatch, fresh set, continuation, resumed clone, lower bound, launch record match/mismatch/missing file, pre-T25 first passes then a loops-only run, a pre-T25 lost loop with its bound, a clone moved aside, a pre-T25 set with an unlisted file, an unclean old loop out of growth, assembly after an interrupted first-pass set). With this task's run.ts: `bun test tests/vh-adlc/replay/run.test.ts --timeout 60000`: 32 pass, 0 fail; `bun test tests/vh-adlc/replay tests/vh-adlc/proportional-review.test.ts tests/vh-adlc/labels --timeout 60000`: 98 pass, 0 fail. The running new-brief replays already use these changes from the working tree; their first finished run, the small application on the host route, reports retention pass for both labels and a clean new loop after 2 spec reviews. Untested here: `assemble` on the real stored runs, which T23 and T24 exercise.
- [x] T26 `tests/vh-adlc/scenarios/run.ts`, `tests/vh-adlc/evidence/claude-code/` - rerun S17.profile, S17.limit, S17.scoped, S17.scoped-command and S17.deferred-review on the fixed reviewer, and add `S17.profile.unsure`; each passes its Test Plan condition (AC-03, AC-04, AC-05, AC-14)
      Evidence: each scenario run alone with `bun tests/vh-adlc/scenarios/run.ts <id>` on the plugin at `3acff49`, which holds the reviewer fix `ef685da1`: S17.scoped-command PASS (a real Codex review attested as gpt-6.2-sol, scoped since the clean pass), S17.profile.unsure PASS (the lock gap at should-fix), S17.profile.single PASS (nit or absent), S17.profile.hosted PASS (blocking), S17.profile.none PASS, S17.limit.stated PASS, S17.limit.nolimit PASS, S17.limit.security PASS, S17.deferred-review PASS, one run each. S17.scoped failed its first run on a false match in my check: F-03, about whether `names.log` gets the cut name, matched the lock-gap pattern through "race" in "traces", and the pattern also matched "lock" in each record's own `SEVERITY: blocking` line. The pattern now matches whole words (old pattern true and new false on that F-03 text, "blocking", "clock" and "blocked"; both true on seven lock-gap phrasings). The pattern serves only the S17.scoped checks; the stored S17.oldpin.scoped finding it relied on quotes "The appends take no lock", so that control still holds. S17.scoped then PASS (1 run), and S17.profile.none PASS again on the fixed check.
- [x] T29 `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md`, `tests/vh-adlc/proportional-review.test.ts` - move `ef685da1`'s always-blocking check and uncertain-path rule into the reviewer's profile-only paragraph, so the failure-mode paragraph an older pin reads is the text the old-pin controls ran on; proportional-review.test.ts passes (AC-04, AC-08)
      Evidence: the new proportional-review.test.ts case "keeps the old-revision check after the profile gate and both checks in the profile-only paragraph" failed on the reviewer at `644da0c0` (0 pass, 1 fail) and passes after the move; `git diff 2639661 -- plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md` now shows the failure-mode paragraph unchanged and only the profile-only paragraph gaining the two sentences. `bun test tests/vh-adlc/proportional-review.test.ts tests/vh-adlc/proportionality.test.ts tests/vh-adlc/loop tests/vh-adlc/review-convergence.test.ts tests/vh-adlc/check.test.ts --timeout 60000`: 304 pass, 0 fail.
- [x] T30 `tests/vh-adlc/evidence/claude-code/` - rerun on the T29 reviewer the old-pin controls S16.oldpin-reviewer, S17.oldpin.scoped and S17.oldpin.profile and the host-route real-reviewer scenarios S17.profile, S17.limit, S17.scoped and S17.deferred-review; each passes its Test Plan condition (AC-03, AC-04, AC-05, AC-08, AC-14)
      Evidence: each scenario run alone with `bun tests/vh-adlc/scenarios/run.ts <id>` on the T29 reviewer (`57b33e73`): S16.oldpin-reviewer, S17.oldpin.scoped and S17.oldpin.profile PASS on the old pin (the unchanged gap raised, the lock gap at should-fix or above despite the profile); S17.profile.single, .hosted, .none and .unsure, S17.limit.stated, .nolimit and .security, S17.scoped and S17.deferred-review PASS. The first run failed S17.profile.single and S17.limit.nolimit on two matcher errors in my checks, not reviewer behaviour: "two runs" matched a finding about sequential appends while the real lock gap was a nit, and a proposal for a per-build log was not counted as raising the gap. With the matchers fixed (`ba0acdec`), all eight scenarios that use them were rerun and pass. Untested on this reviewer text: S17.scoped-command, the Codex route, whose transcript is from `3acff49`; Codex usage is exhausted until 2026-11-26, and the move changes only where the two sentences sit under the companion convention.

## Open Questions

None.

## Deferred

- D-01: State and size the combined chance that a correct implementation fails some label across many labels. From: R-5 F-01, deferred at acceptance. Verdict: pending.
- D-02: Have a scoped pass re-raise a previous blocking or should-fix finding the revision left unaddressed. From: R-5 F-02, deferred at acceptance. Verdict: pending.
- D-03: Give the author's side of the stated limit rule a home in the spec skill and a proof. From: R-5 F-03, deferred at acceptance. Verdict: pending.
- D-04: Hide the brief, commits and run order from the label matcher. From: R-5 F-04, deferred at acceptance. Verdict: pending.
- D-05: Script the author as well as the reviewer in the harness test, with no model call. From: R-5 F-05, deferred at acceptance. Verdict: pending.
- D-06: Hold each user guide only to the glossary terms it describes. From: R-5 F-06, deferred at acceptance. Verdict: pending.
- D-07: A full pass for a repository without its own pin after a plugin upgrade moves its docs revision. From: R-3 F-07, stated limit. Verdict: pending.
- D-08: A per-route check on average labels raised per run. From: owner cut on 2026-11-22. Verdict: pending.
- D-09: Owner-list triage in operations other than the spec skill. From: owner cut on 2026-11-22. Verdict: pending.
- D-10: Safe concurrent follow-up reviews on one feature. From: R-8 F-02, stated limit. Verdict: pending.
- D-11: While a follow-up docs PR is open, let its branch decide which entries are pending, so resume and ship do not repeat the review. From: R-9 F-01, deferred at acceptance. Verdict: pending.
- D-12: Name the `references/authority.md` wording for the follow-up review's temporary worktree and its writer-handoff exception. From: R-9 F-02, deferred at acceptance. Verdict: pending.
- D-13: Ask one approval for the docs branch, push and PR even when every entry is a drop or every filing is declined. From: R-9 F-03, deferred at acceptance. Verdict: pending.
- D-14: Run the private-terms check on newly returned implementation review records before storing them. From: R-9 F-04, deferred at acceptance. Verdict: pending.
- D-15: Count the Open Questions the author raises in the replay loops. From: owner cut on 2026-11-23. Verdict: pending.
- D-16: A set stored before T25 that two launches wrote. From: R-15 F-01, stated limit. Verdict: pending.
- D-17: Find why the new brief's Claude host reviewer no longer raises enterprise label L-08 (minimum severity should-fix), and restore it. From: owner cut on 2026-11-24. Verdict: pending.
- D-18: Find why the new brief's Codex command reviewer no longer raises enterprise label L-10 (minimum severity should-fix), and restore it. From: owner cut on 2026-11-24. Verdict: pending.
- D-19: Find why the Codex reviewer raises as many blocking findings per round under the new brief as under the old on the enterprise case, and finish that new loop when Codex usage returns. From: owner cut on 2026-11-24. Verdict: pending.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-22 | R-1 | spec | `a3bccaab` | claude-opus-5-5 | procedural | 2 blocking, 11 should-fix, 3 nit |
| 2026-11-22 | R-2 | spec | `5c09d79f` | claude-opus-5-5 | procedural | 1 blocking, 16 should-fix, 2 nit |
| 2026-11-22 | R-3 | spec | `98e792ad` | claude-opus-5-5 | procedural | 2 blocking, 9 should-fix, 2 nit |
| 2026-11-22 | R-4 | spec | `e94e00e7` | claude-opus-5-5 | procedural | no blocking; 5 should-fix, 1 nit |
| 2026-11-22 | R-5 | spec | `d73b31ea` | claude-opus-5-5 | procedural | no blocking; 6 should-fix, 3 nit |
| 2026-11-22 | R-5 | spec | `d73b31ea` | n/a | n/a | accepted by owner |
| 2026-11-22 | R-6 | spec | `c6c7afba` | claude-opus-5-5 | procedural | no blocking; 10 should-fix, 1 nit |
| 2026-11-22 | R-7 | spec | `471f5761` | claude-opus-5-5 | procedural | 1 blocking, 5 should-fix, 2 nit |
| 2026-11-22 | R-8 | spec | `14d15c23` | claude-opus-5-5 | procedural | no blocking; 6 should-fix, 2 nit |
| 2026-11-22 | R-9 | spec | `6abdbd3b` | claude-opus-5-5 | procedural | no blocking; 4 should-fix, 1 nit |
| 2026-11-22 | R-9 | spec | `6abdbd3b` | n/a | n/a | accepted by owner |
| 2026-11-22 | R-10 | spec | `d3ad7ce2` | claude-opus-5-5 | procedural | drift re-review after PR #152 and PR #155: no blocking; 1 should-fix, 3 nit; acceptance kept |
| 2026-11-23 | R-11 | spec | `9e9236a0` | claude-opus-5-5 | procedural | no blocking; 7 should-fix, 2 nit |
| 2026-11-23 | R-12 | spec | `28be40ab` | claude-opus-5-5 | procedural | scoped: no blocking; 1 should-fix, 2 nit |
| 2026-11-23 | R-13 | spec | `529d2648` | claude-opus-5-5 | procedural | scoped: no blocking; 2 should-fix, 1 nit |
| 2026-11-23 | R-14 | spec | `436d91c5` | claude-opus-5-5 | procedural | scoped: no blocking; 2 should-fix, 1 nit |
| 2026-11-23 | R-15 | spec | `9299b15b` | claude-opus-5-5 | procedural | scoped: no blocking; 1 should-fix, 2 nit |
| 2026-11-23 | R-16 | spec | `06bdcac5` | claude-opus-5-5 | procedural | scoped: no blocking, no should-fix; 4 nit |
| 2026-11-23 | R-17 | spec | `dfdd422d` | claude-opus-5-5 | procedural | drift re-review after merging main 74e7b1d2: no findings |
| 2026-11-24 | R-18 | spec | `3b81643c` | claude-opus-5-5 | procedural | scoped: no blocking; 1 should-fix, 4 nit |
| 2026-11-24 | R-19 | spec | `e96864df` | claude-opus-5-5 | procedural | scoped: no blocking; 1 should-fix, 2 nit |
| 2026-11-24 | R-20 | spec | `8424fb75` | claude-opus-5-5 | procedural | scoped: no blocking, no should-fix; 2 nit |
| 2026-11-24 | R-21 | spec | `00752fea` | claude-opus-5-5 | procedural | drift re-review after merging main c6268708, full pass: no blocking; 1 should-fix |
| 2026-11-24 | R-22 | spec | `a3ae263a` | claude-opus-5-5 | procedural | scoped: no findings |
| 2026-11-24 | R-22 | spec | `a3ae263a` | n/a | n/a | accepted by owner |
| 2026-11-24 | R-23 | spec | `c93e20eb` | claude-opus-5-5 | procedural | full pass after implementation commits: no blocking; 2 should-fix, 2 nit |
| 2026-11-24 | R-24 | spec | `daf697d1` | claude-opus-5-5 | procedural | scoped: no blocking; 1 should-fix |
| 2026-11-24 | R-25 | spec | `af2d805f` | claude-opus-5-5 | procedural | scoped: no blocking, no should-fix; 1 nit |
| 2026-11-24 | R-25 | spec | `af2d805f` | n/a | n/a | accepted by owner |
| 2026-11-24 | R-26 | spec | `372cc5cb` | claude-opus-5-5 | procedural | full pass after implementation commits: no blocking; 1 should-fix, 2 nit |
| 2026-11-24 | R-27 | spec | `7c41f1a2` | claude-opus-5-5 | procedural | scoped: no blocking; 1 should-fix |
| 2026-11-24 | R-28 | spec | `87a2ba87` | claude-opus-5-5 | procedural | scoped: no findings |
| 2026-11-24 | R-28 | spec | `87a2ba87` | n/a | n/a | accepted by owner |
| 2026-11-24 | R-29 | implementation | `644da0c0` | claude-opus-5-5 | procedural | 16 met, AC-08 not verified; 1 should-fix, 1 nit |
| 2026-11-24 | R-30 | implementation | `9daf9622` | claude-opus-5-5 | procedural | all 17 criteria met; 2 nit |

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

### R-5

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, Retention paragraph, "For a reviewer whose hit rate is unchanged, a label fails with probability at most 0.9 percent"); Context Owner summary ("an unchanged reviewer fails a label with at most 0.9 percent chance"); Acceptance Criteria AC-11, AC-12; Test Plan AC-11, AC-12 rows
EVIDENCE: I computed the per-label figure exactly (python3, P(Binomial(3,p) >= 2) * (1-p)^12). The maximum is 0.873 percent at p=0.137, so the stated 0.9 percent is correct, but it is per label and route. AC-11 and AC-12 pass only if no label fails on either route in either case. For N independent label and route pairs the upper bound on an unchanged reviewer failing at least one is 1-(1-0.00873)^N: 8.4 percent at N=10, 16.1 percent at 20, 29.6 percent at 40, 40.9 percent at 60. At realistic rates the per-label figure stays at 0.39 to 0.87 percent for p from 0.05 to 0.25, which is the band where labels drawn from findings raised only in later original rounds will sit. The enterprise candidates in the owner's repository hold 30, 61 and 68 `SEVERITY: blocking` records (the multiple VCS connections, hosted job pod resources and VCS inventory documents, each with 28 or more non-acceptance spec reviews), so dozens of labels per case are likely, and a correct implementation then fails AC-11 or AC-12 by chance with a probability the document never states. After the confirmation runs there is no further path: the criterion is simply not met. R-4 F-02 asked for the combined chance beside the rule; the previous revision removed the aggregate check but did not add it.
PROPOSAL: State beside the retention rule and in the summary the chance that an unchanged reviewer fails AC-11 or AC-12 for the expected label count, and either accept it explicitly or raise the confirmation so that the combined chance stays small (for example, more confirmation runs for a failing label, sized to the approved label count).

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Scoped re-review, second paragraph); Design (Glossary, Scoped re-review); Acceptance Criteria AC-05; Test Plan AC-05 row; Context Owner summary (re-review bullet); frontmatter goal
EVIDENCE: A scoped pass covers "the diff plus every section that states a rule, ID or term the diff changes" and outside that "reports only blocking findings". A should-fix finding from the previous pass that the author's revision did not address leaves no trace in the diff, so the next pass never raises it again. Today a full pass re-raises it (vh-adlc-reviewer.agent.md:52, "Return every finding you can establish in this pass"). The new spec skill also lets the author "resolve a judgement finding within the recorded rules" (Design, Open Questions and owner lists), so a finding dropped without a recorded choice is lost silently. The goal says "every real defect the current review raises is still raised", but the replay measures retention only on first passes and rounds only by count, and S17.scoped seeds no previous unaddressed finding, so no check would notice.
PROPOSAL: Add the previous pass's blocking and should-fix findings (already in the Review Log at X) to the scope: the reviewer confirms each is answered by the diff, a stated limit or a recorded choice in Design, and re-raises any that is not. Add a case to S17.scoped where a previous should-fix finding was left unaddressed and must be raised again.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Stated limit, "Adding one is the author's call, recorded in Scope, unless the limit excludes a case the goal, a criterion or a behavior Scope promises names; then it is an Open Question"); Scope (spec skill bullet); Acceptance Criteria AC-03, AC-06; Test Plan AC-03, AC-06 rows; Context Owner summary (stated limit bullet)
EVIDENCE: The author-side half of the stated limit rule has no home in the spec skill and no proof. Scope lists the spec skill changes as "author mode, review dispatch, review mode step 4 and the owner-facing nit list" and does not name stated limits. AC-03 covers only "That convention and the reviewer". AC-06 and S17.questions cover judgement findings under the plausible-choice rule, with no stated limit seeded. A spec skill that adds a limit excluding a case the goal names, without an Open Question, passes every listed check; one implementer will edit SKILL.md to describe stated limits and the exception, another will rely on the convention alone.
PROPOSAL: Name the stated limit and its Open Question exception among the spec skill changes in Scope and Design, extend AC-06 to cover it, and add a scripted case to S17.questions where one finding is answered by a limit the author adds and another would need a limit excluding a case the goal names, which must become an Open Question.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, "An independent agent matches findings to labels from `labels.md` and the stored records, and its verdicts are stored beside each run"); Acceptance Criteria AC-11, AC-12; Test Plan AC-11, AC-12 rows
EVIDENCE: Retention compares old-brief hits at any severity with new-brief hits at or above the minimum severity, and the verdicts come from one matching agent. The document does not say whether the matcher sees which brief, plugin commit or docs revision produced a record. A matcher that knows a run is the new brief can match loosely on borderline findings, and the implementation reviewer only "spot-checks the matcher's verdicts". One implementer passes run identities to the matcher, another strips them; the difference decides AC-11 and AC-12 on borderline labels.
PROPOSAL: State that the matcher receives each run's records with the brief, plugin commit, docs revision and run order removed, in shuffled order, and that the harness rejoins verdicts to runs afterwards.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-10 ("runs a case end to end ... and runs on a public fixture case in the test suite"); Test Plan AC-10 row; Design (Replay harness, step 2); AGENTS.md (local commands, "The vh-adlc plugin checker: `bun test tests/vh-adlc`")
EVIDENCE: An end-to-end case includes step 2's full loops, in which the spec skill revises the document between passes as a live `claude` session (the scenario session runner, tests/vh-adlc/scenarios/run.ts `session`, calls `claude` with maxTurns 80). The AC-10 row scripts only the reviewers. tests/vh-adlc/replay/run.test.ts sits under tests/vh-adlc, which AGENTS.md names as the routine plugin checker, so a live author session there makes the routine suite need a model. One implementer scripts the author too and the test proves only the harness plumbing; another runs a live author and the checker gains model calls.
PROPOSAL: State that run.test.ts scripts both the reviewer and the author (or stubs the loop step) and makes no model call, and say which part of "end to end" the live replays alone exercise.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-09 ("the convention and both user guides use the glossary terms with the glossary's meanings"); Test Plan AC-09 row ("the convention and both guides use each glossary term"); Design (Glossary, closing sentence)
EVIDENCE: The glossary has eleven rows, including Security defect, Data-loss defect, Tenant-isolation defect and Owner's recorded rules. The AC-09 test requires each guide to use each term. docs/get-started/first-feature.md is 96 lines and mentions review severity only in lines 42-46. Holding it to all eleven terms makes the implementer add definitional material a getting-started guide does not need, while a guide that uses only the terms it describes fails the test. The Design sentence says the guides "use these terms with these meanings", which reads as a meaning constraint, not a presence requirement, so two implementers would build different guides.
PROPOSAL: Hold each guide to the meanings of the terms it uses and require presence only of a named subset per guide (for example, product profile, severity by consequence, stated limit and scoped re-review in both), and keep the full-term presence check for the convention.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Design (Glossary, Scoped re-review, "and the sections it touches"); Acceptance Criteria AC-05 ("covers only the document diff and the sections it touches"); Design (Scoped re-review, "every section that states a rule, ID or term the diff changes"); Test Plan AC-05 row ("sections that state its terms")
EVIDENCE: The glossary and AC-05 say "the sections it touches", which reads as the sections holding diff hunks. Design and the S17.scoped pass condition say every section that states a rule, ID or term the diff changes, which can include untouched sections.
PROPOSAL: Use Design's wording in the glossary row and AC-05.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Context Owner summary (re-review bullet, "A pass is full again when covered code or the repository's docs pin changed"); Design (Scoped re-review, "a `covers` path outside the document or one of the docs pin bridge files ... changed")
EVIDENCE: Design makes a pass full on any change to `AGENTS.md`, `CLAUDE.md` or `.github/copilot-instructions.md`, not only a pin change, and on any changed `covers` path, which in this document includes user guides, not only code.
PROPOSAL: Say "when a covered path or a docs pin bridge file (`AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`) changed".

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Scope (Out of scope, "Not handled: a repository without its own pin ... (R-3 F-07; accepted by the owner after R-4)."); Design (Glossary, Stated limit)
EVIDENCE: The glossary defines a stated limit as a Scope line `Not handled: <the case>, <why> (R-<n> F-<nn>).`. The document's own stated limit ends "(R-3 F-07; accepted by the owner after R-4)", which does not match that form, and its reason follows a "because" clause rather than the `<the case>, <why>` order.
PROPOSAL: Write the line in the glossary form, for example "Not handled: ..., because no file in the repository changes (R-3 F-07).", and keep the owner acceptance in the Owner summary where it already appears.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context Owner summary (stated limit bullet, re-review bullet, Deferred bullet, nit bullet, replay paragraph, "Since the acceptance at R-5" paragraph); Design (Stated limit; Deferred items; Scoped re-review; Replay harness, labels approval paragraph and case.yaml `terms` bullet); Scope (Out of scope, the pinless `Not handled:` line)
EVIDENCE: The summary now says a stated limit is not raised again "except for those three defect classes". Design (Stated limit) also re-raises it for an unmeetable criterion or an unsolved problem, and so does AC-03. The summary accepted at R-5 (d73b31ea, line 51) said so, after R-1 F-12. This revision narrowed it again. The summary also calls the Deferred section "outside the reviewed text", but Design says "The reviewer reads the section" and raises a blocking finding on some entries. The revision also dropped owner decisions and limits the summary had at d73b31ea: the labels, profile and case are approved before any rule is edited (Design, Replay harness: approved "before the first commit that edits the reviewer, the spec skill or the companion convention"). That condition limits what "Acceptance authorizes the plugin edits" allows. Also dropped: the enterprise repository name is public while the second user's stays private unless they consent; the accepted pinless stated limit; when a pass becomes full again; where the full nit list goes; and that scope fields are always passed. The owner accepts against this summary.
PROPOSAL: Restore the stated limit's full re-raise conditions and say that the reviewer reads the Deferred section, with its blocking exception. Put the dropped owner decisions and limits back, especially that labels and case are approved before the first rule-editing commit.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Deferred items, last two sentences); Design (Stated limit); Design (Cut check); Design (Glossary, Deferred list); Acceptance Criteria AC-14; Test Plan AC-14 row (S17.deferred-review); Deferred (D-01 to D-06); Context Owner summary (Deferred bullet)
EVIDENCE: Design says the reviewer "raises nothing on" the Deferred section except an entry that drops an always-blocking defect or a case the goal or a criterion names. Only stated limits have a rule saying a later pass does not raise their substance again (Design, Stated limit). Nothing says whether an owner-deferred finding or a cut item may be raised again against the normative section where the gap still exists. One reviewer reads the entry as an answer. Another treats it as a note and raises the gap against Design on every pass. S17.deferred-review passes only on the first reading ("no finding names the sampler"). Findings deferred at acceptance also skip the cut check, which only runs after an owner-directed cut. The reviewer's exception then raises them as blocking on the next pass. D-02 is an example: it defers R-5 F-02, whose EVIDENCE cites the goal clause "every real defect the current review raises is still raised", so under the new rules this document's own entry would come back blocking. This mechanism was added by this revision.
PROPOSAL: State whether a Deferred entry answers its finding the way a stated limit does, with the same re-raise exceptions. Either run the cut check on findings deferred at acceptance, or say the owner's deferral at acceptance is a knowing drop that the reviewer does not raise again.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-14 row (S17.deferred); Design (Deferred items, entry format line and "each stated limit it adds"); Design (Stated limit, "Adding one is the author's call"); Deferred (D-01 to D-07, D-09)
EVIDENCE: S17.deferred uses scripted reviewer records and requires that "the author answers one finding with a stated limit". The author is a live session, and Design leaves the stated limit to the author's choice ("The author may answer a finding by adding a stated limit"). A correct author may add text instead, and then the two-entry pass condition fails. The row does not say how the scenario forces that choice or how the scripted owner defers a finding at acceptance. "The right `From:` values" is also undefined. The template is `From: <R-<n> F-<nn> | stated limit | owner cut on <date> | author cut>`, and a stated limit that answers a finding fits both the first and the second alternative. This document's own entries use neither form: D-01 reads "From: R-5 F-01, deferred by the owner at acceptance", D-07 reads "stated limit (R-3 F-07)" and D-09 reads "owner cut on 2026-11-22 (R-2 F-10)".
PROPOSAL: Have the scripted owner direct the stated limit and the acceptance deferral explicitly. Give the exact expected `From:` text for each entry, and make the template match the entries this document writes, or the other way round.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Follow-up review after delivery, first paragraph); Scope (In scope, follow-up review bullet; Out of scope, "A binary step for the follow-up review"); Acceptance Criteria AC-16; Test Plan AC-16 row; frontmatter goal ("every deferred item is judged once the feature is delivered"); Context Owner summary (follow-up bullet)
EVIDENCE: The review runs after a merge the session performs, when `cli.ts delivery` reports delivered or no publication path, or when there are no loop settings. Several cases are left out. `deliveryVerdict` returns `state: "manual"` with `delivered: false` when loop settings declare no `post_merge_watch` (plugins/vh-adlc/scripts/loop/delivery.ts:70), and `blocked` or `failed` in other cases (:78-80). The owner may also merge outside any session. The ship skill says it "never merges" (SKILL.md description, :113). `vh-adlc next` returns `do: none` for `complete` (rules block), and Scope excludes a binary step. So nothing tells a later session to run ship on a delivered feature, and the review that is "Invoking ship on a delivered feature" depends on someone remembering. The goal's last clause can fail silently, and the AC-16 proof starts by invoking ship on a merged fixture, so it never tests the trigger.
PROPOSAL: Name what prompts the follow-up review in the manual, blocked and failed states and after a merge outside the session, for example a line in the ship report and in lifecycle or resume intake for a complete document with pending entries. Add that to Scope and to the AC-16 proof.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Follow-up review after delivery, verdict list and "The owner sees gaps first, then follow-ups, with the drafts, and a count of the drops ... Each entry's `Verdict:` then records"); Design (Glossary, Follow-up review); Acceptance Criteria AC-16; Test Plan AC-16 row; Context Owner summary (follow-up bullet)
EVIDENCE: "drop: the delivered feature does not need it" also describes every follow-up, which by definition the delivered feature does not need now. S17.followup still expects "follow-up" for "one useful extension", so a correct session that calls it drop fails the proof. Approval is also unclear. Design shows the owner only "a count of the drops" and records verdicts "then", after approval for creating issues. The proof has the owner "approve only the drop verdict", which they cannot see, and then expects the drop recorded and the follow-up and gap left pending. Design does not say whether drops need approval, or what is recorded when the owner declines to file a follow-up or gap.
PROPOSAL: Define the verdicts so they do not overlap, for example: drop when no user of the delivered feature needs it now or later, or it is already covered. Say whether drop verdicts need the owner's approval, and if they do, list the drop items rather than a count. Say what a declined filing records, and make the S17.followup approval step match.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design (Follow-up review after delivery, "`bun scripts/labels/cli.ts file ... --output`" and "the existing `--preview --approved-digest` flow"); Scope; frontmatter covers; Acceptance Criteria AC-16; Test Plan AC-16 row ("Filing after approval reuses the labels flow already tested in `tests/vh-adlc/labels`")
EVIDENCE: The labels helper's `file` mode requires `--operation investigate|spec` (plugins/vh-adlc/scripts/labels/cli.ts USAGE; issue.ts:7 `operation: "investigate" | "spec"`). Investigate needs a verdict and a state label, and spec allows a type label only (issue.ts `stateFor`). With adopted ownership, `spec` refuses without `--ownership-spec` and updates that spec's issue aliases before creating the issue (cli.ts, the `beforeCreate` callback). references/issues.md "Who applies which label" gives ship no filing role. Design names no operation, type label or state label for a follow-up or gap issue, and neither `scripts/labels/` nor `references/issues.md` is in Scope or covers. The cited command cannot run as written, and two implementers would file under different operations, one of them possibly rebinding the delivered document's issue aliases.
PROPOSAL: Name the operation and labels a follow-up and a gap issue get, for example investigate with `track` and `needs-decision` for a gap. If the helper needs a ship operation, add `scripts/labels/` and `references/issues.md` to Scope and covers.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Failure, retry and rollback, "The rules change no state at run time"); Design (Follow-up review after delivery, issue creation and "committed as a documentation-only change on the default branch"); Context Owner summary ("approves filing in one batch"; "shipping and the pin bump need the usual approvals"); Acceptance Criteria AC-16; Test Plan AC-16 row; frontmatter covers
EVIDENCE: The follow-up review creates GitHub issues and commits verdicts to the default branch, so "The rules change no state at run time" is no longer true. references/authority.md:14 allows committing and pushing a feature document to the default branch only when it has no `branch` field, and only through spec, tasks or an implement claim. A delivered document keeps its `branch` (conventions/feature-documents.md, Frontmatter). Ship's authority covers the feature branch, the PR and the issue (authority.md:27). Nothing grants the verdict commit or its push, and nothing says what happens when a protected default branch rejects it. Partial failure is undefined too. If issues are created and the verdict commit or push then fails, the entries stay pending, and the next ship invocation drafts and may file the same issues again. This revision added the step and did not update the Failure section.
PROPOSAL: State which approval covers the verdict commit and push, and the fallback when the push is rejected. Make re-running safe, for example by recording each created issue link before the next one is filed, or by checking for an existing issue that names the D-entry. Update Failure, retry and rollback, and add references/authority.md to Scope and covers if it changes.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Gate on the resolved convention, first paragraph's list of old-pin behavior); Design (Failure, retry and rollback, "Every behavior change is gated"); Acceptance Criteria AC-08, AC-14, AC-15, AC-16; Test Plan AC-08 row
EVIDENCE: The gate says "Every rule below applies" on a convention with severity by consequence. Its list of old-pin behavior covers full passes, severity, nits and questions, but says nothing about Deferred entries, the cut check or ship's follow-up review. AC-08 covers "the reviewer, the spec skill and the owner-facing summary" and leaves out ship. Its old-pin controls are S17.scoped, S17.questions, S17.nits and S17.profile only. A spec skill that writes `## Deferred` sections and cut check lines, or a ship skill that runs the follow-up review and files issues on a repository pinned to 0c983f67, whose convention defines no Deferred section, passes every AC-08 control. This is the gap R-4 F-05 found for the profile, now opened again by the parts this revision adds.
PROPOSAL: Add the Deferred section, the cut check and the follow-up review to the gate's old-pin list, extend AC-08 to ship, and add old-pin controls of S17.deferred, S17.cut and S17.followup that expect today's behavior.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-09; Test Plan AC-09 row ("the convention and both guides use each glossary term"); Design (Glossary, Cut check and Follow-up review rows, and "The convention, the reviewer, the spec skill and both user guides use these terms"); Scope (convention bullet; Deferred items bullet; follow-up review bullet)
EVIDENCE: This revision added glossary rows for Cut check and Follow-up review. Scope puts the cut check in the spec skill and the follow-up review in the ship skill. The convention changes are listed in the first Scope bullet and the Deferred bullet, and neither includes them. The AC-09 test still requires the convention to use every glossary term. An implementer who keeps these plugin procedures out of the shared convention fails AC-09. One who passes it writes ship-specific procedure into `vhco-pro/docs` that Scope does not authorize. D-06 deferred the per-guide subset only, not the convention.
PROPOSAL: Name the glossary terms the convention must use, leaving out Cut check and Follow-up review unless Scope adds them to the convention, and make the AC-09 test check that list.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Deferred items, "The spec skill writes an entry for every deferral: ..."); Acceptance Criteria AC-14; frontmatter goal; Context Owner summary (Deferred bullet)
EVIDENCE: The list names four sources: stated limits, owner-directed cuts, author cuts under #141 and findings deferred at acceptance. The spec skill has a fifth. Its drift re-review step tells the author to "Ask the owner one question about the extra work and recommend dropping or deferring it" (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:141-144). An item deferred that way gets no Deferred entry, so it never reaches the follow-up review, although the goal promises that "every deferred item is judged once the feature is delivered".
PROPOSAL: Add drift re-review deferrals to the list of sources and to the `From:` template, and cover them in AC-14.

FINDING: F-11
KIND: factual
SEVERITY: nit
WHERE: Context Background (Harm and simplest alternative)
EVIDENCE: "the machinery is one loop command for the re-review scope and the replay harness". This revision adds a convention section, a ship procedure step that drafts and files issues and commits verdicts, and a per-pass growth measurement, and the statement does not mention or weigh them.
PROPOSAL: Update the harm statement to list the added parts and say why they beat the simplest alternative, such as filing an issue at the time of deferral.

### R-7

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Test Plan AC-14 row (S17.deferred); Acceptance Criteria AC-14; Design (Deferred items, source list; Stated limit, "That is a baseline change, so it is reviewed like any other")
EVIDENCE: The S17.deferred script has the owner answer R-1 F-01 with a stated limit, then accept R-1 while deferring R-1 F-02, then defer extra work in a drift re-review. It expects `From: drift re-review R-2.` and `vh-adlc fresh` still fresh "after each Deferred edit". A correct spec skill cannot follow that script. The stated limit adds a Scope line, which changes the normative baseline, so R-1 is stale (Design, Stated limit). The acceptance row must name a clean review whose commit has the current baseline (conventions/feature-documents.md at 0c983f67, `accepted` condition and Acceptance steps 1 to 4). A drift re-review applies only to a `planned` or `in-progress` spec (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:96-98), and reaching `planned` needs that gate to pass. So a correct implementation runs a new review after the stated limit, accepts that review, and the drift re-review becomes R-3, not R-2. The stated-limit entry is also written in the same revision as its Scope line, so `vh-adlc fresh` reports the spec review stale after that edit. The row was rewritten by the previous revision in response to R-6 F-03.
PROPOSAL: Put a scripted clean R-2 after the stated limit, have the owner accept R-2 while deferring R-1 F-02, and expect `From: drift re-review R-3.`, or derive the expected review IDs from the stored Review Log. Check freshness only after the acceptance and drift entries, which change nothing outside Deferred.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Follow-up review after merge, first paragraph: "the resume skill, finding a `complete` document with pending entries, reports them and names the step. Invoking ship on a complete document runs only this step."); Scope (follow-up review bullet, "a line in the ship report and the resume skill for a complete document with pending Deferred entries"); Acceptance Criteria AC-16 ("the ship report and resume flag a complete document with pending entries"); Test Plan AC-16 row; Context Owner summary (follow-up bullet)
EVIDENCE: Ship sets `complete` itself, in its Gate step, before it pushes or opens the PR (plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:86-90, then Deliver :95-111). So a document is `complete` on its feature branch long before its PR merges. Ship is also invoked again on such a document: a rejected push ends in "partial delivery" and is retried (:56-58, :102-104), and a feature PR takes follow-up commits through another ship run. Under "Invoking ship on a complete document runs only this step", those runs would skip the push and PR update and start a follow-up review whose merged code does not exist yet. Resume would likewise flag every complete, unmerged feature with pending entries. Design says the review runs "once the feature's PR is merged", but both triggers key on status alone. S17.followup seeds only a feature that is "complete and merged", so an implementation keyed on status passes. This sentence was added by the previous revision.
PROPOSAL: Key the ship and resume triggers on a merged PR (or the document being `complete` on the default branch), keep ship's normal delivery path for a complete document whose PR is not merged, and add a complete-but-unmerged control to S17.followup that expects no follow-up review.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-14 ("author cut"), AC-15 ("After every owner-directed deferral"); Test Plan AC-14 row; Test Plan AC-15 row; Design (Deferred items, `author cut` source; Cut check, first sentence)
EVIDENCE: AC-14 requires an entry with the exact source text for author cuts, but no Test Plan proof makes the author cut an extra under #141 or checks for `From: author cut.`. S17.deferred covers a stated limit, an acceptance deferral and a drift deferral. S17.cut covers one owner cut in session. AC-15 requires the cut check line after every owner-directed deferral, and Design lists four kinds: a cut in session, a proportionality answer of "narrow", a finding deferred at acceptance and drift-deferred extra work. Only the in-session cut is checked for a `Cut check:` line. S17.deferred has an acceptance deferral and a drift deferral, but its pass condition does not look for that line. A spec skill that writes no author-cut entry, or no cut check outside an in-session cut, passes every listed proof. Both composite criteria would then be untested in part. The cut check's coverage and the author-cut source were widened by the previous revision.
PROPOSAL: Add an author-cut step to S17.deferred that expects `From: author cut.`, and require a `Cut check:` line after its acceptance deferral and drift deferral, or narrow AC-14 and AC-15 to what the scenarios check.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Follow-up review after merge, "Before filing, the session searches the repository's issues for that line and records an existing issue instead of filing again, so a rerun after a partial failure files nothing twice"; Failure, retry and rollback, "the `Deferred:` line makes a rerun safe"); Acceptance Criteria AC-16 ("never twice for one entry"); Test Plan AC-16 row ("a second ship run creates no issue")
EVIDENCE: Verdicts are written only after filing, in one commit, so after a partial failure every entry is still pending and only the issue search prevents a duplicate. GitHub issue search reads a search index that can lag behind a just-created issue, so a prompt rerun can miss the issue it just filed. In S17.followup the second ship run starts after every verdict has been recorded, so no entry is pending and nothing is filed whether or not the search exists. The `gh` stub answers searches, but no step makes it answer one for a pending entry. An implementation with no duplicate check passes the proof.
PROPOSAL: Record each issue link in the entry's `Verdict:` as soon as that issue is created, or match the `Deferred:` line through the issue list rather than search. Add a case where the stub fails the second creation, then a rerun must file only the missing issue.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Follow-up review after merge, last paragraph: "one documentation-only commit of the verdicts to the default branch, pushed ... A rejected push makes the step partial: the report says so, keeps the local commit and asks whether to open a PR instead"); Design (Failure, retry and rollback); Test Plan AC-16 row; Context Owner summary (follow-up bullet, "approves filing in one batch")
EVIDENCE: Design does not say which checkout gets the verdict commit. After an authorized merge, `after-merge` removes the feature branch's clean worktree (vh-adlc-ship/SKILL.md:126-135), so the commit lands in some default-branch checkout. Keeping a rejected local commit there leaves the local default branch diverged from origin. The delivery convention syncs a shared checkout only with `git fetch` and `git merge --ff-only` (conventions/delivery.md:31 at 0c983f67), and the spec skill's own default-branch merge is `--ff-only` (vh-adlc-spec/SKILL.md:93). A later sync there then fails until someone resolves a commit nobody owns. authority.md already names a `default-branch-checkout-ff-only` method for another default-branch publication (references/authority.md:20). S17.followup checks issue calls and entry text, not where the commit lands or that it is pushed. The Owner summary says the owner "approves filing in one batch". It does not say that the same approval covers a direct push to the default branch, which is a permission the owner accepts. This step was added by the previous revision.
PROPOSAL: Name the checkout and method for the verdict commit, for example `default-branch-checkout-ff-only` in an owned clean checkout. On a rejected push, move the commit to a branch for the PR instead of leaving it on the local default branch. State the push permission in the Owner summary, and add the pushed commit to the S17.followup pass condition.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design (Replay harness, case.yaml `terms` bullet; "Before any new-brief run, the harness greps the whole vh-adlc tree at the feature head ... a hit stops the run"; "Cases are named "enterprise" and "small application", with no repository or product names"; The cases, Enterprise bullet); Acceptance Criteria AC-10, AC-11; Test Plan AC-10, AC-11 rows; Review Log R-5 F-01 EVIDENCE
EVIDENCE: `terms` holds "the document's title and the product's internal feature names and identifiers". The terms check greps the whole public tree, including this document. R-5 F-01's EVIDENCE (line 1003 at 471f5761, on public origin/main; `gh repo view michielvha/vh-adlc` reports PUBLIC) names the enterprise candidate documents of the owner's private repository by feature, with their blocking counts. The Enterprise rule selects one of them deterministically. Stored records stay verbatim (conventions/feature-documents.md:94-95 at 0c983f67), so the text cannot be edited away. If `terms` contains those feature names, every new-brief run stops and AC-11 to AC-13 cannot be run. If it leaves them out, the terms check no longer guards what Design says it guards, and the public record, together with the selection rule, already identifies the enterprise case.
PROPOSAL: Say whether the terms check skips stored review records, and choose the enterprise case without a rule that public text already resolves. Or record that the owner accepts this exposure and keep those names out of `terms`.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: frontmatter covers; Test Plan AC-16 row ("`bun test tests/vh-adlc/labels` gains `follow-up` mode cases")
EVIDENCE: The AC-16 proof adds cases under tests/vh-adlc/labels/ (file.test.ts, fake-gh.ts at 471f5761). covers names plugins/vh-adlc/scripts/labels/ and many other test paths, but not tests/vh-adlc/labels/.
PROPOSAL: Add `tests/vh-adlc/labels/` to covers.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Design (Glossary, Scoped re-review, "and the sections it touches"); Acceptance Criteria AC-05; Scope (Out of scope, "Not handled: a repository without its own pin ... (R-3 F-07; accepted by the owner after R-4).")
EVIDENCE: R-5 F-07 and R-5 F-09 are still unapplied at 471f5761. The glossary and AC-05 say "the sections it touches", while Design (Scoped re-review) says every section that states a rule, ID or term the diff changes. The document's own stated limit does not follow the glossary form `Not handled: <the case>, <why> (R-<n> F-<nn>).`.
PROPOSAL: Use Design's wording in the glossary row and AC-05, and write the Scope line in the glossary form, keeping the owner acceptance in the Owner summary.

### R-8

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-14 row (S17.deferred, "the owner accepts R-2 while "deferring R-1 F-02""); Acceptance Criteria AC-14; Design (Deferred items, `R-<n> F-<nn>, deferred at acceptance` source); Design (Cut check, "A deferral at acceptance that the check turns into a question holds the acceptance")
EVIDENCE: In the script, R-1 holds F-01 (answered by a stated limit), an extra the author cuts, and F-02. The owner defers F-02 only when accepting R-2, after the R-1 revision. A correct spec skill handles every R-1 finding in that revision: "Apply the eligible findings as one revision" (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:108-109). Judgement findings go to the owner before the revision commit (:112-113). Nits are fixed in the same commit once the pass changes the baseline (:122-124), and the stated limit does change it. So by the time R-2 runs, F-02 has been applied, answered as a question or fixed. The row gives F-02 no kind or severity and no step that keeps it unapplied, so there is nothing left to defer at R-2's acceptance. Depending on how F-02 is seeded, a correct implementation writes no `From: R-1 F-02, deferred at acceptance.` entry and fails the proof. This document's own acceptance deferrals (D-01 to D-06) defer findings of the review being accepted, R-5. The previous revision added this step when it adopted R-7 F-01's proposal.
PROPOSAL: Have scripted R-2 return no blocking finding and one should-fix finding, have the owner accept R-2 while deferring R-2 F-01, and expect `From: R-2 F-01, deferred at acceptance.`. Or say what kind R-1 F-02 is and how it stays unapplied through the R-1 revision.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Follow-up review after merge, first paragraph "For a merge done elsewhere ... Invoking ship on a merged complete document runs only this step", and last paragraph on the verdict commit); Design (Failure, retry and rollback); Scope (In scope, follow-up review bullet and `references/authority.md`); Acceptance Criteria AC-16; Test Plan AC-16 row (S17.followup, "complete and merged outside the session"); Context Owner summary (follow-up bullet)
EVIDENCE: A complete document keeps its `branch` field (conventions/feature-documents.md:45-46 at 0c983f67, "keeps it until the feature is closed"). The Handoff rule says that once a feature has a claim, a session writes to it "only when this session made that claim, or when the owner has said in this session that the earlier writer has stopped ... Invoking an operation is not a handoff" (plugins/vh-adlc/references/authority.md:213-217). Ship also runs the feature writer entry before any feature change (vh-adlc-ship/SKILL.md:44-46). There, `enter` returns `held` when another session's fingerprint holds the reservation (scripts/ownership/entry.ts:210-211). The fingerprint is derived from the session ID (scripts/ownership/identity.ts:38-47), and nothing releases a reservation at merge: branches.ts:340 and :411-415 keep the reservation history. The usual follow-up trigger is a merge done elsewhere followed by a later session. That session writes `Verdict:` lines and commits to a claimed feature, and the Design says nothing about the handoff or the reservation. One implementer stops and asks for a handoff. Another writes under the batch approval. S17.followup scripts no handoff, so the first implementer fails it. The Design also leaves open what happens when two sessions run the review at once, for example the shipping session after its merge and a resume elsewhere. Listing issues and then creating them is a check-then-create race.
PROPOSAL: State whether the follow-up review needs the feature writer entry and a handoff on a merged feature. For example, it may ask for the handoff in the same answer as the batch approval, or be exempt because the feature is merged. Script that answer in S17.followup, and say what a second concurrent session does.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Follow-up review after merge, last paragraph "one documentation-only commit of the verdicts ... pushed to it, so no local default branch is touched"); Design (Failure, retry and rollback); Scope (In scope, convention bullet and follow-up review bullet); Acceptance Criteria AC-16 ("in a commit pushed to the default branch"); Test Plan AC-16 row ("the fixture remote's default branch holds the verdict commit"); Context Owner summary (follow-up bullet, "pushing the verdicts to the default branch")
EVIDENCE: The pinned delivery convention says "Use short-lived branches and review changes through PRs". Only a private repository with one developer may record in its local instructions that small changes go straight to the default branch (conventions/delivery.md:43-48 at 0c983f67). Once a document has a `branch`, it "is edited only on that branch and returns to the default branch with the PR" (:99-101), and the documents-first exception covers only a document without a `branch` field (:96-97). vh-adlc is public (`gh api repos/michielvha/vh-adlc` gives `public`), and its AGENTS.md records no straight-to-default rule. The companion PR in Scope changes only conventions/feature-documents.md. So the plugin would push straight to the default branch in every public adopter repository, against a pinned convention the feature does not amend. The owner's approval in the summary covers the push but does not address the convention.
PROPOSAL: Raise an Open Question. Either add the delivery convention exception for verdict commits to the companion PR's scope, or push to the default branch only where local instructions record the straight-to-default rule and otherwise use the existing `docs/` branch and PR path.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-16 ("records every verdict, including declined filings"); Test Plan AC-16 row (S17.followup, "the owner approves filing the follow-up and the gap"); Design (Follow-up review after merge, `follow-up, not filed (owner declined)` and `gap, not filed (owner declined)`)
EVIDENCE: Before this revision, S17.followup had the owner decline one filing and expected `follow-up, not filed (owner declined)`. The previous revision changed the approval to cover both the follow-up and the gap, in response to R-7 F-04. Now no proof exercises a declined filing or checks either `not filed (owner declined)` verdict. An implementation that leaves a declined entry pending, or files it anyway, passes every listed check, so part of composite criterion AC-16 is untested.
PROPOSAL: Add a declined filing back to S17.followup, for example a fourth pending entry the owner declines, or a rerun case in which the owner declines the gap, and expect its exact `not filed (owner declined)` verdict in the pushed commit.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Follow-up review after merge, "its link is written into the entry's `Verdict:` in the working tree" and "one documentation-only commit of the verdicts, made in a temporary detached worktree"); Design (Failure, retry and rollback); Acceptance Criteria AC-16; Test Plan AC-16 row ("the run reports partial with the first link recorded. A rerun files only the missing issue")
EVIDENCE: Links are written "in the working tree" before the Design introduces the temporary worktree, so it is unclear which tree holds them. If a shared checkout holds them, it is left with an uncommitted edit to a file the pushed commit also changes, and a later `git merge --ff-only` there is refused. The Design defines a partial step only for a rejected push. It does not say whether a failed issue creation still commits and pushes the verdicts recorded so far. If it does, the run makes a second commit beyond the approved "one documentation-only commit". If it does not, the recorded first link exists only in an uncommitted temporary worktree that nothing preserves or cleans up. Whether the rerun needs fresh approval is also undefined: authority.md:48 says "an earlier approval ... never stands in for a missing approval". S17.followup does not say whether the scripted owner approves again, so an implementation that asks again can stall on the proof.
PROPOSAL: Name the tree that holds the links and when the temporary worktree is removed. Say whether a failed creation commits the verdicts so far and whether the rerun's commit is covered by the same approval or needs a new one. Make S17.followup's rerun step match.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, "The grep skips the stored review records under `### R-<n>` in feature documents"; "The implementation review dispatch names the case directories"; case.yaml `terms` bullet, "No document content is public"); Acceptance Criteria AC-10, AC-11, AC-12; Test Plan AC-10, AC-11 rows; Context Owner summary ("Case material stays private")
EVIDENCE: The terms check runs only "Before any new-brief run". The previous revision made it skip every stored review record, not only the records the owner accepted (records that name enterprise candidate documents with counts). The AC-11 proof has the implementation reviewer open the case directory and "spot-check the matcher's verdicts against the stored records". Its EVIDENCE will naturally quote label lines, finding text or the case.yaml clone path, which can carry the second user's repository name. Review records are stored verbatim (conventions/feature-documents.md:94-95 at 0c983f67) in a public repository, and nothing checks them for case terms: they are written after the runs, and the check now skips them. The AC-10 proof plants a term only "in the tree or the companion diff". It does not check where the skip ends, so an implementation that skips whole feature documents also passes.
PROPOSAL: Tell the implementation reviewer in the AC-11 and AC-12 rows to cite case material only by label ID, count and digest. Run the terms check again on the document and the results file before the implementation review is stored or shipped. Add a fixture case where a planted term inside a `### R-<n>` record passes and the same term in Design stops the run.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Scope (In scope, follow-up review bullet, "a line in the ship report and the resume skill for a complete document with pending Deferred entries")
EVIDENCE: The previous revision keyed the trigger on the merge in Design, AC-16 and the Owner summary ("a merged complete document", "runs only for a merged feature"). It left this Scope bullet keyed on `complete` alone, though R-7 F-02 named it in its WHERE.
PROPOSAL: Say "for a merged complete document with pending Deferred entries".

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Context Background ("`scriptedPlugin`, `:1114-1121`"); Design (Tests that change, "`tests/vh-adlc/scenarios/run.ts:1114-1120`")
EVIDENCE: The two places cite different ranges for the same function. In tests/vh-adlc/scenarios/run.ts at 14d15c23, the comment starts at 1114, `function scriptedPlugin` is at 1116 and its closing brace is at 1122.
PROPOSAL: Cite `:1114-1122` in both places.

### R-9

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Follow-up review after merge, first paragraph: "the ship report on a merged feature ends with the count of pending Deferred entries, and the resume skill, finding a merged `complete` document with pending entries, reports them" and "Invoking ship on a merged complete document runs only this step"; the delivery paragraph: "makes a temporary worktree on a new branch `docs/follow-up-<slug>` from the remote default branch", "If an issue creation fails, it still commits and pushes what it recorded, reports the step as partial, and stops. A rerun asks the owner again for the entries still pending and adds its commit to the same branch and PR"); Design (Failure, retry and rollback, "a rerun files only what is missing"); Scope (In scope, follow-up review bullet, "a line in the ship report and the resume skill for a merged complete document with pending Deferred entries"); Acceptance Criteria AC-16; Test Plan AC-16 row (S17.followup); Context Owner summary (follow-up bullet, "The ship report and resume flag a merged feature with pending items")
EVIDENCE: Verdicts now land only on `docs/follow-up-<slug>`, and the session "never merges" (line 402 to 403 at 6abdbd3b). On the default branch every entry still reads `Verdict: pending.` until the owner merges that docs PR. The ship report, resume and "ship on a merged complete document" all key on pending entries of a merged complete document and do not say which copy of the Deferred section they read. After a follow-up review that completed fully, the next resume flags the same entries again, and a ship run repeats the review: drops are judged again, declined filings are offered again, and "a new branch `docs/follow-up-<slug>`" collides with the branch that already exists. The rerun sentence covers only the partial case and does not define "still pending" either. The partial path "stops" without saying whether it opens the PR or removes the worktree, yet the rerun "adds its commit to the same branch and PR", and a worktree left in place still holds that branch. S17.followup has a rerun only after a partial run; no case resumes or reruns after a full run with the docs PR still open. This traces to this revision's change from a direct default-branch push to a docs PR.
PROPOSAL: Say that while an open `docs/follow-up-<slug>` PR exists, its branch decides which entries are pending (or that an open follow-up PR replaces the resume and ship-report flag with a pointer to that PR), and that a partial run opens the PR and removes its clean worktree before it stops. Add a control to S17.followup in which resume and ship run after a complete follow-up review whose PR is still open, and expect no second review and no new branch.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design (Follow-up review after merge, "The session makes a temporary worktree on a new branch `docs/follow-up-<slug>` ... and removes the temporary worktree", "The owner's approval covers creating the approved issues, that branch, its push and the PR; `references/authority.md` adds this to ship's authority", "needs no feature writer entry or handoff"); Scope (In scope, follow-up review bullet, "the authority for its issues and verdict commit (`references/authority.md`)"; Out of scope, "the worktree removal rule in `conventions/delivery.md:26`: a second, smaller change"); Acceptance Criteria AC-16 ("without a writer handoff"); Test Plan AC-16 row
EVIDENCE: plugins/vh-adlc/references/authority.md:92-93 says "Outside the maintenance, audit and docs-drift roles below, never create, remove, prune, reset or force-move a worktree", and :89-90 says "the plugin itself still creates none". conventions/delivery.md:26 at 0c983f67 says "Remove a worktree only when the owner asks". The Design has ship create and remove a worktree, but the approval it defines covers only "the approved issues, that branch, its push and the PR", and Scope keeps the delivery.md:26 rule out of this change. The Design also exempts the follow-up review from the writer entry and the handoff, but names no change to authority.md's Handoff section (:213-217, "write to it only when this session made that claim") or to ship's "Before starting feature changes or delivery, follow feature writer entry" (vh-adlc-ship/SKILL.md:44-45) and Start step 2 (:72-73). An implementer who follows the plugin's references refuses to create the worktree or stops for a handoff. Another widens authority only inside the ship skill and leaves the references contradicting it. The named branch and the worktree removal were added by this revision; the temporary worktree came with the revision before R-8.
PROPOSAL: Name the authority.md changes: a ship follow-up role that may create, lock and remove its own clean temporary worktree, with creation and removal listed in what the owner's approval covers so delivery.md:26's "owner asks" is met, and a Handoff exception for a merged complete feature that edits only its Deferred section. Name the matching ship skill exception to the writer entry and Start step 2.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Follow-up review after merge, "Drops are recorded without approval. The owner approves, in one answer, which follow-ups and gaps to file." and "The owner's approval covers creating the approved issues, that branch, its push and the PR"); Context Owner summary (follow-up bullet, "One approval covers filing the chosen issues and opening a short docs PR with the verdicts"); Acceptance Criteria AC-16; Test Plan AC-16 row
EVIDENCE: Recording any verdict now needs a branch, a push and a PR, and the Design ties their authority to the filing approval. When every pending entry is a drop, there is no follow-up or gap to approve, so no approval is asked, yet drops "are recorded without approval" through a branch and PR that only the approval covers. The same holds when the owner declines every filing. authority.md:48 says "an earlier approval ... never stands in for a missing approval", and ship's own grant covers only "the feature branch, create or update its one PR" (vh-adlc-ship/SKILL.md:16-17). One implementer pushes and opens the PR without asking; another asks a separate question or records nothing. Both plausibly arise: the S17.followup fixture already has an entry the merged code covers. No proof covers an all-drop or all-declined run. This traces to this revision's move from a commit to a docs PR.
PROPOSAL: Say that the session always asks one question covering the branch, push and PR, together with any filings, even when it files nothing, or that invoking ship on a merged complete document is itself that authority. Add an all-drop case to S17.followup that expects the chosen behavior.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, "The grep skips the stored review records under `### R-<n>` in feature documents" and "the harness runs the terms check again on this document and the results file before an implementation review is stored and before ship"); Test Plan AC-11 row ("the harness's terms check on this document and the results file passes before the review is stored"); Test Plan AC-12 row; Acceptance Criteria AC-10, AC-11, AC-12; Context Owner summary ("Case material stays private ... the second user's repository name stays private unless they agree")
EVIDENCE: The repeated terms check runs on "this document" before the implementation review is stored, so the review's own records are not in the document yet. Once stored, they sit under `### R-<n>`, which the grep skips, and the check before ship skips them as well. So the implementation review's records are never checked for case terms, although they are where R-8 F-06 located the risk: a reviewer spot-checking matcher verdicts quoting a label line or the case.yaml clone path that carries the second user's repository name. The AC-11 row passes the check whatever those records contain, so a leaking review passes the proof. The only remaining guard is the dispatch instruction. This revision added the re-check in response to R-8 F-06, and the existing skip cancels it.
PROPOSAL: Run the terms check on the returned implementation review records before they are stored, without the `### R-<n>` skip, and limit the skip to the records the owner accepted (R-1 to R-8). Make the AC-11 row and the AC-10 fixture check a planted term in a newly returned record.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria AC-16 ("never twice for one entry"); Scope (Out of scope, "Not handled: two sessions running the follow-up review on one feature at the same time ... (R-8 F-02)"); Context Owner summary ("Accepted limit: two sessions running the review on one feature at the same time can file an issue twice"); Design (Follow-up review after merge, "Two sessions running it on one feature at once is a stated limit in Scope"); Design (Failure, retry and rollback, "a rerun files only what is missing"); Deferred D-10
EVIDENCE: AC-16 still says "never twice for one entry" without qualification, while this revision's stated limit and Owner summary say two concurrent sessions can file an issue twice. The proof checks only a sequential rerun.
PROPOSAL: Qualify AC-16 as "never twice for one entry across reruns in one session at a time", matching the stated limit.

### R-10

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: frontmatter covers; Design (Tests that change); Design (Open Questions and owner lists, second paragraph: "#141 lands first and lets the author cut an extra it added without a question; that exception stays, and this rule covers the rest of step 4"); Design (Deferred items, "`author cut` for an extra the author removes under #141"); Scope (In scope, "the scenarios and the tests that pin the changed text"); Acceptance Criteria AC-06, AC-09, AC-14; Test Plan AC-09, AC-14 rows
EVIDENCE: PR #155 (commits 41355739 and 6081943b, merged at d3ad7ce2) added tests/vh-adlc/author-extras.test.ts, which did not exist at R-9's commit 6abdbd3b. It pins spec skill step 4 sentences that this feature reworks under the plausible-choice rule: "where they behave differently, the choice is an Open Question recommending removal", "A removal that touches a criterion, an owner decision or a public contract keeps the Open Question." and "record the removal in the Outcome cell of that pass's Review Log row". It also pins text in both user guides that AC-09 has this feature edit: "is removed without asking you and noted in the Review Log" (docs/user-guides/workflows.md) and "It removes an extra it added on its own" (docs/get-started/first-feature.md). The test is not in covers, so `feature_tree_clean` and `vh-adlc fresh` ignore it, and Tests that change neither moves it nor says it stays. The Design adds a `From: author cut.` Deferred entry for the same removal that #141 records in the Outcome cell, without saying whether the Outcome record stays beside it. One implementer keeps both; another replaces the Outcome record and breaks this test. The other new prerequisite test, tests/vh-adlc/proportionality.test.ts, is already in covers and named in Tests that change.
PROPOSAL: Add tests/vh-adlc/author-extras.test.ts to covers and to Tests that change. Say whether its assertions stay as they are, including that the Outcome-cell record of an author cut stays next to the new `author cut` Deferred entry.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context Background (text items 2, 4 and 5; Harm and simplest alternative); Design (Gate on the resolved convention); Design (Severity by consequence); Design (Scoped re-review); Design (Open Questions and owner lists, second paragraph); Design (Deferred items, drift re-review source)
EVIDENCE: PR #152 (merge d0d7e10d) inserted six lines into plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md and the harm statement and convergence trigger into plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md. PR #155 (merge d3ad7ce2) added five more lines to step 4. As a result, every cited line into these two files has moved. At d3ad7ce2 the reviewer has "A path the document leaves undefined is a finding" at :55 (cited :49), the failure-mode paragraph at :53-56 (cited :47-50) and "Return every finding you can establish in this pass" at :58 (cited :52). The spec skill has "Put every judgement call into Open Questions" at :84 (cited :81 and :81-82), "Turn judgement findings into Open Questions" at :122 (cited :112), the remove-or-revisit rule at :124-132 (cited :114-117 and :112-116), the nit-rule gating at :135-143 (cited :120-128) and the drift re-review extra-work question at :156-159 (cited :141-144). The cited text still exists and still says what the document claims, so nothing that is built changes.
PROPOSAL: Re-cite these locations at the commit of the next revision that touches them.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: frontmatter status_description ("Next: tasks, after PR #152 and #141 land."); Context Owner summary ("It builds on PR #152 and #141, which land first")
EVIDENCE: Both prerequisites have merged on the default branch. PR #152 merged at d0d7e10d, and #141 was closed by PR #155, which merged at d3ad7ce2 (git log 6abdbd3b..d3ad7ce2). The status line and the Owner summary still describe them as pending, so the reader is not told that tasks can start now. Neither location is in the normative baseline.
PROPOSAL: Say that #152 and #141 have merged, and point status_description at tasks.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Context Background ("**Harm and simplest alternative.**" paragraph)
EVIDENCE: PR #152 added the spec skill rule "Start Background with the harm statement from `references/loop.md`" (vh-adlc-spec/SKILL.md:75-77 at d3ad7ce2). It also added the loop.md alternative "waiting for a later milestone" and the reviewer check "Weigh the design against its harm statement ... the simplest alternative without machinery it rejected" (vh-adlc-reviewer.agent.md:47-51). In this document the harm statement comes at the end of Background, not the start. The alternative it rejects is "a process rule alone", backed by round counts taken before #152's convergence trigger and #141's author-cut exception merged. Both of those are process rules and are now in force. The statement does not weigh waiting to measure their effect before building review-scope, the follow-up review and the replay harness. The replay partly answers this: its old brief is the plugin at the merge base, so it already includes #152 and #141, and AC-13 compares against them. The reviewer rates this check nit because the document is past `draft`.
PROPOSAL: At the next revision, move the harm statement to the start of Background and add one sentence explaining why the merged convergence trigger and author-cut exception are not enough alone, citing the replay's old brief as the measure.

### R-11

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Replay harness, results paragraph: "labels raised per run by ID and severity, rounds to clean, questions raised, body size per pass"); Scope (Out of scope, "Counting the Open Questions the author raises in the replay loops"); Context Owner summary ("the question rule is proved by scenario, not counted in the loops"); Acceptance Criteria AC-13; Test Plan AC-13 row; Tasks T23, T24; Deferred D-15
EVIDENCE: This revision drops the Open Question count from AC-13, its Test Plan row, Rounds and T24. The built harness, a covered path, still makes it a pass condition. tests/vh-adlc/replay/run.ts at the commit has `totals()` emit "| Open Questions | ${oldQ} | ${newQ} | new fewer than old | ${newQ < oldQ ? "yes" : "no"} |" next to the spec review and growth conditions. `renderCase` writes an "Open Questions" column per loop, and live.ts:117-122 counts increases between commits. The new Scope line says that count "reads zero", so the published results.md would show "Met: no" for a condition the document no longer has. The Design's results paragraph still lists "questions raised". No unchecked task changes the harness. T23 and T24 write results.md with the harness as it is.
PROPOSAL: Remove the Open Questions condition and column from the harness totals and results (or keep the count as information only, with no Condition or Met cell), drop "questions raised" from the Design's results paragraph, and add a new task with a run.test.ts case that checks the totals table.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design (Replay harness, "Every counted pass, its verdicts and every loop's documents are stored in the case directory as they finish, and the results are assembled from those stored runs, so a run that stops loses no finished pass"); Design (Replay harness, approval-order paragraph, "The new brief then moves to the fixed plugin and every new-brief run repeats; the old-brief runs stay valid because the old brief does not change"); Design (Replay harness, "Both briefs are fixed before the first run, apart from that one owner-allowed move of the new brief"); Context Owner summary ("every new-rules run repeats on the fixed plugin"); Acceptance Criteria AC-10; Test Plan AC-10 row
EVIDENCE: Both sentences were added by this revision, and the built harness does neither. In tests/vh-adlc/replay/run.ts `runCase` always runs `await pass("old", FIRST_PASSES.old)` before the new passes, and old loops too. It writes passes and loop documents to `<case>/runs/` with writeFileSync, but nothing ever reads them back. `firstPasses` starts every set at `counted: 0`. Results come from the in-memory `data` plus the `replay-data` block already in results.md. `writeResults` keeps earlier entries only when `JSON.stringify(before.briefs) === JSON.stringify(data.briefs)`, so moving `--new-plugin` to the fixed plugin throws away the case's earlier old-brief results and the harness reruns the old brief. A first-pass set interrupted mid-way, or an exception from an executor, writes nothing to results. run.test.ts covers only a loop that keeps failing ("stops the run after writing every first pass") and route merging with the same briefs.
PROPOSAL: Either build what the Design says (reuse the stored old-brief runs when only the new brief moves, and assemble results from the stored passes) with run.test.ts cases in a new task, or reduce the two sentences to what the harness does: the old brief reruns with the new one, and when a loop stops, the first passes are written.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, approval-order paragraph, "The one exception is the owner's decision of 2026-11-23: after the first complete replay result ... the owner allowed one generic reviewer fix"); Design (Replay harness, "apart from that one owner-allowed move of the new brief"); Context Owner summary ("After the first complete enterprise result, the owner allowed one generic reviewer fix"); Acceptance Criteria AC-11, AC-12; Test Plan AC-11, AC-12 rows
EVIDENCE: The order rule exists "so the rules cannot be fitted to them". The exception lets one reviewer edit in after the enterprise labels showed which defects failed, but no proof bounds it. The AC-11 row checks only that the approval line "predates the first rule-editing commit in both repositories". That stays true however many reviewer, spec skill or convention edits follow the first result. The exception does not name the allowed commit (ef685da1, "fix(review): check every finding against the always-blocking classes"). It also leaves "first complete replay result" undefined. ef685da1's message and its status_description say the result was "The enterprise replay on the Claude route", not both routes. The results file already records each run's plugin commit, so checking the brief move would be cheap.
PROPOSAL: Name ef685da1 as the one allowed edit and say which result it followed. Add to the AC-11 and AC-12 rows a check that the plugin and docs revision of the new brief in results.md differ from the first new brief only by that commit's reviewer change.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design (Severity by consequence, "The reviewer's failure-mode paragraph (`vh-adlc-reviewer.agent.md:47-50`) keeps asking the same four questions and rates each gap on this scale"); Design (Glossary, Security defect, Data-loss defect, and "The reviewer, the skills and both user guides use these terms with these meanings"); Design (Replay harness, exception parenthetical); Acceptance Criteria AC-04, AC-09; Test Plan AC-04 row
EVIDENCE: ef685da1 added two reviewer rules on the new-pin path (vh-adlc-reviewer.agent.md:60-66 at the commit). First: "Before you settle any finding's severity, check it against the always-blocking classes ... is blocking whichever section or path it came from and however unlikely the path looks". Second: "When you are unsure whether people using the product would hit a failure path, rate it should-fix rather than nit or dropping it". The Design states neither as a reviewer rule. They appear only as a parenthetical inside the replay order exception. The restated classes also go beyond the glossary: "forge or bypass an authorization", "reach a credential or secret" and "silently drops data" against "read or act beyond their authorization, or exposes a credential or secret" and "Loss or corruption". The only proof is a wording test (proportional-review.test.ts, added in ef685da1), and Background says "Wording tests do not show that a rule changes behavior". No scenario exercises the uncertain-path rule.
PROPOSAL: State both rules in Severity by consequence, make the reviewer's class wording match the glossary (or widen the glossary), and extend the S17.profile pass condition or add a scenario so the uncertain-path rule is observed.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Tasks T13 and T15 (S17.deferred-review); frontmatter status_description ("T1 to T22 stay done"); Test Plan AC-03, AC-04, AC-05, AC-14 rows
EVIDENCE: Every real-reviewer scenario on the new pin ran before the reviewer changed. `git log -1` on tests/vh-adlc/evidence/claude-code/S17.profile.single.md, S17.limit.stated.md, S17.scoped.md and S17.scoped-command.md gives 2b59a976 (2026-11-23 16:02), and S17.deferred-review.md gives 0fcd4c4f (16:12). ef685da1 changed the new-pin severity paragraph at 21:39. S17.profile.single.md records "vh-adlc 0.30.1 at 0f37ba1". The new rule "rate it should-fix rather than nit" bears directly on S17.profile's pass condition "the lock gap is nit or absent with the first". The always-blocking check bears on S17.limit and S17.deferred-review. The tasks stay ticked and no unchecked task reruns them. T23 and T24 repeat only the replay runs.
PROPOSAL: Add a new task to rerun S17.profile, S17.limit, S17.scoped, S17.scoped-command and S17.deferred-review on the fixed reviewer and record the results.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: frontmatter covers; Design (Tests that change); Design (Open Questions and owner lists, "#141 lands first and lets the author cut an extra it added without a question; that exception stays"); Design (Deferred items, `author cut`); Scope (In scope, "the scenarios and the tests that pin the changed text"); Tasks T7
EVIDENCE: `git diff --stat fdbe0da9 9e9236a0` shows this feature adds or changes files that are not in covers. Among them is plugins/vh-adlc/scripts/loop/review-scope.ts (78 lines), which holds `reviewScope`, the computation behind AC-05. It is not covered, although cli.ts and review-scope.test.ts are. The others are tests/vh-adlc/scenarios/gh-stub.ts (S17.followup's stub), tests/vh-adlc/fixtures.test.ts, tests/vh-adlc/check.test.ts, and the S17 and S16.oldpin-reviewer evidence files under tests/vh-adlc/evidence/claude-code/. `reviewScope` itself decides a full pass from covers (`compileCoverage`), so a change to review-scope.ts alone keeps the next pass scoped, and `feature_tree_clean` ignores it. R-10 F-01 (author-extras.test.ts not in covers or in Tests that change) is still unapplied, and no Deferred entry records it. T7 relies on that test and on "its Review Log record", but the Design still does not say that the Outcome-cell record stays beside the `From: author cut.` entry.
PROPOSAL: Add these paths (or their directories) to covers, name author-extras.test.ts in Tests that change, and say in Design that an author cut keeps its Outcome-cell record next to the Deferred entry.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Context Owner summary ("Nothing has run yet."; "Since the acceptance at R-5, the owner added ..."; "Acceptance authorizes the plugin edits, the replay harness and the companion convention PR on a feature branch; shipping and the pin bump need the usual approvals")
EVIDENCE: The same summary reports "After the first complete enterprise result", and Tasks T1 to T22 are ticked with observed scenario, test and replay-harness evidence. The pin bump is done (T21, 5db8473c, AGENTS.md and knowledge.md at e79eaa6a). The last acceptance is R-9, not R-5. The summary does not mention a normative change this revision made, the stored-runs sentence in Replay harness. The convention asks the summary to "distinguish planned checks from observed proof" and to "Explain material changes since the last accepted scope". An owner reading it before acceptance is told that nothing has been proved and that the edits are still to be authorized.
PROPOSAL: Replace "Nothing has run yet" with the actual validation state: T1 to T22 done, the first enterprise result, and the replays still to run. Tie the change paragraph to the R-9 acceptance and list this revision's changes.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Design (Severity by consequence, `vh-adlc-reviewer.agent.md:47-50`); Design (Scoped re-review, `vh-adlc-reviewer.agent.md:52` and `scripts/loop/cli.ts`); Design (Open Questions and owner lists, `SKILL.md:81-82`, `:112-116`); Design (Gate on the resolved convention, `SKILL.md:120-128`); Design (Deferred items, `SKILL.md:141-144`); Design (Replay harness, `scripts/loop/cli.ts:161-162`)
EVIDENCE: R-10 F-02 is still unapplied, and more lines have moved since. At the commit, the reviewer's failure-mode paragraph is at :55-68, and "Return every finding you can establish" is at :79 and already reads "within this pass's scope". In the spec skill, "Put every judgement call into Open Questions" is at :84, "Turn judgement findings into Open Questions" at :125 and the nit rule gating at :140-149. The command route reads its policy at the reviewed commit at cli.ts:181-182, not :161-162. The cited text still says what the document claims.
PROPOSAL: Re-cite these locations at the commit of the next revision.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Context Background ("**Harm and simplest alternative.**" paragraph)
EVIDENCE: vh-adlc-spec/SKILL.md:75 at the commit says "Start Background with the harm statement from `references/loop.md`". The harm statement is still the last paragraph of Background, as R-10 F-04 noted, and that finding is unapplied.
PROPOSAL: Move the harm statement to the start of Background.

### R-12

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, "A run of the new brief alone reuses the old-brief passes and loops already stored, so moving the new brief reruns only the new brief"; "the results are assembled from those stored runs, so a run that stops loses no finished pass"; approval-order paragraph, "the old-brief runs stay valid because the old brief does not change"); Tasks T25; Test Plan AC-10, AC-13 and AC-17 rows; Acceptance Criteria AC-10; Context Owner summary ("builds the replay results from the stored private runs")
EVIDENCE: This revision answers R-11 F-02 by building the reuse and the assembly (T25). But neither the Design nor T25 says how the harness decides that stored old-brief runs belong to the current old brief, and no Test Plan row names a check for either behavior. T25's done condition is only "run.test.ts passes, including a check of the totals table", and the AC-10 row does not list a reuse or assembly case. At the commit, tests/vh-adlc/replay/run.ts keeps one `briefs` object per case (line 245) and keeps earlier results only when `JSON.stringify(before.briefs) === JSON.stringify(data.briefs)` (line 295), so T25 has to replace that identity check. Suppose one implementer reuses every stored old-brief run, with no check of its plugin commit and docs revision. The old totals behind AC-11 to AC-13 and AC-17 could then mix briefs, and every proof the document names would still pass. The AC-11 brief check covers only the new brief.
PROPOSAL: Say that a new-brief-only run reuses only stored runs whose recorded old plugin commit, docs revision, route and model match the current old brief, and refuses otherwise. Add cases to the AC-10 row and T25: a matching stored set is reused, a mismatched one is refused, and results assembled after an interrupted first-pass set keep its finished passes.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context Background ("**Harm and simplest alternative.**" paragraph, `SKILL.md:114-117`)
EVIDENCE: This revision moved the harm paragraph to the start of Background, ahead of "Measured on `main` at `915441e8`". Its citation `SKILL.md:114-117` was taken at 915441e8, where those lines hold the remove-or-revisit rule. A reader now takes the citation at the reviewed commit. There, vh-adlc-spec/SKILL.md:112-118 is the convergence trigger in step 4, and the remove-or-add rule is at :129-131 and the revisit sentence at :136. This traces to the previous revision's move.
PROPOSAL: Re-cite the rule at the reviewed commit (`SKILL.md:129-137`), or say the citation is at 915441e8.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context Owner summary (first bullet, "a failure path is blocking or should-fix only when someone using that product would plausibly hit it"; "Validation so far: ... The replays on the fixed reviewer are still running."); frontmatter status_description ("T1 to T22 stay done; T23 and T24 continue after acceptance")
EVIDENCE: Severity by consequence and AC-04 now say that a failure path the reviewer is unsure about is rated should-fix rather than nit or dropped (vh-adlc-reviewer.agent.md:66-67). The summary still says should-fix applies "only when someone ... would plausibly hit it". The summary's validation line mentions only the replay reruns. It leaves out that the real-reviewer S17 scenarios ran before ef685da1 and rerun under T26, and that T25 changes the harness before T23 and T24. status_description names only T23 and T24. Neither location is in the normative baseline.
PROPOSAL: Add the uncertain-path rule to the first bullet. Name T25 and T26 as the remaining work in both the validation line and status_description.

### R-13

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, "Each brief records its plugin commit, docs revision and model per route beside its stored runs"; "`assemble` checks every stored set the same way"; "the results are assembled from those stored runs"); Tasks T25; Test Plan AC-10 row; Test Plan AC-11 row (brief check)
EVIDENCE: This traces to the previous revision's answer to R-12 F-01. The new rule keeps one identity per brief and route, not per stored run. The harness at the commit names its private files `${name}-${route}-pass-${n}.txt` (tests/vh-adlc/replay/run.ts, the `pass` store callback in `runCase`), and n restarts at 1 on every invocation because `firstPasses` starts from a fresh set (`n = set.runs.length + 1`). The first new brief `5e94e593` on the Claude route had failing labels (ef685da1's message: always-blocking defects "only at should-fix"), so it took the six confirmation passes, plus any failed runs, which also take an n. Suppose a rerun on the fixed brief needs no confirmation. It overwrites passes 1 to 6 and leaves the higher-numbered `5e94e593` passes in place. With one identity per brief and route, the directory then reads as the fixed brief, and `assemble` counts those leftovers, so AC-11's retention verdict can mix two new briefs. The AC-11 brief check compares only the brief named in the results file. No AC-10 case covers a set that still holds runs of an earlier brief with the same name.
PROPOSAL: Store the plugin commit, docs revision and model with each run, as `RunEntry` already does in the results, and have `assemble` and the reuse check count only runs whose own identity matches. Alternatively, clear a brief's stored set when its identity changes. Add that case to the AC-10 row and T25.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, "A run of the new brief alone reuses the old-brief passes and loops already stored only when that recorded identity matches the current old brief and route, and refuses otherwise"; "Moving the new brief therefore reruns only the new brief"; approval-order paragraph, "the old-brief runs stay valid because the old brief does not change"); Context Owner summary ("every new-rules run repeats on the fixed plugin"); Tasks T25
EVIDENCE: The old-brief runs of the first complete enterprise result were stored by the harness as it was before T25. That harness writes only pass text, verdict JSON and loop documents to `<case>/runs/`. Plugin commit, docs revision and model go only into the `replay-data` block of the results file (`writeResults`). The results file is not in the tree at the commit: `git ls-tree -r --name-only 529d2648 tests/vh-adlc/evidence/proportional-review/` lists only `canned/`. So the stored set the Design means to reuse has no identity "beside its stored runs". Under the new rule a new-brief-only run must either refuse it, which reruns the old brief and contradicts "reruns only the new brief" and "the old-brief runs stay valid", or accept an identity someone writes by hand, which the check cannot verify. The Design does not say which. Two implementers would differ in whether the owner waits for a full old-brief rerun.
PROPOSAL: Say where a set stored before T25 gets its identity, for example the per-run identities in the `replay-data` block that run wrote, checked run by run. Otherwise state that the old brief reruns for every case and route, and change the reuse sentences and the Owner summary to match.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria AC-10; Test Plan AC-10 row; Design (Replay harness, stored-runs paragraph)
EVIDENCE: The previous revision added reuse of a matching stored old-brief set, refusal of a mismatched one, and assembly after an interrupted first-pass set to the AC-10 row and to T25. AC-10's text still lists only "runs a case end to end, refuses a case whose approval line is missing ... records failed executions without counting them as passes, and runs on a public fixture case". No criterion states the reuse, refusal or assembly end state that the row now proves.
PROPOSAL: Add to AC-10 that a new-brief-only run reuses only stored old-brief runs whose identity matches and refuses otherwise, and that results assembled from stored runs keep every finished pass.

### R-14

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, "Sets stored before T25 take that identity from a launch record written for them, naming each launch's plugin commit, docs revision, route and model; the owner accepted this on 2026-11-23, and the implementation review checks the record against the run logs and file times"; "so a set never mixes two invocations"; "`assemble` checks every stored set the same way"); Tasks T25, T23, T24; Acceptance Criteria AC-10; Test Plan AC-10, AC-11, AC-12, AC-13 and AC-17 rows
EVIDENCE: This traces to the previous revision's answer to R-13 F-02. The document does not say where the launch record lives, what format it has, who writes it, or whether the harness reads it. No task writes it. T25 and the AC-10 row only cover sets the new harness stores. The implementation review check "against the run logs and file times" is stated only in Design. No criterion or Test Plan row names it, and the AC-11 row's brief check covers only the new brief. Also, the record names an identity per launch, not the files each launch wrote. The pre-T25 harness reuses file names across invocations: `${name}-${route}-pass-${n}.txt` and `${name}-${route}-loop-${i}.md` (tests/vh-adlc/replay/run.ts, `runCase`), and its stop message tells the operator to "rerun its loops with --only loops". If an old-brief loop is rerun and the second loop is shorter than the first, higher-numbered `old-<route>-loop-<i>.md` files from the first launch are left behind. If `assemble` counts the stored documents, which `reviews: documents.length - 1` does today, those leftovers inflate the old total behind AC-13 and AC-17 and make the halving easier. So "a set never mixes two invocations" holds only for sets stored after T25. The pre-T25 harness's only log line (`console.log` at the end of `runCase`) prints case, results, retention and loops, with no plugin commit or docs revision. So whether the "run logs" can confirm an identity depends on what the operator captured, which the document does not name.
PROPOSAL: Name the launch record's path in the case directory and its fields, including the stored files each launch wrote. Make T25 read the record as the set's identity and refuse a stored file the record does not list. Add AC-10 row cases for a pre-T25 set with a matching record, a mismatched record and an unlisted leftover file, and add the record check to the AC-11 and AC-12 rows.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, "A run of a brief on a route starts a fresh stored set: any earlier set for that brief and route is moved aside first, so a set never mixes two invocations"; "the results are assembled from those stored runs, so a run that stops loses no finished pass"); Acceptance Criteria AC-10 ("keeps every finished pass when it assembles results from stored runs, starts a fresh stored set for each run of a brief"); Test Plan AC-10 row; Tasks T25
EVIDENCE: This revision adds the fresh-set rule. The harness runs first passes and loops separately: `only` takes `loops` or `first-passes` in `runCase`, `writeResults` merges partial runs, and a stopped loop reports "its first passes are recorded, rerun its loops with --only loops". The document does not say whether a `--only loops` run is "a run of a brief". If it is, it moves aside the finished first passes, and those hours of passes have to run again, so the promise that a run that stops loses no finished pass fails in practice. If it is not, the loop joins the first passes of an earlier invocation, against "a set never mixes two invocations". The document also does not say whether `assemble` reads moved-aside sets. AC-10's "keeps every finished pass" can be read as including them, which would bring back the `5e94e593` passes that the rule moves aside. Two careful implementers would build harnesses that differ in rerun cost or in what gets counted, and the owner running the replays would notice the difference.
PROPOSAL: Define the stored set per brief, route and part (first passes, loop), with a partial run starting fresh only for the part it runs. Say that `assemble` reads only the current sets, and add a `--only loops` rerun case to the AC-10 row and T25.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context Owner summary ("builds the replay results from the stored private runs"; "every new-rules run repeats on the fixed plugin")
EVIDENCE: This revision records a new owner decision in Design: sets stored before T25 take their identity from a hand-written launch record, which "the owner accepted ... on 2026-11-23". The Owner summary's list of changes since the R-9 acceptance does not mention this decision or the fresh-set rule. The convention asks the summary to reflect decisions and material changes. The Owner summary is outside the normative baseline.
PROPOSAL: Add one line to the change paragraph naming the launch record for pre-T25 sets and the fresh stored set per run.

### R-15

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, "A stored set is one part (first passes or loop) of one brief on one route"; "Each brief and route records its plugin commit, docs revision and model in `runs/<brief>-<route>.identity.json`"; "one entry per launch with its brief, route, plugin commit, docs revision, model, process ID, log file and the stored files it wrote. For such a set the harness counts only the files its launch entry lists and refuses any other file of that brief and route"); Acceptance Criteria AC-10; Test Plan AC-10 row; Tasks T25
EVIDENCE: This traces to the previous revision's answers to R-14 F-01 and F-02. The set is now per part, but the identity file and the launch-record refusal are still keyed per brief and route, and the launch entry per launch. Three cases follow. (1) Every pre-T25 launch ran both briefs: `runCase` calls `pass("old", ...)` then `pass("new", ...)` (tests/vh-adlc/replay/run.ts:345-346) and loops `for (const name of ["old", "new"])` (run.ts:358), across both routes by default (run.ts:331). So one launch used two plugin commits and two docs revisions, and an entry "per launch with its brief, route, plugin commit, docs revision" cannot describe it as written. (2) A pre-T25 loop stop on the new brief, after the old loop has written `old-<route>-loop-<i>.md` (run.ts:369), tells the operator to "rerun its loops with --only loops" (run.ts:373). That rerun repeats the old loop too. If it is shorter, the leftover higher-numbered files are still listed by the first launch's entry. With two entries for one part, "its launch entry" is undefined, and the leftovers count toward the old total behind AC-13 and AC-17. (3) A brief and route whose first passes were stored before T25 and whose loop is rerun after T25 with `--only loops` gets an identity file for its brief and route, while the rule "refuses any other file of that brief and route" refuses the new loop files. Neither rule says which identity governs which part. The same per brief and route key also lets a post-T25 `--only loops` run under another identity overwrite the identity file and relabel the first passes it keeps. The AC-10 row's cases (a matching, a mismatched and an unlisted-file launch record, and a `--only loops` rerun) cover none of these. Two careful implementers would differ in what gets counted or refused, and the owner running the replays would notice: a refusal forces an old-brief rerun, which contradicts "Moving the new brief therefore reruns only the new brief".
PROPOSAL: Key the identity file and the launch-record entries per set (brief, route and part), let the latest launch that wrote a part govern it and refuse files of that part listed only by an earlier entry, and have a partial run refuse to keep a part whose recorded identity differs from its own. Add AC-10 row and T25 cases for two pre-T25 launches that wrote one loop part, and for pre-T25 first passes followed by a post-T25 `--only loops` run.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria AC-10 ("starts a fresh stored set for each run of a brief"); Context Owner summary ("with a fresh stored set per run"); Design (Replay harness, stored-set paragraph)
EVIDENCE: This revision defines the set per part and says "a `--only loops` run keeps the stored first passes". AC-10 and the Owner summary still say a fresh set per run of a brief, which reads as moving aside first passes on a `--only loops` run. AC-10 also does not state the launch-record behavior that the AC-10 row now proves: a pre-T25 set counted through a matching record, refused through a mismatched one or one with an unlisted file. The Test Plan row and Design agree with each other, so a wrong implementation still fails the row.
PROPOSAL: Change AC-10 to "starts a fresh stored set for each part a run executes, keeping the other part", add the launch-record counting and refusal to AC-10, and say "per part" in the Owner summary.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-11 row ("checks each pre-T25 set in `runs/launch-record.json` against the launch's log and the stored files' times"); Design (Replay harness, launch-record fields)
EVIDENCE: The pre-T25 harness prints one JSON line on success with case, results, retention and loops (tests/vh-adlc/replay/run.ts:387), and on a stop only the stop message to stderr (run.ts:419). Neither names a plugin commit or docs revision. So the launch's log confirms the hand-written identity only if the operator captured the launch's command line (`--old-plugin`, `--new-plugin`, `--companion-base`, `--companion-head`), and neither the record's fields nor the row say so. R-14 F-01 raised this point and the revision added a log file field but not what the log must show. The harm is small because the old brief has only ever been one commit and the pre-T25 new-brief sets are superseded.
PROPOSAL: Add the launch's command line to the launch-record fields, or name what in the log the implementation reviewer compares with the recorded plugin commit and docs revision.

### R-16

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Tasks T25 ("a recorded brief identity per route"; its done-condition case list); Design (Replay harness, "it records its plugin commit, docs revision and model in `runs/<brief>-<route>-<part>.identity.json`"); Test Plan AC-10 row ("pre-T25 first passes followed by a post-T25 `--only loops` run keep each part's own identity")
EVIDENCE: This traces to this revision's answer to R-15 F-01, which moved the identity file from per brief and route to per part. T25 still says "a recorded brief identity per route", which is the old key. Its done condition lists "a launch record that matches, mismatches or misses a file" and "a `--only loops` rerun" but not the new AC-10 row case where pre-T25 first passes are followed by a post-T25 `--only loops` run, which R-15 F-01 asked to add to both the row and T25. The AC-10 row and Design agree with each other, so the proof still checks the right behavior. Tasks are outside the normative baseline.
PROPOSAL: Change T25 to "a recorded identity per brief, route and part" and add the mixed pre-T25 and post-T25 case to its done-condition list.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design (Replay harness, stored-set paragraph: "A new-brief-only run and `assemble` use a stored set only when its identity matches the current brief, route and model, and refuse otherwise"; and the closing sentence "A run of the new brief alone reuses the old-brief passes and loops already stored only when that recorded identity matches the current old brief and route, and refuses otherwise; `assemble` checks every stored set the same way")
EVIDENCE: This revision added the first sentence and kept the second, so the paragraph states the reuse and assemble rule twice. The two copies differ: the first checks brief, route and model, the second only brief and route. The second's "that recorded identity" used to point at the identity-file sentence; it now follows the launch-record sentence ("the owner accepted this record on 2026-11-23"), so its antecedent reads as the launch record only. AC-10 and its row check the matching and mismatched cases either way.
PROPOSAL: Delete the closing reuse sentence except "Moving the new brief therefore reruns only the new brief", leaving the new sentence (brief, route and model) as the single statement.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Scope ("Not handled: resuming a set stored before T25 with `--only loops`, because no such set was resumed and a loop rerun on one is made as a fresh set instead (R-15 F-01)."); Deferred D-16 ("Resume a set stored before T25 with `--only loops`."); Test Plan AC-10 row ("pre-T25 first passes followed by a post-T25 `--only loops` run keep each part's own identity")
EVIDENCE: The limit, added by this revision, answers R-15 F-01 case (2): a pre-T25 loop part written by two pre-T25 launches, which Design now rules out as fact ("Each listed set was written by one launch"). As worded, "resuming a set stored before T25 with `--only loops`" also reads as running `--only loops` on a brief and route whose first passes were stored before T25, which is exactly the case the AC-10 row now proves is handled. Since every post-T25 run starts a fresh set, no post-T25 run resumes anything, so the limit concerns only past launches.
PROPOSAL: Reword the Scope line and D-16 to name the past case, for example "Not handled: a loop part that two pre-T25 launches wrote, because none did and a post-T25 loop rerun starts a fresh set (R-15 F-01)."

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design (Replay harness, "earlier files of that part, with its identity, move to `runs-superseded/`"; "Sets stored before T25 have no identity file: `runs/launch-record.json` ... the harness counts only the listed files and refuses any other file of that set"); Scope (the R-15 F-01 limit, "a loop rerun on one is made as a fresh set instead")
EVIDENCE: When a post-T25 run starts a fresh set for a part stored before T25, its files move aside, but its identity is an entry in the shared `runs/launch-record.json`, which the document does not say is removed or marked. Afterwards the part has both a new identity file and a launch-record entry listing moved files. A careful implementer most likely treats the identity file as governing ("Sets stored before T25 have no identity file"), but one who applies the entry would refuse the new loop files as "any other file of that set", and `assemble` would fail until the record is edited by hand. The failure is a visible refusal, not a wrong count, and it arises only if an old-brief part stored before T25 is rerun.
PROPOSAL: Add one clause: a part with an identity file is governed by it alone, and starting a fresh set for a pre-T25 part moves its launch-record entry aside with its files.

### R-17

NO FINDINGS

### R-18

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Replay harness, lower-bound paragraph: "the distinct reviewed commits for the document and the old docs revision, less one per old-brief first pass on that route, recorded in `runs/old-<route>-loop.bound.json`"); Design (Rounds, "a lower bound counting as recorded"); Test Plan AC-13 row; Test Plan AC-10 row ("a lost loop counts its bound"); Tasks T25 ("lower bounds from session logs"); Context Owner summary (R-9 paragraph, "lower bounds for the two old loops lost to an expired login")
EVIDENCE: This revision adds the lower bound. Counting a lost loop's recorded reviews as its total is safe only if the number really is a lower bound: an overcount raises the old total and makes AC-13 easier to pass. The formula as stated can overcount. Every execution, first pass or loop attempt, makes its own clone and commits its own X' with no fixed date (`once` calls `prepareClone` per run, tests/vh-adlc/replay/run.ts:333-334; commit at run.ts:180-181). So every old-brief Codex first pass the pre-T25 launches ever ran shows up as its own reviewed commit in the session logs. That includes failed or "not counted" runs that reached the reviewer, and passes from earlier launches whose files a later launch overwrote under the same names (`old-command-pass-<n>.txt`). R-15 F-01 recorded that every pre-T25 launch without `--only` ran the old first passes again (run.ts:345). A loop also gets up to three attempts per launch (run.ts:50, :361), each from a fresh X', and a stopped launch tells the operator to rerun with `--only loops` (run.ts:373). The reviews of an abandoned attempt are distinct commits too, so summing them counts restarts as one longer loop. "less one per old-brief first pass" does not say whether it means the three counted passes or every first-pass execution in the logs. Nothing caps the bound at the 60-review limit. No row has the implementation reviewer check the bound file against the logs, though AC-11 has that check for the launch record.
PROPOSAL: Count only the reviews of the lost loop's last attempt, taken from that loop's own session (for example the author session that dispatched the reviews, or review sessions in its launch window after its X'). Subtract every old-brief first-pass execution found in the logs, not three. Cap the bound at 60. Add a check of `runs/old-<route>-loop.bound.json` against the logs to the AC-11 and AC-12 rows.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design (Growth, "A loop's growth is the body size at its clean pass minus the size at X'. Over the case and route pairs whose old-brief loop stored its documents"); Design (lower-bound paragraph, "An old-brief loop that stopped before a clean pass ... marked as not clean"); Acceptance Criteria AC-17; Test Plan AC-17 row
EVIDENCE: This revision's lower-bound paragraph covers any old-brief loop that stopped before a clean pass, and treats a lost-documents loop as only one case of it ("When such a loop lost its documents"). Growth is defined only at a clean pass. It leaves out only pairs whose old loop lost its documents. An old loop that stopped before a clean pass but kept its documents is therefore in the growth total and has no defined growth. With kept clones, a stopped loop is normally resumed, so the two lost Codex loops are probably the only unclean ones. That makes this path unlikely in practice.
PROPOSAL: Leave every pair whose old loop is not clean out of growth, or define its growth at its last stored pass.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context Owner summary ("Full loops under a scripted owner must then need at most half the old total of reviews and body growth"); Tasks T24 ("the round and growth totals over all four pairs"); Design (Growth); Acceptance Criteria AC-17
EVIDENCE: This revision limits the growth condition to pairs whose old-brief loop stored its documents. The two lost loops are both Codex-route loops (owner decision, 2026-11-24), so growth is now judged on the two Claude-route pairs only. The Owner summary still states the growth condition without that limit. It mentions the lost loops only as lower bounds, in the R-9 paragraph. T24 still says growth is totalled over all four pairs. AC-17 and its row state the narrowed condition, so the proof checks the right thing.
PROPOSAL: Say in the Owner summary that growth is judged on the Claude-route pairs only, because the Codex old loops lost their documents. Change T24 to "growth totals over the pairs with stored old-brief documents".

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design (Replay harness, "A loop works in a clone kept in the case directory, so a loop that fails is resumed from that clone by the next attempt"; "starts a fresh set when the identity differs: the earlier files of that part, with its identity, move to `runs-superseded/`"); Test Plan AC-10 row ("a failed loop's next attempt resumes its kept clone")
EVIDENCE: This revision adds kept loop clones. The clone lives in the case directory, not under `runs/`, and the fresh-set rule moves only "the earlier files of that part, with its identity". It does not say whether a kept clone counts as part of the set. Suppose a loop fails and the next attempt runs under another identity, for example after another owner-allowed move of the new brief. One implementer discards the clone. Another resumes it, which would mix reviews from two plugin commits in one counted loop, on an X' that holds the earlier brief's docs pin. The new brief has moved once already, but another move needs a new owner decision.
PROPOSAL: Say that a kept loop clone belongs to its set, is resumed only under the same identity, and moves aside or is removed when a fresh set starts.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Design (Replay harness, "the harness counts only the listed files and refuses any other file of that set until a run continues it under the same identity"); Test Plan AC-10 row ("refused when it holds a file the entry does not list"); Scope ("Not handled: a set stored before T25 that two launches wrote ... (R-15 F-01)")
EVIDENCE: This revision adds "until a run continues it under the same identity". Read literally, a pre-T25 set that holds a file its launch-record entry does not list can be continued, and after that the refusal no longer applies. The unlisted file then counts, either as a pass the set "already has" or in the totals, though the launch record exists to keep such files out. The Scope limit and "Each listed set was written by one launch" make that set unlikely, but the AC-10 row tests exactly that state, and the document does not say what continuation does with it.
PROPOSAL: Say that a run refuses to continue a pre-T25 set that holds an unlisted file, or that continuation moves unlisted files to `runs-superseded/` before recording the identity.

### R-19

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Replay harness, stored-set paragraph: "the harness counts only the listed files and refuses any other file of that set. A run continues such a set only when it holds no unlisted file; otherwise the run starts a fresh set"; "Moving the new brief therefore reruns only the new brief"); Design (lower-bound paragraph, "The bound is recorded in `runs/old-<route>-loop.bound.json`"); Acceptance Criteria AC-10 ("counts a lost loop's recorded lower bound, counts a set stored before T25 only through a matching launch record entry that lists its files"); Test Plan AC-10 row ("a lost loop counts its bound"; "refused when it holds a file the entry does not list"); Tasks T25
EVIDENCE: This traces to this revision's answer to R-18 F-05, which added "otherwise the run starts a fresh set". The two lost Codex-route old loops are sets stored before T25, so their identity is a `runs/launch-record.json` entry that lists "the files it wrote". The bound file is written afterwards, under the owner decision of 2026-11-24, so the launch did not write it and its entry does not list it. Its name, `runs/old-<route>-loop.bound.json`, puts it in the old-brief loop set of that route ("A stored set is one part (first passes or loop) of one brief on one route"). Read literally, `assemble` refuses that set because it holds an unlisted file, and a run starts a fresh set: the bound moves to `runs-superseded/`, which `assemble` never reads, and the old Codex loop runs again. That contradicts "Moving the new brief therefore reruns only the new brief". The document also does not say whether a loop set that holds only a bound counts as finished, so a same-identity continuation "running only the passes the set still lacks" may rerun the loop too. One careful implementer keys the unlisted-file rule on the listed run files only; another applies it to every file of the set. The owner running the replays would notice either a refusal or an unplanned old-loop rerun. The AC-10 row's lost-loop case does not say whether the lost loop is a pre-T25 set with a launch-record entry, so it need not catch this.
PROPOSAL: State that a loop set's bound file is part of its record, exempt from the launch-record file list (or listed in its entry), and that a loop set with a bound counts as finished, so runs and `assemble` keep it. Add an AC-10 row and T25 case for a pre-T25 lost loop set with a launch-record entry and a bound file.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context Owner summary ("of body growth over the pairs whose old loop reached a clean pass with stored documents (the two Claude-route pairs, since both Codex-route old loops lost their documents)"); Design (Growth, "Over the case and route pairs whose old-brief loop reached a clean pass and stored its documents"); Acceptance Criteria AC-17; Test Plan AC-17 row; Tasks T24 ("the growth totals over the pairs with stored old-brief documents")
EVIDENCE: This revision narrows growth to pairs whose old loop reached a clean pass. The Owner summary names the qualifying pairs as fact, but the small application replay (T24) is still open, and the document gives no evidence that its Claude-route old loop ran to a clean pass. A loop that hits the 60-review cap is not clean, so it drops out. In `runCase` (tests/vh-adlc/replay/run.ts), a failed old loop on the command route sets `stopped` and the host route does not run in that launch, so the small application's host-route old loop may not have run yet. If no pair qualifies, both totals are zero and AC-17 holds vacuously ("no larger than it when the old total is zero or negative"). T24 leaves out the new "reached a clean pass" condition. AC-17 and its row state the rule correctly, so the proof checks what Design says.
PROPOSAL: Present the Claude-route pairs in the Owner summary as the expected pairs, not as fact. State that AC-17 needs at least one qualifying pair, or define a capped old loop's growth at its last stored pass. Add "reached a clean pass" to T24.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-10 row; Tasks T25; Design (Replay harness: "which belongs to its set ... and it moves aside with its set when a fresh set starts"; "A run continues such a set only when it holds no unlisted file; otherwise the run starts a fresh set"; "the earlier files of that part, with its identity, move to `runs-superseded/`"); Design (Growth, the new clean-pass condition)
EVIDENCE: This revision adds three rules that no AC-10 row or T25 case exercises: a kept loop clone moves aside with its set when a fresh set starts; a run starts a fresh set instead of continuing a pre-T25 set that holds an unlisted file; and an old loop that stored its documents but stopped before a clean pass stays out of growth. The row checks "a lost loop ... stays out of growth" and "refused when it holds a file the entry does not list", but not these. So the row would pass on an implementation that resumes a clone under another identity, or continues a pre-T25 set that holds an unlisted file. On the second rule, when a fresh set replaces a pre-T25 set, the shared launch record still has an entry listing the moved files. The document does not say whether the new identity file governs alone (R-16 F-04, left unapplied), and this revision adds a new way to reach that state. Each path needs either another owner-allowed brief move or a pre-T25 set holding an unlisted file, and Design says neither happened. So the owner is unlikely to hit them.
PROPOSAL: Add AC-10 row and T25 cases for a clone moved aside when a fresh set starts, a fresh set started from a pre-T25 set that holds an unlisted file, and an unclean old loop with stored documents left out of growth. Say that a part's identity file, once written, governs it alone.

### R-20

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria AC-17 ("Over the case and route pairs whose old-brief loop reached a clean pass and stored its documents, the new-brief loops' total body growth is at most half ..."); Test Plan AC-17 row ("Pass: over the pairs whose old-brief loop reached a clean pass with stored documents, the results file shows ..."); Design (Growth, "of which there must be at least one"); Context Owner summary ("with no qualifying pair, AC-17 is not met"); Test Plan AC-10 row and Tasks T25 (no zero-pair case)
EVIDENCE: This revision answers R-19 F-02 by adding the at-least-one condition to Design and the Owner summary only. The criterion text and its proof row still read as before. With no qualifying pair, both growth totals are zero, and AC-17's own text ("or no larger than it when the old total is zero or negative") is met, so an implementation reviewer judging the criterion by its text and row would record it met, while Design and the Owner summary say it is not. No AC-10 row or T25 case has the results file show the zero-pair result as failing, so the harness need not report it. The Owner summary expects two Claude-route pairs to qualify, and nothing in the document shows that none will, so the owner is unlikely to reach this state.
PROPOSAL: Add "of which there must be at least one" to AC-17 and its Test Plan row, and add a fixture case to the AC-10 row and T25 where no old loop qualifies and the results file shows the growth condition as not met.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design (Replay harness, stored-set paragraph: "the harness counts only the listed files and refuses any other run file of that set. A run continues such a set only when it holds no unlisted run file; otherwise the run starts a fresh set"); Design (lower-bound paragraph: "part of its set's record like the identity file and never a run file a launch-record entry lists"); Test Plan AC-10 row ("a pre-T25 set holding an unlisted run file starts fresh"; "refused when it holds a file the entry does not list"; "a pre-T25 lost loop set with a launch-record entry and a bound counts its bound"); Tasks T25 ("a fresh set from a pre-T25 set with an unlisted file"; "a launch record that matches, mismatches or misses a file"); Acceptance Criteria AC-10 ("counts a set stored before T25 only through a matching launch record entry that lists its files")
EVIDENCE: This revision introduces "run file" to exempt the bound file, but never defines it, and the AC-10 row and T25 keep the older "a file the entry does not list" and "an unlisted file" beside the new term. Read literally, the row asks that a set holding a file the entry does not list is refused, and in the same row that a pre-T25 loop set holding an unlisted bound file counts its bound. The same state (an unlisted run file) is also "refused" in one clause and "starts fresh" in another; Design ties neither outcome to an operation (assemble or a new-brief-only run versus a full run), and "refuses any other run file" can be read as ignoring the file or as refusing the set. The Design text makes the bound exemption clear, and Design says each listed set was written by one launch, so the owner is unlikely to hit a set with an unlisted run file.
PROPOSAL: Define a run file once (a pass, verdict, loop document or failure file a launch writes, not the identity or bound file), use "run file" in the AC-10 row and T25, and say that assemble and a new-brief-only run refuse such a set while a full run starts a fresh one.

### R-21

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-11 row ("that the reviewer, the spec skill, `references/review-protocol.md`, `references/loop.md` and `scripts/loop/` differ between the first new brief `5e94e593` and the new brief in the results file only by `ef685da1`'s reviewer change (`git diff 5e94e593 <new brief> -- <those paths>`)"); Test Plan AC-12 row ("same procedure, brief check and pass condition"); Design (Replay harness, "new is the feature head at that moment" and "The new brief then moves to the fixed plugin and every new-brief run repeats"); Context Owner summary ("every new-rules run repeats on the fixed plugin")
EVIDENCE: `git diff --stat 5e94e593 00752fea -- plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md plugins/vh-adlc/references/review-protocol.md plugins/vh-adlc/references/loop.md plugins/vh-adlc/scripts/loop/` lists two files: the reviewer (10 lines, ef685da1) and `plugins/vh-adlc/scripts/loop/plugin-version.ts` (22 lines). `git log 5e94e593..00752fea -- plugins/vh-adlc/scripts/loop/plugin-version.ts` gives 2c116422, "fix(loop): identify the PATH vh-adlc by its digest instead of running it", a default-branch commit. The drift merge dfdd422d (R-17) brought it in at 2026-11-23 22:15, after ef685da1 (21:39). This pass's merge f886f91b changes none of those paths, so the gap dates from the R-17 merge, which that pass did not raise. The document never names the new brief's commit. It says only that the new brief moves "to the fixed plugin". T23 and T24 are still open and "continue after acceptance". So an author who launches the reruns from the current feature head, which Design's "the feature head at that moment" allows, gets a new brief that also differs from 5e94e593 in `scripts/loop/`. The implementation reviewer's check as written then fails AC-11 and AC-12, even though the extra change only affects how the context command identifies the PATH binary, not review behaviour. An author who uses ef685da1, or a commit before dfdd422d, as the new brief passes. Two careful implementers would pick different briefs, and one choice fails the proof on a correct replay.
PROPOSAL: Name the new brief's commit in Design and in the AC-11 row (for example ef685da1, or the commit the stored new-brief sets record). Alternatively, let the check also allow changes the default branch merged in that leave the reviewer's inputs and the review-scope result unchanged, and list 2c116422's `plugin-version.ts` change as one of them.

### R-22

NO FINDINGS

### R-23

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, Retention paragraph: "a label fails when at least two of the three old-brief first passes raise it at or above its minimum severity ... Labels no old-brief pass raises at or above its minimum severity cannot fail and are reported, with the old-brief count at any severity beside them"); Context Owner summary ("A labelled defect fails if the old rules raised it in two of three runs and the new rules miss it in all twelve at the owner's minimum severity", "counts both briefs at the same severity bar for retention", "T27 (retention at the same severity bar for both briefs)"); frontmatter status_description; Tasks T27; AC-11 and AC-12, which rest on the rule
EVIDENCE: This revision changed the old-brief count from "at any severity" to "at or above its minimum severity" (`git diff a3ae263a c93e20eb -- docs/specs/proportional-review.md`). The stated reason is narrower than the rule: "a reviewer that rates a defect below its minimum under both briefs has not lost it to the new rules". The rule also lets a label pass when the old brief raised it below its minimum and the new brief does not raise it at all, which is a loss, and the goal says "every real defect the current review raises is still raised". This path is plausible on these cases. Design says an always-blocking label's minimum is blocking, and it records that the reviewer rated "three always-blocking defects raised only at should-fix" in the first enterprise result. So an always-blocking label that the old brief raised at should-fix in three of three passes, and that the new brief drops in all twelve, "cannot fail". The results table (`tests/vh-adlc/replay/run.ts:425`, column "New passes at its minimum") shows 0 for that label whether the new brief rated it lower or dropped it. Only the per-run label lists tell the two apart, and no criterion reads them.
PROPOSAL: Keep the shared bar, and add that a label two of three old passes raise only below its minimum fails when none of the twelve new passes raises it at any severity. Report the new brief's any-severity count next to the old one, and give T27's test that case.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-10 row and AC-11 row; Tasks T27 ("(AC-10, AC-11, AC-12)")
EVIDENCE: T27 changes how the harness computes retention and says run.test.ts covers "a label the old brief raises only below its minimum". No Test Plan row names a retention case. The AC-10 row lists identity, reuse, launch record, bound, terms and growth cases, but not the retention arithmetic, although run.test.ts has a `describe("retention", ...)` block. The AC-11 row checks only that "the results file shows no failing label" and spot-checks the matcher's verdicts. It does not check how the harness turns verdicts into a retention verdict. Under the current proofs, a harness that counts the new brief at any severity, or skips the confirmation runs, passes AC-10 and AC-11 while declaring labels retained that the rule fails. This revision makes the rule more lenient, so the risk now matters.
PROPOSAL: Add the retention cases to the AC-10 row: a label the old brief raises only below its minimum, a label the new brief raises only below its minimum (which still fails after twelve runs), and the confirmation runs. Alternatively, have the AC-11 row's reviewer recompute retention from the per-run labels in the results file.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: frontmatter `goal` ("while every real defect the current review raises is still raised"); AC-11 ("apart from label L-08 on the Claude host route, a known loss the owner deferred as D-17"); Deferred D-17
EVIDENCE: After this revision, AC-11 accepts the loss of one labelled real defect on one route, and the Owner summary says so ("one real defect is lost: label L-08"). The goal still promises that every real defect is still raised. The cut check and the follow-up review judge items against the goal, so the two statements now disagree.
PROPOSAL: Reword the goal so it allows the recorded known loss, for example "every real defect the current review raises is still raised, apart from those the owner defers as known losses".

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design (Replay harness, "Both briefs use the same route settings and models" and the identity file paragraph, "records its plugin commit, docs revision and model")
EVIDENCE: Commit 9e977a5e, since R-22, adds `refreshRoute` (`tests/vh-adlc/replay/run.ts:199-208`). It commits the case's current `--routes` settings into a resumed loop clone when they differ, and its message says the command route's reviewer start changed during the replay. The identity file and the results record no route settings, so nothing shows whether old-brief sets ran under the same route settings as the new-brief runs. The change described affects only how the prompt reaches the reviewer, so the consequence is small.
PROPOSAL: Add a digest of the route settings to each identity file and to the results, or say in Design which route settings changes are allowed between briefs (for example, how the prompt is delivered).

### R-24

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness, Retention paragraph: "A label that at least two of the three old-brief passes raise only below its minimum fails instead when none of the six new-brief first passes raises it at any severity"; "fails only if none of the twelve meets the bar it failed: its minimum severity, or any severity for a label the old brief raised only below its minimum"; "Labels no old-brief pass raises at or above its minimum severity, or below it in fewer than two passes, cannot fail and are reported"); Context Owner summary ("A labelled defect fails if the old rules raised it at the owner's minimum severity in two of three runs ... or if the old rules raised it only below that severity in two of three runs and the new rules miss it in all twelve at any severity"); frontmatter status_description ("fails a label the new brief drops entirely"); Test Plan AC-10 row (retention cases); Tasks T27; AC-11 and AC-12, which rest on the rule
EVIDENCE: This traces to this revision's answer to R-23 F-01. The added condition covers a label that two of three old passes raise only below its minimum, and the first condition covers two of three at or above it. A label that one old pass raises at its minimum and one only below it (two of three at any severity, which the current review raises) meets neither, and the cannot-fail sentence then puts it among the labels that "cannot fail" ("below it in fewer than two passes"). If the new brief drops that label in all twelve passes, AC-11 and AC-12 still pass, so the goal's "every real defect the current review raises is still raised" is not checked for it. Design records that this reviewer's severity varies across runs ("three always-blocking defects raised only at should-fix"), so a split old count is plausible on the open T23 and T24 replays. The current harness counts old passes at any severity (`tests/vh-adlc/replay/run.ts:255-256`, `r.old >= 2 && r.new === 0` at :547 and :551), so it fails such a label today; T27 as specified would stop failing it. The cannot-fail sentence also reads two ways (its "or" can be taken to exempt a label two old passes raise at its minimum and none below), the confirmation clause says "a label the old brief raised only below its minimum" where the condition counts per pass, the Owner summary says "at the owner's minimum severity" where Design says "at or above its minimum severity", and the status_description says any label the new brief drops entirely fails.
PROPOSAL: State the second condition as: a label that at least two of the three old passes raise at any severity, but fewer than two at or above its minimum, fails when none of the new passes raises it at any severity; reword the cannot-fail sentence, the confirmation clause, the Owner summary and the status_description to match. Add the split case (one old pass at the minimum, one below) to the AC-10 row's retention cases and to T27.

### R-25

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Design (Replay harness, Retention paragraph: "For a reviewer whose hit rate is unchanged, a label fails with probability at most 0.9 percent (at a per-run hit rate near 0.14; computed exactly over the binomial outcomes)")
EVIDENCE: The diff resolves R-24 F-01. The second condition now covers "at least two of the three old-brief passes raise at any severity, but fewer than two at or above its minimum". The cannot-fail sentence ("fewer than two old-brief passes raise at any severity") completes the partition. The confirmation clause, Owner summary, status_description, the AC-10 split case and T27 all match. The 0.9 percent figure in the same paragraph was computed for one hit rate, P(Binomial(3,p) >= 2) * (1-p)^12, maximum 0.873 percent (R-4, R-5). The rule now has two disjoint conditions with different new-brief bars, so a reviewer whose hits split across severities has two rates: p at or above the minimum and q at any severity. When both rates are unchanged between briefs, the per-label failure probability is the sum over the multinomial old outcomes (at minimum, below only, missed) of the old outcome's probability times (1-p)^12 under the first condition or (1-q)^12 under the second. I computed it exactly in python3 over a 0.005 grid. Under this revision's rule the maximum is 1.32 percent, at p=0.10 and q=0.185. Under R-24's rule, where the second condition needed two below-only passes, it was 0.99 percent, at p=0.12 and q=0.24. So the bound was already slightly over 0.9 before this pass, and this revision's widening of the second condition raised it further. The figure holds only when every hit lands on the same side of the minimum. No criterion computes it, so nothing an implementer builds or a proof checks changes.
PROPOSAL: Say the figure is for a reviewer whose hits always land on one side of the minimum, and give about 1.3 percent as the maximum when an unchanged reviewer's severity varies between at-minimum and below-minimum hits.

### R-26

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness: the lower-bound paragraph "An old-brief loop that stopped before a clean pass counts ... recorded in `runs/old-<route>-loop.bound.json` ... A loop set that holds a bound counts as finished: runs and `assemble` keep it and never run that loop again"; the Rounds paragraph "a new loop stopped by its route's usage limit by the reviews stored in its kept clone, recorded the same way in `runs/<brief>-<route>-loop.bound.json`"; the kept-clone sentence "the clone is removed once the loop finishes"); Tasks T28; Test Plan AC-10 and AC-11 rows; Deferred D-19
EVIDENCE: This traces to this revision's Rounds change. "Recorded the same way" points to a paragraph that defines a bound only for an old-brief loop that lost its documents, counted from reviewer session logs, with a window, the first-pass executions set aside and the counted commits. Nothing says what a kept-clone bound records or how reviews are counted from the clone, for example spec review rows added after X' or distinct reviewed commits. At 372cc5cb the `bound` command reads only session logs (`tests/vh-adlc/replay/run.ts:633-663`). `storedLoop` reads a bound only when no loop documents are stored (`run.ts:382`). Loop documents reach `runs/` only after the loop returns (`run.ts:594-595`), so the stopped enterprise Codex loop's reviews exist only in its clone. The lower-bound paragraph also says a set that holds a bound counts as finished and its loop never runs again. D-19 plans to "finish that new loop when Codex usage returns", from the same clone. The document does not say whether a later same-identity run resumes the clone and replaces the bound, or whether the owner must delete the bound first. It also leaves open whether a bound counts as "finishes" for removing the clone. The AC-11 row checks only `runs/old-<route>-loop.bound.json` against session logs. The AC-10 row lists neither of T28's cases: the total over clean pairs with the other pairs listed, and a bound read from a kept clone. A wrong kept-clone bound or clean-pair total can therefore pass AC-10's proof. The harm is limited because the pair stays outside the halving total, but the owner will hit the resume path D-19 names.
PROPOSAL: In the lower-bound paragraph, define the new-brief bound: what it counts from the kept clone, what the record holds, and that a later run under the same identity resumes the kept clone and replaces the bound once the loop finishes. Add T28's two cases to the AC-10 row, and add a check of the kept-clone bound against the clone to the AC-11 row.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-13; Design (Replay harness, Rounds paragraph); Test Plan AC-13 row
EVIDENCE: This traces to this revision. The AC-13 row requires "over the pairs where both loops reached a clean pass (at least one pair)", but AC-13 and the Rounds paragraph do not, so with no qualifying pair the criterion holds vacuously while its proof fails. AC-17 and the growth paragraph state the matching requirement ("of which there must be at least one"). A pair where only the old loop reaches a clean pass is also left out of the halving total and only listed, so a convergence regression would not fail AC-13. With the measured loops in the Owner summary (both Claude pairs clean under both briefs, the small application Codex old loop lost unclean, both enterprise Codex loops unclean), no such pair exists, and finishing the loop under D-19 could only make the new loop clean. Neither gap changes the current outcome.
PROPOSAL: Add "at least one such pair" to AC-13 and the Rounds paragraph. If the owner wants it, also state that a pair where only the old loop reached a clean pass fails AC-13.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary: "Validation so far: T1 to T22, T25 and T26 are done ..."; "The remaining work is T27 (retention at the same severity bar for both briefs) and the results (T23, T24)"; the "This revision, after that acceptance, ..." paragraph)
EVIDENCE: T27 is ticked with evidence. I reran `bun test tests/vh-adlc/replay/run.test.ts --timeout 60000` on a `git archive` export of 372cc5cb: 38 pass, 0 fail, matching its evidence line. T28 is new in this revision and is not named as remaining work. The frontmatter status_description has it right ("T1 to T22 and T25 to T27 done; T28, T23 and T24 continue after acceptance"). The "This revision" paragraph lists the earlier owner decisions but not this revision's change: the halving bar applies only to pairs where both loops reached a clean pass, and a stopped new loop counts from its kept clone. The rule itself is stated earlier in the summary and in the D-19 sentence.
PROPOSAL: Update the two sentences to say T27 is done and that T28, T23 and T24 remain, and add this revision's AC-13 change and kept-clone bound to the "This revision" paragraph.

### R-27

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Replay harness: the new-brief bound paragraph "Such a bound does not finish its set: a later run under the same identity resumes the kept clone, and once the loop finishes, its stored documents take precedence over the bound"; the kept-clone sentence "the clone is removed once the loop finishes, and it moves aside with its set when a fresh set starts"; the stored-set sentence "the earlier files of that part, with its identity, move to `runs-superseded/`"); Test Plan AC-10 and AC-11 rows; Tasks T28; Deferred D-19
EVIDENCE: This traces to this revision's new kept-clone bound paragraph, which resolves R-26 F-01's definition gap but leaves the bound file's lifecycle open. Once a resumed loop finishes, its kept clone is removed (`run.ts:539`, `:547`), but nothing says what happens to `runs/new-<route>-loop.bound.json`: the document says only that the stored documents "take precedence". The AC-11 row then has the implementation reviewer check "each `runs/new-<route>-loop.bound.json` against the Review Log of the kept clone at the head and X' it records". When D-19's planned step ("finish that new loop when Codex usage returns") happens before T23, the bound file stays and the clone it names no longer exists, so that check cannot be executed as written. The old-brief bound is "part of its set's record like the identity file", but the new paragraph does not say the same. In the code at this commit, `freshSet` moves only files starting with `<brief>-<route>-<kind>-` and the identity file (`run.ts:293`), so `new-<route>-loop.bound.json` (`loop.`, not `loop-`) would stay behind when a fresh set starts, and a later failed loop with no documents would read a bound from another identity. The AC-10 totals cases check resume and precedence but not that the bound leaves with its set or once documents replace it, so an implementation that leaves a stale bound passes AC-10. The harm is limited: a superseded bound does not enter the halving total. But the owner plans to follow the resume path D-19 names.
PROPOSAL: In the new-brief bound paragraph, say the bound is part of its set's record like the identity file, so it moves aside with a fresh set, and that it moves aside (or is deleted) once the resumed loop stores its documents. Limit the AC-11 check to a kept-clone bound still in effect, and add "the bound moves aside with a fresh set and once the loop's documents are stored" to the AC-10 totals cases and T28.

### R-28

NO FINDINGS

### R-29

CRITERION: AC-01 The convention at the companion `vhco-pro/docs` revision defines blocking, should-fix and nit by consequence for the profiled product as Design states, with always-blocking defects blocking on every product.
VERDICT: met
EVIDENCE: Read conventions/feature-documents.md at e79eaa6a (byte-identical to the binary's cache and, as a whole tree, to companion head 0fa68d68), Review log section: "This is severity by consequence", the product profile as context with a production default, blocking/should-fix/nit defined as Design states, and the three always-blocking classes "blocking on every product, whatever its profile". `bun test` over 29 files including tests/vh-adlc/proportional-review.test.ts (convention resolved at the repository pin through the binary), private clone at 644da0c0: 412 pass, 0 fail. Limitations: none.

CRITERION: AC-02 That convention raises an Open Question only where the owner could plausibly choose differently, has the author record every other choice in Design, and offers only options that meet the goal in full.
VERDICT: met
EVIDENCE: Open questions section at e79eaa6a states the plausible-choice rule, "records every other choice in Design with a one-line reason" and "Each option offered meets the goal in full", and drops the "every trade-off" sentence; the proportional-review.test.ts "raises open questions only under the plausible-choice rule" case passed in the 412-pass run at 644da0c0. Limitations: none.

CRITERION: AC-03 That convention and the reviewer accept a stated limit as an answer to a finding, and the reviewer raises its substance again only for an always-blocking defect, an unmeetable criterion or an unsolved problem.
VERDICT: met
EVIDENCE: Convention Review log at e79eaa6a defines the `Not handled:` stated limit and the three re-raise conditions; reviewer agent at 644da0c0 carries the matching paragraph; proportional-review.test.ts passed (412 pass). Committed transcripts S17.limit.stated (no names.log concurrency finding), S17.limit.nolimit (gap raised without the line) and S17.limit.security (blocking finding quoting the delete-endpoint limit), each Result: pass on plugin 3acff49, which holds ef685da1; no reviewer, skill, protocol or loop script change between 3acff49 and 644da0c0 (git diff empty). Limitations: one model sample per scenario; scenarios read from committed transcripts, not rerun.

CRITERION: AC-04 The reviewer reads the product profile from `AGENTS.md` at the reviewed commit, rates failure paths by it, rates a failure path it is unsure about at should-fix or above, and without a profile judges as for production software with users.
VERDICT: met
EVIDENCE: Reviewer agent at 644da0c0 reads `## Product profile` at the reviewed commit, rates by it, has the unsure-path rule and the production default; references/loop.md states the profile once (test passed). Committed transcripts on plugin 3acff49: S17.profile.single (lock gap at nit: pass), S17.profile.hosted (blocking: pass), S17.profile.none (blocking: pass), S17.profile.unsure (should-fix: pass); the LOCK_GAP classifier in tests/vh-adlc/scenarios/run.ts matches whole words. Limitations: one model sample per variant; transcripts read, not rerun.

CRITERION: AC-05 On both routes, a spec review after the first receives the scope from `review-scope`, covers only the document diff and every section that states a rule, ID or term the diff changes, and reports only blocking findings outside that; the pass is full when there is no previous spec review or a covered path or a docs pin bridge file changed.
VERDICT: met
EVIDENCE: tests/vh-adlc/loop/review-scope.test.ts and lenses.test.ts passed in the 412-pass run; review-scope.ts PIN_BRIDGES equals internal/knowledge/knowledge.go `bridges`; cli.ts `review` passes reviewScope into reviewPrompt for spec reviews; review-protocol.md and the spec skill carry the command and the Independence exception. Committed transcripts S17.scoped (host) and S17.scoped-command (Codex review command, attested gpt-6.2-sol, scoped since the clean pass), both Result: pass on 3acff49: non-blocking findings only on the changed paragraph or its terms, unchanged names.log gap not named, unchanged secret exposure blocking. Limitations: one changed paragraph observed, one sample per route.

CRITERION: AC-06 The spec skill raises judgement calls and judgement findings as Open Questions only under the plausible-choice rule, judged against the product profile and the files loop context lists.
VERDICT: met
EVIDENCE: Spec skill at 644da0c0, "Under severity by consequence" section and author-mode and step 4 references; proportional-review.test.ts spec skill cases passed. Committed S17.questions (scripted reviewer) Result: pass on 2b59a97: exactly one Open Question, about the contract, and Design records the profile-settled choice; the spec skill is unchanged between 2b59a97 and 644da0c0. Limitations: one sample; reviewer scripted.

CRITERION: AC-07 The spec skill's owner-facing summary shows only the unapplied nits the owner's recorded rules do not settle, with a count of the rest and where the full list is.
VERDICT: met
EVIDENCE: Spec skill "Owner-list triage" bullet at 644da0c0; committed S17.nits Result: pass on 5e94e59 (summary shows the two widening nits and a count of six; `All unapplied nits` lists all eight); spec skill unchanged since 5e94e59. Limitations: one sample, scripted reviewer.

CRITERION: AC-08 On a repository pinned to `0c983f67`, the reviewer, the spec skill, the owner-facing summary, ship and resume behave as before this feature: no Deferred section, no cut check and no follow-up review.
VERDICT: not verified
EVIDENCE: Committed old-pin transcripts S17.oldpin.scoped, .questions, .nits, .profile, .deferred, .cut, .followup and S16.oldpin-reviewer all Result: pass, but all on plugin 2639661, before ef685da1 changed the reviewer's failure-mode paragraph (reviewer agent lines 60-66). git diff 2639661..644da0c0 over the reviewer, skills, references and loop scripts shows that reviewer change plus unrelated authority and plugin-version edits; spec, ship and resume are unchanged. review-convergence.test.ts at 0c983f67 passed (412-pass run). The real-reviewer old-pin controls (S17.oldpin.scoped, S17.oldpin.profile, S16.oldpin-reviewer) were never run on the current reviewer text. Limitations: the spec skill, ship and resume parts are established; the reviewer part is not.

CRITERION: AC-09 vh-adlc's `AGENTS.md` has a product profile and pins the companion revision, the convention uses every glossary term except Cut check and Follow-up review, and the convention and both user guides use the terms they contain with the glossary's meanings.
VERDICT: met
EVIDENCE: AGENTS.md at 644da0c0 has `## Product profile` and pins e79eaa6a, the merged companion (#59) whose tree equals 0fa68d68; knowledge.md names the same SHA; `vh-adlc lint` and `fresh` resolve e79eaa6a. Term grep on the convention finds all twelve required terms ("owner-list triage" across a line break) and neither Cut check nor Follow-up review; proportional-review.test.ts AC-09 cases passed. Manual read of docs/user-guides/workflows.md (Reviews) and docs/get-started/first-feature.md step 1: each term matches the glossary meaning. Limitations: none.

CRITERION: AC-10 The replay harness runs a case end to end, reuses a stored old-brief set only when its recorded identity matches the current old brief and refuses otherwise, keeps every finished pass when it assembles results from stored runs, continues a stored set of the same identity and starts a fresh one for a different identity, resumes a failed loop from its kept clone, counts a lost loop's recorded lower bound, counts a set stored before T25 only through a matching launch record entry that lists its files, refuses a case whose approval line is missing or whose digests do not match, stops on a case term in the public tree or the companion diff, counts a run only on the route and model under test, records each run's plugin commit, docs revision and model, writes nothing but counts and identities to the results file, records failed executions without counting them as passes, and runs on a public fixture case in the test suite.
VERDICT: met
EVIDENCE: `bun test tests/vh-adlc/replay ...` in the targeted run at 644da0c0: all 41 harness cases pass (part of 412 pass, 0 fail), covering each clause, including the launch-record match, mismatch and unlisted-file refusals, kept-clone resume, both bound kinds, the approval refusals and the term stops. Read run.ts storedPasses, storedLoop, checkIdentity and freshSet: consistent with the tests. On the real cases `run.ts assemble` was read-only (case-directory file listing unchanged). Limitations: live.ts is exercised only by the real runs.

CRITERION: AC-11 On the enterprise case, with labels and case approved before the first rule-editing commit, no label fails the retention rule on either route, apart from label L-08 on the Claude host route and label L-10 on the Codex command route, known losses the owner deferred as D-17 and D-18.
VERDICT: met
EVIDENCE: Approval line recomputed: labels sha256 c810c9ca...7e9a and case.yaml sha256 b2940ee8...b619 match; approved 2026-11-22T20:27:08Z, before companion 0fa68d6 (2026-11-23T07:43:21Z) and reviewer 06ab1add (07:45:28Z). `run.ts assemble` for both cases into a scratch file, then diff with the committed results.md: identical. Results: 3 old and 12 new counted passes per route (one command run excluded, 14 host runs failed and not counted); 100 label-route rows, 2 fail (command L-10: old 2/3, new 0/12; host L-08: old 2/3, new 0/12). Matcher spot check: old host passes 1 and 3 map L-08 at should-fix; no new host record of 12 raises the L-08 subject. Launch record: every old entry names old plugin 0c9fee77 and docs 30c38c8d with times consistent with one launch per set; session-log bound recomputed from the logs (36 distinct commits, 3 set aside, 33 counted, lists equal); kept-clone bound: clone head 5350c6d, 25 spec rows since X'. `git diff 5e94e593 ef685da1` over the five brief paths: only the reviewer fix. `run.ts terms` on the tree, companion diff, this document and results.md: pass. Limitations: matcher verdicts spot-checked, not exhaustively.

CRITERION: AC-12 On the small application case, with labels and case approved before the first rule-editing commit, no label fails the retention rule on either route.
VERDICT: met
EVIDENCE: Approval line recomputed: labels sha256 88b8f774...ecd5 and case.yaml sha256 31907b51...380c match; approved 2026-11-23T07:40:57Z, before 0fa68d6 (07:43:21Z) and 06ab1add (07:45:28Z). Reassembled results identical to the committed file: 2 labels, all four label-route rows pass (command L-01 old 2/3, new 2/6 at minimum; host L-01 old 2/3, new 1/8 at minimum and 6/8 at any). Matcher spot check on three new host passes agrees with the label's match line. Old host pass and loop sets each map to one launch entry with consistent times (the duplicate run's files are set aside); session-log bound recomputed: 22 distinct, 3 set aside, 19 counted, lists equal. Terms check: pass. Limitations: host retention rests on one new pass at minimum severity.

CRITERION: AC-13 Over the case and route pairs where both briefs' loops reach a clean pass, of which there must be at least one, the new-brief loops need at most half the old-brief loops' total spec reviews; the other pairs are reported as measured.
VERDICT: met
EVIDENCE: Reassembled results identical to committed: 2 pairs where both loops reached a clean pass (enterprise host 35 old and 8 new; small-application host 9 old and 2 new), totals 44 and 10, met; enterprise command (at least 33, at least 25) and small-application command (at least 19, 15) listed. Stored loop document counts match (36, 9, 10, 3, 16 files). live.ts returns documents only on a clean gate or at the 60 cap, unchanged since its first commit. Limitations: the clean pass itself is shown by the harness gate check at run time, not re-observed.

CRITERION: AC-14 The convention defines the optional Deferred section outside the normative baseline; the spec skill writes an entry with the exact source text for every stated limit, finding deferred at acceptance, owner-directed cut, author cut and drift re-review deferral; and the reviewer does not raise an entry's substance again unless it leaves an always-blocking defect, makes a criterion unmeetable or leaves the stated problem unsolved.
VERDICT: met
EVIDENCE: Convention Sections and Deferred sections at e79eaa6a define the optional section and five sources; spec skill and reviewer carry them; proportional-review.test.ts passed. Committed S17.deferred (5e94e59, spec skill unchanged since): four entries with the exact sources, Scope line, Cut check lines, `vh-adlc fresh` fresh after the entries; S17.cut.both: `From: owner cut on 2026-11-23.`; S17.deferred-review (3acff49, real reviewer): sampler not raised, blocking finding against Scope quotes the delete entry. All pass. Limitations: one sample each.

CRITERION: AC-15 After every owner-directed deferral, the author's reply carries the cut check line, and an item that is an always-blocking defect or that the goal or a criterion names becomes an Open Question instead of a Deferred entry.
VERDICT: met
EVIDENCE: Committed S17.cut.both (Open Question for the session check, Scope keeps it, Cut check line names a security defect), S17.cut.control (`nothing important lost`), and S17.deferred's acceptance and drift Cut check lines, all pass on 5e94e59; the spec skill "Cut check" bullet is unchanged since. Limitations: the proportionality "narrow" answer, which the Test Plan does not name, was not exercised; one sample each.

CRITERION: AC-16 Once a feature's PR is merged, the follow-up review gives every pending Deferred entry a verdict of drop, follow-up or gap with one line of reason; shows gaps and follow-ups with issue previews and drops one line each; files only what the owner approves, through the labels helper's `follow-up` mode, never twice for one entry; records every verdict, including declined filings, in a docs PR without touching the default branch; runs only for a merged feature, without a writer handoff; and the ship report and resume flag a merged complete document with pending entries.
VERDICT: met
EVIDENCE: tests/vh-adlc/labels including follow-up.test.ts and issue-authority.test.ts passed (412-pass run). Committed S17.followup.merged (0fcd4c4; ship and resume unchanged since, authority changed only by an unrelated orchestrate row): resume names the four entries and the step; ship shows gap, follow-ups, drop with no writer handoff; partial run after the stubbed failure; rerun files only the missing issue on the same branch; final verdicts drop, follow-up link, follow-up not filed (owner declined), gap link; one follow-up PR; default branch unchanged; nothing merged. S17.followup.unmerged: no follow-up review, normal delivery. Both pass. Limitations: gh stubbed; one sample.

CRITERION: AC-17 Over the case and route pairs whose old-brief loop reached a clean pass and stored its documents, the new-brief loops' total body growth is at most half the old-brief loops' total, or no larger than it when the old total is zero or negative, with body size recorded per pass and the Deferred section left out of it.
VERDICT: met
EVIDENCE: run.test.ts "records body size per pass without the Deferred section" and the growth-exclusion cases passed; run.ts bodySize drops the Deferred section. Reassembled results identical to committed: body size listed per pass; growth over 2 pairs with stored old documents 972 old (945 plus 27), 343 new (410 minus 67), met. Limitations: none.

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-08); Tasks (T17, T26); plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md failure-mode paragraph
EVIDENCE: Every old-pin control transcript (S17.oldpin.* and S16.oldpin-reviewer) records plugin 2639661. ef685da1, committed later, added two sentences to the reviewer at lines 60-66 ("Before you settle any finding's severity, check it against the always-blocking classes ..." and "When you are unsure ... rate it should-fix ..."). They are separate sentences after the "When the resolved ... names the product profile" clause and before "On a revision that does not", so a reviewer on an older pin may read them as unconditional. T26 reran only the new-pin scenarios. Consumers on older pins (for example docs 56cd70fa, which lacks the severity-by-consequence text) get this reviewer.
PROPOSAL: Make both sentences explicitly conditional on the severity-by-consequence convention, then rerun S16.oldpin-reviewer, S17.oldpin.scoped and S17.oldpin.profile on the current reviewer (host route, no Codex needed) and commit the transcripts as AC-08 evidence.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary, validation paragraph)
EVIDENCE: The Owner summary says "The remaining work is T28 (the totals ... and the kept-clone bound) and the results (T23, T24)", but T23, T24 and T28 are ticked with evidence and status_description says "every task done with evidence (T1 to T28)".
PROPOSAL: Replace that sentence with the current state: all tasks done, implementation review next.

### R-30

CRITERION: AC-01 The convention at the companion `vhco-pro/docs` revision defines blocking, should-fix and nit by consequence for the profiled product as Design states, with always-blocking defects blocking on every product.
VERDICT: met
EVIDENCE: Read conventions/feature-documents.md at e79eaa6a from the binary's cache, Review log section: "This is severity by consequence", the product profile as context with a production default, blocking, should-fix and nit as Design states, and the three always-blocking classes "blocking on every product, whatever its profile". `git diff --stat 644da0c0..9daf9622` touches no convention input, AGENTS.md or knowledge.md. `bun test tests/vh-adlc/proportional-review.test.ts tests/vh-adlc/proportionality.test.ts tests/vh-adlc/loop tests/vh-adlc/review-convergence.test.ts tests/vh-adlc/replay tests/vh-adlc/labels --timeout 60000` in a private clone at 9daf9622: 306 pass, 0 fail across 24 files. Limitations: none.

CRITERION: AC-02 That convention raises an Open Question only where the owner could plausibly choose differently, has the author record every other choice in Design, and offers only options that meet the goal in full.
VERDICT: met
EVIDENCE: The convention at e79eaa6a is unchanged since R-29 and the diff since R-29 touches nothing this criterion rests on; the proportional-review.test.ts plausible-choice case passed in the 306-pass run at 9daf9622. Limitations: none.

CRITERION: AC-03 That convention and the reviewer accept a stated limit as an answer to a finding, and the reviewer raises its substance again only for an always-blocking defect, an unmeetable criterion or an unsolved problem.
VERDICT: met
EVIDENCE: Reviewer at 9daf9622 keeps the stated-limit and Deferred paragraph, now in the profile-only paragraph with the moved always-blocking check; reviewer text is identical between 57b33e73 and 9daf9622 (`git diff --stat` empty). proportional-review.test.ts reviewer cases passed (306-pass run). Committed transcripts on the current reviewer text: S17.limit.stated (ba0acde, no finding raises names.log concurrency) and S17.limit.nolimit (ba0acde, the gap raised), S17.limit.security (087f403, a blocking finding quoting the delete-endpoint limit), all Result: pass. I checked the ba0acdec matcher change against the kept failing first run of S17.limit.nolimit in /tmp: its F-01 proposes "a per-build log ... how each append stays one whole line"; the old RAISES_LOCK_GAP misses it and the new one matches it, and no other finding matches either way. The widening only makes S17.limit.stated stricter. Limitations: one model sample per scenario; transcripts read, not rerun.

CRITERION: AC-04 The reviewer reads the product profile from `AGENTS.md` at the reviewed commit, rates failure paths by it, rates a failure path it is unsure about at should-fix or above, and without a profile judges as for production software with users.
VERDICT: met
EVIDENCE: Reviewer at 9daf9622: the profile-only paragraph reads `## Product profile` at the reviewed commit, keeps the production default, and now holds the uncertain-path rule and the always-blocking check; the new proportional-review.test.ts case pins both after the profile gate and failed when I swapped in the 644da0c0 reviewer (0 pass, 1 fail), passing on the head reviewer. Committed transcripts on ba0acde (current reviewer text): S17.profile.single (lock gap at nit), .hosted (blocking), .none (should-fix), .unsure (should-fix), all Result: pass. On the kept failing first run of S17.profile.single, the old LOCK_GAP matched F-04 ("two runs leave both names in order", sequential runs) and the new one does not, while the real lock-gap finding F-06 is a nit under both, so the matcher fix corrects a false match and does not hide reviewer behavior. Limitations: one sample per variant; transcripts read, not rerun.

CRITERION: AC-05 On both routes, a spec review after the first receives the scope from `review-scope`, covers only the document diff and every section that states a rule, ID or term the diff changes, and reports only blocking findings outside that; the pass is full when there is no previous spec review or a covered path or a docs pin bridge file changed.
VERDICT: met
EVIDENCE: review-scope.test.ts, lenses.test.ts and cli.test.ts passed in the 306-pass run; the scoped re-review paragraph of the reviewer and the scope handling in cli.ts and review-protocol.md are unchanged since R-29. Host route: committed S17.scoped on ba0acde (current reviewer text), Result: pass; non-blocking findings only on the changed Greeting paragraph or its terms, no finding on the unchanged names.log gap, the unchanged secret exposure blocking. Codex route: committed S17.scoped-command on 3acff49, Result: pass, attested gpt-6.2-sol, scoped since the clean pass. cli.ts:57 builds the command-route prompt from the same reviewer body, and the only change since 3acff49 in agents, scripts, review-protocol.md and the spec skill is T29's move of two sentences into the profile-only paragraph, which applies under the companion convention the scenario pins, so the Codex prompt carries the same instructions. Limitations: the Codex route was not observed on the moved text; one changed paragraph and one sample per route.

CRITERION: AC-06 The spec skill raises judgement calls and judgement findings as Open Questions only under the plausible-choice rule, judged against the product profile and the files loop context lists.
VERDICT: met
EVIDENCE: The spec skill is unchanged between 2b59a97 and 9daf9622 (no skill change in `git diff --stat 2639661..9daf9622` other than the new orchestrate skill). Committed S17.questions (scripted reviewer, 2b59a97) Result: pass; proportional-review.test.ts spec skill cases passed at 9daf9622. Limitations: one sample; reviewer scripted.

CRITERION: AC-07 The spec skill's owner-facing summary shows only the unapplied nits the owner's recorded rules do not settle, with a count of the rest and where the full list is.
VERDICT: met
EVIDENCE: Spec skill unchanged since 5e94e59; committed S17.nits Result: pass (summary shows the two widening nits and a count of six; `All unapplied nits` lists all eight). The diff since R-29 does not touch this evidence. Limitations: one sample, scripted reviewer.

CRITERION: AC-08 On a repository pinned to `0c983f67`, the reviewer, the spec skill, the owner-facing summary, ship and resume behave as before this feature: no Deferred section, no cut check and no follow-up review.
VERDICT: met
EVIDENCE: `git diff 2639661..9daf9622 -- plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md` changes only the profile-only paragraph (rewrapped, plus the always-blocking check and uncertain-path rule); the failure-mode paragraph an older pin reads is byte-identical to the text the 2639661 controls ran on, which resolves R-29's gap. Real-reviewer old-pin controls on the current reviewer text: S17.oldpin.scoped (087f403, the unchanged names.log gap raised as should-fix F-02, whose text "Parallel jobs ... at the same time" matches LOCK_GAP before and after ba0acdec), S17.oldpin.profile (ba0acde, lock gap at should-fix despite the single-person profile), S16.oldpin-reviewer (087f403), all Result: pass. The scripted-reviewer and no-reviewer controls S17.oldpin.questions, .nits, .deferred, .cut and .followup (2639661) rest on the spec skill, ship and resume, which have no change from 2639661 to 9daf9622; the other plugin changes in that range (authority and lifecycle rows for orchestrate, loop-settings wording, plugin-version.ts digest check, the knowledge.md pin, which fixtures override with their own pin) do not affect old-pin behavior. review-convergence.test.ts passed (306-pass run). Limitations: one model sample per control; S16.oldpin-reviewer's own matcher is weak (see F-01), so the reviewer part rests mainly on the two S17 old-pin controls.

CRITERION: AC-09 vh-adlc's `AGENTS.md` has a product profile and pins the companion revision, the convention uses every glossary term except Cut check and Follow-up review, and the convention and both user guides use the terms they contain with the glossary's meanings.
VERDICT: met
EVIDENCE: AGENTS.md, knowledge.md, the convention and both guides are unchanged since R-29. `vh-adlc lint docs/specs/proportional-review.md --repo <clone> --plugin-pin e79eaa6a...` at 9daf9622: pass, knowledge revision e79eaa6a from the repository pin. The proportional-review.test.ts AC-09 cases passed in the 306-pass run. R-29's manual read of the guides stands, since the diff does not touch them. Limitations: none.

CRITERION: AC-10 The replay harness runs a case end to end, reuses a stored old-brief set only when its recorded identity matches the current old brief and refuses otherwise, keeps every finished pass when it assembles results from stored runs, continues a stored set of the same identity and starts a fresh one for a different identity, resumes a failed loop from its kept clone, counts a lost loop's recorded lower bound, counts a set stored before T25 only through a matching launch record entry that lists its files, refuses a case whose approval line is missing or whose digests do not match, stops on a case term in the public tree or the companion diff, counts a run only on the route and model under test, records each run's plugin commit, docs revision and model, writes nothing but counts and identities to the results file, records failed executions without counting them as passes, and runs on a public fixture case in the test suite.
VERDICT: met
EVIDENCE: tests/vh-adlc/replay is unchanged since R-29 (`git diff --stat 644da0c0..9daf9622 -- tests/vh-adlc/replay` empty); the replay suites passed in the 306-pass run at 9daf9622. Limitations: live.ts is exercised only by the real runs.

CRITERION: AC-11 On the enterprise case, with labels and case approved before the first rule-editing commit, no label fails the retention rule on either route, apart from label L-08 on the Claude host route and label L-10 on the Codex command route, known losses the owner deferred as D-17 and D-18.
VERDICT: met
EVIDENCE: results.md, the harness and the private case are untouched since R-29, whose recomputation of the approval line, reassembly, matcher spot checks, bounds and brief diff stands. results.md still names the new brief ef685da1 with docs 0fa68d68, and `git diff --stat 5e94e593 ef685da1` over the five brief paths shows only the reviewer. `run.ts terms --case <enterprise> --tree <clone at 9daf9622> --file docs/specs/proportional-review.md --file tests/vh-adlc/evidence/proportional-review/results.md`: {"terms":"pass"}. Limitations: matcher verdicts spot-checked by R-29, not rechecked here; the shipped reviewer differs from the replayed brief ef685da1 by T29's move (see F-02).

CRITERION: AC-12 On the small application case, with labels and case approved before the first rule-editing commit, no label fails the retention rule on either route.
VERDICT: met
EVIDENCE: Evidence unchanged since R-29 (results.md, harness and case untouched); terms check for the small-application case on the tree, this document and results.md at 9daf9622: {"terms":"pass"}. Limitations: host retention rests on one new pass at minimum severity; the replayed brief predates T29's move.

CRITERION: AC-13 Over the case and route pairs where both briefs' loops reach a clean pass, of which there must be at least one, the new-brief loops need at most half the old-brief loops' total spec reviews; the other pairs are reported as measured.
VERDICT: met
EVIDENCE: results.md unchanged since R-29: two pairs where both loops reached a clean pass, totals 44 old and 10 new, the two command pairs listed with their bounds. No file this rests on changed in 644da0c0..9daf9622. Limitations: the clean passes were shown by the harness gate at run time, not re-observed; the replayed brief predates T29's move.

CRITERION: AC-14 The convention defines the optional Deferred section outside the normative baseline; the spec skill writes an entry with the exact source text for every stated limit, finding deferred at acceptance, owner-directed cut, author cut and drift re-review deferral; and the reviewer does not raise an entry's substance again unless it leaves an always-blocking defect, makes a criterion unmeetable or leaves the stated problem unsolved.
VERDICT: met
EVIDENCE: Convention and spec skill unchanged; committed S17.deferred and S17.cut.both (5e94e59, spec skill unchanged since) Result: pass. Reviewer part on the current reviewer text: committed S17.deferred-review (087f403), Result: pass, no finding on the sampler, and a blocking F-01 against Scope quoting D-02 on the delete endpoint. proportional-review.test.ts Deferred cases passed (306-pass run). Limitations: one sample each.

CRITERION: AC-15 After every owner-directed deferral, the author's reply carries the cut check line, and an item that is an always-blocking defect or that the goal or a criterion names becomes an Open Question instead of a Deferred entry.
VERDICT: met
EVIDENCE: Spec skill unchanged since 5e94e59; committed S17.cut.both, S17.cut.control and S17.deferred's acceptance and drift Cut check lines, all Result: pass. The diff since R-29 does not touch this evidence. Limitations: one sample each.

CRITERION: AC-16 Once a feature's PR is merged, the follow-up review gives every pending Deferred entry a verdict of drop, follow-up or gap with one line of reason; shows gaps and follow-ups with issue previews and drops one line each; files only what the owner approves, through the labels helper's `follow-up` mode, never twice for one entry; records every verdict, including declined filings, in a docs PR without touching the default branch; runs only for a merged feature, without a writer handoff; and the ship report and resume flag a merged complete document with pending entries.
VERDICT: met
EVIDENCE: tests/vh-adlc/labels including follow-up mode passed in the 306-pass run; ship, resume and the labels helper are unchanged since R-29, so the committed S17.followup.merged and .unmerged transcripts (0fcd4c4) still apply, both Result: pass. Limitations: gh stubbed; one sample.

CRITERION: AC-17 Over the case and route pairs whose old-brief loop reached a clean pass and stored its documents, the new-brief loops' total body growth is at most half the old-brief loops' total, or no larger than it when the old total is zero or negative, with body size recorded per pass and the Deferred section left out of it.
VERDICT: met
EVIDENCE: run.test.ts body-size and growth cases passed in the 306-pass run; results.md unchanged since R-29 (growth 972 old, 343 new over 2 pairs). Limitations: the replayed brief predates T29's move.

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: tests/vh-adlc/scenarios/run.ts (S16.oldpin-reviewer check); Test Plan (AC-08 row); Tasks (T30)
EVIDENCE: S16.oldpin-reviewer passes when `/names\.log/.test(records) && /(concurren|parallel|lock|interleav|simultaneous)/i.test(records)` over the whole R-1 record block. `/(...|lock|...)/i.test("SEVERITY: blocking")` is true, and the seeded Design sentence contains "parallel CI runs", so any record set that mentions names.log and has one blocking finding, or quotes that sentence, passes without raising the gap. This is the same "lock" in "blocking" false match T26 fixed in LOCK_GAP, which S16 does not use. AC-08's reviewer part also rests on S17.oldpin.scoped and S17.oldpin.profile, which use the whole-word LOCK_GAP per finding, so the verdict does not change. Separately, T30 says "all eight scenarios that use them were rerun", but S17.oldpin.scoped also uses LOCK_GAP and was last run at 087f403; its stored F-02 text matches LOCK_GAP before and after ba0acdec, so it still holds.
PROPOSAL: Have S16.oldpin-reviewer apply LOCK_GAP to each parsed finding, and name S17.oldpin.scoped in T30's evidence as checked against the new matcher from its stored records.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary, validation paragraph: "The replays on the fixed reviewer are complete"); Tasks (T30 "Untested on this reviewer text")
EVIDENCE: T30 names only S17.scoped-command as untested on the moved reviewer text. The replays behind AC-11, AC-12, AC-13 and AC-17 ran on brief ef685da1, whose reviewer still holds the two sentences in the failure-mode paragraph (`git diff ef685da1 9daf9622 -- plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md` shows T29's move). The Test Plan deliberately fixes the brief at ef685da1, and under the companion convention the move changes no instruction, but a reader of "the fixed reviewer" could take the replays to have run on the reviewer that ships.
PROPOSAL: Add one line to T30's untested note, or to the Owner summary, saying that the replays' brief ef685da1 predates T29's move and that the move changes no instruction under the companion convention.
