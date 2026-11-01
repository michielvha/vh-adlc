---
status: draft
status_description: "Owner decisions and R-1 through R-5 fixes are incorporated. Both ledger application and commit bind to the isolated assessed source; complete standalone examples are covered. Fresh Opus review and owner acceptance remain pending; implementation has not started."
issue: null
goal: "Run persistent codebase audits through a harness-agnostic vh-adlc operation while each consumer retains its ledger, product knowledge and delivery policy."
covers:
  - plugins/vh-adlc/skills/vh-adlc-audit/
  - plugins/vh-adlc/references/audit.md
  - plugins/vh-adlc/references/audit-settings.md
  - plugins/vh-adlc/references/audit-record.md
  - plugins/vh-adlc/references/audit-review.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/scripts/audit/
  - plugins/vh-adlc/examples/audit/
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

The owner accepted the three summarized R-1 policy recommendations on 2026-11-01: retain
Stackweaver's adopted local automation, allow contract-restoring bounded audit repairs, and use one
record/final-head review per compatible selected batch. The owner separately required documentation
publication to wait until spec acceptance. These decisions are folded into Design/Test Plan below;
they are not acceptance of the not-yet-refreshed reviewed spec.

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
plus `audit-review.md` and focused modules under `scripts/audit/`. Native invocation is `vh-adlc-audit`; ordinary-language
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

Mode write permissions are explicit. `status` is always read-only. Generic `reverify` and `full`
save private proposals, and require a current explicit ledger-update request or adopted local rule
before applying them to the tracked working-tree ledger. A distinct applicable permission is needed
for a local commit; none of these modes grants a remote push. Stackweaver's adopted reverify/full
rule permits validated ledger application and its dated local documentation commit, then stops for
fix selection. `fix` authorizes only selected source/ledger/record edits and local commits within the
classified repair/feature route; remote actions additionally require the adopted delivery grant below.
Invalid modes/targets grant none of these writes. Each parity test checks the working tree, index,
refs and fake remote effects, not just the final text.

Place every permitted reverify/full ledger application, including an uncommitted `ledger-update`
without `ledger-commit`, in a new owned ledger-only worktree/branch
`chore/audit-ledger-<run-id>`, based on freshly fetched committed default-branch source. Assess that
same clean committed source before applying any candidate: assessed source commit must equal the
owned ledger worktree's recorded default-branch base, and its ledger/settings/procedure bindings
must match. A report assessed on an unrelated feature or dirty source remains a target-labelled
private report; its verdicts cannot be applied or committed to the canonical default-branch ledger.
Re-assess the proper clean base before any tracked update, even with explicit ledger-write permission.

The ledger worktree contains only the validated ledger update and any explicitly required generated
index, never changes from whichever checkout happened to invoke the operation. Record the new
branch/worktree/base, source and ledger digests, actual candidate bytes and any commit. Before an
optional commit, source/settings/procedure must still match that assessed base and the only owned
working delta must be the exact validated ledger/index candidate; candidate bytes are not mistaken
for unrelated dirty source. No commit permission leaves that candidate uncommitted only in its owned
worktree. Never write into, switch or commit into an unrelated feature or shared dirty main.
A conflict/occupied path leaves the private proposal and handoff. The audit authority/lifecycle
extension permits ordinary creation of this owned ledger role and the selected repair worktree;
it grants no cleanup of unrelated refs/worktrees or force deletion.

That ledger commit stays local: reverify/full has no standing push permission. A current explicit
request can separately publish it through the consumer's normal delivery route, otherwise it is not
advertised as remote history. If the owner then selects fixes from that same report, the new repair
worktree may start at the recorded ledger commit only when its parent is the still-current fetched
default base and its delta contains exactly the owned permitted ledger/index paths. Record that
ledger commit as Task base before authored repairs; its known report update is part of the selected
batch's later reviewed publication scope. If default source, ledger or policy advanced, reconcile
and re-assess against the new base first; never carry stale verdicts onto the new branch. A generic
consumer missing ledger-commit permission keeps its report external. Tests inspect the true commit
branch/base/path set and cover an unrelated feature checkout, dirty main, unpublished local ledger
commit followed by selected fixes, newer default source and conflicting ledger bytes.

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
ledger/settings; it references no personal host paths or private configuration. Store complete
copyable files under `plugins/vh-adlc/examples/audit/basic/`: `.vh-adlc/audit.json`, `docs/audit.md`
and `audit-project.md`, linked from the settings guide. A test copies the entire example into a
fresh synthetic Git repository with its declared origin and exercises the actual settings and
inventory helpers, rather than validating an abbreviated configuration fragment.

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
are separate actions. Generic defaults grant no GitHub writes or merge authority. Never execute a
command copied from the ledger merely because a finding recommends it.

