---
status: draft
status_description: "Draft after spec reviews R-1 to R-4; R-4 findings are recorded, not applied. On 2026-11-15 the owner moved this to its own session: apply what matters, ignore edge-case findings that only trigger re-review. Waits on the companion vhco-pro/docs guide PR."
issue: https://github.com/michielvha/vh-adlc/issues/100
goal: "vh-adlc's ship, review and implement skills are rewritten to one pinned standard for agent-read documents only where a controlled trial shows the rewrite makes agent runs better, with every rule kept or its removal recorded and accepted."
covers:
  - AGENTS.md
  - plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-review/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/direct-operation-compatibility.test.ts
  - tests/vh-adlc/blog.test.ts
  - tests/vh-adlc/docs-impact/integration.test.ts
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
`AGENTS.md` then routes skill, agent entry point, reviewer and reference authoring to that guide, and its pin moves
to the commit that merges it. If a docs change between the two pins alters a rule vh-adlc's
operations read, the pin move stops and comes back to you.

The second part is one rewrite pass over the ship, review and implement skills: state targets
positively and keep each needed prohibition beside its target, give each step a checkable end,
and delete sentences that change nothing. Every rule keeps its meaning or its removal is recorded and
accepted: a rule inventory maps each old rule to its new place, or records why it was removed, and an
independent reviewer checks it.
Phrases the package tests pin stay word for word, with the positive target added beside them.

You asked for proof that the rewrite is better, not just harmless. Each rewritten skill runs against
its original, five runs per arm on each host: the lifecycle harness on Codex CLI and the scenario
harness on Claude Code. The scenario harness currently deletes its session transcripts, so it gains
an opt-in setting that keeps them outside the repository; a skill no existing case reaches may also
get one small added case. Only cases that exercise a step the rewrite changed are used, as you chose.
Per case the trial compares passed runs, rule violations found by a grader that sees neither arm's
skill text, and median turns and tool calls. To keep chance from deciding, passed runs and violations
count only when they differ by at least two. A rewrite ships only if no case gets worse by that margin
on either host, and some case improves on either host: at least two more passed runs, at least two
fewer violations, or, as you chose, fewer median turns or tool calls by more than the original's own
run-to-run spread. Each skill is tried alone; passing rewrites are then tried together, and if that
combination is worse anywhere the trial stops and comes back to you before anything ships. A skill that fails keeps the default branch's text, and the result is recorded either way.

A test pins these skill bodies to versions you approved, so a rewrite that passes its trial still
needs you: as you chose, I show you each rewritten body's diff and you sign it off before that skill
gets its own pinned baseline in the test. A rewrite you do not sign off is reverted like a failed one.

Out of scope: the other skills, the reviewer agent, the references, the plugin's own docs pin,
consumer repositories and any new mechanical check.

Observed so far: the baseline package checks on `c676010` (1,683 pass, 6 fail in this environment)
and the companion guide's docs check. The trial has not run. Spec reviews R-1 and R-2 returned three
blocking and thirteen should-fix findings between them, and R-3 one blocking and three should-fix, all
applied with your answers; a fresh review is next. Accepting this authorizes the implementation, the harness setting and the trial runs on a
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
- `tests/vh-adlc/direct-operation-compatibility.test.ts:14` compares the ship, review and implement
  bodies, minus their Loop routes, Documentation impact and two ship sections, byte for byte with
  owner-approved baselines: `b313327b` for ship and review and `8d5a639b` for implement (`:6`, `:13`,
  `:16`); ship and review share the constant `baseline` with investigate, tasks and resume. When the owner
  approved new bodies before, the test gained a per-skill constant (`specSummaryBaseline`,
  `implementBaseline`) and a selector branch, with a comment naming the approval (`:7-13`). It strips
  ship's promotion and cleanup sections only from the current file (`:61-81`) and Loop routes and
  Documentation impact from both (`:86-94`), so a baseline commit that holds those sections fails even
  for an unchanged body (R-3 F-01). The same file pins Loop routes, Documentation impact, promotion and
  cleanup phrases (`:28-38`, `:54-80`) and requires the Generic intake section to be exactly "For generic
  vh-adlc requests without an operation name, follow `references/lifecycle.md`; then continue here."
  followed by "The plugin directory is two levels" (`:83-84`), which anchors the compared body (`:19`).
- Other tests pin phrases in these files: every scheduled operation must name
  `guides/humanize-prose.md` and `vh-adlc knowledge` (`tests/vh-adlc/check.test.ts:249-266`);
  implement must name `vh-adlc gate in-progress` and `vh-adlc gate complete`, and ship
  `vh-adlc gate complete` (`tests/vh-adlc/check.test.ts:44-45`, used at `:268-273`); review must name
  `model eligibility` and `unrequested default` and no model name (`tests/vh-adlc/check.test.ts:362-369`).
  The lifecycle fixtures look for a read of `vh-adlc-ship/SKILL.md` (`tests/vh-adlc/lifecycle/fixtures.ts:317`).
  Ship must contain `vh-adlc-blog promote`, match `/internal-only/i`, `/Do not.*draft|Never.*draft/`
  and `/PR.*release|release.*PR/` (`tests/vh-adlc/blog.test.ts:51-57`). Implement and ship must place
  `## Documentation impact` before `## Start` and keep phrases such as `committed HEAD`,
  `missing-page`, `--metadata-path` and `incomplete` in it (`tests/vh-adlc/docs-impact/integration.test.ts:18-24`).
  The blog runner sends agents to ship's "Article and promotion handoff" section by name
  (`tests/vh-adlc/blog/run.ts:70-71`).
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
  (`:1756-1760`), and builds the fixture plugin from that checkout (`tests/vh-adlc/fixtures/build.ts:25`,
  `:336-338`). Each session's profile, transcripts included, is deleted after the run: `session()`
  calls `p.dispose()` in a `finally` block (`:133-147`), which removes the profile directory
  (`tests/vh-adlc/scenarios/host.ts:37`). Its summary records turns and cost but no tool-call count
  (`tests/vh-adlc/scenarios/run.ts:1797-1798`) and is written to the tracked file
  `tests/vh-adlc/evidence/claude-code/<id>.md` (`:18`, `:1818`). A thrown error becomes a failed "the
  scenario ran" check (`:1773-1775`), and an error turn ends the session (`:141`).
