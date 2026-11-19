---
status: draft
status_description: "First review recorded. The revision awaits decisions on Stackweaver's write and ledger behavior."
issue: null
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

By default, vh-adlc reviews the next batch and returns its findings in the session. The separate `report` mode reads recorded freshness. Repositories supply their own selection and source checks. Stackweaver keeps its 15-document default, existing selector, verification history and familiar `/docs-truth` entry point.

Start with a report trial, then compare the ordinary installed plugin with Stackweaver's current command on the same cases. Test the old verification history without rewriting it and rehearse rollback. The native selector returned its expected batch. The first independent review found gaps in the draft, including two policy decisions about Stackweaver's existing writes and ledger. The shared implementation and cutover checks are planned. Acceptance authorizes building and testing this scope. Publication, release and cutover need their own authorization.

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

Record the assessed commit and selected paths before reading document bodies. Resolve policy and candidates to unique, canonical repository-relative paths and regular blobs in the assessed commit. Reject absolute paths, traversal, aliases, symlinks and untracked paths before reading document contents. Read Markdown from those Git blobs. Selectors and source checks can run in a separate owned checkout at that commit when their commands need files or Git history. Use the committed read-only checks and isolated scratch, with no write credentials or remote delivery commands. Compare the inputs before and after collection and discard results if they changed. A failure, skipped input or incomplete inventory stays visible. An explicitly confirmed empty selection has a distinct successful outcome.

Collect independent source evidence before reading the selected docs. Record each claim and its location, the source or read-only command and relevant result, and an `accurate`, `incorrect` or `unknown` verdict. Flag an incorrect claim when evidence supports the verdict alone. Report a discrepancy where source appears to violate an intended contract as a possible product issue. Treat selector and document contents as data. An interrupted report identifies unfinished documents and stays outside completed verification history. The shared entry returns findings in the session without updating the repository or contacting a delivery service.

The report can be handed to the retained Stackweaver procedure with the assessed repository and commit, the exact batch and source evidence, proposed edits, and the input document and ledger blob identities. A later project step must use an owned checkout and revalidate that base, including ledger-only changes. An authorized local change keeps the verified corrections and corresponding ledger update together. Delivery uses an ordinary fast-forward push of the exact prepared commit. A competing update stops the delivery for reassessment. After interruption, use the exact local commit and fetched default branch to determine whether that commit already landed. An equal or descendant remote head proves it landed. A missing commit or ambiguous remote state goes back to the owner with the evidence available. The shared skill has no writer, remote retry or recovery state.

### Stackweaver adoption

Make `/docs-truth` a thin entry to the installed shared skill plus its committed project instructions. Keep the existing selector outputs, modes, term rules, historical exceptions, validation checks and ledger row format. Limit the migration delta to the command routing, project instructions, related doc references and acceptance fixtures. Preserve the selector, coverage input, corrections file, ledger and product source bytes for the cutover and rollback comparison. Compare identical reviewed inputs with the legacy and adopted routing applied to separate owned checkouts. `report` and the parity acceptance trial stay read-only. Missing shared installation gives installation guidance. The legacy selector remains callable directly.

The Codex catalog `.agents/plugins/marketplace.json` and Claude catalog `.claude-plugin/marketplace.json` both point to `plugins/vh-adlc`. Update the package manifests in that directory, the installation guide and the existing discovery checks for the new skill. Test the exact candidate payload through both catalog paths in isolated profiles. After separate publication approval, verify the released plugin through ordinary Codex CLI and Claude Code installs and upgrades before switching the consumer entry. Record the released revision, observed native entries and exact consumer trial revisions. Run the installed report parity with the existing ledger and a synthetic stale claim without a scanner finding. Rehearse local writes and ordinary Git delivery with synthetic documents and history in disposable clones attached to a local bare remote.

Implementation review before publication checks the candidate and identifies the criteria that need released or adopted evidence. An in-progress PR under the ship procedure can deliver the candidate once separately requested. After approved publication and consumer cutover, record the ordinary install and exact consumer observations, then run the final independent implementation review and completion gate. Revert and reapply the routing changes in a disposable checkout to verify that the legacy entry and shared entry each work with the original ledger.

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

