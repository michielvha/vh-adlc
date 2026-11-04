---
status: draft
status_description: "Claude Code Opus 5.5 R-2 returned no blockers. Matching, setup and migration details are corrected within the approved design; renewed independent review is pending before implementation."
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
  - plugins/vh-adlc/scripts/settings-file.ts
  - plugins/vh-adlc/vh-adlc.lock.json
  - plugins/vh-adlc/knowledge.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - tests/vh-adlc/docs-impact/
  - tests/vh-adlc/settings-file.test.ts
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

No new checker, convention, consumer adapter or external publication has been implemented.

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
exact matches, directory prefixes, `*`, `?`, bracket patterns and `**`, including zero-directory
globstar behavior. Backslash escapes a literal metacharacter; bracket negation uses `[^...]`,
compatible with existing feature syntax. A `**` within a segment keeps the legacy meaning of
matching across separators; a whole `**/` segment also matches zero directories. YAML quoting
must preserve the pattern's backslash. Validate malformed brackets, escapes and declarations
instead of silently omitting them; unsupported syntax is an explicit error.
Unrelated frontmatter fields remain valid. A `covers` example inside prose or a code block is not
metadata. Neither a match nor an unmatched source path proves that documentation is accurate.

Ordinary documentation coverage and feature-review freshness remain distinct uses. Feature and
historical documents inside the declared roots remain documentation candidates. The ordinary
coverage matcher accepts their existing `?`, bracket and trailing-slash patterns; its `**` matches
are coverage-only even though the existing feature gate ignores `**`. Results identify this
coverage-only interpretation and never establish feature freshness or completion. Never select a
feature document because its own path changed. Do not reinterpret criteria, statuses or historical
claims. Preserve `conventions/feature-documents.md` and the existing feature matcher behavior;
test the two matchers independently. Identify feature-document candidates offline from root
`AGENTS.md`: honor `Feature document format: local`, the declared `Feature documents:` root and
the pinned standard's `docs/internal/plans` default when no root is declared. This classification
only identifies coverage-only candidates and self-trigger exclusion; it never converts local
plan formats, invokes a feature gate or fetches engineering pages. Test the declaration/default
rules against the existing feature-root resolver without changing it.

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
Standalone and CI setup must provide Bun, Git, Bash and the locked, verified `vh-adlc` binary.
Resolve that binary once through `ensure-vh-adlc.sh --offline`, then parse frontmatter through the
existing strict `settings read` report contract. A small reader-helper extraction may be needed;
preserve existing settings callers. An absent or mismatched binary produces `incomplete`, including
when the plugin files themselves are present. Checking never installs it or writes the binary cache.

Inputs are the repository, explicit documentation roots and a Git base or explicitly selected
source paths. Repeated path arguments and NUL-delimited input support filenames safely. With a
base, compare HEAD against its merge-base with that base; include old/new rename paths and
deletions. Add staged or unstaged tracked paths only when the caller explicitly selects them.
Without a base, a path-only run checks exactly the selected paths. Untracked paths require explicit
selection too. Report excluded dirty scope and preserve every unrelated file and index entry.
Do not infer ownership from Git status. A missing/nonunique merge-base or unresolved selected path
is a gap. Integrated callers must pass the requested scope explicitly and report a gap when they
cannot identify it; they may not silently include unrelated dirty work or narrow the request.
Explicitly selected paths remain eligible even when inside documentation roots; this is not a
fixed shared exclusion. Candidate metadata always comes from current Markdown as described below.

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
make unrelated shipping depend on adopting new metadata.

Declare adoption with one standalone line in root `AGENTS.md`, outside code fences:
`Documentation impact roots: ["docs/"]`. Its YAML flow sequence, parsed with the existing strict
reader, names repository-relative documentation roots. Quoted values support spaces without
inventing a project settings format. Implement, ship and intake
read this same declaration and pass those roots to the checker. No declaration keeps the existing
manual path; a malformed, empty, duplicate or conflicting declaration reports a gap. Explicit CLI
roots are sufficient for a one-off direct check without changing the repository's adoption state.

Only an adopted or explicitly requested coverage workflow requires the new convention page. A
repository pinned before that page exists gets an adoption/pin-update handoff for the new operation;
existing generic ship checks do not load that page merely to continue their manual path. For an
unpinned consumer, use the installed plugin's engineering pin and report that choice; this operation
adds no onboarding files and does not convert the consumer's development loop.

For an adopted repository, implement adds a `Documentation impact` section requiring this procedure
at the existing per-task verification stage before the task commit, for that task's selected paths.
Permitted doc/metadata fixes join that task's checks and commit; an incomplete assessment prevents a
completion claim. Undeclared repositories keep their current implement behavior. Ship reuses the
same assessment at its existing documentation gate, rechecking changed inputs and retaining its
covered-path review-refresh rule. In `direct-operation-compatibility.test.ts`, permit only this
named added section in implement and ship, assert its required behavior, then compare the rest of
each body to the existing approved baseline. Do not replace the baseline wholesale.
Classify `vh-adlc-docs-impact` as a declared content operation in the package checker, with a
harness-neutral entry and no model field; it does not gain status-changing gates.

