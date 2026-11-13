---
status: draft
status_description: "R-6 had no blocking findings; its should-fix items are applied and answered. Waiting for a confirming review, then owner acceptance."
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
  - plugins/vh-adlc/knowledge.md
  - plugins/vh-adlc/vh-adlc.lock.json
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - plugins/vh-adlc/scripts/ensure-vh-adlc.sh
  - .goreleaser.yml
  - .github/workflows/ci.yml
  - .github/workflows/release.yml
  - .claude-plugin/marketplace.json
  - .agents/plugins/marketplace.json
  - release-signing-key.asc
  - internal/doc/
  - internal/fresh/
  - plugins/vh-adlc/scripts/docs-impact/
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

The owner settled its open questions on 2026-11-13. Model routes live in a committed
`.vh-adlc/loop.yaml`, with only the reviewer CLI's binary path overridable per user. A feature is
claimed from the session's own host worktree when it sits at the tip of the default branch, as
Stackweaver sessions work today, and vh-adlc gains that as a shared behavior because Claude Code and
Codex both start work in worktrees they create. Feature PRs land by merge commit with additive
follow-ups; squash and amend stay for non-feature and bot PRs. The external review route is generic:
any CLI described by a command template. Stackweaver keeps two standing behaviors: `/implement` hands
straight to ship under a written grant, and small non-feature fixes keep shipping through Stackweaver's
own `/ship`. Draft specs move to the shared format now; planned, in-progress and parked specs finish
under the native loop unless the owner moves one, which then goes back through draft, a fresh review and
acceptance. Finished specs stay as history.
Stackweaver adopts vh-adlc's acceptance, completion and issue rules and its document style. A consumer
may declare extra paths that still skip CI for a feature, which needs a small revision to the central
delivery convention in vhco-pro/docs.

Shared changes ship first in a vh-adlc release. Stackweaver then adopts them through thin command
adapters, a `.vh-adlc/loop.yaml` settings file and one project procedure, behind a parity map that fails
if any legacy rule has no new home. Rollback is rehearsed on a disposable checkout. Active Stackweaver
specs move to the shared format.

Review R-1 on `gpt-6.1-sol` found four blocking problems. The factual ones are fixed and the owner
answered the judgement ones: implementation reviews get shell access with a worktree-unchanged check,
active specs finish natively, and the route passes the prompt text explicitly. R-2 found one more
blocking gap, how each command picks the native or shared loop, now settled per document by enrollment.
Its other answers: failed checks block completion and delivery, the reviewer worktree check compares file
contents, and only reviewer roles may use a command route. R-3 led to worktree isolation becoming a
shared opt-in setting that Stackweaver turns on, refs joining the reviewer worktree check, no push over a
failing check, and the native agents staying until even the domain plans are enrolled or finished.
R-4 added the release path inventory and settled that the merge commit decides publication, that checks
apply over the whole feature delta, and that the reviewer worktree check covers ignored files and index
flags. R-5 led to an Order list after completion, the way `host-cleanup.md` delivers its release and
lock PR, and to the reviewer worktree check catching new ignored files. R-6 found nothing blocking; its
should-fix items tightened the freshness wording, the signed release check, `covers` and flagged tracked
files. A confirming review pass is next, then acceptance. Accepting this
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

- A vh-adlc runtime release and plugin release through the paths and Order in Design.
- Shared vh-adlc changes: per-role model routing in settings, an external command route for reviews,
  claiming a feature from a host worktree at the default branch tip, an opt-in setting that keeps
  implement out of the primary checkout, a settings file and project
  procedure read by every SDD operation, repository instructions and
  declared lenses in reviews, conditional verification rungs, a declared CI trigger policy, a declared
  post-merge watch, consumer-declared skip-CI paths, `**` support in `covers`, and investigation
  defaults (always write the document, search for duplicates, verdict vocabulary).
- A vhco-pro/docs revision of `conventions/delivery.md` that lets a consumer declare extra skip-eligible
  paths, and the plugin pin bump that adopts it.
- Stackweaver adoption: thin adapters for `/spec`, `/tasks`, `/implement`, `/ship` (feature path),
  `/investigate` and spec review; `.vh-adlc/loop.yaml`; one project procedure; a committed parity map
  with contract tests; migration of draft specs, and of any planned, in-progress or parked spec the
  owner chooses; rollback rehearsal.
- Roadmap row D-05 in `shared-workflow-migration.md`, pointing here.

Out of scope:

- Choosing the models. Stackweaver's choice is recorded in its own commit `7861b9dc`; this feature
  makes it configurable and enforced, and changes no other repository's defaults.
