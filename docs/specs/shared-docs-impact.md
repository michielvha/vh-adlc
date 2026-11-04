---
status: draft
status_description: "Revised around a common documentation coverage convention, a reusable checker and a shared review procedure. Local draft; not yet independently reviewed or accepted."
issue: null
goal: "Give repositories one shared way to declare which code their documentation covers, find docs affected by a change and review the required updates without building their own checker."
covers:
  - plugins/vh-adlc/skills/vh-adlc-docs-impact/
  - plugins/vh-adlc/references/docs-impact.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md
  - plugins/vh-adlc/examples/docs-impact/
  - plugins/vh-adlc/scripts/docs-impact/
  - plugins/vh-adlc/vh-adlc.lock.json
  - plugins/vh-adlc/knowledge.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tests/vh-adlc/docs-impact/
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/direct-operation-compatibility.test.ts
  - tests/vh-adlc/lifecycle/
  - .github/workflows/ci.yml
  - README.md
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - docs/reference/marketplace.md
  - docs/get-started/installation.md
---

# Shared documentation impact

After a code change, the shared checker finds documentation that may need updating. The shared
agent checks those docs against the implementation and makes the permitted corrections.

| Part | What it delivers | Home |
| --- | --- | --- |
| Common convention | A document declares the code it describes using `covers:` metadata. | `vhco-pro/docs` |
| Reusable checker | Read that metadata directly and return affected docs for the selected change. | `vh-adlc` |
| Review procedure | Read the code and candidate docs, then explain or fix the actual differences. | `vh-adlc` |
| Project tooling | Generate the documentation site, navigation and maintained screenshots. | Stackweaver or the adopting repository |

For example, a deployment guide declares `covers: [deploy/**]`. Changing a Helm value makes the
checker list that guide. The agent then decides whether the guide needs an edit. Another project
can use the same checker without Stackweaver's generated index or website tooling.

## Context

The owner selected docs impact on 2026-11-04 after triage, maintenance and audit. On the same date,
the owner chose a common convention plus shared checker over the first draft's approach of leaving
each repository responsible for its own checker. This replaces that unaccepted draft, not an
accepted implementation. Drift audit, drift resolution and docs-truth remain deferred in the
[parent roadmap](shared-workflow-migration.md).

Inspected shared main is `8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1`, plugin 0.8.0.
`plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:32-43` requires documentation review and a fresh
implementation review when a documentation fix changes covered paths. It does not supply a common
coverage checker. The lifecycle table at `plugins/vh-adlc/references/lifecycle.md:40-62` has no
specific docs-impact operation. The pinned `conventions/documentation.md` has no general coverage
contract; `conventions/feature-documents.md:38-44` already gives feature documents their own `covers`
role, which this feature must preserve.

At inspected Stackweaver commit `b88aa6d596249f1f7178d3fcdb7a5c9b8221fe2f`,
`agents/docs-impact.md:17-55` selects changes, maps candidates and checks their accuracy.
`scripts/build-docs-index.js:1339-1386` builds `docs-coverage.json` from Markdown frontmatter.
`scripts/check-doc-coverage.js:33-104` uses that index; it exits 1 for candidates but silently exits 0
when the index is missing. The shared checker removes that index dependency for docs impact.
Existing site generation, frontend visual refresh/check and public/internal rules remain local
(`agents/docs-impact.md:57-102`).

This document is local to `/home/m/code/vh-adlc-docs-impact-spec`. No new checker, convention,
consumer adapter or external publication has been implemented. The owner authorized sending the
bounded private consumer workflow packet to Copilot Opus 5.5 for review on 2026-11-04; no customer
docs, images, application source, reports, ledger, credentials or host configuration belong in it.

## Scope

Deliver the common convention, shared checker, shared agent procedure, existing lifecycle/ship
integration and a verified Stackweaver migration. The normal path reads Markdown directly and
requires neither a generated index nor a custom checker in each repository. Keep per-project
configuration to explicit checker inputs and existing local instructions; do not introduce a new
YAML configuration framework just to describe existing commands.

Keep site/index generation, visual recipes, local style and publishing rules in each project.
Exclude whole-corpus drift/truth workflows, scheduling, website redesign, product repairs, automatic
publication and new permission or evidence-enforcement systems.

## Design

