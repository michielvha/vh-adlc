---
status: planned
status_description: "Accepted by the owner on 2026-11-27 at spec review R-7 (f0f8dd4d, no findings); v1 reviews only the conversation it runs in, and transcript parsing is #185. Tasks are next."
issue: https://github.com/michielvha/vh-adlc/issues/101
goal: "After an agent session, the owner gets a saved, ranked list of concrete changes to the agent's environment that would have prevented that session's mistakes and waste, each naming where it belongs and whether it has happened before."
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
  - docs/get-started/installation.md
  - docs/reference/compatibility.md
  - docs/reference/marketplace.md
  - docs/user-guides/workflows.md
  - tests/vh-adlc/retro/
  - tests/vh-adlc/check.test.ts
  - tests/vh-adlc/triage/discovery.test.ts
---

# Plan: Session retrospective

A shared `vh-adlc-retro` skill reviews the conversation it runs in and proposes changes to the agent's
environment, ranked by severity, each with its evidence and the place it belongs. It saves each report
so later runs can see what keeps coming back.

## Context

### Owner summary

Lessons from agent sessions reach vh-adlc or a project only when someone remembers to write them
down. The fixes are usually small: a pointer to the file the agent searched for, a lint rule for a
mistake that reached a commit, or deleting an instruction that only restates a default.

You ask for a retrospective at the end of a session, and `vh-adlc-retro` reviews that same
conversation, as you decided on 2026-11-27. It reads no transcript files. It also reads the
repository's instruction files, project procedure and check configuration, and your user-level
instruction and memory files. What compaction has already summarised, it sees only as the summary.
If compaction also removed the name of a report an earlier retro run in the same conversation saved,
that report counts as history, and its candidates can show as recurring, or as fixes that did not
hold and rated high. Each names the report it matched. Reviewing saved or past
sessions is #185.

Candidates fall into six categories: navigation, missing deterministic checks, review standards,
instruction size and no-ops, tool economy, and information access. A mistake with a fixed shape that
a tool can detect becomes a deterministic check, even when a prose rule already forbids it. A no-op is
judged by what the instruction says, not by one session not needing it. Judgement-level standards go
to the project procedure. The report says this is weaker than intended, because the implementation
reviewer reads no standards file; that is a separate feature, as you chose.

Each candidate is high, medium or low. A problem an earlier report raised moves up one level. If a
rule already covers it, it is a fix that did not hold and is always high.

Reports are saved, redacted, in a per-user folder outside every checkout that only you can read, one
folder per repository, shared by all its worktrees. Moving or renaming the main checkout starts a new
folder, so the history starts again. A small script redacts known secret shapes, checks the report's
machine-readable block and writes the file. Nothing else is written, committed or sent, apart from
the plugin's usual binary install and conventions fetch. On Codex the save needs write access to that
folder. If Codex refuses it, you see the redacted report and nothing is saved.

Proof is planned as script tests plus recorded runs on Claude Code and Codex. Each recorded run
resumes a fixture conversation, written in that host's session format, with nine planted problems, and a subagent grades the report against a
written checklist. These checks are planned, not run.

Spec reviews R-1 to R-6 have run. The R-4 findings that only concerned transcript parsing no longer
apply; the others, and those of R-5 and R-6, are applied. Review R-7 is next.
Accepting authorizes implementation on a feature branch. Shipping needs your request.

### Background

Harm. A lesson from a session reaches the environment only if the owner writes it down. That affects
the owner and the few other people using vh-adlc, on most long sessions. The cost is the same waste
or mistake repeated in later sessions. It is moderate, and it does not go away on its own. The
simplest alternative without machinery is a prose-only skill: the owner asks for a retrospective and
reads the answer in chat. That alternative cannot show recurrence, because nothing is kept, and it
cannot keep secrets out of a saved file. This design adds only what those two need: a saved report
history and a deterministic redact-and-save script. Reading transcript files, which needs a parser,
size limits and session discovery, is left to #185.

- vh-adlc has nineteen skills, and none reviews a session to improve the environment
  (`ls plugins/vh-adlc/skills` at `3020122`). `vh-adlc-investigate` investigates a named case and
  `vh-adlc-audit` audits source; neither takes a session as input. Intake routes "Diagnosis or
  findings" to investigate (`plugins/vh-adlc/references/lifecycle.md:58`).
- Claude Code and Codex CLI can resume a saved session non-interactively with a new prompt:
  `claude --resume <session-id>` with `--print` (`claude --help`), and
  `codex exec resume [SESSION_ID] [PROMPT]` (`codex exec resume --help`, codex-cli 0.172.0).
  Claude Code keeps a session as `<config>/projects/<encoded path>/<id>.jsonl`, where the encoded path
  is the real path of the working directory with every character other than an ASCII letter or digit
  replaced by `-`. `ls ~/.claude/projects` shows
  `-Users-michielvh-code-vh-adlc--claude-worktrees-session-retro` for this worktree and
  `-private-var-folders-sm-8hfqw9-97pgfmhlfs2t7k66c0000gn-T-tmp-b4oI9g8ZQO-work` for a directory under
  `$TMPDIR`, which is `/var/folders/sm/8hfqw9_97pgfmhlfs2t7k66c0000gn/T/` and resolves to
  `/private/var/...` (R-6 F-01). Codex CLI keeps
  `<CODEX_HOME>/sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl` (R-2 F-01).
- The plugin writes its saved artifacts owner-only: `mode: 0o600` with exclusive creation at
  `plugins/vh-adlc/scripts/triage/cli.ts:50`, and folders with `mode:0o700` at
  `plugins/vh-adlc/scripts/triage/controller-recovery.ts:18`.
- The plugin's recorded-run harness isolates hosts by relocating their configuration, `CODEX_HOME` for
  Codex and `CLAUDE_CONFIG_DIR` for Claude Code, and passes the host only `PATH`, `HOME`, `LANG`, `TERM`
  and `XDG_CACHE_HOME` (`plugins/vh-adlc/scripts/triage/controller-clients.ts:11`, `:18`, `:20`).
  Codex keeps user-level memory files in `~/.codex/memories/`, among them `MEMORY.md` and
  `memory_summary.md` (`ls ~/.codex/memories`), and loads them into sessions (R-3 F-03).
- The loop settings declare a consumer's local rules: `project_procedure`, read by every SDD operation
  including the implementer; `instruction_files`; and `lenses`, applied only by spec reviews
  (`plugins/vh-adlc/references/loop-settings.md:40-42`). The implementation reviewer returns criterion
  records and defects and reads no standards file (`plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:97`).
  `bun scripts/loop/cli.ts context --repo <dir>` prints the reading list
  (`plugins/vh-adlc/references/loop-settings.md:124`).
- `git rev-parse --path-format=absolute --git-common-dir` prints the same directory from every worktree
  of a repository. Outside the plain layout, the folder holding it does not name the repository: for a
  worktree of a bare clone it is the bare clone's parent, and for a submodule it is `modules`. Distinct
  repositories on one host also share base names, such as two `homebrew-tap` checkouts (R-4 F-01).
- Codex CLI's default `workspace-write` sandbox refuses writes outside the workspace. On this Mac,
  `codex sandbox -c sandbox_mode=workspace-write -- sh -c "mkdir '$HOME/Library/Application Support/<probe>'"`
  failed with "Operation not permitted", and the same `mkdir` into a directory listed in
  `-c sandbox_workspace_write.writable_roots=[...]` succeeded. R-4 F-05 observed the same refusal on
  Linux for `~/.local/state`.
- The package checker has four skill classes besides the entry: scheduled operations, which must name
  `guides/humanize-prose.md` and contain `vh-adlc knowledge`; content operations, which need valid
  frontmatter; host operations; and coordination operations (`tests/vh-adlc/check.test.ts:16-28`,
  `:238-279`). Triage discovery asserts nineteen skills and counts eleven engineering skills after
  excluding the content, host and coordination ones by name
  (`tests/vh-adlc/triage/discovery.test.ts:13`, `:21-24`).
  The same test asserts "nineteen skills" and "five content operations" in `docs/user-guides/workflows.md`
  and "nineteen skills" in `docs/get-started/installation.md` (`tests/vh-adlc/triage/discovery.test.ts:51`,
  `:53`), and those pages state the counts at `docs/user-guides/workflows.md:15-17` and
  `docs/get-started/installation.md:118`. `references/loop.md` lists the operations that work unpinned
  with the plugin pin (`plugins/vh-adlc/references/loop.md:114-115`).
- The prior art is Matt Pocock's `retro` skill (Sources). Its categories and the mechanical-versus-
  judgement rule are adopted; it checks steering files "in the repo OR the user's global scope". Its
  `CODING_STANDARDS.md` home has no vh-adlc equivalent a code reviewer reads, so that rule is weakened
  here, as the Owner summary states.

### Terminology

| Term | Meaning |
| --- | --- |
| Session | The conversation the skill runs in, as it stands in the agent's context when retro is asked for, without the turns of the current or any earlier retro run in that conversation. |
| Candidate | One proposed environment change with key, category, severity, status, evidence, home and the exact change (AC-02). |
| Home | Where a candidate belongs; its class is `vh-adlc` for generic process lessons, `repository` for the consumer repository, or `user` for the owner's user-level instruction or memory files (AC-03). |
| Covering rule | Instruction text that forbids the mistake, or a check that runs automatically in a hook or CI. A configured check nothing runs is not a covering rule (AC-05). |
| Mechanical violation | A mistake with a fixed shape a tool can detect, such as a banned API, an edit to a generated path or a commit-message format (AC-04). |
| No-op instruction | An instruction that restates the host or model default, restates what a check that runs automatically already enforces, or duplicates another always-loaded instruction (AC-05). |
| Repeated waste | Five or more tool calls toward one goal without progress: searches and reads before the target is found, or retries of the same failing command (AC-02). |
| Recurring candidate | A candidate the skill judges to be the same problem as one in an earlier report, in the same category and home class, where that report was not saved earlier in this conversation (AC-07). |
| Fix that did not hold | A recurring candidate that a covering rule already addresses (AC-07). |

## Scope

- `plugins/vh-adlc/skills/vh-adlc-retro/SKILL.md`, registered as a content operation, model-invoked so
  intake can route to it (owner decision). It is a content operation because it writes a report and
  changes no feature status, like the other content operations.
- `plugins/vh-adlc/scripts/retro/`, a Bun CLI with `folder`, `history` and `save` commands, and its tests.
- `plugins/vh-adlc/references/retro.md`: the report format, the history comparison and the exact
  secret patterns, read from the skill when it reaches those steps.
- Intake routing in `references/lifecycle.md` and retro in the unpinned list of `references/loop.md`.
- Registration: `retro` in the checker's content operations and in triage discovery's exclusion list,
  the triage discovery count at twenty skills, and the text assertions and pages moving to "twenty skills"
  and "six content operations": `docs/user-guides/workflows.md` (count line and workflow table entry),
  `docs/get-started/installation.md` (count and list), a retro row in `docs/reference/compatibility.md`
  stating the Codex write-access requirement, and an entry in `docs/reference/marketplace.md`.
  Manifest version bumps.
- Under `tests/vh-adlc/retro/`: a fixture repository, fixture conversation templates for Claude Code
  and for Codex with the script that installs them, isolated host profiles holding fixture user-level files, seeded earlier reports, and
  the grader checklist.

