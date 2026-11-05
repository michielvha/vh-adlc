---
status: in-progress
branch: feat/maintenance-security-resolution
status_description: "Shared implementation and read-only Stackweaver trial pass local verification and independent code review. AC-10 remains unverified pending configured macOS CI. The owner authorized this feature branch push for CI; advisory remediation remains excluded."
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

- [x] AC-01: Every imported security occurrence retains its provider identity, target, available advisory/dependency context and evidence provenance, and malformed or conflicting observations cannot become accepted complete evidence.
      Evidence: R-9 returned met at exact commit d98b6c5 after independent probes and completed CI run 42089505099. Linux passes 1275 tests; macOS passes 1117 with one unrelated platform-specific skip. The installed consumer trial preserves source, settings, Git and report state.
- [x] AC-02: Proven equivalent occurrences can share canonical remediation without losing per-repository targets or outcomes, and unknown ownership or incomplete coverage remains an actionable handoff.
      Evidence: R-9 returned met at exact commit d98b6c5 after independent probes and completed CI run 42089505099. Linux passes 1275 tests; macOS passes 1117 with one unrelated platform-specific skip. The installed consumer trial preserves source, settings, Git and report state.
- [x] AC-03: Versioned scanner evidence packets participate in the same finding accounting with verified bytes and explicit completion, while unsupported, tampered, synthetic or incomplete inputs cannot establish a live fix or a clean surface.
      Evidence: R-9 returned met at exact commit d98b6c5 after independent probes and completed CI run 42089505099. Linux passes 1275 tests; macOS passes 1117 with one unrelated platform-specific skip. The installed consumer trial preserves source, settings, Git and report state.
- [x] AC-04: Each outstanding finding has a concrete route and next action through the existing batch, bounded-maintenance, investigation, feature, audit-reference or consumer-policy path without creating duplicate implementation loops or selecting work implicitly.
      Evidence: R-9 returned met at exact commit d98b6c5 after independent probes and completed CI run 42089505099. Linux passes 1275 tests; macOS passes 1117 with one unrelated platform-specific skip. The installed consumer trial preserves source, settings, Git and report state.
- [x] AC-05: Disappeared alerts remain distinguishable from verified fixes, dismissals, exceptions, reopened findings and unavailable terminal evidence, and retiring a replaced immutable target never marks its historical vulnerable bytes patched.
      Evidence: R-9 returned met at exact commit d98b6c5 after independent probes and completed CI run 42089505099. Linux passes 1275 tests; macOS passes 1117 with one unrelated platform-specific skip. The installed consumer trial preserves source, settings, Git and report state.
- [x] AC-06: Valid consumer-authorized exceptions retain their rationale and validity independently of fixed outcomes, and missing, changed or expired evidence returns the affected decision to pending assessment.
      Evidence: R-9 returned met at exact commit d98b6c5 after independent probes and completed CI run 42089505099. Linux passes 1275 tests; macOS passes 1117 with one unrelated platform-specific skip. The installed consumer trial preserves source, settings, Git and report state.
- [x] AC-07: A security reconciliation result exposes complete finding accounting independently of coverage, open remediation and delivery, and cannot conceal an untracked occurrence or override missing evidence with report status text.
      Evidence: R-9 returned met at exact commit d98b6c5 after independent probes and completed CI run 42089505099. Linux passes 1275 tests; macOS passes 1117 with one unrelated platform-specific skip. The installed consumer trial preserves source, settings, Git and report state.
- [x] AC-08: A resumed run or fresh sweep recovers pending findings, decisions and evidence from every relevant compatible history, preserves collection-bound snapshot revisions, and never drops work through a newer narrowed scope or rewrites earlier evidence.
      Evidence: R-9 returned met at exact commit d98b6c5 after independent probes and completed CI run 42089505099. Linux passes 1275 tests; macOS passes 1117 with one unrelated platform-specific skip. The installed consumer trial preserves source, settings, Git and report state.
- [x] AC-09: Existing consumers retain readable settings, inventories and reports, while legacy disappearance comparisons cannot be presented as newly verified fixes and incompatible schemas produce an explicit handoff.
      Evidence: R-9 returned met at exact commit d98b6c5 after independent probes and completed CI run 42089505099. Linux passes 1275 tests; macOS passes 1117 with one unrelated platform-specific skip. The installed consumer trial preserves source, settings, Git and report state.
- [x] AC-10: Report publication, selected repairs and feature handoffs retain existing authority and independent-review gates, consumer security policy remains local, and specification or fixture execution makes no real advisory, repository-setting or live-service change.
      Evidence: R-9 returned met at exact commit d98b6c5 after independent probes and completed CI run 42089505099. Linux passes 1275 tests; macOS passes 1117 with one unrelated platform-specific skip. The installed consumer trial preserves source, settings, Git and report state.

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
- [x] T8 `plugins/vh-adlc/scripts/maintenance/security-io.ts`, `tests/vh-adlc/maintenance/security-cli.test.ts`, `plugins/vh-adlc/references/maintenance.md` - reproduce R-5 F-01 through the actual packet helper, then add positive current terminal/target re-observation while preserving stale/denied/mismatched observations; closure, dismissal and reopening regressions pass (AC-05, AC-08).
      Evidence: The actual-packet regression first failed with unknown instead of fixed-verified. All nine CLI tests now pass, including fresh fixed/dismissed/auto-dismissed/open terminal states and denied/stale/wrong-target cases. Re-observation needs a current source receipt and exact terminal raw context; the original snapshots remain intact.
- [x] T9 `plugins/vh-adlc/scripts/maintenance/security-history.ts`, `tests/vh-adlc/maintenance/{security-history,security-cli}.test.ts` - reproduce R-5 F-02 with a digest-valid imported narrowed same-run revision, then retain the last valid history and pending handoff on identity/scope drift; actual packet regressions retain outstanding work (AC-07, AC-08).
      Evidence: The digest-valid narrowed imported successor initially produced no history gap. The corrected actual packet and chain tests preserve the earlier occurrence and return pending for scope changes, repository identity changes and same-scope omission. CLI/history suites pass; revision creation enforces the same invariants as imported chain validation.
