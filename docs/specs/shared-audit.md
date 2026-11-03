---
status: in-progress
branch: feat/shared-audit
status_description: "Owner accepted fresh R-18 on 2026-11-03; the revision re-entered implementation through its existing published claim. YAML/offline/recovery work and fresh verification are in progress. Marketplace publication and consumer cutover remain pending."
issue: https://github.com/michielvha/vh-adlc/issues/40
goal: "Run persistent codebase audits through a harness-agnostic vh-adlc operation while each consumer retains its ledger, product knowledge and delivery policy."
covers:
  - plugins/vh-adlc/skills/vh-adlc-audit/
  - plugins/vh-adlc/references/audit.md
  - plugins/vh-adlc/references/audit-settings.md
  - plugins/vh-adlc/references/audit-record.md
  - plugins/vh-adlc/references/audit-review.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/scripts/audit/
  - plugins/vh-adlc/scripts/settings-file.ts
  - plugins/vh-adlc/scripts/triage/settings.ts
  - plugins/vh-adlc/scripts/maintenance/journal.ts
  - plugins/vh-adlc/scripts/maintenance/authority.ts
  - plugins/vh-adlc/scripts/ensure-vh-adlc.sh
  - plugins/vh-adlc/vh-adlc.lock.json
  - plugins/vh-adlc/examples/audit/
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tests/vh-adlc/audit/
  - tests/vh-adlc/evidence/shared-audit/
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

Revision summary: audit still checks software for bugs, security and reliability problems, retains
findings, re-verifies them and handles selected repairs. This revision changes its human-written
settings to YAML through the strict reader already on shared main. Stackweaver keeps its ledger,
local operating rules and `/audit` command. Audit's candidate becomes plugin 0.8.0 because 0.7.0
already belongs to the YAML triage/maintenance release. The owner accepted the reviewed revision
on 2026-11-03; implementation has resumed on the existing branch. The owner has now selected separate feature/PR routing for migration-bearing
or intentionally behavior-changing findings; the feature merge stays with the owner.

The owner selected audit after maintenance on 2026-11-01 and requested the extraction end to end.
The parent [migration roadmap](shared-workflow-migration.md), row D-02, identifies persistent
codebase audit as the next candidate. This child owns its scope, tests and Stackweaver migration.
Documentation workflows and domain agents remain separate future decisions.

At original authoring, shared main was `fcf7cd51ba764d43467a81e7984772f4d8598e40`. Inspection of
`plugins/vh-adlc/plugin.json` then reported plugin 0.6.0; `rg --files plugins/vh-adlc/skills` has eleven
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

At original authoring, conventions resolved through the verified binary to `vhco-pro/docs@e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a`
from repository AGENTS.md. `find --slug shared-audit` returned no document; GitHub title search
returned no audit issue. This is a new child, not a revision of maintenance.

The owner accepted the three summarized R-1 policy recommendations on 2026-11-01: retain
Stackweaver's adopted local automation, allow contract-restoring bounded audit repairs, and use one
record/final-head review per compatible selected batch. The owner separately required documentation
publication to wait until spec acceptance. These decisions are folded into Design/Test Plan below;
they are not acceptance of the not-yet-refreshed reviewed spec.


Implementation sequencing correction: the first settings commit `90b2416` was created after its
focused settings pass but despite the existing package checker rejecting the missing candidate
version bump. A shell sequence did not stop after a failed metadata assertion. T3 remained unchecked;
no feature code was pushed. T26 moves the already-required coherent version bump forward, keeps the
failed checker log, and requires the passing package/settings rerun before T3 completion.

T5 measured the actual legacy table shape: recorded status markers are appended in its Title
column, and four first-column ID ranges compress historical findings. Synthetic public controls
cover those shapes. Inventory expands the reserved range IDs only as aggregate/incomplete entries;
it does not invent per-member evidence or rewrite the private ledger. The read-only observed hash
remains the original `c0eb6250` value, and ordinary ID allocation advances to AUD-160.

The isolated Stackweaver migration reconciled current remote main `5065633399ffdbec6a891e352f1694354ffebf18`
with local merge `d9447729`; all five bound legacy policy/command objects remain unchanged from
the original map baseline. T16 contracts observed the intended shared-route red (2 pass, 41 fail),
and their test-only commit initially hit stale current-main visual evidence for CookieConsent/PublicNav.
The owner authorized a separate correction. Published baseline `fe7592f0f697a66efa0d324439fcf5f0caf357d7`
regenerated all 54 captures at the exact pinned profile; every PNG remained byte-identical, and only
three manifest input bindings changed. All four normal host hooks passed with no skips. The isolated
migration merged that baseline as `bd0ee992`, preserving all seven owned drafts by hash. No docs
workflow logic or product source changed. The real ledger
retains its original hash. The pre-existing maintenance preservation guard predated SEO; its fixture now compares unrelated
current workflows against reconciled default and excludes only the separate audit runtime paths.
Maintenance runtime instructions/settings remain unchanged.

The actual consumer Git transport includes a public owner-login HTTPS prefix. T27 adds only that
bounded audit identity normalization: repository/hostname remain origin-bound, other userinfo and
credential-bearing forms stay rejected, and neither the configured transport nor older helpers change.

Implementation progress review R1: actual Copilot `claude-opus-5.5` reviewed committed source `20ff2fd12ddb809ada523f08e8313899e4cc905a` and found eight defects, including comparison/next-baseline conflation and missing committed-ledger candidate binding. T29-T33 track the corrections before remaining acceptance. The native response and records are retained verbatim; its extra no-op shell command and leading process note are recorded as procedural/format deviations. This is not a clean final criterion review. Native candidate installs and the 15-case/nine-route read-only model trial pass; the two-member authored trial's independent review has correctly blocked incomplete record/candidate evidence and is still being corrected. No source criterion is inferred complete.

Implementation progress review R2: actual Copilot `claude-opus-5.5` reviewed `a6c4f282e056c9e8d96cddc8632ccddab891a46f` and returned five should-fix defects plus a documentation nit. T34-T37 cover Markdown body/title preservation, explicit authored green evidence, clean isolated default assessment, the remaining intake authority contradiction and current compatibility wording. The full plugin run at that committed payload passes 852 tests/3274 assertions; the review found gaps beyond those tests. Native candidate reinstall also passes at that payload. An actual two-fresh-context recovery trial records one local commit, one real disposable squash, two synthetic resources each cleaned once and zero pending intents/retries. These are synthetic/local results, not product compatibility or final acceptance.

Implementation progress review R3: actual Copilot `claude-opus-5.5` read the complete required public packet at `98d05358cd4fee724fe0e4b094337191c7077f6e` with verified exclusive read-only tools. It found five should-fix defects: Markdown visibility/index selection, author-controlled default scope, missing resource-journal completion gates and dropped apply restrictions. T41-T44 cover them. The full suite at that target passed 864 tests/3312 assertions; these are additional counterexamples beyond the green suite. The actual authored two-finding trial now has a clean independent R7 at `09bbd235` and passes the strengthened current batch helper, including append-only bookkeeping. Its failed record/packet iterations remain retained, not relabelled clean. No source criterion is inferred complete.

Historical local validation at `c98a6e42`: all 967 plugin tests/3600 assertions and eight required Go,
module, lint, workflow and secondary-plugin checks pass. The exact local-catalog payload passes native
Codex/Claude installation/reinstallation and all 78 consumer/preserved-route tests. Actual Copilot
trials pass the policy-change observation/retirement case with one disposable squash and zero replay,
and ten corrected consumer report/delivery cases. These are local/synthetic results, not marketplace
or real Claude-model acceptance. Public R9 found an unchanged-status provenance omission (T81) and
a declined-intent retention documentation gap (T82). Private R5 found the post-publication follow-up
sequence incomplete (T83). The full returned reviews remain in the local archive. Q1 is still pending. The committed follow-up rerun now has 79 passing consumer checks and all five
normal hooks, with no skips.

Published shared main `aa5c66e7` was merged locally as `3f4cd78`, preserving the YAML settings release,
new conventions pin and unrelated feature documents. Its accepted YAML feature explicitly requires
an audit-spec revision before audit's settings move; no settings conversion or feature publication
is inferred from this merge. Earlier test/review targets remain exact historical evidence.

Post-integration validation at `dd878483`: all 371 focused audit tests/987 assertions pass, all
79 committed consumer and retained-route checks pass, and the eight required Go/module/lint/workflow
and secondary-plugin gates pass. The complete shared suite has 1004 passes and one failure
(`full-bun-r12.log`): main now also uses plugin 0.7.0, so its package-version-change control refuses
the colliding audit candidate. Version reservation is retained under T89 and the later native/minimum checks under T88;
the proposed YAML loader is still unimplemented pending revised acceptance. The real ledger retains
SHA-256 `c0eb6250334fbb592ed955c595b24aea2d796f5c1c7b5279672e26065807d769`.
Actual Copilot spec R-13 and bounded private parity R6 targeted shared `dd878483` and consumer
`4772ade58091e342b7c3666a197fa318195260eb`. Both returned the requested actual model with complete
required reads and exclusive read-only tools. R-13's nine records are preserved verbatim below;
its technical design clarifications preserve the already-required full validation, read-only/cache
and scoped recovery rules. No new execution/network grant is introduced. Private R6 found remaining
provenance wording, transient summary text and rebased-run identity gaps, tracked under T91. Q1
remains the owner product-policy decision; the revised spec is not accepted.

The consumer's separately published YAML triage/maintenance changes advanced default during the
last check. The retained guards correctly refused unrelated drift and the stale candidate default
(`T91-consumer-committed-green.log`: 77 pass, 3 fail; the filename is historical, not a pass claim).
Local merge `222223dd9eb761f956eef4543a15c2b8766c3a9c` reconciles those paths and both changelog
histories. The maintenance guard keeps upstream's frozen YAML baseline, excludes only the separately
tested audit routes and checks current triage entries unchanged. All 81 audit/retained-route checks
now pass (`consumer-source-r15.log`). The merge's normal hooks passed five checks and explicitly
skipped frontend checks because this isolated worktree has no frontend/node_modules; that is not a
frontend pass. The real ledger hash remains unchanged. The running bounded parity review targets
pre-merge `08c0425f`; no final consumer cutover review is inferred from that diagnostic snapshot.

R-14's first return had title suffixes on its finding IDs, which the feature linter refused.
Actual Copilot Opus reissued all seven findings in valid identifier format without changing any
other content (`spec-r14-format`); the original return remains archived. The corrected records
are preserved below. Private R7's read-only/model checks passed but full-line coverage failed for
one required input, so it receives no complete parity/acceptance credit. Its observed findings
still identify corrections. Private R7 independently found the same
rebuilt-record gap and additionally required fresh red observations on rebased pre-fix commits and
an explicit pre-publication re-ground route. The revision adds skill-level offline proof, an actual
cutover registry gate and rebuilt-record/red-evidence controls. Q1 remains unanswered. T91 also
changed package content before reserving 0.8.0, while the known colliding-version check was still
red; nothing was published. T89 must cover the entire package diff, including T91, before further
package implementation. This ordering failure is retained alongside the earlier `90b2416` failure.

The corrected draft at `5ed104cd14ace9ffab4174543b8e53ee75d9e2b6` passes all 371 focused audit
checks/988 assertions with source/index/refs preserved (`revision-r15-prepared/input/execution.json`).
Its lint and the actual reissued R-14 record check pass. The binary's next operation is owner decision
because Q1 is unanswered. The next full spec review waits for that route choice so the decision and
YAML corrections can be reviewed together; no R-15 review or revised acceptance is claimed. YAML
implementation, version reservation, final complete gates, actual marketplace tests and cutover
remain pending. Both owning worktrees are clean at their recorded local commits.

On 2026-11-03 the owner answered Q1 with "Do the recommended continue": migration-bearing or
intentionally behavior-changing findings leave the audit repair route for a separately specified
feature and PR. That feature uses its own acceptance and delivery gates, and the owner merges it.
The decision authorizes this route correction and continued review; it does not count as revised
YAML-spec acceptance, a feature delivery or permission to perform real product remediation.
Historical paragraphs and returned reviews above/below retain their then-pending Q1 state.
T94 implements the local parity/selection wording once this revision is accepted.

R-15 returned six records at `24831961`; they remain verbatim below. Its five should-fix gaps
are addressed in the draft's intake/offline proof, observed locked-runtime flag citation, all-kind
cutover inspection, complete shared/consumer routing task and user-guide package checks. T75's
completed non-route conditions are separated from T94. No YAML implementation or clean R-16 review
is claimed by these specification corrections.

R-16 originally omitted one historical-review line. The same independent reviewer context read it
and reissued its complete three findings. Original/continuation transcripts, unchanged controls,
session identity and combined full-line coverage are retained (`spec-r16-completed`). The triage
trial grader's unconditional resume rejection remains recorded and unchanged; this was a canonical
procedural spec-review continuation, not a resumed triage acceptance trial. All R-16 records below
are the actual reissued records. Its remaining cache/absence clarifications are now normative tasks.
The r4 native cold/partial/warm proof was recorded first and is superseded by the committed r5
proof under tests/vh-adlc/evidence/shared-audit (expected/actual lock digest and isolated PATH copy);
the earlier incomplete evidence attempts remain archived, including null-report handling in r2.

R-17's four actual records are preserved below. The draft now specifies the recorder's exact
identity source and single-event append exception, uses only typed retained-absence markers,
and declares the setup/entry page set through normalized knowledge_pages. The richer r5 native
proof records expected/actual lock digests and their comparison, exact cache setup and full isolated
environment; all cold/partial/warm cases pass. Earlier attempts remain archived. No YAML runtime
implementation, field adoption or clean R-18 review is claimed by these spec corrections.

R-18 at `e471cf650f687c677b0e6fcd5d4e8709b0623d15` has no blocking or should-fix findings.
Its two actual nits remain verbatim below. F-01 is resolved by T96's setup/conversion-time check
against declared local obligations: entry uses only the normalized list and performs no language
inference. This satisfies the existing requirement that obligations be declared before entry.
F-02's historical r4 label is corrected here; the committed native proof is r5. These Context/Tasks
changes do not alter the reviewed normative baseline. Revised owner acceptance is still pending;
no YAML implementation, source-completion, marketplace or migration acceptance is claimed.

### Earlier accepted R-12 review and implementation obligation

Actual Copilot `claude-opus-5.5` R-12 reviewed `67a91a17944bb219ce956364963531532577c396`
with no blocking findings and one should-fix recommendation about the post-merge outcome artifact.
T11 implements this structurally and retains synthetic lost-acknowledgement recovery evidence.
Actual model recovery and final criterion review remain T22/T25; AC-04 is still unchecked.
Its required behavior remains:
use the existing private run journal/external run directory for the durable observed merge outcome,
with optional deduplicated workstream-issue updates only under the existing `issue-write` scope.
Do not invent an additional default-branch commit/push, which the existing grant does not authorize.
The implementation must demonstrate lost squash-merge acknowledgement followed by a fresh-context
reconciliation that discovers the actual merge, records the outcome once and makes no ungranted write.
If a later status session lacks the local artifact, it must consult available recorded PR/issue
observations or report unknown, not repeat a merge from the absence of a receipt. The exact artifact
path and schema are implementation details under the existing private record/recovery behavior;
required recovery evidence must be observed before AC-04 or the feature can be marked complete.

The owner-facing purpose is software bug/security/reliability auditing with persistent finding
history, re-verification and selected repairs. This extraction moves the reusable procedure and
retains Stackweaver's ledger and product-specific rules; it performs no real product audit or fix.
The owner accepted the summarized reviewed spec on 2026-11-02 and explicitly authorized publication
of its documentation, tracking issue and implementation claim, followed by implementation. The R-12
recovery obligation remains required; no implementation or runtime verification is claimed by acceptance.

Independent public-only implementation review R4 at `2368bea6b28679f7ec3de51ed4077e360fe8d3dd`
returned two should-fix findings and two nits. Its actual Opus identity, exclusive read-only tools,
complete required-page reads and native exit passed. The raw return remains in the local review
archive. T45-T48 track inline-comment rendering, original resource-journal root binding, malformed
comparison values and explicit fix Scope baseline. No accepted criterion or normative requirement
was weakened. The full plugin attempt at that target was interrupted after unrelated triage timeouts
under severe disk load; required Go/module/lint/workflow and secondary-plugin checks passed.
Native candidate installations and actual model behavior/recovery trials passed at that recorded target.
The consumer reconciled current default `7428e487` into local migration commit `9c773752`; all 58
audit and preserved-route tests passed and the real ledger checksum stayed unchanged. Private
semantic parity review still requires its separate payload approval. Feature publication stays pending.

Public implementation progress review R5 at `bff70effa6a7cefa34326586264ce1a2a001b158`
returned resource-reselection/restart, Markdown boundary and committed-history validation gaps.
T50-T52 track them. The separately renderer-confirmed backtick-info defect is already corrected
under T49 at `99d105e0`. The complete plugin suite there passes 902 tests/3399 assertions using
owned RAM-backed fixtures with unchanged deadlines. Native candidate installs and final-helper
repair validation also pass. Actual recovery still records one commit, one squash and exactly two
resource cleanups. A later allocation-only model response used nonterminal STILL_PRESENT rather
than the oracle's UNKNOWN; its native failure remains retained and T53 requires a justified,
independently reviewed correction rather than a fabricated pass.

The owner separately approved the bounded private audit workflow review on 2026-11-03. Its first
actual Opus pass at shared `99d105e0` and consumer `721fac53` found substantive retained-policy,
ledger-maintenance and rollback gaps tracked in T54-T61. The return and private packet remain
local; the packet excludes the real ledger, application source, tracker data, credentials and host
configuration and passed its secret scan. The first pass missed two required complete duplicate-file
reads, so it is not a clean acceptance review. All findings still require correction and a complete
fresh paired review. The accepted normative spec and every criterion remain unchanged/unchecked.

The refreshed bounded private parity review R2 read every required legacy/current workflow file
at shared `54970ea` and consumer `1eee1199`. It returned retained-policy and migration issues, not
a clean acceptance. T62-T66 track scope recovery, explicit consumer verification/merge conditions,
record metadata, fixture prerequisites, pending-report policy and rollback-test state. The raw
private findings stay local. The accepted Design requires preserving existing finding content and anchors while adding dated
evidence. The implementation places new markers below unchanged headings to satisfy that constraint;
local wording must consistently distinguish current evidence from historical heading annotations.

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

The audit intake predicate is explicit persistent source-audit intent: a named `/audit` or
`vh-adlc-audit` mode, a request to maintain/reverify the audit findings ledger, a full source audit
with persistent findings, or a selected audit-finding repair. A configured ledger is not permission
to take over every security request, and configuration is not a precondition for routing an explicit
audit request. Explicit audit intent without required configuration gets the documented onboarding
handoff; it does not invent settings, silently create a ledger or fall through to another operation.

Dependency/bot/advisory/alert security sweeps keep the maintenance route; a concrete observed failure
or one-off source investigation without persistent-audit intent keeps investigation; issue/backlog
prioritization keeps triage. These rules apply even when audit settings exist. For ambiguous wording
such as "check our vulnerabilities" or "audit security", ask one focused scope question distinguishing
persistent source/ledger audit, dependency/advisory sweep and diagnosis; inspect independent context
read-only while waiting. A request like "audit the code for security issues" is not silently promoted
to the expensive full-audit mode: clarify persistent/full scope unless the request already gives it.
Route tests cover positive explicit audit requests with/without config, ordinary ledger requests,
maintenance security sweeps, diagnosis, triage and ambiguous wording; configuration alone must never
change those negative routes. Shared intake creates no additional mode or effect permission.

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
  decisions, write and observe a failing regression first for an actual reproducible repair, repair
  the root cause and verify the required ladder. Re-grounded non-repair members follow the explicit
  stale-selection classification below and never get an invented failure. A scope change or next workstream needs the consumer's existing selection boundary.
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
For these two audit roles, ordinary non-forced cleanup may remove only a clean owned worktree
whose artifact/evidence/ledger outcome has been retained, published or explicitly superseded safely.
Keep pending or private ledger commits and required evidence refs. Keep a ref when ordinary branch
deletion refuses after squash; no force deletion, pruning, reset or unrelated worktree cleanup is
inferred. Record retained paths/refs and the owner handoff instead of silently discarding them.

That ledger commit stays local: reverify/full has no standing push permission. A current explicit
request can separately publish it through the consumer's normal delivery route, otherwise it is not
advertised as remote history. If the owner then selects fixes from that same report, the new repair
worktree may start at the recorded ledger commit only when its parent is the still-current fetched
default base and its delta contains exactly the owned permitted ledger/index paths. Record that
ledger commit as Task base before authored repairs; its known report update is part of the selected
batch's later reviewed publication scope only when the current owner selection explicitly includes
that known report/ledger commit and its full ID scope as presented in the selection summary. Selecting
a fix without that shown inclusion grants no publication of the separate reverify/full report.
Absent inclusion, retain the ledger ref privately and start the repair from fetched default source
with only the selected finding updates, or get the missing scope approval; do not silently carry it.
If default source, ledger or policy advanced, reconcile and re-assess against the new base first;
never carry stale verdicts onto the new branch. A generic
consumer missing ledger-commit permission keeps its report external. Tests inspect the true commit
branch/base/path set and cover an unrelated feature checkout, dirty main, unpublished local ledger
commit followed by selected fixes, newer default source and conflicting ledger bytes.

Parallel specialist work is optional. Use equivalent tools and sequential collection where suitable.
A second assessment must actually be independent of its producer before counting as an adversarial
check. If that capability is unavailable, preserve the proposed result as provisional and identify
what cannot be concluded; never call the same context an independent reviewer.

### Consumer settings and format preservation

Audit configuration uses `.yaml` through the existing operation-neutral reader in
`scripts/settings-file.ts` and the plugin's verified `vh-adlc settings read` binary. Reuse the strict
YAML profile, then the full audit schema validator. Refuse `.vh-adlc/audit.json` and `.yml` leftovers,
even with an explicit settings path. No fallback defaults or automatic conversion. Generated
snapshots, records and transport JSON keep their format; examples use commented block YAML.

