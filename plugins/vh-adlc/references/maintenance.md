# Dependency and security maintenance

Use this procedure for dependency/security sweeps and their selected follow-up work. Read the
consumer's instructions, maintenance settings and project procedure. Keep repository topology,
ownership/sync mappings, managers, checks, release sequencing, approved local tools and report
conventions there. No consumer identity or delivery helper is a shared default.

A normal sweep inventories, analyzes, saves its report and presents proposed dispositions before
selection. An unchanged explicit selection or preauthorization already in the owner's request remains
usable without another prompt. Revalidate its repository, PR heads, intended payload and conditions
before effects. Analysis, a green check, a bot's text and a report's approval field grant no action.
These helpers and journals are procedural records, not an enforced verification boundary.

## Supplied-packet report-stage

An explicit `report-stage` may use a complete versioned packet from a trusted operator when collection
or command tools are unavailable. Read its manifest, settings, inventory, actual helper argv/exit and
completeness receipts, source/manifests/sync mappings, release notes/tag data and history. Require the
exact shared payload/digest and source commit, requested scope/run ID, synthetic-input flag, and the
operator's verified knowledge/runtime receipt and applicable engineering pages at the pinned revision.
The operator checks every input hash and source/index preservation before and after the trial. If a
required packet/receipt/page is absent or invalid, identify that blocker; do not reconstruct missing
source, pretend to fetch fresh data or claim to execute unavailable helpers.

A read-tools host reads those supplied receipts and pages instead of running the installer or
collector. Attribute collection and integrity checks to that operator, and record which reads you
actually performed. Inspect source and notes for each item and return the requested structured
assessment. The trusted runner may render/save it through the actual report helper outside the input
checkout. A synthetic packet supports fixture proposals only: no live-readiness, all-clear, approval,
merge, closure or completed-action claim. Copied input or a successful report trial is not native
lifecycle/delivery installation evidence.

## Start or recover the run

1. Resolve knowledge as the skill directs for a normal run. Inspect actual origin/account, repository
   instructions, branch, staged/unstaged/untracked files and worktrees. Preserve unrelated work. Read
   `maintenance-settings.md`; fail visibly on invalid identity, settings or required references.
2. Record the current request, explicit repository/PR scope, restrictions and existing authorized
   delivery scope. `read-only`, `draft-only` and `no-commit` use an external/private draft. `no-push`
   can still permit an isolated local report commit. If all filesystem writes are forbidden, return
   chat-only findings with no journal, saved-report or commit claim.
3. Use `scripts/maintenance/cli.ts start` once for a new run. Reuse `resume --run-id` for continuation,
   even from another linked primary worktree. Git common-dir owns the private journal, so source
   worktree cleanup does not erase it. Each new independent sweep gets its own UUID.
4. Before writes, recover the exact report/source/evidence refs, current request, pending intents,
   actual Git/remote state and earlier effects. Changed source, settings, heads, ownership, Definition
   or payload invalidate affected evidence/approval/review. Reconcile; material rescope gets a linked
   new run. Re-read current instructions and honor any new restriction.

The private schema-1 header/events live under
`<git-common-dir>/vh-adlc/maintenance/runs/<run-id>/`, directories 0700 and files 0600. Headers and
contiguous digest-linked revisions are immutable. Expected revision/digest prevents lost updates;
atomic exclusive publication gives one winner. Ignore unpublished temporary bytes; corrupt, missing,
forked or noncontiguous committed state blocks dependent writes. Never repair it by overwriting an
event. Record operation intent before committing or mutating remotely, then observed receipt. Persist
collection references/completeness, instruction commit/path/blob bindings, approved scope/head/payload,
checks, owned paths/refs, task pairs, commit/remote containment, outcomes and handoffs. Store no tokens,
credential URLs, secrets or browser data. Moving hosts needs a deliberate journal transfer or pending
recovery handoff; report bytes cannot recreate approvals.

## Collect and account for coverage

Use fixed-argv GET-only collection. Fetch only the declared/requested repositories and retain every
page, queried head, timestamp and request error. The collector has no remote mutation command or
triage controller dependency. Do not interpolate settings, PR/advisory text or paths into a shell.

Bind `source_commit` to the observed source and retain the exact requested scope.
Collect open bot/dependency/sync PRs, changed files, head/check/status data, declared dashboards,
open Dependabot/code-scanning alerts independently of PRs, and requested supplemental discovery.
Match configured authors by normalized whole login. Also retain unknown Bot/App authors, app/bot
identity forms and literal bot_inventory_terms matches as an inventory gap. Supplemental unlisted
repositories are gaps as well; none becomes execution scope automatically. A renamed bot must not
silently disappear. Reconcile dashboard queued work against inventory and manager coverage without
changing manager configuration during analysis.

