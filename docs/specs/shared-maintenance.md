---
status: draft
status_description: "Copilot Opus 5.5 R-1 recorded; fixing factual findings and awaiting three owner decisions before re-review and acceptance."
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

Stackweaver baseline `1999a71b0cd8a224195b7a971fd1851ca8f3ebef` has a wider dependency workflow.
Its `agents/maintenance.md:3-49` requires actual changelog/usage analysis, report-first selection,
single-batch releases and a local satellite-merge helper. Its repository inventory, sync mappings,
release checks and security/backlog documents are consumer facts, not shared defaults.
`.claude/commands/maintenance.md:1-36` preserves `/maintenance`, its `opus` model and optional
repository/PR scope. `AGENTS.md:10-23` currently routes maintenance locally and triage to vh-adlc.
These claims were checked with `git show origin/main:<path>` after fetching both repositories.

The command says never change protection while the playbook permits its sanctioned local helper.
The owner resolved the migration intent in this session: this is Stackweaver-specific and must
remain usable as before. Preserve that helper exception and its existing approved-batch requirements
in Stackweaver. Do not turn it into a shared protection-changing default. The script itself is not
being repaired or certified by this extraction; its observed EXIT trap is not crash-proof recovery.

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

### Consumer settings and project procedures

Read optional `.vh-adlc/maintenance.json`, schema version 1. Without it, use only the validated
checkout repository and a single-repository report-first sweep. Derive repository identity from the
checkout's GitHub origin; reject ambiguous/non-GitHub identities until supplied explicitly.
Do not default to Stackweaver, its organization, its bot, or any personal path.
The default report directory is `.vh-adlc/reports/maintenance/` inside that checkout. A sweep creates
an uncommitted report there; this expected new file is declared in the handoff. A bounded read-only
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
permission or override the owner's current instruction.

Use these v1 field names so the settings guide, implementation and consumer agree. All collection
identities are scoped to the configured hostname. Collections default to empty unless noted.

| Field | Contract |
| --- | --- |
| `schema_version`, `repository`, `hostname` | Version 1; primary owner/repository and GitHub hostname, inferred from the checkout only when absent. A declared primary must match the checkout identity or stop with a mismatch. |
| `repositories` | Related repository records with `repository`, `role` (`synced` or `independent`) and optional local `sync_workflow`. No duplicate primary or related identities. A synced entry requires its local mapping reference. |
| `discovery_organizations`, `excluded_repositories` | Supplemental inventory scope and explicit no-action exclusions, with reasons recorded in the project procedure. An excluded repo may appear as a skipped inventory row, never an action target. |
| `bot_authors` | Exact configured logins after normalization; default common dependency identities are Renovate and Dependabot. Unknown-account discovery is decided in Q2. |
| `dashboards` | Repository plus exactly one issue number or exact title identifying its dependency dashboard; a missing or ambiguous configured dashboard is incomplete, not empty. |
| `generated_mirrors`, `source_references`, `backlog_references` | Local relative paths to exclude from edits or inspect for ownership/backlog. Required references must exist. |
| `report_dir`, `history_dir` | Contained relative directories; report default `.vh-adlc/reports/maintenance`, history defaults to the report directory. Source/settings/declared policy files cannot be report destinations. |
| `project_procedure` | Optional contained local policy file, read before analysis/actions. It remains authoritative for project specifics and conveys no authorization by itself. |

The local report's required metadata comes from that consumer procedure; arbitrary shell commands
or model names are not settings fields. Optional scanning expectations await Q1 and must be documented
with exact matching behavior if selected.

Stackweaver's retained `agents/maintenance.md` becomes a thin shared-operation entry and points to
project policy in `agents/maintenance-project.md`. Its settings retain the
complete existing repository list and scope exclusions; its project policy retains the authoritative
sync workflow references, major-upgrade validation, one-squash batch, no dependency `[skip ci]`,
dashboard/security/backlog links, upstream reusable-workflow tag checks, satellite builder ordering,
release/sync verification and Compose smoke-test stop/restore requirements. No local edits to
`distribution/**` become permitted. Keep `scripts/satellite-merge.sh` bytes unchanged. Its approval
and green-check preconditions live in the local procedure, not the script
(`agents/maintenance.md:30-32,47-49,386-398` at the consumer baseline). Its exception remains
specific to that procedure and approved satellite scope.
Reconcile the command's contradictory wording to point to that retained local policy, preserving
the owner's answer rather than imposing a new shared policy.

