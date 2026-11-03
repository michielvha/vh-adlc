---
status: in-progress
status_description: "Implementing on feat/yaml-settings, claimed locally and unpushed by the owner's instruction. The vhco-pro/docs rule, the pin move and Stackweaver's branch come after this repository's tasks."
issue: null
branch: feat/yaml-settings
goal: "Triage and maintenance settings are YAML, Stackweaver's move is reviewed, and the pinned conventions forbid choosing JSON over YAML. Audit is a known exception until its revision lands."
covers:
  - plugins/vh-adlc/scripts/settings-file.ts
  - plugins/vh-adlc/scripts/ensure-vh-adlc.sh
  - plugins/vh-adlc/scripts/triage/controller.ts
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
- `.vh-adlc/audit.json` is built but unmerged, on `feat/shared-audit` at
  `7e161c58ac2377e86503384744d3f03dc71f557a` in the clone `/home/m/code/vh-adlc-triage-spec`, and on
  Stackweaver's `feat/shared-audit-migration`.
- The lock names 0.1.0 and takes only a stable version (`plugins/vh-adlc/scripts/ensure-vh-adlc.sh:43`).

## Scope

In scope: the shared loader, the lock bump, YAML for triage and maintenance, Stackweaver's reviewed branch,
the conventions rule and pin bump. Audit is a known exception until its revision lands; this document
states the exact change but does not make it.

Out of scope: the reader itself, which is [settings-reader.md](settings-reader.md); reading both formats;
a migration helper; any change to a setting's fields; enforcing a minimum plugin version beyond the
adapter stating it. The maintenance declaration's `index_paths` stays a JSON array in a Markdown table, a
deliberate exception to the rule below.

## Design

### Loader

`plugins/vh-adlc/scripts/settings-file.ts` finds `.vh-adlc/<name>.yaml`, from the working tree or a Git
blob, gets the binary from `ensure-vh-adlc.sh`, and sends the bytes to `vh-adlc settings read`. Tests with
an isolated `HOME` put the locked binary on `PATH`. With no settings file, defaults apply and no binary
is needed. The existing validators stay; the blob path keeps its current top-level key check.

In the working tree, `.vh-adlc/<name>.json` and `.yml` files fail, naming the expected path, because
otherwise a repository would silently run on defaults. On the blob path a stale `AGENTS.md` link reports
`unadopted`, as it does today. An explicit `--settings` path must end in `.yaml`. `settings_path` stays in
the digests, so they change once at migration. With no settings file it reads `.vh-adlc/<name>.yaml`, so
an unconfigured repository's digests change once on plugin upgrade too: finish open runs before upgrading.

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
3. This feature's vh-adlc PR: lock bump, loader, `references/triage-settings.md` and
   `references/maintenance-settings.md` including the YAML example and the grant chain, the pin in `AGENTS.md`
   and `plugins/vh-adlc/knowledge.md`, and the plugin version bump. The implementer reads the conventions
   diff the pin brings in and records what applies. Its fixtures move to YAML, except those frozen from exact
   Stackweaver commits (`tests/vh-adlc/triage/fixtures/migration/`, the corpus in
   `tests/vh-adlc/maintenance/policy-corpus.ts`): those stay as recorded data, and test setup writes their
   values as YAML into the fixture checkout. Stackweaver's branch is reviewed against this candidate plugin
   before the PR merges: it converts both files by hand, updates its references, re-baselines
   `tests/agent-maintenance/contract.test.ts` with the reason recorded, and states the plugin version it needs
   in `minimum_plugin_version` in `tests/agent-maintenance/manifest.json`. An older plugin on that checkout
   is accepted.
4. After this PR merges and the plugin publishes, Stackweaver's branch records the published commit and
   payload digest and reruns the AC-06 comparison against the published plugin, and that update is reviewed.
   Then finish open triage batches and maintenance runs on the old plugin, upgrade each host, and merge. The
   result is recorded in this document, as earlier adoptions were.
5. Shared audit's revision, below.

### Shared audit

The revision belongs to the session on `feat/shared-audit`, and neither this feature nor its branch
changes it. There, after `git fetch origin main`: run
`vh-adlc gate draft docs/specs/shared-audit.md --repo . --plugin-pin <pin>`, edit `status` only on a pass, and commit that alone with the gate's `data.line`. Then, at `7e161c5` line numbers:

- `shared-audit.md:262,268,616`: `.vh-adlc/audit.json` becomes `.vh-adlc/audit.yaml`, read through the
  shared loader. `covers` gains `plugins/vh-adlc/scripts/settings-file.ts`. Clear any criterion ticks, keep
  checked tasks, add new task IDs for the changes below, and get a new spec review and acceptance.
- vh-adlc: `scripts/audit/settings.ts:40,46,51`, `scripts/audit/authority.ts:95,145`,
  `references/audit-settings.md:3,43`, `examples/audit/basic/.vh-adlc/audit.json`,
  `docs/user-guides/workflows.md:73`, and `tests/vh-adlc/audit/`.
- Stackweaver: `.vh-adlc/audit.json`, `AGENTS.md`, `agents/audit-project.md`, `agents/codebase-audit.md`,
  `.claude/commands/audit.md` and `tests/agent-audit/`.

## Acceptance Criteria

- [x] AC-01: Triage and maintenance read `.vh-adlc/<name>.yaml` and produce the same validated settings as before,
      apart from `settings_path`.
      Evidence: `bun test tests/vh-adlc/triage/settings.test.ts tests/vh-adlc/maintenance/settings.test.ts`, `39a3bf8`, pass; a rich block YAML file per operation gives the validated settings recorded from the JSON loader at `a1f10de`, apart from `root` and `settings_path`, and every fixture file is checked as commented block YAML. Full `bun test tests/vh-adlc` at `39a3bf8`: 626 pass, 5 fail, all 5 s timeouts under load average 12 to 20, and those files pass with `--timeout 120000`. Limitation: the frozen Stackweaver values are compared through test setup, not through Stackweaver's own files, which AC-06 covers.
- [x] AC-02: A `.vh-adlc/<name>.json` or `.yml` file in the working tree fails naming the expected path, and YAML the
      reader refuses fails visibly.
      Evidence: `bun test tests/vh-adlc/settings-file.test.ts` and both settings suites, `39a3bf8`, pass: a working-tree `.json` or `.yml` fails naming `.vh-adlc/<name>.yaml`, with or without `--settings`, and refused YAML fails with the reader's fixed reason and no file text.