- The lifecycle harness runs native Codex CLI trials against either a baseline source revision or a
  candidate package (`tests/vh-adlc/lifecycle/run.ts:1-3`, `:24-25`, `:44-51`), keeps each run's raw
  event log (`:82`), refuses a non-empty output directory (`:30`), and stops an arm's remaining repeats
  after an execution failure (`:134`). It marks a run `execution-failed` on the agent's own 720-second
  timeout, a nonzero exit or a `turn.failed` or `error` event (`:89`, `:124`,
  `tests/vh-adlc/lifecycle/fixtures.ts:450`). Without `--cases` it runs L01, L02, L04 and L05
  (`tests/vh-adlc/lifecycle/scenario-plan.ts:21`). It takes only `plugins/vh-adlc` from `--source-ref`
  and its driver, cases and grader from the checkout it runs in (`tests/vh-adlc/lifecycle/run.ts:14`,
  `:26`, `:32`, `:44-47`). Its event parser reads agent messages, command
  executions and MCP tool calls (`tests/vh-adlc/lifecycle/fixtures.ts:441-465`). Its plan repeats a case 1 to 10 times, consecutively
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
| Trial | Alternating harness runs of the cases that reach one skill, five on its base arm and five on its rewrite arm, on each host (AC-05). |
| Arm commit | A feature-branch commit holding the harness setting and any added cases: the base arm commit has every skill at its base text; a rewrite arm commit is the base arm commit plus one skill's rewrite (AC-05). |
| Sign-off | The owner's explicit approval of one rewritten skill body, given after its trial passes and recorded with its date in the trial summary (AC-06). |

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
- For each rewrite the owner signs off, a new per-skill baseline constant and selector branch in
  `tests/vh-adlc/direct-operation-compatibility.test.ts` naming the commit holding the approved body,
  with a comment naming this feature and the sign-off date, and the test stripping the promotion,
  cleanup and Issue labels sections from the baseline text as it does from the current text.
- A patch version bump in both plugin manifests when at least one rewrite ships.

Out of scope, by name: the other thirteen skills, `agents/vh-adlc-reviewer.agent.md`, every file under
`references/`, the plugin docs pin in `knowledge.md`, consumer repositories including Stackweaver,
a mechanical prose or negation checker, a word-count target, harness changes beyond the setting and
cases above, raw transcripts in the repository, and any claim of improvement beyond the cases run.

## Design

### Routing

`AGENTS.md` gains one sentence after the humanize line (`AGENTS.md:11`): write skills, agent entry
points, reviewer prompts and references an agent loads with `guides/write-for-agents.md`. The pin URL at `AGENTS.md:4`
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
4. Keep every phrase or pattern a test pins, word for word. Before rewriting, implementation searches
   `tests/` for every read of the three files, including template paths such as `vh-adlc-${name}`,
   and marks each pinned phrase in the inventory. A pinned prohibition stays verbatim and gains its
   positive target in the same or the preceding sentence.

A rule that moves to a shared reference is out of scope; the pass only edits the three files. The
files keep their frontmatter `name` and `description` unchanged, so discovery and invocation do not move.

When a merge from the default branch changes one of the three files before shipping, that skill's
base text becomes the merged text: its inventory, rewrite and trial are redone against it, or the
skill drops out and keeps the default branch's text.

### Trial harness

The scenario harness gains an opt-in environment setting naming a directory outside the repository.
When set, each invocation creates a per-run subdirectory there. Before `p.dispose()` each session
copies its transcript files from the profile's `projects` directory into it, and at the end the run
writes its summary, with each session's turn count and tool-call count from `toolUses`, into that
subdirectory instead of the tracked `tests/vh-adlc/evidence/claude-code/<id>.md`, which stays
untouched. When unset, behavior is unchanged. The lifecycle harness needs no
change: it already keeps each run's event log outside the repository.

### Trial

Cases. For each skill, implementation lists before running the steps the rewrite changed and the cases
whose prompts invoke the skill and whose deterministic checks cover at least one changed step: on Codex
CLI from the lifecycle cases (for ship, `L11-ship`), and on Claude Code from the scenario cases. Only
those cases run. A skill with no such case on a host gets one small added case there.

Arms. The base arm commit holds the harness setting, any added cases and every skill's base text; a
skill's rewrite arm commit adds only that skill's rewrite. Each case runs ten times per host,
alternating base and rewrite (base, rewrite, base, ...): on Codex CLI as separate lifecycle invocations,
one case each, run from a checkout at the base arm commit so both arms use the same driver and cases,
with `--cases <case> --repeat 1` into fresh, empty output directories outside the repository (`--candidate base-<n> --source-ref <base arm commit>` and `--candidate rewrite-<n>
--source-ref <rewrite arm commit>`); on Claude Code as one scenario harness invocation per run from a
worktree at the arm commit, with the transcript setting on.

Execution failure. A run is an execution failure, and is rerun, when the agent never started (on Codex
CLI, the event log has no `thread.started` event; on Claude Code, the harness failed before its first
session recorded a session id) or when the host's model service returned an error (a rate-limit,
overload or API error event or turn). An agent timeout, a nonzero exit after the agent started, a
`turn.failed` or `error` event, an error turn or a failed check is a failed run and counts. An arm
still short of five counted runs after three reruns makes the trial inconclusive, which counts as a
fail.

Measures, per case and host, over each arm's five completed runs:

1. passed runs: how many of the five passed every deterministic check;
2. violations: the total violation records the grader returned across the five transcripts;
3. median turns and median tool calls per run. On Codex CLI, turns are the run's agent-message events
   and tool calls its command-execution and MCP tool-call events, as the lifecycle parser reads them.
   On Claude Code, turns are the sum of every session's reported turn count in the run, and tool calls
   are every `toolUses` entry, subagent and reviewer calls included.

