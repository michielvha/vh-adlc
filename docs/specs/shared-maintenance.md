---
status: in-progress
branch: feat/shared-maintenance
status_description: "R-19 fixes and final committed native installs passed. R-20 met all criteria; its minor notes and an observed trial-grader wording defect are fixed and tested. R-21 notes are fixed and verified, including a new committed-source replay. R-22 notes are fixed and verified. R-23 met all criteria; T18 addresses its final test-grader nit before completion. Live Claude/GUI are deferred; publication and cutover are pending."
issue: https://github.com/michielvha/vh-adlc/issues/35
goal: "Run dependency and security maintenance through one harness-agnostic vh-adlc operation while consumers retain their topology, release rules and existing approved operating procedures."
covers:
  - plugins/vh-adlc/skills/vh-adlc-maintenance/
  - plugins/vh-adlc/references/maintenance.md
  - plugins/vh-adlc/references/maintenance-settings.md
  - plugins/vh-adlc/references/maintenance-record.md
  - plugins/vh-adlc/references/maintenance-review.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/scripts/maintenance/
  - plugins/vh-adlc/scripts/github-read.ts
  - plugins/vh-adlc/scripts/triage/github.ts
  - plugins/vh-adlc/scripts/triage/collect.ts
  - plugins/vh-adlc/scripts/triage/types.ts
  - plugins/vh-adlc/scripts/triage/settings.ts
  - plugins/vh-adlc/scripts/triage/owned-process.ts
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tests/vh-adlc/maintenance/
  - tests/vh-adlc/maintenance-variants.test.ts
  - tests/vh-adlc/maintenance-resume.test.ts
  - tests/vh-adlc/lifecycle/
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/direct-operation-compatibility.test.ts
  - tests/vh-adlc/triage/discovery.test.ts
  - .github/workflows/ci.yml
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - docs/reference/marketplace.md
  - docs/get-started/installation.md
  - README.md
---

# Shared dependency and security maintenance

## Context

The owner selected maintenance as the next extraction on 2026-10-27: generalize the workflow,
keep Stackweaver-specific information in Stackweaver, and use Copilot Opus 5.5 for independent
reviews. The parent [migration roadmap](shared-workflow-migration.md) owns the wider program;
triage, audit, documentation workflows and domain agents retain their own scope.

At shared baseline `609ceeb`, `plugins/vh-adlc/references/lifecycle.md:82-134` already defines
bounded maintenance: preserve the public contract, observe checks, keep a Definition/evidence/review
record, independently review an exact commit and distinguish local completion from publication.
`references/maintenance-record.md:11-39` and `maintenance-review.md:14-24` supply its task record and
review contract. There is no separately discoverable maintenance operation: the command
`rg --files plugins/vh-adlc/skills` lists nine skills, none named `vh-adlc-maintenance`.

Stackweaver parity baseline `5383332c4e836fe7c33f59042186df7f314f49da` has a wider dependency workflow.
Its `agents/maintenance.md:3-49` requires actual changelog/usage analysis, report-first selection,
single-batch releases and a local satellite-merge helper. Its repository inventory, sync mappings,
release checks and security/backlog documents are consumer facts, not shared defaults.
`.claude/commands/maintenance.md:1-36` preserves `/maintenance`, its `opus` model and optional
repository/PR scope. `AGENTS.md:10-23` currently routes maintenance locally and triage to vh-adlc.
These claims were checked with `git show origin/main:<path>` after fetching both repositories.

The command both says never change protection and tells the agent to hand off satellite-only PRs,
while the playbook permits merging approved green PRs with its sanctioned local helper.
The owner resolved the migration intent in this session: this is Stackweaver-specific and must
remain usable as before. Preserve that helper exception and its existing approved-batch requirements
in Stackweaver. Do not turn it into a shared protection-changing default. The script itself is not
being repaired or certified by this extraction; its observed EXIT trap is not crash-proof recovery.

On 2026-10-28 the owner chose to preserve documented unavailable security surfaces and report
unknown bots as inventory gaps. The owner first requested an actual Claude command trial, then
explicitly substituted Copilot because Claude tokens are exhausted. Keep Claude command routing
and model checks, defer its live model trial, and require the Copilot report trial without claiming
that it establishes Claude invocation behavior. These choices are incorporated into Design/Test Plan.
The refreshed consumer main is `5383332c4e836fe7c33f59042186df7f314f49da`.
`git diff --stat 1999a71b origin/main --` the declared policy and workflow paths reported only two
added lines in `.github/workflows/ci.yml`; maintenance policy, command, helper and sync mappings
remain unchanged from the cited extraction baseline.

On 2026-10-28 the owner adopted shared independent review for authored repairs, retained bot-only
batching and requested continued Copilot Opus 5.5 reviews. This selects the presented repair-review
path, with its record outside the dependency squash and clean task-owned worktree support.
The intentional differences below are now explicit owner decisions. This decision does not replace
the final independent spec review and acceptance step.

On 2026-10-28 the owner resolved Q5: an authorized Stackweaver sweep commits and pushes its
dated report-only `[skip ci]` change to main before dependency selection. This consumer-specific
permission leaves shared defaults and authored-repair review unchanged. Report publication follows
Stackweaver CLAUDE.md:138,159-166 through its main checkout; the owner already required preserving
local operating rules. The retained route resolves R-7 F-02 without adopting the conflicting
isolated-push proposal. The procedure below also preserves later outcomes in that same tracked report.

On 2026-10-28 the owner also resolved Q6: the same run may commit and push later outcome/status
updates to its dated report and required indexes. This extends only report-artifact publication,
with the same main-checkout safeguards and current-request restrictions. Dependency changes and
repair evidence retain their separate permissions.

R-9 identified two permissions or restrictions introduced during factual fixes rather than requested
by the owner. The Design removes the automatic report-commit rebase and the new dependency gate on
remote report publication. Existing main-checkout ff-only synchronization and report-first selection
remain in force. A pending report push is reported and handed off; it grants neither history rewriting
nor an extra prohibition on otherwise approved work. The original save/commit requirements remain.

Before the next review, consumer main was refreshed to `010bcddf7faa61aa8ef8a78b9c1fa3e0838881e6`.
`git diff --stat 5383332c origin/main --` all declared maintenance policy, entry, helper, workflow
and backlog paths produced no changes. The parity review therefore keeps its exact `5383332c`
source binding; consumer adoption still uses then-current main and rechecks preservation.

Pre-implementation marketplace baselines were observed on 2026-10-28 in isolated Codex and Claude
profiles: native installers fetched public vh-adlc 0.4.0, nine skills and no maintenance operation.
All 47 installed payload files, including modes, match shared main `609ceeb` on both hosts. These
installer-only checks invoked no models and copied no credentials. They predate the local 0.4.1
spec-summary correction and describe historical public source `609ceeb`, not the current candidate.
The pre-maintenance upgrade base is whatever plugin version is published when adoption runs; the
existing adoption preflight observes that version and payload again. These observations are not
acceptance of the unimplemented maintenance operation.

R-14 notes two restrictions introduced by prior fixes, rather than requested by the owner. The
Design removes the ban on index entries derived from already committed default-branch documents
and explicitly maps the existing skip-leak recovery under an approved delivery scope. These retain
the owner's instruction to keep Stackweaver procedures working as before; neither creates a generic
release-dispatch grant or permission to index unpublished documents.

R-16 returned one nonblocking test-precision nit. Task decomposition must include a generic project
whose only checkout is on a feature branch: the already specified missing-main-checkout isolation
keeps its report candidate local, with publication pending and an explicit handoff. The fixture must
observe no branch switch and no direct push from the report-role worktree. This is a proof sample for
the existing main-checkout-only route, not a new authority or publication behavior. The reviewed
normative baseline remains `f0517c1e5fe3801d0312732c6d3e114dd7f04ce9` for owner acceptance.

After the owner-facing summary and the presented acceptance/publication request, the owner asked to
continue on 2026-10-28. That accepts the summarized design and authorizes publishing the summary-rule
patch, maintenance documentation, tracking issue and implementation claim. Local implementation may
start after the gate and claim. Feature-code shipment, consumer merges, releases and live dependency
operations retain their separately scoped authority.

T12 progress on 2026-10-29: observed red/green regressions now expose a previously transferred
pending report commit under current restrictions, including a later descendant on main and concurrent
remote advancement, while preserving unrelated state. Complete evidence-target hashes are checked.
Native Codex publication batch A passed standing publication plus a fresh-candidate outcome,
nonoverlapping staged/working preservation and no-push isolation; its retained initial false grade
was caused by the grader's nonmatching Git ref prefix, fixed with an actual committed-ref regression
and replayed as `/tmp/maintenance-publication-native-20261029-a/regraded-result.json`.
Batch C passed all six isolation/refusal cases at
`/tmp/maintenance-publication-native-20261029-c/result.json`. Batch B exposed an actual extra
same-run publication after an initial-only explicit request; its failed result remains retained.
The canonical procedure now clarifies that a completed initial-only request grants no second
outcome/publication, and the focused retest passed at
`/tmp/maintenance-publication-native-20261029-e/result.json`. Deliberate post-commit/post-push
interruption and fresh-context recovery, wider authority variants and paired authored-repair review
are still in progress; none of these partial results completes T12 or migration acceptance.
The intermediate full suite encountered the host's per-user `/tmp` quota, not a passing result.
Only completed isolated profiles' reproducible remote-catalog caches were moved to the private local
archive with byte/mode inventories and original-path symlinks; raw proof and installed candidates
remain intact. New test temporary roots use owned home storage. The feature remains in progress.

On 2026-10-29, freshly fetched main advanced from the claim to
`b25807d307069a9ea9c7df8378df45c20b9e317c`, merging the blog workflow at plugin 0.5.0.
The binary returned `next: spec review`, rule 4, because R-17's covered default-branch files drifted.
Local integration preserves both operations, both reviewer definitions and existing blog evidence;
the maintenance release candidate now targets 0.6.0, with eleven skills (nine engineering operations,
one article operation and the generic entry). The earlier 0.5.0 maintenance candidate observations
remain historical development evidence, not proof of published 0.5.0 maintenance availability.
Scope, Design, Acceptance Criteria, Test Plan and covers remain byte-identical to the accepted R-17
normative baseline. This refresh requests a new independent spec review of upstream compatibility;
it does not claim implementation completion or publication authority. T12 working changes are not
part of that committed spec-review target. The exact quiet required suite passed 577 tests/2462
assertions before this upstream integration (`t12-quiet-default-suite-20261029.log` in the local
review archive). Quota-affected earlier interruption jobs did not reach their intended action and
are not recovery passes. Home-backed reruns have now observed actual owned host-namespace SIGKILL
after a committed report and after a server-accepted local push; fresh-context recovery verification
is still running and remains required.


R-18 returned no blocking findings at `6a28de399189560f49e0f8957d9226d1d2f2c047`;
its factual marketplace-description nit is fixed. The in-progress gate passed and `next` returned
implementation under the existing accepted normative baseline. No renewed owner acceptance was
manufactured. Fresh recovery has now passed for both deliberately interrupted cases:
`publication-h/fresh-recovery-interrupted-commit-result.json` and
`publication-i/fresh-recovery-accepted-response-lost-result.json`, under the private local
`.maintenance-review-archive/runtime-20261029` directory. Each used a new actual Codex thread and
only persisted journal/Git state; recovery reconciled the prior commit or accepted push without
duplicating it and recorded the authoritative published report. These are local-bare synthetic
transport results, not live GitHub delivery. The first authored-repair preparation preserved its
source/evidence separation and stopped review pending, but its check recorder was bypassed by
login-shell PATH ordering. That preparation remains incomplete; a fresh trial pins the actual owned
check executable. The independent paired review must still execute its own real checks before
same-thread continuation can publish a fixture repair. Explicit-authorization batch J passed all five mismatched/missing-payload negatives. Saved-report
batch L passed unchanged external/checkout promotion and edited/staged preservation denials.
Initial-only concurrent-main batch M passed fresh-candidate rebuilding and cross-host report-path
collision preservation; batch K retains its earlier extra-update failures and its passing repeated-
advance, post-transfer divergence and pre-transfer divergence observations. An ordinary second
writer's actual main push did not include batch A's isolated no-push report. The first restricted
fresh continuation passed with no extra effect and a private pending outcome; an additional case
with an actually pending main commit remains running. Actual Opus paired reviews exposed missing
launcher permission, exact-executable and Git blob/mode correspondence requirements, then a trimmed
Definition export; those failed receipts remain retained. The author fixed normalization in the
same original thread, preserving its earlier records. The fixed independent runner now verifies
all exported/working verification inputs and the committed Definition before executing the required
check executable. Its regression rejects a changed unused input and even a stripped final newline.
Native action batch A passed all thirteen closure/explanation, workflow and stack-scope variants.
Batch B repeated scoped skip-leak recovery and wrong-version/no-dispatch negatives against actual
seeded Git subject/version evidence and passed all three. Fresh contexts reconciled an interrupted
completed closure without another close/comment and restored the journaled prior mode after an
interrupted fake-stack smoke without repeating it (`actions-c` and `actions-d` fresh-recovery results).
The unobservable-remote case stayed pending with no retry or invented receipt; after observation was
restored, another fresh context reconciled the accepted push without another commit/push (`publication-n`).
The original failed-push case with a pending shared-main commit also passed the current no-push
override. Once its fixture refusal was removed and publication explicitly reauthorized, a fresh
context published the existing commit, imported the saved private deltas in order through one fresh
candidate and preserved their immutable artifacts. Another fresh context observed those published
steps without reappending, committing or pushing. These results are retained under the original
`/tmp/maintenance-publication-native-20261029-d/outcome-*-result.json` paths.
The actual native repair review's substantive object/contract/check results pass, but later protocol
notes and inconsistent historical handoff/tool instructions remained unresolved in those passes.
Their original failed records are retained; none is relabelled clean. A task-local proof-tool
experiment was blocked by the host's MCP registry policy and removed without changing that policy.
The current native route retains the fixed executed checks and read-only scope, permits only inert
shell diagnostics, and uses view/grep/glob for file inspection. The worker also independently verifies
the Definition section's exact hash and identity with the previous committed record. Its actual
source/record checks, historical receipt limitations and procedural isolation remain explicit.
The actual native paired repair review now returned `NO FINDINGS` with model claude-opus-5.5
(`authored-primary-b-review-10/result.json`). The original Codex author resumed the same thread,
verified the actual artifact/current input bindings, stored returned records before the only source
push and fake combined PR, and preserved main, unrelated staged/working/index bytes and unpublished
report/evidence refs (`authored-primary-b/continuation-result.json`, passed). Earlier failed reviews
remain preserved. The real-Go bot-only trial passed actual `go mod tidy`, source tests, one source
push and one fake combined PR without adding an authored-review gate (`bot-only-go-a/result.json`).
A second distinct run in that same repository/month prepared fresh local-only batch/report refs
and preserved every occupied first-run ref and unrelated checkout/index, with no additional push/PR
(`bot-only-go-a/second-batch-result.json`). Actual same-author continuations rejected the old real review after source, mechanically regenerated
verification-input and Definition-only changes, with no further source/PR effect. The Definition-only
case restored every reviewed source-input blob first, so a changed source head alone was not its
reason. The second bot run's real synthetic squash preserved the exact source tree while leaving its
source commit non-ancestral; native cleanup removed only its clean source worktree and retained the
unchanged branch after one ordinary `-d` refusal, without force or another worktree/ref mutation.
The full checkpoint plugin suite passed 589 tests/2563 assertions across 62 files
(`t12-checkpoint-full-suite-20261029.log`); later added related-source fixtures still need the final
suite. A real independent-source trial has prepared its repair through a fresh owned clone, kept its
Definition/journal in primary and preserved the canonical source checkout. Its first actual Copilot
Opus 5.5 paired review returned `NO FINDINGS`; same-thread selected delivery passed with only the
independent source branch/PR published and the canonical checkout and primary indexes preserved
(`authored-independent-a/continuation-result.json`). The report-only phase kept local evidence as a
plain unpublished reference. After separate exact evidence-ref authorization and observed remote
record reachability, the next report update added its immutable repository/blob link; stale source
proof remained pending and no other ref changed (`authored-primary-b/evidence-*-result.json`). The
satellite preparation also passed: a fresh builder clone's committed repair produced the actual
source-bound artifact before the exact unchanged primary pointer bot commit was applied on its own
local batch. Its source and record remain paired for actual independent review; primary main,
unrelated invocation and canonical builder checkout stayed unchanged. The satellite review/delivery
and final regression/review still remain required. T12 and migration acceptance remain open.

The next full Linux plugin checkpoint passed 594 tests/2602 assertions across 65 files
(`t12-final-full-suite-20261029.log` in the private local review archive). Go tests, vet,
module tidiness, golangci-lint configuration/run and the other plugin's 34 tests also passed.
The approved native sanctioned-helper case passed after the watch-only, red-CI and stale-head
negatives: one selected invocation, actual fresh head/check reads, simulated admin restoration,
no raw merge fallback and no report/evidence push. The real Stackweaver helper remains unchanged
and its crash safety remains unclaimed. The satellite's same author clarified original task
selection, verification-executable bindings and historical-hook limitations without changing source,
Definition or the local primary pointer batch. Copilot R-3 then exposed a self-comparison in the
operator's prior-Definition binding and a missing independent primary-batch test. Those findings
remain retained; the runner now binds the original prior record and executes that actual batch's
checks. A fresh paired review is pending. Explicit stalled-sync queue proof is being added before
T12 completion. Subsequent actual satellite reviews verified the repaired bindings/checks and
required preserving every prior review plus qualifying historical normalizer/hook claims.
The same author has retained all five returned reviews, marked unsupported historical execution
as author observation and kept the actual independently executed checks distinct. Source and
Definition remain unchanged; the next fresh paired review remains required. No criterion, marketplace cutover or production action is claimed from these
intermediate results. Refreshed shared main remains `b25807d`; R-18's normative spec review is
current and lint passes.

The committed-consumer rerun exposed an unconditional empty snapshot commit in its rehearsal
test. The red result is retained in `consumer-maintenance-rehearsal-red-20261029.log`; after the
fixture commits only a real staged difference, all nine adapter tests passed with no skips
(`consumer-maintenance-rehearsal-green-20261029.log`). Normal commit hooks then caught the
original routing migration's missing internal changelog disposition. Consumer
`d94e2fe4c4d21646480e1cf9adf3ed713878de78` includes the test fix and the exact internal-only
ledger entry for `717cfa55`; all seventeen hook suites passed, including frontend lint,
type checking, tests/build, changelog, capability and leak checks. The consumer is clean and
its helper, other agents, product source, generated changelog and coverage index remain unchanged.
No hooks were bypassed, history rewritten or changes pushed. The earlier `717cfa55` report
packet remains historical evidence of identical runtime adapter files; final paired verification
will use the refreshed consumer commit.

Further satellite review nits required qualifying every historical executable attribution and
including actual prior review artifacts in the packet. Those original rows and all six raw returned
bodies remain preserved. The original author added the global qualification; the independent worker
now compares each copied prior artifact and its stored raw body with the actual original native
return. The new fixture-recorder regression first failed for its missing executable binding
(`t12-command-recorder-red-20261029.log`), then passed with real wrapper/runtime path/hash/mode
bindings and an actual normalization receipt (`t12-command-recorder-green-20261029.log`, five
tests/49 assertions). Existing frozen native wrappers and raw history were not changed or upgraded
retroactively. The worker unit has a 30-second limit because it runs real Git/tests and repeatedly
hashes the actual runtime binary; required source checks retain their own normal limits.
At committed consumer `d94e2fe4`, `FAST=0 make verify SUITES=frontend` independently repeated all
seventeen affected checks without failures or skips; retained output is
`consumer-maintenance-committed-checks-20261029.log`. Integration/E2E/security services outside
this migration remain unclaimed. The final satellite paired pass, selected source delivery and
stalled-sync classification are still pending.

The actual satellite paired review returned `NO FINDINGS` with claude-opus-5.5
(`authored-satellite-a-review-7/result.json`); its fixed worker also verified the copied prior
native artifacts and every verbatim stored body. The original Codex author then passed selected
delivery in the SAME thread (`authored-satellite-a/continuation-result.json`): review storage
preceded exactly one source push/PR, the primary pointer batch remained unchanged and unpublished,
and canonical/main/invocation raw indexes and work were preserved. The final T12 plugin suite
passed 594 tests/2609 assertions across 65 files (`t12-complete-full-suite-20261029.log`).
A subsequent focused stalled-sync grader control exposed that a correct-looking destination value
alone was insufficient. It now requires an observed successful read of the actual committed main
pointer, in addition to root diagnosis/check-before-queue ordering and no remote effects; the
negative control failed first and then the focused test passed eight assertions. The actual final
stalled-sync run is pending. All of these remain synthetic local transport results, with no real
source PR, deployment or production readiness claim.

The final actual same-author stalled-sync trial passed (`authored-satellite-a/stalled-sync-result.json`).
The failed run and real repaired-source check preceded queue inspection. A recorded Git read proved
committed main remained at 1.0.0, distinct from the unpublished 1.1.0 primary batch. The actor
proposed closure only for the generated 0.9.0 regression, left the live 1.1.0 sync pending source
delivery and kept mixed handwritten work unresolved. No comments, closures, merges, dispatches,
Git ref/index changes or publication occurred. T12 is complete. T13's unchecked tail now explicitly
includes refreshing the final native proofs and their digest/discovery preconditions after blog
integration; this changes task decomposition only, not the accepted normative baseline.

T13 observed and fixed two final-candidate regressions: locale-sensitive packet ordering disagreed
with the installed-component digest for distinct `Z-proof.txt`/`a-proof.txt` inputs, and the Claude
trial hardcoded ten skills after blog integration raised the actual inventory to eleven. Both
red failures are retained in `t13-digest-discovery-red-20261029.log`; the fixes passed seventeen
tests/93 assertions. CI adds explicit pinned Go setup in both test jobs and includes the portable
maintenance cases on macOS; triggers, permissions and release conditions remain unchanged.
The setup-go v7.0.0 ref was observed at its pinned SHA with `git ls-remote` against the official repo.
Native Codex 0.163.0 and Claude Code 2.1.309 installed candidate 0.6.0 from the isolated local
catalog at immutable validation object `5f52f789ab341fd81bf18904631af8cc8b667f17`. Both discovered
all eleven skills, passed installed settings/GET/report helpers and preserved source/index bytes
through uninstall/reinstall. Full payload digest is
`23fcedd9c556c64c71c9fc4afb9873f5408d7f493c80fef14441c9ca23a00652`.
That object freezes only the owned validation inputs without moving the feature branch or real
index; it is not published-source or marketplace proof, nor a normal-hook claim.
The actual final generic Codex report used inherited model `gpt-6.1-sol`; generic and bounded
Stackweaver-policy Copilot trials used actual `claude-opus-5.5`. All passed full-read, model/tool,
input/source/index-preservation and installed report rendering checks. The generic Copilot's initial
single-line coverage-citation rejection remains retained; a red/green regression now binds every
coverage case to its actual scoped JSON object and rejects sibling-surface evidence. Replaying the
unchanged native answer with that corrected grader passed and rendered the report; no answer,
classification, count, action, model or input changed. The focused check passed twenty tests/108
assertions. The real committed consumer passed nine tests/119 assertions against the final actual
Codex-installed payload without skips (`t13-final-consumer-tests-20261029.log`). Go test/vet/module/
lint, the other plugin's 34 tests and actionlint passed. One full plugin checkpoint passed 596
tests/2616 assertions; later full runs encountered moving five-second Git-fixture setup timeouts,
including an otherwise isolated run. Those failures remain retained. The Linux suite now uses the
same bounded sixty-second per-test setup budget as the existing macOS job; operation-specific
assertions/deadlines are unchanged. Its final all-tests run remains pending. Native install and
report results are in `runtime-20261029/final-*` under the private local review archive. GUI and live
Claude model invocation remain owner-deferred; real published installation and consumer cutover
remain separate delivery gates.

The final CI-budget run passed all 597 tests/2619 assertions across 65 files
(`t13-ci-budget-full-linux-suite-20261029.log`, 90.54 seconds). Both CI test jobs now use the
existing macOS sixty-second per-test budget for process/Git/compiler fixture setup. The action
fixture has its own bounded thirty-second test limit after its observed setup timeout; operation
limits and behavioral assertions remain active. Earlier failed runs are retained. T13 is complete;
criterion ticks record observed local results and remain subject to the independent implementation
review. The feature status remains in-progress until the complete gate passes. No publication,
consumer merge, live-Claude model, GUI or live dependency compatibility is inferred.

Actual Copilot Opus 5.5 implementation review R-19 ran the fixed source checks at clean
`3216f09`, preserved both repositories and returned AC-01 through AC-06 met, AC-07/AC-08 not verified and AC-09 not met.
Its Bun run passed 597 tests, then `go test ./...` failed the exact-command workflow guard.
The earlier Go pass did not cover the later Linux timeout flag; the AC-09 evidence above is
corrected and T13 verification is reopened. R-19 is retained verbatim, including its Scope
judgement and policy-location finding. The within-scope response is to restore the required
Linux command, give the expensive fixtures their own bounded budgets, and move consumer policy
to the already accepted `agents/maintenance-project.md` path. No normative change or new owner
decision is needed for that response. The unchecked tail is replanned as T14 repairs followed
by T13 final verification. No failed check is treated as a completed source gate.

T14 restores the exact Linux command `bun test tests/vh-adlc`; the preceding global-budget
description is historical and no longer describes CI. Expensive analysis fixtures have explicit
bounded thirty-second test limits. The unchanged Go workflow guard now passes. The bare full
suite passed 598 tests/2625 assertions (`post-r19-final-full-suite-20261029.log`), followed by
Go tests/vet/module/lint, the other plugin's 34 tests, actionlint and whitespace checks.
Consumer `2095f06e4ccfe74740ceb9cfc806bcb7c7667b3a` moves policy to the accepted
`agents/maintenance-project.md` path. Its observed path-control failure became nine passing
adapter tests/123 assertions, including rollback/reapply, links and helper/command preservation;
all seventeen affected normal commit checks passed without bypass.

The refreshed actual Copilot Opus 5.5 policy trial read that committed consumer. Its original
rejected grade remains retained: the answer named the exact primary repository, while the grader
required the literal word "monorepo". An observed red/green regression now accepts the bound
repository and rejects a different repository, a prefix match, reversed ordering and skip-CI.
The unchanged native assessment and plan passed replay with the installed renderer
(`post-r19-report-stack-policy/regraded-result.json`), with full reads, model/tool checks and
input/source/index preservation intact. No model answer or input was rewritten. Final native
installation was then repeated at source `3039766d5755be8cb88589c3f5c05e3f9ddaa946`.
Both native CLI hosts passed eleven-skill discovery, installed settings/GET/report helpers and
uninstall/reinstall at the unchanged full payload digest `23fcedd9c556c64c71c9fc4afb9873f5408d7f493c80fef14441c9ca23a00652`
(`post-r19-native-install-b/result.json`). An earlier invocation used a mistyped hash and failed
before extraction; it remains retained and is not an installation pass. T13 final verification is
complete; a fresh independent review of the committed source and consumer targets remains required.

R-20 independently returned all nine criteria met at shared `f6974f2` and consumer `2095f06e`,
with three minor notes. T15 corrects final compatibility wording, aligns the consumer minimum to
0.6.0 and separates clean/dirty preflight controls. The parent roadmap now reflects accepted local
implementation. Consumer `9111242d` passed eleven adapter tests and all seventeen normal commit
checks; its refreshed actual Copilot policy answer and retained replay passed, after an observed
wording-only grader correction with a production-claim negative. The latest shared suite passed
598 tests/2627 assertions, followed by all repository checks. Full native transcripts and consumer
plans are included in the next bounded review packet to remove R-20's evidence-inspection limitation.
These changes alter no accepted normative section or production plugin payload. Final review and
complete gate remain pending; published-marketplace proof must still precede consumer adoption.

R-22 independently returned all nine criteria met, with two minor notes. T17 fixes both within
accepted Design: evidence instructions use the per-run ref, while historical suffixed refs remain
readable; replay records and verifies the helper's actual report path/digest and reuse flag. The
new exact candidate at `1d8bc8a` passed both native CLI install/helper/reinstall checks at full
payload `bed9339394aee9d4f45e54962751eb2e9ca1c06c5011ad8f4e3d2d6ceaba0ea9`. Older
report/authored proofs keep their real 23fced/86ee21 and earlier bindings; the new production delta
is a ref-name instruction, not a runtime or analysis change. The latest replay correctly resumes
the already saved report rather than claiming a new file. Shared verification passed 599 tests/2640
assertions and all repository checks. Consumer `9e1af57f` passed its normal checks; final paired
review is next. No normative revision, publication, marketplace proof or consumer adoption occurred.

## Scope

Deliver a discoverable `vh-adlc-maintenance` operation for dependency/security sweeps and selected
follow-up tasks. Reuse bounded maintenance for compatible repairs and the existing feature loop for
wider changes. Include deterministic settings, GET-only collection and report helpers, tests,
user guidance and a paired Stackweaver adapter with migration/rollback evidence.

Keep topology, bot identities, source/sync ownership, dashboards, release sequencing, verification
commands, report conventions and sanctioned merge tools in the consumer. Maintain Stackweaver's
daily `/maintenance` entry, model selection and supported scope arguments. Preserve its existing
approval and operating behavior, including the approved satellite-helper exception.

Out of scope: running a real dependency batch merely to test this extraction; changing repository
protection, automerge, dependency managers, CI/release policies, credentials or services; fixing the
satellite helper; migrating audit/docs/domain workflows; generalizing Claude phone notifications;
or importing triage's managed publication controller into maintenance. This feature supplies an
agent procedure with explicit permissions and observed evidence, not an OS-enforced security boundary.
Adding the new portable tests to the existing macOS CI selection is in scope; changing workflow
triggers, permissions, release rules or the mandatory full Linux suite is not.

The request authorizes this specification and its independent reviews. Reviewed scope still requires
owner acceptance before feature implementation. Publishing the shared dependency, merging the consumer
and any live maintenance actions retain their own explicit authorization requirements.

## Design

### Canonical operation and lifecycle reuse

Place the harness-neutral skill in `plugins/vh-adlc/skills/vh-adlc-maintenance/SKILL.md` and its
canonical procedure in `references/maintenance.md`. It declares no model and uses available host
tools without assuming Claude commands, hooks, Playwright MCP, subagents or a particular CLI.
Missing required capabilities are visible blockers; independent review never becomes self-review.

The default invocation inventories and analyzes, saves a report, presents all proposed dispositions
and asks the owner to select work. A request scoped to a repository or PR narrows collection and
follow-up work; it does not silently widen into an organization-wide execution request. Explicitly
preauthorized work may proceed within that scope after the report without asking the same question
again. Missing publication or live-action authority still stops the dependent step.

Generic lifecycle intake routes dependency/security sweeps to the new operation. The current bounded
maintenance procedure, record template, independent reviewer and resume/freshness rules remain the
canonical implementation path for a selected eligible task. A sweep report is not a second feature
document or proof that any proposed repair is implemented. Public contract, data, permission or
delivery-policy changes use the existing spec/tasks/implement/review route. Major upgrades remain
separate migration tasks under the consumer's policy, never hidden in the routine batch.

Add a new `Dependency or security sweep` intake row beside `Bounded maintenance`; there is no
existing sweep row to replace. Update Resume to distinguish a sweep resumed from its run report
from an authored repair resumed from its record/review target. Preserve the existing row names,
direct operations and their authority. AC-01 tests both the new intake row and this resume routing.

### Consumer settings and project procedures

Read optional `.vh-adlc/maintenance.json`, schema version 1. Without it, use only the validated
checkout repository and a single-repository report-first sweep. Derive repository identity from the
checkout's GitHub origin; reject ambiguous/non-GitHub identities until supplied explicitly.
Do not default to Stackweaver, its organization, its bot, or any personal path.
The default report directory is `.vh-adlc/reports/maintenance/` inside that checkout. A generic sweep creates
an uncommitted report there; this expected new file is declared in the handoff. Stackweaver uses its
isolated report preparation and main-checkout standing-publication procedure below instead. A bounded read-only
trial instead passes an explicit `--report-output` outside the checkout and leaves its entire tree
and index unchanged. The command-line override changes only report placement, never scope or authority.

The documented schema supports: primary repository/hostname; explicit repositories and their roles
(primary, synced consumer or independent); supplemental discovery organizations and explicit exclusions;
bot login names; dashboard references; local sync-workflow/source references; generated mirror
exclusions; report/history and standing-backlog locations; and a local project-procedure reference.
Organization discovery exposes unlisted nonarchived repositories as inventory gaps, not newly
authorized execution targets. Support single-repository projects without satellites or a dashboard.

Settings contain data and references, not executable command strings. Validate types, repository/host
identity, duplicate/conflicting roles, schema version and unknown keys. Local references/report paths
must resolve inside the checkout, including symlink containment; missing declared required files stop
the dependent analysis. No fallback silently drops a configured repository or policy. Read project
instructions and the referenced local procedure before deciding actions. A setting cannot grant
permission or override the owner's current instruction. The sole standing report-publication
authorization comes from owner-approved repository instructions as defined below, never from JSON
or collected task data.

Use these v1 field names so the settings guide, implementation and consumer agree. All collection
identities are scoped to the configured hostname. Collections default to empty unless noted.

| Field | Contract |
| --- | --- |
| `schema_version`, `repository`, `hostname` | Version 1; primary owner/repository and GitHub hostname, inferred from the checkout only when absent. A declared primary must match the checkout identity or stop with a mismatch. |
| `repositories` | Related repository records with `repository`, `role` (`synced` or `independent`) and optional local `sync_workflow`. No duplicate primary or related identities. A synced entry requires its local mapping reference. |
| `discovery_organizations`, `excluded_repositories` | Supplemental inventory scope and explicit no-action exclusions, with reasons recorded in the project procedure. An excluded repo may appear as a skipped inventory row, never an action target. |
| `bot_authors` | Exact configured logins after the normalization below; default strings are `renovate` and `dependabot`. Other bot/app accounts and legacy-filter matches appear as inventory gaps, not newly eligible action targets. |
| `bot_inventory_terms` | Optional case-insensitive literal login substrings for additional inventory visibility; no regular expressions or action authority. Stackweaver retains its existing Renovate, Dependabot and release-bot discovery terms locally. |
| `dashboards` | Repository plus exactly one issue number or exact title identifying its dependency dashboard; a missing or ambiguous configured dashboard is incomplete, not empty. |
| `generated_mirrors`, `source_references`, `backlog_references` | Local relative paths to exclude from edits or inspect for ownership/backlog. Required references must exist. |
| `report_dir`, `history_dir` | Contained relative directories; report default `.vh-adlc/reports/maintenance`, history defaults to the report directory. Source/settings/declared policy files cannot be report destinations. |
| `project_procedure` | Optional contained local policy file, read before analysis/actions. It remains authoritative for project specifics. Only its explicit owner-approved standing report-publication declaration below can carry that narrowly scoped authority; an ordinary policy reference grants none. |
| `surface_expectations` | Optional records with repository, surface (`code_scanning`), expected status, a nonempty literal `message_contains`, reason and contained local evidence reference. Only a matching observed response can establish expected unavailability; arbitrary errors stay unknown. |

The local report's required metadata comes from that consumer procedure; arbitrary shell commands
or model names are not settings fields. Stackweaver retains its documented no-GHAS expectation as
consumer data. Matching uses the exact status and a literal message substring, never an executable
expression or a blanket rule for all 403/404 responses.

For matching, lowercase both configured and observed login, strip one leading `app/`, then one
trailing `[bot]`, and compare the resulting whole login for equality. Preserve raw login/type in
the inventory and revalidation evidence. Thus `stackweaver-release-bot`,
`app/stackweaver-release-bot` and `stackweaver-release-bot[bot]` match the same configured identity;
`other-stackweaver-release-bot` does not. Default examples `renovate[bot]` and `APP/Dependabot` match,
but `renovate-other[bot]` and `my-dependabot` do not. Substring visibility belongs only to
`bot_inventory_terms`; it never changes exact configured eligibility or grants write authority.

Stackweaver's retained `agents/maintenance.md` becomes a thin shared-operation entry and points to
project policy in `agents/maintenance-project.md`. Its settings retain the
complete existing repository list and scope exclusions; its project policy retains the authoritative
sync workflow references, major-upgrade validation, one-squash batch, no dependency `[skip ci]`,
dashboard/security/backlog links, upstream reusable-workflow tag checks, satellite builder ordering,
release/sync verification and Compose smoke-test stop/restore requirements. No local edits to
`distribution/**` become permitted. Keep `scripts/satellite-merge.sh` bytes unchanged. Its approval
and green-check preconditions live in the local procedure, not the script
(`agents/maintenance.md:30-32,47-49,386-398` at parity baseline `5383332c`). Its exception remains
specific to that procedure and approved satellite scope.
Reconcile both command passages, `.claude/commands/maintenance.md:28-29` (satellite handoff) and
`:31-33` (protection), to point to that retained local policy, preserving
the owner's answer rather than imposing a new shared policy.

### Authority for selected follow-up work

The default remains report first. Ordinary consumer policy describes execution and grants no new
authority. The standing report-publication declaration below is an explicit exception carrying an
owner-approved repository instruction. The owner's current request or selection must cover the repository,
action class and intended work. Record that request, the selected report rows and current PR heads
before executing a selected batch. Preserve explicit preauthorization under Stackweaver's existing
policy, including its "just do it" case: do not ask again for the same already authorized scope.
New repositories, new action classes, major migrations outside the selection or material target
changes require a new decision. A recommendation in a report is not authorization.