Out of scope, by name: reviewing a saved transcript, a past session or another session, and anything
compaction removed from the context (owner decision 2026-11-27, tracked as #185); applying any
candidate, now or later (owner decision); creating issues; editing lessons, memory or instruction
files; committing a report; Copilot; reviewing several sessions in one run; scheduled runs; a
project-standards input for the implementation reviewer, which is a separate feature (owner
decision); a report location setting; reading git remotes (owner decisions); and cleaning up after
other runs.

Not handled: a moved or renamed main checkout starts a new report folder, because the folder key is
the checkout's common Git directory and no remote is read (R-4 F-01).

Not handled: when compaction has removed the file name an earlier retro run in this conversation
printed, that report counts as history from another session, so its candidates can show as recurring
or as fixes that did not hold; each such candidate names the earlier report, so the owner can see
where it came from (R-5 F-02).

## Design

### Knowledge and invocation

The skill resolves `guides/humanize-prose.md` with `vh-adlc knowledge` through the verified binary and
edits the report's prose with it. In a repository without a pin it works with the plugin pin, adds
none and reports the missing pin; `references/loop.md` lists retro with investigate.

Intake routes to retro a request for a retrospective, or for changes to the agent's instructions,
checks or tools, after or about a session. It routes to investigate a request about a defect in the
product or its code. A request that asks what went wrong in a session without asking for either, such
as "what went wrong in this session?", makes the agent ask which is meant.

### Session and report folder

The session is always the current conversation. The skill ignores the turns of the current retro run
and of any earlier retro run in the conversation, and notes the file name each earlier run's `save`
printed.

The repository is the one the skill runs in. `scripts/retro/cli.ts folder --repo <dir>` prints the
report folder: `<root>/vh-adlc/retro/<name>-<hash>/`, where `<root>` is `$XDG_STATE_HOME` when set,
otherwise `$HOME/.local/state` on Linux and `$HOME/Library/Application Support` on macOS. `<hash>` is
the first 12 hex characters of the SHA-256 of the absolute path that
`git rev-parse --path-format=absolute --git-common-dir` prints, so every worktree of one repository
gets the same folder and two repositories never share one. `<name>` is only for reading: the name of
the folder holding that directory when the directory is named `.git`, otherwise the directory's own
name without a trailing `.git`. Every report names its folder. An absent folder is a first run.

### Analysis

The model reviews the session in its context. It reads the files
`bun scripts/loop/cli.ts context --repo <dir>` lists, or the root instruction files when there are no
loop settings, and the always-loaded user-level instruction and memory index files in full. They are
`<config>/CLAUDE.md` and the project's auto-memory index on Claude Code, and `<CODEX_HOME>/AGENTS.md`,
`<CODEX_HOME>/memories/MEMORY.md` and `<CODEX_HOME>/memories/memory_summary.md` on Codex CLI. It searches the repository's build files, package scripts,
hooks and CI workflows, the lessons file the project procedure names, and the other memory notes for
each candidate's subject, rather than reading them whole. It reads every file it cites, to give the
line.

| Category | Trigger | Typical change |
| --- | --- | --- |
| Navigation | Many searches or reads before the right file was found | A pointer in an instruction file or reference |
| Deterministic checks | A mechanical violation, or a repository with no check wired | Wire or add the check in a guardrail, as below |
| Review standards | A judgement-level mistake the review step did not catch | A rule in the consumer's project procedure, marked as weaker than a reviewer input |
| Instruction size and no-ops | A no-op instruction, or always-loaded files large enough to crowd the context | Delete it, or move text behind a pointer |
| Tool economy | A tool call whose output or cost was far larger than its use | A narrower command, script or flag |
| Information access | A fact the agent needed and could not reach | Access to a log, a read-only tool or a documented location |

A mechanical violation is always proposed as a deterministic check in the repository where it
happened, never as a prose or review rule, even when a prose rule already covers it; the report then
cites that rule as the one that did not hold. The check goes in the pre-commit hook when the mistake
reached a commit, a commit-message check in the commit-msg hook, and otherwise in the earliest
guardrail that already exists, adding the hook where none does. An instruction is never flagged only
because the session did not exercise it. Before proposing a candidate, the skill searches every file
it read for a covering rule; a covered candidate cites that rule's location, says why it did not hold,
and proposes no duplicate rule.

### Severity and order

Base severity: high for a mistake that reached a commit, a review or the owner; medium for a mistake
caught before commit, or repeated waste; low for any other waste, a no-op instruction or instruction
size. A navigation or information-access candidate with no resulting mistake is medium when it is
repeated waste and low otherwise. Then the status is set, in this order: a recurring candidate with a
covering rule is `fix-not-held` and high; any other recurring candidate is `recurring` and moves up one
level, high staying high; a covered candidate that is not recurring is `covered` and keeps its base
severity; every other candidate is `new`.

Candidates are ordered by severity, then by status (`fix-not-held`, `recurring`, `new`, `covered`),
then by where their first evidence occurs in the session. Candidates whose evidence lies only in
repository or user-level files follow those with session evidence in the same group, ordered by file
path and line.

### History

`history --dir <dir> [--exclude <file name>]...` reads every earlier report: files ending in `.md`
whose names do not start with `.`. Each report ends with a fenced `retro-report` YAML block:
`format: 1` and a `candidates` list giving, per candidate, its key, category (`navigation`,
`deterministic-checks`, `review-standards`, `instructions`, `tool-economy` or `information-access`),
home, home class (`vh-adlc`, `repository` or `user`), severity (`high`, `medium` or `low`), status
(`new`, `recurring`, `fix-not-held` or `covered`), `recurs` (the file names of the earlier reports it
matched, possibly empty) and a one-line summary. The key is `<category>:<home class>:<kebab-case slug>`. The skill passes the file names of
reports saved earlier in this conversation as `--exclude`; `history` lists them as earlier runs of
this session and returns no candidates from them. It returns every other candidate with the file
name of its report. A report whose `format` is newer than 1, or whose
block does not parse, is skipped and listed by name.

The skill compares each new candidate with the returned candidates of the same category and home
class. When it judges one to be the same problem, it records that report's file name under `recurs`
and adopts its slug.

### Report and save

Per candidate the report gives severity, status, category, evidence (a short quote with the tool call
or message it came from, or a file and line for file-only evidence), home, the exact change, its
history (the earlier report files under `recurs`), and for a review-standards candidate the weakness above. With no earlier report, the report
says it is a first run.

The skill pipes the report to `save --dir <dir>` on standard input. `save` redacts it, then parses
its `retro-report` block and refuses with a reason, writing nothing, unless the block is a valid
`format: 1` block with every field and only the tokens listed above; the skill then corrects its draft
and saves again. Otherwise `save` creates any missing report folders with mode 0700, writes
the report to `.<random>.tmp` in the folder, created exclusively with mode 0600, links that file to `<UTC time to the second>-<6 random hex>.md` only if the name
is free (choosing new hex otherwise), removes the temporary file and prints the saved name and its
redacted text. The skill shows that text, not its own draft. When `save` cannot write, it prints the
reason and the redacted report, and the skill shows both and says the report was not saved.

Redaction. The exact patterns live in one place, `references/retro.md`, which both `save` and the
AC-06 check read. They cover PEM private key blocks; `Authorization`, `Proxy-Authorization`, `Cookie`
and `Set-Cookie` header values; `Bearer` tokens; AWS access key IDs (`AKIA` or `ASIA` plus exactly 16
uppercase letters or digits); GitHub tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` or `github_pat_`
plus at least 20 token characters); Slack tokens (`xox[abposr]-` plus token characters); `sk-` keys of
at least 20 token characters starting at a word boundary; JSON Web Tokens (three dot-separated
base64url segments, the first starting `eyJ`); credentials in URLs (`scheme://user:pass@`); and the
value assigned to any key whose name contains, case-insensitively, `password`, `passwd`, `secret`,
`token`, `api_key`, `apikey`, `private_key` or `credential`, in `key=value`, `key: value` and JSON
forms, such as `DB_PASSWORD=`, `GITHUB_TOKEN=` and `STACKWEAVER_HOSTED_SECRET=`. Each match becomes
`<REDACTED>`. No pattern treats the marker `<REDACTED>` itself as a secret value, so redacting a
redacted report changes nothing.

### Effects and failure

The only file the skill or its script writes is the report, through its temporary file in the report
folder. A run killed during `save` can leave a dot-named temporary file, which `history` ignores and
nothing removes. Apart from the plugin's binary install and knowledge fetch, with their cache writes,
there is no other file write, Git change, or tracker or network call. Concurrent runs choose different
names and never overwrite a report.

On Codex CLI under the default `workspace-write` sandbox, `save` needs write access to the report
folder: the owner approves the command when Codex asks, or adds the report root to
`sandbox_workspace_write.writable_roots`. When the write is refused, the run ends with the redacted
report shown and nothing saved, as above. The compatibility row states this.

Rollback is reverting the plugin version; a rolled-back version skips reports in a newer format.

## Acceptance Criteria

- [ ] AC-01: `vh-adlc-retro` is discovered on Claude Code CLI and Codex CLI from the source-distributed
      plugin; a retrospective request without an operation name reaches it through intake, and "what
      went wrong in this session?" makes the agent ask whether a retrospective or an investigation is meant.
- [ ] AC-02: Run on the small fixture conversation on the running host, the first report lists a
      candidate for each planted problem P1 to P5 and P7 to P9, each with key, category, severity,
      status, evidence, home and change, in the first-run order below; P6 is not listed, and other
      candidates may appear anywhere.
- [ ] AC-03: Each planted problem's candidate names the home class the fixture table gives.
- [ ] AC-04: P1 and P2 are each proposed as a check in a new pre-commit hook (P1 running the configured
      lint rule), not as a prose or review rule.
- [ ] AC-05: P2 is reported as covered with the forbidding `AGENTS.md` line, P9 as covered with the
      forbidding line of the fixture user-level instruction file, P5 as a no-op instruction, and P6 is
      not flagged.
- [ ] AC-06: None of the planted secrets, and no string matching a pattern in `references/retro.md`
      other than the `<REDACTED>` marker, appears in the saved or shown report, including a secret
      from the fixture user-level memory file that the planted conversation quotes. After the run the
      fixture repository and trackers are unchanged, and the report folder differs only by the new
      report, which, like the folders `save` created, only its owner can read.
- [ ] AC-07: A second run with seeded earlier reports marks P2 `fix-not-held` and P3 `recurring`, both
      high, citing the seeded report, in the second-run order below; P4 and P5, also raised by a report
      saved earlier in the same conversation and by a `format: 2` report, stay low and `new`, and both
      of those reports are listed by name; with no earlier report the run states it is a first run.
- [ ] AC-08: `save` refuses, writing nothing, a report whose `retro-report` block `history` would skip
      or that lacks a field or uses an unlisted token, and every report `save` writes is read back by
      `history` with its candidates.
- [ ] AC-09: Two worktrees of one repository resolve to the same report folder, and so does a worktree
      of a bare clone with its other worktrees; two repositories whose main folders share a name
      resolve to different folders.

### Fixture table

The fixture repository has a lint configuration with the rule P1 breaks, a CI workflow that does not
run the lint, no pre-commit or commit-msg hook, a project procedure file, `AGENTS.md`, the settings
file P3 searches for, the generated file P2's edit targets, and the helper P7 duplicates.

Each fixture conversation is a JSON Lines template in its host's session format, started from a short
real session recorded on that host and edited to plant the problems, with placeholders for the
fixture repository path and the session id. Before each recorded run, the install script copies the
fixture repository to a fresh directory and makes it a Git repository whose working tree and commits
match the conversation: P1's banned call and P7's duplicate helper committed at the lines the
conversation shows, and P2's generated file present and unedited. It fills the placeholders with the
copy's real path and a new id, and writes the result where the host looks for it: under
`<CLAUDE_CONFIG_DIR>/projects/<encoded path>/`, computed from that real path as Background states, or
under `<CODEX_HOME>/sessions/YYYY/MM/DD/`. The run then resumes that id. Each recorded run
uses an isolated host profile (`CLAUDE_CONFIG_DIR` or `CODEX_HOME`)
holding the fixture user-level instruction and memory files, with a fresh, empty `XDG_STATE_HOME`
seeded only with the stated reports for the second run. The conversation plants the problems in
this order of first evidence: P3, P1, P8, P9, P2, P7, P4. P5 and P6 live only in `AGENTS.md`.

| Problem | Planted as | First run | Second run | Home class |
| --- | --- | --- | --- | --- |
| P1 Mechanical violation | A banned API call the configured lint rule flags, committed | high, new | high, new | Consumer repository |
| P2 Covered mechanical violation | An edit to a generated file that `AGENTS.md` forbids, caught before commit | medium, covered | high, fix-not-held | Consumer repository |
| P3 Navigation detour | Twenty searches and reads before finding the settings file (repeated waste) | medium, new | high, recurring | Consumer repository |
| P4 Oversized output | A vh-adlc plugin script printing a multi-megabyte result that was barely used, recorded exactly as the host records an oversized result, with its size visible and never the full output inline | low, new | low, new | vh-adlc |
| P5 No-op instruction | "Save files as UTF-8" in `AGENTS.md`, which restates the host default | low, new | low, new | Consumer repository |
| P6 Unexercised rule | "Never run migrations against production" in `AGENTS.md` | not listed | not listed | none |
| P7 Review standard | A committed duplicate of an existing helper that the review step passed | high, new, with the weakness note | high, new | Consumer repository (project procedure) |
| P8 Information access | One failed attempt to read the dev server log, after which the agent asked the owner | low, new | low, new | Consumer repository |
| P9 Covered by user-level rule | A drafted commit message claiming tests pass before they ran, which the fixture user-level instruction file forbids; the agent ran them before committing | medium, covered | medium, covered | User-level files |

First-run order: P1, P7, P3, P9, P2, P8, P4, P5. Second-run order: P2, P3, P1, P7, P9, P8, P4, P5. The
second run resumes a variant of the conversation that ends with an earlier, completed retro run whose
`save` output names one seeded report. The seeded reports are: one from another session raising P2
and P3; the one that earlier run saved, raising P4 and P5; and one in `format: 2` raising P4 and P5.
The fixture user-level memory file holds one planted secret, which the conversation quotes.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `bun test tests/vh-adlc` (content-operation checks, discovery counts of twenty skills and eleven engineering skills, the count text in `workflows.md` and `installation.md`, loop.md and lifecycle.md entries). Recorded runs per host: invoking `vh-adlc-retro` by name, pass when the skill loads; "run a retrospective on this session", pass when intake selects `vh-adlc-retro`; "what went wrong in this session?", pass when the agent asks whether a retrospective or an investigation is meant and runs neither. |
| AC-02, AC-03, AC-04, AC-05 | A recorded first run per host, resuming the small fixture conversation with the retro request (`claude --print --resume` or `codex exec resume`, Codex in the default `workspace-write` sandbox with the fixture `XDG_STATE_HOME` as a writable root). A fresh read-only subagent on the same host grades the saved report against `tests/vh-adlc/retro/checklist.md`, one item per fixture row and criterion (fields present, severity and status, relative order of planted candidates, home class, P1 and P2 as checks in a new pre-commit hook with P1 running the lint, P2 and P9 covered with their lines, P5 flagged, P6 absent, P7 with the weakness note), and returns `ITEM <id>: PASS` or `ITEM <id>: FAIL <evidence>` per item; pass when every item passes. |
| AC-06 | `bun test tests/vh-adlc/retro` runs `save` over a report holding one example of every listed shape and key form, including `DB_PASSWORD=`, `GITHUB_TOKEN=`, `STACKWEAVER_HOSTED_SECRET=` and a multi-line PEM block, which must all be redacted, and near-misses that must survive: the word `secretary` in prose, a lone `sk`, a 15-character `AKIA` string, `task-list`, `risk-free`, `disk-usage`, `DB_PASSWORD=<REDACTED>` and `Bearer <REDACTED>`; saving the saved text again must leave it unchanged; with umask 022, the folders `save` creates have mode 0700 and the report mode 0600. In the recorded runs: search the saved report and the shown text with the patterns from `references/retro.md` and for each planted secret, the memory-file secret included (must find none other than the marker); compare `git status --porcelain` and file hash lists of the fixture repository and the report folder before and after (must differ only by the one report); the run log shows no tracker or network command other than the binary install and knowledge fetch. Host-owned files are outside the comparison. |
| AC-07 | A recorded second run per host on the variant conversation with the three seeded reports, graded by the checklist's second-run items (P2 and P3 status, severity and `recurs` naming the seeded report's file, also named in the report text, order, P4 and P5 low and `new`, the excluded and the skipped report listed). `bun test tests/vh-adlc/retro` covers `history` with `--exclude`, skipping newer and malformed blocks, ignoring dot-named files, and an empty folder. |
| AC-08 | `bun test tests/vh-adlc/retro`: `save` on reports with an unparseable block, a `format: 2` block, a missing field and an unlisted category token refuses with a reason and leaves the folder unchanged; a valid report saved by `save` is returned by `history` with every candidate. |
| AC-09 | `bun test tests/vh-adlc/retro`: `folder` from two worktrees of a temporary repository returns one folder; from a worktree of a bare clone and a second worktree of it, one folder; from two temporary repositories whose main folders share a name, two different folders. |

