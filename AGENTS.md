# Repository instructions

Read the personal conventions at
https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/AGENTS.md
and follow the task routes there before implementation.

For all code, read conventions/coding.md at that revision.
To specify, plan or implement a feature, read conventions/feature-documents.md.
For Go, also read conventions/go.md; for CI and releases, conventions/delivery.md and
knowledge/shared-delivery.md. Edit all prose a reader will see with guides/humanize-prose.md.
When onboarding or bootstrapping, read the matching guides/ page.

Load only the relevant documents. If they are inaccessible, report it and stop.
Preserve this repository's local instructions; report a conflict instead of
silently overriding either source.

## Local commands and constraints

Feature documents: docs/specs/

- The vh-adlc binary: `go test ./...`, `go vet ./...`, `golangci-lint config verify` and
  `golangci-lint run` (v2.15.0), and `go mod tidy -diff`.
- The vh-adlc plugin checker: `bun test tests/vh-adlc`.
- The github-app-registration plugin: `bun test --cwd plugins/github-app-registration/skills/github-app-registration/scripts`.
