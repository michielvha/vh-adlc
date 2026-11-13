---
status: in-progress
status_description: "Claimed on feat/shared-development-loop; implementing T1 onward in the vh-adlc-shared-development-loop worktree."
issue: https://github.com/michielvha/vh-adlc/issues/78
branch: feat/shared-development-loop
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
  - plugins/vh-adlc/scripts/loop/
  - plugins/vh-adlc/scripts/triage/owned-process.ts
  - plugins/vh-adlc/references/loop-settings.md
  - cmd/vh-adlc/
  - docs/reference/cli.md
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

Stackweaver still runs its own spec-driven loop (`agents/spec.md`, `tasks.md`, `implement.md`,
`ship.md`, `investigate.md`, `reviewer.md`), while triage, maintenance, audit, docs impact and SEO
already run through vh-adlc. This feature moves the rest, roadmap row D-05, without losing a native
capability. A comparison of about 120 behaviors found vh-adlc stronger in several places (independent
implementation review, binary-checked gates, claim commits, handoff, resume) and found 21 conflicts and
9 missing hooks, which the design resolves.

The shared side gains: per-role model routing in a committed `.vh-adlc/loop.yaml`; a generic external
command route for the two reviewer roles, so a Claude session gets a `gpt-6.1-sol` review through the
Copilot CLI that is stored and checked like any other (file-only spec reviews read a read-only export of
the exact commit; implementation reviews get shell, guarded by a before-and-after check of refs, index
and files); a project procedure and declared review lenses read by every SDD operation; verification
rungs by path that must pass before push, completion and delivery; manual-CI reporting, a post-merge
watch, and consumer skip-CI paths; claims from a host worktree plus an opt-in rule that keeps implement
out of the primary checkout; `**` in `covers`; and investigation defaults.

Stackweaver adopts it through thin adapters, `loop.yaml` and `agents/loop-project.md`, behind a parity map
that fails if a legacy rule has no home. Each command routes per document: enrolled specs go to vh-adlc,
others to the native agents, which retire only once no non-terminal spec is unenrolled. Draft specs move
now; planned, in-progress and parked specs finish natively unless the owner moves one. Feature PRs land
by merge commit. `/implement` keeps handing straight to ship under a written grant, and small fixes keep
shipping through Stackweaver's own `/ship`. The live slot pass, kind runs for named E2E specs and the
final full kind run stay binding.

Delivery follows an Order list after completion, as `host-cleanup.md` does: release, lock PR, marketplace
install, then Stackweaver's adoption PR. Rollback is rehearsed on a disposable checkout.

A revision after the first acceptance only adds the code paths the design needs to `covers`
(`plugins/vh-adlc/scripts/loop/`, `scripts/triage/owned-process.ts`, `references/loop-settings.md`,
`cmd/vh-adlc/`, `docs/reference/cli.md`) and names them in Design; scope and criteria are unchanged.

Validation so far is spec review only, nothing executed: thirteen `gpt-6.1-sol` passes. R-13 has no
blocking findings; its two should-fix items (findings saved against an existing issue, and reviewer
helper processes that outlive the review) are folded in, and R-14 has no blocking findings either. Accepting authorizes implementation of
this scope on a feature branch. Publishing releases, merging either repository and retiring the native
agents each need separate approval.

### Acceptance notes

The owner accepted this document on 2026-11-13 at R-14 (`d367673`), on the condition that the move to
vh-adlc loses nothing useful from the native loop. The parity map (AC-08) and the retained local rules
(AC-10) are how implementation proves that condition; a legacy behavior with no home fails AC-08.

R-14's two should-fix items stay within the accepted design and go into the task list: a claim made in
a worktree on another branch name requires that branch to be the session's own or handed over, never an
unrelated branch (`references/authority.md:80-86` already forbids repointing one); and the reviewer
process wrapper confirms that no member of the process group is still alive before the final check,
because `owned-process.ts` reports `reaped` from the parent alone. Both get fixtures under AC-02 and
AC-13. R-15, after the covers revision, adds two more of the same kind: the export check refuses to
read through a committed symlink that escapes the export, and process cleanup also stops helpers that
detached into their own process group or session, so none can write after the final check. Both get
AC-02 fixtures.

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
Plan row. `vh-adlc find --slug` does locate Stackweaver specs in category subfolders. 58 plan documents
under `docs/internal/plans/` carry a non-terminal status (12 draft, 15 planned, 28 in-progress, 3
parked; 55 without the parked ones) and 48 have a Review Log (`git grep -l` at `7861b9dc`).

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

### Glossary

| Term | Meaning |
| --- | --- |
| Loop role | One of `author`, `implementer`, `spec_reviewer` and `implementation_reviewer`; each has a route in `loop.yaml`. |
| Route | How a role runs: `host` (in the current harness, optionally with a named model) or `command` (an external CLI, reviewer roles only). |
| Enrolled spec | A spec whose Review Log uses the shared header; adapted commands send it to the vh-adlc operations. |
| Verification rung | A declared check with a path condition or `always`, which must pass before push, completion and delivery. |
| Project procedure | The consumer's file of local rules that every SDD operation reads, named in `loop.yaml`. |
| Primary worktree | The first entry of `git worktree list`; with `implement_worktree: isolated`, implement never writes there. |
| No publication path | The delivery verdict for a merge commit that carries the skip marker and touches only skip-eligible paths. |
| Delivered | A feature whose release paths have all published, or whose merge has no publication path. |

### Comparison baseline

Two read-only comparison passes over Stackweaver (labelled `20e38a94` in their output; `7861b9dc`
changes only the model lines, which the parity document flags) and vh-adlc `a7bfca99` (plugin 0.16.1,
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
for each role. Following the layout the other operations use, its reference is
`plugins/vh-adlc/references/loop-settings.md`, the shared code that reads it and runs routes, rungs and
delivery checks lives in `plugins/vh-adlc/scripts/loop/`, and any binary support for the new settings
kind goes through `cmd/vh-adlc/` and is documented in `docs/reference/cli.md`:

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
         --allow-all-tools, --no-ask-user, --no-custom-instructions, --disable-builtin-mcps,
         --add-dir, "{export_dir}", -p, "{prompt}"]
implementation_reviewer:
  route: command
  model: gpt-6.1-sol
  argv: [/home/linuxbrew/.linuxbrew/bin/copilot, --model, "{model}", --available-tools, view, glob, shell,
         --allow-all-tools, --no-ask-user, --no-custom-instructions, --disable-builtin-mcps,
         -p, "{prompt}"]
