---
status: draft
status_description: "Drafted 2026-11-15 with every owner decision folded; waits for its first spec review."
issue: null
goal: "After a finished agent session, the owner gets a saved, ranked list of concrete changes to the agent's environment that would have prevented that session's mistakes and waste, each naming where it belongs and whether it has happened before."
covers:
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
  - plugins/vh-adlc/skills/vh-adlc-retro/
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/retro.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - docs/reference/marketplace.md
  - docs/user-guides/workflows.md
  - tests/vh-adlc/retro/
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/maintenance/discovery.test.ts
  - tests/vh-adlc/triage/discovery.test.ts
---

# Plan: Session retrospective

A shared `vh-adlc-retro` skill reads a finished agent session and proposes changes to the agent's
environment, ranked by severity, each with its evidence and the place it belongs, and keeps each
report so later runs can see what keeps coming back.

## Context

### Owner summary

Lessons from agent sessions reach vh-adlc or a project only when someone remembers to write them
down. Stackweaver keeps a lessons file and you keep memory notes, but nothing reads a session
afterwards and asks what in the environment made it go wrong or cost too much. The fixes are
usually small and concrete: a pointer to the file the agent searched for, a lint rule for a mistake
a reviewer missed, a deleted instruction that changes nothing.

`vh-adlc-retro` reads one session transcript, the current one by default, together with the
repository's instruction files, its project procedure and its check commands. It returns candidates
in six categories: navigation, missing deterministic checks, review standards, always-loaded
instruction size and no-ops, tool economy, and information access. One rule from the prior art is
kept on purpose. A mistake with a fixed, syntactic shape becomes a deterministic check (a lint rule,
hook or test), not another prose rule, and judgement-only standards go to the review step, because
the reviewer has the least context pressure. Each candidate names its home. Generic process
lessons go to vh-adlc, which matches your standing rule that they land there. Project lessons go to
the consumer's own files. A candidate an existing rule already covers is reported as covered, not
proposed again.

One conversation cannot show that the same problem keeps happening, and a repeat is the strongest
signal a retrospective has. So each run saves its report and reads the earlier ones first. A
candidate that matches an earlier report is marked recurring, with how often and since when, and
ranks above new ones of the same kind. A candidate an earlier report raised and the environment
has since fixed, but which happened again, is reported as a fix that did not hold. This reuses
triage's report pattern: a configurable directory, uncommitted unless you ask for a commit, and a
comparison against history. Sessions mostly run in worktrees that get deleted, so by default reports
live in a per-user directory outside every checkout, one per repository, as you chose. History then
survives worktree removal and stays private on the machine, but is not shared across machines.

Apart from writing its report, the skill only reads. It edits no other file, creates no issue and
sends nothing outside the machine. Secrets are redacted before anything is shown or saved. You act
on a candidate by asking for it, through the existing spec, investigate or direct-change routes; you
chose to keep the operation report-only for good.

Hosts are Claude Code CLI and Codex CLI, whose transcripts are local JSON Lines files, as you chose.
Copilot is not included. Proof is planned as package checks plus recorded runs on both hosts against a fixture
transcript with planted problems. Nothing has run or been reviewed yet.

Accepting authorizes implementation on
a feature branch. Shipping still needs your request.

### Background

- vh-adlc has sixteen skills and none reads a past session to improve the environment
  (`ls plugins/vh-adlc/skills` on `c676010`). `vh-adlc-investigate` investigates a named case and
  `vh-adlc-audit` audits source; neither takes a transcript as input.
- Claude Code stores each session as `~/.claude/projects/<project>/<session-id>.jsonl` (observed:
  `~/.claude/projects/-home-m-code-stackweaver/0443e578-6437-5521-b63e-27f043a5ac80.jsonl`). Codex CLI
  stores `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl` (observed under
  `~/.codex/sessions/2026/11/`), and the plugin already reads that log for model attestation
  (`plugins/vh-adlc/scripts/loop/review-route.ts:164-167`).
