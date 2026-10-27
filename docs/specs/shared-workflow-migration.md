---
status: draft
status_description: "Parent migration plan drafted. Triage is reviewed locally; publication, marketplace verification and Stackweaver adoption are authorized and underway. Other extractions remain unselected."
issue: null
goal: "Selected reusable Stackweaver workflows are delivered through vh-adlc, with a separate accepted spec and verified migration for each capability."
covers:
  - plugins/vh-adlc/
  - docs/specs/shared-triage.md
---

# Shared workflow migration

## Context

This document owns the migration roadmap across capabilities. Each selected capability has its own
feature document, implementation, tests and adoption evidence. The owner requested this separation
on 2026-10-27 so future maintenance, audit and documentation decisions do not accumulate in the
completed triage feature.

Triage is the first extraction. Its accepted behavior and local verification remain in
[shared-triage.md](shared-triage.md), completed at `0e033f8` after Copilot Opus 5.5 R-32.
That document's original deferred register records its reviewed scope boundaries; the live roadmap
is maintained here. Its completion does not mark the wider migration complete.

Stackweaver's project instructions and command routing are in `AGENTS.md`, `agents/` and
`.claude/commands/`. The reviewed triage adapter at `ff38a71f` changes only its triage entry points,
repository settings and migration tests. The shared package has one canonical skill/procedure
tree under `plugins/vh-adlc/`; its existing maintenance and documentation behavior must be inspected
before adding overlapping capabilities.

## Scope

Select reusable workflow behavior, retain project-specific facts in repository settings or thin
adapters, and migrate each selected consumer after its shared dependency is published and tested.
The unit of extraction is a useful capability. A local agent name does not require a one-to-one
shared agent or skill.

The current delivery authorization covers triage publication, the actual marketplace installation
test and the Stackweaver triage merge. Other rows below require their own scope selection and
accepted child spec before implementation. Existing development rules, product-specific workflows,
credentials, services and notification behavior remain outside this migration unless separately selected.

## Design

### Capability roadmap

| ID | Capability and existing source | Disposition and next decision |
| --- | --- | --- |
| TRIAGE | Backlog triage, `agents/issue-triage.md` | [Child spec](shared-triage.md) locally complete. Publish vh-adlc, verify the published marketplace payload, then merge the reviewed Stackweaver adapter. GUI discovery remains under [#33](https://github.com/michielvha/vh-adlc/issues/33). |
| D-01 | Dependency/security maintenance, `agents/maintenance.md` | Next extraction candidate after triage adoption. Draft a separate maintenance spec when selected. Compare dependency inventory, changelog/usage analysis and approved dispositions with existing vh-adlc bounded maintenance. Retain repository topology and release checks as settings; resolve the local protection-policy conflict before extraction. |
| D-02 | Persistent codebase audit, `agents/codebase-audit.md` | Candidate for a separate audit spec. Preserve finding identities, adversarial re-verification and residuals, and connect remediation to the existing lifecycle. Decide write/merge authority before carrying over local automation. |
| D-03 | Documentation impact, drift audit/resolution and truth checks | Deferred. Compare `agents/docs-impact.md`, `docs-drift-audit.md`, `docs-drift-resolver.md` and `docs-truth.md` with vh-adlc's existing documentation workflow first. Any selected extraction gets a separate spec. Existing scanners, ledgers, hooks and schedules stay unchanged. |
| D-04 | TFE compatibility and provider-fork workflows | Keep `agents/tfe-compat.md` and `agents/provider-fork.md` as domain extensions in Stackweaver. Extract only a separately selected reusable part, preserving product contracts and licensing boundaries. |
| D-05 | Broader Stackweaver development-loop onboarding | Separate future scope. Keep plan formats, slot isolation, integration/browser requirements and shipping rules local until their compatibility and migration are specified. No wholesale conversion follows from triage adoption. |

### Child feature contract

Each selected capability records its source behavior, shared behavior, retained repository settings,
intentional differences and authority model in one child spec. It identifies the existing shared
behavior it reuses and the project-specific behavior it leaves local. It follows the repository's
spec review and owner-acceptance process before implementation.

The canonical procedure must be independent of a particular harness or model. Harness integrations
remain thin adapters with an explicit tested capability matrix. Preserve existing daily entry points
and notification flows when they are in scope. Unsupported operations and owner-approved test
deferrals stay visible; installation alone does not establish workflow support.

### Adoption contract

For each capability, record the exact shared and consumer commits. Publish the shared component first,
install it from the actual marketplace in an isolated profile, verify its payload and native discovery,
and exercise the selected operation. Then adopt the consumer adapter and check its native and
harness-neutral entry points. Keep repository settings in the consumer and rehearse rollback on a
disposable checkout. Recheck evidence affected by changed commits rather than relabelling older runs.

The triage adapter's durable publication and rollback procedure is
`tests/agent-triage/README.md` in Stackweaver at `ff38a71f`. Its reviewed legacy entry remains on
Stackweaver main until the published shared dependency has been verified. Every later child supplies
its own equivalent handoff. A parent status never replaces a child's acceptance gate.

## Acceptance Criteria

- [ ] AC-01: Every selected capability has a separately accepted child spec defining shared behavior, retained consumer rules, intentional differences and authority before implementation.
- [ ] AC-02: Each adopted capability is installed from its published marketplace source and exercised through its declared supported entry points before the consumer's legacy route is retired.
- [ ] AC-03: Each adopted consumer retains its required settings and project-specific workflows, with a verified rollback path and exact shared/consumer revision evidence.
- [ ] AC-04: Unselected or domain-specific workflows remain local, and active capability decisions and test deferrals are traceable from this parent to their owning child document or tracker.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Inspect each selected child's accepted scope, review log and implementation history; confirm no parent-only approval started that implementation. |
| AC-02 | Observe an isolated real marketplace install, native discovery and the child's bounded operation test at the published revision before the consumer merge. |
| AC-03 | Compare the exact paired revisions, consumer settings and unrelated workflows; run the child's disposable rollback/reapply procedure. |
| AC-04 | Review every roadmap row and child/tracker link; compare untouched workflow paths and record explicit owner decisions for scope changes or test deferrals. |

## Tasks

- [x] T1 `docs/specs/shared-workflow-migration.md` - establish the parent roadmap and child-feature boundary without starting another extraction; lint the document (AC-01, AC-04).
- [ ] T2 `docs/specs/shared-triage.md` and Stackweaver `tests/agent-triage/README.md` - record the authorized shared publication, actual marketplace installation and ordered consumer adoption with exact revisions (AC-02, AC-03).
- [ ] T3 `docs/specs/` - when the owner selects maintenance, draft and independently review its own child spec before implementation (AC-01, AC-04).
- [ ] T4 `docs/specs/` - when the owner selects audit, draft and independently review its own child spec before implementation (AC-01, AC-04).
- [ ] T5 `docs/specs/` and this document - revisit documentation overlap, domain extensions and broader onboarding only when selected; retain explicit dispositions meanwhile (AC-01, AC-04).

## Open Questions

None needed for the authorized triage adoption. Future capability selection and child-spec acceptance
remain owner decisions; this draft grants no implementation authority for those capabilities.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): child scope, review, acceptance and evidence rules.
- [Pinned delivery conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): publication order and immutable review commits.
- [Pinned documentation conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/documentation.md) and [prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): authoritative planning location and prose.
- [Pinned delivery knowledge](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/knowledge/shared-delivery.md): delivery component discovery; the repository's selected workflow pins remain authoritative.
