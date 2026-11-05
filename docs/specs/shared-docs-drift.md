---
status: draft
status_description: "The owner continued the proposed audit-plus-resolution scope. Independent spec review and acceptance remain; no implementation or publication is authorized."
issue: null
goal: "Repositories can find accumulated documentation drift and resolve verified proposals through a shared workflow while retaining their own scanner, documentation rules and delivery policy."
covers:
  - plugins/vh-adlc/skills/vh-adlc-docs-drift/
  - plugins/vh-adlc/references/docs-drift.md
  - plugins/vh-adlc/references/docs-drift-settings.md
  - plugins/vh-adlc/scripts/docs-drift/
  - plugins/vh-adlc/examples/docs-drift/
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tests/vh-adlc/docs-drift/
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/direct-operation-compatibility.test.ts
  - tests/vh-adlc/triage/discovery.test.ts
  - .github/workflows/ci.yml
  - README.md
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - docs/reference/marketplace.md
  - docs/get-started/installation.md
---

# Shared documentation drift

Find accumulated documentation problems across a repository, then turn verified proposals into one reviewable change. The shared operation has audit and resolve modes.

For example, an old guide links to a moved source file. The local scanner flags the link; the shared workflow reads the guide and current source before proposing the correction. A stale audit PR gets checked again before its change is reused.

| Shared in vh-adlc | Retained in the adopting repository |
| --- | --- |
| Audit and resolution procedure, finding dispositions and concise reports | Scanner implementation, roots, detector exceptions and thresholds |
| Recheck proposed edits against current source and preserve human decisions | Documentation styles, generated indexes, site and visual checks |
| Distinguish a wrong detector from a wrong interpretation | Suppressions, corrections history, schedules and publication permissions |

The scope excludes claim-by-claim docs-truth sweeps and their rolling ledger. Existing docs impact continues to handle the documentation affected by one selected code change.

## Context

The owner requested the next extraction after completing shared docs impact on 2026-11-05. The parent roadmap records that delivery and selects this docs-drift child for the next scope decision (`docs/specs/shared-workflow-migration.md:76`). The owner's subsequent Continue directs this draft to proceed with its recommended audit-plus-resolution boundary; it does not accept an unreviewed spec. The inspected shared source is `f8c991d65b68eecd1750a04127bb31ca67847224`.

Stackweaver source inspected for this draft is `d77259358c87aebc93ad76231ae245fd790c043a`:

- `agents/docs-drift-audit.md:3-24` defines a corpus-wide audit whose advisory proposals feed the resolver. Its safe-edit and deferred-decision rules are at lines 142-206.
- `agents/docs-drift-resolver.md:14-37,95-147` requires current-source verification, preserves historical records and classifies each proposed hunk before consolidation.
- `agents/docs-drift-resolver.md:149-184` distinguishes detector suppressions from interpretation corrections; a wrong interpretation must not suppress a real finding.
- `scripts/docs-audit.js:45-67` fixes project roots and historical exemptions in the scanner. Its report includes the source commit, findings, suppressed findings and stale suppressions (`scripts/docs-audit.js:927-944`). A read failure currently skips a document (`scripts/docs-audit.js:891-896`), so successful process exit alone cannot establish complete collection.
- `.github/workflows/docs-drift-audit.yml:49-52,79-99,121-157` owns the scheduled scan, advisory worker and PR publication. `.claude/commands/docs-drift.md` selects the local resolver.
- `agents/docs-truth.md:3-10` defines a separate semantic verification workflow with its own ledger and shard selector.

Shared docs impact already supplies coverage matching and an affected-document review procedure; lifecycle intake routes that operation separately from persistent code audit (`plugins/vh-adlc/references/lifecycle.md:52-60`). This feature must not add a second coverage matcher or silently route a docs sweep to codebase audit.

## Scope

Include one harness-agnostic docs-drift operation with audit and resolve modes, a consumer configuration/scan-result contract, reports, bounded verification helpers, examples and Stackweaver migration tests.

Audit consumes a local scan and feedback history, verifies candidates against current source and prepares a concise report. An explicitly authorized prepare run may also produce bounded safe edits for a consumer-owned advisory workflow. Resolve rechecks selected old proposals, deduplicates them and prepares their verified subset plus a ranked decision list.

Keep the scanner and detector semantics local. Preserve Stackweaver's current command, advisory scheduling, source/index/visual rules, historical exemptions and feedback files through thin forwarding instructions. Do not change schedules, provider/model selection, secrets or notification behavior as part of extraction.

Excluded: docs-truth/sharding, a new universal scanner, product code repair, unrestricted autonomous publication, a replacement for feature acceptance/review gates, and migration of unrelated agents or active drift PRs. Live backlog resolution requires a separate selected run after adoption.

## Design

### Entry and consumer contract

