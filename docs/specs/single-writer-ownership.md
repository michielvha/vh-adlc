---
status: draft
status_description: "The owner selected Git-remote coordination. R-1 found two blocking and five should-fix gaps; release/admission, compatible-client rollout and authority initialization await owner decisions. No ownership runtime is implemented or released."
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

Q1A was answered in session on 19 November: use Git-remote coordination as recommended,
validate Claude and Codex, ensure the former Claude session receives the takeover notice,
and continue consolidation. R-1 identified the following decisions before revision.

### Q2: Should release and handoff use one closing protocol that holds unsupported writer routes?

**Recommendation:** A. Close admission, account for and drain every admitted action,
invalidate the old token, then advance the generation. Keep a native route read-only
unless it refuses mutation when its checker fails, including failure after setup.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Close, drain and fence** | One writer through release, reacquisition and handoff, including an action paused during admission. | A stuck action or unsupported native boundary holds replacement writing. |
| **B. Keep this design pending** | Time to choose another execution protocol. | No validated coordination capability can be implemented from the current design. |

**Why this is yours:** R-1 F-02 and F-03 require an execution and release policy;
F-01 also rules out treating a successful native-hook setup as continued enforcement.
This affects which sessions may write and when replacement work may begin.

### Q3: Should adoption and rollback hold every incompatible writer?

**Recommendation:** A. Activate only after known writers are stopped or upgraded;
a downgrade preserves authority history and holds writing until compatible again.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Require compatible writers** | Older paused clients and downgrades cannot silently bypass an adopted ownership rule. | Adoption requires a writer inventory and coordinated cutover; rollback cannot resume incompatible writing. |
| **B. Keep this design pending** | Time to choose another compatibility policy. | R-1 F-04 remains unresolved and rollout stays blocked. |

**Why this is yours:** Existing client versions never check remote ownership.
Stopping or upgrading them changes the operator's cutover and recovery procedure.

### Q4: Should authority creation require explicit adoption and refuse automatic recreation?

**Recommendation:** A. Initialize through an explicitly authorized adoption step,
bind its identity in repository configuration and admit one concurrent initializer.
An established ref that disappears stops writers instead of resetting ownership.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Explicit initialization** | A fresh clone distinguishes first adoption from lost established state; response loss cannot create another authority. | Adoption records the authority identity, and missing state requires recovery. |
| **B. Keep this design pending** | Time to choose another bootstrap policy. | R-1 F-05 remains unresolved and no coordinator ref is created. |

