---
status: draft
status_description: "Maintenance extraction selected by the owner; being specified before independent Copilot Opus 5.5 review and owner acceptance."
issue: null
goal: "Run dependency and security maintenance through one harness-agnostic vh-adlc operation while consumers retain their topology, release rules and existing approved operating procedures."
covers:
  - plugins/vh-adlc/skills/vh-adlc-maintenance/
  - plugins/vh-adlc/references/maintenance.md
  - plugins/vh-adlc/references/maintenance-settings.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/scripts/maintenance/
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tests/vh-adlc/maintenance/
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/direct-operation-compatibility.test.ts
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

Stackweaver's retained `agents/maintenance.md` becomes a thin shared-operation entry plus its local
project policy, or points to that policy in `agents/maintenance-project.md`. Its settings retain the
complete existing repository list and scope exclusions; its project policy retains the authoritative
sync workflow references, major-upgrade validation, one-squash batch, no dependency `[skip ci]`,
dashboard/security/backlog links, upstream reusable-workflow tag checks, satellite builder ordering,
release/sync verification and Compose smoke-test stop/restore requirements. No local edits to
`distribution/**` become permitted. Keep `scripts/satellite-merge.sh` and its existing approval gate
local and unchanged; its exception is specific to that procedure and approved satellite scope.
Reconcile the command's contradictory wording to point to that retained local policy, preserving
the owner's answer rather than imposing a new shared policy.

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

Save one uniquely named report per run in the configured directory, with a suffix for repeated same-day
runs. Existing report bytes must not be overwritten. Record source revisions and scope, collection
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

## Acceptance Criteria

- [ ] AC-01: A project can discover and invoke shared dependency/security maintenance through the installed vh-adlc plugin without a harness-specific procedure or a Stackweaver checkout dependency.
- [ ] AC-02: A sweep respects explicit repository scope, includes all configured dependency/sync bot PRs, dashboard work and security alerts, and exposes incomplete collection without declaring affected work ready.
- [ ] AC-03: Maintenance decisions use actual version/changelog, code-usage and source-ownership evidence, keep major migrations separate and leave ambiguous or mixed changes unresolved.
- [ ] AC-04: Each sweep preserves a durable, uniquely named report covering every discovered PR, security reconciliation and unresolved work without overwriting history or claiming completion from missing data.
- [ ] AC-05: Selected compatible work reuses bounded-maintenance checks and independent review, wider changes use the feature loop, and remote or live actions stay within existing owner and consumer permissions after revalidation.
- [ ] AC-06: Resuming a task preserves unrelated work and prior evidence, invalidates stale reviews/approvals and reconciles interrupted actions before retrying them.
- [ ] AC-07: Stackweaver uses the installed shared operation while retaining its command/model/arguments, repository facts, batching and release checks, and existing approved satellite-helper behavior locally.
- [ ] AC-08: The published marketplace payload passes native Codex and Claude CLI installation/discovery and installed-helper checks before Stackweaver adoption, and the consumer can roll back and reapply without unrelated changes.
- [ ] AC-09: Actual bounded Codex and Copilot model trials follow the shared procedure and Stackweaver policy, and required tests and independent review pass without broadening support claims or changing deferred workflows.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Add operation/discovery contracts, a no-config single-project fixture and generic-intake routing tests. Verify no canonical model or project identities. Native marketplace checks are also required by AC-08. |
| AC-02 | Execute fake-CLI collector tests with multiple pages, all normalized bot identities, dashboard-only work, alerts without PRs, empty results, 403/404/429, missing pages, unknown capability, unknown organization repositories and explicit repo/PR narrowing. Assert exact GET argv and no mutation or widened execution scope. |
| AC-03 | Use a synthetic monorepo/satellite/standalone corpus containing an action pin/tag mismatch, used removed API, no-use search, pre-1.0 break, synced/excluded/mixed paths, stale sync version and false superset. Grade expected dispositions and observed evidence, not keyword presence alone. |
| AC-04 | Generate two same-day reports and check distinct paths plus unchanged older bytes; test security identity/counts, comparable prior run, incomplete prior/current runs and task-data escaping. Check Stackweaver metadata/index behavior in a disposable fixture. |
| AC-05 | Re-run existing maintenance variant/resume regressions. Exercise a compatible local fixture repair from baseline through real checks and independent review; verify interface/policy changes route to a spec. A recording fake remote rejects unapproved/out-of-scope/head-changed writes and tests approved consumer procedure dispatch without touching actual protection or merging dependencies. |
| AC-06 | Inject interruption before/after a fake merge, closure and report commit; observe state reconciliation before any retry. Change source, Definition and PR head to require renewed checks/review/approval. Seed unrelated staged/untracked files and compare exact bytes/index before and after. |
| AC-07 | Paired adapter contracts compare the current local workflow parity checklist against shared procedure plus retained settings/policy. Assert unchanged opus model/arguments, all configured repositories/exclusions, local helper bytes, no distribution edits, one-squash/no-skip rules, builder/release/smoke checks and untouched other agents. |
| AC-08 | After separately authorized publication, install the real marketplace revision in isolated Codex and Claude profiles, verify payload hashes including modes and discovered skill, then run installed settings/GET collection/report checks. Run disposable Stackweaver rollback/reapply at the exact paired commits with unrelated source/index equality. No consumer merge precedes these checks. |
| AC-09 | Run actual Codex and requested Copilot Opus 5.5 synthetic trials plus the bounded local private-policy trial; independently grade report contents, source/index preservation and zero remote writes from transport logs. Run bun test tests/vh-adlc, required repository checks for changed paths, feature lint/freshness/gates and Copilot Opus 5.5 implementation review at exact commits. Keep GUI and unexecuted Claude model behavior visibly unverified. |

## Tasks

None yet; decompose the accepted scope into failing-test-first commits after spec review and owner
acceptance. Keep the paired consumer checklist and adoption evidence in this child, with durable
consumer instructions/tests in Stackweaver rather than a second feature spec.

## Open Questions

None. The owner's satellite-policy answer is incorporated above. Independent review may identify
additional factual fixes or decisions before acceptance. The reviewed document is not yet accepted.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [Feature documents](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): normative scope, independent reviews, owner acceptance and evidence rules.
- [Feature template](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/feature-document-template.md): one feature document with required sections.
- [Delivery conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): exact versions, documents-first implementation claim and publication order.
- [Coding conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/coding.md): reuse existing helpers and separate orchestration from substantive logic.
- [Documentation conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/documentation.md) and [prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): authoritative artifact location and writing rules.
- [Stackweaver maintenance baseline](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/agents/maintenance.md), [command](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/.claude/commands/maintenance.md), [project rules](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/CLAUDE.md), [local helper](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/scripts/satellite-merge.sh), [security policy](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/docs/internal/plans/infrastructure/ci-release/security-alert-maintenance.md) and [standing backlog](https://github.com/michielvha/stackweaver/blob/1999a71b0cd8a224195b7a971fd1851ca8f3ebef/docs/internal/plans/infrastructure/ci-release/dependency-maintenance-backlog.md): consumer scope and preserved project-specific behavior; historical counts and capability claims are not current inventory evidence.
