---
status: draft
status_description: "R-1 was blocking; its judgement findings are Open Questions Q4 to Q11 for the owner before the revision."
issue: null
goal: "A criterion whose proof depends on what an agent session does can be met in an independent implementation review, because the reviewer can repeat the proof itself."
covers:
  - plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md
  - plugins/vh-adlc/references/review-protocol.md
  - plugins/vh-adlc/skills/vh-adlc-implement/
  - plugins/vh-adlc/skills/vh-adlc-spec/
  - plugins/vh-adlc/knowledge.md
  - plugins/vh-adlc/references/security-settings.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - AGENTS.md
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - tests/vh-adlc/agent-proofs.test.ts
  - tests/vh-adlc/scenarios/run.ts
  - tests/vh-adlc/evidence/agent-proofs/
  - tests/vh-adlc/direct-operation-compatibility.test.ts
---

# Plan: Reproducible agent proofs

Proofs that depend on what an agent session does become runs a reviewer can repeat: a committed runner,
kept transcripts and a recorded commit. The implement and review operations use them, so such criteria can
reach `met` in an independent review.

## Context

### Owner summary

Some criteria can only be proved by watching an agent work: a reviewer rating a seeded finding, an author
applying a review pass. Today an implementer can run those trials as dispatched subagents and tick the
criteria from their reports. The independent reviewer then has nothing it can run and nothing it can
check, so it must return `not verified`. In `spec-review-convergence`, R-20 did exactly that for eight of
ten criteria. The fix that worked there was a committed runner that starts each trial as a fresh headless
session and keeps its transcript. With it, R-22 to R-24 reran every trial themselves and returned `met`.

This feature makes that the rule for every adopter:

- The Test Plan names a committed runner for every proof that runs an agent session, with its fixtures and
  pass condition.
- The implement operation proves such criteria only through that runner. It runs it at a commit with no
  uncommitted change to the text the session reads, and keeps the transcripts. A run counts only for the
  text it ran on.
- A review dispatch never tells the reviewer to skip a check. It says how to run the harnesses and where
  kept transcripts are.
- The reviewer repeats agent-session proofs with the runner rather than trusting a stored summary.
- A proof that needs a person, such as a GUI pass, can be met from its raw transcripts when their sha256
  values match the recorded ones.
- Transcripts are committed as redacted copies, with raw and redacted sha256 values in a manifest; the raw
  files stay on the machine that ran them.

The Test Plan rule and the transcript sentence for `met` go into the shared feature-document convention
in `vhco-pro/docs`, with the rules block unchanged. The plugin text, the workflows guide and the
compatibility page follow. You chose all three of these on 2026-11-14.

The cost: implementation reviews take longer and spend more model usage, because the reviewer reruns paid
sessions. R-22 took about 30 minutes.

Validation is planned, not observed: static checks on the convention and plugin text, reviewer scenarios
with a runner whose stored summary disagrees with its result, an author trial, and the plugin suite.

Acceptance authorizes the companion docs change and the plugin edits on a feature branch. Pushing, PRs,
merging and release each need your go.

### Background

Evidence rules. The convention defines `met` as "executed evidence observed in this review", and
`not verified` as "a check exists but its execution was not observed"
(`conventions/feature-documents.md:241-243` at `1ccf8f3`). Its Test plan section asks only that a proof
name "a real check: a test, a scenario with a pass condition, or a written manual procedure" (`:123-124`).
Nothing covers proofs whose result depends on a model session.

Reviewer and dispatch. The reviewer agent may run "the repository's own tests to observe evidence. A
result you did not observe is not evidence" (`plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:30-31`).
The protocol gives both review routes the repository, document, commit, kind, docs revision, binary and
plugin pin (`plugins/vh-adlc/references/review-protocol.md:31-32`). It says nothing about which checks the
reviewer may run or how to run a repository's harnesses, so a dispatch can tell the reviewer to judge
from stored evidence.

Implementer. The implement skill ticks a criterion "only when verification you observed in this run
establishes it" (`plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:110-111`). That covers what the
implementer saw, not what a reviewer can repeat.

