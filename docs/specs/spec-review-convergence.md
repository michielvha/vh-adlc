---
status: in-progress
status_description: "In progress on feat/spec-review-convergence after the R-17 acceptance; T1, T12, T14, T15 and T13 are done, T2 is next."
issue: null
branch: feat/spec-review-convergence
goal: "Spec review rates findings consistently, finds failure-mode gaps and every restatement in one pass, applies each pass's findings as one revision without applying nits, and never rewrites reviewed commits."
covers:
  - plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md
  - plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md
  - plugins/vh-adlc/references/review-protocol.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/security-settings.md
  - plugins/vh-adlc/knowledge.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/get-started/first-feature.md
  - docs/user-guides/workflows.md
  - tests/vh-adlc/review-convergence.test.ts
  - tests/vh-adlc/scenarios/run.ts
  - tests/vh-adlc/fixtures/build.ts
  - tests/vh-adlc/evidence/review-convergence/
  - AGENTS.md
---

# Plan: Spec review convergence

Give spec review shared severity definitions, a nit rule, a failure-mode check, one-pass completeness, a
one-revision rule for applying findings and a ban on rewriting reviewed commits, so findings arrive
complete, get applied once, and stop driving extra passes.

## Context

### Owner summary

Four recent specs needed 36 to 47 spec review passes before their first acceptance, although most of
those passes had no blocking finding. One of them had none at all. A thorough reviewer finds one or two
new items on every pass, the procedure applies them and asks again, and several late blocking findings
were caused by fixing earlier non-blocking ones. This spec's own review repeated that: the blocking findings
in R-4 to R-7, R-12 and R-13 each traced to the previous pass's fix, and all sat in the stopping rule it
carried. That rule now lives
in its own draft, `docs/specs/spec-review-stopping-rule.md`, parked until `shared-development-loop`
lands.

This feature changes spec review in seven ways, written into vh-adlc so every adopter gets them:

- The shared convention defines blocking, should-fix and nit. Blocking is reserved for defects that
  change what gets built, what a proof checks or how the binary reads the document, or that make a
  criterion impossible to meet. A harmless citation slip is a nit. A finding a declared review lens raises
  keeps that lens's severity.
- Nits never trigger a revision on their own. When a pass's blocking or should-fix finding changes the
  baseline anyway, the same commit fixes every nit of that pass, in any section and of either kind, except
  a free-text widening nit, which stays listed. Every nit not applied is listed in the author's report
  and the conversation summary to you, not in the document. The cost: a nit on a pass with nothing else
  to apply stays in the document until a later revision touches it, or until you ask for one.
- The reviewer and the author check designs that change state, run concurrently, or cross a process or
  network boundary for concurrent access, partial failure, retry or replay, and upgrade or rollback.
- The reviewer returns every finding it can establish in one pass and names every restatement of an
  inconsistent rule; the author fixes all restatements in one commit.
- The author applies a pass's findings as one revision: it lists every behavior the design touches and
  every test or scenario its criteria name, walks each finding through all of them, raises judgement
  findings other than nits first, then applies the factual findings, your answers and the pass's nits in
  one commit. It removes a
  mechanism rather than adding one when both behave the same, asks you when they differ, and revisits a
  previous change instead of patching on top of it.
- No operation rebases, amends or otherwise rewrites a commit a Review Log row names, even with
  approval; review mode brings default-branch work into a feature branch by merge.
- Widening a reviewed free-text pattern is a nit when it only catches more wrong output.

The severity definitions, the nit rule and the free-text rule go into `vhco-pro/docs` as a companion
change with the rules block unchanged, so the binary, gates and existing documents keep working, and a
consumer on an older pin keeps today's behavior for those parts. The other four rules rely on no
convention text and apply on any pin. The two user guides that describe spec review are updated.
`shared-development-loop`, which edits the same files, landed first (`2c9d3af`), and this feature's branch
starts from a `main` that holds it.

Since the acceptance at R-15, this revision settles the gaps implementation surfaced before the
convention text is written: every nit of a pass, factual or judgement and in any section, rides along
with that pass's other baseline fixes, except a free-text widening nit; unapplied nits are reported in the
conversation, not the document; a declared lens's severity wins; AC-08 also covers the guide's sentence
that no approval allows rewriting a reviewed commit; and AC-10 is limited to the merge review mode
performs. Five tasks were already done and stay done.

Validation is planned, not observed: reviewer and author trials on committed fixtures, scenario cases
for the nit rule and the no-rewrite rule, a rules block comparison, lint and gate runs on named
historical specs under both pins, old-pin cases, and the plugin test suite.

Accepting this authorizes the companion docs change, the plugin edits and their tests on a feature
branch. Pushing, opening PRs, merging and releasing each still need your separate go.

### Background

Spec review today. The reviewer's spec section verifies claims and then attacks the criteria for
contradictions, unobservable criteria and missing Test Plan rows
(`plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:35-44`). It does not ask about runtime failure
behavior. The spec skill applies factual findings, turns judgement findings into Open Questions and
commits, and only a new independent pass clears a blocking one
(`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:71-72`). It asks for acceptance once a clean review at
the current commit exists (`SKILL.md:73-75`). The review protocol repeats the apply-then-review rule
(`plugins/vh-adlc/references/review-protocol.md:77-78`). All citations in this repository are at
`3963e25acf8e8b224019b5abfaf5cb12664df8be` unless they name another commit.

The convention at the pinned docs revision `d8f07c9dd69038375a535af8ad586086688f85ab` lists the
severities `blocking | should-fix | nit` without defining them (`conventions/feature-documents.md:185`).
Scope, Design, Acceptance Criteria, Test Plan and `covers` form the normative baseline (`:70-71`). Its
Acceptance steps say blocking findings are fixed and reviewed again (`:214-215`). A review is clean when
it has no blocking finding (`:308`), and the binary's `next` rules already name owner acceptance as the
next step once a fresh, clean review exists (`:279`). Applying a finding to the normative baseline makes
the review stale (`:277`, `:300-301`), so the next step reverts to spec review. The binary therefore
already supports stopping; the churn comes from the procedure, which always applies factual findings
and asks again.

Measured churn. Counting spec review rows before the first acceptance row, and the blocking findings in
those passes, from each Review Log and its `### R-<n>` records:

```sh
awk '/^\| [0-9-]+ \| R-[0-9]+ \| spec \|/ { if ($0 ~ /accepted by owner/) acc=1; else if (!acc) { spec[$4]=1; n++ } }
     /^### R-[0-9]+$/ { cur=$2 }
     /^SEVERITY: blocking/ { if (cur in spec) b++ }
     END { print n, b }' docs/specs/<slug>.md
```

| Spec | Spec passes before first acceptance | Blocking findings in them | Passes with a blocking finding |
| --- | --- | --- | --- |
| shared-docs-drift | 46 | 2 | R-1 |
| blog-visual-reading | 47 | 5 | R-1, R-8, R-40, R-44, R-45 |
| seo-assessment | 37 | 5 | R-1 to R-5 |
| repository-security-settings | 36 | 0 | none |
| shared-triage | 2 | 1 | R-1 |

`shared-triage` shows the fast path the current rule allows: it was accepted at R-2 after a
`NO FINDINGS` pass. In `shared-docs-drift`, both blocking findings are in R-1
(`docs/specs/shared-docs-drift.md:505`), and 45 more passes followed. In `seo-assessment`, R-4 is a
concurrency gap: two helper runs read the same unit ledger without a lock and together spend twice the
limit (`docs/specs/seo-assessment.md:565-571`). In `blog-visual-reading`, the blocking findings in R-40,
R-44 and R-45 each trace to the previous pass's fix (the R-39 wording rule, then repeated regex tuning in
the AC-07 row; `docs/specs/blog-visual-reading.md:1411`, `:1524`, `:1547`). R-41 returns three findings
about one rule stated in Terminology, The reading pass, AC-04 and the Owner summary, left out of step by
the R-40 fix (`:1441`). R-8 is a real, pre-existing gap found late: an AC-07 proof Codex cannot observe
(`:598`). Under the stopping rule now drafted in `docs/specs/spec-review-stopping-rule.md`, that spec would have stopped at R-4, after clean passes R-2 to R-4.

Pins. `plugins/vh-adlc/knowledge.md:7-9` says `vh-adlc knowledge` decides whether the repository's pin
or the plugin's applies, and in this repository the repository pin wins (`lint` reports
`"source":"repository","pin_files":["AGENTS.md"]`). Since `2c9d3af` the two differ: `AGENTS.md:4` and
`plugins/vh-adlc/references/security-settings.md:5` name `d8f07c9dd69038375a535af8ad586086688f85ab`, while
`plugins/vh-adlc/knowledge.md:5` and `:7` name `c70769ebf43ea03a4bdffb3cda51954eb05b35a7`. Both hold the
same `conventions/feature-documents.md`. In this document, the previous pin means the repository pin,
`d8f07c9`.

Landed work. `shared-development-loop` merged at `2c9d3af` and is `complete`. It added declared review
lenses with their own severity: the reviewer agent applies "each declared lens the dispatch lists as a
check at its severity" (`plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:40` at `12370b8`), and
`plugins/vh-adlc/references/loop-settings.md` defines a lens as name, check and severity.

Model context. This framework names no model. The logs above already show Opus-family and unattested
reviewers, so the problem is the procedure, and it would persist under any thorough reviewer.

## Scope

In scope:

- Definitions of blocking, should-fix and nit in the shared convention.
- The nit rule: nits never cause a revision on their own; they ride along with a pass's other baseline
  fixes, and the rest are listed in the conversation.
- A failure-mode check in the reviewer's spec section and the author's instructions.
- One-pass completeness for the reviewer and a same-commit restatement sweep for the author.
- A one-revision rule for applying a pass's findings, in the spec skill.
- A rule in `references/authority.md` that no operation rewrites a commit a Review Log row names, even
  with approval.
- A free-text check rule in the convention's Test plan section.
- The pin and version moves that adopt the published convention, the two user guides that describe
  spec review, and scenario coverage for the new rules.

Out of scope, by name:

- The stopping rule, the streak count, owner and advance acceptance rules, saved nits collected across
  passes and the decision record, all now in `docs/specs/spec-review-stopping-rule.md`.
- Any change to the rules block, the binary, the record formats or gate conditions.
- Implementation reviews, maintenance reviews and audit reviews, which have their own records and stop
  conditions.
- Choosing, naming or recommending a reviewer model.
- A new template section for failure behavior.
- Rewriting or re-rating stored review records in existing specs.
- Moving any consumer repository's pin, or carrying the new convention rules inside the plugin for
  consumers on older pins.

## Design

### Behaviors these rules touch

Every rule below was checked against each of these: a first draft's review; a blocking pass; a clean
pass; a pass holding both factual and judgement findings; a revision of an accepted document; a drift
re-review; an interrupted or resumed run; a document on a feature branch and one on the default branch;
a repository on an older pin; a finding a declared review lens raises; and the existing scenarios S7.7, S7.7.accept, S7.9
and S14.spec, whose single-pass acceptance none of these rules changes.

### Terminology

| Term | Meaning |
| --- | --- |
| Restatement | A second or later place in one document that states the same rule, limit or default (AC-03). |

### Nits ride along or are listed (convention and procedure)

The convention's Review log section, beside the severity definitions, gains: a nit on the normative
baseline never causes a revision on its own. When the author applies a pass's blocking or should-fix
findings to the baseline, the same commit fixes every nit of that pass, in any section and of either kind,
without raising a judgement nit as an Open Question; the one exception is a free-text widening nit, which
stays listed even when the baseline changes for other findings. Every nit the author does not apply, from
every pass it handled in that invocation, is listed with its ID and one line in its report and the
owner-facing conversation summary, not in the document. A finding confined to sections outside the
normative baseline may be applied at any time, because it does not make the review stale. A nit left
unapplied stays in the document until a later revision touches it or the owner asks for one. The spec
skill's review mode and the protocol's Records paragraph follow it. Today the skill applies every factual
finding whatever its severity (`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:71-72`).

### Applying a pass's findings as one revision (author and reviewer)

The spec skill's review mode gains this step before any finding is applied. The author lists the
behaviors the design touches and every test, scenario and fixture the criteria and Test Plan name. It
walks each finding of the pass, and every change that finding implies, through all of them, re-reading
each named test or scenario before changing what it checks. It raises the pass's judgement findings other than
nits as Open Questions first, without changing the baseline, and once the owner has answered it applies
every factual finding to be applied, every answer and the nits the nit rule lets ride along as one
revision in one commit. Where a finding can be met
by removing a mechanism or by adding one and both give the same behavior, it removes; where they behave
differently, the choice is an Open Question with removal as the recommendation. Where a finding traces to
a change the previous pass's revision made, it revisits that change instead of patching on top of it. The
run's report lists the behaviors and named checks it walked. The reviewer agent gains the matching
sentence: when a finding traces to the previous revision's change, say so in its `EVIDENCE`. Today the
skill applies findings one by one with no such step (`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:71-72`).

### Commits a Review Log names are never rewritten (authority)

`references/authority.md` Preservation gains: no operation rebases, amends, squashes or otherwise
rewrites a commit that a Review Log row names, or any commit before it on that branch, even with the
owner's approval, because the binary then reports every such review `commit-unreachable` and stale.
The authority table's row for destructive Git operations and history rewrites, which today allows them
with separate approval (`plugins/vh-adlc/references/authority.md:30`), gains that exception. Default-branch
work comes in with `git merge`, as review mode already does for drift on a feature branch
(`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:57-58`), and as the delivery convention already requires
of feature PRs, which "never squash, so the commits its Review Log cites stay reachable"
(`conventions/delivery.md:79`). A document without a `branch` field stays on the default branch, as the
skill already says (`SKILL.md:36-38`, `:106-109`), so no new merge path is needed. Preservation today
forbids stash, reset and overwrite of others' changes but says nothing about rewriting reviewed commits
(`authority.md:72-78`). This document's own review met the gap: it was worked on a side branch against
the skill's instruction, and a rebase of that branch made every stored review `commit-unreachable` until
it was undone.

### Severity definitions (convention)

Beside the spec review record format, the convention defines:

- blocking: a stated fact is false and that changes what is built, what a proof checks or how the
  binary reads the document; an implementer following the document would build something that does not
  solve the stated problem; a criterion cannot be met; or a proof fails a correct implementation or
  cannot be executed.
- should-fix: two careful implementers would build different things, or a proof could pass on a wrong
  implementation, except widening a free-text pattern row that has passed review to catch more wrong
  output, which is a nit.
- nit: wording, style, redundancy, or a citation slip that changes nothing an implementer builds or a
  proof checks.

A repository that declares a review lens with its own severity rates that lens's findings at the
declared severity; the definitions rate every other finding. The reviewer agent tells the reviewer to
rate this way, with the definitions in the resolved convention. They add no record field.

### Failure-mode check (reviewer and author)

The reviewer's spec section gains: where the design changes state, runs concurrently, or crosses a
process or network boundary, ask what happens under concurrent requests, partial failure, retry or
replay, and upgrade or rollback from the previous version. A path the document leaves undefined is a
finding. A design that changes no state and crosses no boundary gets no such finding.

The spec skill's author mode gains the matching step: where those conditions apply, state the behavior
for each of the four questions in Design, and put any choice that cannot be settled into Open Questions.

### One-pass completeness and restatements (reviewer and author)

The reviewer returns every finding it can establish in the pass. For each finding about a rule, it
searches the document for restatements of that rule and names every location in the finding's `WHERE`.
The author, when applying a finding, searches the document for every restatement and changes them all in
the same commit.

### Free-text checks (convention)

The convention's Test plan section gains: a proof that judges free text with a pattern lists its
must-pass and must-fail examples in the row. A row has passed review once a clean pass whose reviewed
commit already held the row's current text has no finding whose `WHERE` names that row or the Test Plan as a
whole; a later change to the row starts over. After that, a finding that only widens the pattern to catch
more wrong output is a nit, and it is listed rather than applied, even when the same pass changes the
baseline for other findings. A finding that shows the pattern rejects a correct output
stays under the blocking definition, because the proof then fails a correct implementation.

### Pins and older consumers

The changes split by source. The failure-mode check, one-pass completeness, the one-revision rule and
the no-rewrite rule, in the reviewer agent, the spec skill and `references/authority.md`, apply on any
pin, because they rely on no convention text. The severity definitions, the nit rule and the free-text
rule need the new convention. The skill decides by whether the resolved
`conventions/feature-documents.md` contains the severity definitions, and the nit rule's review-mode and
protocol text is written as conditional on that check. Without them, nits are handled as today, and the
spec report says those parts need the plugin's own pin from `plugins/vh-adlc/knowledge.md`. The plugin
does not carry its own copy of the convention rules.

### Delivery

The convention edits are a companion change to `vhco-pro/docs`, checked by its own checker and an
independent review, with the rules block byte-for-byte unchanged. Docs paths are not listed in `covers`,
because that repository is checked out separately. After it publishes, `AGENTS.md`,
`plugins/vh-adlc/knowledge.md` and the convention link in `plugins/vh-adlc/references/security-settings.md:5`
move to the published commit, both manifests move together from the version current at that time, and
`docs/get-started/first-feature.md:42-43` and `docs/user-guides/workflows.md:251-263` describe the
severities, the nit rule and the one-revision rule, and the workflows guide says no approval allows
rewriting a commit that a Review Log row names.

`shared-development-loop` landed first (`2c9d3af`), so this feature's branch already holds its edits to
the same files; the pin and version move from whatever is current when T3 and T11 run, and AC-06 is
checked against the docs commit this feature publishes, or a later one that contains it.

The AC-10 and AC-11 cases are scenario cases in `tests/vh-adlc/scenarios/run.ts` that run against a
copy of the plugin whose reviewer agent returns canned records keyed by pass number, each starting with
`MODEL: scripted-reviewer`. The scripted reviewer definition, its canned records, the transcripts, and the
fixture specs and returned records of every reviewer and author trial are committed under
`tests/vh-adlc/evidence/review-convergence/`. Trials that depend on Git history (AC-05, AC-09) build
scratch repositories whose commits hold the stated history. If the docs change cannot land, adoption
stays incomplete and the plugin never points at an unpublished commit. The return path is an ordinary
reviewed revert of the docs and plugin edits and the pin.

## Acceptance Criteria

- [ ] AC-02: The published convention defines blocking, should-fix and nit as this document's Design
      states, and a reviewer following the updated agent rates a seeded false claim the design depends
      on blocking, a seeded harmless wrong line number nit, a seeded ambiguity that allows two different
      implementations should-fix, a seeded wording issue nit, and a finding a declared lens raises at
      that lens's declared severity.
- [ ] AC-03: A reviewer following the updated agent reports, in one finding, every location of a rule a
      document states inconsistently, and an author following the updated skill changes every
      restatement in one commit.
- [ ] AC-04: A reviewer following the updated agent returns a failure-mode finding for each of the four
      questions a design that changes shared state or crosses a network boundary leaves undefined, and
      returns no failure-mode finding for a design that changes no state and crosses no boundary.
- [ ] AC-05: The published convention requires must-pass and must-fail examples in a free-text pattern
      proof; on a row that has passed review at its current text, a reviewer rates a missed wrong output
      as a nit and a rejected correct output as blocking, and on a row changed since, rates a missed
      wrong output as should-fix.
- [ ] AC-06: The rules block is byte-identical to the previous pin, the named historical specs give the
      same lint, `fresh` and gate results under both pins, the repository pin in `AGENTS.md` and every
      docs pin in the plugin point at the published docs commit or a later one containing it, both
      manifests carry the same version, higher than the version before the change, a repository on the
      previous pin keeps today's behavior for the convention-dependent parts and its report names the
      needed pin, and the plugin test suite passes.
- [ ] AC-07: An author following the updated skill, drafting a feature that crosses a network boundary,
      states the behavior for concurrent requests, partial failure, retry or replay, and upgrade or
      rollback in Design, or raises an Open Question for any it cannot settle.
- [ ] AC-08: The published convention states the nit rule beside the severity definitions, and
      `docs/get-started/first-feature.md` and `docs/user-guides/workflows.md` describe the severities,
      the nit rule and applying a pass's findings as one revision; the workflows guide also says no
      approval allows rewriting a commit that a Review Log row names.
- [ ] AC-09: An author following the updated skill raises a pass's judgement findings other than nits
      first and then applies its factual findings and the answers as one revision in one commit that keeps every test
      or scenario the document names consistent with the change, removes a mechanism rather than adding
      one when both behave the same, revisits a previous revision's change when a finding traces to it,
      and lists the behaviors and checks it walked in its report; a reviewer following the updated agent
      says in `EVIDENCE` when a finding traces to the previous revision's change.
- [ ] AC-10: `references/authority.md` forbids rewriting a commit a Review Log row names, with no
      approval exception, in both Preservation and its history-rewrite row; and when review mode brings
      default-branch work into a feature branch, it uses a merge, so every reviewed commit stays
      reachable.
- [ ] AC-11: With the new convention, an author following the updated skill makes no commit that
      changes the normative baseline only to fix nits; fixes every nit of a pass, factual or judgement
      and in any section, in the same commit that applies that pass's blocking or should-fix findings to
      the baseline, except a free-text widening nit, which stays listed; raises no nit as an Open
      Question; and lists every nit it did not apply, from every pass it handled, with its ID in its
      report and the owner-facing conversation summary, not in the document.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-02 | `tests/vh-adlc/review-convergence.test.ts` checks the published convention page for the three definitions. Independent reviewer trial on a committed fixture spec seeded with a false claim the design depends on, a harmless wrong line number, a criterion that admits two implementations and a wording slip; pass when the returned records rate them blocking, nit, should-fix and nit. A second dispatch declares a lens at should-fix whose check matches the wording slip; pass when that finding is returned at should-fix. Commit the fixture, the returned records and the reported model under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-03 | Reviewer trial on a fixture spec that states one limit in Scope, Design, a criterion and the Owner summary, with one copy different; pass when one finding names all four locations. Author trial on a stored blocking pass whose factual should-fix finding asks for a value none of the four copies hold; pass when one commit leaves all four locations stating that value. Fixtures and records go under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-04 | Reviewer trial on five fixture specs: a counter in a shared file updated by parallel runs that defines partial failure, retry and upgrade but not concurrent updates; a remote API call that defines concurrency, partial failure and upgrade but not retry or replay; a design that defines concurrency, partial failure and retry but not upgrade or rollback; a design that defines concurrency, retry and upgrade but not partial failure; and a wording-only guide edit. Pass when each of the first four returns a failure-mode finding on exactly the question it leaves undefined, and the fifth returns no failure-mode finding. Fixtures and records go under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-05 | `tests/vh-adlc/review-convergence.test.ts` checks the published convention page for the example requirement. Reviewer trial on a scratch repository whose history holds a stored clean pass at a commit already holding the free-text pattern row's current text, with no finding naming the Test Plan; the row lists examples that omit one wrong output stated in Design and reject one correct output stated there. Pass only when the reviewer returns a nit for the missed wrong output and a blocking finding for the rejected correct output; fail if either is missing. A second scratch repository adds a later commit that changes the row; pass when the missed wrong output is rated should-fix. Fixtures and records go under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-06 | Compare the rules block at the old and new pins byte for byte. For `shared-docs-drift`, `seo-assessment` and `owner-readable-specifications`, run `vh-adlc lint`, `fresh` and `gate planned` from two scratch clones that differ only in the pin: one at the T3 commit, and one at a scratch commit on top of it that restores the old pin in `AGENTS.md`, each with a clean tree; assert `knowledge.revision` equals the clone's pin, and compare only `result`, `failing` and `findings`. Two scenario cases in `tests/vh-adlc/scenarios/run.ts`, whose fixture docs repository first gains the previous pin's docs commit (`tests/vh-adlc/fixtures/build.ts`), run on a fixture spec pinned to the previous revision. The procedure case uses the scripted reviewer with one clean pass holding only a factual nit on Design, which the new rule would leave unapplied; pass when the nit is applied as today and the report names the plugin's pin from `knowledge.md`. The reviewer case uses the real reviewer on a fixture with a seeded failure-mode gap; pass when the returned records include a failure-mode finding. Check `AGENTS.md`, `knowledge.md` and `references/security-settings.md` name the published docs commit or a later one containing it, and both manifests match and are higher than the version before the change. Run `bun test tests/vh-adlc` and the docs repository's `npm run check`. |
