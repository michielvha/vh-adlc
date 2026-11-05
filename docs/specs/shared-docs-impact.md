---
status: in-progress
branch: feat/shared-docs-impact
status_description: "Shared feature and Stackweaver migration published; actual marketplace and post-merge checks pass. Final exact-commit completion review remains open."
issue: https://github.com/michielvha/vh-adlc/issues/47
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
  - tests/vh-adlc/triage/discovery.test.ts
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

Implementation is underway on the claimed feature branch. The common convention is published
and independently reviewed. Local reader/matcher/collector/CLI and native trial checks pass;
publication and Stackweaver adoption are verified below; only final completion review remains
open. The initial strict-reader refusal was resolved locally by a separately reviewed syntax-only
correction; its exact commit, bounded review and retained-reader equivalence are recorded below.

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
must preserve the pattern's backslash. Characters without a defined operator meaning, including
`{`, `}` and `!`, are literals; there is no brace expansion or leading-pattern negation.
Validate malformed brackets, escapes and declarations
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
source paths. Repeated path arguments and NUL-delimited input support filenames safely.
Roots resolution, feature-root classification and caller presence checks all read root `AGENTS.md`
from committed HEAD. Dirty policy edits are reported as excluded and do not change those inputs.
Adoption/configuration changes take effect after committing them; a direct one-off check may
still use explicit docs roots. This configuration view grants no action authority and never
overrides the current owner's restrictions. With a
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
The shared CLI's repeatable `--metadata-path <doc>` selects those overlays independently from
source paths. Selecting a doc as a source does not select its metadata; default metadata stays
HEAD unless that separate option selects it. Integrated callers pass task-owned doc edits through
`--metadata-path`, as well as passing their source scope. This distinction means a local source
exclusion does not discard an explicitly selected metadata update. Reports bind the HEAD and overlay paths/hashes and list
unselected dirty docs as excluded input. Their half-edited frontmatter is not parsed and cannot
change candidates or make the selected scan incomplete. Malformed selected metadata or malformed
HEAD metadata still produces incomplete. A task's explicit docs selection uses its current bytes;
this never claims those bytes are a staged-only snapshot. Include every tracked Markdown file
under declared roots; do not guess that tracked files are generated and omit them. Untracked or
ignored paths are excluded unless explicitly selected. Refuse repository escapes through traversal
or symlinks. In the selected view, a symlinked root, a tracked symlink doc or a selected overlay
with a symlink in its path produces incomplete, even for an in-repository target. Inspect Git tree
modes for HEAD content and use no-follow checks for overlays; never parse a symlink target blob as
Markdown or traverse it into an empty success. A generated coverage index is never required or
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
success. A file with no leading frontmatter, valid frontmatter without `covers`, or an empty
`covers` list is reported as uncovered and does not itself make collection incomplete. Null,
non-list or invalid `covers` values, unterminated/malformed frontmatter and strict-reader failures
are gaps. Unrelated field names are allowed within the existing reader's strict YAML subset.
A root with no usable coverage patterns remains incomplete even when all its docs are valid but
uncovered. Deterministic ordering and current source/doc bindings make changed inputs visible.
There is no persistent receipt cache or semantic verdict generated by the checker.

### 3. Shared review procedure and existing gates

Provide `vh-adlc-docs-impact` and one `references/docs-impact.md` procedure. Direct use, lifecycle
intake and implement/ship doc checks reuse it. Preserve plain documentation editing, audit, triage,
maintenance and blog routing. Add a lifecycle row for "Review documentation affected by a code
change", selecting `vh-adlc-docs-impact` for requests such as "which docs need updating for this
patch?". Keep "Documentation or a convention" for direct artifact editing. A request that also
requires feature code continues through its underlying feature operation and its integrated docs
check; this route is not a shortcut around that operation. Existing adopters without coverage metadata keep the current manual
review path with that limitation stated; do not claim their mechanical check passed or silently
make unrelated shipping depend on adopting new metadata.

Declare adoption with one standalone line in root `AGENTS.md`, outside code fences:
`Documentation impact roots: ["docs/"]`. The declaration prefix must start at column 0.
Outside fenced code, an indented look-alike is a gap rather than an adopted declaration or a
silent manual fallback. Its YAML flow sequence, parsed with the existing strict
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

Implement and ship add a `Documentation impact` section with an entry preflight before any task
edit or doc fix. First acquire the verified binary through the ordinary installer, as the existing
Start step permits. This is explicit operation setup, not a download by `check` or `roots`. Then
resolve roots offline and make the knowledge request with its full conditional page list. A roots
gap, including missing runtime dependencies or a malformed declaration, stops either invocation
before the first repository write, commit or remote action; do not take a manual fallback. At entry, establish whether the declaration is absent from the current root
instructions without interpreting its value. A clearly absent declaration keeps the existing manual
path without requiring the new CLI or convention page. If a declaration is present or its absence
cannot be established, use the one shared roots parser; do not invent a caller YAML parser.
Clearly absent means no raw line in root `AGENTS.md` contains the marker
`Documentation impact roots:` after optional leading spaces/tabs, fenced or not. This is only a
textual presence check, with no YAML or fence interpretation. A matching raw line, even indented
or in a fenced example, goes through the shared roots CLI; that parser alone decides whether the declaration is actually present. Missing root
instructions count as absent; unreadable instructions are a gap. For an adopted repository,
that section adds the convention page to every knowledge request,
including Start's initial request, and stops on missing-page before the first write. Implement
then runs this procedure at its existing per-task verification stage before the task commit,
for that task's selected source and explicit doc-metadata paths.
Permitted doc/metadata fixes join that task's checks and commit. An incomplete per-task assessment
stops implement before ticking or committing that task; preserve its edits and resolve the gap
within scope or hand it off. Undeclared repositories keep their current implement behavior.
Ship reuses the assessment at its existing documentation gate and rechecks changed inputs. For a
completion shipment, incomplete checking blocks delivery. A separately owner-authorized in-progress
PR may retain the existing progress-PR path only after entry preflight succeeds, with the assessment
gap explicit in its PR, no completion/issue-closure/migration claim and every other shipping gate
retained. This creates no publication authority. Keep the covered-path review-refresh rule. In `direct-operation-compatibility.test.ts`, permit only this
named added section in implement and ship, assert its required behavior, then compare the rest of
each body to the existing approved baseline. Do not replace the baseline wholesale.
Classify `vh-adlc-docs-impact` as a declared content operation in the package checker, with a
harness-neutral entry and no model field; it does not gain status-changing gates.

The agent runs the checker, searches for literal references that metadata can miss and checks new
visible behavior for missing docs. A moved or renamed code area requires reviewing and updating
its affected ordinary-document `covers` mappings to the actual new source paths. Never edit a
standard feature document's normative `covers` through this procedure; report that proposed
revision and route it to `vh-adlc-spec`. Respect a consumer's own spec procedure for its local plan
format. An attention-labelled candidate with no format declaration follows the repository's
retained local procedure when that procedure establishes its format; the label does not select
vh-adlc-spec. For Stackweaver plans, retain its existing local covers-upkeep and review-staleness
rules after a rename, without changing criteria/status or converting formats. If the applicable
procedure cannot be established, report the proposed mapping change without editing. A coverage
label alone grants no feature-document edit or format conversion. Never delete a document or drop a
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
The local companion also retains scope selection: an explicit caller selection wins. Otherwise,
the route considers the legacy branch-range then staged/unstaged fallback, but passes only the
current task's identified paths as an explicit shared selection. A pass delegated from local ship
must receive that change's staged/unstaged source paths and task-owned doc overlays in its handoff.
Update the delegating instructions accordingly. Report remaining dirty scope as excluded; an
unattributable fallback becomes a scope gap, never a silent omission or expansion to other tasks.
The complete migration inventory includes `agents/docs-impact.md`, the new project companion,
`agents/implement.md`, `agents/ship.md`, `.claude/commands/ship.md`, `CLAUDE.md`, the forwarding list
in `AGENTS.md`, the docs-impact reference in `agents/public-docs.md`, the checker entry and references
in `DOCUMENTATION_STANDARDS.md` and `PUBLIC_VISUAL_ASSETS.md`. Preserve or update each route/reference;
all changed fragments enter the parity comparison and rollback blob set. This is the starting
inventory: at the exact cutover commit, search the entire repository for the checker invocation and
docs-impact route references, including CI, local verification, public-docs skill and drift/schedule
surfaces. Add every hit to the inspected inventory/parity comparison, and changed fragments to
rollback. An unlisted or unresolved caller fails current-consumer preflight. Retained workflow
logic stays untouched; any necessary invocation/setup-only change must have bounded parity proof. Include the roots
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
After parsing options, read piped stdin whenever no positional source arguments remain, including
when metadata options are present. Positional source arguments retain precedence over stdin.
An interactive terminal with no piped input supplies no source list; do not wait for terminal EOF.
Legacy line input uses Git name-only quoting: decode Git C-quoted lines, including escaped bytes,
quotes and backslashes, before matching/filtering; invalid encodings produce a visible gap rather
than a silent non-match. Positional paths are literal and are never unquoted. The shared CLI's
NUL-delimited input remains the preferred unambiguous transport for unusual filenames.
Those selected overlays survive the local docs-source exclusion. A caller that updated coverage
metadata must request its overlay explicitly, through that option or direct shared checking;
report the metadata view and excluded dirty docs so HEAD-only checking cannot stand in for that
current-metadata assessment. An unrelated malformed dirty doc in a legacy unfiltered diff stays
excluded; explicitly selecting that malformed overlay produces incomplete. Empty input or input containing
only excluded docs paths, with no `--metadata-path`, remains a no-op exit 0 before payload,
runtime or roots checks; that no-op makes no complete-coverage claim. Any explicit metadata option
forces the shared run even with no source paths, so missing setup or malformed selected metadata
returns exit 2. Validate option/input syntax before either branch; do not disguise malformed
arguments as the legacy no-op. When source paths remain, an incomplete shared result
exits 2, shows its diagnostics and retains any known candidates. Missing/failed payload or binary
also exits 2, including missing or unusable Bun, Git or Bash in a Node-capable caller environment.
Print incomplete diagnostics and any known matches on stdout as well as reporting
the incomplete outcome, so the existing advisory hook cannot hide them by discarding stderr.
Never translate incomplete checking into candidates-only exit 1 or a clean exit 0, and do not
retain a second copy of matching logic.

The wrapper obtains the installed payload from the single `VH_ADLC_PLUGIN_ROOT` environment
variable, naming the actual installed `vh-adlc` plugin directory. Validate its package identity,
required checker/lock files and checker protocol 1. That protocol includes the report schema and
matching/result contract on the published convention page at the recorded revision; reject incompatible or missing protocol reports with exit 2.
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
Perform the paired semantic review and installed current-consumer checks before the migration merge.
The exact cutover HEAD corpus under every declared root must collect completely with the real
installed checker, yielding candidates or none with zero incomplete gaps; candidate parity alone
is insufficient. Strict-subset incompatibility requires a separately reviewed syntax-only
correction preserving meaning for the retained index/corpus/drift readers, or blocks cutover.
Do not silently broaden this migration into unrelated content repair. Recheck this predicate
when the cutover HEAD changes,
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

Ship a complete `examples/docs-impact/` fixture with its own Markdown coverage, source, invocation
and expected outcomes; tests initialize/copy it and run the real CLI, rather than leaving partial
snippets to assemble. README links it and lists the new operation. Installation/marketplace guides
cover greenfield runtime/binary preparation and the consumer wrapper's environment setup. The
workflow guide explains direct/integrated review and its permissions; compatibility docs add the
actual tested matrix row and keep unclaimed Claude docs-impact/GUI/live limits explicit. Update the
discovery guard to recognize the new content operation while preserving the existing engineering
operation count and protected bodies.

Test the real checker with synthetic Markdown/Git repositories, including malformed/missing
coverage and preservation cases. Use actual bounded Copilot Opus 5.5 trials for accuracy judgment,
minimal doc repairs, read-only limits and untrusted input. Native Codex/Claude installation,
standalone execution and current Linux/macOS selections must exercise the shipped payload.
Actual Claude docs-impact execution, GUI/phone entry and live Stackweaver screenshot capture remain
unclaimed; a future UI change still owes its existing local visual checks.

## Acceptance Criteria

- [x] AC-01: Adopting repositories have one published coverage convention, without needing Stackweaver's generator or changing existing feature-review freshness semantics.
  Evidence: R-16 at `2dd76e7` returned met; executed and carried-forward observations with their limits are preserved verbatim below.
- [x] AC-02: The shared checker reads committed HEAD Markdown coverage plus explicitly selected document overlays and returns the correct affected docs and source matches for a bounded Git/path scope without relying on a generated index or changing the repository.
  Evidence: R-16 at `2dd76e7` returned met; executed and carried-forward observations with their limits are preserved verbatim below.
- [x] AC-03: No-match, affected-doc and incomplete-check results are distinguishable, with missing/unreadable/malformed coverage and unmatched source scope visible rather than reported as verified accuracy.
  Evidence: R-16 at `2dd76e7` returned met; executed and carried-forward observations with their limits are preserved verbatim below.
- [x] AC-04: Direct and integrated agent review use the same portable procedure, ground permitted updates in code and local rules, preserve historical/intended contracts and honor read-only and existing review/publication gates.
  Evidence: R-16 at `2dd76e7` returned met; executed and carried-forward observations with their limits are preserved verbatim below.
- [x] AC-05: Stackweaver uses the shared checker/procedure with verified legacy-caller compatibility and scoped rollback, retaining site generation, visuals, local policy and unrelated workflows.
  Evidence: R-16 at `2dd76e7` returned met; executed and carried-forward observations with their limits are preserved verbatim below.
- [x] AC-06: Automated Linux/macOS checks, native installed/standalone execution and actual bounded Copilot trials establish the promised behavior at reviewed commits, with capability limits explicit.
  Evidence: R-16 at `2dd76e7` returned met; executed and carried-forward observations with their limits are preserved verbatim below.
- [x] AC-07: Convention/tool publication, real marketplace acceptance and paired current-consumer verification precede migration, and exact revisions, post-merge checks and rollback evidence are retained.
  Evidence: R-16 at `2dd76e7` returned met; executed and carried-forward observations with their limits are preserved verbatim below.


## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Review and lint the actual convention change; verify its declared enforcement/examples against the checker and pin the published revision. Existing feature gate/matcher tests remain unchanged and pass. Test a feature document containing `**`, `?`, bracket and trailing-slash entries: ordinary coverage selects candidates with its own declared semantics, marks them coverage-only and excludes self-triggering, while the feature gate retains its existing results. Cover declared/default feature roots and local-format repositories offline, with no downloaded rules or plan-format conversion; a local-format declaration yields ordinary candidates only. A synthetic second repository uses only Markdown coverage and the shared tool, with no Stackweaver scripts, website generator or generated index. |
| AC-02 | Red-first checker tests cover path-only deleted source strings and exact paths, directory prefixes, wildcard/globstar including mid-segment double-star, escaped literal metacharacters, bracket negation, several roots, current frontmatter, code-fence false positives, rename/delete, committed/staged/unstaged paths, explicit untracked selections and unusual filenames. Diverge both base and feature branches to establish merge-base comparison. In a mixed dirty checkout distinguish default committed selection, explicitly included dirty paths, reported excluded dirty scope and a genuinely unresolved request; unrelated work must not make every run incomplete. Explicitly selected documentation source paths can match other docs. A tracked generated Markdown fixture remains included; an untracked/ignored fixture joins only when selected. With an unrelated malformed dirty doc, use valid HEAD metadata and report its exclusion without an incomplete result. Select that doc with --metadata-path and require incomplete; source-selection alone must leave its metadata at HEAD. Select a valid metadata edit/new doc with --metadata-path and require its current bytes to override HEAD even if a deliberately stale generated index exists. Preserve source/index/dirty sentinels. |
| AC-03 | Execute the CLI and inspect real JSON/text/exits for matching, no-match and incomplete results, including mixed known matches plus errors, missing root, no declared coverage, invalid YAML/covers/globs, unreadable data, repository escapes, a Git-tree symlink doc, a symlinked root and an overlay symlink, including in-repository targets. Mixed annotated and unannotated/no-frontmatter docs must report uncovered files without making each a gap; empty lists are uncovered, invalid/null fields and unterminated headers are incomplete, and a whole root with no usable patterns is incomplete. Each symlink case must be incomplete rather than an empty no-match. Also remove the verified binary in an isolated offline environment: the real checker must return incomplete without network or cache writes. Existing settings-reader regressions must pass. No error disappears into an empty success; unmatched source paths remain explicit. |
| AC-04 | Actual Copilot trials review fake code/docs, catch a changed default, make the correct minimal authorized doc edit and expose missing/unknown/wrong-system cases. Exercise direct/intake/implement/ship with a valid adoption/roots declaration, no declaration, a malformed/conflicting declaration, a fenced example, an old pin and an unpinned consumer. Exercise a code-change docs-impact request versus a plain documentation edit through the two distinct intake rows. Dirty AGENTS.md roots/classification edits must be reported as excluded; precheck, roots and feature classification must all use HEAD. No raw marker after optional leading spaces/tabs means manual review with no roots-CLI call; a fenced-only marker invokes the CLI and yields absent, while an indented look-alike outside fences yields a gap. Test a cold cache: ordinary bootstrap precedes offline roots, then full knowledge. Roots gaps stop implement/ship before writes; per-task incomplete blocks the implement commit; completed shipment blocks on incomplete assessment, while an explicitly authorized in-progress PR may disclose the gap without completion/closure claims after entry preflight succeeds. Actual declarations and uncertain cases use the single roots CLI with declared/absent/gap outcomes. Adopted old-pin implement/ship must stop at entry before any task edit/doc fix, with the existing missing-page handoff rather than complete or fall back. Undeclared old consumers must keep manual behavior without the new CLI dependencies; no-onboarding behavior must agree between the operation and loop reference; standalone explicit roots must work without enabling integrated adoption. Also exercise manual legacy fallback, report-only requests and malicious doc/output instructions. Confirm no unintended generator/commit/remote action, and covered doc fixes still require fresh feature review. Exercise mapping upkeep after a code-area move and refuse doc/coverage deletion used to silence a finding. A standard feature candidate's moved coverage is reported for spec revision and remains byte-identical; local-format and unmarked attention-labelled Stackweaver-plan candidates follow the retained local covers/review-staleness procedure; unknown applicability is reported without edits. Per-candidate citations must support each classification. Execute the complete shipped example and verify user-guide/matrix claims against actual trial results, keeping untested surfaces unclaimed. The direct-operation compatibility guard allows only the named documentation sections and the package checker recognizes the new content operation; all other protected bodies remain unchanged. |
| AC-05 | Compare every material legacy behavior and candidate against current shared/local behavior with independently reviewed parity. Execute the actual legacy CLI wrapper/hook contract from a neutral environment with an explicitly located shared payload; test missing payload, missing verified binary, unusable Bun/Git/Bash and old arguments/stdin/exits without network or cache writes. Cover every caller/routing/guideline fragment listed in Design. Assert local docs-source exclusion, empty/docs-only no-op exit 0 before setup checks when no metadata option is present, forced setup/metadata validation when that option is present, a piped covered source plus --metadata-path yielding legacy exit 1, Git-C-quoted filenames decoded to their real paths, candidates exit 1 and incomplete exit 2 both with and without known candidates, including the actual advisory hook's response to each. For every preserved caller command, inherit the one setup variable in a fresh agent shell and prove the declared roots reach the installed checker. Missing/unusable paths or incompatible protocols fail visibly; a protocol-compatible older payload is not falsely called stale. Pipe a deleted covered path and require legacy exit 1. Pipe an unrelated malformed dirty doc through the unchanged ship command and require a HEAD-based result with exclusion reported; an explicitly selected malformed --metadata-path overlay produces incomplete. Valid selected overlays survive the local source exclusion, and Stackweaver plan labeling does not change its format or gates. Assert per-candidate citations and the index-rebuild/change report line. Compare valid-but-reinterpreted legacy patterns as well as invalid metadata and refuse cutover on candidate loss or an incomplete full HEAD corpus, including strict-subset metadata incompatibility; every proposed correction must agree with the retained index/corpus/drift readers, including literal braces/exclamation marks. A repository-wide caller/reference search at the cutover commit must match the inventory; unlisted hits block preflight. Confirm a renamed code area covered by a Stackweaver plan follows local mapping-upkeep/review-staleness rules without shared-format conversion, ordinary uncovered-doc behavior and the local code/config-only metadata rule. Delegate an uncommitted change from local ship, pass its selected staged/unstaged paths and doc overlays, and prove they are reviewed while unrelated dirty paths are excluded; ambiguous attribution must be a gap. Synthetic local hooks preserve visual refresh/check even for accurate prose, index/preview conditions and missing-browser blockers. Rehearse conflict-safe rollback/reapply and prove unrelated workflows/generators/customer content unchanged. |
| AC-06 | Run repository-required tests/vet/lint and the package checker; include portable new tests in macOS CI. Retain original actual Copilot inputs/returns/red-green doc results and tool provenance. Isolated native Codex/Claude installs discover the operation and execute the installed checker outside an agent session. Independent exact-commit implementation review observes the evidence; no fixture outcome becomes a GUI/live-product claim. |
| AC-07 | Source completion checks the cutover safeguards and exact-source candidates. Delivery then verifies the convention, normal shared CI/release, real marketplace fresh/upgrade payloads, knowledge resolution for existing triage/maintenance/audit at the new pin including unwarmed/warmed offline audit cache, paired review, installed current-consumer preflight that proves complete collection of the entire declared cutover corpus, and post-merge routing/checker. An otherwise parity-equivalent corpus with one strict-reader failure must block cutover; only a separately reviewed meaning-preserving syntax correction can clear it. Reject missing/stale/mismatched evidence, incompatible tool versions and conflicting migration state; record actual observed default revisions rather than demanding an old global default remain current. |

## Tasks

- [x] T1 `vhco-pro/docs:conventions/documentation-impact.md`, `conventions/documentation.md` - author and independently review the common contract against the accepted design; the docs check passes, and the reviewed dependency is ready for its separate publication (AC-01).
  - Evidence: `vhco-pro/docs` branch `docs/documentation-impact`; `npm run check` passed on 28 Markdown files and the rules block. Native Claude Code Opus 5.5 dependency review C-10 at `2d55a50aeaa8d859d3e5d80159d2d1fb69b7ae28` returned no blocking or should-fix findings; its one wording nit is corrected in the following docs commit. Raw review, trace and all-required-file validation remain in `convention-r10` in the operator archive. This is dependency-document review, not feature implementation review or publication proof. Full old-to-new pin diff includes an unrelated five-line testing policy; owner accepted that testing guidance on 2026-11-05. Convention PR publication/merge was separately authorized.
- [x] T2 `tests/vh-adlc/settings-file.test.ts`, `plugins/vh-adlc/scripts/settings-file.ts` - observe a failing offline reader-session test, extract the verified strict reader for reuse without repeated bootstrap, then prove existing settings callers and missing-binary/no-download behavior pass (AC-02, AC-03).
  - Evidence: missing `createYAMLReader` export observed red in `t2-red.log`; `bun test tests/vh-adlc/settings-file.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts` now passes 28 tests, with the actual verified Go reader reused after one installer invocation. Existing triage/maintenance/audit settings regressions pass 130 tests; unavailable offline reader refuses without downloads. Logs retain the red and green results in the operator archive.
- [x] T3 `tests/vh-adlc/docs-impact/matching.test.ts`, `plugins/vh-adlc/scripts/docs-impact/matching.ts` - observe failed real pattern cases, implement the declared exact/prefix/globstar/escape/bracket contract, then pass malformed-pattern and legacy-preservation cases (AC-01, AC-02, AC-03).
  - Evidence: `t3-red.log` records the missing matcher module; `bun test tests/vh-adlc/docs-impact/matching.test.ts` now passes 41 cases, including zero-directory and mid-segment globstar, Unicode, escaped literals, classes/negation, malformed patterns and bounded repetitive wildcard matching. `bun run --cwd plugins/vh-adlc/scripts/docs-impact typecheck` checks the actual component and tests; the existing Go feature matcher is unchanged.
- [x] T4 `tests/vh-adlc/docs-impact/collection.test.ts`, `plugins/vh-adlc/scripts/docs-impact/collection.ts` - observe failed synthetic Git corpus/scope cases, then pass HEAD/selected overlays, roots/classification, deletions/renames, uncovered/malformed metadata, symlink refusals and dirty/index preservation using the actual collector (AC-02, AC-03).
  - Evidence: `t4-red.log` observed the missing collection module; real synthetic Git cases now pass 19 tests in `t4-green.log`. Follow-up red cases caught last-declaration classification and missing-root preflight; their fixes preserve the existing first feature-root declaration and exact local-format syntax. HEAD/selected overlays, merge-base rename/deletion scope, known matches with failures, symlink refusal and source/index preservation pass. Repository subtree inputs are refused rather than silently changing the scan root.
- [x] T5 `tests/vh-adlc/docs-impact/cli.test.ts`, `plugins/vh-adlc/scripts/docs-impact/cli.ts` - observe failed process-level CLI cases, implement central roots resolution and source/metadata selection, then prove JSON/text/protocol/exits, stdin/unusual filenames and incomplete-with-known-candidates outcomes with no network or repository/cache writes (AC-02, AC-03).
  - Evidence: process-level CLI cases failed before `cli.ts` existed (`t5-red.log`). `t5-final.log` passes 15 tests for JSON/text, protocol 1, no-match/candidates/incomplete exits, explicit scope, NUL/UTF-8/unusual names, roots and offline missing-reader refusal. The latter uses the actual checker with an unavailable synthetic lock and network/cache sentinels; no download or binary-cache write occurs. Cache-free invocation disables Bun's own transpilation cache separately; runtime setup documents that setting.
- [x] T6 `plugins/vh-adlc/skills/vh-adlc-docs-impact/SKILL.md`, `plugins/vh-adlc/references/docs-impact.md`, lifecycle/loop/implement/ship references, package/discovery guards, examples, public guides and `.github/workflows/ci.yml` - observe failed routing/contract checks, add the portable operation and scoped integration, and pass existing protected-body and complete-example checks; both installed entry points remain testable (AC-04, AC-06).
  - Evidence: new routing/procedure checks failed before the skill/reference existed (`t6-red.log`). The package/integration/discovery/example/protected-body selection now passes 76 tests in `t6-package.log`. Implement/ship retain the original approved body after removing only the named Documentation impact section; source/classification preflight uses committed HEAD. Strict typechecking passes with locked compiler dependencies in owned temporary scratch, so compiler symlinks never enter the installed payload or confinement export. Linux and macOS CI select the portable tests and that typecheck; macOS execution remains CI evidence to obtain, not a local-host claim. Package candidate is 0.9.0 with 13 skills and the same 10 engineering operations. The new canary and pin use published convention `f8ccacbedf057159ea24136ba115cd9857bb22ac` from merged vhco-pro/docs#21; its complete three-file diff was reviewed and the only unrelated coding guidance was owner-accepted before the move.
- [x] T7 `Stackweaver:agents/docs-impact.md`, `agents/docs-impact-project.md`, `scripts/check-doc-coverage.js`, `AGENTS.md`, retained callers and `tests/agent-docs-impact/` - use an isolated current-main migration branch, record the full caller inventory, observe failed compatibility/parity tests, then pass the real wrapper protocol/no-op/error/quoting/overlay cases and scoped rollback while preserving local policy. Rebuild the legacy index from the exact HEAD in disposable scratch; report committed-index drift separately. Keep the plan mapping-upkeep/review-staleness rule explicitly in the companion and rollback set (AC-05).
  Evidence: `DOCS_IMPACT_TEST_PLUGIN=<exact shared payload> node --test tests/agent-docs-impact/*.test.cjs` passes 16 tests at consumer `7a1e905635192c84c177260df26e8df0b811af00`; rebuilt-HEAD parity and scoped rollback results are recorded below.
- [x] T8 `plugins/vh-adlc/knowledge.md`, lock/manifests as required by the published dependency, `tests/vh-adlc/docs-impact/` - record and independently review the entire old-to-new convention diff before moving the pin; surface unrelated normative drift for owner acceptance. Execute actual bounded model trials and isolated native Codex/Claude candidate discovery/standalone checks, retaining exact payloads, returned evidence and unclaimed surfaces (AC-01, AC-04, AC-06).
  Evidence: actual Copilot Opus 5.5 trials 8/9/10 record successful observations for all 15 cases after focused recovery: 12 unaffected cases at `8de398e35f78f5b03964496c7589dbafd34d135f`, contracts at `4f29be5af2a2c680d103dc5e00064dd91bcb4a26`, and both manual routes at `1786f48929f66b966bb8739e5c245ac1722f2191`. The 12 run-8 classifications predate the target reference's general classification rule; their behavior under that revised text is unclaimed. Failed original results and exact reference/request deltas remain retained. Native Codex/Claude candidate 7 and installed standalone/new-pin checks pass at `4f29be5`, whose plugin tree equals the integrated target.
