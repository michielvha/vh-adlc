---
status: draft
status_description: "Draft with the owner's answers to Q1, Q3 and Q4 folded in; seven owner questions open, no review yet."
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
follow-ups; squash and amend stay for non-feature and bot PRs.

Shared changes ship first in a vh-adlc release. Stackweaver then adopts them through thin command
adapters, a `.vh-adlc/loop.yaml` settings file and one project procedure, behind a parity map that fails
if any legacy rule has no new home. Rollback is rehearsed on a disposable checkout. Active Stackweaver
specs move to the shared format. How far that migration reaches is an owner question.

Nothing here is reviewed yet. Seven questions are open, among them whether the external route is
generic, whether `/implement` keeps shipping on its own, and how far the spec migration reaches. Accepting this
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
  post-merge watch, `**` support in `covers`, and investigation defaults (always write the document,
  search for duplicates, verdict vocabulary).
- Stackweaver adoption: thin adapters for `/spec`, `/tasks`, `/implement`, `/ship` (feature path),
  `/investigate` and spec review; `.vh-adlc/loop.yaml`; one project procedure; a committed parity map
  with contract tests; migration of active specs; rollback rehearsal.
- Roadmap row D-05 in `shared-workflow-migration.md`, pointing here.

Out of scope:

- Choosing the models. Stackweaver's choice is recorded in its own commit `7861b9dc`; this feature
  makes it configurable and enforced, and changes no other repository's defaults.