```

The operation writes the canonical reviewer instructions, document path, exact commit, kind, docs
revision, binary path and plugin pin into a prompt file and reads the reply. It runs the command as one
owned process group through the existing runner in `plugins/vh-adlc/scripts/triage/owned-process.ts`,
which signals the whole group after the parent exits, so no helper outlives the review. The group is
terminated and reaped before the final preservation check and before any record is stored; if cleanup
fails, the review stays pending. An implementation review
runs the command from the owning worktree, with no worktree creation. A file-only spec review runs it
from the export described below, so the CLI discovers no instruction files in the live checkout. The route is generic: `argv` is any command with
placeholders, so Copilot, Codex or another CLI needs only settings. `{export_dir}` is the read-only
export of the target commit, `{model}` is the role's model,
`{prompt}` is the whole prompt text as one argument (what Copilot's `-p` takes), and `{prompt_file}` is
the path of the same text for a CLI that reads files. The reply opens with `MODEL:` and then
`TARGET: <commit>`; the operation checks that `TARGET` equals the commit it dispatched, which proves the
reviewer received the dispatch identity, and strips both header lines before storing the records. A
command that is not given a read-only tool restriction is recorded with `procedural` isolation.

A spec review reads only, so its route may stay file-only. It does not read the live worktree: the
operation exports the target commit with `git archive <commit>` into a fresh read-only directory and
points the reviewer there, launching the command from that directory with the CLI's automatic
instruction loading turned off (Copilot's `--no-custom-instructions`, as the existing
`tests/vh-adlc/triage/copilot-trial.ts:8` already does), so uncommitted edits, to instruction files or
anything else, cannot shape a review recorded against that commit. Any other repository the review needs is exported the same way at
a named commit. An implementation review must observe the
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
stops without changing the document, any local branch, `HEAD`, the index or the worktree. The fetch the
loop requires beforehand may still update remote-tracking refs and `FETCH_HEAD`. A rejected push happens after the claim commit exists: as the
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

Feature PRs land by merge commit or fast-forward, as the delivery convention allows. When a repository
declares verification rungs or a post-merge watch, feature PRs land by merge commit only, because the
final delivery check reads the merge commit against its first parent, and a fast-forward of several
commits would leave earlier feature commits outside that range. Stackweaver declares both. Follow-ups on a
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
changed-path glob or always. Rungs do not depend on classifying criteria, so none can be skipped by a
missing classification. A path condition is evaluated over the whole feature
delta: the feature branch against its merge base with the default branch, plus uncommitted changes the
feature owns. A passing result counts only for the exact commit it ran on, so a new commit needs the
rung again. After the merge, the final check before the feature is reported delivered evaluates the
actual merge commit against its first parent, which is the feature's change as it landed, and the
rungs that apply there must pass at the merge commit. Implement and ship run every rung whose condition holds
and report each as passed, failed or not run with a reason. Every applicable rung must pass before the feature
branch is pushed, and again before the feature is marked complete or reported delivered, matching
Stackweaver's rules to verify fully before any push (Stackweaver `CLAUDE.md:153`) and never to ship over
a known failure (`agents/ship.md:136-137`). A failed rung blocks all three. A rung that could not run
blocks them too, unless the owner allows that exact rung for that run, which the report records. A
rung's exit status alone does not make it pass: a rung may declare how its output reports skipped
subchecks, and a skipped mandatory subcheck counts as a subcheck that could not run, under the same
owner-allowance rule. Stackweaver's `make verify` prints a `skipped` count and the skipped names
(`scripts/verify-local.sh:475-477`), and can exit 0 with skips when a tool is missing, so its rung
passes only with no skipped mandatory subcheck. Stackweaver declares `make verify` always,
`make test-integration` for `backend/` and `core/`, the kind harness for `e2e/`, `deploy/` and
`frontend/nginx.conf`, a browser pass with the summary table for `frontend/src/`, and both engines for
the engine-sensitive paths its project procedure lists. Path conditions decide only which extra rungs
apply: every E2E spec a criterion's Test Plan row names also runs in the kind harness before push and
before completion, whatever paths changed, as `agents/implement.md:61-66` and Stackweaver
`CLAUDE.md:184` require today. Two more Stackweaver rules stay binding the same way: a live runtime
pass on the feature's worktree slot for any change with runtime behavior (`backend/`, `core/`,
`frontend/src/`, `deploy/`), as `agents/implement.md:61-66` requires, and, whenever any kind rung
applied, one full detached kind run on the final feature head; targeted reruns may be used to iterate
but never replace it (`CLAUDE.md:184`). Stackweaver's project procedure states these rules and the
parity map binds each to a contract test. Without rungs, the current
behavior stays: read commands from `AGENTS.md`, ask if none.

A declared `ci_trigger: manual` makes ship report CI as not triggered by policy instead of waiting for
a run or suggesting a dispatch. A declared `post_merge_watch` command (Stackweaver:
`scripts/release/watch-merge.sh <merge-sha>`) must exit 0 before a feature whose merge can publish is
reported delivered, matching the delivery convention's rule that a feature is delivered once every
release path has published. Publication is decided by the merge commit itself, since Stackweaver's tag
workflow runs on every unmarked push to `main` that passes its path filters and `watch-merge.sh:143`
reads the merge commit's own message.
When a delivery qualifies for the skip marker, the authorized merge uses a merge commit message that
carries it. After the merge, ship reads the actual merge commit: if its message carries the marker and
its diff against the first parent touches only skip-eligible paths, the feature is reported delivered
with the reason "no publication path" and the watch is not run. Every merge commit without the marker runs the watch like any publishing merge,
since a run can appear some time after the push (`watch-merge.sh:29-30,78-88`). An unmarked merge can
still trigger nothing, because Stackweaver's tag workflow path-ignores Markdown and `docs/`
(`.github/workflows/tag.yml:9-18`) and `watch-merge.sh:188-191` then fails when no sync follows. When
the watch fails for that reason alone, ship reports the feature blocked with that reason and the merge
commit, and the owner confirms delivery by hand; ship never reports it delivered by itself.

### Skip-CI paths

A consumer may declare `skip_ci_paths` in `loop.yaml`. A feature delivery then carries the skip marker
when its commit, outgoing push range and PR diff change only feature documents, Markdown onboarding
files or declared paths; any other change still runs normal CI. Stackweaver declares its tooling paths
(`agents/`, `.claude/`, `.githooks/`, dev-only `scripts/`, `CLAUDE.md`), and never code, `deploy/`,
workflows, dependency manifests or public `docs/`. The pinned delivery convention forbids this today
(`conventions/delivery.md:90-94`), so the shared change starts with a revision of that page in
vhco-pro/docs and a plugin pin bump. A repository's own docs pin takes precedence over the plugin's
(`pin()` at `internal/knowledge/knowledge.go:159`), so `skip_ci_paths` takes effect only when the resolved
delivery convention supports it. Otherwise ship applies the convention's documentation-only rule,
reports that the setting was ignored, and names the pin update that would enable it. Stackweaver has no
docs pin of its own, so it follows the plugin pin.

### Investigation defaults

A `findings_document: always` setting makes invoking investigate the request to write the document,
in the consumer's declared analysis home. Investigate also searches existing analysis documents and
open issues for duplicates before writing, and when an analysis document already covers the case it extends that
document instead of creating a second one. An existing issue never holds the only copy of the findings:
investigate writes or extends the analysis document and, where it has authority to touch the issue,
adds only a summary and a link to it (Stackweaver `CLAUDE.md:295-299`), states that conclusions come from primary sources read in
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

Stackweaver's adapters forward each command to the installed operation with `loop.yaml`, and
Stackweaver's `AGENTS.md`, which today sends plain-language loop requests straight to `agents/spec.md`,
`tasks.md`, `implement.md` and `ship.md` (`AGENTS.md:29-34`), routes them through the same
enrollment-aware dispatch as the slash commands. The adapters also keep the
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
`docs/internal/plans/` (12 at `7861b9dc`, 13 at `02716503`; the adoption branch recounts at its own
head) move to the shared format in one migration. The 43 planned or
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
- [ ] AC-02: From a Claude Code session, a file-only spec review that reads only a read-only export of the target commit and a shell-enabled implementation review run through declared command routes on `gpt-6.1-sol` against an exact commit; the implementation review can return `met` from checks it ran; a matching reply with the dispatched `TARGET` is stored verbatim and passes `review check`; and a mismatched model or target, a missing header, a non-zero exit, a timeout, a failed process cleanup or any change outside the declared `review_scratch` directories to the worktree's `HEAD`, index entries, refs, status, file contents or ignored-file list leaves the review pending with no Review Log row.
- [ ] AC-03: Every SDD operation reads the declared project procedure and instruction files, and a spec review flags a document that contradicts a declared instruction file or lens.
- [ ] AC-04: Implement and ship run each declared verification rung whose path condition holds over the whole feature delta, or that is declared always, and report every rung as passed, failed or not run with a reason; a failed rung, or one that could not run without the owner allowing it for that run, means the feature branch is not pushed and the feature is not complete or delivered; with no rungs declared they keep the current command lookup.
- [ ] AC-05: With `ci_trigger: manual`, ship reports CI as not triggered by policy and dispatches nothing; with a `post_merge_watch` declared, a feature whose merge can publish is reported delivered only after that command exits 0, a feature whose actual merge commit carries the skip marker and touches only skip-eligible paths is reported delivered with no publication path and no watch run, every unmarked merge commit runs the watch, and a watch that fails only because no workflow ran leaves the feature reported blocked, not delivered.
- [ ] AC-06: Feature-document lint accepts `covers` entries containing `**`, they match the same paths as the docs-impact matcher, and under such an entry a committed change makes the applicable review stale while an uncommitted change makes `feature_tree_clean` false, as for a plain entry.
- [ ] AC-07: With `findings_document: always`, investigate writes its findings document, or extends the existing analysis document that already covers the case without creating a second one, never leaves an issue holding the only copy of its findings, reports any duplicate analysis document or open issue it found, and ends with one of the three verdicts.
- [ ] AC-08: Stackweaver's `/spec`, `/spec review`, `/tasks`, `/implement`, `/ship` for features and `/investigate` and the matching plain-language requests through `AGENTS.md` run the installed vh-adlc operations with Stackweaver's settings for every enrolled spec and, until the native agents retire, the native agents for every unenrolled one (after retirement, AC-17's refusal applies to terminal unenrolled documents), new specs are written enrolled, and every row of the committed parity map passes its contract test.
- [ ] AC-09: Every Stackweaver spec in the migration set (the draft specs, plus each planned, in-progress or parked spec the owner moved) passes `vh-adlc lint`, its gate results agree with a manual reading of the document, and each moved spec that was planned or in progress carries a fresh review and an owner acceptance row at its converted baseline.
- [ ] AC-10: Stackweaver's local behaviors stay available with unchanged invocation: worktree slots, direct-to-main non-feature shipping through its own `/ship`, `[skip ci]` rules, `watch-merge.sh`, the triad and satellite lenses, the browser-pass summary table, and `/implement` handing straight to ship.
- [ ] AC-11: A disposable Stackweaver checkout rolls back to the native loop and reapplies the adoption, with the docs index and unrelated workflow files byte-identical afterwards.
- [ ] AC-12: On the feature branch, a GoReleaser snapshot build produces all four runtime archives, the plugin's `knowledge.md` pin names the merged vhco-pro/docs revision, and a candidate plugin installed from the branch in an isolated profile runs every adapted Stackweaver command through its entry points.
- [ ] AC-13: Implement claims a planned feature from a clean worktree whose `HEAD` is the fetched default branch tip, detached or on another branch name, pushes the claim to the default branch and continues in that worktree on the feature branch; with stray changes or a stale tip it stops before writing anything, and when the push is rejected it keeps the local claim commit, creates no feature branch and reports the claim pending.
- [ ] AC-14: A Stackweaver feature taken through the adopted loop passes its completion gate in its owning worktree before merge, and after it lands by merge commit every commit its Review Log names is reachable from `main`.
- [ ] AC-15: With `skip_ci_paths` declared and a resolved delivery convention that supports it, a feature delivery whose commit, push range and PR diff touch only feature documents, Markdown onboarding files or declared paths carries the skip marker, and any other change in the delivery leaves it off; when the resolved convention does not support it, the marker follows the documentation-only rule and the report says the setting was ignored and why.
- [ ] AC-16: In Stackweaver, `/spec review` never moves an enrolled spec to `planned` without an owner acceptance row, and `/spec` and `/investigate` create no issue without an explicit request or accepted scope.
- [ ] AC-17: Stackweaver's native spec, tasks, implement and reviewer agent files stay routable while any non-terminal spec, domain-extension plans included, is unenrolled, are retired only after none is, and after retirement an adapted command given a terminal unenrolled document refuses without running anything.
- [ ] AC-18: With `implement_worktree: isolated`, implement started in the primary worktree continues in a host-created isolated worktree, or stops before writing on a host without a worktree tool, and the primary worktree's branch, `HEAD`, index and files are unchanged afterwards; without the setting, behavior is unchanged.
- [ ] AC-19: The settings reference, the operation reports and Stackweaver's adapters and project procedure use each glossary term with the meaning the Glossary gives it, and introduce no other name for those concepts.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc` cases for each supported role and route pair, refusal of a `command` route for `author` and `implementer`, resume taking the continued operation's route, a no-file case compared with `a7bfca99` behavior, and a grep test that fails on a model name in any agent or skill file. |
| AC-02 | A fixture where an uncommitted edit to an instruction file in the worktree contradicts the committed spec, and the file-only review must still see only the committed content (the export, not the worktree); in the real-route run, live startup instruction files (`AGENTS.md`, `.github/copilot-instructions.md`) changed before dispatch must not appear in the review or steer it; a fixture repository with a stub command that returns a matching reply, a wrong model, a wrong `TARGET`, no header, exit 1, a hang, one that touches a clean file, one that rewrites an already modified or untracked file without changing its status line, one that creates or moves a non-current branch or tag, one that exits successfully and one that times out while each leaves a helper running that would later write to the checkout (the helper is reaped first and the checkout stays unchanged), one that overwrites an existing ignored configuration file, one that creates a new ignored file outside `review_scratch`, one that overwrites a tracked file already flagged assume-unchanged without changing the flag, one that writes only inside `review_scratch` (stored), and one that changes an index flag without changing the index tree; then one real Copilot CLI `gpt-6.1-sol` spec review and one implementation review on a disposable feature where the reviewer runs the tests and returns `met`, with transcripts and the stored records kept as evidence. |
| AC-03 | Fixture specs that break a declared instruction and a declared lens; the reviewer must return a finding for each and none for a compliant control. |
| AC-04 | Fixture changes that match some rungs and not others; a feature whose first commit changes `backend/` and whose last changes only documentation must still require the integration rung before push and completion; a pass recorded on an earlier commit must not count for a later one; after a merge, the delivery check over the merge commit against its first parent must still require the `backend/` rung once the default branch contains the feature; with rungs declared, a fast-forward landing of a feature whose earlier commit changed `backend/` must be refused; in Stackweaver, a backend-only feature whose Test Plan names an unchanged E2E spec must not push or complete until that spec has passed in the kind harness, a runtime change must not advance without its live slot pass, targeted kind reruns must not stand in for the final full run, and a `make verify` run that exits 0 with a skipped mandatory subcheck must stop advancement unless the owner allowance names that subcheck; the report must list every rung with the right state; a failing command must leave no push, no completion commit and no delivered report even when an owner allowance is recorded; an unavailable procedure must do the same unless the owner allowance is recorded for that exact rung, and with it must proceed; a no-rung fixture must keep the current lookup. |
| AC-05 | Ship fixtures with `ci_trigger: manual` (no dispatch call made, state reported), a watch stub that exits 1 then 0 (delivered only after 0), a skip-eligible feature merged with a marked merge commit (delivered with no publication path, watch never invoked), the same feature merged with an unmarked merge commit (watch invoked); a watch stub that fails because no workflow ran (reported blocked, never delivered); and a run that appears only after a delay (watch waits, no early verdict). |
| AC-06 | Go tests in `internal/doc` for `**` at start, middle and end, compared with the docs-impact matcher on the same inputs; `internal/fresh` tests where a commit under a `**` entry makes the review stale, and separately a dirty file under it makes `feature_tree_clean` false without staling the review; the existing lint suite unchanged. |
| AC-07 | Investigate fixtures with and without a duplicate analysis document and a duplicate open issue; without one the run writes a new document; with a covering document the run extends it and the document count stays the same; with an existing issue and no covering document the findings land in a new analysis document, no second issue is created, and any issue update is a summary with a link; every run names any duplicate and the verdict. |
| AC-08 | Stackweaver parity contract tests; one real run of each adapted command on a disposable enrolled feature, checking the operation reached and the settings read; and, before retirement, the same commands on a disposable unenrolled spec, which must reach the native agents through a native re-review and completion; each case repeated as a plain-language request routed through `AGENTS.md`. Post-retirement refusal is tested under AC-17. |
| AC-09 | `vh-adlc lint` and `vh-adlc gate` over the migration set, a manual reading of every migrated spec that records the expected and observed result of each gate condition at its converted baseline, and for each moved planned or in-progress spec an inspection of its Review Log for a post-conversion review and acceptance row. |
| AC-10 | A scripted check that each listed local behavior's entry point still exists and runs in dry-run or help mode, and a review of `agents/loop-project.md` against the parity map. |
| AC-11 | The rollback and reapply procedure on a disposable checkout, comparing file hashes before and after. |
| AC-12 | `goreleaser release --snapshot --clean` at the feature head listing four archives; the `knowledge.md` pin compared with the merged vhco-pro/docs commit; an isolated Claude Code profile with the candidate plugin installed from the branch and the candidate binary, running each adapted command on a disposable Stackweaver checkout. The post-merge Order steps are recorded in `status_description`, not here. |
| AC-13 | Fixture repositories with a detached worktree at the tip and a worktree on another branch at the tip (both claim); one behind a remote that the fixture advances and one with a stray change (both leave the document, local branches, `HEAD`, index and worktree unchanged, while remote-tracking refs may move); and a rejected push (one local claim commit, no feature branch, a pending report). |
| AC-14 | One disposable Stackweaver feature taken from claim to merge: `vh-adlc gate complete` passes in the owning worktree before the PR merges, then `git merge-base --is-ancestor <commit> origin/main` holds for every Review Log commit after a merge-commit landing. |
| AC-15 | Ship fixtures whose delivery touches only declared paths, declared paths plus code, and declared paths with an earlier code commit in the push range; only the first carries the marker. A fixture whose repository pin names a delivery convention without skip paths: the declared-path delivery gets no marker and the report names the ignored setting and the pin update. |
| AC-16 | Stackweaver parity contract tests for the acceptance and issue rules, plus a disposable spec review run that ends with the spec still `draft` until an acceptance row exists. |
| AC-17 | A scripted check over `docs/internal/plans/` that lists every non-terminal unenrolled spec, domain-extension plans included; while the list is non-empty the native command routes must resolve and the retirement commit is refused; after retirement, each adapted command and its plain-language form given a terminal unenrolled document must refuse with no write. |
| AC-18 | Fixtures with the setting on and off; a Claude Code run of the adopted Stackweaver `/implement` started on a clean main checkout, comparing that checkout's branch, `HEAD`, `git write-tree` and file hashes before and after while the feature proceeds in the host worktree; a host without a worktree tool must stop before any write. |
| AC-19 | A test that greps the plugin's settings reference, report templates and Stackweaver's adapters and project procedure for each glossary term and a list of rejected synonyms, plus a reviewer read of those files against the Glossary. |