| AC-07 | Author trial: the updated skill drafts a fixture feature that adds a webhook call to a remote service. Pass when its Design states behavior for all four questions or the document raises an Open Question for each one it leaves open. Commit the transcript and draft under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-08 | `tests/vh-adlc/review-convergence.test.ts` checks the published `conventions/feature-documents.md` for the nit rule beside the severity definitions, checks `docs/get-started/first-feature.md` and `docs/user-guides/workflows.md` for the severities, the nit rule and the one-revision rule, and checks the workflows guide for the sentence that no approval allows rewriting a commit that a Review Log row names. |
| AC-09 | Author trial on a scratch repository holding a fixture spec whose Test Plan names a scenario check script, and a stored blocking pass with two factual should-fix findings: applying the first alone, in its narrowest form, would make the named check fail, and the second can be met by removing a mechanism or by adding one with the same behavior. Pass when one commit applies both, the named check script still passes on the result, the mechanism is removed rather than extended, and the report lists the behaviors and checks walked. A second trial adds a judgement should-fix to the stored pass; pass when the author raises it before changing the baseline and, after the owner's scripted answer, applies the factual findings and the answer in one commit. Reviewer trial on a scratch repository whose latest revision commit introduced a contradiction; pass when the returned finding's `EVIDENCE` says it traces to that revision's change. Fixtures, transcripts and records go under `tests/vh-adlc/evidence/review-convergence/`. |
| AC-10 | `tests/vh-adlc/review-convergence.test.ts` checks that Preservation in `plugins/vh-adlc/references/authority.md` forbids rewriting a commit a Review Log row names and that the history-rewrite row states the same exception. Scenario case in `tests/vh-adlc/scenarios/run.ts` with the scripted reviewer, on a fixture spec with a `branch` field: after a stored `NO FINDINGS` pass, the fixture's default branch gains a commit that changes a path the spec covers, so the review is stale from drift alone, and the owner asks for a fresh review; pass when the feature branch holds a merge of the default branch, every commit the Review Log names is an ancestor of the branch tip, and `vh-adlc fresh` reports no `commit-unreachable`. |
| AC-11 | Scenario case in `tests/vh-adlc/scenarios/run.ts` with the scripted reviewer and the new convention, which returns two passes: the first holds a factual blocking finding on Design, a factual nit on Design, a judgement nit on Scope and a factual nit on Context; the second is clean with one factual nit on Scope. Pass when the first pass's blocking finding and all three of its nits are applied in one commit with no Open Question raised, the second pass's nit is not applied, the document does not list it, and the report and the conversation summary list it with its ID. S7.7, S7.7.accept, S7.9 and S14.spec still pass. |

## Tasks

- [x] T1 `tests/vh-adlc/review-convergence.test.ts` - failing checks that the resolved `conventions/feature-documents.md` holds the three severity definitions, the nit rule and the free-text example requirement; they fail at the current pin because the page has none of them (AC-02, AC-05, AC-08)
      Evidence: `bun test tests/vh-adlc/review-convergence.test.ts` on feat/spec-review-convergence, 0 pass 3 fail; each failure shows the resolved d8f07c9 page lacking the severity definitions, the nit rule and the free-text example requirement.
- [x] T12 `tests/vh-adlc/review-convergence.test.ts` - failing checks that the two user guides describe the severities, the nit rule and the one-revision rule; they fail now because the guides do not (AC-08)
      Evidence: `bun test tests/vh-adlc/review-convergence.test.ts`, the three user-guide checks fail because neither guide holds the phrases; the workflows guide check for R-15 F-06 (no approval allows rewriting a reviewed commit) fails the same way.
- [x] T14 `tests/vh-adlc/review-convergence.test.ts` - the failing check that Preservation and the history-rewrite row in `references/authority.md` forbid rewriting a commit a Review Log row names; it fails because neither says so (AC-10)
      Evidence: `bun test tests/vh-adlc/review-convergence.test.ts`, both authority checks fail: Preservation lacks the rule and the history-rewrite row lacks the exception.
- [x] T15 `tests/vh-adlc/scenarios/run.ts` - the scripted reviewer (a plugin copy whose canned records, keyed by pass number and starting with `MODEL: scripted-reviewer`, live under `tests/vh-adlc/evidence/review-convergence/`) and the AC-10 drift case, a guard that passes on today's merge path (AC-10)
      Evidence: `bun tests/vh-adlc/scenarios/run.ts --phase 4 S16.drift` on Claude Code 2.1.322 headless, PASS, 7 of 7 checks (summary in `tests/vh-adlc/evidence/review-convergence/S16.drift.md`); a guard, so it passed before T13. The first run stopped because the session PATH held a system `vh-adlc` 0.19.0 whose digest differs from the fixture lock; the case now runs with a PATH without `/usr/local/bin`.
- [x] T13 `plugins/vh-adlc/references/authority.md` - the Preservation rule against rewriting a commit a Review Log row names, even with approval, and the matching exception in the history-rewrite row; the T14 check passes (AC-10)
      Evidence: `bun test tests/vh-adlc/review-convergence.test.ts`, both authority checks pass. `bun test tests/vh-adlc`: 1569 pass, 9 fail; six are this feature's pending convention and guide checks, one is the version-change check T11 resolves, and the Bubblewrap clean and real go mod tidy tests fail identically on an export of origin/main.
- [x] T2 `docs/specs/spec-review-convergence.md` - the companion `vhco-pro/docs` change to `conventions/feature-documents.md` (severity definitions, the nit rule, the free-text rule) passes that repository's `npm run check` and an independent review with the rules block byte-for-byte unchanged; record its PR and published commit here (AC-02, AC-05, AC-06, AC-08)
      Evidence: https://github.com/vhco-pro/docs/pull/35 at `7c019b7` (branch docs/review-convergence off `c70769e`); `npm run check` passes, the rules block hashes the same as on main, and two independent reviews' findings are applied, including the Open questions exception for nits (R-17 F-01) and the widening case in the nit definition (R-17 F-07). Merged by the owner's go as `1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff`, the published commit.
- [x] T3 `AGENTS.md`, `plugins/vh-adlc/knowledge.md`, `plugins/vh-adlc/references/security-settings.md` - move every docs pin to the published commit; the T1 checks pass, and the rules block comparison and the three-spec lint, `fresh` and gate comparison between this commit and a scratch commit restoring the old pin show no difference (AC-06, AC-02, AC-05)
      Evidence: all three files now name `1ccf8f3`. `bun test tests/vh-adlc/review-convergence.test.ts`: every convention and authority check passes (7), the three guide checks still fail for T10; the nit-rule check now also covers the ride-along clause, the widening exception and the listing rule (R-17/R-18 F-06), and the guide-sentence check cites AC-08 (R-18 F-10). The `vh-adlc-rules` block at `d8f07c9` and `1ccf8f3` has the same sha256 (`9a72b316...cd665b`). For shared-docs-drift, seo-assessment and owner-readable-specifications, `lint`, `fresh` and `gate planned` in a scratch clone at this change and in one restoring the old `AGENTS.md` pin resolve `1ccf8f3` and `d8f07c9` and return identical `result`, `failing` and `findings` (9 of 9).
- [x] T4 `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md` - rate with the resolved definitions except where a declared lens sets the severity, ask the four failure-mode questions, return every finding in one pass, name every restatement, and say when a finding traces to the previous revision's change; the AC-02 (with its lens case), AC-03 reviewer, AC-04, AC-05 and AC-09 reviewer trials pass with fixtures, returned records and reported model committed under `tests/vh-adlc/evidence/review-convergence/` (AC-02, AC-03, AC-04, AC-05, AC-09)
      Evidence: 11 reviewer trials on fixtures rebuilt by `tests/vh-adlc/evidence/review-convergence/trials/build.py`, each an independent subagent following the updated agent at docs `1ccf8f3`, reporting `claude-opus-5-5`; all pass (records and table in `tests/vh-adlc/evidence/review-convergence/trials/`). AC-02: blocking, nit, should-fix and nit as seeded, and the spelling-lens finding at should-fix. AC-03: one finding names all five places stating the limit. AC-04: each of the four fixtures draws a finding on its open question, and the wording edit draws none (after a rerun once the cache held the prose guide). AC-05: nit and blocking on the passed row, should-fix after the row changed. AC-09: the finding cites the previous revision's diff. The agent also flags free-text widening nits in `EVIDENCE` (R-17 F-03), seen in ac05-passed.
- [x] T6 `tests/vh-adlc/scenarios/run.ts` - the AC-11 scenario case with the new convention; it fails because today's skill applies the clean pass's factual nit on its own (AC-11)
      Evidence: S16.nits added with canned records under `tests/vh-adlc/evidence/review-convergence/canned/nits/`. The failing run the task names was not observable: `bun tests/vh-adlc/scenarios/run.ts --phase 4 S16.nits` on the committed skill, before any T5 edit, passed 8 of 8 (`S16.nits.committed-skill.md`), because since T3 the skill reads the published convention, whose nit rule the agent followed. An earlier run whose fixture may have copied the T5 draft also passed 8 of 8 (`S16.nits.first-run.md`). The case stays as a guard for T5.
- [x] T5 `plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md`, `plugins/vh-adlc/references/review-protocol.md` - author mode states the four failure-mode answers in Design or raises Open Questions and sweeps every restatement in one commit; review mode applies a pass's findings as one revision after walking the behaviors and named checks, lets every nit of the pass ride along except a free-text widening nit, and lists the rest in the conversation, conditional on the resolved convention; the AC-07, AC-03 author and AC-09 author trials pass with transcripts under `tests/vh-adlc/evidence/review-convergence/`, the T6 case passes, and S7.7, S7.7.accept, S7.9 and S14.spec pass (AC-03, AC-07, AC-09, AC-11)
      Evidence: the skill's author mode now states the four failure-mode answers or raises Open Questions and sweeps restatements, and names nits as the exception to Open Questions (R-17 F-01); review mode step 4 applies a pass's findings as one revision after walking behaviors and named checks and follows the resolved nit rule, conditional on the convention defining severities; the protocol's Records paragraph points to it. Four author trials pass (`tests/vh-adlc/evidence/review-convergence/trials/authors/`): AC-07, AC-03, AC-09 and AC-09 with a judgement finding. `bun tests/vh-adlc/scenarios/run.ts --phase 7 S16.nits S7.7 S7.7.accept S7.9 S14.spec` with this skill: all five PASS (S16.nits summary in `S16.nits.t5.md`), run with the scenario PATH fix from https://github.com/michielvha/vh-adlc/pull/90 merged in.
- [x] T9 `tests/vh-adlc/fixtures/build.ts`, `tests/vh-adlc/scenarios/run.ts` - the fixture docs repository also holds the previous pin's commit, and the two old-pin cases: the procedure case with the scripted reviewer and the reviewer case with the real reviewer, as the AC-06 row states (AC-06)
      Evidence: `tests/vh-adlc/fixtures/build.ts` adds a previous-pin docs revision, the real docs at `d8f07c9` with no severity definitions. `bun tests/vh-adlc/scenarios/run.ts --phase 4 S16.oldpin S16.oldpin-reviewer`: both PASS. S16.oldpin (scripted reviewer): `knowledge` resolved the previous pin, the clean pass's lone factual nit was applied as today, and the report names the plugin's own pin. S16.oldpin-reviewer (real reviewer): the records raise the concurrency gap on the seeded shared `names.log`. Summaries in `tests/vh-adlc/evidence/review-convergence/S16.oldpin*.md`.
- [x] T10 `docs/get-started/first-feature.md`, `docs/user-guides/workflows.md` - describe the severities, the nit rule and the one-revision rule, and in the workflows guide that no approval allows rewriting a commit that a Review Log row names; the T12 guide checks pass (AC-08)
      Evidence: both guides now describe the three severities, the nit rule and applying a pass's findings as one revision, and the workflows guide says no approval allows rewriting a commit a Review Log row names. `bun test tests/vh-adlc/review-convergence.test.ts`: 10 pass, 0 fail; the guide checks now collapse whitespace, because the guides wrap prose mid-phrase.
- [x] T11 `plugins/vh-adlc/plugin.json`, `plugins/vh-adlc/.claude-plugin/plugin.json` - move both manifests together to one version above the version current at the time; the version-change check and the full `bun test tests/vh-adlc` pass (AC-06)
      Evidence: `main` merged in first (`db66788`), where both manifests read 0.18.1; both now read 0.19.0. `bun test tests/vh-adlc`: 1579 pass, 2 fail, the Bubblewrap clean and real go mod tidy tests, which fail identically on an export of `main`. The version-change check passes. Two checks needed fixes found here: the skill and agent restated two convention sentences word for word, reworded in `1371041`, and the spec body compatibility test now takes `1371041` as the accepted spec baseline and compares both sides without the loop-settings section.

## Open Questions

None. The owner decided on 2026-11-13: severity definitions go in the shared convention; the
failure-mode check goes in the reviewer and author steps without a template section; the free-text
check rule is included; the author stops requesting passes after three consecutive clean passes. After
R-1, the owner decided that three is a ceiling and acceptance after any clean pass is honored, that the
tighter severity definitions apply, that only non-acceptance, non-dirty spec rows count and stored passes
count after the update, and that the ceiling stays at three. After R-2, the owner had all six R-2
proposals applied before a further pass. After R-3, the owner decided that nits on the normative baseline
are saved rather than applied, that early acceptance is honored only when given in advance, that a
repository follows the convention its pin resolves, and that R-3's findings are applied before R-4 as
the last pass. After R-4, the owner decided that an acceptance given after a clean pass is honored while
the baseline is unchanged since it, had all six R-4 findings applied, and accepted in advance if R-5 has
no blocking finding. R-5 had a blocking finding, so that acceptance did not apply. After R-5, the
owner cut the streak to a count recorded in each Review Log row, which reverses the R-1 choice: rows
stored before the update no longer count. An advance acceptance now covers only the next pass. The
owner had R-5's other findings applied. R-6 had a blocking finding, so that acceptance did not apply either. The owner
chose to keep the full spec rather than split out the stopping rule, and decided after R-6 that saved
nits are those recorded since the latest acceptance row, that a drift re-review of an accepted document
keeps the acceptance and only lists its findings, and that the failure-mode check and one-pass
completeness apply on any pin while the convention-dependent parts follow the resolved pin. The
owner accepted at R-8 under an advance acceptance, then picked all seven R-8 findings to apply
(R-8 F-01 to F-07), which moved the document back to draft for this revision. After R-9, the owner decided that an advance acceptance
recorded here holds in a later session, that any pass on an accepted spec is a drift pass, and that
R-9 F-01 to F-07 are applied. The owner accepts in advance if R-10 has no blocking finding. R-10 was clean and the owner accepted
there. The owner then had all eight R-10 findings applied (R-10 F-01 to F-08) and asked that the process
lessons this review exposed go into vh-adlc itself: applying a pass's findings as one revision, and
never rewriting a reviewed commit. R-10 F-01 is settled as the reviewer proposed first: picks after an
acceptance are a pick revision that continues the count. R-10 F-03 is settled by cutting the
quote-matching rule for saved nits in favor of a list that marks addressed nits. R-11 was clean.
After R-11, the owner decided that picks after an early acceptance are followed by one pass and a new
acceptance question, that a pass's judgement findings are answered before its one revision commit, and
that a document without a `branch` field on a side branch merges the default branch in. The owner left
the remove-or-add choice open, so the author applied the recommended rule: remove when both behave the
same, otherwise ask with removal recommended. R-11 F-01 to F-09 are applied. R-12 had a
blocking finding: same-day dates cannot order picks against acceptances. After R-12, the owner adopted
the cut that ends that class of finding: the author writes `, after owner change` into the row of the
first pass after any change the owner directs, and asks again when that pass is clean, unless the owner
asks for the full loop. This replaces the pick revision and its dated ordering and changes the earlier
rule that a revision the owner asks for restarts the count. The owner also decided that an acceptance
withdraws the open questions of its pass into the listed findings. R-12 F-01 to F-09 are applied. R-13 had a
blocking finding in the stopping rule again. After R-13, the owner split the feature: the stopping rule,
the streak count, owner and advance acceptance rules, saved nits collected across passes and the
decision record moved to `docs/specs/spec-review-stopping-rule.md`, with criterion AC-01 and R-13 F-01
to F-04, and this document keeps the other parts, with a plain nit rule in place of saved nits. AC-01 is
retired here and its ID is not reused. R-13 F-06 and F-07 are applied here; F-05 moved with the markers it
concerns. R-14 had a blocking finding in the side-branch merge added after R-11.
After R-14, the owner dropped that side-branch merge, made the ban on rewriting reviewed commits absolute
(no approval exception), and let a pass's nits be fixed in a commit that already changes the baseline for
that pass's blocking or should-fix findings. R-14 F-01 to F-06 are applied. R-15 was
clean and the owner accepted there, with its findings to be settled during implementation; R-16, a drift
re-review after `shared-development-loop` landed, was also clean. During T2 the implement procedure
required those gaps to go through the spec instead, so the owner had them folded in one revision and
decided: a declared lens's severity wins over the definitions for that lens's findings; every nit of a
pass, factual or judgement and in any section, rides along with that pass's other baseline fixes, with no
nit raised as an Open Question, except a free-text widening nit, which stays listed; and R-15 F-02 to F-07
and R-16 F-01 to F-03 are applied. The owner accepts in advance if R-17 has no blocking finding.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-13 | R-1 | spec | `83ae24c` | claude-opus-5-5 | procedural | Two blocking findings (F-01 streak reset, F-02 blocking definition) and ten others |
| 2026-11-13 | R-2 | spec | `c643cc0` | claude-opus-5-5 | procedural | Clean: no blocking finding; three should-fix and three nits |
| 2026-11-13 | R-3 | spec | `cd193f3` | claude-opus-5-5 | procedural | Clean: no blocking finding; seven should-fix and three nits |
| 2026-11-13 | R-4 | spec | `89afa41` | claude-opus-5-5 | procedural | One blocking finding (F-01 advance acceptance contradicts S7.7.accept), three should-fix and two nits |
| 2026-11-13 | R-5 | spec | `f263bbd` | claude-opus-5-5 | procedural | One blocking finding (F-01 revision event resets on every applied fix), five should-fix and three nits; advance acceptance not met |
| 2026-11-13 | R-6 | spec | `96fc16f` | claude-opus-5-5 | procedural | One blocking finding (F-01 in-session passes break the S7.7 check), three should-fix and three nits; advance acceptance not met |
| 2026-11-13 | R-7 | spec | `b40d2ca` | claude-opus-5-5 | procedural | One blocking finding (F-01 Variants G and E assume stops the design does not make), four should-fix and three nits |
| 2026-11-13 | R-8 | spec | `005f0f5` | claude-opus-5-5 | procedural | Clean: no blocking finding; four should-fix and three nits, listed for the owner and not applied |
| 2026-11-13 | R-8 | spec | `005f0f5` | n/a | n/a | accepted by owner |
| 2026-11-13 | R-9 | spec | `67a08db` | claude-opus-5-5 | procedural | Clean: no blocking finding; five should-fix and two nits |
| 2026-11-13 | R-10 | spec | `57d866c` | claude-opus-5-5 | procedural | Clean: no blocking finding; six should-fix and two nits, listed for the owner and not applied |
| 2026-11-13 | R-10 | spec | `57d866c` | n/a | n/a | accepted by owner |
| 2026-11-13 | R-11 | spec | `4c7e151` | claude-opus-5-5 | procedural | Clean: no blocking finding; eight should-fix and one nit |
| 2026-11-13 | R-12 | spec | `d62c9f0` | claude-opus-5-5 | procedural | One blocking finding (F-01 same-day dates cannot order picks against acceptances), six should-fix and two nits |
| 2026-11-13 | R-13 | spec | `a581e9c` | claude-opus-5-5 | procedural | One blocking finding (F-01 a stale after-owner-change row blocks the next owner change), five should-fix and one nit |
| 2026-11-13 | R-14 | spec | `903314a` | claude-opus-5-5 | procedural | One blocking finding (F-01 the side-branch merge never runs when a fix also changes the baseline), four should-fix and one nit |
| 2026-11-13 | R-15 | spec | `76f0480` | claude-opus-5-5 | procedural | Clean: no blocking finding; five should-fix and two nits |
| 2026-11-13 | R-15 | spec | `76f0480` | n/a | n/a | accepted by owner |
| 2026-11-13 | R-16 | spec | `12370b8` | claude-opus-5-5 | procedural | Clean drift re-review after PR 87: no blocking finding; one should-fix and two nits, listed for implementation |
| 2026-11-14 | R-17 | spec | `db1d531` | claude-opus-5-5 | procedural | Clean: no blocking finding; six should-fix and three nits, listed for implementation |
| 2026-11-14 | R-17 | spec | `db1d531` | n/a | n/a | accepted by owner |
| 2026-11-14 | R-18 | spec | `94f54d5` | claude-opus-5-5 | procedural | Clean drift re-review after PR 88: no blocking finding; six should-fix and four nits, listed for implementation |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Terminology (Clean streak, line 140); Design, Stopping rule (lines 145-153); Context, Owner summary (lines 34-37)
EVIDENCE: Line 140 defines the clean streak as consecutive clean passes "since the last pass with a blocking finding, or since the document's last normative revision began". The pinned convention says Scope, Design, Acceptance Criteria, Test Plan and covers "form the normative baseline. A change to any of them is a revision" (conventions/feature-documents.md:70-71). Applying the findings of clean pass 1 or 2 almost always edits one of those sections, so under the Terminology definition every applied finding is a normative revision that resets the streak, and the streak never reaches three. Line 153 restricts the reset to "A normative revision of an accepted document", but line 140 has no such limit, so the two statements contradict each other on the rule AC-01 depends on.
PROPOSAL: Define the reset in one place as starting with a draft-moving revision of a planned or in-progress document (or name the exact event), say explicitly that applying findings from clean passes 1 and 2 does not reset the streak, and make line 140, line 153 and the Owner summary say the same thing.