Grader. Each transcript is graded once by a fresh read-only subagent on the host running the trial,
with the host's default model. Before grading, a script replaces the loaded skill text in the
transcript (any block matching either arm's skill file, and the output of any read of a `SKILL.md`)
with `<SKILL TEXT REMOVED>`, and removes arm labels and paths that reveal the arm. The grader receives
that transcript and the skill's rule inventory, removed rules included, without the rewritten-file
locations. It returns
`VIOLATION: <rule ID> | <transcript line> | <one-line evidence>` per broken rule, or exactly
`NO VIOLATIONS`. A reply in any other form is regraded by a new subagent.

Decision. Within a case and host, the rewrite is worse when it has at least two fewer passed runs or at
least two more violations than the base, and no worse otherwise. It improves when it has at least two
more passed runs, at least two fewer violations, or a median turns or median tool calls lower than the
base median by more than the base arm's spread for that measure (largest minus smallest of its five
runs). A skill passes when it is no worse on every
case on both hosts and improves on at least one case on at least one host.

Combination. When two or more skills pass, an arm with all passing rewrites runs against the base on
every listed case that invokes more than one of them; it passes when it is no worse on every such case
on both hosts, and no improvement is required. When no listed case invokes more than one passing skill,
the combination is skipped and recorded as such. The grader scores a combined transcript against the
union of the inventories of the skills it loads. If the combined trial is worse anywhere, the trial
stops and returns to the owner before anything ships.

Sign-off. For each rewrite that passes, implementation shows the owner the diff of that skill's body
against its base text and the trial summary, and asks for sign-off. On sign-off, the test gains a
baseline constant for that skill, naming the commit holding the approved body, with a selector branch
and a comment naming this feature and the date; the test strips the promotion, cleanup and Issue labels
sections from the baseline text as it does from the current text. Without sign-off, the skill is set to
its base text like a failed one.

A failing skill's file is set to its base text on the feature branch, and its summary records why.
Each summary lists the base, every case, run, measure, spread and grader record. Raw transcripts and
event logs stay in the directories outside the repository.

### Failure and rollback

The change is text in the plugin payload plus an opt-in test setting. A consumer on the previous plugin
version keeps the old skills; reverting the PR restores them. No state, schema or binary format changes,
and concurrent sessions are unaffected until they update the plugin. A trial interrupted midway leaves
its completed runs in their output directories and is resumed by running the missing runs.

## Acceptance Criteria

- [ ] AC-01: `AGENTS.md` routes skill, agent entry point, reviewer prompt and agent-read reference authoring to
      `guides/write-for-agents.md`, and `vh-adlc knowledge` resolves that page at the pinned revision.
- [ ] AC-02: In each skill that ships rewritten, every prohibition is a hard guardrail with its
      positive target in the same sentence or the one before it, and every numbered step ends on a
      condition an agent can check.
- [ ] AC-03: Every rule in each rewritten skill's base text appears with the same meaning in the
      rewritten file, or its removal is recorded with a reason the reviewer accepts, in the rule
      inventory.
- [ ] AC-04: No plugin package check fails at the final commit that passes at the base, and the three
      skills' frontmatter `name` and `description` are unchanged.
- [ ] AC-05: Each skill that ships rewritten passed its trial and, when two or more passed, the
      combined trial, under the decision rule in Design. Every skill that did not pass is identical to
      its text on the default branch the feature branch last merged.
- [ ] AC-06: Each skill that ships rewritten has the owner's recorded sign-off and its own baseline
      constant in `direct-operation-compatibility.test.ts` naming the commit holding that approved body;
      every other skill keeps its current baseline, and the test passes at the final commit.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Read `AGENTS.md` at the final commit; run `vh-adlc knowledge --repo . --plugin-pin <plugin pin> --page guides/write-for-agents.md` and observe `result` `answered` with the new revision. |
| AC-02 | Independent implementation review reads every sentence and numbered step of each skill that ships rewritten at the final commit, using `grep -n -i -w -E 'never\|do not\|must not\|cannot\|not\|no\|nothing\|only'` only to locate candidates, and reports any prohibition without a positive target or step without a checkable end. Must pass: "Sync with `git fetch` and `git merge --ff-only`; never `git reset --hard` over changes you did not make." and "Push the feature branch only on an explicit ship request." Must fail: "It is not authority to merge." and "Do not skip the review." when no neighbouring sentence states the target. |
| AC-03 | Independent implementation review walks each rule inventory against the base text and the final file, and reports any rule whose meaning changed, any rule missing from the inventory, any removal reason it does not accept, and any sentence copied from `guides/write-for-agents.md`. |
| AC-04 | `bun test tests/vh-adlc` once at the base and once at the final commit in the same environment. Each test that fails only at the final commit is rerun alone three times at both commits and counts as a new failure only if it fails in at least two final runs and passes in at least two base runs; pass when there is none. `git diff <base> -- <three files>` shows no frontmatter change. |
| AC-05 | The trial summaries under `tests/vh-adlc/evidence/agent-document-writing/`, produced as Design describes (Codex CLI: `bun tests/vh-adlc/lifecycle/run.ts` with `--cases <case> --repeat 1` per run into fresh directories; Claude Code: `bun tests/vh-adlc/scenarios/run.ts` per run with the transcript setting on); independent implementation review recomputes each skill's verdict and the combined verdict from the recorded measures and grader records, and `git diff <M> HEAD -- <file>` is empty for each skill that did not pass, where `<M>` is the default-branch commit the feature branch last merged (the second parent of its last merge from the default branch, or the fork point when there was none). |
| AC-06 | Read each trial summary's sign-off record and `git diff <base> -- tests/vh-adlc/direct-operation-compatibility.test.ts`; pass when exactly the signed-off skills gained their own constant and selector branch, each naming a commit whose body equals the shipped one, the other constants are unchanged, and `bun test tests/vh-adlc/direct-operation-compatibility.test.ts` passes at the final commit. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-15 | R-1 | spec | `ef7f01b8b85a78c3c26aebb77aab526eed13d54a` | claude-opus-5-5 | procedural | One blocking, eight should-fix and four nit findings |
| 2026-11-15 | R-2 | spec | `b34ba95382ee1ceb78d0c6c2ac5d751dc65b0ff3` | claude-opus-5-5 | procedural | Two blocking, five should-fix and two nit findings |
| 2026-11-15 | R-3 | spec | `09de0c3e2a106f48ae3f72e8859362a9193cc308` | claude-opus-5-5 | procedural | One blocking, three should-fix and six nit findings |
| 2026-11-15 | R-4 | spec | `fc1b66539fc6b13d92d6473230911e8fbaf31691` | claude-opus-5-5 | procedural | Eight should-fix and three nit findings |

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

