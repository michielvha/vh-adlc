---
status: in-progress
status_description: "The owner accepted the spec after clean review R-4. The shared package is reviewed for in-progress publication. Published installs and Stackweaver cutover remain open."
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
      Evidence: R-10 found an early candidate read before the previous lifecycle-only guard was loaded. The generic entry now exposes the rule at discovery. Retain the R-9 and R-10 receipts at their original revisions.
- [x] AC-02: The review distinguishes accurate, incorrect and unknown claims using observed evidence. It exposes unsupported corrections and possible product issues, records full and targeted coverage accurately, and leaves the checkout and history intact in a report run.
      Evidence: Independent R-7 inspected the exact candidate Codex evidence for source-backed claims, unsupported replacement, retained product contract, incomplete report and preserved source, refs and index.
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

- [x] T1 `plugins/vh-adlc/skills/vh-adlc-docs-truth/SKILL.md`, `plugins/vh-adlc/references/{docs-truth,lifecycle}.md`, package manifests, discovery tests and installation guides - the package discovers and routes the on-demand skill through one shared read-only procedure, and the existing docs routes still pass discovery checks (AC-01, AC-02, AC-04)
      Evidence: The new discovery test failed on the missing skill and route before implementation. After the change, the package checker and docs-truth, triage and maintenance discovery suites pass 76 tests and 410 assertions. The skill metadata validator passes. This proves source packaging and routing checks. Native behavior and installed acceptance remain open.
- [x] T2 `plugins/vh-adlc/examples/docs-truth/` and `tests/vh-adlc/docs-truth/` - a runnable fixture covers selected paths, complete and partial selection, and the expected evidence and verdicts without writing the assessed checkout (AC-01, AC-02)
      Evidence: The sample selector passes ordering, freshness, committed inputs, invalid arguments and unavailable history checks. The native Codex rerun of `04d58a64` passed the default full review, partial selector failure, and targeted sweep against the installed candidate. It preserved the Git HEAD, index and working files in all three cases. The first full attempt found a false description of the sample Makefile, which was corrected before these runs.
- [ ] T3 `tests/vh-adlc/docs-truth/native-trial.ts` and compatibility and marketplace guides - run the committed shared fixture through both candidate catalog paths and retain the exact package, native discovery and report transcripts (AC-01, AC-02, AC-04)
      Evidence: The exact local candidate at `87c076a8` installed through both native marketplace catalogs in isolated Codex CLI 0.167.2 and Claude Code 2.1.326 profiles. Both discovered `vh-adlc-docs-truth` and matched all 304 package files and modes. The combined package and selector checks passed 77 tests and 422 assertions. The committed rerun, native claim report, published installs and upgrade checks remain open.
      Evidence: The committed native runner now retains the exact payload, assessed state, report and process result. Codex executed the core fixture above. Claude's signed-in default and Haiku routes returned HTTP 429 usage_limit_reached. Native Claude report behavior remains unverified. The shared package can be reviewed for a separately tracked in-progress delivery while the consumer stays on its native command.
      Evidence: Both isolated native catalogs installed the package from `18d20daf`. The strict check matched 304 files and modes with component SHA-256 `ca01ed832dc4724a9e23515615657fe69daa97cbb4fbff24ee4e446d3daa4543`. Later runner and spec edits keep the shipped package digest. The earlier Codex trial ran 19 synthetic cases at `04d58a64`. The strengthened trial separately observed the changed-path and interrupted-report cases at `18d20daf`. The covered package, triage discovery and docs-truth fixture suite passed 74 tests and 337 assertions, without relying on the maintenance discovery suite.