### Authority for selected follow-up work

The default remains report first. A consumer policy describes how an authorized action runs; it does
not grant authority on its own. The owner's current request or selection must cover the repository,
action class and intended work. Record that request, the selected report rows and current PR heads
before executing a selected batch. Preserve explicit preauthorization under Stackweaver's existing
policy, including its "just do it" case: do not ask again for the same already authorized scope.
New repositories, new action classes, major migrations outside the selection or material target
changes require a new decision. A recommendation in a report is not authorization.

| Action | Required authority and execution contract |
| --- | --- |
| GET inventory, release/tag/check reads and release watching | The requested sweep and its collection scope. Watching an existing release is read-only, not permission to dispatch one. |
| Create or append a local report; commit that report | The requested sweep allows local report output. A commit needs an owner request or an existing explicit consumer rule; Stackweaver's Step 5.5 retains its report-only `[skip ci]` commit. A local commit authorizes no push. |
| Prepare compatible local code, tests, locks and commits | The owner's selected/preauthorized maintenance scope, existing bounded-maintenance eligibility, required checks, clean independent review and preservation rules. |
| Push a selected branch; create or update its PR | Explicit publication authority in the current owner request or approved work selection. The selected branch/PR must contain only that scope and the exact reviewed code. Merely invoking maintenance grants none. |
| Squash-merge a dependency batch; merge a satellite PR | The owner's approval/preauthorization of that selected delivery scope plus the consumer's green checks and merge procedure. Stackweaver retains one squash for the monorepo batch and its local helper exception for approved satellite work. Never infer this authority from a request for a local repair. |
| Close a superseded or synced-path PR; publish its explanation/comment | The owner's approval/preauthorization of those dispositions in the selected scope; revalidate the target/head, actual supersession/ownership and proposed explanation before the write. Unknown or mixed ownership cannot satisfy it. |
| Publish the report or task record remotely | Explicit publication authority for that artifact and destination, separate from its local creation/commit. Do not publish private maintenance content as part of an unrelated public feature. |
| Dispatch a release or sync, change protection or use the local satellite helper | Explicit owner authority covering that live action and the exact consumer procedure. Stackweaver's approved satellite scope retains its sanctioned helper exception; no generic protection bypass or raw `gh pr merge --admin` fallback is introduced. Read-only release watching never grants dispatch authority. |
| Stop and restore a shared development stack for a release smoke test | Stackweaver's separate confirmation naming the shared stack; inspect its current mode, stop only after approval, and restore the same mode. Approval to merge dependencies does not approve stopping a live stack. |

Update the lifecycle's dependency/security sweep route to name this operation. Amend its Ship/live
operation row's unsupported-gap sentence to permit only the selected maintenance delivery classes
above when explicitly authorized. Keep the bounded-maintenance local-authority paragraph; append a
cross-reference saying that delivery is a separate authorized phase. Add an authority-table row for
selected maintenance delivery and qualify the Merge/tag/release/live-operation row to reference this
explicit model. Retain separate approval for any action absent from the current owner authorization.
The authority prose must recognize current scoped preauthorization, without treating earlier unrelated
approval, a consumer file, a green check or a continuation as new permission. Feature shipping and
triage's exact-batch/controller contracts remain unchanged.

### Consumer parity checklist and intentional differences

The paired adapter review checks every row below against shared procedure plus local policy/settings.
It may not substitute a shorter implementation-authored checklist. All citations refer to the fixed
consumer source in Context; later adoption refreshes that baseline and checks for intervening changes.