The agent runs the checker, searches for literal references that metadata can miss and checks new
visible behavior for missing docs. A moved or renamed code area requires reviewing and updating
its affected `covers` mappings to the actual new source paths. Never delete a document or drop a
coverage entry solely to make checking pass; any justified metadata correction stays within the
underlying task's authority. For each candidate it reads both the relevant implementation
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
shared procedure. Preserve implement/ship/CLAUDE callers and their existing permissions. Add
`Documentation impact roots: ["docs/"]` to Stackweaver's root `AGENTS.md`; the forwarding route and
compatibility wrapper both use that declaration. Retain its local rule that coverage entries name
code/config paths, excluding documentation paths. This does not onboard its local plan format.
The complete migration inventory includes `agents/docs-impact.md`, the new project companion,
`agents/implement.md`, `agents/ship.md`, `.claude/commands/ship.md`, `CLAUDE.md`, the forwarding list
in `AGENTS.md`, the docs-impact reference in `agents/public-docs.md`, the checker entry and references
in `DOCUMENTATION_STANDARDS.md` and `PUBLIC_VISUAL_ASSETS.md`. Preserve or update each route/reference;
all changed fragments enter the parity comparison and rollback blob set. Include the roots
declaration, its wrapper consumption and `.githooks/pre-commit` in the inventory. The hook is
intended to remain byte-identical. Operator inspection at baseline
`b88aa6d596249f1f7178d3fcdb7a5c9b8221fe2f` found its checker call at lines 72-77 retains nonzero
exits as advisory and prints captured stdout, while discarding stderr. Its blob is
`e53f692d1c2e046fb50c60ac64ee41e77f6f7c67`; cutover must re-inspect the actual current hook and
execute its exit-2 advisory case before retaining that unchanged-hook assumption. The public-docs workflow
retains its existing logic apart from pointing to the adopted docs-impact route.

Move candidate checking to the shared implementation. Retain `scripts/check-doc-coverage.js` as a
thin compatibility entry if its existing hook/terminal callers need it: preserve arguments/stdin
and human output, translate shared candidates to legacy exit 1 and successful no-match to exit 0.
Keep Stackweaver's existing exclusion of source paths under `docs/` in this local wrapper and
procedure. Empty input or input containing only excluded docs paths remains a no-op exit 0;
that no-op makes no complete-coverage claim. When source paths remain, an incomplete shared result
exits 2, shows its diagnostics and retains any known candidates. Missing/failed payload or binary
also exits 2. Print incomplete diagnostics and any known matches on stdout as well as reporting
the incomplete outcome, so the existing advisory hook cannot hide them by discarding stderr.
Never translate incomplete checking into candidates-only exit 1 or a clean exit 0, and do not
retain a second copy of matching logic.

The wrapper obtains the installed payload from the single `VH_ADLC_PLUGIN_ROOT` environment
variable, naming the actual installed `vh-adlc` plugin directory. Validate its expected package
identity and required checker/lock files before invoking the shared code. Missing or unusable
values produce exit 2 with an actionable setup diagnostic; never guess a harness cache path.
Local setup documents exporting it for terminal/hooks, and CI sets it to its verified installed
payload. Agent callers pass it command-locally using the actual discovered plugin directory;
existing path arguments/stdin stay unchanged. Marketplace upgrade tests must refresh this location
when the installer changes it. This needs no active agent session or new tracked machine config.
Test every retained caller command through that mechanism before retiring the local implementation.

The website's `docs-coverage.json`, index builder, visual scripts, other documentation agents,
hooks/schedules and real customer content are not redesigned. Verify all previously selected
legacy candidates remain selected; explicitly record conservative additions from corrected glob
semantics. Explicitly compare literal `?`/bracket paths, escaped metacharacters, bracket negation
and mid-segment `**` against the legacy matcher. A valid declaration whose meaning changes is
also a cutover blocker, not just invalid metadata. Resolve it with a separately reviewed mapping
correction or bounded compatibility treatment that preserves the old candidates; never silently
reinterpret it, drop declarations or edit unrelated docs to make migration pass.

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

This feature spans `vhco-pro/docs`, `vh-adlc` and Stackweaver. The shared convention has its own
reviewed change in `vhco-pro/docs`; the executable/procedure and consumer migration follow this child spec. Gate and
publish those dependencies in order, with actual revisions and separately authorized external writes.
Do not edit another active docs branch or bump all repository pins as a side effect.

