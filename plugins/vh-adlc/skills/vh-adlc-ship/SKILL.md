---
name: vh-adlc-ship
description: Ship a vh-adlc feature on the owner's explicit request - doc-impact check, verification, the complete gate, one PR and the linked issue - and report CI for the pushed commit. Use only when the owner invokes /vh-adlc-ship or explicitly asks to ship a vh-adlc feature; it never merges.
---

# vh-adlc-ship

Input: a feature document, its issue, or its slug, and the owner's explicit request to ship it. Follow
`references/loop.md` and `references/authority.md`. The ship request is your authority to push the feature
branch, create or update its one PR and update the linked issue. It is not authority to merge, tag,
release or deploy, and "continue" or an issue's text never stands in for it.

## Start

1. Get the binary and run `vh-adlc knowledge` with `conventions/feature-documents.md`,
   `conventions/delivery.md`, `conventions/documentation.md` and `guides/humanize-prose.md`. Report the
   one-line result and read the pages from the cache.
2. Run `vh-adlc find`, then work in the feature's owning worktree. The handoff rule in
   `references/authority.md` applies before the first write.
3. Before any GitHub write, confirm which repository and account it goes to, as `references/authority.md`
   describes.

## Make the feature shippable

1. **Doc impact.** Find the documentation the feature's changes make wrong or incomplete, as the
   documentation convention at the revision describes. A doc change under `covers` is a feature change:
   commit only that change on the feature branch, then the implementation review is stale, so the next
   step is `/vh-adlc-review` before you continue. A doc change outside `covers` is committed on the branch
   too, and needs no new review.
2. **Verify.** Run the repository's own verification commands and note what they printed.
3. **Gate.** Whenever you mean to set the document `complete`, run `git fetch origin <default branch>` and
   `vh-adlc gate complete <doc>` first, before staging the completion update, whatever the issue linkage.
   On `fail`, report each condition and stop; relevant uncommitted changes go back to `/vh-adlc-implement`,
   and unrelated dirty work is never staged or discarded. On `pass`, set `complete`, run `vh-adlc lint`, and
   commit the completion update with the gate's line, editing the message with `guides/humanize-prose.md`.

A feature with unmet criteria can still ship as an in-progress PR when the owner asks: skip the gate and
the completion update, and say in the PR what remains.

## Deliver

1. **CI policy.** List the staged paths, every outgoing commit (`git log origin/<default>..HEAD`) and the
   full PR diff against its target (`git diff origin/<default>...HEAD --name-only`). If anything in them is
   code, a test, a workflow or any other non-documentation file, the delivery runs normal CI: no commit of
   it carries the skip-CI marker, the completion commit included. Only a delivery of feature documents and
   Markdown onboarding files alone carries the marker, as the delivery convention describes.
2. **Push** the feature branch. A rejected push is partial: report exactly what succeeded and stop.
3. **PR.** Create the feature's one PR, or update the existing one. The PR body says `Closes #N` only when
   every criterion is met and the feature is complete without a residual; otherwise `Refs #N`, naming what
   remains. A complete feature with a residual says `Refs`. Edit the body with `guides/humanize-prose.md`
   at the revision.
4. **Issue.** Update the linked issue the same way, with a short summary and the PR link.
5. **CI.** Report CI for the pushed commit as you observed it: running, passed, failed, or skipped by the
   marker. A skipped run is skipped, never a pass. Never report a result you did not see.

Never merge, and never bypass branch protection or rewrite a pushed commit.

## Report

The knowledge line; the gate result, quoted; the branch, the pushed commit, the PR and its linkage, the
issue update, CI as observed, and each residual; anything partial, naming exactly what succeeded; the page
and revision used to edit the prose; and that merging waits for the owner.