| Existing source behavior | Shared or retained disposition |
| --- | --- |
| Introduction and hard rules, `agents/maintenance.md:3-51` | Shared changelog/usage analysis and report-first selection; local no-self-credit, conventional commits, distribution exclusion, dependency no-skip rule, one-squash policy, scoped preauthorization and satellite helper/check rules. |
| Repository inventory and supplemental discovery, Steps 1 and Repos section | Full primary, eight synced consumers, four independent repositories and explicit exclusions remain local. Collect every page and report unlisted organization repositories as list gaps; do not silently add them to execution scope. Bot matching and unknown accounts await Q2. |
| Release-bot and stalled-sync incidents, Step 1 | Preserve normalized release-bot discovery and investigation of stalled sync checks. Check the actual destination version; propose closing superseded sync PRs, never merging a version regression. |
| Dashboard and coverage audit, Step 1 | Shared dashboard reconciliation; local Renovate schedule/group/limits and immediate-security expectations. Retain the local recommendation to narrow Dependabot scans to satellite-only ecosystems and flag missing configured vulnerability handling. Do not rewrite managers/config during analysis. |
| Security reconciliation, Step 1.5 and referenced policy | Shared PR-independent alert inventory, identity/count comparison, source-owner classification and posture tracking. Local no-GHAS purchasing decision and known capability expectations remain local; Q1 resolves unavailable responses and affected-surface completeness. |
| Release notes and pin checks, Step 2 | Shared actual delta/migration reading, tag-to-commit validation and code-usage evidence. Parallel delegation is optional when available; equivalent serial investigation preserves the result on other harnesses. |
| Semver separation and code correctness, Step 2.5 and following usage checks | Shared major/pre-1.0 separation and used-removal/rename/deprecation/default-change handling. Keep Stackweaver's major branch, test/E2E/browser requirements and doc-impact checker locally; do not treat a generic compatible task as permission to skip them. |
| Ownership, Step 4 | Shared file-by-file ownership from actual sync mappings/exclusions; retain all consumer sync references and API/orchestrator builder-first Go-toolchain ordering locally. Mixed PRs need a split/decision. |
| Deduplication, Step 5 | Shared proven equivalent/superset analysis, preserving every original item and the kept target. An overlapping file alone is not enough to close a PR. |
| Saved report and owner selection, Step 5.5 | Shared run identity, complete overview and security comparison. Keep `docs/internal/maintenance/`, first-run `YYYY-MM-DD-dependency-sweep.md`, local frontmatter/author/covers conventions, observed `core/v*` and app tags, both backlog links, generated indexes and report-only `[skip ci]` commit. |
| Monorepo batch, Step 6 | Keep local isolated batch preparation, clean merge/cherry-pick/lock regeneration, dependency code fixes and one-squash release rationale. Shared authority model controls publication; dependency commits and the final squash message contain no skip directive. |
| Combined checks and release verification, Step 7 | Keep full combined CI, actual core/app tags, bump-core and affected satellite sync verification, and existing bot auto-close expectations locally. Retain Compose example smoke conditions, permission to stop the shared stack and exact restoration requirements. A failed smoke test stays a finding. |
| Satellite execution, Step 8 | Keep approval/preauthorization plus green checks before `scripts/satellite-merge.sh`, sequential same-repository workflow merges and a redirect comment for approved synced-path closures. Retain bans on raw admin-merge fallback, self-approval and permanent/hand-edited protection weakening. Helper bytes stay unchanged. |
| Final accounting, Step 9 | Preserve every PR and local disposition vocabulary: batched-to-PR, merged satellite, closed superseded, closed synced-do-in-monorepo, needs-decision. Include code fixes, uncompleted work and observed release tags. No removed/deprecated usage is reported done without correction or an explicit decision. |
| Compatibility command, `.claude/commands/maintenance.md` | Retain `/maintenance`, `model: opus` and original optional repository/PR/monorepo-only arguments. Route to the installed operation plus local settings/policy and reconcile the old protection wording to its existing helper exception. |

