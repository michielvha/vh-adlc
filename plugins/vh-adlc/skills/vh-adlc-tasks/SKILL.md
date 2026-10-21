---
name: vh-adlc-tasks
description: Break an accepted vh-adlc feature document into one-commit tasks in its own Tasks section, or replan the unchecked tail of an existing list. Use only when the owner invokes /vh-adlc-tasks or the vh-adlc binary's next step is tasks; it never changes a status or ticks a task. A generic explicit vh-adlc request without an operation name may instead use the framework lifecycle intake.
---

# vh-adlc-tasks

## Generic intake

For a generic explicit vh-adlc request with no operation named, read
`references/lifecycle.md` from the plugin root before the operation below.
A lifecycle-selected operation proceeds below without repeating intake; its
underlying task authority still applies. A directly named operation retains
its original scope, gates and stopping conditions.


The plugin directory is two levels above this skill's own directory. Every path below that starts
with `references/` or `scripts/`, and `knowledge.md`, is in that directory.

Input: a feature document, its issue, or its slug. Follow `references/loop.md` for every step it describes
and `references/authority.md` for what you may do without asking.

## Start

1. Get the binary and run `vh-adlc knowledge` with `conventions/feature-documents.md`,
   `guides/feature-document-template.md`, `conventions/delivery.md` and `guides/humanize-prose.md`. Report
   the one-line result. Read those pages from the cache before writing.
2. Run `vh-adlc find` to locate the document. If there is none, stop: tasks need an accepted document,
   and the next step is `/vh-adlc-spec`.
3. Work where the document lives. With a `branch` field, that is the branch's owning worktree from
   `git worktree list --porcelain`; without one, a worktree on the default branch. If you cannot use that
   worktree without disturbing someone's changes, report the owner action needed and stop. With a
   `branch` field, the handoff rule in `references/authority.md` applies before you write.

## Check that the document is ready for tasks

Run `git fetch origin <default branch>`, then `vh-adlc gate in-progress <doc>`. This is a readiness check;
it never changes the status.

- On a `planned` document, the gate may fail on `tasks_populated` and on nothing else.
- On an `in-progress` document, the gate may fail on nothing except, at most, `tasks_populated`.

Any other failing condition stops the operation. Report each one, run `vh-adlc next`, and name the step it
gives (an owner decision, a spec revision or a review). Do not write tasks around a document that is not
ready.

## Write or replan the tasks

Read Scope, Design, Acceptance Criteria, Test Plan and any Implementation Phases, then the task line format
and the task ID pattern the standard gives at the resolved revision.

- Each task is one coherent commit. It names the file or files it changes, a done condition shaped as a
  check someone can run, and the criteria it advances, in that order on the task line.
- Order the tasks so each one depends only on tasks above it. A criterion's failing test comes before the
  change that makes it pass.
- Every task traces to a criterion or to Design. Never add scope; if the work needs something the document
  does not cover, put that to the owner as a question and leave it out of the list.
- A criterion that a review returned as anything other than `met` and that is now unticked gets work in the
  tail that would let a later review return it as `met`.

On a re-run, the checked tasks are finished history. Keep each checked task line and every annotation line
under it byte for byte, in place. Replan only the unchecked tail: keep an unchecked task that still fits,
rewrite or drop one that does not, and add what is missing. A new task takes the next ID above the highest
ID in the document; never reuse or renumber an ID.

Never tick a task, never tick or untick a criterion, and never touch Scope, Design, Acceptance Criteria,
Test Plan or `covers`. If one of those looks wrong, stop and route the change to `/vh-adlc-spec`.

## Verify and commit

1. Run `vh-adlc lint <doc>` and fix what it reports in the Tasks section.
2. Run `vh-adlc gate in-progress <doc>` again and quote the result. On a `planned` document it should now
   pass; if it fails, report why and leave the commit unmade.
3. Edit the commit message with `guides/humanize-prose.md` at the resolved revision. Stage the document's
   path alone.
4. Without a `branch` field, commit on the default branch and push it, as the delivery convention at the
   revision describes for documentation-only work. Before you add its skip-CI marker, confirm that the
   staged paths and every outgoing commit change only feature documents. A rejected push is a partial
   result: keep the commit and ask whether to open a PR instead.
5. With a `branch` field, commit on the feature branch in its owning worktree and do not push. Pushing the
   feature branch needs an explicit ship request.

## Report

The knowledge line; both gate results, quoted with their `result` and `line`; the tasks kept, rewritten,
dropped and added, by ID; the commit and whether it was pushed; the page and revision used to edit the
prose; and the next step `vh-adlc next` gives.
