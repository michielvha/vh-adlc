---
status: draft
status_description: "Refreshing coverage for existing discovery tests and installation docs; functional scope unchanged."
branch: feat/github-projects-coordinator
issue: https://github.com/michielvha/vh-adlc/issues/54
goal: "Coordinate work across repositories from one GitHub Project while keeping each repository's feature lifecycle authoritative."
covers:
  - plugins/vh-adlc/skills/vh-adlc-projects/
  - plugins/vh-adlc/scripts/projects/
  - plugins/vh-adlc/references/projects.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - tests/vh-adlc/projects/
  - tests/vh-adlc/check.test.ts
---

# Plan: GitHub Projects coordinator

Track a multi-repository project through GitHub's existing board and issues, with a small interactive
vh-adlc operation for inventory, recommendations and approved board updates.

## Context

### Owner summary

Homelab now spans Builders, PDS, Stackweaver, edgectl and the technical guides. One GitHub Project
should show what is ready, waiting for review or blocked across those repositories. Each issue and
repository spec keeps its existing authority; moving a card does not accept a feature or ship it.

The candidate first version runs when asked in an agent session, using the existing GitHub CLI login.
It collects current facts, recommends next work and shows a precise batch for approval before changing
board membership or configured single-select fields. It will not close issues, merge PRs, change
infrastructure or start implementation from a card. Those actions still use their owning repository's procedure and authority.

GitHub's built-in workflows can handle routine board updates where the account's plan permits them.
A small Bun helper supplies pagination, stable identities and checked updates around `gh`; there is
no new GitHub SDK, task database, service or scheduler. Reusable configuration and JSON results leave
room for a later unattended cleanup agent. Such an agent needs a separate design and permission grant.

Fresh reads catch detected field conflicts, but GitHub cannot prevent an edit racing with a write.
The owner accepted that API limit on 2026-11-06. Local subprocess tests cover incomplete inventories, duplicate issue numbers, detected field conflicts,
partial failures and reuse from a fresh CLI process. Strict TypeScript and the package checker pass.
A controlled trial on a separately authorized test board and independent implementation review remain
pending. No live board or credential change has been made. Acceptance covers implementation, not a
live Homelab board setup or repository cleanup.

### Current evidence

At framework main `21bc3e4299a227bf9431de2d6045afdff2342834`,
`plugins/vh-adlc/references/lifecycle.md:47-64` routes repository work to existing operations.
`docs/user-guides/workflows.md:41-62` lists them; it has no Projects coordinator. Triage already requires
an approved exact batch for tracker changes. `plugins/vh-adlc/scripts/settings-file.ts:1-45` provides
the strict YAML settings reader; reuse it rather than adding another parser.

The owner chose interactive use first on 2026-11-06, while preserving room for future cleanup agents.
In the same session, the owner selected approved add/update batches and explicitly accepted the
remaining field-update race. This resolves write scope, not full specification acceptance or a live batch grant.
A live `gh project list --owner vhco-pro --format json --limit 10` failed with missing `read:project`.
The board inventory is therefore unknown. No existing board's absence is inferred from that failure.

### Options researched

| Approach | Useful for this feature | Cost or limit |
| --- | --- | --- |
| Native Projects workflows | Routine auto-add and configured status updates | Plan-dependent rule limits; enabling auto-add does not backfill old issues. |
| `gh project` and `gh api` | Existing local login, native Projects commands and GraphQL for gaps | The helper must handle pagination, IDs, conflicts and partial failures. |
| Official GitHub MCP server | Existing Projects tools when a host already exposes them | Adds server/tool configuration here; the connected GitHub tools do not expose Projects. |
| GitHub Agentic Workflows | Hosted reasoning and bounded project outputs for future automation | Requires workflow deployment and separate Projects credentials; unnecessary for interactive v1. |

These are documentation/source comparisons, not executed product benchmarks. GitHub documents that
ordinary Actions `GITHUB_TOKEN` cannot access Projects. Its App route suits future organization
workflows, but cross-owner private repositories still need explicitly verified access.

## Scope

Provide one generic `vh-adlc-projects` operation with read-only inventory as its default and separately
approved project item additions and field updates. Support a user-owned or organization-owned Projects
v2 board and an explicit allowlist of full repository names. Homelab is the first usage example, not
hard-coded framework data.

