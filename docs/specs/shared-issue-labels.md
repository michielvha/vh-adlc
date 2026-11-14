---
status: in-progress
status_description: "Every task done and every criterion has evidence on feat/shared-issue-labels; waits for an independent implementation review."
issue: https://github.com/michielvha/vh-adlc/issues/83
branch: feat/shared-issue-labels
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
  - tests/vh-adlc/lifecycle/
  - tests/vh-adlc/triage/execution.test.ts
  - tests/vh-adlc/triage/settings.test.ts
  - tests/vh-adlc/triage/stackweaver-triage.yaml
  - tests/vh-adlc/settings-file.test.ts
  - tests/vh-adlc/direct-operation-compatibility.test.ts
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
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
rule. When shared-development-loop (vh-adlc #78) moved Stackweaver onto the shared operations, it kept
the habit as a temporary local rule in Stackweaver's `agents/loop-project.md`. This feature replaces
that local rule with a shared one every adopter gets.

This feature adds a standard label set to the plugin: type labels (`bug`, `enhancement`,
`documentation`, `refactor`, `security`) and the four state labels, each with a fixed color and
description. A new helper compares a repository's labels with the set and shows a plan. Once you
approve its exact digest, it creates the missing labels and corrects colors and descriptions. It
never deletes or renames a label and never touches labels the standard does not own, such as the
ones Dependabot and Renovate create. The one exception is a label you name as a mapping target in
`label_map`: mapping a standard label onto it makes it managed, so the plan shows and apply makes the
standard color and description on it. Investigate gives every issue it files one type label and the
state label its verdict names. Spec gives the issues it files a type label only, because the feature
document carries their state. Triage keeps its existing rule: a state label it applies is
a verdict and needs proof from the confined controller.

vh-adlc gets its own `.vh-adlc/triage.yaml`, and the helper is run on vh-adlc and Stackweaver as the
first two repositories. Other adopters follow later, on your request per repository.

You settled six questions on 2026-11-13, each at its recommendation. The set lives in the plugin.
Repositories get it through the helper. It holds the nine labels above. Investigate may set a state
label at filing. `label_map` maps a standard name to a repository's own name, so existing settings
keep working. The feature stays separate from #78. Because #78 covers the investigate and spec skills,
the authority reference and every vh-adlc test, this feature changes nothing but its own document
until #78 merges; implementation starts after that. A handoff asks the #78 session to record
Stackweaver's investigate labeling as moving here instead of superseded.

The first independent review (R-1) found three blocking and five should-fix issues. The four factual
ones are fixed. You settled the other four at their recommendations. Apply refuses unless the host,
repository, account, effective label names and exact payloads all still match what you approved. The
settings reader refuses a `label_map` in which two standard labels would share one GitHub label.
Triage's neutral request issues stay unlabeled. Investigate's act now gives `ready`; track gives
`blocked` when a prerequisite is named and `needs-decision` otherwise; a rejected case filed on
request gets a type label only.

R-2 found one blocking and two should-fix issues. The spec now says plainly that a `label_map` target
you name becomes managed even if a bot created it, it names the plugin package and a candidate install
check, and, at your choice, spec also files with mapped names.

R-3 was clean and you accepted it on 2026-11-13. #78 then merged, changing paths this document
covers, so R-3 went stale from drift alone; the acceptance stands because the normative sections did
not change. The drift review R-4 found three should-fix items in Context and Tasks, all applied.
Implementation then started on `feat/shared-issue-labels`.

This revision changes two things since your R-3 acceptance. During T12, a test outside `covers`
turned out to guard the investigate and spec skill bodies, so `covers` now lists it and the Design
says each skill keeps its label rule in its own `## Issue labels` section, which that test checks.
The Design also now names the helper's `file` step, which both skills use to preview the labels
and then create the issue. Review R-6 then asked for the fixture copy of Stackweaver's settings in
`covers`, and at your choice a CLI-level test of the `file` step (new task T22). Scope and criteria are unchanged. As the standard requires, the criterion
ticks were reset; the finished tasks T1 to T11 stay checked.

Implementation so far is local on the feature branch: the label set, the `label_map` rule and the
helper's `plan` and `apply` exist with passing tests against a fake GitHub. Running the helper's apply
against any real repository still needs your approval of that exact plan.

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
  explicit authority and says nothing about labels (`skills/vh-adlc-spec/SKILL.md:60` at `2c9d3af`). Creating a
  tracking issue needs acceptance or a request (`references/authority.md:25`).
- shared-development-loop (`docs/specs/shared-development-loop.md`) was `in-progress` on
  `feat/shared-development-loop` when this document was accepted, and merged to `main` as `2c9d3af`
  (vh-adlc #87) on 2026-11-13. It covers `plugins/vh-adlc/skills/vh-adlc-investigate/` and plans a
  Stackweaver parity map with one row per legacy rule of `agents/investigate.md` (its task T25). Its
  `covers`
  also lists `plugins/vh-adlc/skills/vh-adlc-spec/`, `plugins/vh-adlc/references/authority.md` and
  all of `tests/vh-adlc/` (`docs/specs/shared-development-loop.md:8-42` on
  `feat/shared-development-loop` at `645882b`). Since that merge, vh-adlc's investigate ends with one
  of the verdicts act now, track or reject, and keeps issue creation under `references/authority.md`
  (`plugins/vh-adlc/skills/vh-adlc-investigate/SKILL.md` at `2c9d3af`, Loop routes section).
- Stackweaver's parity map, merged as Stackweaver `4e4fcd4d`, keeps routine issue filing superseded
  in row `investigate-files-issue` and gives the labeling a separate row, `investigate-labels-issue`.
  That row's local home is `agents/loop-project.md:62`: an issue investigate files on request gets one
  type label and the state its verdict names, until this feature takes the rule over. The split is
  recorded in `docs/specs/shared-development-loop.md:757-758` at `da736bc`.
- The projects helper already follows an inventory, digest and approved-apply pattern
  (`plugins/vh-adlc/references/projects.md:105-111`, `plugins/vh-adlc/scripts/projects/apply.ts`).
- Seventeen distinct repositories under the `michielvha`, `vhco-pro` and `LowGok` owners have a local
  checkout that pins the vhco-pro/docs conventions or carries `.vh-adlc/` settings (a scan of
  `/home/m/code/*/AGENTS.md` and `.vh-adlc/`, 2026-11-13).

## Scope

In scope:

- The standard label set as one machine-readable file in the plugin, and a reference page,
  `references/issues.md`, that lists each label and says which operation applies it.
- A packaged labels helper with `plan` and `apply`: plan compares a repository with the set, apply
  makes only the approved changes.
- Labeling rules in investigate and spec for the issues they already have authority to file.
  Triage's neutral `create-request` issues stay unlabeled (owner, Q9).
- Triage's reference naming the standard state labels as the ones its verdicts use, with the
  controller rule unchanged.
- A defined meaning for the unused `label_map` setting: a standard label mapped to a repository's own
  name, with colliding maps refused by the settings reader.
- vh-adlc's own `.vh-adlc/triage.yaml`.
- Applying the set to `michielvha/vh-adlc` and `michielvha/stackweaver`.
- The workflows user guide and an authority row for the helper.

Out of scope:

- Removing or renaming any existing label, or removing a label from an issue.
- Labels owned by bots (Dependabot's `dependencies`, `go`, `javascript`, `python:uv`; Renovate's
  `major-upgrade`). They stay as their tools create them unless the owner names one as a `label_map`
  target, which makes it managed (owner, Q8).
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

One file, `plugins/vh-adlc/scripts/labels/vocabulary.json`, holds the set. It lives in the plugin so
the helper and the operations read the same versioned data (owner, Q1). It holds these nine labels
(owner, Q3); `accessibility` and `release:preview` stay repository-local:

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
`wontfix`) stay as GitHub creates them; the set does not own them. `bug`, `enhancement` and
`documentation` match GitHub's defaults, which both repositories carry today. The four state colors
match Stackweaver's labels. `refactor` keeps Stackweaver's color and gains a description, where
Stackweaver's is empty. `security` gains a color and a description, where Stackweaver has `ededed`
and none. vh-adlc has neither label yet. The state descriptions drop "triage comment" because
investigate also applies them.

`references/issues.md` renders the same table and adds who applies each kind:

- One type label on every issue investigate or spec files. Triage's neutral `create-request` issues
  stay unlabeled, so its request boundary is unchanged; a later triage pass can label them under its
  controller rule (owner, Q9).
- At filing, investigate applies the state label its own verdict names (owner, Q4). Spec applies
  none; the feature document carries the state.
- After filing, a state change is a triage verdict and follows `references/triage.md`.

A test fails when the reference table and the vocabulary file disagree.

### The labels helper

`plugins/vh-adlc/scripts/labels/cli.ts` mirrors the projects helper (owner, Q2):

- `plan --repo <checkout>` reads the origin's labels through the GitHub CLI and writes a label plan
  that lists each standard label as `present`, `missing` or `different` (with the differing fields),
  plus every non-standard label as `unmanaged`. The plan records the host, the repository, the
  authenticated actor, a hash of the vocabulary file, the effective label names after `label_map`,
  the repository labels it read, and each write as an exact before and after payload. A SHA-256
  digest covers its exact bytes.
- `apply --repo <checkout> --plan <file> --approved-digest <sha>` recomputes the digest. It then
  derives the host and repository from the checkout's origin, reads the authenticated actor, rehashes
  the vocabulary, recomputes the effective names from the current settings and rereads the
  repository's labels. Any difference from the plan refuses before a write (owner, Q7). Otherwise it
  makes exactly the planned writes: it creates each missing label and edits each different one to the
  standard color and description, and writes a receipt. It never deletes or renames, and it never
  touches an `unmanaged` label.
- A `label_map` entry maps a standard name to the repository's own label (owner, Q5). The plan
  checks the mapped label against the standard color and description and counts it as present;
  operations apply the mapped name. A repository without the key uses the standard names. An entry
  whose key is not a standard name has no effect, so Stackweaver's `major-upgrade: major-upgrade`
  stays valid.
- The triage settings reader refuses a map in which two standard labels end up with the same
  effective name, compared case-insensitively, counting unmapped standard labels under their own
  names. `ready: blocked` and `bug: Enhancement` both fail with a fixed reason. Any other target is
  the owner's explicit choice (owner, Q8), including a label a bot created: mapping `bug` onto
  `dependencies` makes `dependencies` the managed `bug` label, and its plan entry shows the color and
  description change before approval.

`references/authority.md` gains one row: applying a label plan needs the owner's approval of that
exact plan digest for that repository.

### Operations

- Investigate: when the owner asks for an issue, file it with one type label and the state label its
  verdict names (owner, Q10):

  | Verdict | State label |
  | --- | --- |
  | act now | `ready` |
  | track, with a missing prerequisite named in the findings document | `blocked` |
  | track, waiting on an owner, product or architecture call | `needs-decision` |
  | reject, filed only because the owner asked | none |

  Show the labels with the title and body before creating it. If a needed label is missing, file
  nothing and name `labels plan` as the fix.
- Spec: an issue created under acceptance or request gets the type label and no state label; the
  feature document is its state.
- Triage: the reference names the standard state labels and, through `label_map`, their repository
  names. A missing standard label still blocks its use under `references/triage.md:206-208`.

Both operations file through one deterministic step of the labels helper, so the same rules hold on
every host. `cli.ts file` takes the operation, the type label, the verdict (investigate only), the
title and the body. It resolves the labels through the verdict table and `label_map`, reads the
repository's labels and the authenticated account, and writes a preview with a digest without
filing anything. With `--preview` and the owner-approved digest, it repeats the observation and
creates the issue only when the preview is unchanged and no label is missing; GitHub never gets the
chance to create a label implicitly.

Each skill states this rule in its own `## Issue labels` section. The rest of each skill body stays
byte-identical: `tests/vh-adlc/direct-operation-compatibility.test.ts` strips that section, checks
its required phrases and compares the remainder with the approved baseline, as it already does for
`## Loop routes`.

### vh-adlc's own settings

`.vh-adlc/triage.yaml` in this repository: `repository: michielvha/vh-adlc`, source roots `cmd`,
`internal`, `plugins`, `schema`, `tests`, plan root `docs/specs`, report directory
`docs/internal/triage`, and bot authors `renovate[bot]` and `dependabot[bot]`. It must pass
`vh-adlc settings read`.

### Delivery

The affected artifact is the marketplace Git source package under `plugins/vh-adlc/`, selected by
`.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json` and declared by
`plugins/vh-adlc/plugin.json` and `plugins/vh-adlc/.claude-plugin/plugin.json`. The new
`scripts/labels/` helper, its vocabulary file and `references/issues.md` ship inside that package,
and both manifests take a minor version bump. The binary and its release workflows are unchanged.
Before merge, a candidate install of the branch's package into an isolated, credential-free profile
must contain the helper and vocabulary and run the installed `plan` against the fake GitHub fixture.
After merge, the feature is delivered once the published Git tree matches the reviewed source. That
publication check, and any tag or release, keeps its own separate authorization.

### Order against shared-development-loop

This stays a separate feature (owner, Q6). shared-development-loop's `covers` overlaps this one on
`plugins/vh-adlc/skills/vh-adlc-investigate/`, `plugins/vh-adlc/skills/vh-adlc-spec/`,
`plugins/vh-adlc/references/authority.md`, `tests/vh-adlc/` and both plugin manifests. Two features writing those paths at
once would make each other's reviews stale. So:

- Until #78 merges, this feature changes only `docs/specs/shared-issue-labels.md`, which #78 does not
  cover. Spec work and reviews continue on the default branch.
- The claim commit and every task wait until #78 has merged to the default branch.
- A handoff to the #78 session reports that the labeling half of its `investigate-files-issue` parity
  row belongs to this feature. Whether and how that row changes is that session's decision; this
  feature does not edit Stackweaver's parity map or #78's document.

## Acceptance Criteria

- [x] AC-01: The plugin contains one vocabulary file and a reference page that list the same standard
      labels with the same names, colors and descriptions, use the glossary terms above, and say which
      operation applies each kind.
      Evidence: `bun test tests/vh-adlc/labels tests/vh-adlc/lifecycle/issue-labels.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/triage/settings.test.ts tests/vh-adlc/settings-file.test.ts tests/vh-adlc/triage/execution.test.ts` at 3dbbce1: 158 pass, 0 fail. `vocabulary.test.ts` shows the vocabulary file and the `references/issues.md` table are identical, with the glossary terms and the rule for who applies each kind.
- [x] AC-02: For a repository with some standard labels missing, some with a different color or
      description and some non-standard labels, the helper's plan lists each standard label as
      present, missing or different, lists the others as unmanaged, and changes nothing on GitHub.
      Evidence: `bun test tests/vh-adlc/labels tests/vh-adlc/lifecycle/issue-labels.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/triage/settings.test.ts tests/vh-adlc/settings-file.test.ts tests/vh-adlc/triage/execution.test.ts` at 3dbbce1: 158 pass, 0 fail. `plan.test.ts` classifies present, missing, different and unmanaged labels with an empty write log. Fake GitHub only.
- [x] AC-03: After approval of its exact digest, apply leaves the repository holding every standard
      label with the standard color and description, every other label unchanged, and no label
      deleted or renamed. Apply refuses before any write when the plan file changed, the digest
      differs, or the host, repository, authenticated actor, vocabulary, effective label names or
      repository labels differ from the plan.
      Evidence: `bun test tests/vh-adlc/labels tests/vh-adlc/lifecycle/issue-labels.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/triage/settings.test.ts tests/vh-adlc/settings-file.test.ts tests/vh-adlc/triage/execution.test.ts` at 3dbbce1: 158 pass, 0 fail. `apply.test.ts` shows approved apply yields the standard set with no delete or rename, and all eight refusal cases throw before any write. Fake GitHub only.
- [x] AC-04: An issue investigate files carries one type label and the state label the verdict table
      gives (`ready` for act now, `blocked` or `needs-decision` for track, none for a requested reject),
      and the owner saw those labels before creation; when a needed label is missing, no issue exists
      and the result names the helper's plan.
      Evidence: `bun test tests/vh-adlc/labels tests/vh-adlc/lifecycle/issue-labels.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/triage/settings.test.ts tests/vh-adlc/settings-file.test.ts tests/vh-adlc/triage/execution.test.ts` at 3dbbce1: 158 pass, 0 fail. `issue-labels.test.ts` files act now, both track cases and a requested reject with exactly the verdict table's labels; `file.test.ts` drives the real CLI preview then approved creation; the missing-label case creates nothing and names the plan; `direct-operation-compatibility.test.ts` requires the investigate Issue labels section. Limitation: the filing step is exercised directly, not through a live agent run of investigate.
- [x] AC-05: An issue spec files under acceptance or request carries one type label and no state
      label.
      Evidence: `bun test tests/vh-adlc/labels tests/vh-adlc/lifecycle/issue-labels.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/triage/settings.test.ts tests/vh-adlc/settings-file.test.ts tests/vh-adlc/triage/execution.test.ts` at 3dbbce1: 158 pass, 0 fail. `issue-labels.test.ts` shows spec filing gets one type label and refuses a verdict; `direct-operation-compatibility.test.ts` requires the spec Issue labels section. Limitation: no live agent run of spec.
- [x] AC-06: Triage's reference names the standard state labels as the labels its verdicts use, a
      state label applied outside the controller is still denied, and a triage `create-request` issue
      is created with no labels.
      Evidence: `bun test tests/vh-adlc/labels tests/vh-adlc/lifecycle/issue-labels.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/triage/settings.test.ts tests/vh-adlc/settings-file.test.ts tests/vh-adlc/triage/execution.test.ts` at 3dbbce1: 158 pass, 0 fail. each standard state label is denied outside the controller, a create-request reaches a fake gh with `labels: []`, and `references/triage.md` names the four state labels.
- [x] AC-07: A `label_map` entry makes the plan, triage, investigate and spec treat the mapped
      repository label as the standard one, a mapping onto a label outside the standard set appears in
      the plan as a managed label with its color and description change, and an entry keyed by a non-standard name changes nothing. A map in
      which two standard labels share an effective name, case-insensitively, is refused when read.
      Stackweaver's current settings file still reads, and the triage settings reference describes
      these rules.
      Evidence: `bun test tests/vh-adlc/labels tests/vh-adlc/lifecycle/issue-labels.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/triage/settings.test.ts tests/vh-adlc/settings-file.test.ts tests/vh-adlc/triage/execution.test.ts` at 3dbbce1: 158 pass, 0 fail. mapped names are used by plan, investigate and spec filing (spec scenario with only `defect`); a mapping onto `dependencies` shows as a managed change; non-standard keys change nothing; `ready: blocked` and `bug: Enhancement` are refused; the Stackweaver settings copy reads; `references/triage-settings.md` states these rules. Triage applies labels through its existing actions, which use the names the batch shows.
- [x] AC-08: This repository has a `.vh-adlc/triage.yaml` that `vh-adlc settings read` accepts and a
      triage run in report-only mode reads.
      Evidence: on feat/shared-issue-labels at T15, `vh-adlc settings read --stdin` answered for `.vh-adlc/triage.yaml`; the triage CLI loaded it as configured settings, collected michielvha/vh-adlc read-only (10 issues, all collections complete) and saved a report to `/tmp/sil-t15/report.md` outside the checkout. This was the collect and report steps run directly, not an agent-driven sweep.
- [x] AC-09: `michielvha/vh-adlc` and `michielvha/stackweaver` each hold every standard label with
      the standard color and description, and no issue in either lost a label.
      Evidence: owner-approved applies on 2026-11-14 (helper at 3dbbce1): michielvha/vh-adlc created six labels, michielvha/stackweaver updated five; `gh label list` on each then shows all nine standard labels with the standard color and description; complete paginated snapshots (90 and 1082 issues and PRs) show no item lost a label and none changed during the window. Records: `tests/vh-adlc/labels/evidence/rollout-vh-adlc.md` and `rollout-stackweaver.md`.
- [x] AC-10: The workflows user guide describes the standard label set and the helper, and the
      authority reference has the row for applying a label plan.
      Evidence: `bun test tests/vh-adlc/labels tests/vh-adlc/lifecycle/issue-labels.test.ts tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/triage/settings.test.ts tests/vh-adlc/settings-file.test.ts tests/vh-adlc/triage/execution.test.ts` at 3dbbce1: 158 pass, 0 fail. `vocabulary.test.ts` shows the workflows guide describes the set and helper and `references/authority.md` has the label-plan row.
- [x] AC-11: A plugin installed from the branch's marketplace package, in an isolated profile,
      contains the labels helper and vocabulary file, both manifests carry the bumped version, and the
      installed `plan` produces the same label plan as the source helper for the same fixture.
      Evidence: `tests/vh-adlc/labels/evidence/candidate-install.md`, source 661f5d0: Claude Code 2.1.325 installed vh-adlc@labels-candidate from a local catalog into a fresh credential-free profile; the cache holds `scripts/labels/` and `vocabulary.json`, both manifests read 0.19.0, and installed and source `plan` outputs are byte-identical on the same fake GitHub. Local catalog only; no published marketplace checked.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | `tests/vh-adlc/labels/vocabulary.test.ts` parses the vocabulary file and the table in `references/issues.md` and fails on any difference or missing glossary term. |
| AC-02 | `tests/vh-adlc/labels/plan.test.ts` runs `plan` against a fake GitHub CLI fixture (pattern of `tests/vh-adlc/projects/fake-gh.ts`) and asserts the classification and an empty write log. |
| AC-03 | `tests/vh-adlc/labels/apply.test.ts`: approved apply on the fixture yields the standard set and an unchanged unmanaged set with no delete or rename calls. Negative cases each refuse with an empty write log: an edited plan, another digest, another origin repository, another host, another authenticated actor, an edited vocabulary file, an edited `label_map`, and a fake repository label changed between plan and apply. |
| AC-04, AC-05 | `tests/vh-adlc/direct-operation-compatibility.test.ts` requires each skill's `## Issue labels` section to name `scripts/labels/cli.ts file`, `references/issues.md` and the preview before creation, with the rest of the body unchanged. `tests/vh-adlc/labels/file.test.ts` runs the actual `cli.ts file` against the fake tracker: a preview writes nothing, an approved preview creates exactly one issue with its labels, and an edited preview, a wrong digest, or a changed account, repository or label between preview and creation each refuse with no issue created and an empty write log. Lifecycle scenario fixtures in `tests/vh-adlc/lifecycle/` grade investigate runs for act now, track with a named prerequisite, track waiting on a decision and a requested reject, plus a spec run, each filing against the fake tracker. Each passes only when the created issue carries exactly the expected labels and the pre-creation summary showed them; a missing-label case passes only with no issue created and the helper's plan named. |
| AC-06 | Extend `tests/vh-adlc/triage/execution.test.ts`: a `labels` action with a standard state label outside the controller is denied, and an approved `create-request` reaches the fake tracker with an empty labels array; a reference test checks the state label list against the vocabulary file. |
| AC-07 | `tests/vh-adlc/triage/settings.test.ts` and `tests/vh-adlc/settings-file.test.ts`: a mapped label is used by plan and by the triage, investigate and spec label payloads, with a spec filing scenario in `tests/vh-adlc/lifecycle/` where only the mapped type label exists checking both the preview and the created issue; a mapping onto a non-standard label shows as a managed metadata change in the plan; a non-standard key changes nothing; `ready: blocked` and `bug: Enhancement` are refused with the fixed reason; a copy of Stackweaver's `.vh-adlc/triage.yaml` reads. |
| AC-08 | Run `vh-adlc settings read --stdin < .vh-adlc/triage.yaml` and a report-only `vh-adlc-triage sweep` with `--report-output` outside the checkout; record both outputs. |
| AC-09 | Owner-approved `apply` on each repository, then `gh label list`. Before and after apply, take a complete snapshot of every open and closed issue and pull request with `gh api --paginate "repos/<owner>/<repo>/issues?state=all&per_page=100"`, keeping number and label names. Compare label sets by number: no number may lose a label. Report any page that failed and any issue updated during the window as incomplete instead of passing. Record the receipts and both snapshots. |
| AC-10 | `tests/vh-adlc/labels/vocabulary.test.ts` checks that the user guide names the helper and that `references/authority.md` has the label-plan row. |
| AC-11 | Written procedure: install the branch's package through the local marketplace catalog into a fresh, credential-free Claude Code profile, list the installed files, compare both manifest versions, and run the installed `plan` and the source `plan` against the same fake GitHub fixture; pass when the files exist, the versions match the bump and the two plans are byte-identical. Record the commands and output; no published marketplace is claimed. |

## Tasks

Implementation starts only after #78 has merged to the default branch (Design, Order against
shared-development-loop).