Audit settings reads, including status and read-only/no-write/no-fetch requests, use the verified
binary in offline mode. They never bootstrap a download or create its cache. Extend the shared
reader with an optional offline mode for audit while preserving triage/maintenance's existing
behavior. The audit skill's first step overrides the loop's online installer for every audit
invocation: run `ensure-vh-adlc.sh --offline`, read only the validated settings metadata needed to obtain
its normalized `knowledge_pages`, then run `vh-adlc knowledge --offline` for that exact set before
any audit work. This settings-metadata read is the narrow bootstrap exception to the loop's
knowledge-first order. Missing binary, configuration or cached pages gets a prerequisite/onboarding
handoff and no audit action. It must not fall back to online setup or a
knowledge fetch, including before status/read-only/no-fetch parsing. Document this audit-specific
route in SKILL.md and loop.md while preserving other operations. Generic lifecycle intake must
identify audit intent before its installer/knowledge step and take this same offline path before
routing. If intent is ambiguous, defer bootstrap and resolve the scope using the request/local
read-only evidence first; do not invoke an online installer before knowing the route. Clear non-audit
requests keep their normal authorized behavior. Cover this in lifecycle.md as well as the direct skill. A missing or invalid cached/PATH
binary or unavailable cached conventions is a visible prerequisite failure. The flag exists in the
locked v0.9.0 binary: `cmd/vh-adlc/main.go:164` registers cache-only `--offline`, and
`internal/knowledge/knowledge.go:215-223` reads cached pages before refusing a network miss.
Actual v0.9.0 runs with fully recorded isolated HOME/XDG/PATH and a rejecting local proxy observe
warm `answered`, cold/partial-cache `unreachable` (exit 5), zero requests and unchanged home/cache,
without a docs-source override. The warm case seeds all six pages; the partial case seeds five
and deliberately omits humanize-prose. Each seeded page records its exact pinned Git blob/hash;
`tests/vh-adlc/evidence/shared-audit/offline-knowledge/result.json` and its native outputs retain
the environment, setup and proxy observations, plus the lock's expected binary digest, observed
digest and equality result. Verification first used the host installer's existing cache, then copied
the exact binary into the isolated PATH; this is not an isolated native-install result. The current
r5 fixture prefix matches that run; the earlier r4 proof used an r2-named scratch prefix. The child inherits no base environment or credentials. The pinned runtime needs no new binary change
or release for this flag. Explicit setup installs the locked binary through the ordinary verified installer, then resolves
and seeds every audit-required and applicable language page for the consumer-resolved docs revision.
Use an observed online `vh-adlc knowledge --repo <consumer> --plugin-pin <pin> --page ...` call,
or equivalent exact pinned-Git-blob cache seeding with page/hash provenance. Record the resolved
revision/page set and both binary and docs setup; stop on any missing page. This setup may download
and write its private caches. It is separate from audit invocation and never borrowed from status. Neither successful nor refused settings reads create a ledger, journal,
worktree or action grant, or change source/index/refs. Do not expose refused file contents.

Committed-policy and candidate inspections read the exact YAML blob and run the same complete
schema validation, resolving referenced paths as regular files in that same Git commit, including
symlink/traversal checks. Bind the actual origin as before. Compare the YAML bytes exactly with the
configured working-tree file and compare every validated setting; semantic equality alone never
substitutes for the reviewed bytes. Check committed `.json`/`.yml` leftovers from the Git tree even
when absent in the checkout. A stale AGENTS link to JSON returns invalid/unadopted/no grant with
`settings-link-stale`; a committed alternate suffix returns the same flags with
`settings-suffix-conflict`. Candidate inspection always remains unadopted. Missing/unverified
reader and refused YAML are separately visible as `settings-reader-unavailable` and
`settings-reader-refused`, not a generic origin/declaration error. These cases fail closed on both
adopted and candidate paths; no network bootstrap or synthetic action request repairs them.

Isolated native/helper/example/actual-model trials explicitly provision the exact locked verified
binary and the complete pinned docs page set into their own cache/PATH. Record the binary digest,
version, resolved docs revision and exact page-set setup. Never copy host credentials or configuration.
Verify the binary against its independent pin and each seeded page against its recorded Git blob/hash. Exercise a complete cached success plus empty-cache and partial-page-set offline failures with
network/cache-write sentinels; retain native exits and explicit setup observations. Sentinels cover audit-owned bootstrap/download/docs-cache work;
the host harness's model transport and session bookkeeping are recorded separately. Actual model
entry planning and the bounded bootstrap executor remain distinct observations; do not claim the
model provider is offline or treat host session logging as an audit cache write.
This follows the configuration rule at `vhco-pro/docs@0e52f51`, shared main's strict reader and
`docs/specs/yaml-settings.md:112-125`.

The optional YAML `knowledge_pages` field declares additional pinned engineering pages. The
normalized `settings` helper output always contains the deterministic effective list: the five
mandatory audit pages (feature-documents, coding, documentation, delivery and humanize-prose), then
the configured additional pages in their declared order. Reject duplicate, absolute, URL, traversal
or non-Markdown page paths. Default additional pages are empty. Setup and both direct/intake entry
use that same normalized list; language pages are never guessed per invocation. Any independently
required local language page must be declared before entry, otherwise report a setup/config mismatch.
An unseeded or partially seeded set fails visibly without download or silent omission.
Stackweaver declares its existing Go, TypeScript and React conventions explicitly. The synthetic
TypeScript example declares TypeScript. This makes seeded/requested page equality observable; the
native binary flag proof above is a generic six-page exercise, not the later declared-page audit
entry or Stackweaver acceptance trial.

Use strict schema-versioned `.vh-adlc/audit.yaml`, bound to the actual Git origin (repository and
hostname), with repository-relative ledger and project-procedure paths, ID prefix and Markdown
profile options. Reject unknown fields, mismatched origin, traversal, symlink escape and unsupported
profiles. Missing required configuration is an onboarding handoff, not permission to invent a ledger.
Standalone adopters receive a complete synthetic example that explains how to create their own
ledger/settings; it references no personal host paths or private configuration. Store complete
copyable files under `plugins/vh-adlc/examples/audit/basic/`: `.vh-adlc/audit.yaml`, `docs/audit.md`
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
red/green, consumer-mandated checks and current independent audit batch review under
`references/audit-review.md`, or the applicable feature implementation review.
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

Before any permitted live-test key or test-row creation, persist an action intent in the owned
private run journal under the external report directory, with run/action ID, actual repository and
development target, actor/owner/org scope, resource kind, unique correlation/name scope and the
committed policy's exact cleanup-method reference. Use a private directory/file (0700/0600), reject
symlink/foreign ownership conflicts and bind entries to this batch and verification policy. These
are non-secret ownership identifiers; tokens, secret values, connection strings and response bodies
containing them must never enter the journal, committed record or transcripts. Keep transient key
values only in the runtime's protected in-memory use scope.

If a server chooses the final resource ID, persist the unique correlation scope before creation and
append the returned ID after success. A lost creation response must be reconciled by the authorized
consumer lookup of that exact owner/target/correlation scope; do not blindly create a second key or
record. Pending intents remain durable until actual revocation/row-scoped cleanup is observed, or
an explicit unresolved handoff is recorded. No journal string is an executable cleanup command;
resolve its method against the current authorized policy and exact owned resource scope.

On success and on fresh-context resume, inspect pending resources before restarting live verification.
With current cleanup authority and matching target/ownership, revoke any owned temporary key and
clean only its recorded owned test rows, then confirm absence and record completion. If cleanup
already happened but its acknowledgement was lost, observe absence and reconcile rather than repeat
creation or claim an unobserved deletion. If authority/access is denied, ownership is ambiguous,
the target changed or absence cannot be established, preserve the intent, report the specific cleanup
handoff and block another live attempt and batch completion; never broaden deletion scope or ignore
current restrictions just to clean up. Retain evidence of any pending resource through Git/worktree
cleanup. This is procedural reconciliation of owned tests, not general credential management.

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
or remote action. Ineligible work must enter the separate accepted feature and PR route with owner merge; `fix` cannot bypass it.
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
feature loop as a separately specified feature and PR, with its own acceptance/delivery gates
and owner-performed merge. Such a member cannot stay in an audit PR through a planning exception.
Keep it visible in the audit selection/report and obtain an explicit replacement batch selection
before continuing the remaining repairs; never drop, replace or silently treat it as complete.
This applies to Stackweaver too, replacing its legacy owner-only in-batch exception by the owner's
2026-11-03 decision. A visible correction that restores the existing contract can still be a bounded
repair; retained local ask-before-fix and owner-only merge conditions for those repairs still apply.
Ambiguous intent stops for clarification.
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
member cannot inherit a later member's pass. Mixed incompatible work requires the separate feature and PR route with owner merge, retained visibility and explicit audit-batch reselection.
Neither record nor review grants remote authority or weakens consumer checks.

Before freezing the batch Definition, re-ground each resolved selected ID and classify its disposition.
A reproducible defect/residual becomes an `authored-repair` member with red/green and required final
checks; PARTIAL findings scope only their confirmed remaining defect. An already FIXED or genuinely
MOOT member becomes `assessment-only`: no source repair/repair commit and no invented failing test.
Any terminal observation still requires current source/scenario evidence and independent adversarial
challenge under the reverify rules. A failure that cannot be reproduced or explained becomes an
assessment-only UNKNOWN/PARTIAL result, with its actual missing access/check/residual; it is not fixed.

Keep every original selected ID and its disposition/outcome in the record. An assessment-only row
is not silently removed or counted as an authored repair, and its required checks come from its
actual disposition plus retained consumer rules. No required live check is waived just because there
was no new source edit. A missing required check or unresolved member prevents the requested whole
batch from being called complete or merged, unless the owner resolves/reselects that scope through
the existing boundary. Do not add replacement IDs, change workstreams or remove unresolved members
after selection without that boundary. Already-resolved members may be reported and the remaining
originally selected compatible repairs may proceed, with final completion checking each disposition.
If all selected members need no repair, report the assessment/authorized ledger proposal and stop;
create no empty repair PR or implied ledger-only remote permission. The owner can separately select
ledger publication or another fix. Review all candidate ledger changes, including assessment-only
observations, in the full publication diff before any authorized mixed batch delivery.

`references/audit-record.md` is the explicit audit batch template, retaining the common maintenance
Definition/Evidence/Reviews/State sections and their freshness semantics. Its Definition records:
repository and task base, selected workstream/run ID and exact finding IDs/coupled bundles with authored-repair/assessment-only dispositions, requested
outcome, fetched default-ancestor Scope baseline distinct from any local Task base, carried ledger commit/path/ID scope and its inclusion authority, cited pre-existing contract for each member, per-member repair eligibility and owner-decision
boundaries, preserved contract, affected source/test/config paths, verification inputs, proposed
repair and each member's required checks/pass conditions. Record the ledger/settings/procedure
bindings and the current selected-delivery permission separately from technical repair eligibility.
The record remains on the selected source branch for this ordinary audit route; no external evidence
ref/paired-record variant is introduced by this extraction.

Its Evidence has one row/section per member: disposition, finding/scenario and current source symbols;
for authored repairs, pre-fix commit and observed failing regression, repair commit; for assessment-only
members, actual current assessment/challenge and why no repair/red failure exists; green/current required check commands and
results against the final batch target, live-gate or explicitly permitted unreachable-path residual,
verification-input bindings, and unresolved siblings or other residuals. Red evidence retains its
real pre-fix target; it is never relabeled as a failure on the fixed head. Every member's final
required checks must actually establish that member at the final head. Record the batch's exact
review target and preserve older checks/reviews rather than rebinding them to a newer commit.

Dispatch the independent batch review with `references/audit-review.md`, the batch repository,
exact final source commit, committed record path/Definition, selected scope, docs revision and shared
review protocol. The audit-specific reviewer checks the accepted restoration classification against
the cited existing contract, complete Definition membership/couplings, and the entire proposed
publication diff from the fetched default-ancestor Scope baseline to the final review target. That
range includes any carried ledger-only commit; Task base marks the post-ledger point for attributing
authored repair/red evidence and must not hide earlier changes from review. Enumerate carried ledger
commits, paths/IDs and their report/snapshot/evidence bindings in the Definition alongside selected
repair IDs. Verify their current owner-approved inclusion and all carried findings' recorded evidence,
including independent challenges for carried terminal verdicts. Preserve the original source/date of
historical reverify observations instead of relabeling them as verified on the later repair head.
Every selected authored-repair member still requires its own red/green and final-target evidence; assessment-only members require their disposition-specific source/challenge/check evidence and cannot inherit a repair member's pass. Also inspect
live-gate/residual conditions, stale bindings and unrelated-state preservation. It may reuse operation-neutral review protocol/model/isolation rules,
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

Freeze the product/source/test/config edits before final ledger/record finalization. Record that
real commit as `source_target`: it is the fix-batch ledger's `Verified source`, not a placeholder or
the not-yet-created final review commit. The final ledger/index/record-only commit may then name
source_target without self-reference. It stays on the same batch branch in addition to per-finding
commits and uses the existing mixed-code-push CI rule, not a skip marker that suppresses that batch.

The independent audit reviewer compares source_target to the final committed review target and
requires that their diff changes only the exact Definition-declared ledger/index/record paths;
production source, tests, config and all other verification inputs must be unchanged. Actual final
required checks still target the final review head; the validated unchanged product/test/config
objects bind that evidence to the named Verified source. Record both actual targets, not a new
execution on the earlier SHA. A later source/test/config change requires a new source_target,
regenerated candidate and fresh review. A placeholder, a pre-fix Verified source, an extra changed
input outside that narrow metadata set or a post-review placeholder replacement prevents a clean
or current review. This equivalence is checked from Git objects, not the record's assertion.

Separate the delta-scoping baseline from the verified source target. Every new dated ledger update
records a `Scope baseline` equal to the fetched default-branch ancestor at the start of its assessment
or fix batch, plus its batch/run reference and the real `Verified source` commit. For a fix batch that
starts from an unpublished ledger-only commit, that local Task base is not the Scope baseline: retain
the fetched default ancestor beneath it. The audit record/snapshot preserves both fields and their
meanings. The verified source/review/repair commits are honest pre-merge evidence targets; do not
rename them to the later squash commit or claim the older Scope baseline contains the fixes.

A conditional squash merge carries the record and ledger to main while the Scope baseline remains
an ancestor of that main history, even after deleting the feature branch. Retain the actual merge
outcome in the batch's durable outcome record after observing it; that append does not require
rewriting ledger statuses just to substitute the merge SHA. Earlier source targets can be retained
as provenance even when their branch is gone. No later delta-scoping operation depends on those
unreachable pre-squash targets. Published ledger notes preserve the consumer's format while naming
both scope and verification targets explicitly.

Before using any recorded baseline, including legacy banners with only one SHA, resolve the commit
and test whether it is an ancestor of the currently assessed source. Missing, shallow/unavailable,
ambiguous or non-ancestor history means `unscoped`, not an empty/unchanged delta. Record the reason,
re-assess all current selected findings directly from present source, and show the unavailable
change-scan comparison as a coverage gap. Do not mark a finding fixed or skip verification from
that unavailable comparison. Reverify still does not silently enter the separately requested full
new-finding audit mode. After this honest reassessment, a new update uses the current reachable
default ancestor as its next Scope baseline. A dirty/non-default-source assessment still cannot
write the default ledger under the earlier application rule.

If a published batch's default baseline advances, its previous scope-bound journal cannot certify a
rebased batch. A separately owner-approved rewrite starts a new run on the same PR branch, with a
fresh Scope baseline, run ID/journal/record and Task-base ledger from the new default (or a freshly
checked explicitly selected carried report). Before an initial publication, default advancement
also needs a fresh run on a new owned branch, preserving the old branch, or a separately approved
rewrite; never merge default into the repair branch to bypass the ancestry checks. Preserve the exact
selected IDs and reassess them; an already-resolved member becomes assessment-only, with no invented red.

Archive the superseded run's record, reviews and commits in its retained private artifacts/evidence
refs. The rebuilt branch excludes the old run's branch-owned record and its generated-index entry
before the new freeze; never remove an old record already present in the new Task base. Declare
new record/index paths, regenerate indexes and rebuild/freeze source. `batch-check` and review reject
an additional changed audit-batch record for another run even if it is listed in affected_paths;
unchanged historical records already in Task base remain valid history. This prevents a stale
second record from being published as current evidence.

Re-observe every authored member's failing regression at its actual new pre-fix commit on the new
Task base, then observe the same regression green at the final target. Retain old red artifacts as
history; never relabel their SHA or reuse them as the new failure. Regenerate candidate/record and
rerun all checks and independent review. Retain old outcomes/pending-resource records and reconcile
resources before new work. This specifies identity, not permission to rewrite or merge default.

Stackweaver keeps its existing one-branch/one-PR-per-workstream batching, one finding or coupled bundle
per commit, local full verification before one batch push, one tracking issue per workstream and
conditional squash merge after live gates plus green CI. Its detailed step-7 merge rule explicitly
replaces the older human-review stop in its introductory summary. Preserve that rule locally, including
its owner pauses and workstream-boundary selection. Under the owner's route decision above,
a finding that requires a product/data migration or intentional behavior change leaves through the
separate feature/PR route; the legacy ability to retain it in the audit PR is superseded. A local
owner-only merge stop for a visible contract-restoring repair remains in force. A generic adopter inherits none of this conditional merge permission.
The extraction's migration merge follows the owning feature's delivery rules, not an audit-fix squash.
No extraction test may operate on the real Stackweaver stack/database or dependency release pipeline.

### Retained absence observations

Represent a deliberately unperformed non-resource effect with a distinct `retained-absence` journal
event, bound to its durable intent and a private hash-checked read-only lookup artifact showing that
exact effect absent. Bind the observation to repository/host, run/batch, action ID and full intent
digest, with lookup time/method; store no credentials. An unknown result is never absence. This event
is not an outcome, cannot retire the run, and clears no resource or required verification gate.
It fixes the old intent as non-replayable; `recoverEffect` and batch execution readiness must refuse
to execute/reactivate that retained run, including when given an execute callback or later authority.

Recording it needs a current explicit journal-only owner handoff, exact expected journal digest,
exact action ID and `--absence-confirmed true` on a dedicated native command. Validate the complete
request and artifact before writing; `journal-handoff --reason` cannot create this event. It accepts
no key/row intent, unknown lookup, changed intent, mismatched/stale digest, retired run or unsafe root.
Native confirmation is an operator attestation, not an OS-enforced proof boundary.

Before adoption, run the recorder from the owning migration worktree with the strict candidate
YAML settings; after adoption, use the same strict YAML settings from the owning current checkout.
Use them only to establish Git root, actual origin repository/host and actual common Git directory,
checked against the immutable run header and its private registration/header digest. Neither the
candidate declaration nor its changed settings/procedure digests supplies permission for this write.
An old default checkout containing JSON is not parsed as current configuration by this operation.

Read that registered chain in inspect mode. Only the dedicated `retained-absence` append, under the
exact explicit owner journal-only request, bypasses the ordinary `policy_current` and cleanup-only
append restrictions. Validate and serialize its next revision against the supplied expected digest;
normal append paths remain unchanged. This applies before adoption, after adoption and after a
current-policy transition. Return the original policy-current/cleanup-only state without activating
or changing it. The explicit request, not the YAML policy, permits this observation-only mutation. This is the narrow journal-metadata exception needed for format cutover;
it does not activate candidate policy, change effective policy digests, grant cleanup, execution or
old-batch completion, or bypass no-write restrictions. Ordinary `journal-pending` remains read-only.
Read-only lookup and recording are separate steps; no metadata write is inferred from a status call.
The preflight admits readable runs whose only outstanding effects have these typed absence events;
legacy/free-text, unknown or reconciliation-only handoffs without them remain blocked. Retain their
roots and proof. A new intended attempt uses a new run and current selection/authority.

### Stackweaver adapter, parity and rollback

Plugin 0.8.0 is the audit delivery candidate; main's plugin 0.7.0 contains YAML triage and
maintenance but no audit operation. Update both component manifests, audit installation guidance,
consumer minimum version and native acceptance checks consistently. Do not relabel earlier 0.7.0
local audit candidates as published audit releases. The existing runtime lock brought in by main
remains authoritative and separate from plugin versioning.

Convert only audit's hand-written settings and their active references; preserve all validated values
apart from `settings_path` and the new explicitly declared knowledge-page metadata. Compare every
pre-existing validated field unchanged; verify the new effective page list against existing local
language obligations. Keep the parity map, snapshots, receipts and generated evidence as JSON.
Update rollback/reapply manifests and tests for the YAML path without changing the real ledger.
Finish actively executing repair batches and reconcile every pending key/row before cutover.
A run containing only deliberately declined, absent non-resource intents may remain as its retained
handoff and does not block configuration cutover or a later new run. Keep its registered root,
header and proof unchanged. It becomes policy-changed under YAML, stays read-only/unretired and
needs no transition merely to remain retained. Apart from the dedicated observation-only recorder
above, later mutations require the existing explicit current-policy handoff and ordinary append
checks; no observation or transition permits replay. A missing retained root is
unknown and still blocks later admission. Pending resources or unknown registration do block cutover
and new live work until their exact authorized cleanup/handoff is resolved. The actual consumer
cutover preflight inspects that host's common-Git registered audit runs with the current candidate
settings and refuses pending keys/rows, missing/unreadable registered roots or unknown registry state.
The inspection must cover all pending intent kinds, not just registeredPending's key/row list.
An unresolved report/commit/issue/push/PR/merge intent without an observed outcome or a typed `retained-absence`
observation per the section above blocks cutover. An unknown-state handoff is insufficient; retain
a distinguishable absence observation for a deliberately unperformed effect. An ambiguous legacy
handoff remains blocked until a current read-only lookup and the explicit observation-recording
operation above establish that disposition; an arbitrary handoff reason cannot establish it. This check is
mandatory before conversion/adoption merge, not deferred to later live admission. A
retained, readable declined-non-resource-only run does not fail it. Bind the observed inspection to
the current consumer/preflight artifact and rerun it immediately before cutover; this is a local
operator observation, not cross-host or OS-enforced proof. A format/digest change
never carries old action grants, reviews or terminal eligibility forward automatically; no silent
journal reset or deletion.
Re-ground candidate evidence on the new committed settings and compare actual effects unchanged.
The separately owned triage/maintenance YAML adoption stays a prerequisite for a compatible consumer
cutover; do not edit or claim completion of that other feature's work here.

From current remote main create an isolated migration branch. Replace only the reusable audit
procedure with a thin `agents/codebase-audit.md` forwarder and retain Stackweaver specifics in
`agents/audit-project.md` plus `.vh-adlc/audit.yaml`. Update only the audit route in AGENTS.md and
`.claude/commands/audit.md`; preserve the command name, `model: opus` and `$ARGUMENTS`.
No rewrite of the real ledger is part of migration. Existing triage, maintenance, SEO, docs, other
agents, hooks and product paths remain unchanged relative the reconciled current-main baseline.

