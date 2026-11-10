[Documentation](../README.md) / Workflows

# Workflows

Invoke vh-adlc explicitly. With the plugin selected, you can describe the work
without choosing an operation:

```text
Use vh-adlc to correct this README.
Use vh-adlc to diagnose this failure; report only.
Use vh-adlc to repair this regression and finish locally.
```

The generic `vh-adlc` entry reads lifecycle intake, which inspects the request and
repository and selects a procedure. The package has fifteen skills: this entry,
eleven engineering operations, two content operations and one host-cleanup operation. Check
[compatibility](../reference/compatibility.md) for the lifecycle trials and limits
on your host.

## Choosing the work

| Work | What happens |
| --- | --- |
| A question | Inspect the source and answer. A saved artifact needs a request. |
| Backlog triage | Verify issues against source and observed checks, rank ready work, and save a report. Approve an exact batch before any tracker change. |
| Persistent codebase audit | Keep stable findings in a ledger, distinguish historical status from current verification, and select repairs under local policy. |
| Diagnosis | Investigate and report. A report-only request does not authorize a fix. |
| Documentation | Edit the requested document and check it. A prose edit does not need a feature spec. |
| Article or social draft | Read the project's evidence and the site's voice rules, draft or revise the requested prose, and obtain a source-comparing editorial pass. Publication is separate. |
| Small maintenance | Preserve the public contract, keep a short task record, run appropriate checks, and obtain an independent review. |
| A new feature or a wider change | Use a feature document with acceptance, tests, reviews, and binary status gates. |

Changes to public interfaces, permissions, stored data, or release policy use the
feature procedure. Local repository instructions can impose stricter requirements.

## Operations

Choose these from your client's suggestions. Slash syntax differs between clients;
see [installation](../get-started/installation.md).

| Operation | Invocation name | Purpose |
| --- | --- | --- |
| Maintenance | `vh-adlc-maintenance` | Sweep dependency/security work, save a report and resume selected repairs under local project rules. |
| Audit | `vh-adlc-audit` | Inspect recorded findings, reverify them, run a full audit, or repair a selected workstream. |
| Projects | `vh-adlc-projects` | Inventory a configured cross-repository board and apply an explicitly approved issue/field batch; [setup and limits](../../plugins/vh-adlc/references/projects.md). |
| Triage | `vh-adlc-triage` | Sweep a backlog, verify a shortlist, propose closures, or inspect stale/explicit issues; apply only approved exact actions. |
| Investigate | `vh-adlc-investigate` | Measure an issue or failure and report; never fixes. |
| Spec | `vh-adlc-spec` | Write or revise the feature document. Add `review <path>` for an independent spec review. |
| Tasks | `vh-adlc-tasks` | Break accepted scope into one-commit tasks, or replan unfinished tasks. |
| Implement | `vh-adlc-implement` | Claim the feature and work through its tasks, test first. |
| Review | `vh-adlc-review` | Dispatch an independent implementation review of an exact commit. |
| Ship | `vh-adlc-ship` | On an explicit request, push the branch, open or update the PR, and update the issue. Never merges. |
| Resume | `vh-adlc-resume` | Reconstruct the state and continue the next safe step. |
| Documentation impact | `vh-adlc-docs-impact` | Find and review docs affected by selected code changes. |
| Article | `vh-adlc-blog` | Draft, revise or review articles; `promote` also prepares social Markdown linking to the author's website. |
| Clean | `vh-adlc-clean` | Plan and remove what killed runs left in `/tmp` and the project's temp root; Compose projects and kind clusters only on request. |

Triage reports stay uncommitted unless requested. Every GitHub change, including comments and
labels, waits for the report and approval of the exact batch. Local plan patches and their commit
are shown separately and retain lifecycle checks. Every published triage verdict and local assessment
patch also requires current proof in the [confined controller](../../plugins/vh-adlc/references/triage-boundary.md).
Local reports remain available across harnesses. Plain-chat exceptions cover only attributed task data
and neutral vocabulary. Triage does not implement the selected issues.
Repository settings are optional; see the [settings contract](../../plugins/vh-adlc/references/triage-settings.md).

For a walkthrough, see [your first feature](../get-started/first-feature.md).

## Persistent codebase audit

Ask `Use vh-adlc-audit to reverify our persistent finding ledger; report only`, or use `status`,
`full` and `fix <IDs or workstream>` for recorded inventory, wider discovery and selected repairs.
The configured ledger keeps stable finding IDs and dated evidence. Recorded FIXED status is history;
current verification needs the original scenario, current source, observed checks and independent
challenge. Missing or stale evidence remains unknown or partial.

