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
Task base: <full starting commit>
Affected paths: <each source/test/config path>
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
