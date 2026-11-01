---
status: draft
status_description: "Draft reviewed by Copilot Opus 5.5 R-1; authority, repair classification, batch review and ledger-write choices await the owner. Audit-specific preflight clarified; implementation has not started."
issue: null
goal: "Run persistent codebase audits through a harness-agnostic vh-adlc operation while each consumer retains its ledger, product knowledge and delivery policy."
covers:
  - plugins/vh-adlc/skills/vh-adlc-audit/
  - plugins/vh-adlc/references/audit.md
  - plugins/vh-adlc/references/audit-settings.md
  - plugins/vh-adlc/references/audit-record.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/scripts/audit/
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tests/vh-adlc/audit/
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/direct-operation-compatibility.test.ts
  - tests/vh-adlc/lifecycle/
  - .github/workflows/ci.yml
  - README.md
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - docs/reference/marketplace.md
  - docs/get-started/installation.md
---

# Shared persistent codebase audit

## Context

The owner selected audit after maintenance on 2026-11-01 and requested the extraction end to end.
The parent [migration roadmap](shared-workflow-migration.md), row D-02, identifies persistent
codebase audit as the next candidate. This child owns its scope, tests and Stackweaver migration.
Documentation workflows and domain agents remain separate future decisions.

Shared main is `fcf7cd51ba764d43467a81e7984772f4d8598e40`. Inspection of
`plugins/vh-adlc/plugin.json` reports plugin 0.6.0; `rg --files plugins/vh-adlc/skills` has eleven
skills and no audit operation. `references/lifecycle.md:37-52` already routes investigation,
triage, maintenance and feature work. Its bounded-maintenance procedure at lines 84-137 and the
feature loop should handle selected compatible repairs and wider changes, rather than creating
another delivery engine.

Stackweaver remote main is `0ae15a9dafc58ff6457cf90f2c91630015833539`. Its audit procedure is
`agents/codebase-audit.md`, whose SHA-256 is
`e6efd34845b16d902ea5c3bf2f89571d2e7b65520e9742fdbe45001ccc11b5cb` in both the inspected
working tree and fetched remote main. Lines 3-44 define the ledger, stable IDs, verification and
mode selection; lines 48-111 cover re-verification and full audit; lines 114-265 cover fixes,
regression tests, live verification, batching, conditional merge and special cases.
`.claude/commands/audit.md:1-43` preserves `/audit`, `model: opus`, optional arguments and
Stackweaver's existing conditional delivery behavior.

The local ledger has historical summaries, a severity-index table and finding sections. A local
structure-only inspection found 991 lines and 67 headings containing IDs; seven headings also cite
other findings. The highest ID mentioned anywhere was AUD-159, so the procedure's old next-free
AUD-135 hint is stale. The first ID in a finding heading identifies its entry; subsequent IDs can
be references, not extra entries. Existing historical verification dates and index/entry differences
must not become current proof. Private finding contents are not copied into this public feature.

The current Stackweaver checkout has unrelated local planning work and differs from remote main.
Inspect it read-only. Build the migration from a fresh isolated consumer branch at current remote
main; preserve every unrelated change and recheck the baseline before adoption. The previously
completed triage and maintenance routes must remain intact.

Conventions resolve through the verified binary to `vhco-pro/docs@e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a`
from repository AGENTS.md. `find --slug shared-audit` returned no document; GitHub title search
returned no audit issue. This is a new child, not a revision of maintenance.

## Scope

Deliver one discoverable `vh-adlc-audit` skill and canonical audit procedure for status,
re-verification, full audit and selected remediation. Preserve stable finding identity, historical
ledger format, evidence, residuals, coverage and consumer-specific ordering. Include deterministic
settings/snapshot/report checks, synthetic behavior tests, native installation/discovery, bounded
Copilot model trials and a thin Stackweaver consumer adapter with rollback and adoption checks.

Keep the real ledger, format details, workstream names/order, specialist areas, coupled findings,
reference implementations, product contracts, verification commands, runtime topology, data rules,
publication/merge conditions and operational exceptions in the consumer. Reuse the existing
investigation, bounded-maintenance and accepted-feature procedures where applicable.