Exclude board creation, schema/view/workflow editing, item deletion or archival, draft-card creation,
issue/PR edits, closures, labels, assignments, merges, releases, repository source changes, credential
provisioning, schedules and unattended cleanup. The first version documents native setup rather than
automating it. Repository work selected from the report resumes through the existing lifecycle.

## Design

### Entry, configuration and transport

Add the skill and a lifecycle route; register the new operation in the existing package checker and bump both plugin manifests together. Put project-specific configuration in an adopter-owned
`.vh-adlc/projects.yaml`, using the existing strict YAML reader. It names one board by canonical URL,
allowlisted `owner/repo` names, and the project single-select fields/allowed option IDs the coordinator may update. Other field types are unsupported in v1.
Reject unknown keys, invalid URLs, duplicate repositories and conflicting field identities. A name is
resolved to one ID before planning; a missing or ambiguous field/option blocks the affected operation.
Never silently create a field or choose the first name match.

Require `gh`, Git and the plugin's supported Bun runtime. Call `gh` with argument arrays and structured
input; never interpolate issue text into shell commands. Use `gh project` where sufficient and
`gh api graphql` for paginated nested data or an interface the CLI lacks. No new OAuth client or SDK.
The helper lives under `scripts/projects/`; separate collection and update code only where their
responsibilities require it. It does not import triage's repository-verification controller to perform
board metadata operations. Repository verdicts remain subject to that existing controller.

Configuration contains no tokens and grants no standing write authority. The setup guide shows
`gh auth refresh --hostname github.com --scopes project` for interactive read/write access and
`read:project` for inventory only. The owner completes GitHub authorization. State that scopes cover
more than the configured board; an allowlist constrains this operation, not GitHub credentials.
Revocation, organization policy or SSO can require later authorization. Do not promise permanent access.

### Inventory and recommendations

Resolve board, item, issue, repository, field and option IDs. Paginate the configured repositories and
all required project connections; retain source URL, observed time and collection completeness.
Identity is repository full name plus issue node ID, never issue number or title alone. Treat denied,
redacted, missing and partially collected data as unknown, not as a closed issue or an empty backlog.
Inventory includes configured repository issues missing from the board so approved backfill is possible.
Bound collection explicitly; a budget/rate limit produces an incomplete result, not false completeness.

Show issue state/reason, linked PR state/head and available check/review facts separately. A local
feature's status, reviews and acceptance are reported only when its owning checkout and pinned
`vh-adlc` checks were inspected; otherwise those fields remain unknown. Record the inspected commit.
Feature `complete`, passing CI, owner acceptance, PR merge and release are separate facts. Do not
infer a shipped outcome from any one of them or rewrite a manual Status based on a guessed mapping.
Existing issue dependency links may inform recommendations; creating dependency links is out of scope.

Produce a concise human report with source links, proposed next actions and unresolved access gaps.
Also emit a versioned JSON result containing the board/repository identities, source facts, completeness
and proposed operations. Keep reports private outside the source tree unless publication is requested;
private issue bodies and credentials must not enter public examples. The next RKE2/edgectl design can
appear as a proposed follow-up, without accepting its topology or starting that work.

### Approved board updates

The concrete proposed batch lists the board ID, issue/content ID, target field and option IDs,
observed old value and proposed new value. Only adding existing issues and updating explicitly
configured fields are supported. The owner approves that exact batch in the current interaction;
configuration, issue text, board text and prior unrelated approvals cannot authorize it.

Before each write, re-read target identity, membership and affected field value. Refuse a mismatch
so a change observed before the write is not overwritten. A repeated add reuses an existing content ID.
GitHub's field-update mutation has no expected-value or revision condition. There is an unavoidable
race between the read and write: a human edit in that interval can be overwritten, and read-back cannot
prove it did not happen. Do not claim atomic protection, lock the board or add a coordination service.
The owner explicitly accepted this limitation for approved field updates on 2026-11-06.
Each actual batch still requires its own approval; the design decision grants no standing write authority.

