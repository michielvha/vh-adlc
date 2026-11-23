---
status: draft
status_description: "Being written; waits for the owner's answers to three open questions, then an independent spec review."
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
session ran many sub-sessions and made fourteen kinds of mistake. They cost real time: a full btrfs
metadata pool took two hours to recover, a merged dependency went unnoticed for a day while its
dependents sat idle, fourteen sessions started at once on an overloaded host, and spec reviews ran 9
and 38 rounds before anyone weighed the harm. vh-adlc has rules for one session working one feature.
It has nothing for the session above them.

The feature adds one skill and one reference. The reference is a procedure, not a framework:

- **Admission.** Before starting any work, check that its harm justifies it, that none of the gates it
  will reach is currently blocked, and that the host can carry it (`capacity.sh`, plus the host's
  live session count). Start at most three new sessions per batch and add more only after a later
  check, with the batch running, still passes. Owner urgency never overrides a blocked check.
  Exclusive resources, such as a single test cluster, get an explicit queue with one heavy job at a
  time.
- **Status passes.** Every pass lists every session's state and checks every recorded blocker against
  its PR or issue, so a merged dependency is seen on the next pass. A watcher or command whose output
  cannot be read counts as unknown, never as success.
- **Communication.** Message sessions instead of interrupting them; verify a fact before relaying
  it; batch owner questions with a recommendation each; relay interface contracts from producer to
  consumers; give each shared code area one owner.
- **Decision boundary.** The orchestrator sequences work, applies recorded owner decisions and follows
  repository rules. Scope, constitution changes and overrides go to the owner.
- **Close-out.** Archive a session only after it confirms it is done and has cleaned up; handoffs live
  somewhere durable, never in `/tmp`. Replace sessions made stale by a plugin release once, when the
  release they wait for lands.

Project specifics (which resources are exclusive, how worktree slots are made, where the workstream
ledger lives) go in an `## Orchestration` section of the project procedure the loop settings already
name. Nothing project-specific enters the plugin.

Proof is planned, not observed: package checks that the skill is registered and that the reference
carries each rule, a check that the package names no adopter, and a written walkthrough in which the
implementation reviewer replays each recorded incident against the procedure and names the step that
prevents it. Three decisions are open: where project specifics live, whether the dependency watch gets
a helper script, and the default batch size. Acceptance authorizes the plugin edits, the tests and
the docs rows on a feature branch and one PR; merging and releasing need the owner's separate approval.

### Background

Measured at `0c9fee77` on `main`, conventions at `vhco-pro/docs` `0c983f67` (`AGENTS.md:4`).

**What exists.** The loop requires a capacity check before any fan-out and says to start nothing new
on `capacity: blocked` (`plugins/vh-adlc/references/loop.md:36-56`, `:46`). The check covers disk,
btrfs metadata and the one-minute load average per CPU (`plugins/vh-adlc/scripts/host/capacity.sh:9-13`,
`:82-85`). It printed `blocked load: 20.02 over 8 CPUs (limit: 16)` when this document was started. The
spec operation's convergence trigger asks the owner one proportionality question when review passes
stop converging (`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:111-120`), and the harm statement comes
first for any machinery (`plugins/vh-adlc/references/loop.md:22-34`). A session reports `plugin.stale`
after an upgrade and stops before writing (`plugins/vh-adlc/references/loop-settings.md:124-128`).
Merging needs separate approval of the exact action (`plugins/vh-adlc/references/authority.md:28`). A
session writes a claimed feature only after a handoff the owner gives in session
(`plugins/vh-adlc/references/authority.md:211-217`). The loop settings already name a project
procedure that every operation reads (`plugins/vh-adlc/references/loop-settings.md:40`).

**What is missing.** Every rule above is written for the session doing the work. Nothing tells a
session that starts and steers other sessions to run the check before each batch, how many to start,
when a blocked gate makes new work pointless, how to watch blockers, or which stops it may undo. No
skill is about orchestration: the package's skills are the entry, the gated operations, the content
operations and `vh-adlc-clean` (`tests/vh-adlc/check.test.ts:16-26`, `:236-240`).

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
written procedure. This feature is that alternative: one skill and one reference, no new binary
command, settings schema or state store. The only machinery under consideration is an optional helper
for the dependency watch, which Q2 weighs against the plain procedure.

## Scope

In scope:

- `plugins/vh-adlc/skills/vh-adlc-orchestrate/SKILL.md`, a coordination operation, and
  `plugins/vh-adlc/references/orchestrate.md`, its procedure, with every rule in Design.
- A row in lifecycle intake (`references/lifecycle.md`) that routes workstream orchestration requests
  to the skill.
