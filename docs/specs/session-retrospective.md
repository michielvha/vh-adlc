---
status: draft
status_description: "Revised after spec review R-1 with the owner's answers folded; waits for a fresh independent spec review."
issue: null
goal: "After a finished agent session, the owner gets a saved, ranked list of concrete changes to the agent's environment that would have prevented that session's mistakes and waste, each naming where it belongs and whether it has happened before."
covers:
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
  - plugins/vh-adlc/skills/vh-adlc-retro/
  - plugins/vh-adlc/scripts/retro/
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/references/loop.md
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
down. Nothing reads a session afterwards and asks what in the environment made it go wrong or cost
too much. The fixes are usually small: a pointer to the file the agent searched for, a lint rule for
a mistake that reached a commit, a deleted instruction that only restates a default.

`vh-adlc-retro` reviews one session, the current one by default. Real transcripts run from 13 MB to
over 200 MB, with subagent transcripts and large tool outputs in side files, so a deterministic
script first reads the whole session, side files included, and reduces it to a bounded digest. The
same script removes known secret shapes before the model sees anything, as you chose. The model then
reads the digest, the repository's instruction files, project procedure and check commands, and your
user-level instruction and memory files, read-only.

Candidates fall into six categories: navigation, missing deterministic checks, review standards,
always-loaded instruction size and no-ops, tool economy, and information access. A mistake with a
fixed, syntactic shape becomes a deterministic check, never another prose rule. A no-op is judged by
what the instruction says, such as restating a default or something a tool already enforces, not by
one session not needing it. Judgement-level standards go to the project procedure, and the report
says plainly that this is weaker than the prior art intends: the implementer reads that file too, and
vh-adlc's implementation reviewer has no standards input yet. Giving it one is a separate feature, as
you chose. Each candidate names its home: vh-adlc for generic process lessons, the project or your
user-level files for the rest.

Each report is saved, redacted, in a per-user directory outside every checkout, shared by all
worktrees of a repository, and each run reads the earlier reports first. A problem seen in an earlier
report is marked recurring. A recurring problem that an existing rule already covers is a fix that
did not hold, and ranks first. A rerun of the same session never counts as a recurrence.

The skill only reports. It writes nothing except its report, creates no issue, and makes no tracker
or network call of its own; the digest still goes to the host's model provider, which for a Codex
transcript reviewed in Claude Code is a second provider. Hosts are Claude Code CLI and Codex CLI. On
Codex the skill asks you to name the session, because Codex exposes no current-session identifier.

Proof is planned as script tests plus recorded runs on both hosts against fixture sessions with
planted problems, including one over 13 MB, graded against a written checklist. Spec review R-1
returned one blocking and twelve should-fix findings, all applied here with your answers; a fresh
review is next. Accepting authorizes implementation on a feature branch. Shipping needs your request.

### Background

- vh-adlc has sixteen skills and none reads a past session to improve the environment
  (`ls plugins/vh-adlc/skills` on `c676010`). `vh-adlc-investigate` investigates a named case and
  `vh-adlc-audit` audits source; neither takes a transcript as input. Intake routes "Diagnosis or
  findings" to investigate (`plugins/vh-adlc/references/lifecycle.md:55`).
- Claude Code stores each session as `~/.claude/projects/<project>/<session-id>.jsonl`, with a sibling
  `<session-id>/` directory holding `subagents/` (subagent transcripts) and `tool-results/` (offloaded
  large tool outputs) (observed for `0443e578-6437-5521-b63e-27f043a5ac80`). That main file is
  12,987,694 bytes; another local Claude session is 44,641,892 bytes and two Codex rollouts are
  216,954,826 and 224,418,744 bytes (R-1 F-01, `ls -laS`). Codex CLI stores
  `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl`, and the plugin already reads that log
  for model attestation (`plugins/vh-adlc/scripts/loop/review-route.ts:164-167`).
- Claude Code exposes `CLAUDE_CODE_SESSION_ID` in a session's environment (observed with `env`).
  Codex CLI 0.163.0 exposes no such variable; the plugin and tests reference only `CODEX_HOME` and
  `CODEX_DISABLED` (`grep -rhoE "CODEX_[A-Z_]+" plugins tests`).