After each request, re-read the actual value and record success, already satisfied, detected conflict,
refused or failed. A timeout with unknown outcome must be reconciled before retry. Stop after a conflict or
failure; report earlier successful writes and remaining operations. Do not claim transactionality or
blindly roll back a human's edits. A second run proposes only remaining differences.

This is a narrow helper contract, not a new lifecycle or general permission engine. Skill restrictions
are procedural; do not claim a host-wide sandbox. Tests enforce what the helper itself accepts and
sends. Untrusted issue/card instructions are data and cannot expand operation kinds or repository scope.

### Automation later

Keep the YAML inputs and JSON inventory/plan/result usable without chat-specific state. A future
scheduled workflow can supply an externally managed GitHub credential and use the same collection
contract. This version requires interactive approval for writes and does not accept a configuration
flag that bypasses it. Future cleanup policy, GitHub App setup and hosting are separate features.
Document native auto-add as an optional complement, including rule limits and explicit initial backfill.

## Acceptance Criteria

- [ ] AC-01: An adopter can invoke the Projects operation with one configured board and repository allowlist; invalid or ambiguous identities stop affected operations without guessing or creating board schema.
- [ ] AC-02: Inventory covers the configured board and repositories across all pages, identifies issues without number collisions, and marks denied, partial or budget-limited collections incomplete without proposing writes from that incomplete inventory.
- [ ] AC-03: Recommendations preserve separate repository lifecycle and GitHub delivery facts, link their sources and route selected repository work through the existing procedure without accepting or shipping it from a board state.
- [ ] AC-04: Default inventory changes no remote state; approved updates affect only existing issue membership and configured project fields, with exact-batch approval, fresh value checks, idempotent retries and verified per-operation outcomes.
- [ ] AC-05: Detected preflight conflicts stop updates; rate limits, partial failures, unknown outcomes and untrusted card instructions do not duplicate issues, broaden repository scope or produce a false all-success result. Field-update documentation and receipts disclose the read/write race without claiming atomic protection.
- [ ] AC-06: Setup documentation enables interactive access with the existing CLI, explains scope and cross-owner limits, and preserves reusable configuration/JSON results without adding a scheduler, credential store or unattended authority.
- [ ] AC-07: A controlled trial demonstrates inventory, an approved add/update, a repeat run and a conflict refusal on an owner-authorized disposable board; existing production board items and repository issues remain untouched.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Bun tests for strict YAML, canonical user/org board identities, duplicate repositories, missing/ambiguous fields and options; assert no mutation calls on refusal. |
| AC-02 | Paginated GraphQL/CLI response fixtures with repeated issue numbers in different repos, private redactions, missing scopes and rate/budget failures; assert complete vs partial output and no writes from incomplete data. |
| AC-03 | Scenario fixtures for complete spec plus unmerged PR, stale review, closed-not-planned issue and inaccessible checkout; inspect source-linked recommendations and existing lifecycle handoff. |
| AC-04 | Fake `gh` executable records actual subprocess argument/input/output flow; default emits zero writes, unapproved/modified batch is refused, approved exact batch updates configured fields, repeat add is a no-op. |
| AC-05 | Inject a change before the preflight read and assert refusal; inject a change between read and mutation and assert the documented limitation is reported rather than claiming atomic protection. Also inject add timeout with server-side success, failure after one success, hostile issue text and foreign IDs; assert reconciliation, stop and accurate receipts. |
| AC-06 | CLI setup walkthrough and JSON/config reuse from a second clean process without chat state; existing Bun suite and package checker with the new operation registered; inspect package for absent hosted workflow/secrets. |
| AC-07 | After separate live-test permission and access, create/use a disposable board and test issues, record baseline, perform the four scenarios, verify actual read-back and compare untouched production resources. Cleanup requires its own exact approved test-resource list. |

## Tasks

- [x] T1 `tests/vh-adlc/projects/settings.test.ts` - invalid board/repository/field settings and ambiguous identities fail against the absent reader (AC-01)
      Evidence: `bun test tests/vh-adlc/projects/settings.test.ts` failed because the settings module does not exist; no production code written yet.
- [x] T2 `plugins/vh-adlc/scripts/projects/settings.ts` - T1 passes using the shared strict YAML reader (AC-01)
      Evidence: `bun test tests/vh-adlc/projects/settings.test.ts` passes all three tests; shared settings reader is reused without new dependencies.
