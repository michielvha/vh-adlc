---
status: draft
status_description: "Drafted from the owner's 2026-11-02 decision with four open questions; no spec review yet."
issue: null
goal: "Every vh-adlc setting a person edits is YAML, adopting repositories have moved without losing a grant or a report, and the pinned conventions forbid choosing JSON over YAML."
covers:
  - plugins/vh-adlc/scripts/settings-file.ts
  - plugins/vh-adlc/scripts/settings-migrate.ts
  - plugins/vh-adlc/scripts/triage/settings.ts
  - plugins/vh-adlc/scripts/maintenance/settings.ts
  - plugins/vh-adlc/scripts/maintenance/authority.ts
  - plugins/vh-adlc/references/triage-settings.md
  - plugins/vh-adlc/references/maintenance-settings.md
  - plugins/vh-adlc/references/triage.md
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
  [shared audit](shared-audit.md) feature (`docs/specs/shared-audit.md:225,231,579,720`) and already
  exists in the `/home/m/code/stackweaver-audit-migration` worktree.
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
- The pinned conventions have no format rule. `conventions/coding.md` only says to use structured
  parsers "for YAML, JSON, and tool output" (line 72 on `vhco-pro/docs` main at `5f7c39a`). The pin in
  `AGENTS.md` and `plugins/vh-adlc/knowledge.md` is the older `e4d58d2`.

## Scope

In scope: one shared settings loader, YAML for triage and maintenance settings, reading both formats
during the transition, a checked migration helper, Stackweaver's migration, the conventions rule and
the pin bump that brings it here.

Out of scope: changing any setting's fields or meaning, or `schema_version`; file formats an external
tool defines; `.yml` as a second spelling; and the choice of what happens to generated files and
machine output, unless Q1 brings them in.

## Design

### Shared loader

`plugins/vh-adlc/scripts/settings-file.ts` is the one place that finds and parses a `.vh-adlc/<name>`
file, from the working tree or from a Git blob. Triage, maintenance and later audit call it, and keep
their existing field validators unchanged. YAML settings hold one document, with no aliases and no
duplicate keys; the parser that enforces this is Q3. Digests stay bound to the parsed, normalized
values, so converting a file changes no setting's meaning.

During the transition the loader looks for `<name>.yaml`, then `<name>.json`. Both present is an error
naming the two files, so nobody edits the one that is ignored. Reading JSON adds a report line naming
the migration. `authority.ts` accepts an `AGENTS.md` link to whichever file the commit holds, and the
grant still needs that exact link and blob.

### Migration for adopting repositories

1. vh-adlc releases the plugin version that reads both formats. Nothing changes for an adopter yet.
2. In each adopting repository, one commit: run
   `bun <plugin directory>/scripts/settings-migrate.ts --repo <dir>`. It writes each YAML file, confirms
   the parsed values equal the JSON's, removes the JSON, and lists every file that still names the old
   path. Update those references in the same commit.
3. Stackweaver's list is `AGENTS.md`, `.claude/commands/{triage,maintenance}.md`,
   `agents/{issue-triage,maintenance,maintenance-project}.md` and `tests/agent-triage/`, including its
   `JSON.parse` call. Its standing maintenance grant is re-read from the merged default branch, so the
   proof runs after the merge.
4. When Q4's condition holds, a later plugin release stops reading JSON. A `.vh-adlc/*.json` file then
   fails with a pointer to the migration.

Rollback before step 4 is reverting the adopter's commit, because the plugin still reads JSON.

### Conventions change

In `vhco-pro/docs`, `conventions/coding.md` gains this section before "Inputs and safety":

```markdown
## Configuration format

Configuration a person writes or reviews is YAML, in a `.yaml` file. Never choose JSON for it, and
move an existing JSON configuration file of ours to YAML when you change it. JSON stays only where we
do not choose the format: a file an external tool defines, generated files, and machine-to-machine
output. Load YAML settings strictly: one document, no aliases, and unknown or duplicate keys fail.
```

That text assumes Q1's recommendation. Routing needs no change, because every code task already
reads `conventions/coding.md`. The change is a pull request in `vhco-pro/docs`.
After it merges, the pin in `AGENTS.md` and `plugins/vh-adlc/knowledge.md` moves to the merge commit
with a plugin version bump, as `knowledge.md` requires. That bump also brings in the other commits
between `e4d58d2` and that merge, so it gets its own review.

## Acceptance Criteria

- [ ] AC-01: Triage and maintenance read `.vh-adlc/<name>.yaml` with the same results as the JSON file holding
      the same values, including normalized digests.
- [ ] AC-02: A YAML settings file with more than one document, an alias, a duplicate key or an unknown key
      fails visibly, and `.yml` is not read.
