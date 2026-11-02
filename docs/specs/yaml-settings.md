---
status: draft
status_description: "R-1 found one blocker; factual findings are applied and judgement findings resolved. A new independent review must clear it."
issue: null
goal: "Every vh-adlc setting a person edits is YAML, adopting repositories have moved without losing a grant or a report, and the pinned conventions forbid choosing JSON over YAML."
covers:
  - cmd/vh-adlc/
  - internal/settings/
  - internal/report/
  - schema/vh-adlc.schema.json
  - plugins/vh-adlc/vh-adlc.lock.json
  - plugins/vh-adlc/scripts/settings-file.ts
  - plugins/vh-adlc/scripts/settings-migrate.ts
  - plugins/vh-adlc/scripts/triage/settings.ts
  - plugins/vh-adlc/scripts/triage/controller.ts
  - plugins/vh-adlc/scripts/triage/controller-recovery.ts
  - plugins/vh-adlc/scripts/triage/execute.ts
  - plugins/vh-adlc/scripts/maintenance/settings.ts
  - plugins/vh-adlc/scripts/maintenance/authority.ts
  - plugins/vh-adlc/scripts/audit/settings.ts
  - plugins/vh-adlc/scripts/audit/authority.ts
  - plugins/vh-adlc/examples/audit/
  - plugins/vh-adlc/references/triage-settings.md
  - plugins/vh-adlc/references/maintenance-settings.md
  - plugins/vh-adlc/references/triage.md
  - plugins/vh-adlc/references/audit-settings.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/knowledge.md
  - plugins/vh-adlc/plugin.json
  - tests/vh-adlc/
  - AGENTS.md
  - docs/user-guides/workflows.md
  - docs/reference/cli.md
---

# Plan: YAML settings

Moves the `.vh-adlc/` settings files from JSON to YAML, gives adopting repositories a checked migration,
and adds the rule to the pinned conventions.

## Context

The owner decided on 2026-11-02, while answering the [host cleanup](host-cleanup.md) questions, to
standardize on YAML, to rework the existing JSON settings, and that JSON is never picked over YAML
again. Host cleanup starts on YAML and shares two things with this feature, the `internal/settings`
package and the `dispatch` exemption from `--plugin-pin`, and whichever lands first adds both. This is a
separate document because it is a separate outcome: it changes shipped operations and their adopters, and has its own
release order.

- `loadSettings` reads `.vh-adlc/triage.json` with `JSON.parse`
  (`plugins/vh-adlc/scripts/triage/settings.ts:76,80`). Maintenance does the same for
  `.vh-adlc/maintenance.json` (`plugins/vh-adlc/scripts/maintenance/settings.ts:66,70`).
- The maintenance standing grant reads the file from committed Git objects and requires `AGENTS.md` to
  link that exact name (`plugins/vh-adlc/scripts/maintenance/authority.ts:95,97`).
- `.vh-adlc/audit.json` is specified in the accepted, in-progress
  [shared audit](shared-audit.md) feature, and it is built. `feat/shared-audit` at `7e161c5`, which is
  local and unpushed, has 38 tasks ticked and six open, and `/home/m/code/stackweaver-audit-migration` at
  `10f5a25c` has the adapter. Neither has merged, so no audit JSON file has shipped.
- Stackweaver is the only adopter this host shows (`ls /home/m/code/*/.vh-adlc`). It tracks
  `.vh-adlc/maintenance.json` and `.vh-adlc/triage.json` (`git ls-files .vh-adlc`) and names them in
  `AGENTS.md:14,16`, `.claude/commands/`, `agents/`, `tests/agent-triage/` and `tests/agent-maintenance/`,
  whose `contract.test.ts` files call `JSON.parse` on them (`:14` and `:8`).
- The file name is part of today's digests. Both loaders put `settings_path` in the normalized object
  (`plugins/vh-adlc/scripts/triage/settings.ts:106`, `plugins/vh-adlc/scripts/maintenance/settings.ts:121`).
  Triage hashes that object for approved batches (`execute.ts:318-319`), and an open maintenance journal
  compares it (`journal.ts:129,194`).
- A plugin older than this feature ignores a YAML file: triage falls through to defaults
  (`settings.ts:78-82`), which would drop Stackweaver's `protected_ids` silently, and its adapter has no
  minimum version check (`agents/issue-triage.md:7-8`).
- Binary and plugin versions are separate, and stable tags come only from `main`
  (`docs/internal/releasing.md`). `ensure-vh-adlc.sh` reads the lock version as `[0-9][0-9.]*`, so a
  prerelease cannot be locked.
- 32 files in this repository name those two files (`grep -rl`, excluding evidence), mostly tests and fixtures.
- Other JSON here is not hand-written settings: host-defined `plugin.json` and `marketplace.json`, the
  generated `plugins/vh-adlc/vh-adlc.lock.json`, `schema/vh-adlc.schema.json`, golden outputs, and the
  binary's one-object output (`internal/report/report.go:97`).
- Bun 1.4.3 has `Bun.YAML.parse`. On this host it returned the last value for a duplicate key, expanded
  aliases, and returned an array for two documents (`bun -e`). Strict settings need more than that.
  The Go binary has `go.yaml.in/yaml/v3` (`go.mod:5`).
- The binary owns no status: `gate` only decides, and the operation edits the status line after a pass
  (`plugins/vh-adlc/references/loop.md:77`). A planned or in-progress document moves to draft in its
  own commit on its feature branch before the revision
  (`plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md:88`).
- The confined triage controller never parses a settings file. `exportInputs` loads settings outside
  the boundary and writes the normalized result to `settings.json`
  (`plugins/vh-adlc/scripts/triage/controller.ts:101,120`), `verifyInputs` checks its hash (`:143`), and
  `serveReadOnly` reads it from `/input` (`:287`). The other `loadSettings` callers
  (`cli.ts`, `controller-recovery.ts:25`, `execute.ts:318`) also run outside the boundary.
