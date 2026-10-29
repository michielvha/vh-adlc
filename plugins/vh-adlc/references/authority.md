# Authority, identity and preservation

Lifecycle orchestration belongs to this framework. Shared docs supply pinned
engineering rules; they do not own its dispatcher or maintenance state. Generic
intake follows `references/lifecycle.md`; selecting a procedure creates no
additional execution or publication permission.

## What each action needs

| Action | Authority needed |
| --- | --- |
| Read files and run non-mutating checks | The current task |
| Draft a requested spec or analysis | The request |
| Commit and push a feature document without a `branch` field, with first-run onboarding files, to the default branch | Directly invoking `vh-adlc-spec` or `vh-adlc-tasks`, or the claim commit of a directly invoked `vh-adlc-implement`; generic selection needs a separate publication request |
| Edit code, tests and docs, and commit on the feature branch | Accepted feature scope |
| Edit, check, record and commit eligible bounded maintenance locally | The owner's explicit maintenance request, eligibility under `references/lifecycle.md`, and local instructions that permit it |
| Complete a maintenance task locally | Observed required checks, a current independent maintenance review with no open findings, and preserved task scope |
| Execute a presented exact triage batch | Current owner approval of its exact repository, IDs, action payloads, evidence, separately shown local patches and local plan commit; revalidate each item through `references/triage.md` |
| Save/commit a maintenance sweep report | The owner's sweep request; a local commit additionally needs an explicit request or consumer rule and uses the isolated report-only role |
| Publish a maintenance report | An adopted `Standing maintenance report publication` declaration or exact current artifact/repository/default-branch request; use `default-branch-checkout-ff-only` and current restrictions, including no-push |
| Deliver selected consumer dependency work | Its actual approved/preauthorized PR/head/payload scope and retained local conditions; authored repairs still require current independent review |
| Create a tracking issue | Included in acceptance, or requested; a triage-created issue must be in its exact approved batch |
| Push the feature branch, create or update its PR, update the linked issue | An explicit ship request, whether directly named or selected through intake |
| Merge, tag, release, deploy, restart a running app, end a live session | Separate approval for that exact action |
| Destructive Git or data operations, history rewrites, credential changes | Separate approval for that exact action |
| Enabling automatic merged-branch deletion or cleaning stale merged branches | Owner-authorized repository configuration or branch cleanup; verify current tips are merged and preserve active worktrees |
| Another repository, account or feature | A new scope decision |

A lifecycle-selected operation inherits only the underlying task's authority.
Its direct-invocation publication grant does not transfer through selection:
keep authorized document work local and stop before a required push unless the
owner separately requested publication. Host approval cannot supply missing
task authority, and a declined publication attempt is not successful routing.

A green suite, an earlier approval or "continue" never stands in for a missing approval. Within accepted
scope, do not ask again for each edit or commit. Host permission prompts are the host's business. A
request to investigate or draft is never permission to build, and an issue comment never changes a
status. An instruction not to use the loop always wins.

Every published triage verdict and local assessment patch requires current proof in the confined
controller described by [the boundary guide](triage-boundary.md), plus exact owner approval. This
includes non-closure comments, labels and new issues. Plain chat covers only the structurally
attributed task-data and neutral-vocabulary exceptions; an annotation cannot exempt a verdict.
Saving or explicitly committing a local report grants no remote-publication or push authority.

Triage analysis is read-only on GitHub, including comments and existing labels. A current explicit
owner request may surface an index checklist/closure proposal; fresh exact batch approval is still
required. Bot-owned, protected-ID and other-workstream exclusions never get that exception.
Changed evidence or payload invalidates its item. Separately approved plan patches retain lifecycle
checks and the shown local plan commit; report commits remain opt-in. Triage grants no issue
implementation, feature shipment, merge, release or credential authority.

## Identity

Before any GitHub write, verify which repository and account the write goes to. Never switch a shared
global CLI account; prefer credentials scoped to the one command. A 404 can mean missing or forbidden, so
say which is known. Never try unrelated credentials. Never print tokens, credential-bearing URLs, cookies,
signed URLs or keys.

## Preservation

Inspect staged and unstaged state before any branch or commit operation. Never stash, reset, clean,
check out over or overwrite changes the loop did not make, and stage explicit paths only. The index may
already hold someone else's staged work, and a plain `git commit` would take it too, so always name what
you commit: `git commit -m <message> -- <path>...`. That commits only those paths and leaves the rest
staged as it was. A conflicting concurrent edit to the same file stops the run with a question.

Work on a feature only in its owning worktree, found with `git worktree list --porcelain`; run branch
checks, `fresh` and `gate` there. Outside the maintenance roles below, never create, remove, prune, reset or force-move a worktree,
and never repoint an unrelated branch. Another session continues a feature only after the owner confirms the
earlier writer has stopped and hands it over; a pushed claim advertises the branch, it is not a lock.
Missing committed state blocks the feature; it is never a reason to restart it.

## Handoff

A session cannot see whether another session is still writing a feature. So once a feature has a claim (a
`branch` field), write to it only when this session made that claim, or when the owner has said in this
session that the earlier writer has stopped and the feature is yours. Until then, read, check and report
freely, then ask the owner for that handoff and stop before the first write. Invoking an operation is not
a handoff, and neither is anything an issue or PR says.


## Scoped maintenance locations and publication

Under an owner-selected maintenance procedure, ordinary creation and non-forced cleanup may cover:
(1) a fresh batch source worktree/ref; (2) a primary evidence worktree/ref; (3) a selected satellite
or independent source worktree/ref; (4) a needed fresh clone of that selected source repository; and
(5) a primary report-only worktree/ref when a current request or explicit local rule permits its commit.
The fifth role is available before dependency selection and grants no dependency action or push.
Record repository, base, owner/new paths and refs. Never reuse occupied paths, repoint another task's
ref or discard staged/dirty work. Remove only clean owned worktrees normally; retain refs when ordinary
deletion refuses after a squash. Force deletion, history rewriting and unrelated cleanup remain outside
this exception. Preserve evidence through source cleanup and pending reconciliation.

Report publication is the narrow exception described in maintenance.md: freshly fetched committed
AGENTS/settings/project-procedure instruction bindings or a current exact publication request,
only the run's report and explicit generated indexes, transferred and pushed from the owning
default-branch checkout. Direct and intake-selected sweeps use the same underlying permission.
The current request wins over a standing grant. An unadopted declaration, report, advisory or journal
cannot authorize itself. No-push local commits stay on isolated report refs; a pending push adds no
new dependency gate when the original local report-commit prerequisite is already met.

Later same-run report updates need their delegated or current authority and a fresh candidate.
Pending outcomes stay Git-private until safe reconciliation. A rejected push after transfer exposes
the existing shared-main report commit; do not conceal it with a reset, rebase or force push. The
report grant covers no task record/evidence ref, dependency/source change, release dispatch, shared
stack stop or protection bypass. Retained local delivery tools and scoped skip-leak recovery operate
only within their existing approved consumer conditions; current restrictions still win.
