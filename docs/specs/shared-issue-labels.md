---
status: draft
status_description: "Being written; open questions wait for the owner before the first spec review."
issue: null
goal: "Every repository that adopts vh-adlc carries the same issue labels, and vh-adlc operations apply them the same way in each one."
covers:
  - plugins/vh-adlc/references/issues.md
  - plugins/vh-adlc/scripts/labels/
  - plugins/vh-adlc/references/triage.md
  - plugins/vh-adlc/references/triage-settings.md
  - plugins/vh-adlc/scripts/triage/settings.ts
  - plugins/vh-adlc/scripts/triage/types.ts
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/skills/vh-adlc-investigate/
  - plugins/vh-adlc/skills/vh-adlc-spec/
  - plugins/vh-adlc/skills/vh-adlc-triage/
  - docs/user-guides/workflows.md
  - .vh-adlc/triage.yaml
  - tests/vh-adlc/labels/
---

# Plan: Shared issue labels

One standard set of issue labels ships with vh-adlc. A packaged helper brings any repository to it,
and the operations that file or assess issues label them the same way everywhere.

## Context

### Owner summary

Stackweaver has four labels that say where an issue stands: `ready`, `blocked`, `partial` and
`needs-decision`. Its old triage agent proposed them, you approved them, and they were created in
Stackweaver only. When triage moved into vh-adlc, the procedure came along and the labels did not.
The shared triage was built to read whatever labels a repository already has and to create none
itself. Nobody decided against a shared set. The question was never asked, because the migration was
about who may write a label, not which labels should exist. The result is that vh-adlc's own
repository has none of the four, and 9 of its 10 open issues carry no label at all.