- The pinned conventions have no format rule. `conventions/coding.md` only says to use structured
  parsers "for YAML, JSON, and tool output" (line 72 on `vhco-pro/docs` main at `5f7c39a`). The pin in
  `AGENTS.md` and `plugins/vh-adlc/knowledge.md` is the older `e4d58d2`.

## Scope

In scope: a strict `vh-adlc settings read` command, the binary release and lock bump that make it
available, one shared settings loader, YAML for triage and maintenance settings, reading both formats
until the next minor plugin version after Stackweaver migrates, a checked migration helper, Stackweaver's
migration and minimum plugin version check, the conventions rule and the pin bump that brings it here. The move of shared audit to
YAML is defined here and carried out as a revision of its own document.

Out of scope: changing any setting's fields or meaning, or `schema_version`; `.yml` as a second
spelling; and JSON we do not hand-edit. The owner confirmed that the lock, stored evidence, command
output, generated exports such as the controller's `settings.json`, schemas, golden files and file formats an
external tool defines stay JSON.

## Design

### Strict reader

`vh-adlc settings read --stdin` takes one file's bytes and returns its parsed value in `data.value`
of the usual JSON report. It knows nothing about repositories, so working-tree files and Git blobs
go through the same path. It needs no conventions, so `dispatch` exempts it from `--plugin-pin`, and
`docs/reference/cli.md` says so. Invalid input reports result `malformed`, exit 3, with the finding code
`settings-invalid`, naming the line, column and reason and never a value from the file.

The logic lives in `internal/settings`, which `vh-adlc clean` also uses for `.vh-adlc/cleanup.yaml` and
`host.yaml`. It decodes to `yaml.v3` nodes and walks them, because decoding to a node does not itself
reject duplicate keys. It accepts one document whose top level is a mapping, with string keys and with strings, plain
decimal integers, `true`, `false`, null, sequences and mappings as values. It refuses empty input,
aliases, anchors, merge keys, duplicate keys, explicit tags, floats and hex or octal integers, none of
which any setting uses. An unquoted date comes back as the text written, so the value matches what JSON
would have held. Mapping keys come back sorted, so their order in a file changes no digest.

### Shared loader

`plugins/vh-adlc/scripts/settings-file.ts` is the one place that finds a `.vh-adlc/<name>` file, from the
working tree or from a Git blob, and sends it to the strict reader. It obtains the binary the way
`engineeringInputs` does, through `ensure-vh-adlc.sh` (`plugins/vh-adlc/scripts/triage/controller.ts:158`).
Triage, maintenance and audit call it and keep their existing field validators. Maintenance's committed
path now runs the full validator on the blob's value, where `authority.ts:99-100` checks only top-level
keys today, so unknown keys fail the same way on both paths. The loader calls the installer with
`--offline`, because the operation already obtained the binary, so "Loading settings creates no files"
(`references/triage-settings.md:39`) stays true.

Format follows the file. A `.yaml` file goes to the strict reader and needs the binary. Until JSON reading
stops, a `.json` file stays on `JSON.parse` and needs no binary, so it keeps working exactly as today, and
reading it adds a report line naming the migration. With no settings file, defaults apply and no binary
is needed. A `.vh-adlc/<name>.yml` file fails, naming the expected path, because a person who writes one
would otherwise get a clean run with none of their settings. Audit has no JSON path.

Without an explicit path, the loader looks for `<name>.yaml`, then `<name>.json`, and both present is an
error naming the two files, so nobody edits the one that is ignored. An explicit `--settings` path picks
its format by suffix, and any suffix but `.yaml` or, until JSON reading stops, `.json` is refused.
`authority.ts` accepts an `AGENTS.md` link to whichever file the commit holds, and the grant still needs
that exact link and blob.

`settings_path` stays in the digests. Migration therefore changes them once, which is correct: it is a
settings change. A batch approved against the JSON file stops at `execute.ts:318` and needs approving
again, and an open maintenance journal reports `settings_changed`. Both fail closed. The migration step
below says to finish or abandon them first.

### Binary availability

The lock names 0.1.0, and a lock needs a published stable release, so this feature takes separate merges
to `main`. The first carries `settings read`, and its stable minor tag publishes the binary. The second
carries the lock bump with digests for all four platforms, the loader and the plugin version bump. The
last, after Stackweaver migrates, removes JSON reading. The bump moves every operation from 0.1.0 to that
release at once, so the full package suite and the installer tests run against the new lock before it
merges. A failed binary installation already stops status changes
(`plugins/vh-adlc/references/loop.md`); a `.yaml` read that cannot reach the binary fails visibly and never
falls back to another parser.

The confined controller has no binary and needs none: every `loadSettings` call runs outside the
boundary, and the confined process reads only the hash-checked normalized export. That export stays
JSON, because no person edits it. A test proves this path by running `exportInputs` on a YAML checkout,
starting the real boundary from `boundaryCommand`, and confirming `serveReadOnly` gets equal settings
with no binary inside. If that test fails, the export must change; a binary must not be bound in without
a new review of the boundary.

### Migration for adopting repositories

1. vh-adlc publishes the plugin version that reads both formats, and every host that runs the adopter
   installs it. Nothing changes for an adopter yet.
2. In each adopting repository, finish or abandon open maintenance journals and approved batches, then in
   one commit run `bun <plugin directory>/scripts/settings-migrate.ts --repo <dir>`. The helper writes the
   YAML with `Bun.YAML.stringify` to memory, sends those bytes through the strict reader, and compares the
   values with the JSON's. Only then does it write the YAML and remove the JSON. It lists every file that
   still names the old path, so update those references in the same commit. It changes nothing when the
   values differ, a `.yaml` file already exists, or the binary is unavailable.
3. The same commit makes the adapter refuse an older plugin. Stackweaver's entry points and contract tests
   require the plugin version from step 1, because an older plugin would silently run on defaults.