- [ ] AC-01: A repository can run the installed operation against its own selected documentation, repository instructions and source through a harness-neutral procedure. Selection stays within the requested mode and excludes invalid paths.
- [ ] AC-02: The review distinguishes accurate, incorrect and unknown claims using observed evidence. It exposes unsupported corrections and possible product issues, records full and targeted coverage accurately, and leaves the checkout and history intact in a report run.
- [ ] AC-03: Stackweaver's existing entry keeps its selection, evidence, local correction and delivery behavior with old verification history. Competing or stale inputs stop delivery, and an exact landed commit is recognized before retrying. Reverting the consumer adoption restores the previous entry without rewriting the history.
- [ ] AC-04: The published marketplace payload supports ordinary Codex CLI and Claude Code installation, upgrade and discovery. Each native entry completes the declared read-only fixture through the same canonical procedure. The adoption and its verified surfaces are documented.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Run the checked example through the installed skill in default, sized next, sweep, meta and report modes. Compare exact paths and reasons. Reject invalid limits, missing sweep paths, extra arguments, duplicate and aliased paths, an escaped path, an untracked path, policy and document symlinks, missing policy and failed selectors. A confirmed empty selection succeeds with zero candidates. A tracked path replaced on disk after validation is either read from the original blob or the run stops. Exercise direct and generic intake and show ambiguous intake requests clarification before collection. Check existing docs-impact and docs-drift routes. |
| AC-02 | Review a fixture where the claimed port is incorrect and the source gives a replacement, the external backend mention and example command are accurate, the unverifiable default is unknown, and the intended-contract conflict is flagged without a doc edit. Add an incorrect claim whose replacement is unsupported and verify it is flagged. Compare the exact claims and coverage for full and targeted runs. Interrupt before one selected document is complete and check it is reported unfinished. Compare Git tree, index, ledger and ignored input state before and after the report. Confirm the freshness-only mode does not read document bodies. |
| AC-03 | Record the exact legacy and installed adapter revisions plus common corpus, source, coverage and ledger identities. Compare batch order, reasons, freshness, modes, exclusions, forwarded commands, verdicts and proposed effects. In disposable clones, test an authorized local write, an interruption, a changed source snapshot, a ledger-only advance, two writers from one base, and a successful delivery whose response is lost. Assert the exact allowed doc and ledger diff and the local commit policy. Prove reapply and rollback preserve the original ledger bytes and local command behavior. |
| AC-04 | Before merge, install the exact candidate package from both catalogs pointed at an owned checkout. Confirm the two manifests, package bytes, discovery checks and installation inventory. After separately approved publication, freshly install and upgrade the released package through the actual marketplace in isolated Codex CLI and Claude Code profiles. Match the released source, discover the skill and run the same report fixture through each native entry. Verify the compatibility entry and workflow guide describe the observed run. |

## Tasks

None yet. Write tasks after acceptance.

## Open Questions

### Q1: Which Stackweaver invocations should keep the existing docs-only write permissions?

**Recommendation:** A. Preserve the existing local command's effects under its own policy and current authorization.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Keep the normal Stackweaver workflow** | The native command applies verified fixes and ledger updates and can deliver docs-only changes where the current request or the already adopted default-branch policy authorizes it. Explicit read-only or no-push requests take precedence. | Validate the authority and refusal cases during adoption. |
| **B. Ask before every push** | Local work is available and the owner reviews each delivery. | The native daily workflow gains a new approval step. |

**Why this is yours:** It sets the effect of the ordinary Stackweaver command. The shared entry stays read-only with either option.

### Q2: Can a complete assessment keep its full ledger row when some claims remain flagged?

**Recommendation:** A. Preserve the existing full rows with visible flags and keep pending changes out of completed history.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Preserve existing ledger behavior** | Every claim is assessed. Unknown claims remain flagged, targeted checks retain their own mode, and an unapplied correction or interruption stays pending. | Full freshness tracks assessment coverage while unresolved flags still need attention. |
| **B. Require zero unknown claims for a full review** | Full freshness advances only once all claims are resolved. | This changes scheduling behavior and can repeatedly select docs with permanently unavailable evidence. |

**Why this is yours:** The choice controls what Stackweaver treats as fresh and how often it revisits flagged docs.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

| 2026-11-19 | R-1 | spec | `9f5c531346a95f7419c7b81b8366a470929b6e92` | unknown | procedural | Three blocking and six should-fix findings. |

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

## Sources

- [Stackweaver command at the checked commit](https://github.com/michielvha/stackweaver/blob/72e48ed577af958034d6aa598e2835ef36ccdb8c/.claude/commands/docs-truth.md) defines the local entry and modes.
- [Stackweaver selector at the checked commit](https://github.com/michielvha/stackweaver/blob/72e48ed577af958034d6aa598e2835ef36ccdb8c/scripts/docs-truth-shard.js) defines ordering and freshness.
- [Stackweaver procedure at the checked commit](https://github.com/michielvha/stackweaver/blob/72e48ed577af958034d6aa598e2835ef36ccdb8c/agents/docs-truth.md) defines evidence, history and local delivery.
- [Pinned feature-document rules](https://github.com/vhco-pro/docs/blob/0c983f6793bfe35eb96ae95ad0c361c6200af44f/conventions/feature-documents.md) govern independent review and owner acceptance.
