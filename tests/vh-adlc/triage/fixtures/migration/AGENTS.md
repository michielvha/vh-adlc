<!-- Copyright (c) 2025 VH & Co BV. Licensed under the Business Source License 1.1. See LICENSE for details. -->

# Repository instructions

Read [CLAUDE.md](CLAUDE.md) in full before starting repository work. It is the
authoritative source for project rules, development commands, worktree isolation,
verification, documentation, and shipping. Follow those rules regardless of which
agent harness is running.

## Shared workflows

Keep the existing [agents/](agents/) directory as the source of workflow
instructions, except backlog triage, which forwards through `agents/issue-triage.md`
to the installed shared `vh-adlc-triage` operation with `.vh-adlc/triage.json`.
Before acting, read the workflow matching the user's request and
follow its referenced documents. Preserve its gates, stop conditions, acceptance
criteria, evidence requirements, and verification steps.

The spec-driven loop is `agents/spec.md` (authoring and review), `agents/tasks.md`,
`agents/implement.md`, then `agents/ship.md`. Use the other files in `agents/` for
their corresponding investigation, review, triage, audit, maintenance, and
documentation tasks. Apply the relevant workflow when the user names it in plain
language as well as when they use a slash command.

The existing [.claude/commands/](.claude/commands/) files define command routing
and additional invocation instructions. Read the matching command file when
resolving a command such as `/spec review`, `/triage`, or `/audit`. Treat
`$ARGUMENTS` as the user's supplied arguments.

## Harness compatibility

Use equivalent available tools for harness-specific actions, such as Git
worktrees in place of `EnterWorktree`. Model names and command frontmatter apply
to the harness that supports them; preserve the workflow's intent when running
elsewhere. If a required capability is unavailable, report the blocked step
explicitly instead of silently skipping it or claiming completion.

Read the applicable vendored skills under [.claude/skills/](.claude/skills/) as
direct instructions even when the harness does not discover that directory:
`go/SKILL.md` for Go work, `go-spec-reviewer/SKILL.md` for Go-facing spec reviews,
and `go-release/SKILL.md` for published Go module release work, as directed by
`CLAUDE.md`.

Keep shared rules and workflows in their existing files. This file is an entry
point, not a second copy of the project rules. Do not assume another harness's
hooks, permissions, or integrations are active merely because their configuration
exists in the checkout.
