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
| Inspect audit history or save a private assessment/proposal | Explicit audit scope; status is read-only and other modes follow `audit.md` |
| Apply/commit reverify/full ledger updates | Current explicit ledger-update/ledger-commit request or freshly adopted audit-mode effects; use the owned audit-ledger role at the exact clean assessed default base, never a shared or unrelated checkout |
| Repair selected audit findings and deliver a selected batch | Eligible selected local repair follows `audit.md` and `audit-record.md`; live/remote effects additionally need exact current permission or adopted `Standing audit workflow authorization`, current selection/restrictions and all retained gates |
| Create a tracking issue | Included in acceptance, or requested; a triage-created issue must be in its exact approved batch |
| Apply a label plan with the labels helper | The owner's approval of that exact plan digest for that repository (`references/issues.md`) |
| Push the feature branch, create or update its PR, update the linked issue | An explicit ship request, whether directly named or selected through intake |
| Record a merged feature's follow-up review: file the approved follow-up and gap issues, create one temporary worktree on a new `docs/follow-up-<slug>` branch from the remote default branch, commit the verdicts there, push that branch and open or update its PR | The owner's one approval in ship's follow-up review after merge (`skills/vh-adlc-ship/SKILL.md`). It never merges, never pushes the default branch, and needs no writer handoff, because it edits only the merged document's Deferred section |
| Merge | Separate approval for that exact action, or the explicitly selected audit batch's current/adopted `conditional-merge` permission and all retained gates in [audit.md](audit.md). Either one also covers that PR's `after-merge` branch cleanup in [branches.md](branches.md) |
| Rebuild/restart an owned audit verification runtime | Current explicit permission or adopted `live-verify` naming that exact owned development target and method, with all local ownership/restriction gates |
| Tag, release, deploy, restart an unrelated/shared app, end a live session | Separate approval for that exact action; audit grants none of these effects |
| Destructive Git or data operations, history rewrites, credential changes | Separate approval for that exact action; never a commit a Review Log row names, which no approval allows (see Preservation) |
| Run `vh-adlc clean`, which removes `/tmp` entries and the project's temp root | The user's request for cleanup, or a session blocked on space; passing `--compose` or `--kind` needs the user's request for that flag |
| Enabling automatic merged-branch deletion | The owner's yes to enabling it for that repository with `auto-delete --enable`, a request that already asks for it, or an approved plan digest that includes it, all from [branches.md](branches.md) |
| Turning on free repository security settings with the security-settings helper's `apply` | The consumer's committed settings adopt `security_settings: apply` for a repository they name, on github.com. Among maintenance runs, only a full sweep whose request has `authorized_sweep` true may apply; a request flag that selects `check` or a pull-request scope gives `check`. Onboarding applies only as the committed settings decide. A continuation reuses the run's saved helper files and does not run the helper again. Adopting `apply` is the owner's agreement that `guides/onboard-a-repository.md` in vhco-pro/docs asks for. Nothing grants turning a setting off. See [security-settings.md](security-settings.md) |
| Cleaning stale merged branches and their worktrees | Owner approval of the exact plan digest from [branches.md](branches.md), or a sweep request that already asks for stale-branch removal. A plan whose `remove-worktree` operations list ignored paths needs the owner's approval of its digest even after such a request |
| Another repository, account or feature | A new scope decision |

Scoped audit `live-verify` covers only the owned development target, temporary test resources and
methods its current/adopted verification policy actually names. It grants no persistent credential
change, live-data migration, production/shared operation or unrelated destructive cleanup.

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

No operation rebases, amends, squashes or otherwise rewrites a commit that a Review Log row names, or
any commit before it on that branch, even with the owner's approval: the binary would then report every
such review as `commit-unreachable` and stale. Bring default-branch work in with `git merge`, as review
mode does for drift, and never rebase a branch whose commits a Review Log cites.