FINDING: F-02
KIND: judgement
SEVERITY: blocking
WHERE: Design, Severity definitions (lines 165-169); Acceptance Criteria AC-02 (lines 213-215); Test Plan AC-02 row
EVIDENCE: The proposed blocking definition starts "a stated fact is false", with no materiality limit. In the measured logs, most factual findings are false-fact findings rated below blocking: counting KIND and SEVERITY pairs in the four spec-only logs at 83ae24c gives 286 factual should-fix or nit findings (shared-docs-drift 91 should-fix and 32 nit, seo-assessment 28 and 33, repository-security-settings 32 and 34, blog-visual-reading 7 and 29). An example is seo-assessment R-3, a nit that corrects a line range ("Change line 57 to `lifecycle.md:75-81`", docs/specs/seo-assessment.md:560-563). Under the new definition each of these would become blocking and reset the streak, which brings back the churn the feature exists to remove. The AC-02 trial builds this in by seeding "one false `file:line` claim" and requiring that it be rated blocking.
PROPOSAL: Limit blocking to a false fact that changes what is built, what a proof checks or how the binary reads the document, and rate a citation slip that changes none of those as a nit. Change the AC-02 seed to a false claim that the design depends on, and add a second seed with a harmless wrong line number that must be rated nit.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Severity definitions (lines 165-169); Design, Free-text checks (lines 193-195); Acceptance Criteria AC-05; Test Plan AC-05 row
EVIDENCE: should-fix covers only "a Test Plan proof could pass on a wrong implementation". None of the three definitions covers a proof that rejects a correct implementation or cannot be executed. The Context cites both kinds as real defects. blog-visual-reading R-8 is a proof Codex cannot observe (docs/specs/blog-visual-reading.md:598-604). R-44 F-01 and R-45 F-01 were rated blocking because the AC-07 patterns rejected correct editor wording, so "AC-07 could not be met reliably". The free-text rule then makes "a finding that only asks to widen the pattern to more wordings" a nit "once a review has passed the row". R-45 F-01 is exactly such a request, so a proof that fails correct implementations would be stored as a nit. "Passed the row" is also undefined: it could mean a review with no finding on that row, or one that ran its examples.
PROPOSAL: Add the case "a criterion cannot be met, or its proof fails a correct implementation" to the severity definitions. Limit the free-text demotion to widening that only catches more wrong outputs, not widening that stops correct outputs being rejected. Define "passed the row" in terms the Review Log records. Consider requiring a machine-readable verdict instead of free-text patterns, as R-45 F-01 proposed.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary (line 28); Context, Background, Measured churn (lines 79-94)
EVIDENCE: The command counts every `### R-` subsection and every `SEVERITY: blocking` line, including implementation reviews. The shared-triage Review Log has 22 spec rows, of which 4 are acceptances, and 16 implementation rows (R-13 to R-16 and R-23 to R-34). Its blocking findings sit in R-1 (one) and in implementation reviews R-13, R-14, R-15, R-23 to R-27, R-30, R-31 and R-33 (nineteen). It was first accepted at R-2 after a NO FINDINGS pass (`| 2026-10-23 | R-2 | spec | ... | accepted by owner |`). repository-security-settings is 36 spec passes plus implementation review R-37. The table's 34 passes and 20 blocking findings for shared-triage, and the Owner summary's "Recent specs needed 34 to 47 independent review passes before acceptance", are therefore not true for that spec.
PROPOSAL: Count only spec rows up to the first acceptance (for example by filtering Review Log rows on `| spec |` and excluding `accepted by owner`), recount blocking findings by spec pass, and correct the Owner summary range. Alternatively, drop shared-triage from the table.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary (lines 28-43); Context, Background (line 104)
EVIDENCE: The summary does not state the two costs the measured logs show. First, blog-visual-reading had blocking findings only in R-1 and R-8 before R-40 (awk over the SEVERITY lines per R- subsection), so the new rule would have stopped after R-4 and accepted the spec without the R-8 defect, which Background calls "a real, pre-existing gap" (line 104). Second, the current skill asks for acceptance once one clean review exists (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:73-75), and shared-triage was accepted at R-2 after a NO FINDINGS pass. The new rule needs at least three passes for every spec, including one whose first pass returns NO FINDINGS. The conventions ask the summary to cover trade-offs (conventions/feature-documents.md:80-82).
PROPOSAL: Say in the Owner summary and Design that a late real gap like R-8 can now reach acceptance, and name what is expected to catch it (implementation review or a later revision). Also say that the minimum rises from one clean pass to three, and whether passes that return NO FINDINGS at an unchanged commit count toward the streak.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (lines 145-152); Context, Owner summary (lines 35-36); Acceptance Criteria AC-01
EVIDENCE: Line 146 says "after a clean pass, the author applies its findings", and AC-01 says the author "applies the findings of the first and second consecutive clean passes". The current procedure applies only factual findings and turns judgement findings into Open Questions (SKILL.md:71-72; references/review-protocol.md:77-78), and only the owner answers Open Questions (conventions/feature-documents.md:139). Line 151 says only third-pass judgement findings are listed "instead of becoming Open Questions", which implies that in passes 1 and 2 they still become questions. The design does not say whether the author waits for the owner's answers before requesting the next pass. If the questions are still open at the third pass, acceptance is blocked by no_open_questions, and folding the answers afterwards changes the baseline and makes the third pass stale.
PROPOSAL: State that in clean passes 1 and 2 factual findings are applied and judgement findings become Open Questions, which must be answered and folded before the next pass is requested. Use the same wording in AC-01 and the Owner summary.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (lines 155-159); Design, Delivery (lines 199-206)
EVIDENCE: "The skill computes the streak from the Review Log and the stored records it already keeps" does not say which rows count. Review Logs mix spec rows, implementation rows, acceptance rows (shared-triage), `+dirty` diagnostic rows, which "never count as current" (review-protocol.md:20-21), and re-reviews caused only by drift from the default branch (conventions/feature-documents.md:220-222). The design also gives no upgrade behavior for drafts that are mid-loop when the plugin moves, although blog-visual-reading has 47 passes rated before any severity definition existed. That is the "upgrade or rollback from the previous version" question the document's own failure-mode check asks (line 178).
PROPOSAL: List which rows count (spec kind only, no `+dirty`, no acceptance rows) and how a drift-only re-review counts. State whether passes stored before the new pin count toward a document's streak.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule; frontmatter covers; Scope
EVIDENCE: tests/vh-adlc/scenarios/run.ts S7.7.accept stores one NO FINDINGS review, then has the owner say "I accept the document as reviewed in R-1", and checks "no second review was stored" and that the document reaches planned. S7.7 has the owner accept "if the review found nothing blocking" after one review. Under the stopping rule a single clean pass leaves the streak at 1, so either these scenarios now fail, or the owner can accept before the streak reaches three. The design does not say which. tests/vh-adlc/scenarios/run.ts is not in covers, and no part of the plan updates it.
PROPOSAL: Decide whether an explicit owner acceptance below a streak of three is honored, and state it in Design and AC-01. Add tests/vh-adlc/scenarios/run.ts to covers and say how S7.7 and S7.7.accept change.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-06 row
EVIDENCE: The row says to run `vh-adlc lint`, `fresh` and `gate planned` "on three historical specs under both pins and compare the JSON results". In this repository the binary takes the pin from AGENTS.md and ignores `--plugin-pin`: `vh-adlc lint docs/specs/shared-triage.md --repo <repo> --plugin-pin 0e52f51f01b84eda75a976763c42d8ec0a07b544` returned `"knowledge":{"revision":"d8f07c9dd69038375a535af8ad586086688f85ab","source":"repository","pin_files":["AGENTS.md"],"override":false,...}`. A run with the new pin passed as a flag would therefore evaluate the old pin again, and the comparison would pass without testing anything. The JSON also contains pin-dependent fields by design, `knowledge.revision` and the gate `line` ("docs d8f07c9"), and `fresh` contains remote and local SHAs, so a literal comparison fails. The three specs are not named.
PROPOSAL: Name the three specs. Run each pin from a scratch clone whose AGENTS.md names that pin, assert `knowledge.revision` equals it, and compare only `result`, `failing` and `findings`.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-01; Test Plan AC-01 row
EVIDENCE: The Design defines three behaviors that AC-01 and its trial never exercise. When the owner picks third-pass findings, they are applied and one more pass is requested, with acceptance asked again after it (lines 148-150). Judgement findings in the third pass are listed instead of becoming Open Questions (lines 150-152). Applied findings are swept for restatements in the same commit, which belongs to AC-03. The AC-01 trial covers only a straight run with no owner picks and should-fix or nit findings, so a skill that turns third-pass judgement findings into Open Questions, or that asks for acceptance right after applying owner-picked findings, would still pass.
PROPOSAL: Extend AC-01 to the owner-pick branch and to third-pass judgement findings. Add trial variants where the owner picks one finding, and where the third pass holds a judgement finding that must be listed rather than turned into a question.

FINDING: F-11
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary (lines 38-41); Design, Failure-mode check (lines 176-179); Acceptance Criteria AC-04 (lines 219-221); Test Plan AC-04 row
EVIDENCE: The summary lists "concurrent access, partial failure, retry or replay, and upgrade or rollback" for designs that "cross a process boundary". The Design says "process or network boundary" and the same four questions. AC-04 lists only "concurrent access, partial failure, retry or rollback" and covers only shared state, and the fixture only tests a shared counter. Replay, upgrade and the boundary-crossing trigger have no criterion.
PROPOSAL: State the same list of triggers and questions in the summary, Design and AC-04, or note in AC-04 that it tests only the shared-state case.

FINDING: F-12
KIND: factual
SEVERITY: nit
WHERE: Context, Background (lines 74-75)
EVIDENCE: "Applying any finding changes the normative baseline, which makes the review stale" is too broad. Only Scope, Design, Acceptance Criteria, Test Plan and covers form the baseline (conventions/feature-documents.md:70-71, rules block normative_sections and normative_frontmatter), so a finding applied to Context, the Owner summary or Sources leaves the review fresh.
PROPOSAL: Say "Applying a finding to the normative baseline makes the review stale".

### R-2

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (steps 1 and 4, lines 164-166 and 173-174, and lines 180-181); Acceptance Criteria AC-01 (lines 237-242); Test Plan AC-01 row (Variant D); Context, Owner summary (line 38-39, "you can still accept after any clean pass, as today"); Context, Background, Existing scenarios
EVIDENCE: Step 1 has the author apply a clean pass's factual findings and put its judgement findings to the owner as soon as the pass returns, whenever the streak is below three. Step 4 says "The owner may accept after any clean pass". Lines 180-181 say "Acceptance still requires a fresh, clean review at the accepted commit". If clean pass 1 holds a factual finding that edits Scope, Design, a criterion or the Test Plan, step 1 has already changed the normative baseline by the time the owner accepts. An acceptance row naming that pass then fails `accepted`, which needs "a clean spec review whose commit has the current normative baseline" (conventions/feature-documents.md:309). The design does not say whether an owner acceptance after a pass that holds findings skips step 1 (apply nothing and list the findings, as at pass 3), or applies them and requests another pass. Variant D says "pass when the acceptance row is written without further passes" but does not say whether its first clean pass holds findings, so a skill that applies a baseline finding and writes a stale acceptance row, or one that drops step 1, passes when the fixture pass is NO FINDINGS. Two careful implementers would build different skills here. Background names only S7.7 and S7.7.accept as single-pass acceptances, but tests/vh-adlc/scenarios/run.ts S7.9 (around line 1072) also has the owner pre-accept a revision "If it finds nothing blocking and leaves no open questions", after one review.
PROPOSAL: State what happens when the owner accepts after a clean pass below three that holds findings (for example: apply nothing, list its findings as in step 2, and write the acceptance row at that pass), and use the same wording in AC-01 and the Owner summary. Make Variant D's first clean pass hold a factual finding on the normative baseline and require that `gate planned` passes, and list S7.9 with the scenarios that must keep passing.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Terminology (Clean streak, line 156); Design, Stopping rule (lines 179-180, "Nothing new is stored: the skill reads the streak from the Review Log rows and their ### R-<n> records"); Acceptance Criteria AC-01; Test Plan AC-01 row
EVIDENCE: Line 156 says moving a planned or in-progress document to draft for a revision resets the streak. The Review Log never records that move. SKILL.md:98-99 commits it on its own as a `vh-adlc gate draft` commit, so it shows only in Git history. An acceptance row followed by later spec rows does not show it either, because a re-review caused only by default-branch drift also follows an acceptance and keeps it (conventions/feature-documents.md:220-222; Design line 177 counts such a re-review as a pass). The streak as defined therefore cannot be read from the Review Log rows and records alone. AC-01 does not mention the revision reset, and Variants A to D contain no revision. A skill that carries a pre-acceptance streak of three or more through a revision would apply nothing after the first post-revision pass and still pass every listed check.
PROPOSAL: Name the source the skill uses to find the reset, for example the latest `gate draft` commit on the document in Git history, or rows after the latest acceptance row when the document's status history shows a revision, and correct line 179-180 to match. Add the revision reset to AC-01 and a Test Plan variant where a planned document with a stored streak of three is revised and the next clean pass is treated as streak one.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-03 (lines 247-249); Test Plan AC-03 row (line 267); Design, One-pass completeness and restatements (lines 212-213)
EVIDENCE: The AC-03 fixture "states one limit in Scope, Design, a criterion and the Owner summary, with one copy different", and the author trial passes "when the resulting commit changes all four". If the finding proposes the value the other three copies already hold, a correct author edits only the one different copy and leaves the document consistent, and the proof fails that author. If the trial instead accepts one edited copy, it cannot tell a skill that sweeps restatements from one that only edits the location the finding names first. The row does not say which value the finding asks for.
PROPOSAL: Specify that the fixture finding asks for a value none of the four copies hold, so every copy must change, or pass the author trial when all four locations state the finding's value after one commit and the commit touches every copy that differed.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-01, AC-02, AC-03, AC-04 and AC-05 rows; Design, Delivery (lines 230-231)
EVIDENCE: Delivery says "new scenario cases cover the streak", and covers lists tests/vh-adlc/scenarios/run.ts. The AC-01 row instead uses "Disposable author trials in temporary repositories with a fixture spec and a scripted reviewer, transcripts preserved". The AC-02 row says "Store the returned records and the reported model". Neither says where the transcripts, fixtures or records are kept, although the repository already keeps such evidence under tests/vh-adlc/evidence/. An implementation reviewer has to inspect or rerun these trials, and the document does not say whether they are committed scenario cases or scratch runs.
PROPOSAL: Say whether the AC-01 variants are scenario cases in run.ts or scratch trials, and name the committed path for the fixture specs, transcripts and returned reviewer records, for example tests/vh-adlc/evidence/review-convergence/.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-04 (lines 252-253); Test Plan AC-04 row (line 268)
EVIDENCE: AC-04 requires that the wording-only design gets "none of those findings", meaning no failure-mode finding. The Test Plan row passes only "when the first two each return a failure-mode finding and the third returns none". Read literally, a reviewer that returns an unrelated wording nit on the third fixture fails the trial, although it meets AC-04.
PROPOSAL: Change the row to "and the third returns no failure-mode finding".

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design, Delivery (lines 227-228); Acceptance Criteria AC-06 ("the plugin points at the published docs commit")
EVIDENCE: The docs SHA appears in three places, not two: AGENTS.md:4, plugins/vh-adlc/knowledge.md:5 and :7, and plugins/vh-adlc/references/security-settings.md:5, which links conventions/repository-security.md at d8f07c9dd69038375a535af8ad586086688f85ab (`git grep -n d8f07c9 c643cc0`). The last pin move (ff8d7fe, "Both docs pins move to d8f07c9") left security-settings.md alone. Delivery names only AGENTS.md and knowledge.md, so after this feature security-settings.md would still point at the old revision, and it is unclear whether that meets "the plugin points at the published docs commit".
PROPOSAL: Say whether references/security-settings.md moves with the pin. If it stays, narrow AC-06 to the knowledge.md and AGENTS.md pins.