- [x] T1 `tests/vh-adlc/labels/vocabulary.test.ts` - failing test that parses `scripts/labels/vocabulary.json` and the table in `references/issues.md`, requires the same nine names, colors and descriptions, every glossary term and the rule for who applies each kind; fails because neither file exists (AC-01)
      Evidence: `bun test tests/vh-adlc/labels/vocabulary.test.ts` at this commit: 0 pass, 4 fail, each with ENOENT for `scripts/labels/vocabulary.json` or `references/issues.md`, the stated reason.
- [x] T2 `plugins/vh-adlc/scripts/labels/vocabulary.json`, `plugins/vh-adlc/references/issues.md` - the standard label set and its reference page, with the glossary, the investigate verdict table and the triage boundary; T1 passes (AC-01)
      Evidence: `bun test tests/vh-adlc/labels/vocabulary.test.ts`: 4 pass, 0 fail. `bun test tests/vh-adlc/check.test.ts`: 63 pass, 1 fail, "a package change comes with a version change", expected until T16 bumps the manifests.
- [x] T3 `tests/vh-adlc/triage/settings.test.ts`, `tests/vh-adlc/settings-file.test.ts` - failing cases: `ready: blocked` and `bug: Enhancement` refused with a fixed reason, a non-standard key ignored, effective names resolved through `label_map`, and a copy of Stackweaver's `.vh-adlc/triage.yaml` still reading (AC-07)
      Evidence: `bun test tests/vh-adlc/triage/settings.test.ts`: fails to load with "Export named effectiveLabels not found" (no resolver, no collision refusal yet). `bun test tests/vh-adlc/settings-file.test.ts`: 22 pass, including the new Stackweaver label_map guard. The Stackweaver copy is `tests/vh-adlc/triage/stackweaver-triage.yaml` from Stackweaver `1e0b55b2`.
