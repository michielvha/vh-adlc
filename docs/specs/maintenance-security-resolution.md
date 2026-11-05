---
status: in-progress
branch: feat/maintenance-security-resolution
status_description: "Implementing the accepted shared security accounting workflow; Stackweaver verification remains report-only and advisory remediation is excluded."
issue: null
goal: "Every security finding in a maintenance scope retains its evidence, an explicit route through an existing loop, and an outcome that distinguishes verified fixes from outstanding work and exceptions."
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
  - tests/vh-adlc/direct-operation-compatibility.test.ts
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
---

# Plan: Security finding reconciliation in shared maintenance

Extend shared maintenance so an advisory, scanner finding or coverage gap survives collection, selection, repair and subsequent sweeps with an explicit next action. Use the existing repair and feature loops.

## Context

Measured baseline: published vh-adlc default commit `1f5ac3d5b2b91c03fdc13dd7c73de529d5935c8d`, fetched on 2026-11-05. The completed [shared maintenance feature](shared-maintenance.md) owns the original extraction. This document defines new scope and does not reopen its completed criteria or inherit its historical approvals.

- `plugins/vh-adlc/scripts/maintenance/collect.ts:6-25,65-86` retains independent open Dependabot and code-scanning surfaces with completeness, package, manifest, severity and description. Its normalized alert does not retain advisory aliases, affected ranges, patched versions, dependency scope or terminal-state evidence.
- `plugins/vh-adlc/scripts/maintenance/history.ts:147-158` compares complete open lists and names disappeared identities `resolved`. It does not distinguish a fixed alert from a dismissed alert or an absent finding whose terminal state cannot be read.
- `plugins/vh-adlc/scripts/maintenance/report.ts:101-117` embeds portable observations and free-text analysis. `cli.ts:98-101` accepts an append update; `report.ts:160-170` allows mutable status text. Those interfaces have no typed per-finding route or security accounting decision.
- `plugins/vh-adlc/scripts/maintenance/analysis-input.ts:31-43,73-82,84-106` already exports and verifies versioned, digest-bound supplied analysis packets. This is reusable infrastructure for explicit scanner evidence, not an existing scanner finding adapter.
- `plugins/vh-adlc/references/maintenance.md:65-83,106-108,224-246` already requires alert collection without a PR, preserves incomplete surfaces, and sends authored compatible repairs to bounded maintenance and wider changes to the feature loop. `references/lifecycle.md:116-165` supplies task records, verification, independent review and local completion. A second security implementation lifecycle would duplicate these contracts.
- `plugins/vh-adlc/scripts/maintenance/settings.ts:99-108` binds expected scanning unavailability to a consumer's repository, status, literal message and evidence file. Changed responses must remain visible; no shared unavailable-message allowlist is needed.

GitHub's Dependabot API exposes separate open, fixed and dismissal states and advisory/dependency metadata. Its code-scanning API exposes alert state and analysis information. These primary sources support terminal-state reads rather than inferring a patch from absence; see Sources.

The owner's 2026-11-05 request authorizes specification of shared maintenance improvements, reuse of existing loops and retention of consumer policy locally. It excludes fixing the current advisories. The owner selected explicit versioned scanner evidence packets for the first version and complete accounting before reconciliation. Automatic CI artifact collection is deferred. No private repository inventory or live advisory payload is part of this public specification.

## Scope

In scope: typed security observations, evidence-backed source ownership and grouping, durable per-finding dispositions, scanner packet intake, terminal-state reconciliation, a portable security snapshot, continuation across sweeps, compatibility handling, and fixtures that exercise these behaviors through actual helpers and the installed operation.

Deadlines, severity thresholds, named owners, required scanner surfaces, exploitability decisions, risk acceptance, purchasing/visibility decisions, source/sync mappings and release/deployment checks remain in consumer instructions and policy. The shared layer validates their explicit references and records missing decisions. It supplies no response deadline, acceptance default or protection-changing action.

Excluded: advisory fixes or dependency bumps; changes to Stackweaver; a new security skill or implementation loop; a second audit ledger; automatic GitHub Actions artifact retrieval; new scanners; continuous monitoring; automatic issue creation, alert dismissal, VEX publication, merges, releases or deployment; credential rotation and incident response. A finding that needs one of these actions gets an explicit handoff under the existing authority rules.

## Design

### 1. Observation identity and provenance

Extend the maintenance collector with a versioned security observation envelope while preserving the existing inventory reader. Each observation contains:

