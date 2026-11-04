---
status: draft
status_description: "Claude Code Opus 5.5 R-4 returned no blockers. Central roots resolution, legacy metadata isolation and existing-operation upgrade checks are specified; renewed review is pending before implementation."
issue: null
goal: "Give repositories one shared way to declare which code their documentation covers, find docs affected by a change and review the required updates without building their own checker."
covers:
  - plugins/vh-adlc/skills/vh-adlc-docs-impact/
  - plugins/vh-adlc/references/docs-impact.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/loop.md
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
plan formats, invokes a feature gate or fetches engineering pages. A local-format declaration
classifies no document as a standard feature document; all are ordinary documentation candidates.
Without that declaration, the default-root classification is only an attention label, not a claim
that a document conforms to the standard. Test declaration/default rules against the existing
feature-root resolver without changing it.

That convention page is the single prose home for matching and result semantics. The package
reference links to it rather than copying its contract; add the page to the package checker's
canary list when moving the pin. The page also defines the agent's separate accuracy review,
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
Do not infer ownership from Git status. A missing/nonunique merge-base or malformed/escaping
selected path is a gap. Absence from the working tree is not a gap: explicitly selected deleted
paths still match as repository-relative path strings. Traversal, absolute paths and malformed
input are refused; missing source files alone are not. Integrated callers must pass the requested scope explicitly and report a gap when they
cannot identify it; they may not silently include unrelated dirty work or narrow the request.
Explicitly selected paths remain eligible even when inside documentation roots; this is not a
fixed shared exclusion.

Read Markdown frontmatter directly from the selected document view. The default tracked-document
view is HEAD, including all committed branch documentation updates. Only explicitly selected doc
paths overlay their current working-tree bytes or deletion; selected new docs join that overlay.
Accept doc-metadata selection separately from source selection, so a local source exclusion does
not discard a selected metadata update. Reports bind the HEAD and overlay paths/hashes and list
unselected dirty docs as excluded input. Their half-edited frontmatter is not parsed and cannot
change candidates or make the selected scan incomplete. Malformed selected metadata or malformed
HEAD metadata still produces incomplete. A task's explicit docs selection uses its current bytes;
this never claims those bytes are a staged-only snapshot. Include every tracked Markdown file
under declared roots; do not guess that tracked files are generated and omit them. Untracked or
ignored paths are excluded unless explicitly selected. Refuse repository escapes through traversal
or symlinks. A generated coverage index is never required or
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
use the shared CLI's `roots --repo <repo>` command. It alone locates declarations outside code
fences, invokes the strict reader and returns versioned `declared` roots, `absent` or an explicit
`incomplete` gap with the diagnostic rules below. The Node wrapper uses this same command rather
than parsing YAML itself; integrated callers use its returned roots. An absent declaration selects
manual review for integrated routes but is an exit-2 setup gap for Stackweaver's adopted wrapper. No declaration keeps the existing
manual path; a malformed, empty, duplicate or conflicting declaration reports a gap. Explicit CLI
roots are sufficient for a one-off direct check without changing the repository's adoption state.

