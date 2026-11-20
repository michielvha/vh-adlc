---
status: in-progress
status_description: "The reservation implementation passes local regression checks. Installed session validation remains open."
issue: null
branch: feat/single-writer-ownership
goal: "Two sessions using vh-adlc cannot accidentally start or resume the same feature as its writer."
covers:
  - AGENTS.md
  - plugins/vh-adlc/scripts/ownership/**
  - plugins/vh-adlc/scripts/loop/**
  - plugins/vh-adlc/scripts/labels/**
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
  - .github/workflows/preview.yml
  - .github/workflows/release.yml
  - tests/vh-adlc/ownership/**
  - tests/vh-adlc/branches/**
  - tests/vh-adlc/loop/**
  - tests/vh-adlc/worktree-handoff.test.ts
  - tests/vh-adlc/check.test.ts
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - docs/reference/marketplace.md
  - docs/get-started/installation.md
---

# Plan: Single-writer ownership across agent sessions

## Context

### Owner summary

When you start an issue through vh-adlc in Codex or Claude Code, it reserves that issue
for your session in Git.
A second session starting or resuming the same issue sees who has it and where the work
lives, even if it uses another clone. The current writer can resume or follow the normal
route into an isolated worktree without asking you again. An idle session or one that ran
out of quota keeps its reservation. Reviews and work on other issues can continue.

For a handoff, you name the replacement and keep the old session stopped until
vh-adlc confirms the transfer in Git. The existing work stays intact. If the old
session later resumes the feature through vh-adlc, it sees the transfer and stops.
Editing, shell commands, builds and tests run as usual. This relies on agents entering
work through vh-adlc and on your stop confirmation during a handoff. It cannot stop
a session that is still running or an edit made outside the workflow.

Repositories opt in once and authorize updates to the reservation ref. Pause feature
writers during setup or a remote restore, and choose the writer for any existing claim. vh-adlc checks
the current remote policy at entry. If Git cannot verify it or the reservation, vh-adlc
pauses the start or resume and explains what to check. The planned proof is a race between two clones,
a normal resume, and a handoff with unfinished work. These are implementation checks
still to run. Acceptance authorizes implementation and tests through the existing
feature workflow. Publishing implementation or enabling the reservation in a live
repository needs separate approval.

If creation of a tracking issue is interrupted, the draft stays paused while you identify the
result. Read-only lookup and recovery remain available.

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
Git history. The owner accepted the simpler Git reservation design at R-13.

### Review follow-up for task planning

R-13 F-01 flagged a gap in the planned proof for an interrupted issue creation. When
planning AC-11 and AC-12, run the pending-state fixture through a same-session worktree
move and through a handoff. At each destination, try direct writer entry before recovery
and verify that it holds while lookup stays available. After recovery, verify that the
writer can resume and that there is still only one tracker issue. The reviewed design
already requires this behavior.

## Scope

Add one shared reservation to feature writing in adopted repositories. Check once per
feature at the start of a writing workflow, including spec authoring or revision, tasks,
implementation, review recording and ship. Resume uses the same check when it enters one
of those operations. Cover direct entry as well as calls routed through resume. Read-only
discovery and independent review can run separately and return findings.

Reservation-aware writer routes are the verified Codex and Claude Code routes in their own
client sessions. A nested harness with inherited session markers is outside that guarantee.
In an adopted repository, the updated workflow holds writer entry on other or unidentified clients and
shows which clients can continue. Unadopted repositories keep their existing client routes.

Keep the existing claim, branch, worktree and delivery procedures. The reservation
does not authorize source publication, tracker writes, merge or release. Leave other
workflows, including maintenance, audit and documentation repairs outside the feature
loop, outside this change. There is no controller, hook requirement, per-write check,
background polling, automatic takeover or session messaging.

## Design

### Identify the same work

Use the adopted Git repository identity and the feature's canonical issue. Normalize
HTTPS and SSH forms of the same origin. Before entry, resolve Git's effective fetch and
push URLs, including push URL overrides. Require one destination for each, both naming
the canonical repository. Hold if either cannot be verified. Resolve a linked spec to its
issue, including when a session enters via its branch. An issue-less feature uses its canonical spec path.
For a new draft, run existing spec discovery and pick the final spec path under the configured
feature root before writing. Reserve that path even when the file does not yet exist. Two
unlinked goals given different spec paths cannot be recognized as duplicates. A branch name,
clone path or issue title is never a substitute for the
canonical item. Resolve aliases using current default-branch associations and the exact
reservation tip used for the update. When linking an issue or moving a spec, bind the old
and new aliases to the existing reservation before publishing the new link or path. Keep
the old alias reserved. An alias already bound to another item, or an unresolved identity,
pauses entry for explicit reconciliation. Reread and resolve again after a rejected update.

When creating an issue for an existing draft, link the returned issue number in the
reservation immediately after creation, before handing it to another session as a work item.
The tracker and Git are separate. An issue found independently before the link appears
can look like a separate item. If both have reservations when the relationship is found,
record the conflict in the same Git update mechanism. Entry through any current or retained
alias of either record pauses.
After both writers stop, the owner can select one existing reservation and its work location.
An exact-tip update points all aliases of both records at the selected reservation and keeps the former
records in Git history. This changes reservation metadata only. Preserve both work locations.

Keep the existing approved issue preview with the writer's private work state and mark the
creation pending before sending it. If the tracker outcome is uncertain, use the preview to
check the target repository for the created issue. The owner confirms the existing issue number
before vh-adlc binds it, using the same conflict procedure if it is already reserved. While the
outcome is pending, hold draft writer entry and allow read-only lookup and owner-confirmed
recovery. Clear pending state only after
the alias is verified, or after the owner confirms no issue was created. Any new creation keeps
its existing approval requirement.

### Store the reservation in Git

Use one reserved ref on the adopted Git remote,
`refs/heads/vh-adlc/work-ownership`. A small shared helper in the vh-adlc plugin owns
the Git operations. Use Git objects and an exact expected-tip push without touching
the source index or branches. Each update is a child of the verified tip and records
the work item, opaque writer identity, work location and a unique operation ID. Keep
raw session IDs and absolute checkout paths outside the shared
ref. Show a useful host label and branch or spec locator, and a local checkout path
when it can be resolved safely.

Competing starts compare and update the same ref. If a push loses the race, reread the
item and show its writer. Changes for another item can retry a bounded number of times.
If a response disappears, reread and verify the exact operation and that its resulting
writer record is still current before reporting success. An uncertain outcome, missing adopted ref or unavailable Git
remote stops entry and gives the next step. Cached state is available for diagnosis only.

Adoption explicitly permits ordinary acquisition on that ref during feature entry, using
the caller's Git access. An explicit no-push or coordination restriction takes precedence.
If acquiring or changing a reservation is forbidden, hold the writer entry that needs it.
A matching resume at the same location only reads. Source and tracker writes still require
their existing authority.

### Start, resume and hand off

Use the same check before the first feature mutation, including both the skill-driven
claim and the standalone loop claim command. An unreserved item can be reserved after
checking for unresolved legacy claims. Every writer entry, including direct commands,
holds an existing claim without a reservation until the owner reconciles it. A hold
leaves the reservation ref unchanged.

For an existing claim, the owner can select the session and location that will keep working
after any competing writers have stopped. The helper records this as the item's first
reservation using the verified tip and an expected absent item record. The same conflict
and response-loss rules apply. A competing reconciliation cannot replace the winner.

Detect the current client only in an unambiguous native environment. Codex supplies
`CODEX_THREAD_ID`, and Claude Code supplies `CLAUDECODE` and `CLAUDE_CODE_SESSION_ID`.
Any of those markers or `CODEX_SESSION_ID` counts as evidence of its client family. If both
families are present, or the required ID is missing, hold entry and direct the user to the
ordinary client session. Nested invocations can inherit both families
([client observations](session-retrospective.md)). A direct claim in an adopted repository
also requires an explicit client that matches this check. Derive a client-namespaced fingerprint
from the ID for Git. The same conversation must retain its ID through process restart.
A fresh conversation in the same checkout has a different ID.

Do not start another writer harness with the parent's client IDs in its environment. A child
that inherits only the parent's markers is indistinguishable to this check from the parent.
Clear both clients' markers before launching a child so a supported client has to supply its
own identity. A child without an identity can use the read-only workflow.

The session owns the reservation. The existing worktree checks still decide where it
can write. When the same session takes the normal route from a spec to an isolated
worktree, or retries a rejected claim at the new default tip, update the work location
after verifying the permitted checkout and before feature mutation. Use the ordinary
reservation update so a concurrent handoff wins or loses against it. No owner handoff
is needed when the writer stays the same. Keep any rejected claim commit reachable in
the original checkout and leave unfinished work intact. Other sessions stay held.

A handoff requires the owner to select the incoming session and keep the old session's
feature work stopped until Git confirms the transfer, including during an uncertain result.
Reuse the original checkout when possible. To move, the owner and incoming writer verify
that the destination has the commits and unfinished work required to continue, including
staged, unstaged and untracked changes, before transferring. When a handoff or a same-session
move changes where private work is stored, keep any pending issue marker and approved preview
together and verify both at the destination. Pending recovery stays held after the move.
Keep the original work intact
if the transfer fails. Update the reservation only if the observed prior writer and record
are still current. Stale and repeated requests cannot overwrite a later handoff. The
former writer receives the current location and a transfer message at its next
feature entry. Reservations have no expiry. A finished feature keeps its record and
the usual lifecycle determines whether it can be worked on again.

### Adopt and roll back

Read adoption policy from the current default-branch tip on the canonical remote, including
from feature checkouts made before adoption. Verify the reserved ref alongside it. Reuse
the default-branch refresh already required by the workflow where possible. Two absent
lookups establish legacy behavior only when there is no evidence of prior adoption. The last
verified adoption binding takes precedence, including when both remote records disappear.
After restoring a pre-adoption backup, a new clone can see two absent records with no local
binding and cannot distinguish that remote from a never-adopted one. Pause all feature-writer
entry before that restore and keep it paused until the exact original policy and reservation
history are reinstated and verified. A new clone is not an authority reset.
If either configured remote lookup fails,
or only one side exists, hold entry and report the missing or unverifiable part. A checkout
with no configured remote can use an explicit local-only exception when the owner requests
a new private draft without an issue or branch and there is no evidence of prior adoption.
Git cannot distinguish a local repository from a stale clone that lost all remote and adoption
information. The same exception applies to both, and only permits drafting locally. It cannot
enter shared feature writing, publish, or claim work for implementation. An adopted checkout
keeps evidence of its binding in local Git metadata after verification and refuses the exception.
Losing origin alone never selects local-only behavior.

An authorized setup creates the reserved ref only if it is absent and binds its genesis
in committed default-branch policy. If the create response is lost, verify the same genesis
and operation before binding. If another setup wins or the history vanishes, stop and ask
the owner to reconcile it. Entry verifies that the observed tip descends from the bound
genesis. Verify that the remote allows appends and rejects deletion and history rewrites.
Exclude the ref from feature branch cleanup and tag-capable CI on push and dispatch.
The current CI accepts both (`.github/workflows/ci.yml:3-6,194-205`), and the preview workflow
dispatches it for a labeled PR (`.github/workflows/preview.yml:3-21`). The release workflow
starts on version tags (`.github/workflows/release.yml:3-5`).

Before setup, identify existing claims and have the owner pause feature writers. Resume
only after verifying supported clients, both setup steps, and the adopting repository's
own protection and release routes. Read the effective remote rules for the exact ref to
verify that ordinary writer updates are allowed and deletion and rewrites are forbidden.
Inspect the consumer's actual cleanup and tag-capable workflow paths, including dispatch,
for the reserved ref. Missing or unverifiable controls keep adoption paused. Test rejection
of destructive ref changes on disposable remotes. Resolve ambiguous or duplicate claims
by selecting one writer and location while preserving other work. A downgrade to a
client without the check removes its duplicate-work protection. Keep the ref and its history,
coordinate writers manually during rollback and reverify the same ref before restoring checks.

This repository publishes the shared plugin through two Git-backed vhco-tools catalogs.
Codex uses `.agents/plugins/marketplace.json` and Claude Code uses
`.claude-plugin/marketplace.json`. Before merge, run the Bun plugin checks and install
from both catalogs at the exact candidate commit using isolated client profiles. Run the
entry scenarios against those installed packages in disposable repositories. The Go
binary continues to supply the existing lifecycle gates.

### Glossary

| Term | Meaning |
| --- | --- |
| Reservation | The Git record assigning a work item to one current writer. |
| Current writer | The session allowed to start or resume feature writing through vh-adlc. |
| Work location | The writer's host label and branch or spec, with a checkout path when local. |
| Handoff | An owner-approved change of writer while the previous feature work stays stopped. |

## Acceptance Criteria

- [x] AC-10: Two sessions starting the same feature through vh-adlc in separate clones produce one reservation. The other session stops before feature writes and gets the current writer and work location. Separate items can proceed.
      Evidence: `bun test tests/vh-adlc/ownership` and the related plugin suite at `de1aebaa`. Two independent clones using the actual entry command raced one Git ref, one won, and the losing checkout, index and local refs were unchanged. New spec paths and separate issues passed the same disposable-remote checks.
- [ ] AC-11: Each feature-writing entry resolves the same item from its issue or spec, allows the current writer back in, and holds conflicting or unverified writers before feature writes. Read-only review stays available. Normal editing and tests require no reservation checks.
- [ ] AC-12: An explicit handoff transfers the reservation once after the owner stops the previous feature work and keeps it stopped until transfer is verified. The incoming writer can continue from the preserved work. The old session sees the transfer at its next vh-adlc entry. Idle or quota-limited sessions keep their reservation.
- [ ] AC-13: Adoption holds unresolved existing claims or setup, preserves the reservation history across rollback and keeps coordination changes out of branch cleanup and product releases. Coordination updates require authorization for the reserved ref and grant no source or tracker publication permission.
- [x] AC-14: A conflict or a transfer message identifies the current writer and gives its host and branch or spec. Absolute checkout paths appear only when resolved locally. The shared Git history and remote diagnostics do not expose raw session IDs or absolute checkout paths.
      Evidence: `bun test tests/vh-adlc/ownership/handoff.test.ts` at `de1aebaa`. Conflict and transfer records named the writer, host and spec. Only the matching local checkout resolved an absolute path. Every fixture commit in the reservation history and the remote diagnostic lacked the planted raw session IDs and local path.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-10 | Race two processes through feature entry with independent clones of a disposable bare remote. Verify one reservation, unchanged source, index and refs in the losing clone apart from remote reads, and the current writer and location in the refusal. Race two starts for the same new issue-less spec path and verify only the winner can write the draft. Separate items both succeed. |
| AC-11 | Enter through issue, spec and branch using HTTPS and SSH spellings for valid fetch and push. Pair the canonical fetch URL with a push URL to a different repo at the same tip. Refuse entry and confirm both remotes are unchanged. Race an old alias against a move and refuse an alias reserved elsewhere. Try entry by a newly created issue number before and after linking it to a reserved draft. Let a tracker fixture create an issue and lose its response. Restart the draft workflow. Make lookup fail and verify direct writer entry stays held while read-only lookup remains available. Recover the existing issue from its pending preview without creating another, apply the conflict procedure if it was independently reserved, and show the chosen writer can resume only after verified recovery. Verify unlinked behavior, then discover a collision between existing reservations. Use a draft with a retained old spec path. Hold entry through every alias of both records until an explicit choice binds them all to one writer, preserving both histories and working trees. Exercise spec authoring through isolated implementation in the same session with no extra owner approval. Retain a rejected claim commit and retry from the new tip while a competitor stays held. Lose the response after an accepted update, verify exactly one matching operation and admit its writer. Pair it with a rejected or superseded operation and hold if either the operation or resulting record cannot be verified. A missing ref, unrelated genesis or offline remote holds entry. Prove each direct writer entry and both claim paths stop a competitor before edit, commit or push. Run a read-only review, then edit and test as current writer with no additional reservation calls. In each installed client, restart the process, resume the same conversation successfully and refuse a fresh conversation in the same checkout. Exercise both actual installed entry routes with mixed host environment markers and assert a hold. Invoke standalone claim with a matching explicit client and with a missing or mismatched ID. Verify no fallback to the other family. In a fixture, show why an unsupported child inheriting only its parent's client markers is outside the guarantee, then clear those markers and verify that writer entry holds without a native identity. |
| AC-12 | Seed committed and dirty work. Refuse handoff without stop confirmation. Prove same-checkout handoff and handoff to a clone that initially lacks the work. Before transfer, compare the required commits, file hashes and index entries in the prepared destination. Simulate an uncertain transfer and require the owner to keep the old writer stopped until verification, with original work retained. Race or replay transfer requests and verify no request overwrites a later handoff. Resume both sessions through vh-adlc after success. Verify the new writer can continue, the old one sees the transfer, and a paused or quota-limited owner retains its reservation until handoff. Seed both the marker and preview for an uncertain issue creation before a move. Refuse the move if either is missing at the destination. Verify the incoming writer recovers the existing issue without creating another. |
| AC-13 | Check stale-checkout policy discovery, both halves of interrupted setup, both records lost after verified adoption, a fresh clone of the restored remote with no prior binding, a genuinely unadopted remote, and an unsupported or missing client on both unadopted and adopted repositories. Verify the previously bound checkout holds, and show that the fresh clone cannot know the remote was adopted. Keep writing paused until restoring the original authority. Give the same explicit local-only draft request to an original local repository and a stale clone whose origin was removed before adoption verification. Both permit only a new local draft, and shared writer entry without origin holds. A verified adopted clone refuses the exception after origin is removed. Try a direct writer against an unresolved legacy claim and verify the ref stays unchanged. Race two owner reconciliations or lose a winning response, then resume the selected existing writer and hold another clone. Race initializers, lose a create response, and verify downgrade and compatible recovery of the same history. Keep the adopting fixture paused if its effective remote protection or release exclusion is missing. Verify both against the fixture consumer’s own policy before resumption. Prove a disposable remote accepts appends and refuses deletion and rewrites. Make the reserved and ordinary refs otherwise eligible for cleanup and select only the ordinary branch. Verify push and dispatch can reach tag-capable CI for an ordinary product branch but cannot for the reserved ref. Observe a permitted coordination push and a no-push refusal, with source refs and tracker unchanged. Run the Bun plugin checks and install from both exact candidate catalogs in isolated profiles. |
| AC-14 | Capture conflict and transfer output from a remote clone and a checkout where the work location resolves locally. Verify the current writer's host and branch or spec, and an absolute path only in the local case. Inspect the shared history and remote diagnostics for permitted identifiers and absence of the planted raw session ID and absolute checkout path. |

## Tasks

- [x] T1 `plugins/vh-adlc/scripts/ownership/`, both vh-adlc plugin manifests and `tests/vh-adlc/ownership/` - write the two-clone regression first. Prove one reservation wins for the same issue or new spec path, separate items can proceed, denied clients leave source and index intact, and a push to a different repository is refused. Run `bun test tests/vh-adlc/ownership/entry.test.ts` (AC-10, AC-11).
      Evidence: The two-clone baseline admitted two writers. The new command tests initially failed because the command did not exist. `bun test tests/vh-adlc/ownership/entry.test.ts` now passes all three tests against the disposable remote.
- [x] T2 `plugins/vh-adlc/scripts/ownership/{git,policy,entry}.ts` and `tests/vh-adlc/ownership/policy.test.ts` - prove expected-absent initialization, verification from current main, a refused or lost update response, and refusal on missing or replaced authority. Cover known adoption after both records vanish, no-push, local-only drafts and compatible recovery using `bun test tests/vh-adlc/ownership/policy.test.ts` (AC-10, AC-11, AC-13).
      Evidence: Policy tests reproduced private-draft startup and missing-origin refusals before the fix. The targeted ownership and package checks passed, including stale policy, lost and rejected pushes, missing adoption records and unrelated history.
- [x] T3 `plugins/vh-adlc/scripts/ownership/{entry,handoff}.ts` and `tests/vh-adlc/ownership/handoff.test.ts` - prove legacy-claim enrollment, same-session relocation after existing worktree checks, and an owner-confirmed transfer with preserved work. Race or replay competing transfers and verify location output, old-writer refusal and private fields using `bun test tests/vh-adlc/ownership/handoff.test.ts` (AC-11, AC-12, AC-13, AC-14).
      Evidence: The handoff tests first failed without transfer and relocation support. The ownership tests now pass for exact approved transfer, replay, competing legacy enrollment, relocation and local or remote diagnostics.
- [x] T4 `plugins/vh-adlc/scripts/ownership/{identity,entry,issue-link}.ts`, `plugins/vh-adlc/scripts/labels/` and `tests/vh-adlc/ownership/issue-link.test.ts` - prove alias collisions hold all retained paths, then reconcile explicitly. Prove interrupted issue creation keeps the draft held across restart, a same-session move and a handoff. At each destination try writer entry before recovery, allow lookup, then verify one issue and successful resume. Run `bun test tests/vh-adlc/ownership/issue-link.test.ts` (AC-10, AC-11, AC-12).
      Evidence: The alias and pending tests initially failed without the new operations. The ownership, labels and issue fixture checks pass. The fixture applies one tracker create, loses the response, refuses a second create and recovers the original issue. Both movement paths keep draft entry held while pending.
- [x] T5 `plugins/vh-adlc/scripts/{loop,ownership}/`, the feature-writing skills under `plugins/vh-adlc/skills/`, and `tests/vh-adlc/{loop,ownership}/` - wire every direct feature writer and resume to the shared check, including both claim paths and a retry that preserves the rejected claim. Verify the loser cannot edit, commit or push, review stays read-only, and edits and tests cause no extra reservation calls. Run `bun test tests/vh-adlc/loop tests/vh-adlc/ownership` (AC-10, AC-11, AC-12, AC-14).
      Evidence: The standalone claim regression first allowed the competitor. The adapter, claim, direct-operation compatibility and package checks then passed all 83 tests. Native installed-client behavior remains for T8.
- [x] T6 `plugins/vh-adlc/scripts/branches/`, `.github/workflows/{ci,preview,release}.yml` and `tests/vh-adlc/{branches,ownership}/` - prove the coordination ref stays outside cleanup and tag-capable push and dispatch paths while ordinary branches keep their existing behavior. Cover authority and release checks on a disposable adopter. Run `bun test tests/vh-adlc/branches tests/vh-adlc/ownership` (AC-13).
      Evidence: The new adoption and routing checks failed before the guards. With the sandbox pipe restriction removed, all 56 branch and adoption tests passed. A disposable remote accepted appends, refused deletion and history rewrites, and kept feature entry paused until the adopter marked its checks ready. Workflow dispatch conditions were inspected locally, not executed on GitHub.
- [x] T7 `plugins/vh-adlc/references/{authority,branches,lifecycle,loop,loop-settings}.md`, `docs/user-guides/workflows.md`, and `docs/{reference/compatibility,get-started/installation}.md` - document one-time opt-in, the writer check, handoff, diagnostics, supported clients and rollback against the implemented commands. Verify each documented procedure on a disposable repository and run `bun test tests/vh-adlc` (AC-11, AC-12, AC-13, AC-14).
      Evidence: The ownership, direct-route compatibility and plugin package checks passed all 93 tests. The documented initialization, adoption pause, entry, handoff, issue recovery and legacy enrollment were exercised on disposable repositories by the ownership fixtures.
- [ ] T8 `tests/vh-adlc/ownership/native.test.ts`, the vh-adlc plugin manifests and both marketplace catalogs - install the exact candidate in isolated Codex and Claude Code profiles. Prove resume after restart, competing sessions, mixed markers and supported handoff behavior against disposable repositories, retaining native evidence. Run `bun test tests/vh-adlc` at the candidate. Keep Claude evidence pending until its use is authorized (AC-10, AC-11, AC-12, AC-13).
      Evidence: All 4,251 cases from `bun test tests/vh-adlc` passed across isolated batches and retries on Linux with Bun 1.4.4 at `3eba249ac5dd956fa014feeff0718760d06e9ee6`. Codex CLI 0.167.2 and Claude Code 2.1.326 each installed the exact catalog payload with matching bytes and file modes and ran its initialization helper on a disposable Git remote. With scripted local providers, both clients preserved the owner through restart, held competing and mixed-marker sessions, transferred ownership, and let a different issue proceed. Claude Code first parsed the prompt as an allowed tool and passed after the trial separated the arguments. Verification of the combined package after the merge from `main` remains open.

## Open Questions

None. The owner selected the Git reservation, entry checks and explicit handoff.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-19 | R-1 | spec | `7e7ebe74c28f4071f20f3d963b2e54a6a24418c3` | gpt-6.1-sol | procedural | Two blocking and five should-fix findings; native failure refusal and ownership transitions need revision. |
| 2026-11-19 | R-2 | spec | `c13b42da1e2bcf8ff80150320dc42a45b7ba56ad` | gpt-6.1-sol | procedural | Three should-fix findings and one nit on distinct native failures, release publication checks, cross-platform packaging and evidence references. |
| 2026-11-19 | R-3 | spec | `b7fc9a58858df974f1959a805adb6b1f0a8da8c9` | gpt-6.1-sol | procedural | Two should-fix findings on branch cleanup coverage and recovering an admitted action. |
| 2026-11-19 | R-4 | spec | `13b62cefb0cd4eff6388f4a9eb328f835172bff6` | gpt-6.1-sol | procedural | NO FINDINGS. |
| 2026-11-19 | R-5 | spec | `e0894287d8f4b9812ce2cf9eb522791c364e0761` | unknown | procedural | Three blocking and six should-fix findings on workflow routes, adoption, handoff and proof. Model identity was not attested. |
| 2026-11-19 | R-6 | spec | `b2c53b40737f7bd15ee8b1d3de804a92347dc139` | unknown | procedural | Two blocking and six should-fix findings on existing entry paths and verification. Model identity was not attested. |
| 2026-11-19 | R-7 | spec | `d14c0aa5db6970bb9225cefd54cbebed6273624f` | unknown | procedural | Three should-fix findings on client, local-only and remote identification. Model identity was not attested. |
| 2026-11-19 | R-8 | spec | `810132e29e1e69ee15b1f37bf5b1d5fb86ba0cab` | unknown | procedural | One blocking and five should-fix findings on rollout, linking and proof. Model identity was not attested. |
| 2026-11-19 | R-9 | spec | `23ff6ec2d3e0907aafbc5a74e0af550ae4f802f2` | unknown | procedural | One blocking and three should-fix findings on remembered adoption, alias collisions and installed client proof. Model identity was not attested. |
| 2026-11-19 | R-10 | spec | `1e5b607fdf49755d051f53d7c209e8513cb68a54` | unknown | procedural | No blocking findings. Three should-fix findings on recovery limits, retained aliases and nested client identity. Model identity was not attested. |
| 2026-11-19 | R-11 | spec | `6b107fa86ebff48dfeed86378128ef481a9284ad` | unknown | procedural | One should-fix finding on recovery after an uncertain issue creation. Model identity was not attested. |
| 2026-11-19 | R-12 | spec | `1844e72a74c9b7065e443b631375b542642e6307` | unknown | procedural | Two should-fix findings on pending draft entry and preservation of its marker. Model identity was not attested. |
| 2026-11-19 | R-13 | spec | `014299049c45051a2d4f8e3b40ba33e3de4ba51f` | unknown | procedural | No blocking findings. One should-fix on exercising already-specified pending behavior through both move paths. Model identity was not attested. |
| 2026-11-19 | R-13 | spec | `014299049c45051a2d4f8e3b40ba33e3de4ba51f` | n/a | n/a | accepted by owner |

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

### R-5

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Scope; Design, Start, resume and hand off; AC-10 and AC-11; Test Plan, AC-10 and AC-11.
EVIDENCE: The revised scope names implement, re-entry, spec and tasks. The direct ship route commits documentation fixes and completion changes at `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:56-79`. The review route stores records, updates criteria and commits the feature document at `plugins/vh-adlc/skills/vh-adlc-review/SKILL.md:62-79`. The current routes rely on manual handoff. The proposed start and resume tests can pass while either direct route still admits a competing writer.
PROPOSAL: Name all feature workflow entries that can write, including direct ship and review recording, and require the shared check before their first feature mutation. Prove those entries hold a conflicting session while independent review can still return findings.

FINDING: F-02
KIND: judgement
SEVERITY: blocking
WHERE: Context, Owner summary, adoption and verification; Scope; Design, Store the reservation in Git and Adopt and roll back; AC-10, AC-11 and AC-13; Test Plan, AC-11 and AC-13.
EVIDENCE: The revision binds genesis in committed repository policy and retains the existing workflow for unadopted repositories, but never specifies which commit proves either state. Ordinary loop settings come from the current checkout and default when absent at `plugins/vh-adlc/scripts/loop/settings.ts:202-209` and `plugins/vh-adlc/scripts/settings-file.ts:17-30`. A compatible client in a feature checkout cut before adoption can therefore treat the repository as unadopted. Ref creation and policy publication can also fail independently while existing sessions continue on the old workflow.
PROPOSAL: Define how a writer establishes current adoption policy from the authoritative remote and what happens when that check fails. Define the cutover condition that keeps existing writers coordinated until both setup steps are verified, and test a stale checkout and an interrupted setup.

FINDING: F-03
KIND: judgement
SEVERITY: blocking
WHERE: Context, Owner summary, handoff; Design, Start, resume and hand off; Glossary, Handoff; AC-12; Test Plan, AC-12.
EVIDENCE: In the revised handoff, the owner can correctly confirm that the old session stopped, then the old session can re-enter with both bindings still valid before the transfer push lands. Its successful read-only resume leaves the reserved ref unchanged, so the incoming handoff still passes its expected-record check. The proof races handoff requests and resumes the old session after transfer, leaving this ordering untested.
PROPOSAL: State that the owner keeps the former session stopped through verified completion of the transfer, including any uncertain Git result, and make that operating condition explicit in the handoff instruction and proof. Keep the check at workflow entry.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Scope, existing claim and worktree procedure; Design, Start, resume and hand off; AC-11; Test Plan, AC-11.
EVIDENCE: The revised design requires both session and checkout bindings to match and retains the reservation after a rejected claim push. The existing recovery at `plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md:37-39` can retry from a worktree at the new default tip. The design does not say how that legitimate retry obtains a different checkout binding while retaining the rejected local claim. The proof allows a clear stop, so a client that strands every such reservation can pass.
PROPOSAL: Define the supported recovery when the same writer needs a fresh worktree, including whether it uses the explicit handoff and how the pending commit stays available. Require a rejected claim followed by a successful authorized retry and verify that a competing session remains held.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Identify the same work and Store the reservation in Git; AC-10 and AC-11; Test Plan, AC-11.
EVIDENCE: The revision calls for reconciling aliases before linking or moving a spec, but does not say whether former aliases remain bound to the same reservation, what happens when the new alias already has a reservation, or when lookup is repeated after a compare-and-update loss. The proof permits a changed or ambiguous alias and only asks for correct entry or a clear stop. It can miss a stale reader recreating the old key after a migration or an alias change that silently displaces an existing writer.
PROPOSAL: Define how one reservation identity survives alias changes and how an update holds when either alias points to another reservation. Resolve against the tip used for the update and test an old alias racing a migration and a destination alias with an existing writer.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary, permissions; Scope; Design, Store the reservation in Git and Adopt and roll back; AC-10 and AC-13; Test Plan, AC-13.
EVIDENCE: First entry now needs a remote Git write even when the underlying feature operation only has local authority. `plugins/vh-adlc/references/authority.md:8-31,42-46` distinguishes local authoring from publication and grants no reservation write today. The revised design authorizes setup and preserves source publication limits, but does not say what authorizes an ordinary acquisition or whether a task's explicit no-push restriction covers that acquisition.
PROPOSAL: Specify the authority and destination for ordinary coordination pushes and the result when a current request forbids them. Prove the allowed reserved-ref write and a refused coordination write while source refs and tracker permissions remain governed by the existing rules.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary, handoff preservation; Design, Start, resume and hand off; AC-12; Test Plan, AC-12.
EVIDENCE: The revision allows a different work location after an explicitly preserved handoff. The test can pass when both clones are unchanged and the old files remain safe, even if the replacement is admitted from an earlier commit without the staged, unstaged or untracked work needed to continue. A further partial failure is possible if the replacement has been prepared but the reservation transfer never succeeds.
PROPOSAL: State what the owner and incoming writer must verify about the preserved commit and unfinished work before switching locations, and what remains available if the transfer fails. Exercise successful same-checkout and different-checkout handoffs with a destination that initially lacks the prior work.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Design, Adopt and roll back, branch cleanup and CI exclusion; AC-13; Test Plan, AC-13.
EVIDENCE: `plugins/vh-adlc/scripts/branches/branches.ts:319-349` already keeps unmerged remote refs, and `.github/workflows/ci.yml:194-205` can calculate a version for a branch without tagging it. A test that observes a disposable unmerged coordination ref survive and sees no release from one push can pass without either exclusion being implemented.
PROPOSAL: Test cleanup with the reserved ref otherwise eligible for deletion alongside an eligible ordinary ref. Check that the coordination ref cannot reach the tag-capable CI path and that ordinary product branches retain their existing behavior.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Design, Adopt and roll back, affected artifact and candidate packaging; Test Plan, AC-11 and AC-13; Sources.
EVIDENCE: The pinned `conventions/delivery.md`, Feature delivery, requires naming each affected artifact's publication path and verifying the candidate through that path before merge. The revision names both marketplaces but only asks for candidate payload checks and feature entry. `docs/reference/marketplace.md:5-22` and `docs/get-started/installation.md:61-88` establish that both clients install from the Git-backed marketplace catalogs. A copied package can satisfy the stated candidate checks without either catalog installing it.
PROPOSAL: Name both catalog publication paths and run pre-merge checks by installing the exact candidate from both catalogs into isolated profiles. Run the feature entry scenarios against those installed packages.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Scope, feature-writing entry; Design, Identify the same work and Start, resume and hand off; AC-10 and AC-11; Test Plan, AC-10 and AC-11.
EVIDENCE: The revised design requires a tracked canonical spec path for an issue-less feature and pauses unresolved identities before any feature write. `plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:25,48-63,76` accepts a goal and creates a new draft when `find` returns nothing. Before writing that draft, the operation may have neither an issue nor a tracked spec. The issue-less spec test can use an existing file and miss this blocked entry.
PROPOSAL: Define how an issue-less draft gets a canonical reservation key before its first write, or obtain an owner decision to restrict that authoring route. Test two sessions starting the same new issue-less draft and verify that the winner can write it.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Scope, direct and resume entries; Design, Start, resume and hand off and Adopt and roll back; AC-10, AC-11 and AC-13; Test Plan, AC-11 and AC-13.
EVIDENCE: The revision expands the check to direct operations, but the legacy-claim exception still says “A resume with no history of ownership stays held.” Direct spec revision and implementation can enter an already claimed feature without invoking resume (`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:53-57` and `plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:90-98`). Applying “An unreserved item is reserved once” on those routes can give an unreconciled entrant the reservation before the existing handoff instruction stops source writes, preventing the legitimate writer from continuing.
PROPOSAL: Apply the unresolved-legacy-claim hold to every writer entry before acquiring a reservation. Test a direct operation against an existing claim with no reservation and require an unchanged reservation ref until the owner reconciles it.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary, ordinary resume and handoff; Scope, existing worktree procedure; Design, Start, resume and hand off; Glossary, Handoff; AC-11 and AC-12; Test Plan, AC-11 and AC-12.
EVIDENCE: Direct spec authoring uses a worktree holding the default branch, and `implement_worktree: isolated` sends implementation from the primary checkout to a new host worktree (`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:53-57` and `plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:46-53`). `tests/vh-adlc/loop/claim.test.ts:96-115` covers that ordinary move before the first claim. The revision defines checkout rebinding for a rejected claim, but the first transition from a reserved spec to isolated implementation also changes the checkout binding. A matching resume and a rejected-claim retry can both pass while that normal path stalls.
PROPOSAL: State when the reservation is checked and how the same writer moves to the isolated worktree on the first implementation entry. If that transition needs an owner-approved handoff, make the extra step explicit and exercise the complete spec-to-claim sequence.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary, current-writer resume and handoff; Design, Store the reservation in Git and Start, resume and hand off; Glossary, Current writer and Handoff; AC-11 and AC-12; Test Plan, AC-11 and AC-12.
EVIDENCE: The design calls for “the current client's session binding” but leaves its source and lifetime undefined. The checked-in native role launcher passes a generated session ID to child commands (`plugins/vh-adlc/scripts/docs-drift/role-launch.ts:79,98`). That code does not establish how an ordinary installed session obtains or recovers its own binding. The same-checkout test can use two synthetic IDs, and a successful installed resume can run in the original process. Both can pass while the original conversation loses ownership after a process restart, or while a fresh conversation inherits ownership from checkout-local state.
PROPOSAL: Define how each supported client supplies a stable session binding, when it survives a resume and how entry holds when the binding is unavailable. In both installed clients, resume the original conversation after restarting the process and refuse a fresh conversation in the same checkout.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary, adoption and verification; Scope, adopted repositories; Design, Store the reservation in Git and Adopt and roll back; AC-11 and AC-13; Test Plan, AC-11 and AC-13.
EVIDENCE: The revision holds entry if either remote lookup fails and requires two successful absences to establish legacy behavior. Generic intake currently allows a local draft, check and commit without publication authority (`plugins/vh-adlc/references/lifecycle.md:110-124`). A local Git repository without an origin cannot prove either remote absence. The unadopted fixture can use a reachable origin and miss the loss of this local entry path.
PROPOSAL: Specify the result for a repository with no adoption remote, including a way to distinguish it from an adopted checkout whose origin is missing or unavailable. Exercise local authoring without an origin and confirm that removing origin from an adopted checkout cannot bypass its reservation.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Scope, direct entry; Design, Start, resume and hand off; AC-10 and AC-11; Test Plan, AC-10 and AC-11.
EVIDENCE: The existing workflow has both a skill-driven claim (`plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:68-88`) and a mutating `loop/cli.ts claim` command used by isolated implementation and rejected-claim retry (`plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:46-53`, `plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md:37-39` and `tests/vh-adlc/loop/cli.test.ts:107-122`). The revised proof names operations, but does not require the direct claim command or both claim paths. An implementation can check a caller and leave the documented command able to write without checking ownership.
PROPOSAL: Identify where both supported claim paths enforce or receive the same entry decision. Invoke the documented claim command against a competing reservation and prove it holds before editing, committing or pushing.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary, adoption verification; Design, Store the reservation in Git and Adopt and roll back; AC-11 and AC-13; Test Plan, AC-11 and AC-13.
EVIDENCE: The revision binds a genesis and requires protected history, but the adoption proof checks missing halves, initializer contention and compatible recovery. A reader that accepts any present ref can pass those cases and admit a fresh writer after the real ref is recreated with a different genesis. Cleanup exclusion also provides no evidence that the remote itself refuses deletion or history replacement.
PROPOSAL: Require admission to verify that the observed reservation history descends from the policy's bound genesis. Test an unrelated replacement ref and verify on a disposable remote that ordinary append succeeds while deletion and a non-fast-forward rewrite are rejected.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Design, Adopt and roll back, CI and release routing; AC-13; Test Plan, AC-13.
EVIDENCE: The revised release proof adds a useful ordinary-branch control, but cites only push and tag routing. `.github/workflows/ci.yml:3-6,194-205` also permits manual dispatch, and `.github/workflows/preview.yml:3-21` dispatches the same workflow on the PR head. A push-only filter can pass a push comparison while leaving dispatch to the tag-capable job available.
PROPOSAL: Verify exclusion for both push and dispatch routes through the tag-capable job, with an ordinary product branch as the positive control. If the reservation artifact itself prevents dispatch, demonstrate that with the actual artifact shape.

### R-7

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Start, resume and hand off, current client identity and direct claim; Glossary, Current writer; AC-10 and AC-11; Test Plan, AC-11; Sources, Recorded CLI session ID observations.
EVIDENCE: The revision names both clients' session variables without saying how the shared helper knows which client owns the invocation. The cited `docs/specs/session-retrospective.md:762-765` records a nested Codex process with both hosts' variables present. The direct claim entry at `plugins/vh-adlc/scripts/loop/cli.ts:88-101` currently has no client input. Separate clean-profile tests can pass while a fresh nested conversation inherits the parent writer's reservation.
PROPOSAL: Define how installed skills and the direct claim command identify the current client. Test both variables present and verify that the selected client's missing ID still holds entry when the other client's ID is set.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary, adoption verification; Scope, adopted repositories; Design, Adopt and roll back, local-only entry; AC-11 and AC-13; Test Plan, AC-13.
EVIDENCE: The revision permits a deliberately local repository without a remote and records adoption locally after verification. A clone cut before adoption can lose origin before its first verification with the new client. It then has neither the recorded binding nor a fetched adoption policy. The test removes origin after adoption and can pass when the client admits this stale clone as local-only.
PROPOSAL: State what positive evidence qualifies a checkout for the local-only route. Test loss of origin from a pre-adoption clone before its first verification and preserve successful drafting in a deliberately local repository.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Identify the same work and Store the reservation in Git, canonical destination; AC-10, AC-11 and AC-13; Test Plan, AC-11 and AC-13.
EVIDENCE: Git supports separate fetch and push URLs through `remote.<name>.url` and `remote.<name>.pushurl`. The HTTPS and SSH checks can pass when both point to the same repository, even if the helper verifies the fetch URL and then pushes through a different configured destination. A mirror with the same reservation tip can accept the exact-tip update without reserving the item on the canonical remote.
PROPOSAL: Test a canonical fetch URL paired with a different push repository at the same reservation tip. Require entry to stop before changing either remote, alongside the successful case where both URLs resolve to the canonical repository.

### R-8

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Context, Owner summary, adoption verification; Scope, adopted repositories; Design, Adopt and roll back, local-only entry; AC-11 and AC-13; Test Plan, AC-11 and AC-13.
EVIDENCE: The R-7 revision adds an explicit owner request for a local-only draft with no issue or branch and no evidence of prior adoption. Those conditions also hold when a clone made before adoption loses its origin before the first verification and receives the same request. In scratch Git repositories, a clone after `git remote remove origin` and a deliberately local repository both returned no remotes, no `remote.*` configuration and no remote-tracking refs. The two AC-13 cases can pass if only the genuinely local case receives the explicit request.
PROPOSAL: Define the evidence that qualifies a checkout for local-only drafting independently of the current request, or make that request an explicit exception to the pre-adoption-clone rule. Use the same local-only request in both proof cases so the test distinguishes the chosen behavior.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary, resume and adoption; Design, Start, resume and hand off, legacy claims and transfer; Design, Adopt and roll back, existing claims; AC-11, AC-12 and AC-13; Test Plan, AC-11, AC-12 and AC-13.
EVIDENCE: The legacy-claim correction holds every writer entry until the owner reconciles the claim. The design says the owner selects a writer and location, but supplies no transition that binds that choice in Git when the item has an existing claim and no reservation. Ordinary entry holds that item, and handoff compares a prior writer and record that do not exist. The proof can pass by observing the hold and never attempting continuation.
PROPOSAL: Specify how the owner's reconciliation creates the first reservation against the verified tip, and what a competing reconciliation or uncertain result does. Prove that the selected writer resumes the existing work while another clone stays held.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary, the clients covered and adoption; Scope, feature-writing entries; Design, Start, resume and hand off, client identification; Design, Adopt and roll back, client verification; AC-10, AC-11 and AC-13; Test Plan, AC-10, AC-11 and AC-13.
EVIDENCE: The R-7 revision requires each installed workflow to select `codex` or `claude`. `docs/reference/compatibility.md:131-151` records a core feature loop on the VS Code Copilot Chat Local harness, and `docs/get-started/installation.md:28-39` describes that installation. The draft gives no entry outcome for this harness. An implementation can pass both CLI tests while either allowing an unchecked writer in an adopted repository or disabling an existing route in an unadopted repository.
PROPOSAL: State the supported writer clients and the entry result for other harnesses in adopted and unadopted repositories. Prove the chosen behavior for an unsupported or unidentified client and record the compatibility boundary.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary, issue and draft entry; Scope, spec authoring; Design, Identify the same work, issue linking; AC-10 and AC-11; Test Plan, AC-10 and AC-11.
EVIDENCE: `plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:40-46,76` supports creating an issue with separate owner authority. For an existing reserved draft, the issue number becomes available when the tracker creates the issue. Another session given that number can reserve it before the original session binds it to the draft. Neither the current default-branch associations nor the reservation tip yet connects the two. Holding the later alias update preserves both reservations but permits the original duplicate start. The planned race uses an alias already known to the workflow.
PROPOSAL: Define how an issue created for a reserved draft becomes identifiable at writer entry, or state the limitation and the supported way to link a new issue. Exercise entry by the new issue between tracker creation and the Git alias update.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary, Git verification; Design, Store the reservation in Git, lost responses; AC-10 and AC-11; Test Plan, AC-10 and AC-11.
EVIDENCE: The design verifies both the exact operation and the current writer after a lost response. The AC-11 proof only requires lost responses to hold unverified writers. A helper that reports every lost response as a hold can pass even when its exact update was applied and verified. A check that looks only at the writer can also pass the stated proof without matching the operation.
PROPOSAL: Lose the response after the remote accepts the update and require verified success with one operation. Pair it with a refused or superseded update and require a hold when the operation or current record fails verification.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary, current writer and work location; Design, Store the reservation in Git, shared and local fields; Design, Start, resume and hand off, transfer message; Glossary, Current writer and Work location; AC-10 and AC-12; Test Plan, AC-10 and AC-12.
EVIDENCE: The design forbids raw session IDs and absolute checkout paths in the shared ref, and defines the work location as a host label plus branch or spec with a checkout path when local. The proof checks for a writer and location in the refusal and checks the handoff result. It can pass if the ref contains the raw fields or if the reported location lacks the defined host and branch or spec information. The pinned `conventions/feature-documents.md`, Open questions, requires introduced user-facing terms to be held to their glossary definitions by a criterion.
PROPOSAL: Check the reservation history and remote diagnostics for the permitted fields and absence of raw session IDs and absolute paths. Verify that conflict and transfer output identifies the current writer's host and branch or spec, with the local checkout path only when safely resolved.

### R-9

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Context, Owner summary, adoption verification. Scope, adopted and unadopted entry. Design, Identify the same work, Store the reservation in Git, and Adopt and roll back. AC-11 and AC-13. Test Plan, AC-11 and AC-13.
EVIDENCE: Lines 137-138 require a hold when an adopted ref is missing. Lines 189-199 say that two absent remote lookups establish legacy behavior, and use remembered adoption only to refuse the local-only exception. If the canonical remote is restored from a pre-adoption backup, a previously verified checkout can see both lookups succeed with absence and enter without checking the reservation. The proof covers each missing half and removed origin, so both checks can pass while this route admits a writer.
PROPOSAL: Make a verified adoption binding take precedence over remote absence. Test a known-adopted checkout whose canonical remote answers both lookups with absence, alongside a genuinely unadopted checkout that may still enter.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Identify the same work, alias reconciliation and issue creation. Design, Start, resume and hand off, existing-claim reconciliation. AC-10 and AC-11. Test Plan, AC-11.
EVIDENCE: The R-8 revision defines the window when a new issue can be reserved independently and tells the owner to reconcile the two records once the relationship is known. Lines 111-121 hold a conflicting alias and retain both existing bindings. Lines 148-157 supply a transition only for a legacy claim with no reservation. The proof can pass after observing a refused link while future issue and spec entries still select different current writers for the now-identified feature.
PROPOSAL: Define what the owner can do after both records exist, including which entry paths hold before reconciliation and which writer can continue afterward. If automated reconciliation is outside this feature, state the supported stopping point and test it from both entry paths.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary, adoption and verification. Scope, adopted repositories and delivery. Design, Adopt and roll back, protection, release routing and cutover. AC-13. Test Plan, AC-13.
EVIDENCE: Lines 202-216 require remote protection and release exclusion before writers resume, but do not identify what verifies these conditions in the adopting consumer. The cited `.github/workflows/ci.yml` and `preview.yml` configure this repository only. A disposable bare remote and checks of vh-adlc's own workflows can pass while a consumer's reserved branch remains unprotected or enters that consumer's release routing. The Owner summary also omits the required pause across setup.
PROPOSAL: State the adopter's checks for its actual remote protection and release routes, and tie resumption to observing those checks with the writers still paused. Exercise adoption with a consumer fixture that initially lacks the required protection or exclusion.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Scope, supported and unidentified clients. Design, Start, resume and hand off, client selection, and Adopt and roll back, installed checks. AC-11 and AC-13. Test Plan, AC-11 and AC-13.
EVIDENCE: The two catalogs resolve to the same plugin source at `.agents/plugins/marketplace.json:18-22` and `.claude-plugin/marketplace.json:18-20`. Lines 159-166 require the installed workflow to select the current client, but the mixed-environment proof can pass by calling the helper with each client flag fixed by the test. `docs/specs/session-retrospective.md:762-765` records a real nested invocation inheriting both IDs. Separate installed resumes and helper-only mixed tests can therefore pass while an installed entry chooses the parent client and admits the wrong session.
PROPOSAL: Specify how the installed entry identifies its client independently of the inherited session variables. Drive the mixed-environment proof through the installed entry, and exercise the standalone claim command separately with an explicit client.

### R-10

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary, remote verification. Scope, adopted and unadopted entry. Design, Store the reservation in Git, missing remote state, and Adopt and roll back, remembered adoption. AC-11 and AC-13. Test Plan, AC-11 and AC-13.
EVIDENCE: The R-9 follow-up at lines 193-205 holds a checkout that remembers adoption when both remote records disappear. A fresh clone of the same origin after restoration from a pre-adoption backup has neither the binding nor either remote record. The two successful absences send it through legacy entry. Two fresh clones can therefore start the same item during recovery, while the AC-13 case using a previously verified checkout passes.
PROPOSAL: State the limit of the Git-only check after loss of both records and document when the owner must keep writer entry paused during recovery. Exercise both a previously verified checkout and a fresh clone against the restored remote.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Identify the same work, retained aliases and conflict reconciliation. AC-10 and AC-11. Test Plan, AC-11.
EVIDENCE: Lines 111-115 retain old aliases after moving a spec. The R-9 follow-up at lines 120-124 pauses entry through either identity and then points both aliases at the selected reservation. A reservation whose spec was already moved can have several aliases before it collides with the issue reservation. The two-alias proof can pass while a retained path still resolves to the former writer or remains held after reconciliation.
PROPOSAL: Define how reconciliation handles every existing alias of both records. Include a previously moved spec in the collision test and verify that all retained paths hold during the conflict and resolve to the selected writer afterward.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Context, Owner summary, supported clients. Scope, supported and unidentified clients. Design, Start, resume and hand off, client detection, and Adopt and roll back, installed checks. AC-11 and AC-13. Test Plan, AC-11 and AC-13.
EVIDENCE: The R-9 follow-up at lines 162-170 rejects mixed Codex and Claude markers, but treats a single supported family's environment as the current client's identity. A different harness launched as a child of a Codex session can inherit that session's IDs without supplying Claude markers. The helper can attribute the child's entry to the parent writer. AC-11 tests both supported families together and AC-13 can exercise an unsupported client with a clean environment, so both can pass despite this path.
PROPOSAL: Define how an installed writer route distinguishes its own client from inherited markers, or state the operational limit for nested unsupported clients. Test an unsupported route with the active writer's markers inherited and verify the chosen behavior.

### R-11

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Identify the same work, issue creation and alias reconciliation. Design, Store the reservation in Git, lost responses. AC-10 and AC-11. Test Plan, AC-11.
EVIDENCE: The R-8 and R-9 follow-ups at `docs/specs/single-writer-ownership.md:118-126` define the pre-link window and reconciliation once the relationship is found. The issue helper sends the tracker request and returns the issue number separately from the Git update (`plugins/vh-adlc/scripts/labels/github.ts:46-49`). If the tracker creates the issue and its response is lost, the resumed draft has no specified way to recover the link. The proof at line 269 can pass with every creation response delivered, while two sessions continue through the draft and issue after an interrupted creation.
PROPOSAL: Document how the owner checks an uncertain issue creation and links the existing issue before continuing the draft or retrying creation. Exercise a successful tracker creation with a lost response, then verify that recovery uses the existing issue and applies the existing conflict procedure if another session already reserved it.

### R-12

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary. Design, Identify the same work, uncertain issue creation. Design, Start, resume and hand off, writer entry. AC-10 and AC-11. Test Plan, AC-11.
EVIDENCE: The R-11 follow-up at `docs/specs/single-writer-ownership.md:129-135` prohibits a second creation request while the first outcome is uncertain. It leaves other draft writes open. Lines 121-124 allow the independently discovered issue to acquire a reservation before the relationship is found. The AC-11 proof at line 279 can pass with a successful lookup even if a failed lookup lets the draft writer resume while a second writer works through the issue.
PROPOSAL: Keep draft writer entry on hold while the issue outcome is pending, with read-only lookup and owner-confirmed recovery available. Prove the hold when lookup fails and verify that writing can resume once the owner clears the pending state through the specified recovery.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Identify the same work, pending creation. Design, Start, resume and hand off, work location changes and transfer. AC-11 and AC-12. Test Plan, AC-11 and AC-12.
EVIDENCE: The R-11 follow-up at `docs/specs/single-writer-ownership.md:129-135,188-203` marks creation pending separately from the approved preview but names only the preview when transferring work to another location. The preview already exists before submission (`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:41-46`), so its presence alone cannot tell the incoming writer whether GitHub may have created the issue. The restart in AC-11 and the handoff in AC-12 can both pass while moving private work state loses the pending marker.
PROPOSAL: Preserve the pending marker and its approved preview together when private work state moves. Seed an uncertain creation before moving to another clone and verify that the incoming writer recovers the existing issue without sending another creation request.

### R-13

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context, Owner summary, interrupted issue creation. Design, Identify the same work, pending creation. Design, Start, resume and hand off, same-session moves and handoffs. AC-11 and AC-12. Test Plan, AC-11 and AC-12.
EVIDENCE: The R-12 follow-up at `docs/specs/single-writer-ownership.md:132-139,192-206` requires pending draft entry to stay held after either kind of move. AC-11 checks the hold after a restart and exercises an ordinary same-session move. AC-12 checks that an incoming writer can recover the issue after moving. Both rows can pass if the same-session move drops the marker or if the incoming writer can enter before recovery.
PROPOSAL: Exercise a pending issue creation through both move paths. At each destination, try direct writer entry before recovery, verify that it holds with read-only lookup available, then complete recovery and verify that the writer can resume without creating a second issue.

## Sources

- [Earlier draft and historical incident receipt reference](https://github.com/michielvha/vh-adlc/blob/289a043d21cdc76310d3d32a62322b5f4cab9637/docs/specs/single-writer-ownership.md#measured-incident-and-current-gaps).
- [Claim and isolation helpers](../../plugins/vh-adlc/scripts/loop/claim.ts) and [existing handoff procedure](../../plugins/vh-adlc/references/authority.md#handoff).
- [CI push and version routing](../../.github/workflows/ci.yml), [preview dispatch](../../.github/workflows/preview.yml) and [tag release trigger](../../.github/workflows/release.yml).
- [Recorded CLI session ID observations](session-retrospective.md). This checkout exposes the Codex variable names. The current Claude route still needs its installed-client proof.
- [Marketplace source layout](../reference/marketplace.md) and [client installation paths](../get-started/installation.md).