- [x] T3 `tests/vh-adlc/projects/inventory.test.ts`, `fixtures.ts`, `fake-gh.ts` - actual CLI fixture scenarios fail for absent inventory, incomplete pages and identity collisions (AC-02, AC-03)
      Evidence: `bun test tests/vh-adlc/projects/inventory.test.ts` fails because the native transport module is absent.
- [x] T4 `plugins/vh-adlc/scripts/projects/github.ts`, `inventory.ts`, `cli.ts` - T3 passes with native gh calls, source-linked facts and versioned output (AC-02, AC-03)
      Evidence: `bun test tests/vh-adlc/projects` passes six tests through actual gh-shaped subprocess requests; no live board access or mutations. The fixture uses a direct stdout fd write because Bun stream writes were refused by the host sandbox.
- [x] T5 `tests/vh-adlc/projects/apply.test.ts` - approved-batch, conflict, retry and partial-failure scenarios fail against the absent updater (AC-04, AC-05)
      Evidence: `bun test tests/vh-adlc/projects/apply.test.ts` fails because the updater module is absent.
- [x] T6 `plugins/vh-adlc/scripts/projects/apply.ts`, `cli.ts` - T5 passes with strict operation scope, fresh reads and verified receipts (AC-04, AC-05)
      Evidence: `bun test tests/vh-adlc/projects` passes twelve settings/inventory/update tests using subprocess fixtures. API-race limits are retained in field-update receipts; live board checks are not performed.
- [x] T7 `plugins/vh-adlc/skills/vh-adlc-projects/SKILL.md`, `plugins/vh-adlc/references/projects.md`, `plugins/vh-adlc/references/lifecycle.md`, both plugin manifests, `tests/vh-adlc/check.test.ts`, `docs/user-guides/workflows.md`, `docs/reference/compatibility.md` - registered operation and setup guide pass package checks, with reusable config/output and explicit host limits (AC-01, AC-03, AC-06)
      Evidence: `bun test tests/vh-adlc/projects tests/vh-adlc/check.test.ts --timeout 60000` passes 74 tests, including strict typecheck and a fresh CLI process using reusable YAML/JSON. No real-board acceptance or installed-agent invocation is claimed.
- [x] T9 `plugins/vh-adlc/scripts/projects/inventory.ts`, `tests/vh-adlc/projects/inventory.test.ts`, `apply.test.ts`, `plugins/vh-adlc/references/projects.md` - archived membership is included and repeat additions leave it archived; regression fails before the fix and passes after it (AC-02, AC-04)
      Evidence: archived-inventory regression failed before the fix; `bun test tests/vh-adlc/projects tests/vh-adlc/check.test.ts --timeout 60000` passes 76 tests after requesting both archived states and retaining isArchived. R4 remains unchanged; follow-up review pending.
- [ ] T8 `docs/specs/github-projects-coordinator.md` - after separate live permission and access, record the disposable-board trial and independent implementation review; production resources match baseline (AC-07)

## Open Questions