- [x] AC-05: The maintenance standing grant holds from a merged `AGENTS.md` link to the YAML file.
      Evidence: `bun test --timeout 120000 tests/vh-adlc/maintenance/publication.test.ts`, `39a3bf8`, 25 pass, 0 fail: the grant holds from a committed `AGENTS.md` link to `.vh-adlc/maintenance.yaml`, a stale `.json` link reports `unadopted`, and a YAML chain without the binary grants nothing. Limitation: the default 5 s timeout failed three cases under load in the full run.
- [ ] AC-06: A reviewed Stackweaver branch runs triage and maintenance from YAML against the candidate plugin, with
      settings output unchanged apart from `settings_path`, and its adapter states the plugin version it needs.
- [x] AC-07: `conventions/coding.md` at the pinned revision carries the rule.
      Evidence: `vh-adlc knowledge --repo . --plugin-pin 0e52f51f01b84eda75a976763c42d8ec0a07b544 --page conventions/coding.md` on `feat/yaml-settings` after the pin move, answered at revision `0e52f51` from the repository pin in `AGENTS.md`; the served page's Configuration format section, before "Inputs and safety", is the Design's text word for word.
- [x] AC-09: The plugin lock names a stable release with `settings read`, and a `.yaml` read with no binary fails.
      Evidence: `bun test tests/vh-adlc/ensure.test.ts` and `bun test tests/vh-adlc/settings-file.test.ts`, `39a3bf8`, pass: the lock names stable v0.9.0, its binary answers `settings read`, and a `.yaml` read with an empty HOME and a refusing proxy fails as binary unavailable, while a no-file load needs no binary.
- [x] AC-10: On a YAML checkout, the confined triage controller's export equals `json(loadSettings(checkout))`, and its
      session starts with no binary inside the boundary.
      Evidence: `bun test tests/vh-adlc/triage/acceptance.test.ts`, `39a3bf8`, pass in the full run: on a YAML checkout `settings.json` equals `JSON.stringify(loadSettings(checkout))`, `verifyInputs` passes, and the real `boundaryCommand` under bwrap, with PATH `/usr/bin` and HOME `/nonexistent`, serves the same bytes through its `read` tool.
- [x] AC-13: The settings references name only `.yaml` paths, and their examples load.
      Evidence: `bun test tests/vh-adlc/settings-references.test.ts tests/vh-adlc/maintenance/discovery.test.ts`, `39a3bf8`, pass: both references name only `.vh-adlc/<name>.yaml`, state the binary requirement, and their commented block YAML examples load through each loader.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-02 | `tests/vh-adlc/triage/settings.test.ts` and `tests/vh-adlc/maintenance/settings.test.ts` on YAML, with a loader table for each refused file. |
| AC-05 | `tests/vh-adlc/maintenance/publication.test.ts` with a YAML adoption chain. |
| AC-06 | Stackweaver's `tests/agent-triage` and `tests/agent-maintenance` tests on its branch, with `VH_ADLC_PLUGIN_DIR` pointing at the candidate plugin, and a contract assertion on `minimum_plugin_version`. For both operations, the `settings` output at its last JSON commit, on the plugin before this feature, and at the YAML commit, on the candidate, run from the same checkout path, must be deeply equal, ignoring mapping key order and `settings_path`. |
| AC-07 | Read the rule through `vh-adlc knowledge --page conventions/coding.md`. |
| AC-09 | `tests/vh-adlc/ensure.test.ts` and `bun test tests/vh-adlc` against the bumped lock, plus a loader test with the installer failing. |
| AC-10 | A test in `tests/vh-adlc/triage/` runs `exportInputs` on a YAML checkout, compares the export, calls `verifyInputs`, starts the real `boundaryCommand`, and reads `settings.json` through the session's `read` tool. |
| AC-13 | A package test that greps both references and parses their YAML examples through the loader. |

## Tasks

T1 to T11 are this repository's PR. T12 is the `vhco-pro/docs` change, prepared on a local branch for the
owner to publish, and T13 waits for its merge. T14 and T15 are Stackweaver's branch, reviewed against this
candidate before the PR merges. Order step 4 and shared audit's revision are not tasks here.

- [x] T1 `tests/vh-adlc/ensure.test.ts` - the real-lock install test also pipes a block YAML mapping with a comment to `settings read --stdin` and expects `answered` with its value; fails on the 0.1.0 lock, whose binary has no such command (AC-09)
      Evidence: `bun test tests/vh-adlc/ensure.test.ts -t "real lock"` on the 0.1.0 lock: 1 fail, the command answered exit 2 and result `usage` where exit 0 and `answered` were expected.
- [x] T2 `plugins/vh-adlc/vh-adlc.lock.json`, `plugins/vh-adlc/plugin.json`, `plugins/vh-adlc/.claude-plugin/plugin.json` - the lock names stable v0.9.0 with asset and binary digests taken from its signature-checked `checksums.txt`, and the plugin moves to 0.7.0; T1 and the lock-shape and version-change checks in `tests/vh-adlc/check.test.ts` pass (AC-09)
      Evidence: `gpg --verify checksums.txt.sig checksums.txt` reported a good signature from subkey 929B7A7AF19CB3E67EEEEC0272E691932274AE79 of primary 9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6, `sha256sum --check checksums.txt` passed for all four assets, and binary digests came from the extracted archives; v0.9.0 is a stable release at `a1f10de`. `bun test tests/vh-adlc/ensure.test.ts`: 16 pass, 0 fail. `bun test tests/vh-adlc/check.test.ts -t "lock|version change"`: 3 pass, 0 fail.
- [x] T3 `tests/vh-adlc/settings-file.test.ts` - a loader table: a block `.vh-adlc/<name>.yaml` with a comment reads through the binary; a working-tree `.vh-adlc/<name>.json` or `.yml` fails naming `.vh-adlc/<name>.yaml`, also when `--settings` selects another `.yaml` file; an explicit path that does not end in `.yaml` fails; YAML the reader refuses fails with the reader's fixed reason and no text from the file; with no file and the installer failing, defaults apply and `settings_path` is `.vh-adlc/<name>.yaml`; a `.yaml` read with the installer failing fails as binary unavailable; fails because `settings-file.ts` does not exist (AC-02, AC-09)
      Evidence: `bun test tests/vh-adlc/settings-file.test.ts`: 0 pass, 1 fail, with `Cannot find module '../../plugins/vh-adlc/scripts/settings-file'`.
