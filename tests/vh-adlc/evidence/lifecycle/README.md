# Lifecycle evaluation evidence

Conventions: `vhco-pro/docs@e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a`;
prose follows `guides/humanize-prose.md` at that revision.

## Current evaluation

The compact seven-skill entry has package digest
`19941ba2018b0a774004ecf5559da68eab3bc86ebbb21fb8170a30aff0f5c44e`,
source commit `0dc03ca`, and unchanged engineering pin
`e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a`.

[Matrix](cli-matrix.json) passes all 57 required outcomes and repetitions from
57 selected fresh native trials, with 21 verified independent-review receipts.
[Trial index](trials.jsonl) records their identities; [provenance](provenance.json)
hashes the full private reports. The 12 [comparisons](comparisons.jsonl) include
four trials also used by the selected matrix. The compact entry and the thin
entry pass all four diagnostic cases; the baseline fails the publication
boundary. [Comparison summary](comparison-summary.json) records that result.
No extra-skill benefit was observed, so the seven-skill entry remains selected.

There were 68 fresh native executions in total. Two initial four-minute
harness timeouts and one incomplete two-turn delivery trial remain failures,
alongside the baseline publication failure in [failed trials](failed-trials.jsonl).
Fresh retries completed all three cases with the same frozen framework package.
The harness now has a uniform twelve-minute emergency deadline, not a behavior
SLA. No timed-out or incomplete execution was relabelled as successful.

The framework owns lifecycle routing, maintenance records and review procedure.
Shared docs remain pinned engineering conventions. These trials add no controller
or task state to the docs repository.

## Evidence and reproduction

Native runs use Codex CLI 0.163.0 with disposable profiles, retained native
sessions, workspace-write, automatic approval review and no model override.
Fixture repositories have local bare remotes and unrelated staged, unstaged and
untracked work. Model identities are retained as reported or unknown; these
native sessions do not attest the configured model identity.

Full prompts, event logs, before/after fixtures and reviewer sessions remain in
the private native run directories. They are required for `lifecycle/regrade.ts`;
a public summary alone cannot reproduce or prove a passing outcome. A public
trial index records the raw-event and check hashes, artifact location, outcome
and independent-review receipt without repeating the full check array.
[Evidence indexing](../../evidence-index.ts) rejects missing, drifted or contradictory passing records and retains original outcomes after regrading.

Run the installed host through `tests/vh-adlc/lifecycle/run.ts` with `--package`,
`--cases` or `--reserved`, `--repeat` and an empty `--output` directory. Use
`lifecycle/scenario-plan.ts` and `lifecycle/suite.ts` for the prescribed cases and
repetitions. Regrade saved run directories with `lifecycle/regrade.ts`; it checks
that every saved fixture still matches its original snapshot. Run `suite.ts` on
the full regraded results, with the exact package digest and engineering pin.
Do not run it on a compact index and call that behavioral verification.

Private profiles use the existing local authentication through a symlink.
Credential values and private conversation dumps never enter public evidence.
Reviewer isolation is procedural; a shell grant can write.

## Evaluator corrections

The final package suite passes 208 tests and 550 assertions under strict Git
bare-repository policy. Native evaluation exposed adapter assumptions as well
as behavioral boundaries. Each correction has a failing regression before the
fix; original artifacts, statuses and hashes remain unchanged.

A batched shell call can contain a completed file read or an answered binary
command followed by a failed Git diagnostic. The grader now checks the actual
read and typed result instead of treating the whole batch as one failed read.
The original delivery trial still failed because its second turn never ran;
its fresh two-turn retry passed.

Maintenance review metadata may be an explicitly bound sentence or table, and
a new review can follow state bookkeeping. The latest review ID, target and
model must be unambiguous and match an actual linked native return. A reviewer
may retain its own previously read contract during re-review; target and record
inspection still belong to its current turn, and inherited parent history
never supplies reviewer evidence. A new local task branch may preserve the
original branch, while multiple or unrelated existing ref changes still fail.

These corrections recognize equivalent observed evidence, not a preferred
answer. Missing checks, native returns, current source or task-definition
freshness still prevent completion. Compact indexes retain original failed
outcomes and cannot stand in for regrading the private native evidence.

## Historical evidence and retained failures

[Archive index](archive-index.json) identifies the earlier diagnostic reports by
original filename, byte count, SHA-256 and immutable ancestor-commit URL. Task
records and old reviews that name those files refer to that historical content.
The files are removed from the current tree; their Git history is preserved.
They are diagnostic and cannot be combined with the new package's results.

- [Publication failures](publication-before-fix.json): generic drafting pushed
  or attempted pushes without authority. The strict oracle retains those failures.
- [Boundary failures](boundaries-before-fix.json): excluded maintenance was
  classified without completing authorized drafting or asking the missing decision.
- [CI fixture defect](ci-fixture-defect.json): the initial fixture lacked checkout.
- [Investigation ambiguity](investigation-fixture-ambiguity.json): the old prompt
  omitted its intended no-write constraint; the original failed run is retained.
- [Shipping CI portability](ci-portability.json): optional ripgrep was unavailable.
- [Copilot corrections](review-corrections.json): Opus found strict Git and
  publication-oracle defects. R-9/R-10 in the feature document preserve its records.

Each oracle correction has a failing regression before the fix. Equivalently
supported command sequences may pass, but failed writes, unobserved execution,
missing reviews and changed scope cannot become successful evidence.

## Host limits

This evaluation establishes only bounded native Codex CLI behavior. Desktop and
other hosts remain unverified for lifecycle intake. Computer Use worked in
Calculator, but refused `com.openai.codex` even after the owner enabled full
access. No supported override was found or attempted.

Copilot Opus 5.5 independently reviews the committed implementation and original
evidence. That code review does not establish Copilot lifecycle behavior.