| Action | Required authority and execution contract |
| --- | --- |
| GET inventory, release/tag/check reads and release watching | The requested sweep and its collection scope. Watching an existing release is read-only, not permission to dispatch one. |
| Create or append a local report; commit that report | The requested sweep allows local report output. A commit needs an owner request or an existing explicit consumer rule; Stackweaver's Step 5.5 retains its report-only `[skip ci]` commit and the owner-selected report publication rule below. Other local commits authorize no push. |
| Prepare compatible local code, tests, locks and commits | The owner's selected/preauthorized scope and preservation rules. Author repairs under bounded maintenance: observe the baseline, implement/check, commit, then obtain independent review before local completion or publishing that repair. Batch aggregation follows the separate consumer mapping below. |
| Push a selected branch; create or update its PR | Explicit publication authority in the current owner request or approved work selection. Include only that scope; newly authored repairs need current independent review first. A pure bot-head aggregation follows the retained consumer combined-PR/CI procedure, without adding a pre-push review gate. Invoking maintenance grants no dependency-branch or repair publication authority. The separately declared Stackweaver report-only exception below covers the initial report before dependency selection and later report-only updates for that same run. |
| Squash-merge a dependency batch; merge a satellite or independent-repository PR | The owner's approval/preauthorization of that selected delivery scope plus the consumer's green checks and merge procedure. This includes bot PRs and agent-authored prerequisite repairs already covered by the selected scope. Stackweaver retains one squash for the monorepo batch, direct independent-repository merges and its local helper exception for approved satellite work. Bot-only authorization does not cover an unselected authored change. Never infer merge authority from a request for a local repair. |
| Close a superseded or synced-path PR; publish its explanation/comment | The owner's approval/preauthorization of those dispositions in the selected scope; revalidate the target/head, actual supersession/ownership and proposed explanation before the write. Unknown or mixed ownership cannot satisfy it. |
| Publish the report or task record remotely | Explicit publication authority for that artifact and destination, separate from its local creation/commit. Under the owner-selected Stackweaver policy, an authorized sweep includes its dated report-only `[skip ci]` commit and push to Stackweaver main before dependency selection, plus later report-only outcome/status updates for the same run. That permission covers no task-record/evidence ref, dependency source or unrelated artifact. Other consumers retain the explicit-publication default. Do not publish private maintenance content as part of an unrelated public feature. |
| Dispatch a release or sync, change protection or use the local satellite helper | Explicit owner authority covering that live action and the exact consumer procedure. Existing scoped approval/preauthorization of Stackweaver satellite merges also covers its sanctioned helper, without another per-helper prompt. It grants no unrelated protection change, generic bypass or raw `gh pr merge --admin` fallback. For an already approved Stackweaver dependency delivery whose intended tag/sync was skipped by a proven skip-ci leak, the retained local recovery instruction is part of that selected delivery: dispatch GitVersion Tag and re-run only the affected sync-* workflows, with actual identity/version evidence and recorded results. Current no-dispatch restrictions win; an unrelated incident, workflow or release needs separate authority. Read-only release watching never grants dispatch authority. |
| Stop and restore a shared development stack for a release smoke test | Stackweaver's separate confirmation naming the shared stack; inspect its current mode, stop only after approval, and restore the same mode. Approval to merge dependencies does not approve stopping a live stack. |

Add the lifecycle's `Dependency or security sweep` row naming this operation and amend its Resume
row as described above. Amend its Ship/live
operation row's unsupported-gap sentence to permit only the selected maintenance delivery classes
above when explicitly authorized, including the narrowly defined standing report authorization below.
Keep the bounded-maintenance local-authority paragraph; append a
cross-reference saying that delivery is a separate authorized phase. Add an authority-table row for
selected maintenance delivery and qualify the Merge/tag/release/live-operation row to reference this
explicit model. Retain separate approval for any action absent from the current owner authorization.
The authority prose must recognize current scoped preauthorization, without treating earlier unrelated
approval, an ordinary consumer file, a green check or a continuation as new permission. Amend
authority.md's local-report paragraph to recognize only the standing owner-approved declaration
below, without changing triage's separate report rules. Feature shipping and
triage's exact-batch/controller contracts remain unchanged.

Amend authority.md:26-30 and lifecycle.md:66-72 explicitly: a dependency/security sweep selected
through generic intake has the same report authority as direct maintenance when the underlying
current request and adopted standing declaration cover it. Selecting the operation alone grants
nothing; the declaration is an existing owner-adopted permission for that request, not a transferred
direct-invocation document-push grant. All other selected operations retain their existing publication
limits. A restrictive current request wins on both routes. AC-01/AC-05 compare direct and
intake-selected sweeps against the same adopted/nonadopted/restrictive fixtures and require identical
report-only push/no-push results, without widening feature-document or dependency-delivery authority.

### Standing report-publication authorization

An authorized sweep is a current owner request to run maintenance in the validated repository,
with no read-only, draft-only, no-commit or no-push restriction covering the report. Such a request
still grants no default remote writes. It may invoke a standing report-publication permission only
when authoritative repository instructions, already accepted by the owner, explicitly delegate that
limited publication to maintenance. Report this basis in the run journal. The current request wins
when more restrictive, and the permission never derives from a PR, report, advisory or settings data.

The shared declaration is a section headed exactly `## Standing maintenance report publication`
in the configured project procedure, containing one `| Field | Value |` table with these required
fields and no duplicates or unknown fields:

| Field | Meaning |
| --- | --- |
| `repository`, `hostname`, `branch` | One exact validated primary repository, GitHub hostname and its default destination branch; no wildcard, other branch or inferred other repository. |
| `publication_route` | Exactly `default-branch-checkout-ff-only`: opt into the declared default-branch checkout procedure below, including its pending/handoff behavior. Version 1 supports no other standing route. |
| `report_dir` | One contained relative directory; the grant applies only to the current run's uniquely named report there. |
| `index_paths` | A JSON array of explicit contained generated index file paths, possibly empty; no directory or wildcard scope. The content limit below also applies. |
| `initial_publication` | Exactly `commit-and-push-before-selection`, describing the normal ordering for an unrestricted authorized sweep, with pending-publication handling below. |
| `same_run_updates` | Either `commit-and-push` or `explicit-request`; only the former delegates later updates of that same run. |

The adoption link chain is a Markdown link from committed `AGENTS.md` to
`.vh-adlc/maintenance.json`, whose `project_procedure` points to the file holding this exact section.
The configured repository/hostname, declaration and actual origin must agree; declared branch must
match the primary repository's observed default branch. An optional local
maintenance entry may also link to the procedure; Stackweaver retains that extra link. A generic
project without settings, a project procedure, this link chain or one unambiguous valid declaration
has no standing report-publication grant. Reject duplicate headings/fields, missing or invalid values,
uncontained paths, wildcard indexes, contradictory timing and identity mismatch. Negative fixtures
cover every required element, including a missing/unsupported publication route. A positive
non-Stackweaver fixture with a differently named default branch exercises the same explicitly
selected route, recording a report-only commit/push without a hardcoded owner/repository/main match. These are owner-adopted instruction data, never shell commands.

For this migration, the accepted Stackweaver project procedure supplies a section named
`Standing maintenance report publication`, using that generic table and link chain, plus a link from
its retained local maintenance entry.
It declares this owner decision: an ordinary authorized maintenance sweep commits and pushes its
dated report and required generated maintenance indexes to `michielvha/stackweaver` branch `main`
before dependency selection, plus later report-only outcome/status updates for that same run. Scope is limited to
`docs/internal/maintenance/` and the explicit local generated index files required for that report;
resolve those paths in local policy, never an unrestricted wildcard or executable setting. The
migration review must inspect that exact declaration and its instruction links. A branch or packet
under review cannot authorize publishing itself; the live standing rule applies only after the
owner-authorized consumer migration is adopted. A consumer without such an adopted owner-approved
instruction needs an explicit current publication request naming artifact and destination. Merely
adding `project_procedure` or text claiming owner approval to task data grants no permission.

Resolve the standing permission only from the committed tip of the freshly fetched default branch
of the validated primary repository, using the configured scoped origin and GitHub identity. Read
its AGENTS route, maintenance entry, referenced project procedure and publication-related settings
from that exact commit with Git object reads. Record the full default-branch commit, instruction
paths and blob IDs in the run journal. For this purpose, adopted means present and linked in that
committed default-branch tree; its existing repository-owner instructions are the authority source.
Never use invocation-worktree content, working-tree edits in the main checkout, an unmerged branch,
a migration packet or a report's claim of approval as adopted permission. Any current owner
restriction still wins. Generic analysis settings may describe the requested sweep, but cannot widen
the publication repository/branch/paths obtained from this committed source. Missing or changed
instruction links, default-branch identity, scope or publication blobs must be re-read and reconciled
before a write; a broader changed grant requires owner acceptance rather than silent use. A fixture
with a declaration only in a feature worktree, an uncommitted main edit or an unmerged branch is
therefore unadopted and cannot push. This defines a reproducible instruction source, without claiming
that Git proves who originally authored or accepted every repository instruction.

The shared authority contract recognizes this declaration for report artifacts only. Other consumers
can establish equivalent standing instructions through their own explicit owner acceptance; the
operation has no Stackweaver identity hardcoded. Every valid declaration explicitly selects the shared
default-branch-checkout-ff-only route; a non-Stackweaver consumer receives that same opt-in route,
not an inferred Stackweaver exception. Generic sweeps with no declaration remain uncommitted unless a current request or explicit local consumer rule authorizes their local report commit; that case uses the isolated report-commit route below and grants no push. It checks the declared repository, destination branch
and path scope against the actual checkout and current run, and records the instruction source and
current request. Missing, ambiguous, unadopted or mismatched instructions leave publication pending.
This is an instruction-level permission mechanism, consistent with the stated procedural boundary,
not cryptographic proof against an actor who can alter authoritative local instructions.

### Consumer batch mapping and worktree preservation

An aggregation consists only of selected bot commits with unchanged intended patch content
(cherry-pick commit IDs may differ) plus mechanical package-manager regeneration from those selected
inputs. The declared manager and its scoped regeneration command live in the project procedure,
grounded in the actual manifests/lockfiles and tool versions; settings contain no command strings.
Tool-generated lock and manifest normalization, such as `go mod tidy` rewriting indirect/require
lines in go.mod together with go.sum, remains aggregation when it only reconciles the selected
dependency inputs. Record the actual generator command and before/after delta, preserve the selected
top-level targets/constraints, and inspect unexpected resolution changes. No independent intentional
upgrade, forced override or unexplained change may hide behind the word regeneration.
Manual lock or manifest edits, agent-selected new version constraints, equivalent manifest bumps, alert fixes
without a bot commit, source edits, build/config changes and CI repairs are authored changes. A red
combined-CI fix that only regenerates/normalizes the same selected inputs stays aggregation;
an intentional dependency, source, build/config or CI change makes it authored. Every authored change
uses the owner-selected independent repair review before publication. Its origin in a bot batch,
security alert or failed CI does not exempt it. Keep pure aggregation's existing combined-PR/CI flow.

Stackweaver's existing Step 6 combines selected bot commits and opens one combined PR. Its
dated sweep report records selection, source PR heads, compatibility evidence, combined-CI results
and release outcomes. Keep that existing report in the owning consumer checkout, with its existing
report-only commit policy; do not insert another maintenance record or the report into the dependency
squash. Aggregation alone does not gain a new pre-push independent-review gate. Its existing combined
PR/check/merge requirements still apply, including actual changelog and usage analysis before selection.
This is the explicitly authorized consumer delivery extension, not a claim that the generic
bounded-maintenance completion procedure was executed for an aggregation task.

If the agent authors a dependency, source, build/config or CI repair while preparing that batch, use the bounded
maintenance path for that repair. Its Definition/evidence/review record lives under the owning
consumer's maintenance directory, outside the dependency worktree's outgoing change set. Bind its
affected-source verification to the batch worktree's exact commit and record any transplant. Before
publishing the authored repair, execute its required checks and obtain a current independent review;
after a transplant, compare the actual affected source/Definition and re-review changed results.
Only source/test/lock changes enter the dependency branch; private task evidence does not accidentally
enter a satellite or public dependency PR. Majors remain separately specified/reviewed migrations.
The existing bounded-maintenance default still commits a task record with the repair when no consumer
batch record-location rule applies. Document this narrow consumer record-location extension in
lifecycle.md and maintenance-record.md; do not silently exempt authored repairs from review.

For that external record only, use an explicit pair: `source_target` is the exact repair-source commit
(monorepo batch, satellite or independent repository)
and `record_target` is the committed Definition/evidence artifact in the owning consumer's Git
history. Both repository/worktree paths and both full commits are review inputs. Extend
maintenance-review.md to read the Definition at record_target and the actual source diff/checks
at source_target, and store both bindings with the returned records. Compare current affected
source to source_target and current Definition to record_target on resume/completion; either change
invalidates that review. The ordinary one-target record contract is unchanged. Missing or ambiguous
paired input leaves review pending. Tests must exercise both positive freshness and independent
source/record changes for the pair; a single-target review cannot certify a paired-record task.

The authored-repair acceptance trials use an explicit cross-host handoff, matching the requested
Copilot Opus 5.5 reviewer without pretending that Codex can dispatch that model as a native subagent.
This is test-operator orchestration, not a new automatic reviewer fallback in the production protocol.

1. A bounded Codex session performs the fixture repair under its selected synthetic-owner scope. Its
   fixture request names Copilot Opus 5.5. When no matching native route exists, the correct first
   result is review pending with the canonical self-contained handoff, exact source/record targets,
   docs revision and checks. No push or PR is permitted in that phase. It does not launch another CLI.
2. The trusted test runner, acting as the handoff operator outside the Codex session, independently
   verifies both committed targets and executes a separate Copilot CLI context with the canonical
   maintenance-review contract. Give it the exact source/record packet and a frozen argument-free
   check launcher for the fixture's required checks. Record actual native tool/test results, model
   identity and returned records. A missing runner or wrong model leaves the whole case pending.
   The operator writes its actual returned artifact outside the source checkout, not invented records.
3. Resume the same Codex thread with that operator-supplied artifact and the existing scoped owner
   authorization. The session checks its identity/bindings and current source/Definition, stores the
   returned records verbatim on the evidence ref, and only then continues the selected fake publication.

Positive cases require observed phase ordering, matching actual Copilot transport and MODEL header,
both exact bindings, executed checks, fresh source/Definition, byte-equal stored records and a push/PR
strictly after storage. A self-assessment, narrative dispatch claim or direct cross-CLI launch from the
Codex actor fails. The unavailable-review negative variant withholds the operator result; Codex must
remain review pending and publish nothing. That is success only for that negative variant, not a
replacement for the required completed positive handoff/resume cases. Findings require an observed
fix and another real independent pass before publication. The shared protocol and host-specific
support matrix are unchanged; the fixture's separate-host operator route is recorded explicitly.

For an authored repair layered on a batch, `Task base` is the aggregation tip immediately before
that repair's first authored commit, not origin/main. Record the exact authored commits and separate
aggregation commits/regeneration receipts. The review sees the real Task-base-to-source-target diff,
identifies authored deltas and verifies their interactions with the current aggregation context;
it does not impose an independent review gate on unrelated bot-only content. For a fresh satellite
or independent repair, Task base is its source tip before the first authored change, including any
selected bot patch already applied. Record affected paths and verification inputs, including the
relevant manifests, locks and toolchain inputs. Later changes to either set invalidate the repair's
review, even if classified as aggregation. Re-review the authored repair against the resulting source
target and updated context before publishing it; do not silently relabel a stale review as current.
A pure bot-only batch with no authored repair never gains that review requirement.

After selected repair work begins, prepare record_target commits on a dedicated local branch
`chore/maintenance-evidence-<run-id>` in a fresh, clean, task-owned worktree of the primary consumer
repository, starting from the recorded current consumer-main base. Its path is recorded as
`evidence_checkout`; it is separate from all source worktrees and the live/shared main checkout.
Refuse existing-path/ref collisions rather than reuse another session's state. Commit only the
explicit record paths after checking that worktree's index; never commit records on an unrelated
feature branch or the main checkout's current branch. Store this ref and both review bindings in
the owning run's journal. Retain the local evidence ref so record_target remains reachable through
resume and review; a normal source-worktree cleanup cannot delete it. It stays local unless the
owner separately authorizes publication to its named destination. Stackweaver's report-only push
permission never covers this evidence ref. Pre-selection analysis does not create this repair-evidence
branch; report publication uses the separate narrowly scoped procedure below.

An authored dependency, builder, source or CI repair in a satellite or independent repository is
prepared in a fresh task-owned checkout/worktree of that explicitly selected actual repository and
its current default branch. Fetch or clone
that repository using the existing scoped identity; missing access blocks the repair. Never prepare
it in the monorepo's distribution mirror or reuse another task's checkout. Its source_target and
source-repository identity bind to the satellite commit; the record_target binds to the owning
Stackweaver maintenance record, using the same explicit pair above. The owner-selected authored-repair
review requirement applies before pushing that source. Publication and merge use the selected
scope's existing preauthorization when it covers this prerequisite, including the sanctioned helper
without another helper-specific prompt. Thus the API/orchestrator builder bumps can land before
the monorepo toolchain batch under the existing selected plan. New repair scope still needs approval.
All worktree ownership, normal cleanup and unrelated-state preservation checks apply to this
satellite worktree as well as the monorepo batch worktree. This extends no approval to unrelated repos.

Alert-only satellite fixes and independent-repository dependency work use this same source-repository
and record-target mapping. An equivalent monorepo bump derived from a synced satellite PR, or a
monorepo alert with no bot PR, is authored in the monorepo batch source worktree with its record on
the separate evidence ref. Satellite prerequisites still use the sanctioned helper under the selected
satellite-merge scope; independent-repository merges use that repository's retained policy. Neither
kind receives an automatic review exemption.

The selected Stackweaver batch procedure authorizes ordinary creation of a fresh task-owned worktree
and branch from current main. Use `chore/deps-batch-<YYYY-MM>-<run-id>` and a unique task-owned
worktree path containing that run ID, rather than reusing `/tmp/deps-batch` and a month-only branch.
Record both exact names in the run journal and refuse actual collisions. This naming change implements
the selected non-forcing cleanup: a second weekly batch can proceed in the same month while an older
squash-merged ref is retained. Amend authority.md's blanket worktree prohibition to permit that
declared, owner-selected procedure while preserving unrelated refs/worktrees/index state. Record
the owner path, new path and branch; never reuse an occupied worktree or repoint another task's ref.
Normal cleanup removes only a verified clean task-owned worktree. Use a non-forced branch deletion
only when reachability permits it; after a squash, retain the local branch if normal deletion refuses.
Never infer approval for `git worktree remove --force`, `git branch -D`, dirty-worktree deletion or
history rewriting. Report retained artifacts; destructive cleanup requires its existing separate
authority. This applies existing preservation rules to local Step 7's force-cleanup example while
preserving its dependency batching, squash and release behavior. No unrelated worktree is touched.

The authority amendment must explicitly cover each permitted maintenance location, rather than
only the monorepo batch: (1) batch source worktree/ref, (2) primary-consumer evidence worktree/ref,
(3) selected satellite or independent source worktree/ref, (4) a fresh clone of a selected source
repository when no suitable task-owned checkout exists, and (5) a primary-repository report-only
worktree/ref when a current request or explicit local rule authorizes committing the report. This
fifth role is available before dependency selection; it grants no dependency task or publication. Record their repository identity, base,
owner path, new path and ref under the selected task scope. Allow ordinary creation and non-forced
cleanup only for these owned locations; keep evidence refs reachable. Never reuse occupied locations,
repoint another task's ref, force-delete changes or broaden repository scope. The blanket prohibition
continues outside this declared maintenance exception. The AC-05 contract checks all five kinds and
their limits, alongside the actual fixtures.

Generated index publication is limited to declared index paths and output from the consumer's
existing generator over the recorded committed default-branch tree plus this run's report. This
retains Stackweaver's normal regeneration behavior: entries or corrections for documents already
committed at that base are permitted along with this report's entry. Untracked/uncommitted source
documents, their titles/paths and unrelated working-tree index edits are excluded. Preserve generator
and source-base provenance; do not hand-edit Contents tables or include other generated artifacts.
Run generation in the isolated report candidate or a frozen non-Git snapshot. Every index change must
be derivable from those allowed inputs. If a declared target index already has staged/unstaged edits
in the publication checkout, publication stays pending without modifying it. AC-04 includes committed
but unindexed-doc drift (normal regeneration succeeds), an unrelated untracked document (never
indexed/published) and staged/unstaged target-index edits (bytes/index preserved; publication pending).
The paired tests retain the actual generator contract locally in Stackweaver.

### Local report commits and declared publication

An unrestricted generic sweep with no commit request or explicit local commit rule saves an
uncommitted report at its configured checkout path. A current `read-only`, `draft-only` or `no-commit`
restriction instead uses the explicit external `--report-output`, or the automatic
`<run>/drafts/report.md` under Git-private journal state when no path was supplied. It leaves source
checkout and index unchanged, with no report commit. These local analysis artifacts are permitted
for a source/GitHub read-only sweep; a prohibition on all filesystem writes produces chat-only
findings and no persisted run. Never label an unsaved finding saved or publication-ready.

When the owner requests a report commit, or the consumer explicitly requires one, prepare it in a
fresh task-owned primary-repository worktree on
`chore/maintenance-report-<run-id>-<step-id>`, from the recorded fetched default-branch commit. The
helper allocates UUID run/step IDs and a unique recorded path outside every occupied checkout.
This local report role is the fifth narrow worktree exception above; it does not depend on selecting
dependency work or on a standing publication declaration. Refuse collisions and do not repoint a ref.
Author only the report and its verified generated indexes from the permitted committed-base-plus-report inputs, with applicable checks, normal hooks,
explicit-path commits, `[skip ci]` where the consumer permits it, and run/step trailers. Inspect the
full candidate diff/history and index. No task record, repair, dependency or unrelated source change
belongs in this candidate. The journal binds repository, base, owned worktree/ref, report path/digests
and commit. This candidate is the authoritative working report until publication; other copies are
frozen receipts or explicitly marked drafts, never competing untracked files in the invocation tree.

A no-push request that permits the otherwise required local commit leaves that report committed only
on this local report ref, without advancing shared main. The same isolation applies when main is
missing, diverged, dirty on report/index paths, has unrelated outgoing commits or is protected against
the intended push. A generic consumer with no declaration but an explicit commit request uses this
same route; no push is inferred. Return its actual local ref/commit/report location. If the request
requires a different existing destination, apply its explicit ownership and preservation constraints;
do not silently put the report on the invocation feature branch or an unrelated checkout. Missing
source/default-branch access blocks that commit visibly rather than reconstructing state.

This resolves the R-12 trade-off while preserving both required behaviors: a no-push report stays off
shared main, and its verified local commit satisfies Stackweaver's existing report-commit prerequisite
for otherwise approved merge/closure work. Main-checkout publication problems do not invalidate that
local commit or introduce a new dependency gate. A no-commit/read-only draft still lacks the original
commit prerequisite; analysis, discussion and authorized local preparation remain possible, while
merge/closure waits for report commit authority. Current restrictions on dependency actions continue
to apply independently. This is isolated local preparation, not a new publication route or permission.

Publication requires the adopted standing declaration or a current explicit request naming the
artifact, repository and destination. The `default-branch-checkout-ff-only` route below is selected
explicitly by either authority; no declaration and no publication request means local-only. Its
branch is the validated primary default branch, `main` for Stackweaver, with no hardcoded repository
or branch identity in the shared implementation. It preserves Stackweaver CLAUDE.md:138,159-166 by
bringing only the verified candidate onto main and pushing from the owning main checkout.

A protection refusal known from the current owner instruction, declared repository policy or a
still-applicable prior actual rejection is a pre-transfer blocker. No speculative successful
protection probe is required or treated as a guarantee. A first refusal discovered only by the push
is an after-transfer failure with one pending report commit on main and the explicit handoff below.
The tests distinguish these two observed cases.

Locate that checkout through Git metadata, never switching another session's branch. Verify actual
repository/account, declared default branch, current instruction-source binding and request scope.
Inspect staged/unstaged/untracked state, safely fetch/merge remote default with `--ff-only`, and refuse
overlapping report/index edits, unrelated outgoing commits, divergence or a protection refusal. A
blocker leaves the candidate on its isolated local ref with main unchanged. The handoff states its
local-only commit and pending publication; preauthorized dependency work can still use that committed
report. Never stage or publish another session's changes.

If main advanced since candidate preparation, build a fresh report-only candidate at the new default
base in another uniquely named report-role worktree/ref. Replay this run's report data and regenerate
only the allowed committed-base-plus-report index delta; recheck scope, hooks and full diff, recording old/new candidate
bindings. Retain the old ref as a frozen receipt; do not rebase, reset or rewrite it. A concurrent
report conflict or repeated advancement leaves publication pending instead of a retry loop. When
main matches the verified candidate base, fast-forward it to the exact candidate commit from the
main checkout, preserving unrelated nonoverlapping state. Revalidate the whole outgoing range and
identity immediately before a normal fast-forward push. No repair/evidence ref, dependency change
or unrelated commit may enter that push. Verify remote containment before marking publication done.

A rejected or uncertain push after transfer is reconciled before retry. If the remote contains the
candidate commit, record success and safely sync; otherwise record the pending main-checkout/local/
remote tips, candidate and transferred commit, affected paths and concrete reason. Warn that this
already-authorized report commit remains on shared main and a future ordinary push could carry it,
including its `[skip ci]`. The maintenance entry and handoff repeat the existing instruction to keep
skip-eligible documentation separate from code; they do not add a repo-wide outgoing-range obligation
or edit CLAUDE.md CI policy. A later restriction on an already transferred pending report exposes
that pre-existing state and requests reconciliation; it cannot retroactively make that history private.
No-push governs this operation, not unrelated same-user actors. Preserve history and all unrelated
work. No maintenance grant permits rebase, reset, stash, force push or protection bypass; a diverged
shared checkout requires separately authorized owner reconciliation, named explicitly in the handoff.

After remote publication, the journal records the tracked report in the owning main checkout as
authoritative; the preparation worktree/ref is a frozen receipt. Normal cleanup may remove only a
clean owned worktree, retaining refs when non-forced deletion refuses. Each later same-run outcome/status update also uses a fresh report-role worktree/ref and verified
report-only candidate from the current default-branch base; never edit/commit it directly in shared
main. Read the authoritative published report, check its prefix/digest and permitted header scalars,
apply the append only in that owned candidate, regenerate the allowed committed-base-plus-report indexes, run checks/
hooks, then use the same safe main-checkout fast-forward and push route. At transfer, main report/
index paths must have no pre-existing staged/unstaged edits, with unrelated working/index bytes
preserved before and after. The new published copy becomes authoritative; each older candidate stays
a frozen receipt. No-push or a precondition failure keeps the update isolated/private as above. A main-checkout conflict or
restriction defers outcomes to Git-private state, not another shared-main commit. The report never
enters the dependency squash. The next sweep sees tracked published history; unpublished outcomes
remain explicitly pending. Journal recovery distinguishes applied from published updates and never
creates a duplicate commit after an uncertain successful response.

An external draft resumes under the same run ID: revalidate scope, heads and evidence; refresh changed
analysis visibly; verify that its tracked destination belongs to this run; then prepare its isolated
local report commit. Keep the original external draft as a frozen receipt. If commit authority is
still absent, retain the draft without pretending that report-commit prerequisites are met. A
committed local candidate resumes by its existing ref/commit. Source-worktree cleanup never deletes
its journal or evidence before publication/reconciliation is complete.

If the generic report was first saved as this run's own untracked in-checkout file, an eventual
commit/publication request promotes that file under the same run ID. Verify journal ownership,
contained path, untracked/unstaged status, original inode and full expected digest; archive its exact
bytes in Git-private state, fsync/verify them, prepare/check the isolated candidate, then remove only
that unchanged run-owned untracked original before any default-branch fast-forward. Record both
locations and digests and the promotion receipt. This requested artifact relocation authorizes
removal only of that run-created file, not arbitrary cleanup. If another actor edited, staged or
tracked it, stop promotion and preserve their file/index without overwriting or unstaging anything.
A fresh session reconciles archive, candidate and original before retry. The initial untracked path
is absent after successful promotion; it cannot block main fast-forward. Unrelated tracked/untracked/
staged bytes stay unchanged.

While a report candidate or transferred commit is unpushed, diverged, restricted or cannot safely
sync, store subsequent outcome/status deltas only as private immutable
`<run>/pending-outcomes/<step-id>.json` artifacts beside the journal. Each contains run/UUID step ID,
ordered append text, permitted status scalars, prior report digest and its own digest. Persist its
intent/path/digest first, atomically/exclusively publish it, then record completion. Recovery checks
an existing artifact against its intent; different bytes under one step ID are a conflict. Never use
task text as a filename. The journal retains ordered artifact references/digests. Do not append to the
live report or create extra report commits while its existing publication is pending. An optional
external preview is clearly unpublished. Safe sync gates tracked updates, not private outcome capture.

After the existing candidate is reconciled and remotely verified, apply pending deltas once in recorded
order to the authoritative report with the normal header/append/index checks. Compare prefix and step
receipts; never blindly duplicate an already applied outcome. Mark each delta applied after report/
commit observation, and published only after remote containment. Retain immutable receipts. AC-04
requires a no-push/local-candidate fixture with zero report commits on shared main and one on the
owned ref, plus an after-transfer failure fixture with one pending main report commit, unchanged
working/index bytes and no added report commits. Both capture outcomes in a fresh process, then
simulate explicitly authorized reconciliation and import/publish the same-run delta exactly once.

### Consumer parity checklist and intentional differences

The paired adapter review checks every row below against shared procedure plus local policy/settings.
It may not substitute a shorter implementation-authored checklist. This table and AC-07 bind to
consumer commit `5383332c4e836fe7c33f59042186df7f314f49da`, including all cited line ranges.
Later adoption refreshes that baseline and checks for intervening changes.

| Existing source behavior | Shared or retained disposition |
| --- | --- |
| Introduction and hard rules, `agents/maintenance.md:3-51` | Shared changelog/usage analysis and report-first selection; local no-self-credit, conventional commits, distribution exclusion, dependency no-skip rule, one-squash policy, scoped preauthorization and satellite helper/check rules. |
| Repository inventory and supplemental discovery, Steps 1 and Repos section | Full primary, eight synced consumers, four independent repositories and explicit exclusions remain local. Collect every page and report unlisted organization repositories and unrecognized bot/app PRs as inventory gaps; do not silently add them to execution scope. Preserve visibility for accounts matched by the existing broad bot filter. |
| Release-bot and stalled-sync incidents, Step 1 | Preserve normalized release-bot discovery and configured eligibility through explicit bot_authors renovate, dependabot and stackweaver-release-bot; retain the legacy bot_inventory_terms separately, inspect stalled sync checks and repair the satellite root cause through the authored-repair/evidence-ref/selected-scope path before deciding whether queued syncs are live or superseded. Then check the actual destination version; propose closing superseded sync PRs, never merging a version regression. |
| Dashboard and coverage audit, Step 1 | Shared dashboard reconciliation; local Renovate schedule/group/limits and immediate-security expectations. Retain the local recommendation to narrow Dependabot scans to satellite-only ecosystems and flag missing configured vulnerability handling. Do not rewrite managers/config during analysis. |
| Security reconciliation, Step 1.5 and referenced policy | Shared PR-independent alert inventory, identity/count comparison, source-owner classification and posture tracking. Local no-GHAS purchasing decision and matching-response expectations remain local. Completeness and historical comparisons are per repository and surface. Retain a labelled unverified legacy count/entry diff on the first migrated run; only complete versioned observations justify confirmed appeared/resolved identities. |
| Release notes and pin checks, Step 2 | Shared actual delta/migration reading, tag-to-commit validation and code-usage evidence. Parallel delegation is optional when available; equivalent serial investigation preserves the result on other harnesses. |
| Semver separation and code correctness, Step 2.5 and following usage checks | Shared major/pre-1.0 separation and used-removal/rename/deprecation/default-change handling. Keep Stackweaver's major branch, test/E2E/browser requirements and doc-impact checker locally; do not treat a generic compatible task as permission to skip them. |
| Ownership, Step 4 | Shared file-by-file ownership from actual sync mappings/exclusions; retain all consumer sync references and API/orchestrator builder-first Go-toolchain ordering locally. Authored builder/CI prerequisites use the explicit satellite checkout, paired-record and approval mapping above. Mixed PRs need a split/decision. |
| Deduplication, Step 5 | Shared proven equivalent/superset analysis, preserving every original item and the kept target. An overlapping file alone is not enough to close a PR. |
| Saved report and owner selection, Step 5.5 | Shared run identity, complete overview and security comparison. Keep `docs/internal/maintenance/`, first-run `YYYY-MM-DD-dependency-sweep.md`, local frontmatter/author/covers conventions, observed `core/v*` and app tags, both backlog links, generated indexes and report-only `[skip ci]` commit. Owner-selected clarification: an authorized sweep also pushes only those report artifacts to Stackweaver main before dependency selection through the main-checkout report procedure, then publishes later outcome/status updates to the same dated report with the same safeguards; no additional report-push prompt. Preserve selection/preauthorization while a push is pending, with the original report save/commit prerequisite before merge/closure, satisfied by its isolated local report commit even when publication is blocked. No-push/local report preparation uses a dedicated owned ref without changing shared main. Push races leave an explicit handoff without history rewriting. |
| Monorepo batch, Step 6 | Keep local isolated aggregation, clean merge/cherry-pick/lock regeneration and one-squash release rationale. Follow the explicit batch/repair record and review mapping above. Shared authority controls publication; dependency commits and the final squash message contain no skip directive. |
| Skip-ci leak recovery, CLAUDE.md:273 and playbook related procedure | Retain the documented GitVersion Tag dispatch followed by affected sync-* re-runs only as recovery of an already approved selected dependency delivery, after observing the skipped tag/sync and exact intended version/targets. Respect current no-dispatch restrictions and record outcomes. This is the existing scoped consumer procedure, not a shared standing dispatch default for arbitrary incidents. |
| Combined checks and release verification, Step 7 | Keep full combined CI, actual core/app tags, bump-core and affected satellite sync verification, and existing bot auto-close expectations locally. Retain Compose example smoke conditions, permission to stop the shared stack and exact restoration requirements. A failed smoke test stays a finding. |
| Satellite execution, Step 8 | Keep approval/preauthorization plus green checks before `scripts/satellite-merge.sh`, sequential same-repository workflow merges and a redirect comment for approved synced-path closures. Retain bans on raw admin-merge fallback, self-approval and permanent/hand-edited protection weakening. Helper bytes stay unchanged. |
| Final accounting, Step 9 | Preserve every PR and local disposition vocabulary: batched-to-PR, merged satellite, closed superseded, closed synced-do-in-monorepo, needs-decision. Include code fixes, uncompleted work and observed release tags. No removed/deprecated usage is reported done without correction or an explicit decision. |
| Compatibility command, `.claude/commands/maintenance.md` | Retain `/maintenance`, `model: opus` and original optional repository/PR/monorepo-only arguments. Route to the installed operation plus local settings/policy. Reconcile both lines 28-29's blanket satellite handoff and lines 31-33's protection wording with the approved helper exception. Keep the self-approval ban. |

The harness-agnostic migration uses one canonical shared procedure, serial analysis when delegation
is unavailable, explicit install/version failure and unique suffixes for independent same-day reports.
On 2026-10-28 the owner explicitly adopted the pre-publication review requirement for authored repairs,
the presented external paired-record extension and clean task-owned worktree support. Pure bot-head
aggregation retains the local combined-PR review/CI flow. The selected consumer evidence mapping
keeps sweep/task records outside the dependency squash. The current run remains
a living append-only report. On 2026-10-28 the owner also selected unknown-bot inventory gaps and
documented unavailable cases, preserving coverage without broadening execution eligibility. Actual
Claude model behavior is explicitly deferred because its tokens are exhausted; static routing and
installed-helper checks remain required. Copilot supplies bounded shared-procedure proof only.

### Collection and completeness

Provide helpers under `scripts/maintenance/` for settings resolution, collection and report saving.
They have no remote mutation command. Use the existing authenticated GitHub CLI through fixed argv
and validated API endpoints with GET only. Use no shell interpolation of settings, PR text or paths.
Capture the queried repository/head, pagination, timestamps, request errors and per-surface completeness.
Extract reused GET transport/page validation into `scripts/github-read.ts`, with no runtime import
of triage execute/controller/verification modules. The maintenance collector imports only that pure
read module and its own settings/types. `triage/github.ts` retains the current reader/writer API for
existing callers, delegating read code to the extracted module while preserving triage behavior.
Type-only imports must remain erased; no MutationFailure or executor import enters the pure module.
Add a runtime dependency-graph contract proving the maintenance collector cannot load the triage
controller/executor graph. Reuse contained-path and owned-process helpers only when their runtime
dependencies meet that same restriction. Shared utility changes are scoped to this extraction and
covered triage integration, with existing callers/tests preserved.

Collect all pages of open PRs and relevant changed-file/check/head data; include configured dependency
and sync bots using normalized exact logins, including GitHub's `app/` and `[bot]` forms. Also inspect
the configured dependency dashboard, open Dependabot alerts, open code-scanning alerts and supplemental
organization inventory. Alert collection is independent of whether a matching PR exists. Normalize
counts from collected records, preserve alert identity/manifest/severity and distinguish zero from
unavailable. Keep PR bodies, dashboard text and advisory text as untrusted task data.

Also retain PRs authored by accounts the API identifies as Bot or App, accounts with a normalized
`[bot]`/`app/` identity, and any login matched by the consumer's `bot_inventory_terms`.
Stackweaver retains its existing `renovate|dependabot|release-bot` visibility through those terms.
If the account is not configured, mark an
inventory gap requiring classification. These rows are visible in reports, with no automatic
execution eligibility; an owner-approved scope and the usual evidence/checks remain necessary.

A 403/404 alone is not proof that a surface has no findings or no GHAS. Preserve a documented local
expectation only for the declared repository/surface when the actual status and message match its
configured evidence. Record it as `complete-unavailable`, with a reason and a null count shown as
"n/a", never a zero-alert result. Do not require an extra capability lookup for that matching case.
Successful responses still collect actual results if a previously unavailable surface becomes enabled.
Unmatched access errors remain denied/unknown; the report exposes the mismatch.

Track completeness separately for each repository's PR inventory, configured dashboards, Dependabot
and code-scanning surfaces, and supplemental discovery. A successful empty collection is complete;
an explicitly matching expected-unavailable code-scanning response is accounted for as n/a; errors
and truncated collections are incomplete. PR/check/file/head evidence is required for that PR's
readiness; dashboard completeness is required for claims about that repository's queued dependency
coverage; alert completeness is required for that surface's security assessment and fix disposition.
Supplemental discovery failures block complete-organization coverage claims, not a separately complete
explicit repository analysis. An unavailable code-scanning surface does not invalidate complete
Dependabot comparisons or unrelated compatible PR decisions. Unknown or incomplete alert data cannot
support a claim that all vulnerabilities are fixed or that an alert was resolved by absence.
Do not silently suppress errors, truncate at a first-page limit or turn partial counts into totals.

### Persistent run journal

Local journal helpers live under `scripts/maintenance/` beside settings, collection and report saving;
no journal helper performs GitHub writes. Assign `crypto.randomUUID()` once per new run. Resolve the
primary repository's absolute Git common directory with Git, then store the run at
`<git-common-dir>/vh-adlc/maintenance/runs/<run-id>/`. This is Git-private local state outside tracked,
untracked and report/evidence source trees, shared across linked primary worktrees. It never enters
a report commit or makes a worktree dirty. Selected satellite/independent repairs retain the primary
run location, not a second journal in their source repository. Refuse non-UUID run IDs, unexpected
symlinks/containment escape or an identity mismatch. The run directory is private to the host user,
mode 0700, with data files mode 0600. Do not store tokens, credential URLs, host secrets or browser data.