### R-2

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Acceptance Criteria AC-04; Test Plan row AC-04; Scope; covers frontmatter; Context, Background (package checks bullet); Design (Rewrite pass step 4)
EVIDENCE: tests/vh-adlc/direct-operation-compatibility.test.ts:14 runs `test.each(["investigate", "spec", "tasks", "implement", "review", "ship", "resume"])("direct %s keeps its approved operation body", ...)`. It removes only the Loop routes, Documentation impact, ship's Article and promotion handoff and After an authorized merge sections, then asserts `expect(body(current)).toBe(body(previous))` against the owner-approved baselines `b313327b...` (ship, review) and `8d5a639b...` (implement) (lines 6, 13, 16, 94). Any rewrite of those bodies fails the test. I ran `bun test tests/vh-adlc/direct-operation-compatibility.test.ts` at b34ba95: it passes now. AC-04 says "No plugin package check fails at the final commit that passes at the base". With this test unchanged, AC-04 cannot be met by any rewrite that ships. Changing the test's baselines would re-approve the operation bodies, and the test file is not in covers or Scope. Background lists the pinned phrases but never names this test. The R-1 document had the same gap; this revision did not introduce it.
PROPOSAL: Name direct-operation-compatibility.test.ts in Background, Scope and covers. Say how its approved-body baseline moves for each rewrite that passes and stays for each skill that fails. Moving a baseline the owner approved is a judgement for the owner, so raise it as an Open Question.

FINDING: F-02
KIND: judgement
SEVERITY: blocking
WHERE: Acceptance Criteria AC-02 and AC-05; Test Plan row AC-02; Design (Trial, "A failing skill's file is set to its base text"); Context, Owner summary paragraph 4 ("A skill that fails keeps the default branch's text")
EVIDENCE: AC-02 covers "the three skills as shipped". AC-05 and Design require a skill that fails its trial to stay identical to its default-branch text. The base text breaks AC-02. For example, plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:102 is a standalone paragraph, "Never merge, and never bypass branch protection or rewrite a pushed commit.", and the sentence before it (line 100) is itself the prohibition "Never report a result you did not see." That is the bare stack the AC-02 row lists as must-fail. Design step 2 also adds checkable ends "where the current step has none", which admits that base steps lack them. So whenever a skill fails its trial, which the design treats as an expected result, AC-02 cannot be met and the feature cannot complete. This traces to the previous revision, which changed AC-02 from "In the three rewritten skills" (ef7f01b) to "In the three skills as shipped".
PROPOSAL: Limit AC-02 to the skills that ship rewritten, as AC-05 already distinguishes them, and word the AC-02 Test Plan row the same way.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Context, Background (package checks bullet); Design (Rewrite pass step 4, "Keep every phrase listed in Background that a package check pins"); covers frontmatter
EVIDENCE: Background names only check.test.ts and lifecycle/fixtures.ts, but other tests also pin text in these skills. tests/vh-adlc/blog.test.ts:51-57 requires ship to contain "vh-adlc-blog promote", match /internal-only/i and match /Do not.*draft|Never.*draft/. tests/vh-adlc/docs-impact/integration.test.ts:18-24 requires implement and ship to place "## Documentation impact" before "## Start" and to contain "committed HEAD", "missing-page", "--metadata-path", "incomplete" and other phrases. direct-operation-compatibility.test.ts:28-38 and 54-80 pins Loop routes phrases ("replace Enter steps 1 and 6", "replaces the documentation-only skip-marker rule", "verification rungs"), Documentation impact phrases ("before ticking/committing", "owner-authorized", "no completion"), ship promotion text ("Do not invoke", "do not make promotion a feature gate") and cleanup text ("does not authorize a"). Some of these pinned phrases are bare prohibitions that AC-02's rewrite would otherwise restate, so step 4, which relies on the Background list, leaves them out. None of these files is in covers.
PROPOSAL: List every test that pins text in the three skills, with each pinned phrase or pattern, and add those test files to covers. Say that a pinned prohibition stays verbatim and gains its positive target beside it.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Trial, Arms, "one scenario harness invocation per run from a worktree at the arm's commit"; Trial harness, "records ... in the run summary"); Test Plan row AC-05; Scope (opt-in setting bullet); Context, Owner summary paragraph 4
EVIDENCE: The scenario harness runs the checkout it sits in (`const ROOT` at tests/vh-adlc/scenarios/run.ts:17) and builds the fixture plugin from that checkout (tests/vh-adlc/fixtures/build.ts:25, :336-338). The document never defines the base arm's commit. If it is the recorded base, the fork point, that worktree has neither the new transcript setting nor any added case, so the base arm yields no transcript and no tool-call count. Also, each invocation writes its summary to the tracked file `tests/vh-adlc/evidence/claude-code/<id>.md` (run.ts:18, :1820 `writeFileSync(join(EVIDENCE, `${s.id}.md`), text)`). The next run overwrites it, so the per-run turn and tool-call counts the Design records "in the run summary" do not survive five runs per arm, and each run leaves tracked files modified in its worktree. This traces to the previous revision's addition of the transcript setting (R-1 F-01) to a run method that uses a worktree per arm.
PROPOSAL: Define each arm's commit, for example a feature-branch commit that holds the harness setting and added cases with the base or rewritten skill text. Have the setting write each run's turns and tool calls into its per-run directory outside the repository, not into the tracked summary, and say how the tracked evidence files are left afterwards.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Trial, Measures item 3; Decision); Context, Owner summary paragraph 4; Acceptance Criteria AC-05
EVIDENCE: Measure 3 is "median turns and median tool calls per run, from the host's transcript or event log". On Codex the lifecycle event log parser (tests/vh-adlc/lifecycle/fixtures.ts:441-465) reads thread, agent messages, command executions and MCP calls. `codex exec --json` gives one turn per prompt, so "turns" is either constant per case or undefined. On Claude Code a scenario run can hold several sessions and turns (for example run.ts:867 and :873), and the summary prints turns per turn as a list (run.ts:1797). The document does not say whether a run's turns is the sum, and does not say whether subagent tool calls, which `toolUses` includes (host.ts ToolUse.subagent), count toward tool calls. The improvement clause can rest on this measure alone, so two implementers could score the same runs differently. This traces to the previous revision's restatement of the decision rule (R-1 F-02).
PROPOSAL: Define turns and tool calls per host: the Codex event types counted, how a scenario run with several sessions sums its turns, and whether subagent and reviewer tool calls count.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Trial, Grader, "arm labels and paths that reveal the arm removed"); Context, Owner summary paragraph 4 ("a blind grader")
EVIDENCE: Removing labels and paths does not hide the arm. A transcript carries the skill text the agent loaded: Claude Code injects the invoked skill's SKILL.md body into the session transcript, and the Codex lifecycle checks require a command that reads `vh-adlc-ship/SKILL.md` (tests/vh-adlc/lifecycle/fixtures.ts:317), whose `aggregated_output` the event log keeps (fixtures.ts:454). The grader also receives the rule inventory, which records each rule's new line in the rewritten file. It can therefore tell base from rewrite in every transcript. The violation count decides the no-worse rule, so a grader that is not blind can bias the verdict. This traces to the previous revision's grader definition (R-1 F-09).
PROPOSAL: Redact the loaded skill text from each transcript before grading, give the grader the inventory without new-line locations, or drop the claim that the grader is blind from the Owner summary and Design.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Trial, Arms, "A run that ends as an execution failure (the harness or host failed before the agent finished) is rerun"); Test Plan row AC-05
EVIDENCE: The lifecycle harness sets `status: "execution-failed"` for `timeout || exitCode !== 0 || parsed.failed` (tests/vh-adlc/lifecycle/run.ts:117). The timeout is the agent's own 720-second limit (run.ts:88), and `parsed.failed` is set on any `turn.failed` or `error` event (fixtures.ts:450). These are agent behaviour, not only harness or host failure. If the harness status is used, a rewrite that makes the agent run past the limit gets its slow runs rerun and dropped from the five scored runs. The scenario harness has no execution-failure status at all: a thrown error becomes a failed "the scenario ran" check (run.ts:1773-1775), and an `isError` turn ends the session (run.ts:141). Two implementers would classify the same runs differently. This traces to the previous revision's rerun rule (R-1 F-03).
PROPOSAL: Define execution failure per host from observable fields, and state that an agent timeout or a failed agent turn counts as a failed run rather than a rerun.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Context, Background (package checks bullet, "every content and scheduled operation must name `guides/humanize-prose.md` and `vh-adlc knowledge`")
EVIDENCE: tests/vh-adlc/check.test.ts:249-266 checks those two phrases inside `for (const op of SCHEDULED)`. Content operations (blog, diagram, docs-impact) are checked at :241-246 only for their name and the absence of a model field.
PROPOSAL: Say "every scheduled operation", which covers ship, review and implement.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Design (Trial, Arms, the lifecycle command); Test Plan row AC-05
EVIDENCE: The command given, `--candidate base-<n> --source-ref <base>` or `--candidate rewrite-<n> --package <dir>` with `--repeat 1`, names no case. Without `--cases` the plan runs L01, L02, L04 and L05 (tests/vh-adlc/lifecycle/scenario-plan.ts:21), and an execution failure stops the remaining cases of that invocation (run.ts:134). The Design's own case list, for example `L11-ship`, needs `--cases`.
PROPOSAL: Add `--cases <case>` to the lifecycle command in Design and in the Test Plan row, one case per invocation.

