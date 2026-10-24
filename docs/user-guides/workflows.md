[Documentation](../README.md) / Workflows

# Workflows

Invoke vh-adlc explicitly. With the plugin selected, you can describe the work
without choosing an operation:

```text
Use vh-adlc to correct this README.
Use vh-adlc to diagnose this failure; report only.
Use vh-adlc to repair this regression and finish locally.
```

Lifecycle intake inspects the request and repository, then selects a procedure.
It uses the existing eight skills. Check
[compatibility](../reference/compatibility.md) for the lifecycle trials and limits
on your host.

## Choosing the work

| Work | What happens |
| --- | --- |
| A question | Inspect the source and answer. A saved artifact needs a request. |
| Backlog triage | Verify issues against source and observed checks, rank ready work, and save a report. Approve an exact batch before any tracker change. |
| Diagnosis | Investigate and report. A report-only request does not authorize a fix. |
| Documentation | Edit the requested document and check it. A prose edit does not need a feature spec. |
| Small maintenance | Preserve the public contract, keep a short task record, run appropriate checks, and obtain an independent review. |
| A new feature or a wider change | Use a feature document with acceptance, tests, reviews, and binary status gates. |

Changes to public interfaces, permissions, stored data, or release policy use the
feature procedure. Local repository instructions can impose stricter requirements.

## Operations

Choose these from your client's suggestions. Slash syntax differs between clients;
see [installation](../get-started/installation.md).

| Operation | Invocation name | Purpose |
| --- | --- | --- |
| Triage | `vh-adlc-triage` | Sweep a backlog, verify a shortlist, propose closures, or inspect stale/explicit issues; apply only approved exact actions. |
| Investigate | `vh-adlc-investigate` | Measure an issue or failure and report; never fixes. |
| Spec | `vh-adlc-spec` | Write or revise the feature document. Add `review <path>` for an independent spec review. |
| Tasks | `vh-adlc-tasks` | Break accepted scope into one-commit tasks, or replan unfinished tasks. |
| Implement | `vh-adlc-implement` | Claim the feature and work through its tasks, test first. |
| Review | `vh-adlc-review` | Dispatch an independent implementation review of an exact commit. |
| Ship | `vh-adlc-ship` | On an explicit request, push the branch, open or update the PR, and update the issue. Never merges. |
| Resume | `vh-adlc-resume` | Reconstruct the state and continue the next safe step. |

Triage reports stay uncommitted unless requested. Every GitHub change, including comments and
labels, waits for the report and approval of the exact batch. Local plan patches and their commit
are shown separately and retain lifecycle checks. Triage does not implement the selected issues.
Repository settings are optional; see the [settings contract](../../plugins/vh-adlc/references/triage-settings.md).

For a walkthrough, see [your first feature](../get-started/first-feature.md).

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
