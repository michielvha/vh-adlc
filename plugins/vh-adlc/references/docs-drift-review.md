# Documentation drift review and recovery

## Independent assessment

Use `references/review-protocol.md` with the selected native client and full
model identity. A separate reviewer context must actually inspect the complete
bound target. Preserve original worker/reviewer captures, returned records,
source/artifact digests and command results in the private artifact root.
Unavailable identity, scope or capability leaves `review pending` and a
self-contained handoff. Record the observed limits before delivery selection.

`scan` retains source verification and `report` retains the configured native
worker assessment and independent reviewer. The run owns their original
captures, decision packet, proposal inputs and bounded report-history evidence.
The helper validates their exact bytes and bindings. The reviewer must inspect
the complete target and current source.

## Candidate review and publication

After authorized preparation and checkpointing, `verify` collects the complete
candidate, source assessment, decisions and proposed effects. It launches the
independent reviewer against that exact immutable target and retains the native
reply separately from the candidate.

Review the complete committed assessment, selected changes, protected-document
handling, feedback, generators/checks, finding-class changes, source/read-set
freshness and exact issue/PR payload, including correlation markers. Include
the immutable resolve record in resolve candidate review. Preserve the actual
returned review result outside the candidate/payload. Later changes require
fresh bindings and review before publication.

Issue publication needs an independently reviewed exact repository/title/body/
labels payload and relevant committed published evidence permalink. Keep the
issue short and put the full analysis in that linked document. An existing
published current evidence document can support an issue-only run. Without it,
retain the report draft and authorized-publication handoff until the document
is observed published. Local private artifact links cannot supply that permalink.

Present the exact retained manifest and its digest to the owner. Save the
actual approval in the run's owner-only `approval.yaml`, using the displayed
digest and the exact owner request.

```yaml
manifest_sha256: <displayed-manifest-sha256>
request: <actual owner approval of this exact displayed batch>
```

A selected standing grant uses `procedure: <committed-project-procedure-path>`
in place of `request`. First verify that the committed current procedure
permits every selected effect and exact destination. The helper binds the
procedure bytes and effect digests as owner attestations. The harness must
resolve the permission's actual scope. Missing or ambiguous authority stays
pending for the owner.

```text
bun <plugin>/scripts/docs-drift/cli.ts publish --repo <repo> --run-dir <run>
```

Execute from the exact original installed component. The run retains that
controller identity, source policy, native roles and approval across later
upgrades. Reopen the matching installed release for an original operation
when the current payload differs.

All hosted and interactive delivery uses this common publisher. An approved
refresh uses its exact-owned branch-history checks. Follow every effect's
separate scope from `references/authority.md`, including lease and receipt refs.
The staged/current-default adoption gate still applies to issues and PRs.

For post-merge closure, use `close` as described in the main procedure. Its
first pass binds the merged head, current default/body, original proposals and
exact explanation/closure payloads to fresh worker and reviewer captures.
Approve that displayed manifest before repeating `close`. The same publisher
and journal gates apply to closure. The immutable record and bounded
closure-only reassessment conditions remain in the main procedure.

## Interrupted delivery

Preserve the original journal, run ownership, immutable plan, captures,
authority and artifacts. Each effect has write-ahead intent and an observed
receipt. The durable remote lease plan survives runner loss and retains the
submitted payload bindings. Recovery observes actual complete native state
before any replay. Keep changed, multiple or unavailable matches pending.
Unchanged resume preserves completed comments and effect IDs.

```text
bun <plugin>/scripts/docs-drift/cli.ts resume --repo <repo> --run-dir <run> --action inspect
bun <plugin>/scripts/docs-drift/cli.ts resume --repo <repo> --run-dir <run> --action continue
```

Version-two controller records also bind the original repository, launcher,
settings and run-cache paths. Keep those recorded paths available for a pending
operation. Their binding remains part of the original controller record while
runtime selection uses the ordinary installed component.

Continue through the original run directory and host ownership. Every new effect
requires fresh current authority, source, native identity and exact payload.
Replay requires known absence and unchanged original proof. Completed comments
retain their original effect IDs. Material source, actor or payload changes
require a fresh reviewed and approved operation, including a fresh explanation.

If the original artifacts or host ownership are lost, restore observations into
a fresh external run directory with the original full source and operation ID.

```text
bun <plugin>/scripts/docs-drift/cli.ts resume --repo <repo> --source <original-source> \
  --run-dir <restored-run> --action restore --operation-id <operation>
```

For a version-two native trial, confirm its original committed definition when
restoring observations through the run-directory interface.