- [ ] AC-03: During the transition a repository with only JSON keeps working and is told how to migrate, and a
      repository with both formats fails naming both files.
- [ ] AC-04: `settings-migrate.ts` leaves a repository with equal parsed values, no JSON settings and a list of
      remaining references, and changes nothing when the values cannot be proven equal.
- [ ] AC-05: The maintenance standing grant holds from a merged `AGENTS.md` link to the YAML file, and fails
      when the link and the file disagree.
- [ ] AC-06: Stackweaver runs triage and maintenance from YAML settings on its default branch, with its
      contract tests and rollback rehearsal passing.
- [ ] AC-07: `conventions/coding.md` at the revision this repository pins carries the configuration format
      rule, and no vh-adlc setting a person edits is JSON once the transition ends.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Parametrize the existing `tests/vh-adlc/triage/settings.test.ts` and `tests/vh-adlc/maintenance/settings.test.ts` over both formats and compare normalized digests. |
| AC-02, AC-03 | Loader table tests for each refused form, `.yml`, JSON only, YAML only and both present. |
| AC-04 | Helper tests on fixture repositories, including a value that YAML would read differently, plus a run on a disposable Stackweaver checkout. |
| AC-05 | Extend `tests/vh-adlc/maintenance/publication.test.ts` with YAML adoption chains and a mismatched link. |
| AC-06 | Stackweaver's `tests/agent-triage` contract and rehearsal on the migration branch, then an installed-plugin run from the published release, as earlier adoptions did. |
| AC-07 | Read the rule at the pinned revision through `vh-adlc knowledge`, and run a test that lists `.vh-adlc/*.json` across fixtures and this repository's examples. |

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q1: How far does "never JSON" reach beyond settings people edit?

**Recommendation:** A. Files a person writes or reviews, because the others are generated or read only by programs, and changing the output contract needs a major release.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Hand-edited configuration only** | A rule with a clear test; binary output, the lock and evidence stay as they are | JSON remains in generated files |
| **B. A, plus vh-adlc's generated files** | The lock and stored evidence become YAML | `ensure-vh-adlc.sh` reads the lock by line, so the installer and release tooling change |
| **C. Everything we control, including command output** | No JSON we chose anywhere | `schema_version` 2, a major release, and every operation that parses output changes |

**Why this is yours:** your words were "never", and this sets where that stops.

### Q2: Should shared audit start on YAML before it ships?

**Recommendation:** A. Revise it now, because `.vh-adlc/audit.json` has not shipped and would break the rule on its first release.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Revise shared audit to `.vh-adlc/audit.yaml`** | No JSON settings file ever ships for audit, and no audit migration | A normative revision: shared audit returns to draft, its review goes stale and you accept it again, while implementation is under way |
| **B. Finish audit on JSON, then migrate it here** | Audit's accepted baseline and schedule stay untouched | A third file to migrate, and one more JSON setting shipped after the rule exists |

**Why this is yours:** it trades a delay to accepted, in-progress work against a rule you just set.

### Q3: What enforces strict YAML for the TypeScript operations?

**Recommendation:** A. The Go binary, because one strict parser is simpler to trust than a second scanner, and these operations already obtain the binary.

| Option | You get | It costs |
| --- | --- | --- |
| **A. A `vh-adlc settings read` command using `yaml.v3`** | One parser for all settings, with duplicate keys refused and aliases refused by walking the nodes | A lock bump, since the lock names 0.1.0, and a check that the confined triage controller can reach the result |
| **B. `Bun.YAML` plus a small scanner** | No binary dependency | A hand-written scanner for duplicates and aliases that can disagree with the parser |
| **C. `Bun.YAML` alone** | The least work | A duplicate key silently takes the last value, against the strict rule |

**Why this is yours:** it decides whether settings loading depends on the binary and its release cycle.

### Q4: When does the plugin stop reading JSON?

**Recommendation:** A. The next minor release after Stackweaver's migration merges, because it is the only adopter this host shows.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Next minor after Stackweaver** | The transition code and its tests leave quickly | A public marketplace user we cannot see gets a failure with a pointer to the migration |
| **B. Keep reading JSON for a fixed period, for example six months** | Time for unseen adopters | Two formats to test for that period |

**Why this is yours:** it weighs unseen public users against carrying transition code.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/conventions/feature-documents.md): one document per feature and the revision rule behind Q2.
- [Coding conventions on `vhco-pro/docs` main](https://github.com/vhco-pro/docs/blob/5f7c39a8f621d8b74e34d8da5f22ac90700c344a/conventions/coding.md): the current text and the section this feature extends.
- [Pinned prose guide](https://github.com/vhco-pro/docs/blob/e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a/guides/humanize-prose.md): prose editing for this document.
