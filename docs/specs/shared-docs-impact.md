---
status: draft
status_description: "Claude Code Opus 5.5 R-1 returned no blockers, seven should-fix findings and one nit. Runtime/caller corrections and owner-approved coverage/scope defaults are recorded. Only the public-spec housekeeping question remains open; revised draft awaits renewed review and acceptance."
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

This document is local to `/home/m/code/vh-adlc-docs-impact-spec`. No new checker, convention,
consumer adapter or external publication has been implemented. The owner authorized the bounded
private consumer workflow review and selected Claude Code Opus 5.5 as reviewer on 2026-11-04; no
customer docs, images, application source, reports, ledger, credentials or host configuration belong in it.

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
globstar behavior. Validate bracket syntax and reject malformed patterns.
Reject malformed declarations and unsupported patterns rather than silently omitting them.
Unrelated frontmatter fields remain valid. A `covers` example inside prose or a code block is not
metadata. Neither a match nor an unmatched source path proves that documentation is accurate.

Ordinary documentation coverage and feature-review freshness remain distinct uses. Feature and
historical documents inside the declared roots remain documentation candidates. The ordinary
coverage matcher accepts their existing `?`, bracket and trailing-slash patterns; its `**` matches
are coverage-only even though the existing feature gate ignores `**`. Results identify this
coverage-only interpretation and never establish feature freshness or completion. Never select a
feature document because its own path changed. Do not reinterpret criteria, statuses or historical
claims. Preserve `conventions/feature-documents.md` and the existing feature matcher behavior;
test the two matchers independently.

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
`Documentation impact roots: ["docs/"]`. Its JSON array names the repository-relative documentation
roots, supporting spaces without inventing a project settings format. Implement, ship and intake
read this same declaration and pass those roots to the checker. No declaration keeps the existing
manual path; a malformed, empty, duplicate or conflicting declaration reports a gap. Explicit CLI
roots are sufficient for a one-off direct check without changing the repository's adoption state.

Only an adopted or explicitly requested coverage workflow requires the new convention page. A
repository pinned before that page exists gets an adoption/pin-update handoff for the new operation;
existing generic ship checks do not load that page merely to continue their manual path.

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
The complete migration inventory includes `agents/docs-impact.md`, the new project companion,
`agents/implement.md`, `agents/ship.md`, `.claude/commands/ship.md`, `CLAUDE.md`, the forwarding list
in `AGENTS.md`, the docs-impact reference in `agents/public-docs.md`, the checker entry and references
in `DOCUMENTATION_STANDARDS.md` and `PUBLIC_VISUAL_ASSETS.md`. Preserve or update each route/reference;
all changed fragments enter the parity comparison and rollback blob set. The public-docs workflow
retains its existing logic apart from pointing to the adopted docs-impact route.

