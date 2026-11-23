---
status: draft
status_description: "Revised after spec review R-1 with the owner's answers to Q1 to Q13; waits for an independent re-review."
issue: null
goal: "A session that drives many sub-sessions across a workstream follows one generic vh-adlc procedure that starts only work the host and the loop can carry, keeps every session's state and blockers current, routes owner decisions correctly and closes sessions without losing work."
covers:
  - plugins/vh-adlc/skills/vh-adlc-orchestrate/
  - plugins/vh-adlc/references/orchestrate.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/triage/discovery.test.ts
  - docs/user-guides/workflows.md
  - docs/get-started/installation.md
---

# Plan: Workstream orchestration

A new operation, `vh-adlc-orchestrate`, gives a session that runs many sub-sessions (one per issue or
feature) a checked procedure for admitting work, watching it, routing decisions, merging and cleaning
up. Project specifics stay in each repository's project procedure.

## Context

### Owner summary

Over one week of a production-readiness workstream (2026-11-17 to 2026-11-23), an orchestrating
session ran many sub-sessions and hit fifteen kinds of failure. They cost real time: a full btrfs
metadata pool took two hours to recover, a merged dependency went unnoticed for a day while its
dependents sat idle, fourteen sessions started at once on an overloaded host, and spec reviews ran 9
and 38 rounds before anyone weighed the harm. vh-adlc has rules for one session working one feature.
It has nothing for the session above them.

The feature adds one skill and one reference, a procedure rather than a framework:

- **Admission.** Before starting work, check that its harm justifies it, that none of the gates it
  will reach is blocked, and that the host can carry it (`capacity.sh` and the host's live-session
  count). Start at most three new sessions per batch. The next batch waits until every session in the
  current one has reported its first step, ten minutes have passed and the check passes again. Nothing,
  not even an owner instruction, overrides a blocked capacity check. Each exclusive resource, such as
  a single test cluster, gets a queue and one heavy job at a time.
- **Status passes.** Before every admission, after every sub-session report and at least every two
  hours, list every session's state and check every recorded blocker against its PR or issue. A read
  that fails counts as unknown, never as clear.
- **Communication.** Steer by message; interrupt only for an emergency stop and tell the owner at once.
  Owner answers are recorded, dated, in the work item's issue or document, where the sub-session reads
  them. Facts are verified before they are relayed, owner questions are batched with recommendations,
  interface contracts go from producer to consumers, and each shared code area has one owner.
- **Decision boundary.** The orchestrator sequences work, applies recorded owner decisions, writes the
  workstream ledger and archives its finished sub-sessions. Scope, rule changes, merges and releases go
  to the owner.
- **Upgrades and close-out.** Stale sessions write a handoff and pause, and are replaced once when the
  awaited release lands, each with the owner's handoff. A stale orchestrator stops writing and asks to
  be replaced. Sessions are archived only after a confirmed done and cleanup; handoffs never live in
  `/tmp`.

Project specifics go in an `## Orchestration` section of the project procedure the loop settings
already name. The plugin names no adopter.

The owner answered all thirteen questions on 2026-11-23, relayed by the orchestrating session (Owner
decisions below). Proof is planned, not observed: package tests that assert each rule's exact sentence
in the reference, a list of adopter terms the package must not contain, and a written walkthrough in
which the implementation reviewer confirms each rule reads as a requirement and replays each incident
to the step that stops it. R-1 found nothing blocking; this revision applies its findings. Acceptance
authorizes the plugin edits, tests and docs rows on a feature branch and one PR; merging and releasing
need the owner's separate approval.

### Owner decisions

All answered on 2026-11-23 and relayed by the orchestrating session; each was the recommended option.

- Q1: project specifics live in an `## Orchestration` section of the project procedure; no new file or
  schema.
- Q2: the dependency watch is a written procedure; a forge read that errors is unknown, never clear.
- Q3: at most three new sub-sessions per batch by default, overridable in the project procedure, with
  more only once load shows the batch fit.
- Q4: owner answers reach a sub-session through a dated record in the work item's issue or feature
  document; a feature handoff still needs the owner in the receiving session.
- Q5: each replacement of a stale session needs the owner's handoff in its own session, requested in
  one batch; a stale orchestrator keeps reading and messaging, makes no repository or ledger write,
  writes its own handoff and asks to be replaced.
- Q6: nothing overrides a blocked capacity check, an owner instruction included; the orchestrator
  offers to start once the check passes.
- Q7: the next batch starts only after every session in the batch has reported its first step, at
  least 10 minutes after the last start, and a passing capacity check.
- Q8: the project procedure may set a live-session limit, and nothing starts at or above it; a pending
  session stops admissions until finished sessions are archived.
- Q9: a status pass runs before every admission, after every sub-session report and at least every 2
  hours while any sub-session is active, overridable in the project procedure.
- Q10: "exclusive resource" throughout; host load stays with the capacity check.
- Q11: tests assert each rule's exact sentence, and the implementation reviewer confirms each reads as
  a requirement.
- Q12: the no-adopter check uses a list of known adopter terms kept in the test, with a must-fail
  example for each.
- Q13: the request to orchestrate a workstream covers archiving the sub-sessions it started once each
  is done; an interrupt is only for an emergency stop, reported to the owner at once.

### Background

Measured at `0c9fee77` on `main`, conventions at `vhco-pro/docs` `0c983f67` (`AGENTS.md:4`).