Use a schema-version-1 immutable `run.json` header and ordered immutable
`events/0000000001.json` revision snapshots. The header records run ID/time, primary repository/host,
Git common-directory identity, original requested scope and source binding. Every event names its
revision and prior event digest and holds the current state: adopted instruction commit/paths/blob IDs;
current request/approved scope and selected PR/head/payload bindings; report location kind and
path/run ID/body and file digests; collection/source references and completeness; task source and
evidence repository/worktree/ref/commit pairs; owned batch paths/refs; operation intents, step IDs,
checks, commit identities, remote observation/containment receipts, failures and pending handoffs.
Retain prior events and artifact digests for the full run, including after source-worktree cleanup.
A journal is a local procedural record, never an enforced attestation or approval source by itself.

Publish each complete header/event atomically: write and fsync a private temporary sibling, then
exclusively link it to its final name and fsync the directory before acknowledging persistence.
Never replace an existing revision. An event requires the expected prior revision/digest; competing
writers for the same next revision produce exactly one success and one conflict, not a lost update.
Temporary files or interrupted unpublished candidates are ignored; missing, corrupt, forked or
noncontiguous committed events block dependent writes. Reconstruct current state from the validated
header/event chain rather than relying on session memory or a last-writer-wins pointer.

Persist an operation intent before a local commit or remote mutation and its observed receipt after
it. A report commit keeps its ordinary report-only subject and `[skip ci]`, with `Maintenance-Run`
and unique `Maintenance-Step` trailers so a fresh session can locate an interrupted own commit and
check its exact paths/content before using it. A missing receipt means reconcile actual Git/remote
state; it never means rerun the action automatically. A fresh process with only repository identity
and run ID locates the journal through Git common-dir, resolves the authoritative report/record and
rechecks state. Host transfer requires deliberate transfer of this Git-private state or an explicit
pending recovery handoff; report bytes alone cannot recreate forgotten approvals or receipts.
AC-04/AC-06 restart with an empty model session/process and only this persisted journal plus Git/fake
remote state, including interruption after commit, torn temporary events and concurrent revision
publication. This persistence does not upgrade procedural remote effects to exactly-once execution.

### Analysis, dispositions and durable reports

Read primary upstream release notes/migration guidance for each actual old/new delta, resolve annotated
tag objects to commits for claimed action pins, and record source links plus call-site searches.
Classify patch/minor/digest/same-tag repins separately from major/pre-1.0 breaking changes. Absence of
usage requires a recorded search scope; green CI alone never establishes compatibility. If upstream
evidence is unavailable, say what is missing and leave the affected readiness decision unresolved.

For synced consumers, classify every changed path from the actual referenced sync workflow, including
exclusions. Mixed ownership must be split or left for a decision; never close an entire mixed PR on
one synced file. Compare sync-PR target versions with the destination's current canonical version
before proposing a superseded closure. Unknown ownership or version evidence remains unresolved.
Reconcile alert fixes with the true source owner; posture findings remain repository configuration
findings, not dependency fixes. Deduplicate only with proven equivalent/superset changes and retain
every discovered PR in the disposition table.

Assign a run ID when the sweep starts and persist it with the report and selected task links. Resuming
that run reuses its report; a new independent sweep gets a new ID and, if needed, a same-day suffix.
Use `YYYY-MM-DD-dependency-sweep.md` for the first reserved report and
`YYYY-MM-DD-dependency-sweep-<run-id>.md` for a later run on that date. Before writing a report,
check the committed default-branch report directory, this primary repository's persisted run headers/
reservations and existing maintenance report-role refs for that date. Reserve the unsuffixed name
by atomic exclusive publication of a schema-version-1 claim under
`<git-common-dir>/vh-adlc/maintenance/report-names/<report-dir-hash>/<YYYY-MM-DD>/first.json`, holding
run ID, report-relative path and source binding, using the journal's private/atomic rules. Only its
winning run may use the unsuffixed name; another run uses its UUID suffix even if the first is
unpublished. A prior committed/ref report also forces a suffix. Keep the claim through the run;
never reclaim it merely because publication is pending. Reserve/record each suffixed path too and
create report files exclusively. Two concurrent isolated candidates on one host therefore use
different names.

Other hosts may have no shared unpublished reservation. If default-branch refresh reveals that
another run has since published the chosen path, retain that published report byte-for-byte and
relocate only this run's still-unpublished candidate to its reserved UUID-suffixed path. Preserve
report bytes, run ID and scope, record old/new paths and candidate bindings in the journal, regenerate
the allowed committed-base-plus-report index output in a fresh candidate, and retain the old ref as a frozen receipt. This is a
path-collision recovery, not rescoping or rewriting an older report. Never relocate a report already
published for this run or overwrite a different run. Ambiguous ownership stops with a concrete
pending handoff. Both local same-day reservation and cross-host late-path collision have AC-04
fixtures; the first published report stays unchanged and the second publishes at its own path. Earlier runs remain byte-identical. In the current run only the frontmatter
`status` and `status_description` scalars may change to reflect the live state, preserving all other
metadata, run identity and scope. Body approval/check/outcome updates append dated sections without
changing its existing body prefix or deleting history. Compare the read version before an atomic
header-and-append update; concurrent or unrelated edits block the update. Stackweaver retains its
living-report status fields under this explicit mutable-header exception. A material
rescope starts a new linked run rather than rewriting the original scope. Record source revisions and scope, collection
coverage/errors, each PR/version delta, release-note evidence, code impact, risk, ownership, proposed
action, unmet checks and major/hygiene backlog. Include a Security alerts section with per-repository
counts/breakdowns, dispositions and comparison with the previous complete comparable observation for
each repository and surface. Compare resolved identities only when both observations are successful
complete lists with the same scope. A missing, differently scoped, unknown or n/a observation never
proves resolution; show availability changes separately. Follow the consumer's metadata
and generated-index conventions; leave reports uncommitted unless requested or the local policy
already explicitly requires their scoped commit. Stackweaver retains its report-commit policy.

Each new report includes a fenced `maintenance-observation-v1` JSON block within its Security alerts
section. This is part of the report artifact and its existing publication scope, not a second file.
The schema-version-1 block names run ID/time and an observations array. Each entry carries normalized
hostname, repository, surface (`dependabot` or `code_scanning`), exact scope (open-state plus sorted
filters/exclusions), observed timestamp and source reference, status (`complete`, `complete-unavailable`
or `incomplete`), reason, count and alerts. Only `complete` has a nonnegative count equal to its full
alert array, whose entries preserve stable alert number/identity, package, manifest and severity.
Unavailable uses null count/alerts and its documented reason. Incomplete uses null count and marks
any partial entries unfit for absence/resolution comparison. Reject malformed, contradictory or
duplicate repository/surface/scope entries rather than infer completeness from rendered prose.

`history_dir` is a read location for prior report Markdown containing this block; saving writes only
the new report in report_dir and creates no separate history artifact. Prefer reports from the
committed default branch, recording commit/path provenance. A contained local prior report may
supply an explicitly local-only baseline with its file digest; never claim it was published. In both
cases select the newest prior successful complete observation with exactly matching host/repository/
surface/scope for identity comparison, while availability/error changes remain visible separately.
A fresh checkout can read published history and compare without any prior run journal or host state.
Legacy Stackweaver reports without completeness markers still receive a clearly labelled
`unverified legacy comparison` of recorded counts and any identifiable entries, retaining the old
visibility. Describe only changes in what those reports recorded; never label a missing legacy entry
a confirmed resolution or claim collection was complete. Show the current measured baseline beside
that historical diff. Verified newly appeared/resolved identities require comparable complete
versioned observations. The parity table preserves legacy-diff visibility with this evidence qualifier,
rather than dropping the first migrated comparison. Missing/malformed history
never means zero alerts. AC-04 compares a new run against a published prior report in a fresh checkout
with no journal, tests per-surface scope/unavailable/incomplete cases, and separately handles a
legacy-format report. No history file or widened publication path is implied by these comparisons.

Local task records retain the existing Definition/Evidence/Reviews/State contract. Selected batch
work records included PR/head identities, approvals, checks and later outcomes in the sweep report,
references bounded task records or feature specs, and preserves unrelated staging and working files.
A report published on the default branch must not contain a repository Markdown link to a record
that exists only on the local evidence ref. Use a plain non-link reference marked `unpublished`,
naming run ID, evidence ref, relative record path and full record_target commit, with source_target
where needed; omit host-absolute paths. A later sweep can understand the pending evidence state
without a broken link. Add a resolvable repository/commit link only after separately authorized
record publication and observed reachability. Apply the same distinction to unpublished feature
specs. AC-04/AC-05 assert published reports have no dead repository links to local-only records.
Revalidate target heads, base/ownership evidence, checks and approved scope before each remote write;
material changes invalidate the affected approval. Changed source/Definition invalidates a task review.
On resume, inspect the saved report, records and remote state; do not repeat completed merges, closures,
report commits or releases merely because the previous response was interrupted. Unknown outcomes
need reconciliation before retry. Do not claim exactly-once remote effects or crash-safe protection
restoration from a procedural agent or the unchanged local satellite helper.

### Stackweaver adoption and support claims

Prepare consumer changes on an isolated branch from the then-current main. Keep the compatibility
command `model: opus`, pass original arguments, add the maintenance route beside triage in AGENTS.md,
and retain project policy in Stackweaver. Missing installed operation is an install/version blocker,
never a reason to reconstruct the old shared procedure. Keep audit/docs/domain agents and product
runtime paths unchanged. Consumer tests live under `tests/agent-maintenance/`.

Before consumer adoption, record exact shared/consumer commits, independently review the paired diff,
publish the shared component under existing versioning, install it from the real marketplace in
isolated Codex CLI and Claude CLI profiles, verify full payload identity and native discovery, and
exercise settings/collection/report through the installed payload. A fake local marketplace is a
development test only. Consumer rollback restores the pre-cutover tracked entry points/settings;
reapplication restores the new route while preserving unrelated tracked, untracked and staged bytes.
Refresh the rollback base if main advances before adoption; do not transplant stale AGENTS.md.

Separate source completion from post-publication adoption so the feature cannot require its own
release before passing the gate that permits shipping it. Before publication, native candidate
installation/discovery and installed-helper checks use the exact committed local catalog, clearly
identified as development proof. The paired adapter's adoption preflight must fail when actual
published-marketplace evidence is missing, stale, from a different payload or only a local catalog.
Test that denial and the verifier's valid/invalid receipt handling before source completion.
The implementation review observes those executable checks; it does not need its own verdict or
the completion gate to have passed in advance.

After separately authorized shared publication, the real marketplace installs and installed-operation
checks above remain mandatory before the Stackweaver merge. Record their exact source/version/payload
and command results in the adoption handoff, re-run the preflight and stop adoption on any failure.
Candidate-install proof is never relabelled published proof. Source `complete` does not mean migration
is complete; keep the parent/adoption state pending until actual publication checks and consumer
adoption finish. This is delivery sequencing, not a deferral or waiver of marketplace testing.

Require bounded actual Codex CLI and Copilot Opus 5.5 read-only report trials on synthetic repositories,
plus one fixed Stackweaver source/configuration read-only trial with synthetic tracker data. This
tests actual model procedure use without a live dependency merge or full private-source transfer.
Keep the private packet and output local, exclude credentials/host configuration/historical private
reports, and compare source/index bytes before/after. Record model identities and exact revisions;
missing access or a failed trial remains blocking. Claude CLI discovery/installed-helper behavior
is required. The owner explicitly deferred an actual Claude model trial while tokens are exhausted;
keep its command/model/argument routing contracts and declare live invocation unverified. Copilot
report-stage evidence does not turn that deferral into a pass.
GUI invocation checks remain deferred as in the owner's prior decision; add a maintenance-specific
support note rather than treating the triage issue as maintenance execution evidence.

The Copilot report trial receives a verified copy of the exact shared payload through its test-only
`--plugin-dir` loading and read-only input packet; compare its payload digest with the recorded
shared commit. Use only native view/grep/glob tools for that report trial, with shell, write,
network and GitHub tools disabled. The trusted test runner saves the returned assessment externally.
This measures bounded report-stage behavior; it does not claim Copilot lifecycle, delivery or managed
execution support. The Codex write-capable fake-transport trials in AC-05/AC-06 separately test
selected-action and continuation behavior. The explicitly deferred Claude model trial is not a
pre-adoption blocker; all required Codex/Copilot trials remain blocking until observed successful.
Update fixed operation-count assertions, including `tests/vh-adlc/triage/discovery.test.ts`, without
weakening their existing triage checks. Add the portable maintenance helper tests to the current
macOS selection in `.github/workflows/ci.yml`; Linux continues running the complete plugin suite.

### Bounded report-trial inputs and pass conditions

Make the report stage an explicit operation mode when a trusted operator supplies a complete,
versioned collected-data packet. The operation reads that dataset and its collection receipts;
it does not pretend to collect fresh data when helper tools are unavailable. Without the packet
or collection capability, it reports a collection blocker. A supplied synthetic snapshot grants
no readiness or execution authority over actual repositories.

Each packet contains: the exact shared skill/procedure payload and digest; manifest with source
commit, requested scope, run ID and synthetic-input flag; resolved settings; inventory JSON produced
by the actual collection helper against the recording fake GET transport; helper argv/exit/completeness
receipts; scoped source/manifests/sync mappings; fixture release-note/tag-reference data; and prior
per-surface observations for history comparison. Hash every input and check it before/after the trial.
No credentials, normal host configuration or actual private tracker/report history are included.

| Trial | Harness, inputs and required work | Pass condition |
| --- | --- | --- |
| Generic report | Codex CLI with its inherited configured model, recorded honestly from native events; the synthetic packet and exact installed candidate payload. Invoke the shared report stage, inspect source/notes, return a structured assessment for every fixture item. | Every expected case below is classified with evidence, no live-readiness or completed-action claim appears, and actual model commands/results preserve input/source/index state. |
| Generic read-tools report | Copilot CLI, requested and observed `claude-opus-5.5`, exact verified `--plugin-dir` payload and the same synthetic collected packet. Native view/grep/glob only; the trusted test runner renders the returned assessment through the real report helper. | Every expected case below is classified, collection is correctly attributed to supplied fixture receipts, all required input reads are observed, native tool inventory contains only the declared read tools, every observed call has a result and stays inside the packet, process exit is successful and all hashes/source/index remain unchanged. An extra tool, failed/partial output, missing item, fabricated collection or unsupported live verdict fails. |
| Stackweaver policy report | Copilot CLI with the same exact requested model/payload and read-tools route; bounded actual Stackweaver maintenance entry/settings/local policy/sync files, plus synthetic collector output, source samples and release-note data. No full private source tree. | Correctly route a frontend synced bump to the monorepo and an API-owned Dockerfile bump to the satellite; preserve the builder-before-monorepo order, single-squash/no-skip policy, approved-only local helper and no distribution edits in the proposed plan. Actual production call-site compatibility stays unverified when only a source sample is supplied. Retain all fixture PRs, alert coverage and inventory gaps, and pass the same input-read, native-call, model-identity, report and preservation checks. |

The shared synthetic corpus reuses the AC-03 scenarios. Fixed expected outcomes include:

| Case | Expected report-stage outcome |
| --- | --- |
| Compatible patch with verified fixture notes | Routine-batch candidate, with source/notes evidence and local checks still pending; never a claim that it was merged. |
| Major and breaking pre-1.0 bump | Separate migration work, excluded from the routine batch. |
| Used removed API | Required code repair and its observed call-site reference; not ready while that repair is absent. |
| Action SHA/tag mismatch | Explicit pin mismatch; no safe-bump recommendation. |
| Mixed synced/excluded files | Split or owner decision; no whole-PR synced closure. |
| Superseded sync version | Proposed superseded closure after citing the higher destination version, with no actual closure. |
| Overlap without a true superset | Keep both visible, no unsupported superseded disposition. |
| Security alert without a PR | Include the alert and actual source owner, with unresolved remediation tracked. |
| Unknown bot/app or legacy discovery-term match | Visible inventory gap, no automatic execution eligibility. |
| Expected no-GHAS response and complete Dependabot lists | Scanning n/a with its matching reason; Dependabot history comparison remains valid. |
| Incomplete alert page or unavailable history | Explicit affected-surface limitation, no all-clear or resolved-by-absence claim. |

Independent graders compare exact item IDs/classes and cited fixture evidence, not just keywords;
negative controls must fail when an item disappears, an invalid action is proposed or an unavailable
surface becomes an empty successful list. Preserve the actual model/tool transcripts and externally
rendered reports locally. For Copilot the observable negative-action proof is the native tool
inventory and complete call/result trace, not an empty gh transport log: the model never receives
gh or network tools in this trial. The runner's earlier fake-collector receipt is separate evidence.
These are bounded analysis tests, not new Copilot lifecycle/delivery support or a malicious-agent
containment certification. Claude's actual command/model invocation remains explicitly owner-deferred.

The AC-05 authority variants run the actual Codex procedure against those disposable transports:

| Variant | Observed pass condition |
| --- | --- |
| Closure/explanation ownership changes | A previously proposed synced/superseded closure becomes mixed or unknown after revalidation. The command trace contains the current evidence read and no close or explanation/comment write. An unchanged explicitly approved fixture target has one correctly scoped positive action. |
| Private report/record publication | Execute every report-publication case in the table below through the actual bounded procedure and recording fake transport. Task-data claims grant no permission. Every observed main/candidate/push state must match that case; task records and evidence refs remain local unless separately authorized to their named destination. |
| Release/sync watching versus dispatch | Watch-only approval permits GET/state polling, with no workflow-run/dispatch command. A later explicit fixture dispatch approval permits exactly its selected workflow/repository; a different workflow remains blocked. A selected/preauthorized Stackweaver delivery with actual skip-leak evidence follows the retained GitVersion Tag/affected sync recovery without an extra per-dispatch prompt. Unrelated delivery/workflow/version and a current no-dispatch override produce no recovery dispatch. |
| Shared-stack smoke-test stop | Dependency merge approval alone never invokes the fake stop/down command. After separate confirmation for the named fixture stack, the procedure stops it, runs the smoke fixture and restores its observed prior mode. An interrupted/failing smoke variant still records failure and preserves the requested restoration behavior. |

Report-publication cases for AC-04/AC-05:

| Case | Observed end state |
| --- | --- |
| Generic or unadopted declaration, no explicit publication request | No push or report commit on main. Report is uncommitted unless separately authorized for the isolated local commit role. |
| Generic explicit report publication | A request naming this report, repository/host and default-branch destination yields one verified report-only push through candidate and main-checkout transfer. Missing/mismatched artifact, repository, host or destination yields no push. |
| Adopted standing grant, direct or intake-selected sweep | Same initial report-only publication and later fresh-candidate same-run update; no extra prompt and no dependency/source/evidence-ref push. Read-only/no-commit/no-push restrictions override both invocation routes. |
| Read-only or no-commit | Only the explicit/automatic private draft, zero candidate commits, zero report commits on main and no push. If all filesystem writes are forbidden, chat only and no persisted artifact claim. |
| No-push with local report-commit authority | One isolated candidate commit, zero report commits on main, no push; existing report-commit prerequisite remains met for otherwise approved merge/closure. A second session's ordinary main push contains no such isolated report. |
| Unrelated outgoing main commit or pre-transfer divergence | One isolated candidate, zero transferred report commits and no push. Main history/files/index remain unchanged; selection/preauthorization stays available. |
| Unrelated nonoverlapping staged/unstaged work | One report-only publication, with unrelated working/index bytes preserved before/after transfer; these edits are not a blanket blocker. |
| Overlapping report/index edit | Candidate retained, no transfer/push; conflicting working/index bytes remain unchanged. |
| Known protection refusal before transfer | Candidate retained, zero report commits on main and no push attempt; record the concrete known source/refusal. |
| First protection/network refusal at push after transfer | One report commit remains on main; no successful remote publication claim, no added report commit and explicit pending/exposure warning. Unrelated state remains unchanged. |
| Main advances before transfer | Build one fresh candidate at the new base; retain old ref unchanged; regenerate permitted committed-base-plus-report indexes; exactly one publication. A second advancement or report conflict is pending without transfer/rewrite. |
| Main advances after transfer | One pending main report commit and explicit local/remote-tip handoff; no rebase/reset/rewrite or retry loop. New outcomes persist only in the private journal. |
| Push accepted but response interrupted | Reconcile remote containment in a fresh process. Record the existing commit as published with no duplicate commit/push. An unobservable outcome remains pending until a successful state read. |
| Current restriction after an earlier transfer | Expose the existing pending main commit and concrete reconciliation handoff; do not claim it was made private or alter history without authority. |

## Acceptance Criteria

- [x] AC-01: A project can discover and invoke shared dependency/security maintenance through the installed vh-adlc plugin without a harness-specific procedure or a Stackweaver checkout dependency.
      Evidence: On 2026-10-29, Native Codex 0.163.0 and Claude Code 2.1.309 installed immutable candidate `5f52f789ab341fd81bf18904631af8cc8b667f17`, discovered all eleven operations and exercised settings/GET/report helpers at payload `23fcedd9c556c64c71c9fc4afb9873f5408d7f493c80fef14441c9ca23a00652`. No-config, direct/intake and controller-free import contracts pass in the full Linux suite. This is local-catalog development proof, not published installation.
- [x] AC-02: A sweep respects explicit repository scope, includes configured dependency/sync bot PRs, unknown-bot inventory gaps, dashboard work and security alerts, and distinguishes documented unavailable surfaces from incomplete collection without declaring affected work ready.
      Evidence: On 2026-10-29, The fake-CLI collection/settings corpus and full Linux suite passed pagination, normalized bot identity, renamed-bot/org gaps, dashboard/alert-only, capability/error, scope and exact GET/no-mutation cases. Final native generic reports preserved unavailable/null and incomplete observations. The declared unavailable rule matches its actual status/message; no claim of zero findings is inferred.
- [x] AC-03: Maintenance decisions use actual version/changelog, code-usage and source-ownership evidence, keep major migrations separate and leave ambiguous or mixed changes unresolved.
      Evidence: On 2026-10-29, Actual final Codex and Copilot reports classified the synthetic version/API/usage/pin/ownership/overlap/security cases against frozen source/notes and collection data. The bounded Stackweaver-policy trial additionally checked actual sync ownership/exclusions and retained batching. All three assessments and real installed-helper renders passed; samples do not establish production compatibility.
- [x] AC-04: Each sweep permitted to write local artifacts preserves a durable, uniquely named report covering every discovered PR, security reconciliation and unresolved work without overwriting history or claiming completion from missing data; a sweep forbidden from all filesystem writes returns chat-only findings without claiming a saved report.
      Evidence: On 2026-10-29, T4/T5 report, history and publication regressions plus T12 native authority/concurrency/promotion cases passed. Fresh-context reconciliation retained unique reports and immutable pending outcomes without duplicate commits/pushes. The actual second-writer push excluded the isolated no-push candidate. Main-transfer failures expose the existing pending commit; current restrictions win. No-filesystem requests produce chat only. Full Linux verification passed with the CI test budget.
- [x] AC-05: Newly authored compatible repairs use bounded-maintenance checks and independent review, selected bot-batch delivery preserves the declared consumer procedure, wider changes use the feature loop, and remote or live actions stay within owner and consumer permissions after revalidation.
      Evidence: On 2026-10-29, T12 actual primary/independent/satellite authored repairs received clean native Copilot claude-opus-5.5 paired reviews before SAME-thread source push/one-PR delivery. Real-Go bot-only normalization/two batches, authored stale-input denials, builder-before-pointer, stalled-sync dispositions, scope/helper/dispatch/stack checks and non-forced cleanup passed. These are synthetic local transports; no live dependency action was performed or certified.
- [x] AC-06: Resuming a task preserves unrelated work and prior evidence, invalidates stale reviews/approvals and reconciles interrupted actions before retrying them.
      Evidence: On 2026-10-29, Actual new-context commit, accepted-push, closure and smoke interruption recoveries passed; the unobservable remote remained pending and later reconciled without another effect. Journal torn-state/CAS regressions, source/Definition/generated-input review invalidation and staged/index preservation passed. Prior failed attempts and raw reviews remain retained; no history rewrite or evidence cleanup hid them.
- [x] AC-07: Stackweaver routes maintenance to the installed shared operation while retaining its command/model/arguments, repository facts, batching and release checks, approved satellite-helper behavior and scoped skip-leak recovery locally; an authorized sweep publishes its initial and later same-run report artifacts through the retained main-checkout route, while other consumers publish reports only under an explicit request or adopted declaration.
      Evidence: R-20 returned met at `f6974f259de383bbbc803261a0fa33b3e949876d` with consumer `2095f06e4ccfe74740ceb9cfc806bcb7c7667b3a`. Its independent fixed launcher passed all eleven checks, including 598 plugin tests/2625 assertions, all Go/module/lint/CI checks and nine consumer tests/123 assertions; both repositories were preserved. Final native local-catalog payload equality and retained report/recovery trials were inspected with their recorded limitations. Three minor notes are tracked in T15; fresh review remains required after those changes. Real marketplace cutover, live-Claude invocation and GUI checks remain unclaimed.
- [x] AC-08: The exact committed candidate passes native Codex and Claude CLI installation/discovery and installed-helper checks, the consumer can roll back and reapply without unrelated changes, and its adoption preflight blocks cutover until matching real marketplace verification is available.
      Evidence: R-20 returned met at `f6974f259de383bbbc803261a0fa33b3e949876d` with consumer `2095f06e4ccfe74740ceb9cfc806bcb7c7667b3a`. Its independent fixed launcher passed all eleven checks, including 598 plugin tests/2625 assertions, all Go/module/lint/CI checks and nine consumer tests/123 assertions; both repositories were preserved. Final native local-catalog payload equality and retained report/recovery trials were inspected with their recorded limitations. Three minor notes are tracked in T15; fresh review remains required after those changes. Real marketplace cutover, live-Claude invocation and GUI checks remain unclaimed.
- [x] AC-09: Actual bounded Codex and Copilot report-stage trials follow the shared analysis procedure and retained consumer policy, and required regression and trial checks pass without implying untested delivery or GUI support or changing deferred workflows.
      Evidence: R-20 returned met at `f6974f259de383bbbc803261a0fa33b3e949876d` with consumer `2095f06e4ccfe74740ceb9cfc806bcb7c7667b3a`. Its independent fixed launcher passed all eleven checks, including 598 plugin tests/2625 assertions, all Go/module/lint/CI checks and nine consumer tests/123 assertions; both repositories were preserved. Final native local-catalog payload equality and retained report/recovery trials were inspected with their recorded limitations. Three minor notes are tracked in T15; fresh review remains required after those changes. Real marketplace cutover, live-Claude invocation and GUI checks remain unclaimed.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Add operation/discovery contracts and a no-config single-project fixture. Test the new Dependency or security sweep intake row beside unchanged Bounded maintenance, and Resume choosing a run report for a sweep versus a record/review target for a repair. Verify no canonical model or project identities, identical direct/intake report authority under the explicit standing exception, and no maintenance collector runtime import of the triage controller/executor graph. Candidate installation checks are also required by AC-08. |
| AC-02 | Execute fake-CLI collector tests with multiple pages, exact normalized configured identities (leading app/, trailing [bot], case variations and non-matching longer logins), renamed/unrecognized bot/app and legacy-filter matches, dashboard-only work, alerts without PRs and empty results. Test matching expected-unavailable status/message versus generic 403/404/429, newly enabled scanning, missing pages and unknown capability. Assert per-surface readiness effects, intact Dependabot comparison when scanning is n/a, visible organization gaps, explicit repo/PR narrowing, exact GET argv and no mutation or widened execution scope. |
| AC-03 | Use a synthetic monorepo/satellite/standalone corpus containing an action pin/tag mismatch, used removed API, no-use search, pre-1.0 break, synced/excluded/mixed paths, stale sync version and false superset. Grade expected dispositions and observed evidence, not keyword presence alone. |
| AC-04 | Generate two same-day reports and two concurrent isolated candidates where the first publishes before the second, plus a late cross-host path collision; assert reservations/relocation and unchanged first-report bytes. Include the no-config `.vh-adlc/reports/maintenance/` case, and check distinct paths plus unchanged older-run bytes. Resume the current run and append an outcome with its body prefix and run ID preserved; update only its status/status_description header scalars. Reject changed scope/identity, edited prior body, unrelated metadata and concurrent edits. Test the portable observation block and security identity/counts against published prior reports in a fresh checkout with no old journal, legacy unverified reports with a visible labelled historical count/entry diff and no confirmed-resolution claim, local-only provenance, mismatched scopes, per-surface availability and incomplete observations; test task-data escaping. Assert no separate history artifact is written or published. A filesystem-writes-forbidden request yields chat only and no saved-report claim. Test committed-but-unindexed-doc generator drift as allowed while untracked/uncommitted docs and dirty target indexes remain excluded. Before-transfer main advancement rebuilds one candidate from the new base with old ref unchanged, permitted regenerated index entries and one publication; a second advancement or report conflict is pending. Check Stackweaver live frontmatter/status/index behavior in a disposable fixture, including its main-checkout report-only commit/push to fake main and the authority, isolation, refusal and reconciliation cases above. Append a post-publication outcome in a fresh report-role candidate, with unchanged main working/index bytes before transfer and preserved unrelated bytes after fast-forward; commit/publish only that report update, resume by run ID and sync the invocation checkout without a conflicting untracked copy. Verify an interrupted successful push is reconciled without a duplicate commit. Absent current explicit report-publication authority, generic and unadopted declaration fixtures never push, including declarations present only in a feature worktree, uncommitted main edits or an unmerged branch. Test read-only/no-commit/no-push overrides, both pending-report forms, allowed selection and the retained merge/closure prerequisite, and their same-run import/recovery. Restart from only the persisted Git-private journal and repository state; inject torn/unpublished events and two competing same-revision writers. Seed unrelated untracked docs and assert no generated index entry is published for them. Assert dirty generated-index paths are unchanged and never captured. Verify no-commit/read-only forms with no supplied output use the automatic Git-private draft. Verify no-push and blocked-main local candidates are committed on the owned report ref without touching main. Test a generic no-declaration project requesting a report commit from an unrelated dirty invocation branch: one verified report-only commit on its owned ref, no invocation branch/index change and no push. Promote a previously saved run-owned untracked checkout report into that candidate, verify archival/removal of only its unchanged original and a successful eventual main fast-forward; edited/staged originals stay unchanged and promotion stops. Test a no-declaration generic explicit-publication positive and missing/mismatched artifact/destination negatives as specified above. Verify the later report-only update uses the owner-approved same-run permission and cannot publish source, task records or an unrelated run. Execute deferred-outcome cases: no-push/blocked-before-transfer has zero report commits on main and one owned candidate; after-transfer failure has one pending main report commit. Assert no extra report commits and unchanged source/index until reconciliation. Validate unpublished evidence references as non-links and resolvable links only after separately approved fixture record publication. |
| AC-05 | Re-run existing maintenance variant/resume regressions and wider-change routing checks. Execute bounded Codex scenarios against recording fake gh/local service commands: no unapproved writes; scoped aggregation/independent/helper actions without extra helper prompts; authored builder prerequisites in a satellite fixture before the monorepo bump; stalled-sync root-cause repair before queued dispositions; stale-head denial. Separate unchanged bot patches plus package-manager lock/manifest normalization, including generated go.mod tidy changes, from deliberate/handwritten dependency/source/CI changes. Test a valid non-Stackweaver standing declaration on a differently named default branch, plus missing/invalid-route negatives. Test pure aggregation without repair review and positive authored cases with the explicit Codex pending-handoff, test-operator Copilot Opus 5.5 review and same-thread resume sequence, both recorded bindings and strictly review-before-push/PR order; missing-review cases pass only as the negative no-publication variant. Test post-aggregation Task base excluding earlier bot commits, and later mechanical regeneration of a verification input making an authored repair review stale until re-reviewed. Exercise satellite/independent authored changes and stale source/Definition negatives. Commit records only on the dedicated local evidence ref; seed an unrelated invocation branch/staged work and prove bytes/index/ref unchanged. Run two same-month batches with unique recorded refs/paths after the first squash ref is retained. Observe clean normal cleanup, no evidence loss and no report/record in the squash. Assert authority text explicitly allows only the selected batch, evidence and related-source worktree/clone roles with their non-forced cleanup limits; report publication preserves the existing main-checkout route; the fifth local report-preparation role creates no shared-main commit under no-push and requires separate report-commit authority. Run all four authority variants with positive/negative traces. No fixture targets actual GitHub or a live stack. |
| AC-06 | Run bounded Codex continuation scenarios with the canonical procedure, disposable Git repositories and that recording fake transport. Restart the continuation in a fresh session/process with no prior conversation, providing only primary repository identity, run ID, persisted journal and Git/remote state; assert it reconstructs the exact report/source/evidence refs and prior actions. Inject an ambiguous response after a simulated merge/closure has occurred and interrupt after a real local report commit. Resume the same scenario and require successful state reads before any retry, no duplicate completed operation or commit, and an unresolved result when state is uncertain. Change source/Definition/PR head in separate variants to require renewed checks/review/approval. Compare unrelated staged/untracked bytes and index. These are actual model procedure trials, not claims inferred from fake-server rejection. |
| AC-07 | Paired adapter contracts and independent review check every row in the normative consumer parity table against shared procedure plus retained settings/policy. Assert unchanged opus model/arguments, all configured repositories/exclusions, exact normalized bot_authors containing renovate, dependabot and stackweaver-release-bot, retained bot_inventory_terms for renovate/dependabot/release-bot, local helper bytes and untouched other agents. Assert the pending-report warning lives in maintenance only, preserves the existing no-mixed-skip-ci/code rule and makes no CLAUDE.md CI-policy change. Check both legacy command contradictions are reconciled: satellite handoff at lines 28-29 and protection at lines 31-33. Assert the exact generic Standing maintenance report publication section/table, every required field, committed instruction-source binding, repository/branch/path limits without wildcard, AGENTS-to-settings-to-project-procedure chain and the retained Stackweaver maintenance-entry link. Every unmapped or intentionally changed behavior needs an owner decision before adoption. |
| AC-08 | Install the exact committed candidate from an isolated local catalog in native Codex and Claude profiles; verify payload hashes/modes, skill discovery and installed settings/GET collection/report behavior. Label this development proof. Execute paired rollback/reapply with unrelated source/index equality. Execute the adoption preflight with absent, local-only, stale, wrong-source/version/payload and incomplete published evidence and require denial; exercise valid receipt parsing without calling a fixture an actual publication. The mandatory delivery procedure then installs/verifies the real published source before any consumer merge; its actual results are recorded separately, not prerequisites for the source-shipping gate. |
| AC-09 | Execute all three specified report trials with the exact packets, models, stage attribution and per-case pass conditions above. Re-run independent graders with omitted/misclassified/unsupported-action negative outputs and require failure. Inspect actual Copilot native inventory/calls/results and required reads, Codex native commands/results, input/source/index equality and rendered reports. Check Claude static command/model/argument routing and native candidate installation/helpers; its live model trial is owner-deferred, never a pass. Execute bun test tests/vh-adlc and applicable repository regression checks at the reviewed source. Keep GUI and Claude live invocation visibly unverified. Feature review/freshness/completion remain framework requirements outside this criterion's end state. |

## Tasks

Each implementation task starts by writing and observing its behavioral regression fail, then making
it pass before the task commit. Native acceptance tasks first exercise their negative controls and
then observe the real client; no fabricated model or command receipt counts. Keep private consumer
source and raw trial output outside this public repository; record exact paired commits and bounded
results here. The R-16 no-default-checkout fixture is part of T5/T12.

- [x] T1 `tests/vh-adlc/maintenance/settings.test.ts`, `fixtures.ts`, `plugins/vh-adlc/scripts/maintenance/settings.ts`, `types.ts`, the reused `scripts/triage/settings.ts` origin export and both plugin manifests - implement strict v1 settings, inferred identity, normalized bot matching and contained references after observing missing/invalid-input cases fail; `bun test tests/vh-adlc/maintenance/settings.test.ts` passes with default, scoped, malformed and symlink fixtures (AC-02).
      Evidence: On 2026-10-29, `bun test tests/vh-adlc/maintenance/settings.test.ts` first failed with the expected missing maintenance-settings module (`/tmp/shared-maintenance-t1-red.log`). After implementation, settings plus existing triage settings passed 56 tests/121 assertions; the full host plugin suite passed 461 tests/1872 assertions (`/tmp/shared-maintenance-t1-suite.log`). No criterion is marked met yet because collection and live acceptance remain pending. Candidate metadata is 0.5.0; it is not published.
- [x] T2 `tests/vh-adlc/maintenance/collection.test.ts`, `plugins/vh-adlc/scripts/github-read.ts`, `scripts/maintenance/collect.ts` and `scripts/triage/github.ts` - extract pure GET transport and collect every declared inventory surface without the triage controller graph; fake CLI pagination/error/identity/unknown-bot cases and existing triage collection regressions pass after observed failures (AC-01, AC-02).
      Evidence: On 2026-10-29, collection tests first failed for the missing module (`/tmp/shared-maintenance-t2-red.log`). Additional observed red cases exposed PR identity/scope, duplicate checks, foreign organization rows, the 1000-suite cap, stale status SHA and reused-reader trace leakage; each was corrected. The focused collector passed 22 tests/81 assertions, and the full host plugin suite passed 483 tests/1953 assertions (`/tmp/shared-maintenance-t2-suite.log`). Existing triage API/argv behavior and the controller-free runtime import graph passed. Read-only public API probes confirmed suite and combined-status shapes at published commit `36090d48`; no live dependency actions ran.
- [x] T3 `tests/vh-adlc/maintenance/journal.test.ts` and `plugins/vh-adlc/scripts/maintenance/journal.ts` - persist private immutable run headers/events with atomic competing-writer rejection; fresh-process resume, interrupted intent/receipt, corrupt chain, symlink and cleanup-preservation cases pass after observed failures (AC-04, AC-06).
      Evidence: On 2026-10-29, journal tests first failed for the missing module (`/tmp/shared-maintenance-t3-red.log`). The implemented journal passed 8 focused tests/37 assertions, including competing real processes, linked worktrees and fresh-process recovery. The full host plugin suite passed 491 tests/1990 assertions (`/tmp/shared-maintenance-t3-suite.log`). This establishes local persistence behavior; interrupted commits and remote-action reconciliation still require the later procedure trials.
- [x] T4 `tests/vh-adlc/maintenance/report.test.ts`, `scripts/maintenance/report.ts` and `history.ts` - save/resume reports, reserve same-day names, recover late path collisions and compare portable per-surface observations including unverified legacy history; report/metadata/concurrency/escaping/history cases pass after observed failures (AC-04, AC-06).
      Evidence: On 2026-10-29, report tests first failed for the missing modules (`/tmp/shared-maintenance-t4-red.log`). Observed regressions then exposed report-ref lookup, duplicate observation injection, ambiguous legacy attribution and root-directory path normalization; the corrected focused suite passed 21 tests/90 assertions. The final host plugin suite passed 512 tests/2080 assertions (`/tmp/shared-maintenance-t4-final-suite.log`). A fresh process reconciled an already written append without duplicating it; cross-host candidate publication and actual model continuation remain T5/T12 obligations.