### R-3

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (steps 1 and 4, lines 168-170 and 177-180); Context, Owner summary (lines 40-42, "you can still accept after any clean pass, as today"); Acceptance Criteria AC-01; Test Plan AC-01 row (Variant D)
EVIDENCE: Step 1 says that after a clean pass below three the author "applies its factual findings, turns its judgement findings into Open Questions, and puts them to the owner". Step 4 says the owner may accept after any clean pass, and the author then applies none of that pass's findings and writes the acceptance row at it. The design never says whether the author offers that choice before carrying out step 1. If step 1 runs first and commits a normative fix, an acceptance the owner gives afterwards cannot be written at that pass, because `accepted` needs "a clean spec review whose commit has the current normative baseline" (conventions/feature-documents.md:309). So one implementer pauses after every clean pass to ask "accept now or continue", adding an owner round trip to each pass. Another applies at once and honors only an acceptance the owner gave in advance, as S7.7 and S7.9 do (tests/vh-adlc/scenarios/run.ts:534, :1078). Variant D scripts the acceptance, so both skills pass it. Under the second reading, the summary's "you can still accept after any clean pass" holds only for an acceptance given in advance.
PROPOSAL: Say when the author offers acceptance relative to step 1. For example: only an acceptance the owner has already given, or gives before the author starts applying, triggers step 4; otherwise step 1 runs. Use the same wording in the Owner summary and AC-01, and add a Variant D check that matches the chosen timing.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Background; Design, Delivery (lines 229-242); Acceptance Criteria AC-06; frontmatter covers
EVIDENCE: At cd193f3, docs/specs/shared-development-loop.md (status draft) covers plugins/vh-adlc/skills/vh-adlc-spec/, plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md, plugins/vh-adlc/references/review-protocol.md and tests/vh-adlc/ (`git show HEAD:docs/specs/shared-development-loop.md`, lines 7-15 and 23). On origin/main (b777df0) it also covers knowledge.md and both plugin.json manifests, and its Scope includes "the plugin pin bump that adopts it" (line 151). It also changes `/spec review` acceptance behavior (line 359). This spec edits the same review-mode steps, moves the same pin, and says "both manifests move from 0.16.1" (line 235). It never mentions the other feature. Whichever lands second will find the version and pin already moved and the SKILL.md review steps rewritten, and AC-06's "every docs pin in the plugin points at the published docs commit" then depends on which docs commit the other feature published.
PROPOSAL: Name shared-development-loop in Background and say how the two sequence. For example: whichever lands second rebases its SKILL.md and protocol edits onto the first, and bumps the version and pin from whatever is current then. Rephrase "move from 0.16.1" as "move from the current version".

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Severity definitions (line 202); Design, Delivery (lines 229-242); Scope, Out of scope ("Moving any consumer repository's pin")
EVIDENCE: The definitions and the free-text rule go only into the convention at the new docs revision, and the reviewer agent "tells the reviewer to rate with these definitions". plugins/vh-adlc/knowledge.md:8-9 says "`vh-adlc knowledge` decides whether the repository's own pin or this one applies", and a repository pin wins (`lint` here reports `"source":"repository","pin_files":["AGENTS.md"]`). A consumer that keeps an older pin, which this feature deliberately leaves alone, would run the updated reviewer and skill against a convention page that has no severity definitions, no free-text rule and the old Acceptance step 2. The page exists, so the `missing-page` stop in references/loop.md:86-87 does not fire. This is the upgrade question the document's own failure-mode check asks (lines 206-209), and Design does not answer it.
PROPOSAL: State the behavior for a repository whose pin predates the companion change. For example: the reviewer agent and skill carry the definitions and the stopping rule themselves, or the skill reports that the pin is too old and falls back to the current procedure. Add a check for that case to AC-06.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-01; Test Plan AC-01 row (Variants A and B); Design, Terminology (Clean streak, line 160); Design, Stopping rule (lines 183-186)
EVIDENCE: Variant B is "blocking finding in the second clean position; pass when the count restarts". Nothing stores the count, so "restarts" is observable only through what the author does on later passes, and the row does not say how many passes follow the blocking one. A skill that counts all clean passes in total, without resetting, passes a run that ends one or two passes after the blocking pass. The owner's R-1 decisions are that acceptance rows and `+dirty` rows do not count and that passes stored before the update do count (lines 291-293, Design lines 160 and 184-185). AC-01 does not state them and no variant contains any of those rows, so a skill that counts a `+dirty` row as a clean pass, or ignores stored passes, passes every listed check.
PROPOSAL: Give Variant B a full sequence, for example clean, blocking, clean, clean, clean, and pass it only when the findings of the first two clean passes after the blocking pass are applied and only the third is listed. Add a variant whose stored log has a `+dirty` clean row, an acceptance row and pre-update clean passes, with an expected streak, and add those counting rules to AC-01.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Failure-mode check (lines 206-212); Scope ("A failure-mode check in the reviewer's spec section and the author's instructions"); Acceptance Criteria AC-04 (lines 260-263); Test Plan AC-04 row (line 278)
EVIDENCE: Design and Scope add the check to the author's mode too: "state the behavior for each of the four questions in Design". No criterion or Test Plan row covers the author side, so a skill without that step meets every criterion. AC-04 lists four questions, but the two positive fixtures only exercise concurrent updates (shared counter) and retry or replay (remote API). No fixture leaves partial failure or upgrade and rollback undefined while defining the rest, so a reviewer that never asks about upgrade or rollback passes. Design names "runs concurrently" and "process boundary" as triggers; AC-04 names only shared state and network boundary. By this document's own definition (line 197), a proof that can pass on a wrong implementation is should-fix.
PROPOSAL: Add a criterion and an author trial for the authoring step, for example an author drafting a fixture feature that crosses a boundary and stating behavior for all four questions in Design. Add a reviewer fixture that defines concurrency and retry but leaves upgrade and rollback undefined, and pass it only when the reviewer returns a failure-mode finding on upgrade or rollback.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Free-text checks (lines 221-227); Design, Stopping rule (step 1, lines 168-170); Context, Background (blog-visual-reading cascade, lines 114-117)
EVIDENCE: The stopping rule never looks at should-fix versus nit. Step 1 applies every factual finding and asks every judgement finding as an Open Question, whatever its severity, and only blocking affects the streak. So demoting a widening request from should-fix to nit changes nothing the author does. A widening request in clean pass 1 or 2 is still applied or asked. If the widened pattern then rejects a correct output, that is blocking and resets the streak. That is the R-39 to R-40 to R-44 to R-45 sequence that Background cites (docs/specs/blog-visual-reading.md:1411, :1524, :1547). The Owner summary presents the rule as part of the churn fix (lines 48-49), but as written it only changes a label.
PROPOSAL: Either give nits a different handling in steps 1 and 3 (for example, nits on an already reviewed row are listed rather than applied), or say plainly that the rule only standardizes ratings and does not change the loop.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-05 (lines 264-266); Test Plan AC-05 row (line 279); Design, Free-text checks (lines 224-225)
EVIDENCE: The row says "pass when a seeded request to widen it for more wrong outputs is rated nit". A reviewer reviews a spec and raises its own findings; a fixture spec cannot contain a request for it to rate. The row does not say what makes the pattern "reviewed" in the fixture. Design defines that as "a clean pass's records hold no finding whose `WHERE` names that row", so the fixture needs a stored clean pass. The row also does not say what happens when the reviewer does not raise the widening at all. A reviewer that never mentions the gap either passes or fails, depending on how the trial runner reads the row.
PROPOSAL: Specify the fixture: a Review Log with a stored clean pass that names no Test Plan row, a pattern row whose listed examples omit one stated wrong output, and a correct output the pattern rejects. Pass only when the reviewer returns a nit for the missed wrong output and a blocking finding for the rejected correct output, and fail the trial if either finding is missing.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-01 row ("a scripted reviewer"); Design, Delivery (lines 238-239)
EVIDENCE: tests/vh-adlc/scenarios/run.ts dispatches the real reviewer subagent (for example S7.7 at :532-535, and the trace checks at :201-207 and :1193-1196). The harness has no mechanism for a scripted reviewer. A scripted reviewer has to return set records with a `MODEL:` line on each of up to five passes in one session, and the skill must accept it under references/review-protocol.md, which prefers the registered `vh-adlc-reviewer` agent. The document does not say how that substitution works, for example a plugin copy whose reviewer agent returns canned records keyed by pass number, as S14 copies the plugin (:600-603).
PROPOSAL: Name the scripted-reviewer mechanism in Delivery and say what its returned `MODEL:` line is, so the scenario evidence can be reproduced.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Design, Stopping rule (steps 2 and 4, lines 171-173 and 177-180)
EVIDENCE: Steps 2 and 4 have the author apply nothing, so the acceptance stays valid. The convention puts only Scope, Design, Acceptance Criteria, Test Plan and covers in the normative baseline (conventions/feature-documents.md:70-71), and `fresh` only reports `baseline-changed` for those. A finding confined to Context, the Owner summary or Sources could be applied without making the accepted review stale, yet the design leaves even a known false citation in Context unfixed unless the owner picks it.
PROPOSAL: Either allow findings confined to non-normative sections to be applied at steps 2 and 4, or say that leaving them unapplied is intended.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Context, Background, Model context (lines 125-126)
EVIDENCE: "The owner is moving routine spec and review work off the most expensive model tier" has no citation, and the Context section is required to cite its claims (conventions/feature-documents.md:75-76). Nothing in this repository at cd193f3 records that move.
PROPOSAL: Cite the source, for example the commit or settings that record the model move, or drop the sentence, since the paragraph's conclusion rests on the Review Log models.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Context, Background, Existing scenarios (lines 125-129); Design, Delivery (line 274); Test Plan AC-01 row (last sentence, "S7.7, S7.7.accept and S7.9 still pass"); Design, Terminology (Advance acceptance, line 178); Open Questions (line 340, "early acceptance is honored only when given in advance")
EVIDENCE: Background says S7.7, S7.7.accept and S7.9 are "All three ... acceptances given in advance of a single clean pass", and Delivery says they "keep their advance acceptance after one clean pass". The scenario harness sends turns one after another and resumes the session only after the previous turn ends (tests/vh-adlc/scenarios/run.ts:137-141). S7.7.accept stores a NO FINDINGS R-1 first (`accept(f, "NO FINDINGS", false)`, run.ts:577), then the owner says "I accept the document as reviewed in R-1" (run.ts:579) and the checks require "no second review was stored" (run.ts:591). That acceptance arrives after the pass returned, at a streak of one. S7.7 sends its conditional acceptance as a second turn (run.ts:532-535), after the first turn's review and whatever the author did after it. Terminology defines an advance acceptance as one given "before a pass returns", and the owner decided it is honored only then. A skill that follows the Design must keep going after R-1 in S7.7.accept, which fails that scenario's check, while the AC-01 row requires the scenario to keep passing. So either the proof fails a correct implementation, or the implementer honors a post-pass acceptance below three, which the Design and the owner's decision exclude. S14.spec (run.ts:626, "The owner accepts ... against R-1") is another post-pass acceptance the document does not mention.
PROPOSAL: Decide whether an acceptance the owner gives after a clean pass, at a baseline unchanged since that pass, is honored below a streak of three, and state it in Terminology, the stopping rule, AC-01 and the Owner summary. Then correct the Background description of S7.7 and S7.7.accept, and either keep those scenarios as passing proof or say how they change.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (step 3, lines 190-193, "The author does not stop to ask whether to accept"); Scope (lines 146-156); frontmatter covers (lines 6-19)
EVIDENCE: The rules block stays unchanged, so `vh-adlc next` returns `owner acceptance` once a fresh, clean spec review exists (conventions/feature-documents.md:279). After a clean pass below three that returns NO FINDINGS, or only saved nits and Context or Sources fixes, the baseline is unchanged and the review stays fresh, so `next` answers `owner acceptance`. The resume skill stops and asks the owner to accept on that answer (plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md:36-42), and plugins/vh-adlc/references/loop.md:136-138 presents the acceptance question "including through resume". Neither file is in covers or Scope. A resumed session would therefore ask for acceptance at a streak of one or two, which step 3 forbids, and nothing in the Test Plan exercises resume.
PROPOSAL: Add the resume skill and loop.md to Scope and covers, and say that resume applies the stopping rule before acting on `owner acceptance` from `next`. Add a Test Plan variant that resumes a draft at a streak of one with a fresh clean review and passes only when another pass is requested instead of an acceptance question.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Clean streak, line 176); Context, Owner summary (lines 41-42, "and so does a revision of an accepted document"); Acceptance Criteria AC-01; Test Plan AC-01 row (Variant E)
EVIDENCE: Terminology resets the streak only at "the latest commit that moved the document from `planned` or `in-progress` to `draft`". The rules block also allows `blocked: [draft, ...]` and `parked: [draft, ...]` (conventions/feature-documents.md:236-237). A planned document that moves to blocked and is then revised reaches draft from blocked, so no planned-to-draft commit exists and the pre-revision streak still counts. A document that has an acceptance row but is still draft (for example when the planned gate failed after the row was written) can have its baseline edited without any `gate draft` commit at all. In both cases the Owner summary's "a revision of an accepted document" resets the count, but the Terminology rule does not, so the first clean pass after the revision could end the loop. Variant E only covers planned to draft.
PROPOSAL: Define the reset event so it covers every revision of an accepted document, for example any move to draft from another status, plus baseline changes after the latest acceptance row. Make the Owner summary and AC-01 use the same definition.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-04 (lines 300-302); Test Plan AC-04 row (line 322); Design, Failure-mode check (lines 229-232)
EVIDENCE: AC-04 requires "a failure-mode finding for each of the four questions" the design leaves undefined. The first two fixtures state nothing about concurrency, or nothing about retry or replay, and each passes when it returns "a failure-mode finding on the undefined question", singular. The third fixture isolates upgrade and rollback. No fixture isolates partial failure, and the first two do not check that every undefined question is reported. A reviewer that never asks about partial failure, or that reports one question per design, passes the row while missing what AC-04 requires.
PROPOSAL: Say in the row that each fixture passes only when the reviewer reports every question that fixture leaves undefined, and list those questions per fixture. Add a fixture that defines concurrency, retry and upgrade but leaves partial failure undefined.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (lines 39-41); Design, Stopping rule (step 1, lines 186-187, and step 4, lines 194-196)
EVIDENCE: The Owner summary says "After the third clean pass nothing more is applied". Step 1 lets findings confined to Context or Sources be applied "at any time", and step 4 limits only the normative baseline. Step 1 also covers only Context and Sources, so a nit on Tasks, Open Questions or other non-normative text is neither saved nor allowed.
PROPOSAL: Have the Owner summary say that nothing on the normative baseline is applied after the third clean pass. In step 1, allow findings confined to any non-normative section.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria AC-06 (lines 306-310); Test Plan AC-06 row (line 324)
EVIDENCE: AC-06 says "every docs pin in the plugin points at the published docs commit" and "both manifests carry the same new version". The row also checks AGENTS.md, which is the repository pin and not part of the plugin (`git grep -n d8f07c9` lists AGENTS.md:4, plugins/vh-adlc/knowledge.md:5 and :7, plugins/vh-adlc/references/security-settings.md:5). It checks only that "both manifests match", not that the version changed from 0.16.1 (plugin.json:4, .claude-plugin/plugin.json:14).
PROPOSAL: Name AGENTS.md in AC-06 as the repository pin, and have the row check that the two manifest versions match and are higher than the version current before the change.

### R-5

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Terminology (Clean streak, line 188); Design, Stopping rule (lines 223-224, "the document's Git history for the latest `gate draft` commit"); Context, Owner summary (lines 43-44, "and so does a revision of an accepted document"); Acceptance Criteria AC-01 (lines 302-303); Test Plan AC-01 row (Variants E and F)
EVIDENCE: Line 188 counts only rows "whose reviewed commit descends from the latest revision event", and a revision event includes "any commit after the latest acceptance row that changes the normative baseline". The same line then says "Applying the findings of clean passes does not reset it". Take a planned document that is revised, as in S7.9 (tests/vh-adlc/scenarios/run.ts:1066, where plan() stores an acceptance row first, tests/vh-adlc/fixtures/build.ts:387-391). Its acceptance row stays the latest one during the revision. Clean pass A holds a factual should-fix, and step 3 (line 204) applies it in commit Y. Y comes after the latest acceptance row and changes the baseline, so Y becomes the latest revision event, pass A no longer descends from it, and the next clean pass is streak one again. Every clean pass that carries a baseline fix moves the event forward, so for a revised accepted document the streak cannot reach three and the churn the feature removes comes back. The definition also over-resets elsewhere: a never-accepted draft that goes draft to blocked to draft with no baseline change resets the streak, because "any commit that moves the document to draft from another status" counts, while the Owner summary limits the reset to "a revision of an accepted document". Line 223-224 says the skill finds the reset from "the latest `gate draft` commit", which does not detect the baseline-commit clause at all. Variant E checks only the first clean pass after the revision, so a skill that resets on every applied fix passes it. Variant F stores an acceptance row and expects streak three, which is only true if the fixture reaches a new pass without any baseline change after that row; the row does not say how.
PROPOSAL: Define the revision event once as the earliest commit after the latest acceptance row that changes the baseline or moves the document to draft from planned or in-progress, so later fixes from clean passes never move it, and use the same wording on line 188, lines 223-224, the Owner summary and AC-01. Extend Variant E to run to the third clean pass after the revision with a baseline fix applied after each of the first two, and say in Variant F that the new pass is a drift-only re-review with the baseline unchanged since the acceptance row.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (step 3, lines 206-208); Context, Owner summary (lines 46-47, "The author never stops to ask before the ceiling, including in a resumed session"); Context, Background, Existing scenarios (lines 128-132); Design, Delivery (lines 290-291); Test Plan AC-01 row (Variant G and the S7.7 sentence)
EVIDENCE: Step 3 says the spec and resume operations "request another pass instead of asking", but never says whether that means dispatching the reviewer again in the same session or ending the turn with a report that another pass is needed. Today review mode dispatches once per invocation (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:62-75 at 3963e25). The two readings behave differently in S7.7, whose first turn is `/vh-adlc-spec review` and whose second turn is the conditional acceptance (run.ts:529-532). With in-session dispatch, turn 1 runs real reviewer passes until the ceiling and the turn-2 acceptance names the third pass. With a report-and-stop reading, turn 2 is an owner acceptance at R-1, or an advance acceptance for R-2 if R-1's fixes changed the baseline. Background and Delivery say S7.7 keeps passing because its acceptance "names a clean pass whose baseline is unchanged", which holds only for one reading. Variant G passes "when another pass is requested", which a test cannot observe until the meaning is fixed: a reviewer dispatch in the trace, a new Review Log row, or a line in the report.
PROPOSAL: State whether the spec operation dispatches the next pass itself in the same session, and whether resume does. Make Variant G check that observable, for example a new stored spec row and no acceptance question in the report, and say which path S7.7 takes under the new rule.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Owner acceptance, line 190); Design, Stopping rule (step 6, lines 215-218); Scope (lines 159-160); Test Plan AC-01 row (Variant D)
EVIDENCE: Terminology defines an advance acceptance as one given "before a pass returns, conditioned on that pass being clean", which binds it to one pass. Step 6 and Scope honor it at "the first clean pass that meets its condition", which can be a later pass. If the pass after the owner's advance acceptance is blocking, step 2 applies its fixes to the baseline, and under step 6 the next clean pass is accepted on the owner's behalf with content the owner never saw. Under the Terminology reading the acceptance lapses at the blocking pass and the loop continues. Two careful implementers would build different skills, and the difference decides what the owner's acceptance authorizes. Variant D starts with a clean pass, so both skills pass it. This document's own status line relies on the same rule ("The owner accepts in advance if R-5 has no blocking finding", line 3).
PROPOSAL: State whether an advance acceptance survives an intervening blocking pass and its fixes, use the same wording in Terminology, step 6 and Scope, and add a Variant D case with a blocking pass before the first clean pass that checks the chosen behavior.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Free-text checks (lines 262-267); Design, Severity definitions (should-fix, lines 235-236); Acceptance Criteria AC-05; Test Plan AC-05 row
EVIDENCE: A row "has passed review once a clean pass's records hold no finding whose `WHERE` names that row". A clean pass whose reviewed commit predates the row, or predates the row's current pattern, also holds no finding naming it, so a newly added or rewritten pattern is treated as already reviewed and any request to widen it becomes a nit at once. Any `NO FINDINGS` pass makes every row in the document count as passed. The should-fix definition says "a proof could pass on a wrong implementation", which is exactly what a missed wrong output is, and the definitions as written carry no exception for it, so the convention would state two ratings for the same case in two places. The AC-05 fixture has one stored clean pass and an unchanged row, so it does not exercise either case.
PROPOSAL: Count a row as passed only when the clean pass's reviewed commit already holds the row's current text, and name the free-text exception inside the should-fix definition. Add an AC-05 case where the row changes after the stored clean pass and a widening finding must then stay should-fix.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Pins and older consumers (lines 271-274); Design, Stopping rule (lines 195-196); Acceptance Criteria AC-06; Test Plan AC-06 row (old-pin clone)
EVIDENCE: Line 195-196 puts the stopping rule into `SKILL.md` review mode steps 4 and 5 and the protocol's Records paragraph, so the plugin text carries the rule. Line 274 says "The plugin does not carry its own copy of the rules", and line 272-273 says that with an older pin "the current procedure runs, and the spec report says the stopping rule needs a pin at or after the companion commit". The design never says how the skill decides that the resolved page predates the companion change (for example, whether the page has the severity definitions or the new Acceptance step 2 text), nor where it gets the commit it names in the report. The binary cache holds pages at one SHA with no docs history (`ls ~/.cache/vh-adlc/docs/d8f07c9.../` shows only page files), so an ancestry check is not available. One implementer tests for text, another hard-codes a SHA, a third always runs the new steps from SKILL.md; the AC-06 old-pin run only checks the report wording.
PROPOSAL: Name the check the skill uses to choose the procedure (for example, the presence of the severity definitions in the resolved feature-documents page) and say that the needed pin it reports is the plugin's own pin from knowledge.md. Write the new SKILL.md and protocol steps as conditional on that check.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Saved nit, line 189); Design, Stopping rule (steps 1, 4 and 6, lines 198-200, 209-211, 215-217, and line 223, "Nothing new is stored"); Acceptance Criteria AC-01; Test Plan AC-01 row (Variants A, B and F)
EVIDENCE: Step 4 lists "every saved nit" and line 223 says the skill reads everything from the Review Log rows and records. The design does not say which stored nits count as saved. Passes stored before the update count toward the streak (line 221-222), but under the old procedure their nits were usually applied already; blog-visual-reading has 47 such passes. Nits from passes before a blocking reset or a revision may refer to text that later fixes rewrote. The records do not show whether a nit was applied, so one implementer lists every baseline nit in the log, another only those in the current streak, another only post-update ones. Variant A has no reset, and Variants B and F do not say whether their passes hold nits or which must be listed.
PROPOSAL: Define the saved nits as the baseline nits in passes recorded after the plugin adopts the rule and after the latest reset, or state another rule, and add an expected nit list to Variants B and F.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (lines 41-42, "unless they only touch Context or Sources"); Design, Stopping rule (step 1, lines 198-200)
EVIDENCE: Step 1 allows applying findings "confined to sections outside the normative baseline" at any time, which also covers Tasks, Open Questions and the title paragraph. The Owner summary still names only Context and Sources.
PROPOSAL: Have the Owner summary say that nits outside the normative baseline may still be applied.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Scope (In scope, first bullet, lines 158-160)
EVIDENCE: Scope says the author "honors an acceptance the owner gave in advance at the first clean pass that meets it". After R-4 the owner also decided that an acceptance given after a clean pass, with the baseline unchanged since, is honored (Open Questions, lines 361-362), and Terminology line 190, step 6 and AC-01 include it. Scope omits that case.
PROPOSAL: Add the after-pass acceptance with an unchanged baseline to the first Scope bullet.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Context, Background, Overlapping work (lines 146-149)
EVIDENCE: The plugin pin bump in shared-development-loop's Scope is at lines 150-151 at b777df0, not `:154` (`git show b777df0:docs/specs/shared-development-loop.md | grep -n "pin bump"` gives 151). That feature's covers also list `plugins/vh-adlc/skills/vh-adlc-resume/` and `plugins/vh-adlc/references/loop.md` (lines 13 and 16 at b777df0), which this feature now edits too, but Background does not name them in the overlap.
PROPOSAL: Cite `:150-151` and add the resume skill and loop.md to the overlap list.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Delivery (lines 300-302, "S7.7, S7.7.accept, S7.9 and S14.spec keep passing"); Test Plan AC-01 row (last sentence); Context, Background, Existing scenarios (lines 130-136)
EVIDENCE: S7.7's check sets `const blocking = /SEVERITY: blocking/.test(doc);` over the whole document (tests/vh-adlc/scenarios/run.ts:544). Then `const path = blocking || questions ? "the owner was left a decision" : "accepted"` (run.ts:549), and on that path it requires no acceptance row, status draft and no passing planned gate (run.ts:559). Under the current procedure a blocking R-1 ended turn 1, so the turn-2 conditional acceptance (run.ts:534) correctly did nothing. Under this Design, turn 1 (`/vh-adlc-spec review`, with no acceptance yet) keeps dispatching passes in-session until the streak reaches three or a question waits (lines 224-226). If R-1 has a factual blocking finding, the author fixes it and goes on to three clean passes. Turn 2 then accepts at the latest clean pass and the document reaches planned, which is correct under steps 4 and 6. But the stored R-1 record still matches `SEVERITY: blocking`, so the check expects no acceptance and the scenario fails. Turn 2's wording "if the review found nothing blocking" also stops naming a single review once turn 1 stores several. The AC-01 row requires S7.7 to keep passing, so the proof fails a correct implementation whenever any pass in turn 1 is blocking. This document's own blocking definition covers that case ("a proof fails a correct implementation").
PROPOSAL: Say in Delivery how S7.7 changes: its check should read only the latest spec review's records and expect acceptance when the loop ended at a clean pass, and its turn-2 prompt should name the latest pass. Drop the claim that it keeps passing unchanged.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Clean streak, line 192); Design, Stopping rule (steps 4 and 5, lines 213-218, and line 226, "the next run continues from the last marked row"); Context, Owner summary (lines 44-46, "so it never has to be worked out from history. A blocking finding sets it to zero, and a revision starts it again"); Acceptance Criteria AC-01 ("reading the previous value from the latest marked spec row ... counting from 0 after a revision"); Test Plan AC-01 row (Variants C and E)
EVIDENCE: Terminology reads the previous value from "the latest spec review row, skipping acceptance rows and `+dirty` rows; a row without a marker reads as 0". AC-01 and line 226 read it from the latest marked row instead. The two disagree when an unmarked spec row follows a marked one, for example a pass recorded under an older pin, which the Pins section says writes no marker. The stored rows also carry no record of a revision. SKILL.md:96-99 commits the move to draft on its own, and after it the latest marked spec row of a re-accepted document still says `streak 3 of 3`, followed only by an acceptance row that the count skips. A later session (resume, or a run that stopped for Open Questions during the revision) that follows the row rule records the first clean pass after the revision as 4, or ends the loop there. That contradicts "a revision starts it again". Values past three are also undefined. Step 5's extra pass after the owner picks findings follows a `streak 3 of 3` row, so the row rule gives 4. Steps 3 and 4 cover only "below three" and "the clean pass that brings the streak to three". Variant C does not state the expected marker. Variant E does not say whether the post-revision passes run in a new session, so a skill that keeps the revision only in session memory passes it.
PROPOSAL: Make the stored rows carry every input. For example, count from 0 when an acceptance row follows the latest marked spec row, use one rule for unmarked rows in Terminology, AC-01 and line 226, and state the marker and the step that applies at or above three. Have Variant E run its post-revision passes in a fresh session, and state Variant C's expected markers.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (steps 3 and 6, lines 207-212 and 219-222, and line 228, "A re-review caused only by default-branch drift counts as a pass like any other"); Design, Terminology (Owner acceptance, line 194); Test Plan AC-01 row
EVIDENCE: A re-review caused only by default-branch drift keeps the acceptance when the baseline is unchanged (conventions/feature-documents.md:220-222). `accepted` still holds (:309), and for a planned document `next` moves on to tasks or implement (:281-282). The Design counts such a pass "like any other" but does not say whether the standing acceptance row is an "owner acceptance" for steps 3 and 6. If it is, step 6 ends the loop at "the clean pass it names", which is the old pass, not the drift pass. If it is not, step 3 applies the drift pass's factual should-fix findings to the baseline of a planned document, which first needs `vh-adlc gate draft` and a revision (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:96-99), and then dispatches more passes. Two careful implementers build different loops, and the second turns a routine drift re-review into a revision. No variant covers a drift re-review of an accepted document.
PROPOSAL: State what the loop does after a drift-only re-review of a document whose acceptance still holds. For example, the standing acceptance ends the loop at the drift pass and its findings are listed rather than applied. Add a variant for it.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Saved nit, line 193); Design, Stopping rule (steps 1 and 4, lines 202-204 and 213-215); Acceptance Criteria AC-01 ("saves nits on the normative baseline from the current streak"); Test Plan AC-01 row (Variants B and E)
EVIDENCE: Terminology defines a saved nit as one "from a pass recorded since the latest `streak 0` row, inclusive". AC-01 says "from the current streak". The two differ in three cases. First, a document with no `streak 0` row (every marked pass clean, or a pre-update draft whose unmarked rows only read as 0) has no defined window under Terminology. Second, after a revision the latest `streak 0` row predates the revision and the earlier acceptance, so Terminology's window takes in nits that were already listed at that acceptance, while AC-01's current streak starts at the revision. Third, nits from clean passes before a blocking pass fall outside both windows: in Variant B, the first clean pass's nits are neither applied nor listed. That trade-off is settled without an Open Question. Variant E gives no expected nit list.
PROPOSAL: Define the window once, for example as the passes since the start of the current streak, and say whether nits dropped by a reset are lost or carried. Add expected nit lists to Variants B and E.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, Terminology (Clean streak and Saved nit, lines 192-193); Acceptance Criteria AC-01; Test Plan AC-01 row (Variant A); Context, Owner summary (line 44)
EVIDENCE: AC-01 says the author writes `streak <n> of 3` into every spec row and records 0 after a blocking finding, which gives `streak 0 of 3`. Terminology says a blocking pass "records `streak 0`", the saved-nit window starts at "the latest `streak 0` row", and Variant A expects rows from "`streak 0` to `streak 3 of 3`". Later runs read the value back from this text, so the exact form matters to whatever matches it.
PROPOSAL: Pick one form for zero, for example `streak 0 of 3`, and use it in Terminology, AC-01 and Variant A.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design, Stopping rule (lines 228-230, "the existing `Outcome` column, which the binary does not parse")
EVIDENCE: The binary reads the Outcome cell to recognize acceptance rows: "A row with `Outcome` exactly `accepted by owner` is an acceptance" (conventions/feature-documents.md:176-178; rules block `acceptance_row: { ..., outcome: accepted by owner, ... }`). The marker is harmless. In a scratch clone at 96fc16f, appending `; streak 0` to the R-5 Outcome left `vh-adlc lint` at `"result":"pass"`.
PROPOSAL: Say that the binary reads Outcome only to match an exact `accepted by owner`, so a streak marker in a spec review row does not change any result.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary (lines 66-68, "a consumer on an older pin keeps the current procedure"); Design, Pins and older consumers (lines 278-284)
EVIDENCE: Only the stopping rule is made conditional on the resolved page having the severity definitions. Line 282 says "the new `SKILL.md` and protocol steps are written as conditional on that check". The failure-mode check and one-pass completeness go into the reviewer agent unconditionally ("The reviewer's spec section gains", line 251; line 261). The Design does not say whether the author-side failure-mode step and restatement sweep in SKILL.md fall under the conditional. On an older pin, the reviewer therefore changes behavior while the summary says the current procedure is kept. AC-06's old-pin check looks only for the streak marker.
PROPOSAL: Say which changes apply on any pin and which only with the new convention, and make the Owner summary match.

