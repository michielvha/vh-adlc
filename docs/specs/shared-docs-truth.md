---
status: draft
status_description: "Draft extraction and Stackweaver migration. Independent review and owner acceptance are pending."
issue: null
goal: "Run a bounded, evidence-backed documentation truth review through vh-adlc and preserve Stackweaver's existing command and verification history."
covers:
  - plugins/vh-adlc/skills/vh-adlc-docs-truth/
  - plugins/vh-adlc/references/docs-truth.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/examples/docs-truth/
  - tests/vh-adlc/docs-truth/
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
---

# Plan: Shared documentation truth review

## Context

### Owner summary

Move the claim-by-claim part of Stackweaver's `/docs-truth` into vh-adlc. It checks factual statements against the current source tree, such as a documented default port or command. It revisits old docs and agent instructions even when their links still work and no recent patch points to them.

vh-adlc will run a bounded review, show why each document was selected, and record the evidence behind each verdict. Repositories supply their own selection and source checks. Stackweaver keeps its 15-document default, existing selector, verification history, fix rules and familiar `/docs-truth` entry point. The shared entry defaults to a report. Stackweaver's existing docs-only delivery stays subject to its own instructions.

Start with a report trial, then compare the ordinary installed plugin with Stackweaver's current command on the same cases. Test the old verification history without rewriting it and rehearse rollback. The current draft has mapped the native entry and selector. The shared implementation, installation and cutover checks are planned. Acceptance authorizes building and testing this scope. Publication, release and cutover need their own authorization.

### Background

