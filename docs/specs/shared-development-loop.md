---
status: draft
status_description: "Draft with all ten owner answers folded in; waiting for an independent spec review."
issue: https://github.com/michielvha/vh-adlc/issues/78
goal: "Stackweaver runs its spec, review, tasks, implement, ship and investigate work through installed vh-adlc operations, with every native capability kept and models chosen per role by repository settings."
covers:
  - plugins/vh-adlc/skills/vh-adlc-spec/
  - plugins/vh-adlc/skills/vh-adlc-tasks/
  - plugins/vh-adlc/skills/vh-adlc-implement/
  - plugins/vh-adlc/skills/vh-adlc-review/
  - plugins/vh-adlc/skills/vh-adlc-ship/
  - plugins/vh-adlc/skills/vh-adlc-investigate/
  - plugins/vh-adlc/skills/vh-adlc-resume/
  - plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md
  - plugins/vh-adlc/references/review-protocol.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/scripts/settings-file.ts
  - internal/doc/
  - internal/settings/
  - schema/vh-adlc.schema.json
  - tests/vh-adlc/
---

# Plan: Shared development loop with Stackweaver adoption

Moves Stackweaver's native spec-driven loop onto the shared vh-adlc operations. The shared side gains the
hooks Stackweaver needs, including per-role model routing with a reviewer from another model family, and
Stackweaver keeps its project rules in settings and one project procedure.

## Context

### Owner summary

Stackweaver still runs its own spec-driven loop: `agents/spec.md`, `tasks.md`, `implement.md`,
`ship.md`, `investigate.md` and `reviewer.md`. Triage, maintenance, audit, docs impact and SEO already
run through vh-adlc. This feature moves the rest, roadmap row D-05, without losing anything the native
loop does today, and fixes the places where vh-adlc cannot yet carry a Stackweaver rule.

A comparison of about 120 behaviors found that vh-adlc is already stronger in several places: an
independent implementation review with one record per criterion, binary-checked gates, a pushed claim
commit, an explicit handoff between sessions, and a resume operation. It also found 21 conflicts and 9
missing hooks. The main ones: the SDD skills read no repository settings, so Stackweaver's review lenses
and conditional verification can only reach them as loose prose. The reviewer cannot run on another
harness. Lint rejects `**` in `covers`. The claim step would move Stackweaver's live main checkout onto
a feature branch. Feature PRs may not be squashed or amended. And nothing handles manual-only CI or a
post-merge satellite watch.

The model decision is already made. Stackweaver commit `7861b9dc` moved every command to Opus and sends
independent reviews to `gpt-6.1-sol` through the Copilot CLI. vh-adlc already keeps models out of agent
files, but its review protocol only knows an in-host subagent or a manual handoff. This feature adds
model routing per role, declared in settings, plus an external command route, so a Claude session can
get a read-only GPT review that is stored and checked like any other.

The owner settled three questions on 2026-11-13. Model routes live in a committed
`.vh-adlc/loop.yaml`, with only the reviewer CLI's binary path overridable per user. A feature is
claimed from the session's own host worktree when it sits at the tip of the default branch, as
Stackweaver sessions work today, and vh-adlc gains that as a shared behavior because Claude Code and
Codex both start work in worktrees they create. Feature PRs land by merge commit with additive
follow-ups; squash and amend stay for non-feature and bot PRs. The external review route is generic:
any CLI described by a command template. Stackweaver keeps two standing behaviors: `/implement` hands
straight to ship under a written grant, and small non-feature fixes keep shipping through Stackweaver's
own `/ship`. The 58 non-terminal specs move to the shared format and finished ones stay as history.
Stackweaver adopts vh-adlc's acceptance, completion and issue rules and its document style. A consumer
may declare extra paths that still skip CI for a feature, which needs a small revision to the central
delivery convention in vhco-pro/docs.

