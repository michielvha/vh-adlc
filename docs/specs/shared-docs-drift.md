---
status: draft
status_description: "First Copilot Opus 5.5 review is recorded. The owner chose all three recommendations; scanner completeness, independent publication review and staged scheduled cutover are specified. Fresh review and acceptance remain. No implementation or publication is authorized."
issue: null
goal: "Repositories can find accumulated documentation drift and resolve verified proposals through a shared workflow while retaining their own scanner, documentation rules and delivery policy."
covers:
  - plugins/vh-adlc/skills/vh-adlc-docs-drift/
  - plugins/vh-adlc/references/docs-drift.md
  - plugins/vh-adlc/references/docs-drift-settings.md
  - plugins/vh-adlc/references/docs-drift-review.md
  - plugins/vh-adlc/scripts/docs-drift/
  - plugins/vh-adlc/examples/docs-drift/
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/scripts/settings-file.ts
  - plugins/vh-adlc/scripts/github-read.ts
  - plugins/vh-adlc/scripts/audit/snapshot.ts
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tests/vh-adlc/docs-drift/
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/direct-operation-compatibility.test.ts
  - tests/vh-adlc/triage/discovery.test.ts
  - tests/vh-adlc/audit/intake.test.ts
  - tests/vh-adlc/lifecycle/
  - tests/vh-adlc/lifecycle-boundaries.test.ts
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

A local read-only baseline at that same Stackweaver revision returns process exit 0
with 466 unverified candidates: 19 error, 239 warning and 208 informational findings,
plus 54 suppressed findings and one stale suppression. The report has no explicit
collection-completeness field. The checkout and Git index are preserved. This is
scanner-output evidence, not a semantic audit, a clean result or an instruction to
apply any finding. The full private report stays outside the repository and review
packet; only these aggregate observations inform the contract.

Shared docs impact already supplies coverage matching and an affected-document review procedure; lifecycle intake routes that operation separately from persistent code audit (`plugins/vh-adlc/references/lifecycle.md:52-60`). This feature must not add a second coverage matcher or silently route a docs sweep to codebase audit.

The requested Claude Code Opus 5.5 spec review at
`199977cce9b1a0da4d938c9222de9c9ac0b2d010` was refused by its monthly spend limit.
The native process exits 1, reports is_error true and returns no valid reviewer
records. No Review Log row is stored. Its original public-only packet and native
transcript are retained locally. The owner subsequently selected Copilot Opus 5.5 for the review. No billing
change, implementation or publication follows from that reviewer selection.

## Scope

Include one harness-agnostic docs-drift operation with audit and resolve modes, a consumer configuration/scan-result contract, reports, bounded verification helpers, examples and Stackweaver migration tests.

Audit consumes a local scan and feedback history, verifies candidates against current source and prepares a concise report. An explicitly authorized prepare run may also produce bounded safe edits for a consumer-owned advisory workflow. Resolve rechecks selected old proposals, deduplicates them and prepares their verified subset plus a ranked decision list.

Keep the scanner and detector semantics local. Preserve Stackweaver's current command, advisory scheduling, source/index/visual rules, historical exemptions and feedback files through thin forwarding instructions. Do not change schedules, provider/model selection, secrets or notification behavior as part of extraction.

Excluded: docs-truth/sharding, a new universal scanner, detector-rule changes, product code repair, unrestricted autonomous publication, a replacement for feature acceptance/review gates, and migration of unrelated agents or active drift PRs. Live backlog resolution requires a separate selected run after adoption.

## Design

### Owner decisions

The owner selected the bounded scanner-completeness correction, independent review before publication and staged scheduled-worker cutover. These choices are part of the Design and Test Plan, not implementation evidence. The scanner correction changes collection accounting and error reporting only; detector rules, thresholds and project exceptions stay local. The legacy scheduled worker remains active until a real unattended trial of the installed shared worker succeeds. Interactive adoption may precede that trial, but full scheduled adoption and this feature's migration criterion remain incomplete until the trial and switch are verified.

### Entry and consumer contract