Only an adopted or explicitly requested coverage workflow requires the new convention page. A
declared repository pinned before that page exists follows the existing loop's `missing-page`
stop: direct checking, implement and ship stop that invocation, report the pin-update handoff and
make no completion claim or silent manual fallback. Preserve existing edits; do not convert that
stop into permission to change a pin. Undeclared generic ship checks do not load that page merely
to continue their manual path. For an
unpinned consumer, use the installed plugin's engineering pin and report that choice; this operation
adds no onboarding files and does not convert the consumer's development loop. Add the new
operation to the no-onboarding list in `references/loop.md`; the skill and shared reference follow
that same rule.

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
and documentation before recording Accurate, Stale, Incomplete or Unknown, with per-candidate
citations to the doc and implementation locations supporting or contradicting that classification.
Follow local line/symbol citation conventions and state missing evidence rather than inventing a
location. Missing documentation
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
`agents/docs-impact-project.md`. Its report also says whether the index was rebuilt and whether
the coverage index changed. Route its existing `agents/docs-impact.md` entry through the
shared procedure. Preserve implement/ship/CLAUDE callers and their existing permissions. Add
`Documentation impact roots: ["docs/"]` to Stackweaver's root `AGENTS.md`; the forwarding route and
compatibility wrapper both use that declaration. Retain its local rule that coverage entries name
code/config paths, excluding documentation paths. Do not add a feature-root or local-format
marker during this migration: Stackweaver keeps its existing declarations and local plan workflow.
Its plans under the default root receive only the coverage-attention label described above, with
no format validation/conversion or changed statuses. Include this behavior in parity tests.
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
required thin compatibility entry for this migration; any retirement is a separate decision: preserve arguments/stdin
and human output, translate shared candidates to legacy exit 1 and successful no-match to exit 0.
Keep Stackweaver's existing exclusion of source paths under `docs/` in this local wrapper and
procedure. The legacy bare path list does not select doc metadata overlays: filter its docs paths
as before and use the HEAD metadata view. Accept the additive `--metadata-path <doc>` option for
explicit task-owned doc overlays, forwarding it to the shared CLI without parsing metadata.
Those selected overlays survive the local docs-source exclusion. A caller that updated coverage
metadata must request its overlay explicitly, through that option or direct shared checking;
report the metadata view and excluded dirty docs so HEAD-only checking cannot stand in for that
current-metadata assessment. An unrelated malformed dirty doc in a legacy unfiltered diff stays
excluded; explicitly selecting that malformed overlay produces incomplete. Empty input or input containing
only excluded docs paths remains a no-op exit 0;
that no-op makes no complete-coverage claim. When source paths remain, an incomplete shared result
exits 2, shows its diagnostics and retains any known candidates. Missing/failed payload or binary
also exits 2, including missing or unusable Bun, Git or Bash in a Node-capable caller environment.
Print incomplete diagnostics and any known matches on stdout as well as reporting
the incomplete outcome, so the existing advisory hook cannot hide them by discarding stderr.
Never translate incomplete checking into candidates-only exit 1 or a clean exit 0, and do not
retain a second copy of matching logic.

The wrapper obtains the installed payload from the single `VH_ADLC_PLUGIN_ROOT` environment
variable, naming the actual installed `vh-adlc` plugin directory. Validate its package identity,
required checker/lock files and checker protocol 1. That protocol includes the report schema and
matching/result contract in this spec; reject incompatible or missing protocol reports with exit 2.
Missing/unusable paths also exit 2 with an actionable setup diagnostic. An older installation that
still implements protocol 1 is compatible; this wrapper does not claim to discover the latest
marketplace version. Current cutover evidence must separately bind the exact shipped payload.

Local setup exports this variable before terminal, hook or agent sessions start; all retained
legacy caller commands inherit that same environment. Update their instructions with this setup
prerequisite while keeping their path arguments/stdin unchanged. They do not discover a plugin
directory or set a command-local variable themselves. CI sets the same variable to its verified
installed payload. A fresh agent shell without it must report exit 2, not guess a harness cache
path. Marketplace upgrade tests refresh the configured location when the installer changes it.
This needs no active agent session or new tracked machine config. Test each retained caller from
a fresh environment with and without this prerequisite before retiring the local implementation.

The website's `docs-coverage.json`, index builder, visual scripts, other documentation agents,
hooks/schedules and real customer content are not redesigned. Verify all previously selected
legacy candidates remain selected; explicitly record conservative additions from corrected glob
semantics. Explicitly compare literal `?`/bracket paths, escaped metacharacters, bracket negation
and mid-segment `**` against the legacy matcher. A valid declaration whose meaning changes is
also a cutover blocker, not just invalid metadata. Resolve it with a separately reviewed mapping
correction or bounded compatibility treatment that preserves the old candidates; never silently
reinterpret it, drop declarations or edit unrelated docs to make migration pass. Any mapping
correction must also retain its meaning for the unchanged index builder, corpus audit and weekly
drift workflow. Use syntax with equivalent interpretation across all retained readers or block
that correction; do not modify those deferred workflows to accommodate this port.

