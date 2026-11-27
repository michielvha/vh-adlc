---
status: draft
status_description: "Revised for spec review R-3; waiting for the next spec review."
issue: https://github.com/michielvha/vh-adlc/issues/180
goal: "An orchestrator archives a sub-session only when the forge shows its work finished, or when another session takes its feature over, or the owner has approved its replacement, and its worktree is kept, and archives nothing outside its workstream that the owner has not picked."
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
**Work finished** means the forge CLI shows the work item merged, or, for work with nothing to merge,
its issue closed, or the owner has said the work is abandoned. Only then is the session archived. The
owner accepted that a mistakenly closed issue lets the orchestrator archive such a session. **Taken over** means another session carries the
feature on, or the owner has approved one to: a paused or stale session's replacement, or a resumed
copy. A paused session archived before its replacement starts counts as taken over, and its archive needs
the owner's batched approval; the orchestrator's own plan to replace a session approves nothing. The old
session may be archived before the merge, but only once its handoff or state report, naming its
worktree, is in the workstream ledger, and only in a way that keeps its worktree, branch and uncommitted
changes. If the host would delete the worktree, the orchestrator asks the owner first. This brings in
#166. Pending or failed sessions the owner approves ending stay an exception, archived under that
approval, as before.

The grant covers only the workstream's sub-sessions. When the owner asks for a general cleanup, the
orchestrator lists every candidate with its work state and archives only the ones the owner picks. A
picked workstream sub-session still needs its work finished or taken over. A picked session that has been
taken over is archived under the taken-over rule. The pick doesn't say the work is abandoned: for an
open one that nobody has taken over, the orchestrator asks the owner, records the dated answer, and
archives it only if the answer is that the work is abandoned. The incident table's row
for archiving during cleanup points to the rule that now holds the cleanup condition.

The change is rule text in `references/orchestrate.md` and the orchestration row of
`references/authority.md`, plus tests that read the new sentences from this document. No new code or
tool runs; the forge check is the `gh` read the status pass already does. The plugin's minor version
goes up, as with every plugin feature.

No decisions are open. Spec review R-1 found that paused sessions archived before their replacement
starts fell outside both rules and lost the worktree safeguard; the revision after it closed that gap.
Spec reviews R-2 and R-3 found no blocking issue; the revisions after them name the owner as the
approver of a replacement, put the cleanup question into a required sentence, and keep that question
away from sessions that have been taken over. A new review has not run yet, and
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
- Incident 13's Rules cell in the reference's incident table, from `S-36, S-37` to `S-36, S-55, S-37`,
  because S-55 now holds the cleanup condition that stops it.
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
  earlier feature's AC-15, and the incident is recorded in this document's Background and in #180. Only
  row 13's Rules cell changes, as listed above.
- Unarchiving. The Remote Control app has no way back.

## Design

### Glossary

| Term | Meaning |
| --- | --- |
| Work finished | A sub-session's work item is merged, or for work with nothing to merge its issue is closed, or the owner has said the work is abandoned, as the forge CLI or a recorded owner answer shows. |
| Taken over | Another session carries a sub-session's feature on, or the owner has approved one to: the replacement of a paused or stale session, including one archived before its replacement starts, or a resumed copy. The old session's work stays open until its work item is merged. |

The reference's `## Glossary` table gains both rows exactly as written here.

### Required sentences

These sentences amend the list in `docs/specs/workstream-orchestration.md` (its Required sentences).
A sentence here with an ID from that list replaces that sentence; a new ID adds one. Each is stated
exactly in the reference, under the section its heading names.

**Decision boundary** (`## Decision boundary`):

- S-02: The owner's request to orchestrate a workstream authorizes exactly these writes: editing its workstream ledger, dated owner-answer comments on work-item issues, its own harm statements and handoffs in the ledger, and archiving the workstream's sub-sessions, including those a previous orchestrator started, under the Close-out rules.
- S-54: The archive grant covers only the workstream's sub-sessions; any other session is archived only when the owner picks it.

**Close-out** (`## Close-out`):

