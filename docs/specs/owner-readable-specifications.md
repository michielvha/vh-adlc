---
status: in-progress
status_description: "Published template adopted; final checks and independent review are running."
branch: feat/owner-readable-specifications
issue: https://github.com/michielvha/vh-adlc/issues/55
goal: "Let an owner judge a feature's scope, trade-offs and proof from a short summary maintained inside its canonical spec."
covers:
  - plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md
  - plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md
  - plugins/vh-adlc/knowledge.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/get-started/first-feature.md
  - tests/vh-adlc/owner-summary.test.ts
  - AGENTS.md
---

# Plan: Owner-readable specifications

Keep a short Owner summary at the start of Context, backed by the existing detailed specification.

## Context

### Owner summary

A long feature spec should remain useful to its owner without reading thousands of lines of review
history. Add `### Owner summary` as the first subsection of Context in new and actively revised specs.
It explains the outcome, scope, approach, important trade-offs, proof and decisions needed in plain
language. Aim for a few paragraphs, usually 250 to 400 words; a small feature can be shorter.

The summary belongs to the same file and must agree with its detailed scope and criteria. It cannot
accept a feature, change policy or turn planned tests into passed tests. The author refreshes it when
the proposal changes and before acceptance; the independent reviewer checks it for contradictions.
The existing conversation summary remains required so you can make the decision directly in chat.

The shared template and format guidance live in `vhco-pro/docs`. Framework author/reviewer instructions
live in vh-adlc. The upstream template change is merged; this candidate now adopts its exact published revision.
Old specs stay valid, old review records stay unchanged, and no parser or gate change is needed.

The owner accepted this scope. Actual binary checks now cover nested and historical specs, summary-only
corrections and a normative revision without changing stored review records. An independent semantic
trial caught unsupported proof and a changed default while accepting honest and historical drafts.
A disposable source-procedure author trial now verifies summary maintenance and complete pre-decision
conversation output. Its starting acceptance state is synthetic; native installed-plugin invocation and
a real owner-acceptance transaction are not claimed. Docs PR26 is merged at `f781ee7b0404e80194aa568af3284888cc222017`, with the reviewed tree unchanged.
This candidate updates the framework repository and fallback Docs pins to that revision. Other
consumer pins stay unchanged. Final verification and independent review follow this adoption.
Bulk rewrites, merges and unrelated feature work remain outside this change.

### Terminology and delivery

| Term | Meaning |
| --- | --- |
| Owner summary | The first subsection inside Context that explains the canonical feature scope, approach, trade-offs and proof to its owner; detailed normative sections retain authority (AC-01). |

The changed artifact is the source-distributed vh-adlc plugin payload. The root catalogs (`.claude-plugin/marketplace.json:18-20` and
`.agents/plugins/marketplace.json`) select `plugins/vh-adlc`; its two manifests carry the candidate version. Existing package/installation
checks validate that payload and its helper paths. The pinned Go binary and its lock remain unchanged;
this feature adds no new binary format or build. The existing tagged Go release workflow (`.github/workflows/release.yml:3-13`) remains separate
from source plugin distribution; the lock still selects the verified existing binary. Native installed-plugin/model invocation is not
claimed by the disposable source-procedure trial. Other consumer repositories keep their own Docs pins.

### Current evidence and research

At framework main `21bc3e4299a227bf9431de2d6045afdff2342834`,
`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:67-84` already requires an owner-facing conversation
summary before acceptance. It does not require saving that summary at the top of the spec.
The resolved shared template at Docs `0e52f51f01b84eda75a976763c42d8ec0a07b544`,
`guides/feature-document-template.md:28-30`, begins Context with one background placeholder.
`conventions/feature-documents.md:64-76` defines the top-level sections and normative baseline;
Context is outside that baseline and can contain subsections without changing the format.

The owner chose a summary inside Context on 2026-11-06. A Builders prototype at commit
`2d0c61061caeb88d88fd0b4a8aa9ce5f80b07dc1`,
`docs/specs/0001-packer-proxmox-native-output.md:27`, uses that heading and passes the existing
v0.9.0 binary's lint at Docs0e52. This proves format compatibility, not implementation of the shared
workflow or semantic accuracy of every future summary.

