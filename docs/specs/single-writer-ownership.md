---
status: draft
status_description: "The owner chose a Git reservation with start, resume and handoff checks. The revised draft awaits review and acceptance."
issue: null
goal: "Two sessions using vh-adlc cannot accidentally start or resume the same feature as its writer."
covers:
  - AGENTS.md
  - plugins/vh-adlc/scripts/ownership/**
  - plugins/vh-adlc/scripts/loop/**
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/branches.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/references/loop-settings.md
  - plugins/vh-adlc/scripts/branches/**
  - plugins/vh-adlc/skills/**
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
  - .github/workflows/ci.yml
  - .github/workflows/release.yml
  - tests/vh-adlc/ownership/**
  - tests/vh-adlc/branches/**
  - tests/vh-adlc/loop/**
  - tests/vh-adlc/worktree-handoff.test.ts
  - tests/vh-adlc/check.test.ts
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
---

# Plan: Single-writer ownership across agent sessions

## Context

### Owner summary

When you start an issue through vh-adlc, it reserves that issue for your session in Git.
A second session starting or resuming the same issue sees who has it and where the work
lives, even if it uses another clone. The current writer can resume without asking you
again. An idle session or one that ran out of quota keeps its reservation. Reviews and
work on other issues can continue.

For a handoff, you confirm the old session has stopped and name the replacement.
vh-adlc transfers the reservation and leaves the existing work intact. If the old
session later resumes the feature through vh-adlc, it sees the transfer and stops.
Editing, shell commands, builds and tests run as usual. This relies on agents entering
work through vh-adlc and on your stop confirmation during a handoff. It cannot stop
a session that is still running or an edit made outside the workflow.

Repositories opt in once. If Git cannot verify the reservation, vh-adlc pauses the start
or resume and explains what to check. The planned proof is a race between two clones,
a normal resume, and a handoff with unfinished work. These are implementation checks
still to run. Acceptance authorizes implementation and tests through the existing
feature workflow. Publishing implementation or enabling the reservation in a live
repository needs separate approval.

### Background

Two sessions worked independently on the same consumer issue in separate clones.
The earlier draft records the incident and its private reproduction receipt.
The current claim helper checks for a branch in one clone before editing and pushing
the existing feature claim. Its worktree helper likewise reads one clone's list
(`plugins/vh-adlc/scripts/loop/claim.ts:34-70`). The shared handoff procedure already
asks the owner to confirm that the previous writer stopped
(`plugins/vh-adlc/references/authority.md`, Handoff).

The owner kept Git coordination and explicit adoption and handoff. For the duplicate
start problem, the owner chose checks at workflow entry and removed the requirement to
intercept writes or prove that a process stopped. Reviews R-1 through R-4 describe the
earlier draft. Its unchecked criteria AC-01 through AC-09 are superseded and remain in
Git history. Neither draft was accepted.

## Scope

Add one shared reservation to feature writing in adopted repositories. Check at the
start of work and when a session resumes it through vh-adlc. Include fresh implementation,
re-entry to a claimed feature, and the feature spec and tasks routes when they start new
writer work for an issue or tracked spec. Read-only discovery and review stay available. An independent reviewer can
return findings while the current writer records or applies them through the feature workflow.

Keep the existing claim, branch, worktree and delivery procedures. The reservation
does not authorize source publication, tracker writes, merge or release. Leave other
workflows, including maintenance, audit and documentation repairs outside the feature
loop, outside this change. There is no controller, hook requirement, per-write check,
background polling, automatic takeover or session messaging.

## Design

### Identify the same work

Use the adopted Git repository identity and the feature's canonical issue. Normalize
HTTPS and SSH forms of the same origin. The remote used for reservation reads and updates
must resolve to that repository. Resolve a linked spec to its issue, including
when a session enters via its branch. An issue-less feature uses its tracked canonical
spec path. A branch name, clone path or issue title is never a substitute for the
canonical item. Use current default-branch associations and the reservation record
when resolving aliases. If linking an issue or moving a spec would change an existing
key, reconcile the aliases in the reservation first. Ambiguous or unresolved identity
stops the start or resume with a reason rather than creating another reservation.

### Store the reservation in Git

Use one reserved ref on the adopted Git remote, by default
`refs/heads/vh-adlc/work-ownership`. A small shared helper in the vh-adlc plugin owns
the Git operations. Use Git objects and an exact expected-tip push without touching
the source index or branches. Each update is a child of the verified tip and records
the work item, opaque writer and checkout identifiers, work location, and a unique
operation ID. Keep local session state and absolute checkout paths outside the shared
ref. Show a useful host label and branch or spec locator, and a local checkout path
when it can be resolved safely.

Competing starts compare and update the same ref. If a push loses the race, reread the
item and show its writer. Changes for another item can retry a bounded number of times.
If a response disappears, reread and verify the exact operation and the current writer
before reporting success. An uncertain outcome, missing adopted ref or unavailable Git
remote stops entry and gives the next step. Cached state is available for diagnosis only.

### Start, resume and hand off

Use the same check in the feature writer paths for Codex and Claude. Before the chosen
operation writes or claims a branch, check for another writer. An unreserved item is
reserved once. Use the current client's session binding and a local checkout binding.
Both must match on resume. Status output is informational. Opening the same checkout
in a second session leaves the reservation with the first.
A resume with no history of ownership stays held if the item already has a legacy claim
until the owner reconciles it. A claim push rejected by the existing workflow leaves
the reservation with the current writer so that retry cannot start another writer.

A handoff requires the owner to confirm that the previous session has stopped and to
select the incoming session and where it will work. Preserve both histories, indexes
and unfinished files. Reuse the original checkout after the old writer has stopped,
or have the owner provide an explicitly preserved handoff before changing the work
location. Update the reservation only if the observed prior writer and record are
still current. Stale and repeated requests cannot overwrite a later handoff. The
former writer receives the current location and a transfer message at its next
feature entry. Reservations have no expiry. A finished feature keeps its record and
the usual lifecycle determines whether it can be worked on again.

### Adopt and roll back

An authorized setup creates the reserved ref only if it is absent and binds its
genesis in committed repository policy. If the create response is lost, verify the
same genesis and operation before binding. If another setup wins or the history
vanishes, stop and ask the owner to reconcile it. Verify that the adopted remote
protects this ref against deletion and history rewrites. Exclude it from feature branch
cleanup and CI that can create product tags. The current CI takes pushes on all
branches and invokes versioning (`.github/workflows/ci.yml:3-6,194-205`). The release
workflow starts on version tags (`.github/workflows/release.yml:3-5`).

Before adopting, identify existing claims and confirm that the writers using the
feature workflow have updated. An ambiguous or duplicate claim stays held until
the owner chooses one writer and work location. Preserve all other work. Repositories
that have yet to adopt retain the existing workflow. A downgrade to a client without
the check removes its duplicate-work protection. Keep the ref and its history,
coordinate writers manually during rollback and reverify the same ref before
restoring automated checks.

The affected artifact is the existing shared vh-adlc plugin for both marketplaces.
Use the existing Bun plugin checks and verify candidate packaging and feature entry
on both client routes using disposable repositories. The installed Go binary still
provides the existing lifecycle gates. It needs no change for this feature.

### Glossary

| Term | Meaning |
| --- | --- |
| Reservation | The Git record assigning a work item to one current writer. |
| Current writer | The session allowed to start or resume feature writing through vh-adlc. |
| Work location | The writer's host label and branch or spec, with a checkout path when local. |
| Handoff | An owner-approved change of writer after the previous session has stopped. |

## Acceptance Criteria

- [ ] AC-10: Two sessions starting the same feature through vh-adlc in separate clones produce one reservation. The other session stops before feature writes and gets the current writer and work location. Separate items can proceed.
- [ ] AC-11: A later workflow entry resolves the same item from its issue or spec, allows the current writer back in, and holds conflicting or unverified starts and resumes. Read-only review stays available. Normal editing and tests require no reservation checks.
- [ ] AC-12: An explicit handoff after owner confirmation transfers the reservation once and preserves unfinished work and history. The old session sees the transfer at its next vh-adlc entry. Idle or quota-limited sessions keep their reservation.
- [ ] AC-13: Adoption holds unresolved existing claims, preserves the reservation history across rollback and keeps coordination changes out of branch cleanup and product releases. Existing publication permissions remain separate.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-10 | Race two processes at the feature entry using independent clones of a disposable bare remote. Verify one reservation, byte-identical source, index and refs in the losing clone apart from remote reads, and the current writer and work location in the refusal. Repeat with separate items that both succeed. |
| AC-11 | Enter through issue, spec and branch, with HTTPS and SSH spellings for the same repository. Include an issue-less spec, a changed or ambiguous alias, a matching resumed session, another session in the same checkout, a failed claim push, lost Git response, missing adopted ref and offline remote. Verify correct entry or a clear stop. Run a read-only review and observable local edit/test commands after a successful start. Count reservation calls at entry and assert no extra ones during the edit and test. Exercise shared start/resume wiring through the candidate plugin on Codex and Claude, with disposable repositories. |
| AC-12 | Seed committed and dirty work in two clones, try a handoff without confirmation, then hand off as authorized. Compare file and index hashes and commit ancestry before and after. Race or replay the handoff and verify one transfer. Simulate a paused or quota-limited writer and confirm its reservation persists until explicit handoff. Resume from both the new and old sessions and check the new access decision and old session message. |
| AC-13 | Use an unadopted fixture and fixtures with clean, duplicate and legacy claims, competing initialization and a lost create response. Test an unavailable or mismatched established ref and a downgrade followed by compatible recovery of the same history. Verify branch cleanup keeps the reserved ref and the release workflow cannot run from a coordination update. Verify a reservation does not grant a source push or tracker write. Run the repository plugin checks and check both marketplace candidate payloads. |

## Tasks

None yet. Break down implementation after acceptance.

## Open Questions

None. The owner selected the Git reservation, entry checks and explicit handoff.

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

- [Earlier draft and historical incident receipt reference](https://github.com/michielvha/vh-adlc/blob/289a043d21cdc76310d3d32a62322b5f4cab9637/docs/specs/single-writer-ownership.md#measured-incident-and-current-gaps).
- [Claim and isolation helpers](../../plugins/vh-adlc/scripts/loop/claim.ts) and [existing handoff procedure](../../plugins/vh-adlc/references/authority.md#handoff).
- [CI push and version routing](../../.github/workflows/ci.yml) and [tag release trigger](../../.github/workflows/release.yml).
