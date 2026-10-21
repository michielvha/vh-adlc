# Independent maintenance review

Review the provided maintenance task at its exact commit. Required inputs are
repository, commit, maintenance record, authorized outcome and engineering-docs
revision. Read the task's Definition and the framework maintenance procedure.
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
