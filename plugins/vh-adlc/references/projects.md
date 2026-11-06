# GitHub Projects

Use one Projects v2 board as a view across repository issues. Issues and repository feature documents
keep their own scope, acceptance and delivery records. The coordinator uses the existing GitHub CLI
and Bun runtime; no GitHub SDK, task database or hosted workflow is installed.

## Set up access and configuration

Run from the checkout that will own the project configuration. It can track other repositories;
those repositories do not each need a copy. Check `gh auth status --active` without displaying tokens.
For interactive read/write access, the owner authorizes:

```bash
gh auth refresh --hostname github.com --scopes project
```

Inventory alone can use `read:project`. Existing repository access is also needed for private issues.
Projects scopes cover more than one configured board; the allowlist limits this helper's behavior,
not the GitHub token. Access can be revoked or require later organization/SSO authorization.
The operation never runs credential refresh itself.

Create `.vh-adlc/projects.yaml` only on an explicit setup request. Use the actual board URL and option
IDs from that board; the values below are examples. `fields` may be empty for issue additions only.
Choose either `id` or `name` per field. Names must resolve uniquely; allowed options are IDs.
Quote actual option IDs in YAML, including any ID made entirely of digits.

```yaml
schema_version: 1
project: https://github.com/orgs/example/projects/1
repositories:
  - example/builders
  - another-owner/shared-tools
fields:
  - name: Status
    options:
      - ACTUAL_TODO_OPTION_ID
      - ACTUAL_REVIEW_OPTION_ID
page_budget: 100
```

A user-owned board uses `https://github.com/users/OWNER/projects/NUMBER`. Only github.com is supported
in this version. Unknown settings, duplicate identities and missing options fail instead of choosing
another target. Native auto-add workflows can complement the coordinator, subject to the account's
plan limit. Enabling auto-add does not backfill existing issues.

## Collect and review

Set `plugin_dir` to the installed plugin directory and `checkout` to the configuration-owning checkout.
Keep reports outside source control. The directory below is private and disposable:

```bash
umask 077
report_dir=$(mktemp -d)
bun "$plugin_dir/scripts/projects/cli.ts" inventory --repo "$checkout" --json > "$report_dir/inventory.json"
bun "$plugin_dir/scripts/projects/cli.ts" inventory --repo "$checkout"
```

The second command takes a new observation; it does not render the first snapshot. JSON has
`schema_version`, `project`, `repositories`, `observed_at`, `complete`, `gaps`, `fields`, `items`,
`issues` and `proposed`. Incomplete results exit nonzero and contain no proposed operations. Collection
paginated past its budget, denied content, redactions or inaccessible repositories is incomplete.
An API error is never evidence that a backlog is empty. Linked PRs retain state, head, review and check
facts separately. Existing blocking issues are linked in recommendations. Local feature lifecycle is
unknown until the agent checks the owning repository through its own pinned procedure.

## Plan and approve updates

Create a JSON batch from a complete observation. This is a generated machine artifact; human settings
remain YAML. `project` and `repositories` must match the configuration and actual fresh inventory.
`issue` is the complete issue reference from inventory, including `id`, `repository`, `number`, `url`,
`title`, `state` and `stateReason`. It may retain the inventory's extra PR/lifecycle properties, which
are ignored when validating issue identity. There are at most 100 distinct operations per batch.

```json
{
  "schema_version": 1,
  "complete": true,
  "project": { "id": "ACTUAL_PROJECT_ID", "url": "https://github.com/orgs/example/projects/1" },
  "repositories": ["example/builders", "another-owner/shared-tools"],
  "operations": [
    {
      "kind": "add",
      "issue": {
        "id": "ACTUAL_ISSUE_ID",
        "repository": "example/builders",
        "number": 42,
        "url": "https://github.com/example/builders/issues/42",
        "title": "Example work",
        "state": "OPEN",
        "stateReason": null
      }
    }
  ]
}
```

A field update uses `kind: "set"`, the same `issue` reference, the existing `item` ID, configured
`field` ID, observed `before` option ID (or null) and desired `value` option ID. Other operation kinds
and field types are refused. Do not treat the example IDs as working defaults.

```bash
bun "$plugin_dir/scripts/projects/cli.ts" plan --repo "$checkout" --batch "$report_dir/batch.json"
```

Show the owner the exact batch and its digest before apply. A digest binds exact bytes and does not
prove approval occurred; the invoking agent/operator must obtain that approval. Editing the file
requires renewed approval. After approval, replace the placeholder with that digest:

```bash
bun "$plugin_dir/scripts/projects/cli.ts" apply --repo "$checkout" \
  --batch "$report_dir/batch.json" --approved-digest APPROVED_SHA256 > "$report_dir/receipt.json"
```

Each write re-collects current inventory, verifies scope and expected values, then reads back actual
results. This favors a clear bounded implementation over a second cache or synchronization service;
large batches may reach their request budget and need a new observation and approval for the remainder.
Archived and active membership are both collected. An existing issue card is reused without unarchiving it. A request that fails or times out is reconciled before any retry.
Receipts distinguish succeeded, already satisfied, reconciled, conflict, refused, failed, unknown and
not attempted. Reconciled means the desired state was observed after a request error; it does not prove
which actor changed it. Earlier successes remain reported when later operations fail.

GitHub field updates have no expected-value/revision condition. A human edit between the fresh read
and mutation can be overwritten; read-back cannot prove it did not happen. Field-update receipts carry
this limitation even on success. Detected preflight conflicts are refused. No atomicity, lock or
transactional rollback is claimed. Do not automatically retry an unknown result or revert human edits.

## Later automation and verification

The YAML input and versioned JSON results can be used from a fresh process. No schedule, credential
store or unattended approval bypass is included. Hosted automation needs separate Projects credentials;
ordinary Actions `GITHUB_TOKEN` cannot access Projects. A future organization workflow can use an
appropriately scoped GitHub App, with private cross-owner issue access verified separately.

Run `bun test tests/vh-adlc/projects` and `bash plugins/vh-adlc/scripts/projects/typecheck.sh` from the
framework checkout. The typecheck reuses the repository's locked development compiler. These local
checks use subprocess fixtures; they do not establish real-board acceptance or another host's agent
integration. A controlled disposable-board trial requires separately approved resources and cleanup.

## References

- [GitHub CLI Projects](https://cli.github.com/manual/gh_project)
- [CLI scope refresh](https://cli.github.com/manual/gh_auth_refresh)
- [Native auto-add](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically)
- [Projects mutation inputs](https://docs.github.com/en/graphql/reference/projects#updateprojectv2itemfieldvalueinput)
- [Projects authentication](https://github.github.io/gh-aw/reference/auth-projects/)