| Field group | Required information |
| --- | --- |
| Identity | Hostname, repository identity, surface, provider alert ID or producer fingerprint, and a stable occurrence key |
| Target | Source commit and manifest/location, or exact artifact digest; scanner category, target platform and configuration identity where applicable |
| Vulnerability | Provider advisory/rule identity, explicit CVE/GHSA/other aliases, ecosystem, package and installed version, affected range and known fixed versions when supplied |
| Context | Provider severity, dependency relationship and development/runtime scope when supplied; unknown values remain explicit |
| Evidence | Observation time, provider state, source reference, raw response/artifact digest, collection/scan scope, filters/exclusions, completeness and errors |

Provider identities are namespaced by host/repository/surface; advisory aliases never replace occurrence identity. A scanner fingerprint includes producer/rule, package or location, platform and stable target identity; a rescan of a new image digest is a new observation linked by an explicit target comparison, not the same artifact. Reject duplicate/conflicting identities and unsupported schemas. Missing optional provider metadata is unknown, not evidence of safety or a fabricated patch.

Keep API responses and scanner evidence distinct. A report can show one canonical remediation group with several occurrences only when source/sync mapping and advisory/package evidence establish equivalence. Retain every original occurrence, affected repository, installed version and target. Similar titles, a shared CVE alone, or overlapping files are insufficient to merge work. Unknown ownership or conflicting versions keeps the mapping pending. Grouping grants no execution scope in another repository.

### 2. Consumer policy and coverage

Retain `.vh-adlc/maintenance.yaml` schema 1. Add an optional local `security_policy` reference to a repository-contained policy file, resolved and validated like `project_procedure`. An existing project procedure can remain the policy source when this field is absent. Record the effective policy file paths and Git blob/digest bindings with each decision. No policy text is executable configuration.

The policy describes locally required surfaces, explicit owners or assignment rules, review deadlines if any, exception requirements and verification/delivery requirements. These are instructions for the operation; the first version does not invent a general policy language or evaluate arbitrary commands from YAML. Typed reconciliation validates structural evidence and records policy assessment as procedural, with its actual reviewer/decision references. It does not attest that prose was enforced by a sandbox.

Retain the exact existing `surface_expectations` contract. An unmatched 403/404, changed message, partial scan, missing required packet, unsupported producer schema or inaccessible evidence is a coverage gap with null total. A successful current scan supersedes an older unavailable expectation. Documented unavailability is n/a, never zero or a verified fix. One incomplete surface does not suppress another surface's complete findings.

The declared scope is fixed before reconciliation. Missing policy or an undeclared scanner requirement is an explicit handoff. A run cannot claim universal security coverage, and a later exclusion cannot erase an already discovered occurrence. A scope reduction needs the owner's explicit decision, recorded with the excluded identities and reason.

### 3. Explicit scanner evidence packets

Extend the existing supplied-packet machinery with `maintenance-scanner-evidence-v1`. A trusted operator supplies a normalized JSON manifest and referenced raw evidence files outside the consumer source tree. The manifest binds host/repository, source commit or image digest, tool and database/configuration identities, producer/schema version, observed time, target platform, exact scan scope/exclusions, scan completion, invocation/exit receipt, normalized occurrences, file digests and the synthetic-input flag.

Verify every referenced file and the target/scope bindings before importing observations. Accept physical regular files only, reject traversal/symlinks, duplicate/undeclared files, unsupported versions and digest mismatches using the existing packet verification conventions. Normalized findings cite their raw evidence location. An operator's normalization receipt records who produced the mapping; hashes prove byte integrity, not scanner honesty or independent exploitability review. Evidence remains untrusted task data and is escaped for rendering. Imported packets are never executed and cannot authorize network reads or writes.

The first version consumes the normalized envelope, not arbitrary human-readable CI summaries and not a generic parser for every scanner. Document how a consumer supplies Trivy vulnerability/misconfiguration or govulncheck results in that envelope, retaining the raw machine output and producer receipt. Producing that evidence remains an explicit consumer/operator step. Missing raw output or inability to establish the mapping leaves the packet incomplete.

Record completion separately from process success and finding count. A report-only scanner may exit zero with vulnerabilities; a scanner may use a nonzero findings exit while completing its scan. Neither status alone establishes an empty or complete scan. A failed/truncated/unknown scan cannot support absence comparison. Synthetic packets support fixture analysis only and cannot verify a live fix, exception or release.

Automatic workflow discovery, artifact download and new scanner execution are deferred. No fixture run touches a real consumer or its security settings.

### 4. Per-finding disposition and existing routes

Maintain one current disposition per occurrence, linked to a canonical remediation group when equivalence is proven. Preserve previous observations and decision history append-only. The disposition includes evidence references, canonical source repository/path or an unknown marker, exposure assessment with its basis, route, reason, task/spec/tracker reference, next action, explicit owner or assignment handoff, any local review date, and policy bindings. Never invent an owner, deadline or accepted exception.

