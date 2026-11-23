# Repository instructions

Read the personal conventions at
https://github.com/vhco-pro/docs/blob/0c983f6793bfe35eb96ae95ad0c361c6200af44f/AGENTS.md
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

## Local commands and constraints

Feature documents: docs/specs/

- The vh-adlc binary: `go test ./...`, `go vet ./...`, `golangci-lint config verify` and
  `golangci-lint run` (v2.15.0), and `go mod tidy -diff`.
- The vh-adlc plugin checker: `bun test tests/vh-adlc --parallel --timeout 60000`, with `go` on
  PATH and network access to GitHub. CI runs the same command. It needs Linux and the CI `checker`
  job's setup in `.github/workflows/ci.yml`: git 2.44 or later, Bubblewrap with unprivileged user
  namespaces, `xmllint`, GNU mv from coreutils 9.7, the locked YAML reader, and the website smoke
  prerequisites (socat, iproute2, OpenSSL, certutil, Squid, the playwright-core version pinned in
  `plugins/vh-adlc/scripts/website-check/package.json` with its Chromium headless shell, and the
  `WEBSITE_CHECK_PLAYWRIGHT_MODULE` and `WEBSITE_CHECK_SQUID` variables). A missing prerequisite
  fails the tests. On other hosts, run the `checker-macos` job's file list instead.
- The github-app-registration plugin: `bun test --cwd plugins/github-app-registration/skills/github-app-registration/scripts`.
