---
status: draft
status_description: "Revised after spec review R-1 with the owner's answers folded; waits for a fresh independent spec review."
issue: null
goal: "vh-adlc's ship, review and implement skills are rewritten to one pinned standard for agent-read documents only where a controlled trial shows the rewrite makes agent runs better, with every rule kept."
covers:
  - AGENTS.md
  - plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-review/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/scenarios/
  - tests/vh-adlc/lifecycle/
  - tests/vh-adlc/evidence/agent-document-writing/
---

# Plan: Agent document writing

Give vh-adlc one pinned standard for writing the documents its agents read, and apply it to the
three largest operation skills where a controlled trial shows agents do better with the result.

## Context

### Owner summary

vh-adlc's skills are instructions for agents, but the only writing rule the repository routes to is
the humanize prose guide, which is written for prose a person reads. Nothing says how to write a
skill so the agent takes the same path every run. The ship, review and implement skills are the
largest operation skills and carry the most prohibitions.

The change has two parts. A companion change in `vhco-pro/docs` adds `guides/write-for-agents.md`,
adapted from Matt Pocock's MIT-licensed `writing-for-agents` skill. It covers context pointers,
the cost of always-loaded text, where reference belongs, completion criteria, leading words,
positive targets beside hard guardrails, and pruning no-ops. Two rules adapt it here: a guardrail
with a recorded failure behind it stays until a run shows it is unneeded, and repeated leading
words win over the humanize guide's variation inside agent-loaded text. In this repository,
`AGENTS.md` then routes skill, reviewer and reference authoring to that guide, and its pin moves
to the commit that merges it. If a docs change between the two pins alters a rule vh-adlc's
operations read, the pin move stops and comes back to you.

The second part is one rewrite pass over the ship, review and implement skills: state targets
positively and keep each needed prohibition beside its target, give each step a checkable end,
and delete sentences that change nothing. Every rule keeps its meaning. A rule inventory maps each
old rule to its new place, or records why it was removed, and an independent reviewer checks it.

You asked for proof that the rewrite is better, not just harmless. Each rewritten skill runs against
its original, five runs per arm on each host: the lifecycle harness on Codex CLI and the scenario
harness on Claude Code. The scenario harness currently deletes its session transcripts, so it gains
an opt-in setting that keeps them outside the repository; a skill no existing case reaches may also
get one small added case. Per case the trial compares passed runs, rule violations found by a blind
grader, and median turns and tool calls. A rewrite ships only if no case gets worse on passed runs or
violations on either host, and some case improves on either host. Improvement means more passed
runs, fewer violations, or, as you chose, fewer median turns or tool calls by more than the
original's own run-to-run spread. Each skill is tried alone; passing rewrites are then tried
together. A skill that fails keeps the default branch's text, and the result is recorded either way.

Out of scope: the other skills, the reviewer agent, the references, the plugin's own docs pin,
consumer repositories and any new mechanical check.

Observed so far: the baseline package checks on `c676010` (1,683 pass, 6 fail in this environment)
and the companion guide's docs check. The trial has not run. Spec review R-1 returned one blocking
and eight should-fix findings, all applied in this revision with your answers; a fresh review is
next. Accepting this authorizes the implementation, the harness setting and the trial runs on a
feature branch after the companion docs change merges. Opening and merging the docs PR, and
shipping, each still need your request.

### Background

- The repository pins `vhco-pro/docs` at `1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff`
  (`AGENTS.md:4`) and routes reader-facing prose to `guides/humanize-prose.md` (`AGENTS.md:11`). No
  route covers writing skills or other agent-read documents.
- The plugin's own docs pin is the same revision (`plugins/vh-adlc/knowledge.md:5-7`). Moving it is
  "a reviewed plugin change with a version bump" (`plugins/vh-adlc/knowledge.md:9`).
- Measured on `c676010` with `wc -w` and
  `grep -o -i -w -E 'never|do not|must not|cannot' <file> | wc -l`: `vh-adlc-ship` has 1,366 words
  and 12 such words, `vh-adlc-review` 829 and 11, `vh-adlc-implement` 1,380 and 10. Prohibitions also
  take other forms, such as "It is not authority to merge" and "create no branch" (R-1 F-06). These
  counts locate the work; they are not acceptance targets.