### R-7

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Test Plan AC-01 row (Variant G, "the report asks no acceptance question"; Variant E, "every post-revision pass runs in a fresh session"); Design, Stopping rule (step 3, lines 211-216, and lines 233-236); Acceptance Criteria AC-01 ("when resumed below the ceiling, continues the loop instead of asking for acceptance")
EVIDENCE: Lines 233-234 say "In review mode the author dispatches each next pass itself, in the same session, while no Open Question is waiting for the owner", and step 3 says that when `next` reports `owner acceptance` below the ceiling the spec and resume operations "dispatch another pass instead of asking". Per step 2 a blocking pass does not stop the run either; only an Open Question does. Variant G resumes a draft at `streak 1 of 3` and passes "when a new spec row recording `streak 2 of 3` is stored and the report asks no acceptance question". A correct implementation does not stop at streak 2. It dispatches the next pass in the same session, and when the canned pass is clean it reaches `streak 3 of 3` and asks for acceptance under step 4, so the check fails it. Variant E requires every post-revision pass to run in a fresh session, but its passes hold only a factual baseline fix, which step 3 applies before continuing in the same session. The harness sends turns one after another and cannot end a session mid-run (tests/vh-adlc/scenarios/run.ts:137-141 at 3963e25), so the condition cannot be arranged without a stop that the row does not specify. This is the same class as R-6 F-01, and the document's own blocking definition covers it ("a proof fails a correct implementation or cannot be executed").
PROPOSAL: Give Variant G and Variant E canned passes that hold a judgement should-fix, so each run stops on an Open Question that the next session's owner turn answers, and state that in the row. Alternatively, change Variant G's pass condition to "no acceptance question is asked before a row records `streak 3 of 3`", and drop the fresh-session requirement from Variant E in favor of a stop the design defines.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Clean streak, line 196); Design, Stopping rule (step 7, lines 227-231); Acceptance Criteria AC-01 ("counting from 0 after a revision of an accepted document", lines 328-329); Context, Owner summary (line 45, "a revision starts it again"); Test Plan AC-01 row (Variants E and H)
EVIDENCE: Terminology resets the previous value to 0 only "when an acceptance row follows that row and the document's status is `draft`". Step 7 has a clean drift re-review of a `planned` or `in-progress` document record "the previous value plus one" in a new spec row and keep the acceptance, so no new acceptance row is written after it. Suppose the document is later revised: the latest spec review row is now the drift row, no acceptance row follows it, and its marker (for example `streak 4 of 3`) becomes the previous value. The first clean pass after the revision then records 5, and step 4 ends the loop after one post-revision pass. That contradicts AC-01 and the Owner summary. Drift re-reviews of accepted documents are routine here (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:55-61 at 3963e25). Variant E starts from a log whose last spec row precedes the acceptance row, and Variant H never revises afterward, so a skill that follows Terminology literally passes every listed check.
PROPOSAL: Define the reset so that it survives a drift row, for example count from 0 when the document is `draft` and any acceptance row comes after the latest spec review row recorded while the document was `draft`, or reset at the latest acceptance row when the status is `draft`. Add a Variant E case where a clean drift row sits between the acceptance row and the revision.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-01 row (Variant B); Design, Stopping rule (step 1, lines 206-208); Design, Terminology (Saved nit, line 197)
EVIDENCE: Variant B's passes are "clean, blocking, clean, clean, clean, each holding one nit on Design that later fixes leave in place", and it passes when "the findings of the first two clean passes after the blocking pass are applied, and the summary lists the last pass's findings and all five nits". If those passes hold only the stated nit, step 1 says nits on the normative baseline "become saved nits" and are not applied, so a correct skill applies nothing and the "applied" clause fails it. If the clause is read as vacuous, it checks nothing. Two test writers would build different canned records and checks.
PROPOSAL: Either give the first two clean passes after the blocking pass a factual should-fix that must be applied, or replace the clause with "no nit is applied and the baseline nit text is unchanged".

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (step 3 and lines 233-237); Acceptance Criteria AC-01 (resume clause); Test Plan AC-01 row (Variant G)
EVIDENCE: The spec skill stores and commits the records before changing anything (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:68-70 at 3963e25), then applies findings and commits again (:71). This repository's own log shows the two commits as separate ("record spec review R-6", then "apply spec review R-6", e588be7 and b40d2ca). A run interrupted between them leaves a clean pass whose factual should-fix findings were never applied, and the review stays fresh. Variant G resumes exactly that state ("a draft whose last row records `streak 1 of 3` with a fresh review"), and the design then dispatches another pass, so the unapplied findings are dropped unless the reviewer happens to find them again. The document's own failure-mode check asks about partial failure (lines 261-264), and Design leaves this path undefined.
PROPOSAL: State that a resumed or continued run first checks the latest stored pass: if it is clean, below the ceiling, holds factual should-fix or judgement should-fix findings on the baseline, and the review is still fresh, the author applies or raises them as step 3 says before it dispatches the next pass. Give Variant G's stored pass a factual should-fix and expect it to be applied.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-06 row ("two scratch clones whose `AGENTS.md` names the old and the new pin")
EVIDENCE: `owner-readable-specifications` lists `AGENTS.md` in its covers (`git show b40d2cab:docs/specs/owner-readable-specifications.md`, frontmatter line 15). In a scratch clone at b40d2cab, `vh-adlc fresh docs/specs/owner-readable-specifications.md` returned 12 findings with `feature_tree.clean: true`. After an uncommitted edit to `AGENTS.md`, it returned the same findings plus `feature-tree-dirty` and `"paths":["AGENTS.md"]`. After committing the edit, the findings matched the original exactly. A test writer who sets the pin by editing `AGENTS.md` in place in one clone gets a `findings` difference that the convention change did not cause, so the comparison fails a correct companion change. The row does not say whether the pin edit is committed.
PROPOSAL: Say that each clone commits its `AGENTS.md` pin before running the commands, or that the clones are checked out at commits that already hold each pin.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design, Terminology (Saved nit, line 197); Acceptance Criteria AC-01; Test Plan AC-01 row (Variants A, B and E)
EVIDENCE: A saved nit counts only while "its text still exists in the document". A finding record has no field for target text. A nit's EVIDENCE may quote a line, cite a line number, or ask for something to be added, so what "its text" means differs between implementers. Variant B avoids the question with nits that "later fixes leave in place", so no variant shows a nit being dropped.
PROPOSAL: Say what the author compares, for example the quoted text in the nit's EVIDENCE, and that a nit with no quote is always listed. Add a variant where a later fix removes a nit's quoted text and that nit is not listed.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context, Background, Overlapping work (lines 152-156)
EVIDENCE: The overlap cites `docs/specs/shared-development-loop.md:7-23` at `b777df0`, but that document's covers continue to line 29 and include `tests/vh-adlc/` (`git show b777df0:docs/specs/shared-development-loop.md`, line 29). That path holds `tests/vh-adlc/scenarios/run.ts` and the new test files this feature edits. The paragraph also describes the feature as on `origin/main` at `b777df0`, but `origin/main` is now `9378490`, with that document at R-8.
PROPOSAL: Cite `:7-29` and add `tests/vh-adlc/` to the overlap list, or say that the citation is as of `b777df0`.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-01 row (Variant E)
EVIDENCE: "record streaks 1, 2 and 3 the loop ends at 3" is missing a conjunction between the two clauses.
PROPOSAL: Write "record streaks 1, 2 and 3, and the loop ends at 3".

### R-8

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (paragraph after step 7, lines 234-239); Acceptance Criteria AC-01 (resume clause); Test Plan AC-01 row (Variant G)
EVIDENCE: Lines 235-238 say "Before it dispatches, a continued or resumed run checks the latest stored pass: if that pass is clean, below the ceiling and still fresh, and holds should-fix findings on the baseline, the author first applies or raises them as step 3 says". Being fresh is the only sign that the findings were not handled. Suppose the owner answers a judgement should-fix by keeping the current design. The question is folded and removed ("An answered question is folded into the document and removed", conventions/feature-documents.md:159), and Scope, Design, Acceptance Criteria and Test Plan stay unchanged. The review then stays fresh (feature-documents.md:300-301), so the next continued run finds a clean, fresh pass that holds a should-fix on the baseline and raises the same question again. The same happens when the author checks a factual should-fix and finds the reviewer was wrong, so applying it changes nothing. A literal implementation loops, and Variant G only covers a finding that was never applied.
PROPOSAL: Limit the check to findings that have not been applied or answered, for example by recording the answered finding IDs where the folded answer is written and skipping them. Add a variant where the owner keeps the status quo on a judgement should-fix and the next run dispatches a pass without asking again.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-01 row (Variant E, "a second session continues after the owner's answer")
EVIDENCE: The harness runs every prompt of one `session()` call as a resumed conversation: `resume: turns.at(-1)?.sessionId || undefined` (tests/vh-adlc/scenarios/run.ts:138). A second, independent conversation is a separate `session()` call, as S14.spec does with `turns.push(...session(g, [broken], [...]))` (run.ts:631). The row does not say which one it means. If the owner's answer is written as a second prompt in the same `session()` call, the conversation still remembers the revision. A skill that resets the count from session memory instead of from the stored rows, as Terminology requires (line 196), then passes Variant E. R-6 F-02 asked for this variant to prove that the count comes from the stored rows.
PROPOSAL: State that the continuation runs in a separate `session()` call with no `resume`, so only the stored document carries the revision and the drift row.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Delivery (lines 317-322, S7.7 "Its first turn now continues in-session until the loop ends or a question waits"); Test Plan AC-01 row (Variant B and the S7.7 clause)
EVIDENCE: Every scenario turn runs with `maxTurns: 80` (run.ts:138), which host.ts passes as `--max-turns` (tests/vh-adlc/scenarios/host.ts:82). A turn that ends with an error stops the session (`if (t.isError) break;`, run.ts:141). Under this Design one turn can now hold several full passes. Each pass means a dispatch, storing records, `review check`, a commit, applying findings, lint and a second commit. Variant B runs five passes in one turn because none of them raises an Open Question. S7.7 turn 1 uses the real reviewer and continues to streak 3 after any blocking pass. Neither the Delivery section nor the row states a turn budget, so a correct skill can be cut off partway, and the later checks then run against a half-finished loop.
PROPOSAL: Say what turn budget these cases need and raise `maxTurns` for them, or arrange the canned passes so that the run stops between owner turns. Have the check fail, not pass vacuously, when a turn ends with `isError`.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Scope (lines 165-168 and 175-176); Design, Stopping rule (line 203); Design, Delivery (lines 306-309); Context, Owner summary (line 66); Acceptance Criteria; Test Plan
EVIDENCE: Line 203 says "In the convention's Acceptance section, step 2 gains the rule", and the Owner summary says "The definitions, the stopping rule and the free-text rule go into `vhco-pro/docs`". AC-02 and AC-05 check the published page only for the severity definitions and the free-text example requirement, and AC-06 checks only pins, versions and lint, fresh and gate parity. No criterion or Test Plan row checks that the published Acceptance section states the stopping rule or the `streak <n> of 3` marker. None checks that `docs/get-started/first-feature.md` and `docs/user-guides/workflows.md` describe the stopping rule, saved nits and owner acceptance, as Scope and Delivery require. A companion change that adds only the definitions passes every criterion. The plugin then runs the new procedure, because it keys on the definitions alone (line 295-297), while the convention's Acceptance steps still describe the old one.
PROPOSAL: Extend the AC-02 or AC-06 check in `tests/vh-adlc/review-convergence.test.ts` so it also asserts that the published Acceptance section states the stopping rule and the marker format. Add a criterion with a Test Plan row for the two user guides.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (lines 43-44, "The author writes the count into each Review Log row"); Design, Terminology (Clean streak, line 196, "every spec review row it records"); Acceptance Criteria AC-01 (lines 330-331); Design, Stopping rule (step 7, lines 229-231)
EVIDENCE: AC-01 says the author "writes `streak <n> of 3` into the Outcome of every spec review row it records", and Terminology says the same. Step 7 says "A drift pass records `drift` in place of a streak", and Variant H expects the drift row to record `drift`. The Owner summary says "each Review Log row", which also covers acceptance rows, and those carry no marker.
PROPOSAL: Say "every spec review row other than a drift row" in Terminology and AC-01, and "each spec review row" in the Owner summary.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-01 row (Variants A and E)
EVIDENCE: Variant A expects the summary to list "pass 3's IDs and the nits from all four passes". The row states content only for the first two clean passes, so the blocking pass and clean pass 3 have no stated nit or findings. Variant E begins "a `planned` document whose last row records `streak 3 of 3`, followed by an acceptance row and then a clean row marked `drift`". A row that two other rows follow is not the last row.
PROPOSAL: State the canned records of the blocking pass and clean pass 3 in Variant A. In Variant E write "whose latest non-drift spec review row records `streak 3 of 3`".

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Frontmatter `covers` (lines 18-20); Design, Delivery (lines 320-323)
EVIDENCE: The AC-01 variants "run against a copy of the plugin whose reviewer agent returns canned records keyed by pass number". The Design does not say where the scripted reviewer definition and its canned records are stored. Under `tests/`, covers lists only `tests/vh-adlc/review-convergence.test.ts`, `tests/vh-adlc/scenarios/run.ts` and `tests/vh-adlc/evidence/review-convergence/`. If they live in a new file elsewhere, `feature_tree_clean` (conventions/feature-documents.md:316) does not see changes to it.
PROPOSAL: Name the path of the scripted reviewer and its canned records, and add it to covers if none of the listed paths holds it.