Add an audit-specific route and permission row in `references/lifecycle.md` and `authority.md`.
The local permission source is a clearly named `Standing audit workflow authorization` declaration
in the project procedure reached through freshly fetched, committed default-branch AGENTS and audit
settings. Resolve its Git objects from the verified origin/default branch, compare the current
request and repository/mode/selected-workstream scope, and check its restrictions immediately before
each applicable effect. Uncommitted or unmerged declarations, alternate origins, fixture-only
adapters, copied settings, ledger instructions, reports and generated records confer no authority.
A fetch/read failure leaves a handoff, not a cached grant. This is adopted operator policy, not
shell-resistant isolation or a grant to modify that policy.

`audit-settings.md` defines this exact declaration shape: exactly one level-two heading named
`Standing audit workflow authorization`, immediately followed by one Markdown table with header
`Field | Value`. It has exactly one nonempty row per field below, no unknown or duplicate field,
and no second declaration/table. Values are plain literals, not executable instructions.

| Field | Allowed value and binding |
| --- | --- |
| repository | Exact normalized owner/repository matching verified origin and selected task. |
| hostname | Exact verified origin host. |
| default_branch | Actual remote default branch; no alternate branch may supply this grant. |
| ledger_path | Exact configured repository-relative ledger path. |
| status_effects | `none` only. |
| reverify_effects | `none` or a comma-separated unique subset of `ledger-update,ledger-commit`. |
| full_effects | `none` or a comma-separated unique subset of `ledger-update,ledger-commit`. |
| fix_effects | `none` or a comma-separated unique subset of `source-edit,ledger-update,local-commit,live-verify,issue-write,branch-push,pr-write,conditional-merge`. |
| selection_policy | A fragment-only pointer to one existing unique heading in this same committed project procedure defining workstream selection/coupling. |
| verification_policy | A fragment-only pointer to one existing unique heading in this same procedure defining required checks/live gates/residuals. |
| merge_policy | A fragment-only pointer to one existing unique heading in this same procedure defining retained conditional merge conditions and owner stops. |

Reject a missing/duplicate/unknown row, empty/unknown/repeated effect, `none` mixed with an effect,
wrong identity/branch/path, unresolved or ambiguous fragment, or any effect outside its mode. Such
an invalid declaration grants no effect. A valid subset grants only its named effects; a local
commit additionally needs the corresponding mode's ledger/source edit authority. Any fix remote
effect additionally needs current owner selection and the retained local gates. A merge grant
without satisfied merge conditions is only a pending permission, never an executable result.

These effect rows describe standing grants, not prohibitions. Omitting an effect or using `none`
withholds that standing grant; it does not revoke a separate current explicit request. Actual local
prohibitions and current read-only/no-commit/no-push/no-merge restrictions still win. For an eligible
repair, a generic adopter's current `fix <selection>` request and local instructions that permit
bounded repair authorize selected source/ledger/record edits, required non-live checks and local
commits through the existing lifecycle, even without a declaration. They grant no live verification
or remote action. Ineligible work must first satisfy the feature/owner route; `fix` cannot bypass it.
The helper reports an effect's source as current request, adopted grant or neither; no report can
manufacture that current request. It checks the selected action against both and applies restrictions.

Declaration subsets themselves must be coherent: `ledger-commit` requires `ledger-update` in the same
mode; a fix `local-commit` requires `source-edit` and `ledger-update`; any fix `live-verify` or remote
effect requires all three fix local effects. `pr-write` requires `branch-push`; `conditional-merge`
requires `branch-push,pr-write`. Reject an incoherent declaration rather than invent missing grants.
Thus `fix_effects: none` still allows an independently requested eligible local repair, while a
remote-only declaration subset is invalid. Test these cases alongside a true local prohibition.

