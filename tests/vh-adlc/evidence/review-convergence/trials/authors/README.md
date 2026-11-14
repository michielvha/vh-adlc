# Author trials for review convergence

Evidence for task T5 of `docs/specs/spec-review-convergence.md`. `../build_authors.py` rebuilds the trial
repositories. Each trial ran an independent subagent following the updated spec skill
(`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md` on `feat/spec-review-convergence`) inside its own scratch
repository, with docs revision `1ccf8f3`, on 2026-11-14. Where a trial raised an Open Question, the trial's
owner answered it in a follow-up message.

| Trial | Criterion | Pass condition | Result |
| --- | --- | --- | --- |
| author-ac07 | AC-07 | Drafting a webhook feature, Design states concurrent requests, partial failure, retry or replay, and upgrade or rollback, or an Open Question covers each | Pass: all four in Design, with Q1 to Q5, Q8 and Q9 for the open choices (`author-ac07.deploy-chat-notification.md`) |
| author-ac03 | AC-03 | One commit leaves all four places that state the limit at a value none held | Pass: the author first raised the unsupported value as Q1 without touching the baseline (`3d57f8c`); after the owner chose 4, one commit (`9c572d4`) set Owner summary, Scope, Design, AC-01 and the Test Plan row to 4 (`author-ac03.history.txt`) |
| author-ac09 | AC-09 | One commit applies both findings, the named check still passes, the mechanism is removed, the report lists what was walked | Pass: `30ba205` changed Design, AC-01 and the summary together, `tests/check-timeout.sh` prints PASS, `--legacy` is removed, and the report lists behaviors B1 to B3 and checks C1 and C2 (`author-ac09.history.txt`) |
| author-ac09-judgement | AC-09 | The judgement finding is raised before the baseline changes, then the factual findings and the answer land in one commit | Pass: `07b67e4` added Q1 only (Scope, Design, criteria and Test Plan byte-identical to R-1's commit); after the answer, `62a9ede` applied F-01, F-02 and the answer; the check passes (`author-ac09-judgement.history.txt`) |