The migration roadmap records that Stackweaver kept its native docs-truth entry, selector and ledger. Shared docs impact starts from a selected change. Shared docs drift starts from scanner findings and can recheck earlier proposals. The docs-drift spec explicitly excludes rolling claim review and its ledger. See [migration roadmap](shared-workflow-migration.md#capability-roadmap), [docs-drift scope](shared-docs-drift.md#scope) and [workflow guide](../user-guides/workflows.md#documentation-impact).

Stackweaver baseline `72e48ed577af958034d6aa598e2835ef36ccdb8c` was inspected locally. Its command declares `next [N]`, `sweep <path>...`, `meta` and `report`. The selector orders tracked Markdown by verification history, code changes and age. A read-only `node scripts/docs-truth-shard.js --fast 3` returned three never-verified instruction files. It exercised selection alone. The native playbook supplies source checks, evidence, ledger updates and delivery. See the exact consumer sources below.

## Scope

Ship an interactive `vh-adlc-docs-truth` skill, its canonical procedure and one runnable example. Teach generic intake to route explicitly requested rolling factual review to it. Adopt the skill in Stackweaver after installation and behavior checks. Keep the existing selector script and ledger as the source of batch ordering and history there.

The shared operation covers documentation and agent instructions. Repositories own their source checks, selection policy, ledger, protected files, corrections and any writes. The scheduled docs-drift scanner, proposal and recovery workflows, docs impact and codebase audit retain their existing routes. The shared operation adds no server, scheduler, publisher, ledger format or model dependency.

## Design

### Shared procedure

The skill loads the committed `.vh-adlc/docs-truth.md` project instructions from the selected Git checkout. The instructions declare the eligible tracked paths, exclusions, a positive default batch limit, the read-only selector or selection procedure, how to obtain freshness, and how to collect source evidence. They may declare an existing local verification record and a separate project write procedure. Missing or invalid setup stops with the path and a link to the checked example. The example uses a small Git repository with a local selection and history procedure. It needs no Stackweaver files.

The shared procedure defines four modes. `next [N]` takes the first N eligible candidates in the selector's order and records their reasons. `sweep <path>...` checks the exact requested eligible documents. The committed policy can explicitly allow historical paths in a targeted sweep. `meta` takes the project's declared instruction files. `report` prints the project's recorded freshness without checking claims. Apply the batch limit to `next` and the exact requested or declared sets to `sweep` and `meta`. Reject duplicate, out-of-scope, untracked and non-regular paths before reading their contents. Report selector failure and incomplete inventory as failures. An explicitly confirmed empty selection has a distinct successful outcome.

For a claim review, record the assessed commit and the selected paths before reading document bodies. Use a clean owned checkout at that commit. Collect the project's independent source evidence first. Record the claim and document location, source location or read-only command and its relevant result, and one verdict per claim. Use `accurate`, `incorrect` or `unknown`. An incorrect claim without enough evidence for replacement wording gets a flag. A discrepancy where source appears to violate an intended contract goes into the report as a possible product issue. Source, document and selector contents are inputs to inspect. The procedure takes instructions from the selected skill and committed repository policy.

A full review checks every checkable claim in the selected document. A targeted review checks the specified claims. Unknown and interrupted checks remain visible. An interrupted report never becomes completed verification history. Keep reports in the session by default. The shared procedure leaves the repository clean and applies no history, commit or remote effects in report mode or a default invocation. Independent report runs have no common writable state.

When an existing project command selects a write procedure under committed local authority, hand it the exact batch, assessed commit, proposed corrections and observed evidence. The project owns verification history updates and delivery. Stop on changed source or documents before applying the batch. Use the project's isolated write checkout, recheck the base and allowed diff before committing, and keep the doc fixes and their history update together. Interruption before a commit requires rechecking the pending changes and base before resuming. Once committed, inspect its recorded history and remote state before retrying delivery. The shared procedure has no automatic write retry.

### Stackweaver adoption

Make `/docs-truth` a thin entry to the installed shared skill plus its committed project instructions. The project entry retains the existing selector outputs, modes and term and historical rules. Keep the existing runtime validation checks and ledger row format. Keep the local rules for verified doc fixes, ledger updates and docs-only commits, including the existing `[skip ci]` rule. `report` and the parity acceptance trial stay read-only. Missing shared installation gives installation guidance. The legacy selector remains callable directly.

Publish the shared skill through the existing vh-adlc marketplace manifests and version workflow. Verify the released payload through ordinary Codex CLI and Claude Code installs and an upgrade before switching the consumer entry. Record the released revision, each observed native entry and the exact consumer trial revision. Run installed report parity in an isolated Stackweaver checkout, including a representative historical ledger and a fixture where a stale claim lacks a scanner finding. Compare candidate order, reasons, freshness, verdicts and proposed effects with the native route. Rehearse the local write path with synthetic docs and verification history in a disposable clone with no real remote. Reverting the consumer routing and project-instructions changes restores the previous entry and keeps the ledger at its existing path and format. Follow the project delivery policy when adopting the docs-only routing changes.

### Terms

| Term | Meaning |
| --- | --- |
| Batch | The documents selected for one review. |
| Full review | Review of every checkable claim in one document. |
| Targeted review | Review of specified claims in one document. |

## Acceptance Criteria

- [ ] AC-01: A repository can run the installed operation against its own selected documentation, repository instructions and source through a harness-neutral procedure. Selection stays within the requested mode and excludes invalid paths.
- [ ] AC-02: The review distinguishes accurate, incorrect and unknown claims using observed evidence. It exposes unsupported corrections and possible product issues, records full and targeted coverage accurately, and leaves the checkout and history intact in a report run.
- [ ] AC-03: Stackweaver's existing entry keeps its selection, evidence, local correction and delivery behavior with old verification history. Interrupted or stale runs cannot record a completed verification or repeat a finished delivery. Reverting the consumer adoption restores the previous entry without rewriting the history.
- [ ] AC-04: The published marketplace payload supports ordinary Codex CLI and Claude Code installation, upgrade and discovery. Each native entry completes the declared read-only fixture through the same canonical procedure. The adoption and its verified surfaces are documented.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Run the checked example through the installed skill and exercise default, explicit size, sweep, meta and report. Compare exact selected paths and reasons. Use a duplicate, untracked file, symlink, missing policy, failed selector and confirmed empty selector. Verify that rejected cases produce a diagnosis and open no document for review. Verify generic intake distinguishes rolling claim review, selected-change impact and scanner-driven drift. |
| AC-02 | Review a fixture with a wrong but structurally valid port, a still-valid external backend mention, a correct command, an unverifiable claim and an intended-contract conflict. Verify the verdicts refer to independently read source results. Leave one document partly reviewed and reproduce an interruption. Compare Git tree, index and history before and after report and retry. Check terminology and that the progress report reads recorded freshness without addressing claims. |
| AC-03 | On one fixed Stackweaver snapshot, compare batch order, reasons, default size, targeted/meta/report behavior, exclusions, verdicts and proposed effects of the old and installed entries. Use a disposable clone with synthetic history to show a complete local write, interrupted write, changed source, applied commit followed by retry, and rollback. Check ledger format, protected files, docs-only diff and the project commit policy. Verify the real history is preserved byte-for-byte across report and routing rollback. |
| AC-04 | Build the candidate marketplace payload by the configured path before merge. After release, install and upgrade from the actual marketplace in isolated Codex CLI and Claude Code profiles. Match the released source and discover the skill, then run the same report fixture through each native entry and verify the selected procedure and verdicts. Check that the compatibility entry and workflow guide reflect the observed hosts and operation. |

## Tasks

None yet. Write tasks after acceptance.

## Open Questions

None.

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