Shared changes ship first in a vh-adlc release. Stackweaver then adopts them through thin command
adapters, a `.vh-adlc/loop.yaml` settings file and one project procedure, behind a parity map that fails
if any legacy rule has no new home. Rollback is rehearsed on a disposable checkout. Active Stackweaver
specs move to the shared format.

Nothing here is reviewed yet and no question is open; the next step is an independent spec review on
the GPT route. Accepting this
document authorizes implementation of the accepted scope on a feature branch. Publishing the vh-adlc
release, merging either repository and retiring the native agents each still need their own approval.

### Background

Roadmap. `docs/specs/shared-workflow-migration.md:78` records D-05 as separate future scope that keeps
plan formats, slot isolation, integration and browser requirements and shipping rules local until a
child spec covers them. This is that child. Earlier children followed the same shape:
`shared-audit.md` and `shared-docs-impact.md`, each with Stackweaver adoption.

Native loop. Stackweaver's `AGENTS.md` routes the loop through `agents/spec.md`, `agents/tasks.md`,
`agents/implement.md` and `agents/ship.md` (Stackweaver `AGENTS.md:29-31` at `7861b9dc`). The installed
plugin already ships `vh-adlc-spec`, `-tasks`, `-implement`, `-review`, `-ship`, `-investigate` and
`-resume` with a `vh-adlc-reviewer` agent (`plugins/vh-adlc/skills/` at `a7bfca99`), and Stackweaver
uses none of them.

Models. Stackweaver `CLAUDE.md:202` at `7861b9dc` says every command runs on Opus, Fable is not used,
and independent reviews go to `copilot --model gpt-6.1-sol` in a read-only, non-interactive call.
`agents/spec.md:65` runs the adversarial review lens that way. All fourteen command files pin
`model: opus` (`grep -n "^model:" .claude/commands/*.md`). In vh-adlc, `references/review-protocol.md:26`
says agent files name no model, and lines 14-16 leave only a manual handoff when the host has no
independent route. Copilot CLI 1.0.109 lists `gpt-6.1-sol` among its models
(`copilot help config`). Stackweaver has used this route before: on 2026-10-29 `gpt-6-astra` ran
through Copilot CLI with only `view` and `glob` tools available, for one premium request
(`docs/internal/analysis/evidence/multi-tool/2026-10-29-copilot-gpt-6-astra-full-review.json`).

Settings hooks. Triage, maintenance and audit read `.vh-adlc/*.yaml` with a `project_procedure`
companion. A grep of the SDD skills for `settings`, `project_procedure` and `.vh-adlc/` finds nothing:
they read only `AGENTS.md` markers and prose.

Format. `vh-adlc lint` on Stackweaver's `docs/internal/plans/infrastructure/api/utc-timestamps-plan.md`
returns `malformed` with `review-log-header`, `test-plan-header` and one `covers-pattern-unsupported`
per `**` entry (binary 0.9.0; the same check is `internal/doc/lint.go:69` at `a7bfca99`). Stackweaver
writes criteria as `AC1`. The rules block matches only `AC-\d{2,}`, so those lines are invisible to the
binary, and a scratch repository showed `test_plan_complete` passing with a criterion that had no Test
Plan row. `vh-adlc find --slug` does locate Stackweaver specs in category subfolders. 55 plan documents
under `docs/internal/plans/` carry a non-terminal status and 48 have a Review Log
(`git grep -l` at `7861b9dc`).

Worktrees. `skills/vh-adlc-implement/SKILL.md:56-57,69-72` claims from a worktree holding the default
branch, then runs `git switch -c` in it, and otherwise stops without creating a worktree. Stackweaver's
only such worktree is the main checkout that the dev containers bind-mount, and its sessions normally
work in host-created worktrees (Stackweaver `CLAUDE.md:127-137`).

History. The pinned delivery convention says feature PRs never squash
(`conventions/delivery.md:78-79`), so reviewed commits stay reachable. Stackweaver amends,
force-pushes and squash-merges (Stackweaver `CLAUDE.md:169,172,279`).