A claim may also be made from a host worktree at the default-branch tip that is detached or on a branch
this session created or was handed, through `scripts/loop/cli.ts claim`; it never advances an unrelated
branch. With loop setting `implement_worktree: isolated`, implement asks the host's own worktree tool for
a worktree when it starts in the primary checkout. That worktree is the host's: the plugin itself still
creates none, and on a host without such a tool the operation stops before writing.

Work on a feature only in its owning worktree, found with `git worktree list --porcelain`; run branch
checks, `fresh` and `gate` there. Outside the maintenance, audit and docs-drift roles below, and the one temporary worktree ship's follow-up review after merge creates and removes for its `docs/follow-up-<slug>` branch, never create, remove, prune, reset or force-move a worktree,
and never repoint an unrelated branch. The one exception is the branch helper in [branches.md](branches.md):
under the authority above, it deletes branches and refs whose tips it proved merged, and removes the
clean worktrees its rules allow: no changed tracked files and no untracked files, with ignored files
going along. Owner approval of the plan digest, or of the merge, is the request for that removal; no
separate request is needed. Another session continues a feature only after the owner confirms the
earlier writer has stopped and hands it over; a pushed claim advertises the branch, it is not a lock.
Missing committed state blocks the feature; it is never a reason to restart it.

## Feature writer entry

For spec, tasks, implement, review recording or ship, first resolve the canonical issue
or spec and select the writing checkout under the existing worktree rules. Run the shared
reservation check once before the first feature mutation:

```sh
bun <plugin>/scripts/ownership/cli.ts enter --repo <checkout> --spec <document>
```

Use exactly one of `--spec`, `--issue` or `--branch`. Pass `--no-push true` if the current
request forbids pushes. To reserve or take over an unlinked issue, use a named branch
checkout. A detached checkout can resume or take over an issue with a linked spec,
and can still read the current writer of an unlinked issue. For a new explicitly
private draft without a remote, pass `--local-draft true` only with the final new
spec path and that owner authority.
Continue on `entered` or `legacy`. Use `local-draft` only for private draft authoring.
On `held`, a failed command or an unreadable result, show the reason and returned
writer location, then stop that writing operation. Use `status` to inspect the
reservation without claiming it. Independent read-only discovery and review need no reservation.

A direct `scripts/loop/cli.ts claim` performs the same check. In an adopted repo, pass
`--client codex` or `--client claude` to match the current native session. Resume invokes the
check through the selected writer operation. Ordinary edits and tests after entry
require no reservation checks. Authority to push source, create issues, merge or release
still comes from their own procedures.

For a planned spec move in an adopted repository, use `link` to bind the new path before
publishing it. For an adopted draft's approved tracker create, pass its final path as
`--ownership-spec` to the labels command. Verify its `ownership.status` is `linked` before
publishing the issue link or assigning that number to a writer. A lost tracker result leaves
the draft held. Check the preserved approved preview and lookup in the target repository,
have the owner confirm the issue number and run `issue-recover` with `--alias-issue`. If
the owner confirms no issue exists, use `--not-created true`. Use a new approval for any
future create. On an alias conflict, keep both histories and stop both writers until the
owner selects one reservation through `resolve-alias`.

## Reservation adoption

Use this procedure only for a repository and remote the owner selected. Pause feature
writers, record existing claims and keep their history and uncommitted work. Verify
that installed Codex and Claude Code routes recognize their own sessions and that
other writer routes will remain paused or read-only.

Inspect the adopting remote's effective rules for `refs/heads/vh-adlc/work-ownership`.
They must allow ordinary append updates by the selected writers and forbid deletion
and history rewrites. Inspect the consumer's branch cleanup and release workflows,
including push, manual dispatch and PR preview. Each must exclude this branch from
destructive cleanup and tag-capable execution. Use read-only rules inspection for the
real remote and a disposable remote to test prohibited pushes. Keep writers paused
when you cannot verify one of these controls.

With explicit owner approval to initialize the remote ref, choose a stable operation
ID and run:

