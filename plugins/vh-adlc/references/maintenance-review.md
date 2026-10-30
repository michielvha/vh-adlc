# Independent maintenance review

Review the provided maintenance task at its exact commit. Required inputs are
repository, commit, maintenance record, authorized outcome and engineering-docs
revision. For the ordinary single-target case, read the record and source at that commit.
Read the task's Definition and the framework maintenance procedure.
Read applicable engineering pages from the verified cache at that revision.
If a required input is absent, return a finding and stop.

Read only. Do not edit, commit, push, switch refs or modify the index. Scratch
work belongs outside the repository. Verify the real diff from its task base,
the public contract, affected paths and actual before/after checks. Run safe
checks independently where possible. Inspect unrelated state preservation.

Confirm that the task is eligible bounded maintenance, that it satisfies its
requested outcome, and that no feature or publication authority was inferred.
Identify missing checks, stale source/Definition, public-contract changes and
any source change outside the declared scope. A task record's claim is not
execution evidence. A missing reviewer or an unmet check cannot pass the task.

Use the common review protocol's model-identity and isolation rules. Start the
return with `MODEL: <actual id>` or `MODEL: unknown` if the host provides none.
Return only complete `FINDING` records using the shared finding format, or
`NO FINDINGS`. Do not invent feature criteria or require a feature document for
an otherwise eligible maintenance task. State facts plainly using the resolved
prose guide. The caller stores the returned records without editing them.


## Paired consumer record

When the consumer keeps repair evidence outside the dependency source/squash, require both bindings:
`source_target` with its source repository/worktree, task base and affected/verification input paths;
`record_target` with the primary record repository/worktree/ref/path. Read the committed Definition
at record_target and the actual source diff/checks at source_target. Missing or ambiguous pairs are
a finding; a single-target review cannot be repurposed for this task. Verify the post-aggregation
base excludes earlier bot commits and inspect any transplanted result.

Execute the required safe checks against that source target, independently where possible. A fixed
operator check runner must actually run and identify the same source/record objects; a supplied pass
string or the author's narrative is insufficient. Missing execution evidence remains a finding.
Compare all verification inputs as well as the intentional source changes. Mechanical regeneration
of a relevant lock, manifest or configuration after the review requires renewed verification/review.

On continuation/completion, compare the current affected source and verification inputs with
source_target and the current Definition with record_target. Read actual Git blobs/modes, including
additions/deletions. A changed head alone can be append-only bookkeeping, but changed review inputs
invalidate the result. Preserve earlier records as history; do not silently relabel a stale review.
The reviewer does not publish either ref or grant broader delivery scope.

## Unavailable independent route

Apply the common review protocol's actual model and isolation rules. Use the owner's requested model
when supplied; otherwise inherit the host default. A matching independent context must actually run.
If the host cannot provide it, return review pending and a self-contained handoff naming the requested
model, source/record repositories, exact targets, record path/Definition, task base, scope, checks,
engineering revision and canonical maintenance-review instructions. Do not self-review or launch
another CLI automatically. A separate operator can return a real independent artifact; resume by
checking its identity/targets and storing its raw records before any permitted publication.