- [ ] T4 Stackweaver's `.claude/commands/docs-truth.md`, `.vh-adlc/docs-truth.md` and `tests/agent-docs-truth/native-trial.ts` - prepare the unpublished routing and consumer proof, including legacy comparison, authorized writes, recovery and rollback in disposable clones (AC-03)
      Evidence: Operator trial compared Stackweaver baseline `72e48ed5` and local adapter `22e5b96f`. Default batch paths, reasons and the full freshness output matched, the selector and ledger-related blobs stayed identical, and rollback and reapplication reproduced both trees. The local hook passed six checks. The native command's model-driven write and recovery behavior needs its own proof before cutover.

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
| 2026-11-19 | R-5 | implementation | `18d20daf80d86d3f3c7c604fd0fe6c879b77ae58` | unknown | procedural | One blocker in fixture isolation and four should-fix findings. |
| 2026-11-19 | R-6 | implementation | `3698d2472244c6a13a6b0a2abdfd12cfaf50213e` | unknown | procedural | One blocker and two should-fix findings in native receipt checks. |
| 2026-11-19 | R-7 | implementation | `8cda536e00bc5752fd17de860b05d2347b8fab9f` | unknown | procedural | No findings. AC-02 met. Released and consumer checks remain open. |
| 2026-11-19 | R-8 | implementation | `694458f7c6550ac630b09f4eef853f40ba4f7d26` | unknown | procedural | One blocker and one should-fix finding in generic intake proof. |
| 2026-11-19 | R-9 | implementation | `bd1f6d0490254610fb17313fe053df4aadea49cc` | unknown | procedural | No findings. Shared behavior verified. Released and consumer checks remain open. |
| 2026-11-19 | R-10 | implementation | `310a3b1146caa84a2c7f18526b3a383b0dcce5eb` | unknown | procedural | Adjacent checks pass. One blocker in early ambiguous intake. |

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

### R-5

TARGET: 18d20daf80d86d3f3c7c604fd0fe6c879b77ae58
CRITERION: AC-01 A repository can run the installed operation against its own selected documentation, repository instructions and source through a harness-neutral procedure. Selection stays within the requested mode, rejects invalid paths and stops an incomplete batch before review or delivery.
VERDICT: untested
EVIDENCE: At 18d20daf, the package checker, example selector and three discovery suites passed 77 tests and 422 assertions. I inspected the 19 retained Codex case results at 04d58a64 and the tool traces for representative modes and rejections. The partial selector exited 17 after returning a path, and that trace contains no document-body read or write handoff. The committed runner lacks the required on-disk path replacement case and does not check selection reasons or the full read boundary.

CRITERION: AC-02 The review distinguishes accurate, incorrect and unknown claims using observed evidence. It exposes unsupported corrections and possible product issues, records full and targeted coverage accurately, and leaves the checkout and history intact in a report run.
VERDICT: untested
EVIDENCE: The retained Codex default and targeted transcripts at 04d58a64 cite committed source, propose port 3900, flag the HTTP 500 versus 503 contract discrepancy, and leave the worker count unresolved. The freshness transcript shows the ledger and selector reads without document-body reads. Receipt snapshots match. The committed trial has no interrupted report case and no contradicted claim whose replacement is unsupported.

CRITERION: AC-03 Stackweaver's existing entry keeps its selection, evidence, authorized corrections and docs-only delivery with old verification history. Complete reviews retain visible flags, targeted reviews retain their mode, and pending or interrupted work leaves prior rows intact. Competing or stale inputs stop delivery, and an exact landed commit is recognized before retrying. Reverting the consumer adoption restores the previous entry without rewriting the history.
VERDICT: not verified
EVIDENCE: At 18d20daf, the public feature document leaves the consumer adapter and proof task open. The dispatcher supplied selector parity and rollback as operator observations. I did not inspect or run the private consumer's forwarding, write, recovery or cutover checks.

