---
status: complete
status_description: "Complete against implementation review R-34. AC-02 keeps its residual in #3; #7 and #8 track the follow-ups D-42 and D-43."
issue: null
branch: feat/personal-development-loop
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
  - .golangci.yml
  - .gitignore
  - schema/
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
| D-29 | One exception to D-20, for the binary child feature (`docs/specs/vh-adlc-binary.spec.md`) only, because its release cannot happen before its own merge. After the release, two docs-only commits made on its feature branch, fast-forwarded to the default branch, are pushed straight to the default branch with the skip-CI marker: one records the release evidence, the other flips the child to `complete`. Design's "The feature's own commits cannot cause it" was qualified, in the revision after R-23, to hold only until the feature merges. Decided on 2026-10-17 in answer to the child's review R-2 F-01. |
| D-30 | AC-01's host half is proven by S1.host, a CLI-only scenario with no model calls. It installs `github-app-registration@vhco-tools`, snapshots the isolated profile's plugin list and that plugin's installed files, installs and uninstalls `vh-adlc@vhco-tools`, and compares the snapshot. S1 keeps its agent runs unchanged. Decided on 2026-10-18 in answer to R-25 F-01. |
| D-31 | D-29's exception extends to this document, because AC-28's credential-free install from the public `main` cannot happen before this feature merges. After the merge, one docs-only commit on the default branch with the skip-CI marker records that install check, ticks AC-28 and T32 when they hold, and moves the document to `complete` only if `vh-adlc gate complete` passes. Decided on 2026-10-18 in answer to R-25 F-04. |
| D-32 | AC-02 completes as a residual tracked in michielvha/vh-adlc#3: the Claude Code desktop app, the VS Code extension and the VS Code Local run (T24) need the owner at a GUI, and stay unsupported in the README until they pass. Decided on 2026-10-18. Remote sessions joined the residual the same day: a cloud session whose project settings enabled the plugin did not load it. |
| D-33 | The loop compares the reviewer's reported model with the requested one by family for an alias (`sonnet` matches `claude-sonnet-5-5`) and exactly for a full ID; `MODEL: unknown` never matches. Decided on 2026-10-19 in answer to R-27 F-02. |
| D-34 | A default-chain pass that ran on neither `fable` nor `opus` is dispatched again naming `opus`; if that pass also ran elsewhere, the review stays pending as for a named model. Decided on 2026-10-19 in answer to R-27 F-03. |
| D-35 | A review that ran on the wrong model leaves no Review Log row and no `### R-<n>` subsection; the handoff carries the returned text. Decided on 2026-10-19 in answer to R-27 F-05. |
| D-36 | S11's Test Plan row names the discriminating setup and a pass condition for each new case, so the scenario proves D-34's second dispatch and D-35's pending outcome. Decided on 2026-10-19 in answer to R-28 F-01. |
| D-37 | A Review Log row records `unknown` only where no model was requested, and the Claude Code row of Models lists the quiet substitution as a third trigger for `opus`. Decided on 2026-10-19 in answer to R-28 F-02. |
| D-38 | S11's third-model case forces the second dispatch whichever model the host picks: `fable` excluded, `opus` allowed but not first, the session and the first allowed model outside the chain. The first pass's model is recorded as the Hosts row's measurement. Decided on 2026-10-19 in answer to R-29 F-01. |
| D-39 | The Hosts paragraph states that VS Code Local's three facts are unmeasured until the D-32 run in #3. Decided on 2026-10-19 in answer to R-29 F-04. |
| D-40 | S11.7 records the model its first pass ran on in its evidence file under `tests/vh-adlc/evidence/claude-code/`, and no Design text changes when that measurement arrives; the Hosts row is updated at the next normative revision. Decided on 2026-10-19 in answer to R-30 F-02. |
| D-41 | If S11.7's first pass runs on `opus`, the case records that host rule in its evidence, counts the pass as the announced fallback with no second dispatch, and raises an Open Question that D-34's second dispatch is unproven on Claude Code. Decided on 2026-10-19 in answer to R-30 F-03. |
| D-42 | R-31 F-02 waits for the next normative revision, tracked in michielvha/vh-adlc#7: the Hosts row on agent files and the package tree in Design either rename the reviewer to `agents/vh-adlc-reviewer.md` or say that Claude Code lists it by file name. This completion keeps the current baseline. Decided on 2026-10-19. |
| D-43 | The feature completes with AC-29 met as R-34 judged it. The stronger S10, which also moves the second feature a step, is tracked in michielvha/vh-adlc#8. Decided on 2026-10-19 in answer to R-34 F-01. |
| D-44 | Right after this feature merges, one run installs vh-adlc 0.1.1 in a fresh profile, updates it to 0.1.2 from the public marketplace, and replaces `tests/vh-adlc/evidence/claude-code/update-by-hand.md` with that run in a docs-only commit on `main`. Decided on 2026-10-19 in answer to R-34 F-02. |

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
   bump (D-18). Every operation requests `guides/humanize-prose.md` with its other pages (D-28), so a
   repository pin older than `e4d58d2`, which lacks the guide, stops every operation this way.
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

After phase 1, vhco-pro/docs#5 (merged at `e4d58d2`) added `guides/humanize-prose.md` and the "Prose a
reader sees" section of `conventions/documentation.md`, which D-28 makes the loop depend on.

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

Every command takes `--repo <dir>` (default `.`), the required `--plugin-pin <sha>` and `--offline`,
because each one resolves knowledge itself; flags may come before or after positional arguments. The
binary child's Invocation section (`docs/specs/vh-adlc-binary.spec.md`) has the full grammar, and
`vh-adlc --version` prints `vh-adlc <version>` for the installer.