Rust's RFC template starts with a one-paragraph Summary and then separates guide-level explanation
from reference detail. Kubernetes KEPs place Summary before Motivation, Proposal and Design Details.
GitHub Spec Kit starts from user scenarios and separates technical planning. These support concise
reader-facing orientation; they do not require another canonical plan file or a wholesale format swap.

## Scope

Update the shared template and prose guidance in vhco-pro/docs, then the vh-adlc spec author/reviewer
workflow and first-feature guide to use it. This framework feature owns the coordinated behavior;
the authoritative template edits are a companion Docs delivery, not a second local template.

Apply the expectation to newly authored specs and specs whose normative baseline is being revised.
Refresh an existing summary when its described proof or decisions change during feature work.
Specs untouched by the work remain valid without a summary. A summary-only correction follows the
existing prose-edit route and must not invent an acceptance or invalidate historical review records.

Exclude new top-level sections, new binary rules/schema, rigid word-count gates, automatic condensation,
HTML folding of returned records, new summary files, bulk migration and rewriting old review logs.

## Design

### One summary, one specification

At the start of Context, the template shows `### Owner summary` followed by guidance covering:

- The problem, intended outcome and visible behavior.
- Included scope and likely expectations that are explicitly excluded.
- The proposed approach, defaults, permissions and consequential trade-offs.
- Migration or recovery when relevant.
- Planned validation versus observed proof, review status, limitations and decisions needed.
- What acceptance permits and which later actions retain separate authorization.

Use connected prose or a few meaningful bullets. No mandatory subheadings or repeated boilerplate.
The summary is an explanation of Scope, Design and criteria; those sections retain normative authority.
Link deeper sections when useful. Do not put a second acceptance checkbox or status machine here.
For a revision, explain the material change since the last accepted scope. An honest draft can say
validation is planned and independent review is pending.

The independent reviewer verifies consistency, material omissions and proof wording against the exact
commit and current records. A misleading summary returns an ordinary finding under the existing
review protocol. A missing summary in an untouched historical spec is not a new lint/gate failure.
Spec authoring still presents the existing conversation summary immediately before owner acceptance.
The persisted section does not replace that communication or grant acceptance by itself.

### Ownership and adoption

In vhco-pro/docs, change `guides/feature-document-template.md` and the prose around Context in
`conventions/feature-documents.md`. Leave its machine-readable rules block byte-for-byte unchanged.
Use its Node check and an independent documentation review before that companion delivery lands.
The Docs repository is checked out separately; its paths are not falsely represented as local `covers`.
Record the reviewed upstream commit/PR as an implementation dependency in this feature's evidence.

After the upstream change is published, update framework `AGENTS.md` and the effective plugin
knowledge pin to that exact revision using the repository's normal pin convention. Author and reviewer
instructions refer to the resolved template rather than copying it into the plugin. Update the
first-feature guide with an example. Bump both plugin manifests together as required by `plugins/vh-adlc/knowledge.md:9`. Keep the unrelated plugin procedures and binary version unchanged.
If upstream delivery cannot land, leave adoption incomplete; never point at an unpublished commit or
claim that a consumer on its old pin has acquired the new standard. Other consumer pin bumps remain
separate deliveries.

The return path is an ordinary reviewed revert of the prose/workflow and pin changes. Existing nested
summaries remain parseable before and after it. Do not rewrite stored reviewer output to shorten a spec.

## Acceptance Criteria

- [ ] AC-01: New specs following the published shared template begin Context with a useful Owner summary that covers scope, approach, consequential trade-offs, validation state and owner decisions without adding a second normative contract.
- [x] AC-02: The author refreshes the summary on a normative revision and before acceptance; planned validation and observed results remain distinct, and the owner still receives the existing conversation summary before deciding.
      Evidence: R-3 returned met at `4e1523b`; observed source-procedure author trial and independent semantic review, with the synthetic-state and host-invocation limits retained in the records.
- [x] AC-03: Independent spec review identifies a materially stale, contradictory or unsupported summary through ordinary finding records while allowing an untouched historical spec without a summary.
      Evidence: R-3 returned met at `4e1523b`; observed source-procedure author trial and independent semantic review, with the synthetic-state and host-invocation limits retained in the records.