| Situation | Existing route and retained gates |
| --- | --- |
| Compatible selected bot update | Existing dependency batch, usage/notes analysis and consumer checks |
| Compatible authored dependency or bounded source/build repair | Bounded maintenance record, baseline/regression evidence, required checks and independent review |
| Major/breaking upgrade or new behavior, trust/data/public contract or delivery policy | Existing feature specification, owner acceptance, tasks, implementation, independent review and shipping |
| Unclear reachability, missing patch or unresolved ownership | Investigation with a linked next action and decision trigger |
| Persistent source-audit finding | Link the existing consumer audit record when selected; do not create a second audit ledger |
| Repository posture or operational setting | Consumer-local policy/backlog or explicit operation handoff; never weaken protection to silence a finding |
| Non-affected, mitigation or accepted risk proposal | Evidence and the consumer's decision route; record an exception separately from a fix |

A proposed route is not owner selection. An existing explicit selection remains valid only for its unchanged scope and evidence. A blocked update must retain a next action, such as upgrading the parent dependency, investigating an alternative or requesting a local risk decision. It cannot disappear behind a generic needs-decision label.

The same record links a bot candidate, an authored repair or a feature migration; avoid duplicate tasks for equivalent work. A local-only record is a plain unpublished reference with its commit/ref binding. Published report links require observed reachability. Creating a tracker, publishing a record or entering another repository still needs its existing authority.

### 5. Outcome verification

Track provider state, remediation verification, exception decision and delivery stage separately. Valid remediation results are `open`, `fixed-verified` and `unknown`; mitigation, non-affected and risk acceptance are explicit exception kinds with their own evidence/validity. A dismissed provider alert is not automatically an accepted local exception.

Track immutable target lifecycle separately as `active`, `superseded-pending` or `retired-verified`. A corrected successor digest B never changes the vulnerability result recorded for old digest A. Bind an explicit successor edge to both digests and the source/scan evidence establishing B's corrected behavior. Building B alone leaves A's active obligation open. Deploying B while A remains active also leaves that obligation open. Required propagation/rollout remains pending separately.

Retiring A's active obligation requires the consumer's explicit retirement scope and authority, observed evidence that A is no longer active in that scope, and the required successor/retirement checks. Retirement can end active remediation without patching immutable bytes; retain A's vulnerable history, successor link and retirement evidence. Never infer retirement from a new tag, absent scan, deployment claim or owner decision alone. An unsupported image still distributed or active within the consumer's declared scope remains outstanding. Reactivation, changed scope or invalidated retirement evidence restores the active obligation. The helper records observed retirement; it performs no rollout, deletion or other live operation.

An occurrence absent from a complete comparable open list becomes `no-longer-open`, then receives a fixed-argv GET-only read of its exact known alert identity. Preserve fixed, dismissed/auto-dismissed, reopened, unavailable and unsupported provider results separately. A denial, deletion, stale analysis or 404 never proves a fix. Restrict the read to previously observed, in-scope identities; do not scrape arbitrary advisory URLs. Recheck moving identities/targets and preserve conflicts as unknown.

`fixed-verified` requires observed evidence for the claimed target: the corrected manifest/source or built artifact, relevant verification results, and a current comparable scan/provider analysis that covers the affected occurrence and target. Bind evidence to the source commit, manifest digest or image digest, plus scanner configuration/database identity and observation time. A new database need not have an identical digest, but its changed coverage and ability to detect the same rule/advisory must be assessed; unsupported comparison stays unknown. Green CI, a merged PR, a listed patched version or provider fixed state alone cannot establish the full result.

Record source correction, published release/satellite propagation and observed deployment as separate stages. A source fix can be verified without claiming an unobserved deployment. A consumer-required release or deployment remains pending until its actual named check is observed. Every grouped occurrence keeps its own outcome; a canonical source change cannot automatically verify all satellite or image targets.

An exception records its kind, rationale, target, supporting evidence, deciding authority and policy reference, with a review trigger or expiry where consumer policy requires one. A supplied dismissal reason cannot create authority. Missing decisions stay pending. Changed targets, source, scope, policy or verification inputs require reassessment; expired exceptions return to pending. Proposals for VEX retain the same evidence and review requirements and grant no publication or dismissal action.

### 6. Reconciliation contract and persistence

Add `security-reconcile --run-id <id> --input <file>` to the existing maintenance helper. The versioned input binds the exact inventory, scanner packets, prior security snapshot, proposed dispositions, terminal reads and policy assessment by digest and source/scope. The helper validates existing files and returns a deterministic `maintenance-security-v1` snapshot with `accounting_state`, per-occurrence outcomes, coverage gaps, pending handoffs and invalidated evidence. It performs no remote mutation, scanner execution, status change or publication. Terminal GET collection remains in the collector through the shared GitHub reader.

