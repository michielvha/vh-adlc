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
| 2026-11-02 | R-1 | spec | `443b34d47ad543865cb2892ea12a3d5633924006` | claude-opus-5-5 | procedural | 11 findings, 0 blocking |

### R-1

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-01; Test Plan AC-01
EVIDENCE: AC-01 says the command "returns the parsed value of valid YAML", but Design refuses much valid YAML, such as `a: 1.5`, `a: &x 1` and a merge key, and AC-02 requires those refusals. Read literally the two criteria contradict. AC-01 also says nothing about sorted keys, date text or the safe integer range, and its proof names no accepted forms, so a table holding only `a: 1` ticks it. Stackweaver's triage.json has `"labels": []` and `"owned_labels": []`. A nil Go slice marshals to null, and `strings()` in plugins/vh-adlc/scripts/triage/settings.ts:19-20 fails on null, so a reader that passes such a table would break the first real file.
PROPOSAL: Restate AC-01 as "for input in the accepted forms, with no `--plugin-pin`, `data.value` equals the expected value, with keys sorted and dates as written". Name the accepted cases in the proof, including empty sequence and empty mapping, the safe range limits on both sides, and an unquoted date.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, accepted values
EVIDENCE: yaml-settings.md's R-2 table says F-11 is resolved "In settings-reader.md: fixed reasons and exact spellings", but these spellings are still open. A probe of go.yaml.in/yaml/v3 v3.0.5 Decoder into Node gave: `a:` Tag !!null Value ""; `~`, `Null`, `NULL` !!null; `+1`, `-0`, `007` !!int; `yes`, `no`, `on`, `off`, `y`, `n` !!str; `2026-11-02T10:00:00Z` and `2026-11-02 10:00:00` !!timestamp; `2026-1-2` !!timestamp; `2026-13-45` !!str; `a: <<` as a value !!merge; a key `2026-11-02:` !!timestamp. Design lists "`null`" and "decimal integers", refuses "other number or boolean spellings", and says "an unquoted date comes back as the text written". So `a:` is null on one reading and refused on another. `yes` is a string by tag but a refused boolean spelling by the prose. `007` and `+1` may or may not be decimal. A timestamp may or may not be a date, and a date key may or may not be a string key. Bun returned {"a":null} for `a:`, which is what a person would expect. Once released and locked, the accepted set is a contract with the plugin.
PROPOSAL: State the exact rule: for example, integers match `^-?(0|[1-9][0-9]*)$`; null is only `null`, or also the empty value; `yes` and friends stay strings or are refused; `!!timestamp` scalars come back as text, or only `YYYY-MM-DD` does; and timestamp keys are refused or not. Add each to the AC-01 or AC-02 table.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, refused forms; Test Plan AC-02
EVIDENCE: Design says "one document", but the refused list omits a second document, a non-mapping top level, a non-string key and an out-of-range integer, leaving them to "Anything else". The proof covers "each refused form". This matters because every existing caller uses `yaml.Unmarshal` (internal/doc/doc.go:171, internal/doc/find.go:73, internal/rules/rules.go:153), and in a probe `yaml.Unmarshal` into a Node on "a: 1\n---\n]\n" returned nil, silently dropping a second, broken document. A Decoder returned that document's syntax error on its second call. Decoder also returns a second null document for a trailing `---` ("a: 1\n---\n"), while "a: 1\n...\n" gives one. Earlier revisions recorded that Bun returns an array for two documents (a842b58:docs/specs/yaml-settings.md:52-53, and `bun -e` here gave [{"a":1},{"b":2}]), but this document's Context dropped that fact.
PROPOSAL: Add these forms to the refused list and the AC-02 table, including a second document and a trailing `---`, and say the reader decodes until EOF rather than stopping after the first document.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, node walk; AC-02
EVIDENCE: Design walks nodes and refuses "tags", and "Anything else is refused". The non-specific tag leaves no mark in the node tree. In the probe `a: ! 1` gave Tag !!int Style 0 Value "1", and `a: ! foo` gave !!str Style 0, the same as untagged scalars, while `!!str 1` and `!foo x` carry TaggedStyle. So a walk returns the integer 1 where Bun returned {"a":"1"}, which means the reader silently disagrees with another parser on that form. `%YAML 1.1` directives, a UTF-8 BOM and UTF-16 input are also accepted with nothing visible in the tree. AC-02's "each refused form" cannot be met for `!` by the stated mechanism.
PROPOSAL: Either add a small byte-level check for these forms, or state that refusal covers what the node tree shows and name `!` and directives as accepted exceptions. Do not leave `!` under "tags".

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, command contract
EVIDENCE: Design says the value is in "`data.value` of the usual JSON report" but leaves the rest of the contract open. It does not give the success result; internal/report/report.go has both `answered` and `pass`, each exit 0. It does not say what `data` holds on a refusal, how `settings read` without `--stdin` behaves, what a stdin read failure reports, whether a refusal stops at the first problem or lists all, what `path` holds, or that `knowledge` is null. `dispatch` (cmd/vh-adlc/main.go:158) gives usage only for the pin today. yaml-settings.md's loader consumes this report, and the standard treats finding codes and results as API, so the choices should be made here rather than by the golden file.
PROPOSAL: State `result` on success, `data` null on any refusal, `knowledge` null, usage without `--stdin`, `error` on a read failure, and one finding or all. Keep it to two or three sentences.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-02; AC-02
EVIDENCE: AC-02 is observed at the command: it needs result `malformed`, the code `settings-invalid` and, through `documentedExit`, exit 3. The proof is "Table tests for each refused form", and the only `cmd/vh-adlc` golden named is AC-01's. Package table tests cannot observe the result, exit code or the schema's code enum, which `TestSchema` checks (cmd/vh-adlc/schema_test.go). The harness cannot yet run either golden: `runBinary` (golden_test.go:72-78) sets no stdin, `goldenCase` (:98-101) holds only name and args, and `run` and `dispatch` (main.go:107,126) take no reader. AC-02 also says "no message holds text from the file", which is narrower than Design's "never includes text from the file", so text in `data` or `path` would pass the criterion.
PROPOSAL: Add a golden refusal report with a canary to the AC-02 proof, name the stdin harness change, and reword AC-02 to "no part of the report holds text from the file".

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Frontmatter covers
EVIDENCE: The standard says "`covers` lists every path whose change can affect the feature". The reader's accepted set and the Context's probes depend on tag resolution and error text in `go.yaml.in/yaml/v3 v3.0.5` (go.mod). A version bump changes behaviour with no covered path changing, so `fresh` would not see it.
PROPOSAL: Add go.mod and go.sum to `covers`.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Context
EVIDENCE: The claims themselves held. Bun 1.4.3 gave {"a":2} for a duplicate key and expanded an alias; decoding to a Node accepted a duplicate while a map gave `mapping key "a" already defined at line 1`; `a: *SECRETANCHOR` gave `yaml: unknown anchor 'SECRETANCHOR' referenced`; and no error carried a column. Three citations are weak. "(R-2 F-06)" names a finding in yaml-settings.md, and this document has no R-2. "A lock can name only a stable release" is cited to docs/internal/releasing.md, which does not say so and describes prerelease tags at line 17; the limit is the version regex at plugins/vh-adlc/scripts/ensure-vh-adlc.sh:43. "a probe" gives no command or output, which the standard asks for, and "The owner chose" gives no source, although it traces to Q3 at a842b58:docs/specs/yaml-settings.md:176.
PROPOSAL: Write "yaml-settings.md R-2 F-06", cite ensure-vh-adlc.sh:43 for the lock limit, and give the probe's calls or point at that finding.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Introduction; Scope
EVIDENCE: The introduction says "released as a binary", but neither Scope nor a criterion holds it, and every box can be ticked with nothing published. yaml-settings.md step 1 assumes the merge "publishes the stable binary". internal/report/codes.go:3 says finding codes "are added only by a minor release", and conventions/delivery.md makes `feat` the minor bump while `docs` does not normally bump, so the commit type decides whether the release exists and keeps that promise.
PROPOSAL: Say in Design that the change lands with a `feat` commit so `main` tags a stable minor, and note that yaml-settings.md AC-09 is what proves publication.

FINDING: F-10
KIND: judgement
SEVERITY: nit
WHERE: Design, refusals
EVIDENCE: "It gives a line number when the walk knows one" means a syntax error never has a line, because the walk does not run. Those are the likely failures in a hand-edited file: in the probe, `a:\n\t- b\n` gave `yaml: line 2: found character that cannot start any token` and `a: [1,\nb: 2\n` gave `yaml: line 2: did not find expected ',' or ']'`. The number holds no file text, and yaml-settings.md R-2 F-06's proposal allowed it.
PROPOSAL: Either take only the digits of the library's `line N` when present, or state that syntax refusals report line 0 on purpose.

FINDING: F-11
KIND: factual
SEVERITY: nit
WHERE: Document location
EVIDENCE: The pinned delivery.md says that until a document has a `branch` field it "is committed and pushed to the default branch". `git branch -a --contains 443b34d` lists only local `spec/host-cleanup`, seven commits ahead of origin/main. internal/fresh/fresh.go:154 requires the reviewed commit to be an ancestor of HEAD, so a rebase onto main makes this review stale with `commit-unreachable`.
PROPOSAL: Land the branch on main by fast-forward or merge, not rebase, before the acceptance row is relied on.
