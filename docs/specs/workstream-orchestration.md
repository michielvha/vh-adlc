---
status: draft
status_description: "Revised after spec review R-5 with the owner's answer to Q27; waits for independent re-review R-6."
issue: null
goal: "A session that drives many sub-sessions across a workstream follows one generic vh-adlc procedure that starts only work the host and the loop can carry, keeps every session's state and blockers current, routes owner decisions correctly and closes sessions without losing work."
covers:
  - plugins/vh-adlc/skills/vh-adlc-orchestrate/
  - plugins/vh-adlc/references/orchestrate.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/triage/discovery.test.ts
  - docs/user-guides/workflows.md
  - docs/get-started/installation.md
  - docs/reference/compatibility.md
---

# Plan: Workstream orchestration

A new operation, `vh-adlc-orchestrate`, gives a session that runs many sub-sessions (one per issue or
feature) a checked procedure for admitting work, watching it, routing decisions, merging and cleaning
up. Project specifics stay in each repository's project procedure.

## Context

### Owner summary

Over one week of a production-readiness workstream (2026-11-17 to 2026-11-23), an orchestrating
session ran many sub-sessions and hit fifteen kinds of failure; a sixteenth, about how the host's
remote-control bridge runs, came from the same host afterwards. They cost real time: a full btrfs
metadata pool took two hours to recover, a merged dependency went unnoticed for a day while its
dependents sat idle, fourteen sessions started at once on an overloaded host, and spec reviews ran 9
and 38 rounds before anyone weighed the harm. vh-adlc has rules for one session working one feature.
It has nothing for the session above them.

The feature adds one skill and one reference, a procedure rather than a framework:

- **Admission.** Before starting work, check that its harm justifies it, that the next gate the work
  reaches is not blocked for everyone, and that the host can carry it (`capacity.sh`, and where the
  project sets a live-session limit, no start that would exceed it). Start at most three new sessions
  per batch. A project limit above three is reached step by step: each batch may exceed the one
  before it by at most three, and only when that batch counted. A batch counts when every member
  reported its first step, none stayed pending or failed, and the capacity check after the wait passed
  the first time; after any other batch, the next one has at most three. The next batch waits until every session in the current one has
  reported its first step or been recorded as pending or failed, ten minutes have passed and the check
  passes again. While a session stays pending, nothing new starts until another session is archived,
  and then at most one start per archived session. Recreating a pending or failed session needs the
  owner's approval. Nothing, not even an owner instruction, overrides a blocked capacity check. One
  orchestrator is active per host. Each exclusive resource, such as a single test cluster, gets a
  queue and one heavy job at a time, and a sub-session asks the orchestrator for its turn before
  using one.
- **Status passes.** Before every admission, after every sub-session report and at least every two
  hours, or at the interval the project procedure sets, list every session's state and check every
  recorded blocker against its PR or issue. A read that fails counts as unknown, never as clear.
- **Communication.** Steer by message; interrupt only for an emergency stop and tell the owner at once.
  Owner answers are recorded, dated, as comments on the work item's issue, or in the ledger when the
  work item has none, where the sub-session reads them. Facts are verified before they are relayed, owner questions are batched with recommendations,
  interface contracts go from producer to consumers, and each shared code area has one owner.
- **Decision boundary.** The orchestrator sequences work and applies recorded owner decisions. The
  owner's request to orchestrate grants a short, exact list of writes (editing the ledger, a tracking
  issue the project or the owner names; dated answer comments on work-item issues; its own harm
  statements and handoffs in the ledger; archiving the workstream's finished sub-sessions, including
  those a previous orchestrator started), and the plugin's authority table gets a row for it. It never writes a claimed feature document. Scope,
  rule changes, merges and releases go to the owner.
- **Upgrades and close-out.** A stale session writes nothing: it reports its state to the
  orchestrator by message and pauses, and the orchestrator records the report in the ledger. Paused
  sessions are replaced once when the awaited release lands, each with the owner's handoff. Every
  status pass re-checks whether the orchestrator itself is stale. A stale orchestrator sends its
  handoff to the owner by message and stops steering; the owner starts its replacement first, and the
  replacement asks each paused session to report again, records the reports and replaces the
  sub-sessions. Archiving replaced, paused sessions and the replaced orchestrator needs one batched
  owner approval. Other sessions are archived only after a confirmed done
  and cleanup; handoffs live in the ledger, never in `/tmp`.

Project specifics go in an `## Orchestration` section of the project procedure the loop settings
already name. The plugin names no adopter.

The owner answered all twenty-seven questions on 2026-11-23, relayed by the orchestrating session
(Owner decisions below). Proof is planned, not observed: package tests that assert each rule's exact sentence
in the reference, a list of adopter terms the package must not contain, and a written walkthrough in
which the implementation reviewer confirms each rule reads as a requirement and replays each incident
to the step that stops it. R-5 found no blocking issue; this revision applies its findings with the owner's answer to Q27. Acceptance
authorizes the plugin edits, tests and docs rows on a feature branch and one PR; merging and releasing
need the owner's separate approval.

### Owner decisions

All answered on 2026-11-23 and relayed by the orchestrating session; each was the recommended option.

- Q1: project specifics live in an `## Orchestration` section of the project procedure; no new file or
  schema.
- Q2: the dependency watch is a written procedure; a forge read that errors is unknown, never clear.
- Q3: at most three new sub-sessions per batch by default, overridable in the project procedure, with
  more only once load shows the batch fit.
- Q4: owner answers reach a sub-session through a dated comment on the work item's issue, or the
  workstream ledger when the work item has no issue, never through a claimed feature document; a
  feature handoff still needs the owner in the receiving session. (Wording matched to Q14 after R-3.)
- Q5: each replacement of a stale session needs the owner's handoff in its own session, requested in
  one batch. Its stale-session part is replaced by Q19.
- Q6: nothing overrides a blocked capacity check, an owner instruction included; the orchestrator
  offers to start once the check passes.
- Q7: the next batch starts only after every session in the batch has reported its first step, at
  least 10 minutes after the last start, and a passing capacity check. Amended by Q20: a recorded
  pending or failed session no longer holds back the next batch.
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
  is done; an interrupt is only for an emergency stop, reported to the owner at once. Amended by Q24:
  the grant also covers finished sub-sessions a previous orchestrator started.
- Q14: the request to orchestrate authorizes exactly: the workstream ledger, dated owner-answer
  comments on work-item issues (never inside a claimed feature document), its own harm statements and
  handoffs in the ledger, and archiving finished sub-sessions it started; the grant gets its own row in
  `references/authority.md`; its own commits keep needing the repository's normal authority and gates.
  Amended by Q24: archiving also covers finished sub-sessions a previous orchestrator started.
- Q15: start no session that would bring the live count above the project's limit; the count gates
  admission only where the project procedure sets a limit.
- Q16: the stall rule says explicitly that the orchestrator applies no convergence threshold of its
  own, and the implementation reviewer confirms none appears.
- Q17: keep a separate skill rather than a section in `references/loop.md`. Q18 re-confirms it with a
  corrected reason.

Answered on 2026-11-23 after review R-3, relayed by the orchestrating session; each was the
recommended option.

- Q18: keep `vh-adlc-orchestrate` as its own skill. Hosts list installed skills, so a session asked to
  orchestrate finds it without entering vh-adlc; `references/loop.md` is read only by sessions
  running an operation.