## Scope

In scope:

- Shared vh-adlc changes: per-role model routing in settings, an external command route for reviews,
  claiming a feature from a host worktree at the default branch tip, a settings file and project
  procedure read by every SDD operation, repository instructions and
  declared lenses in reviews, conditional verification rungs, a declared CI trigger policy, a declared
  post-merge watch, consumer-declared skip-CI paths, `**` support in `covers`, and investigation
  defaults (always write the document, search for duplicates, verdict vocabulary).
- A vhco-pro/docs revision of `conventions/delivery.md` that lets a consumer declare extra skip-eligible
  paths, and the plugin pin bump that adopts it.
- Stackweaver adoption: thin adapters for `/spec`, `/tasks`, `/implement`, `/ship` (feature path),
  `/investigate` and spec review; `.vh-adlc/loop.yaml`; one project procedure; a committed parity map
  with contract tests; migration of the 58 non-terminal specs; rollback rehearsal.
- Roadmap row D-05 in `shared-workflow-migration.md`, pointing here.

Out of scope:

- Choosing the models. Stackweaver's choice is recorded in its own commit `7861b9dc`; this feature
  makes it configurable and enforced, and changes no other repository's defaults.
- TFE compatibility and provider-fork workflows (roadmap D-04), docs drift (vh-adlc #59), docs truth.
- Stackweaver product code, its dev-stack scripts (`agent-slot.sh`, `worktree-dev.sh`,
  `watch-merge.sh`) and its CI workflows. These are called, never changed.
- Converting terminal Stackweaver specs (complete, abandoned, superseded, archived).
- A shared non-feature delivery. Stackweaver's own `/ship` keeps that path.
- Codex and Copilot as authoring hosts for Stackweaver. The external route covers reviews only.

## Design

### Comparison baseline

Two read-only comparison passes at Stackweaver `7861b9dc` and vh-adlc `a7bfca99` (plugin 0.16.1,
binary lock 0.19.0) mapped each native behavior to its vh-adlc counterpart. The authoring, review and
investigation slice has 62 rows; the tasks, implement, ship and resume slice has 58. The full row tables
are kept in Stackweaver as an internal analysis document. Task T1 turns them into a committed parity
map at the then-current heads, so the counts below are a starting point, not the final inventory.

| Verdict | Authoring and review | Build and ship |
| --- | --- | --- |
| same | 17 | 11 |
| vh-adlc better | 14 | 20 |
| keep local in Stackweaver | 13 | 14 |
| missing shared hook | 6 | 3 |
| conflict | 12 | 9 |

### Model routing per role

A new settings file, `.vh-adlc/loop.yaml`, read through the existing settings reader, declares a route
for each role:

| Role | Used by |
| --- | --- |
| `author` | spec authoring, tasks, investigate |
| `implementer` | implement, ship |
| `spec_reviewer` | spec review |
| `implementation_reviewer` | implementation review |

A route is either `host` with an optional model name, which the operation passes to the host the way
`review-protocol.md` passes a requested model today, or `command`, described below. Agent and skill
files still name no model. Where a host picks the session model outside the plugin (Claude Code command
frontmatter), the adapter keeps that field and a contract test checks it against the settings. A
repository without the file keeps today's behavior exactly: inherit the host default, compare a named
model with the reported `MODEL:` line.

### External command route

A `command` route runs the reviewer outside the host, for example:

```yaml
spec_reviewer:
  route: command
  model: gpt-6.1-sol
  argv: [/home/linuxbrew/.linuxbrew/bin/copilot, --model, "{model}", --available-tools, "view,glob", -p, "{prompt_file}"]
```

The operation writes the canonical reviewer instructions, document path, exact commit, kind, docs
revision, binary path and plugin pin into a prompt file, runs the command from the owning worktree with
no worktree creation, and reads the reply. The route is generic: `argv` is any command with
`{model}` and `{prompt_file}` placeholders, so Copilot, Codex or another CLI needs only settings. A
command that is not given a read-only tool restriction is recorded with `procedural` isolation. The reply must open with `MODEL:`, then carry records in the
standard's format. The same requested-model rule applies: a missing, mismatched or `unknown` model, a
non-zero exit or a timeout leaves the review pending, writes no Review Log row, and puts the raw reply
and the command's exit status in the handoff. Records are stored byte for byte and pass
`vh-adlc review check`. Isolation is recorded as `structural` only when the command's tool allow-list
is one the host is verified to enforce, otherwise `procedural`. The binary path in `argv` is
machine-specific, so a per-user file outside the repository may override `argv[0]` and nothing else;
the model, the arguments and the role mapping always come from the committed file.

### Claiming from a host worktree

Implement may make the claim commit in any worktree whose `HEAD` equals the freshly fetched default
branch tip and whose tracked files are clean, whether `HEAD` is detached or on a branch with another
name. It pushes the claim with `git push origin HEAD:<default branch>`, creates the feature branch at the
claim commit with `git switch -c`, and that worktree becomes the owning worktree. Any staged or
unstaged change that does not belong to the claim stops the step, as today. The plugin still never
creates, moves, prunes or resets a worktree. When the push is rejected because the default branch moved,
the step stops with the local commit kept, as the current procedure already says; a retry starts from a
worktree at the new tip. Today's path, a worktree that has the default branch checked out, keeps working.

For Stackweaver this is the normal start: a session's host worktree is created from a fresh `main`
(Stackweaver `.claude/settings.json:9` sets `worktree.baseRef: "fresh"`), so the live main checkout is
never switched.

### Feature PR history

Feature PRs land by merge commit or fast-forward, as the delivery convention requires. Follow-ups on a
feature branch are new commits, and drift from the default branch is merged in, never rebased, so every
commit a Review Log row names stays reachable. Stackweaver's project procedure and `CLAUDE.md` change
to match for features: the amend, force-push and rebase-onto-`origin/main` guidance (Stackweaver
`CLAUDE.md:169,172`) and the squash-message rule (`CLAUDE.md:279`) stay in force for non-feature
changes and bot dependency PRs only.

### Project procedure and review lenses

`loop.yaml` also names a `project_procedure` file and a list of `instruction_files` (for Stackweaver,
`CLAUDE.md` and `AGENTS.md`). Every SDD operation reads both before acting, as triage, maintenance and
audit already do. The reviewer receives the instruction files as an explicit lens: a spec that
contradicts them gets a finding, and a needed change to them becomes an Open Question. Declared
`lenses` add named checks with a severity, which is how Stackweaver keeps the API, UI and provider
triad, blocking satellite naming for a new component, `go-spec-reviewer` on Go-facing specs, and
checking every execution path. The procedure stays local; the hook is shared.

### Verification rungs, CI policy and post-merge watch

`loop.yaml` may declare verification rungs, each with a command or written procedure and a condition: a
changed-path glob, a criterion kind, or always. Implement and ship run every rung whose condition holds
and report each as passed, failed or not run with a reason. Stackweaver declares `make verify`,
`make test-integration` for `backend/` and `core/`, the kind harness for E2E specs, a browser pass with
the summary table for UX paths, and both engines for engine-sensitive paths. Without rungs, the current
behavior stays: read commands from `AGENTS.md`, ask if none.

A declared `ci_trigger: manual` makes ship report CI as not triggered by policy instead of waiting for
a run or suggesting a dispatch. A declared `post_merge_watch` command (Stackweaver:
`scripts/release/watch-merge.sh <merge-sha>`) must exit 0 before the feature is reported delivered,
matching the delivery convention's rule that a feature is delivered once every release path has
published.

### Skip-CI paths

A consumer may declare `skip_ci_paths` in `loop.yaml`. A feature delivery then carries the skip marker
when its commit, outgoing push range and PR diff change only feature documents, Markdown onboarding
files or declared paths; any other change still runs normal CI. Stackweaver declares its tooling paths
(`agents/`, `.claude/`, `.githooks/`, dev-only `scripts/`, `CLAUDE.md`), and never code, `deploy/`,
workflows, dependency manifests or public `docs/`. The pinned delivery convention forbids this today
(`conventions/delivery.md:90-94`), so the shared change starts with a revision of that page in
vhco-pro/docs and a plugin pin bump.

### Investigation defaults

A `findings_document: always` setting makes invoking investigate the request to write the document,
in the consumer's declared analysis home. Investigate also searches existing analysis documents and
open issues for duplicates before writing, states that conclusions come from primary sources read in
the run, and ends with one verdict: act now, track with named flip conditions, or reject. Issue filing
keeps vh-adlc's authority rule: only on request or as part of acceptance.

### `covers` globs

Feature-document lint accepts `**` with the meaning the docs-impact matcher already gives it, so one
`covers` vocabulary serves both. The match code is shared, not copied, and existing documents without
`**` keep their results.

### Stackweaver adoption

Stackweaver's adapters forward each command to the installed operation with `loop.yaml`, keep the
`model:` frontmatter that settings require, and keep the arguments users type today. A new
`agents/loop-project.md` holds the local rules: worktree slots, the verification ladder, the
direct-to-main policy and `[skip ci]` rules for non-feature work, satellite rules, `lessons.md`
recording, the docs index rebuild and plan categories under `docs/internal/plans/`. The same file
holds the standing grant that lets implement hand straight to ship, and keeps Stackweaver's `/ship`
for non-feature changes. Stackweaver specs adopt the shared document style (an owner summary under
Context, `issue: null`, full issue URLs, `AC-01` IDs, `file:line` citations in Design), while its other
internal docs keep the symbol-name rule. `/spec review` no longer moves a spec to `planned` by itself,
and `/spec` and `/investigate` file issues only on request or with acceptance. A committed parity
map, shaped like `tests/agent-audit/parity.json`, lists each legacy behavior with its legacy source
excerpt hash, its new home and a contract test; a legacy rule with no row fails the test. The 58 specs
under `docs/internal/plans/` with a non-terminal status (draft, planned, in-progress, blocked or parked)
move to the shared format in one migration; terminal specs stay as written. The native agent files are retired only after the
published plugin is installed from the marketplace and exercised, and a rollback to them is rehearsed.

### Conflicts and their homes

| Conflict | Resolution |
| --- | --- |
| Worktree model | Claim from a host worktree, shared (owner, Q3) |
| Squash, amend and force-push on feature PRs | Merge commits for features (owner, Q4) |
| `/implement` pushes and opens the PR | Standing grant in the project procedure (owner, Q5) |
| Non-feature and direct-to-main shipping | Stays in Stackweaver's `/ship` (owner, Q6) |
| `AC1`, Test Plan and Review Log formats in existing specs | Convert non-terminal specs (owner, Q7) |
| Status flip without owner acceptance; `complete` versus delivered | vh-adlc rules, delivered after the watch (owner, Q8) |
| Issue filing during `/spec` and `/investigate` | vh-adlc authority rule (owner, Q8) |
| Owner summary placement, `issue: ""`, bare `#N`, line numbers in Design | vh-adlc style for specs (owner, Q9) |
| `[skip ci]` for features that touch only `agents/` or `.claude/` | Consumer-declared skip paths (owner, Q10) |
| `covers` with `**` | Fixed in vh-adlc (AC-06) |
| Investigation writes a document only on request | Setting (AC-07) |

## Acceptance Criteria

- [ ] AC-01: A repository's `.vh-adlc/loop.yaml` names a route for each loop role, every SDD operation dispatches according to it, no vh-adlc agent or skill file names a model, and a repository without the file behaves as it does at `a7bfca99`.
- [ ] AC-02: From a Claude Code session, a spec review and an implementation review run through a declared command route on `gpt-6.1-sol` against an exact commit with read-only tools; a matching reply is stored verbatim and passes `review check`, and a mismatched model, missing `MODEL:` line, non-zero exit or timeout leaves the review pending with no Review Log row.
- [ ] AC-03: Every SDD operation reads the declared project procedure and instruction files, and a spec review flags a document that contradicts a declared instruction file or lens.
- [ ] AC-04: Implement and ship run each declared verification rung whose condition holds and report every rung as passed, failed or not run with a reason; with no rungs declared they keep the current command lookup.
- [ ] AC-05: With `ci_trigger: manual`, ship reports CI as not triggered by policy and dispatches nothing; with a `post_merge_watch` declared, a feature is reported delivered only after that command exits 0.
- [ ] AC-06: Feature-document lint accepts `covers` entries containing `**` and matches them as the docs-impact matcher does.
- [ ] AC-07: With `findings_document: always`, investigate writes its findings document, reports any duplicate analysis document or open issue it found, and ends with one of the three verdicts.
- [ ] AC-08: Stackweaver's `/spec`, `/spec review`, `/tasks`, `/implement`, `/ship` for features and `/investigate` run the installed vh-adlc operations with Stackweaver's settings, and every row of the committed parity map passes its contract test.
- [ ] AC-09: Every Stackweaver spec under `docs/internal/plans/` with a non-terminal status passes `vh-adlc lint`, and its gate results agree with a manual reading of the document.
- [ ] AC-10: Stackweaver's local behaviors stay available with unchanged invocation: worktree slots, direct-to-main non-feature shipping through its own `/ship`, `[skip ci]` rules, `watch-merge.sh`, the triad and satellite lenses, the browser-pass summary table, and `/implement` handing straight to ship.
- [ ] AC-11: A disposable Stackweaver checkout rolls back to the native loop and reapplies the adoption, with the docs index and unrelated workflow files byte-identical afterwards.
- [ ] AC-12: The shared changes are installed from the published marketplace in an isolated profile and exercised through their entry points before Stackweaver's native agent files are retired.
- [ ] AC-13: Implement claims a planned feature from a clean worktree whose `HEAD` is the fetched default branch tip, detached or on another branch name, pushes the claim to the default branch and continues in that worktree on the feature branch; with stray changes or a stale tip it stops and changes nothing.
- [ ] AC-14: A Stackweaver feature taken through the adopted loop and merged keeps every commit its Review Log names reachable from `main`, and its completion gate passes there.
- [ ] AC-15: With `skip_ci_paths` declared, a feature delivery whose commit, push range and PR diff touch only feature documents, Markdown onboarding files or declared paths carries the skip marker, and any other change in the delivery leaves it off.
- [ ] AC-16: In Stackweaver, `/spec review` never moves a spec to `planned` without an owner acceptance row, and `/spec` and `/investigate` create no issue without an explicit request or accepted scope.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc` cases for each role and route kind, a no-file case compared with `a7bfca99` behavior, and a grep test that fails on a model name in any agent or skill file. |
| AC-02 | A fixture repository with a stub command that returns a matching reply, a wrong model, no `MODEL:` line, exit 1 and a hang; then one real Copilot CLI `gpt-6.1-sol` spec review and one implementation review on a disposable feature, with transcripts and the stored records kept as evidence. |
| AC-03 | Fixture specs that break a declared instruction and a declared lens; the reviewer must return a finding for each and none for a compliant control. |
| AC-04 | Fixture changes that match some rungs and not others; the report must list every rung with the right state, and a no-rung fixture must keep the current lookup. |
| AC-05 | Ship fixtures with `ci_trigger: manual` (no dispatch call made, state reported) and a watch stub that exits 1 then 0 (delivered only after 0). |
| AC-06 | Go tests in `internal/doc` for `**` at start, middle and end, compared with the docs-impact matcher on the same inputs, plus the existing lint suite unchanged. |
| AC-07 | Investigate fixtures with and without a duplicate analysis document and a duplicate open issue; the run must write the document and name the duplicate and the verdict. |
| AC-08 | Stackweaver parity contract tests, plus one real run of each adapted command on a disposable Stackweaver feature, checking the operation reached and the settings read. |
| AC-09 | `vh-adlc lint` and `vh-adlc gate` over the migration set, and a manual check of five specs chosen at random where the gate result is compared with the document. |
| AC-10 | A scripted check that each listed local behavior's entry point still exists and runs in dry-run or help mode, and a review of `agents/loop-project.md` against the parity map. |
| AC-11 | The rollback and reapply procedure on a disposable checkout, comparing file hashes before and after. |
| AC-12 | Isolated Claude Code profile install from the marketplace, payload digest check, and one spec review through the command route at the published revision. |
| AC-13 | Fixture repositories with a detached worktree at the tip, a worktree on another branch at the tip, one behind the tip, one with a stray change, and a rejected push; only the first two claim, and the others leave the repository unchanged. |
| AC-14 | One disposable Stackweaver feature taken from claim to merge by merge commit, then `vh-adlc fresh` and `vh-adlc gate complete` run on `main`. |
| AC-15 | Ship fixtures whose delivery touches only declared paths, declared paths plus code, and declared paths with an earlier code commit in the push range; only the first carries the marker. |
| AC-16 | Stackweaver parity contract tests for the acceptance and issue rules, plus a disposable spec review run that ends with the spec still `draft` until an acceptance row exists. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The owner answered Q1 to Q10 on 2026-11-13; the answers are folded into Owner summary, Scope and
Design.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-13 | R-1 | spec | `798132cf54857c07ee04f82f6595ad9b9acd65a8` | gpt-6.1-sol | procedural | Four blocking findings: no review route that can execute checks, post-merge complete gate, active spec migration, skipped delivery versus the merge watch. |

### R-1

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design / External command route; AC-02, AC-08 and AC-14
EVIDENCE: The example reviewer route allows only "view,glob", and AC-02 requires implementation review through that read-only route. The pinned conventions/feature-documents.md defines "met" as executed evidence observed in the review and says a check whose execution was not observed is "not verified". plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md also forbids treating an unobserved result as evidence. A file-only reviewer cannot independently execute the tests, gates or runtime scenarios needed to complete a Stackweaver feature.
PROPOSAL: Define a completion-capable implementation-review route that can observe execution of the required checks while preserving repository state. Keep file-only review explicitly diagnostic, and test that the adopted route can produce legitimate met verdicts and pass the completion gate.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: AC-14 and its Test Plan row
EVIDENCE: AC-14 requires the completion gate to pass on main after merge. The pinned feature-document standard requires retaining branch until closure and includes on_feature_branch_if_set in the complete gate. internal/gate/gate.go implements that condition by comparing git branch --show-current with the document's branch, so a merged feature retaining branch: feat/... fails on main. I cannot run git or the vh-adlc binary; this contradiction is established by reading the rules and evaluator.
PROPOSAL: Replace the post-merge complete-gate requirement with an explicit validation of main's reviewed baseline, evidence and commit reachability while retaining the pre-merge completion gate in the owning worktree. Alternatively, specify and obtain acceptance for the necessary lifecycle-rule change.

FINDING: F-03
KIND: judgement
SEVERITY: blocking
WHERE: Design / Stackweaver adoption; AC-09
EVIDENCE: The migration converts every non-terminal spec but defines no lifecycle transition or ownership procedure for existing planned and in-progress work. Stackweaver's docs/internal/plans/features/automation/opentofu-ansible-handoff.md is planned under legacy review rules, while features/terraform/terraform-provider-stackweaver-plan.md is in-progress and describes a separate provider-fork workflow. The pinned standard requires normative revisions to move planned or in-progress documents to draft, reset criterion evidence and residuals, obtain a new independent review and owner acceptance, and preserve feature-branch ownership. Header and ID conversion alone cannot supply those prerequisites.
PROPOSAL: Specify migration handling for each existing status, including active-writer handoff, retained history, reset evidence, fresh review and individual owner acceptance before shared execution resumes. Clarify how ongoing domain-extension plans remain usable without bringing their excluded workflows into this migration.

FINDING: F-04
KIND: factual
SEVERITY: blocking
WHERE: Design / Verification rungs, CI policy and post-merge watch; Skip-CI paths; AC-05 and AC-15
EVIDENCE: Stackweaver declares post_merge_watch, and the design requires that command to exit 0 before any feature is reported delivered. The same design authorizes skip markers for tooling-only feature deliveries. Stackweaver scripts/release/watch-merge.sh explicitly excludes skip-directed commits from its path-ignored handling, then waits for a GitVersion Tag push run and exits 1 when none appears. A correctly skipped feature therefore cannot satisfy the unconditional delivery requirement, and the script is expressly out of scope for changes.
PROPOSAL: Define an observable no-publication delivery path for eligible skipped features, with the watcher required only when an affected publication path exists. Add a scenario combining Stackweaver's watch policy with a genuinely skip-eligible feature merge.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design / Claiming from a host worktree; AC-13 Test Plan
EVIDENCE: Design says a rejected claim push stops "with the local commit kept". The AC-13 Test Plan includes a rejected push among cases that "leave the repository unchanged". Keeping the claim commit changes local HEAD and the document's status and branch metadata, exactly as plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md currently specifies.
PROPOSAL: Separate preflight rejection from publication failure: stale tips and stray changes must stop before mutation, while rejected pushes retain an explicitly pending local claim and create no feature branch. Test the retained state and its safe retry or handoff procedure.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter / covers; Design / covers globs; AC-06
EVIDENCE: covers includes internal/doc/ but excludes internal/fresh/ and plugins/vh-adlc/scripts/docs-impact/. internal/fresh/fresh.go uses doc.MatchCovers for review staleness and dirty-tree checks; plugins/vh-adlc/scripts/docs-impact/matching.ts contains the matcher the design requires sharing. Changes to either directly affect this feature. The pinned standard requires covers to include every path whose change can affect the feature, and the current freshness implementation ignores uncovered paths.
PROPOSAL: Extend covers to the matcher, freshness and other directly dependent implementation paths identified by the design. Add proof that double-star coverage detects both committed drift and relevant dirty files, not merely that lint accepts the syntax.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design / External command route
EVIDENCE: The example substitutes "{prompt_file}" directly into Copilot's -p argument, but only defines that placeholder as a file path. Stackweaver CLAUDE.md and agents/spec.md demonstrate -p with reviewer prompt text, not a prompt-file input. The design defines neither reading the file into that argument nor an explicit instruction for the reviewer to open it, so supplying a complete prompt file does not establish that the CLI receives its contents. CLI execution is unavailable in this review.
PROPOSAL: Specify the command route's prompt transport explicitly, such as supported file input, stdin or a prompt-text placeholder, and use a verified Copilot invocation. Require the real route test to establish that the reviewer received the canonical instructions and every dispatch identity, rather than only that it returned records.

## Sources

- [Feature-document standard at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/feature-documents.md): sections, rules block, criterion and review formats, acceptance.
- [Feature-document template at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/guides/feature-document-template.md): document layout.
- [Delivery convention at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/delivery.md): claim commit, no squash for feature PRs, skip-CI scope, delivered after every release path publishes.
- [Documentation convention at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/documentation.md): prose and document rules.
- [Humanize prose guide at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/guides/humanize-prose.md): prose editing for this document.