- [ ] AC-04: The coordinated change uses the authoritative Docs template and a published exact framework pin; existing specs, baseline/status gates and verbatim review records remain compatible without a binary-format change or bulk migration.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Copy the actual companion Docs template into a disposable feature repo and author a concrete feature through the updated operation; inspect all summary topics and run real lint with the resolved pin. Run Docs `npm run check`. |
| AC-02 | Observed author trial: change an accepted feature's scope, follow existing draft/review/acceptance gates and inspect revised summary plus owner-facing message; fail the trial if stale scope or planned tests are presented as passed. |
| AC-03 | Independent reviewer trial against exact committed fixtures: one misleading proof claim and one changed default must produce findings; an untouched historical spec without a summary must not fail for its absence. Preserve actual returned records and report the model/host limits. |
| AC-04 | Compare the rules block byte-for-byte, run lint/freshness on historical and nested-summary fixtures, compare old review records before/after, verify published Docs commit and effective framework pin, then run the affected Bun checks and existing lifecycle tests. |

## Tasks

- [x] T1 `docs/specs/owner-readable-specifications.md` - companion vhco-pro/docs template and Context guidance pass its checker and independent review with the rules block unchanged; record its exact PR/commit (AC-01, AC-04)
      Evidence: Docs PR https://github.com/vhco-pro/docs/pull/26 at `614bb27a7c1809f4a6e3ab86040329a82466efe0` passes Node24 `npm run check`, independent documentation review and hosted CI42145106147. Rules and top-level headings compare unchanged. That was the pre-merge observation; PR26 is now merged at f781ee7 and this candidate adopts it.
- [x] T2 `plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md`, `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md`, `docs/get-started/first-feature.md` - author/reviewer guidance keeps the saved summary consistent and preserves conversation acceptance (AC-01, AC-02, AC-03)
      Evidence: source guidance is updated conditionally on the resolved template, preserving existing conversation acceptance and historical records. This prose change has no meaningful failing unit test; real binary compatibility and independent semantic trials follow in T3.
- [x] T5 `plugins/vh-adlc/plugin.json`, `plugins/vh-adlc/.claude-plugin/plugin.json` - advance the candidate package version together so the existing version-change check passes; no release is published (AC-04)
      Evidence: the package checker first refused unchanged 0.10.0; after both candidate manifests advance together, `bun test tests/vh-adlc/check.test.ts --timeout 60000` passes all 57 checks. This is an unmerged candidate, not a release.
- [x] T3 `tests/vh-adlc/owner-summary.test.ts` - real binary compatibility checks and observed author/reviewer fixtures distinguish planned proof, scope revisions and misleading summaries while historical specs remain valid (AC-02, AC-03, AC-04)
      Evidence: two actual-binary tests pass (12 assertions), proving summary-only freshness, required draft/review after a normative change and byte-identical stored records. Nine summary/operation compatibility tests pass. Independent semantic trial at four exact scratch commits returns no findings for historical/honest drafts and blocking findings for unsupported proof and changed-default summaries. First trial retained an unrelated test-fixture task finding; corrected drafts were re-reviewed. Fixtures use explicit synthetic lifecycle rows, not real owner acceptance. Model identity is not attested.
- [x] T6 `docs/specs/owner-readable-specifications.md` - preserve a disposable actual author-operation trial and its owner-facing pre-acceptance output; independent review verifies the observed behavior rather than inferring it from scripted fixtures (AC-02)
      Evidence: candidate author procedure used the actual Docs614bb27 template in a disposable checkout; gate draft passed, status-only commit96d0bfa preceded model-authored revision46c4203, and real conversation output linked the full draft and covered migration, recovery, proof and authority. Independent trial review returned NO FINDINGS and confirmed the delivered output closes the earlier gap. Starting acceptance rows remain synthetic; no installed-plugin or real acceptance transaction is claimed.
- [ ] T4 `AGENTS.md`, `plugins/vh-adlc/knowledge.md` - after the companion Docs delivery lands, adopt its exact published pin, reconcile the candidate version with current main and pass affected package/lifecycle checks and independent review (AC-04)

## Open Questions

None. The owner selected summary inside Context, preserving the existing format.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-06 | R-1 | spec | `9aac9eeff9e20d30816b0ab8a43f313c30ee2e65` | unknown | procedural | No findings; model identity not attested. |
| 2026-11-06 | R-1 | spec | `9aac9eeff9e20d30816b0ab8a43f313c30ee2e65` | n/a | n/a | accepted by owner |
| 2026-11-06 | R-2 | implementation | `557cf2a6f492405f326a3d35ba5833d72c8bfe89` | unknown | procedural | AC03 met; AC01/04 not met pending adoption; AC02 not verified pending native author trial. Model identity not attested. |
| 2026-11-06 | R-3 | implementation | `4e1523bdcd5d1d0dac4916df490d789abdb2f11e` | unknown | procedural | AC02/03 met; AC01/04 await upstream template and pin adoption. Model identity not attested. |

