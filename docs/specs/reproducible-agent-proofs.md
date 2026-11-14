---
status: draft
status_description: "Revised after clean spec review R-3 with the owner's answers, removing or reusing mechanisms where possible; waiting for spec review R-4."
issue: null
goal: "A criterion whose proof depends on what an agent session does can be met in an independent implementation review, because the reviewer can repeat the proof itself."
covers:
  - plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md
  - plugins/vh-adlc/references/review-protocol.md
  - plugins/vh-adlc/references/loop-settings.md
  - plugins/vh-adlc/scripts/loop/
  - plugins/vh-adlc/skills/vh-adlc-implement/
  - plugins/vh-adlc/skills/vh-adlc-review/
  - plugins/vh-adlc/skills/vh-adlc-spec/
  - plugins/vh-adlc/knowledge.md
  - plugins/vh-adlc/references/security-settings.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - AGENTS.md
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - tests/vh-adlc/agent-proofs.test.ts
  - tests/vh-adlc/loop/review-agent-proofs.test.ts
  - tests/vh-adlc/evidence/agent-proofs/
  - tests/vh-adlc/direct-operation-compatibility.test.ts
---

# Plan: Reproducible agent proofs

Proofs that depend on what an agent session does become runs a reviewer can repeat: a committed runner,
kept transcripts and recorded inputs. Every review route carries what the reviewer needs to repeat them,
so such criteria can reach `met` in an independent review.

## Context

### Owner summary

Some criteria can only be proved by watching an agent work: a reviewer rating a seeded finding, an author
applying a review pass. Today an implementer can run those trials as dispatched subagents and tick the
criteria from their reports. The independent reviewer then has nothing it can run and nothing it can
check, so it must return `not verified`. In `spec-review-convergence`, R-20 did exactly that for eight of
ten criteria. The fix that worked there was a committed runner that starts each trial as a fresh headless
session and keeps its transcript. With it, R-22 to R-24 reran every trial themselves and returned `met`.

This feature makes that the rule for every adopter:

- The Test Plan row of an agent-session proof names the runner's path and command, its fixtures, its pass
  condition and where its transcripts go, even before the runner exists. A row without a runner is
  blocking, because the proof cannot be executed.
- The implement operation proves such criteria only through the runner. A run counts only while the
  runner, its fixture and judging files and the files its sessions read keep the ids its manifest records.
- Every review dispatch, host or command route, carries the runner commands from the Test Plan and the
  verification commands from `AGENTS.md`, and never limits which checks the reviewer runs.
- The reviewer runs each agent-session proof once. Runners report the way verification rungs do: exit 0
  passes, 126 or 127 could not run (`not verified`), any other exit fails (`not met`). A sandboxed command
  route returns `not verified`; you can then ask for one implementation review on the host route, with
  the host's default model, which counts as the latest review.
- A runner a reviewer runs authenticates with a token from the environment and never copies a login, so
  even a run killed by a timeout leaves no credential behind. That needs a long-lived token from
  `claude setup-token` on any machine that runs the trials; without one the runner exits 126. Only the
  implement operation's collect step writes redacted transcripts and the manifest into the repository.
- A proof that needs a person, such as a GUI pass, can be met from its kept transcripts when their sha256
  matches the recorded value and the plugin and binary they exercised are still the ones under review.
  The committed redacted copy counts; the raw files stay for audit.

The Test Plan rule and the transcript case of `met` go into the shared feature-document convention in
`vhco-pro/docs`, with the rules block unchanged. You chose every recommendation in Q1 to Q11 and in the
answers to spec reviews R-2 and R-3 on 2026-11-14.

The cost: implementation reviews take longer and spend more model usage, because the reviewer reruns paid
sessions. A rerun of several paid sessions can outlast the command route's 15-minute limit, so its
implementation-review timeout grows to two hours.

Validation is planned, not observed: static checks with listed must-pass and must-fail examples, a unit
test of the command-route prompt and timeout, reviewer and author trials run by a committed runner, and
the plugin suite.

Acceptance authorizes the companion docs change and the plugin edits on a feature branch. Pushing, PRs,
merging and release each need your go.

### Background

Evidence rules. The convention defines `met` as "executed evidence observed in this review", and
`not verified` as "a check exists but its execution was not observed"
(`conventions/feature-documents.md:241-243` at `1ccf8f3`). Its Test plan section asks only that a proof
name "a real check: a test, a scenario with a pass condition, or a written manual procedure" (`:123-124`).
A proof that "cannot be executed" is already blocking (`:201-204`).

Reviewer and dispatch. The reviewer agent may run "the repository's own tests to observe evidence. A
result you did not observe is not evidence" (`plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:30-31`),
and every command it runs must "leave the working tree, the index and every ref as they were" (`:22-24`).
The protocol gives both review routes the repository, document, commit, kind, docs revision, binary and
plugin pin (`plugins/vh-adlc/references/review-protocol.md:31-32`). The review skill's dispatch passes the
same list (`plugins/vh-adlc/skills/vh-adlc-review/SKILL.md:50-52`), and so does the spec skill's review
mode (`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:88-89`). Nothing says how to run a repository's
harnesses, so a dispatch can tell the reviewer to judge from stored evidence.

