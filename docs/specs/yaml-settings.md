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

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): one document per feature and the normative revision rule that shared audit follows.
- [Coding conventions on `vhco-pro/docs` main](https://github.com/vhco-pro/docs/blob/5f7c39a8f621d8b74e34d8da5f22ac90700c344a/conventions/coding.md): the current text and the section this feature extends.
- [Pinned prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): prose editing for this document.
