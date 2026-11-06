---
status: in-progress
status_description: "Preparing summary workflow; final adoption waits for shared Docs PR26 to land."
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
live in vh-adlc. Land the upstream documentation change first, then adopt its exact published revision.
Old specs stay valid, old review records stay unchanged, and no parser or gate change is needed.

Validation will exercise a new spec, a scope revision, a stale summary and historical specs with no
summary, using the real lint/freshness commands and an observed author/reviewer trial. This is a draft
workflow change, not implemented or accepted. Acceptance authorizes that change; bulk rewrites,
publications and unrelated feature work remain outside it.

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
- [ ] AC-02: The author refreshes the summary on a normative revision and before acceptance; planned validation and observed results remain distinct, and the owner still receives the existing conversation summary before deciding.
- [ ] AC-03: Independent spec review identifies a materially stale, contradictory or unsupported summary through ordinary finding records while allowing an untouched historical spec without a summary.
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
      Evidence: Docs PR https://github.com/vhco-pro/docs/pull/26 at `614bb27a7c1809f4a6e3ab86040329a82466efe0` passes Node24 `npm run check`, independent documentation review and hosted CI42145106147. Rules and top-level headings compare unchanged. PR is open/unmerged; adoption is pending.
- [x] T2 `plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md`, `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md`, `docs/get-started/first-feature.md` - author/reviewer guidance keeps the saved summary consistent and preserves conversation acceptance (AC-01, AC-02, AC-03)
      Evidence: source guidance is updated conditionally on the resolved template, preserving existing conversation acceptance and historical records. This prose change has no meaningful failing unit test; real binary compatibility and independent semantic trials follow in T3.
- [ ] T3 `tests/vh-adlc/owner-summary.test.ts` - real binary compatibility checks and observed author/reviewer fixtures distinguish planned proof, scope revisions and misleading summaries while historical specs remain valid (AC-02, AC-03, AC-04)
- [ ] T4 `AGENTS.md`, `plugins/vh-adlc/knowledge.md`, both plugin manifests - after the companion Docs delivery lands, adopt its exact published pin and pass affected package/lifecycle checks and independent review (AC-04)

## Open Questions

None. The owner selected summary inside Context, preserving the existing format.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-06 | R-1 | spec | `9aac9eeff9e20d30816b0ab8a43f313c30ee2e65` | unknown | procedural | No findings; model identity not attested. |
| 2026-11-06 | R-1 | spec | `9aac9eeff9e20d30816b0ab8a43f313c30ee2e65` | n/a | n/a | accepted by owner |

### R-1

NO FINDINGS

## Sources

- [Shared template at the current effective revision](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/feature-document-template.md): authoritative template ownership and current Context placeholder.
- [Shared feature-document standard](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/feature-documents.md): required sections, baseline and review record contracts.
- [Rust RFC template](https://github.com/rust-lang/rfcs/blob/main/0000-template.md): short summary and reader-oriented explanation before detailed design.
- [Kubernetes KEP template](https://github.com/kubernetes/enhancements/blob/master/keps/NNNN-kep-template/README.md): Summary before proposal/design and readiness detail.
- [GitHub Spec Kit template](https://github.com/github/spec-kit/blob/main/templates/spec-template.md): user scenarios and acceptance orientation; not adopted as a replacement format.