The owner selected complete accounting before reconciliation. `accounting_state: reconciled` means each in-scope occurrence has a verified result or a concrete tracked follow-up with the required decision/assignment handoff; every required surface is complete, explicitly documented unavailable, or carried as an unresolved coverage handoff. A missing owner or inaccessible tracker stays pending and prevents reconciliation until a concrete assignment/tracker handoff is recorded. A coverage handoff can make gaps accounted for but never makes collection complete. Untracked findings prevent reconciliation. `reconciled` never means all vulnerabilities are fixed.

Keep independently derived `coverage_state`, `open_remediation_count`, `exception_count` and `pending_delivery_count` visible even when accounting is reconciled. All counts distinguish occurrences from remediation groups and active obligations from retired historical targets. A retired vulnerable image remains visible as retired, never as fixed. No all-clear result is produced when required coverage is unknown, active findings remain open, an exception is merely proposed or required delivery is pending. A report about completed selected work may still have unresolved security findings; its legacy status text cannot override these structured states.

Extend `report` with an optional `--security <snapshot>` input and append/candidate validation with a typed security update reference. The initial inventory report remains saveable before dispositions are ready and is marked security accounting pending. Revalidate the snapshot's inputs and policy bindings at report creation, typed updates, report candidate commit and resume. Free-text append cannot establish typed reconciliation. Reusing an old snapshot after source, scope, relevant evidence or policy changes yields pending reassessment, not a copied success. These checks validate procedural records; they grant no enforcement claim for arbitrary prose or remote actions.

Persist snapshots and decision deltas in the existing private run journal/artifact store with revision/digest checks and intent/receipt recovery. Every snapshot binds its collection revision and digest, snapshot revision, previous snapshot digest when present, and decision/verification inputs. The dated report carries the initial snapshot and appended later snapshots, preserving prior body bytes and observation evidence. Within a run, select the latest valid linked snapshot by monotonic revision and digest chain, not by Markdown position or a supplied timestamp alone. Forked chains, duplicate revisions or missing predecessors stay pending.

Across new sweeps, merge relevant committed history per occurrence, retaining commit/path/snapshot provenance from every overlapping prior run. Compatibility means matching host and repository identity, surface and comparable collection filters, plus the same target or an explicit evidenced successor relationship. Source commits may differ; compare relevant manifest/configuration/target bindings before carrying decisions forward. Never require the entire earlier run scope to equal the new run scope. Union outstanding occurrences from separate A-only and B-only sweeps when a later sweep covers both. A newer narrowed-scope snapshot cannot erase an older occurrence it did not cover.

Use each run's verified snapshot chain, then reconcile duplicate occurrence histories only through an explicit successor decision/evidence relationship. Timestamp ordering alone cannot resolve conflicting outcomes or authority. Unresolved conflicts, changed targets and incompatible evidence remain pending reassessment with their original identities. Findings outside the requested execution scope remain preserved history or explicit scope handoffs, never additional action authority. Local-only history stays explicitly local. No second mandatory ledger is introduced. An unresolved previous occurrence remains pending until positively reconciled; it is not dropped because the current open list omits it.

### 7. Compatibility, publication and rollback

Keep reading existing settings, schema-1 inventories, private journals and `maintenance-observation-v1` reports. Each report retains exactly one legacy open-list block, projecting only its original collection revision/digest. Bind the initial security snapshot to that collection. A later snapshot can use a new collection while preserving both the original block and earlier snapshots. Cross-check shared observation fields only within the same bound collection revision; legitimate changes between later collections are history, not contradictions. Reject contradictory bytes or outcomes for a matching revision rather than choosing a favorable block.

The latest valid security snapshot chain is authoritative for current dispositions and closure. The single legacy block remains the original observation for legacy readers; it never pretends to be the current open list after updates. A fresh reader selects the latest validated snapshot and exposes its collection binding and the original legacy block's historical status. Existing append-only report updates remain readable; typed later snapshots supersede earlier typed state with explicit provenance, without rewriting old observations.

Version the new history comparison output as schema 2. Replace the old disappearance-only `resolved` output with `no_longer_open` and separately verified terminal outcomes. Never emit the old field as a patch verdict. Legacy `resolved` history is displayed as an unverified historical disappearance, with no backfilled fix or exception. Update the helper's documented output contract and its known consumers/tests in the same release. A reader requesting an unsupported schema fails explicitly.

Do not upgrade an existing journal or overwrite a report on read. Write new snapshots as new versioned artifacts in the existing run with provenance and expected prior digest. Old reports lacking a security snapshot remain usable evidence, but cannot establish new reconciliation or closure. A failed migration/import preserves the original bytes and leaves a handoff.