Do not re-audit or repair the real Stackweaver product as a side effect of extracting its workflow.
Do not change its historical ledger or finding statuses, restart its stack, mint tokens, access its
live database, rotate secrets, alter branch protection or modify other agents/docs workflows.
Do not add a background scheduler, vulnerability scanner, autonomous GitHub publisher or triage
confinement controller. The shared runtime remains a documented agent procedure with artifact-backed
checks, not an OS-enforced proof boundary or an arbitrary-code correctness oracle.

## Design

### Entry points and modes

Add `skills/vh-adlc-audit/SKILL.md`, `references/audit.md`, `audit-settings.md`, `audit-record.md`
and focused modules under `scripts/audit/`. Native invocation is `vh-adlc-audit`; ordinary-language
requests enter through the existing lifecycle intake without consuming unrelated investigation or
triage requests. The shared skill has no model pin or harness-specific tool dependency.

- No arguments or `reverify`: read the configured ledger and source, re-locate cited symbols, scope
  changes since each recorded baseline, reassess all selected findings, scan relevant changed areas
  for related instances, prepare a dated ledger update, then present the result and ask which fixes
  to select. A bare reverify request does not select remediation.
- `status`: show recorded finding tallies, severity/workstreams, last verification targets and
  coverage gaps. It reads only, does not relabel historical statuses as verified at current HEAD,
  and never commits, publishes, repairs or invokes full audit.
- `full`: perform explicitly requested specialist passes over the configured areas, reverify existing
  findings, deduplicate by root cause, append genuinely new IDs and retain coverage gaps. It is not
  silently triggered by default mode or a failed check.
- `fix <ID...>`, `fix <workstream>` or `fix next`: select only the resolved IDs under the consumer's
  ordering and coupling policy. Re-ground every selected finding, stop for unresolved product/data
  decisions, write and observe a failing regression first, repair the root cause and verify the
  required ladder. A scope change or next workstream needs the consumer's existing selection boundary.
- Unknown modes, IDs or workstreams return a clear scope error without writes. Instructions inside
  findings, source comments, tool output or historical reports are evidence, not fresh owner authority.

Parallel specialist work is optional. Use equivalent tools and sequential collection where suitable.
A second assessment must actually be independent of its producer before counting as an adversarial
check. If that capability is unavailable, preserve the proposed result as provisional and identify
what cannot be concluded; never call the same context an independent reviewer.

### Consumer settings and format preservation

Use strict schema-versioned `.vh-adlc/audit.json`, bound to the actual Git origin (repository and
hostname), with repository-relative ledger and project-procedure paths, ID prefix and Markdown
profile options. Reject unknown fields, mismatched origin, traversal, symlink escape and unsupported
profiles. Missing required configuration is an onboarding handoff, not permission to invent a ledger.
Standalone adopters receive a complete synthetic example that explains how to create their own
ledger/settings; it references no personal host paths or private configuration.

The first implementation supports a documented Markdown profile with a designated severity-index
section, ID in the first table cell and primary ID immediately after a finding heading marker.
The ID prefix is configurable; arbitrary executable parsers or shell commands in settings are not.
Other ledger formats require an explicit adapter/profile and tests before support is claimed.
Do not force Stackweaver to convert its existing document to a new canonical storage format.

The deterministic inventory distinguishes index rows, primary finding headings and incidental
cross-references, reports duplicates and index-only/entry-only gaps, and keeps recorded status text
separate from a current assessment. It does not infer semantic truth from an emoji or count.
A duplicate/missing/malformed target cannot receive a terminal verdict until its identity/evidence
is resolved. Other findings may still be reported with explicit partial coverage. New ID proposals
are greater than every existing ID reference in the configured ledger, never reuse holes, and are
rechecked against current bytes before writing. ID allocation grants no write authority.