The first accepted implementation task, before shared helper/procedure or consumer forwarding
changes, creates and commits `tests/agent-audit/parity.json` on the isolated consumer branch. The
populated map lives in Stackweaver rather than being appended to this Design after acceptance.
Its format is `schema_version: 1`, a `legacy` object binding repository, full baseline commit and
source paths with Git blob IDs and SHA-256 bytes, plus a `rows` array. Each row has a stable unique
`id`, `legacy_sources` (path, section/symbol, baseline line range and excerpt digest), required
`behavior`, `home` entries (shared/local path and section), `contracts` (test path and case name),
and `expected_effects` when that row describes per-mode authority. Effects use the declaration's
mode/effect vocabulary; unrelated rows carry no grant. No report or parity-map row authorizes effects.

Bind the initial legacy procedure to `0ae15a9dafc58ff6457cf90f2c91630015833539`, Git blob
`4e67b95f30296a9de3d3ab728625b460dd42e3fe` at `agents/codebase-audit.md`, SHA-256
`e6efd34845b16d902ea5c3bf2f89571d2e7b65520e9742fdbe45001ccc11b5cb`. Include the command
and applicable constitution/shipping references in the same binding. Before migration, reconcile
current default policy drift explicitly; changed legacy objects require an updated map and review,
not silent reuse of old coverage. Source-specific examples and raw legacy text stay local unless
separately authorized for the bounded reviewer packet.

Rows cover every existing mode, stable-ID/format rule, per-mode working-ledger/commit/publication
permissions and ledger-branch/base handoff, live verification authority/denial/residual mapping,
repair classification, batch record/review mapping, re-location, verification/challenge, delta scan,
deduplication, coverage gaps, ordering, coupling, regression ladder, live-runtime requirements and
residuals, token/data cleanup, reference implementations, documentation checks, batching, tracking,
conditional merge, operational-secret handoff and workstream boundary. Every row names its shared or
retained local home and an executable contract/scenario; parser checks reject duplicates, stale
source bindings, missing required dimensions and unresolved homes/contracts at completion.

A paired independent migration review must compare the complete bound legacy procedure/command and
applicable local rules against the populated map and adapter, not trust the author's map as proof of
its own completeness. It must identify omitted legacy behavior even when remaining tests pass.
Actual authority comparisons read `expected_effects` only after this map/binding has been validated;
that mechanical match cannot replace semantic coverage review. Synthetic controls omit a legacy
permission/verification rule and corrupt a legacy blob or effect row; they must prevent a clean parity
result. Missing required reviewer access leaves AC-05 unverified, with transfer approval requested if
private workflow files are needed; it never becomes a passing bounded predicate check by itself.

Consumer fixtures under `tests/agent-audit/` use synthetic ledger/source data, including another
ID prefix and generic consumer with no Stackweaver policy. Record the exact shared/consumer commits,
installed version/digest, unchanged ledger hash and rollback baseline. Rehearse restore/reapply of
only the audit migration paths against that current baseline, preserving newer unrelated routes and
index/dirty sentinel bytes. A missing installed operation or stale/mismatched adoption receipt blocks
cutover instead of silently falling back to a copied legacy agent.

Run the actual shared authority helper against Stackweaver's committed migration candidate settings
and declaration before merge. This candidate-validation mode reads that exact Git commit and its
real origin/default identity, checks all schema/coherence/field/fragment rules and compares declared
mode effects with the parity map. It must return no action grant and mark the candidate unadopted;
a migration-branch declaration cannot become effective permission. Bind the observed output to the
shared helper commit/installed digest, consumer commit and settings/procedure/AGENTS objects.
A malformed, incomplete or parity-mismatched candidate blocks preflight/consumer merge even when
synthetic cases passed. Use this actual committed-policy check as an AC-05 consumer contract.

After the authorized consumer merge, perform a read-only validation with the actual installed
helper against freshly fetched committed default-branch AGENTS/settings/project procedure. Record
the adopted commit, validated fragment bindings and resolved declared effects for each mode and
compare them to the same parity map. This is a dry-run inspection, not a current request to execute
fix/commit/live/remote effects: it emits no action grant and performs no ledger change, live test,
credential/data operation, issue/PR write or push. A mismatch means adoption is not complete; use the
documented scoped rollback or repair path within existing authority, preserving unrelated work.
The staged actual-policy receipt is required before merge; the post-merge receipt is required before
claiming successful adoption. Never fabricate the latter as a pre-merge source criterion result.

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
- [ ] AC-02: Adopters using strict YAML settings through the shared verified reader can inspect their existing supported Markdown ledger without format conversion, distinguish finding identities from references and historical claims, expose malformed/incomplete inventory, and propose fresh IDs without reusing existing references.
- [ ] AC-03: Current assessments and update proposals preserve stable IDs/history and admit FIXED/MOOT only with complete target-bound evidence and the required adversarial check, while stale, missing or contradictory evidence remains visibly incomplete and cannot yield an eligible terminal update.
- [ ] AC-04: Selected audit repairs use the existing reviewed repair/feature lifecycle and the consumer's required verification and authority, preserve workstream boundaries and recover from interruption without silently replaying stale or duplicating completed effects.
- [ ] AC-05: Stackweaver's adapter preserves every parity-mapped audit behavior with the owner-approved separate-feature routing change, command/model/arguments, real ledger bytes and unrelated workflows, and can roll back/reapply only its migration paths against current main.
- [ ] AC-06: The committed source passes its required automated suites, independent exact-commit review, isolated native Codex/Claude installation and helper checks, and bounded actual Copilot Opus 5.5 generic/consumer behavior trials with adversarial negative controls and explicit test limits.
- [ ] AC-07: Consumer cutover is blocked without matching published-marketplace and paired-review artifacts, and the documented delivery procedure verifies the published shared component and installed operation before adopting Stackweaver, retaining exact revisions, rollback and deferred capability limits.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Verify status/read-only/no-fetch settings reads with a valid locked cached binary and an empty isolated cache; the latter gives an offline prerequisite failure with no network/cache/audit writes. Run the actual audit skill-entry plan and bounded operator bootstrap with isolated HOME, XDG cache and PATH so host binaries cannot hide an empty cache; network/cache-write sentinels must stay untouched for cached and uncached entry paths, including knowledge resolution. Repeat both states through ordinary-language lifecycle intake routed to audit, before any installer/knowledge step; a direct-skill-only result is insufficient. Extend the package/discovery/intake contracts and native CLI skills enumeration. Run default, status, full, explicit IDs, workstream and next scenarios; verify external proposal versus permitted ledger application/local commit by mode and consumer, including ledger-update without ledger-commit and its isolated assessed-source/branch/base/path scope when invoked from an unrelated feature or dirty main, and no remote action from reverify/full. Add intake negatives where configured audit settings do not intercept maintenance security sweeps, diagnosis or backlog triage; ambiguous security wording must get the focused scope question and explicit audit without config gets onboarding. Invalid mode/ID/workstream fixtures must leave source/index/refs/ledger unchanged. |
| AC-02 | Compare old validated settings with commented block YAML through the real locked reader, allowing only settings_path and the new deterministic knowledge_pages metadata to differ; all pre-existing fields must match, and the new list must equal the fixed pages plus the declared language pages. Test JSON/yml leftovers with default and explicit paths, refused YAML, missing/failed binary verification and no settings fallback. Refused input must not leak settings text or create ledger/journal/action effects. Exercise the complete standalone YAML example. A package contract verifies audit-settings.md, workflows.md, installation.md, compatibility.md and marketplace guidance use the YAML audit path and 0.8.0 minimum consistently, with no active JSON setup or 0.7.0 audit claim. The reference inline example must contain a comment, fail JSON.parse and load through the actual audit loader. Assert that the example and every positive shared settings-fixture writer emit block YAML with at least one comment and fail JSON.parse; keep intentionally invalid/legacy fixtures explicitly labelled. Unit fixtures for AUD and a second prefix, incidental IDs in headings/prose, reference-only high IDs, duplicate index/entries, index-only/entry-only findings, missing config, identity mismatch, traversal, symlink escape and unknown profiles. Copy and exercise the complete standalone example through actual settings/inventory helpers. Compare local real-ledger structure read-only and retain its hash; no private contents leave the host. |
| AC-03 | Snapshot/report/update-validation tests and actual Copilot trials for valid/false FIXED, genuine MOOT vs renamed code, missing required checks/independent challenge, sibling-surface residual, incomplete coverage, source/settings/ledger drift, a reverify/full verdict assessed on non-default or dirty source being refused for tracked ledger application/commit, resolvable ancestor versus missing/shallow/non-ancestor legacy baseline with honest unscoped reassessment, duplicate/renumber/delete attempts and concurrent new-ID conflict. A fixture terminal proposal passes only with all required evidence; every negative must be rejected. Inspect actual returned transcripts and saved report bytes. |
| AC-04 | Test complete schema validation of exact committed YAML and its same-commit paths, byte/value match to configured settings, clean/dirty/unmerged/alternate-origin inputs, stale JSON AGENTS link, committed alternate suffix absent from the checkout, and unavailable/refused reader on adopted and candidate paths. Each invalid case yields no grant and a distinct safe cause. Retained-absence recording must work with bound candidate-YAML identity before adoption, current-YAML identity after adoption and cleanup-only policy-transition state, preserving all effective policy flags/digests and ordinary append restrictions. Test cross-repository/common-dir/intent mismatch and every forbidden event kind. Test the distinct retained-absence event and dedicated CLI: only a hash-bound actual absent observation plus exact owner journal handoff may record it; free-text reasons cannot forge it, and it cannot execute, retire, clear a key/row, activate policy or certify old-batch execution. Cross the JSON-to-YAML digest change with a retained declined non-resource run: cutover/new run remains available while its old root persists, no replay/retirement occurs, and a missing root or pending key/row blocks admission. For both pre-publication default advancement and an approved post-publication rebase, exercise fresh run/journal/record identity, branch-owned old-record/index removal with private archival, and actual new pre-fix red/final green. A leftover old record (even declared), reused old run or unrebuilt/non-ancestor pre-fix must fail batch-check/review; the correctly rebuilt run passes. A bounded synthetic selected workstream batch with two findings must show per-finding red/green/current verification and final-head independent review of the single record/branch. Add a later member/commit and changed Definition to prove that prior review is stale. Test a mixed selection where one member is already fixed/moot, one residual reproduces and one cannot be reproduced: no fabricated red evidence, no silent removal/replacement and unresolved required work blocks whole-batch completion; an all-assessment selection creates no empty repair PR. The actual audit-specific reviewer must reject a member missing a cited pre-existing contract, a missing per-member challenge, and a batch where only the second member has a passing final-head check; a valid two-member batch including proposed ledger updates must pass. Provisional candidate FIXED/MOOT cannot be published before that pass. Verify the frozen source_target to ledger/record-final-head Git-object equivalence; source changes after Verified source, a pre-fix SHA, missing SHA and placeholder replacement must fail or stale review. A ledger status/index edit after review must stale it, while a true append-only record review/state update may preserve freshness. Classify documented permission/data-handling restoration versus new boundary/format/migration/intent change. The latter requires a separate accepted feature/PR and owner merge; even an owner planning exception cannot make it audit-batch eligible. An explicit new selection is required before omitting that member from the remaining batch. Visible contract restoration still follows the local judgment/merge stops. Test these with generic and consumer cases. Exercise the deterministic declaration helper with every missing/duplicate/mismatched/unknown field, duplicated heading/table, valid/coherent restricted effect subsets and cross-mode effect, generic eligible local fix without a declaration, `fix_effects: none`, incoherent remote-only subset and actual local prohibition; reject uncommitted, unmerged, alternate-origin, wrong-mode/selection and report/settings-forged grants; missing adopted policy, failed fetch and generic consumer receive no Stackweaver permissions. Current no-write/no-push/no-merge wins. Synthetic live-gate cases must distinguish adopted/requested permission, permission denial blocking merge, and a genuinely unreachable path with only its permitted residual; temporary key/test-row cleanup and no unrelated restart are observed. Interrupt after durable intent, after key/test-row creation before cleanup, and after accepted cleanup with lost acknowledgement; fresh-context resume must reconcile the exact scoped resource, revoke/clean it once, observe no orphan/second key, and never record secret values. Denied or ambiguous cleanup leaves a specific durable handoff and blocks live retry/completion. Carry an explicitly included known unpublished ledger-only commit into the selected repair base while retaining its default ancestor as Scope baseline; the actual batch reviewer must inspect that full publication diff, and missing carried-report approval, omitted carried ID/evidence or reviewing only Task-base-to-head must prevent push/merge. A fix selection without included report scope keeps that report private; new default source or conflicting ledger must stop/reconcile. Squash a synthetic reviewed batch, delete its branch and reverify using the recorded Scope baseline; legacy pre-squash or missing baselines must become unscoped and trigger direct reassessment without implying an empty delta or invoking full audit. Interrupt after saved report, local commit and accepted fake remote effect with lost response; fresh-context resume reconciles without duplication and blocks after drift/conflict. Exercise ordinary clean owned-worktree cleanup, refusal after squash and retention of private/pending ledger commits; no force cleanup or unrelated worktree change. No real remote or live stack action. |
| AC-05 | Actual cutover preflight must refuse an unreconciled merge/push/report/PR/issue/commit intent (including an unknown-state handoff) as well as a pending key/row or an unreadable/missing registered root before merge, while a readable non-resource-only run with typed retained-absence observations passes. Arbitrary --reason, legacy/unknown/reconciliation-only handoffs cannot pass. Test recording a current absent lookup for an old/policy-changed run under the explicit metadata-only handoff before YAML adoption; unknown, stale, resource and no-write cases must fail without effects. Actual candidate preflight must fail distinctly on stale AGENTS links, committed suffix conflicts and missing/refused offline reader. Convert the exact consumer audit configuration to commented block YAML containing at least one comment and rejected by JSON.parse, and compare every pre-existing validated value/effect before and after apart from settings_path, checking the new knowledge_pages field against the declared local obligations. Update and rehearse YAML-path rollback/reapply and minimum 0.8.0 checks, retaining the original real-ledger hash. Validate the committed `tests/agent-audit/parity.json` schema/baseline/row/home/contract bindings, recording the owner's explicit separate-feature routing change instead of claiming unchanged legacy exception behavior, then require independent full legacy-to-map/adapter coverage review and bounded Copilot policy trials; omission of a legacy rule must fail even with otherwise passing mapped tests. Run the real authority helper against the exact committed Stackweaver candidate settings/procedure, validating origin, fields, coherence, unique fragments and parity effects with no action grant; a malformed or mismatched real candidate must block cutover; unchanged-path and ledger hashes, Claude command metadata/arguments, generic-consumer controls and installed-plugin rollback/reapply must pass with preserved index/dirty sentinels. Refresh source/consumer revisions if current main changes. |
| AC-06 | Provision each isolated native/helper/model fixture with the exact locked digest/version and deterministic configured page set for the consumer-resolved revision during observed explicit setup, recording both setup observations and exact requested/seeded page-set equality; complete-cache skill-entry/helper reads pass and empty/partial-page-cache offline entry fails without download or cache writes. Isolate PATH as well as HOME/XDG cache; host-installed binaries or cached conventions must not hide the missing prerequisite. Full `bun test tests/vh-adlc`, Go tests/vet/tidy/lint and other-plugin tests, actionlint/whitespace, portable macOS CI, plus isolated native install/discovery/helpers/reinstall. Store actual Copilot model identity/commit/payload, positive and negative grades, manual transcript checks and all failures; independent review verifies the exact committed code and evidence. No live-Claude/GUI inference. |
| AC-07 | Unit preflight denials for maintenance/wrong operation, local-catalog, missing/wrong artifact/model/version/commit/digest and valid unchanged artifacts. Source completion checks the gate and installation candidates; delivery then requires actual published fresh install/upgrade, signed release verification where produced, a fresh paired review and passing actual preflight including the non-granting actual candidate-policy receipt before consumer merge. After merge require the read-only actual installed-helper check of freshly fetched adopted policy/effects and its parity match before declaring adoption complete; an induced synthetic mismatch must exercise the scoped rollback/repair handoff. This ordered publication obligation is not fabricated as a pre-publication source-test result. |

## Tasks

- [x] T1 `Stackweaver:tests/agent-audit/parity.json` - commit the complete legacy-bound behavior/effect map before helper/forwarding edits; JSON structure, Git blob/excerpt hashes and all required dimensions resolve (AC-05).
      Evidence: Consumer commit `04696fb7e50168fd9e742a9f1d57a457e6dde388` records 39 rows and five bound legacy files at `0ae15a9d`; all excerpt hashes/required dimensions validated. Normal host commit hooks passed four checks with no skips after a retained sandbox Git-spawn EPERM. Future homes/contracts and independent semantic completeness remain for T24; AC-05 is not ticked.
- [x] T2 `tests/vh-adlc/audit/settings.test.ts` and `fixtures.ts` - write meaningful origin/config/profile/path and complete-example checks first; observe failure because the audit settings operation is absent (AC-02).
      Evidence: `bun test tests/vh-adlc/audit/settings.test.ts` failed with exit 1 because the audit settings module does not exist, before implementation. The retained red log is `T2-settings-red.log`; cases cover identity, missing setup, malformed/escaping inputs, redaction and the full standalone example.
- [x] T26 `plugins/vh-adlc/plugin.json` and `.claude-plugin/plugin.json` - move the coherent 0.7.0 candidate version prerequisite before further package work; the observed existing package-version red becomes green alongside settings tests (AC-01, AC-06).
      Evidence: Existing package-version check failed before the bump in `T3-package-check.log`; both manifest versions are now 0.7.0. `bun test tests/vh-adlc/check.test.ts tests/vh-adlc/audit/settings.test.ts` passes 75 tests/213 assertions with zero failures in `T26-version-settings-green.log`.
- [x] T3 `plugins/vh-adlc/scripts/audit/settings.ts`, `types.ts` and `examples/audit/basic/` - implement strict origin-bound settings and complete standalone files; T2 passes without host/private configuration (AC-02).
      Evidence: Settings red became 22 passing tests/38 assertions in `T3-settings-green.log`. Code commit `90b2416` plus the prerequisite version task T26 now passes the 75-test combined settings/package check. The complete example loads in a fresh fixture and no input credential values are echoed. Inventory/AC-02 completion still requires T5.
- [x] T4 `tests/vh-adlc/audit/inventory.test.ts` - write legacy-index/heading/reference/high-water/ambiguity tests first; observe the missing inventory behavior fail (AC-02).
      Evidence: `bun test tests/vh-adlc/audit/inventory.test.ts` exits 1 because the inventory module is absent; `T4-inventory-red.log` retains the observed red. Cases distinguish primary identities/references, historical status, incomplete/duplicate indices, alternate prefix and safe ID allocation.
- [x] T5 `plugins/vh-adlc/scripts/audit/inventory.ts` - implement supported Markdown inventory and conservative ID allocation; T4 passes including alternate prefix and incomplete inventories (AC-02).
      Evidence: Missing-module red and four additional observed parser/control failures became 87 passing combined settings/inventory/package tests with 267 assertions in `T5-legacy-format-green.log`. Actual private-ledger read-only inventory preserves SHA-256 `c0eb6250334fbb592ed955c595b24aea2d796f5c1c7b5279672e26065807d769`, exposes 122 indexed/entry IDs including four compressed ranges, derives AUD-160, and reports incomplete historical/group evidence rather than current verification. No private finding titles/bodies were copied to shared fixtures.
- [x] T6 `tests/vh-adlc/audit/assessment.test.ts` and `snapshot.test.ts` - write target-binding, false-fixed, challenge, stale-source/history and candidate-integrity checks first; observe missing behavior fail (AC-03).
      Evidence: Snapshot/assessment tests were run first and fail because the modules are absent; `T6-assessment-red.log` retains exit 1. Negative cases cover stale source/settings/policy/history, incomplete identities, missing checks/challenges, self/member substitution, artifact tampering and authored-vs-assessment proof.
- [x] T7 `plugins/vh-adlc/scripts/audit/snapshot.ts`, `assessment.ts` and `report.ts` - implement private bound snapshots, evidence/proposal validation and exclusive reports; T6 passes with no ungranted checkout/index/ref writes (AC-03).
      Evidence: Snapshot/assessment/report missing-module reds and two observed detached-target/pre-fix-target control failures became 113 passing tests with no failures in `T7-final-green.log`. Reports use exclusive private files outside the checkout; changed bindings, malformed identities, missing member checks/challenges and nonexistent red targets remain ineligible. These structural operator-attestation tests do not establish semantic truth; actual model trials remain T22.
- [x] T8 `tests/vh-adlc/audit/authority.test.ts` - write declaration, provenance, current-request/effect precedence, coherent-subset and candidate/adopted dry-run denials first; observe failure before the authority helper exists (AC-04, AC-05).
      Evidence: `bun test tests/vh-adlc/audit/authority.test.ts` fails on the absent module before implementation (`T8-authority-red.log`). Tests cover each declaration field, coherent subsets, provenance/drift, request restrictions, generic local-only repairs and non-granting candidate inspection.
- [x] T9 `plugins/vh-adlc/scripts/audit/authority.ts` - implement deterministic committed-policy validation and bounded effective-permission inspection; T8 passes and candidate inspection never grants an action (AC-04, AC-05).
      Evidence: Authority missing-module/unknown-selection reds became 96 passing authority/package tests with no failures (`T9-rerun-green.log`). A combined run hit three host-load 5-second timeouts (`T9-final-green.log`); Git readers now also reject null/interrupted exit status, and the bounded 30-second rerun passed. All declaration fields, coherent effects, adopted Git-object chain, candidate non-grant and request restrictions are covered. Unit refresh is a fake transport; real adopted-host fetch remains the delivery check.
- [x] T10 `tests/vh-adlc/audit/recovery.test.ts` and `live-recovery.test.ts` - write actual fake-transport interruption, private-journal ownership, key/row cleanup and lost squash-merge acknowledgement checks first; observe absent recovery behavior fail (AC-04).
      Evidence: Both recovery test files fail on absent journal/recovery modules before implementation (`T10-recovery-red.log`). Scenarios interrupt before creation, after key/row creation, after accepted cleanup/merge with lost acknowledgement; denials and ambiguous ownership must leave durable handoffs. All effects are disposable/fake, with no real stack or remote writes.