- [x] T4 `plugins/vh-adlc/scripts/triage/settings.ts`, `plugins/vh-adlc/scripts/triage/types.ts`, `plugins/vh-adlc/references/triage-settings.md` - collision refusal and one shared effective-name resolver, documented; T3 passes (AC-07)
      Evidence: `bun test tests/vh-adlc/triage tests/vh-adlc/settings-file.test.ts tests/vh-adlc/settings-references.test.ts tests/vh-adlc/labels --timeout 60000`: 257 pass, 0 fail across 26 files, including the three T3 label_map tests.
- [x] T5 `tests/vh-adlc/labels/fake-gh.ts`, `tests/vh-adlc/labels/plan.test.ts` - failing `plan` cases on a fake GitHub CLI: present, missing, different and unmanaged labels, a mapped label counted as present, a mapping onto a non-standard label shown as a managed metadata change, recorded bindings, and an empty write log (AC-02, AC-07)
      Evidence: `bun test tests/vh-adlc/labels/plan.test.ts`: 0 pass, 1 fail, "Cannot find module ../../../plugins/vh-adlc/scripts/labels/plan" (no plan yet). Shared fixture wiring sits in `tests/vh-adlc/labels/fixtures.ts` for reuse by T7.
- [x] T6 `plugins/vh-adlc/scripts/labels/github.ts`, `plugins/vh-adlc/scripts/labels/plan.ts`, `plugins/vh-adlc/scripts/labels/cli.ts` - `plan` with host, repository, actor, vocabulary hash, effective names, read labels, exact payloads and digest; T5 passes (AC-02, AC-07)
      Evidence: `bun test tests/vh-adlc/labels/plan.test.ts`: 4 pass, 0 fail. `bun test tests/vh-adlc/labels/typecheck.test.ts`: strict tsc passes. Manual CLI run against the fake gh printed digest 2ee819c8... equal to `sha256sum` of the written plan, and a second run refused the existing output. Also adds `tsconfig.json`, `typecheck.sh` and `tests/vh-adlc/labels/typecheck.test.ts`, mirroring the projects helper.
