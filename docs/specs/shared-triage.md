---
status: in-progress
status_description: "Implementation claimed on feat/shared-triage; owner acceptance and documentation publication recorded."
issue: null
branch: feat/shared-triage
goal: "Deliver one shared evidence-based triage operation and a reviewed Stackweaver migration branch ready to publish, without duplicating project-independent instructions."
covers:
  - plugins/vh-adlc/
  - tests/vh-adlc/
  - README.md
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - docs/get-started/installation.md
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
  issues and merged references, `:82` joins plan metadata, `:113` verifies real remaining scope,
  `:149` classifies dispositions, `:172` ranks work, `:195` reports before asking, and `:246`
  defines sweep, next, close, stale and explicit-issue modes.
- `agents/issue-triage.md:19` permits comments/labels freely, while `:32` and
  `.claude/commands/triage.md:30` require reporting before execution. The owner's decision above
  resolves this conflict for the shared workflow and its Stackweaver migration.
- `agents/issue-triage.md:40` hardcodes protected issue numbers and bot ownership; `:176` prioritizes
  a named project milestone. These are repository settings, not shared defaults.
- Stackweaver `AGENTS.md:12` routes to local playbooks and `:23` routes Claude commands. Installing
  a plugin alone does not replace those instructions. The existing playbook is 266 lines and its
  wrapper is 40 lines (`wc -l`); this change replaces their duplicated triage procedure only.
- Shared vh-adlc `9b68b56292416da212910c62e133e09a49cd5258` has seven skills and a feature reviewer
  (`git ls-tree -r --name-only HEAD plugins/vh-adlc`). `references/lifecycle.md:37` routes generic
  requests and `:79` supports bounded maintenance. This is already useful lifecycle machinery,
  not the dependency/security-backlog maintenance sweep in Stackweaver `agents/maintenance.md`.
- Shared `references/authority.md:12` distinguishes reads, requested local work and publication.
  `references/lifecycle.md:65` permits a generic spec request to draft/review/commit locally;
  publication needs its own authority. This draft creates no issue, implementation or live triage.

## Scope

Deliver a shared triage operation for feature, bug and technical-debt backlogs, including evidence
verification, prioritization, report generation and execution of specifically approved tracker actions.
Expose one canonical operation through native plugin discovery and existing lifecycle intake.
Include the Stackweaver settings, compatibility entry points, parity trial, reviewed migration branch,
cutover sequence and rollback. Local completion means the shared operation and migration branch are
verified and ready to publish; it does not mean either default branch has adopted the change.

The `covers` paths above apply to vh-adlc. Main commit `ff0830c` relocated public workflow and
compatibility guidance from the README; update those authoritative guides while keeping the README
short. The installation guide also states the package skill count and runtime requirements, so cover
and update it for the added operation. `docs/README.md` is navigation only and needs no change.
This documentation alignment adds no triage behavior or Stackweaver documentation workflow.
The feature's public operation/support claims must agree across the README and linked guides.

The same feature's Stackweaver migration affects only
`.vh-adlc/triage.json`, `AGENTS.md`, `.claude/commands/triage.md`, `agents/issue-triage.md` and
`tests/agent-triage/`. Verify that repository separately at its exact migration commit.

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
with backlog triage and update native-discovery expectations. Align `references/authority.md` and
the lifecycle live-operation row with the existing owner-approved triage contract: a presented exact
batch authorizes only its tracker actions and local plan patches, including the shown local commit.
This authority is distinct from shipping a feature or updating its linked issue during shipping; it
grants no push, merge, release, credential change or issue implementation. This is a task-specific operation,
not another generic front door; `references/lifecycle.md` remains the sole generic intake.

Required capabilities are repository reads/Git, structured data parsing, paginated GitHub reads,
a report destination and a way to present a decision to the owner. Use available CLI or connector
adapters with equivalent completeness/error behavior. There is no required Claude tool name, model
alias, UI dialog, memory service or background agent. An explicit model request follows the existing
honest capability rules; unrequested runs inherit the host's model.

Parallel verification is optional. A serial host can verify the same issues and perform a second
adversarial pass, explicitly described as serial verification rather than independent review. If a
required test, source or permission is unavailable, affected claims remain unverified. Any incomplete
required collection or verification input makes every closure in that report non-executable; the
report may still present its observed findings and missing inputs. Missing optional parallelism does not make a report impossible.

The existing feature gates and bounded-maintenance procedure remain intact. Triage ranks and routes
work; it never treats a selected issue as an accepted feature or starts implementing it.

### Repository settings

Use `.vh-adlc/triage.json` with a schema version. The shared package owns validation and the
normalized inventory/report contract. Reject unknown versions and malformed settings with a precise
local error before tracker writes. Package any executable helpers with the shared component and
state their runtime requirements; never rely on an untracked personal script.

Settings describe the repository identity, canonical source roots and generated mirrors, plan roots
and frontmatter field mapping, report directory, protected issue/tracker IDs, bot/workstream ownership,
existing label mappings, milestone/priority order and stale-age threshold. Protected-index rules may
use declared labels or literal title prefixes in addition to IDs; never require an exhaustive ID list. They are data, not arbitrary
shell programs. Existing repository instructions remain authoritative for verification commands and
public interfaces. A repo without settings can use documented conservative defaults: no project-specific
milestone preference or guessed tracker IDs; report absent plan metadata instead of claiming no backlog.
Explicitly requested but missing settings block the affected operation, not silently reset to defaults.

Without a settings file, the default report directory and history source are
`.vh-adlc/reports/triage/` under the selected repository, source scope is the repository excluding
Git metadata, plan roots are absent, and ownership/priority/label mappings are empty. Preserve the
90-day stale default. Report plan metadata as unavailable. An observed absent default report directory
means no previous framework report exists there and permits a first run; create it only to save the
requested report. Permission or read errors are unavailable history, never a first run. These defaults
do not create settings, rewrite existing documents or guess project-owned issue IDs.

Resolve repository identity from the selected checkout and confirm the GitHub target. Do not switch a
shared global account. Reject conflicting configured identity until the owner resolves it. Canonical
source paths must stay inside the selected repository; generated distribution mirrors are not proof.
The settings carry no credentials, tokens or host-private configuration.

The run contract permits an explicit `report_output` file path (CLI equivalent `--report-output`)
without editing repository settings. It changes only the destination of this run's new report. Always
read previous-report history from the configured report directory, including when writing externally;
an external destination is never evidence that no prior report exists. A missing/unreadable explicitly
configured history source is reported as unavailable, not as a first run; the absent implicit default
directory has the specific first-run behavior above. An existing readable directory with no
prior reports establishes the first run. The trial uses this override and verifies unchanged settings.

### Collection, verification and report

1. Fix the source HEAD and requested mode/scope. Inventory open issues, relevant comments, merged PR
   references and closed duplicates; join local plan metadata. Paginate every collection, including
   comments. A missing permission, transport error, unavailable page or configured budget limit is
   explicitly incomplete coverage, never an empty success. Do not impose the old 200/300/100 limits
   and then describe a full sweep as exhaustive. Frozen fixtures test larger collections. Missing any
   required issue/comment page, closed-issue inventory, merged-PR inventory or required verification
   input blocks every executable closure in that report. A targeted run still names its required
   collection scope and cannot claim unrelated backlog coverage.
2. Keep bot-owned, protected umbrella and other-workstream issues visible in an excluded/owned section,
   outside automatic action proposals. An explicit owner request may surface an umbrella checklist
   update or closure proposal; its protected status remains visible and fresh batch approval is required.
   This exception does not authorize actions on bot-owned or other-workstream issues. Inspect the
   issue's role as well as configured IDs: milestone indexes and umbrella trackers remain protected
   even when newly created or unlisted, and even without settings. All sub-items being shipped is
   never enough to propose closing the index itself. Record the index-role evidence and require the
   existing current owner request/approval exception before an index closure proposal.
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
   actions. Include measured counts for open issues, closure candidates, blocked work and issues
   without plans, qualified by coverage. Compare with the previous report and name added, removed and
   changed issue states; the first run says no previous report exists. Select the latest report with
   the same repository, mode and declared selection scope. If no matching report exists, any comparison
   with another available report is explicitly limited to issue IDs both runs observed; different or
   unknown scope is not a first run. Only complete inventories of the same scope can establish added
   or removed backlog entries. Otherwise label issues outside the observed overlap as not compared,
   and compare only common verified states. Incomplete coverage never implies removal. Retain the
   previous run identity, scope and comparison limits. Keep previous reports as history. A second same-day run has a distinct run identity and
   never truncates a prior report. Distinguish report-only/local output from a committed or published
   report. Reports remain uncommitted by default; commit only on an explicit request using the
   repository's skip-CI rules. Saving or committing grants no push authority. Apply local report frontmatter/index conventions
   only to the report and the indexes they require, without changing documentation workflows.

Preserve sweep, next, close, stale and explicit-issue modes. `next` verifies the shortlist rather than
claiming full backlog verification. `close` proposes closures without executing or ranking them. Only sweep and next produce a ranked
shortlist; stale and explicit-ID runs verify their selected issues without readiness ranking. Age alone is never
a closure reason. Default stale age is 90 days unless configured otherwise. Targeted reports name their
subset and do not mark unrelated issues reviewed.

### Owner-approved execution

The initial sweep is read-only on GitHub, including comments and existing labels. This was explicitly
chosen by the owner on 2026-10-23. Present the complete proposed batch before execution. Approval
binds repository, issue IDs, action types, the report/evidence and each exact payload: comment body,
label names and new-label descriptions/colors, issue-creation title/body, closure reason, duplicate
canonical issue, checklist patch, local plan-status patch and new-issue URL backfill patch. Changed payloads invalidate that item and require renewed approval. A batch
can authorize several exact actions; unchanged valid actions need no repeated per-issue question.

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
in the batch with its exact before/after patch, follows that repository's lifecycle rules and cannot
bypass a feature completion gate. An unapproved sync makes no local change; an approved sync whose
required gate fails remains unapplied and is reported as blocked. Creating a missing issue may include
an exact approved `issue:` frontmatter backfill in the same batch; show the target path and patch
template before approval, bind the returned canonical issue URL, and preserve all other plan content.
If creation succeeds but backfill fails, retry only the backfill using the created issue identity; do
not create a second issue. A patch template may contain only that returned URL as its variable.

Retain the legacy local commit for approved plan-status and issue-URL patches. The batch also shows
the exact conventional commit subject and explicit file list. For Stackweaver's internal plans, use
`docs(internal): sync plan statuses after issue triage [skip ci]` only when its skip-eligibility rules
permit it. Other repositories follow their own commit/skip rules. Commit only the successfully
applied, approved plan patches; do not include reports or unrelated staged work. A failed commit
leaves those patches visibly uncommitted and retryable, without repeating completed tracker writes.
This retained plan-commit behavior is separate from the explicitly changed report-commit default.
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
   explicit checklist/closure request, plus a newly opened unlisted umbrella whose sub-items all
   shipped. Compare scope, evidence, exclusions, mode-appropriate ranking, report counts/diffs
   and proposed actions, including new-label descriptions/colors, missing-issue URL backfill and
   resulting plan-commit subject/path set. Verify retained plan commits separately from the report
   commit-on-request difference.
   Separately record intentional differences: all remote writes await approval, collection is paginated,
   and incomplete evidence is explicit. The shared flow also requires a current explicit owner request
   before proposing an umbrella checklist/closure action; a historical issue comment remains a lead,
   not authority. All modes now save a report, including next/close, whereas legacy next/close did
   not require saving one. Reports remain uncommitted unless requested. Record both intentional
   report differences and their scope-safe history comparison.
   The parity result must name these differences. Neither run posts comments or applies labels.