- The three files change often: since 2026-10-15, ship 19 commits, review 12 and implement 13, the
  latest `12e3164` on 2026-11-14 (R-1 F-04, `git log --since=2026-10-15 --oneline ef7f01b -- <file>`).
- The skills call each other: ship obtains a fresh review as `../vh-adlc-review/SKILL.md` describes
  (`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:71`), and the Claude Code completion scenarios run
  implement and then completion review (`tests/vh-adlc/scenarios/run.ts:1410`).
- The package checks pin phrases in these files: every content and scheduled operation must name
  `guides/humanize-prose.md` and `vh-adlc knowledge` (`tests/vh-adlc/check.test.ts:260-266`);
  implement must name `vh-adlc gate in-progress` and `vh-adlc gate complete`, and ship
  `vh-adlc gate complete` (`tests/vh-adlc/check.test.ts:44-45`, used at `:268-273`); review must name
  `model eligibility` and `unrequested default` and no model name (`tests/vh-adlc/check.test.ts:362-369`).
  The lifecycle fixtures look for a read of `vh-adlc-ship/SKILL.md` (`tests/vh-adlc/lifecycle/fixtures.ts:317`).
  The package canary rejects sentences copied from pinned docs pages listed in `CANARY_PAGES`
  (`tests/vh-adlc/check.test.ts:54-67`), which does not list the new guide.
- `bun test tests/vh-adlc` on unchanged `c676010` in this environment reports 1,683 pass and 6 fail
  in 13m36s: five audit and maintenance tests (four of them 5-second timeouts) and the Bubblewrap
  `/tmp` cleanup test. The suite is timing sensitive.
- `docs/specs/agent-language-drift.md` (abandoned, findings retained) found that extra prose
  instructions "showed no consistent factual benefit over the guide" and that a claim of prevention
  "would exceed the evidence". That study concerned human-read documentation prose, not skill
  instructions, but it is why every rewrite here is gated by a trial.
- The Claude Code scenario harness runs real headless agent sessions with deterministic checks per
  scenario and is not part of `bun test` (`tests/vh-adlc/scenarios/run.ts:1-6`). It runs the checkout
  it sits in (`const ROOT` at `tests/vh-adlc/scenarios/run.ts:17`) and takes no package or repeat flag
  (`:1756-1760`). Each session's profile, transcripts included, is deleted after the run: `session()`
  calls `p.dispose()` in a `finally` block (`:133-147`), which removes the profile directory
  (`tests/vh-adlc/scenarios/host.ts:37`). Its summary records turns and cost but no tool-call count
  (`tests/vh-adlc/scenarios/run.ts:1797-1798`).
- The lifecycle harness runs native Codex CLI trials against either a baseline source revision or a
  candidate package (`tests/vh-adlc/lifecycle/run.ts:1-3`, `:24-25`, `:44-51`), keeps each run's raw
  event log (`:82`), refuses a non-empty output directory (`:30`), and stops an arm's remaining repeats
  after an execution failure (`:134`). Its plan repeats a case 1 to 10 times, consecutively
  (`tests/vh-adlc/lifecycle/scenario-plan.ts:9-10`, `:26`); its cases include `L11-ship` (`:21-24`).
- The repository declares no loop routes beyond cleanup and triage settings
  (`git ls-tree -r --name-only ef7f01b | grep ^.vh-adlc/`), so reviewer roles use the host default.
