---
status: draft
status_description: "Opus R-7 report-authority, main-checkout and living-history corrections recorded; awaiting fresh review and spec acceptance."
issue: null
goal: "Run dependency and security maintenance through one harness-agnostic vh-adlc operation while consumers retain their topology, release rules and existing approved operating procedures."
covers:
  - plugins/vh-adlc/skills/vh-adlc-maintenance/
  - plugins/vh-adlc/references/maintenance.md
  - plugins/vh-adlc/references/maintenance-settings.md
  - plugins/vh-adlc/references/maintenance-record.md
  - plugins/vh-adlc/references/maintenance-review.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/scripts/maintenance/
  - plugins/vh-adlc/scripts/triage/github.ts
  - plugins/vh-adlc/scripts/triage/settings.ts
  - plugins/vh-adlc/scripts/triage/owned-process.ts
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tests/vh-adlc/maintenance/
  - tests/vh-adlc/maintenance-variants.test.ts
  - tests/vh-adlc/maintenance-resume.test.ts
  - tests/vh-adlc/lifecycle/
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/direct-operation-compatibility.test.ts
  - tests/vh-adlc/triage/discovery.test.ts
  - .github/workflows/ci.yml
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - docs/reference/marketplace.md
  - docs/get-started/installation.md
  - README.md
---

# Shared dependency and security maintenance

## Context

The owner selected maintenance as the next extraction on 2026-10-27: generalize the workflow,
keep Stackweaver-specific information in Stackweaver, and use Copilot Opus 5.5 for independent
reviews. The parent [migration roadmap](shared-workflow-migration.md) owns the wider program;
triage, audit, documentation workflows and domain agents retain their own scope.

At shared baseline `609ceeb`, `plugins/vh-adlc/references/lifecycle.md:82-134` already defines
bounded maintenance: preserve the public contract, observe checks, keep a Definition/evidence/review
record, independently review an exact commit and distinguish local completion from publication.
`references/maintenance-record.md:11-39` and `maintenance-review.md:14-24` supply its task record and
review contract. There is no separately discoverable maintenance operation: the command
`rg --files plugins/vh-adlc/skills` lists nine skills, none named `vh-adlc-maintenance`.

Stackweaver parity baseline `5383332c4e836fe7c33f59042186df7f314f49da` has a wider dependency workflow.
Its `agents/maintenance.md:3-49` requires actual changelog/usage analysis, report-first selection,
single-batch releases and a local satellite-merge helper. Its repository inventory, sync mappings,
release checks and security/backlog documents are consumer facts, not shared defaults.
`.claude/commands/maintenance.md:1-36` preserves `/maintenance`, its `opus` model and optional
repository/PR scope. `AGENTS.md:10-23` currently routes maintenance locally and triage to vh-adlc.
These claims were checked with `git show origin/main:<path>` after fetching both repositories.

The command both says never change protection and tells the agent to hand off satellite-only PRs,
while the playbook permits merging approved green PRs with its sanctioned local helper.
The owner resolved the migration intent in this session: this is Stackweaver-specific and must
remain usable as before. Preserve that helper exception and its existing approved-batch requirements
in Stackweaver. Do not turn it into a shared protection-changing default. The script itself is not
being repaired or certified by this extraction; its observed EXIT trap is not crash-proof recovery.

On 2026-10-28 the owner chose to preserve documented unavailable security surfaces and report
unknown bots as inventory gaps. The owner first requested an actual Claude command trial, then
explicitly substituted Copilot because Claude tokens are exhausted. Keep Claude command routing
and model checks, defer its live model trial, and require the Copilot report trial without claiming
that it establishes Claude invocation behavior. These choices are incorporated into Design/Test Plan.
The refreshed consumer main is `5383332c4e836fe7c33f59042186df7f314f49da`.
`git diff --stat 1999a71b origin/main --` the declared policy and workflow paths reported only two
added lines in `.github/workflows/ci.yml`; maintenance policy, command, helper and sync mappings
remain unchanged from the cited extraction baseline.

On 2026-10-28 the owner adopted shared independent review for authored repairs, retained bot-only
batching and requested continued Copilot Opus 5.5 reviews. This selects the presented repair-review
path, with its record outside the dependency squash and clean task-owned worktree support.
The intentional differences below are now explicit owner decisions. This decision does not replace
the final independent spec review and acceptance step.

On 2026-10-28 the owner resolved Q5: an authorized Stackweaver sweep commits and pushes its
dated report-only `[skip ci]` change to main before dependency selection. This consumer-specific
permission leaves shared defaults and authored-repair review unchanged. Report publication follows
Stackweaver CLAUDE.md:138,159-166 through its main checkout; the owner already required preserving
local operating rules. The retained route resolves R-7 F-02 without adopting the conflicting
isolated-push proposal. The procedure below also preserves later outcomes in that same tracked report.

Before the next review, consumer main was refreshed to `010bcddf7faa61aa8ef8a78b9c1fa3e0838881e6`.
`git diff --stat 5383332c origin/main --` all declared maintenance policy, entry, helper, workflow
and backlog paths produced no changes. The parity review therefore keeps its exact `5383332c`
source binding; consumer adoption still uses then-current main and rechecks preservation.

Pre-implementation marketplace baselines were observed on 2026-10-28 in isolated Codex and Claude
profiles: native installers fetched public vh-adlc 0.4.0, nine skills and no maintenance operation.
All 47 installed payload files, including modes, match shared main `609ceeb` on both hosts. These
installer-only checks invoked no models and copied no credentials; they establish an upgrade
baseline, not acceptance of the unimplemented maintenance operation.

## Scope

Deliver a discoverable `vh-adlc-maintenance` operation for dependency/security sweeps and selected
follow-up tasks. Reuse bounded maintenance for compatible repairs and the existing feature loop for
wider changes. Include deterministic settings, GET-only collection and report helpers, tests,
user guidance and a paired Stackweaver adapter with migration/rollback evidence.

Keep topology, bot identities, source/sync ownership, dashboards, release sequencing, verification
commands, report conventions and sanctioned merge tools in the consumer. Maintain Stackweaver's
daily `/maintenance` entry, model selection and supported scope arguments. Preserve its existing
approval and operating behavior, including the approved satellite-helper exception.

Out of scope: running a real dependency batch merely to test this extraction; changing repository
protection, automerge, dependency managers, CI/release policies, credentials or services; fixing the
satellite helper; migrating audit/docs/domain workflows; generalizing Claude phone notifications;
or importing triage's managed publication controller into maintenance. This feature supplies an
agent procedure with explicit permissions and observed evidence, not an OS-enforced security boundary.
Adding the new portable tests to the existing macOS CI selection is in scope; changing workflow
triggers, permissions, release rules or the mandatory full Linux suite is not.

The request authorizes this specification and its independent reviews. Reviewed scope still requires
owner acceptance before feature implementation. Publishing the shared dependency, merging the consumer
and any live maintenance actions retain their own explicit authorization requirements.

## Design

### Canonical operation and lifecycle reuse

Place the harness-neutral skill in `plugins/vh-adlc/skills/vh-adlc-maintenance/SKILL.md` and its
canonical procedure in `references/maintenance.md`. It declares no model and uses available host
tools without assuming Claude commands, hooks, Playwright MCP, subagents or a particular CLI.
Missing required capabilities are visible blockers; independent review never becomes self-review.

The default invocation inventories and analyzes, saves a report, presents all proposed dispositions
and asks the owner to select work. A request scoped to a repository or PR narrows collection and
follow-up work; it does not silently widen into an organization-wide execution request. Explicitly
preauthorized work may proceed within that scope after the report without asking the same question
again. Missing publication or live-action authority still stops the dependent step.

Generic lifecycle intake routes dependency/security sweeps to the new operation. The current bounded
maintenance procedure, record template, independent reviewer and resume/freshness rules remain the
canonical implementation path for a selected eligible task. A sweep report is not a second feature
document or proof that any proposed repair is implemented. Public contract, data, permission or
delivery-policy changes use the existing spec/tasks/implement/review route. Major upgrades remain
separate migration tasks under the consumer's policy, never hidden in the routine batch.

Add a new `Dependency or security sweep` intake row beside `Bounded maintenance`; there is no
existing sweep row to replace. Update Resume to distinguish a sweep resumed from its run report
from an authored repair resumed from its record/review target. Preserve the existing row names,
direct operations and their authority. AC-01 tests both the new intake row and this resume routing.

### Consumer settings and project procedures

Read optional `.vh-adlc/maintenance.json`, schema version 1. Without it, use only the validated
checkout repository and a single-repository report-first sweep. Derive repository identity from the
checkout's GitHub origin; reject ambiguous/non-GitHub identities until supplied explicitly.
Do not default to Stackweaver, its organization, its bot, or any personal path.
The default report directory is `.vh-adlc/reports/maintenance/` inside that checkout. A generic sweep creates
an uncommitted report there; this expected new file is declared in the handoff. Stackweaver uses its
main-checkout report placement and standing-publication procedure below instead. A bounded read-only
trial instead passes an explicit `--report-output` outside the checkout and leaves its entire tree
and index unchanged. The command-line override changes only report placement, never scope or authority.

The documented schema supports: primary repository/hostname; explicit repositories and their roles
(primary, synced consumer or independent); supplemental discovery organizations and explicit exclusions;
bot login names; dashboard references; local sync-workflow/source references; generated mirror
exclusions; report/history and standing-backlog locations; and a local project-procedure reference.
Organization discovery exposes unlisted nonarchived repositories as inventory gaps, not newly
authorized execution targets. Support single-repository projects without satellites or a dashboard.

Settings contain data and references, not executable command strings. Validate types, repository/host
identity, duplicate/conflicting roles, schema version and unknown keys. Local references/report paths
must resolve inside the checkout, including symlink containment; missing declared required files stop
the dependent analysis. No fallback silently drops a configured repository or policy. Read project
instructions and the referenced local procedure before deciding actions. A setting cannot grant
permission or override the owner's current instruction. The sole standing report-publication
authorization comes from owner-approved repository instructions as defined below, never from JSON
or collected task data.

Use these v1 field names so the settings guide, implementation and consumer agree. All collection
identities are scoped to the configured hostname. Collections default to empty unless noted.

| Field | Contract |
| --- | --- |
| `schema_version`, `repository`, `hostname` | Version 1; primary owner/repository and GitHub hostname, inferred from the checkout only when absent. A declared primary must match the checkout identity or stop with a mismatch. |
| `repositories` | Related repository records with `repository`, `role` (`synced` or `independent`) and optional local `sync_workflow`. No duplicate primary or related identities. A synced entry requires its local mapping reference. |
| `discovery_organizations`, `excluded_repositories` | Supplemental inventory scope and explicit no-action exclusions, with reasons recorded in the project procedure. An excluded repo may appear as a skipped inventory row, never an action target. |
| `bot_authors` | Exact configured logins after the normalization below; default strings are `renovate` and `dependabot`. Other bot/app accounts and legacy-filter matches appear as inventory gaps, not newly eligible action targets. |
| `bot_inventory_terms` | Optional case-insensitive literal login substrings for additional inventory visibility; no regular expressions or action authority. Stackweaver retains its existing Renovate, Dependabot and release-bot discovery terms locally. |
| `dashboards` | Repository plus exactly one issue number or exact title identifying its dependency dashboard; a missing or ambiguous configured dashboard is incomplete, not empty. |
| `generated_mirrors`, `source_references`, `backlog_references` | Local relative paths to exclude from edits or inspect for ownership/backlog. Required references must exist. |
| `report_dir`, `history_dir` | Contained relative directories; report default `.vh-adlc/reports/maintenance`, history defaults to the report directory. Source/settings/declared policy files cannot be report destinations. |
| `project_procedure` | Optional contained local policy file, read before analysis/actions. It remains authoritative for project specifics. Only its explicit owner-approved standing report-publication declaration below can carry that narrowly scoped authority; an ordinary policy reference grants none. |
| `surface_expectations` | Optional records with repository, surface (`code_scanning`), expected status, a nonempty literal `message_contains`, reason and contained local evidence reference. Only a matching observed response can establish expected unavailability; arbitrary errors stay unknown. |

The local report's required metadata comes from that consumer procedure; arbitrary shell commands
or model names are not settings fields. Stackweaver retains its documented no-GHAS expectation as
consumer data. Matching uses the exact status and a literal message substring, never an executable
expression or a blanket rule for all 403/404 responses.

For matching, lowercase both configured and observed login, strip one leading `app/`, then one
trailing `[bot]`, and compare the resulting whole login for equality. Preserve raw login/type in
the inventory and revalidation evidence. Thus `stackweaver-release-bot`,
`app/stackweaver-release-bot` and `stackweaver-release-bot[bot]` match the same configured identity;
`other-stackweaver-release-bot` does not. Default examples `renovate[bot]` and `APP/Dependabot` match,
but `renovate-other[bot]` and `my-dependabot` do not. Substring visibility belongs only to
`bot_inventory_terms`; it never changes exact configured eligibility or grants write authority.