4. **Integrate deliberately:** install the exact local shared plugin commit in disposable client
   profiles before publication, using each native manager's local marketplace or plugin-directory
   support. Validate the installed canonical payload against that commit. This pre-publication trial
   does not depend on shipping or merging the feature first. Make Stackweaver's
   `agents/issue-triage.md` a thin forwarding entry plus the settings pointer, update only triage routing
   in `AGENTS.md`, and keep `/triage` as a Claude compatibility command with its existing arguments.
   Other harnesses discover/invoke the same shared operation. Preserve the Claude compatibility
   command's existing `model: fable` frontmatter as Stackweaver's constitution requires. This local
   model preference cannot become a shared requirement. No duplicate generic procedure
   or fallback that silently runs obsolete logic when the plugin is missing.
5. **Validate cutover:** a bounded real read-only Stackweaver trial checks report scope and existing
   account access. Write its report to an explicitly selected temporary directory outside Stackweaver
   and leave it uncommitted, using the run-level override without changing settings. Read comparison
   history from the configured normal report location. Record that external artifact in the evidence; exclude no checkout changes
   from the before/after snapshot comparison. Separately verify the configured normal report location
   and index handling in a disposable fixture. Freeze tracker and unrelated file snapshots; no GitHub
   writes or report commits occur during the live trial. Use a write-denying, recording GitHub
   adapter for the entire trial; its trace must show only reads, and any attempted mutation fails the
   trial. Whole-tracker before/after snapshots are supporting context, not an equality gate: attribute
   concurrent owner/bot changes separately and do not count them as trial actions. Confinement must
   make the adapter the only live GitHub path for the entire trial. Use a trusted collector with fixed
   GET-only calls outside the analysis agent, then give that agent an explicit input set: the collected
   tracker snapshot, the complete canonical source tree at the fixed Stackweaver HEAD and the complete configured
   report-history directory, plus canonical plugin/settings. Exclude credentials and host configuration
   from the read-only input export; the full source/history is needed to verify absences and choose
   the comparison report. Any unavoidable omission limits those claims explicitly to observed scope
   and leaves absence/removal claims outside that scope unverified, never executable closures. Record those input paths
   and hashes. No GitHub credential, connected write tool, shell/network mutation path or access to an
   owner's alternate keyring/profile is reachable from the analysis agent. Collector credentials stay
   outside that input set and are never passed to the agent. Instructions or a renamed HOME alone
   are insufficient isolation. Verify the actual enforced boundary with a non-secret canary outside
   the declared input set. Run the negative probes from inside the actual analysis environment: test
   environment-variable access, credential helpers, keyrings/agent sockets, connected tools and direct
   GitHub egress as well as file access. A mutation probe must originate there and target only the
   offline denying adapter or an authorized disposable fixture, never live Stackweaver. An offline
   adapter unit test alone does not prove the analysis environment is confined. Credential metadata
   checks may support the proof but a read-only token alone never establishes confinement. Record enforced isolation,
   negative probes and the complete tool/adapter trace. The trusted collector must include hashed
   per-collection pagination/completeness/error records in the snapshot; the operation validates and
   applies them under the existing report-wide incomplete-coverage rule, rather than trusting an
   unqualified snapshot to be complete. Do not mint or transfer credentials as part of this feature.
   If confinement cannot be established, the live trial remains not verified. The checkout, including
   settings and index, must remain unchanged.
   Exercise the approved-write protocol in an owner-authorized disposable fixture repository, not the
   live Stackweaver backlog. Record exact component and adapter revisions before retiring duplicate prose.
6. **Rollback:** store the exact baseline/pair, restoration/reapplication commands and the ordered
   publication handoff in Stackweaver's `tests/agent-triage/README.md`, within the declared migration
   paths. Link it from this feature's evidence. Retain the pre-cutover revisions in Git and restore only the triage
   entry points/settings. Rehearse rollback and reapplication on a disposable checkout. Rollback does not
   undo tracker actions or disturb local work, plans, other agents, credentials, hooks, containers or slots.

The accepted cross-repository scope and instruction to run the loop authorize local Stackweaver edits,
checks and commits on `feat/shared-triage-migration` in an isolated checkout following its repository
rules. Keep the main checkout and its live runtime unchanged. Before the combined implementation
review, commit both repositories and record the exact shared component and Stackweaver adapter commits
in this document's evidence. Give the reviewer both source directories and commits. It must verify the
adapter/settings/fixtures and AC-07 through AC-09 against the Stackweaver commit, compare its allowed
migration paths to the recorded pre-cutover baseline, and confirm relevant files remain clean at both
targets. Changing either reviewed side invalidates its dependent evidence and requires renewed review.
Publication of spec/claim or feature branches, remote PRs, merges and releases retain separate authority;
local trial installation grants none of those actions.

The local migration branch is ready to publish only after parity, native invocation, the bounded live
read-only trial and rollback proof are observed. Retiring duplicate prose on that reviewed branch is
part of the local deliverable; Stackweaver main retains its working legacy entry until publication.
A missing plugin produces an actionable install/version blocker. Report partial local migration when
any required proof is missing.

Actual adoption is a separate ordered follow-up under explicit publication/merge authority: first
publish and merge vh-adlc so the shared marketplace serves the verified operation, install that exact
published revision, then publish and merge the reviewed Stackweaver adapter branch. Confirm the
installed component/adapter pair and rerun any evidence invalidated by a changed commit. Do not merge
the adapter ahead of its available shared dependency. This follow-up remains recorded here after local
completion and is not claimed complete by the local feature gate.

### Validation surfaces

Required native clients are Codex CLI, Claude CLI, Codex desktop and VS Code Local. Invoke the same
package/settings through each client's native discovery, using disposable profiles or an isolated test
workspace where supported. Also test a host-capability fixture without parallel agents or a native
question tool, and test pagination failures and denied writes through a recording GitHub adapter.
Unavailable required GUI execution leaves AC-01 unverified and blocks completion unless the owner
chooses a residual with a durable tracker. CLI success and prompt/manifest inspection cannot replace
actual GUI discovery/read-only invocation. Claude desktop and Claude Code's VS Code extension retain
their existing historical support statements, but the new triage operation is unclaimed on those
surfaces until separately tested. No other harness support is implied.

## Acceptance Criteria

- [ ] AC-01: The shared triage operation is discoverable and invokes the same canonical procedure through Codex CLI, Claude CLI, Codex desktop and VS Code Local without a Claude-only dependency; generic intake routes backlog triage to it, preserves existing intake/maintenance routes, and the README and linked workflow/compatibility/installation guides accurately state the expanded operation set and tested support.
      Evidence: R-13 returned `not verified`; its executed subset does not establish the composite criterion.
- [ ] AC-02: Generic and Stackweaver settings yield repository-correct scope, protected-work exclusions including new unlisted index issues, plan metadata, ranking and report placement without Stackweaver constants in shared behavior.
      Evidence: R-13 returned `not verified`; its executed subset does not establish the composite criterion.
- [ ] AC-03: Collection includes every requested page and reports incomplete or denied coverage explicitly; any incomplete required collection or verification input blocks every executable closure in that report, and partial data never establishes exhaustive triage.
      Evidence: R-13 returned `untested`; its executed subset does not establish the composite criterion.
- [ ] AC-04: Closure proposals have adversarially verified evidence appropriate to their reason: reachable completed behavior, removed or superseded scope, or total overlap with an identified canonical issue; partial work, stale blockers and unverified claims retain their true remaining scope.
      Evidence: R-13 returned `untested`; its executed subset does not establish the composite criterion.
- [ ] AC-05: Every mode reports its source commit, requested issue subset and collection completeness, preserves previous runs with measured counts and run-over-run differences, saves reports uncommitted unless a commit is requested, limits readiness ranking to sweep/next, where verified prerequisites precede dependents with reasons and blocked work is excluded from ready rankings, and leaves GitHub unchanged until exact actions are approved.
      Evidence: R-13 returned `untested`; its executed subset does not establish the composite criterion.
- [ ] AC-06: Execution applies only the approved targets and exact payloads after revalidation, preserves unrelated issue-body content and protected work except explicitly requested and approved umbrella checklist/closure actions, applies plan-status sync and issue-URL backfill only when specifically approved and applicable lifecycle gates pass, and resumes after partial failure without duplicate completed actions or duplicate issue creation; local plan commits contain only the approved successful patches and shown commit metadata.
      Evidence: R-13 returned `untested`; its executed subset does not establish the composite criterion.
- [ ] AC-07: The reviewed Stackweaver migration branch is ready to publish: its triage command and harness-neutral entry invoke the exact local shared revision with preserved settings, paired commits and parity proof; the live read-only trial preserves the checkout and proves through its exclusively reachable read-only GitHub path that it makes no tracker write while saving its report externally, and actual main cutover remains the ordered follow-up.
      Evidence: R-13 returned `not verified`; its executed subset does not establish the composite criterion.
- [ ] AC-08: The documented Stackweaver rollback restores the prior triage entry points on a disposable checkout while preserving unrelated agents, plans, Git state and runtime resources.
      Evidence: R-13 returned `not verified`; its executed subset does not establish the composite criterion.
- [ ] AC-09: Dependency maintenance, codebase audit, documentation and domain workflows remain unchanged, with the deferred work register preserved for later scope decisions.
      Evidence: R-13 returned `not verified`; its executed subset does not establish the composite criterion.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Package/discovery tests and native Codex CLI, Claude CLI, Codex desktop and VS Code Local fixture invocation; compare installed canonical payload. Run a generic backlog-triage prompt plus existing investigation/docs/feature/maintenance boundary regression cases, and inspect README and relocated workflow/compatibility/installation operation, support, skill-count and runtime claims; confirm the docs index remains navigation-only. Exercise serial verification and plain-chat approval fallback without fabricated capabilities. |
| AC-02 | No-settings fixture verifies default report/history placement, first-run versus unavailable history and absent plan metadata; generic and Stackweaver config fixtures; malformed/unknown-version/conflicting-repo cases; expected ownership/ranking/report paths, including no-settings and unlisted-umbrella cases with all sub-items shipped; inspect shared package for copied project constants. |
| AC-03 | Paginated fixtures beyond legacy caps, nested comment pagination, inaccessible page/permission/rate/network failure and budget exhaustion; a failed required page or verification input makes every closure in that report non-executable, including otherwise evidenced issues; cover failed closed-issue and merged-PR inventory as report-wide blockers; inspect per-collection completion/error metadata in collected snapshots and reject missing or inconsistent records. |
| AC-04 | False-complete plan, merged Refs-only PR, unwired component, closed prerequisite with still-open dependent scope, missing source/test, removed/superseded scope, total duplicate of unfinished canonical work versus partial overlap, and dependency-cycle fixtures; inspect adversarial evidence and reason-correct closure proposals. |
| AC-05 | Sweep/next/close/stale/explicit-ID fixtures, recording adapter asserts zero writes, same-day repeat preserves both reports, an external output override leaves settings unchanged and still reads configured history, counts and run-over-run differences match snapshots across mixed modes/scopes and incomplete coverage without false additions/removals, default reports remain uncommitted and explicit local commits follow repo rules; sweep/next ranking reasons and completeness match scope, while close/stale/explicit-ID reports contain no readiness ranking. |
| AC-06 | Owner-authorized disposable repository/recording adapter: approve a subset, attempt body-injected commands, change issue/source after approval, deny comment before close, fail mid-batch and retry. Explicitly request and approve an umbrella checklist patch/closure, then omit request or approval or change the patch's base body in negative cases; change an approved comment/label/closure/duplicate payload in negative cases. Inspect exact action log, preserved unrelated body content and other protected IDs. Include approved/unapproved plan-status patches and an attempted gated-completion sync; failed gates cannot change status. Bind new-label description/color and issue-URL backfill payloads; fail after issue creation and confirm retry backfills the same URL without another issue. Assert the approved plan commit subject/path set, unrelated index preservation and failed-commit retry state; intake-selected triage uses the same narrow authority reference and never shipping authority. |
| AC-07 | Frozen legacy/shared Stackweaver parity comparison including protected-umbrella exception and report-first approval difference; exact local install and adapter commits independently inspected in the paired-repository review; bounded real read-only trial with external uncommitted report, unchanged complete checkout/index snapshots, complete canonical source/history inputs, validated per-collection coverage metadata, and probes from the actual analysis environment covering file/environment/helper/keyring/socket/tool/direct-egress routes with mutation attempts confined to offline/disposable targets: every probe must establish no readable outside-input canary, no reachable GitHub credential via environment/helper/keyring/socket, no connected write tool and no direct GitHub egress, and every mutation attempt must be denied; a read-only adapter trace and tracker snapshots with unrelated concurrent actor changes attributed and an inspected ordered publication handoff; verify the explicit output override, unchanged settings and configured previous-report source, and inspect the durable handoff in `tests/agent-triage/README.md`; separately verify normal report placement in a disposable fixture; missing-plugin negative case. |
| AC-08 | Rollback/reapply procedure in `tests/agent-triage/README.md` executed in a disposable Stackweaver checkout; compare unrelated agents, plan files, index/worktree state and verify no service/credential operations. |
| AC-09 | Diff only the declared migration paths and shared triage paths; compare hashes of existing maintenance/audit/docs/domain workflows and automation; confirm deferred register retains D-01 through D-05. |

