---
status: draft
status_description: "R-1 corrections and owner-approved umbrella exception recorded; awaiting renewed spec review and acceptance."
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
to run commands, change credentials or widen scope. Never overwrite an original issue body.

Execute only the approved comment/label/create/close actions. Comment evidence before closure; if the
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
- [ ] AC-06: Execution changes only the approved target/action set, revalidates it before writing, preserves protected work except explicitly requested and approved umbrella checklist/closure actions, preserves original issue bodies, and safely resumes after partial failure without duplicate completed actions.
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
| AC-06 | Owner-authorized disposable repository/recording adapter: approve a subset, attempt body-injected commands, change issue/source after approval, deny comment before close, fail mid-batch and retry. Explicitly request and approve an umbrella checklist/closure, then omit request or approval in negative cases; inspect exact action log, original bodies and other protected IDs. |
| AC-07 | Frozen legacy/shared Stackweaver parity comparison including protected-umbrella exception and report-first approval difference; exact install and adapter commits; bounded real read-only trial with before/after GitHub and unrelated file snapshots; missing-plugin negative case. |
| AC-08 | Written rollback/reapply procedure executed in a disposable Stackweaver checkout; compare unrelated agents, plan files, index/worktree state and verify no service/credential operations. |
| AC-09 | Diff only the declared migration paths and shared triage paths; compare hashes of existing maintenance/audit/docs/domain workflows and automation; confirm deferred register retains D-01 through D-05. |

## Tasks

None yet; written after independent review and owner acceptance. No shared skill or Stackweaver adapter
is implemented by this specification request.

## Open Questions

None. The owner selected report-first approval for every GitHub write and preserved the protected-umbrella
exception only for explicitly requested, freshly approved checklist/closure actions. Final spec acceptance remains
separate from that policy answer and from authorization to implement or publish the feature.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-23 | R-1 | spec | `b12baa57c5ca379474b97873e5aaeb43e5044098` | unknown | procedural | Blocking closure-evidence conflict and missing protected-umbrella parity exception; model identity not attested. |

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

## Sources

- [Stackweaver triage source](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/agents/issue-triage.md): evidence tiers, modes, report shape and project-specific ownership/ranking rules.
- [Stackweaver command adapter](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/.claude/commands/triage.md): current Claude routing and conflicting early-label versus report-first instructions.
- [Shared lifecycle procedure](https://github.com/michielvha/vh-adlc/blob/9b68b56292416da212910c62e133e09a49cd5258/plugins/vh-adlc/references/lifecycle.md): existing intake, bounded maintenance and generic-request publication boundaries.
- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): draft, independent review, acceptance, test mapping and one living feature document.
