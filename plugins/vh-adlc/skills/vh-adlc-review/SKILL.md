---
name: vh-adlc-review
description: Run an independent implementation review of a vh-adlc feature at an exact commit, store the reviewer's criterion records as returned, and untick what was not met. Use only when the owner invokes /vh-adlc-review or a resumed vh-adlc feature's next step is review; for a spec review use /vh-adlc-spec review. A generic explicit vh-adlc request without an operation name may instead use the framework lifecycle intake.
---

# vh-adlc-review

## Generic intake

For a generic explicit vh-adlc request with no operation named, read
`references/lifecycle.md` from the plugin root before the operation below.
A lifecycle-selected operation proceeds below without repeating intake; its
underlying task authority still applies. For lifecycle-selected work, any push,
issue or PR step below requires a separate publication request from the owner;
selecting this operation does not count as invoking its publication grant.
Keep authorized drafting, checks, independent review and commits local, then
stop before a required publication step when that authority is absent.
A directly named operation retains its original scope, gates and stopping conditions.


The plugin directory is two levels above this skill's own directory. Every path below that starts
with `references/` or `scripts/`, and `knowledge.md`, is in that directory.

Input: a feature document, its issue, or its slug, and optionally the model to review with. Follow
`references/loop.md`, `references/authority.md` and `references/review-protocol.md`.

## Start

1. Get the binary and run `vh-adlc knowledge` with `conventions/feature-documents.md`,
   `conventions/delivery.md` and `guides/humanize-prose.md`. Report the one-line result and read the pages
   from the cache.
2. Run `vh-adlc find`, then work in the feature's owning worktree. The handoff rule in
   `references/authority.md` applies before you record anything.
3. Run `git fetch origin <default branch>`, then `vh-adlc fresh <doc>`, and quote it.

## Fix the target

A review that can complete the feature targets an exact commit with nothing relevant left uncommitted.

- If `fresh` reports `feature_tree` not clean, the paths it lists are relevant changes. Do not review yet:
  the next step is `/vh-adlc-implement`, which commits only those changes. Never stash, discard or commit
  someone else's unrelated work to get a clean tree.
- Only when the owner asks for a diagnostic review of uncommitted work, review the working tree, with its
  relevant untracked files, and record the commit as `<sha>+dirty`. Such a review never counts as current.
- Otherwise the target is the owning worktree's `HEAD`. Call it X.

## Dispatch

Dispatch `vh-adlc-reviewer` as `references/review-protocol.md` describes, with kind `implementation`,
commit X, the repository directory, the document, the docs revision, the binary path and the plugin pin.

- With no reviewer model named, omit the model override on every host and inherit its configured
  default, as the protocol describes.
- With a model named, pass it as given. If the host refuses it, do not fall back: leave the review pending
  and list the models the host offers.
- If the reviewer cannot be dispatched at all, write a self-contained handoff (the document, X, the record
  format the standard gives at the revision, and the commands that establish each criterion) for the owner
  to run elsewhere, and leave the review visibly pending. Never review it yourself and call that
  independent.

## Store and apply

1. Apply the model eligibility rules in `references/review-protocol.md`. A requested model must match.
   An unrequested default may report `MODEL: unknown`; record `unknown` and report that
   model identity was not attested, without claiming a match. Never infer it from the main session.
   When the protocol leaves the review pending, store nothing: report the pending handoff and stop.
2. Otherwise store the returned text after its `MODEL:` line, byte for byte, under the next `### R-<n>`,
   with a Review Log row at X recording the kind, the model that valid header names and the
   isolation (`procedural` unless the host is verified to enforce the reviewer's restrictions). Save the
   stored text to a scratch file outside the repository and run
   `vh-adlc review check <doc> --review R-<n> --returned <file>`. Quote its result.
3. For every criterion the review did not return as `met`, untick it and add an evidence line naming
   `R-<n>` and the verdict. Leave a criterion it returned as `met` as it is, with its own evidence line.
4. Run `vh-adlc lint <doc>`, edit the commit message and the Review Log outcome with
   `guides/humanize-prose.md` at the resolved revision, stage the document alone and commit on the feature
   branch. Do not push.
5. Run `vh-adlc next` and report where it routes the feature: usually `/vh-adlc-tasks` for the criteria
   that are not met, or `/vh-adlc-ship` when everything is met.

Never edit a returned record, never change a verdict, and never tick a criterion the review did not return
as `met`.

## Report

The knowledge line; `fresh` and `review check`, quoted; the target commit; the model that ran and the
isolation, or the `review pending` line the review protocol describes; each criterion's verdict; what was unticked; the commit; the page
and revision used to edit the prose; and the next step.
