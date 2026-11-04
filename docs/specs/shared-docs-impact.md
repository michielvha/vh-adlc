---
status: draft
status_description: "Local proposal for docs-impact extraction. Implementation waits for independent spec review and owner acceptance; documentation publication is not yet authorized."
issue: null
goal: "Review and update documentation affected by an authorized code change through one harness-agnostic shared procedure while consumers retain their scanners, publishing rules and generated outputs."
covers:
  - plugins/vh-adlc/skills/vh-adlc-docs-impact/
  - plugins/vh-adlc/references/docs-impact.md
  - plugins/vh-adlc/references/docs-impact-settings.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md
  - plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md
  - plugins/vh-adlc/examples/docs-impact/
  - plugins/vh-adlc/scripts/docs-impact/
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

After a code change, identify the documentation it affects, check each candidate against the
implementation and make the permitted updates. Stackweaver keeps its existing coverage scanner,
index generator, visual recipes and publishing rules. The shared operation supplies the review
procedure and a clear result; it does not publish the change.

## Context

The owner selected docs impact on 2026-11-04 after the triage, maintenance and audit extractions.
The parent migration roadmap, `docs/specs/shared-workflow-migration.md:71-78`, defers the broader
D-03 documentation family and requires comparing existing shared behavior before extraction.
This child selects docs impact only. Drift audit, drift resolution and docs-truth remain deferred.

The inspected shared default is `8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1`, with plugin 0.8.0.
`vh-adlc find --slug shared-docs-impact` returned an empty documents list, and the connected GitHub
issue search for docs impact returned no matches. No competing feature or issue was found.
`skills/vh-adlc-ship/SKILL.md:30-43` already requires documentation impact, appropriate verification,
new implementation review for a covered fix, and a passing completion gate. It does not specify
candidate collection, per-document findings or local index/visual handling. The lifecycle table at
`references/lifecycle.md:40-62` has a general documentation route but no docs-impact operation.
Paths in this paragraph are under `plugins/vh-adlc/`.

The inspected Stackweaver default is `b88aa6d596249f1f7178d3fcdb7a5c9b8221fe2f`.
`agents/docs-impact.md:17-55` describes changed-file selection, coverage-index mapping, literal
reference searches, missing-document detection and code-grounded classifications. Lines 57-102
retain local public/internal documentation rules, visual refresh/check, frontmatter/index handling,
a five-part report and a ban on deleting docs or dropping coverage to make a check pass.
`agents/implement.md:57-63` calls this path for maintained UI captures; `agents/ship.md:46-61` and
`.claude/commands/ship.md:6-24` retain the shipping documentation check. There is no separate
`.claude/commands/docs-impact.md` in the inspected source.

A specific integration hazard is visible in `scripts/check-doc-coverage.js:10-12,33-63,93-104`:
exit 1 means candidate docs were found, while a missing index exits 0 silently. Exit 0 therefore
cannot establish that documentation coverage was checked. `scripts/build-docs-index.js:1339-1386`
builds the coverage map, and lines 1474-1485 include it in the normal index generation path.
Those existing tools stay local. This feature makes their preconditions and result interpretation
explicit rather than changing their semantics or replacing them with a generic scanner.

The new shared spec checkout is `/home/m/code/vh-adlc-docs-impact-spec`, on default `main` at the
observed shared commit. Existing feature worktrees and Stackweaver's diverged main are untouched.
Private consumer workflow text, real docs/findings and application source have not been sent to a
new external reviewer for this feature. The first review receives only this public-safe proposal,
public shared source and synthetic examples; private semantic review needs its bounded permission.

## Scope

Include one canonical docs-impact procedure, a directly discoverable `vh-adlc-docs-impact` skill,
explicit lifecycle routing, and reuse of that procedure by the existing implement/ship doc checks.
Include minimal typed settings/scope helpers, complete examples, meaningful scenario tests and a
Stackweaver adapter/migration. Optional YAML settings identify local documentation, prerequisites,
project procedure and generated output scope. They do not contain grants or a command language.