**Why this is yours:** Creating the shared ref is a remote effect, and recovery must
preserve existing ownership rather than infer permission from its absence.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-19 | R-1 | spec | `7e7ebe74c28f4071f20f3d963b2e54a6a24418c3` | gpt-6.1-sol | procedural | Two blocking and five should-fix findings; native failure refusal and ownership transitions need revision. |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Context, Owner summary; Design D2, unknown outcomes; Design D3, host fencing and native hooks; AC-07; Test Plan, AC-07.
EVIDENCE: The native-hook design was added in this revision. D3 requires hook errors and missing helpers to hold write-mode setup, but provides no enforcement when an installed hook subsequently fails. The [official Codex hooks documentation](https://learn.chatgpt.com/docs/hooks) documents failure paths that continue the tool call, including unsupported PreToolUse output and unavailable MCP hook tools. A successful setup check therefore cannot establish continued refusal before source mutation. The native scenario tests conflicting ownership with a working adapter, so it can pass while this bypass remains.
PROPOSAL: Specify a route that prevents mutation when the checker cannot execute or return a valid decision, and leave routes without that capability unavailable for writing. Extend native validation to break the helper after successful setup and verify that source mutation remains blocked.

FINDING: F-02
KIND: judgement
SEVERITY: blocking
WHERE: Context, Owner summary; Scope, ownership and release history; Design D2, release commands and conditional updates; Design D3, execution draining; Design D4, release and handoff; AC-01, AC-03, AC-04; Test Plan, AC-01, AC-03, AC-04.
EVIDENCE: D3 and D4 require draining before transfer, while the release rule at lines 229-230 requires only the current owner or an explicit owner-directed transfer/closure. No release transition requires quiescence, invalidates the released token, or preserves a generation across reacquisition. An admitted shell can consequently survive release while another session acquires the freed item. The proof rows exercise transfer rather than release followed by acquisition.
PROPOSAL: Decide and specify the release protocol, including stopping admission, draining existing mutators, invalidating tokens and preserving generation history before another acquisition succeeds. Add a release/reacquire scenario with an admitted old mutator and stale-token attempts.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design D3, checks before mutation and execution-controller draining; Design D4, handoff ordering; AC-04, AC-07; Test Plan, AC-04, AC-07.
EVIDENCE: D3 checks ownership before a tool action and requires the execution controller to drain processes before transfer. It does not define how admission is registered or closed atomically with that drain. A request can pass its ownership check, pause before process registration, and start after another request observes an empty execution set and transfers ownership. The stated invariant forbids this outcome, but the design supplies no ordering that prevents it and neither proof row schedules this interleaving.
PROPOSAL: Define the synchronization between action admission, closing a generation, tracking admitted actions and activating its replacement. Add a deterministic test that pauses an action after its ownership check and attempts transfer before allowing the action to continue.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary, migration and validation; Design D3, unsupported-host behavior; Design D5, adoption and compatibility; AC-07, AC-08; Test Plan, AC-07, AC-08.
EVIDENCE: D5 inventories claimed documents and installs the new binary/plugin, but defines no mixed-version cutover or rollback behavior. The inspected predecessor claim and isolation paths in plugins/vh-adlc/scripts/loop/claim.ts do not consult remote ownership. An older paused client can therefore resume after another host adopts the feature, and an ordinary plugin downgrade can restore that behavior. Unknown-schema refusal in the new binary does not govern those older callers. This revision adds the signed-binary and plugin-lock rollout without defining these transitions.
PROPOSAL: Specify the conditions for activating ownership across existing sessions and hosts, plus a rollback procedure that preserves authority records and holds incompatible writers. Add upgrade and downgrade scenarios starting with an existing claimed feature and an older paused client.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design D2, adoption, reserved ref, observed-parent updates and unknown outcomes; Design D3, bootstrap exception; Design D5, adoption; AC-03, AC-08; Test Plan, AC-03, AC-08.
EVIDENCE: D2 requires coordination commits to descend from the exact observed authority commit. On first adoption that commit does not exist. The document declares scoped coordination authority but never defines initialization, concurrent initializers, or how a fresh clone distinguishes an uninitialized authority from a previously initialized authority whose ref is missing. AC-03's proof treats missing authority as a refusal case. The reserved-ref and observed-parent requirements were added in this revision.
PROPOSAL: Define an explicitly authorized initialization transition and how subsequent clients recognize initialized authority. Test concurrent initialization, response loss during initialization, and disappearance of an established ref without permitting automatic ownership reset.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design D3, checks before commit and push; Design D4, stale-token publication refusal; AC-03; Test Plan, AC-03, AC-04, AC-06, AC-07.
EVIDENCE: AC-03 requires stale generations to lose both mutation and publication authority. The AC-04 row attempts a stale-owner mutation, AC-07 observes source changes, and AC-06 checks publication without its separate grant. None explicitly attempts publication with a stale ownership token and an otherwise valid publication grant. A publication path that checks the grant but ignores ownership can satisfy these stated scenarios.
PROPOSAL: Add a stale-generation publication attempt after handoff using an otherwise valid grant, and verify that the destination receives no applied mutation. Pair it with a successful current-owner attempt using the same publication authority.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Scope; Design D1-D4; Acceptance Criteria; Test Plan.
EVIDENCE: The pinned conventions/feature-documents.md:168-169 requires introduced user-facing terms to appear in glossary rows and be held to those definitions by a criterion. The document introduces ownership commands, generations, possession tokens and held admission without a glossary or a criterion checking their user-facing meanings. In particular, “owner” denotes both the human authorizer and the agent recorded as writer.
PROPOSAL: Add glossary rows distinguishing the human authorizer, current writer, work item, generation, possession token and held state. Add criterion coverage and a proof that ownership command output uses those meanings consistently.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Context, Measured incident and current gaps, primaryWorktree/isolation citation.
EVIDENCE: The document cites claim.ts:65-80 for primaryWorktree and isolation. At the cited dae76bf9 revision, primaryWorktree is at lines 57-62 and isolation is at lines 64-71. The described behavior is correct, but the citation omits primaryWorktree.
PROPOSAL: Correct the citation to plugins/vh-adlc/scripts/loop/claim.ts:57-71.

## Sources

- Current vh-adlc main `dae76bf9eca4b99368819ca03c7db1fb4a136d24`, actual claim/isolation, handoff fixture and triage execution-lock source, read 19 November 2026.
- Stackweaver local incident comparison and the two-clone probe receipts named in Context, read/run 19 November 2026. These are incident evidence, not shared implementation completion.
- [Claude Code hooks](https://code.claude.com/docs/en/hooks), read 19 November 2026: resume-context injection and pre-tool permission denial are distinct from acknowledgment or arbitrary filesystem isolation.
- [Claude Code project instructions](https://code.claude.com/docs/en/memory), read 19 November 2026: instruction text is context, not enforced configuration.

- [Codex hooks](https://learn.chatgpt.com/docs/hooks), read 19 November 2026:
  native hook coverage, exact-hook trust, parent session identity and continuing stdin
  channels constrain the supported fencing boundary. The installed CLI reports hooks enabled.