Publish through the existing report declaration/current permission route. A security snapshot grants no extra report or task-record publication paths. Raw scanner outputs stay private unless separately authorized; portable reports contain only the consumer-approved finding metadata and evidence references, never credentials or sensitive snippets. Bump both plugin manifests together when implementation is released, and document the history output change. No Go runtime, binary gate or engineering pin change is planned for this feature.

Rollback first checks the exact prior released helper's settings reader against frozen copies of the adopted settings and required local references, without changing the consumer checkout. Preserve original settings bytes and all new artifacts/reports. The prior reader rejects the new `security_policy` key, so that case produces a concrete incompatible-settings setup handoff; do not claim legacy collection is usable or silently remove the policy reference.

If the owner separately authorizes a consumer settings restoration, retain both configurations and the adopted policy file, bind the restoration to its reviewed change, and rerun the prior reader before using legacy inventory. Without that authority, rollback can reinstall the prior plugin but remains blocked for dependent consumer operations. Even with compatible settings, an older helper cannot certify the new security snapshot and must report that limitation. Consumer policy changes, live rollout and advisory remediation require their own scope after this shared feature.

### 8. Verification approach

Use synthetic repositories and neutral identities throughout. Extend the existing actual-CLI collection, report, publication, recovery and native lifecycle fixtures. Add focused security reconciliation fixtures that invoke the production helpers rather than recreating their logic. Tests cover source-owned and synced occurrences, a dependency with no bot PR, incompatible migrations, code and posture findings, scanner packets, missing policy decisions and terminal outcomes.

Run native installed-operation trials for a report-first sweep, selected compatible authored repair, feature handoff and resumed security accounting. Observe the actual route, saved artifact, checks/reviewer handoff and unchanged forbidden refs/settings. Keep synthetic/native results separate from live provider or consumer compatibility. Independent implementation review observes the final required checks; no fixture establishes that real advisories were fixed.

## Acceptance Criteria