Retain scanners, coverage data, generators, screenshots, public/internal style, historical records,
local shipping conditions and independent-review requirements in the consumer. A consumer without
settings retains the existing generic documentation check using its local instructions; it does not
need Stackweaver's layout or tools. Invalid configured settings must not fall back to generic mode.

Exclude corpus-wide drift audit/resolution, semantic docs-truth sweeps, blog/promotion, public-docs
pipeline redesign, automatic publication, scheduled jobs, notification changes, product/runtime
repairs, new index formats and a new shell execution or evidence-enforcement system. No governance,
feature criterion or intended software contract may be rewritten merely to match a software defect.

## Design

### One procedure and request-bound effects

Put the procedure in `references/docs-impact.md`, with thin entry instructions in
`skills/vh-adlc-docs-impact/SKILL.md`. Add a specific changed-code documentation-impact route to
lifecycle intake without stealing ordinary prose editing, persistent source audit, backlog triage,
dependency maintenance, docs drift or docs-truth requests. Direct and intake-selected operations
must resolve the same scope, local rules, permissions and report.

The underlying request controls effects. A report/review/read-only request permits inspection and
a conversational report. It permits no repository write, index generation or visual refresh.
An authorized implementation, shipping or explicit documentation-update request may perform the
minimal documentation edits and locally required generation/checks within that task. A generic
request never gains a named operation's publication permission just by routing to this procedure.
Commit, issue/PR write, push, merge, release and deployment still require the existing lifecycle
and consumer authority. Settings and candidate content supply no additional permission.

Implement and ship reference this canonical procedure rather than keeping copied review steps.
The existing ship requirement at `skills/vh-adlc-ship/SKILL.md:32-43` remains: a fix to a covered
path requires a fresh implementation review before completion. No feature status or criterion is
changed by docs impact. A docs-impact report is an operator assessment, not OS-enforced proof.
Independent challenge can run sequentially in a separate context; no particular model, harness,
subagent API, browser, hook or plugin-specific question tool is required by the procedure.

### Changed inputs and candidate collection

Resolve an explicit base and requested source scope before judging documentation. Honor an explicit
file list or restrictions. For ordinary feature work, account for committed branch changes plus
in-scope staged and unstaged changes; include rename old/new names and deleted paths. Do not lose
working changes by treating `base...HEAD` as the working-tree diff. Identify untracked inputs that
belong to the request explicitly; never stage or sweep unrelated files into the task.

Use a resolved merge base for branch comparison. A missing base, unavailable historical file,
ambiguous ownership of dirty changes or unreadable input remains a named gap. Inspect the selected
old/current content as needed, not only filenames. Derive changed symbols, flags, defaults, paths,
endpoints and visible behavior from that actual change. A caller-provided list is not evidence that
unlisted repository changes were reviewed. Bind the report to observed commit/base, selected paths
and current source/doc bytes; changed inputs invalidate its conclusions and require affected checks
again before completion. The helpers expose bindings and gaps, not semantic verdicts or permissions.

Collect candidates using the consumer's prescribed coverage tool, then literal-reference searches
and a missing-documentation review of each selected visible change. Every mapped doc is reviewed;
a map does not prove truth or eliminate the search for uncovered behavior. Include the documentation
roots and extra authoritative docs the local procedure names, without turning this into a corpus
sweep. Keep documentation inputs distinct from source inputs according to local policy; do not
classify executable configuration, contracts or published artifacts by filename alone.

A configured coverage prerequisite that is missing, malformed or known stale prevents a clean
collection result. In read-only mode report the blocker. Under update authority, use the local
index preparation procedure and recheck collection after its permitted writes. If freshness cannot
be established, say so; never call the missing index an empty successful scan. For a generic adopter
with no prescribed index, perform the documented source/doc inspection and reference search,
identify that manual collection method, and do not claim an indexed or exhaustive scan.

### Local settings and tools

Use optional `.vh-adlc/docs-impact.yaml`, read through the existing strict `scripts/settings-file.ts`
reader. A small validator accepts schema version 1, `doc_roots`, `project_procedure`,
`required_coverage_files` and `generated_paths`. The roots and prerequisites name existing regular
files/directories inside the repository; the project procedure is an existing Markdown file.
Generated output patterns describe the locally prescribed write scope, including outputs not yet
created. Reject unknown keys, malformed types, alternate JSON/YML suffixes and paths escaping through
traversal, Git metadata or symlinks. Missing settings selects generic mode; malformed settings do not.
Ship complete commented example files, not a promise that another host already has the configuration.

