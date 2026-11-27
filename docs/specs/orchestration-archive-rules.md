---
status: draft
status_description: "Written; waiting for the owner's answer to Q1, then a spec review."
issue: https://github.com/michielvha/vh-adlc/issues/180
goal: "An orchestrator archives a sub-session only when the forge shows its work finished, or when another session has taken its feature over and its worktree is kept, and archives nothing outside its workstream that the owner has not picked."
covers:
  - plugins/vh-adlc/references/orchestrate.md
  - plugins/vh-adlc/references/authority.md
  - tests/vh-adlc/check.test.ts
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
---

# Plan: Orchestration archive rules

This feature tightens when the workstream orchestrator may archive a session. It names the two ways a
sub-session ends, work finished and taken over, and gives each its own archive rule. It also limits the
archive grant to the workstream. It amends the required sentences of
[workstream orchestration](workstream-orchestration.md), which stays `complete` and unchanged.

## Context

### Owner summary

On 2026-11-27 the orchestrator archived three sessions with open work: blog visual reading (PR #75),
SEO assessment (PR #76), and "README quality improvement", which was not part of the workstream.
Archiving can't be undone in the Remote Control app. No work was lost, but the owner lost the sidebar
entries for open work. The reference allowed it, because it lets the orchestrator archive a sub-session
"once each is done", and "done" is the session's own word.

After this change, a sub-session ends in one of two ways, and the reference names both side by side.
**Work finished** means the forge CLI shows the work item merged, or the owner has said the work is
abandoned. Only then is the session archived. **Taken over** means another session carries the
feature on, as a paused or stale session's replacement or a resumed copy. The old session may be
archived before the merge, but only once its handoff, naming its worktree, is in the workstream ledger,
and only in a way that keeps its worktree, branch and uncommitted changes. If the host would delete the
worktree, the orchestrator asks the owner first. This brings in #166.

The grant covers only the workstream's sub-sessions. When the owner asks for a general cleanup, the
orchestrator lists every candidate with its work state and archives only the ones the owner picks.

The change is rule text in `references/orchestrate.md` and the orchestration row of
`references/authority.md`, plus tests that read the new sentences from this document. No new code or
tool runs; the forge check is the `gh` read the status pass already does. The plugin's minor version
goes up, as with every plugin feature.

Open decision: Q1 asks when work with nothing to merge counts as finished. No review has run yet, and
nothing in this document has been executed. Acceptance authorizes building the rule and test changes
on a feature branch. Merging and releasing still need the owner.

### Background

Harm: the owner loses track of open work in the app. It happens whenever an orchestrator cleans up
after an environment loss or a replacement, and archiving can't be undone from the app, so it doesn't
heal. The simplest alternative is rule text plus a forge check the orchestrator already knows how to
run. That alternative is this design: it adds no machinery.

The rules today:

- The grant ends "and archiving the workstream's sub-sessions, including those a previous orchestrator
  started, once each is done" (`plugins/vh-adlc/references/orchestrate.md:29`, sentence S-02 of
  `docs/specs/workstream-orchestration.md:370`). The authority row repeats it
  (`plugins/vh-adlc/references/authority.md:37`).
- Close-out: "archive a sub-session only after it has reported done and confirmed its cleanup
  finished" (`plugins/vh-adlc/references/orchestrate.md:200`, S-36 at
  `docs/specs/workstream-orchestration.md:444`). Neither rule asks whether the work is merged, and
  neither asks for a forge check.
- The worktree safeguard for paused sessions is explanation, not a required sentence
  (`plugins/vh-adlc/references/orchestrate.md:170-172`); issue #166 asks for it to be required.
- The status pass already treats a failed forge read as unknown: "A read that fails, times out or
  returns an error is unknown, never merged, clear, idle or done."
  (`plugins/vh-adlc/references/orchestrate.md:128`).
- `tests/vh-adlc/check.test.ts:532-546` reads the required sentences from
  `docs/specs/workstream-orchestration.md` only, and `:595-598` asserts each appears in the
  reference under its section.