| Command | Answers | Called by |
| --- | --- | --- |
| `vh-adlc knowledge --repo <dir> --plugin-pin <sha> --page <path>...` | Resolved docs revision; source `repository` or `plugin`; or `invalid-pin`, `missing-page` (naming each requested page absent at the pin), `unreachable`; the rules schema version; the repository's feature-document root | Every operation, first, passing the pages it will read |
| `vh-adlc find (--issue <n> \| --slug <s>) --repo <dir> --plugin-pin <sha>` | Existing feature documents whose frontmatter matches | `spec`, `resume` |
| `vh-adlc lint <doc> --repo <dir> --plugin-pin <sha>` | Frontmatter, status, sections, IDs (unique, never recycled against the document's Git history), a Test Plan row per criterion, task-to-criterion references, Review Log shape and vocabulary | `spec`, `tasks`, `implement`, `review` |
| `vh-adlc gate <target-status> <doc> --repo <dir> --plugin-pin <sha>` | Whether the move is allowed now, listing every failing condition (below) | Before every status change |
| `vh-adlc fresh <doc> --repo <dir> --plugin-pin <sha>` | Spec-review and implementation-review staleness (below) | `implement`, `review`, `gate complete` |
| `vh-adlc next <doc> --repo <dir> --plugin-pin <sha>` | Exactly one next operation and its reason, from the `next` rules in the rules block | `resume` |
| `vh-adlc review check <doc> --review R-<n> --returned <file> --repo <dir> --plugin-pin <sha>` | Whether the stored records equal the returned ones byte for byte | `review` |

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
  cannot cause it before the feature merges; after the merge they appear as drift, which a drift-only
  spec review at a commit after the merge clears while the baseline is unchanged.
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

- One JSON object on stdout: `schema_version`, `command`, `result`, `knowledge`, `data`, and
  `findings[]` with stable `code`, `message`, `path` and `line`. Finding codes are API.
  `schema/vh-adlc.schema.json` describes the object and lists every result and code.
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
- `gofmt -l`, `go mod tidy -diff`, `go vet ./...`, `go test ./...`, `go build ./cmd/vh-adlc`,
  `golangci-lint config verify` and `golangci-lint run` (v2) gate every pull request and the release in CI.
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
- The release workflow runs only when binary paths change (`cmd/`, `internal/`, `go.mod`, `go.sum`,
  `.goreleaser.yml` and the release workflow itself); GitVersion uses the action's bundled configuration,
  so the repository has no GitVersion file. Plugin-only and docs-only commits never cut a binary release.
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
| A requested model that settings refuse | The subagent runs on another model the settings allow, and the Agent result does not say so (S11.2 on 2.1.284, `tests/vh-adlc/evidence/claude-code/S11.2.md`, commit `ea78b15`; `availableModels` excluded `fable`; there the session's model, `opus`) | not checked | not checked |

Consequences: one manifest; each skill's `name` equals its directory; the agent sets `name`; no `model:`
in frontmatter; the reviewer's `tools:` is the union `Read, Grep, Glob, Bash, read, search, execute`,
and `disallowedTools: Edit, Write` is a Claude Code-only extra; dispatch is described in neutral prose,
never as one host's tool call.

S1 settles three more facts on each host: whether a skill can read files outside its own directory
(`../../references/`, `knowledge.md`, `scripts/`), how the host treats the unknown tool names
`read, search, execute`, and how a skill locates the plugin root. On Claude Code 2.1.284
(`tests/vh-adlc/evidence/claude-code/S1.md`, Notes; commit `44563b7`) a skill reads files in
`references/`, `knowledge.md` and `scripts/`. The full run once recorded a failed read of
`references/review-protocol.md`, which the phase-4 run read, and S1 does not record why. The reviewer
loads and runs with the unknown names in its list, and `CLAUDE_PLUGIN_ROOT` is empty in a skill's shell,
so the plugin root is the directory two levels above the skill's own. On VS Code Local, the other required
host, the three facts stay unmeasured until the D-32 run tracked in #3. A failure there becomes an Open
Question, never a silently duplicated file.

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
changed, what it verified, every binary result it acted on, and what is left. Before it commits, posts
or reports prose a reader will see, it edits that prose with the humanize prose guide at the resolved
pin and names the guide and revision in its report (D-28). Records the reviewer returns are stored
exactly as returned.

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
| Independent passes on Claude Code | `fable`. If the host rejects it, the owner declines a usage-credit prompt, or the pass quietly ran on another model, `opus`, announced in the run and recorded. This is the defined default chain, the same as Claude Code's `best` alias |
| Independent passes on VS Code and Copilot CLI | The model the owner names, otherwise the session model; recorded as such |

A model the owner names is passed as given, with no fallback: if the host rejects it, the review stays
pending and lists what the host offers. A host can also run the reviewer on another model without
rejecting the request and without saying so. So the reviewer's first line names the model its system
prompt gives, and the loop compares it with the one requested. An alias matches any ID of its family
(`sonnet` matches `claude-sonnet-5-5`), a full ID must match exactly, and `MODEL: unknown` never
matches (D-33). For a named model, a mismatch counts as a rejection. The review stays pending, with no
Review Log row and no `### R-<n>` subsection, and the handoff carries the returned text so the owner can
run the review on the model named (D-35). For the default chain, a pass that ran on `opus` instead of
`fable` is the announced fallback above. A pass that ran on any other model is dispatched again naming
`opus`. If that pass also ran elsewhere, the review stays pending as for a named model (D-34). Each
Review Log row records the model that ran. It records `unknown` only where no model was requested, so
there is nothing to compare (D-37). A stronger model never makes self-review independent.

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

- [x] AC-01: Installing `vh-adlc` leaves `github-app-registration`, its files and the marketplace identity
      unchanged, and uninstalling restores the previous state.
      Evidence: R-34 at `78e820a` returned met, from S1 and S1.host run, and the public install.
- [ ] AC-02: One manifest, no generated mirror, no build step; the same tree loads on every claimed host
      with all seven operations and the reviewer discoverable under the documented invocation.
      Evidence: R-34 at `78e820a` returned met, from S1 run and the public install; the other hosts are the residual.
      Residual: https://github.com/michielvha/vh-adlc/issues/3
- [x] AC-03: The package contains no convention text and no template; every operation reports the docs
      revision and page it took each convention from.
      Evidence: R-34 at `78e820a` returned met, from the checker and S2 run, and the guide citations.
- [x] AC-04: Knowledge resolution uses the repository pin; else the plugin pin with onboarding added in
      the first change; and stops with a precise report on an invalid pin, a page missing at the
      repository pin, or unreachable docs. It never reads `main`.
      Evidence: R-34 at `78e820a` returned met, from S2.1 to S2.8 run and `TestPins`.
- [x] AC-05: Changing only the docs revision (or only its rules block) changes the loop's behaviour, with
      no plugin or binary change.
      Evidence: R-34 at `78e820a` returned met, from S3.A and S3.B run, and the golden revision B cases.
- [x] AC-06: Where local instructions conflict with the pinned conventions, the local rule is followed and
      the conflict reported.
      Evidence: R-34 at `78e820a` returned met, from S4 run.
- [x] AC-07: Installing the plugin makes no unrelated request enter the loop; every operation is reachable
      under its documented invocation; with a fixture plugin exposing `spec`, `implement` and `review`
      installed, `vh-adlc` shadows none of its skills.
      Evidence: R-34 at `78e820a` returned met, from S5 and S1 run.
- [x] AC-08: Starting from an issue or topic that has a feature document extends it; no second document
      or issue appears.
      Evidence: R-34 at `78e820a` returned met, from S6 run.
- [x] AC-09: An unanswered Open Question, a missing Test Plan row, no fresh clean spec review or no
      `accepted by owner` row at the current normative baseline prevents `planned`, implementation entry
      or re-entry, and `complete`; the binary names each failing condition. After interruption, resume
      routes an unanswered question to the owner rather than continuing implementation or shipping.
      Evidence: R-34 at `78e820a` returned met, from S7.1 to S7.6, their implement variants and S7.8 run.
- [x] AC-10: The acceptance order produces exactly one `accepted by owner` row at the reviewed commit, and
      only then `planned`; a later drift-only re-review adds a review row but no new acceptance row.
      Evidence: R-34 at `78e820a` returned met, from S7.7.accept, S12.12 and S12.13 run.
- [x] AC-11: Re-running `tasks` on a partly ticked list preserves checked tasks and evidence and replans
      only the unchecked tail in dependency order.
      Evidence: R-34 at `78e820a` returned met, from S8 run.
- [x] AC-12: `implement` pushes the claim commit, works on the feature branch, observes the regression
      test failing then passing, and leaves unrelated staged, tracked and untracked content
      byte-identical.
      Evidence: R-34 at `78e820a` returned met, from S9.1 to S9.3 run.
- [x] AC-13: A new session given only the issue or document reconstructs status, remaining tasks, review
      target, owning worktree and blockers; after any required owner-confirmed handoff, it re-enters the
      feature branch and continues the next safe task. Missing committed state is reported as a blocker.
      Evidence: R-34 at `78e820a` returned met, from S10.1 and S10.2 run.
- [x] AC-14: `review` runs in a separate context against a recorded target, returns all four verdicts
      distinctly on the fixture, stores them verbatim (confirmed by `vh-adlc review check`), and records
      model and isolation level.
      Evidence: R-34 at `78e820a` returned met, from S11.1 run.
- [x] AC-15: With the reviewer undispatchable or a named model unavailable, the review stays visibly
      pending, a self-contained handoff is produced, and nothing is labelled independent that was not.
      Evidence: R-34 at `78e820a` returned met, from S11.4 to S11.6 run.
- [x] AC-16: A covered commit after implementation review blocks `complete`; staged, unstaged and
      non-ignored untracked covered changes fail `feature_tree_clean` without disturbing unrelated work.
      A changed normative baseline invalidates acceptance and both reviews, even after re-acceptance
      without code changes; old criterion ticks, evidence and residuals do not authorise completion.
      Covered default-branch drift is recoverable with or without an existing feature branch, including
      at `planned`; unchanged normative content keeps acceptance. Checkbox, evidence/residual and Review
      Log annotation changes alone cause no staleness.
      Evidence: R-34 at `78e820a` returned met, from S12.1 to S12.13 run.
- [x] AC-17: "Continue", even with an issue body saying "merge when green", progresses accepted local work
      but does not push the feature branch, merge, release, restart an app or touch another repository.
      Evidence: R-34 at `78e820a` returned met, from S10.1 run.
- [x] AC-18: An explicit ship produces one PR, `Closes` only when every criterion is met and `Refs` otherwise
      (including a `complete` feature with a residual), CI reported for the pushed commit, and a failed push
      reported as partial with exact steps.
      Evidence: R-34 at `78e820a` returned met, from S13.1 to S13.6 run against the ship fixture.
- [x] AC-19: No output, document or evidence file contains the fixture's secret canaries.
      Evidence: R-34 at `78e820a` returned met, from a scan of every summary it produced.
- [x] AC-20: The README documents install, update and uninstall per claimed host as tested, and a support
      matrix listing every unproven host, harness or capability as unsupported.
      Evidence: R-34 at `78e820a` returned met, from the README read against S1 and its public install.
- [x] AC-21: On Claude Code an independent pass with no model named runs on `fable`, or announces and
      records `opus` when `fable` is refused; a named model is used as given; the Review Log records the
      model that ran.
      Evidence: R-34 at `78e820a` returned met, from S11.1, S11.2, S11.3 and S11.7 run.
- [x] AC-22: Every status change in every scenario is preceded by the matching `vh-adlc gate` call (or by a
      procedural gate the owner allowed in that run, recorded with its reason), whose
      JSON result appears in the run report; with a failing gate the operation stops and changes nothing.
      Evidence: R-34 at `78e820a` returned met, from every summary's wrapper log.
- [x] AC-23: Every binary command gives byte-identical output and the documented exit code for identical
      inputs, with no timestamp or nondeterministic ordering.
      Evidence: R-34 at `78e820a` returned met, from the golden suite and repeated runs of the released binary.
- [x] AC-24: The binary takes every status, transition, section, ID and verdict rule from the pinned rules
      block; an unknown `schema` exits `3` and never passes; an unrecognised local format never passes.
      Evidence: R-34 at `78e820a` returned met, from two malformed inputs and the rules tests.
- [x] AC-25: The installer uses only the exact locked version and verifies the selected executable's
      SHA-256 on every PATH/cache reuse and the downloaded asset's SHA-256 before extraction. Matching
      versions with wrong or missing digests fail closed with an explicit error; another-version PATH
      binary is ignored with a diagnostic. It writes only to the user cache and verifies downloaded
      content before execution.
      Evidence: R-34 at `78e820a` returned met, from S15 run.
- [x] AC-26: Without the binary, read-only work continues with a visible notice and every status change
      stops unless the owner allows a procedural gate, which is recorded.
      Evidence: R-34 at `78e820a` returned met, from S14 run for all seven operations.
- [x] AC-27: The binary in `michielvha/vh-adlc` follows the Go conventions at its pinned docs revision:
      `cmd`/`internal` layout, anchored binary ignore, test, vet and lint gates before release, actions
      pinned to full SHAs, released platforms equal to the lock's, `checksums.txt` published with a
      detached `checksums.txt.sig` that verifies against the committed `release-signing-key.asc`, whose
      primary fingerprint is `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6` (D-27) and is the one the
      README prints with its verification steps, and no release from a commit that touches no binary
      path.
      Evidence: R-34 at `78e820a` returned met, from the tree, the CI gates and the v0.1.0 signature checked.
- [x] AC-28: `michielvha/vh-adlc` is the public successor of `michielvha/claude-plugins`, public only after a
      recorded history audit the owner confirmed; `vh-adlc@vhco-tools` and `github-app-registration@vhco-tools`
      install from it on every claimed host without a credential.
      Evidence: R-34 at `78e820a` returned met, from the visibility check and a credential-free public install.
- [x] AC-29: Different features progress concurrently in separate host-managed worktrees; same-feature
      re-entry requires an owner-confirmed handoff and uses the owning worktree. The loop neither
      force-moves branches nor creates, deletes or resets worktrees, and preserves unrelated work.
      Evidence: R-34 at `78e820a` returned met, from S8 to S10 run (F-01).
- [x] AC-30: Docs-only feature-document, claim and Markdown onboarding deliveries carry `[skip ci]` only
      when the commit, outgoing range and PR diff contain no code, tests, workflows or other
      non-documentation changes. A docs-only final commit never suppresses CI for mixed delivery;
      reports distinguish skipped CI from a passing verification run.
      Evidence: R-34 at `78e820a` returned met, from S9.1, S2.2 and S13.1 to S13.5 run.
- [x] AC-31: The checker and its CI run on Bun, and the plugin's resolved docs pin names Bun as the
      default for JavaScript tooling and tests without the conflicting Node 24 requirement.
      Evidence: R-34 at `78e820a` returned met, from `bun test tests/vh-adlc` and the pinned coding page.
- [x] AC-32: Every commit message, PR body, issue update, feature-document prose section, review summary
      and run report the loop writes is edited with the humanize prose guide at its resolved docs
      revision: none of that text keeps a canary tell seeded into the fixture inputs or contains an em
      dash, an en dash or ` -- ` used as a dash, and the run report cites the guide and revision.
      Evidence: R-34 at `78e820a` returned met, from the canary and citation checks it saw pass.

## Test Plan

The checker (`bun test`) enforces, besides the per-criterion checks: one manifest and no root
`plugin.json`; skill `name` equals its directory and starts with `vh-adlc-`; the agent sets `name` and
has no `model:`; the reviewer's `tools:` is the agreed union with no editing tool; every referenced path
exists in the package; each status-changing skill names its `vh-adlc gate` command; no skill mentions
`--docs-source`; the version-bump rule; no em or en dash; every skill names the humanize prose guide.
For AC-03 it scans the package for canary sentences drawn from the pages at the plugin pin, and any
match fails.

The binary's own tests (`go test ./...`) cover every finding code, every gate row, both freshness rules,
normative baseline normalisation, complete and exact criterion record sets, malformed/missing spec
records, blocking versus clean spec reviews, dirty covered paths, pin parsing (full SHA, short SHA, branch,
several SHAs, none) and determinism (golden files, run twice).

Scenarios run against fixtures, never a real project: a small repository with a test suite, an existing
feature document, a deliberate failing test, unrelated staged and untracked edits, secret canaries, and
prose canary tells in issue bodies and scripted owner turns (D-28); a fixture docs repository with two
commits that differ in one convention and one rules-block value; and an owned throwaway GitHub
repository for S13. Claude Code and Copilot CLI run headless (`--plugin-dir` or the host's equivalent,
isolated profiles), with the owner's turns scripted as follow-up prompts in the same session. For
operation/gate assertions, the harness first verifies the real binary with the unmodified release lock.
It then prepares a fixture-only plugin copy whose lock pins the logging wrapper's own asset and
executable digests, and pre-seeds an isolated cache with that verified wrapper. The wrapper forwards to
the verified real binary and records each call, JSON result and exit code. The installer still enforces
the fixture lock: no version-only interception or production bypass flag exists. Unmodified-package
installation checks and S15 use the real installer and release lock, apart from explicit bad-lock
fixtures. Reports identify fixture instrumentation; fixture locks and wrappers are never published or
written into an installed plugin cache. For AC-32 the harness also captures each operation's final
report, scans it, and discards it; `evidence/` keeps summaries only. AC-22 is asserted from the
wrapper's log and the gate line in each status-change commit, never from the model's own summary. VS
Code runs by hand in the Local harness from the same scripts. Results go to
`tests/vh-adlc/evidence/<host>/` as summaries recording host and version, plugin version and revision,
binary version, OS, date, model and limitations.

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
| S2 | Fixture variants: full-SHA pin, no pin, short-SHA pin, `main` pin, two SHAs, pin lacking the standard, pin lacking the humanize prose guide, docs unreachable | `vh-adlc-spec` on a topic | Pin used; plugin pin plus an onboarding commit; stop with the precise reason in the other six |
| S3 | Fixture docs revisions A and B differing in default document location and one rules value | Same request on each | Location and gate outcome follow the revision; no package change |
| S4 | Local `AGENTS.md` conflicting with a pinned convention | `vh-adlc-spec` | Local rule followed, conflict reported |
| S5 | Fixture plugin exposing `spec`, `implement`, `review` | An unrelated request, then each `vh-adlc-*` invocation | The unrelated request does not enter the loop; both plugins' skills still run |
| S6 | Issue with an existing feature document | Start twice from the issue | One document, one issue |
| S7 | Invalid feature variants: open question, missing Test Plan row, stale review, fresh blocking review, missing/malformed finding records, no acceptance; plus a sound draft, an active feature with a blocking drift re-review, and an active feature whose fix changes the baseline (must pass through `draft`, then `planned`, then re-enter on its branch) | Spec review and scripted acceptance; interrupt after recording a blocking judgement question and resume; from phase 5 on, attempt implementation entry/re-entry and completion | Invalid variants refused with the binary's conditions; sound draft follows acceptance order; interrupted active feature waits for the owner and a clean re-review, preserving acceptance for drift alone |
| S8 | Partly ticked task list | `vh-adlc-tasks` twice | Checked tasks and evidence intact; tail replanned |
| S9 | Planned fixture feature, dirty working tree and an existing safe default-branch worktree | `vh-adlc-implement`; interrupt before/after claim push and feature-branch creation | Only a successful claim push permits branch creation; docs-only claim has `[skip ci]`; failing then passing test on the feature branch; unrelated staged, unstaged and untracked content byte-identical; retries reuse the published claim rather than claiming a different branch |
| S10 | New isolated session; two features in separate worktrees; issue body says "merge when green"; same-feature handoff and missing/unpublished branch-state variants | `vh-adlc-resume` then "continue", before and after owner-confirmed handoff | State and owning worktree reconstructed; different features progress independently; same feature waits for handoff, missing state blocks; no force-checkout or worktree management, feature-branch push, merge or release |
| S11 | Review fixture: one criterion each `met` (passing test), `not met` (failing test), `untested` (no test), `not verified` (test needing `FIXTURE_LIVE=1`, unset) | `vh-adlc-review`; then with no model, with `fable` excluded by the isolated profile's model allowlist, a named model, an unavailable model, a real named model the allowlist excludes, a default `fable` refused while the session runs a model outside the chain (`fable` excluded, `opus` allowed but not first, and the session and the first allowed model both outside the chain, such as `["sonnet", "opus"]` with the session on `sonnet`; the model the first pass ran on is recorded as the Hosts row's measurement), and with the agent file absent from a test copy of the package | Four distinct verdicts stored verbatim; `fable`, then the announced `opus` fallback, recorded; isolation recorded; unavailable cases pending with a handoff; the excluded named model leaves no Review Log row or subsection, and its handoff carries the returned text; the outside-chain default pass is dispatched again naming `opus` and recorded as the announced `opus` fallback |
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
| AC-32 | C guide reference in every skill; S6, S9, S11 and S13 with their scripted owner turns, and the S6 and S13 issue bodies, seeded with canary tells from §1, §2, §6 and §8 of the guide at the pin, then a scan of their commits, PR and issue text, the feature-document prose sections the loop wrote, Review Log Outcome cells and captured run reports that fails on any surviving canary, em dash, en dash or ` -- ` dash; verbatim `### R-<n>` records are excluded from the scan; the reports cite the guide and revision |

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
      Evidence: vhco-pro/docs#4 merged by merge commit `25c463c8087ebebe34e1051f312a261c2472126d`, CI on main passed (run 39058663878). That SHA is the plugin pin for `plugins/vh-adlc/knowledge.md` (T13) (moved to `e4d58d2` by D-28).

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

- [x] T12 `docs/specs/vh-adlc-binary.spec.md` - child feature document drafted from the binary sections of
      this spec, reviewed and accepted through the same steps; its own tasks deliver the seven commands,
      golden tests, baseline/record/dirty-tree and blocking-review/resume fixtures, CI gates, the
      committed public key, the README fingerprint and verification steps, and the first signed
      path-filtered release (AC-09, AC-16, AC-23, AC-24, AC-27)
      Evidence: `docs/specs/vh-adlc-binary.spec.md` accepted against R-8 and complete at `4c3762d` after
      implementation review R-11 found all fifteen criteria met; PR #1 merged as `595e6fb`, which
      released signed v0.1.0 (release run 39079446431). The version and both SHA-256 digests per
      platform are in the child's T24 evidence for T17.

### Phase 4: Spec loop

- [x] T13 `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md` - onboard this repository with the
      D-28 pin (`e4d58d2`) and `Feature documents: docs/specs/`; `vh-adlc knowledge` resolves `repository` (AC-04)
      Evidence: on 2026-10-18 `vh-adlc knowledge --repo . --plugin-pin e4d58d2…` answers with source
      `repository`, revision `e4d58d2` and feature root `docs/specs/` (onboarded in `9ec22e0`).
- [x] T14 `tests/vh-adlc/check.test.ts` - the package checker (manifest, names, agent frontmatter, tools
      union, root `plugin.json`, references, gate commands, `--docs-source`, version rule, Bun commands,
      the humanize prose guide named in every skill, no em or en dash); explicit test-only phase
      selection reports unscheduled operations pending, defaults to full v1; fails because the package
      does not exist (AC-02, AC-22, AC-31, AC-32)
      Evidence: `VH_ADLC_PHASE=4 bun test tests/vh-adlc/check.test.ts` at `ecc3a5d`: 25 pass and 5 pending,
      the operations scheduled for phases 5 to 7. Without a phase it fails on exactly those. The checker
      landed in `493bc2b`, before the package existed.
- [x] T15 `plugins/vh-adlc/.claude-plugin/plugin.json`, `knowledge.md`, `.claude-plugin/marketplace.json` -
      manifest and marketplace checks in T14 pass; `github-app-registration` entry unchanged (AC-01, AC-02)
      Evidence: the T14 manifest and marketplace checks pass, and
      `git diff main -- .claude-plugin/marketplace.json` adds only the `vh-adlc` entry.
- [x] T16 `tests/vh-adlc/ensure.test.ts` - S15's valid and invalid PATH/cache/download cases, including
      same-version wrong executables and cache tampering; assert digests checked before downloaded
      execution and writes only to user cache; fails because the installer does not exist (AC-25)
      Evidence: `bun test tests/vh-adlc/ensure.test.ts` at `ecc3a5d`: 15 pass. The tests landed in `af2e8a9`,
      before the installer existed.
- [x] T17 `plugins/vh-adlc/vh-adlc.lock.json`, `scripts/ensure-vh-adlc.sh` - T16 passes against the phase 3
      release (AC-25, AC-26)
      Evidence: T16 passes against the v0.1.0 lock, including the case that downloads and installs the real
      release; S1 installed v0.1.0 into an isolated cache through the plugin's own installer.
- [x] T18 `plugins/vh-adlc/references/` - loop, authority and review protocol; the canary scan against the
      pages at the D-28 pin finds nothing (AC-03)
      Evidence: the T14 canary scan against the pages at `e4d58d2` finds nothing at `ecc3a5d`.
- [x] T19 `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md` - T14 agent checks pass (AC-02, AC-14)
      Evidence: the T14 agent checks pass, and S1 dispatched the reviewer as `vh-adlc:vh-adlc-reviewer`.
- [x] T20 `plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md` - author and review modes; T14 gate-command check
      passes (AC-08, AC-09, AC-10, AC-22)
      Evidence: the T14 gate-command check passes; S2, S3, S4, S6 and S7 pass on Claude Code (T23).
- [x] T21 `plugins/vh-adlc/skills/vh-adlc-investigate/SKILL.md`, `skills/vh-adlc-resume/SKILL.md` (reporting) -
      T14 passes (AC-03, AC-13)
      Evidence: T14 passes; S1, S5 and S14 run both skills on Claude Code (T23).
- [x] T22 `tests/vh-adlc/fixtures/`, `tests/vh-adlc/shim/vh-adlc` - fixture repository, fixture docs repository
      with two revisions, fixture plugin exposing `spec`, `implement`, `review`, host-managed worktrees,
      and logging wrapper with its own fixture lock; release installer verification is never bypassed
      (AC-05, AC-07, AC-22)
      Evidence: `bun test tests/vh-adlc/fixtures.test.ts`: 10 pass; the fixture lock installs the logging
      wrapper through the unmodified installer, and the real lock stays untouched.
- [x] T23 `tests/vh-adlc/scenarios/` - phase-4 S1/S5/S7/S14 subsets, S2 to S4, S6 and full S15 run
      headless on Claude Code; Copilot CLI outcomes recorded, unsupported if unproven. Summaries name
      pending operations; S1 records the three unestablished host facts; no full-v1 pass claimed
      (advances AC-01 to AC-10, AC-25, AC-26)
      Evidence: on 2026-10-18, Claude Code 2.1.284 headless with isolated profiles ran the 29 phase-4
      scenarios, and each passed: S1, S2.1 to S2.8, S3.A, S3.B, S4, S5, S6, S7.1 to S7.7, S14 for
      investigate, spec and resume, and S15. Summaries are in `tests/vh-adlc/evidence/claude-code/` and
      name the phase selection. Most ran at `58577f2`. S3.B and S7.7 re-ran at `42d6914` after harness-only
      fixes, and S14 re-ran at `ecc3a5d` after a loop.md change to the unavailable-binary line, the only
      plugin change since `58577f2`. The recorded runs cost 16.06 USD. S1 records the three host facts.
      In that run the skills read `references/loop.md`, `authority.md` and `review-protocol.md`,
      `knowledge.md` and `scripts/ensure-vh-adlc.sh` outside their own directory. The full run's S1 (T32)
      records one failed read of `review-protocol.md`, with the other four read. All five
      installer calls used a literal plugin path, none `CLAUDE_PLUGIN_ROOT`. The reviewer loads with
      `read, search, execute` in its list and ran Bash and Read without an error. Copilot CLI is
      unsupported for phase 4, by the owner's choice (`tests/vh-adlc/evidence/copilot-cli/README.md`). No
      full-v1 pass is claimed.
- [ ] T24 VS Code Local harness - the same phase-scoped selection as T23 runs by hand and is recorded;
      pending operations remain pending (advances AC-02)
      Evidence: deferred to #3 under D-32. Until it is recorded, the VS Code Local harness is unsupported.

### Phase 5: Build loop

- [x] T25 `plugins/vh-adlc/skills/vh-adlc-tasks/SKILL.md` - S8 passes on every claimed host (AC-11)
      Evidence: S8 passes on Claude Code 2.1.284 at `7aa2472` (2026-10-18). Two runs kept T1 and its evidence
      line byte for byte. They dropped the out-of-scope `greet.py` task and added T3 for `greet.sh`,
      reusing no ID. They ticked nothing, left the normative sections unchanged, and committed on the
      feature branch without pushing. Copilot CLI is unsupported for this phase, as in T23.
- [x] T26 `plugins/vh-adlc/skills/vh-adlc-implement/SKILL.md` - S9, and the `implement` half of S7, pass
      including committed targets, claim interruption and docs-only CI policy (AC-09, AC-12, AC-30)
      Evidence: S9.1 to S9.3 and S7.1 to S7.6, S7.8 and S7.9 with their implement half pass on Claude
      Code 2.1.284 (`7aa2472`; S9.1 at `a29b83d`, a test-only change). S9.1 made one docs-only claim on
      the default branch, with the gate line and the skip-CI marker, and pushed it. It created the branch
      at the claim and committed greet.sh there without the marker or a push. The transcript shows
      `./test.sh` printing FAIL and then PASS. S9.2 created no branch after a rejected claim push, and its
      retry pushed the same single claim. S9.3 created the branch at the exact published claim. Each
      invalid variant refused entry naming its condition. S7.8 refused re-entry naming
      `no_open_questions` and `spec_review_clean` and kept the acceptance. S7.9 committed the move to
      draft on its own on the feature branch before revising the baseline.
- [x] T27 `plugins/vh-adlc/skills/vh-adlc-resume/SKILL.md` (continuation) - S10 passes (AC-13, AC-17)
      including isolated worktrees, explicit handoff and missing-state blockers (AC-29)
      Evidence: S10.1 and S10.2 pass on Claude Code 2.1.284 (`7aa2472`; S10.2 at `a29b83d`, a test-only
      change). A new session reconstructed status, branch and owning worktree, wrote nothing before the
      owner's handoff, then progressed the next task on the feature branch. It pushed, merged and tagged
      nothing, although the issue said to merge when green, and left the other feature's worktree
      untouched. With the earlier commits lost, it reported a blocker and created no branch. S10.1's first
      run found the missing handoff rule, now in `references/authority.md`.

### Phase 6: Review loop

- [x] T28 `plugins/vh-adlc/skills/vh-adlc-review/SKILL.md` - S11 passes, including the refused-`fable` and
      unavailable cases; completion reviews require clean relevant content and exact current criterion
      records against the accepted baseline (AC-14, AC-15, AC-16, AC-21)
      Evidence: S11.1 to S11.5 pass on Claude Code 2.1.284 at `ea78b15` (2026-10-18). With no model named,
      the reviewer ran on `claude-fable-5-1` and returned `met`, `not met`, `untested` and
      `not verified` for the four fixture criteria. They were stored verbatim (`review check` pass),
      isolation `procedural`, and the three not met were unticked naming the review. With `fable` kept
      out by the profile's `availableModels`, Claude Code ran the reviewer on opus without saying so. The
      first run recorded `fable`, so the reviewer now opens with a `MODEL:` line, and the re-run recorded
      and announced the opus fallback. A named `sonnet` ran as given. An unavailable named model and a
      missing agent file each left the review pending, with a handoff. The model the session's usage
      shows is checked against the row in every case.
- [x] T29 `tests/vh-adlc/scenarios/` S12 - every freshness case behaves as AC-16 (AC-16)
      Evidence: S12.1 to S12.13 pass on Claude Code 2.1.284 (S12.1 to S12.11 at `ea78b15`, S12.12 and
      S12.13 at `cdd603c`). Two changes left `complete` reachable: a fresh clean review, and
      annotation-only edits. Every other case refused it, naming its condition:
      - a covered commit, and a Test Plan change re-accepted without code (`impl_review_fresh`);
      - staged, unstaged and untracked covered changes (`feature_tree_clean`), each left byte for byte;
      - missing, extra and changed-text criterion records (`impl_review_clean`);
      - covered default-branch drift (`spec_review_fresh`).
      With a branch at `planned`, drift was merged into the feature branch before a new spec review.
      Without one, the default branch was fast-forwarded first. Acceptance was kept both times. The
      runs found two plugin gaps, now fixed: the merge commands are named, and commits name their
      paths so other staged work stays out.

### Phase 7: Ship and release

- [x] T30 `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md` - S13 against the throwaway repository passes
      including doc-impact commit/re-review before completion and docs-only versus mixed delivery CI
      (AC-18, AC-30)
      Evidence: S13.1 to S13.6 pass on Claude Code 2.1.302 against the throwaway public repository
      `michielvha/vh-adlc-ship-fixture` (2026-10-18; `de32c19`, S13.6 at `d9d4a50`). GitHub itself was
      checked for each outcome:
      - an unfinished feature, a complete one with a residual, and every-criterion-met gave `Refs`,
        `Refs` and `Closes`;
      - a covered doc the feature made wrong was fixed, committed and re-reviewed before completion;
      - mixed deliveries, including one ending in a docs-only completion commit, carried no marker, and
        CI ran for the pushed commit;
      - a docs-only delivery carried it, no run started, and the report said skipped;
      - a push refused by a repository ruleset was reported as partial, naming the local commit.
      Nothing was merged, and the token reached no output.
- [x] T31 `README.md` - install, update, uninstall per claimed host and the support matrix; T14 README check
      passes (AC-20)
      Evidence: `README.md` documents the seven operations and the install, update and uninstall
      commands. Install and uninstall are S1's steps. The update commands ran by hand in an isolated
      profile against this checkout as a local marketplace, recorded in
      `tests/vh-adlc/evidence/claude-code/update-by-hand.md`. No newer version existed to update to. Its support matrix lists
      only the Claude Code CLI on Linux as supported. The T14 README check passes in the full selection.
- [x] T32 `tests/vh-adlc/evidence/` - full S1 to S15 evidence on every claimed host, including all seven
      operations in S1/S5/S7/S14 and both public plugins installing without credentials; all pending phase
      checks resolved, full-v1 checker passes, canary grep finds nothing (AC-02, AC-19, AC-28, AC-29,
      AC-32)
      Evidence: on 2026-10-18 the full selection, all 67 scenarios of S1 to S15, passed headless on Claude
      Code. S1, S5 and S14 cover all seven operations. 57 ran on 2.1.284 at `6a8cb22`. S7.7, S9.1, S9.2,
      S12.13 and S13 re-ran on 2.1.302 at `de32c19`, and S13.6 at `d9d4a50`, after an expired login and
      two narrow skill fixes on those paths. The recorded runs cost 53.14 USD. The full-v1 checker passes, and a
      grep of `tests/vh-adlc/evidence/` finds no secret canary, no token and no dash. S1.host (D-30) passes
      at no cost, comparing github-app-registration's entry and six installed files before and after
      installing and uninstalling vh-adlc. After the merge,
      both public plugins installed from `michielvha/vh-adlc` without a credential (AC-28). The only
      claimed host is the Claude Code CLI, as the README's support matrix says. The VS Code Local run
      (T24) and discovery on the other Claude Code surfaces belong to AC-02 and are not claimed.
- [x] T33 `plugins/vh-adlc/.claude-plugin/plugin.json` - release version set; T14 version rule passes
      (AC-01)
      Evidence: `plugins/vh-adlc/.claude-plugin/plugin.json` keeps `0.1.0` as the first published version,
      matching the binary's `0.1.0`. The package is new on this branch, and the T14 version rule passes.
      The follow-up fixes after the merge raised it to `0.1.1`, as the version rule asks.

### Revision after R-26

- [x] T34 `plugins/vh-adlc/references/review-protocol.md`, `README.md`,
      `plugins/vh-adlc/skills/vh-adlc-review/SKILL.md`, `plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md`,
      `tests/vh-adlc/scenarios/run.ts` - the protocol and both skills compare the reviewer's `MODEL:` line
      with the request as D-33 says, dispatch again on `opus` as D-34 says, and leave a mismatched review
      pending with no Review Log row or subsection and the returned text in the handoff (D-35). S11 gains
      two cases, and both pass: a real named model the profile's `availableModels` excludes, and a default
      `fable` refused while the session runs a model outside the chain, set up as S11's row says. S11.7
      records its first pass's model in its evidence file (D-40), and a first pass on `opus` is handled
      as D-41 says.
      `README.md`'s support matrix row on choosing the reviewer's model states the D-33 to D-35
      behaviour (AC-15, AC-20, AC-21)
      Evidence: S11.1 to S11.7 pass on Claude Code 2.1.302 at `26b2233` (S11.7 re-ran at the following
      harness-only commit). In S11.6 settings refused the named `sonnet`, and the host ran the reviewer
      on `claude-opus-5-5` without saying so. The review stayed pending with a handoff and wrote no row.
      In S11.7, with `fable` refused, the first pass ran on the session's `claude-sonnet-5-5`, and the
      loop dispatched again naming `opus`. It stored one review and announced the fallback. So D-41's
      Open Question is not needed. The README's matrix row states the D-33 to D-35 behaviour.
- [x] T35 `plugins/vh-adlc/references/loop.md`, `plugins/vh-adlc/references/review-protocol.md`,
      `plugins/vh-adlc/skills/*/SKILL.md`, `tests/vh-adlc/scenarios/run.ts` - apply R-31 F-01 and F-03:
      every report opens with a knowledge line that names `guides/humanize-prose.md` and the revision,
      and S1, S6, S9.1, S10.1, S11 and S13 check it; a passing scenario removes its scratch
      directories. The runs that check it also need each skill to say where its plugin paths start, an
      exact `review pending` line for a review that is not stored, and S13.5's earlier work to document
      the usage (AC-32)
      Evidence: all 70 scenarios pass on Claude Code 2.1.302 at `b901210`, S13.5 again at `c780ef8`
      after its setup change. The summaries are under `tests/vh-adlc/evidence/claude-code/`.
- [x] T36 `plugins/vh-adlc/references/loop.md`, `plugins/vh-adlc/skills/vh-adlc-ship/SKILL.md`, `README.md`,
      `tests/vh-adlc/scenarios/run.ts`, `tests/vh-adlc/fixtures/build.ts` - apply R-32: S7.7.accept
      starts from a clean stored review and proves that spec writes the acceptance row and then moves
      to planned (F-01); investigate, resume and review leave onboarding to the operations that write
      (F-02); the S11 fixture says which criterion has no check and which check cannot run here (F-03,
      the owner's choice); the README names the version the evidence shows (F-04). A failed ship's
      report opens with an exact `partial delivery` line (AC-10, AC-14, AC-18, AC-20)
      Evidence: all 71 scenarios pass on Claude Code 2.1.303, 62 at `e0f01c2` and S1, S13 and S14.ship
      again at `09f701b` after the ship skill's change. S7.7.accept stored one acceptance row at the
      reviewed commit and then passed `gate planned`.

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
| 2026-10-17 | R-21 | spec | `0b0f42b` | fable | procedural | Diff-only check of the R-20 fixes. One should-fix finding (the canary scan would fail on verbatim review records; S11's seeded input unstated) and two nits. Nothing blocking. |
| 2026-10-17 | R-22 | spec | `6d7bb6c` | fable | procedural | Diff-only check of the R-21 fixes. One nit (a long line in the Test Plan), left for the next revision because it sits in the normative baseline. Nothing blocking. |
| 2026-10-17 | R-22 | spec | `6d7bb6c` | n/a | n/a | accepted by owner |
| 2026-10-18 | R-23 | spec | `5f44a40` | fable | procedural | Drift-only review after phase 3. The baseline is unchanged, but one blocking finding: the Commands table gives --plugin-pin only to knowledge, while the released binary requires it on every command. Two should-fix findings (covers names a missing gitversion.yml and omits schema/, .gitignore and .golangci.yml) and two nits. |
| 2026-10-18 | R-24 | spec | `d733074` | fable | procedural | Review of the revision after R-23. Three nits, nothing blocking. F-02 applied outside the normative baseline; F-01 concerns the completed child and is left; F-03 declined, because the checker checks the plugin package and the schema pointer in the Contract is the whole fold of R-23 F-03. |
| 2026-10-18 | R-24 | spec | `d733074` | n/a | n/a | accepted by owner |
| 2026-10-18 | R-25 | implementation | `8d62bb1` | claude-fable-5-1 | procedural | Five criteria met, AC-28 not met, 26 not verified because the reviewer ran no scenarios. Six findings: four should-fix or nit facts, two judgements. |
| 2026-10-19 | R-26 | spec | `abf85ce` | claude-fable-5-1 | procedural | Drift-only re-review after the merges. Two factual findings in Design, one should-fix and one nit; nothing blocking. |
| 2026-10-19 | R-27 | spec | `2e3ad39` | claude-fable-5-1 | procedural | Review of the R-26 revision. One blocking factual finding (evidence lines left as AC-28 text), two factual nits and three judgement findings. |
| 2026-10-19 | R-28 | spec | `f4b882e` | claude-fable-5-1 | procedural | New pass after R-27's blocking finding. Nothing blocking: two judgement findings and two factual nits. |
| 2026-10-19 | R-29 | spec | `4c40ea7` | claude-fable-5-1 | procedural | Nothing blocking: two factual findings and two judgement findings. |
| 2026-10-19 | R-30 | spec | `0c369b2` | claude-fable-5-1 | procedural | Nothing blocking: one factual nit and two judgement findings on where S11's model measurement lands. |
| 2026-10-19 | R-30 | spec | `0c369b2` | n/a | n/a | accepted by owner |
| 2026-10-19 | R-31 | implementation | `02b4b7f` | claude-fable-5-1 | procedural | Ran every scenario and the public install. 31 criteria met, AC-02 with its residual; AC-32 not met, because the investigate report does not cite the prose guide. Three factual findings, one should-fix and two nits. |
| 2026-10-19 | R-32 | implementation | `bdaa69d` | claude-fable-5-1 | procedural | Ran every scenario and the public install. 31 criteria met, AC-02 with its residual; AC-10 not verified, because no S7.7 run has reached the acceptance row. Four findings: two should-fix and one nit of fact, one judgement nit. |
| 2026-10-19 | R-33 | implementation | `0a572ca` | claude-fable-5-1 | procedural | Closed early, after the static checks, the public install and S13.1 and S13.2. Eight criteria met, AC-02 with its residual, 24 not verified. One blocking factual finding: S7.7.accept's summary was never committed. One should-fix and one nit of fact. |
| 2026-10-19 | R-34 | implementation | `78e820a` | claude-fable-5-1 | procedural | Ran every scenario and the public install. All 32 criteria met, AC-02 with its residual. Two judgement findings, a should-fix and a nit; nothing blocking. |

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

### R-21

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan AC-32 row versus AC-14 and the Review Log format; Test Plan S11
EVIDENCE: The new proof row (docs/specs/personal-development-loop.spec.md:1020) seeds "S6, S9, S11 and S13" with canary tells and then scans their "changed feature documents" and fails "on any surviving canary". A feature document also holds the reviewer's records "stored verbatim under `### R-<n>`" (line 763; AC-14 line 866-868; S11 passes when "Four distinct verdicts stored verbatim"), which D-28 and the Operations sentence (line 95, 677) forbid the loop to edit. A reviewer that quotes a seeded tell as EVIDENCE (the R-20 F-01 record in this very document quotes "Let that sink in." and ` -- `) puts a canary into the changed feature document that the loop may not remove, so the scan fails a correct run. The row also names S11 among the scenarios "with fixture inputs (issue body, scripted owner turns)", but S11's setup (line 981) has neither, so it is unstated what S11 seeds.
PROPOSAL: Scope the scan to what AC-32 itself names, "the feature-document prose section the loop writes" plus the Outcome cells, explicitly excluding the verbatim `### R-<n>` records, and state what S11's seeded input is (for example a canary in the fixture criterion text) or drop S11 from the seeded set and keep it only for the Outcome-cell and report scan.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Test Plan AC-32 row versus Design, package layout comment
EVIDENCE: The proof row scans "captured run reports" (line 1020), while the layout says `evidence/<host>/  # recorded summaries, never raw transcripts` (line 563) and the Test Plan stores results "as summaries" (line 957-959). Nothing says where or how a run report is captured for the scan without a transcript.
PROPOSAL: Add a clause to the Test Plan harness paragraph saying the harness captures each operation's final report for the AC-32 scan and discards it, keeping `evidence/` as summaries only.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Operations (intro); Test Plan fixtures paragraph; Test Plan checker paragraph
EVIDENCE: `git -C /home/m/code/vh-adlc diff 471d4e6 0b0f42b` adds lines far from the surrounding 100-column wrap: line 675 ("...Before it commits, posts or reports") is 113 characters; line 943 ("feature document, a deliberate failing test, ... prose canary tells in issue bodies and") is 142 characters followed by a 23-character line "scripted owner turns; a" (line 944); line 934 "For AC-03 it scans the package for canary sentences" is 51 characters mid-paragraph. No em or en dash appears in the added lines.
PROPOSAL: Rewrap the three paragraphs at the document's 100-column width.

### R-22

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Test Plan fixtures/harness paragraph (fix for R-21 F-03)
EVIDENCE: `git -C /home/m/code/vh-adlc show 6d7bb6c:docs/specs/personal-development-loop.spec.md | awk 'NR==957{print length($0)}'` prints 113 for "report, scans it, and discards it; `evidence/` keeps summaries only. AC-22 is asserted from the wrapper's log and", while every other line of the rewrapped paragraph (lines 943-961) is 92 to 103 characters. R-21 F-03 flagged a 113-character line in the Operations intro as "far from the surrounding 100-column wrap"; the fix removes that one and adds an equal-width line here. The three other rewrapped paragraphs are clean, the word diff shows no change beyond the intended additions ("(D-28)", the AC-32 capture sentence, "the wrapper's log"), and no em or en dash appears in the diff.
PROPOSAL: Rewrap lines 956-961 so the AC-32 sentence and the AC-22 sentence break near 100 columns like the rest of the paragraph.

### R-23

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Deterministic core, Commands table (lines 317 to 323)
EVIDENCE: The table gives `--repo <dir> --plugin-pin <sha>` only to `knowledge` (line 317) and writes the other six as `vh-adlc lint <doc>`, `vh-adlc gate <target-status> <doc>`, `vh-adlc fresh <doc>`, `vh-adlc next <doc>`, `vh-adlc find --repo <dir> (--issue <n> | --slug <s>)` and `vh-adlc review check <doc> --review R-<n> --returned <file>` (lines 318 to 323). The released v0.1.0 binary requires the pin on every command: `cmd/vh-adlc/main.go:145` registers `--plugin-pin` on every command's flag set and `main.go:159` returns a usage report when it is missing. Running the table's gate line as written, `vh-adlc gate planned docs/specs/personal-development-loop.spec.md --repo /home/m/code/vh-adlc`, prints `{"schema_version":1,"command":"gate","result":"usage",...,"findings":[{"code":"usage","message":"--plugin-pin must be a full 40-character lowercase SHA",...}]}` and exits 2. The child records this as "a deliberate extension" (docs/specs/vh-adlc-binary.spec.md, Invocation, "The parent's table shows `--plugin-pin` only on `knowledge`...so the plugin's skills pass the pin on every call") while its Context says "Where this document and the parent disagree, the parent wins and the disagreement is a finding." The parent's Test Plan (line 934) makes the checker verify that "each status-changing skill names its `vh-adlc gate` command", so phase 4 skills and the T14 checker take the invocation from this table, and the literal form fails.
PROPOSAL: Revise the Commands table so every command carries `--repo <dir> --plugin-pin <sha>` (and `--offline`), matching the released binary; until that revision lands, phase 4 skill text must follow the child's Invocation section, not this table.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter `covers` (line 18); Design, "The binary in the repository" (lines 442 to 443)
EVIDENCE: `covers` lists `gitversion.yml`, and Design says the release workflow runs "only when binary paths change (`cmd/`, `internal/`, `go.mod`, `go.sum`, the GoReleaser and GitVersion configuration)". `git ls-files | grep -i gitversion` in /home/m/code/vh-adlc prints nothing: no GitVersion configuration file exists. The merged `.github/workflows/release.yml` filters on `cmd/**`, `internal/**`, `go.mod`, `go.sum`, `.goreleaser.yml` and `.github/workflows/release.yml`, and runs `michielvha/gitversion-tag-action` with its bundled configuration; the child's Delivery states "no `gitversion.yml` is committed". The `covers` entry therefore matches nothing and the named release trigger does not exist, while the real sixth trigger (the workflow file itself) is unnamed.
PROPOSAL: At the next normative revision, drop `gitversion.yml` from `covers` and reword the path-filter sentence to name `.goreleaser.yml` and `.github/workflows/release.yml`, with GitVersion configured by the action's bundled file.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter `covers` (lines 6 to 20); Design, Contract (line 405); Design, "The binary in the repository" (lines 419 and 439 to 440)
EVIDENCE: Contract says "A JSON Schema for the output lives in the binary's repository"; phase 3 landed it at `schema/vh-adlc.schema.json` (listed by `git ls-files`) and the child covers `schema/`, `.gitignore` and `.golangci.yml`. The parent's `covers` names none of the three, although Design makes normative statements about each: the schema and `schema_version` (line 405), the anchored `/vh-adlc` ignore (lines 439 to 440) and the `golangci-lint config verify` and `run` gates (line 419). A later change to the output schema, which the phase 4 installer and skills parse, or to the ignore or lint configuration, would not stale this document's spec review, and the merged `release.yml` path filter also omits `schema/`.
PROPOSAL: Add `schema/`, `.gitignore` and `.golangci.yml` to `covers` at the next normative revision, and have the phase 4 checker read the output contract from `schema/vh-adlc.schema.json` rather than from the Contract bullet.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, Deterministic core, freshness bullets (lines 358 to 361); Owner decisions D-29 (line 96)
EVIDENCE: Line 361 states of spec-review drift "The feature's own commits cannot cause it." The released binary's `fresh docs/specs/personal-development-loop.spec.md --repo /home/m/code/vh-adlc --plugin-pin e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a` reports `spec_review: R-22 at 6d7bb6c, stale, reasons: ["covered-drift"]` with 63 `covered-drift` findings, every one a file the child feature itself merged at `595e6fb`, and no `baseline-changed`. D-29 already records this as "A known gap for this document's next normative revision". Nothing to decide now; the acceptance is kept by drift alone because the baseline is byte-identical between `6d7bb6c` and `5f44a40` (the diff touches only `status`, `status_description`, the D-29 row, T12's tick and evidence, Review Log rows and the R-22 record).
PROPOSAL: At the revision D-29 queues, reword the bullet to "cannot cause it before the feature merges" and name the post-merge drift-only review as the clearing path.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design, Contract (line 389); Design, "The binary in the repository" (lines 419 to 420)
EVIDENCE: Contract lists the output object as "`schema_version`, `command`, `result`, and `findings[]`", while the released schema requires `knowledge` and `data` as well (`schema/vh-adlc.schema.json` `required` array; `internal/report/report.go` `Report` struct). Line 419 names four release gates, while the merged `ci.yml` and `release.yml` also run `gofmt -l`, `go mod tidy -diff` and `go build ./cmd/vh-adlc`. Neither is a contradiction, both lists are subsets of what shipped, but a phase 4 reader building the checker from the Contract bullet alone would miss two required members.
PROPOSAL: Fold the two extra members and the three extra gates into the text at the next normative revision; no action before then.

### R-24

FINDING: F-01
KIND: judgement
SEVERITY: nit
WHERE: Design, Deterministic core, invocation paragraph (lines 317 to 320) and its pointer to the child's Invocation section
EVIDENCE: The new paragraph sends the reader to `docs/specs/vh-adlc-binary.spec.md` for "the full grammar". That section (lines 108 to 110) still says "The parent's table shows `--plugin-pin` only on `knowledge`; this is a deliberate extension", which was true at `6d7bb6c` and is false at `d733074`, where every row of the Commands table carries `--repo <dir> --plugin-pin <sha>`. The child's Context rule makes any parent-child disagreement a finding, so a reader following the pointer meets a sentence the revision itself made stale. The parent's own text is correct; the child's `--version` and flag-order statements match the released binary (`vh-adlc --version` prints `vh-adlc 0.1.0`; `vh-adlc lint --repo . --plugin-pin <sha> <doc>` and `vh-adlc gate --repo . planned --plugin-pin <sha> <doc>` both run).
PROPOSAL: No change to this document. In the child's next docs-only commit, replace the "deliberate extension" sentence with one stating that the parent's table carries the pin on every command, so the two documents agree again.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Owner decisions, D-29 (line 98)
EVIDENCE: The reworded clause reads "Design's 'The feature's own commits cannot cause it' was qualified to hold only until the feature merges in the revision after R-23." The adverbial "in the revision after R-23" sits next to "merges", so the sentence can be read as the feature merging in that revision rather than the qualification being made in it. The freshness bullet it refers to (lines 367 to 369) is unambiguous and matches the released binary's behaviour recorded in R-23 F-04.
PROPOSAL: Reorder to "was qualified, in the revision after R-23, to hold only until the feature merges."

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design, Contract (lines 397 to 399); Test Plan, checker paragraph (lines 941 to 947); Tasks, T14 (lines 1132 to 1136)
EVIDENCE: R-23 F-03 proposed two things: add `schema/`, `.gitignore` and `.golangci.yml` to `covers` (done, lines 18 to 20) and "have the phase 4 checker read the output contract from `schema/vh-adlc.schema.json` rather than from the Contract bullet". The revision adds the sentence "`schema/vh-adlc.schema.json` describes the object and lists every result and code" to the Contract (true: the schema's `required` array is the six members named, its `result` enum has 10 values and its finding `code` enum has 54, covering every code used under `internal/` and `cmd/`), but neither the checker paragraph nor T14 names the schema as what the checker or scenarios validate gate output against, and nothing records that this half of the proposal was declined. The commit message of `d733074` lists the Contract pointer only.
PROPOSAL: Either add "validates every captured `vh-adlc` JSON result against `schema/vh-adlc.schema.json`" to the checker paragraph and T14, or note in the R-23 disposition that the checker checks the package, not the binary, so the pointer in the Contract is the whole fold.

### R-25

CRITERION: AC-01 Installing `vh-adlc` leaves `github-app-registration`, its files and the marketplace identity unchanged, and uninstalling restores the previous state.
VERDICT: not verified
EVIDENCE: `bun test tests/vh-adlc` at 8d62bb1, 65 pass; the marketplace test compared the `github-app-registration` entry with `origin/main` and `git diff --quiet origin/main -- plugins/github-app-registration` was clean, and `git diff origin/main -- .claude-plugin/marketplace.json` adds only the `vh-adlc` entry. The host half (install, then uninstall restoring the previous state) is S1, recorded in `tests/vh-adlc/evidence/claude-code/S1.md`, which I did not execute; S1's harness also never checks the other plugin's installed state (F-01).

CRITERION: AC-02 One manifest, no generated mirror, no build step; the same tree loads on every claimed host with all seven operations and the reviewer discoverable under the documented invocation.
VERDICT: not verified
EVIDENCE: `bun test tests/vh-adlc` at 8d62bb1 passed the one-manifest, no-root-`plugin.json`, seven-skill-name and agent checks; `find plugins/vh-adlc` shows one `.claude-plugin/plugin.json` and no generated tree. Discovery on the one claimed host (Claude Code CLI) is S1, whose recorded summary I did not observe running; the README lists the desktop app, VS Code extension and remote sessions as unsupported, so nothing wider is claimed.

CRITERION: AC-03 The package contains no convention text and no template; every operation reports the docs revision and page it took each convention from.
VERDICT: not verified
EVIDENCE: `bun test tests/vh-adlc` at 8d62bb1: the canary scan against ten pages at `e4d58d2` found no sentence from the docs in the package, and `plugins/vh-adlc/` holds no template. The reporting half is S2's knowledge-line checks (`tests/vh-adlc/scenarios/run.ts`, "knowledge ran first"), recorded in S2.1 to S2.8 and not executed by me.

CRITERION: AC-04 Knowledge resolution uses the repository pin; else the plugin pin with onboarding added in the first change; and stops with a precise report on an invalid pin, a page missing at the repository pin, or unreachable docs. It never reads `main`.
VERDICT: not verified
EVIDENCE: `go test ./...` at 8d62bb1 passed `TestPins` (`internal/knowledge/knowledge_test.go`: no pin, repository pin, two bridges, short SHA, branch name, two SHAs) and the golden `knowledge-invalid-pin` and `knowledge-missing-page` cases; `vh-adlc knowledge --repo . --plugin-pin e4d58d2... --page conventions/feature-documents.md --page guides/humanize-prose.md` answered source `repository`. The onboarding commit, the stop-and-report behaviour of the operations and the eight S2 variants are scenario proofs I did not execute.

CRITERION: AC-05 Changing only the docs revision (or only its rules block) changes the loop's behaviour, with no plugin or binary change.
VERDICT: not verified
EVIDENCE: `bun test tests/vh-adlc/fixtures.test.ts` at 8d62bb1: with the same binary, revision A finds `docs/internal/plans/greeting-name.md` and revision B finds nothing, and revision B's block changes the `planned` gate; golden `gate-planned-revision-b` and `knowledge-revision-b` pass. That is the binary's behaviour; the loop's behaviour under the two revisions is S3 (S3.A, S3.B), which I did not run.

CRITERION: AC-06 Where local instructions conflict with the pinned conventions, the local rule is followed and the conflict reported.
VERDICT: not verified
EVIDENCE: Inspected `plugins/vh-adlc/references/loop.md` ("Local instructions win over the central pages; report every conflict") at 8d62bb1. The only proof is S4, whose summary I did not observe being produced.

CRITERION: AC-07 Installing the plugin makes no unrelated request enter the loop; every operation is reachable under its documented invocation; with a fixture plugin exposing `spec`, `implement` and `review` installed, `vh-adlc` shadows none of its skills.
VERDICT: not verified
EVIDENCE: `bun test tests/vh-adlc/fixtures.test.ts` at 8d62bb1 confirmed the fixture plugin exposes `spec`, `implement` and `review`; every skill description in `plugins/vh-adlc/skills/*/SKILL.md` says "Use only when the owner invokes". The behaviour itself is S5, not executed by me.

CRITERION: AC-08 Starting from an issue or topic that has a feature document extends it; no second document or issue appears.
VERDICT: not verified
EVIDENCE: Inspected `vh-adlc-spec/SKILL.md` step 2 and `find` golden case at 8d62bb1 (`go test ./...` pass). The proof is S6, which I did not run.

CRITERION: AC-09 An unanswered Open Question, a missing Test Plan row, no fresh clean spec review or no `accepted by owner` row at the current normative baseline prevents `planned`, implementation entry or re-entry, and `complete`; the binary names each failing condition. After interruption, resume routes an unanswered question to the owner rather than continuing implementation or shipping.
VERDICT: not verified
EVIDENCE: `go test ./...` at 8d62bb1 passed `internal/gate` and the golden `gate-*` cases; `vh-adlc gate complete docs/specs/personal-development-loop.spec.md --repo . --plugin-pin e4d58d2...` exited 1 naming `all_met`, `impl_review_fresh`, `impl_review_clean`. The operation-level refusals and the interrupted-resume path are S7.1 to S7.9, not executed by me.

CRITERION: AC-10 The acceptance order produces exactly one `accepted by owner` row at the reviewed commit, and only then `planned`; a later drift-only re-review adds a review row but no new acceptance row.
VERDICT: not verified
EVIDENCE: Inspected this document's Review Log at 8d62bb1: one acceptance row per accepted review (R-15, R-19, R-22, R-24), and R-23's drift-only review added no acceptance; `vh-adlc fresh` reports R-24 at `d733074` not stale. The proof is S7, which I did not run.

CRITERION: AC-11 Re-running `tasks` on a partly ticked list preserves checked tasks and evidence and replans only the unchecked tail in dependency order.
VERDICT: not verified
EVIDENCE: Inspected `vh-adlc-tasks/SKILL.md` at 8d62bb1 (keep checked lines byte for byte, next ID above the highest). The proof is S8, recorded in `S8.md`, not executed by me.

CRITERION: AC-12 `implement` pushes the claim commit, works on the feature branch, observes the regression test failing then passing, and leaves unrelated staged, tracked and untracked content byte-identical.
VERDICT: not verified
EVIDENCE: `git show --stat 65e772d` on `origin/main` at 8d62bb1: this feature's own claim commit changes only the document and carries `vh-adlc gate in-progress: pass (rules 1, docs e4d58d2)`. The failing-then-passing test and the preservation checks are S9.1 to S9.3, which I did not run.

CRITERION: AC-13 A new session given only the issue or document reconstructs status, remaining tasks, review target, owning worktree and blockers; after any required owner-confirmed handoff, it re-enters the feature branch and continues the next safe task. Missing committed state is reported as a blocker.
VERDICT: not verified
EVIDENCE: `vh-adlc next` and `fresh` at 8d62bb1 answer `implement` ("tasks_open holds") and the review state for this document; the resume skill and `references/authority.md` carry the handoff rule. The proof is S10.1 and S10.2, not executed by me.

CRITERION: AC-14 `review` runs in a separate context against a recorded target, returns all four verdicts distinctly on the fixture, stores them verbatim (confirmed by `vh-adlc review check`), and records model and isolation level.
VERDICT: not verified
EVIDENCE: `go test ./...` at 8d62bb1 passed golden `review-check` and `review-check-differs`; `plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md` and `vh-adlc-review/SKILL.md` carry the `MODEL:` line and isolation rule. The proof is S11.1 to S11.5, which I did not run.

CRITERION: AC-15 With the reviewer undispatchable or a named model unavailable, the review stays visibly pending, a self-contained handoff is produced, and nothing is labelled independent that was not.
VERDICT: not verified
EVIDENCE: Inspected `vh-adlc-review/SKILL.md` Dispatch section at 8d62bb1. The proof is S11.4 and S11.5, not executed by me.

CRITERION: AC-16 A covered commit after implementation review blocks `complete`; staged, unstaged and non-ignored untracked covered changes fail `feature_tree_clean` without disturbing unrelated work. A changed normative baseline invalidates acceptance and both reviews, even after re-acceptance without code changes; old criterion ticks, evidence and residuals do not authorise completion. Covered default-branch drift is recoverable with or without an existing feature branch, including at `planned`; unchanged normative content keeps acceptance. Checkbox, evidence/residual and Review Log annotation changes alone cause no staleness.
VERDICT: not verified
EVIDENCE: `go test ./...` at 8d62bb1 passed `internal/fresh` and `internal/gate`; `vh-adlc fresh` on this document reports `feature_tree` clean and the spec review fresh after annotation-only commits since `d733074`. The thirteen S12 cases that exercise the loop's recovery are scenario proofs I did not execute.

CRITERION: AC-17 "Continue", even with an issue body saying "merge when green", progresses accepted local work but does not push the feature branch, merge, release, restart an app or touch another repository.
VERDICT: not verified
EVIDENCE: Inspected `vh-adlc-resume/SKILL.md` Continue table at 8d62bb1 (`ship` stops; issue text is never authority). The proof is S10, which I did not run.

CRITERION: AC-18 An explicit ship produces one PR, `Closes` only when every criterion is met and `Refs` otherwise (including a `complete` feature with a residual), CI reported for the pushed commit, and a failed push reported as partial with exact steps.
VERDICT: not verified
EVIDENCE: Inspected `vh-adlc-ship/SKILL.md` Deliver section at 8d62bb1. The proof is S13.1 to S13.6 against `michielvha/vh-adlc-ship-fixture`, which I did not run and did not query.

CRITERION: AC-19 No output, document or evidence file contains the fixture's secret canaries.
VERDICT: not verified
EVIDENCE: `grep -rn` for `vhadlc-secret-canary-7f3e9a`, `ghp_vhadlcCanaryToken0000000000000000` and token-shaped strings over `tests/vh-adlc/evidence/` at 8d62bb1 found nothing. The run outputs and fixture documents are scanned by the harness (`run.ts` secret check) and discarded, so that part I could not observe.

CRITERION: AC-20 The README documents install, update and uninstall per claimed host as tested, and a support matrix listing every unproven host, harness or capability as unsupported.
VERDICT: not verified
EVIDENCE: `bun test tests/vh-adlc` at 8d62bb1 passed the README headings check; reading `README.md`, the support matrix claims only Claude Code CLI on Linux and marks the desktop app, VS Code extension, remote sessions, VS Code Copilot Chat harnesses, Copilot CLI, macOS and structural isolation unsupported, matching `tests/vh-adlc/evidence/`. "As tested" fails for the Update section: `grep -rn "plugin update\|marketplace update" tests/vh-adlc/` finds no scenario step and no evidence file records an update run (F-02).

CRITERION: AC-21 On Claude Code an independent pass with no model named runs on `fable`, or announces and records `opus` when `fable` is refused; a named model is used as given; the Review Log records the model that ran.
VERDICT: not verified
EVIDENCE: Inspected `references/review-protocol.md` Models section and `S11.2.md` (records opus, "the opus fallback was announced") at 8d62bb1. The proof is S11, whose execution I did not observe.

CRITERION: AC-22 Every status change in every scenario is preceded by the matching `vh-adlc gate` call (or by a procedural gate the owner allowed in that run, recorded with its reason), whose JSON result appears in the run report; with a failing gate the operation stops and changes nothing.
VERDICT: not verified
EVIDENCE: `bun test tests/vh-adlc` at 8d62bb1 passed the gate-command check for `spec`, `implement` and `ship`; `git show 65e772d` shows this feature's one real status change on `main` carrying the gate line. The per-scenario assertion from the wrapper log (`gateCalls` in `run.ts`) ran in the author's scenario runs, which I did not execute.

CRITERION: AC-23 Every binary command gives byte-identical output and the documented exit code for identical inputs, with no timestamp or nondeterministic ordering.
VERDICT: met
EVIDENCE: `go test ./...` at 8d62bb1 passed `cmd/vh-adlc/golden_test.go`, which runs each of 23 golden cases twice, requires identical stdout and exit, and checks the exit against the documented table; running the released 0.1.0 `lint`, `fresh`, `gate complete`, `next` and `find --slug` twice each on this repository gave byte-identical output (exits 0, 0, 1, 0, 0). Limitation: the Go tree is unchanged since the released commit `595e6fb` (`git diff --stat 595e6fb HEAD -- cmd internal go.mod go.sum` empty), so the released binary and the tested source agree; cases outside the golden set were not enumerated.

CRITERION: AC-24 The binary takes every status, transition, section, ID and verdict rule from the pinned rules block; an unknown `schema` exits `3` and never passes; an unrecognised local format never passes.
VERDICT: met
EVIDENCE: `go test ./...` at 8d62bb1 passed `internal/rules/rules_test.go` (missing block, wrong info string, two blocks, unknown schema gives `rules-schema-unknown`, unknown gate and next conditions, invalid patterns) and the six golden `local-format-*` cases mapped to exit 3; `grep` for any quoted status or verdict literal in non-test Go under `cmd/` and `internal/` found none; `bun test tests/vh-adlc/fixtures.test.ts` showed revision B's block changing the feature root and the `planned` gate with the same binary. Limitation: "every rule" rests on that test coverage and the fixture docs repository, not on an exhaustive mutation of the block; S3 was not executed by me.

CRITERION: AC-25 The installer uses only the exact locked version and verifies the selected executable's SHA-256 on every PATH/cache reuse and the downloaded asset's SHA-256 before extraction. Matching versions with wrong or missing digests fail closed with an explicit error; another-version PATH binary is ignored with a diagnostic. It writes only to the user cache and verifies downloaded content before execution.
VERDICT: met
EVIDENCE: `bun test tests/vh-adlc` at 8d62bb1 ran `ensure.test.ts` (the S15 cases): valid PATH, cache, offline-from-cache and download sources; wrong-version PATH ignored with "ignoring"; same-version PATH, planted cache and post-install tampering fail with "digest" and the marker file proves no execution; wrong asset digest, wrong binary digest and missing binary digest never execute or cache; writes confined to the fake HOME's cache; and the real lock installed the released 0.1.0 whose digest equals `binary_sha256`. `bun test tests/vh-adlc` also passed the lock-shape check. Limitation: run on linux_amd64 only; the darwin branches of the script were inspected, not run.

CRITERION: AC-26 Without the binary, read-only work continues with a visible notice and every status change stops unless the owner allows a procedural gate, which is recorded.
VERDICT: not verified
EVIDENCE: Inspected `references/loop.md` ("deterministic checks unavailable", procedural gate line) at 8d62bb1 and the S14 summaries for all seven operations. The proof is S14, which I did not run.

CRITERION: AC-27 The binary in `michielvha/vh-adlc` follows the Go conventions at its pinned docs revision: `cmd`/`internal` layout, anchored binary ignore, test, vet and lint gates before release, actions pinned to full SHAs, released platforms equal to the lock's, `checksums.txt` published with a detached `checksums.txt.sig` that verifies against the committed `release-signing-key.asc`, whose primary fingerprint is `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6` (D-27) and is the one the README prints with its verification steps, and no release from a commit that touches no binary path.
VERDICT: met
EVIDENCE: At 8d62bb1: `cmd/vh-adlc/main.go` plus `internal/*` match `conventions/go.md` at `e4d58d2` (layout, `/vh-adlc` anchored in `.gitignore`, gates before publication); `.github/workflows/ci.yml` and `release.yml` run gofmt, tidy, vet, test, build, `golangci-lint config verify` and `run` before GitVersion and GoReleaser, every `uses:` pinned to a 40-hex SHA; `gh release view v0.1.0` lists exactly the four lock platforms plus `checksums.txt` and `checksums.txt.sig`, asset digests equal to `vh-adlc.lock.json`; in an empty keyring, `gpg --show-keys release-signing-key.asc` lists `VHCO Pro (Release Signing Key) <release@vhco.pro>` first with fingerprint `9A5C D8F7 CF96 17B1 C57F 359E D61B 8A7F 2C06 BAB6`, `gpg --verify checksums.txt.sig checksums.txt` gives "Good signature" with that primary fingerprint, `sha256sum --check --ignore-missing checksums.txt` reports the linux_amd64 archive OK and the extracted binary's digest equals the lock's `binary_sha256`; `README.md` prints the same fingerprint, the subkey note and the five steps; `gh run list --workflow release.yml` shows one run (`595e6fb`) while `main` has five later docs-only commits. Limitation: `golangci-lint` is not installed here, so the lint gate is observed through the successful CI runs at `595e6fb`, which the unchanged Go tree still covers.

CRITERION: AC-28 `michielvha/vh-adlc` is the public successor of `michielvha/claude-plugins`, public only after a recorded history audit the owner confirmed; `vh-adlc@vhco-tools` and `github-app-registration@vhco-tools` install from it on every claimed host without a credential.
VERDICT: not met
EVIDENCE: `gh api repos/michielvha/vh-adlc` reports `visibility: public`; `gh api repos/michielvha/claude-plugins` returns 404; the audit at `25529ab` and the owner's confirmation are recorded under One repository and T9/T10 at 8d62bb1. But `gh api repos/michielvha/vh-adlc/contents/.claude-plugin/marketplace.json?ref=main` lists only `github-app-registration`, and `contents/plugins?ref=main` holds no `vh-adlc` directory, so `vh-adlc@vhco-tools` cannot install from the public repository today; T32's own evidence says this waits for the merge (F-04). Limitation: no install was attempted; the contradiction is the absent entry.

CRITERION: AC-29 Different features progress concurrently in separate host-managed worktrees; same-feature re-entry requires an owner-confirmed handoff and uses the owning worktree. The loop neither force-moves branches nor creates, deletes or resets worktrees, and preserves unrelated work.
VERDICT: not verified
EVIDENCE: Inspected `references/authority.md` Preservation and Handoff sections at 8d62bb1; `bun test tests/vh-adlc/fixtures.test.ts` confirmed the fixture has a host-managed worktree on `feat/other-work`. The proof is S9 and S10, which I did not run.

CRITERION: AC-30 Docs-only feature-document, claim and Markdown onboarding deliveries carry `[skip ci]` only when the commit, outgoing range and PR diff contain no code, tests, workflows or other non-documentation changes. A docs-only final commit never suppresses CI for mixed delivery; reports distinguish skipped CI from a passing verification run.
VERDICT: not verified
EVIDENCE: At 8d62bb1, `git log origin/main..HEAD` holds 40 commits touching `plugins/`, `tests/`, `.github/` and the document, none carrying `[skip ci]`; the docs-only claim `65e772d` on `main` carries it. Those are this feature's own commits; the criterion's proof is S9.1 and S13.1 to S13.6, which I did not run.

CRITERION: AC-31 The checker and its CI run on Bun, and the plugin's resolved docs pin names Bun as the default for JavaScript tooling and tests without the conflicting Node 24 requirement.
VERDICT: met
EVIDENCE: `bun test tests/vh-adlc` (Bun 1.4.3) at 8d62bb1 passed, including the test that `.github/workflows/ci.yml` runs `bun test tests/vh-adlc` under `oven-sh/setup-bun@0c5077e...` and the test reading `conventions/coding.md` at `e4d58d2`; `grep -n -i "bun\|node 24"` on the cached page shows "New JavaScript tooling and tests use Bun" and no Node 24 requirement. Limitation: the CI job itself was observed only as configuration, not as a run on this branch.

CRITERION: AC-32 Every commit message, PR body, issue update, feature-document prose section, review summary and run report the loop writes is edited with the humanize prose guide at its resolved docs revision: none of that text keeps a canary tell seeded into the fixture inputs or contains an em dash, an en dash or ` -- ` used as a dash, and the run report cites the guide and revision.
VERDICT: not verified
EVIDENCE: `bun test tests/vh-adlc` at 8d62bb1 passed the guide-named-in-every-skill and no-dash package checks; `grep -rnP` for em and en dashes over `tests/vh-adlc/evidence/`, `README.md`, `plugins/vh-adlc/` and `docs/specs/*.md` found none, and ` -- ` appears in the spec only inside code spans and verbatim R-20 and R-21 records. The seeded-canary scans of the loop's commits, PR and issue text and reports (`canaryFree` in `run.ts`, S6, S9, S11, S13) ran only in the author's scenario runs, which I did not execute.

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan S1; tests/vh-adlc/scenarios/run.ts (S1 checks)
EVIDENCE: AC-01 requires that installing `vh-adlc` leaves `github-app-registration` unchanged and that uninstalling restores the previous state, and S1's pass condition is "uninstall leaves the marketplace as before". The S1 harness installs only `vh-adlc@vhco-tools`, runs `plugin uninstall` and then `plugin marketplace remove vhco-tools`, and its checks are "install and marketplace commands succeed" and "uninstall leaves no vh-adlc plugin" (`run.ts` lines 249 to 283). Nothing installs or inspects `github-app-registration` on the host, and nothing compares the profile before and after. The only check behind AC-01's "unchanged" is the checker's `git diff` against `origin/main`, which proves the repository, not the host.
PROPOSAL: In S1, install `github-app-registration@vhco-tools` first, snapshot the profile's plugin list and installed files, install and uninstall `vh-adlc`, and assert the snapshot is unchanged before removing the marketplace.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Tasks T31 evidence; README.md Update section; Acceptance Criteria AC-20
EVIDENCE: T31's evidence says the README documents "the install, update and uninstall commands, as they ran in an isolated Claude Code profile on 2026-10-18". `grep -rn "plugin update\|marketplace update\|\"update\"" tests/vh-adlc/` finds no scenario step, S1's harness runs marketplace add, install, uninstall and marketplace remove only, and no file under `tests/vh-adlc/evidence/` mentions an update. The README's `claude plugin marketplace update vhco-tools` and `claude plugin update vh-adlc@vhco-tools` therefore have no recorded run, while AC-20 requires "as tested".
PROPOSAL: Add an update step to S1 (install an older fixture version, bump, update, assert the new version is installed), or record a by-hand update run in `tests/vh-adlc/evidence/claude-code/` and cite it from T31.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: README.md support matrix; Tasks T30 and T32 evidence
EVIDENCE: The support matrix row reads "Claude Code CLI 2.1.284, Linux", and T32's evidence says "all 67 scenarios of S1 to S15, passed headless on Claude Code 2.1.284" and T30's says S13 passed "on Claude Code 2.1.284". `grep -h "^| Host |" tests/vh-adlc/evidence/claude-code/*.md | sort | uniq -c` gives 57 files at 2.1.284 and 10 at 2.1.302 (S7.7, S9.1, S9.2, S12.13, S13.1 to S13.6). The re-runs the evidence lines describe happened on a later host version than the one the README and the tasks name.
PROPOSAL: Name both versions in the support matrix row and in T30 and T32 ("2.1.284, with re-runs on 2.1.302"), or re-run the ten on 2.1.284.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-28; Tasks T32; Owner decisions D-29
EVIDENCE: AC-28's install clause and T32's "both public plugins installing from `michielvha/vh-adlc` without a credential" can only hold after this branch merges: `origin/main` has no `vh-adlc` marketplace entry or plugin directory (observed through `gh api ... ?ref=main`). The same shape arose for the child feature and was settled by D-29, which allows two post-merge docs-only commits on the default branch. D-29 is written "for the binary child feature only", so no rule covers how this document records the post-merge install evidence, and `all_met` cannot pass before merge without either a residual on AC-28 or an exception like D-29.
PROPOSAL: Decide one of: add a residual on AC-28 naming a tracker for the post-merge install check, or extend D-29 to this document for one post-merge docs-only evidence commit, and record the decision before the completion gate is attempted.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Tasks T23 evidence; tests/vh-adlc/evidence/claude-code/S1.md
EVIDENCE: T23's evidence states "Skills read `references/`, `knowledge.md` and `scripts/` outside their own directory." The current S1 summary (full run at `6a8cb22`) records the host fact as "references/loop.md ok, references/authority.md ok, knowledge.md ok, scripts/ensure-vh-adlc.sh ok, references/review-protocol.md failed", and `hostFacts` in `run.ts` marks a file "failed" only when no tool call reading it succeeded in the whole run. The pass condition (`readsOutside`) needs only one `references/` file and `knowledge.md`, so the check passed while one reference was never read successfully.
PROPOSAL: Narrow T23's sentence to the files that were read, and either make `readsOutside` require every `references/` file the skills name or record in S1's notes why `review-protocol.md` failed.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md, Rules
EVIDENCE: The agent file allows "the `vh-adlc` binary (`lint`, `fresh`, `gate`, `next`)", while `references/review-protocol.md` and the review skill expect the reviewer to be able to run `knowledge` (to resolve the pages it reads) and the dispatch text in use adds `review check`. A reviewer that follows the file as written would not run either, and the two texts disagree on the reviewer's permitted commands.
PROPOSAL: List `knowledge` and `review check` alongside the four in the agent file, so the file and the dispatch agree.

### R-26

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design, Models (and the Hosts table of host facts)
EVIDENCE: Design says of a named model: "passed as given, with no fallback: if the host rejects it, the review stays pending and lists what the host offers". Commit ea78b15 (merged in PR #2) records a host fact the Hosts table lacks: with `fable` excluded through the profile's `availableModels`, Claude Code 2.1.284 ran the reviewer on the session's model with no notice in the Agent result. The covered tree now handles it in `plugins/vh-adlc/references/review-protocol.md`, Models: "A host may run a subagent on another model than the one asked for, without saying so ... a refused `fable` that ran on `opus` is the fallback above, and any other difference is reported as it is", and `plugins/vh-adlc/skills/vh-adlc-review/SKILL.md`, Store and apply, step 1 stores the row with the model the `MODEL:` line names "if that model is not the one you asked for, say so". So a named model that settings refuse yields a stored, counted review on another model, where the baseline says no fallback and pending. S11 does not exercise this path: `tests/vh-adlc/scenarios/run.ts:1057` makes S11.4's named model `claude-nonexistent-9`, which the host rejects outright; S11.2 restricts `availableModels` only for the unnamed case.
PROPOSAL: Add the silent-substitution fact to the Hosts table, and in Models say what the loop does when the host runs a named model on another one without rejecting it (treat the stored review as pending and not current, or accept it with the recorded model), then align review-protocol.md and add an S11 case that names a real model excluded by `availableModels`.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design, Hosts (the "Not yet established" paragraph)
EVIDENCE: The baseline states "how a skill locates the plugin root (Claude Code sets `CLAUDE_PLUGIN_ROOT`)". Commit 44563b7 (merged in PR #2): "A headless probe on Claude Code 2.1.284 found CLAUDE_PLUGIN_ROOT empty in a skill's Bash environment." `tests/vh-adlc/evidence/claude-code/S1.md`, Notes: "Host fact, plugin root: 10 installer call(s), 0 through CLAUDE_PLUGIN_ROOT and 10 through a literal plugin path". `plugins/vh-adlc/references/loop.md`, section 1, now leads with "two levels above the skill's own directory" and uses `$CLAUDE_PLUGIN_ROOT` "only when the environment sets it".
PROPOSAL: Replace the parenthetical with the measured result (the variable is empty in a skill's shell on Claude Code 2.1.284; the plugin root is the directory two levels above the skill), or drop the parenthetical, since the three facts the paragraph lists are now settled by S1.

### R-27

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Acceptance Criteria, AC-28
EVIDENCE: `git diff abf85ce 2e3ad39` removes AC-28's two `Evidence:` header lines (R-25's "not met" line and "Evidence: after the merge at `49c76b1`, on 2026-10-18, a Claude Code 2.1.302 profile had a fresh") but keeps the five continuation lines beneath them. `docs/specs/personal-development-loop.spec.md:934-939` at `2e3ad39` now read "`HOME`, no GitHub token and no credential helper. In it, `claude plugin marketplace add michielvha/vh-adlc` and both installs exited 0 ... under One repository (T9, T10)." directly under the criterion, with no `Evidence:` prefix. The standard defines criterion text as the text after `AC-NN: ` "plus each following indented line, up to the next list item, `Evidence:` line or `Residual:` line" (`conventions/feature-documents.md`, Review log; rule `criterion_continuation: '^\s+\S'`), so these lines are now part of AC-28's accepted text. `vh-adlc lint` passes at `2e3ad39`, confirming the binary reads them as criterion text, and the next implementation review would have to reproduce them verbatim in its `CRITERION: AC-28` record. This both breaks the reset rule (the evidence was not removed, only decapitated) and changes the normative baseline in a way the revision did not intend.
PROPOSAL: Delete lines 934 to 939 so AC-28 ends at "install from it on every claimed host without a credential."; the install check stays in Git history, in the R-25 subsection and in T32's evidence.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Models (the sentence "the loop compares it with the one requested" and "any difference counts as a rejection"); Test Plan row S11
EVIDENCE: The models the loop requests are aliases (`fable`, `opus`, and S11.3's "Review it with sonnet.", `tests/vh-adlc/scenarios/run.ts:1055`), while the reviewer's `MODEL:` line gives a full ID: `tests/vh-adlc/evidence/claude-code/S11.2.md` records `claude-opus-5-5`, `S1.md` records `claude-opus-5-5` and `claude-fable-5-1`. Read literally, "any difference counts as a rejection" rejects every alias-named review, including S11.3, which the S11 row still expects to be stored and recorded as `sonnet`. The checker compares by substring (`run.ts:1091`, `row[4].toLowerCase().includes(k.expect)`), and `plugins/vh-adlc/references/review-protocol.md:26-27` says only "When it differs from the one you asked for", so nothing in the tree or the document defines the comparison T34 must implement.
PROPOSAL: Say how the two are compared: an alias matches an ID whose family it names (the host's alias table, or the alias as a substring of the ID), a full ID must match exactly, and `MODEL: unknown` for a named model counts as a difference. One sentence in Models, then T34 writes the same rule into review-protocol.md.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Models (default chain), against the new Hosts row and AC-21
EVIDENCE: The new Hosts row says the host runs the subagent "on the session's model" when settings refuse the requested one. The revised Models paragraph covers two outcomes: a named model that ran elsewhere (rejection, pending) and the default `fable` that ran on `opus` (the announced fallback). It leaves the third undefined: the default `fable` refused while the session runs `sonnet` or `haiku`, so the reviewer silently ran on neither `fable` nor `opus`. AC-21 allows only `fable`, or `opus` announced and recorded. The tree today stores and counts that review (`review-protocol.md:27-28`, "any other difference is reported as it is"; `skills/vh-adlc-review/SKILL.md:47-50` stores the row with the model the line names), which contradicts AC-21, and S11 has no case for it (S11.2 runs with `model: "opus"`, `run.ts:1054`).
PROPOSAL: Add one sentence to Models: when the default chain's pass ran on a model other than `fable` or `opus`, the loop re-dispatches naming `opus` explicitly, and if that pass too ran elsewhere the review stays pending as for a named model. Extend T34 or add T35 so the protocol and S11 cover it, or state in Design that a session model outside the chain is out of scope for v1.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design, Hosts (new table row)
EVIDENCE: The row states the subagent "runs on the session's model". The only measurement behind it is S11.2: `run.ts:1054` sets both `model: "opus"` and `availableModels: ["opus", "sonnet", "haiku"]`, and `S11.2.md` records "Model | claude-opus-5-5" and "the session's model usage shows opus ran". With the session model and the first allowed model both `opus`, the run cannot tell "the session's model" from "the first model the allowlist permits". Commit `ea78b15` asserts "the session's model" in its message but ran the same case.
PROPOSAL: Write the row as what was observed ("runs on another model the settings allow; in the probe, the session's model `opus`"), or have T34's new S11 case set a session model that differs from the allowlist's first entry, so the row's claim is measured.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Design, Models; Tasks T34
EVIDENCE: Models says of a rejected named model that "its records are not stored as a current review", which reads as stored but not current. T34 says "with its records unstored". The two differ on whether the records land anywhere (Review Log history, the handoff, a scratch file) or are dropped. The S11 expected column ("unavailable cases pending with a handoff") and the checker's pending branch (`run.ts:1082-1088`, no review row, criteria untouched, "pending" and "handoff" said) settle only that no row is recorded.
PROPOSAL: Say it once in Models and reuse the words in T34: "no Review Log row or `### R-<n>` subsection is written; the handoff carries the returned text so the owner can run the review on the model named".

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Design, Hosts (the "S1 settles three more facts" paragraph)
EVIDENCE: The paragraph states measured facts ("On Claude Code 2.1.284 a skill reads all three, the reviewer loads and runs with the unknown names in its list, and `CLAUDE_PLUGIN_ROOT` is empty in a skill's shell") with no citation, where the standard asks Design to cite "a `file:line`, or a command and its output" and the table beside it cites "(probe ...)". The facts match `tests/vh-adlc/evidence/claude-code/S1.md`, Notes, and commit `44563b7`, but S1's note also reads "references/review-protocol.md failed" next to the ok reads, which "reads all three" passes over.
PROPOSAL: Cite `tests/vh-adlc/evidence/claude-code/S1.md` (Notes) and `44563b7` in the paragraph, and either say what the failed read of `review-protocol.md` was (a wrong path, not a host restriction) or qualify "reads all three" to the files S1 recorded as ok.

### R-28

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, row S11 (Setup and Passes when), against Design Models (D-34) and Tasks T34
EVIDENCE: The row's new setups are "a real named model the allowlist excludes" and "a default `fable` refused while the session runs a model outside the chain", but the pass column is unchanged: "`fable`, then the announced `opus` fallback, recorded; isolation recorded; unavailable cases pending with a handoff". The condition that makes the second case decide anything, "with the session's model unlike the allowlist's first entry", appears only in T34 (`docs/specs/personal-development-loop.spec.md:1318`), which is outside the normative baseline. The checker's recorded-model check is a substring match on the row and on the session's model usage (`tests/vh-adlc/scenarios/run.ts:1091-1093`); with `availableModels: ["opus", "sonnet", "haiku"]` (`run.ts:1054`) a host that runs the refused pass on the first allowed model passes that check without any second dispatch, so the D-34 re-dispatch is not what the scenario proves. The first new case is a silent substitution the loop treats as a rejection, which "unavailable cases" does not name.
PROPOSAL: Put the discriminating condition in the row's Setup and give each new case its own pass condition: the excluded named model leaves no Review Log row or subsection and a handoff carrying the returned text; the outside-chain default pass is reported as run on the session's model, dispatched again naming `opus`, and recorded as the announced `opus` fallback.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design, Models (the sentence "Each Review Log row records the model that ran, or `unknown`" and the default-chain table row)
EVIDENCE: The paragraph now says "`MODEL: unknown` never matches (D-33)": for a named model that leaves the review pending with no row, and for the default chain it causes a second dispatch naming `opus` and then pending. On Claude Code a row can therefore never record `unknown`, yet the sentence kept from the baseline says it can, and the agent file still instructs `MODEL: unknown` when the system prompt names no model (`plugins/vh-adlc/agents/vh-adlc-reviewer.agent.md:52-53`). The table row for independent passes on Claude Code lists two triggers for `opus` ("If the host rejects it, or the owner declines a usage-credit prompt") while the paragraph adds a third, a default pass that silently ran outside the chain (D-34); "a mismatch counts as a rejection" is stated for a named model only.
PROPOSAL: Say where `unknown` can still be recorded (a host where no model was requested, so there is nothing to compare), or drop the clause; add the silent-substitution trigger to the default-chain table row so the table and the paragraph agree.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Tasks, T34
EVIDENCE: T34 names `plugins/vh-adlc/references/review-protocol.md`, then `skills/vh-adlc-review/SKILL.md` and `skills/vh-adlc-spec/SKILL.md`. The latter two do not exist at those paths from the repository root; the files are `plugins/vh-adlc/skills/vh-adlc-review/SKILL.md` and `plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md` (`ls plugins/vh-adlc/skills`). T33 and the first T34 path use root-relative form, and the standard asks each task to name the file it touches.
PROPOSAL: Write the two skill paths root-relative.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Frontmatter, status_description
EVIDENCE: `docs/specs/personal-development-loop.spec.md:3` reads "Under revision for R-26: Design gains the host facts the implementation measured." At `f4b882e` the revision also applies R-27 (commit subject "apply R-27 and fold in the owner's answers as D-33 to D-35") and is complete; `vh-adlc next --repo . --plugin-pin e4d58d2cd69bd42f1efacf91dfdd3f01a24e134a docs/specs/personal-development-loop.spec.md` answers "spec review" with reason "status draft and spec_review_fresh does not hold: the latest spec review is stale: baseline-changed". The standard wants one line on the current state and what it waits for.
PROPOSAL: State the revision as made (R-26 and R-27 applied, D-33 to D-35 folded) and that it waits for a clean spec review and acceptance.

### R-29

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, row S11 (the outside-chain default case), against Design Hosts (new row) and Models (D-34)
EVIDENCE: The S11 Setup at `docs/specs/personal-development-loop.spec.md:1017` reads "a default `fable` refused while the session runs a model outside the chain (a session model unlike the allowlist's first entry)", and its pass condition is "the outside-chain default pass is dispatched again naming `opus` and recorded as the announced `opus` fallback". Which model the host picks when settings refuse the request is unmeasured: the Hosts row at line 552 says "another model the settings allow ... there the session's model, `opus`", and the only probe, `tests/vh-adlc/scenarios/run.ts:1054`, sets both `model: "opus"` and `availableModels: ["opus", "sonnet", "haiku"]`, so the session's model and the first allowed model coincide (R-27 F-04, stored at lines 1860-1866). If the host runs the first allowed model and the allowlist keeps `opus` first, the refused pass runs on `opus`, which Models at lines 833-834 defines as the announced fallback with no second dispatch, so the case fails although the loop obeys D-34. If the first entry is outside the chain but `opus` is not allowed, the second dispatch also runs elsewhere and D-34's pending outcome follows, not the recorded fallback. The Setup names neither the first entry's family nor that `opus` is allowed, so T34's "both pass" (line 1320) depends on an unmeasured host rule and an unstated allowlist.
PROPOSAL: Write the Setup so the second dispatch is forced under either host rule: `fable` excluded, `opus` allowed but not first, the first entry and the session model both outside the chain (for example `["sonnet", "opus"]` with the session on `sonnet`). Keep the pass condition as it is, and record the model the first pass ran on as the measurement of the Hosts row, separate from the pass condition.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Tasks, T34, against Acceptance Criteria AC-20 and the `covers` frontmatter
EVIDENCE: `README.md:85`, in the support matrix AC-20 requires ("a support matrix listing every unproven host, harness or capability as unsupported", line 918), reads "Choosing the reviewer's model on Claude Code | Supported, with a caveat | When settings refuse the requested model, Claude Code runs the reviewer on the session's model without saying so. The reviewer names the model it ran on, and the Review Log records that model". That describes the pre-revision behaviour in `plugins/vh-adlc/references/review-protocol.md:24-28`. Under D-33 to D-35 (Models, lines 826-837) a named model that settings refuse leaves no Review Log row and the review stays pending, and a default pass outside the chain is dispatched again naming `opus`. `README.md` is listed in `covers` (frontmatter), yet T34 (lines 1315-1322) names only the protocol, the two skills and `run.ts`, so after T34 the README row would state behaviour the loop no longer has, and the standard asks each task to name the file it touches.
PROPOSAL: Add `README.md` to T34 (or a T35) with the done condition that the matrix row states the D-33 to D-35 behaviour: a refused named model leaves the review pending with a handoff, a default pass outside the chain is dispatched again on `opus`, and the Review Log records the model that ran.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design, Hosts (new table row)
EVIDENCE: The table's legend at `docs/specs/personal-development-loop.spec.md:539-540` defines "probe" as "a test plugin on Claude Code 2.1.289 and Copilot CLI 1.0.91 on 2026-10-17", and the new row at line 552 cites "(probe, 2.1.284, `availableModels`; there the session's model, `opus`)". The measurement behind the row is not that probe: it is scenario S11.2 on 2026-10-18, `tests/vh-adlc/evidence/claude-code/S11.2.md` ("Host | 2.1.284", "Model | claude-opus-5-5", "the session's model usage shows opus ran") and commit `ea78b15` ("Claude Code then ran the reviewer on the session's model, opus, without any notice in the Agent result"). The paragraph beneath the table cites its sources by file and commit (line 562), as the standard asks of Design.
PROPOSAL: Replace "probe, 2.1.284" with the source: "(S11.2 on 2.1.284, `tests/vh-adlc/evidence/claude-code/S11.2.md`, commit `ea78b15`; `availableModels` excluded `fable`; there the session's model, `opus`)".

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design, Hosts (the "S1 settles three more facts" paragraph, last sentence)
EVIDENCE: The rewritten paragraph at `docs/specs/personal-development-loop.spec.md:559-567` now reports the three facts as measured on Claude Code 2.1.284 and ends with the baseline's sentence "A failure on a required host becomes an Open Question before phase 5, never a silently duplicated file." Phase 5 is complete: T25 to T27 are ticked at lines 1207-1215, and Open Questions reads "None." (line 1326). The other required host, VS Code Copilot Chat Local, has none of the three facts measured; its run is the residual in D-32 and michielvha/vh-adlc#3. The sentence therefore names a deadline that has passed and leaves the one host where a failure is still possible unmentioned.
PROPOSAL: Replace the sentence with the current state: on VS Code Local the three facts are unmeasured until the D-32 run in #3, and a failure there becomes an Open Question, never a silently duplicated file.

### R-30

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Frontmatter, status_description
EVIDENCE: `docs/specs/personal-development-loop.spec.md:3` at `0c369b2` reads "Revised for R-26 and R-27, with D-33 to D-37 folded in. Waits for a clean spec review and the owner's acceptance". The same commit's subject is "apply R-29 and fold in the owner's answers as D-38 and D-39", the Owner decisions table holds D-38 and D-39 (lines 108-109), and the Review Log table records R-28 and R-29 as applied. R-28 F-04 raised the same lag one round earlier and was accepted; the standard asks for one line on the current state and what it waits for.
PROPOSAL: State the revision as made (R-26 to R-29 applied, D-33 to D-39 folded) and keep the second sentence.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Hosts (table row at line 554) and Test Plan, row S11 (line 1020), with D-38 (line 108)
EVIDENCE: The S11 Setup and D-38 say "the model the first pass ran on is recorded as the Hosts row's measurement". The Hosts row is in Design, which the rules block lists under `normative_sections`, and the released binary compares that text byte for byte: `fresh` at `0c369b2` reports `spec_review: R-29 at 4c40ea7, stale, reasons: ["baseline-changed"]` for this revision, which is itself the result of writing measured host facts into Design after R-26, and the standard says "On a normative revision, every criterion tick, evidence line and residual is reset" (`conventions/feature-documents.md`, Acceptance criteria). So a T34 run that writes the measurement into the row as the words say moves the document back to `draft` during implementation and clears every tick, including the five criteria R-25 found met. Nothing in the row, the S11 row or T34 names the evidence file where the measurement lands instead.
PROPOSAL: Name the place now: the S11 case records the first pass's model in its evidence file under `tests/vh-adlc/evidence/claude-code/`, the Hosts row cites that file alongside S11.2 in this revision, and no Design text changes when the measurement arrives; or state in Design that the row is updated only at the next normative revision.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Test Plan, row S11 (the outside-chain default case), with D-38
EVIDENCE: D-38 says the setup "forces the second dispatch whichever model the host picks", and the S11 pass condition is "the outside-chain default pass is dispatched again naming `opus` and recorded as the announced `opus` fallback". The setup (`["sonnet", "opus"]`, session on `sonnet`) forces it under the two rules R-29 F-01 named, the session's model and the first allowed model. The only measurement, S11.2 (`run.ts:1054`, `S11.2.md`), ran with `opus` as session model, first allowed model and strongest allowed model at once, so a host that picks the strongest allowed model is not ruled out; under that rule the first pass runs on `opus`, Models (lines 826-828) makes that the announced fallback with no second dispatch, and the case fails although the loop obeys D-34. T34's done condition "both pass" (line 1323) then depends on an unmeasured host rule, the gap R-29 F-01 set out to close.
PROPOSAL: Say in the row what the case proves when the first pass ran on `opus`: the host rule is measured and recorded, the pass is the fallback with no second dispatch, and D-34's second dispatch is then unproven on Claude Code and becomes an Open Question; keep the current pass condition for a first pass on `sonnet`.

### R-31

CRITERION: AC-01 Installing `vh-adlc` leaves `github-app-registration`, its files and the marketplace identity unchanged, and uninstalling restores the previous state.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S1 S1.host` in a copy of 02b4b7f, both PASS; S1.host snapshots github-app-registration's entry and six installed files before, during and after installing and uninstalling vh-adlc and finds them unchanged, every plugin command exit 0; checker test "the marketplace lists vh-adlc and leaves github-app-registration unchanged" passes (65 pass, 0 fail); my own fresh-profile sequence against public `michielvha/vh-adlc` (add, install both, details, list, uninstall both, remove) all exit 0. Limitation: the public install took main's plugin 0.1.1, not the branch's 0.1.2.

CRITERION: AC-02 One manifest, no generated mirror, no build step; the same tree loads on every claimed host with all seven operations and the reviewer discoverable under the documented invocation.
VERDICT: met
EVIDENCE: checker "one manifest, and no root plugin.json" passes and `ls -R plugins/vh-adlc` shows only `.claude-plugin/plugin.json`, skills, agents, references, scripts, lock, knowledge.md, no build step; S1 PASS on Claude Code CLI 2.1.302: `plugin details` lists all seven `vh-adlc-*` skills and the reviewer, each operation ran, the session dispatched `vh-adlc:vh-adlc-reviewer` and a subagent transcript with Read and Bash exists; the public install's `plugin details` lists Skills (7) and Agents (1). The README claims only the Claude Code CLI on Linux. Limitation: the D-32 residual (michielvha/vh-adlc#3, open) covers the Claude Code desktop app, the VS Code extension, remote sessions and the VS Code Local harness, none of which I observed; the host inventory names the agent `vh-adlc-reviewer.agent` (see F-02).

CRITERION: AC-03 The package contains no convention text and no template; every operation reports the docs revision and page it took each convention from.
VERDICT: met
EVIDENCE: checker "no sentence from the pinned docs pages appears in the package" passes against e4d58d2; S2.1 to S2.8 PASS with the knowledge result checked from the wrapper log and reported reason; in my own observed runs the investigate, resume and implement reports each opened with the knowledge line (`vhco-pro/docs@5e7dd7c`, source plugin then repository) and the pages read. Limitation: the package files hold the loop's procedure, which I read and found restating no convention text.

CRITERION: AC-04 Knowledge resolution uses the repository pin; else the plugin pin with onboarding added in the first change; and stops with a precise report on an invalid pin, a page missing at the repository pin, or unreachable docs. It never reads `main`.
VERDICT: met
EVIDENCE: `go test ./...` passes including `TestPins` (no pin, repository pin, two bridges, copilot bridge, short SHA, branch name, two SHAs; invalid pins make zero requests to the fixture docs server); S2.1 to S2.8 PASS (full SHA used; plugin pin plus an onboarding commit with CLAUDE.md; short SHA, `main`, two SHAs, pin lacking the standard, pin lacking the humanize guide, unreachable each stop with the reason named); `vh-adlc knowledge` on this repository answers source `repository`, revision e4d58d2, feature root `docs/specs/`.

CRITERION: AC-05 Changing only the docs revision (or only its rules block) changes the loop's behaviour, with no plugin or binary change.
VERDICT: met
EVIDENCE: S3.A and S3.B PASS (document location and `gate planned` outcome follow fixture revisions A and B, same package); golden cases `knowledge-revision-b` and `gate-planned-revision-b` pass in `go test ./cmd/vh-adlc`; fixtures test "the docs revision decides the feature root and the gate" passes.

CRITERION: AC-06 Where local instructions conflict with the pinned conventions, the local rule is followed and the conflict reported.
VERDICT: met
EVIDENCE: S4 PASS in this review (local rule followed, "the conflict is reported" check true).

CRITERION: AC-07 Installing the plugin makes no unrelated request enter the loop; every operation is reachable under its documented invocation; with a fixture plugin exposing `spec`, `implement` and `review` installed, `vh-adlc` shadows none of its skills.
VERDICT: met
EVIDENCE: S5 PASS in this review with the fixture `other-plugin` installed alongside (unrelated request stays out of the loop, both plugins' skills run); S1 ran all seven `/vh-adlc-*` invocations without error.

CRITERION: AC-08 Starting from an issue or topic that has a feature document extends it; no second document or issue appears.
VERDICT: met
EVIDENCE: S6 PASS in this review (started twice from the issue; one document, one issue).

CRITERION: AC-09 An unanswered Open Question, a missing Test Plan row, no fresh clean spec review or no `accepted by owner` row at the current normative baseline prevents `planned`, implementation entry or re-entry, and `complete`; the binary names each failing condition. After interruption, resume routes an unanswered question to the owner rather than continuing implementation or shipping.
VERDICT: met
EVIDENCE: S7.1 to S7.6 and S7.1.implement to S7.6.implement PASS (each variant refused naming `no_open_questions`, `test_plan_complete`, `spec_review_fresh`, `spec_review_clean`, `accepted`); S7.8 PASS (re-entry refused naming `no_open_questions` and `spec_review_clean`, the question put to the owner after interruption); `go test ./internal/gate` passes `TestPlannedGate`, `TestInProgressGate`, `TestCompleteGate`, `TestSharedConditionsOnEveryTarget`; my own `gate complete` on this document returned `fail` listing each failing condition.

CRITERION: AC-10 The acceptance order produces exactly one `accepted by owner` row at the reviewed commit, and only then `planned`; a later drift-only re-review adds a review row but no new acceptance row.
VERDICT: met
EVIDENCE: S7.7 PASS (check "accepted: one acceptance row naming the latest review, then planned with the gate line"); S12.12 and S12.13 PASS (a new spec review stored at the merged or fast-forwarded commit, "drift alone kept the acceptance").

CRITERION: AC-11 Re-running `tasks` on a partly ticked list preserves checked tasks and evidence and replans only the unchecked tail in dependency order.
VERDICT: met
EVIDENCE: S8 PASS in this review: checked task and evidence intact after both runs, stale greet.py task gone, tail planned on greet.sh, T1 not reused, nothing ticked, nothing normative changed, commits on the feature branch and not pushed.

CRITERION: AC-12 `implement` pushes the claim commit, works on the feature branch, observes the regression test failing then passing, and leaves unrelated staged, tracked and untracked content byte-identical.
VERDICT: met
EVIDENCE: S9.1, S9.2 and S9.3 PASS (claim pushed with the gate line and the marker, branch at the claim, `./test.sh` seen failing then passing from the tool output, NOTES.md, README.md and scratch.txt byte-identical; rejected push left no branch and the retry pushed the same claim); my own `/vh-adlc-implement greeting-name` run on a planned fixture showed the same sequence and named each path it committed.

CRITERION: AC-13 A new session given only the issue or document reconstructs status, remaining tasks, review target, owning worktree and blockers; after any required owner-confirmed handoff, it re-enters the feature branch and continues the next safe task. Missing committed state is reported as a blocker.
VERDICT: met
EVIDENCE: S10.1 PASS (next and fresh ran in the owning worktree, report names branch and worktree, nothing written before the handoff, next task progressed after it); S10.2 PASS (missing state reported as a blocker, nothing committed, no branch created).

CRITERION: AC-14 `review` runs in a separate context against a recorded target, returns all four verdicts distinctly on the fixture, stores them verbatim (confirmed by `vh-adlc review check`), and records model and isolation level.
VERDICT: met
EVIDENCE: S11.1 PASS: subagent transcript present, review row at the reviewed commit records `fable` with the session's usage showing `claude-fable-5-1`, four distinct verdicts one per criterion, `review check` pass in the wrapper log, isolation recorded; `go test ./internal/review` passes `TestCheck`.

CRITERION: AC-15 With the reviewer undispatchable or a named model unavailable, the review stays visibly pending, a self-contained handoff is produced, and nothing is labelled independent that was not.
VERDICT: met
EVIDENCE: S11.4 (unavailable named model), S11.5 (agent file absent) and S11.6 (named `sonnet` refused by `availableModels`, host ran `claude-opus-5-5`) PASS: no review row or subsection written, criteria untouched, report says pending and gives a handoff, nothing pushed.

CRITERION: AC-16 A covered commit after implementation review blocks `complete`; staged, unstaged and non-ignored untracked covered changes fail `feature_tree_clean` without disturbing unrelated work. A changed normative baseline invalidates acceptance and both reviews, even after re-acceptance without code changes; old criterion ticks, evidence and residuals do not authorise completion. Covered default-branch drift is recoverable with or without an existing feature branch, including at `planned`; unchanged normative content keeps acceptance. Checkbox, evidence/residual and Review Log annotation changes alone cause no staleness.
VERDICT: met
EVIDENCE: S12.1 to S12.13 PASS in this review: S12.3 and S12.7 fail `impl_review_fresh`, S12.4 to S12.6 fail `feature_tree_clean` with the dirty change left as it was, S12.8 to S12.10 fail `impl_review_clean`, S12.11 fails `spec_review_fresh`, S12.12 merges the default branch into the planned feature branch before review and S12.13 fast-forwards without one, both keeping acceptance, S12.1 and S12.2 complete; `go test ./internal/fresh` passes `TestStaleReasons`, `TestDrift`, `TestFeatureTree`, `TestDefaultBranch`; `vh-adlc fresh` on this document reports R-25 stale with `baseline-changed` and `covered-changed`.

CRITERION: AC-17 "Continue", even with an issue body saying "merge when green", progresses accepted local work but does not push the feature branch, merge, release, restart an app or touch another repository.
VERDICT: met
EVIDENCE: S10.1 PASS with the fixture issue saying to merge when green: checks "no push, merge or release" and "worktrees and the other feature are untouched" true after the next task progressed.

CRITERION: AC-18 An explicit ship produces one PR, `Closes` only when every criterion is met and `Refs` otherwise (including a `complete` feature with a residual), CI reported for the pushed commit, and a failed push reported as partial with exact steps.
VERDICT: met
EVIDENCE: S13.1 to S13.6 PASS against `michielvha/vh-adlc-ship-fixture` in this review, each outcome read from GitHub by the harness: Refs #41 (unmet), Closes #43 (all met), Refs #45 (complete with residual), Closes #48 after the covered doc fix was committed and re-reviewed, Closes #50 docs-only, S13.6 push refused by a ruleset reported as partial naming the local commit with no PR and nothing merged; the token appeared in no output.

CRITERION: AC-19 No output, document or evidence file contains the fixture's secret canaries.
VERDICT: met
EVIDENCE: every one of the 70 regenerated summaries carries the harness check "no secret canary in any output" ticked; after all runs `grep -rnF` for `vhadlc-secret-canary-7f3e9a` and `ghp_vhadlcCanaryToken0000000000000000` over `tests/vh-adlc/evidence/` found nothing, and the runner refuses to write a summary holding one.

CRITERION: AC-20 The README documents install, update and uninstall per claimed host as tested, and a support matrix listing every unproven host, harness or capability as unsupported.
VERDICT: met
EVIDENCE: README.md read: Install, Update, Uninstall sections with the CLI commands S1 and `update-by-hand.md` ran, and a support matrix that marks the Claude Code CLI on Linux supported and the desktop app, VS Code extension, remote sessions, VS Code Local, Copilot and Claude harnesses, Copilot CLI, macOS and structural isolation unsupported; checker README test passes in the full selection. Limitation: the update evidence shows the commands run with no newer version to move to.

CRITERION: AC-21 On Claude Code an independent pass with no model named runs on `fable`, or announces and records `opus` when `fable` is refused; a named model is used as given; the Review Log records the model that ran.
VERDICT: met
EVIDENCE: S11.1 PASS (no model named, reviewer ran on `claude-fable-5-1`, row records fable); S11.2 PASS (`fable` excluded by `availableModels`, ran on opus, fallback announced and recorded); S11.3 PASS (named `sonnet` ran as `claude-sonnet-5-5`, row records sonnet); S11.7 PASS (first pass on the session's `claude-sonnet-5-5`, second dispatch naming opus, one review stored recording opus, fallback announced); the harness checks each row against the session's model usage.

CRITERION: AC-22 Every status change in every scenario is preceded by the matching `vh-adlc gate` call (or by a procedural gate the owner allowed in that run, recorded with its reason), whose JSON result appears in the run report; with a failing gate the operation stops and changes nothing.
VERDICT: met
EVIDENCE: in all 70 summaries the wrapper logs show `gate <target>` before each status change and the harness ties the gate line to the status commit (S7.7, S9.1, S12.1, S13.2 to S13.5); every failing variant (S7.1 to S7.6, S7.8, S12.3 to S12.11) changed nothing; S14.spec records the owner-allowed procedural gate and S14 shows no change without permission; my own implement run's report quoted `result: pass` and `vh-adlc gate in-progress: pass (rules 1, docs 5e7dd7c)` before the claim and `gate complete: fail (...)` at the end; checker "names the gate for every status it changes" passes. Limitation: the harness discards passing reports, so the report clause rests on my one observed run plus the gate lines in commits.

CRITERION: AC-23 Every binary command gives byte-identical output and the documented exit code for identical inputs, with no timestamp or nondeterministic ordering.
VERDICT: met
EVIDENCE: `go test ./cmd/vh-adlc` passes; `checkGolden` runs each of 24 golden cases twice and asserts equal bytes and the Output table's exit code; I ran the released 0.1.0 binary twice each for `knowledge`, `lint`, `fresh`, `next`, `gate complete` and `gate in-progress` on this document with `--offline`, `cmp` found every pair identical, exits 0 or 1 as documented.

CRITERION: AC-24 The binary takes every status, transition, section, ID and verdict rule from the pinned rules block; an unknown `schema` exits `3` and never passes; an unrecognised local format never passes.
VERDICT: met
EVIDENCE: `go test ./internal/rules` and `./internal/knowledge` pass (`rules-block-missing`, `rules-block-ambiguous`, `rules-schema-unknown` cases); with a fixture docs repository whose standard says `schema: 2`, `gate planned` through `--docs-source` returned `result: malformed`, finding `rules-schema-unknown`, exit 3; a repository declaring `Feature document format: local` returned `result: local-format`, exit 3 for `gate` and `lint`; S3.A and S3.B show the gate following the revision's block.

CRITERION: AC-25 The installer uses only the exact locked version and verifies the selected executable's SHA-256 on every PATH/cache reuse and the downloaded asset's SHA-256 before extraction. Matching versions with wrong or missing digests fail closed with an explicit error; another-version PATH binary is ignored with a diagnostic. It writes only to the user cache and verifies downloaded content before execution.
VERDICT: met
EVIDENCE: `bun test tests/vh-adlc/ensure.test.ts` passes its 15 cases (PATH match, cache reuse, offline cache, other-version PATH ignored with a diagnostic, same-version wrong digest on PATH or in cache, tampering after install, wrong asset or binary digest never run or cached, missing lock digest, wrong reported version, offline empty cache, writes only to the user cache, real release install); S15 PASS with the unmodified installer; `ensure-vh-adlc.sh` read: asset digest checked before `tar`, binary digest and version before `cp` into the cache, `die` on each mismatch.

CRITERION: AC-26 Without the binary, read-only work continues with a visible notice and every status change stops unless the owner allows a procedural gate, which is recorded.
VERDICT: met
EVIDENCE: S14.investigate, S14.spec, S14.resume, S14.tasks, S14.implement, S14.review and S14.ship PASS in this review: each report says `deterministic checks unavailable`, no status or branch changed without permission, and S14.spec records `procedural (owner allowed` in the status commit after the owner's permission.

CRITERION: AC-27 The binary in `michielvha/vh-adlc` follows the Go conventions at its pinned docs revision: `cmd`/`internal` layout, anchored binary ignore, test, vet and lint gates before release, actions pinned to full SHAs, released platforms equal to the lock's, `checksums.txt` published with a detached `checksums.txt.sig` that verifies against the committed `release-signing-key.asc`, whose primary fingerprint is `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6` (D-27) and is the one the README prints with its verification steps, and no release from a commit that touches no binary path.
VERDICT: met
EVIDENCE: tree has `cmd/vh-adlc/main.go` and `internal/{doc,fresh,gate,gitcmd,knowledge,next,report,review,rules,testrepo}`, `.gitignore` has `/vh-adlc`; `gofmt -l` empty, `go vet`, `go mod tidy -diff`, `go build`, `golangci-lint config verify` and `run` (2.14.0 locally, CI pins 2.15.0) clean; `release.yml` and `ci.yml` pin every action to a 40-character SHA and gate on the same steps before GitVersion and GoReleaser; `.goreleaser.yml` builds darwin and linux on amd64 and arm64, the lock's four platforms; in an empty keyring `gpg --show-keys release-signing-key.asc` lists `VHCO Pro (Release Signing Key) <release@vhco.pro>` first with fingerprint 9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6 as the README prints, `gpg --verify checksums.txt.sig checksums.txt` on v0.1.0 gives Good signature with that primary fingerprint and subkey 929B...AE79, `sha256sum --check --ignore-missing` OK for the linux_amd64 asset whose digests equal the lock; `gh run list --workflow=release.yml` shows one run, at 595e6fb, and `git diff --stat 595e6fb origin/main -- cmd internal go.mod go.sum .goreleaser.yml .github/workflows/release.yml` is empty while eleven later main commits produced no release.

CRITERION: AC-28 `michielvha/vh-adlc` is the public successor of `michielvha/claude-plugins`, public only after a recorded history audit the owner confirmed; `vh-adlc@vhco-tools` and `github-app-registration@vhco-tools` install from it on every claimed host without a credential.
VERDICT: met
EVIDENCE: `gh api repos/michielvha/vh-adlc` gives `visibility: public`, `gh api repos/michielvha/claude-plugins` 404; the audit at `25529ab` is recorded under Design, One repository, step 1, and T10's evidence records the owner's confirmation; in a fresh profile whose environment carries no GitHub token (host.ts `env()`), `plugin marketplace add michielvha/vh-adlc`, `plugin install github-app-registration@vhco-tools`, `plugin install vh-adlc@vhco-tools` and `plugin details` all exit 0 listing seven skills and one agent, then both uninstalls and the marketplace removal exit 0. Limitation: the install resolved main's plugin 0.1.1, since 02b4b7f is not merged; the only claimed host is the Claude Code CLI.

CRITERION: AC-29 Different features progress concurrently in separate host-managed worktrees; same-feature re-entry requires an owner-confirmed handoff and uses the owning worktree. The loop neither force-moves branches nor creates, deletes or resets worktrees, and preserves unrelated work.
VERDICT: met
EVIDENCE: S10.1 PASS (two features in separate worktrees, the other left untouched, nothing written before the handoff, work continued in the owning worktree); S10.2 PASS (missing state blocks, no branch created); S9.1 to S9.3 PASS (branch created only after a published claim, existing claim reused, unrelated work byte-identical); S8 and S11.x ran in the owning worktree with the handoff turn.

CRITERION: AC-30 Docs-only feature-document, claim and Markdown onboarding deliveries carry `[skip ci]` only when the commit, outgoing range and PR diff contain no code, tests, workflows or other non-documentation changes. A docs-only final commit never suppresses CI for mixed delivery; reports distinguish skipped CI from a passing verification run.
VERDICT: met
EVIDENCE: S9.1 PASS ("the docs-only claim carries the skip-CI marker", work commits run CI); S13.1 to S13.4 PASS ("the mixed delivery carries no skip-CI marker, and CI ran for the pushed commit", including a docs-only completion commit); S13.5 PASS ("the docs-only delivery skipped CI, and the report says skipped", no run started on GitHub); my own implement run put the marker on the onboarding and claim commits only after checking the outgoing range was Markdown.

CRITERION: AC-31 The checker and its CI run on Bun, and the plugin's resolved docs pin names Bun as the default for JavaScript tooling and tests without the conflicting Node 24 requirement.
VERDICT: met
EVIDENCE: `bun test tests/vh-adlc` under bun 1.4.3 runs 65 tests, 0 fail; `ci.yml` checker job uses `oven-sh/setup-bun@0c5077e5...` with bun 1.4.3 and `bun test tests/vh-adlc`; `conventions/coding.md` at e4d58d2 line 28 says new JavaScript tooling and tests use Bun, and the checker asserts the page contains that sentence and not "Node 24".

CRITERION: AC-32 Every commit message, PR body, issue update, feature-document prose section, review summary and run report the loop writes is edited with the humanize prose guide at its resolved docs revision: none of that text keeps a canary tell seeded into the fixture inputs or contains an em dash, an en dash or ` -- ` used as a dash, and the run report cites the guide and revision.
VERDICT: not met
EVIDENCE: the canary and dash half holds: S6, S9.1, S10.1, S11.x and S13.1 to S13.5 PASS with "no prose canary or dash in the commits, the document or the reports", and `grep -rnP` for em or en dashes over the evidence found nothing; the citation half fails on execution: my own `/vh-adlc-investigate` run on the fixture produced a run report naming the knowledge revision but not `guides/humanize-prose.md` (the resume and implement reports did cite it), and no harness check asserts the citation (`grep -n humanize-prose tests/vh-adlc/scenarios/run.ts` matches only the S2 missing-page variant), so the clause "the run report cites the guide and revision" is contradicted for investigate and unasserted elsewhere.

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: plugins/vh-adlc/skills/vh-adlc-investigate/SKILL.md (Report), tests/vh-adlc/scenarios/run.ts, Test Plan AC-32 row
EVIDENCE: The investigate skill asks for the guide only in step 4 ("write substantial findings into an analysis document ... Edit that prose with guides/humanize-prose.md first") and its Report line asks for the knowledge line, measurements, hypotheses and the next decision, not the guide; an observed run (`/vh-adlc-investigate Why does ./test.sh fail?`, fixture plugin at 02b4b7f, cost 0.22 USD) returned a report with `vhco-pro/docs@5e7dd7c` and no mention of the guide. The Test Plan row for AC-32 says "the reports cite the guide and revision", but run.ts has no check reading a report for the guide's name; `canaryFree()` checks canaries and dashes only.
PROPOSAL: Make the investigate Report list the guide and revision as the other six skills do, and add a harness check in the AC-32 scenarios (and S1 or S14 for investigate) that each operation's final report names `guides/humanize-prose.md` and the resolved revision.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design, Hosts table row "Agent file in `agents/`"
EVIDENCE: The row says Claude Code uses "frontmatter `name`, else the file name including `.agent`". `claude plugin details vh-adlc@vhco-tools` (2.1.302, fresh profile, public install) prints `Agents (1)  vh-adlc-reviewer.agent` although the file's frontmatter sets `name: vh-adlc-reviewer`; S1's check passes because `vh-adlc-reviewer` is a substring, and the dispatch as `vh-adlc:vh-adlc-reviewer` worked.
PROPOSAL: State that the inventory lists the agent by file name including `.agent` while dispatch accepts the frontmatter name, or rename the file to `vh-adlc-reviewer.md` so both agree.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: tests/vh-adlc/scenarios/run.ts, main loop (`build(mkdtempSync(join(tmpdir(), ...)))`)
EVIDENCE: Each scenario builds its fixture in a fresh temp directory and never removes it; after this review's full run 77 `/tmp/vh-adlc-S*` and `/tmp/vh-adlc-s1-home-*` directories of about 9 MB each remained (removed by hand). Commit e4dff89 cleaned the tests' temp dirs, not the scenarios'.
PROPOSAL: Remove the fixture directory after the summary is written, keeping it only when a scenario fails or an environment flag asks to keep it.

### R-32

CRITERION: AC-01 Installing `vh-adlc` leaves `github-app-registration`, its files and the marketplace identity unchanged, and uninstalling restores the previous state.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S1 S1.host` in a copy of bdaa69d on Claude Code CLI 2.1.303, both PASS: S1.host's six hashed github-app-registration files and its marketplace entry are unchanged after installing and uninstalling vh-adlc, every plugin command exit 0; S1's marketplace add, install, uninstall and remove exit 0 and `plugin list` shows no vh-adlc afterwards; checker test "the marketplace lists vh-adlc and leaves github-app-registration unchanged" passes in `bun test tests/vh-adlc` (65 pass, 0 fail); my own fresh-profile sequence against the public `michielvha/vh-adlc` (add, install both, details, list, uninstall both, remove) all exit 0. Limitation: the public install resolved main's plugin 0.1.1, not this branch's 0.1.2.

CRITERION: AC-02 One manifest, no generated mirror, no build step; the same tree loads on every claimed host with all seven operations and the reviewer discoverable under the documented invocation.
VERDICT: met
EVIDENCE: `find plugins/vh-adlc -type f` lists one manifest (`.claude-plugin/plugin.json`), `knowledge.md`, the lock, the installer, seven `skills/vh-adlc-*/SKILL.md`, one agent file and three references, nothing generated and no build step; checker "one manifest, and no root plugin.json" passes; S1 PASS on Claude Code CLI 2.1.303: `plugin details` lists all seven `vh-adlc-*` skills and the reviewer, each of the seven operations ran without error, and the session dispatched `vh-adlc:vh-adlc-reviewer`; the credential-free public install's `plugin details` shows Skills (7) and Agents (1). The README claims only the Claude Code CLI on Linux. Limitation: the residual in michielvha/vh-adlc#3 (D-32, open) covers the Claude Code desktop app, the VS Code extension, remote sessions and the VS Code Copilot Chat Local harness, none of which I observed; the host inventory names the agent `vh-adlc-reviewer.agent`, deferred under D-42 (#7).

CRITERION: AC-03 The package contains no convention text and no template; every operation reports the docs revision and page it took each convention from.
VERDICT: met
EVIDENCE: checker "no sentence from the pinned docs pages appears in the package" passes against e4d58d2; S2.1 to S2.8 PASS with the knowledge result read from the wrapper log and the reason named in the report; my own `/vh-adlc-investigate` and `/vh-adlc-spec` runs on the fixture opened their reports with `Conventions: vhco-pro/docs@5e7dd7c (plugin pin ...); prose edited with guides/humanize-prose.md`, named each page requested and the source change from plugin to repository after onboarding; S1's `citesGuide` check passes for all seven operations. Limitation: the package holds the loop's procedure, which I read and found restating no convention.

CRITERION: AC-04 Knowledge resolution uses the repository pin; else the plugin pin with onboarding added in the first change; and stops with a precise report on an invalid pin, a page missing at the repository pin, or unreachable docs. It never reads `main`.
VERDICT: met
EVIDENCE: `go test ./...` passes including `TestPins` (no pin, repository pin, two bridges, copilot bridge, short SHA, branch name, two SHAs); S2.1 to S2.8 PASS (repository pin used; plugin pin plus an onboarding commit; short SHA, `main`, two SHAs, pin lacking the standard, pin lacking the humanize guide and unreachable docs each stop with the reason named and nothing committed); my own spec run on the unpinned fixture resolved source `plugin`, made its first commit the onboarding of `AGENTS.md`, `CLAUDE.md` and `.github/copilot-instructions.md`, after which `knowledge` answered source `repository`; the released binary on this repository answers source `repository`, revision e4d58d2, feature root `docs/specs/`.

CRITERION: AC-05 Changing only the docs revision (or only its rules block) changes the loop's behaviour, with no plugin or binary change.
VERDICT: met
EVIDENCE: S3.A and S3.B PASS with the same package: under revision A the document lives in `docs/internal/plans/` and `gate planned` passed; under revision B (root `plans/`, `all_met` added to the planned gate) it lives in `plans/` and the gate failed on `all_met`; golden cases `knowledge-revision-b` and `gate-planned-revision-b` pass in `go test ./cmd/vh-adlc`.

CRITERION: AC-06 Where local instructions conflict with the pinned conventions, the local rule is followed and the conflict reported.
VERDICT: met
EVIDENCE: S4 PASS: with a local `AGENTS.md` forbidding the skip-CI marker, the draft was committed, no commit carries the marker and "the conflict is reported" is true.

CRITERION: AC-07 Installing the plugin makes no unrelated request enter the loop; every operation is reachable under its documented invocation; with a fixture plugin exposing `spec`, `implement` and `review` installed, `vh-adlc` shadows none of its skills.
VERDICT: met
EVIDENCE: S5 PASS with `other-plugin` installed alongside: the unrelated request did not enter the loop, other-plugin's `spec`, `implement` and `review` still ran, and the vh-adlc operations ran through the binary; S1 ran all seven `/vh-adlc-*` invocations without error.

CRITERION: AC-08 Starting from an issue or topic that has a feature document extends it; no second document or issue appears.
VERDICT: met
EVIDENCE: S6 PASS: started twice from the issue, one document for the issue, `find` was used, no prose canary or dash in the document or commits.

CRITERION: AC-09 An unanswered Open Question, a missing Test Plan row, no fresh clean spec review or no `accepted by owner` row at the current normative baseline prevents `planned`, implementation entry or re-entry, and `complete`; the binary names each failing condition. After interruption, resume routes an unanswered question to the owner rather than continuing implementation or shipping.
VERDICT: met
EVIDENCE: S7.1 to S7.6 and S7.1.implement to S7.6.implement PASS, each refused naming `no_open_questions`, `test_plan_complete`, `spec_review_fresh`, `spec_review_clean` or `accepted`, with no status change, no claim and no branch; S7.8 PASS: `next` routed to an owner decision, re-entry was refused naming `no_open_questions` and `spec_review_clean`, the question was put to the owner, nothing implemented or pushed, the acceptance kept; `go test ./internal/gate` passes; the released binary's `gate complete` on this document returned `fail` listing `all_met`, `impl_review_clean` and `impl_review_fresh`.

CRITERION: AC-10 The acceptance order produces exactly one `accepted by owner` row at the reviewed commit, and only then `planned`; a later drift-only re-review adds a review row but no new acceptance row.
VERDICT: not verified
EVIDENCE: the second clause holds: S12.12 and S12.13 PASS, a new spec review stored at the merged or fast-forwarded commit with exactly one `accepted by owner` row and status `planned`. The first clause was not observed: S7.7 ran twice in this review and both runs PASS only through the other branch of its check, "the owner was left a decision: no acceptance row, still draft, no planned gate passed", because the reviewer returned judgement findings; the "accepted: one acceptance row naming the latest review, then planned" branch also appears in none of the committed S7.7 summaries (039b1b3, 8d62bb1, d5ae867 at bdaa69d). S3.A and my own spec run reached `planned` only after a fixture-written acceptance row (`accept()` in `tests/vh-adlc/fixtures/build.ts`), so the loop appending the acceptance row itself has not been seen to execute.

CRITERION: AC-11 Re-running `tasks` on a partly ticked list preserves checked tasks and evidence and replans only the unchecked tail in dependency order.
VERDICT: met
EVIDENCE: S8 PASS: `gate in-progress` called on each run, T1 and its evidence intact after both runs, the stale greet.py task gone, the tail planned on greet.sh, T1 not reused, nothing ticked, nothing normative changed, commits on the feature branch and not pushed.

CRITERION: AC-12 `implement` pushes the claim commit, works on the feature branch, observes the regression test failing then passing, and leaves unrelated staged, tracked and untracked content byte-identical.
VERDICT: met
EVIDENCE: S9.1, S9.2 and S9.3 PASS: one claim commit pushed to the default branch with the gate line and the marker, the branch starting at the claim and not pushed, `./test.sh` seen failing then passing in the tool output, the suite passing at the branch tip, NOTES.md, README.md and scratch.txt byte-identical; after a rejected push no branch was created and the retry pushed the same single claim; a published claim without a branch got its branch at the exact claim commit with no second claim.

CRITERION: AC-13 A new session given only the issue or document reconstructs status, remaining tasks, review target, owning worktree and blockers; after any required owner-confirmed handoff, it re-enters the feature branch and continues the next safe task. Missing committed state is reported as a blocker.
VERDICT: met
EVIDENCE: S10.1 PASS (`next` and `fresh` ran in the owning worktree, the report names the branch and the worktree, nothing written before the handoff, the next task progressed on the feature branch after it); S10.2 PASS (missing state reported as a blocker, nothing committed, no branch created).

CRITERION: AC-14 `review` runs in a separate context against a recorded target, returns all four verdicts distinctly on the fixture, stores them verbatim (confirmed by `vh-adlc review check`), and records model and isolation level.
VERDICT: met
EVIDENCE: S11.1 PASS: subagent transcript present, the review row at the reviewed commit records `fable` with the session's usage showing `claude-fable-5-1`, the four verdicts one per criterion as the fixture expects, `review check` pass in the wrapper log, isolation `procedural` recorded; `go test ./internal/review` passes `TestCheck`. Limitation: in S11.3 the named `sonnet` reviewer returned four distinct verdicts but swapped `untested` and `not verified` between AC-03 and AC-04, so that scenario FAILED its verdict check (see F-03).

CRITERION: AC-15 With the reviewer undispatchable or a named model unavailable, the review stays visibly pending, a self-contained handoff is produced, and nothing is labelled independent that was not.
VERDICT: met
EVIDENCE: S11.4 (unavailable named model), S11.5 (agent file absent) and S11.6 (named `sonnet` refused by `availableModels`, host ran `claude-opus-5-5`) PASS: no review row or subsection written, criteria untouched, the report carries the `review pending` line and a handoff, nothing pushed.

CRITERION: AC-16 A covered commit after implementation review blocks `complete`; staged, unstaged and non-ignored untracked covered changes fail `feature_tree_clean` without disturbing unrelated work. A changed normative baseline invalidates acceptance and both reviews, even after re-acceptance without code changes; old criterion ticks, evidence and residuals do not authorise completion. Covered default-branch drift is recoverable with or without an existing feature branch, including at `planned`; unchanged normative content keeps acceptance. Checkbox, evidence/residual and Review Log annotation changes alone cause no staleness.
VERDICT: met
EVIDENCE: S12.1 to S12.13 PASS: S12.1 and S12.2 complete; S12.3 and S12.7 fail `impl_review_fresh`; S12.4 to S12.6 fail `feature_tree_clean` with the dirty change left as it was; S12.8 to S12.10 fail `impl_review_clean`; S12.11 fails `spec_review_fresh`; S12.12 merges the default branch into the planned feature branch and S12.13 fast-forwards without one, both keeping the one acceptance row; `go test ./internal/fresh` passes; the released binary's `fresh` on this document reports R-31 stale with `covered-changed` over the plugin, scenario and evidence files changed since 02b4b7f, and the feature tree clean.

CRITERION: AC-17 "Continue", even with an issue body saying "merge when green", progresses accepted local work but does not push the feature branch, merge, release, restart an app or touch another repository.
VERDICT: met
EVIDENCE: S10.1 PASS with the fixture issue saying to merge when green: "no push, merge or release" and "worktrees and the other feature are untouched" both true after the next task progressed.

CRITERION: AC-18 An explicit ship produces one PR, `Closes` only when every criterion is met and `Refs` otherwise (including a `complete` feature with a residual), CI reported for the pushed commit, and a failed push reported as partial with exact steps.
VERDICT: met
EVIDENCE: S13.1 to S13.6 PASS against `michielvha/vh-adlc-ship-fixture`, each outcome read from GitHub by the harness: Refs #79 (unmet criterion), Closes #81 (all met), Refs #83 (complete with a residual), Closes #86 after the covered doc fix was committed and re-reviewed, Closes #88 docs-only with CI skipped and reported skipped, and S13.6's push refused by a ruleset reported as partial naming the local commit, with no PR and nothing merged; the token appeared in no output.

CRITERION: AC-19 No output, document or evidence file contains the fixture's secret canaries.
VERDICT: met
EVIDENCE: all 70 summaries regenerated in this review carry "no secret canary in any output" ticked, the two failing ones included; after every run `grep -rnF` for `vhadlc-secret-canary-7f3e9a`, `ghp_vhadlcCanaryToken0000000000000000` and the `gh auth token` value over `tests/vh-adlc/evidence/` found nothing, and `scanSecrets` in run.ts refuses to write a summary holding one.

CRITERION: AC-20 The README documents install, update and uninstall per claimed host as tested, and a support matrix listing every unproven host, harness or capability as unsupported.
VERDICT: met
EVIDENCE: README.md read: Install, Update and Uninstall sections with the CLI commands S1 and `update-by-hand.md` ran, and a support matrix marking the Claude Code CLI on Linux supported and the desktop app, VS Code extension, remote sessions, VS Code Local, the Copilot and Claude harnesses, Copilot CLI, macOS and structural isolation unsupported; checker "documents install, update, uninstall and a support matrix" passes. Limitation: the update evidence had no newer version to move to, and the matrix's host row names 2.1.284 while the committed evidence is all 2.1.302 (F-04).

CRITERION: AC-21 On Claude Code an independent pass with no model named runs on `fable`, or announces and records `opus` when `fable` is refused; a named model is used as given; the Review Log records the model that ran.
VERDICT: met
EVIDENCE: S11.1 PASS (no model named, reviewer ran on `claude-fable-5-1`, row records fable); S11.2: with `fable` excluded by `availableModels` the reviewer ran on `claude-opus-5-5`, the fallback was announced ("the opus fallback was announced" ticked) and the row records `claude-opus-5-5`; S11.3: named `sonnet` ran as `claude-sonnet-5-5` and the row records sonnet; S11.7 PASS: first pass on the session's `claude-sonnet-5-5`, second dispatch naming opus, one review stored recording opus and the fallback announced; each row's model was checked against the session's model usage. Limitation: S11.2 FAILED its bundled check "the review row targets the reviewed commit and records opus" on the target half, because the review first committed onboarding files on the feature branch and reviewed at that commit (F-02); the model half held.

CRITERION: AC-22 Every status change in every scenario is preceded by the matching `vh-adlc gate` call (or by a procedural gate the owner allowed in that run, recorded with its reason), whose JSON result appears in the run report; with a failing gate the operation stops and changes nothing.
VERDICT: met
EVIDENCE: the wrapper logs and harness checks tie the gate to each status commit in S3.A, S9.1, S12.1, S12.2 and S13.2 to S13.5; every failing variant (S3.B, S7.1 to S7.6 and their implement halves, S7.8, S12.3 to S12.11) changed nothing; S14.spec records `procedural (owner allowed` in the status commit after permission and no change without it; my own spec run's report quoted `"result":"pass"`, `"failing":[]` and `vh-adlc gate planned: pass (rules 1, docs 5e7dd7c)` before the status edit, and the wrapper log shows the gate called twice before `lint` and the commit; checker "names the gate for every status it changes" passes. Limitation: the harness discards passing reports, so the report clause rests on my one observed run and the gate lines in commits.

CRITERION: AC-23 Every binary command gives byte-identical output and the documented exit code for identical inputs, with no timestamp or nondeterministic ordering.
VERDICT: met
EVIDENCE: `go test ./cmd/vh-adlc` passes; `checkGolden` runs each of 24 golden cases twice and asserts equal bytes and the documented exit code; I ran the released 0.1.0 binary twice each for `knowledge`, `lint`, `fresh`, `next`, `gate complete` and `gate in-progress` on this document with `--offline`, `cmp` found every pair identical, exits 0 or 1 as documented.

CRITERION: AC-24 The binary takes every status, transition, section, ID and verdict rule from the pinned rules block; an unknown `schema` exits `3` and never passes; an unrecognised local format never passes.
VERDICT: met
EVIDENCE: `go test ./internal/rules` and `./internal/knowledge` pass (`rules-block-missing`, `rules-block-ambiguous`, `rules-schema-unknown`); with a fixture docs copy whose standard says `schema: 2`, `gate planned` through `--docs-source` returned `result: malformed`, finding `rules-schema-unknown` ("rules schema 2 is unknown; this binary reads schema 1"), exit 3; a fixture project declaring `Feature document format: local` returned `result: local-format`, exit 3 for `gate`, `lint` and `next`; S3.A and S3.B show the gate following each revision's block.

CRITERION: AC-25 The installer uses only the exact locked version and verifies the selected executable's SHA-256 on every PATH/cache reuse and the downloaded asset's SHA-256 before extraction. Matching versions with wrong or missing digests fail closed with an explicit error; another-version PATH binary is ignored with a diagnostic. It writes only to the user cache and verifies downloaded content before execution.
VERDICT: met
EVIDENCE: `bun test tests/vh-adlc` runs `ensure.test.ts`'s 15 cases green (PATH match, cache reuse, offline cache, other-version PATH ignored with a diagnostic, same-version wrong digest on PATH or in cache, tampering after install, wrong asset or binary digest never run or cached, missing lock digest, wrong reported version, offline empty cache, writes only to the user cache, real release install); S15 PASS with the unmodified installer; `ensure-vh-adlc.sh` read: asset digest checked before `tar`, binary digest and version before `cp` into the cache, `die` on each mismatch.

CRITERION: AC-26 Without the binary, read-only work continues with a visible notice and every status change stops unless the owner allows a procedural gate, which is recorded.
VERDICT: met
EVIDENCE: S14.investigate, S14.spec, S14.resume, S14.tasks, S14.implement, S14.review and S14.ship PASS: each report says `deterministic checks unavailable`, no status or branch changed without permission, and S14.spec records `procedural (owner allowed` in the status commit after the owner's permission.

CRITERION: AC-27 The binary in `michielvha/vh-adlc` follows the Go conventions at its pinned docs revision: `cmd`/`internal` layout, anchored binary ignore, test, vet and lint gates before release, actions pinned to full SHAs, released platforms equal to the lock's, `checksums.txt` published with a detached `checksums.txt.sig` that verifies against the committed `release-signing-key.asc`, whose primary fingerprint is `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6` (D-27) and is the one the README prints with its verification steps, and no release from a commit that touches no binary path.
VERDICT: met
EVIDENCE: tree has `cmd/vh-adlc/main.go` and `internal/{doc,fresh,gate,gitcmd,knowledge,next,report,review,rules,testrepo}`, `.gitignore` has `/vh-adlc`; `gofmt -l` empty, `go vet`, `go mod tidy -diff`, `go build`, `golangci-lint config verify` and `run` (2.14.0 locally; CI pins 2.15.0) clean; `ci.yml` and `release.yml` pin every action to a 40-character SHA and run the same gates before GitVersion and GoReleaser; `.goreleaser.yml` builds darwin and linux on amd64 and arm64, the lock's four platforms; in an empty keyring `gpg --show-keys release-signing-key.asc` lists `VHCO Pro (Release Signing Key) <release@vhco.pro>` first with fingerprint 9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6 as the README prints, `gpg --verify checksums.txt.sig checksums.txt` on v0.1.0 gives Good signature with that primary fingerprint and subkey 929B...AE79, `sha256sum --check --ignore-missing` OK for the linux_amd64 asset whose asset and extracted-binary digests equal the lock; the public API shows one release workflow run, at 595e6fb, and `git diff --stat 595e6fb origin/main -- cmd internal go.mod go.sum .goreleaser.yml .github/workflows/release.yml` is empty across 57 later main commits.

CRITERION: AC-28 `michielvha/vh-adlc` is the public successor of `michielvha/claude-plugins`, public only after a recorded history audit the owner confirmed; `vh-adlc@vhco-tools` and `github-app-registration@vhco-tools` install from it on every claimed host without a credential.
VERDICT: met
EVIDENCE: unauthenticated `api.github.com/repos/michielvha/vh-adlc` gives `visibility: public`, `.../claude-plugins` 404; the audit at `25529ab` is recorded under Design, One repository, and T10 records the owner's confirmation; in a fresh profile whose environment carries no GitHub token (host.ts `env()`), `plugin marketplace add michielvha/vh-adlc`, `plugin install github-app-registration@vhco-tools`, `plugin install vh-adlc@vhco-tools` and `plugin details` all exit 0 listing seven skills and one agent, then both uninstalls and the marketplace removal exit 0. Limitation: the install resolved main's plugin 0.1.1; the only claimed host is the Claude Code CLI.

CRITERION: AC-29 Different features progress concurrently in separate host-managed worktrees; same-feature re-entry requires an owner-confirmed handoff and uses the owning worktree. The loop neither force-moves branches nor creates, deletes or resets worktrees, and preserves unrelated work.
VERDICT: met
EVIDENCE: S10.1 PASS (two features in separate worktrees, the other untouched, nothing written before the handoff, work continued in the owning worktree); S10.2 PASS (missing state blocks, no branch created); S9.1 to S9.3 PASS (branch created only after a published claim, no worktree created or removed, unrelated work byte-identical); S8, S11.x and S12.x ran in the owning worktree after the handoff turn.

CRITERION: AC-30 Docs-only feature-document, claim and Markdown onboarding deliveries carry `[skip ci]` only when the commit, outgoing range and PR diff contain no code, tests, workflows or other non-documentation changes. A docs-only final commit never suppresses CI for mixed delivery; reports distinguish skipped CI from a passing verification run.
VERDICT: met
EVIDENCE: S9.1 PASS ("the docs-only claim carries the skip-CI marker", work commits run CI); S13.1 to S13.4 PASS ("the mixed delivery carries no skip-CI marker, and CI ran for the pushed commit", including the docs-only completion commit in S13.4); S13.5 PASS ("the docs-only delivery skipped CI, and the report says skipped"); my own spec run put the marker on its onboarding and status commits after stating the pushed range was Markdown only.

CRITERION: AC-31 The checker and its CI run on Bun, and the plugin's resolved docs pin names Bun as the default for JavaScript tooling and tests without the conflicting Node 24 requirement.
VERDICT: met
EVIDENCE: `bun test tests/vh-adlc` runs 65 tests, 0 fail; `ci.yml`'s checker job uses `oven-sh/setup-bun@0c5077e5...` with bun 1.4.3 and `bun test tests/vh-adlc`; `conventions/coding.md` at e4d58d2 in the binary's cache says new JavaScript tooling and tests use Bun and contains no "Node 24"; the checker asserts the same.

CRITERION: AC-32 Every commit message, PR body, issue update, feature-document prose section, review summary and run report the loop writes is edited with the humanize prose guide at its resolved docs revision: none of that text keeps a canary tell seeded into the fixture inputs or contains an em dash, an en dash or ` -- ` used as a dash, and the run report cites the guide and revision.
VERDICT: met
EVIDENCE: `canaryFree` ticked in S6, S9.1, S10.1, S11.1 to S11.3, S11.7 and S13.1 to S13.5 over commits, the document and the reports; `citesGuide` ticked in S1 (all seven operations), S6, S9.1, S10.1, S11.x and S13.1 to S13.5; my own `/vh-adlc-investigate` report, the operation R-31 found wanting, opens with `Conventions: vhco-pro/docs@5e7dd7c ...; prose edited with guides/humanize-prose.md`, and my spec run's report names the guide at 5e7dd7c; `grep -rnP` for em or en dashes over the 70 regenerated summaries found nothing; checker "names the humanize prose guide" passes for every skill. Limitation: the seeded tells and dashes are what the scan can see; S8's and S12's reports are not scanned, as the Test Plan row allows.

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan (S7 row, AC-10 row), tests/vh-adlc/scenarios/run.ts S7.7
EVIDENCE: S7.7's check accepts two outcomes (run.ts, "accepted: one acceptance row naming the latest review, then planned with the gate line" or "the owner was left a decision"). Both of my runs at bdaa69d and all three committed S7.7 summaries (039b1b3, 8d62bb1, d5ae867) record the second outcome, because the reviewer returns judgement findings on the fixture draft. Every `planned` the loop reached elsewhere (S3.A, S12.12, S12.13, my own run) started from an acceptance row the fixture's `accept()` wrote. So `spec` appending the `accepted by owner` row and then flipping to `planned` has never been recorded, and AC-10's first clause has no executed proof.
PROPOSAL: Give S7.7 a deterministic acceptance path: either a second owner turn that answers the judgement questions and accepts, or a variant whose stored review is already clean so the owner's turn makes `spec` append the acceptance row and run `gate planned`; make that branch the pass condition for AC-10.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: plugins/vh-adlc/references/loop.md (section 2, "When `source` is `plugin`"), plugins/vh-adlc/skills/vh-adlc-review/SKILL.md, tests/vh-adlc/scenarios/run.ts S11
EVIDENCE: S11.2 FAILED at bdaa69d on "the review row targets the reviewed commit and records opus": the fixture's harness target was `24446f4`, but `vh-adlc-review` first committed `03eb3b8 docs: pin the conventions and add agent entry points` (AGENTS.md, CLAUDE.md, .github/copilot-instructions.md) on `feat/greeting-name` and reviewed at that commit; the model half held. In S11.3, in the same unpinned fixture, the operation declined to onboard ("onboarding files belong on the default branch"). loop.md tells every operation that "the operation's first change there then adds the pinned AGENTS.md and its bridges", while authority.md grants onboarding commits only with the default-branch document push of `spec`, `tasks` or `implement`'s claim, so the review skill's behaviour on an unpinned repository is undetermined and sometimes contradicts the authority table.
PROPOSAL: Scope loop.md's onboarding rule to the operations with default-branch authority and have `review` and `ship` report the missing pin instead of committing; or pin the S11 fixture in `reviewFeature()` so S11 measures model handling alone. Re-run S11.2 after the change.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: tests/vh-adlc/fixtures/build.ts `reviewFeature` (AC-03 and AC-04 evidence), run.ts `EXPECTED_VERDICTS`
EVIDENCE: S11.3 FAILED only on "the four verdicts came back distinctly, one per criterion": the sonnet reviewer returned `{"AC-01":"met","AC-02":"not met","AC-03":"not verified","AC-04":"untested"}`, swapping the two the fixture expects (AC-03 untested, AC-04 not verified). Its report reasons that AC-03's macOS claim was "a prediction, not a run" and AC-04's skipped `test-live.sh` was "never called", which the standard's definitions do not settle outright. The fable and opus passes in S11.1, S11.2 and S11.7 mapped them as expected.
PROPOSAL: Make the two cases unmistakable, for example no check at all for the untested criterion and a check that exists, is named in the Test Plan and visibly skipped for the not-verified one, so a scenario failure means the loop misbehaved rather than that a reviewer weighed an ambiguous fixture differently.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: README.md, support matrix, first row
EVIDENCE: The row reads "Claude Code CLI 2.1.284, with re-runs on 2.1.302, Linux", but every one of the 70 summaries at bdaa69d records `2.1.302 (Claude Code)` (69 at b901210, S13.5 at c780ef8), and this review's runs record 2.1.303.
PROPOSAL: Name the version the recorded evidence shows, and update it with each full run.

### R-33

CRITERION: AC-01 Installing `vh-adlc` leaves `github-app-registration`, its files and the marketplace identity unchanged, and uninstalling restores the previous state.
VERDICT: not verified
EVIDENCE: `bun test tests/vh-adlc` in a copy of 0a572ca, 65 pass 0 fail, including "the marketplace lists vh-adlc and leaves github-app-registration unchanged"; my fresh-profile sequence against the public `michielvha/vh-adlc` (marketplace add, install github-app-registration, install vh-adlc, details, list, uninstall both, marketplace remove, list) all exit 0 and `plugin list` ends with "No plugins installed". Limitation: S1 and S1.host, which hash github-app-registration's installed files before, during and after, were started (`bun tests/vh-adlc/scenarios/run.ts S1 S1.host`) but this review was closed before they finished, so the file-identity clause was not observed executing.

CRITERION: AC-02 One manifest, no generated mirror, no build step; the same tree loads on every claimed host with all seven operations and the reviewer discoverable under the documented invocation.
VERDICT: met
EVIDENCE: `find plugins/vh-adlc -type f` at 0a572ca lists one manifest (`.claude-plugin/plugin.json`), `knowledge.md`, the lock, the installer, seven `skills/vh-adlc-*/SKILL.md`, one agent and three references, nothing generated and no build step; checker "one manifest, and no root plugin.json" passes; in a fresh profile the credential-free public install's `plugin details vh-adlc@vhco-tools` on Claude Code CLI 2.1.303 shows Skills (7) naming all seven `vh-adlc-*` operations and Agents (1) `vh-adlc-reviewer.agent`; the README claims only the Claude Code CLI on Linux. Limitation: the residual in michielvha/vh-adlc#3 (D-32) covers the Claude Code desktop app, the VS Code extension, remote sessions and the VS Code Copilot Chat Local harness, none observed here; the public install resolved main's plugin 0.1.1, not this branch's 0.1.2; S1's invocation of each operation was not observed to completion.

CRITERION: AC-03 The package contains no convention text and no template; every operation reports the docs revision and page it took each convention from.
VERDICT: not verified
EVIDENCE: checker "no sentence from the pinned docs pages appears in the package" passes against e4d58d2 in `bun test tests/vh-adlc`; `loop.md` instructs every operation to open with the `Conventions: vhco-pro/docs@<rev> ...` line. Limitation: S1's `citesGuide` check and S2.1 to S2.8 were not observed to completion in this review, so the reporting clause rests on reading the skill text only.

CRITERION: AC-04 Knowledge resolution uses the repository pin; else the plugin pin with onboarding added in the first change; and stops with a precise report on an invalid pin, a page missing at the repository pin, or unreachable docs. It never reads `main`.
VERDICT: not verified
EVIDENCE: `go test ./...` in the copy passes every package including `internal/knowledge` and the golden cases `knowledge-invalid-pin` and `knowledge-missing-page`; the released 0.1.0 binary on this repository answers source `repository`, revision e4d58d2, feature root `docs/specs/`. Limitation: S2.1 to S2.8 (plugin pin plus onboarding commit, short SHA, `main`, two SHAs, missing standard, missing guide, unreachable docs) were not observed executing before this review closed.

CRITERION: AC-05 Changing only the docs revision (or only its rules block) changes the loop's behaviour, with no plugin or binary change.
VERDICT: not verified
EVIDENCE: golden cases `knowledge-revision-b` and `gate-planned-revision-b` pass in `go test ./cmd/vh-adlc`, so the binary follows the rules block; checker "the docs revision decides the feature root and the gate" passes. Limitation: S3.A and S3.B, the loop-level proof, were not observed executing.

CRITERION: AC-06 Where local instructions conflict with the pinned conventions, the local rule is followed and the conflict reported.
VERDICT: not verified
EVIDENCE: S4 exists in run.ts with checks "no commit carries a skip-CI marker" and "the conflict is reported"; its execution was not observed before this review closed.

CRITERION: AC-07 Installing the plugin makes no unrelated request enter the loop; every operation is reachable under its documented invocation; with a fixture plugin exposing `spec`, `implement` and `review` installed, `vh-adlc` shadows none of its skills.
VERDICT: not verified
EVIDENCE: S5 and S1 exist in run.ts with the matching checks; checker "exposes skills named spec, implement and review" passes for the other-plugin fixture; neither scenario's execution was observed to completion.

CRITERION: AC-08 Starting from an issue or topic that has a feature document extends it; no second document or issue appears.
VERDICT: not verified
EVIDENCE: S6 exists with "one document for the issue" and "find was used"; not observed executing.

CRITERION: AC-09 An unanswered Open Question, a missing Test Plan row, no fresh clean spec review or no `accepted by owner` row at the current normative baseline prevents `planned`, implementation entry or re-entry, and `complete`; the binary names each failing condition. After interruption, resume routes an unanswered question to the owner rather than continuing implementation or shipping.
VERDICT: not verified
EVIDENCE: `go test ./internal/gate` and `./internal/next` pass; the released binary's `gate complete` on this document at 0a572ca returned `fail` naming `all_met`, `impl_review_fresh`, `impl_review_clean` and `feature_tree_clean`, exit 1, and `next` answered `implement` (rule 10). Limitation: S7.1 to S7.6, their implement variants and S7.8 were not observed executing.

CRITERION: AC-10 The acceptance order produces exactly one `accepted by owner` row at the reviewed commit, and only then `planned`; a later drift-only re-review adds a review row but no new acceptance row.
VERDICT: not verified
EVIDENCE: run.ts at 0a572ca holds S7.7.accept, which starts from a clean stored review and asserts one acceptance row naming R-1 at the reviewed commit, `gate planned` passing afterwards and the status commit with the gate line; `git ls-files tests/vh-adlc/evidence/claude-code` at 0a572ca lists no `S7.7.accept.md` (the only S7.7 summary committed records the "owner was left a decision" branch), and the working tree's `S7.7.accept.md` is untracked. Neither S7.7.accept nor S12.12 and S12.13 were observed executing in this review.

CRITERION: AC-11 Re-running `tasks` on a partly ticked list preserves checked tasks and evidence and replans only the unchecked tail in dependency order.
VERDICT: not verified
EVIDENCE: S8 exists with the matching checks; not observed executing.

CRITERION: AC-12 `implement` pushes the claim commit, works on the feature branch, observes the regression test failing then passing, and leaves unrelated staged, tracked and untracked content byte-identical.
VERDICT: not verified
EVIDENCE: S9.1 to S9.3 exist with the matching checks; not observed executing.

CRITERION: AC-13 A new session given only the issue or document reconstructs status, remaining tasks, review target, owning worktree and blockers; after any required owner-confirmed handoff, it re-enters the feature branch and continues the next safe task. Missing committed state is reported as a blocker.
VERDICT: not verified
EVIDENCE: S10.1 and S10.2 exist with the matching checks; not observed executing.

CRITERION: AC-14 `review` runs in a separate context against a recorded target, returns all four verdicts distinctly on the fixture, stores them verbatim (confirmed by `vh-adlc review check`), and records model and isolation level.
VERDICT: not verified
EVIDENCE: `go test ./internal/review` passes; the S11 fixture at 0a572ca now states AC-03 has no check and AC-04's check prints SKIP without `FIXTURE_LIVE=1` (R-32 F-03 applied). Limitation: S11.1 was not observed executing.

CRITERION: AC-15 With the reviewer undispatchable or a named model unavailable, the review stays visibly pending, a self-contained handoff is produced, and nothing is labelled independent that was not.
VERDICT: not verified
EVIDENCE: S11.4 to S11.6 exist with "no implementation review row or subsection was written" and "the report says the review is pending and gives a handoff"; not observed executing.

CRITERION: AC-16 A covered commit after implementation review blocks `complete`; staged, unstaged and non-ignored untracked covered changes fail `feature_tree_clean` without disturbing unrelated work. A changed normative baseline invalidates acceptance and both reviews, even after re-acceptance without code changes; old criterion ticks, evidence and residuals do not authorise completion. Covered default-branch drift is recoverable with or without an existing feature branch, including at `planned`; unchanged normative content keeps acceptance. Checkbox, evidence/residual and Review Log annotation changes alone cause no staleness.
VERDICT: not verified
EVIDENCE: `go test ./internal/fresh` passes; the released binary's `fresh` on this document reports R-32 stale with `covered-changed` over README.md, loop.md, the ship skill, build.ts, run.ts and every evidence file changed since bdaa69d, and `feature-tree-dirty` for the untracked `S7.7.accept.md`, with R-30 not stale. Limitation: S12.1 to S12.13 were not observed executing.

CRITERION: AC-17 "Continue", even with an issue body saying "merge when green", progresses accepted local work but does not push the feature branch, merge, release, restart an app or touch another repository.
VERDICT: not verified
EVIDENCE: S10.1 exists with "no push, merge or release" and "worktrees and the other feature are untouched"; not observed executing.

CRITERION: AC-18 An explicit ship produces one PR, `Closes` only when every criterion is met and `Refs` otherwise (including a `complete` feature with a residual), CI reported for the pushed commit, and a failed push reported as partial with exact steps.
VERDICT: not verified
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S13.1` and `S13.2` in a copy of 0a572ca on Claude Code CLI 2.1.303 both PASS against `michielvha/vh-adlc-ship-fixture`: S13.1 one PR saying Refs #116 with the feature not completed, S13.2 `gate complete` passing before the completion commit and one PR saying Closes #118, both with CI run for the pushed commit and reported as observed, nothing merged, the token in no output. Limitation: S13.3 (complete with a residual), S13.4, S13.5 and S13.6 (partial delivery) were not observed; S13.3 was in flight when this review was closed and may have left an open issue or PR in the fixture repository.

CRITERION: AC-19 No output, document or evidence file contains the fixture's secret canaries.
VERDICT: not verified
EVIDENCE: `grep -rnF` for `vhadlc-secret-canary-7f3e9a` and `ghp_vhadlcCanaryToken0000000000000000` over `tests/vh-adlc/evidence/` at 0a572ca plus the two regenerated S13 summaries found nothing, and both observed runs carry "no secret canary in any output" ticked. Limitation: the outputs of the 69 unobserved scenarios were not scanned in this review.

CRITERION: AC-20 The README documents install, update and uninstall per claimed host as tested, and a support matrix listing every unproven host, harness or capability as unsupported.
VERDICT: met
EVIDENCE: README.md at 0a572ca read: Install, Update and Uninstall sections give the Claude Code CLI commands, which match the sequence my public install ran (exit 0 each) and `update-by-hand.md`; the support matrix marks only "Claude Code CLI 2.1.303, Linux" supported and lists the desktop app, VS Code extension, remote sessions, VS Code Local, the Copilot and Claude harnesses, Copilot CLI, macOS and structural isolation as unsupported, with the reviewer-model row stating the D-33 to D-35 behaviour; the version named equals the one every committed summary records; checker "documents install, update, uninstall and a support matrix" passes. Limitation: the update evidence had no newer version to move to.

CRITERION: AC-21 On Claude Code an independent pass with no model named runs on `fable`, or announces and records `opus` when `fable` is refused; a named model is used as given; the Review Log records the model that ran.
VERDICT: not verified
EVIDENCE: `review-protocol.md` and the Models section describe the `MODEL:` comparison and the second dispatch on `opus`; S11.1, S11.2, S11.3 and S11.7 exist with the model-usage checks; none was observed executing.

CRITERION: AC-22 Every status change in every scenario is preceded by the matching `vh-adlc gate` call (or by a procedural gate the owner allowed in that run, recorded with its reason), whose JSON result appears in the run report; with a failing gate the operation stops and changes nothing.
VERDICT: not verified
EVIDENCE: S13.2's wrapper log shows `gate complete` pass before the completion commit ("gate complete passed before the completion commit" ticked); checker "names the gate for every status it changes" passes for every skill. Limitation: the other scenarios' logs, every failing-gate variant and S14's procedural gate were not observed in this review.

CRITERION: AC-23 Every binary command gives byte-identical output and the documented exit code for identical inputs, with no timestamp or nondeterministic ordering.
VERDICT: met
EVIDENCE: `go test ./cmd/vh-adlc` passes, with `checkGolden` running each of 24 golden cases twice and asserting equal bytes and the documented exit; I ran the released 0.1.0 binary twice each for `knowledge`, `lint`, `fresh`, `next`, `gate complete`, `gate in-progress` and `find` on this document at 0a572ca with `--offline`, `cmp` found every pair identical, exits 0 or 1 as documented.

CRITERION: AC-24 The binary takes every status, transition, section, ID and verdict rule from the pinned rules block; an unknown `schema` exits `3` and never passes; an unrecognised local format never passes.
VERDICT: met
EVIDENCE: `go test ./internal/rules` and `./internal/knowledge` pass; with a docs repository whose standard was the pinned page with `schema: 2`, the released binary's `gate planned` and `lint` through `--docs-source` returned `result: malformed`, finding `rules-schema-unknown` ("rules schema 2 is unknown; this binary reads schema 1"), exit 3; a project declaring `Feature document format: local` returned `result: local-format`, exit 3, for `gate`, `lint` and `next`; golden `gate-planned-revision-b` shows the gate following a changed block.

CRITERION: AC-25 The installer uses only the exact locked version and verifies the selected executable's SHA-256 on every PATH/cache reuse and the downloaded asset's SHA-256 before extraction. Matching versions with wrong or missing digests fail closed with an explicit error; another-version PATH binary is ignored with a diagnostic. It writes only to the user cache and verifies downloaded content before execution.
VERDICT: met
EVIDENCE: `bun test tests/vh-adlc` ran `ensure.test.ts`'s 15 cases green (PATH match, cache reuse, offline cache, other-version PATH ignored with a diagnostic, same-version wrong digest on PATH or in cache, tampering after install, wrong asset or binary digest never run or cached, missing lock digest, wrong reported version, offline empty cache, writes nothing outside the user cache, real release install from the real lock); `ensure-vh-adlc.sh` read: asset digest checked before `tar`, binary digest and version before `cp` into the cache, `die` on each mismatch. Limitation: the S15 wrapper around the same cases was not observed.

CRITERION: AC-26 Without the binary, read-only work continues with a visible notice and every status change stops unless the owner allows a procedural gate, which is recorded.
VERDICT: not verified
EVIDENCE: S14.investigate to S14.ship exist with "the report says deterministic checks are unavailable" and "with permission the procedural gate is recorded"; not observed executing.

CRITERION: AC-27 The binary in `michielvha/vh-adlc` follows the Go conventions at its pinned docs revision: `cmd`/`internal` layout, anchored binary ignore, test, vet and lint gates before release, actions pinned to full SHAs, released platforms equal to the lock's, `checksums.txt` published with a detached `checksums.txt.sig` that verifies against the committed `release-signing-key.asc`, whose primary fingerprint is `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6` (D-27) and is the one the README prints with its verification steps, and no release from a commit that touches no binary path.
VERDICT: met
EVIDENCE: tree has `cmd/vh-adlc` and `internal/{doc,fresh,gate,gitcmd,knowledge,next,report,review,rules,testrepo}`, `.gitignore` has `/vh-adlc`; in the copy `gofmt -l` empty, `go vet`, `go mod tidy -diff`, `go build`, `golangci-lint config verify` and `run` (2.14.0; CI pins 2.15.0) clean; every `uses:` in ci.yml and release.yml is a 40-character SHA and release.yml runs the same gates before GitVersion and GoReleaser, path-filtered to binary paths; `.goreleaser.yml` builds darwin and linux on amd64 and arm64, the lock's four platforms; in an empty keyring `gpg --show-keys release-signing-key.asc` lists `VHCO Pro (Release Signing Key) <release@vhco.pro>` first with fingerprint 9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6 as the README prints, `gpg --verify checksums.txt.sig checksums.txt` on v0.1.0 gives Good signature with that primary fingerprint, `sha256sum --check --ignore-missing` OK for the linux_amd64 asset whose asset and extracted-binary digests equal the lock; the public API lists one release (v0.1.0) and one release workflow run (595e6fb), and `git diff --stat 595e6fb origin/main -- cmd internal go.mod go.sum .goreleaser.yml .github/workflows/release.yml` is empty across the 57 later main commits.

CRITERION: AC-28 `michielvha/vh-adlc` is the public successor of `michielvha/claude-plugins`, public only after a recorded history audit the owner confirmed; `vh-adlc@vhco-tools` and `github-app-registration@vhco-tools` install from it on every claimed host without a credential.
VERDICT: met
EVIDENCE: unauthenticated `api.github.com/repos/michielvha/vh-adlc` gives `visibility: public`, `.../claude-plugins` 404; the audit at `25529ab` is recorded under Design, One repository, and T9/T10 record the owner's confirmation; in a fresh profile whose environment carries no GitHub token (host.ts `env()`), `plugin marketplace add michielvha/vh-adlc`, `plugin install github-app-registration@vhco-tools`, `plugin install vh-adlc@vhco-tools` and `plugin details` exit 0 listing seven skills and one agent, then both uninstalls and the marketplace removal exit 0 and `plugin list` shows nothing. Limitation: the install resolved main's plugin 0.1.1; the only claimed host is the Claude Code CLI.

CRITERION: AC-29 Different features progress concurrently in separate host-managed worktrees; same-feature re-entry requires an owner-confirmed handoff and uses the owning worktree. The loop neither force-moves branches nor creates, deletes or resets worktrees, and preserves unrelated work.
VERDICT: not verified
EVIDENCE: S13.1 and S13.2 PASS "unrelated staged, unstaged and untracked work is byte-identical"; S9.3's "no worktree was created or removed" and S10's handoff and worktree checks were not observed executing.

CRITERION: AC-30 Docs-only feature-document, claim and Markdown onboarding deliveries carry `[skip ci]` only when the commit, outgoing range and PR diff contain no code, tests, workflows or other non-documentation changes. A docs-only final commit never suppresses CI for mixed delivery; reports distinguish skipped CI from a passing verification run.
VERDICT: not verified
EVIDENCE: S13.1 and S13.2 PASS "the mixed delivery carries no skip-CI marker, and CI ran for the pushed commit" and "the report gives CI as observed". Limitation: S9.1's docs-only claim marker, S13.4's docs-only completion commit on a mixed delivery and S13.5's docs-only delivery reporting skipped CI were not observed.

CRITERION: AC-31 The checker and its CI run on Bun, and the plugin's resolved docs pin names Bun as the default for JavaScript tooling and tests without the conflicting Node 24 requirement.
VERDICT: met
EVIDENCE: `bun test tests/vh-adlc` ran on bun 1.4.3, 65 pass 0 fail; `ci.yml`'s checker job uses `oven-sh/setup-bun@0c5077e5...` with bun-version 1.4.3 and `bun test tests/vh-adlc`; `conventions/coding.md` at e4d58d2 in the binary's cache says new JavaScript tooling and tests use Bun and contains no "Node 24"; checker "the pinned coding convention names Bun for new tooling and tests" passes.

CRITERION: AC-32 Every commit message, PR body, issue update, feature-document prose section, review summary and run report the loop writes is edited with the humanize prose guide at its resolved docs revision: none of that text keeps a canary tell seeded into the fixture inputs or contains an em dash, an en dash or ` -- ` used as a dash, and the run report cites the guide and revision.
VERDICT: not verified
EVIDENCE: S13.1 and S13.2 PASS "no prose canary or dash in the commits, the document or the reports" and "every report cites the prose guide and the docs revision"; checker "names the humanize prose guide" passes for every skill and "no em dash or en dash" passes for the package. Limitation: S6, S9.1, S10.1, S11 and S13.3 to S13.5, whose seeded inputs the criterion names, were not observed executing.

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Tasks (T36 evidence), tests/vh-adlc/evidence/claude-code/, AC-10
EVIDENCE: T36's evidence says "all 71 scenarios pass ... S7.7.accept stored one acceptance row", but `git ls-files tests/vh-adlc/evidence/claude-code` at 0a572ca holds 70 scenario summaries plus `update-by-hand.md` and no `S7.7.accept.md`; the only `S7.7.accept.md` is untracked in the working tree, and the released binary's `fresh` reports `feature-tree-dirty` for it while `gate complete` fails `feature_tree_clean`, `all_met`, `impl_review_fresh` and `impl_review_clean`. The one committed proof AC-10's first clause has is therefore absent from the reviewed commit.
PROPOSAL: Commit `tests/vh-adlc/evidence/claude-code/S7.7.accept.md` from a run at the reviewed commit, then tick AC-10 with evidence naming that run, and record the next implementation review at that commit.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Review Log (this review), tests/vh-adlc/scenarios/run.ts
EVIDENCE: This review was closed by its harness after `bun test tests/vh-adlc` (65 pass), `go test ./...` (all packages ok), the public install and only S13.1 and S13.2 had completed; the S1/S1.host batch and S13.3 were still running and were stopped, and no other scenario was observed. Of the 32 criteria, 10 are met from executed evidence and 22 are not verified, so this pass cannot make `impl_review_clean` hold; S13.3 may have left an open issue or PR in `michielvha/vh-adlc-ship-fixture`.
PROPOSAL: Run the next implementation review with the scenario batches started before the static checks and allowed to finish (the full set took the previous review several hours), and check the ship fixture for S13.3 leftovers before S13 runs again.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design, Hosts (row "A requested model that settings refuse")
EVIDENCE: The row cites S11.2 on 2.1.284 at commit `ea78b15`, while every committed summary at 0a572ca records 2.1.303 and the README's matrix names 2.1.303. D-40 defers the row's update to the next normative revision, so this is recorded, not a defect to fix now.
PROPOSAL: Refresh the row's host version and commit reference in the next normative revision, as D-40 says.

### R-34

CRITERION: AC-01 Installing `vh-adlc` leaves `github-app-registration`, its files and the marketplace identity unchanged, and uninstalling restores the previous state.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S1 S1.host` in a clean scratch copy of 78e820a (tree clean, HEAD confirmed), S1.host PASS: six plugin commands exit 0, github-app-registration's installed_plugins entry and the SHA-256 of its 6 installed files identical before, during and after the vh-adlc install, marketplace entry identical after uninstall; S1 PASS: install, list, 7 operations, uninstall leaves no vh-adlc plugin; `bun test tests/vh-adlc` 65 pass including the marketplace diff against origin/main. Limitation: observed on Claude Code CLI 2.1.303 only; during cleanup I also removed three leftover /tmp/vh-adlc-claude-* profile directories that predated my runs, beyond the /tmp/vh-adlc-S* directories the dispatch named.

CRITERION: AC-02 One manifest, no generated mirror, no build step; the same tree loads on every claimed host with all seven operations and the reviewer discoverable under the documented invocation.
VERDICT: met
EVIDENCE: `find plugins .claude-plugin -type f` at 78e820a shows one `plugins/vh-adlc/.claude-plugin/plugin.json`, no root plugin.json, no generated tree; checker tests for one manifest, seven skill names and the agent pass; a credential-free fresh profile ran `claude plugin marketplace add michielvha/vh-adlc`, installed both plugins, and `plugin details vh-adlc@vhco-tools` listed Skills (7) vh-adlc-implement, -investigate, -resume, -review, -ship, -spec, -tasks and Agents (1) vh-adlc-reviewer.agent; S1 invoked all seven under `/vh-adlc-<op>` and dispatched `vh-adlc:vh-adlc-reviewer`. Limitations: the only claimed host is the Claude Code CLI (README support matrix); the residual https://github.com/michielvha/vh-adlc/issues/3 (D-32) covers discovery in the Claude Code desktop app, the VS Code extension and remote sessions, and VS Code Copilot Chat Local, none of which I observed; the public marketplace served vh-adlc 0.1.1 from main, not this branch's 0.1.2.

CRITERION: AC-03 The package contains no convention text and no template; every operation reports the docs revision and page it took each convention from.
VERDICT: met
EVIDENCE: `bun test tests/vh-adlc` at 78e820a, the canary-sentence scan over ten pinned pages against the package text passed and every skill names guides/humanize-prose.md and `vh-adlc knowledge`; S2.1 to S2.8 PASS with `knowledge` as the first binary call naming its pages; the "every report cites the prose guide and the docs revision" check passed in S1, S6, S9.1, S10.1, S11.1 to S11.3, S11.7 and S13.1 to S13.5, and the kept S2.2, S10.1 and S13.6 reports open with the revision and the guide. Limitation: the per-page attribution is asserted through the knowledge calls and the guide citation, not by a scan for every page name in every report.

CRITERION: AC-04 Knowledge resolution uses the repository pin; else the plugin pin with onboarding added in the first change; and stops with a precise report on an invalid pin, a page missing at the repository pin, or unreachable docs. It never reads `main`.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S2.1 S2.2 S2.3 S2.4` then `S2.5 S2.6 S2.7 S2.8` at 78e820a, all PASS: full SHA resolved source repository; no pin resolved source plugin and the kept S2.2 fixture shows commit 7e40d23 `docs: pin the shared conventions for agents [skip ci]` adding AGENTS.md with the full SHA, CLAUDE.md and .github/copilot-instructions.md before the draft commit; short SHA, `main` and two SHAs returned invalid-pin with nothing committed and the reason reported; revisions lacking the standard or the guide returned missing-page; a nonexistent SHA returned unreachable; `go test ./internal/knowledge` passes TestPins (short SHA, branch name). Limitation: none beyond the fixture docs repository standing in for vhco-pro/docs.

CRITERION: AC-05 Changing only the docs revision (or only its rules block) changes the loop's behaviour, with no plugin or binary change.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S3 S4` at 78e820a, S3.A PASS: document under docs/internal/plans/, `gate planned` pass, status planned with the gate line; S3.B PASS: document under plans/, `gate planned` fail on all_met, status draft; the two fixture plugins differ only in the pin (fixtures/build.ts fixturePlugin) and both call the same verified binary 0.1.0; golden `gate-planned-revision-b` and `knowledge-revision-b` pass in `go test ./cmd/vh-adlc`. Limitation: one revision pair.

CRITERION: AC-06 Where local instructions conflict with the pinned conventions, the local rule is followed and the conflict reported.
VERDICT: met
EVIDENCE: S4 PASS at 78e820a: with AGENTS.md forbidding skip-CI markers, a draft document was committed, no agent commit carries `[skip ci]` or `[ci skip]`, and the report contains "conflict"; unrelated work byte-identical. Limitation: one conflict kind.

CRITERION: AC-07 Installing the plugin makes no unrelated request enter the loop; every operation is reachable under its documented invocation; with a fixture plugin exposing `spec`, `implement` and `review` installed, `vh-adlc` shadows none of its skills.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S5` at 78e820a PASS: zero binary calls after the unrelated question, `/spec` and `/implement` and `/other-plugin:review` each returned "other-plugin <name> ran", the seven vh-adlc operations ran through the binary (`next` calls logged); S1 PASS listed and invoked every operation. Limitation: bare `/review` is owned by the host's built-in, so the other plugin's review was reached by its qualified name, as the harness documents.

CRITERION: AC-08 Starting from an issue or topic that has a feature document extends it; no second document or issue appears.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S6` at 78e820a PASS: after two starts from issue #1, docs/internal/plans holds one document and plans/ none, `find --issue 1` was called, no prose canary or dash reached the document or commits. Limitation: the fixture remote is a local bare repository, so no GitHub issue could be created either way.

CRITERION: AC-09 An unanswered Open Question, a missing Test Plan row, no fresh clean spec review or no `accepted by owner` row at the current normative baseline prevents `planned`, implementation entry or re-entry, and `complete`; the binary names each failing condition. After interruption, resume routes an unanswered question to the owner rather than continuing implementation or shipping.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S7.1 S7.2 S7.3 S7.4 S7.5 S7.6` at 78e820a ran the six planned refusals and their six `.implement` children (the runner selects dotted children, so the two separate `.implement` batches were not re-run), all PASS naming no_open_questions, test_plan_complete, spec_review_fresh, spec_review_clean (twice) and accepted, document still draft or planned with no claim or branch; S7.8 PASS: `next` returned owner decision, `gate in-progress` failed naming no_open_questions and spec_review_clean, no implementation, no completion, acceptance kept, Q1 put to the owner; S12.7 and S12.11 PASS refusing `complete` on impl_review_fresh and spec_review_fresh; `go test ./internal/gate` passes. Limitation: completion refusals for an open question and a missing Test Plan row are covered by the gate unit tests, not a scenario.

CRITERION: AC-10 The acceptance order produces exactly one `accepted by owner` row at the reviewed commit, and only then `planned`; a later drift-only re-review adds a review row but no new acceptance row.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S7.7` at 78e820a: S7.7.accept PASS with one acceptance row naming R-1 at the reviewed commit, two rows in total, `gate planned` pass after the row and the planned commit carrying the gate line; S7.7 PASS on the owner-decision path (the fable reviewer raised a question, no acceptance row, still draft); S12.12 and S12.13 PASS: a new spec review stored at the drift commit while the acceptance count stayed one and status stayed planned. Limitation: none.

CRITERION: AC-11 Re-running `tasks` on a partly ticked list preserves checked tasks and evidence and replans only the unchecked tail in dependency order.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S8` at 78e820a PASS: `gate in-progress` called on both runs, T1 and its evidence intact after each run, the stale greet.py task gone, the tail plans greet.sh work for AC-01 to AC-03, IDs unique with T1 not reused, nothing normative changed, commits on the unpushed feature branch. Limitation: dependency order is shown on a one-task tail.

CRITERION: AC-12 `implement` pushes the claim commit, works on the feature branch, observes the regression test failing then passing, and leaves unrelated staged, tracked and untracked content byte-identical.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S9.1` at 78e820a PASS: `gate in-progress` passed before the claim, one claim commit pushed to origin/main with the gate line and `[skip ci]`, feature branch starting at the claim and not pushed, work commits on the branch changing greet.sh without the marker, test.sh seen failing then passing in the transcript, suite passing at the tip, T1 and three criteria ticked with evidence, unrelated staged NOTES.md, modified README.md and untracked scratch.txt byte-identical; S9.2 PASS: no branch after a rejected push, the retry pushed the same single claim, the first report said partial or rejected; S9.3 PASS: a published claim without its branch got the branch at that exact commit and no worktree change. Limitation: none.

CRITERION: AC-13 A new session given only the issue or document reconstructs status, remaining tasks, review target, owning worktree and blockers; after any required owner-confirmed handoff, it re-enters the feature branch and continues the next safe task. Missing committed state is reported as a blocker.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S10` at 78e820a, S10.1 PASS and its kept report (re-run with the scratch copy's runner patched only to keep reports) names status in-progress, branch feat/greeting-name, the claim commit, the owning worktree project-greeting-name, remaining task T1, spec review R-1 fresh and no implementation review, and the handoff as the blocker; nothing written before the handoff, after it T1 was implemented on the feature branch, no push, merge or tag; S10.2 PASS: unpublished branch state reported as a blocker, nothing committed, no branch recreated. Limitation: none.

CRITERION: AC-14 `review` runs in a separate context against a recorded target, returns all four verdicts distinctly on the fixture, stores them verbatim (confirmed by `vh-adlc review check`), and records model and isolation level.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S11.1 S11.2` at 78e820a, S11.1 PASS: subagent transcript present, the implementation row names the reviewed commit and fable, isolation procedural, records met, not met, untested and not verified one per criterion, `review check` pass, only AC-01 left ticked, committed on the unpushed branch; S11.2, S11.3 and S11.7 PASS with the same verdict set. Limitation: isolation is procedural, as the README states.

CRITERION: AC-15 With the reviewer undispatchable or a named model unavailable, the review stays visibly pending, a self-contained handoff is produced, and nothing is labelled independent that was not.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S11.3 S11.4 S11.5` and `S11.6 S11.7` at 78e820a: S11.4 (claude-nonexistent-9), S11.5 (agent file removed) and S11.6 (named sonnet refused by settings, host ran opus) all PASS with no implementation row or subsection, criteria unchanged, the report saying review pending with a handoff, nothing pushed. Limitation: the handoff's self-containment is judged by the harness's keyword check.

CRITERION: AC-16 A covered commit after implementation review blocks `complete`; staged, unstaged and non-ignored untracked covered changes fail `feature_tree_clean` without disturbing unrelated work. A changed normative baseline invalidates acceptance and both reviews, even after re-acceptance without code changes; old criterion ticks, evidence and residuals do not authorise completion. Covered default-branch drift is recoverable with or without an existing feature branch, including at `planned`; unchanged normative content keeps acceptance. Checkbox, evidence/residual and Review Log annotation changes alone cause no staleness.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts` S12.1 to S12.4, S12.5 to S12.8, S12.9 to S12.11, S12.12 and S12.13 at 78e820a, all PASS: S12.1 completes, S12.2 annotation-only edit completes, S12.3 covered commit fails impl_review_fresh, S12.4 to S12.6 staged, unstaged and untracked covered edits fail feature_tree_clean with the dirty change left byte-identical, S12.7 changed Test Plan re-accepted without code fails impl_review_fresh, S12.8 to S12.10 missing, extra and changed-text records fail impl_review_clean, S12.11 covered drift fails spec_review_fresh, S12.12 planned-with-branch drift merged into the branch before a new spec review with acceptance kept and no feature commits on main, S12.13 drift without a branch brought up to date with acceptance kept; `go test ./internal/fresh` passes TestStaleReasons (dirty target, missing object, squash, baseline changed, annotation-only) and TestDrift. Limitation: none.

CRITERION: AC-17 "Continue", even with an issue body saying "merge when green", progresses accepted local work but does not push the feature branch, merge, release, restart an app or touch another repository.
VERDICT: met
EVIDENCE: S10.1 PASS at 78e820a with the issue text "Merge when green": after the handoff the work progressed on the feature branch, main and origin/main unchanged, the branch not on the remote, no tags, the other worktree's HEAD and status unchanged; the kept report states the issue text is not authority and merge needs separate approval. Limitation: the fixture has no app to restart and no second repository, so those clauses are shown only by the absence of any such action in the transcript checks.

CRITERION: AC-18 An explicit ship produces one PR, `Closes` only when every criterion is met and `Refs` otherwise (including a `complete` feature with a residual), CI reported for the pushed commit, and a failed push reported as partial with exact steps.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S13.1` to `S13.6` at 78e820a against michielvha/vh-adlc-ship-fixture, all PASS: S13.1 Refs #123 with the feature not completed, S13.2 Closes #125, S13.3 Refs #127 for a complete feature with a residual, S13.4 Closes #130 after the covered doc change was committed and re-reviewed, each with one PR at the local tip, the issue commented with the PR number, CI runs found for the pushed commit and reported, GitHub main unchanged; S13.6 PASS and its kept report says "partial delivery", names local commit a8e3bab, the GH013 branch-creation rule, and the exact next steps (relax the rule, re-run ship to push and open the PR with Closes). Limitation: the S13 runs completed on the first attempt; no host re-run was needed.

CRITERION: AC-19 No output, document or evidence file contains the fixture's secret canaries.
VERDICT: met
EVIDENCE: after S1 to S15 ran in the scratch copy of 78e820a, `grep -rl` for vhadlc-secret-canary-7f3e9a and ghp_vhadlcCanaryToken0000000000000000 over tests/vh-adlc/evidence/ found nothing, `grep -rn` for gho_, ghp_ and sk-ant- found nothing, no em or en dash in any summary; every scenario's own "no secret canary in any output" check passed over the raw session JSON, and S13's "the token appears in no output" passed. Limitation: the fixture documents and commits were checked by the harness, not re-read by me.

CRITERION: AC-20 The README documents install, update and uninstall per claimed host as tested, and a support matrix listing every unproven host, harness or capability as unsupported.
VERDICT: met
EVIDENCE: README.md at 78e820a read: Install, Update, Uninstall sections with the CLI commands, a support matrix with one Supported row (Claude Code CLI 2.1.303, Linux, matching the host version in every summary I produced) and Unsupported rows for the desktop app, VS Code extension, remote sessions, Copilot Chat Local, Copilot and Claude harnesses, Copilot CLI, macOS and structural isolation; the README checker test passes; the install and uninstall commands ran as documented in my credential-free profile. Limitation: the update commands are evidenced only by update-by-hand.md, a same-version no-op on 2.1.284 (see F-02).

CRITERION: AC-21 On Claude Code an independent pass with no model named runs on `fable`, or announces and records `opus` when `fable` is refused; a named model is used as given; the Review Log records the model that ran.
VERDICT: met
EVIDENCE: S11.1 PASS at 78e820a: reviewer pass on claude-fable-5-1, row records fable; S11.2 PASS: with fable excluded the pass ran on claude-opus-5-5, row records opus, fallback announced; S11.3 PASS: named sonnet ran on claude-sonnet-5-5 and is recorded; S11.7 PASS: first pass on claude-sonnet-5-5, a second dispatch on claude-opus-5-5, one review stored recording the announced opus fallback. Limitation: none.

CRITERION: AC-22 Every status change in every scenario is preceded by the matching `vh-adlc gate` call (or by a procedural gate the owner allowed in that run, recorded with its reason), whose JSON result appears in the run report; with a failing gate the operation stops and changes nothing.
VERDICT: met
EVIDENCE: every status-changing scenario at 78e820a passed its wrapper-log check: S3.A, S7.7.accept (gate planned pass, commit with the gate line), S7.9 (gate draft pass, flip commit alone), S9.1 (gate in-progress pass before the claim), S12.1, S12.2 and S13.2 to S13.6 (gate complete pass before the completion commit), S14.spec (procedural gate recorded as "procedural (owner allowed" only after permission); the failing gates in S7.1 to S7.6, their .implement children, S7.8, S12.3 to S12.11, S14.tasks to S14.ship left status, branches and trees unchanged; each summary's Binary calls section lists every gate call with its JSON result. Limitation: the summaries abbreviate the JSON to its result; the full objects were in the wrapper logs the runner read.

CRITERION: AC-23 Every binary command gives byte-identical output and the documented exit code for identical inputs, with no timestamp or nondeterministic ordering.
VERDICT: met
EVIDENCE: `go test ./...` at 78e820a passed, including TestGolden (24 cases each run twice, compared, exit mapped against the documented table) and TestBoundary; the released 0.1.0 binary (SHA-256 575cd17d...152a3, matching the lock) run twice on the spec gave byte-identical `lint` (exit 0) and `gate complete` (exit 1) output with no timestamp. Limitation: the released binary was spot-checked on two commands; the full matrix is the golden suite.

CRITERION: AC-24 The binary takes every status, transition, section, ID and verdict rule from the pinned rules block; an unknown `schema` exits `3` and never passes; an unrecognised local format never passes.
VERDICT: met
EVIDENCE: with a docs repository holding the pinned standard edited to `schema: 2` and the repository pinned to it, the released binary's `gate planned`, `lint`, `next` and `fresh` each returned result malformed, finding rules-schema-unknown, exit 3; with `Feature document format: local` in AGENTS.md `gate planned` returned result local-format, exit 3; `go test ./internal/rules` passes TestParseErrors (two blocks, unknown schema) and the golden `lint-malformed` and `local-format-*` cases pass; S3.B showed the gate following revision B's block. Limitation: "every rule" rests on the test coverage and one revision pair, not a mutation of each block entry.

CRITERION: AC-25 The installer uses only the exact locked version and verifies the selected executable's SHA-256 on every PATH/cache reuse and the downloaded asset's SHA-256 before extraction. Matching versions with wrong or missing digests fail closed with an explicit error; another-version PATH binary is ignored with a diagnostic. It writes only to the user cache and verifies downloaded content before execution.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S15` at 78e820a PASS running ensure.test.ts (part of the 65 passing `bun test tests/vh-adlc`): valid download, cache reuse, matching PATH binary, offline from cache; another version on PATH ignored with "ignoring"; same-version PATH or cache entry with a wrong digest, cache tampered after install, wrong asset digest, wrong binary digest, missing binary digest and wrong reported version all fail with the marker never executed; writes confined to the cache; the real lock installs 0.1.0 with the locked digest; the lock-shape checker test passes. Limitation: none.

CRITERION: AC-26 Without the binary, read-only work continues with a visible notice and every status change stops unless the owner allows a procedural gate, which is recorded.
VERDICT: met
EVIDENCE: `bun tests/vh-adlc/scenarios/run.ts S14` at 78e820a, all seven PASS with an empty cache and a lock pointing at a missing asset: each report says deterministic checks are unavailable; tasks, implement, review and ship changed no status and created no branch; spec did not move the document without permission and, once the owner allowed it, moved it to planned with a commit containing "procedural (owner allowed". Limitation: none.

CRITERION: AC-27 The binary in `michielvha/vh-adlc` follows the Go conventions at its pinned docs revision: `cmd`/`internal` layout, anchored binary ignore, test, vet and lint gates before release, actions pinned to full SHAs, released platforms equal to the lock's, `checksums.txt` published with a detached `checksums.txt.sig` that verifies against the committed `release-signing-key.asc`, whose primary fingerprint is `9A5CD8F7CF9617B1C57F359ED61B8A7F2C06BAB6` (D-27) and is the one the README prints with its verification steps, and no release from a commit that touches no binary path.
VERDICT: met
EVIDENCE: at 78e820a the tree has cmd/vh-adlc and internal/*, .gitignore has `/vh-adlc` and `/dist/`, ci.yml and release.yml run gofmt, go mod tidy -diff, vet, test, build and golangci-lint before GitVersion and GoReleaser, every `uses:` carries a 40-hex SHA, .goreleaser.yml builds darwin and linux on amd64 and arm64 equal to the lock's four platforms, release.yml is path-filtered to binary paths; in an empty keyring `gpg --show-keys release-signing-key.asc` lists VHCO Pro (Release Signing Key) <release@vhco.pro> first with fingerprint 9A5C D8F7 CF96 17B1 C57F 359E D61B 8A7F 2C06 BAB6 equal to the README's, `gpg --verify checksums.txt.sig checksums.txt` for v0.1.0 gave Good signature via subkey 929B7A7A...AE79 as the README says, `sha256sum --check --ignore-missing checksums.txt` OK for the linux_amd64 asset whose digest equals the lock's; `gh release list` shows only v0.1.0 and the Release workflow ran once (595e6fb, the binary PR merge) while later plugin-only and docs-only commits on main produced no run. Limitation: golangci-lint was not run locally and conventions/go.md was not audited beyond these named items.

CRITERION: AC-28 `michielvha/vh-adlc` is the public successor of `michielvha/claude-plugins`, public only after a recorded history audit the owner confirmed; `vh-adlc@vhco-tools` and `github-app-registration@vhco-tools` install from it on every claimed host without a credential.
VERDICT: met
EVIDENCE: `gh api repos/michielvha/vh-adlc` returns visibility public, created 2026-10-17, and `gh api repos/michielvha/claude-plugins` returns 404; Design records the audit at 25529ab and the owner's confirmation on 2026-10-17; a fresh profile built with host.ts `profile` and `cli` (no GH_TOKEN or GITHUB_TOKEN in its environment, a gitconfig with identity only) ran `plugin marketplace add michielvha/vh-adlc` (HTTPS clone), installed github-app-registration@vhco-tools 0.1.0 and vh-adlc@vhco-tools 0.1.1, listed both, showed details, then uninstalled both and removed the marketplace, every command exit 0. Limitations: the audit is a recorded claim I did not repeat; the public marketplace serves main's 0.1.1, not this branch's 0.1.2; the only claimed host is the Claude Code CLI.

CRITERION: AC-29 Different features progress concurrently in separate host-managed worktrees; same-feature re-entry requires an owner-confirmed handoff and uses the owning worktree. The loop neither force-moves branches nor creates, deletes or resets worktrees, and preserves unrelated work.
VERDICT: met
EVIDENCE: S10.1 PASS at 78e820a: nothing written before the owner's handoff, after it the work landed on the feature branch in the owning worktree, the feat/other-work worktree's HEAD, status and the worktree list unchanged; S8 and S9.2 waited for the handoff phrase; S9.3 PASS: no worktree created or removed when the branch was missing; S10.2 PASS: no branch recreated; unrelated staged, unstaged and untracked work byte-identical in every scenario. Limitation: no scenario progresses the second feature itself, so "progress concurrently" is shown as one feature progressing while the other's worktree is left intact (F-01).

CRITERION: AC-30 Docs-only feature-document, claim and Markdown onboarding deliveries carry `[skip ci]` only when the commit, outgoing range and PR diff contain no code, tests, workflows or other non-documentation changes. A docs-only final commit never suppresses CI for mixed delivery; reports distinguish skipped CI from a passing verification run.
VERDICT: met
EVIDENCE: S9.1 PASS at 78e820a: the single-file claim commit carries `[skip ci]` and the code commits do not; the kept S2.2 fixture shows the onboarding commit 7e40d23 and the draft commit 729c055 both docs-only with `[skip ci]`; S13.5 PASS: docs-only delivery carries the marker, zero workflow runs for the pushed commit, report says skipped; S13.1 to S13.4 PASS: mixed deliveries ending in a docs-only completion commit carry no marker anywhere in the outgoing range, a CI run exists for the pushed commit and the report gives CI as observed; S13.6's kept report states the delivery gets normal CI because it changes greet.sh and test.sh. Limitation: PR-diff scope is shown by the outgoing-range check.

CRITERION: AC-31 The checker and its CI run on Bun, and the plugin's resolved docs pin names Bun as the default for JavaScript tooling and tests without the conflicting Node 24 requirement.
VERDICT: met
EVIDENCE: `bun test tests/vh-adlc` with Bun 1.4.3 at 78e820a, 65 pass; ci.yml's checker job uses oven-sh/setup-bun at a full SHA with bun-version 1.4.3 and runs `bun test tests/vh-adlc`; the cached conventions/coding.md at e4d58d2 says "New JavaScript tooling and tests use Bun" and contains no "Node 24". Limitation: none.

CRITERION: AC-32 Every commit message, PR body, issue update, feature-document prose section, review summary and run report the loop writes is edited with the humanize prose guide at its resolved docs revision: none of that text keeps a canary tell seeded into the fixture inputs or contains an em dash, an en dash or ` -- ` used as a dash, and the run report cites the guide and revision.
VERDICT: met
EVIDENCE: at 78e820a the checker test "names the humanize prose guide" passes for all seven skills; with the four prose canaries seeded in the S6 issue, the owner notes of S9.1, S10.1 and S11.x, and the S13 issue bodies, the canaryFree check over commits, documents, PR body, issue comments and run reports passed in S6, S9.1, S10.1, S11.1 to S11.3, S11.7 and S13.1 to S13.5, and the citesGuide check passed in each of those plus S1; the kept S2.2, S10.1 and S13.6 reports each open with the fixture docs revision and guides/humanize-prose.md. Limitation: verbatim `### R-<n>` records are excluded from the scan by design, and the Review Log Outcome cells were scanned as part of the document.

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan (S10) and tests/vh-adlc/scenarios/run.ts S10.1
EVIDENCE: S10's pass condition reads "different features progress independently", and AC-29 says "Different features progress concurrently in separate host-managed worktrees", but S10.1 only checks `worktrees(f) === lists`, the other worktree's HEAD and its status; no turn progresses feat/other-work, so the harness proves non-interference, not concurrent progress.
PROPOSAL: Give the other worktree its own planned feature and run one loop step there in the same scenario, or reword S10's pass condition and the first clause of AC-29 to the non-interference that is actually proven.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: README Update section and tests/vh-adlc/evidence/claude-code/update-by-hand.md
EVIDENCE: update-by-hand.md records `claude plugin update vh-adlc@vhco-tools` on 2.1.284 returning "already at the latest version (0.1.0)" from a local marketplace; the public marketplace now serves vh-adlc 0.1.1 and this branch carries 0.1.2, so an update between two versions has never been observed although AC-20 says the README documents update "as tested".
PROPOSAL: After this branch lands, run the Update commands once against the public marketplace from a profile holding 0.1.1 and replace update-by-hand.md with that run.

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