Create `.vh-adlc/audit.yaml` and a project procedure using the
[audit settings and complete example](../../plugins/vh-adlc/references/audit-settings.md).
Keep domain knowledge, finding format, verification commands and operating policy in your repository.
The shared operation requires plugin 0.8.0+, Bun 1.4+ with its Markdown renderer and Git. A missing operation is an installation blocker. Explicit setup must cache the locked verified binary and
every normalized `knowledge_pages` page at the consumer’s pinned revision. Audit entry is offline;
missing binary or pages gets a setup handoff without an automatic download.
A dependency/security sweep still uses maintenance; diagnosis without a persistent ledger still uses
investigation. Ambiguous audit requests need a scope question.

Status writes nothing. Reports and candidates stay private outside the checkout. Reverify/full ledger
updates and local commits require current authority and an owned worktree at the freshly assessed clean
default. Selected compatible repairs need observed red/green and independent batch review. Generic
repair authority covers local work only. Live tests, tracker writes, push/PR and conditional merge require
an explicit current grant or a valid committed consumer policy, plus their actual verification gates.
Receipts are operator attestations; audit does not use triage's enforced publication controller.
See [audit compatibility and outstanding acceptance](../reference/compatibility.md#persistent-codebase-audit).

Audit helpers require Bun 1.4+ with `Bun.markdown.render`, plus Git. An older or renderer-less
runtime reports that prerequisite before the operation starts. Use the same verified Bun version
when generating and reconstructing a candidate; renderer differences are not proof of equivalent
ledger bytes. A changed rendering result requires reconciliation and renewed verification.

## Dependency and security maintenance

Ask `Use vh-adlc-maintenance to sweep dependency and security work; report first`.
The operation inventories configured repositories, bot PRs, dashboards and security
surfaces, then checks release notes, affected usage, ownership and available checks.
It saves a dated report and presents proposed work for selection. A scoped request
stays scoped; unavailable alerts and incomplete pages remain visible limitations.
A green bot PR is not by itself compatibility evidence.

Security accounting retains findings even when there is no bot PR or an update needs another loop.
Every finding needs a verified outcome or a tracked next action before accounting is reconciled.
The report keeps coverage, outstanding remediation, exceptions and delivery separate. A dismissed
alert or an alert missing from the next list is not automatically a verified fix.

Supply scanner results through explicit versioned evidence packets; automatic CI artifact retrieval
is deferred. Keep deadlines, owners, risk decisions and required verification in the consumer policy.
The operation validates packet bytes and recorded evidence, then uses the existing repair loops.
It does not authorize fixes, dismissals or publication merely because accounting is reconciled.

Keep repository topology, bots, sync mappings, exclusions, verification commands
and release/merge rules in the consumer's
[maintenance settings and project procedure](../../plugins/vh-adlc/references/maintenance-settings.md).
The shared operation does not create a generic protection-changing permission.
Existing entries can forward to the installed operation while retaining their
local model and scope arguments. Missing plugin/version support blocks that route.

Report-only commits and pushes need explicit current permission or the documented
committed consumer grant. That grant can cover the initial report and later updates
for the same run. Current read-only/no-push restrictions still apply. Reports use
an isolated candidate ref and the consumer's owning default-branch checkout for
publication; unavailable or conflicting publication stays pending without rebasing
or forcing. Resume by the saved run ID so completed effects are reconciled before
any retry. Unpublished later outcomes stay in private run artifacts.

Selected compatible authored repairs use bounded maintenance and an independent
review of the exact source and Definition. A consumer may keep review evidence
outside a dependency squash, with both commits explicitly bound. Existing authorized
bot-only aggregation keeps its combined-PR/check flow. Major or public-contract
changes use the feature loop. Dependency pushes, merges, releases and live smoke
operations still require their own authority. See the
[canonical procedure](../../plugins/vh-adlc/references/maintenance.md) and
[tested compatibility](../reference/compatibility.md#dependency-and-security-maintenance).

## Stale branches

GitHub's automatic deletion of merged PR branches is the only setting that
guarantees no merged branch stays behind on GitHub. vh-adlc checks it when it
onboards a repository and in every maintenance sweep, and offers to turn it on.
Check one repository yourself:

```bash
bun plugins/vh-adlc/scripts/branches/cli.ts auto-delete --repository OWNER/NAME
```

It exits 1 while the setting is off; add `--enable` to turn it on. GitHub copies no
settings from a template repository, so check new repositories too.

A merged PR branch is removed as part of the merge. When you approve a merge, the
agent runs `after-merge` for that PR. It removes the remote branch, its tracking ref
and the local branch, as long as their tips are inside the merged PR head. That also
covers squash merges, which plain `git branch -d` refuses.

Every maintenance sweep also lists stale branches left by earlier merges and shows
a plan with a digest. Ask `Use vh-adlc-maintenance to sweep and remove stale branches`
to apply that plan in the same run. Open PR branches, protected branches, unmerged work
and branches in use by a worktree are kept, each with its reason. Clean worktrees
are removed only when you ask for worktree cleanup. See the
[branch hygiene guide](../../plugins/vh-adlc/references/branches.md).

## Host cleanup

Ask `Use vh-adlc-clean to free space`. The operation runs `vh-adlc clean --dry-run`,
reports the plan, and applies it when you asked for cleanup or the session is
blocked because `/tmp` is full. Without a request it removes only `/tmp` entries and
the project's temp root. Name `--compose` or `--kind` to also stop and remove an
abandoned Compose project or delete a kind cluster whose runs have all ended.

A project opts in with `.vh-adlc/cleanup.yaml` on its default branch. The binary's
own `go-build*` and `gopls-tempmod*` globs apply in every repository. A project's
build and test entry points can take their temp directory from
`vh-adlc env --sh`, so their files land in a root `clean` owns. The
[CLI reference](../reference/cli.md#host-cleanup) and the
[clean reference](../../plugins/vh-adlc/references/clean.md) give the format and
the report, and [installation](../get-started/installation.md#host-cleanup) the
binary and the allow rules.

## Articles and promotion

Invoke `vh-adlc-blog <brief or article>` for a new draft, revision or editorial
review. Use `vh-adlc-blog promote <project or article>` for an article and social
drafts. Shipping public-facing work may suggest that command; it never runs the
writer automatically. Article authoring does not create a software feature plan.

The shared writer reads the adopter's agent entry point, voice guide and article
schema. Keep personal samples and framework-specific frontmatter in the site
repository. An existing local writer/editor can be replaced with pointers to
this shared operation while retaining its site-specific rules. Each authorized
destination is checked separately when project and website are different repos.

The writer and independent editor preserve supported facts and the author's
positions. Exact-wording requests protect the supplied copy; a factual error is
reported outside it. New material can develop rough notes into prose, while
revisions retain sound existing passages. The handoff groups substantive
exceptions instead of asking the owner to approve every copy repair.

Promotion copy points to the verified canonical article URL. Unpublished or
older article content keeps the bundle pending. Release-day launch copy may be
prepared in advance when requested, with the release dependency recorded outside
the public text. A private preview remains an owner-review link.

Tool availability is reported honestly. The writer uses the host's write-like-me
and humanizer skills where available, otherwise supplied references and the
pinned prose guide. A self-edit is identified when independent dispatch is
unavailable. Prompt checks and package installation do not establish a native
connector run; consult the [compatibility record](../reference/compatibility.md).

The complete procedure is in the [article reference](../../plugins/vh-adlc/references/blog.md).

## Reviews

Reviews use an independent agent context. A host may register the reviewer
directly or dispatch a generic subagent that reads the same reviewer definition.
If neither is available, the review remains pending with a handoff.

Without a named reviewer model, the host's inherited default applies. When the
host cannot attest its identity, the Review Log records `unknown`. If you request
a specific model, the returned identity must match; a substituted or unknown
model does not satisfy that request.

Review isolation is procedural: the reviewer has a shell that can still write.
See the [compatibility details](../reference/compatibility.md).

## Authority and publication

A generic vh-adlc request authorizes the work you requested. Choosing a procedure
does not grant publication permission. Ask separately to push, open a PR, or ship.

Directly invoking `vh-adlc-spec` or `vh-adlc-tasks` retains their authority to
commit and push feature documents to the default branch before the feature has
an owning branch. A directly invoked implementation operation also has its
documented claim-commit authority. Repository instructions still apply.

A committed consumer maintenance grant can authorize its declared report-only
publication, including when a sweep is selected through generic intake. It grants
no dependency delivery permission.

Merging, tagging, releasing, deploying, and destructive operations need separate
approval. See the [authority reference](../../plugins/vh-adlc/references/authority.md)
for the full contracts.

## Engineering conventions

The plugin owns its workflow. It reads engineering conventions from
[vhco-pro/docs](https://github.com/vhco-pro/docs), at the revision pinned in the
repository's `AGENTS.md`, or at the plugin's pin when the repository has none.
Each operation reports the revision it used. The conventions repository is also
usable independently of vh-adlc.

The [lifecycle procedure](../../plugins/vh-adlc/references/lifecycle.md) and
[feature loop](../../plugins/vh-adlc/references/loop.md) contain the agent-facing
execution rules.

## Documentation impact

Ask which docs a patch affects, or invoke `vh-adlc-docs-impact` with the repository
and source/base scope. It reads `covers` metadata directly, then reviews candidate
docs against source and searches for missing references. Report-only requests
make no corrections. Authorized updates make minimal doc edits under local rules.

Adopt integrated implement/ship checking by committing
`Documentation impact roots: ["docs/"]` in root `AGENTS.md`. An absent declaration
keeps manual review; malformed setup or incomplete checking is reported and stops
the applicable task/completion gate. Metadata overlays must be selected separately
from source paths. Ordinary mapping upkeep stays here; standard feature-spec
coverage revisions go through the spec operation. Project generators and visual
checks remain local. See the [procedure](../../plugins/vh-adlc/references/docs-impact.md)
and [complete runnable example](../../plugins/vh-adlc/examples/docs-impact/README.md).
