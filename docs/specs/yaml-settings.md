---
status: draft
status_description: "The owner answered all four questions on 2026-11-02 and they are folded in; waits for an independent spec review."
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
---

# Plan: YAML settings

Moves the `.vh-adlc/` settings files from JSON to YAML, gives adopting repositories a checked migration,
and adds the rule to the pinned conventions.

## Context

The owner decided on 2026-11-02, while answering the [host cleanup](host-cleanup.md) questions, to
standardize on YAML, to rework the existing JSON settings, and that JSON is never picked over YAML
again. Host cleanup starts on YAML and needs nothing from this feature. This is a separate document
because it is a separate outcome: it changes shipped operations and their adopters, and has its own
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
  `AGENTS.md:14,16`, `.claude/commands/`, `agents/` and `tests/agent-triage/`, where
  `contract.test.ts:14` calls `JSON.parse` on one.
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
until the next minor release after Stackweaver migrates, a checked migration helper, Stackweaver's
migration, the conventions rule and the pin bump that brings it here. The move of shared audit to
YAML is defined here and carried out as a revision of its own document.

Out of scope: changing any setting's fields or meaning, or `schema_version`; `.yml` as a second
spelling; and JSON we do not hand-edit. The owner confirmed that the lock, stored evidence, command
output, generated exports such as the controller's `settings.json`, schemas, golden files and file formats an
external tool defines stay JSON.

## Design

### Strict reader

`vh-adlc settings read --stdin` takes one file's bytes and returns its parsed value in `data.value`
of the usual JSON report. It knows nothing about repositories, so working-tree files and Git blobs
go through the same path. Like the cleanup commands, it needs no conventions, so `dispatch` exempts it
from `--plugin-pin`. It adds the finding code `settings-invalid`.

The logic lives in `internal/settings`, which `vh-adlc clean` also uses for `.vh-adlc/cleanup.yaml` and
`host.yaml`. It decodes to `yaml.v3` nodes and walks them, because decoding to a node does not itself
reject duplicate keys. It accepts one document with strings, integers, booleans, null, sequences and
mappings. It refuses aliases, merge keys and duplicate keys, and returns an unquoted date as the text
written, so the value matches what JSON would have held.

### Shared loader

`plugins/vh-adlc/scripts/settings-file.ts` is the one place that finds a `.vh-adlc/<name>` file, from the
working tree or from a Git blob, and sends it to the strict reader. It obtains the binary the way
`engineeringInputs` does, through `ensure-vh-adlc.sh` (`plugins/vh-adlc/scripts/triage/controller.ts:158`).
Triage, maintenance and audit call it and keep their existing field validators unchanged. Digests stay
bound to the parsed, normalized values, so converting a file changes no setting's meaning.

Until JSON reading stops, the loader looks for `<name>.yaml`, then `<name>.json`. Both present is an
error naming the two files, so nobody edits the one that is ignored. Reading JSON adds a report line
naming the migration. `authority.ts` accepts an `AGENTS.md` link to whichever file the commit holds, and
the grant still needs that exact link and blob. Audit has no JSON path.

### Binary availability

The lock names 0.1.0, so `settings read` needs a release and a lock bump with digests for all four
platforms. The bump moves every operation from 0.1.0 to that release at once, so the full package suite
and the installer tests run against the new lock before it merges. A failed binary installation
already stops status changes (`plugins/vh-adlc/references/loop.md`); a settings read that cannot
reach the binary fails visibly and never falls back to another parser.

The confined controller has no binary and needs none: every `loadSettings` call runs outside the
boundary, and the confined process reads only the hash-checked normalized export. That export stays
JSON, because no person edits it. A test proves this path by running `exportInputs` on a YAML checkout,
starting the real boundary from `boundaryCommand`, and confirming `serveReadOnly` gets equal settings
with no binary inside. If that test fails, the export must change; a binary must not be bound in without
a new review of the boundary.

### Migration for adopting repositories

1. vh-adlc releases the binary with `settings read` and the plugin version that reads both formats.
   Nothing changes for an adopter yet.
2. In each adopting repository, one commit: run
   `bun <plugin directory>/scripts/settings-migrate.ts --repo <dir>`. It writes each YAML file, confirms
   the parsed values equal the JSON's, removes the JSON, and lists every file that still names the old
   path. Update those references in the same commit.
3. Stackweaver's list is `AGENTS.md`, `.claude/commands/{triage,maintenance}.md`,
   `agents/{issue-triage,maintenance,maintenance-project}.md` and `tests/agent-triage/`, including its
   `JSON.parse` call. Its standing maintenance grant is re-read from the merged default branch, so the
   proof runs after the merge.
4. The next minor plugin release after Stackweaver's migration merges stops reading JSON. A
   `.vh-adlc/*.json` settings file then fails with a pointer to the migration. A public adopter we
   cannot see gets that failure and the pointer.

Rollback before step 4 is reverting the adopter's commit, because the plugin still reads JSON.

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
| vh-adlc | `plugins/vh-adlc/references/audit-settings.md:3,43`, `plugins/vh-adlc/examples/audit/basic/.vh-adlc/audit.json` | New name, and the example is converted. |
| vh-adlc | `tests/vh-adlc/audit/{authority.test,fixtures,ledger.test,settings.test}.ts` | Fixtures write YAML, and a test confirms `audit.json` is not read. |
| Stackweaver, `feat/shared-audit-migration` | `.vh-adlc/audit.json`, `AGENTS.md`, `agents/audit-project.md`, `agents/codebase-audit.md`, `.claude/commands/audit.md`, `tests/agent-audit/{contract.test,preflight,preflight.test,rehearsal.test,rehearse}.ts`, `tests/agent-audit/manifest.json` | Rename the file, update references and rerun the contract, preflight and rehearsal. |