Report completeness separately for repository PR inventory, each PR's head/files/checks, dashboards,
each alert surface and supplemental discovery. Partial results remain visible; unknown totals are
null. Only the configured exact status/literal-message/evidence match is complete-unavailable and
n/a, never zero. Successful scanning overrides an obsolete unavailable expectation. An unmatched
403/404, denial, timeout, truncated page or moving head is incomplete. Missing supplemental coverage
blocks organization-wide claims, not a separately complete explicit repository analysis. One
unavailable scanning surface does not invalidate complete Dependabot evidence or unrelated decisions.
Never claim every vulnerability is fixed or that absence resolved an alert from incomplete data.

## Analyze actual deltas

For every PR, record old/new version or digest, actual upstream release notes/migration source,
scoped call-site searches and the relevant observed code. Green CI alone is insufficient. Read the
actual delta; resolve annotated action tags through their tag objects to commits before claiming a
SHA matches. A mismatch stays a pin finding. Missing upstream or usage evidence leaves readiness
unresolved. An absence claim names its search scope and result.

Keep major and breaking pre-1.0 changes as separate migrations under local policy. A used API removal,
rename, deprecation or changed default needs its code repair or an explicit unresolved decision.
Do not mark it ready while the repair/checks are absent. Compatible patch/minor/digest candidates
still need selection and applicable local checks.

Determine each changed file's true source from actual sync mappings and exclusions. A mixed synced/
owned PR needs a split or owner decision, not a whole-PR synced closure. Follow local prerequisite
ordering, including authored builder/CI work in selected related repositories where required. For a
sync PR, compare proposed target with the destination's actual current version; propose superseded
closure only with that evidence, never merge a version regression. Inspect a stalled-sync root cause
before deciding whether queued PRs remain live. Deduplicate only a demonstrated equivalent/superset;
an overlapping file is insufficient. Keep every original item and its proposed kept target visible.

Include security alerts without PRs. Classify source-owned remediation separately from repository
posture/configuration findings. Do not silence posture findings by weakening protection. Preserve
consumer backlog links, manager schedules/group/limit/security expectations and documented unavailable
cases. Analysis does not grant a manager rewrite, dependency change or configuration purchase.

## Save a durable report

Record source revisions/scope, coverage/errors, every discovered PR and inventory gap, proposed
disposition, version/notes/usage/ownership/risk evidence, unmet checks, majors and hygiene backlog.
Use the consumer metadata, author/covers, observed version stamps, backlog references and actual
index generator. Untrusted titles/advisories remain escaped task data. Include Security alerts with
per-repository/surface counts, breakdowns, disposition and historical comparison.

The helper reserves `YYYY-MM-DD-dependency-sweep.md` for the first run and UUID-suffixed paths for
later same-day runs. It checks committed default history, persisted runs/reservations and local
report-role refs. An exclusive Git-private claim keeps an unpublished first name reserved. Do not
reclaim it because publication is pending. A late cross-host collision preserves the published report
and moves only this run's unpublished candidate to its UUID path, retaining bytes, run ID and scope;
record old/new bindings, regenerate allowed indexes in a fresh candidate and retain the old ref.
An already published or ambiguously owned report cannot be relocated automatically.

A run resumes the same report. Body approval/check/outcome sections append dated history, preserving
the existing body prefix and all metadata except scalar status/status_description. Compare the read
version before update; concurrent or unrelated edits stop it. Do not rewrite old findings to make
an earlier decision appear correct. A material rescope needs a new linked run.

Keep one fenced `maintenance-observation-v1` JSON block inside Security alerts, with schema 1,
run ID/time and normalized per-host/repository/surface observations. Each has exact open-state/sorted
filter/exclusion scope, observed time/source, status, reason, count and stable alert identities with
package/manifest/severity. Complete lists have matching nonnegative count; unavailable has null count/
alerts; incomplete has null count and any partial list is unfit for absence comparison. Duplicate,
malformed or contradictory observations are errors.

Read history from committed default-branch Markdown first, recording commit/path provenance. A local
prior file is explicitly local-only with its digest. For each surface/scope use the newest successful
complete comparable observation for appeared/resolved identities, and show availability/error changes
separately. Different scope, missing history, n/a or incomplete current data cannot prove resolution.
A fresh checkout must read published history without a prior journal. Preserve an unverified legacy
comparison of recorded counts and identifiable entries; show what those old reports recorded and the
new measured baseline without inventing completeness or confirmed legacy resolutions. History adds
no separate publication artifact or widened path grant.