What happened. In `spec-review-convergence`, the reviewer and author trials first ran as dispatched
subagents, and the reviewer judged the scenarios from their stored summaries without running them. R-20 returned AC-02
to AC-07, AC-09 and AC-10 `not verified` and AC-11 `untested`
(`docs/specs/spec-review-convergence.md:534`). Its F-03 found no transcript for the author trials (`:1667`),
and R-19 F-08 found trials that had run on text a later commit reworded (`:1607`). The fix was
`tests/vh-adlc/evidence/review-convergence/trials/run.ts`, which starts each trial as a headless session
in an isolated profile and keeps its transcript, and `collect.py`, which commits redacted copies with raw
and redacted hashes. R-22 to R-24 reran every trial with it and met all ten criteria (`:536-538`). Even
then, R-22 relied on ad hoc trials for two clauses the committed runner did not cover (`:1811`).

A precedent for transcripts. In `host-cleanup`, R-22 met AC-11, which needed interactive Claude Code and
Codex sessions, by reading raw transcripts whose sha256 values matched the procedure
(`docs/specs/host-cleanup.md:1778`).

Copied logins. The scenario host copies the owner's Claude Code login into each profile when no token file
exists (`tests/vh-adlc/scenarios/host.ts:21`). The sessions then list the account's claude.ai connectors,
which is why `collect.py` redacts their names and the home directory before committing.

## Scope

In scope:

- The Test plan rule for agent-session proofs in the shared feature-document convention, as a companion
  change in `vhco-pro/docs` with the rules block unchanged, and the docs pins moved to it.
- The reviewer agent, the review protocol, the implement skill and the spec skill's author mode.
- `docs/user-guides/workflows.md` and the compatibility page.
- Static checks, reviewer scenarios and an author trial, all proved through a committed runner.
- A minor plugin version above the default branch's version when the feature merges.

Out of scope:

- A shared runner library. Each repository writes its own runner; `spec-review-convergence`'s runner stays
  an example, not a packaged tool.
- Rewriting earlier features' evidence. Completed features keep their reviews.
- Choosing a model or host for the runs. The runner uses the repository's harness and the host default.

## Design

### Agent-session proofs

A proof is an agent-session proof when its pass condition depends on what a model does in a session: a
reviewer's records, an author's commits, a report. Its Test Plan row names:

- a committed runner that repeats it unattended from a clean checkout, with the command;
- the fixtures it builds, or the committed fixtures it uses;
- the pass condition, judged from the run's output, records or commits.

A dispatched subagent with no kept transcript is not a runner. A proof that needs a person at the
keyboard, such as a GUI pass, names a written procedure instead, and the person running it keeps the raw
transcripts and records their sha256 values in the evidence.

### Transcripts and `met`

The convention's definition of `met` gains one case: for a proof that needs a person, reading raw
transcripts whose sha256 values match the recorded ones counts as observing it. A proof that runs
unattended is always rerun by the reviewer.

### Keeping transcripts

Transcripts are committed as redacted copies beside the feature's evidence. Redaction replaces account
details a copied login adds, such as connector names and the home directory, and changes nothing else. A
manifest records each transcript's raw and redacted sha256, the checkout the run used, and whether files
the session reads had uncommitted changes. The raw files stay on the machine that ran them, at a path the
manifest names.

### A run counts for the text it ran on

The evidence line for an agent-session proof names the runner command, the commit it ran at, and where its
transcript is kept. The run counts only if no file the session reads had uncommitted changes, and only for
that text. A later change to the operation, agent or reference text the session reads, or to its fixture,
needs a new run before the criterion is ticked again.

### Implement

The implement skill proves an agent-session criterion only through its runner, at the commit under test,
and keeps the transcripts as described above. It never ticks from a dispatched subagent run that left no
transcript. After a change to text the session reads, it reruns before the next review.

### Review dispatch and the reviewer

The review protocol adds to what both routes receive: the commands that run the repository's harnesses,
where kept transcripts are, and that harness output the reviewer writes into the tree must be restored. A
dispatch never limits which checks the reviewer may run.

The reviewer agent repeats an agent-session proof with its runner at the target commit. A stored summary
or record alone is not observation. When a proof needs a person, the reviewer reads the raw transcripts and
checks their sha256 values against the recorded ones.

### Spec author mode

When a criterion can only be proved by an agent session, the author names the runner in its Test Plan row,
or adds a task to write it. A reviewer that finds an agent-session proof without a runner reports it as
should-fix, because the proof cannot be repeated.

### Pins and older consumers

The Test plan rule is convention text, so a repository pinned to an earlier docs revision keeps today's
Test Plan rules. The protocol, reviewer and implement changes rely on no convention text and apply on any
pin. The compatibility page says which part depends on the pin.

