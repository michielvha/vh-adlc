# Orchestrating a workstream

This procedure is for the orchestrator: a session that starts, steers and closes sub-sessions across
a workstream, one per issue or feature. Sub-sessions run their own vh-adlc operations, and this
procedure changes none of them. The orchestrator changes no feature status itself.

Each rule below is a requirement. Project specifics go in the project procedure's
`## Orchestration` section, described at the end. The host's session tools differ, so this page
names the actions (start, message, interrupt, archive) and you use the host's equivalent.

## Glossary

| Term | Meaning |
| --- | --- |
| Orchestrator | The session that starts, steers and closes sub-sessions for a workstream. |
| Sub-session | A session started for one issue or feature of the workstream, by the current orchestrator or a previous one. |
| Workstream ledger | The one durable record of every sub-session, kept in a tracking issue: its work item, worktree, state, blockers, next step, the merge order, each exclusive resource's queue, every handoff, and each batch's members, size and whether it counted toward the ramp. |
| Batch | The sub-sessions started together between two capacity checks. |
| Exclusive resource | A resource only one heavy job may use at a time, such as a single test cluster. |
| Heavy job | A run that loads the host for minutes or more: a full test suite, an image build, a cluster run. |
| Status pass | One sweep over every sub-session and every recorded blocker. |
| Coordination operation | A vh-adlc operation that steers other sessions and changes no feature status itself; `vh-adlc-projects`, which coordinates GitHub Projects, is an engineering operation, not one of these. |
| Emergency stop | Interrupting a sub-session that is about to destroy data, push to a protected branch or exhaust the host; nothing else qualifies. |

## Decision boundary

The orchestrator decides alone: sequencing, batch membership, applying a recorded owner decision to the case it names, following repository rules, pausing its own admissions and messaging sub-sessions.

The owner's request to orchestrate a workstream authorizes exactly these writes: editing its workstream ledger, dated owner-answer comments on work-item issues, its own harm statements and handoffs in the ledger, and archiving the workstream's sub-sessions, including those a previous orchestrator started, once each is done.

That grant is also a row in `authority.md`. Anything outside it needs the authority that table
gives for the action.

Scope, accepting or parking a feature, any change to or bending of a rule in the repository's instruction files, merging and releasing go to the owner.

When unsure which side a question falls on, ask the owner.

Never write a claimed feature document; only its owning session edits it.

The orchestrator's own commits need the repository's normal authority for that change.

## Admission

Check in this order before any start: proportion, gates, capacity and live sessions, the batch
limit, then exclusive resources.

Before starting any work, find its harm statement or write one in the workstream ledger, and raise disproportionate machinery with the owner as a proportionality question before the work starts.

If any gate the work reaches next is blocked for everyone, do not start the work; finish in-flight work first.

Run `capacity.sh` on the checkout and the temp directory before every batch; on `capacity: blocked`, start nothing.

The capacity check is `scripts/host/capacity.sh`, as the loop's capacity section describes.

Nothing overrides a blocked capacity check, an owner instruction included; report the blocked lines and offer to start the batch once the check passes.

When the owner is in a hurry, answer with the largest start the check allows later, never with an
override.

Start at most three new sub-sessions per batch unless the project procedure sets another limit; a batch larger than three starts only when the batch before it counted toward the ramp, and may exceed that batch by at most three.

A batch counts toward the ramp only when every member reported its first step, none was recorded as pending or failed, and the capacity check after the wait passed the first time; after any other batch, the next batch has at most three sessions.

Start the next batch only after every session in the current batch has reported its first step or been recorded in the workstream ledger as pending or failed, at least 10 minutes after the last start, and a new capacity check passes.

The 10-minute wait exists because `capacity.sh` reads the one-minute load average, which lags
sessions that have not started building, so one passing check cannot show that a large batch fits.
That is why batches ramp up: with a project limit of nine, batches run three, six, nine, and a
batch that does not count sends the next batch back to three. Record each batch's members, its size
and whether it counted in the workstream ledger, so whoever takes over knows where the ramp stands.

Where the project procedure sets a live-session limit, count the host's live sessions before every start and start no session that would bring the count above the limit.

Pending and paused sessions count toward the live-session limit until they are archived.

A session that stays pending without a worker is a capacity signal: record it in the workstream ledger and do not retry it; while it stays pending, start nothing new until another session has been archived, and then start at most one new session per archived session.