- The loop settings declare a consumer's local rules: `project_procedure`, read by every SDD operation
  including the implementer; `instruction_files`; and `lenses`, applied only by spec reviews
  (`plugins/vh-adlc/references/loop-settings.md:40-42`). The implementation reviewer returns criterion
  records and defects and reads no standards file (`plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md`,
  "An implementation review"). `bun scripts/loop/cli.ts context --repo <dir>` prints the reading list
  (`plugins/vh-adlc/references/loop-settings.md:111-112`).
- Triage saves each report under a configurable `report_dir`, by default `.vh-adlc/reports/triage`
  (`plugins/vh-adlc/references/triage-settings.md:31`, `:56`), leaves it uncommitted unless a commit is
  requested, never overwrites existing output, and compares each run with its report history
  (`plugins/vh-adlc/references/triage.md:136-154`). It validates `report_dir` with `resolveInside`,
  which rejects absolute paths and anything outside the checkout
  (`plugins/vh-adlc/scripts/triage/settings.ts:41-44`, `:130`).
- The package checker has three skill classes: scheduled operations must name
  `guides/humanize-prose.md` and contain `vh-adlc knowledge`; content operations need only valid
  frontmatter; host operations skip knowledge (`tests/vh-adlc/check.test.ts:16-26`, `:241-246`,
  `:260-266`, `:279-297`). Both discovery tests assert sixteen skills
  (`tests/vh-adlc/triage/discovery.test.ts:13`, `tests/vh-adlc/maintenance/discovery.test.ts:12`), and
  triage discovery excludes non-lifecycle skills by name (`tests/vh-adlc/triage/discovery.test.ts:22`).
  `references/loop.md` names, per operation, how an unpinned repository is handled
  (`plugins/vh-adlc/references/loop.md:63-65`).
- The prior art is Matt Pocock's `retro` skill (Sources). Its categories and the mechanical-versus-
  judgement rule are adopted; it checks steering files "in the repo OR the user's global scope". Its
  `CODING_STANDARDS.md` home has no vh-adlc equivalent a code reviewer reads, so that rule is weakened
  here, as the Owner summary states.

### Terminology

| Term | Meaning |
| --- | --- |
| Session | A host transcript plus, on Claude Code, the files in its sibling `subagents/` and `tool-results/` directories (AC-08). |
| Digest | The bounded, redacted JSON the extraction script produces from a session; the only form of the transcript the model reads (AC-06, AC-08). |
| Candidate | One proposed environment change with key, category, severity, tier, evidence, home and the exact change (AC-02). |
| Home | Where a candidate belongs: vh-adlc for generic process lessons; the consumer's instruction files, project procedure, checks or lessons file; or the owner's user-level instruction or memory files (AC-03). |
| Mechanical violation | A mistake with a fixed shape a tool can detect, such as a banned API, an import form or a file location (AC-04). |
| No-op instruction | An instruction that restates the host or model default, restates what a configured tool or check already enforces, or duplicates another always-loaded instruction (AC-05). |
| Recurring candidate | A candidate matching one in an earlier report for the same repository from a different session (AC-07). |
| Fix that did not hold | A recurring candidate that an existing rule already covers (AC-07). |

## Scope

- `plugins/vh-adlc/skills/vh-adlc-retro/SKILL.md`, a scheduled operation in the package checker's
  phase-7 list, model-invoked so intake can route to it (owner decision).
- `plugins/vh-adlc/scripts/retro/`, a Bun CLI with `locate`, `extract`, `history` and `save`
  commands, and its tests.
- `plugins/vh-adlc/references/retro.md`: the report format, the history comparison and the
  `retro.yaml` schema, disclosed from the skill because only the save and compare steps need them.
- Intake routing for retrospective requests in `references/lifecycle.md`, retro's unpinned behaviour
  in `references/loop.md`, registration in the package checks and both discovery tests, manifest
  version bumps, and the two documentation pages.
- Fixture sessions, a large-session generator, seeded earlier reports and a grader checklist under
  `tests/vh-adlc/retro/`.

Out of scope, by name: applying any candidate, now or in a later version (owner decision); creating
issues; editing lessons, memory or instruction files; committing a report; reading sessions from
other machines or cloud sessions; Copilot transcripts; reviewing several sessions in one run;
scheduled runs; and a project-standards input for the implementation reviewer, which is a separate
feature (owner decision).

## Design

### Knowledge and invocation