### Delivery

The convention change merges in `vhco-pro/docs` first, and every docs pin moves to its commit or a later
one. The default branch is merged into the feature branch before the version moves, and the new minor
version is above the default branch's version at that time; if the default branch moves again before the
merge, it is merged in and the version moved again.

## Acceptance Criteria

- [ ] AC-01: The published convention's Test plan section defines an agent-session proof, requires its row
      to name a committed runner, its fixtures and its pass condition, and says a run counts only for the
      text it ran on; its definition of `met` lets hash-matched raw transcripts stand in for a proof that
      needs a person; its rules block is byte-identical to the previous pin's.
- [ ] AC-02: The review protocol gives both routes the harness commands and the kept-transcript location,
      says a dispatch never limits which checks the reviewer runs, and says harness output must be
      restored; the reviewer agent says it repeats agent-session proofs with their runner, that a stored
      summary alone is not observation, and that a proof needing a person is checked against its raw
      transcripts' sha256 values.
- [ ] AC-03: The implement skill proves agent-session criteria only through their runner at a commit with
      no uncommitted change to the text the session reads, never ticks from a run without a kept
      transcript, reruns after that text changes, and commits redacted transcripts with a manifest of raw
      and redacted sha256 values; the spec skill's author mode names the runner in the Test Plan row.
- [ ] AC-04: A reviewer following the updated agent, reviewing a fixture whose committed run summary says
      a criterion passed while its runner fails at the target commit, does not return that criterion
      `met`; with a runner that passes, it returns `met` and its `EVIDENCE` names the runner command.
- [ ] AC-05: A reviewer following the updated agent, reviewing a fixture spec whose agent-session proof
      names no runner, returns a should-fix finding on that row.
- [ ] AC-06: An author following the updated skill, drafting a feature whose criterion needs an agent
      session, names a committed runner, its fixtures and its pass condition in the Test Plan row, or adds
      a task to write the runner.
- [ ] AC-07: `docs/user-guides/workflows.md` describes agent-session proofs and the runner rule, and the
      compatibility page says the Test plan rule depends on the docs pin while the review and implement
      changes apply on any pin.
- [ ] AC-08: Every docs pin names the published docs commit or a later one, both manifests carry the same
      version above the default branch's version, and `bun test tests/vh-adlc` has no failure that does
      not also fail on the default branch on the same host.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-02, AC-03, AC-07 | `tests/vh-adlc/agent-proofs.test.ts` resolves the convention page through `vh-adlc knowledge` and checks each required sentence in it and in the plugin and guide files named by the criterion; it compares the rules block at the old and new pins byte for byte. |
| AC-04 | Two scenario cases in `tests/vh-adlc/scenarios/run.ts` with the real reviewer, run by `bun tests/vh-adlc/scenarios/run.ts --phase 7 S17.stale-summary S17.runner-pass`. Each fixture has one criterion whose proof is a committed runner script; the runner is deterministic, so the cases test what the reviewer does rather than a model inside the runner. S17.stale-summary: the committed summary says pass and the runner exits 1; pass when the records do not return that criterion `met`. S17.runner-pass: the runner exits 0; pass when it is `met` and `EVIDENCE` names the runner command. |
| AC-05 | Reviewer trial, run by a committed runner under `tests/vh-adlc/evidence/agent-proofs/`, on a fixture spec whose criterion is proved by "a subagent trial" with no runner; pass when a should-fix finding's `WHERE` names that Test Plan row. |
| AC-06 | Author trial, run by the same committed runner, drafting a feature whose criterion is that an agent rates a seeded finding; pass when the Test Plan row names a committed runner command, its fixtures and its pass condition, or a task writes the runner. |
| AC-08 | Check `AGENTS.md`, `plugins/vh-adlc/knowledge.md` and `plugins/vh-adlc/references/security-settings.md` name the published docs commit or a later one, and compare both manifests with the default branch's. Run `bun test tests/vh-adlc` on the feature branch and the same failing files on an export of the default branch; pass when every failure on the branch also fails there. |

## Tasks

None yet; written once the document is planned.

## Open Questions

The owner answered the first three questions on 2026-11-14: hash-matched transcripts can stand in for a
proof that needs a person, transcripts are committed as redacted copies with raw and redacted hashes, and
the Test Plan rule goes into the shared convention as well as the plugin. The questions below come from
spec review R-1.