- The package checker learns a coordination operation kind, and the skill counts move from eighteen to
  nineteen where the checks and docs state them (`tests/vh-adlc/triage/discovery.test.ts`,
  `docs/get-started/installation.md`, `docs/user-guides/workflows.md`).
- A plugin version bump.

Out of scope:

- Any new binary command, settings file or schema. Project specifics go in the existing project
  procedure.
- Automation that starts, archives or merges sessions on its own, or a scheduler. The orchestrator
  still acts through its host's session tools and the owner's approvals.
- Changing how sub-sessions run operations, review or ship. They keep their own skills.
- Host-specific session tools. The reference names actions (start, message, interrupt, archive) and
  says to use the host's equivalent.
- Any adopter's adapter text. The orchestrator of a given repository lands its own `## Orchestration`
  section there.

## Design

### Glossary

| Term | Meaning |
| --- | --- |
| Orchestrator | The session that starts, steers and closes sub-sessions for a workstream. |
| Sub-session | A session the orchestrator started for one issue or feature. |
| Workstream ledger | The one durable record of every sub-session: its work item, worktree, state, blockers, next step and the merge order. |
| Batch | The sub-sessions started together between two capacity checks. |
| Exclusive resource | A resource only one job may use at a time, such as a single test cluster. |
| Heavy job | A run that loads the host for minutes or more: a full test suite, an image build, a cluster run. |
| Status pass | One sweep over every sub-session and every recorded blocker. |

### The skill

`skills/vh-adlc-orchestrate/SKILL.md` follows the loop frame: get the binary, run `vh-adlc knowledge`
with `conventions/delivery.md`, `conventions/feature-documents.md` and `guides/humanize-prose.md`, run
`bun scripts/loop/cli.ts context` and read every file it lists, then follow `references/orchestrate.md`.
It changes no feature status; sub-sessions do that through their own operations. Its description says
it is for a session that drives many sub-sessions across a workstream.

The checker gets a fourth kind beside gated, content and host operations: `COORDINATION_OPERATIONS =
["orchestrate"]` (`tests/vh-adlc/check.test.ts:16-26`). A coordination operation exists, its name equals
its directory, it carries no `model`, it resolves knowledge first and names the humanize guide.

### Decision boundary

The orchestrator may decide alone: sequencing and batch membership, applying an owner decision already
recorded in a document, issue or the ledger, following repository rules, pausing its own admissions,
and messaging sub-sessions. It must ask the owner before: changing scope, accepting or parking a
feature, any step that changes, bends or reads around a rule in the repository's instruction files or
constitution, overriding a gate or check, merging, releasing, and anything the authority reference
already reserves for the owner (`references/authority.md`). When unsure which side a question falls on,
it asks. A recorded decision applies only to the case it named.

### Admission

Before starting any sub-session or new piece of work, in this order:

1. **Proportion.** The work has a harm statement, or the orchestrator writes one, as the loop requires
   (`references/loop.md`, Weigh the harm). Work whose machinery is out of proportion to its harm is
   raised with the owner as a proportionality question before it starts, not after review rounds.
2. **Gates.** List the gates the work will reach next (spec review, implementation review, a release,
   an owner answer, an exclusive resource). If one is currently blocked for everyone, such as a paused
   reviewer, do not start the work; it would only queue. Finish in-flight work first.
3. **Capacity.** Run `capacity.sh` on the checkout and the temp directory and read the last line. On
   `blocked`, start nothing, report the blocked lines, and wait. Also count the host's live sessions or
   workers where the host shows them; a new session that stays pending without a worker is a capacity
   signal, not something to retry. Owner urgency does not override either signal; say so and offer the
   largest batch the host allows.
4. **Work-in-progress limit.** Start at most three new sub-sessions per batch, or the project's own
   limit. Start the next batch only after a later capacity check, run once the batch is working, still
   passes. If the host turns out overloaded, stop admitting and let running work finish; do not
   archive running sessions to make room.
5. **Exclusive resources.** Keep one queue per exclusive resource in the ledger, and run one heavy job
   at a time on each shared resource. A session that needs the resource waits its turn and is told its
   place.

### The brief

Each sub-session's first message states: the work item with a link, its scope and what is out of
scope, the decisions already recorded, the code areas it owns and the ones another session owns, any
interface contract it produces or consumes, where its durable handoff goes, and how to report. It works
in its own worktree from an up-to-date default branch and reads every rule from that worktree, never
from a shared checkout another session may move. It verifies claims the brief makes before acting on
them, and reports when a claim is wrong.

### Workstream ledger

One durable record holds each sub-session's id, work item, worktree, state, blockers (each with the PR
or issue that clears it), next step and last update, plus the merge order and each exclusive
resource's queue. The project procedure names where it lives, such as a tracking issue or a document;
without one, the orchestrator asks the owner before the first batch. Handoffs a session writes for its
successor go to the location the ledger names or into the feature document, never to `/tmp`.