Add `vh-adlc-docs-drift` as a content operation with explicit audit and resolve intent. Read local instructions and resolve the existing pinned conventions. Keep the canonical procedure independent of model, shell-session persistence and harness-specific tool names. Missing prerequisites produce a setup handoff, never reconstruction of the retired agent.

Use `.vh-adlc/docs-drift.yaml`, read through `scripts/settings-file.ts` and the verified binary's strict YAML reader. A docs-drift validator owns its schema/version and meanings; no second YAML parser or alternative file suffix is added. PR discovery reuses the GET-only paginated `scripts/github-read.ts` reader and preserves its completeness/error observations. Incomplete selected PR collection is an assessment gap and cannot authorize resolution or superseded-PR closure.

Reuse the pure `hash`, `digest`, `git` and `gitBytes` exports in `scripts/audit/snapshot.ts` for identity primitives. Do not call its audit-specific `captureSnapshot`, which requires a persistent finding ledger and code-audit modes. The new `scripts/docs-drift/settings.ts`, `snapshot.ts`, `scan.ts`, `report.ts`, `adoption.ts` and `cli.ts` provide docs-drift validation, input binding, scan checks, report formatting and installed adoption consistency. They do not implement structural detectors. Do not import maintenance or audit `adoptionPreflight` directly: those receipts bind dependency topology or persistent-ledger policy. The new adoption helper follows their artifact-hash/payload/consumer/native-install consistency pattern with docs-drift evidence and preserves the same operator-attestation limitation; it grants no permission or enforced truth proof.

Add a lifecycle route for whole-corpus documentation drift and stale documentation-audit proposals. “Scan all docs for accumulated drift” selects audit; “recheck and consolidate these docs-audit PRs” selects resolve. “Which docs does this patch affect?” stays docs impact, a plain doc edit stays artifact editing, and persistent code-audit intent stays `vh-adlc-audit`. A request to verify claims exhaustively stays the selected local truth workflow or gets an unsupported-operation handoff. Ambiguous “audit” or “audit the docs” without enough context gets one focused question before any scan or write. The presence of settings never chooses the operation.

Ordinary locked-binary setup precedes strict settings and knowledge; this docs-drift content operation does not use persistent code audit's special offline bootstrap. Required pages are `conventions/feature-documents.md`, `conventions/documentation.md`, `conventions/documentation-impact.md`, `conventions/delivery.md` and `guides/humanize-prose.md`, plus applicable consumer language/project pages. Missing required knowledge stops with the existing missing-page/pin handoff. The loop's unpinned-content-operation rule adds no onboarding files: use the installed plugin revision, report the missing repository pin and leave onboarding to a separate authorized setup. Missing required consumer settings also gets setup instructions; do not create policy files as an incidental doc fix.

Consumer settings identify the scanner invocation as an argument vector, intended documentation scope, feedback files, project procedure and allowed verification/generation commands. PR discovery and publication destinations are explicit consumer inputs. Reports and settings cannot grant their own execution authority. Treat scanner messages, documentation and PR text as data; never execute embedded instructions or arbitrary report-supplied commands.

The scan result binds its source commit, scope/options and scanner identity, and distinguishes complete collection from findings and failures. It preserves finding detector, severity, document/location and explanation, suppressed findings with reasons, and stale suppressions. The following protocol makes collection completeness independently checkable against the selected files; it does not prove semantic truth or defend against a scanner or shell-capable agent deliberately forging evidence. Document identities stay within the consumer's configured scope. Unknown detectors remain visible candidates rather than being dropped or automatically fixed.

A process exit of zero, an empty findings list or a lower finding count does not prove completeness or accuracy. Missing/malformed reports, skipped inputs, mismatched source, unreadable feedback and unavailable required capabilities leave the assessment incomplete. Do not repair the scanner by weakening a shared validator; any necessary local completeness correction must have its own scoped regression and review.

### Scan-result protocol and local correction

