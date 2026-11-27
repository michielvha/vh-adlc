[Documentation](../README.md) / vh-adlc vs BMAD-METHOD

# vh-adlc vs BMAD-METHOD

`vh-adlc` and [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) both structure how coding agents move from a requirement to working software. They differ in what they optimize for.

BMAD-METHOD models a software team through role-based agent personas, modular skills, and sharded planning documents. It is built for broad adoption across many editors and chat tools, with dedicated steps for brainstorming and product discovery.

`vh-adlc` treats agent work as an engineering control plane. A single feature document holds the specification, task list, and review history, while a checksum-verified Go binary checks formatting, review freshness, and status gates against Git history. It also covers ongoing repository operations beyond feature delivery.

## At a glance

| Area | BMAD-METHOD (v6 / v7 preview) | vh-adlc |
| --- | --- | --- |
| Core model | Simulated agile team with specialized personas (PM, Architect, Scrum Master, Dev, QA) and 50+ workflows | Operation-based engineering lifecycle with explicit authority rules and deterministic gates |
| Gate enforcement | Prompt and skill instructions with step files and sharded documents | Go binary commands (`lint`, `fresh`, `gate`, `review check`) that fail closed against Git commits |
| Authority and safety | Relies mainly on host permission prompts and human review | Explicit permission boundaries for drafting, pushing, shipping, and merging, plus writer reservations and worktree isolation |
| Specification format | Sharded files for PRDs, architecture notes, epics, and stories under `_bmad/` | One feature document in Git containing requirements, tasks, decisions, and verbatim reviews |
| Code and spec review | Adversarial review skills and a QA/Test Architect persona | Independent reviewer dispatched at an exact commit, stored verbatim, and checked for freshness against Git |
| Day-2 repository work | Focused on the feature build loop, with optional domain modules (such as QA, Game Dev, and Creative) | Built-in operations for persistent code audits, docs drift, docs impact, factual doc checks, dependency sweeps, backlog triage, and host cleanup |
| Early product discovery | Dedicated Clarify phase, analyst and PM personas, and multi-agent ideation | Lean entry; starts from a problem to investigate or a feature to specify |
| Host portability | Wide support across Cursor, Claude Code, Codex, Copilot, and web chat bundles via `npx` | Tested primarily on Codex, Claude Code, and VS Code Local chat; see [Compatibility](../reference/compatibility.md) |
| Primary trade-off | Workflow bloat and potential LLM drift in adaptive mode | Higher procedural rigor and narrower tested host matrix |

## How they enforce quality

BMAD-METHOD relies on structured prompts, step files, and sharded Markdown documents to keep an agent on track. In v6, it moved from rigid YAML templates to a scale-adaptive conversation model that skips heavy planning on small edits. That makes it faster to use, though an agent can still omit technical details or make quiet assumptions unless a human catches them.

`vh-adlc` separates prose guidance from state transitions. The agent writes documents and code, while the `vh-adlc` binary decides whether a feature document is well formed (`lint`), whether its independent reviews still match the branch commits (`fresh`), and whether a status change is allowed (`gate`). Because reviews bind to exact commit hashes, rewriting a reviewed commit invalidates the review and blocks completion. See the [CLI reference](../reference/cli.md) for the exact checks and exit codes.

## Safety and repository authority

BMAD-METHOD leaves most side-effect control to the host editor and the developer watching the session. That works well in a single local sandbox, especially on greenfield code.

`vh-adlc` defines an explicit authority model across sessions and repositories. Asking an agent to investigate or draft a spec grants no permission to write code, push a branch, open a pull request, or merge. Features can use single-writer reservations and isolated worktrees so concurrent sessions do not overwrite each other's work, and every commit operation stages named paths instead of sweeping unrelated changes from the index.

## Feature work versus ongoing repository maintenance

BMAD-METHOD centers on turning ideas into shipped features through a Clarify, Plan, Build, and Verify loop. Its module ecosystem extends that pattern into adjacent creative and testing workflows.

`vh-adlc` treats feature delivery as one part of repository stewardship. Alongside specs and implementation, it includes procedures for [workflows](../user-guides/workflows.md) that mature repositories run every week:

- Bounded maintenance for regressions and routine updates that preserve the existing public contract without requiring a full feature spec.
- Persistent codebase audits with a finding ledger, reverification, and scoped repair batches.
- Documentation impact checks for code changes, whole-corpus documentation drift audits, and claim-by-claim factual verification.
- Dependency and security maintenance sweeps, backlog triage against observed evidence, and host cleanup for leftover `/tmp` and container state.

## Where BMAD-METHOD is a better fit

BMAD-METHOD is a stronger choice when you are starting from a vague product concept and want structured brainstorming, user personas, and PRD exploration before writing a tight technical specification.

It is also easier to drop into an external team or client repository. Because it installs with `npx` and ships skills and web bundles for Cursor, Copilot, Claude Code, Codex, and browser-based chats, developers can adopt it without installing a compiled binary or configuring external convention pins.

## Where vh-adlc is a better fit

`vh-adlc` is a stronger choice when you maintain production repositories and want deterministic proof that checks, tests, and independent reviews actually ran on the exact commit you are about to ship.

It also fits teams and solo engineers who want to avoid Scrum ceremony on every change. Keeping a feature's spec, tasks, and review log in one Markdown file, pairing it with bounded maintenance for small fixes, and requiring a harm check before adding new machinery keeps overhead proportional to the risk of the change.

## Choosing between them

Use BMAD-METHOD if your main bottleneck is zero-to-one product framing, or if you need a community-maintained prompt framework that works immediately across a mixed set of IDEs and web chat tools.

Use `vh-adlc` if your main bottleneck is trusting coding agents in real repositories: keeping specs and code aligned, preventing premature pushes or self-approved reviews, and handling audits, documentation drift, and dependency maintenance alongside new features.