A deterministic `scripts/audit/authority.ts` helper parses and checks this declaration against the
freshly fetched committed bindings and current repository/mode/selection/effect, and records the
checked default-branch commit, policy/settings/AGENTS digests, scope and restrictions in its result.
It validates provenance/shape/action scope; it cannot prove a human policy's semantic conditions or
issue an OS capability. The procedure independently observes checks/current PR/head and the retained
conditions before an effect. The helper does not execute policy text or perform a merge/push.
A read-only or no-fetch request cannot acquire a fresh standing grant from cached bytes; it may still
produce a private report. Tests cover every field, valid least-privilege subsets, each mode/effect,
failed fetch and changed policy/selection alongside generic and unadopted-declaration denials.

Stackweaver's declaration permits ledger update/local commit for reverify/full, and permits issue
tracking, one batch push/PR and conditional merge only for an owner-selected `fix` workstream batch
meeting its existing conditions. Thus the current `fix <selection>` request selects that bounded
batch under the adopted rule; it is not an unrestricted ship/merge request. Generic consumers have
no such declaration or permission by default. Current no-write/no-commit/no-push/no-merge/read-only
restrictions override the standing grant for the affected effects. Reverify/full never inherit fix's
remote permission, and the declaration grants no production release/deployment, protection bypass,
persistent credential change/secret rotation or next-workstream selection. Revalidate the actual selected PR/head and all local/remote
gates before conditional merge; changed scope/head/evidence stops that effect.

The retained Stackweaver live gate uses `fix` selection plus an explicit adopted `live-verify` effect
and its committed `verification_policy`, not an implicit exemption to the generic no-live-action rule.
That local policy enumerates the allowed development verification target, permitted rebuild/restart
method, scoped temporary test-key creation/use/revocation where necessary, owned test-data operations
and row-scoped cleanup. It preserves the constitution's worktree/slot and shared-stack restrictions;
a worktree must not invoke an otherwise forbidden shared-stack recreation. Use its permitted isolated
runtime or obtain the current explicit approval the retained local rule requires for that exact target.
This audit-specific authority row recognizes only those named checks for the selected batch, after
fresh permission/target validation and current restrictions; no production rollout, real-data migration,
unscoped delete, unrelated credential access or operational secret rotation follows from it.

A generic adopter, an unadopted policy or a missing/denied live-verify effect receives a handoff before
any such live action unless the owner separately authorizes its exact scope. Mandatory live evidence
then remains missing and conditional merge stays blocked. A genuinely unreachable path may use only
the retained policy's explicit residual exception, with recorded reason and owner judgment when that
policy requires it; a permission denial, token shortage or skipped test is not converted into that
exception. This preserves Stackweaver's allowed live-verification flow while making its authority
explicit. Extraction tests exercise only disposable synthetic stacks/keys/test rows and fake transport.

The audit route explicitly distinguishes restoration from a changed contract. A selected repair
that restores an already documented intended behavior, permission boundary or data-handling invariant
may use bounded repair when it introduces no new promised semantics, boundary, stored format,
migration or delivery policy. Its Definition cites the pre-existing contract, demonstrates the
regression and records that eligibility; the independent review checks it. A new or intentionally
changed boundary, stored format/migration, public behavior or delivery rule enters the accepted
feature loop and the consumer's owner-decision gate. Ambiguous intent stops for clarification.
This audit-specific eligibility/selected-delivery exception does not broaden ordinary maintenance
or dependency-batch authority. Add explicit lifecycle pointers to it so the broad boundary-change
classification cannot silently contradict this accepted restoration rule.