### R-1

NO FINDINGS

### R-2

CRITERION: AC-01 New specs following the published shared template begin Context with a useful Owner summary that covers scope, approach, consequential trade-offs, validation state and owner decisions without adding a second normative contract.
VERDICT: not met
EVIDENCE: At framework commit 557cf2a6f492405f326a3d35ba5833d72c8bfe89, vh-adlc knowledge resolves repository Docs revision 0e52f51f01b84eda75a976763c42d8ec0a07b544. Its actual cached template begins Context with the background placeholder and contains no Owner summary. Companion Docs candidate 614bb27a7c1809f4a6e3ab86040329a82466efe0 contains the intended summary guidance and passes npm run check under Node v24.19.0, but that candidate is not the effective published framework standard. Candidate preparation is established; adoption remains incomplete.

CRITERION: AC-02 The author refreshes the summary on a normative revision and before acceptance; planned validation and observed results remain distinct, and the owner still receives the existing conversation summary before deciding.
VERDICT: not verified
EVIDENCE: At framework commit 557cf2a6f492405f326a3d35ba5833d72c8bfe89, plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:10-16 requires revision and pre-acceptance reconciliation while retaining the conversation summary. The focused Bun suite passes, including actual binary freshness and draft-gate checks. However, tests/vh-adlc/owner-summary.test.ts:99-114 inserts synthetic review and acceptance rows and directly replaces summary text; it does not execute the author operation or capture its pre-acceptance conversation summary. The accepted Test Plan names that author trial, but its execution was not observed. Synthetic lifecycle records establish binary compatibility, not actual owner acceptance or author behavior.

CRITERION: AC-03 Independent spec review identifies a materially stale, contradictory or unsupported summary through ordinary finding records while allowing an untouched historical spec without a summary.
VERDICT: met
EVIDENCE: Independently inspected all four exact fixture commits named in /tmp/homelab-owner-summary-trial-20261106-3/review-cases.json and their returned records in reviewer-results.json. Historical commit 8a716e577e5fbe55a9ea3e5750d207eb375d3862 and honest commit 7fb82ed9500fa9c0a67fc9e01007e18954407049 have NO FINDINGS records. Commit c4bcf102349571db630dd8bbed11d9308f83fba0 claims passed tests and CI despite README.md:3 stating neither exists; executing its command with --json still prints text. Commit 3abbb2831b1f4e716b6d25aa2e56db4bf6cd42d0 contradicts its normative default. Both have ordinary blocking factual finding records supported by the inspected source. The canonical reviewer explicitly checks these contradictions and allows historical absence. Trial isolation is procedural and model identity is not attested.

CRITERION: AC-04 The coordinated change uses the authoritative Docs template and a published exact framework pin; existing specs, baseline/status gates and verbatim review records remain compatible without a binary-format change or bulk migration.
VERDICT: not met
EVIDENCE: At clean framework commit 557cf2a6f492405f326a3d35ba5833d72c8bfe89, AGENTS.md still selects Docs 0e52f51f01b84eda75a976763c42d8ec0a07b544 and plugin knowledge.md retains f8ccacbedf057159ea24136ba115cd9857bb22ac. Neither adopts companion candidate 614bb27a7c1809f4a6e3ab86040329a82466efe0. Compatibility preparation passes: the focused Bun command reports 66 passing tests and 262 assertions; the actual binary preserves stored records and distinguishes summary-only edits from normative revisions; the candidate machine-readable rules block is byte-identical to the effective standard. Both candidate manifests agree on 0.11.0, and no binary-format implementation changes occur. These passing subsets do not establish the required published pin adoption.

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan / AC-02; tests/vh-adlc/owner-summary.test.ts:99-114
EVIDENCE: The accepted proof requires an observed author trial with a revised summary and owner-facing message. The implemented test constructs those summary changes directly, inserts synthetic lifecycle rows and stops after confirming renewed acceptance is required. The supplied semantic trial artifacts contain reviewer cases and results, with no author-operation transcript establishing the conversation-summary requirement.
PROPOSAL: Before marking AC-02 met, execute and preserve a disposable author-operation trial covering normative revision and the pre-acceptance conversation summary. Keep any simulated acceptance explicitly labelled synthetic and retain the distinction between planned validation and observed results.