- [x] T5 `tests/vh-adlc/maintenance/publication.test.ts`, `scripts/maintenance/authority.ts` and `report-candidate.ts` - resolve the adopted declaration from committed default-branch inputs and prepare isolated local report commits without a remote mutation helper; explicit/current restrictions, generic commit/promotion, dirty/nonoverlapping state, no default-branch checkout and candidate refresh cases pass after observed failures (AC-04, AC-05).
      Evidence: On 2026-10-29, publication tests first failed for the missing authority/candidate modules (`/tmp/shared-maintenance-t5-red.log`). Further observed failures covered moved candidate refs, unsafe output ancestors, interrupted pre-archive intents and a mismatched current request falling back to standing permission. The focused suite passed 22 tests/93 assertions, including an actual Git commit interrupted before its receipt and recovered in a fresh process. The full host plugin suite passed 534 tests/2173 assertions (`/tmp/shared-maintenance-t5-suite.log`). Candidate/index/promotion tests preserve shared-main history and unrelated bytes; no helper pushes remotely. Actual agent publication, later-update and fake-remote continuation trials remain required in T12.
- [x] T6 `tests/vh-adlc/maintenance/analysis.test.ts`, `fixtures/`, `trial-proof.ts`, `scripts/maintenance/cli.ts` and `analysis-input.ts` - build the synthetic analysis corpus and helper-produced packets, expose settings/GET/report/journal CLI stages and grade exact item/evidence outcomes; omitted/misclassified/unsupported-action negative controls fail and complete synthetic examples pass (AC-02, AC-03, AC-09).
      Evidence: On 2026-10-29, analysis tests first failed for the missing packet module (`/tmp/shared-maintenance-t6-red.log`). Additional red cases covered missing CLI outcome access, lost request bindings, interrupted outcome data/order, malformed grader evidence and contradictory/omitted packet inventory. After correction, 12 analysis tests passed; together with report tests, 33 tests/163 assertions passed. The full host plugin suite passed 546 tests/2246 assertions (`/tmp/shared-maintenance-t6-suite.log`). The synthetic packet uses an actual CLI/fake-GET run and a clearly labelled minimal test component; it is not native-install or model-trial evidence. Native exact-component packets, candidate installs and actual Codex/Copilot trials remain T10-T12 obligations.
- [x] T7 `plugins/vh-adlc/skills/vh-adlc-maintenance/SKILL.md`, `references/maintenance.md`, `maintenance-settings.md`, `maintenance-record.md`, `maintenance-review.md`, `lifecycle.md`, `authority.md`, both plugin manifests, `tests/vh-adlc/check.test.ts`, `direct-operation-compatibility.test.ts`, `triage/discovery.test.ts` and `maintenance/discovery.test.ts` - register the model-neutral operation and canonical sweep/repair/publication/resume procedure after missing-operation checks fail; package/discovery and direct/intake authority fixtures pass, preserving existing operations and retaining the candidate minor version introduced in T1 (AC-01, AC-05, AC-07).
      Evidence: On 2026-10-29, four discovery/contracts tests first failed for the missing operation and absent sweep/paired-record instructions (`/tmp/shared-maintenance-t7-red.log`). Focused discovery, unchanged direct-operation bodies and existing triage discovery passed 16 tests/177 assertions. The full host plugin suite passed 553 tests/2341 assertions (`/tmp/shared-maintenance-t7-suite.log`). This verifies package/instruction contracts; actual host loading, paired-review execution and direct/intake publication behavior still require T10-T12 native trials. Candidate metadata remains 0.5.0 and is not published.
- [x] T8 `tests/vh-adlc/maintenance/migration.test.ts`, `migration.ts` and synthetic `fixtures/migration/` - implement exact-revision adoption preflight and disposable rollback/reapply proof; absent/local-only/stale/wrong-source/payload receipts fail and matching receipt/rollback fixtures pass with unrelated bytes preserved (AC-07, AC-08).
      Evidence: On 2026-10-29, migration tests first failed for the missing preflight module (`/tmp/shared-maintenance-t8-red.log`). Additional red cases exposed unreadable-path disclosure and unrelated commands accepted as helper receipts. The corrected suite passed 8 tests/35 assertions; disposable rollback/reapplication preserved unrelated working files and raw index bytes. The full host plugin suite passed 561 tests/2376 assertions (`/tmp/shared-maintenance-t8-suite.log`). Valid receipt fixtures exercise parsing only, not actual publication; real marketplace proof remains absent and cutover stays blocked. After fetching, `vh-adlc fresh` reports accepted R-17 non-stale; implementation review remains pending.
- [x] T9 Stackweaver `.vh-adlc/maintenance.json`, `agents/maintenance.md`, `maintenance-project.md`, `.claude/commands/maintenance.md`, `AGENTS.md` and `tests/agent-maintenance/`, with paired evidence in this document - prepare the consumer adapter on its isolated migration branch from refreshed main; observe its initial parity/preflight failures, preserve every normative parity row and helper bytes, commit its local source and record both exact commits; all consumer contracts pass while real-publication adoption remains denied (AC-07, AC-08).
      Evidence: On 2026-10-29, the refreshed consumer base was `72186d3cbc5d250b29cda47839c282986b1cfd64`; all declared maintenance policy/helper/sync inputs remained unchanged from parity baseline `5383332c`. Missing adapter/index/installed modules failed first; a linked-worktree index-path regression was observed and fixed. `VH_ADLC_PLUGIN_DIR=<candidate> bun test tests/agent-maintenance tests/agent-triage` passed 13 tests/142 assertions, with no skips. Host `make verify SUITES=--staged` and normal commit hooks passed four checks, including gitleaks. The advisory docs-impact match was a historical triage snapshot with no maintenance-specific claim; it remains unchanged. Consumer commit `717cfa55f1f13250abe54ea88a2a5343e7194bc3` pairs with shared component `9f3e15821fad25b882f703cefd8dfee7dd91c4ae`. Its actual committed rehearsal at `/tmp/stack-maintenance-rehearsal-LJK2nr/result.json` restored/reapplied only the runtime paths and preserved source/unrelated/index bytes. Post-commit installed/preflight checks passed 3 tests/9 assertions; actual marketplace evidence remains absent and cutover is denied. No consumer push or live action occurred.
- [x] T10 `tests/vh-adlc/maintenance/install.test.ts`, `install-trial.ts`, `docs/get-started/installation.md`, `docs/reference/marketplace.md`, `compatibility.md`, `docs/user-guides/workflows.md` and `README.md` - verify native isolated Codex/Claude candidate installation, payload modes/hashes and installed helper behavior; catalog/receipt negatives fail, actual candidate installs and rollback pass, and guidance reports observed support plus the required later real-marketplace cutover checks (AC-01, AC-02, AC-04, AC-08).
      Evidence: On 2026-10-29, install tests first failed for missing install-trial.ts (`/tmp/shared-maintenance-t10-red.log`). Three focused tests/14 assertions now pass, including wrong payload/version/discovery, failed command, absent helper and changed source denials. The exact frozen candidate at `0230a6cdf9a770c0a1c70c7e1eb83024761584ed` installed through native local catalogs on Codex CLI 0.163.0 and Claude Code CLI 2.1.309 in empty isolated profiles. Codex skills/list and Claude plugin details discovered maintenance; both installed settings, fake-GET collection and private report helpers passed with source bytes/modes and raw Git index preserved. Native uninstall/reinstall restored the same full component digest `7a40b340645d06c89e3f42f68949283d28a54303572e116d98b251d196cfd107`. Actual receipts and grades are `/tmp/maintenance-native-candidate-20261029-d/result.json`; no models ran and no authentication was copied. Development local-catalog proof does not satisfy published-marketplace adoption. The existing committed consumer rollback proof remains T9. The final full host plugin suite passed 564 tests/2390 assertions (`/tmp/shared-maintenance-t10-final-suite.log`).
- [x] T11 `tests/vh-adlc/maintenance/report-trial.ts`, `trial-proof.test.ts` and evidence in this document - run actual Codex generic, Copilot Opus 5.5 generic and bounded Stackweaver-policy report trials on exact helper-produced synthetic packets; negative graders reject omitted evidence/items or unsupported actions and all real reports meet the normative case table with native model/tool and input-integrity receipts (AC-03, AC-09).
      Evidence: On 2026-10-29, native-proof tests first failed for missing report-trial.ts (`/tmp/shared-maintenance-t11-red.log`). Six focused proof tests/30 assertions and the final full host suite of 570 tests/2420 assertions passed (`/tmp/shared-maintenance-t11-final-suite.log`). Actual native Copilot Opus 5.5 passed all 18 generic cases at `/tmp/maintenance-report-copilot-20261029-e/result.json`; actual Codex with inherited `gpt-6.1-sol` passed all 18 at `/tmp/maintenance-report-codex-20261029-d/resumed-result.json`. Its original provider-capacity failure remains recorded; the successful continuation uses the same native thread, and that thread's actual turn-context records attest the same model across both turns. Copilot Opus 5.5 passed the 20-case bounded Stackweaver policy trial at `/tmp/maintenance-report-policy-copilot-20261029-c/regraded-result.json`, including frontend/API ownership, builder order, squash/no-skip, helper scope, distribution exclusion and unverified production compatibility. That replay corrects only a demonstrated citation-requirement bug: the model cited the actual declared security expectation rather than its equivalent local procedure explanation. The original failed grade, unchanged returned assessment and corrected expected-evidence artifact remain local; an observed red/green negative-control test rejects unrelated alternatives. Earlier failures also exposed a contradictory shell-read prompt, undeclared valid packet evidence, ambiguous response fields and overly narrow citation lines; the corrected protocol preserves exact item/class/count/ownership/action assertions and binds citations to the correct collected object or actual source lines. All three trials use the exact installed component from `b763e850fb94f9e01c5e023b47349ab42171520c` with full payload digest `7a40b340645d06c89e3f42f68949283d28a54303572e116d98b251d196cfd107`; native tool traces, required complete reads, frozen input hashes, source/index preservation and actual external report rendering passed. Only configured maintenance policy/entries/settings/sync inputs from consumer `717cfa55f1f13250abe54ea88a2a5343e7194bc3` entered the private policy packet; full production source, tracker/report history, host configuration and credentials were excluded. The real consumer remains clean at that commit. These are bounded report-stage results; delivery/recovery remains T12 and Claude/GUI deferrals are unchanged.
- [x] T12 `tests/vh-adlc/maintenance/lifecycle-trial.ts`, `publication-cases.ts`, `recovery-trial.ts`, their grader tests and evidence in this document - execute the bounded Codex authority/publication/recovery cases and positive authored-repair handoff through an actual independent Copilot review then Codex resume; negative/pending variants deny publication, fresh-session continuations reconcile completed effects and every specified final Git/transport state matches while preserving unrelated work (AC-04, AC-05, AC-06).
      Evidence: On 2026-10-29, observed red controls exposed missing transferred-main warnings, an overbroad repeated publication, incomplete commit hashes, missing owned-process startup cleanup and gaps in test execution/provenance; their focused regressions passed after fixes. The full plugin suite passed 594 tests/2609 assertions (`t12-complete-full-suite-20261029.log`), with the later observed-main-pointer grader control passing eight assertions after its red. Actual native cases passed report authority/isolation/concurrency/promotion and pending-delta reconciliation; deliberately interrupted commit/push/closure/smoke and unobservable-remote recovery; three stale-review inputs; two real-Go bot batches and non-forced cleanup; primary, independent and satellite authored repairs with actual clean Copilot claude-opus-5.5 paired reviews followed by SAME-thread selected delivery; exact helper authorization negatives/positive; separate evidence publication; and stalled-sync root checks before queued dispositions. Final satellite results are `authored-satellite-a-review-7/result.json`, `authored-satellite-a/continuation-result.json` and `stalled-sync-result.json`, all passed. The current plugin matches the frozen native payload exactly: `86ee21d98bae21bbde2fff06e79981204b108ae73a4dbc34364db0c7033f364a`, candidate 0.6.0. Raw failed reviews remain retained. Go tests/vet/module/lint and the other plugin's 34 tests passed. Consumer `d94e2fe4c4d21646480e1cf9adf3ed713878de78` is clean after its observed red/green rehearsal fix; nine adapter tests and all seventeen affected normal checks passed without skips or hook bypass. These are synthetic local transport results, not live dependency operations or marketplace/adoption proof.
- [x] T14 `.github/workflows/ci.yml`, `tests/vh-adlc/maintenance/`, paired consumer migration files and this document - address R-19 without a normative revision: retain the exact mandatory Linux command, bound expensive fixture setup in the tests, move consumer policy to the accepted `agents/maintenance-project.md` location and update routing/settings/rehearsal/report-proof references. Observe the existing CI/path controls fail, then pass them with all required checks and a refreshed bounded consumer-policy trial before a new actual Copilot Opus 5.5 review (AC-07, AC-08, AC-09).
      Evidence: On 2026-10-29, R-19's exact-command guard and the consumer path control failed before their fixes. Restoring the original Linux command made the Go guard pass; the bare full suite passed 598 tests/2625 assertions. Go test/vet/tidy/lint, the other plugin's 34 tests, actionlint and whitespace checks passed afterward. Consumer `2095f06e4ccfe74740ceb9cfc806bcb7c7667b3a` passed nine adapter tests/123 assertions and seventeen normal commit checks. The actual refreshed Copilot Opus 5.5 policy answer named the configured primary repository; its initially over-specific grader rejection is retained. Seven focused proof tests/36 assertions passed after the observed missing-grader red, including wrong-owner/prefix/order/skip-CI denials. Replaying the unchanged native answer passed all twenty cases and installed rendering with input/source/index preservation. No accepted normative section changed; fresh exact-target review remains required.
- [x] T13 `.github/workflows/ci.yml`, portable maintenance tests, native install/report trial helpers and evidence in this document - add portable cases and explicit compiler setup to the existing CI jobs, correct any observed final-payload digest/discovery regressions, refresh exact committed 0.6.0 native install/report proofs after upstream integration, run the full Linux plugin and applicable repository checks, preserve triggers/permissions/release rules, and record final paired targets plus explicit live-Claude/GUI deferrals; all required executed checks pass before independent implementation review (AC-08, AC-09).
      Evidence: On 2026-10-29, mixed-case digest and native discovery controls first failed, then seventeen focused tests/93 assertions passed. Scoped coverage binding first rejected a citation into its own JSON object; after fixing it, twenty focused tests/108 assertions passed with the sibling-surface denial intact. Actual final candidate install/discovery/helpers/reinstall and three report-stage trials passed at payload `23fcedd9c556c64c71c9fc4afb9873f5408d7f493c80fef14441c9ca23a00652`; the generic Copilot's original rejected grade remains beside its corrected replay. Full Linux verification under the same bounded setup budget as macOS passed 597 tests/2619 assertions (`t13-ci-budget-full-linux-suite-20261029.log`). Earlier five-second setup timeouts remain retained and are not passes. Go tests, vet, module tidiness, golangci-lint config/run, the other plugin's 34 tests, actionlint and committed-consumer tests (nine/119 assertions, no skips) passed. CI provisions pinned Go for real compiler fixtures, runs portable maintenance cases on macOS and preserves triggers/permissions/release rules. Consumer remains clean at `d94e2fe4c4d21646480e1cf9adf3ed713878de78`. GUI and live-Claude invocation stay deferred; real marketplace cutover remains gated. Independent implementation review is still required before completion.

      Renewed final verification after R-19: the original bare Linux command passed 598 tests/2625 assertions, followed by all Go/module/lint, other-plugin and CI syntax checks. Both native CLI installations at exact source `3039766d5755be8cb88589c3f5c05e3f9ddaa946` passed all eleven skills, installed helpers and uninstall/reinstall (`post-r19-native-install-b/result.json`); its payload remains `23fcedd9c556c64c71c9fc4afb9873f5408d7f493c80fef14441c9ca23a00652`. Consumer `2095f06e4ccfe74740ceb9cfc806bcb7c7667b3a` passed nine tests/123 assertions and its normal commit checks at the accepted policy path. Its refreshed actual Copilot policy trial and unchanged-answer replay passed. Earlier R-19 verdicts and failures are retained; AC-07/08/09 stay unchecked until the fresh independent review returns their verdicts. No marketplace, adoption, live-Claude or GUI claim is made.

- [x] T15 `docs/reference/compatibility.md`, parent-roadmap status, report-trial grader, paired consumer installation/preflight tests and this document - resolve R-20 notes: record final local-catalog validation accurately, enforce the shared 0.6.0 minimum and require distinct clean-snapshot publication-denial and dirty-snapshot refusal controls. Correct the observed compatibility-qualification wording rejection without allowing a production-compatibility claim. Observe the version and wording regressions fail before their fixes, run required shared/consumer checks, then submit exact committed targets to a fresh actual Copilot Opus 5.5 review (AC-07, AC-08, AC-09).
      Evidence: On 2026-10-29, a maintenance-shaped 0.5.99 payload incorrectly passed the new version control, then was rejected after the 0.6.0 gate fix; 0.6.0 passes. Consumer `9111242da11be04157b7cccd994426069d31b9d5` passed eleven tests/127 assertions, including separate clean-snapshot missing-publication-evidence and dirty-snapshot refusal cases; all seventeen normal commit checks passed without skips (including 1093 frontend tests). The refreshed actual Copilot Opus 5.5 trial binds that exact consumer and unchanged plugin payload 23fced. Its initial wording-only rejection is retained: the answer explicitly says the samples establish no production call-site compatibility. The observed red/green grader control accepts that qualification and rejects a production-readiness claim; seven focused tests/38 assertions pass. Its unchanged native assessment/plan replay passed all twenty cases, installed rendering and preservation checks (`post-r20-report-stack-policy/regraded-result.json`). The final bare shared suite passed 598 tests/2627 assertions (`r20-final-full-suite-20261029.log`), then all Go/module/lint, other-plugin and CI syntax checks passed. Production plugin bytes remain unchanged. A fresh exact-target independent implementation review is still required.

- [x] T16 report-trial grader/replay driver and this document - address R-21: bind a new side-by-side replay to its actual committed grader bytes, reject positive production-compatibility claims despite unrelated qualifying words, and keep all raw review records under Review Log. Observe the new negative control fail before tightening the grader, preserve prior artifacts, run required checks and obtain a fresh actual Copilot Opus 5.5 review (AC-09).

      T16 progress: the mixed positive-claim/qualifying-word control first failed, then seven focused tests/43 assertions passed after claim-level qualification binding. The full bare Linux suite passed 598 tests/2632 assertions (`r21-final-full-suite-20261029.log`), followed by all Go/module/lint, other-plugin and CI syntax checks. The replay driver supports a fresh side-by-side output and records actual implementation commit/file hash; its committed-source replay is the remaining T16 verification. Raw R-20/R-21 bytes now sit under Review Log, and both review-check commands pass.

      Final T16 evidence: the fresh side-by-side replay passed at committed code `2ed05edafb7c2fbc6ef2fedb23d17b49f3fcadfc`, actual grader SHA-256 `7eb986673d96e238823e57ab9315ab7eb00f31715b5bf087648cb432948760e9` (`post-r21-policy-replay/regraded-result.json`). Its actual installed report render passed. The original result, prior replay, assessment, consumer plan and native transcript hashes remained identical. The final independent review launcher now repeats this replay from its own exact source target into a separate new directory and checks code binding and preservation. Earlier artifacts are retained with their real provenance; no earlier replay is relabeled as a new model answer or this implementation.

- [x] T17 report replay receipt verification, maintenance evidence instructions, paired consumer policy and this document - resolve R-22 within accepted Design: record and validate the helper's actual existing-or-new report path/digest, and use the accepted per-run evidence-ref name. Preserve old artifacts and compatibility with historical refs. Observe missing-report/digest and canonical-ref controls fail, then pass checks and refresh exact native-install proof before final Copilot review (AC-05, AC-07, AC-08, AC-09).

      T17 progress: missing report-receipt verifier and canonical-ref controls first failed, then twelve focused tests/138 assertions passed. The consumer passed eleven tests/129 assertions after its canonical-ref red. The full bare shared suite passed 599 tests/2640 assertions (`r22-final-full-suite-20261029.log`), followed by all Go/module/lint, other-plugin and CI syntax checks. The replay verifies the actual helper-returned path and digest, records reuse honestly and rejects absent, changed or unrelated reports. Shared/consumer instructions and the synthetic delivery fixture now use the already accepted per-run evidence ref; runtime compatibility with historical suffixed refs is unchanged. Final committed native installation and replay remain pending.

      Final T17 evidence: source `1d8bc8ae47dac829e6fe0612386c05ea54ab4936` passed both native CLI installs, eleven-skill discovery, installed settings/GET/report helpers and uninstall/reinstall (`post-r22-native-install/result.json`), full payload `bed9339394aee9d4f45e54962751eb2e9ca1c06c5011ad8f4e3d2d6ceaba0ea9`. The only production delta from 23fced is the evidence-ref instruction matching accepted Design; historical native analysis/authored proofs keep their original payload/ref bindings. The replay at that exact committed code verified the helper-returned existing report path and digest `fd3b4a4468bd98967d9b37451f097316cebe411e562b9bd4c311465637eddaf2`, recorded report_reused true and preserved every original artifact (`post-r22-policy-replay/regraded-result.json`). Consumer `9e1af57f34b51b230eb2a4271416ca7bcc166ca3` committed the matching canonical instruction with all seventeen normal checks passing and no skips. The final independent launcher checks the new installed payload, executes the consumer suite through it, and separately replays the historical packet with its original matching renderer while verifying the actual report file. No new rendering or native model answer is inferred from an idempotent resumed report.

- [ ] T18 report-trial compatibility grader, negative controls and this document - address the final R-23 nit by rejecting remaining positive compatibility assertions even when they omit production. Observe the new controls fail, then pass all required checks and a focused actual Copilot Opus 5.5 review bound to the unchanged R-23 production/consumer objects and current grader (AC-09).

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-27 | R-1 | spec | `6c139552bd81535db3367c9f0fecbda18ef94723` | claude-opus-5.5 | procedural | Blocking authority, collection-completeness, parity and executed-proof gaps; factual fixes and owner decisions pending. |
| 2026-10-28 | R-2 | spec | `50ae43e6d1365dca95875039c82b260c8417ee6e` | claude-opus-5.5 | procedural | Blocking batch-lifecycle mapping and trial-proof gaps; report-header, independent-repository and baseline clarifications required. |
| 2026-10-28 | R-3 | spec | `7346606c7813391e047b365f134f64dc7e10418a` | claude-opus-5.5 | procedural | No blocking findings; authored satellite mapping and authority proof need fixes, with an explicit owner decision on repair-review and worktree extensions. |
| 2026-10-28 | R-4 | spec | `b3751ebf2e0f55c51af59e0e21d98e80a0c8dc9a` | claude-opus-5.5 | procedural | No blocking findings; clarify authored-dependency classification, stalled-sync repairs, record refs, non-circular criteria and exact intake changes. |
| 2026-10-28 | R-5 | spec | `593d45be5ab97e395b8da17f57afdafa1d35ac7f` | claude-opus-5.5 | procedural | No blocking findings; make repeated-batch refs, repair diff/freshness, generated manifest normalization, observed repair-review proof and both command contradictions explicit. |
| 2026-10-28 | R-6 | spec | `b425fbba9523bd8eaef2ed6285ddb72333d4c471` | claude-opus-5.5 | procedural | Define the cross-host fixture handoff/resume, exact worktree-authority amendment, report-publication policy and bot-login normalization. |
| 2026-10-28 | R-7 | spec | `8f061205fbf36c5e91e4cc51bd5f70c0d18e9d8d` | claude-opus-5.5 | procedural | Define standing report authority, preserve main-checkout publication, and locate living report updates and resume. |
| 2026-10-28 | R-8 | spec | `8eb1b587ffcb1178077686eba13533379725e56f` | claude-opus-5.5 | procedural | Define adopted authority source, report-race recovery, pending-report prerequisites and restrictive-request tests; resolve later outcome publication scope. |
| 2026-10-28 | R-9 | spec | `a980d52be2dbf96778dad2eeda88b9b2ab490e00` | claude-opus-5.5 | procedural | Define durable journal and generic delegation; remove the added rebase exception and publication gate; isolate index content. |
| 2026-10-28 | R-10 | spec | `507f9ad15a645e6f0e8882d4b36a28ac65af9c40` | claude-opus-5.5 | procedural | No blocking findings; define generic publication route, deferred outcome storage and unpublished-record references. |
| 2026-10-28 | R-11 | spec | `91905cc896b33f476762b743eb63a9d62c7fb1d4` | claude-opus-5.5 | procedural | No blockers; specify restricted report placement and pending warnings, reject dirty index paths and assert configured release-bot eligibility. |
| 2026-10-28 | R-12 | spec | `213029fb8465cc5850ca52f615cb1936f2c04d79` | claude-opus-5.5 | procedural | No blockers; preserve local report-commit eligibility with isolated preparation, keep warnings maintenance-scoped and define generic requested commits. |
| 2026-10-28 | R-13 | spec | `35e84a042b99b70612774fb38b1d7a0fe3a8da1e` | claude-opus-5.5 | procedural | No blockers; clarify update candidates, same-day reservations, generic draft promotion and explicit publication tests. |
| 2026-10-28 | R-14 | spec | `e70b2ea8d475834334b83b702de411fe74de403b` | claude-opus-5.5 | procedural | No blockers; align advancement proof, persist comparable history, cover reused types and preserve committed-index regeneration and scoped leak recovery. |
| 2026-10-28 | R-15 | spec | `70b42a627aea300ca83d5a3ebe80d32d8f409044` | claude-opus-5.5 | procedural | No blockers; separate publication-case outcomes, align lifecycle authority and positive criteria, preserve unverified legacy visibility and isolate GET imports. |
| 2026-10-28 | R-16 | spec | `f0517c1e5fe3801d0312732c6d3e114dd7f04ce9` | claude-opus-5.5 | procedural | No blocking findings; carry the missing-default-checkout fixture clarification into task planning under the existing main-checkout-only publication rule. |
| 2026-10-28 | R-17 | spec | `ad48fedfb7931e5479c32f1b9029829b1fe16a4b` | claude-opus-5.5 | procedural | No blockers after covered summary/version drift; clarify historical 0.4.0 install evidence. Prior missing-default-checkout fixture remains tracked for task planning. |
| 2026-10-28 | R-17 | spec | `ad48fedfb7931e5479c32f1b9029829b1fe16a4b` | n/a | n/a | accepted by owner |
| 2026-10-29 | R-18 | spec | `6a28de399189560f49e0f8957d9226d1d2f2c047` | claude-opus-5.5 | procedural | No blocking findings after blog integration; one factual marketplace-description nit. |
| 2026-10-29 | R-19 | implementation | `3216f0962d54afc8dc584394d13a74fe57e0759f` | claude-opus-5.5 | procedural | AC-01 through AC-06 met; AC-07/AC-08 not verified; AC-09 not met. The workflow guard fails, and the consumer policy location differs from accepted Design. Fixes and re-review required. |
| 2026-10-29 | R-20 | implementation | `f6974f259de383bbbc803261a0fa33b3e949876d` | claude-opus-5.5 | procedural | All nine criteria met; three factual/test nits remain: final compatibility wording, consumer minimum version and a preflight false-positive branch. T15 resolves them before final review. |
| 2026-10-29 | R-21 | implementation | `1a121564d92ac3da8bf7bef238432a527b3888f4` | claude-opus-5.5 | procedural | All nine criteria met; three minor notes require replay-code provenance, stronger compatibility-claim controls and correct Review Log placement. T16 addresses them before final review. |
| 2026-10-29 | R-22 | implementation | `06b171348ece78c622b914838babfbe5cb442951` | claude-opus-5.5 | procedural | All nine criteria met. Two minor notes require recording the actual resumed report path/digest and aligning the evidence ref instruction with accepted Design. T17 applies those fixes. |
| 2026-10-29 | R-23 | implementation | `2a9aa910e1757a27bc736047439a1a848cd5623e` | claude-opus-5.5 | procedural | All nine criteria met; one test-grader nit remains for positive compatibility claims without the word production. T18 adds those controls before a focused final review. |


### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Canonical operation and lifecycle reuse; Design, Analysis, dispositions and durable reports; covers
EVIDENCE: `covers` lists `plugins/vh-adlc/references/lifecycle.md` and `references/authority.md`, but the Design never says which rows change. Current shared rules: lifecycle.md:50 says "other non-feature publishing or live-operation gaps remain unsupported"; lifecycle.md:95-96 says maintenance "authorizes no push, PR, merge or live action"; authority.md:21 requires "Separate approval for that exact action" for merges and releases; authority.md:32 says "an earlier approval ... never stands in for a missing approval". Stackweaver's procedure relies on scope pre-authorization ("unless the user already said 'just do it'", agents/maintenance.md:30-32, 36-37, 47-48; also 322-323). It also creates and pushes branches and PRs, squash-merges, closes satellite PRs, watches releases, takes down the shared dev stack (`make down`, 378-381) and commits the report (325). The spec line 89 allows "Explicitly preauthorized work". Line 179 says to revalidate "approved scope". The shared-workflow-migration.md:82-85 child contract requires an "authority model". This spec defines none, so the implementer has to choose between keeping the shared exact-action rule, which loses Stackweaver's pre-authorized flow, and inventing a new shared permission.
PROPOSAL: Add an explicit authority model. List each remote and live action class the maintenance operation may perform (branch push, PR create, merge, close/comment, report commit/push, release watch, local stack stop/restore, consumer helper dispatch), the approval form each needs, and the exact authority.md and lifecycle.md rows to add. State that a consumer procedure's existing pre-authorization rule keeps applying and creates no new shared default.

FINDING: F-02
KIND: judgement
SEVERITY: blocking
WHERE: Design, Collection and completeness; Design, Analysis, dispositions and durable reports
EVIDENCE: The spec says "A 403/404 is not proof ... Record denied/unknown unless a separate successful repository capability response establishes the precise unavailable condition". It also says "Incomplete required collection blocks a ready-to-execute disposition" and "Partial or differently scoped runs cannot claim an alert was resolved by absence". Stackweaver's policy treats that 403 as expected by design. security-alert-maintenance.md:110-111 says to record it as "n/a (no code scanning)", not a failure. Lines 45-46 note that the 403 body itself confirms the no-GHAS state, and line 132 records that the monorepo has no code scanning by design. agents/maintenance.md:189-191 and 312-316 require the run-over-run diff to show newly resolved alerts. Under the spec, the private monorepo's code-scanning surface is unknown on every run. No run is ever complete and comparable, so the resolved-alert diff is lost permanently, and monorepo items may be blocked depending on how "affected" is read. The spec defines neither "required collection" nor "affected items".
PROPOSAL: Let settings declare a surface as expected-unavailable for a repository, with the evidence that makes a matching response count as complete "n/a", and define which surfaces are required and which items an incomplete surface affects. Otherwise, put the stricter generic rule to the owner as an intentional difference for Stackweaver.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: Test Plan, AC-05 and AC-06; Design, Analysis, dispositions and durable reports
EVIDENCE: Design line 134 says the helpers "have no remote mutation command". The AC-09 model trials are "read-only report trials" (Design line 202). Revalidation before writes, invalidating approvals on a head change, and reconciliation after an interrupted merge, closure or report commit (Design lines 179-184) are therefore agent-procedure behavior. The AC-05 proof says "A recording fake remote rejects unapproved/out-of-scope/head-changed writes", which checks the fake rather than the procedure. The AC-06 proof says "Inject interruption before/after a fake merge ... observe state reconciliation before any retry" but names no actor that performs the reconciliation. feature-documents.md:105 requires Proof to name "a real check: a test, a scenario with a pass condition, or a written manual procedure". As written, both rows can pass with no evidence that any executed procedure revalidates or reconciles.
PROPOSAL: For AC-05 and AC-06, name what executes against the fake remote: a scripted harness or a bounded model trial with write-capable fake transport. Give pass conditions observed from its transport log and the repository state. Otherwise, narrow both criteria to what the GET-only helpers and static procedure contracts can establish.

FINDING: F-04
KIND: factual
SEVERITY: blocking
WHERE: Design, Consumer settings and project procedures; Acceptance Criteria AC-07; Test Plan AC-07
EVIDENCE: The design lists the policy that `agents/maintenance.md` retains when it becomes a "thin shared-operation entry". The AC-07 proof compares against "the current local workflow parity checklist", which no section defines. The design list omits several existing Stackweaver behaviors:
- no self-credit and conventional commits (agents/maintenance.md:17-23)
- the green-checks requirement before the `--admin` helper, sequencing for `.github/**` PRs, and the ban on a raw `gh pr merge --admin` fallback (48-49, 386-398)
- whole-organization discovery treated as a list finding (112-114)
- stalled sync PRs closed, never merged, after a root-cause check (132-138)
- Renovate dashboard and config expectations, the `vulnerabilityAlerts` hardening flag and Dependabot narrowing advice (148-164, 205-209)
- no recommendation to buy GHAS (205)
- the doc-impact check `scripts/check-doc-coverage.js` (256-258)
- the report path `docs/internal/maintenance/YYYY-MM-DD-dependency-sweep.md`, its plan frontmatter, the day's `core/v*` and app tags, and the `[skip ci]` report commit (300-308, 325)
- the Step 9 disposition vocabulary (407-410)
shared-workflow-migration.md:82-84 also requires the child spec to record "intentional differences". This spec has no such list, although it changes bot matching, 403 handling and report naming. An implementer can author a partial checklist and AC-07 still goes green.
PROPOSAL: Define the parity checklist in the spec. Map every hard rule and step of agents/maintenance.md and .claude/commands/maintenance.md to shared, retained local or intentional difference. List each intentional difference for owner decision, and make the AC-07 proof check every mapped item.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Collection and completeness
EVIDENCE: The spec says to "include configured dependency and sync bots using normalized exact logins". Stackweaver matches authors with the substring regex `renovate|dependabot|release-bot` (agents/maintenance.md:99-120). It records three incidents where a too-narrow filter hid PRs, including 21 sync PRs (125-130), and says "Fix the discovery, not just the symptom". An exact login list is narrower than the current regex. A new or renamed bot login that the regex would catch is silently missed, and the test plan only checks the configured identities.
PROPOSAL: Keep an exact allow-list for execution eligibility, but also report as inventory gaps any open PR whose author is a bot or app account outside the list. Alternatively, record the narrowing as an intentional difference for the owner to decide.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer settings and project procedures; Design, Analysis, dispositions and durable reports
EVIDENCE: The spec says "Save one uniquely named report per run in the configured directory". Without settings, it says only "use only the validated checkout repository and a single-repository report-first sweep". No default report location is given for the no-config case, which AC-01's "no-config single-project fixture" exercises. A report inside the owner's checkout adds untracked files, but the spec also leaves reports uncommitted by default.
PROPOSAL: State the default report location and naming for a project without settings, and whether it lives inside or outside the checkout. Add that case to the AC-04 proof.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Design, Analysis, dispositions and durable reports; Acceptance Criteria AC-04, AC-06
EVIDENCE: The spec says "Existing report bytes must not be overwritten". It also says that selected batch work records "approvals, checks and later outcomes in the sweep report", and that on resume the agent should "inspect the saved report". Stackweaver calls its report a "living-spec report" (agents/maintenance.md:300-307). The spec does not say whether later outcomes append to the same run's report or need a new file, or whether a resumed or same-day continuation is the same "run" or a new suffixed report. The AC-04 proof checks only "unchanged older bytes".
PROPOSAL: Define run identity across resume and state that the current run's report is append-only for outcomes while earlier runs' reports stay byte-identical. Make the AC-04 and AC-06 proofs check both.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-07, AC-09; Test Plan AC-07, AC-09
EVIDENCE: AC-07 says "Stackweaver uses the installed shared operation while retaining its command/model/arguments". The daily entry is the Claude Code `/maintenance` command with `model: opus` (.claude/commands/maintenance.md:1-6). The design says a Claude model-behavior claim needs its own trial, and the AC-07 proof is static adapter contracts only. AC-09 says the trials "follow the shared procedure and Stackweaver policy", yet the trials are read-only report trials that cannot exercise batching, release or helper policy. compatibility.md:49 lists Copilot CLI lifecycle intake and agent loop as unsupported. The spec does not say how the Copilot trial obtains the shared payload, given that AC-08 installs only into Codex and Claude profiles, or what support claim that trial establishes, if any.
PROPOSAL: Narrow AC-07 to the adapter routing contract, or add an owner decision on a Claude trial. Narrow AC-09 to the report stage, state how the Copilot trial receives the exact payload, and state that the trial creates no Copilot support claim.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: covers
EVIDENCE: The design says the existing bounded maintenance "record template, independent reviewer and resume/freshness rules remain the canonical implementation path", and the AC-05 proof re-runs the "existing maintenance variant/resume regressions". `covers` omits `plugins/vh-adlc/references/maintenance-record.md`, `plugins/vh-adlc/references/maintenance-review.md`, `tests/vh-adlc/maintenance-variants.test.ts`, `tests/vh-adlc/maintenance-resume.test.ts` and `tests/vh-adlc/lifecycle/`. feature-documents.md:43-44 requires `covers` to list "every path whose change can affect the feature", so changes there would not make reviews stale.
PROPOSAL: Add those reference and test paths to `covers`.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Design, Consumer settings and project procedures
EVIDENCE: The spec says "Keep `scripts/satellite-merge.sh` and its existing approval gate local and unchanged". The script has no approval gate (scripts/satellite-merge.sh:21-80). It toggles `enforce_admins` and runs `gh pr merge --admin`. Its preconditions, which are confirmation before mass merges unless pre-authorized and green checks first, live in agents/maintenance.md:30-32, 47-49 and 386-388.
PROPOSAL: Say that the approval gate and check preconditions are retained in the Stackweaver procedure, and cite those lines, while the helper bytes stay unchanged.