One compatible selected workstream batch is one bounded repair task, one branch and one record at
the consumer's declared maintenance/task location, otherwise
`docs/internal/maintenance/audit-<workstream>-<run-id>.md`. Its Definition enumerates the fixed selected
IDs/coupled bundles, existing contract, repair eligibility, affected paths and each finding's required
checks. Keep one commit per finding/coupled bundle and per-finding red/green/live evidence under that
record. Do not create one feature spec or separate maintenance branch per finding. The final
independent review targets the complete batch's exact committed head and all Definition members,
including their current verification evidence, before publication. A newly added member, changed
Definition or later source commit invalidates that review and requires another pass; older reviews
remain history. Append-only evidence/review bookkeeping may preserve freshness under the existing
record rule. Final verification must establish every member at the final batch target; an earlier
member cannot inherit a later member's pass. Mixed incompatible work uses the feature/owner path.
Neither record nor review grants remote authority or weakens consumer checks.

`references/audit-record.md` is the explicit audit batch template, retaining the common maintenance
Definition/Evidence/Reviews/State sections and their freshness semantics. Its Definition records:
repository and task base, selected workstream/run ID and exact finding IDs/coupled bundles, requested
outcome, cited pre-existing contract for each member, per-member repair eligibility and owner-decision
boundaries, preserved contract, affected source/test/config paths, verification inputs, proposed
repair and each member's required checks/pass conditions. Record the ledger/settings/procedure
bindings and the current selected-delivery permission separately from technical repair eligibility.
The record remains on the selected source branch for this ordinary audit route; no external evidence
ref/paired-record variant is introduced by this extraction.

Its Evidence has one row/section per member: finding/scenario and current source symbols, pre-fix
commit and observed failing regression, repair commit, green/current required check commands and
results against the final batch target, live-gate or explicitly permitted unreachable-path residual,
verification-input bindings, and unresolved siblings or other residuals. Red evidence retains its
real pre-fix target; it is never relabeled as a failure on the fixed head. Every member's final
required checks must actually establish that member at the final head. Record the batch's exact
review target and preserve older checks/reviews rather than rebinding them to a newer commit.

Dispatch the independent batch review with `references/audit-review.md`, the batch repository,
exact final source commit, committed record path/Definition, selected scope, docs revision and shared
review protocol. The audit-specific reviewer checks the accepted restoration classification against
the cited existing contract, complete Definition membership/couplings, actual diff from task base,
per-member red/green and final-target checks, live-gate/residual conditions, stale bindings and
unrelated-state preservation. It may reuse operation-neutral review protocol/model/isolation rules,
not dispatch an unchanged ordinary maintenance reviewer as if it covered these extra obligations.
Missing cited contract or any member's required final-head evidence is a finding and prevents a
clean batch review. Return the shared `MODEL:` header and complete findings or `NO FINDINGS`, store
them verbatim with exact target/model/isolation, and apply the common review freshness rules.
The existing maintenance record and reviewer stay unchanged; audit-specific files carry this extension.

For a fix batch, the Definition's affected paths explicitly include the ledger and its index/status
updates. Prepare and commit those proposed updates on the selected unpublished source branch before
the final-head review, so the reviewer sees the complete source, ledger and record Definition in one
snapshot. Mark the batch/assessment state `review pending`; a local candidate containing a proposed
FIXED/MOOT value is not an eligible/published completion verdict. Candidate validation distinguishes
this provisional local artifact from final completion eligibility and grants no publication.

The final independent audit batch review may also supply the separate adversarial challenge only
when its reviewer is independent of the producer and explicitly challenges every proposed FIXED/MOOT
member against that member's original failure/applicability scenario, in addition to checking the
record and actual final-target evidence. Missing member challenge/evidence prevents a clean result.
Bind its real returned records and observed challenge evidence to the exact source/ledger/Definition
objects. Only a clean current review plus all required gates changes the batch eligibility/state to
complete and allows any separately authorized publication. That state/review append is the existing
append-only bookkeeping exception; it does not rewrite a finding's status or evidence requirements.

