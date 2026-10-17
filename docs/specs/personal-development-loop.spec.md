---
status: draft
status_description: "Revision D-28 in progress: the loop edits all reader-facing prose with the pinned humanize prose guide, and the plugin pin moves to e4d58d2. Accepted earlier against R-19 at d5d1ab0."
issue: null
goal: "A personal development-loop plugin, backed by a deterministic binary, that carries the owner's spec-driven way of working into every repository in Claude Code and VS Code Copilot Chat, and reads engineering knowledge from vhco-pro/docs instead of embedding it."
covers:
  - plugins/vh-adlc/
  - .claude-plugin/marketplace.json
  - README.md
  - AGENTS.md
  - CLAUDE.md
  - .github/copilot-instructions.md
  - cmd/
  - internal/
  - go.mod
  - go.sum
  - .goreleaser.yml
  - gitversion.yml
  - .github/workflows/
  - tests/vh-adlc/
  - release-signing-key.asc
---

# Plan: Personal development loop (`vh-adlc`)

A plugin in the `vhco-tools` marketplace that runs one loop: investigate, specify, decompose, implement,
review independently, ship and resume. The plugin carries procedure only. A deterministic Go binary,
`vh-adlc`, makes every mechanical decision. Engineering knowledge comes from `vhco-pro/docs` at a pinned
revision, and every durable record lives in the repository being worked on.

## Context

The owner already works this way in one product repository, where the loop lives in that repository's
own agents and commands and works nowhere else. Every other personal repository gets none of it: no gated
spec, no resumable task list, no independent review, no deliberate shipping.