Settings provide the local procedure, not arbitrary commands for automatic execution. Read that
procedure and the consumer constitution before acting. The local procedure owns workstream ordering,
coupling and evidence commands; shared defaults contain no Stackweaver-specific names, ports,
credential recipes, model selection or release assumptions.

### Evidence, updates and recovery

A snapshot binds repository identity, source commit, source cleanliness/diff digest, ledger path/digest,
settings/procedure digests, selected IDs/mode and the observed inventory. Each assessment records its
ID, previous recorded state, current verdict, current symbol/file evidence, exploit or failure scenario,
checks actually performed, residuals and independent challenge where required. Use
`STILL_PRESENT`, `FIXED`, `PARTIAL`, `REGRESSED`, `MOOT` and `UNKNOWN`; recorded legacy words are
preserved in historical text. Missing required checks or access becomes UNKNOWN/PARTIAL, not FIXED/MOOT.

Every new FIXED/MOOT re-verification verdict needs source inspection addressing the original failure
scenario and a separate adversarial challenge. An authored fix additionally requires its regression
red/green, consumer-mandated checks and current independent bounded-maintenance or feature review.
MOOT needs the actual removed applicability, not an absent old line. Residuals are carried explicitly;
partial findings remain partial. Group-level test success does not establish an untested member.

A report/check helper validates assessment coverage and matching target/ledger/settings digests,
ID membership and structural evidence requirements before emitting an eligible update proposal.
It distinguishes recorded counts, newly verified counts and untested coverage. It can verify artifact
identity and required record fields, not the truth of prose. Required semantic model outputs receive
manual transcript inspection as well as fixture graders; negative controls must reject missing or
contradictory evidence, not merely accept a keyword list.

Reports and update proposals are saved privately outside the checkout by default using exclusive
creation. Snapshot/status operations do not edit source, index, refs or the ledger. A candidate ledger
update retains IDs, existing finding content, anchors, table shape, historical notes and unrelated
prose; it adds dated current evidence and changes only authorized statuses/index cells. Before applying
an update, re-read the source/settings/procedure/ledger bindings and check the candidate for deleted or
renumbered IDs. If material inputs changed, stop and recompute; never replay stale verdicts.
The procedure may commit only under the current request or adopted consumer permission and may publish
only under separately applicable delivery authority. Reports/settings cannot authorize themselves.

Interruption preserves the snapshot, assessment, report/candidate and completed local Git work.
On resume inspect real Git/source/artifact state, identify completed vs pending steps, revalidate
bindings and continue only still-current work. Do not duplicate dated notes, findings, commits, issues
or PRs after an interrupted acknowledgement. A content/status/target conflict gets a reconciliation
handoff; no reset, stash, force push or overwrite repairs it. This is procedural recovery, not an
exactly-once distributed-effects guarantee.

### Remediation and delivery authority

Read-only assessment, local ledger changes, local commits, remote issue/PR writes and merge/release
are separate actions. Generic defaults grant no GitHub writes or merge authority. Selected compatible
repairs use the existing bounded-maintenance record and independent review; wider behavior changes use
the accepted feature loop. Neither route weakens required consumer checks or grants unrelated work.
Never execute a command copied from the ledger merely because a finding recommends it.

Stackweaver keeps its existing one-branch/one-PR-per-workstream batching, one finding or coupled bundle
per commit, local full verification before one batch push, one tracking issue per workstream and
conditional squash merge after live gates plus green CI. Its detailed step-7 merge rule explicitly
replaces the older human-review stop in its introductory summary. Preserve that rule locally, including
its pauses for live-data migration, user-visible behavior change or product judgment, plus its
workstream-boundary selection. A generic adopter inherits none of this conditional merge permission.
The extraction's migration merge follows the owning feature's delivery rules, not an audit-fix squash.
No extraction test may operate on the real Stackweaver stack/database or dependency release pipeline.

### Stackweaver adapter, parity and rollback

