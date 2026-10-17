---
title: "Feature documents"
type: standard
description: "One living document per feature that is both its specification and its plan, with machine-checked rules."
status: active
---

# Feature documents

A feature is one observable outcome with accepted scope and verifiable criteria. Each feature has one
document that is both its specification and its plan. Do not create a companion spec, plan or notes file
for the same feature.

Enforcement: the `vh-adlc` binary reads the [rules block](#rules) at the repository's pinned revision of
this page and decides every status change with `vh-adlc gate`. Until that binary is released, these rules
are checked by hand, and a report says so.

## Location

A repository declares its feature root with one line in its root `AGENTS.md`:

```markdown
Feature documents: docs/specs/
```

Without that line, documents live in `docs/internal/plans/<slug>.md`. Do not move existing documents to
reach a default. A repository that keeps its own document format declares
`Feature document format: local` instead; this standard and its tooling then do not apply there.

## Frontmatter

```yaml
---
status: draft
status_description: "One line on the current state and what it waits for."
issue: https://github.com/OWNER/REPO/issues/42
goal: "One observable outcome."
covers:
  - path/to/implementation/
---
```

`issue: null` marks local-only work; never invent a link. `covers` lists every path whose change can
affect the feature; the document itself is never covered. A document gains `branch` when implementation
starts and keeps it until the feature is closed.

## Statuses

| Status | Meaning | Set by |
| --- | --- | --- |
| draft | Being specified or revised | Authoring, or a normative revision |
| planned | Accepted by the owner and ready to build | The spec review step, after acceptance |
| in-progress | Being implemented on its feature branch | Implementation, as its first commit |
| complete | Every criterion met or residualised, reviewed | Implementation or shipping |
| blocked | Waiting on a named owner decision or external fix | Any step, naming the blocker |
| parked | Deliberately paused | The owner |
| abandoned | Will not be built | The owner |
| superseded | Replaced by another feature, which it links | The owner |
| archived | Closed history | The owner |

`complete` is terminal for its scope; new scope is a new feature. A blocked feature names the smallest
decision that clears it.

## Sections

Required, in this order: Context, Scope, Design, Acceptance Criteria, Test Plan, Tasks, Open Questions and
Review Log. Implementation Phases (before Tasks) and Sources (last) are optional. Delete a section that does
not apply rather than leave it empty, except the required ones, which may say "None.".

Scope, Design, Acceptance Criteria, Test Plan and the `covers` frontmatter form the normative baseline. A
change to any of them is a revision. Before the change is applied, a `planned` or `in-progress` document
moves to `draft` (on its feature branch when it has one); earlier reviews become stale, the owner accepts
again, and the document moves `draft` to `planned` before implementation re-enters through its branch.

Context and Design cite their claims: a `file:line`, or a command and its output, gathered when the claim
was written. Sources lists every external page read, each with the claim it supports.

## Acceptance criteria

```markdown
- [ ] AC-01: The end state, observable without reading the code.
```

State the end state, never a measurement of the problem. A criterion whose subject is a report, a count
or a warning can go green while the problem remains. IDs are never reused, and a failed criterion is
never deleted to make a result look complete.

A criterion is ticked only with evidence beneath it, or left unticked with a residual that names its
tracker:

```markdown
- [x] AC-01: The end state.
      Evidence: <command or action>, <target commit>, <observed result>, <limitations>
- [ ] AC-02: Another end state.
      Residual: https://github.com/OWNER/REPO/issues/43
```

A residual needs the owner's decision. On a normative revision, every criterion tick, evidence line and residual
is reset; their history stays in Git and in the Review Log.

## Test plan

One table with exactly the header `| Criterion | Proof |`. Every criterion ID appears in its first column;
a cell may list several IDs separated by commas. Proof names a real check: a test, a scenario with a pass
condition, or a written manual procedure.

## Tasks

```markdown
- [ ] T1 `path/to/file_test.go` - the failing test for the new behaviour; fails because it does not exist (AC-01)
- [ ] T2 `path/to/file.go` - the change; T1 passes (AC-01)
```

One commit per task. Each names the file it touches, a done condition that is a test or check, and the
criteria it advances. Order by dependency, failing test first. Re-planning keeps checked tasks and changes
only the unchecked tail; new requirements get new task IDs.

## Open questions

Only the owner answers them. Write each for a decision in under a minute:

```markdown
### Q1: The question, as one plain sentence

**Recommendation:** A. The option, and one line on why.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Name** | Benefit | Cost |
| **B. Name** | Benefit | Cost |

**Why this is yours:** what makes it a judgement call.
```

An answered question is folded into the document and removed. "None." means every question has been
answered, not that none was asked.

## Review log

One table row per review pass, then one `### R-<n>` subsection per pass holding the reviewer's returned
records verbatim:

```markdown
| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-17 | R-1 | spec | `0123abc` | <model that ran> | procedural | One line |
| 2026-10-17 | R-1 | spec | `0123abc` | n/a | n/a | accepted by owner |
```

`Kind` is `spec` or `implementation`. `Commit` is the exact reviewed commit; a `+dirty` suffix marks a
diagnostic review of uncommitted work, which never counts as current. `Isolation` is `structural` only
where the host enforces the reviewer's restrictions, otherwise `procedural` or `unknown`. A row with
`Outcome` exactly `accepted by owner` is an acceptance: it names the review it accepts, uses `n/a` for model
and isolation, and has no subsection.

A spec review returns complete finding records, or exactly `NO FINDINGS`:

```text
FINDING: F-01
KIND: factual | judgement
SEVERITY: blocking | should-fix | nit
WHERE: <section>
EVIDENCE: <file:line, command and output, or quote>
PROPOSAL: <one or two sentences>
```

Only the reviews that still decide something must be in record form: the latest spec review, the latest
implementation review, and the review the latest acceptance row names. Older subsections, including
earlier acceptances, are history.

An implementation review returns one record for every current criterion, with its exact accepted text:

```text
CRITERION: AC-01 <exact accepted text>
VERDICT: met | not met | untested | not verified
EVIDENCE: <command or action>, <target>, <observed result>, <limitations>
```

Criterion text is the text after `AC-NN: ` plus each following indented line, up to the next list item,
`Evidence:` line or `Residual:` line, with whitespace runs folded to one space and the ends trimmed. The record's text after
`CRITERION: AC-NN ` is folded the same way, and the two must be equal.

`met`: executed evidence observed in this review establishes the criterion. `not met`: executed evidence
contradicts it. `untested`: no adequate check covers it. `not verified`: a check exists but its execution
was not observed. A passing subset never upgrades a composite criterion.

## Acceptance

1. Fold the owner's answers into the document and commit. Call that commit X.
2. Run an independent spec review at X. Blocking findings are fixed and reviewed again by a new pass; a
   blocking pass is never relabelled clean.
3. The owner accepts in session.
4. Append the acceptance row naming that review.
5. Move the document to `planned` once the gate passes.

A request to investigate or draft is not permission to build, and an issue comment never changes a
status. A re-review caused only by changes on the default branch keeps the acceptance when the normative
baseline is unchanged.

## Rules

`vh-adlc` reads this block at the pinned revision. Exactly one block with this info string exists on this
page.

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
  declaration: '^Feature documents: `?([^`\s]+)`?$'
required_frontmatter: [status, status_description, issue, goal, covers]
required_frontmatter_from: { in-progress: [branch] }
required_sections: [Context, Scope, Design, Acceptance Criteria, Test Plan, Tasks, Open Questions, Review Log]
normative_sections: [Scope, Design, Acceptance Criteria, Test Plan]
normative_frontmatter: [covers]
ids: { criterion: '^AC-\d{2,}$', task: '^T\d+$', review: '^R-\d+$' }
criterion_line: '^- \[( |x)\] (AC-\d{2,}):'
task_line: '^- \[( |x)\] (T\d+) '
evidence_line: '^\s+Evidence: '
residual_line: '^\s+Residual: (https://\S+|#\d+)'
open_question: '^### Q\d+: '
test_plan: { columns: [Criterion, Proof], criterion_cell: '^AC-\d{2,}(, AC-\d{2,})*$' }
review_log_columns: [Date, Review, Kind, Commit, Model, Isolation, Outcome]
review_commit: '^`?[0-9a-f]{7,40}(\+dirty)?`?$'
review_kinds: [spec, implementation]
isolation: [structural, procedural, unknown, n/a]
acceptance_row: { kind: spec, model: n/a, isolation: n/a, outcome: accepted by owner, subsection: false }
verdicts: [met, not met, untested, not verified]
record_criterion: '^CRITERION: (AC-\d{2,}) '
criterion_continuation: '^\s+\S'
record_verdict: '^VERDICT: (met|not met|untested|not verified)$'
record_finding: '^FINDING: F-\d{2,}$'
record_severity: '^SEVERITY: (blocking|should-fix|nit)$'
record_no_findings: '^NO FINDINGS$'
local_format_declaration: '^Feature document format: local$'
gates:
  planned: [no_open_questions, test_plan_complete, spec_review_fresh, spec_review_clean, accepted, on_feature_branch_if_set]
  in-progress: [no_open_questions, test_plan_complete, spec_review_fresh, spec_review_clean, accepted, tasks_populated, on_feature_branch_if_set]
  complete: [no_open_questions, test_plan_complete, spec_review_fresh, spec_review_clean, accepted, all_met, impl_review_fresh, impl_review_clean, feature_tree_clean, on_feature_branch_if_set]
next:
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

Every gate also checks the transition, except a gate whose target is the current status: that re-checks
the conditions only. The first matching `next` rule names the one next step. Lines in the block are
regular expressions where they start with `^`.

## Conditions

The block composes these conditions; `vh-adlc` implements them, and `vh-adlc fresh` decides staleness from
Git. A review bound to a changed normative baseline, a `+dirty` target, a missing review row or an
unreachable reviewed commit is stale.

| Condition | Holds when |
| --- | --- |
| `no_open_questions` | No line in Open Questions matches `open_question` |
| `test_plan_complete` | Every criterion ID appears in the Test Plan table |
| `spec_review_fresh` | The latest spec review exists and is not stale |
| `spec_review_clean` | The latest spec review is well formed and has no blocking finding, or is exactly `NO FINDINGS` |
| `accepted` | The latest acceptance row names a clean spec review whose commit has the current normative baseline |
| `tasks_populated` | At least one line matches `task_line` |
| `tasks_open` | At least one task is unticked |
| `on_feature_branch_if_set` | The document has no `branch`, or the current branch equals it |
| `all_met` | Every criterion is ticked with evidence, or unticked with a residual |
| `impl_review_fresh` | The latest implementation review exists and is not stale |
| `impl_review_clean` | That review has exactly one record per current criterion with its exact text, and each is `met` or residualised |
| `feature_tree_clean` | No staged, unstaged or untracked change matches `covers`, apart from the document itself |