Stackweaver's retained `agents/maintenance.md` becomes a thin shared-operation entry and points to
project policy in `agents/maintenance-project.md`. Its settings retain the
complete existing repository list and scope exclusions; its project policy retains the authoritative
sync workflow references, major-upgrade validation, one-squash batch, no dependency `[skip ci]`,
dashboard/security/backlog links, upstream reusable-workflow tag checks, satellite builder ordering,
release/sync verification and Compose smoke-test stop/restore requirements. No local edits to
`distribution/**` become permitted. Keep `scripts/satellite-merge.sh` bytes unchanged. Its approval
and green-check preconditions live in the local procedure, not the script
(`agents/maintenance.md:30-32,47-49,386-398` at parity baseline `5383332c`). Its exception remains
specific to that procedure and approved satellite scope.
Reconcile both command passages, `.claude/commands/maintenance.md:28-29` (satellite handoff) and
`:31-33` (protection), to point to that retained local policy, preserving
the owner's answer rather than imposing a new shared policy.

### Authority for selected follow-up work

The default remains report first. Ordinary consumer policy describes execution and grants no new
authority. The standing report-publication declaration below is an explicit exception carrying an
owner-approved repository instruction. The owner's current request or selection must cover the repository,
action class and intended work. Record that request, the selected report rows and current PR heads
before executing a selected batch. Preserve explicit preauthorization under Stackweaver's existing
policy, including its "just do it" case: do not ask again for the same already authorized scope.
New repositories, new action classes, major migrations outside the selection or material target
changes require a new decision. A recommendation in a report is not authorization.

| Action | Required authority and execution contract |
| --- | --- |
| GET inventory, release/tag/check reads and release watching | The requested sweep and its collection scope. Watching an existing release is read-only, not permission to dispatch one. |
| Create or append a local report; commit that report | The requested sweep allows local report output. A commit needs an owner request or an existing explicit consumer rule; Stackweaver's Step 5.5 retains its report-only `[skip ci]` commit and the owner-selected report publication rule below. Other local commits authorize no push. |
| Prepare compatible local code, tests, locks and commits | The owner's selected/preauthorized scope and preservation rules. Author repairs under bounded maintenance: observe the baseline, implement/check, commit, then obtain independent review before local completion or publishing that repair. Batch aggregation follows the separate consumer mapping below. |
| Push a selected branch; create or update its PR | Explicit publication authority in the current owner request or approved work selection. Include only that scope; newly authored repairs need current independent review first. A pure bot-head aggregation follows the retained consumer combined-PR/CI procedure, without adding a pre-push review gate. Invoking maintenance grants no dependency-branch or repair publication authority. The separately declared Stackweaver report-only exception below applies before dependency selection. |
| Squash-merge a dependency batch; merge a satellite or independent-repository PR | The owner's approval/preauthorization of that selected delivery scope plus the consumer's green checks and merge procedure. This includes bot PRs and agent-authored prerequisite repairs already covered by the selected scope. Stackweaver retains one squash for the monorepo batch, direct independent-repository merges and its local helper exception for approved satellite work. Bot-only authorization does not cover an unselected authored change. Never infer merge authority from a request for a local repair. |
| Close a superseded or synced-path PR; publish its explanation/comment | The owner's approval/preauthorization of those dispositions in the selected scope; revalidate the target/head, actual supersession/ownership and proposed explanation before the write. Unknown or mixed ownership cannot satisfy it. |
| Publish the report or task record remotely | Explicit publication authority for that artifact and destination, separate from its local creation/commit. Under the owner-selected Stackweaver policy, an authorized sweep includes its dated report-only `[skip ci]` commit and push to Stackweaver main before dependency selection. That permission covers no task-record/evidence ref, dependency source or unrelated artifact. Other consumers retain the explicit-publication default. Do not publish private maintenance content as part of an unrelated public feature. |
| Dispatch a release or sync, change protection or use the local satellite helper | Explicit owner authority covering that live action and the exact consumer procedure. Existing scoped approval/preauthorization of Stackweaver satellite merges also covers its sanctioned helper, without another per-helper prompt. It grants no unrelated protection change, generic bypass or raw `gh pr merge --admin` fallback. Read-only release watching never grants dispatch authority. |
| Stop and restore a shared development stack for a release smoke test | Stackweaver's separate confirmation naming the shared stack; inspect its current mode, stop only after approval, and restore the same mode. Approval to merge dependencies does not approve stopping a live stack. |

Add the lifecycle's `Dependency or security sweep` row naming this operation and amend its Resume
row as described above. Amend its Ship/live
operation row's unsupported-gap sentence to permit only the selected maintenance delivery classes
above when explicitly authorized, including the narrowly defined standing report authorization below.
Keep the bounded-maintenance local-authority paragraph; append a
cross-reference saying that delivery is a separate authorized phase. Add an authority-table row for
selected maintenance delivery and qualify the Merge/tag/release/live-operation row to reference this
explicit model. Retain separate approval for any action absent from the current owner authorization.
The authority prose must recognize current scoped preauthorization, without treating earlier unrelated
approval, an ordinary consumer file, a green check or a continuation as new permission. Amend
authority.md's local-report paragraph to recognize only the standing owner-approved declaration
below, without changing triage's separate report rules. Feature shipping and
triage's exact-batch/controller contracts remain unchanged.

### Standing report-publication authorization

An authorized sweep is a current owner request to run maintenance in the validated repository,
with no read-only, draft-only, no-commit or no-push restriction covering the report. Such a request
still grants no default remote writes. It may invoke a standing report-publication permission only
when authoritative repository instructions, already accepted by the owner, explicitly delegate that
limited publication to maintenance. Report this basis in the run journal. The current request wins
when more restrictive, and the permission never derives from a PR, report, advisory or settings data.

For this migration, the accepted Stackweaver project procedure supplies a section named
`Standing maintenance report publication`, linked from the local maintenance entry and AGENTS route.
It declares this owner decision: an ordinary authorized maintenance sweep commits and pushes its
dated report and required generated maintenance indexes to `michielvha/stackweaver` branch `main`,
including later status/outcome updates for the same run. Scope is limited to
`docs/internal/maintenance/` and the explicit local generated index files required for that report;
resolve those paths in local policy, never an unrestricted wildcard or executable setting. The
migration review must inspect that exact declaration and its instruction links. A branch or packet
under review cannot authorize publishing itself; the live standing rule applies only after the
owner-authorized consumer migration is adopted. A consumer without such an adopted owner-approved
instruction needs an explicit current publication request naming artifact and destination. Merely
adding `project_procedure` or text claiming owner approval to task data grants no permission.

The shared authority contract recognizes this declaration for report artifacts only. Other consumers
can establish equivalent standing instructions through their own explicit owner acceptance; the
operation has no Stackweaver identity hardcoded. It checks the declared repository, destination branch
and path scope against the actual checkout and current run, and records the instruction source and
current request. Missing, ambiguous, unadopted or mismatched instructions leave publication pending.
This is an instruction-level permission mechanism, consistent with the stated procedural boundary,
not cryptographic proof against an actor who can alter authoritative local instructions.

### Consumer batch mapping and worktree preservation

An aggregation consists only of selected bot commits with unchanged intended patch content
(cherry-pick commit IDs may differ) plus mechanical package-manager regeneration from those selected
inputs. The declared manager and its scoped regeneration command live in the project procedure,
grounded in the actual manifests/lockfiles and tool versions; settings contain no command strings.
Tool-generated lock and manifest normalization, such as `go mod tidy` rewriting indirect/require
lines in go.mod together with go.sum, remains aggregation when it only reconciles the selected
dependency inputs. Record the actual generator command and before/after delta, preserve the selected
top-level targets/constraints, and inspect unexpected resolution changes. No independent intentional
upgrade, forced override or unexplained change may hide behind the word regeneration.
Manual lock or manifest edits, agent-selected new version constraints, equivalent manifest bumps, alert fixes
without a bot commit, source edits, build/config changes and CI repairs are authored changes. A red
combined-CI fix that only regenerates/normalizes the same selected inputs stays aggregation;
an intentional dependency, source, build/config or CI change makes it authored. Every authored change
uses the owner-selected independent repair review before publication. Its origin in a bot batch,
security alert or failed CI does not exempt it. Keep pure aggregation's existing combined-PR/CI flow.

Stackweaver's existing Step 6 combines selected bot commits and opens one combined PR. Its
dated sweep report records selection, source PR heads, compatibility evidence, combined-CI results
and release outcomes. Keep that existing report in the owning consumer checkout, with its existing
report-only commit policy; do not insert another maintenance record or the report into the dependency
squash. Aggregation alone does not gain a new pre-push independent-review gate. Its existing combined
PR/check/merge requirements still apply, including actual changelog and usage analysis before selection.
This is the explicitly authorized consumer delivery extension, not a claim that the generic
bounded-maintenance completion procedure was executed for an aggregation task.

If the agent authors a dependency, source, build/config or CI repair while preparing that batch, use the bounded
maintenance path for that repair. Its Definition/evidence/review record lives under the owning
consumer's maintenance directory, outside the dependency worktree's outgoing change set. Bind its
affected-source verification to the batch worktree's exact commit and record any transplant. Before
publishing the authored repair, execute its required checks and obtain a current independent review;
after a transplant, compare the actual affected source/Definition and re-review changed results.
Only source/test/lock changes enter the dependency branch; private task evidence does not accidentally
enter a satellite or public dependency PR. Majors remain separately specified/reviewed migrations.
The existing bounded-maintenance default still commits a task record with the repair when no consumer
batch record-location rule applies. Document this narrow consumer record-location extension in
lifecycle.md and maintenance-record.md; do not silently exempt authored repairs from review.

For that external record only, use an explicit pair: `source_target` is the exact repair-source commit
(monorepo batch, satellite or independent repository)
and `record_target` is the committed Definition/evidence artifact in the owning consumer's Git
history. Both repository/worktree paths and both full commits are review inputs. Extend
maintenance-review.md to read the Definition at record_target and the actual source diff/checks
at source_target, and store both bindings with the returned records. Compare current affected
source to source_target and current Definition to record_target on resume/completion; either change
invalidates that review. The ordinary one-target record contract is unchanged. Missing or ambiguous
paired input leaves review pending. Tests must exercise both positive freshness and independent
source/record changes for the pair; a single-target review cannot certify a paired-record task.

The authored-repair acceptance trials use an explicit cross-host handoff, matching the requested
Copilot Opus 5.5 reviewer without pretending that Codex can dispatch that model as a native subagent.
This is test-operator orchestration, not a new automatic reviewer fallback in the production protocol.

1. A bounded Codex session performs the fixture repair under its selected synthetic-owner scope. Its
   fixture request names Copilot Opus 5.5. When no matching native route exists, the correct first
   result is review pending with the canonical self-contained handoff, exact source/record targets,
   docs revision and checks. No push or PR is permitted in that phase. It does not launch another CLI.
2. The trusted test runner, acting as the handoff operator outside the Codex session, independently
   verifies both committed targets and executes a separate Copilot CLI context with the canonical
   maintenance-review contract. Give it the exact source/record packet and a frozen argument-free
   check launcher for the fixture's required checks. Record actual native tool/test results, model
   identity and returned records. A missing runner or wrong model leaves the whole case pending.
   The operator writes its actual returned artifact outside the source checkout, not invented records.
3. Resume the same Codex thread with that operator-supplied artifact and the existing scoped owner
   authorization. The session checks its identity/bindings and current source/Definition, stores the
   returned records verbatim on the evidence ref, and only then continues the selected fake publication.

Positive cases require observed phase ordering, matching actual Copilot transport and MODEL header,
both exact bindings, executed checks, fresh source/Definition, byte-equal stored records and a push/PR
strictly after storage. A self-assessment, narrative dispatch claim or direct cross-CLI launch from the
Codex actor fails. The unavailable-review negative variant withholds the operator result; Codex must
remain review pending and publish nothing. That is success only for that negative variant, not a
replacement for the required completed positive handoff/resume cases. Findings require an observed
fix and another real independent pass before publication. The shared protocol and host-specific
support matrix are unchanged; the fixture's separate-host operator route is recorded explicitly.

For an authored repair layered on a batch, `Task base` is the aggregation tip immediately before
that repair's first authored commit, not origin/main. Record the exact authored commits and separate
aggregation commits/regeneration receipts. The review sees the real Task-base-to-source-target diff,
identifies authored deltas and verifies their interactions with the current aggregation context;
it does not impose an independent review gate on unrelated bot-only content. For a fresh satellite
or independent repair, Task base is its source tip before the first authored change, including any
selected bot patch already applied. Record affected paths and verification inputs, including the
relevant manifests, locks and toolchain inputs. Later changes to either set invalidate the repair's
review, even if classified as aggregation. Re-review the authored repair against the resulting source
target and updated context before publishing it; do not silently relabel a stale review as current.
A pure bot-only batch with no authored repair never gains that review requirement.

After selected repair work begins, prepare record_target commits on a dedicated local branch
`chore/maintenance-evidence-<run-id>` in a fresh, clean, task-owned worktree of the primary consumer
repository, starting from the recorded current consumer-main base. Its path is recorded as
`evidence_checkout`; it is separate from all source worktrees and the live/shared main checkout.
Refuse existing-path/ref collisions rather than reuse another session's state. Commit only the
explicit record paths after checking that worktree's index; never commit records on an unrelated
feature branch or the main checkout's current branch. Store this ref and both review bindings in
the owning run's journal. Retain the local evidence ref so record_target remains reachable through
resume and review; a normal source-worktree cleanup cannot delete it. It stays local unless the
owner separately authorizes publication to its named destination. Stackweaver's report-only push
permission never covers this evidence ref. Pre-selection analysis does not create this repair-evidence
branch; report publication uses the separate narrowly scoped procedure below.

