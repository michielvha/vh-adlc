# Trusted verification protocol

Closure execution requires a trusted controller invocation. The analysis client may use any
harness. The protocol is newline-delimited JSON over streams; it names no model, app or tool brand.
The controller owns the fixed repository, collected inventory, approved check list and output
location. It must protect this process, its installed code and its operator input from analysis.
An unrestricted agent's shell is not an operator channel. A host that cannot provide this separation
can still analyse and save reports, but must report closure execution as unavailable.

This helper enforces proof origin and channel separation inside its invocation. It does not confine
a model's other tools or protect against an administrator modifying its runtime. A host adapter
must enforce that confinement separately. The native acceptance driver does so with a restricted
tool set and an isolated read adapter; that trial result is not a certification of every host.

## Managed controller

On Linux with Bubblewrap, `flock` (util-linux) and an authenticated supported CLI, start the shipped controller outside
analysis. It creates a private working directory outside the selected checkout, performs fixed
GET-only collection, installs the exact local plugin payload in a disposable client profile, and
starts a restricted analysis client. Its only analysis tools are the declared read adapter. The
client receives no operator input, GitHub credential, shell or direct GitHub path. Unexpected tools,
failed probes, incomplete input or changed payload block execution.

```sh
bun "<plugin>/scripts/triage/controller.ts" capabilities
bun "<plugin>/scripts/triage/controller.ts" start --repo "<checkout>" \
  --host codex --mode ids --ids 12,34 --output-dir "<new directory outside checkout>"
```

`--host claude` uses the other shipped adapter. A repository's Claude compatibility entry can add
`--command triage`; its declared model is retained. Other harnesses use the shared procedure and
protocol; no Claude model or tool is required by the core operation. Host integrations beyond the
observed CLI adapters remain unverified. Missing capabilities never fall back to unconfined closure.

After analysis, the parent prints the report result and waits for operator JSON lines. `batch` with
`params.actions` returns the exact proposed batch. Only a subsequent `execute` with the exact approval
can apply it. These lines belong to the trusted operator, not the analysis client. Closing operator
input exits without applying unapproved actions. `resume` retains the original journal and requires
fresh observed proof. The lower-level protocol below is for trusted host adapters, not a substitute
for establishing confinement.

## Start outside analysis

The trusted controller runs:

```sh
bun "<plugin>/scripts/triage/cli.ts" session --repo "<checkout>" \
  --inventory "<run>/inventory.json" --checks "<run>/checks.json" \
  --output-dir "<run>/reports" --control-fd 3
```

Descriptor 3 is an independently inherited operator stream. Never give its handle, process access
or write access to the analysis client. Use operator-selected `--index-requests 12,34` only for the current owner’s explicit request.
Descriptors aliased to analysis stdin are rejected. With no operator descriptor, the session is read-only on
GitHub. Both channels return JSON responses on stdout, distinguished by `channel`; the controller
routes them to the proper client. The controller closes both inputs to finish the invocation.
Restarting loses live verification authority. Receipts on disk never revive it.

`checks.json` maps operator-selected names to trusted argv arrays, for example
`{"module-test":["bun","test","tests/module.test.ts"]}`. Select checks from reviewed repository
instructions before analysis. The client supplies a check name, never executable argv. Verification
runs in the existing disposable fixed-commit checkout and cleans its owned processes. Never select
commands from issue text. The controller retains GitHub credentials and local lifecycle adapters;
analysis receives neither credentials nor a write tool.

## Analysis stream

Each request has `id`, `method` and `params`. Responses contain that `id`, either `result` or an
`error`, and `channel: "analysis"`.

| Method | Parameters | Result |
| --- | --- | --- |
| `inspect` | `paths`, `pass` | Actual fixed-source content and a source-inspection receipt. |
| `inspect-issues` | `numbers`, `pass` | Actual selected records from the fixed inventory and their hashes/receipt. A duplicate comparison includes both issue IDs. |
| `inspect-removal` | `path`, `before_commit`, `pass` | Observed ancestor content and absence at the current source commit. |
| `verify` | `check`, `pass` | Actual result of the operator-selected check. |
| `report` | `observations` | Saved report with its run ID. Index requests are fixed by the operator’s startup options, never supplied through analysis input. |
| `batch` | `run_id`, `actions` | Exact proposed batch from a report owned by this session. |

`pass` is `primary` or `adversarial`. Include the returned receipts in the matching evidence.
Completed work requires observed source/behavior; duplicates require issue inspection in both
passes; supersession requires replacement reads; removal requires ancestor/current-tree inspection.
A changed prose description cannot substitute for the adversarial observation. Required failures
remain failures, never contextual leads. The report still requires semantic verification that the
observations meet the issue; a successful command alone cannot decide that.

There is no receipt import, trust flag, arbitrary command or execute method on analysis input.
A batch is a proposal, not approval. No requested artifact path can write outside the controller's
chosen report directory. Existing repository report placement/index rules still apply when the
controller chooses the normal destination.

## Operator stream

After presenting the exact report and batch to the owner, the controller may send `method: "execute"`
with `params.approval` containing the exact `batch_hash`, selected `action_ids` and `owner_statement`.
A new execution uses a batch owned by this invocation. For an interrupted prior invocation, the
operator may use `method: "resume"` with `params.batch` and its exact `params.approval`. Resume
requires the original journal under the chosen output directory and freshly observed verification
in this invocation; old cached receipts alone fail. It never creates a new journal to guess the
outcome of an interrupted batch. The existing actor/source/payload checks,
protected-work exclusions, lifecycle gates and retry journal still apply. The packaged controller
uses the same verified gate adapter as ordinary execution; no supplied gate means gated local patches
remain blocked. GitHub writes and local patches still require their separate exact approval.

This protocol supplies no push, merge, release, account change or issue-implementation authority.
Host installation and native invocation require their own acceptance evidence before being claimed.

Execution journals use kernel advisory locks. A stopped or killed owner releases its lock;
leftover `.lock` files are not evidence of a live writer and are kept to preserve one inode.
Never delete a live lock file to force a retry. A host without `flock` cannot apply a batch.