## Tasks

One commit per task. Test tasks preserve their observed expected failure; the following implementation
task makes them pass. Every task records its command and result when performed. Runtime helpers use
Bun, the repository's existing scripting runtime; they are packaged with the canonical component.

- [x] T1 `tests/vh-adlc/triage/settings.test.ts`, `tests/vh-adlc/triage/fixtures.ts` - settings fixtures fail because the shared validator does not exist; cover no settings, bad versions/shape, identity conflicts, path escapes, protected/index roles and Stackweaver-independent defaults (AC-02, AC-09).
      Evidence: `bun test tests/vh-adlc/triage/settings.test.ts` failed as expected: missing canonical settings module; raw output `/tmp/shared-triage-t1-red.log`. No implementation or criterion pass is claimed.
- [x] T2 `plugins/vh-adlc/scripts/triage/settings.ts`, `plugins/vh-adlc/scripts/triage/types.ts`, `plugins/vh-adlc/references/triage-settings.md`, both plugin manifests - T1 passes with one validated settings and normalized data contract, documented runtime requirements and no project constants in defaults (AC-02).
      Evidence: settings suite passed 23 tests after the observed missing-module and alias-path failures; `bun test tests/vh-adlc` passed 231 tests, 608 assertions. Package version 0.4.0 was moved forward to satisfy the existing version guard; no release was published. Logs: `/tmp/shared-triage-t2-green.log`, `/tmp/shared-triage-t2-suite.log`.
- [x] T3 `tests/vh-adlc/triage/collection.test.ts` - pagination/error/plan-inventory fixtures fail because the collector is missing; include collections beyond old limits and per-collection scope, completion and sanitized error metadata (AC-03, AC-02).
      Evidence: `bun test tests/vh-adlc/triage/collection.test.ts` failed as expected because the collector module is missing (`/tmp/shared-triage-t3-red.log`); cases cover 201 open issues, 101 closed issues, 301 PRs, 101 comments, partial pages, metadata and source drift.
- [x] T4 `plugins/vh-adlc/scripts/triage/collect.ts`, `plugins/vh-adlc/scripts/triage/github.ts`, `plugins/vh-adlc/scripts/triage/cli.ts` - T3 passes through the same structured collector used by the CLI, with fixed read requests, paginated comments and explicit incomplete coverage (AC-03).
      Evidence: collection suite passed 11 tests after observed missing-module, malformed-Link, mirror-alias and timestamp failures; full plugin suite passed 242 tests, 652 assertions. CLI build passed; actual GET-only adapter read 30 issue/PR rows from `michielvha/vh-adlc` with no next page. Logs: `/tmp/shared-triage-t4-green.log`, `/tmp/shared-triage-t4-suite.log`.
- [x] T5 `tests/vh-adlc/triage/report.test.ts` - verdict/report fixtures fail because report helpers are absent; cover every evidence trap, dependency cycle, mode, comparable/incomplete history, explicit output override and report preservation (AC-04, AC-05).
      Evidence: `bun test tests/vh-adlc/triage/report.test.ts` failed as expected on the missing report module (`/tmp/shared-triage-t5-red.log`); fixture proof uses actual source reads, behavior checks and Git searches/removal, with negative closure/history cases.
- [x] T6 `plugins/vh-adlc/scripts/triage/report.ts`, `plugins/vh-adlc/scripts/triage/cli.ts` - T5 passes with reason-correct evidence requirements, report-wide closure guards, mode-correct ranking and history-safe reports (AC-04, AC-05).
      Evidence: report fixtures passed 15 tests after observed missing-module, relative-output, unresolved-dependency, shortlist and same-timestamp history failures. Full plugin suite passed 257 tests, 747 assertions (`/tmp/shared-triage-t6-suite.log`); CLI build passed. The normalized settings/type contract now records whether the history location was explicitly configured. The CLI subprocess test requires the host execution surface; sandbox pipe restrictions were observed separately. No live tracker writes occurred.
- [x] T7 `tests/vh-adlc/triage/execution.test.ts` - recording-adapter and local-Git fixtures fail because execution helpers are absent; cover exact subset/payload approval, stale evidence, index exceptions, comment-before-close, gated plan patches, issue backfill, partial failure and retry (AC-06).
      Evidence: `bun test tests/vh-adlc/triage/execution.test.ts` failed as expected on the missing execution module (`/tmp/shared-triage-t7-red.log`). Recording-adapter cases assert no unapproved effects, stale-proof rejection, reason and ownership constraints, comment-before-close, exact checklist preservation, separately gated local patches, creation retry and commit/index preservation.
- [x] T8 `plugins/vh-adlc/scripts/triage/execute.ts`, `plugins/vh-adlc/scripts/triage/github.ts`, `plugins/vh-adlc/scripts/triage/cli.ts` - T7 passes with narrow approved execution, preserved unrelated Git/body content and retry without duplicate comments, issues or commits (AC-06).
      Evidence: 19 execution tests pass, including the packaged CLI against a recording offline GitHub process, lost response/commit recovery, process interruption and fail-closed uncertain outcomes. Full plugin suite passed 276 tests, 846 assertions (`/tmp/shared-triage-t8-suite.log`); CLI build passed. The adapter reuses exported collection normalizers; normalized settings retain their actual file path for revalidation. No live tracker write or publication was attempted.
- [x] T9 `tests/vh-adlc/triage/discovery.test.ts`, `tests/vh-adlc/check.test.ts` - discovery/routing tests fail because the new canonical operation is missing; preserve original operation contracts and verify the triage authority boundary (AC-01, AC-09).
      Evidence: discovery/routing fixtures failed as expected on the missing skill/procedure and absent intake/public guide entries (`/tmp/shared-triage-t9-red.log`). The package checker now schedules the eighth operation while retaining its seven original operations and their existing gate assertions. These structural checks do not claim native host invocation.
- [x] T10 `plugins/vh-adlc/skills/vh-adlc-triage/SKILL.md`, `plugins/vh-adlc/references/triage.md`, `plugins/vh-adlc/references/lifecycle.md`, `plugins/vh-adlc/references/authority.md`, `plugins/vh-adlc/plugin.json`, `plugins/vh-adlc/.claude-plugin/plugin.json`, `README.md`, `docs/user-guides/workflows.md`, `docs/reference/compatibility.md`, `docs/get-started/installation.md` - T9 and the full plugin checker pass; discovery, generic routing, runtime setup and support claims agree with the actual package (AC-01, AC-09).
      Evidence: discovery fixtures pass, and the full checker passes 283 tests, 903 assertions (`/tmp/shared-triage-t10-suite.log`). One canonical procedure is discoverable through the eighth skill; existing routes remain in place. Public guides state runtime, exact approval and unverified new native surfaces. A discovery regex was broadened to accept either natural word order without weakening its Bun/triage requirement. Native CLI/GUI invocation remains pending T15/T16.
- [x] T11 `tests/vh-adlc/triage/migration.test.ts`, `tests/vh-adlc/triage/fixtures/` - frozen legacy/shared parity and rollback checks fail until the Stackweaver adapter exists; include unlisted protected indexes and every recorded intentional difference (AC-07, AC-08, AC-09).
      Evidence: legacy prompts were frozen verbatim from Stackweaver `129581f6dbe4df71200af8f67d7bc017d35e89ad`, with SHA-256 provenance and seven explicit intentional differences. Migration fixtures fail on the absent exact-commit adapter export (`/tmp/shared-triage-t11-red.log`); their checks cover allowed paths, thin routing/model metadata, settings and durable handoff. Behavioral native parity remains T15, not established by these structural checks.
- [x] T12 Stackweaver `.vh-adlc/triage.json`, `AGENTS.md`, `.claude/commands/triage.md`, `agents/issue-triage.md`, `tests/agent-triage/` - T11 passes at an exact isolated migration commit; model metadata, project settings, missing-plugin diagnostics and durable rollback/publication handoff are preserved (AC-02, AC-07, AC-08, AC-09).
      Evidence: Stackweaver adapter commit `c398866bb7d6f0e97e7dd032d875d7c5354b427d` is clean in `/home/m/code/stackweaver-triage-migration`; its hooks and scoped verification ran, two contract tests pass, and the exact exported snapshot passes the five migration tests with the real checkout selected. Full shared suite: 290 tests, 981 assertions (`/tmp/shared-triage-t12-suite.log`). The docs-impact match is a dated historical report, retained as history. The first disposable rehearsal restored/reapplied all runtime paths and preserved index bytes, then exposed a report-index assertion defect (`/tmp/shared-triage-stack-rehearsal.log`); repair tracked below. No readiness/native/parity claim is inferred from these structural passes.
- [x] T12a Stackweaver `tests/agent-triage/rehearse.ts`, `tests/agent-triage/README.md` and the shared exact-commit export - repair the observed report/index staging assertion: preserve the byte check for rollback/reapply, compare complete staged entries for report generation, and observe the disposable rehearsal passing (AC-05, AC-08).
      Evidence: adapter `4532b929286c1af9df5cfac3b37fddec6004a4a9` passes the disposable rehearsal (`/tmp/shared-triage-stack-rehearsal-green.log`): rollback/reapply preserve index bytes and runtime-path hashes; normal report/index generation preserves all staged entries. Only its generated coverage-map change was restored in that owned fixture. The exact export and real-checkout migration tests pass. No live checkout or runtime was touched.
- [x] T12b `tests/vh-adlc/triage/report.test.ts` and legacy history fixtures - expose compatibility gaps found while inspecting the actual Stackweaver adapter: mixed status-directory history, legacy unknown-scope comparison, other-workstream exclusions, and planned/partial readiness tie-breaks (AC-02, AC-05, AC-07).
      Evidence: three focused regressions fail as expected (`/tmp/shared-triage-t12b-red.log`): measured legacy/mixed history is unavailable, explicit other-workstream ownership still receives an index exception, and rank ties omit dependency/plan/partial readiness. The legacy status format was measured at the recorded baseline; its shared parser fixture is synthetic and retains a source hash without publishing private findings.
- [x] T12c `plugins/vh-adlc/scripts/triage/report.ts`, `plugins/vh-adlc/references/triage.md` - make those compatibility regressions pass without weakening scope or evidence guards; rerun the migration and full plugin suites (AC-02, AC-05, AC-07).
      Evidence: all three observed compatibility failures now pass; full plugin suite passed 293 tests, 1007 assertions (`/tmp/shared-triage-t12c-suite.log`) and CLI build passed. Legacy tables remain unknown-scope history with overlap-only comparison, other-workstream exclusions cannot receive index exceptions, and ranking retains prerequisite/plan/partial tie-breaks with explicit reasons. Reports also retain plan paths and honest unknown size rather than inventing estimates.