4. Stackweaver's list is `AGENTS.md`, `.claude/commands/{triage,maintenance}.md`,
   `agents/{issue-triage,maintenance,maintenance-project}.md`, `tests/agent-triage/` and
   `tests/agent-maintenance/`, including both `JSON.parse` calls. Its standing maintenance grant is re-read
   from the merged default branch, so the proof runs after the merge.
5. The next minor plugin version after Stackweaver's migration merges stops reading JSON and removes
   the JSON loader tests. A `.vh-adlc/*.json` settings file then fails with a pointer to the migration in
   `docs/reference/cli.md` and the settings references. A public adopter we cannot see gets that failure
   and the pointer.

Rollback before step 5 is reverting the adopter's commit, because the plugin still reads JSON.

### Shared audit revision

The owner chose to move audit to YAML now, accepting that shared audit returns to draft and needs review
and acceptance again. It is built, so the revision reaches further than its one-line setting. The document
and its branch belong to the session on `feat/shared-audit`, currently
`/home/m/code/vh-adlc-migration-roadmap` with uncommitted work, so this feature changes neither.

The status edit is not the binary's. On `feat/shared-audit`, after `git fetch origin main`, the spec
operation runs `vh-adlc gate draft docs/specs/shared-audit.md`, edits `status` only on a pass, runs
`lint`, and commits that move on its own with the gate's `data.line` in the body. `gate draft` passes
against this branch's older copy, but that result does not carry over.

Then `docs/specs/shared-audit.md` changes as follows, with line numbers at `7e161c5`:

| Where | Change |
| --- | --- |
| Frontmatter | Set a new `status_description`, and add `plugins/vh-adlc/scripts/settings-file.ts` and `plugins/vh-adlc/vh-adlc.lock.json` to `covers`. |
| Design, `:262` | Replace "strict schema-versioned `.vh-adlc/audit.json`" with `.vh-adlc/audit.yaml`, read through the shared loader with no JSON path, and name [yaml-settings.md](yaml-settings.md) as the dependency. |
| Design, `:268` | The example path becomes `.vh-adlc/audit.yaml`. |
| Design, `:616` | The Stackweaver adapter's path becomes `.vh-adlc/audit.yaml`. |
| Acceptance Criteria | The text stays. Clear any tick, `Evidence:` line and `Residual:` line, as a normative revision requires. |
| Tasks | Keep checked tasks, including T17, and add new task IDs after the highest on the branch, failing test first, for the changes in the next table. |
| Review Log | Keep the history. Earlier reviews become stale, and a new spec review and owner acceptance row are required before the document can return to `planned` and `in-progress`. |

Stored review records, such as those at `:999` and `:1008`, stay verbatim. The new tasks cover:

| Repository | Files | Change |
| --- | --- | --- |
| vh-adlc | `plugins/vh-adlc/scripts/audit/settings.ts:46,51` | Default path and parsing go through the shared loader. |
| vh-adlc | `plugins/vh-adlc/scripts/audit/authority.ts:95,145` | Replace both `JSON.parse` calls; the second compares committed text, so it compares parsed values or the raw bytes from the same read. |
| vh-adlc | `plugins/vh-adlc/references/audit-settings.md:3,43`, `plugins/vh-adlc/examples/audit/basic/.vh-adlc/audit.json`, `docs/user-guides/workflows.md:73` | New name, and the example is converted. |
| vh-adlc | `tests/vh-adlc/audit/{authority.test,fixtures,ledger.test,settings.test}.ts` | Fixtures write YAML, and a test confirms `audit.json` is not read. |
| Stackweaver, `feat/shared-audit-migration` | `.vh-adlc/audit.json`, `AGENTS.md`, `agents/audit-project.md`, `agents/codebase-audit.md`, `.claude/commands/audit.md`, `tests/agent-audit/{contract.test,preflight,preflight.test,rehearsal.test,rehearse}.ts`, `tests/agent-audit/manifest.json` | Rename the file, update references and rerun the contract, preflight and rehearsal. |

Audit's published bindings, trials and paired reviews that name the old path or blob are collected
again. No transition is needed, because no audit JSON has shipped.

### Delivery order

1. The `vhco-pro/docs` rule, which depends on nothing here. No repository sees it until its pin moves.
2. `settings read`, merged to `main`, and its stable binary release.
3. The lock bump, the shared loader, and the plugin version that reads both formats.
4. The pin bump to the rule's merge commit, in its own reviewed change, because it also brings the other
   commits between `e4d58d2` and that merge. It follows step 3 so the rule never requires YAML that no
   published plugin reads.
5. Shared audit's revision, review, acceptance and new tasks. Its publication waits for step 3, because
   its loader needs that binary.
6. Stackweaver's migration, including audit on its own branch.
7. The next minor plugin version, which stops reading JSON.

### Conventions change

In `vhco-pro/docs`, `conventions/coding.md` gains this section before "Inputs and safety":

```markdown
## Configuration format

Configuration a person writes or reviews is YAML. Never choose JSON for it, and move an existing JSON
configuration file of ours to YAML when you change it. Settings files we define use the `.yaml` suffix
and load strictly: one document, no aliases, and unknown or duplicate keys fail. A file an external tool
defines keeps that tool's format and spelling. Generated files and machine-to-machine output may be JSON.
```

Routing needs no change, because every code task already
reads `conventions/coding.md`. The change is a pull request in `vhco-pro/docs`.
The pin in `AGENTS.md` and `plugins/vh-adlc/knowledge.md` then moves to the merge commit with a plugin
version bump, as `knowledge.md` requires, at step 4 of the delivery order.

## Acceptance Criteria

- [ ] AC-01: Triage and maintenance read `.vh-adlc/<name>.yaml` and produce the same validated settings a JSON
      file with those values gave, apart from `settings_path`. Mapping order in the file changes no digest.
- [ ] AC-02: A YAML settings file with more than one document, an alias, a merge key, a duplicate key or an
      unknown key at any depth fails visibly, in the working tree and from a Git blob. A `.vh-adlc/<name>.yml`
      file fails naming the expected path, and an explicit path with any other suffix is refused.
