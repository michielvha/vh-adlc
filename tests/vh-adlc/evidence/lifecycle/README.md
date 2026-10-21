# Lifecycle evaluation evidence

Engineering conventions: `vhco-pro/docs@e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a`.
Lifecycle orchestration belongs to the vh-adlc package. No shared-docs lifecycle
controller, task record or pin change is part of these trials.

## Initial native CLI baseline

`initial-baseline.json` records four generic-request diagnostics and one bounded
maintenance pilot against the unchanged 0.2.0 package. Codex CLI 0.163.0 loaded
it through native marketplace installation in an isolated temporary profile.
The owner's active plugin/configuration was not changed. Model identity was not
attested; each trial used the same isolated-profile default without an override.

The answer, documentation correction, report-only investigation and unaccepted
feature-draft cases passed their artifact/preservation checks. The maintenance
pilot repaired the greeting and observed failing/passing checks, but created no
maintenance record or independent review. Its branch/commit work was also denied
by the child sandbox's never-approve setting. That host restriction limits causal
claims about the incomplete maintenance result.

The runner now uses normal automatic approval review with workspace-write for
the comparative trials. Earlier results remain diagnostic and must not be mixed
into a passing final suite. Private raw transcripts and snapshots remain in the
temporary trial directories; committed records contain prompts, identities,
checks and outcome summaries, not credential values or raw account data.

These are headless native CLI diagnostics. They do not establish desktop GUI
discovery, native GUI execution, the full lifecycle matrix or feature completion.

## Candidate comparison

[comparison.json](comparison.json) contains twelve core diagnostics and three
maintenance pilots using normal automatic approval review. It regrades the
saved transcripts and unchanged fixture snapshots through one grader revision;
the original results remain in the temporary runs. Grader source is committed
in `tests/vh-adlc/lifecycle/`, including a repeatable `regrade.ts` command.
The package digests identify the actual installed candidates, independently of
the source commit containing this report.

| Diagnostic | Unchanged 0.2.0 | Common intake, seven skills | Common intake plus eighth entry skill |
| --- | --- | --- | --- |
| L01 question | Pass | Pass | Pass |
| L02 documentation correction | Pass | Pass | Pass |
| L04 report-only investigation | Pass | Pass | Pass |
| L05 unaccepted new behavior | Pass | Pass | Pass |
| L06 maintenance pilot | Incomplete: no task record or verified review | Incomplete: repair and record pass, independent review unverified | Incomplete: repair and record pass, reviewer failed to start |

All runs used Codex CLI 0.163.0, the same isolated-profile default without a
model override, the same prompts and the same engineering-docs pin. Model
identity is unknown. The common and thin candidates had identical lifecycle
references; only the thin candidate added `vh-adlc-start`.

The seven-skill candidate is selected for continued evaluation: the extra entry
skill demonstrated no benefit in these four cases. This is a small diagnostic
sample, not a reliability or full acceptance result. The unchanged baseline
already handled these four tasks, so this comparison does not establish a
routing failure in 0.2.0. The observed improvement is the explicit maintenance
record; completion still needs independent-review evidence.

The common candidate wrote a clean-review claim, but its JSONL trace contains
only waits with no receiver identities and does not establish an independent
reviewer. The thin candidate explicitly recorded a failed reviewer startup and
left a handoff. Neither qualifies as a complete L06 result. The corrected grader
rejects both, rather than treating the records as proof of independence.

The selected package is committed at
`916ce7d` with digest
`7b6f5902ecaa3ce08e34545bee0f756be6c8ea05998cb7487ccab924298ced6e`.
Its lifecycle procedure and engineering pin match the common candidate tested.
Later instruction changes require affected comparisons to be rerun.

## Remaining acceptance work

The prescribed L01-L19 variants, reserved wording variants and repetitions
remain open. A final evaluator needs observable dispatch and returned-result
evidence; it must not infer independence from a task record. Historical GUI
results for 0.2.0 do not validate this behavior.

Native desktop verification could not run: the Computer Use tool refused access
to `com.openai.codex`, reporting "Computer Use is not allowed to use the app
'com.openai.codex' for safety reasons." No alternate UI route was attempted.
This is a host testing limitation, not a passing desktop result. The feature
stays in progress; other hosts are unverified for the lifecycle front door.

## Reviewer transport pilot

The earlier thin-entry failure reported that its parent's rollout could not be
loaded. The runner used `--ephemeral`, which does not persist session files.
A fourth L06 pilot retained session files inside its disposable profile,
without changing the package, model selection, authority or sandbox policy.

[reviewer-transport.json](reviewer-transport.json) records a manual audit of the
saved native host logs. A distinct reviewer thread links to the parent. Its
tools inspected repair commit `f606c619170fb6ab6b1882dc4435058a516b8f26`,
reproduced the failing baseline outside the repository and ran the repaired
tests and shell syntax checks. It returned `MODEL: unknown` and `NO FINDINGS`;
the parent stored the records verbatim. Source and Definition remained unchanged
through the final bookkeeping commit. Isolation was procedural and model
identity was not attested. Unrelated state and publication boundaries passed.

This establishes independent reviewer startup and returned-result evidence for
one CLI pilot with retained sessions. The original comparison remains unchanged;
its ephemeral runs are not retroactively credited with this proof. The grader
still reports this new pilot as failing its unimplemented reviewer-evidence
check. T7 must add an automated receipt verifier and run the prescribed fresh
matrix before completion. Private rollout contents stay outside Git; the public
audit stores hashes, identities and check summaries.