- The companion guide is drafted on `vhco-pro/docs` branch `docs/write-for-agents`, based on that
  repository's `origin/main` at `d733cbe`, which contains the current pin (`git merge-base
  --is-ancestor 1ccf8f3 origin/main` succeeds). Its `npm run check` passes: "Checked 36 Markdown files:
  local links, metadata, and writing constraints pass."

### Terminology and delivery

| Term | Meaning |
| --- | --- |
| Base | The feature branch's fork point from the default branch, recorded in each trial summary; a skill's base text is its text there, or its text on the default branch after a merge that changed it (AC-03, AC-05). |
| Rule inventory | A table, kept as evidence, listing every normative statement of a skill's base text with an ID, its location in the rewritten file or the reason it was removed (AC-03). |
| Positive target | The behavior a sentence asks for, stated directly; a hard guardrail that must stay a prohibition sits beside its target (AC-02). |
| Trial | Alternating harness runs of the cases that reach one skill, five with its base text and five with its rewrite, on each host (AC-05). |

The changed artifact is the source-distributed vh-adlc plugin payload: up to three skill files, as the
trial allows, and the two manifests' version. The test harness setting ships in the repository's tests,
not in the payload. The binary, its lock and the plugin's docs pin are unchanged. The docs guide ships
through its own PR in `vhco-pro/docs` first; this repository's pin can only name it after that merge.

## Scope

- Companion, in `vhco-pro/docs`: `guides/write-for-agents.md`, plus one route line each in its
  `README.md` and `AGENTS.md`. It is delivered by that repository's PR process and is not covered here.
- `AGENTS.md`: one route line sending skill, reviewer prompt and agent-read reference authoring to
  `guides/write-for-agents.md`, and the pin moved to the docs merge commit.
- One rewrite pass over `vh-adlc-ship`, `vh-adlc-review` and `vh-adlc-implement` `SKILL.md`, preserving
  every rule's meaning, with a rule inventory per file under
  `tests/vh-adlc/evidence/agent-document-writing/`.
- An opt-in setting in the Claude Code scenario harness that saves each session's transcript, turn count
  and tool-call count to a named directory outside the repository before the profile is deleted.
- At most one added harness case per skill that no existing case reaches, recorded in the trial summary.
- A trial per rewritten skill on Claude Code CLI and Codex CLI, plus a combined trial of the passing
  rewrites, with summaries under `tests/vh-adlc/evidence/agent-document-writing/`; only rewrites that
  pass ship.
- A patch version bump in both plugin manifests when at least one rewrite ships.

Out of scope, by name: the other thirteen skills, `agents/vh-adlc-reviewer.agent.md`, every file under
`references/`, the plugin docs pin in `knowledge.md`, consumer repositories including Stackweaver,
a mechanical prose or negation checker, a word-count target, harness changes beyond the setting and
cases above, raw transcripts in the repository, and any claim of improvement beyond the cases run.

## Design

### Routing

`AGENTS.md` gains one sentence after the humanize line (`AGENTS.md:11`): write skills, reviewer
prompts and references an agent loads with `guides/write-for-agents.md`. The pin URL at `AGENTS.md:4`
moves to the docs merge commit; the owner chose this over linking the guide at a second revision.
Implementation runs `vh-adlc knowledge` with the new page to prove it resolves, and lists every docs
commit between the old and new pin with a one-line note on whether it changes any rule this
repository's operations read. A change that does alter such a rule stops the pin move and returns to
the owner.

### Rewrite pass

The base is recorded when the feature branch is cut. For each of the three files, in order ship,
review, implement:

1. Extract the rule inventory from the base text: every sentence that requires, permits or forbids
   an action, each with an ID and its line.
2. Rewrite under the guide, in the skill's own words, copying no sentence from the guide: state each
   target positively; keep a prohibition only where it is a hard guardrail, beside its positive target;
   end each step on a checkable completion criterion where the current step has none; replace repeated
   restatements with one term used consistently; delete sentences that change nothing against the
   operation's references or the model's default.
3. Complete the inventory: the new line for each rule, or `removed` with the reason. A removal of a
   guardrail cites the reference, review record or lesson that shows it is restated elsewhere or
   unneeded; a guardrail with a recorded failure and no restatement stays. Removed rules stay in the
   inventory.
4. Keep every phrase listed in Background that a package check pins.

A rule that moves to a shared reference is out of scope; the pass only edits the three files. The
files keep their frontmatter `name` and `description` unchanged, so discovery and invocation do not move.

When a merge from the default branch changes one of the three files before shipping, that skill's
base text becomes the merged text: its inventory, rewrite and trial are redone against it, or the
skill drops out and keeps the default branch's text.

### Trial harness

The scenario harness gains an opt-in environment setting naming a directory outside the repository.
When set, before `p.dispose()` each session copies its transcript files from the profile's `projects`
directory into a per-run subdirectory there and records the session's turn count and tool-call count
(from `toolUses`) in the run summary. When unset, behavior is unchanged. The lifecycle harness needs no
change: it already keeps each run's event log outside the repository.

### Trial

Cases. For each skill, implementation lists before running the cases that reach it: on Codex CLI the
lifecycle cases whose prompts reach the skill (for ship, `L11-ship`), and on Claude Code the scenario
cases that invoke it. A skill no existing case reaches on a host gets one small added case there.

Arms. A skill's rewrite arm changes only that skill; the other two keep their base text. Each case runs
ten times per host, alternating base and rewrite (base, rewrite, base, ...): on Codex CLI as separate
lifecycle invocations with `--repeat 1` into fresh, empty output directories (`--candidate base-<n>
--source-ref <base>` and `--candidate rewrite-<n> --package <dir>`); on Claude Code as one scenario
harness invocation per run from a worktree at the arm's commit, with the transcript setting on. A run
that ends as an execution failure (the harness or host failed before the agent finished) is rerun, up
to three times per arm; an arm that still lacks five completed runs makes the trial inconclusive, which
counts as a fail.

Measures, per case and host, over each arm's five completed runs:

1. passed runs: how many of the five passed every deterministic check;
2. violations: the total violation records the grader returned across the five transcripts;
3. median turns and median tool calls per run, from the host's transcript or event log.

Grader. Each transcript is graded once by a fresh read-only subagent on the host running the trial,
with the host's default model. It receives only the skill's full rule inventory, removed rules
included, and the transcript with arm labels and paths that reveal the arm removed. It returns
`VIOLATION: <rule ID> | <transcript line> | <one-line evidence>` per broken rule, or exactly
`NO VIOLATIONS`. A reply in any other form is regraded by a new subagent.

Decision. Within a case and host, the rewrite is no worse when it has at least as many passed runs and
at most as many violations as the base. It improves when it has more passed runs, fewer violations,
or a median turns or median tool calls lower than the base median by more than the base arm's spread
for that measure (largest minus smallest of its five runs). A skill passes when it is no worse on every
case on both hosts and improves on at least one case on at least one host.

Combination. When two or more skills pass, an arm with all passing rewrites runs against the base on
every case that reaches more than one of them, under the same rules. If that combined trial fails, the
trial stops and returns to the owner before anything ships.

A failing skill's file is set to its base text on the feature branch, and its summary records why.
Each summary lists the base, every case, run, measure, spread and grader record. Raw transcripts and
event logs stay in the directories outside the repository.

### Failure and rollback

The change is text in the plugin payload plus an opt-in test setting. A consumer on the previous plugin
version keeps the old skills; reverting the PR restores them. No state, schema or binary format changes,
and concurrent sessions are unaffected until they update the plugin. A trial interrupted midway leaves
its completed runs in their output directories and is resumed by running the missing runs.

## Acceptance Criteria

- [ ] AC-01: `AGENTS.md` routes skill, reviewer prompt and agent-read reference authoring to
      `guides/write-for-agents.md`, and `vh-adlc knowledge` resolves that page at the pinned revision.
- [ ] AC-02: In the three skills as shipped, every prohibition is a hard guardrail with its positive
      target in the same sentence or the one before it, and every numbered step ends on a condition an
      agent can check.
- [ ] AC-03: Every rule in each rewritten skill's base text appears with the same meaning in the
      rewritten file, or its removal is recorded with a reason the reviewer accepts, in the rule
      inventory.
- [ ] AC-04: No plugin package check fails at the final commit that passes at the base, and the three
      skills' frontmatter `name` and `description` are unchanged.
- [ ] AC-05: Each skill that ships rewritten passed its trial and, when two or more passed, the
      combined trial, under the decision rule in Design. Every skill that did not pass is identical to
      its text on the default branch the feature branch last merged.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Read `AGENTS.md` at the final commit; run `vh-adlc knowledge --repo . --plugin-pin <plugin pin> --page guides/write-for-agents.md` and observe `result` `answered` with the new revision. |
| AC-02 | Independent implementation review reads every sentence and numbered step of the three files at the final commit, using `grep -n -i -w -E 'never\|do not\|must not\|cannot\|not\|no\|nothing\|only'` only to locate candidates, and reports any prohibition without a positive target or step without a checkable end. Must pass: "Sync with `git fetch` and `git merge --ff-only`; never `git reset --hard` over changes you did not make." and "Push the feature branch only on an explicit ship request." Must fail: "It is not authority to merge." and "Do not skip the review." when no neighbouring sentence states the target. |
| AC-03 | Independent implementation review walks each rule inventory against the base text and the final file, and reports any rule whose meaning changed, any rule missing from the inventory, any removal reason it does not accept, and any sentence copied from `guides/write-for-agents.md`. |
| AC-04 | `bun test tests/vh-adlc` once at the base and once at the final commit in the same environment. Each test that fails only at the final commit is rerun alone three times at both commits and counts as a new failure only if it fails in at least two final runs and passes in at least two base runs; pass when there is none. `git diff <base> -- <three files>` shows no frontmatter change. |
| AC-05 | The trial summaries under `tests/vh-adlc/evidence/agent-document-writing/`, produced as Design describes (Codex CLI: `bun tests/vh-adlc/lifecycle/run.ts` with `--repeat 1` per run into fresh directories; Claude Code: `bun tests/vh-adlc/scenarios/run.ts` per run with the transcript setting on); independent implementation review recomputes each skill's verdict and the combined verdict from the recorded measures and grader records, and `git diff origin/<default branch> -- <file>` after the last merge is empty for each skill that did not pass. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-15 | R-1 | spec | `ef7f01b8b85a78c3c26aebb77aab526eed13d54a` | claude-opus-5-5 | procedural | One blocking, eight should-fix and four nit findings |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design (Trial, measures 2 and 3 and "raw transcripts stay in the temporary run, as both harnesses already do"); Test Plan row AC-05; Scope (trial bullet); covers frontmatter
EVIDENCE: The Claude Code scenario harness deletes every session transcript. In tests/vh-adlc/scenarios/run.ts:133-147, session() always calls p.dispose() in a finally block, and tests/vh-adlc/scenarios/host.ts:37 defines dispose as rmSync(config, { recursive: true, force: true }). The session .jsonl transcripts live under that config directory (host.ts toolUses walks join(p.config, "projects")). VH_ADLC_KEEP does not help, because it only keeps the SCRATCH fixture dirs (run.ts:1821), and the profile is not one of them (host.ts:27 uses its own mkdtemp). claude() runs with --output-format json (host.ts:96), so Turn.raw holds only the final result object. The summary writes Turns and Cost but no tool-call count (run.ts:1797-1798), and it keeps reports only for failing runs (run.ts:1811-1813). So on Claude Code the blind grader has no transcript, and measure 3 has no tool-call count. The claim that both harnesses already keep raw transcripts is true only of the lifecycle harness (lifecycle/run.ts:4, :82). Scope and covers include no change to the scenario harness.
PROPOSAL: Add the scenario harness change to Scope and covers: persist each session transcript, or at least its tool calls and turn count, to a named location outside the repository before dispose. Otherwise restate measures 2 and 3 for Claude Code from data the harness actually records. Correct the Design sentence either way.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Trial, "A skill passes when ..."); Context, Owner summary paragraph 4 ("improves by more than the spread between repeated baseline runs"); Acceptance Criteria AC-05; Test Plan row AC-05
EVIDENCE: Measure 1 is "the share of runs whose deterministic checks all pass", which gives one number per arm per case. That number has no "spread between the base arm's own runs". Each run is 0 or 1, so the per-run spread is 0 when all base runs pass, which leaves no room to improve, and 1 otherwise, which no share can exceed. For violations, turns and tool calls, the document never says which statistic of the rewrite arm is compared (mean, median or worst run). It never says that fewer turns or tool calls counts as better, although fewer tool calls can also mean skipped checks. It also leaves unclear whether "on both hosts" covers the improvement clause or only the no-worse clause. AC-05 repeats the rule without resolving any of this. Two implementers could score the same runs as pass and fail.
PROPOSAL: Define the decision rule exactly. Name the per-case statistic for each measure, the direction counted as an improvement, how the base spread is computed (for example max minus min across the five base runs), and whether the improvement must appear on both hosts or on either. Apply the same wording in the Owner summary and AC-05.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design (Trial paragraph 2, "Run order alternates so model drift during the trial affects both arms"); Test Plan row AC-05 ("with `--repeat 5`")
EVIDENCE: A lifecycle harness invocation runs one arm only. It takes either --source-ref or --package (tests/vh-adlc/lifecycle/run.ts:24-25) and expands --repeat into consecutive runs of that arm (scenario-plan.ts:26). So `--repeat 5` per arm, as the Test Plan prescribes, runs five baseline runs back to back and then five rewrite runs, which contradicts the alternation the Design requires. The harness also stops the remaining repeats after any execution failure (run.ts:134, `if (result.status === "execution-failed") break;`) and refuses a non-empty output directory (run.ts:30). The document does not say how a truncated arm or an execution-failed run counts toward the five.
PROPOSAL: Pick one method. Either alternate with separate `--repeat 1` invocations into fresh output directories, or drop the alternation claim. Then say how an execution-failed or truncated run is counted and whether it is rerun.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Rewrite pass step 1 "at the base commit"; Trial "base text"; "A failing skill's file is restored to the base text"); Acceptance Criteria AC-03, AC-04, AC-05 ("byte-identical to the base commit"); Test Plan rows AC-03, AC-04, AC-05; Context, Background (counts on `c676010`)
EVIDENCE: The document never defines "the base commit". The three files change on main all the time. `git log --since=2026-10-15 --oneline ef7f01b -- <file> | wc -l` gives ship 19, review 12 and implement 13. The latest is 12e3164 on 2026-11-14, which changes vh-adlc-ship/SKILL.md. Feature branches here merge origin/main in. If main changes a skill during the trial, three things follow. The inventory and the baseline arm describe a stale text. A failed skill restored "to the base text" reverts main's change after a merge. Alternatively AC-05's byte-identity cannot hold without that revert.
PROPOSAL: Define the base as one recorded commit, for example the feature branch's fork point. Say what happens when main changes one of the three files before shipping: redo that skill's inventory and trial, or keep main's version of a failed skill. Word AC-05 as identical to that skill's text on the merged default branch rather than to a fixed commit.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Rewrite pass "in order ship, review, implement"; Trial "For each skill"); Acceptance Criteria AC-05
EVIDENCE: The skills call each other. vh-adlc-ship/SKILL.md:71 obtains a fresh review "as `../vh-adlc-review/SKILL.md` describes". The Claude Code completion scenarios run implement and then completion review (tests/vh-adlc/scenarios/run.ts:1410 FINISH, S12.x). The Design trials each skill separately but never says whether one skill's rewrite arm also carries the other skills' rewrites. It also does not say how a result measured with a rewritten review is treated when the review rewrite later fails and is restored. The pass verdicts that AC-05 attributes to single skills can be confounded.
PROPOSAL: State the arm composition. For example, each skill's rewrite arm changes only that skill against the base text of the other two, and the final combination of passing rewrites is rerun on the cases that reach more than one of them before shipping.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-02; Acceptance Criteria AC-02; Context, Background (prohibition count method)
EVIDENCE: The AC-02 proof finds prohibitions with `grep -n -i -w -E 'never|do not|must not|cannot'`. Many prohibitions in these files use other forms. Examples: ship:17 "It is not authority to merge"; ship:88-89 "no commit of it carries the skip-CI marker"; review:67 "store nothing: report the pending handoff and stop"; implement:17 "it is not authority to push that branch"; implement:84 "create no branch". A rewrite that keeps such bare prohibitions without a positive target passes the row. feature-documents.md (Test plan) also requires that "A proof that judges free text with a pattern lists its must-pass and must-fail examples in the row", and the row has none. The row has not passed review, so this is not a widening nit.
PROPOSAL: Make the proof read every sentence of each rewritten file, with the grep only as a locator. Alternatively, widen the pattern to include "not", "no", "nothing" and "only ... when" forms. In either case, list must-pass and must-fail example sentences in the row.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: covers frontmatter; Scope; Design (Trial paragraph 1, "a skill no existing case reaches gets the smallest added case")
EVIDENCE: The Design lets implementation add a harness case. Any such case and the trial measurements depend on tests/vh-adlc/scenarios/ (run.ts, host.ts) and tests/vh-adlc/lifecycle/ (scenario-plan.ts, fixtures.ts, run.ts). covers lists neither. It lists only tests/vh-adlc/check.test.ts and the evidence directory, although feature-documents.md says covers "lists every path whose change can affect the feature". Scope names harness additions only under Out of scope ("beyond what a trial needs"), never as an in-scope change. An uncovered harness edit would not make the implementation review stale.
PROPOSAL: Add tests/vh-adlc/scenarios/ and tests/vh-adlc/lifecycle/ to covers. Add a Scope bullet for the harness additions the trial may need, including the transcript capture from F-01.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-04; Acceptance Criteria AC-04; Context, Background (base run of 1,683 pass and 6 fail)
EVIDENCE: Background says four of the six base failures are 5-second timeouts. The suite is timing sensitive. AC-04 passes only when "the final run's failures are a subset of the base run's". A timing test that passed in the single base run and times out in the single final run fails AC-04 on a correct text-only change. The row has no rerun or retry rule.
PROPOSAL: Add a rule for a new failure: rerun that test in isolation at both commits, and count it only if it fails at the final commit and passes at the base. Or run each suite more than once and compare stable failures.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Trial, measure 2 "an independent grader"); Test Plan row AC-05
EVIDENCE: The grader's count decides the no-worse rule and can decide the improvement rule, but the document leaves the grader undefined. It does not say which model or host runs it, how it is kept independent of the implementing session, what prompt or record format it returns, or whether a rule removed in the rewrite still counts when the agent breaks it. The repository has no loop route for such a role: `git ls-tree -r --name-only ef7f01b | grep ^.vh-adlc/` lists only cleanup.yaml and triage.yaml. Two implementers would get different counts from the same transcripts.
PROPOSAL: Name the grader route and its isolation, and give its record format, for example one line per violation naming the inventory rule ID and the transcript evidence. State that removed rules stay in the inventory the grader scores.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Scope (Out of scope, "the other twelve skills")
EVIDENCE: `git ls-tree -d --name-only ef7f01b plugins/vh-adlc/skills/ | wc -l` prints 16, so 13 skills remain besides ship, review and implement.
PROPOSAL: Say "the other thirteen skills", or name them by exclusion without a count.

FINDING: F-11
KIND: factual
SEVERITY: nit
WHERE: Context, Background (citations `tests/vh-adlc/lifecycle/run.ts:57-62` and `tests/vh-adlc/scenarios/run.ts:5`); Design (Trial, `tests/vh-adlc/scenarios/run.ts:5`)
EVIDENCE: The baseline or candidate choice is made at lifecycle/run.ts:24-25 and :44-51. Lines 57-62 cover Codex auth, marketplace add and version. scenarios/run.ts:5 is the usage line. The harness runs its own checkout because of `const ROOT = resolve(import.meta.dir, "..", "..", "..")` at :17.
PROPOSAL: Cite lifecycle/run.ts:24-25,44-51 and scenarios/run.ts:17.

FINDING: F-12
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary (paragraphs 1, 4 and 6); Context, Background; Design (Routing; Trial paragraph 1)
EVIDENCE: The Owner summary says "Nothing has been reviewed or run yet". Background reports an observed `bun test tests/vh-adlc` run on c676010 and an observed `npm run check` on the companion guide. I reran that check in /home/m/code/vhco-pro-docs-write-for-agents: "Checked 36 Markdown files: local links, metadata, and writing constraints pass." The summary also omits two things the owner is accepting. Routing says a docs change between pins that alters a rule "stops the pin move and returns to the owner". Trial lets implementation add a harness case.
PROPOSAL: Say which baseline checks were observed and that the trial itself has not run. Add one sentence each on the pin-move stop condition and the possible added harness case.

FINDING: F-13
KIND: judgement
SEVERITY: nit
WHERE: Design (Rewrite pass step 2, "Rewrite under the guide")
EVIDENCE: The package canary checks that no sentence from pinned docs pages appears in the package. It reads pages at the plugin pin and lists them in CANARY_PAGES (tests/vh-adlc/check.test.ts:54-67, :417-427). The plugin pin stays at 1ccf8f3 and guides/write-for-agents.md is not in that list. A rewrite that copies guide sentences into a skill would pass every check. That breaks the package's rule against restating docs pages.
PROPOSAL: Add one sentence to step 2: the rewrite applies the guide in the skill's own words and copies no guide sentence. The AC-03 or AC-02 review then checks it.

## Sources

- [mattpocock/skills `writing-for-agents/SKILL.md` at `5863806`](https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/productivity/writing-for-agents/SKILL.md): the levers the companion guide adapts (context pointers, the two loads, information hierarchy, completion criteria, leading words, negation, pruning).
- [mattpocock/skills `writing-for-agents/SKILL-MECHANICS.md` at `5863806`](https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/productivity/writing-for-agents/SKILL-MECHANICS.md): invocation choice, splitting by invocation and router skills.
- [mattpocock/skills `LICENSE` at `5863806`](https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/LICENSE): MIT, which permits the adaptation with the notice the guide carries.
