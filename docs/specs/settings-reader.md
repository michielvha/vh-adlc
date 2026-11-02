---
status: in-progress
status_description: "Implementing on feat/settings-reader, with the claim local to that branch at the owner's direction. Accepted at R-3; its findings are covered in the task list."
issue: null
branch: feat/settings-reader
goal: "`vh-adlc settings read` turns a YAML settings file into a checked value, or refuses it, for the TypeScript operations."
covers:
  - cmd/vh-adlc/
  - internal/settings/
  - internal/report/
  - schema/vh-adlc.schema.json
  - docs/reference/cli.md
  - go.mod
  - go.sum
---

# Plan: Settings reader

A strict `vh-adlc settings read` command, released as a binary. [yaml-settings.md](yaml-settings.md) is
the next piece and depends on this release.

## Context

The owner chose a strict Go reader on 2026-11-02, as Q3 of `yaml-settings.md` at `a842b58`. `Bun.YAML.parse` took
the last value of a duplicate key and expanded aliases on Bun 1.4.3 (`bun -e`). A lock can name only a
stable version (`plugins/vh-adlc/scripts/ensure-vh-adlc.sh:43`), so this has to merge and publish before the
plugin can use it. `yaml.Unmarshal` of `a: 1\na: 2` into a `yaml.Node` returned no error, while into a map
it did. Library syntax errors carry no column, often no line, and can echo file text (`yaml-settings.md`
R-2 F-06).

## Scope

In scope: the `settings read` command and `internal/settings`. Out of scope: finding files, field
validation, and any change to the plugin or its lock.

## Design

`vh-adlc settings read --stdin` takes one file's bytes and reports result `answered` with the value in
`data.value`, and `knowledge: null`. It needs no conventions, so `dispatch` exempts it from `--plugin-pin`,
and `docs/reference/cli.md` says so. Without `--stdin` it reports `usage`, and a failed read reports
`error`. The change lands with a `feat` commit, so `main` tags a stable minor release;
`yaml-settings.md` AC-09 proves publication.

It decodes until end of input and walks the `yaml.v3` nodes. It accepts one document with a mapping at the
top, string keys, and these values:

- strings, including `yes` and `no`, which YAML 1.2 reads as strings;
- `true` and `false`;
- `null` or an empty value;
- integers matching `^-?(0|[1-9][0-9]*)$` in JavaScript's safe range;
- a timestamp, which comes back as the text written;
- sequences and mappings, including empty ones, with keys sorted, so a comparison of values must ignore
  mapping order.

`-0` comes back as 0.

Anything else is refused: empty input, a second document including a trailing `---`, a top level that is not a
mapping, a key that is not a string, duplicate keys, aliases, anchors, merge keys, a `<<` value, explicit tags,
floats, and other number, boolean or null spellings. Refusal covers what the node tree shows, so a bare `!`,
a `%YAML` directive of a version the library accepts and a byte order mark are accepted.

A refusal reports result `malformed`, `data: null` and one finding with the code `settings-invalid` and a
fixed reason. Its line is the node's line, or the number from a library `line N` error, otherwise 0. No
part of the report holds text from the file or from the library's error.

## Acceptance Criteria

- [ ] AC-01: For input in the accepted forms, with no `--plugin-pin`, `vh-adlc settings read --stdin` reports
      `answered`, and `data.value` equals the expected value, with keys sorted and timestamps as written.
- [ ] AC-02: Each refused form reports `malformed` and `settings-invalid`, and no part of the report holds text from
      the file.
- [ ] AC-03: Without `--stdin` the command reports `usage`, a failed read reports `error`, and a refusal has `data: null`,
      one finding and the stated line.
- [ ] AC-04: `docs/reference/cli.md` names the command and its pin exemption.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `internal/settings` table tests naming each accepted form, including an empty sequence and mapping, both safe-range limits, `a:`, `-0` and an unquoted date. A `cmd/vh-adlc` golden report validated against the schema, after the golden harness gains stdin. |
| AC-02 | Table tests for each refused form, including a second document, a trailing `---`, a timestamp key, an out-of-range integer, `a: <<` and an unknown anchor. Every row carries a canary and asserts the code, the fixed reason and the canary's absence. One golden report for a walk refusal and one for the unknown anchor. |
| AC-03 | `TestUsage` for a missing `--stdin`, and the stdin harness for a failed read and a refusal's `data`, finding count and line. |
| AC-04 | A read of the page against the command. |

