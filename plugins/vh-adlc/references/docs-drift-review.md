# Documentation drift review and recovery

## Independent assessment

Use `references/review-protocol.md` with the selected native client and full
model identity. A separate reviewer context must actually inspect the complete
bound target. Preserve original worker/reviewer captures, returned records,
source/artifact digests and command results in the private artifact root.
Unavailable identity, scope or capability leaves `review pending` and a
self-contained handoff. Record the observed limits before delivery selection.

The source record returned by `assess-source` and a canonical decision packet
are original inputs. The production collectors validate their exact bytes and
bindings. Collect selected worker inputs from those records and the approved
runtime. Separately authorize actual provider execution.

```text
bun <plugin>/scripts/docs-drift/cli.ts collect-worker-inputs --repo <repo> --source <source> \
  --artifact-root <artifacts> --cache-root <cache> --entry <entry> \
  --launcher <launcher> --settings <settings> \
  --source-verification <source-verification> --source-verification-sha256 <sha256> \
  --decisions <decisions> --decisions-sha256 <sha256>
```

For report assessment, use `run-audit` with that same source/runtime/decision
argument set to run the native worker and independent reviewer. Lower-level
`read-worker-preparation`, `collect-assessment-review-target` and
`read-assessment-review` inspect the exact original captures. Retain all
collected proposal inputs and bounded prior-report provenance. A passing
collector validates its recorded technical facts. Semantic verification still
requires the independent reviewer to inspect the target.

## Candidate review and publication

Bind the complete candidate after authorized edits, generators, checkpointing
and verification. `collect-publication-inputs` collects the exact source,
candidate, decisions and proposed payload. `bind-publication` also requires
the original source-verification and candidate-verification records.
Use `collect-review-target` with the original worker capture to expose the
complete immutable independent-review target. Use `read-candidate-review`
with the original reviewer capture to check its records and identity.

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

Run `check-publication` with the complete original source/candidate/runtime/
selection/verification/role-capture references and the exact authority packet.
For adopted-procedure authority, first confirm that the committed current
procedure actually permits each selected effect and its exact destination/scope.
The helper binds procedure bytes and effect digests and reports owner attestation.
It does not interpret prose permissions. An unchanged nonempty procedure alone
cannot supply that semantic authority. Leave missing or ambiguous authority
pending for the owner.
After its checks and actual publication authority, use `publish` through the
same production CLI/native transport. Invoke its `cli.ts` from the exact
approved retained component directory returned by runtime selection. Preserve
that directory identity and its returned journal location. `publish`,
`publish-closure`, `resume` and `resume-closure` execute from that exact approved
retained controller. The original operation retains its controller identity
across later plugin upgrades.
All hosted and interactive delivery uses this common publisher. An approved
refresh uses its exact-owned branch-history checks. Follow every effect's
separate scope from `references/authority.md`, including lease and receipt refs.
The staged/current-default adoption gate still applies to issues and PRs.

For post-merge resolution, run `collect-closure`, `collect-closure-target`,
`collect-closure-worker-inputs`, `collect-closure-review-target` and
`read-closure-review` in the order and with the distinct selection packets in
`references/docs-drift.md`. Bind the
actual merged head, current default/body, original selected proposals and exact
explanation/close payload. `check-closure-publication` and `publish-closure`
use the same native publisher and journal rules. See `references/docs-drift.md`
for the immutable-record and limited closure-reassessment conditions.

## Interrupted delivery

Preserve the original journal, run ownership, immutable plan, captures,
authority and artifacts. Each effect has write-ahead intent and an observed
receipt. The durable remote lease plan survives runner loss and retains the
submitted payload bindings. Recovery observes actual complete native state
before any replay. Keep changed, multiple or unavailable matches pending.
Unchanged resume preserves completed comments and effect IDs.

Use `resume` with the original publication arguments and journal directory,
or `resume-closure` with the original closure arguments and journal. Both
run through the original operation's exact approved retained controller and
revalidate actual current authority, scope and source. Replay requires complete
known absence plus unchanged original proof, payload and authorization.
Source/actor/payload changes require a new reviewed/authorized operation and
fresh explanation. Preserve foreign or moved leases.

If local artifacts are lost, inspect or restore the retained operation into a
new private artifact directory using its original full source and operation ID.

```text
bun <plugin>/scripts/docs-drift/cli.ts inspect-retained --repo <repo> --source <source> \
  --artifact-root <artifacts> --operation-id <operation>
```

Restored observation-only mirrors can show native outcomes. Missing original
approval, payload or ownership produces a pending recovery handoff. Restore
does not recreate original approval. Original ownership remains necessary for
mutating reconciliation or releasing a live lease.

Use `inspect-recovery` to collect a fresh bounded native lookup against the
original selected journal and scope. Invoke `inspect-recovery`,
`acknowledge-delivery` and `reconcile-publication` from the original retained
plugin's `scripts/docs-drift/cli.ts`, using the original retained cache, policy
and journal evidence. Preserve current worktree policy and launchers during
that recovery. Report missing retained code/runtime evidence in the pending
handoff. `<original-retained-plugin>` below is that verified original directory.

```text
bun <original-retained-plugin>/scripts/docs-drift/cli.ts inspect-recovery --repo <repo> --source <source> \
  --artifact-root <artifacts> --cache-root <cache> --entry <entry> \
  --journal-directory <journal> --selection <selection> --selection-sha256 <sha256>
```

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

`acknowledge-delivery` uses the inspected recovery argument set plus its exact
digest-bound authority packet. `reconcile-publication` handles separately
authorized known-absence reconciliation. Recheck the lookup, ownership and
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