- S-36: Apart from pending or failed sessions the owner approves ending, a sub-session ends in one of two ways, and each has its own archive rule: work finished, or taken over; a paused session archived before its replacement starts is taken over, and a pending or failed session the owner approves ending is archived under that approval.
- S-55: Work finished: archive a sub-session only once the forge CLI shows its work item merged, or for work with nothing to merge its issue closed, or the owner has said the work is abandoned, never on the session's own report of done, and only after it has confirmed its cleanup finished; archive finished sub-sessions promptly.
- S-56: Taken over: when another session takes a sub-session's feature over, or the owner has approved its replacement, the old session may be archived before the merge, but only once its handoff or state report, naming its worktree, is in the workstream ledger, and only in a way that keeps its worktree, branch and uncommitted changes for the session taking over.
- S-57: Where the host's archive action would remove a taken-over session's worktree, ask the owner before archiving it.
- S-59: When the owner asks to clean up sessions in general, list every candidate with its work state (PR merged, PR open, waiting on the owner, or nothing to merge) and archive only the ones the owner picks; a picked workstream sub-session is still archived only when its work is finished or it is taken over, and the pick is not a statement that its work is abandoned: for a picked sub-session whose work is open and that no other session has taken over, ask the owner whether it is abandoned, record the dated answer, and archive it only on that answer.

S-45 under Plugin upgrades stays as it is: the batched owner approval still governs archiving paused
sessions and a replaced stale orchestrator. A paused session S-45 archives is taken over because S-36 says so,
and its archive has the owner's batched approval under S-45. Its ledger state report is the report S-56
accepts, and S-56 and S-57 apply to it before its replacement starts. The explanation at `orchestrate.md:170-172` becomes redundant with S-56 and S-57 and is
removed, leaving one statement of the rule.

### How the rules read together

- **Forge read.** For work finished, the orchestrator reads the state of the PR the ledger records for
  the work item with the forge CLI. Work with nothing to merge, such as an investigation, a triage or an
  issue closed by a decision, is finished once the forge CLI shows the work item's issue closed; the
  owner chose this and accepted that a mistakenly closed issue lets such a session be archived. The status pass rule already makes a failed read unknown, never
  merged or done, so a failed read leaves the session running and the read repeats on the next pass. No
  new sentence restates it.
- **Owner abandonment.** "The owner has said the work is abandoned" means a dated owner answer
  recorded as the Communication section requires (`orchestrate.md:142`), so the orchestrator can point
  to it.
- **Taken over is not finished.** The glossary row and S-56 keep the old session's work open. The
  ledger keeps the work item until it is merged, now carried by the session taking over.
- **Pending and failed sessions.** S-36 keeps the exception the old S-36 opened with and states
  that such a session is archived under the owner's approval to end it; S-46 already requires the
  owner's approval to recreate one. The ID S-58 stays unused.
- **Cleanup listing.** The work states are the four the issue names. Sessions outside the workstream
  appear in the list too, but S-54 means none is archived unless the owner picks it. For the
  workstream's own sub-sessions, S-59 keeps S-55 and S-56 in force: a picked one that has been taken over is archived
  under S-56, and a pick of an open one that nobody has taken over is not an archive approval, so the
  orchestrator asks the owner whether its work is abandoned, records the dated
  answer as the Communication section requires, and archives it only on that answer. The goal settles this: the incident began with a general cleanup request.

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
rules" and no longer says "once each is done". A new incident check asserts row 13 names S-55. The
version stays the existing check that the package version differs from `origin/main`'s; a feature
takes the next minor version by the delivery convention's commit types, which no test checks. The parser reads this document with the same functions,
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
      every sentence this document adds, each under the section its heading names, and the incident
      table's row 13 names S-55.
- [ ] AC-02: The reference's glossary carries this document's two glossary rows verbatim, so work
      finished and taken over are defined side by side.
- [ ] AC-03: The orchestration row in `plugins/vh-adlc/references/authority.md` limits the archive
      write to the workstream's sub-sessions under the Close-out rules, and neither it nor the reference
      grants archiving a sub-session "once each is done".