- Q19: a stale session reports its state by message only and writes nothing, and the orchestrator
  records the report in the ledger. A stale orchestrator sends its handoff to the owner by message and
  stops steering. The owner starts the replacement orchestrator first, and it replaces the
  sub-sessions. Archiving replaced, paused sessions needs one batched owner approval. This replaces
  the stale-session part of Q5.
- Q20: a batch member that stays pending or fails before its first report is recorded in the ledger
  and no longer holds back the next batch; recreating it needs the owner's approval, batched with
  other questions.
- Q21: the ledger lives in a tracking issue the project procedure or the owner names, so it needs no
  commit; the grant covers editing that issue, not creating it.
- Q22: the brief names the exclusive resources, and the sub-session asks the orchestrator for its
  turn before a heavy job on one.
- Q23: one orchestrator is active per host; a second workstream on the same host is the owner's
  call.

Answered on 2026-11-23 after review R-4, relayed by the orchestrating session; each was the
recommended option.

- Q24: a replacement orchestrator asks each paused sub-session to report its state again by message
  and records the reports in the ledger. It takes over the whole workstream, so the archive grant
  covers finished sub-sessions its predecessor started.
- Q25: every status pass re-runs the loop context check, and an orchestrator that finds itself stale
  follows the stale-orchestrator rule before anything else.
- Q26: batches ramp up. A batch larger than three starts only after a batch of three has met every
  condition for the next batch, and each batch may exceed the last one that met them by at most three,
  up to the project's limit.

Answered on 2026-11-23 after review R-5, relayed by the orchestrating session; it was the recommended
option.

- Q27: a batch counts toward the ramp only if every member reported its first step, none was pending
  or failed, and the capacity check after the wait passed the first time; any other batch resets the
  next one to three.

### Background

Measured at `0c9fee77` on `main`, conventions at `vhco-pro/docs` `0c983f67` (`AGENTS.md:4`).

**Harm and simplest alternative.** The harm: the owner of a multi-session workstream loses hours per
incident (two hours on ENOSPC, a day of idle sessions on a missed merge, hours of queued jobs), every
session can be blocked by one bad commit to the shared default branch, and owner attention is spent on
review loops whose harm never justified them. It recurs on every workstream and does not heal; the same
orchestrator repeated several mistakes in one week. The simplest alternative without machinery is a
written procedure, and this feature is one: no binary command, settings schema, helper script or state
store. The smallest home for it would be an "Orchestrating sub-sessions" section in
`references/loop.md`, beside the capacity and harm rules (`references/loop.md:22-51`). That loses
discovery: hosts list each installed skill's name and description to the session (Claude Code skills
docs, Sources), so a session asked to orchestrate finds `vh-adlc-orchestrate` without entering vh-adlc,
while `references/loop.md` is read only by sessions already running an operation, and an orchestrating
session usually runs none itself. An intake row could route to a loop section too, since intake also
routes to references (`references/lifecycle.md:53`, `:62`, `:65-66`), but only after the session has
entered vh-adlc. The skill costs one checker kind, two count changes, an intake row, an authority row,
guide rows, a compatibility entry and a version bump.

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
15. The host's remote-control bridge stalled at about twenty workers: a session created then stayed
    pending with no worker, and spawned only after other sessions were archived and it was recreated.
16. On a workstation, the remote-control bridge ran in a tmux session. The owner's rule is to run it
    as a user service (a macOS LaunchAgent, or a Linux `systemd --user` unit). The owner asked for that
    setup to be documented and scripted separately, outside this feature; the reference only points to
    it.

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
- A row in `references/authority.md` for the request to orchestrate a workstream, with exactly the
  writes S-02 lists.
- An entry in `docs/reference/compatibility.md` saying `vh-adlc-orchestrate` is unverified on every
  host.
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
- Writing or scripting the bridge's user-service setup; S-50 points to wherever the owner's
  conventions or the project procedure describe it.
- Any adopter's adapter text. The orchestrator of a given repository lands its own `## Orchestration`
  section there.

## Design

### Glossary

The reference carries this table verbatim.

| Term | Meaning |
| --- | --- |
| Orchestrator | The session that starts, steers and closes sub-sessions for a workstream. |
| Sub-session | A session started for one issue or feature of the workstream, by the current orchestrator or a previous one. |
| Workstream ledger | The one durable record of every sub-session, kept in a tracking issue: its work item, worktree, state, blockers, next step, the merge order, each exclusive resource's queue and every handoff. |
| Batch | The sub-sessions started together between two capacity checks. |
| Exclusive resource | A resource only one heavy job may use at a time, such as a single test cluster. |
| Heavy job | A run that loads the host for minutes or more: a full test suite, an image build, a cluster run. |
| Status pass | One sweep over every sub-session and every recorded blocker. |
| Coordination operation | A vh-adlc operation that steers other sessions and changes no feature status itself; `vh-adlc-projects`, which coordinates GitHub Projects, is an engineering operation, not one of these. |
| Emergency stop | Interrupting a sub-session that is about to destroy data, push to a protected branch or exhaust the host; nothing else qualifies. |

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
- S-02: The owner's request to orchestrate a workstream authorizes exactly these writes: editing its workstream ledger, dated owner-answer comments on work-item issues, its own harm statements and handoffs in the ledger, and archiving the workstream's sub-sessions, including those a previous orchestrator started, once each is done.
- S-03: Scope, accepting or parking a feature, any change to or bending of a rule in the repository's instruction files, merging and releasing go to the owner.
- S-04: When unsure which side a question falls on, ask the owner.
- S-41: Never write a claimed feature document; only its owning session edits it.
- S-42: The orchestrator's own commits need the repository's normal authority for that change.

**Admission** (`## Admission`):

- S-05: Before starting any work, find its harm statement or write one in the workstream ledger, and raise disproportionate machinery with the owner as a proportionality question before the work starts.
- S-06: If any gate the work reaches next is blocked for everyone, do not start the work; finish in-flight work first.
- S-07: Run `capacity.sh` on the checkout and the temp directory before every batch; on `capacity: blocked`, start nothing.
- S-08: Nothing overrides a blocked capacity check, an owner instruction included; report the blocked lines and offer to start the batch once the check passes.
- S-09: Start at most three new sub-sessions per batch unless the project procedure sets another limit; a batch larger than three starts only when the batch before it counted toward the ramp, and may exceed that batch by at most three.
- S-52: A batch counts toward the ramp only when every member reported its first step, none was recorded as pending or failed, and the capacity check after the wait passed the first time; after any other batch, the next batch has at most three sessions.
- S-10: Start the next batch only after every session in the current batch has reported its first step or been recorded in the workstream ledger as pending or failed, at least 10 minutes after the last start, and a new capacity check passes.
- S-11: Where the project procedure sets a live-session limit, count the host's live sessions before every start and start no session that would bring the count above the limit.
- S-12: A session that stays pending without a worker is a capacity signal: record it in the workstream ledger and do not retry it; while it stays pending, start nothing new until another session has been archived, and then start at most one new session per archived session.
- S-46: Recreating a pending or failed session needs the owner's approval, batched with the other owner questions.
- S-13: Never archive running sessions to recover from overload; stop admitting and let them finish.
- S-14: Keep one queue per exclusive resource in the workstream ledger, and run one heavy job at a time on each exclusive resource.
- S-49: One orchestrator is active per host; starting a second workstream on the same host is the owner's decision.

**The brief** (`## The brief`):

