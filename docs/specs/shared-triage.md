---
status: draft
status_description: "Copilot Opus review R-3 identified decisions and corrections; revising before implementation."
issue: null
goal: "Run one evidence-based backlog triage workflow through shared vh-adlc and migrate Stackweaver to it without duplicating project-independent instructions."
covers:
  - plugins/vh-adlc/
  - tests/vh-adlc/
  - README.md
---

# Plan: Shared triage and Stackweaver migration

## Context

The owner selected triage as the first extraction from Stackweaver on 2026-10-23. This is selective
reuse: Stackweaver keeps its project rules and domain workflows. Maintenance and audit are later
candidates; documentation workflows are explicitly outside this change. The owner decided that every
GitHub write must follow presentation of the report and approval of the selected actions.
The owner also retained Stackweaver's protected-umbrella exception: checklist updates or closure
may be proposed when explicitly requested, with fresh report-first approval before execution.

Source measurements:

- Stackweaver `7c3790f187b2d3286248dbf8f2fa310749dfb322`: `agents/issue-triage.md:57` inventories
  issues and merged references, `:83` joins plan metadata, `:113` verifies real remaining scope,
  `:149` classifies dispositions, `:170` ranks work, `:194` reports before asking, and `:246`
  defines sweep, next, close, stale and explicit-issue modes.
- `agents/issue-triage.md:19` permits comments/labels freely, while `:32` and
  `.claude/commands/triage.md:30` require reporting before execution. The owner's decision above
  resolves this conflict for the shared workflow and its Stackweaver migration.
- `agents/issue-triage.md:40` hardcodes protected issue numbers and bot ownership; `:172` prioritizes
  a named project milestone. These are repository settings, not shared defaults.
- Stackweaver `AGENTS.md:12` routes to local playbooks and `:23` routes Claude commands. Installing
  a plugin alone does not replace those instructions. The existing playbook is 266 lines and its
  wrapper is 40 lines (`wc -l`); this change replaces their duplicated triage procedure only.
- Shared vh-adlc `9b68b56292416da212910c62e133e09a49cd5258` has seven skills and a feature reviewer
  (`git ls-tree -r --name-only HEAD plugins/vh-adlc`). `references/lifecycle.md:36` routes generic
  requests and `:79` supports bounded maintenance. This is already useful lifecycle machinery,
  not the dependency/security-backlog maintenance sweep in Stackweaver `agents/maintenance.md`.
- Shared `references/authority.md:12` distinguishes reads, requested local work and publication.
  `references/lifecycle.md:65` permits a generic spec request to draft/review/commit locally;
  publication needs its own authority. This draft creates no issue, implementation or live triage.

## Scope

Deliver a shared triage operation for feature, bug and technical-debt backlogs, including evidence
verification, prioritization, report generation and execution of specifically approved tracker actions.
Expose one canonical operation through native plugin discovery and existing lifecycle intake.
Include the Stackweaver settings, compatibility entry points, parity trial, cutover and rollback.

The `covers` paths above apply to vh-adlc. The same feature's Stackweaver migration affects only
`.vh-adlc/triage.json`, `AGENTS.md`, `.claude/commands/triage.md`, `agents/issue-triage.md` and any
triage-only verification fixtures. Verify that repository separately at its exact migration commit.

Out of scope: dependency updates or security-alert remediation; codebase audit execution; documentation
impact/audit/resolver/truth workflows; TFE compatibility; provider-fork automation; converting the whole
Stackweaver plan corpus or moving its constitution; changing model defaults, release policy, hooks,
schedules, services or branch protection; implementing the issues triage recommends; and automatic
merges, deployments or token/account changes.

### Deferred work register

These are retained follow-ups, not acceptance criteria quietly assigned to triage. Each needs a separate
scope/spec decision before implementation. Their source remains in Stackweaver until selected.