```sh
bun <plugin>/scripts/ownership/cli.ts initialize --repo <checkout> --approved true --operation <id>
```

Keep the returned genesis. If the result is lost, retry only with the same operation
ID. A different existing genesis needs owner reconciliation. Add a binding to the
consumer's default branch under `.vh-adlc/work-ownership.yaml`:

```yaml
schema_version: 1
repository: github.com/example/project
genesis: <verified genesis>
ready: false
```

Apply the consumer's existing authority rules to publishing that policy. Set `ready`
to `true` only after checking remote policy, genesis, protection and release routes.
Keep general entry paused while you enroll existing claims. For each claim, follow
the handoff command below with `--expected-operation absent` from the selected
writer's checkout. Resume general writers after you verify the bindings and enrollment.
Routine feature entry can then update the reserved ref under the adopted policy.
Publication of code and issues still needs its own authority.

For rollback, pause writers and use `ready: false` while retaining the bound ref and
genesis. Coordinate any temporarily incompatible clients manually. Before restoring
automatic entry, verify the same history and compatible clients. If a remote restore
can remove both records, pause all feature writer entry first and keep it paused until
you restore and verify them. A fresh clone may have no local evidence that the old
remote was adopted.

## Transfer a reservation

Inspect the item with the `status` command and keep the returned operation. Confirm
the previous writer has stopped and keep it stopped until the transfer is verified.
Select the incoming session and its checkout. Keep the existing checkout or verify
that the destination contains the commits, staged, unstaged and untracked work
required to continue. If issue creation was pending, copy its marker and preview
together from `vh-adlc-reservation-pending` below the checkout's Git directory to
the same place at the destination. Verify both files, then keep draft entry held
until issue recovery completes.

From the incoming session and chosen checkout, run:

```sh
bun <plugin>/scripts/ownership/cli.ts handoff --repo <checkout> --spec <document> \
  --expected-operation <observed operation> --operation <new id> \
  --approved true --stopped true --preserved true
```

If Git reports an uncertain outcome, keep the old writer stopped and inspect status.
Retry with the same inputs only while the prior record is still current or the original
transfer is already verified. A different writer or operation requires fresh owner
direction. The previous writer sees the transfer on its next feature entry.

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
Record repository, base, owner/new paths and refs. Lock every worktree the run creates with the reason
`vh-adlc <run-id>` (`git worktree add --lock --reason` or `git worktree lock --reason`), so a branch
sweep or `after-merge` keeps it while the run is pending, and run `git worktree unlock` when the run
closes, before its own normal removal. Never reuse occupied paths, repoint another task's
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

## Scoped audit locations and effects

The owner-selected audit procedure in [audit.md](audit.md) permits ordinary creation of two roles:
audit-ledger, a new `chore/audit-ledger-<run-id>` worktree/ref for permitted reverify/full application
or commit at freshly fetched assessed default source; and audit-repair, the selected compatible
workstream source/record branch/worktree. Neither role grants remote action or cleanup of unrelated work.
Record owner/path/ref/base, exact candidate and outcomes privately. Lock every worktree the run creates
with the reason `vh-adlc <run-id>` and run `git worktree unlock` when the run closes, before its own
normal removal. No ledger-commit permission
leaves the candidate uncommitted only in its owned ledger role. A known local report is carried into
a repair publication only with explicit current inclusion of its shown commit and full ID scope.

Fresh committed origin/default AGENTS/settings/project-procedure bindings establish the optional
`Standing audit workflow authorization` in audit-settings.md. Candidate inspection is non-granting.
Reports, settings copies and unmerged edits cannot authorize themselves. Omitted effects withhold
a standing grant, not a separate explicit current request; actual local prohibitions and current
restrictions win. Status has no effects. Generic selected eligible fixes authorize local scoped
edits/checks/record/commits only. Conditional merge/live/issue/push/PR grants remain consumer-specific
and pending until the actual retained gates and current selected PR/head/evidence are observed.
An adopted/current merge policy may explicitly disclose automatic tag/build pipeline consequences
of its permitted merge. Those disclosed CI consequences belong to that merge scope; they grant no
separate manual tag/release action, workflow dispatch, production deployment, protection bypass,
real-data migration or secret rotation.