- S-15: A new work item starts in a fresh worktree from an up-to-date default branch, a claimed feature continues in its owning worktree, and the sub-session reads every rule from that worktree.
- S-43: The worktree comes from the host's worktree tool or the project's worktree provisioning, never from one the orchestrator creates itself.
- S-16: The brief names the work item, its scope, the recorded decisions, the code areas the session owns and those another session owns, the interface contracts it produces or consumes, and the exclusive resources it may use.
- S-48: Before a heavy job on an exclusive resource, the sub-session asks the orchestrator for its turn and waits for it.
- S-17: The sub-session verifies the brief's claims before acting on them and reports any that are wrong.

**Status pass** (`## Status pass`):

- S-18: Run a status pass before every admission, after every sub-session report, and at least every 2 hours while any sub-session is active, unless the project procedure sets another interval.
- S-19: Each status pass lists every sub-session's state and last report and updates the workstream ledger.
- S-38: Each status pass ends with one table of every sub-session and every open owner question.
- S-39: Only the orchestrator writes the workstream ledger; sub-sessions report to the orchestrator.
- S-51: Each status pass first re-runs `bun scripts/loop/cli.ts context`; when the orchestrator's own `plugin.stale` is true, it follows the stale-orchestrator rule under Plugin upgrades before anything else.
- S-40: Without a ledger location in the project procedure, ask the owner where the ledger lives before the first batch.
- S-47: The workstream ledger is a tracking issue the project procedure or the owner names; the orchestrator edits it and never creates it.
- S-20: For every recorded blocker, read its PR or issue state with the forge CLI, and tell each dependent session as soon as it clears.
- S-21: A read that fails, times out or returns an error is unknown, never merged, clear, idle or done.
- S-22: When the spec operation's convergence trigger has fired for a sub-session, add that session's pending proportionality question to the batched owner questions, do not ask a second one, and apply no convergence threshold of its own.

**Communication and stops** (`## Communication and stops`):

- S-23: Steer a sub-session by message; interrupt only for an emergency stop, tell the owner at once, and leave resuming it to the owner.
- S-24: Record each owner answer, dated, as a comment on the work item's issue, or in the workstream ledger when the work item has no issue, and point the sub-session there.
- S-25: A feature handoff needs the owner to say it in the receiving session.
- S-26: Verify every fact and link before relaying it.
- S-27: Batch owner questions into one message, each with the decision, the options and a recommendation.
- S-28: Relay each interface contract from the producing session to every consumer when it changes, and record it in the workstream ledger.
- S-29: Each shared code area has one owning session at a time.

**Plugin upgrades** (`## Plugin upgrades`):

- S-30: When a plugin release makes sessions stale, have each report its state by message and pause, record each report in the workstream ledger, and replace the paused sessions once, when the release they wait for has landed.
- S-44: A stale session writes nothing; it reports its state to the orchestrator by message only.
- S-31: Ask the owner for every replacement's handoff in one batch; a replacement writes only after the owner hands it the feature in its own session.
- S-32: A stale orchestrator sends its handoff to the owner by message, stops steering and writes nothing; the owner starts the replacement orchestrator first, and the replacement asks each paused sub-session to report its state again by message, records those reports and replaces the sub-sessions.
- S-45: Archiving replaced, paused sessions, and a replaced stale orchestrator, needs the owner's approval, asked for in one batch.

**Own commits** (`## The orchestrator's own commits`):

- S-33: The orchestrator's own commits to a shared default branch pass the same hooks, records and local verification the repository requires of a feature.

**Watchers** (`## Watchers and tools`):

- S-34: Trust a watcher only after it has fired on a known positive case and cannot match its own command line.
- S-35: A watcher treats a nonzero exit, an API error or unreadable output as unknown and says so.
- S-50: On a workstation, run the host's remote-control bridge as a user service, as the owner's conventions or the project procedure describe, never in a terminal multiplexer.

**Close-out** (`## Close-out`):

- S-36: Apart from replaced, paused sessions and pending or failed sessions the owner approves ending, archive a sub-session only after it has reported done and confirmed its cleanup finished, and archive finished sub-sessions promptly.
- S-37: Sub-sessions send their handoffs to the orchestrator by message, and the orchestrator records each in the workstream ledger, never in `/tmp`.

### Explanation the reference adds

Around the sentences, the reference explains:

- **Admission order.** Proportion, gates, capacity and live sessions, the batch limit, then exclusive
  resources. The 10-minute wait exists because `capacity.sh` reads the one-minute load average, which
  lags sessions that have not started building, so one passing check cannot show that a large batch
  fits. That is why S-09 ramps up: with a project limit of nine, batches run three, six, nine, and a
  batch that does not count under S-52 sends the next batch back to three. Owner urgency is answered with the largest start the check allows later,
  never with an override. Pending and paused sessions count toward the live-session limit until they
  are archived.
- **The workstream ledger.** It is a tracking issue the project procedure or the owner names (S-39,
  S-40, S-47), so updating it needs no commit. If no such issue exists, the orchestrator asks the
  owner to create or name one.
- **Status pass states.** Working, idle, pending, failed and archived, as the host shows them, plus
  which sessions report `plugin.stale` and the release each waits for (S-38).
- **Stops.** A message is recoverable by the orchestrator. An interrupt makes the session treat itself
  as stopped by the owner, and it may refuse a peer's resume message. Archiving is final.
- **Emergency stop.** The glossary defines it; anything else is steered by message.
- **Exclusive resources.** The orchestrator grants turns from the ledger's queue (S-14, S-48); a
  sub-session reports when its heavy job ends so the next one can start.
- **The bridge.** The host's remote-control bridge serves every session. A stalled bridge looks like a
  pending session (S-12); running it as a user service (S-50) keeps it alive across logouts and
  terminal closes.
- **Close-out.** After the workstream's last merge, the orchestrator removes what it created, as the
  loop's clean-up section describes.

### Project procedure slot

The project procedure named by `project_procedure` (`references/loop-settings.md:40`) may hold an
`## Orchestration` section. The reference lists the fields it may declare, each in plain text:
`Ledger location` (a tracking issue), `Tracking issues`, `Exclusive resources`, `Heavy jobs`, `Worktree provisioning`,
`Batch limit`, `Live-session limit` and `Status pass interval`. Without the section or a field, the
defaults above apply; without a ledger location, the orchestrator asks the owner. The plugin never
names an adopter, its resources or its clients.

### Incident table

The reference ends with a table mapping each of the sixteen incidents in Background, in one numbered
row each, to the sentence IDs that prevent it, so a later change that drops a rule shows which incident
returns.

### Concurrency, failure and upgrade

The procedure adds no shared state beyond the workstream ledger, which only the orchestrator writes;
sub-sessions report to it. One orchestrator is active per host (S-49), so the ledger's queues and the
live-session count have one writer; a second orchestrator on the same host runs only when the owner
decides it, and the owner then splits the exclusive resources and the limit between them. A failed
forge read leaves the blocker unknown and is retried on the next status pass, which S-18 bounds at two
hours. A batch member that stays pending or fails is recorded and no longer holds back the next batch
(S-10), but while it stays pending each new start needs another session archived first (S-12);
recreating it waits for the owner (S-46). Sessions become stale as soon as a new plugin
version installs (`references/loop-settings.md:124-128`), the orchestrator included. Stale sessions
write nothing, which matches every operation's stop-before-write rule: sub-sessions report by message
(S-30, S-44). When the orchestrator is stale too, S-32 runs first. The orchestrator learns it is stale at its next
status pass (S-51); it hands off to the owner and stops steering, the owner starts its replacement,
and the replacement asks the paused sessions to report again, records the reports, replaces the
sub-sessions and asks for one batched approval to archive the paused ones and the stale orchestrator
(S-45). Rolling back the
plugin removes the skill and nothing else.

## Acceptance Criteria