- TFE compatibility and provider-fork workflows (roadmap D-04), docs drift (vh-adlc #59), docs truth.
- Stackweaver product code, its dev-stack scripts (`agent-slot.sh`, `worktree-dev.sh`,
  `watch-merge.sh`) and its CI workflows. These are called, never changed.
- Converting terminal Stackweaver specs, unless Q7 says otherwise.
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
no worktree creation, and reads the reply. The reply must open with `MODEL:`, then carry records in the
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

### Investigation defaults

A `findings_document: always` setting makes invoking investigate the request to write the document,
in the consumer's declared analysis home. Investigate also searches existing analysis documents and
open issues for duplicates before writing, states that conclusions come from primary sources read in
the run, and ends with one verdict: act now, track with named flip conditions, or reject. Issue filing
keeps vh-adlc's authority rule (Q8).

### `covers` globs

Feature-document lint accepts `**` with the meaning the docs-impact matcher already gives it, so one
`covers` vocabulary serves both. The match code is shared, not copied, and existing documents without
`**` keep their results.

### Stackweaver adoption

Stackweaver's adapters forward each command to the installed operation with `loop.yaml`, keep the
`model:` frontmatter that settings require, and keep the arguments users type today. A new
`agents/loop-project.md` holds the local rules: worktree slots, the verification ladder, the
direct-to-main policy and `[skip ci]` rules for non-feature work, satellite rules, `lessons.md`
recording, the docs index rebuild and plan categories under `docs/internal/plans/`. A committed parity
map, shaped like `tests/agent-audit/parity.json`, lists each legacy behavior with its legacy source
excerpt hash, its new home and a contract test; a legacy rule with no row fails the test. Active specs
move to the shared format in one migration. The native agent files are retired only after the
published plugin is installed from the marketplace and exercised, and a rollback to them is rehearsed.

### Conflicts and their homes

| Conflict | Resolution |
| --- | --- |
| Worktree model | Claim from a host worktree, shared (owner, Q3) |
| Squash, amend and force-push on feature PRs | Merge commits for features (owner, Q4) |
| `/implement` pushes and opens the PR | Q5 |
| Non-feature and direct-to-main shipping | Q6 |
| `AC1`, Test Plan and Review Log formats in existing specs | Q7 |
| Status flip without owner acceptance; `complete` versus delivered | Q8 |
| Issue filing during `/spec` and `/investigate` | Q8 |
| Owner summary placement, `issue: ""`, bare `#N`, line numbers in Design | Q9 |
| `[skip ci]` for features that touch only `agents/` or `.claude/` | Q10 |
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
- [ ] AC-09: Every Stackweaver spec in the migration set passes `vh-adlc lint`, and its gate results agree with a manual reading of the document.
- [ ] AC-10: Stackweaver's local behaviors stay available with unchanged invocation: worktree slots, direct-to-main non-feature shipping, `[skip ci]` rules, `watch-merge.sh`, the triad and satellite lenses, and the browser-pass summary table.
- [ ] AC-11: A disposable Stackweaver checkout rolls back to the native loop and reapplies the adoption, with the docs index and unrelated workflow files byte-identical afterwards.
- [ ] AC-12: The shared changes are installed from the published marketplace in an isolated profile and exercised through their entry points before Stackweaver's native agent files are retired.
- [ ] AC-13: Implement claims a planned feature from a clean worktree whose `HEAD` is the fetched default branch tip, detached or on another branch name, pushes the claim to the default branch and continues in that worktree on the feature branch; with stray changes or a stale tip it stops and changes nothing.
- [ ] AC-14: A Stackweaver feature taken through the adopted loop and merged keeps every commit its Review Log names reachable from `main`, and its completion gate passes there.

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

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q2: Should the external review route be generic or Copilot-only?

**Recommendation:** A. A command template covers Copilot today and any other CLI later without another
plugin change.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Generic command route with placeholders** | Copilot, Codex or another CLI by settings alone | A wider surface to test and to keep read-only |
| **B. Built-in Copilot CLI route** | Smaller, easier to verify | Another provider needs another plugin release |
| **C. Stackweaver-local script, nothing shared** | No vh-adlc change | Other repositories cannot use it, and the review protocol stays unaware of it |

**Why this is yours:** it trades shared reach against a smaller attack and test surface.

### Q5: Should `/implement` keep pushing and opening the PR by itself?

**Recommendation:** A. It keeps today's flow, and the grant is written down and reviewable instead of
implied.

| Option | You get | It costs |
| --- | --- | --- |
| **A. A standing grant in Stackweaver's project procedure lets implement hand straight to ship** | No extra step | The grant applies to every feature until removed |
| **B. Follow vh-adlc: a separate ship request each time** | An explicit go before anything is pushed | One more command per feature |

**Why this is yours:** it is a standing publication permission.

### Q6: Where should small non-feature fixes and their direct-to-main pushes live?

**Recommendation:** A. vh-adlc ship is feature-only by design, and these fixes are Stackweaver policy.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Keep Stackweaver's own `/ship` path for non-feature changes** | Unchanged daily flow | Two shipping paths in Stackweaver |
| **B. Add a shared non-feature delivery to vh-adlc with consumer-declared rules** | One shipping entry point | A large new shared capability with its own authority rules |

**Why this is yours:** it decides whether the shared plugin grows a new publishing capability.

### Q7: Which existing Stackweaver specs should move to the shared format?

**Recommendation:** A. The 55 non-terminal specs are the ones gates will run on; finished specs are
history and stay as written.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Convert non-terminal specs; leave terminal ones as history** | Gates trustworthy where they matter; bounded work | Two formats exist side by side in `docs/internal/plans/` |
| **B. Convert every spec** | One format everywhere | Large churn in documents nobody will gate again |
| **C. Declare `Feature document format: local`** | No conversion | Every gate becomes manual, which loses the main gain |

**Why this is yours:** it trades migration effort against format consistency.

### Q8: Should Stackweaver adopt vh-adlc's acceptance, completion and issue authority rules?

**Recommendation:** A. You already treat an explicit pick, not iteration, as acceptance, and issue
actions already wait for your go in practice.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Adopt them: owner acceptance row before `planned`; `complete` on the feature branch; delivered after the post-merge watch; issues filed only on request or with acceptance** | One rule set, enforced by gates | `/spec review` no longer flips a spec to `planned` alone; `/spec` and `/investigate` ask before filing |
| **B. Keep Stackweaver's rules locally** | Today's behavior | The `accepted` gate fails on every spec, so gates become manual again |

**Why this is yours:** it changes who moves a spec forward and when issues appear.

### Q9: Which document style should Stackweaver specs use?

**Recommendation:** A. The shared reviewer and binary expect it, and Stackweaver's symbol-name rule can
stay for its other internal docs.

| Option | You get | It costs |
| --- | --- | --- |
| **A. vh-adlc style for specs: `### Owner summary` under Context, `issue: null`, full issue URLs, `AC-01` IDs, `file:line` citations in Design** | No special cases in the shared tools | Specs read slightly differently from other Stackweaver docs |
| **B. Keep Stackweaver style; vh-adlc learns the variants** | Familiar documents | Shared tools carry Stackweaver-specific exceptions |

**Why this is yours:** it is a house-style choice with a cost on one side or the other.

### Q10: Should a feature that touches only `agents/` or `.claude/` still skip CI?

**Recommendation:** B. Stackweaver CI is manual-only, so the marker mainly protects the release pipeline
on merge, and the narrower shared rule only adds a pipeline run for tooling-only features.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Let a consumer declare extra skip-eligible paths** | Stackweaver's current skip set for features | A shared rule that each consumer can widen |
| **B. Accept the shared rule for features** | No new setting | Tooling-only feature merges run the release pipeline |

**Why this is yours:** it trades CI minutes against a simpler shared rule.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [Feature-document standard at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/feature-documents.md): sections, rules block, criterion and review formats, acceptance.
- [Feature-document template at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/guides/feature-document-template.md): document layout.
- [Delivery convention at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/delivery.md): claim commit, no squash for feature PRs, skip-CI scope, delivered after every release path publishes.
- [Documentation convention at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/documentation.md): prose and document rules.
- [Humanize prose guide at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/guides/humanize-prose.md): prose editing for this document.