From current remote main create an isolated migration branch. Replace only the reusable audit
procedure with a thin `agents/codebase-audit.md` forwarder and retain Stackweaver specifics in
`agents/audit-project.md` plus `.vh-adlc/audit.json`. Update only the audit route in AGENTS.md and
`.claude/commands/audit.md`; preserve the command name, `model: opus` and `$ARGUMENTS`.
No rewrite of the real ledger is part of migration. Existing triage, maintenance, SEO, docs, other
agents, hooks and product paths remain unchanged relative the reconciled current-main baseline.

Before implementation record a row-by-row parity map covering every existing mode, stable-ID/format
rule, re-location, verification/challenge rule, delta scan, deduplication, coverage gap, ordering,
coupling, regression ladder, live-runtime requirement/residual, token/data cleanup restriction,
reference implementation, documentation check, batching, tracking, conditional merge, operational
secret handoff and workstream boundary. Each row identifies its shared procedure or retained local
home and an executable contract/scenario. Source-specific examples stay local.

Consumer fixtures under `tests/agent-audit/` use synthetic ledger/source data, including another
ID prefix and generic consumer with no Stackweaver policy. Record the exact shared/consumer commits,
installed version/digest, unchanged ledger hash and rollback baseline. Rehearse restore/reapply of
only the audit migration paths against that current baseline, preserving newer unrelated routes and
index/dirty sentinel bytes. A missing installed operation or stale/mismatched adoption receipt blocks
cutover instead of silently falling back to a copied legacy agent.

### Compatibility, review and publication sequence

Required local acceptance: native Codex CLI and Claude CLI install/discovery and installed-helper
runs in isolated credential-free profiles, plus bounded actual Copilot Opus 5.5 behavior trials on
synthetic repositories. Test default/status/full/fix selection, false-fixed resistance, stale evidence,
missing verification, duplicate-ID/dedup behavior, local-vs-generic delivery policy and interruption.
For an authored synthetic repair observe a real failing test, fix, passing test and independent review;
exercise delivery only against disposable local Git transports and a fake issue/PR surface.
No fixture outcome proves real product compatibility. The Copilot reviewer gets only the public
spec/shared implementation and synthetic fixtures; private Stackweaver finding/source packets need
separate explicit transfer approval if later needed. Model identity must actually match; no fallback.

Live Claude model invocation, phone flow and GUI invocation are not claimed by this child; existing
host deferrals remain unchanged. Static Claude command/model/argument preservation and native Claude
CLI discovery/helpers are required. A missing required CLI/model/helper test blocks completion; do not
convert it to a deferral without the owner. Linux runs the full package suite; portable modules/tests
also run under the existing macOS selection. No workflow trigger/permission/release-policy change.

After a clean committed implementation review and complete source gate, publish the shared component,
verify its normal CI and signed runtime release when produced, then test fresh install/upgrade from
the real marketplace and compare exact payload bytes/modes and native helper behavior. Obtain a fresh
paired migration review at the actual published shared and current consumer commits, and require an
artifact-bound adoption preflight pass before consumer merge. Native receipts are operator attestations;
no shell-resistant boundary is claimed. The audit receipt/verifier lives under `scripts/audit/`, binds
`operation: vh-adlc-audit`, and checks the actual audit skill and installed payload. Maintenance
receipts cannot satisfy audit adoption. Its existing maintenance-specific verifier remains unchanged;
reuse only operation-neutral filesystem/hash inspection utilities whose existing contracts fit. Review provenance, transcripts, command exits and actual saved files must
remain inspectable; never replace missing native evidence with a constructed receipt.

Update this child and the parent roadmap with source/release/marketplace/consumer delivery evidence,
rollback and remaining limits. The owner's end-to-end request covers this feature's normal publication
and migration sequence; spec acceptance still precedes implementation. Real audit remediation and
live operations remain separate owner-selected tasks.

## Acceptance Criteria