Before cutover, bind the complete legacy/shared/local behavior comparison and migration paths to
exact current commits, using private parity tests in `tests/agent-docs-impact/`. Publish and verify
the convention and shared tool first, then test real Codex/Claude marketplace fresh installs/upgrades
and installed terminal/hook behavior. A source copy or local catalog is not marketplace proof.
Perform the paired semantic review and installed current-consumer checks before the migration merge,
then inspect the adopted route/checker read-only. Preserve the diverged main checkout.

The new plugin pin also affects Stackweaver's already adopted triage, maintenance and audit because
this consumer is unpinned. Upgrade setup must prepare the new revision's pages for those operations,
including the audit offline cache. Marketplace upgrade/current-consumer preflight checks must show
all three existing entries resolve their required knowledge at the new pin. Exercise the unwarmed
offline audit setup handoff, warm pages through the existing explicit setup procedure, then prove
offline entry succeeds. This is knowledge/routing regression coverage, not new live-operation or
model-execution authority.

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
| AC-01 | Review and lint the actual convention change; verify its declared enforcement/examples against the checker and pin the published revision. Existing feature gate/matcher tests remain unchanged and pass. Test a feature document containing `**`, `?`, bracket and trailing-slash entries: ordinary coverage selects candidates with its own declared semantics, marks them coverage-only and excludes self-triggering, while the feature gate retains its existing results. Cover declared/default feature roots and local-format repositories offline, with no downloaded rules or plan-format conversion; a local-format declaration yields ordinary candidates only. A synthetic second repository uses only Markdown coverage and the shared tool, with no Stackweaver scripts, website generator or generated index. |
| AC-02 | Red-first checker tests cover path-only deleted source strings and exact paths, directory prefixes, wildcard/globstar including mid-segment double-star, escaped literal metacharacters, bracket negation, several roots, current frontmatter, code-fence false positives, rename/delete, committed/staged/unstaged paths, explicit untracked selections and unusual filenames. Diverge both base and feature branches to establish merge-base comparison. In a mixed dirty checkout distinguish default committed selection, explicitly included dirty paths, reported excluded dirty scope and a genuinely unresolved request; unrelated work must not make every run incomplete. Explicitly selected documentation source paths can match other docs. A tracked generated Markdown fixture remains included; an untracked/ignored fixture joins only when selected. With an unrelated malformed dirty doc, use valid HEAD metadata and report its exclusion without an incomplete result. Select that doc explicitly and require incomplete; select a valid metadata edit/new doc and require its current bytes to override HEAD even if a deliberately stale generated index exists. Preserve source/index/dirty sentinels. |
| AC-03 | Execute the CLI and inspect real JSON/text/exits for matching, no-match and incomplete results, including mixed known matches plus errors, missing root, no declared coverage, invalid YAML/covers/globs, unreadable data and repository escapes. Also remove the verified binary in an isolated offline environment: the real checker must return incomplete without network or cache writes. Existing settings-reader regressions must pass. No error disappears into an empty success; unmatched source paths remain explicit. |
| AC-04 | Actual Copilot trials review fake code/docs, catch a changed default, make the correct minimal authorized doc edit and expose missing/unknown/wrong-system cases. Exercise direct/intake/implement/ship with a valid adoption/roots declaration, no declaration, a malformed/conflicting declaration, a fenced example, an old pin and an unpinned consumer; all routes use the shared roots CLI with declared/absent/gap outcomes. Adopted old-pin implement/ship must stop with the existing missing-page handoff rather than complete or fall back; no-onboarding behavior must agree between the operation and loop reference; standalone explicit roots must work without enabling integrated adoption. Also exercise manual legacy fallback, report-only requests and malicious doc/output instructions. Confirm no unintended generator/commit/remote action, and covered doc fixes still require fresh feature review. Exercise mapping upkeep after a code-area move and refuse doc/coverage deletion used to silence a finding. Per-candidate citations must support each classification. The direct-operation compatibility guard allows only the named documentation sections and the package checker recognizes the new content operation; all other protected bodies remain unchanged. |
| AC-05 | Compare every material legacy behavior and candidate against current shared/local behavior with independently reviewed parity. Execute the actual legacy CLI wrapper/hook contract from a neutral environment with an explicitly located shared payload; test missing payload, missing verified binary, unusable Bun/Git/Bash and old arguments/stdin/exits without network or cache writes. Cover every caller/routing/guideline fragment listed in Design. Assert local docs-source exclusion, empty/docs-only no-op exit 0, candidates exit 1 and incomplete exit 2 both with and without known candidates, including the actual advisory hook's response to each. For every preserved caller command, inherit the one setup variable in a fresh agent shell and prove the declared roots reach the installed checker. Missing/unusable paths or incompatible protocols fail visibly; a protocol-compatible older payload is not falsely called stale. Pipe a deleted covered path and require legacy exit 1. Pipe an unrelated malformed dirty doc through the unchanged ship command and require a HEAD-based result with exclusion reported; an explicitly selected malformed --metadata-path overlay produces incomplete. Valid selected overlays survive the local source exclusion, and Stackweaver plan labeling does not change its format or gates. Assert per-candidate citations and the index-rebuild/change report line. Compare valid-but-reinterpreted legacy patterns as well as invalid metadata and refuse cutover on candidate loss; every proposed correction must agree with the retained index/corpus/drift readers. Confirm rename mapping upkeep and the local code/config-only metadata rule. Synthetic local hooks preserve visual refresh/check even for accurate prose, index/preview conditions and missing-browser blockers. Rehearse conflict-safe rollback/reapply and prove unrelated workflows/generators/customer content unchanged. |
| AC-06 | Run repository-required tests/vet/lint and the package checker; include portable new tests in macOS CI. Retain original actual Copilot inputs/returns/red-green doc results and tool provenance. Isolated native Codex/Claude installs discover the operation and execute the installed checker outside an agent session. Independent exact-commit implementation review observes the evidence; no fixture outcome becomes a GUI/live-product claim. |
| AC-07 | Source completion checks the cutover safeguards and exact-source candidates. Delivery then verifies the convention, normal shared CI/release, real marketplace fresh/upgrade payloads, knowledge resolution for existing triage/maintenance/audit at the new pin including unwarmed/warmed offline audit cache, paired review, installed current-consumer preflight and post-merge routing/checker. Reject missing/stale/mismatched evidence, incompatible tool versions and conflicting migration state; record actual observed default revisions rather than demanding an old global default remain current. |

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
| 2026-11-04 | R-4 | spec | `bd4e45ec41afefb2e4b854fccfbc0e9ba18a61f2` | claude-opus-5-5 | procedural | No blockers; four should-fix findings and four nits on roots resolution, legacy overlays and upgrade effects. |
| 2026-11-04 | R-5 | spec | `d1cc2374d3eaff699a3a18c4093b659bb28b685a` | claude-opus-5-5 | procedural | No blockers; five should-fix findings and three nits. Actual native result recovered after launcher exit 143; reviewer exit code unobserved. |

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