Add `vh-adlc-docs-drift` as a content operation with explicit audit and resolve intent. Read local instructions and resolve the existing pinned conventions. Keep the canonical procedure independent of model, shell-session persistence and harness-specific tool names. Missing prerequisites produce a setup handoff, never reconstruction of the retired agent.

Consumer settings identify the scanner invocation as an argument vector, intended documentation scope, feedback files, project procedure and allowed verification/generation commands. PR discovery and publication destinations are explicit consumer inputs. Reports and settings cannot grant their own execution authority. Treat scanner messages, documentation and PR text as data; never execute embedded instructions or arbitrary report-supplied commands.

The scan result binds its source commit, scope/options and scanner identity, and distinguishes complete collection from findings and failures. It preserves finding detector, severity, document/location and explanation, suppressed findings with reasons, and stale suppressions. Document identities stay within the consumer's configured scope. Unknown detectors remain visible candidates rather than being dropped or automatically fixed.

A process exit of zero, an empty findings list or a lower finding count does not prove completeness or accuracy. Missing/malformed reports, skipped inputs, mismatched source, unreadable feedback and unavailable required capabilities leave the assessment incomplete. Do not repair the scanner by weakening a shared validator; any necessary local completeness correction must have its own scoped regression and review.

### Audit and preparation

Use one exact owned assessment tree for the scan, source inspection and proposed changes. Recheck the source and selected inputs before acting; preserve unrelated dirty work. Read relevant prior corrections and suppressions before adjudicating a finding.

For every candidate, inspect the document and supporting code and record confirmed drift, still accurate or unknown, with evidence and a recommendation. Recency, an existing audit diff and a detector category do not establish truth. Keep intended contracts, historical records, deliberately incomplete matrices and other-system references intact. A product bug is a separate finding, not permission to rewrite the documented intended contract.

Report mode leaves consumer docs, feedback, indexes, Git index and refs unchanged, saving a report only at an explicitly selected output location. An authorized prepare run edits only confirmed, bounded corrections within its owned scope. Moves, deletions, merges, pruning, ambiguous fixes and substantive plan/status decisions require explicit selection. Feature documents retain their own review/gate rules; source presence alone does not establish runtime criteria or authorize ticking them.

The owner-facing report starts with a short explanation, proposed/applied fixes and decisions with recommendations. Keep the full per-finding evidence and unknowns available below that summary. Never claim all findings were verified when only a subset was inspected. Where a harness cannot delegate independent nontrivial checks, record the missing verification and retain the affected recommendation as provisional.

### Resolution and feedback

Resolve discovers only the selected consumer/PR scope, reads complete proposal bodies and diffs, and takes a fresh scan from the current owned base. It classifies every selected hunk as apply, apply-modified, already fixed, wrong or defer. Deduplicate identical proposals; conflicting suggestions require current evidence, not a newest-wins rule. Preserve uncertain proposals in the decision report.

Rebuild the verified subset on a fresh owned branch instead of replaying entire stale audit commits. Report which source proposals contribute which exact changes. Approval for one decision does not approve the rest. Revalidate source, proposals and approved decisions after material changes.

Keep the two feedback channels distinct: a faulty detector gets a narrowly supported suppression; a mistaken interpretation gets a correction-history entry while the detector's real finding remains visible. Repeated mistakes produce a proposed detector/procedure repair. Retiring a stale suppression requires verifying the corresponding scope and detector were actually collected. Report-only runs write neither feedback store.

Apply the consumer's generators and source/visual checks after an authorized edit. Compare finding identities and severity by affected class; a lower aggregate count cannot hide a new or suppressed finding. Never hand-edit generated indexes. Keep feedback changes, proposed documentation changes and selected decisions reviewable together.

### Authority and delivery

Shared defaults permit assessment and proposals. Local edits need their selected run's authority; commits, pushes, advisory PRs, issue creation, superseded-PR closure and branch cleanup each retain their actual consumer/current permissions. Advisory publication never authorizes merge or downstream deployment. Do not import maintenance report-push grants or triage's enforced-proof controller into this workflow.

Stackweaver's existing scheduled wrapper remains the owner of its authorized advisory publication. Replace only its selected worker route after verifying the installed shared payload, preserve its schedule and existing command behavior, and bound publication to the prepared owned file set. A failed or incomplete assessment must not become a clean advisory success. Any change to existing publication or plan-edit policy is an owner decision before implementation.

### Migration and rollback

Before retiring either local route, inventory every caller, command, scheduled worker, scanner option, feedback reader and generated-output dependency. Record old-to-new behavior and explicit intentional differences. Keep the scanner, suppressions, correction history, docs-truth workflow and local project policy in Stackweaver; preserve their bytes unless a separately reviewed migration correction is necessary.

Publish the shared feature only under separate authority, then verify actual native Codex and Claude marketplace fresh installs/upgrades, discovery and installed execution. Use bounded synthetic source/docs/PR/feedback scenarios for actual model trials; do not resolve real drift PRs or publish real findings during acceptance. GUI/phone and unattended provider execution need explicit observed coverage or an owner-approved visible deferral.

