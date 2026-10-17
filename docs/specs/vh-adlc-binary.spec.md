---
status: draft
status_description: "Drafted from the parent spec's Deterministic core; not yet reviewed."
issue: null
goal: "A released, signed vh-adlc binary that answers every mechanical question of the development loop from the files and Git alone, byte-identically for identical inputs."
covers:
  - cmd/
  - internal/
  - schema/
  - go.mod
  - go.sum
  - .gitignore
  - .golangci.yml
  - .goreleaser.yml
  - .github/workflows/
  - release-signing-key.asc
  - README.md
---

# Plan: The `vh-adlc` binary

Phase 3 of the [personal development loop](personal-development-loop.spec.md): the deterministic Go
binary that decides every status change, freshness question and next step for the loop, released and
signed from this repository.

## Context

The parent feature document is the requirement. Its
[Deterministic core](personal-development-loop.spec.md#deterministic-core-the-vh-adlc-binary) section
defines the seven commands, the gate conditions, the freshness rules, the output contract and the
binary's place in the repository. Its [Docs changes](personal-development-loop.spec.md#docs-changes-phase-1)
section and the pinned standard define the rules block the binary reads. This document does not repeat
those sections. It adds the implementation decisions they leave open, the binary's own criteria, its
Test Plan and its tasks. Where this document and the parent disagree, the parent wins and the
disagreement is a finding.

The parent's task T12 makes this a child feature with its own document and PR. Its criteria AC-23,
AC-24 and AC-27, and the binary halves of AC-04, AC-09 and AC-16, are proven here. The parent pins
`vhco-pro/docs` at `e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a` (parent D-28), and the conventions below
are read at that revision.

Measured on 2026-10-17:

- The repository holds no Go code yet: `git ls-files` lists `.claude-plugin/marketplace.json`,
  `.gitignore`, `README.md`, `docs/specs/` and `plugins/github-app-registration/`.
- `go.dev/dl/?mode=json` lists `go1.27.2` as the newest stable release.
- `proxy.golang.org/go.yaml.in/yaml/v3/@v/list` ends at `v3.0.5`.
- The latest `golangci/golangci-lint` release is `v2.15.0`.
- `michielvha/template-go-app` at `9a9321c` has `.golangci.yml` (version 2; govet, errcheck,
  staticcheck, unused, gocritic; gofumpt, goimports, gci, gofmt), `.goreleaser.yml`, `gitversion.yml`,
  a `Dockerfile` and `.github/workflows/build-and-release.yaml`, which pins the shared actions at `@main`
  and carries a "TODO: add lint / test / scanning steps here" line. It has no `go.mod` and no Go source.
- `michielvha/gitversion-tag-action` at `8cf5869` takes `configFilePath` (empty uses the config shipped
  with the action), `prefix`, `dry-run` and `tagMessage`, and its bundled `gitversion.yml` uses
  `GitHubFlow/v1` with Conventional Commit bump messages.
- `michielvha/goreleaser-action` at `a86fcdf` requires `github-token` and `pgp-private-key`, defaults
  `go-version` to `1.25.11`, and runs `golangci-lint` with `continue-on-error: true` before GoReleaser.
- The `PGP_PRIVATE_KEY` secret exists on `michielvha/vh-adlc` (`gh secret list`, set 2026-10-17).

## Scope

In scope: the Go module at the repository root; the seven commands and a `--version` flag; their unit,
fixture and golden tests; the output JSON Schema; the lint configuration; CI and release workflows;
GoReleaser configuration; the committed public release key; the README section on verifying a release;
the first signed release and the recorded version and digests.

Out of scope, by name: the plugin package, its lock file, the installer script and the checker, which
are parent tasks T13 to T19 (the lock is written by parent T17 from the values this feature records);
Windows builds; a container image; any GitHub call from the binary; a `vh-adlc` subcommand beyond the
parent's seven.

## Design

### Toolchain and module

`go.mod` declares `module github.com/michielvha/vh-adlc` and `go 1.27.2`. The only dependency is
`go.yaml.in/yaml/v3` v3.0.5, for the frontmatter and the rules block; `gopkg.in/yaml.v3` is archived
and marked unmaintained. Command-line parsing uses the standard `flag` package with one `flag.FlagSet`
per command (see Invocation for argument order).

Packages under `internal/`: the parent's seven (`knowledge`, `doc`, `rules`, `gate`, `fresh`, `next`,
`review`) plus `gitcmd`, which runs Git and parses its output, `report`, which owns the JSON contract
and exit codes, and `testrepo`, a test helper that builds fixture repositories. `cmd/vh-adlc` holds
only `main.go` and its tests; `main.go` imports only the standard library and `internal/` packages,
parses flags, creates a `context.Context` with `signal.NotifyContext`, calls one package function and
writes its report. `knowledge` and `gitcmd` take that context, so an interrupt cancels a fetch or a
Git call.

`gitcmd` runs `git --no-pager` with `LC_ALL=C` and `GIT_OPTIONAL_LOCKS=0`, so `git status` never
rewrites the index. It fixes every setting that changes output shape on the command line: `-z` on every
command that lists paths, `--no-renames` on `git diff` and `git status`, and `-c core.quotePath=false`.
The user's other Git configuration still applies, because it does not change these outputs. Git is
never read through a library.

The lint configuration adapts the template's `.golangci.yml` as it is, because it already uses
version 2 with `linters` and `formatters` sections. The root `.gitignore` gains `/vh-adlc` and `/dist/`.

### Invocation

Every command except `--version` takes `--repo <dir>` (default `.`), `--plugin-pin <sha>` (required,
40 hexadecimal characters), `--offline`, and the test-only `--docs-source <path>`. `--repo` is resolved
to `git rev-parse --show-toplevel` before any path is read, and document paths are relative to that
root. The parent's table shows `--plugin-pin` only on `knowledge`; this is a deliberate extension,
because every document command resolves knowledge itself, so the phase-4 skills pass the pin on every
call. Flags may come before or after the positional arguments: each command parses its flag set, moves
the first remaining argument to its positional list, and parses again until no arguments remain, so
the parent's `review check <doc> --review R-<n> --returned <file>` order works as written.

```text
vh-adlc knowledge [--page <path>]...
vh-adlc find (--issue <n> | --slug <s>)
vh-adlc lint <doc>
vh-adlc gate <target-status> <doc>
vh-adlc fresh <doc>
vh-adlc next <doc>
vh-adlc review check <doc> --review R-<n> --returned <file>
vh-adlc --version
```