### R-3

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design (Trial, Sign-off); Scope (baseline constant bullet); Acceptance Criteria AC-04 and AC-06; Test Plan rows AC-04 and AC-06; Context, Background (direct-operation-compatibility bullet, "the baseline constant moved to the commit holding the approved text"); Context, Owner summary paragraph 4 ("before its pinned baseline moves")
EVIDENCE: The test does not compare the two texts the same way. tests/vh-adlc/direct-operation-compatibility.test.ts:61-81 removes ship's "## Article and promotion handoff" and "## After an authorized merge" sections only from the current file. Lines 86-94 remove only Loop routes and Documentation impact from the baseline text. That works today only because the ship baseline b313327b has neither section (`git show b313327b:plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md | grep '^## '` gives Start, Make the feature shippable, Deliver, Report). Ship and review also share one constant, `baseline`, with investigate, tasks and resume (:6, :14, :16). The precedent at :7-13 added new per-skill constants (`specSummaryBaseline`, `implementBaseline`) and a selector branch; it did not move a constant. I copied the test to /tmp, set `baseline` and `implementBaseline` to 09de0c3e (so the bodies are identical to the current ones) and ran it: 5 pass, 2 fail. Investigate fails because the new baseline has "## Issue labels". Ship fails because the new baseline has "## Article and promotion handoff". So if ship's baseline moves "to the commit holding the approved body", as Design and Scope require, the test fails even for an unchanged body, and AC-06's proof (`bun test tests/vh-adlc/direct-operation-compatibility.test.ts` passes) and AC-04 cannot be met. If the shared constant moves for ship or review, it also breaks investigate and contradicts AC-06's "every other skill's baseline is unchanged". This traces to the previous revision, which added the sign-off baseline move to answer R-2 F-01.
PROPOSAL: Say in Scope and Design that each signed-off skill gets its own baseline constant and selector branch, and that the test strips the promotion and cleanup sections (and Issue labels where present) from the baseline text as it does from the current text. Then word AC-06 and its row to accept that test change. Correct the Background sentence about how earlier approvals moved the baseline.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Trial, Decision; Measures; Execution failure); Acceptance Criteria AC-05; Test Plan row AC-05; Context, Owner summary paragraph 3 ("You asked for proof that the rewrite is better")
EVIDENCE: Passed runs and violations are compared as raw totals over five runs, with no margin. "No worse" must hold on every case on both hosts, and one improvement on any case and host is enough. Only turns and tool calls get a margin (the base spread). Implement is reached by about ten scenario invocations (`grep -c 'vh-adlc-implement\|FINISH' tests/vh-adlc/scenarios/run.ts` gives 10), plus the "Binary unavailable" case for each operation (run.ts:603) and the Codex cases. That is roughly twenty case and host pairs. A single extra grader-reported violation, or one failed run, in any one base or rewrite arm decides the verdict. A failed run includes a hosted-service error turn after the session started, which the Execution failure rule counts rather than reruns. A rewrite with no real effect therefore passes when chance gives it one fewer violation on one case, and fails when chance goes the other way on any of the twenty pairs. The verdict can come out green or red while the question the owner asked, whether the rewrite is better, stays unanswered.
PROPOSAL: Raise an Open Question on noise handling. Options: require a margin for passed runs and violations in both the no-worse and the improves clauses (for example a difference larger than the base arm's spread, or at least two), limit the cases to those that load the skill's changed steps, or keep the rule and drop the claim that the trial proves the rewrite is better. Also decide whether a hosted-service error after start is rerun.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Trial, Combination; Grader); Acceptance Criteria AC-05; Test Plan row AC-05; Context, Owner summary paragraph 3 ("passing rewrites are then tried together")
EVIDENCE: The combined trial runs "on every case that reaches more than one of them, under the same rules". The same rules include "improves on at least one case on at least one host". The document does not say what happens when no listed case reaches more than one of the passing skills, for example if only ship and implement pass and the ship cases (L11-ship, the SHIP() S13 scenarios at run.ts:1590) do not run implement. One implementer would score an empty combined trial as a pass with nothing to check. Another would score it as a fail, because the improvement clause cannot hold, and then "the trial stops and returns to the owner". It is also unclear whether the combined arm has to improve again or only be no worse. The Grader paragraph gives the grader "the skill's rule inventory", which does not say which inventory, or which union of inventories, grades a combined transcript that loads two rewritten skills.
PROPOSAL: Define the combined pass rule (for example no worse only), what happens when no case reaches more than one passing skill, and which inventories the grader scores combined transcripts against.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-05 ("`git diff origin/<default branch> -- <file>` after the last merge is empty"); Acceptance Criteria AC-05
EVIDENCE: AC-05 asks that a failed skill be identical to "its text on the default branch the feature branch last merged". The row compares the file with the current origin/<default branch>, not with the commit that was merged. The three files change often: 19, 12 and 13 commits since 2026-10-15 (`git log --since=2026-10-15 --oneline ef7f01b -- <file> | wc -l`, verified). If main changes a failed skill after the last merge and before the implementation review, the row's diff is non-empty although AC-05 holds. The words "after the last merge" can be read as a point in time or as the comparison commit, so two reviewers would run different commands.
PROPOSAL: Compare against the default-branch commit the feature branch last merged, for example `git diff <that merge's second parent> HEAD -- <file>`, and name it in the row.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context, Background (scenario harness bullet `:1820`; lifecycle harness bullet `:88`, `:117`)
EVIDENCE: At 09de0c3e, tests/vh-adlc/scenarios/run.ts:1820 is `const kept = SCRATCH.splice(0);`. The `writeFileSync(join(EVIDENCE, ...))` is at :1818. In tests/vh-adlc/lifecycle/run.ts, :88 is the `Bun.spawn` call and the 720-second timer is at :89. :117 is `const unchangedPackage = ...` and the `execution-failed` status is set at :124.
PROPOSAL: Cite scenarios/run.ts:1818 and lifecycle/run.ts:89 and :124.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context, Background (direct-operation-compatibility bullet and "Other tests pin phrases" bullet); Design (Rewrite pass step 4)
EVIDENCE: The pinned-text list leaves out two pins that step 4's search would have to find. tests/vh-adlc/direct-operation-compatibility.test.ts:83-84 requires the Generic intake section to be exactly "For generic vh-adlc requests without an operation name, follow `references/lifecycle.md`; then continue here." and to be followed directly by "The plugin directory is two levels". That sentence also anchors the compared body (:19). tests/vh-adlc/blog/run.ts:70-71 sends agents to the ship skill's "Article and promotion handoff section" by name.
PROPOSAL: Add these two pins to the Background list so the inventory marks them.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: frontmatter goal ("with every rule kept"); Context, Owner summary paragraph 2 ("Every rule keeps its meaning"); Design (Rewrite pass steps 2 and 3)
EVIDENCE: Design step 2 deletes "sentences that change nothing" and step 3 records rules as `removed` with a reason. AC-03 accepts a recorded removal. The goal says every rule is kept, and the Owner summary says every rule keeps its meaning before it mentions removals.
PROPOSAL: Word the goal and the summary sentence as "every rule kept or its removal recorded and accepted".

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary paragraph 3; Design (Trial, Combination)
EVIDENCE: Design says "If that combined trial fails, the trial stops and returns to the owner before anything ships." The summary says only that passing rewrites "are then tried together" and leaves out this stop, which the owner is accepting.
PROPOSAL: Add one sentence on the combined-trial stop to the summary.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Design (Routing); Scope (AGENTS.md bullet); Acceptance Criteria AC-01
EVIDENCE: The companion route in /home/m/code/vhco-pro-docs-write-for-agents/AGENTS.md (uncommitted diff) reads "Write skills, agent entry points, reviewer prompts and references an agent loads". Guide line 10 applies to agent entry points (`AGENTS.md`, `CLAUDE.md`). The planned route for this repository's AGENTS.md leaves out entry points, although AGENTS.md is itself one.
PROPOSAL: Include agent entry points in the route sentence and AC-01, or say why this repository leaves them out.

