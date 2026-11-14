# Reviewer and author trials for review convergence

Evidence for tasks T4 and T5 of `docs/specs/spec-review-convergence.md`. Each trial is a fresh headless
Claude Code session in its own isolated profile, run by `run.ts`. A reviewer trial follows the reviewer
agent in the checkout, and an author trial follows the spec skill in the checkout. Every trial uses docs
revision `1ccf8f3` and requested model `claude-opus-5-5`.

## Rerun

```sh
bun tests/vh-adlc/evidence/review-convergence/trials/run.ts <output dir> [trial ...]
python3 -I -B tests/vh-adlc/evidence/review-convergence/trials/collect.py <evidence dir> <output dir> ...
```

`build.py` and `build_authors.py` create the fixture repositories. Where an author trial raises an Open
Question, `run.ts` resumes the same session once with the scripted owner answer. `collect.py` copies
each session's results, its repository history and a redacted copy of each raw transcript. The redaction
replaces the account's claude.ai connector names and the host home directory and changes nothing else.
`runs/manifest.json` records both sha256 values for every transcript.

## Final runs

All fifteen trials ran on 2026-11-14 at checkout `1767ceb` with no local change under `plugins/`.
`runs/manifest.json` records the reviewer agent blob `51f0b30` and the spec skill blob `fe6c3f0`. Every
turn reported `claude-opus-5-5` and none errored. The raw transcripts are kept outside the repository
in `~/.cache/vh-adlc-review-convergence-trials/1767ceb/` on the machine that ran them.

| Trial | Criterion | Pass condition | Result (`runs/<trial>/result.txt`) |
| --- | --- | --- | --- |
| ac02-severity | AC-02 | Blocking for the false claim the design depends on, nit for the harmless wrong line number, should-fix for the two-way ambiguity, nit for the wording slip | Pass: F-01 blocking, F-05 nit, F-02 should-fix, F-06 nit |
| ac02-lens | AC-02 | With a declared spelling lens at should-fix, the wording slip is should-fix | Pass: F-05 should-fix, citing the spelling lens |
| ac03-restatement | AC-03 | One finding names every place that states the limit | Pass: F-01 names Design, Owner summary, Scope, AC-01 and the Test Plan row |
| ac04-concurrency | AC-04 | A finding on concurrent updates | Pass: F-01 |
| ac04-retry | AC-04 | A finding on retry or replay | Pass: F-01 |
| ac04-upgrade | AC-04 | A finding on upgrade or rollback | Pass: F-06, on the first run after upgrading from the stateless script |
| ac04-partial | AC-04 | A finding on partial failure | Pass: F-02 |
| ac04-wording | AC-04 | No failure-mode finding | Pass: findings on the proof, the wording and the summary only |
| ac05-passed | AC-05 | On a row that passed review, the missed wrong output is a nit and the rejected correct output is blocking | Pass: F-05 nit, which says it only widens a reviewed free-text row, and F-01 blocking |
| ac05-changed | AC-05 | On a row changed since that review, the missed wrong output is should-fix | Pass: F-02 should-fix |
| ac09-trace | AC-09 | The finding says it traces to the previous revision's change | Pass: F-01 cites commit `1a492e2`, which applied R-1 F-01 to Design alone |
| author-ac07 | AC-07 | The webhook draft's Design states behavior for concurrent requests, partial failure, retry or replay, and upgrade or rollback, or an Open Question covers each one it leaves open | Pass: Design has a subsection for each of the four, and Q1 to Q7 hold the open choices |
| author-ac03 | AC-03 | One commit leaves every place that states the limit at the value none held | Pass: the author asked the owner first without changing the baseline (`f378523`); after the answer, `dfb9b9c` set the Owner summary, Scope, Design, AC-01 and the Test Plan row to 4 |
| author-ac09 | AC-09 | One commit applies both findings, the named check still passes, the mechanism is removed, and the report lists what was walked | Pass: `62ec873` changes Design, AC-01 and the summary together, `tests/check-timeout.sh` prints PASS, `--legacy` is gone from Design, and the report lists the behaviors and checks walked |
| author-ac09-judgement | AC-09 | The judgement finding is raised before the baseline changes, then the factual findings and the answer land in one commit | Pass: `f424014` adds the question with the baseline unchanged; after the answer, `4d484a5` applies F-01, F-02 and the answer, and the check prints PASS |

Where a pass condition asks for a finding on one question, it is met when a finding is aimed at that
question. The AC-04 fixtures are small and also draw real findings on details they leave out, such as
an unnamed lock file. Those findings do not affect the result.

`history/` keeps the earlier runs, made as subagents on earlier text of the agent and the skill, and
their notes.