Retain private/pending ledger work, evidence refs and resource intents. Ordinary non-forced cleanup
may remove only clean owned audit roles after their outcomes/evidence are retained, published or
safely superseded. Keep refs when ordinary deletion refuses after squash; no force/prune/reset or
unrelated index/worktree cleanup follows. Development key/row verification must journal exact owned
scope before creation and reconcile cleanup before retry/completion; journal strings execute nothing.
These audit rules do not import maintenance report-push permission or triage's confined proof boundary.

A permitted audit-ledger update may use a separately recorded clean detached assessment worktree
at the freshly fetched default commit when shared main is dirty. This is part of the owned audit-ledger
role: record owner/path/base, lock it with `git worktree lock --reason "vh-adlc <run-id>"`, keep
assessment output private, and apply only in the separate owned
ledger branch after all audit gates. It grants no mutation or cleanup of unrelated worktrees.

## Scoped docs-drift locations and effects

The selected docs-drift procedure permits two owned locations.
`docs-drift-assessment` is an exact clean assessment checkout, including a new
detached assessment worktree when isolation is needed. `docs-drift-prepare` is
the owned branch/worktree for authorized prepare or resolve edits. Before use
record repository, canonical path, role, owner/run, ref/base and artifact
location. Lock newly created worktrees with reason `vh-adlc <run-id>` and
unlock when the run closes before normal removal. Create and normally clean
only those recorded roles. Use non-forced removal of clean owned resources,
retaining refs/evidence when ordinary deletion refuses. Branch creation leaves
commit, push, merge and release permissions to their selected grants.

The assessment role can contain two separately recorded external subresources,
`pr-object-store` and `trial-scratch`. Record canonical owned root, kind,
owner/run, selected repository/base/object identities and evidence before
creation. Fetch PR objects only into the new owned bare store from the verified
consumer origin/fixed PR ref, without writing caller refs or FETCH_HEAD.
The synthetic repository requires its selected trial scope. Preserve foreign,
unrecorded, symlink-escaped, failed or ambiguous resources for reconciliation.
Keep other writers' checkouts, index, changes and branches intact.

Use each row's authority and conditions. Ordinary effects need their actual
current request or an adopted consumer procedure naming the effect and exact scope.
Administrative abandonment and delivery acknowledgement require the owner's actual current approval
of their exact observed scope. The separately owner-approved committed trial
definition is the only standing source for the synthetic trial scope described
below. Local prohibitions and current restrictions still apply. Settings,
reports, PR prose and journals cannot authorize themselves.

The publication authority helper binds procedure bytes and exact manifest/effect
digests. It reports an owner attestation. It does not parse prose permissions.
Before relying on an adopted procedure, the invoking agent must confirm that
the committed current procedure explicitly permits each selected effect,
repository/destination and exact scope. A nonempty or unchanged procedure alone
supplies no semantic permission. Missing or ambiguous effect authority remains
pending for the owner. Passing the technical publication checks preserves this operator/agent
obligation.