- [x] T4 `plugins/vh-adlc/scripts/settings-file.ts` - the Design's loader, which gets the binary from `ensure-vh-adlc.sh` only when a file exists; T3 passes (AC-02, AC-09)
      Evidence: `bun test tests/vh-adlc/settings-file.test.ts`: 18 pass, 0 fail, including the no-file load and the refused `.yaml` read with an empty HOME and a refusing proxy. `bun test tests/vh-adlc/check.test.ts`: 53 pass, 0 fail.
- [x] T5 `tests/vh-adlc/triage/fixtures.ts`, `tests/vh-adlc/maintenance/fixtures.ts`, `tests/vh-adlc/triage/settings.test.ts`, `tests/vh-adlc/maintenance/settings.test.ts`, `tests/vh-adlc/triage/acceptance.test.ts` - the fixture writers emit block YAML under a comment line to `.vh-adlc/<name>.yaml`; the settings suites assert that each written file fails `JSON.parse` and holds a comment, that a rich YAML file gives the validated settings the JSON loader gave at `a1f10de` apart from `root` and `settings_path`, and that refused files fail as T3 lists; an AC-10 case runs `exportInputs` on a YAML checkout, compares `settings.json` with `json(loadSettings(checkout))`, passes `verifyInputs`, starts the real `boundaryCommand` and reads `settings.json` through the session's `read` tool; these fail because both loaders read `.json` (AC-01, AC-02, AC-10)
      Evidence: `bun test tests/vh-adlc/triage/settings.test.ts tests/vh-adlc/maintenance/settings.test.ts`: 4 pass, 59 fail; the JSON loaders report `settings_path` `.vh-adlc/triage.json` and treat the YAML files as absent. `bun test tests/vh-adlc/triage/acceptance.test.ts -t "YAML checkout"`: 1 fail, `configured` false where true was expected. The block-style check lives in `tests/vh-adlc/settings-yaml.ts`, which both fixture writers call.
- [x] T6 `plugins/vh-adlc/scripts/triage/settings.ts`, `plugins/vh-adlc/scripts/maintenance/settings.ts` - both loaders read through `settings-file.ts` and keep their validators; T5 passes (AC-01, AC-02, AC-10)
      Evidence: `bun test tests/vh-adlc/triage/settings.test.ts tests/vh-adlc/maintenance/settings.test.ts tests/vh-adlc/settings-file.test.ts`: 81 pass, 0 fail. `bun test tests/vh-adlc/triage/acceptance.test.ts -t "YAML checkout"`: 1 pass, 0 fail, 10 expect() calls, with the real `boundaryCommand` under bwrap.
- [x] T7 `tests/vh-adlc/maintenance/publication.test.ts` - the adoption chain links and commits `.vh-adlc/maintenance.yaml` and holds; a default branch still linking `.vh-adlc/maintenance.json` reports `unadopted`; a YAML chain read with the installer failing grants nothing; fails because `authority.ts` follows the JSON link (AC-05)
      Evidence: `bun test tests/vh-adlc/maintenance/publication.test.ts`: 4 pass, 21 fail; every case built on the YAML adoption chain reports `unadopted`. The binary case passes before the change too, because it only requires that nothing is granted.
- [x] T8 `plugins/vh-adlc/scripts/maintenance/authority.ts` - the committed chain follows `.vh-adlc/maintenance.yaml` and reads its blob through `settings-file.ts`, keeping the top-level key check; T7 passes (AC-05)
      Evidence: `bun test --timeout 120000 tests/vh-adlc/maintenance/publication.test.ts`: 25 pass, 0 fail in 263 s. A first run at the default 5 s timeout, on a host with load average 16, timed out two cases; one of them also timed out at `a1f10de` in the baseline run, and both pass alone.
- [x] T9 the remaining tests that write or name a settings file, under `tests/vh-adlc/triage/` and `tests/vh-adlc/maintenance/` - they use `.vh-adlc/<name>.yaml`; the frozen Stackweaver data in `tests/vh-adlc/triage/fixtures/migration/` and the consumer commit `policy-corpus.ts` reads stay JSON as recorded, and test setup writes their values as YAML into the fixture checkout; `bun test tests/vh-adlc` passes apart from failures also seen at `a1f10de` (AC-01)
      Evidence: `bun test tests/vh-adlc` (load average 13 to 20): 613 pass, 14 fail, 627 tests in 667 s; the baseline run at `a1f10de` gave 593 pass, 6 fail, 1 error. The 14 were timeouts, lock-keeper and worktree errors under load, and one run without Go on PATH. Rerun with `--timeout 120000`, `VH_ADLC_TRIAGE_TEST_TIMEOUT_MS=60000` and Go on PATH, each file passed: `maintenance-variants.test.ts` 2/2, `maintenance/bot-only-trial.test.ts` 1/1, `maintenance/delivery-cases.test.ts` 4/4, `maintenance/journal.test.ts` 8/8, `maintenance/publication.test.ts` 25/25, `triage/execution.test.ts` 55/55. The synthetic shared adapter fixture moved to `.vh-adlc/maintenance.yaml`; `trial-proof.test.ts` keeps its consumer stand-in as recorded JSON.
- [x] T10 `tests/vh-adlc/settings-references.test.ts` - both settings references name `.vh-adlc/<name>.yaml` and no `.json` or `.yml` settings path, say that reading a settings file needs the verified binary, and hold block YAML examples with a comment that fail `JSON.parse` and load through their loader in a fixture checkout; fails because both references show JSON (AC-13)
      Evidence: `bun test tests/vh-adlc/settings-references.test.ts tests/vh-adlc/maintenance/discovery.test.ts` before the reference edits: 3 pass, 5 fail; both references named the `.json` files and showed JSON examples. `discovery.test.ts` now expects `.vh-adlc/maintenance.yaml` in the maintenance contract.