None. The owner selected approved add/update batches and accepted the documented API limit.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-06 | R-1 | spec | `9aac9eeff9e20d30816b0ab8a43f313c30ee2e65` | unknown | procedural | Blocking concurrency promise and missing checker coverage; model identity not attested. |
| 2026-11-06 | R-2 | spec | `11a4bc2b53476a9a6e26a12541c9a74cfd38ffaf` | unknown | procedural | No findings on corrected proposal; owner write-scope decision pending, model identity not attested. |
| 2026-11-06 | R-3 | spec | `bdb69f3ae3c84f0a4b5df0312fb2f877b072088e` | unknown | procedural | No findings after folding owner decision; model identity not attested. |
| 2026-11-06 | R-3 | spec | `bdb69f3ae3c84f0a4b5df0312fb2f877b072088e` | n/a | n/a | accepted by owner |
| 2026-11-06 | R-4 | implementation | `020b6b2ff8b598fb3a988aa378668a75134f04dc` | unknown | procedural | AC01/03/05/06 met; AC02/04 not met due to archived membership; AC07 not verified. Model identity not attested. |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design / Approved board updates; AC-05; Test Plan / AC-05
EVIDENCE: At 9aac9eeff9e20d30816b0ab8a43f313c30ee2e65, docs/specs/github-projects-coordinator.md:135-140 specifies a separate read before each write, while AC-05 promises that conflicts cannot silently overwrite human edits. GitHub's [UpdateProjectV2ItemFieldValueInput](https://docs.github.com/en/graphql/reference/projects#updateprojectv2itemfieldvalueinput) accepts clientMutationId, fieldId, itemId, projectId and value, with no expected previous value or revision condition. A human can change the field after the preflight read; the unconditional mutation can overwrite that change, and the subsequent read can still match the requested value.
PROPOSAL: State the remaining concurrency race and obtain the owner's decision on accepting that limitation or reducing write scope. Make the design, AC-05 and its tests distinguish detectable preflight conflicts from edits between the read and mutation; do not promise atomic overwrite protection from separate requests.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter / covers
EVIDENCE: At 9aac9eeff9e20d30816b0ab8a43f313c30ee2e65, tests/vh-adlc/check.test.ts:16-23 defines the accepted operation lists, and its skills test at lines 232-238 rejects every skill directory absent from those lists. Adding vh-adlc-projects therefore requires changing this existing checker, but covers includes only tests/vh-adlc/projects/. The pinned feature-document standard requires covers to list every path whose change can affect the feature.
PROPOSAL: Add tests/vh-adlc/check.test.ts to covers and include registration of the new operation in the existing package checker as part of implementation verification.

### R-2

NO FINDINGS

### R-3

NO FINDINGS

### R-4

CRITERION: AC-01 An adopter can invoke the Projects operation with one configured board and repository allowlist; invalid or ambiguous identities stop affected operations without guessing or creating board schema.
VERDICT: met
EVIDENCE: At 020b6b2ff8b598fb3a988aa378668a75134f04dc, independently ran `bun test tests/vh-adlc/projects tests/vh-adlc/check.test.ts --timeout 60000`: 74 passed, including strict YAML loading, user/org identities, ambiguous fields, unsupported options, fresh-process invocation and package registration. Inspected settings.ts and the mutation allowlist. These are local subprocess checks, not installed-agent or live-board proof.

CRITERION: AC-02 Inventory covers the configured board and repositories across all pages, identifies issues without number collisions, and marks denied, partial or budget-limited collections incomplete without proposing writes from that incomplete inventory.
VERDICT: not met
EVIDENCE: At 020b6b2ff8b598fb3a988aa378668a75134f04dc, the focused suite and five additional scratch tests passed pagination, colliding issue numbers, denied pages and incomplete-result checks. However, `bun test /tmp/projects-archived-review.test.ts --timeout 60000` produced two passes and one failing contract assertion: the actual ProjectItems subprocess query omits archivedStates, yet collection returns complete=true and proposes an archived existing issue for addition. GitHub documents that omitted archivedStates selects only NOT_ARCHIVED. See F-01.

CRITERION: AC-03 Recommendations preserve separate repository lifecycle and GitHub delivery facts, link their sources and route selected repository work through the existing procedure without accepting or shipping it from a board state.
VERDICT: met
EVIDENCE: At 020b6b2ff8b598fb3a988aa378668a75134f04dc, independently executed inventory tests and inspected inventory.ts:64-110 and skills/vh-adlc-projects/SKILL.md:18-23. Output preserves issue, PR head, review and check facts separately, links source URLs and leaves uninspected repository lifecycle unknown. The skill requires the owning checkout's existing lifecycle before implementation. No board-state acceptance or shipping mutation is present.

CRITERION: AC-04 Default inventory changes no remote state; approved updates affect only existing issue membership and configured project fields, with exact-batch approval, fresh value checks, idempotent retries and verified per-operation outcomes.
VERDICT: not met
EVIDENCE: At 020b6b2ff8b598fb3a988aa378668a75134f04dc, focused tests established read-only inventory, exact-byte approval binding, configured write scope, ordinary repeat-add handling and read-back receipts. Scratch archived-member checks exposed incomplete fresh membership reads. With the server returning the existing archived item ID, two attempts each issue AddIssue and report failed instead of already satisfied. This is a subprocess fixture informed by the documented API contract, not an observed live mutation. See F-01.