### R-2

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Authority for selected follow-up work; Design, Consumer parity checklist and intentional differences; Acceptance Criteria AC-05
EVIDENCE: The authority table row for local code (spec lines 191-192) requires "existing bounded-maintenance eligibility, required checks, clean independent review" before preparing compatible commits, and a push must contain "the exact reviewed code". AC-05 says selected compatible work "reuses bounded-maintenance checks and independent review". The shared procedure that this reuses says "Use a short-lived maintenance branch in the task's owning checkout" (lifecycle.md:97). It also says to commit the task's record with its paths (lifecycle.md:103-105, 112-113) and to commit the record again after review (lifecycle.md:127-128). authority.md:22 requires "Separate approval for that exact action" for destructive Git operations, and authority.md:66 says "Never create, remove, prune, reset or force-move a worktree". Stackweaver's batch, which the parity row at line 227 keeps as "local isolated batch preparation", runs `git worktree add /tmp/deps-batch -b chore/deps-batch-<YYYY-MM> origin/main` (agents/maintenance.md:342). After the merge it runs `git worktree remove /tmp/deps-batch --force` and then `git branch -D` (363-365). It has no maintenance record and no independent review before `git push` and `gh pr create` (351-352). The intentional-differences paragraph (lines 233-240) does not list a new review gate or a record committed into the one-squash batch. Nor does it say how the worktree steps fit the shared rules. An implementer must choose between breaking the shared lifecycle/authority rules and changing Stackweaver's approved batch procedure without an owner decision.
PROPOSAL: Say how Stackweaver's monorepo batch maps onto bounded maintenance. Cover the branch or worktree location, the worktree removal and `git branch -D` authority, where the task record lives and whether it enters the squash, and whether independent review now precedes the batch push. List each resulting change to Stackweaver behavior as an intentional difference for the owner to decide, and add the matching lifecycle/authority wording to the Design.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Design, Stackweaver adoption and support claims; Acceptance Criteria AC-09; Test Plan AC-09
EVIDENCE: The canonical operation treats "Missing required capabilities" as "visible blockers" (spec lines 102-103). Collection and report saving run through helpers that call the GitHub CLI (lines 244-247). The Copilot report trial may use "only native view/grep/glob tools ... with shell, write, network and GitHub tools disabled" (lines 354-355), so it cannot run the settings, collection or report helpers. A run that follows the procedure correctly would therefore report collection as blocked. The spec never says what the "read-only input packet" contains, for example pre-collected helper output. It also gives no expected dispositions or pass condition. The AC-09 proof says only "independently grade report contents, source/index preservation and zero remote writes from transport logs" (line 388). With no shell or network, the Copilot trial has no transport log, so that part of the check is always satisfied. Line 341 adds "one fixed Stackweaver source/configuration read-only trial" but does not name the model or harness that runs it. Compare the AC-03 proof, which grades expected dispositions against a defined corpus. feature-documents.md:104-105 requires Proof to be "a scenario with a pass condition". AC-09 is a required pre-adoption blocker (lines 358-359), yet any graded output could satisfy it as written.
PROPOSAL: For each AC-09 trial, state the input packet (for example, a fixed collected-data fixture produced by the helpers), the harness and model, the procedure stages it is expected to perform, and the expected dispositions and blocker statements it must produce. For the Copilot trial, replace the transport-log condition with a check it can actually fail, or remove that condition.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Analysis, dispositions and durable reports; Design, Consumer parity checklist (Step 5.5 row)
EVIDENCE: The parity row at spec line 226 keeps Stackweaver's "local frontmatter/author/covers conventions". Stackweaver's report is a "dated living-spec report ... with plan frontmatter (`status`, `status_description`, `description`, `author: "Michiel VH"`, `covers`)" (agents/maintenance.md:300-302). The spec says the current run's approval, check and outcome updates "append dated sections without changing its existing prefix" (lines 302-303). The frontmatter is part of that prefix. Its `status` and `status_description` therefore stay as they were at creation even after the batch merges, or else the helper breaks the append-only rule. The spec does not say which. The AC-04 proof checks "an append-only outcome with its original prefix" and so would fail a Stackweaver report whose status was updated.
PROPOSAL: State whether consumer frontmatter status fields are a mutable header excluded from the append-only prefix, or stay fixed at creation, and record the choice as consumer behavior or an intentional difference. Make the AC-04 Stackweaver fixture check that choice.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Authority for selected follow-up work
EVIDENCE: Stackweaver keeps four independent repositories "in scope every run" (agents/maintenance.md:66). It says `vhco-pro/terraform-provider-stackweaver` "has no branch protection, so its PRs merge directly" (76-77). The spec's merge row (line 193) covers only "Squash-merge a dependency batch; merge a satellite PR". It does not cover merging a bot PR in an independent repository. Under the unchanged shared rule (authority.md:21), that merge would need "Separate approval for that exact action". Stackweaver's existing scoped preauthorization would then no longer cover it. Separately, row 193 lets the owner's "approval/preauthorization" cover the helper for approved satellite work, while row 196 requires "Explicit owner authority covering that live action" to "use the local satellite helper". The two rows do not say whether a scoped "just do it" preauthorization satisfies row 196. Today it does (agents/maintenance.md:30-32, 47-48).
PROPOSAL: Add independent-repository bot PR merges to the selected-delivery row under the same preauthorization and green-check conditions. State that a scoped preauthorization covering satellite merges meets row 196 for the helper, so a separate per-helper approval is not needed.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, Consumer parity checklist and intentional differences; Sources
EVIDENCE: Context names two consumer revisions: extraction baseline `1999a71b0cd8a224195b7a971fd1851ca8f3ebef` and refreshed main `5383332c4e836fe7c33f59042186df7f314f49da` (lines 48, 67). The parity table says "All citations refer to the fixed consumer source in Context" (line 213), and line 172 cites "the consumer baseline". Sources links only `1999a71b`. The cited line ranges (for example agents/maintenance.md:30-32, 47-49, 386-398) do match the supplied `5383332c` export. Still, the document does not say which revision the parity review and AC-07 must use.
PROPOSAL: Name the single consumer commit that the parity table and AC-07 bind to, and update Sources to match.

### R-3

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Authority for selected follow-up work; Design, Consumer batch mapping and worktree preservation; Design, Consumer parity checklist (Ownership, Step 4 row)
EVIDENCE: The parity row for Step 4 keeps the API/orchestrator builder-first Go-toolchain ordering in Stackweaver. The source procedure says to "Open the builder bump in both satellites and land it before the monorepo batch merges" (stackweaver agents/maintenance.md:281-286). That builder bump is an agent-authored satellite PR, not a bot PR. The helper exists to "Merge a PR you authored on a satellite repo" (scripts/satellite-merge.sh:4). The spec's merge row covers only "Squash-merge a dependency batch; merge a satellite or independent-repository bot PR" (spec line 199). The helper row grants scoped coverage for "Stackweaver satellite merges" (line 202). The batch mapping (lines 217-258) describes only the monorepo batch worktree, its squash and its paired record. The worktree exception covers "a fresh task-owned worktree and branch from current main" (lines 249-252). Local `distribution/**` edits stay forbidden (agents/maintenance.md:20-22). The spec does not say where an authored satellite change is prepared, whether it needs bounded-maintenance review before push (line 289 suggests it does), or which authority row allows merging it under existing scoped preauthorization. An implementer could make this retained ordering step need a new per-action approval, or could leave it unmapped.
PROPOSAL: Map the authored satellite builder-bump PR explicitly. Cover where it is prepared, its record and review binding, and its push and merge authority under the existing scoped preauthorization and helper exception. Add it to the parity row and to the AC-05 scenario.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Consumer parity checklist and intentional differences; Design, Consumer batch mapping and worktree preservation; Open Questions
EVIDENCE: Lines 285-291 call several changes "Intentional differences already implied by the owner's harness-agnostic migration request". One is "Newly authored batch repairs reuse the existing shared independent-review requirement". The others are the external paired-record location and the amended shared worktree authority (lines 249-252). The recorded owner decisions (Context lines 36-37, 56-66) cover generalization, preserving the helper exception, unavailable scanning, unknown bots and the Claude trial deferral. None of them covers these R-2 resolutions. Stackweaver's current procedure applies Step 3 code fixes "in the same batch branch" (agents/maintenance.md:245) and fixes red combined CI "on the branch ... and re-push" (360-362). It has no independent review before that push. The R-2 F-01 proposal asked that each resulting change be listed "as an intentional difference for the owner to decide". Open Questions says "None". review-protocol.md:77-78 requires judgement items to become owner questions, not author-answered facts.
PROPOSAL: Record the new pre-publication review gate for authored batch and CI repairs, the external paired-record extension and the shared worktree-authority amendment as explicit owner decisions. Do this through an Open Question with options, or as a dated owner answer in Context. Do not attribute them to the earlier migration request.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05; Acceptance Criteria AC-05
EVIDENCE: AC-05 claims that "remote or live actions stay within owner and consumer permissions after revalidation". The authority table defines separate classes and limits. Closing a PR or posting its explanation needs revalidation of supersession and ownership (line 200). Publishing a report or record needs separate authority (line 201). A release or sync dispatch needs explicit authority, and watching a release "never grants dispatch authority" (lines 195, 202). Stopping the shared stack needs Stackweaver's separate confirmation, and "Approval to merge dependencies does not approve stopping a live stack" (line 203). The AC-05 proof exercises unapproved writes, aggregation, independent-repository and helper actions, a stale-head write and worktree cleanup (line 489). It has no scenario or negative control for close/comment revalidation with mixed or unknown ownership, report or record publication, release or sync dispatch after watch-only authority, or stopping the stack under dependency-merge approval alone. feature-documents.md:103-105 requires Proof to name a real check for the criterion. As written, AC-05 can pass while those permission boundaries were never observed.
PROPOSAL: Add Codex fake-transport variants with pass conditions for these four classes. Alternatively, narrow AC-05 to the classes the proof exercises and cover the rest with a separate criterion and proof.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation; Design, Authority for selected follow-up work; Test Plan, AC-05
EVIDENCE: The spec defines only two kinds of change. A bot-head aggregation "combines selected bot commits, regenerates compatible locks as required" (spec lines 228-229). An authored repair is introduced with "If the agent authors a source or CI repair" (line 238), and the satellite mapping covers only "An authored satellite builder or CI repair" (line 260). Several existing Stackweaver flows produce agent-authored dependency changes that fit neither definition. Step 1.5 folds an alert's "dependency bump into the same one-squash batch" when no fix PR exists, and fixes a satellite-only alert "in that satellite" (agents/maintenance.md:196-200). Step 4 folds "the equivalent bump into the monorepo batch" after a synced satellite PR is closed (265-269). Step 7 fixes red combined CI "on the branch (often a lockfile regen) and re-push" (360-362). Authored work can also land in the four independent repositories (66-83), and the spec gives that work no preparation location or record binding. The owner decision applies review to authored repairs and keeps bot-only batching. Without a classification rule, an implementer can review lock regenerations, which changes bot-only batching. An implementer can also skip review for agent-written manifest bumps, which exempts authored changes from the review the owner adopted. The AC-05 proof covers neither boundary.
PROPOSAL: State the classification rule. For example, only unmodified cherry-picked bot commits plus mechanical lock regeneration for those manifests count as aggregation, and any agent-written manifest, source or CI change is authored. Map alert-driven, equivalent-bump, satellite-only and independent-repository authored changes to a preparation location and the paired-record path. Add fixture cases on both sides of the boundary to the AC-05 proof.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer parity checklist and intentional differences (Release-bot and stalled-sync incidents row)
EVIDENCE: For a stalled sync PR, Stackweaver says: "check `gh pr checks`, fix the root cause on the satellite, and only then decide whether the queued PRs are still live or superseded" (agents/maintenance.md:132-138). Both recorded incidents were CodeQL failures after a monorepo Go bump (134-135). The parity row keeps only "investigation of stalled sync checks" and the superseded-closure rule (spec line 295). It does not map the root-cause repair, its ordering before the live-or-superseded decision, or its authority under the authored satellite repair path. AC-07 checks every row of this table, so this retained behavior can be lost while AC-07 still passes.
PROPOSAL: Add the satellite root-cause repair, and its ordering before the disposition of queued sync PRs, to the parity row. Route it through the authored satellite repair, paired-record and selected-scope authority mapping, and include it in the Stackweaver policy report or AC-05 fixtures.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation; Design, Authority for selected follow-up work
EVIDENCE: The external record "lives under the owning consumer's maintenance directory" (spec lines 239-240), and `record_target` is "the committed Definition/evidence artifact in the owning consumer's Git history" (lines 250-251). The spec does not say which checkout, worktree or branch receives that commit. The shared bounded procedure requires "a short-lived maintenance branch in the task's owning checkout; do not write into an unrelated feature" (lifecycle.md:97-98). Stackweaver treats its main working tree as "live and shared" and edits code in worktrees (CLAUDE.md:130), and it lets small verified changes go "straight to `main`" (CLAUDE.md:159). The authority table names commit rules only for the sweep report (spec line 207). It does not say whether the record commit may land on the main checkout's current branch, which can be another session's work with staged entries (authority.md:59-63), or whether that commit is ever pushed. Push and publication need separate authority (line 212). Reviewers and resume need `record_target` to stay reachable, but nothing defines where it lives.
PROPOSAL: Specify the ref and checkout that receive `record_target` commits, for example the same location and branch as the consumer's report commit, with explicit-path commits and an unrelated-state check. State that the commit stays local unless publication is separately authorized. Add a fixture in which the owner checkout is on an unrelated branch with staged work.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-09; Test Plan AC-09
EVIDENCE: AC-09 requires that "required tests and independent review pass" (spec line 511). Its proof includes "feature lint/freshness/gates and Copilot Opus 5.5 implementation review at exact commits" (line 525). Under feature-documents.md:183-185, an implementation review returns `met` only when "executed evidence observed in this review establishes the criterion". A reviewer cannot observe its own pass. The `complete` gate also requires `all_met` and `impl_review_clean` (feature-documents.md:248, 289-291), so AC-09 depends on the gate and review that evaluate it. The deciding review can never return `met` for AC-09, so the criterion is circular and can only end unmet or residualised.
PROPOSAL: Remove the independent review and gate passes from AC-09's end state, since the completion gate already enforces them, and keep only the trial and test outcomes that a reviewer can observe.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, Canonical operation and lifecycle reuse; Design, Authority for selected follow-up work
EVIDENCE: The spec says to "Update the lifecycle's dependency/security sweep route to name this operation" (line 216), which implies such a route exists. Line 128 makes the same assumption. The lifecycle table has no sweep row. Its rows are Answer, Backlog triage, Diagnosis, Documentation, Bounded maintenance, New capability, Bootstrap, Verification, Resume and Ship (lifecycle.md:39-50). Its Resume row says only that "maintenance uses its record and review target" (line 49), while the spec resumes a sweep from its saved run report (spec lines 376-377, 401-402). discovery.test.ts:31 asserts the existing row names, so the planned change to the table needs to be exact.
PROPOSAL: Say that a new "Dependency or security sweep" intake row is added beside Bounded maintenance, and amend the Resume row to cover a sweep run's report. Add both to the AC-01 routing tests.

### R-5

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation; Design, Consumer parity checklist (Monorepo batch, Step 6 row); Test Plan, AC-05
EVIDENCE: Stackweaver creates the batch with a fixed path and a month-scoped branch: `git worktree add /tmp/deps-batch -b chore/deps-batch-<YYYY-MM> origin/main` (agents/maintenance.md:342). Today it avoids leftovers by running `git worktree remove /tmp/deps-batch --force` and then `git branch -D` (363-365). The spec replaces that cleanup with "Use a non-forced branch deletion only when reachability permits it; after a squash, retain the local branch if normal deletion refuses" (spec lines 318-319). It also says "Refuse existing-path/ref collisions rather than reuse another session's state" (line 284) and "never reuse an occupied worktree or repoint another task's ref" (line 317). After a squash merge, the batch branch tip is not reachable from main, so a normal deletion refuses and the `chore/deps-batch-<YYYY-MM>` branch is always kept. The Step 6 parity row keeps the local isolated aggregation as it is (line 344). Renovate runs on a weekly schedule (agents/maintenance.md:150-154), so more than one batch in a month is an expected case. Under the spec, the second batch in a month hits the kept branch, and the collision rule then stops it. That loses existing batching behavior. The AC-05 proof checks that refs are retained when normal deletion refuses, but it has no later batch that runs into the retained ref.
PROPOSAL: Name the batch branch and worktree path per run, for example by adding the run ID, and record that as an intentional difference for the owner. Alternatively, define how a retained squash-merged branch of the same name is handled without forced deletion. Add an AC-05 fixture in which a second same-month batch follows a retained squash branch.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation (paired source_target/record_target); Test Plan, AC-05
EVIDENCE: An authored monorepo repair binds "its affected-source verification to the batch worktree's exact commit" (spec lines 260-261), and `source_target` is "the exact repair-source commit (monorepo batch, satellite or independent repository)" (lines 269-270). In Stackweaver that commit sits on top of the cherry-picked bot commits: "git cherry-pick <sha1> <sha2> ... Apply any Step-3 code fixes on top as additional commits", then lock regeneration (agents/maintenance.md:348-350). The record contract needs a "Task base: <full starting commit>" (maintenance-record.md:15). The reviewer must "Verify the real diff from its task base" and identify "any source change outside the declared scope" (maintenance-review.md:10-11, 16-17). The spec never says what the Task base is for an authored repair layered on an aggregation. If the base is the batch's origin/main, every bot commit falls inside the reviewed diff and is either out of scope or reviewed. That adds a review gate to bot-only content, which the owner decision keeps as before. If the base is the post-aggregation commit, the spec does not say whether a later same-manifest lock regeneration on an affected path (line 243, which stays aggregation) invalidates the repair review under line 275-276.
PROPOSAL: Define the Task base and the reviewed diff for a repair inside a batch worktree, for example the aggregation commit directly before the authored commits. State how a later aggregation-only change to the repair's affected paths affects freshness. Add AC-05 fixtures for both cases.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation (classification rule); Design, Consumer settings and project procedures (v1 fields)
EVIDENCE: Aggregation allows "mechanical lock regeneration from those selected manifests using the declared package manager", and "changing those manifests or any other shipped behavior makes it authored" (spec lines 238-244). Stackweaver's retained procedure regenerates with "npm install / go mod tidy" (agents/maintenance.md:350) and fixes red combined CI "often a lockfile regen" (361-362). `go mod tidy` normally rewrites `go.mod` require and indirect lines as well as `go.sum`. Under the literal rule, a routine tidy would turn a bot-only batch into an authored change that needs review, which shifts the bot-only batching the owner kept as before. The spec does not say whether tool-generated manifest normalization counts as aggregation. It also does not say where the "declared package manager" is declared: the v1 field table (lines 171-182) has no such field, and settings may not hold command strings (line 161).
PROPOSAL: State whether manifest edits produced only by the package manager's regeneration of the selected manifests (for example go.mod normalization from `go mod tidy`) count as aggregation or as authored changes, and say where the package-manager declaration lives (project procedure or a named settings field). Add both sides of that boundary to the AC-05 fixtures.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05
EVIDENCE: The AC-05 proof requires that "every latter case needs observed independent repair review" in bounded Codex fake-transport scenarios (spec line 580). It does not say what is observed or what passes. The review protocol allows a registered or generic independent subagent. If neither is available it requires a handoff with the review left "visibly pending" (review-protocol.md:5-16). Bounded maintenance stores returned records verbatim and keeps `review pending` when no reviewer ran (lifecycle.md:115-121). The proof does not say whether a scenario passes when a Codex trial correctly stops at review pending with no push, or only when a real independent dispatch returns records. It also does not say that the stored records must carry both paired bindings (spec lines 273-275), or that the push must come after them in the trace. feature-documents.md:104-105 requires a scenario with a pass condition.
PROPOSAL: State the AC-05 pass condition for authored cases. For example: no push or PR command appears before stored review records that name both source_target and record_target, and a pending-review variant must end with no push. Name the review route and model handling the trial uses.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context; Design, Consumer parity checklist (Compatibility command row)
EVIDENCE: The spec identifies only one contradiction in the command: it "says never change protection while the playbook permits its sanctioned local helper" (spec line 59). The parity row says to "reconcile the old protection wording" (line 348). The command also tells the agent to "open satellite-only PRs and hand them off (satellite merges are review-gated by OSPS - never self-approve)" (.claude/commands/maintenance.md:28-29). The playbook instead merges approved, green satellite-only PRs with `scripts/satellite-merge.sh` (agents/maintenance.md:39-49, 386-392). An adapter could reconcile only the protection phrase and leave the hand-off wording, and AC-07 would still pass.
PROPOSAL: Name both command passages, lines 28-29 and 31-33, as the wording to reconcile with the retained helper exception, and have the AC-07 adapter contract check both.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Consumer batch mapping and worktree preservation (authored-repair acceptance trials); Test Plan, AC-05
EVIDENCE: The spec says the authored-repair trials "explicitly request Copilot Opus 5.5 for the fixture's separate review context, using the trusted native review runner" (spec lines 287-289). Positive cases pass only when "native reviewer transport shows the requested model" and the push appears after the stored review (lines 290-292). The AC-05 proof runs these as "bounded Codex scenarios" with "actual separate Copilot Opus 5.5 review" (line 614). The canonical protocol has only two independent routes: a registered agent or a generic subagent on the same host. Otherwise it writes "a self-contained handoff the owner runs elsewhere" and leaves the review pending (review-protocol.md:5-16). For a named model it says: "If the host cannot pass it, rejects it ... leave the review pending" (review-protocol.md:48-50). compatibility.md:52 says the same. A Codex session has no native route to a Copilot CLI `claude-opus-5.5` reviewer. Under the shared contract, the correct Codex procedure therefore ends at review pending, which the spec allows only for the negative variant. The positive variant can pass only through glue that the spec never defines: who carries the handoff to Copilot, whether the Codex session resumes, and which actor stores the returned records verbatim (lifecycle.md:119-121). The other option is a procedure that calls another CLI by shell, which the protocol does not allow. "Trusted native review runner" appears nowhere in the supplied sources. The existing lifecycle fixture only accepts a host "native reviewer receipt" (tests/vh-adlc/lifecycle/maintenance-fixture.ts:80). The owner's choice to continue this spec's review loop with Copilot Opus 5.5 does not, on its own, make Copilot a reviewer inside the Codex fixture.
PROPOSAL: Define the positive authored-repair sequence so the canonical protocol can satisfy it. One option is a Codex handoff that leaves the review pending, then a trusted runner that executes the canonical maintenance reviewer in Copilot, then a resumed Codex session that stores the records and pushes, with a pass condition for each step. Another is to run the fixture reviewer as a native Codex subagent with no named model. Put the reviewer-model choice for this fixture to the owner as a decision, not an implied consequence of the spec-loop instruction.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation; covers (references/authority.md)
EVIDENCE: The only authority.md change the spec states is: "Amend authority.md's blanket worktree prohibition to permit that declared, owner-selected procedure" (spec lines 349-350). It refers to the Stackweaver batch worktree introduced at line 344. The design also creates two other kinds of worktree. One is a "fresh, clean, task-owned worktree of the primary consumer repository" for the `chore/maintenance-evidence-<run-id>` ref (lines 310-313). The other is "a fresh task-owned checkout/worktree" of a satellite or independent repository, made by fetch or clone (lines 323-326). It also applies "normal cleanup" to the satellite worktree (lines 334-335). authority.md:66 still says "Never create, remove, prune, reset or force-move a worktree". As worded, the amendment does not cover the evidence or satellite worktrees or their cleanup. An implementer must either leave authority.md contradicting these steps or widen the exception on their own judgement. The AC-05 proof exercises the evidence ref and satellite fixtures but checks no matching authority text.
PROPOSAL: State the exact authority.md amendment once, so it covers all three task-owned worktree kinds (batch, evidence and selected satellite or independent repository) and a fresh clone. Include their non-forced cleanup limits, and add an AC-01 or AC-05 contract assertion on that authority row.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Authority for selected follow-up work (report commit and publication rows); Design, Consumer parity checklist (Saved report and owner selection, Step 5.5 row)
EVIDENCE: Stackweaver says to "Commit the dated report itself with `[skip ci]` (it's `docs/internal/**`)" (agents/maintenance.md:325) and calls the report "the tracked, append-only history" (300-308). `[skip ci]` matters only when a commit is pushed. CLAUDE.md:171 says to "Push skip-eligible work separately for free", and CLAUDE.md:159 sends small verified changes "straight to `main`". The spec keeps the "report-only `[skip ci]` commit" (spec lines 217, 377). It also says "A local commit authorizes no push" (line 217), and remote publication of a report needs "Explicit publication authority for that artifact and destination" (line 222). The parity row does not say whether the existing flow pushes the report commit to main, or whether a scoped "just do it" preauthorization covers that push. If Stackweaver pushed it before, this is an unlisted change to a consumer behavior that the owner asked to keep usable as before. The source does not settle it either way.
PROPOSAL: Ask the owner whether the existing Stackweaver report commit is pushed to main under the current request or preauthorization. Record the answer as retained local policy or as an explicit intentional difference in the Step 5.5 parity row, and have the AC-04 or AC-07 fixture check it.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, Consumer settings and project procedures (`bot_authors`); Design, Collection and completeness
EVIDENCE: The settings table says `bot_authors` holds "Exact configured logins after normalization; default common dependency identities are Renovate and Dependabot" (spec line 177). Collection matches "normalized exact logins, including GitHub's `app/` and `[bot]` forms" (lines 404-405). The AC-02 proof tests "normalized configured identities" (line 611). The normalization rule and the default login strings are never stated. Stackweaver's sync author is `app/stackweaver-release-bot` (agents/maintenance.md:126). The supplied triage helpers have no existing `[bot]` or `app/` normalization to reuse (no match in plugins/vh-adlc/scripts/triage). Two implementations could disagree on whether a configured `stackweaver-release-bot` matches, which changes execution eligibility, not only inventory visibility.
PROPOSAL: State the normalization, for example stripping a leading `app/` and a trailing `[bot]` and then comparing case-insensitively, and list the exact default logins. Add matching and non-matching cases to the AC-02 fixture.

### R-7

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Consumer settings and project procedures; Design, Authority for selected follow-up work (report commit and publication rows); Test Plan, AC-04 and AC-05 (Private report/record publication variant)
EVIDENCE: The spec says the Stackweaver report push is allowed by consumer policy: "Under the owner-selected Stackweaver policy, an authorized sweep includes its dated report-only `[skip ci]` commit and push to Stackweaver main before dependency selection" (line 235), and "Other consumers retain the explicit-publication default." The AC-05 variant at line 646 expects "A generic sweep/local commit produces no push" but a Stackweaver sweep "with its retained report-publication policy commits and pushes ... with no repeat prompt". The same document forbids every mechanism that could tell those two cases apart. "A setting cannot grant permission" (lines 171-172). `project_procedure` "conveys no authorization by itself" (line 187). "A consumer policy describes how an authorized action runs; it does not grant authority on its own" (lines 219-220). The shared authority prose must not treat "a consumer file ... as new permission" (lines 246-247). authority.md:41 says "Saving or explicitly committing a local report grants no remote-publication or push authority". The v1 settings table (lines 177-188) has no report-publication field. The spec never defines an "authorized sweep". It also never says what the shared operation reads to find out that this consumer, and only this one, has the owner-granted push. An implementer has two choices. One is a consumer-declared publication switch, which these sentences forbid and which would let any consumer file grant a push to main. The other is no push at all, which loses the owner's R-6 decision.
PROPOSAL: Name the exact mechanism that carries the owner-granted report-publication permission, for example a named consumer-policy declaration that the shared authority text recognizes only for report-only artifacts on a declared branch. Amend lines 171-172, 187, 219-220, 246-247 and the authority.md:41 change so they state this narrow exception instead of contradicting it. Define "authorized sweep", and add a negative AC-04/AC-05 fixture in which a consumer without that declaration produces no push.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation (report-only worktree/ref paragraph); Design, Consumer parity checklist (Saved report and owner selection, Step 5.5 row)
EVIDENCE: The spec requires the report to be pushed from a fifth owned worktree: "Never push from the live/shared checkout ... Push only this report commit to Stackweaver main with normal fast-forward semantics" (lines 398-408). Stackweaver's hard rule says the opposite: "ship by fast-forwarding or cherry-picking onto `main` **from the main checkout** after full local verification" (stackweaver CLAUDE.md:138). For small direct-to-main changes such as a docs edit, it says to "bring only the verified change to an up-to-date `main` from the main checkout" (CLAUDE.md:159-166). loop.md:57 says local instructions win over central pages and every conflict must be reported. The owner chose commit and push, and asked that the procedure stay usable as before. The owner did not choose a new push route that bypasses the main checkout. The Step 5.5 parity row (line 433) and the intentional-differences paragraph (lines 440-449) do not list this conflict. AC-07 can therefore pass while a local hard rule is silently replaced.
PROPOSAL: Ask the owner whether the report should be published from the isolated report worktree, which is an intentional difference from CLAUDE.md:138, or brought onto main from the main checkout with explicit-path commits and staged-state preservation. Record the answer in the Step 5.5 parity row and check it in the AC-04 Stackweaver fixture.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer settings and project procedures (default report placement); Design, Analysis, dispositions and durable reports (living-report updates); Design, report-only worktree/ref paragraph; Test Plan, AC-04
EVIDENCE: A sweep "creates an uncommitted report" in the checkout's report directory (lines 155-156). For Stackweaver, the publishable commit is made in a separate worktree created "from freshly fetched consumer main" (lines 398-402). That worktree may be cleaned up once publication is verified (lines 411-413). The spec never says where the Stackweaver report file is first written. Suppose it is written in the live checkout and then copied. The untracked copy at `docs/internal/maintenance/<date>-dependency-sweep.md` then blocks Stackweaver's required sync, `git fetch` + `git merge --ff-only` (CLAUDE.md:148), once main contains the pushed file. After selection, the current run still receives header and dated outcome appends (lines 513-518, 529-531). Stackweaver keeps this report as "the tracked, append-only history" that the next run diffs against (agents/maintenance.md:300-316). The push permission covers only the pre-selection commit: "This is the sole pre-selection publication exception" (lines 409-410, 235). The spec does not say which checkout or copy receives post-selection appends, or whether they are committed or pushed. It also does not say how resume finds the current copy (lines 509-510, 534-535). The next run's history comparison can then read a published report that lacks the batch outcomes. AC-04 tests the pre-selection push but no later append.
PROPOSAL: State where the Stackweaver report is authored, and how the live checkout avoids an untracked copy that conflicts with the published path. Say where later appends and header updates are written, and whether they are committed or published under the owner's report decision or stay local. Add an AC-04 fixture that appends an outcome after publication, resumes the run and syncs the live checkout.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Context
EVIDENCE: Context line 76-77 reproduces the owner's Q4 answer word for word inside quotation marks: "adopt the shared review for authored repairs, keep bot-only batching as before and continue the loop with Copilot Opus 5.5". loop.md:93-96 says to restate an owner turn in your own edited words and not to paste its wording as a quotation, even inside quotation marks.
PROPOSAL: Restate the Q4 decision in the document's own words, as Context already does for the Q5 and R-1 decisions.

### R-8

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Standing report-publication authorization; Design, Consumer settings and project procedures (`project_procedure`); Test Plan, AC-05 (Private report/record publication variant)
EVIDENCE: Push authority depends on instructions that are "authoritative" and "already accepted by the owner" (spec lines 263-265). It applies "only after the owner-authorized consumer migration is adopted" (lines 276-277), and "A branch or packet under review cannot authorize publishing itself" (line 276). Line 284 says the operation checks repository, branch and path scope "against the actual checkout", and line 285 says "unadopted" instructions leave publication pending. The spec never says which copy of the declaration counts. It could be the invocation checkout's working tree, its HEAD, the main checkout's working tree or committed remote `main`. Stackweaver sessions normally run from feature worktrees (stackweaver CLAUDE.md:130). The invocation directory can therefore be the migration branch itself, or a worktree on an unrelated branch with different `agents/` or `.vh-adlc/maintenance.json` content. An uncommitted edit in the shared main checkout would also look identical to the adopted rule if the working tree is read. No observable check defines "adopted" or "already accepted by the owner" for Stackweaver or for other consumers (line 282). The AC-05 negative fixture for an "unadopted" declaration (line 708) therefore has no defined input or pass condition. Two implementations could disagree about whether a push to `main` is authorized.
PROPOSAL: Define one rule for the authoritative source. For example, read the declaration, its AGENTS/entry links and the settings only from the committed tip of the fetched default branch of the validated primary repository, and never from a working tree, feature branch or packet. Record that blob identity in the run journal. Add AC-05 fixtures where the declaration exists only in a feature worktree, only as an uncommitted main-checkout edit, or only on an unmerged branch, and require that each produces no push.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Stackweaver report placement, publication and continuation; Test Plan, AC-04 and AC-05
EVIDENCE: The procedure commits the report on local `main` in the shared main checkout (spec lines 450-457). It then says "On remote-main advancement, fetch/merge `--ff-only` only if safe; otherwise leave the bounded report commit pending until it can be reconciled under local rules. Never force push, rewrite history ... reset, stash" (lines 459-462). After the local report commit exists, a fetched `main` that has advanced has diverged, so `git merge --ff-only` always fails. The spec also forbids rebasing the commit or resetting the branch. "Reconciled under local rules" is undefined. Stackweaver's own branch guidance is `git rebase origin/main` (CLAUDE.md:172), and it syncs the shared checkout only with `git fetch` + `git merge --ff-only` (CLAUDE.md:148). Other sessions push directly to `main` from that checkout (CLAUDE.md:159-166), so the race is realistic. The result is a live shared `main` checkout left diverged with an unpushed commit. That blocks other sessions' ff-only syncs and this run's own later report updates, which must "Synchronize safely before an update" (line 468). The AC-04/AC-05 proof says only "Exercise upstream advancement" (line 708) and gives no expected end state.
PROPOSAL: State the allowed reconciliation for the run's own unpushed report-only commit after upstream advancement. Examples: a rebase of only that commit, permitted when it is the sole outgoing commit and needs no stash, or building the commit on freshly fetched `origin/main` before advancing local `main`. Otherwise, state the exact pending state and owner handoff that leaves the shared checkout usable. Give the AC-04/AC-05 upstream-advancement fixture that expected end state, and require that the main checkout is not left diverged without a reported handoff.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Stackweaver report placement, publication and continuation; Design, Authority for selected follow-up work
EVIDENCE: The spec says that when safe main-checkout authoring is unavailable, the run should "render a clearly pending draft only at an explicit external report-output path" (spec lines 446-448). A missing checkout, a divergence or a protection refusal leaves publication pending (lines 444-446). The owner decision places publication "before dependency selection" (Context lines 82-83, authority line 241). Stackweaver requires the saved report "Before merging/closing anything" (agents/maintenance.md:298-300). The spec does not say whether a pending draft or an unpushed report commit blocks owner selection and the preauthorized batch execution that line 136 otherwise allows. It also does not say how an external draft later becomes the tracked living report. Post-selection outcomes are appended "in this same tracked report" (line 465), and resume locates the report "via the journal and run ID" (line 471). When only an external draft exists, there is no tracked report to append to. Line 445 already rules out any repoint of another session's branch, so the draft path will occur in practice.
PROPOSAL: State whether pending report authoring or publication stops dependency selection and execution for Stackweaver, or lets it continue with the report marked pending. Define how a pending external draft is later imported into the tracked path under the same run ID, or superseded by a new run. Add AC-04 fixtures for both the draft-only and the committed-but-unpushed cases.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Context; Design, Authority for selected follow-up work (rows at lines 238 and 241); Design, Standing report-publication authorization; Design, Consumer parity checklist (Saved report and owner selection, Step 5.5 row)
EVIDENCE: The recorded owner answer covers committing and pushing the dated report-only `[skip ci]` change to main "before dependency selection" (Context lines 82-83). The authority table repeats that limit: "applies before dependency selection" (line 238) and "push to Stackweaver main before dependency selection" (line 241). So does the parity row: "pushes only those report artifacts to Stackweaver main before dependency selection" (line 495). The standing-declaration section and continuation section extend the same permission to "later status/outcome updates for the same run" (lines 271-272), and say "The owner's standing report permission covers separate report-only commit/push updates for that run" (lines 466-467). That would add repeated direct pushes to `main` during and after batch execution. It was introduced as the author's resolution of R-7 F-03, not as a recorded owner answer. review-protocol.md:77-78 requires judgement items to go to the owner rather than being answered by the author.
PROPOSAL: Ask the owner whether the standing report permission also covers post-selection outcome pushes, or whether those updates stay local or need their own request. Record the answer in Context, then make the authority rows, the Step 5.5 parity row and the standing-declaration section state the same scope.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-04, AC-05 and AC-07
EVIDENCE: An authorized sweep requires that no "read-only, draft-only, no-commit or no-push restriction" covers the report, and "The current request wins when more restrictive" (spec lines 261-265). The AC-05 publication variant tests generic, undelegated, unadopted and mismatched declarations, plus a positive adopted Stackweaver sweep (line 708). The AC-04 proof says only "Generic and unadopted declaration fixtures never push" (line 731). Neither proof includes an adopted Stackweaver declaration combined with a restrictive current request, such as analysis only, no commit or no push. That is exactly the case where the standing rule must yield. Separately, line 275 requires the migration review to "inspect that exact declaration and its instruction links". The declaration must be the section `Standing maintenance report publication`, linked from the local maintenance entry and the AGENTS route, with repository `michielvha/stackweaver`, branch `main` and path scope `docs/internal/maintenance/` plus named indexes (lines 268-274). The AC-07 proof checks parity rows, model, arguments, repositories, helper bytes and the two command passages (line 734). It does not assert the declaration's name, scope or links. AC-07 can therefore pass with a missing, wider or unlinked declaration.
PROPOSAL: Add AC-04/AC-05 negative fixtures in which an adopted declaration meets a request that forbids commit or push, and require no commit or push as each restriction specifies. Add AC-07 adapter assertions for the exact declaration section, its repository, branch and path scope with no wildcard, and its links from `agents/maintenance.md` and `AGENTS.md`.