- [ ] AC-04: Both plugin manifests carry the same version, and it differs from the version on the
      default branch.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/check.test.ts`, "states every required sentence under the section its heading names", run on the merged sentence list. A new test proves the merge: removing S-56 from a copy of the reference reports `["S-56"]`, and restoring the old S-36 text in a copy reports `["S-36"]`. A new test asserts incident row 13 lists S-55, and fails on a copy where row 13 reads `S-36, S-37`. |
| AC-02 | `tests/vh-adlc/check.test.ts`, a new test that the reference contains each glossary row of this document; it fails when either row is deleted from a copy. |
| AC-03 | `tests/vh-adlc/check.test.ts`, the authority tests extended: the one orchestration row contains "under the Close-out rules" and "outside the workstream", and neither the row nor the reference contains "once each is done". The existing "the row check fails when any one write is removed" test stays. |
| AC-04 | `tests/vh-adlc/check.test.ts`, the existing "a package change comes with a version change" test and the manifest checks, run on the feature branch. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-27 | R-1 | spec | `41080f61` | claude-opus-5-5 | procedural | 1 blocking, 3 should-fix, 1 nit |
| 2026-11-27 | R-2 | spec | `b3f58301` | claude-opus-5-5 | procedural | 0 blocking, 2 should-fix, 1 nit |
| 2026-11-27 | R-3 | spec | `53c00e17` | claude-opus-5-5 | procedural | 0 blocking, 1 should-fix, 1 nit |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Required sentences (S-36, S-56, S-57 and the paragraph on S-45 and `orchestrate.md:170-172`); Design, Glossary ("Taken over"); Context, Owner summary ("Taken over means another session carries the feature on"); frontmatter goal
EVIDENCE: S-45 stays unchanged and says "archive each paused session as soon as its report is in the workstream ledger, before its replacement starts" (`docs/specs/workstream-orchestration.md:429`). The glossary defines Taken over as "Another session carries a sub-session's feature on", and S-56 only applies "when another session takes a sub-session's feature over". Before its replacement starts, no other session carries the feature, so a paused session archived under S-45 is not taken over by this document's own definition. New S-36 also drops the old "Apart from paused sessions" exception (`orchestrate.md:200`). The design then deletes the only text that protects paused sessions without that condition, `orchestrate.md:170-172` ("Archive a paused session only in a way that keeps its worktree, branch and uncommitted changes for its replacement ... Where the host's archive action would remove the worktree, ask the owner before archiving it"). That is the case issue #166 exists for: "Under Q28 a paused session may be archived before its replacement starts. If the host's archive action removes the session's worktree, the replacement loses the claimed feature's uncommitted changes." S-56 also asks for a "handoff, naming its worktree", while paused sessions only send a state "report" (S-30, S-44, S-45). Read literally, S-56 and S-57 do not cover the S-45 archive, so the worktree safeguard no longer applies to the case where uncommitted changes can be lost. The Design sentence "S-56 and S-57 add the conditions every taken-over session meets" does not close this gap, because the paused session is not yet taken over.
PROPOSAL: Make the Taken over term and S-56/S-57 cover a session whose replacement is approved or recorded in the ledger but not yet started (for example "is being or has been replaced"), and accept the paused session's ledger report as its handoff. Or keep a required sentence under Plugin upgrades that applies the worktree, branch and uncommitted-changes safeguard and the ask-first rule to every paused session S-45 archives. Then say in S-36 how the S-45 archive fits the two ways a session ends.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Required sentences (S-55, S-59); Design, How the rules read together ("Cleanup listing"); Context, Owner summary (cleanup paragraph); frontmatter goal
EVIDENCE: S-59: "When the owner asks to clean up sessions in general, list every candidate with its work state (PR merged, PR open, waiting on the owner, or nothing to merge) and archive only the ones the owner picks." S-55 allows archiving a finished sub-session "only once the forge CLI shows its work item merged, or ... its issue closed, or the owner has said the work is abandoned". The design does not say which rule wins when the owner picks a workstream sub-session listed as "PR open" in a general cleanup. One implementer will archive it on the pick. Another will treat the pick as not enough under S-55 and refuse, or treat the pick as abandonment. The 2026-11-27 incident in #180 started with exactly this kind of request ("the owner said to archive sessions that were no longer used"). The goal decides the answer: a sub-session is archived only when its work is finished or it has been taken over.
PROPOSAL: Add to S-59, or to a new sentence, that S-55 and S-56 still govern the workstream's own sub-sessions in a cleanup listing, so an owner pick of an open one is not an archive approval unless the owner says the work is abandoned. Change the Cleanup listing bullet and the Owner summary to match.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Required sentences (S-36, S-55); Scope, Out of scope (the incident table bullet)
EVIDENCE: Incident 13 in the reference reads "A session was archived while still cleaning up, and handoff files in `/tmp` were swept away. | S-36, S-37" (`plugins/vh-adlc/references/orchestrate.md:242`). The earlier feature built that table so that "a later change that drops a rule shows which incident returns" (`docs/specs/workstream-orchestration.md:485-487`). This document replaces S-36 with "A sub-session ends in one of two ways, and each has its own archive rule: work finished, or taken over." and moves "only after it has confirmed its cleanup finished" into S-55. Incident 13 would then cite a sentence that no longer holds the rule that stops it. The test only checks that the cited IDs exist (`tests/vh-adlc/check.test.ts:615-623`), so it stays green. Scope rules out a new incident row but says nothing about rewriting row 13's rule IDs.
PROPOSAL: Add to Scope and Design that incident 13's Rules cell changes to name S-55 (with S-36 if wanted) and S-37, and add that to AC-01 or its Test Plan row, for example by asserting row 13 names S-55.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-04); Test Plan (AC-04 row)
EVIDENCE: AC-04 requires "one minor version above the version on the default branch when the feature branch is cut". The named proof, "a package change comes with a version change", only asserts `expect(now.version).not.toBe(JSON.parse(base.out).version)` (`tests/vh-adlc/check.test.ts:226-233`). The manifest test asserts the two manifests are equal (`tests/vh-adlc/check.test.ts:169-180`). A patch bump to 0.33.1 or a jump to 1.0.0 passes both, so the proof can pass on a wrong implementation.
PROPOSAL: Add a check, a test or a written procedure, that compares the version with the one on `origin/main` and asserts the minor is one higher and the patch is 0. Or loosen AC-04 to what the existing test proves.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Design, Required sentences (S-36, S-58); Design, How the rules read together ("Pending and failed sessions")
EVIDENCE: S-36 says "A sub-session ends in one of two ways", but S-58 adds a third: "A pending or failed session that the owner approves ending is archived under that approval." The old S-36 stated that exception inside the same sentence ("Apart from ... pending or failed sessions the owner approves ending"). The new S-36 leaves it out, so a reader of S-36 alone sees exactly two cases.
PROPOSAL: Word S-36 so that it names the owner-approved ending of a pending or failed session as an exception, for example "Apart from pending or failed sessions the owner approves ending, a sub-session ends in one of two ways ...".

### R-2

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Required sentences (S-56, S-36, and the paragraph on S-45 "has an approved replacement"); Design, Glossary ("Taken over"); Context, Owner summary ("or is approved to"); frontmatter goal ("takes or is approved to take")
EVIDENCE: This revision widened Taken over in response to R-1 F-01. S-56 now reads "when another session takes, or is approved to take, a sub-session's feature over, the old session may be archived before the merge", and the glossary row reads "Another session carries a sub-session's feature on, or is approved to". Neither says who approves. The owner's answer on #180 limited the case to "when another session takes over the feature ... allowed only after the handoff is recorded". The reference lets the orchestrator decide alone on "sequencing, batch membership" (`plugins/vh-adlc/references/orchestrate.md:27`), and replacements go through the orchestrator's own admission (S-53, `orchestrate.md:174`). So an orchestrator can read its own plan to start or resume a replacement as the approval, and archive a stale or resumed session with open work before any replacement exists. That is the harm in the 2026-11-27 incident: the owner loses the sidebar entry for open work, and archiving cannot be undone. Only the Owner summary ties the approval to "the batched approval" (S-45). S-56 and the glossary row, which are what the reference carries, do not.
PROPOSAL: Name the approver in S-56 and the glossary row, for example "or the owner has approved it to take", or limit the "approved" case to a paused session archived under S-45's batched owner approval. Change the goal and the Owner summary to the same wording.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Required sentences (S-59, S-55); Design, How the rules read together ("Cleanup listing" and "Owner abandonment"); Context, Owner summary (cleanup paragraph: "for an open one, the orchestrator asks the owner whether the work is abandoned before archiving it")
EVIDENCE: The fix for R-1 F-02 put the decisive behavior only in Design prose and the Owner summary: "a pick of an open one is not an archive approval, so the orchestrator asks the owner whether its work is abandoned, and archives it only on that answer." The reference carries only S-59: "a picked workstream sub-session is still archived only when its work is finished or it is taken over". Work finished includes "the owner has said the work is abandoned" (S-55). No required sentence says that a pick is not such a statement, or that the orchestrator asks. The Owner abandonment bullet, which requires a dated recorded answer (`orchestrate.md:142`), is not a required sentence either. Suppose an owner in a general cleanup picks a sub-session listed as "PR open". One orchestrator reads the pick as "the owner has said the work is abandoned" and archives it. Another refuses silently. Neither asks, which is what the Owner summary promises. The incident began with this kind of request.
PROPOSAL: Extend S-59, or add a sentence, so that the owner's pick is not a statement that the work is abandoned. For a picked open sub-session, the orchestrator asks the owner whether its work is abandoned, records the dated answer, and archives it only on that answer.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, Required sentences (S-36, S-02); Design, How the rules read together ("Pending and failed sessions"); Context, Owner summary ("Pending or failed sessions the owner approves ending stay an exception, as before")
EVIDENCE: This revision dropped S-58 ("A pending or failed session that the owner approves ending is archived under that approval"). New S-36 now only exempts these sessions: "Apart from pending or failed sessions the owner approves ending, a sub-session ends in one of two ways, and each has its own archive rule". New S-02 grants archiving "under the Close-out rules", and no Close-out rule now states how such a session is archived. Design says "S-36 keeps the exception the old S-36 opened with". That is true of the wording, but the exception now sits next to a grant that points to rules that are silent on it.
PROPOSAL: Close S-36 with the archive rule for the exception, for example "; a pending or failed session the owner approves ending is archived under that approval".

### R-3

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Required sentences (S-59, with S-56 and S-36); Design, Glossary ("Taken over": "The old session's work stays open until its work item is merged"); Design, How the rules read together ("Cleanup listing": "a pick of an open one is not an archive approval, so the orchestrator asks the owner whether its work is abandoned"); Context, Owner summary (cleanup paragraph: "for an open one, the orchestrator asks the owner, records the dated answer, and archives it only if the answer is that the work is abandoned")
EVIDENCE: This revision extended S-59 in response to R-2 F-02. S-59 now reads "a picked workstream sub-session is still archived only when its work is finished or it is taken over, and the pick is not a statement that its work is abandoned: for a picked sub-session whose work is open, ask the owner whether it is abandoned, record the dated answer, and archive it only on that answer." The glossary row for Taken over says the old session's work "stays open until its work item is merged", and S-56 lets a taken-over session be archived "before the merge". So a taken-over sub-session that the owner picks in a general cleanup is both archivable under the first clause of S-59 and S-56, and an open-work sub-session that the second clause of S-59 lets the orchestrator archive "only on that answer". The honest answer for a session whose feature a replacement carries on is "not abandoned", so a literal reader can never archive it from the cleanup list, though S-56 allows it without any pick. Another reader applies S-56 and archives it. The harm statement names this exact situation ("whenever an orchestrator cleans up after an environment loss or a replacement"), so two careful implementers would behave in ways the owner notices: one asks a misleading abandonment question and keeps the session, the other archives it.
PROPOSAL: Limit the abandonment question in S-59 to a picked sub-session whose work is open and that is not taken over (for example "for a picked sub-session whose work is open and that no other session has taken over"), and word the Cleanup listing bullet and the Owner summary to match.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design, Required sentences (paragraph after the list: "A paused session S-45 archives has the owner's batched approval of its replacement"); Context, Owner summary ("A paused session archived under the owner's batched approval before its replacement starts counts as taken over"); frontmatter goal ("or the owner has approved its replacement")
EVIDENCE: This revision changed the paragraph from "has an approved replacement" to "has the owner's batched approval of its replacement". S-45 is an approval of archiving, not of replacement: "Archiving paused sessions, and a replaced stale orchestrator, needs the owner's approval, asked for in one batch" (`plugins/vh-adlc/references/orchestrate.md:168`). Replacing paused sessions is the orchestrator's step under S-30 ("replace the paused sessions once, when the release they wait for has landed", `orchestrate.md:160`), and the owner's part is the handoff "in its own session" after the replacement starts (`orchestrate.md:164`). The Owner summary itself says "the orchestrator's own plan to replace a session is not that approval". S-36 already states outright that "a paused session archived before its replacement starts is taken over", so the S-45 case does not depend on this claim and nothing built changes, but the paragraph misstates what S-45 approves.
PROPOSAL: Say the paused session S-45 archives is taken over because S-36 says so and its archive has the owner's batched approval, rather than calling that approval an approval of its replacement.

## Sources

- [Feature documents, at e79eaa6a](https://github.com/vhco-pro/docs/blob/e79eaa6a0126f2e8ddca2cf14e3db3067b244cc7/conventions/feature-documents.md): `complete` is terminal, and new scope is a new feature.
- [Issue #180](https://github.com/michielvha/vh-adlc/issues/180): the incident on 2026-11-27, the two gaps and the harm statement.
- [Issue #166](https://github.com/michielvha/vh-adlc/issues/166): the paused-session worktree safeguard to make required.
- [Owner answers on #180](https://github.com/michielvha/vh-adlc/issues/180#issuecomment-7213799472): a new document, #166 included, and the two ways a session ends named side by side.
- [Owner answer to Q1 on #180](https://github.com/michielvha/vh-adlc/issues/180#issuecomment-7213902293): work with nothing to merge is finished once its issue is closed.