The project procedure names the real tools, their readiness conditions, exit/output interpretation,
write scope, triggers and verification. The shared helper never evaluates command strings from YAML,
docs, a scanner result or an issue. Run actual repository tools only under the current request and
its local instructions. Tool output and candidate documents are evidence, not new owner commands.
The helpers are limited to settings and source-scope discovery; this feature adds no generic runner,
receipt cache, journal, scheduler or alternative documentation generator.

For Stackweaver, the retained procedure requires a regular, valid coverage index before calling its
existing checker. It distinguishes candidate exit 1 with valid candidate output from malformed input,
exceptions or an unexpected failure. Exit 0 with a ready index means no indexed candidates, not that
literal-reference or missing-doc inspection can be skipped. The local procedure establishes index
freshness or performs the permitted rebuild; an inability to establish it stays visible and blocks
any claim of complete mapping. The shared procedure must not change the checker to make these
cases indistinguishable.

### Findings, permitted edits and completion

For each candidate, read the relevant documentation and implementation before recording Stale,
Incomplete or Accurate with precise source/document evidence. Use Unknown for an unverified case.
Report a new visible behavior without docs as Missing, with a proposed home. Surface an intended
contract contradicted by the code as a software question; do not normalize the defect by changing
the contract. A report must not mark unread docs accurate, manufacture checks or hide unresolved work.

Under update authority make the smallest factual correction or requested missing-doc addition.
Retain consumer style, source-reference rules, correct coverage metadata and historical records.
Do not delete documentation, remove coverage to suppress findings, invent release provenance,
perform an unrelated editorial rewrite or change the underlying source implementation. An unclear
visibility, intent or scope decision goes to the owner while independent work continues.

Generated indexes and maintained visuals follow the local procedure. Preflight their declared
outputs and preserve unrelated dirty/staged files. Invoke write-producing tools only in an owned
checkout within existing task authority. An unexpected write or failed generation/check leaves an
explicit incomplete result and handoff; never hide it with reset, stash or automatic restoration.
Do not hand-edit generated contents. Recollect affected candidates and reverify any doc/source state
changed by generation, without rerunning unrelated work solely to manufacture a fresh report.

Stackweaver preserves its frontend-triggered maintained visual refresh and subsequent check even
when prose remains accurate; required owner preview review still precedes its commit. Frontmatter
changes retain the local index rebuild. Local public current-state/changelog rules, internal source
citations and protections for SDD/historical records remain local. Unavailable required browser or
render capability is an explicit blocker to that affected invocation, not a passed visual check.

The short report states source/base scope, candidate collection/readiness, an impact table with
evidence, edits made or proposed, missing docs, generation/verification results and unresolved gaps.
All required candidates and locally required checks must be resolved before calling the documentation
step complete. A report-only invocation may finish its report with gaps, but cannot certify the
feature's documentation complete. Saving or publishing a report needs its own current authority.

### Stackweaver migration and rollback

Before implementation, compare the complete immutable legacy `agents/docs-impact.md` with the shared
procedure plus retained policy, covering every material behavior rather than selected keywords.
Store that private parity map and test fixtures in Stackweaver `tests/agent-docs-impact/`.
Retain project specifics in `agents/docs-impact-project.md` and `.vh-adlc/docs-impact.yaml`; replace
only `agents/docs-impact.md` with a thin shared forwarder. Preserve the existing callers in implement,
ship, CLAUDE.md and the ship command, changing a caller only if needed to route the same behavior.
No separate legacy slash command is invented. Other documentation agents, scanners, generators,
hooks, schedules, real docs, ledgers and product source stay unchanged by migration.

Refresh actual consumer default before the migration branch; preserve the diverged main checkout
and unrelated worktrees. Record exact legacy/shared/consumer commits and bound policy files.
The earlier inspected baseline is evidence, not a permanent acceptance target. Review current
semantic parity and rerun affected contracts when these inputs change. An unrelated default advance
requires comparing the actual relevant objects; it does not imply a software defect or justify
reusing stale policy evidence.