- [x] T13 `tests/vh-adlc/triage/acceptance.test.ts` - acceptance-grader and isolation fixtures fail until the native driver exists; reject fabricated discovery, missing full-source/history inputs, incomplete snapshot metadata and unproven environment/helper/keyring/socket/tool/egress isolation (AC-01, AC-03, AC-07; R-9 F-01 through F-03).
      Evidence: acceptance fixtures fail on the missing native driver (`/tmp/shared-triage-t13-red.log`). They require full Git-object source export despite export-ignore attributes, nested history, hashed coverage, tamper/omission rejection, restricted launch arguments and actual native/probe traces rather than prose claims. Bubblewrap network isolation was observed working on the host; the enclosing command sandbox denies its network-namespace setup, so actual boundary tests need the host execution surface. Codex/Claude native invocations are not yet claimed.
- [x] T14 `tests/vh-adlc/triage/native.ts`, `tests/vh-adlc/triage/fixtures.ts` - T13 passes with disposable native profiles, hashed complete source/history inputs and a trial-specific enforced read-only boundary verified from its actual analysis environment; probes never target live writes (AC-01, AC-03, AC-07).
      Evidence so far: the driver builds and all 301 plugin tests pass, including eight acceptance tests and actual Bubblewrap/MCP process probes (`/tmp/shared-triage-t14-suite.log`). An unsupported Bubblewrap flag and a grader accepting forged namespace evidence were observed and fixed. These initial checks preceded native invocation; the completed native proof follows below.
      Native preflight follow-up: the first actual CLI attempt exposed the driver expecting `pass` from `knowledge`, whose released response is `answered`. The added direct binary/page integration test failed on that mismatch, then passed after the parser fix. Full suite: 302 tests, 1074 assertions (`/tmp/shared-triage-t14-knowledge-red.log`, `/tmp/shared-triage-t14-knowledge-suite.log`). No agent analysis or tracker action occurred in that failed preflight.
      First native context: Claude CLI 2.1.309 installed the local marketplace payload and invoked `vh-adlc:vh-adlc-triage` at component `234734db46bd54e8325ac4346a29fc398007d143`; all eight probes passed in its actual MCP session. The retained run at `/tmp/shared-triage-native-Qa6oBi/claude` was graded failing: the grader missed native Skill/StructuredOutput semantics, and inspection found unread engineering pages plus evidence-path/context mistakes. Regression coverage now recognizes the native tool result, still rejects command tools, and requires complete page reads. Adapter metadata and canonical instructions clarify repository-relative proof; the trusted driver now validates and saves the external report. Native rerun remains required.
      Claude rerun at `afb10652fc11d0141b49d10d1331051261ada44c` passed native invocation, all page reads, all eight native-session boundary probes and external report rendering (`/tmp/shared-triage-native-Qa6oBi/claude-2/result.json`). The report correctly resolves the wired CLI, retains partial HTTP work, excludes the index/protected work, and leaves the fixture checkout clean. Codex installed the same payload but its first invocation failed closed because disabling Code Mode hid MCP tools; no analysis/probe pass is claimed for `/tmp/shared-triage-native-Qa6oBi/codex`. The driver now uses the matching installed tool-routing runtime while shell/apps/browser remain disabled, and custom owner prompts can exercise generic intake or the local compatibility command.
      Codex CLI 0.163.0 passed generic intake, canonical invocation, full engineering page reads, all eight actual-session probes and external report rendering at component `c3b664e37e83c41ef7c442bd7d6814c4239c85df` (`/tmp/shared-triage-native-Qa6oBi/codex-3/result.json`). The fixture remained unchanged. A verified-present prerequisite was still classified as unresolved by the report graph; an added regression reproduces it and now passes with the cleared prerequisite removed from the outstanding dependency set. Native proofs must be rerun against the final payload.
      Diagnostic reruns: a commit failed because new files had not been staged; Claude and Codex then ran against uncommitted input. Both results were retained as ineligible and failed payload grading after subsequent changes (`/tmp/shared-triage-native-Qa6oBi/claude-5`, `codex-6`). A new preflight regression failed on the missing guard, then passed: native launches now require a clean component and compare every plugin/driver byte to the recorded Git revision, rejecting ignored extra plugin files too. Full plugin suite after the guard and pagination edge fixes: 314 pass, 1160 assertions (`/tmp/shared-triage-commit-preflight-suite.log`); both builds pass. Fresh clean-commit native runs remain required.
      Completed native proof: clean component `f1f1810fc24f2f6e586676a931cca30d7c78cddb` passed Claude CLI (`/tmp/shared-triage-native-Qa6oBi/claude-7`) and Codex CLI generic intake (`codex-8`) against the same plugin hash `567d1ed810e77d60feba42fa30e56241001664dc180d7ca9cd1da03d0a8cfd62`. Both installed the native marketplace payload, read engineering pages and canonical triage, passed all eight actual-session probes, and saved valid external reports. The reports retain resolved/partial scope and exclude protected/index work; no actions executed. Claude also verifies the exclusively reachable restricted tool set. This is synthetic-fixture proof, not the private live trial. Sanitized records are in `tests/vh-adlc/evidence/triage/native-observations.json`.
      History cleanup: the owner approved rewriting only unpublished feature history. Cleanup removed the private status-report blob from every commit reachable through that feature suffix, preserved the final source tree and index bytes, and left published main refs unchanged. The current fixture is synthetic. See `tests/vh-adlc/evidence/triage/history-cleanup.json` for the old/new commit mapping. Original observed native commit IDs are retained with verified rewritten equivalents; they are not fabricated reruns. No code push or force push occurred, and publication still needs its separate authority.
      Native follow-up: Codex exposed MCP tools but its second run was denied by the noninteractive approval policy. The driver now declares only four bounded read-only adapter tools and scopes their automatic approval to that server; the next actual invocation must prove this works. Input manifests and snapshots are line-paginated JSON rather than single huge lines.
- [ ] T14a `collect.ts`, `github.ts`, `execute.ts` and triage tests - reproduce and fix R-13 F-01/F-08: collect verified paginated label vocabulary, gate missing labels on exact approved completed creation, and prevent implicit vocabulary creation during issue creation or label assignment (AC-03, AC-06).
- [ ] T14b `report.ts`, `execute.ts` and triage tests - reproduce and fix R-13 F-02/F-04: rebuild action eligibility from the original observations/inventory, require an open retained canonical issue, block duplicate chains/cycles and revalidate the canonical before closure (AC-03, AC-04, AC-06).
- [ ] T14c `github.ts`, `execute.ts` and triage tests - reproduce and fix R-13 F-05: bind the approved actor across retries and attribute action receipts; external changes are blocked rather than credited to this batch (AC-06).
- [ ] T14d `collect.ts`, `github.ts` and collection tests - reproduce and fix R-13 F-06: detect unstable offset pagination without silent omissions or inferred removals (AC-03, AC-05).
- [ ] T14e settings, report/execution and Stackweaver migration paths - reproduce and fix R-13 F-07 with data-driven local workstream sources, enforced despite omitted agent ownership fields (AC-02, AC-06, AC-09).
- [ ] T14f report/native evidence and triage tests - reproduce and fix R-13 F-03: require distinct adversarial verification and observed provenance for executable closure evidence; unproven claims remain non-executable (AC-04).
- [ ] T15 `tests/vh-adlc/evidence/triage/` and this document's evidence - actual Codex/Claude CLI invocation, existing-route regressions, frozen legacy parity, bounded live read-only trial and rollback/reapply have observed pass results tied to exact component/adapter commits; retain failures and unavailable proof honestly (AC-01, AC-03, AC-07, AC-08, AC-09).
      Live collection: the first run failed closed on valid numeric/cursor GitHub pagination and legacy metadata. Focused regressions reproduced both failures and passed after fixes (`/tmp/shared-triage-live-collection-regressions.log`). The retry collected 10 issue pages, 6 PR pages, all three selected comment collections and 380 plans with complete coverage, preserving the complete checkout and index (`/tmp/shared-triage-live-fQqFQh`, adapter `4532b929286c1af9df5cfac3b37fddec6004a4a9`). This is collection proof only; analysis, parity and native trials remain open.
      Evidence hardening: focused red/green tests cover legacy prose-only close reports, merged closing references bound to the current issue, verified-cleared prerequisites, externally preapplied gated status, source changes on unapproved plan paths, owned-patch retry and GitHub account changes immediately before effects. The 42 report/execution tests pass (`/tmp/shared-triage-binding-suite.log`). Full plugin suite: 309 pass, 1104 assertions (`/tmp/shared-triage-binding-full-suite.log`); both CLI and native-driver builds pass. No remote effects were used for these tests.
      Additional local checks: the synthetic cross-mode migration matrix passes 40 assertions, including exclusions, drift, report/history placement and untouched index; it is a deterministic retained-rule check, not native legacy/shared parity. Gate-line regressions were observed failing, then passed: structured failed gates block status sync, shown commit bodies retain the binary line, and changed gate metadata blocks the approved patch before its dependent commit. Sanitized observation records live at `tests/vh-adlc/evidence/triage/`; raw private inputs and client profiles are excluded.
      External test boundaries: automatic approval review rejected sending the full private Stackweaver input set to Claude and rejected sending selected private migration files to Copilot. The owner subsequently approved both exact destinations and payloads on 2026-10-24, retaining Stackweaver-local settings, entry points, compatibility rules and migration instructions. Those trials may now proceed. The full local suite first hit two existing five-second lifecycle-fixture timeouts during concurrent host load; those failures are retained at `/tmp/shared-triage-final-local-suite.log`, and the serial retry passed all 312 tests, 1153 assertions (`/tmp/shared-triage-final-local-suite-retry.log`). Both CLI and native-driver builds passed.
      Pagination edge regressions also failed then passed: repeated filtered PR records now invalidate coverage, and validated cursor-only Link URLs are retained without requiring a physical page parameter (`/tmp/shared-triage-pagination-edge-red.log`, `/tmp/shared-triage-pagination-edge-green.log`).
      Final local pair: component `f1f1810fc24f2f6e586676a931cca30d7c78cddb`, adapter `4532b929286c1af9df5cfac3b37fddec6004a4a9`. The exact-checkout migration test passed 5 tests/74 assertions (`/tmp/shared-triage-paired-migration-final.log`). Rollback, reapplication, byte-preserved index and normal report/index placement passed in disposable clone `/tmp/stack-triage-rehearsal-6a36p5`; original adapter remains clean. See `tests/vh-adlc/evidence/triage/rollback-observation.json`. The remaining T15 obligations are private live analysis, native frozen-legacy/shared parity and compatibility-command invocation; none is replaced by the synthetic matrix.
- [ ] T16 `tests/vh-adlc/evidence/triage/` and this document's evidence - required Codex desktop and VS Code Local discovery/read-only invocation are observed; full relevant checks and a fresh independent committed implementation review establish every criterion or an owner-approved durable residual before the complete gate (AC-01 through AC-09).

      Independent R-13 returned from Copilot Opus 5.5 at the committed pair. Its records are stored verbatim below. No criterion was independently verified; execute the corrective tasks and repeat the review with direct native/rollback proof before completion.
      GUI availability check: this host exposes neither DISPLAY nor WAYLAND_DISPLAY, and the connected document-control service reports no sessions. Codex desktop and VS Code Local native invocation remain unverified; CLI proof does not satisfy them. No GUI residual has been approved.

## Open Questions

