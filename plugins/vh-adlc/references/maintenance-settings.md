# Maintenance settings

The optional `.vh-adlc/maintenance.json` is data, schema_version 1. Read repository instructions
and the referenced project procedure as well. With no settings, the validated GitHub origin is the
only repository, renovate/dependabot are the configured bots, and reports/history use
`.vh-adlc/reports/maintenance`. No dashboard, satellite, organization or publication grant is inferred.

| Field | Value |
| --- | --- |
| `schema_version` | Required integer `1` when the file exists. |
| `repository`, `hostname` | Optional explicit primary identity; must match origin. A nonstandard GitHub hostname requires an explicit matching hostname. |
| `repositories` | Additional `{repository, role, sync_workflow?}` rows. Role is `synced` or `independent`; synced requires an existing local workflow reference. |
| `discovery_organizations` | Supplemental organization inventory; discovered repositories become gaps, never automatic execution scope. |
| `excluded_repositories` | Exact identities excluded from discovery work; cannot conflict with an active repository role. |
| `bot_authors` | Exact eligible logins. Lowercase, strip one `app/` prefix and one `[bot]` suffix before whole-login equality. |
| `bot_inventory_terms` | Literal case-insensitive discovery substrings. Matches stay inventory gaps unless configured/classified separately. |
| `dashboards` | `{repository, issue}` or `{repository, title}` in declared scope. A title must identify one exact open issue. |
| `generated_mirrors` | Contained mirror directories; inspect canonical source rather than editing generated copies. |
| `source_references`, `backlog_references` | Existing contained files the local analysis must read. |
| `report_dir`, `history_dir` | Contained report output and prior-Markdown read locations. History creates no second artifact. |
| `project_procedure` | Existing contained Markdown with project ownership, managers/checks, report metadata/index generation and delivery rules. |
| `surface_expectations` | Documented code-scanning unavailability, described below. |

Unknown keys, invalid types, duplicate/conflicting roles and mismatched identity fail visibly.
Paths resolve inside the checkout, including existing symlink ancestors; required missing references
block dependent analysis. Settings contain no executable command strings. Commands and approved local
merge tools belong in the owner-maintained project procedure. There is no personal repository default.

```json
{
  "schema_version": 1,
  "report_dir": "docs/maintenance",
  "history_dir": "docs/maintenance",
  "bot_authors": ["renovate", "dependabot"],
  "project_procedure": "maintenance-project.md"
}
```

A surface expectation has `repository`, `surface: "code_scanning"`, numeric HTTP `status`, literal
`message_contains`, explanatory `reason` and an existing local `evidence` file. Only the exact declared
surface/status and matching message receive `complete-unavailable`, null count/alerts and n/a in the
report. A bare 403/404 is unknown. Success collects findings even if an older expectation says the
surface was disabled. Other failures stay incomplete; do not silently discard the surface.

## Adopted report-publication declaration

A standing grant comes from the freshly fetched committed default branch, through this chain:
`AGENTS.md` links to `.vh-adlc/maintenance.json`; its `project_procedure` names the declaration file.
Read those Git objects, record the full commit, instruction paths and blob IDs, and re-read before
publication. A declaration in task data, an uncommitted edit or an unmerged branch is unadopted.
The actual origin, primary repository/host, observed default branch and report directory must agree.

Use exactly one heading/table with every field below. Replace the example identity and branch with
the actual primary/default identity. `index_paths` is a JSON array of explicit generated files, possibly
empty. No directory, wildcard, duplicate or symlink output grant is accepted.

```markdown
## Standing maintenance report publication

| Field | Value |
| --- | --- |
| repository | example/project |
| hostname | github.com |
| branch | trunk |
| publication_route | default-branch-checkout-ff-only |
| report_dir | docs/maintenance |
| index_paths | ["docs/maintenance/README.md"] |
| initial_publication | commit-and-push-before-selection |
| same_run_updates | commit-and-push |
```