### Status pass

Each pass:

1. Lists every sub-session with its state from the host (working, idle, pending, failed, archived) and
   its last report, and updates the ledger.
2. **Dependency watch.** For every recorded blocker, reads the PR or issue state (merged, closed, open)
   from the forge, and tells each dependent session as soon as its blocker clears.
3. **Stall check.** For a sub-session in spec review, reads its Review Log. When the spec operation's
   convergence trigger has fired, or the passes keep finding new blocking issues, the orchestrator
   raises the proportionality question with the owner instead of relaying another revision. It uses
   the spec operation's trigger and does not define its own threshold.
4. **Staleness.** Records which sessions report `plugin.stale` and which release they wait for.
5. Reports one table of every session's state and every open owner question.

A read that fails, times out or returns an error counts as unknown and is reported as unknown, never
as merged, clear, idle or done.

### Communication and stops

- Steer a sub-session by sending it a message. Interrupt only for an emergency stop, and treat an
  interrupted session as stopped by the owner: it may refuse a peer's resume message, so resuming it is
  the owner's call. Archiving is final for that session.
- Verify a fact before relaying it (run the command, open the page, check the repository of every
  link), and let sub-sessions verify what they are told.
- Batch owner questions into one message, each with the decision, the options and a recommendation.
- Relay an interface contract from the producing session to every consumer when it changes, and
  record it in the ledger.
- Give each shared code area one owning session at a time; others ask that owner or wait.

### Plugin upgrades

When a plugin release makes sessions stale, ask each to write its durable handoff and pause. Replace
the paused sessions once, when the release they wait for has landed, rather than one by one as each
hits the stale check. A replacement starts from the handoff and the ledger.

### The orchestrator's own commits

An orchestrator that commits to a shared default branch follows the same delivery gates as a feature:
the repository's hooks and checks, required records such as a changelog entry, and the local
verification the repository names. A red default branch blocks every session, so a fix to it comes
first.

### Watchers and tools

A watcher or script the orchestrator relies on is checked first: it must fire on a known positive case
before it is trusted, must not match its own command line, and must treat a nonzero exit, an API error
or unreadable output as unknown and say so. The orchestrator reads a tool's actual output before
reporting what it means.

### Close-out

Archive a sub-session only after it has reported done and confirmed its cleanup finished. Archive
finished sessions promptly so host slots free up. After the workstream's last merge, the orchestrator
removes what it created, as the loop's clean-up section describes.

### Project procedure slot

The project procedure named by `project_procedure` (`references/loop-settings.md:40`) may hold an
`## Orchestration` section. The reference lists what it may declare: the ledger location, tracking
issues, exclusive resources and their queue rules, which jobs count as heavy, how a sub-session gets a
worktree or isolated environment, and a different batch limit. Without the section, the defaults above
apply. The plugin never names an adopter, its resources or its clients.

### Incident table

The reference ends with a table mapping each of the fifteen incidents in Background to the rule above
that prevents it, so a later change that drops a rule shows which incident returns.

### Concurrency, failure and upgrade

The procedure adds no shared state of its own beyond the ledger, which only the orchestrator writes;
sub-sessions report to it rather than editing it. A failed forge read leaves the blocker as unknown and
is retried on the next pass. Installing the new plugin version changes nothing for running sessions
until they restart; an orchestrator already running keeps its old instructions until replaced, which
is the staleness case above. Rolling back the plugin removes the skill and nothing else.

## Acceptance Criteria

- [ ] AC-01: `vh-adlc-orchestrate` is in the package as a coordination operation: its name equals its
      directory, it has a description and no model, it resolves knowledge, names the humanize guide and
      reads the loop context, and lifecycle intake, the workflows guide and the installation guide
      list it with the skill count at nineteen.
- [ ] AC-02: The reference states the decision boundary: what the orchestrator decides alone, and that
      scope, any change or bending of a constitution rule, overrides, merges and releases go to the
      owner, with "ask when unsure".
- [ ] AC-03: The reference's admission requires, before any new work, a harm statement with a
      proportionality question for disproportionate machinery, and a check that none of the work's next
      gates is blocked, finishing in-flight work first.
- [ ] AC-04: The reference's admission requires `capacity.sh` before every batch, the host's live
      session count, a default limit of three new sub-sessions per batch, the next batch only after a
      later passing check with the batch running, a pending session read as a capacity signal, owner
      urgency never overriding a blocked check, and no archiving of running sessions to recover from
      overload.
- [ ] AC-05: The reference requires a queue per exclusive resource in the ledger and one heavy job at a
      time per shared resource.
- [ ] AC-06: The reference's brief requires an own worktree from an up-to-date default branch, rules
      read from that worktree, owned and foreign code areas, interface contracts, a durable handoff
      location, and that the session verify the brief's claims.