- [x] T11 `plugins/vh-adlc/scripts/audit/journal.ts` and `recovery.ts` - implement owned private intent/outcome records and safe reconciliation without default-branch writes; T10 passes, including R-12's once-only observed merge outcome and denied-cleanup handoff (AC-04).
      Evidence: Missing-module/resource-ID reds became 14 passing focused recovery tests (`T11-focused-rerun.log`). Durable exclusive private intents reconcile accepted fake merges/cleanup with lost replies once in observed scenarios; denied/ambiguous or replaced resources remain pending with handoffs. R-12 merge outcome stays external with no ref/default-branch write. `/tmp` quota and a later combined-run host-load timeout (169 pass/1 timeout) are retained; owned workspace scratch and the bounded focused rerun pass. No real live resource or remote action was performed.
- [x] T12 `tests/vh-adlc/audit/ledger.test.ts` and `batch.test.ts` - write owned ledger application/base, provisional/final evidence, stale selection, source freeze, carried-scope and squash-baseline tests first; observe missing behavior fail (AC-03, AC-04).
      Evidence: Ledger/batch tests fail on the absent modules before implementation (`T12-ledger-batch-red.log`). They exercise real fixture Git worktrees/commits/squashes, selected status preservation, false/stale candidate rejection, update-vs-commit authority, whole-batch member evidence and review freshness. Structural records are labelled synthetic attestations; real model red/green remains T22.
- [x] T13 `plugins/vh-adlc/scripts/audit/ledger.ts`, `batch.ts` and `cli.ts` - implement checked local candidate/record interfaces and helper CLI; T12 passes with real fixture Git histories, preserved unrelated state and no invented red/green (AC-03, AC-04).
      Evidence: Ledger/batch/CLI missing behavior and observed carried-proof, prose-preservation, provisional, cleanup and package-punctuation reds became 209 passing combined tests/567 assertions (`T13-final-green.log`). Real disposable Git worktrees isolate updates, preserve invocation source/index/refs, reconcile a local commit, retain private/squash evidence refs and allow ordinary cleanup after reachability. Whole-batch checks bind each disposition, full carried publication scope, frozen source and append-only record freshness. Native CLI checks pass on the host; sandbox mount quota failures remain recorded. Semantic Copilot/native install/consumer migration and final full gate remain T22-T25; no criterion is inferred complete.
- [x] T14 `tests/vh-adlc/audit/discovery.test.ts`, `intake.test.ts` and relevant package contracts - write audit discovery/modes and maintenance/investigation/triage priority negatives first; observe the absent skill/route fail (AC-01).
      Evidence: Discovery/intake/package tests were run before the new skill/routes and fail (`T14-discovery-red.log`). Static contracts check portable metadata, shared references and route boundaries; exported positive/negative cases await actual model execution in T22, not a regex router pretending to execute an agent.
- [x] T15 `plugins/vh-adlc/skills/vh-adlc-audit/SKILL.md` and `references/audit*.md`, `lifecycle.md`, `authority.md` - package the accepted procedure, exact settings/record/reviewer and authority contracts; T14 passes and no harness/model pin is added (AC-01, AC-03, AC-04).
      Evidence: Missing-skill/route reds and observed report, coverage, legacy-range and lightweight-delta/format regressions became 228 passing combined audit/package/direct-operation tests with 676 assertions (`T15-final-green.log`). Shared audit skill/references have no model or harness pin; unrelated route bodies stay unchanged. Fully observed STILL_PRESENT is complete assessment coverage without terminal eligibility; UNKNOWN/range gaps stay incomplete and preserve history. Reverify related-delta new IDs require actual changed source paths, and established inline markers preserve original heading text/anchors. Actual model routing remains T22, not inferred from static text contracts.
- [x] T27 `plugins/vh-adlc/scripts/audit/settings.ts`, `authority.ts`, `references/audit-settings.md` and `tests/vh-adlc/audit/settings.test.ts` - support the actual public-owner-login origin form without mutating Git transport or neutral helpers; observed origin rejection becomes green while credential/userinfo denials stay redacted (AC-02, AC-05).
      Evidence: `T27-owner-origin-red.log` reproduces the missing owner-login form before implementation (25 pass/1 fail). The focused settings/authority/package rerun passes 125 tests/311 assertions (`T27-owner-origin-green.log`); password, query and other-login negatives remain rejected. Real committed consumer-policy inspection remains T17/T24.
- [x] T16 `Stackweaver:tests/agent-audit/` - write command/model/arguments, row-by-row parity, real candidate-policy and preserved-ledger/other-route contracts first; observe the local legacy-only route fail the shared-operation expectations (AC-05).
      Evidence: Consumer commit `6c2515c9` retains the observed 2-pass/41-fail pre-adapter contracts (`T16-reconciled-consumer-red.log`), then passed all four normal hooks with no skips after the separately published visual-baseline correction. Git blob/excerpt/required-dimension validation and unchanged-ledger checks pass; actual semantic parity remains T24.
- [x] T17 `Stackweaver:AGENTS.md`, `agents/codebase-audit.md`, `agents/audit-project.md`, `.claude/commands/audit.md` and `.vh-adlc/audit.json` - implement the thin adapter and retained local policy; T16 passes using the actual shared helper in non-granting candidate mode (AC-05).
      Evidence: Consumer adapter commit `17134b51cec8656981e728526841ae503b739bdf` passes 51 audit/maintenance/triage contracts and four normal hooks with no skips (`T17-consumer-contracts-green.log`). Tests exposed and corrected two truncated legacy excerpt ranges and two unresolved homes; original five blob bindings remain intact. Actual committed source helper 0.7.0 validates the real candidate effects with allowed=false/adopted=false, inventories 122 historical IDs without current-verification claims, and preserves both repositories' source/index/refs (`T17-committed-policy/receipt.json`). Ledger SHA-256 remains `c0eb6250...`. This is local candidate evidence; native installs, full semantic review and marketplace/adopted-policy checks remain pending.
- [x] T18 `tests/vh-adlc/audit/adoption.test.ts` and `Stackweaver:tests/agent-audit/preflight.test.ts`, `rehearsal.test.ts` - write wrong-operation/artifact/target/model/version and unadopted-policy cutover denials plus rollback/reapply first; observe the absent audit verifier fail (AC-05, AC-07).
      Evidence: Missing-module reds are retained in `T18-shared-adoption-red.log` and `T18-consumer-preflight-red.log`; consumer tests and the required internal changelog disposition are committed at `7baf9a49`. Normal hooks pass four checks; the broad frontend dependency check reports one skip because this isolated metadata-only checkout has no frontend dependencies. No product verification is claimed.
- [x] T19 `plugins/vh-adlc/scripts/audit/adoption.ts` and `Stackweaver:tests/agent-audit/preflight.ts`, `rehearse.ts`, `manifest.json`, `README.md` - implement audit-specific artifact-bound preflight and actual scoped rollback rehearsal; T18 passes and real publication remains required before cutover (AC-05, AC-07).
      Evidence: `T19-shared-green.log` passes 74 tests/136 assertions after the adopted-policy missing-export red; `T19-consumer-green.log` passes 58 tests/538 assertions, including rollback/reapply and dirty/staged/symlink refusals. Consumer helpers are committed at `4acc867f`; four normal hooks pass without skips. Candidate/published receipts remain distinct, policy artifacts and mode effects are bound, and the read-only adopted-policy API grants no execution. No marketplace or post-merge acceptance is claimed.
- [x] T20 `README.md`, user/install/compatibility guides and `.github/workflows/ci.yml` - finish coherent candidate documentation and add audit to the portable test selection; package contracts and actionlint pass without trigger/permission changes or untested compatibility claims (AC-01, AC-06).
      Evidence: Package/direct-operation checks pass 63 tests/218 assertions (`T20-package.log`), and actionlint passes. Guides describe twelve candidate skills, greenfield audit setup, permission/evidence limits and pending compatibility; no install/model/GUI claim is inferred. The portable CI selection adds audit tests without changing triggers or permissions. Prose-only checks have no meaningful failing-first test; existing package contracts verify the resulting operation metadata.
- [x] T21 `tests/vh-adlc/audit/trial-proof.test.ts` - write positive/negative semantic-evidence and transcript/provenance controls for actual model trials; observe the missing grader/runner contract fail (AC-03, AC-04, AC-06).
      Evidence: `T21-trial-proof-red.log` observes the absent grader before implementation. Controls cover false verdict/eligibility, omitted/duplicate members, wrong source/payload/evidence/routes, fabricated live actions and missing/wrong native model, process, transcript or preservation provenance. Fixture provenance is synthetic and supplies no actual native acceptance.
- [x] T28 `tests/vh-adlc/triage/discovery.test.ts`, `maintenance/discovery.test.ts` - reconcile existing discovery/documentation counts with the added audit operation, preserving their native metadata and route assertions (AC-01, AC-06).
      Evidence: The first full plugin run passes 818 tests but exposes four old eleven-skill/nine-engineering count assertions (`full-bun-r1.log`). Updating only those expected counts/prose makes the focused nine-test discovery run pass (`T28-discovery-counts-green.log`). The final full rerun remains T25.
- [x] T29 `scripts/audit/snapshot.ts`, `ledger.ts`, `report.ts` and focused tests - separate historical comparison from the next default Scope baseline, preserve unscoped coverage, and apply an honestly reassessed or related-delta candidate (Copilot implementation R1 F-01; AC-03).
      Evidence: Both new comparison/application controls fail before the fix (`T29-baseline-red.log`) and the snapshot/ledger/report/batch rerun passes 54 tests/126 assertions (`T29-baseline-green.log`). Historical missing/older comparison stays honest; the separate next Scope baseline is validated against fresh default at application. A related-delta new ID now survives actual isolated application. Final full suite remains T25.
- [x] T30 `scripts/audit/batch.ts`, `ledger.ts` and batch tests - bind committed provisional verdict bytes to the frozen-source candidate, including actual ledger Verified source/baseline, assessment verdicts and fresh IDs (R1 F-02; AC-03, AC-04).
      Evidence: Five ledger-only false-pass controls fail before the fix (`T30-ledger-binding-red.log`); another observed red catches an unchecked ledger edit hidden before source freeze (`T30-before-freeze-red.log`). The final focused ledger/batch/assessment run passes (`T30-final-green.log`). Batch proof now includes the actual frozen snapshot/document/candidate, exact committed ledger bytes and matching final verdict/scenario evidence; the frozen ledger equals Task base. Existing synthetic positives now construct real candidates rather than appending a proof-looking string. Actual authored-trial receipts must be regenerated for this stronger contract before T22 can pass.
- [x] T31 `scripts/audit/authority.ts`, `adoption.ts`, CLI/consumer integration and focused tests - require restoration eligibility for every fix grant, fail closed on unknown restrictions, and inspect exact committed candidate-policy objects/default identity (R1 F-03/F-04; AC-04, AC-05, AC-07).
      Evidence: Eligibility/restriction/committed-policy controls fail before the fix (`T31-authority-red.log`), and two emitted-policy-transcript mismatches expose the former receipt hole (`T31-policy-transcript-red.log`). Source authority/adoption rerun passes 78 tests/139 assertions; real consumer and hermetic missing-receipt tests pass 50 tests/412 assertions. Consumer commit `8570c749` passes four normal hooks with zero skips. Exact candidate commit/default/blob/effect output is checked; unknown restrictions and ineligible fixes fail closed for every grant basis. Failed fixture transport attempts are retained and removed rather than weakening origin identity.
- [x] T32 `scripts/audit/journal.ts`, `recovery.ts`, `cli.ts` and recovery tests - expose durable outcome/handoff/pending operations, prevent resource creation from being mistaken for cleanup, and preserve read-only pending-state inspection after policy drift (R1 F-05; AC-04).
      Evidence: Resource-creation reconciliation and missing native outcome/handoff/pending operations fail first (`T32-resource-outcome-red.log`, `T32-journal-cli-red.log`); a further real CLI red catches creation being retired as cleanup (`T32-cli-resource-red.log`). The focused recovery/live-recovery/CLI run passes (`T32-final-green.log`). Generic recovery/outcomes reject key/row completion; explicit cleanup-outcome records only an operator-attested observed absence. Valid policy drift leaves pending intents inspectable with a policy-changed handoff and no mutation/retry grant. Actual model recovery acceptance still remains T22.
- [x] T33 `scripts/audit/ledger.ts`, `adoption.ts` and focused controls - remove generic CI suppression, preserve observed ID width and reject mixed review content (R1 F-06/F-07/F-08; AC-02, AC-04, AC-07).
      Evidence: Default CI suppression, four-digit allocation and mixed/whitespace-separated review controls expose five failures before correction (`T33-policy-width-review-red.log`). The focused ledger/adoption/batch rerun passes 80 tests/136 assertions (`T33-final-green.log`). Generic commits omit skip-ci; explicit policy-grounded request choice is ownership-bound. IDs preserve observed padding. Verbatim clean records allow blank separation but reject extra criteria/footer content; no review text is rewritten.
- [x] T34 `scripts/audit/inventory.ts`, `ledger.ts` and ledger tests - share Markdown-visible section boundaries and preserve raw escaped title cells when appending annotations (implementation R2 F-01/F-03; AC-03).
      Evidence: Fenced/commented reproduction headings plus an indented next finding, and non-pipe escaped title bytes both fail before correction (`T34-markdown-red.log`). The focused ledger/inventory/batch run passes (`T34-markdown-green.log`). Ledger insertion now shares inventory visibility/heading grammar, and title annotations append to raw cell content rather than reconstructing escaped Markdown.
- [x] T35 `scripts/audit/assessment.ts`, `batch.ts` and evidence tests - reject empty authored/final batch check requirements and require the red regression's actual final-head green command (R2 F-02; AC-04).
      Evidence: Empty declarations, unrelated green argv, no observed terminal check and an all-assessment batch with empty required checks expose four false passes before the fix (`T35-final-green-link-red.log`). The focused assessment/batch/ledger rerun passes (`T35-final-green.log`). Authored repairs now require declared checks and the red regression argv passing at final head; every terminal batch member declares nonempty checks, and no terminal assessment can omit observed checks.
- [x] T36 `scripts/audit/ledger.ts` and isolated assessment tests - permit a clean detached or owned assessment at the actual freshly fetched default commit while preserving dirty shared main and its index (R2 F-05; AC-03).
      Evidence: Clean detached/owned assessments at exact fetched default each fail before correction (`T36-dirty-main-isolation-red.log`). The focused ledger/snapshot run passes 40 tests/103 assertions (`T36-dirty-main-isolation-green.log`), including actual isolated Git application while shared main retains its staged/untracked bytes, index and branch tip. Application binds clean commit identity instead of requiring a main branch name; the recorded owned-role limit is explicit.
- [x] T37 lifecycle/authority/compatibility references and route contracts - remove the remaining audit live/remote contradiction and report current local-catalog native evidence accurately without marketplace/GUI claims (R2 F-04/F-06; AC-01, AC-06).
      Evidence: The old ship/live row fails the new authority-route contract (`T37-route-authority-red.log`); package/intake/discovery/direct-operation checks pass 68 tests/273 assertions after correction (`T37-route-authority-green.log`). The merge exception points to exact scoped audit permission/adopted policy plus retained gates; tags/releases/deployments/restarts remain separately authorized. Compatibility distinguishes observed local-catalog native passes from pending final refresh, marketplace, real-Claude and GUI evidence.
- [x] T38 `scripts/audit/ledger.ts`, retained consumer format policy and legacy-layout fixtures - preserve the existing dated banner/summary layout and marker visibility while leaving original finding headings/anchors and history unchanged; verify concrete Stackweaver-format parity before its independent migration review (AC-03, AC-05).
      Evidence: The concrete historical-layout fixture fails before banner/summary support (`T38-dated-layout-red.log`), then ledger/batch/inventory passes 70 tests/184 assertions (`T38-dated-layout-green.log`). Existing How-this-audit-was-performed layouts retain dated banners, categorized summaries and changed-status markers immediately below unchanged heading lines, preserving anchors/history and honest unselected scope. Consumer policy clarification is committed at `10f5a25c` with four normal hooks/zero skips; all 50 committed consumer tests pass. The retained precommit failures correctly rejected uncommitted policy/rollback inputs. Full private semantic parity review is still required under T24.
- [x] T39 `scripts/audit/ledger.ts` and new-finding layout controls - keep appended finding entries before later summary sections and reject body headings that escape the configured finding level (AC-02, AC-03).
      Evidence: Two observed format failures (`T39-finding-placement-red.log`) become a passing focused ledger/batch/inventory run (`T39-finding-placement-green.log`). New entries remain with existing findings, original summaries remain intact, and fenced reproduction headings/deeper evidence headings stay valid content.
- [x] T40 `references/audit.md` and the existing bounded actual behavior trial - distinguish a currently partial repair from a regression inferred only from historical FIXED text, retaining the strict existing oracle and rerunning the actual requested model (AC-03, AC-06).
      Red evidence: `behavior-r4/result.json` at `98d0535` keeps A-002 ineligible and reports the worker residual, but labels it REGRESSED solely from a historical FIXED claim instead of PARTIAL. Native model/provenance/preservation pass; the semantic grade correctly fails. No oracle is relaxed.
      Green evidence: actual Copilot Opus 5.5 `behavior-r5/result.json` passes the unchanged 15-case/nine-route oracle at `6eb3ec7`, with strict tool/model/target/input preservation. Native candidate reinstall also passes at that payload. The prior semantic failure remains recorded; the oracle was not widened.
- [x] T44 `scripts/audit/authority.ts`, `ledger.ts`, CLI/request validation and apply-level controls - preserve current restrictions/prohibited effects at the tracked-write boundary and reject unknown request fields before refresh or mutation (implementation R3 F-05; AC-03, AC-04).
      Evidence: Five tracked-write controls fail before the fix (`T44-write-restrictions-red.log`) under an otherwise valid adopted ledger-commit grant. The focused ledger/authority/CLI run passes (`T44-write-restrictions-green.log`): current no-commit/read-only/no-write/prohibited-update and unknown request fields cause zero refreshes and preserve source/index/refs. Strict request validation and accumulated constraints are shared with authority inspection and forwarded at application.
- [x] T41 Markdown inventory/ledger rendering and controls - prevent visibility loss from unclosed comments/fences, re-inventory rendered candidates, and locate the real visible index using the shared heading grammar (R3 F-01/F-02; AC-02, AC-03).
      Evidence: Nine observed Markdown visibility/index failures (`T41-markdown-visibility-red.log`) become 87 passing ledger/inventory/batch tests (`T41-markdown-visibility-green.log`), including a post-render unchecked-terminal-title denial. Code spans/indented code keep literal HTML examples safe, raw metadata is escaped, new bodies must be balanced, the visible real index is selected, and final inventory preserves original identity/heading/index classes plus only declared OPEN new entries. Frozen candidate reconstruction rechecks the original inventory against actual ledger bytes.
- [x] T42 `scripts/audit/batch.ts` and default-origin controls - validate the actual fresh remote default rather than trusting the author's branch name/tracking ref (R3 F-03; AC-04).
      Evidence: An author-named alternate branch, failed remote observation and advanced actual default each falsely pass before correction (`T42-real-default-red.log`). The focused batch/authority rerun passes (`T42-real-default-green.log`). Batch review now revalidates origin/settings identity and read-only actual default metadata against both the declared Scope baseline and cached tracking tip; it cannot fetch/move refs during review. Fixtures inject a declared synthetic observer rather than contacting real example remotes.
- [x] T43 batch/journal/recovery helpers, native operations and controls - bind batch completion to its live-resource journal, distinguish a complete first-attempt resource plan from a prohibited retry, and retain specific cleanup/lookup failure handoffs (R3 F-04; AC-04).
      Evidence: Five observed recovery false-pass/failure controls in `T43-pending-resource-red.log` became 61 passing tests/182 assertions across batch, recovery, live recovery and native CLI (`T43-final-green.log`). Batch completion now requires its current policy-bound selected-scope journal and no pending key/row. The complete first-attempt key/row plan is registered before creation; another plan is refused until cleanup is reconciled. Cleanup execution/absence-lookup failures retain specific handoffs and a newly discovered resource ID is persisted before deletion, protecting replacements after a lost acknowledgement. Actual fresh-context recovery and final helper repair validation still require the T22 refresh; no live production effect is claimed.
- [x] T45 inventory/ledger Markdown visibility and controls - preserve rendered headings after inline comment openers and reject new-body comments that could conceal another index or finding boundary (R4 F-01; AC-02, AC-03).
      Evidence: Bun Markdown renders the concealed heading, and four inventory/ledger controls fail first (`T45-T48-red.log`). The focused inventory/ledger rerun passes (`T45-green.log`). Only a line-start comment can hide later blocks; new finding bodies reject comments outside code. Existing inline openers no longer hide another finding or move its predecessor's dated note under it. The setup-only missing temporary-directory failure is retained separately.
- [x] T46 batch journal binding and controls - require the original batch artifact root across provisional and final snapshots, so a fresh empty journal cannot conceal pending cleanup (R4 F-02; AC-04).
      Evidence: A pending original key plus a fresh final snapshot root and empty same-scope journal falsely passes before correction (`T45-T48-red.log`). All batch controls pass after binding provisional/final snapshots to the original artifact root (`T46-green.log`). The procedure now retains one artifact root and journal for the whole batch, with unique snapshot names; no receipt is reconstructed in a replacement root.
- [x] T47 snapshot comparison baseline validation - reject malformed baseline values before they can enter a rendered ledger note, preserving honest missing-hex-commit history (R4 F-03; AC-02, AC-03).
      Evidence: Raw HTML and newline-bearing malformed comparison baselines pass incorrectly before correction (`T45-T48-red.log`). Snapshot controls pass after rejecting non-hex comparison values (`T47-green.log`). A well-formed but unavailable commit remains an explicit unscoped comparison rather than an empty successful delta.
- [x] T48 explicit fix publication scope - leave fix Scope baseline unset until the fetched default ancestor is explicitly supplied, keeping historical comparison separate (R4 F-04; AC-03, AC-04).
      Evidence: A fix snapshot incorrectly inherits its historical comparison before correction (`T45-T48-red.log`). Snapshot/ledger/batch integration then passes 100 tests/221 assertions (`T48-green.log`). Omitting fix scope now leaves it null and the actual provisional candidate refuses to render; explicitly naming the reachable default ancestor succeeds. Positive fixtures now provide that separate scope input. Historical comparison remains independent.