The skill resolves `guides/humanize-prose.md` with `vh-adlc knowledge` through the verified binary and
edits the report's prose with it. In a repository without a pin it works with the plugin pin, adds
none and reports the missing pin, as `references/loop.md` lists for investigate; loop.md gains retro
in that list. Intake routes a request about what to change in the agent's environment after a session
(it names a session, a transcript or "this session") to retro, and a request about a defect in the
product or its code to investigate; a request that fits both asks the owner which they mean.

### Session and repository

The owner names a session by transcript path, or by host and session id. With neither, on Claude Code
the skill uses `CLAUDE_CODE_SESSION_ID` to find its own transcript; on Codex CLI, or when the variable is
missing, it asks the owner to name the session and never picks the newest file.

`scripts/retro/cli.ts locate --transcript <file>` resolves the repository from the transcript's recorded
working directory. When that directory still exists, its repository is used, even when it differs from
the current checkout, and the report says so. When it no longer exists, as for a removed worktree, the
current checkout is used if its `origin` remote matches the one the transcript records; otherwise the
skill asks the owner. The repository key is the `origin` remote's `owner/name`, lowercased with `/`
replaced by `--`; without an `origin`, it is the absolute path of `git rev-parse --git-common-dir`
with `/` replaced by `-`, so every worktree of one repository shares one key.

### Report location

The default directory is `${XDG_STATE_HOME:-$HOME/.local/state}/vh-adlc/retro/<key>/` on Linux and
`$HOME/Library/Application Support/vh-adlc/retro/<key>/` on macOS. An optional `.vh-adlc/retro.yaml`
in the repository holds `schema_version: 1` and an optional `report_dir`, an absolute path or one
starting with `~/`, outside or inside any checkout; any other key or value is refused, naming it.
Every report names the directory it was saved to. A configured directory that is missing or unreadable
ends the run as unavailable, with no report; an absent default directory is a first run.

### Extraction and redaction

`extract --transcript <file> --host <claude|codex> --output <file>` streams the session line by line,
on Claude Code including every file in the sibling `subagents/` and `tool-results/` directories, and
writes a digest:

- one entry per message and tool call, with source file and line, role, tool name, the tool input and
  output each cut to 600 characters, the full output size in bytes and an error flag;
- complete aggregates: tool calls by name, the 20 largest outputs with their sizes, repeated failing
  commands, and the reads and searches before the first edit of each file;
- when entries exceed 400,000 characters, the middle entries are dropped and replaced by a count,
  while aggregates stay complete; the digest records what was dropped.

Before anything is written, every string passes through redaction, which replaces with `<REDACTED>`:
PEM private key blocks; `Authorization`, `Proxy-Authorization`, `Cookie` and `Set-Cookie` header
values; bearer tokens; AWS access key IDs (`AKIA` or `ASIA` plus 16 characters); GitHub tokens
(`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`); Slack tokens (`xox` prefixes); `sk-` API keys;
JSON Web Tokens; credentials in URLs (`scheme://user:pass@`); and values assigned to keys named
`password`, `passwd`, `secret`, `token`, `api_key` or `apikey` in `key=value`, `key: value` and JSON
forms. A transcript the script cannot parse, or one from another host, ends the run with that reason,
no candidates and no report.

### Analysis

The model reads the digest; the files `bun scripts/loop/cli.ts context --repo <dir>` lists, or the root
instruction files without loop settings; the repository's build files, package scripts, pre-commit hooks
and CI workflows; the lessons file the project procedure names, if any; and, read-only, the host's
user-level files: `~/.claude/CLAUDE.md` and the project's auto-memory index and the notes it links on
Claude Code, `~/.codex/AGENTS.md` on Codex CLI.

| Category | Trigger | Typical change |
| --- | --- | --- |
| Navigation | Many searches or reads before the right file was found | A pointer in an instruction file or reference |
| Deterministic checks | A mechanical violation, or a repository with no check wired | Wire or add the check in the home's guardrail, adding one where none is wired |
| Review standards | A judgement-level mistake the review step did not catch | A rule in the consumer's project procedure, marked as weaker than a reviewer input |
| Instruction size and no-ops | A no-op instruction, or always-loaded files large enough to crowd the context | Delete it, or move text behind a pointer |
| Tool economy | A tool call whose output or cost was far larger than its use | A narrower command, script or flag |
| Information access | A fact the agent needed and could not reach | Access to a log, a read-only tool or a documented location |