## Tasks

Shared vh-adlc work, on the feature branch:

- [x] T1 `tests/vh-adlc/loop/settings.test.ts` - failing tests for `.vh-adlc/loop.yaml`: a route per role, `command` refused for `author` and `implementer`, resume taking the continued operation's route, the per-user override limited to `argv[0]`, and no file meaning today's behavior; fails because no reader exists (AC-01)
      Evidence: `bun test tests/vh-adlc/loop/settings.test.ts` on the feature branch fails with `Cannot find module '../../../plugins/vh-adlc/scripts/loop/settings'`, the reader T3 adds.
- [x] T3 `plugins/vh-adlc/scripts/loop/settings.ts`, `plugins/vh-adlc/references/loop-settings.md`, `plugins/vh-adlc/plugin.json`, `plugins/vh-adlc/.claude-plugin/plugin.json` - the TypeScript reader and the settings reference, using the Glossary terms, with the plugin minor version bump that `tests/vh-adlc/check.test.ts` requires of the first package change on a branch; T1 passes (AC-01, AC-19)
      Evidence: `bun test tests/vh-adlc/loop/settings.test.ts` 18 pass; full `bun test tests/vh-adlc --timeout 60000` at this tree 1469 pass, 2 fail: the version check (fixed by this commit's bump to 0.17.0) and `fixtures.test.ts`, which this host fails because `/usr/local/bin/vh-adlc` reports 0.19.0 with a digest that does not match the lock, unrelated to the change.
- [x] T4 `tests/vh-adlc/loop/model-free.test.ts` - a guard that fails on any model name in an agent or skill file; passes on the current tree and fails on a planted name (AC-01)
      Evidence: `bun test tests/vh-adlc/loop/model-free.test.ts` 2 pass: no agent or skill file names a model, and the guard flags a planted `model: opus` frontmatter line and a planted `gpt-6.1-sol` mention.
- [x] T5 `tests/vh-adlc/loop/review-route.test.ts` - failing stub-command fixtures: matching reply, wrong model, wrong `TARGET`, no header, exit 1, hang, a touched clean file, a status-preserving rewrite, a moved ref, an overwritten and a new ignored file, an index flag change, an overwritten assume-unchanged file, a `review_scratch` write (stored), a helper left running after success and after timeout, a detached helper, a cleanup failure, a committed symlink escaping the export, and an uncommitted instruction edit (AC-02)
      Evidence: `bun test tests/vh-adlc/loop/review-route.test.ts` fails with `Cannot find module '../../../plugins/vh-adlc/scripts/loop/review-route'`, the route T7 adds.
- [x] T6 `plugins/vh-adlc/scripts/triage/owned-process.ts` - cleanup tells failed signalling from an absent group, confirms no live member remains, and also stops descendants that detached into their own group or session; the existing triage tests and new cleanup fixtures pass (AC-02)
      Evidence: `bun test tests/vh-adlc/loop/owned-process.test.ts` 4 pass (a helper that detached with setsid after reporting it left the group is stopped; a timed-out client's helper is stopped; an absent group records ESRCH, not a failed signal); `bun test --timeout 60000 tests/vh-adlc/triage/owned-process.test.ts tests/vh-adlc/maintenance/recovery-trial.test.ts` 3 pass. A mutation that disables the marker scan makes the detached-helper fixture fail (Expected false, Received true).
- [x] T7 `plugins/vh-adlc/scripts/loop/review-route.ts` - the command route: `git archive` export with symlink containment, launch from the export with automatic instructions off, the `{model}`, `{prompt}`, `{prompt_file}` and `{export_dir}` placeholders, `MODEL:` and `TARGET:` checks, the before-and-after preservation snapshot and owned-process cleanup; T5 passes (AC-02)
      Evidence: `bun test tests/vh-adlc/loop/` 49 pass, including all 25 review-route fixtures. Ignored directories are compared by a path, size and modification-time manifest of their files rather than by hashing each file; ignored files directly listed are content-hashed. Index flags are read with `git ls-files --stage -v` and optional locks off, so Git's own stat refresh cannot raise a false change.
- [x] T8 `plugins/vh-adlc/references/review-protocol.md`, `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md`, `plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md`, `plugins/vh-adlc/skills/vh-adlc-review/SKILL.md` - dispatch by role route, the `TARGET:` header and pending rules; `bun test tests/vh-adlc` passes, including direct-operation compatibility (AC-01, AC-02)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/loop/ tests/vh-adlc/check.test.ts tests/vh-adlc/native-review.test.ts tests/vh-adlc/feature-native-review.test.ts` 146 pass. Beyond the four named files, the dispatch needed `scripts/loop/cli.ts` (route and review entry, tested in `tests/vh-adlc/loop/cli.test.ts`), `review_scratch` in the settings reader and reference, and a carve-out in `direct-operation-compatibility.test.ts` that cuts the new `## Loop routes` section and checks its phrases, so the rest of each frozen skill body stays byte-identical.
- [x] T9 `tests/vh-adlc/loop/lenses.test.ts` - failing fixtures: a spec that breaks a declared instruction file, one that breaks a declared lens, and a compliant control (AC-03)
      Evidence: `bun test tests/vh-adlc/loop/lenses.test.ts` fails with `Cannot find module '../../../plugins/vh-adlc/scripts/loop/procedure'`, which T10 adds. The deterministic fixtures prove the lenses and instruction files reach the reviewer; whether a real reviewer flags a violation is observed in the T34 evidence.
- [x] T10 `plugins/vh-adlc/scripts/loop/procedure.ts`, `plugins/vh-adlc/references/loop.md`, the seven SDD `SKILL.md` files - every SDD operation reads the project procedure, instruction files and lenses, and the reviewer receives them as lenses; T9 passes (AC-03)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/ tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/check.test.ts tests/vh-adlc/native-review.test.ts tests/vh-adlc/feature-native-review.test.ts tests/vh-adlc/lifecycle.test.ts tests/vh-adlc/lifecycle-boundaries.test.ts tests/vh-adlc/settings-references.test.ts` 206 pass, including T9's lens fixtures: the settings parse the procedure, instruction files and lenses, the reviewer prompt carries them, and a stub reviewer that only flags what reaches it returns a finding for a lens-breaking spec and none for a compliant one. The freeze test now requires a `## Loop routes` section in all seven SDD skills and keeps each body byte-identical outside it. Also touched: `scripts/loop/settings.ts`, `scripts/loop/cli.ts` (`context` command and prompt), the reviewer agent and `references/loop-settings.md`.
- [ ] T11 `tests/vh-adlc/loop/rungs.test.ts` - failing fixtures: path rungs over the whole feature delta (a `backend/` commit followed by a docs-only commit), an always rung, a failed rung blocking push, completion and delivery even with an allowance, an unavailable rung with and without its allowance, an exit-0 run reporting a skipped mandatory subcheck, an earlier pass not counting for a later commit, the merge-commit first-parent check, a refused fast-forward, and an unchanged no-rung lookup (AC-04)
- [ ] T12 `plugins/vh-adlc/scripts/loop/rungs.ts`, `plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md`, `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md` - the rung runner and its gating of push, completion and delivery; T11 passes (AC-04)
- [ ] T13 `tests/vh-adlc/loop/delivery.test.ts` - failing ship fixtures: `ci_trigger: manual` with no dispatch, a watch that exits 1 then 0, a marked merge with no publication path, an unmarked merge that runs the watch, a watch failing because nothing ran (blocked), a delayed run; skip paths with declared paths only, with code, with an earlier code commit, and under a repository pin without skip-path support (AC-05, AC-15)
- [ ] T14 vhco-pro/docs `conventions/delivery.md` - a consumer may declare extra skip-eligible paths for feature deliveries; merged in vhco-pro/docs, with its commit recorded here (AC-15)
- [ ] T15 `plugins/vh-adlc/knowledge.md` - the plugin pin moves to the T14 commit; `vh-adlc knowledge` resolves every loop page at it (AC-12, AC-15)
- [ ] T16 `plugins/vh-adlc/scripts/loop/delivery.ts`, `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md` - CI policy reporting, the merge-commit publication verdict, watch handling and skip paths that respect the resolved pin; T13 passes (AC-05, AC-15)
- [ ] T17 `internal/doc/doc_test.go`, `internal/fresh/fresh_test.go` - failing cases for `**` at start, middle and end compared with the docs-impact matcher, a committed change under `**` staling the review, and a dirty file under it clearing `feature_tree_clean` without staling (AC-06)
- [ ] T18 `internal/doc/covers.go`, `internal/doc/lint.go` - `**` support with the docs-impact semantics; T17 and `go test ./...` pass (AC-06)
- [ ] T19 `tests/vh-adlc/loop/investigate.test.ts` - failing fixtures with and without a covering analysis document and an open issue, including an issue with no covering document (AC-07)
- [ ] T20 `plugins/vh-adlc/skills/vh-adlc-investigate/SKILL.md` - `findings_document: always`, the duplicate search, extending an existing analysis, issue updates as summary and link only, and the three verdicts; T19 passes (AC-07)
- [ ] T21 `tests/vh-adlc/loop/claim.test.ts` - failing fixtures: a detached worktree at the tip, the session's own branch at the tip, an unrelated branch at the tip (refused, branch unmoved), a worktree behind an advanced remote, a stray change, a rejected push left pending, and `implement_worktree: isolated` from the primary worktree with and without a host worktree tool (AC-13, AC-18)
- [ ] T22 `plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md`, `plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md`, `plugins/vh-adlc/references/authority.md` - claims from a host worktree with the branch-ownership check, and host-delegated isolation; T21 passes (AC-13, AC-18)
- [ ] T23 `tests/vh-adlc/loop/glossary.test.ts` - glossary terms and rejected synonyms checked across `references/loop-settings.md`, the loop references and report templates (AC-19)
- [ ] T24 `docs/specs/shared-development-loop.md` - final local verification at the feature head: `bun test tests/vh-adlc --timeout 60000`, `go test ./...`, `go vet ./...`, `golangci-lint run`, `go mod tidy -diff` and a four-archive `goreleaser release --snapshot --clean` all pass, recorded as evidence (AC-12)

Stackweaver adoption, on a Stackweaver feature branch against the candidate plugin:

- [ ] T25 Stackweaver `tests/agent-loop/parity.json` - one row per legacy behavior of `agents/spec.md`, `tasks.md`, `implement.md`, `ship.md`, `investigate.md`, `reviewer.md` and the loop rules in `CLAUDE.md` and `AGENTS.md`, with excerpt hashes, home and contract; the schema test fails on an unmapped legacy rule (AC-08, AC-10)
- [ ] T26 Stackweaver `tests/agent-loop/contract.test.ts`, `tests/agent-loop/retirement.test.ts` - a contract test per parity row, including the acceptance and issue rules, named E2E specs in kind, the live slot pass, the final full kind run and `make verify` skips, plus the retirement check over unenrolled non-terminal specs; they fail before adoption (AC-08, AC-10, AC-16, AC-17)
- [ ] T27 Stackweaver `.vh-adlc/loop.yaml` - Opus host routes for author and implementer, `gpt-6.1-sol` command routes for both reviewers, rungs, `ci_trigger: manual`, `post_merge_watch`, `skip_ci_paths`, `implement_worktree: isolated`, `review_scratch`, instruction files, lenses and `findings_document: always`; `vh-adlc settings read` accepts it (AC-01, AC-04, AC-05, AC-15, AC-18)
- [ ] T28 Stackweaver `agents/loop-project.md` - the local rules: slots, the verification ladder, direct-to-main and skip rules for non-feature work, satellites, `lessons.md`, the docs index rebuild, the implement-to-ship grant, acceptance and issue rules, and spec style; every parity row resolves to a home (AC-08, AC-10, AC-16)
- [ ] T29 Stackweaver `.claude/commands/spec.md`, `tasks.md`, `implement.md`, `ship.md`, `investigate.md`, `AGENTS.md` - enrollment-aware adapters and plain-language routing, `model:` frontmatter checked against `loop.yaml`; T26 passes (AC-08, AC-16, AC-17)
- [ ] T30 Stackweaver `docs/internal/plans/` draft specs - every draft spec converted to the shared format; `vh-adlc lint` and `gate` pass and a manual-reading table records each gate condition (AC-09)
- [ ] T31 Stackweaver `CLAUDE.md` - merge commits for feature PRs, the shared spec style, and model routing pointing at `loop.yaml`; `make verify` passes (AC-08, AC-14)
- [ ] T32 Stackweaver `tests/agent-loop/README.md` - the rollback and reapply procedure, rehearsed on a disposable checkout with matching hashes for the docs index and unrelated workflow files (AC-11)
- [ ] T33 Stackweaver `tests/agent-loop/evidence/` - a candidate plugin and binary in an isolated Claude Code profile run every adapted command and its plain-language form on enrolled and unenrolled disposable specs, start `/implement` on a clean main checkout, and take one disposable feature from claim to a merge-commit landing (AC-08, AC-12, AC-14, AC-18)
- [ ] T34 `tests/vh-adlc/evidence/loop-review-route/` - one real Copilot `gpt-6.1-sol` file-only spec review and one shell implementation review that returns `met` on a disposable feature, with transcripts and stored records (AC-02)

## Open Questions

None. The owner answered Q1 to Q10, the three R-1 judgement findings (F-01, F-03, F-07) and the
three R-2 judgement findings (F-02, F-03, F-04) the two R-3 judgement findings (F-01, F-04) the three
R-4 judgement findings (F-02, F-03, F-04) the two R-5 judgement findings (F-01, F-02) the R-6 judgement finding (F-01), the R-7 findings F-02 and F-03, the R-8 judgement findings
(F-01, F-03) the R-9 judgement finding (F-01), the R-10, R-11 and R-12 findings on 2026-11-13; the answers are folded into Owner summary, Scope and Design.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-13 | R-1 | spec | `798132cf54857c07ee04f82f6595ad9b9acd65a8` | gpt-6.1-sol | procedural | Four blocking findings: no review route that can execute checks, post-merge complete gate, active spec migration, skipped delivery versus the merge watch. |
| 2026-11-13 | R-2 | spec | `7af38b0eb50ae12a678dbcebb3b04cd61b32abb0` | gpt-6.1-sol | procedural | One blocking finding: no enrollment rule between native and shared routing; five should-fix. |
| 2026-11-13 | R-3 | spec | `764df2fe8182152243a40b81e12a9168a88e5fa2` | gpt-6.1-sol | procedural | Two blocking findings: adapter must isolate implement from the live main checkout; domain plans routed to retired agents. Two should-fix. |
| 2026-11-13 | R-4 | spec | `b777df0b6cc97a2d8b1410f3bedc73631ab504f5` | gpt-6.1-sol | procedural | Two blocking findings: routing criteria contradict for terminal documents; no-publication verdict not tied to the merge commit. Three should-fix. |
| 2026-11-13 | R-5 | spec | `4f970d4d18078e7c3edbc81db9d941fbfb6116a1` | gpt-6.1-sol | procedural | One blocking finding: the release order needs a post-merge lock commit outside the single-feature lifecycle. Two should-fix. |
| 2026-11-13 | R-6 | spec | `db426cbbe13abd8675d4365ad23903e59b94b7c0` | gpt-6.1-sol | procedural | No blocking findings; four should-fix on freshness wording, signed release verification, covers and assume-unchanged files. |
| 2026-11-13 | R-7 | spec | `1ae2a34e436fb057e4fe2793a04147143c539af1` | gpt-6.1-sol | procedural | No blocking findings; three should-fix on the moved Stackweaver checkout, merges with no publication workflow, and the post-merge verification range. |
| 2026-11-13 | R-8 | spec | `5a284fc1c6fac8656cf3494f5e79a0f094dcc5dd` | gpt-6.1-sol | procedural | One blocking finding: an empty workflow-run query right after merge does not prove no publication. Two should-fix and a nit. |
| 2026-11-13 | R-9 | spec | `9378490b8c1681e81508506f61b467ba2456bb30` | gpt-6.1-sol | procedural | No blocking findings; one should-fix on reused E2E proofs and a wording nit. |
| 2026-11-13 | R-10 | spec | `1d563f0e24e6ad57c1677374dd4f1ac9ac1afd01` | gpt-6.1-sol | procedural | No blocking findings; three should-fix: live slot pass and final full kind run, skipped subchecks inside make verify, glossary. |
| 2026-11-13 | R-11 | spec | `fcc1245e2deda1fe8ef0d42d43f90954338f8cd3` | gpt-6.1-sol | procedural | One blocking finding: a file-only review reads the live worktree, not the target commit. Two should-fix. |
| 2026-11-13 | R-12 | spec | `64503e5f5f95d49cc5dfcc717e616c964e68fbd5` | gpt-6.1-sol | procedural | One blocking finding: the reviewer CLI starts in the live checkout and can load its instruction files. Two should-fix. |
| 2026-11-13 | R-13 | spec | `478dcab03f798ade50341adbd27273660fd0cb43` | gpt-6.1-sol | procedural | No blocking findings; two should-fix on findings saved against an existing issue and reviewer helper processes outliving the review. |
| 2026-11-13 | R-14 | spec | `d367673759c90a3b0b5da6a6e8b6884d99d18c6a` | gpt-6.1-sol | procedural | No blocking findings; two should-fix on claiming from an unrelated branch and verifying process group cleanup. |
| 2026-11-13 | R-14 | spec | `d367673759c90a3b0b5da6a6e8b6884d99d18c6a` | n/a | n/a | accepted by owner |
| 2026-11-13 | R-15 | spec | `e2e3de959b09950f8c9d17dbf1a74413523af7ea` | gpt-6.1-sol | procedural | No blocking findings after the covers revision; two should-fix on symlinks escaping the export and detached reviewer helpers. |
| 2026-11-13 | R-15 | spec | `e2e3de959b09950f8c9d17dbf1a74413523af7ea` | n/a | n/a | accepted by owner |

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

### R-7

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context / Background; Design / Comparison baseline
EVIDENCE: The supplied Stackweaver checkout is no longer at dbd4d7a4. /home/m/code/stackweaver/.git/HEAD names refs/heads/main, whose file contains 0271650330e79e98acbad8aa58e6470b4d06996c. Its HEAD reflog ends with a fast-forward from dbd4d7a4 to that commit for docs/tfe-destroy-delete-parity-spec. I cannot run Git to establish the complete difference from the cited baseline, or execute vh-adlc to reproduce the document's binary results.
PROPOSAL: Provide a stable read-only snapshot at the supplied Stackweaver revision, or establish the intervening file differences before counting this review as verification of its baseline claims. Recheck the migration inventory against the selected adoption head.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design / Verification rungs, CI policy and post-merge watch; AC-05 and its Test Plan
EVIDENCE: Design says Stackweaver's tag workflow runs on every push to main and sends every unmarked merge through the watcher. Stackweaver .github/workflows/tag.yml:9-18 instead path-ignores Markdown and docs. sync-frontend.yml:13-14 excludes docs/internal/, and the other inspected sync triggers do not select agents/*.md. An unmarked merge changing only agents/spec.md and its internal feature document therefore has no automatic publication path. scripts/release/watch-merge.sh:188-191 exits 1 when a path-ignored merge has no push-triggered sync. The specified unmarked-merge test checks only that the watcher is invoked, so it misses this delivery dead end. This follows from reading the workflows and script; Git and binary execution are unavailable.
PROPOSAL: Distinguish unmarked publishing merges from merges whose paths trigger no publication workflow. Add the latter scenario and obtain the owner's decision on whether it receives a verified no-publication verdict or an explicit policy-blocked result with a recovery procedure.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Verification rungs; AC-04 and its Test Plan
EVIDENCE: Rung applicability is calculated from the feature branch against its merge base with the default branch, while applicable rungs must pass again before delivery and earlier-commit results cannot count for a new commit. After the feature lands and the default branch is fetched, the feature tip is its ancestor, so that comparison no longer contains the feature's changed paths. Backend, UX and engine-sensitive rungs can consequently become inapplicable during the delivery check, even though the merge created a new commit. The Test Plan covers earlier feature commits but not this post-merge collapse of the comparison range. I cannot execute the Git scenario.
PROPOSAL: Preserve an explicit feature-delta identity through delivery and define which commit the final verification establishes, such as the actual merge commit against its first parent. Add a merged-feature scenario proving that mandatory path-conditioned rungs cannot disappear when the default branch advances to contain the feature.

### R-8

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design / Verification rungs, CI policy and post-merge watch; AC-05
EVIDENCE: The design reports an unmarked, skip-eligible merge delivered when querying GitHub finds no push-triggered workflow runs. Absence at query time does not establish that no workflow will appear. Stackweaver scripts/release/watch-merge.sh:29-30,78-88 explicitly allows delayed appearance and polls before declaring a run missing. An unmarked .claude/settings.json change is skip-eligible under this design but triggers .github/workflows/tag.yml. The proposed check can therefore report delivery before its publication chain starts. I cannot execute Git, GitHub queries or vh-adlc; this finding follows from reading the specified check and workflow.
PROPOSAL: Establish no publication path from the merge commit's workflow triggers and changed paths, rather than an immediately empty run list. Add delayed-run and API-failure fixtures that must not produce a delivered verdict.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design / Feature PR history; Verification rungs; AC-04 Test Plan
EVIDENCE: Feature PR history permits merge commits or fast-forwards, but final verification evaluates the landed commit against its first parent. For a fast-forward containing several feature commits, that range contains only the last commit, potentially just the completion document, rather than the whole feature delta. The Test Plan exercises only a merge-commit landing. This contradicts the whole-feature applicability requirement. I cannot run Git or vh-adlc to execute the scenario.
PROPOSAL: Define the final comparison base for fast-forward delivery, retaining the pre-integration default-branch tip, or explicitly disallow fast-forward delivery when these hooks apply. Test a fast-forward whose earlier commit changes backend code and whose final commit changes only documentation.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Verification rungs; AC-04
EVIDENCE: Rungs may depend on “a criterion kind”, and Stackweaver's kind-harness requirement depends on identifying E2E specs, but the design defines neither the kind vocabulary nor how criteria acquire kinds. The pinned feature-document rules define criterion IDs and text without kind metadata; internal/doc/doc.go:64-72 likewise represents no criterion kind. Consequently, the required rung can be silently omitted by inconsistent classification even when the declared-rung tests pass.
PROPOSAL: Define an explicit, validated classification mechanism, such as committed criterion-ID-to-kind mappings, including how new and unclassified criteria are handled. Add a case proving an E2E criterion cannot bypass its kind-harness rung because classification is missing.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Context / Background; Design / Comparison baseline and Stackweaver adoption
EVIDENCE: Background reports 55 non-terminal plans, while adoption reports 12 drafts, 43 planned or in-progress specs and 3 parked specs at the same cited revision, totaling 58. Comparison baseline also attributes both comparison passes to 7861b9dc, whereas Stackweaver docs/internal/analysis/shared-development-loop-parity.md identifies both passes as comparing 20e38a94 and explicitly says its model rows predate 7861b9dc. Git execution is unavailable, so I cannot reproduce the historical inventory.
PROPOSAL: Correct the comparison provenance and reconcile the status counts, naming any different counting populations explicitly. Keep the adoption-head recount requirement.

### R-9

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Verification rungs, CI policy and post-merge watch; AC-04 and its Test Plan
EVIDENCE: Stackweaver's kind rung applies only to changes under e2e/, deploy/ or frontend/nginx.conf. A backend-only runtime change whose Test Plan reuses an unchanged E2E spec therefore triggers make verify and integration tests, but not kind. Stackweaver agents/implement.md:61-66 requires the Test Plan's E2E checks and a live runtime pass; CLAUDE.md:184 requires kind execution for E2E proof. The specification does not explicitly preserve these requirements independently of the narrower rung conditions, and AC-04's fixtures do not cover reused E2E specs. Git and vh-adlc execution are unavailable; this follows from reading the configured conditions and native instructions.
PROPOSAL: Explicitly retain Test Plan E2E execution in kind and runtime verification even when their test files are unchanged. Add a backend-only fixture that reuses an existing E2E spec and cannot advance without that proof.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design / Verification rungs, CI policy and post-merge watch
EVIDENCE: The statement that Stackweaver's tag workflow “runs on every push to main” contradicts .github/workflows/tag.yml:9-18, which declares paths-ignore. The same design section later acknowledges those exclusions.
PROPOSAL: Qualify the statement to describe unmarked pushes that pass the workflow's path filters. Keep the subsequent blocked-delivery handling for unmarked merges that trigger no publication.

### R-10

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Verification rungs, CI policy and post-merge watch; AC-04 and its Test Plan
EVIDENCE: docs/specs/shared-development-loop.md:327-347 preserves path-conditioned rungs and named E2E execution, but does not explicitly require the live slot runtime pass that Stackweaver agents/implement.md:61-66 requires for anything with runtime behavior. It also omits CLAUDE.md:184's full detached kind run on the final head after targeted iteration. The generic references to a local verification ladder and parity map do not specify these stopping conditions, and AC-04's scenarios can pass without either check. Git, vh-adlc and test execution are unavailable; this finding is based on reading the current design and native instructions.
PROPOSAL: Explicitly retain the live slot runtime pass and final full detached kind run in Stackweaver's project procedure and advancement rules. Add scenarios proving that applicable runtime work cannot advance without its live pass and targeted E2E success cannot replace the required final full run.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Verification rungs; AC-04 and its Test Plan
EVIDENCE: The design declares make verify as an always-required rung but defines no handling for successful commands containing skipped mandatory checks. Stackweaver scripts/verify-local.sh:291-333 skips formatting, lint, tests and satellite builds when their tools are missing; lines 473-487 exit unsuccessfully only for FAIL entries, so skipped checks can accompany exit 0. The planned unavailable-rung fixture does not cover this partial-success result. Treating the aggregate command as passed would permit pushing or completion without the full verification the design claims to preserve. I cannot execute the command or vh-adlc; the exit behavior is established by source inspection.
PROPOSAL: Define the make verify rung's pass condition to require all applicable mandatory subchecks, not merely command exit 0, with unavailable subchecks handled through the exact owner-allowance rule. Add an exit-0 fixture reporting a skipped mandatory subcheck and require advancement to stop without that allowance.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design / Model routing per role, Verification rungs and Stackweaver adoption; Acceptance Criteria
EVIDENCE: The document introduces user-facing configuration and routing terms including loop roles, verification rungs and enrolled specs, but contains no glossary or criterion holding those terms to their definitions. The pinned conventions/feature-documents.md, Open questions section, requires user-facing terms introduced or changed by a feature to appear in a glossary row and be held to it by a criterion.
PROPOSAL: Add glossary rows for the introduced user-facing terms and a criterion with proof that configuration documentation, adapters and reports use them consistently.

### R-11

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design / External command route; AC-02 and its Test Plan
EVIDENCE: The file-only spec reviewer reads the owning worktree, but the design neither exports the target commit's files nor requires its review inputs to match that commit. plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md, Review mode, commits the document without requiring unrelated files to be clean. An uncommitted instruction-file edit can therefore influence a review stored against X. Echoing TARGET and comparing before/after hashes do not establish that the reviewed contents belonged to X. I cannot run git or vh-adlc; this follows from reading the dispatch design and existing procedure.
PROPOSAL: Give file-only reviews a read-only export of the target commit, or verify that every review input matches it before dispatch. Add a fixture proving that an uncommitted instruction change cannot clear a spec at the committed baseline.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Stackweaver adoption; AC-08, AC-17 and their Test Plan rows
EVIDENCE: Stackweaver AGENTS.md:29-34 routes the loop directly through agents/spec.md, agents/tasks.md, agents/implement.md and agents/ship.md, explicitly for plain-language requests as well as slash commands. The adoption defines command adapters and tests adapted commands, but does not define an updated AGENTS.md route for plain-language invocation. Those requests can still enter the native loop for enrolled documents, or reference deleted agents after retirement.
PROPOSAL: Update Stackweaver's repository entry instructions to use the same enrollment-aware dispatcher for plain-language and slash-command requests. Test both forms before retirement and their terminal-document refusal afterwards.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Skip-CI paths and Release path; AC-15
EVIDENCE: The design enables extra skip paths after updating the plugin's knowledge.md pin. However, internal/knowledge/knowledge.go, pin(), gives repository pins precedence over that fallback, and plugins/vh-adlc/references/loop.md requires using the resolved revision and reporting conflicts. A consumer still pinned to d8f07c9 therefore reads conventions/delivery.md's documentation-only restriction while AC-15 unconditionally requires skipping deliveries containing declared tooling paths. I cannot execute knowledge or ship; the precedence is established by reading their source and instructions.
PROPOSAL: Define how skip_ci_paths behaves when the resolved delivery convention does not support it, including a pin-update handoff or an explicitly authorized, reported exception. Add a repository-pin fixture so updating the plugin fallback cannot silently override the consumer's pinned rule.

### R-12

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design / External command route; AC-02 and its Test Plan row
EVIDENCE: docs/specs/shared-development-loop.md:264-278 launches the command from the owning worktree while promising that uncommitted instructions cannot shape a spec review. The example argv does not disable automatic custom instructions. Stackweaver .github/copilot-instructions.md:5-10 directs Copilot to repository instructions, and existing isolation prior art in tests/vh-adlc/triage/copilot-trial.ts:8 explicitly uses --no-custom-instructions and launches against exported inputs. Merely pointing the prompt at an archive leaves startup instruction discovery in the live checkout outside the promised boundary. I cannot execute the CLI; this finding follows from the specified launch and existing launch controls.
PROPOSAL: Launch file-only reviewers from the exported target, with automatic instruction discovery disabled or confined to that export. Extend the real-route test to change live startup instruction files and verify that neither their contents nor their directives enter the review.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Investigation defaults; AC-07 and its Test Plan row
EVIDENCE: Stackweaver agents/investigate.md:50-51 requires extending an existing issue or document rather than filing a duplicate. The proposed Design only requires searching before writing, and AC-07 requires reporting duplicates found. Its tests require writing a document and naming the duplicate, so creating a second analysis document for the same case can satisfy the stated checks.
PROPOSAL: Require investigate to reuse or extend the existing document when it covers the case, while preserving issue-creation authority limits. Add a duplicate-document scenario whose pass condition includes no second document being created.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design / Claiming from a host worktree; AC-13 and its Test Plan row
EVIDENCE: docs/specs/shared-development-loop.md:298-304 requires comparison with the freshly fetched default-branch tip, then promises a stale-tip refusal before anything is written and with the repository unchanged. The AC-13 proof additionally requires the repository to remain byte-identical. plugins/vh-adlc/references/loop.md requires git fetch before fresh and gate; fetching can update remote-tracking refs and FETCH_HEAD before the stale-tip refusal. I cannot run git or vh-adlc; this is a contradiction between the required procedure and its preservation contract, not an observed test failure.
PROPOSAL: Explicitly permit the required fetch effects while forbidding changes to the document, local branches, HEAD, index and worktree on pre-claim refusal. Make the stale-tip fixture advance the remote and verify that precise boundary instead of whole-repository byte identity.

### R-13

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design / Investigation defaults; AC-07 and its Test Plan row
EVIDENCE: Design permits investigate to record findings against an existing issue instead of writing a document. AC-07 still requires writing or extending an analysis document. Stackweaver CLAUDE.md:295-299 forbids an issue from carrying the only copy of substantive reasoning, as does the pinned conventions/documentation.md under Findings and issues. The duplicate-issue case therefore has conflicting artifact requirements.
PROPOSAL: Require an existing issue to point to an analysis document that investigate creates or extends; issue updates remain summaries and links. Test an existing issue without a covering document and require the findings to be saved in a document without creating another issue.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / External command route; AC-02 and its Test Plan row
EVIDENCE: The route specifies timeout handling and a preservation snapshot after the reply, but no requirement to terminate and reap the command's remaining processes before taking that snapshot. A successful reviewer process can leave a helper running that changes files after the review is stored. Existing plugins/vh-adlc/scripts/triage/owned-process.ts:1-16 explicitly owns a process group and terminates remaining helpers even after successful parent exit. AC-02's fixtures cover a hang, but not surviving descendants. Git, vh-adlc and CLI execution are unavailable, so these scenarios were not executed.
PROPOSAL: Reuse the owned-process runner and require process cleanup before the final preservation check or record storage, reporting cleanup failures as review pending. Add successful-exit and timeout fixtures with a surviving helper and verify that it cannot modify the checkout afterward.

### R-14

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Claiming from a host worktree; AC-13 and its Test Plan row
EVIDENCE: Design permits claiming in "any worktree" at the fetched default-branch tip, including one on another branch name. Committing there advances that existing branch before git switch -c creates the feature branch. Neither AC-13 nor its fixtures distinguish a session-owned host branch from an unrelated branch. plugins/vh-adlc/references/authority.md:80-86 forbids repointing unrelated branches, and Stackweaver CLAUDE.md:127-137 treats worktrees as concurrent session resources. I cannot execute git or vh-adlc; this finding follows from the written procedure and preservation rules.
PROPOSAL: Require a non-default branch and its worktree to belong to the current session or have an explicit owner handoff before claiming. Add a clean, tip-aligned unrelated-branch fixture that refuses without advancing that branch or changing its checkout.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design / External command route; covers; AC-02 and its Test Plan row
EVIDENCE: Design requires the reused owned-process runner to terminate and reap the entire reviewer group before preservation checks, leaving cleanup failures pending. plugins/vh-adlc/scripts/triage/owned-process.ts:5-12 swallows signal errors and defines reaped solely from child.exited, which observes the parent rather than surviving helpers. A successful parent can therefore produce exit_code: 0 and reaped: true despite failed group termination. The runner is absent from covers, and AC-02's proof has no cleanup-failure fixture. Process fixtures, git and vh-adlc could not be executed in this review.
PROPOSAL: Require the runner or its review wrapper to distinguish an absent group from failed signalling and confirm that no live group members remain before storage. Cover the runner and add a cleanup-failure fixture that leaves the review pending even when the parent exits successfully.

### R-15

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design / External command route; AC-02 and its Test Plan row
EVIDENCE: The design relies on a read-only git archive export to ensure that live, uncommitted content cannot shape a spec review, but specifies no containment check for exported symlinks. A tracked symlink can resolve outside that export into the live checkout, so viewing an apparently exported instruction or source file can read uncommitted bytes. Existing plugins/vh-adlc/scripts/triage/controller.ts checks realpath containment, and tests/vh-adlc/triage/copilot-trial.ts explicitly probes reads through an escaping symlink. I cannot execute git, vh-adlc or CLI probes; this gap follows from the written export procedure and those existing containment checks.
PROPOSAL: Validate exported symlinks and prevent reads through links that escape the declared committed exports and pinned inputs, leaving the review pending when required content cannot be inspected safely. Add a fixture whose committed symlink points to a modified live instruction file and prove that its uncommitted content cannot reach the reviewer.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / External command route; AC-02 and its Test Plan row
EVIDENCE: Design promises that “no helper outlives the review” through termination of the reviewer's process group. The acceptance notes additionally require confirming that this group has no live members. Neither condition covers descendants that create a separate process group or session, which shell-enabled checks can spawn. plugins/vh-adlc/scripts/triage/owned-process.ts signals only -child.pid, and its existing descendant fixture never detaches the helper. An escaped helper can therefore write after the final preservation check even when the original group is empty. Process execution, git and vh-adlc are unavailable in this review.
PROPOSAL: Require cleanup to account for detached descendants too, or enforce an execution boundary that prevents descendants from escaping the owned process scope. Add successful-exit and timeout fixtures with a detached helper scheduled to write after the reply; store no review until that helper is confirmed stopped.

## Sources

- [Feature-document standard at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/feature-documents.md): sections, rules block, criterion and review formats, acceptance.
- [Feature-document template at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/guides/feature-document-template.md): document layout.
- [Delivery convention at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/delivery.md): claim commit, no squash for feature PRs, skip-CI scope, delivered after every release path publishes.
- [Documentation convention at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/documentation.md): prose and document rules.
- [Humanize prose guide at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/guides/humanize-prose.md): prose editing for this document.