- [x] T7 `tests/vh-adlc/labels/apply.test.ts` - failing approved apply that yields the standard set with no delete or rename call, and the eight refusal cases (edited plan, other digest, other repository, other host, other actor, edited vocabulary, edited `label_map`, changed repository label), each with an empty write log (AC-03)
      Evidence: `bun test tests/vh-adlc/labels/apply.test.ts`: 0 pass, 1 fail, "Cannot find module ../../../plugins/vh-adlc/scripts/labels/apply" (no apply yet). The file holds the approved apply, a CLI plan-then-apply case and the eight refusal cases.
- [x] T8 `plugins/vh-adlc/scripts/labels/apply.ts`, `plugins/vh-adlc/scripts/labels/cli.ts` - `apply` that revalidates every binding before writing, makes exactly the planned writes and writes a receipt; T7 passes (AC-03)
      Evidence: `bun test tests/vh-adlc/labels`: 19 pass, 0 fail, including the approved apply, the CLI plan-then-apply run and all eight refusal cases with empty write logs. `references/issues.md` documents both commands.
- [x] T9 `tests/vh-adlc/triage/execution.test.ts`, `tests/vh-adlc/labels/vocabulary.test.ts` - a standard state label in a `labels` action outside the controller is denied, an approved `create-request` reaches the fake tracker with an empty labels array, and a failing check that `references/triage.md` names the vocabulary's state labels (AC-06)
      Evidence: `bun test tests/vh-adlc/triage/execution.test.ts -t ...`: both new tests pass at once, since they guard existing behavior (each standard state label is denied outside the controller; the real GitHub adapter posts create-request with `labels: []`). `bun test tests/vh-adlc/labels/vocabulary.test.ts`: 4 pass, 1 fail, "triage reference names the vocabulary state labels", the stated failing check.