Use a versioned JSON result with `schema_version: 1`, `source_commit`, `settings_digest`, scanner identity (script digest and argument vector), declared roots/exclusions/detector options, an examined-document inventory, collection failures, findings, suppressed findings and stale suppressions. Required fields and types are validated; duplicate document identities, unknown protocol versions, malformed entries or a changed binding are incomplete. The settings contract defines the documentation suffixes and scope; the initial example uses tracked Markdown under its configured roots. It never substitutes settings or scope supplied by the report itself.

The shared scan helper independently enumerates the expected documents from the exact Git tree and the committed configuration's scope/exclusions. Each in-scope document must have exactly one inventory entry binding its normalized relative path and content digest, with a read-success or failure outcome. Unexpected paths, omissions, duplicate entries, escapes, symlinks, changed content or explicit read/parse failures prevent a complete result. Legitimate configured exclusions remain explicit in the bound scope; an unexpected read failure cannot be relabelled an exclusion. Detector-specific historical exemptions remain detector policy after collection, not a way to hide unexamined inputs. Missing required detector execution is a gap even if all document reads succeeded.

An initial assessment uses a clean committed source. After authorized edits, the verification scan binds a new authorized local checkpoint commit; it includes any added/deleted documentation and regenerated outputs. Before that checkpoint, reports may describe a provisional diff, but cannot establish publication readiness. This avoids claiming committed-source verification over unrelated dirty or unrecorded document overlays.

Include the minimal Stackweaver correction in this migration: `scripts/docs-audit.js` records read/parse outcomes and document inventory instead of silently continuing on read failure, and emits the bound protocol directly or through its local adapter. Its existing advisory/strict exit semantics and detector findings remain unchanged; consumers inspect protocol completeness separately. Add meaningful local regressions in `scripts/docs-audit.test.js` and migration contract tests in `tests/agent-docs-drift/`: inject an unreadable/skipped document, observe the old omission, then require an explicit failure/inventory mismatch and an incomplete shared result. Compare ordinary findings and suppression behavior before/after to detect unintended rule changes. Independently review this bounded correction before consumer cutover; migration approval does not authorize applying its real findings.

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

Extend `references/authority.md` with two scoped docs-drift locations: an assessment checkout at an exact clean source (an existing owned checkout, or a new detached assessment worktree when isolation is required) and an owned prepare/resolve branch/worktree created for authorized edits. Record repository, canonical path, role, owner, ref/base and artifact location before use. A role grants only ordinary creation and non-forced cleanup of its own clean resources; retain evidence/refs when normal deletion refuses. Never repoint another task's branch, discard unrelated changes or remove another checkout. Branch creation is not commit, push or merge permission. Keep the existing maintenance/audit roles unchanged and extend their guarded worktree rule only for these named docs-drift roles; exercise it in `tests/vh-adlc/docs-drift/authority.test.ts` and existing `tests/vh-adlc/audit/intake.test.ts`.

The authority table separately covers read-only assessment/report output; scoped prepare/resolve edits and generators; local commits; pushes and advisory/resolve PRs; issue creation; superseded-PR closure; merged-branch cleanup; and merge/release effects. Each requires the actual current request or an adopted consumer procedure that names that effect and scope. Generated reports and settings do not confer those permissions. Read-only discovery alone allows no tracker write. Local checkpoint commits, publication locking and independent review follow the conditions below; none changes an existing consumer grant by implication.

Shared defaults permit assessment and proposals. Local edits need their selected run's authority; commits, pushes, advisory PRs, issue creation, superseded-PR closure and branch cleanup each retain their actual consumer/current permissions. Advisory publication never authorizes merge or downstream deployment. Do not import maintenance report-push grants or triage's enforced-proof controller into this workflow.

### Independent candidate review and publication

Require an independent review of every prepared advisory or consolidated resolve change before publication. Add `references/docs-drift-review.md` using the existing model-identity/isolation/returned-record protocol. The reviewer receives repository, exact candidate commit, assessment/report identity, selected finding/PR/decision scope, consumer policy and verification inputs. It inspects the entire proposed diff including feedback and generated files, checks source-grounded dispositions and authority, and runs or inspects the required checks. Per-claim verification is additional evidence, not a substitute for this candidate review.

