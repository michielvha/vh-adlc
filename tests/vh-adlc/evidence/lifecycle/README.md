# Lifecycle evaluation evidence

Conventions: `vhco-pro/docs@e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a`;
prose follows `guides/humanize-prose.md` at that revision.

## Current evaluation

The compact seven-skill entry is frozen at package digest
`19941ba2018b0a774004ecf5559da68eab3bc86ebbb21fb8170a30aff0f5c44e`,
source commit `0dc03ca`. A complete fresh Codex CLI matrix and all three entry
comparisons are running. Earlier passing trials do not establish this package.
No completion or new host-support claim is made until the new trials and
independent reviews pass.

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
`evidence-index.ts` rejects missing, drifted or contradictory passing records.

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