Publish the reviewed shared component first after its source gate. Verify its normal CI and any
normal runtime release, then perform real Codex/Claude marketplace fresh-install/upgrade discovery
and installed helper checks at the exact published payload. Plugin version must be newer than the
0.8.0 baseline; choose the coherent next version after refreshing current main at implementation.
A local catalog or source copy is development evidence only. Obtain paired review of the published
shared and current consumer workflows and pass the installed migration checks before consumer merge.
The installed preflight is a consumer-local check of actual manifests/payload, current migration
paths/settings and the real recorded publication/review results. It may reuse operation-neutral
filesystem inspection; audit- or maintenance-specific receipts cannot satisfy docs-impact adoption.
It confers no action grant and introduces no new shared evidence runtime. Record the adopted
default/route and inspect the installed operation read-only after merge.

The consumer migration records its exact path set and prior blobs, including any modified shared
caller fragments. Rehearse scoped restore/reapply in a synthetic disposable checkout while preserving
newer unrelated edits, index bytes and dirty sentinels. Refuse conflicts or symlink replacements;
never reset/stash a real checkout, undo another workflow or remove a user's history. Actual rollback
requires the applicable current owner permission. Keep the migration tests and evidence available.

### Verification boundary

Meaningful automated checks cover settings/scope handling, candidate prerequisites and all routing
contracts. Actual bounded Copilot Opus 5.5 trials exercise generic and configured behavior with fake
source/docs, including a meaningful stale-doc repair and adversarial cases; a fixture-only text
contract is insufficient proof that a model followed the procedure. Native Codex and Claude CLI
installation/discovery/helper checks run in isolated credential-free profiles, plus the existing
Linux/macOS automated selections. Actual Claude model, GUI/phone entry and live Stackweaver visual
capture behavior remain unclaimed; static parity and synthetic trigger/check dispatch do not prove
those runtime results. A future affected real UI change still owes its existing local visual checks.
Private consumer workflow transfer to a reviewer needs the owner's bounded permission; never
substitute public synthetic evidence for an unperformed private semantic review.

## Acceptance Criteria