- [x] T10 `plugins/vh-adlc/references/triage.md` - names the standard state labels and their mapped repository names as the labels triage verdicts use, controller rule unchanged; T9 passes (AC-06)
      Evidence: `bun test tests/vh-adlc/labels/vocabulary.test.ts`: 5 pass, 0 fail; the triage reference names the four state labels, `references/issues.md` and `label_map`.
- [x] T11 `tests/vh-adlc/lifecycle/issue-labels.test.ts`, `tests/vh-adlc/lifecycle/feature-fixture.ts` - failing scenarios: investigate files for act now, track with a named prerequisite, track waiting on a decision and a requested reject; spec files a tracking issue; spec files where only the mapped type label exists; a missing-label case; each checks the pre-creation summary and the created issue's exact labels (AC-04, AC-05, AC-07)
      Evidence: `bun test tests/vh-adlc/lifecycle/issue-labels.test.ts`: 0 pass, 1 fail, "Cannot find module ../../../plugins/vh-adlc/scripts/labels/issue" (no filing helper yet). The scenarios drive the deterministic filing step the skills will call, against the labels fake tracker, which now records created issues (`tests/vh-adlc/labels/fake-gh.ts`, `fixtures.ts`); `feature-fixture.ts` needed no change. No live agent run is involved.