### R-4

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 3. Shared review procedure and existing gates; 4. Stackweaver adoption
EVIDENCE: The adoption line's value is a YAML flow sequence that must be parsed with the existing strict reader. A malformed, empty, duplicate or conflicting declaration reports a gap (shared-docs-impact.md:191-197). Implement, ship, intake, the Stackweaver forwarding route and the compatibility wrapper all read this declaration (lines 194-195 and 244-245). The strict reader is only reachable through the Bun function readYAML, which spawns the installer and the binary (shared/plugins/vh-adlc/scripts/settings-file.ts:33-36). The legacy wrapper is a Node script (consumer/scripts/check-doc-coverage.js:1), and an agent cannot call readYAML directly. The only CLI shape the spec describes takes explicit `--docs-root` values (lines 133-134 and 143), and explicit roots are described only for one-off checks (line 197). Nothing defines which component locates the line outside code fences, parses it strictly and applies the gap rules. Each integrated route and the Node wrapper would therefore need its own parser. That contradicts the single-implementation goal (lines 275-276), and the gap rules could differ between callers.
PROPOSAL: Give the shared CLI one documented way to read and validate the root `AGENTS.md` declaration, such as a flag or subcommand that returns the roots or a gap. Require intake, implement, ship and the wrapper to use it, and test it in AC-04 and AC-05 with valid, absent, malformed, duplicate and fenced declarations.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 3. Shared review procedure and existing gates; Test Plan AC-04
EVIDENCE: An adopted repository's implement step requires the procedure before each task commit, and an incomplete assessment prevents a completion claim (shared-docs-impact.md:207-211). Only adopted or explicitly requested coverage work loads the new convention page. The spec defines two other cases: a repository pinned before the page gets a handoff "for the new operation", and undeclared generic ship checks keep their manual path (lines 199-202). A requested page missing at the pin stops the operation with `missing-page` (shared/plugins/vh-adlc/references/loop.md:54-56 and 66-67). The spec never says what implement or ship do in a repository that has the roots declaration but whose pin predates the convention page. It could stop the whole operation, report an incomplete assessment that blocks completion, or fall back to the manual path. AC-04 exercises "an old pin" (line 349) without an expected outcome for those two operations.
PROPOSAL: State the implement and ship outcome for a declared repository with a pin older than the convention page, for example a reported gap with a pin-update handoff that blocks only the completion claim. Assert that outcome in AC-04.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 2. One reusable, read-only checker; 4. Stackweaver adoption; Test Plan AC-05
EVIDENCE: Unselected dirty docs are excluded so that their half-edited frontmatter cannot make a run incomplete. Explicitly selected docs overlay their working-tree bytes, and malformed selected metadata produces incomplete (shared-docs-impact.md:157-165). The wrapper keeps selected docs from its original input as a metadata overlay (lines 266-268). The retained ship callers pipe every staged and unstaged tracked change into the wrapper (consumer/agents/ship.md:52, consumer/.claude/commands/ship.md:10-11, consumer/CLAUDE.md:306). Ship runs from the main checkout (consumer/agents/ship.md:72-74), which other live sessions share (consumer/CLAUDE.md:130). Every dirty doc from another session therefore becomes a selected overlay. One malformed doc turns the wrapper result into exit 2, and the local ship rule forbids shipping over a failed doc-impact check (consumer/agents/ship.md:121-122). Another session's unstaged `covers` edits also change this run's candidates. The legacy checker read only the index, so neither effect existed before. The AC-02 isolation case (line 347) covers only the shared default scope, not this wrapper path.
PROPOSAL: State the wrapper's outcome when legacy input includes unrelated dirty docs, either as an accepted limitation that the report names, or by overlaying only docs the caller marks as metadata selections. Add an AC-05 case with an unrelated malformed dirty doc piped through the unchanged ship command.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 1. Common documentation convention; 4. Stackweaver adoption; Test Plan AC-07
EVIDENCE: The plugin pin moves to the new convention revision once that revision exists (shared-docs-impact.md:125-127). knowledge.md holds exactly one docs SHA for the whole package (shared/tests/vh-adlc/check.test.ts:95-100). A repository with no pin uses the plugin pin for every operation (shared/plugins/vh-adlc/references/loop.md:58-60). Stackweaver's AGENTS.md declares no engineering pin (consumer/AGENTS.md:1-60) and already forwards triage, maintenance and audit to installed vh-adlc operations (consumer/AGENTS.md:12-20). Audit entry reads only cached pages for the resolved pin and stops with a setup handoff when they are missing (loop.md:9-14; lifecycle.md:18-23). After the upgrade, Stackweaver's adopted operations resolve a new revision, and offline audit can stop until pages for that revision are cached. Marketplace and preflight verification in the spec checks only docs-impact behavior (lines 309-312; Test Plan AC-07 at line 352). The scope statement that unrelated workflows stay intact (AC-05) does not name this side effect.
PROPOSAL: Add to the marketplace upgrade and current-consumer preflight a check that Stackweaver's adopted triage, maintenance and audit entries still resolve under the new plugin pin, including the offline audit page cache. Alternatively, record the required setup step as a stated migration action.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Design, 4. Stackweaver adoption
EVIDENCE: The spec keeps the legacy script as a thin compatibility entry only "if its existing hook/terminal callers need it" (shared-docs-impact.md:263-264). The same section requires the pre-commit hook to stay byte-identical while it calls that checker (lines 255-260). It then specifies the wrapper's payload location, protocol check and caller setup without any condition (lines 278-293), and the unchanged callers invoke the script directly (consumer/agents/ship.md:52, consumer/CLAUDE.md:306, consumer/agents/docs-impact.md:30). Because the callers stay unchanged, the wrapper is required. The conditional wording suggests an implementer could remove it.
PROPOSAL: Make retention of the wrapper unconditional for this migration, and keep a later retirement as a separate decision.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design, 3. Shared review procedure and existing gates; 4. Stackweaver adoption
EVIDENCE: The legacy procedure requires each classification to cite the doc and code locations that agree or conflict (consumer/agents/docs-impact.md:54-55). Its report includes an impact table with those citations and a line saying whether the index was rebuilt and whether the coverage index changed (consumer/agents/docs-impact.md:83-88). In the shared procedure, the agent reads both sources and records a classification (shared-docs-impact.md:222-223). The human report lists changes, attention items, reasons, edits and gaps (lines 234-236). The Stackweaver companion keeps the index rebuild rule but not its report line (lines 240-242). Neither home requires per-candidate citations or the index-rebuild report item.
PROPOSAL: Add the per-candidate doc and code citations to the shared procedure's record. Keep the index-rebuild report line in the Stackweaver companion, and include both in the AC-05 parity comparison.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Design, 2. One reusable, read-only checker
EVIDENCE: The default document view is tracked HEAD content (shared-docs-impact.md:157-158), and the checker must "avoid generated/ignored trees unless explicitly in scope" (lines 165-166). Ignored files are not in HEAD, but the spec gives no rule that identifies a tracked tree as generated. Stackweaver tracks generated documentation outputs inside its declared docs root (consumer/CLAUDE.md:281; consumer/agents/public-docs.md:231). A heuristic exclusion could drop legacy candidates, and the exclusion cannot be tested without a definition.
PROPOSAL: Either limit the rule to untracked and ignored paths, or name an explicit exclusion input. Add the chosen behavior to an AC-02 case.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Design, 1. Common documentation convention; 3. Shared review procedure and existing gates
EVIDENCE: The new convention page defines the matching rules and the checker result contract (shared-docs-impact.md:95-104 and 123-124). The shared reference `references/docs-impact.md` (line 185) and the protocol 1 definition (lines 280-281) describe the same contract inside the package. The package checker fails when a sentence from a pinned docs page appears in the package, but its canary list names only existing pages (shared/tests/vh-adlc/check.test.ts:52-63 and 364-374). The spec does not add the new page to that list once the pin moves. The docs repository asks for one home per fact (engineering/README.md:34-35).
PROPOSAL: Name the convention page as the single home of the matching and result contract, link to it from the package reference, and add `conventions/documentation-impact.md` to the canary pages in the same change that moves the pin.