Move candidate checking to the shared implementation. Retain `scripts/check-doc-coverage.js` as a
thin compatibility entry if its existing hook/terminal callers need it: preserve arguments/stdin
and human output, translate shared candidates to legacy exit 1 and successful no-match to exit 0.
Keep Stackweaver's existing exclusion of source paths under `docs/` in this local wrapper and
procedure. Empty input or input containing only excluded docs paths remains a no-op exit 0;
that no-op makes no complete-coverage claim. When source paths remain, an incomplete shared result
exits 2, shows its diagnostics and retains any known candidates. Missing/failed payload or binary
also exits 2. Never translate incomplete checking into candidates-only exit 1 or a clean exit 0,
and do not retain a second copy of matching logic. Standalone setup and CI
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
| AC-01 | Review and lint the actual convention change; verify its declared enforcement/examples against the checker and pin the published revision. Existing feature gate/matcher tests remain unchanged and pass. Test a feature document containing `**`, `?`, bracket and trailing-slash entries: ordinary coverage selects candidates with its own declared semantics, marks them coverage-only and excludes self-triggering, while the feature gate retains its existing results. A synthetic second repository uses only Markdown coverage and the shared tool, with no Stackweaver scripts, website generator or generated index. |
| AC-02 | Red-first checker tests cover exact paths, directory prefixes, wildcard/globstar, several roots, current frontmatter, code-fence false positives, rename/delete, committed/staged/unstaged paths, explicit untracked selections and unusual filenames. Diverge both base and feature branches to establish merge-base comparison. In a mixed dirty checkout distinguish default committed selection, explicitly included dirty paths, reported excluded dirty scope and a genuinely unresolved request; unrelated work must not make every run incomplete. Explicitly selected documentation source paths can match other docs. Change metadata after creating a deliberately stale index: the direct scan must use current metadata. Preserve source/index/dirty sentinels. |
| AC-03 | Execute the CLI and inspect real JSON/text/exits for matching, no-match and incomplete results, including mixed known matches plus errors, missing root, no declared coverage, invalid YAML/covers/globs, unreadable data and repository escapes. Also remove the verified binary in an isolated offline environment: the real checker must return incomplete without network or cache writes. Existing settings-reader regressions must pass. No error disappears into an empty success; unmatched source paths remain explicit. |
| AC-04 | Actual Copilot trials review fake code/docs, catch a changed default, make the correct minimal authorized doc edit and expose missing/unknown/wrong-system cases. Exercise direct/intake/implement/ship with a valid adoption/roots declaration, no declaration, a malformed/conflicting declaration and an old pin; standalone explicit roots must work without enabling integrated adoption. Also exercise manual legacy fallback, report-only requests and malicious doc/output instructions. Confirm no unintended generator/commit/remote action, and covered doc fixes still require fresh feature review. |
| AC-05 | Compare every material legacy behavior and candidate against current shared/local behavior with independently reviewed parity. Execute the actual legacy CLI wrapper/hook contract from a neutral environment with an explicitly located shared payload; test missing payload, missing verified binary and old arguments/stdin/exits without network or cache writes. Cover every caller/routing/guideline fragment listed in Design. Assert local docs-source exclusion, empty/docs-only no-op exit 0, candidates exit 1 and incomplete exit 2 both with and without known candidates, including the actual advisory hook's response to each. Synthetic local hooks preserve visual refresh/check even for accurate prose, index/preview conditions and missing-browser blockers. Rehearse conflict-safe rollback/reapply and prove unrelated workflows/generators/customer content unchanged. |
| AC-06 | Run repository-required tests/vet/lint and the package checker; include portable new tests in macOS CI. Retain original actual Copilot inputs/returns/red-green doc results and tool provenance. Isolated native Codex/Claude installs discover the operation and execute the installed checker outside an agent session. Independent exact-commit implementation review observes the evidence; no fixture outcome becomes a GUI/live-product claim. |
| AC-07 | Source completion checks the cutover safeguards and exact-source candidates. Delivery then verifies the convention, normal shared CI/release, real marketplace fresh/upgrade payloads, paired review, installed current-consumer preflight and post-merge routing/checker. Reject missing/stale/mismatched evidence, incompatible tool versions and conflicting migration state; record actual observed default revisions rather than demanding an old global default remain current. |

## Tasks

None yet; planned after independent review and owner acceptance. No implementation is authorized by this draft.

## Open Questions

### Q2: Keep machine-specific setup details out of the published spec?

**Recommendation:** A. Use repository-relative paths in the public spec. Keep exact review models,
commits and returned findings in its Review Log; store local checkout paths, launcher setup and
private-packet dispatch details in the local review artifacts. Stackweaver's required project
instructions and migration steps remain in their repositories.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Keep machine details local** | A spec that applies on other hosts, with review results still recorded in Git. | Consult local artifacts for the exact launch environment. |
| **B. Retain the current Context details** | The public spec includes this host's checkout path and dispatch narration. | Those details become stale and do not apply to other users. |

**Why this is yours:** The owner accepted the other five refinements and requested an explanation
of this housekeeping choice. This remains open until clarified; it does not change feature behavior.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-04 | R-1 | spec | `2811de8baa95c8a1e2887b09891badc59b2af6d3` | claude-opus-5-5 | procedural | No blockers; seven should-fix findings and one nit. |

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

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/feature-documents.md) and [template](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/feature-document-template.md): scope, review and acceptance gates; the new convention must preserve feature metadata semantics.
- [Pinned documentation conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/documentation.md), [coding](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/coding.md), [delivery](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/delivery.md) and [prose guide](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/humanize-prose.md): small reusable tooling, local policy and reviewed publication. [Go conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/go.md) were inspected for the existing reader; this draft does not propose Go runtime changes.
- [Existing strict YAML reader](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/plugins/vh-adlc/scripts/settings-file.ts), [ship check](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md) and [feature matcher](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/internal/doc/covers.go): reuse current parsing and review gates without changing feature matching.
- Stackweaver workflow sources inspected locally at `b88aa6d596249f1f7178d3fcdb7a5c9b8221fe2f`: `agents/docs-impact.md`, `scripts/check-doc-coverage.js` and `scripts/build-docs-index.js`, with line ranges cited in Context. Private source is not reproduced here.