- [x] T49 inventory/ledger fence grammar - reject a backtick in a backtick-fence info string as a fence opener, preserving actual rendered finding and section boundaries (renderer-observed follow-up to R4 F-01; AC-02, AC-03).
      Evidence: Bun Markdown renders the escaped heading while inventory/new-body checks incorrectly hide it (`T49-red.log`, two observed failures). The full inventory/ledger rerun passes (`T49-green.log`) after the parser refuses backticks in a backtick-fence info string. Literal valid fences and code examples retain the existing behavior.
- [x] T50 durable journal registration and controls - bind a run before its first live plan and block completion/live admission on pending resources across artifact roots and reselected runs; preserve read-only recovery after drift (R5 F-01; AC-04).
      Evidence: Pre-freeze root replacement, scope reselection and another-run pending cleanup all falsely pass before correction (`T50-red.log`). The batch/recovery/live/native suite passes 67 tests/195 assertions (`T50-final-green.log`). Immutable header registration in private common-Git-directory metadata precedes effects; duplicate run IDs cannot move roots. Live admission/readiness and completion inspect all registered pending resources. Actual absence reconciliation unblocks a later scope, while a missing prior header blocks it. Native pending inspection and explicit existing-journal registration are available; independent clones require an explicit handoff. This remains operator-attested local recovery, with no OS-resistant proof claim.
- [x] T51 Markdown section grammar and conservative gaps - recognize setext section boundaries, reject escaping new bodies, and expose unsupported raw HTML/container-comment structures as reconciliation gaps (R5 F-02; AC-02, AC-03).
      Evidence: Two setext body escapes, section-note/new-entry misplacement and raw-HTML/container-comment gaps fail first (`T51-red.log`). The renderer-backed section map and inventory/ledger/batch/report integration pass 112 tests/286 assertions (`T51-final-green-r2.log`). Bun 1.4+ determines rendered headings; ambiguous multiline setext/raw-HTML/container-comment sources remain explicit gaps that cannot yield canonical updates. A real-ledger structure-only check still finds 122 historical entries, highest AUD-159 and next AUD-160 with only the three existing diagnostic classes; the initial overly broad list-heading gap is retained in `T51-real-ledger-inventory.json` and corrected in the r2 artifact. No real ledger contents were changed or transferred.
- [x] T52 committed snapshot history validation - re-derive comparison reachability/reasons and validate next Scope baseline from actual Git objects before reconstructing provisional/carried candidates (R5 F-03; AC-03, AC-04).
      Evidence: Both historical and frozen provisional reconstruction accept forged rehashed history before correction (`T52-red.log`). Snapshot/assessment/ledger/batch integration then passes 126 tests/279 assertions (`T52-green.log`), including malformed comparison, unavailable ancestor falsely claimed scoped, injected reason and invalid next-scope controls in both reconstruction paths. Comparison resolution is shared with capture and re-derived from actual Git; scope format/ancestry are validated before rendering.
- [x] T53 bounded allocation-trial oracle - resolve the nonterminal UNKNOWN/STILL_PRESENT ambiguity in the allocation-only observation without admitting terminal claims, retain the original native failure, and obtain independent review of the correction (AC-02, AC-06).
      Evidence: The actual independent oracle review at `d71c8ed` confirms the prior nonterminal list does not weaken terminal gates, but finds the fixture ambiguous about whose verdict/checks it describes and recommends clarification. A-015 now states the single verdict is BUG-001's reassessment and its required original-scenario check has not run, keeping strict UNKNOWN. New-ID allocation remains an OPEN proposal. Accepted multi-verdict values for the genuinely mixed A-013 case are declared directly in its row, with no hidden ID override. The r8 failure and actual reviewer return remain retained; the clarified native trial is still required. Actual Copilot `behavior-r9` at committed `c5e79c3` passes the unchanged 15-case/nine-route oracle after this clarification, with complete required reads, actual model identity and preserved inputs/source. The original r8 false-failure and independent oracle critique remain retained; no failed receipt was relabelled.
- [x] T54 checked full-ledger maintenance - preserve severity placement, adopter-specific index cells, workstream membership, coverage/positive-observation truth and checked line-reference updates without removing historical findings or unrelated prose (private parity feedback; AC-02, AC-03, AC-05).
      Evidence: Six missing-layout/section-maintenance controls fail first (`T54-red.log`), followed by checked-line and fenced-note formatting reds. Declarative existing-section placement, required non-reserved index cells, explicit workstream membership and evidence-bound history-preserving section updates pass 157 affected tests/367 assertions, including actual CLI artifact inspection (`T54-final-green-r4.log`). Consumer `46508267` activates its literal existing layout and complete full-pass maintenance policy; normal hooks pass and all 61 adapter/retained-route tests pass (`T54-consumer-integration.log`). The real ledger is unchanged. Earlier path-only CLI assertion and generated-code-fence failures are retained. Independent paired semantic review still remains T24.
- [x] T55 dated legacy ledger notes - retain changed-status-only inline history and unchanged findings in the summary for the established adopter layout (private parity feedback; AC-02, AC-05).
      Evidence: Both unchanged and mixed changed/unchanged dated-ledger controls fail before correction (`T55-red.log`). Ledger/batch/report then passes 111 tests/266 assertions (`T55-final-green.log`), including the adopter's title-column annotation style. Unchanged OPEN/STILL_PRESENT and terminal history retain original rows/dates and receive no new inline note; current selected results and residuals remain in the source-bound summary. Changed statuses retain the established dated note/marker and unchanged heading anchor. The minimal generic layout keeps its previous note behavior.
- [x] T56 coherent consumer policy and coverage - restore complete local rules, missing challenge/operational details and valid heading links; keep shipping conventions as references rather than copied grants (private parity feedback; AC-05).
      Evidence: Concrete retained-policy and shipping-grant tests fail first (`T56-red.log`). Consumer commits `0f93d263` and `e08f792f` restore complete rules, canonical heading references/coupling homes, the ordinary operational code half and omitted adversarial source lines; copied unrelated shipping grants are removed. Normal hooks pass. The committed, current-default-reconciled adapter at `ad9c7faa` passes all 60 audit/retained-route tests with current shared helpers (`T56-consumer-final-green.log`). The initial static-term/home misses are retained in `T56-consumer-integration.log`; their canonical bindings are corrected. This is source integration, not a native marketplace or clean semantic-parity claim; T24 still requires the fresh full review.
- [x] T57 frozen consumer selection - resolve workstream/next/explicit IDs into presented exact compatible batches and reconcile the retained continuation/coupling rules without silent expansion (private parity feedback; AC-04, AC-05).
      Evidence: Missing frozen-selection text fails first (`T57-red.log`), then committed consumer `f61c80f2` passes its contracts through normal hooks. Actual requested-model `selection-model-r1` passes six read-only synthetic cases with complete required workflow reads: full workstream, next, explicit cross-workstream order, outside-selection coupling, discovered member and intentional lower-priority selection. Manual inspection confirms historical FIXED is not treated as fresh proof, original IDs stay frozen and no action is executed. Targets are shared `132583a`/consumer `f61c80f2`; this is workflow planning evidence, not marketplace or product execution.
- [x] T58 scoped consumer verification methods - define actual owned development target/key/row lookup, cleanup and absence methods; distinguish owned verification rebuilds from separately approved shared restarts (private parity feedback; AC-04, AC-05).
      Evidence: Current-scope callback and missing consumer-method controls fail first (`T58-scope-red.log`, `T58-consumer-red.log`). Controlled per-action scope resolution now validates all four fields and preserves pending resources after a changed/unavailable organization; exact valid two-organization cleanup succeeds once. The affected shared suite passes 120 tests/319 assertions (`T58-shared-final-green.log`). Consumer `da5347bc` defines real service/slot methods, concrete metadata lookup/revocation/row absence rules and safe transient helper handling; normal hooks and all 63 adapter/retained-route tests pass (`T58-consumer-integration.log`). Read-only local source inspection established the method signatures. No live token, row or runtime was created/restarted.
- [x] T59 consumer publication and CI conditions - expose the report-only delivery option, preserve private pending reports, reject skip-marked carry into code publication, retain squash-message CI rules and scope owned branch cleanup (private parity feedback; AC-04, AC-05).
      Evidence: The added report/CI contract fails first (`T59-red.log`). Consumer `76032146` preserves private/pending reports, separately requested report-only delivery, non-skip-marked explicit carry, full-range CI and sanitized squash messages. Owned-head cleanup is bound to the observed merged reviewed tip and an expected-tip delete; local refused deletion retains the ref. Normal consumer hooks and committed contracts pass (`T59-green.log`). Shared guidance requires actual consumer CI/publication policy; this grants no real shipment or branch deletion during the migration.
- [x] T60 shared-route rollback - remove/reapply only the audit route in shared instruction files and prove newer unrelated routes survive while retaining conflict checks for audit-owned bytes (private parity feedback; AC-05, AC-07).
      Evidence: The new shared-route preservation case fails first (`T60-red.log`). Rollback now patches only declared audit fragments in shared AGENTS and preserves newer unrelated committed, staged and working routes plus raw index bytes. Eight owned synthetic cases pass, including working/staged/symlink conflicts on both exclusive files and shared audit fragments (`T60-green.log`). The real caller and ledger remain unchanged.
- [x] T61 adoption-safe consumer contracts - distinguish candidate ledger/baseline guards from post-adoption checks and use a squash-stable internal changelog disposition (private parity feedback; AC-05, AC-07).
      Evidence: Missing adoption-safe guard fails first (`T61-red.log`). Candidate guards retain the unchanged reviewed ledger and unrelated-path restriction; post-adoption guards accept legitimate later committed history while rejecting dirty ledger bytes or changed disposition history. A synthetic squash-message check resolves the named internal disposition rather than an obsolete feature SHA. All 71 consumer audit/retained-route checks pass (`T61-integration.log`); real ledger bytes remain unchanged.
- [x] T62 blocked carry recovery - require owner reselection and renewed source freeze/checks/review before changing an approved carried-report scope (manual delivery trial inspection; AC-04, AC-05).
      Evidence: Manual inspection of the actual delivery trial identified an ambiguous code-only recovery suggestion. The missing scope-handoff contract fails (`T62-carry-red.log`), then consumer `4afc5c2a` explicitly requires owner reselection and renewed freeze, verification and review for any changed carried scope; normal hooks pass.
- [x] T63 retained consumer gates - restore explicit pre-merge integration/kind/engine checks, all legacy owner-judgment stops, top-claim challenge/full entries and disclosed automatic merge consequences, with parity controls (private R2; AC-04, AC-05).
      Evidence: The missing retained-gate contract fails (`T63-red.log`). The corrected consumer policy and bound legacy shipping excerpt require integration/kind/cross-engine gates, any user-visible/judgment owner merge, top-claim adversarial evidence and full new finding entries. Normal hooks pass (`T63-commit.log`). Shared authority distinguishes disclosed automatic merge CI from separately authorized manual release/deploy operations.
- [x] T64 internal record conventions - support consumer frontmatter and freeze generated documentation index changes before the final ledger/record metadata phase (private R2; AC-04, AC-05).
      Evidence: Optional consumer frontmatter fails first (`T64-red.log`). Shared record rendering now safely emits description/covers metadata; 38 batch checks pass (`T64-shared-green.log`). Additional actual Git checks prove frontmatter survives append-only bookkeeping, changed frontmatter stales review, a generated index may be frozen with source and an after-freeze index edit is rejected (`T64-index-green.log`). The local record policy requires stable scaffolding and generated-index regeneration before freeze; documentation workflow logic is unchanged.
- [x] T65 complete consumer continuation policy - define actor/organization/browser prerequisites, report defaults/pending reconciliation and red-CI continuation while keeping selected scope and current permissions (private R2; AC-04, AC-05).
      Evidence: Missing prerequisite/continuation text fails (`T65-red.log`). Consumer `85f8d271` specifies existing provisioned fixture actors or an exact per-batch provisioning handoff, scoped second-organization ownership/cleanup, explicit browser/IdP prerequisites, unmarked-by-default local reports, pending report publish/defer/supersede choices and reviewed non-forced red-CI follow-ups. Normal hooks pass; focused retained-gate/record/prerequisite contracts pass (`T65-green.log`). No actor, IdP, database or runtime was changed by these checks.
- [x] T66 rollback test state - remove only the adapter-specific executable contracts during rollback, preserve handoff/history and reapply their exact candidate bytes in the owned rehearsal (private R2; AC-05, AC-07).
      Evidence: Missing rollback-test state fails (`T66-red.log`). The rehearsal removes only four manifest-listed adapter test entrypoints, retains handoff/history, then reapplies exact committed test bytes. All nine owned rollback/conflict/route/index cases pass (`T66-green.log`). Unrelated test suites and real ledger bytes are preserved; no real rollback was performed.
- [x] T67 policy-transition recovery - append an explicit owner-handoff binding to current committed policy for cleanup-only reconciliation while preserving the original header/history and blocking forward effects (public R6 F-01; AC-04).
      Evidence: The missing transition path fails first (`T67-red.log`). An explicit owner-attested request binds the observed journal digest and exact current committed policy, appending a cleanup-only transition without replacing header/intents/history. Dirty policy, missing approval and stale digest are rejected; forward intents/recovery and old-batch completion stay blocked. The native/library recovery set passes 75 tests (`T67-final-green.log`), and an actual later batch changes from blocked to passing after old-policy absence reconciliation (`T67-later-batch-green.log`). Adapter calls retain the resource ID captured before cleanup, including a mutating fake lookup array. This remains operator-attested scoped cleanup, not an OS-proof grant.
- [x] T68 ambiguous index comments - reject canonical updates for index-section comments whose multiline visibility cannot be established by the supported row grammar (public R6 F-02; AC-02, AC-03).
      Evidence: The multiline inline-comment index fixture fails before correction (`T68-red.log`). Index-section comments outside code now produce an unsupported-structure gap, which the existing candidate and insertion boundaries reject. Focused inventory/ledger/batch checks pass 128 tests (`T68-green.log`); additional actual terminal/new-finding rejection controls pass (`T68-canonical-green.log`). This is a fail-closed supported-profile limitation, not a claim to parse every Markdown construct.
- [x] T69 runtime prerequisite - fail early with a specific Bun renderer prerequisite and document the supported minimum in user-facing compatibility/workflows (public R6 F-03; AC-01, AC-06).
      Evidence: The missing prerequisite check fails (`T69-red.log`); explicit old-version/absent-renderer controls and normal CLI checks pass seven tests (`T69-green.log`). Native operations and direct Markdown consumers check for Bun 1.4+ and its renderer. User compatibility/workflow guides name the prerequisite and same-version candidate reconstruction limit.
- [x] T70 recovery inspection wording - distinguish the inspection result's lack of authority from actual current owner/transport permission (manual actual-trial inspection; AC-04).
      Evidence: The actual current-policy recovery proposal in `recovery-model-r6/round-1` read every required input but described the inspection's unconditional limit sentence as conflicting with the supplied cleanup grant. The return now says this result grants no action, while current owner/transport authority is checked separately. No permission check changes. Round two also omitted part of a required reference, so the full r6 run remains failed and is retained; the bounded runner will require complete explicit reads on retry.
- [x] T71 remaining HTML visibility - reject every raw HTML block form and multiline inline tag outside code, and make ambiguous index comments invalidate identities/allocation/check/report eligibility consistently (public R7 F-01/F-02; AC-02, AC-03).
      Evidence: Processing-instruction/declaration/CDATA/multiline-tag and hidden-row eligibility controls fail first (`T71-html-red.log`, `T71-eligibility-red.log`). Unsupported HTML detection is shared by inventory and new bodies/section notes. Ambiguous index comments now invalidate identities and next-ID allocation as well as candidate writes; actual check/report controls reject terminal eligibility. All 143 affected inventory/ledger/report/batch tests pass (`T71-final-green.log`), including original supported literals and new fail-closed counterexamples.
- [x] T72 adopted cleanup policy - bind transitions to the freshly observed default policy rather than an unpublished local policy, retaining exact current permission and cleanup-only scope (public R7 F-03; AC-04).
      Evidence: An unpublished local policy transition passes before the new guard, so its negative control fails (`T72-red.log`). Transition now observes the actual remote default, requires the selected policy commit to be its ancestor and checks current/requested/default policy bytes for equality; the event retains that observed default. Offline and unpublished-policy controls reject without mutation. Native success uses a real disposable bare default transport; no Git URL/global credential rewrite. The combined affected recovery/native/batch set passes 82 tests (`T72-T73-final-green.log`).
- [x] T73 completed-run retention - allow explicit append-only retirement after reconciliation and preserve pending-state guards across an ordinary repository move (public R7 F-04; AC-04).
      Evidence: Missing retirement/move paths fail (`T73-red.log`). Explicit owner retirement requires all intents observed, serializes a final event against competing new intents and retains a zero-pending digest receipt. Interrupted receipt creation and exact retries reconcile once; pending key/merge controls reject. Actual native/library checks survive completed-root deletion and an ordinary repository move while preserving pending cleanup. All 82 affected checks pass (`T72-T73-final-green.log`). Retired runs cannot reactivate; unretired missing roots remain unknown and retained evidence is still required.
- [x] T74 documentation alignment - place runtime prerequisites under audit and align reviewer/index instructions with the actual source-freeze boundary (public R7 F-05/F-06; AC-01, AC-04).
      Evidence: Reader-facing runtime requirements now appear inside each audit section, and the bare Bun wording is replaced. Reviewer and record instructions agree with the existing tested ledger/record-only post-freeze boundary and explicitly exclude separate ledger-content-derived tracked indexes. Static section/link/whitespace inspection verifies this prose-only alignment; runtime source-freeze tests remain unchanged.
- [x] T75 consumer review tail - reconcile report-only publication with local CI rules, ordinary owned-slot setup, touched workers, checked delta summaries, historical heading annotations and exact parity homes/excerpts; route implementation moves to T94 (private R3; AC-04, AC-05).
      Progress: The prior blanket provisioning stop conflicted with the existing committed project constitution. Local policy now retains its ordinary newly owned nonzero-slot create/default-seed/destroy lifecycle, all touched workers, and no shared/IdP or unrelated-slot grant. Skip-marked reports are again the constitution-bound default; separate publication uses a newly rechecked skip-marked commit, and non-skip carry needs an explicit current CI-rule exception. Parity excerpts/homes are corrected. A new marker-clarity control fails first (`T75-heading-red.log`); all 79 ledger checks then pass with current-status supersession and an actual checked How-section delta summary (`T75-ledger-green.log`). Those non-route corrections pass the retained T75 controls and current 81-test committed consumer check (`consumer-source-r15.log`). The owner has since chosen the separate feature/PR route, whose implementation is tracked in T94; that dependency is not a remaining T75 condition. Final completion remains pending the new tasks/review.
- [x] T76 existing inline placeholders - retain supported inline angle-placeholder text outside the index while keeping raw block/index/new-body visibility guards (real-adopter compatibility; AC-02, AC-03).
      Evidence: The read-only real ledger initially gained an unsupported gap under the over-broad raw-HTML guard. A synthetic inline-placeholder control fails (`T76-placeholder-red.log`), then preserves the intended existing format while strict index/new-body controls remain. Current structure-only recheck returns the original 122 findings, the original three diagnostic classes and AUD-160; the real ledger hash remains unchanged. No private finding content was exported.
- [x] T77 rendered index rows - identify rows and insertion bounds only in actual rendered Markdown tables, keeping pipe-shaped prose/reference IDs out of finding identity (R7 visibility root cause; AC-02, AC-03).
      Evidence: A pipe-shaped paragraph is falsely counted as an index identity before the change (`T77-rendered-rows-red.log`). Renderer-mapped physical rows and table ends now govern inventory/insertion. All 147 affected inventory/ledger/report/batch checks pass (`T76-T77-green.log`), including HTML negatives, placeholder compatibility and the non-table-reference control. The real ledger retains its original structure result (`T77-real-ledger-inventory.json`).
- [x] T78 observation-only old effects - permit current-policy read-only receipts for existing non-resource effects after handoff, never execution/replay, so completed old runs can retire (public R8 F-01; AC-04).
      Evidence: Merge-only policy-drift cases fail before correction (`T78-red.log`). Any pending intent may now transition under the same explicit adopted-policy handoff. An observed existing merge receives one distinct observation-only receipt; absent/unknown state stays pending and the execute callback is never called. Native and library observation/retirement paths pass (`T78-final-green.log`, included in the 166-test affected set). No real merge or remote action occurred.
- [x] T79 diagnostic readiness and profile prose - report repository-wide registered cleanup readiness and align index-comment documentation with renderer-derived identities/allocation (public R8 F-02/F-03; AC-02, AC-04).
      Evidence: A two-run readiness control fails first (`T79-readiness-red.log`), then the inspector reports the same repository-wide cleanup restriction as admission, with a read-only readiness handoff for unknown/unregistered state. Old pipe-row-scanner wording is removed. The combined 166-test recovery/native/batch/ledger set passes (`T78-T80-green.log`).
- [x] T80 selected-fix ledger and consumer report flow - keep fix-only marker/index/inline history without a permanent provisional overview, allow keep-private report followed by selected fixes, classify report publication under the actual shipping constitution and bind its complete delegated rules (private R4; AC-03, AC-04, AC-05).
      Evidence: The dated fix-layout case fails first (`T80-layout-red.log`); fix proposals now omit pass banners/category summaries/pending-review claims while reverify/full retains them. All 166 affected tests pass (`T78-T80-green.log`). Focused real consumer parity/report-flow checks pass (`T80-consumer-final-green.log`); normal hooks remain required. Q1 remains the separate unresolved route decision and T75 stays open.
- [x] T81 `scripts/audit/ledger.ts`, dated-layout controls and settings guidance - preserve per-finding provenance for unchanged selected fix statuses without reintroducing a pass summary (public R9 F-01; AC-03, AC-04).
      Evidence: An all-unchanged FIXED candidate is byte-identical before the correction (`T81-red.log`). Fix-mode inline notes now retain every selected member while index/status markers remain changed-only. Both assessment-only and structurally attested authored-repair cases pass with the frozen candidate checks; 122 ledger/batch tests pass (`T81-final-green.log`). The real ledger remains untouched.