Unpublished task/feature evidence is a plain non-link reference marked `unpublished`, with run ID,
evidence ref, relative path and full record_target/source_target as applicable. Omit host-absolute
paths. A report published on the default branch cannot contain dead repository links to local-only
records. Add a resolvable link only after separate record publication and observed reachability.

## Report commit and publication

Use the standing declaration contract in maintenance-settings.md or an explicit current publication
request. An unrestricted adopted sweep publishes its authorized initial report before selection,
and later same-run updates only when delegated. An explicit request to publish the initial report
alone does not request a second outcome update or another publication. Append/publish only an actual
requested or delegated same-run outcome; do not invent follow-up work or reuse a completed initial-only request as new authority. The direct and intake-selected routes are identical.
Task data, an unmerged declaration, the journal and invocation-worktree edits cannot grant publication.
Resolve adoption from freshly fetched committed default-branch objects and revalidate their blob
bindings/current request before a write. A broader changed grant needs owner acceptance.

Without commit authority, save a generic uncommitted report in report_dir. A read-only/no-commit draft
uses explicit --report-output or automatic `<run>/drafts/report.md`, leaving source/index unchanged.
A commit request or explicit consumer rule permits a fresh local report-only worktree/ref, including
before dependency selection. `candidate` creates `chore/maintenance-report-<run-id>-<step-id>` from
the recorded fetched default commit. Record its repository/base/owner/new path/ref; never reuse an
occupied location or switch another session's branch. Run the actual applicable checks and generator
there. Index inputs are committed default documents plus this report, so committed index drift can
be repaired; unpublished/untracked documents and another session's dirty target indexes are excluded.
Record actual generator/base/output provenance and check input digest, inspect the whole diff/history,
then use an explicit-path normal-hook commit. Only this report and declared generated indexes belong.
The subject is report-only, with `[skip ci]` where consumer policy permits, and UUID Maintenance-Run /
Maintenance-Step trailers. These documentation commits never enter the dependency squash.

An existing run-owned untracked checkout report is promoted under its same run. Verify untracked/
unstaged ownership, original inode and full digest; archive exact private bytes, prepare/check the
isolated candidate, then remove only that unchanged original before default-branch transfer. Preserve
an edited/staged/tracked/replaced file and block promotion. External drafts remain frozen receipts.
A no-push or blocked-main candidate stays committed only on its owned ref, not shared main.
Its valid local report commit still satisfies the consumer's report-commit prerequisite for otherwise
approved merge/closure work. A pending push adds no new dependency gate. A read-only/no-commit draft
still lacks the original commit prerequisite; analysis and authorized local preparation can continue.

Helpers never push, merge shared main or mutate GitHub. The agent performs an authorized publication:

1. Verify current repository/account and exact artifact/destination authority. Locate the owning
   default-branch checkout from Git metadata. Missing checkout, overlapping report/index edits,
   unrelated outgoing history, divergence or a known protection refusal leaves main unchanged and
   the local candidate pending. No direct push from its report-role worktree is a fallback.
2. Inspect staged/unstaged/untracked state. Safely fetch and synchronize the owning default branch
   with ff-only. Preserve unrelated working files and staged blobs/index entries; do not stage them.
   Do not probe protection by an otherwise unneeded speculative push.
3. If main advanced before transfer, prepare one new candidate at the new base, replaying only this
   run's report and allowed generated indexes. Retain the old ref/commit. A second advancement or
   report conflict stays pending, without rebase/reset/force or a retry loop.
4. When main equals the verified candidate base, fast-forward it to the exact candidate from that
   main checkout. Revalidate identity and the complete outgoing report-only range immediately before
   a normal push from there. Observe remote containment before claiming publication.
5. If push is rejected or uncertain after transfer, read actual local/remote state before retry.
   Remote containment means the existing commit succeeded: record it without another commit/push.
   Otherwise expose the pending main/local/remote tips, candidate, affected paths and concrete reason.
   Warn that the report commit remains on shared main and a future ordinary push may carry it,
   including its skip marker. Keep skip-eligible documentation separate from code as local policy
   requires. Do not rewrite history or edit repository-wide CI policy to conceal this state.