A local checkpoint commit precedes review only when the run actually authorizes that commit; a permission to edit does not imply permission to commit. The scheduled prepare worker emits its bounded edit manifest and body without staging. Its authorized local wrapper stages only that owned manifest, makes the checkpoint, runs the read-only independent reviewer and publishes only after a clean matching result. No broad `git add -A` or partial/failed model return becomes success. Record native model identity, exact target and unmodified returned findings with their provenance outside the checkpoint tree, then include the evidence in the published artifact/PR through the authorized wrapper. A final record-only commit is permitted only under its actual authority and may preserve the reviewed source binding when its diff contains evidence alone.

Changed source/diff, settings, scanner/options/scope, feedback, selected PR heads/bodies or owner decision payloads invalidate the review and require revalidation/review. A missing reviewer, model mismatch or blocking/should-fix finding prevents publication. Reports remain available with their limits. This is an operator-reviewed workflow, not a new enforced-proof controller or an implicit permission to make remote changes.

Serialize the scheduled worker and a local resolve publisher for the same consumer through one cooperative repository publication lease. Only a run already authorized for the selected publication may create its named ephemeral lease ref; the adoption procedure names that acquire/release effect and its exact ref namespace. Atomically create the lease, record its exact object/run identity, and stop if another run owns it. Under the lease, recheck the current base, PR selections and reviewed candidate before pushing or closing superseded proposals. Release only the exact lease still owned by that run; never force-take a foreign lease or infer ownership from its age. Interrupted or ambiguous ownership leaves a visible pending state for explicit reconciliation. This adds no merge, broad branch deletion, protection bypass or release authority. Authority and race/recovery tests cover the lease as well as the actual publication effects.

### Scheduled worker and staged adoption

Keep Stackweaver's schedule, selected provider/model and credentials local. Its future shared worker obtains the published vh-adlc source at an exact full commit corresponding to a verified release, loads the plugin directory through the provider's supported mechanism and verifies its component digest/version against the adopted installed payload. Track both source release and plugin version explicitly; they need not have the same version number. Keep the source SHA and release annotation visible to the project's existing dependency updater, with an extraction fixture for that pin. Updater proposals do not authorize automatic route changes or waive adoption/review checks.

The new worker is not activated by a YAML-only or synthetic test. Preserve the current local scheduled worker until an explicitly authorized real unattended trial has loaded that exact shared component, completed assessment/preparation, obtained the required independent candidate review and exercised its bounded authorized advisory handoff. Record native results, loaded payload, model/provider, permissions, failure handling and owned output scope. No workflow dispatch, new spend, secret transfer or live backlog change is authorized by accepting this spec. If the trial cannot run, retain the local scheduled route and report scheduled adoption as pending; do not declare AC-06 or the whole feature complete from interactive success alone.

A separate cutover change activates the verified worker only after its trial, paired review and normal consumer checks pass. Preserve the existing worker bytes as a rollback target until that staged transition is complete. The shared feature stays on one implementation branch/PR; staging the consumer's interactive and scheduled routes is an adoption order, not multiple shared-feature releases.

### Migration and rollback

Before retiring either local route, inventory every caller, command, scheduled worker, scanner option, feedback reader and generated-output dependency. Record old-to-new behavior and explicit intentional differences. Keep the scanner, suppressions, correction history, docs-truth workflow and local project policy in Stackweaver; preserve their bytes except the owner-selected bounded collection-accounting correction and the reviewed routing/configuration migration. Detector rules and existing feedback contents remain unchanged.

Publish the shared feature only under separate authority, then verify actual native Codex and Claude marketplace fresh installs/upgrades, discovery and installed execution. Use bounded synthetic source/docs/PR/feedback scenarios for actual model trials; do not resolve real drift PRs or publish real findings during acceptance. GUI/phone checks remain unclaimed without observed coverage or a separately approved visible deferral. The real unattended worker trial is required before scheduled cutover under the staged choice above; a generic deferral cannot silently replace that requirement.