### R-9

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Standing report-publication authorization; Design, Consumer batch mapping and worktree preservation; Design, Stackweaver report placement, publication and continuation; Test Plan, AC-04 and AC-06
EVIDENCE: The spec makes a "run journal" the record that resume and reconciliation depend on, but it never says where the journal lives, what format it uses, who owns it or how long it must last. The journal holds the publication basis (line 270), the default-branch commit, instruction paths and blob IDs (line 290), the evidence ref and both review bindings (line 406), and the batch branch and worktree names (line 436). It also holds the main-checkout identity, report path, run ID, last body digest and commit or publication receipts (lines 473-474). Resume "locates the report via the journal and run ID" and reconciles the prior commit and remote-containment receipts there before any retry (lines 504-506). The pending-draft import records its destination in the journal (line 521). The settings table defines no journal location: only `report_dir` and `history_dir` exist (line 196). The triage journal is an explicit controller file, `--journal "<run>/execution.json"` (references/triage.md:281), and this feature excludes the triage controller (spec line 120). Where the journal goes conflicts with other preconditions. If it sits in the main checkout, the own-commit rebase can never run, because the rebase requires "no staged/unstaged/untracked work" (line 485). If it sits in a task worktree, that worktree is never clean, so cleanup cannot remove it (line 441). The AC-06 proof resumes "the same scenario" (line 783). An implementation that keeps the journal in session memory could pass that test and still lose every receipt when a different session resumes.
PROPOSAL: Define the maintenance run journal: its location outside every source, report and evidence worktree (for example under the primary repository's Git common directory or a declared local state path), its required fields, how it is written atomically and how resume finds it by run ID. Make AC-04 and AC-06 resume from a fresh session or process that has only the persisted journal and Git state.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stackweaver report placement, publication and continuation (upstream-advancement reconciliation); covers (references/authority.md)
EVIDENCE: The spec allows "a narrowly scoped rebase of the run's sole own unpushed report-only commit onto fetched main, consistent with Stackweaver's local rebase guidance at CLAUDE.md:172". It also requires the change to "Amend shared authority's history-preservation rule" (lines 483-489). CLAUDE.md:172 covers something else: rebasing a branch before you open or merge a PR, to drop duplicate commits. For syncing the shared checkout, Stackweaver prescribes `git fetch` + `git merge --ff-only` (CLAUDE.md:148), and it treats the main working tree as live and shared (CLAUDE.md:130). The shared authority table requires "Separate approval for that exact action" for history rewrites (authority.md:22). The owner settled R-7 by keeping the existing main-checkout route, and settled Q6 with "the same safeguards". Neither decision granted a standing exception to the shared history-rewrite rule. The exception came from the author's answer to R-8 F-02, and it changes a shared permission for every consumer that has a standing declaration.
PROPOSAL: Ask the owner whether a run may rebase its own unpushed report-only commit without a separate approval each time, or whether upstream advancement should always end in the report-publication-pending handoff. Remove the CLAUDE.md:172 justification, or restate it accurately.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Stackweaver report placement, publication and continuation (report-publication-pending paragraph); Test Plan, AC-05 (Private report/record publication variant)
EVIDENCE: Under the spec, an unpushed or draft-only Stackweaver report blocks "dependency selection or any preauthorized dependency execution, merge or closure until the dated report is tracked and its initial publication is verified". The spec adds that "A restrictive current request deliberately leaves this prerequisite unmet" (lines 511-516). The AC-05 variant allows a no-push request to make the local report commit but no push (line 758). Taken together, any Stackweaver request that withholds the report push also blocks dependency selection and preauthorized work for the whole run. So does an ordinary blocker on the shared checkout, such as another session's outgoing main commit or a missing main checkout (lines 465-467). The existing procedure has only two requirements: save and commit the report, and wait for the owner's choice or a preauthorized scope (agents/maintenance.md:296-325). It never makes a push a condition of selection. The owner decision sets the order for an authorized sweep. It does not say that a restricted or blocked publication must stop dependency work. The author added that rule when answering R-8 F-03, and it removes a flow that Stackweaver could use before.
PROPOSAL: Ask the owner whether a pending report publication, or one the owner restricted, should stop dependency selection and execution, or let them continue with the committed or draft report clearly marked as pending publication. Record the answer in the Step 5.5 parity row and test both forms.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Standing report-publication authorization; Design, Consumer settings and project procedures (`project_procedure`); Test Plan, AC-05
EVIDENCE: The shared mechanism is described only through the Stackweaver instance: "a section named `Standing maintenance report publication`, linked from the local maintenance entry and AGENTS route" (lines 273-274). For other consumers it says only that they "can establish equivalent standing instructions" and that the operation checks "the declared repository, destination branch and path scope" (lines 302-306). Adoption means "present and linked" in the committed tree, read from "its AGENTS route, maintenance entry, referenced project procedure" (lines 286-291). A generic consumer has no defined maintenance entry, and `project_procedure` is optional (line 197). The spec never states the generic contract: which heading or marker identifies a declaration, which fields it must declare (repository, branch, explicit report and index paths, timing for the initial publication and same-run updates), or which link chain counts as linked. The AC-05 negatives for "undelegated, unadopted or mismatched" declarations (line 758) therefore have no shared definition to test against. Two implementations of `references/maintenance.md` could accept different texts as a valid delegation.
PROPOSAL: State the generic declaration contract once in the shared procedure: identifying heading, required fields, the link chain from AGENTS.md through the settings' `project_procedure`, and what counts as ambiguous or mismatched. Make the Stackweaver section an instance of that contract, and derive the AC-05 negative fixtures from each required element.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design, Standing report-publication authorization (path scope); Design, Stackweaver report placement, publication and continuation; Test Plan, AC-04
EVIDENCE: Under the standing grant, a run publishes its dated report together with "required generated maintenance indexes" (lines 276-279), and every later update must "Keep generated report indexes consistent" (line 504). The report is written in the shared main checkout (line 471). Stackweaver says many sessions use that working tree at once and treats it as live and shared (CLAUDE.md:130). Its indexes are `## Contents` tables generated by `scripts/build-docs-index.js` (CLAUDE.md:281), which is run after a doc is written (CLAUDE.md:291). The generator is not in this packet. If it indexes the working tree, a rebuild in the main checkout also lists other sessions' untracked or uncommitted docs. The spec checks the index paths and the outgoing diff (lines 464, 475-476), but it never requires the regenerated index delta to contain only entries for this run's report. A pushed index could therefore expose or reference unrelated unpublished work while every path check passes.
PROPOSAL: Require the committed index change to contain only entries for this run's report, or generate it from the committed tree plus the report, and leave publication pending otherwise. Add an AC-04 fixture that puts an unrelated untracked internal doc in the main checkout and requires that no index entry for it is committed or pushed.

### R-10

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Standing report-publication authorization; Design, Stackweaver report placement, publication and continuation; Test Plan, AC-05
EVIDENCE: The R-9 change made the declaration generic. It is a heading, a field table and an AGENTS-to-settings-to-procedure link chain (spec lines 279-298). Spec lines 330-333 say other consumers "can establish equivalent standing instructions" and that "the operation has no Stackweaver identity hardcoded". The only procedure that publishes the report is labelled as Stackweaver's own local rule: "Follow Stackweaver's existing main-checkout publication rule" (line 500), justified by Stackweaver CLAUDE.md:138,159-166 (Context lines 85-86). For a generic sweep the spec only creates "an uncommitted report" in the invocation checkout (lines 168-170). The declaration fields (lines 283-289) say nothing about where to author the report or which checkout to push from. A non-Stackweaver consumer can adopt a valid declaration with `initial_publication: commit-and-push-before-selection`, and the spec then defines no checkout, sync or push route for it. The shared operation cannot recognise Stackweaver by identity, so an implementation has two options. It can apply the main-checkout ff-only route to every declaration, which turns a local Stackweaver rule into a shared default. Or it can publish nothing for any consumer except one it cannot name. The AC-05 publication variant (line 841) tests only the Stackweaver positive case.
PROPOSAL: State which publication route the shared operation runs for any valid adopted declaration. One option is to make the main-checkout ff-only procedure the declared route, selected by an explicit declaration field or the project procedure, so it does not depend on Stackweaver's identity. Then add an AC-05 positive or negative fixture for a non-Stackweaver consumer with a valid declaration.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Stackweaver report placement, publication and continuation (diverged push and same-run updates); Test Plan, AC-04
EVIDENCE: When remote main moves ahead of the run's local report commit, the spec stops the push and leaves the shared main checkout diverged until a separately authorized reconciliation (lines 522-530). A committed but unpushed report still meets the merge/closure prerequisite, and selection and preauthorized work continue (lines 547-555). So batch outcomes keep arriving while the checkout is diverged. The spec also says "Synchronize safely before an update" (line 538), which ff-only cannot do once the branch has diverged. It then says "Pending outcomes append to the same report and remain visibly local until publication succeeds" (lines 563-564). It never says whether those appends are committed as more own commits on the diverged shared `main` (each one enlarges the owner's reconciliation), left as uncommitted edits in the live shared working tree (CLAUDE.md:130), or held outside it, for example in the journal or an external draft. It also does not say whether the "Synchronize safely" requirement blocks them. AC-04 requires "both pending-report forms ... through eventual publication and continued same-run updates" (line 864; also lines 564-565) without an expected state for the diverged case. Two implementations could pass while leaving the shared checkout in different states.
PROPOSAL: Define where a same-run outcome goes, and whether it is committed, while the initial report commit is diverged or unpushed. Say how the safe-sync rule applies in that state. Give the AC-04 diverged fixture that expected end state, including the main-checkout working tree and the count of local own commits.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Analysis, dispositions and durable reports (task record links); Design, Consumer batch mapping and worktree preservation (evidence ref); Test Plan, AC-04 and AC-05
EVIDENCE: The published sweep report "links the bounded task records or feature specs" (spec lines 724-726). Authored-repair records are committed only on the local branch `chore/maintenance-evidence-<run-id>`, which "stays local unless the owner separately authorizes publication", and "Stackweaver's report-only push permission never covers this evidence ref" (lines 427-437). The standing grant publishes the report and its later outcome updates to Stackweaver `main` (lines 252, 535-537). A Markdown link from that report to a record path such as `docs/internal/maintenance/<slug>.md` therefore points at nothing on `main` or on any other host. Stackweaver's `make docs-audit` scans for dead links and its weekly drift agent applies safe fixes (CLAUDE.md:311). The next sweep, which reads the tracked living history (line 543), cannot resolve the reference either. The spec defines no reference form for an unpublished record, and no test checks what the published report says about one.
PROPOSAL: State how a published report refers to a local-only task record. For example, use a non-link reference that gives the run ID, the evidence ref name and the record_target commit, marked as unpublished, and add a link only after a separately authorized record publication. Add an AC-04 or AC-05 assertion that a published report has no repository link to a record on the evidence ref only.

### R-11

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Declared default-branch report publication and continuation; Design, Consumer settings and project procedures (report placement); Test Plan, AC-04 and AC-05 (Private report/record publication variant)
EVIDENCE: Under the declared route, the run writes the report and commits it on local `main` in the shared main checkout (spec lines 522-531). The AC-05 variant says "no-push permits the otherwise authorized local commit but no push" (line 886). When a push is pending, "The existing one unpushed own report commit stays unchanged" on that checkout (lines 588-589). Selection and preauthorized work continue during that time (lines 558-562). Stackweaver says several sessions work in the main working tree at once and treats it as live and shared (CLAUDE.md:130). Other sessions bring verified changes to `main` from that checkout and push directly (CLAUDE.md:159-166). The rules forbid mixing a `[skip ci]` commit into a push that contains code (CLAUDE.md:171). Only the PR path checks `origin/main..HEAD` first (CLAUDE.md:172). So under a no-push request, the next ordinary push from another session publishes this run's report-only `[skip ci]` commit, possibly together with code. The current request's restriction should win (line 277), but the design leaves the restricted artifact where another session's routine push publishes it, and the pending handoff does not warn other sessions about it. The fixture's "no push" condition can pass while the real shared checkout does not keep the restriction. Report placement is also undefined for the restricted forms. A read-only request with an adopted declaration must produce no commit (line 886), but authoring in the main checkout would write to it. The fallback draft needs "an explicit external report-output path" (lines 518-519), and the spec defines that path's source only for trials (`--report-output`, line 171), not for a live run that supplied none.
PROPOSAL: For each restricted or pending form (read-only, no-commit, no-push, and a pending push before or after selection), state where the report lives and in what state, so that another session's ordinary main push cannot publish or carry a restricted report. Also state where the external draft path comes from when the invocation supplied none. If keeping an unpushed run commit on the shared main checkout is intended, raise that trade-off with the owner and add AC-04/AC-05 assertions for the chosen state.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design, Consumer batch mapping and worktree preservation (generated index paragraph); Design, Declared default-branch report publication and continuation
EVIDENCE: Line 499 says "Apply only a verified report-attributable index delta, preserving unrelated index edits". Line 515 says "refuse overlapping report/index edits". Lines 527-528 require "an explicit-path commit". A path-limited commit records the whole working-tree content of each named file. If a declared index file already has another session's uncommitted edit, line 499 suggests the run applies its delta and keeps that edit. The commit would then publish that edit. Line 515 instead refuses. AC-04 seeds only an unrelated untracked document (line 500 and the AC-04 proof), not an uncommitted edit to the index file itself.
PROPOSAL: State that a pre-existing staged or unstaged change in any declared index path leaves publication pending without modifying that file, and reword line 499 to match. Add an AC-04 fixture with such an edit and require its bytes unchanged and absent from the committed and pushed index.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Test Plan, AC-07; Design, Consumer parity checklist (Release-bot and stalled-sync incidents row)
EVIDENCE: Only exact `bot_authors` logins make a PR eligible for action. Other bot or app accounts, and matches of the legacy filter, become inventory gaps with no automatic eligibility (spec lines 198-199 and 660-662). Stackweaver sync PRs are authored by `app/stackweaver-release-bot` (agents/maintenance.md:125-126; sync-api.yml:79). The parity row requires "normalized release-bot discovery" (line 616). The AC-07 proof asserts "all configured repositories/exclusions" (line 912) but does not assert that Stackweaver's `bot_authors` includes the release-bot identity. An adapter that keeps only the default `renovate` and `dependabot` would still show stalled sync PRs, but only as gaps. AC-07 would pass while those PRs lose their configured eligibility for the existing superseded-closure flow.
PROPOSAL: Add an AC-07 assertion that Stackweaver's settings list `stackweaver-release-bot`, together with Renovate and Dependabot, as configured `bot_authors`, and keep the legacy terms in `bot_inventory_terms`.

### R-12

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Declared default-branch report publication and continuation (restricted placement and main-checkout precondition fallback); Design, Consumer parity checklist (Step 5.5 row); Test Plan, AC-04 and AC-05
EVIDENCE: The R-11 fix sends a Stackweaver run under a `no-push` request to a private uncommitted draft (spec lines 510-513). It does the same when the main checkout has an "unrelated outgoing commit, divergence or known protection refusal" (lines 521-525). A draft "has not met the retained report commit prerequisite for merge/closure" (lines 524-525 and 599-601). So any of these states now blocks every merge and closure for the run, including preauthorized "just do it" scope (agents/maintenance.md:30-32,36-37). The source procedure saves the report, commits it with `[skip ci]` and then waits for the owner's choice or a preauthorized scope (agents/maintenance.md:296-325). It never makes a push, a clean local main or the absence of another session's outgoing commit a condition of committing the report or of later merges. CLAUDE.md:148 requires ff-only only for syncing. Under the source flow, a request that withholds only the push could still commit locally and merge the approved PRs. Under the spec it cannot, although line 601-602 says a restriction limits only the action classes it names. R-11 F-01 asked the author to raise this trade-off with the owner if needed. The author picked the private-draft option instead. That adds a merge/closure gate tied to main-checkout and publication state, which is the kind of author-introduced restriction R-9 removed.
PROPOSAL: Ask the owner to choose. Option A: under no-push, or when only unrelated outgoing commits block the push, keep the report-only commit in the local main checkout, as the source flow does, with the pending warning, so merges and closures stay available. Option B: keep the private draft and accept that merges and closures are blocked until the draft is imported. Record the answer in the Step 5.5 parity row and test the chosen form in AC-04 and AC-05.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Declared default-branch report publication and continuation (pending-push warning); Scope; Test Plan, AC-07
EVIDENCE: Spec lines 561-565 say that the retained consumer main-push instructions "require inspecting the complete outgoing range, detecting pending Maintenance-Run commits and stopping any mixed report/code push". They then say to "Add that explicit preservation reminder to the local maintenance entry and CLAUDE.md CI-economy rule during migration". AC-07 asserts this reminder (line 948). The current rules do not say this. CLAUDE.md:171 forbids mixing a `[skip ci]` commit with code in one push. Only CLAUDE.md:172 requires checking `git log origin/main..HEAD`, and only before opening or merging a PR, not before a direct main push. The new text would therefore add an obligation to every Stackweaver session's ordinary main push, not only to maintenance. Scope line 124 puts changes to CI policies out of scope, and the target section is CLAUDE.md's "CI Economy (CRITICAL)". CLAUDE.md:198 says a spec that needs to change that file raises it as an Open Question rather than making a silent change. No owner decision covers this repo-wide addition. The owner's instruction was to keep local procedures working as before.
PROPOSAL: Correct the sentence so it does not present the outgoing-range check as an existing rule for direct main pushes. Then either limit the reminder to the maintenance entry and the pending handoff, or raise the CLAUDE.md CI-economy change as an Open Question before AC-07 asserts it.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer settings and project procedures (report placement); Design, Standing report-publication authorization; Design, Analysis, dispositions and durable reports; Design, Authority for selected follow-up work
EVIDENCE: Spec line 338 says "Generic sweeps with no declaration remain uncommitted", and lines 526-527 say the ordinary generic sweep without a declaration "remains the previously declared uncommitted checkout report". The action table, however, allows a report commit with "an owner request or an existing explicit consumer rule" (line 247). Lines 795-796 say to leave reports uncommitted "unless requested or the local policy already explicitly requires their scoped commit". For a consumer with no standing declaration that asks for a commit or has a commit rule, the spec does not say whether the commit is allowed, or which checkout and branch it goes to. The main-checkout route applies only to an adopted declaration (line 530), and the invocation checkout may be on a feature branch, which authority.md:59-66 protects. One implementation could refuse an owner's explicit commit request and another could commit on whatever branch is checked out. AC-04 tests only the uncommitted no-config case and the Stackweaver declaration.
PROPOSAL: State one rule for a requested or policy-required report commit without a declaration: whether it is permitted, and the destination checkout and branch along with the preservation checks that apply. Reword line 338 and lines 526-527 to match, and add an AC-04 fixture for that case.

### R-13

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Local report commits and declared publication (post-publication same-run updates); Test Plan, AC-04
EVIDENCE: Spec lines 519-521 say that when the owner requests a report commit, or the consumer requires one, the agent should "prepare it in a fresh task-owned primary-repository worktree on `chore/maintenance-report-<run-id>-<step-id>`". Lines 529-530 make that candidate "the authoritative working report until publication". After publication, lines 586-591 say "the journal records the tracked report in the owning main checkout as authoritative; the preparation worktree/ref is a frozen receipt", and that "Later same-run outcomes and permitted status scalars use report-only updates ... each with safe sync, prefix/digest comparison, applicable checks and normal hooks". The spec never says where those later updates are authored and committed. One reading edits and commits the report directly in the live shared main working tree, which stackweaver CLAUDE.md:130 calls live and shared. The other reading prepares a new report-role candidate per step under lines 519-524 and then fast-forwards it. Under the first reading, the index-snapshot and dirty-index rules (lines 494-502) and the R-12 isolation both apply only to the first commit. The AC-04 proof says only "Append a post-publication outcome, commit/publish only that report update", so both implementations pass.
PROPOSAL: State which route each post-publication same-run update uses: a fresh report-role candidate fast-forwarded from the main checkout, or a direct commit in the main checkout. Give its preconditions. Make the AC-04 post-publication fixture assert the chosen route, including main-checkout working-tree and index bytes.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Analysis, dispositions and durable reports (same-day naming); Design, Local report commits and declared publication (candidate preparation and main advancement)
EVIDENCE: Lines 761-763 say "Use `YYYY-MM-DD-dependency-sweep.md` for the first report and `YYYY-MM-DD-dependency-sweep-<run-id>.md` for a later run on that date. The report helper creates new files exclusively." Under the R-12 route, each candidate is built in its own fresh worktree "from the recorded fetched default-branch commit" (lines 520-521). A no-push or blocked candidate stays only on its owned ref (lines 532-536). A second same-day Stackweaver run that starts while the first report is still unpublished therefore sees no file at the unsuffixed path in its own tree, so both runs create `YYYY-MM-DD-dependency-sweep.md`. When the first run publishes, the second run's replay "at the new default base" (lines 564-568) hits the same path. "A concurrent report conflict ... leaves publication pending", and the spec defines no rename, because "Earlier runs remain byte-identical" and run identity is fixed. Before R-12, both runs wrote in the one shared checkout, so exclusive creation caught the clash. The spec does not define which namespace (committed default branch, other runs' journals in the shared Git common directory, or other report refs) decides "first report on that date". The AC-04 same-day fixture (line 926) does not cover concurrent isolated candidates.
PROPOSAL: Define the uniqueness check for the dated name across the committed default branch, other runs' journals in the Git common directory and existing report-role refs. Alternatively, give the later run a suffix once another same-day run exists, published or not. Add an AC-04 fixture with two same-day isolated candidates where the first publishes before the second.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer settings and project procedures (default report placement); Design, Local report commits and declared publication
EVIDENCE: Lines 168-170 say "A generic sweep creates an uncommitted report there", in the invocation checkout's `.vh-adlc/reports/maintenance/`. Lines 519-530 then prepare any requested commit in a separate worktree and require that other copies are "frozen receipts or explicitly marked drafts, never competing untracked files in the invocation tree". The resume rule at lines 596-601 covers only an external draft. The spec does not cover an owner who requests a commit or publication after the default in-checkout report was saved. In that case the untracked copy either stays at the same path, which contradicts line 530, or must be removed without any stated authority. If the invocation checkout is also the default-branch checkout used for publication, `git merge --ff-only` to the candidate refuses to overwrite that untracked file. Lines 558-560 then classify it as an overlapping report edit and leave publication pending. The AC-04 generic commit fixture starts from "an unrelated dirty invocation branch" and never seeds the run's own earlier uncommitted report.
PROPOSAL: Define how an in-checkout uncommitted generic report becomes the isolated candidate, including what happens to the original untracked file and with what authority. Add an AC-04 fixture where the commit or publication request follows a saved in-checkout report, and assert the final invocation-tree state and a successful fast-forward.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Local report commits and declared publication; Test Plan, AC-04 and AC-05 (Private report/record publication variant)
EVIDENCE: Lines 549-551 say "Publication requires the adopted standing declaration or a current explicit request naming the artifact, repository and destination. The `default-branch-checkout-ff-only` route below is selected explicitly by either authority". Line 315 also says a consumer without a declaration "needs an explicit current publication request naming artifact and destination". The tests cover only declarations and negatives. AC-04 says "Generic and unadopted declaration fixtures never push", and the AC-05 variant says "A generic sweep/local commit or an undelegated, unadopted or mismatched policy declaration produces no push"; its only explicit-request positive is "A separately approved record publication", which concerns a task record, not the report. No fixture runs a generic consumer with no declaration and an explicit current report-publication request. An implementation that never publishes without a declaration, or one that publishes without checking that the request names the artifact, repository and destination, passes both rows.
PROPOSAL: Add an AC-04 or AC-05 positive fixture: a generic project with no declaration and an explicit current request naming the report, repository and default branch, with one report-only push through the main-checkout route. Add negatives where the request omits or mismatches the artifact or destination, and require no push.

### R-14

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05 authority variants (Private report/record publication); Design, Local report commits and declared publication; Test Plan, AC-04
EVIDENCE: Spec lines 564-568 say that when main advanced after candidate preparation, the run should "build a fresh report-only candidate at the new default base in another uniquely named report-role worktree/ref", replay the report, regenerate only its attributable index delta, record old and new bindings, keep the old ref as a frozen receipt, and then publish. Only "A concurrent report conflict or repeated advancement leaves publication pending". Under the R-12 route, an own local report commit sits on the isolated ref, not on local main (lines 532-536). The AC-05 variant at line 939 still expects the older outcome: "Exercise upstream advancement with an own local report commit (explicit pending handoff naming both tips and unchanged history, no rebase/reset/rewrite)". For a pre-transfer candidate, that expectation contradicts the current design. The rebuild path itself (fresh candidate, single publication, retained old ref, attributable index regeneration, then pending on a second advancement or report conflict) appears in neither the AC-04 nor the AC-05 proof. An implementation that always stops with a pending handoff on advancement would pass line 939. That implementation would never publish in a busy Stackweaver main, where bump-core and other sessions advance main often.
PROPOSAL: Restrict the line 939 pending-handoff expectation to the after-transfer divergence case. Add an AC-04 or AC-05 fixture where main advances before transfer: assert one rebuilt candidate at the new base, the old ref retained unchanged, exactly one published report commit with only attributable index entries, and a pending result when a second advancement or a report conflict occurs.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer settings and project procedures (history_dir); Design, Analysis, dispositions and durable reports (security comparison); Design, Standing report-publication authorization (path scope); Test Plan, AC-04
EVIDENCE: The report must compare each repository and surface with "the previous complete comparable observation" and may compare resolved identities "only when both observations are successful complete lists with the same scope" (lines 806-811). The settings define `history_dir`, which defaults to the report directory (line 202), but nothing says what is written there, in what format, or how a later run reads it. The trial packet supplies "prior per-surface observations for history comparison" (line 900), but no live-run source is defined. The journal that holds completeness is Git-private and host-local (lines 721-727, 754-755), so a later sweep on another host or checkout cannot read it. If history is a separate file, the standing grant does not cover it, because the grant applies only to the run's report and the explicit `index_paths` (lines 287-288). The source flow compares against the previous dated report's `## Security alerts` section (agents/maintenance.md:315-316; security-alert-maintenance.md:122-123). Pre-migration reports came from collection that discarded errors with `2>/dev/null` (agents/maintenance.md:181-185), so they carry no completeness markers. The spec does not say whether the first migrated run treats them as comparable or as unknown, which decides whether newly resolved alerts are shown. The AC-04 proof says only "comparable prior run".
PROPOSAL: Define the persisted observation record a later run reads (for example, a parseable per-repository and per-surface block in the published report giving status, completeness, scope and alert identities) and state whether a separate `history_dir` artifact exists and whether it falls within the publication scope. State how pre-migration Stackweaver reports are classified. Add an AC-04 fixture that compares against a published prior report read from a fresh checkout without the journal, plus one that uses a legacy-format report.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter covers; Design, Collection and completeness
EVIDENCE: The design reuses "existing contained-path, pagination and owned-client helpers" and scopes shared utility changes to that reuse (lines 680-682). The covers list includes `scripts/triage/github.ts`, `settings.ts` and `owned-process.ts` (lines 15-17), but not `scripts/triage/collect.ts` or `scripts/triage/types.ts`. `githubReader` imports `Reader` and `ReadRequest` from `./collect` and `Settings` from `./types` (github.ts:1-4). It accepts only the kinds issues, closed pulls, labels, comments and events, for the single `config.repository`, and throws `unsupported-read-request` for any other kind (github.ts:54-63). That union is declared at collect.ts:6. Adding open-PR, file, check, alert, dashboard or organization reads through `github.ts` therefore means changing `collect.ts`, and supporting more than one repository means changing the triage `Settings` type in types.ts:2. Neither file is covered, so a change there would escape `fresh` staleness and `feature_tree_clean`, even though the Design says triage callers and tests must be preserved.
PROPOSAL: Add `plugins/vh-adlc/scripts/triage/collect.ts` and `plugins/vh-adlc/scripts/triage/types.ts` to covers. Otherwise, state that maintenance reuses only `parsePage` and similar pure helpers and adds no new kinds to `githubReader` or `ReadRequest`, and remove `github.ts` from covers if it will not change.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Consumer batch mapping and worktree preservation (generated index paragraph); Test Plan, AC-04
EVIDENCE: Lines 494-499 say that a committed index delta "may introduce or update only entries attributable to this run's report; it cannot include an unrelated untracked/uncommitted document, leak its title/path or publish other index corrections". They also require using the consumer's generator, never hand-editing Contents tables, and leaving publication pending if the generated delta "contains any unrelated entry". R-9 F-05 asked only for protection against other sessions' unpublished documents. A committed document already on main that some earlier commit failed to index is not private. Even so, generating from the committed tree plus the report would add its entry, and the ban on hand edits means that entry cannot be removed. Every initial publication and later same-run update would then stay pending until someone else repairs the index. Stackweaver's source flow regenerates indexes with its generator and commits the report (CLAUDE.md:281,291; agents/maintenance.md:325), and it has no such stop. No owner decision selected this restriction, and AC-04 has no fixture for committed-index drift.
PROPOSAL: Ask the owner whether entries the generator derives only from content already committed on the default branch may be published alongside the run's own entry, with untracked and uncommitted content still excluded. Then add an AC-04 fixture with drift from a committed but unindexed document that asserts the chosen outcome.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria, AC-04; Design, Local report commits and declared publication
EVIDENCE: AC-04 says "Each sweep preserves a durable, uniquely named report" (line 948). Lines 516-517 say "a prohibition on all filesystem writes produces chat-only findings and no persisted run". Such a sweep cannot meet AC-04 as written, so an implementation review must either mark a correct restricted run as not met or read an exception into the criterion that it does not state.
PROPOSAL: Qualify AC-04 so that it applies to sweeps permitted to write local artifacts, and state that a sweep forbidden from all filesystem writes returns chat-only findings without claiming a saved report.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design, Consumer parity checklist and intentional differences; Design, Authority for selected follow-up work (dispatch row)
EVIDENCE: The maintenance playbook names "the squash-merge `[skip ci]` leak guard ... in `CLAUDE.md`" as related procedure (agents/maintenance.md:418). For a leaked merge, CLAUDE.md:273 instructs recovery: dispatch `GitVersion Tag`, then re-run the affected `sync-*` workflows. The spec's dispatch row requires "Explicit owner authority covering that live action" (line 253). Line 264-265 says an ordinary consumer file is not new permission. The parity table maps the leak guard (Step 6 row, line 658) but not this recovery. AC-07 requires an owner decision for every unmapped or changed behavior (line 965), so the gap would surface only at adoption.
PROPOSAL: Add a parity row for the CLAUDE.md:273 recovery dispatch and ask the owner whether it keeps its existing standing instruction or now needs explicit per-action approval.

### R-15

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05 authority variants (Private report/record publication); Design, Local report commits and declared publication
EVIDENCE: The AC-05 variant (spec line 971) says: "After-transfer divergence instead yields an explicit handoff naming tips with unchanged history and no rewrite, and unrelated local changes or other outgoing commits (no rewrite), protection refusal, unrelated staged work, pre-existing outgoing main commits and ambiguous successful push/restart; only observed remote containment completes publication". This sentence groups cases that the Design treats differently, and it gives most of them no expected end state. In the Design, unrelated outgoing commits are pre-transfer blockers that leave "the candidate on its isolated local ref with main unchanged" (lines 562-568, 540-541). Unrelated nonoverlapping staged work is preserved, and publication goes ahead: "preserving unrelated nonoverlapping state" (lines 575-576). The AC-04 proof says the same: "unchanged main working/index bytes before transfer and preserved unrelated bytes after fast-forward" (line 994). Protection refusal is listed as a pre-transfer blocker that keeps main unchanged (lines 541, 565-566). However, the Design fast-forwards local main before the push (lines 575-577), and a "rejected or uncertain push after transfer" leaves one pending report commit on shared main (lines 580-585). The spec never says how a protection refusal is detected before transfer. One implementation could check protection first and keep main unchanged. Another could find the refusal at push time and leave a `[skip ci]` report commit on shared main. Both match the current row, and an implementation that refuses on unrelated staged work instead of publishing would also pass.
PROPOSAL: Rewrite the variant so each case has its own observable end state. Unrelated outgoing commits and divergence before transfer should produce zero report commits on main and the candidate kept on its ref. Unrelated nonoverlapping staged work should produce one publication with those bytes preserved. Say whether a protection refusal must be detected before transfer, and how, or whether it is the after-transfer pending case. Assert the chosen state in AC-04 and AC-05.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Authority for selected follow-up work (lifecycle/authority amendments); Design, Standing report-publication authorization; Test Plan, AC-01
EVIDENCE: Generic lifecycle intake routes dependency or security sweeps to the new operation (spec lines 158, 165). An "authorized sweep" is any current owner request to run maintenance in the validated repository (lines 280-284), and it may then use the standing report push. The current shared rules say the opposite for selected operations. authority.md:26-30 says: "A lifecycle-selected operation inherits only the underlying task's authority. Its direct-invocation publication grant does not transfer through selection: keep authorized document work local and stop before a required push unless the owner separately requested publication." lifecycle.md:66 says "Publication authority comes from the owner's request, not from selecting an operation." The Design lists the shared text it amends: a new intake row, the Resume row, the Ship/live row, the bounded-maintenance paragraph, an authority table row, the Merge/tag/release row and the authority.md:41 local-report paragraph (lines 264-276). It does not amend authority.md:26-30 or lifecycle.md:66-72. So it is undefined whether a Stackweaver request such as "use vh-adlc to run a dependency sweep", which reaches the operation through intake, pushes the report under the standing declaration or stops before the push. The AC-01 proof (line 991) tests only the routing row.
PROPOSAL: State whether a sweep selected through generic intake can use the standing report-publication declaration. Amend authority.md:26-30 and lifecycle.md:66-72, or say explicitly that they continue to block it. Add an AC-01 or AC-05 fixture for an intake-selected sweep that asserts the chosen push or no-push result.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-04, AC-05, AC-07
EVIDENCE: The owner selected positive report publication for Stackweaver. An authorized sweep commits and pushes its dated report-only `[skip ci]` change to main before dependency selection and publishes later same-run updates (Context lines 84-94; Step 5.5 parity row, line 663). No criterion states that end state. AC-04 covers only a durable local report (line 980). AC-05 says remote actions "stay within owner and consumer permissions" (line 981), and an implementation that never pushes meets that limit. AC-07 lists only "command/model/arguments, repository facts, batching and release checks, and existing approved satellite-helper behavior" (line 983). The positive Stackweaver push appears only in Proof text (lines 971, 994, 997). feature-documents.md:84 requires criteria to "State the end state", and an implementation review grades `met` against the criterion text (feature-documents.md:179-185). A build that drops the owner-selected report push, or the retained CLAUDE.md:273 leak recovery that the dispatch row maps (line 261), could still be graded as meeting every criterion as written.
PROPOSAL: Add the retained Stackweaver report-publication behavior, initial and same-run, to the AC-07 end state (or a new criterion): an authorized Stackweaver sweep publishes only its report artifacts through the retained main-checkout route, and other consumers publish only on an explicit request or an adopted declaration. Also name the scoped leak recovery among the retained behaviors.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, Analysis, dispositions and durable reports (legacy history); Design, Consumer parity checklist (Security reconciliation and Step 5.5 rows)
EVIDENCE: The spec says that legacy Stackweaver reports are "historical unverified counts, not comparable complete alert lists: show them as unverified and establish a new measured baseline, without declaring newly resolved/missing alerts from the legacy omission" (lines 840-842). Stackweaver's procedure requires every run to "Diff against the previous sweep's section so newly-appeared and newly-resolved alerts are visible" (agents/maintenance.md:315-316; security-alert-maintenance.md:122-123). Under the spec, the first migrated run loses that diff. Neither the Security reconciliation parity row (line 658) nor the Step 5.5 row (line 663) lists this as an intentional difference. Context records no owner decision on it. The author chose it while fixing R-14 F-02. Caution is justified, because the old collection discarded errors with `2>/dev/null` (agents/maintenance.md:181-185). Even so, a diff labelled as unverified would keep the existing visibility.
PROPOSAL: Ask the owner whether the first migrated run should show a diff against the legacy section, explicitly labelled unverified, or no diff. Record the answer in the parity table.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Frontmatter covers; Design, Collection and completeness; Scope
EVIDENCE: The Design reuses "existing contained-path, pagination and owned-client helpers" (lines 688-689), and covers lists `scripts/triage/github.ts`, `collect.ts`, `types.ts`, `settings.ts` and `owned-process.ts` (lines 15-19). However, github.ts:3 imports `MutationFailure` from `./execute`. execute.ts:1-9 in turn imports `controller-authority`, `execution-history`, `execution-lock` and `report`, and report.ts:7 imports `verification`. Reusing `parsePage` or `githubReader` from github.ts therefore loads triage's execution and controller-authority graph into the maintenance collector. None of those files is covered, so a change there could affect maintenance without making its reviews stale. Scope also excludes "importing triage's managed publication controller into maintenance" (lines 133-134).
PROPOSAL: Move the reused read-only helpers into a module that does not import `./execute`, and cover that module. Alternatively, add the transitively imported triage files to covers and say that the import is not a controller dependency.

### R-16

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Design, Local report commits and declared publication; Design, Report-publication cases for AC-04/AC-05; Test Plan, AC-04
EVIDENCE: Spec line 565-570 says the `default-branch-checkout-ff-only` route is chosen by either authority, including a generic consumer's explicit publication request, and pushes "from the owning main checkout". Line 578 says to "Locate that checkout through Git metadata, never switching another session's branch". The only text that might cover a repository with no such checkout is line 549-550: "The same isolation applies when main is missing, diverged, dirty on report/index paths". "Main is missing" can mean a missing local default branch or no worktree with the default branch checked out. A generic project whose only checkout is on a feature branch hits the second case, and the spec forbids switching that branch. The Report-publication cases table (lines 1004-1019) covers a "Generic explicit report publication" positive (line 1007) but has no row for a repository with no default-branch checkout. An implementation could stop with publication pending, or could push the candidate directly from the report-role worktree. Both readings match the current text, and only the second departs from the owner-settled R-12 rule that publication moves the change to the main checkout and pushes from there.
PROPOSAL: State that when no worktree has the validated default branch checked out, the candidate stays on its isolated ref and publication remains pending with a handoff, and that no direct push from the report-role worktree happens. Add that row to the Report-publication cases table so the AC-04/AC-05 fixtures assert it.

### R-17

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Context (pre-implementation marketplace baseline paragraph)
EVIDENCE: Spec lines 108-112 say that native installers "fetched public vh-adlc 0.4.0, nine skills and no maintenance operation. All 47 installed payload files, including modes, match shared main `609ceeb` on both hosts" and that these checks "establish an upgrade baseline". At the reviewed target ad48fed, both manifests are now 0.4.1 (plugins/vh-adlc/plugin.json:4, plugins/vh-adlc/.claude-plugin/plugin.json:3). The spec operation body also changed: tests/vh-adlc/direct-operation-compatibility.test.ts:7-12 pins `vh-adlc-spec` to a new `specSummaryBaseline`, while the other operations keep their earlier baseline. So shared main no longer has the payload that the recorded 0.4.0 observation describes. The skill count is still nine (tests/vh-adlc/triage/discovery.test.ts:13), and no normative section or criterion depends on this baseline. AC-08 and the adoption preflight (spec lines 906-928) install whatever exact candidate and published version are current at that time. A reader of Context could still treat the 0.4.0 payload as the current pre-implementation upgrade base.
PROPOSAL: Label the 2026-10-28 observation as predating the 0.4.1 spec-summary change. State that the pre-maintenance upgrade base is whatever version is published when adoption runs, observed again by the existing preflight. No normative change is needed.

### R-18

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Context, upstream integration paragraph (lines 157-163); covered `docs/reference/marketplace.md`
EVIDENCE: Context line 160 says local integration preserves both operations. Lines 161-162 say the 0.6.0 candidate has eleven skills, including one article operation. Both manifests at 6a28de3 describe the package as "Shared lifecycle, dependency/security maintenance and article/promotion drafting" (`plugins/vh-adlc/plugin.json:5`, `plugins/vh-adlc/.claude-plugin/plugin.json:4`). `docs/user-guides/workflows.md:15-16,51` and `docs/get-started/installation.md:92-93` list `vh-adlc-blog`, and the lifecycle intake routes article work to it (`references/lifecycle.md:44`). The covered marketplace guide's plugin table gives the vh-adlc purpose only as "Lifecycle intake, maintenance, and a spec-driven feature loop." (`docs/reference/marketplace.md:13`), with no article operation. The integrated catalog guide therefore gives a narrower package description than the committed manifests and the other guides. No normative section or criterion depends on this row.
PROPOSAL: Make the `docs/reference/marketplace.md:13` purpose match the manifest description by adding article and promotion drafting. No change to Scope, Design, Acceptance Criteria, Test Plan or covers is needed.