Every actual ledger status/index/content change after that review is a material change and stales
it, even if the author calls it bookkeeping. Commit the changed candidate and obtain renewed checks
and review before claiming completion or publishing. Adding returned review/evidence to the record
without changing its Definition or the reviewed ledger/source/verification inputs can preserve
freshness. This ordering avoids both an unreviewed ledger edit and a review/ledger-commit loop.

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
rule, per-mode working-ledger/commit/publication permissions and ledger-branch/base handoff, live
verification authority/denial/residual mapping, repair classification, batch record/review mapping, re-location, verification/challenge rule, delta scan, deduplication, coverage gap, ordering,
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
| AC-01 | Extend the package/discovery/intake contracts and native CLI skills enumeration. Run default, status, full, explicit IDs, workstream and next scenarios; verify external proposal versus permitted ledger application/local commit by mode and consumer, including ledger-update without ledger-commit and its isolated assessed-source/branch/base/path scope when invoked from an unrelated feature or dirty main, and no remote action from reverify/full. Invalid mode/ID/workstream fixtures must leave source/index/refs/ledger unchanged. |
| AC-02 | Unit fixtures for AUD and a second prefix, incidental IDs in headings/prose, reference-only high IDs, duplicate index/entries, index-only/entry-only findings, missing config, identity mismatch, traversal, symlink escape and unknown profiles. Copy and exercise the complete standalone example through actual settings/inventory helpers. Compare local real-ledger structure read-only and retain its hash; no private contents leave the host. |
| AC-03 | Snapshot/report/update-validation tests and actual Copilot trials for valid/false FIXED, genuine MOOT vs renamed code, missing required checks/independent challenge, sibling-surface residual, incomplete coverage, source/settings/ledger drift, a reverify/full verdict assessed on non-default or dirty source being refused for tracked ledger application/commit, duplicate/renumber/delete attempts and concurrent new-ID conflict. A fixture terminal proposal passes only with all required evidence; every negative must be rejected. Inspect actual returned transcripts and saved report bytes. |
| AC-04 | A bounded synthetic selected workstream batch with two findings must show per-finding red/green/current verification and final-head independent review of the single record/branch. Add a later member/commit and changed Definition to prove that prior review is stale. The actual audit-specific reviewer must reject a member missing a cited pre-existing contract, a missing per-member challenge, and a batch where only the second member has a passing final-head check; a valid two-member batch including proposed ledger updates must pass. Provisional candidate FIXED/MOOT cannot be published before that pass. A ledger status/index edit after review must stale it, while a true append-only record review/state update may preserve freshness. Classify documented permission/data-handling restoration versus new boundary/format/migration/intent change, with the latter stopping for feature/owner routing. Exercise the deterministic declaration helper with every missing/duplicate/mismatched/unknown field, duplicated heading/table, valid/coherent restricted effect subsets and cross-mode effect, generic eligible local fix without a declaration, `fix_effects: none`, incoherent remote-only subset and actual local prohibition; reject uncommitted, unmerged, alternate-origin, wrong-mode/selection and report/settings-forged grants; missing adopted policy, failed fetch and generic consumer receive no Stackweaver permissions. Current no-write/no-push/no-merge wins. Synthetic live-gate cases must distinguish adopted/requested permission, permission denial blocking merge, and a genuinely unreachable path with only its permitted residual; temporary key/test-row cleanup and no unrelated restart are observed. Carry a known unpublished ledger-only commit into the selected repair base; new default source or conflicting ledger must stop/reconcile. Interrupt after saved report, local commit and accepted fake remote effect with lost response; fresh-context resume reconciles without duplication and blocks after drift/conflict. No real remote or live stack action. |
| AC-05 | Row-by-row consumer contracts and bounded Copilot policy trials cover the parity map; unchanged-path and ledger hashes, Claude command metadata/arguments, generic-consumer controls and installed-plugin rollback/reapply must pass with preserved index/dirty sentinels. Refresh source/consumer revisions if current main changes. |
| AC-06 | Full `bun test tests/vh-adlc`, Go tests/vet/tidy/lint and other-plugin tests, actionlint/whitespace, portable macOS CI, plus isolated native install/discovery/helpers/reinstall. Store actual Copilot model identity/commit/payload, positive and negative grades, manual transcript checks and all failures; independent review verifies the exact committed code and evidence. No live-Claude/GUI inference. |
| AC-07 | Unit preflight denials for maintenance/wrong operation, local-catalog, missing/wrong artifact/model/version/commit/digest and valid unchanged artifacts. Source completion checks the gate and installation candidates; delivery then requires actual published fresh install/upgrade, signed release verification where produced, a fresh paired review and passing actual preflight before consumer merge. This ordered publication obligation is not fabricated as a pre-publication source-test result. |

## Tasks