CRITERION: AC-04 The published marketplace payload supports ordinary Codex CLI and Claude Code installation, upgrade and discovery. Each native entry completes the declared read-only fixture through the same canonical procedure. The adoption and its verified surfaces are documented.
VERDICT: not verified
EVIDENCE: The dual-catalog receipt covers local candidate 87c076a8. The Codex scenario receipts cover 04d58a64. I recomputed distinct component fingerprints for those revisions and 18d20daf. The dispatcher reports Claude's native model attempts returned HTTP 429. Ordinary published installs, upgrades and post-adoption documentation were not observed.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: `tests/vh-adlc/docs-truth/native-trial.ts:40-44,117-118,137-142`, AC-01 and AC-02 proof
EVIDENCE: The native client receives an environment with `GIT_*` removed. The runner's own Git helper inherits the original environment. An inherited `GIT_DIR`, `GIT_WORK_TREE` or `GIT_INDEX_FILE` can redirect the fixture's `git init`, `git add` or `git commit` outside the disposable repository before the preservation snapshot. The neighboring example test strips repository overrides from those commands.
PROPOSAL: Use an isolated Git environment for all fixture setup and snapshot commands. Test inherited Git overrides with a second disposable repository and verify that its refs, index and worktree stay intact.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: `tests/vh-adlc/docs-truth/native-trial.ts:11-14,49-65,80-106,154-162`, AC-01 and AC-02 proof
EVIDENCE: The verifier checks the model's final status, paths and coverage. It does not verify selection reasons, freshness output, installed procedure use, or whether the model opened document bodies before refusing a request. A generic failure answer passes the negative cases. A generic complete answer with an empty findings array passes freshness mode. Full review uses subset matching, so a report can omit some claims and still pass. The preservation check skips Git metadata other than the index and current HEAD.
PROPOSAL: Bind the trial verdict to observed procedure and source reads, exact selection reasons and expected findings. Assert the refusal and freshness-only read boundary and compare repository refs as well as the existing state snapshot.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: `tests/vh-adlc/docs-truth/native-trial.ts:16-36,121-161`, `plugins/vh-adlc/examples/docs-truth/project/docs/current/setup.md:3-9`, AC-01 and AC-02 proof
EVIDENCE: No case replaces a tracked document on disk after validation. No case interrupts a review after some work is done, and the runner rejects process failure before checking unfinished work. The fixture's contradicted port and timeout both have supported replacements. Its unresolved worker count is an unknown claim, so it cannot show that the verifier flags an incorrect claim whose replacement is unsupported.
PROPOSAL: Add the path replacement and interrupted-report cases and assert their accepted outcomes. Add a contradicted claim for which the evidence cannot support replacement wording.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Stackweaver adoption (line 78), AC-04 proof (line 109), Task T3 (lines 117-119)
EVIDENCE: The accepted pre-merge check requires installing the exact candidate through both catalogs. The dual-catalog receipt is for 87c076a8 and component fingerprint `88716ecc0cdf`. The Codex transcripts use 04d58a64 and `f7d706eaeb54`. I computed `ca01ed832dc4` for 18d20daf. Its installed package includes a revised example README. Matching the count of 304 files is insufficient to reconcile these identities.
PROPOSAL: Repeat ordinary local candidate installation and discovery through both catalogs at the exact publishable package fingerprint before merge. Preserve the earlier receipts against their original revisions and keep the separate published-marketplace checks open.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Feature `covers` (lines 7-23), Task T1 (lines 113-114), `tests/vh-adlc/maintenance/discovery.test.ts:12`
EVIDENCE: This candidate changes the maintenance discovery test's fixed skill count to a check for the maintenance skill. The prior assertion fails when the docs-truth skill is installed in the source tree. The feature cites the maintenance suite as discovery evidence, but its coverage excludes this changed test, so later edits to that test do not stale the review.
PROPOSAL: Cover the changed discovery test through the accepted spec revision and review process, or establish the same discovery proof through the already covered tests without depending on the uncovered change.

### R-6

TARGET: 3698d2472244c6a13a6b0a2abdfd12cfaf50213e
CRITERION: AC-01 A repository can run the installed operation against its own selected documentation, repository instructions and source through a harness-neutral procedure. Selection stays within the requested mode, rejects invalid paths and stops an incomplete batch before review or delivery.
VERDICT: not verified
EVIDENCE: At 3698d247, the focused Bun suite passed 74 tests and 337 assertions, including the inherited Git context regression. On the identical shipped component from 18d20daf, I inspected Codex traces showing the default selection and reason, refusal after a partial selector returned one path, and refusal after a tracked file changed on disk. The remaining mode, intake and refusal cases ran at the earlier 04d58a64 fingerprint. The revised runner has not established the whole criterion on the exact candidate.

