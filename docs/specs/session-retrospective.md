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

## Sources

- [mattpocock/skills `retro/SKILL.md` at `5863806`](https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/retro/SKILL.md): the seven improvement categories (merged here into six by combining entry-point size with no-ops), the rule that mechanical violations become deterministic checks, and that review carries coding standards because the reviewer has the least context pressure.
- [mattpocock/skills `diagnosing-bugs/SKILL.md` at `5863806`](https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/diagnosing-bugs/SKILL.md): the redaction practice adopted for quoted transcript evidence.