### 1. Common documentation convention

Add `conventions/documentation-impact.md` in `vhco-pro/docs` and link it from its documentation
conventions. It applies to repositories adopting this workflow; publication does not silently
change every existing project's metadata requirements.

The convention defines `covers` as a YAML list of repository-relative source paths/globs in the
leading Markdown frontmatter. A guide may cover several areas. Define case-sensitive POSIX paths,
exact matches, directory prefixes, `*` and `**`, including zero-directory globstar behavior.
Reject malformed declarations and unsupported patterns rather than silently omitting them.
Unrelated frontmatter fields remain valid. A `covers` example inside prose or a code block is not
metadata. Neither a match nor an unmatched source path proves that documentation is accurate.

Ordinary documentation coverage and feature-review freshness remain distinct uses. The checker
may flag a feature or historical document for human attention, but must not reinterpret its
criteria, status, historical claims or the existing feature gate's matching rules. Preserve
`conventions/feature-documents.md` and the existing feature checker behavior.

The page also defines the checker result contract below, the agent's separate accuracy review,
and the project's responsibility for generated documentation and visual verification. Publish this
small convention through its own reviewed documentation change before pinning the plugin to it.
Record the actual convention revision and update the plugin pin only after that revision exists.
Do not invent a future SHA or label the currently pinned page as already containing the convention.

### 2. One reusable, read-only checker

Package the checker under `plugins/vh-adlc/scripts/docs-impact/`, using the repository's existing
Bun runtime and verified strict YAML reader. Its portable CLI is invoked from the actual installed
plugin directory, for example `bun <plugin>/scripts/docs-impact/cli.ts check --repo <repo>
--base <ref> --docs-root <path>`. It can run from an agent, terminal, hook or CI; it requires no
particular harness, model or active agent session. Prepare its existing runtime dependencies
explicitly; checking performs no download, index generation, screenshot capture or repository write.

Inputs are the repository, explicit documentation roots and either a Git base or explicit selected
source paths. Repeated path arguments and NUL-delimited input support filenames safely. Default
Git selection combines committed branch changes with the selected staged/unstaged changes and
accounts for rename old/new names and deletions. Include untracked inputs only when explicitly
selected. Preserve unrelated dirty files and index entries; ambiguous ownership or an unavailable
base becomes a reported gap, not a silently narrowed scope.

Read current Markdown frontmatter directly from the declared roots. Include tracked documents and
explicitly selected new docs, avoid generated/ignored trees unless explicitly in scope, and refuse
repository escapes through traversal or symlinks. A generated coverage index is never required or
trusted as the source of current metadata. Stackweaver's index remains available to its own tools.

Return versioned JSON and a readable rendering with the same meaning:

| Outcome | Meaning | Exit |
| --- | --- | --- |
| `candidates` | Collection completed; lists each affected doc and the source paths/patterns that matched it. | 0 |
| `none` | Collection completed for declared coverage and no matches were found. It is not a documentation-accuracy verdict. | 0 |
| `incomplete` | Required roots, inputs or metadata could not be checked; diagnostics identify the gaps. Any known candidates remain visible. | 2 |

The report records selected scope/base, documentation roots, metadata coverage and unmatched source
paths. A root with no declared coverage is explicit incomplete coverage, not a clean `none`.
Missing roots, malformed YAML/covers, unsupported patterns and unreadable files cannot become empty
success. Deterministic ordering and current source/doc bindings make changed inputs visible.
There is no persistent receipt cache or semantic verdict generated by the checker.

### 3. Shared review procedure and existing gates

Provide `vh-adlc-docs-impact` and one `references/docs-impact.md` procedure. Direct use, lifecycle
intake and implement/ship doc checks reuse it. Preserve plain documentation editing, audit, triage,
maintenance and blog routing. Existing adopters without coverage metadata keep the current manual
review path with that limitation stated; do not claim their mechanical check passed or silently
make unrelated shipping depend on adopting new metadata. Only an explicitly adopted or requested new coverage workflow requires the new convention page. A repository pinned before that page exists gets an explicit adoption/pin-update handoff for the new operation; existing generic ship checks do not load the new page merely to continue their manual path.