- [x] T82 `references/audit.md` and recovery controls - persist non-resource intents only at the execution boundary and document retained handoffs for declined effects, without claiming retirement or absence from missing artifacts (public R9 F-02; AC-04).
      Evidence: Chose public R9's documentation option: persist a non-resource intent only after its last gate, and retain a later declined/absent effect as an unretired handoff. All 15 recovery checks pass (`T82-retained-handoff-green.log`), including no execution, retirement refusal, later scoped-resource cleanup while the root is retained, and unknown-state refusal if it is removed. No failing code test was applicable: existing behavior already enforces this retained state. No withdrawal grant or event schema was added.
- [x] T83 `references/audit-record.md`, consumer follow-up policy and batch controls - make non-forced post-CI source refreezing executable and name the owner handoff when default advances after publication (private R5 F-01; AC-04, AC-05).
      Evidence: The real disposable Git rehearsal has 43 passing batch tests (`T83-rehearsal-first.log`): the naive follow-up fails the exact Task-base ledger condition, restored-ledger/new-source/candidate/record refreezing passes without rewriting its published ancestor, and advanced default refuses the old batch. The consumer contract is red on missing instructions (`T83-consumer-red.log`), then the focused guidance test passes. Consumer `4772ade5` retains normal hooks. The intermediate whole-candidate attempt correctly refuses uncommitted procedure bytes; a committed rerun is retained separately. This clarifies the accepted route without adding rewrite/publication authority.
- [x] T91 shared/consumer provenance guidance, summary renderer and follow-up record policy - align every selected fix's note, keep permanent summaries free of pending workflow state and require a fresh run for an explicitly approved rebase (R-13 F-06; private R6; AC-03, AC-04, AC-05).
      Evidence: A permanent-authority reminder and missing consumer instruction controls fail first (`T91-summary-red.log`, `T91-consumer-red.log`). All 125 ledger/batch controls pass after the output/guidance correction (`T91-shared-green.log`); the focused consumer contract also passes. Normal consumer hooks and committed-candidate checks remain required. No YAML loader or live effect was implemented.
- [x] T89 plugin manifests and package-version contract - reserve coherent audit plugin 0.8.0 before any further package implementation; the already observed collision red becomes a passing package check covering the entire current package diff, including T91 (AC-01, AC-07).
      Evidence: The current-main collision fails first (`T89-red.log`: version 0.7.0 equals main). Both component manifests now reserve 0.8.0; the complete package contract passes (`T89-green.log`), covering the full package diff including T91. The runtime lock stays at verified 0.9.0. No feature publication or current YAML behavior is inferred.
- [x] T84 `tests/vh-adlc/audit/settings.test.ts`, authority and example contracts - observe strict YAML, working/committed alternate-suffix, stale-link, full committed-schema/same-commit path, exact byte/value match, offline cached/uncached and distinct reader-failure controls fail before converting the audit loader; positive fixture writers use actual commented block YAML rejected by JSON.parse (AC-02, AC-04).
      Evidence: Captured the actual rich old-loader output from an owned synthetic fixture at `5b5b06d` in `fixtures/legacy-settings.json`. New `yaml-settings.test.ts` observes 18 failures before implementation (`T84-yaml-final-red.log`): YAML/alternate suffixes, committed declaration/link/tree and byte checks, safe reader refusal, and real isolated missing/impostor binary sentinels. The shared fixture writer must emit commented block YAML. Existing settings/package controls still pass (`T84-existing-baseline.log`). These are intentional TDD reds; no criterion is ticked or migration behavior claimed.
- [x] T85 `scripts/audit/settings.ts`, `authority.ts` and shared settings integration - reuse the strict shared reader with optional offline mode for working and fully validated committed YAML, preserve other callers and prove no grant on failure; T84 passes (AC-02, AC-04).
      Evidence: The 18 YAML controls failed before implementation (`T84-yaml-final-red.log`). The strict offline loader, full same-commit policy schema/path validation and exact byte comparison now pass with the standalone YAML example (`T85-yaml-final.log`: 44 tests, 114 assertions). Authority and unchanged triage/maintenance/shared-reader controls pass (`T85-neutral.log`: 133 tests, 283 assertions). Cold child tests disable Bun’s own transpiler cache so the sentinels measure audit bootstrap writes. The obsolete example JSON is removed. Broader audit checks and new page/recovery obligations remain separate; no adoption or criterion completion is claimed.
- [x] T96 `scripts/audit/settings.ts`, `types.ts`, settings output and config/entry contracts - implement optional declared knowledge_pages and the deterministic normalized mandatory-plus-declared set; explicit setup/conversion checks that set against declared local obligations; entry never infers languages and only requests/verifies the normalized set; unsafe/duplicate pages and unseeded requests fail (R-18 F-01) (AC-01, AC-02, AC-06).
      Evidence: All 19 new controls fail before implementation (`T96-complete-red.log`). The normalized mandatory-plus-declared page list, unsafe/duplicate input denials and explicit setup obligation mismatch now pass with YAML and old-value compatibility (`T96-green.log`: 63 tests, 134 assertions). Entry and native trial wiring use this list in T92/T88; no runtime language inference is introduced. The preceding converted audit and retained settings suite also completed: 452 tests, 1,197 assertions, zero failures (`T85-full-audit.log`).
- [x] T86 `references/audit-settings.md`, examples, `docs/user-guides/workflows.md`, installation, compatibility and marketplace guides - replace active audit JSON setup and 0.7.0 audit claims with readable YAML/0.8.0 guidance and exact reader prerequisites; package checks require the inline and standalone examples to be commented block YAML rejected by JSON.parse and load, with invalid inputs refused (AC-01, AC-02).
      Evidence: Three onboarding/reference controls fail first (`T86-red.log`), then the actual inline and standalone commented block YAML load through the verified reader; both reject JSON.parse and declare TypeScript. Setup, distinct failure causes and audit plugin 0.8.0 guidance pass with existing settings and the complete package checker (`T86-green.log`: 85 tests, 250 assertions). Other operations retain their 0.7.0 YAML guidance. Actual offline entry/install acceptance remains T92/T88.
- [x] T92 `skills/vh-adlc-audit/SKILL.md`, `references/loop.md`, `references/lifecycle.md` and entry trials - force direct and intake-routed audit bootstrap/knowledge offline before any installer, preserve other routes and pass complete/empty/partial-cache isolated PATH/HOME/XDG sentinel cases after recording both setup steps (AC-01, AC-06).
      Evidence: After correcting the initial fixture lock-field mismatch, five entry controls fail for missing product bootstrap/routing (`T92-red-r2.log`). The portable executor and direct/intake instructions now pass complete/empty/partial-docs and missing-binary cases with the retained setup hashes/native exits/no-write observations in `T92-entry-native-r1/`; all 69 affected package/discovery/intake/onboarding checks pass (`T92-final-green.log`). The setup runner checks declared local obligations; ordinary entry never guesses languages or goes online. These bounded executor/instruction tests do not claim an actual model chose the route; that remains in T22.
- [ ] T94 `references/audit.md`, `audit-record.md`, `audit-review.md`, `lifecycle.md`, audit authority messages, consumer policy/parity and generic/consumer selection contracts - state the separate feature/PR route, owner merge, retained member visibility and explicit reselection in all generic/reviewer/local instructions; refuse a planning exception as in-batch eligibility and retain visible-restoration judgment stops; package and actual model cases pass (AC-04, AC-05).
      Progress: The generic four-file route contract failed first (`T94-red.log`) and now passes with retained discovery/intake contracts (`T94-shared-green.log`: 9 tests, 71 assertions). The shared wording and authority denial require separate specified feature/PR, owner merge and visible members until explicit reselection. The actual-model route case is added for T22. The coupled YAML/policy consumer candidate at 6206122d and its non-forced current-default reconciliation pass all 83 audit/adjacent-route checks (`consumer-yaml-r17.log`). Copilot behavior-r13 judged all 16 cases/routes correctly, but its source-preservation check failed because this writer edited the shared tree during the trial; it is retained as failed evidence. T94 stays open for the frozen-tree rerun under T22.
- [x] T93 shared batch/record controls and consumer re-ground policy - test both default-advance rebuild routes, private archival plus old branch-owned record/index removal, stale-record refusal and re-observed new pre-fix red/final green; correct fresh-run sequence passes without granting a rewrite (AC-04, AC-05).
      Evidence: A fully declared stale record before freeze produces an actual false pass (`T93-record-real-red.log`); fenced examples and historical-path overwrite controls also fail before their fixes. Renderer-aware extra-record checks pass with both actual disposable new-branch/rebase rebuild routes (`T93-full-green.log`: 47 tests, 97 assertions); the final historical/overwrite/fenced controls pass in `T93-final-focused.log`. The rebuilds retain old refs/proof, use new journals, execute real regressions red at new pre-fix commits and green after repair, and remove only branch-owned record/index entries before freeze. Consumer guidance/contract pass (`T93-consumer-green.log`). No real feature history was rewritten.
- [x] T95 `scripts/audit/journal.ts`, `recovery.ts`, `cli.ts`, batch readiness, `references/audit.md` and native recovery controls - add hash/intent-bound retained-absence observations with exact explicit journal-only handoff, using candidate YAML only for bound identity before adoption and current YAML after adoption, including after policy transition; permit only this event's inspect-mode append exception and reject arbitrary reasons/unknown/resources/stale/no-write inputs and every replay/old-batch execution attempt (AC-04, AC-05).
      Evidence: All 25 initial typed-absence/native/all-kind controls fail before implementation (`T95-red.log`). The hash/intent/header/registration-bound journal-only recorder preserves policy state across candidate drift and cleanup transitions, rejects resources, unknown results, mismatches, stale/no-write requests and replay, and keeps retained runs unretirable. Existing resource cleanup, observed-outcome and native CLI recovery remain green (`T95-recovery-green.log`: 74 tests, 321 assertions). The actual batch gate refuses retained absent effects while valid/history controls pass (`T95-batch-green.log`). All-kind inventory is separate from resource-only live admission; no effect or candidate-policy activation is granted.
- [ ] T87 `Stackweaver:.vh-adlc/audit.yaml`, audit references and migration fixtures - convert actual commented block YAML rejected by JSON.parse preserving existing values and explicitly declaring knowledge_pages, update parity/rollback, enforce all-kind registered-intent inspection in actual cutover preflight, refusing unknown/active non-resource effects, pending resources and unknown roots while admitting only typed retained-absence observations and explicitly rejecting free-reason handoffs, and verify the real ledger plus unrelated routes unchanged; keep other settings adoption separately owned (AC-05).
      Progress: Actual commented YAML preserves every original config value and declares Go/TypeScript/React. The real ledger remains SHA256 c0eb6250334fbb592ed955c595b24aea2d796f5c1c7b5279672e26065807d769. Ten all-kind cutover controls fail first (`T87-all-intent-red.log`), then all 13 preflight controls pass (`T87-all-intent-green.log`), including typed-absence admission, active effects/resources/free reasons and unknown roots. Consumer commit f6c44ddd retains the normal five passing hooks with zero skips; actual registered inventory is empty (`consumer-actual-registered-r1.json`). The broader 94-test r18 attempt has 92 passes and two correct stale-default denials after main advanced again. Final current-default reconciliation and full committed-candidate verification remain open; no adoption is claimed.
- [x] T90 `tests/vh-adlc/audit/format-recovery.test.ts` - cross the actual YAML settings-digest change with a retained declined non-resource run and resource/unknown-root negatives, observing the stated cutover and new-run behavior without replay (AC-04).
      Evidence: The genuine historical public runtime from Git commit 5ed104cd is retained as a hash-checked test archive, not a reconstructed header or installed agent. Its native JSON journal-new/intent/handoff commands produce the old header; current YAML changes the actual settings digest. Retained absence preserves that immutable header and inactive policy, never replays/retires it, and permits a separately selected new run. Resource and missing-root negatives remain blocked. Native command outputs/digests are retained in `T90-native-format-r2/`; all seven format/isolated-entry checks pass (`T90-final-green.log`). These additional compatibility controls pass after the production fix driven by T95’s earlier failing tests; no artificial failure was introduced. Explicit fixture setup now prepares the locked reader outside consumer/entry subprocesses, preserving cold-entry denial.
- [ ] T88 native audit trial and consumer minimum-version checks - reject older operation payloads and rerun native install/discovery/helper/reinstall with explicit locked-binary and full pinned-doc page setup plus complete/empty/partial-cache offline controls (AC-01, AC-06, AC-07).
      Progress: The old 0.7 payload fails the new minimum-version control before its fix (`T88-version-red.log`); the four structural native-install controls pass afterward (`T88-version-green.log`). The runner now uses isolated HOME/XDG/native profiles without inherited credentials, explicit verified-binary/full-page setup and actual installed-payload warm/empty/partial offline entry cases. Source is committed before the native run so its exact payload and test runner are reviewable. Actual two-host outcomes are still pending; T88 remains unchecked.
- [ ] T22 `tests/vh-adlc/audit/trial-proof.ts` and bounded synthetic trial runners - execute actual Copilot Opus 5.5 audit/repair/recovery trials at a committed payload, including independent repair review and adverse controls; raw transcripts, native exits and manual inspections establish the declared scenarios (AC-01, AC-03, AC-04, AC-06).
- [x] T23 `tests/vh-adlc/audit/install-trial.ts` and native acceptance artifacts - execute isolated native Codex/Claude candidate install/discovery/helper/reinstall tests, matching actual bytes/modes and source/index preservation; retain failures and distinguish local catalog from published marketplace (AC-01, AC-06, AC-07).
      Evidence: Actual isolated Codex CLI and Claude CLI native installers at `deb1d7fcb60b416a7980fdf0825acd2d3a94e77d` both pass (`native-install-r2/result.json`): twelve native skills, installed settings/inventory/report helpers, unchanged source/index and identical byte/mode payload after uninstall/reinstall. No authentication/configuration is copied or model invoked by installers. The short-SHA launch failure remains `native-install-r1-launch.log`; four verifier negative-control tests pass. This is local-catalog candidate evidence, not published-marketplace, real Claude model or GUI acceptance.
- [ ] T24 `Stackweaver:tests/agent-audit/parity.json`, migration fixtures and paired review artifacts - independently verify full legacy-to-map/adapter coverage and bounded consumer policy behavior at exact commits, correcting omissions and rerunning affected checks; no private packet is transferred without applicable approval (AC-05, AC-06).
- [ ] T25 `docs/specs/shared-audit.md` and exact committed feature/consumer snapshots - run the complete required local gates and independent implementation review, resolve all criterion gaps and preserve R-12 recovery evidence; source completion requires every current criterion met/residualised by the approved process, while actual marketplace/post-merge checks remain the ordered delivery obligations (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07).

## Open Questions

None. Q1 was answered on 2026-11-03 and folded into Design, Test Plan and T94.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-01 | R-1 | spec | `5bddd847fc28744bb1ebe0a7d626f5b502f5645e` | claude-opus-5.5 | procedural | Blocking authority gap; repair/batch/ledger policy decisions and preflight clarification required. |
| 2026-11-02 | R-2 | spec | `773c703b5a3f2b6f4773afe45b9f8e7e158ad0f8` | claude-opus-5.5 | procedural | Batch record/review dispatch needs explicit per-member fields and negative checks. |
| 2026-11-02 | R-3 | spec | `cd10c08964a0b759f10b38b5f90fa9808db20241` | claude-opus-5.5 | procedural | Specify the authorization declaration and ledger/review ordering. |
| 2026-11-02 | R-4 | spec | `c68255a2114b4d298948af9913468eeec4424528` | claude-opus-5.5 | procedural | Map retained live verification, ledger-only commit placement and request-versus-standing effects. |
| 2026-11-02 | R-5 | spec | `0bd3d6f0375ed09590529166f4e95c307b3cc69b` | claude-opus-5.5 | procedural | Bind uncommitted ledger application to its isolated assessed source. |
| 2026-11-02 | R-6 | spec | `ba3eef8de01afc773e70b4c3a5c43dca0934c97a` | claude-opus-5.5 | procedural | Preserve delta-scoping baselines across squash merge and missing history. |
| 2026-11-02 | R-7 | spec | `b73cc50de4e94dfded9dbee2e06b7394eecc0ae8` | claude-opus-5.5 | procedural | Review carried ledger updates in the full publication range; name the audit-specific review. |
| 2026-11-02 | R-8 | spec | `ac789a95aa362337face903e8e9fa41b41b622e9` | claude-opus-5.5 | procedural | Define non-self-referential verification target and stale selected-finding outcomes; raw footer retained. |
| 2026-11-02 | R-9 | spec | `be05ddd32aa077c4de5278a4dabda1d9fa8c1e68` | claude-opus-5.5 | procedural | Require actual consumer policy validation before and after cutover. |
| 2026-11-02 | R-10 | spec | `56ae457872568ae37ee6841aa93bd940cf09bc58` | claude-opus-5.5 | procedural | Define audit intake priority, bound parity-map artifact/completeness and owned cleanup. |
| 2026-11-02 | R-11 | spec | `7eda0b6b00931ac1114861619e87bc73dc528f8c` | claude-opus-5.5 | procedural | Track temporary live-test resources across interruption and resume cleanup. |
| 2026-11-02 | R-12 | spec | `67a91a17944bb219ce956364963531532577c396` | claude-opus-5.5 | procedural | No blocking findings; post-merge outcome placement/recovery remains an implementation proof obligation. |
| 2026-11-02 | R-12 | spec | `67a91a17944bb219ce956364963531532577c396` | n/a | n/a | accepted by owner |
| 2026-11-03 | R-13 | spec | `dd878483b9eb6908b56c9c401db766cae2f46c3a` | claude-opus-5.5 | procedural | YAML validation/offline/cutover/ordering clarifications required; factual coverage and wording corrections. |
| 2026-11-03 | R-14 | spec | `adb0c49988fc9fee05329fd21494e2f94729fe15` | claude-opus-5.5 | procedural | Skill-level offline, cutover enforcement, superseded record and fixture proof corrections required. |
| 2026-11-03 | R-15 | spec | `24831961330d64f9e7f12649a95bee7129638bff` | claude-opus-5.5 | procedural | Intake/offline evidence, active-effect cutover checks, shared routing and guide proof corrections required. |
| 2026-11-03 | R-16 | spec | `0f2e6f71fbb30b2fd40a5403e2f6e1cbf21f72d3` | claude-opus-5.5 | procedural | Pinned-doc cache setup and distinguishable retained-absence observation still need specification. |
| 2026-11-03 | R-17 | spec | `daeee127e424ee60e74f4b51dd787e461f1b11a1` | claude-opus-5.5 | procedural | Recorder identity, typed-event wording, deterministic page set and evidence details need correction. |
| 2026-11-03 | R-18 | spec | `e471cf650f687c677b0e6fcd5d4e8709b0623d15` | claude-opus-5.5 | procedural | No blocking/should-fix findings; two nits: setup-time page checking and historical proof label. |
| 2026-11-03 | R-18 | spec | `e471cf650f687c677b0e6fcd5d4e8709b0623d15` | n/a | n/a | accepted by owner |

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

### R-6

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Entry points and modes; Remediation and delivery authority; Test Plan AC-03, AC-04
EVIDENCE: shared-audit.md:106-107 says default reverify will "scope changes since each recorded baseline". Under shared-audit.md:393-396, a fix batch prepares and commits its ledger status, index and evidence updates on "the selected unpublished source branch before the final-head review". shared-audit.md:373-379 records each member's "pre-fix commit", "repair commit" and "exact review target" on that branch. shared-audit.md:415-417 keeps Stackweaver's "conditional squash merge", and authority.md:26 and authority.md:92 already plan for merged-branch deletion and refs that survive "after a squash". After a squash merge, the branch commits that the pre-merge ledger update can cite are not reachable from the default branch. That update cannot name the later squash commit either. The spec does not say which baseline a fix batch writes into the ledger. It also does not say what a later reverify does when a recorded baseline is unresolvable or not an ancestor of the assessed default source. No Test Plan row covers a reverify after a squash-merged fix batch. An implementation could fail the delta scan, silently skip scoping, or pick its own fallback. This affects the stable re-verification behavior that AC-03 and AC-05 must preserve.
PROPOSAL: Define the baseline that a fix-batch ledger update records so that it stays resolvable after a squash merge, for example the reachable task base plus the batch reference. Also define how reverify handles a recorded baseline that is missing or not an ancestor: treat it as unscoped and reassess fully, and never treat it as unchanged. Add an AC-03/AC-04 synthetic case in which a squash-merged batch with its branch deleted is followed by reverify.

### R-7

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Entry points and modes; Remediation and delivery authority; Test Plan AC-04
EVIDENCE: Lines 156-160 let a fix repair worktree "start at the recorded ledger commit" from a reverify/full run, "Record that ledger commit as Task base before authored repairs", and say "its known report update is part of the selected batch's later reviewed publication scope". The audit batch reviewer, however, checks the "actual diff from task base" (line 384). The record's Definition and affected paths are also measured from that Task base (lines 365-366 and 393-395). So the reviewer never sees the reverify/full ledger commit, including any FIXED/MOOT verdicts it holds. Even so, the batch push and Stackweaver's conditional squash merge (lines 309-311 and 441-443) would publish it. That conflicts with "Reverify/full never inherit fix's remote permission" (line 314) and with the claim that the commit falls within reviewed publication scope. The AC-04 row only checks that this commit can become the repair base while the default ancestor stays the Scope baseline. It does not check that the review covers the commit or that publication handles it.
PROPOSAL: Say whether the batch review diff starts at the Scope baseline (the default ancestor) so the carried ledger-only commit is reviewed, or whether that commit must be published separately under its own authority before it can serve as a fix Task base. Add an AC-04 negative case in which an unreviewed carried reverify verdict cannot be pushed or conditionally merged with the batch.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design, Evidence, updates and recovery
EVIDENCE: Line 213 says an authored fix's FIXED verdict requires a "current independent bounded-maintenance or feature review". Lines 381-391 say a fix batch must use the audit-specific `references/audit-review.md` reviewer and must not "dispatch an unchanged ordinary maintenance reviewer as if it covered these extra obligations". They also say "The existing maintenance record and reviewer stay unchanged". Read on its own, line 213 could be satisfied by `maintenance-review.md`.
PROPOSAL: Change line 213 to require the current independent audit batch review (`references/audit-review.md`) or a feature review, so it matches the later dispatch rule.