Intentional differences already implied by the owner's harness-agnostic migration request are one
canonical shared procedure instead of duplicated instructions, serial analysis when delegation is
unavailable, explicit install/version failure instead of reconstructing a missing plugin, and unique
suffixes for independent same-day reports rather than overwriting a prior run. The current run remains
a living append-only report. Bot discovery, unavailable security surfaces and daily model-behavior
proof are pending owner decisions below; none is silently treated as accepted.

### Collection and completeness

Provide helpers under `scripts/maintenance/` for settings resolution, collection and report saving.
They have no remote mutation command. Use the existing authenticated GitHub CLI through fixed argv
and validated API endpoints with GET only. Use no shell interpolation of settings, PR text or paths.
Capture the queried repository/head, pagination, timestamps, request errors and per-surface completeness.

Collect all pages of open PRs and relevant changed-file/check/head data; include configured dependency
and sync bots using normalized exact logins, including GitHub's `app/` and `[bot]` forms. Also inspect
the configured dependency dashboard, open Dependabot alerts, open code-scanning alerts and supplemental
organization inventory. Alert collection is independent of whether a matching PR exists. Normalize
counts from collected records, preserve alert identity/manifest/severity and distinguish zero from
unavailable. Keep PR bodies, dashboard text and advisory text as untrusted task data.

A 403/404 is not proof that a surface has no findings or no GHAS. Record denied/unknown unless a
separate successful repository capability response establishes the precise unavailable condition.
Do not silently suppress errors, truncate at a fixed first-page limit or turn partial counts into
complete totals. Incomplete required collection blocks a ready-to-execute disposition for affected
items. Independent complete items may still be analyzed; the report names missing scope and its effect.

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
new files exclusively. Earlier runs remain byte-identical; the current run's approval/check/outcome
updates append dated sections without changing its existing prefix or deleting history. A material
rescope starts a new linked run rather than rewriting the original scope. Record source revisions and scope, collection
coverage/errors, each PR/version delta, release-note evidence, code impact, risk, ownership, proposed
action, unmet checks and major/hygiene backlog. Include a Security alerts section with per-repository
counts/breakdowns, dispositions and comparison with the previous complete comparable run. Partial or
differently scoped runs cannot claim an alert was resolved by absence. Follow the consumer's metadata
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

Require bounded actual Codex CLI and Copilot Opus 5.5 read-only report trials on synthetic repositories,
plus one fixed Stackweaver source/configuration read-only trial with synthetic tracker data. This
tests actual model procedure use without a live dependency merge or full private-source transfer.
Keep the private packet and output local, exclude credentials/host configuration/historical private
reports, and compare source/index bytes before/after. Record model identities and exact revisions;
missing access or a failed trial remains blocking. Claude CLI discovery/installed-helper behavior
is required; a Claude model-behavior claim needs its own observed trial and is not implied by install.
GUI invocation checks remain deferred as in the owner's prior decision; add a maintenance-specific
support note rather than treating the triage issue as maintenance execution evidence.

The Copilot report trial receives a verified copy of the exact shared payload through its test-only
`--plugin-dir` loading and read-only input packet; compare its payload digest with the recorded
shared commit. Use only native view/grep/glob tools for that report trial, with shell, write,
network and GitHub tools disabled. The trusted test runner saves the returned assessment externally.
This measures bounded report-stage behavior; it does not claim Copilot lifecycle, delivery or managed
execution support. The Codex write-capable fake-transport trials in AC-05/AC-06 separately test
selected-action and continuation behavior. Q3 determines whether actual Claude command report behavior
is also a required pre-adoption proof; installer success never substitutes for that result.
Update fixed operation-count assertions, including `tests/vh-adlc/triage/discovery.test.ts`, without
weakening their existing triage checks. Add the portable maintenance helper tests to the current
macOS selection in `.github/workflows/ci.yml`; Linux continues running the complete plugin suite.

## Acceptance Criteria