## Tasks

- [ ] T1 `tests/vh-adlc/retro/folder.test.ts` - `folder` from two worktrees, from a bare clone's two worktrees and from two same-named repositories; fails because `scripts/retro/cli.ts` does not exist (AC-09)
- [ ] T2 `plugins/vh-adlc/scripts/retro/cli.ts`, `plugins/vh-adlc/scripts/retro/folder.ts` - the `folder` command with the state root, name and common-directory hash; T1 passes (AC-09)
- [ ] T3 `tests/vh-adlc/retro/save.test.ts` - redaction of every listed shape and key form, the near-misses and the marker surviving, saving twice leaving the text unchanged, folder 0700 and report 0600 under umask 022, refusal of an unparseable, `format: 2`, missing-field or unlisted-token block with the folder unchanged; fails because `save` does not exist (AC-06, AC-08)
- [ ] T4 `plugins/vh-adlc/references/retro.md`, `plugins/vh-adlc/scripts/retro/` - the report format and secret patterns, and `save` (redact, validate, exclusive temporary file, link to a free name, print the name and text, print the redacted report when it cannot write); T3 passes (AC-06, AC-08)
- [ ] T5 `tests/vh-adlc/retro/history.test.ts` - `--exclude` listing and dropping same-conversation reports, skipping newer and malformed blocks by name, ignoring dot-named files, an empty or absent folder, each candidate returned with its report's file name, and a report written by `save` read back with every candidate; fails because `history` does not exist (AC-07, AC-08)
- [ ] T6 `plugins/vh-adlc/scripts/retro/` - the `history` command; T5 passes (AC-07, AC-08)
- [ ] T7 `tests/vh-adlc/check.test.ts`, `tests/vh-adlc/triage/discovery.test.ts` - `retro` as a content operation, in triage discovery's exclusion list, twenty skills, and "twenty skills" and "six content operations" in the guides; fails because the skill and the page changes do not exist (AC-01)
- [ ] T8 `plugins/vh-adlc/skills/vh-adlc-retro/SKILL.md`, `plugins/vh-adlc/references/lifecycle.md`, `plugins/vh-adlc/references/loop.md`, `docs/get-started/installation.md`, `docs/user-guides/workflows.md`, `docs/reference/compatibility.md`, `docs/reference/marketplace.md`, `plugins/vh-adlc/plugin.json`, `plugins/vh-adlc/.claude-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json` - the skill, intake row, unpinned entry, pages, Codex write-access row and version bumps; T7 and `bun test tests/vh-adlc` pass (AC-01)
- [ ] T9 `tests/vh-adlc/retro/install.test.ts` - installing each host's fixture makes a Git repository whose commits and files match the conversation, and writes the filled session where that host looks for it, the Claude Code folder encoded from the copy's real path; fails because the fixtures and install script do not exist (AC-02, AC-07)
- [ ] T10 `tests/vh-adlc/retro/` - the fixture repository, first-run and second-run conversation templates for both hosts started from real recorded sessions, isolated profiles with the user-level files and planted secret, seeded reports, the install script and `checklist.md`; T9 passes (AC-02, AC-03, AC-04, AC-05, AC-06, AC-07)
- [ ] T11 `tests/vh-adlc/retro/runs/` - recorded runs on Claude Code and Codex: the three intake prompts, the first run and the second run, each graded by a fresh read-only subagent against `checklist.md`, with the AC-06 searches and before-and-after comparisons; every item passes on both hosts (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07)

## Open Questions

None.

## Deferred

- D-01: Reviewing saved transcripts, past sessions and other sessions, tracked as #185. From: owner cut on 2026-11-27. Verdict: pending.
- D-02: Keeping report history when the main checkout moves or is renamed. From: R-4 F-01, stated limit. Verdict: pending.
- D-03: Excluding an earlier same-conversation report whose file name compaction removed. From: R-5 F-02, stated limit. Verdict: pending.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-15 | R-1 | spec | `ef7f01b8b85a78c3c26aebb77aab526eed13d54a` | claude-opus-5-5 | procedural | One blocking, twelve should-fix and two nit findings |
| 2026-11-15 | R-2 | spec | `b34ba95382ee1ceb78d0c6c2ac5d751dc65b0ff3` | claude-opus-5-5 | procedural | One blocking, sixteen should-fix and three nit findings |
| 2026-11-15 | R-3 | spec | `09de0c3e2a106f48ae3f72e8859362a9193cc308` | claude-opus-5-5 | procedural | One blocking, ten should-fix and three nit findings |
| 2026-11-15 | R-4 | spec | `fc1b66539fc6b13d92d6473230911e8fbaf31691` | claude-opus-5-5 | procedural | Eleven should-fix and three nit findings |
| 2026-11-27 | R-5 | spec | `4f465f0348baea0bba3fbea1c5c6752f6510686a` | claude-opus-5-5 | procedural | Three should-fix and four nit findings |
| 2026-11-27 | R-6 | spec | `f2fc74e65fddcfb902229042385ba973d2c8d2a8` | claude-opus-5-5 | procedural | One blocking, two should-fix and one nit finding |
| 2026-11-27 | R-7 | spec | `f0f8dd4ddd76a13f2dc0ea9b071a20a86d38fcf5` | claude-opus-5-5 | procedural | No findings |
| 2026-11-27 | R-7 | spec | `f0f8dd4ddd76a13f2dc0ea9b071a20a86d38fcf5` | n/a | n/a | accepted by owner |

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