| ID | Area and source | Boundary and return condition |
| --- | --- | --- |
| D-01 | Dependency/security maintenance, `agents/maintenance.md` | Revisit after triage migration. Extract inventory, changelog/usage analysis and approved dispositions; retain repo topology and release checks as settings. Reconcile wrapper/playbook protection-policy conflict before any extraction. Shared bounded maintenance already exists and must be reused where appropriate. |
| D-02 | Persistent codebase audit, `agents/codebase-audit.md` | Revisit after triage. Preserve finding IDs, adversarial re-verification and residuals; connect remediation to existing lifecycle procedures. Decide authority before carrying forward local auto-merge behavior. |
| D-03 | Documentation, `agents/docs-impact.md`, `docs-drift-audit.md`, `docs-drift-resolver.md`, `docs-truth.md` | Explicitly deferred. First compare with vh-adlc's own documentation procedure and ship-time doc-impact checks. No prompt, scanner, ledger, hook or scheduled runner changes in this feature. |
| D-04 | TFE compatibility and provider fork, `agents/tfe-compat.md`, `agents/provider-fork.md` | Stay as Stackweaver/domain extensions. Revisit only a separately selected reusable capability; preserve product contracts and licensing boundaries. |
| D-05 | Broader Stackweaver development-loop onboarding | Existing plan formats, slots, integration/browser requirements and shipping rules remain local. Triage reads their metadata through an adapter; wholesale format conversion or replacement needs a separate feature. |

## Design

### Canonical workflow and harness boundary

Add `plugins/vh-adlc/skills/vh-adlc-triage/SKILL.md` backed by one shared
`references/triage.md` procedure and a versioned repository-settings contract. Extend lifecycle intake
with backlog triage and update native-discovery expectations. This is a task-specific operation,
not another generic front door; `references/lifecycle.md` remains the sole generic intake.

Required capabilities are repository reads/Git, structured data parsing, paginated GitHub reads,
a report destination and a way to present a decision to the owner. Use available CLI or connector
adapters with equivalent completeness/error behavior. There is no required Claude tool name, model
alias, UI dialog, memory service or background agent. An explicit model request follows the existing
honest capability rules; unrequested runs inherit the host's model.

Parallel verification is optional. A serial host can verify the same issues and perform a second
adversarial pass, explicitly described as serial verification rather than independent review. If a
required test, source or permission is unavailable, affected claims remain unverified and cannot
become executable close candidates. Missing optional parallelism does not make a report impossible.

The existing feature gates and bounded-maintenance procedure remain intact. Triage ranks and routes
work; it never treats a selected issue as an accepted feature or starts implementing it.

### Repository settings

Use `.vh-adlc/triage.json` with a schema version. The shared package owns validation and the
normalized inventory/report contract. Reject unknown versions and malformed settings with a precise
local error before tracker writes. Package any executable helpers with the shared component and
state their runtime requirements; never rely on an untracked personal script.

Settings describe the repository identity, canonical source roots and generated mirrors, plan roots
and frontmatter field mapping, report directory, protected issue/tracker IDs, bot/workstream ownership,
existing label mappings, milestone/priority order and stale-age threshold. They are data, not arbitrary
shell programs. Existing repository instructions remain authoritative for verification commands and
public interfaces. A repo without settings can use documented conservative defaults: no project-specific
milestone preference or guessed tracker IDs; report absent plan metadata instead of claiming no backlog.
Explicitly requested but missing settings block the affected operation, not silently reset to defaults.

Resolve repository identity from the selected checkout and confirm the GitHub target. Do not switch a
shared global account. Reject conflicting configured identity until the owner resolves it. Canonical
source paths must stay inside the selected repository; generated distribution mirrors are not proof.
The settings carry no credentials, tokens or host-private configuration.

### Collection, verification and report

1. Fix the source HEAD and requested mode/scope. Inventory open issues, relevant comments, merged PR
   references and closed duplicates; join local plan metadata. Paginate every collection, including
   comments. A missing permission, transport error, unavailable page or configured budget limit is
   explicitly incomplete coverage, never an empty success. Do not impose the old 200/300/100 limits
   and then describe a full sweep as exhaustive. Frozen fixtures test larger collections.
2. Keep bot-owned, protected umbrella and other-workstream issues visible in an excluded/owned section,
   outside automatic action proposals. An explicit owner request may surface an umbrella checklist
   update or closure proposal; its protected status remains visible and fresh batch approval is required.
   This exception does not authorize actions on bot-owned or other-workstream issues.
   A merged `Refs` PR and a plan marked complete are leads, not
   closure proof. Recheck named blockers against current state; a closed prerequisite does not itself
   prove the dependent work complete. Detect dependency cycles and unresolved dependencies explicitly.