### Q4: What does a command-route review do with an agent-session proof? (R-1 F-01)

**Recommendation:** A. The command route's prompt carries the runner commands, implementation reviews get a
timeout that fits a rerun, and when the route's sandbox cannot start a runner the reviewer returns
`not verified` for that criterion, naming the reason.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Pass the commands, longer timeout, `not verified` when it cannot start** | Every route gets the same dispatch; a sandboxed route gives an honest verdict instead of timing out | A sandboxed route such as Codex `workspace-write` cannot meet those criteria; they need a host-route review |
| **B. Review agent-session criteria on the host route** | Those criteria can always be met | Overrides the route the repository chose for implementation reviews |

**Why this is yours:** It decides whether the repository's chosen review route or the proof's needs win.

### Q5: Where do the harness commands in a dispatch come from? (R-1 F-02)

**Recommendation:** A. The runner commands named in the current Test Plan rows, plus the verification
commands in the repository's `AGENTS.md`.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Test Plan runner commands plus `AGENTS.md` commands** | The commands the criteria actually rely on, from the document under review | The dispatcher reads both sources |
| **B. The loop settings' `verification_rungs`** | One machine-read source | Rungs list delivery checks, not per-criterion runners, and many repositories have no loop settings |

**Why this is yours:** It fixes what every dispatch must carry.

### Q6: How strict are the S17 reviewer scenarios? (R-1 F-04)

**Recommendation:** A. S17.stale-summary passes only on `not met` with `EVIDENCE` that reports the runner's
failure, and both cases check that the reviewer session ran the runner command at the target commit.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Require `not met` and an observed run** | The proof fails a reviewer that trusts the summary or skips the run | Depends on the session's tool log |
| **B. Keep "not `met`"** | A simpler check | Passes a reviewer that returns `not verified` without running anything, which is what R-20 did |

**Why this is yours:** It sets how hard the proof is.

### Q7: What severity does a missing runner get? (R-1 F-06)

**Recommendation:** A. Blocking, as the convention's existing definition of a proof that cannot be executed
already says, stated in the new Test plan text, so no special severity is needed. On a pin without the new
text the reviewer raises nothing new.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Blocking, from the existing definition** | One rule, no exception to the severity definitions | A missing runner stops acceptance until it is named |
| **B. Should-fix, stated as an exception** | Drafts with a missing runner can still be accepted | An exception to the shared definitions the reviewer must carry |

**Why this is yours:** It decides whether a missing runner blocks acceptance.

### Q8: Can the author defer the runner to a task? (R-1 F-07)

**Recommendation:** A. No. The Test Plan row always names the runner's path and command, even before the
runner exists, the same way a row names a test that implementation will write.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Always name the path and command** | One row form that review can check | The author picks the runner's path while drafting |
| **B. Allow a row that points at a future task** | Less to decide while drafting | Tasks exist only once a document is planned, so the row names nothing a review can check |

**Why this is yours:** It decides how much the draft must fix up front.

### Q9: How many runs count, and which verdict follows each outcome? (R-1 F-08)

**Recommendation:** A. The reviewer runs each agent-session proof once. A failed pass condition gives
`not met`. A run that cannot start or finish gives `not verified` with the reason. The reviewer may retry
once only when the run did not start.

| Option | You get | It costs |
| --- | --- | --- |
| **A. One run, defined verdicts, one retry if it did not start** | Predictable verdicts and bounded cost | A model that passes most of the time can still fail one review |
| **B. Best of three runs** | Tolerates an occasional model miss | Three times the cost, and a flaky proof can pass |

**Why this is yours:** It trades review cost against tolerance for model variance.

### Q10: What happens when the raw transcripts of a proof that needs a person cannot be read? (R-1 F-09)

**Recommendation:** A. The committed redacted copy counts when its sha256 matches the recorded redacted
hash. Redaction changes only account details, and the raw files stay for audit.

| Option | You get | It costs |
| --- | --- | --- |
| **A. A hash-matched redacted copy counts** | Any reviewer on any machine can meet the criterion | Relies on the redaction changing nothing that matters |
| **B. Only raw transcripts count; otherwise `not verified`** | The strictest reading of your earlier answer | Only a reviewer on the machine that ran them, before cleanup, can meet such a criterion |

**Why this is yours:** It refines your earlier answer on transcripts.

### Q11: Which files decide whether a run still counts? (R-1 F-10)