- [x] T22 `tests/vh-adlc/labels/file.test.ts` - failing tests that run the actual `cli.ts file`: preview-only with an empty write log, approved creation of exactly one labeled issue, and refusals with no issue created for an edited preview, a wrong digest, another account, another repository and a label changed after the preview; fails because the file step does not exist (AC-04, AC-05)
      Evidence: `bun test tests/vh-adlc/labels/file.test.ts`: all 7 fail with "Unknown option --operation" from the committed CLI, which has no file step yet.
- [x] T12 `plugins/vh-adlc/scripts/labels/issue.ts`, `plugins/vh-adlc/scripts/labels/github.ts`, `plugins/vh-adlc/scripts/labels/cli.ts` - the `file` step: preview with digest, then creation only when unchanged and no label is missing; T11 and T22 pass (AC-04, AC-05, AC-07)
      Evidence: `bun test tests/vh-adlc/labels tests/vh-adlc/lifecycle/issue-labels.test.ts`: 36 pass, 0 fail, including all 7 T22 CLI cases and the 9 T11 scenarios. The T11 preview assertion now parses the preview JSON instead of matching a compact array string, which a pretty-printed preview never contains; that was a defect in the test, seen when it first ran against this code.
- [x] T20 `tests/vh-adlc/direct-operation-compatibility.test.ts` - failing check that investigate and spec each have an `## Issue labels` section naming `scripts/labels/cli.ts file`, `references/issues.md` and the preview, with the rest of the body unchanged (AC-04, AC-05)
      Evidence: `bun test tests/vh-adlc/direct-operation-compatibility.test.ts`: 5 pass, 2 fail, "direct investigate/spec keeps its approved operation body", because neither skill has an Issue labels section yet; the other five operations pass and must not gain one.
- [x] T21 `plugins/vh-adlc/skills/vh-adlc-investigate/SKILL.md`, `plugins/vh-adlc/skills/vh-adlc-spec/SKILL.md` - the `## Issue labels` sections; T20 and T11 pass (AC-04, AC-05, AC-07)
      Evidence: `bun test tests/vh-adlc/direct-operation-compatibility.test.ts tests/vh-adlc/lifecycle/issue-labels.test.ts`: 16 pass. All suites that read skill files (direct-operation, delivery-lifecycle, fixtures, audit, maintenance and triage discovery, loop model-free and glossary, check): 109 pass, 1 fail, the version-change check T16 resolves.
- [x] T13 `tests/vh-adlc/labels/vocabulary.test.ts` - failing checks that `docs/user-guides/workflows.md` describes the label set and helper and that `references/authority.md` has the label-plan row (AC-10)
      Evidence: `bun test tests/vh-adlc/labels/vocabulary.test.ts`: 5 pass, 2 fail; the guide lacks the label set and helper and the authority reference has no label-plan row.
- [x] T14 `docs/user-guides/workflows.md`, `plugins/vh-adlc/references/authority.md` - the guide section and the authority row; T13 passes (AC-10)
      Evidence: `bun test tests/vh-adlc/labels/vocabulary.test.ts`: 7 pass. Suites that read `authority.md` or the guide (audit discovery, intake and setup-docs, maintenance and triage discovery, triage migration, loop): all pass.
- [x] T15 `.vh-adlc/triage.yaml` - vh-adlc's own triage settings; `vh-adlc settings read --stdin` accepts it and a report-only triage sweep with `--report-output` outside the checkout reads it, both outputs recorded (AC-08)
      Evidence: `vh-adlc settings read --stdin < .vh-adlc/triage.yaml`: answered with the declared values. `bun plugins/vh-adlc/scripts/triage/cli.ts settings --repo .`: configured true from `.vh-adlc/triage.yaml`. A read-only `collect --mode sweep` against michielvha/vh-adlc collected 10 issues and 11 labels with every collection complete, and `report --report-output /tmp/sil-t15/report.md` saved outside the checkout; `git status` showed only the new settings file.
- [x] T16 `plugins/vh-adlc/plugin.json`, `plugins/vh-adlc/.claude-plugin/plugin.json` - minor version bump from the current merged version (0.18.0 at `da736bc`, so 0.19.0 unless main moves again); `bun test tests/vh-adlc --timeout 60000`, `go test ./...`, `go vet ./...`, `golangci-lint run` and `go mod tidy -diff` pass (AC-11)
      Evidence: Manifests 0.18.1 to 0.19.0. `bun test tests/vh-adlc --timeout 60000`: 1615 pass, 0 fail across 136 files. `go test ./...` ok; `go vet ./...` exit 0; golangci-lint v2.15.0 (installed to a temporary GOBIN) `config verify` exit 0 and `run` 0 issues; `go mod tidy -diff` exit 0.
- [x] T17 `tests/vh-adlc/labels/evidence/candidate-install.md` - the AC-11 procedure run on the branch head: installed files listed, both manifest versions compared, installed and source `plan` outputs byte-identical (AC-11)
      Evidence: Procedure run on 661f5d0 and recorded in `tests/vh-adlc/labels/evidence/candidate-install.md`: isolated credential-free install of vh-adlc@labels-candidate succeeded; the installed cache holds the labels helper, vocabulary and reference; both manifests read 0.19.0; installed and source `plan` outputs are byte-identical (SHA-256 fb2418a7...) with only GET calls.
- [x] T18 `tests/vh-adlc/labels/evidence/rollout-vh-adlc.md` - owner-approved `plan` and `apply` on `michielvha/vh-adlc` with complete before and after issue snapshots, receipt and `gh label list` recorded (AC-09)
      Evidence: Owner-approved apply on michielvha/vh-adlc with digest 5a12f274...: six creates succeeded, complete; 90 issues and PRs before and after, none lost a label or changed during the window; recorded in `tests/vh-adlc/labels/evidence/rollout-vh-adlc.md` with plan, receipt and snapshots.