`--version` prints `vh-adlc <version>` and a newline, where the version is injected at build time with
`-X main.version`; an unreleased build prints `vh-adlc dev`. The parent's installer compares this line
with the locked version.

### Output

Every command except `--version` prints one JSON object and a newline, with keys in this order:
`schema_version` (1), `command`, `result`, `knowledge`, `data`, `findings`. `knowledge` holds
`revision`, `source` (`repository` or `plugin`), `pin_files` (the bridge files the pin was found in,
sorted; empty for the plugin pin), `override`, `rules_schema`, `feature_root` and `local_format`, or
`null` when resolution did not get that far. `data` is the command's answer. `findings` is an array of
objects with `code`, `message`, `path` and `line`, sorted by path, line and code; `path` is `""` and
`line` is `0` when they do not apply. Structs fix the key order, and no map is serialised or iterated
unsorted.

| `result` | Exit | Meaning |
| --- | --- | --- |
| `answered` | 0 | `knowledge`, `find`, `fresh` and `next` answered |
| `pass` | 0 | `lint`, `gate` or `review check` passed |
| `fail` | 1 | They failed; every failing check is a finding |
| `usage` | 2 | Bad arguments |
| `malformed` | 3 | The document or the rules block cannot be evaluated |
| `local-format` | 3 | The repository declares its own document format |
| `error` | 4 | Internal or IO error, including `default-branch-unknown` |
| `invalid-pin`, `missing-page`, `unreachable` | 5 | Knowledge not usable |

A document is `malformed` when its frontmatter, a required section, the Test Plan header or the Review
Log header cannot be found, or its status is not in the rules; these are the document-shape codes
below. Any other rule violation is a `fail` finding. `lint` reports every shape and lint finding it can
still compute, and its `result` is `malformed` when any shape finding is present, else `fail` or
`pass`. `gate`, `fresh` and `next` on a malformed document stop with `malformed`.

The `data` of each command:

| Command | `data` |
| --- | --- |
| `knowledge` | `pages`: the requested pages, each present at the revision |
| `find` | `documents`: matching document paths, sorted |
| `lint` | `document` |
| `gate` | `document`, `current`, `target`, `transition` (`allowed`, `not-allowed` or `re-check`), `failing` (condition names in the order the gate lists them), `line` |
| `fresh` | `default_branch`, `remote_sha` (or `null` with `remote: none`), `local_sha`, then for `spec_review` and `implementation_review` the `review`, `commit`, `stale` and `reasons`; and `feature_tree` with `clean` and `paths` |
| `next` | `action`, `rule` (its 1-based index in the block's `next` list) and `reason` |
| `review check` | `review`, `equal` |

`gate`'s `line` is the parent's status-commit line, so an operation copies it rather than composing it.
It reads `vh-adlc gate <target>: pass (rules <schema>, docs <sha7>)` or
`vh-adlc gate <target>: fail (<failing conditions, comma separated>; rules <schema>, docs <sha7>)`,
where `<sha7>` is the first seven characters of the resolved revision. `schema/vh-adlc.schema.json`
(JSON Schema 2020-12) describes this object and enumerates every `result` and finding code.

### Finding codes

The codes are API and are added only by a minor release. Knowledge: `invalid-pin`, `missing-page`,
`unreachable`, `rules-block-missing`, `rules-block-ambiguous`, `rules-schema-unknown`,
`rules-condition-unknown`, `rules-pattern-invalid`, `local-format`. Document shape:
`frontmatter-missing`, `frontmatter-field-missing`, `status-unknown`, `section-missing`,
`section-order`, `test-plan-header`, `review-log-header`. Lint: `id-malformed`, `id-duplicate`,
`id-recycled`, `test-plan-row-missing`, `test-plan-cell`, `task-criterion-unknown`,
`review-row-malformed`, `review-subsection-missing`, `review-records-malformed`, `review-records-mixed`,
`acceptance-review-unknown`, `covers-pattern-unsupported`. Freshness: `no-review`, `dirty-target`,
`commit-unreachable`, `baseline-changed`, `covered-drift`, `covered-changed`, `feature-tree-dirty`,
`default-branch-unknown`. Gate: `transition-not-allowed`, and one finding per failing condition whose
code is the condition's name (`no_open_questions`, `accepted` and so on). Review check:
`review-not-found`, `records-differ`. Usage: `usage`.

### Knowledge

The binary collects links of the form `https://github.com/vhco-pro/docs/blob/<ref>/` from the root
`AGENTS.md`, `CLAUDE.md` and `.github/copilot-instructions.md`, whichever exist. The parent's resolution
procedure then applies. Pages are read from
`https://raw.githubusercontent.com/vhco-pro/docs/<sha>/<page>` with a 10-second timeout. A 200 response
is cached at `os.UserCacheDir()/vh-adlc/docs/<sha>/<page>`, written to a temporary file in the same
directory and renamed into place. A 404 response is `missing-page`; any other status or a transport
error is `unreachable`. `--offline` reads the cache only, and a page absent from it is `unreachable`.
`conventions/feature-documents.md` is always read, because it holds the rules block. A page path must be
relative and clean (no `..`), or the command exits `usage`.

`--docs-source <path>` reads pages with `git -C <path> show <sha>:<page>` and sets `override: true`;
nothing is cached then. The base URL is a package variable that only tests replace, so no flag or
environment variable can point the binary at another host.

After the rules block parses, the feature root comes from the first `AGENTS.md` line matching
`feature_root.declaration`, else `feature_root.default`. A root `AGENTS.md` line matching
`local_format_declaration` sets `local_format: true` in `knowledge`, which still answers; every
document command then returns `local-format`.

### Rules

`internal/rules` finds the one fenced block whose info string is exactly `yaml vh-adlc-rules`, requires
`schema: 1`, compiles every value that starts with `^` with Go's `regexp` (RE2), and checks that every
condition named in `gates` and `next` is in the binary's vocabulary: the parent's twelve conditions.
A `next` rule's `status` is one status or a list, and its optional `when` is `<condition>` or
`not <condition>`. Nothing about statuses, sections, IDs, columns or verdicts is compiled in.

The capture groups the binary reads are part of schema 1, like the condition vocabulary: in
`criterion_line` and `task_line`, group 1 is the tick and group 2 the ID; in `record_criterion`, group 1
is the ID; in `feature_root.declaration`, group 1 is the path; in `residual_line`, group 1 is the
tracker. A pattern with fewer groups than this is `rules-pattern-invalid`. The standard does not yet
state this contract, which is a docs gap under the parent's hard rule 5; the proposed fix is one
sentence under the standard's Rules section, delivered with the next `vhco-pro/docs` change.

Record completeness uses only the patterns the block provides. A spec-review subsection is well formed
when every line matching `record_finding` is followed, before the next such line, by exactly one line
matching `record_severity`, or when its only non-blank line matches `record_no_findings`. The other
record fields are for people and are not parsed. An implementation record is a `record_criterion` line
whose next line matches `record_verdict`.

### Document model

`internal/doc` splits the frontmatter from the body and splits the body at `## ` headings outside
fenced code blocks. It extracts criteria with their folded text (the parent's folding rule), tasks,
the Test Plan table whose header equals `test_plan.columns`, Review Log rows, and each `### R-<n>`
subsection: the lines after the heading up to the next heading of any level, without leading and
trailing blank lines.

An annotation is a line matching `evidence_line` or `residual_line` plus every following line that
matches `criterion_continuation`, up to the next list item or annotation, so wrapped evidence is one
annotation. The normative baseline is the text of each `normative_sections` section and the YAML value
of each `normative_frontmatter` field, after two edits inside Acceptance Criteria: every criterion
checkbox is written as `[ ]`, and every annotation is dropped. Two commits have the same baseline when
these bytes are equal. The document at a reviewed commit is read with `git show <commit>:<path>`; if
it is absent there, the review is stale with `baseline-changed`.

`id-recycled`: the binary reads every version of the document from `git log --format=%H -- <doc>`,
oldest first. An ID present now that was present in one version and absent in a later one has been
recycled. Review IDs and criterion and task IDs are checked alike; acceptance rows are not counted.

`covers` entries are repository-relative. An entry ending in `/` matches its subtree, an entry with
`*`, `?` or `[` matches with `path.Match`, and any other entry matches that exact path. An entry
containing `**` is `covers-pattern-unsupported`.

`find --slug <s>` matches a document whose file name, up to its first `.`, equals `<s>`, so
`vh-adlc-binary` finds `vh-adlc-binary.spec.md` as well as `vh-adlc-binary.md`. `find --issue <n>`
matches a document whose `issue` is a URL ending in `/issues/<n>` or the string `#<n>`.

### Freshness and gates

`internal/fresh` implements the parent's freshness rules. A repository has a remote when `git remote`
prints anything. With a remote, the default branch is the target of
`git symbolic-ref refs/remotes/origin/HEAD`, and its absence is `default-branch-unknown`, whatever the
remote is called. With no remote, the local default branch is the one `git var GIT_DEFAULT_BRANCH` prints, which is
`init.defaultBranch` or the installed Git's built-in default; if that branch does not exist, the result
is `default-branch-unknown`. Nothing else is tried.

A reviewed commit is reachable when it exists and is an ancestor of `HEAD` in the worktree where
`fresh` runs (`git merge-base --is-ancestor`). A missing object or a non-ancestor, such as the commits
of a squash-merged branch, is `commit-unreachable`. Covered changes are
`git diff --name-only -z --no-renames <reviewed>...<remote default>` for spec reviews and
`git diff --name-only -z --no-renames <reviewed> HEAD` for implementation reviews, filtered by `covers`
in the binary. The feature tree is `git status --porcelain=v1 -z --no-renames --untracked-files=all`,
filtered the same way, without the document itself. Ignored files never appear.

`internal/gate` evaluates the conditions the block's `gates` map names for the target, plus the
transition, except when the target equals the current status. A target absent from `gates` checks the
transition only. Every failing condition is reported, never just the first. `internal/next` evaluates
the block's `next` rules in order and returns the first match.

`review check` compares the stored subsection with the returned file after removing leading and
trailing blank lines from both; every other byte must match.

### Tests

Fixture repositories are built in `t.TempDir()` by `internal/testrepo`. It runs Git with
`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, every inherited `GIT_*` variable removed,
`git init -b main --object-format=sha1`, `-c commit.gpgsign=false`, and fixed author and committer
names, emails and dates, so their commit SHAs are stable on any machine and golden files can contain
them. A fixture with a remote gets a bare repository as `origin` and `git remote set-head origin main`.
A fixture docs repository with two commits, A and B, differing in the default document location and
one gate rule, serves `--docs-source`.

`cmd/vh-adlc/golden_test.go` builds the binary once, runs every command twice per fixture with the same
cleaned Git environment, compares both runs byte for byte and with `testdata/golden/<case>.json`, and
checks the exit code; `-update` rewrites the golden files. A boundary test hashes every file in the
fixture, including `.git`, before and after running every command, with `XDG_CACHE_HOME` and `HOME`
pointed at a temporary directory, and fails on any change outside that cache. A `knowledge` test serves
pages from `httptest` and fails on any request whose path is not `/vhco-pro/docs/<40 hex>/<page>`.

The schema test uses `encoding/json` only: it checks that every golden output has exactly the
schema's required top-level keys and that every `result` value and finding code the binary defines
appears in the schema's `enum` lists. It does not claim full JSON Schema 2020-12 validation, so no
validator dependency is added.

### Delivery

`.github/workflows/ci.yml` runs on pull requests and on pushes to `main`: `gofmt -l` must print
nothing, then `go vet ./...`, `go test ./...`, `go build ./cmd/vh-adlc`, `golangci-lint config verify`
and `golangci-lint run` with golangci-lint v2.15.0. `.github/workflows/release.yml` runs on pushes to
`main` whose paths include `cmd/**`, `internal/**`, `go.mod`, `go.sum`, `.goreleaser.yml` or
`.github/workflows/release.yml`, and on `workflow_dispatch`. It checks out with `fetch-depth: 0` and
`persist-credentials: true`, which GitVersion and its tag push need, and repeats the CI gates. It then
runs `michielvha/gitversion-tag-action` at `8cf5869816cf71437052ac97d086e00526bf2d89` with its bundled
configuration (the bootstrap guide prefers bundled configuration; no `gitversion.yml` is committed) and
`prefix: v`, so tags such as `v0.1.0` are also Go module versions. The GoReleaser step runs only when
that step's `tagged` output is `true`. A binary-path push whose commits carry no version bump computes
an existing tag, which the action skips with `skip-reason=tag-exists`; that run then ends green with no
release and logs the skip reason. The GoReleaser step is `michielvha/goreleaser-action` at
`a86fcdf453812a9d69b85208c0cb6a1e73f136b8` with `go-version: 1.27.2`, the `PGP_PRIVATE_KEY` secret and
the workflow token, under `permissions: contents: write`. Every other action is pinned to a full SHA
with its release as a trailing comment.

`.goreleaser.yml` keeps the template's `CGO_ENABLED=0`, `-trimpath`, `mod_timestamp` and `signs` block,
builds darwin and linux on amd64 and arm64, sets `ldflags` to `-s -w -X main.version={{.Version}}`
(GoReleaser's `.Version` strips the tag's `v`, so tag `v0.1.0` prints `vh-adlc 0.1.0`), archives each
build as `vh-adlc_{{ .Version }}_{{ .Os }}_{{ .Arch }}.tar.gz` holding the `vh-adlc` binary, and names
the checksum file `checksums.txt`. The parent's signing design (D-27) applies as written.
`release-signing-key.asc` is the public export whose primary fingerprint is
`9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6`, and the README gains a section with that fingerprint and the
parent's verification steps.

The release can only happen after the feature PR merges, so completion takes one step after the merge.
The PR ships the document `in-progress` with AC-13 and AC-15 unticked. After the release, on the
feature branch fast-forwarded to the default branch, the loop records the version and, per platform,
the asset name, the asset's SHA-256 and the extracted binary's SHA-256, computed from the downloaded
assets rather than copied from `checksums.txt`. It then runs an implementation review against that
commit, which observes the published release. The released `vh-adlc gate complete` decides the flip,
and the docs-only completion commit is pushed to the default branch as a fast-forward under D-23. This
is the one exception to "the document returns to the default branch with the PR", and it exists
because a release cannot precede its own merge. Parent T17 copies the recorded values into the lock.

## Acceptance Criteria

- [ ] AC-01: Every command, run twice on the same fixture, prints byte-identical output and exits
      with the code the output table gives for its `result`; output carries no timestamp, random value
      or unsorted collection.
- [ ] AC-02: Every status, transition, section, ID, column, record and verdict rule the binary applies
      comes from the rules block at the resolved revision: with docs revisions A and B the same document
      gets different gate results and feature roots without a binary change. A missing, ambiguous or
      unknown-schema block, an unknown condition and an invalid pattern each exit `3` with their own
      code, and a repository declaring a local format gets `local-format`, exit `3`, from every document
      command.
- [ ] AC-03: `knowledge` resolves a single full-SHA repository pin as `repository`, no pin as `plugin`,
      and a short SHA, a branch name or two distinct SHAs as `invalid-pin`; a page absent at the pin is
      `missing-page` naming it; an unreachable host, or `--offline` with a cold cache, is `unreachable`;
      all three exit `5`. `--offline` with a warm cache answers, and `--docs-source` answers with
      `override: true`.
- [ ] AC-04: Running every command against a fixture leaves the fixture's files and Git state
      unchanged and writes only below the user cache directory, and the binary requests nothing but
      `vhco-pro/docs` pages at a full SHA.
- [ ] AC-05: For each gate target, a fixture failing each listed condition alone yields `fail` with
      exactly that condition, a fixture failing several lists all of them, a disallowed transition adds
      `transition-not-allowed`, a gate to the current status re-checks conditions only, and a passing
      gate's `line` and a failing gate's `line` each match the forms under Output.
- [ ] AC-06: A spec review is stale after a normative-baseline change or covered drift on the remote
      default branch, an implementation review is stale after a baseline change or a covered commit on
      the feature branch, and a missing row, a `+dirty` target, a missing reviewed commit or one that is
      not an ancestor of `HEAD` is stale with its own code. Checkbox, evidence (single-line or wrapped),
      residual, task, status and Review Log edits alone leave both fresh. A renamed covered path counts as
      changed under any Git configuration. Staged, unstaged and untracked covered changes fail `feature_tree_clean` with their paths,
      while the document itself and uncovered changes do not.
- [ ] AC-07: A spec review with a `blocking` finding is not clean and one with only `should-fix` or
      `nit` findings, or exactly `NO FINDINGS`, is; malformed or mixed records are not clean. An
      implementation review is clean only with exactly one record per current criterion, each with the
      exact folded text and a `met` verdict or a residualised criterion; a missing, extra or changed
      record is not. `review check` passes only when the stored records equal the returned file.
- [ ] AC-08: `lint` passes a conforming document and reports each lint finding code on a fixture made
      to trigger it, including an ID that was removed in one commit and reused in a later one.
- [ ] AC-09: `next` returns each rule's action on a fixture that first matches that rule, and an
      `in-progress` fixture whose latest spec review is fresh and blocking, or whose Open Questions are
      non-empty, returns `spec` or `owner decision` rather than `implement` or `ship`.
- [ ] AC-10: `find` returns every document under the feature root whose `issue` names the given issue
      number, or whose file name up to its first `.` is the given slug (including `<slug>.spec.md`), and
      an empty list otherwise.
- [ ] AC-11: Every golden output has exactly the top-level keys `schema/vh-adlc.schema.json` requires,
      and the schema enumerates every `result` value and finding code the binary can emit.
- [ ] AC-12: The repository follows the Go conventions at the parent pin: `cmd/vh-adlc` holds wiring
      only, logic is under `internal/`, the binary ignore is `/vh-adlc`, and CI runs the format, vet,
      test, build and both lint gates on every pull request and before every release, with every action
      pinned to a full SHA.
- [ ] AC-13: The first release publishes `vh-adlc_<version>_<os>_<arch>.tar.gz` for darwin and linux on
      amd64 and arm64, `checksums.txt` and `checksums.txt.sig`, and the signature verifies against the
      committed `release-signing-key.asc`, whose primary fingerprint is
      `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6`, by the README's steps.
- [ ] AC-14: The release workflow is triggered by pushes that change a binary path and by manual
      dispatch only, so a commit touching no binary path cuts no release, and a run whose computed
      version is already tagged ends without running GoReleaser.
- [ ] AC-15: The released linux/amd64 binary's `--version` prints exactly `vh-adlc <version>`, every
      released binary's build information names module `github.com/michielvha/vh-adlc` at `v<version>`
      with `vcs.modified=false`, and the version and both digests per platform are recorded for the
      parent's lock.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `go test ./cmd/vh-adlc -run Golden`: every command twice per fixture, byte comparison with each other and the golden file, exit code check |
| AC-02 | `go test ./internal/rules ./cmd/vh-adlc`: block-variant fixtures, revisions A and B through `--docs-source`, a local-format fixture for each document command |
| AC-03 | `go test ./internal/knowledge`: the pin variants, `httptest` 200 and 404 and a closed server, cold and warm cache with `--offline`, `--docs-source` |
| AC-04 | `go test ./cmd/vh-adlc -run Boundary` and the `httptest` request-path assertion |
| AC-05 | `go test ./internal/gate`: one fixture per condition per target, a multi-failure fixture, transition and re-check cases, the `line` format |
| AC-06 | `go test ./internal/fresh`: one fixture per stale reason (including a squash-merged reviewed commit and a missing object), each annotation-only edit (including wrapped evidence), a covered rename under `diff.renames` true and false, staged, unstaged and untracked covered and uncovered paths |
| AC-07 | `go test ./internal/gate ./internal/review`: record fixtures for each clean and unclean case, `review check` equal and differing files |
| AC-08 | `go test ./internal/doc`: a conforming fixture and one fixture per lint code |
| AC-09 | `go test ./internal/next`: one fixture per `next` rule, and the blocking-review and open-question resume fixtures |
| AC-10 | `go test ./internal/doc -run Find`: issue URL, `#<n>`, `<slug>.md`, `<slug>.spec.md` and no-match fixtures |
| AC-11 | `go test ./cmd/vh-adlc -run Schema`: each golden file's top-level keys against the schema's `required`, and the binary's code and result lists against the schema's `enum` lists |
| AC-12 | `go test ./cmd/vh-adlc -run Layout` (`cmd/vh-adlc` holds only `main.go` and `*_test.go`, `main.go` imports only the standard library and `internal/`, the `.gitignore` line), a Go test parsing both workflows for the gate steps and full-SHA `uses:` lines, and the first PR's CI run |
| AC-13 | On the first release, in an empty keyring: import `release-signing-key.asc`, confirm `gpg --show-keys release-signing-key.asc` lists `VHCO Pro (Release Signing Key) <release@vhco.pro>` as the first uid, confirm the fingerprint, `gpg --verify checksums.txt.sig checksums.txt`, `sha256sum --check --ignore-missing checksums.txt` over all four archives |
| AC-14 | A Go test parsing `release.yml`: its only triggers are `push` to `main` with exactly the binary paths listed under Delivery, and `workflow_dispatch`, and the GoReleaser step's `if:` requires the GitVersion step's `tagged` output to be `true`. The observed half (a plugin-only commit on the default branch produces no release run) is the parent's AC-27 proof, because every non-binary commit this feature pushes is docs-only and carries `[skip ci]` |
| AC-15 | Extract each archive of the first release; run the linux/amd64 binary with `--version`; `go version -m` on all four binaries; compute both digests per platform and record them in the T24 evidence line |

## Tasks

- [ ] T1 `go.mod`, `.gitignore`, `.golangci.yml` - module and `go 1.27.2`, `/vh-adlc` and `/dist/`
      ignores, the adapted lint configuration; `golangci-lint config verify` passes (AC-12)
- [ ] T2 `cmd/vh-adlc/main_test.go` - usage and `--version` cases; fails because there is no main
      package (AC-01, AC-15)
- [ ] T3 `cmd/vh-adlc/main.go`, `internal/report/` - flag sets, the output object, result and exit
      code mapping; T2 passes (AC-01, AC-15)
- [ ] T4 `internal/rules/rules_test.go` - block extraction, schema, condition vocabulary, pattern
      compilation, record completeness; fails because the package does not exist (AC-02, AC-07)
- [ ] T5 `internal/rules/rules.go` - T4 passes (AC-02, AC-07)
- [ ] T6 `internal/gitcmd/`, `internal/testrepo/` - Git runner and deterministic fixture builder, with
      a test that two builds of one fixture have the same commit SHAs (AC-01)
- [ ] T7 `internal/knowledge/knowledge_test.go` - pin variants, fetch, cache, offline, override, request
      paths; fails because the package does not exist (AC-03, AC-04)
- [ ] T8 `internal/knowledge/`, `cmd/vh-adlc/main.go` - T7 passes; `knowledge` wired (AC-03, AC-04)
- [ ] T9 `internal/doc/doc_test.go` - frontmatter, sections, criterion folding, tasks, Test Plan, Review
      Log, subsections, baseline normalisation, covers matching, every lint code, `find`; fails because
      the package does not exist (AC-08, AC-10)
- [ ] T10 `internal/doc/`, `cmd/vh-adlc/main.go` - T9 passes; `lint` and `find` wired (AC-08, AC-10)
- [ ] T11 `internal/fresh/fresh_test.go` - every stale reason, annotation-only edits, the feature tree,
      default-branch cases; fails because the package does not exist (AC-06)
- [ ] T12 `internal/fresh/`, `cmd/vh-adlc/main.go` - T11 passes; `fresh` wired (AC-06)
- [ ] T13 `internal/gate/gate_test.go` - every gate row, multi-failure, transitions, re-check, `line`,
      review cleanliness; fails because the package does not exist (AC-05, AC-07)
- [ ] T14 `internal/gate/`, `cmd/vh-adlc/main.go` - T13 passes; `gate` wired (AC-05, AC-07)
- [ ] T15 `internal/next/next_test.go` - one fixture per rule and the resume fixtures; fails because the
      package does not exist (AC-09)
- [ ] T16 `internal/next/`, `cmd/vh-adlc/main.go` - T15 passes; `next` wired (AC-09)
- [ ] T17 `internal/review/review_test.go` - equal and differing records, missing review; fails because
      the package does not exist (AC-07)
- [ ] T18 `internal/review/`, `cmd/vh-adlc/main.go` - T17 passes; `review check` wired (AC-07)
- [ ] T19 `cmd/vh-adlc/golden_test.go`, `cmd/vh-adlc/testdata/golden/` - golden, boundary, local-format
      and revision A/B cases pass (AC-01, AC-02, AC-04)
- [ ] T20 `schema/vh-adlc.schema.json` and its test - every golden file validates and every code is
      enumerated (AC-11)
- [ ] T21 `.github/workflows/ci.yml` and its parsing test - the CI gates pass on the feature PR (AC-12)
- [ ] T22 `.goreleaser.yml`, `.github/workflows/release.yml` and the trigger test -
      `goreleaser release --snapshot --clean` builds four archives and `checksums.txt` locally (AC-13,
      AC-14)
- [ ] T23 `release-signing-key.asc`, `README.md` - the public key and the verification section; the key's
      fingerprint matches (AC-13)
- [ ] T24 `docs/specs/vh-adlc-binary.spec.md` - first release: the PR merged by merge commit under its
      own approval, the release workflow run, the AC-13 and AC-15 checks run on the published assets,
      version and digests recorded here, the post-release implementation review and the completion
      commit described under Delivery (AC-13, AC-15)

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-17 | R-1 | spec | `af55148` | fable | procedural | Full review of the draft. Thirteen should-fix findings (argument order, schema validation, Git index writes, rename and config sensitivity, fixture isolation, default branch, reachability, slug matching, wrapped annotations, completion path, parent proofs, untagged releases, capture groups) and eight nits. Nothing blocking. |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Toolchain and module; Design, Invocation
EVIDENCE: docs/specs/vh-adlc-binary.spec.md:78-79 chooses "the standard `flag` package with one `flag.FlagSet` per command" and :102 keeps the parent's signature `vh-adlc review check <doc> --review R-<n> --returned <file>` with flags after the positional argument. Go's `flag` stops at the first non-flag argument: a scratch program with `fs.String("review", ...)` run as `doc.md --review R-1 --returned f` printed `review="" args=["doc.md" "--review" "R-1" "--returned" "f"]`, and only the flags-first order parsed. The same applies to `--repo` and `--plugin-pin` placed after `<target-status> <doc>`.
PROPOSAL: State the argument order the binary accepts (flags before positionals, matching `flag`), or state that the command splits positionals out before parsing so flags may follow them; the parent's signature row is then a disagreement to record.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Toolchain and module; Acceptance Criteria AC-11; Test Plan AC-11
EVIDENCE: :76-77 "The only dependency is `go.yaml.in/yaml/v3` v3.0.5"; :149 declares `schema/vh-adlc.schema.json` as JSON Schema 2020-12; AC-11 (:325-326) and its proof (:356) validate every golden file against it in `go test`. The Go standard library has no JSON Schema validator, so the proof needs either a second module dependency (test-only dependencies still appear in `go.mod`) or a hand-written validator for the 2020-12 subset the schema uses.
PROPOSAL: Either name the validator module as a second, test-only dependency and amend the "only dependency" sentence, or state that the test checks the schema's `enum` lists and the required keys with `encoding/json` alone and does not claim full 2020-12 validation.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Freshness and gates; Design, Tests; Acceptance Criteria AC-04
EVIDENCE: :231 reads the feature tree with `git status --porcelain=v1 -z --untracked-files=all`, :252-254 hashes "the fixture tree and `git status --ignored` before and after running every command", and AC-04 requires the fixture's "Git state unchanged". In a scratch repository, after an mtime change `git status --porcelain` rewrote `.git/index` (sha1 c7180e7c to b8faa181), while `GIT_OPTIONAL_LOCKS=0 git status --porcelain` left it unchanged. The commit-to-commit `git diff` forms at :229-230 do not touch the index, but the status call does, so a strict hash over `.git` fails on a run that did nothing wrong, and the parent's "never writes to the repository" is violated in `.git/index`.
PROPOSAL: Run Git with `GIT_OPTIONAL_LOCKS=0` (or `--no-optional-locks`) alongside `LC_ALL=C` and `--no-pager`, and say whether the boundary hash covers `.git` (it should, once the index is no longer rewritten).

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Freshness and gates
EVIDENCE: :229-230 compute covered changes with `git diff --name-only <reviewed>...<remote default>` and `git diff --name-only <reviewed> HEAD`, "filtered by `covers` in the binary". Rename detection is on by default (`diff.renames`), and the output then depends on the user's configuration: in a scratch repository a rename of `f` to `g` printed only `g` by default and `f` and `g` with `--no-renames` or `-c diff.renames=false`. A covered old path that was renamed away is therefore invisible on one machine and visible on another, which breaks AC-01's byte-identical output across environments and can hide covered drift. `git status --porcelain=v1 -z` likewise emits `R  k\0g\0` (two path records) for a staged rename, which the parser must handle or disable.
PROPOSAL: Pass `--no-renames` to both diff forms and to `git status`, and state that the binary runs Git with a fixed configuration (`GIT_CONFIG_GLOBAL`, `GIT_CONFIG_NOSYSTEM`, or explicit `-c` values) for every setting that changes output shape.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Tests
EVIDENCE: :244-247 make fixture SHAs stable with "fixed author and committer names, emails and dates" and then run `git remote set-head origin main`. Commit SHAs also depend on `init.defaultBranch` (the branch may be `master`), `init.defaultObjectFormat` (a sha256 repository), `commit.gpgsign` and `user.signingkey` from the developer's global or system Git configuration, and on `GIT_DIR`/`GIT_WORK_TREE` inherited from a hook environment. None is isolated in the design, so golden files containing SHAs pass on one machine and fail on another.
PROPOSAL: State that `internal/testrepo` runs Git with `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `git init -b main`, `-c commit.gpgsign=false`, and `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` fixed, and that the golden test clears inherited `GIT_*` variables before invoking the binary.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Freshness and gates (default branch)
EVIDENCE: :226-229 "The default branch is the target of `git symbolic-ref refs/remotes/origin/HEAD`. With no `origin` remote, the local default branch is ... `init.defaultBranch` if that branch exists, else `main`, else `master`, else `default-branch-unknown`." The parent (personal-development-loop.spec.md:353-355) says "A repository with no remote uses its local default branch" and "A clone that has a remote but no `refs/remotes/origin/HEAD` is an error (`default-branch-unknown`, exit `4`), never a guess." A repository whose only remote is `upstream` has a remote but no `origin`: the parent makes it an error, the child falls through to the local chain, and that chain (`main`, then `master`) is itself a guess.
PROPOSAL: Define "no remote" as `git remote` printing nothing, so any remote without `refs/remotes/origin/HEAD` is `default-branch-unknown` as the parent requires, and either drop the `main`/`master` fallback or record it as a deliberate extension of the parent's no-remote case.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Finding codes; Design, Freshness and gates
EVIDENCE: :162 lists `commit-unreachable`, and the parent (:365-366) says "a reviewed commit no longer reachable (for example after a squash merge): stale". The child never says reachable from what: existing in the object database (`git cat-file -e`), an ancestor of `HEAD` (`git merge-base --is-ancestor`), or an ancestor of the remote default branch. After a squash merge the commit usually still exists locally on the old feature branch, so the first reading never fires in the parent's own example, and the second and third disagree for a spec review on a feature branch.
PROPOSAL: Define `commit-unreachable` as "not an ancestor of `HEAD` in the worktree where `fresh` runs" (and say what happens when the object is absent altogether), and add that case to the AC-06 fixtures.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Output (`find`); Acceptance Criteria AC-10
EVIDENCE: :140 and :323-324 define `find --slug <s>` as documents "whose file name is the given slug". The standard's default location is `docs/internal/plans/<slug>.md`, but this repository's documents are `docs/specs/personal-development-loop.spec.md` and `docs/specs/vh-adlc-binary.spec.md`, so neither `vh-adlc-binary`, `vh-adlc-binary.spec` nor `vh-adlc-binary.spec.md` is unambiguously "the file name". The parent's `spec` and `resume` operations rely on `find` to avoid a second document (parent AC-08), so a miss here creates the duplicate the parent forbids.
PROPOSAL: Define the match as the file name with its `.md` extension removed and, if present, a trailing `.spec` removed (or state that the slug must be given with the extension), and add a `.spec.md` fixture to the AC-10 proof.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Document model (normative baseline)
EVIDENCE: :211-213 "every line matching `evidence_line` or `residual_line` is dropped" is the only edit to Acceptance Criteria before comparison. The parent's own evidence lines (personal-development-loop.spec.md:1066, 1070) are long single lines, and the parent's fixtures expect wrapped criterion text; a wrapped evidence line's second, indented line matches `criterion_continuation`, is not dropped, and therefore changes the baseline. Ticking a criterion with two-line evidence then marks the spec review and the acceptance stale, which contradicts the parent's "Checkbox, evidence/residual and Review Log annotation changes alone cause no staleness" (AC-16) and the child's AC-06.
PROPOSAL: Define an annotation as the `evidence_line` or `residual_line` plus every following line matching `criterion_continuation` up to the next list item or annotation, drop the whole annotation from the baseline, and add a wrapped-evidence fixture to AC-06.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Delivery; Tasks T24; Acceptance Criteria AC-13, AC-15
EVIDENCE: :280-282 and T24 (:404-406) record the first release's version and digests "in this document's evidence" after "the PR merged by merge commit". The release workflow runs only on pushes to `main` (:261-263), so AC-13 and AC-15 cannot be ticked before the merge, `all_met` fails, `gate complete` cannot pass, and the PR ships the document `in-progress` with a `branch` field. The delivery convention (conventions/delivery.md:36-42) and parent D-20 then say the document is edited only on its feature branch and returns to the default branch with the one PR; nothing in the child says how the post-merge evidence and the `complete` flip reach `main`.
PROPOSAL: State the path: for example, after the release the owner authorises a docs-only completion commit on the default branch carrying the `vh-adlc gate complete` line (procedural, since the binary that would decide it is the one being released), or a second docs-only PR, and record which as a deliberate exception to one-PR-per-feature.

FINDING: F-11
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-13, AC-14 (versus parent AC-27's proof)
EVIDENCE: The child claims AC-27 (:37-38). The parent's proof row (personal-development-loop.spec.md:1017) requires "confirm `gpg --show-keys release-signing-key.asc` lists `VHCO Pro (Release Signing Key) <release@vhco.pro>` as the first uid" and "a plugin-only commit on the default branch produces no release". The child's AC-13 proof (:358) checks the fingerprint, the signature and the digests but not the uid, and AC-14's proof (:359) is a Go test parsing `release.yml` triggers, an inference about GitHub's path filter rather than the observed non-release the parent asks for. Both are what R-17 F-01 and R-18 F-02 on the parent were about.
PROPOSAL: Add the `gpg --show-keys` uid check to AC-13's proof, and have AC-14's proof also observe that the docs-only evidence commit of T24 (which touches only `docs/specs/`) triggers no release run.

FINDING: F-12
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Delivery (release workflow)
EVIDENCE: :261-268 run `gitversion-tag-action` then `goreleaser-action` unconditionally on every push to `main` touching a binary path. In gitversion-tag-action at 8cf5869, `scripts/tag.sh` exits 0 with `tagged=false` and `skip-reason=tag-exists` when the computed tag already exists on the remote, which happens for any binary-path push whose commits carry no bump (a `docs(cmd):` or `test:` commit, or a Renovate PR squashed under a non-bumping subject). GoReleaser then runs `release --clean` on an untagged `HEAD` and fails ("git tag ... was not made against commit"), and before the first tag exists it fails for lack of any tag. The delivery convention asks to "surface failures instead of treating them as an absent release", but the document does not say which outcome is intended, and AC-14 only covers the trigger side.
PROPOSAL: Decide and state it: either guard the GoReleaser step on `steps.gitversion.outputs.tagged == 'true'` (no release when no version change) or accept the failed run as the signal; add the no-bump push to the Test Plan either way.

FINDING: F-13
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Rules
EVIDENCE: :190-194 say the binary compiles every `^` value and "Nothing about statuses, sections, IDs, columns or verdicts is compiled in", yet every extraction depends on capture-group positions the block does not document: `criterion_line` and `task_line` group 2 is the ID and group 1 the tick, `record_criterion` group 1 the ID, `feature_root.declaration` group 1 the path, `residual_line` group 1 the tracker (conventions/feature-documents.md:219-238). A future block revision that reorders or adds a group would silently change behaviour under the same `schema: 1`, and the standard names no group contract.
PROPOSAL: State the capture-group contract for schema 1 in Design (which group carries the ID, tick, path and tracker for each pattern), and report the missing statement to `vhco-pro/docs` as a docs gap per the parent's hard rule 5.

FINDING: F-14
KIND: judgement
SEVERITY: nit
WHERE: Design, Output (malformed versus fail)
EVIDENCE: :131-133 "Any other rule violation is a `fail` finding. `gate`, `fresh` and `next` on a malformed document stop with `malformed`." `lint` is not in that list, so a document with both a missing section and a duplicate ID has no stated `result` or exit code, and it is unstated whether `lint` keeps reporting after the first shape finding.
PROPOSAL: Add one sentence: `lint` reports every shape and lint finding it can still compute, and its `result` is `malformed` (exit 3) when any shape finding is present, else `fail` or `pass`.

FINDING: F-15
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-12; Tasks T21
EVIDENCE: :357 proves "no non-wiring code in `cmd/`" with `go test ./cmd/vh-adlc -run Layout`, but "wiring" is not something a test can decide without a rule.
PROPOSAL: Give the test a rule, for example: `cmd/vh-adlc` contains only `main.go` and `*_test.go`, and `main.go` imports nothing from outside the standard library and `internal/`.

FINDING: F-16
KIND: judgement
SEVERITY: nit
WHERE: Design, Invocation (versus parent Commands table)
EVIDENCE: :91-92 make `--plugin-pin <sha>` required on every command, while the parent's table (personal-development-loop.spec.md:316-322) shows it only on `knowledge` and gives `lint <doc>`, `gate <target-status> <doc>` and the others without it. The child's own rule (:34-35) is that a disagreement with the parent is a finding, and this one is not recorded as such.
PROPOSAL: Say explicitly that the pin flag is an extension of the parent's signatures because every command resolves knowledge itself, so the phase-4 skills pass it on every call.

FINDING: F-17
KIND: judgement
SEVERITY: nit
WHERE: Design, Output (`knowledge`)
EVIDENCE: :113-115 give `knowledge` the fields `revision`, `source`, `override`, `rules_schema`, `feature_root`, `local_format`. The parent's required one-line report (:149-150) is `Conventions: vhco-pro/docs@8b14a69 (repository pin, AGENTS.md)`, naming the file the pin came from, which no field carries.
PROPOSAL: Add a `pin_files` array (the bridge files in which the pin was found, sorted) to the `knowledge` object.

FINDING: F-18
KIND: judgement
SEVERITY: nit
WHERE: Design, Output (`gate` line)
EVIDENCE: :147-148 give the passing line `vh-adlc gate planned: pass (rules 1, docs e4d58d2)` but not the failing line, and the 7-character docs SHA is not fixed to a length (`git rev-parse --short` grows with repository size, which would break AC-01 across fixtures).
PROPOSAL: Give both forms (`pass` and `fail (<conditions>)`) and say the docs SHA is the first seven characters of the resolved revision.

FINDING: F-19
KIND: judgement
SEVERITY: nit
WHERE: Design, Delivery; Sources
EVIDENCE: :273 "GoReleaser's `.Version` drops the tag's `v`" and :76-77 "`gopkg.in/yaml.v3` is unmaintained" are Design claims with no Sources entry; Sources (:419-427) covers checksums, archives and signing but not the templates page or the yaml repository's archive notice. Release checkout details the workflow needs (`fetch-depth: 0` and `persist-credentials` for GitVersion and the tag push, which the template's workflow sets) are also not stated.
PROPOSAL: Add the GoReleaser templates page and the go-yaml archive notice to Sources, and name the checkout settings in the Delivery paragraph.

FINDING: F-20
KIND: judgement
SEVERITY: nit
WHERE: Tasks T24
EVIDENCE: :404 "T24 First release - the PR merged..." names no file, while the standard (conventions/feature-documents.md:113-114) says each task "names the file it touches"; the file is this document.
PROPOSAL: Write "T24 `docs/specs/vh-adlc-binary.spec.md` - first release: ...".

FINDING: F-21
KIND: judgement
SEVERITY: nit
WHERE: Design, Toolchain and module; Design, Knowledge
EVIDENCE: The Go convention (conventions/go.md:39-41) asks to pass context through operations that can block or time out; the child names a 10-second HTTP timeout (:172) but no `context.Context` on the fetch or on `gitcmd`, and `--repo <dir>` (:91-93) is not defined as the worktree root, although `git show <commit>:<path>` (:214) needs root-relative paths.
PROPOSAL: State that `knowledge` and `gitcmd` take a `context.Context` from `main` (`signal.NotifyContext`), and that `--repo` is resolved to `git rev-parse --show-toplevel` before paths are interpreted.

## Sources

- [Go downloads](https://go.dev/dl/?mode=json): `go1.27.2` is the newest stable release on 2026-10-17.
- [go.yaml.in/yaml/v3 versions](https://proxy.golang.org/go.yaml.in/yaml/v3/@v/list): `v3.0.5` is the newest.
- [golangci-lint releases](https://github.com/golangci/golangci-lint/releases): `v2.15.0` is the latest.
- [os.UserCacheDir](https://pkg.go.dev/os#UserCacheDir): `$XDG_CACHE_HOME` or `$HOME/.cache` on Linux, `$HOME/Library/Caches` on darwin.
- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore): `on.push.paths` runs a workflow only when a pushed commit changes a matching path.
- [GoReleaser checksums](https://goreleaser.com/customization/checksum/): `checksum.name_template` names the checksum file.
- [GoReleaser archives](https://goreleaser.com/customization/archive/): `formats` and `name_template` per archive.
- [Go 1.24 release notes](https://go.dev/doc/go1.24#go-command): `go build` stamps the main module's version from the version control tag; measured on 2026-10-17 with a tagged `-trimpath` darwin/arm64 build, `go version -m` printed `mod <module> v0.1.0` and `vcs.modified=false`, and no `-ldflags` line.
- [GoReleaser templates](https://goreleaser.com/customization/templates/): `.Version` is the version being released with the `v` prefix stripped.
- [go-yaml/yaml](https://github.com/go-yaml/yaml): archived, and its README opens with "THIS PROJECT IS UNMAINTAINED".
- [git(1) environment variables](https://git-scm.com/docs/git#_environment_variables): `GIT_OPTIONAL_LOCKS=0` stops optional sub-operations that take a lock, such as the index refresh `git status` performs; `GIT_CONFIG_NOSYSTEM` skips the system configuration.
- [git-config(1) environment](https://git-scm.com/docs/git-config#ENVIRONMENT): `GIT_CONFIG_GLOBAL` replaces the global configuration file.
- [git-var(1)](https://git-scm.com/docs/git-var): `GIT_DEFAULT_BRANCH` is the branch `git init` would create, from `init.defaultBranch` or Git's built-in default.
- [GoReleaser signing](https://goreleaser.com/customization/sign/): `artifacts: checksum` signs the checksum file as `${artifact}.sig`.
