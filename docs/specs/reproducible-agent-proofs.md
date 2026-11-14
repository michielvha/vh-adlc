---
status: draft
status_description: "Drafted with the owner's answers to Q1 to Q3 folded in; waiting for the first spec review."
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

None. The owner answered Q1 to Q3 on 2026-11-14: hash-matched transcripts can stand in for a proof that
needs a person, transcripts are committed as redacted copies with raw and redacted hashes, and the Test
Plan rule goes into the shared convention as well as the plugin.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
