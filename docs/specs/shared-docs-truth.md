---
status: in-progress
status_description: "The owner accepted the spec after clean review R-4. Implementation is claimed."
issue: https://github.com/michielvha/vh-adlc/issues/127
branch: feat/shared-docs-truth
goal: "Run a bounded, evidence-backed documentation truth review through vh-adlc and preserve Stackweaver's existing command and verification history."
covers:
  - plugins/vh-adlc/skills/vh-adlc-docs-truth/
  - plugins/vh-adlc/references/docs-truth.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/examples/docs-truth/
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/triage/discovery.test.ts
  - tests/vh-adlc/docs-truth/
  - docs/get-started/installation.md
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - docs/reference/marketplace.md
  - .github/workflows/ci.yml
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
---

# Plan: Shared documentation truth review

## Context

### Owner summary

Move the claim-by-claim part of Stackweaver's `/docs-truth` into vh-adlc. It checks factual statements against the current source tree, such as a documented default port or command. It revisits old docs and agent instructions even when their links still work and no recent patch points to them.

The shared entry runs only on request. By default it reviews the next batch and returns findings in the session. The separate `report` mode reads recorded freshness. Stackweaver keeps its 15-document default, selector, verification history and `/docs-truth` entry point.

Stackweaver's native command keeps its authorized fixes, ledger updates and docs-only delivery. An explicit read-only request leaves the checkout and ledger untouched. A complete review can advance freshness with unknown claims visibly flagged. Targeted reviews keep their own ledger mode. An interrupted review or pending correction leaves that document's completed history alone.

The native selector returned its expected batch. The owner confirmed the write and ledger rules. Independent spec review R-4 returned no findings. The next proof compares the ordinary installed plugin with the current Stackweaver command, exercises the existing ledger and rehearses rollback. The shared package will ship first. Its feature stays open until the published install and Stackweaver cutover pass. Acceptance authorizes building and testing this scope. Publication, release and cutover need their own authorization.

### Background