## Tasks

- [x] T1 `cmd/vh-adlc/golden_test.go` - let the golden harness pass stdin, as bytes or an open file, while existing cases pass none; `go test ./cmd/vh-adlc` passes with every golden unchanged (AC-01, AC-02, AC-03)
      Evidence: `go test ./cmd/vh-adlc` passed with every golden unchanged. No failing test first: this only adds a harness parameter, so no behaviour changed and T3 and T5 are its first users.
- [x] T2 `internal/settings/settings.go`, `internal/settings/settings_test.go` - parse one mapping into a value with sorted keys; a table covers strings with `yes` and `no`, `true`, `false`, `null`, `a:`, both safe-range limits, `-0`, an empty sequence and mapping, an unquoted date, a timestamp as written and nested collections, plus a block mapping with a comment and pretty-printed JSON text (yaml-settings R-5 F-01: JSON text stays accepted, so block style remains that feature's proof), and `a: ! 1`, `%YAML 1.1` and a byte order mark (R-3 F-03); `go test ./internal/settings` fails first because the package does not exist, then passes (AC-01)
      Evidence: `go test ./internal/settings` failed first with `undefined: Command`, then passed: 33 `TestAccepted` rows and `TestSortedKeys`. Pretty-printed JSON stays accepted, as Design has no refusal for it.
- [ ] T3 `internal/settings/settings.go`, `internal/settings/settings_test.go`, `internal/report/codes.go`, `schema/vh-adlc.schema.json` - add `settings-invalid` and refuse each form in Design with a fixed reason; every table row carries a canary and asserts the result, the code, the reason and the canary's absence from the whole report, and the rows include a second document, a trailing `---`, a timestamp key, an out-of-range integer, `a: <<`, an unknown anchor, an anchor and a tag on a key, on the root mapping and on a nested collection (R-3 F-02), and `%YAML 1.2` and `a: ! 007` (R-3 F-03); `go test ./internal/settings` fails on those rows first, then passes with `TestSchema` (AC-02)
- [ ] T4 `internal/settings/settings.go`, `internal/settings/settings_test.go` - report a refusal's line by the rule in Design; one table case per branch: a node's line (the second occurrence of a duplicate key, the offending key or value otherwise, and the document node for a whole document, so `a: 1\n---\n` gives 2), the library's number (`x: 1\nb: *.md\n` gives 2) and 0 (an unknown anchor, empty input) (R-3 F-01); `go test ./internal/settings` fails on those cases first, then passes (AC-03)
- [ ] T5 `cmd/vh-adlc/main.go`, `cmd/vh-adlc/main_test.go`, `cmd/vh-adlc/golden_test.go`, `cmd/vh-adlc/testdata/golden/` - wire `settings read --stdin` with no pin check, landing as a `feat` commit; goldens for an accepted file, a walk refusal and the unknown anchor pass `TestGolden` and `TestSchema`, and stdin-harness tests show `usage` without `--stdin`, `error` on a failed read, and on a refusal `data: null`, one finding and the line, with `knowledge: null` and an empty finding `path` on every report and a supplied `--plugin-pin`, even a bad one, ignored as the exemption (R-3 F-04); `go test ./cmd/vh-adlc` fails first because the command does not exist, then passes (AC-01, AC-02, AC-03)
- [ ] T6 `docs/reference/cli.md` - name `settings read --stdin` and state its `--plugin-pin` exemption, replacing the sentence that every command requires the pin; a read of the page against `vh-adlc settings read` agrees (AC-04)

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-02 | R-1 | spec | `443b34d47ad543865cb2892ea12a3d5633924006` | claude-opus-5-5 | procedural | 11 findings, 0 blocking |
| 2026-11-02 | R-2 | spec | `22769c05e7ba2e6f30b43b91a3f60ad9413c62f8` | claude-opus-5-5 | procedural | 4 findings, 0 blocking |
| 2026-11-02 | R-3 | spec | `d225d01622be32d9ec446a21bd15e910fea72585` | claude-opus-5-5 | procedural | 4 findings, 0 blocking |
| 2026-11-02 | R-3 | spec | `d225d01622be32d9ec446a21bd15e910fea72585` | n/a | n/a | accepted by owner |

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

### R-2

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design; Acceptance Criteria; Test Plan
EVIDENCE: Design makes commitments that neither criterion holds. "Without `--stdin` it reports `usage`, and a failed read reports `error`" has no criterion and no proof. AC-01 covers `answered` and the absent pin. AC-02 covers `malformed`, `settings-invalid` and file text. Neither states `data: null`, exactly one finding, or the line rule (node line, library `line N`, otherwise 0). "`docs/reference/cli.md` says so" also has no criterion. docs/reference/cli.md:26-36 lists the commands and :38 says "Every command above requires `--plugin-pin`". With both boxes ticked, the reference can omit `settings read` and keep that sentence, and a failed stdin read can come back as an empty-input refusal, while an implementation review rates only the two criteria. conventions/coding.md says "Unreadable input and failed commands must fail the check". yaml-settings.md's loader consumes this contract once it is released and locked, and internal/report/codes.go:3 treats codes as API.
PROPOSAL: Add a criterion for the command's edges: `usage` without `--stdin`, `error` on a failed read, and on a refusal `data: null`, one finding and the stated line, proved in `TestUsage` and the stdin harness. Add one for the reference page naming the command and its pin exemption, with a Test Plan row for each.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-02
EVIDENCE: AC-02 is per form: "Each refused form reports `malformed` and `settings-invalid`, and no part of the report holds text from the file." The proof is "Table tests for each refused form" plus "A golden refusal report with a canary value", so the canary is proved for one form only. The table tests have no stated pass condition for the text half. Refusals take two paths: the node walk, and the library error mapped to a fixed reason. A probe of go.yaml.in/yaml/v3 v3.0.5 gave the only file-text echo on the library path: `a: *SECRET` returned `yaml: unknown anchor 'SECRET' referenced`. `a: "\q SECRET"` and `a: !e!x SECRET` returned fixed text. A golden built on a walk refusal, such as a duplicate key, leaves that path unproved at the report. The standard says "A passing subset never upgrades a composite criterion".
PROPOSAL: State that every table row carries a canary and asserts the code, the fixed reason and the canary's absence from the produced finding. Require one golden for a walk refusal and one for a library refusal, the second being the unknown anchor.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design, accepted values and refusals
EVIDENCE: Three edges of the accepted set remain open. (1) "a `%YAML` directive ... accepted" is too broad: in a Decoder probe `%YAML 1.1` decoded, while `%YAML 2.0\n---\na: 1\n` returned `yaml: found incompatible YAML document`. (2) `-0` matches `^-?(0|[1-9][0-9]*)$` and resolves to !!int with Value "-0", but the expected value is unstated. A reader using ParseInt reports 0. One copying the text reports -0, and `Object.is(JSON.parse("-0"),-0)` is true under Bun 1.4.3. (3) `a: <<` as a value resolves to !!merge. Design refuses "merge keys" and accepts "strings", so a value falls to "Anything else" only if it counts as not being a string. `Bun.YAML.parse` gave "<<", and the `yes` reasoning points the same way. R-1 F-02 listed this spelling and the document did not settle it.
PROPOSAL: Say `%YAML` versions the library accepts. State that `-0` comes back as 0, or exclude it from the pattern. Name `a: <<` as refused or accepted, and add the last two to the AC-01 or AC-02 tables.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, accepted values; yaml-settings.md AC-01, AC-06
EVIDENCE: "with keys sorted" changes object order for the next document. plugins/vh-adlc/scripts/triage/settings.ts:96-98 copies `label_map` in input order and triage/cli.ts returns that object for `settings`. Stackweaver's .vh-adlc/triage.json has `bug`, `enhancement`, `documentation`, and so on, which is not sorted. Through this reader the same settings serialize in a different order, and `json` in triage/controller.ts:25 is plain `JSON.stringify`. yaml-settings.md's AC-06 proof says the `settings` output "must match apart from `settings_path`", which a byte diff would fail with no value changed. `label_map` has no other reader under scripts/triage, so behaviour is unaffected.
PROPOSAL: Note in Design that mapping order is not preserved, so comparisons of the value must ignore key order, and make the yaml-settings.md proofs compare parsed values.

### R-3

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, refusals; AC-03; Test Plan AC-03
EVIDENCE: Design says "Its line is the node's line, or the number from a library `line N` error, otherwise 0", and AC-03 requires "the stated line". Which node is not stated, and the obvious choice can name a line past the end of the file. A Decoder probe of go.yaml.in/yaml/v3 v3.0.5 gave, for `a: 1\n---\n` (two lines), DocumentNode line 2 and its null content node line 3. For `---\n` (one line) it gave DocumentNode line 1 and null node line 2. A duplicate key also has two candidate nodes. The rule has three branches, but the proof names only "a refusal's `data`, finding count and line", and the named goldens are a walk refusal and the unknown anchor, which cover the node line and 0. `a: *SECRET` returned `yaml: unknown anchor 'SECRET' referenced`, with no line. The `line N` branch has no named case, though `x: 1\nb: *.md\n` returned `yaml: line 2: did not find expected alphabetic or numeric character`. An implementation that reports 0 for every library error passes the named proof. The standard says "A passing subset never upgrades a composite criterion".
PROPOSAL: State the node: the second occurrence of a duplicate key, the offending key or value otherwise, and the DocumentNode's line for a refusal of a whole document. Name one AC-03 case per branch, for example `x: 1\nb: *.md\n` for the library line.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-02
EVIDENCE: Design refuses anchors and explicit tags everywhere, but the proof's named rows do not reach key or collection positions. In a probe, `&x a: 1` gave a key node with Tag !!str and Anchor "x", and `!!map {a: 1}` gave a mapping with Tag !!map and Style 33, while `a: !!str 1` gave Style 1 on the value. A walk that tests only scalar values passes every value row and accepts both forms, because the first key is still a string key and the second mapping is still a mapping.
PROPOSAL: Add rows for an anchor on a key, a tag on a key, and a tag or anchor on the root mapping and on a nested collection.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design, accepted values and refusals; Test Plan AC-01
EVIDENCE: "a `%YAML` directive of a version the library accepts" means exactly one version. In the probe `%YAML 1.1` decoded, while `%YAML 1.2`, `%YAML 1.3` and `%YAML 2.0` each returned `yaml: found incompatible YAML document`. So a file declaring the version this Design reasons from ("which YAML 1.2 reads as strings") is refused, and only a file declaring 1.1 passes. The bare `!` has no stated value either. `a: ! 1` gave Tag !!int Value "1", so the reader returns the integer 1, while R-1 F-04 recorded that Bun returned "1". `a: ! 007` gave !!int Value "007", which fails the integer pattern, so a bare `!` is accepted only where the scalar under it is. AC-01 needs "the expected value", so the table's author decides these.
PROPOSAL: Say `%YAML 1.1` by number and name `%YAML 1.2` as refused. State that a bare `!` changes nothing, so `a: ! 1` returns 1 and `a: ! 007` is refused, and add these cases to the AC-01 and AC-02 tables.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, command contract
EVIDENCE: Design gives `knowledge: null` only for the success report. A refusal is specified as "result `malformed`, `data: null` and one finding", with no `knowledge` and no finding `path`, and the schema requires both keys (schema/vh-adlc.schema.json:7-14, :94-99). "`dispatch` exempts it from `--plugin-pin`" also leaves a supplied bad pin open: cmd/vh-adlc/main.go:158 reports `usage` for any other command, and AC-01 covers only "no `--plugin-pin`". yaml-settings.md's loader consumes these reports, and R-1 F-05 asked that such choices be made here and not by the golden file.
PROPOSAL: Add one sentence: every `settings read` report has `knowledge: null`, findings have an empty `path`, and a supplied `--plugin-pin` is ignored or still checked, whichever is chosen.