CRITERION: AC-02 The review distinguishes accurate, incorrect and unknown claims using observed evidence. It exposes unsupported corrections and possible product issues, records full and targeted coverage accurately, and leaves the checkout and history intact in a report run.
VERDICT: untested
EVIDENCE: The 18d20daf Codex transcripts show source-backed verdicts, the HTTP 500 versus 503 product discrepancy, a source-backed refusal to invent the configured retention duration, and a freshness-only report. Git HEAD, refs, index and project files match in the completed report receipts. The runner rejects the correct unsupported-replacement responses. The interruption trace establishes cancellation before the second document and preservation, but contains no native unfinished-review report.

CRITERION: AC-03 Stackweaver's existing entry keeps its selection, evidence, authorized corrections and docs-only delivery with old verification history. Complete reviews retain visible flags, targeted reviews retain their mode, and pending or interrupted work leaves prior rows intact. Competing or stale inputs stop delivery, and an exact landed commit is recognized before retrying. Reverting the consumer adoption restores the previous entry without rewriting the history.
VERDICT: not verified
EVIDENCE: Task T4 at 3698d247 records operator-observed selector parity and rollback between Stackweaver baseline 72e48ed5 and adapter 22e5b96f. I did not inspect private consumer files or observe native forwarding, authorized writes, delivery recovery or cutover. Those checks remain open.

CRITERION: AC-04 The published marketplace payload supports ordinary Codex CLI and Claude Code installation, upgrade and discovery. Each native entry completes the declared read-only fixture through the same canonical procedure. The adoption and its verified surfaces are documented.
VERDICT: not verified
EVIDENCE: I inspected both local catalog install receipts and the Claude discovery inventory, and recomputed matching fingerprints for the 304 shipped files at 18d20daf and 3698d247. Codex executed the exact installed skill in the retained local trial. The dispatcher reports that Claude's model attempts returned HTTP 429. Ordinary published marketplace installs, upgrades, Claude claim review and post-adoption documentation remain unverified.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: `tests/vh-adlc/docs-truth/native-trial.ts:12-16,156-159`, AC-02 proof
EVIDENCE: The R-5 F-03 remedy added an unsupported-replacement case. Both retained runs correctly mark the exact 30-day claim incorrect and cite the 14-day maximum and operator-set duration. The rerun says "No fixed-duration replacement is supported." The verifier rejects that correct disposition because its wording is absent from the regular expression. This blocks the fixture proof.
PROPOSAL: Have the fixture request a structured unsupported-replacement disposition and assert it alongside the verdict and source. Preserve both failed receipts and check that the verifier accepts the observed correct outcome and rejects a proposed unverified duration.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: `tests/vh-adlc/docs-truth/native-trial.ts:214-225,231-251`, AC-02 proof and Task T3
EVIDENCE: The R-5 F-03 remedy cancels the process after the first document-body read. The retained run exited 143 with no native final report. The runner marks the case successful and populates `unfinished` with both expected paths itself. This verifies cancellation and unchanged state, but cannot prove that the review exposes unfinished work.
PROPOSAL: Retain the hard-cancellation case as preservation evidence. Add a controlled interruption that lets the installed procedure return unfinished work, and verify the completed and unfinished paths from that output.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: `tests/vh-adlc/docs-truth/native-trial.ts:85-119,121-159`, AC-01 and AC-02 proof
EVIDENCE: The R-5 F-02 remedy adds checks for trace markers, freshness output and selection reasons. A generic failed response still passes a negative case without evidence of the intended refusal. The partial case need not show that the selector actually returned a path and exited with failure. In a sized full review, the six setup findings alone still pass even if all README claims are missing. The meta and historical cases accept an empty findings array.
PROPOSAL: For each required refusal, attest the input and diagnostic that distinguish it from a generic failure. Assert the expected findings and evidence for every document in the sized, meta and historical cases.

### R-7

TARGET: 8cda536e00bc5752fd17de860b05d2347b8fab9f
CRITERION: AC-01 A repository can run the installed operation against its own selected documentation, repository instructions and source through a harness-neutral procedure. Selection stays within the requested mode, rejects invalid paths and stops an incomplete batch before review or delivery.
VERDICT: not verified
EVIDENCE: At 8cda536e, the focused Bun suite passed 74 tests and 337 assertions, and the feature document lint passed. On the identical 18d20daf package fingerprint, retained Codex trials show correct default and sized selection, meta and freshness modes, partial-inventory refusal, path replacement refusal and representative invalid-input refusals. Other modes and refusals were observed at the earlier 04d58a64 fingerprint. The entire accepted selection and intake matrix has not been observed on the exact package.