- The loop settings already declare where a consumer's review rules live: `project_procedure`, which
  every SDD operation reads, `instruction_files`, and `lenses`, which every spec review applies
  (`plugins/vh-adlc/references/loop-settings.md:40-42`). `bun scripts/loop/cli.ts context --repo <dir>`
  prints that reading list (`plugins/vh-adlc/references/loop-settings.md:111-112`).
- A new operation is registered in the package check's operation lists
  (`tests/vh-adlc/check.test.ts:22-26`, directory check at `:240`), excluded from the triage discovery
  count (`tests/vh-adlc/triage/discovery.test.ts:22`), and documented in
  `docs/user-guides/workflows.md` and `docs/reference/marketplace.md`, as `vh-adlc-diagram` was
  (`docs/specs/architecture-diagram-agent.md` frontmatter `covers`).
- Triage saves each report under a configurable `report_dir`, by default `.vh-adlc/reports/triage`
  (`plugins/vh-adlc/references/triage-settings.md:31`, `:56`), leaves it uncommitted unless a commit is
  requested, never overwrites existing output, and compares each run with the configured report
  history, treating an absent default directory as a first run
  (`plugins/vh-adlc/references/triage.md:136-154`).
- The prior art is Matt Pocock's `retro` skill (Sources). Its categories and the mechanical-versus-
  judgement rule are adopted. Its `CODING_STANDARDS.md` home is replaced by the loop settings' declared
  review homes, and its report gains a covered-already check, redaction and a saved history.

### Terminology

| Term | Meaning |
| --- | --- |
| Candidate | One proposed environment change with category, severity, evidence, home and the exact change (AC-02). |
| Home | The file or repository a candidate belongs in: vh-adlc for generic process lessons, the consumer's instruction files, project procedure, checks or lessons file for project ones (AC-03). |
| Recurring candidate | A candidate whose category, home and proposed change match one in an earlier saved report for the same repository (AC-07). |
| Mechanical violation | A mistake with a fixed shape a tool can detect, such as a banned API, an import form or a file location (AC-04). |

## Scope

- `plugins/vh-adlc/skills/vh-adlc-retro/SKILL.md`, model-invoked, with a description that triggers on
  retrospective and retro requests.
- `plugins/vh-adlc/references/retro.md`: the report format, the history comparison and the report
  location setting, disclosed from the skill because only the save and compare steps need them.
- Intake routing for retrospective requests in `references/lifecycle.md`.
- Registration in the package checks and discovery tests, manifest version bumps, and the two
  documentation pages above.
- Fixture transcripts for Claude Code and Codex CLI under `tests/vh-adlc/retro/`.

Out of scope, by name: applying any candidate, now or in a later version (owner decision); creating
issues; editing lessons or memory files; committing a report unless the owner asks; reading sessions
from other machines or cloud sessions; Copilot transcripts; analysing several transcripts in one
run; scheduled runs; and any change to the reviewer agent.

## Design

### Input

The owner names a session by transcript path, or by host and session id; with neither, the skill
reads the current session's transcript. It resolves the repository from the transcript's working
directory, or the current checkout when they agree, and reads:

1. the transcript, up to its last line at read time (a live session keeps writing; the skill reads once);
2. the files `bun scripts/loop/cli.ts context --repo <dir>` lists, or the root instruction files when
   the repository has no loop settings;
3. the repository's check commands where they are declared: build files, package scripts, pre-commit
   hooks and CI workflow files;
4. the lessons file the project procedure names, if any;
5. every earlier retro report for the same repository in the report location. A location that
   is configured but missing or unreadable ends the run as unavailable; an absent default location is
   a first run.

A transcript the skill cannot parse, or one from an unsupported host, ends the run with that reason
and no candidates.

### Analysis

For each category the skill looks for its trigger in the transcript:

| Category | Trigger | Typical change |
| --- | --- | --- |
| Navigation | Many searches or reads before the right file was found | A pointer in an instruction file or reference |
| Deterministic checks | A mistake a lint, type check, test or hook would have caught, or a repository with none wired | Wire or add the check; an existing unwired check is the finding |
| Review standards | A judgement-level mistake the review step did not catch | A rule in the consumer's project procedure or a spec-review lens |
| Instruction size and no-ops | Always-loaded files whose instructions the session shows changed nothing | Delete or move the text behind a pointer |
| Tool economy | A tool call whose output or cost was far larger than its use | A narrower command, script or flag |
| Information access | A fact the agent needed and could not reach | Access to a log, a read-only tool or a documented location |

A mechanical violation is always proposed as a deterministic check in the consumer's existing
guardrail; only judgement-level standards are proposed as review rules. Before proposing a candidate,
the skill searches the files it read for a rule that already covers it; a covered candidate is listed
as covered, with the rule's location and why it did not hold, and proposes no duplicate.

### Report location

By default reports live in `${XDG_STATE_HOME:-$HOME/.local/state}/vh-adlc/retro/<repository>/` on
Linux and `$HOME/Library/Application Support/vh-adlc/retro/<repository>/` on macOS, outside every
checkout. `<repository>` is the `origin` remote's `owner/name`, lowercased with `/` replaced by `--`;
a repository without an `origin` remote uses its root directory path with `/` replaced by `-`, so all
worktrees of one repository share one history. An optional `report_dir` in `.vh-adlc/retro.yaml`
replaces the default with a directory the repository chooses, validated as triage validates its own
`report_dir`. Every report names the location it was saved to.

### History comparison

Each new candidate is compared with the candidates of every earlier report for the same repository.
A match on category, home and proposed change marks it recurring and records the earlier report
dates. A recurring candidate whose earlier report also noted that the change was made is reported as
a fix that did not hold. Comparison uses only what the reports recorded; the skill does not infer
that an earlier candidate was fixed because it did not recur.

### Report

Candidates are ranked by severity: a defect that reached a commit or review first, then a fix that
did not hold, then other recurring candidates, then repeated waste in this session, then single
waste. Each gives category, severity, evidence (transcript line numbers and a short redacted quote),
home, the exact proposed change and its history. Every secret, token, password and credential-bearing
header is replaced with `<REDACTED>` before the report is shown or saved; a candidate that cannot be
shown without one says so.

The report is shown in the conversation and saved as a new Markdown file named by date, host and
session id in the report location. Existing files are never overwritten. The report is not committed
unless the owner asks, following triage's report-commit rule.

### Effects and failure

The run writes only its new report file: no other file write, no Git change, no tracker or network
call. Two concurrent runs on the same transcript write two reports with different names, and each
compares only against reports that existed when it started. An interrupted run leaves at most a
report file it wrote atomically, so it is either complete or absent. Rollback is reverting the plugin
version; saved reports remain readable by a later version.

## Acceptance Criteria

- [ ] AC-01: `vh-adlc-retro` is discovered on Claude Code CLI and Codex CLI from the source-distributed
      plugin, and a retrospective request without an operation name reaches it through intake.
- [ ] AC-02: Given a fixture transcript with a planted navigation detour, a mistake a configured lint
      would catch, an oversized tool output and an instruction the session shows to be a no-op, the
      report lists a candidate for each, with category, severity, evidence lines, home and change,
      ranked as the Design orders them.
- [ ] AC-03: Generic process candidates name vh-adlc as their home and project candidates name a file
      in the consumer repository.
- [ ] AC-04: The planted lint-detectable mistake is proposed as a deterministic check, not as a prose or
      review rule.
- [ ] AC-05: A planted mistake that an existing instruction already forbids is reported as covered, with
      that instruction's location, and no duplicate rule is proposed.
- [ ] AC-06: Secrets planted in the fixture transcript appear in neither the shown nor the saved report,
      and apart from the new report file the run leaves the repository's files, Git state and trackers
      unchanged.