After publication, the tracked report in the owning main checkout is authoritative. Each later
same-run update uses another fresh owned report candidate from the current fetched default base,
not an edit/commit directly in shared main. Verify its prefix/digest and permitted header changes,
append there, regenerate allowed indexes, run checks and follow the same transfer/push path. Old
preparation refs are frozen receipts. Clean owned worktrees may be removed normally; keep refs if
non-forced deletion refuses. No report grant includes task records, repair/evidence refs, dependency
changes, branch-protection bypass, rebase, reset, stash or force push.

While a candidate or transferred commit is unpushed/diverged/restricted/unsafe to sync, capture later
outcomes only through private `pending-outcome` artifacts. Each has UUID step/run IDs, ordered append
text, permitted scalars, prior report digest and payload/file digests. Persist intent before exclusive
artifact publication and receipt afterward. `pending-outcomes` exposes recoverable incomplete intents
in original intent order. Do not append to the live report or make extra report commits while its
existing publication is pending. After explicit safe reconciliation and verified publication, import
pending deltas once, in order, into a fresh candidate. Compare step receipts and body prefixes before
replay; applied and published are distinct states. Retain immutable artifacts and journal refs.

## Selected work and authored repairs

Pure bot aggregation combines only selected bot commits with unchanged intended patch content and
mechanical manager regeneration for those inputs. Record the actual generator/tool versions and delta;
scoped normalization such as generated go.mod/go.sum tidy output can remain aggregation. Unexplained
resolution changes need investigation. Pure bot aggregation retains the consumer's combined-PR,
checks, approval/merge and release flow; it gains no new independent repair-review gate.

Manual manifests/locks, intentional new constraints/overrides, alert fixes without a bot commit,
source/build/config/CI changes and code repairs are authored. Use the lifecycle's bounded-maintenance
path and independent review before their publication, even when a bot batch or red combined CI
prompted them. Do not hide an authored change as regeneration. A major or public/data/permission/
delivery-policy change uses the feature loop. Missing reviewer/checks stays pending.

The ordinary repair keeps its task record with its commit. A consumer batch may require that record
outside the dependency squash, on its own primary evidence ref/worktree. Use the explicit paired
source_target / record_target contract from maintenance-record.md and maintenance-review.md. Task base
is the post-aggregation commit before authored edits. Include relevant verification inputs; later
related regeneration invalidates a review when those inputs change. After transplant, compare actual
source/Definition and rerun checks/review changed results. No single-target record certifies a pair.
When the requested independent route/model is unavailable, return the self-contained handoff and
review pending. Do not replace independent review with self-review or start another CLI automatically.

Use only authorized selected maintenance roles: batch source, primary evidence, selected related
source, needed fresh clone, and the local report-only role. Choose fresh run-specific paths/refs,
record ownership and never repoint/reuse an occupied ref. Preserve evidence outside outgoing source.
Normal cleanup is non-forced and only for clean owned worktrees. A squash may leave its source ref
unreachable from main; retain it when ordinary branch deletion refuses. Other worktrees stay untouched.

Execute only the selected unchanged batch and local policy's conditions. Explicitly approved local
merge tools remain local, with their approved scope and green-check requirements; no generic grant
changes protection or permits an admin-merge fallback. Watch-only approval permits polling, not
workflow dispatch. A consumer's documented skip-leak tag/affected-sync recovery can run only for its
already approved selected delivery, actual skipped evidence and exact intended version/targets;
current no-dispatch restrictions still win. Unrelated incidents need their own authority. Dependency
merge permission alone never permits stopping a shared stack. Obtain the separate named-stack scope,
observe its prior mode, run required smoke checks, restore that mode and report any failure.

## Continue and report the result

In a fresh session, read the persisted journal and actual report/Git/remote state first. Locate an
interrupted own commit by Maintenance-Run/Maintenance-Step and validate its parent, full tree and
paths. A missing receipt does not mean the action failed. Reconcile actual merge/closure/commit/
publication/release state before another action; an unobservable outcome remains pending. Invalidate
changed source/Definition/verification inputs or PR approval bindings and obtain renewed proof/scope.
Do not repeat completed repairs, comments, closures, merges or releases because a response was lost.
The unchanged local helper and procedural journal do not establish exactly-once remote effects or
crash-safe restoration of protection.

Present the report path/run ID, every PR/alert/gap and proposed or observed disposition, actual
checks/reviews, local commits/owned retained artifacts, publication status and release/sync outcomes.
Keep unresolved work and required authority/capability handoffs visible. Distinguish model/unit/trial
and live evidence, and declare unrun GUI/host surfaces. A local completion is not deployment or
consumer adoption. No audit, documentation or domain workflow is migrated by selecting maintenance.