A mechanical violation is always proposed as a deterministic check, never as a prose or review rule.
An instruction is never flagged only because the session did not exercise it. Before proposing a
candidate, the skill searches every file it read for a rule that already covers it; a covered candidate
cites that rule's location and says why it did not hold, and proposes no duplicate.

### Severity and order

Each candidate gets one tier; severity follows from the tier:

| Tier | Candidate | Severity |
| --- | --- | --- |
| 1 | Fix that did not hold | high |
| 2 | Defect that reached a commit, a review or the owner | high |
| 3 | Other recurring candidate | medium |
| 4 | Mistake caught before commit | medium |
| 5 | Waste repeated within this session | medium |
| 6 | Single waste, no-op instruction or instruction size | low |
| 7 | Covered candidate that is not recurring | low |

Candidates are ordered by tier, then by their first evidence line in the session.

### History

`history --dir <dir> --host <host> --session <id>` reads every earlier report's structured block. Each
saved report ends with a fenced `retro-report` YAML block: `format: 1`, repository key, host, session
id, run id, time, and per candidate its key, category, home, tier, status and a one-line summary. The
key is `<category>:<home path normalised to repository-relative or ~-relative form>:<kebab-case slug>`.
The skill compares a new candidate only with earlier candidates of the same category and home; when
it judges an earlier one to be the same problem, it records that earlier key under `recurs` and adopts
its slug. Reports with the current host and session id are excluded from recurrence and listed as
previous runs of this session. A report whose `format` is newer than the version understands, or
whose block does not parse, is skipped and listed by name; comparison continues with the rest.

### Report and save

The report gives, per candidate, tier, severity, category, evidence (digest source lines and a short
quote), home, the exact change, its history, and for a review-standards candidate the weakness above.
It is shown in the conversation and passed to `save --dir <dir> --report <file>`, which redacts it
again, writes it as `<UTC time to the second>-<host>-<session id>-<6 random hex>.md` to a temporary
file in the same directory, links it to the final name only if that name is free, and removes the
temporary file on success and on failure. Nothing is committed.

### Effects and failure

Apart from its digest in the system temporary directory, removed at the end, and the saved report,
the run writes nothing: no other file, no Git change, no tracker or network call by the skill or its
script. The digest and the files the model reads go to the host's model provider. Concurrent runs get
different report names and each compares only reports that existed when it started. An interrupted
save leaves either the complete report or nothing. Rollback is reverting the plugin version; a
rolled-back version skips reports in a newer format, as History says.

## Acceptance Criteria

- [ ] AC-01: `vh-adlc-retro` is discovered on Claude Code CLI and Codex CLI from the source-distributed
      plugin; a retrospective request without an operation name reaches it through intake, and a
      request that fits both retro and investigate makes the agent ask which is meant.
- [ ] AC-02: On the small fixture session, the first report lists a candidate for each planted problem
      in the fixture table below, each with key, category, severity, tier, evidence, home and change,
      in the order the table gives.
- [ ] AC-03: Each planted problem's candidate names the home class the fixture table gives: vh-adlc,
      the consumer repository or the owner's user-level files.
- [ ] AC-04: The planted mechanical violation is proposed as a deterministic check wired into the
      consumer's pre-commit hook, not as a prose or review rule.
- [ ] AC-05: The planted covered mistake is reported as covered with the forbidding instruction's
      location; the planted no-op instruction is flagged; the planted unexercised rule is not flagged.
- [ ] AC-06: None of the planted secrets, and no string matching a listed secret shape, appears in the
      digest or in the shown or saved report; apart from the new report file the run leaves the fixture
      repository, report directory and trackers unchanged, with no temporary file left behind.
- [ ] AC-07: A second run on the small fixture with a seeded earlier report from another session marks
      the covered mistake as a fix that did not hold (tier 1) and the navigation detour as recurring
      (tier 3) with the seeded report's date; a seeded report from the same session is listed as a
      previous run and not counted; a seeded report with a newer format is skipped and listed; with no
      earlier report the run states it is a first run.
- [ ] AC-08: On the large fixture session (main file over 13 MB, with `subagents/` and `tool-results/`),
      the run completes and its report includes the oversized output whose content lives only in
      `tool-results/`.