| Action | Authority and conditions |
| --- | --- |
| Assessment and local report | Selected read-only assessment and explicit private output location. No tracker or feedback-store effects. |
| CI diagnostic upload | Selected worker/trial grant naming the existing run/repository artifact and summary destination and bounded report scope. |
| Prepare/resolve edits and generators | Selected confirmed corrections and exact owned preparation scope, with project checks and feature/document protection. |
| Local checkpoint commit | Explicit current commit permission or adopted consumer permission for that selected candidate. |
| Push and advisory/resolve PR | Exact selected destination, actor, branch and reviewed payload grant, current-default adoption, verification and independent review. |
| Owned consolidation-branch refresh | Explicit history-rewrite approval naming the exact owned branch/expected head and reviewed replacement. Preserve every commit a Review Log names. |
| Issue creation | Separate exact repository/title/body/labels grant, independent payload review and a relevant observed published evidence permalink. |
| Explanation comment | Actual comment grant for the selected PR and exact reviewed payload. A closure grant alone covers no comment. |
| Superseded-PR closure | Separate selected closure grant after observed consolidation merge and fresh complete per-hunk/record review. |
| Publication lease acquisition | Selected publication/trial grant explicitly naming acquisition and its exact ref namespace. |
| Owned lease release | Selected grant explicitly naming release, original ownership and exact object comparison, with terminal effects or gated reconciliation. |
| Receipt creation and retention | Selected grant naming the immutable retained namespace and its operation refs. Keep completed and other terminal receipt refs indefinitely. |
| Administrative abandonment | Owner's exact current approval of the repository, operation, lease/receipt refs and observed object IDs after lost original ownership. Confirm the original executor has stopped, linked through production `hosted_executor`, native-trial `trial_launch` or original local owned-process completion and absence of survivors; collector trials are ineligible. An administrator uses ordinary Git compare-and-swap to delete both the present lease and its same operation's single validated unresolved receipt in one atomic push. A stale or missing approved ref rejects both deletions. Retain inspection, stopped-executor evidence and approval, and supply no delivery or settlement proof. Preserve completed and other terminal receipts indefinitely. Follow `references/docs-drift-review.md`, Lost hosted origin and administrative abandonment. |
| Delivery acknowledgement | Owner's actual current approval of the exact presented lookup scope and evidence digests, original ownership, settled requests and fully applied eligible effects. |
| Workflow dispatch | Current trial/cutover grant naming the exact workflow and selected inputs. |
| Workflow disable/enable | Current cutover/rollback grant naming the exact workflow and effect. |
| Workflow-run cancellation | Current grant naming the identified run and cancellation effect. |
| Committed synthetic trial grant | Separate owner-approved committed trial definition selected by path/digest, binding the repository, workflow path/source, component, native role configuration, fixture namespace, effects and credential-selected publisher. Check the event against the committed caller trigger and the head against the approved dispatch commit. Bind the actual run ID/attempt at launch. Dispatch input alone creates no grant. This standing trial permission covers only its declared synthetic scope and supplies no production authority. Follow `references/docs-drift-settings.md`, Staged adoption and upgrades. |
| Synthetic draft PR | Separate trial grant naming the destination/namespace, selected fixture and draft-PR effect. |
| Owned trial PR/branch cleanup | Selected trial cleanup grant naming exact recorded owned resources. |
| Merged-branch cleanup | Applicable exact cleanup or merge grant under `references/branches.md`, with its retained ownership and preservation checks. |
| Merge or release | Separate actual approval for the selected effect and consumer delivery gates. Advisory publication grants neither. |

Provider/model execution needs its actual selected authorization separately.
Read-only collection supplies no tracker write. Docs-drift has its own native
publisher and recovery procedure in `references/docs-drift-review.md`.
It inherits neither maintenance report-push grants nor triage's confined
verification controller.

Acknowledgement and administrative abandonment exclude standing adopted procedures,
unattended controllers, publication/closure permission and general cleanup grants
as approval sources. Automatic expiry and job cancellation authorize neither action.
Administrative abandonment follows its exact unresolved ref/object approval and
the recovery guide above. For delivery acknowledgement, require original ownership, current actor/repository and
native evidence of every mutation request's settlement and full application.
Partial delivery stays pending. An observation-only restored mirror cannot
take ownership of a live lease. Recheck the displayed immutable scope before
acknowledgement and exact-owned atomic release. The acknowledged operation
permanently stops business replay and remains non-successful. Retain its
immutable receipt ref and explain the mismatch and remaining decisions.