- [ ] AC-01: `vh-adlc-orchestrate` is in the package as a coordination operation: its name equals its
      directory, it has a description and no model, it resolves knowledge, names the humanize guide and
      reads the loop context, and lifecycle intake routes to it. The discovery check counts eleven
      engineering operations and nineteen skills, and both guides say eleven engineering operations, one
      coordination operation and nineteen skills, with an Orchestrate row in the workflows guide, and
      `docs/reference/compatibility.md` lists `vh-adlc-orchestrate` as unverified.
- [ ] AC-02: The reference states the decision boundary, sentences S-01 to S-04, S-41 and S-42, and
      `references/authority.md` has a row for the request to orchestrate a workstream granting the writes
      S-02 lists.
- [ ] AC-03: The reference requires proportion and gate checks before new work, sentences S-05 and S-06.
- [ ] AC-04: The reference requires the capacity, batch, live-session, pending-session, overload and
      one-orchestrator rules, sentences S-07 to S-13, S-46, S-49 and S-52.
- [ ] AC-05: The reference requires a queue and one heavy job at a time per exclusive resource, and a
      sub-session's request for its turn, sentences S-14 and S-48.
- [ ] AC-06: The reference states the brief's rules, sentences S-15 to S-17 and S-43.
- [ ] AC-07: The reference requires the status pass timing, contents, dependency watch, ledger rules and
      fail-closed reads and its own staleness check, sentences S-18 to S-21, S-38 to S-40, S-47 and
      S-51.
- [ ] AC-08: The reference routes a fired convergence trigger into the batched owner questions without
      a second question or a threshold of its own, sentence S-22.
- [ ] AC-09: The reference states the communication and stop rules, sentences S-23 to S-29.
- [ ] AC-10: The reference states the plugin-upgrade rules, sentences S-30 to S-32, S-44 and S-45.
- [ ] AC-11: The reference requires the orchestrator's own commits to pass the repository's delivery
      gates, sentence S-33.
- [ ] AC-12: The reference states the watcher and bridge rules, sentences S-34, S-35 and S-50.
- [ ] AC-13: The reference states the close-out rules, sentences S-36 and S-37.
- [ ] AC-14: The reference defines the project procedure's `## Orchestration` section with its eight
      fields, and no file under `plugins/vh-adlc/` contains a term from the test's adopter list.
- [ ] AC-15: The reference's incident table maps each of the sixteen incidents to sentence IDs that
      exist, and replaying each incident against the procedure finds a step that would have stopped it.
- [ ] AC-16: The reference carries the Design's glossary table verbatim, and every rule the reference
      states is written as a requirement.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc/check.test.ts`: a coordination-operation test asserts the skill file, name, description, no `model`, `vh-adlc knowledge`, `guides/humanize-prose.md`, `scripts/loop/cli.ts context` and `references/orchestrate.md`, and that the lifecycle table names `skills/vh-adlc-orchestrate/SKILL.md`. `bun test tests/vh-adlc/triage/discovery.test.ts` asserts nineteen skill directories, eleven engineering operations with `vh-adlc-orchestrate` in the non-engineering list, "nineteen skills", "eleven engineering operations" and "one coordination operation" in both guides, a `vh-adlc-orchestrate` row in the workflows guide, and a `docs/reference/compatibility.md` line naming `vh-adlc-orchestrate` with the word "unverified". |
| AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13 | `bun test tests/vh-adlc/check.test.ts`: the test reads every S-NN sentence from this document's Required sentences section and asserts each appears verbatim, with whitespace folded, in `references/orchestrate.md` under the section its heading names. It must fail when one sentence is deleted or reworded (checked once locally by changing S-09's "three" to "five"). For AC-02 it also asserts one `references/authority.md` table row naming `skills/vh-adlc-orchestrate/SKILL.md` and each of the four writes S-02 grants: "workstream ledger", "owner-answer comments on work-item issues", "harm statements and handoffs" and "archiving"; it must fail when any one of them is removed from the row. Written procedure for the implementation reviewer: read that row and confirm it grants nothing beyond S-02, for example no feature-document write, issue creation, merge or release, recording the verdict. For AC-08, the implementation reviewer reads the whole reference and confirms it states no convergence threshold, round count or pass count of its own. |
| AC-14 | `bun test tests/vh-adlc/check.test.ts`: asserts `## Orchestration` and the eight field names in the reference; then scans every file under `plugins/vh-adlc/` for the case-insensitive adopter terms `stackweaver`, `sw-e2e`, `agent-slot`, `worktree-dev.sh` and `iac_platform`. Must pass: the package as built. Must fail: a fixture file holding each term in turn. |
| AC-15 | `bun test tests/vh-adlc/check.test.ts` asserts sixteen numbered incident rows, each naming at least one sentence ID that exists in the Required sentences section. Written procedure for the implementation reviewer: for each incident in Background, find the step in `references/orchestrate.md` that would have stopped it and record incident, step and verdict; met only when all sixteen have a step. |
| AC-16 | `bun test tests/vh-adlc/check.test.ts` asserts every row of this document's Glossary table appears verbatim in the reference. Written procedure for the implementation reviewer: read the whole reference and confirm no stated rule is softened into advice (for example "usually", "consider", "optional"), recording each rule and verdict. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-23 | R-1 | spec | `ea534657` | claude-opus-5-5 | procedural | 0 blocking, 14 should-fix, 2 nits; judgement findings go to the owner first |
| 2026-11-23 | R-2 | spec | `46ccf25a` | claude-opus-5-5 | procedural | 1 blocking, 7 should-fix, 1 nit; judgement findings go to the owner first |
| 2026-11-23 | R-3 | spec | `de1a5171` | claude-opus-5-5 | procedural | 0 blocking, 9 should-fix, 2 nits; judgement findings go to the owner first |
| 2026-11-23 | R-4 | spec | `36eed728` | claude-opus-5-5 | procedural | 0 blocking, 5 should-fix, 1 nit; judgement findings go to the owner first |
| 2026-11-23 | R-5 | spec | `20c6df0d` | claude-opus-5-5 | procedural | 0 blocking, 2 should-fix, 2 nits; judgement finding goes to the owner first |

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

### R-2