Test the real checker with synthetic Markdown/Git repositories, including malformed/missing
coverage and preservation cases. Use actual bounded Copilot Opus 5.5 trials for accuracy judgment,
minimal doc repairs, read-only limits and untrusted input. Native Codex/Claude installation,
standalone execution and current Linux/macOS selections must exercise the shipped payload.
Actual Claude docs-impact execution, GUI/phone entry and live Stackweaver screenshot capture remain
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
| AC-01 | Review and lint the actual convention change; verify its declared enforcement/examples against the checker and pin the published revision. Existing feature gate/matcher tests remain unchanged and pass. Test a feature document containing `**`, `?`, bracket and trailing-slash entries: ordinary coverage selects candidates with its own declared semantics, marks them coverage-only and excludes self-triggering, while the feature gate retains its existing results. Cover declared/default feature roots and local-format repositories offline, with no downloaded rules or plan-format conversion. A synthetic second repository uses only Markdown coverage and the shared tool, with no Stackweaver scripts, website generator or generated index. |
| AC-02 | Red-first checker tests cover exact paths, directory prefixes, wildcard/globstar including mid-segment double-star, escaped literal metacharacters, bracket negation, several roots, current frontmatter, code-fence false positives, rename/delete, committed/staged/unstaged paths, explicit untracked selections and unusual filenames. Diverge both base and feature branches to establish merge-base comparison. In a mixed dirty checkout distinguish default committed selection, explicitly included dirty paths, reported excluded dirty scope and a genuinely unresolved request; unrelated work must not make every run incomplete. Explicitly selected documentation source paths can match other docs. Change metadata after creating a deliberately stale index: the direct scan must use current metadata. Preserve source/index/dirty sentinels. |
| AC-03 | Execute the CLI and inspect real JSON/text/exits for matching, no-match and incomplete results, including mixed known matches plus errors, missing root, no declared coverage, invalid YAML/covers/globs, unreadable data and repository escapes. Also remove the verified binary in an isolated offline environment: the real checker must return incomplete without network or cache writes. Existing settings-reader regressions must pass. No error disappears into an empty success; unmatched source paths remain explicit. |
| AC-04 | Actual Copilot trials review fake code/docs, catch a changed default, make the correct minimal authorized doc edit and expose missing/unknown/wrong-system cases. Exercise direct/intake/implement/ship with a valid adoption/roots declaration, no declaration, a malformed/conflicting declaration and an old pin; standalone explicit roots must work without enabling integrated adoption. Also exercise manual legacy fallback, report-only requests and malicious doc/output instructions. Confirm no unintended generator/commit/remote action, and covered doc fixes still require fresh feature review. Exercise mapping upkeep after a code-area move and refuse doc/coverage deletion used to silence a finding. The direct-operation compatibility guard allows only the named documentation sections and the package checker recognizes the new content operation; all other protected bodies remain unchanged. |
| AC-05 | Compare every material legacy behavior and candidate against current shared/local behavior with independently reviewed parity. Execute the actual legacy CLI wrapper/hook contract from a neutral environment with an explicitly located shared payload; test missing payload, missing verified binary and old arguments/stdin/exits without network or cache writes. Cover every caller/routing/guideline fragment listed in Design. Assert local docs-source exclusion, empty/docs-only no-op exit 0, candidates exit 1 and incomplete exit 2 both with and without known candidates, including the actual advisory hook's response to each. For every unchanged caller command, set the one payload variable and prove the declared roots reach the installed checker; missing/stale variables fail visibly. Compare valid-but-reinterpreted legacy patterns as well as invalid metadata and refuse cutover on candidate loss. Confirm rename mapping upkeep and the local code/config-only metadata rule. Synthetic local hooks preserve visual refresh/check even for accurate prose, index/preview conditions and missing-browser blockers. Rehearse conflict-safe rollback/reapply and prove unrelated workflows/generators/customer content unchanged. |
| AC-06 | Run repository-required tests/vet/lint and the package checker; include portable new tests in macOS CI. Retain original actual Copilot inputs/returns/red-green doc results and tool provenance. Isolated native Codex/Claude installs discover the operation and execute the installed checker outside an agent session. Independent exact-commit implementation review observes the evidence; no fixture outcome becomes a GUI/live-product claim. |
| AC-07 | Source completion checks the cutover safeguards and exact-source candidates. Delivery then verifies the convention, normal shared CI/release, real marketplace fresh/upgrade payloads, paired review, installed current-consumer preflight and post-merge routing/checker. Reject missing/stale/mismatched evidence, incompatible tool versions and conflicting migration state; record actual observed default revisions rather than demanding an old global default remain current. |

## Tasks

None yet; planned after independent review and owner acceptance. No implementation is authorized by this draft.

## Open Questions