None yet; decompose into one-commit tasks after clean spec review and owner acceptance.

## Open Questions

None. On 2026-11-01 the owner accepted the three recommendations summarized in the conversation:
retain adopted local authority and per-mode ledger writes; allow bounded repairs restoring documented
behavior; use one repair record with final-head review per compatible selected workstream batch.
Publication still waits for reviewed-spec acceptance. Any new judgment finding returns to the owner.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-01 | R-1 | spec | `5bddd847fc28744bb1ebe0a7d626f5b502f5645e` | claude-opus-5.5 | procedural | Blocking authority gap; repair/batch/ledger policy decisions and preflight clarification required. |
| 2026-11-02 | R-2 | spec | `773c703b5a3f2b6f4773afe45b9f8e7e158ad0f8` | claude-opus-5.5 | procedural | Batch record/review dispatch needs explicit per-member fields and negative checks. |
| 2026-11-02 | R-3 | spec | `cd10c08964a0b759f10b38b5f90fa9808db20241` | claude-opus-5.5 | procedural | Specify the authorization declaration and ledger/review ordering. |
| 2026-11-02 | R-4 | spec | `c68255a2114b4d298948af9913468eeec4424528` | claude-opus-5.5 | procedural | Map retained live verification, ledger-only commit placement and request-versus-standing effects. |
| 2026-11-02 | R-5 | spec | `0bd3d6f0375ed09590529166f4e95c307b3cc69b` | claude-opus-5.5 | procedural | Bind uncommitted ledger application to its isolated assessed source. |

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

### R-2

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Remediation and delivery authority; covers
EVIDENCE: shared-audit.md:239-251 says a selected workstream batch gets "one record" whose "Definition enumerates the fixed selected IDs/coupled bundles, existing contract, repair eligibility, affected paths and each finding's required checks". It also says the final independent review checks "all Definition members, including their current verification evidence" and that "an earlier member cannot inherit a later member's pass". shared-audit.md:174-175 and 231-232 rely on "current independent bounded-maintenance or feature review" and say "the independent review checks" restoration eligibility. The existing template, maintenance-record.md:13-19, has only Outcome, Preserved contract, Task base, Affected paths, Verification inputs, Proposed change and Required checks. It has no selected-ID, bundle, eligibility or per-member evidence fields. maintenance-review.md:15-18 tells the reviewer to "Confirm that the task is eligible bounded maintenance", and lifecycle.md:91-93 sends "permission/trust boundaries" to the feature route. Neither reference is in covers. The spec never says what the new covered `references/audit-record.md` contains or which review instructions a batch dispatch passes. An implementation could therefore reuse the unchanged maintenance reviewer. That reviewer does not verify each member at the final head or the cited pre-existing contract, and it could reject a restoration that the audit rule permits. The AC-04 trial covers only review staleness and route classification. It does not check whether the reviewer enforces these batch obligations.
PROPOSAL: State whether `audit-record.md` is the batch record template, list its Definition and per-member evidence fields, and say which review instructions the batch dispatch uses. If those are maintenance-review.md or maintenance-record.md, add the extension to covers. Otherwise add an audit-specific review reference. Extend the AC-04 trial so that the review finds a missing per-member final-head check and a missing cited contract.

