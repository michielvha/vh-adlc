---
status: draft
status_description: "Factual correction proposed for #7; independent review and the owner's decision on the completed baseline are pending."
issue: https://github.com/michielvha/vh-adlc/issues/7
goal: "The host documentation distinguishes the reviewer's inventory identifier from its declared and dispatched names."
covers:
  - docs/specs/personal-development-loop.spec.md
---

# Plan: Reviewer discovery naming

Correct the Claude Code host documentation without changing the plugin or its dispatch procedure.

## Context

The completed loop's Hosts table says Claude Code identifies an agent by its frontmatter name
(`docs/specs/personal-development-loop.spec.md:554`). Its package tree lists
`agents/vh-adlc-reviewer.agent.md` with frontmatter name `vh-adlc-reviewer`
(`docs/specs/personal-development-loop.spec.md:586`).

`claude plugin details vh-adlc@vhco-tools` on Claude Code CLI 2.1.283 listed
`Agents (1) vh-adlc-reviewer.agent`, as the [macOS installation record](https://github.com/michielvha/vh-adlc/blob/4ed1b91d656febc6dbf93634345a96db0ed051a2/tests/vh-adlc/evidence/claude-code/S1.host.macos.md)
records. The completed loop's R-31 F-02 separately records dispatch as
`vh-adlc:vh-adlc-reviewer` on Linux. This is historical dispatch evidence, not a new dispatch test.

D-42 preserves the completed baseline and defers this correction to a normative revision
(`docs/specs/personal-development-loop.spec.md:112`). No such revision has been accepted here.

## Scope

In scope: the Claude Code cell in the Hosts table and the reviewer annotation in the package tree.

Out of scope: renaming the reviewer file, changing its frontmatter, changing dispatch instructions,
changing another host's behavior, invoking an authenticated reviewer or claiming GUI support.
The existing completed document remains unchanged until the baseline decision is accepted.

## Design

The Claude Code cell states that agent files are Markdown and that the component inventory lists
this reviewer as `vh-adlc-reviewer.agent`, derived from its filename. It does not describe the
frontmatter name as the inventory identifier.

The package tree retains `agents/vh-adlc-reviewer.agent.md`. Its annotation distinguishes the
inventory identifier `vh-adlc-reviewer.agent` from the declared name `vh-adlc-reviewer`.
The separately observed dispatch name remains `vh-adlc:vh-adlc-reviewer`; no new dispatch result
is implied.

No plugin file changes, version bump or generated compatibility files are needed.

## Acceptance Criteria

- [ ] AC-01: The Claude Code Hosts cell names `vh-adlc-reviewer.agent` as the observed inventory identifier and does not claim that inventory uses the frontmatter name.
- [ ] AC-02: The package tree shows the actual reviewer filename and distinguishes its inventory identifier from its declared name.
- [ ] AC-03: The plugin manifest, reviewer file and dispatch procedure are unchanged by the documentation correction.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Compare the corrected cell with `claude plugin details vh-adlc@vhco-tools` in an isolated profile and the recorded macOS output. |
| AC-02 | Compare the package tree with `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md` and its frontmatter. |
| AC-03 | `git diff --exit-code <implementation base> -- plugins/vh-adlc/` reports no change. |

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q1: How should the completed loop's accepted baseline receive this correction?

**Recommendation:** A. Accept a normative documentation revision with a fresh review, keeping the
correction in the table readers already use.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Revise the completed baseline through a new accepted revision** | The Hosts table and package tree become accurate in place. | An explicit baseline decision and fresh review before the correction is applied. |
| **B. Preserve the historical baseline and publish an erratum separately** | The completed record stays byte-identical. | Readers must follow a separate correction; the wrong table remains in the historical document. |

**Why this is yours:** D-42 deliberately preserved an accepted baseline. A factual observation does
not give an implementation session authority to replace that decision.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [Personal development loop](personal-development-loop.spec.md): current Hosts row, package tree,
  D-42 and R-31 F-02.
- [Issue #7](https://github.com/michielvha/vh-adlc/issues/7): the deferred naming correction.
- [macOS installation evidence](https://github.com/michielvha/vh-adlc/blob/4ed1b91d656febc6dbf93634345a96db0ed051a2/tests/vh-adlc/evidence/claude-code/S1.host.macos.md):
  the observed component inventory.
- [Feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md):
  draft status, review, acceptance and normative-baseline rules.