- [x] T10 `plugins/vh-adlc/scripts/maintenance/security.ts`, `tests/vh-adlc/maintenance/security.test.ts`, `plugins/vh-adlc/references/maintenance.md` - reproduce R-5 F-03, then bind exception authority to its exact terms and policy assessment; kind/rationale/expiry changes require new approval (AC-06, AC-10).
      Evidence: Reusing authority after changing an exception initially remained accepted. The corrected receipt binds the normalized decision and policy assessment; kind, rationale, expiry removal and assessment changes now invalidate approval until renewed. Security/history/actual CLI suites pass, including existing retirement authority and expired-exception scenarios.
- [x] T11 `plugins/vh-adlc/scripts/maintenance/security-history.ts`, `tests/vh-adlc/maintenance/{security-history,security-cli}.test.ts`, `plugins/vh-adlc/references/maintenance.md` - reproduce R-6 F-01, then bind history conflict authority to exact prior digests, chosen decision and policy assessment; direct and actual packet replay regressions pass (AC-07, AC-08, AC-10).
      Evidence: Both direct and actual-packet regressions initially accepted an unchanged receipt for a changed conflict set. They now reject changed digests and chosen outcomes until renewed authority is bound to the exact decision and policy assessment. Security/history/CLI suites pass; earlier snapshot bytes remain immutable.
- [x] T12 `docs/specs/maintenance-security-resolution.md`, `tests/vh-adlc/maintenance/` - run final applicable local repository checks, final installed-operation/native scenarios and a private report-only Stackweaver trial through the candidate; retain evidence and verify unchanged consumer source/index/settings/remote state, then obtain an exact-commit independent implementation review (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10).

      Evidence: Exact reviewed source 76e6747 passes `bun test tests/vh-adlc --timeout 60000`: 1274 tests, 4621 assertions, zero failures. Strict TypeScript, all root Go tests/vet/tidy and golangci-lint 2.15.0 pass; the registration plugin passes 34 tests. Final frozen local-catalog Codex/Claude installs, helper execution and reinstall preservation pass. Synthetic native authored preparation stops at independent review pending; native real report/resume supplies an unselected feature handoff. Final installed helper validation preserves Stackweaver source/index/HEAD/refs/settings/report bytes, retaining 82 occurrences, 69 groups, eight coverage handoffs and three linked security snapshots. Accounting is reconciled, coverage incomplete, all-clear false, all 82 obligations remain tracked, and no advisory work is selected. R-7 independently verifies AC-01 through AC-09; AC-10 remains unverified solely for macOS CI. Earlier constrained-run infrastructure failures, the five-second audit timeout, and all red regression logs are retained as failed evidence.

- [x] T13 `tests/vh-adlc/maintenance/scanner-evidence.test.ts` - reproduce R-8 F-01 with an aliased temporary directory, normalize owned packet fixture roots, and retain positive and malicious-symlink cases; normal and aliased focused tests pass without changing production validation (AC-03, AC-10).
      Evidence: The independent and root aliased-TMPDIR runs first returned nine passes and two positive-case failures. The new alias regression then failed under ordinary TMPDIR before the fixture fix. Canonicalizing only owned test roots now passes all 12 scanner cases under both ordinary and aliased TMPDIR; scanner plus actual CLI suites pass 23 tests with 74 assertions, and strict TypeScript passes. Production evidence validation and symlink-negative cases are unchanged.