- TFE compatibility and provider-fork workflows (roadmap D-04), docs drift (vh-adlc #59), docs truth.
- Stackweaver product code, its dev-stack scripts (`agent-slot.sh`, `worktree-dev.sh`,
  `watch-merge.sh`) and its CI workflows. These are called, never changed.
- Converting terminal Stackweaver specs (complete, abandoned, superseded, archived), or converting a
  planned, in-progress or parked spec without the owner choosing it.
- Converting the domain-extension plans that roadmap D-04 keeps local, such as
  `docs/internal/plans/features/terraform/terraform-provider-stackweaver-plan.md` and
  `TFE_COMPATIBILITY_MASTER_PLAN.md`.
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
`review-protocol.md` passes a requested model today, or `command`, described below. Only the two
reviewer roles accept a `command` route; settings that give `author` or `implementer` one are refused
with an error naming the role. Resume takes the route of the operation it continues. Agent and skill
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
  argv: [/home/linuxbrew/.linuxbrew/bin/copilot, --model, "{model}", --available-tools, view, glob,
         --allow-all-tools, --no-ask-user, -p, "{prompt}"]
implementation_reviewer:
  route: command
  model: gpt-6.1-sol
  argv: [/home/linuxbrew/.linuxbrew/bin/copilot, --model, "{model}", --available-tools, view, glob, shell,
         --allow-all-tools, --no-ask-user, -p, "{prompt}"]
```

The operation writes the canonical reviewer instructions, document path, exact commit, kind, docs
revision, binary path and plugin pin into a prompt file, runs the command from the owning worktree with
no worktree creation, and reads the reply. The route is generic: `argv` is any command with
placeholders, so Copilot, Codex or another CLI needs only settings. `{model}` is the role's model,
`{prompt}` is the whole prompt text as one argument (what Copilot's `-p` takes), and `{prompt_file}` is
the path of the same text for a CLI that reads files. The reply opens with `MODEL:` and then
`TARGET: <commit>`; the operation checks that `TARGET` equals the commit it dispatched, which proves the
reviewer received the dispatch identity, and strips both header lines before storing the records. A
command that is not given a read-only tool restriction is recorded with `procedural` isolation.

A spec review reads only, so its route may stay file-only. An implementation review must observe the
checks it relies on, because the standard counts only executed evidence the review saw as `met`, so its
route has shell access. Before dispatch the operation records `HEAD`, the index tree (`git write-tree`),
every ref (`git for-each-ref`), `git status --porcelain --untracked-files=all`, the list of ignored files (`git ls-files --others --ignored --exclude-standard`), a content
hash of every modified, untracked and ignored file and of every tracked file flagged assume-unchanged or
skip-worktree (`git ls-files -v`), which status cannot see, and the index entries with their flags
(`git ls-files --stage --debug`) in the owning worktree, leaving out only build-output directories
listed under `review_scratch` in `loop.yaml`; after the reply it records them again. Any difference outside `review_scratch`, including a
changed file whose status line stayed the same or a newly created ignored file, leaves the review pending, stores nothing and reports what changed. Such a review is recorded with
`procedural` isolation. The reply must open with `MODEL:`, then carry records in the
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
claim commit with `git switch -c`, and that worktree becomes the owning worktree. The plugin still never
creates, moves, prunes or resets a worktree. Two failures are kept apart. A stale tip, or any staged or
unstaged change that does not belong to the claim, is found before anything is written, and the step
stops with the repository unchanged. A rejected push happens after the claim commit exists: as the
current procedure says, the local claim commit stays, no feature branch is created, and the report marks
the claim pending and names the retry or handoff the owner can choose. Today's path, a worktree that has the default branch checked out, keeps working.

Worktree isolation also becomes a shared setting. Today the plugin leaves worktree creation to the host
(`references/authority.md:81`; `personal-development-loop.spec.md` D-25), so nothing stops implement
from claiming in a repository's primary checkout. With `implement_worktree: isolated` in `loop.yaml`,
implement never claims or edits in the primary worktree (the first entry of `git worktree list`). When
it starts there, it asks the host for an isolated worktree through the host's own worktree tool where
one exists (Claude Code's `EnterWorktree`) and continues in it; on a host without such a tool it stops
before writing anything and says how to start in a worktree. The worktree is the host's, so the plugin
still creates none itself, and `authority.md` gains this host-delegated case. Without the setting,
behavior is unchanged.

Stackweaver sets `implement_worktree: isolated`, which keeps what `agents/implement.md:52-56` does
today with an explicit `EnterWorktree`. Its host worktrees start from a fresh `main` (Stackweaver
`.claude/settings.json:9` sets `worktree.baseRef: "fresh"`), so they sit at the default branch tip the
claim needs, and the live, bind-mounted main checkout is never switched.

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
changed-path glob, a criterion kind, or always. A path condition is evaluated over the whole feature
delta: the feature branch against its merge base with the default branch, plus uncommitted changes the
feature owns. A passing result counts only for the exact commit it ran on, so a new commit needs the
rung again. Implement and ship run every rung whose condition holds
and report each as passed, failed or not run with a reason. Every applicable rung must pass before the feature
branch is pushed, and again before the feature is marked complete or reported delivered, matching
Stackweaver's rules to verify fully before any push (Stackweaver `CLAUDE.md:153`) and never to ship over
a known failure (`agents/ship.md:136-137`). A failed rung blocks all three. A rung that could not run
blocks them too, unless the owner allows that exact rung for that run, which the report records. Stackweaver declares `make verify`,
`make test-integration` for `backend/` and `core/`, the kind harness for E2E specs, a browser pass with
the summary table for UX paths, and both engines for engine-sensitive paths. Without rungs, the current
behavior stays: read commands from `AGENTS.md`, ask if none.

A declared `ci_trigger: manual` makes ship report CI as not triggered by policy instead of waiting for
a run or suggesting a dispatch. A declared `post_merge_watch` command (Stackweaver:
`scripts/release/watch-merge.sh <merge-sha>`) must exit 0 before a feature whose merge can publish is
reported delivered, matching the delivery convention's rule that a feature is delivered once every
release path has published. Publication is decided by the merge commit itself, since Stackweaver's tag
workflow runs on every push to `main` and `watch-merge.sh:143` reads the merge commit's own message.
When a delivery qualifies for the skip marker, the authorized merge uses a merge commit message that
carries it. After the merge, ship reads the actual merge commit: if its message carries the marker and
its diff against the first parent touches only skip-eligible paths, the feature is reported delivered
with the reason "no publication path" and the watch is not run. Any other merge commit, including a
qualifying delivery merged without the marker, runs the watch like any publishing merge.

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

Feature-document lint accepts `**` with the meaning the docs-impact matcher
(`plugins/vh-adlc/scripts/docs-impact/matching.ts`) already gives it, so one `covers` vocabulary serves
both. `doc.MatchCovers` in `internal/doc/covers.go` gains the same semantics, and because
`internal/fresh/fresh.go:189` uses it for review staleness and dirty-tree checks, a committed change
under a `**` entry makes the applicable review stale (`internal/fresh/fresh.go:165-184`) and an
uncommitted one makes `feature_tree_clean` false (lines 198-218), exactly as a plain entry does today. Existing documents without `**` keep their results.

### Release path

The shared change publishes through four paths, in this order:

| Artifact | Build and publication path |
| --- | --- |
| vhco-pro/docs `conventions/delivery.md` revision (skip-CI paths) | A reviewed vhco-pro/docs merge; its commit becomes the new docs pin |
| `vh-adlc` runtime: four platform `tar.gz` archives, `checksums.txt` and its signature | Merge to main; the `version` job in `.github/workflows/ci.yml` (vhco-pro/version-workflow) tags it; `.github/workflows/release.yml` on the `v*.*.*` tag runs vhco-pro/go-release-workflow with `.goreleaser.yml` |
| Plugin lock and pin: `plugins/vh-adlc/vh-adlc.lock.json`, `plugins/vh-adlc/knowledge.md` | A follow-up commit that points the lock at the published runtime release and its archive checksums, and moves the docs pin |
| Plugin payload: `plugins/vh-adlc/`, versioned by `plugin.json` and `.claude-plugin/plugin.json` | Served from the default branch through `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json` |

Before the feature PR merges, a check rebuilds what each path builds: a GoReleaser snapshot build of
all four archives from `.goreleaser.yml` and `bun test tests/vh-adlc` over the plugin payload. The
vhco-pro/docs revision merges first, so the feature branch itself moves `knowledge.md` to that commit.
Every criterion is proved on the feature branch with a candidate binary built from it and a candidate
plugin installed from it, as `host-cleanup.md` did.

### Order

The rest follows `complete`, and its outcomes go in `status_description`, outside the normative
baseline, as in `host-cleanup.md` (`### Order`):

1. The feature PR lands with a `feat` commit, so `main` tags a stable minor release and the release
   workflow publishes the signed runtime assets.
2. The lock moves to that release in its own PR. Before writing it, `checksums.txt` is verified with
   `gpg` against the repository's `release-signing-key.asc` (primary fingerprint
   `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6`), and all four archives' digests are checked against it,
   as the 0.19.0 lock commit `cdb74bc` records. `scripts/ensure-vh-adlc.sh` then verifies an install
   against the new lock; it checks only the lock's digests for the current platform, so it does not
   replace the signature check.
