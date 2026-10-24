# Contributing

Bug reports and pull requests are welcome. For a bug, include the client and
version, installed plugin version, command or operation, and steps to reproduce.
Keep credentials and private repository details out of reports.

## Work locally

Read [AGENTS.md](AGENTS.md) and its pinned conventions before changing the project.
Use a separate branch and worktree when another session is using the checkout:

```sh
git worktree add -b docs/my-change ../vh-adlc-my-change origin/main
```

Choose a branch name that describes your work. Preserve other sessions' changes
and check [existing feature documents](docs/specs/) before starting a feature.

## Project layout

| Path | Contents |
| --- | --- |
| `cmd/vh-adlc/`, `internal/` | Go binary and its tests. |
| `plugins/vh-adlc/` | Shared skills, reviewer, workflow references, and binary lock. |
| `plugins/github-app-registration/` | GitHub App registration plugin and Bun scripts. |
| `.agents/plugins/`, `.claude-plugin/` | Native marketplace catalogs. |
| `docs/` | User documentation, maintainer guides, and feature documents. |
| `tests/vh-adlc/` | Package checks, scenario fixtures, and host evidence. |

Auth-refresh is a separate component. Make its implementation changes in
[its repository](https://github.com/michielvha/auth-refresh).

## Checks

For Go changes, use the toolchain in [go.mod](go.mod) and golangci-lint v2.15.0:

```sh
go test ./...
go vet ./...
golangci-lint config verify
golangci-lint run
go mod tidy -diff
```

For the vh-adlc package, run:

```sh
bun test tests/vh-adlc
```

For the GitHub App registration scripts, run:

```sh
bun test --cwd plugins/github-app-registration/skills/github-app-registration/scripts
```

Documentation changes should keep relative links working and commands consistent
with the source. Keep installation steps in the [installation guide](docs/get-started/installation.md),
host claims in [compatibility](docs/reference/compatibility.md), and the README short.
Host support needs a recorded scenario run; passing unit tests alone does not
establish it.

Describe the change and the checks you ran in your PR. Maintainers can find the
release process in [publishing releases](docs/internal/releasing.md).
