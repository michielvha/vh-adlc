---
name: vh-adlc-implement
description: Implement an accepted vh-adlc feature task by task on its feature branch, after claiming it on the default branch, with each criterion's test written first and watched failing. Use only when the owner invokes /vh-adlc-implement or a resumed vh-adlc feature's next step is implement. Generic vh-adlc requests use lifecycle intake.
---

# vh-adlc-implement

## Generic intake

For generic vh-adlc requests without an operation name, follow `references/lifecycle.md`; then continue here.

The plugin directory is two levels above this skill's own directory. Every path below that starts
with `references/` or `scripts/`, and `knowledge.md`, is in that directory.

Input: a feature document, its issue, or its slug. Follow `references/loop.md` for every step it describes
and `references/authority.md` for what you may do without asking. Accepted scope is your authority to edit,
test and commit on the feature branch; it is not authority to push that branch, open a PR or merge.

## Documentation impact

Before Start's first knowledge request and before any repository write, commit
or remote action, follow the entry preflight in `references/docs-impact.md`.
Acquire the verified binary through the ordinary installer, then inspect root
`AGENTS.md` at committed HEAD for the raw adoption marker. Clearly absent keeps
the existing manual path; unreadable policy or a roots gap stops this invocation.
Use `scripts/docs-impact/cli.ts roots --repo <repo>` for any marker, including
fenced/indented examples; never parse caller YAML. Declared roots add
`conventions/documentation-impact.md` to every knowledge request, including
Start's initial request. On missing-page stop with a pin-update handoff before
the first write; never silently take the manual path or change a pin.

At each task's existing verification stage, before ticking or committing it,
run `references/docs-impact.md` with that task's explicit source scope and each
owned doc overlay as `--metadata-path`. Preserve all other dirty work. Authorized
minimal doc corrections join that task's checks and commit. An incomplete
assessment stops before ticking/committing; preserve edits and resolve its gap
within scope or hand it off. Undeclared repositories retain their existing flow.

## Loop routes

This operation's loop role and route come from `.vh-adlc/loop.yaml` through
`bun scripts/loop/cli.ts route` (`references/loop-settings.md`); without the file, every role keeps the
host default. Before acting, read every file `bun scripts/loop/cli.ts context` lists: the repository's instruction
files and its project procedure, whose local rules apply alongside this procedure. A `host` route that names a model runs with it as a requested model.

## Start

1. Get the binary and run `vh-adlc knowledge` with `conventions/feature-documents.md`,
   `conventions/delivery.md`, `conventions/coding.md` and `guides/humanize-prose.md`, plus any language
   page the repository's pin routes this work to. Report the one-line result and read the pages from the
   cache.
2. Run `vh-adlc find` to locate the document, then read it whole.
3. Before any branch or commit step, run `git status --porcelain` and `git worktree list --porcelain` and
   note every change you did not make. Those stay byte-identical: never stash, reset, clean, check out over
   or stage them.

## Enter

Run `git fetch origin <default branch>`. What happens next depends on the document's state.

**`planned`, no `branch` field: claim it.**

1. Work in a worktree that has the default branch checked out and is level with `origin`. If none can be
   used without disturbing someone's work, report the owner action needed and stop.
2. Run `vh-adlc gate in-progress <doc>` while the status is still `planned`. On `fail`, report every
   failing condition and stop.
3. Set `status: in-progress`, update `status_description`, and add `branch: <type>/<slug>`, using the
   branch naming the delivery convention at the revision gives. Run `vh-adlc lint <doc>`.
4. Commit the document's path alone, with the gate's `data.line` in the body. This claim commit changes
   only the feature document, so it carries the skip-CI marker the delivery convention describes; confirm
   that the staged path and every outgoing commit are documentation-only before adding it. If the
   repository needs onboarding first (`knowledge` reported source `plugin`), that is a separate commit
   before the claim, never part of it.
5. Push the default branch. The claim exists only once this push succeeds. A rejected or non-fast-forward
   push is a partial result: keep the local commit, create no branch, report it and stop.
6. Create the feature branch at the claim commit. When the current worktree holds the default branch at
   that exact commit, `git switch -c <branch>` keeps every uncommitted change as it is, and this worktree
   becomes the feature's owning worktree. Otherwise, report the owner action needed (a worktree for the
   branch) and stop; never create, move or reset a worktree yourself.

**`in-progress` with a `branch`: re-enter.**

1. Find the worktree that has the branch checked out, and continue only there. Unless this session made
   the claim, apply the handoff rule in `references/authority.md` before the first write.
2. Recover rather than restart:
   - a claim commit that is local but not on `origin`: retry its push before anything else;
   - a published claim with no feature branch: create the branch at that exact claim commit;
   - an existing branch: reuse it as it is, and never claim a second branch or reset its tip.
   A missing branch state you cannot recover, or two competing claims, is a blocker for the owner.
3. Run `vh-adlc gate in-progress <doc>` as a re-check. It must fail on nothing except, at most,
   `tasks_populated`. With open tasks missing, the next step is `/vh-adlc-tasks`.

## Implement, one task at a time

Take the first unchecked task. For each:

1. Write the test for the criterion first. Run it and watch it fail for the reason the task states, and
   keep the command and the failing output. If a failing test first is not feasible, record why.
2. Make the change. Re-run the test and watch it pass, then run the repository's own verification commands
   (its `AGENTS.md` lists them; ask if none is listed).
3. Tick the task with an evidence line naming the command and what you observed. Tick a criterion only
   when verification you observed in this run establishes it, with its own evidence line. Record what stays
   untested.
4. Stage only the paths this task changed, plus the document, and commit once. Edit the message with
   `guides/humanize-prose.md` at the resolved revision. These commits change code, so they never carry the
   skip-CI marker. Do not push.

Never edit a criterion, the Test Plan, Scope, Design or `covers` to fit what was built. If the design is
wrong, stop and route the change to `/vh-adlc-spec`, which revises it through `draft`.

## Finish

When every task is checked, run `vh-adlc next`. A feature is complete only after a fresh, clean
implementation review of a committed state: run `vh-adlc gate complete <doc>`, and change the status only
on `pass`, committing with its line. On `fail`, quote the failing conditions; the next step is usually
`/vh-adlc-review`.

## Report

The knowledge line; the gate results you acted on, quoted with `result` and `line`; the claim commit and
whether its push succeeded; the branch and owning worktree; each test seen failing and then passing; the
commits; what remains untested; that unrelated work was left as it was; the page and revision used to edit
the prose; and the next step.