### R-9

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-06 row (line 385, "In the old-pin clone, run the updated spec skill's review mode"); Tasks T9 (line 400); frontmatter covers
EVIDENCE: T9 puts the old-pin case in `tests/vh-adlc/scenarios/run.ts`. The AC-06 row puts it in one of the two scratch clones of this repository, which use the real binary and cache. Those are two different harnesses. Scenarios call the binary through `tests/vh-adlc/shim/vh-adlc`, which always adds `--docs-source "$docs"` (shim line 16). Here `$docs` is the fixture docs repository that `tests/vh-adlc/fixtures/build.ts:112-117` builds with a depth-1 fetch of the plugin pin read from `knowledge.md`. Revisions B, C and D all derive from that commit. After T3, then, the fixture holds only the new pin. Running `vh-adlc knowledge --repo <clone> --plugin-pin d8f07c9dd69038375a535af8ad586086688f85ab --docs-source <repo without that commit>` returned `"result":"unreachable"` with "the docs source has no commit d8f07c9dd69038375a535af8ad586086688f85ab"; `lint` returned the same. A run.ts scenario "in a clone on the previous pin" therefore gets `unreachable`, not the current procedure, unless the previous docs commit is first added to the fixture. Neither the row nor T9 says so, and `tests/vh-adlc/fixtures/build.ts` is in neither covers nor any task.
PROPOSAL: Say which harness runs the old-pin case. If it is run.ts, state that the scenario adds the previous pin's docs commit to the fixture docs repository, and if that change goes in `tests/vh-adlc/fixtures/build.ts`, add the file to covers and to T9.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-01 row (Variants D2, D3 and F); Design, Stopping rule (paragraph after step 7, line 234)
EVIDENCE: Line 234 says "the author dispatches each next pass itself, in the same session, while no Open Question is waiting for the owner". Variant D2 has the owner accept "after a clean pass holding only nits" and passes when "no further pass runs". A nits-only clean pass below the ceiling raises no question, so a correct author keeps dispatching passes in the same turn. If the scripted reviewer runs that pass in turn 1, the owner's turn arrives only after more passes, and the check fails a correct skill. The check holds only if the fixture stores the pass before the owner's turn, as S7.7.accept does with `accept(f, "NO FINDINGS", false)` (run.ts:577), and the row does not say so. Variants D3 and F check one row ("the next clean pass records `streak 1 of 3`"), but a correct run keeps dispatching after it. The row gives no canned records for later passes and no point where the run stops. Variant F also gives no document status: if the document is `planned` after its acceptance row, step 7 records `drift`, not `streak 1 of 3`.
PROPOSAL: State that D2's clean pass is stored by the fixture before the owner's turn. For D3 and F, give the canned records of every later pass up to the stop, or a judgement should-fix that stops the run, and give F's status as `draft`.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-01 (lines 340-341, "ends the loop at a drift re-review of an accepted document without applying its findings"); Design, Stopping rule (step 7, lines 230-232); Design, Terminology (Clean streak, line 196, "rows marked `drift`"); Test Plan AC-01 row (Variant H)
EVIDENCE: Step 7 says "A blocking drift pass records `drift, blocking` and is handled as today, through a revision, which then counts from 0". AC-01 has no clean qualifier on its drift clause. Read literally, it requires the loop to end without applying findings even after a blocking drift pass, which contradicts step 7. Variant H covers only a drift pass with a factual should-fix, and no variant has a blocking drift pass. A skill that writes `drift` on a blocking drift pass, keeps the acceptance and only lists the findings passes every listed check. Terminology skips "rows marked `drift`" without saying whether `drift, blocking` counts as marked.
PROPOSAL: Limit AC-01's drift clause to a clean drift re-review, add the `drift, blocking` branch to AC-01, and add a variant. In it a blocking drift pass records `drift, blocking`, the document goes through `vh-adlc gate draft`, and the first clean pass after the revision records `streak 1 of 3`. Say in Terminology that `drift, blocking` rows are skipped too.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Owner acceptance, line 198); Design, Stopping rule (step 3, lines 215-216, and paragraph after step 7, lines 234-243); Acceptance Criteria AC-01 (resume clause); Test Plan AC-01 row (Variant G)
EVIDENCE: Owner acceptance includes one given "in advance for the next pass", but the design does not say whether an advance acceptance given in one session still holds in a later session that runs that pass. Recorded advance acceptances are common practice: this document's Open Questions say the owner "accepted in advance if R-5 has no blocking finding" (lines 416-417), and `docs/specs/shared-development-loop.md` at `d367673` has status_description "the owner accepts once a confirming review has no blocking findings". Under the design, an interrupted run continues through the resume skill (Variant G path). One implementer honors the recorded acceptance and writes the acceptance row at the next clean pass. Another ignores it, because the convention has the owner accept in session (conventions/feature-documents.md:216), and continues to the ceiling. Step 3's "no owner acceptance exists" test means different things under each reading, and no variant covers it.
PROPOSAL: State whether an advance acceptance recorded in the document carries into a later session, and use the same wording in Terminology, step 3 and AC-01. Add a variant where a resumed run meets a recorded advance acceptance and the chosen behavior is checked.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary (lines 31-79)
EVIDENCE: The document was accepted at R-8 (Review Log line 440), then moved back to draft when the owner picked R-8 F-01 to F-07 (Open Questions lines 424-426). The convention asks the summary to "Explain material changes since the last accepted scope" (conventions/feature-documents.md:87-88). The summary does not mention the new AC-08 (the convention's Acceptance text and the two user guides). It also leaves out the rule that the author names answered or rejected findings in the decision record and that the resumed-pass check skips them (lines 239-240), Variant J, the separate-session Variant E, and the 250-turn budget. It does not mention the two user guides at all, although Scope and AC-08 now require them.
PROPOSAL: Add a short paragraph to the Owner summary that lists what changed since the R-8 acceptance, and name the user guides among what the feature changes.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design, Terminology (Saved nit, line 197); Design, Stopping rule (step 5, lines 220-222, and lines 239-240); Test Plan AC-01 row (Variant C)
EVIDENCE: A saved nit is listed "unless its `EVIDENCE` quotes text that no longer exists in the document; a nit that quotes nothing is always listed". Only folded answers and rejected factual findings are named in the decision record (lines 239-240), not findings the owner picks in step 5. A nit with no quote that the owner picks and the author applies is therefore listed again at the next acceptance question. Variant C does not check that.
PROPOSAL: Have the author name step 5 picks in the decision record too, and leave named findings out of the saved-nit list.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Design, Terminology (lines 191-199); Design, Stopping rule (step 7, lines 227-232)
EVIDENCE: The convention requires that "User-facing terms the feature introduces or changes appear in a glossary row" (conventions/feature-documents.md:156-158). The `drift` and `drift, blocking` Outcome markers and the "drift row" that Terminology, Scope and AC-01 refer to are defined only in step 7. Step 7 also treats every new pass on a `planned` or `in-progress` document with a standing acceptance as a drift pass, even when the owner asks for it without any default-branch change.
PROPOSAL: Add a Terminology row for a drift pass and its two markers, and say whether an owner-requested re-review of an accepted document with no drift is also recorded as `drift`.

### R-10

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (step 5, lines 232-234; step 6, lines 235-238); Design, Terminology (Clean streak, line 205); Acceptance Criteria AC-01; Test Plan AC-01 row
EVIDENCE: Step 5 covers picks from the list shown at the ceiling: the author applies them, runs one more pass and, "When that pass is clean, the author asks for acceptance again". Step 6 writes the acceptance row first and lists the pass's findings and the saved nits after it. So with an advance acceptance, the owner sees the list only after accepting. The design does not say what a pick from that list does. Applying a pick changes the baseline of an accepted document, which the convention treats as a revision (conventions/feature-documents.md:70-73). Terminology then sets the previous value to 0 ("an acceptance row follows that row and the document's status is `draft`"), and step 3 forbids asking until three new clean passes have run. Step 5 asks after one. This document is that case: it was accepted at R-8 under an advance acceptance, the owner then picked R-8 F-01 to F-07 (lines 441-442), and R-9 starts a new count. Two careful implementers would build different loops here. Under the Terminology reading, every pick made after an acceptance costs three passes, which is the churn the feature is meant to remove.
PROPOSAL: Say whether a pick from the list given with an acceptance follows step 5 (one more pass, streak continues, ask again when clean) or a full revision that counts from 0. Raise the choice as an Open Question if it is a trade-off, and add a variant for it.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Owner acceptance, line 209; Decision record, line 208); Design, Stopping rule (step 3, lines 226-228; step 6, lines 235-238); Acceptance Criteria AC-01; Test Plan AC-01 row (Variants D3 and D4)
EVIDENCE: Line 209 says an advance acceptance "is written into the decision record, holds in any later session, covers only the next spec pass and lapses if that pass has a blocking finding". Step 3 counts "one recorded in the decision record". Nothing requires the record to name the pass the acceptance covers, or to record that it lapsed. Suppose a later session reads "the owner accepts in advance if the next pass has no blocking finding". It cannot tell whether that pass has already run. After a blocking pass and its fixes, a resumed run could therefore apply the lapsed acceptance at the next clean pass. This document's own records happen to name the pass ("accepted in advance if R-5 has no blocking finding", lines 432-433; status_description "if R-10 has no blocking finding"), but the design does not require it. Variant D3 checks a lapse only within one session, and D4 checks only a live acceptance. No variant has a later session meet a recorded acceptance that has lapsed.
PROPOSAL: Require the decision record to name the pass an advance acceptance covers (R-<n>), and to note the lapse when that pass is blocking. Add a variant where a separate session() call meets a recorded acceptance whose pass was blocking, and check that it writes no acceptance row.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Saved nit, line 206); Design, Stopping rule (steps 4 and 6); Context, Owner summary (lines 72-73); Test Plan AC-01 row (Variants F and I)
EVIDENCE: Line 206 drops a saved nit when "its `EVIDENCE` quotes text that no longer exists in the document; a nit that quotes nothing is always listed". EVIDENCE often quotes other files. R-9 F-07 quotes the convention ("User-facing terms the feature introduces or changes appear in a glossary row"), text that never existed in the document. Read literally, the rule drops that nit at once although nobody applied it; another reader would keep it. The upgrade case is also undefined. A draft with no acceptance row counts nits "since the first pass", including nits stored before the update, which the old procedure already applied. In this repository, docs/specs/worktree-cleanup.md is a draft with no acceptance row and 39 stored nit records (counted with grep for `^SEVERITY: nit`). Every one of them that quotes nothing would be listed in its acceptance summary. The Owner summary only says that old rows do not count toward the streak. Variant I covers only a quote of document text that a fix removed.
PROPOSAL: Say that the rule considers only quotes of the reviewed document's own text. Say whether nits in rows stored before the update (the rows without a streak marker) are saved nits. Cover both cases in Variant F or I.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-01 row (Variants B, H2 and J); Design, Stopping rule (paragraph after step 7, line 247)
EVIDENCE: Line 247 has the author dispatch passes in the same session while no Open Question waits. Variant H2 checks only that "the first clean pass after the revision records `streak 1 of 3`". It gives no canned records for later passes and no point where the run stops. It also does not say whether the blocking drift finding is factual (applied in session) or judgement (an Open Question that stops the run). R-9 F-02 raised this gap for D3 and F, and their fix, a judgement should-fix that stops the run, was not carried over to the new H2. Variant J says only "a later run continues". It does not say whether that run is a separate session() call with no resume, as Variant E now states. Inside one session the conversation still remembers the answer, so a skill whose resumed-pass check ignores the decision record would pass. J also gives no canned records for the pass it dispatches. Variant B does not say whether its blocking pass holds a factual or a judgement blocking finding. A judgement one stops the run for the owner, and the variant has no owner turn for that.
PROPOSAL: Give H2 a stop, for example a judgement should-fix on the first clean pass after the revision, and state the kind of its blocking finding. Run J's later run as a separate session() call with stated canned records and a stop. Make B's blocking finding factual.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-06 row (line 401, old-pin scenario case); Tasks T9 (line 416); Design, Delivery (lines 335-339)
EVIDENCE: The old-pin case checks that "findings are applied as today, no streak marker is written, the reviewer still reports a seeded failure-mode gap", on "a fixture spec pinned to the previous revision with a clean pass". Neither the row nor T9 says which reviewer the case uses. Delivery defines the scripted reviewer only for the AC-01 variants. With the scripted reviewer, the failure-mode gap is a canned record, so the check passes whether or not the updated agent's failure-mode check works on an old pin. With the real reviewer, nothing controls whether the pass is clean or which findings there are to apply. Neither reading checks what most clearly marks the current procedure: after a clean pass, the author asks for acceptance and does not dispatch another pass (SKILL.md:73-75).
PROPOSAL: Name the reviewer for the old-pin case: the real one for the failure-mode check, the scripted one for the procedure check, or two cases. Add a check that after the clean pass the run asks for acceptance and dispatches no second pass.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary (lines 41-42, 49-51 and 76-81); Design, Stopping rule (step 7, lines 239-245); Acceptance Criteria AC-01
EVIDENCE: Lines 50-51 say "A routine re-review of an already accepted document keeps that acceptance and only lists what it finds". Step 7 and AC-01 say a blocking drift pass records `drift, blocking` and goes through a revision that counts from 0, so the acceptance does not survive it. The paragraph on changes since the R-8 acceptance (lines 76-81) leaves out that branch, which R-9 F-03 added along with Variant H2. It also leaves out the new `tests/vh-adlc/fixtures/build.ts` change for the old-pin case. Lines 49-50 say "The author runs the passes itself and never stops to ask before the ceiling". Lines 41-42 say judgement should-fix findings come to the owner as Open Questions answered before the next pass, which stops the run (line 247). The convention asks the summary to explain material changes since the last accepted scope (conventions/feature-documents.md:86-88).
PROPOSAL: Limit the re-review sentence to a clean re-review, and say that a blocking one reopens the loop through a revision. Say the author never asks for acceptance before the ceiling. Add the blocking drift branch and the fixture change to the changes since R-8.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Design, Delivery (lines 330-332 and 339-341); Test Plan AC-01 row (final sentences)
EVIDENCE: Delivery says S7.9 keeps passing, and raises `maxTurns` to 250 only for the AC-01 cases and S7.7. In S7.9's second turn the owner accepts in advance: "If it finds nothing blocking and leaves no open questions, I accept the revision" (tests/vh-adlc/scenarios/run.ts:1079). Under step 6 that acceptance lapses at a blocking pass. The author then keeps dispatching real reviewer passes in the same turn toward the ceiling, at `maxTurns: 80` (run.ts:138). A turn cut off there ends with `isError` and the session breaks (run.ts:141). S7.9's draft branch (run.ts:1097-1098) then passes on a half-finished loop. The Test Plan's "Every multi-pass case runs with `maxTurns` 250" does not say whether S7.9 counts as one.
PROPOSAL: Name S7.9 among the cases that run with `maxTurns` 250 and fail on `isError`, or explain why its single-pass expectation holds.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-05 row; Design, Free-text checks (lines 297-300)
EVIDENCE: A row "has passed review once a clean pass whose reviewed commit already held the row's current text has no finding whose `WHERE` names that row". The AC-05 trial needs "a stored clean pass, at a commit already holding the row's current text", and a second fixture that "changes the row after the stored clean pass". A reviewer can establish either only from Git history. The row describes the fixtures as files committed under `tests/vh-adlc/evidence/review-convergence/`. It does not say that the trial builds a repository whose history holds the stored pass's commit and, for the second fixture, a later commit that changes the row.
PROPOSAL: State that each AC-05 fixture is a scratch repository whose history holds the stored pass's commit, plus a later commit that changes the row in the second fixture.

### R-11

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary (line 81, "whichever lands second rebases onto the first"); Design, Delivery (lines 364-367); Design, Commits a Review Log names are never rewritten (lines 291-297)
EVIDENCE: The Owner summary says "The plugin edits overlap with the draft `shared-development-loop` feature, so whichever lands second rebases onto the first." Delivery says "Whichever feature lands second merges the first in", and the new Preservation rule says no operation "rebases, amends, squashes or otherwise rewrites a commit that a Review Log row names, or any commit before it on that branch". Both features carry Review Logs on their branches, so the summary tells the owner to do exactly what this revision forbids. This is the restatement drift AC-03 targets, introduced in the same revision as the no-rewrite rule.
PROPOSAL: Change the summary sentence to say the feature that lands second merges the first in, matching Delivery and the Preservation rule.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary (line 80, "the draft `shared-development-loop` feature"); Context, Background, Overlapping work (lines 166-170); Design, Delivery (lines 364-366)
EVIDENCE: `git show 4bef34e:docs/specs/shared-development-loop.md` (origin/main tip) has `status: in-progress` and `branch: feat/shared-development-loop`; at HEAD 4c7e151 it is `status: planned` with "34 tasks written, implementation next". It is no longer a draft. Background lists its covers "as of `b777df0`" without `plugins/vh-adlc/references/authority.md`, yet `git show b777df0:docs/specs/shared-development-loop.md` has `plugins/vh-adlc/references/authority.md` at frontmatter line 17, and the current version's T22 edits `authority.md` (line 596). Delivery's overlap list ("the same skill steps, protocol, resume skill, `loop.md`, pin and manifests") also omits it. This revision adds an `authority.md` edit (T13), so the omitted file is now a real overlap with an in-progress feature.
PROPOSAL: Describe `shared-development-loop` as in progress on its feature branch, add `references/authority.md` to the overlap in Background and Delivery, and say which feature merges the other in for that file.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (step 5, lines 248-253; step 3, lines 239-244); Context, Owner summary (lines 47-51); Acceptance Criteria AC-01; Test Plan AC-01 row (Variant C2)
EVIDENCE: Step 5 lets the owner pick from a list given "at the ceiling or with an acceptance", says "The count continues from the last marker", and "When the new pass is clean, the author asks for acceptance again". An acceptance can come at any clean pass ("You can accept after any clean pass", Owner summary line 53; Terminology, Owner acceptance), including one recording `streak 1 of 3`. Picks from that list continue the count, so the next clean pass records `streak 2 of 3`. Step 3 then says "The author never asks the owner to accept below the ceiling" and the spec and resume operations "dispatch another pass instead of asking", while step 5 says ask. The Owner summary repeats both ("the author never asks you to accept before the ceiling"; "Picks ... after an acceptance, are applied and checked by one more pass"). Variant C2 covers only an acceptance at `streak 3 of 3`, so either reading passes every listed check.
PROPOSAL: State which rule wins when picks follow an acceptance given below the ceiling (ask after the one pass, or continue to three), use the same wording in step 3, step 5, AC-01 and the Owner summary, and add a variant with an acceptance at `streak 1 of 3` followed by a pick.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Clean streak, line 221; Decision record, line 225); Design, Stopping rule (step 7, lines 257-259); Test Plan AC-01 row (Variants H2 and E)
EVIDENCE: After an acceptance row with status `draft`, the previous value is the old marker "if the latest decision record entry is a pick revision, and 0 otherwise". The decision record names only findings "folded, rejected or applied at the owner's pick", not factual findings the author applies. Take a log where the owner picks at the ceiling (pick revision entry), the next pass records `streak 4 of 3`, and the owner accepts there. A later blocking drift pass is "handled as today, through a revision that counts from 0", but applying its factual blocking findings writes no decision record entry. The latest entry is still the old pick revision, so Terminology gives a previous value of 4 and the first clean pass records `streak 5 of 3`, while step 7 and Variant H2 expect `streak 1 of 3`. H2's and E's fixtures do not say what the decision record holds, so a skill following Terminology literally passes them.
PROPOSAL: Tie the pick check to a pick revision recorded after the latest acceptance row, or require every revision to write a decision record entry saying whether it is a pick revision. Give H2 a decision record whose latest entry before the drift pass is an earlier pick revision.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-01 (lines 394-395, "counts from 0 after a revision that is not a pick revision"); Design, Terminology (Clean streak, line 221)
EVIDENCE: The pinned convention says a change to Scope, Design, Acceptance Criteria, Test Plan or covers "is a revision" (conventions/feature-documents.md:70-71). Applying a clean pass's factual should-fix findings to the baseline is therefore a revision that is not a pick revision, and AC-01 read literally resets the count after it. Terminology says the opposite ("Applying the findings of clean passes does not change it") and limits the reset to the case where an acceptance row precedes and the status is `draft`. Variant A requires `streak 1 of 3` to `streak 3 of 3` across exactly those applied fixes, so the criterion text contradicts its own proof. This is the R-1 F-01 defect returning in the criterion an implementation review compares against.
PROPOSAL: Reword the AC-01 clause to the event Terminology uses, for example "counts from 0 after a revision of an accepted document that is not a pick revision", so the criterion and Variant A agree.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Applying a pass's findings as one revision (lines 278-287); Design, Stopping rule (step 3, lines 239-242); Acceptance Criteria AC-09; Test Plan AC-09 row
EVIDENCE: The new step "applies the pass's findings as one revision in one commit", and AC-09 requires "one revision in one commit". Step 3 and step 2 keep today's split: factual findings are applied and judgement findings go to the owner as Open Questions, "folded in before the next pass is dispatched". A pass holding both kinds cannot be applied in one commit unless the author first commits the questions alone and then applies the factual findings together with the answers, and nothing says which. The AC-09 trial's two findings have no stated KIND and the trial has no owner turn, so a correct author that turns one of them into an Open Question fails "one commit applies both".
PROPOSAL: Say how the one-revision rule treats judgement findings (for example, the one revision holds every factual finding and every folded answer, committed after the owner answers), and state in the AC-09 row that both seeded findings are factual.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Applying a pass's findings as one revision (line 282, "Where a finding can be met by removing a mechanism or by adding one, it removes"); Acceptance Criteria AC-09; Test Plan AC-09 row
EVIDENCE: The pinned convention says "Every trade-off the document settles is an open question, including one the author would answer the same way the owner would. A section that weighs options and keeps one ... raises that choice here instead of deciding it" (conventions/feature-documents.md:154-157). Choosing between removing a mechanism and adding one to meet a finding is such a trade-off, and the new rule has the author settle it alone. The AC-09 trial then passes only when "the mechanism is removed rather than extended", so an author that follows the convention and raises the choice as an Open Question fails the trial.
PROPOSAL: Make removal the author's recommendation in an Open Question when the choice changes the design, or limit the rule to cases where both fixes produce the same behavior, and adjust the AC-09 pass condition to match.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-10; Test Plan AC-10 row; Design, Commits a Review Log names are never rewritten (lines 291-297); Tasks T6 and T13
EVIDENCE: The AC-10 scenario uses "a fixture spec with a `branch` field", and review mode already handles that case with `git merge origin/<default branch>` (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:57-58 at 3963e25), so the scenario passes on today's skill and does not fail first as T6 claims. The case that produced the problem was different: this document has no `branch` field (`git show 4c7e151:docs/specs/spec-review-convergence.md | grep -c '^branch:'` prints 0) yet lives on `docs/review-convergence-spec`, where SKILL.md:58-59 only offers `git merge --ff-only` on the default branch. The reflog shows `rebase (start): checkout origin/main` at 2026-11-13 04:12:05 on that branch, and later `commit (amend)` of the R-8 revision at 04:13:41. With every box ticked, the uncovered no-branch-field side branch still has no instruction and no scenario.
PROPOSAL: Add a scenario variant for a document on a non-default branch without a `branch` field, and state in Design what review mode does there (merge the default branch in, or stop). Cite the existing delivery rule that feature PRs "never squash, so the commits its Review Log cites stay reachable" (conventions/delivery.md:79) beside the new Preservation text.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Design, Terminology (Saved nit, line 223); Test Plan AC-01 row (Variants D3, E and J)
EVIDENCE: Saved nits come from "a marked spec review row", but Terminology defines markers only as `streak <n> of 3` and calls `drift` and `drift, blocking` rows drift rows "in place of a streak", so whether a clean drift row's nits are saved nits is open. Variant E has a clean `drift` row after the acceptance and checks that the summary lists "only nits recorded after the acceptance row" without saying whether that row holds a nit. Variant D3 does not state whether its blocking finding is factual or judgement (R-10 F-04 fixed this for B and H2). AC-01's "never raises one again" covers rejected factual findings, but only Variant J (an answered judgement finding) checks it.
PROPOSAL: Say whether drift rows count as marked for saved nits and give Variant E's drift row a nit with the expected result, make D3's blocking finding factual, and add a rejected factual finding to Variant J or a new variant.

### R-12

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Terminology (Clean streak, line 225; Decision record, line 229); Acceptance Criteria AC-01 ("applies owner picks as a pick revision, continuing the count"); Test Plan AC-01 row (Variants C2, C3 and H2)
EVIDENCE: Line 225 says that after an acceptance row, with status `draft`, the previous value is the old marker "if the decision record holds a pick revision entry dated after that acceptance row, and 0 otherwise". The Review Log records only a day-granular date (conventions/feature-documents.md:168-171), and the decision record entries are "dated entries" (line 229). The two sections have no other shared ordering. Acceptances and the picks that follow them almost always fall on the same day. In this document R-8's acceptance, the R-8 picks, R-10's acceptance and the R-10 picks are all dated 2026-11-13 (lines 538-542). Variant C2 runs live, so the author writes the acceptance row and the pick revision entry with the same date. Read strictly, "dated after" fails, the previous value becomes 0, and the next pass records `streak 1 of 3` where C2 expects `streak 4 of 3`. Read as "on or after", an earlier pick revision from the same day as a later acceptance counts. Then a blocking drift revision continues from the old marker, which is the R-11 F-04 defect again. H2 passes either way only because its fixture dates the earlier pick "before" the acceptance. No date comparison satisfies both C2 and the case H2 is meant to guard. AC-01, which reads the previous value "as Terminology states", cannot be met for same-day events.
PROPOSAL: Order the pick against the acceptance by something the document records unambiguously. For example, have the pick revision entry name the acceptance it follows ("pick revision after the acceptance at R-<n>"), or mark the pick in the next spec review row. Give C2 and H2 fixtures where the acceptance row and the pick entries share a date.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (step 3, lines 247-249; step 5, lines 253-258; paragraph after step 7, lines 266-272); Acceptance Criteria AC-01 (final clause, lines 420-421, against lines 413-415); Context, Owner summary (lines 48-49, 52-53); Test Plan AC-01 row (Variants C3 and G)
EVIDENCE: Step 5 says that after a pick revision, "When the new pass is clean, the author asks for acceptance again ... whatever the streak". After an early acceptance (Variant C3) that pass records `streak 2 of 3`. Step 3 says "When `vh-adlc next` reports `owner acceptance` below the ceiling and no owner acceptance covers the latest pass, the spec and resume operations dispatch another pass instead of asking". The resumed-run check (lines 267-270) applies, as step 3 says, any should-fix finding on the baseline that the decision record does not name. A post-pick pass's findings are not named there. So a run interrupted after that pass and continued, or resumed through the resume skill, applies the pass's findings and dispatches another pass. The live run would list them and ask. AC-01 contains both instructions: "runs one more pass before asking again, whatever the streak" and "when resumed below the ceiling, handles the latest pass's unhandled findings and continues instead of asking for acceptance". No variant interrupts a post-pick pass, so either behavior passes every listed check.
PROPOSAL: State that a pass following a pick revision is handled by step 5 in a continued or resumed run too, and say how the resumed run recognizes it (for example, a pick revision entry after the latest marked row). Add that exception to step 3, the resumed-run paragraph and AC-01's final clause, and add a variant that resumes after a clean post-pick pass below the ceiling.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary (lines 53-55, "a revision you ask for beyond picks starts it again"); Design, Terminology (Clean streak, line 225); Design, Stopping rule (steps 4 and 5); Acceptance Criteria AC-01 (lines 408-409); Test Plan AC-01 row (Variant E)
EVIDENCE: The summary tells the owner that any revision they ask for beyond picks restarts the count. Terminology resets the previous value only when "an acceptance row follows that row and the document's status is `draft`", and AC-01 limits the reset to "a revision of an accepted document that is not a pick revision". Take an unaccepted draft at `streak 3 of 3` where the owner asks for a scope change instead of picking. No acceptance row exists, so the previous value stays 3, the next clean pass records `streak 4 of 3`, and step 4 lists its findings and asks for acceptance after that single pass. A scope change of any size gets one pass. The same holds mid-loop, where an owner-requested change continues the count. Design does not say how such a revision differs from folded answers, which deliberately do not reset. The Behaviors list (line 218) names only "a revision of an accepted document", and Variant E covers only that case.
PROPOSAL: Decide whether an owner-requested revision of an unaccepted draft, other than picks and folded answers, restarts the count. If it does, have the author record it in the decision record and read that entry in Terminology, AC-01 and a new variant. If it does not, correct the Owner summary.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (step 3, lines 244-249; step 6, lines 259-261); Design, Applying a pass's findings as one revision (lines 286-288); Design, Terminology (Owner acceptance, line 230); Design, Delivery (S7.7 change, lines 385-387)
EVIDENCE: The one-revision rule raises a pass's judgement findings as Open Questions "first, without changing the baseline". So at every stop for an Open Question, the normative baseline is unchanged since that clean pass, and an owner acceptance named on it qualifies under Terminology ("after a clean pass while the normative baseline is unchanged since that pass"). Step 6 then says the author "applies nothing to the normative baseline, lists that pass's findings" and writes the acceptance row. It does not say what becomes of the Open Questions already raised from that pass. `gate planned` requires `no_open_questions` (conventions/feature-documents.md:270, :305), and only the owner answers questions (:139). One implementer withdraws the questions into the listed findings and accepts. Another keeps them and asks the owner to answer first, and any answer that changes the baseline then makes the acceptance impossible. S7.7 runs the real reviewer, which "may return judgement findings even on a sound draft" (tests/vh-adlc/scenarios/run.ts:547). Today its check expects no acceptance whenever questions exist (run.ts:549). The new check "expects acceptance when the loop ended at a clean pass" and does not say whether a stop on an Open Question counts as the loop ending.
PROPOSAL: State what an owner acceptance does to Open Questions raised from the pass it names: withdraw them into the listed findings, or require answers that change nothing on the baseline. Make S7.7's new check say which path it expects when turn 1 stopped on an Open Question.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design, Pins and older consumers (lines 362-364); Test Plan AC-06 row (procedure case); Context, Owner summary (lines 37-38); Context, Background (lines 116-118)
EVIDENCE: Pins says that without the new convention "the current procedure runs ...: after a clean pass the author asks for acceptance and dispatches no further pass". The AC-06 procedure case gives the scripted pass "a factual should-fix" and passes when "that finding is applied as today, ... the run asks for acceptance and dispatches no second pass". The Owner summary describes the same procedure differently: it "applies every factual finding and then asks for a new pass", and Background says it "always applies factual findings and asks again". If the canned finding touches Scope, Design, a criterion or the Test Plan, applying it changes the normative baseline (conventions/feature-documents.md:70-73). The review is then stale (:300-301), and `next` names `spec review`. An acceptance row at the reviewed commit fails `accepted` (:309). The case would then demand an acceptance question that cannot lead to a passing gate, and would fail an author that follows the binary and dispatches a second pass. The row does not say where the finding sits.
PROPOSAL: Put the procedure case's factual should-fix outside the normative baseline (for example in Context), or expect a second pass when it is on the baseline. Make the Pins description of today's procedure agree with the Owner summary and Background.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-06 row ("two scratch clones, each checked out at a commit that holds its `AGENTS.md` pin"); Acceptance Criteria AC-06; Tasks T3
EVIDENCE: `owner-readable-specifications` covers AGENTS.md, plugins/vh-adlc/knowledge.md, both manifests, the spec skill, the reviewer agent and docs/get-started/first-feature.md. `vh-adlc fresh docs/specs/owner-readable-specifications.md --repo <repo> --plugin-pin d8f07c9...` at d62c9f0 returns one finding per covered path. Implementation review R-4 has `covered-changed` for AGENTS.md, knowledge.md and both manifests, but none for SKILL.md, the reviewer agent or first-feature.md. This feature changes all three (T4, T5, T10). Picture a new-pin clone at the feature's final commit, which is where an implementation reviewer would naturally re-verify AC-06, compared with an old-pin clone at an earlier commit. The new-pin clone gains `covered-changed` findings for those three paths, so `findings` differ for a reason unrelated to the pin, and a correct implementation fails AC-06. The comparison isolates the pin only if the two commits differ in nothing a named spec covers except the pin files, and the row does not require that.
PROPOSAL: Require the two clones to differ only in the pin. For example, use the T3 commit and its parent with T3 touching only pin files, or the final commit and a scratch commit on it that restores the old pin in AGENTS.md. State that pair in the row and in T3.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Tasks T13, T6
EVIDENCE: T13 (third in order) has the done condition "the check and the AC-10 side-branch case pass". The two AC-10 scenario cases are written only in T6, which comes later, so T13's done condition cannot be observed when T13 is committed. T6 then claims the AC-10 side-branch case fails "because today's skill ... only fast-forwards a side branch". By then T13 has already changed review mode step 1 to merge, so that case cannot fail first. T13 also puts the failing check and the change in one task, while the convention orders "failing test first" with one commit per task (conventions/feature-documents.md:129-135).
PROPOSAL: Move the AC-10 scenario cases into a task ordered before T13, with T13's done condition referring to them, or drop the scenario from T13's done condition and the side-branch failure claim from T6. Split T13's failing check into its own preceding task.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (lines 86-89, changes since the acceptance at R-10)
EVIDENCE: The paragraph lists only the changes R-10 drove. It leaves out the material changes made after R-11 within the same revision since that acceptance: the author now asks for acceptance after picks below the ceiling, judgement findings are answered before the one revision commit, removal is preferred only when both options behave the same (otherwise it is an Open Question), and a document without a `branch` field on a side branch merges the default branch in. Some of these appear elsewhere in the summary, but not as changes since the accepted scope, which the convention asks the summary to explain (conventions/feature-documents.md:86-88).
PROPOSAL: Add the R-11-driven changes to the changes-since-acceptance paragraph.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Design, Delivery (lines 384-387 and 392-393); Test Plan AC-01 row (final sentence)
EVIDENCE: `session()` takes a fixed array of prompts and hardcodes `maxTurns: 80` with no option (tests/vh-adlc/scenarios/run.ts:133-141). Delivery says S7.7's "turn-2 prompt names the latest pass", but which pass that is becomes known only after turn 1 ends. It also says the multi-pass cases run with `maxTurns` 250. Both need `session()` to change: computed prompts and a turn limit option. Delivery and T6 do not say so.
PROPOSAL: Say in Delivery or T6 that `session()` gains a `maxTurns` option and accepts a prompt computed from the document after the previous turn.

