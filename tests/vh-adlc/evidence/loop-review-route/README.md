# Real review route proof (T34, AC-02)

Recorded on 2026-11-13 from `feat/shared-development-loop`, with the candidate plugin's
`scripts/loop/cli.ts review` and Codex CLI 0.163.0.

`run.sh` builds a disposable feature repository (`math.ts`, `math.test.ts`, `docs/specs/add.md`) with
two command routes in its `.vh-adlc/loop.yaml`: a file-only spec reviewer
(`codex exec --json --skip-git-repo-check -s read-only`) and a shell implementation reviewer
(`codex exec --json -s workspace-write`), both `gpt-6.1-sol` with `model_attestation: codex-session`.
Both ran inside the route's PID namespace.

| Review | Outcome | Model (attested from Codex's session log) | What it shows |
| --- | --- | --- | --- |
| spec | `ready` | `gpt-6.1-sol` | Read the read-only export of the commit and returned two findings, including a blocking one about the disposable document claiming `in-progress` without an acceptance row. The reviewer's own `MODEL:` line was not needed. |
| implementation | `ready` | `gpt-6.1-sol` | Ran `bun test` itself and returned `CRITERION: AC-01 ... VERDICT: met`. |

After both runs `git status --short` in the disposable repository was empty. The returned records were
stored under `### R-1` and `### R-2` of the disposable document, and `vh-adlc review check` (binary
0.9.0) passed for both with `"equal": true`. The full outcomes, records and replies are in
`spec-outcome.json` and `implementation-outcome.json`; `target.txt` names the disposable repository and
commit.