- [x] T14 `.github/workflows/ci.yml` - observe the configured portable macOS checker on the exact candidate after separately authorized feature publication; retain its actual result and rerun independent review for AC-10. No Mac host is available in this session. On 2026-11-05 the owner authorized the presented feature branch push solely for CI; no residual, PR, merge, release or advisory remediation is authorized.

      Evidence: [CI run 42089505099](https://github.com/michielvha/vh-adlc/actions/runs/42089505099) succeeds at exact d98b6c52ba17ded76cfc0efd080a509a01603ead. Linux checker passes 1275 tests and 4622 assertions; macOS portable checker passes 1117 tests and 3693 assertions, with one unrelated byte-filename platform skip. Go verification, remote-gui and version calculation also pass; versioning uses dry-run mode. The earlier run 42088333743 is canceled and retained as such. R-9 independently verifies all ten criteria. No residual, PR, merge, release or advisory remediation is inferred. Review and completion records remain local until a separately authorized shipment.

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
| 2026-11-05 | R-5 | implementation | `b69d61de725ec5722bb2097863a6dcdf7d5eab7c` | unknown | procedural | Five criteria met; AC-05 through AC-08 not met; AC-10 not verified. Three blocking defects retained; model identity not attested. |
| 2026-11-05 | R-6 | implementation | `c1098997ac497d874b42ccf764c38ec973896db7` | unknown | procedural | Seven criteria met; AC-07 and AC-08 not met due to history approval replay; AC-10 not verified pending macOS CI. Model identity not attested. |
| 2026-11-05 | R-7 | implementation | `76e674705f361f0ef3de41c2d67a823639fe74cd` | unknown | procedural | AC-01 through AC-09 met; no new code finding. AC-10 not verified pending macOS execution. Model identity not attested. |
| 2026-11-05 | R-8 | implementation | `da44309e5719c17a79889dba8badd739fd5fe6f1` | unknown | procedural | AC-01 through AC-09 met; AC-10 not met due to reproducible temporary-directory alias fixture failure. Native CI still running at review time. Model identity not attested. |
| 2026-11-05 | R-9 | implementation | `d98b6c52ba17ded76cfc0efd080a509a01603ead` | unknown | procedural | All ten criteria met after exact-head Linux and macOS CI; no findings. Model identity not attested. |

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

### R-5

CRITERION: AC-01 Every imported security occurrence retains its provider identity, target, available advisory/dependency context and evidence provenance, and malformed or conflicting observations cannot become accepted complete evidence.
VERDICT: met
EVIDENCE: At b69d61de725ec5722bb2097863a6dcdf7d5eab7c, independently ran the six focused collection/settings/scanner/security/history/CLI suites: 97 tests passed with 243 assertions. Inspected collect.ts, security-io.ts and security.ts: raw context is rederived, namespaced identities and metadata are retained, duplicate identities and raw/context conflicts are rejected, and unavailable satellite targets remain unknown rather than fabricated.

CRITERION: AC-02 Proven equivalent occurrences can share canonical remediation without losing per-repository targets or outcomes, and unknown ownership or incomplete coverage remains an actionable handoff.
VERDICT: met
EVIDENCE: At b69d61de725ec5722bb2097863a6dcdf7d5eab7c, independently executed grouping, missing ownership, coverage handoff and unavailable-surface tests within the 97-test focused run. Inspected the grouping predicate and per-occurrence FindingState construction: ownership evidence is required, package/ecosystem/advisory compatibility is checked, and individual target/outcome records remain separate. The supplied Stackweaver report retains 82 open obligations and incomplete coverage without claiming an all-clear.

CRITERION: AC-03 Versioned scanner evidence packets participate in the same finding accounting with verified bytes and explicit completion, while unsupported, tampered, synthetic or incomplete inputs cannot establish a live fix or a clean surface.
VERDICT: met
EVIDENCE: At b69d61de725ec5722bb2097863a6dcdf7d5eab7c, independently executed all 11 scanner packet scenarios and the actual CLI synthetic/missing-surface scenarios. Observed rejection of altered, missing, undeclared, symlinked, traversing, duplicate, unsupported and wrongly targeted evidence. Inspected scan completion handling and synthetic propagation: finding exit status is independent of completion, and synthetic coverage prevents an all-clear. Operator normalization remains procedural evidence, as the accepted design states.

CRITERION: AC-04 Each outstanding finding has a concrete route and next action through the existing batch, bounded-maintenance, investigation, feature, audit-reference or consumer-policy path without creating duplicate implementation loops or selecting work implicitly.
VERDICT: met
EVIDENCE: At b69d61de725ec5722bb2097863a6dcdf7d5eab7c, independently executed all six existing-loop route cases and orphan/tracked-follow-up tests. Inspected the native authored preparation handoff: it records actual failing/passing checks and paired source/record commits, preserves unpublished refs, and stops at missing independent review. Inspected the native Stackweaver resume summary and exit-zero process receipt: its filelock major migration handoff names the existing spec/tasks/implement/review/ship path and selects no work. The synthetic authored repair is correctly not presented as independently reviewed or complete.

CRITERION: AC-05 Disappeared alerts remain distinguishable from verified fixes, dismissals, exceptions, reopened findings and unavailable terminal evidence, and retiring a replaced immutable target never marks its historical vulnerable bytes patched.
VERDICT: not met
EVIDENCE: At b69d61de725ec5722bb2097863a6dcdf7d5eab7c, bun /tmp/vh-security-review-probe.ts exercised the actual reconcileSecurityPacket path with a prior open finding, a current complete empty open list, a complete fixed terminal response and current source/check/scan proof files. The imported occurrence remained complete:false and remediation:unknown, so the verified disappearance could not close. Independently executed immutable replacement/retirement/reactivation tests passed, but they do not establish this missing terminal re-observation path.

CRITERION: AC-06 Valid consumer-authorized exceptions retain their rationale and validity independently of fixed outcomes, and missing, changed or expired evidence returns the affected decision to pending assessment.
VERDICT: not met
EVIDENCE: At b69d61de725ec5722bb2097863a6dcdf7d5eab7c, the independent /tmp/vh-security-review-probe.ts probe first accepted a temporary mitigated exception expiring 2026-11-06, then changed only the decision to a different indefinite risk-accepted exception. Identical authority evidence still authorized the changed decision. Existing expiry, target and policy-drift tests pass, but approval is not bound to the exception payload being approved.

CRITERION: AC-07 A security reconciliation result exposes complete finding accounting independently of coverage, open remediation and delivery, and cannot conceal an untracked occurrence or override missing evidence with report status text.
VERDICT: not met
EVIDENCE: At b69d61de725ec5722bb2097863a6dcdf7d5eab7c, independent focused tests established separate accounting, coverage, remediation and delivery fields and rejection of directly forged snapshot booleans. However, /tmp/vh-security-review-probe.ts supplied a digest-valid imported chain whose second revision narrowed the run scope and removed its earlier finding. The helpers returned accounting_state:reconciled, open_remediation_count:0 and all_clear:true with no findings or history gaps.

CRITERION: AC-08 A resumed run or fresh sweep recovers pending findings, decisions and evidence from every relevant compatible history, preserves collection-bound snapshot revisions, and never drops work through a newer narrowed scope or rewrites earlier evidence.
VERDICT: not met
EVIDENCE: At b69d61de725ec5722bb2097863a6dcdf7d5eab7c, independently executed the existing chain, overlapping-run, append/resume and retry tests successfully. An additional imported-history probe nevertheless found that selectSecurityChain accepts a same-run successor with a changed scope, despite createSecurityRevision rejecting that transition. mergeSecurityHistory then uses only that narrowed latest snapshot and loses the earlier outstanding occurrence. The actual packet closure probe also demonstrates that positively verified historical findings cannot currently leave their imported incomplete state.

CRITERION: AC-09 Existing consumers retain readable settings, inventories and reports, while legacy disappearance comparisons cannot be presented as newly verified fixes and incompatible schemas produce an explicit handoff.
VERDICT: met
EVIDENCE: At b69d61de725ec5722bb2097863a6dcdf7d5eab7c, independently executed the report/journal/publication/direct-operation suites: 62 tests passed with 312 assertions. Inspected history schema 2 and its no_longer_open output. The independent scratch probe invoked the actual installed 0.9.0 settings helper: baseline settings exited zero, adopted security_policy settings exited one with an unsupported-field error, and original configuration bytes were restored and preserved. This establishes the documented rollback incompatibility handoff, not usable legacy security certification.

CRITERION: AC-10 Report publication, selected repairs and feature handoffs retain existing authority and independent-review gates, consumer security policy remains local, and specification or fixture execution makes no real advisory, repository-setting or live-service change.
VERDICT: not verified
EVIDENCE: At b69d61de725ec5722bb2097863a6dcdf7d5eab7c, independently observed 157 focused and publication/recovery/compatibility tests passing. A narrowed-scope terminal probe was rejected before any GET. Inspected native installation, authored-review-pending and Stackweaver resume artifacts, which retain local policy, unpublished repair evidence and zero selected advisory mutations. The required full-suite rerun and portable macOS execution were not observed complete during this review; the first full-suite log contains an audit timeout. No repository source, index or ref was changed by this reviewer.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: plugins/vh-adlc/scripts/maintenance/security-history.ts:65-66; plugins/vh-adlc/scripts/maintenance/security-io.ts:130-136; plugins/vh-adlc/scripts/maintenance/security.ts:114-118
EVIDENCE: At b69d61de725ec5722bb2097863a6dcdf7d5eab7c, bun /tmp/vh-security-review-probe.ts reproduced an actual packet with prior complete open evidence, a later complete zero-open inventory, complete fixed terminal raw evidence and current bound source/check/scan proof files. mergeSecurityHistory deliberately imports the old occurrence with complete:false. Terminal handling changes its provider state and raw reference but never re-observes its current verified target or completeness. matching then refuses every non-accounting proof for that incomplete occurrence, leaving remediation unknown permanently through this path.
PROPOSAL: Add a positive terminal re-observation path that validates current raw context, target and observation timing before permitting current fix evidence to match. Keep denied, stale, mismatched and unknown satellite targets incomplete; add actual packet tests for verified closure, dismissal, reopening and invalid current-target evidence instead of weakening matching for all historical occurrences.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: plugins/vh-adlc/scripts/maintenance/security-history.ts:34-45,53-68
EVIDENCE: At b69d61de725ec5722bb2097863a6dcdf7d5eab7c, the imported-chain probe created revision 1 with an outstanding example/project finding, then a correctly digested revision 2 of the same run with scope narrowed to example/satellite and no findings. selectSecurityChain returned no gaps because it checks revision/digest continuity but not the immutable scope invariant enforced by createSecurityRevision. mergeSecurityHistory used only the narrowed latest snapshot; reconciliation of a subsequent combined sweep returned zero findings and all_clear:true.
PROPOSAL: Enforce immutable run identity and scope when validating imported chains, not only when creating revisions. On an invalid successor, retain earlier outstanding occurrences and produce a pending history handoff. Add a malformed imported same-run narrowing test through readSecurityRevisions and the actual packet helper, asserting that neither the finding nor its active obligation disappears.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: plugins/vh-adlc/scripts/maintenance/security.ts:50-51,111-115,144-147
EVIDENCE: At b69d61de725ec5722bb2097863a6dcdf7d5eab7c, the changed-exception probe accepted a temporary mitigated exception with an expiry, changed the normalized decision to a different risk-accepted rationale with no expiry, and received an accepted exception using exactly the same authority proof. evidenceBinding includes source, policy, scope and target, but not the approved exception kind, rationale, validity or decision payload. Matching a generic authority/approved receipt therefore permits a materially broader exception without renewed approval.
PROPOSAL: Bind exception authority receipts to the exact approved decision payload and local policy assessment, including exception kind, rationale, target scope and expiry/review conditions. Reject or mark pending any changed payload until a matching new approval is supplied; test kind changes, expiry removal and rationale/scope changes with unchanged authority evidence.

### R-6

CRITERION: AC-01 Every imported security occurrence retains its provider identity, target, available advisory/dependency context and evidence provenance, and malformed or conflicting observations cannot become accepted complete evidence.
VERDICT: met
EVIDENCE: At c1098997ac497d874b42ccf764c38ec973896db7, independently executed 162 tests across ten collection/settings/scanner/security/history/CLI/report/journal/publication/compatibility files, with 603 assertions and zero failures. Inspected raw-context reconstruction and namespaced identities. Additional actual-packet probes rejected changed terminal package/location, future terminal receipts and mismatched code-scanning commits; current code-scanning commit evidence was accepted.

CRITERION: AC-02 Proven equivalent occurrences can share canonical remediation without losing per-repository targets or outcomes, and unknown ownership or incomplete coverage remains an actionable handoff.
VERDICT: met
EVIDENCE: At c1098997ac497d874b42ccf764c38ec973896db7, independently reran grouping, missing ownership, unavailable-surface and coverage-handoff scenarios in the passing 162-test run. Per-occurrence targets and outcomes remain separate. Inspected the final installed Stackweaver helper summary: it retains 82 occurrences, 69 groups, 13 canonical groups and eight coverage handoffs, with incomplete coverage, 82 open obligations and no all-clear or selected work.

CRITERION: AC-03 Versioned scanner evidence packets participate in the same finding accounting with verified bytes and explicit completion, while unsupported, tampered, synthetic or incomplete inputs cannot establish a live fix or a clean surface.
VERDICT: met
EVIDENCE: At c1098997ac497d874b42ccf764c38ec973896db7, independently reran all scanner packet cases and actual CLI synthetic/missing-surface cases within the passing 162-test run. Complete findings remain distinct from scanner exit status; tampered, missing, extra, symlinked, traversing, duplicate, unsupported and wrongly targeted evidence is rejected. Synthetic evidence remains visible and cannot establish a live all-clear. Normalization receipts retain their documented procedural limits.

CRITERION: AC-04 Each outstanding finding has a concrete route and next action through the existing batch, bounded-maintenance, investigation, feature, audit-reference or consumer-policy path without creating duplicate implementation loops or selecting work implicitly.
VERDICT: met
EVIDENCE: At c1098997ac497d874b42ccf764c38ec973896db7, independently reran all six route cases and concrete tracked-follow-up scenarios. Rechecked the native authored preparation evidence and existing-loop feature handoff: the synthetic repair retains paired source/record targets and stops at missing independent review, while Stackweaver's major migration remains unselected. The final installed helper summary contains investigation, feature and consumer-policy routes with zero selected work. Earlier native model behavior used its explicitly identified earlier payload; exact-final installation/helper validation is separate.

CRITERION: AC-05 Disappeared alerts remain distinguishable from verified fixes, dismissals, exceptions, reopened findings and unavailable terminal evidence, and retiring a replaced immutable target never marks its historical vulnerable bytes patched.
VERDICT: met
EVIDENCE: At c1098997ac497d874b42ccf764c38ec973896db7, the independent actual reconcileSecurityPacket disappearance probe now reaches complete:true and fixed-verified after current terminal and source/check/scan evidence. Additional probes retain unknown verification for changed package/location, future receipts and wrong code-scanning commits, while a matching current code-scanning commit verifies. The actual-helper fixed/dismissed/auto-dismissed/open/denied/stale/wrong-target scenarios and immutable successor retirement/reactivation tests passed. Final live terminal reads remain provider-fixed but remediation-unknown because full target proof is absent, as required.

CRITERION: AC-06 Valid consumer-authorized exceptions retain their rationale and validity independently of fixed outcomes, and missing, changed or expired evidence returns the affected decision to pending assessment.
VERDICT: met
EVIDENCE: At c1098997ac497d874b42ccf764c38ec973896db7, independently reran the original R5 changed-exception probe: identical approval evidence no longer authorizes changing a temporary mitigation into indefinite accepted risk. Executed tests also reject changed rationale, expiry removal and changed policy assessment until renewed approval is supplied. Inspected decisionAuthorityBinding: it includes the normalized exact decision, source/policy/scope/target context and policy assessment. Existing expiry and policy-drift cases passed.

CRITERION: AC-07 A security reconciliation result exposes complete finding accounting independently of coverage, open remediation and delivery, and cannot conceal an untracked occurrence or override missing evidence with report status text.
VERDICT: not met
EVIDENCE: At c1098997ac497d874b42ccf764c38ec973896db7, orphan, tracked handoff, missing scan, forged snapshot and typed append/resume scenarios pass, and the R5 narrowing probe now retains its finding. However, the independent /tmp/vh-security-history-authority-probe.ts changes an approved historical conflict set while retaining identical authority evidence; the new conflict is cleared and accounting becomes reconciled. Complete accounting therefore still accepts a materially changed history decision without renewed approval.

CRITERION: AC-08 A resumed run or fresh sweep recovers pending findings, decisions and evidence from every relevant compatible history, preserves collection-bound snapshot revisions, and never drops work through a newer narrowed scope or rewrites earlier evidence.
VERDICT: not met
EVIDENCE: At c1098997ac497d874b42ccf764c38ec973896db7, overlapping-run merging, chained revisions, fork handling, committed-history import and typed append/resume/retry tests pass. Scope/identity/omission probes retain earlier findings. A separate production mergeSecurityHistory probe nevertheless reuses one authority/supersedes-history receipt for two materially different conflict sets by changing only prior_digests. Both historical conflicts disappear, although the authority proof is unchanged and does not approve the new conflict set.

CRITERION: AC-09 Existing consumers retain readable settings, inventories and reports, while legacy disappearance comparisons cannot be presented as newly verified fixes and incompatible schemas produce an explicit handoff.
VERDICT: met
EVIDENCE: At c1098997ac497d874b42ccf764c38ec973896db7, independently reran baseline report/journal/compatibility cases and the actual prior installed 0.9.0 settings-reader probe. Baseline settings exit zero; adopted security_policy settings are explicitly rejected, with original configuration bytes preserved/restored in the disposable probe. History schema 2 uses no_longer_open, and legacy observations remain historical evidence rather than newly verified closure. No consumer settings restoration or rollback was performed on Stackweaver.

CRITERION: AC-10 Report publication, selected repairs and feature handoffs retain existing authority and independent-review gates, consumer security policy remains local, and specification or fixture execution makes no real advisory, repository-setting or live-service change.
VERDICT: not verified
EVIDENCE: At c1098997ac497d874b42ccf764c38ec973896db7, independently observed 162 focused/publication/recovery/compatibility tests passing and rejected an out-of-scope terminal request before any GET. Verified every current plugin file hash/mode against final local-catalog payload 9919481ee56642d786bea3073d2ca8c2fbdfcea4e73805b44efde5f3380bc40b; both native-host installation grades pass, and the final installed helper report/resume preserves consumer source and selects no advisory work. Read the completed final Linux log: 1272 tests passed with 4615 assertions and zero failures. Required portable macOS execution remains unavailable and unobserved. No residual, remote publication, Mac execution or completed overall verification is inferred.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: plugins/vh-adlc/scripts/maintenance/security-history.ts:82-90
EVIDENCE: At c1098997ac497d874b42ccf764c38ec973896db7, bun /tmp/vh-security-history-authority-probe.ts first clears an open-versus-fixed historical conflict with an authority/supersedes-history receipt, then uses that identical receipt to clear a different open-versus-risk-acceptance conflict. Changing only the resolution's prior_digests to the new actual set removes all history gaps and produces reconciled accounting in both cases. The validator checks prior_digests against current history, but the authority binding covers only source, policy, scope and target; it does not bind the approved conflict set or chosen successor decision.
PROPOSAL: Bind supersedes-history authority to the exact occurrence, sorted prior snapshot digests, chosen successor decision/outcome and policy assessment in addition to existing target/context bindings. A changed conflict set or selected outcome must remain pending until a matching new approval is supplied. Add direct and actual-packet replay tests using unchanged authority evidence with changed conflict digests and chosen decisions.

### R-7

CRITERION: AC-01 Every imported security occurrence retains its provider identity, target, available advisory/dependency context and evidence provenance, and malformed or conflicting observations cannot become accepted complete evidence.
VERDICT: met
EVIDENCE: At 76e674705f361f0ef3de41c2d67a823639fe74cd, independently reran 164 tests across ten collection/settings/scanner/security/history/CLI/report/journal/publication/compatibility files: 609 assertions, zero failures. Raw-context reconstruction, namespaced identities, duplicate/conflict rejection and terminal metadata checks remain intact. Additional actual-packet probes reject changed terminal package/location, future receipts and wrong code-scanning commits while accepting matching current-target evidence.

CRITERION: AC-02 Proven equivalent occurrences can share canonical remediation without losing per-repository targets or outcomes, and unknown ownership or incomplete coverage remains an actionable handoff.
VERDICT: met
EVIDENCE: At 76e674705f361f0ef3de41c2d67a823639fe74cd, independently executed grouping, missing ownership, unavailable-surface and coverage-handoff scenarios in the passing 164-test run. Grouping preserves individual target/outcome records and requires equivalent-source evidence. The retained Stackweaver report has 82 occurrences, 69 groups, 13 canonical groups and eight coverage handoffs; exact-final installed resume revalidates it without changing consumer data or claiming an all-clear.

CRITERION: AC-03 Versioned scanner evidence packets participate in the same finding accounting with verified bytes and explicit completion, while unsupported, tampered, synthetic or incomplete inputs cannot establish a live fix or a clean surface.
VERDICT: met
EVIDENCE: At 76e674705f361f0ef3de41c2d67a823639fe74cd, independently reran all scanner packet cases and actual CLI synthetic/missing-surface scenarios. Finding exit status remains independent of completion. Altered, missing, extra, symlinked, traversing, duplicate, unsupported and wrongly targeted evidence is rejected. Synthetic inputs cannot establish a live all-clear; normalization receipts retain their accepted procedural limits.

CRITERION: AC-04 Each outstanding finding has a concrete route and next action through the existing batch, bounded-maintenance, investigation, feature, audit-reference or consumer-policy path without creating duplicate implementation loops or selecting work implicitly.
VERDICT: met
EVIDENCE: At 76e674705f361f0ef3de41c2d67a823639fe74cd, independently reran all six existing-loop route cases and tracked-follow-up scenarios. Native authored preparation retains paired source/record targets and stops at missing independent review; the Stackweaver feature handoff selects no migration. Earlier native model behavior used its explicitly identified earlier payload. Final exact-payload installation/helper revalidation is separate and preserves the existing unselected report state.

CRITERION: AC-05 Disappeared alerts remain distinguishable from verified fixes, dismissals, exceptions, reopened findings and unavailable terminal evidence, and retiring a replaced immutable target never marks its historical vulnerable bytes patched.
VERDICT: met
EVIDENCE: At 76e674705f361f0ef3de41c2d67a823639fe74cd, the independent actual-packet disappearance probe reaches fixed-verified only with current terminal and source/check/scan evidence. Changed package/location, future receipts and wrong code-scanning commits remain unverified; matching current code-scanning commit evidence verifies. Actual-helper fixed/dismissed/auto-dismissed/open/denied/stale/wrong-target cases and immutable successor retirement/reactivation tests pass. Provider-fixed live historical alerts remain remediation-unknown where full target proof is absent.

CRITERION: AC-06 Valid consumer-authorized exceptions retain their rationale and validity independently of fixed outcomes, and missing, changed or expired evidence returns the affected decision to pending assessment.
VERDICT: met
EVIDENCE: At 76e674705f361f0ef3de41c2d67a823639fe74cd, independently reran exception payload replay, expiry and policy-drift tests. Identical approval cannot authorize changed exception kind, rationale, expiry or assessment. The independent original probe rejects conversion of a temporary mitigation into indefinite accepted risk. Decision authority remains bound to the exact normalized decision and local context; renewed approval is required for changed terms.

CRITERION: AC-07 A security reconciliation result exposes complete finding accounting independently of coverage, open remediation and delivery, and cannot conceal an untracked occurrence or override missing evidence with report status text.
VERDICT: met
EVIDENCE: At 76e674705f361f0ef3de41c2d67a823639fe74cd, orphan, tracked handoff, missing scan, forged snapshot and typed append/resume tests pass. The malformed narrowing probe retains its finding and prevents an all-clear. The independent historical-authority probe now rejects changed conflict sets and chosen decisions with unchanged approval. Retained Stackweaver accounting remains reconciled alongside incomplete coverage and 82 open obligations, with no selected repairs.

CRITERION: AC-08 A resumed run or fresh sweep recovers pending findings, decisions and evidence from every relevant compatible history, preserves collection-bound snapshot revisions, and never drops work through a newer narrowed scope or rewrites earlier evidence.
VERDICT: met
EVIDENCE: At 76e674705f361f0ef3de41c2d67a823639fe74cd, independently executed overlapping-run, chained revision, fork, committed-history import and append/resume/retry tests. Actual-packet scope/identity/omission and conflict-replay cases pass. The independent production-helper probe accepts the approved exact conflict set, rejects a different set and changed successor, then accepts renewed bound approval. The final installed resume preserves the report's three security snapshots and single original compatibility block.

CRITERION: AC-09 Existing consumers retain readable settings, inventories and reports, while legacy disappearance comparisons cannot be presented as newly verified fixes and incompatible schemas produce an explicit handoff.
VERDICT: met
EVIDENCE: At 76e674705f361f0ef3de41c2d67a823639fe74cd, independently reran baseline report/journal/compatibility cases and the actual prior installed 0.9.0 settings-reader probe. Baseline settings exit zero; security_policy settings are explicitly rejected while original bytes are preserved/restored in the disposable probe. History schema 2 uses no_longer_open and legacy observations remain historical evidence. No real consumer rollback or settings restoration was performed.

CRITERION: AC-10 Report publication, selected repairs and feature handoffs retain existing authority and independent-review gates, consumer security policy remains local, and specification or fixture execution makes no real advisory, repository-setting or live-service change.
VERDICT: not verified
EVIDENCE: At 76e674705f361f0ef3de41c2d67a823639fe74cd, independently observed 164 focused/publication/recovery/compatibility tests passing. Verified every current plugin file hash/mode against exact-final local-catalog payload 3832a6c3ce40a431c2056e3e1147b74866b74e32837fadfb00c4698f7bb097b7; Codex and Claude installation grades pass. Inspected final installed helper resume evidence, which preserves consumer source/settings/report state and selects no advisory work. The final full Linux run was still progressing at the last observed read, and required portable macOS execution remains unavailable and unobserved. No residual, publication, Mac execution or completed overall verification is inferred.

### R-8

CRITERION: AC-01 Every imported security occurrence retains its provider identity, target, available advisory/dependency context and evidence provenance, and malformed or conflicting observations cannot become accepted complete evidence.
VERDICT: met
EVIDENCE: At da44309e5719c17a79889dba8badd739fd5fe6f1, verified that executable source and the accepted normative baseline are unchanged from independently reviewed 76e6747. The earlier independent 164-test run and actual-packet metadata probes establish namespaced identity, raw-context reconstruction and rejection of changed terminal package/location, future receipts and mismatched code-scanning commits. Current lint and verbatim R-7 review-check pass.

CRITERION: AC-02 Proven equivalent occurrences can share canonical remediation without losing per-repository targets or outcomes, and unknown ownership or incomplete coverage remains an actionable handoff.
VERDICT: met
EVIDENCE: At da44309e5719c17a79889dba8badd739fd5fe6f1, grouping and coverage implementation is byte-identical to the independently tested 76e6747 code. Grouping retains per-occurrence targets/outcomes and requires equivalent-source evidence. The inspected exact-payload consumer report retains 82 occurrences, 69 groups, 13 canonical groups and eight coverage handoffs with incomplete coverage and no all-clear; installed resume preserves it.

CRITERION: AC-03 Versioned scanner evidence packets participate in the same finding accounting with verified bytes and explicit completion, while unsupported, tampered, synthetic or incomplete inputs cannot establish a live fix or a clean surface.
VERDICT: met
EVIDENCE: At da44309e5719c17a79889dba8badd739fd5fe6f1, production scanner validation is unchanged from the independently passing canonical-root packet, completion, synthetic and adversarial cases. Symlink ancestors remain rejected as required. A new temporary-directory alias probe exposes a portability defect in test fixture construction, recorded separately under AC-10; it does not establish a production acceptance of unsafe evidence or a successful native macOS run.

CRITERION: AC-04 Each outstanding finding has a concrete route and next action through the existing batch, bounded-maintenance, investigation, feature, audit-reference or consumer-policy path without creating duplicate implementation loops or selecting work implicitly.
VERDICT: met
EVIDENCE: At da44309e5719c17a79889dba8badd739fd5fe6f1, route and follow-up code is unchanged from the six independently tested existing-loop routes. Native authored preparation retains paired source/record targets and stops at missing independent review; the inspected Stackweaver migration handoff selects no feature work. Final helper validation is distinct from earlier native model trials, and neither claims advisory remediation.

CRITERION: AC-05 Disappeared alerts remain distinguishable from verified fixes, dismissals, exceptions, reopened findings and unavailable terminal evidence, and retiring a replaced immutable target never marks its historical vulnerable bytes patched.
VERDICT: met
EVIDENCE: At da44309e5719c17a79889dba8badd739fd5fe6f1, terminal and retirement code remains identical to the independently executed 76e6747 actual-packet probes. Current terminal/source/check/scan proof verifies closure; changed package/location, future receipts and wrong code-scanning commits remain unknown. Fixed/dismissed/auto-dismissed/open/denied/stale/wrong-target and immutable retirement/reactivation cases passed. Live provider-fixed historical alerts retain unknown remediation where full target proof is absent.

CRITERION: AC-06 Valid consumer-authorized exceptions retain their rationale and validity independently of fixed outcomes, and missing, changed or expired evidence returns the affected decision to pending assessment.
VERDICT: met
EVIDENCE: At da44309e5719c17a79889dba8badd739fd5fe6f1, exact-decision approval binding and exception validation are unchanged from independent replay, expiry and policy-drift verification. Identical authority cannot approve changed kind, rationale, expiry or assessment. The earlier independent temporary-mitigation-to-indefinite-risk probe is rejected; fresh bound approval is required for changed terms.

CRITERION: AC-07 A security reconciliation result exposes complete finding accounting independently of coverage, open remediation and delivery, and cannot conceal an untracked occurrence or override missing evidence with report status text.
VERDICT: met
EVIDENCE: At da44309e5719c17a79889dba8badd739fd5fe6f1, accounting and conflict-resolution source is unchanged from the independent 164-test run and production-helper replay probes. Orphan, forged snapshot, missing surface and malformed narrowing cases prevent unsupported reconciliation. Changed history conflict sets and successor decisions require renewed approval. The retained consumer report distinguishes reconciled accounting from incomplete coverage and 82 open obligations.

CRITERION: AC-08 A resumed run or fresh sweep recovers pending findings, decisions and evidence from every relevant compatible history, preserves collection-bound snapshot revisions, and never drops work through a newer narrowed scope or rewrites earlier evidence.
VERDICT: met
EVIDENCE: At da44309e5719c17a79889dba8badd739fd5fe6f1, history/chain/persistence code is unchanged from independent overlapping-run, fork, committed-history import, append/resume/retry and actual-packet scope/identity/omission tests. The production history-authority probe accepts exact approved conflict sets, rejects changed sets/outcomes, and accepts renewed bound approval. Exact-final installed resume preserves three security snapshots and one original compatibility block.

CRITERION: AC-09 Existing consumers retain readable settings, inventories and reports, while legacy disappearance comparisons cannot be presented as newly verified fixes and incompatible schemas produce an explicit handoff.
VERDICT: met
EVIDENCE: At da44309e5719c17a79889dba8badd739fd5fe6f1, settings/history/compatibility implementation is unchanged from the independently executed baseline and prior-reader probes. The actual installed 0.9.0 reader accepts baseline settings and rejects security_policy settings without silently restoring configuration. History schema 2 uses no_longer_open; legacy data is not upgraded into verified closure. No real consumer rollback or settings restoration occurred.

CRITERION: AC-10 Report publication, selected repairs and feature handoffs retain existing authority and independent-review gates, consumer security policy remains local, and specification or fixture execution makes no real advisory, repository-setting or live-service change.
VERDICT: not met
EVIDENCE: At da44309e5719c17a79889dba8badd739fd5fe6f1, independently confirmed the pushed exact-head CI run 42088333743 and inspected the completed exact-code local Linux result: 1274 tests passed, zero failed, 4621 assertions. The native macOS job remains in progress at the last live observation and is not claimed passed or failed. An independent owned temporary-alias execution of scanner-evidence.test.ts produces nine passes and two positive-case failures because fixture roots retain a symlink ancestor. Required portable verification therefore remains unmet. No real advisory, repository setting or service was changed by this reviewer.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: tests/vh-adlc/maintenance/scanner-evidence.test.ts:11
EVIDENCE: At da44309e5719c17a79889dba8badd739fd5fe6f1, the packet fixture uses mkdtempSync(join(tmpdir(), ...)) without canonicalizing the resulting directory. verifyScannerEvidence intentionally rejects any symlink ancestor. Independently running the suite with TMPDIR set to an owned symlink to a physical directory produced nine passes and two failures in the positive packet cases; raw output is /tmp/vh-security-review-macos-dfmxun7_/scanner.log. macOS temporary-directory aliases can exercise this same fixture error. The actual macOS CI job is still running, so this finding does not assert its native outcome.
PROPOSAL: Canonicalize the owned scanner packet fixture root with realpathSync, as the shared maintenance repository fixtures already do, while preserving production symlink rejection and deliberate symlink-negative cases. Add a temporary-alias fixture regression and rerun actual exact-head macOS CI before claiming portable verification.

### R-9

CRITERION: AC-01 Every imported security occurrence retains its provider identity, target, available advisory/dependency context and evidence provenance, and malformed or conflicting observations cannot become accepted complete evidence.
VERDICT: met
EVIDENCE: At d98b6c52ba17ded76cfc0efd080a509a01603ead, verified production plugin bytes are unchanged from independently reviewed 76e6747. Earlier independent raw-context, identity and terminal metadata probes remain applicable. Independently inspected exact-head CI logs: Linux checker passes 1275 tests with zero failures, and macOS portable checker passes 1117 tests with zero failures and one explicit unrelated platform skip. Both logs identify the reviewed commit.

CRITERION: AC-02 Proven equivalent occurrences can share canonical remediation without losing per-repository targets or outcomes, and unknown ownership or incomplete coverage remains an actionable handoff.
VERDICT: met
EVIDENCE: At d98b6c52ba17ded76cfc0efd080a509a01603ead, grouping and coverage code remains unchanged from independent equivalent-source, divergent-outcome and unknown-coverage verification. Exact-head Linux and portable macOS suites pass. The inspected exact-payload Stackweaver report retains 82 occurrences, 69 groups, 13 canonical groups and eight coverage handoffs, with incomplete coverage and no all-clear; installed resume preserves consumer state.

CRITERION: AC-03 Versioned scanner evidence packets participate in the same finding accounting with verified bytes and explicit completion, while unsupported, tampered, synthetic or incomplete inputs cannot establish a live fix or a clean surface.
VERDICT: met
EVIDENCE: At d98b6c52ba17ded76cfc0efd080a509a01603ead, independently ran scanner and actual-helper CLI suites: 23 tests passed with 74 assertions. Repeated the owned TMPDIR-alias probe: all 12 scanner cases pass, including the new alias regression and deliberate symlink rejection. Production scanner validation is unchanged. Completed native macOS logs explicitly show the alias case passing; the former R8 fixture failure is corrected without weakening evidence validation.

CRITERION: AC-04 Each outstanding finding has a concrete route and next action through the existing batch, bounded-maintenance, investigation, feature, audit-reference or consumer-policy path without creating duplicate implementation loops or selecting work implicitly.
VERDICT: met
EVIDENCE: At d98b6c52ba17ded76cfc0efd080a509a01603ead, existing-loop routing and concrete follow-up code is unchanged from the independent six-route checks and native authored/feature handoff inspection. Authored preparation retains paired source/record targets and stops at missing independent review; Stackweaver migration work remains unselected. Exact-head Linux and macOS suites pass, including maintenance behavior. Earlier native model trials and final installed helper validation retain their separate payload evidence.

CRITERION: AC-05 Disappeared alerts remain distinguishable from verified fixes, dismissals, exceptions, reopened findings and unavailable terminal evidence, and retiring a replaced immutable target never marks its historical vulnerable bytes patched.
VERDICT: met
EVIDENCE: At d98b6c52ba17ded76cfc0efd080a509a01603ead, independently reran the actual-helper terminal re-observation scenarios within the passing 23-test run. Current terminal/source/check/scan evidence verifies closure; denied, stale or mismatched target evidence does not. Production terminal and immutable-retirement logic is unchanged from independent metadata, code-scanning commit and reactivation probes. Exact-head native suites pass; live provider-fixed historical alerts still retain unknown remediation where full target proof is absent.

CRITERION: AC-06 Valid consumer-authorized exceptions retain their rationale and validity independently of fixed outcomes, and missing, changed or expired evidence returns the affected decision to pending assessment.
VERDICT: met
EVIDENCE: At d98b6c52ba17ded76cfc0efd080a509a01603ead, exact-decision authority binding and exception validation are unchanged from independent payload-replay, expiry and policy-drift checks. Changed kind, rationale, expiry or assessment requires renewed bound approval. Completed exact-head Linux and portable macOS logs include the security suite without failures. No evidence converts provider dismissal into an automatically approved local exception.

CRITERION: AC-07 A security reconciliation result exposes complete finding accounting independently of coverage, open remediation and delivery, and cannot conceal an untracked occurrence or override missing evidence with report status text.
VERDICT: met
EVIDENCE: At d98b6c52ba17ded76cfc0efd080a509a01603ead, independently reran orphan, missing-surface, forged-result and typed report/resume scenarios through the actual CLI suite. History authority replay remains rejected for changed conflict sets or chosen decisions. Exact-head Linux and macOS suites pass. Retained consumer evidence distinguishes reconciled accounting from incomplete coverage and 82 open obligations, with zero selected repairs and no all-clear.

CRITERION: AC-08 A resumed run or fresh sweep recovers pending findings, decisions and evidence from every relevant compatible history, preserves collection-bound snapshot revisions, and never drops work through a newer narrowed scope or rewrites earlier evidence.
VERDICT: met
EVIDENCE: At d98b6c52ba17ded76cfc0efd080a509a01603ead, independently reran actual packet scope/identity/omission, exact conflict approval and append/resume/retry cases within the passing CLI run. Production chain and history code is unchanged from independent overlapping-run, fork and conflict-set probes. Completed exact-head Linux and macOS suites pass. Installed consumer resume preserves three security snapshots and one original compatibility block without dropping outstanding work.

CRITERION: AC-09 Existing consumers retain readable settings, inventories and reports, while legacy disappearance comparisons cannot be presented as newly verified fixes and incompatible schemas produce an explicit handoff.
VERDICT: met
EVIDENCE: At d98b6c52ba17ded76cfc0efd080a509a01603ead, settings/history compatibility code is unchanged from independent baseline, prior-reader and legacy no_longer_open verification. The actual prior 0.9.0 reader accepts baseline settings and rejects security_policy settings without silently removing policy. Exact-head Linux and macOS suites pass. No real consumer rollback or settings restoration was performed, and legacy observations remain historical evidence rather than backfilled fixes.

CRITERION: AC-10 Report publication, selected repairs and feature handoffs retain existing authority and independent-review gates, consumer security policy remains local, and specification or fixture execution makes no real advisory, repository-setting or live-service change.
VERDICT: met
EVIDENCE: Independently verified completed push CI run 42089505099 at exact d98b6c52ba17ded76cfc0efd080a509a01603ead: verify, Linux checker, remote-gui, macOS checker and version calculation jobs all succeed. Direct Linux job logs show 1275 passes, zero failures and 4622 assertions; native macOS logs show 1117 passes, zero failures, 3693 assertions and one intentional unrelated byte-filename platform skip. The corrected scanner alias case passes natively. Production payload remains 3832a6c3ce40a431c2056e3e1147b74866b74e32837fadfb00c4698f7bb097b7, with inspected installed resume preserving consumer source/settings/report state. Earlier canceled macOS attempt 42088333743 is retained as canceled, not a pass or failure. This review grants no PR, merge, release or advisory-remediation authority.


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