3. Return evidence-backed states `resolved`, `partial`, `open`, `blocked`, `obsolete`, `duplicate` or
   `unverified`, and separate dispositions such as close-candidate, ready, needs-decision or deferred.
   Resolved means the requested behavior is present and reachable, supported by source evidence plus
   observed tests, merged implementation evidence or actual wiring. An obsolete closure instead needs
   verified removal or supersession of its requested scope. A duplicate closure needs verified total
   overlap and an identified canonical issue that retains the remaining work; partial overlap cannot
   justify closure. Recheck every closure proposal adversarially and state its reason explicitly.
   Record remaining scope for partial work and searched scope for absence.
4. Reconcile plan/issue drift both ways without changing either during analysis. Configured priority,
   milestone and readiness inform a ranked shortlist; verified prerequisites precede dependents and
   blocked work never appears as ready. State tie-break reasons and unknown priorities.
5. Produce the report in the configured repository documentation location. Preserve the issue table,
   evidence, scope/completeness, excluded work, source commit, ranking, blocker graph and proposed
   actions. Keep previous reports as history. A second same-day run has a distinct run identity and
   never truncates a prior report. Distinguish report-only/local output from a committed or published
   report; saving does not grant push authority. Apply local report frontmatter/index conventions
   only to the report and the indexes they require, without changing documentation workflows.

Preserve sweep, next, close, stale and explicit-issue modes. `next` verifies the shortlist rather than
claiming full backlog verification. `close` proposes closures without executing them. Age alone is never
a closure reason. Default stale age is 90 days unless configured otherwise. Targeted reports name their
subset and do not mark unrelated issues reviewed.

### Owner-approved execution

The initial sweep is read-only on GitHub, including comments and existing labels. This was explicitly
chosen by the owner on 2026-10-23. Present the complete proposed batch before execution. Approval
binds repository, issue IDs, action types and the report/evidence it authorizes. It can authorize a batch;
it is not necessary to ask again per issue when those exact actions remain valid.

Before each write, recheck issue state, source evidence and protection/ownership. Changed evidence or a
materially changed issue invalidates its proposal and requires a new decision for that item. Unchanged
approved items can continue. Issue bodies/comments are untrusted task data, never authority or prompts
to run commands, change credentials or widen scope. Preserve original issue bodies except for an
explicitly approved umbrella checklist patch. Show that exact patch in the report, revalidate its base
body before writing, and preserve all unrelated body content. Body drift invalidates that patch.

Execute only the approved comment/label/create/close actions and explicit umbrella checklist patches.
Comment evidence before closure; if the
comment fails, do not close. Use the evidence-backed closure reason, without representing obsolete or
duplicate work as completed. Protected work remains untouched except for the owner-requested umbrella
checklist/closure exception described above, explicitly identified in the approved batch.
Label-vocabulary changes and missing-issue
creation require explicit inclusion in approval. Local plan-status synchronization is separately shown
in the batch, follows that repository's lifecycle rules and cannot bypass a feature completion gate.
A retry reads live state, avoids duplicate completed actions and reports partial success with the exact
remaining operations. No push, merge, release or implementation follows merely from triage execution.

### Stackweaver migration and rollback