### R-2

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Owner summary ("On Codex the skill asks you to name the session, because Codex exposes no current-session identifier"); Background ("Codex CLI 0.163.0 exposes no such variable"); Design, Session and repository ("on Codex CLI, or when the variable is missing, it asks the owner to name the session"); AC-09 ("a Codex CLI run asks the owner to name the session"); Test Plan row AC-09 ("A recorded Codex CLI run with no session named; pass when the agent asks for the session and writes no report")
EVIDENCE: `codex --version` prints `codex-cli 0.163.0`. I ran `codex exec -s read-only --skip-git-repo-check "Run exactly this shell command and print its output verbatim: env | grep -E '^CODEX_(SESSION|THREAD)_ID='"` in an empty temporary directory. It printed `CODEX_SESSION_ID=01a1de7c-bf95-7033-99a8-2071e5bf6b71` and `CODEX_THREAD_ID=01a1de7c-bf95-7033-99a8-2071e5bf6b71`, and the newest rollout was `~/.codex/sessions/2026/11/15/rollout-2026-11-15T10-14-40-01a1de7c-bf95-7033-99a8-2071e5bf6b71.jsonl`, so the variable names the current session's rollout file exactly. The Background's only support is `grep -rhoE "CODEX_[A-Z_]+" plugins tests`, which shows what the plugin references (CODEX_HOME 33 times, CODEX_DISABLED 3 times), not what Codex exposes. The claim was added by the revision that answered R-1 F-02. Because it is false, the Codex default the design builds (always ask) and the AC-09 proof (pass only if it asks) are built on a missing mechanism that actually exists.
PROPOSAL: Correct the Background, then define the Codex default from `CODEX_SESSION_ID` or `CODEX_THREAD_ID` with the ask path only when it is absent, and change AC-09 and its Test Plan row to prove that a Codex run reviews its own rollout while a newer one exists. If asking on Codex is still preferred, raise that trade-off as an Open Question rather than resting it on the false fact.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Severity and order (tier table, "Each candidate gets one tier"); Design, Analysis ("Before proposing a candidate, the skill searches every file it read for a rule that already covers it"); Terminology (Fix that did not hold); Fixture table rows P1 and P2; AC-02; AC-07
EVIDENCE: The tier kinds overlap and no precedence is given. P2 is a mistake caught before commit (tier 4) and a covered candidate that is not recurring (tier 7); the fixture expects 7, so a first-matching-tier rule, which gives P1 tier 2 and second-run P3 tier 3 as the fixture expects, gives P2 tier 4 instead. P1 is a banned API call that "the repository's configured lint rule flags", so under the covered check the lint rule already covers it, making it both tier 2 and tier 7; the fixture expects 2. No single rule reproduces all fixture rows, and a covered defect that reached a commit has no determinable tier. This table was introduced by the revision that answered R-1 F-05.
PROPOSAL: State an explicit precedence (for example, the lowest-numbered tier that applies, with covered-and-not-recurring placed where the fixture needs it) and whether a configured but unwired check counts as an existing rule for the covered test, then make the P1 and P2 fixture rows follow that rule.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: AC-02 ("lists a candidate for each planted problem in the fixture table below ... in the order the table gives"); Fixture table and the order paragraph beneath it ("First-run order: P1, P3, then P4 and P5 by first evidence line, then P2"); Design, Severity and order ("then by their first evidence line in the session"); Design, Report and save ("evidence (digest source lines and a short quote)"); Test Plan row AC-02, AC-03, AC-04, AC-05 (checklist item "order")
EVIDENCE: The table rows run P1 to P6, which is not the first-run order the paragraph gives (P2 last), so "the order the table gives" read literally contradicts the tiers; P6 is in the table yet must not be listed. The tie rule uses "first evidence line in the session", but P5 is a no-op instruction whose evidence is a line of `AGENTS.md` and `.editorconfig`, not a session line, and the report's evidence field is defined as digest source lines only, so P5 has no defined evidence or position against P4. The document also does not say whether unplanted extra candidates are allowed or how the order check treats them; a real run on a fixture session will usually produce some.
PROPOSAL: Point AC-02 at the order paragraph and exclude P6 explicitly, define evidence and the tie position for candidates whose evidence is a repository or user-level file, and state that the order check is the relative order of the planted candidates with extras allowed (or forbidden).

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, History ("The skill compares a new candidate only with earlier candidates of the same category and home"; key `<category>:<home path ...>:<slug>`); Terminology (Recurring candidate); Fixture table (Home class column, "Consumer repository" only); AC-07; Test Plan row AC-07
EVIDENCE: The home is a model-chosen file path. P3's change is "a pointer in an instruction file or reference", so one run may choose `AGENTS.md`, another `CLAUDE.md` or a docs page. Because comparison is restricted to an identical normalised home, the same problem proposed in a different file is never compared and never marked recurring. The fixture gives only the home class, not the home path the seeded report records for P2 and P3, so AC-07 passes or fails depending on whether the second run happens to pick the seeded path, and a correct implementation of the stated rule can fail it. The key and home restriction came from the revision that answered R-1 F-06.
PROPOSAL: Either compare within category across homes of the same class (keeping the key for adopting the earlier slug), or fix the expected home path for each planted problem in the fixture table and the seeded report so the grader can derive the outcome.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: AC-07 ("a seeded report from the same session is listed as a previous run and not counted; a seeded report with a newer format is skipped and listed"); Test Plan row AC-07 ("three seeded reports (another session raising P2 and P3, the same session, a `format: 2` report)"); order paragraph under the Fixture table ("The seeded earlier report raises P2 and P3")
EVIDENCE: The candidates held by the same-session report and the `format: 2` report are not specified. If they raise nothing beyond P2 and P3, or only P1 (tier 2 either way), an implementation that wrongly counts them as recurrences produces the same tiers and order, so "not counted" and "skipped" are unobservable in the recorded runs and the proof passes a wrong implementation. Only a seeded candidate that would otherwise change tier, such as P4 or P5 at tier 6, makes miscounting visible.
PROPOSAL: Specify that the same-session and `format: 2` seeded reports each raise P4 or P5 with matching keys, and add checklist items that those stay at tier 6 and are not marked recurring.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Extraction and redaction ("the tool input and output each cut to 600 characters"; "Before anything is written, every string passes through redaction"; "values assigned to keys named `password`, `passwd`, `secret`, `token`, `api_key` or `apikey`"); Owner summary ("The same script removes known secret shapes"); AC-06; Test Plan row AC-06
EVIDENCE: The order of truncation and redaction is not stated. If the 600-character cut runs first, a PEM block or JWT split at the boundary loses its END marker or its third segment, no longer matches its shape, and a fragment of key material survives into the digest. Key matching is also undefined: real transcripts carry environment dumps such as `DB_PASSWORD=`, `GITHUB_TOKEN=` or `STACKWEAVER_HOSTED_SECRET=` (a variable the consumer's CLAUDE.md names), and an exact-name, case-sensitive matcher misses all of them while a substring matcher catches them. Two implementers build different redactors, and the AC-06 fixture ("one example of every listed secret shape") does not decide between them.
PROPOSAL: State that redaction runs on the full string before any cut, and define key matching (case-insensitive, and whether names containing or ending with the listed words match), with must-redact and must-survive examples for both in the AC-06 row.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Owner summary ("The same script removes known secret shapes before the model sees anything"); Design, Analysis (the model reads instruction files, build files, CI workflows, `~/.claude/CLAUDE.md` and the auto-memory index and notes directly); Design, Report and save ("It is shown in the conversation and passed to `save` ... which redacts it again"); Design, Effects and failure; AC-06 ("in the shown or saved report"); Test Plan row AC-06
EVIDENCE: Only the digest and the saved file pass through the script. The repository files and the user-level instruction and memory files go to the model unredacted, so "before the model sees anything" is false; memory notes are a realistic place for credentials. The report is shown in the conversation before `save` redacts it, so a secret the model quotes from a memory note or instruction file reaches the shown report with no deterministic redaction, which AC-06 forbids. The AC-06 proof plants secrets only in the session, so it passes on this leak. The summary sentence was written by the revision that answered R-1 F-08.
PROPOSAL: Scope the summary to the transcript, and either show the report only after `save` (displaying the redacted file) or pass the shown text through the same redaction; plant a secret shape in a fixture instruction or memory file for the AC-06 proof.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary ("It writes nothing except its report, creates no issue, and makes no tracker or network call of its own"); Design, Knowledge and invocation ("resolves `guides/humanize-prose.md` with `vh-adlc knowledge` through the verified binary"); Design, Effects and failure ("the run writes nothing: no other file ... no tracker or network call by the skill or its script"); AC-06; Test Plan row AC-06 ("the run log shows no tracker or network command")
EVIDENCE: `references/loop.md` makes knowledge resolution a fetch that can return `unreachable` and caches each page under `${XDG_CACHE_HOME:-$HOME/.cache}/vh-adlc/docs/<sha>/<page>`, and its first step runs the installer that fetches the binary named in `vh-adlc.lock.json` (plugins/vh-adlc/references/loop.md, "Resolve knowledge" and the installer paragraph). So the skill's own steps can make network calls and write cache files, contradicting both absolute claims, and a grader applying "no network command" to the run log must decide whether `vh-adlc knowledge` or the installer counts.
PROPOSAL: Exempt the binary install and knowledge resolution, with their cache writes, by name in the Owner summary, Effects and the AC-06 proof, so the proof checks only for tracker and other network commands.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Report and save ("writes it ... to a temporary file in the same directory, links it to the final name only if that name is free, and removes the temporary file on success and on failure"); Design, Effects and failure ("Apart from its digest in the system temporary directory, removed at the end"; "An interrupted save leaves either the complete report or nothing"); Owner summary ("It writes nothing except its report"); AC-06 ("with no temporary file left behind"); Test Plan row AC-06
EVIDENCE: A process killed between the temporary write and the link, or before cleanup, leaves the temporary file in the report directory and the digest of session content in the system temporary directory; "removes ... on failure" covers handled errors only, so "complete report or nothing" is unsupported for an interrupted run. The temporary name is undefined, so `history`, which reads "every earlier report", may parse a leftover as a report. The AC-06 proof compares only the fixture repository and the report directory, never the system temporary directory, so it passes an implementation that leaves the digest behind. The temporary-file mechanism came from the revision that answered R-1 F-03.
PROPOSAL: Give the temporary file a name `history` ignores (for example dot-prefixed, not ending in `.md`), say how leftovers from an interrupted run are handled, and extend the AC-06 proof to list the run's temporary directory before and after.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Scope ("Fixture sessions, a large-session generator"); Design, Extraction and redaction (`--host <claude|codex>`); AC-08; Test Plan rows AC-02, AC-03, AC-04, AC-05, AC-07, AC-08 and AC-10
EVIDENCE: The document never says which host format the small fixture session is in. The large fixture must have `subagents/` and `tool-results/`, which exist only in the Claude Code layout, so it is a Claude transcript. "A recorded run per host" names where the skill runs, not the transcript format, and the only Codex-format input named anywhere is the "file from another host" negative case in AC-10. The Codex rollout parser can therefore be absent or broken while every proof passes, although the Background's 216 MB and 224 MB examples are Codex rollouts.
PROPOSAL: Require a Codex-format version of the small fixture (and a large Codex rollout from the generator) and state which fixture each recorded run uses, with `bun test` cases for the Codex parser.

FINDING: F-11
KIND: judgement
SEVERITY: should-fix
WHERE: Owner summary (review standards "the report says plainly that this is weaker"; user-level instruction and memory files read); Design, Analysis (Review standards and Information access rows; covered check over "every file it read", including user-level files); Terminology (Home); AC-03 ("the owner's user-level files"); Fixture table; Test Plan row AC-02, AC-03, AC-04, AC-05
EVIDENCE: No fixture row plants a review-standards problem, an information-access problem, or anything whose home is the user-level files, and no planted rule lives in a user-level file. So the weakness note the Owner summary promises, two of the six categories, the user-level home class AC-03 names, and the covered check against user-level files (the change made for R-1 F-11) are never exercised; an implementation that never reads user-level files or never emits the weakness note passes every proof.
PROPOSAL: Add fixture rows for a judgement-level mistake (expecting the project procedure home and the weakness note), an information-access gap, and a covered mistake whose forbidding rule is in a fixture user-level file, with checklist items for each.

FINDING: F-12
KIND: judgement
SEVERITY: should-fix
WHERE: AC-04 ("wired into the consumer's pre-commit hook"); Fixture table row P1 ("committed because no hook runs the lint"); Design, Analysis table (Deterministic checks row, "Wire or add the check in the home's guardrail, adding one where none is wired"); Test Plan row AC-02, AC-03, AC-04, AC-05 ("P1 as a hook check")
EVIDENCE: The Design never says how the guardrail is chosen; the prior art lets it be "a custom rule in the repo's own linter, a new pre-commit hook, or a new CI job, whichever ... make cheapest" (retro/SKILL.md at 5863806). The fixture does not say whether the repository has CI running the lint. A correct run that proposes wiring the lint into an existing CI job satisfies the Design and fails AC-04.
PROPOSAL: State the selection rule in the Design (for example, a defect that reached a commit goes to the pre-commit hook) and state in P1 which guardrails the fixture repository has.

FINDING: F-13
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Knowledge and invocation ("Intake routes a request about what to change in the agent's environment after a session (it names a session, a transcript or "this session") to retro, and a request about a defect in the product or its code to investigate; a request that fits both asks"); AC-01; Test Plan row AC-01
EVIDENCE: The Test Plan's ambiguous example, "what went wrong in this session?", names "this session" and says nothing about a product defect, so the stated rule routes it to retro, while the proof passes only if the agent asks. An implementer writing the lifecycle row from the Design fails the proof; another who copies the example passes. The row for "run a retrospective on this session" also has no stated pass condition. The routing rule came from the revision that answered R-1 F-09 (lifecycle.md:55 routes "Diagnosis or findings" to investigate).
PROPOSAL: Define what makes a request fit both (for example "what went wrong" without asking for environment changes), make the lifecycle row text match it, and give each recorded AC-01 run its pass condition.

FINDING: F-14
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Analysis ("read-only, the host's user-level files: `~/.claude/CLAUDE.md` and the project's auto-memory index ... on Claude Code, `~/.codex/AGENTS.md` on Codex CLI"); Owner summary ("your user-level instruction and memory files"; "for a Codex transcript reviewed in Claude Code is a second provider"); Terminology (Home)
EVIDENCE: Cross-host review is supported, but "the host's user-level files" does not say whether that means the host running the skill or the host that produced the transcript. For a Codex transcript reviewed in Claude Code, the files that steered the reviewed session are `~/.codex/AGENTS.md`, yet one reading loads only `~/.claude/CLAUDE.md`, so the covered and no-op checks inspect the wrong instructions and a user-level home names the wrong file. The user-level input was added by the revision that answered R-1 F-11.
PROPOSAL: Say the user-level files are those of the transcript's host (honouring `CODEX_HOME` and the Claude configuration directory), and add a cross-host recorded run or test that shows which files were read.

FINDING: F-15
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Extraction and redaction ("complete aggregates: tool calls by name, the 20 largest outputs ..., repeated failing commands, and the reads and searches before the first edit of each file"; "when entries exceed 400,000 characters ... aggregates stay complete"); Owner summary ("reduces it to a bounded digest"); Terminology (Digest, "bounded"); Test Plan row AC-08
EVIDENCE: Only the entries are capped. The per-file reads-before-first-edit list and the repeated failing commands grow with session length, and the sessions this feature targets are the large ones (local Codex rollouts of 217,272,576, 224,716,404 and 532,507,317 bytes, `find ~/.codex/sessions -size +100M`). So the digest is not bounded as claimed, and an implementer must invent a cap or let the model read an unbounded file. The AC-08 generator builds its own shape at 13 MB, so it cannot show the bound holds. The extraction design came from the revision that answered R-1 F-01.
PROPOSAL: Give each aggregate a cap with a recorded overflow count, or state the total digest limit, and have the AC-08 test assert the digest size on a generated session with many edited files.

FINDING: F-16
KIND: judgement
SEVERITY: should-fix
WHERE: frontmatter goal ("After a finished agent session"); Owner summary ("reviews one session, the current one by default"); Design, Session and repository; Design, History ("previous runs of this session"); Design, Extraction and redaction
EVIDENCE: The default target is the live session, not a finished one, and the document does not say where the reviewed session ends. On a rerun of the same session, which History explicitly supports, the transcript now contains the earlier retro run's own turns: its `extract`, the read of a digest of up to 400,000 characters, the instruction and memory reads and the report. Without a cut-off these become evidence, for example a tool-economy candidate against vh-adlc's own retro digest, and two implementers will differ on whether to exclude them.
PROPOSAL: Define the end of the reviewed session (for example, the turn that invoked retro) and state that earlier retro runs' turns in the same transcript are excluded from candidates.

FINDING: F-17
KIND: factual
SEVERITY: should-fix
WHERE: covers frontmatter; Scope ("the two documentation pages")
EVIDENCE: `docs/get-started/installation.md` enumerates the package ("The package contains fifteen skills: the generic `vh-adlc` entry, eleven engineering operations, ..."), and `docs/reference/compatibility.md` keeps the per-operation host support matrix (for example the `vh-adlc-clean` row for Claude Code and Codex on Linux). Adding a seventeenth skill that claims Claude Code CLI and Codex CLI support changes both, but neither is in covers or Scope, so the implementer will not update them and the docs-impact check will not flag them for this feature.
PROPOSAL: Add both pages to covers and Scope, with the installation count and a retro row in the support matrix.

FINDING: F-18
KIND: factual
SEVERITY: nit
WHERE: Owner summary ("Real transcripts run from 13 MB to over 200 MB")
EVIDENCE: Of 29 main transcripts in `~/.claude/projects/-home-m-code-stackweaver`, 2 exceed 13 MB and 2 are under 1 MB (`find . -maxdepth 1 -name '*.jsonl' -size +13M`, `-size -1M`); a 532,507,317-byte Codex rollout also exists. 13 MB is one observed size, not a lower bound.
PROPOSAL: Say "range up to over 200 MB, and a typical one is several megabytes".

FINDING: F-19
KIND: factual
SEVERITY: nit
WHERE: Test Plan row AC-01 ("both discovery counts at seventeen"); Background (triage discovery.test.ts:22)
EVIDENCE: tests/vh-adlc/triage/discovery.test.ts:23 also asserts `expect(names).toHaveLength(11)` over the lifecycle skills filtered at :22. As a scheduled operation, retro is not excluded there, so that count becomes 12 unless retro is added to the exclusion list; the document names neither.
PROPOSAL: State that the lifecycle count at :23 moves to 12, or that retro joins the exclusion list.

FINDING: F-20
KIND: judgement
SEVERITY: nit
WHERE: Design, History ("per candidate its key, category, home, tier, status and a one-line summary")
EVIDENCE: `status` is a field of the versioned `retro-report` format, but its values are defined nowhere in the document (new, recurring, covered, fix that did not hold, or something else).
PROPOSAL: List the allowed `status` values in the format definition.

### R-3

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: AC-06 ("apart from the new report the run leaves the fixture repository, report directory, system temporary directory and trackers unchanged"); Test Plan row AC-06 ("compare `git status --porcelain` and file hash lists of ... the system temporary directory before and after (must differ only by the one report)"); Design, Effects and failure ("Each run first removes `vh-adlc-retro-*` temporary directories and `.retro-*.tmp` files older than one hour"); Owner summary ("The skill writes nothing else except its own temporary files")
EVIDENCE: The Claude Code host writes to the system temporary directory during every session, whatever a skill does. `find /tmp/claude-1000 -mmin -10` during this review listed entries the host wrote, such as `/tmp/claude-1000/bash-edit-diff/<id>/objects`, `refs` and `HEAD` (Git stores for bash edit diffs) and `/tmp/claude-1000/-home-m-code-stackweaver/<session id>/tasks` and `scratchpad`. `find /tmp -maxdepth 1 -mmin -10` also showed new files from other concurrent sessions. The report is never written to the temporary directory, so the row requires a byte-identical temporary directory, and any recorded Claude Code run fails it. The Design's own cleanup of stale `vh-adlc-retro-*` entries changes the directory as well whenever any exist. The proof therefore fails a correct implementation.
PROPOSAL: Limit the check to the entries the skill owns: after the run, no `vh-adlc-retro-<run id>` directory and no `.retro-*.tmp` file remains, and a seeded stale entry of each kind is gone. Say that host-owned temporary files are outside the comparison, and align AC-06's wording with that.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Analysis ("`~/.claude/CLAUDE.md` and the project's auto-memory index and the notes it links on Claude Code"); Design, Session and repository ("by session id"; "on Claude Code from `CLAUDE_CODE_SESSION_ID`"); Background ("Claude Code stores each session as `~/.claude/projects/<project>/<session-id>.jsonl`"); Scope ("fixture user-level files"); Fixture table row P9 and the paragraph below it ("The fixture memory note holds one planted secret"); AC-05; AC-06; AC-09; Test Plan rows AC-02, AC-03, AC-04, AC-05, AC-06 and AC-09
EVIDENCE: The repository's existing recorded-run harness isolates hosts by relocating their configuration. `plugins/vh-adlc/scripts/triage/controller-clients.ts:20` sets `env.CLAUDE_CONFIG_DIR=profile` for Claude Code and `:17` sets `env.CODEX_HOME=profile` for Codex. The Design honours `CODEX_HOME` but hard-codes `~/.claude` for the user-level instruction file, the auto-memory index and transcript lookup. Under that harness, a Claude Code run would read the owner's real `~/.claude/CLAUDE.md` instead of the fixture file P9 depends on, and would never read the fixture memory note that holds AC-06's secret. The Test Plan never says how the fixture user-level files are put in place on either host. The only other way is to edit the owner's real global files. The Design also does not say where a session named by id is looked up (which projects directory or sessions tree, under which configuration root).
PROPOSAL: Resolve Claude Code's user-level files and transcripts from `CLAUDE_CONFIG_DIR` when set (default `~/.claude`), as `CODEX_HOME` is resolved for Codex, and define the id-to-path lookup on each host. State in the Test Plan that each recorded run uses an isolated profile holding the fixture user-level files, as `controller-clients.ts` does.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Owner summary ("your user-level instruction and memory files"); Design, Analysis ("and `AGENTS.md` under `CODEX_HOME` (default `~/.codex`) on Codex CLI"); Terminology (Home, "the owner's user-level instruction or memory files"); AC-06 ("including a secret planted in a fixture memory note"); Test Plan row AC-06 ("the memory-note secret included"); Fixture table paragraph ("The fixture memory note holds one planted secret")
EVIDENCE: Codex CLI keeps user-level memory files: `ls ~/.codex/memories` lists `MEMORY.md` and `memory_summary.md`. Codex sessions load them: grepping the first 400,000 bytes of two recent rollouts for `memory_summary\|memories/MEMORY.md` gives 4 and 6 matches. On Codex the Design reads only `AGENTS.md`, so the Owner summary's claim that memory files are read is false there. The covered check and the size check cannot see Codex memories. AC-06's memory-note secret is never read in a Codex run, so that part of the proof passes vacuously on Codex.
PROPOSAL: Add the Codex memory files under `CODEX_HOME` to the user-level inputs, or exclude them by name in the Owner summary and Design with the reason. Then plant the AC-06 user-level secret in a file each host's run actually reads.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Extraction and redaction ("It stops at the turn that invoked the current retro run and skips each earlier retro run, from its invocation to its `save` command"; "including every file in the sibling `subagents/` and `tool-results/` directories"); Terminology (Session, "up to the turn that invoked the current retro run, without the turns of earlier retro runs (AC-08)"); AC-08; Test Plan row AC-08
EVIDENCE: The document does not say how the script recognises a retro invocation on either host: a Skill tool call, a slash command, intake routing or a read of `SKILL.md`. An earlier run interrupted before `save` has no end marker, so "from its invocation to its `save` command" either skips the rest of the transcript, including real work and the current run's boundary, or is undefined. The skipped turns' side files are still included. During this review, a 68.4 KB Bash output was saved as `.../45f9d85b-.../tool-results/b8syjstcy.txt`, with only a 2 KB preview left in the transcript. An earlier retro run's digest read lands in `tool-results/` the same way, and `extract` includes "every file" there. That brings back the self-evidence the cut-off exists to remove. The Terminology row cites AC-08, but neither AC-08 nor any Test Plan row tests the cut-off or the skip, so an implementation without them passes. The cut-off was added by the revision that answered R-2 F-16.
PROPOSAL: Define the invocation and end markers per host, the handling of an earlier run with no `save`, and that side files referenced only from skipped or later turns are excluded. Add `bun test` cases for each, with a fixture holding one completed and one interrupted earlier run.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Extraction and redaction ("when the digest would exceed 500,000 characters ... the digest never exceeds that size"); Design, Analysis ("The model reads the digest"); Terminology (Digest, "the bounded, redacted JSON ... the only form of the transcript the model reads"); AC-08; Test Plan row AC-08
EVIDENCE: The document does not say how the model reads a digest of up to 500,000 characters. In this review the host's Read tool stopped at a 25,000-token cap and returned lines 1 to 526 of a 625-line, 68.4 KB file. A 68.4 KB Bash output was replaced by a 2 KB preview and a side-file path. A 500,000-character digest needs many paged reads, and if it is written as one JSON value on one line, line-based paging cannot split it. AC-08 passes when the run completes and P4 appears, so an implementation whose model reads only part of the digest passes whenever P4 falls in the part it read.
PROPOSAL: Specify the digest's layout for reading, for example JSON Lines in ordered chunks below a stated per-read size, and require the skill to read every chunk. In the large fixture, place a planted problem's only evidence in the last chunk and make the checklist require it.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Severity and order ("medium for a mistake caught before commit, or waste repeated within the session; low for single waste, a no-op instruction or instruction size"); Fixture table rows P3 and P8; first-run and second-run order paragraph; AC-02; AC-07; Test Plan rows AC-02, AC-03, AC-04, AC-05 and AC-07
EVIDENCE: The base-severity rule does not decide two fixture rows. P3, "Twenty searches and reads before finding the settings file", is one detour; it can be read as single waste (low) or as waste repeated within the session (medium). The fixture expects medium. P8, "The agent guessed at a failure because the dev server log was not readable", can be read as a mistake caught before commit (medium) or as single waste (low). The fixture expects low. Under the low reading of P3, the first-run order becomes P1, P7, P9, P2, P3, P8, P4, P5 instead of the stated P1, P7, P3, P9, P2, P8, P4, P5. An implementation that follows one careful reading of the Design then fails AC-02, and the grader cannot derive the expected rows from the Design.
PROPOSAL: Define "waste repeated within the session" (for example, the same kind of call more than a stated number of times toward one goal) and give navigation and information-access candidates an explicit base severity when no mistake follows. Then check that P3 and P8 follow from those rules.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Design, Session and repository ("the current checkout is used if its `origin` remote matches the one the transcript records"; "The repository key is the `origin` remote's `owner/name`"); AC-11; Test Plan row AC-11
EVIDENCE: The claim that a transcript records the origin remote is not cited. Claude Code transcripts have no session-level remote field. Their top-level keys include `cwd`, `gitBranch`, `sessionId` and `version`, but no remote. The only remote found is inside `toolUseResult.bashEditDiff` of Bash commands that edit files, as `"origin":{"host":"github.com","remote":"<owner>/<name>",...}`, and it appears in 32 of the 60 most recent Claude transcripts (`grep -q '"origin":{"host"'`). Codex records the remote as a URL, `session_meta.payload.git.repository_url`. So on Claude Code the removed-worktree path, which the shared key exists for, often has nothing to compare. The two hosts record different forms, and the key rule does not say how a remote without exactly `owner/name` (a subgroup path, a local path) is keyed. AC-11 runs on a fixture transcript, so a field no real host writes passes.
PROPOSAL: Name the field each host records and cite it, say that a transcript without one makes the skill ask, and define how URL and `host` plus `owner/name` forms are normalised before matching and keying. Build the AC-11 fixtures from those real record shapes.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Extraction and redaction (`extract --transcript <file> --output <file>`); Design, Session and repository ("A transcript from the other host ends the run with that reason and no report"); Terminology (Session, "A transcript from the host running the skill"); AC-10; Test Plan row AC-10 ("`extract` ... on a file in the other host's format reports the reason")
EVIDENCE: Rejecting another host's transcript requires knowing the running host, but no command takes it and the Design names no signal for it. In this session's tool shell, `env` shows `CLAUDECODE` and `CLAUDE_CODE_SESSION_ID` set; Codex sets `CODEX_SESSION_ID` and `CODEX_THREAD_ID`. One implementer will sniff those, another will add a flag, and the AC-10 `bun test`, which runs with no host, needs one of them. The previous revision had `extract --transcript <file> --host <claude|codex>`, and this revision removed the flag (`git diff b34ba95 09de0c3`).
PROPOSAL: Name how the running host is decided (a `--host` flag the skill fills in, or a stated environment rule), and say how the AC-10 test sets it.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Extraction and redaction (shape list: "bearer tokens", "Slack tokens (`xox` prefixes)", "`sk-` API keys", "JSON Web Tokens"); AC-06 ("no string matching a listed secret shape"); Test Plan row AC-06 ("`grep` the digest and the saved report for ... the shape patterns (must find none)")
EVIDENCE: The recorded-run check judges free text with patterns the document never writes down. "`sk-` API keys" gives no length or word boundary, so a grader's `sk-[A-Za-z0-9]+` matches inside ordinary words such as `task-list`, `risk-free` or `disk-usage` in a correct report. A loose redactor's pattern would also destroy that evidence. "bearer tokens", "`xox` prefixes" and "JSON Web Tokens" are equally open. The `bun test` part lists some must-redact and must-survive examples, but the grep part of the row has none, as the standard requires for a free-text pattern proof. This row has not passed review (R-2 F-06 and F-07 named it).
PROPOSAL: Give each shape's exact pattern in one place, the Design or `references/retro.md` named as the source, and have both the redactor and the recorded-run grep use that list. Add must-survive examples such as `task-list` and `risk-free` to the row.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Effects and failure ("Each run first removes `vh-adlc-retro-*` temporary directories and `.retro-*.tmp` files older than one hour, left by interrupted runs"; "Concurrent runs get different report names"); Owner summary ("The skill writes nothing else except its own temporary files")
EVIDENCE: The cleanup deletes entries by name prefix and age in a shared directory, with no check that a retro run created them or that the run is dead. `/tmp` already holds `/tmp/vh-adlc-retro-R1.txt` and `/tmp/vh-adlc-retro-R2.txt` (regular files modified at 10:04 and 10:21 today, written by another session), so the prefix is not exclusive. A digest directory's modification time does not change when it is read. A live run older than one hour therefore loses its digest to a concurrent run, for example one extracting a 532,507,317-byte rollout and then analysing it. The concurrent-run statement does not cover this path. The Owner summary also omits that a run deletes other runs' leftovers.
PROPOSAL: Match only names in the exact run-id format, and decide staleness by a liveness record, such as a lock file with the owning process id, rather than age alone. Otherwise drop cross-run cleanup and state what is left behind. Mention the deletion in the Owner summary.

FINDING: F-11
KIND: judgement
SEVERITY: should-fix
WHERE: AC-09 ("with the session variable unset, it asks the owner and writes no report"); Test Plan row AC-09 ("A recorded run per host with that variable unset")
EVIDENCE: Both hosts set the session variable themselves in the shells they give the agent. In this session `env` shows `CLAUDE_CODE_SESSION_ID` set by the host, and R-2 F-01 observed Codex setting `CODEX_SESSION_ID` and `CODEX_THREAD_ID` the same way. The row names no way to start a real host session in which the skill sees the variable unset. The proof as written may not be executable, and an operator could improvise by having the agent run a step under `env -u`, which tests a different path than the skill's.
PROPOSAL: State how the variable is removed for the recorded run, or prove the unset path with a `bun test` on `locate` under an environment without the variable and keep the recorded run for the set path only.

FINDING: F-12
KIND: factual
SEVERITY: nit
WHERE: Background ("`docs/get-started/installation.md:107` counts the package's skills"); Scope ("the skill count in `docs/get-started/installation.md`")
EVIDENCE: `docs/get-started/installation.md:107` says "The package contains fifteen skills", and its list omits `vh-adlc-diagram`, while `ls plugins/vh-adlc/skills | wc -l` gives 16. Incrementing the stated count gives sixteen, not the seventeen the Scope sets for the tests.
PROPOSAL: State that the line becomes seventeen and names `vh-adlc-diagram` and `vh-adlc-retro`.

FINDING: F-13
KIND: judgement
SEVERITY: nit
WHERE: Fixture table row P5 ("beside an `.editorconfig` with `charset = utf-8`"); Terminology (No-op instruction, "restates what a configured tool or check already enforces"; Covering rule, "A configured check nothing runs is not a covering rule")
EVIDENCE: P1's lint configuration does not count because nothing runs it. P5 is justified by an `.editorconfig` that, in the fixture, nothing runs either. P5 still qualifies as a no-op because UTF-8 is the host default, but the fixture's stated reason rests on the enforcement clause that the covering-rule definition treats the other way.
PROPOSAL: Justify P5 by the host default, or add a hook or CI step that applies the `.editorconfig`.

FINDING: F-14
KIND: judgement
SEVERITY: nit
WHERE: Design, History ("The key is `<category>:<home class>:<kebab-case slug>`"; fields "category, home, home class")
EVIDENCE: The persisted `format: 1` block does not list the allowed tokens for category or home class. The category names in the Analysis table contain spaces and capitals ("Instruction size and no-ops"), and the home classes are prose ("Consumer repository", "User-level files"). The same report contract is read across versions and on rollback.
PROPOSAL: List the exact category and home-class tokens in the format definition in `references/retro.md`.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Background ("`git rev-parse --path-format=absolute --git-common-dir` returns the main checkout's `.git` directory from every worktree of a repository, so the folder that holds it names the repository the same way from all of them"); Design, Session and report folder ("where `<name>` is the name of the folder holding the directory `git rev-parse --path-format=absolute --git-common-dir` prints: the main checkout's folder, the same from every worktree"); Owner summary ("named after the repository's main folder so all its worktrees share it"); Design, History (block field "repository folder name"); AC-11; Test Plan row AC-11
EVIDENCE: The Background claim has no command output and is false outside the plain layout. In a scratch directory, a worktree of a bare clone printed `/tmp/rv-8xcm/bare.git`, so the folder holding it is `rv-8xcm` (the parent directory); a submodule printed `/tmp/rv-8xcm/super/.git/modules/sub`, so the name is `modules` for every submodule of every repository; `git init --separate-git-dir` printed the separate directory, whose parent is again an unrelated folder. Distinct repositories also share a basename on this host: `/home/m/code/homebrew-tap` (origin michielvha/homebrew-tap) and `/home/m/code/vhco-pro/homebrew-tap` (origin vhco-pro/homebrew-tap), and likewise `builders`. Each pair would share one report folder, so a problem from one repository becomes `recurring` or `fix-not-held` (high) in the other. The Owner summary does not mention this cost. This rule came in with this revision: the previous one used the absolute common-dir path when there was no origin (`git diff 09de0c3 fc1b665`). The AC-11 test uses a plain repository, so it passes on this behaviour.
PROPOSAL: Key the folder on a name that cannot collide without reading remotes or adding a setting, for example the main folder name plus a short hash of the absolute common directory, and define the bare and submodule cases. Or keep the bare name, state the collision in the Owner summary and raise it as an Open Question. Either way, add AC-11 cases for a bare-clone worktree and two same-named repositories.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Session and report folder ("on Claude Code from `CLAUDE_CODE_SESSION_ID`, on Codex CLI from `CODEX_SESSION_ID` or `CODEX_THREAD_ID`"; "The variable it found also tells it the running host, which it passes to the script as `--host claude` or `--host codex`"); Background (session variables bullet, "Both hosts set these themselves"); AC-09; AC-10; Test Plan rows AC-09 and AC-10
EVIDENCE: I started `codex exec -s read-only` from this Claude Code session in an empty temporary directory. Its shell had `CLAUDE_CODE_SESSION_ID`, `CLAUDECODE=1`, `CODEX_SESSION_ID` and `CODEX_THREAD_ID` all set. A nested session sees both hosts' variables, and loop settings explicitly support it through `command` routes that run an external CLI (`plugins/vh-adlc/references/loop-settings.md:13`). The Design sets no precedence. An implementation that checks the Claude variable first reviews the parent Claude session and passes `--host claude` while running on Codex, and the other-host check then rejects or misreads the transcript. The recorded-run harness passes only PATH, HOME, LANG, TERM and XDG_CACHE_HOME to the host (`plugins/vh-adlc/scripts/triage/controller-clients.ts:11`), so the AC-09 runs never see both variables and pass with either precedence.
PROPOSAL: Define how the running host is decided when both hosts' variables are present, for example from the plugin root the host loaded the skill from, and use only that host's variable. Add a `bun test` case for session selection with both sets present.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Extraction and redaction ("Boundaries" paragraph: "a Skill tool call naming `vh-adlc-retro` or a user message invoking `/vh-adlc-retro` on Claude Code, and at a command that reads `vh-adlc-retro/SKILL.md` on Codex CLI. It ends at its `save` command, or ... at the next user message"); Terminology (Session); Design, Knowledge and invocation (intake routing); AC-01; AC-12; Test Plan row AC-12
EVIDENCE: This revision added the markers in answer to R-3 F-04, and they still miss and over-match real records. (1) Intake rows tell the agent to "Use `skills/<op>/SKILL.md`" (`plugins/vh-adlc/references/lifecycle.md:55`). Claude Code transcripts on this host hold three Read tool calls of `skills/vh-adlc-*/SKILL.md` beside Skill calls named `vh-adlc:vh-adlc-*`. An intake-routed run on Claude Code, which AC-01 requires, therefore has no start marker, and its own turns enter the digest. (2) On Codex, any command that reads the file counts. A rollout from 2026-11-15 reads `.../vh-adlc-review/SKILL.md` with `sed -n '1,100p'` inside a batch of unrelated commands. In this repository, implementing or reviewing retro reads `plugins/vh-adlc/skills/vh-adlc-retro/SKILL.md` many times, and each read would open a run that ends at the next user message, so real work is dropped. (3) "User message" is undefined. Claude Code writes tool results and the loaded skill body (`isMeta: true`) as `type: "user"` entries, as seen right after the Skill call in transcript 1b459f39-4887-498b-86cb-227e4f1529a1. The owner's answer to the skill's own question (repository mismatch, AC-11) is a real user message inside the current run. Under the end rule it closes the current run as interrupted, so no current run is found. The AC-12 fixture is built from the stated markers and passes either way.
PROPOSAL: Define per host the records that start a run for every entry path, including intake and a read of the installed skill file under the plugin root rather than any copy. Define "user message" as a human-typed entry, excluding tool results and meta entries, and say that owner replies within a run do not end it. Add AC-12 cases for an intake-started run and a run containing an owner answer.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Session and report folder ("When the transcript's recorded working directory is not inside it, or no longer exists, the skill asks"; "`locate` ... prints that folder, or the ask outcome when the working directory is outside the repository or gone"); Owner summary ("If the session was in a different repository than the one retro runs in, retro asks"); AC-11; Test Plan row AC-11
EVIDENCE: A Claude Code transcript records `cwd` on every line, and the value changes during a session. `~/.claude/projects/-home-m-code-stackweaver/29303468-81f7-55d8-b068-a4fcab5d3893.jsonl` holds 50 distinct values: 5,477 lines in `/home/m/code/stackweaver`, 579 in `.claude/worktrees/one-launcher-p1`, 528 in `.claude/worktrees/runner-architecture`, and 4 values outside the repository (`/tmp` and scratchpad directories). The document does not say which value is "the" recorded working directory: the first, the last or any. "Inside it" is also undefined. A path check makes a live sibling worktree "outside" when retro runs from another worktree, although it is the same repository. Two implementers will ask in different cases, and a single-cwd AC-11 fixture cannot tell them apart.
PROPOSAL: Name the value used, for example the cwd of the last included turn. Define "inside the repository" as resolving to the same Git common directory when the path exists. Build the AC-11 fixture with several cwd values, including a sibling worktree and `/tmp`.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design, Session and report folder (reports under `${XDG_STATE_HOME:-$HOME/.local/state}/vh-adlc/retro/<name>/`); Design, Extraction and redaction (`extract ... --output <dir>`); Design, Report and save; Design, Effects and failure ("Each run works in `.work/<run id>/` inside the report folder"); Owner summary ("Its working files sit in a hidden folder beside the reports"); Scope (retro row in `docs/reference/compatibility.md`); AC-06; AC-08; Test Plan rows AC-02 to AC-09 (recorded runs per host)
EVIDENCE: `codex sandbox -c sandbox_mode=workspace-write -- sh -c "mkdir $HOME/.local/state/vh-adlc-review-probe-<pid>"` failed with "Read-only file system", while `mkdir` inside the workspace succeeded under the same mode. Codex's default sandbox therefore blocks `extract` and `save` on Linux. The plugin's other Codex trials ran in that default sandbox (`docs/reference/compatibility.md:119`, `:125`). The previous revision kept the digest in the system temporary directory, which the sandbox allows. This revision moved all working files into the report folder (`git diff 09de0c3 fc1b665`). The document says nothing about how a Codex run gets write access, or what happens when it is refused.
PROPOSAL: State how a Codex run gets write access to the report folder, either an approval prompt or a writable root, and what happens on refusal. Record it in the compatibility row, and run the Codex recorded runs in the default `workspace-write` mode.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Report and save ("The skill passes the report to `save --dir <dir> --report <file>`, which ... writes it to `.work/<run id>/report.tmp`"); Design, Effects and failure ("the folder is removed when the run ends"; "there is no other file write"); Design, Extraction and redaction (`--output <dir>`); Owner summary ("Those files are read directly, so the report is redacted again before it is shown"; "removed at the end"); AC-06; AC-10; Test Plan rows AC-06 and AC-10
EVIDENCE: The model's draft has to exist as a file before `save` reads it, and the document never says where. The draft is unredacted and can hold a secret from the user-level files the model reads directly; AC-06 plants one there. `save` takes no run id, yet it writes to `.work/<run id>/`. No command is named that creates the run id or work folder, or that removes the folder. The no-report endings (an unparseable or other-host transcript, AC-10, or the owner declining at the ask) do not say whether the work folder is removed. AC-06 compares only the fixture repository and the report folder, so a draft left in `/tmp` or in another directory passes. The previous revision had the same unplaced draft.
PROPOSAL: Place the draft in `.work/<run id>/` and name the command that creates the run id and work folder. Pass the run id to `save`, and name the step that removes the whole work folder on every ending. Extend the AC-06 and AC-10 checks to the draft and to the no-report endings.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan rows AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08 and AC-09; Fixture table paragraphs ("Each recorded run uses an isolated host profile"; "The seeded reports are"); AC-07 ("with no earlier report the run states it is a first run")
EVIDENCE: The Test Plan never says where a recorded run's report folder is, or that it starts empty. The existing harness sets HOME to the real home and passes no XDG_STATE_HOME (`plugins/vh-adlc/scripts/triage/controller-clients.ts:11`). Reports and seeded reports would therefore land in the owner's real `~/.local/state/vh-adlc/retro/<fixture folder>/`. Suppose the Claude Code and Codex first runs use fixture repositories with the same main folder name, or a folder left by an earlier attempt. The second host's "first run" then finds a report from another session id that raises every planted problem. P1 to P9 turn `recurring` or `fix-not-held`, and AC-02's order and severities fail a correct implementation. AC-07's first-run statement depends on the same state.
PROPOSAL: Give each recorded run a fresh XDG_STATE_HOME, seeded only with the stated reports for the second run, and say so in the Test Plan and the fixture paragraph.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Extraction and redaction ("each at most 20,000 characters, which the skill reads in full and in order"; "the digest never exceeds that size"); Design, Analysis (input list: instruction files, build files, CI workflows, lessons file, user-level instruction and memory files); Owner summary ("reduces it to a bounded digest"); AC-08; Test Plan row AC-08
EVIDENCE: Only the digest is bounded. For one consumer on this host, the other required reads measured: `docs/internal/tasks/lessons.md` 236,727 bytes, 71 Claude Code memory notes 167,937 bytes, `CLAUDE.md` 46,569, `.github/workflows` 106,513 and `agents/loop-project.md` 25,905. With a 500,000-character digest that is about 1.08 million characters for one run, which a session cannot hold without compaction or partial reads. The document gives no total budget and no order or limit for the file reads. AC-08 puts P4 only in the last chunk, the part most likely to survive compaction. An implementation that loses the early chunks or the large files still passes.
PROPOSAL: Set a total reading budget for the digest plus files, or an order and size limit for the file reads, and say what is dropped first. Plant a second problem in the large fixture's first chunk, and give that fixture lessons and memory files of realistic size.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Fixture table row P9 (Home class "User-level files"); AC-03; AC-05; Design, Analysis ("A mechanical violation is always proposed as a deterministic check, never as a prose or review rule: in the pre-commit hook when the mistake reached a commit, otherwise in the earliest guardrail that already exists, adding a pre-commit hook where none does"); Terminology (Mechanical violation; Home); Test Plan row AC-02, AC-03, AC-04, AC-05 (checklist home class item)
EVIDENCE: P9 is a commit message containing a forbidden character. That is a fixed shape a tool can detect, so it is a mechanical violation under the Terminology. The Design then requires a deterministic check in the earliest existing guardrail, adding a pre-commit hook where none exists. The fixture repository has none, so the expected home class would be repository, but the fixture table expects user-level files. A pre-commit hook also runs before the commit message exists, so it cannot check one; that takes a commit-msg hook. P2 (editing a generated file, a file-location rule) is mechanical too, and the table states no expected change for it. Two careful implementers will give P9 different homes, and AC-03 passes only one of them.
PROPOSAL: State whether a covered mechanical violation still gets a check, and where the check for a user-level rule lives. Make P9's expected home and change follow from that, and say "commit-msg hook" for message checks.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Extraction and redaction ("the value assigned to any key whose name contains ..."; "`Authorization` ... header values; `Bearer` tokens"; "Each match becomes `<REDACTED>`"); AC-06 ("no string matching a pattern in `references/retro.md`"); Test Plan row AC-06 ("search the digest and the saved report with the patterns from `references/retro.md` ... (must find none)")
EVIDENCE: The key rule replaces only the value, so a correct digest contains `DB_PASSWORD=<REDACTED>` and `Authorization: <REDACTED>`. `<REDACTED>` is itself a value assigned to such a key, so the patterns as described match correct output. The "must find none" search then fails a correct implementation unless the patterns exclude the marker, and the document does not say they do. The same question decides whether `save` is idempotent, since it re-redacts a report that already quotes redacted digest lines. This row has not passed review (R-3 F-09 named it), so this is not the free-text widening nit case.
PROPOSAL: State that no pattern treats the `<REDACTED>` marker as a secret value, and add `DB_PASSWORD=<REDACTED>` and `Bearer <REDACTED>` to the row's must-survive examples.

FINDING: F-11
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Report and save (`save` "redacts it with the same rules, writes it ... links it"); Design, History ("A report whose `format` is newer than the version understands, or whose block does not parse, is skipped and listed by name"); AC-07; Test Plan row AC-07
EVIDENCE: The `retro-report` block is YAML the model writes, and `save` only redacts and links it. A summary with an unquoted ": ", a category or home-class token outside the listed set, or a missing field still gets saved. The next run then skips that report, and its recurrence history is lost. No proof checks that a report `save` writes can be read by `history`. The tests cover only skipping seeded malformed blocks.
PROPOSAL: Have `save` parse the block after redaction and refuse with a reason unless it is a valid `format: 1` block with the listed tokens, so the skill corrects its draft. Add a `bun test` that `save` refuses a block `history` would skip.

FINDING: F-12
KIND: judgement
SEVERITY: nit
WHERE: Design, Effects and failure ("each report lists any leftover work folders so the owner can delete them"; "Concurrent runs use different run ids"); Owner summary ("a killed run leaves them there, and the next report lists them for you to delete")
EVIDENCE: When a report is saved, the run's own `.work/<run id>/` still exists, because `save` writes `report.tmp` there, and a concurrent run's folder is live. Both fit "leftover work folders", so the report invites the owner to delete a running run's digest.
PROPOSAL: List only other runs' folders, and note that they may belong to a run still in progress.

FINDING: F-13
KIND: factual
SEVERITY: nit
WHERE: Scope ("the skill count in `docs/get-started/installation.md` (seventeen, ...)"; "entries in ... `docs/user-guides/workflows.md`"); Background ("Both discovery tests assert sixteen skills")
EVIDENCE: `docs/user-guides/workflows.md:15` also states "The package has fifteen skills: this entry, eleven engineering operations, two content operations and one host-cleanup operation". `tests/vh-adlc/triage/discovery.test.ts:50` and `:52` assert the text "fifteen skills" and "eleven engineering operations" in workflows.md and installation.md. The Scope names neither the workflows.md count nor these text assertions.
PROPOSAL: Add the workflows.md count line and the two text assertions to the Scope.

FINDING: F-14
KIND: judgement
SEVERITY: nit
WHERE: Design, Extraction and redaction ("it includes a file from `subagents/` or `tool-results/` only when an included turn references it"); Terminology (Session)
EVIDENCE: The main transcript `0443e578-6437-5521-b63e-27f043a5ac80.jsonl` refers to its subagents only as `agentId: a6d6fbd72502c1fd7`, never by the file name `subagents/agent-a6d6fbd72502c1fd7.jsonl`. Tool-results files are named by path. "References" is not defined for subagents.
PROPOSAL: Say that an `agentId` in an included turn references `subagents/agent-<id>.jsonl`.

### R-5

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Session and report folder ("An absent folder is a first run"); Design, Report and save ("`save` creates the folder if needed, writes the report to `.<random>.tmp` in it, links that file"); Design, Effects and failure; Owner summary ("Reports are saved, redacted, in a per-user folder"); AC-06; Test Plan row AC-06
EVIDENCE: Redaction is pattern-based, so a secret of a shape the list does not name stays in the saved report. Examples are a Google `AIza...` key, an `npm_...` token or a bare hex API key that has no key name. The document gives no mode for the folder or the report files. With a 022 umask, a folder `save` creates under `$HOME/.local/state/vh-adlc/retro/` and its reports are readable by other local accounts wherever the home directory is traversable. The product profile puts the user's credentials at stake. The plugin's own scripts already use owner-only modes for saved artifacts: `writeFileSync(..., { flag: "wx", mode: 0o600 })` at `plugins/vh-adlc/scripts/triage/cli.ts:50` and `mkdirSync(output,{recursive:true,mode:0o700})` at `plugins/vh-adlc/scripts/triage/controller-recovery.ts:18`. AC-06 checks only the patterns and the planted secrets, so it passes a world-readable report.
PROPOSAL: Have `save` create the report folders with mode 0700 and write the temporary file with mode 0600, created exclusively, before linking it. Add the modes to the AC-06 `bun test` row.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Session and report folder ("notes the file name each earlier run's `save` printed"); Design, History ("The skill passes the file names of reports saved earlier in this conversation as `--exclude`"); Terminology (Recurring candidate, "where that report was not saved earlier in this conversation"); Scope, Out of scope ("anything compaction removed from the context"); AC-07
EVIDENCE: The only thing that ties an earlier same-conversation report to this session is the file name `save` printed, and the design relies on it staying in the model's context. Here is a plausible sequence in the long sessions the Background names as the harm: retro runs and saves, work goes on, compaction summarises the earlier turns, and retro runs again. Now the file name may be gone while the summary still describes the same mistakes. The earlier report is then not excluded, so every candidate it raised becomes `recurring` and moves up a level, or becomes `fix-not-held` and high, even though nothing recurred. The Out of scope line excludes reviewing what compaction removed. It does not state this consequence, which inflates severities, and the Owner summary does not mention it. The AC-07 variant keeps the earlier run's `save` output intact, so it cannot show the case.
PROPOSAL: Either add a Scope line `Not handled: an earlier retro report from this conversation whose file name compaction removed counts as history, ...` and mention it in the Owner summary, or have the skill ask the owner which reports to exclude when its context shows a compaction summary that mentions an earlier retro run but no saved file name.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Scope (last bullet, "fixture conversations resumable on Claude Code and on Codex"); Fixture table paragraphs ("Each recorded run resumes a fixture conversation in an isolated host profile"); Fixture table row P4 ("printing a multi-megabyte result"); Test Plan rows AC-02, AC-03, AC-04, AC-05 and AC-07
EVIDENCE: The document never says how the fixture conversations are produced. They could be hand-written transcripts in each host's format, or recorded once by scripted live sessions and then copied into the isolated profile. It also does not say how a resume finds them. Claude Code files sessions under `<config>/projects/<encoded working directory>/` (for example this host's `~/.claude/projects/-Users-michielvh-code-vh-adlc/`), and Codex keeps rollouts under `CODEX_HOME/sessions/`. The harness creates a fresh profile (`plugins/vh-adlc/scripts/triage/controller-clients.ts:5-6`, `:18`, `:20`), and the fixture repository's path changes on every run, so each transcript has to be placed and rewritten for that path. P4 plants a multi-megabyte tool result. The hosts truncate large tool output before it reaches the model's context, so a fixture that stores the full output either cannot be resumed or gets compacted. A fixture that stores the truncated form has to show the size in the way the host would. Two careful implementers would build fixtures that behave differently, and only one would let the AC-02 and AC-07 runs execute as the document intends.
PROPOSAL: Say how each host's fixture conversation is made and installed: its source format, where it goes in the isolated profile, and how the fixture repository path is substituted. State that P4's output appears in the fixture exactly as the host records an oversized result, with its size visible.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Background (package checker bullet, "Both discovery tests assert nineteen skills"); Scope (Registration, "both discovery tests at twenty skills")
EVIDENCE: Only `tests/vh-adlc/triage/discovery.test.ts:13` asserts a count (`toHaveLength(19)`). `tests/vh-adlc/maintenance/discovery.test.ts:12` asserts only `toContain("vh-adlc-maintenance")`, and `grep -n '19\|nineteen' tests/vh-adlc/maintenance/discovery.test.ts` finds no count. The claim was carried over from earlier revisions (R-1 F-09 cited a `toHaveLength(16)` there).
PROPOSAL: Say that the triage discovery test asserts the skill count, and drop the maintenance test from the count change, or keep it in covers only for a reason that is stated.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context, Owner summary ("Four of its findings were about transcript parsing and no longer apply now that parsing is out")
EVIDENCE: At least five R-4 findings concern transcript reading and no longer apply: F-02 (session variables), F-03 (run boundaries in transcript records), F-04 (transcript cwd values), F-08 (digest budget) and F-14 (subagent references). F-06 and F-12 were about the `.work/` folder, which this revision also removed.
PROPOSAL: Correct the count, or list which R-4 findings were dropped and which were applied.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design, Analysis ("the always-loaded user-level instruction and memory index files in full. They are ... `<CODEX_HOME>/AGENTS.md` and `<CODEX_HOME>/memories/` on Codex CLI")
EVIDENCE: `<CODEX_HOME>/memories/` is a directory, not an index file. On this host, `ls ~/.codex/memories` shows `MEMORY.md`, `memory_summary.md` and `extensions`. "Read in full" does not say whether that means one index file, every file in the directory, or the directory tree.
PROPOSAL: Name the Codex memory file or files that are read in full, and treat the rest like Claude Code's linked memory notes, which are searched by subject.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary (report folder paragraph); Scope ("Not handled: a moved or renamed main checkout starts a new report folder")
EVIDENCE: The Owner summary describes the folder as "one folder per repository, shared by all its worktrees". It does not say that moving or renaming the main checkout starts a fresh folder, which loses the recurrence history the Background gives as one of the two reasons for the machinery.
PROPOSAL: Add one sentence to the Owner summary stating the moved-checkout limit.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Context, Background (resume bullet, "Claude Code keeps a session as `<config>/projects/<working directory with / and . as ->/<id>.jsonl`"); Acceptance Criteria, Fixture table paragraph ("writes the result where the host looks for it: under `<CLAUDE_CONFIG_DIR>/projects/<encoded path>/`"); Test Plan rows AC-02, AC-03, AC-04, AC-05 and AC-07 (recorded runs on Claude Code)
EVIDENCE: This revision added the encoding rule, and it is false for the directory the install script will most likely copy the fixture into. On this Mac, `echo $TMPDIR` prints `/var/folders/sm/8hfqw9_97pgfmhlfs2t7k66c0000gn/T/` and `realpath $TMPDIR` prints `/private/var/folders/sm/8hfqw9_97pgfmhlfs2t7k66c0000gn/T`. `ls ~/.claude/projects` shows sessions started there filed as `-private-var-folders-sm-8hfqw9-97pgfmhlfs2t7k66c0000gn-T-tmp-b4oI9g8ZQO-work`. Claude Code encodes the resolved real path, so `/var` becomes `/private/var`, and it turns the underscore into `-` as well, not only `/` and `.`. An install script that follows the stated rule writes the template to `-var-folders-sm-8hfqw9_97pgfmhlfs2t7k66c0000gn-T-...`. `claude --print --resume <id>` then cannot find the session, so the Claude Code recorded runs that prove AC-02 to AC-05 and AC-07 cannot run as written.
PROPOSAL: State the encoding as observed: take the real path of the working directory and replace every character that is not an ASCII letter or digit with `-`. Have the install script compute the folder from the real path of the fresh fixture copy, and cite the `ls ~/.claude/projects` output.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Scope ("Not handled: when compaction has removed the file name ... each such candidate names the earlier report, so the owner can see where it came from (R-5 F-02)"); Design, History (`recurs` holds "earlier keys, possibly empty"; "it records that key under `recurs` and adopts its slug"); Design, Report and save ("Per candidate the report gives ... its history"); AC-07 ("citing the seeded report"); Test Plan row AC-07 ("`recurs` citing the seeded key"); Context, Owner summary (compaction sentence)
EVIDENCE: This revision added the stated limit, and its mitigation rests on each recurring candidate naming the earlier report. Nothing in the Design makes that happen. `recurs` holds keys of the form `<category>:<home class>:<slug>`, and because the new candidate adopts the earlier slug, the key is identical in every report that raised the problem, so it identifies no report. The Design does not say whether `history` returns the source file name with each candidate, and the report's "its history" is not defined. The AC-07 checklist item checks only "`recurs` citing the seeded key". An implementation that shows only the key passes every proof, and then the owner has no way to spot a false recurrence that compaction caused, which is the safeguard the limit promises.
PROPOSAL: Have `history` return each candidate with the file name of its report, and have the report name that file for every `recurring` or `fix-not-held` candidate. Add "names the seeded report's file" to the AC-07 checklist item.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria, Fixture table paragraphs ("The fixture repository has a lint configuration ... and a project procedure file"; "the install script copies the fixture repository to a fresh directory"); Fixture table rows P1, P2 and P7; Scope (last bullet, "a fixture repository ... with the script that installs them"); Test Plan row AC-06 ("compare `git status --porcelain` ... of the fixture repository")
EVIDENCE: A fixture repository kept under `tests/vh-adlc/retro/` cannot carry its own committed `.git`, and a plain copy is not a Git repository. Yet `folder --repo` runs `git rev-parse --git-common-dir` (Design, Session and report folder), the AC-06 check runs `git status --porcelain`, and the skill "reads every file it cites, to give the line" (Design, Analysis). The document never says that the install script makes the copy a Git repository, or that its files and history match what the conversation claims. That means the committed banned call (P1), the committed duplicate helper (P7) and the generated file P2 edits, left unedited because the edit was caught. One implementer gives the copy a single commit holding none of that, and another reproduces the conversation's commits. The skill then cites lines that do not exist, or sees a history that contradicts the transcript, and the AC-02 and AC-05 grading can differ between the two.
PROPOSAL: State that the install script initialises the copy as a Git repository whose working tree and commits match the planted conversation: P1's call and P7's duplicate committed at known lines, P2's generated file present and unedited. Add the fixture repository's expected files to the fixture paragraph.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Context, Owner summary ("that report counts as history, and its candidates can show as recurring"); Scope (second Not handled line, "can show as recurring or as fixes that did not hold")
EVIDENCE: The summary sentence was added in this revision for R-5 F-02. It leaves out what the Scope line states: such candidates can also become fixes that did not hold, which Design, Severity and order always rates high.
PROPOSAL: Change the summary to "can show as recurring, or as fixes that did not hold and rated high".

### R-7

NO FINDINGS

## Sources

- [mattpocock/skills `retro/SKILL.md` at `5863806`](https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/retro/SKILL.md): the seven improvement categories (merged here into six by combining entry-point size with no-ops), the rule that mechanical violations become deterministic checks, and that review carries coding standards because the reviewer has the least context pressure.
- [mattpocock/skills `diagnosing-bugs/SKILL.md` at `5863806`](https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/diagnosing-bugs/SKILL.md): the redaction practice adopted for quoted transcript evidence.