An authored dependency, builder, source or CI repair in a satellite or independent repository is
prepared in a fresh task-owned checkout/worktree of that explicitly selected actual repository and
its current default branch. Fetch or clone
that repository using the existing scoped identity; missing access blocks the repair. Never prepare
it in the monorepo's distribution mirror or reuse another task's checkout. Its source_target and
source-repository identity bind to the satellite commit; the record_target binds to the owning
Stackweaver maintenance record, using the same explicit pair above. The owner-selected authored-repair
review requirement applies before pushing that source. Publication and merge use the selected
scope's existing preauthorization when it covers this prerequisite, including the sanctioned helper
without another helper-specific prompt. Thus the API/orchestrator builder bumps can land before
the monorepo toolchain batch under the existing selected plan. New repair scope still needs approval.
All worktree ownership, normal cleanup and unrelated-state preservation checks apply to this
satellite worktree as well as the monorepo batch worktree. This extends no approval to unrelated repos.

Alert-only satellite fixes and independent-repository dependency work use this same source-repository
and record-target mapping. An equivalent monorepo bump derived from a synced satellite PR, or a
monorepo alert with no bot PR, is authored in the monorepo batch source worktree with its record on
the separate evidence ref. Satellite prerequisites still use the sanctioned helper under the selected
satellite-merge scope; independent-repository merges use that repository's retained policy. Neither
kind receives an automatic review exemption.

The selected Stackweaver batch procedure authorizes ordinary creation of a fresh task-owned worktree
and branch from current main. Use `chore/deps-batch-<YYYY-MM>-<run-id>` and a unique task-owned
worktree path containing that run ID, rather than reusing `/tmp/deps-batch` and a month-only branch.
Record both exact names in the run journal and refuse actual collisions. This naming change implements
the selected non-forcing cleanup: a second weekly batch can proceed in the same month while an older
squash-merged ref is retained. Amend authority.md's blanket worktree prohibition to permit that
declared, owner-selected procedure while preserving unrelated refs/worktrees/index state. Record
the owner path, new path and branch; never reuse an occupied worktree or repoint another task's ref.
Normal cleanup removes only a verified clean task-owned worktree. Use a non-forced branch deletion
only when reachability permits it; after a squash, retain the local branch if normal deletion refuses.
Never infer approval for `git worktree remove --force`, `git branch -D`, dirty-worktree deletion or
history rewriting. Report retained artifacts; destructive cleanup requires its existing separate
authority. This applies existing preservation rules to local Step 7's force-cleanup example while
preserving its dependency batching, squash and release behavior. No unrelated worktree is touched.

The authority amendment must explicitly cover each permitted maintenance location, rather than
only the monorepo batch: (1) batch source worktree/ref, (2) primary-consumer evidence worktree/ref,
(3) selected satellite or independent source worktree/ref, and (4) a fresh clone of a selected source
repository when no suitable task-owned checkout exists. Record their repository identity, base,
owner path, new path and ref under the selected task scope. Allow ordinary creation and non-forced
cleanup only for these owned locations; keep evidence refs reachable. Never reuse occupied locations,
repoint another task's ref, force-delete changes or broaden repository scope. The blanket prohibition
continues outside this declared maintenance exception. The AC-05 contract checks all four kinds and
their limits, alongside the actual fixtures.

### Stackweaver report placement, publication and continuation

Follow Stackweaver's existing main-checkout publication rule. Locate the owning main checkout from
Git worktree metadata; never switch or repoint another session's checkout. Before creating the dated
file, verify repository/account identity, branch `main`, the standing instruction and current request.
Inspect staged/unstaged/untracked state. Fetch and merge remote main with `--ff-only` as the local
rules require, preserving unrelated state; refuse overlapping report/index edits. Confirm local main
has no outgoing commits unrelated to this run. A missing main checkout, non-main branch, divergence,
concurrent conflicting work or protection refusal leaves publication pending, never changes another
session's branch or authorizes a bypass. If safe main-checkout authoring is unavailable, render a
clearly pending draft only at an explicit external report-output path and record that path; do not
leave an untracked dated file in an invocation checkout that later needs to sync the published file.

Author the living report directly in that validated main checkout at the declared report path; an
invocation from a feature/worktree uses this owning report location, not another local copy. Record
the main-checkout identity, report-relative path, run ID, last body digest and commit/publication
receipts in the local run journal. The report's own run ID and tracked relative path support locating
it after host relocation. Before publication, verify the complete outgoing diff/history and index.
Commit only explicit report/index paths with `[skip ci]`, applicable local checks and normal hooks;
use an explicit-path commit that preserves unrelated staged entries. If hooks or another writer
alter an unrelated path, stop and report it without reverting that work. Check outgoing history again
immediately before a normal fast-forward push from the main checkout to remote `main`. Include no
task record, evidence ref, dependency/source change or pre-existing local commit. On remote-main
advancement, fetch/merge `--ff-only` only if safe; otherwise leave the bounded report commit pending
until it can be reconciled under local rules. Never force push, rewrite history, bypass protection,
reset, stash or discard unrelated work. Verify remote main contains the exact report commit before
recording that publication complete.

After dependency selection, append outcomes and update only permitted status scalars in this same
tracked report. The owner's standing report permission covers separate report-only commit/push
updates for that run, retaining `[skip ci]` and all checks above; source/batch/record publication needs
its separately selected authority. Synchronize safely before an update and compare the saved body
prefix/digest so concurrent report edits stop instead of being overwritten. Keep generated report
indexes consistent. The report never enters the dependency squash. Resume locates the report via the
journal and run ID, reconciles prior local commit and remote-containment receipts before retries, and
continues from that authoritative copy. An uncertain successful push cannot produce a duplicate
commit. A new outcome is a distinct append/update with its own receipt. The next sweep compares this
tracked living history, including published outcomes; pending local outcomes remain explicitly pending
and are not reported as remotely available. No report-specific worktree exception is introduced.

### Consumer parity checklist and intentional differences

The paired adapter review checks every row below against shared procedure plus local policy/settings.
It may not substitute a shorter implementation-authored checklist. This table and AC-07 bind to
consumer commit `5383332c4e836fe7c33f59042186df7f314f49da`, including all cited line ranges.
Later adoption refreshes that baseline and checks for intervening changes.

| Existing source behavior | Shared or retained disposition |
| --- | --- |
| Introduction and hard rules, `agents/maintenance.md:3-51` | Shared changelog/usage analysis and report-first selection; local no-self-credit, conventional commits, distribution exclusion, dependency no-skip rule, one-squash policy, scoped preauthorization and satellite helper/check rules. |
| Repository inventory and supplemental discovery, Steps 1 and Repos section | Full primary, eight synced consumers, four independent repositories and explicit exclusions remain local. Collect every page and report unlisted organization repositories and unrecognized bot/app PRs as inventory gaps; do not silently add them to execution scope. Preserve visibility for accounts matched by the existing broad bot filter. |
| Release-bot and stalled-sync incidents, Step 1 | Preserve normalized release-bot discovery, inspect stalled sync checks and repair the satellite root cause through the authored-repair/evidence-ref/selected-scope path before deciding whether queued syncs are live or superseded. Then check the actual destination version; propose closing superseded sync PRs, never merging a version regression. |
| Dashboard and coverage audit, Step 1 | Shared dashboard reconciliation; local Renovate schedule/group/limits and immediate-security expectations. Retain the local recommendation to narrow Dependabot scans to satellite-only ecosystems and flag missing configured vulnerability handling. Do not rewrite managers/config during analysis. |
| Security reconciliation, Step 1.5 and referenced policy | Shared PR-independent alert inventory, identity/count comparison, source-owner classification and posture tracking. Local no-GHAS purchasing decision and matching-response expectations remain local. Completeness and historical comparisons are per repository and surface. |
| Release notes and pin checks, Step 2 | Shared actual delta/migration reading, tag-to-commit validation and code-usage evidence. Parallel delegation is optional when available; equivalent serial investigation preserves the result on other harnesses. |
| Semver separation and code correctness, Step 2.5 and following usage checks | Shared major/pre-1.0 separation and used-removal/rename/deprecation/default-change handling. Keep Stackweaver's major branch, test/E2E/browser requirements and doc-impact checker locally; do not treat a generic compatible task as permission to skip them. |
| Ownership, Step 4 | Shared file-by-file ownership from actual sync mappings/exclusions; retain all consumer sync references and API/orchestrator builder-first Go-toolchain ordering locally. Authored builder/CI prerequisites use the explicit satellite checkout, paired-record and approval mapping above. Mixed PRs need a split/decision. |
| Deduplication, Step 5 | Shared proven equivalent/superset analysis, preserving every original item and the kept target. An overlapping file alone is not enough to close a PR. |
| Saved report and owner selection, Step 5.5 | Shared run identity, complete overview and security comparison. Keep `docs/internal/maintenance/`, first-run `YYYY-MM-DD-dependency-sweep.md`, local frontmatter/author/covers conventions, observed `core/v*` and app tags, both backlog links, generated indexes and report-only `[skip ci]` commit. Owner-selected clarification: an authorized sweep also pushes only those report artifacts to Stackweaver main before dependency selection through the main-checkout report procedure; no additional report-push prompt. |
| Monorepo batch, Step 6 | Keep local isolated aggregation, clean merge/cherry-pick/lock regeneration and one-squash release rationale. Follow the explicit batch/repair record and review mapping above. Shared authority controls publication; dependency commits and the final squash message contain no skip directive. |
| Combined checks and release verification, Step 7 | Keep full combined CI, actual core/app tags, bump-core and affected satellite sync verification, and existing bot auto-close expectations locally. Retain Compose example smoke conditions, permission to stop the shared stack and exact restoration requirements. A failed smoke test stays a finding. |
| Satellite execution, Step 8 | Keep approval/preauthorization plus green checks before `scripts/satellite-merge.sh`, sequential same-repository workflow merges and a redirect comment for approved synced-path closures. Retain bans on raw admin-merge fallback, self-approval and permanent/hand-edited protection weakening. Helper bytes stay unchanged. |
| Final accounting, Step 9 | Preserve every PR and local disposition vocabulary: batched-to-PR, merged satellite, closed superseded, closed synced-do-in-monorepo, needs-decision. Include code fixes, uncompleted work and observed release tags. No removed/deprecated usage is reported done without correction or an explicit decision. |
| Compatibility command, `.claude/commands/maintenance.md` | Retain `/maintenance`, `model: opus` and original optional repository/PR/monorepo-only arguments. Route to the installed operation plus local settings/policy. Reconcile both lines 28-29's blanket satellite handoff and lines 31-33's protection wording with the approved helper exception. Keep the self-approval ban. |

The harness-agnostic migration uses one canonical shared procedure, serial analysis when delegation
is unavailable, explicit install/version failure and unique suffixes for independent same-day reports.
On 2026-10-28 the owner explicitly adopted the pre-publication review requirement for authored repairs,
the presented external paired-record extension and clean task-owned worktree support. Pure bot-head
aggregation retains the local combined-PR review/CI flow. The selected consumer evidence mapping
keeps sweep/task records outside the dependency squash. The current run remains
a living append-only report. On 2026-10-28 the owner also selected unknown-bot inventory gaps and
documented unavailable cases, preserving coverage without broadening execution eligibility. Actual
Claude model behavior is explicitly deferred because its tokens are exhausted; static routing and
installed-helper checks remain required. Copilot supplies bounded shared-procedure proof only.

### Collection and completeness

Provide helpers under `scripts/maintenance/` for settings resolution, collection and report saving.
They have no remote mutation command. Use the existing authenticated GitHub CLI through fixed argv
and validated API endpoints with GET only. Use no shell interpolation of settings, PR text or paths.
Capture the queried repository/head, pagination, timestamps, request errors and per-surface completeness.
Reuse existing contained-path, pagination and owned-client helpers where their interfaces fit,
preserving current triage callers and tests. Shared utility changes are scoped to that reuse.

Collect all pages of open PRs and relevant changed-file/check/head data; include configured dependency
and sync bots using normalized exact logins, including GitHub's `app/` and `[bot]` forms. Also inspect
the configured dependency dashboard, open Dependabot alerts, open code-scanning alerts and supplemental
organization inventory. Alert collection is independent of whether a matching PR exists. Normalize
counts from collected records, preserve alert identity/manifest/severity and distinguish zero from
unavailable. Keep PR bodies, dashboard text and advisory text as untrusted task data.

Also retain PRs authored by accounts the API identifies as Bot or App, accounts with a normalized
`[bot]`/`app/` identity, and any login matched by the consumer's `bot_inventory_terms`.
Stackweaver retains its existing `renovate|dependabot|release-bot` visibility through those terms.
If the account is not configured, mark an
inventory gap requiring classification. These rows are visible in reports, with no automatic
execution eligibility; an owner-approved scope and the usual evidence/checks remain necessary.