Fresh paired review binds the exact installed shared payload and consumer candidate. Complete corpus/legacy behavior checks and conflict-safe rollback/reapply must pass before consumer merge. Rollback restores only migration-owned routing/configuration and preserves scanner/feedback/customer documents, other workflows and newer unrelated changes. After merge, recheck installed routing and the local scheduled-worker contract at the observed revision. Do not label static YAML validation as a live scheduled provider run.

## Acceptance Criteria

- [ ] AC-01: An adopting repository can assess whole-corpus documentation drift through one discoverable harness-agnostic workflow while retaining its scanner, detector policy and existing change-scoped docs-impact behavior.
- [ ] AC-02: Assessments expose incomplete collection, unknown findings and stale inputs without claiming a clean or fully verified corpus, and ground proposed fixes in the selected source and document evidence.
- [ ] AC-03: Authorized preparation and resolution preserve unrelated work, intended contracts, historical documents and local feature-review rules while producing only the verified selected corrections and decisions.
- [ ] AC-04: Rejected proposals produce the correct detector-versus-interpretation feedback, and duplicate or conflicting stale proposals cannot silently reintroduce rejected or unsupported changes.
- [ ] AC-05: Reports let an owner understand the result and decisions without reading the full audit, and independent review precedes publication, and all local and remote effects retain their declared scope and permission boundaries.
- [ ] AC-06: Stackweaver uses the published installed workflow with verified legacy command compatibility and staged scheduled-worker cutover after an observed unattended trial, retained local scanner/feedback/site rules and a conflict-safe rollback path.
- [ ] AC-07: Required automated, native marketplace, bounded actual model and paired migration checks establish the supported behavior at recorded revisions, with unperformed surfaces explicitly unclaimed.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Install/discover the content operation and run it in a second synthetic adopter with different roots, statuses, scanner and generated files. Assert the documented request examples choose audit/resolve/docs-impact/plain-doc/persistent-audit/truth routes correctly; ambiguous wording asks once. Test missing settings, unpinned setup, missing knowledge and unchanged existing operations. |
| AC-02 | Exercise complete empty scans, findings, missing/malformed/stale reports, skipped or unreadable inputs, unknown detectors, suppressed findings and stale suppressions. Assert each incomplete source remains visible and prevents clean/ready claims. Independently enumerate the exact configured Git-tree corpus and compare every read/digest/failure entry; test omissions, duplicates, escapes, symlinks and missing requested detectors. Bind scans, evidence and rechecks to exact source/options; include source changes during assessment and malicious report/doc instructions. |
| AC-03 | Verify report-only preservation of files/index/refs; owned prepare/resolve edits; unrelated staged/unstaged work; historical/other-system/intended-contract and deliberately incomplete matrix cases; code-bug routing; uncertain/runtime acceptance boxes and local-format plan gates. Require explicit selection for destructive/structural and plan/status decisions. Missing independent verification remains provisional. |
| AC-04 | Resolve synthetic overlapping PRs with identical, contradictory, already-fixed and stale hunks. Verify every disposition, exact selected subset, changed-approval invalidation and fresh-base reconstruction. Test narrow detector suppression versus interpretation correction, no feedback writes in report mode, repeated mistakes and incomplete-scan refusal to retire suppressions. |
| AC-05 | Inspect actual model reports for concise summary, complete hidden/detail evidence, recommendations, unknowns and precise next decisions. Run fake remote/command collectors and exact owned-role checks to prove no unauthorized creation/removal of worktrees, commit/push/PR/issue/closure/branch action; exercise authorized scheduled preparation and publication failure without broad staging or clean-success fallback. Require exact-candidate independent review for advisory and resolve publication, unchanged raw records, denied publication on missing/mismatched/stale/failed review, and invalidation after source/feedback/selection changes. Race scheduled/local publishers through the same lease; deny a foreign or interrupted lease, and allow only exact owned release. |
| AC-06 | Inventory all actual legacy callers and compare shared/local behavior with current Stackweaver scan and bounded source fixtures; observe the old skipped-read regression, verify the bounded scanner correction and unchanged detector results, and establish completeness/semantic parity separately from process success. Test forwarding, original command arguments, feedback history, generation/visual rules and narrow owned publication. Verify worker source SHA/version/updater extraction and refusal of a mismatched component; run a separately authorized real unattended trial before switching its route, preserving the local route when the trial is absent/failed/incomplete. Rehearse rollback/reapply with unrelated edits/conflicts/symlinks; retain exact shared/consumer refs. |
| AC-07 | Run repository Go/vet/lint/module and Bun package checks plus portable macOS tests. Observe actual Codex/Claude marketplace fresh installs/upgrades and installed helper execution. Run bounded actual Copilot trials and requested Copilot Opus 5.5 independent reviews with original inputs/returns and model/read provenance. Obtain exact-payload paired acceptance before migration, then post-merge routing checks. Keep GUI/phone checks unclaimed until actually observed or explicitly deferred. A required unattended trial remains pending until observed; static worker checks and an interactive run cannot satisfy it. |