- [x] T9 `tests/vh-adlc/docs-impact/migration.test.ts`, `Stackweaver:tests/agent-docs-impact/` - observe failed cutover predicates, then pass exact-source candidate guards, full-corpus completeness, old-operation/new-pin offline setup, paired semantic review, fresh caller inventory and scoped rollback/reapply. Resolve the known one-line syntax prerequisite only through its separate reviewed correction; no source-ready result claims publication or consumer cutover (AC-05, AC-07).
  Evidence: R-11 independently executes source-candidate parity/preflight at shared `7a3c613` and consumer `7a1e905`: 790 docs, 3,336 source paths, zero losses/gaps, 16 contracts including named rollback. R-12 reads the whole auxiliary preflight and confirms the unchanged source. Root-addition and missing-rollback negative probes are retained. Migration readiness remains false until published acceptance; current consumer will be refreshed again for cutover.

- [ ] T10 `docs/specs/shared-docs-impact.md` and touched source/tests - run all required checks at the committed feature head, obtain actual independent Claude Code Opus 5.5 implementation review, address remaining findings with observed checks, retain the four R-8 nit obligations in task evidence and pass the source-completion gate. Actual shared publication, marketplace acceptance and current-consumer adoption follow the ordered delivery checks before migration is claimed (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07).

### Implementation progress

The common convention is published at
`vhco-pro/docs@f8ccacbedf057159ea24136ba115cd9857bb22ac`, merged through PR #21
at reviewed head `f7e4f87bbf2117dd30d64a4aa4fef21a02e60c69` after its exact-head
check passed. The complete old/new pin diff also includes the owner-accepted
five-line testing guidance. Rules and the existing feature matcher are unchanged.

T7 evidence: Stackweaver migration `7a1e905635192c84c177260df26e8df0b811af00`
includes published main `041a8c83a847e5bb6382f1372c6faf2ef665a78b`. Sixteen actual
Node checks pass: legacy stdin/quoting/exits, every retained invoking caller in a
fresh shell with and without setup, owned overlays, mixed incomplete hook output,
quiet no-match warnings, current reference bindings and exact rollback/reapply.
The rebuilt legacy index and shared collector compare 790 documents, 754 patterns
and 3,336 source paths: zero lost candidates, zero unresolved meaning risks and
3,625 conservative additions; committed-index drift is false. Rollback binds only
migration fragments against current main and preserves its unrelated useEffect rule.

T8 evidence: the latest actual Copilot Opus 5.5 observations cover all 15 cases,
with original failed runs preserved. Trial 8 at `8de398e35f78f5b03964496c7589dbafd34d135f`
passes the 12 unaffected cases. Trial 9 at `4f29be5af2a2c680d103dc5e00064dd91bcb4a26`
passes the mixed-contract case after the reference distinguishes known omissions
from unavailable evidence; both setup/knowledge entry fixes also pass there.
Trial 10 at `1786f48929f66b966bb8739e5c245ac1722f2191` passes the two manual
assessments after their request explicitly asks for the review the grader checks.
The 12 run-8 classifications predate the target reference's general classification
rule; their behavior under that revised text is unclaimed. These are focused
retries, not an all-green first run. Across the selected cases,
only four permitted docs and the authorized PR draft change; every HEAD/index
is preserved. Actual native views deliver every nonempty line of the resolved
and required operation pages in each run, verified against exact content hashes.
Independent review still checks narrative accuracy against the synthetic source.

Candidate 7 at `4f29be5` installs in Codex CLI 0.163.0 and Claude Code CLI 2.1.316,
exposes all 13 skills and runs installed checking outside an agent session while
preserving inputs/index. Existing triage/maintenance knowledge and unwarmed,
explicitly prepared and warmed offline audit entry pass at the new pin. These
remain local-catalog checks. Integrated default `26c00e698860c88c3e2382ca9db5dd4b126c4cc1` leaves that plugin tree
unchanged; actual published-marketplace fresh/upgrade acceptance is still pending.

The initial strict-reader blocker was cleared separately by consumer commit
`3b655311558c69803528c1d9fbf9bf452a05494f`. Separate bounded review `syntax-fix-r2` executed
Claude Code Opus 5.5 and returned NO FINDINGS; its packet contained only the
original/proposed description line and actual parser excerpts. Local full-file
checks prove that only two quote bytes changed, every other body byte remained
identical, and retained index/audit/drift parsing kept the same values. The actual
strict reader changes from malformed to answered with the original description.
The private report body was never sent for that syntax review.

The frozen-source plugin suite at `8de398e` passes 1,225 tests with zero failures.
The later reference/manual-request clarification passes 135 focused checks;
integration with default `26c00e698860c88c3e2382ca9db5dd4b126c4cc1` passes the
root Go tests and actionlint. The newly required remote-gui job also passes its
local build, Go race/vet/lint/module checks. Its ordinary package check passes six
tests with 24 opt-in live tests skipped; actual CI remains a separate observation. Go tests/vet/lint/module checks,
strict TypeScript, other-plugin tests and actionlint pass. Stackweaver's complete
selected verification passes 18 checks with zero failures/skips. No live product,
GUI, phone or actual Claude docs-impact execution is claimed by these checks.

Original failed artifacts remain retained: early confined network/cache failures,
the interrupted slow corpus pass, compiler dependencies inside the plugin tree,
the 1,215-test run with one timeout and its 48-pass isolated retry, the later loaded
host/unfinished-fixture run, and native adapter failures. Those include a missing
editable PR draft and a citation grader rejecting valid case-directory prefixes.
The corrected PR retry passes. Later runs 8/9 retain manual-route and mixed-contract
failures; the targeted clarifications and successful retries are recorded above.
The ordinary matcher retains measured Go-compatible reversed bracket ranges.

Early public and paired reviews found real edge cases and missing tests, which
were fixed with observed checks. The first formal diagnostic had partial requested
file coverage and is not completion evidence. The corrected collector now also
passes literal-BOM filename identity and actual feature-matcher/review-staleness
cases, strict UTF-8 policy and NUL-input BOM identity cases. The wrapper preserves
BOM-prefixed literal and Git-quoted names too. Exact-source preflight passes with an inherited invalid wrapper override
removed, and observed negative probes reject dirty consumer state, an older
installed payload and stale shared-commit parity, preserving the index. It still
reports migration readiness false without published acceptance and fresh paired
review. The installed roots command supplies every declared root, and successful
TAP must include the named rollback rehearsal. Actual negative probes add a new
malformed root and remove the rollback test; both are refused for those reasons.
A quiet advisory HEAD-only no-match check discards excluded-doc notices on stderr;
it never establishes verification of task-owned current metadata. Explicit overlays
remain required for that obligation. R-11 reads every required source/procedure file and observes 224 focused tests,
34 other-component tests and the exact-source consumer checks passing. It returns
no blocking or should-fix findings and one wording nit, now clarified above. Its
requested coverage was 27/28 files: it read only part of an older auxiliary
preflight JSON while independently executing the fresh preflight. Its one extra
shell call was a read-only line count of its own native check-output file, which
the reviewer disclosed. Isolation is procedural. No claim of complete requested
artifact coverage or completed delivery follows. Normal Linux/macOS CI/release,
marketplace acceptance, current-consumer cutover and final completion review
remain open. R-12 completes every requested follow-up read, returns no blocking
or should-fix findings and confirms the unchanged source behavior; its two
wording nits are corrected by naming observed default `26c00e6` in compatibility
and explicitly naming Copilot CLI Opus 5.5 in the parent roadmap.
The fresh R-10 spec review has no blocking or should-fix findings;
it confirms R-8 acceptance survives the unchanged normative baseline.

R-13 confirms the source behavior and explicit limits with full requested
follow-up coverage and no blocking or should-fix findings. Its two nits are
corrected in this feature document: T9 stays unchecked until the published
paired verification, and status_description retains the final completion review.
No other covered file changes after the reviewed commit.


### Publication verification

The owner authorized shared publication, normal release, actual marketplace
fresh/upgrade acceptance, the separate syntax prerequisite and gated Stackweaver
migration on 2026-11-05. Shared PR #51 first ran at `0c0f4facff7e53ce4b522add06ad1b349228eefe`,
after merging published default `7e67296` and its AppArmor CI repair. The plugin
payload remains unchanged. Linux CI passed 1,223 tests and failed two feature-
freshness fixture cases: their branch was main but Git's inherited default was
master. Both failures were reproduced with an isolated global Git configuration,
without changing host settings. Setting the fixture's local init.defaultBranch
makes all 30 collection checks pass under that master-default configuration and
this host's ordinary configuration. The original CI log and red/green artifacts
remain retained; the corrected exact-head Linux/macOS run is still required.

The corrected Linux CI at `60bb413` passes all 1,225 tests. Its macOS selection
passes 1,067 tests and fails only the invalid-byte filename fixture: the filesystem
returns EILSEQ before the checker runs. That Linux raw-byte filesystem case is
explicitly unsupported on macOS; valid UTF-8/BOM and all other portable cases
remain selected. The original failure stays retained. Claude Code Opus 5.5
independently reviewed the Git-default fixture correction and returned NO FINDINGS.


Shared PR #51 merged at `02096e780deea4d695c7352dca0bfd54808574b6` after every
job passed at `32db579625dffb6675399475321c2a4cdd98c6ac`. A later upstream
registration feature had already removed the obsolete guard against changing
that unrelated plugin; merging its published changes resolved the moving-main
failure without editing registration behavior. The actual published payload is
plugin 0.9.0, canonical digest
`2e0b09a6079e12f5a820853aaeb1a395ab971189872a2005ad8a5f0e754b5781`.

Actual GitHub-marketplace fresh installs and 0.8.0-to-0.9.0 upgrades pass in both
Codex and Claude CLI isolated profiles at that published commit. Each discovers
13 skills, runs installed roots/candidate/no-match checks preserving inputs,
HEAD and index, and passes uninstall/reinstall. Initial native install/discovery
and runtime setup succeeded; the acceptance operator then used a source path in
a log filename and hit ENOENT. The original transcripts and failure stay intact.
A separate continuation finishes those same installs, retaining the original
upgrade commands instead of relabelling an already upgraded profile as a fresh
upgrade. Native inventory and canonical controller hashes are both recorded with
their distinct algorithms; credentials were not copied and no model was invoked.

Installed triage/maintenance knowledge and unwarmed, explicitly prepared and warmed
offline audit setup pass at f8ccacb. Copilot Opus 5.5 trial 11 passes all twelve
previously pre-clarification cases under the current plugin tree, with complete
native read coverage. Together with the three earlier cases at that identical
plugin tree this closes the former twelve-case guidance limit. The earlier failed
runs and their original revision limits remain historical records above.
Stackweaver integration passes 18 applicable checks with zero failures/skips;
refreshed source-candidate wrapper/caller/rollback contracts pass 16 of 16.
Post-merge normal CI/release and fresh installed-consumer paired acceptance are
still required before migration or feature completion is claimed.


Normal post-merge CI passes at published source `02096e7`; the configured normal
release is v0.14.0 at that exact commit. Its detached signature is valid against
the repository public signing key, all four archive hashes match signed checksums,
and the Linux binary reports vh-adlc 0.14.0. Other release binaries were not
executed locally. Plugin installation deliberately retains its signed 0.9.0
runtime lock; the new release does not silently change that dependency.
The consumer's first final hook attempt had one unchanged frontend test timeout
while 1,248 tests passed. The focused file then passed both tests and the full
normal hook retry passed 18 applicable checks with zero failures or skips; no
product code was edited for that retry. Failure and retry artifacts are retained.

### Final delivery observations

Published main `02096e780deea4d695c7352dca0bfd54808574b6` passed all five jobs
in run 41979677921: Linux 1,226 pass, macOS 1,068 pass with its one documented
raw-byte-filename skip. All four actual Codex/Claude marketplace fresh/upgrade
cases pass. Trial 11 re-executes the twelve earlier classifications under the
current plugin component and passes all twelve; trials 9 and 10 supply the other
three passing cases under that same component. Native read coverage is retained.
This closes the earlier twelve-case guidance limitation without rewriting its
historical failed attempts or claiming fifteen cases passed in one run.

This host's user-scoped native plugins are also updated to 0.9.0: Codex from
0.8.0, Claude from 0.7.0. Enabled state, Claude scope/project settings and every
other installed plugin row are preserved. Desktop discovery refresh and Claude
model execution are not claimed by these native cache updates.

The final source checkout also incorporates published default
`1f5ac3d5b2b91c03fdc13dd7c73de529d5935c8d` and its separate YAML v4 repair.
The installed plugin tree remains byte-identical to source publication `02096e7`.
The following adoption record establishes consumer cutover. Final completion review remains open.

### Published Stackweaver adoption