Stackweaver's investigate agent also labels every issue it files. vh-adlc's investigate has no such
rule, so that habit would be lost when shared-development-loop (vh-adlc #78, in progress) moves
Stackweaver onto the shared operations.

This feature adds a standard label set to the plugin: type labels (`bug`, `enhancement`,
`documentation`, `refactor`, `security`) and the four state labels, each with a fixed color and
description. A new helper compares a repository's labels with the set and shows a plan. Once you
approve its exact digest, it creates the missing labels and corrects colors and descriptions. It
never deletes or renames a label and never touches labels the standard does not own, such as the
ones Dependabot and Renovate create. Investigate and spec give every issue they file one type label
and the state label their verdict names. Triage keeps its existing rule: a state label it applies is
a verdict and needs proof from the confined controller.

vh-adlc gets its own `.vh-adlc/triage.yaml`, and the helper is run on vh-adlc and Stackweaver as the
first two repositories. Other adopters follow later, on your request per repository.

Every check named here is planned; nothing has run yet. No spec review has happened. Six open
questions need your answers first, including where the set lives, how it reaches repositories and how
this fits around #78. Accepting this document authorizes building it on a feature branch. Running the
helper's apply against any real repository still needs your approval of that exact plan.

### Background

- The four state labels exist only in Stackweaver: `gh label list -R michielvha/stackweaver` lists
  `ready` (#0e8a16), `blocked` (#b60205), `partial` (#fbca04) and `needs-decision` (#5319e7), used on
  44, 12, 32 and 54 issues (`gh issue list -l <label> --state all`, 2026-11-13).
  `gh label list -R michielvha/vh-adlc` lists none of them; it has the GitHub defaults plus
  `accessibility` and `release:preview`. In vh-adlc, 9 of 10 open issues have no label; in
  Stackweaver, 15 of 139.
- The legacy Stackweaver triage agent proposed the four labels once for owner approval and said not
  to create labels without asking (Stackweaver `agents/issue-triage.md:37` and `:156-167` at the
  parent of `c398866b`).
- Stackweaver adopted the shared triage in `c398866b` (2026-10-24). Its settings map only type labels
  (Stackweaver `.vh-adlc/triage.yaml:46`).
- Shared triage records a repository's label vocabulary and blocks assignment of a missing label until
  an approved creation completes (`plugins/vh-adlc/references/triage.md:206-208`, added in `8e9817a`).
  A neutral `create-label` with a `definition` gets the description prefix "Owner-selected taxonomy;
  unverified definition:" (`plugins/vh-adlc/scripts/triage/execute.ts:162-164`), so triage cannot
  create a label with a plain standard description outside the controller.
- `label_map` is parsed and validated (`plugins/vh-adlc/scripts/triage/settings.ts:92-94`,
  `types.ts:23`) and defaults to `{}` (`references/triage-settings.md:46`). No other code reads it:
  `grep -rn label_map plugins tests` finds only the parser, the type, the reference and two settings
  tests.
- Every published triage verdict, labels included, needs current proof in the confined controller
  (`plugins/vh-adlc/references/authority.md:52-56`).
- Stackweaver's investigate labels the issue it files from `ready`, `blocked` or `needs-decision`
  plus a type label (Stackweaver `agents/investigate.md:65-67`). vh-adlc's investigate only says to
  give an issue a short summary that links the findings document
  (`plugins/vh-adlc/skills/vh-adlc-investigate/SKILL.md:26-28`). Spec says creating an issue needs
  explicit authority and says nothing about labels (`skills/vh-adlc-spec/SKILL.md:50`). Creating a
  tracking issue needs acceptance or a request (`references/authority.md:25`).
- shared-development-loop (`docs/specs/shared-development-loop.md`, `in-progress` on
  `feat/shared-development-loop`) covers `plugins/vh-adlc/skills/vh-adlc-investigate/` and plans a
  Stackweaver parity map with one row per legacy rule of `agents/investigate.md` (its task T25). Its
  document does not mention issue labels (`grep -n -i label` finds no issue-label rule).
- The projects helper already follows an inventory, digest and approved-apply pattern
  (`plugins/vh-adlc/references/projects.md:105-111`, `plugins/vh-adlc/scripts/projects/apply.ts`).
- Seventeen distinct repositories have a local checkout that pins the vhco-pro/docs conventions or carries `.vh-adlc/` settings, across
  `michielvha`, `vhco-pro` and `LowGok` repositories (a scan of `/home/m/code/*/AGENTS.md` and
  `.vh-adlc/`, 2026-11-13).

## Scope

In scope:

- The standard label set as one machine-readable file in the plugin, and a reference page,
  `references/issues.md`, that lists each label and says which operation applies it.
- A packaged labels helper with `plan` and `apply`: plan compares a repository with the set, apply
  makes only the approved changes.
- Labeling rules in investigate and spec for the issues they already have authority to file.
- Triage's reference naming the standard state labels as the ones its verdicts use, with the
  controller rule unchanged.
- A defined meaning for `label_map`, or its removal, per Q5.
- vh-adlc's own `.vh-adlc/triage.yaml`.
- Applying the set to `michielvha/vh-adlc` and `michielvha/stackweaver`.
- The workflows user guide and an authority row for the helper.

Out of scope:

- Removing or renaming any existing label, or removing a label from an issue.
- Labels owned by bots (Dependabot's `dependencies`, `go`, `javascript`, `python:uv`; Renovate's
  `major-upgrade`). They stay as their tools create them.
- Priority labels. Priority stays in plan frontmatter and milestones, as the legacy agent decided.
- Relabeling existing unlabeled issues. That is triage's work and keeps its controller rule.
- Running the helper on adopters other than vh-adlc and Stackweaver. Each is a separate request.
- Org or account default labels on GitHub, which affect only repositories created later.
- Any change to shared-development-loop's document. Its owner session decides how its parity map
  points here.

## Design

### Glossary

| Term | Meaning |
| --- | --- |
| standard label set | The labels the plugin's vocabulary file defines, each with name, color and description |
| type label | A standard label that says what kind of work an issue is |
| state label | A standard label that says where an issue stands: `ready`, `blocked`, `partial`, `needs-decision` |
| label plan | The helper's comparison of one repository with the standard label set, bound by a digest |

### The standard label set

One file, `plugins/vh-adlc/scripts/labels/vocabulary.json`, holds the set. Proposed contents,
pending Q3:

| Name | Kind | Color | Description |
| --- | --- | --- | --- |
| `bug` | type | `d73a4a` | Something isn't working |
| `enhancement` | type | `a2eeef` | New feature or request |
| `documentation` | type | `0075ca` | Improvements or additions to documentation |
| `refactor` | type | `2f6dc8` | Code change that keeps behavior the same |
| `security` | type | `d93f0b` | Security weakness or hardening |
| `ready` | state | `0e8a16` | Verified unblocked, scope understood - safe to pick up |
| `blocked` | state | `b60205` | Named prerequisite missing; the issue or its document names it |
| `partial` | state | `fbca04` | Some phases shipped; the issue or its document names what remains |
| `needs-decision` | state | `5319e7` | Needs a product or architecture call before work starts |

GitHub's other defaults (`duplicate`, `good first issue`, `help wanted`, `invalid`, `question`,
`wontfix`) stay as GitHub creates them; the set does not own them. Colors and the first four
descriptions match the current labels in both repositories. The state descriptions drop "triage
comment" because investigate also applies them.

`references/issues.md` renders the same table and adds who applies each kind:

- One type label on every issue a vh-adlc operation files.
- At filing, investigate and spec apply the state label their own verdict names, per Q4.
- After filing, a state change is a triage verdict and follows `references/triage.md`.

A test fails when the reference table and the vocabulary file disagree.

### The labels helper

`plugins/vh-adlc/scripts/labels/cli.ts` mirrors the projects helper:

- `plan --repo <checkout>` reads the origin's labels through the GitHub CLI and writes a label plan
  that lists each standard label as `present`, `missing` or `different` (with the differing fields),
  plus every non-standard label as `unmanaged`. The plan names the repository, the actor and a
  SHA-256 digest of its exact bytes.
- `apply --repo <checkout> --plan <file> --approved-digest <sha>` recomputes the digest, rereads the
  repository's labels, and refuses if either changed. It then creates each missing label and edits
  each different one to the standard color and description, and writes a receipt. It never deletes
  or renames, and it never touches an `unmanaged` label.
- A `label_map` entry, if Q5 keeps it, makes the mapped repository label count as the standard one.

`references/authority.md` gains one row: applying a label plan needs the owner's approval of that
exact plan digest for that repository.

### Operations

- Investigate: when the owner asks for an issue, file it with one type label and the state label its
  verdict names (`track` to `ready`, `blocked` or `needs-decision`). Show the labels with the title
  and body before creating it. If a needed label is missing, file nothing and name `labels plan` as
  the fix.
- Spec: an issue created under acceptance or request gets the type label and no state label; the
  feature document is its state.
- Triage: the reference names the standard state labels and, through `label_map`, their repository
  names. A missing standard label still blocks its use under `references/triage.md:206-208`.

### vh-adlc's own settings

`.vh-adlc/triage.yaml` in this repository: `repository: michielvha/vh-adlc`, source roots `cmd`,
`internal`, `plugins`, `schema`, `tests`, plan root `docs/specs`, report directory
`docs/internal/triage`, and bot authors `renovate[bot]` and `dependabot[bot]`. It must pass
`vh-adlc settings read`.

### Order against shared-development-loop

Per Q6, tasks that edit `skills/vh-adlc-investigate/` wait until #78 merges, and this document reports
the label rule to that feature's owner as the home for its parity row. Everything else can land
first.

## Acceptance Criteria

- [ ] AC-01: The plugin contains one vocabulary file and a reference page that list the same standard
      labels with the same names, colors and descriptions, use the glossary terms above, and say which
      operation applies each kind.
- [ ] AC-02: For a repository with some standard labels missing, some with a different color or
      description and some non-standard labels, the helper's plan lists each standard label as
      present, missing or different, lists the others as unmanaged, and changes nothing on GitHub.
- [ ] AC-03: After approval of its exact digest, apply leaves the repository holding every standard
      label with the standard color and description, every other label unchanged, and no label
      deleted or renamed; with a changed plan file, a different digest or a repository that changed
      after planning, apply refuses before any write.
- [ ] AC-04: An issue investigate files carries one type label and the state label its verdict names,
      and the owner saw those labels before creation; when a needed label is missing, no issue exists
      and the result names the helper's plan.
- [ ] AC-05: An issue spec files under acceptance or request carries one type label and no state
      label.
- [ ] AC-06: Triage's reference names the standard state labels as the labels its verdicts use, and a
      state label applied outside the controller is still denied.
- [ ] AC-07: `label_map` behaves as Q5 decides and the triage settings reference describes that
      behavior; existing settings files that pass the reader today still pass.
- [ ] AC-08: This repository has a `.vh-adlc/triage.yaml` that `vh-adlc settings read` accepts and a
      triage run in report-only mode reads.
- [ ] AC-09: `michielvha/vh-adlc` and `michielvha/stackweaver` each hold every standard label with
      the standard color and description, and no issue in either lost a label.
- [ ] AC-10: The workflows user guide describes the standard label set and the helper, and the
      authority reference has the row for applying a label plan.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/labels/vocabulary.test.ts` parses the vocabulary file and the table in `references/issues.md` and fails on any difference or missing glossary term. |
| AC-02 | `tests/vh-adlc/labels/plan.test.ts` runs `plan` against a fake GitHub CLI fixture (pattern of `tests/vh-adlc/projects/fake-gh.ts`) and asserts the classification and an empty write log. |
| AC-03 | `tests/vh-adlc/labels/apply.test.ts`: approved apply on the fixture yields the standard set and an unchanged unmanaged set with no delete or rename calls; negative cases edit the plan, pass another digest and mutate the fake repository between plan and apply, each refusing with no write. |
| AC-04, AC-05 | Lifecycle scenario fixtures in `tests/vh-adlc/lifecycle/` grade an investigate run and a spec run that file issues against the fake tracker: labels on the created issue, labels in the pre-creation summary, and the missing-label case with no issue created. |
| AC-06 | Extend `tests/vh-adlc/triage/execution.test.ts`: a `labels` action with a standard state label outside the controller is denied; a reference test checks the state label list against the vocabulary file. |
| AC-07 | `tests/vh-adlc/triage/settings.test.ts` and `tests/vh-adlc/settings-file.test.ts` cover the decided `label_map` behavior and keep today's accepted files passing. |
| AC-08 | Run `vh-adlc settings read --stdin < .vh-adlc/triage.yaml` and a report-only `vh-adlc-triage sweep` with `--report-output` outside the checkout; record both outputs. |
| AC-09 | Owner-approved `apply` on each repository, then `gh label list` and a before/after `gh issue list --json number,labels` snapshot showing no label lost; record the receipts. |
| AC-10 | `tests/vh-adlc/labels/vocabulary.test.ts` checks that the user guide names the helper and that `references/authority.md` has the label-plan row. |

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q1: Where should the standard label set live?

**Recommendation:** A. In the vh-adlc plugin, because the helper and the operations read it and it
ships with the plugin version.

| Option | You get | It costs |
| --- | --- | --- |
| **A. vh-adlc plugin** | One versioned file the helper and operations read; adopters get it with the plugin | The vhco-pro/docs onboarding guide only links to it |
| **B. vhco-pro/docs convention** | The rule sits beside "Findings and issues" for every repository, plugin or not | The helper must fetch a pinned page to read machine data, and two repositories change together |

**Why this is yours:** it decides whether issue labels are a plugin behavior or a personal convention.

### Q2: How should repositories get the labels?

**Recommendation:** A. A packaged helper with plan and digest-approved apply, the same shape as the
projects helper.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Labels helper** | One command per repository, a reviewable plan, no deletes, repeatable drift checks | A new script and tests to maintain |
| **B. Triage `create-label` batches** | No new helper | Descriptions get the "unverified definition" prefix, and it needs a triage run per repository |
| **C. Documented `gh label create` commands** | Nothing to build | Drift returns silently; nothing checks it |

**Why this is yours:** it trades build effort against how well the set stays consistent.

### Q3: Which labels belong in the standard set?

**Recommendation:** A. The five type and four state labels in the Design table, leaving
`accessibility` and `release:preview` repository-local.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Nine labels** | The set Stackweaver already uses, with descriptions for `refactor` and `security` | `accessibility` stays only in vh-adlc, where no issue uses it |
| **B. Nine plus `accessibility`** | Accessibility barriers flagged the same way everywhere | A label most repositories will rarely use |
| **C. Nine plus `release:preview`** | The delivery convention's preview label everywhere | It only means something in repositories that use tag-driven preview releases |

**Why this is yours:** it sets the vocabulary every repository will carry.

### Q4: May investigate apply a state label when it files an issue?

**Recommendation:** A. Yes, from its own verdict, shown to you before creation, as Stackweaver does
today.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Type and state at filing** | New issues arrive already marked `ready`, `blocked` or `needs-decision`, keeping Stackweaver's habit | The state rests on investigate's document, not triage's controller proof |
| **B. Type label only** | Every state label passes through triage's controller | New issues stay without state until a triage run |

**Why this is yours:** it decides how much proof a state label needs when the issue is new.

### Q5: What should happen to the unused `label_map` setting?

**Recommendation:** A. Give it a meaning: it maps a standard label to a repository's own name for it.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Map standard names to local ones** | Existing files keep passing; a repository can keep a legacy name on purpose | A way to differ from "the same labels everywhere" |
| **B. Remove it** | One less setting; every repository uses the standard names | Stackweaver's settings file and two tests fail until the key is deleted |
| **C. Leave it unused** | No change | A documented setting that does nothing |

**Why this is yours:** it trades compatibility against strict uniformity.

### Q6: How should this feature fit around shared-development-loop (#78)?

**Recommendation:** A. A separate feature; its investigate tasks land after #78 merges, and #78's owner
points its parity row here.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Separate, sequenced** | #78 keeps its accepted scope; the helper and triage parts land first | Investigate labeling waits for #78 |
| **B. Fold into #78** | One change ports investigate with labels included | #78 goes back to draft and needs a new review and acceptance |

**Why this is yours:** it affects another in-progress feature's scope and schedule.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