A 403/404 alone is not proof that a surface has no findings or no GHAS. Preserve a documented local
expectation only for the declared repository/surface when the actual status and message match its
configured evidence. Record it as `complete-unavailable`, with a reason and a null count shown as
"n/a", never a zero-alert result. Do not require an extra capability lookup for that matching case.
Successful responses still collect actual results if a previously unavailable surface becomes enabled.
Unmatched access errors remain denied/unknown; the report exposes the mismatch.

Track completeness separately for each repository's PR inventory, configured dashboards, Dependabot
and code-scanning surfaces, and supplemental discovery. A successful empty collection is complete;
an explicitly matching expected-unavailable code-scanning response is accounted for as n/a; errors
and truncated collections are incomplete. PR/check/file/head evidence is required for that PR's
readiness; dashboard completeness is required for claims about that repository's queued dependency
coverage; alert completeness is required for that surface's security assessment and fix disposition.
Supplemental discovery failures block complete-organization coverage claims, not a separately complete
explicit repository analysis. An unavailable code-scanning surface does not invalidate complete
Dependabot comparisons or unrelated compatible PR decisions. Unknown or incomplete alert data cannot
support a claim that all vulnerabilities are fixed or that an alert was resolved by absence.
Do not silently suppress errors, truncate at a first-page limit or turn partial counts into totals.

### Analysis, dispositions and durable reports

Read primary upstream release notes/migration guidance for each actual old/new delta, resolve annotated
tag objects to commits for claimed action pins, and record source links plus call-site searches.
Classify patch/minor/digest/same-tag repins separately from major/pre-1.0 breaking changes. Absence of
usage requires a recorded search scope; green CI alone never establishes compatibility. If upstream
evidence is unavailable, say what is missing and leave the affected readiness decision unresolved.

For synced consumers, classify every changed path from the actual referenced sync workflow, including
exclusions. Mixed ownership must be split or left for a decision; never close an entire mixed PR on
one synced file. Compare sync-PR target versions with the destination's current canonical version
before proposing a superseded closure. Unknown ownership or version evidence remains unresolved.
Reconcile alert fixes with the true source owner; posture findings remain repository configuration
findings, not dependency fixes. Deduplicate only with proven equivalent/superset changes and retain
every discovered PR in the disposition table.

Assign a run ID when the sweep starts and persist it with the report and selected task links. Resuming
that run reuses its report; a new independent sweep gets a new ID and, if needed, a same-day suffix.
Use `YYYY-MM-DD-dependency-sweep.md` for the first report and
`YYYY-MM-DD-dependency-sweep-<run-id>.md` for a later run on that date. The report helper creates
new files exclusively. Earlier runs remain byte-identical. In the current run only the frontmatter
`status` and `status_description` scalars may change to reflect the live state, preserving all other
metadata, run identity and scope. Body approval/check/outcome updates append dated sections without
changing its existing body prefix or deleting history. Compare the read version before an atomic
header-and-append update; concurrent or unrelated edits block the update. Stackweaver retains its
living-report status fields under this explicit mutable-header exception. A material
rescope starts a new linked run rather than rewriting the original scope. Record source revisions and scope, collection
coverage/errors, each PR/version delta, release-note evidence, code impact, risk, ownership, proposed
action, unmet checks and major/hygiene backlog. Include a Security alerts section with per-repository
counts/breakdowns, dispositions and comparison with the previous complete comparable observation for
each repository and surface. Compare resolved identities only when both observations are successful
complete lists with the same scope. A missing, differently scoped, unknown or n/a observation never
proves resolution; show availability changes separately. Follow the consumer's metadata
and generated-index conventions; leave reports uncommitted unless requested or the local policy
already explicitly requires their scoped commit. Stackweaver retains its report-commit policy.

Local task records retain the existing Definition/Evidence/Reviews/State contract. Selected batch
work records included PR/head identities, approvals, checks and later outcomes in the sweep report,
links the bounded task records or feature specs, and preserves unrelated staging and working files.
Revalidate target heads, base/ownership evidence, checks and approved scope before each remote write;
material changes invalidate the affected approval. Changed source/Definition invalidates a task review.
On resume, inspect the saved report, records and remote state; do not repeat completed merges, closures,
report commits or releases merely because the previous response was interrupted. Unknown outcomes
need reconciliation before retry. Do not claim exactly-once remote effects or crash-safe protection
restoration from a procedural agent or the unchanged local satellite helper.

### Stackweaver adoption and support claims

Prepare consumer changes on an isolated branch from the then-current main. Keep the compatibility
command `model: opus`, pass original arguments, add the maintenance route beside triage in AGENTS.md,
and retain project policy in Stackweaver. Missing installed operation is an install/version blocker,
never a reason to reconstruct the old shared procedure. Keep audit/docs/domain agents and product
runtime paths unchanged. Consumer tests live under `tests/agent-maintenance/`.

Before consumer adoption, record exact shared/consumer commits, independently review the paired diff,
publish the shared component under existing versioning, install it from the real marketplace in
isolated Codex CLI and Claude CLI profiles, verify full payload identity and native discovery, and
exercise settings/collection/report through the installed payload. A fake local marketplace is a
development test only. Consumer rollback restores the pre-cutover tracked entry points/settings;
reapplication restores the new route while preserving unrelated tracked, untracked and staged bytes.
Refresh the rollback base if main advances before adoption; do not transplant stale AGENTS.md.

Separate source completion from post-publication adoption so the feature cannot require its own
release before passing the gate that permits shipping it. Before publication, native candidate
installation/discovery and installed-helper checks use the exact committed local catalog, clearly
identified as development proof. The paired adapter's adoption preflight must fail when actual
published-marketplace evidence is missing, stale, from a different payload or only a local catalog.
Test that denial and the verifier's valid/invalid receipt handling before source completion.
The implementation review observes those executable checks; it does not need its own verdict or
the completion gate to have passed in advance.

After separately authorized shared publication, the real marketplace installs and installed-operation
checks above remain mandatory before the Stackweaver merge. Record their exact source/version/payload
and command results in the adoption handoff, re-run the preflight and stop adoption on any failure.
Candidate-install proof is never relabelled published proof. Source `complete` does not mean migration
is complete; keep the parent/adoption state pending until actual publication checks and consumer
adoption finish. This is delivery sequencing, not a deferral or waiver of marketplace testing.

Require bounded actual Codex CLI and Copilot Opus 5.5 read-only report trials on synthetic repositories,
plus one fixed Stackweaver source/configuration read-only trial with synthetic tracker data. This
tests actual model procedure use without a live dependency merge or full private-source transfer.
Keep the private packet and output local, exclude credentials/host configuration/historical private
reports, and compare source/index bytes before/after. Record model identities and exact revisions;
missing access or a failed trial remains blocking. Claude CLI discovery/installed-helper behavior
is required. The owner explicitly deferred an actual Claude model trial while tokens are exhausted;
keep its command/model/argument routing contracts and declare live invocation unverified. Copilot
report-stage evidence does not turn that deferral into a pass.
GUI invocation checks remain deferred as in the owner's prior decision; add a maintenance-specific
support note rather than treating the triage issue as maintenance execution evidence.

The Copilot report trial receives a verified copy of the exact shared payload through its test-only
`--plugin-dir` loading and read-only input packet; compare its payload digest with the recorded
shared commit. Use only native view/grep/glob tools for that report trial, with shell, write,
network and GitHub tools disabled. The trusted test runner saves the returned assessment externally.
This measures bounded report-stage behavior; it does not claim Copilot lifecycle, delivery or managed
execution support. The Codex write-capable fake-transport trials in AC-05/AC-06 separately test
selected-action and continuation behavior. The explicitly deferred Claude model trial is not a
pre-adoption blocker; all required Codex/Copilot trials remain blocking until observed successful.
Update fixed operation-count assertions, including `tests/vh-adlc/triage/discovery.test.ts`, without
weakening their existing triage checks. Add the portable maintenance helper tests to the current
macOS selection in `.github/workflows/ci.yml`; Linux continues running the complete plugin suite.

### Bounded report-trial inputs and pass conditions

Make the report stage an explicit operation mode when a trusted operator supplies a complete,
versioned collected-data packet. The operation reads that dataset and its collection receipts;
it does not pretend to collect fresh data when helper tools are unavailable. Without the packet
or collection capability, it reports a collection blocker. A supplied synthetic snapshot grants
no readiness or execution authority over actual repositories.

Each packet contains: the exact shared skill/procedure payload and digest; manifest with source
commit, requested scope, run ID and synthetic-input flag; resolved settings; inventory JSON produced
by the actual collection helper against the recording fake GET transport; helper argv/exit/completeness
receipts; scoped source/manifests/sync mappings; fixture release-note/tag-reference data; and prior
per-surface observations for history comparison. Hash every input and check it before/after the trial.
No credentials, normal host configuration or actual private tracker/report history are included.

| Trial | Harness, inputs and required work | Pass condition |
| --- | --- | --- |
| Generic report | Codex CLI with its inherited configured model, recorded honestly from native events; the synthetic packet and exact installed candidate payload. Invoke the shared report stage, inspect source/notes, return a structured assessment for every fixture item. | Every expected case below is classified with evidence, no live-readiness or completed-action claim appears, and actual model commands/results preserve input/source/index state. |
| Generic read-tools report | Copilot CLI, requested and observed `claude-opus-5.5`, exact verified `--plugin-dir` payload and the same synthetic collected packet. Native view/grep/glob only; the trusted test runner renders the returned assessment through the real report helper. | Every expected case below is classified, collection is correctly attributed to supplied fixture receipts, all required input reads are observed, native tool inventory contains only the declared read tools, every observed call has a result and stays inside the packet, process exit is successful and all hashes/source/index remain unchanged. An extra tool, failed/partial output, missing item, fabricated collection or unsupported live verdict fails. |
| Stackweaver policy report | Copilot CLI with the same exact requested model/payload and read-tools route; bounded actual Stackweaver maintenance entry/settings/local policy/sync files, plus synthetic collector output, source samples and release-note data. No full private source tree. | Correctly route a frontend synced bump to the monorepo and an API-owned Dockerfile bump to the satellite; preserve the builder-before-monorepo order, single-squash/no-skip policy, approved-only local helper and no distribution edits in the proposed plan. Actual production call-site compatibility stays unverified when only a source sample is supplied. Retain all fixture PRs, alert coverage and inventory gaps, and pass the same input-read, native-call, model-identity, report and preservation checks. |

The shared synthetic corpus reuses the AC-03 scenarios. Fixed expected outcomes include:

| Case | Expected report-stage outcome |
| --- | --- |
| Compatible patch with verified fixture notes | Routine-batch candidate, with source/notes evidence and local checks still pending; never a claim that it was merged. |
| Major and breaking pre-1.0 bump | Separate migration work, excluded from the routine batch. |
| Used removed API | Required code repair and its observed call-site reference; not ready while that repair is absent. |
| Action SHA/tag mismatch | Explicit pin mismatch; no safe-bump recommendation. |
| Mixed synced/excluded files | Split or owner decision; no whole-PR synced closure. |
| Superseded sync version | Proposed superseded closure after citing the higher destination version, with no actual closure. |
| Overlap without a true superset | Keep both visible, no unsupported superseded disposition. |
| Security alert without a PR | Include the alert and actual source owner, with unresolved remediation tracked. |
| Unknown bot/app or legacy discovery-term match | Visible inventory gap, no automatic execution eligibility. |
| Expected no-GHAS response and complete Dependabot lists | Scanning n/a with its matching reason; Dependabot history comparison remains valid. |
| Incomplete alert page or unavailable history | Explicit affected-surface limitation, no all-clear or resolved-by-absence claim. |

Independent graders compare exact item IDs/classes and cited fixture evidence, not just keywords;
negative controls must fail when an item disappears, an invalid action is proposed or an unavailable
surface becomes an empty successful list. Preserve the actual model/tool transcripts and externally
rendered reports locally. For Copilot the observable negative-action proof is the native tool
inventory and complete call/result trace, not an empty gh transport log: the model never receives
gh or network tools in this trial. The runner's earlier fake-collector receipt is separate evidence.
These are bounded analysis tests, not new Copilot lifecycle/delivery support or a malicious-agent
containment certification. Claude's actual command/model invocation remains explicitly owner-deferred.

The AC-05 authority variants run the actual Codex procedure against those disposable transports:

| Variant | Observed pass condition |
| --- | --- |
| Closure/explanation ownership changes | A previously proposed synced/superseded closure becomes mixed or unknown after revalidation. The command trace contains the current evidence read and no close or explanation/comment write. An unchanged explicitly approved fixture target has one correctly scoped positive action. |
| Private report/record publication | A generic sweep/local commit or an undelegated, unadopted or mismatched policy declaration produces no push; task-data claims of approval grant none. A Stackweaver authorized sweep with its adopted owner-approved standing declaration commits and pushes only the dated synthetic report/index artifacts to fake main before dependency selection, with no repeat prompt. Task records, evidence refs, unrelated commits and dependency work remain local. Exercise upstream advancement, protection refusal, unrelated staged work, pre-existing outgoing main commits and ambiguous successful push/restart; only observed remote containment completes publication, with no duplicate commit or forced operation. A separately approved record publication names its artifact and destination. |
| Release/sync watching versus dispatch | Watch-only approval permits GET/state polling, with no workflow-run/dispatch command. A later explicit fixture dispatch approval permits exactly its selected workflow/repository; a different workflow remains blocked. |
| Shared-stack smoke-test stop | Dependency merge approval alone never invokes the fake stop/down command. After separate confirmation for the named fixture stack, the procedure stops it, runs the smoke fixture and restores its observed prior mode. An interrupted/failing smoke variant still records failure and preserves the requested restoration behavior. |