- [ ] AC-03: A `.vh-adlc/*.json` settings file fails with a pointer to the migration, in a plugin version published
      after Stackweaver's migration merged. The evidence names the earlier published version, in which a
      JSON-only repository kept working without the binary, was told how to migrate, and a repository with
      both formats failed naming both.
- [ ] AC-04: `settings-migrate.ts` leaves a repository with equal parsed values, no JSON settings and a list of
      remaining references, and changes nothing when the generated bytes cannot be proven equal, a `.yaml` file
      exists or the binary is unavailable.
- [ ] AC-05: The maintenance standing grant holds from a merged `AGENTS.md` link to the YAML file, and fails
      when the link and the file disagree.
- [ ] AC-06: Stackweaver runs triage and maintenance from YAML settings on its default branch, with both sets of
      contract tests and rollback rehearsals passing, and an older plugin cannot silently run on that checkout.
- [ ] AC-07: `conventions/coding.md` at the revision this repository pins carries the configuration format
      rule, and no vh-adlc setting a person edits is JSON once the transition ends, while the lock, evidence
      and command output stay JSON.
- [ ] AC-08: `vh-adlc settings read --stdin` returns the parsed value for valid YAML and result `malformed` with
      `settings-invalid` for each refused form, with no conventions pin and no file value in any message.
- [ ] AC-09: The plugin lock names a stable release with `settings read` for all four platforms, every operation runs
      on it, and a `.yaml` read with no verified binary fails visibly without another parser.
- [ ] AC-10: On a YAML checkout, the confined triage controller receives settings equal to the outside load through
      its hash-checked export, with no binary inside the boundary.
- [ ] AC-11: Shared audit reads only `.vh-adlc/audit.yaml`, its document passed a new spec review and owner acceptance
      after returning to draft, and no `.vh-adlc/audit.json` reached a published plugin, a user guide or an
      adopter's default branch.
- [ ] AC-12: Reports written before the migration stay readable. A batch approved or a maintenance journal opened
      against the JSON file stops at its next check after the migration and changes nothing until approved
      or restarted.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | While both formats exist, parametrize `tests/vh-adlc/triage/settings.test.ts` and `tests/vh-adlc/maintenance/settings.test.ts` over both and compare everything but `settings_path`. Fixture copies of Stackweaver's JSON values stay as expected data after step 7. |