- [ ] AC-01: Native skill discovery and ordinary lifecycle intake select the shared audit procedure for its declared modes, preserve other routes, and reject invalid scope without writes or an invented harness/model dependency.
- [ ] AC-02: Configured adopters can inspect their existing supported Markdown ledger without format conversion, distinguish finding identities from references and historical claims, expose malformed/incomplete inventory, and propose fresh IDs without reusing existing references.
- [ ] AC-03: Current assessments and update proposals preserve stable IDs/history and admit FIXED/MOOT only with complete target-bound evidence and the required adversarial check, while stale, missing or contradictory evidence remains visibly incomplete and cannot yield an eligible terminal update.
- [ ] AC-04: Selected audit repairs use the existing reviewed repair/feature lifecycle and the consumer's required verification and authority, preserve workstream boundaries and recover from interruption without silently replaying stale or duplicating completed effects.
- [ ] AC-05: Stackweaver's adapter preserves every parity-mapped audit behavior, command/model/arguments, real ledger bytes and unrelated workflows, and can roll back/reapply only its migration paths against current main.
- [ ] AC-06: The committed source passes its required automated suites, independent exact-commit review, isolated native Codex/Claude installation and helper checks, and bounded actual Copilot Opus 5.5 generic/consumer behavior trials with adversarial negative controls and explicit test limits.
- [ ] AC-07: Consumer cutover is blocked without matching published-marketplace and paired-review artifacts, and the documented delivery procedure verifies the published shared component and installed operation before adopting Stackweaver, retaining exact revisions, rollback and deferred capability limits.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Extend the package/discovery/intake contracts and native CLI skills enumeration. Run default, status, full, explicit IDs, workstream and next scenarios; invalid mode/ID/workstream fixtures must leave source/index/refs/ledger unchanged. |
| AC-02 | Unit fixtures for AUD and a second prefix, incidental IDs in headings/prose, reference-only high IDs, duplicate index/entries, index-only/entry-only findings, missing config, identity mismatch, traversal, symlink escape and unknown profiles. Compare local real-ledger structure read-only and retain its hash; no private contents leave the host. |
| AC-03 | Snapshot/report/update-validation tests and actual Copilot trials for valid/false FIXED, genuine MOOT vs renamed code, missing required checks/independent challenge, sibling-surface residual, incomplete coverage, source/settings/ledger drift, duplicate/renumber/delete attempts and concurrent new-ID conflict. A fixture terminal proposal passes only with all required evidence; every negative must be rejected. Inspect actual returned transcripts and saved report bytes. |
| AC-04 | A bounded synthetic selected repair must show regression red/green, actual independent review, consumer-required verification and separate permissions; generic consumer cannot acquire Stackweaver publication/merge rights. Interrupt after saved report, local commit and accepted fake remote effect with lost response; fresh-context resume reconciles without duplication and blocks after drift/conflict. No real remote or live stack action. |
| AC-05 | Row-by-row consumer contracts and bounded Copilot policy trials cover the parity map; unchanged-path and ledger hashes, Claude command metadata/arguments, generic-consumer controls and installed-plugin rollback/reapply must pass with preserved index/dirty sentinels. Refresh source/consumer revisions if current main changes. |
| AC-06 | Full `bun test tests/vh-adlc`, Go tests/vet/tidy/lint and other-plugin tests, actionlint/whitespace, portable macOS CI, plus isolated native install/discovery/helpers/reinstall. Store actual Copilot model identity/commit/payload, positive and negative grades, manual transcript checks and all failures; independent review verifies the exact committed code and evidence. No live-Claude/GUI inference. |
| AC-07 | Unit preflight denials for maintenance/wrong operation, local-catalog, missing/wrong artifact/model/version/commit/digest and valid unchanged artifacts. Source completion checks the gate and installation candidates; delivery then requires actual published fresh install/upgrade, signed release verification where produced, a fresh paired review and passing actual preflight before consumer merge. This ordered publication obligation is not fabricated as a pre-publication source-test result. |

## Tasks

None yet; decompose into one-commit tasks after clean spec review and owner acceptance.

## Open Questions

### Q1: Should committed consumer policy preserve Stackweaver's ledger and conditional-delivery permissions?

