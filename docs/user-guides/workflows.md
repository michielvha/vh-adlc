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
repository and selects a procedure. The package has eleven skills: this entry,
nine engineering operations and one article-writing operation. Check
[compatibility](../reference/compatibility.md) for the lifecycle trials and limits
on your host.

## Choosing the work

| Work | What happens |
| --- | --- |
| A question | Inspect the source and answer. A saved artifact needs a request. |
| Backlog triage | Verify issues against source and observed checks, rank ready work, and save a report. Approve an exact batch before any tracker change. |
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
| Triage | `vh-adlc-triage` | Sweep a backlog, verify a shortlist, propose closures, or inspect stale/explicit issues; apply only approved exact actions. |
| Investigate | `vh-adlc-investigate` | Measure an issue or failure and report; never fixes. |
| Spec | `vh-adlc-spec` | Write or revise the feature document. Add `review <path>` for an independent spec review. |
| Tasks | `vh-adlc-tasks` | Break accepted scope into one-commit tasks, or replan unfinished tasks. |
| Implement | `vh-adlc-implement` | Claim the feature and work through its tasks, test first. |
| Review | `vh-adlc-review` | Dispatch an independent implementation review of an exact commit. |
| Ship | `vh-adlc-ship` | On an explicit request, push the branch, open or update the PR, and update the issue. Never merges. |
| Resume | `vh-adlc-resume` | Reconstruct the state and continue the next safe step. |
| Article | `vh-adlc-blog` | Draft, revise or review articles; `promote` also prepares social Markdown linking to the author's website. |

Triage reports stay uncommitted unless requested. Every GitHub change, including comments and
labels, waits for the report and approval of the exact batch. Local plan patches and their commit
are shown separately and retain lifecycle checks. Every published triage verdict and local assessment
patch also requires current proof in the [confined controller](../../plugins/vh-adlc/references/triage-boundary.md).
Local reports remain available across harnesses. Plain-chat exceptions cover only attributed task data
and neutral vocabulary. Triage does not implement the selected issues.
Repository settings are optional; see the [settings contract](../../plugins/vh-adlc/references/triage-settings.md).

For a walkthrough, see [your first feature](../get-started/first-feature.md).

## Dependency and security maintenance

Ask `Use vh-adlc-maintenance to sweep dependency and security work; report first`.
The operation inventories configured repositories, bot PRs, dashboards and security
surfaces, then checks release notes, affected usage, ownership and available checks.
It saves a dated report and presents proposed work for selection. A scoped request
stays scoped; unavailable alerts and incomplete pages remain visible limitations.
A green bot PR is not by itself compatibility evidence.

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