- [x] T11 `plugins/vh-adlc/references/triage-settings.md`, `plugins/vh-adlc/references/maintenance-settings.md` - YAML examples, the `.yaml` grant chain, the binary requirement in place of the Bun-only runtime line, and no claim that loading creates no files; T10 passes (AC-13)
      Evidence: `bun test tests/vh-adlc/settings-references.test.ts tests/vh-adlc/maintenance/discovery.test.ts tests/vh-adlc/check.test.ts`: 61 pass, 0 fail. The maintenance reference keeps `index_paths` as a JSON array, the exception Scope names.
- [x] T12 `vhco-pro/docs` `conventions/coding.md` - the Design's Configuration format section, before "Inputs and safety", committed on a local branch in a fresh clone; `git diff origin/main` shows that section and nothing else. Pushing it and its PR are the owner's (AC-07)
      Evidence: commit `4e408fa` on local branch `docs/yaml-configuration-format` in a fresh clone at `/home/m/code/vhco-pro-docs-yaml-config`, on `origin/main` `5f7c39a`. `git diff --stat origin/main` shows `conventions/coding.md` with 6 insertions, the section alone, and `npm run check` passed for 27 Markdown files and the rules block. Not pushed; the push, PR and merge are the owner's.
- [x] T13 `AGENTS.md`, `plugins/vh-adlc/knowledge.md` - the pin moves to the `vhco-pro/docs` merge that carries T12; `vh-adlc knowledge --page conventions/coding.md` at the new pin serves the section, and what applies from the conventions diff since `e4d58d2` is recorded under this task; waits for T12 to merge (AC-07)
      Evidence: `vh-adlc knowledge --repo . --plugin-pin 0e52f51f01b84eda75a976763c42d8ec0a07b544 --page conventions/coding.md --page conventions/typescript.md ...` answered with revision `0e52f51`, source `repository`, and the cached `conventions/coding.md` holds the Configuration format section at line 68. The pin is vhco-pro/docs PR #19's merge, which contains T12's `4e408fa`. `conventions/feature-documents.md` and `guides/humanize-prose.md` are unchanged between `e4d58d2` and `0e52f51`, so the rules block and gates are the same. After the move, `bun test tests/vh-adlc` gave 631 pass, 0 fail in 211 s, and `go test ./...`, `go vet`, `golangci-lint run` (local v2.14.0) and `go mod tidy -diff` passed.
      Conventions diff `e4d58d2..0e52f51`, what applies to this feature and what changed for it: the Configuration format rule is this feature. The AGENTS.md route to `conventions/typescript.md` applies because the plugin is TypeScript, so `AGENTS.md` now routes TypeScript work there, as the onboarding guide's template does. From that page, external input is now narrowed from `unknown` in `readYAML` in `plugins/vh-adlc/scripts/settings-file.ts`, which had cast the reader's report, and in the fixture parse in `tests/vh-adlc/maintenance/related-cases.ts`; a strict `tsc` 5.9.3 run with Bun types over `settings-file.ts`, `settings-yaml.ts`, both loaders and `authority.ts` reported no errors. The example knowledge line in `plugins/vh-adlc/references/loop.md` names the new pin. Not applied here, and reported to the owner as findings: the repository has no strict type-check or type-aware lint for its TypeScript; the delivery rule that every pinned dependency is discoverable by the updater does not hold for `vh-adlc.lock.json`; the documentation rule that a component's examples live under `examples/` is read as covering actions and workflows, not these plugin references, whose YAML examples the Design keeps and a test loads; trunk-based branch cleanup, `v` tags, managed Renovate, the `run` block length limit, the Shared components naming table, README banners and the new release workflows concern repository settings, CI and other components, not this change. Test fixture pins such as `DOCS_PIN` in `tests/vh-adlc/lifecycle/fixtures.ts` are recorded revisions and stay.