None. The owner approved all six review refinements.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-04 | R-1 | spec | `2811de8baa95c8a1e2887b09891badc59b2af6d3` | claude-opus-5-5 | procedural | No blockers; seven should-fix findings and one nit. |
| 2026-11-04 | R-2 | spec | `a47be378a6875a97f3dfc86054753190c70e54ac` | claude-opus-5-5 | procedural | No blockers; seven should-fix findings and one nit on matching, setup and migration details. |
| 2026-11-04 | R-3 | spec | `cb4d31651366af9562f17e88aa4b53412a1615bc` | claude-opus-5-5 | procedural | No blockers; six should-fix findings and two nits on caller setup, metadata scope and retained readers. |

### R-1

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 1. Common documentation convention
EVIDENCE: The feature matcher shared/internal/doc/covers.go:13-27 skips any entry that contains `**`, treats a trailing `/` as a subtree, and accepts `*`, `?` and `[` through path.Match. The proposed ordinary contract at shared-docs-impact.md:96-98 supports exact paths, directory prefixes, `*` and `**`, and rejects every other pattern. Under it, a feature document's `?` or `[` entry would make the scan incomplete, and its `**` entry would match even though the feature gate ignores it. Lines 102-105 say the checker may flag feature documents for attention, but they do not say which syntax applies when the checker reads a feature document's `covers` inside a declared root. The feature-document standard also says a feature document never covers itself (engineering/conventions/feature-documents.md:43).
PROPOSAL: State how the checker treats documents under the declared feature root. One option is to exclude them by default. Another is to evaluate them with MatchCovers-compatible semantics and report syntax that only the feature gate accepts as a feature-specific note, so it never makes the scan incomplete. Add a Test Plan case with a feature document whose `covers` holds `**`, `?` and trailing-slash entries.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 3. Shared review procedure and existing gates; Scope
EVIDENCE: The design says only an explicitly adopted workflow uses the new checker (shared-docs-impact.md:152-154). The CLI needs explicit `--docs-root` values (lines 117-118 and 122). Per-project configuration is limited to explicit inputs and existing local instructions (lines 79-81). The document never defines how integrated implement, ship or intake decides that a repository has adopted the workflow, or where it reads the documentation roots. The current ship step loads only conventions/documentation.md (shared/plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:22-24). An older pin fails with missing-page if the new page is requested (shared/plugins/vh-adlc/references/loop.md:66-67). Without a defined signal, each agent guesses when to take the manual path or the checker path, and which roots to pass.
PROPOSAL: Have the new convention define one small adoption declaration in existing local instructions that names the documentation roots, for example a single AGENTS.md line like the feature-root line. Ship, implement and intake then branch on that declaration. Add Test Plan cases for a declared repository, an undeclared repository and an old-pin repository.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 2. One reusable, read-only checker
EVIDENCE: shared-docs-impact.md:123-127 combines committed changes with the selected staged and unstaged changes, and turns ambiguous ownership into a reported gap. It does not define which dirty paths count as selected by default, or how ownership is judged mechanically. It also leaves the base comparison unspecified: merge-base three-dot or direct two-dot. The current callers each take a different scope: the consumer docs-impact agent uses the branch range against the base, and ship plus CLAUDE use staged and unstaged changes only (consumer/agents/docs-impact.md:18-21, consumer/agents/ship.md:52, consumer/CLAUDE.md:306). The consumer's main checkout is shared with other live sessions (consumer/CLAUDE.md:130). Under one reading every run there is incomplete; under another, unrelated work is silently included.
PROPOSAL: Define the default Git selection precisely: the base comparison form, whether all staged and unstaged tracked changes are included, and what reports a gap. Name the AC-02 cases that tell included, excluded and gap outcomes apart in a checkout that holds unrelated dirty work.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design, 2. One reusable, read-only checker; 4. Stackweaver adoption
EVIDENCE: The legacy checker removes changed paths under `docs/` before matching (consumer/scripts/check-doc-coverage.js:59-64). The legacy agent states the same rule (consumer/agents/docs-impact.md:23). The spec gives this behavior no shared or local home. It would also be wrong as a fixed shared rule: this shared feature document covers documentation paths such as README.md and docs/user-guides/workflows.md (shared-docs-impact.md:23-27). Under the proposed contract, Stackweaver's changed docs would show up as unmatched source paths.
PROPOSAL: Say whether changed paths inside the declared documentation roots are excluded, reported separately or matched like any other path. Keep the Stackweaver exclusion explicitly in the wrapper or local procedure, and add a parity case for it.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 4. Stackweaver adoption
EVIDENCE: The wrapper maps `candidates` to legacy exit 1, successful no-match to exit 0, and an unavailable or failed shared check to a distinct failure (shared-docs-impact.md:180-186). The `incomplete` outcome, exit 2 with known candidates possibly listed (line 140), has no stated legacy mapping or human output. The legacy checker also exits 0 when there is no input, and when every input is a documentation path (consumer/scripts/check-doc-coverage.js:55-64). The design does not say whether those cases still exit 0 or now reach the shared checker as missing inputs. Legacy callers include an advisory pre-commit hook (consumer/CLAUDE.md:309), whose response to a new code depends on this mapping.
PROPOSAL: Specify the wrapper's exit code and output for `incomplete` with and without known candidates, and for empty or documentation-only input. Add those cases to the AC-05 wrapper tests.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design, 2. One reusable, read-only checker; Test Plan AC-03 and AC-05
EVIDENCE: The verified strict reader is readYAML in shared/plugins/vh-adlc/scripts/settings-file.ts:33-36. On every call it runs bash on ensure-vh-adlc.sh, without `--offline` unless asked, and then runs the Go binary's `settings read`. The checker therefore needs Bash plus the locked, verified binary, and could download it unless offline mode is used. The spec says checking performs no download and that dependencies are prepared explicitly (shared-docs-impact.md:119-120). It never says the standalone checker depends on the binary. No test covers an unavailable binary as distinct from a missing shared payload. Standalone hook and CI setup in an adopting repository has to provide this binary too.
PROPOSAL: State that the checker resolves the verified binary once in offline mode and reports `incomplete` when the binary is unavailable. Name the binary in the standalone and CI setup requirements. Add AC-03 and AC-05 cases for a missing binary in an offline environment, with no network or cache writes.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Design, 4. Stackweaver adoption
EVIDENCE: The design preserves the implement, ship and CLAUDE callers (shared-docs-impact.md:178). The packet has further callers and routing for the same workflow: the slash-command ship entry runs the legacy checker directly (consumer/.claude/commands/ship.md:10-11); the public-docs workflow runs the docs-impact check before changelog review (consumer/agents/public-docs.md:226-227); and AGENTS.md lists the only workflows forwarded to installed vh-adlc operations (consumer/AGENTS.md:12-20). Two guidelines also name the docs-impact workflow as an enforcement point (DOCUMENTATION_STANDARDS.md:54, PUBLIC_VISUAL_ASSETS.md:30). The spec's parity and rollback inventory does not include these files.
PROPOSAL: List every caller and routing file the migration must preserve or update, including the command file, public-docs.md, the AGENTS.md forwarding list and the guideline references. Cover each in the AC-05 parity comparison and the rollback blob set.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Context
EVIDENCE: shared-docs-impact.md:70-73 names a host-local checkout path and records the reviewer model choice and private-packet authorization inside the canonical shared document. Once published, that text is host-specific and goes stale. The prose guide treats an account of how the document was produced as writing about the document (engineering/guides/humanize-prose.md:353-356).
PROPOSAL: Remove the host path and the review-dispatch narration from Context. The Review Log already records model, commit and isolation.