Command route. A command-route reviewer's prompt is built by `reviewPrompt` from the reviewer agent, the
identity fields, the instruction files and the lenses, and nothing else
(`plugins/vh-adlc/scripts/loop/cli.ts:48-70`); `main` reads the route at the reviewed commit and passes
`--timeout-ms` through (`:145-152`). `runReviewRoute` stops the CLI after 15 minutes unless a timeout is
given (`plugins/vh-adlc/scripts/loop/review-route.ts:230`). The CLI runs in its own PID namespace
(`plugins/vh-adlc/references/loop-settings.md:117-119`). The protocol and the review skill always dispatch
the route `cli.ts route` returns (`plugins/vh-adlc/references/review-protocol.md:5-7`), so no operation
offers a host-route review when that route is `command`. Stackweaver routes implementation reviews to
`codex exec -s workspace-write` (Stackweaver's `.vh-adlc/loop.yaml`, `implementation_reviewer`). The
repository's `AGENTS.md` lists its commands under "Local commands and constraints" (`AGENTS.md:17-25`).

Implementer. The implement skill ticks a criterion "only when verification you observed in this run
establishes it" (`plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:110-111`). That covers what the
implementer saw, not what a reviewer can repeat.

What happened. In `spec-review-convergence`, the reviewer and author trials first ran as dispatched
subagents, and the reviewer judged the scenarios from their stored summaries without running them. R-20
returned AC-02 to AC-07, AC-09 and AC-10 `not verified` and AC-11 `untested`
(`docs/specs/spec-review-convergence.md:534`). Its F-03 found no transcript for the author trials (`:1667`),
and R-19 F-08 found trials that had run on text a later commit reworded (`:1607`). The fix was
`tests/vh-adlc/evidence/review-convergence/trials/run.ts`, which starts each trial as a headless session
in an isolated profile, writes outside the checkout and keeps its transcript, and `collect.py`, which
commits redacted copies with raw and redacted hashes. R-22 to R-24 reran every trial with it and met all
ten criteria (`:536-538`). Even then, R-22 relied on an ad hoc trial for the revisit clause, which the
committed runner did not cover (`:1811-1812`). The scenario runner, by contrast, writes its summaries into tracked files under
`tests/vh-adlc/evidence/claude-code/` (`tests/vh-adlc/scenarios/run.ts:18`).

A precedent for transcripts. In `host-cleanup`, R-23 met AC-11, which needed interactive Claude Code and
Codex sessions, by reading raw transcripts whose sha256 values matched the procedure
(`docs/specs/host-cleanup.md:1746`, `:1778`).

Copied logins. The scenario host copies the owner's Claude Code login into each profile when no token file
exists (`tests/vh-adlc/scenarios/host.ts:21-29`). The sessions then list the account's claude.ai
connectors, which is why `collect.py` redacts their names and the home directory before committing. The
example runner disposes of each profile in a `finally` block
(`tests/vh-adlc/evidence/review-convergence/trials/run.ts:226-228`), which a killed process never reaches.

## Scope

In scope:

- The Test plan rule for agent-session proofs and the transcript case of `met` in the shared
  feature-document convention, as a companion change in `vhco-pro/docs` with the rules block unchanged,
  and the docs pins moved to it.
- The reviewer agent, the review protocol, the review skill's dispatch and handoff, the spec skill's
  author mode and review dispatch, and the implement skill.
- The command review route: its prompt (`reviewPrompt`), its implementation-review timeout and its
  reference text in `loop-settings.md`; and an owner-requested host-route implementation review when the
  configured route is `command`.
- `docs/user-guides/workflows.md` and the compatibility page.
- A glossary of the new terms, held by a check.
- Static checks, a unit test of the command route, and reviewer and author trials run by a committed
  runner under `tests/vh-adlc/evidence/agent-proofs/`.
- A minor plugin version above the default branch's version when the feature merges.

Out of scope:

- A shared runner library. Each repository writes its own runner; this feature's runner and
  `spec-review-convergence`'s stay examples, not a packaged tool.
- Changing the scenario runner. Its cases keep writing summaries into the tree; a runner that meets this
  feature's rule writes outside the checkout.
- Rewriting earlier features' evidence. Completed features keep their reviews.
- Choosing a model or host for the runs. A runner uses the repository's harness and the host default.

## Design

### Glossary

| Term | Meaning | Not called |
| --- | --- | --- |
| Agent-session proof | A proof whose pass condition depends on what a model does in a session: a reviewer's records, an author's commits, a report. | agent test, AI check |
| Runner | A committed script that repeats agent-session proofs unattended from a clean checkout, writing only to an output directory outside it and reporting by exit code as a verification rung does. | harness wrapper, trial script |
| Collect step | The step, run only by the implement operation, that writes a runner's redacted transcripts and the transcript manifest into the repository's evidence directory. | publish step, sync step |
| Runner inputs | The files a runner declares: the runner itself, every file it uses to build fixtures or judge a pass condition, and the files its sessions read, such as the plugin directory. | read set, watched files |
| Transcript manifest | The file beside committed transcripts that records, per run, the checkout, each runner input's tree or blob id and whether any had uncommitted changes, each transcript's raw and redacted sha256, and the raw files' path with the home directory written as `~`. | run log, hash list |
| Proof that needs a person | A proof that cannot run unattended, such as a GUI or interactive session, proved by a written procedure, kept transcripts and the ids of the inputs the procedure exercised. | manual trial, human run |

### Agent-session proofs

The Test Plan row of an agent-session proof names the runner's path and the command that runs it, the
fixtures it builds or uses, the pass condition, judged from the run's output, records or commits, and
where the runner keeps transcripts and the transcript manifest. The
row names them even before the runner exists, the same way a row names a test implementation will write;
it never points at a later task. A dispatched subagent with no kept transcript is not a runner. A row
whose agent-session proof names no runner is blocking under the existing definition, because the proof
cannot be executed. A proof that needs a person names a written procedure instead.

### A run counts for its inputs

A runner declares its runner inputs. Its transcript manifest records each input's tree or blob id and
whether any had uncommitted changes. A run counts only if none had uncommitted changes, and only while
every input still has the recorded id; a change to any of them needs a new run before the criterion is
ticked again. The evidence line for an agent-session proof names the runner command, the checkout and
where the transcripts and manifest are.

A runner reports the result of a run by its exit code, as a verification rung does: 0 when every pass
condition held, 126 or 127 when a session could not start or finish, any other exit when a pass condition
failed. It prints one line per proof naming it and its result.

### Keeping transcripts

A runner writes raw transcripts only to its output directory. The collect step, which only the implement
operation runs, writes redacted copies and the transcript manifest into the feature's evidence directory,
which sits outside every directory a runner declares as an input. Redaction replaces account details such
as connector names and the home directory, and changes nothing else. The raw files stay on the machine
that ran them, at a path the manifest names with the home directory written as `~`.

A runner that a reviewer runs authenticates with a token from the environment and never copies a login
into a profile, so a run killed by a timeout leaves no credential in the temporary directory. Without a
token it exits 126, which the reviewer records as `not verified`.

### Transcripts and `met`

The convention's definition of `met` gains one case: for a proof that needs a person, reading its kept
transcripts counts as observing it when a transcript's sha256 matches the value the manifest records and
every input the procedure exercised, such as the plugin tree or the binary's revision, still has the id
the manifest records at the target commit. The raw file or the committed redacted copy both count. A proof that runs unattended is always rerun by the
reviewer.

### Implement

The implement skill proves an agent-session criterion only through its runner, with no uncommitted
change to any runner input, and runs the collect step to commit the redacted transcripts and the
transcript manifest. It never
ticks from a dispatched subagent run that left no transcript. After a change to a runner input, it reruns
before the next review.

### Review dispatch

Every dispatch, on either route, adds to the identity fields the Proof cells of the current Test Plan and
the repository's verification commands, both verbatim at the reviewed commit. The verification commands
follow the existing rule: the `verification_rungs` commands when the loop settings declare them, otherwise
the `AGENTS.md` "Local commands" section, otherwise the word "none". The Proof cells carry the runner
commands and where transcripts and manifests are kept. A dispatch never limits which checks the reviewer runs. The review skill's dispatch and its
handoff, and the spec skill's review dispatch, pass the same list. The reviewer keeps its rule to leave
the working tree, index and refs as they were; runners write outside the checkout, so there is nothing to
restore.

### Command route

`reviewPrompt` reads the Test Plan Proof cells and the verification commands from the reviewed commit,
by the same rule, and carries them verbatim. An exported function, `reviewTimeout(kind, given)` in
`plugins/vh-adlc/scripts/loop/review-route.ts`, returns the given value when there is one, otherwise two
hours for an implementation review and 15 minutes for a spec review; `main` passes its result to
`runReviewRoute`. `loop-settings.md` says both. A command route whose sandbox cannot start a runner
returns `not verified` for that criterion with the reason. The configured route stays the default; the
owner can ask the review operation for one implementation review on the host route instead. That review
names no model, so it runs on the host's default under the protocol's rule for an unrequested default,
and it is stored and counts as the latest implementation review like any other.

### The reviewer

The reviewer runs each agent-session proof once with its runner at the target commit, giving it an output
directory under the system temporary directory, and removes that directory after reading the result. It
never runs the collect step. Exit 0 with the proof's line passing is `met`; an exit other than 0, 126 or
127 is `not met`, with the runner's result in `EVIDENCE`; exit 126 or 127, or a run that does not finish,
is `not verified`, with the reason. The reviewer retries once only when the run did not start. A stored summary or record alone is never observation. For a proof
that needs a person, when the resolved convention has the transcript case of `met`, it reads the kept
transcripts, checks their sha256 against the manifest, and checks that every exercised input still has
the recorded id at the target commit.

### Spec author mode

When a criterion can only be proved by an agent session, the author names the runner's path and command,
its fixtures and its pass condition in the Test Plan row.

### Pins and older consumers

The Test plan rule, the missing-runner finding and the transcript case of `met` are convention text, so a
repository pinned to an earlier docs revision keeps today's rules and its reviewer raises nothing new for
them, and its reviewer does not accept transcripts in place of a run. The dispatch, command-route,
host-route request, reviewer-run, implement and author-mode changes rely on no convention text and apply
on any pin. The compatibility page says which part depends on the pin.

### Delivery

The convention change merges in `vhco-pro/docs` first, and every docs pin moves to its commit or a later
one. The AC-05 and AC-06 trials pin their fixtures to that commit, so they run after it exists. The
default branch is merged into the feature branch before the version moves, and the new minor
version is above the default branch's version at that time; if the default branch moves again before the
merge, it is merged in and the version moved again.

## Acceptance Criteria

- [ ] AC-01: The published convention's Test plan section defines an agent-session proof, requires its row
      to name the runner's path and command, its fixtures and its pass condition, says a row without a
      runner cannot be executed, and says a run counts only while its runner inputs keep the recorded ids;
      its definition of `met` lets hash-matched kept transcripts, raw or redacted, stand in for a proof
      that needs a person while the inputs that proof exercised keep their recorded ids; its rules block at the companion commit is byte-identical to the one at
      `1ccf8f3`.
- [ ] AC-02: The review protocol, the review skill's dispatch and handoff, and the spec skill's review
      dispatch pass the Test Plan runner commands, the `AGENTS.md` verification commands and the transcript
      location as the Test Plan Proof cells and the verification commands (rungs, else the `AGENTS.md`
      "Local commands" section, else "none"), the protocol says a dispatch never limits which checks the
      reviewer runs, and the review skill offers an owner-requested host-route implementation review that
      names no model and counts as the latest; the reviewer agent says it runs each agent-session proof
      once in an output directory outside the repository and removes it, never runs the collect step,
      maps exit 0 to `met`, 126, 127 or an unfinished run to `not verified` and any other exit to
      `not met`, retries only a run that did not start, and accepts a proof that needs a person only when
      the resolved convention has that case, the sha256 matches and the exercised inputs are unchanged.
- [ ] AC-03: The implement skill proves agent-session criteria only through their runner with no
      uncommitted change to any runner input, the runner and its fixture and judging files included, never
      ticks from a run without a kept transcript, reruns after a runner input changes, and runs the collect
      step to commit redacted transcripts with a transcript manifest; the spec skill's author mode names the runner's path and
      command, its fixtures, its pass condition and its transcript location in the row.
- [ ] AC-04: A reviewer following the updated agent, reviewing a fixture whose Test Plan row presents an
      agent-session proof under the new rule and whose committed run summary says it passed while its
      runner fails at the target commit, runs that runner and returns `not met` with `EVIDENCE` reporting
      the failure; with a runner that passes, it runs it and returns `met` with `EVIDENCE` naming the
      runner command.
- [ ] AC-05: A reviewer following the updated agent, reviewing a fixture spec whose agent-session proof
      names no runner, returns a blocking finding whose `WHERE` names that Test Plan row.
- [ ] AC-06: An author following the updated skill, drafting a feature whose criterion needs an agent
      session, names a runner's path and command, its fixtures and its pass condition in the Test Plan row.
- [ ] AC-07: `docs/user-guides/workflows.md` describes agent-session proofs and the runner rule, and the
      compatibility page says the Test plan rule, the missing-runner finding and the transcript case of
      `met` depend on the docs pin, and the dispatch, command-route, host-route request, reviewer-run,
      implement and author-mode changes apply on any pin.
- [ ] AC-08: Every docs pin names the published docs commit or a later one, both manifests carry the same
      version whose minor component is above the default branch's, and `bun test tests/vh-adlc` has no
      failure that does not also fail on the default branch on the same host.
- [ ] AC-09: The command-route prompt carries the Test Plan Proof cells and the verification commands
      verbatim from the reviewed commit, by the rule rungs, else the `AGENTS.md` "Local commands" section,
      else "none", and `reviewTimeout` returns two hours for an implementation
      review and 15 minutes for a spec review unless a value is given, which it returns unchanged.
- [ ] AC-10: The convention text, the plugin files this feature changes and the workflows guide use each
      glossary term with its meaning and none of its rejected names.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/agent-proofs.test.ts` resolves `conventions/feature-documents.md` through `vh-adlc knowledge`, compares the rules block at the companion docs commit with the one at `1ccf8f3` byte for byte, and checks the Test plan and Review log sections, whitespace folded, case-insensitive. It requires a defining sentence, "An agent-session proof is a proof whose pass condition depends on" (must fail: "An agent-session proof names its runner"), "runner" with "path", "command", "fixtures", "pass condition" and "transcript" in one paragraph (must fail: a paragraph naming only "command"), "cannot be executed" in that paragraph, "runner inputs" with "recorded" and "the runner itself" (must fail: "the files the session reads"), and in the `met` definition "transcript" with "sha256", "redacted" and "exercised" (must fail: the current definition text). |
| AC-02, AC-03 | The same test reads the protocol, the review skill, the spec skill, the implement skill and the reviewer agent. Protocol, review skill Dispatch and handoff, and spec skill review step each require "Proof cells" with "verification commands", "verification_rungs", "Local commands" and "verbatim" in one paragraph (must fail: today's dispatch list); the protocol requires "never limits which checks" (must fail: "may limit"); the review skill requires "host route" with "latest implementation review" and "no model" (must fail: today's Dispatch). The agent requires "once", "output directory", "outside the repository", "remove", "collect step", "126", "127", "not met", "not verified", "did not start", "sha256", "manifest" and "resolved convention" in its agent-session paragraph (must fail: today's text). The implement skill requires "runner inputs", "uncommitted", "kept transcript", "rerun", "collect step", "transcript manifest" and "redacted" (must fail: today's step 3), and the spec skill author mode "path and command" with "fixtures", "pass condition" and "transcript" (must fail: "add a task"). |
| AC-04 | Two trials run by `bun tests/vh-adlc/evidence/agent-proofs/trials/run.ts <output dir> stale-summary runner-pass`, with fixtures built by `tests/vh-adlc/evidence/agent-proofs/trials/build.py`. Each fixture has one criterion whose Test Plan row presents an agent-session proof under the new rule, naming its runner, fixtures, pass condition and transcript manifest; the fixture runner itself is deterministic and follows the exit-code contract, so the trial tests what the reviewer does, not a model inside the fixture. This feature's runner judges each trial from the reviewer's records and its session tool log, writes only to its output directory and exits by the same contract; `bun tests/vh-adlc/evidence/agent-proofs/trials/collect.ts <output dir>` then writes redacted transcripts and the transcript manifest to `tests/vh-adlc/evidence/agent-proofs/runs/`, outside the runner's declared input `tests/vh-adlc/evidence/agent-proofs/trials/`. stale-summary: the committed summary says pass and the fixture runner exits 1; pass when the tool log shows the reviewer ran the fixture runner and the records give `not met` with `EVIDENCE` reporting the exit. runner-pass: the fixture runner exits 0; pass when the tool log shows the run and the records give `met` with `EVIDENCE` naming the runner command. |
| AC-05 | Trial missing-runner, by the same runner, whose fixture pins the published companion docs commit: a fixture spec whose criterion is proved by "a subagent trial" with no runner; pass when a blocking finding's `WHERE` names that Test Plan row. |
| AC-06 | Trial author-runner, by the same runner, whose fixture pins the published companion docs commit: an author drafts a feature whose criterion is that an agent rates a seeded finding; pass when the Test Plan row names a runner path and command, its fixtures, its pass condition and its transcript location. |
| AC-07 | `agent-proofs.test.ts` reads the workflows guide and the compatibility page. The guide requires "agent-session proof" with "runner" (must fail: no mention). The page requires "docs pin" with "Test plan rule", "missing runner" and "transcript", and "any pin" with "dispatch", "command route", "host route", "reviewer", "implement" and "author" (must pass: "The Test plan rule, the missing runner finding and the transcript case of met depend on the docs pin; the dispatch, command route, host route request, reviewer run, implement and author changes apply on any pin"; must fail: "the reviewer keeps its previous behavior"). |
| AC-08 | Check `AGENTS.md`, `plugins/vh-adlc/knowledge.md` and `plugins/vh-adlc/references/security-settings.md` name the published docs commit or a later one, and that both manifests match and their minor component is above the default branch's. Run `bun test tests/vh-adlc` on the feature branch and the same failing files on an export of the default branch; pass when every failure on the branch also fails there. |
| AC-09 | `tests/vh-adlc/loop/review-agent-proofs.test.ts` builds a fixture repository whose committed document has a Test Plan Proof cell naming a runner command and a transcript location, and whose committed `AGENTS.md` has a "Local commands" section; it calls `reviewPrompt` for that commit and requires both texts verbatim in the prompt (must fail: today's prompt). Two more fixture commits cover the other sources: one whose loop settings declare `verification_rungs`, requiring their commands in the prompt instead of the section, and one with neither, requiring "none". It calls `reviewTimeout` and requires 7,200,000 for `implementation`, 900,000 for `spec`, and the given value when one is passed. |
| AC-10 | `agent-proofs.test.ts` holds each glossary term and its rejected names: every term appears in the convention text and the workflows guide, and no rejected name appears in the convention's Test plan section, the plugin files this feature changes or the guide. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The owner answered Q1 to Q3 on 2026-11-14: hash-matched transcripts can stand in for a proof that
needs a person, transcripts are committed as redacted copies with raw and redacted hashes, and the Test
Plan rule goes into the shared convention as well as the plugin. After spec review R-1, the owner chose on
2026-11-14: a command route that cannot start a runner returns `not verified` (Q4); dispatch commands come
from the Test Plan and `AGENTS.md` (Q5); the reviewer trials require `not met` and an observed run (Q6); a
missing runner is blocking (Q7); the row always names the runner (Q8); one run with defined verdicts (Q9);
a hash-matched redacted copy counts (Q10); runners declare their inputs (Q11). After spec review R-2,
the owner chose every recommended answer: the command route reads the Proof cells and the `AGENTS.md`
"Local commands" section verbatim (F-01), the owner can request one host-route implementation review
(F-02), runner inputs include the runner and its fixture and judging files (F-03), author mode applies on
any pin and the transcript check only with the new convention (F-04), the AC-05 and AC-06 fixtures pin the
companion commit (F-05), the AC-04 fixture presents a real agent-session row (F-06), the rules block is
compared at the companion commit against `1ccf8f3` (F-09), and runners keep logins in a run directory the
reviewer removes (F-10). After spec review R-3, the owner chose every recommended answer: runners a reviewer
runs authenticate by token and never copy a login, replacing the R-2 cleanup sentence (F-01); a separate
collect step, run only by implement, writes evidence outside the runner's inputs (F-02); a proof that
needs a person records the ids of the inputs it exercised (F-03); runners report by the verification
rung exit codes (F-04); verification commands follow the existing rungs-else-`AGENTS.md` rule, else
"none" (F-05); and the host-route request names no model (F-06).

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-14 | R-1 | spec | `409d32d` | claude-opus-5-5 | procedural | Blocking: the command review route cannot carry the new dispatch or rerun agent sessions; eleven should-fix findings |
| 2026-11-14 | R-2 | spec | `0442f4d` | claude-opus-5-5 | procedural | Clean: no blocking finding; ten should-fix findings and two nits |
| 2026-11-14 | R-3 | spec | `6a90dae` | claude-opus-5-5 | procedural | Clean: no blocking finding; seven should-fix findings |
| 2026-11-14 | R-4 | spec | `0661a35` | claude-opus-5-5 | procedural | Blocking: two static-check rows reject the criteria's own hyphenated wording; five should-fix findings and two nits |

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

### R-2

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Command route (first sentence); Design, Review dispatch (first paragraph); AC-09; Test Plan, AC-09 row; Context, Owner summary (third bullet)
EVIDENCE: On the host route, a session reads the document and passes the commands. On the command route, `reviewPrompt` is code. Today it receives only the seven identity strings and the loop context (plugins/vh-adlc/scripts/loop/cli.ts:49-69), and at cli.ts:149 its `repository` field is the literal text "the current directory, a private clone of the reviewed commit". The design says `reviewPrompt` "carries the same added fields", but it defines no machine-readable form for "the runner command named in each current Test Plan row". Test Plan Proof cells are free prose, such as the AC-04 row here. AGENTS.md lists its commands as prose bullets under "Local commands and constraints" (AGENTS.md:19-25). Nothing says where "where kept transcripts and manifests are" comes from: the Test Plan, the evidence lines or a fixed path. Nothing says which revision the code reads them from either. cli.ts:145-146 reads the review policy at the reviewed commit, "never the working tree's". The AC-09 fixture supplies a Test Plan runner command and an AGENTS.md, but no transcript location, yet the row requires that location in the prompt. One implementer would paste the whole Test Plan table and AGENTS.md section. Another would regex backticked commands out of them. Each would write a different AC-09 test, and both would pass it.
PROPOSAL: State how the command route gets each field: for example, the Proof cells of the current Test Plan and the AGENTS.md "Local commands" section, read verbatim at the reviewed commit, plus a named source for the transcript location. Make the AC-09 fixture supply that source.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Command route (last two sentences); Context, Owner summary (fourth bullet); Context, Background (Command route paragraph)
EVIDENCE: The design says that after a command route returns `not verified`, "a host-route review can then meet it. The repository's route choice stands." The protocol and the review skill always dispatch the route `cli.ts route --operation review` returns (plugins/vh-adlc/references/review-protocol.md:5-7). When that route is `command`, cli.ts runs it (cli.ts:146-153). No operation offers a host-route implementation review in that case. `impl_review_clean` needs every criterion `met` or residualised in the latest implementation review (feature-documents.md:349). So in a repository whose `implementation_reviewer` is the sandboxed Codex route the Background describes, every agent-session criterion stays `not verified` or needs a residual. That repository is the case the goal names. One implementer would add a way to send one review to a host route. Another would treat the sentence as a description and build nothing. The Owner summary mentions only the `not verified` outcome, not this fallback.
PROPOSAL: Either define how a host-route implementation review is dispatched when the configured route is `command` (who asks for it, and that it then counts as the latest review), or remove the fallback sentence and state in the Owner summary that such criteria need a residual on a sandboxed command route.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Glossary (Runner inputs; Transcript manifest); Design, A run counts for its inputs; Design, Implement; Context, Owner summary (second bullet); AC-01; AC-03; Test Plan, AC-01 row and AC-02, AC-03 row
EVIDENCE: Runner inputs are defined as "the files a runner declares its sessions read, such as the plugin directory and its fixture paths". The runner script itself is not something its sessions read, and neither is the code that judges the pass condition. Here those are run.ts and build.py, which build the fixtures and judge each trial from records and tool logs (AC-04 row). Suppose a later commit loosens run.ts's pass check, or changes build.py so a fixture no longer seeds the defect. Under the design, the earlier run still counts, because "every input still has the recorded id". The manifest records the checkout (Glossary), but no rule makes a change to the runner void the run. This revision added runner inputs in answer to R-1 F-10.
PROPOSAL: Define runner inputs to include the runner and any file it uses to build fixtures or judge the pass condition, and say so wherever the rule is stated.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Pins and older consumers; Design, The reviewer (last sentence); Design, Spec author mode; AC-02 (last clause); AC-07; Test Plan, AC-07 row
EVIDENCE: Pins and older consumers puts the Test plan rule, the missing-runner finding and the transcript case of `met` in convention text. It says that the dispatch, command-route, reviewer-run and implement changes "apply on any pin". It does not place two plugin changes this feature makes. First, the spec skill's author mode tells authors to name a runner in the row (Spec author mode, AC-03). Second, the reviewer agent's paragraph checks a proof that needs a person against the manifest's sha256 (The reviewer, AC-02). On a pin without the new convention text, `met` still requires "executed evidence observed in this review" (feature-documents.md:241). The agent text would then tell the reviewer to accept hash-matched transcripts, which the pinned standard does not allow. AC-07 and its row repeat the incomplete list, so the compatibility page would leave both cases unstated.
PROPOSAL: Say whether the author-mode rule and the reviewer's transcript check apply on an older pin. For the transcript check, the reviewer could apply it only when the resolved convention has the transcript case. Add both to AC-07 and its row.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-05 row and AC-06 row; AC-05; Design, Pins and older consumers; Design, Delivery
EVIDENCE: The design makes the missing-runner finding convention text that "a repository pinned to an earlier docs revision" does not get. AC-02 does not put it in the reviewer agent. So the AC-05 trial tests the new rule only when its fixture repository pins the published companion docs commit. The AC-05 and AC-06 rows do not say which docs revision the fixtures pin. The existing example runner hard-codes the current pin (tests/vh-adlc/evidence/review-convergence/trials/run.ts:24, build.py:16). On the current pin, an unchanged reviewer can already rate the row blocking under "a proof ... cannot be executed" (feature-documents.md:201-204), or it can miss the row, so the trial neither shows nor isolates the new rule. On the new pin, the trial cannot run until the docs change is published, and the Delivery order does not mention that.
PROPOSAL: State in the AC-05 and AC-06 rows that the fixtures pin the published docs commit carrying the new Test plan rule, and in Delivery that these trials run after that commit exists.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-04 row; AC-04; Design, Glossary (Agent-session proof)
EVIDENCE: The glossary defines an agent-session proof as one "whose pass condition depends on what a model does in a session". The AC-04 fixture's proof is "a deterministic committed runner script", so by that definition it is not an agent-session proof. Its runner is one of "the repository's own tests", which today's reviewer may already run (plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:30-31). The new reviewer rules (run once, retry only a run that did not start, the manifest) then have nothing in the fixture to act on. This revision added the deterministic-runner sentence and the glossary. The tool-log check from R-1 F-04 now requires an observed run. It still does not show that the updated agent, not the existing test-running rule, made the reviewer run it.
PROPOSAL: Have the fixture's Test Plan row present its proof as an agent-session proof under the new rule, naming the runner, its fixtures, a transcript manifest and kept transcripts, with the runner itself kept deterministic. Alternatively, say the trial covers only the rerun-instead-of-summary behaviour.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-01 row; Test Plan, AC-02, AC-03 row; Test Plan, AC-07 row
EVIDENCE: The static checks leave clauses of composite criteria unchecked, so each row can pass on text that omits them. AC-02 says the agent runs each proof "outside the repository" and checks the "manifest's sha256". The row requires only "once", "not met", "not verified", "did not start" and "manifest". AC-03 requires the implement skill to rerun "after a runner input changes" and never tick "from a run without a kept transcript". The row requires only "runner inputs", "uncommitted", "transcript manifest" and "redacted". AC-07 requires the page to say that the transcript case of `met` depends on the pin and that the command-route, reviewer-run and implement changes apply on any pin. The row checks only "Test plan rule" and "dispatch". AC-01 requires the convention to "define" an agent-session proof. The row's must-pass example, "An agent-session proof names its runner", defines nothing. These rows are new text in this revision, written for R-1 F-12, so they have not passed review.
PROPOSAL: Add a required phrase, with a must-fail example, for each unchecked clause: "outside the repository" and "sha256" for the agent; a rerun phrase and "kept transcript" for the implement skill; "transcript" with "docs pin", and "implement" and "command route" with "any pin", for the page; and a defining sentence for AC-01.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Design, Command route (second sentence); AC-09; Test Plan, AC-09 row
EVIDENCE: The design says "`runReviewRoute` gives an implementation review two hours unless `--timeout-ms` sets another limit". `--timeout-ms` is a CLI flag parsed in `main` (cli.ts:152). `runReviewRoute` receives `timeoutMs` and passes it straight to `runOwnedClient` inside the function (plugins/vh-adlc/scripts/loop/review-route.ts:229-230). Nothing it returns exposes that timeout. The AC-09 row "checks the timeout `runReviewRoute` applies" for each kind, with and without `--timeout-ms`. It does not say how a unit test observes this without running a client until it times out. One implementer would set the default in cli.ts, another in review-route.ts behind a new helper, and they would write different tests.
PROPOSAL: Name the layer that picks the default and the observation point, for example an exported function of kind and the given value that both `main` and the test call.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: AC-01 (last clause); Test Plan, AC-01 row; AC-08; Design, Delivery; Scope (first bullet)
EVIDENCE: AC-01 requires the published convention's rules block to be "byte-identical to the previous pin's". The row resolves the convention "through `vh-adlc knowledge`", so it reads the page at the repository's new pin. AC-08 and Delivery allow that pin to be "the published docs commit or a later one". If the pin moves to a later docs commit that carries another feature's rules-block change, AC-01 fails although this feature's docs change kept the block unchanged. The document does not say whether the comparison is between the companion commit and its parent, or between the new pin and 1ccf8f3.
PROPOSAL: Compare the rules block at the companion docs commit with its parent, or with 1ccf8f3, and name that commit in AC-01 and its row.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Design, The reviewer (first sentence); Design, Keeping transcripts; Background, Copied logins; AC-02
EVIDENCE: A runner of this kind copies the owner's Claude Code login into each profile when no token file exists (tests/vh-adlc/scenarios/host.ts:21-29). Its raw transcripts list the account's connectors (Background, Copied logins). The reviewer now runs such runners, "writing to a temporary directory outside the repository". The design does not say whether the reviewer or the runner removes that directory, the copied credentials or the raw transcripts afterwards. It also does not cover a run the route kills at its timeout. A PID-namespace kill skips the runner's own `finally { p.dispose() }` (tests/vh-adlc/evidence/review-convergence/trials/run.ts:226-228), so the copied login stays in the temp tree. The partial-failure path for a review run is undefined.
PROPOSAL: Say that a runner keeps copied logins out of its output directory, and that the reviewer removes its own run directory after reading the result. State what is left behind when a run is killed.

FINDING: F-11
KIND: factual
SEVERITY: nit
WHERE: Context, Background (What happened; A precedent for transcripts; Command route paragraph); Context, Owner summary (cost paragraph)
EVIDENCE: The host-cleanup precedent is R-23, not R-22. docs/specs/host-cleanup.md:1778 lies between `### R-23` (line 1746) and `### R-24` (line 1814), and R-22 there is a spec review (line 484). "R-22 relied on ad hoc trials for two clauses" overstates the source: R-22 ran one ad hoc trial, for the revisit clause (docs/specs/spec-review-convergence.md:1811-1812). "R-22 took about 30 minutes" and "Stackweaver routes implementation reviews to `codex exec -s workspace-write`, whose sandbox cannot start headless Claude Code sessions" have no citation. The second is supported by /home/m/code/stackweaver/.vh-adlc/loop.yaml (implementation_reviewer argv) for the route, but nothing cites the sandbox claim.
PROPOSAL: Correct the review number and the clause count, and cite or remove the duration and the sandbox claim.

FINDING: F-12
KIND: judgement
SEVERITY: nit
WHERE: Design, Keeping transcripts
EVIDENCE: Redaction replaces "the home directory" in committed transcripts, yet the committed manifest names the raw files "at a path the manifest names", which on the running machine is usually under that home directory. The working example's manifest records hashes but no raw path (tests/vh-adlc/evidence/review-convergence/trials/runs/manifest.json), and collect.py redacts the home directory as `~` (collect.py:21-25).
PROPOSAL: Say the manifest's raw path is redacted the same way, with the home directory as `~`.

### R-3

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, The reviewer (second sentence); Design, Keeping transcripts (last sentence); Context, Owner summary (fourth bullet); AC-02
EVIDENCE: The design says "A run killed by the route's timeout leaves its run directory behind, and the review report names it." On the command route, a timeout kills every reviewer process in the PID namespace (plugins/vh-adlc/references/loop-settings.md:117-119). runReviewRoute then returns `{ status: "pending", reason: "the reviewer command timed out", reply }` (plugins/vh-adlc/scripts/loop/review-route.ts:242) and stores nothing. The reviewer is dead, so it cannot write a report, and the route's JSON does not know the run directory, so no report can name it. That directory holds the copied Claude Code login, because "A runner keeps copied logins and session profiles inside its run directory", and nothing removes it or names it to the owner. The Owner summary says only that the reviewer "removes its run directory afterwards", which leaves out that a credential can stay behind in the system temp directory. This sentence was added in this revision in answer to R-2 F-10.
PROPOSAL: Make the leftover observable by something that survives the kill. For example, the runner creates its run directory under a fixed, recognizable prefix, and the review operation or the next run removes stale ones and reports them, or the route reports the prefix on a timeout. Then state the leftover credential in the Owner summary.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-04 row ("writes outside the checkout, and keeps redacted transcripts with a transcript manifest under tests/vh-adlc/evidence/agent-proofs/trials/runs/"); Design, Glossary (Runner); Design, Keeping transcripts; Design, Implement; Design, The reviewer
EVIDENCE: The glossary defines a runner as "writing only outside it", and the reviewer runs each runner and must leave the tree unchanged. The AC-04 row has the same runner both write outside the checkout and keep redacted transcripts and the manifest in a tracked directory. No design section names the step that copies redacted transcripts into the tree. The working example splits this: run.ts writes only to its output directory, and a separate collect.py copies redacted transcripts and writes manifest.json into the evidence directory (tests/vh-adlc/evidence/review-convergence/trials/collect.py:4-11). If a runner writes into runs/ itself, a command-route reviewer's rerun changes the private clone, and the route returns pending (review-route.ts:240-241). A host-route rerun overwrites the implementer's evidence. Also, runs/ sits under trials/ next to run.ts and build.py. A runner that declares trials/ as one tree input voids its own run when the transcripts are committed there.
PROPOSAL: Name a separate collect step that only the implement operation runs to write redacted copies and the manifest into the tree, and say the reviewer never runs it. Alternatively, put the committed evidence outside any directory a runner may declare as an input.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Transcripts and `met`; Design, A run counts for its inputs; Design, The reviewer (last sentence); Design, Glossary (Transcript manifest; Proof that needs a person); AC-01; AC-02 (last clause); Context, Owner summary (fifth bullet)
EVIDENCE: The rule that "a run counts only while every input still has the recorded id" is stated for runners. A proof that needs a person has a written procedure and no runner, so its manifest records no runner input. The reviewer only checks "their sha256 against the manifest". A redacted copy and its hash committed together always match. So a GUI transcript recorded against an earlier plugin or binary still counts at a later commit that changed the behaviour it shows. That is the stale-trial problem R-19 F-08 found (docs/specs/spec-review-convergence.md:1607). The precedent the document cites went further. host-cleanup R-23 also hashed /usr/local/bin/vh-adlc and checked its `vcs.revision` to tie the transcripts to the build under review (docs/specs/host-cleanup.md:1778).
PROPOSAL: Require the manifest of a proof that needs a person to record the ids of the inputs its procedure exercised, such as the plugin tree or binary revision. Have the reviewer accept the transcripts only while those still match at the target commit, and say so in the convention text AC-01 adds and in AC-02.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, The reviewer (third and fourth sentences); Design, Agent-session proofs; Context, Owner summary (fourth bullet); AC-02; AC-04; Test Plan, AC-04 row
EVIDENCE: The reviewer returns `not met` on "a failed pass condition" and `not verified` when "a run ... cannot start or finish". The design defines no result contract that tells them apart once sessions have started. The example runner catches a trial's error, records `runner_error` in its manifest and moves on (tests/vh-adlc/evidence/review-convergence/trials/run.ts:224-226). One reviewer would read a session that hit a rate limit or crashed mid-trial as unfinished (`not verified`, rerun), and another as a failed pass condition (`not met`, fix the code). Verification rungs settle this with exit codes: 0 passes, 126 or 127 could not run, anything else fails (plugins/vh-adlc/references/loop-settings.md, Verification rungs table). The AC-04 stale-summary trial assumes that "exits 1" means a failed pass condition, but nothing in the design says so.
PROPOSAL: Define how a runner reports each proof, for example per-proof pass, fail or error lines, or rung-style exit codes. Map error or could-not-run to `not verified` and fail to `not met`, and have the AC-04 fixture runner follow that contract.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Review dispatch (first sentence); Design, Command route (first sentence); Context, Owner summary (third bullet); AC-02; AC-09; Test Plan, AC-09 row
EVIDENCE: Every dispatch and `reviewPrompt` carry "the repository's `AGENTS.md` "Local commands" section" verbatim. The design does not say what happens when that section is absent. The adopter the Background names, Stackweaver, has no such section: its AGENTS.md headings are Repository instructions, Personal conventions, Shared workflows and Harness compatibility (/home/m/code/stackweaver/AGENTS.md). It declares `verification_rungs` in .vh-adlc/loop.yaml instead. loop-settings.md says operations read verification commands from AGENTS.md only "Without rungs". One implementer would have `reviewPrompt` throw on the missing section, which breaks every command-route review there. Another would omit it, and a third would fall back to the rungs. The AC-09 fixture always has the section, so all three pass.
PROPOSAL: State the behaviour when the section is missing (omit it, or say "none"). State whether a repository with `verification_rungs` passes its rung commands instead, and add a no-section case to the AC-09 test.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Command route (last sentence); AC-02 ("the review skill offers an owner-requested host-route implementation review that counts as the latest"); Test Plan, AC-02, AC-03 row; Context, Owner summary (fourth bullet)
EVIDENCE: The owner can ask for "one implementation review on the host route instead". The design does not say which model that review requests or how it is checked. The configured `implementation_reviewer` names a command-route model, for example `gpt-6.1-sol` in Stackweaver's .vh-adlc/loop.yaml. Under the protocol, "A model the route names counts as a requested model" (plugins/vh-adlc/references/review-protocol.md:9). A host that cannot serve that model then leaves the review pending, while a host route with no model inherits the host default. One implementer would carry the configured model over and get a pending review on Claude Code, and another would drop it and record an unrequested default. The two give different eligibility results for the review that is supposed to count as the latest.
PROPOSAL: Say whether the host-route request carries a model (the configured one, one the owner names, or none), and which eligibility rule from review-protocol.md applies to it.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-02, AC-03 row; Test Plan, AC-07 row
EVIDENCE: The rows leave some clauses of composite criteria unchecked, so each could pass on text that omits them. AC-02 requires the reviewer agent to remove its run directory and to check transcripts "only when the resolved convention has that case". The row requires neither a removal phrase nor a convention-condition phrase. AC-03 requires author mode to name "its fixtures", but the row requires only "path and command" with "pass condition" and "transcript". AC-07 requires the page to place "the missing-runner finding" under the docs pin and the "host-route request" and "reviewer-run" changes under any pin. The row checks only "Test plan rule" and "transcript" with "docs pin", and "dispatch", "command route", "implement" and "author" with "any pin". Its own must-pass example names neither the missing-runner finding nor the host-route request, so text that fails AC-07 passes the row. These rows were changed in this revision in answer to R-2 F-07, which named them, so they have not passed review.
PROPOSAL: Add a required phrase for each unchecked clause: "remove" and a convention-condition phrase for the agent, "fixtures" for author mode, and "missing-runner" under the docs pin and "host route" and "reviewer" under any pin for the page. Make the AC-07 must-pass example contain them.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Test Plan, AC-07 row; Test Plan, AC-02, AC-03 row (review skill clause); AC-07; AC-02
EVIDENCE: AC-07 requires the compatibility page to place "the missing-runner finding" under the docs pin and "the dispatch, command-route, host-route request, reviewer-run, implement and author-mode changes" under any pin. The AC-07 row checks for "missing runner", "command route" and "host route", and its only must-pass example uses the unhyphenated forms. AC-02 says the review skill offers "an owner-requested host-route implementation review", and the AC-02, AC-03 row requires "host route" in the review skill. Neither row says that hyphens fold to spaces or that matching ignores case. The AC-01 row says "whitespace folded, case-insensitive", but that applies only to the convention check. A page sentence that copies AC-07's own wording ("the missing-runner finding ... depend on the docs pin; the command-route, host-route request ... changes apply on any pin") meets AC-07 and fails the row. A review skill sentence that copies AC-02's "host-route implementation review" fails its row in the same way. Under feature-documents.md:130-131, a pattern that rejects a correct output is blocking. This revision added "missing runner" and "host route" in answer to R-3 F-07, whose proposal spelled the phrase "missing-runner". "command route" was already in the row at 6a90dae.
PROPOSAL: State in both rows that the phrase checks fold hyphens and whitespace and ignore case, or list each hyphenated form as an accepted variant. Add a must-pass example that uses AC-07's hyphenated wording.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Keeping transcripts (second paragraph); Design, A run counts for its inputs (second paragraph); Design, Glossary (Runner); Design, Spec author mode; Scope, Out of scope (first bullet); Context, Owner summary (fourth and fifth bullets); AC-01; AC-03; AC-07; AC-10; Test Plan, AC-01 row, AC-04 row and AC-10 row
EVIDENCE: The runner contract that answers R-3 F-01 and F-04 is stated only in this document's Design and glossary. It says a runner writes only to an output directory outside the checkout, exits 0, 126/127 or another code, prints one line per proof, takes its token from the environment, never copies a login, and exits 126 without a token. No criterion puts the contract into text an adopter or author reads. AC-01 and its row require path, command, fixtures, pass condition, transcript and runner inputs in the convention, but no exit codes and no token rule. AC-03 author mode and AC-07's guide check leave it out too. AC-10's test checks only that each glossary term appears, not its meaning. No row checks that this feature's own runner authenticates by token. The example the Out of scope bullet keeps "as an example" breaks both rules. tests/vh-adlc/evidence/review-convergence/trials/run.ts:17 imports `profile` from tests/vh-adlc/scenarios/host.ts, which copies ~/.claude/.credentials.json into the profile when no token file exists (host.ts:26-30). It also catches a trial's error, records `runner_error` and carries on without a non-zero exit (run.ts:224-226). host.ts also reads its token from a file (VH_ADLC_CLAUDE_TOKEN_FILE, host.ts:3-7, 19-20), not from the environment, and the design names no variable. On this host neither ~/.config/vh-adlc/claude-token nor CLAUDE_CODE_OAUTH_TOKEN exists. With every box ticked, an adopter's runner can still exit 1 on a rate limit, which the reviewer reads as `not met`, or copy a login that a timeout kill leaves behind. Both are the problems the R-3 answers were meant to remove. Those answers were applied in this revision.
PROPOSAL: Put the runner contract (output only outside the checkout, the exit codes, one line per proof, token from a named environment variable, never copy a login, 126 without a token) into the convention text AC-01 adds and into author mode. Add required phrases for it to the AC-01 and AC-02, AC-03 rows. Add a check that this feature's runner exits 126 without the token and never reaches host.ts's login copy, and say that the review-convergence runner is not an example of the contract.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, A run counts for its inputs (first paragraph); Design, Keeping transcripts (first paragraph); Design, Glossary (Collect step; Transcript manifest); Design, Implement; AC-03; Test Plan, AC-04 row
EVIDENCE: The collect step "writes redacted copies and the transcript manifest". The manifest records "each runner input's tree or blob id and whether any had uncommitted changes". Those values are only true at run time, and the design does not say who captures them then. The working example has the runner itself write manifest.json into its output directory during the run, with `checkout`, `plugin_dirty` and the agent and skill blobs (review-convergence/trials/run.ts:232-240). A collect step that computes ids and the dirty flag when it runs stamps a run made on uncommitted or older inputs with the current clean ids. A run would then count although it broke the rule the design states, and a later reviewer comparing ids would accept it. One implementer would record at run time and another at collect time. This traces to the collect step added in this revision for R-3 F-02.
PROPOSAL: Require the runner to record the input ids and the dirty state in its output directory when it starts. Have the collect step copy them into the manifest and refuse to collect when any input's id differs from the recorded one.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, A run counts for its inputs (second paragraph); Design, The reviewer; Design, Glossary (Runner); Context, Owner summary (fourth bullet); AC-02; Test Plan, AC-02, AC-03 row; Test Plan, AC-04 row
EVIDENCE: The design gives 126 or 127 "when a session could not start or finish", and the reviewer "retries once only when the run did not start". Exit codes do not separate those two cases, so one reviewer would retry on every 126 and another would never retry. One invocation can run several proofs: the AC-04 row runs `stale-summary runner-pass` together, and AC-05 and AC-06 use "the same runner". The design does not say which exit wins when one proof's pass condition fails and another session cannot finish. Nor does it say how a reviewer derives a per-criterion verdict when an invocation covers proofs of different criteria and exits 1 because only one failed. "Exit 0 with the proof's line passing is `met`" depends on a per-proof line whose result values are never defined. This traces to the exit-code contract added in this revision for R-3 F-04.
PROPOSAL: Define the per-proof line, for example `<proof>: pass|fail|error|not started`. Derive each criterion's verdict from its own lines, with the exit code as the run summary and a stated precedence. Retry only on `not started`.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Command route (last two sentences); Design, The reviewer (first sentence); Context, Owner summary (fourth bullet and cost paragraph); AC-02
EVIDENCE: The design gives the command route two hours because "a rerun of several paid sessions can outlast the command route's 15-minute limit". Its fallback for a sandboxed command route is a host-route implementation review, but it sets no time rule for that route. On Claude Code, the host this review runs on, the shell tool caps a foreground command at 600000 ms, and longer runs need `run_in_background` (up to 7200000 ms). A host-route reviewer that runs the AC-04 to AC-06 runner in the foreground is cut off after ten minutes. Under The reviewer, it then returns `not verified` for "a run that does not finish". The fallback that is meant to reach `met` would then fail for the duration the design itself expects. The reviewer agent text that AC-02 checks gives no instruction for long runs.
PROPOSAL: Have the reviewer agent run a runner detached, or with the host's longest timeout, and wait for it to finish, and state the host-route time budget next to the command-route one. Add the phrase to the AC-02, AC-03 row.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design, Spec author mode; Design, Agent-session proofs (first sentence); AC-01; AC-03; AC-06; Test Plan, AC-01 row, AC-02, AC-03 row and AC-06 row; Context, Owner summary (first bullet)
EVIDENCE: Agent-session proofs, the Owner summary, AC-03 and the AC-01, AC-02, AC-03 and AC-06 rows all require the row to name where transcripts and the manifest are kept. Spec author mode says only "the runner's path and command, its fixtures and its pass condition". AC-01 requires the convention row rule to name "the runner's path and command, its fixtures and its pass condition", with no transcript location, yet its row requires "transcript" in that paragraph. AC-06 requires the author to name "a runner's path and command, its fixtures and its pass condition", yet its row passes only when the row also names "its transcript location". Convention text or an author output that meets AC-01 or AC-06 as written fails the row. An implementer following Spec author mode builds an author mode that AC-03 rejects.
PROPOSAL: Add the transcript location to Spec author mode, AC-01 and AC-06, so every statement of the row rule names the same five items.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (third bullet); AC-02 (first clause)
EVIDENCE: The Owner summary says every dispatch carries "the verification commands from `AGENTS.md`", and AC-02 opens with "the `AGENTS.md` verification commands". After the R-3 F-05 answer, the Design says the verification commands are the `verification_rungs` commands when declared, otherwise the `AGENTS.md` "Local commands" section, otherwise "none". AC-02 restates that rule later in parentheses. The summary does not, so an owner reading it would expect Stackweaver's dispatch, which has rungs and no such section, to come from `AGENTS.md`.
PROPOSAL: Say "the verification commands (rungs, else `AGENTS.md`, else none)" in the Owner summary, and drop "`AGENTS.md`" from AC-02's first clause.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Test Plan, AC-05 row and AC-06 row
EVIDENCE: The rule this feature adds says an agent-session row names "the runner's path and the command that runs it" and where transcripts and the manifest go. The AC-05 and AC-06 rows say only "by the same runner". They give no command line with the trial id, unlike the AC-04 row's `bun tests/vh-adlc/evidence/agent-proofs/trials/run.ts <output dir> stale-summary runner-pass`. A reviewer given these Proof cells verbatim has to infer the command.
PROPOSAL: Give each row its full command, for example `bun tests/vh-adlc/evidence/agent-proofs/trials/run.ts <output dir> missing-runner`, and say its transcripts go to the same runs directory.