- [x] T14 Stackweaver branch `feat/yaml-settings-migration`: `.vh-adlc/triage.yaml`, `.vh-adlc/maintenance.yaml`, `AGENTS.md`, `.claude/commands/`, `agents/`, `tests/agent-triage/`, `tests/agent-maintenance/` - both files converted by hand to block YAML with comments, references updated, `tests/agent-maintenance/contract.test.ts` re-baselined with the reason recorded, `minimum_plugin_version` in `tests/agent-maintenance/manifest.json` set to 0.7.0, and contract assertions that both settings files fail `JSON.parse`, hold a comment, and that the manifest states that version; done when `VH_ADLC_PLUGIN_DIR=<candidate> bun test tests/agent-triage tests/agent-maintenance` and `VH_ADLC_TRIAGE_PLUGIN=<candidate> bun tests/agent-triage/rehearse.ts` pass, and both operations' `settings` output at the last JSON commit on 0.6.0 and at the YAML commit on the candidate, run from one checkout path, are deeply equal apart from key order and `settings_path` (AC-06)
      Evidence: Stackweaver commit `1e0b55b28f8e0ff621c66ecb65d06e90c59130ea` on local branch `chore/vh-adlc-yaml-settings` (the coordinator's name for the branch this task called `feat/yaml-settings-migration`), from origin/main `5a46c0d7`, in `/home/m/code/stackweaver/.claude/worktrees/yaml-settings`; candidate plugin `plugins/vh-adlc` at vh-adlc `fc74cf3`, version 0.7.0. Both files are hand-written commented block YAML; their raw reader values equal the JSON files' at `5a46c0d7`. The new contract assertions failed 6 of 12 on the JSON-era tree and pass on the YAML commit. In one clean clone with origin `https://github.com/michielvha/stackweaver.git`, `settings` for triage and maintenance at `5a46c0d7` on installed plugin 0.6.0 and at `1e0b55b2` on the candidate are deeply equal apart from `settings_path`, with the same `root`; triage's JSON text differs only in `label_map` key order. `VH_ADLC_PLUGIN_DIR=<candidate> bun test --timeout 120000 tests/agent-triage tests/agent-maintenance` in that clone: 16 pass, 0 fail, none skipped. Run from the worktree, whose origin URL carries a credential, the installed-plugin case fails `origin identity`, as the loaders refuse such an origin on any plugin version. `VH_ADLC_TRIAGE_PLUGIN=<candidate> bun tests/agent-triage/rehearse.ts` exited 0 with rollback, reapply and index preservation true over `AGENTS.md`, `agents/issue-triage.md`, `.claude/commands/triage.md` and `.vh-adlc/triage.yaml`. The pre-commit `make verify` ran documentation authoring, changelog and gitleaks checks: 4 passed. Not pushed; the commit carries no `[skip ci]`, because `.vh-adlc/` and `tests/agent-*/` are not on CLAUDE.md's skip-eligible list.
- [ ] T15 this document - an independent review of T14's branch at an exact Stackweaver commit against an exact candidate plugin commit, with the Stackweaver commit, plugin commit, reviewer and where the review is kept named in AC-06's evidence line (AC-06)

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-02 | R-1 | spec | `5dbeab86b1c11bf1cd5affd42e0d5e50fd04d140` | claude-opus-5-5 | procedural | 18 findings, 1 blocking |
| 2026-11-02 | R-2 | spec | `3ebea55efee3e8eb9765ef805a0a47e11c4e1584` | claude-opus-5-5 | procedural | 15 findings, 1 blocking |
| 2026-11-02 | R-3 | spec | `443b34d47ad543865cb2892ea12a3d5633924006` | claude-opus-5-5 | procedural | 11 findings, 1 blocking |
| 2026-11-02 | R-4 | spec | `22769c05e7ba2e6f30b43b91a3f60ad9413c62f8` | claude-opus-5-5 | procedural | 10 findings, 0 blocking |
| 2026-11-02 | R-5 | spec | `d225d01622be32d9ec446a21bd15e910fea72585` | claude-opus-5-5 | procedural | 8 findings, 0 blocking |
| 2026-11-02 | R-5 | spec | `d225d01622be32d9ec446a21bd15e910fea72585` | n/a | n/a | accepted by owner |

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

### R-3

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Acceptance Criteria AC-06, AC-11; Design, Order, one PR each; Design, R-2 findings row F-01
EVIDENCE: The R-2 table says F-01 is resolved by "one PR per piece", but this document still holds criteria that only become true after its own PR has merged. AC-06 needs Stackweaver running from YAML "on its default branch", and Order step 4 comes after step 3. A merged Stackweaver on the current plugin would run on defaults, so that merge cannot safely come first. AC-11 needs shared audit to read `audit.yaml` "after a new review and acceptance", and step 5 says "neither this feature nor its branch changes it". That revision uses the shared loader, reached "after `git fetch origin main`", so it follows this PR's merge. The pinned gates.complete requires all_met, impl_review_fresh and on_feature_branch_if_set. conventions/delivery.md:41 says the document "is edited only on that branch and returns to the default branch with the PR", :42 says "One PR per feature", and plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:79 says a merge "ends the remote PR branch's lifetime". So `gate complete` cannot pass before the merge, because two criteria are unmet. After the merge the document sits in-progress on main with a `branch` that no longer exists, and the first `next` rules report an owner decision. Residuals are the only exit, and the document plans none (`issue: null`, no tracker). Precedent avoided this: shared-triage's goal stopped at "a reviewed Stackweaver migration branch ready to publish", and shared-maintenance has commit 6200787 "complete verified" before 3ccbf40 "record verified maintenance publication and adoption".
PROPOSAL: Restate AC-06 as a reviewed Stackweaver branch that passes against the exact candidate plugin, and move the default-branch adoption to a post-merge record as the earlier adoptions did. Move AC-11 out of this document: make it a dependency recorded in shared-audit.md, or an owner-approved residual with a named tracker. The status text must not claim the blocker is resolved until one of these is done.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Loader and Order step 3; Acceptance Criteria; Test Plan
EVIDENCE: plugins/vh-adlc/references/triage-settings.md:7 says "Create `.vh-adlc/triage.json` when a project needs its own scope or ownership rules", followed by a ```json example. references/maintenance-settings.md:3 and :48 name `.vh-adlc/maintenance.json`, and :48 is the standing grant's documented chain. The Design names only one edit to these files, the sentence at triage-settings.md:39. Order step 3 lists "lock bump, loader, the pin ..., and the plugin version bump" plus fixtures. No criterion or proof touches the references. With every box ticked, the shipped contract can still tell a person to create a file that the new loader refuses.
PROPOSAL: Add both reference files to step 3, including the YAML example and the grant chain. Add a criterion that the settings contract documents only the `.yaml` path, proved by a package test that also parses the example through the loader.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Order step 4; AC-06; Test Plan AC-06
EVIDENCE: Step 4 says "convert both files by hand", and the migration helper with its equality check was cut. AC-01's proof runs on vh-adlc fixtures, so it does not cover Stackweaver's real files, and the AC-06 proof names only adapter tests and an installed-plugin run. tests/agent-triage/contract.test.ts on Stackweaver origin/main asserts a subset of keys: repository, protected_ids, generated_mirrors, report_dir, priority_order, milestone_order and workstreams. It does not check bot_authors, owned_labels, label_map, index_ids or index_rules. tests/agent-maintenance/contract.test.ts reads the file through a small `config()` helper; the assertions I read cover schema_version, repository and hostname. A value lost or changed by hand would pass the validators and these proofs, and silently change what triage protects or what maintenance scopes.
PROPOSAL: Add a pass condition to the AC-06 proof: the `settings` operation output at Stackweaver's last JSON commit and at the YAML commit are identical apart from `settings_path`, for both triage and maintenance.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, Order step 3; R-2 findings row F-13
EVIDENCE: "Its fixtures move to YAML" collides with fixtures frozen from real Stackweaver commits. tests/vh-adlc/triage/fixtures/migration/manifest.json:7 hashes `.vh-adlc/triage.json`. The test "the migration snapshot was exported from one exact adapter commit and only allowed paths" (tests/vh-adlc/triage/migration.test.ts) checks every hash against manifest.commit, and with STACKWEAVER_TRIAGE_CHECKOUT set it compares against that checkout. The fixture also carries Stackweaver's own contract.test.ts and rehearse.ts with the JSON path. A YAML snapshot from an exact commit cannot exist at step 3, because Stackweaver's move is step 4. Separately, tests/vh-adlc/maintenance/policy-corpus.ts:14-18 runs `JSON.parse(frozen(".vh-adlc/maintenance.json"))` at an exact consumer commit and writes that path into the project, where the new loader refuses it. trial-proof.test.ts:70 and report-trial.ts:89 use this corpus.
PROPOSAL: State which fixtures are frozen evidence and how each is handled, for example keep frozen exports as JSON data outside `.vh-adlc/` semantics and have test setup write YAML into the fixture checkout, or export them from the head of Stackweaver's PR and say so.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, R-2 findings row F-05, F-10, F-12, F-15; Design, Loader
EVIDENCE: The table says F-12 is "Resolved by removal", but R-2 F-12 concerned repositories with no settings file, and the removed both-format period does not touch that case. plugins/vh-adlc/scripts/triage/settings.ts:76,106 and maintenance/settings.ts:66,121 put the default path into `settings_path` even when nothing is configured. Moving the default to `.yaml` changes the digests of every unconfigured repository on plugin upgrade. The Design says only that digests "change once at migration", and such a repository has no migration step and no "finish open runs first" instruction.
PROPOSAL: State the no-file `settings_path` value and that those digests change on upgrade, then correct the table row.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design, Loader; AC-02
EVIDENCE: The Loader section covers the working tree "or a Git blob" and then says `.json` and `.yml` files fail, naming the expected path. plugins/vh-adlc/scripts/maintenance/authority.ts:95 tests the AGENTS.md link before reading any blob and returns status `unadopted` with reason "committed adoption chain absent" when the link is absent. A default branch still linking the JSON or `.yml` file therefore reports unadopted and names no path. That fails closed, but it differs from what AC-02 says.
PROPOSAL: Limit the AC-02 failure to the working-tree path and state that the blob path reports unadopted, or add the check to authority.ts and to the loader table.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context; Design, Shared audit
EVIDENCE: `git cat-file -t 7e161c5` in /home/m/code/vh-adlc-host-cleanup gives "fatal: Not a valid object name". `git ls-remote origin 'refs/heads/*audit*'` returned nothing. The commit exists only in the separate clone /home/m/code/vh-adlc-triage-spec, where feat/shared-audit resolves to 7e161c58ac2377e86503384744d3f03dc71f557a. All cited lines checked out there: shared-audit.md:262,268,616, audit/settings.ts:46,51, audit/authority.ts:95,145, audit-settings.md:3,43 and workflows.md:73. A reader of this repository cannot follow "local `feat/shared-audit`".
PROPOSAL: Name the clone that holds the branch, and give the full commit SHA.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Design, Shared audit
EVIDENCE: The Loader section drops "Loading settings creates no files" because the installer can fill its cache. The same promise exists at 7e161c5 in plugins/vh-adlc/scripts/audit/settings.ts:40, "Reading settings performs no setup, permission refresh, or filesystem mutation." The shared audit list cites only lines 46 and 51 of that file.
PROPOSAL: Add settings.ts:40 to the list.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Frontmatter covers
EVIDENCE: The Design makes the loader depend on plugins/vh-adlc/scripts/ensure-vh-adlc.sh, and AC-10 and its proof depend on `exportInputs` and `boundaryCommand` in plugins/vh-adlc/scripts/triage/controller.ts. Neither path is in `covers`, while the standard says it lists "every path whose change can affect the feature". A change to either would not make the implementation review stale.
PROPOSAL: Add both paths to `covers`.

FINDING: F-10
KIND: judgement
SEVERITY: nit
WHERE: AC-10; Test Plan AC-07, AC-10
EVIDENCE: AC-10 says the controller "receives equal settings" without saying equal to what, and its proof ("runs `exportInputs` ... and starts the real `boundaryCommand`") has no pass condition. The standard asks for a check with one. For AC-07, `vh-adlc knowledge --repo . --plugin-pin <pin>` returned `"data":{"pages":[]}`, so "Read the rule through `vh-adlc knowledge`" shows no rule unless `--page conventions/coding.md` is given.
PROPOSAL: Say AC-10's export equals `json(loadSettings(checkout))` and the served session starts, with the export's hash verified. Name `--page conventions/coding.md` in the AC-07 proof.

FINDING: F-11
KIND: judgement
SEVERITY: nit
WHERE: Design, Order step 3
EVIDENCE: Step 3 moves the pin inside this feature's PR. `gh api repos/vhco-pro/docs/compare/e4d58d2...main` shows 32 commits, with conventions/delivery.md (96 changed lines), coding.md (47) and documentation.md (27) among the files. New rules include `delete_branch_on_merge` and component naming. conventions/feature-documents.md is not in the diff, so the rules block stays the same. plugins/vh-adlc/knowledge.md calls moving the pin "a reviewed plugin change". R-1 F-12 raised this, and it was superseded with no statement of who checks the plugin and repository against the new text.
PROPOSAL: Add one line to step 3 saying the implementer reads the conventions diff and records what applies, or pin a revision that adds only the rule.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-06; Design, Order step 3
EVIDENCE: The AC-06 proof runs "Stackweaver's `tests/agent-triage` and `tests/agent-maintenance` tests on its branch". tests/agent-maintenance/contract.test.ts:46-47 on Stackweaver origin/main requires `git diff --name-only 72186d3 -- <every agents/* except the two maintenance files, every .claude/commands/* except maintenance.md, CLAUDE.md, ...>` to be empty. Step 3 has the branch update its references, and agents/issue-triage.md and .claude/commands/triage.md both name .vh-adlc/triage.json, so the move itself makes this test fail. It already fails without the move: `bun test tests/agent-maintenance/contract.test.ts` in /home/m/code/stackweaver at 4e14bd50 gave 3 pass, 1 fail, with received ".claude/commands/seo.md .claude/commands/spec.md agents/seo.md agents/spec.md". `git diff --name-only 72186d3 origin/main` also lists agents/seo.md and .claude/commands/seo.md. As written, the proof cannot pass, and "updates its references" does not cover moving a frozen baseline.
PROPOSAL: Say in step 3 that Stackweaver's branch re-baselines or narrows this contract test, with the reason recorded, or name this test in the AC-06 proof as a known exclusion with its failure stated.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: AC-06; Test Plan AC-06
EVIDENCE: The proof says the `settings` output at the last JSON commit and the YAML commit "must match apart from `settings_path`". settings-reader.md returns mappings "with keys sorted", and triage/settings.ts:97-98 builds label_map in input order. Stackweaver's .vh-adlc/triage.json has label_map in the order bug, enhancement, documentation, refactor, security, major-upgrade, which is not sorted. I ran `bun plugins/vh-adlc/scripts/triage/cli.ts settings` on two scratch repositories holding those keys in file order and in sorted order. The outputs differed at byte 673 inside label_map. So a text or `json()` comparison fails on Stackweaver's real file with no value lost. The proof also does not say that the two sides need different plugins, because the candidate refuses `.json`, or that `root` is in the output and differs between two checkouts (triage/settings.ts:106).
PROPOSAL: State the pass condition as deep equality ignoring mapping key order and excluding `settings_path`, with the JSON side run on the plugin version before this feature and both sides run from the same checkout path, or excluding `root`.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Order steps 3 and 4; Frontmatter goal
EVIDENCE: Step 4 says Stackweaver "merges that branch" after the plugin publishes, with nothing run again. Stackweaver tests/agent-maintenance/README.md says "Cutover requires matching published-marketplace evidence and an owner-authorized merge. A local shared source checkout or candidate catalog is development proof only." tests/agent-maintenance/manifest.json records published_plugin_version 0.6.0, published_shared_commit, published_payload_digest and adoption_state "published-marketplace-verified". tests/agent-triage/README.md says "Installation must match the recorded payload, not merely a version string; changes invalidate dependent evidence." The published commit does not exist when step 3 reviews the branch. So either the merged head differs from the reviewed head, or the manifest and README keep describing 0.6.0 after the branch needs a newer plugin. "Ready to merge" in the goal is not true by Stackweaver's own rule.
PROPOSAL: Add to step 4 that the branch records the published commit and payload digest, reruns the AC-06 comparison against the published plugin, and gets its update reviewed before merging. Say where that result is recorded.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Scope; Design, Order step 5; Frontmatter goal
EVIDENCE: Scope says shared audit's revision is "a dependency it records itself", and step 5 says "its own document tracks" it. Neither copy records it: `grep -i 'yaml'` over docs/specs/shared-audit.md at feat/shared-audit (7e161c5) returned nothing, and `grep -i 'yaml-settings\|audit\.yaml'` over origin/main:docs/specs/shared-audit.md returned nothing. That document is in-progress under issue 40, while this one has `issue: null`, no criterion on audit and no tracker. With every box here ticked, shared audit can still merge `.vh-adlc/audit.json`. The goal "Every vh-adlc setting a person edits is YAML" and the new rule would then be false, and only this document knows.
PROPOSAL: Before this document goes to `planned`, record the dependency in shared-audit.md or in issue 40 and cite that record here. Otherwise narrow the goal to triage and maintenance and name audit as a known exception until its revision lands.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, Shared audit
EVIDENCE: The text says to run `vh-adlc gate draft docs/specs/shared-audit.md`. Run exactly so, the binary returned result `usage` with "--plugin-pin must be a full 40-character lowercase SHA". With `--repo . --plugin-pin <pin>` the same gate returned `pass`, with transition allowed from in-progress to draft.
PROPOSAL: Write the command with `--repo` and `--plugin-pin`.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-10; Context
EVIDENCE: The proof says the test "starts the real `boundaryCommand`, which verifies its hash", and Context calls the export "hash-checked". serveReadOnly at plugins/vh-adlc/scripts/triage/controller.ts:287 parses settings.json at startup with no hash check. The check runs only in the parent's verifyInputs (:143) and when the `read` tool fetches that entry (`if(digest(bytes)!==entry.sha256)` in the tools/call branch). A test that only starts the session passes without any hash check.
PROPOSAL: Have the test read settings.json through the session's `read` tool and call verifyInputs, and name both in the proof.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: AC-06; Test Plan AC-06
EVIDENCE: The proof says "with the candidate plugin installed". The only test under those directories that loads settings through the plugin is in tests/agent-maintenance/installed.test.ts, and it is `(plugin ? test : test.skip)` on VH_ADLC_PLUGIN_DIR, so installing is not enough and it skips silently. Nothing in tests/agent-triage loads the plugin. The clause "its adapter states the plugin version it needs" has no proof, and "adapter" is not one place: manifest.json has minimum_plugin_version, while tests/agent-maintenance/installed.ts holds an executable 0.6 floor (`major === 0 && minor < 6`) and the "0.6.0+" text.
PROPOSAL: Name VH_ADLC_PLUGIN_DIR in the proof, name the file that states the version, and add a contract assertion for it.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Design, Loader and Order step 4
EVIDENCE: Loader says "finish open runs before upgrading". Step 4 says Stackweaver finishes open runs after the plugin publishes. No step says when a host upgrades. Between an upgrade and the merge, Stackweaver's main holds `.vh-adlc/*.json`, which the new plugin refuses. The vh-adlc entry in .claude-plugin/marketplace.json uses source ./plugins/vh-adlc, so a marketplace update can reach a host as soon as the change is on main.
PROPOSAL: Add one sentence to step 4: finish open runs on the old plugin, upgrade each host, then merge.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Frontmatter goal; Design, Conventions rule
EVIDENCE: The goal says every vh-adlc setting a person edits is YAML, and the rule says never choose JSON for configuration a person writes. The standing declaration's `index_paths` is person-written and is documented as "a JSON array" (references/maintenance-settings.md, Adopted report-publication declaration), and authority.ts:81 parses it with JSON.parse. Scope excludes changes to fields, and this is a Markdown table cell, so the conflict is small but unstated.
PROPOSAL: Note `index_paths` as a deliberate exception in Scope, or stop calling it JSON in the reference and accept the same inline list syntax.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Context
EVIDENCE: "needs a published stable release (`docs/internal/releasing.md`)" repeats the citation that settings-reader.md R-1 F-08 corrected. releasing.md describes stable and prerelease tags and does not state the limit. The limit is the version pattern at plugins/vh-adlc/scripts/ensure-vh-adlc.sh:43 and the test at tests/vh-adlc/check.test.ts:385.
PROPOSAL: Cite ensure-vh-adlc.sh:43.

### R-5

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: AC-01; AC-06; Test Plan AC-01, AC-06; Design, Order step 3
EVIDENCE: With every box ticked, the original problem can survive as a rename. JSON text is valid YAML to the reader. A throwaway probe of go.yaml.in/yaml/v3 v3.0.5 Decoder on pretty-printed JSON gave one document, a !!map top level, !!str keys and !!int values, all forms settings-reader.md accepts. `Bun.YAML.parse` on the same text (Bun 1.4.3) returned the object. So `git mv .vh-adlc/triage.json .vh-adlc/triage.yaml` meets AC-01, makes the AC-06 deep equality pass, and leaves Stackweaver's `JSON.parse(read(...))` calls (tests/agent-triage/contract.test.ts:14, tests/agent-maintenance/contract.test.ts:8) working once the path changes. The same holds for the test fixtures. tests/vh-adlc/triage/fixtures.ts:33 and tests/vh-adlc/maintenance/fixtures.ts:31 write `JSON.stringify(value)`, so changing only the file name there satisfies "its fixtures move to YAML", and the AC-01 proof "on YAML" would never see a block mapping. Step 3 says "converts both files by hand", but no criterion or proof checks the result.
PROPOSAL: Require block style in the end state: AC-06's proof asserts both Stackweaver files parse as YAML and fail `JSON.parse`, and the fixture writers emit block YAML, with a comment line in at least one AC-01 case.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: AC-06; Test Plan AC-06; Design, Order step 3
EVIDENCE: AC-06 opens "A reviewed Stackweaver branch". The Test Plan row proves only the tests and the settings comparison, so nothing establishes "reviewed". The document names no branch, commit, reviewer, record or location. git grep across Stackweaver origin/main shows it has no feature-document review log for this adapter, and the vh-adlc implementation review runs in this repository. The standard says "A passing subset never upgrades a composite criterion", so an implementation reviewer has either to mark AC-06 `not verified` or `untested`, or to accept a word with no check behind it. The standard also requires Proof to name a real check.
PROPOSAL: Name the Stackweaver branch, and state where its review record lives and what it must hold, such as the exact Stackweaver commit, candidate plugin commit and reviewer. Add that record to the AC-06 proof, or drop "reviewed" from the criterion.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Loader; AC-02; AC-05; AC-09; Test Plan
EVIDENCE: Four Loader rules have no criterion, so an implementation can break them with every box ticked. "With no settings file, defaults apply and no binary is needed": AC-09 covers only "a `.yaml` read with no binary", so a loader that always resolves the binary passes, and every unconfigured repository then depends on the installer. "An explicit `--settings` path must end in `.yaml`": AC-02 names only `.vh-adlc/<name>.json` and `.yml`. It is a live path (triage/cli.ts:30, maintenance/cli.ts:46, execute.ts:318). "With no settings file it reads `.vh-adlc/<name>.yaml`" as `settings_path`: no criterion states this, and it is the only stated cause of the digest change for unconfigured repositories. "A stale `AGENTS.md` link reports `unadopted`": AC-05 and its proof cover only a holding chain. The text also leaves one case open: whether a leftover `.vh-adlc/<name>.json` fails when `--settings` selects another `.yaml` file.
PROPOSAL: Extend AC-02, AC-05 and AC-09 with these cases and add them to the loader table, including a no-file load with the installer failing. State whether the leftover check runs when an explicit path is given.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, Loader; AC-09
EVIDENCE: AC-09 says a `.yaml` read with no binary "fails". On the blob path the read sits inside the `try` at plugins/vh-adlc/scripts/maintenance/authority.ts:96-110, so a loader error becomes status `invalid` with reason "invalid or ambiguous committed publication declaration". This fails closed, but a missing binary is reported as a defect in the committed declaration, and the AC-09 "loader test with the installer failing" does not reach this path.
PROPOSAL: State the blob outcome for an unavailable binary, either a distinct reason or a throw before the `try`, and add it to the AC-05 or AC-09 proof.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, Loader and Order step 3; AC-13
EVIDENCE: The Loader names one stale sentence in plugins/vh-adlc/references/triage-settings.md, line 39. Line 4 of the same file says "Runtime helpers require Bun; GitHub CLI is needed only for the CLI adapter." After this feature a configured repository also needs the verified binary, and possibly bash and curl through ensure-vh-adlc.sh. AC-13 greps only for file names, so this line stays and passes.
PROPOSAL: Add triage-settings.md:4 to the Loader's edit, stating that reading a settings file needs the verified binary.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Test Plan AC-06
EVIDENCE: The proof runs `tests/agent-triage` tests "with `VH_ADLC_PLUGIN_DIR` pointing at the candidate plugin". On Stackweaver origin/main that directory's only test file is contract.test.ts, which loads no plugin and reads no such variable. The plugin-loading check there is tests/agent-triage/rehearse.ts, which is not a test file (README.md:88 runs it as `bun tests/agent-triage/rehearse.ts`) and which reads `VH_ADLC_TRIAGE_PLUGIN`. It lists `.vh-adlc/triage.json` in `runtime` at line 8 and calls `loadSettings(checkout)`. So step 3's edit to that script goes unexercised by the named proof.
PROPOSAL: Add `VH_ADLC_TRIAGE_PLUGIN=<candidate> bun tests/agent-triage/rehearse.ts` to the AC-06 proof.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Design, Shared audit
EVIDENCE: The steps run "after `git fetch origin main`", and the first change says audit is "read through the shared loader". A fetch moves only the remote ref. `git ls-tree -r --name-only 7e161c5 plugins/vh-adlc/scripts` holds no settings-file.ts, so the loader is not on the branch until main is merged in, and the text does not say to merge. A rebase would be the wrong reading, because internal/fresh/fresh.go:154 needs reviewed commits to stay ancestors of HEAD (settings-reader.md R-1 F-11).
PROPOSAL: Write "after merging `origin/main`, not rebasing", or state where in the sequence the merge happens.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Document location
EVIDENCE: conventions/delivery.md:36-37 says that until a document has a `branch` field it "is committed and pushed to the default branch". `git branch -a --contains d225d01` lists only local `spec/host-cleanup`, and `vh-adlc fresh` reports remote_sha c8343c5, which does not contain it. Local main (930541c) is not an ancestor of d225d01 either. Reviews R-1 to R-4 and this pass are all bound to unpushed commits, and a rebase onto main would make them stale with `commit-unreachable`. settings-reader.md R-1 F-11 raised this for that document on the same branch.
PROPOSAL: Land the branch by merge or fast-forward before an acceptance row relies on this review.

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md) and [delivery conventions](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/delivery.md): one document and one PR per feature, and the revision rule that shared audit follows.
- [Coding conventions on `vhco-pro/docs` main](https://github.com/vhco-pro/docs/blob/5f7c39a8f621d8b74e34d8da5f22ac90700c344a/conventions/coding.md): the section this feature extends.
- [Pinned prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): prose editing.