### R-2

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 1. Common documentation convention; 4. Stackweaver adoption
EVIDENCE: The legacy matcher escapes `?`, `[` and `]` as literal characters and turns `**` anywhere in a pattern into `.*`, which also matches across `/` inside a segment (consumer/scripts/check-doc-coverage.js:23-30). The new contract gives `?` and brackets glob meaning and defines `**` only as globstar with zero-directory behavior (shared-docs-impact.md:94-98). It defines no escape for literal metacharacters and says nothing about `**` inside a segment. A legacy declaration for a literal path that contains brackets is still valid bracket syntax, so it would quietly match different files and the legacy candidate would be lost. A mid-segment `**` would be either rejected or narrowed. The spec says all previously selected legacy candidates must remain selected, and only invalid metadata blocks adoption (lines 224-227). A quietly reinterpreted pattern is not invalid, so nothing blocks adoption, and the contract gives no way to express the old meaning. The feature matcher already accepts Go `path.Match` escapes and `[^...]` negation (shared/internal/doc/covers.go:20-22). The ordinary matcher is supposed to accept existing feature bracket patterns (line 104), but the contract names neither of these.
PROPOSAL: Define one escape syntax and the bracket negation form so they stay compatible with the existing feature syntax, and state whether `**` inside a segment is rejected or interpreted. Add an AC-05 parity case that finds legacy declarations whose meaning changes, such as literal `?` or brackets and mid-segment `**`, and reports them before cutover.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 1. Common documentation convention; 2. One reusable, read-only checker
EVIDENCE: The checker must mark feature-document matches as coverage-only and must never select a feature document because its own path changed (shared-docs-impact.md:102-109). The AC-01 test expects both behaviors (line 268). The checker's inputs are only the repository, the documentation roots and a base or selected paths (lines 121-122 and 131). It may not download anything (line 124). So it cannot learn which documents are feature documents from those inputs, and it cannot fetch the pinned rules block. Feature location depends on the `Feature documents:` line, the `docs/internal/plans` default, or the `Feature document format: local` declaration (engineering/conventions/feature-documents.md:20-28 and 217-219). The consumer AGENTS.md has neither declaration (consumer/AGENTS.md:1-60). Under the default, the consumer's own locally formatted plans would be classed as vh-adlc feature documents.
PROPOSAL: State how the checker identifies feature documents offline: read the root AGENTS.md declarations, apply the default, and honor the local-format line. Alternatively, take an explicit input. Add test cases for a declared root, the default root and a local-format repository.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 3. Shared review procedure and existing gates; 4. Stackweaver adoption
EVIDENCE: Integrated routes read the documentation roots from one root AGENTS.md declaration. Without it they keep the manual path, and explicit CLI roots are only for one-off direct checks (shared-docs-impact.md:170-175). The Stackweaver section sends the existing docs-impact entry through the shared procedure and lists the AGENTS.md forwarding list in its inventory (lines 200-209). It never says whether Stackweaver adds the adoption declaration, which roots it declares, or where the compatibility wrapper gets its roots. The consumer AGENTS.md has no such line today (consumer/AGENTS.md:10-23). Read as written, the routed shared procedure would fall back to the manual path in Stackweaver, which defeats the migration. The consumer also has no engineering pin line. The loop classifies onboarding behavior per operation when `source` is `plugin` (shared/plugins/vh-adlc/references/loop.md:58-64). The spec covers a repository pinned before the page exists (lines 177-179) but not an unpinned consumer.
PROPOSAL: Put the Stackweaver adoption declaration and its exact roots into the migration inventory, parity comparison and rollback set, and have the wrapper use the same roots. State that the new operation adds no onboarding files to an unpinned consumer.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 4. Stackweaver adoption
EVIDENCE: The wrapper must keep the legacy arguments and stdin (shared-docs-impact.md:212-213). Standalone and CI use must locate the shared payload explicitly, without assuming a harness cache path (lines 219-221). A missing payload exits 2 (line 218). Every retained caller runs the wrapper with only a path list: consumer/agents/ship.md:52, consumer/.claude/commands/ship.md:10-11, consumer/CLAUDE.md:306 and consumer/agents/docs-impact.md:30. Because the argument list is frozen, the payload location has to come from somewhere other than an argument. The spec never names that source, whether an environment variable, a local untracked file or something else. It also does not say how unchanged callers obtain it. AC-05 tests an "explicitly located" payload (line 272) without a defined mechanism, so every existing caller could return exit 2 on every run.
PROPOSAL: Name the single mechanism the wrapper uses to find the installed payload and its behavior when the value is absent. Add an AC-05 case showing that each unchanged caller command line reaches the shared checker through that mechanism.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design, 4. Stackweaver adoption; Test Plan AC-05
EVIDENCE: A pre-commit hook in the consumer runs the same checker as an advisory warning (consumer/CLAUDE.md:309). AC-05 requires testing the actual advisory hook's response to each exit code (shared-docs-impact.md:272). The complete migration inventory, whose changed fragments enter the parity comparison and rollback set, does not list the hook (lines 204-208). The hook file is not in this bounded packet, so nothing establishes how it treats the new exit 2. That exit code now also covers a missing payload or binary on any commit with source paths, where the legacy script exited 0 silently when its index was missing (consumer/scripts/check-doc-coverage.js:35-38).
PROPOSAL: Add the hook to the inventory, parity comparison and rollback set, or state that it stays byte-identical and record why exit 2 remains advisory there. Inspect the hook at the exact baseline commit before cutover.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Scope; Design, 3. Shared review procedure and existing gates
EVIDENCE: Scope describes "existing lifecycle/ship integration" (shared-docs-impact.md:76). Design says implement and ship doc checks reuse the procedure, and that implement reads the adoption declaration (lines 164-165 and 172-173). The shared implement operation has no documentation check today (shared/plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:66-89), so this adds behavior rather than reusing it. A test freezes the implement and ship bodies against an approved baseline and allows only named carve-outs (shared/tests/vh-adlc/direct-operation-compatibility.test.ts:10-41). The skill-directory test accepts only scheduled or declared content operations (shared/tests/vh-adlc/check.test.ts:16-23 and 225-236). Both test files are covered, but the spec does not say what changes in implement, or which guard exception or new baseline the owner approves for that change.
PROPOSAL: State the exact new implement step, or say that implement is unchanged. Name the compatibility-guard change, such as a carved-out section or a new approved baseline, and the classification of `vh-adlc-docs-impact` in the package checker.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Design, 3. Shared review procedure and existing gates; 4. Stackweaver adoption
EVIDENCE: The legacy procedure requires two things. When a change moves or renames a code area, the agent updates the affected `covers` entries and keeps them limited to code paths (consumer/agents/docs-impact.md:74-76). The agent must also never delete a doc or drop a `covers` entry to make the check pass (consumer/agents/docs-impact.md:99). The shared procedure defines the checker run, literal-reference search, classification and permitted edits (shared-docs-impact.md:181-192). The Stackweaver companion keeps style, visuals, preview, index rebuild and changelog policy (lines 200-202). Neither home states metadata upkeep after a rename. The no-drop rule appears only as a migration constraint (lines 226-227), not as an ordinary update rule. The checker reports old and new rename paths (line 133), but nothing assigns the follow-up metadata correction.
PROPOSAL: Give metadata upkeep after a move or rename, and the rule against deleting docs or dropping `covers` entries, a home in the shared procedure. Keep the code-paths-only restriction in the Stackweaver companion, and add both to the AC-04 and AC-05 cases.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Design, 3. Shared review procedure and existing gates
EVIDENCE: The adoption line's value is defined as a JSON array (shared-docs-impact.md:170-172). The pinned coding convention says configuration a person writes or reviews is YAML and never JSON (engineering/conventions/coding.md:70-72). The example `["docs/"]` is also a valid YAML flow sequence, and the existing strict reader could parse it (shared/plugins/vh-adlc/scripts/settings-file.ts:32-49).
PROPOSAL: Define the value as a YAML flow sequence read through the existing strict reader. That keeps the same example syntax and avoids an exception to the pinned convention.