FINDING: F-10
KIND: judgement
SEVERITY: nit
WHERE: Design (Trial, Arms; Glossary "Arm commit")
EVIDENCE: The lifecycle harness takes its driver, case list and grader from the checkout it runs in (tests/vh-adlc/lifecycle/run.ts:14, :26, :32 copies `import.meta.dir`). It takes only `plugins/vh-adlc` from `--source-ref` (`git archive sourceRef plugins/vh-adlc`, :44-47). A lifecycle case added on the arm commits is therefore used only when the invocation runs from a checkout that already has it. Design names the arm commit only through `--source-ref`, and says a worktree at the arm commit only for Claude Code.
PROPOSAL: Say that the Codex invocations for both arms run from a checkout at the base arm commit, so both arms use the same driver and any added case.

### R-4

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Trial, Execution failure); Test Plan row AC-05
EVIDENCE: The paragraph says a run is rerun "when the host's model service returned an error (a rate-limit, overload or API error event or turn)". The next sentence says "a `turn.failed` or `error` event, an error turn or a failed check is a failed run and counts". These are the same observables. On Codex CLI the parser sets failed on any `turn.failed` or `error` event and records nothing else about it (tests/vh-adlc/lifecycle/fixtures.ts:450), and a rate limit or overload arrives as one of those events. On Claude Code a service error comes back as a Turn with isError true (tests/vh-adlc/scenarios/host.ts:119), which is the "error turn" the counting clause names. The document gives no field or message pattern that separates a service error, which is rerun, from an agent error, which counts. One implementer reruns an overloaded run and another scores it as a failed run, and a single failed run moves passed runs toward the two-run margin. This traces to the previous revision, which added the model-service clause when it answered R-3 F-02.
PROPOSAL: Name the exact distinguishing evidence per host, for example the error message classes or HTTP statuses (429, 529, 5xx) in the Codex event and in the Claude Code result text, and state that an error event or error turn without that evidence counts as a failed run.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Trial, Cases, "cases whose prompts invoke the skill"; Trial, Combination, "every listed case that invokes more than one of them"); Context, Owner summary paragraph 3 ("Only cases that exercise a step the rewrite changed"); Acceptance Criteria AC-05
EVIDENCE: Two of the three skills are mostly loaded by another skill, not by a prompt. Ship step 1 loads review mid-run: "Obtain a fresh one in this run, as `../vh-adlc-review/SKILL.md` describes" (plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:70-71). The FINISH prompt is "/vh-adlc-implement greeting-name ... If it is finished, mark it complete" (tests/vh-adlc/scenarios/run.ts:1410), and implement then routes to completion review (plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:124-127). Background says these scenarios "run implement and then completion review". If "invoke" means the prompt names the skill, the review trial drops every case where ship or implement loads review, and the combination almost never runs, because no listed prompt names two skills; it is then "skipped and recorded as such", which defeats the confounding check R-1 F-05 asked for. If "invoke" means the run loads the skill, both run. The Owner summary uses a third wording, "exercise a step". The previous revision changed "reach" to "invoke" in both paragraphs.
PROPOSAL: Define the case set as cases whose run loads the skill, observed as a read or injection of its SKILL.md in the transcript or event log, whether the prompt or another skill caused it, and use the same word in Cases, Combination and the Owner summary.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Scope (bullet "At most one added harness case per skill that no existing case reaches"); Design (Trial, Cases, "A skill with no such case on a host gets one small added case there"); Context, Owner summary paragraph 3 ("a skill no existing case reaches may also get one small added case")
EVIDENCE: Design adds a case per host, so a skill with no qualifying case on either host gets two, while Scope allows at most one per skill. Design's trigger is "no such case", meaning no case that invokes the skill and whose deterministic checks cover a changed step. Scope and the summary trigger only when "no existing case reaches" the skill. Example: L11-ship reaches ship on Codex, but if the rewrite changes only steps L11-ship does not check, Design requires a new case and Scope forbids it. The previous revision narrowed the Cases rule (answer to R-3 F-02) without updating Scope or the summary.
PROPOSAL: Make Scope and the summary say at most one added case per skill per host, added when no existing case on that host invokes the skill and checks a changed step.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-05; Acceptance Criteria AC-05; Design (Trial, Cases; the paragraph "Each summary lists the base, every case, run, measure, spread and grader record")
EVIDENCE: The AC-05 proof only "recomputes each skill's verdict and the combined verdict from the recorded measures and grader records". It never checks the case list, which the implementing session draws up itself by judging which changed steps each case's deterministic checks cover, and which now limits which cases run at all ("Only those cases run"). Leaving out a case where the rewrite does worse, or adding a case tailored after the rewrite was written, passes the proof. Nor does the proof check that the recorded passed runs, turns and tool calls match the raw logs, or that the grader saw redacted transcripts. The summaries do not record where the raw transcripts and event logs are kept, so the reviewer cannot find them. A proof that checks only arithmetic over self-reported numbers can pass on a wrong implementation. This traces to the previous revision's case filter.
PROPOSAL: Record each changed step and, for every case on each host that loads the skill, whether its checks cover a changed step and why; record the raw output directory of every run. Have the AC-05 review check the case list against the rewrite diff and the harness checks, and recompute at least passed runs, turns and tool calls from the raw logs.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan rows AC-04 and AC-06; Acceptance Criteria AC-04 and AC-06 ("every other skill keeps its current baseline"); Context, Terminology and delivery (Base)
EVIDENCE: Base is "the feature branch's fork point", and the AC-04 and AC-06 rows diff against `<base>`, while the feature branch merges the default branch (Design, Rewrite pass). The compatibility test churns on main: `git log --since=2026-10-15 -- tests/vh-adlc/direct-operation-compatibility.test.ts` lists ten commits, five of them on 2026-11-14 moving the spec and implement constants. After a merge that brings one of those moves in, `git diff <base> -- tests/vh-adlc/direct-operation-compatibility.test.ts` shows another constant changed, and the AC-06 row ("the other constants are unchanged") fails a correct implementation. The previous revision added that clause. AC-04 has the same gap: `git diff <base> -- <three files>` shows main's own frontmatter edits, and the base suite run misses failures main introduced. The AC-05 row already handles this with `<M>`, the default-branch commit last merged.
PROPOSAL: Compare in the AC-04 and AC-06 rows against `<M>` as the AC-05 row defines it, and run the AC-04 base suite at `<M>`.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Trial, Combination; Trial, Sign-off); Acceptance Criteria AC-05; Context, Owner summary paragraphs 3 and 4
EVIDENCE: Combination runs "an arm with all passing rewrites". Sign-off then lets the owner decline any one of them, and "the skill is set to its base text like a failed one". When three skills pass and the combination of all three passes, but the owner declines review, the shipped pair (ship and implement with base review) was never tried together. Design neither says whether the combination is rerun on the remaining set nor orders sign-off before or after the combination. AC-05 asks only that the combined trial passed "when two or more passed", which the three-skill run satisfies. The same gap opens when the combined trial is worse, the owner is consulted, and a subset goes ahead. One implementer reruns the combination on the shipped set; another ships on the earlier result.
PROPOSAL: Run the combined trial on the exact set that will ship, after sign-off, and word AC-05 as "the combined trial of the skills that ship rewritten".

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Routing, "whether it changes any rule this repository's operations read"); Context, Owner summary paragraph 2 ("alters a rule vh-adlc's operations read"); Scope (AGENTS.md bullet); Acceptance Criteria AC-01
EVIDENCE: The commits between the pins are already known. In /home/m/code/vhco-pro-docs-write-for-agents, `git log --no-merges 1ccf8f3..origin/main` lists cdf5e62 and 0635c1f (delivery: private repository CI) and three PHP commits, and `git diff --stat 1ccf8f3 origin/main` touches conventions/delivery.md (+39), conventions/repository-security.md, AGENTS.md and guides/onboard-a-repository.md. The new delivery section adds a rule addressed to vh-adlc: "In the vh-adlc loop, declare the command as a verification rung and set `ci_trigger: manual`". The ship, review and implement skills all read conventions/delivery.md (vh-adlc-ship/SKILL.md:59, vh-adlc-review/SKILL.md:31, vh-adlc-implement/SKILL.md:58), and `vh-adlc knowledge` here reports source "repository", so the moved pin governs them. michielvha/vh-adlc is public (`gh repo view` reports PUBLIC), so the private-repository rule may not apply here. Under the summary's test ("a rule vh-adlc's operations read") the move stops; under Design's ("this repository's operations") it may not. Two implementers decide differently, and a stop leaves AC-01 unmet with no defined path.
PROPOSAL: Use one wording in both places, list the five known commits with the verdict for each, and if any changes a rule raise it now as an Open Question rather than at implementation time.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Scope (bullets "A patch version bump in both plugin manifests" and "An opt-in setting in the Claude Code scenario harness"); Design (Trial harness, "When unset, behavior is unchanged"; Failure and rollback, "A consumer on the previous plugin version keeps the old skills"); Acceptance Criteria; Test Plan
EVIDENCE: No criterion covers the version bump, and no test enforces one: `grep -n version tests/vh-adlc/check.test.ts` finds no manifest bump check, and both manifests read 0.23.0 (plugins/vh-adlc/plugin.json:4, plugins/vh-adlc/.claude-plugin/plugin.json:3). Hosts cache the plugin by version (the installed copy here sits under .../vh-adlc/0.23.0), so a rewrite shipped without the bump does not reach consumers who already hold that version, and every AC can still be met. The harness setting's promise that unset behavior is unchanged, including that tracked tests/vh-adlc/evidence/claude-code/<id>.md files are still written (run.ts:1818), is also outside every criterion; the scenario harness is not part of `bun test`, so AC-04 does not cover it.
PROPOSAL: Add a criterion that both manifests carry the same patch-bumped version when at least one rewrite ships, and the same version otherwise, with a Test Plan row; add a check or written procedure showing the scenario harness without the setting writes the same files as before.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Scope (bullet "One rewrite pass ... preserving every rule's meaning")
EVIDENCE: Design steps 2 and 3 delete sentences and record removals, and AC-03 accepts an accepted removal. R-3 F-07 aligned the goal and the Owner summary to "every rule kept or its removal recorded and accepted", but the Scope bullet still says "preserving every rule's meaning".
PROPOSAL: Word the Scope bullet as "keeping every rule's meaning or recording and accepting its removal".

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: covers frontmatter
EVIDENCE: Background names tests/vh-adlc/blog/run.ts:70-71 as pinning ship's "Article and promotion handoff" section, and the scenario harness builds its fixture plugin from tests/vh-adlc/fixtures/build.ts (:25, :336-338). tests/vh-adlc/review-convergence.test.ts:20-29 resolves pages at the repository pin in AGENTS.md, which this feature moves. None of tests/vh-adlc/blog/, tests/vh-adlc/fixtures/ or tests/vh-adlc/review-convergence.test.ts is in covers.
PROPOSAL: Add those paths to covers.

FINDING: F-11
KIND: factual
SEVERITY: nit
WHERE: Design (Trial, Measures item 3, "tool calls its command-execution and MCP tool-call events, as the lifecycle parser reads them")
EVIDENCE: The parser pushes an MCP call on both `item.started` and `item.completed` (tests/vh-adlc/lifecycle/fixtures.ts:456-458), and a successful `github.fetch` a third time (:459-462). It records command executions once, on `item.completed` (:453-455). Counting the parser's entries counts each MCP call two or three times; counting distinct calls does not.
PROPOSAL: Say tool calls are distinct command-execution items plus distinct MCP tool-call item ids, each counted once.

## Sources

- [mattpocock/skills `writing-for-agents/SKILL.md` at `5863806`](https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/productivity/writing-for-agents/SKILL.md): the levers the companion guide adapts (context pointers, the two loads, information hierarchy, completion criteria, leading words, negation, pruning).
- [mattpocock/skills `writing-for-agents/SKILL-MECHANICS.md` at `5863806`](https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/productivity/writing-for-agents/SKILL-MECHANICS.md): invocation choice, splitting by invocation and router skills.
- [mattpocock/skills `LICENSE` at `5863806`](https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/LICENSE): MIT, which permits the adaptation with the notice the guide carries.