The migration roadmap records that Stackweaver kept its native docs-truth entry, selector and ledger. Shared docs impact starts from a selected change. Shared docs drift starts from scanner findings and can recheck earlier proposals. The docs-drift spec explicitly excludes rolling claim review and its ledger. See [migration roadmap](shared-workflow-migration.md#capability-roadmap), [docs-drift scope](shared-docs-drift.md#scope) and [workflow guide](../user-guides/workflows.md#documentation-impact).

Operator observations at private Stackweaver baseline `72e48ed577af958034d6aa598e2835ef36ccdb8c` establish the legacy comparison target. The command declares `next [N]`, `sweep <path>...`, `meta` and `report`. The selector orders tracked Markdown by verification history, code changes and age. `node scripts/docs-truth-shard.js` returned 15 paths, matching the first 15 entries from `--report` with their reasons. This exercised selection and freshness. The command and playbook supply the remaining behavior to exercise in the parity trial. See the exact consumer sources below.

## Scope

Ship an interactive `vh-adlc-docs-truth` skill, its canonical procedure and one runnable example. Teach generic intake to route explicitly requested rolling factual review to it. Adopt the skill in Stackweaver after installation and behavior checks. Keep the existing selector script and ledger as the source of batch ordering and history there.

The shared operation covers documentation and agent instructions. Repositories own their source checks, selection policy, ledger, protected files, corrections and any writes. The scheduled docs-drift scanner, proposal and recovery workflows, docs impact and codebase audit retain their existing routes. The shared operation adds no server, scheduler, publisher, ledger format or model dependency.

## Design

### Shared procedure

The skill loads `.vh-adlc/docs-truth.md` from the assessed Git commit. The instructions declare the eligible tracked paths, exclusions, a positive default batch limit, the read-only selector or selection procedure, how to obtain freshness, and how to collect source evidence. They may point to the existing local verification record. Missing or invalid setup stops with the path and a link to the checked example. The example uses a small Git repository with a local selection and history procedure.

With no arguments, run `next` at the project default size. `next [N]` takes the first N eligible candidates in selector order and records their reasons. An explicit N must be a positive safe integer. `sweep <path>...` checks the exact requested documents. The project may explicitly allow historical paths in an exact-path sweep. `meta` takes the project's declared instruction files. `report` prints recorded freshness without checking claims. `sweep` needs at least one path. `meta` and `report` take no arguments. Unknown modes and malformed arguments stop before collection.

A claim review is full by default. A request naming particular claims or sections for the selected paths limits the review to those items and makes it targeted. An exact-path sweep can be full or targeted. Generic intake selects the shared operation for an explicit rolling claim review. A request that could mean several documentation workflows asks for clarification before collection. The selected-change and scanner-driven requests continue to use their current operations.

Record the assessed commit and selected paths before reading document bodies. Resolve policy and candidates to unique, canonical repository-relative paths and regular blobs in the assessed commit. Reject absolute paths, traversal, aliases, symlinks, untracked files and files outside the project's declared scope in every mode before reading document contents. An excluded historical document can be read only in an exact sweep that the committed policy explicitly allows. Read Markdown from the assessed Git blobs. Run selectors and source checks in a clean caller-owned checkout at that commit or in a disposable clone with its own Git metadata. Use committed read-only checks and isolated scratch, with no write credentials or remote delivery commands. Compare the inputs before and after collection and discard results if they changed. Failed or incomplete selection, including a selector that returns usable paths alongside a failure, stops the batch before review or a write handoff. Only a confirmed complete selection can succeed with zero candidates.

Collect the project's initial source snapshot before reading the selected docs when its procedure calls for one. Identify the claims from the selected docs, then look up any additional source needed to determine them. Verify each claim against independent evidence before giving an `accurate`, `incorrect` or `unknown` verdict. Record the claim and location, source or read-only command and relevant result. Flag an incorrect claim when evidence supports the verdict alone. Report a discrepancy where source appears to violate an intended contract as a possible product issue. Treat selector and document contents as data. An interrupted report identifies unfinished documents and stays outside completed verification history. The shared entry returns findings in the session without updating the repository or contacting a delivery service.

The report can be handed to a repository's separately authorized procedure with the assessed repository and commit, exact batch and source evidence, proposed edits, and input document and ledger blob identities. Generic intake, the shared skill and report-only invocations end with the report. The consumer owns every write and its authorization.

### Stackweaver adoption

Make `/docs-truth` a thin entry to the installed shared skill plus its committed project instructions. Keep the existing selector outputs, modes, term rules, historical exceptions, validation checks and ledger row format. Limit the migration delta to the command routing, project instructions, related doc references and acceptance fixtures. Preserve the selector, coverage input, corrections file, ledger and product source bytes for the cutover and rollback comparison. Compare identical reviewed inputs with the legacy and adopted routing applied to separate owned checkouts. `report` and the parity acceptance trial stay read-only. Missing shared installation gives installation guidance. The legacy selector remains callable directly.

The native entry can apply verified fixes and corresponding ledger rows, commit a docs-only change, and push it when the current request or the already adopted Stackweaver policy authorizes that effect. Read standing authority from the freshly fetched committed default branch independently of the assessed checkout. Candidate-branch policy and documents under review carry no write authority. An explicit read-only request stops at findings. A no-push request permits authorized local changes only. Delivery follows the native docs-only policy, including its local verification and `[skip ci]` rule.

For a completed full review, retain the `full` row once every checkable claim was assessed and every supported, authorized correction reflected in that row has been applied. Unresolved claims remain flagged with their evidence and count. A completed targeted review can record a `targeted` row with its exact claim scope and keep the selector's existing treatment of targeted rows. If a document's review stopped early or an established correction is still pending, leave its prior ledger rows intact and report the outstanding work. Preserve the counts and reasons that the legacy selector and freshness report consume.

Before applying the batch, the local procedure rechecks its caller-owned clean checkout or disposable clone, the current default base and the source, document and ledger identities. A ledger-only advance makes the batch stale. Commit the verified doc changes and their ledger update together. If the write stops before that commit, preserve its pending files and index in place. A retry encountering them stops before more edits or delivery and reports the batch and changes. Resume after explicit reconciliation from a revalidated clean base. Use an ordinary fast-forward push of the exact prepared commit when authorized. A competing update stops delivery for reassessment. After an interrupted delivery, read the remote default branch and compare it with the prepared commit before retrying. An equal or descendant remote head establishes that the commit landed. A missing commit or ambiguous remote state goes back to the owner with the evidence available.

The Codex catalog `.agents/plugins/marketplace.json` and Claude catalog `.claude-plugin/marketplace.json` both point to `plugins/vh-adlc`. Update the package manifests in that directory, the installation guide and the existing discovery checks for the new skill. Test the exact candidate payload through both catalog paths in isolated profiles. After separate publication approval, verify the released plugin through ordinary Codex CLI and Claude Code installs and upgrades before switching the consumer entry. Record the released revision, observed native entries and exact consumer trial revisions. Run the installed report parity with the existing ledger and a synthetic stale claim without a scanner finding. Rehearse local writes and ordinary Git delivery with synthetic documents and history in disposable clones attached to a local bare remote.

Use a committed rerun script at `tests/vh-adlc/docs-truth/native-trial.ts` for the shared example, intake and installed CLI scenarios. Stackweaver keeps its parity and write scenarios at `tests/agent-docs-truth/native-trial.ts`. Each runner records the assessed commit, skill or legacy command, selected mode, actual execution transcript, and pass conditions defined below. Keep private consumer inputs and transcripts with the consumer's authorized evidence. Revert and reapply the routing changes in a disposable clone to check both entries with the original ledger.

Review the exact candidate before publication and identify which criteria need published or adopted evidence. Use one separately authorized in-progress implementation PR from `feat/shared-docs-truth` into vh-adlc `main`. After merge, run the branch helper with `--worktrees false` to retain the clean local `feat/shared-docs-truth` checkout for the completion gate and retire the merged remote head. Fast-forward that local branch to the fetched merged `main`. Record released install and exact consumer observations there after the approved cutover. Run independent review and `vh-adlc gate complete` on the retained branch. Publish the reviewed docs-only completion record as an authorized fast-forward to `main` and verify its containment. That ends feature delivery. The advanced local branch goes through the ordinary approved cleanup plan when eligible. Report a branch the helper retains. A branch protection refusal leaves the completion record local for the owner.

### Terms

| Term | Meaning |
| --- | --- |
| Batch | The documents selected for one review. |
| Full review | An assessment of every checkable claim in one document. |
| Targeted review | Review of specified claims in one document. |
| Accurate | The observed source supports the claim. |
| Incorrect | The observed source contradicts the claim. |
| Unknown | The available evidence cannot establish the claim's accuracy. |

## Acceptance Criteria

- [ ] AC-01: A repository can run the installed operation against its own selected documentation, repository instructions and source through a harness-neutral procedure. Selection stays within the requested mode, rejects invalid paths and stops an incomplete batch before review or delivery.
- [ ] AC-02: The review distinguishes accurate, incorrect and unknown claims using observed evidence. It exposes unsupported corrections and possible product issues, records full and targeted coverage accurately, and leaves the checkout and history intact in a report run.
- [ ] AC-03: Stackweaver's existing entry keeps its selection, evidence, authorized corrections and docs-only delivery with old verification history. Complete reviews retain visible flags, targeted reviews retain their mode, and pending or interrupted work leaves prior rows intact. Competing or stale inputs stop delivery, and an exact landed commit is recognized before retrying. Reverting the consumer adoption restores the previous entry without rewriting the history.
- [ ] AC-04: The published marketplace payload supports ordinary Codex CLI and Claude Code installation, upgrade and discovery. Each native entry completes the declared read-only fixture through the same canonical procedure. The adoption and its verified surfaces are documented.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Run the checked example through the installed skill in default, sized next, sweep, meta and report modes. Compare exact paths and reasons. Reject invalid arguments, duplicate and aliased paths, an escaped path, an untracked path, policy and document symlinks, an excluded regular blob, missing policy and failed selectors. A partial selector that reports failure after yielding a valid path stops before reading the path or preparing a write handoff. Verify that an allowed exact sweep can read a historical file that automatic selection excludes. A confirmed empty selection succeeds with zero candidates. A tracked path replaced on disk after validation is either read from the original blob or the run stops. Exercise direct and generic intake and show ambiguous intake requests clarification before collection. Check existing docs-impact and docs-drift routes. |
| AC-02 | Review a fixture where the claimed port is incorrect and the source gives a replacement, the external backend mention and example command are accurate, the unverifiable default is unknown, and the intended-contract conflict is flagged without a doc edit. Make one source target discoverable only after reading a claim and verify the verdict cites it. Verify an unsupported replacement is flagged. Compare exact claims and coverage for full and targeted runs. Interrupt the report and verify unfinished work remains visible. Compare Git tree, index, ledger and ignored input state before and after the report. Confirm the freshness-only mode does not read document bodies. |
| AC-03 | Record the exact legacy and installed adapter revisions plus common corpus, source, coverage and ledger identities. Compare selections, reasons, freshness, modes, forwarded commands, verdicts and proposed effects. In disposable clones, exercise an authorized local write and assert its exact docs and ledger diff, local validation and commit policy. Assert the ledger and next selection after a full review with unknown claims, a targeted review and a pending correction. Interrupt after the first local edit and before committing. Retry and verify the pending files and index stay intact, with no new commit or push. Check read-only, no-push and candidate-grant refusal paths against a local bare remote. Exercise a changed source snapshot, a ledger-only advance, two writers from one base, and a successful push with a lost response. Revert and reapply the routing while preserving the original ledger bytes. |
| AC-04 | Before merge, install the exact candidate package from both catalogs pointed at an owned checkout. Confirm the two manifests, package bytes, discovery checks and installation inventory. After separately approved publication, freshly install and upgrade the released package through the actual marketplace in isolated Codex CLI and Claude Code profiles. Match the released source, discover the skill and run the same report fixture through each native entry. Verify the compatibility entry and workflow guide describe the observed run. |

## Tasks

- [ ] T1 `plugins/vh-adlc/skills/vh-adlc-docs-truth/SKILL.md`, `plugins/vh-adlc/references/{docs-truth,lifecycle}.md`, package manifests, discovery tests and installation guides - the package discovers and routes the on-demand skill through one shared read-only procedure, and the existing docs routes still pass discovery checks (AC-01, AC-02, AC-04)
- [ ] T2 `plugins/vh-adlc/examples/docs-truth/` and `tests/vh-adlc/docs-truth/` - a runnable fixture covers selected paths, complete and partial selection, and the expected evidence and verdicts without writing the assessed checkout (AC-01, AC-02)
- [ ] T3 `tests/vh-adlc/docs-truth/native-trial.ts` and compatibility and marketplace guides - run the committed shared fixture through both candidate catalog paths and retain the exact package, native discovery and report transcripts (AC-01, AC-02, AC-04)
- [ ] T4 Stackweaver's `.claude/commands/docs-truth.md`, `.vh-adlc/docs-truth.md` and `tests/agent-docs-truth/native-trial.ts` - prepare the unpublished routing and consumer proof, including legacy comparison, authorized writes, recovery and rollback in disposable clones (AC-03)

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-19 | R-1 | spec | `9f5c531346a95f7419c7b81b8366a470929b6e92` | unknown | procedural | Three blocking and six should-fix findings. |
| 2026-11-19 | R-2 | spec | `15108beb46ba30de104af0c46212f162738d8834` | unknown | procedural | One blocking and five should-fix findings. |
| 2026-11-19 | R-3 | spec | `0f910f12b9473d7956c5dc1fcedd9a873986e44b` | unknown | procedural | Two should-fix findings. |
| 2026-11-19 | R-4 | spec | `f06f8906ae4801b062c29957269b42f375ef442a` | unknown | procedural | No findings. |
| 2026-11-19 | R-4 | spec | `f06f8906ae4801b062c29957269b42f375ef442a` | n/a | n/a | accepted by owner |

### R-1

TARGET: 9f5c531346a95f7419c7b81b8366a470929b6e92
FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Owner summary (lines 26-28), Scope (lines 38-40), Shared procedure (lines 46, 50, 52-54), Stackweaver adoption (lines 58-60), AC-01 through AC-03 and their Test Plan rows (lines 72-74, 81-83), Open Questions (lines 90-92)
EVIDENCE: The design reads policy from the selected checkout and allows a project command to select a write procedure "under committed local authority." A committed candidate branch can carry both the command and its purported grant. No rule identifies the authoritative policy revision or the allowed effects. The Stackweaver entry also has no precedence rule for an explicit report-only or no-push request. `plugins/vh-adlc/references/authority.md:3-6,42-50` says routing creates no permission and the current task retains its limits.
PROPOSAL: Ask the owner which existing Stackweaver invocations carry which local and remote effects, then document the current authorization or already adopted policy that each effect needs. Keep the shared invocation and generic intake read-only, enforce caller restrictions at the handoff, and test that a candidate policy and a report-only invocation cannot activate the writer.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Owner summary (lines 26-28), Scope (lines 38-40), Shared procedure (lines 50-54), Stackweaver adoption (lines 58-60), AC-03 and its Test Plan row (lines 74, 83)
EVIDENCE: The write path checks changed source or documents and the base of its isolated checkout. Two writers can pass those checks in different checkouts against one ledger snapshot. The design gives no way to detect a ledger-only change, identify a prior application, or distinguish a delivered batch from one whose push response was lost. The proposed local-commit retry case does not observe an accepted push with a lost response or a second writer at the delivery boundary.
PROPOSAL: Bind the consumer handoff to the assessed source, document and ledger revisions and define how its existing writer rejects competing or stale applications and recognizes the exact prior result before retrying. Prove the overlapping writer, ledger-only advance and lost-response retry against disposable consumer state and a local bare remote, or narrow the delivery guarantee to the effects the retained consumer procedure can establish.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Owner summary (lines 26-28), Scope (lines 38-40), Shared procedure (lines 46-48, 52-54), Stackweaver adoption (lines 58-60), Terms (lines 66-68), AC-02 and AC-03 and their Test Plan rows (lines 73-74, 82-83)
EVIDENCE: The design describes full and targeted review, leaves unknown claims visible and bars interrupted reports from completed history. It gives no rule for whether a completed targeted review, an unresolved unknown, or a document whose correction is still pending advances full-document freshness. The tests can pass if the report labels each outcome correctly while the writer records an old document as fully verified and the selector deprioritizes it.
PROPOSAL: Bind each review outcome to its permitted consumer ledger effect, preserving the meaning of existing rows. Assert the ledger state and next selection after a complete full review, a targeted review, an unknown, a pending correction and an interruption.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (lines 26-28), Shared procedure (lines 46-52), Stackweaver adoption (lines 58-60), AC-01 and AC-02 and their Test Plan rows (lines 72-73, 81-82)
EVIDENCE: The skill loads committed policy, but candidate validation is specified only as "tracked" and "non-regular." An implementation can validate against the index or a filesystem `stat` result while opening a different object from the one at the assessed commit. The fixture checks a symlink and an untracked file but does not exercise an escaped path, duplicate aliases, a policy symlink, or a tracked path changed after validation. A clean Git status also does not rule out helper side effects in ignored files, shared caches or a remote.
PROPOSAL: Define the inputs as unique repo-relative regular files from the assessed commit, validate aliases and path containment before loading policy or documents, and define the approved non-mutating method for selector and evidence commands in an owned snapshot. Test ref versus filesystem mismatches and show that rejected or interrupted runs leave the assessed repository and verification history intact.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (lines 26-28), Background (lines 32-34), Scope (lines 38-40), Shared procedure (lines 46-54), Stackweaver adoption (lines 58-60), Terms (lines 66-68), AC-01 through AC-03 and their Test Plan rows (lines 72-74, 81-83)
EVIDENCE: "The shared entry defaults to a report" can mean `report`, which reads freshness without checking claims, or a default-sized `next` review that reports findings. `sweep <path>...` selects documents but the specification gives no way to name targeted claims or say whether a sweep without a claim filter is full. Only the configured batch size is required to be positive. The generic intake proof also omits ambiguous requests and explicit direct invocations, even though `plugins/vh-adlc/references/lifecycle.md:92-99` currently sends a claim review to a selected local workflow or an unsupported handoff.
PROPOSAL: State the no-argument mode, valid explicit limits, full versus targeted selection, and which entries retain the legacy defaults. Assert missing or invalid mode arguments, explicit report-only review, the freshness-only `report` mode, and ambiguous and explicit intake cases alongside the existing docs routes.

FINDING: F-06
KIND: factual
SEVERITY: blocking
WHERE: `covers` (lines 6-15), Scope (line 38), Stackweaver adoption (lines 58-60), AC-04 and its Test Plan row (lines 75, 84)
EVIDENCE: `tests/vh-adlc/check.test.ts:23,235-241` enumerates recognized skill directories, and `tests/vh-adlc/triage/discovery.test.ts:12-23,46-52` asserts seventeen skills and the installation guide's existing count. Adding the required skill fails those existing checks without changes outside the listed scope. `docs/get-started/installation.md:105-110` enumerates the package's operations, and both package versions live in `plugins/vh-adlc/plugin.json` and `plugins/vh-adlc/.claude-plugin/plugin.json`, outside `covers`. The root marketplace manifests already point to the package directory. `.github/workflows/ci.yml:194-205` versions the repository, while `.github/workflows/release.yml:3-13` invokes the Go release workflow. AC-04's unnamed "configured path" leaves room to prove the Go release instead of the marketplace payload.
PROPOSAL: Name the catalog-to-package installation path, the package metadata and existing discovery checks that change, and cover those files and the installation inventory. Make the candidate check prove installation of the exact package through both catalog paths, and retain the separate ordinary published install and upgrade proof.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Owner summary (line 28), Scope (line 38), Stackweaver adoption (line 60), AC-03 and AC-04 and their Test Plan rows (lines 74-75, 83-84), Open Questions (lines 90-92)
EVIDENCE: The final criteria need a published marketplace package and subsequent consumer adoption. The ordinary completion route runs `vh-adlc gate complete` before the feature's delivery, while `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:74-82` expressly allows a separately requested in-progress PR with unmet criteria. The draft schedules post-release checks but omits which route publishes the incomplete feature and how review resumes after the separate consumer cutover. The pinned `conventions/delivery.md:102-117` requires exact committed review, one feature PR and real publication evidence.
PROPOSAL: Record the owner-approved in-progress publication and completion sequence, including the candidate checks needed before publication, the exact published and consumer evidence needed afterward, and when the final review and completion gate run.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (lines 26-28), Background (lines 32-34), Scope (lines 38-40), Stackweaver adoption (lines 58-60), AC-03 and its Test Plan row (lines 74, 83), Sources (lines 101-103)
EVIDENCE: The baseline command, selector and ledger behavior at `72e48ed577af958034d6aa598e2835ef36ccdb8c` are operator observations from private sources. The reported `--fast 3` check observes only selection and establishes neither the 15-document default nor dispatch, validation, ledger and delivery effects. The parity row asks one fixed snapshot to contain the old and newly routed entry without identifying the entry versions, permitted overlay, exact protected paths or retained policy checks. The public migration roadmap's Adoption contract calls for exact shared and consumer commits and verification of the actual native and harness-neutral entry points.
PROPOSAL: Preserve an operator-attested baseline with the legacy command and policy references, observed mode defaults and effects, then compare the exact old and adapter revisions over the same reviewed corpus, source and ledger inputs. Record the permitted routing delta, installed plugin identity and actual forwarded command checks, and exercise rollback and reapplication without changing the ledger.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Shared procedure (lines 48-52), Terms (lines 64-68), AC-02 and its Test Plan row (lines 73, 82)
EVIDENCE: AC-02 requires accurate full and targeted coverage and visible unsupported corrections and possible product issues. Its proof names claims and a partial run but only checks that verdicts refer to source results. A run can cite the right inputs while giving every claim the same verdict, recommending an unsupported replacement, or labelling a targeted run full. The glossary also omits the three user-facing verdicts. Pinned `conventions/feature-documents.md:121-125,163-166` requires a pass condition and glossary coverage for introduced terms.
PROPOSAL: Give each fixture claim its expected verdict, support and disposition, and assert the exact in-scope claims and coverage status for full and targeted runs. Add the verdicts to the glossary and have the fixture check their use.

### R-2

TARGET: 15108beb46ba30de104af0c46212f162738d8834
FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Owner summary (line 37), Scope (line 47), Stackweaver adoption (lines 77-79), AC-03 and AC-04 and their Test Plan rows (lines 96-97, 105-106), Open Questions (lines 112-114)
EVIDENCE: The R-1 F-07 revision adds an in-progress PR before ordinary marketplace publication and puts the completion gate after that publication and consumer cutover. `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:113-124` ends the feature branch and cleans its worktree after the authorized merge. The pinned complete gate still requires `on_feature_branch_if_set`, and `internal/gate/gate.go:103-111` compares the current branch with the document's recorded branch. The stated sequence leaves no authorized branch for the final review record and completion gate. An ordinary marketplace install from the published catalog serves a different purpose from a candidate install against an owned checkout.
PROPOSAL: Resolve the publication and completion route with the owner before acceptance. Name the actual refs and review checkpoints that make released and adopted proof possible under the existing gate and cleanup rules, or track the approved post-release obligations separately and make the shared feature's completion boundary explicit.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (line 33), Scope (line 47), Shared procedure (lines 55-61), Stackweaver adoption (line 69), AC-01 and AC-03 and their Test Plan rows (lines 94, 96, 103, 105)
EVIDENCE: The R-1 F-04 revision tightened object and path validation but removed the express out-of-scope rejection. Only `next` explicitly takes eligible candidates, while `sweep` checks exact requested documents and `meta` takes declared files. A tracked regular file outside the configured scope can satisfy the stated Git checks for those paths. The fixture has no excluded yet otherwise valid tracked path and does not show that the historical exception is confined to an explicitly permitted exact sweep.
PROPOSAL: Apply the committed eligibility and exclusions to every selection mode before reading document bodies, with the stated historical exception limited to explicitly permitted exact sweeps. Exercise an excluded regular blob and an allowed historical exact sweep, and verify that the historical file remains excluded from automatic selection.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (lines 35-37), Shared procedure (lines 63-65), Stackweaver adoption (lines 71-77), AC-03 and its Test Plan row (lines 96, 105)
EVIDENCE: The R-1 F-02 revision specifies the race at push and the lost-response retry. It removed the earlier instruction for interruption before commit. A consumer can stop after changing a document or staging part of the batch. A retry then sees changes against the input identities and has no stated way to recognize the partial attempt, preserve it, or decide whether to resume. The test row's interruption appears among ledger outcomes and can pass after cancelling the read-only review alone.
PROPOSAL: State how the existing consumer writer handles pre-commit interruption in its owned checkout, including the point at which it must stop and preserve pending changes. Interrupt after one local edit or index update, retry, and assert that no partial batch is committed or published.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Scope (line 47), Stackweaver adoption (lines 69, 77-79), AC-01 through AC-04 and their Test Plan rows (lines 94-97, 103-106)
EVIDENCE: The revised rows depend on actual agent sessions for intake, claim review, legacy forwarding and installed behavior. They describe what to observe but provide no committed way to reproduce those sessions or retain their transcripts. `plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:110-114` expressly requires a committed rerun script with retained transcript when the proof is what an agent does in a session. An operator description or a discovery test cannot satisfy that proof.
PROPOSAL: Name committed rerun entry points for the agent-session scenarios and the transcript evidence each retains. Reuse the existing lifecycle runner or a small fixture runner, keeping private consumer inputs and transcripts in the consumer's authorized evidence location.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Shared procedure (lines 61, 65), Stackweaver adoption (lines 69, 75, 77-79), AC-02 and AC-03 and their Test Plan rows (lines 95-96, 104-105)
EVIDENCE: The R-1 F-04 revision lets the shared skill use a separate owned checkout for project commands. `plugins/vh-adlc/references/authority.md:92-97` limits plugin-created linked Git worktrees to named procedures and their exceptions. The draft neither selects a permitted checkout method nor asks the owner to change that rule. A disposable clone can meet the snapshot requirement without changing the source repository's worktree metadata.
PROPOSAL: Specify the permitted ownership path for the assessment and write fixtures, such as a caller-owned checkout at the assessed commit or an isolated disposable clone. Raise an owner decision only if a new linked-worktree exception is necessary.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (lines 31-33), Shared procedure (lines 55, 59, 61-65), AC-02 and its Test Plan row (lines 95, 104)
EVIDENCE: The revision turns source independence into a literal ordering rule by requiring collection of independent source evidence before reading selected docs. In a full review, a novel claim or a targeted section can be the first information that identifies which source fact or command to check. The draft supplies only project instructions for how to collect evidence. The fixture can pass with all facts known in advance, leaving the ordinary unknown-claim case undefined.
PROPOSAL: Allow an initial inventory of trusted source locations, then identify claims from the assessed document and verify each against independent source evidence before giving a verdict. Include a claim whose relevant source target is discovered from the document.

### R-3

TARGET: 0f910f12b9473d7956c5dc1fcedd9a873986e44b
FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary (line 37), Stackweaver adoption (line 81)
EVIDENCE: The R-2 F-01 revision correctly uses `after-merge --worktrees false` to retain the checked-out feature branch through the completion gate. The final cleanup rule then says to verify containment and remove that branch through the helper. `plugins/vh-adlc/scripts/branches/branches.ts:319-330` checks containment in the original PR head for `after-merge`. The completion tip is newer, so that route keeps it. The ordinary cleanup plan also keeps a branch on default-branch history until its age check passes and needs its own approval under `plugins/vh-adlc/references/branches.md:97-122`.
PROPOSAL: State that the successful publication ends feature delivery and that the advanced local branch goes through the approved ordinary cleanup plan when it qualifies. Report the branch as retained if the helper keeps it.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Shared procedure (lines 55-65), Stackweaver adoption (lines 73-75), AC-01 and AC-03 and their Test Plan rows (lines 96, 98, 105, 107)
EVIDENCE: The initial draft explicitly made selector failure and incomplete inventory failures. The current Shared procedure requires only that a failure, skipped input or incomplete inventory stay visible. AC-01 rejects failed selectors but does not exercise a selector that returns some valid paths without completing inventory. An implementation could warn and pass that partial batch to the consumer as a successful selection.
PROPOSAL: Treat failed or incomplete selection as a failed batch, distinct from confirmed empty. Test a partial selector result and assert that it produces no successful selection or authorized write handoff.

### R-4

NO FINDINGS

## Sources

- [Stackweaver command at the checked commit](https://github.com/michielvha/stackweaver/blob/72e48ed577af958034d6aa598e2835ef36ccdb8c/.claude/commands/docs-truth.md) defines the local entry and modes.
- [Stackweaver selector at the checked commit](https://github.com/michielvha/stackweaver/blob/72e48ed577af958034d6aa598e2835ef36ccdb8c/scripts/docs-truth-shard.js) defines ordering and freshness.
- [Stackweaver procedure at the checked commit](https://github.com/michielvha/stackweaver/blob/72e48ed577af958034d6aa598e2835ef36ccdb8c/agents/docs-truth.md) defines evidence, history and local delivery.
- [Pinned feature-document rules](https://github.com/vhco-pro/docs/blob/0c983f6793bfe35eb96ae95ad0c361c6200af44f/conventions/feature-documents.md) govern independent review and owner acceptance.
