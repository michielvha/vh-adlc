---
name: vh-adlc-spec
description: Author or review a vh-adlc feature document, the single document that is both a feature's spec and its plan. Use only when the owner invokes /vh-adlc-spec or explicitly asks to specify, revise or review a feature with the vh-adlc loop; it is not the entry point for planning in general.
---

# vh-adlc-spec

Two modes: author (`/vh-adlc-spec <issue, goal or document>`) and review (`/vh-adlc-spec review <path>`).
Follow `references/loop.md` for every step it describes, `references/authority.md` for what you may do
without asking, and `references/review-protocol.md` for the review mode.

## Start

1. Get the binary and run `vh-adlc knowledge` with `conventions/feature-documents.md`,
   `guides/feature-document-template.md`, `conventions/documentation.md`, `conventions/delivery.md` and
   `guides/humanize-prose.md`. Report the one-line result. Read those pages from the cache before writing.
2. Run `vh-adlc find` with the issue number or the slug. If a document exists, extend it; never create a
   second document or a second issue for the same feature.
3. If the document has a `branch` field, work only on that branch in its owning worktree. Otherwise work
   on the default branch in a worktree that holds it, without disturbing anyone's changes.

## Author mode

- Write from the template page at the resolved revision, into the feature root `vh-adlc knowledge`
  reported. A new document starts at the first status the standard gives; `find` returning nothing is what
  allows creating it.
- Ground every claim in a citation you gathered in this run: a `file:line`, a command and its output, or a
  source you read and list. Measure rather than remember.
- Write criteria as end states, each with a Test Plan row naming a real check.
- Put every judgement call into Open Questions in the standard's decision shape, and put each to the owner
  with the host's question tool. Never answer one yourself. Fold the owner's answers into the document.
- Creating an issue needs explicit authority.
- Run `vh-adlc lint` and fix what it reports before committing.

## Review mode

1. Commit the document first; a review targets an exact commit. Call it X.
2. Dispatch `vh-adlc-reviewer` as `references/review-protocol.md` describes, with the document, X, kind
   `spec`, the docs revision, the binary path and the plugin pin. If dispatch is impossible, write the handoff and leave
   the review pending.
3. Store the returned records under the next `### R-<n>` with a Review Log row at X, before changing
   anything, then run `vh-adlc review check` against the returned text.
4. Apply factual findings. Turn judgement findings into Open Questions for the owner. Commit. A blocking
   pass is cleared only by a new independent pass at the new commit.
5. When a clean review at X exists and Open Questions is empty, ask the owner to accept. On acceptance in
   session, append the acceptance row at X, run `vh-adlc gate planned`, and on a pass move the status and
   commit with the gate's line.

## Revising a planned or in-progress document

Before changing anything in the normative baseline the standard defines, run `vh-adlc gate draft` and
commit the move to draft on its own, on the feature branch when one is set. Then revise, review and accept
again as above. On a normative revision, reset criterion ticks and remove live evidence and residual lines;
their history stays in Git. Keep checked tasks and add new task IDs for changed requirements.

## Committing and pushing

Edit every prose section, commit message and report with `guides/humanize-prose.md` at the resolved
revision before writing it, and name the page and revision in the report. While the document has no
`branch` field, commit it (with first-run onboarding files) on the default branch and push those
documentation-only commits there, as the delivery convention at the revision describes for such
deliveries. A rejected push is a partial result: keep the commit and ask whether to open a PR instead.

## Report

What changed, the knowledge line, every `vh-adlc` result you acted on (quote its JSON `result` and `line`),
what was verified, and what is left, including any review that is pending.