**Recommendation:** A. Each runner declares its inputs, such as the plugin directory and its fixture paths.
The manifest records their tree or blob ids and whether any had uncommitted changes, and a change to any
of them needs a new run.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Inputs the runner declares** | A precise, checkable rule per runner | Each runner lists its inputs |
| **B. The whole repository tree** | Nothing to declare | Any unrelated commit forces a rerun of every paid session |

**Why this is yours:** It trades rerun cost against precision.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-14 | R-1 | spec | `409d32d` | claude-opus-5-5 | procedural | Blocking: the command review route cannot carry the new dispatch or rerun agent sessions; eleven should-fix findings |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Review dispatch and the reviewer; Scope; covers frontmatter; Context, Owner summary (third and fourth bullets and the cost paragraph); AC-02; Test Plan, AC-01, AC-02, AC-03, AC-07 row and AC-04 row
EVIDENCE: The design says "The review protocol adds to what both routes receive", but a `command` route never reads the protocol for its prompt. `reviewPrompt` in plugins/vh-adlc/scripts/loop/cli.ts:48-70 builds it from the reviewer agent, the seven identity fields, the instruction files and the lenses, with nothing else. `runReviewRoute` stops the CLI after `request.timeoutMs ?? 15 * 60_000` (plugins/vh-adlc/scripts/loop/review-route.ts:230), while the Owner summary says R-22, the review that reran the trials, "took about 30 minutes". The command CLI runs in its own PID namespace (plugins/vh-adlc/references/loop-settings.md:117-119), and an adopter on this host routes implementation reviews to `codex exec --json -s workspace-write` (/home/m/code/stackweaver/.vh-adlc/loop.yaml, implementation_reviewer). By default that sandbox blocks network access and writes outside the clone, so the reviewer cannot start headless Claude Code sessions with a copied login in a temp profile (tests/vh-adlc/scenarios/host.ts:24-30). Neither plugins/vh-adlc/scripts/loop/ nor loop-settings.md is in Scope or covers. AC-02 and its proof check only sentences in the protocol and agent, and the AC-04 scenarios run only the host reviewer through run.ts. Someone could tick every box and a command-route adopter would still get `not verified` or a timed-out pending review, which is the problem the goal names.
PROPOSAL: Bring the command route into Scope and covers: pass the harness commands and transcript location through `reviewPrompt`, set a timeout that fits an agent-session rerun, and say what the review returns when the route's sandbox cannot start a runner (for example, pending with the criterion named). Add a criterion and a unit test on the command-route prompt and timeout.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Review dispatch and the reviewer; Scope (second bullet); covers frontmatter; AC-02
EVIDENCE: The design adds "the commands that run the repository's harnesses" to every dispatch but never says where the dispatching session gets them. Possible sources are AGENTS.md local commands (AGENTS.md:22-25), loop.yaml `verification_rungs` (loop-settings.md:44-52) and the commands named in each Test Plan row, and they differ. The dispatching text that would change is in plugins/vh-adlc/skills/vh-adlc-review/SKILL.md:50-52 (what Dispatch passes) and :57-59 (the handoff's "commands that establish each criterion"), and in plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:88-89. The vh-adlc-review skill is in neither Scope nor covers. Two implementers would pass different commands, or edit only the protocol and leave the review skill's dispatch list unchanged.
PROPOSAL: Name the source of the harness commands (for example, the runner commands in the current Test Plan rows plus the AGENTS.md verification commands), and add the vh-adlc-review skill to Scope, covers and AC-02.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Review dispatch and the reviewer (first paragraph); AC-02 ("says harness output must be restored"); Test Plan, AC-04 row
EVIDENCE: The reviewer agent forbids editing or checking out anything and requires every command to "leave the working tree, the index and every ref as they were" (plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:22-24). Restoring a tracked file that a harness rewrote takes a write or a `git restore` or checkout, which that rule forbids. The design's own AC-04 runner writes tracked files: run.ts sets EVIDENCE to tests/vh-adlc/evidence/claude-code (tests/vh-adlc/scenarios/run.ts:18) and writes `${s.id}.md` there (:1818), a directory with 74 tracked files. A host-route reviewer works in the feature's owning worktree (review-protocol.md:38-41), so its rerun overwrites the implementer's evidence. A command route instead uses a private clone and `review_scratch` (loop-settings.md:39). The design does not say who restores the output, how, or whether runners must write outside the checkout.
PROPOSAL: Require an agent-session runner to write its output to a directory outside the checkout, given by argument or environment, and keep the reviewer's leave-it-as-it-was rule rather than adding a restore duty. Make run.ts take such a directory for the S17 cases.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-04 row; AC-04
EVIDENCE: S17.stale-summary passes when the records "do not return that criterion `met`". `not verified` satisfies that, and `not verified` is exactly what R-20 returned without running anything (docs/specs/spec-review-convergence.md:534). With a runner that exits 1, the correct verdict is `not met` (feature-documents.md:241-242). S17.runner-pass passes when `EVIDENCE` names the runner command, which a reviewer can copy from the committed summary without running it. The fixture runner is deterministic, so it is already one of "the repository's own tests", which today's reviewer may run (vh-adlc-reviewer.agent.md:30-31). Neither case shows that the change made a difference. Both proofs could pass on an unchanged reviewer that does not run the runner.
PROPOSAL: Pass S17.stale-summary only on `not met` with `EVIDENCE` that reports the runner's failure. In both cases, check through `toolUses` (tests/vh-adlc/scenarios/host.ts:140) that the reviewer session executed the runner command in the fixture at the target commit.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-04, AC-05 and AC-06 rows; covers frontmatter; Design, Agent-session proofs; Design, Keeping transcripts; Design, A run counts for the text it ran on
EVIDENCE: The design requires an agent-session row to name "a committed runner ... with the command" and its fixtures, and requires the transcripts to be committed as redacted copies with a manifest. The AC-05 and AC-06 rows name only "a committed runner under tests/vh-adlc/evidence/agent-proofs/" and "the same committed runner", with no file, no command and no fixture location. The AC-04 runner, run.ts, keeps no transcript and no manifest: it writes a summary (run.ts:1818) and deletes the scratch profiles of passing runs (:1820-1821). An AC-04 evidence line therefore cannot name "where its transcript is kept". The S17 summaries go to tests/vh-adlc/evidence/claude-code/, which covers does not list. Under its own rule, the feature's Test Plan would draw the should-fix that AC-05 describes.
PROPOSAL: Name the AC-05 and AC-06 runner file, its command, its fixtures, and where transcripts and the manifest go. Either make run.ts keep redacted transcripts and a manifest for the S17 cases, or state why AC-04 is exempt. Add the S17 evidence paths to covers.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Spec author mode (second sentence); Design, Pins and older consumers; AC-02; AC-05; Test Plan, AC-05 row
EVIDENCE: The rule that a reviewer reports an agent-session proof with no runner "as should-fix" sits under Spec author mode. AC-02 does not require the reviewer agent to say it, and AC-01 does not require the convention to. The reviewer rates findings with the pinned definitions (vh-adlc-reviewer.agent.md:58-60), and those definitions rate "a proof ... cannot be executed" as blocking (feature-documents.md:201-204). A correct implementation of AC-01 to AC-03 can therefore yield a blocking finding, and AC-05 fails. Pins and older consumers says the reviewer changes "rely on no convention text and apply on any pin", but this rule rests on the new Test plan rule, which an old pin lacks. The design does not say whether an old-pin reviewer raises the finding.
PROPOSAL: State the rule and its severity in the reviewer agent, or in the convention text AC-01 adds, and name that file in AC-02 or AC-01. Say whether the rule applies on a pin without the new Test plan rule.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Spec author mode (first sentence); AC-06; Test Plan, AC-06 row
EVIDENCE: Spec author mode lets the author "add a task to write" the runner instead of naming it. Tasks are written only after the document is planned: this document says "written once the document is planned", and vh-adlc-tasks requires a planned document (plugins/vh-adlc/skills/vh-adlc-tasks/SKILL.md:30-46). A drafting author therefore has no Tasks section to add to. A row that defers the runner to a task still names no runner, which is the condition AC-05's reviewer reports as should-fix. AC-06's pass condition accepts that alternative, so an author that leaves the row without a runner passes AC-06, and the next review then flags it.
PROPOSAL: Drop the task alternative from Spec author mode, AC-06 and its row, or define a Test Plan row form that names the runner path and command to be written, which both the author trial and AC-05's reviewer accept.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Transcripts and `met` ("A proof that runs unattended is always rerun by the reviewer"); Design, Review dispatch and the reviewer (second paragraph); Context, Owner summary (fourth bullet)
EVIDENCE: An agent-session pass condition depends on a model and can pass for the implementer and fail on the reviewer's rerun, or the reverse. In R-22, ac04-partial raised findings beyond its target on rerun (docs/specs/spec-review-convergence.md, R-22 F-02, about line 1828). A rerun can also fail to start: no credentials, a rate limit, or a refused paid session. The design does not say how many runs count, whether the runner or reviewer may retry, which verdict follows when the reviewer's run disagrees with the kept transcript (`not met` or `not verified`), or what a run that never started yields. Two careful reviewers would return different verdicts on the same outcome.
PROPOSAL: Define the rerun rule: how many runs, whether retries are allowed, `not met` when the runner reports a failed pass condition, and `not verified` with the reason when the run could not start or finish.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary (fifth and sixth bullets); Design, Agent-session proofs (second paragraph); Design, Transcripts and `met`; Design, Keeping transcripts ("The raw files stay on the machine that ran them"); Design, Review dispatch and the reviewer (last sentence)
EVIDENCE: A proof that needs a person is met only by reading raw transcripts, and the raw files stay "on the machine that ran them, at a path the manifest names". A reviewer on another machine cannot read them. So cannot a command-route reviewer confined to a private clone (review-protocol.md:13-15), or a reviewer that runs after the files are cleaned up. The host-cleanup precedent read files in ~/.cache on the same host (docs/specs/host-cleanup.md:1778). The design does not say what the reviewer returns when the raw files are absent, or whether the committed redacted copy with its recorded redacted hash can stand in.
PROPOSAL: State the verdict when the raw transcripts cannot be read (for example `not verified`, naming the missing path), and say whether a hash-matched redacted copy is enough.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary (second bullet); Design, Keeping transcripts; Design, A run counts for the text it ran on; Design, Implement; AC-03
EVIDENCE: Several places depend on "files the session reads": the run counts only if none had uncommitted changes, the manifest records it, and a later change to that text needs a rerun. The set is never defined. The working example records `plugin_dirty`, `reviewer_agent_blob` and `spec_skill_blob` (tests/vh-adlc/evidence/review-convergence/trials/runs/manifest.json), a narrower and different set than "operation, agent or reference text ... or its fixture". One implementer would check the whole plugin directory, another two blobs. The rerun trigger and AC-03's "no uncommitted change to the text the session reads" would then differ.
PROPOSAL: Define the set as the runner's declared inputs (for example the plugin directory and fixture paths), and require the manifest to record their blob or tree ids and whether any was dirty.

FINDING: F-11
KIND: factual
SEVERITY: should-fix
WHERE: Design, Agent-session proofs; Acceptance Criteria; AC-07
EVIDENCE: The convention says "User-facing terms the feature introduces or changes appear in a glossary row and are held to it by a criterion" (feature-documents.md:164-165). This feature adds user-facing terms to the workflows guide and the convention: "agent-session proof", "runner", "kept transcripts" and "a proof that needs a person". It has no glossary and no criterion holding the term. The shared-development-loop feature did this with a Terms table and tests/vh-adlc/loop/glossary.test.ts.
PROPOSAL: Add a glossary of the new terms with rejected synonyms, and a criterion and static check that holds the convention, plugin and guide text to them.

FINDING: F-12
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-01, AC-02, AC-03, AC-07 row
EVIDENCE: The row "checks each required sentence" in the convention, plugin and guide files, which means it judges free text with patterns. The convention requires such a row to list its must-pass and must-fail examples (feature-documents.md:126-127). The row lists none and does not say which sentences or patterns, so two implementers would write different checks, and one could pass on text that does not carry the rule.
PROPOSAL: List, per criterion, the sentences or patterns checked, each with a must-pass and a must-fail example.

FINDING: F-13
KIND: factual
SEVERITY: should-fix
WHERE: Scope ("A minor plugin version above the default branch's version"); Design, Delivery ("the new minor version"); AC-08 ("the same version above the default branch's version"); Test Plan, AC-08 row
EVIDENCE: Scope and Delivery require a minor bump. AC-08 and its row require only a version above the default branch's, so a patch bump from 0.20.0 to 0.20.1 passes the proof although Scope says minor. Both manifests are at 0.20.0 today (plugins/vh-adlc/plugin.json:4, plugins/vh-adlc/.claude-plugin/plugin.json:3).
PROPOSAL: Say "a minor version above" in AC-08 and make its row check that the minor component increased.