**What exists.** The loop requires a capacity check before any fan-out and says to start nothing new
on `capacity: blocked` (`plugins/vh-adlc/references/loop.md:36-51`, `:46`). The check covers disk,
btrfs metadata and the one-minute load average per CPU (`plugins/vh-adlc/scripts/host/capacity.sh:9-13`,
`:82-85`). It printed `blocked load: 20.02 over 8 CPUs (limit: 16)` when this document was started. The
spec operation's convergence trigger asks the owner one proportionality question when review passes
stop converging (`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:111-120`); the in-progress
`docs/specs/proportional-review.md` leaves that trigger out of its scope. The harm statement comes first
for any machinery (`plugins/vh-adlc/references/loop.md:22-34`). A session reports `plugin.stale` after
an upgrade and stops before writing (`plugins/vh-adlc/references/loop-settings.md:124-128`). Merging
needs separate approval of the exact action, and so does ending a live session
(`plugins/vh-adlc/references/authority.md:28`, `:30`). A session writes a claimed feature only after a
handoff the owner gives in that session (`plugins/vh-adlc/references/authority.md:211-217`). The loop
settings already name a project procedure that every operation reads
(`plugins/vh-adlc/references/loop-settings.md:40`).

**What is missing.** Every rule above is written for the session doing the work. Nothing tells a
session that starts and steers other sessions to run the check before each batch, how many to start,
when a blocked gate makes new work pointless, how to watch blockers, or which stops it may undo. No
skill is about orchestration: the package's skills are the entry, the gated operations, the content
operations and `vh-adlc-clean` (`tests/vh-adlc/check.test.ts:16-26`, `:236-240`). The discovery test
counts eleven engineering operations, excluding the content operations and `clean`
(`tests/vh-adlc/triage/discovery.test.ts:22-24`), and both guides say eleven engineering operations
and eighteen skills (`docs/user-guides/workflows.md:16-17`, `docs/get-started/installation.md:115-118`).

**The incidents.** The orchestrating session for the workstream recorded these, in the order the
workstream brief lists them. The dates and counts come from that brief; the sessions are private.

1. It spawned sessions without checking disk; btrfs metadata filled (ENOSPC) and the owner lost two
   hours.
2. Told to start everything not blocked because tokens expired in three days, it started fourteen
   sessions while the check said `blocked` (load 22.6 over 8), then overcorrected by trying to archive
   them all. The owner's rule: start some, not too many.
3. It started spec drafts while spec reviews were paused for a reviewer fix, so the work queued behind
   the same blocker.
4. It interrupted a sub-session, which read the interrupt as an owner stop; that session's permission
   check then refused a peer's resume message.
5. It missed for a day that an upstream dependency had merged, so dependent sessions sat idle.
6. It relayed decisions and kept spec review going for 9 rounds on a feature whose machinery outweighed
   its harm (later parked), and 38 rounds on another before its design was cut down.
7. Plugin upgrades made running sessions stale; replacing them one by one caused churn.
8. Its watchers were wrong: a `pgrep` pattern matched its own command line and never fired, and a
   release watcher read an API error as nothing having run and reported success.
9. It pushed a `fix:` commit without its changelog record, so the default branch's coverage check went
   red for every session.
10. It settled a question that bent a constitution rule instead of asking the owner; a reviewer caught
    it.
11. It linked an issue in the wrong repository, and stated a wrong technical fact to a session, which
    disproved it by testing.
12. It ran a cluster end-to-end run and several integration suites in parallel, so every job waited on
    capacity for hours.
13. It archived a session that was still cleaning up, and handoff files were lost to `/tmp` sweeps.
14. Sessions read rules from a shared main checkout that another session had moved.
15. A session created while the host's remote-control bridge already served about twenty workers
    stayed pending with no worker, and spawned only after other sessions were archived and it was
    recreated.

What worked, from the same workstream: relaying interface contracts from the producing feature to its
consumers, recording merge order on the tracking issue, one owner per shared code area, batching owner
questions with a recommendation each, durable handoffs before replacing a stale session, and status
passes that list every session's state.

**Prior art.** Established frameworks agree on a few points this design adapts (Sources):