### R-5

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 4. Stackweaver adoption
EVIDENCE: The wrapper keeps the legacy no-op: empty input, or input that holds only excluded docs paths, exits 0 (shared-docs-impact.md:289-291). A missing or failed payload, binary, Bun, Git or Bash exits 2 (lines 292-293). An absent roots declaration is an exit-2 setup gap for the wrapper (lines 202-203). Selected `--metadata-path` overlays survive the docs-source exclusion, and a malformed selected overlay produces incomplete (lines 283-289). The spec never says which of these rules is checked first. The legacy script exits 0 for empty or docs-only input before it does anything else except the index existence check (consumer/scripts/check-doc-coverage.js:35-38 and 55-64). The advisory hook runs this script on every commit (consumer/CLAUDE.md:309). Two cases have no defined result. First, a docs-only commit in a shell without `VH_ADLC_PLUGIN_ROOT` could stay silent with exit 0, or print a setup diagnostic with exit 2. Second, docs-only input with a malformed `--metadata-path` overlay could be a no-op with exit 0, or incomplete with exit 2.
PROPOSAL: State the order. For example: empty or docs-only input with no `--metadata-path` exits 0 before the payload or roots checks, and any `--metadata-path` forces a shared run, so setup and overlay validation apply. Add both cases to the AC-05 wrapper tests.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 2. One reusable, read-only checker; Test Plan AC-02
EVIDENCE: Line 160 says that only explicitly selected doc paths overlay their working-tree bytes. Lines 161-163 say that doc-metadata selection is accepted separately from source selection. Lines 156-157 say that explicitly selected paths inside documentation roots remain eligible as sources. AC-02 has explicitly selected documentation source paths match other docs, and it also says "select that doc explicitly and require incomplete" (line 376). The spec does not say whether passing a dirty doc path as a source selection also overlays that doc's metadata. Integrated implement and ship pass a task's own doc edits as selected paths (lines 218-223). If source selection does not imply an overlay, a task's `covers` update is checked against HEAD unless the caller also selects it as metadata. If it does imply an overlay, the shared callers bring back the unrelated-dirty-doc exposure that R-4 F-03 fixed only for the wrapper. The shared CLI option for metadata selection is also unnamed. Only the wrapper's `--metadata-path` forwarding mentions it (line 284).
PROPOSAL: State whether a source selection of a doc path implies a metadata overlay, name the shared CLI metadata-selection input, and say which input integrated callers pass for a task's own doc edits. Make the AC-02 selection cases use that distinction explicitly.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 2. One reusable, read-only checker; Test Plan AC-02 and AC-03
EVIDENCE: Metadata is read from the HEAD tree view, with working-tree overlays only for selected docs (shared-docs-impact.md:159-161). Every tracked Markdown file under the declared roots is included (lines 167-168). Repository escapes through traversal or symlinks are refused (lines 169-170). AC-03 tests only repository escapes, and AC-02 has no symlink case (lines 376-377). In a Git tree, a tracked symlink is a blob whose content is its target path. If it is read as Markdown, it has no frontmatter. Three cases are therefore undefined: a covered doc that is a symlink to another in-repo file, a declared root that is itself a symlink, and a selected overlay doc that is a symlink in the working tree. Each could silently contribute no coverage and produce a clean-looking `none`. That contradicts the rule that missing or unreadable coverage cannot become empty success (line 183).
PROPOSAL: Define how in-repo tracked symlinks under a root, symlinked roots and symlinked overlay docs are handled. For example, resolve in-tree targets in the same view, or report an incomplete diagnostic. Add AC-02 or AC-03 cases for each.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 3. Shared review procedure and existing gates; Test Plan AC-04
EVIDENCE: The loop calls `knowledge` first, with every page the operation will read, and stops on `missing-page` (shared/plugins/vh-adlc/references/loop.md:36-39 and 54-56). The compatibility guard freezes the implement and ship bodies, including their Start page lists (shared/tests/vh-adlc/direct-operation-compatibility.test.ts:10-41). So the new convention page can only be requested from inside the permitted added section. The spec places implement's procedure at the per-task verification stage, before the task commit (shared-docs-impact.md:218-220). A declared repository with an old pin stops that invocation and keeps existing edits (lines 207-211). In that repository, implement would find the stop only after it has written the first task's failing test and change (shared/plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:68-79). That leaves an uncommitted half-finished task, and the page is requested after other work instead of first.
PROPOSAL: Require the added section to resolve roots and request the convention page once, at operation entry, before the first write. Assert in AC-04 that the old-pin stop happens before any task edit in implement and before any doc fix in ship.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 4. Stackweaver adoption; Test Plan AC-05 and AC-07
EVIDENCE: The migration inventory is a fixed list (shared-docs-impact.md:265-270), and it was built from a bounded set of files. Other workflow surfaces that might call or route to the checker are not listed and were not inspected. These include an always-run documentation review CI job and its covered `scripts/verify-local.sh` and `ci.yml` (consumer/docs/internal/guidelines/documentation/PUBLIC_VISUAL_ASSETS.md:3-8 and 28-30), the public-docs skill named in consumer/AGENTS.md:31-32, and the drift workflow and agent (consumer/CLAUDE.md:311). Line 312 says CI sets the setup variable but names no CI caller. Any unlisted caller of the retained script changes behavior silently. It used to get exit 0 or 1 (consumer/scripts/check-doc-coverage.js:35-38 and 104), and without `VH_ADLC_PLUGIN_ROOT` it now gets exit 2.
PROPOSAL: Require a repository-wide search at the exact cutover commit for every invocation of `scripts/check-doc-coverage.js` and every reference to the docs-impact route. Add each hit to the inventory, parity comparison and rollback set, and make an unlisted caller fail the current-consumer preflight.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design, 1. Common documentation convention; 4. Stackweaver adoption
EVIDENCE: The convention page is named as the single prose home for matching and result semantics (shared-docs-impact.md:123-124). Checker protocol 1 is defined as including "the report schema and matching/result contract in this spec" (lines 301-302). After publication, two documents would claim to define the contract behind protocol 1.
PROPOSAL: Define protocol 1 by reference to the published convention page at its recorded revision, plus the versioned report schema, instead of this feature document.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: covers frontmatter; Design, 5. Verification and delivery
EVIDENCE: `covers` lists `plugins/vh-adlc/examples/docs-impact/`, `README.md` and four user documentation pages (shared-docs-impact.md:13 and 26-30). Design and the Test Plan never say what these deliver. The pinned documentation convention requires usage examples to be complete files that a test checks against the component's interface (engineering/conventions/documentation.md:81-85). The parent roadmap requires an explicit, tested capability matrix (shared/docs/specs/shared-workflow-migration.md:87-90). Standalone users also need the Bun, Git, Bash, binary and `VH_ADLC_PLUGIN_ROOT` prerequisites documented (lines 139 and 299-312).
PROPOSAL: State what the examples and the user documentation pages must contain, such as standalone setup, the capability matrix row with the unclaimed Claude and GUI limits, and the example check. Otherwise, remove the unused paths from `covers`.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Design, 1. Common documentation convention
EVIDENCE: The contract lists `*`, `?`, brackets, `**` and backslash escapes, and it calls unsupported syntax an explicit error (shared-docs-impact.md:96-102). It does not say whether characters such as `{`, `}` or `!` are literals or unsupported syntax. The legacy matcher treats braces as literal characters (consumer/scripts/check-doc-coverage.js:26). The feature matcher's `path.Match` also treats them as literals (shared/internal/doc/covers.go:20-21). A brace pattern in existing metadata would make every run incomplete under one reading and match literally under the other.
PROPOSAL: Name these characters as literals, which matches both existing readers, or list them as unsupported. Include a brace pattern in the AC-05 parity comparison.

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/feature-documents.md) and [template](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/feature-document-template.md): scope, review and acceptance gates; the new convention must preserve feature metadata semantics.
- [Pinned documentation conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/documentation.md), [coding](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/coding.md), [delivery](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/delivery.md) and [prose guide](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/humanize-prose.md): small reusable tooling, local policy and reviewed publication. [Go conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/go.md) were inspected for the existing reader; this draft does not propose Go runtime changes.
- [Existing strict YAML reader](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/plugins/vh-adlc/scripts/settings-file.ts), [ship check](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md) and [feature matcher](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/internal/doc/covers.go): reuse current parsing and review gates without changing feature matching.
- Stackweaver workflow sources inspected locally at `b88aa6d596249f1f7178d3fcdb7a5c9b8221fe2f`: `agents/docs-impact.md`, `scripts/check-doc-coverage.js` and `scripts/build-docs-index.js`, with line ranges cited in Context. Private source is not reproduced here.