- [ ] AC-01: Every imported security occurrence retains its provider identity, target, available advisory/dependency context and evidence provenance, and malformed or conflicting observations cannot become accepted complete evidence.
- [ ] AC-02: Proven equivalent occurrences can share canonical remediation without losing per-repository targets or outcomes, and unknown ownership or incomplete coverage remains an actionable handoff.
- [ ] AC-03: Versioned scanner evidence packets participate in the same finding accounting with verified bytes and explicit completion, while unsupported, tampered, synthetic or incomplete inputs cannot establish a live fix or a clean surface.
- [ ] AC-04: Each outstanding finding has a concrete route and next action through the existing batch, bounded-maintenance, investigation, feature, audit-reference or consumer-policy path without creating duplicate implementation loops or selecting work implicitly.
- [ ] AC-05: Disappeared alerts remain distinguishable from verified fixes, dismissals, exceptions, reopened findings and unavailable terminal evidence, and retiring a replaced immutable target never marks its historical vulnerable bytes patched.
- [ ] AC-06: Valid consumer-authorized exceptions retain their rationale and validity independently of fixed outcomes, and missing, changed or expired evidence returns the affected decision to pending assessment.
- [ ] AC-07: A security reconciliation result exposes complete finding accounting independently of coverage, open remediation and delivery, and cannot conceal an untracked occurrence or override missing evidence with report status text.
- [ ] AC-08: A resumed run or fresh sweep recovers pending findings, decisions and evidence from every relevant compatible history, preserves collection-bound snapshot revisions, and never drops work through a newer narrowed scope or rewrites earlier evidence.
- [ ] AC-09: Existing consumers retain readable settings, inventories and reports, while legacy disappearance comparisons cannot be presented as newly verified fixes and incompatible schemas produce an explicit handoff.
- [ ] AC-10: Report publication, selected repairs and feature handoffs retain existing authority and independent-review gates, consumer security policy remains local, and specification or fixture execution makes no real advisory, repository-setting or live-service change.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Extend `tests/vh-adlc/maintenance/collection.test.ts` and add `security.test.ts`: exercise actual fixed-GET CLI collection with optional fields, unknown relationship, duplicate IDs, same IDs on different hosts/repos, moving targets and missing pages; accepted evidence preserves original identities and invalid data remains incomplete. |
| AC-02 | `security.test.ts` uses proven sync mappings with divergent versions/platforms, shared aliases without source equivalence and unknown source ownership; one group retains each occurrence and cannot close an unverified satellite. Existing unavailable-message variants remain incomplete unless exactly matched; an unexpected successful surface is collected. |
| AC-03 | Add `scanner-evidence.test.ts` using real packet export/verification: valid normalized vulnerability and misconfiguration packets; complete empty output; exit-zero findings; findings-exit nonzero; interrupted scan; altered/missing/extra files, symlinks/traversal, target mismatch, unsupported version and synthetic evidence. Only valid complete target evidence participates in comparison; original source/index/refs stay unchanged. |
| AC-04 | Extend maintenance lifecycle fixtures and actual installed-operation trials: compatible bot candidate, manual lock repair without a PR, major parent migration, uncertain exposure, posture and audit-reference cases. Inspect artifacts and actual dispatch; authored repairs retain exact-target independent review, majors stop at spec acceptance, and existing records are reused. |
| AC-05 | Extend `report.test.ts` and `collection.test.ts`: disappearance followed by fixed, dismissed, auto-dismissed, reopened, 403/404, stale/mismatched target and unsupported provider response. A merged PR or provider fixed state without relevant target verification remains unverified; source-only proof cannot certify an image/deployment or every group occurrence. Test corrected digest B built only, B deployed while vulnerable A remains active, and A's evidenced retirement/reactivation. Preserve A's vulnerable history and allow retirement only in its observed authorized scope. |
| AC-06 | `security.test.ts` covers proposed and authorized mitigation/non-affected/risk exceptions, missing authority, expiry, changed source/digest/policy and invalidated checks; assertions distinguish exception, provider dismissal and verified fix. No request may dismiss an alert or publish VEX. |
| AC-07 | Invoke actual `security-reconcile`, report, append and candidate helpers with an orphan finding, concrete tracked handoff, missing owner assignment, inaccessible tracker, required missing scan and completed selected repair. Assert independent accounting/coverage/remediation/delivery states, refusal of a falsely reconciled snapshot and unchanged state after a free-text success assertion. |
| AC-08 | Extend journal/recovery/report tests: interrupted write and retry, changed policy/input hashes, pending report publication, superseded scanner target, fresh checkout with published history and a later scan omitting a previous finding. Append verified closure after the original open snapshot, then reload locally and in a fresh checkout: latest state is selected without rewriting or duplicating the one legacy block. Merge A-only and B-only histories in a combined sweep; a newer narrowed scope cannot erase the other pending IDs. Conflicting/forked histories remain pending; source/ref and original evidence bytes are preserved. |
| AC-09 | Round-trip baseline schema-1 settings/inventory/journal/report fixtures through the new reader without rewriting them. Test history schema 2, unverified legacy `resolved` values, same-collection projection/snapshot contradictions, valid changes across collection revisions and unknown versions. Invoke the actual prior installed helper with both baseline settings and adopted settings containing `security_policy`: the latter returns a concrete setup handoff, preserves both configuration/policy bytes and new artifacts, and performs no dependent collection until a separately authorized compatible restoration passes its settings reader. |
| AC-10 | Extend publication and direct-operation compatibility tests plus native report/repair/handoff trials with read-only/no-commit/no-push/no-filesystem restrictions and malicious packet/alert text. Inspect full ref/index/settings deltas and fixed GET argv; no forbidden action occurs, no consumer identity/default policy enters shared source, and package manifests agree. Run `bun test tests/vh-adlc --timeout 60000` on Linux and the configured portable macOS checker; disclose unrun native hosts. |

## Tasks

- [x] T1 `plugins/vh-adlc/scripts/maintenance/{collect,settings,types}.ts`, `tests/vh-adlc/maintenance/{collection,settings}.test.ts` - observe metadata/policy/terminal-read regressions failing, then preserve namespaced occurrences, raw evidence and local policy bindings with fixed GET collection; focused collection/settings tests pass (AC-01, AC-02, AC-05, AC-10).
      Evidence: Collection/settings regressions first returned 54 pass and 3 fail; after implementation the same command returned 57 pass, 0 fail and 157 assertions. Fixed GET terminal reads, raw response digests, metadata and contained policy references are covered. Documentation impact uses manual review because committed AGENTS.md has no adoption marker.
- [x] T2 `plugins/vh-adlc/scripts/maintenance/scanner-evidence.ts`, `tests/vh-adlc/maintenance/scanner-evidence.test.ts` - observe packet validation regressions failing, then verify normalized scanner envelopes, physical files, digests, target/completion and synthetic evidence boundaries; scanner tests pass (AC-03, AC-10).
      Evidence: The scanner suite first failed because the reader was absent. All 11 packet scenarios then passed, including report-only findings, nonzero findings exits, incomplete scans, synthetic/empty scans and adversarial file/target/schema cases. Packet inputs remain data and physical files are checked before reads.
- [x] T3 `plugins/vh-adlc/scripts/maintenance/security.ts`, `tests/vh-adlc/maintenance/security.test.ts` - observe reconciliation regressions failing, then derive routes, ownership, outcomes, exceptions, immutable-target retirement and complete accounting from bound evidence; security tests pass (AC-02, AC-04, AC-05, AC-06, AC-07).
      Evidence: Missing reconciliation support was observed failing first. Fifteen security scenarios pass, including all existing-loop routes, false closure, expiry/policy drift, synthetic/future/wrong-target evidence, immutable successor retirement/reactivation and grouping. An additional lost-observation test failed before its coverage consistency check and now passes.