None. The owner accepted the R-3 and R-4 choices and accepted R-9 with documentation publication
on 2026-10-24. R-9 trial-proof obligations are now folded into the normative Design and Test Plan,
not kept as a separate decision source. The only additional coverage change follows main's relocated
workflow, compatibility and installation guides. The owner accepted that refreshed baseline after clean R-12 on 2026-10-24; existing documentation
publication authority remains in force.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-23 | R-1 | spec | `b12baa57c5ca379474b97873e5aaeb43e5044098` | unknown | procedural | Blocking closure-evidence conflict and missing protected-umbrella parity exception; model identity not attested. |
| 2026-10-23 | R-2 | spec | `3a874470e499590afde434f165feaf19ca4d1e54` | unknown | procedural | No findings; model identity not attested. |
| 2026-10-23 | R-2 | spec | `3a874470e499590afde434f165feaf19ca4d1e54` | n/a | n/a | accepted by owner |
| 2026-10-23 | R-3 | spec | `b74f650edfbd88244b058d824b31a5d9043f4c19` | claude-opus-5.5 | procedural | Copilot bounded-packet review: ten findings; decisions and source/gate verification follow-up required. |
| 2026-10-23 | R-4 | spec | `1e159d65aa8cbde4525de59a27439129a0efeaea` | claude-opus-5.5 | procedural | Five findings: delivery boundary, trial output, legacy report/write details, lifecycle regression coverage and a verdict-wording nit. |
| 2026-10-24 | R-5 | spec | `61c94b53b41e831e5b37d8e24ccbc9058ea16778` | claude-opus-5.5 | procedural | Clarify approved trial override/history, authority alignment, retained plan commits and durable handoff paths; complete the source list. |
| 2026-10-24 | R-6 | spec | `ea38a917ca8e804253e2f53fa682d67cebe1a339` | claude-opus-5.5 | procedural | Clarify comparable report history, no-settings output, read-only trial attribution and mandatory Claude model metadata. |
| 2026-10-24 | R-7 | spec | `2ad7eebfb05723f8f4bf54b755f543abda6c71cc` | claude-opus-5.5 | procedural | Protect unlisted index issues, require trial confinement and keep ranking limited to ranking modes. |
| 2026-10-24 | R-8 | spec | `838914d60955ec42280a2db6bc323c9d7eaef7c5` | claude-opus-5.5 | procedural | Remove the alternate-credential bypass in trial confinement and define its source-input boundary. |
| 2026-10-24 | R-9 | spec | `5a4547da08407737a550a1e042a31b771d0bc226` | claude-opus-5.5 | procedural | No blocking findings; three nonblocking recommendations on trial-environment probes, complete source/history input and collection metadata are implementation proof work under AC-03/AC-07. |
| 2026-10-24 | R-9 | spec | `5a4547da08407737a550a1e042a31b771d0bc226` | n/a | n/a | accepted by owner |
| 2026-10-24 | R-10 | spec | `33b8070d2a2af192b00306bfb84b765e907f1cb5` | claude-opus-5.5 | procedural | Refresh after main documentation relocation: fold trial proof into the normative baseline, check installation/index coverage and correct the R-9 severity summary. |
| 2026-10-24 | R-11 | spec | `1f769d91e7d662885b6854de3260b618f0101e35` | claude-opus-5.5 | procedural | One factual nit: make the trial probe pass condition explicit in AC-07 proof. |
| 2026-10-24 | R-12 | spec | `68d2f1eabe959be346082859ad7ac105cdb23300` | claude-opus-5.5 | procedural | No findings after the documentation relocation and normative trial-proof refresh. |
| 2026-10-24 | R-12 | spec | `68d2f1eabe959be346082859ad7ac105cdb23300` | n/a | n/a | accepted by owner |
| 2026-10-24 | R-13 | implementation | `3dab874f7372b3cf8c35be12c4aa483084e9a7f2` | claude-opus-5.5 | procedural | One blocking execution finding and eight further findings; no criterion independently verified. |

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

### R-4

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Stackweaver migration and rollback; Acceptance Criteria / AC-07
EVIDENCE: The goal at docs/specs/shared-triage.md:5 is to "migrate Stackweaver". Lines 206-209 install an unpublished local commit, and lines 223-225 limit Stackweaver work to local commits on `feat/shared-triage-migration` in an isolated checkout. Lines 231-232 keep pushes, PRs and merges under separate authority, and lines 234-236 call the migration complete after local parity, invocation, trial and rollback proof. The feature-documents standard at line 61 makes `complete` terminal for its scope, and authority.md:19-20 lets ship push only the vh-adlc branch. So when every box is ticked, Stackweaver main still runs the legacy playbook, and the paired adapter is on an unpublished branch. No step says who publishes it, or in what order relative to the vh-adlc release. If the adapter merges before the marketplace serves the triage skill, the retired prose leaves Stackweaver with only the missing-plugin blocker from line 235.
PROPOSAL: Say what state of Stackweaver main counts as migrated at `complete`. Name the follow-up and its order: publish vh-adlc first, then publish the Stackweaver branch under separate approval. Otherwise, narrow the goal and AC-07 to a reviewed migration branch that is ready to publish.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Collection, verification and report; Design / Stackweaver migration and rollback; Test Plan / AC-07, AC-09
EVIDENCE: docs/specs/shared-triage.md:147 writes the report to the configured repository documentation location. Line 196-197 keeps Stackweaver's existing status-report location, which is `docs/internal/status/` with a generated index (Stackweaver agents/issue-triage.md:197-205). The live trial at line 215-216 freezes unrelated file snapshots. The AC-09 proof at line 274 diffs only the declared migration paths, and line 52-54 lists those paths without `docs/internal/status/`. The document does not say where the live trial's report goes, or whether it is committed. So that run either breaks the frozen snapshot and the AC-09 path set, or uses a destination that the spec never names.
PROPOSAL: Name the live trial's report destination and commit state, for example an uncommitted report outside the Stackweaver checkout or an explicitly allowed path. Make the AC-07 and AC-09 snapshot comparisons account for it.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Collection, verification and report; Design / Owner-approved execution; Design / Stackweaver migration and rollback step 3
EVIDENCE: Legacy Stackweaver agents/issue-triage.md:201-203 puts the counts and a diff against the previous triage report in the report. Line 211 commits the report with `[skip ci]`. Lines 224-225 create approved labels with a description and color. Lines 233-234 write a new issue's URL back into the plan's `issue:` frontmatter. docs/specs/shared-triage.md:147-149 does not keep counts or the run-over-run diff. Line 162-165 binds label names but not the description and color of a new label. Lines 175 and 181-184 cover no `issue:` write-back, and line 150-151 leaves report commit behavior undecided. The parity at line 201 compares only scope, evidence, exclusions, ranking and proposed actions. Lines 202-205 record no other intentional difference, so these regressions would pass parity unrecorded.
PROPOSAL: For each of these legacy behaviors, either keep it, with exact-payload approval where it writes, or list it as a recorded intentional difference. Add the report contents and the follow-up writes to the parity comparison.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Scope; Design / Canonical workflow and harness boundary; Acceptance Criteria / AC-01; Test Plan / AC-01
EVIDENCE: docs/specs/shared-triage.md:49 and :80-82 expose triage through the existing lifecycle intake and change `references/lifecycle.md`. Line 96 says the existing gates and bounded maintenance remain intact. AC-01 at line 252 and its proof at line 266 cover only native discovery and invocation. No criterion or Test Plan row checks that a generic request routes to triage. None checks that existing intake routes still behave as before after the change. README.md:44-48 rests lifecycle support on 57 trials of one package, and README.md:29 and :79 state "seven skills". README.md is in `covers`, but no criterion says how those claims change when an eighth skill is added.
PROPOSAL: Add a criterion or extend AC-01 to require that generic intake routes a backlog-triage request to the operation, with regression cases for existing intake and maintenance routes. Require the README skill count and support claims to match the new package.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria / AC-01
EVIDENCE: AC-01 at docs/specs/shared-triage.md:252 ends "an unavailable required invocation leaves this criterion unverified". The pinned feature-documents standard at lines 84 and 175-185 requires criteria to state an end state. It defines verdicts as `met`, `not met`, `untested` or `not verified`, and "unverified" is not one of them. Design line 244-245 already states the consequence for completion.
PROPOSAL: End AC-01 at its end state, and keep the unavailable-client rule in Design. Alternatively, use the standard verdict term `not verified`.

### R-5

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Collection, verification and report; Design / Repository settings; Design / Stackweaver migration and rollback step 5; Test Plan / AC-05, AC-07
EVIDENCE: docs/specs/shared-triage.md:149 writes the report to the configured repository documentation location, and lines 108-110 make the report directory a repository setting. Lines 227-228 require the live trial to write its report to an explicitly selected temporary directory outside Stackweaver while the checkout stays unchanged. No Design text defines a per-run destination override that leaves `.vh-adlc/triage.json` unchanged. Lines 152-153 compare each run with the previous report, and the first run says no previous report exists. Legacy agents/issue-triage.md:202-203 diffs against the previous report in `docs/internal/status/`. The document does not say whether an externally written run reads previous reports from the configured location. If it does not, the live trial reports a false first run and does not exercise the retained count and diff behavior. No AC-05 or AC-07 proof checks the override or this diff source.
PROPOSAL: Define a run-level report destination that does not edit settings, and state that previous-report comparison still reads the configured history location. Add the override and the previous-report source to the AC-05 or AC-07 proof.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Owner-approved execution; Design / Canonical workflow and harness boundary; Acceptance Criteria / AC-01, AC-06
EVIDENCE: plugins/vh-adlc/references/authority.md:10-22 is the shared authority table. It has no row for issue comments, labels, closures, label creation or local plan-status and `issue:` patches on arbitrary issues. Line 19 ties updating a linked issue to an explicit ship request. Lines 24-28 say a lifecycle-selected operation inherits only the underlying task's authority. references/lifecycle.md:49 routes live operations to an explicit request and a supported procedure. docs/specs/shared-triage.md:166-195 makes approval of an exact batch the authority for these writes, but Design lines 81-84 change only lifecycle intake and the new skill, and never says that authority.md gains a matching row. A triage comment or closure on a feature's linked issue therefore reads differently under authority.md:19 than under the spec. No AC-01 or AC-06 proof checks that the shared authority reference and lifecycle routing agree with the triage approval model.
PROPOSAL: Require authority.md, and the lifecycle row where needed, to state the authority for approved triage tracker writes and local plan patches, consistent with lines 166-195. Add a check to AC-01 or AC-06 that intake-selected triage applies that authority and nothing wider.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Owner-approved execution; Design / Stackweaver migration and rollback step 3; Test Plan / AC-06, AC-07
EVIDENCE: Legacy Stackweaver agents/issue-triage.md:35-36 and :229-232 commit plan-status syncs in one conventional commit with `[skip ci]`, and :233-234 writes the new issue URL into plan frontmatter. docs/specs/shared-triage.md:155-156 defines commit behavior only for reports. Lines 185-193 approve exact plan-status and `issue:` backfill patches but do not say whether those local changes are committed, left uncommitted, or committed only on request. Lines 212-216 record the report commit change as an intentional difference but say nothing about these plan commits. So the parity result can differ from legacy on plan commits without recording it, and AC-06 has no observable commit state to check.
PROPOSAL: State the commit behavior for approved plan-status and backfill patches, including commit message and skip-CI handling. Either keep the legacy commit with exact approval or add the change to the recorded intentional differences, and assert the resulting Git state in the AC-06 proof.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Scope; Design / Stackweaver migration and rollback; Acceptance Criteria / AC-07, AC-08; Test Plan / AC-09
EVIDENCE: docs/specs/shared-triage.md:234-235 requires a documented way to restore the triage entry points, AC-08 at line 283 depends on that documentation, and lines 255-260 and the AC-07 proof at line 296 require an inspected ordered publication handoff. Neither artifact has a named location. Lines 54-56 limit Stackweaver changes to five paths, and the AC-09 proof at line 298 diffs only those paths and the shared triage paths. A rollback guide or handoff written elsewhere in Stackweaver would fail AC-09, and one kept only in the session report would not survive for the later adoption step.
PROPOSAL: Name where the rollback procedure and the publication handoff are stored, for example this document or one of the declared migration paths, so that AC-08 and AC-09 check a fixed path.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Sources
EVIDENCE: The pinned feature-documents standard at line 76 says Sources lists every external page read, each with the claim it supports. docs/specs/shared-triage.md:34 cites Stackweaver `AGENTS.md:12` and `:23`. Lines 71-74 rely on Stackweaver `agents/maintenance.md`, `.claude/commands/maintenance.md` (the wrapper conflict, verified at :31-33 against agents/maintenance.md:39-47), `agents/codebase-audit.md` (auto-merge, :241-244), the four docs workflows, `agents/tfe-compat.md` and `agents/provider-fork.md`. Sources at lines 452-457 lists only the triage playbook, the triage command, the 9b68b56 lifecycle page and the feature-documents standard.
PROPOSAL: Add the other Stackweaver pages read at 7c3790f to Sources, each with the claim it supports.