- [ ] AC-07: The reference's status pass lists every sub-session's state, checks every recorded blocker
      against its PR or issue each pass and tells dependents when it clears, and reads a failed or
      erroring read as unknown.
- [ ] AC-08: The reference's status pass applies the spec operation's convergence trigger to
      sub-sessions in spec review and raises the proportionality question with the owner, without its
      own threshold.
- [ ] AC-09: The reference says to steer by message, to interrupt only for an emergency stop whose
      resumption is the owner's, to verify facts and links before relaying, to batch owner questions with
      recommendations, to relay interface contracts and to keep one owner per shared code area.
- [ ] AC-10: The reference says to pause stale sessions with a durable handoff and replace them once
      when the awaited release lands.
- [ ] AC-11: The reference requires the orchestrator's own commits to a shared default branch to follow
      the repository's delivery gates and records.
- [ ] AC-12: The reference requires a watcher to fire on a known positive before it is trusted, not to
      match its own command line, and to fail closed on errors.
- [ ] AC-13: The reference requires archiving only after a confirmed done and finished cleanup,
      prompt archiving of finished sessions, and handoffs outside `/tmp`.
- [ ] AC-14: The reference defines the project procedure's `## Orchestration` section and its fields,
      and no file under `plugins/vh-adlc/` names an adopter repository.
- [ ] AC-15: The reference's incident table maps each of the fifteen incidents to the rule that
      prevents it, and replaying each incident against the procedure finds a step that would have
      stopped it.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc/check.test.ts`: a coordination-operation test asserts the skill file, name, description, no `model`, `vh-adlc knowledge`, `guides/humanize-prose.md`, `scripts/loop/cli.ts context` and `references/orchestrate.md`; it asserts the lifecycle row names `skills/vh-adlc-orchestrate/SKILL.md`. `bun test tests/vh-adlc/triage/discovery.test.ts` asserts nineteen skills, "nineteen skills" in both guides and the `vh-adlc-orchestrate` row in the workflows guide. |
| AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13 | `bun test tests/vh-adlc/check.test.ts`: one test per criterion asserts that the named section of `references/orchestrate.md` exists and carries the criterion's key terms, for example `capacity.sh`, `three` and `pending` under Admission for AC-04, and `unknown` under Status pass for AC-07. Each must fail on a reference with that section removed (checked once by deleting the section locally). |
| AC-14 | `bun test tests/vh-adlc/check.test.ts`: asserts the `## Orchestration` section and its fields in the reference, and that no file under `plugins/vh-adlc/` matches `/stackweaver/i` (must fail: a file containing `Stackweaver`; must pass: the current package). |
| AC-15 | `bun test tests/vh-adlc/check.test.ts` asserts fifteen numbered incident rows, each naming a reference section that exists. Written procedure for the implementation reviewer: for each incident in Background, find the step in `references/orchestrate.md` that would have stopped it and record incident, step and verdict; the criterion is met only when all fifteen have a step. |

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q1: Where should each project's orchestration specifics live?

**Recommendation:** A. A section in the project procedure the loop settings already name; no new file
or schema.

| Option | You get | It costs |
| --- | --- | --- |
| **A. `## Orchestration` in the project procedure** | No new machinery; every operation already reads that file; free-form text fits resources like a single cluster | Not machine-checked; a typo in a field is not caught |
| **B. A new `.vh-adlc/orchestrate.yaml`** | Typed fields (batch limit, exclusive resources) a helper could read | A schema, reader, tests and docs for values only the orchestrator reads |

**Why this is yours:** it decides whether orchestration settings become a public settings contract.

### Q2: Should the dependency watch get a helper script?

**Recommendation:** A. A written procedure: read each blocker's state with the forge CLI and treat any
error as unknown.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Procedure only** | Nothing to maintain; works on any forge CLI | The orchestrator can still misread output, though the fail-closed rule covers the observed case |
| **B. A helper that reads the ledger's blockers and reports state, failing closed** | One command per pass; structured unknowns | Code, tests and a ledger format the helper must parse, for a check run a few times a day |

**Why this is yours:** it weighs a missed merge (a day of idle sessions once) against new machinery.

### Q3: How many new sub-sessions may one batch start by default?

**Recommendation:** A. Three, overridable in the project procedure.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Three per batch** | Matches the observed safe size and the few-workers norm in the sources | A large backlog takes several batches |
| **B. Five per batch** | Faster ramp on a strong host | On the recorded host, five sessions building at once already exceeded the load limit |
| **C. No fixed number; capacity check only** | Simplest rule | The check reads one-minute load, which lags sessions that have not started building yet |

**Why this is yours:** it sets a default every adopter inherits.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

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