3. The plugin is installed from the published marketplace in an isolated profile, its payload digest,
   docs pin and lock are compared with the reviewed source, and one spec review runs through the
   command route.
4. Stackweaver's adoption PR, proved against the candidate, merges, and a first real run of each adapted
   command follows.

Delivery ends once all four steps have succeeded.

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
excerpt hash, its new home and a contract test; a legacy rule with no row fails the test. Draft specs under
`docs/internal/plans/` (12 at `7861b9dc`) move to the shared format in one migration. The 43 planned or
in-progress specs and 3 parked ones finish under the native loop, whose agent files stay in place for
them. When the owner moves one over, it goes to `draft` under the standard's revision rule, its ticks,
evidence and residuals reset (history stays in Git), any active writer hands it over first, and it needs
a fresh independent review and the owner's acceptance before work resumes. Every adapted command routes by enrollment, decided per document: a spec is
enrolled when its Review Log uses the shared header (`| Date | Review | Kind | Commit | Model |
Isolation | Outcome |`), and every new spec is written enrolled. `/spec review`, `/tasks`, `/implement`
and `/ship` run the vh-adlc operation for an enrolled spec and the native agent for any other, so an
unmigrated spec keeps its native review, status flip and completion through the same commands until it
finishes or is moved. Moving a spec enrolls it. The native spec, tasks,
implement and reviewer agents retire only once no non-terminal spec is unenrolled, domain-extension
plans included; those plans stay native until they finish or the owner moves one. After retirement an
adapted command given a terminal unenrolled document refuses with a message that it is closed history,
since nothing in it can advance. Terminal specs stay as written. The native agent files are retired only after the
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