- [x] T19 `tests/vh-adlc/labels/evidence/rollout-stackweaver.md` - owner-approved `plan` and `apply` on `michielvha/stackweaver` with complete before and after issue snapshots, receipt and `gh label list` recorded (AC-09)
      Evidence: Owner-approved apply on michielvha/stackweaver from a clean clone with digest 2c509a0e...: five updates succeeded, complete; 1082 issues and PRs over 11 pages before and after, none lost a label or changed during the window; recorded in `tests/vh-adlc/labels/evidence/rollout-stackweaver.md` with plan, receipt and snapshots.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-13 | R-1 | spec | `5381e51` | unknown | procedural | Changes needed: 3 blocking, 5 should-fix; model identity not attested (Codex session header showed gpt-6.1-sol) |
| 2026-11-13 | R-2 | spec | `be943c8` | unknown | procedural | Changes needed: 1 blocking, 2 should-fix; model identity not attested (Codex session header showed gpt-6.1-sol) |
| 2026-11-13 | R-3 | spec | `cfc2f2d` | unknown | procedural | No findings; model identity not attested (Codex session header showed gpt-6.1-sol) |
| 2026-11-13 | R-3 | spec | `cfc2f2d` | n/a | n/a | accepted by owner |
| 2026-11-14 | R-4 | spec | `da736bc` | unknown | procedural | Drift review after #87 and #88: 3 should-fix, no blocking finding; model identity not attested (Codex session header showed gpt-6.1-sol) |
| 2026-11-14 | R-5 | spec | `d0bb0f7` | unknown | procedural | No findings; model identity not attested (Codex session header showed gpt-6.1-sol) |
| 2026-11-14 | R-6 | spec | `cc3096a` | unknown | procedural | Revision review: 1 blocking, 1 should-fix; model identity not attested (Codex session header showed gpt-6.1-sol) |
| 2026-11-14 | R-7 | spec | `d53f54a` | unknown | procedural | No findings; model identity not attested (Codex session header showed gpt-6.1-sol) |
| 2026-11-14 | R-7 | spec | `d53f54a` | n/a | n/a | accepted by owner |
| 2026-11-14 | R-8 | spec | `bf67dc5` | unknown | procedural | Drift review after #89: no findings; model identity not attested (Codex session header showed gpt-6.1-sol) |

### R-1


FINDING: F-01
KIND: judgement
SEVERITY: blocking
WHERE: Design / The labels helper; AC-03 and its Test Plan row
EVIDENCE: docs/specs/shared-issue-labels.md:189-202 names the repository and actor in the plan, but apply explicitly rechecks only the digest and repository labels. It does not require matching the current repository and actor to the plan or binding the vocabulary and label_map to the approved write payloads. A changed mapping or plugin vocabulary can therefore change the intended writes while the plan bytes and remote labels remain unchanged. The cited projects helper explicitly validates target scope in plugins/vh-adlc/scripts/projects/apply.ts:17-27.
PROPOSAL: Bind approval to the host, repository, actor, effective label names and exact before/after payloads, and require apply to validate those bindings before writing. Add refusal scenarios for another target or actor and changed vocabulary or mappings.

FINDING: F-02
KIND: judgement
SEVERITY: blocking
WHERE: Design / The labels helper; AC-03 and AC-07
EVIDENCE: plugins/vh-adlc/scripts/triage/settings.ts:92-94 accepts arbitrary label_map names and nonempty values. Under docs/specs/shared-issue-labels.md:197-199, ready: blocked makes ready and the unmapped blocked label share one GitHub label, although the vocabulary requires different colors and descriptions. Mapping bug to dependencies also conflicts with the explicit exclusion of bot-owned labels at lines 132-134. AC-07 requires currently accepted settings to keep passing, but no collision or ownership policy resolves these cases.
PROPOSAL: Define effective-name uniqueness and protected-label handling, including case-insensitive collisions with unmapped defaults. Preserve settings readability where required while refusing unsafe label operations, and test these cases before any write.

FINDING: F-03
KIND: factual
SEVERITY: blocking
WHERE: covers; Test Plan
EVIDENCE: The committed covers lists only tests/vh-adlc/labels/ among test paths. The Test Plan at docs/specs/shared-issue-labels.md:272-274 explicitly requires changes under tests/vh-adlc/lifecycle/, tests/vh-adlc/triage/execution.test.ts, tests/vh-adlc/triage/settings.test.ts and tests/vh-adlc/settings-file.test.ts. These paths are outside covers. The pinned conventions/feature-documents.md requires covers to list every path whose change can affect the feature; freshness and feature-tree checks use that declaration.
PROPOSAL: Add the planned test paths to covers so changes to the feature's proof invalidate its reviews and participate in the feature-tree check.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary
EVIDENCE: docs/specs/shared-issue-labels.md:48-49 says investigate and spec give every issue a type label and a state label. Design at lines 179-180 and 210-211, and AC-05 at lines 251-252, explicitly require spec-created issues to have no state label. The owner summary therefore describes a different filing default from the normative sections.
PROPOSAL: Correct the summary to distinguish investigate's state label from spec's type-only labeling.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design / The standard label set; Scope; Acceptance Criteria
EVIDENCE: docs/specs/shared-issue-labels.md:178 requires one type label on every issue a vh-adlc operation files, but the filing changes and scenarios cover investigate and spec only. Triage also creates issues: plugins/vh-adlc/scripts/triage/github.ts:140-141 sends an empty labels array for create-request, whose schema has no labels field in scripts/triage/execute.ts:15. Every stated criterion can pass while that operation continues creating unlabeled issues.
PROPOSAL: Either limit the universal rule to investigate and spec or specify and test compatible labeling for triage-created issues, preserving the neutral-request authority boundary.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Operations; AC-04 and its Test Plan row
EVIDENCE: docs/specs/shared-issue-labels.md:206-209 says investigate applies the state label its verdict names, then gives track three possible labels without selection rules. The cited Stackweaver agents/investigate.md:35-40 uses the verdicts act now, track and reject, and lines 71-73 permit a requested issue for a reject verdict. The prerequisite shared-development-loop design at 645882b retains those three verdicts. The proposed contract leaves their mapping incomplete.
PROPOSAL: Define the label outcome for each verdict and the conditions distinguishing blocked from needs-decision, including requested tracking of rejected work. Give those outcomes explicit scenario pass conditions.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Design / The standard label set
EVIDENCE: docs/specs/shared-issue-labels.md:172-173 says the colors and first four descriptions match current labels in both repositories. Observed gh label list --json name,color,description reads show Stackweaver's refactor description is empty and security has color ededed, whereas the proposed table gives refactor a description and security color d93f0b. The vh-adlc repository currently has neither refactor nor security.
PROPOSAL: Describe those entries as additions or intentional metadata changes, and correct the claim about which existing values match.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan / AC-09
EVIDENCE: docs/specs/shared-issue-labels.md:276 proposes before/after gh issue list --json number,labels snapshots to prove that no issue lost a label. Observed gh issue list --help states that the defaults select only open issues and limit the result to 30. The observed Stackweaver inventory contains 139 open issues, and the criterion also covers closed issues. The written procedure therefore checks only a subset.
PROPOSAL: Specify complete, paginated snapshots of open and closed issues in each named repository, and compare label sets by issue number while reporting incomplete collection or concurrent changes.