### R-6

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Collection, verification and report; Acceptance Criteria / AC-05; Test Plan / AC-05
EVIDENCE: AC-05 at docs/specs/shared-triage.md:304 requires every mode to keep previous runs with measured counts and run-over-run differences. Lines 163-164 compare a run with "the previous report", and lines 170-173 let next, close, stale and explicit-ID runs cover only a subset. Coverage can also be incomplete (lines 134-141). The spec never says which earlier report a run is compared with, or how a different scope or incomplete coverage limits the diff. If a `#N` or `next` run is compared with a full sweep, every issue it did not cover shows up as removed. A sweep compared with an earlier targeted report shows them as added. Legacy agents/issue-triage.md:197-203 saved and diffed sweep reports, and :251-255 gave `next` and `close` no saved report. The intentional differences at lines 233-236 do not record that change. The AC-05 proof at line 318 checks only that counts and differences match snapshots, so a fixture built on this mismatch could still pass.
PROPOSAL: Say which previous report each run is compared with, for example the latest report of the same mode and scope, or only the issues both runs covered. Label issues outside that overlap as not compared rather than added or removed. Add mixed-scope and incomplete-coverage diff fixtures to the AC-05 proof. Either keep the legacy rule of no saved report for `next` and `close`, or record the change as an intentional difference.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Repository settings; Acceptance Criteria / AC-02; Test Plan / AC-02
EVIDENCE: docs/specs/shared-triage.md:116-117 allows a repository without settings to use documented conservative defaults, and lists only milestone, tracker ID and plan-metadata defaults. The report directory is a setting (line 113). Line 160 writes to the configured location. Lines 127-130 read history from the configured directory and report a missing source as unavailable. With no settings, the spec defines no report destination and no history location. Every such run would then either report history as unavailable or need an undefined default. AC-02 at line 301 and its proof at line 315 test only generic and Stackweaver config fixtures and malformed cases. No case runs with no settings file.
PROPOSAL: State the defaults for the report destination and history source when no settings exist, and whether such a run can ever report a first run. Add a no-settings fixture to the AC-02 proof covering report placement, history and absent plan metadata.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Stackweaver migration and rollback step 5; Acceptance Criteria / AC-07; Test Plan / AC-07
EVIDENCE: docs/specs/shared-triage.md:252-253 freezes tracker snapshots and requires no GitHub writes during the live trial. The AC-07 proof at line 320 requires unchanged complete tracker snapshots. The live Stackweaver tracker also has writers outside the trial. Stackweaver agents/issue-triage.md:44-45 says #332 is machine-managed by Renovate and reopens itself, and :48-49 lists issues authored by renovate, dependabot and stackweaver-release-bot. Owner or bot activity during the trial window changes the snapshot with no write from triage. The proof then fails for a reason that is not the criterion, or a reviewer excuses the change by hand and does not prove the trial made no write.
PROPOSAL: Make the live-trial proof attribute writes to the trial itself. For example, run it through a write-denying or recording adapter, or compare issue timeline events by the trial's account over the trial window. Keep the whole-tracker snapshot as supporting evidence only, and record unrelated changes by other actors.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design / Stackweaver migration and rollback step 4
EVIDENCE: docs/specs/shared-triage.md:244-245 says to keep the host-specific model preference in the Claude adapter "if desired", which allows removing it. Stackweaver .claude/commands/triage.md:3 sets `model: fable`. Stackweaver CLAUDE.md:192 says each command's `model:` field must not be removed, and :194 places `/triage` on Fable. Line 115 of the spec keeps repository instructions authoritative only for verification commands and public interfaces.
PROPOSAL: State that the `/triage` compatibility command keeps its existing `model:` frontmatter under Stackweaver's rules. Keep the point that this preference does not become a shared requirement.

### R-7

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Repository settings; Design / Collection, verification and report step 2; Design / Stackweaver migration and rollback steps 1-3; Test Plan / AC-02, AC-07
EVIDENCE: Stackweaver agents/issue-triage.md:50-53 protects "Milestone trackers and umbrella issues" by kind, giving #395 and #13 only as examples ("e.g."). It says they "are closed only when the user says the milestone is done, never because their sub-items shipped". docs/specs/shared-triage.md:113 lets settings carry only "protected issue/tracker IDs", and line 117 forbids guessed tracker IDs. Lines 121-122 leave every mapping empty when no settings file exists. Line 160 marks an issue resolved when its requested behavior is present and reachable. Suppose a new umbrella issue is opened after the adapter is written, or a repository has no settings file. That issue is not in the ID list, every checklist item has shipped, and the shared flow proposes it as an evidence-backed close candidate. Legacy triage would never propose that closure. The parity fixtures at lines 243-244 use known umbrellas, so they pass. The intentional differences at lines 248-253 do not record this change.
PROPOSAL: Let settings and the conservative defaults classify protected index or umbrella issues by a declared rule, such as a label, milestone or tracker pattern, in addition to explicit IDs. Alternatively, never propose closing an index issue only because its sub-items shipped. Add a parity fixture with an unlisted umbrella whose sub-items have all shipped.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Stackweaver migration and rollback step 5; Acceptance Criteria / AC-07; Test Plan / AC-07
EVIDENCE: docs/specs/shared-triage.md:271-273 proves the live trial wrote nothing because a write-denying, recording GitHub adapter shows only reads. Lines 273-274 make whole-tracker snapshots supporting context only and do not count owner or bot changes as trial actions. Line 265 runs the trial with "existing account access", which is the owner's GitHub identity. Lines 90-92 let the operation use any available CLI or connector adapter. The spec never requires the adapter to be the only GitHub path the trial agent can reach. A host agent that has a shell and the owner's `gh` credentials can post a comment or label directly. The adapter trace then shows only reads, and the write appears as a concurrent owner change, which is excluded. AC-07 passes even though the trial wrote to the tracker.
PROPOSAL: Require the live trial to run with credentials that cannot write, for example a read-only token, or to confine every GitHub call to the denying adapter with no other credential reachable. Record that confinement in the AC-07 evidence. Alternatively, attribute tracker events to a trial-specific identity that is distinct from the owner.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria / AC-05; Design / Collection, verification and report; Design / Stackweaver migration and rollback step 3
EVIDENCE: AC-05 at docs/specs/shared-triage.md:326 says "Every mode ... ranks verified prerequisites before dependents with reasons". Line 185 preserves the legacy modes. Stackweaver agents/issue-triage.md:253-255 defines `close` with "No ranking" and `#N` as deep verification of the named issues only. The intentional differences at lines 248-253 do not say that close and explicit-issue runs now rank. The AC-05 proof at line 340 says ranking "differ[s] correctly by mode", which conflicts with the criterion's wording.
PROPOSAL: Limit the ranking clause in AC-05 to the modes that rank, such as sweep, next and stale. Alternatively, record ranking in close and explicit-issue runs as an intentional difference.

### R-8

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Stackweaver migration and rollback step 5; Acceptance Criteria / AC-07; Test Plan / AC-07
EVIDENCE: docs/specs/shared-triage.md:282-283 says confinement "must make the adapter the only live GitHub path: either use credentials that cannot write, or collect through fixed GET-only calls outside the analysis agent". Only the second route must have "no GitHub credentials, network/shell mutation path or connected write tool reachable" (lines 283-286). The first route only requires that the adapter's credentials cannot write. It does not require other write-capable credentials or tools to be unreachable. AC-07 at line 343 requires an "exclusively reachable read-only GitHub path", and the AC-07 proof at line 357 accepts "verified read-only credentials or isolation". Lines 280-282 attribute concurrent owner changes separately and do not count them as trial actions. Counterexample: the adapter uses an existing read-only token, while the owner's write-capable `gh` keyring login or a connected GitHub write tool can still be reached from the agent's shell (authority.md:37-39 prefers command-scoped credentials but does not remove others). The agent posts a comment with `gh issue comment`. The adapter trace shows only reads, the comment is attributed to the owner as a concurrent change, and AC-07 passes. This is the R-7 F-02 gap again, now on the first route. The spec also does not say where a negative mutation probe for the first route runs. A probe against the live Stackweaver tracker would write to it if the credential can in fact write.
PROPOSAL: Under the read-only-credential route, also require that no write-capable GitHub credential, connector or other write path is reachable from the trial, and record that check together with the adapter trace. Verify the credential's read-only capability without risking a live write, for example by inspecting its permissions or probing only a disposable fixture repository.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design / Stackweaver migration and rollback step 5; Test Plan / AC-07
EVIDENCE: docs/specs/shared-triage.md:285 requires "a non-secret outside-packet canary", and the AC-07 proof at line 357 requires "denied mutation/outside-packet probes". The document never defines "packet". The second route at line 283-284 analyzes "the snapshot", but resolved verdicts also need the Stackweaver source at HEAD (lines 165-166). So the boundary that the canary must sit outside of cannot be determined, and a reviewer cannot tell what a passing probe shows.
PROPOSAL: Replace "packet" with the defined input set for the analysis agent, such as the collected tracker snapshot plus the Stackweaver checkout. State that the canary sits outside that set and must not be readable.

### R-9

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Stackweaver migration and rollback step 5; Acceptance Criteria / AC-07; Test Plan / AC-07
EVIDENCE: docs/specs/shared-triage.md:286-288 requires that no GitHub credential, connected write tool or shell/network mutation path is reachable from the analysis agent. Lines 289-291 prove that boundary with two checks only. The first is a non-secret canary outside the declared input set, which tests file reads. The second is a mutation probe against "the offline denying adapter or an authorized disposable fixture". The AC-07 proof at line 363 accepts "denied outside-input-set and offline mutation probes". A probe sent to the offline denying adapter tests the adapter. It never tests the agent's own environment. Counterexample: the agent sandbox blocks file reads outside the input set, so the canary is unreadable. The host still passes `GH_TOKEN` in the agent's environment, or leaves a git credential helper, keyring or agent socket reachable, and network egress to api.github.com stays open. The canary is denied, the offline probe is denied, the adapter trace shows only reads, and line 292 forbids only relying on token metadata. Every AC-07 check passes, yet the agent can still write to the live tracker with `curl` or `gh`. Lines 280-281 then attribute any such write to a concurrent owner change.
PROPOSAL: Require the negative probes to run from inside the analysis agent's actual environment and cover every route the requirement names: environment variables, credential helpers, keyrings and sockets, connected tools, and direct GitHub network egress. A write attempt may target only the offline adapter or an authorized disposable fixture. Make the AC-07 proof name these probes instead of accepting the offline adapter probe alone.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Stackweaver migration and rollback step 5; Design / Collection, verification and report steps 3 and 5; Test Plan / AC-07
EVIDENCE: docs/specs/shared-triage.md:284-286 limits the analysis input to "the source files required for the bounded issue scope at the fixed Stackweaver HEAD" and "relevant configured report history". Someone chooses that set before the analysis runs. Line 170 requires searched scope for absence. Lines 166-167 require verified removal or supersession for an obsolete closure. Lines 178-179 have the operation itself select the latest report with the same repository, mode and scope. Legacy Stackweaver agents/issue-triage.md:127-130 bases `open` and `obsolete` on empty searches and removal. Lines :145-146 warn that the repository has two ansible-runner paths and a `distribution/**` mirror. Counterexample: an issue's code moved to a file outside the preselected subset. The agent's search finds nothing, so it records verified removal and proposes an obsolete close. Similarly, a harness that supplies one chosen earlier report as the relevant history decides which report the diff uses, and the operation's own selection rule never runs. The trial still passes AC-07, because AC-07 checks only for writes, the checkout and report placement.
PROPOSAL: Define the trial input as the complete Stackweaver source tree at the fixed HEAD, read-only and without credentials or host configuration, plus the whole configured report-history directory. Alternatively, require the report to treat any absence or removal claim outside the declared source set as unverified, and to state that limit in its searched scope.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design / Stackweaver migration and rollback step 5; Design / Canonical workflow and harness boundary; Test Plan / AC-07
EVIDENCE: docs/specs/shared-triage.md:282-286 has a trusted collector make "fixed GET-only calls" and give the agent a tracker snapshot, recorded by path and hash. Lines 90-91 require adapters with equivalent completeness and error behavior. Lines 144-151 make a missing page, permission error or budget limit explicit incomplete coverage, and that blocks every closure. The live trial at line 272 "checks report scope". Nothing requires the collector to record pagination completeness and errors in the snapshot, or requires the operation to read that record. A collector that silently stops after a fixed number of pages produces a snapshot that the agent cannot tell apart from a full one. The trial report then claims a complete sweep, and the AC-07 proof at line 363 does not check this.
PROPOSAL: Require the collector to record, for each collection, whether every page was fetched and any errors, and include that record in the hashed input set. Require the operation to apply the existing incomplete-coverage rules to it, and add this check to the AC-07 proof.