- [x] T4 `plugins/vh-adlc/scripts/maintenance/{security-history,history}.ts`, `tests/vh-adlc/maintenance/{security-history,report}.test.ts` - observe chain/overlapping-scope/history-schema regressions failing, then retain every relevant occurrence and original projection while selecting valid linked snapshots; history/report tests pass (AC-05, AC-08, AC-09).
      Evidence: Missing chain support and a forked-history result incorrectly remaining reconciled were observed failing first. History, report and security suites now pass 40 tests. Revision/collection digests bind appended snapshots, split repository histories are unioned, and disappearance-only comparison output is explicitly schema 2 with no_longer_open.
- [x] T5 `plugins/vh-adlc/scripts/maintenance/{cli,report,report-candidate,artifacts}.ts`, `tests/vh-adlc/maintenance/security-cli.test.ts` - observe actual-helper integration regressions failing, then add security reconciliation and typed report updates with persisted evidence, current-input validation and retained publication restrictions; CLI/publication/recovery tests pass (AC-07, AC-08, AC-10).
      Evidence: Actual CLI reconciliation/report tests failed before the operation existed. Typed append retry then exposed and fixed a predecessor/recovery defect. The four CLI tests, existing publication/report/journal checks and collection/security regressions pass; report candidates and resume revalidate private receipts, source/policy and packet bytes. A partial-observation handoff regression was also observed failing before its correction.
- [x] T6 `plugins/vh-adlc/scripts/maintenance/security-io.ts`, `tests/vh-adlc/maintenance/security-cli.test.ts` - reproduce the installed Stackweaver append rejection caused by differently ordered policy paths, then normalize current policy bindings consistently; actual-helper append/resume tests pass (AC-07, AC-08, AC-10).
      Evidence: `bun test tests/vh-adlc/maintenance/security-cli.test.ts --test-name-pattern "append and resume"` first failed with security update predecessor/policy changed when CLAUDE.md and agents/policy.md were both bound. After normalization, all eight CLI integration tests pass. The private consumer report was preserved on rejection.
- [x] T7 `plugins/vh-adlc/{skills/vh-adlc-maintenance,references,plugin.json,.claude-plugin/plugin.json}`, `docs/{user-guides/workflows,reference/compatibility}.md`, `tests/vh-adlc/maintenance/` - document actual interfaces and existing-loop handoffs, verify prior-helper settings rejection and keep both package versions aligned; focused and strict TypeScript checks pass with recorded compatibility limits; final installed-operation trials are in T8 (AC-04, AC-09, AC-10).
      Evidence: The documented operations match the candidate helper. Both manifests are 0.10.0; no binary lock changed. Focused collection/settings/security/scanner checks pass 97 tests and 243 assertions; strict TypeScript passes for the added modules/tests. The actual installed 0.9.0 helper accepts baseline settings, rejects security_policy with a concrete setup message, and preserves the settings/policy bytes. Final native candidate and consumer scenarios are recorded under T8. No meaningful test-first failure applies to documentation/version bookkeeping.
- [ ] T8 `docs/specs/maintenance-security-resolution.md`, `tests/vh-adlc/maintenance/` - run final applicable repository checks, final installed-operation/native scenarios and a private report-only Stackweaver trial through the candidate; retain evidence and verify unchanged consumer source/index/settings/remote state, then obtain an exact-commit independent implementation review (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10).

## Open Questions