### R-3

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 4. Stackweaver adoption
EVIDENCE: The wrapper finds the payload only through `VH_ADLC_PLUGIN_ROOT` (shared-docs-impact.md:257-260). Agent callers are said to pass it command-locally with the discovered plugin directory, while the path arguments and stdin stay the same (lines 262-263). AC-05 then requires every unchanged caller command to reach the installed checker (line 319). The retained callers are Stackweaver workflow files, not vh-adlc skills: consumer/agents/ship.md:52, consumer/.claude/commands/ship.md:10-11, consumer/CLAUDE.md:306 and consumer/agents/docs-impact.md:30. Their command text sets no variable. The host names a plugin directory only when it loads a vh-adlc skill (shared/plugins/vh-adlc/references/loop.md:16-17), so these callers have no way to discover it. Two readings are possible. If the caller text stays unchanged, agents rely on an inherited shell export, which contradicts the command-local rule. If the agents must set the variable, the caller text has to change, and that change is not described. Under either reading an agent following the unchanged text can get exit 2 on every run.
PROPOSAL: Choose one mechanism for non-plugin callers. Either they inherit the same exported variable as terminal and hooks, with their text unchanged, or each caller's text changes to say how to obtain the value, and those changes enter the parity and rollback set. Test the chosen path from a fresh agent shell.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 4. Stackweaver adoption; Test Plan AC-05
EVIDENCE: The wrapper checks only package identity and the required checker and lock files (shared-docs-impact.md:258-259). Line 263 says a marketplace upgrade can change the install location, and line 264 rules out new tracked machine config. AC-05 requires that a stale variable fails visibly (line 319). An exported path to an older installed version that is still on disk passes the identity and file checks. The wrapper has no expected version or report schema to compare against, so it would quietly run an outdated matcher. As written, the stale case in AC-05 cannot be observed.
PROPOSAL: Define stale in terms the wrapper can check, for example a minimum checker report schema or plugin version written into the wrapper itself, with exit 2 below it. Otherwise, remove stale from AC-05 and state the limitation.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 2. One reusable, read-only checker
EVIDENCE: A path-only run checks exactly the selected paths, and an unresolved selected path is a gap (shared-docs-impact.md:142-146). The spec never defines unresolved. Every retained legacy caller pipes a diff of tracked changes against HEAD into the wrapper (consumer/agents/ship.md:52, consumer/CLAUDE.md:306), and that list includes deleted files. The legacy script matches each path as a string, without checking that the file exists (consumer/scripts/check-doc-coverage.js:69-77). If unresolved means absent from the working tree, any change that deletes a covered file becomes incomplete with exit 2 instead of legacy exit 1. Deleting a file is a common case, and this changes its exit code. AC-02 tests rename and delete only for base comparisons (line 316).
PROPOSAL: Define unresolved narrowly, for example as traversal, repository escape or malformed input, and state that a path-only deletion matches by its path string. Add an AC-05 wrapper case that pipes a deleted covered path and expects legacy exit 1.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 2. One reusable, read-only checker; Test Plan AC-02
EVIDENCE: Candidate metadata always comes from current Markdown in tracked documents (shared-docs-impact.md:149-152), and malformed YAML or covers cannot become success (line 166). AC-02 requires that unrelated work in a mixed dirty checkout does not make every run incomplete (line 316). The consumer's main checkout is shared with other live sessions (consumer/CLAUDE.md:130), and the advisory hook runs the checker there (consumer/CLAUDE.md:309). The spec does not say whether metadata of unselected tracked docs comes from the working tree or from HEAD or the index. If it comes from the working tree, another session's half-edited frontmatter makes every run incomplete, and its unstaged covers edits change other tasks' candidates. That contradicts the AC-02 guarantee.
PROPOSAL: State which version of each unselected tracked document's metadata the checker reads, and how a malformed dirty edit in an unrelated doc is reported. Add an AC-02 case with an unrelated malformed dirty doc.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 1. Common documentation convention; 4. Stackweaver adoption
EVIDENCE: Classification honors the local-format line, the declared root and the `docs/internal/plans` default (shared-docs-impact.md:112-117), but the spec never says what honoring the local-format line yields. Under the standard, that line means the standard does not apply (engineering/conventions/feature-documents.md:26-28). The Stackweaver section says only that the migration does not onboard its local plan format (line 231). The consumer AGENTS.md has neither the root line nor the local-format line (consumer/AGENTS.md:1-60), and its plans live under the default root (consumer/CLAUDE.md:291). Without a declaration, the checker would label Stackweaver's locally formatted plans as vh-adlc feature documents with coverage-only results. The concrete case raised in R-2 F-02 therefore remains open.
PROPOSAL: State that a local-format declaration classifies no document as a feature document, so its documents become ordinary candidates. Also state whether the Stackweaver migration adds that line, putting it in the inventory and rollback set, or accepts the default labeling. Add a parity case for Stackweaver plans.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 4. Stackweaver adoption
EVIDENCE: The index builder and other documentation agents stay unchanged (shared-docs-impact.md:267-268). A legacy pattern whose meaning changes is resolved by a reviewed mapping correction or a bounded compatibility treatment, compared against the legacy matcher (lines 269-274). The consumer has other retained `covers` readers: the index builder (consumer/CLAUDE.md:281 and 291), and a corpus audit plus a weekly drift agent that flags dangling `covers` globs and applies safe fixes (consumer/CLAUDE.md:311). A correction written in new syntax, such as a backslash escape, a bracket or a directory prefix, could be read differently by these unchanged readers. The weekly agent could then report or change the corrected entries as dangling, which would undo the migration's candidate preservation.
PROPOSAL: Require every Stackweaver mapping correction to have the same meaning for the retained local `covers` readers, or limit corrections to syntax that both interpret identically. Add that comparison to the AC-05 parity set.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Design, 4. Stackweaver adoption; Test Plan AC-05
EVIDENCE: The legacy wrapper needs only Node (consumer/scripts/check-doc-coverage.js:1). The shared checker requires Bun, Git, Bash and the verified binary (shared-docs-impact.md:133). The wrapper's listed exit-2 setup failures name a missing or failed payload or binary (lines 251-252 and 260), and AC-05 tests a missing payload and a missing binary (line 319). A missing or incompatible Bun on a developer host or in a hook environment is not named, so its behavior is unspecified.
PROPOSAL: Name a missing or unusable Bun as an exit-2 setup diagnostic printed on stdout, and add it to the AC-05 wrapper cases.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Design, 3. Shared review procedure and existing gates; covers frontmatter
EVIDENCE: For an unpinned consumer, the spec says the new operation adds no onboarding files (shared-docs-impact.md:189-190). The loop reference lists each operation's onboarding behavior when `source` is `plugin`, naming the operations that add none and the ones that onboard (shared/plugins/vh-adlc/references/loop.md:58-64). `vh-adlc-docs-impact` is not in that list, and `plugins/vh-adlc/references/loop.md` is not in `covers` (shared-docs-impact.md:6-29). A skill that follows the loop for every step it describes gets no rule there for this case.
PROPOSAL: Either add `references/loop.md` to `covers` and list the new operation with the operations that add no onboarding, or state that `references/docs-impact.md` defines this behavior and overrides that loop step.

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/feature-documents.md) and [template](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/feature-document-template.md): scope, review and acceptance gates; the new convention must preserve feature metadata semantics.
- [Pinned documentation conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/documentation.md), [coding](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/coding.md), [delivery](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/delivery.md) and [prose guide](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/humanize-prose.md): small reusable tooling, local policy and reviewed publication. [Go conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/go.md) were inspected for the existing reader; this draft does not propose Go runtime changes.
- [Existing strict YAML reader](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/plugins/vh-adlc/scripts/settings-file.ts), [ship check](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md) and [feature matcher](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/internal/doc/covers.go): reuse current parsing and review gates without changing feature matching.
- Stackweaver workflow sources inspected locally at `b88aa6d596249f1f7178d3fcdb7a5c9b8221fe2f`: `agents/docs-impact.md`, `scripts/check-doc-coverage.js` and `scripts/build-docs-index.js`, with line ranges cited in Context. Private source is not reproduced here.