### R-3

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Remediation and delivery authority; Test Plan AC-04
EVIDENCE: shared-audit.md:210-216 defines the local grant only as "a clearly named `Standing audit workflow authorization` declaration in the project procedure", which is checked against "repository/mode/selected-workstream scope" and "its restrictions". shared-audit.md:219-227 says this one declaration covers ledger update and local commit for reverify/full, plus issue tracking, one batch push/PR and conditional merge for `fix`. The spec gives no heading, fields, allowed values or uniqueness rule for this declaration. It also does not say whether audit-settings.md or a scripts/audit/ helper parses it. The existing standing grant is exact by comparison: maintenance-settings.md:53-77 requires "exactly one heading/table with every field below" (repository, hostname, branch, route, paths, update policy), and a missing or mismatched field grants nothing (maintenance-settings.md:81). The AC-04 proof requires rejecting "wrong-mode/selection" grants. The implementation has to make up the declaration's shape before that test can be written or graded.
PROPOSAL: Specify the declaration's exact structure in audit-settings.md: repository, hostname, default branch, permitted modes, permitted effects for each mode, and a pointer to the retained merge conditions. Say that a missing, duplicate or mismatched field grants no effect. State whether a deterministic scripts/audit/ helper checks this and add that helper to the AC-04 unit denials.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Evidence, updates and recovery; Remediation and delivery authority
EVIDENCE: shared-audit.md:174-176 says a new FIXED verdict for an authored fix needs "a separate adversarial challenge" and also "current independent bounded-maintenance or feature review". shared-audit.md:246-250 says the final batch review targets "the complete batch's exact committed head" and "a later source commit invalidates that review", and only "Append-only evidence/review bookkeeping may preserve freshness under the existing record rule". The audit-record.md Definition fields at shared-audit.md:255-260 list "affected source/test/config paths" and do not mention the ledger. The spec never says when a fix batch writes the ledger status/index change to FIXED: before the final review, so the review checks it, or after it. If the edit comes after the review, the spec does not say whether that ledger commit makes the review stale. It also does not say whether the final batch review counts as the separate adversarial challenge. One implementation could mark FIXED with no reviewed ledger diff. Another could loop, because each ledger commit that cites the review makes that review stale.
PROPOSAL: State that the ledger status/index edit for each fix member is part of the batch Definition's affected paths and is committed before the final-head review, or define it as allowed post-review bookkeeping with explicit limits. Also say whether that review satisfies the FIXED adversarial challenge. Add an AC-04 case for a ledger change after the review.

### R-4

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Remediation and delivery authority; Stackweaver adapter, parity and rollback
EVIDENCE: check.sh reported live_gate, scoped_token (`CreateAPIKey`), row_cleanup and migration_stop as true in Stackweaver `agents/codebase-audit.md` at 0ae15a9d. The spec keeps "conditional squash merge after live gates plus green CI" (shared-audit.md:342-344). It requires "live-gate or explicitly permitted unreachable-path residual" evidence for each member (shared-audit.md:302), and it puts the live-runtime requirement and the token/data cleanup restriction in the parity map (shared-audit.md:362-363). However, the declaration "grants no release, deployment, protection bypass, credential operation" (shared-audit.md:261-262). The fix_effects values (shared-audit.md:233) have no live-verification effect. authority.md:24-25 requires "Separate approval for that exact action" to restart a running app and for destructive data operations or credential changes. lifecycle.md:52 says "other non-feature publishing or live-operation gaps remain unsupported". The spec never says which authority covers the live gate for a selected fix batch: minting a scoped test key, row-scoped cleanup of test rows, or using or restarting the local stack. An implementation could ask for approval of every action, which changes the retained conditional merge flow. It could treat the fix selection as covering those actions, which contradicts the credential denial. Or it could turn the gate into a residual, which blocks the merge condition.
PROPOSAL: State whether the retained live gate's scoped local actions run under the fix selection plus the local verification_policy, need a separate per-batch owner approval, or always stop, and say how each choice affects conditional merge. Add a parity row and AC-04/AC-05 synthetic cases for a live gate that is authorized, one that is denied and one that is residualized.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Entry points and modes; Remediation and delivery authority
EVIDENCE: shared-audit.md:125-127 says Stackweaver's reverify/full rule "permits validated ledger application and its dated local documentation commit". reverify_effects and full_effects allow `ledger-commit` (shared-audit.md:231-232), and no reverify/full value permits a push. The spec never names the branch, checkout or ref that receives this commit. It also does not say how the commit reaches the remote, or how a later fix batch's "task base" (shared-audit.md:293) takes it in or reconciles with it. lifecycle.md:99-100 forbids writing "into an unrelated feature" and requires a short-lived branch only for maintenance tasks. Maintenance report commits name an explicit default-branch ff-only checkout or isolated report refs (authority.md:95-101). The context reports that Stackweaver's checkout already has unrelated local work (shared-audit.md:61). As written, a reverify ledger commit could land on whatever branch is checked out, or stay unpublished on local main and conflict with the ledger and index edits of the next fix batch.
PROPOSAL: Define where a reverify/full `ledger-commit` is made, for example the default-branch checkout when it is clean for the ledger path and fast-forwardable, with a handoff otherwise. Say how that commit is published or carried into a later fix batch base. Add this as a parity row and an AC-01/AC-04 scenario that includes a checkout on another branch.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Entry points and modes; Remediation and delivery authority
EVIDENCE: shared-audit.md:127-128 says "`fix` authorizes only selected source/ledger/record edits and local commits within the classified repair/feature route; remote actions additionally require the adopted delivery grant". This makes the fix request itself the source of local authority. Yet fix_effects lists `source-edit,ledger-update,local-commit` as declaration effects (shared-audit.md:233). shared-audit.md:240-241 says "A valid subset grants only its named effects; a local commit additionally needs the corresponding mode's ledger/source edit authority". authority.md:16 additionally requires "local instructions that permit it" for bounded maintenance edits. The spec does not settle three cases. First, whether a generic adopter with no declaration may make fix source, ledger and local-commit edits. Second, whether `fix_effects: none` or a subset that omits `source-edit` restricts a requested fix. Third, whether a remote-only subset such as `branch-push,pr-write` without `local-commit` is valid. The AC-04 proof requires grading "valid restricted effect subsets", so the implementation would have to invent these semantics.
PROPOSAL: State whether fix local effects come from the current request plus lifecycle eligibility, from the declaration, or from both. Say whether omitting a fix_effects value restricts or only withholds a grant, and reject incoherent subsets, for example push or PR without local commit. Add AC-04 helper cases for each of these.