### R-3

CRITERION: AC-01 New specs following the published shared template begin Context with a useful Owner summary that covers scope, approach, consequential trade-offs, validation state and owner decisions without adding a second normative contract.
VERDICT: not met
EVIDENCE: At clean framework commit 4e1523bdcd5d1d0dac4916df490d789abdb2f11e, vh-adlc knowledge resolves repository Docs revision 0e52f51f01b84eda75a976763c42d8ec0a07b544. Its cached template lacks Owner summary. Companion candidate 614bb27a7c1809f4a6e3ab86040329a82466efe0 supplies the intended template and passed the previously observed Node24 documentation check. The candidate remains outside the effective framework pin, so published-template adoption is incomplete.

CRITERION: AC-02 The author refreshes the summary on a normative revision and before acceptance; planned validation and observed results remain distinct, and the owner still receives the existing conversation summary before deciding.
VERDICT: met
EVIDENCE: Inspected the disposable author trial at exact commit 46c42032fbdd476f1c94bb47762b3f4aa1afe400. Its preserved binary output records a passing draft gate, followed by status-only commit 96d0bfac6cd847d4d013baa92ce8b4904fde311a before the normative revision. The model-authored revision updates the saved summary and detailed contract consistently, explains the changed default and caller migration, and labels implementation tests and CI planned. The delivered conversation artifact includes revised behavior, migration, proof limits, recovery, acceptance authority and the full-spec link before a decision. Independently reran trial lint successfully and observed freshness report baseline-changed for the earlier review. Stored review records remain byte-identical. Durable evidence copies match the inspected originals. This establishes the accepted source-procedure author trial and closes F-01. The starting acceptance state is synthetic, and native installed-plugin invocation and a real owner-acceptance transaction remain unverified.

CRITERION: AC-03 Independent spec review identifies a materially stale, contradictory or unsupported summary through ordinary finding records while allowing an untouched historical spec without a summary.
VERDICT: met
EVIDENCE: The implementation and semantic fixtures are unchanged from independently reviewed commit 557cf2a6f492405f326a3d35ba5833d72c8bfe89. Previously inspected exact historical and honest fixture commits retain NO FINDINGS records. The unsupported-proof and changed-default fixtures retain ordinary blocking factual finding records supported by their source. Independent inspection confirmed the claimed passing tests contradict README.md and the proposed changed default contradicts Scope and AC-01. The canonical reviewer explicitly checks those contradictions and allows historical absence. Trial isolation is procedural and model identity is not attested.

CRITERION: AC-04 The coordinated change uses the authoritative Docs template and a published exact framework pin; existing specs, baseline/status gates and verbatim review records remain compatible without a binary-format change or bulk migration.
VERDICT: not met
EVIDENCE: At clean framework commit 4e1523bdcd5d1d0dac4916df490d789abdb2f11e, the repository still resolves Docs 0e52f51f01b84eda75a976763c42d8ec0a07b544 and plugin knowledge retains f8ccacbedf057159ea24136ba115cd9857bb22ac. Adoption of companion candidate 614bb27a7c1809f4a6e3ab86040329a82466efe0 remains pending. Only the feature document changed since the previously observed focused suite passed 66 tests with 262 assertions. Previously verified rules-block identity and binary compatibility therefore remain applicable. Current framework lint passes, freshness reports both recorded reviews fresh, and feature_tree.clean is true. These checks establish compatibility preparation while the required published exact pin remains incomplete.

## Sources

- [Shared template at the current effective revision](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/feature-document-template.md): authoritative template ownership and current Context placeholder.
- [Shared feature-document standard](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/feature-documents.md): required sections, baseline and review record contracts.
- [Rust RFC template](https://github.com/rust-lang/rfcs/blob/main/0000-template.md): short summary and reader-oriented explanation before detailed design.
- [Kubernetes KEP template](https://github.com/kubernetes/enhancements/blob/master/keps/NNNN-kep-template/README.md): Summary before proposal/design and readiness detail.
- [GitHub Spec Kit template](https://github.com/github/spec-kit/blob/main/templates/spec-template.md): user scenarios and acceptance orientation; not adopted as a replacement format.