### R-10

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Open Questions; Design / Stackweaver migration and rollback step 5; Test Plan / AC-03, AC-07
EVIDENCE: The way R-9 was resolved now contradicts the normative baseline. docs/specs/shared-triage.md:394-399, in Open Questions, says implementation "must" test the analysis environment's credential, helper, keyring, socket, tool and egress routes. It also says implementation must provide "the complete canonical source and configured history" and keep per-collection pagination and error metadata. The normative Design still says something different. Lines 290-292 limit the input set to "the source files required for the bounded issue scope" and "relevant configured report history". Lines 296-298 still accept a mutation probe "against the offline denying adapter". The AC-07 proof at line 370 still names only "denied outside-input-set and offline mutation probes", and the AC-03 proof at line 366 says nothing about collector metadata. The pinned standard at feature-documents.md:70 makes only Scope, Design, Acceptance Criteria, Test Plan and `covers` normative. Line 135 says an answered question is folded into the document and removed. So the R-9 commitments sit outside the baseline that `fresh` tracks and that tasks and the implementation review check. Counterexample: tasks are written from the AC-07 proof row and Design step 5. The trial gives the agent a preselected source subset and runs only the offline adapter probe. Every Test Plan proof passes, and changing or deleting the Open Questions paragraph never makes a review stale. This applies decisions that were already made. It needs no new owner policy.
PROPOSAL: Move the three R-9 proof obligations into Design step 5 and the AC-03 and AC-07 Test Plan rows. Replace "source files required for the bounded issue scope" with the complete canonical source and configured history directory. Then reduce the Open Questions paragraph to a pointer.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Scope; frontmatter `covers`; Acceptance Criteria / AC-01; Test Plan / AC-01
EVIDENCE: Lines 56-59 require the feature's public operation and support claims to agree across the README and its linked guides. AC-01 at line 350 and its proof at line 364 check only the README and the workflow and compatibility guides. `covers` at lines 9-11 lists only those three documentation paths. docs/user-guides/workflows.md:34-35 sends readers to the installation guide for client-specific invocation syntax ("Slash syntax differs between clients; see installation"). README.md:56-57 links that guide for desktop and VS Code instructions, and CONTRIBUTING.md:58-59 makes it the home for installation steps. A new operation needs an invocation form on each of the four required clients. The packet does not export docs/get-started/installation.md or docs/README.md, so I could not check whether they list operations. If they do, the triage operation stays missing from them, the AC-01 proof does not catch it, and their changes fall outside `covers`.
PROPOSAL: Check whether docs/get-started/installation.md, and the docs/README.md index, list operations or their invocation names. If they do, add them to `covers` and to the AC-01 proof. If they do not, record that they need no change.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Review Log
EVIDENCE: The R-9 row at docs/specs/shared-triage.md:417 summarizes "three should-fix recommendations". The stored R-9 records show F-01 and F-02 as `SEVERITY: should-fix`, and F-03 (line 673) as `SEVERITY: nit`.
PROPOSAL: Change the outcome to "two should-fix recommendations and one nit", or to "three nonblocking recommendations".

### R-11

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Test Plan / AC-07
EVIDENCE: The pinned feature-documents standard at line 105 requires each Proof to name "a test, a scenario with a pass condition, or a written manual procedure". At 5a4547d the AC-07 proof required "denied outside-input-set and offline mutation probes". That row now reads "probes from the actual analysis environment covering file/environment/helper/keyring/socket/tool/direct-egress routes with mutation attempts confined to offline/disposable targets" (docs/specs/shared-triage.md:381, diff r11-diff.txt:88-89). It says where probes run and what they target, but it no longer states that each probe must be denied or find nothing reachable. Design step 5 (lines 299-306) implies that pass condition through "No GitHub credential ... is reachable", "negative probes" and "Verify the actual enforced boundary". Read alone, the Test Plan row passes when the probes merely run and are recorded.
PROPOSAL: Restore the pass condition in the AC-07 proof. For example: every probe from the analysis environment finds no readable outside-input canary, no credential in the environment or a helper, keyring or socket, no connected write tool and no direct GitHub egress, and each mutation attempt is denied by the offline adapter or disposable fixture.

### R-12

NO FINDINGS

### R-13


CRITERION: AC-01 The shared triage operation is discoverable and invokes the same canonical procedure through Codex CLI, Claude CLI, Codex desktop and VS Code Local without a Claude-only dependency; generic intake routes backlog triage to it, preserves existing intake/maintenance routes, and the README and linked workflow/compatibility/installation guides accurately state the expanded operation set and tested support.
VERDICT: not verified
EVIDENCE: proof.sh (no arguments) at component 3dab874f7372b3cf8c35be12c4aa483084e9a7f2 with tree clean: bun test tests/vh-adlc exited 0 with 314 pass, including discovery.test.ts (eight skills, lifecycle row, guide text). Those are structural text checks: discovery.test.ts:19-26 only checks that route rows exist, and :36-44 only checks for phrases. I observed no native invocation. tests/vh-adlc/evidence/triage/native-observations.json records Claude and Codex CLI runs at f1f1810 (rewritten to 2cfcb49), not at the reviewed component, and this review did not run them. No Codex desktop or VS Code Local discovery or invocation is recorded (shared-triage.md:444). docs/reference/compatibility.md and docs/get-started/installation.md are not in the packet, so I could not inspect them.

CRITERION: AC-02 Generic and Stackweaver settings yield repository-correct scope, protected-work exclusions including new unlisted index issues, plan metadata, ranking and report placement without Stackweaver constants in shared behavior.
VERDICT: not verified
EVIDENCE: proof.sh at 3dab874 and adapter 4532b92: settings.test.ts (23), the report ownership, ranking and index tests, and migration.test.ts "project settings retain source, priority, plan, history and hard ownership behavior" all pass. A grep of plugins/ for Stackweaver IDs, mirror, milestone, bot and model constants found none. However, stackweaver/.vh-adlc/triage.json:14 sets owned_labels to [] and encodes no other-workstream ownership. The RBAC, TFE and audit exclusions exist only as prose in stackweaver/agents/issue-triage.md:18-20 and depend on an agent-supplied owned_by (see F-07). The live Stackweaver analysis that would show repository-correct output is still pending and I did not observe it.

CRITERION: AC-03 Collection includes every requested page and reports incomplete or denied coverage explicitly; any incomplete required collection or verification input blocks every executable closure in that report, and partial data never establishes exhaustive triage.
VERDICT: untested
EVIDENCE: proof.sh: collection.test.ts (14) and report.test.ts pass for page caps, failed pages, repeated cursors and IDs, budgets and report-wide closure blocking. No check covers offset-page shift during collection. In that case an item is silently skipped while coverage stays complete (F-06). No check covers planBatch accepting report-supplied completeness and close_executable flags without recomputing them (F-04). tests/vh-adlc/evidence/triage/live-collection.json is an author record of a trusted GET-only collection. I did not observe that run.

CRITERION: AC-04 Closure proposals have adversarially verified evidence appropriate to their reason: reachable completed behavior, removed or superseded scope, or total overlap with an identified canonical issue; partial work, stale blockers and unverified claims retain their true remaining scope.
VERDICT: untested
EVIDENCE: proof.sh: report.test.ts closure cases pass. Reading report.ts:209-213, a duplicate closure is accepted when the canonical issue is closed, and when two issues name each other as canonical. No test covers either case (F-02). In report.test.ts:86 the adversarial pass is the same evidence object as the first pass, and report.ts:51-80 accepts self-reported test exit codes and any existing file as wiring (F-03). So no adequate check establishes adversarial verification or a canonical issue that retains the work.

CRITERION: AC-05 Every mode reports its source commit, requested issue subset and collection completeness, preserves previous runs with measured counts and run-over-run differences, saves reports uncommitted unless a commit is requested, limits readiness ranking to sweep/next, where verified prerequisites precede dependents with reasons and blocked work is excluded from ready rankings, and leaves GitHub unchanged until exact actions are approved.
VERDICT: untested
EVIDENCE: proof.sh: report.test.ts and execution.test.ts pass for history selection, same-day preservation, the external output override, mode-limited ranking, blocked exclusion and zero writes before approval. Nothing implements or tests the "commit a report on request under repository rules" path. The helper's commit action accepts only plan-patch paths (execute.ts:146-149), and the only coverage is phrase checks in discovery.test.ts:33. The run-over-run removal accuracy depends on the pagination gap in F-06. I observed no native or live run that reports every mode.

CRITERION: AC-06 Execution applies only the approved targets and exact payloads after revalidation, preserves unrelated issue-body content and protected work except explicitly requested and approved umbrella checklist/closure actions, applies plan-status sync and issue-URL backfill only when specifically approved and applicable lifecycle gates pass, and resumes after partial failure without duplicate completed actions or duplicate issue creation; local plan commits contain only the approved successful patches and shown commit metadata.
VERDICT: untested
EVIDENCE: proof.sh: execution.test.ts (25) passes against recording adapters. That covers payload binding, stale source and issue checks, gate lines, commit subject, body and paths, retries, lost receipts and the packaged CLI with an offline GitHub process. execution.test.ts:127-131 approves a labels action for "ready" while the create-label action stays unapproved, and asserts that the write succeeds. Against live GitHub that write creates the unapproved label (F-01). Close, labels and checklist receipts accept effects made by another actor as completed approved actions (F-05). No owner-authorized disposable repository run was observed.

CRITERION: AC-07 The reviewed Stackweaver migration branch is ready to publish: its triage command and harness-neutral entry invoke the exact local shared revision with preserved settings, paired commits and parity proof; the live read-only trial preserves the checkout and proves through its exclusively reachable read-only GitHub path that it makes no tracker write while saving its report externally, and actual main cutover remains the ordered follow-up.
VERDICT: not verified
EVIDENCE: proof.sh: the Stackweaver HEAD equals 4532b92, the tree is clean, and the only changes from 129581f are in the allowed migration paths. migration.test.ts (5) and the adapter contract tests (2) pass. I read stackweaver/.claude/commands/triage.md (model: fable kept, forwards, no fallback) and agents/issue-triage.md. The criterion also needs native frozen legacy/shared parity, compatibility-command invocation and the bounded live read-only analysis trial with in-environment probes. T15 (shared-triage.md:434-440) records all of these as pending, and I observed none. parity.test.ts is a synthetic matrix, not native parity.

CRITERION: AC-08 The documented Stackweaver rollback restores the prior triage entry points on a disposable checkout while preserving unrelated agents, plans, Git state and runtime resources.
VERDICT: not verified
EVIDENCE: stackweaver/tests/agent-triage/rehearse.ts and README.md exist at the adapter commit, and migration.test.ts checks the handoff text. The disposable rollback and reapply rehearsal is recorded only as an author claim (tests/vh-adlc/evidence/triage/rollback-observation.json, shared-triage.md:440). proof.sh does not run it, and this review did not observe its execution.