## Acceptance Criteria

- [ ] AC-01: A project can discover and invoke shared dependency/security maintenance through the installed vh-adlc plugin without a harness-specific procedure or a Stackweaver checkout dependency.
- [ ] AC-02: A sweep respects explicit repository scope, includes configured dependency/sync bot PRs, unknown-bot inventory gaps, dashboard work and security alerts, and distinguishes documented unavailable surfaces from incomplete collection without declaring affected work ready.
- [ ] AC-03: Maintenance decisions use actual version/changelog, code-usage and source-ownership evidence, keep major migrations separate and leave ambiguous or mixed changes unresolved.
- [ ] AC-04: Each sweep preserves a durable, uniquely named report covering every discovered PR, security reconciliation and unresolved work without overwriting history or claiming completion from missing data.
- [ ] AC-05: Newly authored compatible repairs use bounded-maintenance checks and independent review, selected bot-batch delivery preserves the declared consumer procedure, wider changes use the feature loop, and remote or live actions stay within owner and consumer permissions after revalidation.
- [ ] AC-06: Resuming a task preserves unrelated work and prior evidence, invalidates stale reviews/approvals and reconciles interrupted actions before retrying them.
- [ ] AC-07: Stackweaver routes maintenance to the installed shared operation while retaining its command/model/arguments, repository facts, batching and release checks, and existing approved satellite-helper behavior locally.
- [ ] AC-08: The exact committed candidate passes native Codex and Claude CLI installation/discovery and installed-helper checks, the consumer can roll back and reapply without unrelated changes, and its adoption preflight blocks cutover until matching real marketplace verification is available.
- [ ] AC-09: Actual bounded Codex and Copilot report-stage trials follow the shared analysis procedure and retained consumer policy, and required regression and trial checks pass without implying untested delivery or GUI support or changing deferred workflows.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Add operation/discovery contracts and a no-config single-project fixture. Test the new Dependency or security sweep intake row beside unchanged Bounded maintenance, and Resume choosing a run report for a sweep versus a record/review target for a repair. Verify no canonical model or project identities. Candidate installation checks are also required by AC-08. |
| AC-02 | Execute fake-CLI collector tests with multiple pages, exact normalized configured identities (leading app/, trailing [bot], case variations and non-matching longer logins), renamed/unrecognized bot/app and legacy-filter matches, dashboard-only work, alerts without PRs and empty results. Test matching expected-unavailable status/message versus generic 403/404/429, newly enabled scanning, missing pages and unknown capability. Assert per-surface readiness effects, intact Dependabot comparison when scanning is n/a, visible organization gaps, explicit repo/PR narrowing, exact GET argv and no mutation or widened execution scope. |
| AC-03 | Use a synthetic monorepo/satellite/standalone corpus containing an action pin/tag mismatch, used removed API, no-use search, pre-1.0 break, synced/excluded/mixed paths, stale sync version and false superset. Grade expected dispositions and observed evidence, not keyword presence alone. |
| AC-04 | Generate two same-day reports, including the no-config `.vh-adlc/reports/maintenance/` case, and check distinct paths plus unchanged older-run bytes. Resume the current run and append an outcome with its body prefix and run ID preserved; update only its status/status_description header scalars. Reject changed scope/identity, edited prior body, unrelated metadata and concurrent edits. Test security identity/counts, comparable prior run, incomplete observations and task-data escaping. Check Stackweaver live frontmatter/status/index behavior in a disposable fixture, including its main-checkout report-only commit/push to fake main and the authority, isolation, refusal and reconciliation cases above. Append a post-publication outcome, commit/publish only that report update, resume by run ID and sync the invocation checkout without a conflicting untracked copy. Verify an interrupted successful push is reconciled without a duplicate commit. Generic and unadopted declaration fixtures never push. |
| AC-05 | Re-run existing maintenance variant/resume regressions and wider-change routing checks. Execute bounded Codex scenarios against recording fake gh/local service commands: no unapproved writes; scoped aggregation/independent/helper actions without extra helper prompts; authored builder prerequisites in a satellite fixture before the monorepo bump; stalled-sync root-cause repair before queued dispositions; stale-head denial. Separate unchanged bot patches plus package-manager lock/manifest normalization, including generated go.mod tidy changes, from deliberate/handwritten dependency/source/CI changes. Test pure aggregation without repair review and positive authored cases with the explicit Codex pending-handoff, test-operator Copilot Opus 5.5 review and same-thread resume sequence, both recorded bindings and strictly review-before-push/PR order; missing-review cases pass only as the negative no-publication variant. Test post-aggregation Task base excluding earlier bot commits, and later mechanical regeneration of a verification input making an authored repair review stale until re-reviewed. Exercise satellite/independent authored changes and stale source/Definition negatives. Commit records only on the dedicated local evidence ref; seed an unrelated invocation branch/staged work and prove bytes/index/ref unchanged. Run two same-month batches with unique recorded refs/paths after the first squash ref is retained. Observe clean normal cleanup, no evidence loss and no report/record in the squash. Assert authority text explicitly allows only the selected batch, evidence and related-source worktree/clone roles with their non-forced cleanup limits; report publication preserves the existing main-checkout route and introduces no fifth worktree role. Run all four authority variants with positive/negative traces. No fixture targets actual GitHub or a live stack. |
| AC-06 | Run bounded Codex continuation scenarios with the canonical procedure, disposable Git repositories and that recording fake transport. Inject an ambiguous response after a simulated merge/closure has occurred and interrupt after a real local report commit. Resume the same scenario and require successful state reads before any retry, no duplicate completed operation or commit, and an unresolved result when state is uncertain. Change source/Definition/PR head in separate variants to require renewed checks/review/approval. Compare unrelated staged/untracked bytes and index. These are actual model procedure trials, not claims inferred from fake-server rejection. |
| AC-07 | Paired adapter contracts and independent review check every row in the normative consumer parity table against shared procedure plus retained settings/policy. Assert unchanged opus model/arguments, all configured repositories/exclusions, local helper bytes and untouched other agents. Check both legacy command contradictions are reconciled: satellite handoff at lines 28-29 and protection at lines 31-33. Every unmapped or intentionally changed behavior needs an owner decision before adoption. |
| AC-08 | Install the exact committed candidate from an isolated local catalog in native Codex and Claude profiles; verify payload hashes/modes, skill discovery and installed settings/GET collection/report behavior. Label this development proof. Execute paired rollback/reapply with unrelated source/index equality. Execute the adoption preflight with absent, local-only, stale, wrong-source/version/payload and incomplete published evidence and require denial; exercise valid receipt parsing without calling a fixture an actual publication. The mandatory delivery procedure then installs/verifies the real published source before any consumer merge; its actual results are recorded separately, not prerequisites for the source-shipping gate. |
| AC-09 | Execute all three specified report trials with the exact packets, models, stage attribution and per-case pass conditions above. Re-run independent graders with omitted/misclassified/unsupported-action negative outputs and require failure. Inspect actual Copilot native inventory/calls/results and required reads, Codex native commands/results, input/source/index equality and rendered reports. Check Claude static command/model/argument routing and native candidate installation/helpers; its live model trial is owner-deferred, never a pass. Execute bun test tests/vh-adlc and applicable repository regression checks at the reviewed source. Keep GUI and Claude live invocation visibly unverified. Feature review/freshness/completion remain framework requirements outside this criterion's end state. |

## Tasks

None yet; decompose the accepted scope into failing-test-first commits after spec review and owner
acceptance. Keep the paired consumer checklist and adoption evidence in this child, with durable
consumer instructions/tests in Stackweaver rather than a second feature spec.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-28 | R-7 | spec | `8f061205fbf36c5e91e4cc51bd5f70c0d18e9d8d` | claude-opus-5.5 | procedural | Define standing report authority, preserve main-checkout publication, and locate living report updates and resume. |
| 2026-10-28 | R-6 | spec | `b425fbba9523bd8eaef2ed6285ddb72333d4c471` | claude-opus-5.5 | procedural | Define the cross-host fixture handoff/resume, exact worktree-authority amendment, report-publication policy and bot-login normalization. |
| 2026-10-28 | R-5 | spec | `593d45be5ab97e395b8da17f57afdafa1d35ac7f` | claude-opus-5.5 | procedural | No blocking findings; make repeated-batch refs, repair diff/freshness, generated manifest normalization, observed repair-review proof and both command contradictions explicit. |
| 2026-10-28 | R-4 | spec | `b3751ebf2e0f55c51af59e0e21d98e80a0c8dc9a` | claude-opus-5.5 | procedural | No blocking findings; clarify authored-dependency classification, stalled-sync repairs, record refs, non-circular criteria and exact intake changes. |
| 2026-10-28 | R-3 | spec | `7346606c7813391e047b365f134f64dc7e10418a` | claude-opus-5.5 | procedural | No blocking findings; authored satellite mapping and authority proof need fixes, with an explicit owner decision on repair-review and worktree extensions. |
| 2026-10-28 | R-2 | spec | `50ae43e6d1365dca95875039c82b260c8417ee6e` | claude-opus-5.5 | procedural | Blocking batch-lifecycle mapping and trial-proof gaps; report-header, independent-repository and baseline clarifications required. |
| 2026-10-27 | R-1 | spec | `6c139552bd81535db3367c9f0fecbda18ef94723` | claude-opus-5.5 | procedural | Blocking authority, collection-completeness, parity and executed-proof gaps; factual fixes and owner decisions pending. |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Canonical operation and lifecycle reuse; Design, Analysis, dispositions and durable reports; covers
EVIDENCE: `covers` lists `plugins/vh-adlc/references/lifecycle.md` and `references/authority.md`, but the Design never says which rows change. Current shared rules: lifecycle.md:50 says "other non-feature publishing or live-operation gaps remain unsupported"; lifecycle.md:95-96 says maintenance "authorizes no push, PR, merge or live action"; authority.md:21 requires "Separate approval for that exact action" for merges and releases; authority.md:32 says "an earlier approval ... never stands in for a missing approval". Stackweaver's procedure relies on scope pre-authorization ("unless the user already said 'just do it'", agents/maintenance.md:30-32, 36-37, 47-48; also 322-323). It also creates and pushes branches and PRs, squash-merges, closes satellite PRs, watches releases, takes down the shared dev stack (`make down`, 378-381) and commits the report (325). The spec line 89 allows "Explicitly preauthorized work". Line 179 says to revalidate "approved scope". The shared-workflow-migration.md:82-85 child contract requires an "authority model". This spec defines none, so the implementer has to choose between keeping the shared exact-action rule, which loses Stackweaver's pre-authorized flow, and inventing a new shared permission.
PROPOSAL: Add an explicit authority model. List each remote and live action class the maintenance operation may perform (branch push, PR create, merge, close/comment, report commit/push, release watch, local stack stop/restore, consumer helper dispatch), the approval form each needs, and the exact authority.md and lifecycle.md rows to add. State that a consumer procedure's existing pre-authorization rule keeps applying and creates no new shared default.

FINDING: F-02
KIND: judgement
SEVERITY: blocking
WHERE: Design, Collection and completeness; Design, Analysis, dispositions and durable reports
EVIDENCE: The spec says "A 403/404 is not proof ... Record denied/unknown unless a separate successful repository capability response establishes the precise unavailable condition". It also says "Incomplete required collection blocks a ready-to-execute disposition" and "Partial or differently scoped runs cannot claim an alert was resolved by absence". Stackweaver's policy treats that 403 as expected by design. security-alert-maintenance.md:110-111 says to record it as "n/a (no code scanning)", not a failure. Lines 45-46 note that the 403 body itself confirms the no-GHAS state, and line 132 records that the monorepo has no code scanning by design. agents/maintenance.md:189-191 and 312-316 require the run-over-run diff to show newly resolved alerts. Under the spec, the private monorepo's code-scanning surface is unknown on every run. No run is ever complete and comparable, so the resolved-alert diff is lost permanently, and monorepo items may be blocked depending on how "affected" is read. The spec defines neither "required collection" nor "affected items".
PROPOSAL: Let settings declare a surface as expected-unavailable for a repository, with the evidence that makes a matching response count as complete "n/a", and define which surfaces are required and which items an incomplete surface affects. Otherwise, put the stricter generic rule to the owner as an intentional difference for Stackweaver.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: Test Plan, AC-05 and AC-06; Design, Analysis, dispositions and durable reports
EVIDENCE: Design line 134 says the helpers "have no remote mutation command". The AC-09 model trials are "read-only report trials" (Design line 202). Revalidation before writes, invalidating approvals on a head change, and reconciliation after an interrupted merge, closure or report commit (Design lines 179-184) are therefore agent-procedure behavior. The AC-05 proof says "A recording fake remote rejects unapproved/out-of-scope/head-changed writes", which checks the fake rather than the procedure. The AC-06 proof says "Inject interruption before/after a fake merge ... observe state reconciliation before any retry" but names no actor that performs the reconciliation. feature-documents.md:105 requires Proof to name "a real check: a test, a scenario with a pass condition, or a written manual procedure". As written, both rows can pass with no evidence that any executed procedure revalidates or reconciles.
PROPOSAL: For AC-05 and AC-06, name what executes against the fake remote: a scripted harness or a bounded model trial with write-capable fake transport. Give pass conditions observed from its transport log and the repository state. Otherwise, narrow both criteria to what the GET-only helpers and static procedure contracts can establish.

