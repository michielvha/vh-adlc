---
status: draft
status_description: "Design proposal; awaiting independent spec review and owner acceptance."
issue: null
goal: "Coordinate work across repositories from one GitHub Project while keeping each repository's feature lifecycle authoritative."
covers:
  - plugins/vh-adlc/skills/vh-adlc-projects/
  - plugins/vh-adlc/scripts/projects/
  - plugins/vh-adlc/references/projects.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/plugin.json
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - tests/vh-adlc/projects/
---

# Plan: GitHub Projects coordinator

Track a multi-repository project through GitHub's existing board and issues, with a small interactive
vh-adlc operation for inventory, recommendations and approved board updates.

## Context

### Owner summary

Homelab now spans Builders, PDS, Stackweaver, edgectl and the technical guides. One GitHub Project
should show what is ready, waiting for review or blocked across those repositories. Each issue and
repository spec keeps its existing authority; moving a card does not accept a feature or ship it.

The proposed first version runs when asked in an agent session, using the existing GitHub CLI login.
It collects current facts, recommends next work and shows a precise batch before changing board
membership or configured fields. It will not close issues, merge PRs, change infrastructure or start
implementation from a card. Those actions still use their owning repository's procedure and authority.

GitHub's built-in workflows can handle routine board updates where the account's plan permits them.
A small Bun helper supplies pagination, stable identities and checked updates around `gh`; there is
no new GitHub SDK, task database, service or scheduler. Reusable configuration and JSON results leave
room for a later unattended cleanup agent. Such an agent needs a separate design and permission grant.

Tests will cover incomplete inventories, duplicate issue numbers, manual field changes and partial
failures, plus a controlled trial on a separately authorized test board. No coordinator code, board or
credential change exists yet. Acceptance approves this scope for implementation, not a live Homelab
board setup or repository cleanup.

### Current evidence

At framework main `21bc3e4299a227bf9431de2d6045afdff2342834`,
`plugins/vh-adlc/references/lifecycle.md:47-64` routes repository work to existing operations.
`docs/user-guides/workflows.md:41-62` lists them; it has no Projects coordinator. Triage already requires
an approved exact batch for tracker changes. `plugins/vh-adlc/scripts/settings-file.ts:1-45` provides
the strict YAML settings reader; reuse it rather than adding another parser.

The owner chose interactive use first on 2026-11-06, while preserving room for future cleanup agents.
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

Add the skill and a lifecycle route. Put project-specific configuration in an adopter-owned
`.vh-adlc/projects.yaml`, using the existing strict YAML reader. It names one board by canonical URL,
allowlisted `owner/repo` names, and the project fields/allowed option IDs the coordinator may update.
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
rather than overwriting a person's intervening edit. A repeated add reuses an existing content ID.
After each request, re-read the actual value and record success, already satisfied, conflict, refused
or failed. A timeout with unknown outcome must be reconciled before retry. Stop after a conflict or
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
- [ ] AC-05: Conflicts, rate limits, partial failures, unknown outcomes and untrusted card instructions cannot silently overwrite human edits, duplicate issues, broaden repository scope or produce a false all-success result.
- [ ] AC-06: Setup documentation enables interactive access with the existing CLI, explains scope and cross-owner limits, and preserves reusable configuration/JSON results without adding a scheduler, credential store or unattended authority.
- [ ] AC-07: A controlled trial demonstrates inventory, an approved add/update, a repeat run and a conflict refusal on an owner-authorized disposable board; existing production board items and repository issues remain untouched.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Bun tests for strict YAML, canonical user/org board identities, duplicate repositories, missing/ambiguous fields and options; assert no mutation calls on refusal. |
| AC-02 | Paginated GraphQL/CLI response fixtures with repeated issue numbers in different repos, private redactions, missing scopes and rate/budget failures; assert complete vs partial output and no writes from incomplete data. |
| AC-03 | Scenario fixtures for complete spec plus unmerged PR, stale review, closed-not-planned issue and inaccessible checkout; inspect source-linked recommendations and existing lifecycle handoff. |
| AC-04 | Fake `gh` executable records actual subprocess argument/input/output flow; default emits zero writes, unapproved/modified batch is refused, approved exact batch updates configured fields, repeat add is a no-op. |
| AC-05 | Inject concurrent edits, add timeout with server-side success, write failure after one success, hostile issue text and foreign repository IDs; assert reconciliation, stop, accurate receipts and no forbidden mutation requests. |
| AC-06 | CLI setup walkthrough and JSON/config reuse from a second clean process without chat state; existing Bun suite and plugin checks; inspect package for absent hosted workflow/secrets. |
| AC-07 | After separate live-test permission and access, create/use a disposable board and test issues, record baseline, perform the four scenarios, verify actual read-back and compare untouched production resources. Cleanup requires its own exact approved test-resource list. |

## Tasks

None yet; written after design review and owner acceptance.

## Open Questions

### Q1: Should v1 apply explicitly approved board updates or provide inventory only?

**Recommendation:** A. Support approved membership and field updates so the coordinator can maintain the board.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Approved board updates** | Useful interactive board maintenance with a reviewed batch | Write scope and tests for conflicts and partial writes |
| **B. Read-only first** | Inventory and recommendations with read-only Projects access | Manual board maintenance; a later feature for updates |

**Why this is yours:** It determines the first version's live effects and required credential scope.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [GitHub CLI Projects](https://cli.github.com/manual/gh_project): native project commands and Projects scope.
- [CLI auth refresh](https://cli.github.com/manual/gh_auth_refresh): expanding the existing account's scopes.
- [Native auto-add](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically): per-plan limits and no initial backfill.
- [Official GitHub MCP server](https://github.com/github/github-mcp-server#projects): Projects toolset as an alternative transport.
- [Agentic Workflows safe outputs](https://github.github.io/gh-aw/reference/safe-outputs/#project-board-updates-update-project): bounded hosted project updates.
- [Projects authentication in Agentic Workflows](https://github.github.io/gh-aw/reference/auth-projects/): separate credentials for hosted automation.
- [Automating Projects with Actions](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions): App permissions and repository-token limits.