- [ ] AC-07: Given an earlier saved report that raised one of the planted problems, the new report marks
      that candidate recurring with the earlier report's date and ranks it in the order the Design
      gives; with no earlier report the run states it is a first run.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc` (registration and discovery checks); recorded scenario run on Claude Code CLI and Codex CLI invoking `vh-adlc-retro` by name and through a generic "run a retrospective" request, pass when both hosts load the skill. |
| AC-02, AC-03, AC-04, AC-05 | Recorded scenario run per host on the fixture repository and transcript under `tests/vh-adlc/retro/`; pass when an independent grader confirms each planted problem has its candidate with the required fields, homes and order, the lint mistake is a check, and the covered mistake cites the existing rule. |
| AC-06 | The same runs: `grep` the shown and saved report for each planted secret value (must find none) and compare `git status --porcelain` and a file hash list of the fixture repository and report location before and after (must differ only by the one new report file); the run log shows no tracker or network command. |
| AC-07 | A second recorded run per host on the same fixture with a seeded earlier report in the report location; pass when the grader finds the matching candidate marked recurring with the seeded date and ranked as the Design orders it. The first-run statement is checked in the AC-02 runs, which start with an empty location. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-15 | R-1 | spec | `ef7f01b8b85a78c3c26aebb77aab526eed13d54a` | claude-opus-5-5 | procedural | One blocking, twelve should-fix and two nit findings |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design (Input item 1, "the transcript, up to its last line at read time"); Scope (no extraction script listed); Background (session stored as `<session-id>.jsonl`); Out of scope ("analysing several transcripts in one run"); Test Plan rows AC-02 through AC-07 (small fixture only)
EVIDENCE: The transcript the Background cites as observed, ~/.claude/projects/-home-m-code-stackweaver/0443e578-6437-5521-b63e-27f043a5ac80.jsonl, is 12987694 bytes (`ls -laS`). Other local sessions are 44641892 bytes (Claude) and 216954826 and 224418744 bytes (Codex rollouts under ~/.codex/sessions/2026/11/). Claude also keeps each session's subagent transcripts and offloaded large tool outputs beside the main file: that session's directory holds `subagents/` (8 files, e.g. agent-a6d6fbd72502c1fd7.jsonl) and `tool-results/` (6 files). The Design has the model read the whole transcript once, Scope adds no script to extract or summarise it, and the fixtures are small, so every proof passes on an implementation that cannot read a typical real session. Review work and oversized tool output, which the Review standards and Tool economy categories need, often live in those side files, and the document neither includes nor excludes them.
PROPOSAL: Specify how a large transcript is read: a deterministic extraction script in Scope with its output shape and limits, and whether `subagents/` and `tool-results/` belong to "the session". Add a Test Plan proof on a transcript at least as large as the cited 13 MB session.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Owner summary ("the current one by default"); Design (Input, "with neither, the skill reads the current session's transcript"); Test Plan (no row exercises the default)
EVIDENCE: The document never says how the skill identifies its own session. Picking the most recently modified file in the project directory selects the wrong transcript when several sessions share a project, which the consumer instructions describe as routine (stackweaver CLAUDE.md, "Multiple Claude sessions ... routinely work on this repo at once"). Claude Code exposes `CLAUDE_CODE_SESSION_ID` in the environment (observed with `env`), but the document names no mechanism for either host, Codex included. Every Test Plan row names the fixture transcript explicitly, so the headline default is never proven.
PROPOSAL: Define the per-host source of the current session id, with a stop-and-ask path when it cannot be determined, and add a recorded-run proof of the default on both hosts while a second session is active in the same project.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design (Report, "named by date, host and session id", "Existing files are never overwritten"); Design (Effects and failure, "Two concurrent runs on the same transcript write two reports with different names", "a report file it wrote atomically"); Design (History comparison)
EVIDENCE: Two runs on the same transcript on the same day get the same date, host and session id. Under the naming rule they get the same name, which contradicts the claim of different names, and the no-overwrite rule then leaves the second run with no defined outcome. A deliberate rerun on the same session, for example after an interrupted run, saves a second report whose candidates match the first on category, home and change, so the next run counts one session as a recurrence. That fakes the signal the Owner summary calls the strongest a retrospective has. The atomic-write claim has no mechanism in Scope (no script), and a temp-file-and-rename approach can leave a temp file behind, which contradicts "writes only its new report file".
PROPOSAL: Add a unique run component to the file name, define the rerun case, and exclude reports with the same host and session id from recurrence counting. Name the write mechanism that makes the file complete or absent.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Owner summary (lines 52-53, "A candidate an earlier report raised and the environment has since fixed, but which happened again, is reported as a fix that did not hold"); Design (History comparison, "whose earlier report also noted that the change was made"); Design (Report ranking, second tier); Design (Analysis, covered candidates "why it did not hold")
EVIDENCE: The skill is report-only and never edits a saved report, and a report is written before the owner acts on any candidate. No earlier report can therefore record that its own proposal was later applied, and the Design forbids inferring a fix from absence. As written, the "fix that did not hold" tier can only fire if an intermediate report happened to list the candidate as covered, and that path is not described. The Owner summary defines the case differently ("the environment has since fixed"), which is detectable now: the candidate matches an earlier report and the covered check finds a current rule for it.
PROPOSAL: Define a fix that did not hold as a recurring candidate that the current covered check finds already addressed, or say what record marks a change as made. Make the Owner summary and the Design state the same rule, and give it a proof.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Report, ranking tiers and "category, severity"); Owner summary ("ranks above new ones of the same kind"); AC-02 ("ranked as the Design orders them"); AC-03; AC-07; Test Plan rows AC-02, AC-03, AC-04, AC-05 and AC-07
EVIDENCE: The tiers cover a defect that reached a commit or review, a fix that did not hold, recurring candidates and waste. A mistake that was caught before commit, a no-op instruction, which is neither defect nor waste, and a covered candidate have no tier, and ties have no order. "Severity" is a required field, but no values are defined. The Owner summary ranks recurring candidates above new ones "of the same kind", while the Design ranks every recurring candidate above all non-defect new ones regardless of kind. The fixture description does not say which planted problem reached a commit, which is repeated, or which is generic rather than project-specific (AC-03). A grader therefore cannot derive the expected order or homes, and the proofs can pass a wrong ordering.
PROPOSAL: Define the severity values and give every candidate kind, covered candidates included, exactly one tier with a tie rule. Align the Owner summary. Specify for each planted fixture problem its expected tier, home class and position.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Terminology (Recurring candidate); Design (History comparison, "A match on category, home and proposed change"); Design (Effects and failure, "saved reports remain readable by a later version"); AC-07
EVIDENCE: The proposed change is model-written free text, so the same problem will almost never produce identical text in two runs, and the document does not say whether a match is exact or by meaning, or who decides. Two implementers would build different matchers, and the AC-07 grader inherits whichever one was built. Comparison "uses only what the reports recorded", but the Markdown report has no defined machine-readable fields and no format version. The document covers a later version reading old reports but not a rolled-back version reading reports a newer version wrote.
PROPOSAL: Define the match rule, for example a normalised home path plus category plus a stable candidate key recorded in the report. Give the saved report a versioned structured section, and state what an older version does with a newer report.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Design (Report location, "a repository without an `origin` remote uses its root directory path ... so all worktrees of one repository share one history", and "validated as triage validates its own `report_dir`"); Design (Input, "resolves the repository from the transcript's working directory, or the current checkout when they agree"); Owner summary ("History then survives worktree removal")
EVIDENCE: Each worktree has its own root directory, so a path-derived key gives each worktree a separate history, which contradicts "share one history". Triage validates `report_dir` with `resolveInside`, which rejects absolute paths and anything outside the checkout (plugins/vh-adlc/scripts/triage/settings.ts:41-44, :130). A configured retro `report_dir` would therefore sit inside a worktree and be lost when the worktree is removed, the case the per-user default exists to avoid. The document does not define what happens when the transcript's working directory and the current checkout disagree, or when that directory is a deleted worktree, which the Owner summary calls the common case. No schema is given for the new `.vh-adlc/retro.yaml` (schema version, unknown keys).
PROPOSAL: Key the no-origin case on the repository's common Git directory. Define repository resolution for the disagreeing and deleted-worktree cases. State whether a configured `report_dir` may be absolute or outside the checkout, and give `retro.yaml` a schema.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Owner summary (line 60, "sends nothing outside the machine. Secrets are redacted before anything is shown or saved"); Design (Report, `<REDACTED>` rule); Design (Effects and failure, "no tracker or network call"); AC-06; Test Plan row AC-06
EVIDENCE: The skill runs inside a hosted model session. The model must read the transcript, secrets included, before it can redact them, and that content goes to the model provider. A Codex transcript analysed on Claude Code, or the reverse, moves session content to a second provider. Scope has no deterministic redaction step, so redaction depends on the model, and the AC-06 grep checks only the planted literal values, so it passes an implementation that leaks other secret shapes.
PROPOSAL: Either redact with a deterministic pre-pass before the model reads the transcript and test it against a fixed list of secret shapes, or scope the claim to "writes nothing outside the machine except through the host model" and state the cross-provider case for the owner.

FINDING: F-09
KIND: factual
SEVERITY: should-fix
WHERE: Scope ("Registration in the package checks and discovery tests"); Background (check.test.ts:22-26, triage discovery.test.ts:22); Scope (intake routing in lifecycle.md); covers (no plugins/vh-adlc/references/loop.md)
EVIDENCE: The checker has three skill classes with different requirements (tests/vh-adlc/check.test.ts:16-26). Scheduled operations must name `guides/humanize-prose.md` and contain `vh-adlc knowledge` (:260-266); content operations need only frontmatter (:241-246); host operations skip knowledge (:279-297). The document does not say which class retro joins, which knowledge pages it resolves, whether it uses the verified binary, or how it behaves when the repository is unpinned. loop.md lists that behaviour per operation (plugins/vh-adlc/references/loop.md:63-65), and loop.md is not in covers. The skill-total assertions at triage/discovery.test.ts:13 and maintenance/discovery.test.ts:12 (both `toHaveLength(16)`) also change; the Background cites only :22. Lifecycle already routes "Diagnosis or findings" to investigate (lifecycle.md:55), and the document gives no rule separating a request like "what went wrong in this session" from that row. The same gap was raised for docs drift (docs/specs/shared-docs-drift.md:529).
PROPOSAL: Name the class and the checker list, the knowledge pages including the humanize guide for the report prose, and the unpinned behaviour, and add loop.md to covers if it changes. Give the lifecycle row a rule against the investigate row, and test an ambiguous request in AC-01.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Owner summary (line 43, "judgement-only standards go to the review step, because the reviewer has the least context pressure"); Design (Analysis table, Review standards row, "A rule in the consumer's project procedure or a spec-review lens"); Design ("only judgement-level standards are proposed as review rules"); Out of scope ("any change to the reviewer agent")
EVIDENCE: `project_procedure` is read by every SDD operation, the implementer included (plugins/vh-adlc/references/loop-settings.md:40), so a standard placed there loads into the agent with the most context pressure. `lenses` apply only to spec reviews (loop-settings.md:42). The implementation reviewer returns criterion records and defects, with no standards input (plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md, "An implementation review"). Neither named home puts a code-level judgement standard in front of a code reviewer, so the prior-art rule the document says it adopts is not achieved, and changing the reviewer is out of scope.
PROPOSAL: Name a home that a code review actually reads, or raise as an Open Question whether the reviewer should gain a project-standards input. Otherwise state plainly that the adopted rule is weakened.

FINDING: F-11
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Input items 2 and 4); Design (Analysis, covered check "searches the files it read"); Terminology (Home); Owner summary ("you keep memory notes")
EVIDENCE: The prior art checks steering files "in the repo OR the user's global scope" (/tmp/mp-skills-src/repo skills/engineering/retro/SKILL.md, Global AGENTS.md category). The Input reads only repository files. User-level always-loaded files, such as ~/.claude/CLAUDE.md, the auto-memory index and ~/.codex/AGENTS.md, are never read. So Instruction size and no-ops cannot see them, and the covered check will propose rules that a user-level file or memory note already states.
PROPOSAL: Add the host's user-level always-loaded instruction and memory files to the Input as read-only sources, for both the size check and the covered check, or exclude them by name with the reason.

FINDING: F-12
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Analysis table, Instruction size and no-ops trigger, "Always-loaded files whose instructions the session shows changed nothing"); AC-02 ("an instruction the session shows to be a no-op")
EVIDENCE: One session cannot show that an instruction changes nothing. It can only show that the instruction did not apply to that task. Read literally, the trigger flags every rule the session did not exercise and proposes deleting rules that matter in other tasks. The prior art triggers on unwieldy steering files and on instructions that do not modify behaviour, not on one session's silence. The fixture's planted no-op has no stated property that tells a grader a true no-op from an unexercised rule.
PROPOSAL: Define a no-op by the instruction's content, for example one that restates a default or something the tooling already enforces, rather than by one session's absence of effect. Give the fixture's planted no-op and one relevant but unexercised rule that must not be flagged.

FINDING: F-13
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan (rows AC-02, AC-03, AC-04, AC-05 and AC-07, "an independent grader"); Design (Input, configured-missing location ends as unavailable; unparseable or unsupported transcript ends with no candidates)
EVIDENCE: The grader is not identified as a person, a model or a script, and has no written checklist beyond the criteria, so the pass conditions are not reproducible. The Design defines several outcomes no criterion or row exercises: a configured report location that is missing or unreadable ends as unavailable rather than a first run, an unparseable or unsupported-host transcript ends with a reason and no candidates, and the fix-that-did-not-hold tier.
PROPOSAL: Name the grader and its written checklist per planted problem. Add rows or criteria for the unavailable location, the unparseable or unsupported transcript and the fix-that-did-not-hold case.

FINDING: F-14
KIND: judgement
SEVERITY: nit
WHERE: Design (Analysis, "A mechanical violation is always proposed as a deterministic check in the consumer's existing guardrail"); Analysis table (Deterministic checks row, "or a repository with none wired"); Terminology (Home, vh-adlc for generic process lessons)
EVIDENCE: "the consumer's existing guardrail" does not fit a repository with no guardrail, which the same table makes a finding, or a generic mechanical lesson whose home is vh-adlc.
PROPOSAL: Say "in the home's guardrail, adding one where none is wired".

FINDING: F-15
KIND: judgement
SEVERITY: nit
WHERE: Scope ("model-invoked"); Open Questions ("None.")
EVIDENCE: The prior art sets `disable-model-invocation: true` (retro/SKILL.md frontmatter at 5863806). This document makes a file-writing skill model-invoked without recording that as an owner decision, while the Owner summary attributes the other choices to the owner.
PROPOSAL: State whether model invocation is an owner decision, or raise it as an Open Question.

## Sources

- [mattpocock/skills `retro/SKILL.md` at `5863806`](https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/retro/SKILL.md): the seven improvement categories (merged here into six by combining entry-point size with no-ops), the rule that mechanical violations become deterministic checks, and that review carries coding standards because the reviewer has the least context pressure.
- [mattpocock/skills `diagnosing-bugs/SKILL.md` at `5863806`](https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/diagnosing-bugs/SKILL.md): the redaction practice adopted for quoted transcript evidence.