### R-5

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Entry points and modes; Evidence, updates and recovery
EVIDENCE: shared-audit.md:122-125 says reverify/full "require a current explicit ledger-update request or adopted local rule before applying them to the tracked working-tree ledger", and a separate permission is needed for a commit. reverify_effects allows `ledger-update` alone as a valid subset (shared-audit.md:252), and a generic adopter can send an explicit ledger-update request with no commit. Isolation is only defined for the commit: shared-audit.md:132-136 places it in a new `chore/audit-ledger-<run-id>` worktree "based on freshly fetched committed default-branch source" and says "Never switch or commit into an unrelated feature or shared dirty main". The spec never says which working tree an uncommitted `ledger-update` writes to. As written, it could be whatever checkout invoked the operation, including an unrelated feature branch or dirty main with its own ledger edits. That conflicts with lifecycle.md:99-100 ("do not write into an unrelated feature") and authority.md:68. The spec also never requires the assessed source to be that default-branch commit. The snapshot records "source commit, source cleanliness/diff digest" (shared-audit.md:188), and the pre-apply check only stops when "material inputs changed" (shared-audit.md:212-213). So FIXED/MOOT verdicts made against a feature branch or uncommitted source could be applied or committed to the default-branch ledger, which is the false-fixed outcome AC-03 is meant to prevent. AC-01's isolation scenario (shared-audit.md:480) covers only the commit's branch/base/path scope.
PROPOSAL: State where an applied but uncommitted reverify/full update lands. For example, use the same owned ledger worktree, or the invoking checkout only when it is a clean default-branch checkout of the assessed commit, and otherwise keep a private proposal and a handoff. Require the assessed source to be clean committed source at the ledger base before any ledger application or commit. Add AC-01/AC-03 cases for `ledger-update` without `ledger-commit` from an unrelated feature checkout or dirty main, and for verdicts assessed on non-default or dirty source.

## Sources

- [Feature document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): separate child, committed review, owner acceptance and status gates.
- [Feature delivery conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): default-branch documentation, implementation claim, exact publication and consumer ordering.
- [Documentation conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/documentation.md) and [humanize prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): grounded prose and one canonical feature document.
- [Parent migration roadmap](shared-workflow-migration.md): audit selection, retained local policy and deferred sibling capabilities.
- Stackweaver `agents/codebase-audit.md` at `0ae15a9d`, `Codebase Audit Agent`, `Mode selection`, `Verify` and `Ship`: existing behavior and explicit conditional-merge rule. Local inspection only; no private findings copied.
- Stackweaver `.claude/commands/audit.md` and `CLAUDE.md` at `0ae15a9d`: command/model/arguments, constitution, worktree/data constraints and shipping requirements.
