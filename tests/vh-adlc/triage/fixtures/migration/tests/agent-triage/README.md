# Shared triage migration

This branch is `feat/shared-triage-migration`. The accepted feature and evidence record is
`docs/specs/shared-triage.md` in vh-adlc. This is a local migration candidate; publishing/installing
vh-adlc comes first, then publishing and merging this Stackweaver adapter under separate approval.
Main retains its legacy entry until that ordered adoption. Missing required proof blocks readiness.

Baseline: `129581f6dbe4df71200af8f67d7bc017d35e89ad` in `michielvha/stackweaver`.
The shared candidate at adapter construction is `401998f` in `michielvha/vh-adlc` (plugin 0.4.0).
The combined feature evidence records the final full component and adapter commits; installation
must match that reviewed pair, not merely the package's version number. Changing either side
invalidates dependent parity/native evidence and requires renewed verification and review.

Only `.vh-adlc/triage.json`, `AGENTS.md`, `.claude/commands/triage.md`, `agents/issue-triage.md`
and `tests/agent-triage/` are migration paths. Other agent prompts, docs workflows, hooks, scripts,
plans, product source, credentials and runtime resources remain outside this change.

## Retained behavior and intentional differences

Plan frontmatter remains the roadmap, with `Public Go Live` first, then high/medium/low priority,
verified readiness and prerequisites. `distribution/` remains a mirror. Protected #332 and #334,
configured bot identities, semantic indexes and other-owned work stay outside normal actions.
The local `workstreams` rules name the audit ledger, TFE plan root and RBAC master plan. These
files remain in Stackweaver; the shared plugin contains only the generic parser. A missing, changed
or uncommitted declared ownership source blocks a run. Bare issue references in a configured
reference file are deliberately assigned to its named owner.

The compatibility command retains `model: fable`; other harnesses use the shared operation without
that local model requirement. No report commits, tracker actions or implementation start implicitly.

The frozen legacy prompts and provenance live in vh-adlc's
`tests/vh-adlc/triage/fixtures/legacy/`. Record these differences in the parity result:

| ID | Intended change |
| --- | --- |
| all-writes-approved | Present the report and exact batch before every GitHub write, including comments and existing labels. |
| unbounded-pagination | Read every required page, including comments, instead of the old 200/300/100 limits. |
| incomplete-blocks-all-closures | Any incomplete required collection or verification prevents every executable closure in that report. |
| current-index-request | A historical owner comment is a lead. A current explicit owner request is needed before an index checklist/closure proposal, followed by exact batch approval. |
| all-modes-save-report | Next and close now save reports as well as returning their findings. |
| report-commit-opt-in | Save reports uncommitted unless the owner asks for a commit; approved plan patches retain their separately shown local commit. |
| scope-safe-history | Compare same-scope complete inventories, otherwise only common observed IDs; missing scope never implies removed issues. |

A fixture or prompt/manifest check is not native parity proof. The vh-adlc evidence must contain
actual legacy/shared results, native installation/payload checks, the bounded live read-only trial
and its enforced-boundary probes, and the disposable rollback/reapplication result. GUI trials
remain required there; an unavailable host is recorded as unverified, never inferred from CLI proof.

## Managed controller

The shared package supplies `scripts/triage/controller.ts`, with optional Codex and Claude CLI
adapters around one protected analysis protocol. The trusted operator starts it outside analysis
and keeps its approval input. Cached reports or receipts cannot grant execution authority. The
shared boundary guide owns setup and protocol details; verify the actual controller capability
report on the intended host before claiming closure support.

For the Claude compatibility entry, select the Claude adapter and `--command triage`; the source
command still declares `model: fable`. Other harnesses invoke the shared operation through their
supported adapter. Linux/Bubblewrap is the first managed runtime; unconfigured hosts can report
but must leave closure execution unavailable. Do not silently route to ordinary helper execution.

This is an enforcement prerequisite, not a removal of approved triage closures. Preserve exact
batch approval, source/account checks, protected work, local gates and journals. Provider quota
failures and missing GUI proof remain visible blockers; a successful install is not acceptance.
All Stackweaver settings, ownership ledgers and documentation rules remain in this repository.

## Local checks

Run `bun test tests/agent-triage` here. To verify the exact paired snapshot, set
`STACKWEAVER_TRIAGE_CHECKOUT` to this checkout while running vh-adlc's
`bun test tests/vh-adlc/triage/migration.test.ts`. That test verifies HEAD, relevant clean state,
allowed paths and byte hashes against the exported adapter commit.

Run `bun tests/agent-triage/rehearse.ts` from a committed migration checkout. It creates its own
throwaway clone and exercises rollback/reapplication with unrelated staged and untracked work.
It never modifies this checkout, another worktree, a service, a slot or a credential. It retains
its output directory so the evidence can inspect it. Normal report placement/index behavior is
also exercised in that disposable clone. Do not run product integration tests against slot 0 for
this prompt/settings migration.

Rollback/reapplication compare the index bytes. The report/index check compares every staged path,
mode and blob: the fixture's own `git diff` may refresh the index stat cache while preserving all
staged content. This distinction does not excuse changed staged entries or runtime paths.

## Rollback and reapplication

Rollback changes only the runtime triage entry points and settings. Keep this handoff and tests
available. Before changing a real checkout, inspect Git state and verify that the four paths still
match the reviewed adapter. Stop on any concurrent change to those paths; never discard it.
Require explicit authority to apply rollback outside the disposable rehearsal.

Restore `AGENTS.md`, `agents/issue-triage.md` and `.claude/commands/triage.md` from the baseline
with `git restore --source=<baseline> --worktree -- <those three explicit paths>`. The settings file
did not exist at the baseline: remove only `.vh-adlc/triage.json` after checking its exact reviewed
hash and confirming it has no unrelated edits. Leave every index entry untouched. This restores the
working legacy routing without changing any other agent, plan, commit, tracker action or runtime.
It does not undo GitHub writes made in an earlier approved triage run.

Reapply with `git restore --source=<reviewed-adapter-commit> --worktree --` and the four explicit
runtime paths. Verify their hashes against that commit and verify unrelated staging/work files are
unchanged. The rehearsal implements these exact path-limited steps; inspect its source before use.
A publication-time revert is a separately reviewed commit of those paths, not a history rewrite.

## Ordered adoption handoff

1. Finish and independently review both committed repositories; record the exact component/adapter
   pair and all observed proof in vh-adlc. Do not treat this branch's presence as adoption.
2. With publication approval, publish and merge vh-adlc first so the marketplace actually serves
   the verified operation. Install that exact published revision and verify its canonical payload.
3. Obtain the separate Stackweaver publication/merge authority, publish this reviewed branch and
   adopt it only after its shared dependency is available. Recheck changed commits and local state.
4. Invoke triage through both entry points, confirm settings and installed pair, and retain the
   external read-only report/trace and rollback result. No dependency/audit/docs extraction follows
   implicitly; D-01 through D-05 remain recorded in the shared feature's deferred register.