**Recommendation:** A. Preserve daily behavior through freshly fetched default-branch policy, with
explicit operation/mode and selection bounds; a generic consumer receives no standing permission.
This addresses R-1 F-01 and F-04.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Retain local authority** | Stackweaver's bare reverify/full may update and commit its ledger; selected fix scope may create its workstream issue, push/open its PR and conditionally merge after retained gates. Shared authority/lifecycle explicitly recognize this adopted-policy route. | Validate current committed origin/AGENTS/settings/project policy and mode/action scope; reject uncommitted, unmerged, forged-report and generic grants. Current request restrictions win. |
| **B. Report-only defaults everywhere** | Reports stay external; each ledger edit/commit, issue, PR and merge receives a separate request. | Changes Stackweaver's daily flow and adds owner steps. |

**Why this is yours:** It controls tracked and remote side effects and the compatibility of the existing command.

### Q2: May a bounded audit repair restore an already documented security or data-handling behavior?

**Recommendation:** A. Permit a scoped regression repair when it restores an established contract and
adds no boundary, format or migration; otherwise retain the feature route and owner decision. This
addresses R-1 F-02 and requires an explicit audit-specific classification rule, not a silent change
to all maintenance eligibility.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Restore documented behavior** | A selected existing defect can use reviewed bounded audit repair, including a security regression. New/changed boundaries, stored formats, migrations and intentional user-visible changes still need the feature/owner path. | Record the existing contract and eligibility before repair; independent review must verify that classification. |
| **B. Feature route for every boundary touch** | Preserve the current broad feature classification literally for security/data work. | A repair restoring the existing contract may need a separate accepted feature spec. |

**Why this is yours:** It determines how much planning and approval an existing audit fix needs.

### Q3: Should one compatible selected workstream batch be one repair record with final-head review?

**Recommendation:** A. Enumerate every selected finding and coupled bundle in one bounded Definition;
keep per-finding commits on one branch and require current independent review of the complete batch
at its final head before publication. This addresses R-1 F-03.

| Option | You get | It costs |
| --- | --- | --- |
| **A. One record per compatible batch** | Preserve Stackweaver's workstream branch/PR shape and review all current member findings together. | The record and per-finding evidence must be complete; adding or changing any member invalidates the batch review. Mixed incompatible work enters the feature/owner path. |
| **B. One repair record per finding** | Each finding has separate Definition/evidence/review accounting on the shared workstream branch. | Need explicit aggregation and final freshness checks for every record before the batch push. |

**Why this is yours:** It sets the review and recovery unit for the existing workstream batching flow.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-01 | R-1 | spec | `5bddd847fc28744bb1ebe0a7d626f5b502f5645e` | claude-opus-5.5 | procedural | Blocking authority gap; repair/batch/ledger policy decisions and preflight clarification required. |

