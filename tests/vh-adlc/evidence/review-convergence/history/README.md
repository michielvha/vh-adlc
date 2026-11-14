# Earlier review convergence scenario runs

Scenario summaries from before the final runs. The final summaries sit one level up.

| File | What it shows |
| --- | --- |
| `S16.nits.first-run.md`, `S16.nits.committed-skill.md` | S16.nits before T5. The committed skill already read the published convention, so the case passed before the skill text changed, and a failing first run was never observed |
| `S16.nits.t5.md`, `S16.nits.final.md` | S16.nits on the T5 skill and on the text after `1371041`, both under the earlier, weaker checks that implementation review R-20 F-01 found |
| `S16.nits.check-defect.md` | The first run under the stricter R-20 checks failed a correct revision. The check read the whole document, where the R-1 records quote every nit, and matched a file name the author had formatted as code. The check now reads only the body before the Review Log and ignores code formatting |
| `S16.oldpin.condition-defect.md` | After the R-20 F-02 fix, an author on the older pin left a factual nit unapplied. The skill asked whether the page "defines the severities", and the older page already lists `nit` as a record value. The skill, protocol and reviewer now test for the nit rule sentence itself |
| `S16.drift.md`, `S16.oldpin.md`, `S16.oldpin-reviewer.md` | Earlier passing runs of those cases |