### R-2


FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Scope; Design / The labels helper; Owner summary
EVIDENCE: At be943c8, docs/specs/shared-issue-labels.md:152-153 excludes bot-owned labels and says they stay as their tools create them. Lines 226-234 allow any non-colliding mapped target and require correcting its metadata. For example, bug: dependencies passes the stated uniqueness rule but makes apply overwrite Dependabot's dependencies metadata with the bug color and description. This also contradicts the preservation promise at lines 51-52. The observed Stackweaver label inventory confirms dependencies exists with different metadata.
PROPOSAL: Resolve whether mappings may claim bot-owned labels. Either refuse those targets before writing and test that refusal, or make the owner-approved exception explicit in Scope, the summary and the criteria.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria / AC-05 and AC-07; Test Plan
EVIDENCE: docs/specs/shared-issue-labels.md:226-228 says operations apply mapped names, which includes spec. AC-07 at lines 301-305 and its proof at line 322 cover plan, triage and investigate only. The spec scenario at line 320 requires no mapping. These checks can pass while spec continues filing with bug when bug maps to defect, leaving the filing operations inconsistent.
PROPOSAL: Include spec in the mapping criterion and add a spec filing scenario where only the mapped type label exists. Check both the preview and the created issue's labels.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design; Acceptance Criteria; Test Plan / plugin delivery
EVIDENCE: Pinned conventions/delivery.md:85-89 requires naming affected artifacts and their build and publication paths, with verification through those paths. The document specifies a packaged helper but names no plugin delivery path or installed-helper check. Its Test Plan at docs/specs/shared-issue-labels.md:317-325 covers source fixtures and live label changes. The actual package is distributed through .claude-plugin/marketplace.json:17-20 and .agents/plugins/marketplace.json:17-22, with version metadata in plugins/vh-adlc/plugin.json and plugins/vh-adlc/.claude-plugin/plugin.json. Every proposed criterion can pass without establishing that an installed plugin contains the helper and vocabulary.
PROPOSAL: Name the affected plugin payload and marketplace delivery paths, and add candidate installation verification that runs the installed helper against a fixture. Describe the later publication check while preserving its separate authorization requirement.

### R-3

NO FINDINGS

### R-4


FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary and Background
EVIDENCE: At da736bc, docs/specs/shared-issue-labels.md:124 says shared-development-loop has no issue-label rule, and lines 130-136 say the labeling parity split is not yet in the tree. However, docs/specs/shared-development-loop.md:757-758 records the completed split. Stackweaver at 4e4fcd4d has an investigate-labels-issue row in tests/agent-loop/parity.json and preserves its labeling rule in agents/loop-project.md:62 until this feature takes over. The summary at lines 46-48 still describes migration as a future loss of that rule.
PROPOSAL: Refresh Context to describe the completed migration and the preserved local labeling rule. Describe this feature as replacing that temporary local rule with the shared contract.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary
EVIDENCE: docs/specs/shared-issue-labels.md:85-87 says a new review must clear R-2 before the owner can accept. Its Review Log at lines 394-395 already records a clean R-3 and owner acceptance. The frontmatter instead identifies the current blocker as a drift re-review, and the observed vh-adlc fresh result reports R-3 stale because of covered-drift.
PROPOSAL: Update the summary to distinguish the completed R-3 acceptance from the pending drift review. State that acceptance remains recorded while implementation waits for a current review.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Tasks / T16
EVIDENCE: docs/specs/shared-issue-labels.md:379 requires a minor version bump from the merged #78 version. git show 2c9d3af:plugins/vh-adlc/plugin.json gives 0.17.0, while both plugin manifests at da736bc already contain 0.18.0 following the lock update. Following T16 literally would select the existing version instead of giving this feature a new minor version.
PROPOSAL: Base T16 on the current merged plugin version. At this review target, both manifests should advance from 0.18.0 to 0.19.0, with candidate installation checking that version.

### R-5

NO FINDINGS

### R-6


FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: covers; Test Plan / AC-07
EVIDENCE: At cc3096a, tests/vh-adlc/triage/stackweaver-triage.yaml is outside covers. Both tests/vh-adlc/triage/settings.test.ts:197-206 and tests/vh-adlc/settings-file.test.ts:91-95 read it to establish Stackweaver compatibility. Comparing changed paths against covers identifies this fixture as the sole uncovered implementation path. The pinned feature-document standard requires covers to include every path whose change can affect the feature.
PROPOSAL: Add tests/vh-adlc/triage/stackweaver-triage.yaml to covers so changes to this compatibility evidence invalidate reviews and participate in the feature-tree check.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design / Operations; Test Plan / AC-04 and AC-05; Tasks / T12, T20 and T21
EVIDENCE: docs/specs/shared-issue-labels.md:284-290 requires cli.ts file to preview without writing and create only after approval of an unchanged preview. However, the T11 scenarios call filingPreview and fileIssue directly (tests/vh-adlc/lifecycle/issue-labels.test.ts:12-20), and their refusal cases cover initially missing labels and invalid inputs, without changing the digest, account, repository or labels between preview and creation. T20 checks skill phrases. These checks can pass while the CLI rejects file or filing ignores changes after approval.
PROPOSAL: Add a failing test task before T12 that executes the actual file CLI against the fake tracker, covering preview-only behavior and approved creation. Include changed-preview, wrong-digest and changed-observation cases that must refuse with no issue created and an empty write log.

### R-7

NO FINDINGS

### R-8

NO FINDINGS