- A lead agent that plans, delegates with an explicit objective, output format and boundaries, and
  scales the number of workers to the task, with a few parallel workers as the norm and prompts that
  set the scale because agents misjudge effort (Anthropic's research system). Dividing ownership of
  files up front, because two workers on one file overwrite each other, and starting with a handful of
  teammates (Claude Code agent teams).
- A durable plan ledger and a progress ledger that asks each step whether work is done, looping or
  progressing; a stall counter past a small threshold forces re-planning instead of more of the same
  (Magentic-One).
- Human approval at each stage and per unit of work, and approving one unit never approves the stage
  (AWS AI-DLC). Approval gates for costly or irreversible actions (Magentic-One, LangGraph interrupts,
  HumanLayer).
- Handoff transfers ownership of the next turn; agents-as-tools keep the manager in charge
  (OpenAI Agents SDK). The orchestrator here keeps the manager role: sub-sessions own their feature,
  never the workstream.
- Limits on fan-out: coordination overhead grows faster than the number of agents, independent agents
  amplify errors far more than centrally coordinated ones, and sequential work gets worse when split
  (Kim et al.). Most multi-agent failures are specification, inter-agent misalignment and verification
  failures, which are design problems (Cemri et al.). Writes stay single-threaded while other agents
  contribute review (Cognition).
- Work-in-progress limits: start new work only when work in progress drops below the limit, and
  finish before starting (Kanban; Little's law ties shorter cycle time to lower work in progress).

vh-adlc already has stricter versions of several of these: per-feature reservations, independent
review and an owner-only acceptance. The design adopts the admission, ledger, stall and WIP ideas and
leaves out what conflicts with the loop, such as a manager agent that reviews and accepts worker output
in place of the independent reviewer and the owner (CrewAI's hierarchical manager).

**Harm and simplest alternative.** The harm: the owner of a multi-session workstream loses hours per
incident (two hours on ENOSPC, a day of idle sessions on a missed merge, hours of queued jobs), every
session can be blocked by one bad commit to the shared default branch, and owner attention is spent on
review loops whose harm never justified them. It recurs on every workstream and does not heal; the same
orchestrator repeated several mistakes in one week. The simplest alternative without machinery is a
written procedure. This feature is that alternative: one skill and one reference, with no new binary
command, settings schema, helper script or state store.

## Scope

In scope:

- `plugins/vh-adlc/skills/vh-adlc-orchestrate/SKILL.md`, a coordination operation, and
  `plugins/vh-adlc/references/orchestrate.md`, its procedure, with every rule in Design.
- A row in lifecycle intake (`references/lifecycle.md`) that routes workstream orchestration requests
  to the skill.
- The package checker learns the coordination operation kind. The discovery test adds
  `vh-adlc-orchestrate` to its non-engineering list, so the engineering count stays eleven, and checks
  nineteen skills. Both guides keep "eleven engineering operations", add one coordination operation
  and say nineteen skills; the workflows guide gets an Orchestrate row.
- A plugin version bump.

Out of scope:

- Any new binary command, settings file, schema or helper script. Project specifics go in the existing
  project procedure, and the dependency watch is a written procedure.
- Automation that starts, archives or merges sessions on its own, or a scheduler. The orchestrator
  acts through its host's session tools and the owner's approvals.
- Changing how sub-sessions run operations, review or ship, and changing the spec operation's
  convergence trigger.
- Host-specific session tools. The reference names actions (start, message, interrupt, archive) and
  says to use the host's equivalent.
- Any adopter's adapter text. The orchestrator of a given repository lands its own `## Orchestration`
  section there.

## Design

### Glossary

The reference carries this table verbatim.

| Term | Meaning |
| --- | --- |
| Orchestrator | The session that starts, steers and closes sub-sessions for a workstream. |
| Sub-session | A session the orchestrator started for one issue or feature. |
| Workstream ledger | The one durable record of every sub-session: its work item, worktree, state, blockers, next step, the merge order and each exclusive resource's queue. |
| Batch | The sub-sessions started together between two capacity checks. |
| Exclusive resource | A resource only one heavy job may use at a time, such as a single test cluster. |
| Heavy job | A run that loads the host for minutes or more: a full test suite, an image build, a cluster run. |
| Status pass | One sweep over every sub-session and every recorded blocker. |
| Coordination operation | A vh-adlc operation that steers other sessions and changes no feature status itself. |

### The skill

`skills/vh-adlc-orchestrate/SKILL.md` follows the loop frame: get the binary, run `vh-adlc knowledge`
with `conventions/delivery.md`, `conventions/feature-documents.md` and `guides/humanize-prose.md`, run
`bun scripts/loop/cli.ts context` and read every file it lists, then follow `references/orchestrate.md`.
It changes no feature status; sub-sessions do that through their own operations. Its description says
it is for a session that drives many sub-sessions across a workstream.

The checker gets a fourth kind beside gated, content and host operations: `COORDINATION_OPERATIONS =
["orchestrate"]` (`tests/vh-adlc/check.test.ts:16-26`). A coordination operation exists, its name equals
its directory, it carries no `model`, it resolves knowledge first and names the humanize guide.

### Required sentences

Each rule below is a sentence the reference contains exactly, under the section named in brackets. The
reference may add explanation around them but never softens one. The Test Plan asserts each sentence.

**Decision boundary** (`## Decision boundary`):

- S-01: The orchestrator decides alone: sequencing, batch membership, applying a recorded owner decision to the case it names, following repository rules, pausing its own admissions and messaging sub-sessions.
- S-02: The owner's request to orchestrate a workstream authorizes writing its workstream ledger and archiving the sub-sessions it started once each is done; it authorizes no other issue or repository write.
- S-03: Scope, accepting or parking a feature, any change to or bending of a rule in the repository's instruction files, merging and releasing go to the owner.
- S-04: When unsure which side a question falls on, ask the owner.

**Admission** (`## Admission`):

- S-05: Before starting any work, write or find its harm statement, and raise disproportionate machinery with the owner as a proportionality question before the work starts.
- S-06: If any gate the work reaches next is blocked for everyone, do not start the work; finish in-flight work first.
- S-07: Run `capacity.sh` on the checkout and the temp directory before every batch; on `capacity: blocked`, start nothing.
- S-08: Nothing overrides a blocked capacity check, an owner instruction included; report the blocked lines and offer to start the batch once the check passes.
- S-09: Start at most three new sub-sessions per batch unless the project procedure sets another limit.
- S-10: Start the next batch only after every session in the current batch has reported its first step, at least 10 minutes after the last start, and a new capacity check passes.
- S-11: Count the host's live sessions before every batch, and start nothing at or above the project procedure's live-session limit.
- S-12: A session that stays pending without a worker is a capacity signal: do not retry it, and start nothing new until archived sessions free a slot.
- S-13: Never archive running sessions to recover from overload; stop admitting and let them finish.
- S-14: Keep one queue per exclusive resource in the workstream ledger, and run one heavy job at a time on each exclusive resource.

**The brief** (`## The brief`):

- S-15: Each sub-session works in its own worktree from an up-to-date default branch and reads every rule from that worktree.
- S-16: The brief names the work item, its scope, the recorded decisions, the code areas the session owns and those another session owns, the interface contracts it produces or consumes, and its durable handoff location.
- S-17: The sub-session verifies the brief's claims before acting on them and reports any that are wrong.

**Status pass** (`## Status pass`):

- S-18: Run a status pass before every admission, after every sub-session report, and at least every 2 hours while any sub-session is active, unless the project procedure sets another interval.
- S-19: Each status pass lists every sub-session's state and last report and updates the workstream ledger.
- S-20: For every recorded blocker, read its PR or issue state with the forge CLI, and tell each dependent session as soon as it clears.
- S-21: A read that fails, times out or returns an error is unknown, never merged, clear, idle or done.
- S-22: When the spec operation's convergence trigger has fired for a sub-session, add that session's pending proportionality question to the batched owner questions and do not ask a second one.

**Communication and stops** (`## Communication and stops`):

- S-23: Steer a sub-session by message; interrupt only for an emergency stop, tell the owner at once, and leave resuming it to the owner.
- S-24: Record each owner answer, dated, in the work item's issue or feature document, and point the sub-session there.
- S-25: A feature handoff needs the owner to say it in the receiving session.
- S-26: Verify every fact and link before relaying it.
- S-27: Batch owner questions into one message, each with the decision, the options and a recommendation.
- S-28: Relay each interface contract from the producing session to every consumer when it changes, and record it in the workstream ledger.
- S-29: Each shared code area has one owning session at a time.

**Plugin upgrades** (`## Plugin upgrades`):

- S-30: When a plugin release makes sessions stale, have each write its durable handoff and pause, and replace the paused sessions once, when the release they wait for has landed.
- S-31: Ask the owner for every replacement's handoff in one batch; a replacement writes only after the owner hands it the feature in its own session.
- S-32: A stale orchestrator keeps reading and messaging, makes no repository or ledger write, writes its own handoff and asks the owner to replace it.

**Own commits** (`## The orchestrator's own commits`):

- S-33: The orchestrator's own commits to a shared default branch pass the same hooks, records and local verification the repository requires of a feature.

**Watchers** (`## Watchers and tools`):

- S-34: Trust a watcher only after it has fired on a known positive case and cannot match its own command line.
- S-35: A watcher treats a nonzero exit, an API error or unreadable output as unknown and says so.

**Close-out** (`## Close-out`):

- S-36: Archive a sub-session only after it has reported done and confirmed its cleanup finished, and archive finished sub-sessions promptly.
- S-37: Handoffs go to the location the workstream ledger names or into the feature document, never to `/tmp`.

### Explanation the reference adds

Around the sentences, the reference explains:

- **Admission order.** Proportion, gates, capacity and live sessions, the batch limit, then exclusive
  resources. The 10-minute wait exists because `capacity.sh` reads the one-minute load average, which
  lags sessions that have not started building. Owner urgency is answered with the largest start the
  check allows later, never with an override.
- **The workstream ledger.** It lives where the project procedure names, such as a tracking issue or a
  document; without one, the orchestrator asks the owner before the first batch. Only the orchestrator
  writes it; sub-sessions report to the orchestrator.
- **Status pass states.** Working, idle, pending, failed and archived, as the host shows them, plus
  which sessions report `plugin.stale` and the release each waits for. The pass ends with one table of
  every session and every open owner question.
- **Stops.** A message is recoverable by the orchestrator. An interrupt makes the session treat itself
  as stopped by the owner, and it may refuse a peer's resume message. Archiving is final.
- **Emergency stop.** A sub-session about to destroy data, push to a protected branch or exhaust the
  host is an emergency; anything else is steered by message.
- **Close-out.** After the workstream's last merge, the orchestrator removes what it created, as the
  loop's clean-up section describes.

### Project procedure slot

The project procedure named by `project_procedure` (`references/loop-settings.md:40`) may hold an
`## Orchestration` section. The reference lists the fields it may declare, each in plain text:
`Ledger location`, `Tracking issues`, `Exclusive resources`, `Heavy jobs`, `Worktree provisioning`,
`Batch limit`, `Live-session limit` and `Status pass interval`. Without the section or a field, the
defaults above apply; without a ledger location, the orchestrator asks the owner. The plugin never
names an adopter, its resources or its clients.

### Incident table

The reference ends with a table mapping each of the fifteen incidents in Background, in one numbered
row each, to the sentence IDs that prevent it, so a later change that drops a rule shows which incident
returns.

### Concurrency, failure and upgrade

The procedure adds no shared state beyond the workstream ledger, which only the orchestrator writes;
sub-sessions report to it. A failed forge read leaves the blocker unknown and is retried on the next
status pass, which S-18 bounds at two hours. Installing a new plugin version changes nothing for running
sessions until they restart; a running orchestrator then follows S-32. Rolling back the plugin removes
the skill and nothing else.

## Acceptance Criteria

- [ ] AC-01: `vh-adlc-orchestrate` is in the package as a coordination operation: its name equals its
      directory, it has a description and no model, it resolves knowledge, names the humanize guide and
      reads the loop context, and lifecycle intake routes to it. The discovery check counts eleven
      engineering operations and nineteen skills, and both guides say eleven engineering operations, one
      coordination operation and nineteen skills, with an Orchestrate row in the workflows guide.
- [ ] AC-02: The reference states the decision boundary, sentences S-01 to S-04.
- [ ] AC-03: The reference requires proportion and gate checks before new work, sentences S-05 and S-06.
- [ ] AC-04: The reference requires the capacity, batch, live-session and overload rules, sentences
      S-07 to S-13.
- [ ] AC-05: The reference requires a queue and one heavy job at a time per exclusive resource,
      sentence S-14.
- [ ] AC-06: The reference states the brief's rules, sentences S-15 to S-17.
- [ ] AC-07: The reference requires the status pass timing, contents, dependency watch and fail-closed
      reads, sentences S-18 to S-21.
- [ ] AC-08: The reference routes a fired convergence trigger into the batched owner questions without
      a second question or a threshold of its own, sentence S-22.
- [ ] AC-09: The reference states the communication and stop rules, sentences S-23 to S-29.
- [ ] AC-10: The reference states the plugin-upgrade rules, sentences S-30 to S-32.
- [ ] AC-11: The reference requires the orchestrator's own commits to pass the repository's delivery
      gates, sentence S-33.
- [ ] AC-12: The reference states the watcher rules, sentences S-34 and S-35.
- [ ] AC-13: The reference states the close-out rules, sentences S-36 and S-37.
- [ ] AC-14: The reference defines the project procedure's `## Orchestration` section with its eight
      fields, and no file under `plugins/vh-adlc/` contains a term from the test's adopter list.
- [ ] AC-15: The reference's incident table maps each of the fifteen incidents to sentence IDs that
      exist, and replaying each incident against the procedure finds a step that would have stopped it.
- [ ] AC-16: The reference carries the Design's glossary table verbatim, and every rule the reference
      states is written as a requirement.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc/check.test.ts`: a coordination-operation test asserts the skill file, name, description, no `model`, `vh-adlc knowledge`, `guides/humanize-prose.md`, `scripts/loop/cli.ts context` and `references/orchestrate.md`, and that the lifecycle table names `skills/vh-adlc-orchestrate/SKILL.md`. `bun test tests/vh-adlc/triage/discovery.test.ts` asserts nineteen skill directories, eleven engineering operations with `vh-adlc-orchestrate` in the non-engineering list, "nineteen skills", "eleven engineering operations" and "one coordination operation" in both guides, and a `vh-adlc-orchestrate` row in the workflows guide. |
| AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13 | `bun test tests/vh-adlc/check.test.ts`: the test reads S-01 to S-37 from this document's Required sentences section and asserts each appears verbatim, with whitespace folded, in `references/orchestrate.md` under the section its heading names. It must fail when one sentence is deleted or reworded (checked once locally by changing S-09's "three" to "five"). |
| AC-14 | `bun test tests/vh-adlc/check.test.ts`: asserts `## Orchestration` and the eight field names in the reference; then scans every file under `plugins/vh-adlc/` for the case-insensitive adopter terms `stackweaver`, `sw-e2e`, `agent-slot`, `worktree-dev.sh` and `iac_platform`. Must pass: the package as built. Must fail: a fixture file holding each term in turn. |
| AC-15 | `bun test tests/vh-adlc/check.test.ts` asserts fifteen numbered incident rows, each naming at least one sentence ID from S-01 to S-37. Written procedure for the implementation reviewer: for each incident in Background, find the step in `references/orchestrate.md` that would have stopped it and record incident, step and verdict; met only when all fifteen have a step. |
| AC-16 | `bun test tests/vh-adlc/check.test.ts` asserts every row of this document's Glossary table appears verbatim in the reference. Written procedure for the implementation reviewer: read the whole reference and confirm no stated rule is softened into advice (for example "usually", "consider", "optional"), recording each rule and verdict. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-23 | R-1 | spec | `ea534657` | claude-opus-5-5 | procedural | 0 blocking, 14 should-fix, 2 nits; judgement findings go to the owner first |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Status pass step 3; Acceptance Criteria AC-08; Test Plan row AC-02 to AC-13 (AC-08 part)
EVIDENCE: Step 3 says the orchestrator raises the question "When the spec operation's convergence trigger has fired, or the passes keep finding new blocking issues", then says "It uses the spec operation's trigger and does not define its own threshold". AC-08 says the same: "without its own threshold". The second condition is a separate, undefined threshold. The trigger at ea534657 is exact: "fires when this pass and the spec review before it both have blocking findings, and this pass has at least as many" (plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:111-118). docs/specs/proportional-review.md keeps that trigger out of its scope ("Out of scope, by name: The harm statement, proportionality findings and convergence trigger"), so the trigger stays as written. When it fires, the sub-session's own spec operation already "revise[s] nothing" and asks the owner the proportionality question (SKILL.md:115-118). The Design does not say how the orchestrator's question relates to that one, so the owner can get two questions for the same pass, one from each session.
PROPOSAL: Delete "or the passes keep finding new blocking issues". State that when the trigger has fired, the orchestrator puts the sub-session's pending proportionality question into the batched owner questions and does not ask a second one.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Communication and stops; Design, Decision boundary; Design, Status pass step 3
EVIDENCE: The design depends on the orchestrator passing owner answers to sub-sessions: batched owner questions, the proportionality answer the sub-session's spec operation must "Act on" (vh-adlc-spec/SKILL.md:117-118), and "applying an owner decision already recorded in a document, issue or the ledger". Incident 4 shows that a sub-session's permission check refuses a peer's message. authority.md:98-99 and :213-217 accept certain owner statements only when the owner makes them in that session. The Design never says how an answer the owner gave to the orchestrator becomes something a sub-session may act on. One implementer relays it by message, which the sub-session may refuse. Another records it in the issue or document first and points the sub-session at it. A third has the owner answer in the sub-session.
PROPOSAL: State the channel. For example, the orchestrator records each owner answer verbatim in the work item's issue or feature document, with the date, and the sub-session reads it there. List which answers still need the owner to speak in the sub-session itself, such as a handoff.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Plugin upgrades; Owner summary (Close-out bullet); Acceptance Criteria AC-10; Design, Concurrency, failure and upgrade
EVIDENCE: "Replace the paused sessions once ... A replacement starts from the handoff and the ledger." Under plugins/vh-adlc/references/authority.md:213-217, once a feature has a claim, a session writes to it only when it made the claim or "when the owner has said in this session that the earlier writer has stopped and the feature is yours ... Invoking an operation is not a handoff". authority.md:98-99 says the same. So a replacement the orchestrator starts stops before its first write unless the owner hands the feature over in that new session. The document cites authority.md:211-217 in Background but never applies it to replacements, and AC-10 can be met by a procedure that leaves every replacement blocked.
PROPOSAL: Add to Plugin upgrades and AC-10 that each replacement needs the owner's handoff in that session. Have the orchestrator put the handoffs into one batched owner request when the release lands.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, The skill; Design, Plugin upgrades; Design, Concurrency, failure and upgrade; Design, Workstream ledger
EVIDENCE: The skill runs `bun scripts/loop/cli.ts context`, which reports `plugin.stale`, and "operations stop before writing" while it is true (references/loop-settings.md:124-128). After a plugin release on the same host the orchestrator is stale too. Concurrency says only that it "keeps its old instructions until replaced". The Design does not say whether a stale orchestrator may still update the ledger, message sessions and replace them, which Plugin upgrades requires. It also does not say who replaces the orchestrator or how its successor takes over the ledger, which "only the orchestrator writes". The ledger may be a tracking issue, and authority.md:25-27 grants issue creation and updates only in specific cases. The Design does not say what authority covers the orchestrator's edits to it.
PROPOSAL: Say what a stale orchestrator may still do, and how its own replacement and ledger takeover work, through a durable handoff and the owner. Name the authority under which the orchestrator writes a ledger that lives in an issue.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Admission step 3; Design, Decision boundary; Owner summary (Admission bullet); Acceptance Criteria AC-04
EVIDENCE: Admission step 3 says "Owner urgency does not override either signal", and the Owner summary says "Owner urgency never overrides a blocked check". The Decision boundary lists "overriding a gate or check" among the things the orchestrator asks the owner about, which implies the owner can grant an override. One implementer refuses an explicit owner override and the other accepts it. Step 3 also says to "start nothing" on `blocked` and then to "offer the largest batch the host allows". On `blocked` that batch is zero, so the instruction is empty or contradicts "start nothing". loop.md:46-48 says to report and wait for the owner to free space or load.
PROPOSAL: Say whether an explicit owner instruction can override a blocked capacity check. If not, take capacity out of the Decision boundary's "overriding a gate or check". Replace "offer the largest batch" with "report the blocked lines and offer to start the batch once the check passes".

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Admission step 4; Owner summary (Admission bullet); Acceptance Criteria AC-04; Open Questions Q3 (option C)
EVIDENCE: The next batch may start after "a later capacity check, run once the batch is working, still passes". The check reads the one-minute load average (capacity.sh:81-94), and Q3 option C itself says it "lags sessions that have not started building yet". "Once the batch is working" gives no signal or minimum wait. With every box ticked, an orchestrator can start three sessions, check while they are still reading files, see `ok`, and repeat until it has fourteen running. That is incident 2, and the problem survives.
PROPOSAL: Define when the later check runs. For example, only after every session in the batch has reached its first heavy job or reported its first step, and at least N minutes after the last start. Pin that in AC-04.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Admission step 3; Owner summary (Admission bullet); Acceptance Criteria AC-04; Test Plan row AC-02 to AC-13
EVIDENCE: Admission step 3 says "Also count the host's live sessions or workers where the host shows them" but gives no limit and no action tied to the count. AC-04 requires only "the host's live session count". A procedure that counts and ignores the result meets the criterion. Incident 15 (a bridge already serving about twenty workers) is caught only after the fact, by the pending-session signal.
PROPOSAL: Say what the count decides: a project-procedure limit on live sessions, with a default, beyond which nothing new starts. Or drop the count from the design and AC-04 and rely on the pending-session signal.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Status pass; Owner summary (Status passes bullet); Acceptance Criteria AC-07; Design, Concurrency, failure and upgrade
EVIDENCE: The Owner summary says a merged dependency "is seen on the next pass", and Concurrency says a failed read "is retried on the next pass". Nothing says when a pass runs: on a schedule, after each sub-session report, or before each admission. Incident 5 was a day without a check. An orchestrator that runs a pass once a day meets AC-07 and repeats incident 5. Scope excludes a scheduler, but not a rule for when passes happen.
PROPOSAL: State when a pass runs, for example before every admission, after every sub-session report and at least every N hours while sessions are active, overridable in the project procedure. Add that rule to AC-07.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Admission step 5; Owner summary (Admission bullet); Acceptance Criteria AC-05; Design, Glossary; Design, Project procedure slot
EVIDENCE: Step 5 keeps "one queue per exclusive resource" but runs "one heavy job at a time on each shared resource". AC-05 repeats "per shared resource". The glossary defines "Exclusive resource" but not "shared resource". If the host counts as a shared resource, then only one test suite or image build may run on the host at once across all sub-sessions, which conflicts with batches of three sessions that each build. If it does not, incident 12 (a cluster run alongside several integration suites) is covered only when the project declares the cluster exclusive.
PROPOSAL: Either use "exclusive resource" throughout, or define "shared resource" in the glossary and say whether the host is one and how heavy jobs on it are limited.

FINDING: F-10
KIND: factual
SEVERITY: should-fix
WHERE: Scope (package checker bullet); Acceptance Criteria AC-01; Test Plan row AC-01
EVIDENCE: tests/vh-adlc/triage/discovery.test.ts:22-24 counts every `vh-adlc-*` skill except the five content operations and clean, and expects 11. It would count `vh-adlc-orchestrate` and fail at 12. Line 51 asserts "eleven engineering operations" in docs/user-guides/workflows.md (:16), and docs/get-started/installation.md:115-118 also says "eleven engineering operations" and lists every non-engineering skill. The document moves only the skill count from eighteen to nineteen. It does not say whether orchestrate becomes a twelfth engineering operation or joins the non-engineering list as a coordination operation, or how both guides describe it.
PROPOSAL: Decide the classification. Then name the discovery.test.ts:22-24 change and the "eleven engineering operations" wording in both guides in Scope, AC-01 and the AC-01 proof.

FINDING: F-11
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan row AC-02 to AC-13
EVIDENCE: The proof asserts that a section exists and "carries the criterion's key terms", and gives only two examples (AC-04, AC-07). For the other ten criteria, implementers pick their own terms. Term presence also does not show that a rule is required. A reference saying "three sessions is a suggestion; capacity.sh is optional when pending sessions are rare" passes the AC-04 assertion. No manual read is listed, so an implementation reviewer has only the term test for twelve criteria that each say "requires" or "states".
PROPOSAL: List the exact phrases each test asserts per criterion, written as the required sentences. Add a manual read in which the implementation reviewer confirms that each rule is stated as a requirement.

FINDING: F-12
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-14; Test Plan row AC-14; Design, Project procedure slot
EVIDENCE: AC-14 requires that "no file under `plugins/vh-adlc/` names an adopter repository", and the Design says "The plugin never names an adopter, its resources or its clients". The proof matches only `/stackweaver/i`, so a reference naming any other adopter or client passes. Its must-fail example also covers only that one name.
PROPOSAL: Narrow AC-14 to the adopter the proof checks, or make the proof check a named list of adopter and client terms with a must-fail example for each.

FINDING: F-13
KIND: factual
SEVERITY: should-fix
WHERE: Design, Glossary; Acceptance Criteria
EVIDENCE: conventions/feature-documents.md at 0c983f67, Open questions: "User-facing terms the feature introduces or changes appear in a glossary row and are held to it by a criterion." The glossary introduces Orchestrator, Sub-session, Workstream ledger, Batch, Exclusive resource, Heavy job and Status pass, and the Design also uses "coordination operation" and "shared resource". No criterion requires the reference or the guides to define or use these terms as the glossary does.
PROPOSAL: Add a criterion, with a Test Plan row, that the reference defines each glossary term with the glossary's meaning, and add the missing terms to the glossary.

FINDING: F-14
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Close-out; Design, Communication and stops; Design, Decision boundary; Acceptance Criteria AC-13
EVIDENCE: Close-out says to "Archive finished sessions promptly", and the Decision boundary does not list archiving among the owner's decisions. It does defer to "anything the authority reference already reserves for the owner". plugins/vh-adlc/references/authority.md:30 reserves "end a live session" for "Separate approval for that exact action". One implementer reads archiving or interrupting a sub-session as ending a live session and asks each time. The other archives without asking.
PROPOSAL: State whether archiving and interrupting a sub-session fall under authority.md:30, and if they do, how the approval is batched.

FINDING: F-15
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (first paragraph); Context, Background (The incidents); Design, Incident table; Acceptance Criteria AC-15
EVIDENCE: The Owner summary says the session "made fourteen kinds of mistake". Background lists fifteen incidents, and the Incident table and AC-15 both say "fifteen".
PROPOSAL: Say fifteen in the Owner summary, or say why incident 15 is not counted as a mistake.

FINDING: F-16
KIND: factual
SEVERITY: nit
WHERE: Context, Background (What exists); Open Questions Q3
EVIDENCE: `plugins/vh-adlc/references/loop.md:36-56` runs past the capacity section, which ends at :51 ("## 1. Get the binary" is :53). In Q3, "Matches the observed safe size" (option A) and "five sessions building at once already exceeded the load limit" (option B) are supported by nothing in Background, whose only recorded count is fourteen sessions at load 22.6.
PROPOSAL: Cite loop.md:36-51, and either cite the observation behind the three and five figures or drop those claims from Q3.

## Sources

- [How we built our multi-agent research system (Anthropic)](https://www.anthropic.com/engineering/multi-agent-research-system): orchestrator-worker pattern; effort-scaling rules in prompts (1 agent for simple fact-finding, 2-4 for comparisons, more than 10 for complex research); briefs need objective, output format and boundaries; a saved plan survives context limits. Read through search results; the direct fetch was refused by the fetch policy.
- [Building effective agents (Anthropic)](https://www.anthropic.com/research/building-effective-agents): orchestrator-workers pattern, where subtasks are decided per input. Read through search results.
- [Orchestrate teams of Claude Code sessions (Claude Code docs)](https://code.claude.com/docs/en/agent-teams): teams are separate sessions sharing a task list; experimental. Detail on file ownership, a starting team of 3 to 5 and cleanup came from third-party guides in search results, such as [AgentPatterns.ai](https://agentpatterns.ai/tools/claude/agent-teams/), not the official page, which the fetch policy refused.
- [Subagents (Claude Code docs)](https://code.claude.com/docs/en/sub-agents): subagents report to one parent and cannot message each other. Fetch refused; read through search results.
- [Handoffs (OpenAI Agents SDK)](https://openai.github.io/openai-agents-python/handoffs/): a handoff transfers the next turn to another agent with the history unless filtered; one handoff per destination.
- [Agent orchestration (OpenAI Agents SDK)](https://openai.github.io/openai-agents-python/multi_agent/): LLM-driven versus code-driven orchestration; agents as tools keep the manager in charge; evaluator loops with no built-in cap.
- [Magentic-One (arXiv 2411.04468)](https://arxiv.org/html/2411.04468v1): task ledger and progress ledger; the progress ledger asks whether the task is done, looping or progressing; a stall counter above 2 forces re-planning; human input recommended for costly or irreversible actions.
- [Magentic-One in AutoGen](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/magentic-one.html): re-planning after a stall; an approval function before code runs; run in containers and keep a human in the loop.
- [LangGraph supervisor (langgraph-supervisor-py)](https://github.com/langchain-ai/langgraph-supervisor-py) and [multi-agent architectures (LangChain docs)](https://docs.langchain.com/oss/python/multi-agent): supervisor and supervisor-of-supervisors patterns; the supervisor is a single point of failure. Read through search results; docs.langchain.com was refused by the fetch policy.
- [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts): an interrupt persists state and waits for a human to resume. Read through search results.
- [CrewAI hierarchical process](https://docs.crewai.com/en/learn/hierarchical-process): a manager agent allocates tasks and evaluates outcomes; delegation off by default. Read through search results; found not to fit vh-adlc, where acceptance stays with the owner and review with an independent reviewer.
- [AI-Driven Development Life Cycle (AWS DevOps blog)](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/): Inception, Construction and Operation; AI plans, asks and proceeds after human validation; bolts and units of work. Read through search results; the fetched page held only navigation.
- [AI-DLC phases and stages (awslabs/aidlc-workflows)](https://awslabs.github.io/aidlc-workflows/guide/04-phases-and-stages/) and [Construction stage reference](https://awslabs.github.io/aidlc-workflows/reference/04-stages/construction/): every stage closes with an approval gate; units approved one at a time, and one unit's approval never approves the stage. Read through search results.
- [About Copilot coding agent (GitHub Docs)](https://docs.github.com/copilot/concepts/coding-agent/about-copilot-coding-agent) and [Responsible use of Copilot coding agent](https://docs.github.com/en/copilot/responsible-use/copilot-coding-agent): an assigned issue becomes a draft PR that requests human review; tasks should be well scoped; it cannot change a PR it did not create. Read through search results; docs.github.com was refused by the fetch policy.
- [Towards a Science of Scaling Agent Systems (arXiv 2512.08296)](https://arxiv.org/abs/2512.08296): coordination turns grow superlinearly with agent count; per-agent capacity thins beyond 3 to 4 agents under a fixed budget; independent agents amplify errors 17.2 times against 4.4 for centralized coordination; sequential tasks get 39 to 70 percent worse when split. Read through search results.
- [Why Do Multi-Agent LLM Systems Fail? (arXiv 2503.13657)](https://arxiv.org/abs/2503.13657): 14 failure modes in three groups, specification, inter-agent misalignment and task verification, mostly fixed by design rather than prompts. Read through search results.
- [Don't Build Multi-Agents (Cognition)](https://cognition.ai/blog/dont-build-multi-agents) and [Multi-Agents: What's Actually Working (Cognition)](https://cognition.ai/blog/multi-agents-working): dispersed decisions and unshared context break parallel writers; what works keeps writes single-threaded while other agents review. Read through search results.
- [How Kanban works (InfoQ)](https://www.infoq.com/articles/how-kanban-works), [Kanban and Little's law (Scrum.org)](https://www.scrum.org/node/17070) and [Kanban (development), Wikipedia](https://en.wikipedia.org/wiki/Kanban_(development)): a WIP limit signals when new work may start; Little's law ties cycle time to work in progress; stop starting, start finishing. Read through search results.
- [HumanLayer launch (Y Combinator)](https://ycombinator.com/launches/M8e-humanlayer-human-in-the-loop-for-ai-agents-and-beyond): approval decorators and a human-as-tool call routed to people. Search results also covered generic escalation articles from vendors, such as [Gravitee](https://gravitee.io/corpus/gen-1026/autonomous-agent/human-in-the-loop-escalation-and-approval-workflows-for-autonomous-agents.html), which added nothing beyond risk-based routing and warnings about reviewer fatigue; none covered batching questions.