CRITERION: AC-02 The review distinguishes accurate, incorrect and unknown claims using observed evidence. It exposes unsupported corrections and possible product issues, records full and targeted coverage accurately, and leaves the checkout and history intact in a report run.
VERDICT: met
EVIDENCE: The retained exact-package Codex transcripts show the cited port and timeout corrections, accurate command and backend claims, the unknown worker count, and the HTTP 500 versus 503 product issue. The corrected runner accepted the targeted unsupported-retention flag. The paused native report identified the completed setup document and unfinished README, and the freshness trace shows no document-body reads. The completed trials preserved refs, HEAD, index and project files. The older regex rejections and forced cancellation remain separate diagnostic evidence.

CRITERION: AC-03 Stackweaver's existing entry keeps its selection, evidence, authorized corrections and docs-only delivery with old verification history. Complete reviews retain visible flags, targeted reviews retain their mode, and pending or interrupted work leaves prior rows intact. Competing or stale inputs stop delivery, and an exact landed commit is recognized before retrying. Reverting the consumer adoption restores the previous entry without rewriting the history.
VERDICT: not verified
EVIDENCE: Task T4 records operator-observed selector parity and rollback for Stackweaver 72e48ed5 and 22e5b96f. This review did not inspect private consumer files or observe native forwarding, authorized writes, recovery or cutover.

CRITERION: AC-04 The published marketplace payload supports ordinary Codex CLI and Claude Code installation, upgrade and discovery. Each native entry completes the declared read-only fixture through the same canonical procedure. The adoption and its verified surfaces are documented.
VERDICT: not verified
EVIDENCE: I inspected both native local-catalog installation receipts and the Claude discovery inventory. The 304-file component fingerprint at 8cda536e matches the 18d20daf candidate receipt. Codex executed the installed procedure. Claude model execution remains pending after the reported HTTP 429 responses. Actual published installs, upgrades and the post-adoption record remain open.

### R-8

TARGET: 694458f7c6550ac630b09f4eef853f40ba4f7d26
CRITERION: AC-01 A repository can run the installed operation against its own selected documentation, repository instructions and source through a harness-neutral procedure. Selection stays within the requested mode, rejects invalid paths and stops an incomplete batch before review or delivery.
VERDICT: not verified
EVIDENCE: At 694458f7, the focused Bun suite passed 74 tests and 337 assertions, and feature lint passed. The shipped fingerprint matches 18d20daf. The new same-package Codex transcripts passed the structured duplicate-path, outside-scope and incomplete-inventory cases with unchanged state. Earlier same-package transcripts establish the remaining selection modes and input refusals. The installed intake proof still has the two gaps below.

CRITERION: AC-02 The review distinguishes accurate, incorrect and unknown claims using observed evidence. It exposes unsupported corrections and possible product issues, records full and targeted coverage accurately, and leaves the checkout and history intact in a report run.
VERDICT: met
EVIDENCE: The shipped component is unchanged since R-7. I inspected the retained same-package evidence showing the source-backed verdicts, the product contract conflict, the targeted unsupported-replacement flag, the native unfinished-work report, and the freshness-only path. The completed and paused trial snapshots preserve HEAD, refs, index and project files. The reason-code change applies only to refusal assertions.

CRITERION: AC-03 Stackweaver's existing entry keeps its selection, evidence, authorized corrections and docs-only delivery with old verification history. Complete reviews retain visible flags, targeted reviews retain their mode, and pending or interrupted work leaves prior rows intact. Competing or stale inputs stop delivery, and an exact landed commit is recognized before retrying. Reverting the consumer adoption restores the previous entry without rewriting the history.
VERDICT: not verified
EVIDENCE: Task T4 records operator-observed selector parity and rollback for Stackweaver 72e48ed5 and 22e5b96f. This review did not inspect private consumer files or observe native forwarding, authorized writes, recovery or cutover.

