# Repository instructions

Read the personal conventions at
https://github.com/vhco-pro/docs/blob/e79eaa6a0126f2e8ddca2cf14e3db3067b244cc7/AGENTS.md
and follow the task routes there before implementation.

For all code, read conventions/coding.md at that revision. Before diagnosing a failure,
writing or changing a test, or claiming test evidence, read conventions/testing.md.
To specify, plan or implement a feature, read conventions/feature-documents.md.
For Go, also read conventions/go.md; for CI and releases, conventions/delivery.md and
knowledge/shared-delivery.md. For TypeScript, read conventions/typescript.md.
Edit all prose a reader will see with guides/humanize-prose.md.
When onboarding or bootstrapping, read the matching guides/ page.

Load only the relevant documents. If they are inaccessible, report it and stop.
Preserve this repository's local instructions; report a conflict instead of
silently overriding either source.

## Product profile

An open-source agent workflow plugin and Go binary, used by a few developers on their own machines and
repositories. Alpha, on 0.x. At stake are the user's repositories, branches and credentials, and the
correctness of the gates other projects rely on.

## Local commands and constraints

Feature documents: docs/specs/

- The vh-adlc binary: `go test ./...`, `go vet ./...`, `golangci-lint config verify` and
  `golangci-lint run` (v2.15.0), and `go mod tidy -diff`.
- The vh-adlc plugin checker: `bun test tests/vh-adlc --parallel --timeout 60000`, with `go` on
  PATH and network access to GitHub. CI runs the same command.
- The github-app-registration plugin: `bun test --cwd plugins/github-app-registration/skills/github-app-registration/scripts`.
