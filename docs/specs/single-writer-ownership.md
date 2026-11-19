---
status: draft
status_description: "R-4 found no issues in the revised baseline. The draft awaits owner acceptance before implementation."
issue: null
goal: "One canonical repository work item has one verified agent writer across clones, worktrees and supported hosts, with an explicit, preserved handoff."
covers:
  - AGENTS.md
  - cmd/vh-adlc/**
  - internal/ownership/**
  - internal/fresh/**
  - internal/gate/**
  - plugins/vh-adlc/vh-adlc.lock.json
  - plugins/vh-adlc/scripts/ensure-vh-adlc.sh
  - scripts/release/lock-binary.sh
  - .github/workflows/release.yml
  - .goreleaser.yml
  - plugins/vh-adlc/scripts/loop/**
  - plugins/vh-adlc/scripts/branches/**
  - plugins/vh-adlc/scripts/triage/execution-lock.ts
  - plugins/vh-adlc/scripts/triage/controller*.ts
  - plugins/vh-adlc/scripts/triage/check-boundary.ts
  - plugins/vh-adlc/scripts/triage/owned-process.ts
  - plugins/vh-adlc/scripts/ownership/**
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/branches.md
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
  - tests/vh-adlc/branches/**
  - tests/vh-adlc/loop/**
  - tests/vh-adlc/triage/controller*.ts
  - tests/vh-adlc/triage/owned-process.test.ts
  - tests/vh-adlc/triage/boundary-test.ts
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

This feature adds an atomic writer record keyed by repository and work item. Every
write-capable workflow checks it before mutation. A different branch name, clone,
agent model or resumed session cannot establish another owner. Read-only review and
owner-delegated assessment remain possible. An authorized handoff preserves unfinished
work, advances the generation and leaves a durable notice for the former writer.
Quota exhaustion and missing processes are not automatic ownership release.

The repository's Git remote holds the shared record. Adoption explicitly initializes a
reserved ref, binds its identity in committed policy and confirms that existing writers
have stopped or upgraded. If the established ref disappears, writing stops until an
authorized recovery restores its history. Source publication still needs its own grant.

Release and takeover close admission, drain all admitted actions and invalidate the old
token before making work available again. A supported Claude or Codex route must still
refuse mutation when its checker fails after setup. Other routes remain read-only.
Downgrading a client holds writing and preserves the coordination record.

Validation includes concurrent clones, admission racing with handoff, lost responses during
initialization and action execution, stale-token publication after handoff and release, and actual native clients
with separate controller, checker and hook failures. The release build must package the
binary for all four supported OS and architecture combinations.
The current result is a spec revision. Accepting it after independent review authorizes
local implementation and tests. Release and consumer adoption have separate grants.

### Owner decision

On 19 November the owner selected Git-remote coordination as recommended and requested
continued work, validation across Claude and Codex, takeover notification to the former
Claude session, and continued consumer consolidation. The owner also explicitly requested
publication of this draft so it is backed up remotely. Publication of the draft is distinct
from releasing or adopting a working ownership runtime. The owner also accepted the
same closing protocol for release and transfer, compatible writers before activation,
and explicit initialization with no automatic authority reset (R-1 Q2A-Q4A).

### Measured incident and current gaps

- At `dae76bf9`, `claim()` checks only local `refs/heads/<featureBranch>` before its
  default-branch claim push (`plugins/vh-adlc/scripts/loop/claim.ts:32-60`). Initial
  claim pushes have rejection handling. Re-entering an already claimed feature has
  no persistent session owner check.
- `primaryWorktree()` reads the first local `git worktree list` result, and `isolation()`
  accepts a linked worktree (`plugins/vh-adlc/scripts/loop/claim.ts:57-71`). Separate clones have separate lists.
- The handoff rule explicitly says a claim is not a lock
  (`plugins/vh-adlc/references/authority.md`, Preservation and Handoff).
  `tests/vh-adlc/worktree-handoff.test.ts` grades the handoff question and preservation;
  it does not arbitrate concurrent writers.
- Triage already has a host-wide kernel lock keyed by repository
  (`plugins/vh-adlc/scripts/triage/execution-lock.ts:6-25`). That protects a running triage
  execution; it neither coordinates all lifecycle writers nor persists a paused feature's
  owner across machines.
- The private incident receipt `nov19-independent-clone-ownership-reproduction.json`
  identifies the two-clone run and its observed results. The probe used synthetic review
  and acceptance records to exercise gates.
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

Store one current writer plus ordered handoff and release history. Identify its session/host,
canonical checkout and branch, accepted work item and generation. Keep private possession
tokens outside Git and redact them from diagnostics. A status command reports the current writer and canonical location.

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

### D2: Shared Git authority

The Go binary owns authority initialization and the status, acquire, check, release and
transfer transitions. Host adapters call the verified binary. Committed adoption policy
names the canonical repository, remote, reserved ref (default
`refs/heads/vh-adlc/work-ownership`), authority ID and genesis commit. Verify that the
remote protects the established ref from deletion and history rewrites, and excludes it
from branch cleanup and product release. First adoption has explicit authority for this
ref and its policy binding. It grants no source or tracker publication privileges.

Initialization creates the ref with an expected absent tip and an adoption operation ID.
The proposed genesis binds the repository and authority ID. Only one concurrent creation
can succeed. On response loss, read back and verify the exact genesis and operation ID.
A competing genesis stays held until the owner reconciles it. A created ref with a
missing policy binding remains inactive. Activate only when the committed policy and
remote history agree and D5's cutover is complete. Ordinary acquisition never initializes
the ref. A missing, rewritten, mismatched or unverifiable established authority stays
held. Recovery requires separate authorization and the verified established history.

Each record binds the work aliases, state, generation, opaque writer/session and checkout
identities, token digest and operation ID. Keep the possession token and private paths
outside Git. Status reports the canonical source branch/spec and opaque remote location,
with an absolute path only for a locally resolved checkout. Unknown schema, alias or
remote state holds mutation. Cached state is diagnostic only.

Build each update as a child of the exact observed tip using Git plumbing outside the
source index and branches. Require the remote to compare the old object ID with that tip
when it installs the new one. Verify ancestry before submission, including when Git's
explicit expected-tip lease is used. Reject any attempt to rewrite the authority history.
On conflict, read back and classify the writer before a bounded retry. After ambiguous
response, reconcile by operation ID and the intended transition before returning success.
Use the same conditional update for admission, closing, drain receipts and finalization.

### D3: Enforce mutation at execution

Check ownership at lifecycle entry and re-entry and require a valid generation for each
mutation, including commits and authorized publication. Keep existing worktree, preservation
and delivery checks. A status result is informational and grants no action admission.

Run the native Claude or Codex session in an enforced route that keeps the model read-only
with respect to the worktree, Git refs and external mutation endpoints. Source mutation
goes through a trusted controller outside that session. Reuse the existing confined
controller and owned-process patterns where they enforce the required boundary
(`plugins/vh-adlc/scripts/triage/controller.ts`, `owned-process.ts`). The controller owns
the writer token and scoped mutation credentials. It authenticates the requesting session
and binds each request to the work item, checkout, generation and exact proposed effect.
It rejects out-of-scope targets and arbitrary shell forwarding. An unreachable controller,
failed checker execution or invalid decision starts no action. Skipped hooks cannot change
that result or make a mutation capability available to the native session.
Verify native configuration, tool exposure and confinement on each supported route.
If the host cannot enforce those limits, keep the route read-only. Claude SessionStart
and Codex resume hooks may surface notices. PreToolUse may report a refusal early.
Neither hooks nor their trust state grant access to mutation capabilities.

Before execution, register an action ID against the active generation through the
authority's conditional update. Registration and closing compete at that same point.
A preliminary check followed by a delayed registration cannot grant admission after
closing. If registration wins, closing includes that action until its result is settled.
The controller tracks the registered ID before spawning any child and keeps it until the
process and its descendants and input channels have stopped and external effects have been
reconciled. Then it records settlement using the action ID. Keep publication guarded by
both ownership and its separate grant.
Never reuse an action ID to launch a second process after an ambiguous response. A controller
restart with unknown activity keeps that ID outstanding until quiescence can be verified.

Delegated reviewers use an independently scoped read-only route. A host-provided parent
session ID grants no privilege, and tokens and action admission are inaccessible to the
delegated actor. Long-lived shells and continuing input must be owned and tracked by the
controller to run as writer. Codex write_stdin does not retrigger PreToolUse. Cover it in
the drain or keep that channel unavailable for mutation. The contract covers the adopted
routes and their declared enforceable boundaries.

### D4: Resume, release and explicit handoff

A matching writer resumes its record. A conflicting session sees the current writer and
location and stays held. Process absence, timeout, quota failure and age grant no takeover.

For release or transfer, atomically change the active generation to closing and reject new
admissions. Track every action that won registration before closing. Drain or stop them
through the controller and verify completion, child and input-channel shutdown and any
pending remote effect. Preserve both histories and unfinished source/evidence for handoff.
An outstanding action or uncertain outcome holds finalization. A transfer names the old
writer and generation, the incoming writer and the canonical checkout.

Once drained, conditionally advance the generation and invalidate the old token. Transfer
activates exactly the named replacement. Release leaves a vacant record with its history
and generation intact. Reacquisition advances that retained generation and uses a new
token. Replay returns the prior transition outcome without repeating it. Release requires
the current writer or explicit owner direction. Old tokens cannot acquire by resumption,
admit mutation or publish, even with a valid separate publication grant.

Retain a notice for the former session and known parent/delegator. Record queueing, delivery
and acknowledgment independently. If direct messaging is unavailable, surface the durable
notice on resume. The former writer remains held whether or not it acknowledges.

### D5: Adoption, compatibility and bounded state

Existing consumers first inventory claimed work and detect duplicates. Ambiguity produces a
preserved conflict record and requires one selected canonical owner. Do not migrate both
clones into separate records for the same issue. Never reset, stash, delete, rebase or amend
another writer's history to establish ownership.

Hold write access while inventorying active and paused clients across hosts. Stop or
upgrade each known writer, account for in-flight actions and require verified compatible
routes and binaries before enabling ownership. Unknown writers or control gaps hold
activation. A rollback closes and drains active generations, preserves the bound authority
and leaves writer access held, including for incompatible versions. To resume, restore
compatible writers and reverify the same authority and its outstanding records. Old clients
do not implement these checks themselves. Cutover and rollback must disable their adopted
write access at the enforcing boundary, including existing sessions and credentials.

Update shared references, skills and compatibility documentation together. Publish through
both existing marketplace manifests and verify actual Codex/Claude adoption. The repository
pin update to `0c983f6793bfe35eb96ae95ad0c361c6200af44f` supplies the required testing guide;
the shipped plugin default pin is unchanged unless a separately reviewed change requires it.
Private host/session details remain in runtime state, not product documentation or source.
The artifacts are the existing signed Go binary and shared plugin. Before merge, run the
Go and Bun checks and use GoReleaser in a disposable checkout at the candidate commit to
build and package with `.goreleaser.yml`. Use snapshot mode with signing and publication
disabled. Check all four Linux and Darwin amd64 and arm64 archives and their computed
checksums. Release through the existing workflow after authorization and update the
plugin lock only to an observed signed release with verified checksums.
Candidate validation uses the built candidate explicitly; do not invent a future version,
checksum or successful marketplace install. No new deployable service or satellite is added.


### Glossary

| Term | Meaning |
| --- | --- |
| Owner | The human who authorizes adoption, takeover and delivery. |
| Current writer | The session and checkout authorized to request admitted mutations for a work item. |
| Work item | One canonical repository task resolved from its issue, spec or task aliases. |
| Generation | The monotonic authority revision for writer identity, advanced on release, transfer and acquisition. |
| Possession token | Private proof the controller uses for a writer generation. Diagnostics never display it. |
| Held | Mutation is unavailable until ownership and the applicable execution or recovery prerequisites are verified. |

## Acceptance Criteria

- [ ] AC-01: Two simultaneous claimants for the same work item in independent clones admit one current writer. The conflicting claimant stops before source mutation and receives the writer's canonical location.
- [ ] AC-02: SSH/HTTPS repository aliases, issue/spec aliases and branch/session changes cannot create another owner for the same item, while separate work items may proceed independently.
- [ ] AC-03: Resumption, unknown remote outcomes, network failure and quota/process absence cannot bypass ownership; stale generations cannot mutate or publish after release or handoff, and loss of an established authority holds mutation.
- [ ] AC-04: An authorized handoff preserves both histories and unfinished files, drains or stops the former writer, activates one replacement and records notice delivery/acknowledgment accurately. Release shares that admission and drain guarantee before reacquisition.
- [ ] AC-05: Existing lifecycle and selected repair writers share the same ownership check; delegated read-only reviews remain possible and cannot obtain source-writing authority.
- [ ] AC-06: Source publication, issue/PR changes, merge, release and cleanup retain their separate gates; coordination state cannot trigger a product release or be removed as a stale feature branch.
- [ ] AC-07: Actual supported Codex and Claude routes refuse a former owner/new conflicting writer before source changes, including when a checker or controller fails after successful setup. Unsupported routes remain read-only.
- [ ] AC-08: Existing consumers with duplicate/incomplete claims receive a preserved migration conflict and one explicit reconciliation path, and marketplace installs expose the verified ownership capability. Adoption creates one explicitly bound authority and holds incompatible writers during cutover and rollback.
- [ ] AC-09: Ownership command output distinguishes the human owner, current writer, work item, generation and held state using the glossary. It never discloses a possession token.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | First retain the failing two-independent-clone reproduction. Add true concurrent claimant processes against one disposable Git authority and assert one winner, zero loser source/index/branch writes, exact owner diagnostics and bounded conflict retry. Repeat in separate Git common directories. |
| AC-02 | Exercise SSH/HTTPS and `.git` spelling aliases, issue/spec association, different branch names, source paths containing spaces, resumed session IDs and two separate work items. Assert one canonical identity or an explicit ambiguity refusal. |
| AC-03 | Inject response loss after successful claim, rejected update, missing authority, inaccessible remote, old generation, process death and quota failure. Read-back reconciles the same writer. Give the stale writer otherwise valid publication authority and attempt the same publication after transfer, after release while vacant, and after reacquisition. Assert no destination mutation in each case. The current writer succeeds with the same publication authority after transfer and after reacquisition. A deleted established ref cannot be recreated by a delayed update. |
| AC-04 | Start with two dirty source files and committed review history. Transfer only after the old mutator is stopped/drained; replay it and attempt a stale-owner mutation. Compare exact hashes/history and ownership generation. Pause an action after preliminary check before registration and race transfer, then reverse which transition wins. Once an admitted action has launched, drop its response and retry the same action ID while the generation is active. Observe at most one launch and one effect. Restart the controller while the original action is unresolved, with an open input channel or an ambiguous external result. In separate release and transfer cases, refuse finalization until the original activity has stopped and its external outcome is reconciled. After settlement, finish the transition once. Assert increasing generations and stale-token refusal. Test unavailable direct messaging, queued notice, actual resume delivery and independent acknowledgment. |
| AC-05 | Contract tests cover every shared write entry/re-entry and selected maintenance/audit/docs repair route. Each must reject a conflicting token. Delegate a read-only exact-head review, observe preserved source and prove it cannot claim/write under the parent's token. |
| AC-06 | Recording Git/issue/PR endpoints observe no source push, PR, merge, release or cleanup without its separate grant. The reserved authority ref is excluded from release and stale-branch paths. Existing claim-push rejection, scope preservation and delivery tests remain passing. |
| AC-07 | Run actual native Codex and Claude against two fixture clones through the declared adapters. Attempt writes from the former and conflicting sessions. Prove a permitted writer action and an unrelated item. After successful setup, independently test controller unavailability, checker execution failure, an invalid checker decision and skipped hooks. Keep the controller live for both checker tests and observe that it receives but refuses each request. In every negative case assert that source, refs and publication targets remain untouched. Exercise continuing input and unsupported tools in the actual clients. Native runs without observed mutation and refusal remain pending. |
| AC-08 | Seed unclaimed, valid claimed, duplicated and unknown-owner consumer records. Migration preserves all dirty bytes/reviews, selects one canonical item and records unresolved cases. Race two initializers, lose the winning response and test missing/mismatched established state from a fresh clone. Start cutover and downgrade with an older paused client and prove it cannot resume mutation while held. Verify preserved history and compatible recovery. Run both marketplace install/discovery paths and the repository Go and Bun checks. At the same candidate commit run a nonpublishing GoReleaser snapshot using `.goreleaser.yml`, validate all four target archives and recompute each checksum. |
| AC-09 | Run ownership status, acquire, release and transfer in the same fixture. Verify human authorization and current writer are distinct, work item and generation stay visible, held output explains the prerequisite, and neither stdout nor stderr contains the fixture token. |

## Tasks

Pending independent spec review and the implementation gate. The owner selected Git-remote coordination and requested continuation. No implementation task is complete.

## Open Questions

None. The owner selected Git-remote coordination (Q1A), the common closing and
fail-closed execution protocol (Q2A), compatible writers before cutover with a held
rollback (Q3A), and explicit authority initialization with no automatic reset (Q4A).

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-19 | R-1 | spec | `7e7ebe74c28f4071f20f3d963b2e54a6a24418c3` | gpt-6.1-sol | procedural | Two blocking and five should-fix findings; native failure refusal and ownership transitions need revision. |
| 2026-11-19 | R-2 | spec | `c13b42da1e2bcf8ff80150320dc42a45b7ba56ad` | gpt-6.1-sol | procedural | Three should-fix findings and one nit on distinct native failures, release publication checks, cross-platform packaging and evidence references. |
| 2026-11-19 | R-3 | spec | `b7fc9a58858df974f1959a805adb6b1f0a8da8c9` | gpt-6.1-sol | procedural | Two should-fix findings on branch cleanup coverage and recovering an admitted action. |
| 2026-11-19 | R-4 | spec | `13b62cefb0cd4eff6388f4a9eb328f835172bff6` | gpt-6.1-sol | procedural | NO FINDINGS. |

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

### R-2

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary, checker-failure guarantee and validation; Design D3, failure refusal and hook independence; AC-07; Test Plan, AC-07.
EVIDENCE: The revised AC-07 proof permits “kill the controller or break the checker” and “submit invalid decisions or skip the hook”. Killing the controller and skipping the hook can satisfy that procedure without testing a live controller whose ownership checker fails or returns an invalid decision. A controller that allows mutation on checker failure can therefore pass the stated native scenario. This disjunction was introduced while correcting R-1 F-01.
PROPOSAL: Require separate native scenarios for controller unavailability, checker execution failure, invalid checker decisions and skipped hooks. Keep the controller running during checker-failure scenarios and assert that no mutation reaches source, refs or publication targets.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary, release token invalidation; Design D3, publication admission; Design D4, release, reacquisition and stale-token publication; AC-03, AC-04, AC-06; Test Plan, AC-03, AC-04, AC-06, AC-07.
EVIDENCE: The R-1 corrections extend AC-03 to forbid stale-generation publication after release as well as handoff. The valid-grant publication scenario in the AC-03 proof still runs only “after transfer”. AC-04 exercises release draining and unspecified stale-token refusal, while AC-06 tests publication without its separate grant. These checks can pass when release invalidates source-writing access but a publication path still accepts the released token with a valid grant.
PROPOSAL: Run the valid-grant stale-publication scenario after release, both before and after reacquisition, as well as after transfer. Verify no destination mutation and pair reacquisition with successful publication by the new current writer.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design D5, artifact validation and release path; AC-08; Test Plan, AC-08.
EVIDENCE: The pinned conventions/delivery.md, Feature delivery, requires a pre-merge check that rebuilds affected artifacts through their actual release build path. D5 and the AC-08 proof require Go and Bun checks and marketplace installation, but no release-configured binary build or packaging check. The actual .goreleaser.yml:7-28 builds and archives Darwin and Linux binaries for amd64 and arm64 with CGO disabled and release flags. Host-local Go checks can pass while one of those published targets fails.
PROPOSAL: Add a nonpublishing build and packaging check using the existing GoReleaser configuration and its complete target matrix at the final candidate commit. Keep signing and publication under their separate authorization.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Context, Measured incident and current gaps, private incident evidence; Sources, Stackweaver probe receipts.
EVIDENCE: Sources says the probe receipts are “named in Context”, but Context now supplies only “the consumer's private evidence”. The previous reviewed revision named the receipt and probe; this revision removed those locators. The underlying reproduction is supported, but the remaining citation no longer identifies its evidence.
PROPOSAL: Give the private evidence a stable receipt identifier that its owner can resolve, and make Sources reference that identifier without exposing private host paths.

### R-3

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter, covers; Design D2, branch-cleanup exclusion; AC-06; Test Plan, AC-06.
EVIDENCE: The cleanup implementation at plugins/vh-adlc/scripts/branches/branches.ts:335-349 selects remote deletions and tracking-ref pruning; lines 465-476 execute ref deletions. No covers entry includes this file. Changes affecting the required authority-ref exclusion can therefore escape the covered-path freshness and dirty-tree checks in internal/fresh/fresh.go. The pinned feature-document standard requires covers to include every path whose change can affect the feature.
PROPOSAL: Add the branch-cleanup implementation and its relevant verification paths to covers. Include any shared enforcement implementation actually reused by this feature.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary, admission and drain guarantee; Design D2, ambiguous updates; Design D3, action IDs and controller restart; Design D4, uncertain outcomes and replay; Design D5, outstanding records during recovery; AC-03, AC-04; Test Plan, AC-03, AC-04, AC-07, AC-08.
EVIDENCE: D3:195-204 requires action registration, prohibits launching a second process for the same action after an ambiguous response, and preserves outstanding activity across controller restart. The proof plan loses responses during acquisition and initialization, replays a former mutator after transfer, and tests controller unavailability. It does not retry an already launched action while its generation remains active or restart the controller with that action unresolved. A controller that launches the action again, or forgets it during restart and prematurely permits finalization, can pass the stated scenarios.
PROPOSAL: Add deterministic response-loss and controller-restart scenarios around an admitted action. Assert at most one launch/effect for its action ID and hold release or transfer until the original activity and external outcome are verified settled.

### R-4

NO FINDINGS

## Sources

- Current vh-adlc main `dae76bf9eca4b99368819ca03c7db1fb4a136d24`, actual claim/isolation, handoff fixture and triage execution-lock source, read 19 November 2026.
- Stackweaver incident comparison and private receipt `nov19-independent-clone-ownership-reproduction.json`, 19 November 2026. The receipt records both admissions in the two-clone collision probe.
- [Claude Code hooks](https://code.claude.com/docs/en/hooks), read 19 November 2026: resume-context injection and pre-tool permission denial are distinct from acknowledgment or arbitrary filesystem isolation.
- [Claude Code project instructions](https://code.claude.com/docs/en/memory), read 19 November 2026: instruction text is context, not enforced configuration.

- [Codex hooks](https://learn.chatgpt.com/docs/hooks), read 19 November 2026:
  native hook coverage, exact-hook trust, parent session identity and continuing stdin
  channels constrain the supported fencing boundary. The installed CLI reports hooks enabled.