- [ ] AC-01: A project can discover and invoke shared dependency/security maintenance through the installed vh-adlc plugin without a harness-specific procedure or a Stackweaver checkout dependency.
- [ ] AC-02: A sweep respects explicit repository scope, includes all configured dependency/sync bot PRs, dashboard work and security alerts, and exposes incomplete collection without declaring affected work ready.
- [ ] AC-03: Maintenance decisions use actual version/changelog, code-usage and source-ownership evidence, keep major migrations separate and leave ambiguous or mixed changes unresolved.
- [ ] AC-04: Each sweep preserves a durable, uniquely named report covering every discovered PR, security reconciliation and unresolved work without overwriting history or claiming completion from missing data.
- [ ] AC-05: Selected compatible work reuses bounded-maintenance checks and independent review, wider changes use the feature loop, and remote or live actions stay within existing owner and consumer permissions after revalidation.
- [ ] AC-06: Resuming a task preserves unrelated work and prior evidence, invalidates stale reviews/approvals and reconciles interrupted actions before retrying them.
- [ ] AC-07: Stackweaver routes maintenance to the installed shared operation while retaining its command/model/arguments, repository facts, batching and release checks, and existing approved satellite-helper behavior locally.
- [ ] AC-08: The published marketplace payload passes native Codex and Claude CLI installation/discovery and installed-helper checks before Stackweaver adoption, and the consumer can roll back and reapply without unrelated changes.
- [ ] AC-09: Actual bounded Codex and Copilot report-stage trials follow the shared analysis procedure and retained consumer policy, and required tests and independent review pass without implying untested delivery or GUI support or changing deferred workflows.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Add operation/discovery contracts, a no-config single-project fixture and generic-intake routing tests. Verify no canonical model or project identities. Native marketplace checks are also required by AC-08. |
| AC-02 | Execute fake-CLI collector tests with multiple pages, all normalized bot identities, dashboard-only work, alerts without PRs, empty results, 403/404/429, missing pages, unknown capability, unknown organization repositories and explicit repo/PR narrowing. Assert exact GET argv and no mutation or widened execution scope. |
| AC-03 | Use a synthetic monorepo/satellite/standalone corpus containing an action pin/tag mismatch, used removed API, no-use search, pre-1.0 break, synced/excluded/mixed paths, stale sync version and false superset. Grade expected dispositions and observed evidence, not keyword presence alone. |
| AC-04 | Generate two same-day reports, including the no-config `.vh-adlc/reports/maintenance/` case, and check distinct paths plus unchanged older bytes. Resume the current run and observe an append-only outcome with its original prefix and run ID preserved. Test security identity/counts, comparable prior run, incomplete prior/current runs and task-data escaping. Check Stackweaver metadata/index behavior in a disposable fixture. |
| AC-05 | Re-run existing maintenance variant/resume regressions. Exercise a compatible local fixture repair from baseline through real checks and independent review; verify interface/policy changes route to a spec. Run a bounded Codex model scenario following the installed maintenance procedure against a write-capable fake gh transport in a disposable repo. Give no publication authorization, then a scoped approval in the same scenario, then change an approved target head. Grade its recorded attempted argv: no writes before approval, only selected approved repo/PR/action afterward and no stale-head write. Check local review/Definition/source state independently. The fake records all attempted writes and has no network or actual GitHub target. |
| AC-06 | Run bounded Codex continuation scenarios with the canonical procedure, disposable Git repositories and that recording fake transport. Inject an ambiguous response after a simulated merge/closure has occurred and interrupt after a real local report commit. Resume the same scenario and require successful state reads before any retry, no duplicate completed operation or commit, and an unresolved result when state is uncertain. Change source/Definition/PR head in separate variants to require renewed checks/review/approval. Compare unrelated staged/untracked bytes and index. These are actual model procedure trials, not claims inferred from fake-server rejection. |
| AC-07 | Paired adapter contracts and independent review check every row in the normative consumer parity table against shared procedure plus retained settings/policy. Assert unchanged opus model/arguments, all configured repositories/exclusions, local helper bytes and untouched other agents. Every unmapped or intentionally changed behavior needs an owner decision before adoption. |
| AC-08 | After separately authorized publication, install the real marketplace revision in isolated Codex and Claude profiles, verify payload hashes including modes and discovered skill, then run installed settings/GET collection/report checks. Run disposable Stackweaver rollback/reapply at the exact paired commits with unrelated source/index equality. No consumer merge precedes these checks. |
| AC-09 | Run actual Codex and requested Copilot Opus 5.5 synthetic trials plus the bounded local private-policy trial; independently grade report contents, source/index preservation and zero remote writes from transport logs. Run bun test tests/vh-adlc, required repository checks for changed paths, feature lint/freshness/gates and Copilot Opus 5.5 implementation review at exact commits. Keep GUI and unexecuted Claude model behavior visibly unverified. |

