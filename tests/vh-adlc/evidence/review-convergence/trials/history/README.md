# Reviewer trials for review convergence

Evidence for task T4 of `docs/specs/spec-review-convergence.md`. `build.py` rebuilds every trial
repository; `records/` holds what the reviewer returned, verbatim. Each trial ran the updated reviewer
agent (`plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md` on `feat/spec-review-convergence`) as an
independent subagent on Claude Code, reporting `MODEL: claude-opus-5-5`, with the docs revision
`1ccf8f3` and procedural isolation, on 2026-11-14.

| Trial | Criterion | Pass condition | Result |
| --- | --- | --- | --- |
| ac02-severity | AC-02 | False claim the design depends on is blocking, harmless wrong line number nit, two-way ambiguity should-fix, wording slip nit | Pass: F-01 blocking, F-05 nit, F-02 should-fix, F-06 nit |
| ac02-lens | AC-02 | With a declared spelling lens at should-fix, the wording slip is should-fix | Pass: F-05 should-fix, citing the lens |
| ac03-restatement | AC-03 | One finding names all four places that state the limit | Pass: F-01 names Design, Owner summary, Scope, AC-01 and the Test Plan row |
| ac04-concurrency | AC-04 | A finding on concurrent updates | Pass: F-01 |
| ac04-retry | AC-04 | A finding on retry or replay | Pass: F-01 |
| ac04-upgrade | AC-04 | A finding on upgrade or rollback | Pass: F-01 |
| ac04-partial | AC-04 | A finding on partial failure | Pass: F-01 |
| ac04-wording | AC-04 | No failure-mode finding | Pass: wording and proof findings only. The first run returned one blocking finding because the cache lacked `guides/humanize-prose.md` (`records/ac04-wording-first-run.txt`); it was rerun after `vh-adlc knowledge` filled the cache. |
| ac05-passed | AC-05 | On a row that passed review, the missed wrong output is a nit and the rejected correct output is blocking | Pass: F-02 nit (says it is a free-text widening), F-01 blocking |
| ac05-changed | AC-05 | On a row changed since that review, the missed wrong output is should-fix | Pass: F-02 should-fix, saying the row started over |
| ac09-trace | AC-09 | The finding says it traces to the previous revision's change | Pass: F-01 cites the R-1 revision diff |

The AC-04 fixtures were written to leave exactly one question open, but each also drew further real
findings about gaps in the small fixtures (for example the unspecified lock behaviour); the pass
condition is that the open question is raised, which it was in every case.

`ac02-lens` was rerun on 2026-11-14 against the final reviewer agent text (commit `1371041`, which
reworded the lens sentence after the first run), on a repository rebuilt by `build.py`. It passed again:
F-07 rates the misspelling should-fix and cites the spelling lens (`records/ac02-lens-final.txt`).