- [ ] AC-09: With no session named, a Claude Code run reviews its own session even when a newer session
      of the same project exists, and a Codex CLI run asks the owner to name the session.
- [ ] AC-10: A configured report directory that is missing ends the run as unavailable with no report,
      and an unparseable transcript ends it with the reason, no candidates and no report.
- [ ] AC-11: Two worktrees of one repository resolve to the same report directory with and without an
      `origin` remote, and a session whose worktree was removed resolves to the current checkout only
      when the `origin` remotes match.

### Fixture table

| Problem | Planted as | Expected tier, first run | Expected tier, second run | Home class |
| --- | --- | --- | --- | --- |
| P1 Mechanical violation | A banned API call the repository's configured lint rule flags, committed because no hook runs the lint | 2 | 2 | Consumer repository |
| P2 Covered mistake | An edit to a generated file that `AGENTS.md` already forbids, caught before commit | 7 | 1 | Consumer repository |
| P3 Navigation detour | Twenty searches and reads before finding the settings file | 5 | 3 | Consumer repository |
| P4 Oversized output | A vh-adlc plugin script printing a multi-megabyte result that was barely used | 6 | 6 | vh-adlc |
| P5 No-op instruction | "Save files as UTF-8" in `AGENTS.md` beside an `.editorconfig` that sets `charset = utf-8` | 6 | 6 | Consumer repository |
| P6 Unexercised rule | "Never run migrations against production" in `AGENTS.md`, not relevant to the session | not flagged | not flagged | none |

First-run order: P1, P3, then P4 and P5 by first evidence line, then P2. Second-run order: P2, P1, P3,
then P4 and P5 by first evidence line. The seeded earlier report raises P2 and P3.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc` (scheduled-operation checks, both discovery counts at seventeen, loop.md and lifecycle.md entries); a recorded run per host invoking `vh-adlc-retro` by name, one with "run a retrospective on this session", and one with "what went wrong in this session?", which passes when the agent asks whether a retrospective or an investigation is meant. |
| AC-02, AC-03, AC-04, AC-05 | A recorded first run per host on the small fixture under `tests/vh-adlc/retro/`. A fresh read-only subagent on the same host grades the saved report against `tests/vh-adlc/retro/checklist.md`, one item per fixture row and criterion (fields present, tier, order, home class, P1 as a hook check, P2 covered with the `AGENTS.md` line, P5 flagged, P6 absent), and returns `ITEM <id>: PASS` or `ITEM <id>: FAIL <evidence>` per item; pass when every item passes. |
| AC-06 | `bun test tests/vh-adlc/retro` runs redaction over a fixture holding one example of every listed secret shape plus near-misses that must survive (a `sk` word, a 15-character `AKIA` string), and checks the digest. In the recorded runs: `grep` the digest and both reports for each planted secret and the shape patterns (must find none); compare `git status --porcelain` and file hash lists of the fixture repository and report directory before and after (must differ only by the one report); the run log shows no tracker or network command. |
| AC-07 | A recorded second run per host on the small fixture with three seeded reports in the report directory (another session raising P2 and P3, the same session, a `format: 2` report), graded by the checklist's second-run items. `bun test tests/vh-adlc/retro` covers `history` exclusion of the same session, skipping of newer and malformed blocks, and the first-run statement. |
| AC-08 | A recorded run per host on the large fixture, built by the generator to a main file over 13 MB with `subagents/` and `tool-results/`; pass when the run completes and the checklist's P4 item passes with evidence from `tool-results/`. `bun test tests/vh-adlc/retro` checks the 600-character cut, the 400,000-character limit with complete aggregates, and side-file inclusion. |
| AC-09 | A recorded Claude Code run with no session named while a second, newer session exists in the same fixture project; pass when the report's session id equals the run's `CLAUDE_CODE_SESSION_ID`. A recorded Codex CLI run with no session named; pass when the agent asks for the session and writes no report. |
| AC-10 | `bun test tests/vh-adlc/retro`: `locate` with a configured missing directory reports unavailable; `extract` on a malformed file and on a file from another host reports the reason; neither leaves a report. |
| AC-11 | `bun test tests/vh-adlc/retro`: `locate` on two worktrees of a temporary repository returns one key with an `origin` remote and one without; a transcript whose working directory was removed resolves to a checkout with a matching `origin` and asks otherwise. |

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