### R-19

CRITERION: AC-01 A project can discover and invoke shared dependency/security maintenance through the installed vh-adlc plugin without a harness-specific procedure or a Stackweaver checkout dependency.
VERDICT: met
EVIDENCE: I ran the fixed launcher /home/m/code/.maintenance-review-archive/implementation-r19/input/check.sh once with source 3216f0962d54afc8dc584394d13a74fe57e0759f and consumer d94e2fe4c4d21646480e1cf9adf3ed713878de78. Command 00 exited 0. It printed {"version":"0.6.0","digest":"23fcedd9c556c64c71c9fc4afb9873f5408d7f493c80fef14441c9ca23a00652","files":66,"exact":true}, which shows that the committed plugins/vh-adlc and the Codex-installed 0.6.0 payload both equal the final candidate digest. Command 01 (bun test tests/vh-adlc --timeout 60000) passed 597 tests across 65 files with 0 failures. Those tests include tests/vh-adlc/maintenance/discovery.test.ts ("maintenance is a discoverable model-neutral operation with one canonical procedure"), the no-config settings/collection cases, the lifecycle and direct-operation compatibility suites and the controller-free import graph. I inspected proofs/final-committed-native-install/result.json. Its source_commit is 3216f096, and Codex CLI 0.163.0 and Claude Code 2.1.309 each discovered the same eleven skills, including vh-adlc-maintenance. The settings/collect/start/report helpers ran from the installed path with exit 0 and unchanged input/index digests. Reinstall restored digest 23fced, and the grade is pass. Limitations: the native installs used a local catalog as development proof, not a published marketplace install. I did not rerun them; I inspected the retained results, and the launcher verified their hashes.

CRITERION: AC-02 A sweep respects explicit repository scope, includes configured dependency/sync bot PRs, unknown-bot inventory gaps, dashboard work and security alerts, and distinguishes documented unavailable surfaces from incomplete collection without declaring affected work ready.
VERDICT: met
EVIDENCE: Command 01 at 3216f096 passed 597/597 tests, including tests/vh-adlc/maintenance/settings.test.ts and collection.test.ts. These cover pagination, normalized bot identity, foreign-organization incompleteness, discovery failure that does not invalidate configured-repository evidence, and GET-only collection. I inspected the retained final Codex, regraded Copilot and Stackweaver-policy report results. All pass, and they use plugin_digest 23fced with unavailable/incomplete coverage cases graded. The analysis.test.ts sibling-surface negative passed in this run. Limitations: fake-CLI and synthetic data only; no live GitHub collection.

CRITERION: AC-03 Maintenance decisions use actual version/changelog, code-usage and source-ownership evidence, keep major migrations separate and leave ambiguous or mixed changes unresolved.
VERDICT: met
EVIDENCE: Command 01 at 3216f096 passed analysis.test.ts and trial-proof.test.ts. The graders require exact items, classes and cited evidence, and they reject omitted, misclassified, unsupported-action and sibling-surface evidence. I inspected the three retained trials:
- proofs/final-report-codex/result.json: model gpt-6.1-sol, pass true.
- proofs/final-report-stack-policy/result.json: claude-opus-5.5, consumer d94e2fe4, pass true.
- proofs/final-report-copilot/result.json and regraded-result.json: the original failure (coverage:example/project:code_scanning:required-evidence) is retained, and the regraded result is pass. The answer is unchanged, with the same input_digest eae078d5 and plugin_digest 23fced.

The red log (t13-coverage-object-red) shows the scoped-object positive failing first, and the green log shows 20 tests passing. analysis.test.ts:180-181 asserts that the sibling dependabot line fails. Limitations: synthetic corpus and source samples only; production call-site compatibility is unverified.

CRITERION: AC-04 Each sweep permitted to write local artifacts preserves a durable, uniquely named report covering every discovered PR, security reconciliation and unresolved work without overwriting history or claiming completion from missing data; a sweep forbidden from all filesystem writes returns chat-only findings without claiming a saved report.
VERDICT: met
EVIDENCE: Command 01 at 3216f096 passed report.test.ts, journal.test.ts, publication.test.ts, publication-cases.test.ts and recovery-trial.test.ts. These include no-filesystem chat-only mode, missing or example-only adoption links, and same-day reservation. The launcher asserted pass true on the retained native publication results: publication-h/i/j/l/m/n, second-actor-no-push, and native-20261029-c/e/d outcome-publish/reconcile. Limitations: synthetic local-bare transports only; no real GitHub publication. I did not rerun the native runs; I inspected and hash-verified them.

CRITERION: AC-05 Newly authored compatible repairs use bounded-maintenance checks and independent review, selected bot-batch delivery preserves the declared consumer procedure, wider changes use the feature loop, and remote or live actions stay within owner and consumer permissions after revalidation.
VERDICT: met
EVIDENCE: Command 01 at 3216f096 passed maintenance-variants, delivery-cases, paired-review-trial, paired-check, action-cases, bot-only-trial, related-cases, builder-order and stalled-sync-trial tests. I inspected the following retained results:
- authored-satellite-a-review-7/returned.txt: "MODEL: claude-opus-5.5" followed by "NO FINDINGS".
- authored-satellite-a/continuation-result.json: pass true, original_thread equals resumed_thread (01a18631-...), exactly one source push and one PR for source_target 3706784e, and the primary pointer batch, report and evidence refs remain local.
- The launcher-asserted pass results for authored-primary-b and authored-independent-a continuations, bot-only-go-a (result, second batch and cleanup), and actions-a and actions-b.

Limitations: synthetic local transports only; no live dependency, merge, dispatch or helper action. The real satellite helper's crash safety is not certified.

CRITERION: AC-06 Resuming a task preserves unrelated work and prior evidence, invalidates stale reviews/approvals and reconciles interrupted actions before retrying them.
VERDICT: met
EVIDENCE: Command 01 at 3216f096 passed maintenance-resume.test.ts, journal.test.ts (torn and competing writers) and recovery-trial.test.ts. The launcher asserted pass true on actions-c and actions-d fresh-recovery, publication-h fresh-recovery-interrupted-commit, publication-i fresh-recovery-accepted-response-lost, and publication-n unobservable and fresh recovery. The stale source, Definition and verification-input results are retained under authored-primary-b. Limitations: the recovery is procedural, with no exactly-once guarantee for remote effects, and runs only against synthetic transports.

CRITERION: AC-07 Stackweaver routes maintenance to the installed shared operation while retaining its command/model/arguments, repository facts, batching and release checks, approved satellite-helper behavior and scoped skip-leak recovery locally; an authorized sweep publishes its initial and later same-run report artifacts through the retained main-checkout route, while other consumers publish reports only under an explicit request or adopted declaration.
VERDICT: not verified
EVIDENCE: I inspected consumer/ at d94e2fe4 against consumer-parity-baseline/ at 5383332c for every parity row, and found the following:
- The command keeps model: opus and $ARGUMENTS, and it reconciles both the satellite-handoff and the protection lines.
- Settings list 8 synced and 4 independent repositories plus the exclusions, bot_authors renovate/dependabot/stackweaver-release-bot and bot_inventory_terms renovate/dependabot/release-bot.
- maintenance-project.md retains the remaining parity rows:
  - Steps 1 to 9
  - one squash with no dependency [skip ci]
  - the distribution ban
  - builder-first ordering
  - stalled-sync handling
  - the Compose smoke stop/restore
  - the helper exception and the raw-admin ban
  - skip-leak recovery
  - the disposition vocabulary
  - the exact standing-publication table
- AGENTS.md links to settings, which link to the procedure, and the entry links to the procedure.
- The manifest shows identical blob hashes in both trees for satellite-merge.sh (mode 493), CLAUDE.md, the security policy and sync-api.yml.

The consumer checks (bun test tests/agent-maintenance and node scripts/changelog/check.js) are in the launcher, but they did not execute. The launcher stops at the first failure, and it stopped after go test ./... failed at command 02, so their execution was not observed in this review. The project procedure path also differs from the Design (F-03).

CRITERION: AC-08 The exact committed candidate passes native Codex and Claude CLI installation/discovery and installed-helper checks, the consumer can roll back and reapply without unrelated changes, and its adoption preflight blocks cutover until matching real marketplace verification is available.
VERDICT: not verified
EVIDENCE: Command 00 confirmed that the installed and committed payloads are exactly 23fced. proofs/final-committed-native-install/result.json shows Codex and Claude local-catalog installs bound to 3216f096, each discovering eleven skills, with passing helpers and reinstall. Command 01 passed the shared migration.test.ts cases: preflight denies absent, local-catalog, stale and wrong receipts, and the rollback/reapply fixture preserves raw index bytes. However, the consumer's own rollback/reapply and preflight tests (tests/agent-maintenance/rehearsal.test.ts and preflight.test.ts at d94e2fe4) never ran in this review because the launcher halted at command 02. So the consumer half of this composite is not verified. Missing real marketplace proof correctly blocks cutover and is not a source-gate prerequisite.

CRITERION: AC-09 Actual bounded Codex and Copilot report-stage trials follow the shared analysis procedure and retained consumer policy, and required regression and trial checks pass without implying untested delivery or GUI support or changing deferred workflows.
VERDICT: not met
EVIDENCE: The three retained report trials pass as described under AC-03. Command 01 passed 597 tests. However, the required repository regression check go test ./... at 3216f096 exited 1 (execution/02.stdout): "--- FAIL: TestCIWorkflow ... workflow_test.go:99: CI must retain the existing plugin checker". The checks after it (go vet, go mod tidy -diff, golangci-lint config verify and run, the github-app-registration bun test, actionlint, and both consumer checks) did not execute. Executed evidence therefore contradicts "required regression ... checks pass". The GUI and live-Claude model checks remain owner-deferred.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: .github/workflows/ci.yml; cmd/vh-adlc/workflow_test.go; Acceptance Criteria AC-09 and T13 evidence
EVIDENCE: check.sh command 02, go test ./... at 3216f0962d54afc8dc584394d13a74fe57e0759f, exited 1 with "workflow_test.go:99: CI must retain the existing plugin checker". workflow_test.go:98 requires a run step exactly equal to "bun test tests/vh-adlc". ci.yml:47 is now "bun test tests/vh-adlc --timeout 60000". Spec lines 1286 and 1335 say "Go test/vet/module/lint ... passed". Context lines 347-361 show the Go checks ran before the Linux timeout change, and only the bun suite was rerun after it.
PROPOSAL: Make the committed CI step and the workflow regression test agree within the accepted scope, then rerun go test, vet, tidy, lint, actionlint and the consumer checks. Also correct the AC-09/T13 evidence lines that claim Go tests passed at this target.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Scope (lines 383-384); .github/workflows/ci.yml checker job
EVIDENCE: Scope says "changing workflow triggers, permissions, release rules or the mandatory full Linux suite is not" in scope. T13 added "--timeout 60000" to the Linux full-suite step (ci.yml:47). Context lines 350-352 and 357-361 describe this as a per-test setup budget, not a change in test selection. The existing Go guard treats the exact command as the retained checker.
PROPOSAL: The owner should decide whether a per-test timeout on the mandatory Linux suite counts as an out-of-scope change. Depending on that decision, either revert it or record it explicitly before the guard test changes.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Consumer settings and project procedures (line 474-475); consumer adapter
EVIDENCE: Spec line 475 says the thin entry "points to project policy in `agents/maintenance-project.md`". At consumer d94e2fe4 the policy is at the repository root `maintenance-project.md`: .vh-adlc/maintenance.json:29 has "project_procedure": "maintenance-project.md", agents/maintenance.md:5 links ../maintenance-project.md, and tests/agent-maintenance/manifest.json:8 lists the root path. The link chain is consistent, but the location differs from the accepted Design.
PROPOSAL: Move the procedure to agents/maintenance-project.md and update the settings, links and consumer tests. Alternatively, record an owner-approved Design correction for the root location.

### R-20

CRITERION: AC-01 A project can discover and invoke shared dependency/security maintenance through the installed vh-adlc plugin without a harness-specific procedure or a Stackweaver checkout dependency.
VERDICT: met
EVIDENCE: I ran /home/m/code/.maintenance-review-archive/implementation-r20/input/check.sh once. execution/receipt.json shows pass_ true, all 11 commands exit 0, source head f6974f259de383bbbc803261a0fa33b3e949876d and consumer head 2095f06e4ccfe74740ceb9cfc806bcb7c7667b3a, with head, index, status and refs identical before and after. It also verified 446 source objects and 162 proofs. Command 00 printed {"version":"0.6.0","digest":"23fcedd9c556c64c71c9fc4afb9873f5408d7f493c80fef14441c9ca23a00652","files":66,"exact":true}. That shows the committed plugins/vh-adlc at f6974f25 equals the Codex-installed post-R19 payload. Command 01 (bun test tests/vh-adlc) passed 598 tests and 2625 assertions with 0 failures. Those tests include maintenance/discovery.test.ts ("discoverable model-neutral operation with one canonical procedure", "intake keeps existing routes and adds sweep/resume without granting publication"), settings.test.ts ("an unconfigured project has one repository and creates no settings or output") and collection.test.ts ("the collector's runtime import graph does not load triage execution or the controller"). lifecycle.md:46 adds the Dependency or security sweep row beside Bounded maintenance, and lifecycle.md:51 updates Resume. I inspected proofs/post-r19-native-install-b/result.json. Its source_commit is 3039766d5755be8cb88589c3f5c05e3f9ddaa946 (candidate_commit in targets.json). Codex CLI 0.163.0 and Claude Code 2.1.309 each discovered the same eleven skills, including vh-adlc-maintenance. The installed settings, collect and report helpers exited 0 with input and index digests unchanged, reinstall restored 23fced, model_invocations is 0 and grade pass is true. Limitations: these are local-catalog development installs, not published-marketplace installs. I inspected the native install results and the launcher hash-verified them; I did not rerun them.

CRITERION: AC-02 A sweep respects explicit repository scope, includes configured dependency/sync bot PRs, unknown-bot inventory gaps, dashboard work and security alerts, and distinguishes documented unavailable surfaces from incomplete collection without declaring affected work ready.
VERDICT: met
EVIDENCE: Command 01 at f6974f25 passed every settings.test.ts and collection.test.ts case shown in execution/01.stderr:526-579. They cover fixed GET argv, every page collected with unknown bots kept as gaps, documented unavailable scanning as n/a with Dependabot independently complete, unmatched 403/404/429 as incomplete, partial pages, organization gaps without widened explicit scope, dashboard-only work and ambiguity, normalized bot matching, newly enabled scanning, and a discovery failure that does not invalidate configured evidence. analysis.test.ts:172-182 ("every coverage case binds its own collected JSON object and rejects a sibling surface") passed. The consumer settings declare the exact 403 and literal-message expectation (consumer/.vh-adlc/maintenance.json:30-37). The retained final Codex (result.json), Copilot (regraded-result.json) and policy reports all pass on payload 23fced with unavailable and incomplete cases graded. Limitations: fake-CLI and synthetic inventories only; no live GitHub collection.

CRITERION: AC-03 Maintenance decisions use actual version/changelog, code-usage and source-ownership evidence, keep major migrations separate and leave ambiguous or mixed changes unresolved.
VERDICT: met
EVIDENCE: Command 01 passed analysis.test.ts ("graders require every exact item/class and cited input") and trial-proof.test.ts (7 tests, including adjacent-unrelated-evidence and sibling-surface denials). I inspected the three refreshed report trials, all on plugin_digest 23fced from component 5f52f789:
- proofs/final-report-codex/result.json: pass true, model gpt-6.1-sol, inputs, source and native tools preserved.
- proofs/final-report-copilot/result.json and regraded-result.json: the original pass is false with "coverage:example/project:code_scanning:required-evidence", and that failure is retained beside the regraded pass. Both have the same input_digest eae078d5. launch.json limits tools to view,grep,glob, and native.jsonl contains no bash, shell, write, edit, create, web_fetch, github or task tool calls.
- proofs/final-report-stack-policy/result.json: pass true for consumer d94e2fe4.

The red/green logs (t13-coverage-object-red and green) show the scoped-object grader fix. The sibling-surface negative still fails as required in this run. Limitations: synthetic corpus and source samples only; production call-site compatibility is unverified.

CRITERION: AC-04 Each sweep permitted to write local artifacts preserves a durable, uniquely named report covering every discovered PR, security reconciliation and unresolved work without overwriting history or claiming completion from missing data; a sweep forbidden from all filesystem writes returns chat-only findings without claiming a saved report.
VERDICT: met
EVIDENCE: Command 01 passed:
- report.test.ts (22 tests): same-day reservation, cross-process unsuffixed-name race, late collision relocation, append-only resume, legacy unverified history, non-link unpublished evidence.
- journal.test.ts (8 tests).
- publication.test.ts (23 tests): committed default-branch grant only, feature-branch and uncommitted declarations deny, isolated report commit, promotion, protection refusal, interrupted commit recovery.
- analysis.test.ts: "no-filesystem mode creates no journal".

Before running, the launcher asserted pass true on the retained publication-h, i, j, l, m and n results, second-actor-no-push and native-20261029-c, e and d (outcome-publish and outcome-reconcile). Limitations: synthetic local-bare transports only; no real GitHub publication. I did not rerun the native runs.

CRITERION: AC-05 Newly authored compatible repairs use bounded-maintenance checks and independent review, selected bot-batch delivery preserves the declared consumer procedure, wider changes use the feature loop, and remote or live actions stay within owner and consumer permissions after revalidation.
VERDICT: met
EVIDENCE: Command 01 passed maintenance-variants, delivery-cases, paired-review-trial, paired-check, action-cases, bot-only-trial (real go mod tidy), related-cases, builder-order and stalled-sync-trial (execution/01.stderr:698-724).
- proofs/authored-satellite-a-review-7/returned.txt is "MODEL: claude-opus-5.5" followed by "NO FINDINGS".
- proofs/authored-satellite-a/continuation-result.json has pass true, and original_thread equals resumed_thread (01a18631-9349-7be1-ac15-2777c076bdf0). It records exactly 1 successful source push and one PR at headRefOid 3706784e, which matches the reviewed source_target. Report, evidence and primary pointer refs remain local, and unrelated invocation status is preserved.
- The launcher asserted pass true for the authored-primary-b and authored-independent-a continuations, stalled-sync, bot-only-go-a (batch, second batch and cleanup) and actions-a and actions-b.

Limitations: synthetic local transports; no live dependency, merge, dispatch or helper action. The final satellite proof used frozen payload 86ee21d9, not 23fced. The unchanged Stackweaver helper's crash safety is not certified.

CRITERION: AC-06 Resuming a task preserves unrelated work and prior evidence, invalidates stale reviews/approvals and reconciles interrupted actions before retrying them.
VERDICT: met
EVIDENCE: Command 01 passed:
- maintenance-resume.test.ts.
- journal.test.ts: torn events, two real competing processes, linked worktrees.
- report.test.ts: fresh-process append reconciliation, unfinished intent blocking.
- publication.test.ts: interrupted Git commit resumes without a duplicate.
- paired-check.test.ts: a changed verification-input export is rejected.

The launcher asserted pass true for actions-c and actions-d fresh-recovery, publication-h interrupted-commit, publication-i accepted-response-lost, and publication-n unobservable and fresh recovery. Earlier failed reviews R-1 to R-6 are retained, per the satellite continuation response. Limitations: procedural recovery against synthetic transports; no exactly-once guarantee for remote effects.

CRITERION: AC-07 Stackweaver routes maintenance to the installed shared operation while retaining its command/model/arguments, repository facts, batching and release checks, approved satellite-helper behavior and scoped skip-leak recovery locally; an authorized sweep publishes its initial and later same-run report artifacts through the retained main-checkout route, while other consumers publish reports only under an explicit request or adopted declaration.
VERDICT: met
EVIDENCE: Command 09 (bun test tests/agent-maintenance in the consumer at 2095f06e, with VH_ADLC_PLUGIN_DIR set to the installed 23fced payload) passed 9 tests and 123 assertions with no skips. Command 10 (node scripts/changelog/check.js) passed.

I inspected consumer/ against consumer-parity-baseline/ for every parity row:
- The command keeps model: opus and $ARGUMENTS and routes to vh-adlc-maintenance. Its line 10-12 reconciles both old passages (baseline lines 28-29 and 31-33) with the helper exception, and it keeps the self-approval ban.
- maintenance.json lists 8 synced and 4 independent repositories, the 4 exclusions, bot_authors renovate/dependabot/stackweaver-release-bot and bot_inventory_terms renovate/dependabot/release-bot. The dashboard, the no-GHAS expectation and project_procedure agents/maintenance-project.md, which resolves R-19 F-03, are also declared.
- agents/maintenance-project.md retains the remaining parity rows:
  - reusable-workflow tag and input-default checks
  - provider direct merges
  - the distribution ban
  - Renovate limits and satellite-only ecosystems
  - security mapping and no-GHAS
  - legacy unverified history
  - core/v* tags and both backlog links
  - report-only [skip ci]
  - one squash with no dependency [skip ci]
  - builder-before-monorepo ordering and stalled-sync root cause
  - majors, Playwright and check-doc-coverage
  - GitVersion Tag, bump-core and sync verification
  - skip-leak recovery (lines 160-163)
  - Compose smoke stop/restore
  - the helper, green-check and raw-admin bans
  - the disposition vocabulary
  - the exact Standing maintenance report publication table (lines 113-124)
- AGENTS.md:15-17 links to agents/maintenance.md and the settings, and the entry links to the procedure.
- The packet manifest shows identical hashes in both trees for CLAUDE.md, scripts/satellite-merge.sh (4eda2ba3, mode 493), the security policy, the backlog and the sync workflows.
- The shared report helper reserves YYYY-MM-DD-dependency-sweep.md (report.ts:58).

Shared publication.test.ts proves the other-consumer explicit and adopted-only rule. Limitations: the adapter is unmerged and unadopted, so the standing grant is not yet live. Main-checkout publication is proven only on synthetic transports. Live Claude invocation of /maintenance is owner-deferred.

CRITERION: AC-08 The exact committed candidate passes native Codex and Claude CLI installation/discovery and installed-helper checks, the consumer can roll back and reapply without unrelated changes, and its adoption preflight blocks cutover until matching real marketplace verification is available.
VERDICT: met
EVIDENCE: proofs/post-r19-native-install-b/result.json (pass true, kind local-catalog, source_commit 3039766d, payload 23fced) shows Codex CLI 0.163.0 and Claude Code 2.1.309 installs, discovery of eleven skills, installed helpers with preserved input and index, and uninstall/reinstall restoring 23fced. Command 00 confirmed that the committed plugin at f6974f25 is byte- and mode-identical to that installed payload. Command 09 passed:
- consumer rehearsal.test.ts: a committed adapter clone rolls back to 72186d3c and reapplies the five runtime paths, with staged, working and untracked bytes and the raw index preserved, in normal and linked worktrees.
- preflight.test.ts ("the current candidate cannot cut over without actual published-marketplace evidence").

Command 01 passed the shared migration.test.ts denials for absent, local-catalog, stale and wrong receipts, and valid-receipt parsing without a publication claim. The consumer manifest records adoption_state "pending-published-marketplace-proof". Limitations: no real published-marketplace install exists. Under the accepted Design, that blocks cutover before consumer merge and is not a source-gate prerequisite. The rehearsal is disposable and local.

CRITERION: AC-09 Actual bounded Codex and Copilot report-stage trials follow the shared analysis procedure and retained consumer policy, and required regression and trial checks pass without implying untested delivery or GUI support or changing deferred workflows.
VERDICT: met
EVIDENCE: All 11 launcher commands exited 0 at f6974f25 and 2095f06e:
- bun test tests/vh-adlc: 598 pass.
- go test ./...: all ok. ci.yml:47 is again exactly "bun test tests/vh-adlc", which matches workflow_test.go:98 and resolves R-19 F-01.
- go vet, go mod tidy -diff, golangci-lint config verify and run ("0 issues."), the github-app-registration bun test (34 pass) and actionlint all passed.
- The consumer checks passed.

Trials:
- The Codex generic trial passed.
- The Copilot claude-opus-5.5 generic trial passed on regrade, with its original failure retained.
- The post-R19 policy trial (proofs/post-r19-report-stack-policy) ran with requested and observed claude-opus-5.5, view/grep/glob only, consumer_target 2095f06e and payload 23fced. It required reads of source/agents/maintenance-project.md. Its retained result.json fails only "consumer-policy-parity", and regraded-result.json passes with an explicit correction note.
- The regrade code (report-trial.ts:217-240) refuses any failure other than required-evidence or consumer-policy-parity. It also requires the retained assessment and consumer plan to equal the native return.
- The red log shows gradeConsumerPlan missing. The green log and this run show the exact repository accepted and the wrong owner, stackweaver-extra prefix, reversed order and skip_ci true rejected (trial-proof.test.ts:91-98).
- consumer contract.test.ts:43-48 shows other agents and commands, CLAUDE.md and the helper unchanged.
- compatibility.md:43-45 keeps live Claude and GUI deferred, with no Copilot lifecycle claim.

Limitations: the full post-R19 native transcript and consumer-plan.json are not in this packet; only a hash projection is. I verified the plan's grading through the retained results and the executed grader controls, not by reading the plan text. That replay is not a new model answer. Live Claude and GUI remain unverified. Go package results were partly cached.

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: docs/reference/compatibility.md:38-40
EVIDENCE: The page says "Final 0.6.0 candidate validation is pending after integration with the published blog workflow." However, proofs/post-r19-native-install-b/result.json records passing native Codex and Claude installs of 0.6.0 at 3039766d with payload 23fced, and spec T13 evidence (line 1374) records the same.
PROPOSAL: Update the paragraph to state the observed final 0.6.0 local-catalog results. Keep published-marketplace proof as the remaining cutover requirement.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: consumer agents/maintenance.md:10; tests/agent-maintenance/installed.ts:10,22; tests/agent-maintenance/manifest.json:4
EVIDENCE: The consumer says "Require vh-adlc 0.5.0 or later" and accepts minor 5 or higher. The shared docs say maintenance requires 0.6.0 or later (installation.md:115, marketplace.md:24, compatibility.md:31). The required-file check limits the impact.
PROPOSAL: Align the consumer minimum version with the shared 0.6.0 requirement, or record why 0.5.x with the operation present is acceptable.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: consumer tests/agent-maintenance/preflight.test.ts:15-17
EVIDENCE: The test passes if preflightInstalled throws "consumer migration scope is not a clean committed snapshot". In a dirty checkout, it can pass without exercising the published-evidence denial. In this review, the launcher showed empty status before and after, so the denial branch is the one that ran.
PROPOSAL: Require the clean-snapshot denial path to run in this test, and cover the dirty-scope refusal in a separate assertion.

### R-21

CRITERION: AC-01 A project can discover and invoke shared dependency/security maintenance through the installed vh-adlc plugin without a harness-specific procedure or a Stackweaver checkout dependency.
VERDICT: met
EVIDENCE: I ran /home/m/code/.maintenance-review-archive/implementation-r21/input/check.sh once. execution/receipt.json shows pass_ true and all 11 commands exited 0. Source head was 1a121564d92ac3da8bf7bef238432a527b3888f4 and consumer head 9111242da11be04157b7cccd994426069d31b9d5. Head, index, status and refs were identical before and after. The launcher verified 446 source objects, 184 proofs and 31 required positive results. Command 00 printed {"version":"0.6.0","digest":"23fcedd9c556c64c71c9fc4afb9873f5408d7f493c80fef14441c9ca23a00652","files":66,"exact":true}, so committed plugins/vh-adlc at 1a121564 is byte- and mode-identical to the Codex-installed payload. Command 01 (bun test tests/vh-adlc) passed 598 tests and 2627 assertions with 0 failures. The tests that bear on this criterion all passed: maintenance/discovery.test.ts ("discoverable model-neutral operation with one canonical procedure", "intake keeps existing routes and adds sweep/resume without granting publication"), settings.test.ts ("an unconfigured project has one repository and creates no settings or output") and collection.test.ts ("the collector's runtime import graph does not load triage execution or the controller"). I inspected proofs/post-r19-native-install-b/result.json: kind local-catalog, source_commit 3039766d5755be8cb88589c3f5c05e3f9ddaa946 (candidate_commit in targets.json). Codex CLI 0.163.0 and Claude Code 2.1.309 each discovered the same eleven skills, including vh-adlc-maintenance. The installed collection, start and report helpers had identical input and index digests before and after. reinstall restored 23fced, model_invocations is 0 and both host grades pass. Limitations: local-catalog development installs only, not published-marketplace installs. I inspected the hash-verified native results; I did not rerun them.

CRITERION: AC-02 A sweep respects explicit repository scope, includes configured dependency/sync bot PRs, unknown-bot inventory gaps, dashboard work and security alerts, and distinguishes documented unavailable surfaces from incomplete collection without declaring affected work ready.
VERDICT: met
EVIDENCE: At 1a121564, command 01 passed every settings and collection case in execution/01.stderr:526-579. These cover:
- documented unavailable scanning reported as n/a while Dependabot stays independently complete
- dashboard-only work collected, with ambiguity left incomplete
- organization gaps visible without expanding explicit scope
- foreign organization rows making discovery incomplete
- newly enabled scanning returning findings
- discovery failure not invalidating configured evidence
- the 1000-suite cap
- stale combined status

analysis.test.ts "every coverage case binds its own collected JSON object and rejects a sibling surface" passed (01.stderr:654). The consumer settings declare the exact 403 and literal-message expectation (consumer/.vh-adlc/maintenance.json:30-37). In the post-R20 policy trial, regraded-report-receipt.json renders the monorepo code_scanning surface as complete-unavailable with a null count, and the provider Dependabot surface as incomplete with a null count. Limitations: fake-CLI and synthetic inventories only; no live GitHub collection.

CRITERION: AC-03 Maintenance decisions use actual version/changelog, code-usage and source-ownership evidence, keep major migrations separate and leave ambiguous or mixed changes unresolved.
VERDICT: met
EVIDENCE: Command 01 passed analysis.test.ts ("graders require every exact item/class and cited input") and all seven trial-proof.test.ts cases, including the adjacent-unrelated-evidence and declared-security negatives. I inspected the retained trials:
- proofs/final-report-codex/result.json: pass true, model gpt-6.1-sol, component 5f52f789, plugin_digest 23fced, input and source preserved.
- proofs/final-report-copilot: result.json keeps its original failure "coverage:example/project:code_scanning:required-evidence" beside regraded-result.json pass true. The red and green t13-coverage-object logs show the scoped-object fix, and the sibling-surface negative still fails as required in this run.
- proofs/final-report-stack-policy/result.json: pass true, consumer d94e2fe4.
- The post-R20 policy trial (below under AC-09) at consumer 9111242d.

Limitations: synthetic corpus and source samples only. Production call-site compatibility is unverified.

CRITERION: AC-04 Each sweep permitted to write local artifacts preserves a durable, uniquely named report covering every discovered PR, security reconciliation and unresolved work without overwriting history or claiming completion from missing data; a sweep forbidden from all filesystem writes returns chat-only findings without claiming a saved report.
VERDICT: met
EVIDENCE: Command 01 passed the following (01.stderr:581-654):
- journal.test.ts: 8 tests.
- report.test.ts: 22 tests, covering same-day reservation, the two-process unsuffixed-name race, late cross-host relocation, append-only resume, legacy unverified history and non-link unpublished evidence.
- publication.test.ts: 23 tests, covering the committed default-branch grant only, feature-branch and uncommitted denials, isolated report commit, promotion, protection refusal and interrupted-commit recovery.
- analysis.test.ts: "no-filesystem mode creates no journal".

Before running the commands, the launcher asserted pass true on the retained results for publication-h, i, j, l, m and n, second-actor-no-push, and native-20261029 c, e and d (outcome publish and reconcile). The post-R20 policy render shows kind external-draft and commit false and push false under a read-only request. Limitations: synthetic local-bare transports only; no real GitHub publication; native runs were not rerun.

CRITERION: AC-05 Newly authored compatible repairs use bounded-maintenance checks and independent review, selected bot-batch delivery preserves the declared consumer procedure, wider changes use the feature loop, and remote or live actions stay within owner and consumer permissions after revalidation.
VERDICT: met
EVIDENCE: Command 01 passed maintenance-variants, delivery-cases, paired-review-trial, paired-check, action-cases, bot-only-trial (real go mod tidy), related-cases, builder-order and stalled-sync-trial (01.stderr:698-724). In proofs/authored-satellite-a/continuation-result.json:
- pass is true, and original_thread equals resumed_thread (01a18631-9349-7be1-ac15-2777c076bdf0).
- It records successful_source_pushes 1 and one PR at headRefOid 3706784e, which equals the reviewed source_target.
- The stored review is R-7, claude-opus-5.5, NO FINDINGS.
- Report, evidence and pointer refs stay local, and unrelated invocation status is preserved.

The launcher asserted pass true for the authored-primary-b and authored-independent-a continuations, stalled-sync, bot-only-go-a (batch, second batch and cleanup) and actions-a and actions-b. Limitations: synthetic local transports; no live dependency, merge, dispatch or helper action. The final satellite proof used frozen payload 86ee21d9, not 23fced. The unchanged Stackweaver helper's crash safety is not certified.

CRITERION: AC-06 Resuming a task preserves unrelated work and prior evidence, invalidates stale reviews/approvals and reconciles interrupted actions before retrying them.
VERDICT: met
EVIDENCE: Command 01 passed:
- maintenance-resume
- journal torn-event, competing-process and linked-worktree cases
- report fresh-process append reconciliation and unfinished-intent blocking
- publication interrupted Git commit resume without a duplicate
- paired-check rejection of a changed verification-input export

The launcher asserted pass true for the actions-c and actions-d fresh recoveries, publication-h interrupted commit, publication-i accepted-response-lost, and publication-n unobservable and fresh recovery. The satellite continuation response preserves R-1 through R-6 as findings. Limitations: procedural recovery against synthetic transports; no exactly-once remote guarantee.

CRITERION: AC-07 Stackweaver routes maintenance to the installed shared operation while retaining its command/model/arguments, repository facts, batching and release checks, approved satellite-helper behavior and scoped skip-leak recovery locally; an authorized sweep publishes its initial and later same-run report artifacts through the retained main-checkout route, while other consumers publish reports only under an explicit request or adopted declaration.
VERDICT: met
EVIDENCE: Command 09 ran bun test tests/agent-maintenance in the consumer at 9111242d, with VH_ADLC_PLUGIN_DIR set to the installed 23fced payload. It passed 11 tests and 127 assertions with no skips. Command 10 (changelog check) passed.

I inspected consumer/ against consumer-parity-baseline/ for every row of the parity table (spec lines 960-977):
- The command keeps model: opus and $ARGUMENTS and routes to vh-adlc-maintenance. Its lines 10-12 reconcile baseline lines 28-29 and 31-33 with the helper exception and keep the self-approval ban.
- maintenance.json lists 8 synced and 4 independent repositories, 4 exclusions, bot_authors renovate/dependabot/stackweaver-release-bot and bot_inventory_terms renovate/dependabot/release-bot. It also declares the dashboard, the no-GHAS expectation and project_procedure agents/maintenance-project.md.
- agents/maintenance-project.md keeps the remaining rows:
  - reusable-workflow tag checks
  - provider direct merges
  - the distribution ban
  - Renovate limits
  - satellite-only ecosystems
  - security mapping
  - legacy unverified history
  - core/v* tags and both backlog links
  - report-only [skip ci]
  - one squash with no dependency skip
  - builder-before-monorepo ordering and stalled-sync root cause
  - majors, Playwright and check-doc-coverage
  - GitVersion Tag, bump-core and sync checks
  - skip-leak recovery (lines 160-163)
  - smoke stop/restore
  - helper, green-check and raw-admin bans
  - the disposition vocabulary
  - the exact Standing maintenance report publication table (lines 113-124)
- AGENTS.md:15-17 links the entry and the settings.
- Manifest hashes are identical in both trees for CLAUDE.md, scripts/satellite-merge.sh (4eda2ba3, mode 493), the security policy, the backlog and all eight sync workflows. dispositions.json differs only by internal changelog entries.

Shared publication.test.ts proves the explicit-or-adopted rule for other consumers. Limitations: the adapter is unmerged and unadopted. Main-checkout publication is proven only on synthetic transports. Live Claude /maintenance invocation is owner-deferred.

CRITERION: AC-08 The exact committed candidate passes native Codex and Claude CLI installation/discovery and installed-helper checks, the consumer can roll back and reapply without unrelated changes, and its adoption preflight blocks cutover until matching real marketplace verification is available.
VERDICT: met
EVIDENCE: Installation: proofs/post-r19-native-install-b/result.json (pass true, local-catalog, source 3039766d, payload 23fced) shows native Codex 0.163.0 and Claude 2.1.309 installs, eleven-skill discovery, helpers with preserved input and index, and uninstall/reinstall restoring 23fced. Command 00 proved that committed 1a121564 is identical to that installed payload.

Command 09 passed:
- rehearsal.test.ts: rollback to 72186d3c and reapply of only the runtime paths, with unrelated bytes and index preserved.
- installed.test.ts: rejects 0.4.1 and a maintenance-shaped 0.5.99 and accepts 0.6.0. installed.ts:10 rejects any 0.x minor below 6. The r20-version-gate-red log shows 0.5.99 passing before the fix.
- preflight.test.ts, two separate cases. The clean case asserts empty status in the fixture and returns pass false with "expected published target absent or invalid". The dirty case adds an untracked file and rejects with "consumer migration scope is not a clean committed snapshot".

Command 01 passed the shared migration.test.ts denials (absent, local-catalog, stale, wrong source/consumer/version/model/payload, missing hosts or helpers) and valid-receipt parsing. The consumer manifest records adoption_state pending-published-marketplace-proof. Limitations: no real published-marketplace install exists. Under the accepted Design that blocks cutover before consumer merge and is not a source-gate prerequisite. The clean consumer case is denied at the absent published target, before the receipt branch; shared tests cover receipt absence.

CRITERION: AC-09 Actual bounded Codex and Copilot report-stage trials follow the shared analysis procedure and retained consumer policy, and required regression and trial checks pass without implying untested delivery or GUI support or changing deferred workflows.
VERDICT: met
EVIDENCE: All 11 launcher commands exited 0 at 1a121564 and 9111242d:
- bun test tests/vh-adlc: 598 pass, 2627 assertions.
- go test ./...: all ok, partly cached.
- go vet, go mod tidy -diff, and golangci-lint config verify and run ("0 issues.") passed.
- github-app-registration: 34 pass.
- actionlint passed.
- consumer checks: 11 tests and the changelog check passed.