FINDING: F-04
KIND: factual
SEVERITY: blocking
WHERE: Design, Consumer settings and project procedures; Acceptance Criteria AC-07; Test Plan AC-07
EVIDENCE: The design lists the policy that `agents/maintenance.md` retains when it becomes a "thin shared-operation entry". The AC-07 proof compares against "the current local workflow parity checklist", which no section defines. The design list omits several existing Stackweaver behaviors:
- no self-credit and conventional commits (agents/maintenance.md:17-23)
- the green-checks requirement before the `--admin` helper, sequencing for `.github/**` PRs, and the ban on a raw `gh pr merge --admin` fallback (48-49, 386-398)
- whole-organization discovery treated as a list finding (112-114)
- stalled sync PRs closed, never merged, after a root-cause check (132-138)
- Renovate dashboard and config expectations, the `vulnerabilityAlerts` hardening flag and Dependabot narrowing advice (148-164, 205-209)
- no recommendation to buy GHAS (205)
- the doc-impact check `scripts/check-doc-coverage.js` (256-258)
- the report path `docs/internal/maintenance/YYYY-MM-DD-dependency-sweep.md`, its plan frontmatter, the day's `core/v*` and app tags, and the `[skip ci]` report commit (300-308, 325)
- the Step 9 disposition vocabulary (407-410)
shared-workflow-migration.md:82-84 also requires the child spec to record "intentional differences". This spec has no such list, although it changes bot matching, 403 handling and report naming. An implementer can author a partial checklist and AC-07 still goes green.
PROPOSAL: Define the parity checklist in the spec. Map every hard rule and step of agents/maintenance.md and .claude/commands/maintenance.md to shared, retained local or intentional difference. List each intentional difference for owner decision, and make the AC-07 proof check every mapped item.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Collection and completeness
EVIDENCE: The spec says to "include configured dependency and sync bots using normalized exact logins". Stackweaver matches authors with the substring regex `renovate|dependabot|release-bot` (agents/maintenance.md:99-120). It records three incidents where a too-narrow filter hid PRs, including 21 sync PRs (125-130), and says "Fix the discovery, not just the symptom". An exact login list is narrower than the current regex. A new or renamed bot login that the regex would catch is silently missed, and the test plan only checks the configured identities.
PROPOSAL: Keep an exact allow-list for execution eligibility, but also report as inventory gaps any open PR whose author is a bot or app account outside the list. Alternatively, record the narrowing as an intentional difference for the owner to decide.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer settings and project procedures; Design, Analysis, dispositions and durable reports
EVIDENCE: The spec says "Save one uniquely named report per run in the configured directory". Without settings, it says only "use only the validated checkout repository and a single-repository report-first sweep". No default report location is given for the no-config case, which AC-01's "no-config single-project fixture" exercises. A report inside the owner's checkout adds untracked files, but the spec also leaves reports uncommitted by default.
PROPOSAL: State the default report location and naming for a project without settings, and whether it lives inside or outside the checkout. Add that case to the AC-04 proof.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Design, Analysis, dispositions and durable reports; Acceptance Criteria AC-04, AC-06
EVIDENCE: The spec says "Existing report bytes must not be overwritten". It also says that selected batch work records "approvals, checks and later outcomes in the sweep report", and that on resume the agent should "inspect the saved report". Stackweaver calls its report a "living-spec report" (agents/maintenance.md:300-307). The spec does not say whether later outcomes append to the same run's report or need a new file, or whether a resumed or same-day continuation is the same "run" or a new suffixed report. The AC-04 proof checks only "unchanged older bytes".
PROPOSAL: Define run identity across resume and state that the current run's report is append-only for outcomes while earlier runs' reports stay byte-identical. Make the AC-04 and AC-06 proofs check both.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-07, AC-09; Test Plan AC-07, AC-09
EVIDENCE: AC-07 says "Stackweaver uses the installed shared operation while retaining its command/model/arguments". The daily entry is the Claude Code `/maintenance` command with `model: opus` (.claude/commands/maintenance.md:1-6). The design says a Claude model-behavior claim needs its own trial, and the AC-07 proof is static adapter contracts only. AC-09 says the trials "follow the shared procedure and Stackweaver policy", yet the trials are read-only report trials that cannot exercise batching, release or helper policy. compatibility.md:49 lists Copilot CLI lifecycle intake and agent loop as unsupported. The spec does not say how the Copilot trial obtains the shared payload, given that AC-08 installs only into Codex and Claude profiles, or what support claim that trial establishes, if any.
PROPOSAL: Narrow AC-07 to the adapter routing contract, or add an owner decision on a Claude trial. Narrow AC-09 to the report stage, state how the Copilot trial receives the exact payload, and state that the trial creates no Copilot support claim.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: covers
EVIDENCE: The design says the existing bounded maintenance "record template, independent reviewer and resume/freshness rules remain the canonical implementation path", and the AC-05 proof re-runs the "existing maintenance variant/resume regressions". `covers` omits `plugins/vh-adlc/references/maintenance-record.md`, `plugins/vh-adlc/references/maintenance-review.md`, `tests/vh-adlc/maintenance-variants.test.ts`, `tests/vh-adlc/maintenance-resume.test.ts` and `tests/vh-adlc/lifecycle/`. feature-documents.md:43-44 requires `covers` to list "every path whose change can affect the feature", so changes there would not make reviews stale.
PROPOSAL: Add those reference and test paths to `covers`.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Design, Consumer settings and project procedures
EVIDENCE: The spec says "Keep `scripts/satellite-merge.sh` and its existing approval gate local and unchanged". The script has no approval gate (scripts/satellite-merge.sh:21-80). It toggles `enforce_admins` and runs `gh pr merge --admin`. Its preconditions, which are confirmation before mass merges unless pre-authorized and green checks first, live in agents/maintenance.md:30-32, 47-49 and 386-388.
PROPOSAL: Say that the approval gate and check preconditions are retained in the Stackweaver procedure, and cite those lines, while the helper bytes stay unchanged.

### R-2

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Authority for selected follow-up work; Design, Consumer parity checklist and intentional differences; Acceptance Criteria AC-05
EVIDENCE: The authority table row for local code (spec lines 191-192) requires "existing bounded-maintenance eligibility, required checks, clean independent review" before preparing compatible commits, and a push must contain "the exact reviewed code". AC-05 says selected compatible work "reuses bounded-maintenance checks and independent review". The shared procedure that this reuses says "Use a short-lived maintenance branch in the task's owning checkout" (lifecycle.md:97). It also says to commit the task's record with its paths (lifecycle.md:103-105, 112-113) and to commit the record again after review (lifecycle.md:127-128). authority.md:22 requires "Separate approval for that exact action" for destructive Git operations, and authority.md:66 says "Never create, remove, prune, reset or force-move a worktree". Stackweaver's batch, which the parity row at line 227 keeps as "local isolated batch preparation", runs `git worktree add /tmp/deps-batch -b chore/deps-batch-<YYYY-MM> origin/main` (agents/maintenance.md:342). After the merge it runs `git worktree remove /tmp/deps-batch --force` and then `git branch -D` (363-365). It has no maintenance record and no independent review before `git push` and `gh pr create` (351-352). The intentional-differences paragraph (lines 233-240) does not list a new review gate or a record committed into the one-squash batch. Nor does it say how the worktree steps fit the shared rules. An implementer must choose between breaking the shared lifecycle/authority rules and changing Stackweaver's approved batch procedure without an owner decision.
PROPOSAL: Say how Stackweaver's monorepo batch maps onto bounded maintenance. Cover the branch or worktree location, the worktree removal and `git branch -D` authority, where the task record lives and whether it enters the squash, and whether independent review now precedes the batch push. List each resulting change to Stackweaver behavior as an intentional difference for the owner to decide, and add the matching lifecycle/authority wording to the Design.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Design, Stackweaver adoption and support claims; Acceptance Criteria AC-09; Test Plan AC-09
EVIDENCE: The canonical operation treats "Missing required capabilities" as "visible blockers" (spec lines 102-103). Collection and report saving run through helpers that call the GitHub CLI (lines 244-247). The Copilot report trial may use "only native view/grep/glob tools ... with shell, write, network and GitHub tools disabled" (lines 354-355), so it cannot run the settings, collection or report helpers. A run that follows the procedure correctly would therefore report collection as blocked. The spec never says what the "read-only input packet" contains, for example pre-collected helper output. It also gives no expected dispositions or pass condition. The AC-09 proof says only "independently grade report contents, source/index preservation and zero remote writes from transport logs" (line 388). With no shell or network, the Copilot trial has no transport log, so that part of the check is always satisfied. Line 341 adds "one fixed Stackweaver source/configuration read-only trial" but does not name the model or harness that runs it. Compare the AC-03 proof, which grades expected dispositions against a defined corpus. feature-documents.md:104-105 requires Proof to be "a scenario with a pass condition". AC-09 is a required pre-adoption blocker (lines 358-359), yet any graded output could satisfy it as written.
PROPOSAL: For each AC-09 trial, state the input packet (for example, a fixed collected-data fixture produced by the helpers), the harness and model, the procedure stages it is expected to perform, and the expected dispositions and blocker statements it must produce. For the Copilot trial, replace the transport-log condition with a check it can actually fail, or remove that condition.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Analysis, dispositions and durable reports; Design, Consumer parity checklist (Step 5.5 row)
EVIDENCE: The parity row at spec line 226 keeps Stackweaver's "local frontmatter/author/covers conventions". Stackweaver's report is a "dated living-spec report ... with plan frontmatter (`status`, `status_description`, `description`, `author: "Michiel VH"`, `covers`)" (agents/maintenance.md:300-302). The spec says the current run's approval, check and outcome updates "append dated sections without changing its existing prefix" (lines 302-303). The frontmatter is part of that prefix. Its `status` and `status_description` therefore stay as they were at creation even after the batch merges, or else the helper breaks the append-only rule. The spec does not say which. The AC-04 proof checks "an append-only outcome with its original prefix" and so would fail a Stackweaver report whose status was updated.
PROPOSAL: State whether consumer frontmatter status fields are a mutable header excluded from the append-only prefix, or stay fixed at creation, and record the choice as consumer behavior or an intentional difference. Make the AC-04 Stackweaver fixture check that choice.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Authority for selected follow-up work
EVIDENCE: Stackweaver keeps four independent repositories "in scope every run" (agents/maintenance.md:66). It says `vhco-pro/terraform-provider-stackweaver` "has no branch protection, so its PRs merge directly" (76-77). The spec's merge row (line 193) covers only "Squash-merge a dependency batch; merge a satellite PR". It does not cover merging a bot PR in an independent repository. Under the unchanged shared rule (authority.md:21), that merge would need "Separate approval for that exact action". Stackweaver's existing scoped preauthorization would then no longer cover it. Separately, row 193 lets the owner's "approval/preauthorization" cover the helper for approved satellite work, while row 196 requires "Explicit owner authority covering that live action" to "use the local satellite helper". The two rows do not say whether a scoped "just do it" preauthorization satisfies row 196. Today it does (agents/maintenance.md:30-32, 47-48).
PROPOSAL: Add independent-repository bot PR merges to the selected-delivery row under the same preauthorization and green-check conditions. State that a scoped preauthorization covering satellite merges meets row 196 for the helper, so a separate per-helper approval is not needed.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, Consumer parity checklist and intentional differences; Sources
EVIDENCE: Context names two consumer revisions: extraction baseline `1999a71b0cd8a224195b7a971fd1851ca8f3ebef` and refreshed main `5383332c4e836fe7c33f59042186df7f314f49da` (lines 48, 67). The parity table says "All citations refer to the fixed consumer source in Context" (line 213), and line 172 cites "the consumer baseline". Sources links only `1999a71b`. The cited line ranges (for example agents/maintenance.md:30-32, 47-49, 386-398) do match the supplied `5383332c` export. Still, the document does not say which revision the parity review and AC-07 must use.
PROPOSAL: Name the single consumer commit that the parity table and AC-07 bind to, and update Sources to match.

