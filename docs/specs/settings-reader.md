---
status: draft
status_description: "Split from yaml-settings.md on 2026-11-02 so each piece is one PR; waits for a spec review."
issue: null
goal: "`vh-adlc settings read` turns a YAML settings file into a checked value, or refuses it, for the TypeScript operations."
covers:
  - cmd/vh-adlc/
  - internal/settings/
  - internal/report/
  - schema/vh-adlc.schema.json
  - docs/reference/cli.md
---

# Plan: Settings reader

A strict `vh-adlc settings read` command, released as a binary. [yaml-settings.md](yaml-settings.md) is
the next piece and depends on this release.

## Context

The owner chose a strict Go reader on 2026-11-02. `Bun.YAML.parse` took the last value of a duplicate key
and expanded aliases on Bun 1.4.3 (`bun -e`). A lock can name only a stable release, which comes from
`main` (`docs/internal/releasing.md`), so this has to merge and publish before the plugin can use it.
Decoding `yaml.v3` to a node does not refuse a duplicate key, while decoding to a map does (a probe on
`go.yaml.in/yaml/v3` v3.0.5). Its syntax errors carry no column, often no line, and can echo file text
(R-2 F-06).

## Scope

In scope: the `settings read` command and `internal/settings`. Out of scope: finding files, field
validation, and any change to the plugin or its lock.

## Design

`vh-adlc settings read --stdin` takes one file's bytes and returns the value in `data.value` of the usual
JSON report. It needs no conventions, so `dispatch` exempts it from `--plugin-pin`, and
`docs/reference/cli.md` says so.

It walks `yaml.v3` nodes and accepts one document with a mapping at the top, string keys, and values that
are strings, `true`, `false`, `null`, decimal integers in JavaScript's safe range, sequences or mappings.
An unquoted date comes back as the text written. Anything else is refused: empty input, duplicate keys,
aliases, anchors, merge keys, tags, floats and other number or boolean spellings. Mapping keys come back
sorted.

A refusal reports result `malformed` with the code `settings-invalid` and a fixed reason. It gives a line
number when the walk knows one, and never includes text from the file or from the library's error.

## Acceptance Criteria

- [ ] AC-01: `vh-adlc settings read --stdin` returns the parsed value of valid YAML with no conventions pin.
- [ ] AC-02: Each refused form reports `malformed` and `settings-invalid`, and no message holds text from the file.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `internal/settings` table tests and a `cmd/vh-adlc` golden report validated against the schema. |
| AC-02 | Table tests for each refused form, with a canary value, including an unknown anchor. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