### R-8

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Remediation and delivery authority (fix batch ledger ordering and Scope baseline); Test Plan AC-04
EVIDENCE: shared-audit.md:406-408 says to "Prepare and commit those proposed updates on the selected unpublished source branch before the final-head review". Lines 428-430 say "Every new dated ledger update records a `Scope baseline` ... plus its batch/run reference and the real `Verified source` commit". Lines 383-384 say "Every member's final required checks must actually establish that member at the final head". Lines 422-425 say "Every actual ledger status/index/content change after that review is a material change and stales it". A ledger commit cannot name its own SHA or a later final head, so the `Verified source` that a fix batch writes into the ledger must be an earlier commit than the reviewed final target. The spec does not say which commit that is. It also does not require that the diff from that commit to the final target touches only the ledger, index and record paths, and it does not ask the batch reviewer to check this. An implementation could leave a placeholder and fill it in after the review, which stales the review under lines 422-425 and creates the loop that line 426 says this ordering avoids. Or it could name a pre-fix or intermediate source commit that the final checks did not establish. The AC-04 row (line 538) covers ledger edits after review and squash or baseline handling, but it has no case for the fix-batch `Verified source` value.
PROPOSAL: Define the fix-batch ledger `Verified source` as the last source commit before the ledger-only commit. Require the diff from that commit to the final review target to contain only the ledger, index and record paths, and have the audit batch reviewer check this. Add an AC-04 negative case where a source change after the named `Verified source`, or a placeholder filled in after the review, prevents a clean or fresh review.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Entry points and modes (`fix`); Remediation and delivery authority (batch Definition and Evidence); Test Plan AC-04
EVIDENCE: shared-audit.md:116-118 says `fix` will "Re-ground every selected finding ... write and observe a failing regression first". Lines 379-380 require each member's Evidence to include "pre-fix commit and observed failing regression, repair commit". Line 398 says "Every selected repair member still requires its own red/green and final-target evidence". Line 362 says "A newly added member, changed Definition ... invalidates that review". Line 119 says "A scope change or next workstream needs the consumer's existing selection boundary". The spec does not say what happens when re-grounding shows that a selected member is already FIXED, MOOT, PARTIAL or not reproducible at the Scope baseline. In that case no honest failing regression exists, and lines 113 and 383 forbid inventing one. Several readings are possible. The batch could block. The member could be removed from the Definition, which may count as a selection change that needs the owner. Or a reverify-style verdict could be recorded in the batch ledger update, which would then need the separate adversarial challenge from line 216 rather than red/green. The AC-04 trial uses two findings that both reproduce and has no stale-selection case. This is the persistent-ledger situation that reverify drift is meant to expose.
PROPOSAL: State the outcome for a selected member that re-grounding finds already fixed, moot, partial or not reproducible. For example: stop and present it, record any terminal verdict as a non-authored reverify observation with its own adversarial challenge and no red/green claim, and remove it from the repair Definition only through the consumer's selection boundary before the record is fixed. Add an AC-04 synthetic case where one selected member no longer reproduces.

<br>

Two should-fix judgement findings, no blockers. The launcher passed:
- **Files:** All 72 committed blobs matched.
- **Lint:** Both specs passed `vh-adlc lint`.
- **Worktrees:** Both repositories' worktrees, indexes and refs were left unchanged.
- **Stackweaver policy:** All 20 bounded checks on Stackweaver's audit policy were present.
- **Context figures:** The spec's figures matched: 991 lines, 67 ID headings, 7 headings citing other findings, highest ID AUD-159, eleven skills, plugin 0.6.0.

### R-9
FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Remediation and delivery authority; Stackweaver adapter, parity and rollback; Test Plan AC-05, AC-07
EVIDENCE: shared-audit.md:254-260 says the standing grant comes only from a `Standing audit workflow authorization` declaration "reached through freshly fetched, committed default-branch AGENTS and audit settings", and that "Uncommitted or unmerged declarations, alternate origins, fixture-only adapters, copied settings ... confer no authority". Lines 282-284 say any missing, duplicate or unknown row, wrong identity, branch or path, or unresolved fragment means the declaration "grants no effect". Lines 316-319 depend on Stackweaver's own declaration for the ledger update/commit, issue, push/PR and conditional merge it keeps today, and lines 326-327 depend on it for the live gate. Lines 504-507 put that declaration in the new `agents/audit-project.md` and `.vh-adlc/audit.json` on the migration branch. The AC-04 helper trials (line 577) run only on synthetic declarations. The AC-05 proof (line 578) lists consumer contracts, Copilot policy trials, hashes, command metadata and rollback/reapply. The AC-07 preflight (lines 547-553, 580) binds the installed audit skill and payload. No criterion or proof runs the shared `scripts/audit/authority.ts` over Stackweaver's actual committed declaration, its fragment pointers into the real project procedure and its real origin/default branch. That check is not required before the consumer merge as a validation that grants nothing, and it is not required as a read-only check from the fetched default branch after the merge. Because an invalid declaration fails closed, one typo or a fragment that does not resolve would silently remove Stackweaver's adopted ledger-commit, live-verify and conditional-merge permissions. The synthetic AC-04/AC-05 evidence and the AC-07 preflight would still pass, so AC-05 could be ticked even though the retained authority behavior is gone.
PROPOSAL: Add an AC-05 consumer contract that runs the actual shared authority helper over the migration branch's committed declaration and settings. It should check shape, coherence, field values and fragment resolution, and it must be explicitly non-granting before the merge. Also require a read-only post-merge check from the freshly fetched default branch that records the resolved effects per mode, so the cutover evidence shows the adopted grants match the parity map. Any mismatch blocks or rolls back the cutover.

### R-10

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Entry points and modes; Test Plan AC-01
EVIDENCE: shared-audit.md:102-103 says ordinary-language requests "enter through the existing lifecycle intake without consuming unrelated investigation or triage requests". AC-01 (line 581) requires that intake "preserve other routes". lifecycle.md:43 already sends "Diagnosis or findings" to vh-adlc-investigate. lifecycle.md:46 already sends "Dependency or security sweep" to vh-adlc-maintenance. maintenance SKILL.md:3 says "Sweep dependency and security maintenance". The spec does not say what separates a persistent codebase audit request from a maintenance security sweep or an investigation for findings. Examples are "audit the code for security issues" and "check our vulnerabilities". It also never says whether a configured `.vh-adlc/audit.json` ledger is a precondition for the audit route. The AC-01 proof (line 593) only says "Extend the package/discovery/intake contracts" and then runs audit modes. It has no negative routing case showing that sweep, diagnosis or triage requests still reach their existing procedures. An implementation could add a lifecycle row that takes over security sweeps, and AC-01 would still pass.
PROPOSAL: Define the intake predicate for the new lifecycle row, for example an explicit persistent-ledger audit request or a configured audit ledger, and say how it gives way to the investigation and dependency/security-sweep rows. Add AC-01 intake cases where security-sweep, diagnosis and triage requests keep their current routes and an ambiguous request gets the focused scope question.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stackweaver adapter, parity and rollback; Acceptance Criteria AC-05; Test Plan AC-05
EVIDENCE: Lines 511-517 say "Before implementation record a row-by-row parity map", where each row names "its shared procedure or retained local home and an executable contract/scenario". Lines 529-530 make the candidate authority check compare "declared mode effects with the parity map". Line 538 makes the post-merge check compare against "the same parity map". AC-05 (line 585) is met when the adapter "preserves every parity-mapped audit behavior". The spec does not say where the map is stored, what format it uses, what legacy procedure blob it is bound to, or who checks that it is complete. If the map is added to this document after acceptance, it changes Design and is a normative revision. If it lives in the consumer migration change, the same author writes both the map and the adapter it validates, and no step checks that every legacy rule has a row. A map with missing rows would let AC-05 and both helper comparisons pass while a legacy behavior disappears.
PROPOSAL: Name the parity map's artifact and location, for example a committed consumer file under `tests/agent-audit/` bound to legacy `agents/codebase-audit.md` blob `e6efd348`, and give it a structure the helper comparisons can read. Require the paired migration review to check that the map covers the legacy procedure and the rows listed at lines 511-516.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, Entry points and modes (owned ledger worktree)
EVIDENCE: Lines 150-152 say the audit extension "permits ordinary creation of this owned ledger role and the selected repair worktree; it grants no cleanup of unrelated refs/worktrees or force deletion". authority.md:69 says that outside the maintenance roles, the procedure must "never create, remove, prune, reset or force-move a worktree". The maintenance roles at authority.md:85-93 explicitly allow "ordinary creation and non-forced cleanup" of clean owned worktrees. Lines 134-136 create a new `chore/audit-ledger-<run-id>` worktree for every permitted reverify or full application. Stackweaver's adopted rule allows this on each run. The spec never says whether the procedure may remove its own clean owned audit worktrees after the ledger commit is published, carried into a repair or superseded. Implementations would either leave them to accumulate or make up a cleanup rule.
PROPOSAL: Give the audit ledger and repair roles the same non-forced cleanup the maintenance roles have: clean owned worktrees only, refs kept when ordinary deletion refuses, and pending or private ledger commits preserved. Alternatively, state that cleanup is left to the owner.

### R-11

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Evidence, updates and recovery; Design, Remediation and delivery authority (retained live gate); Test Plan AC-04
EVIDENCE: shared-audit.md:349-358 has an adopted `live-verify` effect run "scoped temporary test-key creation/use/revocation where necessary, owned test-data operations and row-scoped cleanup" under the local verification_policy. check.sh reported scoped_token (`CreateAPIKey`) and row_cleanup as present in Stackweaver's procedure. The recovery rule at shared-audit.md:263-266 only preserves "the snapshot, assessment, report/candidate and completed local Git work". On resume it inspects only "real Git/source/artifact state" and avoids duplicating "dated notes, findings, commits, issues or PRs". AC-04 (line 635) requires recovery from interruption "without silently replaying stale or duplicating completed effects". The AC-04 proof (line 647) interrupts only "after saved report, local commit and accepted fake remote effect with lost response". It observes temporary key and test-row cleanup only on the success path. Nothing requires the procedure to record a minted temporary key or the created test rows before they exist, and nothing checks for them on resume. An interruption between creation and revocation can leave a live credential and test data behind. A resumed run that starts the live gate again can then create a second key. AC-04 could still be ticked.
PROPOSAL: Require each live-verify action to record its pending temporary key identifier and test-row scope in the batch record or private journal before it runs. On resume, run the consumer's revocation and row-scoped cleanup for any pending entries, or hand them off, before starting the gate again. Add an AC-04 synthetic case that interrupts after key creation and before revocation, and require exactly one cleanup and no orphaned key.

### R-12
FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Remediation and delivery authority (squash merge outcome); Test Plan AC-04
EVIDENCE: shared-audit.md:524-527 says "A conditional squash merge carries the record and ledger to main" and requires the procedure to "Retain the actual merge outcome in the batch's durable outcome record after observing it". This is the only mention of a "durable outcome record" in the spec. The batch record (lines 405-407, 440-448) lives on the selected source branch. It reaches main only inside the squash commit, and that branch is then deleted. The spec never names the artifact that receives the post-merge outcome. It could be the in-tree record on main, the tracking issue, the private run journal or the external report directory. The spec also never names the authority for that write. The fix_effects vocabulary at line 326 covers `branch-push`, `pr-write`, `issue-write` and `conditional-merge`, but it has no effect for a later commit or push to the default branch. Line 52 of lifecycle.md says other non-feature publishing gaps "remain unsupported". In AC-04 (line 673), the squash case only checks a later reverify against the Scope baseline. Nothing checks where the merge outcome is recorded, or that recording it needs no unauthorized default-branch write. One implementation could push an outcome commit straight to main without any grant. Another could keep the outcome only in a local file, which a fresh-context resume or a later status run would not see. The interruption rule at lines 263-268 then cannot tell whether a merge whose response was lost was already recorded.
PROPOSAL: Name the post-merge outcome location and the authority that covers it. For example, use the private run journal plus the existing `issue-write` on the workstream's tracking issue, and state that no default-branch commit follows the merge. Alternatively, define a new declared effect for that write. Add an AC-04 case where a merge acknowledgement is lost after a squash merge, and check that resume records the outcome once and makes no write outside the grant.

### R-13

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Consumer settings and format preservation; Design, Remediation and delivery authority
EVIDENCE: shared-audit.md:325-329 says to "validate the existing audit schema" and that "All committed-policy and candidate inspections parse the exact committed YAML bytes through the same strict reader". The existing schema validator only works on the working tree. It resolves origin, `ledger_path`, `project_procedure` and `settings_path` with existsSync/statSync under the checkout root (plugins/vh-adlc/scripts/audit/settings.ts:31-38, 41-88). The committed paths currently check only `JSON.parse(...).project_procedure` (scripts/audit/authority.ts:95, 145), plus byte equality with the working-tree file (authority.ts:90, 145). The draft does not say whether committed YAML gets the full validator, a pure shape check with paths resolved in the same commit, or only the `project_procedure` key. It also does not say whether "configured" (working-tree) and committed settings must match by bytes or by validated value. Two committed-tree states have no defined outcome: a default branch whose AGENTS.md still links `.vh-adlc/audit.json`, and a committed `.json`/`.yml` leftover beside the linked YAML when the working tree lacks it. The draft does not say whether these report unadopted or invalid. The yaml-settings precedent (yaml-settings.md:70-72, R-2 F-03, R-5 F-04) settled both questions for maintenance. Finally, a missing reader on the candidate path falls into the catch at authority.ts:104 as "Invalid or uncommitted candidate declaration/default identity." That result would block AC-05 cutover with a misleading reason.
PROPOSAL: State the committed-YAML rule: the reader parses the blob, then which validation runs (shape only, or paths resolved in the same commit) and which validated fields must equal the configured settings. Name the outcome for a stale `.json` link, for a committed leftover suffix and for an unavailable reader on the adopted and candidate paths, and add each case to T84 and the AC-04/AC-05 proofs.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Consumer settings and format preservation; Entry points and modes (`status`); Test Plan AC-01, AC-06
EVIDENCE: shared-audit.md:331-334 says "Reader bootstrap may install the exact locked, verified binary in its normal private cache" and asks for the effect to be documented. shared-audit.md:250-252 says `status` "reads only", and audit-settings.md:119 defines `read-only` and `no-write` restriction tokens. `readYAML` calls `ensure-vh-adlc.sh` without `--offline` (scripts/settings-file.ts:34). When the binary is not cached, that script downloads with curl and writes under the user cache (ensure-vh-adlc.sh:105-126). So a `status` call, a read-only or no-fetch request, a copied example test, or an isolated credential-free native or Copilot trial profile can now make a network download and a cache write, or fail as "binary unavailable". The draft does not say whether read-only restrictions and status permit that download or require `--offline` and a pre-installed binary. It also does not say how the isolated AC-06 install/helper profiles and actual model trials obtain the verified binary. Without that, results depend on host cache state.
PROPOSAL: State whether read-only, status and no-fetch audit invocations may bootstrap the binary or must use the offline path with a visible prerequisite failure. Name how isolated trial and native install profiles supply the locked binary, for example on PATH with a matching digest, and add one AC-01/AC-06 case each for a cached binary and an uncached one.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Tasks T84-T88; Context (implementation sequencing correction)
EVIDENCE: Context at shared-audit.md:87-91 records that the first settings commit was made "despite the existing package checker rejecting the missing candidate version bump", and T26 (line 839) fixed this by moving the version bump "before further package work". Both manifests are now 0.7.0 at this target (plugins/vh-adlc/plugin.json:4, .claude-plugin/plugin.json:3). That is the same version as published main, which contains YAML triage/maintenance and no audit (shared-audit.md:691-692). The new tail does package work first, in T85 (scripts) and T86/T87 (references, examples). It reserves 0.8.0 only in T88, the last task. This repeats the recorded ordering failure, because each earlier package commit would land with an unchanged version.
PROPOSAL: Move the coherent 0.8.0 manifest reservation and its package-version check ahead of T85, as T26 did, and leave the native trial rerun and consumer minimum-version checks in the later task.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stackweaver adapter, parity and rollback (configuration cutover); Design, Evidence, updates and recovery
EVIDENCE: shared-audit.md:700-703 says to "Finish active runs on their original verified plugin before configuration cutover" and, "If unresolved effects remain, use the existing explicit current-policy reconciliation/handoff before any new work". T82 (line 990) and references/audit.md:190-196 make a declined non-resource intent a permanent retained handoff that "cannot retire". So such a run can never finish. Journal headers bind `settings_digest` to the settings bytes (scripts/audit/journal.ts:16, 25), so the YAML cutover marks every such run policy-changed. The policy transition then admits only observations and handoffs (audit.md:268-270), and an absent declined effect stays pending. audit.md:194 says a retained non-resource-only handoff does not block a later resource plan. Neither document says whether that still holds once the run is also policy-changed, so the draft cannot answer whether "before any new work" blocks all work after cutover. The draft also does not say whether cutover itself must wait.
PROPOSAL: State the cutover outcome for runs that hold only retained declined non-resource handoffs: whether they block cutover, need the policy transition, or carry over unchanged without blocking later runs. Add an AC-04 recovery case that crosses the JSON-to-YAML settings digest change with such a run.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter covers
EVIDENCE: The revised Design makes every audit settings read depend on "the plugin's verified `vh-adlc settings read` binary" and "the exact locked, verified binary" (shared-audit.md:323-334). That binary is chosen by plugins/vh-adlc/vh-adlc.lock.json and obtained by plugins/vh-adlc/scripts/ensure-vh-adlc.sh (settings-file.ts:34). Neither path is in `covers` (shared-audit.md:7-29). yaml-settings.md:9 and :19 cover both, for the same dependency. feature-documents.md:43-44 says covers lists every path whose change can affect the feature. A lock bump could therefore change AC-02 reader behavior without making the audit reviews stale.
PROPOSAL: Add `plugins/vh-adlc/scripts/ensure-vh-adlc.sh` and `plugins/vh-adlc/vh-adlc.lock.json` to `covers`.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Tasks T81; Design, Evidence, updates and recovery
EVIDENCE: T81 (line 988-989) says fix-mode inline notes "now retain every selected member while index/status markers remain changed-only". references/audit-settings.md:174-177 agrees: a selected fix "writes a per-finding evidence note for every selected member, including unchanged statuses, because it has no pass summary". references/audit.md:119-121, which is also in `covers`, still says "Selected fix candidates add only their changed finding markers/index cells/inline notes". A model following audit.md would expect no note for an unchanged selected member.
PROPOSAL: Reword audit.md:119-121 so that markers and index cells are changed-only while every selected fix member gets a per-finding note, matching audit-settings.md.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context; Sources
EVIDENCE: shared-audit.md:48-50 says "Shared main is `fcf7cd51...`", that plugin.json "reports plugin 0.6.0" and that there are "eleven skills". The manifests at this target are 0.7.0, and line 132 and lines 691-692 describe the later merged main. Line 76 says conventions resolve from AGENTS.md to `e4d58d2...`, but AGENTS.md:4 now pins `0e52f51f01b84eda75a976763c42d8ec0a07b544`, which line 336 and the first Sources entry rely on. Sources still cite feature-documents.md and delivery.md at `e4d58d2`.
PROPOSAL: Mark lines 48-50 and 76 as the original authoring baseline, or update them to the merged state and the `0e52f51` pin. Cite the pinned revision in Sources.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Open Questions
EVIDENCE: feature-documents.md:120-133 requires each question to have a "**Recommendation:**" line, an option table with "You get" and "It costs" columns, and "**Why this is yours:**". Q1 (shared-audit.md:1012-1018) is narrative only. It names the two routes (explicit reselection into a separate accepted feature/PR, or an owner-approved audit exception that only the owner merges) but has no table or "why this is yours" line. The preamble at lines 1007-1010 also keeps answered decisions there, while line 135 of the standard says answered questions are folded in and removed.
PROPOSAL: Restate Q1 in the standard form, with both routes as options and their benefits and costs, and leave the choice to the owner. Move the preamble's answered decisions into Context, where lines 80-84 already record them.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-02, AC-04
EVIDENCE: The AC-02 proof (line 826) now includes "committed-policy YAML parsing against clean/dirty, stale-link, unmerged and alternate-origin inputs; no reader failure may yield a grant". The AC-02 criterion text (line 814) covers settings and ledger inventory, not grants. Grants belong to AC-04's "consumer's required verification and authority" (line 816), whose proof (line 828) has no YAML or reader-failure case. T84 and T85 map to AC-04, but an implementation reviewer judging AC-04 against its proof row would not find these checks.
PROPOSAL: Move or copy the committed-YAML no-grant cases into the AC-04 proof row and keep the parsing and leftover cases under AC-02.