CRITERION: AC-04 The published marketplace payload supports ordinary Codex CLI and Claude Code installation, upgrade and discovery. Each native entry completes the declared read-only fixture through the same canonical procedure. The adoption and its verified surfaces are documented.
VERDICT: not verified
EVIDENCE: The native local-catalog installation receipts apply to the same 304 shipped files at 18d20daf and 694458f7. Codex executed the installed procedure. Claude discovery was observed locally, while model execution remains open after the reported HTTP 429 responses. Ordinary published installs, upgrades and adoption documentation remain unverified.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: `tests/vh-adlc/docs-truth/native-trial.ts:167-178`, AC-01 intake proof
EVIDENCE: The exact-package generic-intake transcript correctly marks the worker count unknown. It cites a search of the assessed commit for worker references and explains that the Makefile only prints a message. The existing source regex requires `workers`, `config` or `source`, so the runner rejects this valid evidence. The reason-code correction leaves this independent assertion unchanged.
PROPOSAL: Accept the observed source description and retain a requirement for independent source evidence. Keep the rejected receipt and rerun generic intake.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: `tests/vh-adlc/docs-truth/native-trial.ts:132-139`, `plugins/vh-adlc/references/lifecycle.md` ambiguous documentation intake, AC-01 clarification proof
EVIDENCE: The exact-package ambiguity transcript read the installed lifecycle reference through a brace-expanded shell path. The verifier's literal command substring missed the read. The transcript also shows that the agent opened the synthetic README before asking for scope, so the case does not establish clarification before document collection.
PROPOSAL: Verify the observed lifecycle reference without relying on shell command spelling. State that the ambiguous intake branch asks for scope before opening candidate documents, then rerun it and verify the read boundary.

### R-9

TARGET: bd1f6d0490254610fb17313fe053df4aadea49cc
CRITERION: AC-01 A repository can run the installed operation against its own selected documentation, repository instructions and source through a harness-neutral procedure. Selection stays within the requested mode, rejects invalid paths and stops an incomplete batch before review or delivery.
VERDICT: met
EVIDENCE: At bd1f6d04, the focused suite passed 74 tests and 337 assertions, and feature lint passed. Both native Codex intake cases passed on the 78e6da7b package, whose 304-file fingerprint matches bd1f6d04. The traces contain the revised installed lifecycle body. Explicit intake selected docs truth and verified source. Ambiguous intake asked for scope without opening candidate documents or running the selector. Earlier 18d20daf transcripts establish the direct modes, refusals and interrupted-selection behavior. The direct skill, procedure and fixture bytes are unchanged.

CRITERION: AC-02 The review distinguishes accurate, incorrect and unknown claims using observed evidence. It exposes unsupported corrections and possible product issues, records full and targeted coverage accurately, and leaves the checkout and history intact in a report run.
VERDICT: met
EVIDENCE: The 78e6da7b generic-intake transcript cites committed source for the verdicts, including the unresolved worker count, and preserves HEAD, refs, index and project files. R-7's 18d20daf direct-mode receipts establish the unsupported-replacement flag, product issue, full and targeted coverage, unfinished-work report and freshness-only read boundary. The R-8 remedies and current intake change leave the direct procedure and fixture unchanged.

CRITERION: AC-03 Stackweaver's existing entry keeps its selection, evidence, authorized corrections and docs-only delivery with old verification history. Complete reviews retain visible flags, targeted reviews retain their mode, and pending or interrupted work leaves prior rows intact. Competing or stale inputs stop delivery, and an exact landed commit is recognized before retrying. Reverting the consumer adoption restores the previous entry without rewriting the history.
VERDICT: not verified
EVIDENCE: Task T4 records operator-observed selector parity and rollback for Stackweaver 72e48ed5 and 22e5b96f. This review did not inspect private consumer files or observe native forwarding, authorized writes, recovery or cutover.

CRITERION: AC-04 The published marketplace payload supports ordinary Codex CLI and Claude Code installation, upgrade and discovery. Each native entry completes the declared read-only fixture through the same canonical procedure. The adoption and its verified surfaces are documented.
VERDICT: not verified
EVIDENCE: I inspected the two native local-catalog installation receipts and the Claude discovery inventory for the 78e6da7b payload, and recomputed its matching fingerprint at bd1f6d04. Codex ran both revised intake cases through the installed package. Published marketplace fresh installs and upgrades, Claude claim review, and the adoption record remain open.