### R-13

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Stopping rule (step 5, lines 259-266; paragraph after step 7, lines 275-280); Acceptance Criteria AC-01 (lines 430-431, 437-438); Context, Owner summary (lines 51-56)
EVIDENCE: Step 5 says that after an owner change the author "makes the change ... and dispatches one pass", and that "a continued or resumed run that finds such a row as the latest one does the same" (asks). The paragraph after step 7 says "Before it dispatches, a continued or resumed run checks the latest stored pass: if its row carries `, after owner change`, the author asks as step 5 says". Only the other branch of that check requires the pass to be "still fresh". The suffix branch has no freshness or recency condition. Consider R-5 clean with `streak 4 of 3, after owner change`. The author asks. In the next turn, which is a continued run, the owner picks a finding or asks for another revision. The author applies it, and the review becomes stale (`baseline-changed`; `vh-adlc next` names `spec review`, as observed on this document at a581e9c). Before dispatching, the check finds R-5, still the latest stored pass, carrying the suffix, so the author asks for acceptance again and never dispatches the pass step 5 promises. A run interrupted after applying the change and then resumed does the same, because step 5 tells it to ask. The same thing happens when the owner accepts at a suffix row and later asks for a revision. An acceptance row is not a pass, so the suffix row stays the latest stored pass. Either way an acceptance at R-5 then fails `accepted` (conventions/feature-documents.md:309), because the baseline changed after it. So for any second owner change, AC-01's "after an owner change, runs one pass" and the suffix rule it also requires cannot both hold. Variants C, C2, C3 and C5 each have only one owner change, so a literal implementation passes all of them.
PROPOSAL: Make the suffix branch apply only while that pass is still fresh, both in the paragraph after step 7 and in step 5's continued-or-resumed sentence. A stale suffix row then falls through to dispatching one pass. Add a variant with two owner changes in a row, and one that resumes after a second owner change was applied but before its pass was dispatched.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Owner change, line 232); Design, Stopping rule (steps 2, 3 and 5, lines 247-266); Context, Owner summary (lines 51-55); Test Plan AC-01 row (Variants A, E and J)
EVIDENCE: Owner change is defined as "picks from a list the author gave, or any other revision the owner asks for", and the first clean pass after one records the suffix and asks for acceptance "whatever the count". An owner's answer to an Open Question is a change to the document that the owner directs. When the answer picks an option other than the current design, it is arguably a revision the owner asks for. The Test Plan treats folded answers as not an owner change. Variant A requires "no acceptance question comes before streak 3" although judgement findings are "asked and folded" after clean passes 1 and 2. Variant E requires post-revision clean passes "1, 2 and 3 without the suffix" after the owner answers a judgement should-fix. Neither Terminology nor the steps say that folded answers, or answers to a blocking pass's judgement findings, are excluded. R-12 F-03 asked how such a revision differs from folded answers, and the revision does not say. An implementer reading Terminology literally adds the suffix after every answered question and fails Variants A and E. Another reads it the way the Test Plan does.
PROPOSAL: State in Terminology that folding the owner's answers to Open Questions raised from a pass is not an owner change, and say whether an answer that also asks for a further change is one. Use the same wording in step 5, AC-01 and the Owner summary.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Terminology (Owner change, line 232; Clean streak, line 231); Design, Stopping rule (step 5, line 266); Context, Owner summary (lines 54-55); Test Plan AC-01 row (Variant C4)
EVIDENCE: "When the owner asks for the full loop, the author leaves the suffix off." Without the suffix the count continues from the previous value, and only a blocking pass or an acceptance resets it (Terminology, line 231; Owner summary "A blocking finding sets the count to zero, and so does an acceptance"). In an unaccepted draft at `streak 3 of 3`, as in Variant C, an owner who asks for a scope change and the full loop gets a next clean pass at `streak 4 of 3`. Step 4 then lists its findings and asks after that single pass, which is what happens without the request. At `streak 2 of 3` the request gives one more pass, not three. Variant C4 covers the request only after an acceptance, where the count was already reset to 0. The owner is told "ask for the full loop instead", which reads as three clean passes, but outside the post-acceptance case the request changes nothing except the suffix. Under conventions/feature-documents.md:154-157 this is a trade-off the document settles without raising it.
PROPOSAL: Decide whether a full-loop request resets the count to 0. If it does, record the request in the decision record so a resumed run can read it, and update Terminology. If it does not, say in the Owner summary that it only matters after an acceptance. Add a C4-style variant on an unaccepted draft at the ceiling.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stopping rule (steps 5 and 6, lines 259-270); Design, Terminology (Owner acceptance, line 236); Design, Delivery (S7.9, lines 401-402); Test Plan AC-01 row (Variants C to D6)
EVIDENCE: Step 5 says the clean first pass after an owner change records the suffix and the author "asks the owner again, whatever the count". Step 6 says that with an owner acceptance "the clean pass it names ends the loop whatever the streak". The design does not say which wins when the owner directs a change and accepts in advance for the pass that follows. S7.9 is that case: turn 1 asks for a revision, and turn 2 says "If it finds nothing blocking and leaves no open questions, I accept the revision" (tests/vh-adlc/scenarios/run.ts:1079 at 3963e25). That acceptance also names no `R-<n>`, although Terminology recognizes an advance acceptance only "for a named pass `R-<n>`". Delivery keeps S7.9's check accepting "either a draft still waiting or a re-acceptance" (run.ts:1097-1098). So an author that asks again and one that writes the acceptance row both pass, and no D variant combines an advance acceptance with an owner change.
PROPOSAL: State that an advance acceptance covering the first pass after an owner change takes precedence over step 5's question, and say how the author records an unnamed conditional acceptance like S7.9's (as an advance acceptance for the next pass `R-<n>`, or not at all). Make S7.9's check expect the chosen path, or add a D variant for it.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-08 (lines 462-464); Test Plan AC-08 row; Tasks T2 (line 498), T12 (line 494); Design, Stopping rule (lines 241-242, 285)
EVIDENCE: Design says "In the convention's Acceptance section, step 2 gains the rule". That rule is steps 1 to 7, which define the `, after owner change` suffix (step 5) and the `drift` and `drift, blocking` markers (step 7), and line 285 calls the count, the suffix and the drift markers "the only new text". Pins says "The plugin does not carry its own copy of the convention rules" (line 376). AC-08, its Test Plan row, T12's failing check and T2's change list name only "the stopping rule and the `streak <n> of 3` marker". A published convention that omits the suffix and the drift markers passes AC-08 and T12, while the plugin writes markers the shared convention never defines.
PROPOSAL: Add the `, after owner change` suffix and the `drift` and `drift, blocking` markers to AC-08, the AC-08 Test Plan row, T12's check and T2's change list, or state in Design that they live only in the plugin and why.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-03 row (author trial); Test Plan AC-09 row (author trial); Tasks T5
EVIDENCE: The AC-03 author trial applies "a finding that asks for a value none of the four copies hold", and the AC-09 author trial uses "a stored pass with two factual findings". Neither row states the findings' severity or the stored pass's state in the loop. Under the new stopping rule, a nit on the normative baseline is saved rather than applied (step 1), and a clean pass at or above the ceiling has nothing applied to the baseline (step 4). If either fixture's finding is a nit, or its stored pass records `streak 3 of 3`, a correct author applies nothing, and the trial fails it on "one commit leaves all four locations stating that value" or "one commit applies both". The design rates such a proof blocking ("a proof fails a correct implementation").
PROPOSAL: State in both rows that the seeded findings are should-fix (or blocking) and that the stored pass is blocking or below the ceiling with no owner acceptance. Under the old pin, say the fixture is pinned to the new revision.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Tasks T6 (line 502), T7 (line 503), T15 (line 496), T3 (line 499); Test Plan AC-01 row (Variant C2)
EVIDENCE: T6 and T7 still end "(AC-01, AC-10)", although the AC-10 scenario cases now sit in T15 and the rule change sits in T13, and neither T6's nor T7's done condition names an AC-10 case. T15 says the side-branch case fails "because today's review mode only fast-forwards a side branch". SKILL.md:58 at 3963e25 runs `git merge --ff-only origin/<default branch>` on the default branch and gives no instruction for a side branch. T3's done condition compares "the final commit" with a scratch commit, but no final commit exists when T3 is committed. Variant C2's "same day" and "all on one date" are left over from the date-ordering rule this revision removed.
PROPOSAL: Drop AC-10 from T6 and T7, say in T15 that today's step 1 has no side-branch case, have T3 compare its own commit with a scratch commit restoring the old pin, and remove the date wording from C2.

### R-14

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Acceptance Criteria AC-10 (lines 340-342); Test Plan AC-10 row (line 359); Design, Commits a Review Log names are never rewritten (lines 214-227); Tasks T13, T15
EVIDENCE: The Design adds the side-branch merge to review mode step 1 ("Review mode step 1 gains the case ...", lines 222-224). Step 1 merges only "When `vh-adlc fresh` shows the spec review stale from drift alone (covered changes on the default branch, an unchanged baseline)" (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:55-57 at 903314a). The AC-10 row starts each case "after a stored blocking pass", then moves the default branch "so the review is stale from drift, and the run continues to a second pass". Before that second pass the author applies the blocking finding as one revision (lines 199-212). That changes the normative baseline whenever the finding sits in Scope, Design, a criterion or the Test Plan (conventions/feature-documents.md:70-71), so `fresh` reports `baseline-changed` as well as drift, and step 1's "drift alone" condition is false. An author that follows the Design as written commits the revision and dispatches the second pass without merging, and both cases then fail "the working branch holds a merge of the default branch". AC-10 itself asks for more than the Design gives: the author brings default-branch work in by merge whenever the default branch moves "during a review loop". The row does not say where the fixture's blocking finding sits, which is the only thing that would keep drift alone.
PROPOSAL: Say in Design when default-branch work comes in during a loop: either on any covered drift, including when the baseline also changed, with step 1's condition widened to match, or only on drift alone, with AC-10 narrowed to that. Make the AC-10 fixture agree, for example by placing the stored blocking finding outside the normative baseline if the narrow rule is kept.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Commits a Review Log names are never rewritten (lines 222-224); Acceptance Criteria AC-10; Test Plan AC-10 row (side-branch case); Tasks T13
EVIDENCE: The design gives review mode a merge for "a document without a `branch` field that sits on a branch other than the default one". The same skill tells the author to avoid that state. Start step 3 says that without a `branch` field the author works "on the default branch in a worktree that holds it" (SKILL.md:36-38), and Committing and pushing says that while the document has no `branch` field it is committed "on the default branch" and pushed there (SKILL.md:106-109). T13 changes only Preservation and step 1, so the updated skill would both tell the author to move to the default branch and tell it how to merge on a side branch. In the side-branch scenario, an author that follows Start step 3 may switch to the default branch, where the fixture document does not exist, and never reach the merge the case checks.
PROPOSAL: State whether a document without a `branch` field may be worked on a side branch. If it may, amend Start step 3 and Committing and pushing in T13 to allow it and name the branch to commit on. If it may not, replace the side-branch merge with what the author does when it finds such a document.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Commits a Review Log names are never rewritten (lines 216-226); Context, Owner summary (lines 59-60); Test Plan AC-10 row (authority.md check); Tasks T13, T14
EVIDENCE: The Design says Preservation "says nothing about rewriting reviewed commits" (authority.md:72-78). The same file's authority table already covers the action: "Destructive Git or data operations, history rewrites, credential changes | Separate approval for that exact action" (plugins/vh-adlc/references/authority.md:30). The design does not mention that row. The new rule says "no operation rebases, amends, squashes or otherwise rewrites" a reviewed commit, which leaves it open whether the owner's separate approval under line 30 still allows such a rewrite. One implementer adds an absolute ban that contradicts line 30. Another keeps line 30 and has the ban yield to approval, and the T14 check that authority.md "forbids rewriting a commit a Review Log row names" passes on either. The rebase this document cites as the trigger would already have needed that approval.
PROPOSAL: Cite authority.md:30 in Design and decide whether the owner's separate approval can authorize rewriting a reviewed commit, for example by allowing it only with a warning that every review it names becomes stale. Make the Preservation text, line 30 and the T14 check say the same thing.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Nits are listed, not applied (lines 192-197); Acceptance Criteria AC-11 (lines 343-345); Test Plan AC-11 row (line 360); Context, Owner summary (lines 47-49)
EVIDENCE: The rule lists "every nit of the latest pass" in the report and the owner-facing summary. The AC-11 case stores a blocking pass that holds a Design nit. After the blocking finding is applied the review is stale, and the design expects a run to continue to a second pass (the AC-10 row: "the run continues to a second pass"). Once that pass runs, the blocking pass is no longer the latest, so an author following the rule may leave out its Design nit, while the case requires that nit "with its ID in the report and the owner-facing summary". The row does not say whether the scripted reviewer returns a second pass or what it holds. More generally, a nit from any pass except the last one in a run is never reported, so the owner never sees it.
PROPOSAL: Say whether the report lists the nits of every pass the run handled or only the last one, and use the same wording in Design, AC-11 and the Owner summary. In the AC-11 row, state how many canned passes the scripted reviewer returns and which nits the report must list.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Nits are listed, not applied (lines 192-197); Context, Owner summary (lines 47-49); Open Questions
EVIDENCE: Under the rule, a nit on the normative baseline is never applied by any path. That holds even when the same pass's blocking or should-fix finding already changes the baseline in that commit, so a new pass happens anyway and holding back the nit saves no pass. A harmless wrong `file:line` in Design, which AC-02 requires to be rated nit, therefore stays in the document for good, although the convention asks Design to cite its claims (conventions/feature-documents.md:75). Now that the saved-nit list has moved to spec-review-stopping-rule.md, this document keeps no record of such nits beyond one run's report. The Owner summary gives the benefit ("they never trigger another pass") but not this cost, and the convention asks the summary to cover trade-offs (:80-83) and asks every trade-off the document settles to go to Open Questions (:154-157). The decision record says only that a "plain nit rule" replaced saved nits, not whether applying nits alongside a revision that is already happening was considered.
PROPOSAL: Raise as an Open Question whether nits on the baseline may be applied in a commit that already revises the baseline for a blocking or should-fix finding. State the chosen behavior and its cost in the Owner summary.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (lines 37-39)
EVIDENCE: "R-4 to R-13 were each caused by the previous pass's narrow fix, all in the stopping rule it carried." The Review Log shows that R-8, R-9, R-10 and R-11 had no blocking finding (lines 437-442), and several findings in that range are outside the stopping rule: R-12 F-05 and F-06 concern Pins and the AC-06 row, and R-12 F-07 concerns Tasks T13 and T6 for AC-10 (lines 1121-1140). The claim holds for the blocking findings in R-4 to R-7, R-12 and R-13, not for every pass in the range.
PROPOSAL: Say that the blocking findings in R-4 to R-7, R-12 and R-13 each traced to the previous pass's fix and all sat in the stopping rule.