### R-14

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Consumer settings (offline reads, explicit setup); Tasks T84 to T88; Test Plan AC-01 and AC-06; frontmatter covers
EVIDENCE: shared-audit.md:346-353 says every audit settings read uses an offline verified binary, including status and read-only or no-fetch requests. It says reads "never bootstrap a download or create its cache", and that installation is "a separate setup step, not permission borrowed from status". This only covers the settings helper. Step 1 of skills/vh-adlc-audit/SKILL.md:12 follows references/loop.md for every invocation. loop.md:14 runs `bash .../ensure-vh-adlc.sh` without `--offline` and then `vh-adlc knowledge`. ensure-vh-adlc.sh:105-126 downloads with curl and writes the cache when no matching binary is found. So a `status` request with an empty cache still performs exactly the network fetch and cache write the correction forbids. It happens before the helper's offline read runs. No task among T84 to T88 changes SKILL.md step 1 or loop.md, and loop.md is not in covers. The AC-01 and AC-06 proofs only check an empty-cache read at the helper level, so they pass while the original R-13 problem survives. The proof also does not require isolating PATH. ensure-vh-adlc.sh:84-94 accepts a matching vh-adlc on PATH first, so an "uncached" sentinel run on a developer host can pass without testing the empty state.
PROPOSAL: State how the skill entry behaves for status and for read-only or no-fetch requests: it runs the loop installer with `--offline`, or it skips the online install and knowledge step. State which explicit operator step performs setup. Add a task covering SKILL.md and loop.md, and add loop.md to covers. Extend the AC-01 and AC-06 proof with a skill-level run that uses an isolated PATH, HOME and XDG cache, with network and cache-write sentinels for both the cached and the uncached state.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stackweaver adapter (format cutover); Tasks T87 and T90; Test Plan AC-05 and AC-07
EVIDENCE: shared-audit.md:748-749 says retained declined non-resource handoffs do not block cutover, but "Pending resources or unknown registration do block cutover". Today the only enforcement is run admission in scripts/audit/journal.ts:163-180, where registeredPending throws for pending key or row resources or a missing root. That only fires when a new run starts. scripts/audit/adoption.ts imports only fs, path and ./snapshot (lines 1-3) and makes no journal or registration check. The AC-05 proof lists stale links, suffix conflicts, a missing reader, value comparison, rollback and reapply, and a malformed real candidate, but no refusal for a registered pending resource or an unregistered root. T90 and the AC-04 proof test only admission of a later run. A cutover can therefore merge the YAML conversion while a key or row resource is still pending, and every criterion still passes. That leaves recovery to a later run under a changed settings digest instead of blocking it as the Design promises.
PROPOSAL: Add an inspection of registered pending resources and unknown roots to the actual cutover preflight in T87, with an AC-05 case that must refuse when a key or row is pending or a registration is unreadable. Otherwise, narrow the Design text to "blocks new live work after cutover" and remove the cutover claim.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Evidence and delivery (approved rebase); references/audit-record.md:125-131; Test Plan AC-04
EVIDENCE: shared-audit.md:715-720 and audit-record.md:125-131 say an explicitly approved rebase becomes a new scope-bound run on the same PR branch, with a new run ID, journal and record path. The rebuilt branch still carries the earlier run's record file at its old path, and that file holds the earlier Definition, Evidence and Reviews for a base that no longer applies. Neither text says whether the rebuilt source deletes it, marks it superseded or keeps it as history. It lies outside the new Definition's declared paths but stays in the publication diff that the conditional squash merge publishes. The batch freeze and review rules check the new record only. No AC-04 case covers a rebase, so an implementation can merge a stale second record that claims passing reviews for code it no longer describes.
PROPOSAL: State what happens to the prior record on an approved rebase: removed, or retained with an explicit superseded marker that cites the new run. Require the batch check and review to include that path. Add an AC-04 case where the stale record left without that disposition is refused.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Consumer settings (line 344); Test Plan AC-02 and AC-05; tests/vh-adlc/audit/fixtures.ts
EVIDENCE: shared-audit.md:344 says "examples use commented block YAML". The AC-05 proof says to "Convert the exact consumer audit configuration to commented YAML" and pass when validated values match. JSON is valid YAML, so renaming audit.json to audit.yaml, or emitting JSON text under the new name, passes the reader, the value comparison and every listed proof. This is the gap the yaml-settings precedent closed in R-5 F-01. Today tests/vh-adlc/audit/fixtures.ts:53 writes settings with `JSON.stringify(value, null, 2)`, and ledger.test.ts:434 does the same. The T84 to T88 conversion can rename these paths and every test stays green without exercising comments or block syntax. No pass condition in AC-02 or AC-05 asserts that the standalone example, the Stackweaver file and the fixture writers emit block YAML containing a comment that `JSON.parse` rejects.
PROPOSAL: Add pass conditions to AC-02 and AC-05: the standalone example, the converted Stackweaver settings and the shared fixture writers produce block YAML with at least one comment, and each file fails `JSON.parse`. Name the fixture writer conversion in the T84 or T85 done condition.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter covers
EVIDENCE: Audit scripts import shared code from paths that covers does not list:
- scripts/triage/settings.ts: scripts/audit/settings.ts:3 imports git, origin and resolveInside, and assessment.ts:3 imports from it.
- scripts/maintenance/journal.ts: imported by report.ts:2, cli.ts:4, ledger.ts:3, batch.ts:6 and journal.ts:3.
- scripts/maintenance/authority.ts: ledger.ts:10 and batch.ts:7 import repositoryPath.
Origin binding (AC-02) and journal publication and recovery (AC-04) depend on these modules. yaml-settings.md covers scripts/triage/settings.ts, but this spec does not. A later change to those files would not route to the audit feature's review.
PROPOSAL: Add scripts/triage/settings.ts, scripts/maintenance/journal.ts and scripts/maintenance/authority.ts to covers.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Tasks T89 and T91; Context (package-version ordering)
EVIDENCE: T91 is checked. It changes shipped plugin package content (the scripts/audit summary renderer and the references) to address R-13 F-06 and private R6. Both were raised against dd878483, after main published its own 0.7.0. plugin.json:4 still says 0.7.0. Context lines 139-143 say version reservation precedes further package implementation, and they record the earlier 90b2416 ordering failure. T91's evidence cites only focused ledger and batch controls. The Context does not record that T91 also landed before reservation, and T89's done condition does not require its package check to cover T91's changed files.
PROPOSAL: Record T91 next to the 90b2416 note as package work done before reservation. Require T89's package-version check and its evidence to cover the T91 changes.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context, lines 124, 143, 146 and 154
EVIDENCE:
- Line 143 says version handling is "retained under T88", but reservation is now T89.
- Line 146 says R-13 reviewed "this exact draft", but R-13 targeted dd878483 and the current draft is adb0c49.
- Line 154 is headed "Latest spec review" but discusses R-12, while R-13 is the latest returned review.
- Line 124 presents "Current local validation at c98a6e42" as current, although the draft has since moved.
PROPOSAL: Change line 143 to T89, give R-13's exact target, retitle line 154 as an earlier review, and mark the c98a6e42 validation as historical.

### R-15

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Consumer settings and format preservation (offline bootstrap); Tasks T92; Test Plan AC-01, AC-06
EVIDENCE: shared-audit.md:394-397 says audit's first step overrides the loop's online installer "for every audit invocation" and "must not fall back to online setup or a knowledge fetch". shared-audit.md:286-287 sends ordinary-language audit requests "through the existing lifecycle intake". In lifecycle.md:18-19, intake step 2 says to "Resolve engineering knowledge through the existing installer and `vh-adlc knowledge` procedure", and the procedure is only selected in step 3 (lifecycle.md:23). SKILL.md:8 makes generic requests follow lifecycle.md first. That installer is the online one (loop.md:14), and it downloads and writes the cache when no binary is found (ensure-vh-adlc.sh:105-126 only refuses under `--offline`). An ordinary "show our audit status" request with an empty cache therefore downloads and writes the cache during intake, before the audit skill's offline step can run. T92 changes only SKILL.md and loop.md. The AC-01 and AC-06 proofs run the "audit skill-entry plan" and the operator bootstrap, not intake-routed entry, so they pass while this path stays online.
PROPOSAL: State how lifecycle intake handles a request it will route to audit, for example by deferring installer and knowledge resolution until routing or by using the offline path for audit-intent requests. Add lifecycle.md to T92, and add an intake-routed cached/uncached sentinel case to the AC-01 proof.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer settings and format preservation; Tasks T92
EVIDENCE: shared-audit.md:395 makes `vh-adlc knowledge --offline` a normative audit entry step. No source in this tree documents such a flag. loop.md:32 gives the only knowledge form, `knowledge --repo <dir> --plugin-pin <pin> --page <path> ...`, and loop.md:47-48 lists `unreachable` as a knowledge result, which suggests a network fetch when a page is missing. The only `--offline` in the plugin is the installer's (ensure-vh-adlc.sh:10-16, 106-107). The locked binary is v0.9.0 (yaml-settings.md:142-143), and no Go source, CLI reference or lock bump is in `covers` or in any open task. The feature-document standard requires Design claims to be cited. If v0.9.0 has no offline knowledge mode, T92 cannot meet its done condition within this feature's scope.
PROPOSAL: Cite the observed v0.9.0 `knowledge` flag and its cache-only behavior. If it does not exist, say how audit resolves pinned pages without a fetch (for example by reading already cached pages for the resolved revision and failing visibly when any is absent), or add the required binary change and its release ordering to the scope.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stackweaver adapter, parity and rollback (cutover preflight); Tasks T87; Test Plan AC-05
EVIDENCE: shared-audit.md:816 requires "Finish actively executing repair batches" before cutover. The mandatory gate at lines 824-828 refuses only "pending keys/rows, missing/unreadable registered roots or unknown registry state", and only a "declined-non-resource-only" run is named as passing. scripts/audit/journal.ts:163-180 (`registeredPending`) collects only `pendingResources(run)`. A pending merge, push, PR or issue intent with no observed outcome and no handoff (for example a lost merge acknowledgement, audit.md:200-202) is therefore invisible to the gate the Design builds on. The text does not say whether such a run passes or fails. The AC-05 proof covers only pending key/row, unreadable/missing root and the declined handoff. A cutover can therefore merge while a batch's remote effect is unreconciled, and every listed proof still passes. The YAML settings digest change then forces that run through the policy transition instead of ordinary recovery.
PROPOSAL: State that any non-resource intent without an observed outcome or a recorded handoff blocks cutover, and require the preflight to tell such intents apart from retained declined handoffs. Add an AC-05 case with an unreconciled merge or push intent that must refuse.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Remediation and delivery authority; Tasks T94
EVIDENCE: The owner's answer is folded in at shared-audit.md:621-630: a changed boundary, format, migration or intent leaves through "a separately specified feature and PR", and an audit PR cannot keep it "through a planning exception". The shared files that generic adopters and the batch reviewer follow still say only "feature/owner route": audit.md:140, audit-record.md:52, audit-review.md:17, lifecycle.md:109 and the helper message at scripts/audit/authority.ts:174. The Design itself keeps that wording at shared-audit.md:567 ("feature/owner route") and :646 ("feature/owner path"). Those references also do not require the member to stay visible or an explicit replacement selection. "Owner route" can be read as the superseded owner-approved in-batch exception. T94 names only "consumer audit policy/parity and generic/consumer selection contracts". No open task names these shared references, so the audit-specific reviewer could accept a superseded exception and every listed task would still be done.
PROPOSAL: Replace "feature/owner route/path" in Design lines 567 and 646 with the separate feature and PR route. Name audit.md, audit-record.md, audit-review.md, lifecycle.md and the authority message in T94 (or a new task), with a package contract that the shared procedure states the separate-PR route, visibility and explicit reselection.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-01, AC-02; Tasks T86, T89; Design, Stackweaver adapter (plugin 0.8.0)
EVIDENCE: The Design converts audit settings to `.vh-adlc/audit.yaml` (shared-audit.md:385-389, 424) and makes 0.8.0 the audit candidate, saying to update "audit installation guidance" consistently (lines 807-811). Active guidance currently says otherwise. references/audit-settings.md:3 and :43 name `.vh-adlc/audit.json`, and :8-21 is a ```json example. docs/user-guides/workflows.md:73 says "Create `.vh-adlc/audit.json`". workflows.md:76, installation.md:124 and compatibility.md:31 say audit needs "plugin 0.7.0+", but published 0.7.0 has no audit operation (shared-audit.md:807-808). The AC-02 example check covers `examples/audit/basic/` and fixture writers. No proof row asserts that the reference and guides name only the `.yaml` path, that the reference's inline example is commented block YAML which loads, or that the guides state the 0.8.0 minimum. T86's "examples load" does not make this explicit. yaml-settings.md settled the same gap with AC-13 and a package test (yaml-settings.md:147-148, R-3 F-02).
PROPOSAL: Add a pass condition, under AC-01 or AC-02, for a package test: audit-settings.md, workflows.md, installation.md and compatibility.md name only `.vh-adlc/audit.yaml` and plugin 0.8.0 for audit, and the reference's inline example fails `JSON.parse`, has a comment and loads through the audit loader. Name these files in T86 or T89.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Tasks T75
EVIDENCE: T75 is still unchecked and its title says "retain the pending owner route decision". Its progress line says "The owner route choice remains Q1, so this task and final completion stay open." Open Questions now reports Q1 answered and folded into T94 (shared-audit.md:1140-1142, 191-197). T75 therefore has no remaining done condition distinct from T94, and the standard requires each task to name a check that completes it.
PROPOSAL: Restate T75's remaining done condition without the pending-Q1 dependency, or mark the route part as moved to T94 and tick T75 when its other listed work has evidence.

### R-16

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: shared/docs/specs/shared-audit.md:400-418 and 433-436 (Design, offline bootstrap and isolated trials); AC-06 cached skill-entry/helper pass condition.
EVIDENCE: Every audit invocation must now pass `vh-adlc knowledge --offline` before reading settings (401-403). Per knowledge.go:214-224, offline mode answers only from `<cacheDir>/vh-adlc/docs/<rev>/<page>` and returns unreachable on a miss. native-evidence cold.stdout shows that the always-read conventions/feature-documents.md page also fails when uncached. Yet the only named setup step installs "the exact locked binary" (415-418), and isolated trials "provision only the exact locked verified binary into their own cache or PATH" (433-434). Neither the installer nor that setup step fills the docs cache. That page cache is keyed by the consumer-resolved revision and must hold every page the audit skill reads. As written, the isolated "cached success" trial cannot pass, and a fresh adopter can never reach audit. result.json also does not record how its warm case was warmed.
PROPOSAL: Add the docs-cache setup to the explicit setup step: an observed online `vh-adlc knowledge` call, or an equivalent, for the exact page set and the consumer's resolved docs revision. Keep it a separate setup step, not something borrowed from status. Change "provision only the binary" so trial setup also seeds those pages. Have AC-06 record both setup observations, and require a partial page set to fail visibly.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: shared/docs/specs/shared-audit.md:842-848 (cutover preflight), T87 at 1152, T90; source journal.ts:14,245-248, recovery.ts:17-19, references/audit.md:190-196,220.
EVIDENCE: The mandatory cutover gate must admit a "recorded declined/absence handoff", refuse an "unknown-state handoff", and require "a distinguishable absence observation". The current journal has no absence-observation record. A handoff payload is only a free identifier `{reason_code}`, and the CLI `journal handoff --reason` accepts any identifier. recovery.ts records "reconciliation-only-no-replay" for every policy-changed (cleanup_only) run before it checks the observed state. Every retained run becomes policy-changed under YAML (835), so absent and unknown collapse into one code there. audit.md:190-196 still keeps "absent/unknown" alike as pending handoffs. An ambiguous legacy handoff must stay blocked "until read-only reconciliation establishes that disposition" (845-846). A read-only step cannot persist that disposition, so the next preflight would see the same ambiguity. No open task names the shared journal/recovery/CLI/reference change, or the discriminating vocabulary, that the consumer preflight (T87) and the recovery test (T90) would rely on. The pass condition is therefore not observable, and admission could rest on an operator-chosen reason string.
PROPOSAL: Define how a deliberate absence is represented. This could be a fixed reason code emitted only after an observed `absent` state, or a distinct journal event that the CLI cannot forge through `--reason`. Specify how a legacy or cleanup_only handoff gets that disposition recorded, and through which existing explicit authority. Name the shared journal.ts/recovery.ts/cli.ts/audit.md change in an open task (T90 or new), with AC-04/AC-05 cases. Those cases must show that an absent-observed handoff passes, while unknown, reconciliation-only and free-text handoffs block.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: shared/docs/specs/shared-audit.md:412-414.
EVIDENCE: The spec says the v0.9.0 runs used "isolated HOME/XDG/PATH and a local proxy sentinel" and cites `knowledge-offline-release-r1/result.json`. The observed artifact is native-evidence/knowledge-offline/result.json. It records the argv against the real repository and binary path, exit codes, `network_requests: 0`, `cache_and_home_unchanged: true` and `docs_source_override: false`. It records no HOME/XDG/PATH values and no proxy configuration, and both stderr files are empty. The isolation and sentinel claims cannot be checked from the cited artifact.
PROPOSAL: Cite the actual artifact path. Either add the recorded environment and proxy-sentinel details, plus the warm-cache setup, to the evidence, or limit the sentence to what result.json shows.

### R-17

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Stackweaver adapter, parity and rollback (lines 885-889); Tasks T87 (line 1196)
EVIDENCE: Lines 859-860 and AC-05 (line 1021) admit only runs with typed `retained-absence` events. They also say "Arbitrary --reason, legacy/unknown/reconciliation-only handoffs cannot pass." Lines 885-886 still let "an explicit recorded declined/absence handoff" satisfy the cutover check. T87, which owns the actual cutover preflight, says "admitting recorded declined/absence handoffs". The current `handoff` event is a free `reason_code` handoff (journal.ts:110-111, 245-248), so an implementer following T87 could admit a `journal-handoff --reason declined` record. Line 889 also points to "the explicit observation-recording operation below", but that section is above it (lines 837-861).
PROPOSAL: In lines 885-886 and T87, replace "recorded declined/absence handoff(s)" with "typed `retained-absence` observation(s) per the Retained absence observations section", and change "below" to "above". T87 should also name the free-reason handoff negative that AC-05 already requires.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Retained absence observations (lines 853-857) and cutover (lines 875-879); T95 (line 1195)
EVIDENCE: Lines 853-855 let the dedicated recorder append to a "legacy or policy-changed run ... including before the new YAML policy is adopted". In current source, every append rereads the run without `inspect` (journal.ts:198), and that read fails whenever `policy_current` is false (journal.ts:116-117). The run identity, registry location and policy bindings all come from `loadSettings` over the working-tree settings (journal.ts:23-26, 121-122). Before adoption, the default checkout holds JSON, which the 0.8.0 strict reader refuses (line 405). The only loadable settings is the unadopted candidate YAML, yet the design says recording "does not activate candidate policy". The spec never says which settings or identity source the recorder binds, or how it bypasses the `policy_current` requirement only for this event. Lines 878-879 also require "the existing explicit current-policy handoff" to mutate a policy-changed retained run later, while line 853 lets the recorder append to any policy-changed run without one. If that transition is used, the run becomes cleanup-only, and cleanup-only appends admit only `handoff`/`observed-outcome` for non-resource intents (journal.ts:101, 201).
PROPOSAL: State the exact config and identity source the recorder uses before and after adoption. For example, candidate YAML read only for repository, host and common-dir identity, checked against the run header, with no policy binding. State that only this event kind skips the `policy_current` and cleanup-only append restrictions. Reconcile line 878 with line 853, and add the post-adoption and post-transition recording cases to T95 and AC-04/AC-05.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, offline bootstrap (lines 428-433, 448-452); AC-06 proof (line 1022); T92 and T88 (lines 1192, 1198)
EVIDENCE: Setup must seed "every audit-required and applicable language page" (line 429), and AC-06 requires the "complete consumer-resolved pinned docs page set". The audit skill fixes five pages and adds "relevant language pages" chosen at invocation (SKILL.md:12-14). Each `knowledge` call requests "every docs page the operation will read" (loop.md:29, 59). In offline mode, any page missing from the cache returns `unreachable` (knowledge.go:214-224). No page list is declared per consumer or in settings. The native evidence uses one generic six-page set with `conventions/typescript.md` against the shared repository. Nothing ties that set to Stackweaver or to what an entry run will actually request. So whether complete-cache entry passes depends on which language pages the model chooses, and the "complete" pass condition cannot be checked.
PROPOSAL: Make the audit page set deterministic, for example a declared language-page list in the consumer procedure or settings, used by both explicit setup and offline entry. Require T92/T88 trials to show that the requested set equals the seeded set, and that an entry requesting an unseeded page fails visibly.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, offline bootstrap evidence description (lines 423-427, 451)
EVIDENCE: Line 425 says "The six-page setup records each exact pinned Git blob/hash", but the partial-cache case seeds only five pages and omits `guides/humanize-prose.md` (result.json partial setup). Line 451 requires verifying "the binary against its independent pin". Instead, the evidence ran `ensure-vh-adlc.sh --offline` against the host cache from cwd `/home/m/code` with no recorded isolated environment (result.json:8-16). It then copied the binary (result.json:7, 17), and it records `binary_sha256` with no lock digest or comparison result. The isolated root is named `audit-offline-knowledge-r2-...` (result.json:4), while the Context cites the r4 run.
PROPOSAL: Describe the evidence as six pages for the warm case and five for the partial case. Record the lock entry's expected digest and the comparison result next to `binary_sha256`, or say that verification used the host's installer cache rather than an isolated install. Note the r2/r4 naming relationship.

### R-18

FINDING: F-01
KIND: judgement
SEVERITY: nit
WHERE: Design, offline bootstrap and knowledge_pages (shared-audit.md:473-480)
EVIDENCE: shared-audit.md:477-479 says "language pages are never guessed per invocation. Any independently required local language page must be declared before entry, otherwise report a setup/config mismatch." The only normalized input at entry is the declared list (473-476). To detect an undeclared "independently required" page at entry, the model would have to work out which language pages apply, and that is the per-invocation guessing the same sentence forbids. Only the conversion-time check has an observable pass condition: Design 911-914 "verify the new effective page list against existing local language obligations", and AC-05 "checking the new knowledge_pages field against the declared local obligations". T96 and AC-06 test exact page-set equality and unseeded failure, but they have no entry-time mismatch case.
PROPOSAL: Say the mismatch check is made at setup or conversion against declared local obligations, and that entry only requests and verifies the normalized list. Alternatively, name the deterministic local source that entry compares against and add that case to T96.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context, R-16 paragraph (shared-audit.md:212-214)
EVIDENCE: shared-audit.md:212-213 says "The richer native cold/partial/warm r4 evidence ... is committed under tests/vh-adlc/evidence/shared-audit". The committed result.json is the r5 run: result.json:4 "/tmp/audit-offline-knowledge-r5-b7vnh6fx/bin/vh-adlc", and lines 59-61 use the same r5 HOME, XDG_CACHE_HOME and PATH. shared-audit.md:441 itself says "The current r5 fixture prefix matches that run; the earlier r4 proof used an r2-named scratch prefix", and line 218 calls r5 the richer proof.
PROPOSAL: Reword lines 212-214 in the past tense so r4 is the superseded archived attempt, and point to the r5 run as the committed evidence.

## Sources

- [Current configuration rule](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/coding.md#configuration-format) and [TypeScript conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/typescript.md): YAML for human-written settings, typed boundaries and repository-specific verification after the pin adopted on main.
- [YAML settings feature](yaml-settings.md#shared-audit): the existing shared strict reader and the explicit audit revision order, merged as `aa5c66e7` and integrated locally as `3f4cd78`.
- [Feature document standard](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/feature-documents.md): separate child, committed review, owner acceptance and status gates.
- [Feature delivery conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/delivery.md): default-branch documentation, implementation claim, exact publication and consumer ordering.
- [Documentation conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/documentation.md) and [humanize prose guide](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/humanize-prose.md): grounded prose and one canonical feature document.
- [Parent migration roadmap](shared-workflow-migration.md): audit selection, retained local policy and deferred sibling capabilities.
- Stackweaver `agents/codebase-audit.md` at `0ae15a9d`, `Codebase Audit Agent`, `Mode selection`, `Verify` and `Ship`: existing behavior and explicit conditional-merge rule. Local inspection only; no private findings copied.
- Stackweaver `.claude/commands/audit.md` and `CLAUDE.md` at `0ae15a9d`: command/model/arguments, constitution, worktree/data constraints and shipping requirements.
