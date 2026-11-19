---
status: draft
status_description: "The independent-clone collision is reproduced. The owner selected Git-remote coordination with fail-closed writer checks. Independent review and native-host validation are next; no ownership runtime is implemented or released."
issue: null
goal: "One canonical repository work item has one verified agent writer across clones, worktrees and supported hosts, with an explicit, preserved handoff."
covers:
  - AGENTS.md
  - cmd/vh-adlc/**
  - internal/ownership/**
  - internal/gate/**
  - plugins/vh-adlc/vh-adlc.lock.json
  - plugins/vh-adlc/scripts/ensure-vh-adlc.sh
  - scripts/release/lock-binary.sh
  - .github/workflows/release.yml
  - .goreleaser.yml
  - plugins/vh-adlc/scripts/loop/**
  - plugins/vh-adlc/scripts/triage/execution-lock.ts
  - plugins/vh-adlc/scripts/ownership/**
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/references/loop-settings.md
  - plugins/vh-adlc/skills/**
  - plugins/vh-adlc/agents/**
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
  - tests/vh-adlc/ownership/**
  - tests/vh-adlc/loop/**
  - tests/vh-adlc/worktree-handoff.test.ts
  - tests/vh-adlc/check.test.ts
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
---

# Plan: Single-writer ownership across agent sessions

## Context

### Owner summary

Two sessions independently implemented the same consumer issue in separate Git clones.
Both used the same feature branch name, so checking one clone's worktree list did not
find the other implementation. The owner wants this prevented before another agent
starts work, and wants a paused writer to receive a clear takeover notice.

The current framework has a published feature claim and a required human handoff,
but no shared ownership token. Its isolation helper checks one clone. A reproduction
using the actual helper and binary admits two clean feature worktrees for the same
synthetic issue: both isolation results are `continue`, and both in-progress gates pass.
The desired second-writer refusal fails. No external Git remote was used by that probe.

This feature adds an atomic owner record keyed by repository and work item. Every
write-capable workflow checks it before mutation. A different branch name, clone,
agent model or resumed session cannot establish another owner. Read-only review and
owner-delegated assessment remain possible. An authorized handoff preserves unfinished
work, changes the owner generation, and leaves a durable notice for the former writer.
Quota exhaustion and missing processes are not automatic ownership release.

The owner selected the repository's Git remote as the shared authority, with conditional
updates and a reserved coordination ref, so different clones and machines share it.
When current ownership cannot be verified, write-capable entry stays held. Source publication, PR creation, merge and deployment retain their existing grants.
Adoption must explicitly authorize coordination-state writes; it does not grant source
publication. No coordinator ref has been created for this draft.

The proposed repository conventions update resolves a missing testing page at the old
repository pin. It applies only in this isolated draft checkout; the plugin's default
knowledge pin and other sessions' checkouts are unchanged.

Accepting the final, independently reviewed document will authorize local implementation
and tests. Publishing and consumer adoption require their own authority. The runtime is
not built, tested as a fix, or released. Claude's present quota limit leaves actual
native-host acknowledgment/proof pending; a hook-contract simulation is not that proof.

### Owner decision

On 19 November the owner selected Git-remote coordination as recommended and requested
continued work, validation across Claude and Codex, takeover notification to the former
Claude session, and continued consumer consolidation. The owner also explicitly requested
publication of this draft so it is backed up remotely. Publication of the draft is distinct
from releasing or adopting a working ownership runtime.

### Measured incident and current gaps

- At `dae76bf9`, `claim()` checks only local `refs/heads/<featureBranch>` before its
  default-branch claim push (`plugins/vh-adlc/scripts/loop/claim.ts:32-60`). Initial
  claim pushes have rejection handling. Re-entering an already claimed feature has
  no persistent session owner check.
- `primaryWorktree()` reads the first local `git worktree list` result, and `isolation()`
  accepts a linked worktree (`claim.ts:65-80`). Separate clones have separate lists.
- The handoff rule explicitly says a claim is not a lock
  (`plugins/vh-adlc/references/authority.md`, Preservation and Handoff).
  `tests/vh-adlc/worktree-handoff.test.ts` grades the handoff question and preservation;
  it does not arbitrate concurrent writers.
- Triage already has a host-wide kernel lock keyed by repository
  (`plugins/vh-adlc/scripts/triage/execution-lock.ts:6-25`). That protects a running triage
  execution; it neither coordinates all lifecycle writers nor persists a paused feature's
  owner across machines.
- The synthetic two-clone result and actual failing assertion are retained in
  `/home/m/code/stackweaver-maintenance-20261106.n4ujyavc/nov19-independent-clone-ownership-reproduction.json`
  and its `runtime/probe-independent-clone-ownership.ts`. The fixture uses synthetic
  review/acceptance records solely to exercise gates; these are not real feature reviews.
- The actual collision is Stackweaver issue #1079. The accepted consumer branch at
  `3f3f7754` and the other clone at `db3a6a44` have independent implementation histories.
  Both histories and the latter's two uncommitted files are preserved. The consumer's
  selected scope, runtime policy and reconciliation remain consumer-local.

## Scope

Provide one shared ownership procedure for write-capable lifecycle entry and re-entry,
including feature authoring/implementation and selected maintenance, audit and documentation
repairs. Reuse each operation's existing records and authority checks. Resolve an existing
issue/spec/task identity before allocating a new work item. An unresolved alias or duplicate
stops the writer instead of silently creating another feature.

Store one current owner plus ordered handoff/release history. Identify its session/host,
canonical checkout and branch, accepted work item and generation. Keep private possession
tokens outside Git and redact them from diagnostics. A status command reports the owner and
canonical location so an agent does not have to ask the owner which clone is authoritative.

Keep feature specs, task order, review records, test evidence and delivery policy in their
existing consumer homes. This adds no task scheduler, PR queue, automatic merge, automatic
quota takeover or claim that arbitrary programs are prevented from editing files.

## Design

### D1: Canonical repository and work identity

Reuse existing repository identity parsing where its semantics match. The adopted identity
is independent of checkout path and transport spelling. SSH and HTTPS references to the same
repository resolve to the same key. Reject credentials in recorded identity and diagnostics.

Existing issue identity and canonical spec/task record are aliases of one work item. A
resumed claimed document must resolve its existing item. Branch names alone are insufficient.
Different features may have different owners; delegated read-only workers name the owning
item and immutable target, and cannot inherit a source-writing token.

### D2: Shared owner authority

The owner-selected Git-remote authority uses a reserved coordination ref
whose commits contain ownership records, separate from product source and release branches.
Use non-force conditional updates against the observed ref. Do not put a read-then-write issue
comment or a clone-local file in the place of an atomic claim.

Two simultaneous claims for one key must have one winner. On a rejected update, refetch and
classify the observed owner before any bounded retry. A lost response is reconciled by
reading back the exact generation and owner identity. Unknown authorization, state or remote
outcome stops write-capable work. A local cache is diagnostic and cannot grant ownership.

Adoption declares the authority and grants only its scoped coordination updates. Existing
source/issue/PR publication and merge checks remain independent. Reserve the coordination
namespace from ordinary feature cleanup and release processing. No coordination ref is
created, pushed or merged as part of specification.

Implement the shared authority in the existing Go binary, exposed through its ownership
status, acquire, check, release and transfer commands. Host adapters call that verified
binary instead of duplicating Git arbitration in prompts. Adopted configuration names one
canonical repository, remote and reserved ref. The default ref is
`refs/heads/vh-adlc/work-ownership`; adoption verifies that this namespace is excluded from
the consumer's source-release and branch-cleanup paths before any coordination push.

A versioned record binds canonical work aliases, state, generation, opaque owner/session
and checkout identity, token digest, and the last operation ID. Keep the possession token
and private absolute checkout/host details in local runtime state. Status reports local
paths only when locally resolved; remote owners are identified by their registered opaque
location and canonical source branch/spec. Unknown schema or alias mapping stops admission.

Use Git plumbing to build the coordination commit from the observed authority commit,
without modifying the caller's source index, HEAD or branches. The push is non-force and
must descend from that exact observed commit. Concurrent same-item claims cannot both win;
a rejected update reloads ownership before retry. Operation IDs make retries/read-back
idempotent. Release and transfer update records through the same compare-and-set path.

### D3: Enforce entry and continuation

Add the ownership check to the shared lifecycle entry before source mutation and to re-entry
of an existing branch. The existing local branch/worktree and preservation checks still run.
Every write-capable operation must acquire or verify the same owner generation; no operation
silently falls back to clone-local ownership. Check again before commit, push and handoff.

Integrate through shared runtime helpers and supported host adapters, rather than maintaining
separate copies of the ownership logic in Claude and Codex prompts. A tool adapter verifies
ownership before a source-mutating action. Report which boundary is actually enforced on a
host. A procedural instruction is not an enforced tool boundary. A host without the required
write guard remains read-only until a supported route is available; it cannot claim full
single-writer protection from a successful status query or Git hook alone.

Claude's adapter uses SessionStart/resume context and PreToolUse checks. Codex's adapter
uses its native hooks for Bash/unified execution, apply_patch and covered MCP/function
tools. Both call the same ownership checker and use documented denial output or exit 2.
Hook errors, missing helpers and changed/untrusted hooks must hold write-mode setup; a
hook that the client skips is not an installed fence. Keep the bootstrap exception narrow:
only the exact installed status/acquire invocation is permitted before ownership, with
validated arguments and no composed shell commands or source mutation.

Codex subagents can expose the parent's session ID. Do not grant a delegated actor the
writer's token on that basis. Use an independently scoped, native read-only client route
when the host cannot identify and fence the delegated actor. Existing reviewers already
have an independent command route that can be reused.

An admitted long-lived shell can retain an input channel: Codex write_stdin does not run
PreToolUse again. The owning execution controller must drain or stop that process and its
input channel before transfer. Unknown in-flight ownership keeps transfer held. A new
owner cannot become active while an old admitted mutator can still write. Unsupported
specialized tool paths remain outside write-mode until their boundary is verified.

Tests must distinguish logical owner arbitration, workflow entry, tool-action fencing and
publication fencing. The feature does not claim an operating-system security boundary against
arbitrary direct filesystem writes outside the adopted runtime.

### D4: Resume, release and explicit handoff

A matching owner resumes its existing record; it does not create another claim. A different
session sees the current owner/location and remains read-only until an authorized handoff.
No PID observation, timeout, quota failure or heartbeat age automatically makes the item free.

A handoff names the old owner/generation, new owner and canonical checkout. Preserve committed
history and uncommitted source/evidence before transfer. Drain or stop the previous mutating
execution before activating the replacement. If that cannot be established, remain held;
expiry alone cannot fence an in-flight write. Advance the generation atomically. Old tokens
must fail subsequent mutation and publication checks. Replaying an already completed handoff
returns its recorded result without moving ownership again.

Retain a notice targeted to the former session and any known parent/delegator. Record delivery
queued, delivered and acknowledged separately. A notice on disk is not a live acknowledgment.
If direct session messaging is unavailable, install a supported resume-visible notice and
report its limit. Do not launch a paid/out-of-quota model just to manufacture acknowledgment.
Releasing a claim requires the current owner or an explicit owner-directed transfer/closure;
completed source remains subject to its ordinary review and shipment gates.

### D5: Adoption, compatibility and bounded state

Existing consumers first inventory claimed work and detect duplicates. Ambiguity produces a
preserved conflict record and requires one selected canonical owner. Do not migrate both
clones into separate records for the same issue. Never reset, stash, delete, rebase or amend
another writer's history to establish ownership.

Update shared references, skills and compatibility documentation together. Publish through
both existing marketplace manifests and verify actual Codex/Claude adoption. The repository
pin update to `0c983f6793bfe35eb96ae95ad0c361c6200af44f` supplies the required testing guide;
the shipped plugin default pin is unchanged unless a separately reviewed change requires it.
Private host/session details remain in runtime state, not product documentation or source.
The artifacts are the existing signed Go binary and shared plugin. Run the binary's Go
checks and the plugin's Bun checks, publish the binary through the existing release
workflow, and update the plugin lock only to an observed signed/checksummed release.
Candidate validation uses the built candidate explicitly; do not invent a future version,
checksum or successful marketplace install. No new deployable service or satellite is added.


## Acceptance Criteria

- [ ] AC-01: Two simultaneous writers for the same repository/work item in independent clones have one owner; the loser stops before source mutation and receives the canonical owner/location.
- [ ] AC-02: SSH/HTTPS repository aliases, issue/spec aliases and branch/session changes cannot create another owner for the same item, while separate work items may proceed independently.
- [ ] AC-03: Resumption, unknown remote outcomes, network failure and quota/process absence cannot bypass ownership; stale generations cannot mutate or publish after handoff.
- [ ] AC-04: An authorized handoff preserves both histories and unfinished files, drains or stops the former writer, activates one replacement and records notice delivery/acknowledgment accurately.
- [ ] AC-05: Existing lifecycle and selected repair writers share the same ownership check; delegated read-only reviews remain possible and cannot obtain source-writing authority.
- [ ] AC-06: Source publication, issue/PR changes, merge, release and cleanup retain their separate gates; coordination state cannot trigger a product release or be removed as a stale feature branch.
- [ ] AC-07: Actual supported Codex and Claude routes refuse a former owner/new conflicting writer before source changes, with tested adapter limits and no unsupported-host success claim.
- [ ] AC-08: Existing consumers with duplicate/incomplete claims receive a preserved migration conflict and one explicit reconciliation path, and marketplace installs expose the verified ownership capability.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | First retain the failing two-independent-clone reproduction. Add true concurrent claimant processes against one disposable Git authority and assert one winner, zero loser source/index/branch writes, exact owner diagnostics and bounded conflict retry. Repeat in separate Git common directories. |
| AC-02 | Exercise SSH/HTTPS and `.git` spelling aliases, issue/spec association, different branch names, source paths containing spaces, resumed session IDs and two separate work items. Assert one canonical identity or an explicit ambiguity refusal. |
| AC-03 | Inject response loss after successful claim, rejected update, missing authority, inaccessible remote, old generation, process death and quota failure. Read-back reconciles the same owner; no timestamp/PID shortcut authorizes another writer. |
| AC-04 | Start with two dirty source files and committed review history. Transfer only after the old mutator is stopped/drained; replay it and attempt a stale-owner mutation. Compare exact hashes/history and ownership generation. Test direct messaging unavailable, queued notice, actual resume delivery and independent acknowledgment states. |
| AC-05 | Contract tests cover every shared write entry/re-entry and selected maintenance/audit/docs repair route. Each must reject a conflicting token. Delegate a read-only exact-head review, observe preserved source and prove it cannot claim/write under the parent's token. |
| AC-06 | Recording Git/issue/PR endpoints observe no source push, PR, merge, release or cleanup without its separate grant. The reserved authority ref is excluded from release and stale-branch paths. Existing claim-push rejection, scope preservation and delivery tests remain passing. |
| AC-07 | Run actual native Codex and Claude against two fixture clones through the declared adapters. Plant a write in the former/conflicting session and observe refusal before the file changes. Also prove a permitted owner's write and an unrelated feature. Keep unavailable model quota/native interception visibly pending; synthetic hook JSON alone cannot satisfy this row. |
| AC-08 | Seed unclaimed, valid claimed, duplicated and unknown-owner consumer records. Migration preserves all dirty bytes/reviews, selects one canonical item and records unresolved cases. Run both marketplace install/discovery paths and the required repository Go and Bun checks on the final implementation head. |

## Tasks

Pending independent spec review and the implementation gate. The owner selected Git-remote coordination and requested continuation. No implementation task is complete.

## Open Questions

None. Q1A was answered in session on 19 November: use Git-remote coordination as recommended, validate Claude and Codex, ensure the former Claude session receives the takeover notice, and continue consolidation. This selects the authority; implementation and native-host evidence are still pending.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- Current vh-adlc main `dae76bf9eca4b99368819ca03c7db1fb4a136d24`, actual claim/isolation, handoff fixture and triage execution-lock source, read 19 November 2026.
- Stackweaver local incident comparison and the two-clone probe receipts named in Context, read/run 19 November 2026. These are incident evidence, not shared implementation completion.
- [Claude Code hooks](https://code.claude.com/docs/en/hooks), read 19 November 2026: resume-context injection and pre-tool permission denial are distinct from acknowledgment or arbitrary filesystem isolation.
- [Claude Code project instructions](https://code.claude.com/docs/en/memory), read 19 November 2026: instruction text is context, not enforced configuration.

- [Codex hooks](https://learn.chatgpt.com/docs/hooks), read 19 November 2026:
  native hook coverage, exact-hook trust, parent session identity and continuing stdin
  channels constrain the supported fencing boundary. The installed CLI reports hooks enabled.