Post-R20 policy trial (proofs/post-r20-report-stack-policy):
- launch.json requests claude-opus-5.5 with view,grep,glob only, component 3039766d, consumer 9111242d and installed digest 23fced.
- native.jsonl has 2167 events. Session model is claude-opus-5.5, and bash, create, edit, web_fetch and task are disabled. There are 64 tool starts, all view/grep/glob under the packet input root, with no "..". There are 64 completions, one of which is a failed grep regex. The result has exitCode 0 and no code changes.
- The final assistant message (line 2164) contains the exact consumer-plan.json text: monorepo second in builder order, skip_ci false, and "They establish no production call-site compatibility, check result or readiness."
- result.json retains pass false with only consumer-policy-parity. regraded-result.json passes, with input digest 5e9dcce5 and plugin 23fced. regraded-report-receipt.json shows the installed helper exit 0, source and index preserved.
- The r20-compatibility-wording red log fails exactly that qualification. The green log and this run pass it while rejecting "establish production call-site compatibility and readiness", a wrong owner, a stackweaver-extra prefix, reversed order and skip_ci true.
- report-trial.ts:237-239 requires the retained assessment and plan to equal the native return.

The replay re-grades the unchanged answer and is not a new model answer. The Codex generic trial passed, and the Copilot generic trial passed on regrade with its failure retained. compatibility.md:42-48 keeps live Claude and GUI deferred and makes no Copilot lifecycle claim. Limitations: live Claude and GUI remain unverified. I could not re-execute the retained regrade itself.

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: tests/vh-adlc/maintenance/report-trial.ts:252; proofs/post-r20-report-stack-policy/regraded-result.json:747
EVIDENCE: At 1a121564, the regrade function writes a correction string that includes "and accept an explicit statement that samples establish no production compatibility". The retained regraded-result.json instead says "recognize the exact configured primary repository in builder ordering, retaining wrong-owner/prefix/sibling and unsupported compatibility-claim denials". So the retained replay was not produced by the committed regrade code, and checks/r20-policy-replay-20261029.log holds only {"pass":true,...}. The plan text and the committed gradeConsumerPlan regex still agree, so no verdict changes.
PROPOSAL: Record which code revision produced the retained replay, or regenerate the replay from the committed code into a new output beside the retained artifacts.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: tests/vh-adlc/maintenance/report-trial.ts:31 (gradeConsumerPlan production_compatibility check)
EVIDENCE: The check accepts any text that contains "unverified", "cannot", "not establish" or "not verified". For example, "Samples prove production compatibility; nothing cannot ship" would pass. trial-proof.test.ts:99 tests only one unqualified positive claim. I confirmed by reading the actual returned qualification that it is a correct denial.
PROPOSAL: Add a negative control where a positive production-compatibility claim contains one of the accepted terms, and tighten the match to a claim-level qualification.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: docs/specs/shared-maintenance.md:2064-2082 (Review Log and Sources)
EVIDENCE: "## Sources" starts at line 2064, after "### R-19", and "### R-20" follows at line 2082. The R-20 records therefore sit under Sources instead of under the Review Log, which the feature-document standard requires to hold each "### R-<n>" subsection.
PROPOSAL: Move the "### R-20" subsection above "## Sources" so that every stored review record sits inside the Review Log section.

### R-22

CRITERION: AC-01 A project can discover and invoke shared dependency/security maintenance through the installed vh-adlc plugin without a harness-specific procedure or a Stackweaver checkout dependency.
VERDICT: met
EVIDENCE: I ran /home/m/code/.maintenance-review-archive/implementation-r22/input/check.sh once. It printed {"pass_": true, "commands": 12, "preserved": true}. execution/receipt.json shows all 12 commands exited 0. Source head was 06b171348ece78c622b914838babfbe5cb442951 and consumer head was 9111242da11be04157b7cccd994426069d31b9d5. Head, index, empty status and refs were identical before and after. The launcher also verified 446 source objects, 191 proofs and 32 required positive results. Command 00 printed {"version":"0.6.0","digest":"23fcedd9c556c64c71c9fc4afb9873f5408d7f493c80fef14441c9ca23a00652","files":66,"exact":true}. So committed plugins/vh-adlc at 06b17134 matches the Codex-installed post-R19 payload. Command 01 (bun test tests/vh-adlc) passed 598 tests and 2632 assertions with 0 failures. These included maintenance/discovery.test.ts ("maintenance is a discoverable model-neutral operation with one canonical procedure", "intake keeps existing routes and adds sweep/resume without granting publication"), settings.test.ts ("an unconfigured project has one repository and creates no settings or output"), collection.test.ts ("the collector's runtime import graph does not load triage execution or the controller") and the check.test.ts vh-adlc-maintenance skill checks (01.stderr:236-238, 527, 570, 657-658). Command 11 invoked the installed payload's scripts/maintenance/cli.ts report helper, which exited 0. I inspected proofs/post-r19-native-install-b/result.json: kind local-catalog, source_commit 3039766d (the candidate_commit in targets.json), Codex and Claude hosts, payload 23fced, model_invocations 0, reinstall restored 23fced, and pass true. Limitations: these are local-catalog development installs, not published-marketplace installs. I inspected the native install results; I did not rerun them.

CRITERION: AC-02 A sweep respects explicit repository scope, includes configured dependency/sync bot PRs, unknown-bot inventory gaps, dashboard work and security alerts, and distinguishes documented unavailable surfaces from incomplete collection without declaring affected work ready.
VERDICT: met
EVIDENCE: In command 01 at 06b17134, every settings.test.ts and collection.test.ts case passed (01.stderr:526-579). They cover:
- fixed GET argv
- every page collected, with unknown bots kept as gaps
- documented unavailable scanning reported as n/a while Dependabot stays complete
- unmatched 403, 404 and 429 responses treated as incomplete
- partial pages
- configured dashboard-only work, with ambiguity left incomplete
- organization gaps without widened explicit scope
- normalized bot matching
- newly enabled scanning
- the 1000-suite cap
- stale status

analysis.test.ts "every coverage case binds its own collected JSON object and rejects a sibling surface" passed (01.stderr:654). The consumer settings (consumer/.vh-adlc/maintenance.json:21-22,30-37) declare the exact bot_authors and bot_inventory_terms and the 403 literal-message expectation. The fresh replay render receipt (execution/fresh-replay/regraded-report-receipt.json) shows monorepo code_scanning as complete-unavailable with a null count and the provider Dependabot surface as incomplete with a null count. Limitations: fake-CLI and synthetic inventories only; no live GitHub collection.

CRITERION: AC-03 Maintenance decisions use actual version/changelog, code-usage and source-ownership evidence, keep major migrations separate and leave ambiguous or mixed changes unresolved.
VERDICT: met
EVIDENCE: Command 01 passed analysis.test.ts ("graders require every exact item/class and cited input, with no invented collection or live actions") and all seven trial-proof.test.ts cases (01.stderr:645, 678-685). I inspected the retained trials:
- proofs/final-report-codex/result.json: pass true, model gpt-6.1-sol, component 5f52f789, plugin_digest 23fced.
- proofs/final-report-copilot: result.json retains pass false with "coverage:example/project:code_scanning:required-evidence", beside regraded-result.json pass true on the same component and payload. The sibling-surface negative still passes as a rejection in this run.
- proofs/final-report-stack-policy: inspected.
- Command 11 re-executed the post-R20 policy replay from committed 06b17134 (described under AC-09). It passed with grade failures [] while the five retained artifacts stayed byte-identical.

Limitations: synthetic corpus and source samples only. Production call-site compatibility remains unverified, and the consumer plan itself says so.

CRITERION: AC-04 Each sweep permitted to write local artifacts preserves a durable, uniquely named report covering every discovered PR, security reconciliation and unresolved work without overwriting history or claiming completion from missing data; a sweep forbidden from all filesystem writes returns chat-only findings without claiming a saved report.
VERDICT: met
EVIDENCE: Command 01 passed (01.stderr:581-654):
- journal.test.ts: 8 tests.
- report.test.ts: 22 tests, covering same-day reservation, the two-process unsuffixed race, report-role refs forcing a suffix, cross-host relocation, published collision handoff, append-only resume, legacy unverified history and non-link unpublished evidence.
- publication.test.ts: 23 tests, covering the committed default-branch grant only, feature-branch and uncommitted denials, isolated commits, promotion, protection refusal, interrupted-commit recovery and the exposed transferred pending commit.
- analysis.test.ts: "no-filesystem mode creates no journal".

Before running the commands, the launcher asserted pass true for publication-h, i, j, l, m and n, and for second-actor-no-push. In the fresh replay receipt, the read-only request yields kind external-draft with commit false and push false. Limitations: synthetic local-bare transports only; no real GitHub publication; the native runs were not rerun.

CRITERION: AC-05 Newly authored compatible repairs use bounded-maintenance checks and independent review, selected bot-batch delivery preserves the declared consumer procedure, wider changes use the feature loop, and remote or live actions stay within owner and consumer permissions after revalidation.
VERDICT: met
EVIDENCE: Command 01 passed maintenance-variants, the lifecycle maintenance-branch publication denials, delivery-cases, paired-review-trial, action-cases, paired-check, bot-only-trial (real go mod tidy), related-cases, builder-order and stalled-sync-trial (01.stderr:131-136, 159-161, 698-724). I inspected the following:
- proofs/authored-satellite-a-review-7/returned.txt is exactly "MODEL: claude-opus-5.5" followed by "NO FINDINGS".
- proofs/authored-satellite-a/continuation-result.json has pass true and the same original and resumed thread (01a18631-9349-7be1-ac15-2777c076bdf0).
- That result records successful_source_pushes 1 and PR headRefOid 3706784e, equal to source_target.
- Stored review R-7 is verbatim, with R-1 through R-6 preserved. Report, evidence and primary batch are unpublished.

The launcher asserted pass true for the authored-primary-b and authored-independent-a continuations, stalled-sync, bot-only-go-a (batch, second batch and cleanup), and actions-a and actions-b. Limitations: synthetic local transports only; no live dependency, merge, dispatch or helper action. The final satellite proof used frozen payload 86ee21d9, not 23fced. The unchanged Stackweaver helper's crash safety is not certified.

CRITERION: AC-06 Resuming a task preserves unrelated work and prior evidence, invalidates stale reviews/approvals and reconciles interrupted actions before retrying them.
VERDICT: met
EVIDENCE: Command 01 passed (01.stderr:141-157, 582-613, 625-638, 711):
- maintenance-resume.test.ts, including unavailable review staying pending.
- native-review "a changed Definition invalidates review".
- journal torn-event, two-real-process and linked-worktree cases.
- report fresh-process append reconciliation and unfinished-intent blocking.
- publication interrupted Git commit resume without a duplicate, and moved-ref conflict.
- paired-check rejection of a changed verification-input export.

The launcher asserted pass true for the actions-c and actions-d fresh recoveries, the publication-h interrupted commit, publication-i accepted-response-lost, and publication-n unobservable and fresh recovery. Limitations: procedural recovery against synthetic transports; no exactly-once remote guarantee.

CRITERION: AC-07 Stackweaver routes maintenance to the installed shared operation while retaining its command/model/arguments, repository facts, batching and release checks, approved satellite-helper behavior and scoped skip-leak recovery locally; an authorized sweep publishes its initial and later same-run report artifacts through the retained main-checkout route, while other consumers publish reports only under an explicit request or adopted declaration.
VERDICT: met
EVIDENCE: Command 09 ran bun test tests/agent-maintenance in the consumer at 9111242d, with VH_ADLC_PLUGIN_DIR set by check.py to the installed 23fced payload. It passed 11 tests and 127 assertions with no skips (09.stderr). Command 10 (changelog check) passed.

I inspected consumer/ against consumer-parity-baseline/ for every parity row (spec lines 960-977):
- The command keeps model: opus and $ARGUMENTS and routes to vh-adlc-maintenance. Its lines 10-13 replace baseline lines 28-29 (satellite handoff) and 31-33 (protection) with the approved helper exception, and keep the self-approval ban.
- maintenance.json keeps 8 synced and 4 independent repositories, 4 exclusions, bot_authors renovate/dependabot/stackweaver-release-bot, bot_inventory_terms renovate/dependabot/release-bot, the dashboard, the no-GHAS expectation and project_procedure agents/maintenance-project.md.
- maintenance-project.md keeps the remaining rows:
  - reusable-workflow tag and input-default checks
  - provider direct merges
  - the distribution ban
  - Renovate limits and satellite-only ecosystems
  - security mapping and no-GHAS
  - legacy unverified history
  - core/v* tags and both backlog links
  - report-only [skip ci]
  - one squash with no dependency skip
  - the merge-tree exit code
  - builder-first ordering and stalled-sync root cause
  - majors, Playwright and check-doc-coverage
  - GitVersion Tag, bump-core and sync checks
  - skip-leak recovery (lines 160-163)
  - Compose smoke stop/restore
  - the helper, green-check and raw-admin bans
  - non-forced cleanup
  - the disposition vocabulary
  - the exact Standing maintenance report publication table (lines 113-124)
- AGENTS.md:15-17 links to agents/maintenance.md and to .vh-adlc/maintenance.json.

contract.test.ts passed the helper, other agents and CLAUDE.md preservation checks. publication.test.ts proves that other consumers publish only under an explicit request or an adopted declaration. Limitations: the adapter is unmerged and unadopted, so the standing grant is not yet live. Main-checkout publication is proven only on synthetic transports. Live Claude /maintenance invocation is owner-deferred.

CRITERION: AC-08 The exact committed candidate passes native Codex and Claude CLI installation/discovery and installed-helper checks, the consumer can roll back and reapply without unrelated changes, and its adoption preflight blocks cutover until matching real marketplace verification is available.
VERDICT: met
EVIDENCE: Installation: proofs/post-r19-native-install-b/result.json (pass true, local-catalog, source 3039766d, payload 23fced, Codex and Claude hosts, reinstall restored 23fced). Command 00 proved committed 06b17134 is identical to that installed payload. Command 09 passed:
- rehearsal.test.ts: restores and reapplies only the runtime paths and preserves unrelated bytes.
- installed.test.ts: rejects an empty payload, 0.4.1 and a maintenance-shaped 0.5.99, and accepts 0.6.0. installed.ts:10 rejects any 0.x minor below 6. checks/r20-version-gate-red shows 0.5.99 was accepted before the fix.
- preflight.test.ts, two separate passing cases. The clean case asserts empty fixture status, then pass false with "expected published target absent or invalid". The dirty case adds an untracked file and rejects with "consumer migration scope is not a clean committed snapshot".

Command 01 passed the shared migration.test.ts denials (absent and local-catalog proof, wrong or stale source, consumer, version, model or payload, missing hosts or helpers) and valid-receipt parsing without a publication claim. The consumer manifest records minimum_plugin_version 0.6.0 and adoption_state pending-published-marketplace-proof. Limitations: no real published-marketplace install exists. Under the accepted Design, that blocks cutover before consumer merge and is not a source-gate prerequisite. The clean consumer case is denied because the published target is absent, before the receipt branch; shared tests cover the receipt branch.

CRITERION: AC-09 Actual bounded Codex and Copilot report-stage trials follow the shared analysis procedure and retained consumer policy, and required regression and trial checks pass without implying untested delivery or GUI support or changing deferred workflows.
VERDICT: met
EVIDENCE: All 12 launcher commands exited 0 at 06b17134 and 9111242d:
- bun test tests/vh-adlc: 598 pass, 2632 assertions.
- go test ./...: all ok, partly cached.
- go vet, go mod tidy -diff, and golangci-lint config verify and run ("0 issues.").
- github-app-registration: 34 pass.
- actionlint.
- consumer: 11 tests and the changelog check.

Command 11 replayed the policy trial into the new execution/fresh-replay directory. replay_implementation.source_commit is 06b17134, and source_sha256 7eb98667 equals the launcher's hash of committed report-trial.ts. grade.failures is [], with input digest 5e9dcce5, plugin 23fced and consumer 9111242d. The five retained files (result.json, regraded-result.json, assessment.json, consumer-plan.json and native.jsonl) stayed byte-identical. regradeDeclaredExpectationEvidence (report-trial.ts:246-253) requires the retained assessment and plan to equal the native return, so this is a regrade of the unchanged answer, not a new model answer.

I inspected the full proofs/post-r20-report-stack-policy/native.jsonl (2167 lines):
- Bash, create, edit, web_fetch and task are disabled.
- All 64 tool starts are view, grep or glob, and all stay under the input root. 59 starts have a path argument; the other 5 are grep and glob calls whose paths argument is also under the input root. There is no "..".
- There are 64 completions, one with success false.
- The result has exitCode 0 and no code changes.

The final assistant message contains the consumer-plan.json text: satellite builder first, michielvha/stackweaver second, single_squash true, skip_ci false, distribution_edits false, and "They establish no production call-site compatibility, check result or readiness." result.json retains pass false with only consumer-policy-parity.

Grader controls: checks/r20-compatibility-wording-red fails exactly that qualification, and r21-claim-boundary-red shows a mixed positive claim passing before the fix. Now trial-proof.test.ts:98-101 passes. It accepts the actual qualification and "cannot establish compatibility with production source". It rejects an unqualified claim and four claims that mix a positive claim with qualifying words, plus a wrong owner, a prefix, reversed order and skip_ci true.

compatibility.md:42-48 keeps live Claude and GUI deferred and makes no Copilot lifecycle claim. Limitations: live Claude and GUI remain unverified. The fresh replay re-used the original run's saved report (see F-01).

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: tests/vh-adlc/maintenance/report-trial.ts:260-265; execution/fresh-replay/regraded-result.json:745; proofs/post-r21-policy-replay/regraded-report-receipt.json
EVIDENCE: The fresh replay result claims "report": ".../execution/fresh-replay/maintenance-report.md", but that file does not exist. glob of execution/fresh-replay lists only the four regraded-* files. The receipt's argv passed that path as --report-output for run 09186268. The installed helper instead returned "path": ".../runtime-20261029/post-r20-report-stack-policy/maintenance-report.md" with digest fd3b4a44. That is the retained original report (manifest.json:699-701). The post-R21 replay receipt shows the same reuse. The code sets report = join(replayOutput, "maintenance-report.md") without checking the helper's returned path, and the launcher does not check the report. So the "installed report render" in a side-by-side replay resumes the original run's report rather than rendering a new one. Grades, the native answer and preservation are unaffected.
PROPOSAL: Record the helper's returned path and digest in the replay result, and fail when the claimed report is absent. Alternatively, render into an isolated run so that a fresh report is actually produced.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: plugins/vh-adlc/references/maintenance-record.md:54; consumer agents/maintenance-project.md:142
EVIDENCE: The accepted Design (spec lines 743-744) names the evidence branch `chore/maintenance-evidence-<run-id>`. The shared procedure and the consumer policy use `chore/maintenance-evidence-<run-id>-<task-id>`, and report.ts:204 accepts either form. The per-task form still keeps evidence refs unique and local, but it differs from the accepted ref name.
PROPOSAL: Either record the per-task suffix as an accepted refinement through the normal revision route, or align the procedure with the Design name.

### R-23

CRITERION: AC-01 A project can discover and invoke shared dependency/security maintenance through the installed vh-adlc plugin without a harness-specific procedure or a Stackweaver checkout dependency.
VERDICT: met
EVIDENCE: I ran /home/m/code/.maintenance-review-archive/implementation-r23/input/check.sh once. It printed {"pass_": true, "commands": 12, "preserved": true}. execution/receipt.json shows all 12 commands exited 0. The source head was 2a9aa910e1757a27bc736047439a1a848cd5623e and the consumer head was 9e1af57f34b51b230eb2a4271416ca7bcc166ca3. Head, index, empty status and refs were identical before and after. The receipt also reports 446 source objects, 201 proofs and 34 required positive results verified. Command 00 printed {"version":"0.6.0","digest":"bed9339394aee9d4f45e54962751eb2e9ca1c06c5011ad8f4e3d2d6ceaba0ea9","files":66,"exact":true}, so committed plugins/vh-adlc at 2a9aa910 is byte- and mode-identical to the Codex-installed post-R22 payload. Command 01 (bun test tests/vh-adlc) passed 599 tests and 2640 assertions with 0 failures, including:
- discovery.test.ts: "maintenance is a discoverable model-neutral operation with one canonical procedure" and "intake keeps existing routes and adds sweep/resume without granting publication"
- settings.test.ts: "an unconfigured project has one repository and creates no settings or output"
- collection.test.ts: "the collector's runtime import graph does not load triage execution or the controller"
(01.stderr:527, 570, 657-658)

I inspected proofs/post-r22-native-install/result.json. It has kind local-catalog, source_commit 1d8bc8ae47dac829e6fe0612386c05ea54ab4936 (the candidate_commit in targets.json), Codex CLI 0.163.0 and Claude Code 2.1.309, and payload bed93393 on both hosts. Both hosts discovered the same eleven skills, including vh-adlc-maintenance. The installed settings, collection, start and report helpers exited 0 with input and index digests unchanged. reinstall restored bed93393, model_invocations is 0 and both grades pass. Limitations: these are local-catalog development installs, not published-marketplace installs. I inspected the native install results; I did not rerun them.

CRITERION: AC-02 A sweep respects explicit repository scope, includes configured dependency/sync bot PRs, unknown-bot inventory gaps, dashboard work and security alerts, and distinguishes documented unavailable surfaces from incomplete collection without declaring affected work ready.
VERDICT: met
EVIDENCE: In command 01 at 2a9aa910, every settings.test.ts and collection.test.ts case passed (01.stderr:526-579). They cover:
- fixed GET argv
- every page collected, with unknown bots kept as gaps
- documented unavailable scanning reported as n/a while Dependabot stays complete
- unmatched 403, 404 and 429 responses treated as incomplete
- partial pages
- configured dashboard-only work, with ambiguity left incomplete
- organization gaps without widened explicit scope
- normalized bot matching
- newly enabled scanning
- the 1000-suite cap
- stale combined status

analysis.test.ts "every coverage case binds its own collected JSON object and rejects a sibling surface" passed (01.stderr:654). consumer/.vh-adlc/maintenance.json:21-22 and 30-37 declare the exact bot_authors and bot_inventory_terms and the 403 literal-message expectation. In this run's execution/fresh-replay/regraded-report-receipt.json, monorepo code_scanning is complete-unavailable with a null count and the declared reason. The provider Dependabot surface is incomplete with a null count and the reason "Fixture interrupted second page". Limitations: fake-CLI and synthetic inventories only; no live GitHub collection.

CRITERION: AC-03 Maintenance decisions use actual version/changelog, code-usage and source-ownership evidence, keep major migrations separate and leave ambiguous or mixed changes unresolved.
VERDICT: met
EVIDENCE: Command 01 passed analysis.test.ts "graders require every exact item/class and cited input, with no invented collection or live actions" and all eight trial-proof.test.ts cases (01.stderr:645, 679-686). I inspected the retained trials:
- proofs/final-report-codex/result.json: pass true, component 5f52f789.
- proofs/final-report-copilot: result.json retains pass false with "coverage:example/project:code_scanning:required-evidence", beside regraded-result.json pass true on the same component. Its correction note states that no classification, count, action, model, tool or input requirement changed. The sibling-surface negative still rejects in this run.
- proofs/final-report-stack-policy/result.json: pass true.
- Command 11 re-executed the post-R20 policy replay from committed 2a9aa910 with grade failures [] (see AC-09).

Limitations: synthetic corpus and source samples only. Production call-site compatibility remains unverified, and the consumer plan says so.

CRITERION: AC-04 Each sweep permitted to write local artifacts preserves a durable, uniquely named report covering every discovered PR, security reconciliation and unresolved work without overwriting history or claiming completion from missing data; a sweep forbidden from all filesystem writes returns chat-only findings without claiming a saved report.
VERDICT: met
EVIDENCE: Command 01 passed (01.stderr:581-654):
- journal.test.ts: 8 tests.
- report.test.ts: 22 tests, covering same-day reservation, the two-process unsuffixed race, report-role refs forcing a suffix, cross-host relocation, published-collision handoff, append-only resume, legacy unverified history and non-link unpublished evidence.
- publication.test.ts: 23 tests, covering the committed default-branch grant only, feature-branch and uncommitted denials, isolated commits, promotion, protection refusal, interrupted-commit recovery and the exposed transferred pending commit.
- analysis.test.ts: "no-filesystem mode creates no journal".

Before running the commands, the launcher asserted pass true for publication-j, l, m and n, the publication-native c/d/e results and second-actor-no-push. In proofs/maintenance-publication-native-20261029-d/result.json:
- The intake and trunk cases each show two successful report pushes with the invocation head and index unchanged.
- The push-refusal case shows one main report commit, remote unchanged and zero successful pushes.

In the fresh replay receipt, the read-only request yields kind external-draft with commit false and push false. Limitations: synthetic local-bare transports only; no real GitHub publication; the native runs were not rerun.

CRITERION: AC-05 Newly authored compatible repairs use bounded-maintenance checks and independent review, selected bot-batch delivery preserves the declared consumer procedure, wider changes use the feature loop, and remote or live actions stay within owner and consumer permissions after revalidation.
VERDICT: met
EVIDENCE: Command 01 passed the following (01.stderr:699-725):
- maintenance-variants and the lifecycle maintenance-branch denials
- delivery-cases and paired-review-trial
- action-cases and paired-check
- bot-only-trial (real go mod tidy)
- related-cases, builder-order and stalled-sync-trial

I inspected the retained satellite proofs:
- proofs/authored-satellite-a-review-7/returned.txt is exactly "MODEL: claude-opus-5.5" followed by "NO FINDINGS".
- proofs/authored-satellite-a/continuation-result.json has pass true and the same original and resumed thread (01a18631-9349-7be1-ac15-2777c076bdf0).
- That result records successful_source_pushes 1 and PR headRefOid 3706784e, equal to source_target.
- Its launch.json binds candidate_digest 86ee21d9, the frozen T12 payload, not bed93393.

The accepted per-run evidence-ref name is now used throughout:
- Accepted Design (spec:754-755) names `chore/maintenance-evidence-<run-id>`.
- plugins/vh-adlc/references/maintenance-record.md:54 and consumer agents/maintenance-project.md:142 now use that name.
- discovery.test.ts:40-41 and consumer contract.test.ts:40 assert it and reject the per-task form.
- checks/r22-canonical-ref-red shows the failure before the fix.
- report.ts:204 still accepts historical suffixed refs, so runtime behavior is unchanged.

The launcher asserted pass true for the authored-primary-b and authored-independent-a continuations, stalled-sync, bot-only-go-a (batch, second batch and cleanup), and actions-a and actions-b. Limitations: synthetic local transports only; no live dependency, merge, dispatch or helper action. The unchanged Stackweaver helper's crash safety is not certified.

CRITERION: AC-06 Resuming a task preserves unrelated work and prior evidence, invalidates stale reviews/approvals and reconciles interrupted actions before retrying them.
VERDICT: met
EVIDENCE: Command 01 passed (01.stderr:582-613, 625-638, 712):
- maintenance-resume.test.ts
- journal torn-event, two-real-process and linked-worktree cases
- report fresh-process append reconciliation and unfinished-intent blocking
- publication interrupted Git commit resume without a duplicate, and moved-ref conflict
- paired-check rejection of a changed verification-input export

The launcher asserted pass true for the actions-c and actions-d fresh recoveries, the publication-h interrupted commit, publication-i accepted-response-lost, and both publication-n unobservable and fresh recovery results. proofs/authored-primary-b retains stale-source, stale-definition and stale-verification results beside its passing continuation. Earlier failed reviews remain retained. Limitations: procedural recovery against synthetic transports only; no exactly-once remote guarantee.

CRITERION: AC-07 Stackweaver routes maintenance to the installed shared operation while retaining its command/model/arguments, repository facts, batching and release checks, approved satellite-helper behavior and scoped skip-leak recovery locally; an authorized sweep publishes its initial and later same-run report artifacts through the retained main-checkout route, while other consumers publish reports only under an explicit request or adopted declaration.
VERDICT: met
EVIDENCE: Command 09 ran bun test tests/agent-maintenance in the consumer at 9e1af57f, with VH_ADLC_PLUGIN_DIR set by check.py to the installed bed93393 payload. It passed 11 tests and 129 assertions with no skips (09.stderr). Command 10 (changelog check) passed.

I compared consumer/ with consumer-parity-baseline/ for every row of the parity table (spec:971-988):
- The command keeps model: opus and $ARGUMENTS and routes to vh-adlc-maintenance. Its lines 10-13 replace baseline lines 28-29 (satellite handoff) and 31-33 (protection) with the sanctioned helper exception, and keep the self-approval ban.
- maintenance.json keeps 8 synced and 4 independent repositories, 4 exclusions, bot_authors renovate/dependabot/stackweaver-release-bot, bot_inventory_terms renovate/dependabot/release-bot, the dashboard, the no-GHAS 403 expectation and project_procedure agents/maintenance-project.md.
- maintenance-project.md retains the hard rules (lines 32 and 128-132):
  - no self-credit
  - conventional commits
  - the distribution ban
  - no skip for dependency commits
  - one squash
- It also retains:
  - repository inventory and supplemental organization discovery (11-32)
  - reusable-workflow tag and input-default checks, provider direct merges, registry and operator (21-29)
  - sync mapping, mixed-ownership splits and builder-first GOTOOLCHAIN ordering (34-43)
  - stalled-sync root cause and regression closure (43-46)
  - Renovate limits, immediate security and satellite-only ecosystems (50-57)
  - security mapping, posture, no-GHAS and legacy unverified history (59-72)
  - report frontmatter, core/v* tags and both backlog links (76-85)
  - report-only [skip ci] through the main checkout and the pending handoff (87-100)
  - the exact Standing maintenance report publication table (113-124)
  - the merge-tree exit code and go mod tidy normalization (134-138)
  - majors, make test-e2e-k8s (consistent with CLAUDE.md:178), Playwright and check-doc-coverage.js (147-151)
  - GitVersion Tag, bump-core, sync-* and bot auto-close (153-158)
  - scoped skip-leak recovery (160-163)
  - Compose smoke stop and restore (165-170)
  - the helper, green-check, raw-admin and protection bans (174-182)
  - non-forced cleanup and the disposition vocabulary (184-192)
- AGENTS.md:15-17 routes through agents/maintenance.md to the installed operation and settings.

contract.test.ts verified the helper SHA-256 4eda2ba3 and no diff in CLAUDE.md, .githooks, other agents or other commands. publication.test.ts proves that generic consumers publish only under an explicit request or an adopted committed declaration. The maintenance-publication-native-d proof shows initial and later same-run report-only pushes on main and on a differently named trunk branch. Limitations: the adapter is unmerged and unadopted, so the standing grant is not yet live. Main-checkout publication is proven only on synthetic transports. Live Claude /maintenance invocation is owner-deferred.

CRITERION: AC-08 The exact committed candidate passes native Codex and Claude CLI installation/discovery and installed-helper checks, the consumer can roll back and reapply without unrelated changes, and its adoption preflight blocks cutover until matching real marketplace verification is available.
VERDICT: met
EVIDENCE: Installation: proofs/post-r22-native-install/result.json shows pass true, local-catalog, source 1d8bc8ae, payload bed93393 on both the Codex and Claude hosts, eleven-skill discovery, helpers preserving input and index, and reinstall restoring bed93393. Command 00 proved that committed 2a9aa910 is byte-identical to that installed payload, so the review target adds no production change after the candidate.

Command 09 passed:
- rehearsal.test.ts: restores and reapplies only the runtime paths and preserves unrelated bytes.
- installed.test.ts: rejects an empty payload, 0.4.1 and a maintenance-shaped 0.5.99, and accepts 0.6.0. installed.ts:10 rejects any 0.x minor below 6. checks/r20-version-gate-red shows that 0.5.99 was accepted before the fix.
- preflight.test.ts, two separate passing cases:
  - The clean case asserts empty fixture status, then pass false with "expected published target absent or invalid".
  - The dirty case adds an untracked file and rejects with "consumer migration scope is not a clean committed snapshot".

Command 01 passed the shared migration.test.ts cases (01.stderr:663-670):
- denials for absent and local-catalog proof
- denials for wrong or stale source, consumer, version, model or payload
- denials for missing hosts or helpers
- valid-receipt parsing without a publication claim
- rollback and reapply byte preservation

The consumer manifest records minimum_plugin_version 0.6.0 and adoption_state pending-published-marketplace-proof. Limitations: no real published-marketplace install exists. Under the accepted Design (spec:1210-1224), that blocks cutover before consumer merge and is not a source-gate prerequisite.

CRITERION: AC-09 Actual bounded Codex and Copilot report-stage trials follow the shared analysis procedure and retained consumer policy, and required regression and trial checks pass without implying untested delivery or GUI support or changing deferred workflows.
VERDICT: met
EVIDENCE: All 12 launcher commands exited 0 at 2a9aa910 and 9e1af57f:
- bun test tests/vh-adlc: 599 pass, 2640 assertions.
- go test ./...: all ok, partly cached.
- go vet, go mod tidy -diff, and golangci-lint config verify and run ("0 issues.").
- github-app-registration: 34 pass.
- actionlint.
- consumer: 11 tests and the changelog check.

Fresh replay (command 11, into execution/fresh-replay):
- It used the original matching installed 23fced payload.
- replay_implementation.source_commit is 2a9aa910, and source_sha256 9df7ac57 matched the launcher's hash of the committed report-trial.ts.
- grade.failures is [], with input digest 5e9dcce5, plugin 23fced and consumer 9111242d.
- The five retained files (result.json, regraded-result.json, assessment.json, consumer-plan.json and native.jsonl) stayed byte-identical.

Report path and digest (R-22 recheck):
- The receipt argv requested --report-output execution/fresh-replay/maintenance-report.md.
- The helper returned the existing same-run path runtime-20261029/post-r20-report-stack-policy/maintenance-report.md with digest fd3b4a44.
- regraded-result.json:745-747 records that actual path and digest with report_reused true. It makes no claim to have created the requested output.
- The launcher verified the file's SHA against report_digest.
- verifyRenderedReport (report-trial.ts:28-32) rejects absent, changed or unrelated reports, which trial-proof.test.ts:10-24 exercises. checks/r22-report-receipt-red shows the verifier missing before the fix.

I inspected the full proofs/post-r20-report-stack-policy/native.jsonl (2167 lines):
- Bash, create, edit, web_fetch and task are disabled.
- All 64 tool starts are view, grep or glob, and each has a path or paths argument under the input root, with no "..".
- There are 64 completions. Only line 32 failed, a grep regex error.
- Every model field is claude-opus-5.5.
- The result has exitCode 0 and no code changes.

The final assistant message (line 2164) contains the consumer-plan.json text: satellite builders first, michielvha/stackweaver second, single_squash true, skip_ci false, distribution_edits false, and "They establish no production call-site compatibility, check result or readiness." result.json retains pass false with only consumer-policy-parity.

Grader controls:
- checks/r20-compatibility-wording-red fails on exactly that qualification.
- checks/r21-claim-boundary-red shows a mixed positive claim passing before the fix.
- trial-proof.test.ts:110-121 now accepts the actual qualification and "cannot establish compatibility with production source".
- It rejects an unqualified positive claim, four claims that mix a positive claim with qualifying words, a wrong owner, a stackweaver-extra prefix, reversed order and skip_ci true.

The retained post-R19 plan names "primary michielvha/stackweaver", and its initial rejection is retained. regradeDeclaredExpectationEvidence (report-trial.ts:251-258) requires the retained assessment and plan to equal the native return, so every replay re-grades an unchanged answer and is not a new model answer. The Codex generic trial passed, and the Copilot generic trial passed on regrade with its failure retained.

compatibility.md:38-48 records the 1d8bc8ae local-catalog result, keeps marketplace cutover pending and keeps live Claude and GUI deferred, with no Copilot lifecycle claim. Limitations:
- Live Claude and GUI remain unverified.
- The policy trial binds consumer 9111242d. The later 9e1af57f policy change is the evidence-ref wording only, and no new model run covers it.

FINDING: F-01
KIND: judgement
SEVERITY: nit
WHERE: tests/vh-adlc/maintenance/report-trial.ts:33-41 (qualifiesProductionCompatibility); tests/vh-adlc/maintenance/trial-proof.test.ts:117-120
EVIDENCE: The subject pattern only recognizes "production(?: call[- ]site)? compatibility" or "compatibility with production ...". After one qualified phrase is removed, the remainder is checked only for that subject and for "is|was|has been proven/verified/...". A plan such as "Production compatibility is unverified. The samples prove call-site compatibility." or "Production compatibility is unverified, but the bump is compatible with all call sites." therefore passes, although it asserts compatibility over call sites from samples. The negative controls cover only claims that repeat the word "production". The actual retained answers (post-R19 and post-R20) are correct denials, so no verdict changes.
PROPOSAL: Add negative controls for positive call-site or compatible-with claims that omit the word "production". Also extend the remainder check to reject any positive compatibility assertion, not only the "production" subject forms.
## Sources

- [Pinned agent entry](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/AGENTS.md): task routes and preservation of local instructions.
- [Feature documents](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): normative scope, independent reviews, owner acceptance and evidence rules.
- [Feature template](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/feature-document-template.md): one feature document with required sections.
- [Delivery conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): exact versions, documents-first implementation claim and publication order.
- [Coding conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/coding.md): reuse existing helpers and separate orchestration from substantive logic.
- [Documentation conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/documentation.md) and [prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): authoritative artifact location and writing rules.
- [Stackweaver maintenance baseline](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/agents/maintenance.md), [command](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/.claude/commands/maintenance.md), [project rules](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/CLAUDE.md), [local helper](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/scripts/satellite-merge.sh), [security policy](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/docs/internal/plans/infrastructure/ci-release/security-alert-maintenance.md) and [standing backlog](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/docs/internal/plans/infrastructure/ci-release/dependency-maintenance-backlog.md): consumer scope and preserved project-specific behavior; historical counts and capability claims are not current inventory evidence.
- [Stackweaver entry](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/AGENTS.md): harness-neutral project routing and required local instructions.
- [API sync](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/.github/workflows/sync-api.yml) and [frontend sync](https://github.com/michielvha/stackweaver/blob/5383332c4e836fe7c33f59042186df7f314f49da/.github/workflows/sync-frontend.yml): actual mapping and exclusion examples, not an assumed universal satellite layout.

- [GitHub check-run API](https://docs.github.com/en/rest/checks/runs?apiVersion=latest#list-check-runs-for-a-git-reference): the aggregate endpoint covers at most 1000 suites; enumerate suites and their runs beyond that boundary. Read 2026-10-29.
- [GitHub combined-status API](https://docs.github.com/en/rest/commits/statuses?apiVersion=2026-03-10#get-the-combined-status-for-a-specific-reference): paginated status wrappers, commit SHA and total_count shape. Read 2026-10-29.

- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins): local/Git marketplace installation and native plugin structure; checked alongside actual Codex CLI help and isolated native installation/discovery on 2026-10-29.

