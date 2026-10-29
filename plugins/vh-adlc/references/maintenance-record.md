# Maintenance record template

Use this short artifact for an eligible task. Replace the placeholders. The
Definition is the review baseline: changing it requires renewed eligibility
assessment and an independent review. Evidence and returned records accumulate
without rewriting their history. This is not a feature document.

````markdown
# Maintenance: <requested repair or upkeep>

## Definition

Outcome: <what the owner requested>
Preserved contract: <verified public behavior and source>
Task base: <full starting commit; post-aggregation before authored edits in a bot batch>
Affected paths: <each source/test/config path>
Verification inputs: <source/manifests/locks/config and other inputs used by required checks>
Proposed change: <bounded approach>
Required checks: <commands and pass conditions>

## Evidence

<Observed baseline, failing regression where appropriate, and passing checks.
Include commands and commit targets; distinguish unrun checks.>

## Reviews

### R-1

Target: <full reviewed commit>
Model: <reported id or unknown>
Isolation: <procedural unless enforced otherwise>

```text
<verbatim returned records after the MODEL header>
```

## State

<active, review pending, needs owner, or locally complete, with the actual reason>
````


## External consumer evidence

The default is the single-target record above. A selected consumer batch can keep its repair record
on a separate local primary evidence ref so the dependency squash contains only source/test/lock
changes. This extension uses a paired binding, not a missing-record exemption. Record these inputs:

- source repository/worktree, task base and `source_target`, the full reviewed source commit;
- primary record repository/worktree/ref/path and `record_target`, the full committed Definition;
- selected task/PR/head scope, actual checks against source_target, and any transplant comparison.

Use a fresh `chore/maintenance-evidence-<run-id>-<task-id>` ref/worktree, separate from the batch source.
The Task base is the post-aggregation point immediately before authored changes, so review does not
attribute earlier selected bot patches to the repair. Verification inputs must include related
manifests, locks and configuration affecting those checks. Later related regeneration can stale the
review even when the repaired file is unchanged. Do not rewrite the Definition to omit those inputs.

Before the raw returned review records, store both source_target and record_target and their paths,
actual native model identity and isolation. Preserve the returned records verbatim. Append-only
Evidence/Reviews/State bookkeeping can retain freshness only while the affected source, verification
inputs and Definition match their reviewed objects. Source or Definition changes require renewed
checks/review. A single-target review cannot certify this paired task.

The record stays local unless separately authorized for publication to its exact destination.
Published sweep reports reference it as unpublished plain text until reachability is observed.
Keep evidence refs after source cleanup or a squash; ordinary failed branch deletion is not permission
to force-delete them. Neither record placement nor completed review grants source publication.