- [ ] AC-01: A repository's `.vh-adlc/loop.yaml` names a route for each loop role, every SDD operation dispatches according to it, a `command` route is accepted only for the two reviewer roles, no vh-adlc agent or skill file names a model, and a repository without the file behaves as it does at `a7bfca99`.
- [ ] AC-02: From a Claude Code session, a file-only spec review and a shell-enabled implementation review run through declared command routes on `gpt-6.1-sol` against an exact commit; the implementation review can return `met` from checks it ran; a matching reply with the dispatched `TARGET` is stored verbatim and passes `review check`; and a mismatched model or target, a missing header, a non-zero exit, a timeout or any change outside the declared `review_scratch` directories to the worktree's `HEAD`, index entries, refs, status, file contents or ignored-file list leaves the review pending with no Review Log row.
- [ ] AC-03: Every SDD operation reads the declared project procedure and instruction files, and a spec review flags a document that contradicts a declared instruction file or lens.
- [ ] AC-04: Implement and ship run each declared verification rung whose condition holds over the whole feature delta and report every rung as passed, failed or not run with a reason; a failed rung, or one that could not run without the owner allowing it for that run, means the feature branch is not pushed and the feature is not complete or delivered; with no rungs declared they keep the current command lookup.
- [ ] AC-05: With `ci_trigger: manual`, ship reports CI as not triggered by policy and dispatches nothing; with a `post_merge_watch` declared, a feature whose merge can publish is reported delivered only after that command exits 0, and a feature whose actual merge commit carries the skip marker and touches only skip-eligible paths is reported delivered with no publication path and no watch run, while an unmarked merge commit runs the watch.
- [ ] AC-06: Feature-document lint accepts `covers` entries containing `**`, they match the same paths as the docs-impact matcher, and under such an entry a committed change makes the applicable review stale while an uncommitted change makes `feature_tree_clean` false, as for a plain entry.
- [ ] AC-07: With `findings_document: always`, investigate writes its findings document, reports any duplicate analysis document or open issue it found, and ends with one of the three verdicts.
- [ ] AC-08: Stackweaver's `/spec`, `/spec review`, `/tasks`, `/implement`, `/ship` for features and `/investigate` run the installed vh-adlc operations with Stackweaver's settings for every enrolled spec and, until the native agents retire, the native agents for every unenrolled one (after retirement, AC-17's refusal applies to terminal unenrolled documents), new specs are written enrolled, and every row of the committed parity map passes its contract test.
- [ ] AC-09: Every Stackweaver spec in the migration set (the draft specs, plus each planned, in-progress or parked spec the owner moved) passes `vh-adlc lint`, its gate results agree with a manual reading of the document, and each moved spec that was planned or in progress carries a fresh review and an owner acceptance row at its converted baseline.
- [ ] AC-10: Stackweaver's local behaviors stay available with unchanged invocation: worktree slots, direct-to-main non-feature shipping through its own `/ship`, `[skip ci]` rules, `watch-merge.sh`, the triad and satellite lenses, the browser-pass summary table, and `/implement` handing straight to ship.
- [ ] AC-11: A disposable Stackweaver checkout rolls back to the native loop and reapplies the adoption, with the docs index and unrelated workflow files byte-identical afterwards.
- [ ] AC-12: On the feature branch, a GoReleaser snapshot build produces all four runtime archives, the plugin's `knowledge.md` pin names the merged vhco-pro/docs revision, and a candidate plugin installed from the branch in an isolated profile runs every adapted Stackweaver command through its entry points.
- [ ] AC-13: Implement claims a planned feature from a clean worktree whose `HEAD` is the fetched default branch tip, detached or on another branch name, pushes the claim to the default branch and continues in that worktree on the feature branch; with stray changes or a stale tip it stops before writing anything, and when the push is rejected it keeps the local claim commit, creates no feature branch and reports the claim pending.
- [ ] AC-14: A Stackweaver feature taken through the adopted loop passes its completion gate in its owning worktree before merge, and after it lands by merge commit every commit its Review Log names is reachable from `main`.
- [ ] AC-15: With `skip_ci_paths` declared, a feature delivery whose commit, push range and PR diff touch only feature documents, Markdown onboarding files or declared paths carries the skip marker, and any other change in the delivery leaves it off.
- [ ] AC-16: In Stackweaver, `/spec review` never moves an enrolled spec to `planned` without an owner acceptance row, and `/spec` and `/investigate` create no issue without an explicit request or accepted scope.
- [ ] AC-17: Stackweaver's native spec, tasks, implement and reviewer agent files stay routable while any non-terminal spec, domain-extension plans included, is unenrolled, are retired only after none is, and after retirement an adapted command given a terminal unenrolled document refuses without running anything.
- [ ] AC-18: With `implement_worktree: isolated`, implement started in the primary worktree continues in a host-created isolated worktree, or stops before writing on a host without a worktree tool, and the primary worktree's branch, `HEAD`, index and files are unchanged afterwards; without the setting, behavior is unchanged.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc` cases for each supported role and route pair, refusal of a `command` route for `author` and `implementer`, resume taking the continued operation's route, a no-file case compared with `a7bfca99` behavior, and a grep test that fails on a model name in any agent or skill file. |
| AC-02 | A fixture repository with a stub command that returns a matching reply, a wrong model, a wrong `TARGET`, no header, exit 1, a hang, one that touches a clean file, one that rewrites an already modified or untracked file without changing its status line, one that creates or moves a non-current branch or tag, one that overwrites an existing ignored configuration file, one that creates a new ignored file outside `review_scratch`, one that overwrites a tracked file already flagged assume-unchanged without changing the flag, one that writes only inside `review_scratch` (stored), and one that changes an index flag without changing the index tree; then one real Copilot CLI `gpt-6.1-sol` spec review and one implementation review on a disposable feature where the reviewer runs the tests and returns `met`, with transcripts and the stored records kept as evidence. |
| AC-03 | Fixture specs that break a declared instruction and a declared lens; the reviewer must return a finding for each and none for a compliant control. |
| AC-04 | Fixture changes that match some rungs and not others; a feature whose first commit changes `backend/` and whose last changes only documentation must still require the integration rung before push and completion; a pass recorded on an earlier commit must not count for a later one; the report must list every rung with the right state; a failing command must leave no push, no completion commit and no delivered report even when an owner allowance is recorded; an unavailable procedure must do the same unless the owner allowance is recorded for that exact rung, and with it must proceed; a no-rung fixture must keep the current lookup. |
| AC-05 | Ship fixtures with `ci_trigger: manual` (no dispatch call made, state reported), a watch stub that exits 1 then 0 (delivered only after 0), a skip-eligible feature merged with a marked merge commit (delivered with no publication path, watch never invoked), and the same feature merged with an unmarked merge commit (watch invoked). |
| AC-06 | Go tests in `internal/doc` for `**` at start, middle and end, compared with the docs-impact matcher on the same inputs; `internal/fresh` tests where a commit under a `**` entry makes the review stale, and separately a dirty file under it makes `feature_tree_clean` false without staling the review; the existing lint suite unchanged. |
| AC-07 | Investigate fixtures with and without a duplicate analysis document and a duplicate open issue; the run must write the document and name the duplicate and the verdict. |
| AC-08 | Stackweaver parity contract tests; one real run of each adapted command on a disposable enrolled feature, checking the operation reached and the settings read; and, before retirement, the same commands on a disposable unenrolled spec, which must reach the native agents through a native re-review and completion. Post-retirement refusal is tested under AC-17. |
| AC-09 | `vh-adlc lint` and `vh-adlc gate` over the migration set, a manual reading of every migrated spec that records the expected and observed result of each gate condition at its converted baseline, and for each moved planned or in-progress spec an inspection of its Review Log for a post-conversion review and acceptance row. |
| AC-10 | A scripted check that each listed local behavior's entry point still exists and runs in dry-run or help mode, and a review of `agents/loop-project.md` against the parity map. |
| AC-11 | The rollback and reapply procedure on a disposable checkout, comparing file hashes before and after. |
| AC-12 | `goreleaser release --snapshot --clean` at the feature head listing four archives; the `knowledge.md` pin compared with the merged vhco-pro/docs commit; an isolated Claude Code profile with the candidate plugin installed from the branch and the candidate binary, running each adapted command on a disposable Stackweaver checkout. The post-merge Order steps are recorded in `status_description`, not here. |
| AC-13 | Fixture repositories with a detached worktree at the tip and a worktree on another branch at the tip (both claim); one behind the tip and one with a stray change (both leave the repository byte-identical); and a rejected push (one local claim commit, no feature branch, a pending report). |
| AC-14 | One disposable Stackweaver feature taken from claim to merge: `vh-adlc gate complete` passes in the owning worktree before the PR merges, then `git merge-base --is-ancestor <commit> origin/main` holds for every Review Log commit after a merge-commit landing. |
| AC-15 | Ship fixtures whose delivery touches only declared paths, declared paths plus code, and declared paths with an earlier code commit in the push range; only the first carries the marker. |
| AC-16 | Stackweaver parity contract tests for the acceptance and issue rules, plus a disposable spec review run that ends with the spec still `draft` until an acceptance row exists. |
| AC-17 | A scripted check over `docs/internal/plans/` that lists every non-terminal unenrolled spec, domain-extension plans included; while the list is non-empty the native command routes must resolve and the retirement commit is refused; after retirement, each adapted command given a terminal unenrolled document must refuse with no write. |
| AC-18 | Fixtures with the setting on and off; a Claude Code run of the adopted Stackweaver `/implement` started on a clean main checkout, comparing that checkout's branch, `HEAD`, `git write-tree` and file hashes before and after while the feature proceeds in the host worktree; a host without a worktree tool must stop before any write. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None. The owner answered Q1 to Q10, the three R-1 judgement findings (F-01, F-03, F-07) and the
three R-2 judgement findings (F-02, F-03, F-04) the two R-3 judgement findings (F-01, F-04) the three
R-4 judgement findings (F-02, F-03, F-04) the two R-5 judgement findings (F-01, F-02) and the R-6 judgement finding (F-01) on 2026-11-13; the answers are folded into Owner summary, Scope and Design.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-13 | R-1 | spec | `798132cf54857c07ee04f82f6595ad9b9acd65a8` | gpt-6.1-sol | procedural | Four blocking findings: no review route that can execute checks, post-merge complete gate, active spec migration, skipped delivery versus the merge watch. |
| 2026-11-13 | R-2 | spec | `7af38b0eb50ae12a678dbcebb3b04cd61b32abb0` | gpt-6.1-sol | procedural | One blocking finding: no enrollment rule between native and shared routing; five should-fix. |
| 2026-11-13 | R-3 | spec | `764df2fe8182152243a40b81e12a9168a88e5fa2` | gpt-6.1-sol | procedural | Two blocking findings: adapter must isolate implement from the live main checkout; domain plans routed to retired agents. Two should-fix. |
| 2026-11-13 | R-4 | spec | `b777df0b6cc97a2d8b1410f3bedc73631ab504f5` | gpt-6.1-sol | procedural | Two blocking findings: routing criteria contradict for terminal documents; no-publication verdict not tied to the merge commit. Three should-fix. |
| 2026-11-13 | R-5 | spec | `4f970d4d18078e7c3edbc81db9d941fbfb6116a1` | gpt-6.1-sol | procedural | One blocking finding: the release order needs a post-merge lock commit outside the single-feature lifecycle. Two should-fix. |
| 2026-11-13 | R-6 | spec | `db426cbbe13abd8675d4365ad23903e59b94b7c0` | gpt-6.1-sol | procedural | No blocking findings; four should-fix on freshness wording, signed release verification, covers and assume-unchanged files. |

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

### R-2

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design / Stackweaver adoption; AC-08, AC-16 and AC-17
EVIDENCE: The adapters must forward every feature command to installed operations, while unmigrated active specs must finish through the native loop. No per-document routing rule distinguishes those paths. Stackweaver agents/spec.md review step 6 moves draft to planned without an acceptance row, contradicting the unconditional AC-16 requirement. Retaining agent files alone does not reconcile these contracts. I cannot run Git or vh-adlc; the contradiction follows from the current specification and native instructions.
PROPOSAL: Define an explicit enrollment and routing rule for every feature operation, including review and ship, and scope the new lifecycle guarantees consistently. Test unmigrated and migrated specs through the same existing commands, including a native re-review and completion.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Verification rungs, CI policy and post-merge watch; AC-04 and its Test Plan row
EVIDENCE: AC-04 permits applicable rungs to be reported failed or not run without requiring either result to block completion or delivery. Its proof checks report states but not stopping behavior. Stackweaver CLAUDE.md requires full applicable local verification before pushing, and agents/ship.md prohibits shipping over a known failure. The new conditional verification mechanism has no explicit test establishing that these gates survive.
PROPOSAL: Require applicable mandatory rungs to pass before completion or delivery, keeping separately authorized progress PRs distinct. Add failing-command and unavailable-procedure cases that establish no completion update or delivery occurs.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design / External command route; AC-02
EVIDENCE: The preservation check compares only HEAD and porcelain status. Changing the contents of an already modified file, or overwriting an existing untracked file, can leave both snapshots identical. internal/fresh/fresh.go permits unrelated dirty paths when feature_tree_clean holds, while the canonical reviewer requires preserving the working tree and index. The planned fixture only touches a file; it does not cover this unchanged-status case. Git execution is unavailable in this review.
PROPOSAL: Compare content and index identities for pre-existing dirty state, rather than treating unchanged status as unchanged work. Add a fixture that alters an existing dirty or untracked file without changing its status and require the review to remain pending.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Model routing per role and External command route; AC-01
EVIDENCE: The design allows either host or command routes for each of the four roles, and AC-01's proof tests each role and route kind. However, the command protocol always supplies canonical reviewer instructions and expects review records. It defines no author or implementer command protocol, and the role table assigns no role to resume despite requiring every SDD operation to dispatch according to settings.
PROPOSAL: Restrict command routes to reviewer roles and define resume's routing behavior, or specify the supported execution contract for the other role combinations. Make unsupported combinations fail explicitly and align the tests with that capability matrix.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter / covers
EVIDENCE: Scope requires a plugin docs-pin bump, but covers omits plugins/vh-adlc/knowledge.md, which supplies that pin. It also omits plugins/vh-adlc/vh-adlc.lock.json, which currently selects binary 0.19.0 and determines whether installed operations receive the changed covers matcher. The pinned feature-document standard requires every path whose change can affect the feature to be covered; internal/fresh/fresh.go filters freshness through doc.MatchCovers.
PROPOSAL: Cover the docs pin, binary lock and directly relevant plugin release metadata. Ensure installed-entry-point proof is bound to those reviewed configuration bytes.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: AC-09 and its Test Plan row
EVIDENCE: AC-09 requires every migrated spec's gate results to agree with a manual reading. The Test Plan performs that comparison for only five randomly chosen specs, while Design identifies twelve drafts before optional migrations. Passing the prescribed procedure therefore cannot establish the whole criterion.
PROPOSAL: Compare gate results with a manual reading for every migrated spec, recording the expected and observed conditions at its converted baseline. Alternatively, obtain owner acceptance for an explicitly sampled criterion with its limitations stated.

### R-3

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design / Claiming from a host worktree; Stackweaver adoption; AC-10 and AC-13
EVIDENCE: The shared claim procedure accepts a worktree holding the default branch and switches it to the feature branch. Stackweaver adapters only forward commands, with no specified step that creates or requires an isolated host worktree. Stackweaver agents/implement.md:52-56 currently calls EnterWorktree explicitly, and CLAUDE.md:127-137 requires that isolation because the main checkout is live and bind-mounted. .claude/settings.json configures the base of a worktree but does not establish that one exists. Invoking the adopted command from clean main can therefore reproduce the checkout-switching problem. I cannot run Git or vh-adlc; this finding follows from reading the procedures and configuration.
PROPOSAL: Specify that the Stackweaver adapter obtains an isolated host worktree before invoking shared implement, or refuses invocation from the live main checkout. Add a scenario starting on clean main that proves its branch and files remain unchanged while implementation proceeds in the isolated worktree.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Design / Stackweaver adoption; AC-08 and AC-17
EVIDENCE: AC-08 requires native agents for every unenrolled spec, while AC-17 requires retiring those agents once no non-terminal spec outside the domain-extension plans remains native. The excluded terraform-provider-stackweaver-plan.md and TFE_COMPATIBILITY_MASTER_PLAN.md are both in-progress, remain unconverted, and therefore remain unenrolled. The routing rule sends /spec review and other generic feature commands for them to agents that the retirement rule removes. Terminal native documents also remain subject to the unqualified routing rule.
PROPOSAL: Define routing for excluded domain plans and retained historical documents after retirement, without depending on deleted agents. Align AC-08, AC-17 and their tests with that boundary, or retain the native handlers while any supported invocation still needs them.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design / Verification rungs, CI policy and post-merge watch; AC-04
EVIDENCE: Design explicitly allows an authorized progress PR to open with failing verification rungs. Stackweaver CLAUDE.md:153 requires full applicable local verification before any push, and agents/ship.md:136-137 says never ship over a known verification failure. Preventing completion and a delivered report does not preserve those pre-push gates. The specified constitution changes address history and document style, but do not address this exception.
PROPOSAL: Keep Stackweaver's mandatory pre-push checks binding for progress PRs as well as completed delivery. If failed-check publication is intended, raise the constitution change for the owner and test its exact permission boundary.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design / External command route; AC-02 and its Test Plan row
EVIDENCE: The preservation snapshot records HEAD, the index tree, status and dirty-file contents, but no other refs. plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:22-24 requires commands to leave every ref unchanged. A shell-enabled reviewer can move or create another branch or tag without changing any specified snapshot value, and the review would remain eligible for storage. The proposed mutation fixtures cover files, not refs.
PROPOSAL: Include the repository's ref identities in the before-and-after preservation check and reject reviews when they differ. Add a fixture that changes a non-current ref while leaving HEAD, index and worktree snapshots unchanged.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design / Stackweaver adoption; AC-08 and AC-17
EVIDENCE: AC-08 requires running native agents “for every unenrolled one”, without a status or retirement exception. AC-17 instead requires refusing terminal unenrolled documents after retirement, without running anything. Terminal documents remain unenrolled by design, so the same invocation must both run a native agent and refuse it. Retaining native agents for active domain plans resolves their routing problem but not this remaining criterion contradiction.
PROPOSAL: Qualify AC-08 with the terminal-document retirement exception specified in Design and AC-17. Test active native routing separately from post-retirement historical-document refusal.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / External command route; AC-02 and its Test Plan row
EVIDENCE: AC-02 rejects any change to index or file contents, but the preservation snapshot records only the index tree and hashes modified or untracked files reported by porcelain status. Stackweaver .gitignore:10-25 excludes existing environment files and private-key files, whose contents can change without appearing in that snapshot. Index flags can also change without changing git write-tree output. The canonical reviewer requires preserving the working tree and index. I cannot run Git or vh-adlc to execute mutation fixtures; the specified snapshot leaves these states unobserved.
PROPOSAL: Include pre-existing ignored files and meaningful index flags in the preservation check, or explicitly define and obtain approval for a narrower boundary with permitted generated outputs. Add fixtures that overwrite an existing ignored configuration file and change an index flag without changing the index tree.

FINDING: F-03
KIND: judgement
SEVERITY: blocking
WHERE: Design / Skip-CI paths and post-merge watch; AC-05 and AC-15
EVIDENCE: The design infers “no publication path” from a skip-marked feature delivery, but does not require checking or setting the authorized merge commit's message. Stackweaver .github/workflows/tag.yml:5-20 triggers on main and does not path-ignore .claude/settings.json or hook scripts. scripts/release/watch-merge.sh:143-150 checks the merge commit's own message for skip directives. Markers on feature-branch commits therefore do not establish that a later merge commit suppresses publication. The prescribed fixtures do not cover an eligible branch merged without a marker. I cannot execute Git or the workflows.
PROPOSAL: Base the no-publication verdict on the actual merge commit and affected release paths, and require preserving the marker during an authorized skip-eligible merge. Test both marked and unmarked merge commits; an unmarked publishing merge must run the watcher rather than receive a skipped-delivery verdict.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Verification rungs; AC-04 and its Test Plan row
EVIDENCE: Rung applicability uses a “changed-path glob”, but neither Design nor the proof defines its comparison range. Stackweaver CLAUDE.md requires integration tests before merging any backend/ or core/ change. Evaluating only current dirty paths or the last task's commit can omit that mandatory rung when an earlier feature commit changed backend/ and the final task changed only documentation. The existing fixtures test matching paths but not earlier committed changes followed by a clean or documentation-only final state.
PROPOSAL: Define applicability against the complete feature delta, including earlier committed changes and owned uncommitted changes, and bind passing evidence to the verified target. Add a backend-change-then-documentation fixture that still requires integration verification before push and completion.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Scope / Shared release; Design; AC-12 and its Test Plan row
EVIDENCE: The pinned conventions/delivery.md requires naming every affected artifact and its build/publication path, with pre-merge checks reproducing those builds. This document names a vh-adlc release and marketplace installation but supplies no artifact/path inventory. .goreleaser.yml builds four platform binaries, archives and signed checksums; .github/workflows/release.yml publishes through a reusable release workflow. Plugin metadata and vh-adlc.lock.json show independently versioned plugin and runtime inputs. AC-12 checks installation and version equality, not the complete affected publication paths.
PROPOSAL: Name the runtime archives, signatures, plugin payload and docs revision, their actual build/publication paths, and the dependency order for publishing the runtime and updating the plugin lock. Add release-path checks and exact published revision evidence alongside the installed-entry-point checks.

### R-5

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design / Release path; AC-12
EVIDENCE: The release sequence requires merging the runtime to main, publishing it, then making a follow-up commit updating the plugin lock and docs pin. The pinned conventions/delivery.md requires code and configuration changes on the feature branch and one PR per feature or child feature. plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md says an authorized merge ends that PR branch's lifetime. The document specifies neither a child delivery nor an exception for the post-release configuration commit, so its required publication sequence cannot finish through the stated single-feature lifecycle. I cannot run Git or vh-adlc; this follows from the written release sequence and lifecycle rules.
PROPOSAL: Define separately accepted runtime and plugin-finalization child deliveries, or obtain an explicit lifecycle exception for the post-release follow-up. Specify where the remaining document updates land and how their review and completion gates stay valid.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / External command route; AC-02 and its Test Plan row
EVIDENCE: The preservation snapshot hashes modified, untracked and “pre-existing ignored” files, while its git status command does not list ignored files. Creating a new ignored file outside review_scratch can therefore escape the specified comparison. The design also excludes review_scratch directories, but AC-02 rejects “any change” to file contents, ignored files included, without that exception. I cannot execute Git mutation fixtures; the written snapshot and criterion define different preservation boundaries.
PROPOSAL: Compare the ignored-file inventory before and after dispatch so additions outside permitted scratch paths also reject storage. State the scratch exception consistently in AC-02 and test both permitted scratch output and creation of a new ignored file outside it.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan / AC-04
EVIDENCE: Design says “A failed rung blocks all three” and permits an owner allowance only for a rung that could not run. AC-04 preserves that distinction. Its Test Plan instead says “a failing command and an unavailable procedure must each leave no push, no completion commit and no delivered report, unless the owner allowance is recorded for that rung”, allowing the exception to cover an observed failure too. Stackweaver CLAUDE.md requires verification before pushing, and agents/ship.md prohibits shipping over a known failure.
PROPOSAL: Split the failure and unavailable-procedure cases. Require an observed failure to block publication and completion even with an allowance, and test the allowance only for the explicitly authorized unavailable rung.

### R-6

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design / External command route; AC-02
EVIDENCE: docs/specs/shared-development-loop.md:248-254 hashes only modified, untracked and ignored files. A tracked file already marked assume-unchanged can be overwritten without entering those inventories, while its index flags, blob identity and refs remain unchanged. Comparing index flags does not establish that the working file's contents were preserved. AC-02 nevertheless requires rejecting any file-content change outside review_scratch. I cannot run Git or vh-adlc to execute this mutation fixture.
PROPOSAL: Fingerprint tracked working files independently of status, including files with assume-unchanged or skip-worktree flags. Add a fixture with a pre-existing flag whose file is overwritten without changing that flag.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design / covers globs; Test Plan / AC-06
EVIDENCE: Design says an uncommitted covered change "makes reviews stale ... exactly as a plain entry does". internal/fresh/fresh.go:165-184 determines review staleness from committed diffs; lines 198-218 inspect dirty paths separately and affect only FeatureTree.Clean. A dirty covered file alone does not stale either review. I cannot run Git or vh-adlc; this distinction is established by reading the evaluator.
PROPOSAL: Specify committed drift making the applicable review stale and uncommitted changes making feature_tree_clean false. Separate those proof cases and retain the existing freshness behavior for plain entries.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design / Order, step 2
EVIDENCE: Step 2 assigns checking asset digests against signed checksums.txt to scripts/ensure-vh-adlc.sh. plugins/vh-adlc/scripts/ensure-vh-adlc.sh:45-61 reads expected digests from the plugin lock, and lines 117-126 compare the downloaded archive and binary with those digests. The script neither retrieves checksums.txt and its signature nor verifies a signing key; it also selects only the current platform. Running it cannot establish the stated signed-release verification.
PROPOSAL: Define a separate procedure that verifies checksums.txt against an independently pinned signing key and checks every release archive before constructing the lock. Use ensure-vh-adlc.sh afterwards to verify installation against that lock.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter / covers
EVIDENCE: The release inventory and AC-12 depend directly on .goreleaser.yml, .github/workflows/ci.yml and .github/workflows/release.yml, while Order step 2 depends on plugins/vh-adlc/scripts/ensure-vh-adlc.sh. None appears in covers. The pinned conventions/feature-documents.md requires covering every path whose change can affect the feature, and internal/fresh/fresh.go:186-195 excludes uncovered paths from review-freshness comparisons.
PROPOSAL: Add these release and verification inputs to covers, together with the marketplace manifests named as publication inputs. Ensure changes to those inputs invalidate the corresponding reviewed release proof.

## Sources

- [Feature-document standard at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/feature-documents.md): sections, rules block, criterion and review formats, acceptance.
- [Feature-document template at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/guides/feature-document-template.md): document layout.
- [Delivery convention at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/delivery.md): claim commit, no squash for feature PRs, skip-CI scope, delivered after every release path publishes.
- [Documentation convention at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/documentation.md): prose and document rules.
- [Humanize prose guide at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/guides/humanize-prose.md): prose editing for this document.