The owner keeps shared engineering knowledge in [`vhco-pro/docs`](https://github.com/vhco-pro/docs).
Its [decision 0001](https://github.com/vhco-pro/docs/blob/8b14a69cdf3489b37f40c0cb2e406771feff1b66/decisions/0001-central-conventions-with-local-agent-entry-points.md)
chose one central knowledge home, explicit per-repository pins and no knowledge mapper, with consumers
opting in. The owner has since decided that every one of their repositories follows those conventions,
opted in or not (D-09). This plugin is the first agent tooling to consume the docs, so phase 1 updates
the docs to match that decision before anything depends on it.

### What the loop keeps

| Step | What the loop keeps from the existing workflow |
| --- | --- |
| Specify | Prior-art search, every claim grounded in a citation gathered in the run, Open Questions written for a human and put to the owner with a question tool, repeatable review passes with a Review Log, `draft` to `planned` only when earned, specs committed to the default branch |
| Decompose | One-commit tasks naming a file and a test-shaped done condition, criterion references, dependency order, re-runs preserve checked tasks |
| Implement | The full gate before touching code, flip to `in-progress` first, failing test first, tick criteria with evidence, never edit criteria to fit, PARTIAL over a false COMPLETE |
| Review | Claim extraction and verification against the tree, blind-spot lenses |
| Ship | Doc-impact check first, verify, stage only this change, one issue per plan, deliberate `Closes` versus `Refs`, report what was and was not verified |
| Investigate | Measure, do not remember; findings go into documents, issues link to them |
| Document | One document is both spec and plan, with Acceptance Criteria, Test Plan, Tasks, Open Questions, Review Log and Sources; "state the end state, never a measurement of the problem" |

Repository-specific rules of that workflow (its commands, environments and local checks) stay where they
are. Two mechanisms come from the owner's earlier tooling: the four review verdicts (`met`, `not met`,
`untested`, `not verified`) and a deterministic next-action resolver (see
[Deterministic core](#deterministic-core-the-vh-adlc-binary)). Implementing this spec needs nothing beyond
this document and the pinned docs.

## Owner decisions

Decided by the owner on 2026-10-17. They are inputs, not open for re-litigation during implementation.

| ID | Decision |
| --- | --- |
| D-01 | Personal loop only. No enterprise knowledge, maps, catalogues or conventions in any deliverable. |
| D-02 | Base the loop on the owner's existing spec-driven workflow. |
| D-03 | GitHub issues track work; substantial reasoning lives in documents in the consuming repository. |
| D-04 | Keep spec-driven development, and let the plugin host further personal agents later. |
| D-05 | Ship the plugin in the existing `vhco-tools` marketplace. D-22 moves that marketplace's repository to `michielvha/vh-adlc`. |
| D-06 | v1 hosts are Claude Code (desktop app, VS Code extension, CLI, remote sessions) and stock VS Code Copilot Chat. Copilot CLI is an automated test surface because it runs headless and shares its engine with VS Code's Copilot harness. There is no separate SDK host. |
| D-07 | Scoped autonomy: an accepted feature permits local edits, tests and commits; an explicit ship request permits push, PR and updating the linked issue; merge, release, destructive and live actions each need their own approval. D-20 adds pushing docs-only feature-document commits to the default branch. |
| D-08 | One native Claude-format package. No adapters, generated mirrors or build step unless a demonstrated incompatibility forces one. |
| D-09 | Engineering knowledge is read from `vhco-pro/docs`, never embedded. Every owner repository follows it, opted in or not: the repository's pin if it has one, otherwise the plugin's pin, and the loop adds the repository pin with its first change there. Never `main`. |
| D-10 | The feature-document convention (sections, frontmatter, statuses, criterion, task, evidence and Review Log formats) is a `vhco-pro/docs` convention. The plugin reads it; it does not own it. |
| D-11 | Acceptance follows the existing workflow: Open Questions are empty because the owner answered them, an independent review pass logged against a commit found nothing blocking, and the owner accepted in session. |
| D-12 | Statuses are the existing workflow's nine: `draft`, `planned`, `in-progress`, `complete`, `blocked`, `parked`, `abandoned`, `superseded`, `archived`. |
| D-13 | Proof is a deterministic checker plus scripted scenarios on a disposable fixture. A host is claimed only with one recorded pass per scenario; a host without one is listed as unsupported. Claude Code and VS Code Local must pass for v1. |
| D-14 | Models are chosen at dispatch, never in agent frontmatter. On Claude Code, independent passes default to `fable` and fall back to `opus`; any named model is used as given. |
| D-15 | The project is named `vh-adlc` (agentic development life cycle, with the owner's prefix): the repository, plugin, binary and the `vh-adlc-*` operations. "dlc" alone reads as downloadable content, and plain `adlc` is crowded (public Claude Code ADLC skill packs and an npm `adlc` CLI), so the prefix keeps every name collision-proof. |
| D-16 | Every mechanical judgement is made by a deterministic Go binary, `vh-adlc`, the successor of an earlier deterministic resolver, in `michielvha/vh-adlc` (D-22), adapted from `michielvha/template-go-app` under the Go conventions. |
| D-17 | The machine-checked rules live in one fenced YAML block inside the `vhco-pro/docs` feature-document standard. The binary reads that block at the resolved pin and hardcodes none of them. |
| D-18 | A repository pinning a docs revision that lacks a page the loop needs stops the operation and recommends a pin bump. No mixed reads. |
| D-19 | Docs unreachable means stop and report, as the docs `AGENTS.md` requires. |
| D-20 | Feature documents are committed and pushed to the default branch until implementation starts; code is built on a feature branch. While the document has no `branch` field, invoking `spec` or `tasks`, and `implement`'s claim commit, carry that docs-only push; once it has a `branch`, its commits stay on the feature branch and are pushed only on ship. |
| D-21 | `michielvha/vh-adlc` is public, so the marketplace and the release assets install without a credential, and v1 ships all seven commands. |
| D-22 | One repository for everything: the public `michielvha/vh-adlc`, the successor of `michielvha/claude-plugins`, recreated on 2026-10-17 with a single-commit history at the owner's request. It holds the `vhco-tools` marketplace, every plugin in it (`vh-adlc` and `github-app-registration`), the binary and this spec. |
| D-23 | Docs-only feature-document deliveries, including the claim and first-run Markdown onboarding files, use the delivery convention's skip-CI marker. The commit, outgoing push range and feature PR diff must all be documentation-only; a docs-only final commit must not suppress CI for code, tests, workflows or other non-documentation changes shipped with it. |
| D-24 | Bun is the default for JavaScript tooling and tests going forward, including this repository's checker (`tests/vh-adlc` in `michielvha/vh-adlc`); `vhco-pro/docs` keeps its Node checker under the keep-the-runtime clause. Phase 1 removes the conflicting Node 24 requirement for that tooling. Migrating unrelated existing projects or changing `github-app-registration` is not part of this feature. |
| D-25 | Host-created isolated worktrees are supported, with concurrent work on separate features and one writer per feature branch. Another session resumes the same feature only through an explicit owner-confirmed handoff. The plugin discovers existing worktrees but does not create, remove or force-move them, and claims are not distributed locks. |
| D-26 | Completion certifies a committed implementation reviewed at an exact commit, not an uncommitted snapshot. Relevant changes are committed before review; relevant dirty changes prevent completion. Unrelated staged, unstaged and untracked work is left untouched. |
| D-27 | Binary releases are signed with the owner's one general release key, VHCO Pro (Release Signing Key) <release@vhco.pro>, fingerprint `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6`: `checksums.txt` carries a detached signature. The passphrase-less ASCII-armoured secret key is the `PGP_PRIVATE_KEY` repository secret (set on 2026-10-17); the public key is committed as `release-signing-key.asc` and its fingerprint printed in the README. The key's original identity, VHCO Pro (Terraform Provider Signing Key), stays; the general identity was added on 2026-10-17 and is primary, and `release-signing-key.asc` is exported from the key as held in the secret, so the file, the README and every signature agree. The plugin installer's trust root stays the digests pinned in its lock; it does not verify the signature. |
| D-28 | The loop edits every piece of prose it writes for a reader with the humanize prose guide in `vhco-pro/docs` (`guides/humanize-prose.md`, adapted from `blader/humanizer`) before committing or posting it: feature-document prose, commit messages, PR and issue bodies, review summaries and run reports. Stored review records and other verbatim text are not rewritten. The guide is a docs page, not plugin text, and the plugin pin moves to `e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a`, the merge that added it. |

## Scope

In scope:

- Replacing `michielvha/claude-plugins` with the public `michielvha/vh-adlc` (see
  [One repository](#one-repository)).
- `plugins/vh-adlc/`: seven operations, one reviewer agent, the binary lock and installer.
- The binary at the repository root (`cmd/`, `internal/`, `go.mod`), its tests and its release.
- `tests/vh-adlc/`: the checker, fixtures, scenarios and evidence.
- The `vhco-pro/docs` changes the loop depends on (see [Docs changes](#docs-changes-phase-1)).
- Onboarding the repository itself to `vhco-pro/docs`, with `docs/specs/` declared as its
  feature-document root so this document's location is the repository's convention.
- Install, update and uninstall instructions, a support matrix, and the release key's fingerprint with
  its verification steps in the marketplace README.

Out of scope, by name:

- VS Code's Claude harness as a separately evidenced surface.
- Windows builds of the binary (v1: darwin and linux, amd64 and arm64).
- Any change to `plugins/github-app-registration/`, or to the agents, commands or documents of any repository other than `vhco-pro/docs` and
  `michielvha/vh-adlc`.
- Hooks, approval automation, a tracker, a database, a workflow runtime, a knowledge mapper, a scaffolder,
  worktree creation or removal, distributed locks, container management, and any language-specific rule.
  Reading existing host-managed worktrees and resuming in the owning worktree are in scope.

## Design

### Knowledge boundary

Each kind of information has exactly one home.

| Home | Holds | Examples |
| --- | --- | --- |
| The plugin | Procedure: what each operation does, in what order, which binary command decides each gate, what it may do without asking, how a review runs | The authority matrix, the review procedure, the knowledge-resolution steps |
| The binary | Mechanics: parsing, rule evaluation, Git comparison, next action | `vh-adlc gate planned <doc>` |
| `vhco-pro/docs` at a pinned revision | Knowledge: conventions and rules across repositories | Coding, delivery, commit format, no AI credit trailers, documentation style, the feature-document standard and its rules block, issue and PR linkage, branch model |
| The consuming repository | Local rules and all durable state | `AGENTS.md` and bridges, verified commands, feature documents, issues, branches, PRs |

Hard rules:

1. Neither the plugin nor the binary restates a convention. An operation that needs one reads the page
   that owns it and cites the revision.
2. The plugin carries no feature-document template. The binary carries no status, section or ID rule.
3. The plugin carries one docs pin: a full 40-character SHA in `plugins/vh-adlc/knowledge.md`. Bumping it
   is a reviewed plugin change, never automatic.
4. The plugin has no route table. It follows the task routes in `README.md` and `AGENTS.md` at the
   resolved revision.
5. A rule found missing from the docs is reported as a docs gap with a proposed page or section, never
   papered over in skill text.

#### Resolution procedure

Every operation runs `vh-adlc knowledge` first and states the result in one line, for example
`Conventions: vhco-pro/docs@8b14a69 (repository pin, AGENTS.md)`.

1. **Repository pin.** The binary reads the repository's root `AGENTS.md` and the bridges that point to it
   (`CLAUDE.md`, `.github/copilot-instructions.md`), and collects links of the form
   `https://github.com/vhco-pro/docs/blob/<ref>/...`. Exactly one distinct ref, and that ref a full
   40-character SHA: that is the pin. A short SHA, a branch name such as `main`, or several distinct SHAs:
   an **invalid pin**. The operation stops and reports it; an invalid pin is never treated as no pin.
2. **No pin.** The plugin pin applies, for all conventions (D-09). The loop says so, and its first change
   in that repository adds the pinned `AGENTS.md` and bridges following the docs onboarding guide,
   merged into any existing local instructions, never overwriting them, in its own commit.
3. **Page missing at the repository pin.** Stop, name the page and the pinned SHA, and recommend the pin
   bump (D-18).
4. **Unreachable.** Stop and report what could not be read (D-19).
5. **Local precedence.** Repository-local instructions beat central conventions, as the docs `AGENTS.md`
   requires. A conflict is reported, never silently resolved.

`vhco-pro/docs` is public, so no credential is involved. For tests only, the binary accepts
`--docs-source <path>` to read a fixture docs repository; its output then carries `override: true`, and
the checker fails if any skill mentions the flag.

#### Docs changes (phase 1)

Made in `vhco-pro/docs` through its own PR and `npm run check`, before the plugin pins the result:

| Change | Content |
| --- | --- |
| `decisions/0002-...md`, superseding 0001 | Every owner repository follows these conventions; a repository pin selects the revision; tooling uses its own pinned revision for a repository without one and adds the repository pin with its first change; pins are full SHAs, and anything else is invalid, never a fallback to `main` |
| `guides/onboard-a-repository.md` | Reflect 0002; the `AGENTS.md` template routes features to the feature-document standard; replace "do not introduce an automatic knowledge resolver" with the narrower rule that tools resolve only explicit full-SHA pins |
| `conventions/feature-documents.md` (`type: standard`, enforcement: `vh-adlc`) | One document per feature that is both spec and plan; default location `docs/internal/plans/<slug>.md` where a repository declares none; frontmatter; the nine statuses, their transitions and who sets each; sections (Implementation Phases optional); criterion, task, evidence and residual formats; the Review Log format below, including the reviewer's `FINDING` and `CRITERION` record formats; "state the end state, never a measurement of the problem"; Open Questions in decision shape; the `vh-adlc-rules` block |
| `guides/feature-document-template.md` | The copyable template |
| `conventions/delivery.md` | Branch model: feature documents committed and pushed to the default branch until implementation, code on a feature branch named `<conventional type>/<slug>` (for example `feat/review-freshness`), one PR per feature or child feature; docs-only feature-document and Markdown onboarding deliveries use `[skip ci]` only when the commit, outgoing range and PR diff are docs-only (D-23); host-managed worktrees and one writer per feature branch with explicit handoff (D-25); committed review targets and preservation of unrelated dirty work (D-26); feature PRs land by merge commit so reviewed commits stay reachable (a squash makes them unreachable, which the binary treats as stale); issue linkage: one issue per plan, `Closes #N` only when every criterion is met and closure is authorised, `Refs #N` otherwise, residuals tracked durably |
| `conventions/documentation.md` | Findings live in documents; issues stay short and link to them |
| `conventions/coding.md` | Bun is the default for JavaScript tooling and tests; remove the conflicting Node 24 requirement for that tooling, without requiring unrelated project migrations (D-24) |
| `README.md` | Task routes for "Specify, plan or implement a feature" and "Ship a change" |

The proposed rules block. In the standard it is the one fenced block whose info string is exactly
`yaml vh-adlc-rules`; zero or several such blocks is `rules-block-missing` or `rules-block-ambiguous`
(exit `3`). Once merged, the docs copy is authoritative and this spec stops being
a source for it:

```yaml vh-adlc-rules
schema: 1
statuses: [draft, planned, in-progress, complete, blocked, parked, abandoned, superseded, archived]
transitions:
  draft: [planned, blocked, parked, abandoned, superseded]
  planned: [in-progress, draft, blocked, parked, abandoned, superseded]
  in-progress: [complete, draft, blocked, parked, abandoned, superseded]
  blocked: [draft, planned, in-progress, abandoned]
  parked: [draft, planned, abandoned]
  complete: [archived, superseded]
  superseded: [archived]
  abandoned: [archived]
feature_root:
  default: docs/internal/plans
  declaration: '^Feature documents: `?([^`\s]+)`?$'   # a line in the repository's root AGENTS.md
required_frontmatter: [status, status_description, issue, goal, covers]
required_frontmatter_from: { in-progress: [branch] }
required_sections: [Context, Scope, Design, Acceptance Criteria, Test Plan, Tasks, Open Questions, Review Log]
normative_sections: [Scope, Design, Acceptance Criteria, Test Plan]
normative_frontmatter: [covers]
ids: { criterion: '^AC-\d{2,}$', task: '^T\d+$', review: '^R-\d+$' }
criterion_line: '^- \[( |x)\] (AC-\d{2,}):'           # ticked is [x]
task_line: '^- \[( |x)\] (T\d+) '                     # Tasks is populated when one matches
evidence_line: '^\s+Evidence: '                         # under a criterion or task, ticked or not
residual_line: '^\s+Residual: (https://\S+|#\d+)'      # an unticked criterion with a tracker
open_question: '^### Q\d+: '                           # Open Questions is empty when none match
test_plan: { columns: [Criterion, Proof], criterion_cell: '^AC-\d{2,}(, AC-\d{2,})*$' }
review_log_columns: [Date, Review, Kind, Commit, Model, Isolation, Outcome]
review_commit: '^`?[0-9a-f]{7,40}(\+dirty)?`?$'         # +dirty marks an uncommitted target, never fresh
review_kinds: [spec, implementation]
isolation: [structural, procedural, unknown, n/a]
acceptance_row: { kind: spec, model: n/a, isolation: n/a, outcome: accepted by owner, subsection: false }
verdicts: [met, not met, untested, not verified]
record_criterion: '^CRITERION: (AC-\d{2,}) '            # in a ### R-<n> subsection
criterion_continuation: '^\s+\S'                       # wrapped criterion text, unless it matches evidence_line or residual_line
record_verdict: '^VERDICT: (met|not met|untested|not verified)$'   # the line after its CRITERION
record_finding: '^FINDING: F-\d{2,}$'
record_severity: '^SEVERITY: (blocking|should-fix|nit)$'
record_no_findings: '^NO FINDINGS$'
local_format_declaration: '^Feature document format: local$'   # in root AGENTS.md; opts the repository out
gates:                   # every listed condition must hold; transitions are always checked too
  planned: [no_open_questions, test_plan_complete, spec_review_fresh, spec_review_clean, accepted, on_feature_branch_if_set]
  in-progress: [no_open_questions, test_plan_complete, spec_review_fresh, spec_review_clean, accepted, tasks_populated, on_feature_branch_if_set]
  complete: [no_open_questions, test_plan_complete, spec_review_fresh, spec_review_clean, accepted, all_met, impl_review_fresh, impl_review_clean, feature_tree_clean, on_feature_branch_if_set]
next:                    # first matching rule wins
  - { status: [draft, planned, in-progress], when: not no_open_questions, do: owner decision }
  - { status: [draft, planned, in-progress], when: not on_feature_branch_if_set, do: owner decision }
  - { status: [draft, planned, in-progress], when: not test_plan_complete, do: spec }
  - { status: [draft, planned, in-progress], when: not spec_review_fresh, do: spec review }
  - { status: [draft, planned, in-progress], when: not spec_review_clean, do: spec }
  - { status: [draft, planned, in-progress], when: not accepted, do: owner acceptance }
  - { status: draft, do: spec }
  - { status: planned, when: not tasks_populated, do: tasks }
  - { status: planned, do: implement }
  - { status: in-progress, when: tasks_open, do: implement }
  - { status: in-progress, when: not feature_tree_clean, do: implement }
  - { status: in-progress, when: not impl_review_fresh, do: review }
  - { status: in-progress, when: not impl_review_clean, do: tasks }
  - { status: in-progress, when: not all_met, do: tasks }
  - { status: in-progress, do: ship }
  - { status: [blocked, parked], do: owner decision }
  - { status: [complete, abandoned, superseded, archived], do: none }
```

`in-progress` to `draft` is how a spec is revised during implementation. `complete` is terminal for its
scope: new scope is a new feature. Under the documentation convention, a `standard` must name its
deterministic enforcement; this one names `vh-adlc`.

Review Log format (part of the standard): one table row per review pass with the columns above, and below
the table one `### R-<n>` subsection per pass holding the reviewer's returned records verbatim. An
acceptance is its own row: `Review` is the pass it accepts, `Kind` is `spec`, `Commit` is that pass's
commit, `Model` and `Isolation` are `n/a`, `Outcome` is exactly `accepted by owner`, and it has no
subsection. Freshness is computed from the latest review row whose `Outcome` is not an acceptance.
Each spec-review subsection contains either complete `FINDING` records or the literal `NO FINDINGS`,
never both. An absent or malformed subsection is not a clean review; `lint` reports it as malformed.
`lint` checks record form only in the subsections that still decide something: the latest spec review,
the latest implementation review, and the review the latest acceptance row names. Older subsections,
including earlier acceptances, are history and are not parsed.

Criterion text, for comparison with a `CRITERION` record, is the text after `AC-NN: ` on the
`criterion_line` plus every following line that matches `criterion_continuation` and neither
`evidence_line` nor `residual_line`, up to the next list item or annotation, with each run of whitespace folded to one space and the ends trimmed. The record's text after
`CRITERION: AC-NN ` is folded the same way. The two must be equal.

The binary implements a fixed vocabulary of conditions, and the block only composes them. That vocabulary
is the binary's API, not a convention:

| Condition | Holds when |
| --- | --- |
| `no_open_questions` | No line in Open Questions matches `open_question` |
| `test_plan_complete` | Every criterion ID appears in a cell of the Test Plan table whose header equals `test_plan.columns` |
| `spec_review_fresh` | The latest `spec` review row exists and is not stale (see Freshness) |
| `spec_review_clean` | The latest `spec` review's well-formed records contain no `blocking` finding, or contain exactly `NO FINDINGS`; freshness is checked separately |
| `accepted` | The latest `acceptance_row` names a clean `spec` review whose commit has the same normative baseline as now. A drift-only re-review therefore keeps the acceptance |
| `tasks_populated` | At least one line matches `task_line` |
| `tasks_open` | At least one task line is unticked |
| `on_feature_branch_if_set` | The document has no `branch` field, or the current branch equals it |
| `all_met` | Every criterion is ticked with an evidence line, or unticked with a residual line |
| `impl_review_fresh` | The latest `implementation` review row exists and is not stale |
| `impl_review_clean` | That review has exactly one record for every current criterion ID, with the exact accepted text (compared after folding, see above) and no extra IDs; every verdict is `met`, or the criterion is unticked with a residual line |
| `feature_tree_clean` | No staged, unstaged or non-ignored untracked change matches `covers`, excluding the feature document itself; unrelated dirty work is irrelevant |

The standard also owns the two record formats the reviewer returns. This spec states them under
[Review protocol](#review-protocol) only as the proposal for that page; the plugin cites the page.

### Deterministic core: the `vh-adlc` binary

An earlier resolver from the owner's own tooling read the
lifecycle files and their `status:`, and emitted one typed JSON directive (`schema_version`, `slug`,
`state`, `next_action`, `artifact`, `reason`). It had no LLM and no clock in the resolve path, frozen
enums, distinct exit codes, and byte-identical output for an identical tree. It was removed because it
had **zero runtime callers**: no skill invoked it. `vh-adlc` keeps the design and fixes that failure.
Every status change in the loop is decided by the binary, and a status change made without its result is
a defect that the checker and the scenarios catch (AC-22).

#### Commands

The model does judgement: is a criterion observable, is a design sound, what does a finding mean. The
binary does everything that has one right answer from the files.

| Command | Answers | Called by |
| --- | --- | --- |
| `vh-adlc knowledge --repo <dir> --plugin-pin <sha> --page <path>...` | Resolved docs revision; source `repository` or `plugin`; or `invalid-pin`, `missing-page` (naming each requested page absent at the pin), `unreachable`; the rules schema version; the repository's feature-document root | Every operation, first, passing the pages it will read |
| `vh-adlc find --repo <dir> (--issue <n> \| --slug <s>)` | Existing feature documents whose frontmatter matches | `spec`, `resume` |
| `vh-adlc lint <doc>` | Frontmatter, status, sections, IDs (unique, never recycled against the document's Git history), a Test Plan row per criterion, task-to-criterion references, Review Log shape and vocabulary | `spec`, `tasks`, `implement`, `review` |
| `vh-adlc gate <target-status> <doc>` | Whether the move is allowed now, listing every failing condition (below) | Before every status change |
| `vh-adlc fresh <doc>` | Spec-review and implementation-review staleness (below) | `implement`, `review`, `gate complete` |
| `vh-adlc next <doc>` | Exactly one next operation and its reason, from the `next` rules in the rules block | `resume` |
| `vh-adlc review check <doc> --review R-<n> --returned <file>` | Whether the stored records equal the returned ones byte for byte | `review` |

`gate` conditions:

| Target | Conditions |
| --- | --- |
| `planned` | `no_open_questions`, `test_plan_complete`, `spec_review_fresh`, `spec_review_clean`, `accepted`, `on_feature_branch_if_set` |
| `in-progress` | `no_open_questions`, `test_plan_complete`, `spec_review_fresh`, `spec_review_clean`, `accepted`, `tasks_populated`, `on_feature_branch_if_set` |
| `complete` | `no_open_questions`, `test_plan_complete`, `spec_review_fresh`, `spec_review_clean`, `accepted`, `all_met`, `impl_review_fresh`, `impl_review_clean`, `feature_tree_clean`, `on_feature_branch_if_set` |
| any other | The transition only; the operation records the reason |

The conditions come from the block's `gates` map; this table shows the proposed values. Every gate also
checks the transition, except a gate whose target equals the current status: that is a re-check, the
transition is not evaluated, and only the conditions are. Re-entry is keyed on the `branch` field, not on status: a document that has a
`branch` is re-entered on that branch (no new claim commit), whether it is `planned` after a revision or
already `in-progress`.

Every status-change commit carries the gate's one-line result in its body, for example
`vh-adlc gate planned: pass (rules 1, docs 8b14a69)`, so the decision is durable in Git and checkable.
When the owner allowed a procedural gate (binary unavailable, or a local format), the line reads
`vh-adlc gate planned: procedural (owner allowed: <reason>)`.

Freshness, computed from Git, never from timestamps. The normative baseline comprises the sections in
`normative_sections` and the fields in `normative_frontmatter`, including `covers`. Comparison ignores
criterion checkbox state and criterion evidence/residual annotation lines, but preserves criterion IDs,
text, order and the Test Plan. Changes only to those annotations, tasks, status or Review Log do not
change the baseline. Both spec and implementation reviews are bound to this same baseline.
The feature document itself never counts as a covered file. The default branch is the target of
`refs/remotes/origin/HEAD`, read at its remote-tracking
ref; the binary never fetches, and every operation runs `git fetch origin <default branch>` (read-only,
within the current task's authority) before calling `fresh` or `gate`. The output names both the
remote-tracking SHA and the local one. A repository with no remote uses its local default branch and
reports `remote: none`. A clone that has a remote but no `refs/remotes/origin/HEAD` is an error
(`default-branch-unknown`, exit `4`), never a guess.

- **Spec review stale** if the normative baseline differs between the reviewed commit and now, or if
  `git diff --name-only <reviewed>...<remote default> -- <covers>` is non-empty. That is drift from
  other work on the default branch since the reviewed commit's merge base. The feature's own commits
  cannot cause it.
- **Implementation review stale** if the normative baseline differs between the reviewed commit and now,
  or if `git diff --name-only <reviewed> HEAD -- <covers>` on the feature branch is non-empty. This includes
  covered files brought in by merging the default branch. Changed requirements or Test Plan therefore
  require a new implementation review even when no code changes.
- **No review row**, a `+dirty` target, or a reviewed commit no longer reachable (for example after a
  squash merge): stale, with its own finding code. Never a guess.
- Relevant staged, unstaged and non-ignored untracked changes do not change the committed review target,
  but make `feature_tree_clean` fail with `feature-tree-dirty`, listing the paths. Commit this feature's
  changes before a fresh review; never stage unrelated changes or require the entire checkout to be clean.
- Ticked boxes, evidence/residual annotations and Review Log appends change neither the normative
  baseline nor covered files, so they never cause staleness.

Clearing drift: when a `planned` or `in-progress` spec review is stale from drift alone, `next` returns
`spec review`. Whenever the document has a `branch`, including while `planned` after a revision, the loop
first incorporates the default branch into that feature branch in its owning worktree (a local merge
within accepted scope), then reviews the resulting commit. Without a feature branch it updates to the
default branch before review. If unrelated work would be overwritten, it stops rather than stashing or
discarding it. Drift alone preserves acceptance only if the merge leaves the normative baseline unchanged.
A changed baseline follows revision and re-acceptance instead. Covered merge changes invalidate the
implementation review too. A blocking re-review or an unanswered question stops forward progression,
including after interruption; a fresh review is not necessarily a clean review.

The binary never writes to the repository, never changes a status (the operation edits the file after the
gate passes, then re-runs `lint`), never calls GitHub, and decides nothing outside the tables above.

#### Contract

- One JSON object on stdout: `schema_version`, `command`, `result`, and `findings[]` with stable `code`,
  `message`, `path` and `line`. Finding codes are API.
- Identical inputs give byte-identical output: no timestamps, random values or unordered iteration.
- Exit codes: `0` answered or passed; `1` gate or lint failed; `2` usage; `3` document malformed, or rules
  block missing or of an unknown schema; `4` internal or IO error; `5` knowledge not usable (invalid pin,
  missing page, unreachable). A non-zero exit never prints a passing result.
- Network: only `vhco-pro/docs` files at a full SHA, cached forever under
  `os.UserCacheDir()/vh-adlc/docs/<sha>/` because a SHA is immutable. `--offline` forbids the network.
  That cache is the only thing it writes.
- A repository whose root `AGENTS.md` matches `local_format_declaration` (a repository with its own established template would add it) gets
  `result: local-format`, finding code `local-format`, exit `3`, never `pass`. The operation then runs the
  gate procedurally, as such a repository does today, and its report says the binary did not decide it. Without
  that declaration, every document is checked against the standard, and a non-conforming one is
  `malformed` (also exit `3`, its own finding code), to be fixed rather than bypassed.
- `lint` uniqueness applies to review rows and `### R-<n>` subsections. Acceptance rows reference an
  existing review ID and are not counted.
- A JSON Schema for the output lives in the binary's repository; `schema_version` changes only with a
  major release.

#### The binary in the repository

The binary lives at the root of `michielvha/vh-adlc` (D-22). The bootstrap guide's rule for an existing
project applies: adapt the relevant files of `michielvha/template-go-app` (inspected at `9a9321c`)
rather than replacing the repository or importing the template's history. Adapted as the Go conventions
and bootstrap guide at the resolved docs pin require:

- `cmd/vh-adlc/main.go` holds wiring only; logic lives in `internal/` (`knowledge`, `doc`, `rules`, `gate`,
  `fresh`, `next`, `review`). Table-driven tests beside the code; golden-file tests run every command twice
  per fixture and assert byte-identical output and the documented exit code.
- Standard library first. A YAML parser is a concrete need. Git is read by invoking `git`.
- `go test ./...`, `go vet ./...`, `golangci-lint config verify` and `golangci-lint run` (v2) gate the
  release in CI.
- Released with `michielvha/gitversion-tag-action` and `michielvha/goreleaser-action`, pinned to full
  commit SHAs (the template's `@main` pins are replaced), with `CGO_ENABLED=0`, `-trimpath`, darwin and
  linux on amd64 and arm64, and a published `checksums.txt` (the template's `checksum.name_template`,
  `{{ .ProjectName }}_{{ .Version }}_SHA256SUMS`, is replaced by `checksums.txt`). Signing was
  requested (D-27), so the template's `signs` block (`.goreleaser.yml`, `artifacts: checksum`,
  `--detach-sign`) is kept, and GoReleaser's default signature name makes it `checksums.txt.sig`. The
  key reaches it through the release action's `pgp-private-key` input (`action.yml` at `a86fcdf`), fed
  from the `PGP_PRIVATE_KEY` secret, which is documented by name and never by value as the bootstrap
  guide requires. The secret holds a passphrase-less ASCII-armoured key, because the action has no
  passphrase input. A release without the key fails rather than publishing unsigned: the action's
  import step pipes the input into `gpg --batch --import` under `bash -eo pipefail`, and empty input
  exits non-zero before GoReleaser runs. The public key is committed at the repository root as
  `release-signing-key.asc`, and the README prints its full primary fingerprint (D-27) with the
  verification steps: import that file, compare `gpg --fingerprint release@vhco.pro` with the printed
  fingerprint, `gpg --verify checksums.txt.sig checksums.txt`, then check the downloaded asset with
  `sha256sum --check --ignore-missing checksums.txt` on Linux or
  `shasum -a 256 --check --ignore-missing checksums.txt` on macOS. The signature is made by the key's
  signing subkey, so `gpg --verify` names the subkey; the fingerprint to compare is the primary one.
  The template's container step is removed: there is no service image.
- The binary ignore is anchored at the root (`/vh-adlc`), as the Go convention requires, so it cannot hide
  `cmd/vh-adlc/` or `plugins/vh-adlc/`.
- The release workflow runs only when binary paths change (`cmd/`, `internal/`, `go.mod`, `go.sum`, the
  GoReleaser and GitVersion configuration). Plugin-only and docs-only commits never cut a binary release.
  GitVersion still reads the whole repository's history, so a binary version can rise because of a plugin
  commit; that is accepted, because plugins version through their own `plugin.json`, not through tags.
- A path-filtered workflow does not run on a force-push that rewrites history; dispatch it by hand then.

#### How the plugin gets the binary

- `plugins/vh-adlc/vh-adlc.lock.json` pins the exact version and, per platform, the asset name,
  `asset_sha256` and `binary_sha256` for the extracted executable, copied in after the release is verified.
  Both digests are pinned independently of the release's checksum file and its signature, as the delivery
  convention requires; the installer never reads either.
- `plugins/vh-adlc/scripts/ensure-vh-adlc.sh` (Bash, `set -euo pipefail`) prints the path of a verified
  binary: a `vh-adlc` on `PATH` only if its executable digest matches `binary_sha256` and it reports
  exactly the locked version, else the user cache entry verified the same way on every reuse, else the
  downloaded asset checked against `asset_sha256` and its extracted binary checked against
  `binary_sha256` and the locked version. A different-version PATH candidate is ignored with a diagnostic.
  A matching-version PATH candidate or cache entry with a missing or mismatching digest fails closed
  with an explicit error, rather than silently falling through. Downloads are verified before execution
  or cache publication. It never writes into the plugin directory or the repository.
- Bumping the binary is a reviewed change to the lock and a plugin version bump.
- If the binary cannot be obtained, read-only work (`investigate`, drafting, `resume` reporting) continues
  with a visible `deterministic checks unavailable` line. Every status change stops, unless the owner
  explicitly allows a procedural gate for that run, recorded in the feature document.

### One repository

`michielvha/vh-adlc` after D-22:

```text
.claude-plugin/marketplace.json   # marketplace "vhco-tools", unchanged name
plugins/
  vh-adlc/                         # this plugin
  github-app-registration/        # unchanged, carried over
cmd/vh-adlc/  internal/  go.mod    # the binary
tests/vh-adlc/                     # checker, fixtures, scenarios, evidence
docs/specs/                       # feature documents, declared in AGENTS.md
AGENTS.md  CLAUDE.md  .github/
```

`michielvha/vh-adlc` is a new public repository whose history starts at one commit; `michielvha/claude-plugins`
no longer exists and its URL does not redirect. The marketplace name `vhco-tools` stays, so
`vh-adlc@vhco-tools` and `github-app-registration@vhco-tools` keep their install identifiers; a host that
added the marketplace by the old repository name adds it again as `michielvha/vh-adlc`. No root `plugin.json` exists (see
[Hosts](#hosts)). The root `go.mod` does not affect plugin loading, because each marketplace entry's
`source` points at its own `plugins/<name>` directory.

Going public, in this order:

1. Audit the full history (every commit on every ref) for credentials and private content, at the commit
   that goes public, and record that SHA with the result. Recorded on 2026-10-17 at `25529ab` (refs:
   `main` only; one commit): no credentials, the only key-shaped strings are the fake
   `github-app-registration` test fixtures; one identity, `michielvha`; no employer, work-account or
   earlier private-tool identifiers.
2. The owner confirms the audit result. A history rewrite is a destructive action needing its own
   approval.
3. Publish the audited history as the public `michielvha/vh-adlc`. On 2026-10-17 the owner chose to reset
   the history to one commit and to delete and recreate the repository, so no earlier commit stays
   reachable by SHA. Each of these is an owner-authorised action outside any feature's scope.
4. In disposable profiles for each claimed host, add the marketplace as `michielvha/vh-adlc` and verify
   the existing `github-app-registration` plugin installs without credentials. Dual-plugin installation is verified in phase 7, after
   `vh-adlc` exists; updating the owner's own profiles remains a separate owner action.

Making the marketplace public also removes the credential every host and remote session needed to read
the former private `claude-plugins`.

### Hosts

| Host | Surfaces | Role | How it is proven |
| --- | --- | --- | --- |
| Claude Code | Desktop app, VS Code extension, terminal CLI, remote sessions | Required for v1 | One runtime under all four: full scenario run headless on the CLI, plus discovery in the desktop app, the VS Code extension and a remote session |
| VS Code Copilot Chat, Local harness | Stock Copilot Chat (default harness) | Required for v1 | Full scenario run by hand from the same scripts |
| Copilot CLI | Terminal; the engine of VS Code's Copilot harness | Claimed only if it passes | Full scenario run headless |

VS Code Copilot Chat has three harnesses: Local, Copilot (Copilot SDK, the Copilot CLI engine) and Claude
(Claude Agent SDK). A pass in one proves nothing about another. Plugins need `chat.plugins.enabled`.

Host facts the design relies on (probe: a test plugin on Claude Code 2.1.289 and Copilot CLI 1.0.91 on
2026-10-17; src: VS Code source on `main`, read, not run):

| Fact | Claude Code | VS Code Local | Copilot CLI |
| --- | --- | --- | --- |
| Reads `.claude-plugin/plugin.json` | yes | yes | yes (fourth in its lookup order) |
| Root `plugin.json` with the Agent Plugins `$schema` | ignored | not checked | takes precedence and moves agents to a vendor namespace: never ship one |
| Skill invocation | `/vh-adlc:<skill>`; bare `/<skill>` unless a built-in owns it | `/<plugin>:<skill>`; a skill whose `name` differs from its directory is skipped | `/<skill>` or `/<plugin>:<skill>`; built-ins and project skills win |
| Built-ins `resume`, `review`, `tasks` | yes (probe) | none | yes (probe) |
| Agent file in `agents/` | any `.md`; frontmatter `name`, else the file name including `.agent` | any `.md`; frontmatter `name` wins (src) | `.md` or `.agent.md`, suffix stripped |
| `model:` in agent frontmatter | aliases, full IDs, `inherit` | aliases not translated for plugin agents (src) | `opus` fails a dispatch outright (probe) |
| `tools:` allow-list | enforced, Claude names | unknown names ignored (docs); Claude names not translated for plugin agents (src) | Claude names mapped (probe) |
| `disallowedTools` | enforced | not enforced (src) | ignored (probe) |
| Subagent dispatch | Agent tool, optional model | `runSubagent`, optional model; an unknown model means it does not run | `task` tool |

Consequences: one manifest; each skill's `name` equals its directory; the agent sets `name`; no `model:`
in frontmatter; the reviewer's `tools:` is the union `Read, Grep, Glob, Bash, read, search, execute`,
and `disallowedTools: Edit, Write` is a Claude Code-only extra; dispatch is described in neutral prose,
never as one host's tool call.

Not yet established, and the first thing S1 settles on each host: whether a skill can read files outside
its own directory (`../../references/`, `knowledge.md`, `scripts/`); how Claude Code treats the unknown
tool names `read, search, execute`; and how a skill locates the plugin root (Claude Code sets
`CLAUDE_PLUGIN_ROOT`). A failure on a required host becomes an Open Question before phase 5, never a
silently duplicated file.

### Package

```text
plugins/vh-adlc/
  .claude-plugin/plugin.json
  knowledge.md                    # the one vhco-pro/docs pin
  vh-adlc.lock.json                # version, asset and executable SHA-256 per platform
  scripts/ensure-vh-adlc.sh
  skills/vh-adlc-{investigate,spec,tasks,implement,review,ship,resume}/SKILL.md
  agents/vh-adlc-reviewer.agent.md # name: vh-adlc-reviewer
  references/
    loop.md                       # which binary command gates which step
    authority.md                  # authority matrix, identity, preservation
    review-protocol.md            # dispatch, independence, isolation; cites the standard's record formats
tests/vh-adlc/                     # at the repository root, so hosts never install it
  check.test.ts                   # deterministic checker
  fixtures/                       # fixture repositories, fixture docs repository
  scenarios/                      # S1 to S15
  shim/                           # installer-generated logging wrapper, fixture copies only
  evidence/<host>/                # recorded summaries, never raw transcripts
```

- `.claude-plugin/plugin.json` is the only manifest. No generated tree, no build step. Nothing writes into
  the installed plugin cache.
- `plugin.json` `version` follows semver and changes with every change to installed content: a pin or
  lock bump is a patch, new behaviour a minor, a changed operation contract a major. The checker fails when
  package files differ from the default branch without a version change, because hosts cache by version.
- The checker runs on Bun (D-24). Phase 1 makes Bun the default for JavaScript tooling and tests and removes
  the conflicting Node 24 requirement for that tooling. Consuming repositories need neither to use the loop.

### Operation names

| Operation | Skill and directory | Invocation |
| --- | --- | --- |
| investigate | `vh-adlc-investigate` | `/vh-adlc-investigate` |
| spec (author and review modes) | `vh-adlc-spec` | `/vh-adlc-spec`, `/vh-adlc-spec review <path>` |
| tasks | `vh-adlc-tasks` | `/vh-adlc-tasks` |
| implement | `vh-adlc-implement` | `/vh-adlc-implement` |
| review | `vh-adlc-review` | `/vh-adlc-review` |
| ship | `vh-adlc-ship` | `/vh-adlc-ship` |
| resume | `vh-adlc-resume` | `/vh-adlc-resume` |

On 2026-10-17 none of these is a Claude Code or Copilot CLI built-in, and no plugin installed on the
owner's machine provides a `vh-adlc-*` skill. Hosts that need the namespaced form
(`/vh-adlc:vh-adlc-spec`) get it documented in the README from the tested run.

### Activation

The loop runs only when invoked: an operation by name, an explicit request to use it, or a repository
instruction the owner wrote. Skill descriptions name this loop and its trigger; none claims to be the entry
point for all development, planning or review. An instruction not to use the loop always wins.

### Branches, acceptance and status changes

Branch model (D-20, written into the docs delivery convention in phase 1):

- Until a document has a `branch` field, it lives on the default branch. `spec` and `tasks` commit the
  document, plus onboarding files on a first run, and push those docs-only commits to the default branch.
  That push is part of invoking `spec` or `tasks` (D-20), and nothing else is pushed with it.
- `implement` commits the `in-progress` flip with the `branch` field on the default branch, pushes it so
  any other session sees the claim, then creates the feature branch from that commit.
- Once a document has a `branch`, it is edited only on that branch, whatever its status. A spec revision
  during implementation (`in-progress` to `draft`), its review, re-acceptance and the move back to
  `planned` and `in-progress` all happen there; `branch` persists, and re-promotion reuses the branch as
  re-entry. The document returns to the default branch with the PR.
- A protected default branch rejects the push. The operation reports a partial result, keeps the commit
  local, and asks whether to open a docs PR instead.
- Feature-document-only and Markdown onboarding deliveries use `[skip ci]` under D-23. Before applying
  it, inspect the staged paths, all outgoing commits and the full feature PR diff against its target.
  Any code, tests, workflows or other non-documentation changes in that delivery require normal CI,
  even if its final completion commit changes only the feature document. A skipped docs-only run is
  reported as skipped, never as a passing verification run.
  If skipping leaves required checks pending, report the delivery blocked and request an explicit
  exception to run CI; never bypass branch protection or amend published commits to remove the marker.

Worktrees and ownership (D-25):

- Host-created isolated worktrees may run different features concurrently. Resolve repository identity
  through Git's common directory, and discover branch ownership with `git worktree list --porcelain`;
  run branch checks, freshness and gates in the target feature's worktree, not whichever worktree is current.
- A pushed claim advertises the feature branch, not a lock or a session lease. Before another session
  writes the same feature, the owner confirms the earlier writer has stopped and hands the feature over.
  This is a single-writer operating rule, not a promise to detect remote sessions automatically.
- Resume in an existing owning worktree where available. A different checkout may resume only after
  handoff and recovery of the exact committed branch state; unpublished commits must be made available
  under the existing push authority or transferred by the owner. Missing state is a blocker, not permission
  to restart the feature or substitute the default branch.
- A host's new isolated worktree is not automatically the feature's owning worktree. If the branch is
  checked out elsewhere, use that worktree through the host or report the required owner action; never
  force-checkout, delete, prune or reset a worktree, and never repoint an unrelated host branch.
- Before a claim, docs-only default-branch work uses an existing safe default-branch worktree. If the host
  cannot access one without disturbing other work, stop and request that access rather than committing
  the claim on an unrelated branch. A non-fast-forward claim push is partial, not a successful claim.
- Recovery distinguishes an unpublished local claim, a published claim without its feature branch, and
  an existing feature branch. Retry an unpublished claim push before branch creation; after a published
  claim, create any missing feature branch at that exact claim commit and continue in a host-provided
  owning worktree. Reuse an existing branch rather than creating a second claim or resetting its tip.
  An ambiguous or competing claim stops for the owner; handoff does not imply permission to overwrite it.

Acceptance (D-11), in this order:

1. `spec` folds the owner's answers into the document and commits. Call that commit X.
2. An independent spec review runs at X and finds nothing blocking.
3. The owner accepts in session.
4. `spec` appends a Review Log row at X with outcome `accepted by owner`.
5. `vh-adlc gate planned` passes.
6. `spec` commits the flip to `planned`.

A later change to the normative baseline makes that acceptance stale, and the gate says so. A request to
investigate or draft is never permission to build; an issue comment never changes a status.
On a normative revision, reset criterion ticks and remove live criterion evidence and residual annotations;
their previous values remain in Git and immutable review records. Revalidate evidence and obtain any
required residual decision against the new baseline before restoring them. Preserve checked tasks as
historical work, then add new task IDs for changed requirements rather than treating old ticks as proof.
Re-acceptance does not make an old implementation review current.

Who changes status:

| Change | By | Decided by |
| --- | --- | --- |
| new document at `draft` | `spec` | `vh-adlc find` returns no match |
| `draft` to `planned` | `spec` | `vh-adlc gate planned` |
| `planned` to `in-progress`, or re-entry | `implement` | `vh-adlc gate in-progress` |
| `in-progress` to `complete` | `implement` or `ship` | `vh-adlc gate complete` |
| `planned` or `in-progress` to `draft` (spec revision), on the feature branch if set | `spec` | `vh-adlc gate draft`; the changed normative baseline makes the reviews stale by the freshness rule |
| to `blocked` | any operation | `vh-adlc gate blocked`; names the blocker and the smallest owner decision |
| to `parked`, `abandoned`, `superseded`, `archived`, and out of `blocked` or `parked` | the owner's instruction | `vh-adlc gate <target>`; reason recorded |

### Operations

Each operation starts with `vh-adlc knowledge` and the target feature, and ends by reporting what it
changed, what it verified, every binary result it acted on, and what is left. Before it commits or posts
prose a reader will see, it edits that prose with the humanize prose guide at the resolved pin and names
the guide and revision in its report (D-28). Records the reviewer returns are stored exactly as returned.

**investigate.** Input: an issue, failure, question or document. Measure rather than remember; separate
measured facts, source observations, hypotheses and decisions. Substantial findings go into an analysis
document when the owner asks; issues get a summary and a link. Never ships a fix.

**spec, author mode.** Input: an issue, goal or document. `vh-adlc find` first; extend rather than
duplicate. Ground every claim in a citation gathered in this run. Write from the docs template. Criteria
state end states, each with a Test Plan row naming a real verification method. Judgement calls go into
Open Questions in decision shape and are put to the owner with the host's question tool. Starts at
`draft`. Creating an issue needs explicit authority.

**spec, review mode.** Repeatable. The orchestrating session dispatches `vh-adlc-reviewer` read-only with
the document, commit and pinned conventions. The reviewer verifies every factual claim, attacks the design
and the criteria ("what does the artifact look like when every box is ticked; does the original defect
survive?"), and returns findings:

```text
FINDING: F-01
KIND: factual | judgement
SEVERITY: blocking | should-fix | nit
WHERE: <section>
EVIDENCE: <file:line, command and output, or quote>
PROPOSAL: <one or two sentences>
```

The reviewer returns complete finding records, or the single literal `NO FINDINGS`. The orchestrator stores
the returned records verbatim against the reviewed commit before applying changes. It applies factual
findings, turns judgement findings into Open Questions (never answering them), puts them to the owner,
and commits the changes. It does not relabel the original blocking pass as clean; a new independent pass
must establish a clean current review after blocking findings are resolved. Until then, forward gates
fail and resume routes unanswered questions to the owner, including on an already active feature.
It then follows the acceptance order above; drift alone needs no new acceptance if the baseline is unchanged.
Before applying any change to the normative baseline of a `planned` or `in-progress` document, `spec` runs
`vh-adlc gate draft` and commits the flip to `draft` (on the feature branch when `branch` is set). Every
re-acceptance therefore moves `draft` to `planned`, and implementation re-enters through `branch`.

**tasks.** On a `planned` document, `vh-adlc gate in-progress` must fail only on `tasks_populated`; on an
`in-progress` document (a re-check), it must fail on nothing except, at most, `tasks_populated`. Writes one-commit
tasks naming the file, a test-shaped done condition and the criteria advanced, in dependency order,
failing test first. Re-runs preserve checked tasks and replan only the unchecked tail. Never adds scope
or ticks a task.

**implement.** `vh-adlc gate in-progress`, then the branch steps above. Writes each criterion's test first
and watches it fail for the stated reason (or records why that is not feasible), implements task by task
with one coherent commit each, runs the repository's verification commands, ticks tasks and criteria with
an evidence line, and records what remains untested. Preserves unrelated staged, tracked and untracked
work. Never edits a criterion to fit what was built.

**review.** Dispatches `vh-adlc-reviewer` against an exact target, or writes a self-contained handoff when
dispatch is unavailable. Stores the returned records, then runs `vh-adlc review check`. For every
criterion the review did not return as `met`, it unticks the criterion and adds an evidence line naming
`R-<n>` and the verdict. `next` then routes the feature to `tasks`, which plans the work for those
criteria in the unchecked tail. A completion-eligible review targets a commit with no relevant staged,
unstaged or non-ignored untracked changes. If relevant changes exist, return to implementation to commit
only those changes before dispatch; never clean unrelated work to obtain a review.

**ship.** Requires an explicit ship request. Doc-impact check; verify; `vh-adlc gate complete` whenever
ship intends to set the document `complete`, before staging the completion update and independent of the
issue linkage (a residual gives `complete` with `Refs`, never `Closes`). If doc-impact or verification
requires a covered change, stage and commit only that feature change first, then obtain a fresh
implementation review and rerun the gate. Relevant dirty changes cannot pass completion; unrelated dirty
work is not staged or discarded. Commit the completion update under the resolved conventions; push the feature
branch; create or update one PR; update the linked issue with `Closes` or `Refs` per the docs convention;
track CI for the pushed commit; report branch, commit, PR, CI, issue and residuals. Never merges. A failed
push or issue update is reported as partial, naming exactly what succeeded.

**resume.** Input: an issue, document, branch or "continue". `vh-adlc find`; reconcile with Git, existing
worktrees, issue and PR; establish the owning worktree and any required single-writer handoff, then run
`vh-adlc next` and `vh-adlc fresh` there before edits. If the owning worktree cannot be accessed, report
the required owner action rather than resolving against an unrelated branch. Continue the next safe step within existing authority;
stop only for a real blocker, naming the smallest decision. "Continue" never means merge, release, change
credentials or start another feature.

### Review protocol

Independence: a separate context, the `vh-adlc-reviewer` agent where the host can dispatch it, otherwise a
handoff the owner runs elsewhere. Self-review is never labelled independent. A failed dispatch leaves the
review visibly pending.

Target: an exact commit, the `covers` paths, the accepted normative baseline and the checks observed.
Completion-eligible implementation review runs against that committed state in its owning worktree with
`feature_tree_clean` true. An explicitly requested uncommitted diagnostic review includes relevant
untracked files and uses `+dirty`; it never satisfies freshness or authorises completion. The reviewer
does not create a worktree in v1; it uses the host-managed target worktree read-only.

Implementation review returns one record per criterion, stored verbatim under `### R-<n>`:

```text
CRITERION: AC-01 <exact accepted text>
VERDICT: met | not met | untested | not verified
EVIDENCE: <command or action>, <target>, <observed result>, <limitations>
```

The record set contains every current criterion ID exactly once, with exact accepted text and no extra
IDs. A previous criterion set or baseline is not reusable merely because covered code did not change.

| Verdict | Meaning |
| --- | --- |
| `met` | Executed evidence observed in this review establishes the criterion |
| `not met` | Executed evidence contradicts it |
| `untested` | No adequate test or check covers it |
| `not verified` | A relevant check exists but its execution was not observed |

`blocked` is a status, not a verdict. A passing subset never upgrades a composite criterion. A unit test
never proves an unobserved native, live, upgrade or migration outcome. Source-inspection counterexamples
are findings, not executed failures.

Isolation is recorded per review as `structural`, `procedural` or `unknown`. A tool allow-list counts as
structural only where the host is verified to enforce it, and a `Bash` or `execute` grant can still write,
so the honest default is `procedural`. If the owner requires structural isolation and the host cannot
give it, the review stops.

### Models

Agent frontmatter carries no `model:` (see [Hosts](#hosts)). Tier is chosen at dispatch:

| Role | Default |
| --- | --- |
| The orchestrating session | The model the owner selected in the host |
| Independent passes on Claude Code | `fable`. If the host rejects it, or the owner declines a usage-credit prompt, `opus`, announced in the run and recorded. This is the defined default chain, the same as Claude Code's `best` alias |
| Independent passes on VS Code and Copilot CLI | The model the owner names, otherwise the session model; recorded as such |

A model the owner names is passed as given, with no fallback: if the host rejects it, the review stays
pending and lists what the host offers. Each Review Log row records the model that ran, or `unknown`. A
stronger model never makes self-review independent.

### Authority, identity and preservation

| Action | Authority needed |
| --- | --- |
| Read, run non-mutating checks | The current task |
| Draft a requested spec or analysis | The request |
| Commit and push a feature document without a `branch` field (and first-run onboarding files) to the default branch | Invoking `spec` or `tasks`, or `implement`'s claim commit |
| Edit code, tests and docs; commit on the feature branch | Accepted feature scope |
| Create a tracking issue | Included in acceptance, or requested |
| Push the feature branch; create or update the PR; update the linked issue | An explicit ship request |
| Merge, tag, release, deploy, restart a running app, end a live session | Separate approval for that exact action |
| Destructive Git or data operations, history rewrites, credential changes | Separate approval for that exact action |
| Another repository, account or feature | A new scope decision |

A green suite, an earlier approval or "continue" never stands in for a missing approval. Within accepted
scope the loop does not ask again for each edit or commit. Host permission prompts are the host's business.

Identity: verify repository and account before any GitHub write; never switch a shared global CLI account;
prefer per-command credentials; a 404 can mean missing or forbidden, so say which is known; never try
unrelated credentials; never print tokens, credential-bearing URLs, cookies, signed URLs or keys.

Preservation: inspect staged and unstaged state before branch and commit operations; never stash, reset,
clean, check out over or overwrite changes the loop did not make; stage explicit paths; a conflicting
concurrent edit to the same file stops the run with a question.

## Acceptance Criteria

Proven by the checker (C), the binary's own tests (B) or a scenario (S), on every claimed host unless
stated.

- [ ] AC-01: Installing `vh-adlc` leaves `github-app-registration`, its files and the marketplace identity
      unchanged, and uninstalling restores the previous state.
- [ ] AC-02: One manifest, no generated mirror, no build step; the same tree loads on every claimed host
      with all seven operations and the reviewer discoverable under the documented invocation.
- [ ] AC-03: The package contains no convention text and no template; every operation reports the docs
      revision and page it took each convention from.
- [ ] AC-04: Knowledge resolution uses the repository pin; else the plugin pin with onboarding added in
      the first change; and stops with a precise report on an invalid pin, a page missing at the
      repository pin, or unreachable docs. It never reads `main`.
- [ ] AC-05: Changing only the docs revision (or only its rules block) changes the loop's behaviour, with
      no plugin or binary change.
- [ ] AC-06: Where local instructions conflict with the pinned conventions, the local rule is followed and
      the conflict reported.
- [ ] AC-07: Installing the plugin makes no unrelated request enter the loop; every operation is reachable
      under its documented invocation; with a fixture plugin exposing `spec`, `implement` and `review`
      installed, `vh-adlc` shadows none of its skills.
- [ ] AC-08: Starting from an issue or topic that has a feature document extends it; no second document
      or issue appears.
- [ ] AC-09: An unanswered Open Question, a missing Test Plan row, no fresh clean spec review or no
      `accepted by owner` row at the current normative baseline prevents `planned`, implementation entry
      or re-entry, and `complete`; the binary names each failing condition. After interruption, resume
      routes an unanswered question to the owner rather than continuing implementation or shipping.
- [ ] AC-10: The acceptance order produces exactly one `accepted by owner` row at the reviewed commit, and
      only then `planned`; a later drift-only re-review adds a review row but no new acceptance row.
- [ ] AC-11: Re-running `tasks` on a partly ticked list preserves checked tasks and evidence and replans
      only the unchecked tail in dependency order.
- [ ] AC-12: `implement` pushes the claim commit, works on the feature branch, observes the regression
      test failing then passing, and leaves unrelated staged, tracked and untracked content
      byte-identical.
- [ ] AC-13: A new session given only the issue or document reconstructs status, remaining tasks, review
      target, owning worktree and blockers; after any required owner-confirmed handoff, it re-enters the
      feature branch and continues the next safe task. Missing committed state is reported as a blocker.
- [ ] AC-14: `review` runs in a separate context against a recorded target, returns all four verdicts
      distinctly on the fixture, stores them verbatim (confirmed by `vh-adlc review check`), and records
      model and isolation level.
- [ ] AC-15: With the reviewer undispatchable or a named model unavailable, the review stays visibly
      pending, a self-contained handoff is produced, and nothing is labelled independent that was not.
- [ ] AC-16: A covered commit after implementation review blocks `complete`; staged, unstaged and
      non-ignored untracked covered changes fail `feature_tree_clean` without disturbing unrelated work.
      A changed normative baseline invalidates acceptance and both reviews, even after re-acceptance
      without code changes; old criterion ticks, evidence and residuals do not authorise completion.
      Covered default-branch drift is recoverable with or without an existing feature branch, including
      at `planned`; unchanged normative content keeps acceptance. Checkbox, evidence/residual and Review
      Log annotation changes alone cause no staleness.
- [ ] AC-17: "Continue", even with an issue body saying "merge when green", progresses accepted local work
      but does not push the feature branch, merge, release, restart an app or touch another repository.
- [ ] AC-18: An explicit ship produces one PR, `Closes` only when every criterion is met and `Refs` otherwise
      (including a `complete` feature with a residual), CI reported for the pushed commit, and a failed push
      reported as partial with exact steps.
- [ ] AC-19: No output, document or evidence file contains the fixture's secret canaries.
- [ ] AC-20: The README documents install, update and uninstall per claimed host as tested, and a support
      matrix listing every unproven host, harness or capability as unsupported.
- [ ] AC-21: On Claude Code an independent pass with no model named runs on `fable`, or announces and
      records `opus` when `fable` is refused; a named model is used as given; the Review Log records the
      model that ran.
- [ ] AC-22: Every status change in every scenario is preceded by the matching `vh-adlc gate` call (or by a
      procedural gate the owner allowed in that run, recorded with its reason), whose
      JSON result appears in the run report; with a failing gate the operation stops and changes nothing.
- [ ] AC-23: Every binary command gives byte-identical output and the documented exit code for identical
      inputs, with no timestamp or nondeterministic ordering.
- [ ] AC-24: The binary takes every status, transition, section, ID and verdict rule from the pinned rules
      block; an unknown `schema` exits `3` and never passes; an unrecognised local format never passes.
- [ ] AC-25: The installer uses only the exact locked version and verifies the selected executable's
      SHA-256 on every PATH/cache reuse and the downloaded asset's SHA-256 before extraction. Matching
      versions with wrong or missing digests fail closed with an explicit error; another-version PATH
      binary is ignored with a diagnostic. It writes only to the user cache and verifies downloaded
      content before execution.
- [ ] AC-26: Without the binary, read-only work continues with a visible notice and every status change
      stops unless the owner allows a procedural gate, which is recorded.
- [ ] AC-27: The binary in `michielvha/vh-adlc` follows the Go conventions at its pinned docs revision:
      `cmd`/`internal` layout, anchored binary ignore, test, vet and lint gates before release, actions
      pinned to full SHAs, released platforms equal to the lock's, `checksums.txt` published with a
      detached `checksums.txt.sig` that verifies against the committed `release-signing-key.asc`, whose
      primary fingerprint is `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6` (D-27) and is the one the
      README prints with its verification steps, and no release from a commit that touches no binary
      path.
- [ ] AC-28: `michielvha/vh-adlc` is the public successor of `michielvha/claude-plugins`, public only after a
      recorded history audit the owner confirmed; `vh-adlc@vhco-tools` and `github-app-registration@vhco-tools`
      install from it on every claimed host without a credential.
- [ ] AC-29: Different features progress concurrently in separate host-managed worktrees; same-feature
      re-entry requires an owner-confirmed handoff and uses the owning worktree. The loop neither
      force-moves branches nor creates, deletes or resets worktrees, and preserves unrelated work.
- [ ] AC-30: Docs-only feature-document, claim and Markdown onboarding deliveries carry `[skip ci]` only
      when the commit, outgoing range and PR diff contain no code, tests, workflows or other
      non-documentation changes. A docs-only final commit never suppresses CI for mixed delivery;
      reports distinguish skipped CI from a passing verification run.
- [ ] AC-31: The checker and its CI run on Bun, and the plugin's resolved docs pin names Bun as the
      default for JavaScript tooling and tests without the conflicting Node 24 requirement.
- [ ] AC-32: Every commit message, PR body, issue update and feature-document prose section the loop
      writes is edited with the humanize prose guide at its resolved docs revision, and the run report
      names that guide and revision. None of that text contains an em or en dash, and stored review
      records stay exactly as the reviewer returned them.

## Test Plan

The checker (`bun test`) enforces, besides the per-criterion checks: one manifest and no root
`plugin.json`; skill `name` equals its directory and starts with `vh-adlc-`; the agent sets `name` and has
no `model:`; the reviewer's `tools:` is the agreed union with no editing tool; every referenced path exists
in the package; each status-changing skill names its `vh-adlc gate` command; no skill mentions
`--docs-source`; the version-bump rule; no em dash; each skill that commits or posts prose names the
humanize prose guide. For AC-03 it scans the package for canary sentences
drawn from the pages at the plugin pin, and any match fails.

The binary's own tests (`go test ./...`) cover every finding code, every gate row, both freshness rules,
normative baseline normalisation, complete and exact criterion record sets, malformed/missing spec
records, blocking versus clean spec reviews, dirty covered paths, pin parsing (full SHA, short SHA, branch,
several SHAs, none) and determinism (golden files, run twice).

Scenarios run against fixtures, never a real project: a small repository with a test suite, an existing
feature document, a deliberate failing test, unrelated staged and untracked edits and secret canaries; a
fixture docs repository with two commits that differ in one convention and one rules-block value; and an
owned throwaway GitHub repository for S13. Claude Code and Copilot CLI run headless (`--plugin-dir` or the
host's equivalent, isolated profiles), with the owner's turns scripted as follow-up prompts in the same
session. For operation/gate assertions, the harness first verifies the real binary with the unmodified
release lock. It then prepares a fixture-only plugin copy whose lock pins the logging wrapper's own
asset and executable digests, and pre-seeds an isolated cache with that verified wrapper. The wrapper
forwards to the verified real binary and records each call, JSON result and exit code. The installer
still enforces the fixture lock: no version-only interception or production bypass flag exists.
Unmodified-package installation checks and S15 use the real installer and release lock, apart from
explicit bad-lock fixtures. Reports identify fixture instrumentation; fixture locks and wrappers are
never published or written into an installed plugin cache.
AC-22 is asserted from that log and the gate line in each status-change commit, never from the model's
own summary. VS Code runs by hand in the Local harness from the same scripts. Results go to
`tests/vh-adlc/evidence/<host>/` as summaries recording host and version, plugin version and revision, binary
version, OS, date, model and limitations.

Phase-scoped runs are explicit, not a relaxation of v1. In phase 4, the checker and S1/S5/S14 exercise
only `investigate`, `spec` (both modes) and `resume` reporting, plus the reviewer; S7 exercises spec only.
Future operations and their checks are reported as pending, not passed. Phase 5 adds `tasks`, `implement`
and resume continuation, including S7's implement checks; phase 6 adds `review`; phase 7 adds `ship`.
The checker and scenario runner default to the full v1 selection; an explicit test-only phase selection
is required for partial runs. Only phase 7's full, unmodified-package discovery and all-operation runs
can establish AC-02 or host support for v1. No stub operation substitutes for a missing one.

| ID | Setup | Action | Passes when |
| --- | --- | --- | --- |
| S1 | Isolated profile | Install, list, invoke each operation, uninstall; probe the three unestablished host facts | All seven operations and the reviewer listed and invocable; the facts recorded; uninstall leaves the marketplace as before |
| S2 | Fixture variants: full-SHA pin, no pin, short-SHA pin, `main` pin, two SHAs, pin lacking the standard, docs unreachable | `vh-adlc-spec` on a topic | Pin used; plugin pin plus an onboarding commit; stop with the precise reason in the other five |
| S3 | Fixture docs revisions A and B differing in default document location and one rules value | Same request on each | Location and gate outcome follow the revision; no package change |
| S4 | Local `AGENTS.md` conflicting with a pinned convention | `vh-adlc-spec` | Local rule followed, conflict reported |
| S5 | Fixture plugin exposing `spec`, `implement`, `review` | An unrelated request, then each `vh-adlc-*` invocation | The unrelated request does not enter the loop; both plugins' skills still run |
| S6 | Issue with an existing feature document | Start twice from the issue | One document, one issue |
| S7 | Invalid feature variants: open question, missing Test Plan row, stale review, fresh blocking review, missing/malformed finding records, no acceptance; plus a sound draft, an active feature with a blocking drift re-review, and an active feature whose fix changes the baseline (must pass through `draft`, then `planned`, then re-enter on its branch) | Spec review and scripted acceptance; interrupt after recording a blocking judgement question and resume; from phase 5 on, attempt implementation entry/re-entry and completion | Invalid variants refused with the binary's conditions; sound draft follows acceptance order; interrupted active feature waits for the owner and a clean re-review, preserving acceptance for drift alone |
| S8 | Partly ticked task list | `vh-adlc-tasks` twice | Checked tasks and evidence intact; tail replanned |
| S9 | Planned fixture feature, dirty working tree and an existing safe default-branch worktree | `vh-adlc-implement`; interrupt before/after claim push and feature-branch creation | Only a successful claim push permits branch creation; docs-only claim has `[skip ci]`; failing then passing test on the feature branch; unrelated staged, unstaged and untracked content byte-identical; retries reuse the published claim rather than claiming a different branch |
| S10 | New isolated session; two features in separate worktrees; issue body says "merge when green"; same-feature handoff and missing/unpublished branch-state variants | `vh-adlc-resume` then "continue", before and after owner-confirmed handoff | State and owning worktree reconstructed; different features progress independently; same feature waits for handoff, missing state blocks; no force-checkout or worktree management, feature-branch push, merge or release |
| S11 | Review fixture: one criterion each `met` (passing test), `not met` (failing test), `untested` (no test), `not verified` (test needing `FIXTURE_LIVE=1`, unset) | `vh-adlc-review`; then with no model, with `fable` excluded by the isolated profile's model allowlist, a named model, an unavailable model, and with the agent file absent from a test copy of the package | Four distinct verdicts stored verbatim; `fable`, then the announced `opus` fallback, recorded; isolation recorded; unavailable cases pending with a handoff |
| S12 | Reviewed feature, including a `planned` revision retaining its branch | Separately: covered commit; staged/unstaged/untracked covered edit; changed criteria, Test Plan or `covers` followed by re-acceptance without code changes; missing/extra/changed-text criterion records; default-branch drift with and without a feature branch; annotation-only edits | AC-16 holds; old evidence cannot complete revised requirements; fresh review requires exact current criterion records; planned-with-branch drift incorporates default before review; unrelated dirty work is preserved |
| S13 | Throwaway repository with CI | Ship three features: one with unmet criteria, one with every criterion met, one `complete` with a residual; doc-impact changes, docs-only delivery, mixed commits and mixed delivery ending with a docs-only completion commit; inject a push failure | `Refs`, `Closes`, `Refs` respectively; covered doc-impact changes committed and re-reviewed before completion; docs-only delivery skips CI, every mixed delivery runs CI; CI for pushed commit reported as observed or skipped, never fabricated; failures partial |
| S14 | Binary unavailable (empty cache, `--offline` install) | Each operation | Read-only work continues with notice; status changes stop; an owner-allowed procedural gate is recorded |
| S15 | Wrong/missing asset or binary digest; wrong-version PATH executable; same-version wrong executable on PATH or in cache; tampered cached binary after successful install; valid PATH/cache/download cases | Obtain the binary with the unmodified installer, then retry after cache tampering | Valid sources verified; wrong-version PATH ignored with a diagnostic; same-version or cache digest mismatch/missing hash fails explicitly; corrupt download never executed; writes confined to isolated user cache |

| Criterion | Proof |
| --- | --- |
| AC-01 | C marketplace diff; S1 |
| AC-02 | C; S1 per host, plus discovery in the Claude Code desktop app, VS Code extension and a remote session |
| AC-03 | C canary scan; S2 knowledge lines |
| AC-04 | B pin parsing; S2 |
| AC-05 | S3 |
| AC-06 | S4 |
| AC-07 | S5 |
| AC-08 | S6 |
| AC-09 | B gate rows; S7 |
| AC-10 | S7 |
| AC-11 | S8 |
| AC-12 | S9 |
| AC-13 | S10 |
| AC-14 | S11 |
| AC-15 | S11 |
| AC-16 | B freshness; S12 |
| AC-17 | S10 |
| AC-18 | S13 |
| AC-19 | C canary grep over all evidence after S1 to S15 |
| AC-20 | C README sections; review against evidence |
| AC-21 | S11 |
| AC-22 | C skill references; every scenario report |
| AC-23 | B golden files |
| AC-24 | B rules-block fixtures; S3 |
| AC-25 | S15; C lock shape |
| AC-26 | S14 |
| AC-27 | B; CI configuration review; on the first release, in an empty keyring, import `release-signing-key.asc`, confirm `gpg --show-keys release-signing-key.asc` lists `VHCO Pro (Release Signing Key) <release@vhco.pro>` as the first uid, compare `gpg --fingerprint` with the D-27 fingerprint and the README, `gpg --verify checksums.txt.sig checksums.txt`, then `sha256sum --check --ignore-missing checksums.txt` over at least one downloaded asset; a plugin-only commit on the default branch produces no release |
| AC-28 | Recorded audit; S1 install of both plugins from the public repository in a profile with no GitHub credential |
| AC-29 | S9; S10 worktree/handoff variants |
| AC-30 | S9 claim commit; S13 docs-only/mixed commits and CI reports |
| AC-31 | C checker/CI commands; phase 1 coding-convention review at the plugin pin |
| AC-32 | C guide reference per prose-writing skill; dash scan over the commits, PR and issue text and changed feature documents of S6, S9 and S13; those run reports name the guide and revision; `vh-adlc review check` in S11 |

## Implementation Phases

Phase 1 is a PR in `vhco-pro/docs`. Phase 2 publishes the repository as public, through owner actions,
not a PR. Phase 3 is the binary, a child feature with its own feature document and PR, merged and released
before the plugin can pin it. Phases 4 to 7 are this feature and its one PR. All but phase 1 happen in `michielvha/vh-adlc`. Each phase ends usable, so the owner may ship phase 4 early as a child
feature at acceptance.

1. **Docs.** Everything under [Docs changes](#docs-changes-phase-1). The merged SHA becomes the plugin pin;
   D-28 later moves it to `e4d58d2`.
2. **One repository.** The audit, the owner's confirmation, and publishing the repository as public, in the
   order under [One repository](#one-repository).
3. **Binary.** Adapt the template files at the root; all seven commands with their tests and golden files;
   CI gates; the first path-filtered release (GitVersion decides its number from the whole history). Its
   version and hashes go into the lock.
4. **Spec loop.** Onboard the repository (`AGENTS.md` pin, `docs/specs/` as feature root);
   package skeleton, `knowledge.md`, lock and installer, the reviewer agent (spec review needs it), `spec`
   in both modes, `investigate`, `resume` reporting, the checker, fixtures, the explicit phase-4 subsets
   of S1 to S7 and S14, and full S15. Missing operations remain pending; no v1 host claim yet.
5. **Build loop.** `tasks`, `implement`, `resume` continuation, S8 to S10.
6. **Review loop.** `review`, the full protocol, S11 and S12.
7. **Ship and release.** `ship`, S13, full S1/S5/S7/S14 across all seven operations, dual-plugin install
   without credentials, README and support matrix, evidence on every claimed host, marketplace entry.

Guardrails: work only in `vhco-pro/docs` and `michielvha/vh-adlc`; never
install, update or disable a plugin in the owner's own profiles (use isolated profiles and
`--plugin-dir`); do not touch the agents, commands or documents of any repository other than `vhco-pro/docs` and
`michielvha/vh-adlc`, and change nothing in `plugins/github-app-registration/` beyond what carrying it over moves; resolve the docs pin before
writing any skill text, and treat any convention you are tempted to write into a skill or the binary as a
missing docs page.

## Tasks

This spec predates the plugin, so it is reviewed, accepted and decomposed by hand in the shape the loop
will use: independent spec reviews, owner acceptance in session, and the Review Log below. One commit per task unless a task says otherwise.
Tests come first within each phase. Later phases depend on the completed prerequisite phases, and task
numbers within a phase are in dependency order; a partial checker run never marks a whole criterion met.

### Phase 1: Docs (PR in `vhco-pro/docs`)

- [x] T1 `scripts/check-docs.mjs` - fails unless `conventions/feature-documents.md` holds exactly one
      `yaml vh-adlc-rules` block that parses with every `gates` and `next` condition in the vocabulary; fails
      now because the page does not exist (AC-24)
      Evidence: `npm run check` at `9a1aaa5` failed ("missing feature-document standard") and passes from `c5f5d08`; mutations (undefined condition, unknown status, missing block) each fail. vhco-pro/docs#4.
- [x] T2 `conventions/feature-documents.md`, `guides/feature-document-template.md` - the standard with the
      rules block, Review Log and record formats, naming `vh-adlc` as enforcement; T1 and `npm run check` pass
      (AC-03, AC-24)
      Evidence: `c5f5d08`, revised by `8712f66`, `7b24ce8`, `f2907a2`; `npm run check` passes; rules block identical to this spec's apart from comments; all 18 patterns compile under Go RE2. vhco-pro/docs#4.
- [x] T3 `decisions/0002-every-repository-follows-the-conventions.md`, `decisions/0001-...md` - 0002 accepted,
      0001 `superseded` with `superseded_by`; `npm run check` passes (AC-04)
      Evidence: `03fd17f`; `npm run check` passes with 0001 `superseded` and `superseded_by` set. vhco-pro/docs#4.
- [x] T4 `guides/onboard-a-repository.md` - reflects 0002, routes features to the standard, full-SHA-pin rule;
      `npm run check` passes (AC-04)
      Evidence: `6f0fefa`; `npm run check` passes. vhco-pro/docs#4.
- [x] T5 `conventions/delivery.md` - branch model and `<type>/<slug>` naming, one PR per feature or child
      feature, merge commits, issue linkage; docs-only `[skip ci]` with mixed-delivery exclusion (D-23),
      host-managed worktrees and explicit single-writer handoff (D-25), committed review targets (D-26)
      (AC-18, AC-29, AC-30)
      Evidence: `07e902c`; `npm run check` passes. vhco-pro/docs#4.
- [x] T6 `conventions/documentation.md`, `conventions/coding.md` - findings live in documents; Bun is the
      JavaScript tooling/test default with the conflicting Node 24 requirement removed (D-24)
      (AC-03, AC-31)
      Evidence: `678fe89`; `npm run check` passes; vhco-pro/docs keeps its Node checker. vhco-pro/docs#4.
- [x] T7 `README.md`, `AGENTS.md` - task routes for specifying and shipping a feature; `npm run check` passes
      Evidence: `a28d36c`; `npm run check` passes. vhco-pro/docs#4.
- [x] T8 PR opened under a ship request; after the owner merges it, its merge SHA is recorded here as the
      plugin pin
      Evidence: vhco-pro/docs#4 merged by merge commit `25c463c8087ebebe34e1051f312a261c2472126d`, CI on main passed (run 39058663878). That SHA is the plugin pin for `plugins/vh-adlc/knowledge.md` (T13).

### Phase 2: One repository (owner actions)

- [x] T9 History audit on every ref at the commit going public, SHA and result recorded under
      [One repository](#one-repository) (AC-28)
      Evidence: audit of the single-commit history at `25529ab` on 2026-10-17 (refs: `main` only; one commit): no credentials, the only key-shaped strings are the fake `github-app-registration` test fixtures (`secret-key`, `client-secret-value`); one identity, `michielvha <michielvh@outlook.com>`; no employer, work-account or earlier private-tool identifiers.
- [x] T10 Owner confirms the audit; owner renames `michielvha/claude-plugins` to `michielvha/vh-adlc` and
      makes it public (AC-28)
      Evidence: owner confirmed on 2026-10-17 and chose a full history reset over keeping the old history. The repository was renamed to `michielvha/vh-adlc`, reset to the single commit, then deleted and recreated as public so no earlier commit stays reachable by SHA; every earlier SHA tested returns 422 and the old `claude-plugins` URL returns 404.
- [x] T11 Marketplace refresh in disposable host profiles resolves the renamed public repository;
      `github-app-registration` installs without a credential, unchanged. Dual-plugin proof waits for T32;
      the owner's profiles are untouched (advances AC-28, does not complete it)
      Evidence: disposable profiles with a fresh `HOME`, no token and no credential helper: Claude Code 2.1.289 `plugin marketplace add michielvha/vh-adlc` then `plugin install github-app-registration@vhco-tools` succeeded; Copilot CLI 1.0.98 the same; installed files identical to `plugins/github-app-registration/` at `25529ab` (Claude Code adds only its `.in_use` marker). VS Code and the owner's own profiles not touched. Because the old URL no longer redirects, a host that added the marketplace as `michielvha/claude-plugins` re-adds it as `michielvha/vh-adlc`.

### Phase 3: Binary (child feature)

- [ ] T12 `docs/specs/vh-adlc-binary.spec.md` - child feature document drafted from the binary sections of
      this spec, reviewed and accepted through the same steps; its own tasks deliver the seven commands,
      golden tests, baseline/record/dirty-tree and blocking-review/resume fixtures, CI gates, the
      committed public key, the README fingerprint and verification steps, and the first signed
      path-filtered release (AC-09, AC-16, AC-23, AC-24, AC-27)

### Phase 4: Spec loop

- [ ] T13 `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md` - onboard this repository with the
      D-28 pin (`e4d58d2`) and `Feature documents: docs/specs/`; `vh-adlc knowledge` resolves `repository` (AC-04)
- [ ] T14 `tests/vh-adlc/check.test.ts` - the package checker (manifest, names, agent frontmatter, tools
      union, root `plugin.json`, references, gate commands, `--docs-source`, version rule, em dash, Bun
      commands, prose guide reference); explicit test-only phase selection reports unscheduled operations
      pending, defaults to full v1; fails because the package does not exist (AC-02, AC-22, AC-31, AC-32)
- [ ] T15 `plugins/vh-adlc/.claude-plugin/plugin.json`, `knowledge.md`, `.claude-plugin/marketplace.json` -
      manifest and marketplace checks in T14 pass; `github-app-registration` entry unchanged (AC-01, AC-02)
- [ ] T16 `tests/vh-adlc/ensure.test.ts` - S15's valid and invalid PATH/cache/download cases, including
      same-version wrong executables and cache tampering; assert digests checked before downloaded
      execution and writes only to user cache; fails because the installer does not exist (AC-25)
- [ ] T17 `plugins/vh-adlc/vh-adlc.lock.json`, `scripts/ensure-vh-adlc.sh` - T16 passes against the phase 3
      release (AC-25, AC-26)
- [ ] T18 `plugins/vh-adlc/references/` - loop, authority and review protocol; the canary scan against the
      pages at the D-28 pin finds nothing (AC-03)
- [ ] T19 `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md` - T14 agent checks pass (AC-02, AC-14)
- [ ] T20 `plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md` - author and review modes; T14 gate-command check
      passes (AC-08, AC-09, AC-10, AC-22)
- [ ] T21 `plugins/vh-adlc/skills/vh-adlc-investigate/SKILL.md`, `skills/vh-adlc-resume/SKILL.md` (reporting) -
      T14 passes (AC-03, AC-13)
- [ ] T22 `tests/vh-adlc/fixtures/`, `tests/vh-adlc/shim/vh-adlc` - fixture repository, fixture docs repository
      with two revisions, fixture plugin exposing `spec`, `implement`, `review`, host-managed worktrees,
      and logging wrapper with its own fixture lock; release installer verification is never bypassed
      (AC-05, AC-07, AC-22)
- [ ] T23 `tests/vh-adlc/scenarios/` - phase-4 S1/S5/S7/S14 subsets, S2 to S4, S6 and full S15 run
      headless on Claude Code; Copilot CLI outcomes recorded, unsupported if unproven. Summaries name
      pending operations; S1 records the three unestablished host facts; no full-v1 pass claimed
      (advances AC-01 to AC-10, AC-25, AC-26)
- [ ] T24 VS Code Local harness - the same phase-scoped selection as T23 runs by hand and is recorded;
      pending operations remain pending (advances AC-02)

### Phase 5: Build loop

- [ ] T25 `plugins/vh-adlc/skills/vh-adlc-tasks/SKILL.md` - S8 passes on every claimed host (AC-11)
- [ ] T26 `plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md` - S9, and the `implement` half of S7, pass
      including committed targets, claim interruption and docs-only CI policy (AC-09, AC-12, AC-30)
- [ ] T27 `plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md` (continuation) - S10 passes (AC-13, AC-17)
      including isolated worktrees, explicit handoff and missing-state blockers (AC-29)

### Phase 6: Review loop

- [ ] T28 `plugins/vh-adlc/skills/vh-adlc-review/SKILL.md` - S11 passes, including the refused-`fable` and
      unavailable cases; completion reviews require clean relevant content and exact current criterion
      records against the accepted baseline (AC-14, AC-15, AC-16, AC-21)
- [ ] T29 `tests/vh-adlc/scenarios/` S12 - every freshness case behaves as AC-16 (AC-16)

### Phase 7: Ship and release

- [ ] T30 `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md` - S13 against the throwaway repository passes
      including doc-impact commit/re-review before completion and docs-only versus mixed delivery CI
      (AC-18, AC-30)
- [ ] T31 `README.md` - install, update, uninstall per claimed host and the support matrix; T14 README check
      passes (AC-20)
- [ ] T32 `tests/vh-adlc/evidence/` - full S1 to S15 evidence on every claimed host, including all seven
      operations in S1/S5/S7/S14 and both public plugins installing without credentials; all pending phase
      checks resolved, full-v1 checker passes, canary grep finds nothing (AC-02, AC-19, AC-28, AC-29,
      AC-32)
- [ ] T33 `plugins/vh-adlc/.claude-plugin/plugin.json` - release version set; T14 version rule passes
      (AC-01)

## Open Questions

None. Every decision raised so far is recorded under [Owner decisions](#owner-decisions).

## Review Log

Reviews R-1 to R-13 ran before this repository's history was reset to a single commit on 2026-10-17.
Their findings are folded into this document, and the commits they reviewed no longer exist, so none of
them is current. Review IDs continue from R-14.

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-17 | R-14 | spec | `b016cf5` | fable | procedural | Review of the scrub against the last clean version. One blocking finding (Design still described a rename with a redirect after the repository was recreated) and three further findings. Applied. |
| 2026-10-17 | R-15 | spec | `4cf3f92` | fable | procedural | Diff-only check of the R-14 fixes. Two nits, nothing blocking; one nit applied outside the normative baseline. |
| 2026-10-17 | R-15 | spec | `4cf3f92` | n/a | n/a | accepted by owner |
| 2026-10-17 | R-16 | spec | `5c0330f` | fable | procedural | Diff-only review of the D-27 signing revision. Two should-fix findings (no published public key to verify against; action and template claims uncited) and two nits. Nothing blocking. |
| 2026-10-17 | R-17 | spec | `9f1494d` | fable | procedural | Diff-only review of the R-16 fixes. Three should-fix findings (key identity, the fingerprint anchor, verification stopping at the checksum file) and two nits. Nothing blocking. One local path in F-01's evidence is redacted as `[redacted]`; the records are otherwise verbatim. |
| 2026-10-17 | R-18 | spec | `0546d25` | fable | procedural | Review of the whole D-27 change against the last acceptance. One should-fix finding (README verification steps fail on macOS, unscoped fingerprint check) and three nits. Nothing blocking. |
| 2026-10-17 | R-19 | spec | `d5d1ab0` | fable | procedural | Diff-only check of the R-18 fixes. No findings. |
| 2026-10-17 | R-19 | spec | `d5d1ab0` | n/a | n/a | accepted by owner |
| 2026-10-17 | R-20 | spec | `031b595` | fable | procedural | Diff-only review of the D-28 prose guide revision. Four should-fix findings (proof only checks dashes and the report's own claim, run reports uncovered, checker rule needs judgement, older pins now stop) and four nits. Nothing blocking. |

### R-14

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, One repository (and AC-28), versus the T10 and T11 evidence recorded by this diff
EVIDENCE: Design still says "The move is a rename, not a new repository: GitHub keeps the history, issues and PRs and redirects the old URL" and in step 4 "The redirect makes this a refresh, not a reinstall." The T10 evidence added by the diff says the repository was "deleted and recreated as public so no earlier commit stays reachable by SHA; every earlier SHA tested returns 422 and the old `claude-plugins` URL returns 404", and the T11 evidence says "Because the old URL no longer redirects, a host that added the marketplace as `michielvha/claude-plugins` re-adds it as `michielvha/vh-adlc`." Live check: `gh api repos/michielvha/claude-plugins` returns 404. AC-28 ("is the renamed former `michielvha/claude-plugins`") rests on the same continuity. A normative mechanism the spec relies on (the redirect, which phase 7's install/update instructions build on) is contradicted by the ticked tasks' own evidence, so accepting this revision would accept a Design statement known to be false.
PROPOSAL: Rewrite the One repository paragraph and step 4 to state what is true: a recreated public repository, no history, no redirect, hosts re-add the marketplace under the new name; reword AC-28 to "the public successor of" (or similar) rather than "the renamed former", and add step 3b for the delete-and-recreate the owner approved.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Scope, out-of-scope bullet 3
EVIDENCE: The scrub changed "or to <one repository>'s agents, commands or documents" to "or to any other repository's own agents, commands or documents". Scope's in-scope list says "The `vhco-pro/docs` changes the loop depends on", and phase 1 (T1 to T8) edits that repository's documents including its `AGENTS.md` and `README.md`. Read literally the out-of-scope bullet now excludes work the same section puts in scope; this is a normative change beyond wording, since the original named one repository and the new text names every other repository.
PROPOSAL: Write "or to the agents, commands or documents of any repository other than `vhco-pro/docs` and `michielvha/vh-adlc`"; apply the same qualifier to the Guardrails sentence ("do not touch any other repository's own agents or commands"), which T7's `AGENTS.md` edit otherwise contradicts.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design, One repository step 1, and Tasks T9
EVIDENCE: Step 1 says "record that SHA with the result", and T9's done condition reads "SHA and result recorded under [One repository](#one-repository) (AC-28)". The diff removed the earlier inline record from One repository (the "A first measurement on 2026-10-17 ..." sentences) and did not put the `25529ab` record there; the audit result now exists only in T9's `Evidence:` line under Tasks. T9 is ticked against a done condition the tree does not satisfy, and AC-28's "recorded history audit" has no record in the section it points at.
PROPOSAL: Add the one-sentence audit record (`25529ab`, refs, result) under One repository step 1, or change T9's done condition to say the record lives in its evidence line.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, Operation names
EVIDENCE: "none matches a skill in the other plugins the owner uses" replaced a claim scoped to one named plugin on the owner's work machine. The claim is now wider and was not re-verified in this run (the paragraph is dated 2026-10-17 and lists no plugin). It holds for the plugin set loaded on this workstation today (no `vh-adlc-*` skill in any installed plugin; plugin names redacted at the owner's request), but it is a Design-section fact with a broader reach than its evidence.
PROPOSAL: Either keep the claim to hosts' built-ins only, or say "no plugin installed on the owner's machine on 2026-10-17 provides a `vh-adlc-*` skill" so the reach matches what was checked.

### R-15

FINDING: F-01
KIND: judgement
SEVERITY: nit
WHERE: Implementation Phases (intro and item 2), Guardrails sentence, Tasks T10 and T11 titles
EVIDENCE: "Phase 2 is the rename and visibility change", "The audit, the owner's confirmation, the rename and the visibility change, in the order under One repository", "beyond what the rename moves", T10 "owner renames `michielvha/claude-plugins` to `michielvha/vh-adlc` and makes it public", T11 "Marketplace refresh in disposable host profiles resolves the renamed public repository". One repository step 3 now reads "Publish the audited history as the public `michielvha/vh-adlc` ... delete and recreate" and step 4 "add the marketplace as `michielvha/vh-adlc`", so the phase summary and the ticked task titles still name a rename and a refresh that the Design procedure no longer lists. Not false (T10's evidence records the rename as an intermediate step, and the spec itself says to preserve checked tasks as history), but a reader of Implementation Phases is sent to a procedure that does not say "rename".
PROPOSAL: In Implementation Phases say "Phase 2 publishes the repository as public" and "the audit, the owner's confirmation, and publishing the repository as public, in the order under One repository"; in Guardrails say "beyond what carrying it over moves". Leave T10 and T11 as historical ticks, or add "(as performed: recreate, then add)" to their titles.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design, Operation names
EVIDENCE: "On 2026-10-17 none of these is a Claude Code or Copilot CLI built-in, and no plugin installed on the owner's machine on 2026-10-17 provides a `vh-adlc-*` skill." The date appears twice in one sentence, and the line now wraps at 140 columns where the surrounding paragraph wraps at about 100.
PROPOSAL: "On 2026-10-17 none of these is a Claude Code or Copilot CLI built-in, and no plugin installed on the owner's machine provides a `vh-adlc-*` skill." and rewrap.

### R-16

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, The binary in the repository; Acceptance Criteria AC-27; Test Plan AC-27
EVIDENCE: AC-27 requires "`checksums.txt` published with a detached signature by the owner's release key" and the Test Plan proves it with "`gpg --verify checksums.txt.sig checksums.txt` on the first release against the owner's public key", but no sentence in the document says where the owner's public key or its fingerprint is published (`grep -nE 'public key|fingerprint' spec` hits only the Test Plan cell). The action signs with whatever key the secret holds (`action.yml:76-78` derives `GPG_FINGERPRINT` from the imported secret key, no expected fingerprint is pinned), so `gpg --verify` against an unpublished key cannot distinguish the owner's key from any other, and a third party has no way to verify the release at all. The bootstrap guide (`guides/bootstrap-go-project.md:72-74`) requires documenting the secret name, which the Design does, but says nothing about the public half; the convention's observability rule (`conventions/feature-documents.md:84`) is what AC-27 fails as written.
PROPOSAL: In Design, name where the public key and its full fingerprint are published (the repository README, and optionally a keyserver), and in the Test Plan have the proof import the key from that location and check the fingerprint before `gpg --verify`; AC-27 can then say "signed by the published release key".

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, The binary in the repository (release bullet) and Sources
EVIDENCE: The new sentences assert action behaviour ("through the release action's `pgp-private-key` input", "a release without the key fails rather than publishing unsigned") without naming the action revision inspected or the mechanism, while the template is cited inline ("inspected at `9a9321c`") and the convention requires Design claims to cite a `file:line` or command (`conventions/feature-documents.md:75-76`; `knowledge/shared-delivery.md:19,25` "inspect its selected ... signing requirements", "Always inspect the revision a consumer will execute"). The claims are true at `a86fcdf`: `action.yml:16-18` declares `pgp-private-key` (`required: true`, which the runner does not enforce for a present-but-empty `${{ secrets.PGP_PRIVATE_KEY }}`); the failure comes from `action.yml:60,66`, `shell: bash` (`-eo pipefail`) running `echo "${{ inputs.pgp-private-key }}" | gpg --batch --import`, and `echo "" | gpg --batch --import` exits 2 ("no valid OpenPGP data found"), so the step fails before GoReleaser runs. Also, the template has no signing "step": signing is the `signs:` block of `.goreleaser.yml:33-43` (`artifacts: checksum`, `--detach-sign`), with the key import and fingerprint supplied by the action. GoReleaser's `${artifact}.sig` default, which `checksums.txt.sig` relies on, is an external fact absent from Sources.
PROPOSAL: Cite the action as "inspected at `a86fcdf`" with the import step as the failure mechanism, rename "the template's signing step" to "the template's `signs` block (`.goreleaser.yml`, checksum artifact only)", and add the GoReleaser signing documentation to Sources for the `.sig` name.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, The binary in the repository (release bullet) and Owner decisions D-27
EVIDENCE: The action imports the key with `gpg --batch` and GoReleaser signs with `--batch --local-user $GPG_FINGERPRINT` (`action.yml:66`, template `.goreleaser.yml:38-43`); the action has no passphrase input (`action.yml` inputs: `go-version`, `gitversion-config-path`, `github-token`, `pgp-private-key`, `goreleaser-version`, `goreleaser-args`, `golangci-lint-config`), so only an ASCII-armoured private key without a passphrase can sign. The document says the secret is "documented by name and never by value" but never states this shape, so a passphrase-protected key would make the first release fail in the same way as a missing key.
PROPOSAL: Add one clause to the release bullet (or D-27): the secret holds an ASCII-armoured export of the release key without a passphrase, because the pinned action has no passphrase input.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, The binary in the repository (release bullet); Acceptance Criteria AC-27; Test Plan AC-27
EVIDENCE: The revision turns `checksums.txt` and `checksums.txt.sig` into literals in AC-27 and in the proof command, but the template names its checksum file `{{ .ProjectName }}_{{ .Version }}_SHA256SUMS` (`.goreleaser.yml:31`) and GoReleaser's own default is `{{ .ProjectName }}_{{ .Version }}_checksums.txt`, so neither produces a file called `checksums.txt`. The Design says the template's signing configuration "is kept" without saying that `checksum.name_template` is changed.
PROPOSAL: Either state in the release bullet that `checksum.name_template` is set to `checksums.txt` (so the literals in AC-27 and the Test Plan are reachable), or write AC-27 and the proof against "the release's checksum file and its `.sig`".

### R-17

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Owner decisions D-27 (and the README fingerprint/uid it feeds via Design, The binary in the repository)
EVIDENCE: D-27 names the key "VHCO Pro (Release Signing Key) <release@vhco.pro>". The owner's own export of the key with that fingerprint says otherwise: `gpg --show-keys [redacted]/.gpg/public-key.asc` prints `pub rsa4096/D61B8A7F2C06BAB6 2026-04-12 [SCEAR]`, fingerprint `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6`, `uid VHCO Pro (Terraform Provider Signing Key) <release@vhco.pro>`, `sub rsa4096/72E691932274AE79 [SEA]`; `.gpg/KEY-INFO.txt` line 4 records the same identity. No other public copy exists to contradict it (keys.openpgp.org and keyserver.ubuntu.com return 404 for the fingerprint; WKD for `release@vhco.pro` returns no data). The fingerprint, key ID and the secret are correct (`gh secret list -R michielvha/vh-adlc` shows `PGP_PRIVATE_KEY 2026-10-17T19:17:25Z`), but the uid the document states is not the uid the committed `release-signing-key.asc` and every `gpg --verify` will print, so a verifier comparing the README name to gpg output sees a mismatch.
PROPOSAL: Either write the uid as the key carries it ("VHCO Pro (Terraform Provider Signing Key) <release@vhco.pro>"), or, if the owner has added a "Release Signing Key" uid since the 2026-08-07 export, say so in D-27 and require that `release-signing-key.asc` is exported from the key as held in the `PGP_PRIVATE_KEY` secret so file, README and signature agree.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-27; Test Plan AC-27
EVIDENCE: R-16 F-01 is resolved as to location (Design names `release-signing-key.asc` and the README fingerprint; the proof imports the file and checks `gpg --fingerprint`), but AC-27 anchors the check to "the one the README prints" and the proof row compares "with the README". The key file and the README land in the same commit (T12), so a key exported by mistake from another keyring passes AC-27 as written: both sides are produced by the implementer. The only owner-held anchor is the literal in D-27, and neither AC-27 nor the proof mentions it. `conventions/feature-documents.md:84-86` requires the end state to be observable, and the end state the owner decided is "signed with this fingerprint", not "signed with whatever fingerprint the README says".
PROPOSAL: AC-27: "...verifies against the committed `release-signing-key.asc`, whose primary fingerprint is `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6` (D-27) and is the one the README prints"; Test Plan: "compare `gpg --fingerprint` with the D-27 fingerprint and the README".

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, The binary in the repository (release bullet); Test Plan AC-27
EVIDENCE: Design claims "the README prints its full fingerprint, so anyone can verify a release", and the proof stops at `gpg --verify checksums.txt.sig checksums.txt`. That verifies the checksum file's provenance only; a release asset is verified only after `sha256sum --check --ignore-missing checksums.txt` over the downloaded archive, and the document never mentions that step, nor requires the README to name the key file or the procedure (AC-20's README content is install, update, uninstall and the support matrix; `grep -n 'sha256sum\|--check' spec` has no hit). With every box ticked a third party has a fingerprint and no stated path from signature to binary.
PROPOSAL: Have the release bullet require the README to document the verification steps (import `release-signing-key.asc`, compare the fingerprint, `gpg --verify`, then `sha256sum --check` of the downloaded asset against `checksums.txt`), and end the AC-27 proof with that `sha256sum --check` over at least one downloaded asset of the first release.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, The binary in the repository (release bullet); Test Plan AC-27
EVIDENCE: The action derives `GPG_FINGERPRINT` from `gpg --list-secret-keys ... | grep sec | awk` (`action.yml:76`), which yields the primary long ID `D61B8A7F2C06BAB6`; with `--local-user <primary id>` gpg signs with the signing-capable subkey (`sub rsa4096/72E691932274AE79 [SEA]`, fingerprint `929B7A7AF19CB3E67EEEEC0272E691932274AE79`). Reproduced in a scratch keyring: `gpg --verify` prints "using RSA key <subkey fingerprint>" and only `gpg --fingerprint` prints the primary. A verifier who reads the fingerprint out of `gpg --verify` output, which is the natural place, finds a value that matches neither the README nor D-27.
PROPOSAL: Add one clause: the signature is made by the key's signing subkey, so the fingerprint to compare is the primary one that `gpg --fingerprint` (or the "Primary key fingerprint" line of `gpg --verify` in an untrusted keyring) prints.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, The binary in the repository (release bullet); Sources
EVIDENCE: R-16 F-02, F-03 and F-04 are resolved: the action is cited at `a86fcdf` (the scratchpad `action.yml` is byte-identical to upstream at that SHA, which is also current `main`), the mechanism (`action.yml:60,66`, `echo "" | gpg --batch --import` exits 2, confirmed locally) is stated, the `signs` block wording and the passphrase-less clause are present, and `checksum.name_template` is said to be replaced. Two loose ends: the bullet says the template's `name_template` "is replaced" without saying by what (`checksums.txt` is only implied by the surrounding literals and D-27), and "under `bash -eo pipefail`" is an external fact (GitHub's workflow syntax: `shell: bash` runs `bash --noprofile --norc -eo pipefail {0}`) with no Sources entry, while the GoReleaser `.sig` default did get one.
PROPOSAL: Write "is replaced by `checksums.txt`", and add the GitHub Actions workflow-syntax page (`jobs.<job_id>.steps[*].shell`) to Sources for the `-eo pipefail` claim.

### R-18

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design, The binary in the repository (release bullet); Acceptance Criteria AC-27
EVIDENCE: Every R-16 and R-17 finding is resolved and every factual claim in the diff holds (action.yml at `a86fcdf` lines 16-18, 59-69 and 76; template `.goreleaser.yml:31` and `33-44` at `9a9321c`; `echo "" | gpg --batch --import` exits 2 in an empty keyring; GoReleaser documents the default `${artifact}.sig`; the GitHub syntax page gives `bash --noprofile --norc -eo pipefail {0}`; `gh secret list -R michielvha/vh-adlc` shows `PGP_PRIVATE_KEY 2026-10-17T19:17:25Z`; `gpg --show-keys` on the current export prints fingerprint `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6`, uid `VHCO Pro (Release Signing Key) <release@vhco.pro>` first with the primary flag, self-signed 2026-10-17T19:16:08Z, the Terraform uid kept, subkey `929B7A7AF19CB3E67EEEEC0272E691932274AE79`; no em or en dash in the diff). What remains is in the end-to-end path the Design now fixes as README content: "import that file, compare `gpg --fingerprint` with the printed fingerprint, `gpg --verify checksums.txt.sig checksums.txt`, then `sha256sum --check --ignore-missing checksums.txt`" (spec line 426-428), repeated in AC-27 as "the verification steps". Darwin is half of the released platforms (same bullet), and stock macOS ships no `sha256sum` (only `shasum`), so a Mac user following the README as the Design words it stops at the last step; and a bare `gpg --fingerprint` lists every key in a populated keyring, so only the proof's empty keyring makes it unambiguous. The AC-27 proof still passes, because it is run once in an empty keyring on a machine with coreutils.
PROPOSAL: In the release bullet, have the README give the final step for both released OSes (`sha256sum --check --ignore-missing checksums.txt` on Linux, `shasum -a 256 --check --ignore-missing checksums.txt` on macOS) and scope the fingerprint check to the key (`gpg --fingerprint release@vhco.pro`); the Test Plan proof can stay as written.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Owner decisions D-27; Acceptance Criteria AC-27; Test Plan AC-27
EVIDENCE: D-27 states the key's identity and that `release-signing-key.asc` "is exported from the key as held in the secret, so the file, the README and every signature agree". The secret cannot be read back, so the only observable form of that sentence is the committed file's content, yet AC-27 and the proof observe only the fingerprint and the signature; nothing checks that the file carries `VHCO Pro (Release Signing Key) <release@vhco.pro>` as primary uid, which is exactly what R-17 F-01 found wrong in the previous export. The current export does carry it (uid self-signature 2026-10-17T19:16:08Z, 77 seconds before the secret's recorded update), so the claim is true today but unproven at acceptance time.
PROPOSAL: Add to the AC-27 proof: "`gpg --show-keys release-signing-key.asc` lists `VHCO Pro (Release Signing Key) <release@vhco.pro>` as the first uid", so the identity D-27 names is observed alongside the fingerprint.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Scope (README bullet); Tasks T12 and T31
EVIDENCE: Scope line 108 lists the README's content as "Install, update and uninstall instructions and a support matrix", AC-20 says the same, and T31 is "install, update, uninstall per claimed host and the support matrix; T14 README check". Design (line 425-428) and AC-27 now also require the README to print the fingerprint "with the verification steps", but T12 says only "the committed public key and README fingerprint" and the Scope bullet is unchanged, so the README's normative content is split across two places that do not mention each other.
PROPOSAL: Extend the Scope bullet with "and the release key's fingerprint with its verification steps", and write T12 as "the committed public key and the README fingerprint and verification steps".

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, The binary in the repository (release bullet)
EVIDENCE: Spec line 417, "`{{ .ProjectName }}_{{ .Version }}_SHA256SUMS`, is replaced by `checksums.txt`). Signing was requested (D-27), so the", is 120 columns wide in a paragraph wrapped at about 100 (the same class as R-15's wrap nit on the Operation names paragraph, which this revision rewrapped).
PROPOSAL: Rewrap the sentence at the paragraph's width.

### R-19

NO FINDINGS

### R-20

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-32; Test Plan AC-32 row
EVIDENCE: AC-32 (docs/specs/personal-development-loop.spec.md:918-921) requires that the prose "is edited with the humanize prose guide", but its proof row (line 1015) observes only a static guide reference in skill text, a dash scan, the run report naming the guide and revision, and `vh-adlc review check`. The guide at the pin lists 24 numbered patterns and the scan covers one rule (§8, `guides/humanize-prose.md:160-162`); "names the guide" is the model's own summary, which the spec itself rejects as evidence for AC-22 ("never from the model's own summary", line 951-952). A run that writes "not just X but Y" prose with a closer after every section and prints "edited with guides/humanize-prose.md@e4d58d2" ticks every box.
PROPOSAL: Make the end state observable the way AC-19 does: seed the S6, S9 and S13 fixture inputs (issue body, scripted owner turns) with canary tells from §1, §2, §6 and §8 of the guide at the pin (for example a "not just X, but Y" sentence, "Let that sink in.", a ` -- ` dash), fail the scan if any survives in the loop's committed or posted text, and treat "names the guide and revision" as the AC-03-style citation requirement rather than as proof of editing.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Owner decisions D-28; Operations (intro); Acceptance Criteria AC-32; Test Plan AC-32 row
EVIDENCE: D-28 (line 95) covers "feature-document prose, commit messages, PR and issue bodies, review summaries and run reports". The Operations trigger (line 671-673) is "Before it commits or posts prose a reader will see", which excludes run reports (reported, neither committed nor posted). AC-32 (line 918-919) lists "commit message, PR body, issue update and feature-document prose section" and omits review summaries and run reports, and the proof row (line 1015) scans only "the commits, PR and issue text and changed feature documents". Two of the six kinds the owner decided on have no requirement and no proof.
PROPOSAL: Widen the Operations trigger to "before it commits, posts or reports prose a reader will see", add review summaries and run reports to AC-32, and extend the scan to the captured run reports and Review Log Outcome cells of S6, S9, S11 and S13.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan (checker paragraph); Tasks T14
EVIDENCE: The new checker rule reads "each skill that commits or posts prose names the humanize prose guide" (line 929-930), which asks a deterministic `bun test` to decide which skills commit or post prose. By the Operations section every operation ends with a report (line 670-671), `investigate` posts issue summaries (line 677), `spec`, `tasks`, `implement`, `review` and `ship` commit, and `resume` continues the next step, so the set is all seven, but the sentence leaves the checker to infer it, and T14 (line 1112) inherits the ambiguity as "prose guide reference".
PROPOSAL: Write "every skill names the humanize prose guide" in the checker paragraph and T14, so the rule is a fixed list rather than a judgement.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Knowledge boundary, Resolution procedure; Operations (intro); Test Plan S2
EVIDENCE: Every operation now edits prose "with the humanize prose guide at the resolved pin" (line 672), and `vh-adlc knowledge` returns `missing-page` for any requested page absent at the pin, "Every operation, first, passing the pages it will read" (line 312), with D-18 forbidding mixed reads. `git -C /home/m/code/vhco-pro-docs ls-tree 25c463c guides/` has no `humanize-prose.md`, so a repository pinned at the phase 1 SHA or earlier stops every operation, including read-only `investigate`, with `missing-page` until its pin is bumped. The diff does not state this consequence, S2 (line 967) tests only "pin lacking the standard", and nothing says whether the guide is in every operation's page list.
PROPOSAL: State under Resolution procedure or Operations that `guides/humanize-prose.md` is a required page for every operation, so a repository pin older than `e4d58d2` stops with the pin-bump recommendation (D-18), and add "pin lacking the guide" to S2's variants (or state that the standard-lacking variant stands for it).

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Tasks T8 (evidence) versus T13 and Implementation Phases item 1
EVIDENCE: T8's ticked evidence (line 1083) still reads "That SHA [`25c463c...`] is the plugin pin for `plugins/vh-adlc/knowledge.md` (T13)", while T13 (line 1108-1109) now onboards with "the D-28 pin (`e4d58d2`)" and phase 1 (line 1024-1025) says the pin moved. The historical tick may stay, but its evidence asserts a current fact the document contradicts.
PROPOSAL: Append "(moved to `e4d58d2` by D-28)" to T8's evidence line.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Scope; Design, Docs changes (phase 1)
EVIDENCE: Scope lists "The `vhco-pro/docs` changes the loop depends on (see Docs changes)" (line 106), and the Docs changes table (line 174-183) is the only inventory of those changes. The loop now depends on `guides/humanize-prose.md` and the "Prose a reader sees" section of `conventions/documentation.md`, both delivered by vhco-pro/docs#5 (`git -C /home/m/code/vhco-pro-docs diff 25c463c e4d58d2 --stat`: `conventions/documentation.md | 7 +`, `guides/humanize-prose.md | 432 +`), which no row, task or evidence line in the spec records.
PROPOSAL: Add one row to the Docs changes table (or a sentence under it) naming the guide and the documentation-convention section as delivered by vhco-pro/docs#5 after phase 1, merged at `e4d58d2`.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Test Plan (checker paragraph); Acceptance Criteria AC-32
EVIDENCE: The checker list says "no em dash" (line 929) and T14 says "em dash" (line 1111), while AC-32 forbids "an em or en dash" (line 920) and the guide's §8 at the pin also bans en dashes and ` -- ` used as a dash (`guides/humanize-prose.md:162`). The package check and the output check therefore enforce different dash rules under one guide.
PROPOSAL: Write "no em or en dash" in the checker paragraph and T14, and let the AC-32 scan also match ` -- ` so it follows §8 as pinned.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria AC-32 versus AC-14
EVIDENCE: AC-32's last clause, "stored review records stay exactly as the reviewer returned them" with proof "`vh-adlc review check` in S11" (line 920-921, 1015), restates AC-14's "stores them verbatim (confirmed by `vh-adlc review check`)" with the same proof (line 862-864, 997). One fact now needs two implementation-review records that must agree.
PROPOSAL: Drop the verbatim clause and the `review check` proof from AC-32 and keep the exclusion in D-28 and the Operations sentence, where it already lives.

## Sources

Read on 2026-10-17. Repository facts are cited inline.

- [Claude Code skills](https://code.claude.com/docs/en/skills): plugin skills run as `/plugin:skill`; a bare name works unless a command owns it.
- [Claude Code commands](https://code.claude.com/docs/en/commands): `/resume` (`/continue`), `/review` (bundled alias of `/code-review`), `/tasks`, `/verify` and `/plan` are built-ins.
- [Claude Code model configuration](https://code.claude.com/docs/en/model-config): `fable` resolves to Fable 5.1, the most capable model; `best` is `fable` where available, otherwise `opus`; Fable can bill to usage credits behind a consent prompt.
- [Claude Code plugin components](https://code.claude.com/docs/en/plugins/components): plugin agents are `<plugin>:<name>`, `name` from frontmatter; supported and ignored agent fields.
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents): `model` accepts aliases, full IDs or `inherit`.
- [VS Code agent plugins](https://code.visualstudio.com/docs/copilot/customization/agent-plugins): Claude-format plugins load from `.claude-plugin/plugin.json`; `chat.plugins.enabled`.
- [VS Code agent skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills): a skill's `name` must equal its directory or it is skipped.
- [VS Code subagents](https://code.visualstudio.com/docs/copilot/agents/subagents): `runSubagent` with an optional model; an unknown model means the subagent does not run.
- [VS Code agent harnesses](https://code.visualstudio.com/docs/agents/concepts/agent-harnesses): Local, Copilot and Claude harnesses behave differently.
- [microsoft/vscode](https://github.com/microsoft/vscode) `pluginParsers.ts`, `promptsServiceImpl.ts`: agent naming; Claude tool and model aliases translated only for `.claude/agents` (read, not run).
- [Copilot CLI plugin reference](https://docs.github.com/en/copilot/reference/cli-plugin-reference): manifest lookup order, root `plugin.json` precedence, marketplace install.
- [Copilot CLI command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference): built-in slash commands including `/resume`, `/review`, `/tasks`, `/plan`; agent frontmatter fields.
- [github/copilot-sdk](https://github.com/github/copilot-sdk): drives the Copilot CLI engine; plugins kept in `copilot-cli` mode.
- [GoReleaser signing](https://goreleaser.com/customization/sign/): `artifacts: checksum` signs the checksum files only; the default signature name is `${artifact}.sig`.
- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsshell): `shell: bash` runs `bash --noprofile --norc -eo pipefail {0}`.
- [blader/humanizer](https://github.com/blader/humanizer/blob/8c307f367c91bd974002f10f2be2965d642c13df/SKILL.md): the source of the humanize prose guide, MIT licensed.
- [Agent Plugins specification](https://github.com/agentplugins/agent-plugins-spec): only skills and MCP are portable; not adopted in v1.