Recreating a pending or failed session needs the owner's approval, batched with the other owner questions.

Never archive running sessions to recover from overload; stop admitting and let them finish.

Keep one queue per exclusive resource in the workstream ledger, and run one heavy job at a time on each exclusive resource.

One orchestrator is active per host; starting a second workstream on the same host is the owner's decision.

A second orchestrator on the same host runs only when the owner decides it, and the owner then
splits the exclusive resources and the live-session limit between the two.

## The brief

A new work item starts in a fresh worktree from an up-to-date default branch, a claimed feature continues in its owning worktree, and the sub-session reads every rule from that worktree.

The worktree comes from the host's worktree tool or the project's worktree provisioning, never from one the orchestrator creates itself.

The brief names the work item, its scope, the recorded decisions, the code areas the session owns and those another session owns, the interface contracts it produces or consumes, and the exclusive resources it may use.

Before a heavy job on an exclusive resource, the sub-session asks the orchestrator for its turn and waits for it.

The orchestrator grants turns from the queue in the workstream ledger. A sub-session reports when
its heavy job ends, so the next one in the queue can start.

The sub-session verifies the brief's claims before acting on them and reports any that are wrong.

## Status pass

Run a status pass before every admission, after every sub-session report, and at least every 2 hours while any sub-session is active, unless the project procedure sets another interval.

Each status pass first re-runs `bun scripts/loop/cli.ts context`; when the orchestrator's own `plugin.stale` is true, it follows the stale-orchestrator rule under Plugin upgrades before anything else.

Each status pass lists every sub-session's state and last report and updates the workstream ledger.

Record the state each sub-session shows on the host: working, idle, pending, failed or archived.
Also record which sessions report `plugin.stale` and the release each one waits for.

Each status pass ends with one table of every sub-session and every open owner question.

Only the orchestrator writes the workstream ledger; sub-sessions report to the orchestrator.

Without a ledger location in the project procedure, ask the owner where the ledger lives before the first batch.

The workstream ledger is a tracking issue the project procedure or the owner names; the orchestrator edits it and never creates it.

Because the ledger is a tracking issue, updating it needs no commit. If no such issue exists, ask the
owner to create or name one.

For every recorded blocker, read its PR or issue state with the forge CLI, and tell each dependent session as soon as it clears.

A read that fails, times out or returns an error is unknown, never merged, clear, idle or done.

A failed read is retried on the next status pass.

When the spec operation's convergence trigger has fired for a sub-session, add that session's pending proportionality question to the batched owner questions, do not ask a second one, and apply no convergence threshold of its own.

## Communication and stops

Steer a sub-session by message; interrupt only for an emergency stop, tell the owner at once, and leave resuming it to the owner.

A message can be recovered from: the orchestrator can send another. An interrupt makes the session
treat itself as stopped by the owner, and it may then refuse a peer's message to resume. Archiving is
final. The glossary defines an emergency stop; steer everything else by message.

Record each owner answer, dated, as a comment on the work item's issue, or in the workstream ledger when the work item has no issue, and point the sub-session there.

A feature handoff needs the owner to say it in the receiving session.

Verify every fact and link before relaying it.

Batch owner questions into one message, each with the decision, the options and a recommendation.

Relay each interface contract from the producing session to every consumer when it changes, and record it in the workstream ledger.

Each shared code area has one owning session at a time.

## Plugin upgrades

A new plugin install makes every session started before it stale, the orchestrator included
(`loop-settings.md`). Stale sessions write nothing, which matches every operation's rule to stop
before any write.

When a plugin release makes sessions stale, have each report its state by message and pause, record each report in the workstream ledger, and replace the paused sessions once, when the release they wait for has landed.

A stale session writes nothing; it reports its state to the orchestrator by message only.

Ask the owner for every replacement's handoff in one batch; a replacement writes only after the owner hands it the feature in its own session.

A stale orchestrator sends its handoff to the owner by message, stops steering and writes nothing; the owner starts the replacement orchestrator first, and the replacement asks each paused sub-session to report its state again by message, records those reports and replaces the sub-sessions.

Archiving paused sessions, and a replaced stale orchestrator, needs the owner's approval, asked for in one batch; under that approval, archive each paused session as soon as its report is in the workstream ledger, before its replacement starts.