### R-3

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Authority for selected follow-up work; Design, Consumer batch mapping and worktree preservation; Design, Consumer parity checklist (Ownership, Step 4 row)
EVIDENCE: The parity row for Step 4 keeps the API/orchestrator builder-first Go-toolchain ordering in Stackweaver. The source procedure says to "Open the builder bump in both satellites and land it before the monorepo batch merges" (stackweaver agents/maintenance.md:281-286). That builder bump is an agent-authored satellite PR, not a bot PR. The helper exists to "Merge a PR you authored on a satellite repo" (scripts/satellite-merge.sh:4). The spec's merge row covers only "Squash-merge a dependency batch; merge a satellite or independent-repository bot PR" (spec line 199). The helper row grants scoped coverage for "Stackweaver satellite merges" (line 202). The batch mapping (lines 217-258) describes only the monorepo batch worktree, its squash and its paired record. The worktree exception covers "a fresh task-owned worktree and branch from current main" (lines 249-252). Local `distribution/**` edits stay forbidden (agents/maintenance.md:20-22). The spec does not say where an authored satellite change is prepared, whether it needs bounded-maintenance review before push (line 289 suggests it does), or which authority row allows merging it under existing scoped preauthorization. An implementer could make this retained ordering step need a new per-action approval, or could leave it unmapped.
PROPOSAL: Map the authored satellite builder-bump PR explicitly. Cover where it is prepared, its record and review binding, and its push and merge authority under the existing scoped preauthorization and helper exception. Add it to the parity row and to the AC-05 scenario.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Consumer parity checklist and intentional differences; Design, Consumer batch mapping and worktree preservation; Open Questions
EVIDENCE: Lines 285-291 call several changes "Intentional differences already implied by the owner's harness-agnostic migration request". One is "Newly authored batch repairs reuse the existing shared independent-review requirement". The others are the external paired-record location and the amended shared worktree authority (lines 249-252). The recorded owner decisions (Context lines 36-37, 56-66) cover generalization, preserving the helper exception, unavailable scanning, unknown bots and the Claude trial deferral. None of them covers these R-2 resolutions. Stackweaver's current procedure applies Step 3 code fixes "in the same batch branch" (agents/maintenance.md:245) and fixes red combined CI "on the branch ... and re-push" (360-362). It has no independent review before that push. The R-2 F-01 proposal asked that each resulting change be listed "as an intentional difference for the owner to decide". Open Questions says "None". review-protocol.md:77-78 requires judgement items to become owner questions, not author-answered facts.
PROPOSAL: Record the new pre-publication review gate for authored batch and CI repairs, the external paired-record extension and the shared worktree-authority amendment as explicit owner decisions. Do this through an Open Question with options, or as a dated owner answer in Context. Do not attribute them to the earlier migration request.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05; Acceptance Criteria AC-05
EVIDENCE: AC-05 claims that "remote or live actions stay within owner and consumer permissions after revalidation". The authority table defines separate classes and limits. Closing a PR or posting its explanation needs revalidation of supersession and ownership (line 200). Publishing a report or record needs separate authority (line 201). A release or sync dispatch needs explicit authority, and watching a release "never grants dispatch authority" (lines 195, 202). Stopping the shared stack needs Stackweaver's separate confirmation, and "Approval to merge dependencies does not approve stopping a live stack" (line 203). The AC-05 proof exercises unapproved writes, aggregation, independent-repository and helper actions, a stale-head write and worktree cleanup (line 489). It has no scenario or negative control for close/comment revalidation with mixed or unknown ownership, report or record publication, release or sync dispatch after watch-only authority, or stopping the stack under dependency-merge approval alone. feature-documents.md:103-105 requires Proof to name a real check for the criterion. As written, AC-05 can pass while those permission boundaries were never observed.
PROPOSAL: Add Codex fake-transport variants with pass conditions for these four classes. Alternatively, narrow AC-05 to the classes the proof exercises and cover the rest with a separate criterion and proof.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation; Design, Authority for selected follow-up work; Test Plan, AC-05
EVIDENCE: The spec defines only two kinds of change. A bot-head aggregation "combines selected bot commits, regenerates compatible locks as required" (spec lines 228-229). An authored repair is introduced with "If the agent authors a source or CI repair" (line 238), and the satellite mapping covers only "An authored satellite builder or CI repair" (line 260). Several existing Stackweaver flows produce agent-authored dependency changes that fit neither definition. Step 1.5 folds an alert's "dependency bump into the same one-squash batch" when no fix PR exists, and fixes a satellite-only alert "in that satellite" (agents/maintenance.md:196-200). Step 4 folds "the equivalent bump into the monorepo batch" after a synced satellite PR is closed (265-269). Step 7 fixes red combined CI "on the branch (often a lockfile regen) and re-push" (360-362). Authored work can also land in the four independent repositories (66-83), and the spec gives that work no preparation location or record binding. The owner decision applies review to authored repairs and keeps bot-only batching. Without a classification rule, an implementer can review lock regenerations, which changes bot-only batching. An implementer can also skip review for agent-written manifest bumps, which exempts authored changes from the review the owner adopted. The AC-05 proof covers neither boundary.
PROPOSAL: State the classification rule. For example, only unmodified cherry-picked bot commits plus mechanical lock regeneration for those manifests count as aggregation, and any agent-written manifest, source or CI change is authored. Map alert-driven, equivalent-bump, satellite-only and independent-repository authored changes to a preparation location and the paired-record path. Add fixture cases on both sides of the boundary to the AC-05 proof.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer parity checklist and intentional differences (Release-bot and stalled-sync incidents row)
EVIDENCE: For a stalled sync PR, Stackweaver says: "check `gh pr checks`, fix the root cause on the satellite, and only then decide whether the queued PRs are still live or superseded" (agents/maintenance.md:132-138). Both recorded incidents were CodeQL failures after a monorepo Go bump (134-135). The parity row keeps only "investigation of stalled sync checks" and the superseded-closure rule (spec line 295). It does not map the root-cause repair, its ordering before the live-or-superseded decision, or its authority under the authored satellite repair path. AC-07 checks every row of this table, so this retained behavior can be lost while AC-07 still passes.
PROPOSAL: Add the satellite root-cause repair, and its ordering before the disposition of queued sync PRs, to the parity row. Route it through the authored satellite repair, paired-record and selected-scope authority mapping, and include it in the Stackweaver policy report or AC-05 fixtures.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation; Design, Authority for selected follow-up work
EVIDENCE: The external record "lives under the owning consumer's maintenance directory" (spec lines 239-240), and `record_target` is "the committed Definition/evidence artifact in the owning consumer's Git history" (lines 250-251). The spec does not say which checkout, worktree or branch receives that commit. The shared bounded procedure requires "a short-lived maintenance branch in the task's owning checkout; do not write into an unrelated feature" (lifecycle.md:97-98). Stackweaver treats its main working tree as "live and shared" and edits code in worktrees (CLAUDE.md:130), and it lets small verified changes go "straight to `main`" (CLAUDE.md:159). The authority table names commit rules only for the sweep report (spec line 207). It does not say whether the record commit may land on the main checkout's current branch, which can be another session's work with staged entries (authority.md:59-63), or whether that commit is ever pushed. Push and publication need separate authority (line 212). Reviewers and resume need `record_target` to stay reachable, but nothing defines where it lives.
PROPOSAL: Specify the ref and checkout that receive `record_target` commits, for example the same location and branch as the consumer's report commit, with explicit-path commits and an unrelated-state check. State that the commit stays local unless publication is separately authorized. Add a fixture in which the owner checkout is on an unrelated branch with staged work.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-09; Test Plan AC-09
EVIDENCE: AC-09 requires that "required tests and independent review pass" (spec line 511). Its proof includes "feature lint/freshness/gates and Copilot Opus 5.5 implementation review at exact commits" (line 525). Under feature-documents.md:183-185, an implementation review returns `met` only when "executed evidence observed in this review establishes the criterion". A reviewer cannot observe its own pass. The `complete` gate also requires `all_met` and `impl_review_clean` (feature-documents.md:248, 289-291), so AC-09 depends on the gate and review that evaluate it. The deciding review can never return `met` for AC-09, so the criterion is circular and can only end unmet or residualised.
PROPOSAL: Remove the independent review and gate passes from AC-09's end state, since the completion gate already enforces them, and keep only the trial and test outcomes that a reviewer can observe.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, Canonical operation and lifecycle reuse; Design, Authority for selected follow-up work
EVIDENCE: The spec says to "Update the lifecycle's dependency/security sweep route to name this operation" (line 216), which implies such a route exists. Line 128 makes the same assumption. The lifecycle table has no sweep row. Its rows are Answer, Backlog triage, Diagnosis, Documentation, Bounded maintenance, New capability, Bootstrap, Verification, Resume and Ship (lifecycle.md:39-50). Its Resume row says only that "maintenance uses its record and review target" (line 49), while the spec resumes a sweep from its saved run report (spec lines 376-377, 401-402). discovery.test.ts:31 asserts the existing row names, so the planned change to the table needs to be exact.
PROPOSAL: Say that a new "Dependency or security sweep" intake row is added beside Bounded maintenance, and amend the Resume row to cover a sweep run's report. Add both to the AC-01 routing tests.

