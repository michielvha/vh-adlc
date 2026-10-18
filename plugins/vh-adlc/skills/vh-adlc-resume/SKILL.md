---
name: vh-adlc-resume
description: Reconstruct where a vh-adlc feature stands from its issue, document or branch and report the one next step the vh-adlc binary names. Use only when the owner invokes /vh-adlc-resume or asks to resume a vh-adlc feature.
---

# vh-adlc-resume

Input: an issue, a feature document, a branch, or "continue". Follow `references/loop.md` and
`references/authority.md`.

1. Get the binary and run `vh-adlc knowledge` with `conventions/feature-documents.md`,
   `conventions/delivery.md` and `guides/humanize-prose.md`. Report the one-line result.
2. Run `vh-adlc find` to locate the document. Reconcile it with Git (`git worktree list --porcelain`, the
   document's `branch`, unpushed or unpublished commits), the issue and any PR.
3. Establish the owning worktree. If the branch is checked out in a worktree you cannot use, or another
   session may still be writing, report the owner action needed (a handoff) and stop; never resolve against
   an unrelated branch or worktree.
4. In the owning worktree, run `git fetch origin <default branch>`, then `vh-adlc fresh` and `vh-adlc next`.
   Quote both results.
5. Report: status, remaining tasks, the review targets and whether they are fresh, the owning worktree, any
   blocker with the smallest decision that clears it, and the next operation `next` named with its reason.
   Missing committed state is a blocker, never a reason to restart the feature.

"Continue" never means merge, release, change credentials or start another feature. Edit the report with
`guides/humanize-prose.md` at the resolved revision and name the page and revision. In this release resume
reports; continuing into the next operation comes with the build loop.