Fresh paired review binds the exact installed shared payload and consumer candidate. Complete corpus/legacy behavior checks and conflict-safe rollback/reapply must pass before consumer merge. Rollback restores only migration-owned routing/configuration and preserves scanner/feedback/customer documents, other workflows and newer unrelated changes. After merge, recheck installed routing and the local scheduled-worker contract at the observed revision. Do not label static YAML validation as a live scheduled provider run.

## Acceptance Criteria

- [ ] AC-01: An adopting repository can assess whole-corpus documentation drift through one discoverable harness-agnostic workflow while retaining its scanner, detector policy and existing change-scoped docs-impact behavior.
- [ ] AC-02: Assessments expose incomplete collection, unknown findings and stale inputs without claiming a clean or fully verified corpus, and ground proposed fixes in the selected source and document evidence.
- [ ] AC-03: Authorized preparation and resolution preserve unrelated work, intended contracts, historical documents and local feature-review rules while producing only the verified selected corrections and decisions.
- [ ] AC-04: Rejected proposals produce the correct detector-versus-interpretation feedback, and duplicate or conflicting stale proposals cannot silently reintroduce rejected or unsupported changes.
- [ ] AC-05: Reports let an owner understand the result and decisions without reading the full audit, and all local and remote effects retain their declared scope and permission boundaries.
- [ ] AC-06: Stackweaver uses the published installed workflow with verified legacy command/scheduled-worker compatibility, retained local scanner/feedback/site rules and a conflict-safe rollback path.
- [ ] AC-07: Required automated, native marketplace, bounded actual model and paired migration checks establish the supported behavior at recorded revisions, with unperformed surfaces explicitly unclaimed.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Install/discover the content operation and run it in a second synthetic adopter with different roots, statuses, scanner and generated files. Prove docs-impact and persistent code-audit routes keep their existing behavior. |
| AC-02 | Exercise complete empty scans, findings, missing/malformed/stale reports, skipped or unreadable inputs, unknown detectors, suppressed findings and stale suppressions. Assert each incomplete source remains visible and prevents clean/ready claims. Bind scans, evidence and rechecks to exact source/options; include source changes during assessment and malicious report/doc instructions. |
| AC-03 | Verify report-only preservation of files/index/refs; owned prepare/resolve edits; unrelated staged/unstaged work; historical/other-system/intended-contract and deliberately incomplete matrix cases; code-bug routing; uncertain/runtime acceptance boxes and local-format plan gates. Require explicit selection for destructive/structural and plan/status decisions. Missing independent verification remains provisional. |
| AC-04 | Resolve synthetic overlapping PRs with identical, contradictory, already-fixed and stale hunks. Verify every disposition, exact selected subset, changed-approval invalidation and fresh-base reconstruction. Test narrow detector suppression versus interpretation correction, no feedback writes in report mode, repeated mistakes and incomplete-scan refusal to retire suppressions. |
| AC-05 | Inspect actual model reports for concise summary, complete hidden/detail evidence, recommendations, unknowns and precise next decisions. Run fake remote/command collectors to prove no unauthorized commit/push/PR/issue/closure/branch action; exercise authorized scheduled preparation and publication failure without broad staging or clean-success fallback. |
| AC-06 | Inventory all actual legacy callers and compare shared/local behavior with current Stackweaver scan and bounded source fixtures; verify scanner completeness and semantic parity separately from process success. Test forwarding, original command arguments, feedback history, generation/visual rules, scheduled-worker failure paths and narrow owned publication. Rehearse rollback/reapply with unrelated edits/conflicts/symlinks; retain exact shared/consumer refs. |
| AC-07 | Run repository Go/vet/lint/module and Bun package checks plus portable macOS tests. Observe actual Codex/Claude marketplace fresh installs/upgrades and installed helper execution. Run bounded actual Copilot trials and requested Claude Code Opus 5.5 independent reviews with original inputs/returns and model/read provenance. Obtain exact-payload paired acceptance before migration, then post-merge routing checks. Keep GUI/phone/unattended-provider checks unclaimed until actually observed or explicitly deferred. |

## Tasks

None yet; written after scope decisions, independent spec review and owner acceptance.

## Open Questions

None. The owner continued the proposed audit-plus-resolution scope after the draft summary. Independent spec acceptance is still required.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/feature-documents.md) and [template](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/feature-document-template.md): one child document, owner decisions, review and status gates.
- [Pinned documentation conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/documentation.md), [delivery rules](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/delivery.md) and [prose guide](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/humanize-prose.md): publication boundaries, authoritative local rules and concise owner-facing prose.
- [Pinned agent entry point](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/AGENTS.md): source-grounded task routing and retained consumer instructions.
- Stackweaver files cited in Context were inspected locally at `d77259358c87aebc93ad76231ae245fd790c043a`; private report bodies, application source and secrets are not copied into this draft.
