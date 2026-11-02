---
status: draft
status_description: "Cut down and split on the owner's direction on 2026-11-02; every question is decided. R-2's blocker needs a new independent review."
issue: null
goal: "Every vh-adlc setting a person edits is YAML, Stackweaver has moved, and the pinned conventions forbid choosing JSON over YAML."
covers:
  - plugins/vh-adlc/scripts/settings-file.ts
  - plugins/vh-adlc/scripts/triage/settings.ts
  - plugins/vh-adlc/scripts/maintenance/settings.ts
  - plugins/vh-adlc/scripts/maintenance/authority.ts
  - plugins/vh-adlc/references/triage-settings.md
  - plugins/vh-adlc/references/maintenance-settings.md
  - plugins/vh-adlc/knowledge.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - plugins/vh-adlc/vh-adlc.lock.json
  - tests/vh-adlc/
  - AGENTS.md
  - docs/user-guides/workflows.md
---

# Plan: YAML settings

Moves the `.vh-adlc/` settings files from JSON to YAML in one step, because Stackweaver is the only
adopter, and adds the rule to the pinned conventions.

## Context

The owner decided on 2026-11-02 to standardize on YAML. Lock files, evidence, command output and other
generated JSON stay as they are.

- `loadSettings` reads `.vh-adlc/triage.json` (`plugins/vh-adlc/scripts/triage/settings.ts:76,80`), and
  maintenance reads `.vh-adlc/maintenance.json` (`plugins/vh-adlc/scripts/maintenance/settings.ts:66,70`).
  The standing grant reads the file from Git and needs `AGENTS.md` to link it
  (`plugins/vh-adlc/scripts/maintenance/authority.ts:95,97`).
- Both settings objects hold `settings_path`, and approved batches and open journals hash them
  (`settings.ts:106`, `settings.ts:121`, `execute.ts:318`, `journal.ts:129`).
- The confined triage controller reads a hash-checked `settings.json` export and parses no settings file
  itself (`plugins/vh-adlc/scripts/triage/controller.ts:101,120,143,287`).
- Stackweaver tracks both files and names them in `AGENTS.md`, `.claude/commands/`, `agents/`,
  `tests/agent-triage/` and `tests/agent-maintenance/` (`git grep`).
- `.vh-adlc/audit.json` is built but unmerged, on local `feat/shared-audit` at `7e161c5` and Stackweaver's
  `feat/shared-audit-migration`.
- The lock names 0.1.0 and needs a published stable release (`docs/internal/releasing.md`).

## Scope

In scope: the shared loader, the lock bump, YAML for triage and maintenance, Stackweaver's move, the
conventions rule and pin bump, and the exact change to shared audit.

Out of scope: the reader itself, which is [settings-reader.md](settings-reader.md); reading both formats;
a migration helper; any change to a setting's fields; enforcing a minimum plugin version beyond the
adapter stating it.

## Design

### Loader

`plugins/vh-adlc/scripts/settings-file.ts` finds `.vh-adlc/<name>.yaml`, from the working tree or a Git
blob, gets the binary from `ensure-vh-adlc.sh`, and sends the bytes to `vh-adlc settings read`. Tests with
an isolated `HOME` put the locked binary on `PATH`. With no settings file, defaults apply and no binary
is needed. The existing validators stay; the blob path keeps its current top-level key check.

`.vh-adlc/<name>.json` and `.yml` files fail, naming the expected path, because otherwise a repository
would silently run on defaults. An explicit `--settings` path must end in `.yaml`. `settings_path` stays
in the digests, so they change once at migration.

"Loading settings creates no files" (`references/triage-settings.md:39`) goes, because the installer can
fill its cache.

### Conventions rule

In `vhco-pro/docs`, `conventions/coding.md` gains this section before "Inputs and safety":

```markdown
## Configuration format

Configuration a person writes or reviews is YAML. Never choose JSON for it. Settings files we define use
the `.yaml` suffix and load strictly. A file an external tool defines keeps that tool's format. Generated
files and machine-to-machine output may be JSON.
```

### Order, one PR each

1. `settings-reader.md`, merged to `main`, which publishes the stable binary.
2. The `vhco-pro/docs` rule.
3. This feature's vh-adlc PR: lock bump, loader, the pin in `AGENTS.md` and `plugins/vh-adlc/knowledge.md`,
   and the plugin version bump. Its fixtures move to YAML.
4. Stackweaver's PR, paired with this feature as earlier adoptions were: finish open triage batches and
   maintenance runs first, convert both files by hand, update its references, and state the plugin
   version it needs in its adapter. An older plugin on that checkout is accepted.
5. Shared audit's revision, below.