The agent runs the checker, searches for literal references that metadata can miss and checks new
visible behavior for missing docs. For each candidate it reads both the relevant implementation
and documentation before recording Accurate, Stale, Incomplete or Unknown. Missing documentation
is reported with a suggested home. Intended contracts and historical records cannot be rewritten
to normalize a software bug; raise that as a software question instead.

A read-only/report request permits inspection and reporting. An authorized implementation, ship
or documentation-update request permits its minimal documentation edits and required local checks.
Settings, tool output and candidate prose create no commit, publication, merge or live-operation
authority. Read-only collection never invokes project generators. A permitted update follows local
index/visual rules, preserves unrelated changes and stops on missing checks or unexpected writes.
The existing covered-path rule still requires fresh implementation review before feature completion.

The human report states what changed, which docs need attention, why, the edits made/proposed and
remaining gaps. It distinguishes a finished report from a claim that all documentation obligations
are complete. Scanner output and docs are evidence, not new instructions.

### 4. Stackweaver adoption

Keep Stackweaver's public/internal style, frontend-triggered visual refresh/check, owner preview
requirements, frontmatter-triggered index rebuild and generated changelog policy in
`agents/docs-impact-project.md`. Route its existing `agents/docs-impact.md` entry through the
shared procedure. Preserve implement/ship/CLAUDE callers and their existing permissions.

Move candidate checking to the shared implementation. Retain `scripts/check-doc-coverage.js` as a
thin compatibility entry if its existing hook/terminal callers need it: preserve arguments/stdin
and human output, translate shared candidates to legacy exit 1 and successful no-match to exit 0,
and use a distinct failure for an unavailable/failed shared check. It must not report a missing
install or coverage as clean, nor retain a second copy of matching logic. Standalone setup and CI
must locate the verified shared payload explicitly, without assuming a Codex/Claude cache path or
an active agent. Test those callers before retiring their local implementation.

The website's `docs-coverage.json`, index builder, visual scripts, other documentation agents,
hooks/schedules and real customer content are not redesigned. Verify all previously selected
legacy candidates remain selected; explicitly record conservative additions from corrected glob
semantics. Invalid existing metadata blocks adoption until a separately reviewed correction is
within scope; do not drop declarations or silently edit unrelated docs to make migration pass.

Before cutover, bind the complete legacy/shared/local behavior comparison and migration paths to
exact current commits, using private parity tests in `tests/agent-docs-impact/`. Publish and verify
the convention and shared tool first, then test real Codex/Claude marketplace fresh installs/upgrades
and installed terminal/hook behavior. A source copy or local catalog is not marketplace proof.
Perform the paired semantic review and installed current-consumer checks before the migration merge,
then inspect the adopted route/checker read-only. Preserve the diverged main checkout.

Record rollback blobs for changed agent/caller/checker fragments and rehearse restore/reapply on a
disposable repository, preserving newer unrelated edits and index/dirty sentinels. Refuse conflicts
and symlink substitutions; never reset/stash another checkout or undo other documentation workflows.

### 5. Verification and delivery

This feature crosses two repositories: the shared convention has its own reviewed change in
`vhco-pro/docs`; the executable/procedure and consumer migration follow this child spec. Gate and
publish those dependencies in order, with actual revisions and separately authorized external writes.
Do not edit another active docs branch or bump all repository pins as a side effect.

Test the real checker with synthetic Markdown/Git repositories, including malformed/missing
coverage and preservation cases. Use actual bounded Copilot Opus 5.5 trials for accuracy judgment,
minimal doc repairs, read-only limits and untrusted input. Native Codex/Claude installation,
standalone execution and current Linux/macOS selections must exercise the shipped payload.
Actual Claude model execution, GUI/phone entry and live Stackweaver screenshot capture remain
unclaimed; a future UI change still owes its existing local visual checks.

## Acceptance Criteria