- [ ] AC-01: Direct docs-impact requests, lifecycle intake and existing implement/ship doc checks use one portable procedure with the same request-bound effects, preserving generic adopters and unrelated routes.
- [ ] AC-02: Selected committed and working source changes produce a correctly bounded candidate review, with every required mapped candidate and uncovered visible change considered, while missing prerequisites or unverified inputs cannot yield a clean documentation result.
- [ ] AC-03: Candidate judgments and permitted documentation fixes are grounded in the selected code and local rules, preserve intended contracts and historical records, and leave unverified or wrong-system findings visible rather than asserting unsupported accuracy.
- [ ] AC-04: Read-only requests perform no repository writes, and authorized local edits and generated checks preserve unrelated files/index state and require all local gates without gaining commit or remote authority from settings or reports.
- [ ] AC-05: Stackweaver retains every material docs-impact behavior through its shared adapter and local policy, including checker semantics, visual/index triggers, existing callers and unrelated workflows, with a scoped conflict-safe rollback/reapply path.
- [ ] AC-06: Committed source passes the required automated checks and exact-commit independent review, and actual bounded Copilot trials plus native Codex/Claude installation and helper checks establish the declared behavior with explicit capability limits.
- [ ] AC-07: Stackweaver adopts only after actual published-marketplace acceptance and paired current-workflow verification, and the recorded post-merge inspection, revisions and remaining deferrals make that adoption reviewable.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Red-first direct/intake/implement/ship routing tests and a synthetic adopter without settings; assert identical procedure/permissions, no duplicate implementation, no forced Stackweaver tool dependency, no regression to audit/triage/maintenance/blog/plain-doc routes and invalid configured YAML not falling back. |
| AC-02 | Synthetic Git scenarios combine branch commits, staged and unstaged changes, explicit scope, selected/unrelated untracked files, rename/delete, dirty baseline and unreadable old/current paths. Observe exact selected paths and preserved unrelated state. Exercise ready/no-match index, candidate exit 1, missing index with exit 0, malformed index, scanner exceptions and stale index with/without rebuild permission. Each required unknown blocks a clean result; literal-only references and new undocumented behavior cannot disappear behind a zero-candidate map. |
| AC-03 | Actual Copilot reads fake code/docs and returns a grounded impact table with Stale/Incomplete/Accurate/Unknown/Missing cases. A stale-default example must produce the correct minimal doc change under update authority. Include malicious instructions in a doc/scanner output, contradictory intended contract, a historically accurate record and an unreadable doc; observe no invented fact/check, unrelated source repair or false Accurate claim. |
| AC-04 | Run the same synthetic invocation under read-only/report/update request variants. Assert no write/generation for read-only, permitted minimal edits and required local checks for update, preserved staged/index/unrelated dirty sentinels, no implicit commit/push/PR/merge and rejection/handoff for an unexpected generator write or unavailable required check. Changed source/doc bytes require affected revalidation before completion. |
| AC-05 | Build an immutable complete legacy-to-shared/local parity map and independent semantic paired review. Real installed metadata/scope checks bind the current consumer paths. Synthetic visual tooling must refresh on a frontend change even with accurate prose, then check, and preserve owner preview and missing-browser blockers; frontmatter changes invoke local index handling. Restore/reapply the actual migration fragments and refuse working/staged/symlink conflicts. Verify all unselected docs workflows, scanners, generators, schedules, ledgers and public/product files are byte-identical. |
| AC-06 | Run the package and repository commands in AGENTS.md and include the portable new tests in the existing macOS selection. Execute actual synthetic Copilot Opus 5.5 direct/intake/generic/configured/read-only/update/negative trials, retaining original input/return/tool provenance and meaningful red/green doc results. Validate both native CLI isolated installs, discovered operation, strict settings/scope helpers and preserved inputs. Independent implementation review observes current evidence at an exact commit. No Claude-model/GUI/phone/live visual claim is inferred. |
| AC-07 | Source completion verifies the cutover prerequisites and isolated exact-source candidates; delivery then requires normal shared publication/CI/release verification, real marketplace fresh install and upgrade with exact payloads, published/current-consumer paired review, installed preflight and post-merge route inspection. Deny missing/stale/mismatched evidence, old plugin and uncommitted/conflicting migration scope. Record each event at its actual revision without requiring an earlier default to stay globally current. |

## Tasks

None yet; written after spec acceptance. No feature implementation is authorized by this draft.

## Open Questions

None at initial authoring. Reviewer-identified policy decisions remain for the owner.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/feature-documents.md) and [template](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/feature-document-template.md): single feature document, acceptance and review records.
- [Pinned delivery conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/delivery.md), [documentation conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/documentation.md) and [prose guide](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/guides/humanize-prose.md): scope preservation, human-readable reports and reviewed publication.
- [Pinned coding](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/coding.md) and [TypeScript conventions](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/conventions/typescript.md): reuse the existing strict reader and typed boundaries; keep helpers small and preserve the existing runtimes.
- [Pinned shared delivery knowledge](https://github.com/vhco-pro/docs/blob/0e52f51f01b84eda75a976763c42d8ec0a07b544/knowledge/shared-delivery.md): reuse current verified delivery components rather than introducing another release path.
- [Existing shared ship check](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md) and [lifecycle routing](https://github.com/michielvha/vh-adlc/blob/8c2fe7c0b5bfe6a7ea7c6910290b4fa70323dfc1/plugins/vh-adlc/references/lifecycle.md): behavior to reuse rather than duplicate.
- Stackweaver Git objects at `b88aa6d596249f1f7178d3fcdb7a5c9b8221fe2f`, inspected locally: `agents/docs-impact.md` blob `c4be4fe28ec8104ee788bf87b91a07b0ba7bf9f5`; `scripts/check-doc-coverage.js` blob `0ad837ebe69f1ac51875911caa190477dbf26378`; implement/ship callers and generator paths cited above. Private source is retained in Stackweaver, not copied into this public specification.