CRITERION: AC-09 Dependency maintenance, codebase audit, documentation and domain workflows remain unchanged, with the deferred work register preserved for later scope decisions.
VERDICT: not verified
EVIDENCE: proof.sh observed `git diff --name-only 129581f..4532b92` in Stackweaver, limited to AGENTS.md, .vh-adlc/triage.json, .claude/commands/triage.md, agents/issue-triage.md and tests/agent-triage/. So the Stackweaver maintenance, audit, docs, TFE and provider-fork workflows and automation are unchanged. stackweaver/AGENTS.md:12-23 still routes those workflows locally. shared-triage.md:80-86 retains D-01 through D-05. The shared-side diff and hash comparison in the Test Plan was not observed. discovery.test.ts:19-26 only checks that route row labels exist, not that existing contracts are unchanged.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Owner-approved execution; plugins/vh-adlc/scripts/triage/execute.ts planBatch; scripts/triage/github.ts mutate; AC-06
EVIDENCE: execute.ts:134 accepts any non-empty label names for a labels action, and execute.ts:131 does the same for create. Neither checks the names against the repository's existing labels or requires an approved create-label action to come first. github.ts:167 and :172 send the names directly to POST issues/N/labels and POST issues. GitHub creates a missing label when one is added this way, using a default color and no description. references/triage.md:165 limits label actions to "existing-label additions", and Design lines 212-213 and 228-229 bind new-label descriptions and colors to approval. execution.test.ts:127-131 approves only "tag" (labels ["ready"]) and leaves "vocab" (create-label "ready") unapproved. It then asserts that the labels write executes, which on live GitHub would create the unapproved label.
PROPOSAL: Collect the label inventory, and reject at both planning and execution any labels or create entry that names a label missing from it unless an approved create-label action for that exact name comes first and has completed. Replace the test expectation with that negative case.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Collection, verification and report step 3; scripts/triage/report.ts buildReport; execute.ts planBatch and executeBatch; AC-04
EVIDENCE: report.ts:211 accepts any canonical issue found in inventory.issues or inventory.closed_issues, and only rejects a canonical equal to the issue itself. Design line 179 and references/triage.md:104 require "an identified canonical issue that retains the remaining work". Counterexample 1: #5 is marked a total duplicate of #4, which is already closed as not_planned. #5 becomes close_executable, and the remaining work is left with no open tracker. Counterexample 2: #6 is a duplicate of #7 and #7 is a duplicate of #6. Both become close candidates, and one batch can close both. executeBatch (execute.ts:216-232) rechecks only the target issue, never the canonical, so a canonical closed after approval is not detected. report.test.ts:83-90 covers only an open canonical.
PROPOSAL: Require the canonical issue to be open, outside the batch's own close set, and not itself a duplicate or close candidate. Recheck its state before the duplicate closure executes, and add tests for a closed canonical and for mutual duplicates.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: report.ts validEvidence and completed; AC-04
EVIDENCE: report.ts:59 accepts `test` evidence on a claimed command string and exit_code 0, and executes nothing. report.ts:61 accepts `wiring` for any path that exists at the source commit. report.ts:200-204 requires the adversarial array to validate, but it may be byte-identical to the first pass. report.test.ts:86 passes the same `overlap` object as both evidence and adversarial. So a report closes "resolved" work when the agent supplies one existing source line plus a claimed test or any existing file, copied into both passes. "Adversarially verified" then has no structural meaning beyond restating the claim.
PROPOSAL: Require the adversarial pass to include at least one item that differs from the first pass, and record test execution provenance the driver observed, such as a log hash, instead of a self-reported exit code. Alternatively, mark such closures as serial claims and keep them out of executable closure.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: execute.ts planBatch; scripts/triage/cli.ts batch; Owner-approved execution; AC-03, AC-06
EVIDENCE: cli.ts:32-33 loads `--report` as arbitrary JSON. execute.ts:116-127 trusts that JSON's row.close_executable, row.ownership, row.index_requested, closure_reason, duplicate_of and report.completeness. It checks only identity and source_commit against the inventory and HEAD. It never recomputes buildReport from the inventory and observations, and never binds to the hash of the saved report file the owner read. A report JSON edited or generated outside buildReport can have close_executable true despite incomplete coverage or an unverified state. planBatch then accepts it, which bypasses the report-wide closure block in Design line 160-161.
PROPOSAL: In planBatch, rebuild the report from the inventory and the recorded observations, or verify a hash of the saved report file, and reject any mismatch before hashing the batch.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: github.ts receipt and identity; execute.ts executeBatch receipt path and Batch type; AC-06
EVIDENCE: github.ts:141-145 returns a close receipt whenever the issue is closed with the same state_reason, and a checklist receipt whenever the body equals `after`. :137-139 does the same for labels when they are present. None of these checks who made the change, unlike the comment and create receipts at :128 and :133. execute.ts:223-229 checks receipts before the material-change guard, so a concurrent closure by another account is journaled as this batch's completed approved closure. The Batch type (execute.ts:26-29) and Approval record no GitHub account. identity() (github.ts:99-105) only pins the first login seen in each process, so a retry under a different account passes. references/triage.md:11-12 requires confirming the account before presenting the batch.
PROPOSAL: Record the confirmed actor in the batch hash and reject execution under any other login. For close, labels and checklist receipts, require timeline or event attribution to that actor, otherwise treat the change as a material change and block.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Collection step 1; github.ts githubReader; collect.ts pages; report.ts compare; AC-03, AC-05
EVIDENCE: github.ts:55-56 pages issues (state=all) and closed pulls by page number, sorted by created date ascending, and collect.ts:121-133 only detects repeated IDs. If an issue earlier in the order is deleted, transferred or converted to a discussion between page reads, one item shifts onto an already-read page and is never seen. The same happens to a closed unmerged pull that is reopened. No ID repeats, so the entry stays complete:true. report.ts:163-168 then treats both inventories as complete and comparable and lists the skipped open issue under `removed`. Design line 194 says incomplete coverage never implies removal.
PROPOSAL: Verify each collection after paging, for example by rereading page 1 and the last page, or by checking total counts or a since/updated_at window, and mark coverage incomplete on any discrepancy. Add a fixture that removes an item between pages.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Repository settings; Stackweaver .vh-adlc/triage.json and agents/issue-triage.md; settings.ts ownership; execute.ts planBatch; AC-02
EVIDENCE: Design line 124 says settings describe bot and workstream ownership. stackweaver/.vh-adlc/triage.json:14 has owned_labels [] and no other workstream data. stackweaver/agents/issue-triage.md:18-20 tells the agent to read the audit ledger, TFE directory and RBAC_MASTER_PLAN to identify other-owned work. settings.ts:133-138 cannot express this, so report.ts:195-196 protects such an issue only when the agent supplies owned_by. execute.ts:124 rechecks only settings ownership. Counterexample: an RBAC-plan issue whose observation omits owned_by is eligible, and a close or label batch for it passes planBatch and executeBatch.
PROPOSAL: Add a data-driven workstream rule to the settings schema, such as plan-path or issue-reference sources, populate it for Stackweaver, and apply it in buildReport, planBatch and executeBatch.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: github.ts receipt for create-label
EVIDENCE: github.ts:150-152 lists labels by calling parsePage without repositoryId and spawns gh without GH_PROMPT_DISABLED. The issue and comment reader at :74 passes repositoryId because live GitHub returns /repositories/<id>/ next links (shared-triage.md:435, collection.test.ts "GitHub numeric repository links"). In a repository with more than 100 labels, parsePage throws next-page-target-changed, so the approved create-label action always fails before it is attempted. This fails closed but cannot execute.
PROPOSAL: Route label listing through the same validated reader chain with repositoryId and the same environment, and add a multi-page label fixture.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Tasks T14 evidence; tests/vh-adlc/evidence/triage/native-observations.json
EVIDENCE: shared-triage.md:431 states that Claude and Codex both "passed all eight actual-session probes" at f1f1810. In native-observations.json:147-157, codex-8 has kind "native-discovery", while claude-7 has "live-read-only-boundary". Line 433 then says Codex's next invocation "must prove" the MCP approval scoping works, so the Codex probe claim is unclear. Both final runs target f1f1810 (rewritten to 2cfcb49 per history-cleanup.json:29), not the reviewed component 3dab874. T14 also requires native proofs rerun against the final payload (line 429). The synthetic runs are also labeled "live-read-only-boundary" although the file's own scope says they are not live proof.
PROPOSAL: Re-run both CLI native trials at the final reviewed component and record the probe results for each host explicitly. Rename the synthetic run kind so that it is not confused with the pending live trial.

## Sources

- [Stackweaver triage source](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/agents/issue-triage.md): evidence tiers, modes, report shape and project-specific ownership/ranking rules.
- [Stackweaver command adapter](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/.claude/commands/triage.md): current Claude routing and conflicting early-label versus report-first instructions.
- [Shared lifecycle procedure](https://github.com/michielvha/vh-adlc/blob/9b68b56292416da212910c62e133e09a49cd5258/plugins/vh-adlc/references/lifecycle.md): existing intake, bounded maintenance and generic-request publication boundaries.
- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): draft, independent review, acceptance, test mapping and one living feature document.

- [Stackweaver harness-neutral entry](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/AGENTS.md): local playbook and Claude-command routing.

- [Stackweaver project rules](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/CLAUDE.md): isolation, verification, documentation and local delivery requirements.

- [Stackweaver maintenance playbook](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/agents/maintenance.md): deferred dependency workflow and satellite-protection behavior.

- [Stackweaver maintenance command](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/.claude/commands/maintenance.md): the deferred wrapper/playbook protection-policy conflict.

- [Stackweaver audit playbook](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/agents/codebase-audit.md): persistent findings and the deferred auto-merge authority decision.

- [Stackweaver docs impact](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/agents/docs-impact.md): the deferred scope-change documentation workflow.

- [Stackweaver docs drift audit](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/agents/docs-drift-audit.md): the deferred corpus-wide drift workflow.

- [Stackweaver docs drift resolver](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/agents/docs-drift-resolver.md): the deferred drift resolution workflow.

- [Stackweaver docs truth](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/agents/docs-truth.md): the deferred live truth verification workflow.

- [Stackweaver TFE compatibility](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/agents/tfe-compat.md): the retained domain-specific compatibility contract.

- [Stackweaver provider fork](https://github.com/michielvha/stackweaver/blob/7c3790f187b2d3286248dbf8f2fa310749dfb322/agents/provider-fork.md): the retained domain-specific fork workflow.

- [Pinned engineering entry](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/AGENTS.md): the repository task routes.

- [Pinned coding conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/coding.md): helper runtime, structured parsing and meaningful verification.

- [Pinned documentation conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/documentation.md): source attribution and one authoritative artifact.

- [Pinned delivery conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): feature claims, branches, commits and separate publication.

- [Pinned feature template](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/feature-document-template.md): the feature structure and task/evidence sections.

- [Pinned prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): reader-facing prose and verbatim review records.

- [GitHub CLI API manual](https://cli.github.com/manual/gh_api): explicit HTTP methods, included response headers and pagination behavior used by the read adapter.

- [Repository issues API](https://docs.github.com/en/rest/issues/issues#list-repository-issues): repository issue inventory and the pull-request marker in issue results.

- [Issue comments API](https://docs.github.com/en/rest/issues/comments#list-issue-comments): paginated issue comments and actor provenance.

- [Pull requests API](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests): closed pull inventory for merged implementation references.

- [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference): native command-tool switches and MCP allowlists/settings; actual installed CLI help remains the tested capability source.

- [OpenAI Docs MCP](https://developers.openai.com/resources/docs-mcp): documentation-only MCP scope; it does not supply the required native tool-isolation proof.

- [GitHub pagination guide](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api): follow validated Link URLs, including numeric repository routes and cursor parameters.