None. The owner selected packet-based scanner intake and complete accounting before reconciliation, accepted the spec and requested shared implementation plus a report-only Stackweaver trial on 2026-11-05.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-05 | R-1 | spec | `bfd28ae3561998dc930d6a0f5326964b5de99b07` | unknown | procedural | Two blocking findings and one should-fix finding; model identity not attested. |
| 2026-11-05 | R-2 | spec | `c2a80eed6e3723fa3cdbcec4168b56289708e57b` | unknown | procedural | No blocking findings; one should-fix rollback compatibility finding; model identity not attested. |
| 2026-11-05 | R-3 | spec | `a31e4ec836aec1b4908ed74389065cefeee46029` | unknown | procedural | NO FINDINGS; model identity not attested. |
| 2026-11-05 | R-3 | spec | `a31e4ec836aec1b4908ed74389065cefeee46029` | n/a | n/a | accepted by owner |
| 2026-11-05 | R-4 | spec | `a98c5b81bc5d464639b5829a77c7f9efd068cf8a` | unknown | procedural | NO FINDINGS after default-branch documentation drift; accepted normative baseline unchanged; model identity not attested. |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design sections 6 and 7; AC-08 and AC-09
EVIDENCE: docs/specs/maintenance-security-resolution.md:130-136 requires appended security snapshots, preservation of earlier observation bytes and cross-checking shared fields between the compatibility observation block and the enriched snapshot. The existing parser at plugins/vh-adlc/scripts/maintenance/history.ts:66-72 permits exactly one maintenance-observation-v1 block, and report.ts:174-178 preserves that original block during append. After an initial report containing an open alert receives a later snapshot verifying its closure, the immutable original open-list block and current snapshot legitimately differ. The spec does not identify which snapshot the compatibility block projects or distinguish this valid historical difference from a contradiction.
PROPOSAL: Bind each security snapshot to its collection revision/digest and specify that the single legacy block projects only its original collection. Define latest-snapshot selection and contradiction checks within matching revisions, and add an append/reload/fresh-checkout scenario where an initially open alert becomes verified fixed without rewriting or duplicating the legacy block.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Design sections 1 and 5; AC-05 and AC-08
EVIDENCE: docs/specs/maintenance-security-resolution.md:68 makes a replacement image digest a new observation, :112 permits only open, fixed-verified and unknown remediation results, :116 requires verification at the claimed target, and :132 keeps previous occurrences pending until positively reconciled. A vulnerability in immutable image digest A remains present in A after corrected digest B is built and deployed. The spec provides no replacement or retirement transition that closes A's active remediation obligation while preserving A's historical vulnerable state, nor a scenario proving that deploying B does not falsely mark A itself fixed.
PROPOSAL: Define evidence-backed successor/retirement semantics for immutable targets, retaining the old target's vulnerability history and distinguishing replacement verification from its consumer-required rollout or retirement. Add scenarios for B built only, B deployed while A remains active, and verified retirement of A; none may rewrite A as patched.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design section 6; AC-08 Test Plan
EVIDENCE: docs/specs/maintenance-security-resolution.md:132 says to import the newest compatible committed report snapshot first, but does not define compatibility or how multiple overlapping prior scopes contribute outstanding findings. The AC-08 scenario at :176 covers a fresh checkout and omission from a later scan, but not separate prior sweeps for repositories A and B followed by a combined sweep. Choosing only one newest report can lose the other report's unresolved occurrences.
PROPOSAL: Define history selection and merging per occurrence and compatible repository/surface/target scope, retaining outstanding entries from every relevant prior snapshot and treating conflicts as pending. Add separate A-only and B-only histories followed by a combined sweep, including a newer narrowed-scope report that cannot erase older outstanding work.

### R-2

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design sections 2 and 7; AC-09 Test Plan
EVIDENCE: docs/specs/maintenance-security-resolution.md:72 adds security_policy to settings schema 1, while :154 describes rollback by reinstalling the prior plugin and using its legacy inventory behavior. The baseline loader at plugins/vh-adlc/scripts/maintenance/settings.ts:12-13,69-72 rejects unknown settings keys and does not accept security_policy. A consumer that adopts the new optional field therefore cannot run the prior helper after the specified rollback. The AC-09 scenario covers baseline settings and preserved artifacts, but not settings containing the new field.
PROPOSAL: Define a rollback preflight and consumer-authorized settings restoration or explicit legacy-compatible settings projection that preserves the adopted policy and original configuration bytes. Add an actual prior-helper rollback case with security_policy present, ensuring it either resumes through that documented compatibility path or returns a concrete setup handoff instead of claiming legacy inventory remains usable.

### R-3

NO FINDINGS

### R-4

NO FINDINGS

## Sources

- [GitHub Dependabot alerts API](https://docs.github.com/en/rest/dependabot/alerts?apiVersion=2022-11-28): provider state and advisory/dependency metadata; read on 2026-11-05.
- [GitHub code-scanning API](https://docs.github.com/en/rest/code-scanning/code-scanning?apiVersion=2022-11-28): individual alert state and analysis evidence; read on 2026-11-05.
- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/feature-documents.md): one document per feature, complete-scope boundary, review records and acceptance gates.
- [Pinned feature-document template](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/feature-document-template.md): document structure.
- [Pinned documentation conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/documentation.md): evidence placement and authoritative sources.
- [Pinned delivery conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/delivery.md): documentation-only delivery and retained publication boundaries.
- [Pinned prose guide](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/humanize-prose.md): prose editing.
- [Pinned agent entry point](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/AGENTS.md) and [README](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/README.md): engineering reference routing and local instruction precedence.
- Shared source citations in Context refer to the measured baseline commit above. The source and policy contracts were read in this checkout; no historical consumer snapshot is used as a current observation.