### Shared audit

The revision belongs to the session on `feat/shared-audit`, and neither this feature nor its branch
changes it. There, after `git fetch origin main`: run `vh-adlc gate draft docs/specs/shared-audit.md`, edit
`status` only on a pass, and commit that alone with the gate's `data.line`. Then, at `7e161c5` line numbers:

- `shared-audit.md:262,268,616`: `.vh-adlc/audit.json` becomes `.vh-adlc/audit.yaml`, read through the
  shared loader. `covers` gains `plugins/vh-adlc/scripts/settings-file.ts`. Clear any criterion ticks, keep
  checked tasks, add new task IDs for the changes below, and get a new spec review and acceptance.
- vh-adlc: `scripts/audit/settings.ts:46,51`, `scripts/audit/authority.ts:95,145`,
  `references/audit-settings.md:3,43`, `examples/audit/basic/.vh-adlc/audit.json`,
  `docs/user-guides/workflows.md:73`, and `tests/vh-adlc/audit/`.
- Stackweaver: `.vh-adlc/audit.json`, `AGENTS.md`, `agents/audit-project.md`, `agents/codebase-audit.md`,
  `.claude/commands/audit.md` and `tests/agent-audit/`.

### R-2 findings

R-1's findings are superseded by R-2 and this cut.

| Finding | Outcome |
| --- | --- |
| F-01 | Split into one PR per piece: `settings-reader.md`, then this document. |
| F-02 | Owner direction: the adapter states the version; no tombstone or other enforcement. |
| F-03 | Requirement cut: the blob path keeps today's top-level key check. |
| F-04 | Requirement cut: finish open runs first, with no journal changes. |
| F-05, F-10, F-12, F-15 | Resolved by removal: no both-format period, notice or helper, and one ordered list. |
| F-06, F-11 | In `settings-reader.md`: fixed reasons and exact spellings. |
| F-07 | The loader uses the normal installer, and the `--offline` idea is gone. |
| F-08 | `.claude-plugin/plugin.json` added to `covers`. |
| F-09 | AC-06's proof names existing adapter tests only. |
| F-13 | Fixtures move to YAML, and the listing test is cut. |
| F-14 | Host cleanup now decodes its own manifest and shares nothing with this feature. |

## Acceptance Criteria

- [ ] AC-01: Triage and maintenance read `.vh-adlc/<name>.yaml` and produce the same validated settings as before,
      apart from `settings_path`.
- [ ] AC-02: A `.vh-adlc/<name>.json` or `.yml` file fails naming the expected path, and YAML the reader refuses
      fails visibly.
- [ ] AC-05: The maintenance standing grant holds from a merged `AGENTS.md` link to the YAML file.
- [ ] AC-06: Stackweaver runs triage and maintenance from YAML on its default branch, and its adapter states the
      plugin version it needs.
- [ ] AC-07: `conventions/coding.md` at the pinned revision carries the rule.
- [ ] AC-09: The plugin lock names a stable release with `settings read`, and a `.yaml` read with no binary fails.
- [ ] AC-10: On a YAML checkout, the confined triage controller receives equal settings through its export with no
      binary inside the boundary.
- [ ] AC-11: Shared audit reads only `.vh-adlc/audit.yaml`, after a new review and acceptance, and no `audit.json`
      reached a published plugin, a user guide or an adopter's default branch.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-02 | `tests/vh-adlc/triage/settings.test.ts` and `tests/vh-adlc/maintenance/settings.test.ts` on YAML, with a loader table for each refused file. |
| AC-05 | `tests/vh-adlc/maintenance/publication.test.ts` with a YAML adoption chain. |
| AC-06 | Stackweaver's `tests/agent-triage` and `tests/agent-maintenance` tests on its PR, then an installed-plugin run. |
| AC-07 | Read the rule through `vh-adlc knowledge`. |
| AC-09 | `tests/vh-adlc/ensure.test.ts` and `bun test tests/vh-adlc` against the bumped lock, plus a loader test with the installer failing. |
| AC-10 | A test in `tests/vh-adlc/triage/` runs `exportInputs` on a YAML checkout and starts the real `boundaryCommand`. |
| AC-11 | Read `shared-audit.md`'s review log, and inspect the plugin payload, the guide and Stackweaver's default branch. |

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

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md) and [delivery conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): one document and one PR per feature, and the revision rule that shared audit follows.
- [Coding conventions on `vhco-pro/docs` main](https://github.com/vhco-pro/docs/blob/5f7c39a8f621d8b74e34d8da5f22ac90700c344a/conventions/coding.md): the section this feature extends.
- [Pinned prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): prose editing.