```text
bun <plugin>/scripts/docs-drift/cli.ts resume --repo <repo> --source <original-source> \
  --run-dir <new-private-external-directory> --action restore \
  --operation-id <original-operation> --trial-definition-sha256 <definition-sha256>
```

The definition selects its original isolated namespace. Its recorded workflow,
event, head, run, attempt and publisher remain bound to the original plan.
Restoration grants observation-only ownership. The bounded `observed_refs`
summary supplies ref names and object IDs for the separately approved
administrative Git handoff. Original records with insufficient launch evidence
remain inspectable and return an execution handoff.

Restored mirrors retain observation-only ownership. Preserve unresolved effects
as pending. Original-run recovery requires its surviving application,
settlement and ownership evidence.

The trusted harness uses `inspectRecovery` to present the fresh native lookup,
exact selection and acknowledgement/reconciliation scopes. After the owner's
actual scoped decision it retains `recovery_selection` and `approval` artifacts
through the existing run artifact writer and appends their pending run stage.
Use `resume --action acknowledge` or `resume --action reconcile` on that
original run. Those actions recheck the original selection and authority before
execution. Keep source policy, launchers and other writers' work intact.
The selected recovery purpose and current lookup remain separate from the
ordinary publication approval. The controller and run APIs define those retained
records. [Recovery controller](../scripts/docs-drift/recovery-controller.ts),
[run artifacts](../scripts/docs-drift/run-directory.ts).

## Lost hosted origin and administrative abandonment

For an unresolved operation whose original hosted runner and ownership are
lost, preserve the ordinary inspect/restore output as
`abandonment-inspection.json`. Retain the exact current owner approval beside
it in `approval.txt`. Name the repository, operation, selected lease/receipt
refs and each observed object ID. Record unknown native outcomes as unknown.

The owner-approved administrator can use ordinary Git compare-and-swap against
only those exact ref/object pairs. Reobserve changed refs and obtain new exact
approval. Lease-only cleanup can leave an unresolved receipt, so the next
scheduled worker must keep its pending report until that evidence is resolved
or separately abandoned. Completed and otherwise terminal receipts retain their
refs indefinitely.

Administrative abandonment supplies no delivery or settlement proof and adds
no terminal event to an observation-only journal. After the exact approved refs
are removed, the next job must collect current source and proposal state and
obtain fresh review and approval. Keep the inspection, approval and original
evidence available for the operator's reconciliation.

## Delivery acknowledgement

Acknowledgement applies only when native evidence proves the entire approved
eligible effect applied and its payload subsequently changed. Eligible effects
are PR/issue/comment creation, PR update and PR closure. Pushes, branch refresh,
lease effects and receipt retention keep their existing exact-state rules.
Prove the original actor, target, head/branch, attempt/request and every required
component, including labels and draft state. A partly applied operation remains
pending. Current snapshots, old markers or a successful process exit alone
cannot establish original terminal application.

Retain integrity-bound bounded success projections and their journal links.
Raw bodies stay excluded from those success records. Older attempts need
adequate independently retrievable native evidence or remain pending. Native
production accepts native proof. Labelled collector proof applies only inside
the guarded synthetic trial. Preserve both the evidence and its transport scope.

Present the owner the exact lookup/evidence digests, original run/plan/payload,
effect/resource IDs, current field differences, exact lease ref/object,
request-settlement proof and proposed acknowledgement/release effects.
Require the owner's actual current approval of that complete immutable scope.
Standing adopted procedures, unattended execution, publication/closure grants
and general cleanup permission cannot supply this acknowledgement approval.
Changed observations need a new lookup and approval.

The original executor must be quiescent and every mutation request accounted
for by native non-dispatch, definitive rejection or terminal application
evidence linked to its actual run/effect/attempt/command. Process reaping,
elapsed time and workflow cancellation alone cannot settle a server request.
The original verified journal/run ownership and current actor/repository
binding must still hold. An inferred same-plan lease in a restored mirror
supplies observations only.

`resume --action acknowledge` uses the inspected selection and its exact
digest-bound current-owner authority. `resume --action reconcile` handles
separately authorized known-absence reconciliation. Recheck the lookup, ownership and
evidence before acknowledgement and again before exact-owned atomic lease
release. Account for every remaining effect first. Preserve release intent,
lost-response recovery and the immutable retained receipt ref.

Acknowledgement permanently stops business replay for the original operation,
including after a later payload restoration. Report the acknowledged mismatch,
settlement/ownership evidence, remaining decisions and observed lease result.
The operation remains non-successful. It supplies no corrected-documentation,
resolved-hunk, original-proposal closure or carried-delivery proof. Later work
needs its own current reviewed/authorized operation. Keep reports within their
separately authorized local or hosted destinations.
