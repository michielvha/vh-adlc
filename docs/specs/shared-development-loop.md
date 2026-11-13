---
status: in-progress
status_description: "Re-entered after the R-22 acceptance; T57 and a fresh implementation review remain."
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
Codex CLI that is stored and checked like any other (read-only spec reviews, which write nothing, read a read-only export of
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

A second revision, during implementation, follows Stackweaver's move of its GPT reviews from the
Copilot CLI to the Codex CLI: the Design example and the AC-02 real-route proof now name `codex exec`.
Scope and the generic route are unchanged. That first real Codex review then came back `MODEL: unknown`
and stayed pending, as designed: Codex never tells its model its name, although its session log shows
`gpt-6.1-sol` served the run. The owner chose to let a command route read the served model from the
CLI's own record (`model_attestation: codex-session`); AC-02 and its proof now cover that.

A fourth revision, during implementation, moved implementation reviews into a private clone of the
reviewed commit: the first Codex implementation review stayed pending because another session pushed to
the shared refs while it ran. The clone is implemented (T48, T49), and the R-21 implementation review ran
in it.

This fifth revision changes one word of the contract. AC-02 and Design called the spec review route
"file-only", but the Codex route runs in a read-only sandbox where the reviewer may still run read-only
commands; R-21 saw it run `bun test`. The route is now called read-only: it writes nothing and reads only
the export of the commit. T57 aligns the code comment, and T34's evidence carries a correction note.

Validation so far: twenty-one spec reviews on `gpt-6.1-sol` and one stored implementation review (R-21 at
`b44d2f58`: six criteria met, AC-02 not met, twelve not verified, seven should-fix findings). R-21's
findings are fixed in T54 to T56, apart from this wording change. Every task through T56 is implemented
with its checks recorded; real Codex reviews (T34), routing trials and a claim-to-merge flow (T33), and
the lean lens trial and install rehearsal (T50, T51) are recorded. The headless investigation and
isolation trials (T52, T53) ran but did not succeed; the owner chose residuals on AC-07 and AC-18 instead
of a retry, recorded as attempts, not as verified outcomes, and they come back after re-acceptance. Still
to do: T57, a fresh implementation review, and the owner's call on criteria a reviewer cannot verify
without running full agent operations.
Accepting authorizes continuing the implementation on its branches. Publishing releases, merging either
repository and retiring the native agents each need separate approval.

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
Stackweaver commit `119d2ae4` then moved those reviews to the Codex CLI:
`/usr/bin/codex exec -s read-only -m gpt-6.1-sol "<prompt>"` (Stackweaver `CLAUDE.md:202`).

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
  model_attestation: codex-session
  argv: [/usr/bin/codex, exec, --json, --skip-git-repo-check, -s, read-only, -m, "{model}", "{prompt}"]
implementation_reviewer:
  route: command
  model: gpt-6.1-sol
  model_attestation: codex-session
  argv: [/usr/bin/codex, exec, --json, -s, workspace-write, -m, "{model}", "{prompt}"]
```

The operation writes the canonical reviewer instructions, document path, exact commit, kind, docs
revision, binary path and plugin pin into a prompt file and reads the reply. It runs the command as one
owned process group through the existing runner in `plugins/vh-adlc/scripts/triage/owned-process.ts`,
which signals the whole group after the parent exits, so no helper outlives the review. The group is
terminated and reaped before the final preservation check and before any record is stored; if cleanup
fails, the review stays pending. An implementation review
runs the command from its private clone of the reviewed commit, described below; the plugin creates no worktree. A read-only spec review runs it
from the export described below, so the CLI discovers no instruction files in the live checkout. The route is generic: `argv` is any command with
placeholders, so Copilot, Codex or another CLI needs only settings. `{export_dir}` is the read-only
export of the target commit, `{model}` is the role's model,
`{prompt}` is the whole prompt text as one argument (what `codex exec` and Copilot's `-p` take), and `{prompt_file}` is
the path of the same text for a CLI that reads files. The reply opens with `MODEL:` and then
`TARGET: <commit>`; the operation checks that `TARGET` equals the commit it dispatched, which proves the
reviewer received the dispatch identity, and strips both header lines before storing the records. A
command that is not given a read-only tool restriction is recorded with `procedural` isolation.

A model may not know its own ID: Codex starts its model without naming it, so a `codex exec` reviewer
answers `MODEL: unknown`, and the requested-model rule would leave every such review pending. A
command route may therefore declare `model_attestation`, a way to read the served model from the CLI's
own record instead of the reviewer's self-report. The first method is `codex-session`: the command runs
with `--json`, the reply is the final agent message in that stream, and the served model is the `model`
recorded in Codex's session log for the stream's thread id (`~/.codex/sessions/**/rollout-*-<thread
id>.jsonl`). The attested model must match the requested one under the same alias and exact-ID rules; a
missing log, no recorded model, several different models or a mismatch leaves the review pending. The
Review Log then records the attested model. A reviewer self-report that names a different model also
leaves the review pending. Without `model_attestation`, the reviewer's `MODEL:` line decides, as before.

The review policy comes from the reviewed commit, not the working tree (owner decision on
2026-11-13): the reviewer role's route, the instruction files and the lenses are read from
`.vh-adlc/loop.yaml` as committed at the dispatched commit, and the per-user executable override is the
only local input. An uncommitted edit to `loop.yaml` therefore cannot change which policy a review
recorded against that commit applied.

A spec review writes nothing, so its route is read-only: the reviewer may run read-only commands (Codex's
`-s read-only` sandbox allows them), and a route may narrow it further to file tools. It does not read the live worktree: the
operation exports the target commit with `git archive <commit>` into a fresh read-only directory and
checks every committed symlink's fully resolved destination, following intermediate links, and leaves
the review pending when containment cannot be established; it then points the reviewer there, launching
the command from that directory with the CLI's automatic
instruction loading turned off or confined to the export (Copilot's `--no-custom-instructions`, as the
existing `tests/vh-adlc/triage/copilot-trial.ts:8` does; `codex exec` reads `AGENTS.md` from its working
directory, which is the export), so uncommitted edits, to instruction files or anything else, cannot
shape a review recorded against that commit. Any other repository the review needs is exported the same way at
a named commit. An implementation review must observe the
checks it relies on, because the standard counts only executed evidence the review saw as `met`, so its
route has shell access. It runs in a private clone of the reviewed commit (a `git clone --no-hardlinks` of
the owning worktree, checked out detached at the commit, with refs of its own), launched from that clone,
so pushes and commits other sessions make to the repository's shared refs during the review cannot leave
it pending (owner decision on 2026-11-13). Before dispatch the operation records, in the private clone,
`HEAD`, the index tree (`git write-tree`), every ref (`git for-each-ref`), `git status --porcelain --untracked-files=all`, the list of ignored files (`git ls-files --others --ignored --exclude-standard`), a content
hash of every modified, untracked and ignored file, files inside ignored directories included, and of
every tracked file flagged assume-unchanged or skip-worktree (`git ls-files -v`), which status cannot see, and the index entries with their flags
(`git ls-files --stage --debug`), leaving out only build-output directories listed under
`review_scratch` in `loop.yaml`; in the owning worktree it records the same except that, of its refs, only
`HEAD`, `HEAD`'s symbolic target and that branch's ref count, since other sessions move the rest. After the
reply it records both again. A read-only spec review, which reads the export, checks the owning worktree
the same way. A reviewer that reached into the shared repository and moved some other branch or tag there
is not detected; the owning worktree's files, index, `HEAD` and branch are. Any difference outside `review_scratch`, including a
changed file whose status line stayed the same or a newly created ignored file, leaves the review pending, stores nothing and reports what changed. Such a review is recorded with
`procedural` isolation. The reply must open with `MODEL:`, then carry records in the
standard's format. The same requested-model rule applies: a missing header, a self-reported model that differs from the
requested one, an `unknown` self-report on a route without a successful model attestation, a failed
attestation, a non-zero exit or a timeout leaves the review pending, writes no Review Log row, and puts the raw reply
and the command's exit status in the handoff. Records are stored byte for byte and pass
`vh-adlc review check`. Isolation is recorded as `structural` only when the command's tool allow-list
is one the host is verified to enforce, otherwise `procedural`. The binary path in `argv` is
machine-specific, so a per-user file outside the repository may override `argv[0]` and nothing else;
the model, the arguments and the role mapping always come from the committed file.

### Claiming from a host worktree

Implement may make the claim commit in any worktree whose `HEAD` equals the freshly fetched default
branch tip and whose tracked files are clean, whether `HEAD` is detached, on the default branch, or on a
branch this session created or was handed over. A worktree on any other branch, even one level with the
tip, is refused before anything is written and its branch is never moved. It pushes the claim with `git push origin HEAD:<default branch>`, creates the feature branch at the
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
open issues for duplicates before writing (a consumer's project procedure may widen the search to its other
findings homes, as Stackweaver's does for its bug-report and research folders, owner decision on
2026-11-13), and when an analysis document already covers the case it extends that
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
enrollment-aware dispatch as the slash commands. Stackweaver's `CLAUDE.md` review rule gains one
guarded exception (owner decision on 2026-11-13): implementation reviews run
`codex exec -s workspace-write` so the reviewer can run the checks it relies on, under the route's
before-and-after preservation check and `review_scratch`; spec reviews and code second opinions stay
`-s read-only`. The adapters also keep the
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
      Evidence: R-23 at `0b5b5f23` returned not met.
- [ ] AC-02: From a Claude Code session, a read-only spec review that reads only a read-only export of the target commit and writes nothing, and a shell-enabled implementation review run through declared command routes on `gpt-6.1-sol` against an exact commit; the implementation review can return `met` from checks it ran; the route, instruction files and lenses come from `loop.yaml` at the reviewed commit; a matching reply with the dispatched `TARGET` is stored verbatim and passes `review check`, where a route with `model_attestation: codex-session` matches on the model Codex's session log records rather than the reviewer's self-report; and a mismatched model or target, a missing header, a non-zero exit, a timeout, a failed process cleanup or any change outside the declared `review_scratch` directories to the private clone's `HEAD`, refs, index entries, status, file contents or ignored-file list, or to the owning worktree's `HEAD`, branch ref, index entries, status, file contents or ignored-file list, leaves the review pending, while another session's push to the shared refs during the review does not with no Review Log row.
      Evidence: R-23 at `0b5b5f23` returned not verified.
- [ ] AC-03: Every SDD operation reads the declared project procedure and instruction files, and a spec review flags a document that contradicts a declared instruction file or lens.
      Evidence: R-23 at `0b5b5f23` returned not verified.
- [ ] AC-04: Implement and ship run each declared verification rung whose path condition holds over the whole feature delta, or that is declared always, and report every rung as passed, failed or not run with a reason; a failed rung, or one that could not run without the owner allowing it for that run, means the feature branch is not pushed and the feature is not complete or delivered; with no rungs declared they keep the current command lookup.
      Evidence: R-23 at `0b5b5f23` returned not met.
- [ ] AC-05: With `ci_trigger: manual`, ship reports CI as not triggered by policy and dispatches nothing; with a `post_merge_watch` declared, a feature whose merge can publish is reported delivered only after that command exits 0, a feature whose actual merge commit carries the skip marker and touches only skip-eligible paths is reported delivered with no publication path and no watch run, every unmarked merge commit runs the watch, and a watch that fails only because no workflow ran leaves the feature reported blocked, not delivered.
      Evidence: R-23 at `0b5b5f23` returned met.
- [ ] AC-06: Feature-document lint accepts `covers` entries containing `**`, they match the same paths as the docs-impact matcher, and under such an entry a committed change makes the applicable review stale while an uncommitted change makes `feature_tree_clean` false, as for a plain entry.
      Evidence: R-23 at `0b5b5f23` returned met.
- [ ] AC-07: With `findings_document: always`, investigate writes its findings document, or extends the existing analysis document that already covers the case without creating a second one, never leaves an issue holding the only copy of its findings, reports any duplicate analysis document or open issue it found, and ends with one of the three verdicts.
      Residual: https://github.com/michielvha/vh-adlc/issues/78
      Evidence: R-23 at `0b5b5f23` returned not verified.
- [ ] AC-08: Stackweaver's `/spec`, `/spec review`, `/tasks`, `/implement`, `/ship` for features and `/investigate` and the matching plain-language requests through `AGENTS.md` run the installed vh-adlc operations with Stackweaver's settings for every enrolled spec and, until the native agents retire, the native agents for every unenrolled one (after retirement, AC-17's refusal applies to terminal unenrolled documents), new specs are written enrolled, and every row of the committed parity map passes its contract test.
      Evidence: R-23 at `0b5b5f23` returned not verified.
- [ ] AC-09: Every Stackweaver spec in the migration set (the draft specs, plus each planned, in-progress or parked spec the owner moved) passes `vh-adlc lint`, its gate results agree with a manual reading of the document, and each moved spec that was planned or in progress carries a fresh review and an owner acceptance row at its converted baseline.
      Evidence: R-23 at `0b5b5f23` returned met.
- [ ] AC-10: Stackweaver's local behaviors stay available with unchanged invocation: worktree slots, direct-to-main non-feature shipping through its own `/ship`, `[skip ci]` rules, `watch-merge.sh`, the triad and satellite lenses, the browser-pass summary table, and `/implement` handing straight to ship.
      Evidence: R-23 at `0b5b5f23` returned met.
- [ ] AC-11: A disposable Stackweaver checkout rolls back to the native loop and reapplies the adoption, with the docs index and unrelated workflow files byte-identical afterwards.
      Evidence: R-23 at `0b5b5f23` returned not met.
- [ ] AC-12: On the feature branch, a GoReleaser snapshot build produces all four runtime archives, the plugin's `knowledge.md` pin names the merged vhco-pro/docs revision, and a candidate plugin installed from the branch in an isolated profile runs every adapted Stackweaver command through its entry points.
      Evidence: R-23 at `0b5b5f23` returned not verified.
- [ ] AC-13: Implement claims a planned feature from a clean worktree whose `HEAD` is the fetched default branch tip, detached or on a branch this session created or was handed over, pushes the claim to the default branch and continues in that worktree on the feature branch; with stray changes or a stale tip it stops before writing anything, and when the push is rejected it keeps the local claim commit, creates no feature branch and reports the claim pending.
      Evidence: R-23 at `0b5b5f23` returned met.
- [ ] AC-14: A Stackweaver feature taken through the adopted loop passes its completion gate in its owning worktree before merge, and after it lands by merge commit every commit its Review Log names is reachable from `main`.
      Evidence: R-23 at `0b5b5f23` returned not verified.
- [ ] AC-15: With `skip_ci_paths` declared and a resolved delivery convention that supports it, a feature delivery whose commit, push range and PR diff touch only feature documents, Markdown onboarding files or declared paths carries the skip marker, and any other change in the delivery leaves it off; when the resolved convention does not support it, the marker follows the documentation-only rule and the report says the setting was ignored and why.
      Evidence: R-23 at `0b5b5f23` returned met.
- [ ] AC-16: In Stackweaver, `/spec review` never moves an enrolled spec to `planned` without an owner acceptance row, and `/spec` and `/investigate` create no issue without an explicit request or accepted scope.
      Evidence: R-23 at `0b5b5f23` returned met.
- [ ] AC-17: Stackweaver's native spec, tasks, implement and reviewer agent files stay routable while any non-terminal spec, domain-extension plans included, is unenrolled, are retired only after none is, and after retirement an adapted command given a terminal unenrolled document refuses without running anything.
      Evidence: R-23 at `0b5b5f23` returned not verified.
- [ ] AC-18: With `implement_worktree: isolated`, implement started in the primary worktree continues in a host-created isolated worktree, or stops before writing on a host without a worktree tool, and the primary worktree's branch, `HEAD`, index and files are unchanged afterwards; without the setting, behavior is unchanged.
      Residual: https://github.com/michielvha/vh-adlc/issues/78
      Evidence: R-23 at `0b5b5f23` returned not verified.
- [ ] AC-19: The settings reference, the operation reports and Stackweaver's adapters and project procedure use each glossary term with the meaning the Glossary gives it, and introduce no other name for those concepts.
      Evidence: R-23 at `0b5b5f23` returned met.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc` cases for each supported role and route pair, refusal of a `command` route for `author` and `implementer`, resume taking the continued operation's route, a no-file case compared with `a7bfca99` behavior, and a grep test that fails on a model name in any agent or skill file. |
| AC-02 | Fixtures where another process commits to a different branch of the shared repository during an implementation review and during a spec review (both stored), and one where the reviewer edits a file in the owning worktree (pending); a fixture that edits `loop.yaml` after committing (dropping a lens and an instruction file) where the review still applies the committed policy; a chained committed symlink (`d/back -> ..`, `leak -> d/back/../outside.txt`) that leaves the review pending; a fixture that replaces a file inside an ignored directory with same-size content and its original modification time (pending); a fixture where an uncommitted edit to an instruction file in the worktree contradicts the committed spec, and the read-only review must still see only the committed content (the export, not the worktree); in the real-route run, live startup instruction files (`AGENTS.md`, `.github/copilot-instructions.md`) changed before dispatch must not appear in the review or steer it; a fixture repository with a stub command that returns a matching reply, a wrong model, a wrong `TARGET`, no header, exit 1, a hang, one that touches a clean file, one that rewrites an already modified or untracked file without changing its status line, one that creates or moves a non-current branch or tag, one that exits successfully and one that times out while each leaves a helper running that would later write to the checkout (the helper is reaped first and the checkout stays unchanged), one that overwrites an existing ignored configuration file, one that creates a new ignored file outside `review_scratch`, one that overwrites a tracked file already flagged assume-unchanged without changing the flag, one that writes only inside `review_scratch` (stored), and one that changes an index flag without changing the index tree; Codex-style fixtures where the session log attests the requested model (stored even with `MODEL: unknown`), attests another model, has no recorded model, or is missing (all three pending); then one real Codex CLI (`codex exec`) `gpt-6.1-sol` spec review and one implementation review on a disposable feature where the reviewer runs the tests and returns `met`, with transcripts and the stored records kept as evidence. |
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
| AC-13 | Fixture repositories with a detached worktree at the tip and a worktree on the session's own branch at the tip (both claim); a worktree on an unrelated branch at the tip (refused, its branch and checkout unchanged); one behind a remote that the fixture advances and one with a stray change (both leave the document, local branches, `HEAD`, index and worktree unchanged, while remote-tracking refs may move); and a rejected push (one local claim commit, no feature branch, a pending report). |
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
- [x] T11 `tests/vh-adlc/loop/rungs.test.ts` - failing fixtures: path rungs over the whole feature delta (a `backend/` commit followed by a docs-only commit), an always rung, a failed rung blocking push, completion and delivery even with an allowance, an unavailable rung with and without its allowance, an exit-0 run reporting a skipped mandatory subcheck, an earlier pass not counting for a later commit, the merge-commit first-parent check, a refused fast-forward, and an unchanged no-rung lookup (AC-04)
      Evidence: `bun test tests/vh-adlc/loop/rungs.test.ts` fails with `Cannot find module '../../../plugins/vh-adlc/scripts/loop/rungs'`, which T12 adds.
- [x] T12 `plugins/vh-adlc/scripts/loop/rungs.ts`, `plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md`, `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md` - the rung runner and its gating of push, completion and delivery; T11 passes (AC-04)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/ tests/vh-adlc/direct-operation-compatibility.test.ts` 76 pass, including all eleven T11 fixtures: the backend rung still applies after a docs-only last commit and after a merge (first-parent range), a failed rung blocks even with an allowance, a missing command and an unrecorded procedure count as could-not-run, an exit-0 run with a skipped subcheck blocks unless that subcheck is allowed, an earlier commit's pass does not count, and a fast-forward is refused. Also touched: `scripts/loop/settings.ts` (rung parsing), `scripts/loop/cli.ts` (`rungs` command), `references/loop-settings.md` and the freeze test's phrase checks.
- [x] T13 `tests/vh-adlc/loop/delivery.test.ts` - failing ship fixtures: `ci_trigger: manual` with no dispatch, a watch that exits 1 then 0, a marked merge with no publication path, an unmarked merge that runs the watch, a watch failing because nothing ran (blocked), a delayed run; skip paths with declared paths only, with code, with an earlier code commit, and under a repository pin without skip-path support (AC-05, AC-15)
      Evidence: `bun test tests/vh-adlc/loop/delivery.test.ts` fails with `Cannot find module '../../../plugins/vh-adlc/scripts/loop/delivery'`, which T16 adds.
- [x] T14 vhco-pro/docs `conventions/delivery.md` - a consumer may declare extra skip-eligible paths for feature deliveries; merged in vhco-pro/docs, with its commit recorded here (AC-15)
      Evidence: vhco-pro/docs PR #34 (https://github.com/vhco-pro/docs/pull/34) merged by merge commit at `c70769ebf43ea03a4bdffb3cda51954eb05b35a7` after the owner's go on 2026-11-13; its `check` job passed and `npm run check` passed locally (34 Markdown files, the rules block unchanged). `conventions/delivery.md` now lets a repository declare extra skip-eligible paths (`skip_ci_paths`).
- [x] T15 `plugins/vh-adlc/knowledge.md` - the plugin pin moves to the T14 commit; `vh-adlc knowledge` resolves every loop page at it (AC-12, AC-15)
      Evidence: `plugins/vh-adlc/knowledge.md` now pins `c70769ebf43ea03a4bdffb3cda51954eb05b35a7`. `vh-adlc knowledge --plugin-pin c70769e` in a repository without its own pin answers with no findings for feature-documents, the template, documentation, delivery, coding, humanize-prose, onboarding, go, typescript and documentation-impact; the cached `conventions/delivery.md` there contains `skip_ci_paths`. `bun test --timeout 60000 tests/vh-adlc/check.test.ts tests/vh-adlc/loop/ tests/vh-adlc/lifecycle.test.ts tests/vh-adlc/ensure.test.ts` 224 pass.
- [x] T16 `plugins/vh-adlc/scripts/loop/delivery.ts`, `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md` - CI policy reporting, the merge-commit publication verdict, watch handling and skip paths that respect the resolved pin; T13 passes (AC-05, AC-15)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/ tests/vh-adlc/direct-operation-compatibility.test.ts` 87 pass, including all nine T13 fixtures: manual CI reported as not triggered with no dispatch; the skip marker only when commit, push range and PR diff are all eligible, and ignored with a pin-update note under a convention without skip paths; a marked skip-eligible merge delivered with no publication path and no watch call; an unmarked merge not delivered while the watch fails and delivered once it exits 0; a no-workflow failure left blocked; a slow watch waited for. Taken ahead of T14 and T15, which wait for the owner to approve publishing the vhco-pro/docs change (prepared locally as `b4154b4` on `docs/consumer-skip-ci-paths`); the code handles both convention states.
- [x] T17 `internal/doc/doc_test.go`, `internal/fresh/fresh_test.go` - failing cases for `**` at start, middle and end compared with the docs-impact matcher, a committed change under `**` staling the review, and a dirty file under it clearing `feature_tree_clean` without staling (AC-06)
      Evidence: `go test ./internal/doc/ -run TestMatchCoversDoubleStar` fails on the 10 matching rows of the shared table `tests/vh-adlc/loop/covers-cases.json` (entries with `**` are skipped today), and `go test ./internal/fresh/ -run TestDoubleStarCovers` fails both cases: a committed change under `src/**/*.go` leaves the review fresh and an uncommitted one leaves the tree clean. `tests/vh-adlc/loop/covers-parity.test.ts` passes: the docs-impact matcher gives the table's answer for every row.
- [x] T18 `internal/doc/covers.go`, `internal/doc/lint.go` - `**` support with the docs-impact semantics; T17 and `go test ./...` pass (AC-06)
      Evidence: `go test ./...` passes, including `TestMatchCoversDoubleStar` over all 16 shared rows and both `TestDoubleStarCovers` cases (a committed change under `src/**/*.go` stales the review; an uncommitted one makes the tree dirty without staling it); `go vet ./...`, `golangci-lint run ./...` (0 issues), `gofumpt -l` and `go mod tidy -diff` are clean. `TestLintCodes` now flags a malformed `**` entry instead of every `**` entry, the deliberate contract change AC-06 makes, with the reason in a comment.
- [x] T19 `tests/vh-adlc/loop/investigate.test.ts` - failing fixtures with and without a covering analysis document and an open issue, including an issue with no covering document (AC-07)
      Evidence: `bun test tests/vh-adlc/loop/investigate.test.ts` fails with `Cannot find module '../../../plugins/vh-adlc/scripts/loop/investigate'`, which T20 adds.
- [x] T20 `plugins/vh-adlc/skills/vh-adlc-investigate/SKILL.md` - `findings_document: always`, the duplicate search, extending an existing analysis, issue updates as summary and link only, and the three verdicts; T19 passes (AC-07)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/ tests/vh-adlc/direct-operation-compatibility.test.ts` 94 pass, including T19's fixtures: a new document without a covering one, the covering document extended with the document count unchanged, an existing issue with no covering document giving a new document plus a summary-and-link update and no second issue, nothing written on request-only settings unless asked, and the three verdicts. The T19 fixture's issue title was corrected to contain the search term it is meant to match. Also touched: `scripts/loop/investigate.ts`, `scripts/loop/settings.ts`, `references/loop-settings.md` and the freeze test's phrase checks.
- [x] T21 `tests/vh-adlc/loop/claim.test.ts` - failing fixtures: a detached worktree at the tip, the session's own branch at the tip, an unrelated branch at the tip (refused, branch unmoved), a worktree behind an advanced remote, a stray change, a rejected push left pending, and `implement_worktree: isolated` from the primary worktree with and without a host worktree tool (AC-13, AC-18)
      Evidence: `bun test tests/vh-adlc/loop/claim.test.ts` fails with `Cannot find module '../../../plugins/vh-adlc/scripts/loop/claim'`, which T22 adds.
- [x] T22 `plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md`, `plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md`, `plugins/vh-adlc/references/authority.md` - claims from a host worktree with the branch-ownership check, and host-delegated isolation; T21 passes (AC-13, AC-18)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/ tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/check.test.ts tests/vh-adlc/lifecycle-boundaries.test.ts tests/vh-adlc/issue-authority.test.ts` 176 pass, including all nine T21 fixtures (detached and session-owned claims succeed; an unrelated branch, a stale tip and a stray change are refused with every local ref, the index and files unchanged; a rejected push keeps the local claim commit with no feature branch; isolation asks for a host worktree, stops without a tool, and continues elsewhere), plus a CLI claim test that checks the frontmatter edit and the pushed claim. Also touched: `scripts/loop/claim.ts`, `scripts/loop/settings.ts`, `scripts/loop/cli.ts`, `references/loop-settings.md` and the freeze test's phrase checks.
- [x] T23 `tests/vh-adlc/loop/glossary.test.ts` - glossary terms and rejected synonyms checked across `references/loop-settings.md`, the loop references and report templates (AC-19)
      Evidence: `bun test tests/vh-adlc/loop/glossary.test.ts` first failed (`Enrolled spec` and five other terms missing from the Terms table of `references/loop-settings.md`) with no rejected synonym found; after adding the six rows, `bun test tests/vh-adlc/loop/` passes in full. The synonym check covers `references/loop-settings.md`, `review-protocol.md`, `loop.md`, `authority.md` and every file in `scripts/loop/`, whose strings are the operation reports.
- [x] T24 `docs/specs/shared-development-loop.md` - final local verification at the feature head: `bun test tests/vh-adlc --timeout 60000`, `go test ./...`, `go vet ./...`, `golangci-lint run`, `go mod tidy -diff` and a four-archive `goreleaser release --snapshot --clean` all pass, recorded as evidence (AC-12)
      Evidence: At `5ab5f9f`: `bun test tests/vh-adlc --timeout 60000` 1524 pass, 1 fail (`fixtures.test.ts`, which this host fails because `/usr/local/bin/vh-adlc` reports 0.19.0 with a digest that does not match the lock; unrelated to the change); `go test ./...` passes; `go vet ./...` clean; `golangci-lint config verify` and `golangci-lint run ./...` (0 issues); `go mod tidy -diff` clean; `goreleaser release --snapshot --clean --skip=sign` built the darwin and linux amd64 and arm64 archives. Signing is not exercised by a snapshot build; the signed release path runs in Order step 1.
      Reopened after R-16: the pass condition is not established while the host-binary fixture fails; a run on a host without the stale `/usr/local/bin/vh-adlc`, or CI, closes it.
      Evidence: At `fa9e11a`, after T42: `bun test tests/vh-adlc --timeout 60000` 1550 pass, 0 fail; `go test ./...` passes; `go vet ./...` clean; `golangci-lint config verify` and `golangci-lint run ./...` (0 issues); `go mod tidy -diff` clean; `goreleaser release --snapshot --clean --skip=sign` built all four archives; the tree stayed clean. Signing is exercised only by the release workflow in Order step 1.

- [x] T35 `tests/vh-adlc/loop/review-route.test.ts` - failing Codex-style fixtures: a `--json` stub whose session log attests the requested model is stored even with `MODEL: unknown`; one attesting another model, one with no recorded model and one with no session log stay pending (AC-02)
      Evidence: `bun test tests/vh-adlc/loop/review-route.test.ts -t attestation` fails four of five: the attested-match case is pending on `MODEL: unknown`, and the other-model, no-model and missing-log cases are pending for a reason that does not mention attestation, because no attestation exists yet. The fifth (a self-report naming another model) already passes and guards that rule through T36.
- [x] T36 `plugins/vh-adlc/scripts/loop/review-route.ts`, `plugins/vh-adlc/scripts/loop/settings.ts`, `plugins/vh-adlc/references/loop-settings.md`, `plugins/vh-adlc/references/review-protocol.md` - `model_attestation: codex-session`: parse the JSON stream for the thread id and final message, read the served model from the session log, compare it with the requested model; T35 passes (AC-02)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/` 104 pass, including all five T35 fixtures: a session log recording `gpt-6.1-sol` lets a `MODEL: unknown` reply be stored with the attested model; another recorded model, no recorded model, a missing log and a conflicting self-report each stay pending. The T35 stub was corrected to pass the reply through a file, since bash kept its newlines escaped. Settings refuse `codex-session` without `--json` in `argv`. Also touched: `scripts/loop/cli.ts`.
- [x] T37 `tests/vh-adlc/loop/review-route.test.ts`, `plugins/vh-adlc/scripts/loop/review-route.ts` - files inside ignored directories outside `review_scratch` are content-hashed, not compared by size and modification time; a fixture that swaps a file for same-size content with its original modification time stays pending (AC-02)
      Evidence: `bun test tests/vh-adlc/loop/review-route.test.ts`: the same-size, preserved-mtime replacement inside an ignored directory failed (stored) before and is pending after; files in ignored trees are now content-hashed, and the route tests pass apart from the T39 and T41 fixtures this commit adds ahead of their fixes. This replaces the size and modification-time manifest that T7's evidence recorded.
- [x] T38 `tests/vh-adlc/loop/review-route.test.ts`, `plugins/vh-adlc/scripts/loop/cli.ts`, `plugins/vh-adlc/scripts/loop/settings.ts` - the review policy (route, instruction files, lenses) is read from `loop.yaml` at the dispatched commit; a fixture that edits the live file after committing still gets the committed policy (AC-02)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/ tests/vh-adlc/direct-operation-compatibility.test.ts` passes, including the new fixture: after committing a `loop.yaml` with a lens and an instruction file, a live edit that drops both was applied before (the stub returned `POLICY CHANGED`) and is ignored after; `cli.ts review` reads its route, instruction files, lenses and `review_scratch` from `loadLoopSettingsAt`, an export of the reviewed commit, and never parses the working tree's file.
- [x] T39 `tests/vh-adlc/loop/review-route.test.ts`, `plugins/vh-adlc/scripts/loop/review-route.ts` - export symlink containment follows intermediate links; a chained `d/back -> ..`, `leak -> d/back/../outside.txt` export stays pending (AC-02)
      Evidence: `bun test tests/vh-adlc/loop/review-route.test.ts`: the chained `d/back -> ..`, `leak -> d/back/../outside.txt` export was stored before and is pending after; containment now follows every intermediate link with `realpathSync`, and an unresolvable link counts as escaping. The direct escaping-symlink fixture still passes. Taken before T38, which does not depend on it.
- [x] T40 `tests/vh-adlc/loop/owned-process.test.ts`, `tests/vh-adlc/loop/review-route.test.ts`, `plugins/vh-adlc/scripts/triage/owned-process.ts` - cleanup also stops a detached helper that cleared its environment, through an ownership boundary that survives that, and leaves the review pending when it cannot confirm termination; success and timeout fixtures with such a helper (AC-02, R-18 F-01)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/ tests/vh-adlc/triage/owned-process.test.ts` 114 pass, including four new fixtures that all failed first: a helper started with `setsid env -i` (no owner marker) is stopped after a successful exit and after a timeout, an implementation reviewer's such helper cannot write after the review, and a host without a process boundary leaves the review pending. The boundary is an unprivileged PID namespace (`unshare --user --map-current-user --pid --fork --kill-child`), probed once per process; existing `runOwnedClient` callers keep the marker behavior unless they ask for the namespace. Limitation: a host without user namespaces, such as macOS, cannot run command-route reviews.
- [x] T41 `tests/vh-adlc/loop/review-route.test.ts`, `plugins/vh-adlc/scripts/loop/review-route.ts` - the preservation snapshot includes HEAD's symbolic target or detached state; a reviewer that detaches HEAD at the same commit leaves the review pending (AC-02, R-18 F-02)
      Evidence: `bun test tests/vh-adlc/loop/` 107 pass: a reviewer running `git switch --detach HEAD` at the same commit was stored before and is pending after, because the snapshot now records HEAD's symbolic target or `detached`.
- [x] T42 `tests/vh-adlc/fixtures/build.ts`, `tests/vh-adlc/fixtures.test.ts` - the fixture-lock installer runs with a PATH that leaves out `/usr/local/bin`, so a genuine vh-adlc install there cannot be mistaken for the fixture binary; `bun test tests/vh-adlc/fixtures.test.ts` passes on a host with vh-adlc in `/usr/local/bin` (AC-12)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/fixtures.test.ts tests/vh-adlc/ensure.test.ts` 31 pass on this host, where `fixtures.test.ts` failed before (also on `main` at `4bef34e`): the fixture-lock installer found the genuine `/usr/local/bin/vh-adlc` 0.19.0, whose digest matches the real lock but not the fixture lock. The installer and the fixture test now run with `PATH=/usr/bin:/bin`; `realBinary`, which wants the genuine binary, keeps `/usr/local/bin`.
- [x] T43 `tests/vh-adlc/loop/review-route.test.ts`, `tests/vh-adlc/loop/rungs.test.ts`, `tests/vh-adlc/loop/delivery.test.ts`, `tests/vh-adlc/loop/owned-process.test.ts` - failing fixtures for the implementation review's findings: a quoted pathname rewritten by a reviewer, an unstaged tracked change and a quoted path in the feature delta, a code change reverted inside the push range, and a host that forbids probing process groups (AC-02, AC-04, AC-15)
      Evidence: The five fixtures fail at `645882b`: the quoted-path rewrite is stored instead of pending, the unstaged `backend/app.go` and the quoted `docs/my notes/a b.md` drop out of the delta, the skip marker is set over a reverted code change, and `groupProbe` does not exist. They come from the Codex implementation review of `645882b`, whose own outcome stayed pending because another session moved shared refs during it.
- [x] T44 `plugins/vh-adlc/scripts/loop/git-paths.ts`, `plugins/vh-adlc/scripts/loop/review-route.ts`, `plugins/vh-adlc/scripts/loop/rungs.ts`, `plugins/vh-adlc/scripts/loop/cli.ts`, `plugins/vh-adlc/scripts/loop/delivery.ts` - every Git path read uses NUL-delimited output with status columns and renames preserved, and the push range collects the paths of every outgoing commit; the T43 path fixtures pass (AC-02, AC-04, AC-15)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/` 116 pass, 1 fail (the T45 probe fixture): the quoted `a b.txt` rewrite is now pending, the unstaged `backend/app.go` and the quoted `docs/my notes/a b.md` are in the delta and the backend rung applies, and the skip marker stays off over a reverted code change. `scripts/loop/git-paths.ts` reads every path list NUL-delimited, keeps status columns and both sides of a rename, and the push range is the union of each outgoing commit's paths.
- [x] T45 `plugins/vh-adlc/scripts/triage/owned-process.ts`, `tests/vh-adlc/loop/owned-process.test.ts` - a group probe denied with EPERM counts as unknown, so cleanup is never confirmed on such a host, and the cleanup fixtures state that host limit instead of failing; the T43 probe fixture passes (AC-02)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/ tests/vh-adlc/triage/owned-process.test.ts` 119 pass, 0 fail. `groupProbe` maps ESRCH to gone, success to alive and EPERM or anything else to unknown, and only gone confirms cleanup. The five confirmed-cleanup fixtures run where the host allows probing a process group and are skipped with a warning where it does not (the reviewer's Codex sandbox, where they had failed); the route keeps leaving such reviews pending.
Stackweaver adoption, on a Stackweaver feature branch against the candidate plugin:

- [x] T25 Stackweaver `tests/agent-loop/parity.json` - one row per legacy behavior of `agents/spec.md`, `tasks.md`, `implement.md`, `ship.md`, `investigate.md`, `reviewer.md` and the loop rules in `CLAUDE.md` and `AGENTS.md`, with excerpt hashes, home and contract; the schema test fails on an unmapped legacy rule (AC-08, AC-10)
      Evidence: Stackweaver `15354e49` on `feat/vh-adlc-development-loop`: `tests/agent-loop/parity.json` has 161 rows over 313 legacy line ranges in 13 files bound by blob and sha256 at `119d2ae4`. An independent recomputation of every excerpt hash, file hash and shared home path found no mismatch, and no numbered step or bullet in the 11 agent and command files is outside a row. Ten rows are superseded by recorded owner decisions (Q4, Q7, Q8, Q9) and one as stale against the single launcher and executor path.
- [x] T26 Stackweaver `tests/agent-loop/contract.test.ts`, `tests/agent-loop/retirement.test.ts` - a contract test per parity row, including the acceptance and issue rules, named E2E specs in kind, the live slot pass, the final full kind run and `make verify` skips, plus the retirement check over unenrolled non-terminal specs; they fail before adoption (AC-08, AC-10, AC-16, AC-17)
      Evidence: Stackweaver `93665b6a`: `VH_ADLC_LOOP_PLUGIN=<candidate plugin> bun test tests/agent-loop/` gives 70 pass, 97 fail before adoption: every row whose home is `agents/loop-project.md` or `.vh-adlc/loop.yaml`, the acceptance and issue rules and the model frontmatter check fail because those files do not exist yet.
- [x] T27 Stackweaver `.vh-adlc/loop.yaml` - Opus host routes for author and implementer, `gpt-6.1-sol` command routes for both reviewers, rungs, `ci_trigger: manual`, `post_merge_watch`, `skip_ci_paths`, `implement_worktree: isolated`, `review_scratch`, instruction files, lenses and `findings_document: always`; `vh-adlc settings read` accepts it (AC-01, AC-04, AC-05, AC-15, AC-18)
      Evidence: Stackweaver `b24171f4`: `.vh-adlc/loop.yaml` loads through the candidate reader with Opus host routes for author and implementer, `gpt-6.1-sol` Codex command routes with `codex-session` attestation for both reviewers (`-s read-only` for spec, `-s workspace-write` for implementation), seven rungs (verify, integration, named-e2e, kind, live-slot, browser, cross-engine), five lenses, `ci_trigger: manual`, the watch-merge watch, five skip paths, `implement_worktree: isolated` and `findings_document: always`. `VH_ADLC_LOOP_PLUGIN=<candidate> bun test tests/agent-loop/` 167 pass, 0 fail. The same commit rewords one sentence of the project procedure's issue-filing section.
- [x] T28 Stackweaver `agents/loop-project.md` - the local rules: slots, the verification ladder, direct-to-main and skip rules for non-feature work, satellites, `lessons.md`, the docs index rebuild, the implement-to-ship grant, acceptance and issue rules, and spec style; every parity row resolves to a home (AC-08, AC-10, AC-16)
      Evidence: Stackweaver `064b95ad`: `agents/loop-project.md` has the 39 sections the parity map names, each listing its rows by id, with the 10 superseded rows marked by the owner decision that replaced them. `VH_ADLC_LOOP_PLUGIN=<candidate> bun test tests/agent-loop/` goes from 70 to 127 pass; the 40 left fail only because `.vh-adlc/loop.yaml` (T27) does not exist yet. Taken before T27, because the settings reader refuses a `project_procedure` that does not exist.
- [x] T29 Stackweaver `.claude/commands/spec.md`, `tasks.md`, `implement.md`, `ship.md`, `investigate.md`, `AGENTS.md` - enrollment-aware adapters and plain-language routing, `model:` frontmatter checked against `loop.yaml`; T26 passes (AC-08, AC-16, AC-17)
      Evidence: Stackweaver `02844076` (merged with `origin/main` at `c450c9bc`): the five commands carry a Loop routing block that sends new and enrolled specs to the installed vh-adlc operations and keeps the native agent text below for unenrolled specs; `/investigate` always runs the shared operation; `AGENTS.md` routes plain-language requests the same way. `bun test tests/agent-loop` with `VH_ADLC_LOOP_PLUGIN` set passes in full, including the model-frontmatter and native-routability checks. Across `tests/agent-triage`, `tests/agent-audit` and `tests/agent-maintenance`, the branch fails the same 7 tests that clean `main` (`d86067ea`) fails today; the 10 extra failures seen before were the audit rehearsal refusing uncommitted runtime files and a stale default-branch ancestor, both gone after committing and merging `origin/main`. No legacy loop file changed on `main` after the parity base `119d2ae4`.
- [x] T30 Stackweaver `docs/internal/plans/` draft specs - every draft spec converted to the shared format; `vh-adlc lint` and `gate` pass and a manual-reading table records each gate condition (AC-09)
      Evidence: Stackweaver `56eef13f`: all 14 specs with status `draft` (one more than the 12 counted at `7861b9dc` and the 13 at `02716503`) use the shared format and stay draft; no content was removed, older review rows moved verbatim under Legacy review history, and every converted file passes `vh-adlc lint` with a binary built from this branch. `tests/agent-loop/evidence/draft-migration.md` records, per spec, the gate conditions expected from reading it and those `vh-adlc gate planned` observed; all 14 agree (fresh review, clean review and acceptance fail everywhere, plus open questions in eight). Open for the owner: goal lines written for seven specs from their own text, and ten converted specs without an Owner summary, which their next spec pass adds.
- [x] T31 Stackweaver `CLAUDE.md` - merge commits for feature PRs, the shared spec style, and model routing pointing at `loop.yaml`; `make verify` passes (AC-08, AC-14)
      Evidence: Stackweaver `05576976`: `CLAUDE.md` now lands feature PRs by merge commit with additive follow-ups and merged drift (Q4), keeps squash, amend and rebase for non-feature and bot PRs, lets specs cite `file:line` in Design (Q9), routes loop reviews through `.vh-adlc/loop.yaml` with the guarded `workspace-write` exception for implementation reviews, and names the shared loop for enrolled specs. The commit also records the changelog disposition the branch's merge of `main` needed; a first attempt was refused by the pre-commit changelog coverage check for that reason. The pre-commit `make verify` then passed, and `bun test tests/agent-loop` passes in full.
- [x] T32 Stackweaver `tests/agent-loop/README.md` - the rollback and reapply procedure, rehearsed on a disposable checkout with matching hashes for the docs index and unrelated workflow files (AC-11)
      Evidence: Stackweaver `ded67378`: `tests/agent-loop/README.md` documents the rollback and reapply procedure and `tests/agent-loop/rehearse.sh` performs it on a disposable shared clone. Run at `05576976` and again at `ded67378`: after reverting the six adoption commits, every adapted command, `AGENTS.md` and `CLAUDE.md` match `main` (`d86067ea`) by blob and the project procedure, loop settings and parity map are gone; after reapplying, the tree equals the branch head; the other agents and commands, `docs/internal/README.md`, `docs-coverage.json` and `.github/workflows` are unchanged throughout.
- [x] T33 Stackweaver `tests/agent-loop/evidence/` - a candidate plugin and binary in an isolated Claude Code profile run every adapted command and its plain-language form on enrolled and unenrolled disposable specs, start `/implement` on a clean main checkout, and take one disposable feature from claim to a merge-commit landing (AC-08, AC-12, AC-14, AC-18)
      Evidence: Stackweaver `bedc6b5d`, `tests/agent-loop/evidence/t33-trials.md`: seven capped headless Opus runs with the candidate plugin (`--setting-sources project --plugin-dir`, the only vh-adlc loaded) show `/spec review` and its plain-language form, `/tasks`, `/investigate` and `/implement` reaching the shared operations for enrolled specs, and `/spec review` on an unenrolled spec and `/ship` on a non-feature change reaching the native agents; the clone stayed clean. A disposable enrolled feature went through a Codex spec review (blocking, then `NO FINDINGS`), the owner's in-session acceptance of the fixture, `cli.ts isolation` (primary checkout to host worktree), `cli.ts claim`, a test-first task, rungs (first blocking on a real changelog gap and a skipped frontend check, then `make verify` 47 of 47), a Codex implementation review returning AC-01 met, `vh-adlc gate complete` in the worktree, and a merge-commit landing with every Review Log commit reachable; the primary checkout stayed byte-identical. Limitations: `gh` was disabled, so no PR and only the not-delivered verdict; r1 and r2 stopped at the turn cap after routing; the post-completion ship was a plain push.
- [x] T34 `tests/vh-adlc/evidence/loop-review-route/` - one real Codex CLI `gpt-6.1-sol` file-only spec review and one shell implementation review that returns `met` on a disposable feature, with transcripts and stored records (AC-02)
      Evidence: `tests/vh-adlc/evidence/loop-review-route/`: on a disposable feature at `196d98c7`, a real Codex CLI 0.163.0 file-only spec review and a shell implementation review, both through the candidate `cli.ts review` inside the route's PID namespace, came back `ready` with `gpt-6.1-sol` attested from Codex's session log. The implementation reviewer ran `bun test` and returned AC-01 `met`; the spec reviewer read the committed export and returned two findings. The repository stayed clean, and both stored record sets pass `vh-adlc review check`. A first real Codex attempt earlier (before attestation existed) stayed pending on `MODEL: unknown`, as designed.
      Correction: the review ran in Codex's read-only sandbox and the reviewer ran `bun test`, so it was a read-only spec review, not a file-only one, as AC-02 now says (R-22).
- [x] T46 Stackweaver `agents/loop-project.md`, `.claude/commands/*.md`, `tests/agent-loop/retirement.test.ts` - after the native agents retire, an adapted command or plain-language request given a terminal unenrolled document refuses before invoking any operation; a test simulates retirement in a disposable copy and checks the refusal rule in every adapter and the procedure (AC-17)
      Evidence: Stackweaver `9ba38077`: the four adapted commands, `agents/loop-project.md` and `AGENTS.md` refuse a terminal unenrolled document as closed history once the native agents are gone; `bun test tests/agent-loop` 169 pass, including the new rule check. A simulated-retirement test was drafted and dropped because it could not fail; the refusal is prose an operation follows, checked by the rule test and by implementation review.
- [x] T47 Stackweaver `tests/agent-loop/parity.json`, `agents/loop-project.md` - the labeling half of `investigate-files-issue` becomes its own row with a local home (an issue filed on request gets one type label and its state label from the existing vocabulary), since Q8 superseded only routine filing; `bun test tests/agent-loop` passes (AC-08, AC-10)
      Evidence: Stackweaver `8d47d7a6`: `investigate-labels-issue` binds `agents/investigate.md:65-66` (excerpt hash recomputed) to the project procedure's Issue filing section, where an issue filed on request gets one type label and its state label until vh-adlc's shared issue labels take over; `investigate-files-issue` stays superseded by Q8 for routine filing. `bun test tests/agent-loop` 168 pass. Raised by the shared-issue-labels session.
- [x] T48 `tests/vh-adlc/loop/review-route.test.ts` - failing fixtures: another process commits to a different branch of the shared repository during an implementation review and during a spec review (both must be stored), and the reviewer edits a file in the owning worktree from the private clone (must stay pending) (AC-02)
      Evidence: `bun test tests/vh-adlc/loop/review-route.test.ts -t "private review clone"` fails three of four at `df4a9c2`: a concurrent branch and tag created in the shared repository during an implementation review and during a spec review leave both pending, and the implementation reviewer runs in the owning worktree. The fourth (a reviewer editing the owning worktree by absolute path stays pending) already passes and guards that rule through T49.
- [x] T49 `plugins/vh-adlc/scripts/loop/review-route.ts` - implementation reviews run in a private `git clone --no-hardlinks` of the reviewed commit; the preservation check covers that clone in full and the owning worktree's files, index, HEAD and branch ref; T48 passes (AC-02)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/` 121 pass, including all four T48 fixtures: a branch and tag another process creates in the shared repository mid-review no longer leave an implementation or spec review pending, the implementation reviewer runs in its private clone at the reviewed commit, and an edit to the owning worktree by absolute path stays pending. The owning worktree's check now counts only HEAD and its own branch among refs, while the private clone is checked in full. Two earlier hardening fixtures (preserved-mtime ignored file, detached HEAD) were retargeted at the owning worktree by path, since a fresh private clone holds neither the pre-existing ignored file nor an attached HEAD.
- [x] T50 `tests/vh-adlc/evidence/loop-review-route/` - a real Codex spec review of a disposable spec that breaks a declared lens returns a finding for it, and the compliant control returns none (AC-03)
      Evidence: `tests/vh-adlc/evidence/loop-review-route/` (lens section of README.md, two outcome files, `lens-run.sh`): a real Codex spec review attested as `gpt-6.1-sol` returned a blocking satellite-lens finding for the disposable spec that names no satellite, and no missing-satellite finding for the compliant control, which drew a stricter related request about its publishing path instead. Both also flagged a genuine gap between the promised metrics and the criterion.
- [x] T51 Stackweaver `tests/agent-loop/evidence/` - the candidate plugin installs from a local marketplace into an isolated Claude Code profile with no credentials, and its skills and agents are discovered there (AC-12)
      Evidence: Stackweaver `da5b9a2e`, `tests/agent-loop/evidence/t51-install.md`: the candidate (archived at `429c3793`) installed from a local marketplace into an isolated Claude Code 2.1.322 profile with no credentials; `claude plugin details` showed 0.17.0, all 15 skills and both agents, and the installed cache carries `scripts/loop/`. No model call was made.
- [x] T52 Stackweaver `tests/agent-loop/evidence/` - one capped headless `/investigate` run, recorded as it ran; the criterion it targets becomes a residual if the run does not write its document (AC-07)
      Evidence: Stackweaver `8904c82b`, `t52-t53-attempts.md`: routed to `vh-adlc-investigate` and read the instruction files and project procedure, then used all 22 turns without writing; not retried at the owner's direction after about 1.7M tokens. AC-07 is a residual in #78.
- [x] T53 Stackweaver `tests/agent-loop/evidence/` - one capped headless `/implement` run from a clean main checkout, recorded as it ran; the criterion it targets becomes a residual if it does not claim from a host worktree (AC-18)
      Evidence: Stackweaver `8904c82b`, `t52-t53-attempts.md`: routed to `vh-adlc-implement`, read `implement_worktree: isolated`, and refused to claim because the run could not use the verified-binary installer and the trial remote held an earlier feature branch it treated as a competing claim; the main checkout stayed byte-identical. Not retried at the owner's direction after about 1M tokens. AC-18 is a residual in #78.
- [x] T54 `tests/vh-adlc/loop/review-route.test.ts`, `tests/vh-adlc/loop/cli.test.ts` - failing fixtures for R-21: record bytes after the headers (trailing spaces, CRLF), an implementation prompt that names the private clone, and a procedure rung result recorded through the CLI (AC-02, AC-04)
      Evidence: The three fixtures fail at `c51f22a`: `parseReply` trims `NO FINDINGS   ` and folds CRLF, the implementation prompt names the owning repository, and `cli.ts rungs` has no way to record a procedure result.
- [x] T55 `plugins/vh-adlc/scripts/loop/review-route.ts`, `plugins/vh-adlc/scripts/loop/cli.ts`, `plugins/vh-adlc/scripts/loop/rungs.ts`, `plugins/vh-adlc/references/review-protocol.md`, `plugins/vh-adlc/references/loop-settings.md`, `plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md`, `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md`, `tests/vh-adlc/direct-operation-compatibility.test.ts` - records keep their bytes, the implementation prompt and protocol name the private clone, `cli.ts rungs --record` combines a procedure result at the head, and the implement and ship Loop routes sections state that they replace the older claim and skip-marker steps when loop settings exist; T54 passes (AC-02, AC-04, AC-13, AC-15)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/ tests/vh-adlc/direct-operation-compatibility.test.ts` passes in full, including the T54 fixtures: records keep trailing spaces and CRLF after the headers, the implementation prompt and the protocol name the private clone, and `cli.ts rungs --record browser=passed:...` lets a procedure rung count at the head while a recorded failure still blocks. The implement and ship Loop routes sections now state that they replace Enter steps 1 and 6 and the documentation-only skip rule when loop settings exist. One attestation fixture now expects its reply's exact bytes, which end without a newline.
- [x] T56 `tests/vh-adlc/loop/owned-process.test.ts` - the confirmed-cleanup fixtures also require that this host lets the test read its own children's environments and run a PID namespace, and skip with a warning otherwise, so a sandbox that cannot observe cleanup does not fail them (AC-02)
      Evidence: `bun test --timeout 60000 tests/vh-adlc/loop/owned-process.test.ts` passes on this host with every fixture running. The confirmed-cleanup fixtures now also require that the host shows the test its own children's environments (`markedProcesses` finds a probe child) and, for the two namespace fixtures, that `pidNamespaceAvailable()` holds; otherwise they skip with a warning. R-21's three failures came from the reviewer's sandbox, where cleanup could not be observed; the route still leaves reviews pending there.
- [x] T57 `plugins/vh-adlc/scripts/loop/review-route.ts` - the header comment calls the spec review read-only, matching AC-02 and Design (AC-02)
      Evidence: Comment-only change, so no failing test applies. `grep -c file-only plugins/vh-adlc/scripts/loop/review-route.ts` returns 0, and `bun test tests/vh-adlc/loop/review-route.test.ts` still passes.
- [x] T58 `plugins/vh-adlc/scripts/loop/settings.ts`, `tests/vh-adlc/loop/cli.test.ts` - a repository without `loop.yaml` ignores a per-user executable override, so `cli.ts route` returns the host route with an override present for another repository (AC-01, R-23 F-01)
      Evidence: The new `cli.test.ts` case failed first with exit 2 (`only a command route has an executable`) and passes now; `bun test --timeout 60000 tests/vh-adlc/loop/ tests/vh-adlc/direct-operation-compatibility.test.ts` gives 132 pass, 0 fail. An override entry for a role this repository routes to the host is ignored, since the file serves every repository on the machine. The settings test that expected the refusal now expects the entry to be ignored, with the reason in a comment, and `references/loop-settings.md` says the same.
- [x] T59 `plugins/vh-adlc/scripts/loop/cli.ts`, `tests/vh-adlc/loop/rungs.test.ts`, `skills/vh-adlc-ship/SKILL.md` - `cli.ts rungs --merge <sha> --run true` lets the feature advance only on results recorded at that merge commit, so a later passing HEAD cannot stand in for a failing merge (AC-04, R-23 F-02)
      Evidence: The new `rungs.test.ts` case failed first (`cli.ts rungs --merge <failing merge> --run true` exited 0 with advance true after a later repair on main) and now exits 3 with `behavior` blocking. `bun test --timeout 60000 tests/vh-adlc/loop/ tests/vh-adlc/direct-operation-compatibility.test.ts` gives 133 pass, 0 fail. The ship skill says the delivery check runs from a checkout of the merge commit. I replanned this task's wording before starting it: binding the verdict to the merge keeps the checkout's ignored dependencies, which a fresh detached checkout would lack.
- [x] T60 Stackweaver `tests/agent-loop/rehearse.sh` - the rollback rehearsal reverts the whole current adoption range and reapplies it in a disposable clone, finishing with matching hashes at the current adoption commit (AC-11, R-23 F-03)
      Evidence: Stackweaver `495c8b06` and `83c06b5a`: `rehearse.sh` at `8904c82b` stopped reverting `02844076` (R-23), because its fixed commit list missed `9ba38077`. It now derives the adoption from the commits the branch adds over the main it last merged. At `495c8b06` it reverted all 14 commits, returned the 62 paths they touched to `d86067ea` (hash `90141ec173c2b8f8` at main and after), reapplied to an identical tree `3e4a9f27`, and kept the unrelated files and docs index at `e9349ee04972df8a` throughout. Output is in `tests/agent-loop/evidence/t60-rehearsal.md`. `bun test tests/agent-loop` gives 169 pass, 0 fail.

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
| 2026-11-13 | R-16 | spec | `236200bd18f7f23a23172f5a3e7ea107d44ff872` | gpt-6.1-sol | procedural | One blocking finding: the Codex implementation reviewer's writable sandbox conflicts with Stackweaver's read-only review rule. Four should-fix. A Codex attempt before it stayed pending on MODEL: unknown and is not recorded. |
| 2026-11-13 | R-17 | spec | `0c6a7402a82142997f27e4c535ebd7b71c5f711f` | gpt-6.1-sol | procedural | One blocking finding: review policy is read from the live loop.yaml rather than the dispatched commit. One should-fix on chained symlinks escaping the export. |
| 2026-11-13 | R-18 | spec | `ec582dcf7e43c0d83b5dd6fb953f0c83f799b785` | gpt-6.1-sol | procedural | No blocking findings; three should-fix: environment-clearing detached helpers, a detached HEAD at the same commit, and duplicate search across Stackweaver's findings homes. |
| 2026-11-13 | R-18 | spec | `ec582dcf7e43c0d83b5dd6fb953f0c83f799b785` | n/a | n/a | accepted by owner |
| 2026-11-13 | R-19 | spec | `3b0bb40b0ba12bb8d7cca26e1bbd4d05c6ba8538` | gpt-6.1-sol | procedural | No blocking findings after the private-clone revision; three should-fix. A Codex attempt before it stayed pending because other sessions pushed during it. |
| 2026-11-13 | R-20 | spec | `cdfde05bbfd7391a4702a2cf171e5418a560611b` | gpt-6.1-sol | procedural | No blocking findings; one should-fix on calling the Codex read-only spec review file-only. |
| 2026-11-13 | R-20 | spec | `cdfde05bbfd7391a4702a2cf171e5418a560611b` | n/a | n/a | accepted by owner |
| 2026-11-13 | R-21 | implementation | `b44d2f58cfc411efe1c537b458b2231297848be6` | gpt-6.1-sol | procedural | Six criteria met, AC-02 not met, twelve not verified; seven should-fix findings. Ran in a private clone. |
| 2026-11-13 | R-22 | spec | `df8ce7cf4aefb6850d7c72142ed7c3590263a180` | gpt-6.1-sol | procedural | No blocking findings; two should-fix on the stale owner summary and T34's file-only wording. |
| 2026-11-13 | R-22 | spec | `df8ce7cf4aefb6850d7c72142ed7c3590263a180` | n/a | n/a | accepted by owner |
| 2026-11-13 | R-23 | implementation | `0b5b5f234080598f63e28a5c97948719da3f0c47` | gpt-6.1-sol | procedural | Eight criteria met, AC-01, AC-04 and AC-11 not met, eight not verified; three should-fix findings. Ran in a private clone. |

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

### R-16

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design / External command route; Stackweaver adoption; Open Questions
EVIDENCE: The implementation-review example selects Codex's workspace-write sandbox. Stackweaver CLAUDE.md:202 explicitly requires independent reviews, including vh-adlc implementation reviews, through codex exec -s read-only. Its constitution rule requires exceptions to become owner Open Questions. The proposed constitution changes do not explicitly identify this sandbox-permission change, and Open Questions says None.
PROPOSAL: Raise the implementation review's sandbox permissions for an owner decision. Either retain read-only execution or explicitly authorize and document the narrower writable exception, including its scratch-output limits, in Stackweaver's constitution.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design / External command route; Tasks / T7; AC-02 Test Plan
EVIDENCE: Design requires content hashes of every ignored file outside review_scratch, and AC-02 rejects any file-content change there. T7 instead reports comparing ignored directories by path, size and modification time. plugins/vh-adlc/scripts/loop/review-route.ts, treeManifest and snapshot, confirm that substitution. A same-size replacement preserving modification time is invisible to that comparison. I cannot execute Git or vh-adlc; this counterexample follows from reading the snapshot implementation.
PROPOSAL: Retain content hashing for ignored directory contents outside review_scratch and add a same-size, preserved-mtime mutation fixture. Do not treat metadata comparison as establishing AC-02's content-preservation requirement.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design / External command route; AC-02
EVIDENCE: The codex-session paragraph permits a matching session-log model to replace MODEL: unknown, and AC-02's Test Plan explicitly requires storing that response. The same Design section subsequently says that an unknown model leaves the review pending without qualifying that rule for successful CLI attestation. These instructions prescribe different outcomes for the newly supported case.
PROPOSAL: State explicitly that unknown self-reporting is acceptable only after successful configured CLI attestation, while a missing header or conflicting named self-report still blocks storage. Keep the unattested requested-model rule separate.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design / Claiming from a host worktree; AC-13 and its Test Plan
EVIDENCE: Design permits claiming in any clean, tip-aligned worktree on another branch name, and AC-13's proof requires that other-branch fixture to claim without an ownership qualification. plugins/vh-adlc/references/authority.md:80-88 instead permits only a session-created or handed-over non-default branch and forbids advancing an unrelated branch. T21 and T22 also describe refusing the unrelated-branch case. The normative claim contract remains broader than the implemented preservation rule.
PROPOSAL: Fold the ownership requirement into Design, AC-13 and its Test Plan. Distinguish a session-owned branch that succeeds from an unrelated tip-aligned branch that remains unchanged.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary; Tasks / T24
EVIDENCE: The owner summary says validation is spec review only, with nothing executed. Tasks records extensive executed checks and T24 is checked with a done condition that all listed checks pass, although its evidence reports 1524 passing tests and one failure. These are inconsistent current validation claims, independently of whether the historical executions can be reproduced. File-only access prevents rerunning the checks.
PROPOSAL: Refresh the owner summary to distinguish recorded implementation checks, their failure and limitations, pending real-route proof, and unverified publication claims. Leave T24 incomplete until its stated passing condition is established, or explicitly revise its remaining work without representing the failed suite as passing.

### R-17

FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design / External command route; Project procedure and review lenses; AC-02 Test Plan
EVIDENCE: Design promises that uncommitted edits cannot shape a spec review and that route arguments come from the committed file. However, plugins/vh-adlc/scripts/settings-file.ts:16-30 reads working-tree settings, and scripts/loop/cli.ts:121-131 constructs the reviewer prompt using loopContext(settings) before exporting the commit. An uncommitted loop.yaml edit can therefore remove instruction files, change a blocking lens or replace its check, influencing a review stored against the unchanged target. The existing instruction-edit fixture tests exported AGENTS.md content, not this dispatch-policy input. I cannot run Git, vh-adlc or Codex; this follows from reading the dispatch and settings readers.
PROPOSAL: Bind reviewer routes, instruction-file declarations and lenses to the dispatched commit before constructing the prompt, retaining only the documented executable override. Add an end-to-end fixture that changes live loop.yaml after committing and proves that the committed review policy still applies.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance notes; Tasks / T7; Design / External command route
EVIDENCE: T7 claims export symlink containment is implemented, but plugins/vh-adlc/scripts/loop/review-route.ts:103-107 checks targets with lexical resolve(), without following intermediate symlinks. With committed links d/back -> .. and leak -> d/back/../outside.txt, both lexical targets remain inside the export, while opening leak reaches outside.txt in the export's parent. The direct escaping-symlink fixture does not cover this case, so live content can still enter the supposedly committed-only review. I cannot execute the Git or reviewer fixture; this counterexample follows from the path-resolution code.
PROPOSAL: Check fully resolved symlink destinations, including intermediate links, and leave the review pending when containment cannot be established. Add the chained-link case before treating T7's containment claim as proved.

### R-18

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design / External command route; Tasks / T6; AC-02 Test Plan
EVIDENCE: Design promises that no reviewer helper outlives the final preservation check, and T6 claims detached-descendant cleanup is complete. plugins/vh-adlc/scripts/triage/owned-process.ts identifies escaped descendants solely through an inherited environment marker. A helper launched with a cleared environment into a new session is outside both detection mechanisms; cleanup can report confirmed while that helper remains able to write after the snapshot. The fixtures retain the marker. Process fixtures, Git and vh-adlc cannot be executed with the available tools; this counterexample follows from reading the cleanup code.
PROPOSAL: Add successful-exit and timeout fixtures whose detached helper clears its environment. Establish cleanup through an ownership boundary that survives environment clearing, and leave the review pending when termination cannot be confirmed.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design / External command route; Tasks / T7; AC-02 Test Plan
EVIDENCE: AC-02 rejects changes to the owning worktree's HEAD, but plugins/vh-adlc/scripts/loop/review-route.ts:70-88 snapshots only HEAD's resolved commit and refs' resolved object IDs. A reviewer executing git switch --detach HEAD changes the checkout's branch attachment without changing those values, status, index entries or file contents. The route can therefore accept a review after changing the owning checkout. The preservation fixtures do not cover this case. Git and vh-adlc execution are unavailable; this follows from reading the snapshot fields.
PROPOSAL: Include HEAD's symbolic target or detached state in the preservation identity. Add a fixture that detaches HEAD at the same commit and require a pending outcome with no stored review.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design / Investigation defaults; AC-07 and its Test Plan
EVIDENCE: Stackweaver agents/investigate.md:50-51 searches all of docs/internal/ and extends an existing covering document. CLAUDE.md:297 names analysis, bug-report, research and plan homes. The proposed search covers only analysis documents and open issues; plugins/vh-adlc/scripts/loop/investigate.ts likewise searches only analysis_dir. An already documented defect under docs/internal/bug-reports/ without an open issue can consequently acquire a second analysis document while every AC-07 scenario passes. This narrows a native capability despite the stated parity requirement.
PROPOSAL: Preserve duplicate discovery across Stackweaver's existing findings homes, independently of the destination for new investigations. Add a covering bug-report or research-document scenario that reuses the existing artifact rather than creating another.

### R-19

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design / External command route
EVIDENCE: This section says an implementation review “runs the command from the owning worktree, with no worktree creation”, then requires it to run from a private clone checked out at the reviewed commit. These prescribe different execution locations for the same route.
PROPOSAL: Remove the owning-worktree launch requirement and consistently name the private clone in the dispatch prompt, command working directory and preservation fixtures.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design / Investigation defaults; AC-07 and its Test Plan
EVIDENCE: The proposed duplicate search covers analysis documents and open issues. Stackweaver agents/investigate.md:50-51 searches all of docs/internal/ and extends an existing covering document; CLAUDE.md also names bug-report, research and plan homes. A covering bug report without an open issue can therefore acquire a duplicate analysis document while AC-07 passes. The current scripts/loop/investigate.ts searches only analysis_dir.
PROPOSAL: Preserve duplicate discovery across Stackweaver’s existing findings homes, independently of the destination for new documents. Add a covering bug-report or research-document case that extends the existing artifact.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary
EVIDENCE: The summary says T24 remains open and T25-T39 are not done. Tasks marks those tasks complete, records a later passing T24 suite, and includes stored T34 outcomes under tests/vh-adlc/evidence/loop-review-route/. It also describes implementation reviews as operating against shared refs rather than explaining the new private-clone boundary. Git, vh-adlc and tests cannot be executed with the available tools; these contradictions follow from the document and stored files.
PROPOSAL: Refresh the summary against the current task records, distinguish recorded results from independently verified execution, and explain the private-clone preservation boundary and remaining work before renewed acceptance.

### R-20

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design / External command route; AC-02 and T34
EVIDENCE: AC-02 requires a file-only spec review, but its Codex example restricts filesystem writes rather than removing shell access. tests/vh-adlc/evidence/loop-review-route/spec-outcome.json explicitly reports “I ran bun test”. The recorded real-route proof therefore does not establish file-only operation. I cannot execute Git, Codex or vh-adlc; this follows from the committed invocation and reply.
PROPOSAL: Distinguish a shell-capable spec review of a read-only export from a genuinely file-only route. Either obtain acceptance for the former contract or enforce file-only tools and repeat the real-route proof.

### R-21

CRITERION: AC-01 A repository's `.vh-adlc/loop.yaml` names a route for each loop role, every SDD operation dispatches according to it, a `command` route is accepted only for the two reviewer roles, no vh-adlc agent or skill file names a model, and a repository without the file behaves as it does at `a7bfca99`.
VERDICT: met
EVIDENCE: Ran `bun test tests/vh-adlc/loop/ --timeout 60000` at b44d2f58. The settings, role mapping, resume, no-settings and model-free checks passed. Inspected the operation skills and their route instructions. These checks establish the routing contract; they do not establish every Stackweaver adapter invocation.

CRITERION: AC-02 From a Claude Code session, a file-only spec review that reads only a read-only export of the target commit and a shell-enabled implementation review run through declared command routes on `gpt-6.1-sol` against an exact commit; the implementation review can return `met` from checks it ran; the route, instruction files and lenses come from `loop.yaml` at the reviewed commit; a matching reply with the dispatched `TARGET` is stored verbatim and passes `review check`, where a route with `model_attestation: codex-session` matches on the model Codex's session log records rather than the reviewer's self-report; and a mismatched model or target, a missing header, a non-zero exit, a timeout, a failed process cleanup or any change outside the declared `review_scratch` directories to the private clone's `HEAD`, refs, index entries, status, file contents or ignored-file list, or to the owning worktree's `HEAD`, branch ref, index entries, status, file contents or ignored-file list, leaves the review pending, while another session's push to the shared refs during the review does not with no Review Log row.
VERDICT: not met
EVIDENCE: Ran the focused suite and a disposable CLI probe at b44d2f58. The probe ran in a private clone but received the owning repository as its dispatch directory. It returned `NO FINDINGS   \n`, while the ready outcome contained `NO FINDINGS\n`, contradicting verbatim preservation. The focused suite also failed three cleanup tests. Historical Codex outcomes were inspected, but their executions were not observed in this review.

CRITERION: AC-03 Every SDD operation reads the declared project procedure and instruction files, and a spec review flags a document that contradicts a declared instruction file or lens.
VERDICT: not verified
EVIDENCE: At b44d2f58, the context and prompt fixtures passed, including a stub reviewer applying a declared lens. Inspected the operation reading instructions and stored lens outcomes. No real reviewer execution establishing both the instruction-file and lens cases was observed in this review.

CRITERION: AC-04 Implement and ship run each declared verification rung whose path condition holds over the whole feature delta, or that is declared always, and report every rung as passed, failed or not run with a reason; a failed rung, or one that could not run without the owner allowing it for that run, means the feature branch is not pushed and the feature is not complete or delivered; with no rungs declared they keep the current command lookup.
VERDICT: not verified
EVIDENCE: The rung fixtures passed at b44d2f58, covering feature deltas, stale results, failures, allowances, skipped subchecks and fallback lookup. Inspected implement and ship instructions. Their complete advancement paths were not executed. The CLI also lacks an input for recording completed procedure rungs, although its instructions require an advancing result before push.

CRITERION: AC-05 With `ci_trigger: manual`, ship reports CI as not triggered by policy and dispatches nothing; with a `post_merge_watch` declared, a feature whose merge can publish is reported delivered only after that command exits 0, a feature whose actual merge commit carries the skip marker and touches only skip-eligible paths is reported delivered with no publication path and no watch run, every unmarked merge commit runs the watch, and a watch that fails only because no workflow ran leaves the feature reported blocked, not delivered.
VERDICT: met
EVIDENCE: Ran the delivery fixtures at b44d2f58. Manual CI reporting, marked and unmarked merges, watch failure followed by success, delayed completion and the no-workflow blocked result passed. Inspected ship's calls to these helpers. No production publication was tested.

CRITERION: AC-06 Feature-document lint accepts `covers` entries containing `**`, they match the same paths as the docs-impact matcher, and under such an entry a committed change makes the applicable review stale while an uncommitted change makes `feature_tree_clean` false, as for a plain entry.
VERDICT: met
EVIDENCE: Ran `go test ./internal/doc/ ./internal/fresh/` and the Bun covers-parity test at b44d2f58; all passed. Built the candidate binary under `/tmp` and observed successful lint on all 14 migrated drafts, including their recursive covers patterns.

CRITERION: AC-07 With `findings_document: always`, investigate writes its findings document, or extends the existing analysis document that already covers the case without creating a second one, never leaves an issue holding the only copy of its findings, reports any duplicate analysis document or open issue it found, and ends with one of the three verdicts.
VERDICT: not verified
EVIDENCE: The findings-plan and verdict fixtures passed at b44d2f58. They establish planning decisions rather than document-writing behavior. Inspected Stackweaver's T52 transcript summary at 8904c82b, which records a capped run ending without a document. No completed investigation execution was observed here. The criterion retains its residual.

CRITERION: AC-08 Stackweaver's `/spec`, `/spec review`, `/tasks`, `/implement`, `/ship` for features and `/investigate` and the matching plain-language requests through `AGENTS.md` run the installed vh-adlc operations with Stackweaver's settings for every enrolled spec and, until the native agents retire, the native agents for every unenrolled one (after retirement, AC-17's refusal applies to terminal unenrolled documents), new specs are written enrolled, and every row of the committed parity map passes its contract test.
VERDICT: not verified
EVIDENCE: Ran Stackweaver's `bun test tests/agent-loop` at 8904c82b with the reviewed plugin; 169 tests passed, including every parity row. Inspected adapters, AGENTS.md and T33 evidence. The stored trials cover selected routes and stop at intake; they do not cover the complete slash-command and plain-language matrix through native re-review and completion. Those executions were not observed here.

CRITERION: AC-09 Every Stackweaver spec in the migration set (the draft specs, plus each planned, in-progress or parked spec the owner moved) passes `vh-adlc lint`, its gate results agree with a manual reading of the document, and each moved spec that was planned or in progress carries a fresh review and an owner acceptance row at its converted baseline.
VERDICT: met
EVIDENCE: At Stackweaver 8904c82b, independently enumerated the 14 drafts and ran candidate `lint` and `gate planned` with the pinned rules. All lint checks passed. Every gate refused missing current reviews and acceptance; eight also refused open questions. Inspected the relevant question and Review Log sections and found those results consistent. The migration set contains drafts, with no moved planned or in-progress spec requiring the final clause.

CRITERION: AC-10 Stackweaver's local behaviors stay available with unchanged invocation: worktree slots, direct-to-main non-feature shipping through its own `/ship`, `[skip ci]` rules, `watch-merge.sh`, the triad and satellite lenses, the browser-pass summary table, and `/implement` handing straight to ship.
VERDICT: not verified
EVIDENCE: At Stackweaver 8904c82b, inspected the retained scripts, adapters, settings and project procedure; the parity tests passed. Automatic approval review rejected the operational help checks because it considered the scripts capable of changing shared services. Their execution and the complete implement-to-ship behavior were therefore not observed.

CRITERION: AC-11 A disposable Stackweaver checkout rolls back to the native loop and reapplies the adoption, with the docs index and unrelated workflow files byte-identical afterwards.
VERDICT: not verified
EVIDENCE: Inspected `tests/agent-loop/rehearse.sh` and its documented procedure at Stackweaver 8904c82b. Automatic approval review rejected executing the rehearsal because it might mutate repository state. No rollback, reapplication or resulting hash comparison was observed in this review.

CRITERION: AC-12 On the feature branch, a GoReleaser snapshot build produces all four runtime archives, the plugin's `knowledge.md` pin names the merged vhco-pro/docs revision, and a candidate plugin installed from the branch in an isolated profile runs every adapted Stackweaver command through its entry points.
VERDICT: not verified
EVIDENCE: At b44d2f58, ran GoReleaser snapshot with the committed build configuration, redirecting dist to `/tmp` and skipping signing. All four archives were produced. Inspected knowledge.md's c70769eb pin and the stored T51 installation outputs. The isolated installation and every adapted command were not executed in this review, and merged ancestry of the docs pin was not independently established. Post-merge publication is not required by this criterion.

CRITERION: AC-13 Implement claims a planned feature from a clean worktree whose `HEAD` is the fetched default branch tip, detached or on a branch this session created or was handed over, pushes the claim to the default branch and continues in that worktree on the feature branch; with stray changes or a stale tip it stops before writing anything, and when the push is rejected it keeps the local claim commit, creates no feature branch and reports the claim pending.
VERDICT: not verified
EVIDENCE: The claim and CLI fixtures passed at b44d2f58, including detached and owned branches, unrelated-branch refusal, stale and dirty worktrees, and rejected pushes. The installed implement operation was not taken through those scenarios. Its Enter instructions still require the default branch to be checked out, conflicting with the new host-worktree route.

CRITERION: AC-14 A Stackweaver feature taken through the adopted loop passes its completion gate in its owning worktree before merge, and after it lands by merge commit every commit its Review Log names is reachable from `main`.
VERDICT: not verified
EVIDENCE: Inspected Stackweaver's T33 records at 8904c82b, which describe a disposable completion gate and merge-commit landing. That flow was not executed in this review. The report also distinguishes its manually driven command flow from a complete adapted ship invocation.

CRITERION: AC-15 With `skip_ci_paths` declared and a resolved delivery convention that supports it, a feature delivery whose commit, push range and PR diff touch only feature documents, Markdown onboarding files or declared paths carries the skip marker, and any other change in the delivery leaves it off; when the resolved convention does not support it, the marker follows the documentation-only rule and the report says the setting was ignored and why.
VERDICT: not verified
EVIDENCE: At b44d2f58, the skip-marker fixtures passed, including mixed changes, reverted outgoing code and unsupported conventions. The complete ship operation was not executed. Its Deliver instructions still prohibit the marker for every non-documentation file, conflicting with the configured-path behavior.

CRITERION: AC-16 In Stackweaver, `/spec review` never moves an enrolled spec to `planned` without an owner acceptance row, and `/spec` and `/investigate` create no issue without an explicit request or accepted scope.
VERDICT: met
EVIDENCE: Inspected the shared spec and investigate operations and Stackweaver's acceptance, issue-filing and enrollment rules. The Stackweaver contract checks passed at 8904c82b. Independently ran planned gates on all 14 enrolled drafts and observed refusal for missing acceptance. No issue was created during these checks.

CRITERION: AC-17 Stackweaver's native spec, tasks, implement and reviewer agent files stay routable while any non-terminal spec, domain-extension plans included, is unenrolled, are retired only after none is, and after retirement an adapted command given a terminal unenrolled document refuses without running anything.
VERDICT: not verified
EVIDENCE: The retirement tests passed at Stackweaver 8904c82b and confirmed retained native files and domain-extension coverage. Inspected the refusal instructions. The post-retirement test checks text patterns; it does not execute each adapter and plain-language request with retired agents. That refusal behavior was not observed.

CRITERION: AC-18 With `implement_worktree: isolated`, implement started in the primary worktree continues in a host-created isolated worktree, or stops before writing on a host without a worktree tool, and the primary worktree's branch, `HEAD`, index and files are unchanged afterwards; without the setting, behavior is unchanged.
VERDICT: not verified
EVIDENCE: The deterministic isolation fixtures passed at b44d2f58, including the no-tool stop and setting-off behavior. Inspected Stackweaver's T53 evidence at 8904c82b; the capped run stopped before claiming a host worktree. A successful Claude Code continuation from the primary checkout was not observed in this review. The criterion retains its residual.

CRITERION: AC-19 The settings reference, the operation reports and Stackweaver's adapters and project procedure use each glossary term with the meaning the Glossary gives it, and introduce no other name for those concepts.
VERDICT: met
EVIDENCE: The glossary tests passed at b44d2f58. Read the settings reference, report fields, Stackweaver adapters and project procedure against the accepted Glossary. Their use of the declared concepts agrees with those definitions.

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: plugins/vh-adlc/scripts/loop/cli.ts:131; references/review-protocol.md
EVIDENCE: A disposable implementation-review probe ran from `/tmp/vh-adlc-review-run-giQHWP/clone`, but its prompt named `/tmp/vh-review-probe-_atsn8r8/owner` as Repository directory. cli.ts constructs the prompt with the owning repo before preparing the clone. review-protocol.md also still directs implementation reviews to the owning worktree. Following that dispatch sends inspection and checks outside the intended committed clone.
PROPOSAL: Construct the implementation dispatch after preparing the clone and name that clone consistently in the prompt and protocol. Add a fixture that follows the dispatched repository directory, rather than checking only the process working directory.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: plugins/vh-adlc/scripts/loop/review-route.ts:137-146
EVIDENCE: The disposable CLI probe returned `NO FINDINGS   \n`; the ready outcome exposed `NO FINDINGS\n` as records. parseReply normalizes line endings and trims record whitespace before returning it. Comparing stored records with that transformed value cannot establish byte-for-byte preservation of the reviewer's returned records.
PROPOSAL: Remove the two headers while preserving the remaining record bytes. Test trailing whitespace, blank lines and CRLF replies against the exact returned payload.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: AC-02; External command route; tests/vh-adlc/evidence/loop-review-route/spec-outcome.json
EVIDENCE: The accepted criterion requires a file-only spec review. The configured Codex invocation uses a read-only filesystem sandbox, and the stored ready spec response explicitly says it ran `bun test`. Neither the route code nor that invocation establishes a file-only tool restriction. The recorded proof therefore demonstrates a shell-capable review.
PROPOSAL: Enforce a file-only reviewer tool boundary and repeat the proof, or obtain acceptance for a shell-capable spec-review contract and revise its criterion and proof accordingly.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md:69-87
EVIDENCE: Loop routes permits claiming from detached or session-owned host branches through cli.ts claim. Enter step 1 instead requires a worktree holding the default branch, and step 6 permits continuation only when that worktree holds the default branch at the claim commit. The helper fixtures pass, but the operation still instructs an eligible detached host worktree to stop.
PROPOSAL: Replace the old claim procedure with the host-worktree procedure while preserving the gate, lint and claim-message requirements. Exercise the installed operation from a detached and a session-owned worktree.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md:84-88
EVIDENCE: Loop routes tells ship to decide the marker through cli.ts skip, which accepts configured paths under a supporting convention. Deliver then forbids the marker for any non-documentation file and permits only feature documents and Markdown onboarding files. An agents-only delivery consequently receives conflicting instructions despite the passing helper tests.
PROPOSAL: Make Deliver use the resolved convention and cli.ts skip result, including its unsupported-pin report. Remove the unconditional documentation-only restriction from that path.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: tests/vh-adlc/loop/owned-process.test.ts; plugins/vh-adlc/scripts/triage/owned-process.ts
EVIDENCE: The focused suite produced 118 passes and 3 failures at b44d2f58. Rerunning owned-process.test.ts reproduced 4 passes and the same 3 failures: detached-helper cleanup, timed-out helper cleanup, and PID-namespace timeout cleanup. They expected confirmed cleanup but received false. In the timeout cases the parent was reaped and survivors was empty, while group_absent remained false. These observations do not establish that a live helper survived.
PROPOSAL: Determine whether the remaining groups contain live processes, zombies or a cleanup race. Correct the runner or host-aware assertions while retaining fail-closed behavior for genuinely unconfirmed cleanup.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: plugins/vh-adlc/scripts/loop/cli.ts:112-121; scripts/loop/rungs.ts:43-44
EVIDENCE: The CLI always regenerates procedure-rung results as not run and accepts only owner allowances, with no input for a completed procedure's recorded result. The passing unit test manually replaces that result in memory before calling mayAdvance. Stackweaver declares named-e2e as an always-applicable procedure, and its stored rungs2.json still reports advance false after verification passed. The operation instructions require an advancing result before push.
PROPOSAL: Provide and document a way to combine executed procedure results with command results at the exact commit. Test advancement through the supported entry point after a procedure passes, without representing that pass as an owner allowance.

### R-22

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary
EVIDENCE: docs/specs/shared-development-loop.md:97-102 still lists the private clone and T50-T53 runs as future work. plugins/vh-adlc/scripts/loop/review-route.ts:211-215 implements the clone, and Stackweaver tests/agent-loop/evidence/t52-t53-attempts.md records unsuccessful investigation and isolation trials with deferred proof for AC-07 and AC-18. The summary omits those limitations and the current revision's change from file-only to read-only review.
PROPOSAL: Refresh the summary before acceptance to explain this revision, the completed clone implementation, and the outstanding proof and residual decisions. Distinguish recorded attempts from verified outcomes.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Tasks / T34
EVIDENCE: docs/specs/shared-development-loop.md:716-717 still claims a completed file-only spec review. tests/vh-adlc/evidence/loop-review-route/run.sh:34 configures read-only filesystem access, while spec-outcome.json:6 records the reviewer's statement that it ran bun test. This supports the revised read-only contract, but does not establish file-only operation.
PROPOSAL: Correct T34's description and evidence wording, together with the evidence README and runner comment, to describe the read-only review actually configured. Preserve the returned reviewer records verbatim.

### R-23

CRITERION: AC-01 A repository's `.vh-adlc/loop.yaml` names a route for each loop role, every SDD operation dispatches according to it, a `command` route is accepted only for the two reviewer roles, no vh-adlc agent or skill file names a model, and a repository without the file behaves as it does at `a7bfca99`.
VERDICT: not met
EVIDENCE: At 0b5b5f2, routing, model-free and compatibility fixtures passed. A disposable CLI probe without loop.yaml returned the host author route with no override, but exited 2 when a global executable-only spec_reviewer override existed. The error was "only a command route has an executable". Configuring another consumer therefore breaks the required no-file behavior.

CRITERION: AC-02 From a Claude Code session, a read-only spec review that reads only a read-only export of the target commit and writes nothing, and a shell-enabled implementation review run through declared command routes on `gpt-6.1-sol` against an exact commit; the implementation review can return `met` from checks it ran; the route, instruction files and lenses come from `loop.yaml` at the reviewed commit; a matching reply with the dispatched `TARGET` is stored verbatim and passes `review check`, where a route with `model_attestation: codex-session` matches on the model Codex's session log records rather than the reviewer's self-report; and a mismatched model or target, a missing header, a non-zero exit, a timeout, a failed process cleanup or any change outside the declared `review_scratch` directories to the private clone's `HEAD`, refs, index entries, status, file contents or ignored-file list, or to the owning worktree's `HEAD`, branch ref, index entries, status, file contents or ignored-file list, leaves the review pending, while another session's push to the shared refs during the review does not with no Review Log row.
VERDICT: not verified
EVIDENCE: Ran the loop and compatibility suites at 0b5b5f2: the final run returned 126 pass, 5 skip, 0 fail. Review-route fixtures covered preservation, committed policy, model attestation, private clones and exact reply bytes. An initial timeout assertion failed on unconfirmed cleanup, then passed alone and in the repeated suite. Five cleanup checks were skipped because the host could not observe their prerequisites. Inspected the stored real-route outcomes, but did not observe both real CLI reviews and subsequent record storage in this review.

CRITERION: AC-03 Every SDD operation reads the declared project procedure and instruction files, and a spec review flags a document that contradicts a declared instruction file or lens.
VERDICT: not verified
EVIDENCE: At 0b5b5f2, context and lens fixtures passed. Inspected all seven operation reading instructions, prompt construction and stored lens outcomes. The executed reviewer fixtures use stubs; no real reviewer execution establishing both contradiction cases was observed here.

CRITERION: AC-04 Implement and ship run each declared verification rung whose path condition holds over the whole feature delta, or that is declared always, and report every rung as passed, failed or not run with a reason; a failed rung, or one that could not run without the owner allowing it for that run, means the feature branch is not pushed and the feature is not complete or delivered; with no rungs declared they keep the current command lookup.
VERDICT: not met
EVIDENCE: Rung fixtures passed at 0b5b5f2, including procedure-result recording. A disposable post-merge CLI probe requested merge 3f0e327, where the mandatory check would fail, while HEAD was later repair 994c0b2. The command tested the later checkout, reported its commit as passed, and returned advance true. The required check at the actual merge commit was bypassed.

CRITERION: AC-05 With `ci_trigger: manual`, ship reports CI as not triggered by policy and dispatches nothing; with a `post_merge_watch` declared, a feature whose merge can publish is reported delivered only after that command exits 0, a feature whose actual merge commit carries the skip marker and touches only skip-eligible paths is reported delivered with no publication path and no watch run, every unmarked merge commit runs the watch, and a watch that fails only because no workflow ran leaves the feature reported blocked, not delivered.
VERDICT: met
EVIDENCE: Ran the delivery fixtures at 0b5b5f2. Manual CI reporting, marked and unmarked merges, watch failure followed by success, delayed completion and the no-workflow blocked verdict passed. Inspected ship's instructions invoking these helpers. Production publication was not exercised.

CRITERION: AC-06 Feature-document lint accepts `covers` entries containing `**`, they match the same paths as the docs-impact matcher, and under such an entry a committed change makes the applicable review stale while an uncommitted change makes `feature_tree_clean` false, as for a plain entry.
VERDICT: met
EVIDENCE: Ran go test ./internal/doc/ ./internal/fresh/ and the Bun covers-parity checks at 0b5b5f2; all passed. Independently built the candidate binary and observed successful lint on all 14 migrated drafts. The broader Go suite was stopped while stalled in the bwrap host probe and did not pass.

CRITERION: AC-07 With `findings_document: always`, investigate writes its findings document, or extends the existing analysis document that already covers the case without creating a second one, never leaves an issue holding the only copy of its findings, reports any duplicate analysis document or open issue it found, and ends with one of the three verdicts.
VERDICT: not verified
EVIDENCE: Findings-plan and verdict fixtures passed at 0b5b5f2. These establish planning decisions, not a completed investigation writing its document. Inspected the Stackweaver T52 evidence at 8904c82b, which records a capped attempt ending without a findings document. No completed investigation was observed here. The owner-approved residual remains applicable.

CRITERION: AC-08 Stackweaver's `/spec`, `/spec review`, `/tasks`, `/implement`, `/ship` for features and `/investigate` and the matching plain-language requests through `AGENTS.md` run the installed vh-adlc operations with Stackweaver's settings for every enrolled spec and, until the native agents retire, the native agents for every unenrolled one (after retirement, AC-17's refusal applies to terminal unenrolled documents), new specs are written enrolled, and every row of the committed parity map passes its contract test.
VERDICT: not verified
EVIDENCE: Ran Stackweaver's bun test tests/agent-loop at 8904c82b against the plugin from 0b5b5f2: 169 pass, 0 fail. Inspected the adapters, project procedure, AGENTS.md and T33 trials. The recorded trials stop at selected intake routes and do not execute the complete slash-command and plain-language matrix through native re-review and completion. That matrix was not observed here.

CRITERION: AC-09 Every Stackweaver spec in the migration set (the draft specs, plus each planned, in-progress or parked spec the owner moved) passes `vh-adlc lint`, its gate results agree with a manual reading of the document, and each moved spec that was planned or in progress carries a fresh review and an owner acceptance row at its converted baseline.
VERDICT: met
EVIDENCE: Independently enumerated the 14 enrolled drafts at Stackweaver 8904c82b and ran candidate lint and gate planned on each. All lint checks passed. Every gate refused missing current reviews and acceptance; eight also refused open questions. Inspected the question and review sections and confirmed agreement. No enrolled planned, in-progress or parked spec was found.

CRITERION: AC-10 Stackweaver's local behaviors stay available with unchanged invocation: worktree slots, direct-to-main non-feature shipping through its own `/ship`, `[skip ci]` rules, `watch-merge.sh`, the triad and satellite lenses, the browser-pass summary table, and `/implement` handing straight to ship.
VERDICT: met
EVIDENCE: At Stackweaver 8904c82b, verified that agent-slot.sh, worktree-dev.sh, watch-merge.sh and agents/ship.md are unchanged from the parity baseline. Executed their safe usage or help paths. Read the adapters, loop settings and project procedure, including the retained lenses, browser table and explicit implement-to-ship grant. All parity contracts passed. No live slot or publication was started.

CRITERION: AC-11 A disposable Stackweaver checkout rolls back to the native loop and reapplies the adoption, with the docs index and unrelated workflow files byte-identical afterwards.
VERDICT: not met
EVIDENCE: Executed tests/agent-loop/rehearse.sh against Stackweaver 8904c82b. Its disposable clone stopped while reverting 02844076, with conflicts in four command adapters and AGENTS.md. Rollback did not finish, so reapplication and the final hash comparisons were not reached. The original worktrees remained clean.

CRITERION: AC-12 On the feature branch, a GoReleaser snapshot build produces all four runtime archives, the plugin's `knowledge.md` pin names the merged vhco-pro/docs revision, and a candidate plugin installed from the branch in an isolated profile runs every adapted Stackweaver command through its entry points.
VERDICT: not verified
EVIDENCE: Ran GoReleaser release --snapshot --clean --skip sign in a disposable clone of 0b5b5f2 using its committed configuration. It produced all four Darwin and Linux archives. Verified knowledge.md names c70769eb. Inspected T51's isolated-install outputs, which explicitly made no model call, and T33's separately loaded candidate trials. Installation followed by every adapted command in the isolated profile was not executed here. Post-merge Order publication is not required by this criterion.

CRITERION: AC-13 Implement claims a planned feature from a clean worktree whose `HEAD` is the fetched default branch tip, detached or on a branch this session created or was handed over, pushes the claim to the default branch and continues in that worktree on the feature branch; with stray changes or a stale tip it stops before writing anything, and when the push is rejected it keeps the local claim commit, creates no feature branch and reports the claim pending.
VERDICT: met
EVIDENCE: Claim and CLI fixtures passed at 0b5b5f2, exercising detached and owned branches, unrelated-branch refusal, stale and dirty worktrees, successful claim pushes and rejected pushes retaining the local claim. Inspected the implement instructions and their explicit precedence over the old Enter steps. These observations cover disposable local remotes.

CRITERION: AC-14 A Stackweaver feature taken through the adopted loop passes its completion gate in its owning worktree before merge, and after it lands by merge commit every commit its Review Log names is reachable from `main`.
VERDICT: not verified
EVIDENCE: Inspected Stackweaver's T33 runner and retained records at 8904c82b. They describe a manually driven helper flow, a completion gate and a local merge-commit landing. That claim-to-merge flow and its pre-merge gate were not executed in this review.

CRITERION: AC-15 With `skip_ci_paths` declared and a resolved delivery convention that supports it, a feature delivery whose commit, push range and PR diff touch only feature documents, Markdown onboarding files or declared paths carries the skip marker, and any other change in the delivery leaves it off; when the resolved convention does not support it, the marker follows the documentation-only rule and the report says the setting was ignored and why.
VERDICT: met
EVIDENCE: Delivery and CLI fixtures passed at 0b5b5f2, covering declared-only paths, mixed code, earlier outgoing code, reverted outgoing code and unsupported conventions. Inspected convention resolution and ship's explicit instruction that cli.ts skip replaces the documentation-only rule when loop settings exist. No remote delivery was performed.

CRITERION: AC-16 In Stackweaver, `/spec review` never moves an enrolled spec to `planned` without an owner acceptance row, and `/spec` and `/investigate` create no issue without an explicit request or accepted scope.
VERDICT: met
EVIDENCE: At Stackweaver 8904c82b, the acceptance and issue contracts passed. Independently ran planned gates on all 14 enrolled drafts and observed refusal for missing acceptance. Inspected the shared spec and investigate instructions and Stackweaver's explicit issue-filing restrictions. No issue was created during these checks.

CRITERION: AC-17 Stackweaver's native spec, tasks, implement and reviewer agent files stay routable while any non-terminal spec, domain-extension plans included, is unenrolled, are retired only after none is, and after retirement an adapted command given a terminal unenrolled document refuses without running anything.
VERDICT: not verified
EVIDENCE: Retirement tests passed at Stackweaver 8904c82b and checked retained native files and domain-extension coverage. Inspected the enrollment and refusal instructions. The post-retirement test asserts text patterns; it does not execute the adapters and plain-language requests after retirement. That refusal behavior was not observed here.

CRITERION: AC-18 With `implement_worktree: isolated`, implement started in the primary worktree continues in a host-created isolated worktree, or stops before writing on a host without a worktree tool, and the primary worktree's branch, `HEAD`, index and files are unchanged afterwards; without the setting, behavior is unchanged.
VERDICT: not verified
EVIDENCE: Isolation fixtures passed at 0b5b5f2, including setting-off behavior and stopping without a worktree tool. Inspected Stackweaver's T53 attempt at 8904c82b, which stopped before the successful host-worktree continuation. No successful Claude Code continuation from the primary checkout was observed here. The owner-approved residual remains applicable.

CRITERION: AC-19 The settings reference, the operation reports and Stackweaver's adapters and project procedure use each glossary term with the meaning the Glossary gives it, and introduce no other name for those concepts.
VERDICT: met
EVIDENCE: Glossary checks passed at 0b5b5f2. Read the settings reference, report fields, Stackweaver adapters and project procedure against the accepted Glossary. Their use of the declared concepts agrees with those definitions.

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: plugins/vh-adlc/scripts/loop/settings.ts:205
EVIDENCE: A disposable consumer without loop.yaml returned {"role":"author","route":"host"} from cli.ts route. Adding only an external global spec_reviewer executable override made the same command exit 2 with "invalid loop settings: override roles.spec_reviewer: only a command route has an executable". loadLoopSettings applies global overrides even when the repository has no loop configuration.
PROPOSAL: Preserve the no-file default by ignoring executable overrides when loop settings are absent. Add a CLI regression covering an unconfigured consumer alongside a global override used by another repository.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: plugins/vh-adlc/scripts/loop/cli.ts:123; plugins/vh-adlc/scripts/loop/rungs.ts:41
EVIDENCE: In a disposable fixture, merge 3f0e327 contained behavior.txt with "bad", which fails the mandatory grep check. HEAD 994c0b2 contained a later repair with "good". Running cli.ts rungs --merge 3f0e32710f8b71bfb1e20489f88fafd3ae855c4e --run true tested HEAD, recorded commit 994c0b2, and returned advance true. The requested merge controls path selection but not the checkout being tested or the commit required for advancement.
PROPOSAL: Require the tested checkout and result commit to match the requested merge, or run the checks in an isolated checkout of that merge. Add a regression where a later HEAD passes while the requested merge fails.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Stackweaver tests/agent-loop/rehearse.sh:5
EVIDENCE: Running the committed rehearsal against 8904c82b stopped while reverting 02844076. Its disposable clone had conflicts in spec.md, tasks.md, implement.md, ship.md and AGENTS.md. The hardcoded adoption list omits later adoption changes, including 9ba38077, which changed those adapters. Neither reapplication nor the final preservation comparisons ran.
PROPOSAL: Update the rollback procedure to cover the complete current adoption while preserving unrelated changes. Rehearse rollback and reapplication at the current adoption commit and retain the resulting hash comparisons.

## Sources

- [Feature-document standard at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/feature-documents.md): sections, rules block, criterion and review formats, acceptance.
- [Feature-document template at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/guides/feature-document-template.md): document layout.
- [Delivery convention at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/delivery.md): claim commit, no squash for feature PRs, skip-CI scope, delivered after every release path publishes.
- [Documentation convention at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/documentation.md): prose and document rules.
- [Humanize prose guide at d8f07c9](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/guides/humanize-prose.md): prose editing for this document.