- [ ] AC-01: Adopting repositories have one published coverage convention, without needing Stackweaver's generator or changing existing feature-review freshness semantics.
- [ ] AC-02: The shared checker reads current Markdown coverage and returns the correct affected docs and source matches for a bounded Git/path scope without relying on a generated index or changing the repository.
- [ ] AC-03: No-match, affected-doc and incomplete-check results are distinguishable, with missing/unreadable/malformed coverage and unmatched source scope visible rather than reported as verified accuracy.
- [ ] AC-04: Direct and integrated agent review use the same portable procedure, ground permitted updates in code and local rules, preserve historical/intended contracts and honor read-only and existing review/publication gates.
- [ ] AC-05: Stackweaver uses the shared checker/procedure with verified legacy-caller compatibility and scoped rollback, retaining site generation, visuals, local policy and unrelated workflows.
- [ ] AC-06: Automated Linux/macOS checks, native installed/standalone execution and actual bounded Copilot trials establish the promised behavior at reviewed commits, with capability limits explicit.
- [ ] AC-07: Convention/tool publication, real marketplace acceptance and paired current-consumer verification precede migration, and exact revisions, post-merge checks and rollback evidence are retained.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Review and lint the actual convention change; verify its declared enforcement/examples against the checker and pin the published revision. Existing feature gate/matcher tests remain unchanged and pass. A synthetic second repository uses only Markdown coverage and the shared tool, with no Stackweaver scripts, website generator or generated index. |
| AC-02 | Red-first checker tests cover exact paths, directory prefixes, wildcard/globstar, several roots, current frontmatter, code-fence false positives, rename/delete, committed/staged/unstaged paths, explicit untracked selections and unusual filenames. Change metadata after creating a deliberately stale index: the direct scan must use current metadata. Preserve source/index/dirty sentinels. |
| AC-03 | Execute the CLI and inspect real JSON/text/exits for matching, no-match and incomplete results, including mixed known matches plus errors, missing root, no declared coverage, invalid YAML/covers/globs, unreadable data and repository escapes. No error disappears into an empty success; unmatched source paths remain explicit. |
| AC-04 | Actual Copilot trials review fake code/docs, catch a changed default, make the correct minimal authorized doc edit and expose missing/unknown/wrong-system cases. Exercise direct/intake/implement/ship, manual legacy fallback, report-only requests and malicious doc/output instructions. Confirm no unintended generator/commit/remote action, and covered doc fixes still require fresh feature review. |
| AC-05 | Compare every material legacy behavior and candidate against current shared/local behavior with independently reviewed parity. Execute the actual legacy CLI wrapper/hook contract from a neutral environment with an explicitly located shared payload; test absence/failure and old arguments/stdin/exits. Synthetic local hooks preserve visual refresh/check even for accurate prose, index/preview conditions and missing-browser blockers. Rehearse conflict-safe rollback/reapply and prove unrelated workflows/generators/customer content unchanged. |
| AC-06 | Run repository-required tests/vet/lint and the package checker; include portable new tests in macOS CI. Retain original actual Copilot inputs/returns/red-green doc results and tool provenance. Isolated native Codex/Claude installs discover the operation and execute the installed checker outside an agent session. Independent exact-commit implementation review observes the evidence; no fixture outcome becomes a GUI/live-product claim. |
| AC-07 | Source completion checks the cutover safeguards and exact-source candidates. Delivery then verifies the convention, normal shared CI/release, real marketplace fresh/upgrade payloads, paired review, installed current-consumer preflight and post-merge routing/checker. Reject missing/stale/mismatched evidence, incompatible tool versions and conflicting migration state; record actual observed default revisions rather than demanding an old global default remain current. |

## Tasks

None yet; planned after independent review and owner acceptance. No implementation is authorized by this draft.

## Open Questions

None introduced by the owner's chosen direction. Material reviewer-identified decisions return to the owner.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/feature-documents.md) and [template](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/feature-document-template.md): scope, review and acceptance gates; the new convention must preserve feature metadata semantics.
- [Pinned documentation conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/documentation.md), [coding](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/coding.md), [delivery](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/delivery.md) and [prose guide](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/humanize-prose.md): small reusable tooling, local policy and reviewed publication. [Go conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/go.md) were inspected for the existing reader; this draft does not propose Go runtime changes.
- [Existing strict YAML reader](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/plugins/vh-adlc/scripts/settings-file.ts), [ship check](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md) and [feature matcher](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/internal/doc/covers.go): reuse current parsing and review gates without changing feature matching.
- Stackweaver workflow sources inspected locally at `b88aa6d596249f1f7178d3fcdb7a5c9b8221fe2f`: `agents/docs-impact.md`, `scripts/check-doc-coverage.js` and `scripts/build-docs-index.js`, with line ranges cited in Context. Private source is not reproduced here.