### R-15

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Nits are listed, not applied (lines 197-204); Design, Applying a pass's findings as one revision (lines 208-213); Acceptance Criteria AC-11 (lines 353-357); Test Plan AC-11 row (line 372); Tasks T6 (line 384)
EVIDENCE: The nit rule says "a nit on the normative baseline never causes a revision on its own", and AC-11 says the author "makes no commit that changes the normative baseline only to fix nits". The one-revision rule says the author "raises the pass's judgement findings as Open Questions first" and then applies "every answer" in one commit, and today's skill turns every judgement finding into an Open Question whatever its severity (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:71-72). Nothing says what happens to a nit whose KIND is judgement. If a clean pass holds only a judgement nit on Design, one implementer raises it as an Open Question and folds the owner's answer, which is a baseline commit made only for a nit and fails AC-11. Another lists it and raises nothing. The AC-11 row does not give the KIND of any of its three nits, so the second pass's Scope nit can be either. T6's failure reason, "today's skill applies the clean pass's factual nit on its own", only holds if that nit is factual, while the AC-06 row does say "factual nit".
PROPOSAL: State whether a judgement nit on the baseline is raised as an Open Question or only listed, and use the same wording in the one-revision paragraph and AC-11. In the AC-11 row, give each nit's KIND so it matches T6.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary (lines 48-52); Design, Nits are listed, not applied (lines 197-204); Acceptance Criteria AC-11 (lines 353-357)
EVIDENCE: The Owner summary says "The cost: a nit on a pass with nothing else to apply stays in the document unless you pick it." The Design gives no owner-pick path for nits. AC-11 says the author "makes no commit that changes the normative baseline only to fix nits", with no exception for an owner's pick. An author that applies a nit the owner picked, as the summary promises, fails AC-11 as written. An author that refuses the pick meets AC-11 but contradicts the summary. Picking a listed finding was the R-10 and R-12 mechanism that moved to spec-review-stopping-rule.md, so this document no longer defines it.
PROPOSAL: Either add to Design and AC-11 that a nit the owner picks is applied as an owner-directed revision, or drop "unless you pick it" from the Owner summary and say the nit stays until a later revision touches it.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-11 row (line 372); Acceptance Criteria AC-11 (lines 356-357); Design, Nits are listed, not applied (lines 197-203)
EVIDENCE: The row passes only "when the first pass's blocking finding and both its nits are applied in one commit", and one of those nits is on Context. AC-11 says the author "may apply a finding confined to sections outside the normative baseline", and Design says such a finding "may be applied at any time". The Design sentence "the same commit fixes that pass's nits" sits inside the rule about baseline nits, so it can be read as covering only baseline nits. Under that reading, an author that leaves the Context nit unapplied follows AC-11 and still fails the proof. Under the other reading, fixing the Context nit is required, and AC-11's "may" is wrong. By this document's own severity definitions, a proof that fails a correct implementation is a defect.
PROPOSAL: Decide whether a pass's non-baseline nits must go in the same commit as its baseline fixes. Then either make the row accept the Context nit as applied or unapplied, or change AC-11 and Design to require it.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Free-text checks (lines 273-278); Design, Nits are listed, not applied (lines 197-200); Acceptance Criteria AC-05 and AC-11; Test Plan AC-05 row
EVIDENCE: This traces to the previous revision's change, the R-14 F-05 answer that a pass's nits are fixed in the same commit that applies its blocking or should-fix findings to the baseline. Under the free-text rule, a widening finding on a row that has passed review is a nit "so it is listed rather than applied", and "a later change to the row starts over". Under the new nit rule, whenever the same pass also has a blocking or should-fix finding on the baseline, the widening nit must be fixed in that commit. That changes the row, the row loses its passed state, and the next pass may rate a further widening should-fix again. This is the regex-tuning loop of blog-visual-reading R-40, R-44 and R-45 that Background cites (docs/specs/blog-visual-reading.md:1411, :1524, :1547 at 3963e25). The two rules now contradict each other ("listed rather than applied" against "the same commit fixes that pass's nits"), and the AC-05 trial does not cover a pass with both kinds of finding.
PROPOSAL: State which rule wins for a free-text widening nit on a pass that also changes the baseline: either it is always listed and never applied, or applying it alongside does not restart the row. Add that case to the AC-05 trial.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-10 (lines 349-352); Test Plan AC-10 row (line 371); Design, Commits a Review Log names are never rewritten (lines 228-232); Context, Owner summary (lines 62-63)
EVIDENCE: This traces to the previous revision's change for R-14 F-01, which narrowed the Test Plan row to "stale from drift alone" but left AC-10 broad. AC-10 still says "when the default branch moves during a review loop on a feature branch, the author brings it in by merge". The only merge instruction is review mode step 1, which runs only "When `vh-adlc fresh` shows the spec review stale from drift alone (covered changes on the default branch, an unchanged baseline)" (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:55-57 at 76f0480). T13 no longer changes the skill. When the default branch moves after a pass whose fixes also change the baseline, `fresh` reports `baseline-changed` as well as drift, step 1 does not run, and nothing brings the default branch in. The AC-10 scenario only tests drift alone, so it passes while AC-10's broader end state is not delivered. The Owner summary's unconditional "default-branch work comes in by merge" repeats the broad form.
PROPOSAL: Narrow AC-10 and the Owner summary to "when the author brings default-branch work in, it uses a merge", or to the drift-alone case step 1 covers. Alternatively, widen step 1 in T13 and add a mixed-staleness case to the row.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design, Delivery (lines 293-299); Tasks T10; Acceptance Criteria AC-08
EVIDENCE: docs/user-guides/workflows.md:279 says "Merging, tagging, releasing, deploying, and destructive operations need separate approval" and points to authority.md for the full contracts. After T13, a history rewrite of a commit a Review Log row names cannot be approved at all. T10 and AC-08 update the guides only for the severities, the nit rule and the one-revision rule, so the user guide would not mention the one destructive Git operation that approval cannot unlock.
PROPOSAL: Add a sentence to T10 and the AC-08 guide check saying that no approval allows rewriting a commit a Review Log row names.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Design, Delivery (lines 301-304); Context, Background, Overlapping work (lines 141-146)
EVIDENCE: Delivery says shared-development-loop "edits the same spec skill, protocol, `references/authority.md`, pin and manifests", and the second feature to land merges the first in "for every one of those files". Background, and that feature's covers (docs/specs/shared-development-loop.md:7-29 at b777df0 and 4bef34e), show it also covers the reviewer agent and `knowledge.md`, and covers `tests/vh-adlc/` at b777df0. This feature changes all three (T4, T3, T6, T9, T15). A git merge brings in the whole branch, so the list changes nothing in practice. It just disagrees with Background.
PROPOSAL: Add the reviewer agent, `knowledge.md` and `tests/vh-adlc/scenarios/run.ts` to the Delivery list, or say "every file both features change".

### R-16

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Severity definitions (lines 238-252); Design, Behaviors these rules touch (lines 181-187); Design, Nits are listed, not applied (lines 195-204); Tasks T4 (line 383); Acceptance Criteria AC-02 (lines 317-320); Test Plan AC-02 row (line 363)
EVIDENCE: Since 2c9d3af (PR 87) the reviewer agent says "Apply each declared lens the dispatch lists as a check at its severity" (plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:40 at 12370b8). loop-settings.md defines `lenses` as "{name, check, severity}" with severity "`blocking`, `should-fix` or `nit`" (plugins/vh-adlc/references/loop-settings.md, Terms and fields table), the spec skill passes them to the reviewer (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:34), and tests/vh-adlc/loop/lenses.test.ts:33-54 declares lenses at `blocking`. This document's Design says "The reviewer agent tells the reviewer to rate with the definitions in the resolved convention" (line 251), and T4 adds that sentence beside the lens sentence. Nothing says which wins when a lens's declared severity disagrees with the definitions, for example a wording lens declared should-fix that the definitions call a nit, or a lens declared nit on a false claim the design depends on. The nit rule follows from the rating, so one implementer lists such a finding and another applies it. The Behaviors list, which "every rule below was checked against", predates lenses and has no lens or instruction-file finding, and the AC-02 trial dispatches no lens.
PROPOSAL: State in Design and T4 whether a declared lens severity overrides the convention's definitions (and so decides whether the nit rule applies), add a lens finding to the Behaviors list, and add a lens case to the AC-02 trial.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (lines 69-71); Context, Background, Overlapping work (lines 141-146); Design, Delivery (lines 301-304); Tasks T11 (line 388)
EVIDENCE: The Owner summary says shared-development-loop "is in progress on its own feature branch, so whichever lands second merges the first in", and Delivery says it is "in progress on its feature branch". At 12370b8 that feature is merged into main by 2c9d3af (parents 3f01a9c and 8b8579b), and docs/specs/shared-development-loop.md:2 reads `status: complete`. This feature is therefore the second to land, and a feature branch cut from current main already holds the other feature, so the merge-in step and T11's "after merging shared-development-loop in if it has landed" are no-ops. Nothing built changes.
PROPOSAL: Say in the Owner summary and Delivery that shared-development-loop landed at 2c9d3af and that this feature's branch starts from a main that contains it, and drop the merge-in clause from T11.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context, Background, Pins (lines 136-139); Design, Delivery (lines 295-299); Acceptance Criteria AC-06 (lines 331-336); Test Plan AC-06 row (line 367); Tasks T3 (line 382)
EVIDENCE: Background presents one docs SHA shared by the repository pin and the plugin. At 12370b8, AGENTS.md:4 and plugins/vh-adlc/references/security-settings.md:5 name d8f07c9dd69038375a535af8ad586086688f85ab, while plugins/vh-adlc/knowledge.md:5 and :7 name c70769ebf43ea03a4bdffb3cda51954eb05b35a7, moved alone by 2c9d3af. "The previous pin" in AC-06 and "the old pin" in its row and T3 now name two commits: the repository comparison restores d8f07c9 in AGENTS.md, while the old-pin fixture takes revision A from the plugin pin (tests/vh-adlc/fixtures/build.ts:112-117), which is c70769e. A diff of the cached pages shows conventions/feature-documents.md identical at both commits, so the rules block comparison passes either way.
PROPOSAL: Note in Background that the plugin pin and the repository pin now differ, and name which commit "the previous pin" means in AC-06, its row and T3 (or say that both are compared).

### R-17

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Nits ride along or are listed (lines 204-214); Design, Applying a pass's findings as one revision (lines 218-224); Design, Delivery (lines 307-314); Acceptance Criteria AC-11 (lines 369-374); Tasks T2 and T5 (lines 403, 407)
EVIDENCE: The nit rule has the author fix every nit of a pass "in any section and of either kind, without raising a judgement nit as an Open Question". The pinned convention says of Open Questions "Only the owner answers them" (conventions/feature-documents.md:139) and "Every trade-off the document settles is an open question, including one the author would answer the same way the owner would" (:154-155). The spec skill's author mode says "Put every judgement call into Open Questions ... Never answer one yourself" (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:58 at db1d531), and review mode step 4 and the protocol say "Turn judgement findings into Open Questions" (SKILL.md:81, plugins/vh-adlc/references/review-protocol.md:96). Design and T2 put the nit rule only "beside the severity definitions", and T5 changes only review mode and the protocol's Records paragraph. The published convention would then contradict its own Open questions section, and an author reading the unchanged author-mode bullet may still raise a judgement nit, which fails AC-11's "raises no nit as an Open Question". This document's own restatement rule asks for every such location to be named.
PROPOSAL: Name in Design, T2 and T5 every restatement the nit rule overrides: an exception for nits in the convention's Open questions section, the author-mode bullet at SKILL.md:58, review mode step 4 and review-protocol.md:96.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Applying a pass's findings as one revision (lines 218-224); Design, Behaviors these rules touch (lines 190-194); Acceptance Criteria AC-09 (lines 359-364); Test Plan AC-09 row (line 387)
EVIDENCE: Design has the author raise a pass's judgement findings as Open Questions "without changing the baseline, and once the owner has answered it applies every factual finding to be applied, every answer and the nits" in one commit. Today the factual findings are applied in the same run (SKILL.md:81), so nothing waits. Under the new order, a run that stops for the owner leaves that pass's factual findings and nits unapplied, and nothing records that they are pending except the stored records. In a later session, if the folded answer leaves the baseline unchanged, the pass stays fresh and clean, so `vh-adlc next` returns owner acceptance (conventions/feature-documents.md:279), and the resume skill follows `next` (plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md, Continue table). The held findings are then dropped. If the answer changes the baseline, `next` says spec review and they are dropped the same way. The Behaviors list says "an interrupted or resumed run" was checked, but the AC-09 second trial gets the owner's scripted answer in the same run, and the resume skill is not in covers. This is the partial-failure path the document's own failure-mode check asks about.
PROPOSAL: State where the pending pass is recorded when its Open Questions are raised (for example the questions or status_description name R-n and say its factual findings and nits await the answers), and that the spec and resume operations apply that pass's held findings with the answers before dispatching or asking for acceptance. Add an AC-09 variant where the answer arrives in a separate session with no resume.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-11 (lines 369-374); Test Plan AC-11 row (line 389); Design, Free-text checks (lines 286-292); Tasks T4 and T6 (lines 405-406)
EVIDENCE: AC-11 requires that the author fixes every nit of the pass "except a free-text widening nit, which stays listed". The AC-11 row's first pass holds a factual nit on Design, a judgement nit on Scope and a factual nit on Context, and no free-text widening nit, and the AC-05 trial checks only the reviewer's rating. An author that applies a widening nit alongside a blocking fix passes every listed proof, and that is the regex-tuning loop the Context cites (blog-visual-reading R-40, R-44, R-45). The records also have no field that marks a nit as a free-text widening, and neither T4 nor Design asks the reviewer to say so, so the author must infer it from the text.
PROPOSAL: Add a widening nit on a passed free-text row to the first pass of the AC-11 scenario and pass only when it is listed and not applied. Have the reviewer agent say in `EVIDENCE` when a nit is a free-text widening.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Failure-mode check (lines 269-275); Context, Owner summary (lines 55-56); Acceptance Criteria AC-04 (lines 339-341); Test Plan AC-04 row (line 382)
EVIDENCE: Design and the Owner summary trigger the check where the design "changes state, runs concurrently, or crosses a process or network boundary". AC-04 says "a design that changes shared state or crosses a network boundary". Almost every feature writes some file, so under the Design reading nearly every spec draws the four questions and new findings, which works against the goal of fewer passes. Under the AC-04 reading only shared state counts. The AC-04 row's third and fourth fixtures are described only as "a design that defines concurrency, partial failure and retry but not upgrade or rollback" and "a design that defines concurrency, retry and upgrade but not partial failure", without saying they change state or cross a boundary, and no fixture changes only private local state, so the two readings are never told apart.
PROPOSAL: Pick one trigger and use it in Design, the Owner summary, AC-04 and AC-07. Give fixtures three and four an explicit state change or boundary, and add a fixture that changes only private local state with its expected result.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary (lines 73-74); Design, Delivery (lines 316-318); Acceptance Criteria AC-06 (lines 346-351); Tasks T11 (line 410)
EVIDENCE: `git merge-base --is-ancestor origin/main HEAD` fails: origin/main is at da736bc, which holds f4e5793 (#88) moving both manifests from 0.17.0 to 0.18.0 and the lock to 0.26.0, while the branch still has 0.17.0. `vh-adlc fresh` on this document reports `covered-drift` for plugins/vh-adlc/plugin.json and plugins/vh-adlc/.claude-plugin/plugin.json. T11 moves to "one version above the version current at the time" and AC-06 asks only for "higher than the version before the change". The version check only requires the version to differ from origin/main (tests/vh-adlc/check.test.ts:224-232). So 0.17.1 passes AC-06 and the check although it is lower than the published 0.18.0, and a branch-relative bump to 0.18.0 duplicates a released version. The Owner summary says only that the branch starts from a main holding 2c9d3af.
PROPOSAL: State that the default branch is merged into the feature branch before T3 and T11, and that the new version is above the default branch's version at that point. Make AC-06 and T11 say the same.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-08 row (line 386); Acceptance Criteria AC-08 (lines 355-358); Tasks T1 (line 393)
EVIDENCE: For the convention, the AC-08 check in tests/vh-adlc/review-convergence.test.ts only looks for the sentence "a nit on the normative baseline never causes a revision on its own" in the Review log section. The nit rule in Design also requires a pass's nits to ride along with its blocking or should-fix baseline fixes, the free-text widening exception, and listing unapplied nits in the report and conversation. A published convention that carries only the first sentence passes the row, so a proof can pass on a wrong implementation, which this document's own should-fix definition covers.
PROPOSAL: Extend the AC-08 check to the ride-along clause, the free-text exception and the listing rule, or say in the row that the T2 independent review checks those parts.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Design, Severity definitions (lines 251-265)
EVIDENCE: The nit definition is "a citation slip that changes nothing an implementer builds or a proof checks", but the should-fix definition makes widening a passed free-text row a nit, and that does change what the proof checks. The lens paragraph sits under the "(convention)" heading, while lenses are a plugin concept (plugins/vh-adlc/references/loop-settings.md:42) and T4 puts the precedence in the reviewer agent, so it is unclear whether the shared convention gets the lens sentence.
PROPOSAL: Add the free-text widening case to the nit definition, and say whether the lens precedence goes in the convention or only in the reviewer agent.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (lines 40-42 and 83-85)
EVIDENCE: The summary says the stopping rule draft is "parked until `shared-development-loop` lands", and later says that feature "landed first (`2c9d3af`)"; docs/specs/shared-development-loop.md has `status: complete`. It also says "Validation is planned, not observed", while T13 and T15 record observed passes, and running `bun test tests/vh-adlc/review-convergence.test.ts` at db1d531 gives 2 pass (both authority checks) and 6 fail.
PROPOSAL: Say the stopping rule draft waits to be reviewed against the landed loop, and say which checks have already been observed (the AC-10 authority checks and S16.drift) and which are still planned.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-11 row (line 389)
EVIDENCE: The row passes only when "the document does not list" the second pass's nit, but the convention stores the reviewer's records verbatim under `### R-<n>` (conventions/feature-documents.md:164-165), so that nit's ID and text are always in the document.
PROPOSAL: Say that the check excludes the Review Log and its record subsections.

### R-18

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Nits ride along or are listed (lines 204-214); Design, Applying a pass's findings as one revision (lines 218-224); Acceptance Criteria AC-11 (lines 369-374); Tasks T2 and T5 (lines 403, 407)
EVIDENCE: Design has the author fix every nit of a pass "in any section and of either kind, without raising a judgement nit as an Open Question". At 94f54d5 these texts still say the opposite. The pinned convention says "Only the owner answers them" (conventions/feature-documents.md:139) and "Every trade-off the document settles is an open question, including one the author would answer the same way the owner would" (:154-155). The spec skill's author mode says "Put every judgement call into Open Questions" (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:58). Review mode step 4 says "Turn judgement findings into Open Questions for the owner" (SKILL.md:81), and the protocol says the same (plugins/vh-adlc/references/review-protocol.md:96). T2 puts the nit rule only beside the severity definitions. T5 names review mode and the protocol, but not the author-mode bullet or the convention's Open questions section. The published convention would contradict itself, and an author reading the unchanged bullet could raise a judgement nit and fail AC-11. This is the same gap as R-17 F-01, and none of these files changed between db1d531 and 94f54d5.
PROPOSAL: In Design, T2 and T5, name each place the nit rule overrides: an exception for nits in the convention's Open questions section, SKILL.md:58, SKILL.md:81 and review-protocol.md:96.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Applying a pass's findings as one revision (lines 218-224); Design, Behaviors these rules touch (lines 190-194); Acceptance Criteria AC-09 (lines 359-364); Test Plan AC-09 row (line 387)
EVIDENCE: Under the new order, the author raises a pass's judgement findings first and holds back its factual findings and nits until the owner answers. Nothing records that those findings are waiting. Suppose the answer comes in a later session and leaves the baseline unchanged. The review then stays fresh and clean, so `next` returns owner acceptance (conventions/feature-documents.md:279). The resume skill runs `vh-adlc next` and carries on with the step it names (plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md:25, :43-46), so the held findings are dropped. The Behaviors list says "an interrupted or resumed run" was checked. The AC-09 second trial, however, gets the scripted answer in the same run, and the resume skill is not in covers. This is the same as R-17 F-02, and it is still open at 94f54d5.
PROPOSAL: State where a pending pass is recorded when its questions are raised, and require the spec and resume operations to apply the held findings with the answers before they dispatch a review or ask for acceptance. Add an AC-09 case where the answer arrives in a separate session.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-11 (lines 369-374); Test Plan AC-11 row (line 389); Design, Free-text checks (lines 286-292); Tasks T4 and T6 (lines 405-406)
EVIDENCE: AC-11 says the free-text widening nit is the one exception and "stays listed". The AC-11 row's first pass has a factual nit on Design, a judgement nit on Scope and a factual nit on Context, but no widening nit. The AC-05 trial checks only how the reviewer rates such a nit. An author could apply a widening nit alongside a blocking fix and still pass every listed proof, which brings back the regex-tuning loop the Context cites. No record field and no reviewer instruction in T4 marks a nit as a free-text widening. This is the same as R-17 F-03, and it is unchanged at 94f54d5.
PROPOSAL: Add a widening nit on a passed free-text row to the AC-11 scenario's first pass, and pass only when it is listed and not applied. Have the reviewer agent say in `EVIDENCE` when a nit is a free-text widening.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Failure-mode check (lines 269-275); Context, Owner summary (lines 55-56); Acceptance Criteria AC-04 (lines 339-341) and AC-07 (lines 352-354); Test Plan AC-04 row (line 382)
EVIDENCE: Design and the Owner summary trigger the check when a design "changes state, runs concurrently, or crosses a process or network boundary". AC-04 says "changes shared state or crosses a network boundary", and AC-07 says only "crosses a network boundary". The AC-04 row does not say whether fixtures three and four change state or cross a boundary. No fixture changes only private local state, so the trials cannot tell the two triggers apart. This is the same as R-17 F-04, and it is unchanged.
PROPOSAL: Use one trigger in Design, the Owner summary, AC-04 and AC-07. Give fixtures three and four an explicit state change or boundary, and add a fixture that changes only private local state, with its expected result.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design, Delivery (lines 316-318); Acceptance Criteria AC-06 (lines 346-351); Tasks T11 (line 410); Context, Owner summary (lines 73-74)
EVIDENCE: Merge 94f54d5 brings in da736bc, so both manifests on the branch now read 0.18.0, the same as origin/main (plugins/vh-adlc/plugin.json:4, plugins/vh-adlc/.claude-plugin/plugin.json:3). The R-17 F-05 gap is therefore closed at this commit, but the document still does not prevent it from coming back. T11 moves to "one version above the version current at the time", and AC-06 asks only for a version "higher than the version before the change". Neither says which branch's version counts. The check only requires the version to differ from origin/main (tests/vh-adlc/check.test.ts:224-232). If the default branch publishes again before T11 runs, a branch-relative bump would pass AC-06 and the check while sitting below the published version, or would duplicate it.
PROPOSAL: In Delivery, T11 and AC-06, say that the new version is above the default branch's version when T11 runs, and that the default branch is merged in first if it has moved.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-08 row (line 386); Acceptance Criteria AC-08 (lines 355-358)
EVIDENCE: The AC-08 convention check looks only for "a nit on the normative baseline never causes a revision on its own" in the Review log section (tests/vh-adlc/review-convergence.test.ts:48-50). Design's nit rule also has three more parts: nits ride along with the pass's blocking or should-fix baseline fixes, a free-text widening nit is the exception, and unapplied nits are listed in the report and the conversation. A convention carrying only the first sentence passes the row. That is a proof that can pass on a wrong implementation, which this document's should-fix definition covers. Same as R-17 F-06.
PROPOSAL: Extend the AC-08 check to the ride-along clause, the widening exception and the listing rule, or say in the row that the T2 independent review checks those parts.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Design, Severity definitions (lines 251-265)
EVIDENCE: The nit definition covers "a citation slip that changes nothing an implementer builds or a proof checks". The should-fix definition, however, makes widening a passed free-text row a nit, and that does change what a proof checks. The lens paragraph sits under the "(convention)" heading, but lenses are a plugin concept (plugins/vh-adlc/references/loop-settings.md:42), and T4 puts the precedence in the reviewer agent. Same as R-17 F-07.
PROPOSAL: Add the widening case to the nit definition, and say whether the lens precedence goes into the convention or only into the reviewer agent.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (lines 40-42, 76-85); frontmatter status_description (line 3)
EVIDENCE: Several statements are out of date at 94f54d5. The summary says the stopping-rule draft is "parked until `shared-development-loop` lands", but that feature is `status: complete` (docs/specs/shared-development-loop.md:2). The summary says "Validation is planned, not observed", but `bun test tests/vh-adlc/review-convergence.test.ts` at 94f54d5 gave 2 pass (both authority checks) and 6 fail, and T15 records an observed S16.drift pass. The summary also describes material changes only since the R-15 acceptance. status_description still reads "waiting for spec review R-17, which the owner accepts in advance if it has no blocking finding", although R-17 and its acceptance row are recorded (lines 493-494).
PROPOSAL: Refresh status_description to show that the document is accepted at R-17 and waits for a fresh drift re-review and the planned gate. In the summary, say which checks have been observed so far and that the stopping-rule draft now waits for review against the landed loop.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-11 row (line 389)
EVIDENCE: The row passes only when "the document does not list" the second pass's nit. The convention, however, stores the reviewer's records verbatim under `### R-<n>` (conventions/feature-documents.md:164-165), so that nit's ID and text are always in the document. Same as R-17 F-09.
PROPOSAL: Say that the check excludes the Review Log and its record subsections.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Tasks T12 (line 395); Acceptance Criteria AC-08 (lines 355-358)
EVIDENCE: The document maps the workflows-guide sentence "no approval allows rewriting a commit that a Review Log row names" to AC-08, in AC-08, its Test Plan row and T12. The test names it "(AC-10, R-15 F-06)" (tests/vh-adlc/review-convergence.test.ts:71). An implementation review that maps tests to criteria by name would then file it under the wrong criterion.
PROPOSAL: Rename the test to cite AC-08, matching the document.