## Tasks

None yet; written after scope decisions, independent spec review and owner acceptance.

## Open Questions

None. The owner accepted the bounded completeness correction after its read/skip example and confirmed independent pre-publication review and staged scheduled cutover. This resolves those design choices; it is not acceptance of the revised spec or permission to implement, publish, dispatch a paid trial or merge.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-05 | R-1 | spec | `09872e18edd77fed61336bc4d10a31eafd46021f` | claude-opus-5.5 | procedural | 2 blocking; 4 should-fix; 1 nit. Full requested read coverage. |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Audit and preparation / Resolution and feedback / Authority and delivery; frontmatter covers
EVIDENCE: The design needs "one exact owned assessment tree" (00081 line 9) and "a fresh owned branch" (line 21). It also lists superseded-PR closure and branch cleanup as effects (line 29). Shared authority currently says "Outside the maintenance and audit roles below, never create, remove, prune, reset or force-move a worktree" (references/authority.md:78). It defines scoped worktree/ref roles only for maintenance (lines 92-117) and audit (lines 119-139). Its action table (lines 10-32) has no docs-drift row and no superseded-PR closure action. references/authority.md is not in covers (00001 lines 6-25), and the spec never says whether the owned tree is a new worktree, a ref or the current checkout.
PROPOSAL: Add references/authority.md and its guard test to covers. Define the docs-drift assessment and resolve location roles: creation, recorded owner/base/ref, non-forced cleanup and preservation. Add action-table rows for each docs-drift local and remote effect, including superseded-PR closure, together with the authority each one needs.
FINDING: F-02
KIND: judgement
SEVERITY: blocking
WHERE: Design, Entry and consumer contract; Migration and rollback; AC-02, AC-06
EVIDENCE: The scan result must distinguish "complete collection from findings and failures" (00081 line 3), and skipped inputs must leave the assessment incomplete (line 5). Context says the Stackweaver scanner skips a document on a read failure and has no completeness field (00001 lines 51, 57-58). The contract does not require the scanner to list the documents it examined. It also requires no independent comparison against the configured scope at the bound commit, so completeness still rests on the scanner reporting about itself. The spec keeps the scanner local, with its bytes preserved unless "a separately reviewed migration correction is necessary" (00081 line 35). It never says whether that correction, or an adapter, is part of this feature. Yet AC-06 needs scanner completeness verified (Test Plan AC-06).
PROPOSAL: Define a versioned scan-result schema with an examined-document inventory. A shared helper should compare that inventory with the configured scope enumerated at the bound commit, so any skipped input becomes visible without relying on the scanner. State whether the Stackweaver completeness correction or adapter is in this migration's scope, and name its regression test.
FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Scope; Design, Entry and consumer contract
EVIDENCE: The parent child contract requires each child to identify "the existing shared behavior it reuses" (shared-workflow-migration.md 00081 lines 3-4). The spec names only docs-impact as something it must not duplicate (00001 line 63). Existing shared helpers already cover several of its needs. scripts/settings-file.ts reads `.vh-adlc/<name>.yaml` strictly through the verified binary. scripts/github-read.ts provides GET-only paginated reads with a `complete` flag (PageResult, line 64). scripts/audit/snapshot.ts provides commit/digest binding, and maintenance and audit both have an adoptionPreflight. The spec names no settings file path, no format and no helper reuse for "bounded verification helpers" (00001 line 67).
PROPOSAL: Name the settings file and say whether it uses settings-file.ts. State whether PR discovery reuses github-read.ts and whether its completeness counts toward assessment completeness. Name the snapshot and adoption-preflight helpers it reuses or why it does not, and list the helpers the new scripts/docs-drift/ directory adds.
FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Entry and consumer contract; AC-01
EVIDENCE: The spec adds a content operation (00001 line 79) and covers lifecycle.md and loop.md (lines 12-13), but it defines no intake routing. Lifecycle already has rows for "Review documentation affected by a code change" and "Documentation or a convention" (lifecycle.md:56-57), plus a persistent-audit intent rule (lines 72-78). The spec gives no generic request that selects docs-drift, no rule for separating it from those rows or from "audit the docs", and no required knowledge pages. It also gives no unpinned onboarding behavior, which loop.md lists for each operation (the docs-impact integration test asserts the loop "add none" text). This repeats the gap an earlier review raised for docs impact (shared-docs-impact.md:982, 1156).
PROPOSAL: Specify the lifecycle row and its example requests. Say which ambiguous requests need a scope question, which pinned pages the operation requests and its loop.md onboarding behavior. Give AC-01 test cases with the expected route for each.
FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Resolution and feedback / Authority and delivery; AC-03, AC-04
EVIDENCE: Prepare and resolve produce documentation and feedback changes meant for a PR (00081 lines 21-25). The only independent-verification text covers a harness that "cannot delegate independent nontrivial checks" (line 15). Unlike maintenance-review.md and audit-review.md, the spec defines no independent review of the consolidated candidate. It sets no reviewer instructions, record location, exact-commit binding or invalidation after changes before a commit, an advisory PR or a resolve PR.
PROPOSAL: Define whether a consolidated prepare or resolve change needs an independent review before commit or publication. If it does, specify the reviewer reference, the stored record, binding to the exact candidate and the staleness rules. Add a Test Plan case for each.
FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Authority and delivery / Migration and rollback; AC-06, AC-07
EVIDENCE: AC-06 requires Stackweaver to use the shared workflow from its scheduled worker (00081 lines 31, 48). AC-07 leaves unattended provider execution unclaimed until it is observed or deferred (line 61), and static YAML is not a live run (line 39). The spec does not say how the scheduled runner obtains the exact plugin payload, or how that pin stays visible to the updater as delivery.md:55-66 requires. It also says nothing on serializing a scheduled advisory publication against a concurrent resolve run, while delivery.md:8-9 (00161) requires serializing publication where competing runs could conflict. So the scheduled worker could move to an unobserved route.
PROPOSAL: Specify how the worker installs and pins the shared payload, and how scheduled and resolve publication are serialized. Present the owner trade-off: keep the scheduled worker on its local route until an unattended run is observed, or cut over now with an explicit deferral.
FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Tasks
EVIDENCE: The Tasks section holds narrative about the refused Claude Code review (00081 lines 67-72). The status_description already repeats this content (00001 line 3). The standard reserves Tasks for task lines and keeps review history in the Review Log (feature-documents.md 00081 lines 27-36, 58-74).
PROPOSAL: Leave Tasks as "None." and keep the refusal note in Context or status_description only.

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/feature-documents.md) and [template](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/feature-document-template.md): one child document, owner decisions, review and status gates.
- [Pinned documentation conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/documentation.md), [delivery rules](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/delivery.md) and [prose guide](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/humanize-prose.md): publication boundaries, authoritative local rules and concise owner-facing prose.
- [Pinned agent entry point](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/AGENTS.md): source-grounded task routing and retained consumer instructions.
- Stackweaver files cited in Context were inspected locally at `d77259358c87aebc93ad76231ae245fd790c043a`; private report bodies, application source and secrets are not copied into this draft.