| AC-02 | Reader and loader table tests for each refused form, `.yml` and explicit suffixes. Validator tests for unknown keys on the working-tree path and the blob path. |
| AC-03 | At the final commit, a loader test that JSON fails with the pointer. The earlier behaviour is an evidence line naming the published plugin version and its test run, taken before step 7 removes those tests. |
| AC-04 | Helper tests on fixture repositories, including a value that YAML would read differently, plus a run on a disposable Stackweaver checkout. |
| AC-05 | Extend `tests/vh-adlc/maintenance/publication.test.ts` with YAML adoption chains and a mismatched link. |
| AC-06 | Stackweaver's `tests/agent-triage` and `tests/agent-maintenance` contract, preflight and rehearsal on the migration branch, a test that the older plugin version is refused, then an installed-plugin run from the published release, as earlier adoptions did. |
| AC-07 | Read the rule at the pinned revision through `vh-adlc knowledge`, and run a test that lists `.vh-adlc/*.json` across fixtures and this repository's examples. |
| AC-08 | `internal/settings` table tests for every form the reader refuses or accepts, including unquoted dates, comment-only input, non-string keys and a canary value absent from messages, and a `cmd/vh-adlc` golden report validated against the updated schema. |
| AC-09 | `tests/vh-adlc/ensure.test.ts` and the full `bun test tests/vh-adlc` against the bumped lock, plus a loader test with the installer failing. |
| AC-10 | A test in `tests/vh-adlc/triage/` runs `exportInputs` on a YAML checkout, starts the real `boundaryCommand` under Bubblewrap and compares what `serveReadOnly` loads. It also asserts no `loadSettings` call is reachable from `serve`. |
| AC-11 | Read `shared-audit.md`'s review log and acceptance row, run its gates on its branch, and inspect the published plugin payload, `docs/user-guides/workflows.md` and Stackweaver's default branch for the old path. |
| AC-12 | Extend the triage batch and maintenance journal tests with a settings file migrated mid-run, and read an existing report fixture after migration. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-02 | R-1 | spec | `5dbeab86b1c11bf1cd5affd42e0d5e50fd04d140` | claude-opus-5-5 | procedural | 18 findings, 1 blocking |
| 2026-11-02 | R-2 | spec | `3ebea55efee3e8eb9765ef805a0a47e11c4e1584` | claude-opus-5-5 | procedural | 15 findings, 1 blocking |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Shared loader; Acceptance Criteria AC-01; Test Plan AC-01
EVIDENCE: The design says "Digests stay bound to the parsed, normalized values, so converting a file changes no setting's meaning", and AC-01 requires equal normalized digests. The normalized object includes the file name: plugins/vh-adlc/scripts/triage/settings.ts:106 and plugins/vh-adlc/scripts/maintenance/settings.ts:121 both set settings_path. Triage hashes that whole object (`hash(config)`, execute.ts:54,241,254,319; `json(config)`, controller.ts:109,120-122). Maintenance drops only root (journal.ts:129), so `settings_changed` at journal.ts:194 turns true for an open journal after migration. In a scratch repository, identical content at .vh-adlc/a.json and .vh-adlc/a.yaml loaded through the real triage loadSettings gave settings_path values of .vh-adlc/a.json and .vh-adlc/a.yaml, and JSON.stringify equality was false. The default path also leaks in: with no file, settings_path was .vh-adlc/triage.json. So the Test Plan's digest comparison fails against the design as written.
PROPOSAL: Decide in the design whether settings_path leaves the digest input (and the export), or whether digests legitimately change on migration. State what happens to approved batches and open maintenance journals across the migration commit, then rewrite AC-01 to match. If a mapping's key order can change through the Go report, note that controller.ts:25 `json` is order sensitive.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-01, AC-03; Test Plan AC-01, AC-02, AC-03
EVIDENCE: feature-documents.md says "State the end state", and an implementation review needs executed evidence at one commit. AC-03 joins "a repository with only JSON keeps working" with "a .vh-adlc/*.json settings file fails". The first half is false at the final commit, and the second is false before it. AC-01 compares YAML with "the JSON file", and its proof parametrizes "over both formats", which cannot run once JSON reading is gone. The Test Plan's "test of the JSON-refusing release's behaviour" names no mechanism for testing that release before it exists.
PROPOSAL: Restate the criteria as end states, with the transition proved by named evidence at a named plugin release or tag. Alternatively split the JSON removal into its own feature, so each document's criteria hold at its final commit. Say which tests are removed at step 5.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Scope; Design, Migration step 4; Delivery order step 5; AC-03
EVIDENCE: docs/internal/releasing.md says "Plugin versions live in their manifests. The binary release version has its own sequence". Today plugin.json is 0.6.0, the lock is 0.1.0 and the latest tag is v0.8.0. Migration step 4 says "next minor plugin release", while Scope, Delivery step 5 and AC-03 say "next minor release". Migration step 1 releases the binary and the plugin that reads both formats as one step, but the lock needs the published asset digests. releasing.md gives stable tags only from main, and ensure-vh-adlc.sh reads the lock version with `[0-9][0-9.]*`, so a prerelease version cannot be locked. The Go change therefore has to reach main and be tagged before the lock bump and the loader can be tested. No section says this, or how many merges the feature takes.
PROPOSAL: Use "plugin version" everywhere the cutover is meant. Spell out the sequence: `settings read` merges to main, a stable minor tag publishes, then a separate change carries the lock bump, loader and plugin.json bump.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Migration steps 1 to 3
EVIDENCE: A plugin older than this feature treats a YAML-only repository as unconfigured. plugins/vh-adlc/scripts/triage/settings.ts:78-82 only reads the JSON path, and references/triage-settings.md:37 documents the defaults. A run on a scratch repository holding only a YAML-spelled file gave configured=false and protected_ids=[]. Stackweaver's settings set protected_ids to 332 and 334, used at settings.ts:185. Stackweaver's adapter has no minimum version check: agents/issue-triage.md:7-8 only handles a missing operation. Migration step 1 assumes the new plugin has been released but nothing requires it to be installed on every host, and Rollback covers only reverting the adopter's commit.
PROPOSAL: Require the adapter commit to refuse an older plugin, for example with a version check in the Stackweaver entry and contract test, and add a criterion or Test Plan row showing an old plugin cannot silently run on a YAML checkout.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Shared loader; AC-02; Test Plan AC-02
EVIDENCE: AC-02 says only that ".yml is not read". With a missing file the loader falls through to defaults (settings.ts:78-82). A scratch repository with .vh-adlc/triage.yml, loaded through the current loadSettings with no explicit path, gave `configured false protected []`. The spec keeps that branch, so a person who writes triage.yml gets a clean run with none of their settings. That spelling is likely, since this repository and the docs repository use .yml (.golangci.yml, .goreleaser.yml, .github/workflows/*.yml).
PROPOSAL: Make a `.vh-adlc/<name>.yml` file an error naming the expected path, in the working tree and from a blob, and change AC-02 from "not read" to "fails visibly".

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Shared loader and Binary availability; AC-03; AC-09
EVIDENCE: The loader "sends it to the strict reader", and "a settings read that cannot reach the binary fails visibly and never falls back to another parser". The spec never says whether .json files go through that reader or stay on JSON.parse. If they go through it, JSON that loads today can fail: a duplicate key is accepted by JSON.parse but refused by the reader, and `2.0` decodes as !!float in go.yaml.in/yaml/v3 v3.0.5 (probe run), which the accepted types exclude. That conflicts with "keeps working" in AC-03. If they stay on JSON.parse, AC-09's "without another parser" needs an exception. The spec also does not say whether a repository with no settings file, which needs no parsing today, must obtain the binary.
PROPOSAL: State the JSON path explicitly and whether it needs the binary, state the no-file case, and align AC-03 and AC-09 with that decision.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Design, Shared loader
EVIDENCE: The design describes only finding `.vh-adlc/<name>` by lookup order. All three loaders also take an explicit path (`options.settingsPath`). It is a live path, not an edge: triage cli.ts:30 passes `--settings`, references/maintenance-settings.md:92 documents `--settings`, and execute.ts:318 reloads with `settingsPath: config.settings_path` whenever the repository is configured. The spec does not say how an explicit path picks a format, whether an explicit .yml or .json is accepted or refused, whether the both-present check applies, or how a batch approved against triage.json behaves after the JSON file is removed.
PROPOSAL: Define the explicit path rules in the loader section and add the cases to the AC-02 and AC-03 loader table.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: AC-02; Test Plan AC-02, AC-03
EVIDENCE: AC-02 says an unknown key fails "in the working tree and from a Git blob". The reader "knows nothing" of fields, so the unknown key check lives in the validators, which the design keeps unchanged. The committed path, plugins/vh-adlc/scripts/maintenance/authority.ts:99-100, checks only top-level keys against `known`; nested keys such as an extra key in a `repositories` item are not checked from a blob. The Test Plan row "Loader table tests for each refused form" cannot prove unknown keys, because the loader does not validate fields.
PROPOSAL: Either run the full validator on committed settings in authority.ts and say so in the design, or narrow AC-02 to what each path does. Move the unknown key proof to validator tests on both paths.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Context; Design, Migration step 3; Test Plan AC-06
EVIDENCE: The spec lists Stackweaver's references as AGENTS.md, .claude/commands, agents and tests/agent-triage, and "Stackweaver's list is ...". `git grep` on Stackweaver origin/main also finds the whole of tests/agent-maintenance: README.md:8,36, contract.test.ts:8 (a second `JSON.parse` of the settings), :15, :19, manifest.json:12, preflight.ts:13, preflight.test.ts:22-23, rehearsal.test.ts:13, rehearse.ts:29. AC-06 covers triage and maintenance, but its proof runs only "Stackweaver's tests/agent-triage contract and rehearsal", so maintenance's contract and rollback could break with AC-06 proved.
PROPOSAL: Add tests/agent-maintenance to the Context and step 3 lists, and add its contract, preflight and rehearsal to the AC-06 proof.

FINDING: F-10
KIND: factual
SEVERITY: should-fix
WHERE: Design, Shared audit revision, second table
EVIDENCE: `git grep 'audit\.json' 7e161c5` also returns docs/user-guides/workflows.md:73, "Create `.vh-adlc/audit.json` and a project procedure". The vh-adlc rows of the table omit that file, and the AC-11 proof inspects only the plugin payload and Stackweaver's default branch. The customer guide could therefore keep telling people to create a file audit does not read. The other table rows, line citations (:262, :268, :616, :999, :1008, settings.ts:46,51, authority.ts:95,145) and the task counts (38 ticked, six open) checked out.
PROPOSAL: Add docs/user-guides/workflows.md:73 to the table and extend the AC-11 proof to cover it.

FINDING: F-11
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Conventions change
EVIDENCE: The proposed rule says "Configuration a person writes or reviews is YAML, in a `.yaml` file", and its exceptions cover only JSON. As written this applies to .golangci.yml and .goreleaser.yml here, .github/workflows/*.yml, and the docs repository's own .github/dependabot.yml. conventions/coding.md at 5f7c39a line 42 itself uses `.github/workflows/<file>.yml`. The spec calls `.yml` out of scope only for vh-adlc settings, but the rule binds every repository under the conventions.
PROPOSAL: Limit the `.yaml` spelling to settings files we define, or add an exception for files an external tool defines, so the rule does not make existing files violations.

FINDING: F-12
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Delivery order and Conventions change; AC-07
EVIDENCE: Delivery order has five steps and none of them is the pin bump, which AC-07 requires and which the Conventions change section places only "after it merges". The rule says to "move an existing JSON configuration file of ours to YAML when you change it". If the pin moves right after step 1, a change to .vh-adlc/triage.json is required to go to YAML while no released plugin reads it, until step 2 ships. The pin bump also brings in conventions/delivery.md, coding.md and documentation.md changes (`git diff --stat e4d58d2 5f7c39a`), with no step for acting on them.
PROPOSAL: Add the pin bump as a numbered delivery step, after the plugin that reads YAML is published.

FINDING: F-13
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter covers; Design, Strict reader
EVIDENCE: docs/reference/cli.md:26-36 lists every command, and :38 says "Every command above requires `--plugin-pin`". Adding `settings read` with a pin exemption changes that page, but it is absent from `covers`, and no criterion or proof touches it. docs/specs/host-cleanup.md lists docs/reference/cli.md in its covers for the same kind of change. The standard says covers lists every path whose change can affect the feature.
PROPOSAL: Add docs/reference/cli.md to covers and name the update in the design, including the migration pointer a public adopter reaches from the failure in step 4.

FINDING: F-14
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Strict reader; AC-08
EVIDENCE: A probe with go.yaml.in/yaml/v3 v3.0.5 showed behaviour the spec does not settle. Mapping keys arrive as !!int (`1:`), !!bool, !!null, !!float, !!timestamp and even a sequence, while JSON keys are always strings. Empty input and a comment-only file give EOF with no document, and `---` gives one null document. `010` and `0x10` are !!int while JSON has no such forms. An unused anchor (`x: &a 1`) and tags such as `!!str`, `!!binary` and `!foo` also decode without error. The spec does not name the report `result` for invalid input among the schema's values. It also does not say whether findings may echo file content, though the audit branch has a do-not-echo test (tests/vh-adlc/audit/settings.test.ts:65) and audit/cli.ts:94 forbids it.
PROPOSAL: State that mapping keys must be strings or are refused, how an empty input behaves, which integer forms and tags are accepted, the `result` value, and that `settings-invalid` messages never contain file values. Add them to the AC-08 table.

FINDING: F-15
KIND: judgement
SEVERITY: should-fix
WHERE: Frontmatter goal; Acceptance Criteria
EVIDENCE: The goal says adopting repositories move "without losing a grant or a report". AC-05 covers the grant, but no criterion or proof covers report continuity: history under report_dir, open maintenance journals (journal.ts:194, see F-01) and batches approved before the migration.
PROPOSAL: Add a criterion that existing reports stay readable and open runs have a defined outcome across the migration commit, or drop that clause from the goal.

FINDING: F-16
KIND: factual
SEVERITY: nit
WHERE: Design, Shared loader
EVIDENCE: The loader obtains the binary through ensure-vh-adlc.sh, which can download and write into the user cache. references/triage-settings.md:39 says "Loading settings creates no files", and audit/settings.ts:40 at 7e161c5 says "Reading settings performs no setup, permission refresh, or filesystem mutation". Both operations already obtain the binary first through references/loop.md, so the practical effect is small.
PROPOSAL: Call the installer with `--offline` from the loader, or update both statements.

FINDING: F-17
KIND: factual
SEVERITY: nit
WHERE: Context; Design, Strict reader
EVIDENCE: Context says host cleanup "needs nothing from this feature", but docs/specs/host-cleanup.md:178 says the two share `internal/settings` and "whichever feature lands first adds that package", and :333-334 says the package is one yaml-settings.md defines. "Like the cleanup commands" also assumes an exemption that does not exist if this feature lands first; `dispatch` has none today (cmd/vh-adlc/main.go).
PROPOSAL: Say the two features share the package and the pin exemption, and that whichever lands first adds both.

FINDING: F-18
KIND: judgement
SEVERITY: nit
WHERE: Design, Migration step 2; AC-04
EVIDENCE: Step 2 orders the helper as "writes each YAML file, confirms the parsed values equal the JSON's, removes the JSON", while AC-04 requires it to change nothing when equality cannot be proven. The spec names no writer and does not cover an existing .yaml file. `Bun.YAML.stringify` wrote the string "2026-11-02" as an unquoted `c: 2026-11-02` (`bun -e`, Bun 1.4.3), so equality depends on the reader's date rule.
PROPOSAL: Have the helper confirm the generated bytes before writing anything, name the writer, and define the existing-file and binary-unavailable cases.

### R-2

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Binary availability and Delivery order
EVIDENCE: The design says "this feature takes separate merges to main": settings read, then the lock bump, loader and plugin bump, then JSON removal after Stackweaver migrates, with the pin bump as a further reviewed change. The pinned conventions/delivery.md:42 says "One PR per feature or child feature, not per phase", and :41 says the document "is edited only on that branch and returns to the default branch with the PR". The merges cannot collapse into one PR: ensure-vh-adlc.sh:43 and the lock need a published stable tag before the loader can be tested, and AC-03 needs a plugin version published after Stackweaver's merge. So `gate complete` (all_met, impl_review_fresh) cannot pass until the last merge, and the same in-progress document with one `branch` must land on main at least twice. plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md says a merge ends the PR branch's lifetime, yet on_feature_branch_if_set still requires that branch. Nothing in the spec says how the document, its branch field or its reviews survive these merges.
PROPOSAL: Split the feature into child features with their own documents, criteria and gates: the reader and binary release, then the loader, lock and adoption, then JSON removal. If the owner prefers one document, raise it as an open question and change the delivery rule in vhco-pro/docs first, because this document cannot silently except itself.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Migration step 3; AC-06; Test Plan AC-06
EVIDENCE: Step 3 says "Stackweaver's entry points and contract tests require the plugin version", and AC-06 says an older plugin "cannot silently run on that checkout". The entry points are prose (agents/issue-triage.md), and that file says "the Codex adapter uses the shared operation without that command", so a direct operation run bypasses any prose check. tests/agent-triage on Stackweaver origin/main holds only README.md, contract.test.ts and rehearse.ts, and contract.test.ts only reads repository files, so nothing there sees the installed plugin. An older plugin's code cannot be changed. Running this tree's triage cli.ts `settings` on a scratch repository holding only .vh-adlc/triage.yaml gave configured False and protected_ids []. With a .vh-adlc/triage.json of {"schema_version":2} beside it, the old triage cli printed "invalid triage settings: schema_version must be 1", and maintenance failed the same way. So an old plugin can be stopped by repository content, but not by the check the spec names.
PROPOSAL: Name the executable enforcement point. Either keep a tombstone JSON file the old loader refuses, with matching exceptions to the both-present rule and AC-04, or narrow AC-06 to the entry routes that are actually checked and record the direct-operation gap.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, Shared loader; AC-02; AC-05
EVIDENCE: The design says "Maintenance's committed path now runs the full validator on the blob's value". The full validator in plugins/vh-adlc/scripts/maintenance/settings.ts is inline in loadSettings and reads the working tree: `path()` at :40-47 uses existsSync and statSync under root, kind "file" fails on a missing file (:44), and sync_workflow, source_references and surface_expectations evidence use it (:87, :109, :126). resolveStanding (authority.ts:90-97) today decides only from committed objects at the default commit, while config.root can be any older worktree. Validating the blob against the checkout means a source_references entry added on main makes an older checkout's grant `invalid`, through the catch at authority.ts, and an untracked local file can satisfy a committed setting.
PROPOSAL: State that the validator splits into a pure shape check, run on the blob, and filesystem checks that stay on the working-tree path or resolve paths in the same commit. Add both cases to the AC-05 proof.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Shared loader; AC-12; Test Plan AC-12
EVIDENCE: The design says an open maintenance journal "reports settings_changed. Both fail closed", and AC-12 says it "stops at its next check after the migration and changes nothing until approved or restarted". settings_changed is enforced only in report.ts:11 (`writable`) and report-candidate.ts:50. readRun (journal.ts:171-194) only computes the flag, appendRun (journal.ts:197-207) does not test it, and the cli `checkpoint` operation calls appendRun directly, including kinds `intent` and `receipt`. `grep settings_changed` over plugins/vh-adlc/references finds nothing, so the procedure gives no stop either. journal.ts and report.ts are not in `covers`. As designed, a journal can keep recording intents and receipts after migration, so AC-12 fails with no planned change to fix it.
PROPOSAL: Either make appendRun and the other journal writers refuse when settings_changed is true, adding those paths to covers, or narrow AC-12 to the operations that stop and state what happens to intents and receipts.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Shared loader; AC-03
EVIDENCE: The design says reading a .json file "keeps working exactly as today, and reading it adds a report line naming the migration", and AC-03 needs the repository to have been "told how to migrate". loadSettings returns only Settings, triage/cli.ts:32 and maintenance/cli.ts:47 print that object, and the whole object is hashed (execute.ts:241, journal.ts:129, controller.ts:109). The spec names no channel. A notice added to Settings would change the digests of every JSON repository on plugin upgrade, contradicting "exactly as today" and stopping open batches and journals that were not migrated.
PROPOSAL: Name the channel, for example stderr from the entry points or a field the reports take from a separate return value, and require that the notice stays out of the normalized object. Add a test that JSON digests are unchanged across the upgrade.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design, Strict reader; AC-08
EVIDENCE: The design says invalid input names "the line, column and reason and never a value from the file". A probe with go.yaml.in/yaml/v3 v3.0.5 Decoder into a Node gave no column in any parse error, and often no line: "yaml: found character that cannot start any token", "yaml: found unknown escape character", "yaml: found undefined tag handle". An unclosed flow on line 2 reported line 1 ("yaml: line 1: did not find expected ',' or ']'"). `a: *SECRETANCHOR` returned "yaml: unknown anchor 'SECRETANCHOR' referenced", which echoes file text. The report schema's finding has an integer `line` and no column field. Line and column come from Nodes only after a successful parse.
PROPOSAL: Promise line and column only for refusals found by the node walk, allow line 0 or the library's line for syntax errors, and map library errors to fixed reasons so no library text reaches a message. Add the unknown-anchor case to the AC-08 canary table.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Design, Shared loader; AC-09
EVIDENCE: The design calls the installer with --offline "because the operation already obtained the binary". That holds for the skills, whose procedures start at references/loop.md, but not for the operator path. references/triage-boundary.md:26-27 has a person run `bun <plugin>/scripts/triage/controller.ts start` directly, and that file has no installer step. In `start`, loadSettings at controller.ts:576 and exportInputs run before engineeringInputs, the only installer call in that path (:158). After the lock bump, a first controller start on a host without the new version cached fails on a `.yaml` checkout with "binary unavailable", before the online installer would have run. tests/vh-adlc/triage/acceptance.test.ts:213 also starts the controller with HOME set to a fixture root and a reduced PATH, so moving fixtures to YAML breaks it the same way.
PROPOSAL: Add an explicit installer step to the controller's start and resume paths and to triage-boundary.md before the first settings load. Keep --offline only in the loader, and name how the isolated test environments reach the binary.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter covers
EVIDENCE: The plugin version is in two manifests: plugins/vh-adlc/plugin.json:4 and plugins/vh-adlc/.claude-plugin/plugin.json:3. tests/vh-adlc/check.test.ts ("a package change comes with a version change") reads the .claude-plugin copy, and Stackweaver's tests/agent-maintenance/installed.test.ts writes both. `covers` lists only plugins/vh-adlc/plugin.json, while the design bumps the plugin version at least three times and AC-06 depends on it.
PROPOSAL: Add plugins/vh-adlc/.claude-plugin/plugin.json to covers.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-06
EVIDENCE: The proof names "contract, preflight and rehearsal" for both directories. Stackweaver origin/main has preflight.ts only under tests/agent-maintenance; tests/agent-triage has README.md, contract.test.ts and rehearse.ts.
PROPOSAL: Name the checks per directory, or add a triage preflight as part of the version check in F-02.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Design, Migration step 2
EVIDENCE: The helper writes "with Bun.YAML.stringify". On Bun 1.4.3, `Bun.YAML.stringify({a:[1,2],b:{c:"x"}})` returned the single line `{a: [1,2],b: {c: x}}`, and block style needs `Bun.YAML.stringify(value, null, 2)`. It would pass the equality check while leaving a file a person cannot comfortably edit, which is the point of this feature.
PROPOSAL: Name the call with an indent, and assert block style in the helper test.

FINDING: F-11
KIND: judgement
SEVERITY: nit
WHERE: Design, Strict reader; Test Plan AC-08
EVIDENCE: The probe resolved these as accepted tags: `True` and `TRUE` as !!bool; `~`, `Null` and `NULL` as !!null; `+1`, `-1`, `007`, `0b11` and `1_000` as !!int; `2026-11-02T10:00:00Z` as !!timestamp; and `9007199254740993` and `12345678901234567890` as !!int. The spec lists `true`, `false`, null, "plain decimal integers" and "an unquoted date", which leaves these open. The last two lose digits when the TypeScript caller runs JSON.parse on the report.
PROPOSAL: State the exact accepted spellings, whether timestamps count as dates, and refuse integers outside the safe range.

FINDING: F-12
KIND: judgement
SEVERITY: nit
WHERE: Design, Shared loader
EVIDENCE: With no settings file, today's normalized settings_path is .vh-adlc/triage.json (settings.ts:76,106; the scratch run printed that value). The spec says defaults apply but not which path the object carries once `.yaml` is looked up first. Changing it alters digests for unconfigured repositories on plugin upgrade, with no migration to explain it.
PROPOSAL: State the value for the no-file case, and include it in the AC-12 outcomes if it changes.

FINDING: F-13
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-01, AC-07
EVIDENCE: The AC-01 proof keeps "Fixture copies of Stackweaver's JSON values" after step 7, and the AC-07 proof runs "a test that lists .vh-adlc/*.json across fixtures". `git ls-files` shows tests/vh-adlc/triage/fixtures/migration/.vh-adlc/triage.json and tests/vh-adlc/maintenance/fixtures/migration/shared/.vh-adlc/maintenance.json. If those stay, the AC-07 test fails or needs an exception that weakens it.
PROPOSAL: Say the expected data moves out of `.vh-adlc/` paths, or name the exception in the proof.

FINDING: F-14
KIND: factual
SEVERITY: nit
WHERE: Context
EVIDENCE: This document says host cleanup shares "two things", the package and the dispatch exemption, and "whichever lands first adds both". docs/specs/host-cleanup.md:187-188 says it "shares only its strict Go parser" and that whichever lands first adds that package.
PROPOSAL: Align host-cleanup.md with this statement so neither document leaves the exemption to the other.

FINDING: F-15
KIND: judgement
SEVERITY: nit
WHERE: Design, Migration and Delivery order; Test Plan
EVIDENCE: Two numbered lists share step numbers with different meanings. "Rollback before step 5" refers to the Migration list, where step 5 stops JSON reading. "after step 7" in the AC-01 and AC-03 proofs refers to Delivery order, where step 5 is shared audit's revision.
PROPOSAL: Refer to steps by name, or prefix them, for example "delivery step 7".

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): one document per feature and the normative revision rule that shared audit follows.
- [Coding conventions on `vhco-pro/docs` main](https://github.com/vhco-pro/docs/blob/5f7c39a8f621d8b74e34d8da5f22ac90700c344a/conventions/coding.md): the current text and the section this feature extends.
- [Pinned prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): prose editing for this document.