### R-10

TARGET: 310a3b1146caa84a2c7f18526b3a383b0dcce5eb
CRITERION: AC-01 A repository can run the installed operation against its own selected documentation, repository instructions and source through a harness-neutral procedure. Selection stays within the requested mode, rejects invalid paths and stops an incomplete batch before review or delivery.
VERDICT: not met
EVIDENCE: At 310a3b11, the focused docs-drift authority suite passed 9 tests and 112 assertions. The exact installed Codex ambiguity trial loaded the intended lifecycle text and asked for scope, but opened the synthetic README first. The runner correctly failed the clarification-before-collection check. The earlier direct-mode and explicit-intake evidence retains its original package attribution.

CRITERION: AC-02 The review distinguishes accurate, incorrect and unknown claims using observed evidence. It exposes unsupported corrections and possible product issues, records full and targeted coverage accurately, and leaves the checkout and history intact in a report run.
VERDICT: met
EVIDENCE: The current lifecycle edit changes intake clarification and adjacent routing wording. R-7's 18d20daf direct-mode receipts still establish the source-backed verdicts, unsupported-replacement flag, product issue, full and targeted coverage, unfinished-work report, freshness-only path and preserved state. The direct skill, procedure and fixture bytes remain unchanged.

CRITERION: AC-03 Stackweaver's existing entry keeps its selection, evidence, authorized corrections and docs-only delivery with old verification history. Complete reviews retain visible flags, targeted reviews retain their mode, and pending or interrupted work leaves prior rows intact. Competing or stale inputs stop delivery, and an exact landed commit is recognized before retrying. Reverting the consumer adoption restores the previous entry without rewriting the history.
VERDICT: not verified
EVIDENCE: Task T4 records operator-observed selector parity and rollback for Stackweaver 72e48ed5 and 22e5b96f. This review did not inspect private consumer files or observe native forwarding, authorized writes, recovery or cutover.

CRITERION: AC-04 The published marketplace payload supports ordinary Codex CLI and Claude Code installation, upgrade and discovery. Each native entry completes the declared read-only fixture through the same canonical procedure. The adoption and its verified surfaces are documented.
VERDICT: not verified
EVIDENCE: The native local-catalog install receipts and Claude discovery inventory apply to 310a3b11. I recomputed the matching fingerprint for its 304 shipped files. Ordinary published installs, upgrades, Claude claim review and adoption documentation remain open.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: `plugins/vh-adlc/skills/vh-adlc/SKILL.md:8-17`, `plugins/vh-adlc/references/lifecycle.md:15-21,95-100`, AC-01 clarification proof
EVIDENCE: The R-10 wording restores the adjacent docs-drift assertions and retains the clarification rule. In the exact installed Codex trial, the generic entry led to a single shell command that opened both the lifecycle reference and the synthetic README. The read occurred before the model could apply the rule in the reference. The runner correctly refused the trial despite unchanged Git state and verified package identity.
PROPOSAL: Surface the clarification-before-document-read rule in the generic skill entry so the model sees it before loading the lifecycle reference. Retain the lifecycle rule and the failed receipt, then rerun the installed ambiguity case.

## Sources

- [Stackweaver command at the checked commit](https://github.com/michielvha/stackweaver/blob/72e48ed577af958034d6aa598e2835ef36ccdb8c/.claude/commands/docs-truth.md) defines the local entry and modes.
- [Stackweaver selector at the checked commit](https://github.com/michielvha/stackweaver/blob/72e48ed577af958034d6aa598e2835ef36ccdb8c/scripts/docs-truth-shard.js) defines ordering and freshness.
- [Stackweaver procedure at the checked commit](https://github.com/michielvha/stackweaver/blob/72e48ed577af958034d6aa598e2835ef36ccdb8c/agents/docs-truth.md) defines evidence, history and local delivery.
- [Pinned feature-document rules](https://github.com/vhco-pro/docs/blob/0c983f6793bfe35eb96ae95ad0c361c6200af44f/conventions/feature-documents.md) govern independent review and owner acceptance.