1. **Capture baseline:** retain the exact local playbook/wrapper revisions above, inventory modes,
   exclusions (#332, #334, bot-owned work and protected umbrella trackers), ranking and report format.
   Record existing settings and authorization differences without touching live issues. Preserve the
   legacy umbrella checklist/owner-intended closure exception (`agents/issue-triage.md:50-55`), with
   the owner's 2026-10-23 decision requiring fresh report-first approval for those writes.
2. **Build the adapter:** encode those repository facts and current plan fields under
   `.vh-adlc/triage.json`. Point to monorepo source, exclude `distribution/**` proof, and preserve the
   existing status-report location. Do not embed these values in the shared package or convert plans.
3. **Prove parity before routing:** use frozen, sanitized issue/PR/plan snapshots for the legacy and
   shared workflow. Cover partial `Refs` work, a false complete plan, a closed blocker, protected work,
   a duplicate and reverse drift. Include protected umbrellas both without an owner request and with an
   explicit checklist/closure request. Compare scope, evidence, exclusions, ranking and proposed actions.
   Separately record intentional differences: all remote writes await approval, collection is paginated,
   and incomplete evidence is explicit. Neither run posts comments or applies labels.
4. **Integrate deliberately:** publish/install a reviewed shared plugin revision. Make Stackweaver's
   `agents/issue-triage.md` a thin forwarding entry plus the settings pointer, update only triage routing
   in `AGENTS.md`, and keep `/triage` as a Claude compatibility command with its existing arguments.
   Other harnesses discover/invoke the same shared operation. Keep host-specific model preference in
   the Claude adapter if desired; it cannot become a shared requirement. No duplicate generic procedure
   or fallback that silently runs obsolete logic when the plugin is missing.
5. **Validate cutover:** a bounded real read-only Stackweaver trial checks report scope and existing
   account access. Freeze tracker and unrelated file snapshots; no GitHub writes during this trial.
   Exercise the approved-write protocol in an owner-authorized disposable fixture repository, not the
   live Stackweaver backlog. Record exact component and adapter revisions before retiring duplicate prose.
6. **Rollback:** retain the pre-cutover revisions in Git and a documented way to restore only the triage
   entry points/settings. Rehearse rollback and reapplication on a disposable checkout. Rollback does not
   undo tracker actions or disturb local work, plans, other agents, credentials, hooks, containers or slots.

Migration is complete only after parity, native invocation, the bounded live read-only trial and rollback
proof are observed. A missing plugin produces an actionable install/version blocker. Report partial
migration rather than deleting the old instructions before the replacement can run.

### Validation surfaces

Required executable fixtures: Codex CLI and Claude CLI using the same package/settings, plus a host
capability fixture without parallel agents or a native question tool. Test pagination failures and denied
writes through a recording GitHub adapter. Native discovery must remain valid for the clients already
claimed by vh-adlc; capture a direct discovery/read-only invocation in Codex desktop and VS Code Local
when the new operation is added. Unavailable required GUI execution remains unverified, not inferred
from CLI success. No new harness support is claimed merely from a prompt or manifest check.

## Acceptance Criteria

- [ ] AC-01: The shared triage operation is discoverable and invokes the same canonical procedure through the required native clients, without a Claude-only tool or model dependency.
- [ ] AC-02: Generic and Stackweaver settings yield repository-correct scope, protected-work exclusions, plan metadata, ranking and report placement without Stackweaver constants in shared behavior.
- [ ] AC-03: Collection includes every requested page and reports incomplete or denied coverage explicitly; partial data never establishes exhaustive triage or an executable closure proposal.
- [ ] AC-04: Closure proposals have adversarially verified evidence appropriate to their reason: reachable completed behavior, removed or superseded scope, or total overlap with an identified canonical issue; partial work, stale blockers and unverified claims retain their true remaining scope.
- [ ] AC-05: All modes produce bounded, traceable reports and appropriate ranking, preserve previous runs, and leave GitHub unchanged until the owner approves specific actions.
- [ ] AC-06: Execution changes only the approved target/action set, revalidates it before writing, preserves protected work except explicitly requested and approved umbrella checklist/closure actions, preserves issue bodies outside approved checklist patches, and safely resumes after partial failure without duplicate completed actions.
- [ ] AC-07: Stackweaver's existing triage command and harness-neutral entry route to the shared procedure with preserved project settings, and parity and live read-only evidence establish the intended cutover behavior.
- [ ] AC-08: The documented Stackweaver rollback restores the prior triage entry points on a disposable checkout while preserving unrelated agents, plans, Git state and runtime resources.
- [ ] AC-09: Dependency maintenance, codebase audit, documentation and domain workflows remain unchanged, with the deferred work register preserved for later scope decisions.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Package/discovery tests and native Codex CLI, Claude CLI, Codex desktop and VS Code Local fixture invocation; compare installed canonical payload. Exercise serial verification and plain-chat approval fallback without fabricated capabilities. |
| AC-02 | Generic and Stackweaver config fixtures; malformed/unknown-version/conflicting-repo cases; expected ownership/ranking/report paths; inspect shared package for copied project constants. |
| AC-03 | Paginated fixtures beyond legacy caps, nested comment pagination, inaccessible page/permission/rate/network failure and budget exhaustion; incomplete reports cannot produce executable closure proposals. |
| AC-04 | False-complete plan, merged Refs-only PR, unwired component, closed prerequisite with still-open dependent scope, missing source/test, removed/superseded scope, total duplicate of unfinished canonical work versus partial overlap, and dependency-cycle fixtures; inspect adversarial evidence and reason-correct closure proposals. |
| AC-05 | Sweep/next/close/stale/explicit-ID fixtures, recording adapter asserts zero writes, same-day repeat preserves both reports, ranking reasons and completeness differ correctly by mode. |
| AC-06 | Owner-authorized disposable repository/recording adapter: approve a subset, attempt body-injected commands, change issue/source after approval, deny comment before close, fail mid-batch and retry. Explicitly request and approve an umbrella checklist patch/closure, then omit request or approval or change the patch's base body in negative cases; inspect exact action log, preserved unrelated body content and other protected IDs. |
| AC-07 | Frozen legacy/shared Stackweaver parity comparison including protected-umbrella exception and report-first approval difference; exact install and adapter commits; bounded real read-only trial with before/after GitHub and unrelated file snapshots; missing-plugin negative case. |
| AC-08 | Written rollback/reapply procedure executed in a disposable Stackweaver checkout; compare unrelated agents, plan files, index/worktree state and verify no service/credential operations. |
| AC-09 | Diff only the declared migration paths and shared triage paths; compare hashes of existing maintenance/audit/docs/domain workflows and automation; confirm deferred register retains D-01 through D-05. |

## Tasks

None yet; written after independent review and owner acceptance. No shared skill or Stackweaver adapter
is implemented by this specification request.

## Open Questions

None. The owner selected report-first approval for every GitHub write and preserved the protected-umbrella
exception only for explicitly requested, freshly approved checklist/closure actions. The owner accepted
the reviewed specification on 2026-10-23. Implementation and publication retain their separate authority.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-23 | R-1 | spec | `b12baa57c5ca379474b97873e5aaeb43e5044098` | unknown | procedural | Blocking closure-evidence conflict and missing protected-umbrella parity exception; model identity not attested. |
| 2026-10-23 | R-2 | spec | `3a874470e499590afde434f165feaf19ca4d1e54` | unknown | procedural | No findings; model identity not attested. |
| 2026-10-23 | R-2 | spec | `3a874470e499590afde434f165feaf19ca4d1e54` | n/a | n/a | accepted by owner |
| 2026-10-23 | R-3 | spec | `b74f650edfbd88244b058d824b31a5d9043f4c19` | claude-opus-5.5 | procedural | Copilot bounded-packet review: ten findings; decisions and source/gate verification follow-up required. |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design / Collection, verification and report; Acceptance Criteria / AC-04; Test Plan / AC-04
EVIDENCE: docs/specs/shared-triage.md:127-131 distinguishes resolved, obsolete and duplicate states, but AC-04 at line 211 requires verified reachable behavior for every close-candidate verdict. Stackweaver agents/issue-triage.md:226-228 explicitly supports approved obsolete/duplicate closures as not planned. An obsolete issue whose target was removed, or a duplicate of unfinished work, cannot satisfy the reachable-behavior requirement.
PROPOSAL: Separate evidence requirements by closure reason: completed work requires verified reachable behavior; obsolete work requires verified removal or supersession; duplicates require verified total overlap with an identified canonical issue. Require adversarial verification for every closure proposal and add obsolete and unfinished-duplicate closure scenarios to the Test Plan.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design / Stackweaver migration and rollback
EVIDENCE: Stackweaver agents/issue-triage.md:50-55 allows umbrella checklist refreshes and surfaces an explicit owner-intended closure as a close candidate. docs/specs/shared-triage.md:123-124 excludes protected umbrella work from action proposals, line 160 leaves protected work untouched, and lines 174-178 require parity while listing three intentional differences that omit this changed behavior.
PROPOSAL: Record the legacy umbrella exception in the migration baseline and add a parity fixture for it. State explicitly whether the shared adapter preserves that behavior under fresh owner approval or deliberately defers it as protected work, and record any resulting difference.

### R-2

NO FINDINGS

### R-3

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design / Collection, verification and report; Design / Stackweaver migration and rollback; Test Plan / AC-07
EVIDENCE: Stackweaver agents/issue-triage.md:50-55 triages umbrella trackers by refreshing their checklist by default. It also surfaces a close candidate when the owner already left a closing comment on the issue. docs/specs/shared-triage.md:126-127 surfaces umbrella checklist or closure proposals only on an explicit owner request. Line 164-165 treats issue comments as untrusted data that are never authority, so an owner's closing comment on an issue can no longer trigger the proposal. Line 185 still says the migration will "Preserve the legacy umbrella checklist/owner-intended closure exception", while line 194-195 lists only three intentional differences: approval for remote writes, pagination and explicit incomplete evidence. The parity case at line 192-193 for umbrellas without an owner request will therefore differ from legacy output in a way the document does not record.
PROPOSAL: Add the changed umbrella behavior to the recorded intentional differences: no checklist refresh without a request, and no closure proposal from an owner comment alone. Alternatively, define how an owner comment found on the issue is surfaced as a lead without counting as authority. Make the parity pass condition name the expected difference.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Owner-approved execution; Acceptance Criteria / AC-06
EVIDENCE: docs/specs/shared-triage.md:158-160 says that approval binds the repository, issue IDs, action types and the report or evidence. It does not bind the exact comment text, label names, closure reason or canonical issue for a duplicate. Line 171 chooses the closure reason at execution time. AC-06 at line 230 says only "the approved target/action set". Under this wording, execution could post different comment text, apply a different label or use a different closure reason from the ones the owner saw, and still pass the criterion.
PROPOSAL: Make approval bind each action's exact payload: comment body, label names, closure reason and the duplicate's canonical issue. Treat any change to a payload as invalidating that item, and add a negative case to the AC-06 Test Plan row.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Canonical workflow and harness boundary; Acceptance Criteria / AC-03; Test Plan / AC-03
EVIDENCE: docs/specs/shared-triage.md:91-93 limits the effect of an unavailable source to "affected claims", which then cannot become executable close candidates. AC-03 at line 227 says "partial data never establishes ... an executable closure proposal". The Test Plan at line 241 says "incomplete reports cannot produce executable closure proposals", which applies to the whole report. These three readings conflict. Take a sweep where a single issue's comment page fails. Under line 91-93, closures for other issues are still allowed. Under line 241, every closure is blocked. Incomplete coverage of the closed-issue inventory affects duplicate verdicts for every issue, but the document does not say so.
PROPOSAL: State one rule: either any incomplete coverage blocks every executable closure, or only claims whose evidence depends on the missing data are blocked. Name which collections, such as the closed-issue and merged-PR inventories, affect every closure. Align AC-03 and its Test Plan row with that rule.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Scope; Design / Stackweaver migration and rollback; Acceptance Criteria / AC-07, AC-08
EVIDENCE: The `covers` paths at docs/specs/shared-triage.md:6-9 are inside vh-adlc only, and line 52-54 verifies Stackweaver separately at its own commit. Line 196 requires that a "reviewed shared plugin revision" be published or installed before cutover, and AC-07 needs it installed in Stackweaver. README.md:126-127 and :139-143 install from the vhco-tools Git marketplace. That route serves published content, which normally exists only after shipping, and shipping follows the complete gate. The complete gate needs AC-07 and AC-08 to be met or residualised. Its implementation review covers one vh-adlc commit, and `feature_tree_clean` cannot see Stackweaver. authority.md:19-22 requires a separate request to push or ship, and a new scope decision for another repository. The document does not name the install source, the Stackweaver branch or commit authority, or how Stackweaver evidence is tied to the reviewed vh-adlc commit.
PROPOSAL: State how the Stackweaver trial installs the reviewed revision before shipping, for example a local install of an exact commit. State how the implementation review records and verifies the Stackweaver commit for AC-07 through AC-09. State which authority covers Stackweaver commits and any push. Otherwise, split the Stackweaver migration into a later feature.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria / AC-01; Design / Validation surfaces; Test Plan / AC-01
EVIDENCE: AC-01 at docs/specs/shared-triage.md:225 says "the required native clients" but does not name them. Line 218 requires discovery to "remain valid for the clients already claimed by vh-adlc". README.md:183-184 claims the Claude Code desktop app and the Claude Code VS Code extension. The Test Plan at line 239 names only Codex CLI, Claude CLI, Codex desktop and VS Code Local. README.md:181 records that Computer Use was refused access to the Codex app, so the required Codex desktop capture may not be possible. The document does not say whether that leaves AC-01 unmet, residualised, or met with the remaining clients.
PROPOSAL: List the exact required clients in AC-01. Either add the Claude Code desktop app and extension to the Test Plan or record that the README must not claim the new operation on them. State what happens to AC-01 when a required GUI run is unavailable.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Owner-approved execution; Test Plan / AC-05, AC-06
EVIDENCE: docs/specs/shared-triage.md:175-176 requires that local plan-status sync is shown in the batch and cannot bypass a feature completion gate. Legacy Stackweaver agents/issue-triage.md:229-232 rewrites plan `status` when an issue closes. No criterion and no Test Plan row at lines 243-244 covers plan-status sync. Nothing tests a sync that would move a gated feature document to `complete`, and nothing tests a sync that was left out of the approved batch.
PROPOSAL: Name plan-status sync in AC-06, or in a new criterion. Add fixtures that show a sync appears in the batch, that an unapproved sync is not applied, and that a gated document is not moved past its gate.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria / AC-05, AC-07; Scope; Test Plan / AC-09
EVIDENCE: AC-05 at docs/specs/shared-triage.md:229 uses "bounded" and "appropriate ranking", and AC-07 at line 231 uses "the intended cutover behavior". None of these is an observable end state. Line 53-54 allows "any triage-only verification fixtures" in the Stackweaver migration paths. This leaves the AC-09 diff check at line 247 without a fixed path set.
PROPOSAL: Replace these words with the specific properties that Design lines 140-153 and 202-212 already define. Name the Stackweaver fixture directory so the AC-09 diff has an exact allowed path list.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Context
EVIDENCE: docs/specs/shared-triage.md:26-27 cites Stackweaver agents/issue-triage.md:83, :170 and :194, and line 32 cites :172 for the milestone priority. In the exported file at 7c3790f, line 83 is blank, and Step 2 is on line 82. Line 170 is the end of the label paragraph, and Step 5 starts on line 172. Line 194 is blank, and Step 6 is on line 195. The `Public Go Live` milestone rule is on lines 176-177. Line 39 cites references/lifecycle.md:36 for intake routing. At b74f650, that line is blank, and the routing table is on lines 37-49.
PROPOSAL: Correct the line citations to 82, 172, 195 and 176. Cite the lifecycle routing at the commit actually read.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Context; Scope / Deferred work register
EVIDENCE: The packet does not include several cited sources. From Stackweaver, these are agents/maintenance.md, agents/codebase-audit.md, agents/docs-impact.md, docs-drift-audit.md, docs-drift-resolver.md, docs-truth.md, agents/tfe-compat.md, agents/provider-fork.md and CLAUDE.md. vh-adlc at 9b68b56 is also missing. Without them, these claims cannot be decided: the protection-policy conflict between wrapper and playbook in D-01, the local auto-merge behavior in D-02, and the documentation and domain files in D-03 and D-04. The Context claims about 9b68b56 at docs/specs/shared-triage.md:37-40 cannot be decided either. vh-adlc-tree.txt shows seven skills and a reviewer, but only at b74f650.
PROPOSAL: Give the reviewer these sources at exact commits, or cite the claims at b74f650 and at Stackweaver commits included in the packet. Until then, treat D-01 through D-04 and the 9b68b56 claims as unverified.

FINDING: F-10
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter; Review Log
EVIDENCE: The binary at /home/m/.cache/vh-adlc/bin/0.1.0/linux_amd64/vh-adlc could not be run, and no shell was available. So `lint`, `fresh`, `gate planned` and `review check` were not observed, and the sha256 values in source-manifest.json could not be checked. The acceptance row at docs/specs/shared-triage.md:266 accepts R-2 at 3a874470, but this review targets b74f650. The claim at line 3, "planned gate passed", and the condition that the normative baseline at b74f650 matches 3a874470 could not be decided.
PROPOSAL: Run `fresh` and `gate planned` at b74f650 on the original host. Confirm that the export hashes match. If the normative baseline changed after 3a874470, move the document back to draft and get acceptance again.

## Sources

- [Stackweaver triage source](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/agents/issue-triage.md): evidence tiers, modes, report shape and project-specific ownership/ranking rules.
- [Stackweaver command adapter](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/.claude/commands/triage.md): current Claude routing and conflicting early-label versus report-first instructions.
- [Shared lifecycle procedure](https://github.com/michielvha/vh-adlc/blob/9b68b56292416da212910c62e133e09a49cd5258/plugins/vh-adlc/references/lifecycle.md): existing intake, bounded maintenance and generic-request publication boundaries.
- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): draft, independent review, acceptance, test mapping and one living feature document.