Audit's published bindings, trials and paired reviews that name the old path or blob are collected
again. No transition is needed, because no audit JSON has shipped.

### Delivery order

1. The `vhco-pro/docs` rule, which depends on nothing here.
2. `settings read`, its release, the lock bump, the shared loader, and triage and maintenance reading both
   formats.
3. Shared audit's revision, review, acceptance and new tasks. Its publication waits for step 2, because
   its loader needs that binary.
4. Stackweaver's migration, including audit on its own branch.
5. The next minor release, which stops reading JSON.

### Conventions change

In `vhco-pro/docs`, `conventions/coding.md` gains this section before "Inputs and safety":

```markdown
## Configuration format

Configuration a person writes or reviews is YAML, in a `.yaml` file. Never choose JSON for it, and
move an existing JSON configuration file of ours to YAML when you change it. JSON stays only where we
do not choose the format: a file an external tool defines, generated files, and machine-to-machine
output. Load YAML settings strictly: one document, no aliases, and unknown or duplicate keys fail.
```

Routing needs no change, because every code task already
reads `conventions/coding.md`. The change is a pull request in `vhco-pro/docs`.
After it merges, the pin in `AGENTS.md` and `plugins/vh-adlc/knowledge.md` moves to the merge commit
with a plugin version bump, as `knowledge.md` requires. That bump also brings in the other commits
between `e4d58d2` and that merge, so it gets its own review.

## Acceptance Criteria

- [ ] AC-01: Triage and maintenance read `.vh-adlc/<name>.yaml` with the same results as the JSON file holding
      the same values, including normalized digests.
- [ ] AC-02: A YAML settings file with more than one document, an alias, a merge key, a duplicate key or an
      unknown key fails visibly, in the working tree and from a Git blob, and `.yml` is not read.
- [ ] AC-03: Until JSON reading stops, a repository with only JSON keeps working and is told how to migrate, and a
      repository with both formats fails naming both files. In the next minor release after Stackweaver's
      migration merges, a `.vh-adlc/*.json` settings file fails with a pointer to the migration.
- [ ] AC-04: `settings-migrate.ts` leaves a repository with equal parsed values, no JSON settings and a list of
      remaining references, and changes nothing when the values cannot be proven equal.
- [ ] AC-05: The maintenance standing grant holds from a merged `AGENTS.md` link to the YAML file, and fails
      when the link and the file disagree.
- [ ] AC-06: Stackweaver runs triage and maintenance from YAML settings on its default branch, with its
      contract tests and rollback rehearsal passing.
- [ ] AC-07: `conventions/coding.md` at the revision this repository pins carries the configuration format
      rule, and no vh-adlc setting a person edits is JSON once the transition ends, while the lock, evidence
      and command output stay JSON.
- [ ] AC-08: `vh-adlc settings read --stdin` returns the parsed value for valid YAML and `settings-invalid` for
      each refused form, with no conventions pin.
- [ ] AC-09: The plugin lock names a release with `settings read` for all four platforms, every operation runs on
      it, and a settings read with no verified binary fails visibly without another parser.
- [ ] AC-10: On a YAML checkout, the confined triage controller receives settings equal to the outside load through
      its hash-checked export, with no binary inside the boundary.
- [ ] AC-11: Shared audit reads only `.vh-adlc/audit.yaml`, its document passed a new spec review and owner acceptance
      after returning to draft, and no `.vh-adlc/audit.json` reached a published plugin or an adopter's
      default branch.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Parametrize the existing `tests/vh-adlc/triage/settings.test.ts` and `tests/vh-adlc/maintenance/settings.test.ts` over both formats and compare normalized digests. |
| AC-02, AC-03 | Loader table tests for each refused form, `.yml`, JSON only, YAML only and both present, plus a test of the JSON-refusing release's behaviour. |
| AC-04 | Helper tests on fixture repositories, including a value that YAML would read differently, plus a run on a disposable Stackweaver checkout. |
| AC-05 | Extend `tests/vh-adlc/maintenance/publication.test.ts` with YAML adoption chains and a mismatched link. |
| AC-06 | Stackweaver's `tests/agent-triage` contract and rehearsal on the migration branch, then an installed-plugin run from the published release, as earlier adoptions did. |
| AC-07 | Read the rule at the pinned revision through `vh-adlc knowledge`, and run a test that lists `.vh-adlc/*.json` across fixtures and this repository's examples. |
| AC-08 | `internal/settings` table tests, including unquoted dates, and a `cmd/vh-adlc` golden report validated against the updated schema. |
| AC-09 | `tests/vh-adlc/ensure.test.ts` and the full `bun test tests/vh-adlc` against the bumped lock, plus a loader test with the installer failing. |
| AC-10 | A test in `tests/vh-adlc/triage/` runs `exportInputs` on a YAML checkout, starts the real `boundaryCommand` under Bubblewrap and compares what `serveReadOnly` loads. It also asserts no `loadSettings` call is reachable from `serve`. |
| AC-11 | Read `shared-audit.md`'s review log and acceptance row, run its gates on its branch, and inspect the published plugin payload and Stackweaver's default branch for the old path. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-02 | R-1 | spec | `5dbeab86b1c11bf1cd5affd42e0d5e50fd04d140` | claude-opus-5-5 | procedural | 18 findings, 1 blocking |

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

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): one document per feature and the normative revision rule that shared audit follows.
- [Coding conventions on `vhco-pro/docs` main](https://github.com/vhco-pro/docs/blob/5f7c39a8f621d8b74e34d8da5f22ac90700c344a/conventions/coding.md): the current text and the section this feature extends.
- [Pinned prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): prose editing for this document.