### R-1

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design, Remediation and delivery authority
EVIDENCE: Shared rules allow no merge or publication through the audit route. authority.md:22-24 says a tracking issue must be "Included in acceptance, or requested", that "Push the feature branch, create or update its PR" needs "An explicit ship request", and that "Merge" needs "Separate approval for that exact action". lifecycle.md:97-98 says an eligible maintenance task "authorizes no push, PR, merge or live action". lifecycle.md:52 says "other non-feature publishing or live-operation gaps remain unsupported". The spec sends audit repairs through "the existing bounded-maintenance record" but also keeps Stackweaver's batch push, tracking issue per workstream and conditional squash merge "locally". It only says publication needs "separately applicable delivery authority" and that "Reports/settings cannot authorize themselves". check.sh confirmed that Stackweaver's procedure contains batch_policy, conditional_merge and merge_checks. Maintenance has an explicit authority row (authority.md:21) and a freshly fetched committed-declaration rule (maintenance.md:160-162). Audit has neither, even though authority.md and lifecycle.md are in covers.
PROPOSAL: Specify the authority.md and lifecycle.md change for audit delivery. It should say which source can carry the local permission (for example, the committed default-branch project procedure resolved from freshly fetched objects, not settings, reports or the ledger). It should also say whether `fix <selection>` counts as the request for the batch push, tracking issue and PR, and how the conditional merge overrides bounded maintenance's no-push/no-merge rule only for that consumer. Add AC-04 negative trials for an uncommitted or unmerged local grant and for a generic adopter.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Remediation and delivery authority
EVIDENCE: lifecycle.md:91-93 sends "permission/trust boundaries, stored-data formats/migrations" to the feature route, and maintenance.md:236-237 says "A major or public/data/permission/delivery-policy change uses the feature loop". The spec only says "Selected compatible repairs use the existing bounded-maintenance record ... wider behavior changes use the accepted feature loop". Stackweaver's audit procedure covers security repairs (check.sh facts scoped_token, row_cleanup, operational_secret, migration_stop). The spec gives no rule for classifying an audit fix that restores an intended permission boundary or touches data handling.
PROPOSAL: Define how a selected finding is classified. For example, a fix that restores a documented boundary counts as a regression repair, and a new or changed boundary, data migration or user-visible change uses the feature route or Stackweaver's existing pause. Add parity-map rows and synthetic trials for both outcomes.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Remediation and delivery authority; Stackweaver adapter, parity and rollback
EVIDENCE: Stackweaver keeps "one-branch/one-PR-per-workstream batching, one finding or coupled bundle per commit, local full verification before one batch push". Bounded maintenance (lifecycle.md:99-130) uses one short-lived branch per task, one record and an independent review of one exact commit that compares that record's Definition. The spec does not say whether a workstream batch is one maintenance task or one task per finding or coupled bundle. It also does not say where the records live, or whether review targets each finding commit or the batch head before the push.
PROPOSAL: State the mapping of record, branch and review target for a multi-finding workstream batch, and state how a later finding's commit affects the freshness of an earlier review. Cover it in the AC-04 synthetic batch trial.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Entry points and modes; Evidence, updates and recovery
EVIDENCE: Default mode will "prepare a dated ledger update, then present the result". `full` will "append genuinely new IDs". The authority list says "Read-only assessment, local ledger changes, local commits ... are separate actions", and proposals are "saved privately outside the checkout by default". The spec never says which mode or request permits writing the candidate into the tracked ledger in the working tree, short of a commit. For Stackweaver, the AC-05 parity of `/audit` and `/audit full` depends on whether the legacy behavior edits the ledger in place.
PROPOSAL: State, for each mode, whether a bare invocation applies the validated candidate to the working-tree ledger, only saves it externally, or needs an explicit or adopted local rule. Add that row to the parity map and to the AC-01/AC-05 scenarios.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, Compatibility, review and publication sequence; covers
EVIDENCE: The spec says "Existing preflight primitives may be reused without changing maintenance/triage policy". shared/plugins/vh-adlc/scripts/maintenance/migration.ts:19 rejects any receipt unless `receipt.operation !== "vh-adlc-maintenance"` is false, so it cannot validate an audit receipt unchanged. scripts/maintenance/ is not listed in covers.
PROPOSAL: State whether the audit receipt and preflight live in scripts/audit/, or whether migration.ts is generalized. If it is generalized, add it to covers and to the regression tests.

## Sources

- [Feature document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): separate child, committed review, owner acceptance and status gates.
- [Feature delivery conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): default-branch documentation, implementation claim, exact publication and consumer ordering.
- [Documentation conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/documentation.md) and [humanize prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): grounded prose and one canonical feature document.
- [Parent migration roadmap](shared-workflow-migration.md): audit selection, retained local policy and deferred sibling capabilities.
- Stackweaver `agents/codebase-audit.md` at `0ae15a9d`, `Codebase Audit Agent`, `Mode selection`, `Verify` and `Ship`: existing behavior and explicit conditional-merge rule. Local inspection only; no private findings copied.
- Stackweaver `.claude/commands/audit.md` and `CLAUDE.md` at `0ae15a9d`: command/model/arguments, constitution, worktree/data constraints and shipping requirements.