CRITERION: AC-05 Detected preflight conflicts stop updates; rate limits, partial failures, unknown outcomes and untrusted card instructions do not duplicate issues, broaden repository scope or produce a false all-success result. Field-update documentation and receipts disclose the read/write race without claiming atomic protection.
VERDICT: met
EVIDENCE: At 020b6b2ff8b598fb3a988aa378668a75134f04dc, independently executed the focused suite and `bun test /tmp/projects-independent-review.test.ts --timeout 60000`, with five additional tests passing. Observed conflict refusal, timeout reconciliation, retained partial successes, unknown read-back stopping subsequent writes, and foreign field/item refusal. Inspected argument-array transport and procedural approval restrictions. Successful field receipts disclose that a concurrent edit may have been overwritten; documentation states the same limitation. Fixture execution does not establish live concurrency behavior.

CRITERION: AC-06 Setup documentation enables interactive access with the existing CLI, explains scope and cross-owner limits, and preserves reusable configuration/JSON results without adding a scheduler, credential store or unattended authority.
VERDICT: met
EVIDENCE: At 020b6b2ff8b598fb3a988aa378668a75134f04dc, independently executed the fresh-process YAML/JSON reuse test, package checker and strict TypeScript check within the 74 passing focused tests. Inspected references/projects.md, the skill, compatibility documentation and package changes: they explain owner-completed CLI authorization, broader credential scopes, private cross-owner access and separate future automation authority. No scheduler, credential store or automatic credential refresh was added. Live authorization was not exercised.

CRITERION: AC-07 A controlled trial demonstrates inventory, an approved add/update, a repeat run and a conflict refusal on an owner-authorized disposable board; existing production board items and repository issues remain untouched.
VERDICT: not verified
EVIDENCE: At 020b6b2ff8b598fb3a988aa378668a75134f04dc, inspected the explicit live-trial procedure and outstanding T8. No owner-authorized disposable-board trial, production baseline comparison or live read-back was executed in this review. All executed mutation scenarios used subprocess fixtures. Separate live-resource permission and sufficient Projects access remain prerequisites.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: plugins/vh-adlc/scripts/projects/inventory.ts:41; inventory.ts:94; apply.ts:42-43
EVIDENCE: ProjectItems requests items(first:100,after:$cursor) without archivedStates. GitHub's [ProjectV2 schema](https://docs.github.com/en/graphql/reference/projects#projectv2) specifies a default of NOT_ARCHIVED. Consequently an open issue already archived on the configured board is omitted while inventory declares completeness and proposes its addition. The scratch reproduction returned two passes and one failing archived-membership assertion. A repeated-add fixture returning the existing archived ID produced failed receipts and repeated AddIssue requests. GitHub's [API guide](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects#adding-an-item-to-a-project) confirms that adding existing content returns its existing item ID. No live archived-item behavior was exercised.
PROPOSAL: Collect both ARCHIVED and NOT_ARCHIVED membership across all pages and preserve archival state in inventory. Use that complete membership for proposals, preflight and reconciliation, with regression tests showing that archived existing members require no add mutation and retain their archival state.

## Sources

- [GitHub CLI Projects](https://cli.github.com/manual/gh_project): native project commands and Projects scope.
- [CLI auth refresh](https://cli.github.com/manual/gh_auth_refresh): expanding the existing account's scopes.
- [Native auto-add](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically): per-plan limits and no initial backfill.
- [Official GitHub MCP server](https://github.com/github/github-mcp-server#projects): Projects toolset as an alternative transport.
- [Agentic Workflows safe outputs](https://github.github.io/gh-aw/reference/safe-outputs/#project-board-updates-update-project): bounded hosted project updates.
- [Projects authentication in Agentic Workflows](https://github.github.io/gh-aw/reference/auth-projects/): separate credentials for hosted automation.
- [Automating Projects with Actions](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions): App permissions and repository-token limits.
- [Projects field-update input](https://docs.github.com/en/graphql/reference/projects#updateprojectv2itemfieldvalueinput): no expected prior value or revision argument, leaving a read/write race.