TARGET: 46ccf25a

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Required sentences S-02, S-05, S-24, S-32, S-33 and S-37; Design, Explanation the reference adds (The workstream ledger); Context, Owner summary (Communication and Decision boundary bullets); Context, Owner decisions Q4 and Q13; Acceptance Criteria AC-02, AC-03, AC-09
EVIDENCE: S-02 says the orchestrate request "authorizes writing its workstream ledger and archiving the sub-sessions it started once each is done; it authorizes no other issue or repository write." Several other required sentences need exactly such writes. S-24: "Record each owner answer, dated, in the work item's issue or feature document". S-05: "write or find its harm statement". S-33 assumes the orchestrator commits to the shared default branch. S-32 and S-37 have it write its own handoff "into the feature document" or a location the ledger names. Writing into a sub-session's feature document also breaks plugins/vh-adlc/references/authority.md:213-217 at 46ccf25a: once a feature has a `branch` claim, only the claiming session, or one the owner has handed it to in that session, may write to it. The orchestrator is neither. The sub-session edits the same file at the same time, and authority.md:79 says "A conflicting concurrent edit to the same file stops the run". So the reference this document specifies tells the orchestrator to route every owner answer through a write that S-02 and the authority reference both forbid. That route is the fix R-1 F-02 asked for and Q4 chose, so the problem it addressed (a sub-session that cannot act on an owner answer given to the orchestrator) is still there once every box is ticked. This traces to the revision at 46ccf25a, which added S-02 (from Q13) and S-24 (from Q4) together.
PROPOSAL: Make S-02 list every write the procedure requires (the ledger, owner-answer records in the work item's issue, harm statements, its own handoff and its own commits under S-33), or say each needs the owner's separate approval. Send owner answers for a claimed feature to its issue or to the ledger, never into the claimed feature document, unless the owning sub-session writes them itself.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Required sentences S-02; Design, Decision boundary; Scope (In scope); frontmatter covers; Context, Owner decisions Q13; Context, Owner summary (Decision boundary bullet)
EVIDENCE: plugins/vh-adlc/references/authority.md is the package's action-to-authority table. Line 30 requires "Separate approval for that exact action" to "end a live session". Lines 5-6 say "selecting a procedure creates no additional execution or publication permission", and lines 42-46 say "Host approval cannot supply missing task authority". Line 25 covers creating a tracking issue but not updating one as a ledger outside a ship request (line 27). S-02 grants archiving finished sub-sessions and ledger writes from the orchestrate request alone, but Scope and covers leave authority.md unchanged. An orchestrator that loads both references gets a grant in orchestrate.md that authority.md does not recognize. One implementer adds an authority.md row and the other does not, and covers forbids the first. This traces to the fold of Q13 in this revision, which answered R-1 F-14 in the new reference only.
PROPOSAL: Add an authority.md row for the orchestrate request (ledger writes, archiving finished sub-sessions it started, and any writes F-01 adds) to Scope and covers, with a Test Plan assertion. Alternatively, have S-02 defer to authority.md:30 and batch the archive approvals.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Required sentences S-30, S-32 and S-37; Design, Concurrency, failure and upgrade; Context, Owner summary (Upgrades and close-out bullet); Context, Owner decisions Q5; Acceptance Criteria AC-10, AC-13
EVIDENCE: plugins/vh-adlc/references/loop-settings.md:126-127 at 46ccf25a says that after an update "`plugin.stale` is true until the session restarts, and operations stop before writing". S-30 still requires each stale sub-session to "write its durable handoff and pause". S-32 requires a stale orchestrator to make "no repository or ledger write" but also to write "its own handoff". S-37 puts handoffs "into the feature document", which is a repository write. The document never says that a handoff write is an exception to the stale stop, or where a handoff that is not a repository write goes. Concurrency also says installing a new version "changes nothing for running sessions until they restart; a running orchestrator then follows S-32". That conflicts with S-30's premise and with loop-settings.md:127, under which the session goes stale at install time, not at restart. One implementer has stale sessions commit handoffs into feature documents. Another forbids it and leaves no durable handoff, which repeats incident 7.
PROPOSAL: State that writing a durable handoff is the one write a stale session makes, and name where it goes when the ledger or feature document is unavailable to it. Correct the Concurrency sentence to say that sessions become stale when the release installs and then follow S-30 or S-32.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Required sentences S-15, S-30 and S-31; Design, Project procedure slot (Worktree provisioning); Acceptance Criteria AC-06
EVIDENCE: S-15: "Each sub-session works in its own worktree from an up-to-date default branch". plugins/vh-adlc/references/authority.md:92 says "Work on a feature only in its owning worktree", and :93 says that outside named roles a session must "never create, remove, prune, reset or force-move a worktree". A replacement started under S-30 and S-31, or a sub-session given an already claimed feature, has to work in that feature's existing worktree on its feature branch, not a new one from the default branch. The document also does not say who creates the worktree: the orchestrator, the host tool, or the project's `Worktree provisioning` field.
PROPOSAL: Reword S-15 so a new work item starts in a fresh worktree from an up-to-date default branch, and a claimed feature continues in its owning worktree. Say the worktree comes from the host's tool or the project's provisioning, never one the orchestrator creates itself.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Required sentences S-09 and S-11; Design, Project procedure slot (Live-session limit); Context, Owner decisions Q8; Context, Owner summary (Admission bullet); Acceptance Criteria AC-04
EVIDENCE: S-11 says to "start nothing at or above the project procedure's live-session limit". With a limit of 20 and 19 live sessions, the count is below the limit, so S-09 allows a batch of three and the host ends at 22. That is the overshoot incident 15 describes, with "about twenty workers". One implementer checks the count before the batch. Another checks that count plus batch size stays at or below the limit. The Owner summary lists "the host's live-session count" as an admission check without saying that it decides anything only when the project procedure sets a limit, since Q8 gives no default.
PROPOSAL: Say "start no session that would bring the live count above the limit", and have the Owner summary say the count gates admission only where the project procedure sets a limit.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-08; Test Plan row AC-02 to AC-13; Test Plan row AC-16
EVIDENCE: AC-08 requires routing a fired trigger "without a second question or a threshold of its own". S-22 covers the second question but not the threshold. The AC-02 to AC-13 proof only asserts that S-22 is present. The AC-16 manual read only checks that rules are not softened. A reference that keeps S-22 and adds "also raise a proportionality question after five rounds" in its explanation, which is R-1 F-01's defect again, passes every listed proof.
PROPOSAL: Add the threshold clause to S-22, for example "and apply no convergence threshold of its own", or add a manual step to the AC-08 proof in which the reviewer confirms the reference defines no threshold.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Design, Explanation the reference adds (Emergency stop, The workstream ledger, Status pass states, Admission order); Design, Project procedure slot; Design, Glossary; Design, Required sentences S-23; Acceptance Criteria AC-09, AC-14, AC-16; Test Plan
EVIDENCE: Several rules the Design requires appear only in the explanation bullets, which no criterion or proof covers. Examples: "A sub-session about to destroy data, push to a protected branch or exhaust the host is an emergency; anything else is steered by message", "without one, the orchestrator asks the owner before the first batch", "Only the orchestrator writes it", and "The pass ends with one table of every session and every open owner question". AC-14 asserts only the eight field names, and AC-16 checks only that the rules present are worded as requirements. So a reference that leaves out the emergency-stop definition passes. Without that definition, S-23 ("interrupt only for an emergency stop") can be read in different ways, and incident 4 can recur. conventions/feature-documents.md at 0c983f67, Open questions, says user-facing terms the feature introduces "appear in a glossary row and are held to it by a criterion". "Emergency stop" is such a term and has no glossary row.
PROPOSAL: Add an "Emergency stop" glossary row with the explanation's meaning. Either turn the ledger-location fallback, the single-writer rule and the end-of-pass table into numbered sentences, or name them in a criterion with a proof.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Background (Harm and simplest alternative); Scope (In scope)
EVIDENCE: The harm statement says "The simplest alternative without machinery is a written procedure. This feature is that alternative". It names no rejected alternative. The feature adds more than a procedure: a new skill, a fourth checker operation kind (COORDINATION_OPERATIONS), changed skill counts in two guides and two tests, a lifecycle row, a version bump and a test that parses this document. A smaller written-procedure option is an "Orchestrating sub-sessions" section in plugins/vh-adlc/references/loop.md, which already holds the capacity and harm rules (loop.md:22-51) that every operation reads. That needs no new skill, operation kind or count changes. The document does not weigh it or say why a separate operation beats it. One possible reason is that an orchestrating session may run no vh-adlc operation and needs a skill to be discovered, but the document does not say so.
PROPOSAL: Name the loop.md-section alternative in the harm statement and give the reason the separate skill beats it, or adopt that alternative.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Context, Background (Harm and simplest alternative)
EVIDENCE: plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:75-77 at 46ccf25a: "Start Background with the harm statement from `references/loop.md`". In this document the harm statement is the last paragraph of Background, after What exists, What is missing, The incidents and Prior art.
PROPOSAL: Move the Harm and simplest alternative paragraph to the start of Background.

### R-3

TARGET: de1a5171

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context, Background (Harm and simplest alternative); Context, Owner decisions Q17
EVIDENCE: The harm statement rejects the smallest home, a section in references/loop.md, partly because "lifecycle intake routes requests only to skills (`references/lifecycle.md:51-66`)". At de1a5171 that range routes several requests to procedures that are not skills: :53 "Inspect the relevant source and answer", :62 "Edit the authoritative requested artifact", :65 "Merge only under the exact approval in `references/authority.md`, then run `after-merge` from `references/branches.md`", and :66 "Follow the maintenance procedure below". So an intake row could route orchestration requests to a reference or a loop.md section with no skill, no checker kind and no count changes. The stated cost of the skill, "one checker kind, two count changes and an intake row", also leaves out the new authority.md row, the guide rows and the version bump that Scope lists. Q17 adopts the skill "for the reason the harm statement gives", so the owner decided on a false premise. This traces to the revision at de1a5171, which added this reason in answer to R-2 F-08.
PROPOSAL: Correct the reason. If the real argument is native skill discovery by a session that never enters vh-adlc, say that and cite it. Otherwise put the corrected comparison to the owner again, since Q17 rests on the claim.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Required sentences S-30, S-31, S-32, S-36, S-37 and S-44; Design, The skill (loop frame); Design, Concurrency, failure and upgrade; Context, Owner summary (Upgrades and close-out bullet); Context, Owner decisions Q5; Acceptance Criteria AC-10
EVIDENCE: S-44 ("Writing its durable handoff is the one write a stale session makes") lives only in references/orchestrate.md, which only the orchestrator reads. Every operation a sub-session runs says "If its `plugin.stale` is true, stop before any write" (vh-adlc-spec/SKILL.md:40, vh-adlc-implement/SKILL.md:49, vh-adlc-review/SKILL.md:27, vh-adlc-tasks/SKILL.md:26, vh-adlc-ship/SKILL.md:51, vh-adlc-resume/SKILL.md:41, vh-adlc-investigate/SKILL.md:45), and references/loop-settings.md:126-127 says the same. Scope puts "Changing how sub-sessions run operations" out of scope, and loop-settings.md is not in covers. So a stale sub-session told by a peer message to write its handoff still meets a rule that forbids it. The skill "follows the loop frame", which carries the same stop line, so the orchestrator's own skill also contradicts S-32's handoff write. Second, loop-settings.md:126-127 makes every session started before an install stale, the orchestrator included. S-30 (record handoffs, replace sessions once the release lands) is then run by an orchestrator that S-32 bars from ledger writes and tells to ask for its own replacement; the document does not say which happens first or who replaces the sub-sessions. Third, a replaced, paused session is not "done", so neither S-02 nor S-36 lets the orchestrator archive it, authority.md:30 needs separate approval to end a live session, and the old sessions keep counting against S-11's live-session limit. This traces to the revision at de1a5171, which added S-44 in answer to R-2 F-03.
PROPOSAL: Either bring loop-settings.md (and the skill frame) into Scope and covers with the handoff exception, or have stale sessions report their state by message only and let a non-stale orchestrator or its replacement record it. State the order when the orchestrator is stale too, and say how replaced sessions are archived (a batched owner approval under authority.md:30).

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Required sentences S-02, S-24 and S-37; Context, Owner decisions Q4 and Q14; Context, Owner summary (Communication bullet); Acceptance Criteria AC-02, AC-09, AC-13
EVIDENCE: S-24 records every owner answer "as a comment on the work item's issue", S-37 falls back to "a comment on the work item's issue" for handoffs, and S-02 grants only "dated owner-answer comments on work-item issues". The standard allows `issue: null` for local-only work (conventions/feature-documents.md, Frontmatter), and this document itself has `issue: null`. For such a work item there is no channel for owner answers and no fallback handoff location. Q4 in Owner decisions still says "a dated record in the work item's issue or feature document", which S-02 and S-24 no longer allow. S-37 also has sub-sessions write handoffs as issue comments, but S-02 grants issue comments to the orchestrator only, and authority.md:27 gives a session issue updates only under a ship request. This traces to the revision at de1a5171, which narrowed S-24 and S-37 to issue comments.
PROPOSAL: Name the channel for a work item without an issue (for example the ledger, which S-02 already grants), and say what authority a sub-session uses for its own handoff write. Reword Q4 to match Q14.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Required sentences S-10, S-12, S-36 and S-02; Context, Owner decisions Q7 and Q8; Context, Owner summary (Admission bullet); Acceptance Criteria AC-04
EVIDENCE: S-10 starts the next batch only "after every session in the current batch has reported its first step". A session that stays pending (S-12) or fails before its first report never reports, so admissions stop for good. S-12 says "do not retry it, and start nothing new until archived sessions free a slot", but says nothing about the pending session itself. Incident 15 says the pending session "spawned only after other sessions were archived and it was recreated", so freeing a slot alone did not recover it. Recreating it means ending it first, and S-02 and S-36 only allow archiving sessions that are done; authority.md:30 needs separate approval to end a live session. One implementer waits forever, another asks the owner, a third archives and restarts the pending session without a grant.
PROPOSAL: Define the path for a batch member that stays pending or fails: it is excluded from S-10's wait once recorded in the ledger, and recreating it needs the owner's approval, batched with other questions.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design, Required sentences S-09 and S-18; Design, Explanation the reference adds (Admission order); Design, Project procedure slot (Batch limit, Status pass interval); Context, Owner decisions Q3; Context, Owner summary (Admission and Status passes bullets); Acceptance Criteria AC-04
EVIDENCE: Q3 decided "at most three new sub-sessions per batch by default, overridable in the project procedure, with more only once load shows the batch fit". S-09 says only "Start at most three new sub-sessions per batch unless the project procedure sets another limit"; the condition "more only once load shows the batch fit" appears nowhere in Design, so a project limit of ten admits ten at once on the first batch. The Owner summary says "Start at most three new sessions per batch" and "at least every two hours" without the project overrides that S-09, S-18, Q3 and Q9 give.
PROPOSAL: Fold Q3's condition into S-09 or the explanation (for example, a batch larger than three only after a previous batch of that size passed S-10), and mention both overrides in the Owner summary.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Required sentences S-02, S-19, S-32, S-33, S-39 and S-42; Design, Explanation the reference adds (The workstream ledger); Design, Project procedure slot (Ledger location); Scope (authority.md row); Acceptance Criteria AC-02
EVIDENCE: The ledger may be "a tracking issue or a document". S-02 grants writing "its workstream ledger", while S-42 says "The orchestrator's own commits need the repository's normal authority for that change" and S-33 has them pass the repository's hooks. If the ledger is a repository document, each S-19 update (every status pass, so after every sub-session report) is a commit, and probably a push to the shared default branch. authority.md has no row for committing a non-feature document to the default branch (row 14 covers feature documents under vh-adlc-spec only). One implementer reads S-02 as covering the commit and push, another needs approval for each. Creating a tracking issue for the ledger is likewise not in S-02 (authority.md:25 needs acceptance or a request).
PROPOSAL: Say whether S-02 covers committing and pushing a ledger document and creating a ledger issue, or limit the ledger to locations that need no commit, and state it in the authority row.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Required sentences S-14 and S-16; Design, Project procedure slot (Exclusive resources, Heavy jobs); Scope (Out of scope, sub-session operations); Acceptance Criteria AC-05, AC-06
EVIDENCE: S-14 keeps "one queue per exclusive resource in the workstream ledger" and runs "one heavy job at a time on each exclusive resource". Heavy jobs such as a cluster run are started by sub-sessions inside their own implement or ship operations, which Scope leaves unchanged and which do not read the ledger. The brief (S-16) names code areas, contracts and the handoff location, but not the exclusive resources or a rule to wait for the orchestrator's turn before using one. So once every box is ticked, two sub-sessions can still start cluster runs together, as in incident 12. One implementer enforces the queue by messaging, another only queues the orchestrator's own jobs.
PROPOSAL: Add to S-16 that the brief names the exclusive resources and requires the sub-session to ask the orchestrator for its turn before a heavy job on one.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Concurrency, failure and upgrade; Design, Required sentences S-11, S-14, S-32 and S-39; Design, Glossary (Workstream ledger)
EVIDENCE: The concurrency section covers only a single orchestrator ("no shared state beyond the workstream ledger, which only the orchestrator writes"). Two orchestrators can be live on one host: two workstreams, or a stale orchestrator and its replacement, since S-32 has the stale one keep "reading and messaging". Each keeps its own ledger and exclusive-resource queues, so S-14's one heavy job per resource holds per ledger, not per host, and two orchestrators can both pass S-11's live-session count and start batches at once. Two orchestrators messaging the same sub-sessions can also steer them in conflicting ways. The document leaves these paths undefined.
PROPOSAL: State that one orchestrator per host (or per exclusive resource) is the rule, or that queues live in a shared location, and that a stale orchestrator stops steering once its replacement starts.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan row AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13; Acceptance Criteria AC-02; Scope (authority.md row)
EVIDENCE: AC-02 requires an authority.md row "granting the writes S-02 lists", and Scope says "with exactly the writes S-02 lists". The proof asserts only a row naming `skills/vh-adlc-orchestrate/SKILL.md` and the words "workstream ledger" and "archiving". A row that leaves out the owner-answer comments and harm statements, or adds a grant such as writing feature documents or merging, passes. The grant is the fix for R-2's blocking finding, so a weak proof here lets that defect return.
PROPOSAL: Assert each of the four writes in the row, and add a manual step in which the implementation reviewer confirms the row grants nothing beyond S-02.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary (Admission bullet); Design, Required sentences S-06
EVIDENCE: The Owner summary says to check "that none of the gates it will reach is blocked". S-06 says "If any gate the work reaches next is blocked for everyone". The summary covers every later gate and drops "for everyone"; S-06 covers only the next gate.
PROPOSAL: Make the summary say "the next gate the work reaches is not blocked for everyone".

FINDING: F-11
KIND: factual
SEVERITY: nit
WHERE: Scope (In scope); frontmatter covers
EVIDENCE: docs/user-guides/workflows.md:17-19 sends readers to docs/reference/compatibility.md "for the lifecycle trials and limits on your host", and that page lists each operation's verified hosts (for example :152 for `vh-adlc-clean`, :246 for `vh-adlc-docs-truth`). Scope adds a new operation but no compatibility entry saying it is unverified, and covers omits docs/reference/compatibility.md.
PROPOSAL: Add an unverified entry for `vh-adlc-orchestrate` to compatibility.md, and list that file in Scope and covers.

### R-4

TARGET: 36eed72819ef25cc7383d836474f4e85d0c8a630

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Required sentences S-10, S-12 and S-46; Design, Concurrency, failure and upgrade; Design, Explanation the reference adds (Admission order); Context, Owner decisions Q7, Q8 and Q20; Context, Owner summary (Admission bullet); Acceptance Criteria AC-04
EVIDENCE: The Concurrency section says "A batch member that stays pending or fails is recorded and no longer holds back the next batch (S-10, S-12)", and Q20 says the same. S-12 says the opposite for a pending session: "record it in the workstream ledger, do not retry it, and start nothing new until archived sessions free a slot", and Q8 says "a pending session stops admissions until finished sessions are archived". So S-10 releases the batch wait while S-12 still stops every start. "Slot" is also undefined when the project sets no live-session limit, because S-11 counts sessions only "Where the project procedure sets a live-session limit". After one archive, one implementer starts a whole batch, another starts one session, and a third waits while the pending session is still listed. Q7 is not marked as amended by Q20, and the Owner summary leaves out that a pending session stops admissions. This traces to the revision at 36eed728, which added the "no longer holds back" wording in answer to R-3 F-04.
PROPOSAL: Say in S-12 and the Concurrency section that a recorded pending session releases S-10's wait but blocks new starts until one archive happens. Define "frees a slot" with and without a live-session limit, and how many sessions one archive allows. Mark Q7 as amended by Q20, and add the pending-session stop to the Owner summary.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Required sentences S-36, S-45, S-46 and S-02; Context, Owner summary (Upgrades and close-out bullet); Context, Owner decisions Q13, Q19 and Q20; Acceptance Criteria AC-04, AC-10, AC-13 and AC-16; Test Plan row AC-16
EVIDENCE: S-36 is absolute: "Archive a sub-session only after it has reported done and confirmed its cleanup finished". S-45 lets the orchestrator archive "replaced, paused sessions" with a batched owner approval, and S-46 lets it recreate a pending or failed session with approval, which ends that session first. A paused or pending session has not "reported done", so the reference would carry two required sentences that contradict each other. The Owner summary has the exception ("Other sessions are archived only after a confirmed done and cleanup"), but S-36 does not, and the AC-16 reviewer is told to confirm that each rule reads as a requirement. This traces to the revision at 36eed728, which added S-45 and S-46 in answer to R-3 F-02 and F-04.
PROPOSAL: Reword S-36 so it covers sub-sessions other than those S-45 and S-46 name, for example "Apart from S-45 and S-46, archive a sub-session only after ...", matching the Owner summary.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Required sentences S-02, S-30, S-32, S-44 and S-45; Design, Concurrency, failure and upgrade; Context, Owner summary (Decision boundary and Upgrades and close-out bullets); Context, Owner decisions Q13, Q14 and Q19; Acceptance Criteria AC-02 and AC-10
EVIDENCE: Under S-30 and S-44, stale sub-sessions send their state by message "to the orchestrator", which is the stale orchestrator when it was started before the same install. S-32 then has "the replacement records the stale reports", but the replacement is a new session that never received those messages, and S-32 sends only the orchestrator's own handoff to the owner. The document does not say whether the replacement asks each paused session again, gets the reports from the owner, or reads them some other way. Second, S-02 grants archiving only "the sub-sessions it started once each is done". The replacement did not start its predecessor's sub-sessions, so every finished one of them falls back to authority.md:30 ("end a live session" needs separate approval for that exact action). S-45 covers only replaced, paused sessions. This traces to the revision at 36eed728, which added the replacement order in answer to R-3 F-02.
PROPOSAL: State how the replacement gets the stale reports, for example by asking each paused session to report again by message. Extend S-02 and the authority row to the sub-sessions of the workstream it took over, or say that archiving those needs the owner's batched approval.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, The skill; Design, Required sentences S-30 and S-32; Design, Explanation the reference adds (Status pass states); Design, Concurrency, failure and upgrade
EVIDENCE: A session learns it is stale only from `plugin.stale` in `bun scripts/loop/cli.ts context` (plugins/vh-adlc/references/loop-settings.md:124-128), and each operation reads that once at entry (for example plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:40). The skill runs `context` once in its frame. An orchestrator stays in one long session across many status passes, so nothing in the Design makes it notice an install that lands mid-workstream. S-32 ("A stale orchestrator sends its handoff ...") and the Concurrency section ("the orchestrator included") assume it knows. The Status pass states list only "which sessions report `plugin.stale`", which covers sub-sessions. One implementer re-runs `context` on every status pass, another only when a sub-session reports stale, and a third never does, and keeps writing the ledger while stale.
PROPOSAL: Add to S-19, or a new sentence, that each status pass re-runs `bun scripts/loop/cli.ts context` and, when its own `plugin.stale` is true, follows S-32 before anything else.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Required sentences S-09 and S-10; Design, Explanation the reference adds (Admission order); Design, Project procedure slot (Batch limit); Context, Owner decisions Q3; Context, Owner summary (Admission bullet); Acceptance Criteria AC-04
EVIDENCE: Q3 decided at most three per batch, "overridable in the project procedure, with more only once load shows the batch fit". The explanation now says "S-10 is how Q3's 'more only once load shows the batch fit' holds: a project limit above three sets the batch size, but no batch starts until the one before it has reported ... and the first batch still needs S-07's check." So a project limit of fourteen starts fourteen sessions in the first batch on one passing capacity check, which is incident 2. The same paragraph says the one-minute load average "lags sessions that have not started building", so that check cannot show the batch fit. This reading leaves Q3's condition no stronger than the rule for every batch. It settles a trade-off the owner's answer did not settle, without an open question. R-3 F-05 proposed a ramp ("a batch larger than three only after a previous batch of that size passed S-10"). This traces to the revision at 36eed728.
PROPOSAL: Either add the ramp to S-09 (a batch larger than three only after an earlier batch of three passed S-10, growing step by step), or raise the reading as an Open Question for the owner.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design, Glossary (Coordination operation); Scope (guides say one coordination operation); Acceptance Criteria AC-01; Test Plan row AC-01
EVIDENCE: plugins/vh-adlc/references/lifecycle.md:54 already routes "Cross-repository GitHub Projects coordination" to `vh-adlc-projects`, which the checker counts as an engineering operation (tests/vh-adlc/check.test.ts:20). The guides would then say "one coordination operation" while the intake table calls a different, engineering operation coordination.
PROPOSAL: Note in the glossary row or the guide text that the projects operation is not a coordination operation in this sense, or pick a term that does not collide.

### R-5

TARGET: 20c6df0d56e159d5eee997b9f4a187ff60bebf86

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Required sentences S-09 and S-10; Design, Explanation the reference adds (Admission order); Context, Owner summary (Admission bullet); Context, Owner decisions Q26; Acceptance Criteria AC-04
EVIDENCE: S-09 says "each batch may exceed the last batch that met them by at most three". The Admission order explanation says "a batch that fails a condition sets the size back to the last one that passed". With a limit of nine and batches of three and six passed, a batch of nine that fails leaves six as the last batch that met the conditions, so S-09 allows another nine (six plus three), while the explanation sets the size back to six. The reference would carry both. No sentence also says what failing a condition means. S-10's conditions all hold after waiting: every member "has reported its first step or been recorded in the workstream ledger as pending or failed", "at least 10 minutes after the last start", and "a new capacity check passes", which can be re-run until it passes. So under S-09 alone no batch ever fails, and the set-back never applies. This traces to the revision at 20c6df0d, which added the ramp in answer to R-4 F-05 and Q26.
PROPOSAL: Say in S-09 when a batch counts as failed, for example when the capacity check after the wait is blocked, and what size the next batch may then have. Make the Admission order explanation and the Owner summary match that sentence exactly.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Required sentences S-09, S-10 and S-12; Design, Explanation the reference adds (Admission order); Design, Concurrency, failure and upgrade; Context, Owner decisions Q20 and Q26; Context, Owner summary (Admission bullet); Acceptance Criteria AC-04
EVIDENCE: Q26 and S-09 let a batch grow after the previous batch "has met every condition for starting the next batch". Under S-10 those conditions are met when a member has been "recorded in the workstream ledger as pending or failed". S-12 calls a pending session "a capacity signal", and incident 15 is exactly that signal. So a batch of three whose members all go pending counts as a batch that met the conditions, and once S-12's hold ends (the pending sessions are archived or recreated), S-09 allows a batch of six. The ramp treats the host's clearest overload signal as proof that the batch fitted, which is the reverse of Q3's "more only once load shows the batch fit". One implementer counts such a batch toward the ramp, another does not. This traces to the revision at 20c6df0d (Q26), combined with S-10 as amended by Q20 at 36eed728.
PROPOSAL: State in S-09 that only a batch whose members all reported their first step, with none recorded as pending or failed, counts toward the ramp. Or raise as an Open Question whether a pending or failed member resets the ramp to three.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design, Glossary (Sub-session); Design, Required sentences S-02 and S-32; Context, Owner decisions Q13, Q14 and Q24
EVIDENCE: The glossary, which the reference carries verbatim, defines a sub-session as "A session the orchestrator started for one issue or feature." S-02 now grants archiving "the workstream's sub-sessions, including those a previous orchestrator started", and Q24 says the replacement "takes over the whole workstream". Read strictly, the predecessor's sessions are not sub-sessions of the replacement by the glossary, so S-19, S-36 and S-38 ("every sub-session") might not cover them. Q13 ("archiving the sub-sessions it started") and Q14 ("archiving finished sub-sessions it started") are not marked as amended by Q24, unlike Q7, which the same revision marked as amended by Q20. This traces to the revision at 20c6df0d.
PROPOSAL: Define a sub-session as a session started for one issue or feature of the workstream, by the current or a previous orchestrator. Mark Q13 and Q14 as amended by Q24.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, Required sentences S-32, S-45 and S-11; Design, Concurrency, failure and upgrade; Design, Explanation the reference adds (Admission order)
EVIDENCE: S-32 has the stale orchestrator hand off and stop steering, and the owner starts the replacement. No sentence says who ends the stale orchestrator's session. S-02 and S-45 cover sub-sessions only, and plugins/vh-adlc/references/authority.md:30 requires "Separate approval for that exact action" to "end a live session". The explanation says paused sessions "count toward the live-session limit until they are archived", so a stopped orchestrator that stays live keeps using a live-session slot and a bridge worker.
PROPOSAL: Add to S-32 or S-45 that the replacement includes the stale orchestrator in the batched archive approval, or that the owner ends it when starting the replacement.

## Sources

- [How we built our multi-agent research system (Anthropic)](https://www.anthropic.com/engineering/multi-agent-research-system): orchestrator-worker pattern; effort-scaling rules in prompts (1 agent for simple fact-finding, 2-4 for comparisons, more than 10 for complex research); briefs need objective, output format and boundaries; a saved plan survives context limits. Read through search results; the direct fetch was refused by the fetch policy.
- [Building effective agents (Anthropic)](https://www.anthropic.com/research/building-effective-agents): orchestrator-workers pattern, where subtasks are decided per input. Read through search results.
- [Orchestrate teams of Claude Code sessions (Claude Code docs)](https://code.claude.com/docs/en/agent-teams): teams are separate sessions sharing a task list; experimental. Detail on file ownership, a starting team of 3 to 5 and cleanup came from third-party guides in search results, such as [AgentPatterns.ai](https://agentpatterns.ai/tools/claude/agent-teams/), not the official page, which the fetch policy refused.
- [Extend Claude with skills (Claude Code docs)](https://code.claude.com/docs/en/skills): the session sees each installed skill's name and description and loads a skill when a request matches it, so a skill is found without entering another skill first.
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