- `workstream-orchestration.md` is `complete`. The feature-documents convention at `e79eaa6a` says
  "`complete` is terminal for its scope; new scope is a new feature", and allows `complete` to move only
  to `archived` or `superseded`. That is why this is a new document; the owner chose it on 2026-11-27
  ([#180 comment](https://github.com/michielvha/vh-adlc/issues/180#issuecomment-7213799472)).
- A package change must come with a version change (`tests/vh-adlc/check.test.ts:226-233`). The
  manifests are at `0.33.0` (`plugins/vh-adlc/plugin.json:4`).

## Scope

In scope:

- Replacing required sentences S-02 and S-36 and adding new ones, listed under Design, in
  `plugins/vh-adlc/references/orchestrate.md`.
- A two-row glossary for the two ways a session ends, carried verbatim into the reference's glossary.
- The orchestration row in `plugins/vh-adlc/references/authority.md`: the archive write points to the
  Close-out rules and the row says the grant covers no session outside the workstream.
- `tests/vh-adlc/check.test.ts`: the required-sentence and glossary checks also read this document,
  and its sentences replace those with the same ID.
- The minor version bump in both plugin manifests.

Out of scope:

- Any change to `docs/specs/workstream-orchestration.md`. Its text stays as accepted; this document
  amends its sentence list through the test.
- A script or watcher that archives sessions or checks merge state. The orchestrator runs the forge
  read itself, as in the status pass.
- The host's archive action. Whether it keeps a worktree is the host's behavior; the rule only decides
  when to ask the owner.
- A new row in the reference's incident table. The test fixes that table at sixteen rows under the
  earlier feature's AC-15, and the incident is recorded in this document's Background and in #180.
- Unarchiving. The Remote Control app has no way back.

## Design

### Glossary

| Term | Meaning |
| --- | --- |
| Work finished | A sub-session's work item is merged, or the owner has said the work is abandoned, as the forge CLI or a recorded owner answer shows. |
| Taken over | Another session carries a sub-session's feature on: the replacement of a paused or stale session, or a resumed copy. The old session's work stays open until its work item is merged. |

The reference's `## Glossary` table gains both rows exactly as written here.

### Required sentences

These sentences amend the list in `docs/specs/workstream-orchestration.md` (its Required sentences).
A sentence here with an ID from that list replaces that sentence; a new ID adds one. Each is stated
exactly in the reference, under the section its heading names.

**Decision boundary** (`## Decision boundary`):

- S-02: The owner's request to orchestrate a workstream authorizes exactly these writes: editing its workstream ledger, dated owner-answer comments on work-item issues, its own harm statements and handoffs in the ledger, and archiving the workstream's sub-sessions, including those a previous orchestrator started, under the Close-out rules.
- S-54: The archive grant covers only the workstream's sub-sessions; any other session is archived only when the owner picks it.

**Close-out** (`## Close-out`):

- S-36: A sub-session ends in one of two ways, and each has its own archive rule: work finished, or taken over.
- S-55: Work finished: archive a sub-session only once the forge CLI shows its work item merged, or the owner has said the work is abandoned, never on the session's own report of done, and only after it has confirmed its cleanup finished; archive finished sub-sessions promptly.
- S-56: Taken over: when another session takes a sub-session's feature over, the old session may be archived before the merge, but only once its handoff, naming its worktree, is in the workstream ledger, and only in a way that keeps its worktree, branch and uncommitted changes for the session taking over.
- S-57: Where the host's archive action would remove a taken-over session's worktree, ask the owner before archiving it.
- S-58: A pending or failed session that the owner approves ending is archived under that approval.
- S-59: When the owner asks to clean up sessions in general, list every candidate with its work state (PR merged, PR open, waiting on the owner, or nothing to merge) and archive only the ones the owner picks.

S-45 under Plugin upgrades stays as it is: the batched owner approval still governs archiving paused
sessions and a replaced stale orchestrator, and S-56 and S-57 add the conditions every taken-over
session meets. The explanation at `orchestrate.md:170-172` becomes redundant with S-56 and S-57 and is
removed, leaving one statement of the rule.

### How the rules read together

- **Forge read.** For work finished, the orchestrator reads the state of the PR the ledger records for
  the work item with the forge CLI. The status pass rule already makes a failed read unknown, never
  merged or done, so a failed read leaves the session running and the read repeats on the next pass. No
  new sentence restates it.
- **Owner abandonment.** "The owner has said the work is abandoned" means a dated owner answer
  recorded as the Communication section requires (`orchestrate.md:142`), so the orchestrator can point
  to it.
- **Taken over is not finished.** The glossary row and S-56 keep the old session's work open. The
  ledger keeps the work item until it is merged, now carried by the session taking over.
- **Pending and failed sessions.** S-58 keeps the exception the old S-36 opened with, and S-46 already
  requires the owner's approval to recreate one.
- **Cleanup listing.** The work states are the four the issue names. Sessions outside the workstream
  appear in the list too, but S-54 means none is archived unless the owner picks it.

### Authority row

The orchestration row's first cell ends "and archiving the workstream's sub-sessions, including those
a previous orchestrator started, under the Close-out rules in `references/orchestrate.md`". Its second
cell adds archiving a session outside the workstream to what keeps the authority of its own row, which
is the owner's pick.

### Test changes

`requiredSentences()` reads both documents. It takes the earlier list, then for each sentence in this
document replaces the one with the same ID or appends it. The existing checks then run on the merged
list: every sentence under its section, unique IDs, at least 53 sentences, the rewording check, and
incident rows that name existing IDs. A new glossary check asserts that the reference carries this
document's two glossary rows verbatim. A new authority check asserts the row says "under the Close-out
rules" and no longer says "once each is done". The parser reads this document with the same functions,
so the sentence format above is the earlier one exactly.

### Upgrade, rollback and concurrency

The rules take effect with the plugin release that carries them. A session on the older plugin is stale
under `loop-settings.md` and writes nothing, so no orchestrator runs both rule sets at once. Rolling back
is reverting the commit; the old sentences and test return together. S-49 already keeps one
orchestrator per host, so two orchestrators never archive the same session. Archiving is the only
irreversible step, and every rule here only adds conditions before it.

## Acceptance Criteria

- [ ] AC-01: `plugins/vh-adlc/references/orchestrate.md` states every required sentence of
      `docs/specs/workstream-orchestration.md`, with S-02 and S-36 replaced by this document's text, and
      every sentence this document adds, each under the section its heading names.
- [ ] AC-02: The reference's glossary carries this document's two glossary rows verbatim, so work
      finished and taken over are defined side by side.
- [ ] AC-03: The orchestration row in `plugins/vh-adlc/references/authority.md` limits the archive
      write to the workstream's sub-sessions under the Close-out rules, and neither it nor the reference
      grants archiving a sub-session "once each is done".
- [ ] AC-04: Both plugin manifests carry the same version, one minor version above the version on the
      default branch when the feature branch is cut.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/check.test.ts`, "states every required sentence under the section its heading names", run on the merged sentence list. A new test proves the merge: removing S-56 from a copy of the reference reports `["S-56"]`, and restoring the old S-36 text in a copy reports `["S-36"]`. |
| AC-02 | `tests/vh-adlc/check.test.ts`, a new test that the reference contains each glossary row of this document; it fails when either row is deleted from a copy. |
| AC-03 | `tests/vh-adlc/check.test.ts`, the authority tests extended: the one orchestration row contains "under the Close-out rules" and "outside the workstream", and neither the row nor the reference contains "once each is done". The existing "the row check fails when any one write is removed" test stays. |
| AC-04 | `tests/vh-adlc/check.test.ts`, the existing "a package change comes with a version change" test and the manifest checks, run on the feature branch. |

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q1: When does work with nothing to merge count as finished?

Some sub-sessions end with no PR: an investigation, a triage, an issue closed by a decision. Under the
work-finished rule as written, such a session is archived only when the owner says the work is
abandoned, which is the wrong word for a completed investigation.

**Recommendation:** A. It keeps the rule forge-checked and needs no extra owner step for routine work.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Closed work-item issue counts** | Work with nothing to merge is finished once the forge CLI shows its work-item issue closed. S-55 and the glossary row say "merged, or for work with nothing to merge its issue closed". | A session whose issue someone closes by mistake can be archived; the closed state is still on the forge to check. |
| **B. Owner says it is finished** | Nothing is archived without a merge unless the owner says so. S-55 and the glossary row say "or the owner has said the work is finished or abandoned". | One more owner answer per session with nothing to merge, batched with the other questions. |

**Why this is yours:** both meet the goal; they differ in how much the orchestrator may decide alone,
which is the decision boundary you set.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [Feature documents, at e79eaa6a](https://github.com/vhco-pro/docs/blob/e79eaa6a0126f2e8ddca2cf14e3db3067b244cc7/conventions/feature-documents.md): `complete` is terminal, and new scope is a new feature.
- [Issue #180](https://github.com/michielvha/vh-adlc/issues/180): the incident on 2026-11-27, the two gaps and the harm statement.
- [Issue #166](https://github.com/michielvha/vh-adlc/issues/166): the paused-session worktree safeguard to make required.
- [Owner answers on #180](https://github.com/michielvha/vh-adlc/issues/180#issuecomment-7213799472): a new document, #166 included, and the two ways a session ends named side by side.