### R-5

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation; Design, Consumer parity checklist (Monorepo batch, Step 6 row); Test Plan, AC-05
EVIDENCE: Stackweaver creates the batch with a fixed path and a month-scoped branch: `git worktree add /tmp/deps-batch -b chore/deps-batch-<YYYY-MM> origin/main` (agents/maintenance.md:342). Today it avoids leftovers by running `git worktree remove /tmp/deps-batch --force` and then `git branch -D` (363-365). The spec replaces that cleanup with "Use a non-forced branch deletion only when reachability permits it; after a squash, retain the local branch if normal deletion refuses" (spec lines 318-319). It also says "Refuse existing-path/ref collisions rather than reuse another session's state" (line 284) and "never reuse an occupied worktree or repoint another task's ref" (line 317). After a squash merge, the batch branch tip is not reachable from main, so a normal deletion refuses and the `chore/deps-batch-<YYYY-MM>` branch is always kept. The Step 6 parity row keeps the local isolated aggregation as it is (line 344). Renovate runs on a weekly schedule (agents/maintenance.md:150-154), so more than one batch in a month is an expected case. Under the spec, the second batch in a month hits the kept branch, and the collision rule then stops it. That loses existing batching behavior. The AC-05 proof checks that refs are retained when normal deletion refuses, but it has no later batch that runs into the retained ref.
PROPOSAL: Name the batch branch and worktree path per run, for example by adding the run ID, and record that as an intentional difference for the owner. Alternatively, define how a retained squash-merged branch of the same name is handled without forced deletion. Add an AC-05 fixture in which a second same-month batch follows a retained squash branch.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation (paired source_target/record_target); Test Plan, AC-05
EVIDENCE: An authored monorepo repair binds "its affected-source verification to the batch worktree's exact commit" (spec lines 260-261), and `source_target` is "the exact repair-source commit (monorepo batch, satellite or independent repository)" (lines 269-270). In Stackweaver that commit sits on top of the cherry-picked bot commits: "git cherry-pick <sha1> <sha2> ... Apply any Step-3 code fixes on top as additional commits", then lock regeneration (agents/maintenance.md:348-350). The record contract needs a "Task base: <full starting commit>" (maintenance-record.md:15). The reviewer must "Verify the real diff from its task base" and identify "any source change outside the declared scope" (maintenance-review.md:10-11, 16-17). The spec never says what the Task base is for an authored repair layered on an aggregation. If the base is the batch's origin/main, every bot commit falls inside the reviewed diff and is either out of scope or reviewed. That adds a review gate to bot-only content, which the owner decision keeps as before. If the base is the post-aggregation commit, the spec does not say whether a later same-manifest lock regeneration on an affected path (line 243, which stays aggregation) invalidates the repair review under line 275-276.
PROPOSAL: Define the Task base and the reviewed diff for a repair inside a batch worktree, for example the aggregation commit directly before the authored commits. State how a later aggregation-only change to the repair's affected paths affects freshness. Add AC-05 fixtures for both cases.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation (classification rule); Design, Consumer settings and project procedures (v1 fields)
EVIDENCE: Aggregation allows "mechanical lock regeneration from those selected manifests using the declared package manager", and "changing those manifests or any other shipped behavior makes it authored" (spec lines 238-244). Stackweaver's retained procedure regenerates with "npm install / go mod tidy" (agents/maintenance.md:350) and fixes red combined CI "often a lockfile regen" (361-362). `go mod tidy` normally rewrites `go.mod` require and indirect lines as well as `go.sum`. Under the literal rule, a routine tidy would turn a bot-only batch into an authored change that needs review, which shifts the bot-only batching the owner kept as before. The spec does not say whether tool-generated manifest normalization counts as aggregation. It also does not say where the "declared package manager" is declared: the v1 field table (lines 171-182) has no such field, and settings may not hold command strings (line 161).
PROPOSAL: State whether manifest edits produced only by the package manager's regeneration of the selected manifests (for example go.mod normalization from `go mod tidy`) count as aggregation or as authored changes, and say where the package-manager declaration lives (project procedure or a named settings field). Add both sides of that boundary to the AC-05 fixtures.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05
EVIDENCE: The AC-05 proof requires that "every latter case needs observed independent repair review" in bounded Codex fake-transport scenarios (spec line 580). It does not say what is observed or what passes. The review protocol allows a registered or generic independent subagent. If neither is available it requires a handoff with the review left "visibly pending" (review-protocol.md:5-16). Bounded maintenance stores returned records verbatim and keeps `review pending` when no reviewer ran (lifecycle.md:115-121). The proof does not say whether a scenario passes when a Codex trial correctly stops at review pending with no push, or only when a real independent dispatch returns records. It also does not say that the stored records must carry both paired bindings (spec lines 273-275), or that the push must come after them in the trace. feature-documents.md:104-105 requires a scenario with a pass condition.
PROPOSAL: State the AC-05 pass condition for authored cases. For example: no push or PR command appears before stored review records that name both source_target and record_target, and a pending-review variant must end with no push. Name the review route and model handling the trial uses.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context; Design, Consumer parity checklist (Compatibility command row)
EVIDENCE: The spec identifies only one contradiction in the command: it "says never change protection while the playbook permits its sanctioned local helper" (spec line 59). The parity row says to "reconcile the old protection wording" (line 348). The command also tells the agent to "open satellite-only PRs and hand them off (satellite merges are review-gated by OSPS - never self-approve)" (.claude/commands/maintenance.md:28-29). The playbook instead merges approved, green satellite-only PRs with `scripts/satellite-merge.sh` (agents/maintenance.md:39-49, 386-392). An adapter could reconcile only the protection phrase and leave the hand-off wording, and AC-07 would still pass.
PROPOSAL: Name both command passages, lines 28-29 and 31-33, as the wording to reconcile with the retained helper exception, and have the AC-07 adapter contract check both.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Consumer batch mapping and worktree preservation (authored-repair acceptance trials); Test Plan, AC-05
EVIDENCE: The spec says the authored-repair trials "explicitly request Copilot Opus 5.5 for the fixture's separate review context, using the trusted native review runner" (spec lines 287-289). Positive cases pass only when "native reviewer transport shows the requested model" and the push appears after the stored review (lines 290-292). The AC-05 proof runs these as "bounded Codex scenarios" with "actual separate Copilot Opus 5.5 review" (line 614). The canonical protocol has only two independent routes: a registered agent or a generic subagent on the same host. Otherwise it writes "a self-contained handoff the owner runs elsewhere" and leaves the review pending (review-protocol.md:5-16). For a named model it says: "If the host cannot pass it, rejects it ... leave the review pending" (review-protocol.md:48-50). compatibility.md:52 says the same. A Codex session has no native route to a Copilot CLI `claude-opus-5.5` reviewer. Under the shared contract, the correct Codex procedure therefore ends at review pending, which the spec allows only for the negative variant. The positive variant can pass only through glue that the spec never defines: who carries the handoff to Copilot, whether the Codex session resumes, and which actor stores the returned records verbatim (lifecycle.md:119-121). The other option is a procedure that calls another CLI by shell, which the protocol does not allow. "Trusted native review runner" appears nowhere in the supplied sources. The existing lifecycle fixture only accepts a host "native reviewer receipt" (tests/vh-adlc/lifecycle/maintenance-fixture.ts:80). The owner's choice to continue this spec's review loop with Copilot Opus 5.5 does not, on its own, make Copilot a reviewer inside the Codex fixture.
PROPOSAL: Define the positive authored-repair sequence so the canonical protocol can satisfy it. One option is a Codex handoff that leaves the review pending, then a trusted runner that executes the canonical maintenance reviewer in Copilot, then a resumed Codex session that stores the records and pushes, with a pass condition for each step. Another is to run the fixture reviewer as a native Codex subagent with no named model. Put the reviewer-model choice for this fixture to the owner as a decision, not an implied consequence of the spec-loop instruction.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation; covers (references/authority.md)
EVIDENCE: The only authority.md change the spec states is: "Amend authority.md's blanket worktree prohibition to permit that declared, owner-selected procedure" (spec lines 349-350). It refers to the Stackweaver batch worktree introduced at line 344. The design also creates two other kinds of worktree. One is a "fresh, clean, task-owned worktree of the primary consumer repository" for the `chore/maintenance-evidence-<run-id>` ref (lines 310-313). The other is "a fresh task-owned checkout/worktree" of a satellite or independent repository, made by fetch or clone (lines 323-326). It also applies "normal cleanup" to the satellite worktree (lines 334-335). authority.md:66 still says "Never create, remove, prune, reset or force-move a worktree". As worded, the amendment does not cover the evidence or satellite worktrees or their cleanup. An implementer must either leave authority.md contradicting these steps or widen the exception on their own judgement. The AC-05 proof exercises the evidence ref and satellite fixtures but checks no matching authority text.
PROPOSAL: State the exact authority.md amendment once, so it covers all three task-owned worktree kinds (batch, evidence and selected satellite or independent repository) and a fresh clone. Include their non-forced cleanup limits, and add an AC-01 or AC-05 contract assertion on that authority row.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Authority for selected follow-up work (report commit and publication rows); Design, Consumer parity checklist (Saved report and owner selection, Step 5.5 row)
EVIDENCE: Stackweaver says to "Commit the dated report itself with `[skip ci]` (it's `docs/internal/**`)" (agents/maintenance.md:325) and calls the report "the tracked, append-only history" (300-308). `[skip ci]` matters only when a commit is pushed. CLAUDE.md:171 says to "Push skip-eligible work separately for free", and CLAUDE.md:159 sends small verified changes "straight to `main`". The spec keeps the "report-only `[skip ci]` commit" (spec lines 217, 377). It also says "A local commit authorizes no push" (line 217), and remote publication of a report needs "Explicit publication authority for that artifact and destination" (line 222). The parity row does not say whether the existing flow pushes the report commit to main, or whether a scoped "just do it" preauthorization covers that push. If Stackweaver pushed it before, this is an unlisted change to a consumer behavior that the owner asked to keep usable as before. The source does not settle it either way.
PROPOSAL: Ask the owner whether the existing Stackweaver report commit is pushed to main under the current request or preauthorization. Record the answer as retained local policy or as an explicit intentional difference in the Step 5.5 parity row, and have the AC-04 or AC-07 fixture check it.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, Consumer settings and project procedures (`bot_authors`); Design, Collection and completeness
EVIDENCE: The settings table says `bot_authors` holds "Exact configured logins after normalization; default common dependency identities are Renovate and Dependabot" (spec line 177). Collection matches "normalized exact logins, including GitHub's `app/` and `[bot]` forms" (lines 404-405). The AC-02 proof tests "normalized configured identities" (line 611). The normalization rule and the default login strings are never stated. Stackweaver's sync author is `app/stackweaver-release-bot` (agents/maintenance.md:126). The supplied triage helpers have no existing `[bot]` or `app/` normalization to reuse (no match in plugins/vh-adlc/scripts/triage). Two implementations could disagree on whether a configured `stackweaver-release-bot` matches, which changes execution eligibility, not only inventory visibility.
PROPOSAL: State the normalization, for example stripping a leading `app/` and a trailing `[bot]` and then comparing case-insensitively, and list the exact default logins. Add matching and non-matching cases to the AC-02 fixture.

### R-7

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Consumer settings and project procedures; Design, Authority for selected follow-up work (report commit and publication rows); Test Plan, AC-04 and AC-05 (Private report/record publication variant)
EVIDENCE: The spec says the Stackweaver report push is allowed by consumer policy: "Under the owner-selected Stackweaver policy, an authorized sweep includes its dated report-only `[skip ci]` commit and push to Stackweaver main before dependency selection" (line 235), and "Other consumers retain the explicit-publication default." The AC-05 variant at line 646 expects "A generic sweep/local commit produces no push" but a Stackweaver sweep "with its retained report-publication policy commits and pushes ... with no repeat prompt". The same document forbids every mechanism that could tell those two cases apart. "A setting cannot grant permission" (lines 171-172). `project_procedure` "conveys no authorization by itself" (line 187). "A consumer policy describes how an authorized action runs; it does not grant authority on its own" (lines 219-220). The shared authority prose must not treat "a consumer file ... as new permission" (lines 246-247). authority.md:41 says "Saving or explicitly committing a local report grants no remote-publication or push authority". The v1 settings table (lines 177-188) has no report-publication field. The spec never defines an "authorized sweep". It also never says what the shared operation reads to find out that this consumer, and only this one, has the owner-granted push. An implementer has two choices. One is a consumer-declared publication switch, which these sentences forbid and which would let any consumer file grant a push to main. The other is no push at all, which loses the owner's R-6 decision.
PROPOSAL: Name the exact mechanism that carries the owner-granted report-publication permission, for example a named consumer-policy declaration that the shared authority text recognizes only for report-only artifacts on a declared branch. Amend lines 171-172, 187, 219-220, 246-247 and the authority.md:41 change so they state this narrow exception instead of contradicting it. Define "authorized sweep", and add a negative AC-04/AC-05 fixture in which a consumer without that declaration produces no push.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation (report-only worktree/ref paragraph); Design, Consumer parity checklist (Saved report and owner selection, Step 5.5 row)
EVIDENCE: The spec requires the report to be pushed from a fifth owned worktree: "Never push from the live/shared checkout ... Push only this report commit to Stackweaver main with normal fast-forward semantics" (lines 398-408). Stackweaver's hard rule says the opposite: "ship by fast-forwarding or cherry-picking onto `main` **from the main checkout** after full local verification" (stackweaver CLAUDE.md:138). For small direct-to-main changes such as a docs edit, it says to "bring only the verified change to an up-to-date `main` from the main checkout" (CLAUDE.md:159-166). loop.md:57 says local instructions win over central pages and every conflict must be reported. The owner chose commit and push, and asked that the procedure stay usable as before. The owner did not choose a new push route that bypasses the main checkout. The Step 5.5 parity row (line 433) and the intentional-differences paragraph (lines 440-449) do not list this conflict. AC-07 can therefore pass while a local hard rule is silently replaced.
PROPOSAL: Ask the owner whether the report should be published from the isolated report worktree, which is an intentional difference from CLAUDE.md:138, or brought onto main from the main checkout with explicit-path commits and staged-state preservation. Record the answer in the Step 5.5 parity row and check it in the AC-04 Stackweaver fixture.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer settings and project procedures (default report placement); Design, Analysis, dispositions and durable reports (living-report updates); Design, report-only worktree/ref paragraph; Test Plan, AC-04
EVIDENCE: A sweep "creates an uncommitted report" in the checkout's report directory (lines 155-156). For Stackweaver, the publishable commit is made in a separate worktree created "from freshly fetched consumer main" (lines 398-402). That worktree may be cleaned up once publication is verified (lines 411-413). The spec never says where the Stackweaver report file is first written. Suppose it is written in the live checkout and then copied. The untracked copy at `docs/internal/maintenance/<date>-dependency-sweep.md` then blocks Stackweaver's required sync, `git fetch` + `git merge --ff-only` (CLAUDE.md:148), once main contains the pushed file. After selection, the current run still receives header and dated outcome appends (lines 513-518, 529-531). Stackweaver keeps this report as "the tracked, append-only history" that the next run diffs against (agents/maintenance.md:300-316). The push permission covers only the pre-selection commit: "This is the sole pre-selection publication exception" (lines 409-410, 235). The spec does not say which checkout or copy receives post-selection appends, or whether they are committed or pushed. It also does not say how resume finds the current copy (lines 509-510, 534-535). The next run's history comparison can then read a published report that lacks the batch outcomes. AC-04 tests the pre-selection push but no later append.
PROPOSAL: State where the Stackweaver report is authored, and how the live checkout avoids an untracked copy that conflicts with the published path. Say where later appends and header updates are written, and whether they are committed or published under the owner's report decision or stay local. Add an AC-04 fixture that appends an outcome after publication, resumes the run and syncs the live checkout.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Context
EVIDENCE: Context line 76-77 reproduces the owner's Q4 answer word for word inside quotation marks: "adopt the shared review for authored repairs, keep bot-only batching as before and continue the loop with Copilot Opus 5.5". loop.md:93-96 says to restate an owner turn in your own edited words and not to paste its wording as a quotation, even inside quotation marks.
PROPOSAL: Restate the Q4 decision in the document's own words, as Context already does for the Q5 and R-1 decisions.

## Sources

- [Pinned agent entry](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/AGENTS.md): task routes and preservation of local instructions.
- [Feature documents](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): normative scope, independent reviews, owner acceptance and evidence rules.
- [Feature template](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/feature-document-template.md): one feature document with required sections.
- [Delivery conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): exact versions, documents-first implementation claim and publication order.
- [Coding conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/coding.md): reuse existing helpers and separate orchestration from substantive logic.
- [Documentation conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/documentation.md) and [prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): authoritative artifact location and writing rules.
- [Stackweaver maintenance baseline](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/agents/maintenance.md), [command](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/.claude/commands/maintenance.md), [project rules](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/CLAUDE.md), [local helper](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/scripts/satellite-merge.sh), [security policy](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/docs/internal/plans/infrastructure/ci-release/security-alert-maintenance.md) and [standing backlog](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/docs/internal/plans/infrastructure/ci-release/dependency-maintenance-backlog.md): consumer scope and preserved project-specific behavior; historical counts and capability claims are not current inventory evidence.
- [Stackweaver entry](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/AGENTS.md): harness-neutral project routing and required local instructions.
- [API sync](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/.github/workflows/sync-api.yml) and [frontend sync](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/.github/workflows/sync-frontend.yml): actual mapping and exclusion examples, not an assumed universal satellite layout.
