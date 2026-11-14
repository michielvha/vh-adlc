# Label rollout: michielvha/stackweaver (AC-09, T19)

Run on 2026-11-14 with the helper from `feat/shared-issue-labels` (`3dbbce1`), as GitHub account
`michielvha`, after the owner approved this exact plan digest in session. The checkout was a fresh
shallow clone with origin `https://github.com/michielvha/stackweaver.git` (Stackweaver `1235a80`),
because the owner's main checkout has an origin URL with embedded user information, which the triage
settings reader refuses.

- Plan: `rollout-stackweaver-plan.json`, SHA-256
  `2c509a0eda636105ada531159790052ee25c38d67655a13cb709f14fbe9f9a73`. Present: `bug`, `enhancement`,
  `documentation`, `ready`. Writes: update `refactor` (description added), `security` (color `ededed`
  to `d93f0b`, description added), and the descriptions of `blocked`, `partial` and `needs-decision`.
  Eleven other labels unmanaged, including Dependabot's and Renovate's.
- Apply: `cli.ts apply --repo <clone> --plan <plan> --approved-digest <digest>`, exit 0. Receipt
  `rollout-stackweaver-receipt.json`: all five updates succeeded, `complete: true`, nothing remaining.
- Snapshots: `rollout-stackweaver-before.json` and `rollout-stackweaver-after.json`, each from
  `gh api --paginate --slurp "repos/michielvha/stackweaver/issues?state=all&per_page=100"`. Both
  hold 1082 items from 11 pages. Compared by number: no item lost a label, none is missing, and none
  changed `updated_at` during the window.
- `gh label list` afterwards shows all nine standard labels with the standard colors and
  descriptions; the bot labels and GitHub defaults are unchanged.