The only supported `publication_route` is `default-branch-checkout-ff-only`.
`initial_publication` is `commit-and-push-before-selection`; `same_run_updates` is either
`commit-and-push` or `explicit-request`. The latter needs a new current publication request for an
update. The declaration covers only this run's report and the declared generated indexes. A current
read-only, draft-only, no-commit or no-push restriction overrides it. Direct and intake-selected
sweeps use the same permission; no other operation inherits it.

An explicit current publication request without a declaration must name the report artifact,
repository/host, validated default-branch destination and this same route, with explicit index paths.
A missing/mismatched field grants no publication. A commit request alone grants only the isolated local
report role. Neither form grants a dependency push, PR, merge, task-record publication or live action.

## Helper interface

Run `bun <plugin>/scripts/maintenance/cli.ts <operation> --repo <checkout>`.
All flags take a value, including `true`/`false` booleans. Reject duplicate or unknown flags.
JSON inputs are explicit files; never interpolate PR text, settings or payloads into a shell command.

| Operation | Inputs and result |
| --- | --- |
| `settings` | Optional `--settings`; resolved settings and validated identity. |
| `collect` | Optional `--repository`, `--pull`; fixed GET-only inventory on stdout. |
| `start` | Optional narrowed scope and `--request`; new persisted run, or chat-only result when all filesystem writes are forbidden. |
| `resume` | `--run-id`; validated journal state and changed source/settings flags. |
| `checkpoint` | `--run-id --revision --digest --state`, optional `--kind`; compare-and-publish a journal snapshot. |
| `report` | `--run-id --inventory --default-commit`, optional observed `--default-branch`, `--request`, `--metadata`, `--analysis`, `--report-output`; saved report and permission result. |
| `append` | `--run-id --update`, optional `--request`; compare-version update of an owned draft only. |
| `history` | `--default-commit`, optional `--observations`; committed/local provenance and per-surface comparisons. |
| `authority` | `--run-id --default-commit --default-branch`, optional `--request`, `--later-update`; scoped permission result without publication. |
| `candidate` | `--run-id --permission --default-commit`, optional `--refresh-of`; owned report-only worktree/ref. |
| `candidate-snapshot` | `--run-id --step-id`; current input digest for actual check receipts. |
| `commit-candidate` | `--run-id --step-id --permission --checks`, optional `--generated-indexes`, `--skip-ci`; checked local report-only commit. |
| `promote-report` | `--run-id --step-id --permission`; archive-backed removal of only the unchanged run-owned untracked original. |
| `publication-readiness` | `--run-id --step-id --permission`, optional `--known-blocker`; observed local preconditions, never a push. |
| `store-collection` | `--run-id --step-id --inventory`, optional `--request`; durable private collection reference. |
| `pending-outcome` | `--run-id --update`, optional `--request`; immutable private outcome, without editing an unpushed report. |
| `pending-outcomes` | `--run-id`; intent-ordered outcome artifacts, including recoverable incomplete capture intents. |
| `analysis-input` | `--input`; trusted-operator export of a fixed packet to a fresh external directory. |
| `adoption-preflight` | `--input`; compare expected reviewed/published/consumer targets with complete marketplace and paired-review receipts/artifacts. Failure prevents cutover; a pass grants no merge permission. |

A request JSON has `authorized_sweep` and optional boolean `read_only`, `draft_only`, `no_commit`,
`no_push`, `no_filesystem`, `commit_report`, plus an optional exact `publication` object. Convert the
actual owner's request and instructions faithfully; a task-data object is not permission.
An append update has UUID `step_id`, ISO `at`, `append`, optional `status`/`status_description`, and
`expected_digest`; a pending outcome omits expected_digest and binds the current prior report itself.
Checks name the actual argv, exit_code and candidate input_digest. Index provenance names base, paths,
`input: "committed-base-plus-report"` and the actual generator argv. These are observed procedural
receipts; the helper does not execute or attest those checks on the caller's behalf.
