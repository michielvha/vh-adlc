---
status: draft
status_description: "Triage is published and adopted after actual marketplace verification. Maintenance and audit remain candidates for separate child specs; other extractions are deferred."
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

The owner selected dependency/security maintenance next on 2026-10-27. Its draft child is
[shared-maintenance.md](shared-maintenance.md); independent review and owner acceptance precede
implementation. Stackweaver retains its specific operating procedures, including its existing
approved satellite-merge helper. No audit, documentation or domain extraction has been selected.

Triage is the first extraction. Its accepted behavior and local verification remain in
[shared-triage.md](shared-triage.md), initially completed at `0e033f8` and refreshed by Copilot Opus 5.5 R-34 before publication.
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

### Delivered triage adoption

The owner-authorized adoption completed on 2026-10-27, in dependency order:

| Delivery | Observed result |
| --- | --- |
| Shared source | [vh-adlc PR #34](https://github.com/michielvha/vh-adlc/pull/34) merged at `80fd36d0f9a1bc8f3610ff77c1f4c3f038e4a8f8`. Final feature-head CI and main CI passed Ubuntu full-suite, macOS portable-suite, Go and version jobs. |
| Shared runtime | [v0.6.0](https://github.com/michielvha/vh-adlc/releases/tag/v0.6.0) was created by the configured automatic version/release workflows. The signature verifies against primary fingerprint `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6`; all four platform archive checksums pass, and the Linux binary executes as `vh-adlc 0.6.0`. The plugin's binary lock remains intentionally at 0.1.0. |
| Actual marketplace upgrade | Native Codex and Claude installers upgraded disposable profiles from 0.3.1/seven skills to 0.4.0/nine skills, including triage. Both fetched the exact reviewed payload `f5d395ed87fb3785837dacc00ed26c0a74d1d4ad58e2022e4b18b1faf4220a17`, including modes. Native local-profile installation also completed for use in future sessions. |
| Installed operation | The installed binary bootstrap verified its locked download. The installed helpers completed a GET-only public collection and saved external reports through both payloads, leaving the checkout/index unchanged and every closure disabled. This is an installed-helper smoke test, not a GUI invocation or a new model trial. |
| Consumer adoption | [Stackweaver PR #976](https://github.com/michielvha/stackweaver/pull/976) merged at `5cb8917434ec322f257679302b174800031c9b1c`. Its tree exactly matches verified adapter `712af76e8f7a76f38c2888264fe2e33f869d1416`. Settings and triage command/model/procedure match the original reviewed adapter. |
| Rollback and preservation | The actual installed plugin passes rollback/reapplication against pre-cutover main `3d97c58d9984c5f74ab54bd76e6a333e10f6b095`, preserving index bytes and the newer public-docs route in AGENTS.md. Other agents and documentation workflow code stay unchanged. |
| Consumer verification | Four adapter contracts and all fourteen applicable scoped checks pass with zero failures/skips, including frontend checks selected by the required internal changelog disposition. The public changelog remains byte-identical. Stackweaver's internal-tooling merge intentionally uses `[skip ci]`; no hosted run is represented as a pass. |

The original private model trial retains its actual `ac76e1d`/`ff38a71f` binding. The later consumer
integration does not relabel it as a new trial. Published shared runtime and driver bytes are unchanged;
adoption rechecks cover the installed payload, forwarding/settings, current-main preservation and the
updated rollback baseline. GUI discovery remains unverified under #33.

### Capability roadmap

| ID | Capability and existing source | Disposition and next decision |
| --- | --- | --- |
| TRIAGE | Backlog triage, `agents/issue-triage.md` | [Child spec](shared-triage.md) adopted through vh-adlc #34 and Stackweaver #976 after actual marketplace tests. The delivery evidence is above. GUI discovery remains under [#33](https://github.com/michielvha/vh-adlc/issues/33). |
| D-01 | Dependency/security maintenance, `agents/maintenance.md` | Selected by the owner; [child spec](shared-maintenance.md) is being reviewed before acceptance. Reuse existing bounded maintenance. Retain topology, release checks and the approved satellite-helper exception locally; preserve the daily command and model. |
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
`tests/agent-triage/README.md` in adopted Stackweaver adapter `712af76e`. Its original local
acceptance used `ff38a71f`; the later adoption and current-main rollback baseline are recorded above.
The published shared dependency was verified before the consumer merge. Every later child supplies
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
- [x] T2 `docs/specs/shared-triage.md` and Stackweaver `tests/agent-triage/README.md` - record the authorized shared publication, actual marketplace installation and ordered consumer adoption with exact revisions (AC-02, AC-03).
      Evidence: Shared merge `80fd36d0`, signed runtime v0.6.0, two exact marketplace payload checks, installed-helper reports, installed-plugin rollback, fourteen consumer checks and Stackweaver merge `5cb89174` are observed and recorded above. No maintenance, audit, documentation or domain extraction started.
- [ ] T3 `docs/specs/` - when the owner selects maintenance, draft and independently review its own child spec before implementation (AC-01, AC-04).
      Progress: Selected on 2026-10-27; `shared-maintenance.md` drafted and independently reviewed by Copilot Opus 5.5 R-1. Factual corrections and the 2026-10-28 owner decisions are incorporated. Opus R-2/R-3 follow-ups are recorded; the owner adopted shared review for authored repairs, the presented record/worktree support and unchanged bot-only batching on 2026-10-28. The owner selected report-only commit and push during the authorized Stackweaver sweep; all decisions are incorporated. R-7/R-8 corrections retain main-checkout publication and define committed authority, race recovery and pending-report prerequisites. The owner approved standing report-only publication for later outcomes in the same run; fresh review and spec acceptance follow. The live Claude model trial is explicitly deferred while tokens are exhausted.
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
