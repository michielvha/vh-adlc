# Trusted verification protocol

Executable closure and every published triage verdict require current proof in a confined controller,
plus exact owner approval. This includes factual comments, labels, new issues and local plan/status
patches about implementation, shipped or removed scope, supersession, overlap, open/blocked/ready work,
dependencies, ownership and coverage. An unverified annotation or a purpose label cannot exempt an
assessment. Incomplete required collection or verification blocks every assessment write.

Local reports and proposals remain available across harnesses. Saving or explicitly committing a
local report grants no tracker mutation, remote report publication or push authority. Outside a
confined controller, exact plain-chat approval covers only the structurally attributed task-data and
neutral-vocabulary forms documented in `triage.md`. Unknown prose requires the boundary.

The shared workflow and structured streams name no required model or harness. A host adapter must
protect its analysis tools, runtime and operator input. An unrestricted agent's shell is not an
operator channel. Cached reports, serialized receipts and environment flags cannot create current
execution authority. Administrator control of this runtime is outside the analysis boundary.

## Managed controller

The shipped adapters currently require Linux, Bubblewrap, util-linux `flock`, Bun, Git, the GitHub CLI
and an authenticated Codex or Claude CLI. Check capabilities on the intended host. Missing capabilities
leave closure and assessment writes unavailable; there is no unconfined fallback.

```sh
bun "<plugin>/scripts/triage/controller.ts" capabilities
bun "<plugin>/scripts/triage/controller.ts" start --repo "<checkout>" \
  --host codex --mode ids --ids 12,34 --output-dir "<new directory outside checkout>" \
  --checks "<operator-selected checks.json>" --removals "<operator-selected removals.json>"
```

`--checks` and `--removals` are optional startup selections from the trusted operator. A checks file
maps reviewed names to trusted argv arrays, for example `{"module-test":["bun","test","tests/module.test.ts"]}`.
A removals file is an array of `{path, before_commit}` selections. Never derive executable commands
from issue or comment text. The controller runs those selections serially in primary and adversarial
passes before analysis. Their actual receipts, stdout/stderr and ancestor content are hash-bound in
`verification.json`, which analysis must read completely. Required failures remain controller state
even if analysis omits them from its response.

Each check runs in a disposable shallow checkout of the fixed commit, inside isolated filesystem and
network namespaces. It receives system tools, Bun, its checkout and private temporary directories.
Owner home/configuration, credentials, agent sockets, unrelated host files, ancestor Git blobs and
network egress are unavailable. A missing dependency or isolation facility is an explicit failure.
The original checkout and index stay untouched. Commands cannot import cache receipts as proof.

The controller performs fixed GET-only collection and installs the exact local plugin into a
disposable native profile. The model receives only declared read/list/search/probe tools. Their
read adapter enforces filesystem and network exclusions, while the host adapter checks the actual
native tool inventory/configuration and trace. Unexpected tools, failed probes, incomplete inputs
or a changed payload block execution. Model tools cannot read tracker credentials or operator input.
The native CLI's provider login and provider connection remain in its trusted control plane; the
host-networked CLI itself is not an OS-isolated process.

`--host claude` selects the other adapter. A repository's compatibility entry can add `--command triage`
to retain its declared local model. Other harnesses can use the shared report procedure and implement
an adapter with equivalent observed confinement. Required native host acceptance evidence remains
separate; installing the package or running a unit fixture does not establish it.

## Operator approval

After successful confined analysis, the parent prints its report result and waits for operator JSON
lines on its own input. The analysis client has no handle to that input. `batch` with `params.actions`
returns the exact rendered action payloads and hash. Present the report and those payloads, then send
`execute` with `params.approval`: `batch_hash`, selected `action_ids` and the owner's actual
`owner_statement`. Closing operator input applies no further actions. An approval record cannot waive
proof or grant push, merge, release, credential or issue-implementation authority.

The parent revalidates current source, actor, settings, evidence and issue state before effects. It
serializes effects per hostname/repository under one host user's kernel lock, across batch and output
paths. This does not serialize another machine or unrelated remote actors. Keep the lock inode;
never delete a live lock file to force a retry.

## Managed recovery

Keep the original controller output, batch and journal. Select them explicitly and use a fresh
outside-checkout attempt directory. Supply the exact approval JSON on trusted parent input:

```sh
bun "<plugin>/scripts/triage/controller.ts" resume \
  --run-dir "<original run>/analysis" --batch-hash "<original hash>" \
  --output-dir "<new recovery attempt directory>" < "<approved exact batch.json>"
```

Recovery validates the original fixed input and current installed payload, runs a fresh confined
native trial and requires the fresh verdicts to agree. It then makes fresh actual bounded observations,
re-runs only original operator-selected checks and uses the original exact batch/journal. Archive
files alone grant no execution authority. Prior artifacts are preserved. Completed comments, closures
and creations are never repeated within the unchanged original batch.

Material source, actor or evidence changes stop the old batch. A replacement needs fresh proof,
exact approval and a fresh explanation before closure. Explanation identities bind the source,
actor, settings, report and fixed inventory. The repository's pending-outcome record prevents a
replacement journal from bypassing uncertainty; reconcile the original attempt or leave it blocked.
Owned native process groups have bounded termination and forced cleanup, including descendants
remaining after normal exit. The result records actual timeout, exit and cleanup outcomes.

## Raw report protocol

The lower-level `cli.ts session` is report-only. It can inspect source/issues/removals, run selected
checks, save local reports and construct proposals, but its operator stream cannot execute or resume
tracker actions. Separate descriptors alone do not establish model-tool confinement.

Requests are newline-delimited JSON with `id`, `method` and `params`; responses include that `id`,
`result` or `error`, and the `analysis` or `operator` channel. Analysis methods are `inspect` with
`paths` and `pass`, `inspect-issues` with `numbers` and `pass`, `inspect-removal` with `path`,
`before_commit` and `pass`, `verify` with a selected `check` name and `pass`, `report` with
`observations`, and `batch` with `run_id` and `actions`. Passes are `primary` and `adversarial`.
Index exceptions come only from trusted startup selections. No receipt import, arbitrary argv,
trust flag or execution operation exists on analysis input. A batch remains a proposal.

Actual receipts establish observations, not the semantic conclusion that a request is implemented.
Match source, behavior and reason-specific evidence to each predicate, preserve failures, and keep
primary and adversarial observations distinct. Restarting loses invocation-private proof; disk
records remain attestations. Host integrations must pass their own acceptance tests before claiming
execution support.