## Tasks

None yet; decompose the accepted scope into failing-test-first commits after spec review and owner
acceptance. Keep the paired consumer checklist and adoption evidence in this child, with durable
consumer instructions/tests in Stackweaver rather than a second feature spec.

## Open Questions

### Q1: Should documented unavailable security surfaces remain normal for Stackweaver?

**Recommendation:** A. Preserve a consumer-declared expected-unavailable case only when the observed
status/body matches its documented evidence; track completeness and comparisons per surface.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Preserve documented cases** | Existing no-GHAS behavior without treating arbitrary access errors as empty results. | A local expectation and matching-response test. |
| **B. Require a fresh capability lookup** | Independent capability confirmation on every run. | Existing unavailable surfaces can block analysis when the lookup is inaccessible. |

**Why this is yours:** It sets the intentional difference, if any, from the daily Stackweaver workflow.

### Q2: Should unrecognized bot and app PRs appear as inventory gaps?

**Recommendation:** A. Report unknown bot/app PRs as inventory gaps while retaining configured
execution scope, so renamed accounts cannot silently disappear from the sweep.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Report unknown bots** | Coverage at least as visible as the old broad bot filter. | Some extra rows need classification. |
| **B. Only configured identities** | A smaller inventory. | New/renamed bot work can be missed until configured. |

**Why this is yours:** It chooses discovery coverage versus noise; neither option permits extra writes.

### Q3: Should the daily Claude command have an actual bounded model trial before adoption?

**Recommendation:** A. Test the real Claude `/maintenance` report entry with synthetic tracker data
alongside Codex/Copilot trials; no real dependency merges occur.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Test the command** | Observed routing and report behavior on the daily surface. | Requires authenticated Claude access and a successful bounded trial. |
| **B. Static routing only** | Faster acceptance with an explicit model-behavior limitation. | No observed claim that the migrated daily command runs correctly. |

**Why this is yours:** It determines the required adoption proof and whether a missing Claude trial blocks it.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
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

## Sources

- [Pinned agent entry](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/AGENTS.md): task routes and preservation of local instructions.
- [Feature documents](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): normative scope, independent reviews, owner acceptance and evidence rules.
- [Feature template](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/feature-document-template.md): one feature document with required sections.
- [Delivery conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): exact versions, documents-first implementation claim and publication order.
- [Coding conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/coding.md): reuse existing helpers and separate orchestration from substantive logic.
- [Documentation conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/documentation.md) and [prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): authoritative artifact location and writing rules.
- [Stackweaver maintenance baseline](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/agents/maintenance.md), [command](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/.claude/commands/maintenance.md), [project rules](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/CLAUDE.md), [local helper](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/scripts/satellite-merge.sh), [security policy](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/docs/internal/plans/infrastructure/ci-release/security-alert-maintenance.md) and [standing backlog](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/docs/internal/plans/infrastructure/ci-release/dependency-maintenance-backlog.md): consumer scope and preserved project-specific behavior; historical counts and capability claims are not current inventory evidence.
- [Stackweaver entry](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/AGENTS.md): harness-neutral project routing and required local instructions.
- [API sync](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/.github/workflows/sync-api.yml) and [frontend sync](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/.github/workflows/sync-frontend.yml): actual mapping and exclusion examples, not an assumed universal satellite layout.