Archive a paused session only in a way that keeps its worktree, branch and uncommitted changes for
its replacement, and make sure its ledger report names that worktree. Where the host's archive
action would remove the worktree, ask the owner before archiving it.

Replacements are new sub-sessions and go through admission like any other.

When the orchestrator is stale too, the stale-orchestrator rule comes first. The replacement then
collects the reports again, records them, asks for the one batched archive approval, and starts the
replacements through admission, so paused sessions do not hold the live-session slots their
replacements need.

## The orchestrator's own commits

The orchestrator's own commits to a shared default branch pass the same hooks, records and local verification the repository requires of a feature.

## Watchers and tools

Trust a watcher only after it has fired on a known positive case and cannot match its own command line.

A watcher treats a nonzero exit, an API error or unreadable output as unknown and says so.

On a workstation, run the host's remote-control bridge as a user service, as the owner's conventions or the project procedure describe, never in a terminal multiplexer.

The bridge serves every session on the host. A stalled bridge looks like a pending session (see
Admission). Running it as a user service, a macOS LaunchAgent or a Linux `systemd --user` unit, keeps
it alive across logouts and closed terminals. `scripts/host/remote-control.sh` installs, reports and
removes that service, and the plugin's Remote Control host guide describes it.

## Close-out

Apart from paused sessions and pending or failed sessions the owner approves ending, archive a sub-session only after it has reported done and confirmed its cleanup finished, and archive finished sub-sessions promptly.

Sub-sessions send their handoffs to the orchestrator by message, and the orchestrator records each in the workstream ledger, never in `/tmp`.

After the workstream's last merge, remove what the orchestrator created, as the loop's clean-up
section describes.

## Project procedure section

The project procedure that the loop settings name in `project_procedure` may hold an
`## Orchestration` section. Each field is plain text:

- `Ledger location`: the tracking issue that holds the workstream ledger.
- `Tracking issues`: issues that record merge order or cross-feature decisions.
- `Exclusive resources`: resources only one heavy job may use at a time.
- `Heavy jobs`: the project's commands that count as heavy jobs.
- `Worktree provisioning`: how a sub-session gets its worktree when the host has no worktree tool.
- `Batch limit`: the largest batch, reached through the ramp.
- `Live-session limit`: the most live sessions the host may carry.
- `Status pass interval`: the longest gap between status passes.

The defaults above apply to any missing section or field. Without a ledger location, ask the owner.

## Incidents

Each row is a failure from a real workstream and the rules that stop it. If a change drops one of
these rules, the incident can happen again.

| Incident | What happened | Rules |
| --- | --- | --- |
| 1 | Sessions started without a disk check; btrfs metadata filled and the host stopped writing. | S-07 |
| 2 | An urgent request started fourteen sessions while the capacity check said blocked, and the recovery tried to archive them all. | S-08, S-09, S-52, S-13 |
| 3 | Spec drafts started while spec reviews were paused for everyone, so they queued behind the same blocker. | S-06 |
| 4 | An interrupted sub-session read the interrupt as an owner stop and refused a peer's resume message. | S-23 |
| 5 | A merged upstream dependency went unnoticed for a day while dependent sessions sat idle. | S-20, S-21 |
| 6 | Spec reviews ran 9 and 38 rounds on features whose machinery outweighed their harm. | S-05, S-22 |
| 7 | Plugin upgrades made sessions stale, and replacing them one by one caused churn. | S-30, S-31, S-53 |
| 8 | One watcher matched its own command line and never fired; another read an API error as success. | S-34, S-35 |
| 9 | The orchestrator's own commit skipped a record the default branch requires, and CI went red for every session. | S-33 |
| 10 | The orchestrator settled a question that bent a repository rule instead of asking the owner. | S-03, S-04 |
| 11 | An issue link pointed at the wrong repository, and a relayed technical fact was wrong. | S-26, S-17 |
| 12 | A cluster run and several integration suites ran at once, and every job waited hours on capacity. | S-14, S-48 |
| 13 | A session was archived while still cleaning up, and handoff files in `/tmp` were swept away. | S-36, S-37 |
| 14 | Sessions read rules from a shared checkout that another session had moved. | S-15, S-43 |
| 15 | The host's remote-control bridge stalled at about twenty workers, and a new session stayed pending until others were archived and it was recreated. | S-11, S-12, S-46 |
| 16 | On a workstation, the remote-control bridge ran in a terminal multiplexer instead of as a user service. | S-50 |