Stackweaver [PR #1033](https://github.com/michielvha/stackweaver/pull/1033)
merged at `009a1c5f4d1761d28fb4bc896a9450823f3fc642` after the actual installed
migration preflight returned source_ready true, migration_ready true and no
failures. The approved consumer head is
`a85b41a3627d53c67f34b525a1fdfcc7e2498432`; the merge tree is byte-identical.
The source checkout at that gate is `3866058a54455e198dd569d0940f341b8aeb57a5`,
with the unchanged published plugin digest and convention recorded above.

Fresh installed checking on the actual merged revision passes: 794 documents,
756 patterns, 3,342 source paths, zero lost candidates or unresolved meaning
changes, no committed-index drift, all 16 contracts and 123 reviewed reference
entries with no unresolved caller. The contracts include the named scoped
rollback/reapply test. The frozen rollback baseline is
`1e0287936ace2e0910abcab8e770a5e312e8694b`; it preserves that published main's
manual-only hosted CI policy and unrelated product/visual changes. The prior
syntax prerequisite remains separately published through `57ff7884` and outside
rollback. All 18 applicable final local verification checks pass without skips.
An earlier integration hook had 24 passes and one explicit FAST=1 backend
vulnerability-check skip; that run is retained separately, not promoted to a
non-skipped pass. Product integration/E2E tests do not apply to the migration's
27 workflow/checker/test/metadata files, which change no application source.

Final paired Claude Code Opus 5.5 reviews are `paired-published-3` and its bounded
follow-up `paired-published-4`. The first independently executes current installed
checks and reads all 57 required files/chunks; its sole rollback-baseline wording
nit is fixed. The follow-up reads all eight required chunks, independently reruns
installed parity/contracts and publication proof checks at the exact consumer
head, and returns NO FINDINGS. Isolation is procedural. The earlier ambiguous
pin nit uses a companion clarification: engineering rules are `0e52f51`, installed
documentation coverage is `f8ccacb`. The first full-coverage validator retained an
operator-generated review-targets.json exception, checked explicitly against the
launch target, consumer and both pins; all material prepared files remain bound.
Earlier partial-read review artifacts and failed preparation attempts remain
retained rather than relabelled as full initial successes.

T9 is now complete with actual published acceptance, paired review, fresh corpus,
caller inventory and scoped rollback. R-14 returns NO FINDINGS and retains the
owner's R-8 acceptance because the normalized normative baseline is unchanged.
Final criterion/completion review remains open. GUI/phone, actual Claude
docs-impact model execution and live product screenshot capture stay unclaimed.

The first final implementation review R-15 executes all 1,226 shared tests,
Go tests/vet/lint/module checks, then ends with exit 143 during typecheck setup.
The operator misread the quiet full-suite log as a stall and interrupted that
owned process group. This is an incomplete review, not a complete delivery pass.
Its two should-fix findings concern the wrapper: split the completed long suite
from remaining checks, and accept only trial 9's passing contracts case while
preserving its failed manual/fenced cases, which trial 10 separately fixes.
The two wording nits are corrected: Context now points to actual delivery, and
all review subsections precede the final Sources section. No product code or
accepted criterion changes. A redundant bounded host diagnostic is retained as
an additional partial attempt, not substituted for the independently observed
1,226-test pass. Follow-up must observe the remaining delivery checks.

R-16 returns met for all seven criteria after independently executing the
remaining delivery checks to completion. It verifies the prior 1,226-test log's
SHA256 and the unchanged implementation, then passes Go/vet/lint/module checks,
strict typecheck, actionlint, installed post-merge parity/contracts, all four
marketplace transcript hashes, actual published CI/release and every retained
model-case/component binding. Final source/consumer clean-state and index hashes
are preserved. The first full-suite pass is carried forward, not repeated or
presented as a new run. R-16 reads all required follow-up material; isolation is
procedural. Its two nits are addressed in an immutable companion receipt: the
actual executed script and reviewed packet script have identical SHA256, and
actual CI run 41979677921 contains successful job checker-macos (the
companion receipt retains its actual returned job ID and URL). No code changed.

Stackweaver's adoption-record correction is published at
`d77259358c87aebc93ad76231ae245fd790c043a`. It updates only its migration note,
test README, inventory hashes and internal changelog classification for merge
009a1c5. All 16 installed contracts and five normal hook checks pass. The first
hook refusal for that unclassified merge is retained and corrected through the
normal disposition mechanism. The read-only release watcher for merge 009a1c5
exits successfully: monorepo tag 5.109.13, frontend sync PR #313, frontend release
0.79.27. No manual CI or unrelated satellite action was dispatched by this work.
T10's final complete gate and status publication are the remaining bookkeeping.

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
| 2026-11-04 | R-6 | spec | `a07f5bf3e43178a0522c1f5b9c1595c868460f5f` | claude-opus-5-5 | procedural | No blockers; two should-fix findings and two nits on bootstrap order, uncovered docs and feature/marker boundaries. |
| 2026-11-04 | R-7 | spec | `0b1ed20d39c2165a0828ba39e30f62264fd7da99` | claude-opus-5-5 | procedural | No blockers; two should-fix findings and two nits on local-plan upkeep, corpus collection, policy view and intake routing. |
| 2026-11-04 | R-8 | spec | `372bd41b8cc56b470e0679b2bb2a8490f52c3969` | claude-opus-5-5 | procedural | No blocking or should-fix findings; four nits retained as implementation proof obligations. |
| 2026-11-05 | R-8 | spec | `372bd41b8cc56b470e0679b2bb2a8490f52c3969` | n/a | n/a | accepted by owner |
| 2026-11-05 | R-9 | implementation | `7d7b16673032459c89d9aefb3acba16767f748a0` | claude-opus-5-5 | procedural | AC-01 through AC-04 met; two should-fix findings and three nits, addressed in later commits. Delivery criteria remain open. |
| 2026-11-05 | R-10 | spec | `7a3c613f64e352084c6bc5730c09cf899fee2843` | claude-opus-5-5 | procedural | No blocking or should-fix findings; one progress-evidence nit addressed. Refreshes default-branch drift; unchanged R-8 acceptance retained. |
| 2026-11-05 | R-11 | implementation | `7a3c613f64e352084c6bc5730c09cf899fee2843` | claude-opus-5-5 | procedural | AC-01 through AC-04 met; AC-05/06 not verified, AC-07 not met; one wording nit addressed. Source review only; final delivery review remains open. |
| 2026-11-05 | R-12 | implementation | `abb576b068ae62ffe057a4692a314ed0601f0681` | claude-opus-5-5 | procedural | Full requested follow-up coverage; AC-01 through AC-04 met, delivery criteria open; two wording nits addressed. |
| 2026-11-05 | R-13 | implementation | `957597d23607146e3ac218d2ec96250d0f2f8f97` | claude-opus-5-5 | procedural | Full requested follow-up coverage; AC-01 through AC-04 met, delivery criteria open; two feature-document nits corrected. |
| 2026-11-05 | R-14 | spec | `3866058a54455e198dd569d0940f341b8aeb57a5` | claude-opus-5-5 | procedural | NO FINDINGS; full required coverage; refreshed default drift with unchanged R-8 normative acceptance. |
| 2026-11-05 | R-15 | implementation | `6e7630f1f3c64070b97f5c3f072eb159d7d4ab63` | claude-opus-5-5 | procedural | AC-01 through AC-04 met; delivery criteria not verified. Full suite 1,226 pass; wrapper interrupted during typecheck. Two operator-check should-fixes and two wording nits addressed for follow-up. |
| 2026-11-05 | R-16 | implementation | `2dd76e77e739080ee1027bf60c12f122273be6ac` | claude-opus-5-5 | procedural | All seven criteria met; full required follow-up coverage and completed delivery checks. Two metadata nits addressed without source changes. |

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

### R-6
FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 3. Shared review procedure and existing gates
EVIDENCE: The entry preflight runs before any task edit or doc fix. It adds the convention page to Start's initial knowledge request, and a present or uncertain marker goes through the shared roots CLI (shared-docs-impact.md:227-240). That CLI reaches the strict reader only through `ensure-vh-adlc.sh --offline`, and it never installs the binary. An absent binary yields `incomplete` (lines 142-146). Start step 1 obtains the binary through the ordinary online installer and runs `knowledge` in the same step (shared/plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:21-24, shared/plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:22-24, shared/plugins/vh-adlc/references/loop.md:18-22). The spec does not order the roots call relative to binary acquisition. On a host with a cold cache, a roots call made before the installer returns a gap. The spec also never says what implement or ship do with a roots `incomplete` or malformed-declaration gap at entry: stop before the first write, take the manual path, or continue and block only completion. Lines 241-243 say an incomplete assessment prevents a completion claim, and ship "reuses the same assessment". Ship can also deliver an in-progress PR with the gate skipped (ship SKILL.md:45-46), and the spec does not say whether an incomplete docs-impact result blocks that path or is only named in the PR.
PROPOSAL: Fix the entry order: run the ordinary installer first, then `roots`, then the single knowledge request that includes the page. State the implement and ship outcome for a roots gap at entry and for an incomplete assessment at ship, including whether an in-progress PR may proceed with the gap reported. Add those cases to AC-04.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 2. One reusable, read-only checker; Test Plan AC-02 and AC-03
EVIDENCE: The outcome table defines `none` as collection completed for declared coverage, and `incomplete` as roots, inputs or metadata that could not be checked (shared-docs-impact.md:184-188). Only a root with no declared coverage at all is named as incomplete coverage (line 191). The checker includes every tracked Markdown file under the roots without guessing which ones are generated (lines 173-174). AC-03 requires missing coverage to be visible (line 416). The spec never classifies a single tracked Markdown file that has no leading frontmatter, or that has valid frontmatter without `covers`. One reading makes such a file a reported but uncovered document. The other makes it unreadable metadata, so the whole run is incomplete. Stackweaver requires only `description` for internal docs (consumer/CLAUDE.md:281). Its legacy checker simply never matches a doc that is absent from the index (consumer/scripts/check-doc-coverage.js:69-77). Under the second reading, every wrapper run with source paths could exit 2 instead of 0 or 1, and no generic adopter with partly annotated docs could ever get `none`.
PROPOSAL: State that a document with no frontmatter or no `covers` field is listed as uncovered in the metadata coverage report and does not by itself make the run incomplete. Keep malformed or unterminated frontmatter and malformed `covers` as incomplete. Add both cases to AC-02 or AC-03 and to the Stackweaver parity set.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, 1. Common documentation convention; 3. Shared review procedure and existing gates
EVIDENCE: Feature documents inside the roots remain coverage-only candidates (shared-docs-impact.md:109-113). When a code area moves, the procedure requires reviewing and updating the affected `covers` mappings (lines 250-252). The list of things the procedure must not reinterpret names criteria, statuses and historical claims, but not a feature document's `covers` (line 115). A feature document's `covers` is normative frontmatter, so editing it is a revision that sends the document back to draft (engineering/conventions/feature-documents.md:70-73). Implement forbids editing `covers` to fit what was built (shared/plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:81-82). The general clause that metadata corrections stay within the task's authority (lines 253-254) leaves this case to inference.
PROPOSAL: State that mapping upkeep never edits the `covers` of a standard feature document. The procedure reports the moved path as a software or spec question routed to `vh-adlc-spec`. Add a coverage-only feature candidate to the AC-04 code-area-move case.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, 3. Shared review procedure and existing gates
EVIDENCE: The callers' textual presence check treats a repository as clearly absent when no raw line starts with `Documentation impact roots:` (shared-docs-impact.md:232-235). The roots CLI alone decides whether a "standalone line" outside code fences is a declaration (lines 204-210). The spec does not say whether the CLI also requires the prefix at column 0. If the CLI accepts an indented line, such as one inside a list item, the caller's precheck calls the repository absent and never invokes the CLI. That declared repository would then silently take the manual path.
PROPOSAL: Define the CLI's declaration line with the same column-0 prefix the textual check uses, and report a gap for an indented look-alike outside fences. Add an indented-line case to AC-04.

### R-7
FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 3. Shared review procedure and existing gates; 4. Stackweaver adoption
EVIDENCE: The spec defines two cases for covers upkeep after a code area moves. A standard feature document's covers is never edited and is routed to vh-adlc-spec. Local-format candidates follow their retained procedure (shared-docs-impact.md:266-270, Test Plan AC-04 at line 447). A third case gets no rule: a repository with no local-format declaration, where the default-root classification "is only an attention label, not a claim that a document conforms to the standard" (lines 121-123). That case is Stackweaver. Its AGENTS.md has neither a feature-root line nor a local-format line (consumer/AGENTS.md:1-60). Its plans live under docs/internal/plans (consumer/CLAUDE.md:291). The migration deliberately adds no marker (shared-docs-impact.md:300-303). The legacy procedure updates the covers of any doc whose code area moved (consumer/agents/docs-impact.md:74-76; consumer/CLAUDE.md:285). Stackweaver's implement gate also reads plan covers for review staleness (consumer/agents/implement.md:33-36). Line 270 says an attention label "grants no feature-document edit", which does not settle whether ordinary covers upkeep applies. So after a rename, one agent could edit a labelled Stackweaver plan's covers, as legacy does, and another could refuse and route it to vh-adlc-spec. The AC-05 parity set covers only labelling and gates (line 448).
PROPOSAL: State the covers-upkeep rule for attention-labelled documents in a repository with no local-format declaration. For example, report the moved mapping without editing it, or follow that repository's retained local procedure. Add a renamed code area covered by a Stackweaver plan to the AC-04 and AC-05 cases.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, 4. Stackweaver adoption; Test Plan AC-05 and AC-07
EVIDENCE: The shared checker reads every tracked Markdown file under the roots through the strict settings reader. Strict-reader failures and malformed HEAD metadata make the result incomplete (shared-docs-impact.md:143-145, 171-174, 194-197). The legacy index builder accepted Stackweaver's frontmatter with its own parser (line 68). Every internal Stackweaver doc carries frontmatter (consumer/CLAUDE.md:281). When source paths remain, the wrapper maps incomplete to exit 2 (lines 351-356). Local ship forbids shipping over a failed doc-impact check (consumer/agents/ship.md:121-122). The only cutover resolution path in the spec is for a valid covers declaration whose meaning changes. That path forbids editing unrelated docs to make migration pass (lines 380-386). AC-05 refuses cutover on candidate loss (line 448). No criterion requires the current HEAD corpus to produce complete collection. So suppose one committed doc has frontmatter the legacy builder accepts but the strict subset refuses. Cutover could then pass candidate parity while every later wrapper run with source paths exits 2, and no permitted fix exists.
PROPOSAL: Require the current-consumer preflight to show that the exact cutover HEAD corpus under the declared roots collects without incomplete. State the resolution for frontmatter the strict reader refuses: either a separately reviewed syntax-only correction that keeps its meaning for the retained index, audit and drift readers, or a cutover block.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, 1. Common documentation convention; 2. One reusable, read-only checker; 3. Shared review procedure and existing gates
EVIDENCE: The spec defines the metadata view precisely. It is HEAD by default, with working-tree overlays only for explicitly selected docs, so other sessions' dirty edits cannot change results (shared-docs-impact.md:162-174). Two other inputs also come from root AGENTS.md: the roots declaration read by the `roots` command (lines 214-221) and the feature-root and local-format classification (lines 116-120). The caller's textual presence check reads "the current root instructions" (lines 239-247). The spec never says whether `roots` and classification read AGENTS.md from HEAD or from the working tree. Stackweaver's main checkout is shared with other live sessions (consumer/CLAUDE.md:130). A dirty, uncommitted AGENTS.md edit could therefore change roots or classification, even though the same edit to a doc would be excluded.
PROPOSAL: State which view `roots` and feature classification read for root AGENTS.md, and make the caller's presence check use the same view. Add a dirty AGENTS.md case to AC-04.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, 3. Shared review procedure and existing gates
EVIDENCE: Lifecycle intake reuses the new procedure, and plain documentation editing must keep its route (shared-docs-impact.md:203-205). references/lifecycle.md and tests/vh-adlc/lifecycle/ are in covers (lines 9 and 25). The current intake table has one row, "Documentation or a convention", which edits the requested artifact directly (shared/plugins/vh-adlc/references/lifecycle.md:49). It has no row for reviewing documentation impact after a code change. The spec never says which generic requests intake routes to vh-adlc-docs-impact and which stay on that row. The discovery guard asserts that the existing row is present (shared/tests/vh-adlc/triage/discovery.test.ts:29-36). AC-04 exercises intake (line 447) without an expected routing result.
PROPOSAL: Name the new lifecycle row and the request that selects it, for example reviewing docs affected by a code change, and keep plain documentation edits on the existing row. Add one intake case for each route to AC-04.

### R-8
FINDING: F-01
KIND: judgement
SEVERITY: nit
WHERE: Design, 3. Shared review procedure and existing gates; 4. Stackweaver adoption
EVIDENCE: The R-7 F-01 fix sends attention-labelled Stackweaver plans to Stackweaver's existing local covers-upkeep rule after a rename (shared-docs-impact.md:279-283). Today that rule exists only in consumer/agents/docs-impact.md:74-76, and the migration reroutes that file through the shared procedure (shared-docs-impact.md:309-311). The list of what the new companion retains does not include covers upkeep (lines 307-309). Lines 313-314 keep only the restriction to code and config paths. consumer/CLAUDE.md:285 covers creating or moving docs, not a code move. AC-05 tests this behavior (line 468), but after the reroute the spec names no file that holds the rule.
PROPOSAL: Name `agents/docs-impact-project.md` as the home of the plan covers-upkeep and review-staleness rule after a code move, and include that fragment in the parity comparison and the rollback blob set.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design, 4. Stackweaver adoption; Test Plan AC-05
EVIDENCE: The legacy checker matches against the generated `docs-coverage.json` (consumer/scripts/check-doc-coverage.js:17 and 35-40). The legacy procedure warns that this index can be stale and should then be rebuilt (consumer/agents/docs-impact.md:34-35). The spec requires every previously selected legacy candidate to stay selected and refuses cutover on candidate loss (shared-docs-impact.md:391-393, AC-05 at line 468). It does not say whether the legacy baseline uses the existing index or one rebuilt from the same HEAD. A stale index would report false losses or additions. The only resolution offered is a mapping correction that preserves the old candidates (lines 395-397), which would keep stale mappings alive.
PROPOSAL: Define the legacy parity baseline as the legacy matcher run over an index rebuilt from the exact cutover HEAD in a disposable copy. Report any drift in the existing index separately from candidate parity.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, 1. Common documentation convention; 4. Stackweaver adoption; Test Plan AC-07
EVIDENCE: knowledge.md holds exactly one docs SHA for the whole package (shared/tests/vh-adlc/check.test.ts:95-100). A repository with no pin uses the plugin pin for every operation (shared/plugins/vh-adlc/references/loop.md:58-60). The spec moves that pin to the recorded convention revision (shared-docs-impact.md:129-132). For existing operations it checks only that triage, maintenance and audit still resolve their pages at the new pin (lines 415-421, AC-07). Any other vhco-pro/docs commits between `0e52f51` and that revision also reach every unpinned consumer. That includes changes to the rules block the binary reads for its gates (engineering/conventions/feature-documents.md:200-203). Line 432 forbids bumping repository pins as a side effect, but nothing requires reviewing the docs diff that this plugin pin move brings in.
PROPOSAL: Require the pin-move task to record and review the complete vhco-pro/docs diff between the old pin and the recorded convention revision. Any unrelated normative change should be reported and accepted before the pin moves.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, 2. One reusable, read-only checker; 3. Shared review procedure and existing gates
EVIDENCE: The R-7 F-03 fix says that roots resolution, feature-root classification and the callers' presence check all read root `AGENTS.md` from committed HEAD, and that dirty edits are excluded (shared-docs-impact.md:150-151). The entry preflight still tells callers to check whether the declaration is absent from "the current root instructions" (line 249). Read alone, that sentence suggests the working tree, while AC-04 requires HEAD for all three reads (line 467).
PROPOSAL: Replace "the current root instructions" at line 249 with root `AGENTS.md` at committed HEAD, so the preflight text uses the same view as the policy rule.

### R-9
CRITERION: AC-01 Adopting repositories have one published coverage convention, without needing Stackweaver's generator or changing existing feature-review freshness semantics.
VERDICT: met
EVIDENCE: bash /home/m/code/.docs-impact-review-archive/implementation-review-2/../implementation-review-checks-2.sh, shared 7d7b16673032459c89d9aefb3acba16767f748a0 with pin f8ccacbedf057159ea24136ba115cd9857bb22ac, observed published-ancestry check "ahead", docs check over 28 Markdown files and the unchanged rules block (9 statuses, 12 conditions, 17 next rules), 222 focused docs-impact/package tests passing with 0 failures, and unchanged Go internal/doc and gate packages passing with vet/lint at 0 issues. I read published/conventions/documentation-impact.md:69-78 and confirmed it keeps feature matching separate. collection.ts:146-149 and 249-253 classify feature roots offline from HEAD AGENTS.md, and matching.ts implements the published table. Limitation: the check printed only aggregate test counts, not per-case names for the second-repository example.
CRITERION: AC-02 The shared checker reads committed HEAD Markdown coverage plus explicitly selected document overlays and returns the correct affected docs and source matches for a bounded Git/path scope without relying on a generated index or changing the repository.
VERDICT: met
EVIDENCE: The fixed check script at target 7d7b166 ran the focused matching, collection and CLI suites: 222 pass, 0 fail, with source/consumer indexes and refs preserved. Inspection agrees. collection.ts:115-131 and 241-246 read HEAD blobs by tree mode and use working-tree bytes only for --metadata-path overlays. collection.ts:216-225 compares against one merge-base and includes rename/delete names, with dirty paths excluded unless selected. No generated index is read. The rebuilt-index parity run shows 790 documents, 3336 sources, 0 losses and no committed-index drift. Limitation: individual test names were not printed.
CRITERION: AC-03 No-match, affected-doc and incomplete-check results are distinguishable, with missing/unreadable/malformed coverage and unmatched source scope visible rather than reported as verified accuracy.
VERDICT: met
EVIDENCE: The fixed check script at 7d7b166 ran the focused CLI/collection tests and the settings-reader regressions: 222 pass, 0 fail. The consumer wrapper tests confirm mixed known matches plus a malformed overlay give exit 2, with both shown on stdout. Inspection agrees. cli.ts:64-65 maps incomplete to exit 2. collection.ts:186-197 marks no frontmatter, no covers or an empty list as uncovered, while null/invalid covers, unterminated headers, symlinks and reader failures become gaps. collection.ts:258 makes a root with no usable coverage incomplete, and collection.ts:265 lists unmatched sources. Limitation: macOS was not exercised.
CRITERION: AC-04 Direct and integrated agent review use the same portable procedure, ground permitted updates in code and local rules, preserve historical/intended contracts and honor read-only and existing review/publication gates.
VERDICT: met
EVIDENCE: The fixed check script ran the package, discovery, protected-body and example tests at 7d7b166 (222 pass). I inspected the retained actual Copilot claude-opus-5.5 fifteen-case run at e028664a9487fe832cb2d982273468974345f298. exact-component-binding.json shows its component tree 35d1c8ea equals the target's. Per-case operations in copilot-result.json show setup before roots, a malformed-roots stop before knowledge, old-pin knowledge exit 5, incomplete blocking implement/ship with a progress-PR draft only, and HEAD/index preserved. The only edits were the allowed doc, plan and draft files, and returned.txt cites real fixture lines. Limitations: I did not re-execute the model run here, and one contracts classification is understated (see F-03). Actual Claude docs-impact execution, GUI and live surfaces remain unclaimed.
CRITERION: AC-05 Stackweaver uses the shared checker/procedure with verified legacy-caller compatibility and scoped rollback, retaining site generation, visuals, local policy and unrelated workflows.
VERDICT: not met
EVIDENCE: The fixed check script ran the consumer rebuilt-index parity at baseline 75519076246be4875515a8ac02bb0a2dd4d81100: 754 patterns, 790 documents, 0 losses, 0 meaning risks, 3625 additions. It also ran the wrapper, caller and rollback tests and the preflight, which reported source_ready true and migration_ready false ("published convention, marketplace and paired-review evidence absent"). The migration exists only on an unmerged consumer branch commit. Caller checks ran against a source payload, not a published installed one. Limitation: the consumer merge and the installed-marketplace caller checks remain pending, so Stackweaver does not yet use the shared checker.
CRITERION: AC-06 Automated Linux/macOS checks, native installed/standalone execution and actual bounded Copilot trials establish the promised behavior at reviewed commits, with capability limits explicit.
VERDICT: not verified
EVIDENCE: The fixed check script at 7d7b166 observed local Linux tests, Go vet/lint/module checks, strict typecheck and workflow registration checks passing. The retained Copilot run is bound to the identical component tree. Actual macOS CI and normal shared CI were not observed. Native Codex/Claude installed/standalone results come from local catalogs, are recorded only as candidate proof, and were not executed in this review. Limitation: a passing Linux and Copilot subset does not upgrade this composite criterion.
CRITERION: AC-07 Convention/tool publication, real marketplace acceptance and paired current-consumer verification precede migration, and exact revisions, post-merge checks and rollback evidence are retained.
VERDICT: not met
EVIDENCE: The executed preflight at shared 7d7b166 and consumer 75519076 returned migration_ready false with the failure "published convention, marketplace and paired-review evidence absent". The convention is published at f8ccacb, but shared tool publication, real marketplace fresh/upgrade acceptance, paired current-consumer review and post-merge checks do not exist yet. Scoped rollback/reapply passed in the disposable rehearsal. Limitation: only source readiness is established, not delivery.
FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: consumer/after/tests/agent-docs-impact/preflight.cjs:39
EVIDENCE: The full-corpus completeness probe runs `check --repo <root> --docs-root docs --path __migration_probe__` with a hard-coded root. It never uses the roots the consumer declares in committed AGENTS.md. Design (shared-docs-impact.md:412-413) and AC-07 require complete collection of "the exact cutover HEAD corpus under every declared root". Stackweaver's declaration is ["docs/"] today, so it passes now. But a later added or changed declared root would go unchecked while corpus.gaps stays 0 and source_ready stays true.
PROPOSAL: Resolve roots first with the installed `roots --repo` command and require a `declared` outcome. Then pass each returned root as --docs-root to the corpus check, and bind the roots report head to the corpus head.
FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context; Tasks T9; Implementation progress
EVIDENCE: shared-docs-impact.md:78-79 says the checker found one strict-reader refusal in the consumer HEAD corpus and calls it "a migration blocker until its separate syntax correction is reviewed and verified". T9 (line 495) repeats that it must be resolved only through a separate reviewed correction. The executed preflight at consumer 75519076 now reports the corpus complete (source_ready true, zero gaps). The progress section (lines 506-514) does not say which commit made the correction, which review approved it, or whether it agrees with the retained index, audit and drift readers. AC-07 says only such a reviewed correction can clear the block.
PROPOSAL: Record the correction commit, its separate review and its retained-reader equivalence result in T9 or the progress evidence. Otherwise update Context so it no longer describes an open blocker that the executed preflight no longer shows.
FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: observations/copilot-returned.txt:26-27,46; shared/tests/vh-adlc/docs-impact/assessments.ts:41
EVIDENCE: In the contracts case, docs/guide.md:6 says port 8080 and contracts/src/app.ts:1 sets 9090, which is a changed default. The model classified guide.md only as Incomplete, for the missing NEW_SERVICE_FEATURE, and its prose for that case does not mention the stale port. It also cited src/app.ts:1 for other-system.md, although it says that system's implementation is unavailable. The evaluator accepts any of the four labels and any existing src line, so result.json pass cannot detect either issue. The other cases do catch the 8080/9090 mismatch as Stale.
PROPOSAL: Record that semantic review corrected the label in the retained trial notes. For deterministic fixture cases, add expected classifications, and accept an empty source citation with a stated reason where no implementation exists.
FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: consumer/after/scripts/check-doc-coverage.js:111-112
EVIDENCE: When the outcome is `none` and no overlay is selected, the excluded dirty docs are written only to stderr. The retained hook runs `2>/dev/null` (consumer/after/.githooks/pre-commit:73), and wrapper.test.cjs:67 and 120 assert the quiet behavior. During pre-commit, a staged covers edit counts as dirty against HEAD. So a commit that moves both code and its mapping gets a silent no-match based on HEAD metadata. Design line 362-364 asks that the metadata view and excluded dirty docs be reported, so that HEAD-only checking cannot stand in for the current-metadata assessment.
PROPOSAL: Print a one-line HEAD-metadata notice on stdout whenever excluded dirty docs exist, or record the silent advisory no-match as an accepted limitation in the companion and the compatibility docs.
FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: consumer/after/tests/agent-docs-impact/preflight.cjs:42,47
EVIDENCE: All four rollback properties (preserved_unrelated, preserved_index, refused_conflicts, refused_symlinks) are set from one value, `contracts.exit === 0`. That value is the aggregate exit of every *.test.cjs file in the directory. If rollback.test.cjs were removed or renamed, the remaining tests would still exit 0 and the preflight would report every rollback property as verified.
PROPOSAL: Require the rollback test to be present and to have passed by name, for example by checking the node --test report for that test, before setting the rollback fields.

### R-10

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Tasks, Implementation progress
EVIDENCE: shared/docs/specs/shared-docs-impact.md:546-547 says "current-main integration also passes the Go/workflow checks", and line 533 says "Integrated current main leaves that plugin tree unchanged". Neither line names the integrated default revision. default-branch-covered-drift.patch:9-38 shows that main at 26c00e6 adds a `remote-gui` job, running Go build/test/vet/golangci-lint/tidy and `bun test tests/remote-gui`, and makes `version` need it (shared/.github/workflows/ci.yml:89-117). After that merge, the earlier "current-main" Go/workflow observation does not show that the merged head passes the newly required job. The plan itself stays consistent with current main. The docs-impact typecheck and test selections are unchanged at ci.yml:48-52 and 72-87. The README and marketplace changes only add a `remote-gui` row (README.md:85, docs/reference/marketplace.md:14), and the docs-impact setup section and example link are still in place (marketplace.md:104-112, README.md:28). Line 533's plugin-tree claim still holds, because the patch does not touch `plugins/vh-adlc/`. Scope, Design, Acceptance Criteria, Test Plan and `covers` are not changed by this drift, so the R-8 acceptance can stand under engineering/conventions/feature-documents.md:196-198.
PROPOSAL: Name the integrated default revision (26c00e6) in the progress observation. Mark the earlier Go/workflow result as bound to the previous main, not to the merged head. That lets T10's run at the committed feature head cover the added `remote-gui` CI job, as AC-07 requires ("record actual observed default revisions").

### R-11
CRITERION: AC-01 Adopting repositories have one published coverage convention, without needing Stackweaver's generator or changing existing feature-review freshness semantics.
VERDICT: met
EVIDENCE: Ran bash /home/m/code/.docs-impact-review-archive/implementation-review-checks-3.sh against target 7a3c613f64e352084c6bc5730c09cf899fee2843, then read published/conventions/documentation-impact.md and shared/plugins/vh-adlc/scripts/docs-impact/matching.ts and collection.ts. The script exited 0. The docs check passed ("Checked 28 Markdown files", rules block with 9 statuses, 12 conditions and 17 next rules). The published ancestry step printed "ahead". The focused public suite passed 224 tests with 0 failures. Go tests passed, including internal/doc and internal/gate, and lint reported 0 issues. The convention is self-contained: the matching table is at lines 55-67, coverage-only feature labelling at 69-78 and the HEAD view at 80-102. The collector reads Markdown directly and uses no index. The feature resolver regex and the self-trigger exclusion are at collection.ts:147 and collection.ts:254. Limitations: the script prints a bare "ahead" for ancestry, and I could not inspect the script to say exactly what it compared. I did not list the individual test names behind the 224 passes. I also ran one shell command that was not authorized: a read-only `wc -l` on the script's output file. It changed nothing.
CRITERION: AC-02 The shared checker reads committed HEAD Markdown coverage plus explicitly selected document overlays and returns the correct affected docs and source matches for a bounded Git/path scope without relying on a generated index or changing the repository.
VERDICT: met
EVIDENCE: Same fixed script run at 7a3c613: 224 focused tests and 34 typechecked component tests passed with 0 failures, and the script reported that source, consumer, indexes and refs were preserved. I inspected collection.ts myself. HEAD tree reads use ls-tree and cat-file (lines 68-73 and 115-119). Overlays come only from --metadata-path and use no-follow lstat (lines 120-131 and 243). Base scope uses one unique merge-base plus rename and delete names (lines 216-223 and 93-100). Dirty and untracked paths are excluded unless selected (line 225). Unselected dirty docs are listed but not parsed (line 228). The CLI accepts NUL input with BOM preserved (cli.ts:46-53). The consumer full-corpus run compared 790 documents, 754 patterns and 3336 sources with 0 losses. Limitation: I did not execute individual synthetic cases outside the fixed script.
CRITERION: AC-03 No-match, affected-doc and incomplete-check results are distinguishable, with missing/unreadable/malformed coverage and unmatched source scope visible rather than reported as verified accuracy.
VERDICT: met
EVIDENCE: Same fixed script run at 7a3c613, with focused CLI and collection tests passing. In code, the outcome is set at collection.ts:267, the exit mapping is at cli.ts:65, and the text output carries a coverage-only disclaimer and the full report (cli.ts:69 and 78). A doc absent from both views fails (line 245). An unavailable reader is a gap (lines 111-113 and 239). A root with no usable coverage is a gap (line 259). Uncovered docs are listed (line 248) and unmatched sources reported (line 266). The consumer wrapper tests in the same run cover incomplete with known candidates, exit 2 on stdout, and malformed reports that cannot pass as a clean no-match (wrapper.test.cjs:62-68 and 93-101). Limitation: I did not separately run the offline missing-binary case outside the suite.
CRITERION: AC-04 Direct and integrated agent review use the same portable procedure, ground permitted updates in code and local rules, preserve historical/intended contracts and honor read-only and existing review/publication gates.
VERDICT: met
EVIDENCE: The fixed script run at 7a3c613 passed the package, discovery, protected-body and example checks in the focused suite. I read the retained Copilot claude-opus-5.5 transcripts in observations/trial-8, trial-9 and trial-10 returned.txt and copilot-result.json, and checked them against the synthetic fixtures in native-trial.ts:19-35. Cases checked: report, update, intake, entry gaps, old-pin missing-page, the implement and ship incomplete blocks, the progress draft, feature-move (spec proposal without an edit), local and unmarked plan upkeep, and unknown-plan (Unknown, no edit). Run 9 contracts at 4f29be5 keeps the 8080 contract as Accurate and calls 9090 a software bug. It reports the missing NEW_SERVICE_FEATURE guide with a suggested home. It treats injection.md as untrusted and classifies other-system.md as Unknown, with no source citation and a stated reason. Run 10 manual and fenced classify the guide as Stale, citing docs/guide.md:6 against src/app.ts:1. Only the permitted files changed, and HEAD and index were preserved. Limitations: these are retained trial artifacts that I did not execute. The 12 run-8 cases ran at 8de398e, before the classification guidance in exact-component-binding.json was added. Run 10 passed after the request text was changed. The covered-path review-refresh rule is checked as text only.
CRITERION: AC-05 Stackweaver uses the shared checker/procedure with verified legacy-caller compatibility and scoped rollback, retaining site generation, visuals, local policy and unrelated workflows.
VERDICT: not verified
EVIDENCE: The fixed script run at consumer 7a1e905635192c84c177260df26e8df0b811af00 rebuilt the legacy index from HEAD: 0 losses, 3625 additions, 0 meaning risks, committed index unchanged. Preflight returned source_ready true with the full corpus collected (outcome none, 0 gaps) and a complete inventory. That run included every retained caller and the named rollback test (preflight.cjs:46-47). I inspected the wrapper, hook, companion and rollback test. Local policy, visuals, index rebuild and plan upkeep remain in docs-impact-project.md. Limitations: preflight reported migration_ready false with "published convention, marketplace and paired-review evidence absent". The independently reviewed parity, installed-payload caller checks and the consumer merge have not been executed, so Stackweaver does not yet use the shared checker on its main line.
CRITERION: AC-06 Automated Linux/macOS checks, native installed/standalone execution and actual bounded Copilot trials establish the promised behavior at reviewed commits, with capability limits explicit.
VERDICT: not verified
EVIDENCE: The fixed script run at 7a3c613 passed the local Linux tests, Go vet and lint, strict typecheck and the workflow checks. I inspected the Copilot trials retained under AC-04. Limitations: no Linux or macOS CI run for the target was observed. Native Codex and Claude installed and standalone results are local-catalog candidate evidence at 4f29be5, and I did not execute them here.
CRITERION: AC-07 Convention/tool publication, real marketplace acceptance and paired current-consumer verification precede migration, and exact revisions, post-merge checks and rollback evidence are retained.
VERDICT: not met
EVIDENCE: The fixed script's preflight at shared 7a3c613 and consumer 7a1e905 printed migration_ready false, failing on "published convention, marketplace and paired-review evidence absent". Spec lines 575-576 still list shared publication, normal CI and release, marketplace acceptance and consumer cutover as open, and T9 and T10 are unticked. The convention was observed as published and the source-candidate guards pass, but tool publication, marketplace fresh and upgrade acceptance, paired review and post-merge checks do not exist yet.
FINDING: F-01
KIND: judgement
SEVERITY: nit
WHERE: Tasks, T8 evidence; Implementation progress, T8 evidence
EVIDENCE: shared-docs-impact.md:494 says trials 8, 9 and 10 "establish all 15 cases after focused recovery". observations/exact-component-binding.json shows that the reference diff from run 8 (8de398e) to the target adds a general classification rule: "Use Incomplete for an observed omission and Stale for an observed inaccurate current claim; reserve Unknown for missing applicability or evidence". That rule governs every classifying case, not just contracts. The 12 run-8 cases therefore never ran under the target reference's classification text. Only contracts (run 9) and manual and fenced (run 10, with a changed request) ran at a component equal to the target.
PROPOSAL: Say in the T8 evidence that the 12 run-8 classifications predate the target's classification rule, or rerun those 12 cases at the target component before using them as target evidence.

### R-12
CRITERION: AC-01 Adopting repositories have one published coverage convention, without needing Stackweaver's generator or changing existing feature-review freshness semantics.
VERDICT: met
EVIDENCE: This is carried-forward execution evidence plus a source comparison at target abb576b068ae62ffe057a4692a314ed0601f0681. The R-11 reviewer ran its fixed check script at 7a3c613f64e352084c6bc5730c09cf899fee2843 and observed exit 0, the docs check over 28 Markdown files with the unchanged rules block, published ancestry "ahead", 224 focused tests passing with 0 failures, and Go internal/doc and internal/gate tests and lint passing (observations/previous-implementation-review.txt:4). I read observations/review-followup-diff.patch in full. From 7a3c613 to the target it changes only docs/reference/compatibility.md, docs/specs/shared-docs-impact.md and docs/specs/shared-workflow-migration.md. It touches no plugin, script, test or convention file, so the checked behavior is unchanged. I rechecked the source: the feature-root resolver regex at shared/plugins/vh-adlc/scripts/docs-impact/collection.ts:147 matches the pinned rule at engineering/conventions/feature-documents.md:219. Limitations: I executed nothing in this review. The execution evidence is R-11's at 7a3c613 with its own limits: bare "ahead" output and no per-test names. Carrying it to abb576b depends on the diff showing that no code or tests changed.
CRITERION: AC-02 The shared checker reads committed HEAD Markdown coverage plus explicitly selected document overlays and returns the correct affected docs and source matches for a bounded Git/path scope without relying on a generated index or changing the repository.
VERDICT: met
EVIDENCE: This is carried-forward evidence at target abb576b. R-11's fixed script at 7a3c613 observed 224 focused tests and 34 typechecked component tests passing, with source, consumer, index and refs preserved (previous-implementation-review.txt:7). I read all of observations/preflight-current-source.json, including its 89k-token corpus line 73. The corpus command ran check with --repo, --docs-root docs and --path __migration_probe__ against consumer HEAD 7a1e905635192c84c177260df26e8df0b811af00. Its result has outcome none, policy view HEAD, excluded_dirty false, empty excluded_dirty_paths, excluded_dirty_docs and selected_paths, and per-document HEAD bindings with sha256 hashes. It reports the probe as an unmatched source and returns no diagnostics. The roots command at line 57 returned declared ["docs"] at the same head. The follow-up diff changes no checker source or test. Limitations: I executed nothing. The checks ran at 7a3c613, with the consumer at 7a1e905 and shared source 4f29be5 for the preflight. I did not run the individual synthetic overlay, rename or merge-base cases myself.
CRITERION: AC-03 No-match, affected-doc and incomplete-check results are distinguishable, with missing/unreadable/malformed coverage and unmatched source scope visible rather than reported as verified accuracy.
VERDICT: met
EVIDENCE: This is carried-forward evidence at target abb576b. R-11's run at 7a3c613 passed the focused CLI and collection tests and the consumer wrapper tests for incomplete-with-candidates and malformed reports (previous-implementation-review.txt:10). I rechecked collection.ts:267: the outcome is incomplete when there are diagnostics, otherwise candidates or none. The retained preflight's line 73 lists uncovered documents and an unmatched source separately from candidates, and contract_command TAP at line 87 passes subtests 12, 15 and 16: known matches retained on gaps, malformed reports never becoming a no-match, and hook exits 0, 1 and 2. That TAP shows 16 pass, 0 fail. The follow-up diff changes no code. Limitations: I executed nothing. The evidence is bound to 7a3c613 and to consumer 7a1e905. The offline missing-binary case was observed only inside R-11's suite.
CRITERION: AC-04 Direct and integrated agent review use the same portable procedure, ground permitted updates in code and local rules, preserve historical/intended contracts and honor read-only and existing review/publication gates.
VERDICT: met
EVIDENCE: This is carried-forward evidence at target abb576b. R-11 observed the package, discovery, protected-body and example checks passing at 7a3c613. It also inspected the retained Copilot Opus 5.5 trials 8, 9 and 10 (previous-implementation-review.txt:13). exact-component-binding.json shows an empty component diff from run 9 to the target. From run 8 the diff adds the general classification rule, which I confirmed at shared/plugins/vh-adlc/references/docs-impact.md:91. The R-11 F-01 nit is addressed. shared-docs-impact.md:501 and 530-531 now say the 12 run-8 classifications predate that rule and that their behavior under it is unclaimed. compatibility.md:144 states the same limit. Limitations: I executed nothing, and the model trials are retained artifacts at 8de398e, 4f29be5 and 1786f48. Run 10 passed only after its request text changed. The 12 run-8 classifications are not evidence under the current reference text. Actual Claude docs-impact execution remains unclaimed.
CRITERION: AC-05 Stackweaver uses the shared checker/procedure with verified legacy-caller compatibility and scoped rollback, retaining site generation, visuals, local policy and unrelated workflows.
VERDICT: not verified
EVIDENCE: I read the whole retained preflight: observations/preflight-current-source.json at shared 4f29be5 and consumer 7a1e905. It shows source_ready true, corpus outcome none with 0 gaps, a complete inventory with no unresolved callers, and parity rebuilt from HEAD with 0 lost candidates. The rollback fields are all true. The contract TAP passes 16 of 16, including subtest 7, the named rollback rehearsal. It also shows migration.ready false with the failure "published convention, marketplace and paired-review evidence absent", and published_observations is null. R-11 independently re-ran the same predicates at 7a3c613 (previous-implementation-review.txt:16). Limitations: the independently reviewed parity, the installed-marketplace caller checks and the consumer merge exist as required checks but have not run. The current docs say consumer cutover is pending (shared-docs-impact.md:594-595). I executed nothing.
CRITERION: AC-06 Automated Linux/macOS checks, native installed/standalone execution and actual bounded Copilot trials establish the promised behavior at reviewed commits, with capability limits explicit.
VERDICT: not verified
EVIDENCE: R-11's run at 7a3c613 observed local Linux tests, Go vet and lint, strict typecheck and workflow checks passing (previous-implementation-review.txt:19). The current docs keep the limits explicit. compatibility.md:145-146 labels the Codex and Claude rows as local-catalog candidate installs, not marketplace proof or Claude docs-impact model execution. compatibility.md:152-155 says actual Linux and macOS CI are pending. shared-docs-impact.md:559 says actual CI is a separate observation. Limitations: no Linux or macOS CI run at any reviewed commit was observed. The native installed and standalone results are local-catalog evidence at 4f29be5 that neither R-11 nor I executed. Some Copilot trial cases were not run against the current reference text (see AC-04). A passing subset does not upgrade this composite criterion.
CRITERION: AC-07 Convention/tool publication, real marketplace acceptance and paired current-consumer verification precede migration, and exact revisions, post-merge checks and rollback evidence are retained.
VERDICT: not met
EVIDENCE: The retained preflight (preflight-current-source.json:41-46) and R-11's fresh run at shared 7a3c613 and consumer 7a1e905 (previous-implementation-review.txt:22) both report migration ready false, failing on "published convention, marketplace and paired-review evidence absent". published_observations is null. T9 and T10 remain unticked (shared-docs-impact.md:502-503). Lines 594-596 list normal CI and release, marketplace acceptance, consumer cutover and final completion review as open. The convention is published at f8ccacb (lines 507-511), and the rollback rehearsal passed in a disposable repository. Limitations: tool publication, marketplace fresh and upgrade acceptance, paired current-consumer review and post-merge checks do not exist yet. This is source readiness only. I executed nothing.
FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: shared/docs/reference/compatibility.md, Shared documentation impact
EVIDENCE: compatibility.md:139-140 says "Integration with current main preserves its exact plugin tree." The follow-up applied the R-10 F-01 fix only to the feature document, which now names default 26c00e698860c88c3e2382ca9db5dd4b126c4cc1 at shared-docs-impact.md:542 and 556 (review-followup-diff.patch:68 and 77). The covered public compatibility page still binds this claim to a moving "current main", which goes stale on the next default-branch change. AC-07 asks for actual observed default revisions to be recorded.
PROPOSAL: Replace "current main" at compatibility.md:140 with the observed default revision 26c00e6, matching the feature document.
FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: shared/docs/specs/shared-workflow-migration.md, D-03 row
EVIDENCE: The new D-03 text says "Fifteen native cases have successful observed results across retained focused retries" (review-followup-diff.patch:221). The feature document uses "native" for the separate Codex and Claude installs ("isolated native Codex/Claude candidate", shared-docs-impact.md:500). The fifteen cases are Copilot CLI Opus 5.5 trials (shared-docs-impact.md:501; compatibility.md:144). compatibility.md:146 says the Claude row is not Claude docs-impact model execution. A roadmap reader could take "fifteen native cases" as native Codex or Claude model results, which would overstate the native proof.
PROPOSAL: Say "Fifteen Copilot CLI Opus 5.5 trial cases" in the D-03 row and keep the existing pointer to the child's revision limits.

### R-13
CRITERION: AC-01 Adopting repositories have one published coverage convention, without needing Stackweaver's generator or changing existing feature-review freshness semantics.
VERDICT: met
EVIDENCE: This is carried-forward evidence plus a diff inspection at target 957597d23607146e3ac218d2ec96250d0f2f8f97. I read observations/last-followup-diff.patch in full. From abb576b to the target it changes only docs/reference/compatibility.md (line 140), docs/specs/shared-docs-impact.md (status_description, the T9 tick and evidence, progress prose, the R-12 row and subsection) and docs/specs/shared-workflow-migration.md (the D-03 row). It touches no plugin, script, test or convention file. R-12 had already established that the step from 7a3c613 to abb576b was also docs-only (last-followup-review.txt:4). So the R-11 execution at 7a3c613 still applies to the unchanged behavior: the fixed check script exited 0, the docs check passed over 28 Markdown files with the unchanged rules block, published ancestry printed "ahead", 224 focused tests passed with 0 failures, and the Go internal/doc and internal/gate tests and lint passed (shared-docs-impact.md:1069). The convention is published at f8ccacb (shared-docs-impact.md:509-513), and the pinned feature-root rule is unchanged at engineering/conventions/feature-documents.md:217-219. Limitations: I executed nothing in this review. The execution evidence is R-11's at 7a3c613, with its own limits: bare "ahead" output and no per-test names. Carrying it to 957597d depends on two consecutive docs-only diffs.
CRITERION: AC-02 The shared checker reads committed HEAD Markdown coverage plus explicitly selected document overlays and returns the correct affected docs and source matches for a bounded Git/path scope without relying on a generated index or changing the repository.
VERDICT: met
EVIDENCE: This is carried-forward evidence at target 957597d. In R-11's fixed script run at 7a3c613, 224 focused tests and 34 typechecked component tests passed, and source, consumer, index and refs were preserved (shared-docs-impact.md:1072). R-12 read the whole retained preflight. It found a HEAD policy view, no excluded dirty input, per-document HEAD sha256 bindings, roots declared ["docs"] at consumer 7a1e905 and a complete corpus with no diagnostics (last-followup-review.txt:7). The latest diff changes no checker source, test or fixture (last-followup-diff.patch:1-114). Limitations: I executed nothing. The checks are bound to 7a3c613, to consumer 7a1e905 and to shared 4f29be5 for the preflight. I did not run the individual synthetic overlay, rename or merge-base cases.
CRITERION: AC-03 No-match, affected-doc and incomplete-check results are distinguishable, with missing/unreadable/malformed coverage and unmatched source scope visible rather than reported as verified accuracy.
VERDICT: met
EVIDENCE: This is carried-forward evidence at target 957597d. R-11's run at 7a3c613 passed the focused CLI and collection tests and the consumer wrapper tests. Those cover incomplete results with known candidates on stdout and malformed reports that cannot pass as a clean no-match (shared-docs-impact.md:1075). R-12 confirmed the retained contract TAP: 16 pass, 0 fail, including subtests 12, 15 and 16 (last-followup-review.txt:10). The latest diff changes no code or tests. Limitations: I executed nothing. The evidence is bound to 7a3c613 and consumer 7a1e905. The offline missing-binary case was observed only inside R-11's suite.
CRITERION: AC-04 Direct and integrated agent review use the same portable procedure, ground permitted updates in code and local rules, preserve historical/intended contracts and honor read-only and existing review/publication gates.
VERDICT: met
EVIDENCE: This is carried-forward evidence at target 957597d. At 7a3c613, R-11 observed the package, discovery, protected-body and example checks passing, and it inspected the retained Copilot Opus 5.5 trials 8, 9 and 10 (shared-docs-impact.md:1078). The latest diff makes the parent roadmap's D-03 row say "Fifteen Copilot CLI Opus 5.5 trial cases" (shared-workflow-migration.md:76). That matches the T8 evidence at shared-docs-impact.md:501 and the compatibility row at compatibility.md:144. The roadmap no longer suggests native Codex or Claude model results, which addresses R-12 F-02. shared-docs-impact.md:501 and 532-533 still say the 12 run-8 classifications predate the general classification rule and are unclaimed under it. Limitations: I executed nothing. The trials are retained artifacts at 8de398e, 4f29be5 and 1786f48. Run 10 passed only after its request text changed. The 12 run-8 classifications are not evidence under the current reference text, and actual Claude docs-impact execution remains unclaimed.
CRITERION: AC-05 Stackweaver uses the shared checker/procedure with verified legacy-caller compatibility and scoped rollback, retaining site generation, visuals, local policy and unrelated workflows.
VERDICT: not verified
EVIDENCE: R-12 read the whole retained preflight at shared 4f29be5 and consumer 7a1e905. It shows source_ready true, a complete corpus, a complete inventory, rebuilt-HEAD parity with 0 losses and 16 of 16 contracts passing, including the named rollback rehearsal. It also shows migration ready false and published_observations null (last-followup-review.txt:16). R-11 ran the same predicates again at 7a3c613 (shared-docs-impact.md:1081). consumer/after/tests/agent-docs-impact/README.md:43-54 puts the current-HEAD reinspection, the fresh paired semantic review on the exact shipped payload and the merge after publication. Limitations: the installed-marketplace caller checks, independently reviewed paired parity and the consumer merge are required checks that have not run. Consumer cutover is pending (shared-docs-impact.md:596-597). I executed nothing.
CRITERION: AC-06 Automated Linux/macOS checks, native installed/standalone execution and actual bounded Copilot trials establish the promised behavior at reviewed commits, with capability limits explicit.
VERDICT: not verified
EVIDENCE: R-11's run at 7a3c613 passed the local Linux tests, Go vet and lint, strict typecheck and workflow checks (shared-docs-impact.md:1084). The limits are still explicit. compatibility.md:145-146 labels the Codex and Claude rows as local-catalog candidate installs, not marketplace proof or Claude docs-impact model execution. compatibility.md:152-155 says actual Linux and macOS CI and published marketplace acceptance are pending. shared-docs-impact.md:561 says actual CI is a separate observation. Limitations: I observed no Linux or macOS CI run at any reviewed commit. The native installed and standalone results are local-catalog evidence at 4f29be5 that no reviewer executed. Some Copilot cases did not run under the current reference text (see AC-04). A passing subset does not upgrade this composite criterion.
CRITERION: AC-07 Convention/tool publication, real marketplace acceptance and paired current-consumer verification precede migration, and exact revisions, post-merge checks and rollback evidence are retained.
VERDICT: not met
EVIDENCE: The retained preflight and R-11's run at shared 7a3c613 and consumer 7a1e905 both report migration ready false: "published convention, marketplace and paired-review evidence absent" (shared-docs-impact.md:1087; last-followup-review.txt:22). The T9 evidence line also says migration readiness stays false (shared-docs-impact.md:503). T10 is still unticked (line 505). Lines 596-598 list normal CI and release, marketplace acceptance, current-consumer cutover and final completion review as open. The latest diff fixes R-12 F-01. compatibility.md:140 now binds the plugin-tree claim to observed default 26c00e698860c88c3e2382ca9db5dd4b126c4cc1, which matches shared-docs-impact.md:544 and 558, as the criterion requires for observed default revisions. Limitations: tool publication, real marketplace fresh and upgrade acceptance, paired current-consumer review and post-merge checks do not exist yet. Only source readiness and a disposable rollback rehearsal are established. I executed nothing.
FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Tasks, T9
EVIDENCE: The latest diff ticks T9 (last-followup-diff.patch:31-33; shared-docs-impact.md:502). T9's done condition includes passing "paired semantic review". The consumer procedure puts "the fresh paired semantic review for the exact shared payload and consumer commit" after publication and marketplace acceptance (consumer/after/tests/agent-docs-impact/README.md:34-49). The preflight still fails with "paired-review evidence absent" (shared-docs-impact.md:1087), and R-12's AC-05 record says the independently reviewed parity has not run. The new T9 evidence names R-11 and R-12 source reviews but does not say they are the paired semantic review that T9 requires.
PROPOSAL: Either untick T9 until the paired semantic review exists, or state in the T9 evidence that the source-candidate part is done and the paired semantic review moves to the delivery checks under T10.
FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: frontmatter status_description
EVIDENCE: The new status_description lists only "ordered CI, publication, installed marketplace acceptance and cutover" as open (shared-docs-impact.md:4; last-followup-diff.patch:22-23). It dropped the earlier "final independent review". The progress text still lists "final completion review" as open (shared-docs-impact.md:596-598), and T10, which requires the completion implementation review, is unticked (line 505).
PROPOSAL: Add the final completion review back to the open items in status_description.

### R-14

NO FINDINGS

### R-15

CRITERION: AC-01 Adopting repositories have one published coverage convention, without needing Stackweaver's generator or changing existing feature-review freshness semantics.
VERDICT: met
EVIDENCE: Ran bash /home/m/code/.docs-impact-review-archive/check-delivery-implementation.sh once, in the foreground, against shared 6e7630f1f3c64070b97f5c3f072eb159d7d4ab63. Before it stopped, these steps passed: the full Bun plugin suite (1226 pass, 0 fail, 100 files); go test ./... with internal/doc, internal/fresh and internal/gate ok; go vet; golangci-lint config verify and run ("0 issues"); and go mod tidy -diff. I read the published conventions/documentation-impact.md at f8ccacb in full. It is self-contained. Lines 69-78 keep ordinary coverage separate from the feature-review matcher and label feature candidates coverage-only. Lines 26-30 assign enforcement to vh-adlc, with no Stackweaver generator or index. The pinned feature-documents rules block at 0e52f51 is the one I read. Limitations: the script printed only aggregate counts, so I did not see which test covers the second-repository example. The run ended before typecheck finished (see F-01).
CRITERION: AC-02 The shared checker reads committed HEAD Markdown coverage plus explicitly selected document overlays and returns the correct affected docs and source matches for a bounded Git/path scope without relying on a generated index or changing the repository.
VERDICT: met
EVIDENCE: Same fixed script run at 6e7630f. The whole tests/vh-adlc Bun suite passed: 1226 pass, 0 fail, 4473 expect() calls. It contains the matching, collection and CLI suites for HEAD and overlay views, merge-base scope, rename and delete, dirty exclusion, NUL input and source/index preservation. The published convention at lines 80-101 defines the same HEAD and overlay contract, and the trial 11 "update" and "feature-move" cases show --metadata-path overlays overriding HEAD with HEAD and index preserved. Limitations: no per-test names were printed. The script was terminated before its final clean-tree and index-hash assertions ran, so I did not observe preservation in this run.
CRITERION: AC-03 No-match, affected-doc and incomplete-check results are distinguishable, with missing/unreadable/malformed coverage and unmatched source scope visible rather than reported as verified accuracy.
VERDICT: met
EVIDENCE: Same fixed script run at 6e7630f: the full plugin suite passed (1226 pass, 0 fail), including the CLI exit/outcome, collection gap, symlink, uncovered-document and settings-reader regression tests. The published convention lines 96-99 and 122-148 define candidates/none exit 0 and incomplete exit 2, with known candidates kept visible. Trial 11 shows incomplete results with exit 2 alongside known candidates in implement-gap, ship-gap and ship-progress, and roots exit 2 for malformed. Limitations: aggregate counts only. The script did not reach the consumer wrapper contracts, so I did not observe legacy exit mapping in this run.
CRITERION: AC-04 Direct and integrated agent review use the same portable procedure, ground permitted updates in code and local rules, preserve historical/intended contracts and honor read-only and existing review/publication gates.
VERDICT: met
EVIDENCE: The fixed script run at 6e7630f passed the package, discovery, protected-body, lifecycle and example tests inside the 1226-test suite. I read the retained Copilot claude-opus-5.5 returns and results for trials 9, 10 and 11:
- Trial 11 (12 cases, pass true, no failures): report and intake were report-only and classified Stale with guide.md:6 against src/app.ts:1. Update made a minimal edit. Malformed stopped at roots exit 2. Old-pin stopped at knowledge exit 5 with a handoff. Implement-gap and ship-gap were blocked. Ship-progress wrote only a local draft. In feature-move the feature doc was left unedited and routed to vh-adlc-spec. Local-plan and unmarked-plan followed the local procedure, and unknown-plan was classified Unknown with no edit.
- Trial 9 contracts kept the 8080 contract and called 9090 a software bug. It treated injection.md as untrusted and gave other-system.md no source citation, with a stated reason.
- Trial 10: manual and fenced kept manual review with no check, both classified Stale.
- Every case preserved HEAD and index, and read-coverage shows no missing lines.
Limitations: the trials are retained artifacts I did not re-execute. The script ended before its component-binding assertion, so I did not observe that the trials ran on the current plugin tree. Actual Claude docs-impact execution is unclaimed.
CRITERION: AC-05 Stackweaver uses the shared checker/procedure with verified legacy-caller compatibility and scoped rollback, retaining site generation, visuals, local policy and unrelated workflows.
VERDICT: not verified
EVIDENCE: The fixed script includes installed parity.cjs, preflight.cjs and the 16 consumer contracts on merged Stackweaver 009a1c5f4d1761d28fb4bc896a9450823f3fc642. The run was terminated with exit 143 during the docs-impact typecheck step, before those steps ran, so I observed none of them. The supplied postmerge.json claims all of the following, but I could not confirm it independently: pass true, an identical merge tree, 794 documents, 0 lost candidates, contract TAP 16/16 including named rollback test 7, and 123 inventory entries with none unresolved. Limitations: a check exists, but I did not observe it executing in this review.
CRITERION: AC-06 Automated Linux/macOS checks, native installed/standalone execution and actual bounded Copilot trials establish the promised behavior at reviewed commits, with capability limits explicit.
VERDICT: not verified
EVIDENCE: At 6e7630f I observed the local Linux Bun suite (1226 pass), Go tests, vet, lint and module tidy passing. The run then stopped with exit 143 before typecheck, actionlint, the gh check of CI run 41979677921, the marketplace transcript hash checks and the trial component-binding assertions. The supplied trial-9 result.json records pass false with failures for manual and fenced, which the fixed assertion would reject (see F-02). compatibility.md:63-93 states the limits explicitly. Limitations: macOS CI, native marketplace execution and trial-to-component binding were not observed. A passing subset does not upgrade this composite criterion.
CRITERION: AC-07 Convention/tool publication, real marketplace acceptance and paired current-consumer verification precede migration, and exact revisions, post-merge checks and rollback evidence are retained.
VERDICT: not verified
EVIDENCE: The fixed script's publication, marketplace, release, premerge-gate, postmerge and paired-validation assertions sit after the step where the run was terminated (exit 143 during typecheck), so none were observed. Supplied artifacts claim the delivery: published-receipt.json, postmerge.json, paired-validation.json with pass true and 8/8 files read, and paired-review.txt NO FINDINGS. The spec records publication at 02096e7, release v0.14.0 and merge 009a1c5 at lines 654-695. I did not verify any of these by execution. Limitations: a check exists, but I did not observe it executing in this review.
FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: delivery check script, check-delivery-implementation.sh
EVIDENCE: The single foreground run of bash /home/m/code/.docs-impact-review-archive/check-delivery-implementation.sh ended with exit 143 ("Terminated") right after "bun install" inside "bash typecheck.sh". The Bun suite alone reported "[413.69s]", so the script cannot finish under the 600000 ms synchronous limit. Typecheck, actionlint, git diff --check, consumer parity/preflight, every publication/marketplace/trial/CI/release/postmerge assertion and the final cleanliness checks never ran.
PROPOSAL: Run the gate as a background command with native-owned output, or split the long plugin suite from the delivery assertions. Then repeat the independent review so that AC-05 through AC-07 rest on an observed completed run.
FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: delivery/trial-9/result.json; fixed check trial assertion
EVIDENCE: delivery/trial-9/result.json:17-21 records "pass": false with failures "manual:unclassified-or-uncited:docs/guide.md" and "fenced:unclassified-or-uncited:docs/guide.md". checks.sh:35 asserts v['pass'] and not v['failures'] for trial 9, the case it relies on for contracts. If the archive copy matches the packet copy, the gate fails at that assertion. If it does not match, the packet does not bind the evidence the gate checks. Only the contracts case is claimed from trial 9, and its per-case evidence is sound.
PROPOSAL: Make the trial-9 assertion per case, requiring the contracts case to have no failures while keeping the overall failure as history, or bind a passing contracts-only artifact. Confirm that the packet copy and the archive copy are byte-identical.
FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context
EVIDENCE: shared-docs-impact.md:75-78 still says "shared publication, installed marketplace acceptance, final review and consumer cutover remain open". Lines 654-695 record publication at 02096e7, marketplace acceptance and the Stackweaver merge at 009a1c5.
PROPOSAL: Update the Context sentence so only the final completion review remains open, and point to the publication and adoption sections.
FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Review Log; Sources
EVIDENCE: The "### R-14" subsection with "NO FINDINGS" is at shared-docs-impact.md:1310-1312, after "## Sources" at line 1302. Structurally it therefore sits under Sources rather than Review Log, while engineering/conventions/feature-documents.md:66-67 makes Sources the last section.
PROPOSAL: Move the R-14 subsection up to follow R-13 inside Review Log, so Sources stays last.

### R-16

CRITERION: AC-01 Adopting repositories have one published coverage convention, without needing Stackweaver's generator or changing existing feature-review freshness semantics.
VERDICT: met
EVIDENCE: I ran `bash /home/m/code/.docs-impact-review-archive/check-delivery-implementation-2.sh` once, in the foreground, at 2dd76e7. It ran to the end and printed "Final delivery checks passed". The full Bun suite was not run again in this review. The script checked the SHA256 of the R-15 suite log from 6e7630f (1226 pass, 0 fail, 100 files). It also showed that `git diff --name-only 6e7630f HEAD` changes only `docs/specs/shared-docs-impact.md`, so that suite result still applies to unchanged code. Observed in this run: go test ./... passed, with doc, fresh and gate ok. The results came from Go's test cache, which reuses them only when inputs are unchanged. go vet, golangci-lint config verify and run ("0 issues"), go mod tidy -diff, typecheck, actionlint and git diff --check also passed. The convention reading at f8ccacb is carried forward from R-15 and the convention is unchanged: lines 26-30 and 69-78 keep it self-contained, keep feature matching separate, and need no Stackweaver generator or index. Limitation: the suite printed totals only, not per-test names.
CRITERION: AC-02 The shared checker reads committed HEAD Markdown coverage plus explicitly selected document overlays and returns the correct affected docs and source matches for a bounded Git/path scope without relying on a generated index or changing the repository.
VERDICT: met
EVIDENCE: The 1226/0 suite result is carried forward, bound by hash and by the unchanged code. It includes the HEAD and overlay, merge-base, rename and delete, dirty-exclusion, NUL and preservation suites. Observed in this run: the installed parity.cjs on Stackweaver 009a1c5 printed 794 documents, 3342 sources, 0 losses, 0 meaning risks and committed_index_differs false. The final assertions also passed: source and consumer `git status` were clean and both index SHA256 values were unchanged. Trial 11 "update" and "feature-move" overlay evidence is a retained file, now shown to run on the current plugin tree: its `source_commit:plugins/vh-adlc` tree equals `HEAD:plugins/vh-adlc`, with head_preserved and index_preserved for every case.
CRITERION: AC-03 No-match, affected-doc and incomplete-check results are distinguishable, with missing/unreadable/malformed coverage and unmatched source scope visible rather than reported as verified accuracy.
VERDICT: met
EVIDENCE: The suite's CLI outcome, gap, symlink, uncovered-document and settings-reader tests are carried forward (1226/0, hash-bound, code unchanged). Observed in this run: preflight.cjs reported source_ready true, and the 16 consumer contracts, which include the legacy exit mapping, exited 0. The published convention, lines 96-99 and 122-148, is carried forward unchanged. The trial 11 cases implement-gap, ship-gap, ship-progress and malformed (exit 2 with known candidates kept visible) are retained files, now shown to run on the current plugin tree.
CRITERION: AC-04 Direct and integrated agent review use the same portable procedure, ground permitted updates in code and local rules, preserve historical/intended contracts and honor read-only and existing review/publication gates.
VERDICT: met
EVIDENCE: Observed in this run: the trial assertions passed for 15 retained Copilot claude-opus-5.5 cases. Trial 9 checks contracts only, and none of its failures fall in that case set. Trial 10 covers manual and fenced; trial 11 covers 12 cases with pass true and no failures. All have read-coverage pass. Each trial's `source_commit:plugins/vh-adlc` tree equals the current plugin tree, and HEAD and index were preserved in every case. Trial 9's failed manual and fenced cases stay as history; trial 10 passes them. The case behaviour I described in R-15 is carried forward. The trials themselves were not re-run. Actual Claude docs-impact model runs, GUI, phone and live screenshots are not claimed.
CRITERION: AC-05 Stackweaver uses the shared checker/procedure with verified legacy-caller compatibility and scoped rollback, retaining site generation, visuals, local policy and unrelated workflows.
VERDICT: met
EVIDENCE: Observed in this run with the installed plugin at `VH_ADLC_PLUGIN_ROOT=…/vhco-tools/vh-adlc/0.9.0`, on Stackweaver 009a1c5:
- Parity: 756 patterns, 794 documents, 0 losses, 0 meaning risks, committed index unchanged.
- Preflight: source_ready true, and the contract command, which runs the 16 contracts including the rollback contract, exited 0.
- The preflight payload digest equals the retained premerge gate digest and the retained postmerge plugin_payload.
- The retained postmerge-summary.json reports pass true and merge_tree_identical_to_reviewed_head true.
The consumer stayed clean with its index hash unchanged. Retention of site generation, visuals and local policy, and the 123-entry inventory, rest on the retained postmerge summary and earlier reviews; I did not execute them separately.
CRITERION: AC-06 Automated Linux/macOS checks, native installed/standalone execution and actual bounded Copilot trials establish the promised behavior at reviewed commits, with capability limits explicit.
VERDICT: met
EVIDENCE: Observed in this run:
- Local Linux: Go tests, vet, lint, tidy, typecheck and actionlint passed. The 1226/0 Bun suite is carried forward, hash-bound.
- Published CI: `gh run view 41979677921` returned headSha 02096e7 and conclusion success. In the packet copy of ci.yml, a `checker-macos` job (`macos-latest`) is required by the final job.
- Marketplace: all four retained runs (codex and claude, fresh and upgrade) passed with the matching payload digest, 13 discovery operations and no authentication copied. Every command exited 0, did not time out and was reaped, and every transcript and stderr SHA256 matched.
- Copilot trials: the 15 cases are bound to the current plugin tree.
compatibility.md:63-93 states the capability limits; it is carried forward unchanged. Limitation: the macOS result comes from the run-level conclusion. The script did not print each job's platform or conclusion (see F-02).
CRITERION: AC-07 Convention/tool publication, real marketplace acceptance and paired current-consumer verification precede migration, and exact revisions, post-merge checks and rollback evidence are retained.
VERDICT: met
EVIDENCE: Observed in this run:
- Published CI at 02096e7: success.
- runtime-release-v0.14.0: pass, with 4 archives (the signature and checksum check).
- installed-published-gated-preflight.json: migration ready with no failures.
- paired-published-4 and spec-delivery-2 validations: pass.
- published-existing-operation-knowledge: pass, not ready cold, ready after warm-up.
- Postmerge: tree and routes pass.
- Marketplace: transcript hashes verified for all four runs.
- Exact revisions in the retained files: consumer 009a1c5, payload digest equal across the premerge gate, postmerge and current installed preflight.
Rollback evidence is the retained rollback contract inside the 16-contract command, which exited 0 in this run. The ordering (publication and marketplace before migration) comes from the retained premerge gate file plus the CI result, not from re-running the migration. The current post-merge preflight printed migration_ready false with "published convention, marketplace and paired-review evidence absent". That is expected for a source-only post-merge preflight, and the script does not assert it.
FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: review procedure; check-delivery-implementation-2.sh
EVIDENCE: I read the packet copy `followup-chunks/checks.sh/00001.txt` (58 lines) before running. Reading the archive file directly would be an outside read, so I did not compare the two byte for byte. The output lines match the packet's steps in order and wording: "Carried-forward…", parity JSON, preflight JSON, summary JSON, "Final delivery checks passed…".
PROPOSAL: Add the executed script's SHA256 to review-targets.json so the packet copy is bound to the executed file.
FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: check-delivery-implementation-2.sh line 48 (gh CI assertion)
EVIDENCE: The script fetches `jobs` but asserts only headSha and the run-level conclusion. AC-06's macOS part therefore depends on the run-level success and on the packet copy of ci.yml (lines 54-55 and 117), which the script does not bind to 02096e7.
PROPOSAL: Assert that a job named `checker-macos` exists in run 41979677921 and concluded success.

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/feature-documents.md) and [template](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/feature-document-template.md): scope, review and acceptance gates; the new convention must preserve feature metadata semantics.
- [Pinned documentation conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/documentation.md), [coding](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/coding.md), [delivery](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/delivery.md) and [prose guide](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/humanize-prose.md): small reusable tooling, local policy and reviewed publication. [Go conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/go.md) were inspected for the existing reader; this draft does not propose Go runtime changes.
- [Existing strict YAML reader](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/plugins/vh-adlc/scripts/settings-file.ts), [ship check](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md) and [feature matcher](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/internal/doc/covers.go): reuse current parsing and review gates without changing feature matching.
- Stackweaver workflow sources inspected locally at `b88aa6d596249f1f7178d3fcdb7a5c9b8221fe2f`: `agents/docs-impact.md`, `scripts/check-doc-coverage.js` and `scripts/build-docs-index.js`, with line ranges cited in Context. Private source is not reproduced here.
